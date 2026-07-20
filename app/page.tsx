import Link from "next/link";

export default function HomePage() {
  const accessLinks = [
    { href: "/login", label: "Login" },
    { href: "/admin", label: "Admin" }
  ];

  return (
    <main className="home-shell">
      <section className="home-panel">
        <div>
          <div className="brand">Franbooking</div>
          <h1>Company Access</h1>
          <p className="muted">
            Open the user login or the admin console.
          </p>
        </div>
        <div className="quick-grid" aria-label="Quick access">
          {accessLinks.map((link) => (
            <Link key={link.href} className="quick-card" href={link.href}>
              <span>{link.label}</span>
              <small>Open access</small>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
