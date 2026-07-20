type AdminConsoleProps = {
  session: { name: string; email: string };
  counts: Array<{ table: string; label: string; count: number }>;
  users: Array<Record<string, any>>;
};

export default function AdminConsole({ session, counts, users }: AdminConsoleProps) {
  const activeUsers = users.filter((user) => String(user.status || "").toLowerCase() === "approved").length;
  const recruiters = users.filter((user) => String(user.role || "").toLowerCase() === "recruiter").length;

  return (
    <main className="app-shell wide">
      <div className="topbar">
        <div className="topbar-title">
          <div className="brand">Franbooking</div>
          <h1>Admin Console</h1>
          <div className="muted">{session.name} | {session.email}</div>
        </div>
      </div>

      <section className="metric-grid">
        <div className="metric"><span>Total Users</span><strong>{users.length}</strong></div>
        <div className="metric"><span>Approved Users</span><strong>{activeUsers}</strong></div>
        <div className="metric"><span>Recruiters</span><strong>{recruiters}</strong></div>
        <div className="metric"><span>FU Contacts</span><strong>{counts.find((c) => c.table === "contacts")?.count || 0}</strong></div>
      </section>

      <section className="panel">
        <div className="section-head">
          <h2>Access Control</h2>
          <span className="badge">{users.length} users</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Credits</th>
                <th>Sheet</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={String(user.id)}>
                  <td>{user.name || "-"}</td>
                  <td>{user.email}</td>
                  <td>{user.legacy_type || user.role}</td>
                  <td>{user.status}</td>
                  <td>
                    N {user.credits?.nurture_balance ?? 0} / O {user.credits?.outreach_balance ?? 0} / P {user.credits?.profile_balance ?? 0}
                  </td>
                  <td>{user.legacy_sheet_id ? "Linked" : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="section-head">
          <h2>Database</h2>
          <span className="badge">Supabase</span>
        </div>
        <div className="count-grid">
          {counts.map((item) => (
            <div className="count-item" key={item.table}>
              <span>{item.label}</span>
              <strong>{item.count}</strong>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
