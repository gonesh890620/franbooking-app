"use client";

/**
 * Shared UI primitives, one-to-one with the GAS design system.
 *
 * Every class name used here comes from `gas-webapp/CSS.html`, which is ported
 * verbatim into section 1 of `app/styles.css`. Panels should compose these
 * rather than inventing new class names -- that divergence is exactly what
 * made the first version of this app stop looking like the GAS original.
 *
 * GAS equivalents:
 *   AppHeader   -> .app-header / .app-logo / .app-user
 *   Card        -> .card / .card-header
 *   StatGrid    -> .stats-grid / .stat-card / .stat-num / .stat-label
 *   Tabs        -> .tabs / .tab
 *   Msg         -> .msg / .msg-error|success|warn|info
 *   Badge       -> .badge / .badge-green|yellow|red|gray|purple
 *   DataTable   -> .table-wrap + .data-table
 *   Modal       -> app addition, styled to match (GAS built these inline)
 */

import { useEffect, useState } from "react";

/* ── HEADER ───────────────────────────────────────────────────────────────── */

export function AppHeader({
  logo,
  user,
  children
}: {
  logo: string;
  user?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="app-header">
      <div className="app-logo">{logo}</div>
      <div className="flex-row">
        {user ? <span className="app-user">{user}</span> : null}
        {children}
      </div>
    </div>
  );
}

/* ── CARD ─────────────────────────────────────────────────────────────────── */

