import { SessionUser } from "./auth";

export function normalizedRole(type?: string) {
  const value = String(type || "").toLowerCase().trim();
  if (value.startsWith("op")) return "operations";
  if (value.startsWith("agent")) return "agent";
  if (value === "growth") return "growth";
  if (value === "client") return "client";
  if (value === "admin" || value === "superadmin") return "admin";
  return "recruiter";
}

export function isAdminUser(user: SessionUser | null) {
  if (!user) return false;
  const role = normalizedRole(user.type);
  return role === "admin" || role === "growth" || user.email.toLowerCase() === "gonesh890620@gmail.com";
}

// The Admin console (user management: create/approve/remove/credits) is
// GAS's separate hardcoded-credential Admin.html login — distinct from a
// Growth-typed account's normal email/password login to the Growth (CEO)
// dashboard. Only the shared admin session may open /admin or call
// /api/admin/users, mirroring GAS's validateAdmin_ gate on every apiAdminXxx.
export function isSuperAdmin(user: SessionUser | null) {
  return Boolean(user && user.type === "superadmin");
}

export function canOpenRole(user: SessionUser | null, pageRole: string) {
  if (!user) return false;
  const role = normalizedRole(user.type);
  if (isAdminUser(user)) return true;
  if (role === pageRole) return true;
  return pageRole === "recruiter" && role === "recruiter";
}
