"use client";

import { useEffect, useMemo, useState } from "react";

type Usage = {
  nurtureBalance?: number;
  outreachBalance?: number;
  profileBalance?: number;
};

type ClientAssignment = {
  name: string;
  status: string;
  eventUrl: string;
};

type Task = {
  name: string;
  li: string;
  client: string;
  stage: string;
  nurtureType: string;
  status: string;
  notes?: string;
  paused?: boolean;
  daysWaiting?: number | null;
};

type Bootstrap = {
  usage?: Usage;
  clients?: { clients: ClientAssignment[] };
  tasks?: { tasks: Task[]; reviewTasks: Task[] };
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {})
    }
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || "Request failed");
  return data;
}

export default function RecruiterDashboard({ initialUser }: { initialUser: { email: string; name: string } | null }) {
  const [user, setUser] = useState(initialUser);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [activeTab, setActiveTab] = useState<"tasks" | "outreach" | "nurture">("tasks");
  const [boot, setBoot] = useState<Bootstrap>({});
  const [loading, setLoading] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [outreach, setOutreach] = useState({ name: "", li: "", outType: "InMail", content: "", subject: "", salesNavId: "", isCany: false });
  const [nurture, setNurture] = useState({ li: "", reply: "", nurtureType: "Interested", client: "", conversation: "" });

  async function loadBootstrap() {
    setLoading(true);
    setMessage("");
    try {
      setBoot(await api<Bootstrap>("/api/recruiter/bootstrap"));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not load dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user) void loadBootstrap();
  }, [user]);

  const clients = boot.clients?.clients || [];
  const tasks = boot.tasks?.tasks || [];
  const reviewTasks = boot.tasks?.reviewTasks || [];
  const currentTasks = useMemo(() => [...tasks, ...reviewTasks], [tasks, reviewTasks]);

  async function login() {
    setLoading(true);
    setMessage("");
    try {
      const result = await api<{ ok: true; name: string; email: string }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      setUser({ name: result.name, email: result.email });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    setUser(null);
    setBoot({});
  }

  async function saveTask(task: Task, idx: number) {
    const reply = drafts[String(idx)] || "";
    if (!reply.trim()) {
      setMessage("Write a reply before saving.");
      return;
    }
    setLoading(true);
    try {
      await api("/api/recruiter/save-nurture", {
        method: "POST",
        body: JSON.stringify({
          li: task.li,
          reply,
          nurtureType: task.nurtureType,
          client: task.client,
          source: "custom"
        })
      });
      setMessage("Saved.");
      await loadBootstrap();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Save failed");
    } finally {
      setLoading(false);
    }
  }

  async function mark(path: string, li: string) {
    setLoading(true);
    try {
      await api(path, { method: "POST", body: JSON.stringify({ li }) });
      await loadBootstrap();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Action failed");
    } finally {
      setLoading(false);
    }
  }

  async function saveOutreach() {
    setLoading(true);
    setMessage("");
    try {
      await api("/api/recruiter/save-outreach", {
        method: "POST",
        body: JSON.stringify(outreach)
      });
      setMessage("Outreach saved.");
      setOutreach({ name: "", li: "", outType: "InMail", content: "", subject: "", salesNavId: "", isCany: false });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Outreach save failed");
    } finally {
      setLoading(false);
    }
  }

  async function saveNurture() {
    setLoading(true);
    setMessage("");
    try {
      await api("/api/recruiter/save-nurture", {
        method: "POST",
        body: JSON.stringify(nurture)
      });
      setMessage("Nurture saved.");
      setNurture({ li: "", reply: "", nurtureType: "Interested", client: "", conversation: "" });
      await loadBootstrap();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Nurture save failed");
    } finally {
      setLoading(false);
    }
  }

  if (!user) {
    return (
      <main className="login-shell">
        <section className="login-card">
          <div className="brand">Franbooking</div>
          <h1>Recruiter Login</h1>
          <p>Test migration app. Current GAS stays untouched.</p>
          <div className="form-grid">
            <label>Email<input value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
            <button className="btn btn-primary" disabled={loading} onClick={login}>Login</button>
          </div>
          {message && <div className="notice error">{message}</div>}
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <div className="topbar">
        <div className="topbar-title">
          <div className="brand">Franbooking</div>
          <h1>Recruiter Dashboard</h1>
          <div className="muted">{user.name} · {user.email}</div>
        </div>
        <div className="actions">
          <button className="btn btn-outline" onClick={loadBootstrap} disabled={loading}>Refresh</button>
          <button className="btn btn-outline" onClick={logout}>Logout</button>
        </div>
      </div>

      <div className="credit-row">
        <span className="credit-pill">{boot.usage?.nurtureBalance ?? "-"} Nurture</span>
        <span className="credit-pill">{boot.usage?.outreachBalance ?? "-"} Outreach</span>
        <span className="credit-pill">{boot.usage?.profileBalance ?? "-"} Profile</span>
      </div>

      {message && <div className="notice warn">{message}</div>}

      <div className="tabs" style={{ marginTop: 14 }}>
        <button className={`tab ${activeTab === "tasks" ? "active" : ""}`} onClick={() => setActiveTab("tasks")}>Tasks</button>
        <button className={`tab ${activeTab === "outreach" ? "active" : ""}`} onClick={() => setActiveTab("outreach")}>Outreach</button>
        <button className={`tab ${activeTab === "nurture" ? "active" : ""}`} onClick={() => setActiveTab("nurture")}>Nurture</button>
      </div>

      {activeTab === "tasks" && (
        <section className="panel">
          <h2>Follow-ups & Review Due</h2>
          <div className="task-list">
            {currentTasks.length === 0 && <div className="muted">No tasks loaded.</div>}
            {currentTasks.map((task, idx) => (
              <article className="task-card" key={`${task.li}-${idx}`}>
                <div className="task-head">
                  <div>
                    <div className="task-name">{task.name || "Contact"}</div>
                    <div className="muted">{task.client || "No client"} · {task.status}</div>
                  </div>
                  <span className="badge">{task.stage}</span>
                </div>
                {task.paused && <div className="notice warn">{task.client} is paused. Save is blocked server-side.</div>}
                <textarea
                  placeholder="Write the follow-up reply here..."
                  value={drafts[String(idx)] || ""}
                  onChange={(e) => setDrafts((d) => ({ ...d, [String(idx)]: e.target.value }))}
                />
                <div className="actions">
                  <button className="btn btn-primary" disabled={loading || task.paused} onClick={() => saveTask(task, idx)}>Save</button>
                  <button className="btn btn-danger" disabled={loading} onClick={() => mark("/api/recruiter/mark-not-interested", task.li)}>Not Interested</button>
                  <button className="btn btn-outline" disabled={loading} onClick={() => mark("/api/recruiter/mark-profile-restricted", task.li)}>Profile Restricted</button>
                  {task.li && <a className="btn btn-outline" href={task.li} target="_blank">LinkedIn</a>}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {activeTab === "outreach" && (
        <section className="panel">
          <h2>Outreach Save</h2>
          <div className="form-grid">
            <label>Prospect Name<input value={outreach.name} onChange={(e) => setOutreach({ ...outreach, name: e.target.value })} /></label>
            <label>LinkedIn URL<input value={outreach.li} onChange={(e) => setOutreach({ ...outreach, li: e.target.value })} /></label>
            <label>Type<select value={outreach.outType} onChange={(e) => setOutreach({ ...outreach, outType: e.target.value })}><option>InMail</option><option>Invite</option><option>DM</option></select></label>
            <label>Subject / Code<input value={outreach.subject} onChange={(e) => setOutreach({ ...outreach, subject: e.target.value })} /></label>
            <label>Sales Nav ID<input value={outreach.salesNavId} onChange={(e) => setOutreach({ ...outreach, salesNavId: e.target.value })} /></label>
            <label><span><input type="checkbox" checked={outreach.isCany} onChange={(e) => setOutreach({ ...outreach, isCany: e.target.checked })} /> CA/NY prospect</span></label>
            <label>Message<textarea value={outreach.content} onChange={(e) => setOutreach({ ...outreach, content: e.target.value })} /></label>
            <button className="btn btn-primary" disabled={loading} onClick={saveOutreach}>Save Outreach</button>
          </div>
        </section>
      )}

      {activeTab === "nurture" && (
        <section className="panel">
          <h2>Nurture Save</h2>
          <div className="form-grid">
            <label>LinkedIn URL<input value={nurture.li} onChange={(e) => setNurture({ ...nurture, li: e.target.value })} /></label>
            <label>Client<select value={nurture.client} onChange={(e) => setNurture({ ...nurture, client: e.target.value })}><option value="">Select client</option>{clients.map((c) => <option key={c.name} value={c.name}>{c.name} {c.status ? `(${c.status})` : ""}</option>)}</select></label>
            <label>Type<select value={nurture.nurtureType} onChange={(e) => setNurture({ ...nurture, nurtureType: e.target.value })}><option>Interested</option><option>Unsure</option><option>SDFU</option><option>FU1</option><option>FU2</option><option>FU3</option><option>Client Rotation</option><option>Not Interested</option></select></label>
            <label>Conversation<textarea value={nurture.conversation} onChange={(e) => setNurture({ ...nurture, conversation: e.target.value })} /></label>
            <label>Reply<textarea value={nurture.reply} onChange={(e) => setNurture({ ...nurture, reply: e.target.value })} /></label>
            <button className="btn btn-primary" disabled={loading} onClick={saveNurture}>Save Nurture</button>
          </div>
        </section>
      )}
    </main>
  );
}
