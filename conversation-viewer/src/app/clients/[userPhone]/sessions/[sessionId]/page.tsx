import { TranscriptViewer } from "@/components/transcript-viewer";

type Params = {
  params: Promise<{ userPhone: string; sessionId: string }>;
};

export default async function TranscriptPage({ params }: Params) {
  const { userPhone, sessionId } = await params;
  return (
    <TranscriptViewer
      userPhone={decodeURIComponent(userPhone)}
      sessionId={decodeURIComponent(sessionId)}
    />
  );
}