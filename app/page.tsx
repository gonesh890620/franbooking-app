import Link from "next/link";

export default function HomePage() {
  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="brand">Franbooking</div>
        <h1>Recruiter Migration App</h1>
        <p>
          This is the new Vercel/Supabase version running separately from the
          current Google Apps Script deployment.
        </p>
        <Link className="primary-link" href="/login">
          Open Login
        </Link>
      </section>
    </main>
  );
}
