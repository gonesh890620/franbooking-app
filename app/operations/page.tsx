import RoleGate from "@/components/RoleGate";
import OperationsConsole from "@/components/OperationsConsole";
import { getSession } from "@/lib/auth";
import { getOperationsPayload } from "@/lib/operationsData";
import { canOpenRole } from "@/lib/roles";

export default async function OperationsPage() {
  const session = getSession();
  if (!canOpenRole(session, "operations")) {
    return <RoleGate session={session} role="operations" title="Operations" />;
  }

  const opsSession = { name: session!.name, email: session!.email, impersonatorEmail: session!.impersonatorEmail, impersonatorName: session!.impersonatorName };
  try {
    const initial = await getOperationsPayload();
    return <OperationsConsole session={opsSession} initial={initial} />;
  } catch (e) {
    return <OperationsConsole session={opsSession} initial={{}} loadError={e instanceof Error ? e.message : "Operations data failed to load"} />;
  }
}
