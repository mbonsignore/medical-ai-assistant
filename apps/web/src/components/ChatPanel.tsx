import type { Chat, Doctor, Message, Patient } from "../types";
import { MessageBubble } from "./MessageBubble";

type Props = {
  role: "patient" | "doctor";
  selectedPatient: Patient | null;
  selectedDoctor: Doctor | null;
  selectedChat: Chat | null;
  latestAssistantMessage: Message | null;
  messages: Message[];
  input: string;
  loading: boolean;
  selectedChatId: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onBook: (doctorId: string, startTs: string, endTs: string) => void;
};

function urgencyClass(level?: string) {
  if (level === "HIGH") return "urgency-high";
  if (level === "MEDIUM") return "urgency-medium";
  return "urgency-low";
}

export function ChatPanel({
  role,
  selectedPatient,
  selectedDoctor,
  selectedChat,
  latestAssistantMessage,
  messages,
  input,
  loading,
  selectedChatId,
  onInputChange,
  onSend,
  onBook,
}: Props) {
  const triage = latestAssistantMessage?.sources?.triage;

  return (
    <div className="panel chat-panel">
      <div className="chat-header">
        <div className="chat-header-top">
          <div>
            <h2>{role === "patient" ? "Patient conversation" : "Doctor review panel"}</h2>
            <div className="small muted">
              {role === "patient"
                ? "Ask a question, review the AI assessment, and book a suggested slot."
                : "Review patient conversations, summaries, triage, and retrieved context in read-only mode."}
            </div>
          </div>

          <div className="header-meta">
            {selectedPatient && (
              <div className="header-chip">
                Patient: <strong>{selectedPatient.name}</strong>
              </div>
            )}
            {role === "doctor" && selectedDoctor && (
              <div className="header-chip">
                Doctor: <strong>{selectedDoctor.name}</strong>
              </div>
            )}
          </div>
        </div>

        {role === "doctor" && selectedChat && (
          <div className="triage-panel">
            <div className="triage-block">
              <div className="triage-label">Chat summary</div>
              <div className="triage-value">{selectedChat.summary || "No summary available yet."}</div>
            </div>

            {triage && (
              <>
                <div className="triage-block">
                  <div className="triage-label">Urgency</div>
                  <div className={`urgency-pill ${urgencyClass(triage.triage_level)}`}>
                    {triage.triage_level || "Unknown"}
                  </div>
                </div>

                <div className="triage-block">
                  <div className="triage-label">Recommended specialty</div>
                  <div className="triage-value">{triage.recommended_specialty || "Not available"}</div>
                </div>

                <div className="triage-block triage-wide">
                  <div className="triage-label">Red flags</div>
                  <div className="triage-value">
                    {triage.red_flags?.length
                      ? triage.red_flags.join("; ")
                      : "No red flags detected"}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="empty-state">
            {role === "patient"
              ? "No messages yet. Create or select a chat and send your first medical question."
              : "Select a patient and a chat to review the conversation."}
          </div>
        ) : (
          messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              onBook={onBook}
              readOnly={role === "doctor"}
            />
          ))
        )}
      </div>

      {role === "patient" && (
        <div className="chat-input-bar">
          <input
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            placeholder="Type your medical question..."
            disabled={!selectedChatId}
          />
          <button className="primary" onClick={onSend} disabled={loading || !selectedChatId}>
            {loading ? "Sending..." : "Send"}
          </button>
        </div>
      )}
    </div>
  );
}