export function Card({
  title,
  actions,
  children,
  style
}: {
  title?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div className="card" style={style}>
      {title || actions ? (
        <div className="card-header">
          {typeof title === "string" ? <h2>{title}</h2> : title}
          {actions ? <div className="btn-group">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}

/* ── STATS ────────────────────────────────────────────────────────────────── */

export type Stat = {
  label: string;
  value: React.ReactNode;
  /** GAS stat colour variants. Default is the purple brand. */
  tone?: "green" | "blue" | "purple" | "amber";
  onClick?: () => void;
};

export function StatGrid({ stats }: { stats: Stat[] }) {
  return (
    <div className="stats-grid">
      {stats.map((s) => (
        <div
          key={s.label}
          className={`stat-card${s.tone ? ` stat-${s.tone}` : ""}${s.onClick ? " clickable" : ""}`}
          onClick={s.onClick}
          role={s.onClick ? "button" : undefined}
          tabIndex={s.onClick ? 0 : undefined}
          onKeyDown={(e) => {
            if (s.onClick && e.key === "Enter") s.onClick();
          }}
        >
          <div className="stat-num">{s.value}</div>
          <div className="stat-label">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

/* ── TABS ─────────────────────────────────────────────────────────────────── */

export function Tabs<T extends string>({
  tabs,
  value,
  onChange
}: {
  tabs: Array<{ key: T; label: string }>;
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <div
          key={t.key}
          className={`tab${value === t.key ? " active" : ""}`}
          onClick={() => onChange(t.key)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter") onChange(t.key);
          }}
        >
          {t.label}
        </div>
      ))}
    </div>
  );
}

/* ── MESSAGES ─────────────────────────────────────────────────────────────── */

export type MsgKind = "error" | "success" | "warn" | "info";

export function Msg({ kind, children }: { kind: MsgKind; children: React.ReactNode }) {
  return <div className={`msg msg-${kind}`}>{children}</div>;
}

/**
 * Classifies a free-text status string the way the old panels did, so
 * existing `setMessage("...failed")` call sites keep colouring correctly.
 */
export function toneForMessage(text: string): MsgKind {
  const t = text.toLowerCase();
  if (/(fail|error|invalid|missing|could not|unable|denied)/.test(t)) return "error";
  if (/(warn|paused|pending|caution)/.test(t)) return "warn";
  return "success";
}

/* ── BADGE ────────────────────────────────────────────────────────────────── */

export function Badge({
  tone = "purple",
  children
}: {
  tone?: "green" | "yellow" | "red" | "gray" | "purple";
  children: React.ReactNode;
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

/** Maps a user/campaign status word onto GAS's badge colours. */
export function statusTone(status: string): "green" | "yellow" | "red" | "gray" | "purple" {
  const s = String(status || "").toLowerCase();
  if (/(approved|active|hired|live|completed|done)/.test(s)) return "green";
  if (/(pending|paused|waiting|onboarding|unsure)/.test(s)) return "yellow";
  if (/(removed|expired|rejected|cancel|not interested|fire)/.test(s)) return "red";
  if (/(archived|closed|inactive)/.test(s)) return "gray";
  return "purple";
}

/* ── TABLE ────────────────────────────────────────────────────────────────── */

export function DataTable({
  head,
  children,
  /** Column keys that can be sorted; pass onSort to enable. */
  sortKey,
  sortDir,
  onSort
}: {
  head: Array<{ key?: string; label: string; align?: "left" | "right" }>;
  children: React.ReactNode;
  sortKey?: string;
  sortDir?: "asc" | "desc";
  onSort?: (key: string) => void;
}) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {head.map((h, i) => {
              const sortable = !!(h.key && onSort);
              return (
                <th
                  key={h.key || `${h.label}-${i}`}
                  className={sortable ? "sortable" : undefined}
                  style={{ textAlign: h.align || "left" }}
                  onClick={sortable ? () => onSort!(h.key!) : undefined}
                >
                  {h.label}
                  {sortable && sortKey === h.key ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children?: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan}>
        <p className="text-muted text-center" style={{ padding: 16 }}>
          {children || "Nothing to show yet."}
        </p>
      </td>
    </tr>
  );
}

/* ── MODAL ────────────────────────────────────────────────────────────────── */

export function Modal({
  title,
  onClose,
  narrow,
  children,
  footer
}: {
  title: string;
  onClose: () => void;
  narrow?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  // Escape closes, matching the GAS popups' behaviour.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal-card${narrow ? " narrow" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
        {footer ? (
          <div className="btn-group mt-12">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}

/* ── FORM ROW ─────────────────────────────────────────────────────────────── */

export function Field({
  label,
  hint,
  children
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="form-row">
      <label>
        {label}
        {hint ? <span style={{ fontSize: 10, color: "#888", textTransform: "none" }}> ({hint})</span> : null}
      </label>
      {children}
    </div>
  );
}

/* ── BAR CHART ────────────────────────────────────────────────────────────── */

/** Dependency-free bar chart. GAS used Chart.js; this keeps the bundle clean. */
export function BarChart({
  rows,
  labelKey,
  valueKey,
  empty = "No data yet."
}: {
  rows: Array<Record<string, any>>;
  labelKey: string;
  valueKey: string;
  empty?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => Number(r[valueKey]) || 0));
  if (!rows.length) {
    return (
      <p className="text-muted text-center" style={{ padding: 12 }}>
        {empty}
      </p>
    );
  }
  return (
    <div className="bar-chart">
      {rows.map((r) => (
        <div className="bar-row" key={String(r[labelKey])}>
          <span>{r[labelKey]}</span>
          <span className="bar-track">
            <span
              className="bar-fill"
              style={{ width: `${Math.max(2, ((Number(r[valueKey]) || 0) / max) * 100)}%` }}
            />
          </span>
          <span className="bar-value">{r[valueKey]}</span>
        </div>
      ))}
    </div>
  );
}

/* ── LOADING ──────────────────────────────────────────────────────────────── */

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <p className="text-muted text-center loading-dots" style={{ padding: 20 }}>
      {label}
    </p>
  );
}

/* ── COLLAPSIBLE ──────────────────────────────────────────────────────────── */

export function Collapsible({
  title,
  defaultOpen = false,
  children
}: {
  title: React.ReactNode;
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
          if (e.key === "Enter") setOpen((v) => !v);
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 700 }}>{title}</span>
        <span style={{ fontSize: 11, color: "#888" }}>{open ? "▾" : "▸"}</span>
      </div>
      {open ? <div style={{ marginTop: 8 }}>{children}</div> : null}
    </div>
  );
}
