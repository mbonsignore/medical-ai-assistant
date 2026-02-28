import { useEffect, useState } from "react";
import { api } from "../../api";
import type { Chat, Message } from "../../types";
import { ChatPanel } from "../../components/chat/ChatPanel";
import { useAuth } from "../../auth/AuthContext";
import { EmptyState } from "../../components/common/EmptyState";
import { BookingModal } from "../../components/common/BookingModal";

function formatDoctorLabel(doc: any) {
  if (!doc) return "Doctor";
  const name = doc.name || "Doctor";
  const spec = doc.specialty ? ` — ${doc.specialty}` : "";
  return `${name}${spec}`;
}

export function PatientChatPage() {
  const { user } = useAuth();
  const patientId = user?.patientId || "";

  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string>("");

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingChats, setLoadingChats] = useState(false);

  const [newIssueDetected, setNewIssueDetected] = useState(false);

  // ✅ collapse state
  const [collapsed, setCollapsed] = useState(false);

  // ✅ Booking modal state
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingDoctorId, setBookingDoctorId] = useState<string>("");
  const [bookingDoctorLabel, setBookingDoctorLabel] = useState<string>("Doctor");
  const [bookingStartTs, setBookingStartTs] = useState<string>("");
  const [bookingEndTs, setBookingEndTs] = useState<string>("");
  const [bookingBusy, setBookingBusy] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);

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
  }

  async function loadMessages(id: string) {
    const res = await api.get<Message[]>(`/chats/${id}/messages`);
    setMessages(res.data);
  }

  async function send() {
    if (!selectedChatId) return;
    const text = input.trim();
    if (!text || loading) return;

    const tempId = `temp_${Date.now()}`;
    const optimisticMsg: Message = {
      id: tempId,
      chatId: selectedChatId,
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
      sources: undefined,
    };

    setInput("");
    setMessages((prev) => [...prev, optimisticMsg]);
    setLoading(true);
    setNewIssueDetected(false);

    try {
      const res = await api.post<{ userMsg: Message; assistantMsg: Message }>(
        `/chats/${selectedChatId}/message`,
        { content: text }
      );

      const realUser = res.data?.userMsg;
      const assistant = res.data?.assistantMsg;

      setMessages((prev) => {
        const withoutTemp = prev.filter((m) => m.id !== tempId);
        const next = [...withoutTemp];
        if (realUser) next.push(realUser);
        if (assistant) next.push(assistant);
        next.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        return next;
      });

      await loadChats();

      const flag = Boolean(assistant?.sources?.meta?.newIssueDetected);
      setNewIssueDetected(flag);
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      alert("Failed to send message. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function startNewChatFromNotice() {
    await createChat();
  }

  function book(doctorId: string, startTs: string, endTs: string) {
    if (!patientId) return;

    setBookingDoctorId(doctorId);
    setBookingStartTs(startTs);
    setBookingEndTs(endTs);
    setBookingError(null);

    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    const recDocs = Array.isArray(lastAssistant?.sources?.recommendation?.doctors)
      ? lastAssistant!.sources!.recommendation!.doctors
      : [];
    const d = recDocs.find((x: any) => x.id === doctorId);
    setBookingDoctorLabel(formatDoctorLabel(d));

    setBookingOpen(true);
  }

  async function confirmBook() {
    if (!patientId || !bookingDoctorId || !bookingStartTs || !bookingEndTs) return;

    setBookingBusy(true);
    setBookingError(null);

    try {
      await api.post("/bookings", {
        patientId,
        doctorId: bookingDoctorId,
        startTs: bookingStartTs,
        endTs: bookingEndTs,
      });

      setBookingOpen(false);
      setBookingDoctorId("");
      setBookingStartTs("");
      setBookingEndTs("");
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 409) {
        setBookingError("This slot is no longer available. Please pick another one.");
        return;
      }
      const msg = err?.response?.data?.error || "Could not book this slot.";
      setBookingError(msg);
    } finally {
      setBookingBusy(false);
    }
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
    <>
      <div className={collapsed ? "chat-split collapsed" : "chat-split"}>
        {/* LEFT: chat list */}
        <div className={collapsed ? "card chat-side collapsed" : "card chat-side"} style={{ padding: 0 }}>
          <div className="chat-side-head">
            {!collapsed ? (
              <>
                <div className="brand-mini">
                  <span className="badge-mini">💬</span>
                  <span style={{ fontWeight: 900 }}>Chats</span>
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button onClick={createChat} type="button">
                    New
                  </button>

                  <button
                    className="chat-side-toggle"
                    type="button"
                    onClick={() => setCollapsed(true)}
                    title="Collapse"
                  >
                    ⟨
                  </button>
                </div>
              </>
            ) : (
              <button
                className="chat-side-toggle"
                type="button"
                onClick={() => setCollapsed(false)}
                title="Expand"
              >
                ⟩
              </button>
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
          newIssueDetected={newIssueDetected}
          onStartNewChat={startNewChatFromNotice}
        />
      </div>

      <BookingModal
        open={bookingOpen}
        onClose={() => {
          if (bookingBusy) return;
          setBookingOpen(false);
          setBookingError(null);
        }}
        doctorLabel={bookingDoctorLabel}
        startTs={bookingStartTs}
        endTs={bookingEndTs}
        title="Confirm appointment"
        subtitle="This will create a booking for the selected slot."
        confirmLabel={bookingBusy ? "Booking…" : "Confirm booking"}
        busy={bookingBusy}
        error={bookingError}
        onConfirm={confirmBook}
      />
    </>
  );
}