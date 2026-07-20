import RoleGate from "@/components/RoleGate";
import WorkspaceDashboard from "@/components/WorkspaceDashboard";
import { getSession } from "@/lib/auth";
import { getRecentAppointments, getTableCounts } from "@/lib/dashboardData";
import { canOpenRole } from "@/lib/roles";

export default async function ClientPage() {
  const session = getSession();
  if (!canOpenRole(session, "client")) {
    return <RoleGate session={session} role="client" title="Client" />;
  }

  const [counts, appointments] = await Promise.all([getTableCounts(), getRecentAppointments(12)]);

  return (
    <WorkspaceDashboard
      title="Client Portal"
      session={session!}
      counts={counts.filter((item) => ["appointments", "leads_ledger", "clients", "campaigns"].includes(item.table))}
      rows={appointments}
      rowTitle="Recent Appointments"
    />
  );
}
