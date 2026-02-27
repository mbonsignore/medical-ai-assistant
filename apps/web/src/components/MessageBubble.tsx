import { useState } from "react";
import axios from "axios";
import type { Message } from "../types";
import { SlotButton } from "./SlotButton";

type Props = {
  message: Message;
  onBook: (doctorId: string, startTs: string, endTs: string) => void;
  readOnly?: boolean;
};

type RetrievedDoc = {
  id: string;
  source: string;
  title?: string | null;
  score?: number;
};

type FullDocument = {
  id: string;
  source: string;
  title?: string | null;
  text: string;
  metadata?: unknown;
  createdAt?: string;
};

export function MessageBubble({ message, onBook, readOnly = false }: Props) {
  const recommendation = message.sources?.recommendation;
  const docs: RetrievedDoc[] = Array.isArray(message.sources?.docs) ? message.sources.docs : [];

  const [showDocs, setShowDocs] = useState(false);
  const [openDocId, setOpenDocId] = useState<string | null>(null);
  const [loadingDocId, setLoadingDocId] = useState<string | null>(null);
  const [docMap, setDocMap] = useState<Record<string, FullDocument>>({});

  async function handleToggleDoc(docId: string) {
    if (openDocId === docId) {
      setOpenDocId(null);
      return;
    }

    if (!docMap[docId]) {
      try {
        setLoadingDocId(docId);
        const res = await axios.get<FullDocument>(`http://localhost:3001/documents/${docId}`);
        setDocMap((prev) => ({ ...prev, [docId]: res.data }));
      } finally {
        setLoadingDocId(null);
      }
    }

    setOpenDocId(docId);
  }

  return (
    <div className={`message-row ${message.role}`}>
      <div className="message-bubble">
        <div className="message-role">{message.role === "user" ? "User" : "Assistant"}</div>
        <div>{message.content}</div>

        {message.role === "assistant" && docs.length > 0 && (
          <div className="message-actions" style={{ marginTop: 14 }}>
            <button
              className="secondary"
              onClick={() => setShowDocs((prev) => !prev)}
              style={{ marginBottom: 10 }}
            >
              {showDocs ? "Hide retrieved docs" : `Show retrieved docs (${docs.length})`}
            </button>

            {showDocs && (
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                <div className="message-subtitle">Retrieved documents</div>

                {docs.map((doc) => {
                  const fullDoc = docMap[doc.id];
                  const isLoading = loadingDocId === doc.id;
                  const isOpen = openDocId === doc.id;

                  return (
                    <div
                      key={doc.id}
                      style={{
                        marginBottom: 12,
                        padding: 12,
                        border: "1px solid var(--border)",
                        borderRadius: 12,
                        background: "var(--panel-soft)",
                      }}
                    >
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>
                        {doc.title || "Untitled document"}
                      </div>

                      <div className="small muted" style={{ marginBottom: 6 }}>
                        Source: {doc.source} • Score:{" "}
                        {typeof doc.score === "number" ? doc.score.toFixed(3) : "n/a"}
                      </div>

                      <div className="small muted" style={{ marginBottom: 8 }}>
                        ID: {doc.id}
                      </div>

                      <button className="secondary" onClick={() => handleToggleDoc(doc.id)}>
                        {isOpen ? "Hide text" : "View text"}
                      </button>

                      {isLoading && (
                        <div className="small muted" style={{ marginTop: 8 }}>
                          Loading document...
                        </div>
                      )}

                      {isOpen && fullDoc && (
                        <div className="doc-preview">
                          <div style={{ fontWeight: 700, marginBottom: 8 }}>
                            {fullDoc.title || "Untitled document"}
                          </div>
                          <div className="small muted" style={{ marginBottom: 10 }}>
                            Dataset: {fullDoc.source}
                          </div>
                          <div>{fullDoc.text}</div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {!readOnly && message.role === "assistant" && recommendation?.doctors?.length > 0 && (
          <div className="message-actions">
            <div className="message-subtitle">Book from suggested slots</div>

            {recommendation.doctors.map((doctor: any) => (
              <div key={doctor.id} style={{ marginBottom: 14 }}>
                <div style={{ fontWeight: 700 }}>
                  {doctor.name} — {doctor.specialty}
                </div>
                <div className="small muted" style={{ marginBottom: 8 }}>
                  {doctor.bio}
                </div>
                <div className="slot-grid">
                  {(doctor.slots || []).map((slot: any, idx: number) => (
                    <SlotButton
                      key={idx}
                      slot={slot}
                      onBook={() => onBook(doctor.id, slot.startTs, slot.endTs)}
                    />
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