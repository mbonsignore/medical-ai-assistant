import { useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import type { UserRole } from "../../types";

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function passwordScore(pwd: string) {
  const p = pwd || "";
  let s = 0;
  if (p.length >= 6) s += 1;
  if (p.length >= 10) s += 1;
  if (/[A-Z]/.test(p)) s += 1;
  if (/[0-9]/.test(p)) s += 1;
  if (/[^A-Za-z0-9]/.test(p)) s += 1;
  return Math.min(s, 5);
}

function scoreLabel(score: number) {
  if (score <= 1) return "Weak";
  if (score === 2) return "Ok";
  if (score === 3) return "Good";
  if (score === 4) return "Strong";
  return "Very strong";
}

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

  // UI
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showPwd, setShowPwd] = useState(false);

  const pwdScore = useMemo(() => passwordScore(password), [password]);

  const canSubmit = useMemo(() => {
    const okEmail = isValidEmail(email);
    const okPwd = password.trim().length >= 6;

    if (mode === "login") return okEmail && okPwd;

    const okName = name.trim().length >= 2;
    if (role === "DOCTOR") {
      const okSpec = specialty.trim().length >= 2;
      return okEmail && okPwd && okName && okSpec;
    }
    return okEmail && okPwd && okName;
  }, [email, password, mode, name, role, specialty]);

  function resetError() {
    if (err) setErr(null);
  }

  function switchMode(next: "login" | "register") {
    setMode(next);
    setErr(null);
  }

  function quickFill(kind: "patient" | "doctor") {
    setErr(null);
    setMode("login");
    if (kind === "patient") {
      setEmail("mario.rossi@example.com");
      setPassword("Password123!");
      return;
    }
    setEmail("luca.bianchi@clinic.example.com");
    setPassword("Password123!");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      if (mode === "login") {
        await login(email.trim(), password);
      } else {
        await register({
          email: email.trim(),
          password,
          role,
          name: name.trim(),
          specialty: role === "DOCTOR" ? specialty.trim() : undefined,
          bio: role === "DOCTOR" ? bio.trim() : undefined,
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
        {/* Header */}
        <div className="brand">
          <div className="brand-badge">🩺</div>
          <div>
            <div className="brand-title">Medical AI Assistant</div>
          </div>
        </div>

        {/* Mode tabs */}
        <div className="tabs">
          <button
            type="button"
            className={mode === "login" ? "tab active" : "tab"}
            onClick={() => switchMode("login")}
          >
            Login
          </button>
          <button
            type="button"
            className={mode === "register" ? "tab active" : "tab"}
            onClick={() => switchMode("register")}
          >
            Register
          </button>
        </div>

        <form onSubmit={onSubmit} className="form">
          {/* Register: role + name */}
          {mode === "register" && (
            <>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <div className="label" style={{ margin: 0 }}>
                  Role
                </div>

                <button
                  type="button"
                  className={role === "PATIENT" ? "pill active" : "pill"}
                  onClick={() => setRole("PATIENT")}
                >
                  Patient
                </button>
                <button
                  type="button"
                  className={role === "DOCTOR" ? "pill active" : "pill"}
                  onClick={() => setRole("DOCTOR")}
                >
                  Doctor
                </button>
              </div>

              <div>
                <label className="label">Full name</label>
                <input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    resetError();
                  }}
                  placeholder={role === "DOCTOR" ? "e.g. Dott. Luca Bianchi" : "e.g. Mario Rossi"}
                  autoComplete="name"
                />
                <div className="small muted" style={{ marginTop: 6 }}>
                  Used for profile and booking context.
                </div>
              </div>
            </>
          )}

          {/* Shared: email + password */}
          <div className="row2">
            <div>
              <label className="label">Email</label>
              <input
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  resetError();
                }}
                placeholder="email@example.com"
                autoComplete="email"
                inputMode="email"
              />
              {email && !isValidEmail(email) && (
                <div className="small" style={{ color: "#991b1b", fontWeight: 800, marginTop: 6 }}>
                  Please enter a valid email.
                </div>
              )}
            </div>

            <div>
              <label className="label">Password</label>

              <div style={{ position: "relative" }}>
                <input
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    resetError();
                  }}
                  type={showPwd ? "text" : "password"}
                  placeholder="Password123!"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  style={{ paddingRight: 50 }}
                />

                <button
                  type="button"
                  onClick={() => setShowPwd((p) => !p)}
                  className="ghost"
                  style={{
                    position: "absolute",
                    right: 8,
                    top: "50%",
                    transform: "translateY(-50%)",
                    padding: "6px 10px",
                    borderRadius: 12,
                  }}
                  aria-label={showPwd ? "Hide password" : "Show password"}
                  title={showPwd ? "Hide password" : "Show password"}
                >
                  {showPwd ? "🙈" : "👁️"}
                </button>
              </div>

              {/* Password strength ONLY for register */}
              {mode === "register" && (
                <>
                  <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10 }}>
                    <div
                      style={{
                        flex: 1,
                        height: 8,
                        borderRadius: 999,
                        background: "var(--panel2)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${(pwdScore / 5) * 100}%`,
                          borderRadius: 999,
                          background: "var(--primary2)",
                          transition: "width 150ms ease",
                        }}
                      />
                    </div>
                    <div className="small muted" style={{ fontWeight: 900, minWidth: 78, textAlign: "right" }}>
                      {password ? scoreLabel(pwdScore) : "—"}
                    </div>
                  </div>

                  <div className="small muted" style={{ marginTop: 6 }}>
                    Min 6 characters. Use numbers and a capital letter for a stronger password.
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Register: doctor fields */}
          {mode === "register" && role === "DOCTOR" && (
            <div
              style={{
                border: "1px solid var(--border)",
                background: "var(--panel2)",
                borderRadius: 18,
                padding: 12,
              }}
            >
              <div style={{ fontWeight: 1000, marginBottom: 10 }}>Doctor details</div>

              <div className="row2">
                <div>
                  <label className="label">Specialty</label>
                  <input
                    value={specialty}
                    onChange={(e) => {
                      setSpecialty(e.target.value);
                      resetError();
                    }}
                    placeholder="e.g. Dermatology"
                  />
                </div>
                <div>
                  <label className="label">Short bio</label>
                  <input
                    value={bio}
                    onChange={(e) => {
                      setBio(e.target.value);
                      resetError();
                    }}
                    placeholder="e.g. Skin conditions, moles, rashes..."
                  />
                </div>
              </div>

              <div className="small muted" style={{ marginTop: 8 }}>
                Specialty is used to match patients with relevant doctors.
              </div>
            </div>
          )}

          {/* Errors */}
          {err && <div className="error">{err}</div>}

          {/* Submit */}
          <button className="primary" disabled={busy || !canSubmit} style={{ width: "100%" }}>
            {busy ? "Please wait..." : mode === "login" ? "Login" : "Create account"}
          </button>

          {/* Demo helpers */}
          <div
            style={{
              marginTop: 12,
              border: "1px solid var(--border)",
              borderRadius: 18,
              background: "var(--panel2)",
              padding: 12,
            }}
          >
            <div style={{ fontWeight: 1000, marginBottom: 8 }}>Demo logins</div>
            <div className="small muted" style={{ marginBottom: 10 }}>
              Quick-fill credentials (password: <span style={{ fontWeight: 900 }}>Password123!</span>)
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button type="button" onClick={() => quickFill("patient")}>
                Fill patient
              </button>
              <button type="button" onClick={() => quickFill("doctor")}>
                Fill doctor
              </button>
            </div>
          </div>

          <div className="small muted" style={{ marginTop: 10 }}>
            Note: This is a demo app. No real medical diagnosis is provided.
          </div>
        </form>
      </div>
    </div>
  );
}