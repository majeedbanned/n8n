import { SessionList } from "@/components/session-list";

type Params = {
  params: Promise<{ userPhone: string }>;
};

export default async function ClientSessionsPage({ params }: Params) {
  const { userPhone } = await params;
  return <SessionList userPhone={decodeURIComponent(userPhone)} />;
}