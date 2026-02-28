import { useMemo, useState } from "react";
import { api } from "../../api";
import type { Message } from "../../types";

type RetrievedDoc = { id: string; source: string; title?: string | null; score?: number };
type FullDoc = { id: string; source: string; title?: string | null; text: string };

function badgeColor(level?: string) {
  const v = (level || "").toUpperCase();
  if (v === "HIGH") return { bg: "#fee2e2", fg: "#991b1b", bd: "#fecaca" };
  if (v === "LOW") return { bg: "#dcfce7", fg: "#166534", bd: "#bbf7d0" };
  return { bg: "#fef9c3", fg: "#854d0e", bd: "#fde68a" }; // MEDIUM
}

function formatTs(ts?: string) {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

// ✅ Mon 27 Feb 2026 09:30–10:00
function formatSlotLabel(slot: any) {
  const start = new Date(slot.startTs);
  const end = new Date(slot.endTs);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "";

  const datePart = start.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const startTime =
    slot.startLocal ??
    start.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  const endTime =
    slot.endLocal ??
    end.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });

  return `${datePart} ${startTime}–${endTime}`;
}

/**
 * sources can sometimes come as:
 * - object (ideal)
 * - stringified JSON (happens in some setups)
 * - null/undefined
 */
function parseSources(raw: any): any {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return null;
}

