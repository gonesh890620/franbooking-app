"use client";

import { useState } from "react";

type AdminConsoleProps = {
  session: { name: string; email: string };
  counts: Array<{ table: string; label: string; count: number }>;
  users: Array<Record<string, any>>;
  loadError?: string;
};

type Credential = { email: string; password: string };

type StaffReport = {
  roles: Record<string, { approvedBefore: number; currentActive: number }>;
  roleOrder: string[];
};

type ActivityEntry = { id: string | number; actor_email: string; action: string; details: unknown; created_at: string };

export default function AdminConsole({ session, counts, users, loadError }: AdminConsoleProps) {
  const [view, setView] = useState<"users" | "add" | "staff" | "activity">("users");
  const [rows, setRows] = useState(users);
  const [message, setMessage] = useState("");
  const [credential, setCredential] = useState<Credential | null>(null);
  const [newUser, setNewUser] = useState({ email: "", name: "", type: "PH", password: "", sheetId: "", nLimit: "0", oLimit: "0", pLimit: "0", referredBy: "" });
  const [staffReport, setStaffReport] = useState<StaffReport | null>(null);
  const [activity, setActivity] = useState<{ activities: ActivityEntry[]; totalCost: number } | null>(null);
  const [loading, setLoading] = useState(false);

  const activeUsers = rows.filter((user) => String(user.status || "").toLowerCase() === "approved").length;
  const pendingUsers = rows.filter((user) => String(user.status || "").toLowerCase() === "pending");
  const recruiters = rows.filter((user) => String(user.role || "").toLowerCase() === "recruiter").length;

  async function adminAction(body: Record<string, unknown>) {
    setMessage("");
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || "Admin action failed");
    return data;
  }

  async function createUser() {
    try {
      const data = await adminAction({ action: "create", ...newUser });
      setRows((prev) => [...prev.filter((row) => row.email !== newUser.email), {
        email: newUser.email.toLowerCase(), name: newUser.name, role: newUser.type, legacy_type: newUser.type,
        status: "approved", referred_by: newUser.referredBy || null,
        credits: { nurture_balance: newUser.nLimit, outreach_balance: newUser.oLimit, profile_balance: newUser.pLimit }
      }]);
      if (data.generatedPassword) setCredential({ email: newUser.email.toLowerCase(), password: data.generatedPassword });
      setMessage(`Saved ${newUser.email}.`);
      setNewUser({ email: "", name: "", type: "PH", password: "", sheetId: "", nLimit: "0", oLimit: "0", pLimit: "0", referredBy: "" });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Create/update failed");
    }
  }

  async function approveUser(email: string) {
    const type = window.prompt("Role/Type for this user (e.g. PH, Inhouse, Operations, Growth, Client, Agent)", "PH");
    if (type === null) return;
    const nLimit = window.prompt("Weekly Nurture limit", "200") || "200";
    const oLimit = window.prompt("Weekly Outreach limit", "10") || "10";
    const pLimit = window.prompt("Weekly Profile Selection limit", "500") || "500";
    try {
      await adminAction({ action: "approve", email, type, nLimit, oLimit, pLimit });
      setRows((prev) => prev.map((row) => row.email === email ? { ...row, status: "approved", legacy_type: type } : row));
      setMessage(`Approved ${email}.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Approve failed");
    }
  }

  async function removeUser(email: string) {
    const reason = window.prompt(`Reason for removing access for ${email} (required):`);
    if (!reason || !reason.trim()) return;
    try {
      await adminAction({ action: "remove", email, reason: reason.trim() });
      setRows((prev) => prev.map((row) => row.email === email ? { ...row, status: "removed", remove_reason: reason.trim() } : row));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Remove failed");
    }
  }

  async function restoreUser(email: string) {
    try {
      await adminAction({ action: "restore", email });
      setRows((prev) => prev.map((row) => row.email === email ? { ...row, status: "approved" } : row));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Restore failed");
    }
  }

  async function resetPassword(email: string) {
    try {
      const data = await adminAction({ action: "resetPassword", email });
      if (data.newPassword) setCredential({ email, password: data.newPassword });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Password reset failed");
    }
  }

  async function topup(email: string) {
    const n = window.prompt("Nurture credit to add (blank = no change)", "");
    const o = window.prompt("Outreach credit to add (blank = no change)", "");
    const p = window.prompt("Profile Selection credit to add (blank = no change)", "");
    try {
      await adminAction({ action: "topup", email, n, o, p });
      setMessage(`Credits updated for ${email}.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Top up failed");
    }
  }

  async function openStaffReport() {
    setView("staff");
    if (staffReport || loading) return;
    setLoading(true);
    try {
      const data = await adminAction({ action: "staffReport" });
      setStaffReport({ roles: data.roles, roleOrder: data.roleOrder });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Staff report failed to load");
    } finally {
      setLoading(false);
    }
  }

  async function openActivityLog() {
    setView("activity");
    if (activity || loading) return;
    setLoading(true);
    try {
      const data = await adminAction({ action: "activityLog" });
      setActivity({ activities: data.activities, totalCost: data.totalCost });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Activity log failed to load");
    } finally {
      setLoading(false);
    }
  }

  async function copyCredential() {
    if (!credential) return;
    try {
      await navigator.clipboard.writeText(`Email: ${credential.email}\nPassword: ${credential.password}`);
      setMessage("Credentials copied to clipboard.");
    } catch {
      setMessage("Could not copy — select and copy manually.");
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/admin";
  }

  return (
    <main className="app-shell wide">
      <div className="topbar">
        <div className="topbar-title">
          <div className="brand">Franbooking</div>
          <h1>Admin Console</h1>
          <div className="muted">{session.name} | {session.email}</div>
        </div>
        <button className="btn btn-outline" onClick={logout}>Logout</button>
      </div>

      <section className="metric-grid">
        <div className="metric"><span>Total Users</span><strong>{rows.length}</strong></div>
        <div className="metric"><span>Approved Users</span><strong>{activeUsers}</strong></div>
        <div className="metric"><span>Pending Approval</span><strong>{pendingUsers.length}</strong></div>
        <div className="metric"><span>Recruiters</span><strong>{recruiters}</strong></div>
      </section>

      {loadError && <div className="notice error">{loadError}</div>}
      {message && <div className={message.toLowerCase().includes("failed") || message.toLowerCase().includes("missing") || message.toLowerCase().includes("invalid") ? "notice error" : "notice success"}>{message}</div>}

      {credential && (
        <div className="notice success">
          <div><strong>Credentials for {credential.email}</strong></div>
          <div>Password: <code>{credential.password}</code></div>
          <div className="actions" style={{ marginTop: 8 }}>
            <button className="btn btn-outline" onClick={copyCredential}>Copy</button>
            <button className="btn btn-outline" onClick={() => setCredential(null)}>Dismiss</button>
          </div>
        </div>
      )}

      <div className="tabs" style={{ marginTop: 14 }}>
        <button className={`tab ${view === "users" ? "active" : ""}`} onClick={() => setView("users")}>Users</button>
        <button className={`tab ${view === "add" ? "active" : ""}`} onClick={() => setView("add")}>Add User</button>
        <button className={`tab ${view === "staff" ? "active" : ""}`} onClick={openStaffReport}>Staff Report</button>
        <button className={`tab ${view === "activity" ? "active" : ""}`} onClick={openActivityLog}>Activity Log</button>
      </div>

      {view === "users" && (
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
                  <th>Expires</th>
                  <th>Referred By</th>
                  <th>Credits</th>
                  <th>Sheet</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((user) => {
                  const status = String(user.status || "").toLowerCase();
                  return (
                    <tr key={String(user.id || user.email)}>
                      <td>{user.name || "-"}</td>
                      <td>{user.email}</td>
                      <td>{user.legacy_type || user.role}</td>
                      <td>
                        {user.status}
                        {status === "removed" && user.remove_reason && <div className="muted">{user.remove_reason}</div>}
                      </td>
                      <td>{user.expires_at || "-"}</td>
                      <td>{user.referred_by || "-"}</td>
                      <td>
                        N {user.credits?.nurture_balance ?? 0} / O {user.credits?.outreach_balance ?? 0} / P {user.credits?.profile_balance ?? 0}
                      </td>
                      <td>{user.legacy_sheet_id ? "Linked" : "-"}</td>
                      <td>
                        <div className="actions">
                          {status === "pending" && <button className="btn btn-primary" onClick={() => approveUser(user.email)}>Approve</button>}
                          <button className="btn btn-outline" onClick={() => topup(user.email)}>Top Up</button>
                          <button className="btn btn-outline" onClick={() => resetPassword(user.email)}>Reset PW</button>
                          {status === "removed" || status === "expired"
                            ? <button className="btn btn-primary" onClick={() => restoreUser(user.email)}>Restore</button>
                            : <button className="btn btn-danger" onClick={() => removeUser(user.email)}>Remove</button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {view === "add" && (
        <section className="panel">
          <div className="section-head">
            <h2>Add User</h2>
            <span className="badge">Supabase</span>
          </div>
          <div className="form-grid admin-create-grid">
            <label>Email<input value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} /></label>
            <label>Name<input value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} /></label>
            <label>Type<select value={newUser.type} onChange={(e) => setNewUser({ ...newUser, type: e.target.value })}><option>PH</option><option>Inhouse</option><option>BD</option><option>growth</option><option>operations</option><option>agent</option><option>client</option><option>admin</option></select></label>
            <label>Password (blank = auto-generate)<input value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} /></label>
            <label>Sheet ID<input value={newUser.sheetId} onChange={(e) => setNewUser({ ...newUser, sheetId: e.target.value })} /></label>
            <label>Referred By (email)<input value={newUser.referredBy} onChange={(e) => setNewUser({ ...newUser, referredBy: e.target.value })} /></label>
            <label>N Limit<input value={newUser.nLimit} onChange={(e) => setNewUser({ ...newUser, nLimit: e.target.value })} /></label>
            <label>O Limit<input value={newUser.oLimit} onChange={(e) => setNewUser({ ...newUser, oLimit: e.target.value })} /></label>
            <label>P Limit<input value={newUser.pLimit} onChange={(e) => setNewUser({ ...newUser, pLimit: e.target.value })} /></label>
            <button className="btn btn-primary" onClick={createUser}>Create / Update User</button>
          </div>
        </section>
      )}

      {view === "staff" && (
        <section className="panel">
          <div className="section-head">
            <h2>Staff Report</h2>
            <span className="badge">Ever approved vs. currently active</span>
          </div>
          {loading && !staffReport && <div className="muted">Loading...</div>}
          {staffReport && (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Role</th><th>Ever Approved</th><th>Currently Active</th></tr></thead>
                <tbody>
                  {staffReport.roleOrder.map((role) => (
                    <tr key={role}>
                      <td>{role}</td>
                      <td>{staffReport.roles[role]?.approvedBefore ?? 0}</td>
                      <td>{staffReport.roles[role]?.currentActive ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {view === "activity" && (
        <section className="panel">
          <div className="section-head">
            <h2>Activity Log</h2>
            <span className="badge">{activity ? `Total AI cost: $${activity.totalCost.toFixed(2)}` : "Loading"}</span>
          </div>
          {loading && !activity && <div className="muted">Loading...</div>}
          {activity && (
            <div className="table-wrap">
              <table>
                <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Details</th></tr></thead>
                <tbody>
                  {activity.activities.map((entry) => (
                    <tr key={String(entry.id)}>
                      <td>{new Date(entry.created_at).toLocaleString()}</td>
                      <td>{entry.actor_email}</td>
                      <td>{entry.action}</td>
                      <td>{typeof entry.details === "string" ? entry.details : JSON.stringify(entry.details)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

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
