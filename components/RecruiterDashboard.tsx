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
  const [activeTab, setActiveTab] = useState<"tasks" | "outreach" | "nurture" | "stats" | "feedback">("tasks");
  const [boot, setBoot] = useState<Bootstrap>({});
  const [loading, setLoading] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [outreach, setOutreach] = useState({ name: "", li: "", outType: "InMail", content: "", subject: "", salesNavId: "", isCany: false });
  const [nurture, setNurture] = useState({ li: "", reply: "", nurtureType: "Interested", client: "", conversation: "" });
  const [contacts, setContacts] = useState<Array<{ name: string; li: string; status: string; client: string }>>([]);
  const [targetRows, setTargetRows] = useState<Array<Record<string, string>>>([]);
  const [stats, setStats] = useState<{ period?: string; total?: number; contacts?: number; outreach?: number; byDate?: Array<{ date: string; count: number }> }>({});
  const [feedback, setFeedback] = useState({ salesNavAll: true, salesNavNoCount: "", salesNavNoReason: "", unusual: "", responsesToday: "", comments: "" });
  const [leave, setLeave] = useState({ leaveDate: "", duration: "1", reason: "" });

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

  async function tool<T>(action: string, params: Record<string, string> = {}) {
    const qs = new URLSearchParams({ action, ...params });
    return api<T>(`/api/recruiter/tools?${qs.toString()}`);
  }

  async function postTool(action: string, body: Record<string, unknown> = {}) {
    return api("/api/recruiter/tools", { method: "POST", body: JSON.stringify({ action, ...body }) });
  }

  async function loadOutreachTemplate() {
    const tpl = await tool<{ subject?: string; body?: string; text?: string; code?: string }>("outreachTpl", { outType: outreach.outType });
    setOutreach({ ...outreach, subject: tpl.subject || tpl.code || outreach.subject, content: tpl.body || tpl.text || "" });
  }

  async function checkDuplicate() {
    if (!outreach.li.trim()) return;
    const dup = await tool<{ duplicate: boolean; matches?: Array<{ name: string; status: string }> }>("checkLiDup", { li: outreach.li });
    setMessage(dup.duplicate ? `Duplicate found: ${(dup.matches || []).map((m) => `${m.name} ${m.status}`).join(", ")}` : "No duplicate found.");
  }

  async function loadTargetArea(q = "") {
    const data = await tool<{ rows: Array<Record<string, string>> }>("targetArea", { q });
    setTargetRows(data.rows || []);
  }

  async function searchContacts(q = "") {
    const qs = new URLSearchParams(q ? { q } : {});
    const data = await api<{ contacts: Array<{ name: string; li: string; status: string; client: string }> }>(`/api/recruiter/contacts?${qs.toString()}`);
    setContacts(data.contacts || []);
  }

  async function loadNurtureTemplate() {
    const tpl = await tool<{ body?: string; text?: string }>("nurtureTpl", { nType: nurture.nurtureType, client: nurture.client });
    setNurture({ ...nurture, reply: tpl.body || tpl.text || "" });
  }

  async function loadStats() {
    setStats(await tool("billingStats"));
  }

  async function submitDailyFeedback() {
    await postTool("submitFeedback", feedback);
    setMessage("Feedback submitted.");
    setFeedback({ salesNavAll: true, salesNavNoCount: "", salesNavNoReason: "", unusual: "", responsesToday: "", comments: "" });
  }

  async function submitLeaveRequest() {
    await postTool("submitLeave", leave);
    setMessage("Leave request submitted.");
    setLeave({ leaveDate: "", duration: "1", reason: "" });
  }

  async function requestMoreCredits() {
    await postTool("requestCredits", { type: "all" });
    setMessage("Credit request sent.");
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
          <p>Use your approved Franbooking account.</p>
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
        <button className="btn btn-outline" onClick={requestMoreCredits}>Get More Credit</button>
      </div>

      {message && <div className="notice warn">{message}</div>}

      <div className="tabs" style={{ marginTop: 14 }}>
        <button className={`tab ${activeTab === "tasks" ? "active" : ""}`} onClick={() => setActiveTab("tasks")}>Tasks</button>
        <button className={`tab ${activeTab === "outreach" ? "active" : ""}`} onClick={() => setActiveTab("outreach")}>Outreach</button>
        <button className={`tab ${activeTab === "nurture" ? "active" : ""}`} onClick={() => setActiveTab("nurture")}>Nurture</button>
        <button className={`tab ${activeTab === "stats" ? "active" : ""}`} onClick={() => { setActiveTab("stats"); void loadStats(); }}>Stats</button>
        <button className={`tab ${activeTab === "feedback" ? "active" : ""}`} onClick={() => setActiveTab("feedback")}>Feedback</button>
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
            <label>LinkedIn URL<input value={outreach.li} onBlur={checkDuplicate} onChange={(e) => setOutreach({ ...outreach, li: e.target.value })} /></label>
            <label>Type<select value={outreach.outType} onChange={(e) => setOutreach({ ...outreach, outType: e.target.value })}><option>InMail</option><option>Invite</option><option>DM</option></select></label>
            <label>Subject / Code<input value={outreach.subject} onChange={(e) => setOutreach({ ...outreach, subject: e.target.value })} /></label>
            <label>Sales Nav ID<input value={outreach.salesNavId} onChange={(e) => setOutreach({ ...outreach, salesNavId: e.target.value })} /></label>
            <label><span><input type="checkbox" checked={outreach.isCany} onChange={(e) => setOutreach({ ...outreach, isCany: e.target.checked })} /> CA/NY prospect</span></label>
            <label>Message<textarea value={outreach.content} onChange={(e) => setOutreach({ ...outreach, content: e.target.value })} /></label>
            <div className="actions">
              <button className="btn btn-outline" disabled={loading} onClick={loadOutreachTemplate}>Load Template</button>
              <button className="btn btn-outline" disabled={loading} onClick={() => loadTargetArea("")}>Target Area</button>
              <button className="btn btn-primary" disabled={loading} onClick={saveOutreach}>Save Outreach</button>
            </div>
            {targetRows.length > 0 && (
              <div className="compact-list">
                {targetRows.slice(0, 8).map((row, idx) => (
                  <div className="compact-row" key={idx}>
                    <strong>{row.profile_name || row.city || row.zip_code || "Target"}</strong>
                    <span>{[row.city, row.state, row.best_cst_time].filter(Boolean).join(" | ")}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {activeTab === "nurture" && (
        <section className="panel">
          <h2>Nurture Save</h2>
          <div className="form-grid">
            <label>Search Contacts<input placeholder="Type name or LinkedIn URL" onChange={(e) => searchContacts(e.target.value)} /></label>
            {contacts.length > 0 && (
              <div className="compact-list">
                {contacts.slice(0, 8).map((c, idx) => (
                  <button className="compact-row compact-button" key={`${c.li}-${idx}`} onClick={() => setNurture({ ...nurture, li: c.li, client: c.client })}>
                    <strong>{c.name || "Contact"}</strong>
                    <span>{c.client} | {c.status}</span>
                  </button>
                ))}
              </div>
            )}
            <label>LinkedIn URL<input value={nurture.li} onChange={(e) => setNurture({ ...nurture, li: e.target.value })} /></label>
            <label>Client<select value={nurture.client} onChange={(e) => setNurture({ ...nurture, client: e.target.value })}><option value="">Select client</option>{clients.map((c) => <option key={c.name} value={c.name}>{c.name} {c.status ? `(${c.status})` : ""}</option>)}</select></label>
            <label>Type<select value={nurture.nurtureType} onChange={(e) => setNurture({ ...nurture, nurtureType: e.target.value })}><option>Interested</option><option>Unsure</option><option>SDFU</option><option>FU1</option><option>FU2</option><option>FU3</option><option>Client Rotation</option><option>Not Interested</option></select></label>
            <label>Conversation<textarea value={nurture.conversation} onChange={(e) => setNurture({ ...nurture, conversation: e.target.value })} /></label>
            <label>Reply<textarea value={nurture.reply} onChange={(e) => setNurture({ ...nurture, reply: e.target.value })} /></label>
            <div className="actions">
              <button className="btn btn-outline" disabled={loading} onClick={loadNurtureTemplate}>Load Template</button>
              <button className="btn btn-primary" disabled={loading} onClick={saveNurture}>Save Nurture</button>
            </div>
          </div>
        </section>
      )}

      {activeTab === "stats" && (
        <section className="panel">
          <div className="section-head">
            <h2>Stats</h2>
            <button className="btn btn-outline" onClick={loadStats}>Refresh</button>
          </div>
          <section className="metric-grid">
            <div className="metric"><span>Period</span><strong>{stats.period || "-"}</strong></div>
            <div className="metric"><span>Appointments</span><strong>{stats.total ?? 0}</strong></div>
            <div className="metric"><span>FU Contacts</span><strong>{stats.contacts ?? 0}</strong></div>
            <div className="metric"><span>Outreach Saves</span><strong>{stats.outreach ?? 0}</strong></div>
          </section>
          <div className="compact-list">
            {(stats.byDate || []).map((row) => (
              <div className="compact-row" key={row.date}><strong>{row.date}</strong><span>{row.count}</span></div>
            ))}
          </div>
        </section>
      )}

      {activeTab === "feedback" && (
        <section className="grid two">
          <div className="panel">
            <h2>Daily Feedback</h2>
            <div className="form-grid">
              <label><span><input type="checkbox" checked={feedback.salesNavAll} onChange={(e) => setFeedback({ ...feedback, salesNavAll: e.target.checked })} /> All Sales Nav working</span></label>
              <label>Sales Nav Not Working Count<input value={feedback.salesNavNoCount} onChange={(e) => setFeedback({ ...feedback, salesNavNoCount: e.target.value })} /></label>
              <label>Reason<input value={feedback.salesNavNoReason} onChange={(e) => setFeedback({ ...feedback, salesNavNoReason: e.target.value })} /></label>
              <label>Unusual Activity<input value={feedback.unusual} onChange={(e) => setFeedback({ ...feedback, unusual: e.target.value })} /></label>
              <label>Responses Today<input value={feedback.responsesToday} onChange={(e) => setFeedback({ ...feedback, responsesToday: e.target.value })} /></label>
              <label>Comments<textarea value={feedback.comments} onChange={(e) => setFeedback({ ...feedback, comments: e.target.value })} /></label>
              <button className="btn btn-primary" onClick={submitDailyFeedback}>Submit Feedback</button>
            </div>
          </div>
          <div className="panel">
            <h2>Leave Request</h2>
            <div className="form-grid">
              <label>Leave Date<input type="date" value={leave.leaveDate} onChange={(e) => setLeave({ ...leave, leaveDate: e.target.value })} /></label>
              <label>Duration Days<input value={leave.duration} onChange={(e) => setLeave({ ...leave, duration: e.target.value })} /></label>
              <label>Reason<textarea value={leave.reason} onChange={(e) => setLeave({ ...leave, reason: e.target.value })} /></label>
              <button className="btn btn-primary" onClick={submitLeaveRequest}>Submit Leave</button>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
