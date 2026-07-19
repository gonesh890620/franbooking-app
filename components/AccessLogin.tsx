"use client";

import { useState } from "react";

async function postLogin(email: string, password: string) {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || data.status || "Login failed");
  return data as { page: string; name: string; role: string };
}

export default function AccessLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function login() {
    setLoading(true);
    setMessage("");
    try {
      const data = await postLogin(email, password);
      window.location.href = data.page || "/recruiter";
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="brand">Franbooking</div>
        <h1>Login</h1>
        <p>Use your Access Control email and password.</p>
        <div className="form-grid">
          <label>Email<input value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          <button className="btn btn-primary" disabled={loading} onClick={login}>Login</button>
        </div>
        {message && <div className="notice error">{message}</div>}
      </section>
    </main>
  );
}
