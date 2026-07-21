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
      <form
        className="login-card"
        onSubmit={(e) => {
          e.preventDefault();
          void login();
        }}
      >
        <div className="app-logo">⚙️ Franbooking</div>
        <h1>Admin Login</h1>
        <p>This is the shared Admin account used for user management only.</p>

        <div className="form-row">
          <label>Username</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} required />
        </div>
        <div className="form-row">
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>

        <button className="btn btn-primary btn-full" type="submit" disabled={loading}>
          {loading ? "Signing in…" : "Login"}
        </button>

        {message ? <div className="msg msg-error">{message}</div> : null}
      </form>
    </main>
  );
}
