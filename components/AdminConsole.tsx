"use client";

import { useState } from "react";

type AdminConsoleProps = {
  session: { name: string; email: string };
  counts: Array<{ table: string; label: string; count: number }>;
  users: Array<Record<string, any>>;
};

export default function AdminConsole({ session, counts, users }: AdminConsoleProps) {
  const [rows, setRows] = useState(users);
  const [message, setMessage] = useState("");
  const [newUser, setNewUser] = useState({ email: "", name: "", type: "PH", password: "", sheetId: "", nLimit: "0", oLimit: "0", pLimit: "0" });
  const activeUsers = users.filter((user) => String(user.status || "").toLowerCase() === "approved").length;
  const recruiters = users.filter((user) => String(user.role || "").toLowerCase() === "recruiter").length;

  async function adminAction(body: Record<string, unknown>) {
    setMessage("");
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || "Admin action failed");
    setMessage("Saved. Refresh to confirm latest Supabase values.");
  }

  async function createUser() {
    await adminAction({ action: "create", ...newUser });
    setRows((prev) => [...prev, { ...newUser, role: newUser.type, legacy_type: newUser.type, status: "approved", credits: { nurture_balance: newUser.nLimit, outreach_balance: newUser.oLimit, profile_balance: newUser.pLimit } }]);
    setNewUser({ email: "", name: "", type: "PH", password: "", sheetId: "", nLimit: "0", oLimit: "0", pLimit: "0" });
  }

  async function setStatus(email: string, status: string) {
    await adminAction({ action: "status", email, status });
    setRows((prev) => prev.map((row) => row.email === email ? { ...row, status } : row));
  }

  async function resetPassword(email: string) {
    const password = window.prompt(`New password for ${email}`);
    if (!password) return;
    await adminAction({ action: "resetPassword", email, password });
  }

  async function topup(email: string) {
    const n = window.prompt("Nurture credits to add", "0") || "0";
    const o = window.prompt("Outreach credits to add", "0") || "0";
    const p = window.prompt("Profile credits to add", "0") || "0";
    await adminAction({ action: "topup", email, n, o, p });
  }

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
        <div className="metric"><span>Total Users</span><strong>{rows.length}</strong></div>
        <div className="metric"><span>Approved Users</span><strong>{activeUsers}</strong></div>
        <div className="metric"><span>Recruiters</span><strong>{recruiters}</strong></div>
        <div className="metric"><span>FU Contacts</span><strong>{counts.find((c) => c.table === "contacts")?.count || 0}</strong></div>
      </section>

      {message && <div className="notice success">{message}</div>}

      <section className="panel">
        <div className="section-head">
          <h2>Add User</h2>
          <span className="badge">Supabase</span>
        </div>
        <div className="form-grid admin-create-grid">
          <label>Email<input value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} /></label>
          <label>Name<input value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} /></label>
          <label>Type<select value={newUser.type} onChange={(e) => setNewUser({ ...newUser, type: e.target.value })}><option>PH</option><option>Inhouse</option><option>BD</option><option>growth</option><option>operations</option><option>agent</option><option>client</option><option>admin</option></select></label>
          <label>Password<input value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} /></label>
          <label>Sheet ID<input value={newUser.sheetId} onChange={(e) => setNewUser({ ...newUser, sheetId: e.target.value })} /></label>
          <label>N Limit<input value={newUser.nLimit} onChange={(e) => setNewUser({ ...newUser, nLimit: e.target.value })} /></label>
          <label>O Limit<input value={newUser.oLimit} onChange={(e) => setNewUser({ ...newUser, oLimit: e.target.value })} /></label>
          <label>P Limit<input value={newUser.pLimit} onChange={(e) => setNewUser({ ...newUser, pLimit: e.target.value })} /></label>
          <button className="btn btn-primary" onClick={createUser}>Create / Update User</button>
        </div>
      </section>

      <section className="panel">
        <div className="section-head">
          <h2>Access Control</h2>
          <span className="badge">{rows.length} users</span>
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
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((user) => (
                <tr key={String(user.id)}>
                  <td>{user.name || "-"}</td>
                  <td>{user.email}</td>
                  <td>{user.legacy_type || user.role}</td>
                  <td>{user.status}</td>
                  <td>
                    N {user.credits?.nurture_balance ?? 0} / O {user.credits?.outreach_balance ?? 0} / P {user.credits?.profile_balance ?? 0}
                  </td>
                  <td>{user.legacy_sheet_id ? "Linked" : "-"}</td>
                  <td>
                    <div className="actions">
                      <button className="btn btn-outline" onClick={() => topup(user.email)}>Top Up</button>
                      <button className="btn btn-outline" onClick={() => resetPassword(user.email)}>Reset PW</button>
                      {String(user.status || "").toLowerCase() === "removed"
                        ? <button className="btn btn-primary" onClick={() => setStatus(user.email, "approved")}>Restore</button>
                        : <button className="btn btn-danger" onClick={() => setStatus(user.email, "removed")}>Remove</button>}
                    </div>
                  </td>
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
