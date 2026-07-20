"use client";

import { useState } from "react";

export default function AdminLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function login() {
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/auth/admin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Login failed");
      window.location.href = data.page || "/admin";
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Admin login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="brand">Franbooking</div>
        <h1>Admin Login</h1>
        <p>This is the shared Admin account used for user management only.</p>
        <div className="form-grid">
          <label>Username<input value={username} onChange={(e) => setUsername(e.target.value)} /></label>
          <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          <button className="btn btn-primary" disabled={loading} onClick={login}>Login</button>
        </div>
        {message && <div className="notice error">{message}</div>}
      </section>
    </main>
  );
}
