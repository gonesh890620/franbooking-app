"use client";

import { useState } from "react";
import BodyClass from "./BodyClass";
import {
  AppHeader,
  Badge,
  Card,
  DataTable,
  EmptyRow,
  Field,
  Loading,
  Msg,
  StatGrid,
  statusTone,
  Tabs,
  toneForMessage
} from "./ui";

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
    <>
      <BodyClass names="full-page wide-page" />

      <AppHeader logo="⚙️ Admin" user={`${session.name} | ${session.email}`}>
        <button className="btn btn-ghost btn-sm" onClick={logout}>
          Logout
        </button>
      </AppHeader>

      <Tabs
        value={view}
        onChange={(next) => {
          if (next === "staff") void openStaffReport();
          else if (next === "activity") void openActivityLog();
          else setView(next);
        }}
        tabs={[
          { key: "users", label: "👥 Users" },
          { key: "add", label: "➕ Add User" },
          { key: "staff", label: "📊 Staff Report" },
          { key: "activity", label: "📋 Activity Log" }
        ]}
      />

      <div className="screen-content">
        <StatGrid
          stats={[
            { label: "Total Users", value: rows.length },
            { label: "Approved Users", value: activeUsers, tone: "green" },
            { label: "Pending Approval", value: pendingUsers.length, tone: "amber" },
            { label: "Recruiters", value: recruiters, tone: "blue" }
          ]}
        />

        {loadError ? <Msg kind="error">{loadError}</Msg> : null}
        {message ? <Msg kind={toneForMessage(message)}>{message}</Msg> : null}

        {credential ? (
          <Card>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Credentials for {credential.email}</div>
            <div className="reply-box">
              Email: {credential.email}
              {"\n"}Password: {credential.password}
            </div>
            <div className="btn-group mt-8">
              <button className="btn btn-copy btn-sm" onClick={copyCredential}>
                📋 Copy
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setCredential(null)}>
                Dismiss
              </button>
            </div>
          </Card>
        ) : null}

        {view === "users" ? (
          <Card title="Access Control" actions={<Badge>{rows.length} users</Badge>}>
            <DataTable
              head={[
                { label: "Name" },
                { label: "Email" },
                { label: "Role" },
                { label: "Status" },
                { label: "Expires" },
                { label: "Referred By" },
                { label: "Credits" },
                { label: "Sheet" },
                { label: "Actions" }
              ]}
            >
              {!rows.length ? (
                <EmptyRow colSpan={9}>No users yet.</EmptyRow>
              ) : (
                rows.map((user) => {
                  const status = String(user.status || "").toLowerCase();
                  return (
                    <tr key={String(user.id || user.email)}>
                      <td>{user.name || "-"}</td>
                      <td>{user.email}</td>
                      <td>{user.legacy_type || user.role}</td>
                      <td>
                        <Badge tone={statusTone(status)}>{user.status}</Badge>
                        {status === "removed" && user.remove_reason ? (
                          <div className="text-muted">{user.remove_reason}</div>
                        ) : null}
                      </td>
                      <td>{user.expires_at || "-"}</td>
                      <td>{user.referred_by || "-"}</td>
                      <td>
                        N {user.credits?.nurture_balance ?? 0} / O {user.credits?.outreach_balance ?? 0} / P{" "}
                        {user.credits?.profile_balance ?? 0}
                      </td>
                      <td>{user.legacy_sheet_id ? "Linked" : "-"}</td>
                      <td>
                        <div className="btn-group">
                          {status === "pending" ? (
                            <button className="btn btn-primary btn-sm" onClick={() => approveUser(user.email)}>
                              Approve
                            </button>
                          ) : null}
                          <button className="btn btn-outline btn-sm" onClick={() => topup(user.email)}>
                            Top Up
                          </button>
                          <button className="btn btn-outline btn-sm" onClick={() => resetPassword(user.email)}>
                            Reset PW
                          </button>
                          {status === "removed" || status === "expired" ? (
                            <button className="btn btn-primary btn-sm" onClick={() => restoreUser(user.email)}>
                              Restore
                            </button>
                          ) : (
                            <button className="btn btn-danger btn-sm" onClick={() => removeUser(user.email)}>
                              Remove
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </DataTable>
          </Card>
        ) : null}

        {view === "add" ? (
          <Card title="Add User" actions={<Badge tone="gray">Supabase</Badge>}>
            <div className="row-auto">
              <Field label="Email">
                <input value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} />
              </Field>
              <Field label="Name">
                <input value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} />
              </Field>
              <Field label="Type">
                <select value={newUser.type} onChange={(e) => setNewUser({ ...newUser, type: e.target.value })}>
                  <option>PH</option>
                  <option>Inhouse</option>
                  <option>BD</option>
                  <option>growth</option>
                  <option>operations</option>
                  <option>agent</option>
                  <option>client</option>
                  <option>admin</option>
                </select>
              </Field>
              <Field label="Password" hint="blank = auto-generate">
                <input value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
              </Field>
              <Field label="Sheet ID">
                <input value={newUser.sheetId} onChange={(e) => setNewUser({ ...newUser, sheetId: e.target.value })} />
              </Field>
              <Field label="Referred By" hint="email">
                <input
                  value={newUser.referredBy}
                  onChange={(e) => setNewUser({ ...newUser, referredBy: e.target.value })}
                />
              </Field>
              <Field label="N Limit">
                <input value={newUser.nLimit} onChange={(e) => setNewUser({ ...newUser, nLimit: e.target.value })} />
              </Field>
              <Field label="O Limit">
                <input value={newUser.oLimit} onChange={(e) => setNewUser({ ...newUser, oLimit: e.target.value })} />
              </Field>
              <Field label="P Limit">
                <input value={newUser.pLimit} onChange={(e) => setNewUser({ ...newUser, pLimit: e.target.value })} />
              </Field>
            </div>
            <button className="btn btn-primary mt-8" onClick={createUser}>
              Create / Update User
            </button>
          </Card>
        ) : null}

        {view === "staff" ? (
          <Card title="Staff Report" actions={<Badge tone="gray">Ever approved vs. currently active</Badge>}>
            {loading && !staffReport ? (
              <Loading />
            ) : staffReport ? (
              <DataTable
                head={[{ label: "Role" }, { label: "Ever Approved" }, { label: "Currently Active" }]}
              >
                {staffReport.roleOrder.map((role) => (
                  <tr key={role}>
                    <td>{role}</td>
                    <td>{staffReport.roles[role]?.approvedBefore ?? 0}</td>
                    <td>{staffReport.roles[role]?.currentActive ?? 0}</td>
                  </tr>
                ))}
              </DataTable>
            ) : null}
          </Card>
        ) : null}

        {view === "activity" ? (
          <Card
            title="Activity Log"
            actions={
              <Badge tone={activity ? "green" : "gray"}>
                {activity ? `Total AI cost: $${activity.totalCost.toFixed(2)}` : "Loading"}
              </Badge>
            }
          >
            {loading && !activity ? (
              <Loading />
            ) : activity ? (
              <DataTable head={[{ label: "When" }, { label: "Actor" }, { label: "Action" }, { label: "Details" }]}>
                {!activity.activities.length ? (
                  <EmptyRow colSpan={4}>No activity recorded.</EmptyRow>
                ) : (
                  activity.activities.map((entry) => (
                    <tr key={String(entry.id)}>
                      <td>{new Date(entry.created_at).toLocaleString()}</td>
                      <td>{entry.actor_email}</td>
                      <td>{entry.action}</td>
                      <td>{typeof entry.details === "string" ? entry.details : JSON.stringify(entry.details)}</td>
                    </tr>
                  ))
                )}
              </DataTable>
            ) : null}
          </Card>
        ) : null}

        <Card title="Database" actions={<Badge tone="gray">Supabase</Badge>}>
          <div className="row-auto">
            {counts.map((item) => (
              <div className="stat-card" key={item.table}>
                <div className="stat-num">{item.count}</div>
                <div className="stat-label">{item.label}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
