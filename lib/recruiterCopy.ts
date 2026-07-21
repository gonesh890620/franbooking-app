/**
 * Recruiter copy templates and text substitution.
 *
 * Ported verbatim from gas-webapp/Recruiter.html and the Chrome extension's
 * panel.js. These strings are recruiter-facing message copy -- changing the
 * wording here changes what prospects actually receive, so keep them in sync
 * with the GAS originals rather than "improving" them.
 */

export const NOT_INTERESTED_REPLY =
  "Totally understand, thanks for letting me know! \nIf that ever changes, feel free to reach out.";

export const CLIENT_ROTATION_REPLY =
  "Hi {{FirstName}}, quick update on my end: {{Previous Client Name}} is currently unavailable, so I'd like to connect you with another head consultant, {{New Client Name}}, who I think may be an even better fit for you.\nHere’s {{New Client Name}}'s calendar: {{Calendar Link}}";

export const CANY_ROTATION_REPLY =
  "Hi {{FirstName}}, just a quick update: {{Previous Client Name}} is no longer accepting appointments in your area, but {{New Client Name}} is currently available and covers your location.\nHere’s {{New Client Name}}'s calendar: {{Calendar Link}}";

export const SALES_NAV_REMOVE_REPLY =
  "Hi {{FirstName}}, connecting with you here directly since I ran into a Sales Navigator access issue on my end and did not want to lose touch. Are you still open to learning more about franchise ownership?";

export const ROTATION_REASONS = ["CA/NY territory change", "Previous client unavailable"];

/**
 * Statuses that mean "we have not had a real reply yet". Anything else means
 * the recruiter is continuing an existing conversation, which hides the
 * Response Type picker and carries the follow-up stage forward.
 */
const FIRST_TOUCH_STATUSES = ["", "awaiting response"];

export function isContinuingConversation(status: string) {
  return !FIRST_TOUCH_STATUSES.includes(String(status || "").trim().toLowerCase());
}

/** Maps a contact's current FU status to the next nurture stage to send. */
export function nextNurtureTypeForStatus(status: string) {
  const s = String(status || "").trim().toLowerCase();
  if (s === "interested" || s === "client rotation sent" || s === "ca/ny territory change sent") return "SDFU";
  if (s === "unsure" || s === "unsure srfu") return "FU1";
  if (s.includes("sdfu") || s.includes("same day")) return "FU1";
  if (s.includes("fu1")) return "FU2";
  if (s.includes("fu2")) return "FU3";
  if (s.includes("fu3")) return "FU3";
  return "Interested";
}

/**
 * Replaces em/en dashes with plain punctuation. LinkedIn messages written
 * with em dashes read as AI-generated, so GAS stripped them before display.
 */
export function stripLongDash(text: string) {
  if (!text) return text;
  return text
    .replace(/\s*—\s*/g, ", ")
    .replace(/\s*–\s*/g, "-")
    .replace(/,\s*,/g, ",")
    .replace(/,(\s*[.!?\n])/g, "$1")
    .replace(/[ \t]{2,}/g, " ");
}

/** Substitutes the client's Calendly/DTC link into every placeholder variant. */
export function subCal(text: string, calendarUrl: string) {
  let out = text || "";
  if (calendarUrl) {
    out = out
      .replace(/\{\{INSERT custom DTC link for prospect\}\}/gi, calendarUrl)
      .replace(/\{\{CALENDAR_LINK\}\}/gi, calendarUrl)
      .replace(/\{\{CalendarLink\}\}/gi, calendarUrl)
      .replace(/\{\{Calendar Link\}\}/gi, calendarUrl)
      .replace(/\[INSERT.*?calendar.*?\]/gi, calendarUrl);
  }
  return stripLongDash(out);
}

/** Substitutes the prospect's first name into every placeholder variant. */
export function subName(text: string, name: string) {
  if (!name) return text;
  const first = name.trim().split(/\s+/)[0];
  return (text || "")
    .replace(/\{\{FirstName\}\}/gi, first)
    .replace(/\{FirstName\}/gi, first)
    .replace(/\[FirstName\]/gi, first);
}

/** Substitutes previous/new consultant names into rotation copy. */
export function subRotationNames(text: string, prevClient: string, newClient: string) {
  return (text || "")
    .replace(/\{\{Previous Client Name\}\}/gi, prevClient || "your previous consultant")
    .replace(/\{Previous Client Name\}/gi, prevClient || "your previous consultant")
    .replace(/\{\{New Client Name\}\}/gi, newClient || "your new consultant")
    .replace(/\{New Client Name\}/gi, newClient || "your new consultant");
}

/**
 * Falls back to a name derived from the LinkedIn slug when the tracker's Name
 * cell is blank or was corrupted into a timestamp by a bad paste.
 */
export function deriveName(task: { name?: string; li?: string }) {
  const name = task.name || "";
  if (!name || /GMT|UTC|\d{4}.*\d{2}:\d{2}:\d{2}/.test(name)) {
    if (task.li) {
      const slug = task.li.replace(/\/$/, "").split("/").pop() || "";
      return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    }
    return "Contact";
  }
  return name;
}

/**
 * Semi-monthly billing periods (1st-15th, 16th-EOM) from May 2026 forward,
 * newest first. Matches GAS buildBillingPeriods.
 */
export function buildBillingPeriods() {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const periods: Array<{ label: string; startDate: string; endDate: string }> = [];
  const now = new Date();
  let cur = new Date(2026, 4, 1);

  while (cur <= now) {
    const y = cur.getFullYear();
    const m = cur.getMonth();
    const mm = String(m + 1).padStart(2, "0");
    const lastDay = new Date(y, m + 1, 0).getDate();

    if (new Date(y, m, 1) <= now) {
      periods.push({ label: `${months[m]} 1–15, ${y}`, startDate: `${y}-${mm}-01`, endDate: `${y}-${mm}-15` });
    }
    if (new Date(y, m, 16) <= now) {
      periods.push({ label: `${months[m]} 16–${lastDay}, ${y}`, startDate: `${y}-${mm}-16`, endDate: `${y}-${mm}-${lastDay}` });
    }
    cur = new Date(y, m + 1, 1);
  }
  return periods.reverse();
}

export const OWN_APPT_RATE = 40;
export const REFERRAL_APPT_RATE = 5;
