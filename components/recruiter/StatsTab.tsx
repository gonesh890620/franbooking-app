"use client";

import { useEffect, useMemo, useState } from "react";
import { tool } from "./shared";
import { buildBillingPeriods, OWN_APPT_RATE, REFERRAL_APPT_RATE } from "@/lib/recruiterCopy";

type Billing = { period?: string; total?: number; byDate?: Array<{ date: string; count: number }>; error?: string };

type ReferredRecruiter = {
  name?: string;
  email?: string;
  status?: string;
  windowEnd?: string;
  daysLeft?: number;
  apptsThisCycle?: number;
  dollarThisCycle?: number;
  apptsLifetime?: number;
  dollarLifetime?: number;
};

type Referral = {
  period?: string;
  ownAppts?: number;
  ownApptRate?: number;
  ownDollar?: number;
  referralApptsThisCycle?: number;
  referralApptRate?: number;
  referralDollarThisCycle?: number;
  totalThisCycle?: number;
  referralApptsLifetime?: number;
  referralDollarLifetime?: number;
  referredRecruiters?: ReferredRecruiter[];
  error?: string;
};

export default function StatsTab() {
  const periods = useMemo(() => buildBillingPeriods(), []);
  const [periodIdx, setPeriodIdx] = useState(0);
  const [billing, setBilling] = useState<Billing | null>(null);
  const [referral, setReferral] = useState<Referral | null>(null);
  const [billingError, setBillingError] = useState("");
  const [referralError, setReferralError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const period = periods[periodIdx];

  useEffect(() => {
    let cancelled = false;
    const params = { startDate: period?.startDate || "", endDate: period?.endDate || "" };
    setBilling(null);
    setReferral(null);
    setBillingError("");
    setReferralError("");

    // Both panels load independently so a slow or failing referral query
    // never holds up the appointment numbers (and vice versa).
    (async () => {
      try {
        const data = await tool<Billing>("billingStats", params);
        if (!cancelled) setBilling(data);
      } catch (e) {
        if (!cancelled) setBillingError(e instanceof Error ? e.message : "Error loading stats");
      }
    })();

    (async () => {
      try {
        const data = await tool<Referral>("referralStats", params);
        if (!cancelled) setReferral(data);
      } catch (e) {
        if (!cancelled) setReferralError(e instanceof Error ? e.message : "Error loading referral stats");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [period?.startDate, period?.endDate, reloadKey]);

  const total = billing?.total || 0;
  const byDate = billing?.byDate || [];

  return (
    <>
      <div className="flex-between mb-8">
        <span style={{ fontSize: 12, fontWeight: 700 }}>Billing Cycle Appointments</span>
        <button className="btn btn-ghost btn-sm" onClick={() => setReloadKey((k) => k + 1)} title="Refresh">
          ↻
        </button>
      </div>

      <div className="form-row">
        <label>Billing Period</label>
        <select value={periodIdx} onChange={(e) => setPeriodIdx(Number(e.target.value))}>
          {periods.map((p, i) => (
            <option key={p.startDate} value={i}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {billingError ? (
        <div className="msg msg-error">{billingError}</div>
      ) : !billing ? (
        <p className="text-muted text-center" style={{ padding: 20 }}>
          Loading…
        </p>
      ) : (
        <>
          <div className="card">
            <div style={{ fontSize: 22, fontWeight: 800 }}>
              {total} <span style={{ fontSize: 13, color: "#888", fontWeight: 400 }}>appointments</span>
            </div>
            <div style={{ fontSize: 13, color: "#166534", fontWeight: 700, marginTop: 2 }}>
              ${total * OWN_APPT_RATE} earned (own appts, ${OWN_APPT_RATE} each)
            </div>
          </div>

          <div className="card">
            <div
              style={{ fontSize: 11, fontWeight: 700, color: "#555", marginBottom: 8, textTransform: "uppercase" }}
            >
              Day-by-Day
            </div>
            {!byDate.length ? (
              <p className="text-muted text-center">No appointments this period.</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th style={{ textAlign: "right" }}>Appts</th>
                  </tr>
                </thead>
                <tbody>
                  {byDate.map((row) => (
                    <tr key={row.date}>
                      <td>{row.date}</td>
                      <td style={{ textAlign: "right", fontWeight: 700 }}>{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      <div style={{ marginTop: 18, fontSize: 12, fontWeight: 700 }}>Referral Program</div>

      {referralError ? (
        <div className="msg msg-error">{referralError}</div>
      ) : !referral ? (
        <p className="text-muted text-center" style={{ padding: 20 }}>
          Loading…
        </p>
      ) : (
        <ReferralPanel data={referral} />
      )}
    </>
  );
}

function ReferralPanel({ data }: { data: Referral }) {
  const referred = data.referredRecruiters || [];

  return (
    <>
      <div className="card">
        <div style={{ fontSize: 11, color: "#888", textTransform: "uppercase", fontWeight: 700, marginBottom: 6 }}>
          This Cycle ({data.period || ""})
        </div>
        <div style={{ fontSize: 12, color: "#555" }}>
          Own appts: <strong>{data.ownAppts || 0}</strong> × ${data.ownApptRate || OWN_APPT_RATE} ={" "}
          <strong>${data.ownDollar || 0}</strong>
        </div>
        <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>
          Referral appts: <strong>{data.referralApptsThisCycle || 0}</strong> × $
          {data.referralApptRate || REFERRAL_APPT_RATE} = <strong>${data.referralDollarThisCycle || 0}</strong>
        </div>
        <div
          style={{
            fontSize: 16,
            fontWeight: 800,
            color: "#166534",
            marginTop: 8,
            paddingTop: 8,
            borderTop: "1px solid #eee"
          }}
        >
          Total payment this cycle: ${data.totalThisCycle || 0}
        </div>
      </div>

      <div className="card">
        <div style={{ fontSize: 11, color: "#888", textTransform: "uppercase", fontWeight: 700, marginBottom: 6 }}>
          Referral Lifetime Total
        </div>
        <div style={{ fontSize: 20, fontWeight: 800 }}>
          {data.referralApptsLifetime || 0}{" "}
          <span style={{ fontSize: 12, color: "#888", fontWeight: 400 }}>appts</span>{" "}
          <span style={{ color: "#166534" }}>${data.referralDollarLifetime || 0}</span>
        </div>
      </div>

      <div className="card">
        <div style={{ fontSize: 11, color: "#888", textTransform: "uppercase", fontWeight: 700, marginBottom: 8 }}>
          Recruiters You Referred
        </div>
        {!referred.length ? (
          <p className="text-muted text-center" style={{ fontSize: 12 }}>
            You haven&apos;t referred anyone yet.
          </p>
        ) : (
          referred.map((r) => {
            const active = r.status === "Active";
            return (
              <div key={r.email || r.name} style={{ padding: "8px 0", borderBottom: "1px solid #f5f5f7" }}>
                <div className="flex-between">
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{r.name || r.email}</div>
                  <span className={`badge ${active ? "badge-green" : "badge-gray"}`}>{r.status || ""}</span>
                </div>
                <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
                  Expires {r.windowEnd || "--"}
                  {active
                    ? ` (${r.daysLeft} day${r.daysLeft === 1 ? "" : "s"} left)`
                    : " — closed, no longer counted"}
                </div>
                <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>
                  This cycle: {r.apptsThisCycle || 0} appts · ${r.dollarThisCycle || 0} &nbsp;|&nbsp; Lifetime:{" "}
                  {r.apptsLifetime || 0} appts · ${r.dollarLifetime || 0}
                </div>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
