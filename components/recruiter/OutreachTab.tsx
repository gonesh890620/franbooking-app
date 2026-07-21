"use client";

import { useEffect, useState } from "react";
import {
  api,
  CollapsibleCard,
  copyText,
  Message,
  ReplyBox,
  toast,
  tool,
  TypeToggle,
  useDebounced,
  useMsg
} from "./shared";
import { subCal, subName } from "@/lib/recruiterCopy";

type OutType = "InMail" | "Invite" | "DM";

type TargetRow = {
  profileName?: string;
  salesNavId?: string;
  zip?: string;
  city?: string;
  state?: string;
  bestTime?: string;
};

const TRAINING_GUIDE_URL =
  "https://docs.google.com/document/d/1TFDjh0baaxZFcMPraDdvvgoihqgQRj00BbniGu85DX4/edit?tab=t.0";

export default function OutreachTab({ onSaved }: { onSaved: () => void }) {
  const [name, setName] = useState("");
  const [li, setLi] = useState("");
  const [salesNavId, setSalesNavId] = useState("");
  const [isCany, setIsCany] = useState(false);
  const [outType, setOutType] = useState<OutType>("InMail");

  const [text, setText] = useState("");
  const [subject, setSubject] = useState("");
  const [source, setSource] = useState<"template" | "custom" | "">("");
  const [showResult, setShowResult] = useState(false);
  const [busy, setBusy] = useState("");

  // Raw template cached so retyping the prospect's name re-substitutes it
  // without spending another template fetch (GAS renderCachedOutTpl).
  const [tplBody, setTplBody] = useState("");
  const [tplSubject, setTplSubject] = useState("");

  const { msg, show, hide } = useMsg();
  const save = useMsg();
  const dup = useMsg();

  /* ── TEMPLATE AUTOLOAD ──────────────────────────────────────────────────
     GAS loads a rotating pre-written template the instant a Type is picked.
     It's free (no AI credit) — AI is only spent on Rewrite. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      hide();
      setSource("template");
      setBusy("template");
      try {
        const data = await tool<{ body?: string; subject?: string }>("outreachTpl", { outType });
        if (cancelled) return;
        setTplBody(data.body || "");
        setTplSubject(data.subject || "");
        setShowResult(true);
      } catch (e) {
        if (!cancelled) show(e instanceof Error ? e.message : "Could not load template.", "error");
      } finally {
        if (!cancelled) setBusy("");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outType]);

  // Re-substitute the name into the cached template as it's typed.
  useEffect(() => {
    if (source !== "template") return;
    setText(subCal(subName(tplBody, name), ""));
    setSubject(tplSubject ? subName(tplSubject, name) : "");
  }, [tplBody, tplSubject, name, source]);

  /* ── DUPLICATE CHECK ────────────────────────────────────────────────────
     Fires as the LinkedIn URL is entered, matching GAS's blur/paste hooks. */
  const debouncedLi = useDebounced(li, 400);
  useEffect(() => {
    const value = debouncedLi.trim();
    if (value.length < 10) {
      dup.hide();
      return;
    }
    let cancelled = false;
    dup.show("Checking…", "info");
    (async () => {
      try {
        const data = await tool<{ isDuplicate?: boolean; recruiter?: string; date?: string }>("checkLiDup", {
          li: value
        });
        if (cancelled) return;
        if (data.isDuplicate) {
          const by = data.recruiter ? ` by ${data.recruiter}` : "";
          const on = data.date ? ` on ${data.date}` : "";
          dup.show(`⚠ Duplicate — already outreached${by}${on}`, "warn");
        } else {
          dup.show("✓ Not a duplicate", "success");
        }
      } catch {
        if (!cancelled) dup.hide();
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedLi]);

  function useCustom() {
    hide();
    setSource("custom");
    setText("");
    setSubject("");
    setShowResult(true);
  }

  async function rewrite() {
    const draft = text.trim();
    if (!draft) {
      show("Write a draft first, then Rewrite.", "error");
      return;
    }
    setBusy("rewrite");
    try {
      const data = await api<{ body?: string }>("/api/recruiter/ai", {
        method: "POST",
        body: JSON.stringify({ action: "rewriteOutreach", name, li, draft, outType })
      });
      setSource("custom");
      setText(subCal(subName(data.body || draft, name), ""));
      hide();
    } catch (e) {
      show(e instanceof Error ? e.message : "Rewrite failed.", "error");
    } finally {
      setBusy("");
    }
  }

  async function saveOutreach() {
    const content = text.trim();
    if (!name.trim() || !li.trim() || !content) {
      save.show("Name, LinkedIn URL, and message required.", "error");
      return;
    }
    setBusy("save");
    try {
      await api("/api/recruiter/save-outreach", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          li: li.trim(),
          outType,
          content,
          subject: subject.replace(/^Subject:\s*/, "").trim(),
          salesNavId: salesNavId.trim(),
          isCany
        })
      });
      save.show("✓ Saved!", "success");
      // GAS clears the form but deliberately keeps the Sales Nav ID, since a
      // recruiter works through one Sales Nav account at a time.
      setTimeout(() => {
        setName("");
        setLi("");
        setIsCany(false);
        setText("");
        setShowResult(false);
        save.hide();
        dup.hide();
        setSource("template");
        onSaved();
      }, 1500);
    } catch (e) {
      save.show(e instanceof Error ? e.message : "Save failed.", "error");
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <div className="form-row">
        <label>Prospect Name</label>
        <input type="text" value={name} placeholder="John Smith" onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="form-row">
        <label>LinkedIn URL</label>
        <input
          type="text"
          value={li}
          placeholder="https://linkedin.com/in/..."
          onChange={(e) => setLi(e.target.value)}
        />
        {dup.msg ? (
          <div className={`msg msg-${dup.msg.kind}`} style={{ marginTop: 4, fontSize: 11 }}>
            {dup.msg.text}
          </div>
        ) : null}
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            color: "#6c2eb9",
            cursor: "pointer",
            marginTop: 6,
            textTransform: "none",
            letterSpacing: 0
          }}
        >
          <input
            type="checkbox"
            checked={isCany}
            onChange={(e) => setIsCany(e.target.checked)}
            style={{ width: "auto" }}
          />
          CA/NY prospect?
        </label>
      </div>

      <div className="form-row">
        <label>
          Sales Nav ID <span style={{ fontSize: 10, color: "#888" }}>(optional)</span>
        </label>
        <input
          type="text"
          value={salesNavId}
          placeholder="e.g. 112541"
          onChange={(e) => setSalesNavId(e.target.value)}
        />
      </div>

      <div className="form-row">
        <label>Type</label>
        <TypeToggle<OutType>
          value={outType}
          onChange={setOutType}
          options={[
            { value: "InMail", label: "InMail" },
            { value: "Invite", label: "Invite" },
            { value: "DM", label: "DM" }
          ]}
        />
      </div>

      <div className="btn-group">
        <button className="btn btn-outline btn-sm" onClick={useCustom}>
          ✎ Custom
        </button>
      </div>

      <Message msg={msg} />

      {showResult ? (
        <div className="mt-8">
          {source === "template" && subject ? (
            <div className="flex-row" style={{ marginBottom: 4 }}>
              <div style={{ fontSize: 10, color: "#888", flex: 1 }}>Subject: {subject}</div>
              <button
                className="btn btn-outline btn-sm"
                style={{ fontSize: 10, padding: "2px 7px" }}
                onClick={() => copyText(subject, "Subject copied!")}
              >
                📋 Subject
              </button>
            </div>
          ) : null}

          <ReplyBox value={text} onChange={setText} autoFocus={source === "custom"} />

          <div className="btn-group">
            {source === "custom" ? (
              <button className="btn btn-outline btn-sm" disabled={busy === "rewrite"} onClick={() => void rewrite()}>
                {busy === "rewrite" ? "Rewriting…" : "🤖 Rewrite"}
              </button>
            ) : null}
            <button className="btn btn-copy btn-sm" onClick={() => copyText(text)}>
              📋 Copy
            </button>
            <button className="btn btn-primary btn-sm" disabled={busy === "save"} onClick={() => void saveOutreach()}>
              {busy === "save" ? "Saving…" : "💾 Save"}
            </button>
          </div>

          <Message msg={save.msg} />
        </div>
      ) : null}

      <a
        href={TRAINING_GUIDE_URL}
        target="_blank"
        rel="noreferrer"
        className="btn btn-outline btn-sm btn-full"
        style={{ margin: "14px 0 8px", textDecoration: "none" }}
      >
        📖 Outreach &amp; Nurture Training Guide
      </a>

      <ScreeningGuide />
      <TargetAreaLookup />
    </>
  );
}

