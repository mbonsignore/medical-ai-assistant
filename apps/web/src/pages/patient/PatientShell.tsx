import { Outlet } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { PatientSidebar } from "../../components/common/PatientSidebar";
import { Topbar } from "../../components/common/Topbar";

type PatientOutletCtx = {
  patientId: string;
};

export function PatientShell() {
  const { user } = useAuth();
  const patientId = user?.patientId || "";

  return (
    <div className="layout">
      <PatientSidebar />

      <div className="content">
        <Topbar title="Patient Portal" subtitle={user?.email || ""} />
        <div className="page">
          <Outlet context={{ patientId } satisfies PatientOutletCtx} />
        </div>
      </div>
    </div>
  );
}