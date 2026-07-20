"use client";

import { useState } from "react";

type ChatTurn = { role: "user" | "assistant"; text: string };

export default function GrowthConsole({ session, initial, loadError }: { session: { name: string; email: string }; initial: any; loadError?: string }) {
  const [data, setData] = useState(initial);
  const [tab, setTab] = useState<"dashboard" | "recruiters" | "clients" | "finance" | "tasks" | "reports">("dashboard");
  const [task, setTask] = useState({ title: "", topic: "", priority: "Normal", description: "" });
  const [cost, setCost] = useState({ amount: "", description: "", notes: "" });
  const [payment, setPayment] = useState({ clientName: "", totalBilled: "", status: "Paid", invoiceRef: "" });
  const [message, setMessage] = useState("");

  const [brainstormOpen, setBrainstormOpen] = useState(false);
  const [chat, setChat] = useState<ChatTurn[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);

  const [impersonateRole, setImpersonateRole] = useState<"operations" | "recruiter" | null>(null);
  const [impersonateOptions, setImpersonateOptions] = useState<Array<{ email: string; name: string }>>([]);

  async function reload() {
    const res = await fetch("/api/growth");
    setData(await res.json());
  }
  async function action(body: Record<string, unknown>) {
    setMessage("");
    const res = await fetch("/api/growth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await res.json();
    if (!res.ok || payload.error) throw new Error(payload.error || "Growth action failed");
    return payload;
  }
  async function doAction(body: Record<string, unknown>) {
    try {
      await action(body);
      await reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Action failed");
    }
  }

  async function sendChat() {
    const question = chatInput.trim();
    if (!question) return;
    const nextChat: ChatTurn[] = [...chat, { role: "user", text: question }];
    setChat(nextChat);
    setChatInput("");
    setChatBusy(true);
    try {
      const payload = await action({ action: "brainstorm", question, history: nextChat });
      setChat((c) => [...c, { role: "assistant", text: payload.reply || "" }]);
    } catch (e) {
      setChat((c) => [...c, { role: "assistant", text: e instanceof Error ? e.message : "Brainstorm failed" }]);
    } finally {
      setChatBusy(false);
    }
  }

  async function openImpersonatePicker(role: "operations" | "recruiter") {
    setImpersonateRole(role);
    setImpersonateOptions([]);
    try {
      const payload = await action({ action: role === "operations" ? "listOpsUsers" : "listRecruiters" });
      setImpersonateOptions(payload.users || []);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not load user list");
    }
  }

  async function impersonate(targetEmail: string) {
    try {
      const payload = await action({ action: "impersonate", targetEmail });
      window.location.href = payload.page || "/";
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Impersonation failed");
    }
  }

  const unreviewedFeedback = (data.feedback || []).filter((f: any) => !f.reviewed);

  return (
    <main className="app-shell wide">
      <div className="topbar">
        <div className="topbar-title">
          <div className="brand">Franbooking</div>
          <h1>Growth Dashboard</h1>
          <div className="muted">{session.name} | {session.email}</div>
        </div>
        <button className="btn btn-outline" onClick={reload}>Refresh</button>
      </div>

      {loadError && <div className="notice error">Growth data failed to load: {loadError}</div>}
      {message && <div className="notice error">{message}</div>}

      <div className="tabs">
        {["dashboard", "recruiters", "clients", "finance", "tasks", "reports"].map((name) => (
          <button key={name} className={`tab ${tab === name ? "active" : ""}`} onClick={() => setTab(name as any)}>{name}</button>
        ))}
      </div>

      {tab === "dashboard" && (
        <>
          <section className="metric-grid">
            <div className="metric"><span>Active Recruiters</span><strong>{data.stats?.activeRecruiters || 0}</strong></div>
            <div className="metric"><span>Sends Last 7</span><strong>{data.stats?.sendsLast7 || 0}</strong></div>
            <div className="metric"><span>Appts Last 7</span><strong>{data.stats?.apptsLast7 || 0}</strong></div>
            <div className="metric"><span>Net</span><strong>${Math.round((data.stats?.totalEarning || 0) - (data.stats?.totalCost || 0))}</strong></div>
          </section>
          <section className="grid two">
            <div className="panel">
              <div className="section-head"><h2>Recent Feedback</h2><span className="badge">{unreviewedFeedback.length} unreviewed</span></div>
              <div className="compact-list">
                {unreviewedFeedback.slice(0, 8).map((f: any) => (
                  <div className="compact-row" key={f.id}>
                    <strong>{f.name}</strong>
                    <span>{f.responses_today || 0} responses | {f.comments || f.unusual}</span>
                    <button className="btn btn-outline" onClick={() => doAction({ action: "markFeedbackReviewed", id: f.id })}>Reviewed</button>
                  </div>
                ))}
                {unreviewedFeedback.length === 0 && <div className="muted">Nothing to review.</div>}
              </div>
            </div>
            <div className="panel">
              <h2>Recent Appointments</h2>
              <div className="compact-list">
                {(data.appointments || []).slice(0, 8).map((a: any) => (
                  <div className="compact-row" key={a.id}><strong>{a.invitee_name}</strong><span>{a.client_name} | {a.status}</span></div>
                ))}
              </div>
            </div>
          </section>
          <section className="panel">
            <h2>Impersonate</h2>
            <div className="actions">
              <button className="btn btn-outline" onClick={() => openImpersonatePicker("operations")}>Operations Panel →</button>
              <button className="btn btn-outline" onClick={() => openImpersonatePicker("recruiter")}>Recruiter Panel →</button>
            </div>
            {impersonateRole && (
              <div className="compact-list">
                {impersonateOptions.length === 0 && <div className="muted">Loading...</div>}
                {impersonateOptions.map((u) => (
                  <button key={u.email} className="compact-row compact-button" onClick={() => impersonate(u.email)}>
                    <strong>{u.name}</strong><span>{u.email}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {tab === "recruiters" && (
        <section className="panel table-wrap">
          <h2>Recruiters</h2>
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Type</th><th>Status</th><th>Sheet</th></tr></thead>
            <tbody>
              {(data.users || []).filter((u: any) => u.role === "recruiter").map((u: any) => (
                <tr key={u.id}><td>{u.name}</td><td>{u.email}</td><td>{u.legacy_type}</td><td>{u.status}</td><td>{u.legacy_sheet_id ? "Linked" : "-"}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {tab === "clients" && (
        <section className="panel table-wrap">
          <h2>Client Tracker</h2>
          <table>
            <thead><tr><th>Client</th><th>Status</th><th>Quota</th><th>Results</th><th>Payment</th><th>Action</th></tr></thead>
            <tbody>
              {(data.campaigns || []).map((c: any) => (
                <tr key={c.id}>
                  <td>{c.campaign_name || c.clients?.name}</td>
                  <td>{c.campaign_status}</td>
                  <td>{c.quota}</td>
                  <td>{c.results_total}</td>
                  <td>{c.payment}</td>
                  <td>
                    <div className="actions">
                      <button className="btn btn-outline" onClick={() => doAction({ action: "updateClientStatus", campaignId: c.id, status: "Paused", pausedReason: "Growth update" })}>Pause</button>
                      <button className="btn btn-primary" onClick={() => doAction({ action: "updateClientStatus", campaignId: c.id, status: "Active" })}>Active</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {tab === "finance" && (
        <section className="grid two">
          <div className="panel">
            <h2>Add Cost</h2>
            <div className="form-grid">
              <input placeholder="Amount" value={cost.amount} onChange={(e) => setCost({ ...cost, amount: e.target.value })} />
              <input placeholder="Description" value={cost.description} onChange={(e) => setCost({ ...cost, description: e.target.value })} />
              <textarea placeholder="Notes" value={cost.notes} onChange={(e) => setCost({ ...cost, notes: e.target.value })} />
              <button className="btn btn-primary" onClick={() => doAction({ action: "addCost", ...cost })}>Add Cost</button>
            </div>
          </div>
          <div className="panel">
            <h2>Add Client Payment</h2>
            <div className="form-grid">
              <input placeholder="Client" value={payment.clientName} onChange={(e) => setPayment({ ...payment, clientName: e.target.value })} />
              <input placeholder="Total Billed" value={payment.totalBilled} onChange={(e) => setPayment({ ...payment, totalBilled: e.target.value })} />
              <input placeholder="Invoice Ref" value={payment.invoiceRef} onChange={(e) => setPayment({ ...payment, invoiceRef: e.target.value })} />
              <button className="btn btn-primary" onClick={() => doAction({ action: "addPayment", ...payment })}>Add Payment</button>
            </div>
          </div>
        </section>
      )}

      {tab === "tasks" && (
        <section className="panel">
          <h2>Team Tasks</h2>
          <div className="form-grid admin-create-grid">
            <input placeholder="Title" value={task.title} onChange={(e) => setTask({ ...task, title: e.target.value })} />
            <input placeholder="Topic" value={task.topic} onChange={(e) => setTask({ ...task, topic: e.target.value })} />
            <select value={task.priority} onChange={(e) => setTask({ ...task, priority: e.target.value })}><option>Low</option><option>Normal</option><option>High</option></select>
            <button className="btn btn-primary" onClick={() => doAction({ action: "addTask", ...task })}>Add Task</button>
          </div>
          <div className="compact-list">
            {(data.tasks || []).map((t: any) => (
              <div className="compact-row" key={t.id}>
                <strong>{t.title}</strong>
                <span>{t.status} | {t.assigned_name}</span>
                <div className="actions">
                  <button className="btn btn-outline" onClick={() => doAction({ action: "taskStatus", id: t.id, status: t.status === "Open" ? "Done" : "Open" })}>{t.status === "Open" ? "Mark Done" : "Reopen"}</button>
                  <button className="btn btn-outline" onClick={() => {
                    const email = window.prompt("Reassign to (email):", t.assigned_email || "");
                    if (!email) return;
                    const name = window.prompt("Assignee name:", "") || email;
                    void doAction({ action: "reassignTask", id: t.id, assignedEmail: email, assignedName: name });
                  }}>Reassign</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === "reports" && (
        <section className="panel">
          <h2>Reports</h2>
          <div className="count-grid">
            <div className="count-item"><span>Total Appointments</span><strong>{data.appointments?.length || 0}</strong></div>
            <div className="count-item"><span>Sends Last 7 Days</span><strong>{data.stats?.sendsLast7 || 0}</strong></div>
            <div className="count-item"><span>Total Costs</span><strong>${Math.round(data.stats?.totalCost || 0)}</strong></div>
            <div className="count-item"><span>Total Earnings</span><strong>${Math.round(data.stats?.totalEarning || 0)}</strong></div>
          </div>
        </section>
      )}

      <button
        className="btn btn-primary"
        style={{ position: "fixed", right: 24, bottom: 24, borderRadius: 999, zIndex: 20 }}
        onClick={() => setBrainstormOpen((v) => !v)}
      >
        {brainstormOpen ? "Close Brainstorm" : "Brainstorm with AI"}
      </button>

      {brainstormOpen && (
        <div className="panel" style={{ position: "fixed", right: 24, bottom: 80, width: 340, maxHeight: "60vh", overflowY: "auto", zIndex: 20 }}>
          <h2>Brainstorm with AI</h2>
          <div className="compact-list">
            {chat.map((turn, idx) => (
              <div className="compact-row" key={idx}>
                <strong>{turn.role === "user" ? "You" : "Assistant"}</strong>
                <span>{turn.text}</span>
              </div>
            ))}
            {chat.length === 0 && <div className="muted">Ask anything about the business.</div>}
          </div>
          <div className="form-grid">
            <textarea placeholder="Ask a question..." value={chatInput} onChange={(e) => setChatInput(e.target.value)} />
            <button className="btn btn-primary" disabled={chatBusy} onClick={sendChat}>Send</button>
          </div>
        </div>
      )}
    </main>
  );
}
