"use client";

import { useState } from "react";

type ChatTurn = { role: "user" | "assistant"; text: string };
type PeriodKey = "today" | "yesterday" | "last7" | "last14" | "last28";
const PERIODS: Array<{ key: PeriodKey; label: string }> = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last7", label: "Last 7 Days" },
  { key: "last14", label: "Last 14 Days" },
  { key: "last28", label: "Last 28 Days" }
];

type ListModal = { title: string; rows: Array<{ label: string; sub?: string }> } | null;

function StatTile({ label, value, sub, onClick, color }: { label: string; value: string | number; sub?: string; onClick?: () => void; color?: string }) {
  return (
    <div className={`metric ${onClick ? "clickable" : ""}`} onClick={onClick} style={{ cursor: onClick ? "pointer" : undefined }}>
      <span>{label}</span>
      <strong style={color ? { color } : undefined}>{value}</strong>
      {sub && <div className="muted" style={{ fontSize: 11 }}>{sub}</div>}
    </div>
  );
}

function typeSubNote(counts?: { bdInhouse: number; ph: number }) {
  return `${counts?.bdInhouse ?? 0} BD/Inhouse · ${counts?.ph ?? 0} PH`;
}

function PeriodTable({ title, rows }: { title: string; rows: Array<{ label: string; counts: Record<PeriodKey, number | null> }> }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>{title}</th>{PERIODS.map((p) => <th key={p.key}>{p.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td>{row.label}</td>
              {PERIODS.map((p) => <td key={p.key}>{row.counts[p.key] ?? "—"}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function GrowthConsole({ session, initial, loadError }: { session: { name: string; email: string }; initial: any; loadError?: string }) {
  const [data, setData] = useState(initial);
  const [tab, setTab] = useState<"dashboard" | "recruiters" | "clients" | "finance" | "tasks" | "reports" | "linkbooking" | "vendors">("dashboard");
  const [task, setTask] = useState({ title: "", topic: "", priority: "Normal", description: "" });
  const [cost, setCost] = useState({ amount: "", description: "", notes: "" });
  const [payment, setPayment] = useState({ clientName: "", totalBilled: "", status: "Paid", invoiceRef: "" });
  const [message, setMessage] = useState("");
  const [listModal, setListModal] = useState<ListModal>(null);

  const [brainstormOpen, setBrainstormOpen] = useState(false);
  const [chat, setChat] = useState<ChatTurn[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);

  const [impersonateRole, setImpersonateRole] = useState<"operations" | "recruiter" | null>(null);
  const [impersonateOptions, setImpersonateOptions] = useState<Array<{ email: string; name: string }>>([]);

  const [recruitersLoaded, setRecruitersLoaded] = useState(false);
  const [onlineStatus, setOnlineStatus] = useState<any>(null);
  const [leaveToday, setLeaveToday] = useState<any[]>([]);
  const [leaveTomorrow, setLeaveTomorrow] = useState<any[]>([]);
  const [nurtureFu, setNurtureFu] = useState<any>(null);
  const [feedbackDate, setFeedbackDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [feedbackRows, setFeedbackRows] = useState<any[] | null>(null);

  // ── Client Tracker ──────────────────────────────────────────────────────
  const [clientTrackerLoaded, setClientTrackerLoaded] = useState(false);
  const [clientRows, setClientRows] = useState<any[]>([]);
  const [ctSearch, setCtSearch] = useState("");
  const [ctMsg, setCtMsg] = useState<{ text: string; kind: "error" | "success" } | null>(null);
  const [clientModal, setClientModal] = useState<"add" | "update" | "archive" | "markLedger" | "ledgerCsv" | "waitlist" | null>(null);
  const [slotCheckClient, setSlotCheckClient] = useState<string | null>(null);
  const [vacationCheckClient, setVacationCheckClient] = useState<string | null>(null);
  const emptyAddClient = {
    clientName: "", vertical: "Broker", packageType: "", accountConnectDate: new Date().toISOString().slice(0, 10),
    quota: "", targetAvgLeadsDay: "", cycle: "1", chargeAmt: "", payment: "AUTO", currentCycleStart: new Date().toISOString().slice(0, 10),
    launchDate: "", currentStatus: "Not Started", pausedReason: "", vacationEta: "", vacationTbd: false, actionTaken: "",
    paymentNotes: "", quotaNotes: "", acctAuthority: "", cycleLedgerEmail: "", calendlyEmail: "", distributionList: "",
    crm: "", crmName: "", crmAddress: "", eventUrl: "", userEmailGoogle: "", pw: "", tenant: "", tenantPd: "", webprofile: "", aboutLi: ""
  };
  const [addClientForm, setAddClientForm] = useState<typeof emptyAddClient>(emptyAddClient);
  const emptyUpdateClient = {
    clientName: "", quota: "", targetAvgLeadsDay: "", cycle: "", chargeAmt: "", payment: "", currentCycleStart: "",
    launchDate: "", currentStatus: "Not Started", pausedReason: "", vacationEta: "", vacationTbd: false, vertical: "",
    packageType: "", actionTaken: "", paymentNotes: "", quotaNotes: ""
  };
  const [updateClientForm, setUpdateClientForm] = useState<typeof emptyUpdateClient>(emptyUpdateClient);
  const [archiveForm, setArchiveForm] = useState({ clientName: "", reason: "" });
  const [markLedgerForm, setMarkLedgerForm] = useState({ clientName: "", cycle: "" });
  const [ledgerCsvClient, setLedgerCsvClient] = useState("");
  const [waitlistForm, setWaitlistForm] = useState({ date: new Date().toISOString().slice(0, 10), clientName: "", contactEmail: "", eta: "", notes: "" });

  async function openClientsTab() {
    setTab("clients");
    if (clientTrackerLoaded) return;
    setClientTrackerLoaded(true);
    try {
      const payload = await action({ action: "clientTrackerAll" });
      setClientRows(payload.clients || []);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not load Client Tracker");
    }
  }

  async function reloadClientTracker() {
    try {
      const payload = await action({ action: "clientTrackerAll" });
      setClientRows(payload.clients || []);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not load Client Tracker");
    }
  }

  function ctFail(e: unknown) {
    setCtMsg({ text: e instanceof Error ? e.message : "Action failed", kind: "error" });
  }

  async function saveAddClient() {
    if (!addClientForm.clientName.trim() || !addClientForm.quota) {
      setCtMsg({ text: "Client Name and Quota are required.", kind: "error" });
      return;
    }
    try {
      const payload = await action({ action: "addClient", data: { ...addClientForm, vacationEta: addClientForm.vacationTbd ? "" : addClientForm.vacationEta } });
      if (payload.error) { setCtMsg({ text: payload.error, kind: "error" }); return; }
      setClientModal(null);
      setAddClientForm(emptyAddClient);
      await reloadClientTracker();
    } catch (e) { ctFail(e); }
  }

  function prefillUpdateClient(name: string) {
    const c = clientRows.find((x) => x.name === name);
    setUpdateClientForm({
      clientName: name,
      quota: c?.quota ?? "", targetAvgLeadsDay: c?.targetAvgPerDay ?? "", cycle: c?.cycleNumber ?? "",
      chargeAmt: c?.chargeAmt ?? "", payment: c?.payment ?? "", currentCycleStart: c?.currentCycleStart ?? "",
      launchDate: c?.launchDate ?? "", currentStatus: c?.currentStatus || "Not Started", pausedReason: "",
      vacationEta: "", vacationTbd: false, vertical: c?.vertical ?? "", packageType: c?.packageType ?? "",
      actionTaken: c?.actionTaken ?? "", paymentNotes: c?.paymentNotes ?? "", quotaNotes: c?.quotaNotes ?? ""
    });
  }

  async function saveUpdateClient() {
    if (!updateClientForm.clientName) {
      setCtMsg({ text: "Select a client first.", kind: "error" });
      return;
    }
    const { clientName, vacationTbd, ...rest } = updateClientForm;
    try {
      const payload = await action({ action: "updateClient", clientName, data: { ...rest, vacationEta: vacationTbd ? "" : rest.vacationEta } });
      if (payload.error) { setCtMsg({ text: payload.error, kind: "error" }); return; }
      setClientModal(null);
      await reloadClientTracker();
    } catch (e) { ctFail(e); }
  }

  async function saveArchiveClient() {
    if (!archiveForm.clientName || !archiveForm.reason.trim()) {
      setCtMsg({ text: "Select a client and enter a reason.", kind: "error" });
      return;
    }
    if (!window.confirm(`Archive "${archiveForm.clientName}"? This removes it from the active Client Tracker.`)) return;
    try {
      const payload = await action({ action: "archiveClient", clientName: archiveForm.clientName, reason: archiveForm.reason });
      if (payload.error) { setCtMsg({ text: payload.error, kind: "error" }); return; }
      setClientModal(null);
      setArchiveForm({ clientName: "", reason: "" });
      await reloadClientTracker();
    } catch (e) { ctFail(e); }
  }

  async function saveMarkLedgerSent() {
    if (!markLedgerForm.clientName || !markLedgerForm.cycle) {
      setCtMsg({ text: "Select a client and enter a cycle number.", kind: "error" });
      return;
    }
    try {
      const payload = await action({ action: "markLedgerSent", clientName: markLedgerForm.clientName, cycleNumber: markLedgerForm.cycle });
      if (payload.error) { setCtMsg({ text: payload.error, kind: "error" }); return; }
      setCtMsg({ text: payload.message || `Labeled ${payload.labeled} lead(s) as "${payload.newLabel}".`, kind: "success" });
    } catch (e) { ctFail(e); }
  }

  async function copyLedgerEmailPart(part: "subject" | "body" | "email") {
    const { clientName, cycle } = markLedgerForm;
    if (!clientName || !cycle) { setCtMsg({ text: "Select a client and enter a cycle number.", kind: "error" }); return; }
    try {
      let text = "";
      if (part === "subject") text = `Cycle ${cycle} Lead Delivery`;
      else if (part === "body") {
        const firstName = clientName.replace(/^Franchise\s+/i, "").split(/\s+/)[0] || clientName;
        text = `Hi ${firstName},\nAttached is the cycle ${cycle} lead ledger for your review.\n\nPlease let us know if you have any questions.`;
      } else {
        const payload = await action({ action: "getClientEmail", clientName });
        if (payload.error) { setCtMsg({ text: payload.error, kind: "error" }); return; }
        if (!payload.recipientEmail) { setCtMsg({ text: "No cycle-ledger email on file for this client.", kind: "error" }); return; }
        text = payload.recipientEmail;
      }
      await navigator.clipboard.writeText(text);
      setCtMsg({ text: `${part === "subject" ? "Subject" : part === "body" ? "Body" : "Email (" + text + ")"} copied to clipboard.`, kind: "success" });
    } catch (e) { ctFail(e); }
  }

  function csvEscape(v: unknown) {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  async function exportLedgerCsv() {
    if (!ledgerCsvClient) return;
    try {
      const payload = await action({ action: "getLedgerCsvRows", clientName: ledgerCsvClient });
      if (payload.error) { setCtMsg({ text: payload.error, kind: "error" }); return; }
      const rows: any[] = payload.rows || [];
      if (!rows.length) { setCtMsg({ text: "No current-cycle leads found for this client.", kind: "error" }); return; }
      const headers = ["Client / Campaign", "Name", "Email", "Phone", "Company", "Title", "LinkedIn URL", "Location", "State", "Date Created"];
      const lines = [headers.map(csvEscape).join(",")];
      rows.forEach((r) => lines.push([r.clientCampaign, r.name, r.email, r.phone, r.company, r.title, r.linkedinUrl, r.location, r.state, r.dateCreated].map(csvEscape).join(",")));
      const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${ledgerCsvClient.replace(/[^a-z0-9]+/gi, "_")}_ledger.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setClientModal(null);
    } catch (e) { ctFail(e); }
  }

  async function saveAddWaitlist() {
    if (!waitlistForm.clientName.trim()) {
      setCtMsg({ text: "Client Name is required.", kind: "error" });
      return;
    }
    try {
      const payload = await action({ action: "addWaitlist", ...waitlistForm });
      if (payload.error) { setCtMsg({ text: payload.error, kind: "error" }); return; }
      setClientModal(null);
      setWaitlistForm({ date: new Date().toISOString().slice(0, 10), clientName: "", contactEmail: "", eta: "", notes: "" });
    } catch (e) { ctFail(e); }
  }

  async function logSlotCheck(resultType: "available" | "not_available") {
    if (!slotCheckClient) return;
    try {
      const payload = await action({ action: "logSlotCheck", clientName: slotCheckClient, resultType });
      if (payload.error) { setMessage(payload.error); return; }
      setSlotCheckClient(null);
      await reloadClientTracker();
    } catch (e) { setMessage(e instanceof Error ? e.message : "Action failed"); }
  }

  async function logVacationCheck(resultType: "back" | "still_away") {
    if (!vacationCheckClient) return;
    try {
      const payload = await action({ action: "logVacationCheck", clientName: vacationCheckClient, resultType });
      if (payload.error) { setMessage(payload.error); return; }
      setVacationCheckClient(null);
      await reloadClientTracker();
    } catch (e) { setMessage(e instanceof Error ? e.message : "Action failed"); }
  }

  function shouldShowVacationBadge(pausedReason: string) {
    const m = /PAUSED Vacation.*\|\s*ETA\s+(\d{4}-\d{2}-\d{2}|TBD)/i.exec(pausedReason || "");
    if (!m) return false;
    const eta = m[1];
    if (eta === "TBD") {
      const dow = new Date().getDay();
      return dow === 1 || dow === 4;
    }
    return new Date().toISOString().slice(0, 10) >= eta;
  }

  function statusCellColor(status: string) {
    const s = String(status || "").toLowerCase();
    if (s.indexOf("fire") >= 0) return "#f6b26b";
    if (s.indexOf("smok") >= 0) return "#00ffff";
    if (s.indexOf("track") >= 0) return "#00b621";
    if (s.indexOf("improv") >= 0) return "#ffff00";
    if (s.indexOf("not started") >= 0) return "#efa6a6";
    if (s.indexOf("pause") >= 0) return "#ff3232";
    return "";
  }

  function quotaPctCellColor(pct: number) {
    const n = Number(pct) || 0;
    if (n >= 100) return "#00ff39";
    if (n >= 85) return "#da8cd7";
    return "";
  }

  const filteredClientRows = ctSearch.trim()
    ? clientRows.filter((c) => String(c.name || "").toLowerCase().includes(ctSearch.trim().toLowerCase()))
    : clientRows;
  const [showTop5, setShowTop5] = useState(false);
  const [showNonProd, setShowNonProd] = useState(false);
  const [s2aRange, setS2aRange] = useState({ startDate: "", endDate: "" });
  const [s2aRangeData, setS2aRangeData] = useState<any>(null);
  const [s2aRangeVisible, setS2aRangeVisible] = useState(5);

  const [reportsLoaded, setReportsLoaded] = useState(false);
  const [directory, setDirectory] = useState<any>(null);
  const [directorySort, setDirectorySort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "sendsYesterday", dir: "desc" });

  async function reload() {
    const res = await fetch("/api/growth");
    const payload = await res.json();
    setData((prev: any) => ({ ...prev, ...payload, dashboard: prev.dashboard }));
  }
  async function action(body: Record<string, unknown>) {
    setMessage("");
    const res = await fetch("/api/growth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await res.json();
    if (!res.ok || payload.error) throw new Error(payload.error || "Growth action failed");
    return payload;
  }
  async function doAction(body: Record<string, unknown>) {
    try {
      await action(body);
      await reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Action failed");
    }
  }

  async function openRecruitersTab() {
    setTab("recruiters");
    if (recruitersLoaded) return;
    setRecruitersLoaded(true);
    // Each panel loads and renders independently — previously these were
    // bundled behind one Promise.all, so a single slow call (e.g. the old
    // live-Sheet nurture/FU scan) left every panel stuck on "Loading..."
    // even though its own data had already arrived.
    action({ action: "onlineStatus" }).then(setOnlineStatus).catch((e) => setMessage(e instanceof Error ? e.message : "Could not load recruiter status"));
    action({ action: "leaveToday" }).then((r) => setLeaveToday(r.rows || [])).catch(() => {});
    action({ action: "leaveTomorrow" }).then((r) => setLeaveTomorrow(r.rows || [])).catch(() => {});
    action({ action: "nurtureFuStats" }).then(setNurtureFu).catch((e) => setMessage(e instanceof Error ? e.message : "Could not load nurture/FU stats"));
    void loadFeedbackForDate(feedbackDate);
  }

  async function loadFeedbackForDate(date: string) {
    setFeedbackDate(date);
    try {
      const payload = await action({ action: "feedbackByDate", date });
      setFeedbackRows(payload.rows || []);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not load feedback");
    }
  }

  async function openReportsTab() {
    setTab("reports");
    if (reportsLoaded) return;
    setReportsLoaded(true);
    action({ action: "recruiterDirectory" }).then(setDirectory).catch((e) => setMessage(e instanceof Error ? e.message : "Could not load recruiter directory"));
  }

  function toggleDirectorySort(key: string) {
    setDirectorySort((prev) => ({ key, dir: prev.key === key && prev.dir === "desc" ? "asc" : "desc" }));
  }

  const directoryRows = (directory?.rows || []).slice().sort((a: any, c: any) => {
    const dir = directorySort.dir === "desc" ? -1 : 1;
    const av = a[directorySort.key];
    const cv = c[directorySort.key];
    if (typeof av === "string") return av.localeCompare(cv) * dir;
    return ((av ?? 0) - (cv ?? 0)) * dir;
  });

  async function loadS2ARange(startDate: string, endDate: string) {
    setS2aRange({ startDate, endDate });
    setS2aRangeVisible(5);
    try {
      setS2aRangeData(await action({ action: "s2aRange", startDate, endDate }));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not load date range");
    }
  }

  function quickRange(days: number) {
    const end = new Date();
    const start = new Date(end.getTime() - (days - 1) * 86400000);
    void loadS2ARange(start.toISOString().slice(0, 10), end.toISOString().slice(0, 10));
  }

  async function sendChat() {
    const question = chatInput.trim();
    if (!question) return;
    const nextChat: ChatTurn[] = [...chat, { role: "user", text: question }];
    setChat(nextChat);
    setChatInput("");
    setChatBusy(true);
    try {
      const payload = await action({ action: "brainstorm", question, history: nextChat });
      setChat((c) => [...c, { role: "assistant", text: payload.reply || "" }]);
    } catch (e) {
      setChat((c) => [...c, { role: "assistant", text: e instanceof Error ? e.message : "Brainstorm failed" }]);
    } finally {
      setChatBusy(false);
    }
  }

  async function openImpersonatePicker(role: "operations" | "recruiter") {
    setImpersonateRole(role);
    setImpersonateOptions([]);
    try {
      const payload = await action({ action: role === "operations" ? "listOpsUsers" : "listRecruiters" });
      setImpersonateOptions(payload.users || []);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not load user list");
    }
  }

  async function impersonate(targetEmail: string) {
    try {
      const payload = await action({ action: "impersonate", targetEmail });
      window.location.href = payload.page || "/";
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Impersonation failed");
    }
  }

  const unreviewedFeedback = (data.feedback || []).filter((f: any) => !f.reviewed);
  const dash = data.dashboard || {};
  const clients = dash.clients || {};
  const appts = dash.appts || {};
  const allAppt = dash.allAppt || { received: {}, process: {}, recall: {}, recallReasons: {} };
  const recruitersSummary = dash.recruiters || {};
  const sends = dash.sends || {};
  const s2aByType = dash.s2aByType || {};

  function showClientBucket(bucket: string, label: string) {
    const names: string[] = clients.byBucket?.[bucket] || [];
    setListModal({ title: `${label} (${names.length})`, rows: names.map((n) => ({ label: n })) });
  }

  // Wait List tile is a literal separate sheet tab (prospective clients not
  // yet launched) — distinct from the Master-Tracker "waitlist" status
  // bucket above, which showClientBucket handles. Fetched fresh on click
  // since it's a small, infrequently-checked list.
  async function showWaitList() {
    try {
      const payload = await action({ action: "waitList" });
      const rows: Array<{ name: string; sub: string }> = payload.rows || [];
      setListModal({ title: `Wait List (${rows.length})`, rows: rows.map((r) => ({ label: r.name, sub: r.sub })) });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not load Wait List");
    }
  }

  function showRecruiterStatusBucket(bucket: string, label: string) {
    const rows: any[] = onlineStatus?.[bucket] || [];
    setListModal({ title: `${label} (${rows.length})`, rows: rows.map((r) => ({ label: r.name, sub: `${r.type}${r.lastSeen ? ` — last seen ${new Date(r.lastSeen).toLocaleString()}` : ""}` })) });
  }

  function showLeaveModal(rows: any[], title: string) {
    setListModal({ title: `${title} (${rows.length})`, rows: rows.map((r) => ({ label: r.name, sub: `${r.leaveDate} → ${r.endDate}${r.reason ? ` — ${r.reason}` : ""}` })) });
  }

  function showSendsModal(period: PeriodKey, label: string) {
    const rows: any[] = sends.sendsByRecruiterList?.[period] || [];
    setListModal({ title: `Sends — ${label} (${rows.length})`, rows: rows.map((r) => ({ label: r.name, sub: `${r.type} — ${r.count} sent` })) });
  }

  return (
    <main className="app-shell wide">
      <div className="topbar">
        <div className="topbar-title">
          <div className="brand">Franbooking</div>
          <h1>Growth Dashboard</h1>
          <div className="muted">{session.name} | {session.email}</div>
        </div>
        <button className="btn btn-outline" onClick={reload}>Refresh</button>
      </div>

      {loadError && <div className="notice error">Growth data failed to load: {loadError}</div>}
      {message && <div className="notice error">{message}</div>}

      {/* Pinned block — always visible above the tabs, matching GAS */}
      <section className="panel" style={{ background: "#eef0ff", borderColor: "#dfe3ff" }}>
        <div className="section-head"><h2>🏢 Client Status</h2><span className="muted">Click a number for the list</span></div>
        <section className="metric-grid">
          <StatTile label="On Fire" value={clients.onFire ?? 0} color="#dc2626" onClick={() => showClientBucket("onFire", "On Fire")} />
          <StatTile label="Smokin" value={clients.smokin ?? 0} color="#ea580c" onClick={() => showClientBucket("smokin", "Smokin")} />
          <StatTile label="On Track" value={clients.onTrack ?? 0} color="#0891b2" onClick={() => showClientBucket("onTrack", "On Track")} />
          <StatTile label="Improving" value={clients.improving ?? 0} color="#2563eb" onClick={() => showClientBucket("improving", "Improving")} />
          <StatTile label="Paused" value={clients.paused ?? 0} color="#b45309" onClick={() => showClientBucket("paused", "Paused")} />
          <StatTile label="Active Clients" value={clients.activeClients ?? 0} color="#059669" />
          <StatTile label="Wait List" value={clients.waitlistTabCount ?? 0} onClick={showWaitList} />
        </section>

        <div className="section-head" style={{ marginTop: 14 }}><h2>📅 Appointments</h2></div>
        <section className="metric-grid">
          <StatTile label="Today" value={appts.today ?? 0} />
          <StatTile label="Yesterday" value={appts.yesterday ?? 0} />
          <StatTile label="Last 7 Days" value={appts.last7 ?? 0} />
          <StatTile label="Last 14 Days" value={appts.last14 ?? 0} />
          <StatTile label="Last 28 Days" value={appts.last28 ?? 0} />
          <StatTile label="Total Appt So Far" value={appts.total ?? 0} />
        </section>

        <div className="section-head" style={{ marginTop: 14 }}><h2>📥 All Appointments</h2><span className="muted">Master sheet — every appointment received</span></div>
        <PeriodTable
          title=""
          rows={[
            { label: "Received", counts: allAppt.received || {} },
            { label: "Process", counts: allAppt.process || {} },
            { label: "Recall", counts: allAppt.recall || {} }
          ]}
        />
        <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
          Recall reasons (all-time) — Looking for Job: <strong>{allAppt.recallReasons?.lookingForJob ?? 0}</strong> &nbsp;
          Vendor: <strong>{allAppt.recallReasons?.vendor ?? 0}</strong> &nbsp;
          Other: <strong>{allAppt.recallReasons?.other ?? 0}</strong>
        </div>
      </section>

      {tab === "dashboard" ? (
        <section className="panel">
          <div className="section-head"><h2>Sections</h2></div>
          <p className="muted" style={{ margin: 0 }}>Select a section below to see its full details.</p>
          <div className="section-tile-grid">
            <button className="section-tile" onClick={() => setTab("tasks")}>
              <span className="section-tile-icon">📋</span>
              <span>
                <div className="section-tile-title">Daily Task</div>
                <div className="muted">Personal task list grouped by topic — priority, ETA/TBD, and auto-generated recurring tasks</div>
              </span>
            </button>
            <button className="section-tile" onClick={openRecruitersTab}>
              <span className="section-tile-icon">👥</span>
              <span>
                <div className="section-tile-title">Recruiters <span className="muted" style={{ fontWeight: 400 }}>(Recruiter Activity)</span></div>
                <div className="muted">Active recruiters, overall S2A, Sends, S2A by recruiter, Top 5 &amp; Non-Productive lists</div>
              </span>
            </button>
            <button className="section-tile" onClick={openClientsTab}>
              <span className="section-tile-icon">🏢</span>
              <span>
                <div className="section-tile-title">Client Tracker</div>
                <div className="muted">Every client — quota, cycle, status, and payment in one table</div>
              </span>
            </button>
            <button className="section-tile" onClick={() => setTab("linkbooking")}>
              <span className="section-tile-icon">🔗</span>
              <span>
                <div className="section-tile-title">Link Open vs Booking</div>
                <div className="muted">Per-client Calendly funnel from Google Analytics — Views, Select Time, Booked, Drop Off</div>
              </span>
            </button>
            <button className="section-tile" onClick={() => setTab("finance")}>
              <span className="section-tile-icon">💰</span>
              <span>
                <div className="section-tile-title">Finance <span className="muted" style={{ fontWeight: 400 }}>(Cost &amp; Payments)</span></div>
                <div className="muted">Company age, all-time cost &amp; earnings, and adding new cost/payment entries</div>
              </span>
            </button>
            <button className="section-tile" onClick={openReportsTab}>
              <span className="section-tile-icon">📈</span>
              <span>
                <div className="section-tile-title">Reports <span className="muted" style={{ fontWeight: 400 }}>(Billing Cycle &amp; Directory)</span></div>
                <div className="muted">Billing cycle trends per recruiter, plus a Recruiter Directory of all-time appts, sends &amp; Sales Nav seats</div>
              </span>
            </button>
            <button className="section-tile" onClick={() => setTab("vendors")}>
              <span className="section-tile-icon">🏬</span>
              <span>
                <div className="section-tile-title">Vendor Management</div>
                <div className="muted">Every LI profile by vendor — issue history, vendor feedback, replacements, and downtime per cycle</div>
              </span>
            </button>
          </div>
        </section>
      ) : (
        <div className="actions" style={{ marginTop: 14, marginBottom: 4 }}>
          <button className="btn btn-outline" onClick={() => setTab("dashboard")}>← Dashboard</button>
        </div>
      )}

      {tab === "dashboard" && (
        <>
          <section className="grid two">
            <div className="panel">
              <div className="section-head"><h2>Recent Feedback</h2><span className="badge">{unreviewedFeedback.length} unreviewed</span></div>
              <div className="compact-list">
                {unreviewedFeedback.slice(0, 8).map((f: any) => (
                  <div className="compact-row" key={f.id}>
                    <strong>{f.name}</strong>
                    <span>{f.responses_today || 0} responses | {f.comments || f.unusual}</span>
                    <button className="btn btn-outline" onClick={() => doAction({ action: "markFeedbackReviewed", id: f.id })}>Reviewed</button>
                  </div>
                ))}
                {unreviewedFeedback.length === 0 && <div className="muted">Nothing to review.</div>}
              </div>
            </div>
            <div className="panel">
              <h2>Recent Appointments</h2>
              <div className="compact-list">
                {(data.appointments || []).slice(0, 8).map((a: any) => (
                  <div className="compact-row" key={a.id}><strong>{a.invitee_name}</strong><span>{a.client_name} | {a.status}</span></div>
                ))}
              </div>
            </div>
          </section>
          <section className="panel">
            <h2>👁 Impersonate</h2>
            <div className="actions">
              <button className="btn btn-outline" onClick={() => openImpersonatePicker("operations")}>Operations Panel →</button>
              <button className="btn btn-outline" onClick={() => openImpersonatePicker("recruiter")}>Recruiter Panel →</button>
            </div>
            {impersonateRole && (
              <div className="compact-list">
                {impersonateOptions.length === 0 && <div className="muted">Loading...</div>}
                {impersonateOptions.map((u) => (
                  <button key={u.email} className="compact-row compact-button" onClick={() => impersonate(u.email)}>
                    <strong>{u.name}</strong><span>{u.email}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {tab === "recruiters" && (
        <>
          <section className="panel">
            <div className="section-head"><h2>👥 Recruiter Activity</h2></div>
            <section className="metric-grid">
              <StatTile label="Active Recruiters" value={recruitersSummary.active ?? 0} sub={`${recruitersSummary.bdInhouseCount ?? 0} BD/Inhouse · ${recruitersSummary.phCount ?? 0} PH`} />
              <StatTile label="Active Sales Nav" value={recruitersSummary.activeSalesNav ?? 0} />
            </section>
          </section>

          <section className="panel">
            <div className="section-head"><h2>🟢 Recruiter Status</h2><span className="muted">From Time Log — click a number for the list</span></div>
            {!onlineStatus && <div className="muted">Loading...</div>}
            {onlineStatus && (
              <section className="metric-grid">
                <StatTile label="Online Now" value={onlineStatus.online?.length ?? 0} sub={typeSubNote(onlineStatus.counts?.online)} color="#059669" onClick={() => showRecruiterStatusBucket("online", "Online Now")} />
                <StatTile label="Offline" value={onlineStatus.offline?.length ?? 0} sub={typeSubNote(onlineStatus.counts?.offline)} color="#6b7280" onClick={() => showRecruiterStatusBucket("offline", "Offline")} />
                <StatTile label="Not Started Today" value={onlineStatus.notStarted?.length ?? 0} sub={typeSubNote(onlineStatus.counts?.notStarted)} color="#dc2626" onClick={() => showRecruiterStatusBucket("notStarted", "Not Started Today")} />
                <StatTile label="Inactive 5+ Days" value={onlineStatus.inactive5d?.length ?? 0} sub={typeSubNote(onlineStatus.counts?.inactive5d)} color="#b45309" onClick={() => showRecruiterStatusBucket("inactive5d", "Inactive 5+ Days")} />
                <StatTile label="On Leave Today" value={leaveToday.length} color="#0891b2" onClick={() => showLeaveModal(leaveToday, "On Leave Today")} />
                <StatTile label="On Leave Tomorrow" value={leaveTomorrow.length} color="#0891b2" onClick={() => showLeaveModal(leaveTomorrow, "On Leave Tomorrow")} />
              </section>
            )}
          </section>

          <section className="panel">
            <div className="section-head"><h2>📊 S2A by Type</h2><span className="muted">Sends per appointment</span></div>
            <PeriodTable
              title=""
              rows={(["BD/Inhouse", "PH"] as const).map((type) => ({
                label: type,
                counts: Object.fromEntries(PERIODS.map((p) => [p.key, s2aByType[type]?.[p.key]?.sendsPerAppt ?? null])) as Record<PeriodKey, number | null>
              }))}
            />
          </section>

          <section className="panel">
            <div className="section-head"><h2>📤 Sends</h2><span className="muted">Click a number to see who sent them</span></div>
            <section className="metric-grid">
              {PERIODS.map((p) => (
                <StatTile
                  key={p.key}
                  label={p.label}
                  value={sends[p.key] ?? 0}
                  sub={`${s2aByType["BD/Inhouse"]?.[p.key]?.sends ?? 0} BD/Inhouse · ${s2aByType.PH?.[p.key]?.sends ?? 0} PH`}
                  onClick={() => showSendsModal(p.key, p.label)}
                />
              ))}
            </section>
          </section>

          <section className="panel">
            <div className="section-head"><h2>💬 New Nurture Sent</h2><span className="muted">First nurture message ever sent</span></div>
            {!nurtureFu && <div className="muted">Loading...</div>}
            {nurtureFu && (
              <section className="metric-grid">
                {PERIODS.map((p) => <StatTile key={p.key} label={p.label} value={nurtureFu.newNurture?.[p.key] ?? 0} />)}
              </section>
            )}
          </section>

          <section className="panel">
            <div className="section-head"><h2>🔁 FU Sent</h2><span className="muted">FU1 + FU2 + FU3 combined</span></div>
            {!nurtureFu && <div className="muted">Loading...</div>}
            {nurtureFu && (
              <>
                <section className="metric-grid">
                  {PERIODS.map((p) => <StatTile key={p.key} label={p.label} value={nurtureFu.fuSent?.[p.key] ?? 0} />)}
                </section>
                <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                  FU1: <strong>{nurtureFu.fuSent?.byStage?.fu1 ?? 0}</strong> · FU2: <strong>{nurtureFu.fuSent?.byStage?.fu2 ?? 0}</strong> · FU3: <strong>{nurtureFu.fuSent?.byStage?.fu3 ?? 0}</strong>
                </div>
              </>
            )}
          </section>

          <section className="panel">
            <div className="actions">
              <button className="btn btn-outline" onClick={() => setShowTop5((v) => !v)}>🏆 Top 5 by Appointments (14d)</button>
              <button className="btn btn-outline" onClick={() => setShowNonProd((v) => !v)}>⚠️ Non-Productive Recruiters (14d)</button>
            </div>
            {showTop5 && (
              <div className="compact-list">
                {(recruitersSummary.top5ByAppts || []).map((r: any, idx: number) => (
                  <div className="compact-row" key={r.email}><strong>#{idx + 1} {r.name}</strong><span>{r.appts14} appt / {r.sends14} sent — {r.s2a}% S2A</span></div>
                ))}
                {(!recruitersSummary.top5ByAppts || recruitersSummary.top5ByAppts.length === 0) && <div className="muted">No data.</div>}
              </div>
            )}
            {showNonProd && (
              <div className="compact-list">
                {(recruitersSummary.nonProductive || []).map((r: any) => (
                  <div className="compact-row" key={r.email}><strong>{r.name}</strong><span className="badge">0 appts</span></div>
                ))}
                {(!recruitersSummary.nonProductive || recruitersSummary.nonProductive.length === 0) && <div className="muted">Everyone booked at least 1 appointment.</div>}
              </div>
            )}
          </section>

          <section className="panel">
            <h2>📆 Daily Appointment by Recruiters</h2>
            <div className="form-grid admin-create-grid">
              <label>Start<input type="date" value={s2aRange.startDate} onChange={(e) => setS2aRange({ ...s2aRange, startDate: e.target.value })} /></label>
              <label>End<input type="date" value={s2aRange.endDate} onChange={(e) => setS2aRange({ ...s2aRange, endDate: e.target.value })} /></label>
              <button className="btn btn-outline" onClick={() => loadS2ARange(s2aRange.startDate, s2aRange.endDate)}>Apply</button>
              <button className="btn btn-outline" onClick={() => quickRange(1)}>Today</button>
              <button className="btn btn-outline" onClick={() => quickRange(2)}>Yesterday+Today</button>
              <button className="btn btn-outline" onClick={() => quickRange(7)}>Last 7 Days</button>
              <button className="btn btn-outline" onClick={() => quickRange(14)}>Last 14 Days</button>
              <button className="btn btn-outline" onClick={() => quickRange(28)}>Last 28 Days</button>
            </div>
            {s2aRangeData && (
              <>
                <div className="muted" style={{ margin: "8px 0" }}>
                  Overall S2A — BD/Inhouse: {s2aRangeData.byType?.["BD/Inhouse"]?.s2a ?? 0}% ({s2aRangeData.byType?.["BD/Inhouse"]?.appts ?? 0}/{s2aRangeData.byType?.["BD/Inhouse"]?.sends ?? 0}) ·
                  {" "}PH: {s2aRangeData.byType?.PH?.s2a ?? 0}% ({s2aRangeData.byType?.PH?.appts ?? 0}/{s2aRangeData.byType?.PH?.sends ?? 0})
                </div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Recruiter</th><th>Type</th><th>Appointments</th><th>Sends</th><th>S2A</th></tr></thead>
                    <tbody>
                      {(s2aRangeData.rows || []).slice(0, s2aRangeVisible).map((r: any) => (
                        <tr key={r.name}><td>{r.name}</td><td>{r.type}</td><td>{r.appts}</td><td>{r.sends}</td><td>{r.s2a}%</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {s2aRangeData.rows && s2aRangeVisible < s2aRangeData.rows.length && (
                  <button className="btn btn-outline" onClick={() => setS2aRangeVisible((v) => v + 10)}>Load More</button>
                )}
              </>
            )}
          </section>

          <section className="panel">
            <div className="section-head"><h2>📝 Daily Feedback</h2></div>
            <div className="actions" style={{ marginBottom: 10 }}>
              <label>Date<input type="date" value={feedbackDate} onChange={(e) => setFeedbackDate(e.target.value)} /></label>
              <button className="btn btn-outline" onClick={() => loadFeedbackForDate(feedbackDate)}>Apply</button>
              <button className="btn btn-outline" onClick={() => loadFeedbackForDate(new Date().toISOString().slice(0, 10))}>Today</button>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Date</th><th>Name</th><th>All Sales Nav</th><th>Unusual Activity</th><th>Responses Today</th><th>Additional Comments</th><th>Action</th></tr>
                </thead>
                <tbody>
                  {(feedbackRows || []).map((f: any) => (
                    <tr key={f.id}>
                      <td>{f.submitted_date}</td>
                      <td>{f.name}</td>
                      <td>{f.salesnav_all ? "Yes" : `No — ${f.salesnav_no_count ?? 0} (${f.salesnav_no_reason || "—"})`}</td>
                      <td>{f.unusual || "—"}</td>
                      <td>{f.responses_today ?? 0}</td>
                      <td>{f.comments || "—"}</td>
                      <td>
                        {f.reviewed ? (
                          <span className="badge">Reviewed</span>
                        ) : (
                          <button className="btn btn-outline" onClick={async () => { await action({ action: "markFeedbackReviewed", id: f.id }); await loadFeedbackForDate(feedbackDate); }}>Mark Reviewed</button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {feedbackRows && feedbackRows.length === 0 && (
                    <tr><td colSpan={7} className="muted">No feedback submitted for this date.</td></tr>
                  )}
                  {!feedbackRows && (
                    <tr><td colSpan={7} className="muted">Loading…</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {tab === "clients" && (
        <>
          <section className="panel">
            <h2>🏢 Client Tracker</h2>
            <div className="actions" style={{ marginBottom: 10, flexWrap: "wrap" }}>
              <button className="btn btn-primary btn-sm" onClick={() => { setCtMsg(null); setClientModal("add"); }}>➕ Add Client</button>
              <button className="btn btn-outline btn-sm" onClick={() => { setCtMsg(null); setUpdateClientForm(emptyUpdateClient); setClientModal("update"); }}>✏️ Update Client</button>
              <button className="btn btn-outline btn-sm" onClick={() => { setCtMsg(null); setArchiveForm({ clientName: "", reason: "" }); setClientModal("archive"); }}>🗄️ Archive Client</button>
              <button className="btn btn-outline btn-sm" onClick={() => { setCtMsg(null); setMarkLedgerForm({ clientName: "", cycle: "" }); setClientModal("markLedger"); }}>📤 Mark Ledger Sent</button>
              <button className="btn btn-outline btn-sm" onClick={() => { setCtMsg(null); setLedgerCsvClient(""); setClientModal("ledgerCsv"); }}>⬇️ Download Ledger CSV</button>
              <button className="btn btn-primary btn-sm" onClick={() => { setCtMsg(null); setWaitlistForm({ date: new Date().toISOString().slice(0, 10), clientName: "", contactEmail: "", eta: "", notes: "" }); setClientModal("waitlist"); }}>➕ Add to Wait List</button>
            </div>
            <input placeholder="Search clients…" value={ctSearch} onChange={(e) => setCtSearch(e.target.value)} style={{ marginBottom: 6, width: "100%", maxWidth: 320 }} />
            <div className="muted" style={{ marginBottom: 6, fontSize: 12 }}>{filteredClientRows.length} of {clientRows.length} client(s)</div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Client</th><th>Status</th><th>Quota</th><th>Target/Day</th><th>Cycle</th>
                    <th>Total Appts</th><th>Remaining (Cycle)</th><th>% Quota Complete</th><th>Overall CA/NY</th><th>Cycle CA/NY</th>
                    <th>CA/NY (Cycle Count)</th><th>Positive</th><th>Negative</th><th>No Show</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClientRows.map((c: any) => {
                    const needsSlotCheck = c.currentStatus === "Paused" && /Not Enough Slots Available/i.test(c.pausedReason || "");
                    const needsVacationCheck = c.currentStatus === "Paused" && shouldShowVacationBadge(c.pausedReason || "");
                    const statusColor = statusCellColor(c.status);
                    const quotaColor = quotaPctCellColor(c.quotaCompletePct);
                    return (
                      <tr key={c.name}>
                        <td>{c.name}</td>
                        <td style={statusColor ? { background: statusColor } : undefined}>
                          {c.status || "—"}
                          {needsSlotCheck && <button className="btn btn-outline btn-sm" style={{ marginLeft: 6, fontSize: 10, padding: "2px 6px" }} onClick={() => setSlotCheckClient(c.name)} title="Not Enough Slots Available — check Calendly">🔔 Check Slots</button>}
                          {needsVacationCheck && <button className="btn btn-outline btn-sm" style={{ marginLeft: 6, fontSize: 10, padding: "2px 6px" }} onClick={() => setVacationCheckClient(c.name)} title="Vacation ETA reached — check status">🏖️ Check Vacation</button>}
                        </td>
                        <td>{c.quota ?? "—"}</td>
                        <td>{c.targetAvgPerDay ?? "—"}</td>
                        <td>{c.cycleNumber || "—"}</td>
                        <td>{c.totalAppts}</td>
                        <td>{c.remainingThisCycle ?? "—"}</td>
                        <td style={quotaColor ? { background: quotaColor } : undefined}>{c.quotaCompletePct || 0}%</td>
                        <td>{c.overallCanyPct}%</td>
                        <td>{c.cycleCanyPct}%</td>
                        <td>{c.cycleCanyCount}</td>
                        <td>{c.feedback.positive}</td>
                        <td>{c.feedback.negative}</td>
                        <td>{c.feedback.noShow}</td>
                      </tr>
                    );
                  })}
                  {filteredClientRows.length === 0 && (
                    <tr><td colSpan={14} className="muted" style={{ textAlign: "center", padding: 20 }}>{clientTrackerLoaded ? "No clients match." : "Loading…"}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {slotCheckClient && (
            <div className="modal-overlay" onClick={() => setSlotCheckClient(null)}>
              <div className="panel" style={{ maxWidth: 420, width: "92vw" }} onClick={(e) => e.stopPropagation()}>
                <div className="section-head"><h2>Check Slots — {slotCheckClient}</h2><button className="modal-close" onClick={() => setSlotCheckClient(null)}>✕</button></div>
                {(() => {
                  const c = clientRows.find((x) => x.name === slotCheckClient);
                  return c?.eventUrl ? <p><a href={c.eventUrl} target="_blank" rel="noreferrer">Open Calendly →</a></p> : null;
                })()}
                <div className="actions">
                  <button className="btn btn-primary" onClick={() => logSlotCheck("available")}>Available now — take live</button>
                  <button className="btn btn-outline" onClick={() => logSlotCheck("not_available")}>Still not available</button>
                </div>
              </div>
            </div>
          )}

          {vacationCheckClient && (
            <div className="modal-overlay" onClick={() => setVacationCheckClient(null)}>
              <div className="panel" style={{ maxWidth: 420, width: "92vw" }} onClick={(e) => e.stopPropagation()}>
                <div className="section-head"><h2>Check Vacation — {vacationCheckClient}</h2><button className="modal-close" onClick={() => setVacationCheckClient(null)}>✕</button></div>
                <div className="actions">
                  <button className="btn btn-primary" onClick={() => logVacationCheck("back")}>Client is back — reactivate</button>
                  <button className="btn btn-outline" onClick={() => logVacationCheck("still_away")}>Still on vacation</button>
                </div>
              </div>
            </div>
          )}

          {clientModal === "add" && (
            <div className="modal-overlay" onClick={() => setClientModal(null)}>
              <div className="panel" style={{ maxWidth: 640, width: "94vw", maxHeight: "86vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
                <div className="section-head"><h2>➕ Add Client</h2><button className="modal-close" onClick={() => setClientModal(null)}>✕</button></div>
                {ctMsg && <div className={`msg msg-${ctMsg.kind}`}>{ctMsg.text}</div>}
                <div className="form-grid admin-create-grid">
                  <label>Client Name*<input value={addClientForm.clientName} onChange={(e) => setAddClientForm({ ...addClientForm, clientName: e.target.value })} /></label>
                  <label>Vertical<select value={addClientForm.vertical} onChange={(e) => setAddClientForm({ ...addClientForm, vertical: e.target.value })}><option>Broker</option><option>Direct</option><option>Other</option></select></label>
                  <label>Package Type<input value={addClientForm.packageType} onChange={(e) => setAddClientForm({ ...addClientForm, packageType: e.target.value })} /></label>
                  <label>Account Connect Date<input type="date" value={addClientForm.accountConnectDate} onChange={(e) => setAddClientForm({ ...addClientForm, accountConnectDate: e.target.value })} /></label>
                  <label>Quota*<input type="number" value={addClientForm.quota} onChange={(e) => setAddClientForm({ ...addClientForm, quota: e.target.value })} /></label>
                  <label>Target Avg Leads/Day<input type="number" value={addClientForm.targetAvgLeadsDay} onChange={(e) => setAddClientForm({ ...addClientForm, targetAvgLeadsDay: e.target.value })} /></label>
                  <label>Cycle<input type="number" value={addClientForm.cycle} onChange={(e) => setAddClientForm({ ...addClientForm, cycle: e.target.value })} /></label>
                  <label>Charge Amount<input value={addClientForm.chargeAmt} onChange={(e) => setAddClientForm({ ...addClientForm, chargeAmt: e.target.value })} /></label>
                  <label>Payment<select value={addClientForm.payment} onChange={(e) => setAddClientForm({ ...addClientForm, payment: e.target.value })}><option>AUTO</option><option>MANUAL</option></select></label>
                  <label>Current Cycle Start<input type="date" value={addClientForm.currentCycleStart} onChange={(e) => setAddClientForm({ ...addClientForm, currentCycleStart: e.target.value })} /></label>
                  <label>Launch Date<input type="date" value={addClientForm.launchDate} onChange={(e) => setAddClientForm({ ...addClientForm, launchDate: e.target.value })} /></label>
                  <label>Current Status<select value={addClientForm.currentStatus} onChange={(e) => setAddClientForm({ ...addClientForm, currentStatus: e.target.value })}><option>Not Started</option><option>Active</option><option>Paused</option></select></label>
                  {addClientForm.currentStatus === "Paused" && (
                    <label>Paused Reason<select value={addClientForm.pausedReason} onChange={(e) => setAddClientForm({ ...addClientForm, pausedReason: e.target.value })}>
                      <option value="">Select…</option>
                      <option>PAUSED Vacation</option>
                      <option>PAUSED Not Enough Slots Available</option>
                      <option>PAUSED Non-Payment</option>
                      <option>PAUSED Other</option>
                    </select></label>
                  )}
                  {addClientForm.currentStatus === "Paused" && addClientForm.pausedReason === "PAUSED Vacation" && (
                    <label>Vacation ETA
                      <input type="date" disabled={addClientForm.vacationTbd} value={addClientForm.vacationEta} onChange={(e) => setAddClientForm({ ...addClientForm, vacationEta: e.target.value })} />
                      <span className="muted" style={{ fontSize: 11 }}><input type="checkbox" checked={addClientForm.vacationTbd} onChange={(e) => setAddClientForm({ ...addClientForm, vacationTbd: e.target.checked })} /> TBD</span>
                    </label>
                  )}
                  <label>Action Taken<input value={addClientForm.actionTaken} onChange={(e) => setAddClientForm({ ...addClientForm, actionTaken: e.target.value })} /></label>
                  <label>Payment Notes<input value={addClientForm.paymentNotes} onChange={(e) => setAddClientForm({ ...addClientForm, paymentNotes: e.target.value })} /></label>
                  <label>Quota Notes<input value={addClientForm.quotaNotes} onChange={(e) => setAddClientForm({ ...addClientForm, quotaNotes: e.target.value })} /></label>
                  <label>Account Authority<input value={addClientForm.acctAuthority} onChange={(e) => setAddClientForm({ ...addClientForm, acctAuthority: e.target.value })} /></label>
                  <label>Cycle Ledger Email<input value={addClientForm.cycleLedgerEmail} onChange={(e) => setAddClientForm({ ...addClientForm, cycleLedgerEmail: e.target.value })} /></label>
                  <label>Calendly Email<input value={addClientForm.calendlyEmail} onChange={(e) => setAddClientForm({ ...addClientForm, calendlyEmail: e.target.value })} /></label>
                  <label>Distribution List<input value={addClientForm.distributionList} onChange={(e) => setAddClientForm({ ...addClientForm, distributionList: e.target.value })} /></label>
                  <label>CRM<input value={addClientForm.crm} onChange={(e) => setAddClientForm({ ...addClientForm, crm: e.target.value })} /></label>
                  <label>CRM Name<input value={addClientForm.crmName} onChange={(e) => setAddClientForm({ ...addClientForm, crmName: e.target.value })} /></label>
                  <label>CRM Address<input value={addClientForm.crmAddress} onChange={(e) => setAddClientForm({ ...addClientForm, crmAddress: e.target.value })} /></label>
                  <label>Event URL (Calendly)<input value={addClientForm.eventUrl} onChange={(e) => setAddClientForm({ ...addClientForm, eventUrl: e.target.value })} /></label>
                  <label>Google User Email<input value={addClientForm.userEmailGoogle} onChange={(e) => setAddClientForm({ ...addClientForm, userEmailGoogle: e.target.value })} /></label>
                  <label>Password<input value={addClientForm.pw} onChange={(e) => setAddClientForm({ ...addClientForm, pw: e.target.value })} /></label>
                  <label>Tenant<input value={addClientForm.tenant} onChange={(e) => setAddClientForm({ ...addClientForm, tenant: e.target.value })} /></label>
                  <label>Tenant PD<input value={addClientForm.tenantPd} onChange={(e) => setAddClientForm({ ...addClientForm, tenantPd: e.target.value })} /></label>
                  <label>Web Profile<input value={addClientForm.webprofile} onChange={(e) => setAddClientForm({ ...addClientForm, webprofile: e.target.value })} /></label>
                  <label>About LI<input value={addClientForm.aboutLi} onChange={(e) => setAddClientForm({ ...addClientForm, aboutLi: e.target.value })} /></label>
                </div>
                <div className="actions" style={{ marginTop: 10 }}>
                  <button className="btn btn-primary" onClick={saveAddClient}>Save Client</button>
                  <button className="btn btn-outline" onClick={() => setClientModal(null)}>Cancel</button>
                </div>
              </div>
            </div>
          )}

          {clientModal === "update" && (
            <div className="modal-overlay" onClick={() => setClientModal(null)}>
              <div className="panel" style={{ maxWidth: 640, width: "94vw", maxHeight: "86vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
                <div className="section-head"><h2>✏️ Update Client</h2><button className="modal-close" onClick={() => setClientModal(null)}>✕</button></div>
                {ctMsg && <div className={`msg msg-${ctMsg.kind}`}>{ctMsg.text}</div>}
                <div className="form-grid admin-create-grid">
                  <label>Client<select value={updateClientForm.clientName} onChange={(e) => prefillUpdateClient(e.target.value)}>
                    <option value="">Select a client…</option>
                    {clientRows.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select></label>
                  <label>Quota<input type="number" value={updateClientForm.quota} onChange={(e) => setUpdateClientForm({ ...updateClientForm, quota: e.target.value })} /></label>
                  <label>Target Avg Leads/Day<input type="number" value={updateClientForm.targetAvgLeadsDay} onChange={(e) => setUpdateClientForm({ ...updateClientForm, targetAvgLeadsDay: e.target.value })} /></label>
                  <label>Cycle<input type="number" value={updateClientForm.cycle} onChange={(e) => setUpdateClientForm({ ...updateClientForm, cycle: e.target.value })} /></label>
                  <label>Charge Amount<input value={updateClientForm.chargeAmt} onChange={(e) => setUpdateClientForm({ ...updateClientForm, chargeAmt: e.target.value })} /></label>
                  <label>Payment<input value={updateClientForm.payment} onChange={(e) => setUpdateClientForm({ ...updateClientForm, payment: e.target.value })} /></label>
                  <label>Current Cycle Start<input type="date" value={updateClientForm.currentCycleStart} onChange={(e) => setUpdateClientForm({ ...updateClientForm, currentCycleStart: e.target.value })} /></label>
                  <label>Launch Date<input type="date" value={updateClientForm.launchDate} onChange={(e) => setUpdateClientForm({ ...updateClientForm, launchDate: e.target.value })} /></label>
                  <label>Current Status<select value={updateClientForm.currentStatus} onChange={(e) => setUpdateClientForm({ ...updateClientForm, currentStatus: e.target.value })}><option>Not Started</option><option>Active</option><option>Paused</option></select></label>
                  {updateClientForm.currentStatus === "Paused" && (
                    <label>Paused Reason<select value={updateClientForm.pausedReason} onChange={(e) => setUpdateClientForm({ ...updateClientForm, pausedReason: e.target.value })}>
                      <option value="">Select…</option>
                      <option>PAUSED Vacation</option>
                      <option>PAUSED Not Enough Slots Available</option>
                      <option>PAUSED Non-Payment</option>
                      <option>PAUSED Other</option>
                    </select></label>
                  )}
                  {updateClientForm.currentStatus === "Paused" && updateClientForm.pausedReason === "PAUSED Vacation" && (
                    <label>Vacation ETA
                      <input type="date" disabled={updateClientForm.vacationTbd} value={updateClientForm.vacationEta} onChange={(e) => setUpdateClientForm({ ...updateClientForm, vacationEta: e.target.value })} />
                      <span className="muted" style={{ fontSize: 11 }}><input type="checkbox" checked={updateClientForm.vacationTbd} onChange={(e) => setUpdateClientForm({ ...updateClientForm, vacationTbd: e.target.checked })} /> TBD</span>
                    </label>
                  )}
                  <label>Vertical<input value={updateClientForm.vertical} onChange={(e) => setUpdateClientForm({ ...updateClientForm, vertical: e.target.value })} /></label>
                  <label>Package Type<input value={updateClientForm.packageType} onChange={(e) => setUpdateClientForm({ ...updateClientForm, packageType: e.target.value })} /></label>
                  <label>Action Taken<input value={updateClientForm.actionTaken} onChange={(e) => setUpdateClientForm({ ...updateClientForm, actionTaken: e.target.value })} /></label>
                  <label>Payment Notes<input value={updateClientForm.paymentNotes} onChange={(e) => setUpdateClientForm({ ...updateClientForm, paymentNotes: e.target.value })} /></label>
                  <label>Quota Notes<input value={updateClientForm.quotaNotes} onChange={(e) => setUpdateClientForm({ ...updateClientForm, quotaNotes: e.target.value })} /></label>
                </div>
                <div className="actions" style={{ marginTop: 10 }}>
                  <button className="btn btn-primary" onClick={saveUpdateClient}>Save Changes</button>
                  <button className="btn btn-outline" onClick={() => setClientModal(null)}>Cancel</button>
                </div>
              </div>
            </div>
          )}

          {clientModal === "archive" && (
            <div className="modal-overlay" onClick={() => setClientModal(null)}>
              <div className="panel" style={{ maxWidth: 460, width: "92vw" }} onClick={(e) => e.stopPropagation()}>
                <div className="section-head"><h2>🗄️ Archive Client</h2><button className="modal-close" onClick={() => setClientModal(null)}>✕</button></div>
                {ctMsg && <div className={`msg msg-${ctMsg.kind}`}>{ctMsg.text}</div>}
                <div className="form-grid">
                  <label>Client<select value={archiveForm.clientName} onChange={(e) => setArchiveForm({ ...archiveForm, clientName: e.target.value })}>
                    <option value="">Select a client…</option>
                    {clientRows.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select></label>
                  <textarea placeholder="Archive reason (required)" value={archiveForm.reason} onChange={(e) => setArchiveForm({ ...archiveForm, reason: e.target.value })} />
                </div>
                <div className="actions" style={{ marginTop: 10 }}>
                  <button className="btn btn-primary" onClick={saveArchiveClient}>Archive</button>
                  <button className="btn btn-outline" onClick={() => setClientModal(null)}>Cancel</button>
                </div>
              </div>
            </div>
          )}

          {clientModal === "markLedger" && (
            <div className="modal-overlay" onClick={() => setClientModal(null)}>
              <div className="panel" style={{ maxWidth: 460, width: "92vw" }} onClick={(e) => e.stopPropagation()}>
                <div className="section-head"><h2>📤 Mark Ledger Sent</h2><button className="modal-close" onClick={() => setClientModal(null)}>✕</button></div>
                {ctMsg && <div className={`msg msg-${ctMsg.kind}`}>{ctMsg.text}</div>}
                <div className="form-grid">
                  <label>Client<select value={markLedgerForm.clientName} onChange={(e) => setMarkLedgerForm({ ...markLedgerForm, clientName: e.target.value })}>
                    <option value="">Select a client…</option>
                    {clientRows.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select></label>
                  <input type="number" placeholder="Cycle number" value={markLedgerForm.cycle} onChange={(e) => setMarkLedgerForm({ ...markLedgerForm, cycle: e.target.value })} />
                </div>
                <div className="actions" style={{ marginTop: 10, flexWrap: "wrap" }}>
                  <button className="btn btn-primary" onClick={saveMarkLedgerSent}>Mark Sent</button>
                  <button className="btn btn-outline" onClick={() => copyLedgerEmailPart("subject")}>Copy Subject</button>
                  <button className="btn btn-outline" onClick={() => copyLedgerEmailPart("body")}>Copy Body</button>
                  <button className="btn btn-outline" onClick={() => copyLedgerEmailPart("email")}>Copy Recipient Email</button>
                  <button className="btn btn-outline" onClick={() => setClientModal(null)}>Close</button>
                </div>
              </div>
            </div>
          )}

          {clientModal === "ledgerCsv" && (
            <div className="modal-overlay" onClick={() => setClientModal(null)}>
              <div className="panel" style={{ maxWidth: 460, width: "92vw" }} onClick={(e) => e.stopPropagation()}>
                <div className="section-head"><h2>⬇️ Download Ledger CSV</h2><button className="modal-close" onClick={() => setClientModal(null)}>✕</button></div>
                {ctMsg && <div className={`msg msg-${ctMsg.kind}`}>{ctMsg.text}</div>}
                <div className="form-grid">
                  <label>Client<select value={ledgerCsvClient} onChange={(e) => setLedgerCsvClient(e.target.value)}>
                    <option value="">Select a client…</option>
                    {clientRows.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select></label>
                  {ledgerCsvClient && (() => {
                    const c = clientRows.find((x) => x.name === ledgerCsvClient);
                    const pct = c?.quotaCompletePct || 0;
                    return <div style={{ color: pct >= 100 ? "#059669" : "#dc2626", fontSize: 12 }}>% Quota Complete: {pct}% {pct >= 100 ? "— ready to export." : "— must reach 100% before exporting."}</div>;
                  })()}
                </div>
                <div className="actions" style={{ marginTop: 10 }}>
                  <button className="btn btn-primary" disabled={!ledgerCsvClient || (clientRows.find((x) => x.name === ledgerCsvClient)?.quotaCompletePct || 0) < 100} onClick={exportLedgerCsv}>Export CSV</button>
                  <button className="btn btn-outline" onClick={() => setClientModal(null)}>Cancel</button>
                </div>
              </div>
            </div>
          )}

          {clientModal === "waitlist" && (
            <div className="modal-overlay" onClick={() => setClientModal(null)}>
              <div className="panel" style={{ maxWidth: 460, width: "92vw" }} onClick={(e) => e.stopPropagation()}>
                <div className="section-head"><h2>➕ Add to Wait List</h2><button className="modal-close" onClick={() => setClientModal(null)}>✕</button></div>
                {ctMsg && <div className={`msg msg-${ctMsg.kind}`}>{ctMsg.text}</div>}
                <div className="form-grid">
                  <label>Date<input type="date" value={waitlistForm.date} onChange={(e) => setWaitlistForm({ ...waitlistForm, date: e.target.value })} /></label>
                  <input placeholder="Client Name" value={waitlistForm.clientName} onChange={(e) => setWaitlistForm({ ...waitlistForm, clientName: e.target.value })} />
                  <input placeholder="Contact Email" value={waitlistForm.contactEmail} onChange={(e) => setWaitlistForm({ ...waitlistForm, contactEmail: e.target.value })} />
                  <label>ETA to Launch<input type="date" value={waitlistForm.eta} onChange={(e) => setWaitlistForm({ ...waitlistForm, eta: e.target.value })} /></label>
                  <textarea placeholder="Notes" value={waitlistForm.notes} onChange={(e) => setWaitlistForm({ ...waitlistForm, notes: e.target.value })} />
                </div>
                <div className="actions" style={{ marginTop: 10 }}>
                  <button className="btn btn-primary" onClick={saveAddWaitlist}>Save</button>
                  <button className="btn btn-outline" onClick={() => setClientModal(null)}>Cancel</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {tab === "finance" && (
        <section className="grid two">
          <div className="panel">
            <h2>💵 Add Cost</h2>
            <div className="form-grid">
              <input placeholder="Amount" value={cost.amount} onChange={(e) => setCost({ ...cost, amount: e.target.value })} />
              <input placeholder="Description" value={cost.description} onChange={(e) => setCost({ ...cost, description: e.target.value })} />
              <textarea placeholder="Notes" value={cost.notes} onChange={(e) => setCost({ ...cost, notes: e.target.value })} />
              <button className="btn btn-primary" onClick={() => doAction({ action: "addCost", ...cost })}>Add Cost</button>
            </div>
          </div>
          <div className="panel">
            <h2>🧾 Add Client Payment</h2>
            <div className="form-grid">
              <input placeholder="Client" value={payment.clientName} onChange={(e) => setPayment({ ...payment, clientName: e.target.value })} />
              <input placeholder="Total Billed" value={payment.totalBilled} onChange={(e) => setPayment({ ...payment, totalBilled: e.target.value })} />
              <input placeholder="Invoice Ref" value={payment.invoiceRef} onChange={(e) => setPayment({ ...payment, invoiceRef: e.target.value })} />
              <button className="btn btn-primary" onClick={() => doAction({ action: "addPayment", ...payment })}>Add Payment</button>
            </div>
          </div>
        </section>
      )}

      {tab === "tasks" && (
        <section className="panel">
          <h2>📋 Daily Task</h2>
          <div className="form-grid admin-create-grid">
            <input placeholder="Title" value={task.title} onChange={(e) => setTask({ ...task, title: e.target.value })} />
            <input placeholder="Topic" value={task.topic} onChange={(e) => setTask({ ...task, topic: e.target.value })} />
            <select value={task.priority} onChange={(e) => setTask({ ...task, priority: e.target.value })}><option>Low</option><option>Normal</option><option>High</option></select>
            <button className="btn btn-primary" onClick={() => doAction({ action: "addTask", ...task })}>Add Task</button>
          </div>
          <div className="compact-list">
            {(data.tasks || []).map((t: any) => (
              <div className="compact-row" key={t.id}>
                <strong>{t.title}</strong>
                <span className="badge">{t.status}</span>
                <span>{t.assigned_name}</span>
                <div className="actions">
                  <button className="btn btn-outline" onClick={() => doAction({ action: "taskStatus", id: t.id, status: t.status === "Completed" ? "Open" : "Completed" })}>{t.status === "Completed" ? "Reopen" : "Mark Complete"}</button>
                  <button className="btn btn-outline" onClick={() => {
                    const email = window.prompt("Reassign to (email):", t.assigned_email || "");
                    if (!email) return;
                    const name = window.prompt("Assignee name:", "") || email;
                    void doAction({ action: "reassignTask", id: t.id, assignedEmail: email, assignedName: name });
                  }}>Reassign</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === "reports" && (
        <>
          <section className="panel">
            <h2>📈 Reports</h2>
            <div className="count-grid">
              <div className="count-item"><span>Total Appointments</span><strong>{data.appointments?.length || 0}</strong></div>
              <div className="count-item"><span>Sends Last 7 Days</span><strong>{data.stats?.sendsLast7 || 0}</strong></div>
              <div className="count-item"><span>Total Costs</span><strong>${Math.round(data.stats?.totalCost || 0)}</strong></div>
              <div className="count-item"><span>Total Earnings</span><strong>${Math.round(data.stats?.totalEarning || 0)}</strong></div>
            </div>
          </section>

          <section className="panel table-wrap">
            <div className="section-head"><h2>🗂 Recruiter Directory</h2><span className="muted">Click a column header to sort</span></div>
            {!directory && <div className="muted">Loading...</div>}
            {directory && (
              <table>
                <thead>
                  <tr>
                    {[
                      { key: "name", label: "Recruiter" },
                      { key: "type", label: "Type" },
                      { key: "workingAgeDays", label: "Age" },
                      { key: "salesNavActive", label: "Sales Nav Active" },
                      { key: "salesNavTotal", label: "Sales Nav Used (Total)" },
                      { key: "apptsTotal", label: "Appts (Total)" },
                      { key: "sendsTotal", label: "Sends (Total)" },
                      { key: "sendsYesterday", label: "Sends (Yesterday)" }
                    ].map((col) => (
                      <th key={col.key} style={{ cursor: "pointer" }} onClick={() => toggleDirectorySort(col.key)}>
                        {col.label}{directorySort.key === col.key ? (directorySort.dir === "desc" ? " ▼" : " ▲") : ""}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {directoryRows.map((r: any) => (
                    <tr key={r.email}>
                      <td>{r.name}</td>
                      <td>{r.type}</td>
                      <td>{r.workingAgeDays ?? "-"}</td>
                      <td>{r.salesNavActive}</td>
                      <td>{r.salesNavTotal}</td>
                      <td>{r.apptsTotal}</td>
                      <td>{r.sendsTotal}</td>
                      <td>{r.sendsYesterday}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}

      {tab === "linkbooking" && (
        <section className="panel">
          <h2>🔗 Link Open vs Booking</h2>
          <p className="muted">Not built yet — this needs Google Analytics Data API access (property "FranBooking Calendly") that this app doesn't have configured. Waiting on GA4 Viewer access + the Analytics Data API enabled for the service account before this section can be built.</p>
        </section>
      )}

      {tab === "vendors" && (
        <section className="panel">
          <h2>🏬 Vendor Management</h2>
          <p className="muted">Not built yet — a separate, sizeable stage (Vendor/Profile/Order/Issue tracking) not yet scoped.</p>
        </section>
      )}

      {listModal && (
        <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 30 }} onClick={() => setListModal(null)}>
          <div className="panel" style={{ maxWidth: 380, maxHeight: "70vh", overflowY: "auto", width: "92vw" }} onClick={(e) => e.stopPropagation()}>
            <div className="section-head"><h2>{listModal.title}</h2><button className="btn btn-outline" onClick={() => setListModal(null)}>Close</button></div>
            <div className="compact-list">
              {listModal.rows.map((row, idx) => (
                <div className="compact-row" key={idx}><strong>{row.label}</strong>{row.sub && <span>{row.sub}</span>}</div>
              ))}
              {listModal.rows.length === 0 && <div className="muted">Nothing here.</div>}
            </div>
          </div>
        </div>
      )}

      <button
        className="btn btn-primary"
        style={{ position: "fixed", right: 24, bottom: 24, borderRadius: 999, zIndex: 20 }}
        onClick={() => setBrainstormOpen((v) => !v)}
      >
        {brainstormOpen ? "Close Brainstorm" : "Brainstorm with AI"}
      </button>

      {brainstormOpen && (
        <div className="panel" style={{ position: "fixed", right: 24, bottom: 80, width: 340, maxHeight: "60vh", overflowY: "auto", zIndex: 20 }}>
          <h2>Brainstorm with AI</h2>
          <div className="compact-list">
            {chat.map((turn, idx) => (
              <div className="compact-row" key={idx}>
                <strong>{turn.role === "user" ? "You" : "Assistant"}</strong>
                <span>{turn.text}</span>
              </div>
            ))}
            {chat.length === 0 && <div className="muted">Ask anything about the business.</div>}
          </div>
          <div className="form-grid">
            <textarea placeholder="Ask a question..." value={chatInput} onChange={(e) => setChatInput(e.target.value)} />
            <button className="btn btn-primary" disabled={chatBusy} onClick={sendChat}>Send</button>
          </div>
        </div>
      )}
    </main>
  );
}
