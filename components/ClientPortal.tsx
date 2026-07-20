"use client";

import { useMemo, useState } from "react";

export default function ClientPortal({ session, initial }: { session: { name: string; email: string }; initial: any }) {
  const [data, setData] = useState(initial);
  const [tab, setTab] = useState<"dashboard" | "leads">("dashboard");
  const [q, setQ] = useState("");

  async function reload() {
    const res = await fetch("/api/client");
    setData(await res.json());
  }

  const leads = useMemo(() => {
    const query = q.toLowerCase().trim();
    return (data.leads || []).filter((lead: any) => !query || [lead.contact_name, lead.contact_email, lead.company, lead.linkedin_url, lead.location, lead.state].some((v) => String(v || "").toLowerCase().includes(query)));
  }, [data, q]);

  function exportCSV() {
    const headers = ["Date", "Name", "Email", "Company", "Title", "LinkedIn", "Location", "State", "Recruiter"];
    const rows = leads.map((l: any) => [l.date_created, l.contact_name, l.contact_email, l.company, l.title, l.linkedin_url, l.location, l.state, l.recruiter_name]);
    const csv = [headers, ...rows].map((row: any[]) => row.map((v: any) => `"${String(v || "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "franbooking-leads.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="app-shell wide">
      <div className="topbar"><div className="topbar-title"><div className="brand">Franbooking</div><h1>Client Portal</h1><div className="muted">{session.name} | {session.email}</div></div><button className="btn btn-outline" onClick={reload}>Refresh</button></div>
      <div className="tabs"><button className={`tab ${tab === "dashboard" ? "active" : ""}`} onClick={() => setTab("dashboard")}>Dashboard</button><button className={`tab ${tab === "leads" ? "active" : ""}`} onClick={() => setTab("leads")}>Leads</button></div>
      {tab === "dashboard" && <><section className="metric-grid"><div className="metric"><span>Campaign</span><strong>{data.stats?.campaignName || "-"}</strong></div><div className="metric"><span>Total Appts</span><strong>{data.stats?.totalAppts || 0}</strong></div><div className="metric"><span>Last 7</span><strong>{data.stats?.last7 || 0}</strong></div><div className="metric"><span>CA/NY</span><strong>{data.stats?.canyPct || 0}%</strong></div></section><section className="grid two"><div className="panel"><h2>Growth</h2><div className="compact-list">{(data.growth || []).slice(-14).map((r: any) => <div className="compact-row" key={r.date}><strong>{r.date}</strong><span>{r.count}</span></div>)}</div></div><div className="panel"><h2>States</h2><div className="compact-list">{(data.states || []).slice(0, 12).map((r: any) => <div className="compact-row" key={r.state}><strong>{r.state}</strong><span>{r.count}</span></div>)}</div></div></section></>}
      {tab === "leads" && <section className="panel"><div className="section-head"><h2>Leads</h2><button className="btn btn-outline" onClick={exportCSV}>Export CSV</button></div><input placeholder="Search leads" value={q} onChange={(e) => setQ(e.target.value)} /><div className="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Company</th><th>Location</th><th>Recruiter</th></tr></thead><tbody>{leads.map((l: any) => <tr key={l.id}><td>{l.contact_name}<br />{l.linkedin_url && <a href={l.linkedin_url} target="_blank">LinkedIn</a>}</td><td>{l.contact_email}</td><td>{l.company}<br /><span className="muted">{l.title}</span></td><td>{l.location || l.state}</td><td>{l.recruiter_name}</td></tr>)}</tbody></table></div></section>}
    </main>
  );
}
