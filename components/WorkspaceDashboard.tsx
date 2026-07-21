import Link from "next/link";
import BodyClass from "./BodyClass";

type WorkspaceDashboardProps = {
  title: string;
  session: { name: string; email: string };
  counts: Array<{ table: string; label: string; count: number }>;
  rows?: Array<Record<string, any>>;
  rowTitle?: string;
};

export default function WorkspaceDashboard({
  title,
  session,
  counts,
  rows = [],
  rowTitle = "Recent Items"
}: WorkspaceDashboardProps) {
  return (
    <>
      <BodyClass names="full-page wide-page" />

      <div className="app-header">
        <div className="app-logo">{title}</div>
        <div className="flex-row">
          <span className="app-user">
            {session.name} | {session.email}
          </span>
          <Link className="btn btn-ghost btn-sm" href="/" style={{ textDecoration: "none" }}>
            Home
          </Link>
        </div>
      </div>

      <div className="screen-content">
        <div className="stats-grid">
          {counts.slice(0, 4).map((item) => (
            <div className="stat-card" key={item.table}>
              <div className="stat-num">{item.count}</div>
              <div className="stat-label">{item.label}</div>
            </div>
          ))}
        </div>

        <div className="card">
          <div className="card-header">
            <h2>{rowTitle}</h2>
            <span className="badge badge-gray">Live data</span>
          </div>
          {rows.length ? (
            rows.map((row, index) => (
              <div
                className="flex-between"
                key={index}
                style={{ padding: "8px 0", borderBottom: "1px solid #f0f0f0" }}
              >
                <strong>
                  {row.title || row.invitee_name || row.name || row.client_name || row.email || "Record"}
                </strong>
                <span className="text-muted">
                  {row.status || row.priority || row.client_name || row.assigned_agent_name || row.topic || "-"}
                </span>
              </div>
            ))
          ) : (
            <p className="text-muted text-center" style={{ padding: 12 }}>
              No records found yet.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
