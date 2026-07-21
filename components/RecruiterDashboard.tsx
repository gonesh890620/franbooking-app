"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BodyClass from "./BodyClass";
import FeedbackTab from "./recruiter/FeedbackTab";
import NurtureTab from "./recruiter/NurtureTab";
import OutreachTab from "./recruiter/OutreachTab";
import StatsTab from "./recruiter/StatsTab";
import TasksTab from "./recruiter/TasksTab";
import {
  api,
  Bootstrap,
  ClientAssignment,
  Message,
  RatioRow,
  Task,
  toast,
  ToastHost,
  toolPost,
  Usage,
  useMsg
} from "./recruiter/shared";

type RecruiterUser = {
  email: string;
  name: string;
  impersonatorEmail?: string;
  impersonatorName?: string;
};

type TabKey = "tasks" | "outreach" | "nurture" | "billing" | "feedback";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "tasks", label: "📋 Tasks" },
  { key: "outreach", label: "📤 Outreach" },
  { key: "nurture", label: "💬 Nurture" },
  { key: "billing", label: "📊 Stats" },
  { key: "feedback", label: "📝 Feedback" }
];

export default function RecruiterDashboard({ initialUser }: { initialUser: RecruiterUser | null }) {
  const [user, setUser] = useState(initialUser);
  const [tab, setTab] = useState<TabKey>("tasks");
  const [boot, setBoot] = useState<Bootstrap>({});
  const [loading, setLoading] = useState(false);
  const { msg, show, hide } = useMsg();

  const loadBootstrap = useCallback(async () => {
    setLoading(true);
    hide();
    try {
      setBoot(await api<Bootstrap>("/api/recruiter/bootstrap"));
    } catch (e) {
      show(e instanceof Error ? e.message : "Could not load dashboard", "error");
    } finally {
      setLoading(false);
    }
  }, [hide, show]);

  useEffect(() => {
    if (user) void loadBootstrap();
  }, [user, loadBootstrap]);

  useTimeLog(!!user);

  if (!user) return <LoginScreen onLoggedIn={setUser} />;

  const usage: Usage = boot.usage || {};
  const clients: ClientAssignment[] = boot.clients?.clients || [];
  const tasks: Task[] = boot.tasks?.tasks || [];
  const reviewTasks: Task[] = boot.tasks?.reviewTasks || [];
  const canyMax = boot.tasks?.canyMax || 6;
  const ratio: RatioRow[] = boot.clientRatio?.ratio || boot.clientRatio?.rows || [];
  const suggested = boot.clientRatio?.suggested || "";

  const calendarUrlFor = (client: string) =>
    clients.find((c) => c.name === client)?.eventUrl || "";

  /** Removes a finished task from view without a full refetch. */
  function dropTask(view: "today" | "review", index: number) {
    setBoot((prev) => {
      const t = prev.tasks;
      if (!t) return prev;
      const key = view === "review" ? "reviewTasks" : "tasks";
      const list = [...(t[key] || [])];
      list.splice(index, 1);
      return { ...prev, tasks: { ...t, [key]: list } };
    });
  }

  return (
    <>
      <BodyClass names="full-page narrow-page" />
      <ToastHost />

      <div className="app-header">
        <div className="app-logo">📋 Recruiter</div>
        <div className="flex-row">
          <CreditBar usage={usage} />
          <span className="app-user">{user.name}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => void logout()}>
            Logout
          </button>
        </div>
      </div>

      {/* Screening can continue manually without Profile Selection credits —
          the LI Screening Process card on Outreach has the criteria. */}
      {Number(usage.profileBalance || 0) <= 0 ? (
        <div
          style={{
            background: "#fff8f0",
            borderBottom: "1px solid #f0c070",
            padding: "6px 12px",
            fontSize: 11,
            color: "#92400e"
          }}
        >
          ⚠️ Out of Profile Selection credits — you can still continue screening manually. Open the{" "}
          <strong>LI Screening Process</strong> card for the criteria.
        </div>
      ) : null}

      {user.impersonatorEmail ? (
        <div className="impersonation-banner">
          <span>
            👁 Viewing as <strong>{user.name}</strong>
          </span>
          <button className="btn btn-outline btn-sm" onClick={() => void returnToGrowth()}>
            ← Return to Growth
          </button>
        </div>
      ) : null}

      <div className="tabs">
        {TABS.map((t) => (
          <div
            key={t.key}
            className={`tab${tab === t.key ? " active" : ""}`}
            onClick={() => setTab(t.key)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter") setTab(t.key);
            }}
          >
            {t.key === "tasks" ? `📋 Tasks (${tasks.length})` : t.label}
          </div>
        ))}
      </div>

      <div className="screen-content">
        <Message msg={msg} />

        {loading && !boot.tasks ? (
          <p className="text-muted text-center loading-dots" style={{ padding: 20 }}>
            Loading
          </p>
        ) : null}

        {tab === "tasks" ? (
          <TasksTab
            tasks={tasks}
            reviewTasks={reviewTasks}
            canyMax={canyMax}
            clients={clients}
            loadError={boot.tasks?.error || ""}
            onRefresh={() => void loadBootstrap()}
            onTaskDone={dropTask}
            calendarUrlFor={calendarUrlFor}
          />
        ) : null}

        {tab === "outreach" ? <OutreachTab onSaved={() => void loadBootstrap()} /> : null}

        {tab === "nurture" ? (
          <NurtureTab
            clients={clients}
            ratio={ratio}
            suggested={suggested}
            calendarUrlFor={calendarUrlFor}
            onSaved={() => void loadBootstrap()}
          />
        ) : null}

        {tab === "billing" ? <StatsTab /> : null}
        {tab === "feedback" ? <FeedbackTab /> : null}
      </div>
    </>
  );
}

