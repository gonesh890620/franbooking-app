import RoleGate from "@/components/RoleGate";
import GrowthConsole from "@/components/GrowthConsole";
import { getSession } from "@/lib/auth";
import { getGrowthPayload } from "@/lib/growthData";
import { getGrowthDashboard } from "@/lib/growthDashboard";
import { canOpenRole } from "@/lib/roles";

export default async function GrowthPage() {
  const session = getSession();
  if (!canOpenRole(session, "growth")) {
    return <RoleGate session={session} role="growth" title="Growth" />;
  }

  try {
    const [initial, dashboard] = await Promise.all([getGrowthPayload(), getGrowthDashboard()]);
    return <GrowthConsole session={session!} initial={{ ...initial, dashboard }} />;
  } catch (e) {
    return <GrowthConsole session={session!} initial={{}} loadError={e instanceof Error ? e.message : "Growth data failed to load"} />;
  }
}
