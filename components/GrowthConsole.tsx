"use client";

import { useState } from "react";

export default function GrowthConsole({ session, initial }: { session: { name: string; email: string }; initial: any }) {
  const [data, setData] = useState(initial);
  const [tab, setTab] = useState<"dashboard" | "recruiters" | "clients" | "finance" | "tasks" | "reports">("dashboard");
  const [task, setTask] = useState({ title: "", topic: "", priority: "Normal", description: "" });
  const [cost, setCost] = useState({ amount: "", description: "", notes: "" });
  const [payment, setPayment] = useState({ clientName: "", totalBilled: "", status: "Paid", invoiceRef: "" });

  async function reload() {
    const res = await fetch("/api/growth");
    setData(await res.json());
  }
  async function action(body: Record<string, unknown>) {
    const res = await fetch("/api/growth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await res.json();
    if (!res.ok || payload.error) throw new Error(payload.error || "Growth action failed");
    await reload();
  }

  return (
    <main className="app-shell wide">
      <div className="topbar"><div className="topbar-title"><div className="brand">Franbooking</div><h1>Growth Dashboard</h1><div className="muted">{session.name} | {session.email}</div></div><button className="btn btn-outline" onClick={reload}>Refresh</button></div>
      <div className="tabs">{["dashboard", "recruiters", "clients", "finance", "tasks", "reports"].map((name) => <button key={name} className={`tab ${tab === name ? "active" : ""}`} onClick={() => setTab(name as any)}>{name}</button>)}</div>
      {tab === "dashboard" && <><section className="metric-grid"><div className="metric"><span>Active Recruiters</span><strong>{data.stats?.activeRecruiters || 0}</strong></div><div className="metric"><span>Sends Last 7</span><strong>{data.stats?.sendsLast7 || 0}</strong></div><div className="metric"><span>Appts Last 7</span><strong>{data.stats?.apptsLast7 || 0}</strong></div><div className="metric"><span>Net</span><strong>${Math.round((data.stats?.totalEarning || 0) - (data.stats?.totalCost || 0))}</strong></div></section><section className="grid two"><div className="panel"><h2>Recent Feedback</h2><div className="compact-list">{(data.feedback || []).slice(0, 8).map((f: any) => <div className="compact-row" key={f.id}><strong>{f.name}</strong><span>{f.responses_today || 0} responses | {f.comments || f.unusual}</span></div>)}</div></div><div className="panel"><h2>Recent Appointments</h2><div className="compact-list">{(data.appointments || []).slice(0, 8).map((a: any) => <div className="compact-row" key={a.id}><strong>{a.invitee_name}</strong><span>{a.client_name} | {a.status}</span></div>)}</div></div></section></>}
      {tab === "recruiters" && <section className="panel table-wrap"><h2>Recruiters</h2><table><thead><tr><th>Name</th><th>Email</th><th>Type</th><th>Status</th><th>Sheet</th></tr></thead><tbody>{(data.users || []).filter((u: any) => u.role === "recruiter").map((u: any) => <tr key={u.id}><td>{u.name}</td><td>{u.email}</td><td>{u.legacy_type}</td><td>{u.status}</td><td>{u.legacy_sheet_id ? "Linked" : "-"}</td></tr>)}</tbody></table></section>}
      {tab === "clients" && <section className="panel table-wrap"><h2>Client Tracker</h2><table><thead><tr><th>Client</th><th>Status</th><th>Quota</th><th>Results</th><th>Payment</th></tr></thead><tbody>{(data.campaigns || []).map((c: any) => <tr key={c.id}><td>{c.campaign_name || c.clients?.name}</td><td>{c.campaign_status}</td><td>{c.quota}</td><td>{c.results_total}</td><td>{c.payment}</td></tr>)}</tbody></table></section>}
      {tab === "finance" && <section className="grid two"><div className="panel"><h2>Add Cost</h2><div className="form-grid"><input placeholder="Amount" value={cost.amount} onChange={(e) => setCost({ ...cost, amount: e.target.value })} /><input placeholder="Description" value={cost.description} onChange={(e) => setCost({ ...cost, description: e.target.value })} /><textarea placeholder="Notes" value={cost.notes} onChange={(e) => setCost({ ...cost, notes: e.target.value })} /><button className="btn btn-primary" onClick={() => action({ action: "addCost", ...cost })}>Add Cost</button></div></div><div className="panel"><h2>Add Client Payment</h2><div className="form-grid"><input placeholder="Client" value={payment.clientName} onChange={(e) => setPayment({ ...payment, clientName: e.target.value })} /><input placeholder="Total Billed" value={payment.totalBilled} onChange={(e) => setPayment({ ...payment, totalBilled: e.target.value })} /><input placeholder="Invoice Ref" value={payment.invoiceRef} onChange={(e) => setPayment({ ...payment, invoiceRef: e.target.value })} /><button className="btn btn-primary" onClick={() => action({ action: "addPayment", ...payment })}>Add Payment</button></div></div></section>}
      {tab === "tasks" && <section className="panel"><h2>Team Tasks</h2><div className="form-grid admin-create-grid"><input placeholder="Title" value={task.title} onChange={(e) => setTask({ ...task, title: e.target.value })} /><input placeholder="Topic" value={task.topic} onChange={(e) => setTask({ ...task, topic: e.target.value })} /><select value={task.priority} onChange={(e) => setTask({ ...task, priority: e.target.value })}><option>Low</option><option>Normal</option><option>High</option></select><button className="btn btn-primary" onClick={() => action({ action: "addTask", ...task })}>Add Task</button></div><div className="compact-list">{(data.tasks || []).map((t: any) => <div className="compact-row" key={t.id}><strong>{t.title}</strong><span>{t.status} | {t.assigned_name}</span></div>)}</div></section>}
      {tab === "reports" && <section className="panel"><h2>Reports</h2><div className="count-grid"><div className="count-item"><span>Total Contacts</span><strong>{data.contacts?.length || 0}</strong></div><div className="count-item"><span>Total Appointments</span><strong>{data.appointments?.length || 0}</strong></div><div className="count-item"><span>Total Costs</span><strong>${Math.round(data.stats?.totalCost || 0)}</strong></div><div className="count-item"><span>Total Earnings</span><strong>${Math.round(data.stats?.totalEarning || 0)}</strong></div></div></section>}
    </main>
  );
}
