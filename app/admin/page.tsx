import Link from "next/link";
import { getSession } from "@/lib/auth";

export default function AdminPage() {
  const session = getSession();
  const allowed = session && ["growth", "admin"].includes(String(session.type || "").toLowerCase());

  if (!session) {
    return (
      <main className="login-shell">
        <section className="login-card">
          <div className="brand">Franbooking</div>
          <h1>Admin</h1>
          <p>Please log in first.</p>
          <Link className="primary-link" href="/login">Go to Login</Link>
        </section>
      </main>
    );
  }

  if (!allowed) {
    return (
      <main className="login-shell">
        <section className="login-card">
          <div className="brand">Franbooking</div>
          <h1>Access Denied</h1>
          <p>Your current account does not have admin access in the migration app.</p>
          <Link className="primary-link" href="/login">Switch Account</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <div className="topbar">
        <div className="topbar-title">
          <div className="brand">Franbooking</div>
          <h1>Admin Migration Console</h1>
          <div className="muted">{session.name} · {session.email}</div>
        </div>
      </div>
      <section className="panel">
        <h2>Status</h2>
        <p className="muted">
          Admin route is live. The full Admin console from Apps Script still
          needs to be ported to Supabase-backed screens.
        </p>
      </section>
    </main>
  );
}
