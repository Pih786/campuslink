import { useCallback, useEffect, useState } from "react";
import { Users } from "lucide-react";
import { api } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import StaffRequests from "../../components/staff/StaffRequests";
import { Alert, Avatar, Badge, Card, EmptyState, PageHeader, Spinner } from "../../components/ui";

const ROLE_LABEL = { PLACEMENT_OFFICER: "Placement office", MENTOR: "Mentor" };

function PlacementTeam() {
  const { user } = useAuth();
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadStaff = useCallback(async () => {
    try {
      const res = await api.get("/colleges/mine/staff");
      setStaff(res.data ?? []);
    } catch (err) {
      setError(err.message || "Could not load your team");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStaff();
  }, [loadStaff]);

  return (
    <div className="page">
      <PageHeader
        title="Team"
        subtitle={`Placement staff and mentors at ${user?.collegeName ?? "your college"}. New staff need approval before they can see student data.`}
      />

      <section className="stack">
        <h2 className="section-title">Requests to join</h2>
        <StaffRequests onChange={loadStaff} />
      </section>

      <Card title="Current team" subtitle={loading ? "" : `${staff.length} approved`} flush>
        {error && <Alert tone="error">{error}</Alert>}
        {loading ? (
          <div className="card-loading">
            <Spinner />
          </div>
        ) : staff.length === 0 ? (
          <EmptyState icon={Users} compact title="No one yet" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Role</th>
                  <th>Title</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div className="cell-person">
                        <Avatar name={s.user.fullName} />
                        <div>
                          <div className="cell-title">
                            {s.user.fullName}
                            {s.user.id === user?.id && (
                              <>
                                {" "}
                                <Badge plain>You</Badge>
                              </>
                            )}
                          </div>
                          <div className="cell-sub">{s.user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>{ROLE_LABEL[s.user.role] ?? s.user.role}</td>
                    <td className={s.designation ? "" : "muted"}>{s.designation || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

export default PlacementTeam;
