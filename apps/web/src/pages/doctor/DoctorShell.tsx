import { Outlet } from "react-router-dom";
import { Topbar } from "../../components/common/Topbar";
import { DoctorSidebar } from "../../components/common/DoctorSidebar";

export function DoctorShell() {
  return (
    <div className="layout">
      <DoctorSidebar />

      <div className="content">
        <Topbar
          title="Doctor Portal"
          subtitle="Patients overview and schedule management"
        />
        <div className="page">
          <Outlet />
        </div>
      </div>
    </div>
  );
}