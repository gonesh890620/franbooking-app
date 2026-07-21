"use client";

import { useMemo, useState } from "react";
import BodyClass from "./BodyClass";
import { AppHeader, Badge, BarChart, Card, DataTable, EmptyRow, Field, Msg, StatGrid, Tabs } from "./ui";

export default function ClientPortal({ session, initial, loadError }: { session: { name: string; email: string }; initial: any; loadError?: string }) {
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
    <>
      <BodyClass names="full-page wide-page" />

      <AppHeader logo="📈 Client Portal" user={`${session.name} | ${session.email}`}>
        <button className="btn btn-ghost btn-sm" onClick={reload}>
          ↻ Refresh
        </button>
      </AppHeader>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "dashboard", label: "📊 Dashboard" },
          { key: "leads", label: "👤 Leads" }
        ]}
      />

      <div className="screen-content">
        {loadError ? <Msg kind="error">Client data failed to load: {loadError}</Msg> : null}

        {tab === "dashboard" ? (
          <>
            <StatGrid
              stats={[
                { label: "Campaign", value: data.stats?.campaignName || "-", tone: "purple" },
                { label: "Total Appts", value: data.stats?.totalAppts || 0, tone: "green" },
                { label: "Last 7 Days", value: data.stats?.last7 || 0, tone: "blue" },
                { label: "CA/NY", value: `${data.stats?.canyPct || 0}%`, tone: "amber" }
              ]}
            />
            <Card title="Growth (last 14 days)">
              <BarChart rows={(data.growth || []).slice(-14)} labelKey="date" valueKey="count" />
            </Card>
            <Card title="States">
              <BarChart rows={(data.states || []).slice(0, 12)} labelKey="state" valueKey="count" />
            </Card>
          </>
        ) : null}

        {tab === "leads" ? (
          <Card
            title="Leads"
            actions={
              <>
                <Badge tone="gray">{leads.length} shown</Badge>
                <button className="btn btn-outline btn-sm" onClick={exportCSV}>
                  ⬇ Export CSV
                </button>
              </>
            }
          >
            <div className="row-auto">
              <Field label="Search">
                <input placeholder="Name, email, company, location…" value={q} onChange={(e) => setQ(e.target.value)} />
              </Field>
              <Field label="Cycle">
                <select value={cycle} onChange={(e) => setCycle(e.target.value)}>
                  <option value="">All Cycles</option>
                  {(data.cycles || []).map((c: string) => (
                    <option key={c} value={c}>
                      {c === "current" ? "Current Cycle" : `Cycle ${c}`}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="From">
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </Field>
              <Field label="To">
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </Field>
            </div>
            <button className="btn btn-ghost btn-sm mb-8" onClick={clearFilters}>
              Clear Filters
            </button>

            <DataTable
              head={[
                { label: "Name" },
                { label: "Email" },
                { label: "Company" },
                { label: "Location" },
                { label: "Recruiter" },
                { label: "Tags" }
              ]}
            >
              {!leads.length ? (
                <EmptyRow colSpan={6}>No leads match these filters.</EmptyRow>
              ) : (
                leads.map((l: any) => (
                  <tr key={l.id}>
                    <td>
                      {l.contact_name}
                      {l.cycle && l.cycle !== "current" ? <Badge tone="gray">Cycle {l.cycle}</Badge> : null}
                      {l.linkedin_url ? (
                        <>
                          <br />
                          <a href={l.linkedin_url} target="_blank" rel="noreferrer">
                            LinkedIn
                          </a>
                        </>
                      ) : null}
                    </td>
                    <td>{l.contact_email}</td>
                    <td>
                      {l.company}
                      <br />
                      <span className="text-muted">{l.title}</span>
                    </td>
                    <td>{l.location || l.state}</td>
                    <td>{l.recruiter_name}</td>
                    <td>
                      {l.client_feedback ? <Badge tone="green">{l.client_feedback}</Badge> : null}
                      {l.recall && String(l.recall).toLowerCase() !== "no" ? <Badge tone="red">Recall</Badge> : null}
                    </td>
                  </tr>
                ))
              )}
            </DataTable>
          </Card>
        ) : null}
      </div>
    </>
  );
}
