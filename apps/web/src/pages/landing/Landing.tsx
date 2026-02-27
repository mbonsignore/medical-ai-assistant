import { useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import type { UserRole } from "../../types";

export function Landing() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [role, setRole] = useState<UserRole>("PATIENT");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // register fields
  const [name, setName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [bio, setBio] = useState("");

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register({
          email,
          password,
          role,
          name,
          specialty: role === "DOCTOR" ? specialty : undefined,
          bio: role === "DOCTOR" ? bio : undefined,
        });
      }
    } catch (e: any) {
      setErr(e?.response?.data?.error || e?.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="landing">
      <div className="landing-card">
        <div className="brand">
          <div className="brand-badge">🩺</div>
          <div>
            <div className="brand-title">Medical AI Assistant</div>
            <div className="small muted">Chat + triage + booking, powered by RAG + local LLM</div>
          </div>
        </div>

        <div className="tabs">
          <button className={mode === "login" ? "tab active" : "tab"} onClick={() => setMode("login")}>
            Login
          </button>
          <button className={mode === "register" ? "tab active" : "tab"} onClick={() => setMode("register")}>
            Register
          </button>
        </div>

        <form onSubmit={onSubmit} className="form">
          {mode === "register" && (
            <>
              <div className="row2">
                <div>
                  <label className="label">Role</label>
                  <select value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
                    <option value="PATIENT">Patient</option>
                    <option value="DOCTOR">Doctor</option>
                  </select>
                </div>
                <div>
                  <label className="label">Full name</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mario Rossi" />
                </div>
              </div>
            </>
          )}

          <div className="row2">
            <div>
              <label className="label">Email</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" />
            </div>
            <div>
              <label className="label">Password</label>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                placeholder="Password123!"
              />
            </div>
          </div>

          {mode === "register" && role === "DOCTOR" && (
            <>
              <div className="row2">
                <div>
                  <label className="label">Specialty</label>
                  <input
                    value={specialty}
                    onChange={(e) => setSpecialty(e.target.value)}
                    placeholder="e.g. Dermatology"
                  />
                </div>
                <div>
                  <label className="label">Short bio</label>
                  <input
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="e.g. Skin conditions, moles, rashes..."
                  />
                </div>
              </div>
            </>
          )}

          {err && <div className="error">{err}</div>}

          <button className="primary" disabled={busy}>
            {busy ? "Please wait..." : mode === "login" ? "Login" : "Create account"}
          </button>

          <div className="small muted" style={{ marginTop: 10 }}>
            Note: This is a demo app. No real medical diagnosis is provided.
          </div>
        </form>
      </div>
    </div>
  );
}