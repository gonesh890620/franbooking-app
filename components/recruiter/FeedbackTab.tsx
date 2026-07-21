"use client";

import { useState } from "react";
import { Message, toolPost, TypeToggle, useMsg } from "./shared";

export default function FeedbackTab() {
  return (
    <>
      <LeaveCard />
      <FeedbackCard />
    </>
  );
}

function LeaveCard() {
  const [leaveDate, setLeaveDate] = useState("");
  const [duration, setDuration] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const { msg, show, hide } = useMsg();

  async function submit() {
    if (!leaveDate) {
      show("Pick a leave date first.", "error");
      return;
    }
    setBusy(true);
    hide();
    try {
      await toolPost("submitLeave", { leaveDate, duration: duration || "1", reason });
      show("✓ Leave submitted.", "success");
      setLeaveDate("");
      setDuration("");
      setReason("");
    } catch (e) {
      show(e instanceof Error ? e.message : "Could not submit leave.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>🏖️ Leave Status</div>
      <p className="text-muted" style={{ marginBottom: 10 }}>
        Let the team know about upcoming time off.
      </p>

      <div className="form-row">
        <label>Next Leave Date</label>
        <input type="date" value={leaveDate} onChange={(e) => setLeaveDate(e.target.value)} />
      </div>
      <div className="form-row">
        <label>Duration (days)</label>
        <input
          type="number"
          min={1}
          value={duration}
          placeholder="e.g. 3"
          onChange={(e) => setDuration(e.target.value)}
        />
      </div>
      <div className="form-row">
        <label>Reason (optional)</label>
        <textarea value={reason} placeholder="Optional" onChange={(e) => setReason(e.target.value)} />
      </div>

      <button className="btn btn-primary btn-full" disabled={busy} onClick={() => void submit()}>
        {busy ? "Submitting…" : "Submit Leave"}
      </button>
      <Message msg={msg} />
    </div>
  );
}

function FeedbackCard() {
  const [salesNavAll, setSalesNavAll] = useState<"Yes" | "No">("Yes");
  const [salesNavNoCount, setSalesNavNoCount] = useState("");
  const [salesNavNoReason, setSalesNavNoReason] = useState("");
  const [unusual, setUnusual] = useState("");
  const [responsesToday, setResponsesToday] = useState("");
  const [comments, setComments] = useState("");
  const [busy, setBusy] = useState(false);
  const { msg, show, hide } = useMsg();

  async function submit() {
    setBusy(true);
    hide();
    try {
      await toolPost("submitFeedback", {
        salesNavAll: salesNavAll === "Yes",
        salesNavNoCount,
        salesNavNoReason,
        unusual,
        responsesToday,
        comments
      });
      show("✓ Feedback submitted.", "success");
      setSalesNavNoCount("");
      setSalesNavNoReason("");
      setUnusual("");
      setResponsesToday("");
      setComments("");
      setSalesNavAll("Yes");
    } catch (e) {
      show(e instanceof Error ? e.message : "Could not submit feedback.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>📝 Daily Feedback</div>

      <div className="form-row">
        <label>Are you able to send using all Sales Nav accounts?</label>
        <TypeToggle<"Yes" | "No">
          value={salesNavAll}
          onChange={setSalesNavAll}
          options={[
            { value: "Yes", label: "Yes" },
            { value: "No", label: "No" }
          ]}
        />
      </div>

      {/* Follow-ups only matter when something is actually blocked. */}
      {salesNavAll === "No" ? (
        <>
          <div className="form-row">
            <label>How many are you unable to send from?</label>
            <input
              type="number"
              min={0}
              value={salesNavNoCount}
              placeholder="e.g. 2"
              onChange={(e) => setSalesNavNoCount(e.target.value)}
            />
          </div>
          <div className="form-row">
            <label>What&apos;s the core reason?</label>
            <textarea
              value={salesNavNoReason}
              placeholder="e.g. account restricted, login issue…"
              onChange={(e) => setSalesNavNoReason(e.target.value)}
            />
          </div>
        </>
      ) : null}

      <div className="form-row">
        <label>Do you see any unusual thing?</label>
        <textarea value={unusual} placeholder="Optional" onChange={(e) => setUnusual(e.target.value)} />
      </div>
      <div className="form-row">
        <label>How many responses have you received today so far?</label>
        <input
          type="number"
          min={0}
          value={responsesToday}
          placeholder="e.g. 5"
          onChange={(e) => setResponsesToday(e.target.value)}
        />
      </div>
      <div className="form-row">
        <label>Additional comments</label>
        <textarea value={comments} placeholder="Optional" onChange={(e) => setComments(e.target.value)} />
      </div>

      <button className="btn btn-primary btn-full" disabled={busy} onClick={() => void submit()}>
        {busy ? "Submitting…" : "Submit Feedback"}
      </button>
      <Message msg={msg} />
    </div>
  );
}
