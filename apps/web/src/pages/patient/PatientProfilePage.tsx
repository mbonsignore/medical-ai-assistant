import { useAuth } from "../../auth/AuthContext";
import { Card } from "../../components/common/Card";

export function PatientProfilePage() {
  const { user } = useAuth();

  return (
    <div className="grid2">
      <Card>
        <div className="card-title">Profile</div>

        <div className="kv">
          <div className="k">Email</div>
          <div className="v">{user?.email}</div>
        </div>

        <div className="kv">
          <div className="k">Role</div>
          <div className="v">{user?.role}</div>
        </div>

        <div className="kv">
          <div className="k">PatientId</div>
          <div className="v">{user?.patientId}</div>
        </div>
      </Card>

      <Card>
        <div className="card-title">Notes</div>
        <div className="small muted">
          This portal is for demo/testing only. No real medical advice is provided.
        </div>
      </Card>
    </div>
  );
}