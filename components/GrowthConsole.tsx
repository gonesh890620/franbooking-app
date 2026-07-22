"use client";

import { useState } from "react";
import BodyClass from "./BodyClass";
import { AppHeader, Badge, Card, DataTable, EmptyRow, Field, LogoutButton, Modal, Msg } from "./ui";

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

/** Section titles shown next to the Back button, matching GAS's panel-title-text. */
const SECTION_TITLES: Record<string, string> = {
  tasks: "Daily Task",
  recruiters: "Recruiters",
  clients: "Client Tracker",
  linkbooking: "Link Open vs Booking",
  finance: "Finance",
  reports: "Reports",
  vendors: "Vendor Management"
};

/**
 * GAS Growth stat tile: big number on top, uppercase label under it, optional
 * sub-note. Uses the .gr-stat-* classes from Growth.html's own stylesheet
 * (ported into section 3 of app/styles.css) -- number and label are stacked
 * block elements, not inline, which is what keeps "On Fire" and its count on
 * separate lines.
 */
function StatTile({
  label,
  value,
  sub,
  onClick,
  color
}: {
  label: string;
  value: string | number;
  sub?: string;
  onClick?: () => void;
  color?: string;
}) {
  return (
    <div
      className={`gr-stat-tile${onClick ? " clickable" : ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onClick && e.key === "Enter") onClick();
      }}
    >
      <div className="gr-stat-num" style={color ? { color } : undefined}>
        {value}
      </div>
      <div className="gr-stat-lbl">{label}</div>
      {sub ? <div className="gr-stat-sub">{sub}</div> : null}
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
  const [reportTab, setReportTab] = useState<"billing" | "directory">("billing");
  const [billingLoaded, setBillingLoaded] = useState(false);
  const [billingRows, setBillingRows] = useState<any[]>([]);
  const [billingSearch, setBillingSearch] = useState("");
  const [billingCycleFilter, setBillingCycleFilter] = useState("");

  // ── Vendor Management ────────────────────────────────────────────────────
  const [vendorsLoaded, setVendorsLoaded] = useState(false);
  const [vendorProfiles, setVendorProfiles] = useState<any[]>([]);
  const [vendorIssues, setVendorIssues] = useState<any[]>([]);
  const [vendorsList, setVendorsList] = useState<any[]>([]);
  const [vendorOrders, setVendorOrders] = useState<any[]>([]);
  const [vendorSummary, setVendorSummary] = useState<any[]>([]);
  const [vendorIssueTypes, setVendorIssueTypes] = useState<string[]>([]);
  const [vendorBdRoster, setVendorBdRoster] = useState<Array<{ email: string; name: string; type: string }>>([]);
  const [vmMsg, setVmMsg] = useState<{ text: string; kind: "error" | "success" } | null>(null);
  const [vmProfilesFilter, setVmProfilesFilter] = useState<"all" | "active" | "issue">("all");
  const [vmProfilesSearch, setVmProfilesSearch] = useState("");
  const [vmOrdersPendingOnly, setVmOrdersPendingOnly] = useState(false);
  const [vmIssuesUnresolvedOnly, setVmIssuesUnresolvedOnly] = useState(true);
  const [vendorStatsIdx, setVendorStatsIdx] = useState<number | null>(null);
  const [vendorModal, setVendorModal] = useState<null | "profile" | "renew" | "vendor" | "order" | "comm" | "issue" | "followUp" | "feedback" | "replace">(null);

  const emptyVpForm = { id: "", name: "", vendor: "", liUrl: "", price: "", registered: "", snConnected: "", managedBy: "", status: "Active", notes: "" };
  const [vpForm, setVpForm] = useState(emptyVpForm);
  const [vrnForm, setVrnForm] = useState({ profileId: "", lastRenewed: new Date().toISOString().slice(0, 10), status: "Active", notes: "" });
  const emptyVnForm = { id: "", name: "", contact: "", email: "", slack: "", channel: "", notes: "" };
  const [vnForm, setVnForm] = useState(emptyVnForm);
  const emptyVoForm = { id: "", vendor: "", requestedBy: "", profileName: "", profileUrl: "", connections: "", location: "", orderDate: new Date().toISOString().slice(0, 10), price: "", notes: "" };
  const [voForm, setVoForm] = useState(emptyVoForm);
  const [vcmForm, setVcmForm] = useState({ vendor: "", date: new Date().toISOString().slice(0, 10), channel: "", note: "" });
  const [viForm, setViForm] = useState({ profileId: "", vendor: "", issueType: "", reportedDate: new Date().toISOString().slice(0, 10), notes: "" });
  const [vfuVendor, setVfuVendor] = useState("");
  const [vfForm, setVfForm] = useState({ issueId: "", date: new Date().toISOString().slice(0, 10), text: "", eta: "" });
  const [vrForm, setVrForm] = useState({ oldProfileId: "", issueId: "", name: "", vendor: "", liUrl: "", price: "", registered: new Date().toISOString().slice(0, 10), snConnected: "", managedBy: "", notes: "" });

  // ── Recruiter Payments + Wise ────────────────────────────────────────────
  const [paymentsLoaded, setPaymentsLoaded] = useState(false);
  const [paymentRows, setPaymentRows] = useState<any[]>([]);
  const [paymentCycleFilter, setPaymentCycleFilter] = useState("");
  const [paymentSearch, setPaymentSearch] = useState("");
  const [invoiceModal, setInvoiceModal] = useState<{ email: string; cycleKey: string; name: string; cycleLabel: string } | null>(null);
  const [invoiceId, setInvoiceId] = useState("");
  const [wiseModal, setWiseModal] = useState(false);
  const [wiseRoster, setWiseRoster] = useState<any[]>([]);
  const [wiseSelected, setWiseSelected] = useState("");
  const [wiseAccount, setWiseAccount] = useState("");

  // ── Recurring Tasks ──────────────────────────────────────────────────────
  const [recurringModal, setRecurringModal] = useState(false);
  const [recurringRows, setRecurringRows] = useState<any[]>([]);
  const [recurringForm, setRecurringForm] = useState({ title: "", description: "", topic: "", priority: "Medium", daysOfMonth: "", assignedEmail: "", assignedName: "" });
  const [recurringMsg, setRecurringMsg] = useState<{ text: string; kind: "error" | "success" } | null>(null);

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
    action({ action: "recruiterBillingReport" }).then((p) => { setBillingRows(p.rows || []); setBillingLoaded(true); }).catch((e) => setMessage(e instanceof Error ? e.message : "Could not load billing report"));
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

  const billingCycles = Array.from(new Set(billingRows.map((r) => r.cycleLabel))).filter(Boolean);
  const filteredBillingRows = billingRows.filter((r) => {
    if (billingSearch && !String(r.name || "").toLowerCase().includes(billingSearch.toLowerCase())) return false;
    if (billingCycleFilter && r.cycleLabel !== billingCycleFilter) return false;
    return true;
  }).sort((a, b) => (billingCycleFilter ? (b.appts || 0) - (a.appts || 0) : 0));

  function exportBillingCsv() {
    const headers = ["Recruiter", "Type", "Age", "Billing Cycle", "Appts", "Sends"];
    const lines = [headers.map(csvEscape).join(",")];
    filteredBillingRows.forEach((r) => lines.push([r.name, r.type || "", r.workingAgeDays ?? "", r.cycleLabel, r.appts, r.sends].map(csvEscape).join(",")));
    const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `billing_cycle_report${billingCycleFilter ? "_" + billingCycleFilter.replace(/[^a-z0-9]+/gi, "_") : ""}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── Vendor Management ────────────────────────────────────────────────────
  async function openVendorsTab() {
    setTab("vendors");
    if (vendorsLoaded) return;
    setVendorsLoaded(true);
    action({ action: "vendorData" }).then((data) => {
      setVendorProfiles(data.profiles || []);
      setVendorIssues(data.issues || []);
      setVendorsList(data.vendors || []);
      setVendorOrders(data.orders || []);
      setVendorSummary(data.vendorSummary || []);
      setVendorIssueTypes(data.issueTypes || []);
    }).catch((e) => setMessage(e instanceof Error ? e.message : "Could not load vendor data"));
    action({ action: "recruiterRosterForPayment" }).then((p) => setVendorBdRoster((p.roster || []).filter((r: any) => r.type === "BD/Inhouse"))).catch(() => {});
  }

  async function reloadVendorData() {
    try {
      const data = await action({ action: "vendorData" });
      setVendorProfiles(data.profiles || []);
      setVendorIssues(data.issues || []);
      setVendorsList(data.vendors || []);
      setVendorOrders(data.orders || []);
      setVendorSummary(data.vendorSummary || []);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not reload vendor data");
    }
  }

  function vmFail(e: unknown) {
    setVmMsg({ text: e instanceof Error ? e.message : "Action failed", kind: "error" });
  }

  function openAddProfile() { setVpForm(emptyVpForm); setVmMsg(null); setVendorModal("profile"); }
  function openEditProfile(p: any) {
    setVpForm({ id: p.id, name: p.name, vendor: p.vendor, liUrl: p.liProfileUrl || "", price: p.price || "", registered: p.registeredDate || "", snConnected: p.snConnectedDate || "", managedBy: p.managedBy || "", status: p.status === "Retired" ? "Retired" : "Active", notes: p.notes || "" });
    setVmMsg(null);
    setVendorModal("profile");
  }
  async function saveVpForm() {
    if (!vpForm.name.trim() || !vpForm.vendor.trim()) { setVmMsg({ text: "Profile Name and Vendor Name are required.", kind: "error" }); return; }
    try {
      const data = { name: vpForm.name, vendor: vpForm.vendor, liProfileUrl: vpForm.liUrl, price: vpForm.price, registeredDate: vpForm.registered, snConnectedDate: vpForm.snConnected, managedBy: vpForm.managedBy, notes: vpForm.notes, status: vpForm.id ? vpForm.status : "Active" };
      const payload = vpForm.id ? await action({ action: "updateVendorProfile", profileId: vpForm.id, data }) : await action({ action: "addVendorProfile", data });
      if (payload.error) { setVmMsg({ text: payload.error, kind: "error" }); return; }
      setVendorModal(null);
      await reloadVendorData();
    } catch (e) { vmFail(e); }
  }

  function openRenewProfile(profileId: string) { setVrnForm({ profileId, lastRenewed: new Date().toISOString().slice(0, 10), status: "Active", notes: "" }); setVmMsg(null); setVendorModal("renew"); }
  async function saveRenewProfile() {
    try {
      const payload = await action({ action: "updateVendorProfile", profileId: vrnForm.profileId, data: { lastRenewedDate: vrnForm.lastRenewed, status: vrnForm.status, notes: vrnForm.notes } });
      if (payload.error) { setVmMsg({ text: payload.error, kind: "error" }); return; }
      setVendorModal(null);
      await reloadVendorData();
    } catch (e) { vmFail(e); }
  }

  function openAddVendor() { setVnForm(emptyVnForm); setVmMsg(null); setVendorModal("vendor"); }
  function openEditVendor(v: any) { setVnForm({ id: v.id, name: v.name, contact: v.contactPerson || "", email: v.email || "", slack: v.slack || "", channel: v.channel || "", notes: v.notes || "" }); setVmMsg(null); setVendorModal("vendor"); }
  async function saveVnForm() {
    if (!vnForm.name.trim()) { setVmMsg({ text: "Vendor Name is required.", kind: "error" }); return; }
    try {
      const data = { name: vnForm.name, contactPerson: vnForm.contact, email: vnForm.email, slack: vnForm.slack, channel: vnForm.channel, notes: vnForm.notes };
      const payload = vnForm.id ? await action({ action: "updateVendor", vendorId: vnForm.id, data }) : await action({ action: "addVendor", data });
      if (payload.error) { setVmMsg({ text: payload.error, kind: "error" }); return; }
      setVendorModal(null);
      await reloadVendorData();
    } catch (e) { vmFail(e); }
  }

  function openLogOrder() { setVoForm(emptyVoForm); setVmMsg(null); setVendorModal("order"); }
  function openEditOrder(o: any) { setVoForm({ id: o.id, vendor: o.vendor, requestedBy: o.requestedBy || "", profileName: o.profileName || "", profileUrl: o.profileUrl || "", connections: o.connections || "", location: o.location || "", orderDate: o.orderDate || "", price: o.price || "", notes: o.notes || "" }); setVmMsg(null); setVendorModal("order"); }
  async function saveVoForm() {
    if (!voForm.vendor.trim()) { setVmMsg({ text: "Vendor is required.", kind: "error" }); return; }
    try {
      const data = { vendor: voForm.vendor, requestedBy: voForm.requestedBy, profileName: voForm.profileName, profileUrl: voForm.profileUrl, connections: voForm.connections, location: voForm.location, orderDate: voForm.orderDate, price: voForm.price, notes: voForm.notes };
      const payload = voForm.id ? await action({ action: "updateVendorOrder", orderId: voForm.id, data }) : await action({ action: "addVendorOrder", data });
      if (payload.error) { setVmMsg({ text: payload.error, kind: "error" }); return; }
      setVendorModal(null);
      await reloadVendorData();
    } catch (e) { vmFail(e); }
  }
  async function markOrderReceived(orderId: string) {
    if (!window.confirm("Mark this order as received? Received Date will be stamped today unless you edit it first.")) return;
    try { await action({ action: "updateVendorOrder", orderId, data: { status: "Received" } }); await reloadVendorData(); } catch (e) { setMessage(e instanceof Error ? e.message : "Action failed"); }
  }
  async function cancelOrder(orderId: string) {
    if (!window.confirm("Cancel this order?")) return;
    try { await action({ action: "updateVendorOrder", orderId, data: { status: "Cancelled" } }); await reloadVendorData(); } catch (e) { setMessage(e instanceof Error ? e.message : "Action failed"); }
  }

  function openLogComm() { setVcmForm({ vendor: "", date: new Date().toISOString().slice(0, 10), channel: "", note: "" }); setVmMsg(null); setVendorModal("comm"); }
  async function saveVcmForm() {
    if (!vcmForm.vendor.trim() || !vcmForm.note.trim()) { setVmMsg({ text: "Vendor and Note are required.", kind: "error" }); return; }
    try {
      const payload = await action({ action: "logVendorCommunication", data: vcmForm });
      if (payload.error) { setVmMsg({ text: payload.error, kind: "error" }); return; }
      setVendorModal(null);
    } catch (e) { vmFail(e); }
  }

  function openLogIssue(profileId?: string) { setViForm({ profileId: profileId || "", vendor: "", issueType: "", reportedDate: new Date().toISOString().slice(0, 10), notes: "" }); setVmMsg(null); setVendorModal("issue"); }
  async function saveViForm() {
    if (!viForm.profileId && !viForm.vendor.trim()) { setVmMsg({ text: "Select a profile or a vendor.", kind: "error" }); return; }
    if (!viForm.issueType) { setVmMsg({ text: "Issue type is required.", kind: "error" }); return; }
    try {
      const payload = await action({ action: "logVendorIssue", profileId: viForm.profileId, data: { vendor: viForm.vendor, issueType: viForm.issueType, reportedDate: viForm.reportedDate, issueNotes: viForm.notes } });
      if (payload.error) { setVmMsg({ text: payload.error, kind: "error" }); return; }
      setVendorModal(null);
      await reloadVendorData();
    } catch (e) { vmFail(e); }
  }
  async function followUpVendorIssue(issueId: string) {
    try { await action({ action: "logVendorIssueFollowUp", issueId }); await reloadVendorData(); } catch (e) { setMessage(e instanceof Error ? e.message : "Action failed"); }
  }
  async function markVendorIssueSolved(issueId: string) {
    if (!window.confirm("Mark this issue solved?")) return;
    try { await action({ action: "updateVendorIssue", issueId, data: { solved: "Yes" } }); await reloadVendorData(); } catch (e) { setMessage(e instanceof Error ? e.message : "Action failed"); }
  }

  function openVendorFollowUp() { setVfuVendor(""); setVmMsg(null); setVendorModal("followUp"); }
  async function generateVendorFollowUp() {
    if (!vfuVendor) { setVmMsg({ text: "Select a vendor.", kind: "error" }); return; }
    const openIssues = vendorIssues.filter((iss) => iss.solved !== "Yes" && (vendorProfiles.find((p) => p.id === iss.profileId)?.vendor === vfuVendor || iss.vendor === vfuVendor));
    if (!openIssues.length) { setVmMsg({ text: "No open issues for this vendor.", kind: "error" }); return; }
    try {
      const payload = await action({ action: "logVendorFollowUpBulk", issueIds: openIssues.map((iss) => iss.id) });
      if (payload.error) { setVmMsg({ text: payload.error, kind: "error" }); return; }
      const lines = openIssues.map((iss) => `• ${iss.issueType}${iss.issueNotes ? " — " + iss.issueNotes : ""}`);
      const text = `Hi ${vfuVendor}, following up on ${openIssues.length} open issue(s):\n\n${lines.join("\n")}\n\nCan you share an update?`;
      await navigator.clipboard.writeText(text);
      setVmMsg({ text: `Follow-up logged on ${payload.updated} issue(s) and message copied to clipboard.`, kind: "success" });
      await reloadVendorData();
    } catch (e) { vmFail(e); }
  }

  function openVfModal(issueId: string) { setVfForm({ issueId, date: new Date().toISOString().slice(0, 10), text: "", eta: "" }); setVmMsg(null); setVendorModal("feedback"); }
  async function saveVfForm() {
    try {
      const payload = await action({ action: "updateVendorIssue", issueId: vfForm.issueId, data: { vendorFeedbackDate: vfForm.date, vendorFeedback: vfForm.text, vendorEta: vfForm.eta } });
      if (payload.error) { setVmMsg({ text: payload.error, kind: "error" }); return; }
      setVendorModal(null);
      await reloadVendorData();
    } catch (e) { vmFail(e); }
  }

  function openReplaceProfile(oldProfileId: string, issueId?: string) {
    const old = vendorProfiles.find((p) => p.id === oldProfileId);
    setVrForm({ oldProfileId, issueId: issueId || "", name: "", vendor: "", liUrl: "", price: "", registered: new Date().toISOString().slice(0, 10), snConnected: "", managedBy: "", notes: "" });
    setVmMsg(null);
    void old;
    setVendorModal("replace");
  }
  async function saveVrForm() {
    if (!vrForm.name.trim()) { setVmMsg({ text: "New profile name is required.", kind: "error" }); return; }
    try {
      const data = { name: vrForm.name, vendor: vrForm.vendor, liProfileUrl: vrForm.liUrl, price: vrForm.price, registeredDate: vrForm.registered, snConnectedDate: vrForm.snConnected, managedBy: vrForm.managedBy, notes: vrForm.notes };
      const payload = await action({ action: "replaceVendorProfile", oldProfileId: vrForm.oldProfileId, data, issueId: vrForm.issueId || undefined });
      if (payload.error) { setVmMsg({ text: payload.error, kind: "error" }); return; }
      setVendorModal(null);
      await reloadVendorData();
    } catch (e) { vmFail(e); }
  }

  const filteredVendorProfiles = vendorProfiles.filter((p) => {
    if (vmProfilesFilter === "active" && p.health !== "OK") return false;
    if (vmProfilesFilter === "issue" && !(p.openIssueCount > 0)) return false;
    if (!vmProfilesSearch.trim()) return true;
    const q = vmProfilesSearch.trim().toLowerCase();
    return p.name.toLowerCase().includes(q) || p.vendor.toLowerCase().includes(q) || (p.managedBy || "").toLowerCase().includes(q);
  });
  const filteredVendorOrders = vendorOrders.filter((o) => !vmOrdersPendingOnly || o.status === "Ordered");
  const filteredVendorIssues = vendorIssues.filter((iss) => !vmIssuesUnresolvedOnly || iss.solved !== "Yes")
    .slice().sort((a, b) => (b.reportedDate || "").localeCompare(a.reportedDate || ""));
  const vendorProfileById = new Map(vendorProfiles.map((p) => [p.id, p]));

  function vendorHealthTone(p: any): "green" | "yellow" | "red" | "gray" {
    if (p.health === "Replaced") return "gray";
    if (p.openIssueCount > 0) return "red";
    if (p.health === "Expiring Soon" || p.health === "Sales Nav Expired") return "yellow";
    return "green";
  }

  // ── Recruiter Payments + Wise ────────────────────────────────────────────
  async function openFinanceTab() {
    setTab("finance");
    if (paymentsLoaded) return;
    setPaymentsLoaded(true);
    action({ action: "recruiterPaymentsReport" }).then((p) => setPaymentRows(p.rows || [])).catch((e) => setMessage(e instanceof Error ? e.message : "Could not load recruiter payments"));
  }
  const paymentCycles = Array.from(new Set(paymentRows.map((r) => r.cycleLabel))).filter(Boolean);
  const filteredPaymentRows = paymentRows.filter((r) => {
    if (paymentSearch && !String(r.name || "").toLowerCase().includes(paymentSearch.toLowerCase())) return false;
    if (paymentCycleFilter && r.cycleLabel !== paymentCycleFilter) return false;
    return true;
  });
  function openInvoiceModal(row: any) { setInvoiceModal({ email: row.email, cycleKey: row.cycleKey, name: row.name, cycleLabel: row.cycleLabel }); setInvoiceId(""); }
  async function saveMarkPaid() {
    if (!invoiceModal) return;
    if (!invoiceId.trim()) { setMessage("Invoice ID is required."); return; }
    try {
      const payload = await action({ action: "markRecruiterPaid", recruiterEmail: invoiceModal.email, cycleKey: invoiceModal.cycleKey, invoiceId });
      if (payload.error) { setMessage(payload.error); return; }
      setInvoiceModal(null);
      const p = await action({ action: "recruiterPaymentsReport" });
      setPaymentRows(p.rows || []);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Action failed"); }
  }
  async function openWiseModal() {
    setWiseModal(true);
    setWiseSelected("");
    setWiseAccount("");
    try {
      const payload = await action({ action: "recruiterRosterForPayment" });
      setWiseRoster(payload.roster || []);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Could not load recruiter roster"); }
  }
  function selectWiseRecruiter(email: string) {
    setWiseSelected(email);
    setWiseAccount(wiseRoster.find((r) => r.email === email)?.wiseAccount || "");
  }
  async function saveWiseAccount() {
    if (!wiseSelected) { setMessage("Select a recruiter."); return; }
    try {
      await action({ action: "setRecruiterWiseAccount", recruiterEmail: wiseSelected, wiseAccount });
      setWiseModal(false);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Action failed"); }
  }

  // ── Recurring Tasks ──────────────────────────────────────────────────────
  async function openRecurringModal() {
    setRecurringModal(true);
    setRecurringMsg(null);
    try {
      const payload = await action({ action: "recurringTasks" });
      setRecurringRows(payload.rows || []);
    } catch (e) { setRecurringMsg({ text: e instanceof Error ? e.message : "Could not load recurring tasks", kind: "error" }); }
  }
  async function saveRecurringTask() {
    if (!recurringForm.title.trim()) { setRecurringMsg({ text: "Title is required.", kind: "error" }); return; }
    if (!recurringForm.daysOfMonth.trim()) { setRecurringMsg({ text: "Days of Month is required (e.g. 1,16).", kind: "error" }); return; }
    try {
      const payload = await action({ action: "addRecurringTask", data: recurringForm });
      if (payload.error) { setRecurringMsg({ text: payload.error, kind: "error" }); return; }
      setRecurringForm({ title: "", description: "", topic: "", priority: "Medium", daysOfMonth: "", assignedEmail: "", assignedName: "" });
      const rows = await action({ action: "recurringTasks" });
      setRecurringRows(rows.rows || []);
    } catch (e) { setRecurringMsg({ text: e instanceof Error ? e.message : "Action failed", kind: "error" }); }
  }
  async function toggleRecurring(id: string, active: boolean) {
    try {
      await action({ action: "toggleRecurringTask", id, active });
      const rows = await action({ action: "recurringTasks" });
      setRecurringRows(rows.rows || []);
    } catch (e) { setRecurringMsg({ text: e instanceof Error ? e.message : "Action failed", kind: "error" }); }
  }
  async function checkRecurringNow() {
    try {
      const payload = await action({ action: "runRecurringCheck" });
      setRecurringMsg({ text: `Created ${payload.created} task(s).`, kind: "success" });
      await reload();
    } catch (e) { setRecurringMsg({ text: e instanceof Error ? e.message : "Action failed", kind: "error" }); }
  }

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
    <>
      <BodyClass names="full-page wide-page" />

      <AppHeader logo="📈 Growth" user={`${session.name} | ${session.email}`}>
        <button className="btn btn-ghost btn-sm" onClick={reload}>
          ↻ Refresh
        </button>
        <LogoutButton />
      </AppHeader>

      <div className="screen-content">
      {loadError && <div className="msg msg-error">Growth data failed to load: {loadError}</div>}
      {message && <div className="msg msg-error">{message}</div>}

      {/* Pinned block — always visible above the tabs, matching GAS */}
      <section className="gr-pinned">
        <div className="gr-section-title">
          Client Status{" "}
          <span style={{ textTransform: "none", fontWeight: 500, color: "#999", fontSize: 11 }}>
            (click a number for the list)
          </span>
        </div>
        <section className="gr-stats-row">
          <StatTile label="On Fire" value={clients.onFire ?? 0} color="#dc2626" onClick={() => showClientBucket("onFire", "On Fire")} />
          <StatTile label="Smokin" value={clients.smokin ?? 0} color="#ea580c" onClick={() => showClientBucket("smokin", "Smokin")} />
          <StatTile label="On Track" value={clients.onTrack ?? 0} color="#0891b2" onClick={() => showClientBucket("onTrack", "On Track")} />
          <StatTile label="Improving" value={clients.improving ?? 0} color="#2563eb" onClick={() => showClientBucket("improving", "Improving")} />
          <StatTile label="Paused" value={clients.paused ?? 0} color="#b45309" onClick={() => showClientBucket("paused", "Paused")} />
          <StatTile label="Active Clients" value={clients.activeClients ?? 0} color="#059669" />
          <StatTile label="Wait List" value={clients.waitlistTabCount ?? 0} onClick={showWaitList} />
        </section>

        <div className="gr-section-title">Appointments</div>
        <section className="gr-stats-row">
          <StatTile label="Today" value={appts.today ?? 0} />
          <StatTile label="Yesterday" value={appts.yesterday ?? 0} />
          <StatTile label="Last 7 Days" value={appts.last7 ?? 0} />
          <StatTile label="Last 14 Days" value={appts.last14 ?? 0} />
          <StatTile label="Last 28 Days" value={appts.last28 ?? 0} />
          <StatTile label="Total Appt So Far" value={appts.total ?? 0} />
        </section>

        <div className="gr-section-title">
          All Appointments{" "}
          <span style={{ textTransform: "none", fontWeight: 500, color: "#999", fontSize: 11 }}>
            (master sheet — every appointment received)
          </span>
        </div>
        <PeriodTable
          title=""
          rows={[
            { label: "Received", counts: allAppt.received || {} },
            { label: "Process", counts: allAppt.process || {} },
            { label: "Recall", counts: allAppt.recall || {} }
          ]}
        />
        <div className="text-muted" style={{ marginTop: 6, fontSize: 12 }}>
          Recall reasons (all-time) — Looking for Job: <strong>{allAppt.recallReasons?.lookingForJob ?? 0}</strong> &nbsp;
          Vendor: <strong>{allAppt.recallReasons?.vendor ?? 0}</strong> &nbsp;
          Other: <strong>{allAppt.recallReasons?.other ?? 0}</strong>
        </div>
      </section>

      {tab === "dashboard" ? (
        <section>
          <div className="gr-dash-heading">Sections</div>
          <div className="gr-dash-sub">Select a section below to see its full details.</div>
          <div className="tiles-grid">
            <div
              className="tile"
              role="button"
              tabIndex={0}
              onClick={() => setTab("tasks")}
              onKeyDown={(e) => { if (e.key === "Enter") (() => setTab("tasks"))(); }}
            >
              <span className="tile-icon">📝</span>
              <div className="tile-title">Daily Task</div>
              <div className="tile-desc">Personal task list grouped by topic — priority, ETA/TBD, and auto-generated recurring tasks</div>
            </div>
            <div
              className="tile"
              role="button"
              tabIndex={0}
              onClick={openRecruitersTab}
              onKeyDown={(e) => { if (e.key === "Enter") (openRecruitersTab)(); }}
            >
              <span className="tile-icon">🧑‍💼</span>
              <div className="tile-title">Recruiters <span style={{ fontWeight: 500, color: "#999", fontSize: 12 }}>(Recruiter Activity)</span></div>
              <div className="tile-desc">Active recruiters, overall S2A, Sends, S2A by recruiter, Top 5 &amp; Non-Productive lists</div>
            </div>
            <div
              className="tile"
              role="button"
              tabIndex={0}
              onClick={openClientsTab}
              onKeyDown={(e) => { if (e.key === "Enter") (openClientsTab)(); }}
            >
              <span className="tile-icon">📊</span>
              <div className="tile-title">Client Tracker</div>
              <div className="tile-desc">Every client — quota, cycle, CA/NY ratios, and feedback in one searchable table</div>
            </div>
            <div
              className="tile"
              role="button"
              tabIndex={0}
              onClick={() => setTab("linkbooking")}
              onKeyDown={(e) => { if (e.key === "Enter") (() => setTab("linkbooking"))(); }}
            >
              <span className="tile-icon">🔗</span>
              <div className="tile-title">Link Open vs Booking</div>
              <div className="tile-desc">Per-client Calendly funnel from Google Analytics — Views, Select Time, Booked, Drop Off</div>
            </div>
            <div
              className="tile"
              role="button"
              tabIndex={0}
              onClick={openFinanceTab}
              onKeyDown={(e) => { if (e.key === "Enter") (openFinanceTab)(); }}
            >
              <span className="tile-icon">💰</span>
              <div className="tile-title">Finance <span style={{ fontWeight: 500, color: "#999", fontSize: 12 }}>(Cost &amp; Payments)</span></div>
              <div className="tile-desc">Company age, all-time cost &amp; earnings, monthly trend, and adding new cost/payment entries</div>
            </div>
            <div
              className="tile"
              role="button"
              tabIndex={0}
              onClick={openReportsTab}
              onKeyDown={(e) => { if (e.key === "Enter") (openReportsTab)(); }}
            >
              <span className="tile-icon">📈</span>
              <div className="tile-title">Reports <span style={{ fontWeight: 500, color: "#999", fontSize: 12 }}>(Billing Cycle &amp; Directory)</span></div>
              <div className="tile-desc">Billing cycle trends per recruiter, plus a Recruiter Directory of all-time Appts, Sends &amp; Sales Nav seats</div>
            </div>
            <div
              className="tile"
              role="button"
              tabIndex={0}
              onClick={openVendorsTab}
              onKeyDown={(e) => { if (e.key === "Enter") (openVendorsTab)(); }}
            >
              <span className="tile-icon">🏢</span>
              <div className="tile-title">Vendor Management</div>
              <div className="tile-desc">Every LI profile by vendor — issue history, vendor feedback, replacements, and downtime per cycle</div>
            </div>
          </div>
        </section>
      ) : (
        // GAS section header: Back button + the section's own title, so you
        // always know which section you're in and how to get out of it.
        <div className="panel-nav">
          <button className="btn-back" onClick={() => setTab("dashboard")}>
            ← Dashboard
          </button>
          <span className="panel-title-text">{SECTION_TITLES[tab] || ""}</span>
        </div>
      )}

      {tab === "dashboard" && (
        <>
          <section className="row-auto">
            <div className="card">
              <div className="card-header"><h2>Recent Feedback</h2><span className="badge">{unreviewedFeedback.length} unreviewed</span></div>
              <div className="task-list">
                {unreviewedFeedback.slice(0, 8).map((f: any) => (
                  <div className="flex-between" style={{ padding: "8px 0", borderBottom: "1px solid #f0f0f0" }} key={f.id}>
                    <strong>{f.name}</strong>
                    <span>{f.responses_today || 0} responses | {f.comments || f.unusual}</span>
                    <button className="btn btn-outline" onClick={() => doAction({ action: "markFeedbackReviewed", id: f.id })}>Reviewed</button>
                  </div>
                ))}
                {unreviewedFeedback.length === 0 && <div className="text-muted">Nothing to review.</div>}
              </div>
            </div>
            <div className="card">
              <h2>Recent Appointments</h2>
              <div className="task-list">
                {(data.appointments || []).slice(0, 8).map((a: any) => (
                  <div className="flex-between" style={{ padding: "8px 0", borderBottom: "1px solid #f0f0f0" }} key={a.id}><strong>{a.invitee_name}</strong><span>{a.client_name} | {a.status}</span></div>
                ))}
              </div>
            </div>
          </section>
          <section className="card">
            <h2>👁 Impersonate</h2>
            <div className="btn-group">
              <button className="btn btn-outline" onClick={() => openImpersonatePicker("operations")}>Operations Panel →</button>
              <button className="btn btn-outline" onClick={() => openImpersonatePicker("recruiter")}>Recruiter Panel →</button>
            </div>
            {impersonateRole && (
              <div className="task-list">
                {impersonateOptions.length === 0 && <div className="text-muted">Loading...</div>}
                {impersonateOptions.map((u) => (
                  <button key={u.email} className="task-item" role="button" tabIndex={0} onClick={() => impersonate(u.email)}>
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
          <section className="card">
            <div className="card-header"><h2>👥 Recruiter Activity</h2></div>
            <section className="gr-stats-row">
              <StatTile label="Active Recruiters" value={recruitersSummary.active ?? 0} sub={`${recruitersSummary.bdInhouseCount ?? 0} BD/Inhouse · ${recruitersSummary.phCount ?? 0} PH`} />
              <StatTile label="Active Sales Nav" value={recruitersSummary.activeSalesNav ?? 0} />
            </section>
          </section>

          <section className="card">
            <div className="card-header"><h2>🟢 Recruiter Status</h2><span className="text-muted">From Time Log — click a number for the list</span></div>
            {!onlineStatus && <div className="text-muted">Loading...</div>}
            {onlineStatus && (
              <section className="gr-stats-row">
                <StatTile label="Online Now" value={onlineStatus.online?.length ?? 0} sub={typeSubNote(onlineStatus.counts?.online)} color="#059669" onClick={() => showRecruiterStatusBucket("online", "Online Now")} />
                <StatTile label="Offline" value={onlineStatus.offline?.length ?? 0} sub={typeSubNote(onlineStatus.counts?.offline)} color="#6b7280" onClick={() => showRecruiterStatusBucket("offline", "Offline")} />
                <StatTile label="Not Started Today" value={onlineStatus.notStarted?.length ?? 0} sub={typeSubNote(onlineStatus.counts?.notStarted)} color="#dc2626" onClick={() => showRecruiterStatusBucket("notStarted", "Not Started Today")} />
                <StatTile label="Inactive 5+ Days" value={onlineStatus.inactive5d?.length ?? 0} sub={typeSubNote(onlineStatus.counts?.inactive5d)} color="#b45309" onClick={() => showRecruiterStatusBucket("inactive5d", "Inactive 5+ Days")} />
                <StatTile label="On Leave Today" value={leaveToday.length} color="#0891b2" onClick={() => showLeaveModal(leaveToday, "On Leave Today")} />
                <StatTile label="On Leave Tomorrow" value={leaveTomorrow.length} color="#0891b2" onClick={() => showLeaveModal(leaveTomorrow, "On Leave Tomorrow")} />
              </section>
            )}
          </section>

          <section className="card">
            <div className="card-header"><h2>📊 S2A by Type</h2><span className="text-muted">Sends per appointment</span></div>
            <PeriodTable
              title=""
              rows={(["BD/Inhouse", "PH"] as const).map((type) => ({
                label: type,
                counts: Object.fromEntries(PERIODS.map((p) => [p.key, s2aByType[type]?.[p.key]?.sendsPerAppt ?? null])) as Record<PeriodKey, number | null>
              }))}
            />
          </section>

          <section className="card">
            <div className="card-header"><h2>📤 Sends</h2><span className="text-muted">Click a number to see who sent them</span></div>
            <section className="gr-stats-row">
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

          <section className="card">
            <div className="card-header"><h2>💬 New Nurture Sent</h2><span className="text-muted">First nurture message ever sent</span></div>
            {!nurtureFu && <div className="text-muted">Loading...</div>}
            {nurtureFu && (
              <section className="gr-stats-row">
                {PERIODS.map((p) => (
                  <StatTile
                    key={p.key}
                    label={p.label}
                    value={nurtureFu.newNurture?.[p.key] ?? 0}
                    sub={`${nurtureFu.newNurture?.byType?.["BD/Inhouse"]?.[p.key] ?? 0} BD/Inhouse · ${nurtureFu.newNurture?.byType?.PH?.[p.key] ?? 0} PH`}
                  />
                ))}
              </section>
            )}
          </section>

          <section className="card">
            <div className="card-header"><h2>🔁 FU Sent</h2><span className="text-muted">FU1 + FU2 + FU3 combined</span></div>
            {!nurtureFu && <div className="text-muted">Loading...</div>}
            {nurtureFu && (
              <>
                <section className="gr-stats-row">
                  {PERIODS.map((p) => (
                    <StatTile
                      key={p.key}
                      label={p.label}
                      value={nurtureFu.fuSent?.[p.key] ?? 0}
                      sub={`${nurtureFu.fuSent?.byType?.["BD/Inhouse"]?.[p.key] ?? 0} BD/Inhouse · ${nurtureFu.fuSent?.byType?.PH?.[p.key] ?? 0} PH`}
                    />
                  ))}
                </section>
                <div className="text-muted" style={{ marginTop: 6, fontSize: 12 }}>
                  FU1: <strong>{nurtureFu.fuSent?.byStage?.fu1 ?? 0}</strong> · FU2: <strong>{nurtureFu.fuSent?.byStage?.fu2 ?? 0}</strong> · FU3: <strong>{nurtureFu.fuSent?.byStage?.fu3 ?? 0}</strong>
                </div>
              </>
            )}
          </section>

          <section className="card">
            <div className="btn-group">
              <button className="btn btn-outline" onClick={() => setShowTop5((v) => !v)}>🏆 Top 5 by Appointments (14d)</button>
              <button className="btn btn-outline" onClick={() => setShowNonProd((v) => !v)}>⚠️ Non-Productive Recruiters (14d)</button>
            </div>
            {showTop5 && (
              <div className="task-list">
                {(recruitersSummary.top5ByAppts || []).map((r: any, idx: number) => (
                  <div className="flex-between" style={{ padding: "8px 0", borderBottom: "1px solid #f0f0f0" }} key={r.email}><strong>#{idx + 1} {r.name}</strong><span>{r.appts14} appt / {r.sends14} sent — {r.s2a}% S2A</span></div>
                ))}
                {(!recruitersSummary.top5ByAppts || recruitersSummary.top5ByAppts.length === 0) && <div className="text-muted">No data.</div>}
              </div>
            )}
            {showNonProd && (
              <div className="task-list">
                {(recruitersSummary.nonProductive || []).map((r: any) => (
                  <div className="flex-between" style={{ padding: "8px 0", borderBottom: "1px solid #f0f0f0" }} key={r.email}><strong>{r.name}</strong><span className="badge">0 appts</span></div>
                ))}
                {(!recruitersSummary.nonProductive || recruitersSummary.nonProductive.length === 0) && <div className="text-muted">Everyone booked at least 1 appointment.</div>}
              </div>
            )}
          </section>

          <section className="card">
            <h2>📆 Daily Appointment by Recruiters</h2>
            <div className="gr-lb-daterow">
              <div className="gr-lb-field">
                <label>Start</label>
                <input type="date" value={s2aRange.startDate} onChange={(e) => setS2aRange({ ...s2aRange, startDate: e.target.value })} />
              </div>
              <div className="gr-lb-field">
                <label>End</label>
                <input type="date" value={s2aRange.endDate} onChange={(e) => setS2aRange({ ...s2aRange, endDate: e.target.value })} />
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => loadS2ARange(s2aRange.startDate, s2aRange.endDate)}>Apply</button>
              <button className="btn btn-outline btn-sm" onClick={() => quickRange(1)}>Today</button>
              <button className="btn btn-outline btn-sm" onClick={() => quickRange(2)}>Yesterday+Today</button>
              <button className="btn btn-outline btn-sm" onClick={() => quickRange(7)}>Last 7 Days</button>
              <button className="btn btn-outline btn-sm" onClick={() => quickRange(14)}>Last 14 Days</button>
              <button className="btn btn-outline btn-sm" onClick={() => quickRange(28)}>Last 28 Days</button>
            </div>
            {s2aRangeData && (
              <>
                <div className="text-muted" style={{ margin: "8px 0" }}>
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

          <section className="card">
            <div className="card-header"><h2>📝 Daily Feedback</h2></div>
            <div className="gr-lb-daterow">
              <div className="gr-lb-field">
                <label>Date</label>
                <input type="date" value={feedbackDate} onChange={(e) => setFeedbackDate(e.target.value)} />
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => loadFeedbackForDate(feedbackDate)}>Apply</button>
              <button className="btn btn-outline btn-sm" onClick={() => loadFeedbackForDate(new Date().toISOString().slice(0, 10))}>Today</button>
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
                    <tr><td colSpan={7} className="text-muted">No feedback submitted for this date.</td></tr>
                  )}
                  {!feedbackRows && (
                    <tr><td colSpan={7} className="text-muted">Loading…</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {tab === "clients" && (
        <>
          <section className="card">
            <h2>🏢 Client Tracker</h2>
            <div className="btn-group" style={{ marginBottom: 10, flexWrap: "wrap" }}>
              <button className="btn btn-primary btn-sm" onClick={() => { setCtMsg(null); setClientModal("add"); }}>➕ Add Client</button>
              <button className="btn btn-outline btn-sm" onClick={() => { setCtMsg(null); setUpdateClientForm(emptyUpdateClient); setClientModal("update"); }}>✏️ Update Client</button>
              <button className="btn btn-outline btn-sm" onClick={() => { setCtMsg(null); setArchiveForm({ clientName: "", reason: "" }); setClientModal("archive"); }}>🗄️ Archive Client</button>
              <button className="btn btn-outline btn-sm" onClick={() => { setCtMsg(null); setMarkLedgerForm({ clientName: "", cycle: "" }); setClientModal("markLedger"); }}>📤 Mark Ledger Sent</button>
              <button className="btn btn-outline btn-sm" onClick={() => { setCtMsg(null); setLedgerCsvClient(""); setClientModal("ledgerCsv"); }}>⬇️ Download Ledger CSV</button>
              <button className="btn btn-primary btn-sm" onClick={() => { setCtMsg(null); setWaitlistForm({ date: new Date().toISOString().slice(0, 10), clientName: "", contactEmail: "", eta: "", notes: "" }); setClientModal("waitlist"); }}>➕ Add to Wait List</button>
            </div>
            <input placeholder="Search clients…" value={ctSearch} onChange={(e) => setCtSearch(e.target.value)} style={{ marginBottom: 6, width: "100%", maxWidth: 320 }} />
            <div className="text-muted" style={{ marginBottom: 6, fontSize: 12 }}>{filteredClientRows.length} of {clientRows.length} client(s)</div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Client</th><th>Status</th><th>Quota</th><th>Target/Day</th><th>Cycle</th>
                    <th>Total Appts</th><th>Last 7 Days Appts</th><th>Remaining (Cycle)</th><th>% Quota Complete</th><th>Overall CA/NY</th><th>Cycle CA/NY</th>
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
                        <td>{c.last7Appts ?? 0}</td>
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
                    <tr><td colSpan={15} className="text-muted" style={{ textAlign: "center", padding: 20 }}>{clientTrackerLoaded ? "No clients match." : "Loading…"}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {slotCheckClient && (
            <div className="modal-overlay" onClick={() => setSlotCheckClient(null)}>
              <div className="card" style={{ maxWidth: 420, width: "92vw" }} onClick={(e) => e.stopPropagation()}>
                <div className="card-header"><h2>Check Slots — {slotCheckClient}</h2><button className="modal-close" onClick={() => setSlotCheckClient(null)}>✕</button></div>
                {(() => {
                  const c = clientRows.find((x) => x.name === slotCheckClient);
                  return c?.eventUrl ? <p><a href={c.eventUrl} target="_blank" rel="noreferrer">Open Calendly →</a></p> : null;
                })()}
                <div className="btn-group">
                  <button className="btn btn-primary" onClick={() => logSlotCheck("available")}>Available now — take live</button>
                  <button className="btn btn-outline" onClick={() => logSlotCheck("not_available")}>Still not available</button>
                </div>
              </div>
            </div>
          )}

          {vacationCheckClient && (
            <div className="modal-overlay" onClick={() => setVacationCheckClient(null)}>
              <div className="card" style={{ maxWidth: 420, width: "92vw" }} onClick={(e) => e.stopPropagation()}>
                <div className="card-header"><h2>Check Vacation — {vacationCheckClient}</h2><button className="modal-close" onClick={() => setVacationCheckClient(null)}>✕</button></div>
                <div className="btn-group">
                  <button className="btn btn-primary" onClick={() => logVacationCheck("back")}>Client is back — reactivate</button>
                  <button className="btn btn-outline" onClick={() => logVacationCheck("still_away")}>Still on vacation</button>
                </div>
              </div>
            </div>
          )}

          {clientModal === "add" && (
            <div className="modal-overlay" onClick={() => setClientModal(null)}>
              <div className="card" style={{ maxWidth: 640, width: "94vw", maxHeight: "86vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
                <div className="card-header"><h2>➕ Add Client</h2><button className="modal-close" onClick={() => setClientModal(null)}>✕</button></div>
                {ctMsg && <div className={`msg msg-${ctMsg.kind}`}>{ctMsg.text}</div>}
                <div className="row-auto">
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
                      <span className="text-muted" style={{ fontSize: 11 }}><input type="checkbox" checked={addClientForm.vacationTbd} onChange={(e) => setAddClientForm({ ...addClientForm, vacationTbd: e.target.checked })} /> TBD</span>
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
                <div className="btn-group" style={{ marginTop: 10 }}>
                  <button className="btn btn-primary" onClick={saveAddClient}>Save Client</button>
                  <button className="btn btn-outline" onClick={() => setClientModal(null)}>Cancel</button>
                </div>
              </div>
            </div>
          )}

          {clientModal === "update" && (
            <div className="modal-overlay" onClick={() => setClientModal(null)}>
              <div className="card" style={{ maxWidth: 640, width: "94vw", maxHeight: "86vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
                <div className="card-header"><h2>✏️ Update Client</h2><button className="modal-close" onClick={() => setClientModal(null)}>✕</button></div>
                {ctMsg && <div className={`msg msg-${ctMsg.kind}`}>{ctMsg.text}</div>}
                <div className="row-auto">
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
                      <span className="text-muted" style={{ fontSize: 11 }}><input type="checkbox" checked={updateClientForm.vacationTbd} onChange={(e) => setUpdateClientForm({ ...updateClientForm, vacationTbd: e.target.checked })} /> TBD</span>
                    </label>
                  )}
                  <label>Vertical<input value={updateClientForm.vertical} onChange={(e) => setUpdateClientForm({ ...updateClientForm, vertical: e.target.value })} /></label>
                  <label>Package Type<input value={updateClientForm.packageType} onChange={(e) => setUpdateClientForm({ ...updateClientForm, packageType: e.target.value })} /></label>
                  <label>Action Taken<input value={updateClientForm.actionTaken} onChange={(e) => setUpdateClientForm({ ...updateClientForm, actionTaken: e.target.value })} /></label>
                  <label>Payment Notes<input value={updateClientForm.paymentNotes} onChange={(e) => setUpdateClientForm({ ...updateClientForm, paymentNotes: e.target.value })} /></label>
                  <label>Quota Notes<input value={updateClientForm.quotaNotes} onChange={(e) => setUpdateClientForm({ ...updateClientForm, quotaNotes: e.target.value })} /></label>
                </div>
                <div className="btn-group" style={{ marginTop: 10 }}>
                  <button className="btn btn-primary" onClick={saveUpdateClient}>Save Changes</button>
                  <button className="btn btn-outline" onClick={() => setClientModal(null)}>Cancel</button>
                </div>
              </div>
            </div>
          )}

          {clientModal === "archive" && (
            <div className="modal-overlay" onClick={() => setClientModal(null)}>
              <div className="card" style={{ maxWidth: 460, width: "92vw" }} onClick={(e) => e.stopPropagation()}>
                <div className="card-header"><h2>🗄️ Archive Client</h2><button className="modal-close" onClick={() => setClientModal(null)}>✕</button></div>
                {ctMsg && <div className={`msg msg-${ctMsg.kind}`}>{ctMsg.text}</div>}
                <div className="form-row">
                  <label>Client<select value={archiveForm.clientName} onChange={(e) => setArchiveForm({ ...archiveForm, clientName: e.target.value })}>
                    <option value="">Select a client…</option>
                    {clientRows.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select></label>
                  <textarea placeholder="Archive reason (required)" value={archiveForm.reason} onChange={(e) => setArchiveForm({ ...archiveForm, reason: e.target.value })} />
                </div>
                <div className="btn-group" style={{ marginTop: 10 }}>
                  <button className="btn btn-primary" onClick={saveArchiveClient}>Archive</button>
                  <button className="btn btn-outline" onClick={() => setClientModal(null)}>Cancel</button>
                </div>
              </div>
            </div>
          )}

          {clientModal === "markLedger" && (
            <div className="modal-overlay" onClick={() => setClientModal(null)}>
              <div className="card" style={{ maxWidth: 460, width: "92vw" }} onClick={(e) => e.stopPropagation()}>
                <div className="card-header"><h2>📤 Mark Ledger Sent</h2><button className="modal-close" onClick={() => setClientModal(null)}>✕</button></div>
                {ctMsg && <div className={`msg msg-${ctMsg.kind}`}>{ctMsg.text}</div>}
                <div className="form-row">
                  <label>Client<select value={markLedgerForm.clientName} onChange={(e) => setMarkLedgerForm({ ...markLedgerForm, clientName: e.target.value })}>
                    <option value="">Select a client…</option>
                    {clientRows.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select></label>
                  <input type="number" placeholder="Cycle number" value={markLedgerForm.cycle} onChange={(e) => setMarkLedgerForm({ ...markLedgerForm, cycle: e.target.value })} />
                </div>
                <div className="btn-group" style={{ marginTop: 10, flexWrap: "wrap" }}>
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
              <div className="card" style={{ maxWidth: 460, width: "92vw" }} onClick={(e) => e.stopPropagation()}>
                <div className="card-header"><h2>⬇️ Download Ledger CSV</h2><button className="modal-close" onClick={() => setClientModal(null)}>✕</button></div>
                {ctMsg && <div className={`msg msg-${ctMsg.kind}`}>{ctMsg.text}</div>}
                <div className="form-row">
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
                <div className="btn-group" style={{ marginTop: 10 }}>
                  <button className="btn btn-primary" disabled={!ledgerCsvClient || (clientRows.find((x) => x.name === ledgerCsvClient)?.quotaCompletePct || 0) < 100} onClick={exportLedgerCsv}>Export CSV</button>
                  <button className="btn btn-outline" onClick={() => setClientModal(null)}>Cancel</button>
                </div>
              </div>
            </div>
          )}

          {clientModal === "waitlist" && (
            <div className="modal-overlay" onClick={() => setClientModal(null)}>
              <div className="card" style={{ maxWidth: 460, width: "92vw" }} onClick={(e) => e.stopPropagation()}>
                <div className="card-header"><h2>➕ Add to Wait List</h2><button className="modal-close" onClick={() => setClientModal(null)}>✕</button></div>
                {ctMsg && <div className={`msg msg-${ctMsg.kind}`}>{ctMsg.text}</div>}
                <div className="form-row">
                  <label>Date<input type="date" value={waitlistForm.date} onChange={(e) => setWaitlistForm({ ...waitlistForm, date: e.target.value })} /></label>
                  <input placeholder="Client Name" value={waitlistForm.clientName} onChange={(e) => setWaitlistForm({ ...waitlistForm, clientName: e.target.value })} />
                  <input placeholder="Contact Email" value={waitlistForm.contactEmail} onChange={(e) => setWaitlistForm({ ...waitlistForm, contactEmail: e.target.value })} />
                  <label>ETA to Launch<input type="date" value={waitlistForm.eta} onChange={(e) => setWaitlistForm({ ...waitlistForm, eta: e.target.value })} /></label>
                  <textarea placeholder="Notes" value={waitlistForm.notes} onChange={(e) => setWaitlistForm({ ...waitlistForm, notes: e.target.value })} />
                </div>
                <div className="btn-group" style={{ marginTop: 10 }}>
                  <button className="btn btn-primary" onClick={saveAddWaitlist}>Save</button>
                  <button className="btn btn-outline" onClick={() => setClientModal(null)}>Cancel</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {tab === "finance" && (
        <>
          <section className="row-auto">
            <div className="card">
              <h2>💵 Add Cost</h2>
              <div className="fin-form-grid">
                <div className="form-row">
                  <label>Amount</label>
                  <input type="number" min="0" step="0.01" placeholder="0" value={cost.amount} onChange={(e) => setCost({ ...cost, amount: e.target.value })} />
                </div>
                <div className="form-row">
                  <label>Description</label>
                  <input placeholder="What was this for?" value={cost.description} onChange={(e) => setCost({ ...cost, description: e.target.value })} />
                </div>
              </div>
              <div className="form-row mt-8">
                <label>Notes</label>
                <textarea placeholder="Optional" value={cost.notes} onChange={(e) => setCost({ ...cost, notes: e.target.value })} />
              </div>
              <button className="btn btn-primary mt-8" onClick={() => doAction({ action: "addCost", ...cost })}>Add Cost</button>
            </div>
            <div className="card">
              <h2>🧾 Add Client Payment</h2>
              <div className="fin-form-grid">
                <div className="form-row">
                  <label>Client Name</label>
                  <input placeholder="Client name" value={payment.clientName} onChange={(e) => setPayment({ ...payment, clientName: e.target.value })} />
                </div>
                <div className="form-row">
                  <label>Total Billed</label>
                  <input type="number" min="0" step="0.01" placeholder="0" value={payment.totalBilled} onChange={(e) => setPayment({ ...payment, totalBilled: e.target.value })} />
                </div>
                <div className="form-row">
                  <label>Invoice # / Ref</label>
                  <input placeholder="Optional" value={payment.invoiceRef} onChange={(e) => setPayment({ ...payment, invoiceRef: e.target.value })} />
                </div>
              </div>
              <button className="btn btn-primary mt-8" onClick={() => doAction({ action: "addPayment", ...payment })}>Add Payment</button>
            </div>
          </section>

          <Card
            title="💸 Recruiter Payments"
            actions={<button className="btn btn-outline btn-sm" onClick={openWiseModal}>💳 Update Recruiter Wise Email</button>}
          >
            <div className="row-auto" style={{ marginBottom: 8 }}>
              <input placeholder="Filter by recruiter name…" value={paymentSearch} onChange={(e) => setPaymentSearch(e.target.value)} />
              <select value={paymentCycleFilter} onChange={(e) => setPaymentCycleFilter(e.target.value)}>
                <option value="">All Billing Cycles</option>
                {paymentCycles.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {!paymentsLoaded && <div className="text-muted">Loading…</div>}
            {paymentsLoaded && (
              <DataTable head={[
                { key: "name", label: "Recruiter" }, { label: "Type" }, { label: "Cycle" },
                { label: "Own Appts" }, { label: "Own Bill" }, { label: "Referral Appts" }, { label: "Referral Bill" },
                { label: "Total" }, { label: "Wise/Payoneer" }, { label: "Status" }
              ]}>
                {filteredPaymentRows.map((r) => (
                  <tr key={`${r.email}|${r.cycleKey}`}>
                    <td>{r.name}</td>
                    <td>{r.type}</td>
                    <td>{r.cycleLabel}</td>
                    <td>{r.ownAppts}</td>
                    <td>${r.ownBill}</td>
                    <td>{r.referralAppts}</td>
                    <td>${r.referralBill}</td>
                    <td><strong>${r.totalBill}</strong></td>
                    <td>{r.wiseAccount || "—"}</td>
                    <td>
                      {r.paid ? <Badge tone="green">Paid #{r.invoiceId}</Badge> : (
                        <button className="btn btn-primary btn-sm" onClick={() => openInvoiceModal(r)}>Mark Paid</button>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredPaymentRows.length === 0 && <EmptyRow colSpan={10}>No recruiter/cycle rows match.</EmptyRow>}
              </DataTable>
            )}
          </Card>

          {invoiceModal && (
            <Modal title={`Mark Paid — ${invoiceModal.name} (${invoiceModal.cycleLabel})`} onClose={() => setInvoiceModal(null)} narrow
              footer={<>
                <button className="btn btn-primary" onClick={saveMarkPaid}>Save</button>
                <button className="btn btn-outline" onClick={() => setInvoiceModal(null)}>Cancel</button>
              </>}>
              <Field label="Invoice ID"><input value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} /></Field>
            </Modal>
          )}

          {wiseModal && (
            <Modal title="Update Recruiter Wise Email" onClose={() => setWiseModal(false)} narrow
              footer={<>
                <button className="btn btn-primary" onClick={saveWiseAccount}>Save</button>
                <button className="btn btn-outline" onClick={() => setWiseModal(false)}>Cancel</button>
              </>}>
              <Field label="Recruiter">
                <select value={wiseSelected} onChange={(e) => selectWiseRecruiter(e.target.value)}>
                  <option value="">Select a recruiter…</option>
                  {wiseRoster.map((r) => <option key={r.email} value={r.email}>{r.name} ({r.type})</option>)}
                </select>
              </Field>
              <Field label="Wise / Payoneer Account"><input value={wiseAccount} onChange={(e) => setWiseAccount(e.target.value)} placeholder="Email or account handle" /></Field>
            </Modal>
          )}
        </>
      )}

      {tab === "tasks" && (
        <section className="card">
          <div className="card-header"><h2>📋 Daily Task</h2><button className="btn btn-outline btn-sm" onClick={openRecurringModal}>🔁 Manage Recurring Tasks</button></div>
          <div className="row-auto">
            <input placeholder="Title" value={task.title} onChange={(e) => setTask({ ...task, title: e.target.value })} />
            <input placeholder="Topic" value={task.topic} onChange={(e) => setTask({ ...task, topic: e.target.value })} />
            <select value={task.priority} onChange={(e) => setTask({ ...task, priority: e.target.value })}><option>Low</option><option>Normal</option><option>High</option></select>
            <button className="btn btn-primary" onClick={() => doAction({ action: "addTask", ...task })}>Add Task</button>
          </div>
          <div className="task-list">
            {(data.tasks || []).map((t: any) => (
              <div className="flex-between" style={{ padding: "8px 0", borderBottom: "1px solid #f0f0f0" }} key={t.id}>
                <strong>{t.title}</strong>
                <span className="badge">{t.status}</span>
                <span>{t.assigned_name}</span>
                <div className="btn-group">
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

          {recurringModal && (
            <Modal title="Manage Recurring Tasks" onClose={() => setRecurringModal(false)}>
              {recurringMsg && <Msg kind={recurringMsg.kind}>{recurringMsg.text}</Msg>}
              <div className="card-header" style={{ marginTop: 0 }}><h2 style={{ fontSize: 13 }}>Existing Recurring Tasks</h2><button className="btn btn-outline btn-sm" onClick={checkRecurringNow}>🔄 Check Now</button></div>
              <div className="task-list">
                {recurringRows.map((r) => (
                  <div className="flex-between" style={{ padding: "8px 0", borderBottom: "1px solid #f0f0f0" }} key={r.id}>
                    <strong>{r.title}</strong>
                    <span className="text-muted">Days: {r.daysOfMonth} · {r.assignedName}</span>
                    <button className="btn btn-outline btn-sm" onClick={() => toggleRecurring(r.id, !r.active)}>{r.active ? "Pause" : "Resume"}</button>
                  </div>
                ))}
                {recurringRows.length === 0 && <div className="text-muted">No recurring tasks yet.</div>}
              </div>
              <div className="card-header" style={{ marginTop: 16 }}><h2 style={{ fontSize: 13 }}>Add New Recurring Task</h2></div>
              <div className="row-auto">
                <input placeholder="Title" value={recurringForm.title} onChange={(e) => setRecurringForm({ ...recurringForm, title: e.target.value })} />
                <input placeholder="Topic" value={recurringForm.topic} onChange={(e) => setRecurringForm({ ...recurringForm, topic: e.target.value })} />
                <select value={recurringForm.priority} onChange={(e) => setRecurringForm({ ...recurringForm, priority: e.target.value })}><option>High</option><option>Medium</option><option>Low</option></select>
                <input placeholder="Days of Month (e.g. 1,16)" value={recurringForm.daysOfMonth} onChange={(e) => setRecurringForm({ ...recurringForm, daysOfMonth: e.target.value })} />
                <input placeholder="Assign to (email)" value={recurringForm.assignedEmail} onChange={(e) => setRecurringForm({ ...recurringForm, assignedEmail: e.target.value })} />
                <button className="btn btn-primary" onClick={saveRecurringTask}>Save Recurring Task</button>
              </div>
            </Modal>
          )}
        </section>
      )}

      {tab === "reports" && (
        <>
          {/* GAS Reports goes straight from the nav to the report toggles.
              The four unrelated stat tiles that used to sit here (total
              appointments / sends / cost / earnings) belong to Finance and
              the pinned block, not to Reports. */}
          <div className="gr-toggle-btns">
            <button
              className={`btn btn-${reportTab === "billing" ? "primary" : "outline"} btn-sm`}
              onClick={() => setReportTab("billing")}
            >
              Billing Cycle by Recruiter
            </button>
            <button
              className={`btn btn-${reportTab === "directory" ? "primary" : "outline"} btn-sm`}
              onClick={() => setReportTab("directory")}
            >
              Recruiter Directory
            </button>
          </div>

          {reportTab === "billing" && (
            <Card title="📆 Billing Cycle by Recruiter">
              <div className="row-auto" style={{ marginBottom: 8 }}>
                <input placeholder="Filter by recruiter name…" value={billingSearch} onChange={(e) => setBillingSearch(e.target.value)} />
                <select value={billingCycleFilter} onChange={(e) => setBillingCycleFilter(e.target.value)}>
                  <option value="">All Billing Cycles</option>
                  {billingCycles.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <button className="btn btn-outline btn-sm" onClick={exportBillingCsv}>⬇️ Export CSV</button>
              </div>
              {!billingLoaded && <div className="text-muted">Loading…</div>}
              {billingLoaded && (
                <DataTable head={[{ label: "Recruiter" }, { label: "Age" }, { label: "Billing Cycle" }, { label: "Appts" }, { label: "Sends" }]}>
                  {filteredBillingRows.map((r, i) => (
                    <tr key={i}><td>{r.name} <span className="text-muted" style={{ fontSize: 11 }}>({r.type})</span></td><td>{r.workingAgeDays ?? "-"}</td><td>{r.cycleLabel}</td><td>{r.appts}</td><td>{r.sends}</td></tr>
                  ))}
                  {filteredBillingRows.length === 0 && <EmptyRow colSpan={5}>No recruiters match.</EmptyRow>}
                </DataTable>
              )}
            </Card>
          )}

          {reportTab === "directory" && (
            <section className="card table-wrap">
              <div className="card-header"><h2>🗂 Recruiter Directory</h2><span className="text-muted">Click a column header to sort</span></div>
              {!directory && <div className="text-muted">Loading...</div>}
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
          )}
        </>
      )}

      {tab === "linkbooking" && (
        <section className="card">
          <h2>🔗 Link Open vs Booking</h2>
          <p className="text-muted">Not built yet — this needs Google Analytics Data API access (property "FranBooking Calendly") that this app doesn't have configured. Waiting on GA4 Viewer access + the Analytics Data API enabled for the service account before this section can be built. The Reports tab's "Client Report" sub-tab has the same GA4 dependency and isn't built for the same reason.</p>
        </section>
      )}

      {tab === "vendors" && (
        <>
          <Card
            title="🏬 Vendor Summary"
            actions={<>
              <button className="btn btn-outline btn-sm" onClick={openAddVendor}>🏷️ Add Vendor</button>
              <button className="btn btn-primary btn-sm" onClick={openLogOrder}>🛒 Log Order</button>
              <button className="btn btn-primary btn-sm" onClick={openAddProfile}>➕ Add Profile</button>
              <button className="btn btn-primary btn-sm" onClick={() => openLogIssue()}>⚠️ Log Issue</button>
            </>}
          >
            {vmMsg && <Msg kind={vmMsg.kind}>{vmMsg.text}</Msg>}
            {!vendorsLoaded && <div className="text-muted">Loading…</div>}
            {vendorsLoaded && (
              <DataTable head={[{ label: "Vendor" }, { label: "Total Purchased" }, { label: "Active" }, { label: "With Open Issue" }, { label: "Last Vendor Update" }, { label: "Actions" }]}>
                {vendorSummary.map((v, i) => (
                  <tr key={v.vendor}>
                    <td><a href="javascript:void(0)" onClick={() => setVendorStatsIdx(i)}><strong>{v.vendor}</strong></a></td>
                    <td>{v.totalPurchased}</td>
                    <td>{v.active}</td>
                    <td>{v.withOpenIssue}</td>
                    <td>{v.lastVendorUpdate || "—"}</td>
                    <td><button className="btn btn-outline btn-sm" onClick={() => { const found = vendorsList.find((x) => x.name === v.vendor); if (found) openEditVendor(found); }}>✏️ Edit</button></td>
                  </tr>
                ))}
                {vendorSummary.length === 0 && <EmptyRow colSpan={6}>No vendors logged yet.</EmptyRow>}
              </DataTable>
            )}
          </Card>

          <Card title={<h2>Orders <span className="text-muted" style={{ fontWeight: 400, fontSize: 12 }}>({filteredVendorOrders.length} of {vendorOrders.length})</span></h2>}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, marginBottom: 10 }}>
              <input type="checkbox" checked={vmOrdersPendingOnly} onChange={(e) => setVmOrdersPendingOnly(e.target.checked)} /> Show only pending orders
            </label>
            <DataTable head={[{ label: "Order" }, { label: "Vendor" }, { label: "Profile" }, { label: "Location" }, { label: "Requested By" }, { label: "Order Date" }, { label: "Received" }, { label: "Status" }, { label: "Price" }, { label: "Notes" }, { label: "Actions" }]}>
              {filteredVendorOrders.map((o) => (
                <tr key={o.id}>
                  <td>{o.id}</td>
                  <td>{o.vendor}</td>
                  <td>{o.profileName ? <>{o.profileName}{o.connections && <div className="text-muted" style={{ fontSize: 11 }}>{o.connections} connections</div>}</> : "—"}</td>
                  <td>{o.location || "—"}</td>
                  <td>{o.requestedBy || "—"}</td>
                  <td>{o.orderDate || "—"}{o.status === "Ordered" && o.daysWaiting !== null && <div className="text-muted" style={{ fontSize: 11 }}>{o.daysWaiting}d waiting</div>}</td>
                  <td>{o.receivedDate || "—"}{o.status === "Received" && o.daysToReceive !== null && <div className="text-muted" style={{ fontSize: 11 }}>{o.daysToReceive}d turnaround</div>}</td>
                  <td><Badge tone={o.status === "Received" ? "green" : o.status === "Cancelled" ? "gray" : "yellow"}>{o.status}</Badge></td>
                  <td>{o.price || "—"}</td>
                  <td>{o.notes || "—"}</td>
                  <td>
                    <div className="btn-group">
                      <button className="btn btn-outline btn-sm" onClick={() => openEditOrder(o)}>✏️ Edit</button>
                      {o.status === "Ordered" && <>
                        <button className="btn btn-primary btn-sm" onClick={() => markOrderReceived(o.id)}>✓ Received</button>
                        <button className="btn btn-outline btn-sm" onClick={() => cancelOrder(o.id)}>✕ Cancel</button>
                      </>}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredVendorOrders.length === 0 && <EmptyRow colSpan={11}>{vmOrdersPendingOnly ? "No orders pending." : "No orders yet."}</EmptyRow>}
            </DataTable>
          </Card>

          <Card title={<h2>Profiles <span className="text-muted" style={{ fontWeight: 400, fontSize: 12 }}>({filteredVendorProfiles.length} of {vendorProfiles.length})</span></h2>}>
            <div className="btn-group" style={{ marginBottom: 10 }}>
              <button className={`btn btn-${vmProfilesFilter === "all" ? "primary" : "outline"} btn-sm`} onClick={() => setVmProfilesFilter("all")}>All</button>
              <button className={`btn btn-${vmProfilesFilter === "active" ? "primary" : "outline"} btn-sm`} onClick={() => setVmProfilesFilter("active")}>✅ Active Only</button>
              <button className={`btn btn-${vmProfilesFilter === "issue" ? "primary" : "outline"} btn-sm`} onClick={() => setVmProfilesFilter("issue")}>⚠️ With Issue</button>
            </div>
            <input placeholder="Filter by name, vendor, or managed by…" value={vmProfilesSearch} onChange={(e) => setVmProfilesSearch(e.target.value)} style={{ marginBottom: 8, width: "100%", maxWidth: 340 }} />
            <DataTable head={[{ label: "Profile" }, { label: "Vendor" }, { label: "Registered" }, { label: "Expire" }, { label: "SN Connected" }, { label: "SN Expire" }, { label: "Last Renewed" }, { label: "Health" }, { label: "Downtime (Cycle)" }, { label: "Managed By" }, { label: "Actions" }]}>
              {filteredVendorProfiles.map((p) => (
                <tr key={p.id}>
                  <td><strong>{p.name}</strong> <span className="text-muted" style={{ fontSize: 11 }}>({p.id})</span>
                    {p.replacedBy && <div className="text-muted" style={{ fontSize: 11 }}>→ Replaced by {p.replacedBy}</div>}
                    {p.replacementOf && <div className="text-muted" style={{ fontSize: 11 }}>Replaces {p.replacementOf}</div>}
                  </td>
                  <td>{p.vendor}</td>
                  <td>{p.registeredDate || "—"}</td>
                  <td>{p.expireDate || "—"}</td>
                  <td>{p.snConnectedDate || "—"}</td>
                  <td>{p.snExpireDate || "—"}</td>
                  <td>{p.lastRenewedDate || "—"}</td>
                  <td><Badge tone={vendorHealthTone(p)}>{p.health}</Badge></td>
                  <td>{p.currentCycleDowntimeDays} day{p.currentCycleDowntimeDays === 1 ? "" : "s"}</td>
                  <td>{p.managedBy || "—"}</td>
                  <td>
                    <div className="btn-group">
                      <button className="btn btn-outline btn-sm" onClick={() => openEditProfile(p)}>✏️ Edit</button>
                      {p.status !== "Replaced" && <button className="btn btn-primary btn-sm" onClick={() => openRenewProfile(p.id)}>🔄 Renew</button>}
                      <button className="btn btn-outline btn-sm" onClick={() => openLogIssue(p.id)}>⚠️ Log Issue</button>
                      {p.status !== "Replaced" && <button className="btn btn-outline btn-sm" onClick={() => openReplaceProfile(p.id)}>🔁 Replace</button>}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredVendorProfiles.length === 0 && <EmptyRow colSpan={11}>No profiles match.</EmptyRow>}
            </DataTable>
          </Card>

          <Card title={<h2>Issue Log <span className="text-muted" style={{ fontWeight: 400, fontSize: 12 }}>({filteredVendorIssues.length} of {vendorIssues.length})</span></h2>}
            actions={<button className="btn btn-primary btn-sm" onClick={openVendorFollowUp}>🔔 Vendor Follow Up</button>}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, marginBottom: 10 }}>
              <input type="checkbox" checked={vmIssuesUnresolvedOnly} onChange={(e) => setVmIssuesUnresolvedOnly(e.target.checked)} /> Show only unresolved issues
            </label>
            <DataTable head={[{ label: "Profile" }, { label: "Vendor" }, { label: "Reported" }, { label: "Type" }, { label: "Notes" }, { label: "Vendor Feedback" }, { label: "Fixed" }, { label: "Solved?" }, { label: "Days" }, { label: "Replacement" }, { label: "Actions" }]}>
              {filteredVendorIssues.map((iss) => {
                const p = vendorProfileById.get(iss.profileId);
                return (
                  <tr key={iss.id}>
                    <td>{p ? <>{p.name} ({p.id})</> : iss.profileId ? iss.profileId : <span className="text-muted">— (Vendor-level)</span>}</td>
                    <td>{p ? p.vendor : (iss.vendor || "—")}</td>
                    <td>{iss.reportedDate || "—"}</td>
                    <td>{iss.issueType}</td>
                    <td>{iss.issueNotes || "—"}</td>
                    <td>
                      {iss.vendorFeedback ? <>{iss.vendorFeedbackDate} — {iss.vendorFeedback}</> : <span className="text-muted">—</span>}
                      {iss.solved !== "Yes" && <div className="text-muted" style={{ fontSize: 11 }}>ETA: {iss.vendorEta || "No ETA received"}</div>}
                      {iss.followUpCount > 0 && <div className="text-muted" style={{ fontSize: 11 }}>Followed up {iss.followUpCount}× (last: {iss.lastFollowUpAt || "—"} CST)</div>}
                    </td>
                    <td>{iss.fixedDate || "—"}</td>
                    <td><Badge tone={iss.solved === "Yes" ? "green" : "red"}>{iss.solved}</Badge></td>
                    <td>{iss.solved === "Yes" ? (iss.daysToSolve !== null ? `${iss.daysToSolve}d to solve` : "—") : (iss.daysOpen !== null ? `${iss.daysOpen}d open` : "—")}</td>
                    <td>{iss.replacementProfileId ? `→ ${iss.replacementProfileId}` : <span className="text-muted">—</span>}</td>
                    <td>
                      {iss.solved !== "Yes" && (
                        <div className="btn-group">
                          <button className="btn btn-outline btn-sm" onClick={() => openVfModal(iss.id)}>💬 Feedback</button>
                          <button className="btn btn-outline btn-sm" onClick={() => followUpVendorIssue(iss.id)}>🔔 Follow Up</button>
                          <button className="btn btn-primary btn-sm" onClick={() => markVendorIssueSolved(iss.id)}>✓ Mark Solved</button>
                          {iss.profileId && <button className="btn btn-outline btn-sm" onClick={() => openReplaceProfile(iss.profileId, iss.id)}>🔁 Replace</button>}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredVendorIssues.length === 0 && <EmptyRow colSpan={11}>{vmIssuesUnresolvedOnly ? "No issues unresolved." : "No issues yet."}</EmptyRow>}
            </DataTable>
          </Card>

          {vendorStatsIdx !== null && vendorSummary[vendorStatsIdx] && (() => {
            const v = vendorSummary[vendorStatsIdx];
            return (
              <Modal title={`Vendor Stats — ${v.vendor}`} onClose={() => setVendorStatsIdx(null)}>
                <p>Total Purchased: <strong>{v.totalPurchased}</strong> | Active: <strong>{v.active}</strong> | With Open Issue: <strong>{v.withOpenIssue}</strong></p>
                <p>Orders — Pending: <strong>{v.ordered}</strong> | Received: <strong>{v.received}</strong>{v.avgOrderDays !== null && <> | Avg Turnaround: <strong>{v.avgOrderDays}d</strong></>}</p>
                {Object.keys(v.issueTypeBreakdown).length > 0 ? (
                  <>
                    <p><strong>Open Issues ({v.withOpenIssue} profile{v.withOpenIssue === 1 ? "" : "s"} affected):</strong></p>
                    <ul>
                      {Object.keys(v.issueTypeBreakdown).map((t) => (
                        <li key={t}>{t}: {v.issueTypeBreakdown[t]}{(v.issueTypeProfileNames[t] || []).length > 0 && ` (${v.issueTypeProfileNames[t].join(", ")})`}</li>
                      ))}
                    </ul>
                    <p className="text-muted">Oldest open issue since: {v.oldestOpenIssueDate || "—"}</p>
                  </>
                ) : <p className="text-muted">No open issues.</p>}
                <p>Overall ETA Status: {v.openIssuesWithEta || v.openIssuesNoEta ? `${v.openIssuesWithEta} with ETA (nearest: ${v.nearestEta || "—"}), ${v.openIssuesNoEta} with no ETA received` : "No open issues"}</p>
                <p className="text-muted">Last Follow-Up: {v.lastFollowUpAt ? `${v.lastFollowUpAt} CST` : "—"} · Last vendor reply: {v.lastVendorUpdate || "—"}</p>
                <p className="text-muted">Communication Channel: {v.channel || "—"}</p>
              </Modal>
            );
          })()}

          {vendorModal === "profile" && (
            <Modal title={vpForm.id ? `Edit Profile — ${vpForm.id}` : "Add Profile"} onClose={() => setVendorModal(null)}
              footer={<><button className="btn btn-primary" onClick={saveVpForm}>Save Profile</button><button className="btn btn-outline" onClick={() => setVendorModal(null)}>Cancel</button></>}>
              {vmMsg && <Msg kind={vmMsg.kind}>{vmMsg.text}</Msg>}
              <Field label="Profile Name / LI Handle *"><input value={vpForm.name} onChange={(e) => setVpForm({ ...vpForm, name: e.target.value })} /></Field>
              <Field label="Vendor Name *">
                <input list="vendor-names" value={vpForm.vendor} onChange={(e) => setVpForm({ ...vpForm, vendor: e.target.value })} />
                <datalist id="vendor-names">{vendorsList.map((v) => <option key={v.id} value={v.name} />)}</datalist>
              </Field>
              <Field label="LI Profile URL"><input value={vpForm.liUrl} onChange={(e) => setVpForm({ ...vpForm, liUrl: e.target.value })} /></Field>
              <Field label="Price (Monthly Cost)"><input type="number" step="0.01" value={vpForm.price} onChange={(e) => setVpForm({ ...vpForm, price: e.target.value })} /></Field>
              <Field label="Registered Date"><input type="date" value={vpForm.registered} onChange={(e) => setVpForm({ ...vpForm, registered: e.target.value })} /></Field>
              <Field label="Sales Nav Connected Date"><input type="date" value={vpForm.snConnected} onChange={(e) => setVpForm({ ...vpForm, snConnected: e.target.value })} /></Field>
              <Field label="Managed By (BD/Inhouse)">
                <input list="vendor-bd-roster" value={vpForm.managedBy} onChange={(e) => setVpForm({ ...vpForm, managedBy: e.target.value })} />
                <datalist id="vendor-bd-roster">{vendorBdRoster.map((r) => <option key={r.email} value={r.name} />)}</datalist>
              </Field>
              {vpForm.id && (
                <Field label="Status">
                  <select value={vpForm.status} onChange={(e) => setVpForm({ ...vpForm, status: e.target.value })}><option>Active</option><option>Retired</option></select>
                </Field>
              )}
              <Field label="Notes"><input value={vpForm.notes} onChange={(e) => setVpForm({ ...vpForm, notes: e.target.value })} /></Field>
            </Modal>
          )}

          {vendorModal === "renew" && (
            <Modal title="Renew Profile" onClose={() => setVendorModal(null)} narrow
              footer={<><button className="btn btn-primary" onClick={saveRenewProfile}>Save Renewal</button><button className="btn btn-outline" onClick={() => setVendorModal(null)}>Cancel</button></>}>
              {vmMsg && <Msg kind={vmMsg.kind}>{vmMsg.text}</Msg>}
              <Field label="Last Renewed Date *"><input type="date" value={vrnForm.lastRenewed} onChange={(e) => setVrnForm({ ...vrnForm, lastRenewed: e.target.value })} /></Field>
              <Field label="Status"><select value={vrnForm.status} onChange={(e) => setVrnForm({ ...vrnForm, status: e.target.value })}><option>Active</option><option>Retired</option></select></Field>
              <Field label="Notes"><input value={vrnForm.notes} onChange={(e) => setVrnForm({ ...vrnForm, notes: e.target.value })} /></Field>
            </Modal>
          )}

          {vendorModal === "vendor" && (
            <Modal title={vnForm.id ? "Edit Vendor" : "Add Vendor"} onClose={() => setVendorModal(null)} narrow
              footer={<><button className="btn btn-primary" onClick={saveVnForm}>Save Vendor</button><button className="btn btn-outline" onClick={() => setVendorModal(null)}>Cancel</button></>}>
              {vmMsg && <Msg kind={vmMsg.kind}>{vmMsg.text}</Msg>}
              <Field label="Vendor Name *"><input value={vnForm.name} onChange={(e) => setVnForm({ ...vnForm, name: e.target.value })} /></Field>
              <Field label="Contact Person"><input value={vnForm.contact} onChange={(e) => setVnForm({ ...vnForm, contact: e.target.value })} /></Field>
              <Field label="Email"><input value={vnForm.email} onChange={(e) => setVnForm({ ...vnForm, email: e.target.value })} /></Field>
              <Field label="Slack Handle/Channel"><input value={vnForm.slack} onChange={(e) => setVnForm({ ...vnForm, slack: e.target.value })} /></Field>
              <Field label="Communication Channel">
                <select value={vnForm.channel} onChange={(e) => setVnForm({ ...vnForm, channel: e.target.value })}><option value="">Select…</option><option>Email</option><option>Slack</option><option>Both</option></select>
              </Field>
              <Field label="Notes"><input value={vnForm.notes} onChange={(e) => setVnForm({ ...vnForm, notes: e.target.value })} /></Field>
            </Modal>
          )}

          {vendorModal === "order" && (
            <Modal title={voForm.id ? "Edit Order" : "Log Order"} onClose={() => setVendorModal(null)}
              footer={<><button className="btn btn-primary" onClick={saveVoForm}>Save Order</button><button className="btn btn-outline" onClick={() => setVendorModal(null)}>Cancel</button></>}>
              {vmMsg && <Msg kind={vmMsg.kind}>{vmMsg.text}</Msg>}
              <Field label="Vendor *">
                <input list="vendor-names" value={voForm.vendor} onChange={(e) => setVoForm({ ...voForm, vendor: e.target.value })} />
              </Field>
              <Field label="Requested By (BD/Inhouse)">
                <input list="vendor-bd-roster" value={voForm.requestedBy} onChange={(e) => setVoForm({ ...voForm, requestedBy: e.target.value })} />
              </Field>
              <Field label="Profile Name"><input value={voForm.profileName} onChange={(e) => setVoForm({ ...voForm, profileName: e.target.value })} /></Field>
              <Field label="Profile URL"><input value={voForm.profileUrl} onChange={(e) => setVoForm({ ...voForm, profileUrl: e.target.value })} /></Field>
              <Field label="Connections"><input value={voForm.connections} onChange={(e) => setVoForm({ ...voForm, connections: e.target.value })} /></Field>
              <Field label="Location"><input value={voForm.location} onChange={(e) => setVoForm({ ...voForm, location: e.target.value })} /></Field>
              <Field label="Order Date"><input type="date" value={voForm.orderDate} onChange={(e) => setVoForm({ ...voForm, orderDate: e.target.value })} /></Field>
              <Field label="Price"><input type="number" step="0.01" value={voForm.price} onChange={(e) => setVoForm({ ...voForm, price: e.target.value })} /></Field>
              <Field label="Notes"><input value={voForm.notes} onChange={(e) => setVoForm({ ...voForm, notes: e.target.value })} /></Field>
            </Modal>
          )}

          {vendorModal === "comm" && (
            <Modal title="Log Communication" onClose={() => setVendorModal(null)} narrow
              footer={<><button className="btn btn-primary" onClick={saveVcmForm}>Save Communication</button><button className="btn btn-outline" onClick={() => setVendorModal(null)}>Cancel</button></>}>
              {vmMsg && <Msg kind={vmMsg.kind}>{vmMsg.text}</Msg>}
              <Field label="Vendor *"><input list="vendor-names" value={vcmForm.vendor} onChange={(e) => setVcmForm({ ...vcmForm, vendor: e.target.value })} /></Field>
              <Field label="Date"><input type="date" value={vcmForm.date} onChange={(e) => setVcmForm({ ...vcmForm, date: e.target.value })} /></Field>
              <Field label="Channel"><select value={vcmForm.channel} onChange={(e) => setVcmForm({ ...vcmForm, channel: e.target.value })}><option value="">Select…</option><option>Email</option><option>Slack</option></select></Field>
              <Field label="Note *"><input value={vcmForm.note} onChange={(e) => setVcmForm({ ...vcmForm, note: e.target.value })} /></Field>
            </Modal>
          )}

          {vendorModal === "issue" && (
            <Modal title="Log Issue" onClose={() => setVendorModal(null)}
              footer={<><button className="btn btn-primary" onClick={saveViForm}>Log Issue</button><button className="btn btn-outline" onClick={() => setVendorModal(null)}>Cancel</button></>}>
              {vmMsg && <Msg kind={vmMsg.kind}>{vmMsg.text}</Msg>}
              <Field label="Profile (leave blank for a vendor-level issue)">
                <select value={viForm.profileId} onChange={(e) => setViForm({ ...viForm, profileId: e.target.value })}>
                  <option value="">— Vendor-level issue (no specific profile) —</option>
                  {vendorProfiles.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.id})</option>)}
                </select>
              </Field>
              {!viForm.profileId && (
                <Field label="Vendor *"><input list="vendor-names" value={viForm.vendor} onChange={(e) => setViForm({ ...viForm, vendor: e.target.value })} /></Field>
              )}
              <Field label="Issue Type *">
                <select value={viForm.issueType} onChange={(e) => setViForm({ ...viForm, issueType: e.target.value })}>
                  <option value="">Select…</option>
                  {vendorIssueTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Reported Date"><input type="date" value={viForm.reportedDate} onChange={(e) => setViForm({ ...viForm, reportedDate: e.target.value })} /></Field>
              <Field label="Issue Notes"><input value={viForm.notes} onChange={(e) => setViForm({ ...viForm, notes: e.target.value })} placeholder="What happened? (required if Issue Type is 'Other')" /></Field>
            </Modal>
          )}

          {vendorModal === "followUp" && (
            <Modal title="Vendor Follow Up — All Open Issues" onClose={() => setVendorModal(null)} narrow
              footer={<><button className="btn btn-primary" onClick={generateVendorFollowUp}>Generate Follow-Up</button><button className="btn btn-outline" onClick={() => setVendorModal(null)}>Close</button></>}>
              {vmMsg && <Msg kind={vmMsg.kind}>{vmMsg.text}</Msg>}
              <Field label="Vendor *">
                <select value={vfuVendor} onChange={(e) => setVfuVendor(e.target.value)}>
                  <option value="">Select vendor…</option>
                  {vendorsList.map((v) => <option key={v.id} value={v.name}>{v.name}</option>)}
                </select>
              </Field>
              <p className="text-muted" style={{ fontSize: 11 }}>Combines every currently open issue for this vendor into a single message and logs a follow-up on all of them at once.</p>
            </Modal>
          )}

          {vendorModal === "feedback" && (
            <Modal title="Add Vendor Feedback" onClose={() => setVendorModal(null)} narrow
              footer={<><button className="btn btn-primary" onClick={saveVfForm}>Save Feedback</button><button className="btn btn-outline" onClick={() => setVendorModal(null)}>Cancel</button></>}>
              {vmMsg && <Msg kind={vmMsg.kind}>{vmMsg.text}</Msg>}
              <Field label="Vendor Feedback Date"><input type="date" value={vfForm.date} onChange={(e) => setVfForm({ ...vfForm, date: e.target.value })} /></Field>
              <Field label="Vendor Feedback"><input value={vfForm.text} onChange={(e) => setVfForm({ ...vfForm, text: e.target.value })} placeholder="What did the vendor say?" /></Field>
              <Field label="Vendor ETA (Expected Fix Date)" hint="leave blank if none yet"><input type="date" value={vfForm.eta} onChange={(e) => setVfForm({ ...vfForm, eta: e.target.value })} /></Field>
            </Modal>
          )}

          {vendorModal === "replace" && (
            <Modal title="Replace Profile" onClose={() => setVendorModal(null)}
              footer={<><button className="btn btn-primary" onClick={saveVrForm}>Save Replacement</button><button className="btn btn-outline" onClick={() => setVendorModal(null)}>Cancel</button></>}>
              {vmMsg && <Msg kind={vmMsg.kind}>{vmMsg.text}</Msg>}
              <Field label="New Profile Name / LI Handle *"><input value={vrForm.name} onChange={(e) => setVrForm({ ...vrForm, name: e.target.value })} /></Field>
              <Field label="Vendor Name" hint="same as original if left blank"><input list="vendor-names" value={vrForm.vendor} onChange={(e) => setVrForm({ ...vrForm, vendor: e.target.value })} /></Field>
              <Field label="LI Profile URL"><input value={vrForm.liUrl} onChange={(e) => setVrForm({ ...vrForm, liUrl: e.target.value })} /></Field>
              <Field label="Price" hint="same as original if left blank"><input type="number" step="0.01" value={vrForm.price} onChange={(e) => setVrForm({ ...vrForm, price: e.target.value })} /></Field>
              <Field label="Registered Date"><input type="date" value={vrForm.registered} onChange={(e) => setVrForm({ ...vrForm, registered: e.target.value })} /></Field>
              <Field label="Sales Nav Connected Date"><input type="date" value={vrForm.snConnected} onChange={(e) => setVrForm({ ...vrForm, snConnected: e.target.value })} /></Field>
              <Field label="Managed By" hint="same as original if left blank"><input list="vendor-bd-roster" value={vrForm.managedBy} onChange={(e) => setVrForm({ ...vrForm, managedBy: e.target.value })} /></Field>
              <Field label="Notes"><input value={vrForm.notes} onChange={(e) => setVrForm({ ...vrForm, notes: e.target.value })} /></Field>
            </Modal>
          )}
        </>
      )}

      {listModal && (
        <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 30 }} onClick={() => setListModal(null)}>
          <div className="card" style={{ maxWidth: 380, maxHeight: "70vh", overflowY: "auto", width: "92vw" }} onClick={(e) => e.stopPropagation()}>
            <div className="card-header"><h2>{listModal.title}</h2><button className="btn btn-outline" onClick={() => setListModal(null)}>Close</button></div>
            <div className="task-list">
              {listModal.rows.map((row, idx) => (
                <div className="flex-between" style={{ padding: "8px 0", borderBottom: "1px solid #f0f0f0" }} key={idx}><strong>{row.label}</strong>{row.sub && <span>{row.sub}</span>}</div>
              ))}
              {listModal.rows.length === 0 && <div className="text-muted">Nothing here.</div>}
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
        <div className="card" style={{ position: "fixed", right: 24, bottom: 80, width: 340, maxHeight: "60vh", overflowY: "auto", zIndex: 20 }}>
          <h2>Brainstorm with AI</h2>
          <div className="task-list">
            {chat.map((turn, idx) => (
              <div className="flex-between" style={{ padding: "8px 0", borderBottom: "1px solid #f0f0f0" }} key={idx}>
                <strong>{turn.role === "user" ? "You" : "Assistant"}</strong>
                <span>{turn.text}</span>
              </div>
            ))}
            {chat.length === 0 && <div className="text-muted">Ask anything about the business.</div>}
          </div>
          <div className="form-row">
            <textarea placeholder="Ask a question..." value={chatInput} onChange={(e) => setChatInput(e.target.value)} />
            <button className="btn btn-primary" disabled={chatBusy} onClick={sendChat}>Send</button>
          </div>
        </div>
      )}
      </div>
    </>
  );
}
