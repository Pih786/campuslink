import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Spinner } from "../ui";
import PendingApproval from "./PendingApproval";

const ROLE_HOME = {
  STUDENT: "/student/dashboard",
  RECRUITER: "/recruiter/dashboard",
  PLACEMENT_OFFICER: "/placement/dashboard",
  MENTOR: "/mentor/dashboard",
  ADMIN: "/admin/approvals",
};

const STAFF_ROLES = ["PLACEMENT_OFFICER", "MENTOR"];

function ProtectedRoute({ allowedRoles }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="boot-loader" aria-label="Loading">
        <Spinner />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={ROLE_HOME[user.role] || "/"} replace />;
  }

  if (STAFF_ROLES.includes(user.role) && user.staffStatus !== "APPROVED") {
    return <PendingApproval />;
  }

  return <Outlet />;
}

export { ROLE_HOME };
export default ProtectedRoute;
