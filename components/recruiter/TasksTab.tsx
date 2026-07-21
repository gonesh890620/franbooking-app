"use client";

import { useMemo, useState } from "react";
import {
  api,
  ClientAssignment,
  copyText,
  Message,
  Msg,
  ReplyBox,
  Task,
  toast,
  tool
} from "./shared";
import { deriveName, SALES_NAV_REMOVE_REPLY, subCal, subName } from "@/lib/recruiterCopy";

type CopySource = "template" | "ai" | "custom" | "salesnavremove";

type CardState = {
  open: boolean;
  text: string;
  source: CopySource | "";
  msg: Msg;
  busy: string;
};

const EMPTY_CARD: CardState = { open: false, text: "", source: "", msg: null, busy: "" };

export default function TasksTab({
  tasks,
  reviewTasks,
  canyMax,
  clients,
  loadError,
  onRefresh,
  onTaskDone,
  calendarUrlFor
}: {
  tasks: Task[];
  reviewTasks: Task[];
  canyMax: number;
  clients: ClientAssignment[];
  loadError: string;
  onRefresh: () => void;
  onTaskDone: (view: "today" | "review", index: number) => void;
  calendarUrlFor: (client: string) => string;
}) {
  const [view, setView] = useState<"today" | "review">("today");
  const [cards, setCards] = useState<Record<string, CardState>>({});

  const list = view === "review" ? reviewTasks : tasks;
  const todayCount = tasks.length;
  const reviewCount = reviewTasks.length;

  const pausedClients = useMemo(
    () => new Set(clients.filter((c) => /paused/i.test(c.status || "")).map((c) => c.name)),
    [clients]
  );

  function key(index: number) {
    return `${view}-${index}`;
  }
  function card(index: number) {
    return cards[key(index)] || EMPTY_CARD;
  }
  function patch(index: number, next: Partial<CardState>) {
    setCards((prev) => ({ ...prev, [key(index)]: { ...(prev[key(index)] || EMPTY_CARD), ...next } }));
  }

  /**
   * A paused client means the recruiter should not be sending copy for them
   * at all. GAS surfaced this as an explicit business rule because it
   * otherwise looked like a flaky server error.
   */
  function blockedByPause(index: number, task: Task) {
    if (!pausedClients.has(task.client)) return false;
    patch(index, {
      open: true,
      text: "",
      msg: {
        kind: "error",
        text: `⏸ ${task.client || "This client"} is currently paused. Wait for it to reactivate, or use Client Rotation on the Nurture tab instead.`
      }
    });
    return true;
  }

  function finish(index: number, task: Task, text: string, source: CopySource) {
    patch(index, {
      open: true,
      source,
      busy: "",
      msg: null,
      text: subCal(subName(text, deriveName(task)), calendarUrlFor(task.client))
    });
  }

  async function loadTemplate(index: number, task: Task) {
    if (blockedByPause(index, task)) return;
    patch(index, { open: true, busy: "template", msg: null });
    try {
      const data = await tool<{ body?: string }>("nurtureTpl", {
        nType: task.nurtureType,
        client: task.client || ""
      });
      finish(index, task, data.body || "", "template");
    } catch (e) {
      patch(index, { busy: "", msg: { kind: "error", text: e instanceof Error ? e.message : "Template failed." } });
    }
  }

  async function generateAi(index: number, task: Task) {
    if (blockedByPause(index, task)) return;
    patch(index, { open: true, busy: "ai", text: "Generating...", msg: null });
    try {
      const data = await api<{ body?: string }>("/api/recruiter/ai", {
        method: "POST",
        body: JSON.stringify({
          action: "generateNurture",
          li: task.li || "",
          nurtureType: task.nurtureType || "Interested",
          conversation: "",
          client: task.client || ""
        })
      });
      finish(index, task, data.body || "", "ai");
    } catch (e) {
      patch(index, { busy: "", text: "", msg: { kind: "error", text: e instanceof Error ? e.message : "AI error." } });
    }
  }

  function useCustom(index: number, task: Task) {
    if (blockedByPause(index, task)) return;
    patch(index, { open: true, text: "", source: "custom", msg: null });
  }

  async function rewrite(index: number, task: Task) {
    const draft = card(index).text.trim();
    if (!draft) {
      patch(index, { msg: { kind: "error", text: "Write a draft first, then Rewrite." } });
      return;
    }
    patch(index, { busy: "rewrite", msg: null });
    try {
      const data = await api<{ body?: string }>("/api/recruiter/ai", {
        method: "POST",
        body: JSON.stringify({ action: "rewriteNurture", li: task.li || "", draft, client: task.client || "" })
      });
      finish(index, task, data.body || draft, "custom");
    } catch (e) {
      patch(index, { busy: "", msg: { kind: "error", text: e instanceof Error ? e.message : "Rewrite failed." } });
    }
  }

  /** Reconnect copy for when Sales Navigator access is lost mid-conversation. */
  function salesNavRemove(index: number, task: Task) {
    patch(index, {
      open: true,
      source: "salesnavremove",
      msg: null,
      text: subCal(subName(SALES_NAV_REMOVE_REPLY, deriveName(task)), calendarUrlFor(task.client))
    });
  }

  async function save(index: number, task: Task) {
    const state = card(index);
    const reply = state.text.trim();
    if (!reply || !task.li) {
      patch(index, { msg: { kind: "error", text: "No message to save." } });
      return;
    }
    patch(index, { busy: "save", msg: null });
    try {
      await api("/api/recruiter/save-nurture", {
        method: "POST",
        body: JSON.stringify({
          li: task.li,
          reply,
          // GAS records a Sales Nav reconnect under its own status rather
          // than advancing the normal follow-up stage.
          nurtureType: state.source === "salesnavremove" ? "SalesNavRemove" : task.nurtureType || "",
          client: task.client || "",
          source: state.source || ""
        })
      });
      patch(index, { busy: "", msg: { kind: "success", text: "Saved!" } });
      setTimeout(() => onTaskDone(view, index), 1500);
    } catch (e) {
      patch(index, { busy: "", msg: { kind: "error", text: e instanceof Error ? e.message : "Save failed." } });
    }
  }

  async function markStatus(index: number, task: Task, path: string, note: string) {
    if (!task.li) return;
    try {
      await api(path, { method: "POST", body: JSON.stringify({ li: task.li }) });
      toast(note);
      onTaskDone(view, index);
    } catch (e) {
      patch(index, { msg: { kind: "error", text: e instanceof Error ? e.message : "Update failed." } });
    }
  }

  if (loadError) {
    return (
      <div className="card text-center">
        <p style={{ color: "#dc2626", fontSize: 12, fontWeight: 600 }}>Could not load tasks</p>
        <p className="text-muted" style={{ fontSize: 11, marginTop: 4 }}>
          {loadError}
        </p>
        <button className="btn btn-outline btn-sm mt-8" onClick={onRefresh}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="flex-between mb-8">
        <span style={{ fontSize: 12, fontWeight: 700 }}>
          {view === "review" ? "Review Due — all FU3-sent contacts" : "Today's Follow-ups"}
        </span>
        <button className="btn btn-ghost btn-sm" onClick={onRefresh} title="Refresh">
          ↻
        </button>
      </div>

      <div className="btn-group mb-8">
        <button
          className={`btn btn-sm ${view === "today" ? "btn-primary" : "btn-outline"}`}
          style={{ flex: 1 }}
          onClick={() => setView("today")}
        >
          Today&apos;s Follow-ups ({todayCount})
        </button>
        <button
          className={`btn btn-sm ${view === "review" ? "btn-primary" : "btn-outline"}`}
          style={{ flex: 1 }}
          onClick={() => setView("review")}
        >
          🔍 Review Due ({reviewCount})
        </button>
      </div>

      {!list.length ? (
        <div className="card text-center">
          <div style={{ fontSize: 32, margin: 8 }}>✅</div>
          <p className="text-muted">
            {view === "review" ? "No contacts awaiting review." : "No follow-ups today!"}
          </p>
        </div>
      ) : (
        list.map((task, index) => {
          const state = card(index);
          const name = deriveName(task);
          const notes = task.notes || task.salesNavId || "";
          const isPaused = pausedClients.has(task.client);
          const hasNurtureType = !!task.nurtureType;

          return (
            <div className="task-item" key={`${task.li || name}-${index}`}>
              <div className="task-name">
                {name}
                {task.stage ? <span className="stage-badge">{task.stage}</span> : null}
              </div>
              <div className="task-meta">
                {task.client || "--"} · {task.status || ""}
                {task.daysWaiting != null ? ` · waiting ${task.daysWaiting}d` : ""}
              </div>

              {notes ? (
                <div style={{ fontSize: 11, color: "#6c2eb9", margin: "2px 0 4px" }} className="flex-row">
                  Sales Nav:
                  <span style={{ fontWeight: 600, background: "#f3eaff", padding: "1px 6px", borderRadius: 4 }}>
                    {notes}
                  </span>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ padding: "1px 5px", fontSize: 10 }}
                    onClick={() => copyText(notes, "Sales Nav ID copied!")}
                  >
                    📋
                  </button>
                </div>
              ) : null}

              {isPaused ? (
                <div className="msg msg-warn" style={{ fontSize: 11 }}>
                  ⏸ {task.client || "This client"} is currently paused. Wait for it to reactivate, or use Client
                  Rotation on the Nurture tab instead.
                </div>
              ) : null}

              {/* CA/NY cap is advisory only — GAS deliberately never blocks
                  the send, it just tells the recruiter so they can decide. */}
              {task.canyCapped ? (
                <div style={{ fontSize: 11, color: "#b91c1c", margin: "2px 0 4px" }}>
                  ⚠ CA/NY: {task.client || "this client"} is at its cap ({task.canyCount}/{canyMax}) this cycle.
                </div>
              ) : null}

              <div className="btn-group mt-8">
                {hasNurtureType ? (
                  <button
                    className="btn btn-outline btn-sm"
                    disabled={state.busy === "template"}
                    onClick={() => void loadTemplate(index, task)}
                  >
                    {state.busy === "template" ? "…" : "Tpl"}
                  </button>
                ) : null}
                {hasNurtureType ? (
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={state.busy === "ai"}
                    onClick={() => void generateAi(index, task)}
                  >
                    {state.busy === "ai" ? "Generating…" : "✨ AI"}
                  </button>
                ) : null}
                <button className="btn btn-outline btn-sm" onClick={() => useCustom(index, task)}>
                  ✎ Custom
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ color: "#dc2626", borderColor: "#fecaca" }}
                  onClick={() => void markStatus(index, task, "/api/recruiter/mark-not-interested", "Marked Not Interested")}
                >
                  🚫 Not Int.
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ color: "#b45309", borderColor: "#fde68a" }}
                  onClick={() => salesNavRemove(index, task)}
                >
                  📵 SN Remove
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ color: "#7c2d12", borderColor: "#fed7aa" }}
                  onClick={() =>
                    void markStatus(index, task, "/api/recruiter/mark-profile-restricted", "Marked Profile Restricted")
                  }
                >
                  🔒 Profile Res.
                </button>
                {task.li ? (
                  <a href={task.li} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
                    Link
                  </a>
                ) : null}
              </div>

              {state.open ? (
                <div className="mt-8">
                  <ReplyBox value={state.text} onChange={(text) => patch(index, { text })} minHeight={60} />
                  <div className="btn-group mt-8">
                    {state.source === "custom" ? (
                      <button
                        className="btn btn-outline btn-sm"
                        disabled={state.busy === "rewrite"}
                        onClick={() => void rewrite(index, task)}
                      >
                        {state.busy === "rewrite" ? "Rewriting…" : "🤖 Rewrite"}
                      </button>
                    ) : null}
                    <button className="btn btn-copy btn-sm" onClick={() => copyText(state.text)}>
                      Copy
                    </button>
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={state.busy === "save"}
                      onClick={() => void save(index, task)}
                    >
                      {state.busy === "save" ? "Saving…" : "Save"}
                    </button>
                  </div>
                  <Message msg={state.msg} />
                </div>
              ) : (
                <Message msg={state.msg} />
              )}
            </div>
          );
        })
      )}
    </>
  );
}
