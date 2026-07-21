import Link from "next/link";

export default function HomePage() {
  const accessLinks = [
    { href: "/login", label: "Login", icon: "🔑", note: "Recruiter, Growth, Operations, Agent, Client" },
    { href: "/admin", label: "Admin", icon: "⚙️", note: "User management console" }
  ];

  return (
    <main className="home-shell">
      <section className="home-panel">
        <div className="app-logo">Franbooking</div>
        <h1>Company Access</h1>
        <p className="text-muted">Open the user login or the admin console.</p>

        <div className="section-tile-grid" aria-label="Quick access">
          {accessLinks.map((link) => (
            <Link key={link.href} className="section-tile" href={link.href}>
              <div className="section-tile-icon">{link.icon}</div>
              <div>
                <div className="section-tile-title">{link.label}</div>
                <div className="text-muted">{link.note}</div>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