/* ── CREDIT BAR ─────────────────────────────────────────────────────────────
   N = Nurture, O = Outreach, P = Profile Selection. Turns red at <= 5 so a
   recruiter sees it coming before they're blocked mid-send. */
function CreditBar({ usage }: { usage: Usage }) {
  const [busy, setBusy] = useState(false);
  const failed = !!usage.error;

  const pill = (balance: number | undefined, suffix: string) => {
    const n = Number(balance || 0);
    return (
      <span className={`credit-pill${n <= 5 ? " urgent" : ""}`}>
        {failed ? `ERR ${suffix}` : `${n} ${suffix}`}
      </span>
    );
  };

  async function requestMore() {
    setBusy(true);
    try {
      await toolPost("requestCredits", { type: "all" });
      toast("Request sent! Admin will add credits shortly.");
    } catch (e) {
      toast(`Error: ${e instanceof Error ? e.message : "request failed"}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="credit-bar">
      {pill(usage.nurtureBalance, "N")}
      {pill(usage.outreachBalance, "O")}
      {pill(usage.profileBalance, "P")}
      <button
        className="btn btn-primary btn-sm"
        style={{ fontSize: 10, padding: "3px 8px", borderRadius: 12 }}
        disabled={busy}
        onClick={() => void requestMore()}
      >
        {busy ? "Sending..." : "+ Get More"}
      </button>
    </div>
  );
}

/* ── TIME LOG ───────────────────────────────────────────────────────────────
   Tracks an online session for the Growth panel's recruiter-activity view.
   Heartbeat every 2 min reports the last real interaction (not "now"), so a
   closed laptop stops counting as active. Best-effort throughout: a failure
   here must never disturb the recruiter's actual work. */
function useTimeLog(active: boolean) {
  const sessionId = useRef<string | null>(null);
  const lastActivity = useRef(Date.now());

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let heartbeat: ReturnType<typeof setInterval> | null = null;

    const bump = () => {
      lastActivity.current = Date.now();
    };
    (["click", "keydown", "mousemove", "scroll"] as const).forEach((ev) =>
      document.addEventListener(ev, bump, { passive: true })
    );

    const end = () => {
      if (!sessionId.current) return;
      const id = sessionId.current;
      sessionId.current = null;
      void api("/api/recruiter/timelog", {
        method: "POST",
        body: JSON.stringify({ action: "end", sessionId: id })
      }).catch(() => {});
    };

    (async () => {
      try {
        const res = await api<{ ok: boolean; sessionId?: string }>("/api/recruiter/timelog", {
          method: "POST",
          body: JSON.stringify({ action: "start" })
        });
        if (cancelled) return;
        sessionId.current = res.sessionId || null;

        heartbeat = setInterval(() => {
          if (!sessionId.current) return;
          void api<{ alreadyClosed?: boolean }>("/api/recruiter/timelog", {
            method: "POST",
            body: JSON.stringify({
              action: "ping",
              sessionId: sessionId.current,
              lastActivity: lastActivity.current
            })
          })
            .then((data) => {
              // Server-side auto-close swept this row; stop pinging a dead
              // session so the next activity opens a fresh one.
              if (data?.alreadyClosed) sessionId.current = null;
            })
            .catch(() => {});
        }, 2 * 60 * 1000);
      } catch {
        // Non-blocking.
      }
    })();

    window.addEventListener("beforeunload", end);

    return () => {
      cancelled = true;
      if (heartbeat) clearInterval(heartbeat);
      (["click", "keydown", "mousemove", "scroll"] as const).forEach((ev) =>
        document.removeEventListener(ev, bump)
      );
      window.removeEventListener("beforeunload", end);
      end();
    };
  }, [active]);
}

/* ── AUTH ───────────────────────────────────────────────────────────────── */

async function logout() {
  try {
    await api("/api/auth/logout", { method: "POST" });
  } catch {
    // Fall through to the redirect regardless.
  }
  window.location.href = "/login";
}

async function returnToGrowth() {
  try {
    await api("/api/auth/return-impersonation", { method: "POST" });
  } catch {
    // Fall through to the redirect regardless.
  }
  window.location.href = "/growth";
}

function LoginScreen({ onLoggedIn }: { onLoggedIn: (user: RecruiterUser) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const { msg, show, hide } = useMsg();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    hide();
    try {
      const res = await api<{ email: string; name: string }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      onLoggedIn({ email: res.email, name: res.name });
    } catch (err) {
      show(err instanceof Error ? err.message : "Login failed", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-shell">
      <form className="login-card" onSubmit={submit}>
        <div className="app-logo">📋 Recruiter</div>
        <h1>Sign in</h1>
        <p>Use your Franbooking recruiter account.</p>

        <div className="form-row">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="form-row">
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>

        <button className="btn btn-primary btn-full" type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <Message msg={msg} />
      </form>
    </div>
  );
}
