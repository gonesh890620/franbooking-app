import Link from "next/link";

export default function AgentPage() {
  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="brand">Franbooking</div>
        <h1>Agent</h1>
        <p>Agent panel migration screen is next to port.</p>
        <Link className="primary-link" href="/login">Back to Login</Link>
      </section>
    </main>
  );
}
