import Link from "next/link";

export default function ClientPage() {
  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="brand">Franbooking</div>
        <h1>Client</h1>
        <p>Client portal migration screen is next to port.</p>
        <Link className="primary-link" href="/login">Back to Login</Link>
      </section>
    </main>
  );
}
