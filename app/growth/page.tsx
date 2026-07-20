import RoleGate from "@/components/RoleGate";
import GrowthConsole from "@/components/GrowthConsole";
import { getSession } from "@/lib/auth";
import { getGrowthPayload } from "@/lib/growthData";
import { canOpenRole } from "@/lib/roles";

export default async function GrowthPage() {
  const session = getSession();
  if (!canOpenRole(session, "growth")) {
    return <RoleGate session={session} role="growth" title="Growth" />;
  }

  const initial = await getGrowthPayload();
  return <GrowthConsole session={session!} initial={initial} />;
}
