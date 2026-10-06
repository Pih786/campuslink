import { PageHeader } from "../../components/ui";
import StaffRequests from "../../components/staff/StaffRequests";

function AdminApprovals() {
  return (
    <div className="page">
      <PageHeader
        title="Staff approvals"
        subtitle="Approve the first placement officer of each college. After that, each college's placement office approves its own staff."
      />
      <StaffRequests showCollege />
    </div>
  );
}

export default AdminApprovals;
