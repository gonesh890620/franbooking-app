"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ── API ──────────────────────────────────────────────────────────────────── */

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) }
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.message || data.error || "Request failed");
  return data as T;
}

export function tool<T>(action: string, params: Record<string, string> = {}) {
  const qs = new URLSearchParams({ action, ...params }).toString();
  return api<T>(`/api/recruiter/tools?${qs}`);
}

export function toolPost<T>(action: string, body: Record<string, unknown> = {}) {
  return api<T>("/api/recruiter/tools", { method: "POST", body: JSON.stringify({ action, ...body }) });
}

/* ── TYPES (mirror the GAS API payloads) ─────────────────────────────────── */

export type Usage = {
  nurtureBalance?: number;
  outreachBalance?: number;
  profileBalance?: number;
  error?: string;
};

export type ClientAssignment = {
  name: string;
  status: string;
  eventUrl: string;
  nurturePct?: string;
  canyAppts?: string;
  flagNotes?: string;
};

export type Task = {
  name: string;
  li: string;
  client: string;
  stage: string;
  nurtureType: string;
  status: string;
  notes?: string;
  paused?: boolean;
  daysWaiting?: number | null;
  canyCapped?: boolean;
  canyCount?: number;
  salesNavId?: string;
};

export type RatioRow = {
  client: string;
  count: number;
  pct: number;
  todayCount: number;
  canyBlocked: boolean;
};

export type Contact = {
  name: string;
  li: string;
  status: string;
  client: string;
  canyFlag?: string;
  row?: number;
};

export type UnsureCriterion = { code?: string; criteria: string; response?: string };

export type Bootstrap = {
  usage?: Usage;
  clients?: { clients: ClientAssignment[] };
  tasks?: { tasks: Task[]; reviewTasks: Task[]; canyMax?: number; error?: string };
  clientRatio?: { ratio?: RatioRow[]; rows?: RatioRow[]; suggested?: string };
};

/* ── MESSAGE (GAS .msg / .msg-error / .msg-success / .msg-warn / .msg-info) ─ */

export type MsgKind = "error" | "success" | "warn" | "info";
export type Msg = { text: string; kind: MsgKind } | null;

export function Message({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return <div className={`msg msg-${msg.kind}`}>{msg.text}</div>;
}

/** Message state with GAS's show/hide semantics. */
export function useMsg() {
  const [msg, setMsg] = useState<Msg>(null);
  const show = useCallback((text: string, kind: MsgKind = "info") => setMsg({ text, kind }), []);
  const hide = useCallback(() => setMsg(null), []);
  return { msg, show, hide };
}

/* ── TOAST (GAS toast()) ──────────────────────────────────────────────────── */

let toastSetter: ((text: string) => void) | null = null;

export function toast(text: string) {
  if (toastSetter) toastSetter(text);
}

export function ToastHost() {
  const [text, setText] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    toastSetter = (next: string) => {
      setText(next);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setText(""), 2000);
    };
    return () => {
      toastSetter = null;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        bottom: 14,
        right: 14,
        background: "#1a1a1a",
        color: "#fff",
        padding: "8px 14px",
        borderRadius: 8,
        fontSize: 12,
        zIndex: 9999,
        opacity: text ? 1 : 0,
        transition: "opacity .2s",
        pointerEvents: "none"
      }}
    >
      {text}
    </div>
  );
}

export function copyText(text: string, note = "Copied!") {
  void navigator.clipboard.writeText(text || "").then(() => toast(note));
}

/* ── EDITABLE REPLY BOX (GAS contenteditable .reply-box + .char-count) ─────
   GAS used a contenteditable div so generated copy could be edited in place
   before saving. A textarea gives the same editing behaviour with controlled
   React state and no cursor-jump problems, and keeps the .reply-box look. */

export function ReplyBox({
  value,
  onChange,
  minHeight = 56,
  autoFocus = false,
  placeholder
}: {
  value: string;
  onChange: (next: string) => void;
  minHeight?: number;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  return (
    <>
      <textarea
        className="reply-box"
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        style={{ minHeight, width: "100%" }}
      />
      <div className="char-count">{value.trim().length} chars</div>
    </>
  );
}

/* ── TYPE TOGGLE (GAS .type-toggle) ──────────────────────────────────────── */

export function TypeToggle<T extends string>({
  options,
  value,
  onChange
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div className="type-toggle">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`t-btn${opt.value === value ? " active" : ""}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/* ── COLLAPSIBLE CARD (GAS ta-toggle-header / sg-toggle-header pattern) ───── */

export function CollapsibleCard({
  title,
  defaultOpen = false,
  children
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card">
      <div
        className="flex-between"
        style={{ cursor: "pointer" }}
        onClick={() => setOpen((v) => !v)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setOpen((v) => !v);
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 700 }}>{title}</span>
        <span style={{ fontSize: 11, color: "#888" }}>{open ? "▾" : "▸"}</span>
      </div>
      {open ? <div style={{ marginTop: 8 }}>{children}</div> : null}
    </div>
  );
}

/* ── DEBOUNCED VALUE (GAS's 300ms searchTimer pattern) ───────────────────── */

export function useDebounced<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
