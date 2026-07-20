export const CONFIG = {
  accessSheetId: process.env.ACCESS_SHEET_ID || "11f1JoawE4n5YLhDuT8HRx2CaciCpNUi0uDxCerf_w4A",
  campaignSheetId: process.env.CAMPAIGN_SHEET_ID || "1iVmXVT65j7HiUIp3ef6OvMuV1FdgFgg_B1YT-eM0r6c",
  templateSheetId: process.env.TEMPLATE_SHEET_ID || "1W8pG1SWl_dMIGziSSGRC2HUkqcsGZSl3mb8mymqJG_k",
  masterDbId: process.env.MASTER_DB_ID || "1Vf6UDslylUn8z0pcG7FQdIhc9sWckO7wRyrmyRx4idQ",
  timeLogId: process.env.TIME_LOG_ID || "11MLXf1-eieikzbnTMq8xZKtj4tBXd6DNkooZAVHDhG8",
  canyMax: Number(process.env.CANY_MAX || 6),
  appSecret: process.env.APP_SECRET || "dev-only-change-me",
  adminUsername: process.env.ADMIN_USERNAME || "admin",
  adminPassword: process.env.ADMIN_PASSWORD || "dev-only-change-me",
  accessDays: Number(process.env.ACCESS_DAYS || 30),
  defaultNurtureLimit: Number(process.env.DEFAULT_N_LIMIT || 200),
  defaultOutreachLimit: Number(process.env.DEFAULT_O_LIMIT || 10),
  defaultProfileLimit: Number(process.env.DEFAULT_P_LIMIT || 500)
};

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
