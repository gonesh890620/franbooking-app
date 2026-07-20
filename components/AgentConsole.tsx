"use client";

import { useMemo, useState } from "react";

const CHECKS = [
  "Group Created",
  "Thank You Sent",
  "Availability Asked",
  "Call Scheduled",
  "Call Completed",
  "Profile Updated",
  "SOP Sent",
  "Zoom Done",
  "Sends Verified"
];

export default function AgentConsole({ session, initial }: { session: { name: string; email: string }; initial: any }) {
  const [data, setData] = useState(initial);
  const [selectedId, setSelectedId] = useState<string>(initial.applicants?.[0]?.id || "");
  const [message, setMessage] = useState("");
  const selected = useMemo(() => (data.applicants || []).find((a: any) => a.id === selectedId), [data, selectedId]);
  const log = useMemo(() => (data.logs || []).find((l: any) => l.applicant_id === selectedId) || {}, [data, selectedId]);
  const [draft, setDraft] = useState<any>({});

  async function reload() {
    const res = await fetch("/api/agent");
    setData(await res.json());
  }

  async function action(body: Record<string, unknown>) {
    const res = await fetch("/api/agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await res.json();
    if (!res.ok || payload.error) throw new Error(payload.error || "Agent action failed");
    setMessage("Saved.");
    await reload();
  }

  const checklist = { ...(log.checklist || {}), ...(draft.checklist || {}) };

  return (
    <main className="app-shell wide">
      <div className="topbar"><div className="topbar-title"><div className="brand">Franbooking</div><h1>Agent Panel</h1><div className="muted">{session.name} | {session.email}</div></div><button className="btn btn-outline" onClick={reload}>Refresh</button></div>
      {message && <div className="notice success">{message}</div>}
      <section className="grid two">
        <div className="panel">
          <h2>My Applicants</h2>
          <div className="compact-list">
            {(data.applicants || []).map((a: any) => <button key={a.id} className="compact-row compact-button" onClick={() => { setSelectedId(a.id); setDraft({}); }}><strong>{a.name}</strong><span>{a.status} | {a.platform}</span></button>)}
          </div>
        </div>
        <div className="panel">
          <h2>{selected?.name || "Applicant"}</h2>
          {selected ? <div className="form-grid">
            <label>LinkedIn Profile<input defaultValue={selected.linkedin_url || ""} onBlur={(e) => action({ action: "updateApplicantLink", applicantId: selected.id, liProfile: e.target.value })} /></label>
            <div className="compact-list">
              {CHECKS.map((label) => <label key={label}><span><input type="checkbox" checked={Boolean(checklist[label])} onChange={(e) => setDraft((d: any) => ({ ...d, checklist: { ...(d.checklist || {}), [label]: e.target.checked ? new Date().toISOString().slice(0, 10) : "" } }))} /> {label}</span></label>)}
            </div>
            <label>Call Outcome<input defaultValue={log.answers?.callOutcome || ""} onChange={(e) => setDraft((d: any) => ({ ...d, answers: { ...(d.answers || {}), callOutcome: e.target.value } }))} /></label>
            <label>Notes<textarea defaultValue={log.notes || ""} onChange={(e) => setDraft((d: any) => ({ ...d, notes: e.target.value }))} /></label>
            <div className="actions"><button className="btn btn-primary" onClick={() => action({ action: "saveLog", applicantId: selected.id, checklist, answers: { ...(log.answers || {}), ...(draft.answers || {}) }, notes: draft.notes ?? log.notes ?? "" })}>Save Checklist</button><button className="btn btn-outline" onClick={() => action({ action: "markHired", applicantId: selected.id })}>Mark Hired</button></div>
          </div> : <p className="muted">No applicant selected.</p>}
        </div>
      </section>
    </main>
  );
}
