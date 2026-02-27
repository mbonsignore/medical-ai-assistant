import { useEffect, useState } from "react";
import { api } from "../../api";
import type { Chat, Message } from "../../types";
import { ChatPanel } from "../../components/chat/ChatPanel";
import { useAuth } from "../../auth/AuthContext";
import { EmptyState } from "../../components/common/EmptyState";

export function PatientChatPage() {
  const { user } = useAuth();
  const patientId = user?.patientId || "";

  const [collapsed, setCollapsed] = useState(false);

  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string>("");

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingChats, setLoadingChats] = useState(false);

  async function loadChats() {
    if (!patientId) return;
    setLoadingChats(true);
    try {
      const res = await api.get<Chat[]>(`/patients/${patientId}/chats`);
      setChats(res.data);

      if (res.data.length > 0) {
        setSelectedChatId((prev) => (res.data.some((c) => c.id === prev) ? prev : res.data[0].id));
      } else {
        setSelectedChatId("");
        setMessages([]);
      }
    } finally {
      setLoadingChats(false);
    }
  }

  async function createChat() {
    if (!patientId) return;
    const res = await api.post<Chat>("/chats", { patientId });
    await loadChats();
    setSelectedChatId(res.data.id);
    // auto-open sidebar when creating
    setCollapsed(false);
  }

  async function loadMessages(id: string) {
    const res = await api.get<Message[]>(`/chats/${id}/messages`);
    setMessages(res.data);
  }

  async function send() {
    if (!selectedChatId || !input.trim()) return;
    setLoading(true);
    try {
      await api.post(`/chats/${selectedChatId}/message`, { content: input });
      setInput("");
      await loadMessages(selectedChatId);
      await loadChats(); // refresh summaries
    } finally {
      setLoading(false);
    }
  }

  async function book(doctorId: string, startTs: string, endTs: string) {
    if (!patientId) return;
    await api.post("/bookings", { patientId, doctorId, startTs, endTs });
    alert("Appointment booked!");
  }

  useEffect(() => {
    if (!patientId) return;
    loadChats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  useEffect(() => {
    if (selectedChatId) loadMessages(selectedChatId);
  }, [selectedChatId]);

  return (
    <div className={collapsed ? "chat-split collapsed" : "chat-split"}>
      {/* LEFT: chats sidebar */}
      <div className={collapsed ? "chat-side collapsed" : "chat-side"}>
        <div className="chat-side-head">
          <button
            className="chat-side-toggle"
            type="button"
            onClick={() => setCollapsed((p) => !p)}
            title={collapsed ? "Show chats" : "Hide chats"}
          >
            💬
          </button>

          {!collapsed && (
            <>
              <div className="brand-mini" style={{ gap: 10 }}>
                
                <span style={{ fontWeight: 900 }}>Chats</span>
              </div>
              <button onClick={createChat} type="button">
                New
              </button>
            </>
          )}
        </div>

        {!collapsed && (
          <div className="chat-side-body">
            {loadingChats ? (
              <div className="small muted">Loading chats...</div>
            ) : chats.length === 0 ? (
              <EmptyState title="No chats yet" subtitle="Create a chat to start." />
            ) : (
              <div className="list">
                {chats.map((c) => (
                  <button
                    key={c.id}
                    className={c.id === selectedChatId ? "list-item active" : "list-item"}
                    onClick={() => setSelectedChatId(c.id)}
                    type="button"
                  >
                    <div className="list-title">{c.summary || "New chat"}</div>
                    <div className="small muted">{new Date(c.createdAt).toLocaleString()}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* RIGHT: chat */}
      <ChatPanel
        chatId={selectedChatId}
        messages={messages}
        input={input}
        loading={loading}
        onInputChange={setInput}
        onSend={send}
        onBook={book}
      />
    </div>
  );
}