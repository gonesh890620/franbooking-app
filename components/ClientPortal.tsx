"use client";

import { useMemo, useState } from "react";

function BarChart({ rows, labelKey, valueKey }: { rows: Array<Record<string, any>>; labelKey: string; valueKey: string }) {
  const max = Math.max(1, ...rows.map((r) => Number(r[valueKey]) || 0));
  return (
    <div className="compact-list">
      {rows.map((r) => (
        <div className="compact-row" key={r[labelKey]}>
          <strong style={{ minWidth: 90, display: "inline-block" }}>{r[labelKey]}</strong>
          <span style={{ flex: 1, display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span style={{ background: "var(--accent, #6c2eb9)", opacity: 0.75, height: 10, borderRadius: 6, width: `${Math.max(4, (Number(r[valueKey]) / max) * 100)}%` }} />
            <span>{r[valueKey]}</span>
          </span>
        </div>
      ))}
      {rows.length === 0 && <div className="muted">No data yet.</div>}
    </div>
  );
}

export default function ClientPortal({ session, initial }: { session: { name: string; email: string }; initial: any }) {
  const [data, setData] = useState(initial);
  const [tab, setTab] = useState<"dashboard" | "leads">("dashboard");
  const [q, setQ] = useState("");
  const [cycle, setCycle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  async function reload() {
    const res = await fetch("/api/client");
    setData(await res.json());
  }

  const leads = useMemo(() => {
    const query = q.toLowerCase().trim();
    return (data.leads || []).filter((lead: any) => {
      if (query && ![lead.contact_name, lead.contact_email, lead.company, lead.linkedin_url, lead.location, lead.state].some((v) => String(v || "").toLowerCase().includes(query))) return false;
      if (cycle && String(lead.cycle || "current") !== cycle) return false;
      const date = String(lead.date_created || "").slice(0, 10);
      if (startDate && date && date < startDate) return false;
      if (endDate && date && date > endDate) return false;
      return true;
    });
  }, [data, q, cycle, startDate, endDate]);

  function exportCSV() {
    const headers = ["Cycle", "Date", "Name", "Email", "Company", "Title", "LinkedIn", "Location", "State", "Recruiter", "Feedback", "Recall"];
    const rows = leads.map((l: any) => [l.cycle, l.date_created, l.contact_name, l.contact_email, l.company, l.title, l.linkedin_url, l.location, l.state, l.recruiter_name, l.client_feedback, l.recall]);
    const csv = [headers, ...rows].map((row: any[]) => row.map((v: any) => `"${String(v || "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "franbooking-leads.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function clearFilters() {
    setQ("");
    setCycle("");
    setStartDate("");
    setEndDate("");
  }

  return (
    <main className="app-shell wide">
      <div className="topbar">
        <div className="topbar-title">
          <div className="brand">Franbooking</div>
          <h1>Client Portal</h1>
          <div className="muted">{session.name} | {session.email}</div>
        </div>
        <button className="btn btn-outline" onClick={reload}>Refresh</button>
      </div>
      <div className="tabs">
        <button className={`tab ${tab === "dashboard" ? "active" : ""}`} onClick={() => setTab("dashboard")}>Dashboard</button>
        <button className={`tab ${tab === "leads" ? "active" : ""}`} onClick={() => setTab("leads")}>Leads</button>
      </div>

      {tab === "dashboard" && (
        <>
          <section className="metric-grid">
            <div className="metric"><span>Campaign</span><strong>{data.stats?.campaignName || "-"}</strong></div>
            <div className="metric"><span>Total Appts</span><strong>{data.stats?.totalAppts || 0}</strong></div>
            <div className="metric"><span>Last 7</span><strong>{data.stats?.last7 || 0}</strong></div>
            <div className="metric"><span>CA/NY</span><strong>{data.stats?.canyPct || 0}%</strong></div>
          </section>
          <section className="grid two">
            <div className="panel">
              <h2>Growth (last 14 days)</h2>
              <BarChart rows={(data.growth || []).slice(-14)} labelKey="date" valueKey="count" />
            </div>
            <div className="panel">
              <h2>States</h2>
              <BarChart rows={(data.states || []).slice(0, 12)} labelKey="state" valueKey="count" />
            </div>
          </section>
        </>
      )}

      {tab === "leads" && (
        <section className="panel">
          <div className="section-head">
            <h2>Leads</h2>
            <button className="btn btn-outline" onClick={exportCSV}>Export CSV</button>
          </div>
          <div className="form-grid admin-create-grid">
            <input placeholder="Search leads" value={q} onChange={(e) => setQ(e.target.value)} />
            <select value={cycle} onChange={(e) => setCycle(e.target.value)}>
              <option value="">All Cycles</option>
              {(data.cycles || []).map((c: string) => <option key={c} value={c}>{c === "current" ? "Current Cycle" : `Cycle ${c}`}</option>)}
            </select>
            <label>From<input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
            <label>To<input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>
            <button className="btn btn-outline" onClick={clearFilters}>Clear Filters</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Email</th><th>Company</th><th>Location</th><th>Recruiter</th><th>Tags</th></tr></thead>
              <tbody>
                {leads.map((l: any) => (
                  <tr key={l.id}>
                    <td>
                      {l.contact_name}
                      {l.cycle && l.cycle !== "current" && <span className="badge" style={{ marginLeft: 6 }}>Cycle {l.cycle}</span>}
                      <br />
                      {l.linkedin_url && <a href={l.linkedin_url} target="_blank">LinkedIn</a>}
                    </td>
                    <td>{l.contact_email}</td>
                    <td>{l.company}<br /><span className="muted">{l.title}</span></td>
                    <td>{l.location || l.state}</td>
                    <td>{l.recruiter_name}</td>
                    <td>
                      {l.client_feedback && <span className="badge">{l.client_feedback}</span>}
                      {l.recall && String(l.recall).toLowerCase() !== "no" && <span className="badge" style={{ marginLeft: 4 }}>Recall</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
