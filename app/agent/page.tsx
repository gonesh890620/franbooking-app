import RoleGate from "@/components/RoleGate";
import WorkspaceDashboard from "@/components/WorkspaceDashboard";
import { getSession } from "@/lib/auth";
import { getRecentApplicants, getTableCounts } from "@/lib/dashboardData";
import { canOpenRole } from "@/lib/roles";

export default async function AgentPage() {
  const session = getSession();
  if (!canOpenRole(session, "agent")) {
    return <RoleGate session={session} role="agent" title="Agent" />;
  }

  const [counts, applicants] = await Promise.all([getTableCounts(), getRecentApplicants(12)]);

  return (
    <WorkspaceDashboard
      title="Agent Panel"
      session={session!}
      counts={counts.filter((item) => ["applicants", "agent_logs", "daily_tasks", "time_logs"].includes(item.table))}
      rows={applicants}
      rowTitle="Applicant Pipeline"
    />
  );
}
