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
        <div className="login-card">
          <div className="app-logo">Franbooking</div>
          <h1>{title}</h1>
          <p>Please log in first.</p>
          <Link className="btn btn-primary btn-full" style={{ textDecoration: "none", marginTop: 12 }} href="/login">Go to Login</Link>
        </div>
      </main>
    );
  }

  if (!canOpenRole(session, role)) {
    return (
      <main className="login-shell">
        <div className="login-card">
          <div className="app-logo">Franbooking</div>
          <h1>Access Denied</h1>
          <p>Your account is not approved for this workspace.</p>
          <Link className="btn btn-primary btn-full" style={{ textDecoration: "none", marginTop: 12 }} href="/login">Switch Account</Link>
        </div>
      </main>
    );
  }

  return null;
}
