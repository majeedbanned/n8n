import { Client, type ClientConfig } from "pg";

export type AuditLogInsertEvent = {
  id: number;
  userPhone: string | null;
  sessionId: string | null;
  channel: string | null;
  createdAt: string;
};

type Subscriber = (event: AuditLogInsertEvent) => void;

type RealtimeState = {
  client: Client | null;
  subscribers: Set<Subscriber>;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  reconnectAttempt: number;
  connecting: boolean;
};

declare global {
  var __conversationViewerRealtimeState: RealtimeState | undefined;
}

const CHANNEL = "chat_audit_logs_insert";

function getClientConfig(): ClientConfig {
  const connectionString = process.env.DATABASE_URL;
  if (connectionString) {
    return { connectionString };
  }

  return {
    host: process.env.PGHOST,
    port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: false } : undefined,
  };
}

function getState(): RealtimeState {
  if (!global.__conversationViewerRealtimeState) {
    global.__conversationViewerRealtimeState = {
      client: null,
      subscribers: new Set<Subscriber>(),
      reconnectTimer: null,
      reconnectAttempt: 0,
      connecting: false,
    };
  }

  return global.__conversationViewerRealtimeState;
}

function parseEvent(payload: string): AuditLogInsertEvent | null {
  try {
    const raw = JSON.parse(payload) as Record<string, unknown>;
    const id = Number(raw.id);
    if (!Number.isFinite(id)) {
      return null;
    }

    const toMaybeString = (value: unknown): string | null => {
      if (value === null || value === undefined) {
        return null;
      }

      if (typeof value === "string") {
        return value;
      }

      if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
        return String(value);
      }

      return null;
    };

    const createdAtRaw = typeof raw.createdAt === "string" ? raw.createdAt : "";
    const createdAtParsed = new Date(createdAtRaw);
    const createdAt = Number.isNaN(createdAtParsed.getTime())
      ? new Date().toISOString()
      : createdAtParsed.toISOString();

    return {
      id,
      userPhone: toMaybeString(raw.userPhone),
      sessionId: toMaybeString(raw.sessionId),
      channel: toMaybeString(raw.channel),
      createdAt,
    };
  } catch {
    return null;
  }
}

function scheduleReconnect(state: RealtimeState) {
  if (state.reconnectTimer || state.subscribers.size === 0) {
    return;
  }

  const delay = Math.min(1000 * 2 ** state.reconnectAttempt, 30000);
  state.reconnectAttempt = Math.min(state.reconnectAttempt + 1, 8);

  state.reconnectTimer = setTimeout(() => {
    state.reconnectTimer = null;
    void connect(state);
  }, delay);
}

async function disconnect(state: RealtimeState) {
  if (state.reconnectTimer) {
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
  }

  if (!state.client) {
    return;
  }

  const client = state.client;
  state.client = null;
  client.removeAllListeners();

  try {
    await client.end();
  } catch {
    // ignore close errors
  }
}

async function connect(state: RealtimeState) {
  if (state.connecting || state.client || state.subscribers.size === 0) {
    return;
  }

  state.connecting = true;
  const client = new Client(getClientConfig());

  const onDisconnect = () => {
    if (state.client === client) {
      state.client = null;
    }
    scheduleReconnect(state);
  };

  client.on("error", onDisconnect);
  client.on("end", onDisconnect);
  client.on("notification", (message) => {
    if (message.channel !== CHANNEL || !message.payload) {
      return;
    }

    const event = parseEvent(message.payload);
    if (!event) {
      return;
    }

    for (const subscriber of state.subscribers) {
      try {
        subscriber(event);
      } catch {
        // isolate subscriber failures
      }
    }
  });

  try {
    await client.connect();
    await client.query(`LISTEN ${CHANNEL}`);
    state.client = client;
    state.reconnectAttempt = 0;
  } catch {
    client.removeAllListeners();
    try {
      await client.end();
    } catch {
      // ignore connect/close failures
    }
    scheduleReconnect(state);
  } finally {
    state.connecting = false;
  }
}

export function subscribeToAuditLogInserts(subscriber: Subscriber): () => void {
  const state = getState();
  state.subscribers.add(subscriber);
  void connect(state);

  return () => {
    state.subscribers.delete(subscriber);
    if (state.subscribers.size === 0) {
      void disconnect(state);
    }
  };
}
