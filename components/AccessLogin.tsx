"use client";

import { useState } from "react";

type LoginResult = { page: string; name: string; role: string; ok?: boolean; status?: string; error?: string };

async function postLogin(email: string, password: string): Promise<LoginResult> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (!res.ok && !data.status) throw new Error(data.error || "Login failed");
  return data as LoginResult;
}

const STATUS_MESSAGES: Record<string, { title: string; body: string }> = {
  pending: { title: "Account pending approval", body: "Your account has not been approved yet. Contact your admin to get access." },
  removed: { title: "Access removed", body: "Your access has been removed. Contact your admin if you believe this is a mistake." },
  expired: { title: "Access expired", body: "Your access window has expired. Contact your admin to have it renewed." },
  not_found: { title: "Account not found", body: "No account exists for that email. Contact your admin to get set up." }
};

export default function AccessLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [statusInfo, setStatusInfo] = useState<{ title: string; body: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function login() {
    setLoading(true);
    setMessage("");
    setStatusInfo(null);
    try {
      const data = await postLogin(email, password);
      if (data.ok === false) {
        if (data.status && STATUS_MESSAGES[data.status]) {
          setStatusInfo(STATUS_MESSAGES[data.status]);
        } else {
          setMessage(data.error || "Login failed");
        }
        return;
      }
      window.location.href = data.page || "/recruiter";
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-shell">
      <form
        className="login-card"
        onSubmit={(e) => {
          e.preventDefault();
          void login();
        }}
      >
        <div className="app-logo">Franbooking</div>
        <h1>Login</h1>
        <p>Use your Access Control email and password.</p>

        <div className="form-row">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="form-row">
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>

        <button className="btn btn-primary btn-full" type="submit" disabled={loading}>
          {loading ? "Signing in…" : "Login"}
        </button>

        {statusInfo ? (
          <div className="msg msg-warn">
            <strong>{statusInfo.title}</strong>
            <div>{statusInfo.body}</div>
          </div>
        ) : null}
        {message ? <div className="msg msg-error">{message}</div> : null}
      </form>
    </main>
  );
}
