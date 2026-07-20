import RoleGate from "@/components/RoleGate";
import WorkspaceDashboard from "@/components/WorkspaceDashboard";
import { getSession } from "@/lib/auth";
import { getRecentApplicants, getRecentAppointments, getTableCounts } from "@/lib/dashboardData";
import { canOpenRole } from "@/lib/roles";

export default async function OperationsPage() {
  const session = getSession();
  if (!canOpenRole(session, "operations")) {
    return <RoleGate session={session} role="operations" title="Operations" />;
  }

  const [counts, appointments, applicants] = await Promise.all([
    getTableCounts(),
    getRecentAppointments(8),
    getRecentApplicants(6)
  ]);

  return (
    <WorkspaceDashboard
      title="Operations"
      session={session!}
      counts={counts.filter((item) => ["appointments", "sales_nav_inventory", "applicants", "clients"].includes(item.table))}
      rows={[...appointments, ...applicants].slice(0, 12)}
      rowTitle="Appointments and Applicants"
    />
  );
}
