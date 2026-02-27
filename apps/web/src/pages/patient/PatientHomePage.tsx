import { useNavigate } from "react-router-dom";
import { Card } from "../../components/common/Card";

export function PatientHomePage() {
  const nav = useNavigate();

  return (
    <div className="grid2">
      <Card className="cta-card" onClick={() => nav("/patient/chat")}>
        <div className="cta-icon">💬</div>
        <div className="cta-title">Chat</div>
        <div className="small muted">Ask questions, see triage, and suggested booking options.</div>
        <button
          className="primary"
          style={{ marginTop: 12 }}
          onClick={(e) => {
            e.stopPropagation();
            nav("/patient/chat");
          }}
        >
          Open
        </button>
      </Card>

      <Card className="cta-card" onClick={() => nav("/patient/appointments")}>
        <div className="cta-icon">📅</div>
        <div className="cta-title">Calendar</div>
        <div className="small muted">View your bookings and schedule new appointments.</div>
        <button
          className="primary"
          style={{ marginTop: 12 }}
          onClick={(e) => {
            e.stopPropagation();
            nav("/patient/appointments");
          }}
        >
          Open
        </button>
      </Card>

      <Card className="cta-card" onClick={() => nav("/patient/profile")}>
        <div className="cta-icon">👤</div>
        <div className="cta-title">Profile</div>
        <div className="small muted">Your account details for this demo environment.</div>
        <button
          className="primary"
          style={{ marginTop: 12 }}
          onClick={(e) => {
            e.stopPropagation();
            nav("/patient/profile");
          }}
        >
          Open
        </button>
      </Card>
    </div>
  );
}