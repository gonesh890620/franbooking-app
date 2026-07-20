import { SessionUser } from "./auth";

export function normalizedRole(type?: string) {
  const value = String(type || "").toLowerCase().trim();
  if (value.startsWith("op")) return "operations";
  if (value.startsWith("agent")) return "agent";
  if (value === "growth") return "growth";
  if (value === "client") return "client";
  if (value === "admin") return "admin";
  return "recruiter";
}

export function isAdminUser(user: SessionUser | null) {
  if (!user) return false;
  const role = normalizedRole(user.type);
  return role === "admin" || role === "growth" || user.email.toLowerCase() === "gonesh890620@gmail.com";
}

export function canOpenRole(user: SessionUser | null, pageRole: string) {
  if (!user) return false;
  const role = normalizedRole(user.type);
  if (isAdminUser(user)) return true;
  if (role === pageRole) return true;
  return pageRole === "recruiter" && role === "recruiter";
}
