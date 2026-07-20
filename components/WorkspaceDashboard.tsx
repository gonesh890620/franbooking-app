import Link from "next/link";

type WorkspaceDashboardProps = {
  title: string;
  session: { name: string; email: string };
  counts: Array<{ table: string; label: string; count: number }>;
  rows?: Array<Record<string, any>>;
  rowTitle?: string;
};

export default function WorkspaceDashboard({ title, session, counts, rows = [], rowTitle = "Recent Items" }: WorkspaceDashboardProps) {
  return (
    <main className="app-shell wide">
      <div className="topbar">
        <div className="topbar-title">
          <div className="brand">Franbooking</div>
          <h1>{title}</h1>
          <div className="muted">{session.name} | {session.email}</div>
        </div>
        <Link className="btn btn-outline" href="/">Home</Link>
      </div>

      <section className="metric-grid">
        {counts.slice(0, 4).map((item) => (
          <div className="metric" key={item.table}>
            <span>{item.label}</span>
            <strong>{item.count}</strong>
          </div>
        ))}
      </section>

      <section className="panel">
        <div className="section-head">
          <h2>{rowTitle}</h2>
          <span className="badge">Live data</span>
        </div>
        {rows.length ? (
          <div className="compact-list">
            {rows.map((row, index) => (
              <div className="compact-row" key={index}>
                <strong>{row.title || row.invitee_name || row.name || row.client_name || row.email || "Record"}</strong>
                <span>{row.status || row.priority || row.client_name || row.assigned_agent_name || row.topic || "-"}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">No records found yet.</p>
        )}
      </section>
    </main>
  );
}