export function MessageBubble({
  message,
  onBook,
  variant = "patient",
}: {
  message: Message;
  onBook: (doctorId: string, startTs: string, endTs: string) => void;
  variant?: "patient" | "doctor";
}) {
  const isUser = message.role === "user";

  const sources = useMemo(() => parseSources((message as any).sources), [message]);

  const docs: RetrievedDoc[] = useMemo(() => {
    const arr = sources?.docs;
    return Array.isArray(arr) ? arr : [];
  }, [sources]);

  const recDoctors = useMemo(() => {
    const arr = sources?.recommendation?.doctors;
    return Array.isArray(arr) ? arr : [];
  }, [sources]);

  const triage = sources?.triage;
  const ui = sources?.ui;

  const triageLevel = triage?.triage_level || "";
  const spec = triage?.recommended_specialty || "";
  const redFlags: string[] = Array.isArray(triage?.red_flags) ? triage.red_flags : [];
  const followUps: string[] = Array.isArray(triage?.follow_up_questions) ? triage.follow_up_questions : [];

  const urgencyBadge = useMemo(() => badgeColor(triageLevel), [triageLevel]);

  // Retrieved docs UI
  const [showDocs, setShowDocs] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [docMap, setDocMap] = useState<Record<string, FullDoc>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function toggleDoc(id: string) {
    if (openId === id) return setOpenId(null);
    if (!docMap[id]) {
      setLoadingId(id);
      try {
        const res = await api.get<FullDoc>(`/documents/${id}`);
        setDocMap((p) => ({ ...p, [id]: res.data }));
      } finally {
        setLoadingId(null);
      }
    }
    setOpenId(id);
  }

  return (
    <div className={isUser ? "msg-row user" : "msg-row assistant"}>
      <div className="msg">
        <div className="msg-meta">
          {isUser ? "USER" : "ASSISTANT"}
          <div className="small muted" style={{ fontWeight: 600, marginTop: 4 }}>
            {formatTs(message.createdAt)}
          </div>
        </div>

        <div style={{ whiteSpace: "pre-wrap" }}>{message.content}</div>

        {/* ✅ Quick assessment */}
        {!isUser && triage && (
          <div className="msg-section">
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Quick assessment</div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: `1px solid ${urgencyBadge.bd}`,
                  background: urgencyBadge.bg,
                  color: urgencyBadge.fg,
                  fontWeight: 900,
                }}
              >
                Urgency: {String(triageLevel).toUpperCase()}
              </span>

              <span className="small muted" style={{ fontWeight: 800 }}>
                Specialty: {spec === "EMERGENCY" ? "Emergency care" : spec}
              </span>
            </div>

            <div style={{ marginTop: 10 }}>
              <div className="label">Red flags</div>
              {redFlags.length === 0 ? (
                <div className="small muted">None detected</div>
              ) : (
                <div className="slot-wrap" style={{ marginTop: 6 }}>
                  {redFlags.map((rf, i) => (
                    <span
                      key={i}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "6px 10px",
                        borderRadius: 999,
                        border: "1px solid var(--border)",
                        background: "var(--panel2)",
                        fontSize: ".86rem",
                        fontWeight: 800,
                      }}
                    >
                      {rf}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {followUps.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div className="label">Helpful follow-up questions</div>
                <ol style={{ margin: "6px 0 0 18px" }}>
                  {followUps.slice(0, 3).map((q, i) => (
                    <li key={i} style={{ marginBottom: 4 }}>
                      {q}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}

        {/* ✅ New issue note */}
        {!isUser && ui?.issueNote && (
          <div className="msg-section">
            <div
              style={{
                border: "1px solid var(--border)",
                background: "var(--panel2)",
                borderRadius: 16,
                padding: 12,
              }}
            >
              <div style={{ fontWeight: 900, marginBottom: 6 }}>Note</div>
              <div className="small muted">{ui.issueNote}</div>
            </div>
          </div>
        )}

        {/* ✅ Emergency actions */}
        {!isUser && Array.isArray(ui?.emergencyActions) && ui.emergencyActions.length > 0 && (
          <div className="msg-section">
            <div
              style={{
                border: "1px solid #fecaca",
                background: "#fff1f2",
                borderRadius: 16,
                padding: 12,
              }}
            >
              <div style={{ fontWeight: 1000, color: "#991b1b", marginBottom: 6 }}>Emergency action</div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {ui.emergencyActions.map((a: string, i: number) => (
                  <li key={i} style={{ marginBottom: 4 }}>
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* ✅ Retrieved docs (RAG) */}
        {!isUser && docs.length > 0 && (
          <div className="msg-section">
            <button className="ghost" onClick={() => setShowDocs((p) => !p)} type="button">
              {showDocs ? "Hide retrieved docs" : `Show retrieved docs (${docs.length})`}
            </button>

            {showDocs && (
              <div className="docs">
                {docs.map((d) => (
                  <div key={d.id} className="doc">
                    <div style={{ fontWeight: 900 }}>{d.title || "Untitled"}</div>
                    <div className="small muted">
                      {d.source} • score {typeof d.score === "number" ? d.score.toFixed(3) : "n/a"}
                    </div>

                    <button className="ghost" onClick={() => toggleDoc(d.id)} type="button">
                      {openId === d.id ? "Hide text" : "View text"}
                    </button>

                    {loadingId === d.id && <div className="small muted">Loading...</div>}

                    {openId === d.id && docMap[d.id] && (
                      <div className="doc-text">
                        <div className="small muted" style={{ marginBottom: 8 }}>
                          Dataset: {docMap[d.id].source}
                        </div>
                        <div style={{ whiteSpace: "pre-wrap" }}>{docMap[d.id].text}</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ✅ Booking (ONLY for patient view) */}
        {!isUser && variant === "patient" && recDoctors.length > 0 && (
          <div className="msg-section">
            <div style={{ fontWeight: 900, marginBottom: 6 }}>Book from suggested slots</div>

            {recDoctors.map((doc: any) => (
              <div key={doc.id} className="rec" style={{ marginBottom: 10 }}>
                <div style={{ fontWeight: 800 }}>
                  {doc.name} — {doc.specialty}
                </div>
                <div className="small muted">{doc.bio}</div>

                <div className="slot-wrap" style={{ marginTop: 8 }}>
                  {(doc.slots || []).map((s: any, idx: number) => (
                    <button
                      key={idx}
                      className="slot-pill"
                      type="button"
                      onClick={() => onBook(doc.id, s.startTs, s.endTs)}
                    >
                      {formatSlotLabel(s)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}