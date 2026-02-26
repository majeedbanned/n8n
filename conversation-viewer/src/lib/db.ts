import { Pool } from "pg";

declare global {
  var __conversationViewerPool: Pool | undefined;
}

const connectionString = process.env.DATABASE_URL;

const pool =
  global.__conversationViewerPool ??
  new Pool(
    connectionString
      ? { connectionString }
      : {
          host: process.env.PGHOST,
          port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
          database: process.env.PGDATABASE,
          user: process.env.PGUSER,
          password: process.env.PGPASSWORD,
          ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: false } : undefined,
        },
  );

if (process.env.NODE_ENV !== "production") {
  global.__conversationViewerPool = pool;
}

export { pool };
