import { useEffect, useState } from "react";
import { api } from "../../api";
import type { Chat, Message, Patient } from "../../types";
import { Card } from "../../components/common/Card";
import { EmptyState } from "../../components/common/EmptyState";
import { MessageBubble } from "../../components/chat/MessageBubble";

type ClinicalNote = {
  chief_complaint: string;
  timeline: string;
  triage_and_red_flags: string;
  suggested_specialty: string;
  open_questions: string;
  when_to_escalate: string;
};

type ClinicalNoteResponse = { note: ClinicalNote };

export function DoctorPatientsPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [loadingChats, setLoadingChats] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // clinical note state
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteLoading, setNoteLoading] = useState(false);
  const [clinicalNote, setClinicalNote] = useState<ClinicalNote | null>(null);
  const [noteError, setNoteError] = useState<string>("");

  async function loadPatients() {
    setLoadingPatients(true);
    try {
      const res = await api.get<Patient[]>("/patients");
      setPatients(res.data);
    } finally {
      setLoadingPatients(false);
    }
  }

  async function loadChats(patientId: string) {
    setLoadingChats(true);
    try {
      const res = await api.get<Chat[]>(`/patients/${patientId}/chats`);
      setChats(res.data);
      setSelectedChat(null);
      setMessages([]);
      setNoteOpen(false);
      setClinicalNote(null);
      setNoteError("");
    } finally {
      setLoadingChats(false);
    }
  }

  async function loadMessages(chatId: string) {
    setLoadingMessages(true);
    try {
      const res = await api.get<Message[]>(`/chats/${chatId}/messages`);
      setMessages(res.data);
      setNoteOpen(false);
      setClinicalNote(null);
      setNoteError("");
    } finally {
      setLoadingMessages(false);
    }
  }

  async function generateClinicalNote(chatId: string) {
    setNoteLoading(true);
    setNoteError("");
    try {
      const res = await api.post<ClinicalNoteResponse>("/ai/clinical-note", { chatId });
      setClinicalNote(res.data?.note ?? null);
      setNoteOpen(true);
    } catch {
      setClinicalNote(null);
      setNoteError("Failed to generate clinical note. Please try again.");
      setNoteOpen(true);
    } finally {
      setNoteLoading(false);
    }
  }

  useEffect(() => {
    loadPatients();
  }, []);

  return (
    <div className="grid2" style={{ gridTemplateColumns: "340px 1fr" }}>
      <Card>
        <div className="card-title">Patients</div>

        {loadingPatients ? (
          <div className="small muted">Loading patients...</div>
        ) : patients.length === 0 ? (
          <EmptyState title="No patients" />
        ) : (
          <div className="list">
            {patients.map((p) => (
              <button
                key={p.id}
                className={selectedPatient?.id === p.id ? "list-item active" : "list-item"}
                type="button"
                onClick={async () => {
                  setSelectedPatient(p);
                  await loadChats(p.id);
                }}
              >
                <div className="list-title">{p.name}</div>
                <div className="small muted">{p.email || ""}</div>
              </button>
            ))}
          </div>
        )}
      </Card>

      <div className="stack">
        <Card>
          <div className="row-between">
            <div>
              <div className="card-title">Chats</div>
              <div className="small muted">
                {selectedPatient ? `Selected: ${selectedPatient.name}` : "Select a patient"}
              </div>
            </div>
          </div>

          {!selectedPatient ? (
            <EmptyState title="Select a patient" subtitle="Then open a chat to read messages and summary." />
          ) : loadingChats ? (
            <div className="small muted">Loading chats...</div>
          ) : chats.length === 0 ? (
            <EmptyState title="No chats for this patient yet." />
          ) : (
            <div className="list doctor-chats-list">
              {chats.map((c) => (
                <button
                  key={c.id}
                  className={selectedChat?.id === c.id ? "list-item active" : "list-item"}
                  type="button"
                  onClick={async () => {
                    setSelectedChat(c);
                    await loadMessages(c.id);
                  }}
                >
                  <div className="list-title">{c.summary || "New chat"}</div>
                  <div className="small muted">{new Date(c.createdAt).toLocaleString()}</div>
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <div className="row-between">
            <div className="card-title">Chat (read-only)</div>

            {selectedChat ? (
              <button
                type="button"
                className="note-btn"
                disabled={noteLoading}
                onClick={() => generateClinicalNote(selectedChat.id)}
                title="Generate a structured note for clinicians"
              >
                <span className="note-btn-icon">📝</span>
                <span>{noteLoading ? "Generating..." : "Generate clinical note"}</span>
              </button>
            ) : null}
          </div>

          {!selectedChat ? (
            <EmptyState title="Select a chat" subtitle="Messages will appear here." />
          ) : loadingMessages ? (
            <div className="small muted">Loading messages...</div>
          ) : messages.length === 0 ? (
            <EmptyState title="No messages yet" />
          ) : (
            <div className="chat-readonly">
              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} onBook={() => {}} variant="doctor" />
              ))}
            </div>
          )}
        </Card>
      </div>

      {noteOpen ? (
        <div className="maa-modal-backdrop" role="dialog" aria-modal="true" onClick={() => setNoteOpen(false)}>
          <div className="maa-modal" onClick={(e) => e.stopPropagation()}>
            <div className="maa-modal-head">
              <div>
                <div className="maa-modal-title">Clinical note</div>
                <div className="small muted">
                  {selectedPatient ? selectedPatient.name : ""}
                  {selectedChat ? ` • ${new Date(selectedChat.createdAt).toLocaleString()}` : ""}
                </div>
              </div>

              <button
                type="button"
                className="chat-side-toggle"
                onClick={() => setNoteOpen(false)}
                aria-label="Close"
                title="Close"
              >
                ✕
              </button>
            </div>

            <div className="maa-modal-body">
              {noteError ? <div className="maa-banner danger">{noteError}</div> : null}

              {clinicalNote ? (
                <div className="note-grid">
                  <div className="note-section">
                    <div className="note-section-title">Chief complaint</div>
                    <div className="note-section-body">{clinicalNote.chief_complaint}</div>
                  </div>

                  <div className="note-section">
                    <div className="note-section-title">Timeline</div>
                    <div className="note-section-body">{clinicalNote.timeline}</div>
                  </div>

                  <div className="note-section">
                    <div className="note-section-title">Triage & red flags</div>
                    <div className="note-section-body">{clinicalNote.triage_and_red_flags}</div>
                  </div>

                  <div className="note-section">
                    <div className="note-section-title">Suggested specialty</div>
                    <div className="note-section-body">{clinicalNote.suggested_specialty}</div>
                  </div>

                  <div className="note-section">
                    <div className="note-section-title">Open questions</div>
                    <div className="note-section-body">{clinicalNote.open_questions}</div>
                  </div>

                  <div className="note-section">
                    <div className="note-section-title">When to escalate</div>
                    <div className="note-section-body">{clinicalNote.when_to_escalate}</div>
                  </div>
                </div>
              ) : !noteError ? (
                <div className="small muted">No note generated.</div>
              ) : null}
            </div>

            <div className="maa-modal-actions">
              <button type="button" className="btn" onClick={() => setNoteOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}