import React, { useMemo } from "react";

function fmtRange(startTs: string, endTs: string) {
  const s = new Date(startTs);
  const e = new Date(endTs);
  if (!startTs || !endTs || Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return "";

  const datePart = s.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const startTime = s.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  const endTime = e.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });

  return `${datePart} ${startTime}–${endTime}`;
}

type Props = {
  open: boolean;
  onClose: () => void;

  title: string;
  subtitle?: string;

  // kept for backward compatibility
  doctorLabel?: string;

  startTs: string;
  endTs: string;

  confirmLabel?: string;
  cancelLabel?: string;

  onConfirm: () => void | Promise<void>;

  // NEW
  details?: React.ReactNode;
  busy?: boolean;
  error?: string | null;
};

export function BookingModal({
  open,
  onClose,
  title,
  subtitle,
  doctorLabel,
  startTs,
  endTs,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  details,
  busy = false,
  error = null,
}: Props) {
  const prettyRange = useMemo(() => fmtRange(startTs, endTs), [startTs, endTs]);

  if (!open) return null;

  return (
    <div
      onClick={() => !busy && onClose()}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 18,
        zIndex: 80,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 560,
          background: "var(--panel)",
          border: "1px solid var(--border)",
          borderRadius: 18,
          boxShadow: "var(--shadow)",
          padding: 16,
        }}
      >
        <div className="row-between" style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ fontWeight: 1000, fontSize: 16 }}>{title}</div>
            {subtitle && <div className="small muted">{subtitle}</div>}
          </div>

          <button className="ghost" type="button" onClick={onClose} disabled={busy}>
            Close
          </button>
        </div>

        {error && (
          <div
            style={{
              border: "1px solid #fecaca",
              background: "#fff1f2",
              borderRadius: 16,
              padding: 12,
              marginBottom: 12,
              color: "#991b1b",
              fontWeight: 800,
            }}
          >
            {error}
          </div>
        )}

        {details && (
          <div
            style={{
              border: "1px solid var(--border)",
              background: "var(--panel2)",
              borderRadius: 16,
              padding: 12,
              marginBottom: 12,
            }}
          >
            {details}
          </div>
        )}

        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: 16,
            padding: 12,
            background: "#fff",
          }}
        >
          {doctorLabel && (
            <div style={{ marginBottom: 10 }}>
              <div className="label">Who</div>
              <div style={{ fontWeight: 900 }}>{doctorLabel}</div>
            </div>
          )}

          <div>
            <div className="label">Selected slot</div>
            <div style={{ fontWeight: 900 }}>{prettyRange || `${startTs} → ${endTs}`}</div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
          <button type="button" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            className="primary"
            type="button"
            onClick={() => void onConfirm()}
            disabled={busy || !startTs || !endTs}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}