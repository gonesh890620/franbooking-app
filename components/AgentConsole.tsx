"use client";

import { useEffect, useMemo, useState } from "react";
import { firstName, scriptText } from "@/lib/agentScripts";

type Answers = Record<string, string>;

function ScriptBlock({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard API unavailable — nothing more we can do here.
    }
  }
  return (
    <div className="compact-row" style={{ flexDirection: "column", alignItems: "flex-start" }}>
      <strong>{label}</strong>
      <div className="reply-box" style={{ whiteSpace: "pre-wrap" }}>{text}</div>
      <button type="button" className="btn btn-outline" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
    </div>
  );
}

export default function AgentConsole({ session, initial, loadError }: { session: { name: string; email: string }; initial: any; loadError?: string }) {
  const [data, setData] = useState(initial);
  const [selectedId, setSelectedId] = useState<string>(initial.applicants?.[0]?.id || "");
  const [message, setMessage] = useState("");
  const [lang, setLang] = useState<"en" | "ph">("en");
  const selected = useMemo(() => (data.applicants || []).find((a: any) => a.id === selectedId), [data, selectedId]);
  const savedLog = useMemo(() => (data.logs || []).find((l: any) => l.applicant_id === selectedId) || {}, [data, selectedId]);
  const [answers, setAnswers] = useState<Answers>({});
  const [notes, setNotes] = useState("");

  useEffect(() => {
    setAnswers(savedLog.answers || {});
    setNotes(savedLog.notes || "");
  }, [selectedId, savedLog]);

  async function reload() {
    const res = await fetch("/api/agent");
    setData(await res.json());
  }

  async function action(body: Record<string, unknown>) {
    const res = await fetch("/api/agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await res.json();
    if (!res.ok || payload.error) throw new Error(payload.error || "Agent action failed");
    return payload;
  }

  function set(key: string, value: string) {
    setAnswers((a) => ({ ...a, [key]: value }));
  }

  async function save() {
    if (!selected) return;
    try {
      await action({ action: "saveLog", applicantId: selected.id, checklist: {}, answers, notes });
      setMessage("Saved.");
      await reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Save failed");
    }
  }

  async function markHired() {
    if (!selected) return;
    try {
      await action({ action: "markHired", applicantId: selected.id });
      setMessage("Marked hired.");
      await reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Action failed");
    }
  }

  const applicantFirstName = selected ? firstName(selected.name) : "";
  const script = (key: string) => scriptText(lang, key, { name: applicantFirstName, agent: session.name });

  const outcome = answers.callOutcome || "Pending";
  const interested = outcome === "Interested";
  const liCheckResult = answers.liCheckResult || "Pending";

  return (
    <main className="app-shell wide">
      <div className="topbar">
        <div className="topbar-title">
          <div className="brand">Franbooking</div>
          <h1>Agent Panel</h1>
          <div className="muted">{session.name} | {session.email}</div>
        </div>
        <button className="btn btn-outline" onClick={reload}>Refresh</button>
      </div>
      {loadError && <div className="notice error">Agent data failed to load: {loadError}</div>}
      {message && <div className="notice success">{message}</div>}

      <section className="grid two">
        <div className="panel">
          <h2>My Applicants</h2>
          <div className="compact-list">
            {(data.applicants || []).map((a: any) => (
              <button key={a.id} className="compact-row compact-button" onClick={() => { setSelectedId(a.id); setMessage(""); }}>
                <strong>{a.name}</strong>
                <span>{a.status} | {a.platform}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="section-head">
            <h2>{selected?.name || "Applicant"}</h2>
            <div className="tabs">
              <button className={`tab ${lang === "en" ? "active" : ""}`} onClick={() => setLang("en")}>EN</button>
              <button className={`tab ${lang === "ph" ? "active" : ""}`} onClick={() => setLang("ph")}>PH</button>
            </div>
          </div>

          {!selected && <p className="muted">No applicant selected.</p>}

          {selected && (
            <div className="form-grid">
              <label>LinkedIn Profile<input defaultValue={selected.linkedin_url || ""} onBlur={(e) => action({ action: "updateApplicantLink", applicantId: selected.id, liProfile: e.target.value }).then(reload)} /></label>

              <div className="panel">
                <div className="task-name">Step 1 — Create Group</div>
                <div className="reply-box">{script("groupInstruction")}</div>
                <label><span><input type="checkbox" checked={answers.groupCreated === "Yes"} onChange={(e) => set("groupCreated", e.target.checked ? "Yes" : "")} /> Group Created</span></label>
              </div>

              <div className="panel">
                <div className="task-name">Step 2 — Thank You &amp; Schedule the Call</div>
                <ScriptBlock label="Message to send" text={script("thankYouAvailability")} />
                <label><span><input type="checkbox" checked={answers.thankYouSent === "Yes"} onChange={(e) => set("thankYouSent", e.target.checked ? "Yes" : "")} /> Thank You Sent</span></label>
                <label><span><input type="checkbox" checked={answers.availabilityAsked === "Yes"} onChange={(e) => set("availabilityAsked", e.target.checked ? "Yes" : "")} /> Availability Asked</span></label>
                <label>Call Mode
                  <span className="actions" style={{ display: "inline-flex", marginLeft: 8 }}>
                    <button type="button" className={`btn ${answers.callMode !== "Instant" ? "btn-primary" : "btn-outline"}`} onClick={() => set("callMode", "Scheduled")}>Scheduled</button>
                    <button type="button" className={`btn ${answers.callMode === "Instant" ? "btn-primary" : "btn-outline"}`} onClick={() => set("callMode", "Instant")}>Starting Now</button>
                  </span>
                </label>
                {answers.callMode !== "Instant" && (
                  <label>Scheduled Date/Time<input type="datetime-local" value={answers.scheduledAt || ""} onChange={(e) => set("scheduledAt", e.target.value)} /></label>
                )}
              </div>

              <div className="panel">
                <div className="task-name">Step 3 — Run the Call</div>
                <ScriptBlock label="Opening" text={script("intro")} />
                <ScriptBlock label="If asked — Company" text={script("company")} />
                <ScriptBlock label="If asked — Earning &amp; Payment" text={script("earning")} />
                <ScriptBlock label="If asked — Trust" text={script("trust")} />
                <ScriptBlock label="Transition" text={script("transition")} />
                <ScriptBlock label="Q1 — LinkedIn concern" text={script("liConcernQ")} />
                <ScriptBlock label="If worried about restriction" text={script("liConcernReassure")} />
                <ScriptBlock label="If no issue — Connections" text={script("connectionsQ")} />
                <ScriptBlock label="Profile Update instruction" text={script("profileUpdate")} />
                <ScriptBlock label="Q — Other project?" text={script("qOtherProject")} />
                <ScriptBlock label="Q — Handle sends &amp; nurturing?" text={script("qHandleSends")} />
                <ScriptBlock label="Q — Work type" text={script("qWorkType")} />
                <ScriptBlock label="Q — Best working time" text={script("qBestTime")} />
                <label><span><input type="checkbox" checked={answers.callCompleted === "Yes"} onChange={(e) => set("callCompleted", e.target.checked ? "Yes" : "")} /> Call Completed</span></label>
              </div>

              <div className="panel">
                <div className="task-name">Step 4 — Pre-Screening Answers</div>
                <label>LI Restriction Concern?<select value={answers.liRestrictionConcern || ""} onChange={(e) => set("liRestrictionConcern", e.target.value)}><option value=""></option><option>Yes</option><option>No</option></select></label>
                <label>Connections<input type="number" min={0} value={answers.connectionsCount || ""} onChange={(e) => set("connectionsCount", e.target.value)} /></label>
                <label><span><input type="checkbox" checked={answers.profileUpdated === "Yes"} onChange={(e) => set("profileUpdated", e.target.checked ? "Yes" : "")} /> Profile &amp; Banner Updated</span></label>
                <label>Working Other Project?<select value={answers.workingOtherProject || ""} onChange={(e) => set("workingOtherProject", e.target.value)}><option value=""></option><option>Yes</option><option>No</option></select></label>
                <label>Handle Sends &amp; Nurturing?<select value={answers.handleSendsNurturing || ""} onChange={(e) => set("handleSendsNurturing", e.target.value)}><option value=""></option><option>Yes</option><option>No</option></select></label>
                <label>Work Type<select value={answers.workType || ""} onChange={(e) => set("workType", e.target.value)}><option value=""></option><option>Full Time</option><option>Part Time</option></select></label>
                <label>Best Working Time<input placeholder="e.g. 9am-5pm EST" value={answers.bestWorkingTime || ""} onChange={(e) => set("bestWorkingTime", e.target.value)} /></label>
              </div>

              <div className="panel">
                <div className="task-name">Step 5 — Outcome</div>
                <label>Call Outcome<select value={outcome} onChange={(e) => set("callOutcome", e.target.value)}><option>Pending</option><option>Interested</option><option>Not Interested</option></select></label>
                {interested && <div className="notice success">Interested — continue with the Onboarding step below.</div>}
                {outcome === "Not Interested" && <div className="notice warn">Marked Not Interested — no further action needed.</div>}
                <label>Notes<textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
              </div>

              {interested && (
                <div className="panel">
                  <div className="task-name">Step 6 — Onboarding</div>
                  <label>LI Profile Updated Correctly?<select value={liCheckResult} onChange={(e) => set("liCheckResult", e.target.value)}><option>Pending</option><option>Passed</option><option>Failed</option></select></label>
                  {liCheckResult === "Failed" && <div className="notice error">LI check failed — this applicant should be marked Disqualified. No further onboarding needed.</div>}
                  {liCheckResult !== "Passed" && liCheckResult !== "Failed" && <div className="notice warn">Re-check the LI profile/banner update before continuing.</div>}
                  {liCheckResult === "Passed" && (
                    <>
                      <ScriptBlock label="Send SOP" text={script("sopMessage")} />
                      <label><span><input type="checkbox" checked={answers.sopSent === "Yes"} onChange={(e) => set("sopSent", e.target.checked ? "Yes" : "")} /> SOP Sent</span></label>
                      <ScriptBlock label="Ask for LI Email" text={script("onboardLiEmailAsk")} />
                      <label>LI-Linked Email<input type="email" value={answers.onboardLiEmail || ""} onChange={(e) => set("onboardLiEmail", e.target.value)} /></label>
                      <div className="reply-box">{script("notifyGoneshInstruction")}</div>
                      <label><span><input type="checkbox" checked={answers.notifiedGonesh === "Yes"} onChange={(e) => set("notifiedGonesh", e.target.checked ? "Yes" : "")} /> Notified Gonesh Roy</span></label>
                      <ScriptBlock label="Invite to Zoom" text={script("zoomInvite")} />
                      <label><span><input type="checkbox" checked={answers.zoomDone === "Yes"} onChange={(e) => set("zoomDone", e.target.checked ? "Yes" : "")} /> Zoom Intro Done</span></label>
                      <ScriptBlock label="On the call — confirm sends" text={script("confirmSendsInstruction")} />
                      <label>InMail Sends<input type="number" min={0} value={answers.inMailSends || ""} onChange={(e) => set("inMailSends", e.target.value)} /></label>
                      <label>Invite Sends<input type="number" min={0} value={answers.inviteSends || ""} onChange={(e) => set("inviteSends", e.target.value)} /></label>
                      <label>Nurture Sends<input type="number" min={0} value={answers.nurtureSends || ""} onChange={(e) => set("nurtureSends", e.target.value)} /></label>
                      <label><span><input type="checkbox" checked={answers.sendsVerified === "Yes"} onChange={(e) => set("sendsVerified", e.target.checked ? "Yes" : "")} /> Sends Verified</span></label>
                      {answers.sendsVerified === "Yes" && (
                        selected.status === "Hired"
                          ? <div className="notice success">Hired!</div>
                          : <button type="button" className="btn btn-primary" onClick={markHired}>Mark Hired</button>
                      )}
                    </>
                  )}
                </div>
              )}

              <div className="actions">
                <button className="btn btn-primary" onClick={save}>Save Checklist</button>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
