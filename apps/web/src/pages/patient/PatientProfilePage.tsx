import { useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { Card } from "../../components/common/Card";

function initials(email?: string) {
  if (!email) return "P";
  const name = email.split("@")[0] || "patient";
  const parts = name.split(/[._-]+/).filter(Boolean);
  const a = (parts[0]?.[0] || name[0] || "P").toUpperCase();
  const b = (parts[1]?.[0] || "").toUpperCase();
  return (a + b).slice(0, 2);
}

function prettyRole(role?: string) {
  if (!role) return "—";
  return role === "PATIENT" ? "Patient" : role;
}

export function PatientProfilePage() {
  const { user } = useAuth();
  const [showAdvanced, setShowAdvanced] = useState(false);

  const avatarText = useMemo(() => initials(user?.email || ""), [user?.email]);

  return (
    <div className="grid2">
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
          <div
            style={{
              width: 54,
              height: 54,
              borderRadius: 18,
              border: "1px solid var(--border)",
              background: "var(--panel2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 1000,
              fontSize: 18,
            }}
            aria-label="Profile avatar"
            title="Profile"
          >
            {avatarText}
          </div>

          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 1000, fontSize: 18, lineHeight: 1.2 }}>Your profile</div>
            <div className="small muted" style={{ wordBreak: "break-word" }}>
              {user?.email || "—"}
            </div>
          </div>
        </div>

        {/* Main info */}
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: 18,
            background: "var(--panel2)",
            padding: 12,
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 10, alignItems: "baseline" }}>
            <div className="small muted" style={{ fontWeight: 900 }}>
              Account type
            </div>
            <div style={{ fontWeight: 900 }}>{prettyRole(user?.role)}</div>

            <div className="small muted" style={{ fontWeight: 900 }}>
              Email
            </div>
            <div style={{ wordBreak: "break-word" }}>{user?.email || "—"}</div>
          </div>
        </div>

        {/* Advanced */}
        <div style={{ marginTop: 12 }}>
          <button className="ghost" type="button" onClick={() => setShowAdvanced((p) => !p)}>
            {showAdvanced ? "Hide advanced" : "Show advanced"}
          </button>

          {showAdvanced && (
            <div
              style={{
                marginTop: 10,
                border: "1px solid var(--border)",
                borderRadius: 18,
                background: "#fff",
                padding: 12,
              }}
            >
              <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 10, alignItems: "baseline" }}>
                <div className="small muted" style={{ fontWeight: 900 }}>
                  Patient ID
                </div>
                <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
                  {user?.patientId || "—"}
                </div>

                <div className="small muted" style={{ fontWeight: 900 }}>
                  User ID
                </div>
                <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
                  {user?.id || "—"}
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <div className="card-title">About this portal</div>

        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: 18,
            background: "var(--panel2)",
            padding: 12,
          }}
        >
          <div style={{ fontWeight: 900, marginBottom: 6 }}>Demo & safety</div>
          <div className="small muted" style={{ lineHeight: 1.5 }}>
            This portal is for demo/testing only. It does not provide real medical advice.
            <br />
            If you think you’re experiencing an emergency, contact local emergency services immediately.
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <div className="small muted" style={{ fontWeight: 900, marginBottom: 6 }}>
            Tips
          </div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li className="small muted">Use the chat to describe symptoms and get triage guidance.</li>
            <li className="small muted">Book an appointment from suggested slots or from the calendar page.</li>
            <li className="small muted">Keep separate concerns in separate chats for clearer tracking.</li>
          </ul>
        </div>
      </Card>
    </div>
  );
}