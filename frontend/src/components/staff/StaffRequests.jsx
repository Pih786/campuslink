import { useCallback, useEffect, useState } from "react";
import { Check, UserCheck, X } from "lucide-react";
import { api } from "../../services/api";
import { useToast } from "../../context/ToastContext";
import { Alert, Avatar, Badge, EmptyState, Spinner } from "../ui";
import { relativeTime } from "../../lib/format";

const STATUS_TABS = [
  { key: "PENDING", label: "Waiting" },
  { key: "APPROVED", label: "Approved" },
  { key: "REJECTED", label: "Declined" },
];

const ROLE_LABEL = { PLACEMENT_OFFICER: "Placement office", MENTOR: "Mentor" };

// Staff sign-up requests. Admins see every college; officers see their own.
function StaffRequests({ showCollege = false, onChange }) {
  const toast = useToast();
  const [status, setStatus] = useState("PENDING");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get(`/colleges/staff-requests?status=${status}`);
      setRows(res.data ?? []);
    } catch (err) {
      setError(err.message || "Could not load requests");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  const review = async (row, decision) => {
    setBusyId(row.id);
    try {
      await api.post(`/colleges/staff-requests/${row.id}/review`, { decision });
      toast.success(
        decision === "APPROVED" ? `${row.user.fullName} can now use CampusLink` : `Declined ${row.user.fullName}`
      );
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      onChange?.();
    } catch (err) {
      toast.error(err.message || "Could not save the decision");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <div className="tabs" role="tablist">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            className="tab"
            aria-selected={status === t.key}
            onClick={() => setStatus(t.key)}
          >
            {t.label}
            {status === t.key && !loading && <span className="tab-count">{rows.length}</span>}
          </button>
        ))}
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      <div className="card card-flush">
        {loading ? (
          <div className="card-loading">
            <Spinner />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={UserCheck} compact title={status === "PENDING" ? "No one is waiting" : "Nothing here"}>
            {status === "PENDING" ? "New staff sign-ups will appear here for review." : null}
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Role</th>
                  {showCollege && <th>College</th>}
                  <th>Requested</th>
                  {status === "PENDING" && <th className="col-actions">Decision</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div className="cell-person">
                        <Avatar name={row.user.fullName} />
                        <div>
                          <div className="cell-title">{row.user.fullName}</div>
                          <div className="cell-sub">{row.user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div>{ROLE_LABEL[row.user.role] ?? row.user.role}</div>
                      {row.designation && <div className="cell-sub">{row.designation}</div>}
                    </td>
                    {showCollege && (
                      <td>
                        <div className="cell-title">{row.college.name}</div>
                        <div className="row-tight">
                          {!row.college.verified && <Badge tone="warning">Unverified college</Badge>}
                          {row.collegeOfficerCount === 0 && row.user.role === "PLACEMENT_OFFICER" && (
                            <Badge tone="info">First officer</Badge>
                          )}
                        </div>
                      </td>
                    )}
                    <td className="muted">{relativeTime(row.createdAt)}</td>
                    {status === "PENDING" && (
                      <td className="col-actions">
                        <div className="row-tight">
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={busyId === row.id}
                            onClick={() => review(row, "APPROVED")}
                          >
                            <Check aria-hidden="true" />
                            Approve
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            disabled={busyId === row.id}
                            onClick={() => review(row, "REJECTED")}
                          >
                            <X aria-hidden="true" />
                            Decline
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

export default StaffRequests;
