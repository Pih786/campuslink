import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { RefreshCw, Search, SquareKanban } from "lucide-react";
import { relativeTime } from "../../lib/format";
import AnimatedNumber from "../../components/common/AnimatedNumber";
import Modal from "../../components/common/Modal";
import PipelineCard from "../../components/pipeline/PipelineCard";
import ScheduleInterviewModal from "../../components/pipeline/ScheduleInterviewModal";
import MakeOfferModal from "../../components/pipeline/MakeOfferModal";
import { STAGES, DROP_ACTIONS, canTransition, stageForStatus } from "../../components/pipeline/pipelineConfig";
import { Alert, EmptyState, PageHeader } from "../../components/ui";

const REFRESH_INTERVAL_MS = 30000;

const STATUS_TOAST = {
  SHORTLISTED: "shortlisted",
  SELECTED: "selected",
  REJECTED: "rejected",
};

function pickRelevantInterview(interviews) {
  const now = Date.now();
  const upcoming = interviews
    .filter((iv) => iv.status === "SCHEDULED" && new Date(iv.scheduledAt).getTime() >= now)
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
  return upcoming[0] ?? null;
}

function ApplicationsPipeline() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const isRecruiter = user?.role === "RECRUITER";

  const [applications, setApplications] = useState([]);
  const [interviews, setInterviews] = useState([]);
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  const [jobFilter, setJobFilter] = useState(searchParams.get("jobId") ?? "");
  const [search, setSearch] = useState("");

  const [draggingId, setDraggingId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [busyIds, setBusyIds] = useState(() => new Set());

  const [modal, setModal] = useState(null); // { type: "interview" | "offer" | "reject", application }

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const [appsRes, interviewsRes, offersRes] = await Promise.all([
        api.get("/applications?limit=100"),
        api.get("/interviews?limit=100"),
        api.get("/offers?limit=100"),
      ]);
      setApplications(appsRes.data ?? []);
      setInterviews(interviewsRes.data ?? []);
      setOffers(offersRes.data ?? []);
      setLastUpdated(new Date());
      setError("");
    } catch (err) {
      if (!silent) setError(err.message || "Could not load the pipeline");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(() => load({ silent: true }), REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const interviewByApp = useMemo(() => {
    const grouped = new Map();
    for (const iv of interviews) {
      const list = grouped.get(iv.applicationId) ?? [];
      list.push(iv);
      grouped.set(iv.applicationId, list);
    }
    const result = new Map();
    for (const [appId, list] of grouped) {
      result.set(appId, pickRelevantInterview(list));
    }
    return result;
  }, [interviews]);

  const offerByKey = useMemo(() => {
    const map = new Map();
    for (const offer of offers) {
      map.set(`${offer.studentId}:${offer.jobId}`, offer);
    }
    return map;
  }, [offers]);

  const jobOptions = useMemo(() => {
    const map = new Map();
    for (const app of applications) {
      if (app.job && !map.has(app.job.id)) {
        map.set(app.job.id, {
          id: app.job.id,
          label: isRecruiter ? app.job.title : `${app.job.title} · ${app.job.company?.name ?? ""}`,
        });
      }
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [applications, isRecruiter]);

  const visibleApplications = useMemo(() => {
    const query = search.trim().toLowerCase();
    return applications.filter((app) => {
      if (jobFilter && app.jobId !== jobFilter) return false;
      if (!query) return true;
      const haystack = [
        app.student?.user?.fullName,
        app.student?.user?.email,
        app.student?.department,
        app.job?.title,
        app.job?.company?.name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [applications, jobFilter, search]);

  const byStage = useMemo(() => {
    const map = Object.fromEntries(STAGES.map((s) => [s.key, []]));
    for (const app of visibleApplications) {
      map[stageForStatus(app.status).key].push(app);
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => (b.matchScore ?? -1) - (a.matchScore ?? -1));
    }
    return map;
  }, [visibleApplications]);

  const setBusy = (id, value) => {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (value) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const changeStatus = async (application, status) => {
    const previous = application.status;
    setBusy(application.id, true);
    setApplications((prev) => prev.map((a) => (a.id === application.id ? { ...a, status } : a)));

    try {
      await api.patch(`/applications/${application.id}`, { status });
      toast.success(`${application.student?.user?.fullName ?? "Candidate"} ${STATUS_TOAST[status] ?? "updated"}`);
      load({ silent: true });
    } catch (err) {
      setApplications((prev) =>
        prev.map((a) => (a.id === application.id ? { ...a, status: previous } : a))
      );
      toast.error(err.message || "Could not update application");
    } finally {
      setBusy(application.id, false);
    }
  };

  const updateJoining = async (application, joiningStatus) => {
    const offer = offerByKey.get(`${application.studentId}:${application.jobId}`);
    if (!offer) return;
    setBusy(application.id, true);
    try {
      await api.patch(`/offers/${offer.id}`, { joiningStatus });
      toast.success(joiningStatus === "JOINED" ? "Marked as joined" : "Marked as did not join");
      await load({ silent: true });
    } catch (err) {
      toast.error(err.message || "Could not update joining status");
    } finally {
      setBusy(application.id, false);
    }
  };

  const handleAction = (key, application) => {
    switch (key) {
      case "shortlist":
        return changeStatus(application, "SHORTLISTED");
      case "select":
        return changeStatus(application, "SELECTED");
      case "reject":
        return setModal({ type: "reject", application });
      case "interview":
        return setModal({ type: "interview", application });
      case "offer":
        return setModal({ type: "offer", application });
      case "assignment":
        return navigate(`/recruiter/assignments?new=${application.jobId}`);
      case "joined":
        return updateJoining(application, "JOINED");
      case "notJoined":
        return updateJoining(application, "DID_NOT_JOIN");
      default:
        return undefined;
    }
  };

  const handleDrop = (stageKey) => {
    const application = applications.find((a) => a.id === draggingId);
    setDropTarget(null);
    setDraggingId(null);
    if (!application) return;
    if (stageForStatus(application.status).key === stageKey) return;

    const action = DROP_ACTIONS[stageKey];
    if (!action) {
      toast.info(
        stageKey === "accepted" || stageKey === "joined"
          ? "Acceptance comes from the student; mark joining from the card once accepted."
          : "Applications can't move backwards in the pipeline."
      );
      return;
    }

    if (!canTransition(application.status, action.status)) {
      toast.error("That move isn't allowed from the candidate's current stage.");
      return;
    }

    if (action.type === "modal" && action.modal === "offer" && application.status !== "SELECTED") {
      toast.info("Select the candidate before making an offer.");
      return;
    }

    if (action.type === "modal") {
      setModal({ type: action.modal, application });
    } else if (action.status === "REJECTED") {
      setModal({ type: "reject", application });
    } else {
      changeStatus(application, action.status);
    }
  };

  const closeModal = () => setModal(null);

  const afterModalSuccess = (message) => {
    toast.success(message);
    setModal(null);
    load({ silent: true });
  };

  if (loading) {
    return (
      <div className="page page-wide" aria-busy="true">
        <div className="skeleton skeleton-title" />
        <div className="pipeline-board">
          {STAGES.slice(0, 5).map((s) => (
            <div key={s.key} className="pipeline-column">
              <div className="skeleton skeleton-line" />
              <div className="skeleton skeleton-card" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const activeCount = visibleApplications.filter((a) => !["REJECTED", "DECLINED", "JOINED"].includes(a.status)).length;

  return (
    <div className="page page-wide">
      <PageHeader
        title="Pipeline"
        subtitle={
          <>
            Drag a candidate to another stage, or use the buttons on the card.
            {lastUpdated && (
              <span className="live-indicator">
                <span className="live-dot" aria-hidden="true" />
                Updated {relativeTime(lastUpdated)}
              </span>
            )}
          </>
        }
        actions={
          <button type="button" className="btn btn-secondary" onClick={() => load({ silent: true })}>
            <RefreshCw />
            Refresh
          </button>
        }
      />

      {error && <Alert tone="error">{error}</Alert>}

      <div className="toolbar">
        <label className="search-input">
          <Search aria-hidden="true" />
          <input
            type="search"
            placeholder="Search name, branch or role"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search candidates"
          />
        </label>
        <select value={jobFilter} onChange={(e) => setJobFilter(e.target.value)} aria-label="Filter by job">
          <option value="">All jobs</option>
          {jobOptions.map((j) => (
            <option key={j.id} value={j.id}>
              {j.label}
            </option>
          ))}
        </select>
        <span className="toolbar-count">
          {activeCount} active · {visibleApplications.length} total
        </span>
      </div>

      {applications.length === 0 ? (
        <EmptyState icon={SquareKanban} title="No applications yet">
          {isRecruiter
            ? "Candidates appear here as soon as students apply to your roles."
            : "Applications appear here as soon as students start applying."}
        </EmptyState>
      ) : (
        <div className="pipeline-board">
          {STAGES.map((stage) => {
            const cards = byStage[stage.key];
            return (
              <section
                key={stage.key}
                className={`pipeline-column ${dropTarget === stage.key ? "is-drop-target" : ""}`}
                style={{ "--stage-color": stage.color }}
                aria-label={`${stage.label}, ${cards.length} candidates`}
                onDragOver={(e) => {
                  if (!draggingId) return;
                  e.preventDefault();
                  if (dropTarget !== stage.key) setDropTarget(stage.key);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget)) setDropTarget(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  handleDrop(stage.key);
                }}
              >
                <header className="pipeline-column-header">
                  <span className="pipeline-column-dot" aria-hidden="true" />
                  <h2>{stage.label}</h2>
                  <span className="pipeline-column-count num">
                    <AnimatedNumber value={cards.length} />
                  </span>
                </header>

                <div className="pipeline-column-body">
                  {cards.length === 0 ? (
                    <div className="pipeline-empty">{draggingId ? "Drop here" : "Empty"}</div>
                  ) : (
                    cards.map((app) => (
                      <PipelineCard
                        key={app.id}
                        application={app}
                        interview={interviewByApp.get(app.id)}
                        offer={offerByKey.get(`${app.studentId}:${app.jobId}`)}
                        showCompany={!isRecruiter}
                        canAssign={isRecruiter}
                        busy={busyIds.has(app.id)}
                        dragging={draggingId === app.id}
                        onAction={handleAction}
                        onDragStart={setDraggingId}
                        onDragEnd={() => {
                          setDraggingId(null);
                          setDropTarget(null);
                        }}
                      />
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {modal?.type === "interview" && (
        <ScheduleInterviewModal
          open
          application={modal.application}
          onClose={closeModal}
          onDone={() => afterModalSuccess("Interview scheduled")}
        />
      )}

      {modal?.type === "offer" && (
        <MakeOfferModal
          open
          application={modal.application}
          onClose={closeModal}
          onDone={() => afterModalSuccess("Offer sent to the candidate")}
        />
      )}

      <Modal
        open={modal?.type === "reject"}
        onClose={closeModal}
        title="Reject this candidate?"
        subtitle={modal?.application?.student?.user?.fullName}
        width={420}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={closeModal}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                const app = modal.application;
                setModal(null);
                changeStatus(app, "REJECTED");
              }}
            >
              Reject
            </button>
          </>
        }
      >
        <p className="modal-text">
          The application moves to Rejected and can't be returned to the active pipeline afterwards.
        </p>
      </Modal>
    </div>
  );
}

export default ApplicationsPipeline;
