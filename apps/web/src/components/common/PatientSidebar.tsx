import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";

export function PatientSidebar() {
  const { user, logout } = useAuth();
  const nav = useNavigate();

  return (
    <aside className="sidenav">
      <div className="sidenav-head">
        <div className="brand-mini">
          <span className="badge-mini">🩺</span>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontWeight: 900 }}>Patient Portal</span>
            <span className="small muted">{user?.email}</span>
          </div>
        </div>
      </div>

      <div className="sidenav-body">
        <div className="list">
          <button className="list-item" onClick={() => nav("/patient")} type="button">
            <div className="list-title">Home</div>
            <div className="small muted">Back to dashboard</div>
          </button>

          <button
            onClick={() => {
              logout();
              nav("/", { replace: true });
            }}
            className="list-item"
            type="button"
          >
            <div className="list-title">Logout</div>
            <div className="small muted">End session</div>
          </button>
        </div>
      </div>
    </aside>
  );
}