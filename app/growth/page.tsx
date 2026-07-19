import Link from "next/link";

export default function GrowthPage() {
  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="brand">Franbooking</div>
        <h1>Growth</h1>
        <p>Growth dashboard migration screen is next to port.</p>
        <Link className="primary-link" href="/admin">Open Admin Shell</Link>
      </section>
    </main>
  );
}
