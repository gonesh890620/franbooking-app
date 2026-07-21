"use client";

import Link from "next/link";

export default function GlobalError() {
  return (
    <main className="login-shell">
      <div className="login-card">
        <div className="app-logo">Franbooking</div>
        <h1>Unable to Open</h1>
        <p className="text-muted">
          The workspace could not load. Please refresh once, or return to the access page and open your panel again.
        </p>
        <Link className="btn btn-primary btn-full" style={{ textDecoration: "none", marginTop: 12 }} href="/">Company Access</Link>
      </div>
    </main>
  );
}
