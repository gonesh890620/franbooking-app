export type LegacySheetSource = {
  key: string;
  env: string;
  tab: string;
  target: string;
  description: string;
};

export const LEGACY_SOURCES: LegacySheetSource[] = [
  {
    key: "access_recruiters",
    env: "ACCESS_SHEET_ID",
    tab: "Recruiters",
    target: "app_users,recruiter_credits",
    description: "Access Control users, roles, sheet IDs, and credit balances"
  },
  {
    key: "master_db",
    env: "MASTER_DB_ID",
    tab: "Sheet1",
    target: "outreach_logs",
    description: "Cross-recruiter outreach duplicate/log database"
  },
  {
    key: "campaign_master_tracker",
    env: "CAMPAIGN_SHEET_ID",
    tab: "Master Tracker",
    target: "clients,campaigns",
    description: "Client/campaign tracker"
  },
  {
    key: "campaign_leads_ledger",
    env: "CAMPAIGN_SHEET_ID",
    tab: "Leads Ledger",
    target: "leads_ledger",
    description: "Appointment and lead ledger"
  },
  {
    key: "campaign_client_dtc",
    env: "CAMPAIGN_SHEET_ID",
    tab: "Client DTC URL",
    target: "client_dtc_links",
    description: "Client calendar/DTC URLs"
  },
  {
    key: "template_copy",
    env: "TEMPLATE_SHEET_ID",
    tab: "Copy",
    target: "templates",
    description: "Outreach templates"
  },
  {
    key: "template_nurture",
    env: "TEMPLATE_SHEET_ID",
    tab: "Nurture Copy",
    target: "templates",
    description: "Nurture templates"
  },
  {
    key: "template_unsure",
    env: "TEMPLATE_SHEET_ID",
    tab: "Unsure Template",
    target: "unsure_criteria",
    description: "Unsure criteria and response library"
  },
  {
    key: "time_log_recruiters",
    env: "TIME_LOG_ID",
    tab: "Recruiters",
    target: "time_logs",
    description: "Recruiter time logs"
  }
];
