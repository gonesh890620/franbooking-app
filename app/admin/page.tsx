import AdminConsole from "@/components/AdminConsole";
import RoleGate from "@/components/RoleGate";
import { getSession } from "@/lib/auth";
import { getAdminUsers, getTableCounts } from "@/lib/dashboardData";
import { isAdminUser } from "@/lib/roles";

export default async function AdminPage() {
  const session = getSession();
  if (!isAdminUser(session)) {
    return <RoleGate session={session} role="admin" title="Admin" />;
  }

  const [counts, users] = await Promise.all([getTableCounts(), getAdminUsers()]);
  return <AdminConsole session={session!} counts={counts} users={users} />;
}