/* ── LI SCREENING PROCESS ───────────────────────────────────────────────────
   Static manual-judgment reference, ported from Recruiter.html. Stays usable
   when Profile Selection credits run out, which is exactly when it matters. */
function ScreeningGuide() {
  return (
    <CollapsibleCard title="📋 LI Screening Process">
      <div style={{ fontSize: 11, lineHeight: 1.65, color: "#333" }}>
        <div style={{ marginBottom: 8 }}>
          <strong>A. Total work experience</strong> <span className="text-muted">(if year shown) — Primary Filter</span>
          <br />
          First job year 2013 or earlier → <strong style={{ color: "#166534" }}>Approved</strong>
          <br />
          First job year 2014 or later → go to B
        </div>
        <div style={{ marginBottom: 8 }}>
          <strong>B. Bachelor&apos;s graduation</strong>{" "}
          <span className="text-muted">(if year shown) — Secondary Filter</span>
          <br />
          Graduation year 2017 or earlier → <strong style={{ color: "#166534" }}>Approved</strong>
          <br />
          No graduation year shown → go to C
        </div>
        <div style={{ marginBottom: 8 }}>
          <strong>C. Picture</strong> <span className="text-muted">— 3rd Filter</span>
          <br />
          Obviously 35+ → <strong style={{ color: "#166534" }}>Approved</strong>
          <br />
          Possibly under 35 → upload the profile photo to ChatGPT:
          <br />
          &nbsp;&nbsp;30+ → <strong style={{ color: "#166534" }}>Approved</strong>
          <br />
          &nbsp;&nbsp;Under 30 or above 65 → <strong style={{ color: "#dc2626" }}>NOT approved</strong>
        </div>
        <div>
          <strong>Additional step</strong>{" "}
          <span className="text-muted">— only if current title contains &quot;Owner&quot; or &quot;Founder&quot;</span>
          <br />
          Current or past experience includes a TLE title → <strong style={{ color: "#166534" }}>Approved</strong>
          <br />
          Current experience is not a TLE title → <strong style={{ color: "#dc2626" }}>NOT approved</strong>
        </div>
      </div>
    </CollapsibleCard>
  );
}

