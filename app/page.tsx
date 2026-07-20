import Link from "next/link";

export default function HomePage() {
  const accessLinks = [
    { href: "/growth", label: "Growth" },
    { href: "/recruiter", label: "Recruiter" },
    { href: "/agent", label: "Agent" },
    { href: "/operations", label: "Operations" },
    { href: "/client", label: "Client" }
  ];

  return (
    <main className="home-shell">
      <section className="home-panel">
        <div>
          <div className="brand">Franbooking</div>
          <h1>Company Access</h1>
          <p className="muted">
            Sign in with your approved Franbooking account to open your workspace.
          </p>
        </div>
        <div className="quick-grid" aria-label="Quick access">
          {accessLinks.map((link) => (
            <Link key={link.href} className="quick-card" href={link.href}>
              <span>{link.label}</span>
              <small>Open panel</small>
            </Link>
          ))}
        </div>
        <Link className="primary-link" href="/login">Login</Link>
      </section>
    </main>
  );
}
