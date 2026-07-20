"use client";

import { useState } from "react";

export default function OperationsConsole({ session, initial }: { session: { name: string; email: string }; initial: any }) {
  const [data, setData] = useState(initial);
  const [tab, setTab] = useState<"appointments" | "salesnav" | "pipeline" | "clients">("appointments");
  const [message, setMessage] = useState("");
  const [salesNav, setSalesNav] = useState({ vendor: "", recruiterName: "", recruiterEmail: "", price: "", salesNavId: "", notes: "" });
  const [applicant, setApplicant] = useState({ platform: "", name: "", email: "", phone: "", liProfile: "", position: "", notes: "" });

  async function reload() {
    const res = await fetch("/api/operations");
    setData(await res.json());
  }

  async function action(body: Record<string, unknown>) {
    setMessage("");
    const res = await fetch("/api/operations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await res.json();
    if (!res.ok || payload.error) throw new Error(payload.error || "Action failed");
    setMessage("Saved.");
    await reload();
  }

  const pending = (data.appointments || []).filter((a: any) => String(a.status || "pending").toLowerCase() === "pending");

  return (
    <main className="app-shell wide">
      <div className="topbar">
        <div className="topbar-title">
          <div className="brand">Franbooking</div>
          <h1>Operations</h1>
          <div className="muted">{session.name} | {session.email}</div>
        </div>
        <button className="btn btn-outline" onClick={reload}>Refresh</button>
      </div>
      {message && <div className="notice success">{message}</div>}
      <section className="metric-grid">
        <div className="metric"><span>Pending Appts</span><strong>{pending.length}</strong></div>
        <div className="metric"><span>Sales Nav Seats</span><strong>{data.salesNav?.length || 0}</strong></div>
        <div className="metric"><span>Applicants</span><strong>{data.applicants?.length || 0}</strong></div>
        <div className="metric"><span>Clients</span><strong>{data.clients?.length || 0}</strong></div>
      </section>
      <div className="tabs">
        {["appointments", "salesnav", "pipeline", "clients"].map((name) => <button key={name} className={`tab ${tab === name ? "active" : ""}`} onClick={() => setTab(name as any)}>{name}</button>)}
      </div>

      {tab === "appointments" && <section className="panel table-wrap"><h2>Appointment Review</h2><table><thead><tr><th>Invitee</th><th>Client</th><th>Recruiter</th><th>Status</th><th>Actions</th></tr></thead><tbody>{(data.appointments || []).map((a: any) => <tr key={a.id}><td>{a.invitee_name}<br /><span className="muted">{a.invitee_email}</span></td><td>{a.client_name}</td><td>{a.recruiter_name || "-"}</td><td>{a.status}</td><td><button className="btn btn-primary" onClick={() => action({ action: "processAppointment", id: a.id, recruiterEmail: a.recruiter_email, linkedinUrl: a.linkedin_url })}>Process</button> <button className="btn btn-danger" onClick={() => action({ action: "recallAppointment", id: a.id, reason: "Recalled from Ops", linkedinUrl: a.linkedin_url })}>Recall</button></td></tr>)}</tbody></table></section>}

      {tab === "salesnav" && <section className="panel"><h2>Sales Nav Inventory</h2><div className="form-grid admin-create-grid"><input placeholder="Vendor" value={salesNav.vendor} onChange={(e) => setSalesNav({ ...salesNav, vendor: e.target.value })} /><input placeholder="Recruiter" value={salesNav.recruiterName} onChange={(e) => setSalesNav({ ...salesNav, recruiterName: e.target.value })} /><input placeholder="Email" value={salesNav.recruiterEmail} onChange={(e) => setSalesNav({ ...salesNav, recruiterEmail: e.target.value })} /><input placeholder="Price" value={salesNav.price} onChange={(e) => setSalesNav({ ...salesNav, price: e.target.value })} /><input placeholder="Sales Nav ID" value={salesNav.salesNavId} onChange={(e) => setSalesNav({ ...salesNav, salesNavId: e.target.value })} /><button className="btn btn-primary" onClick={() => action({ action: "addSalesNav", ...salesNav })}>Add Seat</button></div><div className="compact-list">{(data.salesNav || []).map((s: any) => <div className="compact-row" key={s.id}><strong>{s.vendor || s.sales_nav_id}</strong><span>{s.recruiter_name} | {s.status} | {s.payment_status}</span></div>)}</div></section>}

      {tab === "pipeline" && <section className="panel"><h2>Recruiting Pipeline</h2><div className="form-grid admin-create-grid"><input placeholder="Platform" value={applicant.platform} onChange={(e) => setApplicant({ ...applicant, platform: e.target.value })} /><input placeholder="Name" value={applicant.name} onChange={(e) => setApplicant({ ...applicant, name: e.target.value })} /><input placeholder="Email" value={applicant.email} onChange={(e) => setApplicant({ ...applicant, email: e.target.value })} /><input placeholder="Phone" value={applicant.phone} onChange={(e) => setApplicant({ ...applicant, phone: e.target.value })} /><input placeholder="LI Profile" value={applicant.liProfile} onChange={(e) => setApplicant({ ...applicant, liProfile: e.target.value })} /><button className="btn btn-primary" onClick={() => action({ action: "addApplicant", ...applicant })}>Log Applicant</button></div><div className="table-wrap"><table><thead><tr><th>Name</th><th>Status</th><th>Agent</th><th>Actions</th></tr></thead><tbody>{(data.applicants || []).map((a: any) => <tr key={a.id}><td>{a.name}<br /><span className="muted">{a.email}</span></td><td>{a.status}</td><td>{a.assigned_agent_name || "-"}</td><td><select onChange={(e) => action({ action: "assignAgent", applicantId: a.id, agentEmail: e.target.value })} defaultValue=""><option value="">Assign</option>{(data.agents || []).map((ag: any) => <option key={ag.email} value={ag.email}>{ag.name}</option>)}</select></td></tr>)}</tbody></table></div></section>}

      {tab === "clients" && <section className="panel table-wrap"><h2>Client Tracker</h2><table><thead><tr><th>Client</th><th>Status</th><th>Quota</th><th>Cycle</th><th>Action</th></tr></thead><tbody>{(data.clients || []).map((c: any) => <tr key={c.id}><td>{c.campaign_name || c.clients?.name}</td><td>{c.campaign_status}</td><td>{c.quota}</td><td>{c.cycle}</td><td><button className="btn btn-outline" onClick={() => action({ action: "updateClientStatus", campaignId: c.id, status: "Paused", pausedReason: "Ops update" })}>Pause</button> <button className="btn btn-primary" onClick={() => action({ action: "updateClientStatus", campaignId: c.id, status: "Active" })}>Active</button></td></tr>)}</tbody></table></section>}
    </main>
  );
}
