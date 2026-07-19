export function idempotencyKeyFromRequest(req: Request) {
  return req.headers.get("x-idempotency-key") || null;
}

export function assertNotPaused(paused: boolean, clientName: string) {
  if (paused) {
    throw new Error(`${clientName || "This client"} is currently paused. Use Client Rotation instead.`);
  }
}
