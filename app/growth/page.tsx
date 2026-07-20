import RoleGate from "@/components/RoleGate";
import WorkspaceDashboard from "@/components/WorkspaceDashboard";
import { getSession } from "@/lib/auth";
import { getDailyTasks, getRecentAppointments, getTableCounts } from "@/lib/dashboardData";
import { canOpenRole } from "@/lib/roles";

export default async function GrowthPage() {
  const session = getSession();
  if (!canOpenRole(session, "growth")) {
    return <RoleGate session={session} role="growth" title="Growth" />;
  }

  const [counts, appointments, tasks] = await Promise.all([
    getTableCounts(),
    getRecentAppointments(6),
    getDailyTasks(6)
  ]);

  return (
    <WorkspaceDashboard
      title="Growth Dashboard"
      session={session!}
      counts={counts.filter((item) => ["clients", "appointments", "contacts", "leads_ledger"].includes(item.table))}
      rows={[...appointments, ...tasks].slice(0, 10)}
      rowTitle="Recent Activity"
    />
  );
}
