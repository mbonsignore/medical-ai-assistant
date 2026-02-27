import { useEffect, useState } from "react";
import { api } from "../../api";
import type { Chat, Message, Patient } from "../../types";
import { Card } from "../../components/common/Card";
import { EmptyState } from "../../components/common/EmptyState";
import { MessageBubble } from "../../components/chat/MessageBubble";

export function DoctorPatientsPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [loadingChats, setLoadingChats] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);

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
    } finally {
      setLoadingChats(false);
    }
  }

  async function loadMessages(chatId: string) {
    setLoadingMessages(true);
    try {
      const res = await api.get<Message[]>(`/chats/${chatId}/messages`);
      setMessages(res.data);
    } finally {
      setLoadingMessages(false);
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
            <div className="list">
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
          <div className="card-title">Chat (read-only)</div>

          {!selectedChat ? (
            <EmptyState title="Select a chat" subtitle="Messages will appear here." />
          ) : loadingMessages ? (
            <div className="small muted">Loading messages...</div>
          ) : messages.length === 0 ? (
            <EmptyState title="No messages yet" />
          ) : (
            <div className="chat-readonly">
              {messages.map((m) => (
                <MessageBubble
                  key={m.id}
                  message={m}
                  onBook={() => {}}
                  variant="doctor"
                />
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}