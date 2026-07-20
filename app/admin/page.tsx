import AdminConsole from "@/components/AdminConsole";
import AdminLogin from "@/components/AdminLogin";
import { getSession } from "@/lib/auth";
import { getAdminUsers, getTableCounts } from "@/lib/dashboardData";
import { isSuperAdmin } from "@/lib/roles";

export default async function AdminPage() {
  const session = getSession();
  if (!isSuperAdmin(session)) {
    return <AdminLogin />;
  }

  try {
    const [counts, users] = await Promise.all([getTableCounts(), getAdminUsers()]);
    return <AdminConsole session={session!} counts={counts} users={users} />;
  } catch (e) {
    return <AdminConsole session={session!} counts={[]} users={[]} loadError={e instanceof Error ? e.message : "Admin data failed to load"} />;
  }
}
