"use client";

import { Fragment, useState } from "react";

const APPLICANT_STATUSES = ["Applied", "Whatsapp Message Sent", "Accepted", "Rejected", "Onboarding", "Hired"];

type ContactSearchResult = {
  name: string;
  li: string;
  recruiter: string;
  recruiterEmail: string;
  status?: string;
  client?: string;
  type?: string;
  date?: string;
  source: string;
};

type OperationsSession = { name: string; email: string; impersonatorEmail?: string; impersonatorName?: string };

export default function OperationsConsole({ session, initial, loadError }: { session: OperationsSession; initial: any; loadError?: string }) {
  const [data, setData] = useState(initial);
  const [tab, setTab] = useState<"appointments" | "salesnav" | "pipeline" | "clients">("appointments");
  const [message, setMessage] = useState("");
  const [salesNav, setSalesNav] = useState({ vendor: "", recruiterName: "", recruiterEmail: "", price: "", salesNavId: "", notes: "" });
  const [applicant, setApplicant] = useState({ platform: "", name: "", email: "", phone: "", liProfile: "", position: "", notes: "" });
  const [editingApplicant, setEditingApplicant] = useState<string | null>(null);
  const [editFields, setEditFields] = useState({ name: "", email: "", phone: "", liProfile: "", position: "", notes: "" });
  const [expandedVendor, setExpandedVendor] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ContactSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);

  async function reload() {
    const res = await fetch("/api/operations");
    setData(await res.json());
  }

  async function returnToGrowth() {
    const res = await fetch("/api/auth/return-impersonation", { method: "POST" });
    const payload = await res.json();
    window.location.href = payload.page || "/growth";
  }

  async function action(body: Record<string, unknown>) {
    setMessage("");
    const res = await fetch("/api/operations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await res.json();
    if (!res.ok || payload.error) throw new Error(payload.error || "Action failed");
    setMessage("Saved.");
    await reload();
  }

  async function runSearch() {
    if (searchQuery.trim().length < 2) { setMessage("Enter at least 2 characters to search."); return; }
    setSearching(true);
    setMessage("");
    try {
      const res = await fetch(`/api/operations/search?q=${encodeURIComponent(searchQuery)}`);
      const payload = await res.json();
      if (!res.ok || payload.error) throw new Error(payload.error || "Search failed");
      setSearchResults(payload.contacts || []);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  function startEditApplicant(a: any) {
    setEditingApplicant(a.id);
    setEditFields({ name: a.name || "", email: a.email || "", phone: a.phone || "", liProfile: a.linkedin_url || "", position: a.position || "", notes: a.notes || "" });
  }

  async function saveApplicantEdit(applicantId: string) {
    try {
      await action({ action: "updateApplicant", applicantId, ...editFields });
      setEditingApplicant(null);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Save failed");
    }
  }

  const pending = (data.appointments || []).filter((a: any) => String(a.status || "pending").toLowerCase() === "pending");
  const salesNavSummary = data.salesNavSummary || { stats: { totalUsed: 0, expiredSoFar: 0, activeNow: 0 }, expiringByVendor: [], vendorsDue: [] };

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
      {session.impersonatorEmail && (
        <div className="notice warn">
          Viewing as {session.name} — <button className="btn btn-outline" onClick={returnToGrowth}>Return to Growth</button>
        </div>
      )}
      {loadError && <div className="notice error">Operations data failed to load: {loadError}</div>}
      {message && <div className="notice success">{message}</div>}
      <section className="metric-grid">
        <div className="metric"><span>Pending Appts</span><strong>{pending.length}</strong></div>
        <div className="metric"><span>Sales Nav Active</span><strong>{salesNavSummary.stats.activeNow}</strong></div>
        <div className="metric"><span>Applicants</span><strong>{data.applicants?.length || 0}</strong></div>
        <div className="metric"><span>Clients</span><strong>{data.clients?.length || 0}</strong></div>
      </section>
      <div className="tabs">
        {["appointments", "salesnav", "pipeline", "clients"].map((name) => (
          <button key={name} className={`tab ${tab === name ? "active" : ""}`} onClick={() => setTab(name as any)}>{name}</button>
        ))}
      </div>

      {tab === "appointments" && (
        <>
          <section className="panel">
            <h2>Contact Search</h2>
            <div className="form-grid admin-create-grid">
              <input placeholder="Search by prospect name or LinkedIn URL (across Master DB + every recruiter's FU Tracker)" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              <button className="btn btn-primary" disabled={searching} onClick={runSearch}>Search</button>
            </div>
            {searchResults && (
              <div className="compact-list">
                {searchResults.length === 0 && <div className="muted">No matches.</div>}
                {searchResults.map((r, idx) => (
                  <div className="compact-row" key={`${r.li}-${idx}`}>
                    <strong>{r.name || "Contact"}</strong>
                    <span>{r.recruiter} | {r.status || r.type || ""} | {r.client || ""} | {r.source}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
          <section className="panel table-wrap">
            <h2>Appointment Review</h2>
            <table>
              <thead><tr><th>Invitee</th><th>Client</th><th>Recruiter</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {(data.appointments || []).map((a: any) => (
                  <tr key={a.id}>
                    <td>{a.invitee_name}<br /><span className="muted">{a.invitee_email}</span></td>
                    <td>{a.client_name}</td>
                    <td>{a.recruiter_name || "-"}</td>
                    <td>{a.status}</td>
                    <td>
                      <div className="actions">
                        <button className="btn btn-primary" onClick={() => action({ action: "processAppointment", id: a.id, recruiterEmail: a.recruiter_email, linkedinUrl: a.linkedin_url })}>Process</button>
                        <button className="btn btn-danger" onClick={() => {
                          const reason = window.prompt("Recall reason (required):");
                          if (!reason || !reason.trim()) return;
                          void action({ action: "recallAppointment", id: a.id, reason: reason.trim(), recruiterEmail: a.recruiter_email, linkedinUrl: a.linkedin_url });
                        }}>Recall</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}

      {tab === "salesnav" && (
        <>
          <section className="panel">
            <h2>Add Seat</h2>
            <div className="form-grid admin-create-grid">
              <input placeholder="Vendor" value={salesNav.vendor} onChange={(e) => setSalesNav({ ...salesNav, vendor: e.target.value })} />
              <input placeholder="Recruiter" value={salesNav.recruiterName} onChange={(e) => setSalesNav({ ...salesNav, recruiterName: e.target.value })} />
              <input placeholder="Email" value={salesNav.recruiterEmail} onChange={(e) => setSalesNav({ ...salesNav, recruiterEmail: e.target.value })} />
              <input placeholder="Price" value={salesNav.price} onChange={(e) => setSalesNav({ ...salesNav, price: e.target.value })} />
              <input placeholder="Sales Nav ID" value={salesNav.salesNavId} onChange={(e) => setSalesNav({ ...salesNav, salesNavId: e.target.value })} />
              <button className="btn btn-primary" onClick={() => action({ action: "addSalesNav", ...salesNav })}>Add Seat</button>
            </div>
          </section>

          <section className="metric-grid">
            <div className="metric"><span>Total Used</span><strong>{salesNavSummary.stats.totalUsed}</strong></div>
            <div className="metric"><span>Active Now</span><strong>{salesNavSummary.stats.activeNow}</strong></div>
            <div className="metric"><span>Expired So Far</span><strong>{salesNavSummary.stats.expiredSoFar}</strong></div>
          </section>

          <section className="panel">
            <div className="section-head"><h2>Vendor Payments Due</h2><span className="badge">Unpaid seats grouped by vendor</span></div>
            <div className="compact-list">
              {salesNavSummary.vendorsDue.length === 0 && <div className="muted">Nothing due.</div>}
              {salesNavSummary.vendorsDue.map((v: any) => (
                <div className="compact-row" key={v.vendor}>
                  <strong>{v.vendor}</strong>
                  <span>{v.count} seat(s) | ${v.total.toFixed(2)} due</span>
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="section-head"><h2>Expiring Soon (next 3 days)</h2><span className="badge">By vendor</span></div>
            <div className="compact-list">
              {salesNavSummary.expiringByVendor.length === 0 && <div className="muted">Nothing expiring soon.</div>}
              {salesNavSummary.expiringByVendor.map((group: any) => (
                <div key={group.vendor}>
                  <button type="button" className="compact-row compact-button" onClick={() => setExpandedVendor(expandedVendor === group.vendor ? null : group.vendor)}>
                    <strong>{group.vendor}</strong>
                    <span>{group.count} seat(s)</span>
                  </button>
                  {expandedVendor === group.vendor && (
                    <div className="compact-list" style={{ paddingLeft: 16 }}>
                      {group.entries.map((entry: any, idx: number) => (
                        <div className="compact-row" key={idx}>
                          <strong>{entry.recruiter_name || entry.sales_nav_id}</strong>
                          <span>{entry.daysLeft} day(s) left | expires {entry.toBeExpire}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {tab === "pipeline" && (
        <section className="panel">
          <h2>Recruiting Pipeline</h2>
          <div className="form-grid admin-create-grid">
            <input placeholder="Platform" value={applicant.platform} onChange={(e) => setApplicant({ ...applicant, platform: e.target.value })} />
            <input placeholder="Name" value={applicant.name} onChange={(e) => setApplicant({ ...applicant, name: e.target.value })} />
            <input placeholder="Email" value={applicant.email} onChange={(e) => setApplicant({ ...applicant, email: e.target.value })} />
            <input placeholder="Phone" value={applicant.phone} onChange={(e) => setApplicant({ ...applicant, phone: e.target.value })} />
            <input placeholder="LI Profile" value={applicant.liProfile} onChange={(e) => setApplicant({ ...applicant, liProfile: e.target.value })} />
            <button className="btn btn-primary" onClick={() => action({ action: "addApplicant", ...applicant })}>Log Applicant</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Status</th><th>Agent</th><th>Actions</th></tr></thead>
              <tbody>
                {(data.applicants || []).map((a: any) => (
                  <Fragment key={a.id}>
                    <tr>
                      <td>{a.name}<br /><span className="muted">{a.email}</span></td>
                      <td>
                        <select value={a.status || "Applied"} onChange={(e) => action({ action: "updateApplicantStatus", applicantId: a.id, status: e.target.value })}>
                          {APPLICANT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                      <td>{a.assigned_agent_name || "-"}</td>
                      <td>
                        <div className="actions">
                          <select onChange={(e) => action({ action: "assignAgent", applicantId: a.id, agentEmail: e.target.value })} defaultValue="">
                            <option value="">Assign</option>
                            {(data.agents || []).map((ag: any) => <option key={ag.email} value={ag.email}>{ag.name}</option>)}
                          </select>
                          <button className="btn btn-outline" onClick={() => startEditApplicant(a)}>Edit</button>
                        </div>
                      </td>
                    </tr>
                    {editingApplicant === a.id && (
                      <tr>
                        <td colSpan={4}>
                          <div className="form-grid admin-create-grid">
                            <input placeholder="Name" value={editFields.name} onChange={(e) => setEditFields({ ...editFields, name: e.target.value })} />
                            <input placeholder="Email" value={editFields.email} onChange={(e) => setEditFields({ ...editFields, email: e.target.value })} />
                            <input placeholder="Phone" value={editFields.phone} onChange={(e) => setEditFields({ ...editFields, phone: e.target.value })} />
                            <input placeholder="LI Profile" value={editFields.liProfile} onChange={(e) => setEditFields({ ...editFields, liProfile: e.target.value })} />
                            <input placeholder="Position" value={editFields.position} onChange={(e) => setEditFields({ ...editFields, position: e.target.value })} />
                            <input placeholder="Notes" value={editFields.notes} onChange={(e) => setEditFields({ ...editFields, notes: e.target.value })} />
                            <div className="actions">
                              <button className="btn btn-primary" onClick={() => saveApplicantEdit(a.id)}>Save</button>
                              <button className="btn btn-outline" onClick={() => setEditingApplicant(null)}>Cancel</button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "clients" && (
        <section className="panel table-wrap">
          <h2>Client Tracker</h2>
          <table>
            <thead><tr><th>Client</th><th>Status</th><th>Quota</th><th>Cycle</th><th>Action</th></tr></thead>
            <tbody>
              {(data.clients || []).map((c: any) => (
                <tr key={c.id}>
                  <td>{c.campaign_name || c.clients?.name}</td>
                  <td>{c.campaign_status}</td>
                  <td>{c.quota}</td>
                  <td>{c.cycle}</td>
                  <td>
                    <div className="actions">
                      <button className="btn btn-outline" onClick={() => action({ action: "updateClientStatus", campaignId: c.id, status: "Paused", pausedReason: "Ops update" })}>Pause</button>
                      <button className="btn btn-primary" onClick={() => action({ action: "updateClientStatus", campaignId: c.id, status: "Active" })}>Active</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
