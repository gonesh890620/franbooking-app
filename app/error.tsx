"use client";

import Link from "next/link";

export default function GlobalError() {
  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="brand">Franbooking</div>
        <h1>Unable to Open</h1>
        <p className="muted">
          The workspace could not load. Please refresh once, or return to the access page and open your panel again.
        </p>
        <Link className="primary-link" href="/">Company Access</Link>
      </section>
    </main>
  );
}