/* ── TARGET AREA LOOKUP ─────────────────────────────────────────────────────
   Reads the recruiter's own FU Tracker "Target Area" tab (Sheets-only by
   design — this is operational data the recruiter maintains themselves). */
function TargetAreaLookup() {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<TargetRow[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const debounced = useDebounced(query, 300);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    (async () => {
      try {
        const data = await tool<{ rows: TargetRow[] }>("targetArea", { q: debounced });
        if (cancelled) return;
        setRows(data.rows || []);
        setState("ready");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  return (
    <CollapsibleCard title="🎯 Target Area Lookup" defaultOpen>
      <input
        type="text"
        value={query}
        placeholder="Filter by Sales Nav ID, name, ZIP, city…"
        autoComplete="off"
        onChange={(e) => setQuery(e.target.value)}
      />
      <div style={{ marginTop: 6, maxHeight: 220, overflowY: "auto" }}>
        {state === "loading" ? (
          <p className="text-muted text-center" style={{ padding: 12 }}>
            Loading…
          </p>
        ) : state === "error" ? (
          <p className="text-muted text-center" style={{ padding: 12 }}>
            Could not load Target Area.
          </p>
        ) : !rows.length ? (
          <p className="text-muted text-center" style={{ padding: 12 }}>
            No matching rows.
          </p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Profile</th>
                <th>SN ID</th>
                <th>ZIP</th>
                <th>City/State</th>
                <th>Best CST</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={`${row.salesNavId || ""}-${row.zip || ""}-${i}`}>
                  <td>{row.profileName || "--"}</td>
                  <td>{row.salesNavId || "--"}</td>
                  <td>
                    {row.zip ? (
                      <span className="flex-row" style={{ gap: 3 }}>
                        {row.zip}
                        <button
                          title="Copy ZIP"
                          style={{ border: "none", background: "transparent", cursor: "pointer", padding: "0 2px" }}
                          onClick={() => copyText(row.zip || "", `ZIP copied: ${row.zip}`)}
                        >
                          📋
                        </button>
                      </span>
                    ) : (
                      "--"
                    )}
                  </td>
                  <td>{[row.city, row.state].filter(Boolean).join(", ") || "--"}</td>
                  <td>{row.bestTime || "--"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </CollapsibleCard>
  );
}
