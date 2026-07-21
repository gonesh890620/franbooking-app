"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  ClientAssignment,
  Contact,
  copyText,
  Message,
  RatioRow,
  ReplyBox,
  toast,
  tool,
  toolPost,
  TypeToggle,
  UnsureCriterion,
  useDebounced,
  useMsg
} from "./shared";
import {
  CANY_ROTATION_REPLY,
  CLIENT_ROTATION_REPLY,
  isContinuingConversation,
  nextNurtureTypeForStatus,
  NOT_INTERESTED_REPLY,
  ROTATION_REASONS,
  subCal,
  subName,
  subRotationNames
} from "@/lib/recruiterCopy";

type NurType = "Interested" | "Unsure" | "Client Rotation" | "Not Interested";

export default function NurtureTab({
  clients,
  ratio,
  suggested,
  calendarUrlFor,
  onSaved
}: {
  clients: ClientAssignment[];
  ratio: RatioRow[];
  suggested: string;
  calendarUrlFor: (client: string) => string;
  onSaved: () => void;
}) {
  /* ── contact selection ── */
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Contact[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [selected, setSelected] = useState<Contact | null>(null);
  const [continueMode, setContinueMode] = useState(false);

  /* ── client / rotation ── */
  const [client, setClient] = useState("");
  const [prevClient, setPrevClient] = useState("");
  const [rotationOpen, setRotationOpen] = useState(false);
  const [rotationReason, setRotationReason] = useState("");

  /* ── message composition ── */
  const [nurType, setNurType] = useState<NurType>("Interested");
  const [conversation, setConversation] = useState("");
  const [text, setText] = useState("");
  const [source, setSource] = useState<"template" | "ai" | "custom" | "">("");
  const [showResult, setShowResult] = useState(false);
  const [busy, setBusy] = useState("");

  /* ── unsure criteria ── */
  const [criteria, setCriteria] = useState<UnsureCriterion[]>([]);
  const [criteriaIdx, setCriteriaIdx] = useState(-1);
  const [criteriaState, setCriteriaState] = useState<"idle" | "loading" | "error">("idle");

  const gen = useMsg();
  const save = useMsg();

  const ratioByClient = useMemo(() => {
    const map = new Map<string, RatioRow>();
    ratio.forEach((r) => map.set(r.client, r));
    return map;
  }, [ratio]);

  const currentRatio = client ? ratioByClient.get(client) : undefined;
  const isCanyRotation = rotationReason === "CA/NY territory change";
  const selectedName = selected?.name || "";

  /** GAS effectiveNurType — rotation splits into two distinct saved statuses. */
  function effectiveNurType() {
    if (nurType !== "Client Rotation") return nurType;
    return isCanyRotation ? "CA/NY Territory Change" : "Client Rotation";
  }

  function rotationText(newClient: string) {
    const template = isCanyRotation ? CANY_ROTATION_REPLY : CLIENT_ROTATION_REPLY;
    return subCal(subRotationNames(subName(template, selectedName), prevClient, newClient), calendarUrlFor(newClient));
  }

  /* ── CONTACT SEARCH ─────────────────────────────────────────────────── */
  const debouncedSearch = useDebounced(search, 300);
  useEffect(() => {
    const q = debouncedSearch.trim();
    if (!q) {
      setShowResults(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await api<{ contacts: Contact[] }>(`/api/recruiter/contacts?q=${encodeURIComponent(q)}`);
        if (cancelled) return;
        setResults(data.contacts || []);
        setShowResults(true);
      } catch {
        if (!cancelled) {
          setResults([]);
          setShowResults(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch]);

  /**
   * Picks the least-loaded eligible client, matching GAS
   * autoAssignRotationClient. Excludes the previous client, paused clients,
   * clients with no DTC/Calendly link, and — for CA/NY moves specifically —
   * any client flagged or already at its CA/NY cap.
   */
  function autoAssignClient(reason = rotationReason, previous = prevClient): string {
    const canyMove = reason === "CA/NY territory change";
    const candidates = clients.filter((c) => {
      if (!c.name) return false;
      if (previous && c.name === previous) return false;
      if (/paused/i.test(c.status || "")) return false;
      if (!c.eventUrl) return false;
      if (canyMove && c.flagNotes) return false;
      if (canyMove && ratioByClient.get(c.name)?.canyBlocked) return false;
      return true;
    });

    if (!candidates.length) {
      toast("No eligible rotation client found (check Daily Assignment: DTC link / flags) — use Custom instead.");
      return "";
    }

    candidates.sort((a, b) => (ratioByClient.get(a.name)?.pct || 0) - (ratioByClient.get(b.name)?.pct || 0));
    const chosen = candidates[0].name;
    setClient(chosen);
    return chosen;
  }

  /* ── SELECT / CLEAR CONTACT ─────────────────────────────────────────── */
  function selectContact(c: Contact) {
    setSelected(c);
    setSearch(c.name || c.li || "");
    setShowResults(false);
    save.hide();
    gen.hide();

    const continuing = isContinuingConversation(c.status);
    setContinueMode(continuing);

    if (c.client) {
      setClient(c.client);
      setPrevClient(c.client);
    } else {
      // Outreach never assigns a client, so a first reply always lands here.
      setPrevClient("");
      setRotationReason("");
      autoAssignClient("", "");
    }

    setText("");
    setShowResult(false);
    setSource("");
    setCriteriaIdx(-1);

    if (continuing) {
      // Stage is carried forward from the contact's status; the recruiter
      // doesn't re-pick a response type mid-conversation.
      setNurType(nextNurtureTypeForStatus(c.status) as NurType);
    } else {
      setNurType("Interested");
    }
  }

  function clearContact() {
    setSelected(null);
    setSearch("");
    setShowResults(false);
    setContinueMode(false);
    setNurType("Interested");
    setSource("");
    setText("");
    setShowResult(false);
    setCriteriaIdx(-1);
  }

  /* ── RESPONSE TYPE ──────────────────────────────────────────────────── */
  function changeNurType(next: NurType) {
    setNurType(next);
    gen.hide();
    setSource("");
    setCriteriaIdx(-1);
    setText("");
    setShowResult(false);

    if (next === "Not Interested") {
      setText(NOT_INTERESTED_REPLY);
      setShowResult(true);
    } else if (next === "Client Rotation") {
      const chosen = autoAssignClient(rotationReason, prevClient) || client;
      setText(rotationText(chosen));
      setShowResult(true);
    } else if (next === "Unsure") {
      void loadCriteria();
    } else if (next === "Interested") {
      void loadTemplate("Interested");
    }
  }

  function toggleRotation() {
    const opening = !rotationOpen;
    setRotationOpen(opening);
    if (opening) changeNurType("Client Rotation");
  }

  function changeRotationReason(reason: string) {
    setRotationReason(reason);
    if (nurType !== "Client Rotation") return;
    const canyMove = reason === "CA/NY territory change";
    const candidates = clients.filter((c) => {
      if (!c.name || !c.eventUrl) return false;
      if (prevClient && c.name === prevClient) return false;
      if (/paused/i.test(c.status || "")) return false;
      if (canyMove && (c.flagNotes || ratioByClient.get(c.name)?.canyBlocked)) return false;
      return true;
    });
    candidates.sort((a, b) => (ratioByClient.get(a.name)?.pct || 0) - (ratioByClient.get(b.name)?.pct || 0));
    const chosen = candidates[0]?.name || client;
    setClient(chosen);
    const template = canyMove ? CANY_ROTATION_REPLY : CLIENT_ROTATION_REPLY;
    setText(
      subCal(subRotationNames(subName(template, selectedName), prevClient, chosen), calendarUrlFor(chosen))
    );
    setShowResult(true);
  }

  /* ── TEMPLATE / AI ──────────────────────────────────────────────────── */
  const tplToken = useRef(0);

  async function loadTemplate(type: string) {
    gen.hide();
    setSource("template");
    const token = ++tplToken.current;
    setBusy("template");
    try {
      const data = await tool<{ body?: string }>("nurtureTpl", { nType: type, client });
      if (token !== tplToken.current) return;
      setText(subCal(subName(data.body || "", selectedName), calendarUrlFor(client)));
      setShowResult(true);
    } catch (e) {
      if (token === tplToken.current) gen.show(e instanceof Error ? e.message : "Template failed.", "error");
    } finally {
      if (token === tplToken.current) setBusy("");
    }
  }

  async function loadCriteria() {
    if (criteria.length) return;
    setCriteriaState("loading");
    try {
      const data = await tool<{ criteria: UnsureCriterion[] }>("unsureCriteria");
      setCriteria(data.criteria || []);
      setCriteriaState("idle");
    } catch {
      setCriteriaState("error");
    }
  }

  function selectCriterion(idx: number) {
    setCriteriaIdx(idx);
    const item = criteria[idx];
    const response = (item?.response || "").trim();
    if (!response) return;
    setText(subCal(subName(response, selectedName), calendarUrlFor(client)));
    setShowResult(true);
    gen.hide();
  }

  async function generate() {
    if (!selected?.li) {
      gen.show("Select a contact first.", "error");
      return;
    }
    gen.hide();
    setSource("ai");

    if (nurType === "Not Interested") {
      setSource("");
      setText(NOT_INTERESTED_REPLY);
      setShowResult(true);
      return;
    }

    let type = effectiveNurType();
    let convo = conversation.trim();

    // An Unsure criterion with a canned response and no pasted reply needs
    // no AI call at all — GAS returns the canned text and spends no credit.
    if (nurType === "Unsure" && criteriaIdx >= 0 && criteria[criteriaIdx]) {
      const item = criteria[criteriaIdx];
      type = "Unsure";
      if (item.response && !convo) {
        setText(subCal(subName(item.response, selectedName), calendarUrlFor(client)));
        setShowResult(true);
        return;
      }
      convo = `${convo ? `${convo} | ` : ""}[Criteria: ${item.criteria || ""}]`;
    }

    setBusy("generate");
    try {
      const data = await api<{ body?: string; message?: string }>("/api/recruiter/ai", {
        method: "POST",
        body: JSON.stringify({
          action: "generateNurture",
          li: selected.li,
          nurtureType: type,
          conversation: convo,
          client
        })
      });
      const body = data.body || data.message || "";
      if (!body) {
        gen.show("AI returned empty response. Try Template instead.", "warn");
        return;
      }
      setText(subCal(subName(body, selectedName), calendarUrlFor(client)));
      setShowResult(true);
    } catch (e) {
      gen.show(e instanceof Error ? e.message : "AI error — no response", "error");
    } finally {
      setBusy("");
    }
  }

  function useCustom() {
    if (!selected?.li) {
      gen.show("Select a contact first.", "error");
      return;
    }
    gen.hide();
    setSource("custom");
    setText("");
    setShowResult(true);
  }

  async function rewrite() {
    if (!selected?.li) {
      gen.show("Select a contact first.", "error");
      return;
    }
    const draft = text.trim();
    if (!draft) {
      gen.show("Write a draft first, then Rewrite.", "error");
      return;
    }
    setBusy("rewrite");
    try {
      const data = await api<{ body?: string }>("/api/recruiter/ai", {
        method: "POST",
        body: JSON.stringify({ action: "rewriteNurture", li: selected.li, draft, client })
      });
      setSource("custom");
      setText(subCal(subName(data.body || draft, selectedName), calendarUrlFor(client)));
    } catch (e) {
      gen.show(e instanceof Error ? e.message : "Rewrite failed.", "error");
    } finally {
      setBusy("");
    }
  }

  async function saveNurture() {
    if (!selected?.li) {
      save.show("Select a contact first.", "error");
      return;
    }
    const reply = text.trim();
    if (!reply) {
      save.show("Generate or write a message first.", "error");
      return;
    }

    // Flags whether the sent copy contained a calendar link, so the tracker
    // records that a booking link actually went out.
    let calFlag = "0";
    if (nurType === "Unsure" && criteriaIdx >= 0 && criteria[criteriaIdx]) {
      const raw = criteria[criteriaIdx].response || "";
      if (/\{\{CALENDAR_LINK\}\}|\{\{INSERT custom DTC|\[INSERT.*?calendar/i.test(raw)) calFlag = "1";
    }

    setBusy("save");
    try {
      await api("/api/recruiter/save-nurture", {
        method: "POST",
        body: JSON.stringify({
          li: selected.li,
          reply,
          nurtureType: effectiveNurType(),
          client,
          conversation: conversation.trim(),
          cal: calFlag,
          source
        })
      });
      save.show("Saved!", "success");
      setTimeout(() => {
        clearContact();
        setConversation("");
        save.hide();
        onSaved();
      }, 1500);
    } catch (e) {
      save.show(e instanceof Error ? e.message : "Save failed.", "error");
    } finally {
      setBusy("");
    }
  }

  const clientPaused = /paused/i.test(clients.find((c) => c.name === client)?.status || "");

  return (
    <>
      {/* ── CONTACT ── */}
      <div className="card">
        <label>Contact</label>
        <input
          type="text"
          value={search}
          placeholder="Type name to search…"
          autoComplete="off"
          onChange={(e) => setSearch(e.target.value)}
          onFocus={() => search.trim() && setShowResults(true)}
        />
        {showResults ? (
          <div className="contact-results show">
            {!results.length ? (
              <div className="contact-result">
                <span className="text-muted">No contacts found</span>
              </div>
            ) : (
              results.map((c, i) => (
                <div className="contact-result" key={`${c.li}-${i}`} onClick={() => selectContact(c)}>
                  <div className="cn">{c.name || c.li || "--"}</div>
                  <div className="cs">{[c.client, c.status].filter(Boolean).join(" · ")}</div>
                </div>
              ))
            )}
          </div>
        ) : null}

        {selected ? (
          <div style={{ marginTop: 6, padding: "7px 10px", background: "#f3eaff", borderRadius: 8, fontSize: 12 }}>
            <button
              className="btn btn-ghost btn-sm"
              style={{ float: "right", padding: "1px 6px" }}
              onClick={clearContact}
            >
              ✕
            </button>
            <strong>{selected.name || "--"}</strong> — <span className="text-muted">{selected.status}</span>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                marginTop: 2,
                color: selected.canyFlag === "Yes" ? "#b91c1c" : "#6b7280"
              }}
            >
              {selected.canyFlag === "Yes" ? "📍 CA/NY prospect" : "Not CA/NY"}
            </div>
          </div>
        ) : null}
      </div>

      <CanyBackfill />

      {/* ── CLIENT (AUTO-ASSIGNED) ── */}
      <div className="card">
        <div className="flex-between mb-8">
          <label style={{ margin: 0 }}>Client (Auto-Assigned)</label>
          <button className={`btn btn-sm ${rotationOpen ? "btn-primary" : "btn-ghost"}`} onClick={toggleRotation}>
            ⇄ Rotation
          </button>
        </div>

        <div
          style={{
            padding: "7px 10px",
            background: "#f3eaff",
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            color: client ? "#4a148c" : "#aaa",
            minHeight: 32,
            display: "flex",
            alignItems: "center"
          }}
        >
          {client || "-- Not Assigned --"}
        </div>

        {currentRatio ? (
          <div style={{ marginTop: 6 }}>
            <div className="text-muted">
              {currentRatio.count} contacts ({currentRatio.pct}%) | {currentRatio.todayCount} today
            </div>
            <div className="ratio-bar">
              <div className="ratio-fill" style={{ width: `${Math.min(currentRatio.pct, 100)}%` }} />
            </div>
          </div>
        ) : null}

        {clientPaused ? (
          <div className="msg msg-warn">
            ⏸ {client} is currently paused. Use Rotation to move this prospect to an active client.
          </div>
        ) : null}

        {rotationOpen ? (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #eee" }}>
            <div className="form-row">
              <label>Previous Client</label>
              <select value={prevClient} onChange={(e) => setPrevClient(e.target.value)}>
                <option value="">— Select —</option>
                {clients.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <label>Rotation Reason</label>
              <select value={rotationReason} onChange={(e) => changeRotationReason(e.target.value)}>
                <option value="">— Select reason —</option>
                {ROTATION_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : null}
      </div>

      {/* ── CONVERSATION ── */}
      <div className="form-row">
        <label>Conversation / Last Reply</label>
        <textarea
          value={conversation}
          rows={3}
          placeholder="Paste prospect's last message…"
          onChange={(e) => setConversation(e.target.value)}
        />
      </div>

      {continueMode ? (
        <div
          style={{
            marginBottom: 10,
            padding: "8px 10px",
            background: "#f5f3ff",
            border: "1px solid #ddd6fe",
            borderRadius: 6,
            fontSize: 12
          }}
        >
          <strong style={{ color: "#4a148c" }}>Continuing conversation</strong> — paste their latest reply above, then
          AI Generate or Custom + Rewrite. Client and follow-up stage are carried over automatically.
        </div>
      ) : (
        <div className="form-row">
          <label>Response Type</label>
          <TypeToggle<NurType>
            value={nurType}
            onChange={changeNurType}
            options={[
              { value: "Interested", label: "INT" },
              { value: "Unsure", label: "Unsure" },
              { value: "Client Rotation", label: "Rotation" },
              { value: "Not Interested", label: "Not Interested" }
            ]}
          />
        </div>
      )}

      {/* ── UNSURE CRITERIA ── */}
      {!continueMode && nurType === "Unsure" ? (
        <div
          style={{
            background: "#fff8f0",
            border: "1px solid #f0c070",
            borderRadius: 10,
            padding: 10,
            marginBottom: 10
          }}
        >
          <label style={{ color: "#c07000", marginBottom: 6 }}>Select Unsure Criteria</label>
          <div style={{ maxHeight: 200, overflowY: "auto" }}>
            {criteriaState === "loading" ? (
              <div style={{ color: "#888", fontSize: 11, padding: 4 }}>Loading criteria...</div>
            ) : criteriaState === "error" ? (
              <div style={{ color: "#dc2626", fontSize: 11, padding: 4 }}>Could not load criteria.</div>
            ) : !criteria.length ? (
              <div style={{ color: "#888", fontSize: 11, padding: 4 }}>No criteria found in Unsure Template tab.</div>
            ) : (
              criteria.map((item, idx) => (
                <div
                  key={`${item.code || idx}`}
                  onClick={() => selectCriterion(idx)}
                  style={{
                    padding: "6px 8px",
                    borderRadius: 6,
                    cursor: "pointer",
                    marginBottom: 4,
                    border: `1.5px solid ${idx === criteriaIdx ? "#c07000" : "#f0e0c0"}`,
                    background: idx === criteriaIdx ? "#fff3dc" : "#fff"
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 11, color: "#c07000" }}>{item.code || ""}</div>
                  <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{item.criteria || ""}</div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}

      {/* ── ACTIONS ── */}
      {nurType !== "Not Interested" ? (
        <div className="btn-group mb-8">
          {!continueMode && nurType === "Interested" ? (
            <button
              className="btn btn-outline btn-sm"
              title="Load another copy variant"
              disabled={busy === "template"}
              onClick={() => void loadTemplate("Interested")}
            >
              🔄 Refresh
            </button>
          ) : null}
          <button className="btn btn-primary btn-sm" disabled={busy === "generate"} onClick={() => void generate()}>
            {busy === "generate" ? "Generating…" : "✨ AI Generate"}
          </button>
          <button className="btn btn-outline btn-sm" onClick={useCustom}>
            ✎ Custom
          </button>
        </div>
      ) : null}

      <Message msg={gen.msg} />

      {showResult ? (
        <div>
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
            <button className="btn btn-primary btn-sm" disabled={busy === "save"} onClick={() => void saveNurture()}>
              {busy === "save" ? "Saving…" : "✓ Save"}
            </button>
          </div>
          <Message msg={save.msg} />
        </div>
      ) : null}
    </>
  );
}

/* ── CA/NY BACKFILL ─────────────────────────────────────────────────────────
   CA/NY is captured at outreach time going forward. This only backfills
   prospects added before that checkbox existed: search, tick, save once. */
function CanyBackfill() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Contact[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const { msg, show, hide } = useMsg();
  const debounced = useDebounced(query, 300);

  useEffect(() => {
    if (!open) return;
    const q = debounced.trim();
    if (!q) {
      setRows([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await api<{ contacts: Contact[] }>(`/api/recruiter/contacts?q=${encodeURIComponent(q)}`);
        if (cancelled) return;
        setRows(data.contacts || []);
        setChecked(new Set((data.contacts || []).filter((c) => c.canyFlag === "Yes").map((c) => c.li)));
      } catch {
        if (!cancelled) setRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debounced, open]);

  async function saveBatch() {
    const lis = Array.from(checked).filter(Boolean);
    if (!lis.length) {
      show("Check at least one contact first.", "error");
      return;
    }
    setBusy(true);
    try {
      const data = await toolPost<{ updated?: number }>("bulkSetCany", { lis });
      show(`✓ Updated ${data.updated || 0} contact(s).`, "success");
      setTimeout(() => {
        setOpen(false);
        hide();
      }, 1200);
    } catch (e) {
      show(e instanceof Error ? e.message : "Save failed.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ padding: "8px 10px" }}>
      <button
        className="btn btn-ghost btn-sm"
        style={{ width: "100%", textAlign: "left" }}
        onClick={() => {
          setOpen((v) => !v);
          setQuery("");
          setRows([]);
          hide();
        }}
      >
        ☑ Update CA/NY (old prospects)
      </button>

      {open ? (
        <div className="mt-8">
          <input
            type="text"
            value={query}
            placeholder="Search prospects…"
            autoComplete="off"
            onChange={(e) => setQuery(e.target.value)}
            style={{ marginBottom: 6 }}
          />
          <div style={{ maxHeight: 220, overflowY: "auto" }}>
            {!rows.length ? (
              <p className="text-muted" style={{ fontSize: 12, padding: 8 }}>
                {query.trim() ? "No matches." : "Type to search…"}
              </p>
            ) : (
              rows.map((c) => (
                <label
                  key={c.li}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "5px 2px",
                    borderBottom: "1px solid #f3eaff",
                    fontSize: 12,
                    textTransform: "none",
                    letterSpacing: 0
                  }}
                >
                  <input
                    type="checkbox"
                    style={{ width: "auto" }}
                    checked={checked.has(c.li)}
                    onChange={(e) => {
                      setChecked((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(c.li);
                        else next.delete(c.li);
                        return next;
                      });
                    }}
                  />
                  <span style={{ flex: 1 }}>
                    {c.name || c.li}
                    <span className="text-muted"> — {c.client || ""}</span>
                  </span>
                </label>
              ))
            )}
          </div>
          <div className="btn-group mt-8">
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void saveBatch()}>
              {busy ? "Saving…" : "💾 Save"}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
          <Message msg={msg} />
        </div>
      ) : null}
    </div>
  );
}
