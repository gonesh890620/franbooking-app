import Link from "next/link";
import { SessionUser } from "@/lib/auth";
import { canOpenRole } from "@/lib/roles";

export default function RoleGate({
  session,
  role,
  title
}: {
  session: SessionUser | null;
  role: string;
  title: string;
}) {
  if (!session) {
    return (
      <main className="login-shell">
        <section className="login-card">
          <div className="brand">Franbooking</div>
          <h1>{title}</h1>
          <p>Please log in first.</p>
          <Link className="primary-link" href="/login">Go to Login</Link>
        </section>
      </main>
    );
  }

  if (!canOpenRole(session, role)) {
    return (
      <main className="login-shell">
        <section className="login-card">
          <div className="brand">Franbooking</div>
          <h1>Access Denied</h1>
          <p>Your account is not approved for this workspace.</p>
          <Link className="primary-link" href="/login">Switch Account</Link>
        </section>
      </main>
    );
  }

  return null;
}
