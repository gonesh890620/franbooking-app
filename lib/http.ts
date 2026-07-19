import { NextResponse } from "next/server";
import { getSession } from "./auth";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function error(message: string, status = 400) {
  return json({ error: message }, status);
}

export function requireSession() {
  const session = getSession();
  if (!session) throw new Error("Unauthorized");
  return session;
}
