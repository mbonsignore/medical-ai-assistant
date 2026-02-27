import { useNavigate } from "react-router-dom";
import { Card } from "../../components/common/Card";

export function DoctorHomePage() {
  const nav = useNavigate();

  return (
    <div className="grid2">
      <Card className="cta-card" onClick={() => nav("/doctor/patients")}>
        <div className="cta-icon">👥</div>
        <div className="cta-title">Patients</div>
        <div className="small muted">Browse patients, open chats, read summaries & triage.</div>
        <button
          className="primary"
          style={{ marginTop: 12 }}
          onClick={(e) => {
            e.stopPropagation();
            nav("/doctor/patients");
          }}
        >
          Open
        </button>
      </Card>

      <Card className="cta-card" onClick={() => nav("/doctor/calendar")}>
        <div className="cta-icon">📅</div>
        <div className="cta-title">Calendar</div>
        <div className="small muted">See bookings and manage your schedule.</div>
        <button
          className="primary"
          style={{ marginTop: 12 }}
          onClick={(e) => {
            e.stopPropagation();
            nav("/doctor/calendar");
          }}
        >
          Open
        </button>
      </Card>
    </div>
  );
}