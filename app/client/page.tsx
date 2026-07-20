import RoleGate from "@/components/RoleGate";
import ClientPortal from "@/components/ClientPortal";
import { getSession } from "@/lib/auth";
import { getClientPortalPayload } from "@/lib/clientPortalData";
import { canOpenRole } from "@/lib/roles";

export default async function ClientPage() {
  const session = getSession();
  if (!canOpenRole(session, "client")) {
    return <RoleGate session={session} role="client" title="Client" />;
  }

  const initial = await getClientPortalPayload(session!);
  return <ClientPortal session={session!} initial={initial} />;
}
