import crypto from "crypto";
import { cookies } from "next/headers";
import { CONFIG } from "./config";

export type SessionUser = {
  email: string;
  name: string;
  type: string;
  impersonatorEmail?: string;
  impersonatorName?: string;
};

const COOKIE_NAME = "fb_session";

function sign(payload: string) {
  return crypto.createHmac("sha256", CONFIG.appSecret).update(payload).digest("base64url");
}

export function createSessionToken(user: SessionUser) {
  const payload = Buffer.from(JSON.stringify({ ...user, iat: Date.now() }), "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readSessionToken(token?: string): SessionUser | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature || sign(payload) !== signature) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!decoded.email || !decoded.name) return null;
    return {
      email: decoded.email,
      name: decoded.name,
      type: decoded.type || "PH",
      impersonatorEmail: decoded.impersonatorEmail || undefined,
      impersonatorName: decoded.impersonatorName || undefined
    };
  } catch {
    return null;
  }
}

export function setSession(user: SessionUser) {
  cookies().set(COOKIE_NAME, createSessionToken(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7
  });
}

export function clearSession() {
  cookies().delete(COOKIE_NAME);
}

export function getSession() {
  return readSessionToken(cookies().get(COOKIE_NAME)?.value);
}
