import { TranscriptViewer } from "@/components/transcript-viewer";
import { getClientStats, listClientNavItems, listTranscriptEvents } from "@/lib/queries/conversations";
import type { ClientNavItem, ClientStats, TranscriptEvent } from "@/types/conversation";

type Params = {
  params: Promise<{ userPhone: string; sessionId: string }>;
};

export default async function TranscriptPage({ params }: Params) {
  const { userPhone, sessionId } = await params;
  const decodedUserPhone = decodeURIComponent(userPhone);
  const decodedSessionId = decodeURIComponent(sessionId);

  let initialEvents: TranscriptEvent[] = [];
  let clientNavItems: ClientNavItem[] = [];
  let clientStats: ClientStats | null = null;
  try {
    initialEvents = await listTranscriptEvents(decodedUserPhone, decodedSessionId);
  } catch {
    initialEvents = [];
  }

  try {
    clientNavItems = await listClientNavItems();
  } catch {
    clientNavItems = [];
  }

  try {
    clientStats = await getClientStats(decodedUserPhone);
  } catch {
    clientStats = null;
  }

  return (
    <TranscriptViewer
      key={`${decodedUserPhone}::${decodedSessionId}`}
      userPhone={decodedUserPhone}
      sessionId={decodedSessionId}
      initialEvents={initialEvents}
      clientNavItems={clientNavItems}
      clientStats={clientStats}
    />
  );
}
