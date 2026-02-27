import { useEffect, useMemo, useRef } from "react";
import type { Message } from "../../types";
import { EmptyState } from "../common/EmptyState";
import { MessageBubble } from "./MessageBubble";

export function ChatPanel({
  chatId,
  messages,
  input,
  loading,
  onInputChange,
  onSend,
  onBook,
  newIssueDetected,
  onStartNewChat,
}: {
  chatId: string;
  messages: Message[];
  input: string;
  loading: boolean;
  onInputChange: (v: string) => void;
  onSend: () => void;
  onBook: (doctorId: string, startTs: string, endTs: string) => void;
  newIssueDetected?: boolean;
  onStartNewChat?: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  const canSend = Boolean(chatId) && Boolean(input.trim()) && !loading;

  useEffect(() => {
    if (!ref.current) return;
    ref.current.scrollTop = ref.current.scrollHeight;
  }, [messages, loading]);

  const typingIndicator = useMemo(() => {
    if (!loading) return null;
    return (
      <div className="msg-row assistant">
        <div className="msg typing">
          <div className="msg-meta">ASSISTANT</div>
          <div className="typing-line">
            <span className="dot" />
            <span className="dot" />
            <span className="dot" />
            <span className="small muted" style={{ marginLeft: 8 }}>
              Typing…
            </span>
          </div>
        </div>
      </div>
    );
  }, [loading]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter") return;
    if (e.shiftKey) return;
    e.preventDefault();
    if (canSend) onSend();
  }

  return (
    <div className="chat-panel">
      <div className="chat-head">
        <div style={{ fontWeight: 900 }}>Chat</div>
        <div className="small muted">Ask a question, review triage, book suggested slots.</div>
      </div>

      <div className="chat-body" ref={ref}>
        {!chatId ? (
          <EmptyState title="Select or create a chat" subtitle="Use the left panel to pick a conversation." />
        ) : (
          <>
            {newIssueDetected && (
              <div className="notice">
                <div style={{ fontWeight: 900, marginBottom: 4 }}>New issue detected</div>
                <div className="small muted" style={{ marginBottom: 10 }}>
                  This message looks like a different medical issue. For better tracking, start a new chat.
                </div>
                <button className="primary" onClick={onStartNewChat} disabled={!onStartNewChat}>
                  Start new chat
                </button>
              </div>
            )}

            {messages.length === 0 ? (
              <EmptyState title="No messages yet" subtitle="Send your first message." />
            ) : (
              messages.map((m) => <MessageBubble key={m.id} message={m} onBook={onBook} />)
            )}

            {typingIndicator}
          </>
        )}
      </div>

      <div className="chat-input">
        <textarea
          className="chat-textarea"
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          placeholder={chatId ? "Type your message..." : "Select a chat first..."}
          disabled={!chatId || loading}
          onKeyDown={handleKeyDown}
          rows={2}
        />
        <button className="primary" onClick={onSend} disabled={!chatId || loading || !input.trim()}>
          {loading ? "Sending..." : "Send"}
        </button>
      </div>
    </div>
  );
}