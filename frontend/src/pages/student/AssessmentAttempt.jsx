import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CircleCheck, CircleX, Timer } from "lucide-react";
import { api } from "../../services/api";
import Modal from "../../components/common/Modal";
import { Alert, Badge, PageHeader, PageSkeleton, Spinner } from "../../components/ui";

const LOW_TIME_SECONDS = 60;
const CRITERIA = ["clarity", "structure", "grammar", "relevance"];

const wordCount = (text) => (text ?? "").trim().split(/s+/).filter(Boolean).length;

function isAnswered(q, value) {
  return typeof value === "string" ? value.trim().length > 0 : value !== undefined;
}

// Per-question scores and feedback for a written assessment.
function WrittenFeedback({ questions, feedback }) {
  const byId = new Map((feedback?.results ?? []).map((r) => [r.id, r]));
  return (
    <section className="card">
      <div className="card-header">
        <div>
          <h2 className="card-title">Feedback on your answers</h2>
          <p className="card-subtitle">Each answer is scored 0-10 on clarity, structure, grammar and relevance.</p>
        </div>
      </div>
      <div className="written-feedback">
        {questions.map((q, i) => {
          const r = byId.get(q.id);
          if (!r) return null;
          return (
            <div key={q.id} className="written-feedback-item">
              <div className="row-tight">
                <strong>Question {i + 1}</strong>
                <span className="num muted">
                  {r.score} / {q.points}
                </span>
              </div>
              <div className="written-criteria">
                {CRITERIA.map((c) => (
                  <Badge key={c} tone={r[c] >= 7 ? "success" : r[c] >= 5 ? "warning" : "danger"}>
                    {c[0].toUpperCase() + c.slice(1)} <span className="num">{r[c]}</span>
                  </Badge>
                ))}
              </div>
              {r.feedback && <p className="muted">{r.feedback}</p>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function formatClock(totalSeconds) {
  const safe = Math.max(0, totalSeconds);
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function AssessmentAttempt() {
  const { assessmentId } = useParams();

  const [attempt, setAttempt] = useState(null);
  const [assessment, setAssessment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [answers, setAnswers] = useState({});
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const submittedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const attemptRes = await api.post(`/assessments/${assessmentId}/attempts`);
        if (cancelled) return;
        setAttempt(attemptRes.data);
        setSecondsLeft((attemptRes.data.durationMinutes ?? 0) * 60);

        const assessmentRes = await api.get(`/assessments/${assessmentId}`);
        if (cancelled) return;
        setAssessment(assessmentRes.data);
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not start the assessment");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    start();
    return () => {
      cancelled = true;
    };
  }, [assessmentId]);

  const handleSubmit = async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setConfirmOpen(false);
    setSubmitting(true);
    setError("");

    try {
      const res = await api.post(`/assessments/${assessmentId}/attempts/${attempt.attemptId}/submit`, { answers });
      setResult(res.data);
    } catch (err) {
      // SCORING_UNAVAILABLE: the attempt is still open, so answers are kept
      // and the student can submit again.
      setError(
        err.code === "SCORING_UNAVAILABLE" || err.details?.code === "SCORING_UNAVAILABLE"
          ? "Your answers couldn't be scored right now. They're still here: please submit again in a minute."
          : err.message || "Could not submit the assessment"
      );
      submittedRef.current = false;
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (!attempt || result) return undefined;

    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, result]);

  if (loading) return <PageSkeleton cards={3} />;

  if (!assessment) {
    return (
      <div className="page">
        <PageHeader title="Assessment" back={{ to: "/student/assessments", label: "All assessments" }} />
        <Alert tone="error">{error || "Assessment not found"}</Alert>
      </div>
    );
  }

  const questions = assessment.questions ?? [];
  const written = assessment.type === "WRITTEN";
  const answeredCount = questions.filter((q) => isAnswered(q, answers[q.id])).length;

  if (result) {
    const pct = result.totalPoints ? Math.round((result.score / result.totalPoints) * 100) : 0;
    const provisional = result.feedback?.source === "heuristic";
    return (
      <div className="page">
        <PageHeader title={assessment.title} back={{ to: "/student/assessments", label: "All assessments" }} />

        <section className={`card result-card ${result.passed ? "is-pass" : "is-fail"}`}>
          <span className="result-card-icon">{result.passed ? <CircleCheck /> : <CircleX />}</span>
          <h2>{result.passed ? "Passed" : "Not passed this time"}</h2>
          <p className="result-card-score num">
            {result.score} <span>/ {result.totalPoints}</span>
          </p>
          <div className={`progress ${result.passed ? "progress-success" : ""}`}>
            <span style={{ width: `${pct}%` }} />
          </div>
          <p className="result-card-note">
            {result.skillVerified
              ? "Verified evidence for this skill was added to your skill passport."
              : result.passed && provisional
                ? "Provisional pass: the AI reviewer was unavailable, so an automatic check scored this. It won't verify the skill; take it again later for a full review."
                : result.passed
                  ? "Passed."
                  : `The pass mark is ${assessment.passScore}%. Review the topic and try again.`}
          </p>
          <div className="row">
            <Link className="btn btn-secondary" to="/student/assessments">
              Back to assessments
            </Link>
            {result.skillVerified && (
              <Link className="btn btn-primary" to="/student/skill-passport">
                View skill passport
              </Link>
            )}
          </div>
        </section>

        {written && result.feedback && <WrittenFeedback questions={questions} feedback={result.feedback} />}
      </div>
    );
  }

  const lowTime = secondsLeft <= LOW_TIME_SECONDS;

  return (
    <div className="page assessment-page">
      <PageHeader
        title={assessment.title}
        subtitle={
          written
            ? "Write your answers in full sentences. They're scored for clarity, structure, grammar and relevance."
            : "Choose one answer per question. You can change answers until you submit."
        }
      />

      <div className={`exam-bar ${lowTime ? "is-low" : ""}`}>
        <span className="exam-bar-timer num" aria-live={lowTime ? "polite" : "off"}>
          <Timer aria-hidden="true" />
          {formatClock(secondsLeft)}
        </span>
        <div className="exam-bar-progress">
          <span>
            {answeredCount} of {questions.length} answered
          </span>
          <div className="progress">
            <span style={{ width: `${questions.length ? (answeredCount / questions.length) * 100 : 0}%` }} />
          </div>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => (answeredCount < questions.length ? setConfirmOpen(true) : handleSubmit())}
          disabled={submitting}
        >
          {submitting && <Spinner />}
          Submit
        </button>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {questions.map((q, qi) => (
        <fieldset key={q.id} className="card question">
          <legend className="question-legend">
            <span className="question-num">Question {qi + 1}</span>
            {q.questionText}
          </legend>
          {written ? (
            <div className="written-answer">
              <textarea
                aria-label={`Answer to question ${qi + 1}`}
                rows={7}
                maxLength={8000}
                value={answers[q.id] ?? ""}
                onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                placeholder="Your answer"
              />
              <span className={`word-count ${q.maxWords && wordCount(answers[q.id]) > q.maxWords ? "is-over" : ""}`}>
                {wordCount(answers[q.id])}
                {q.maxWords ? ` / ${q.maxWords} words` : " words"}
              </span>
            </div>
          ) : (
          <div className="options">
            {q.options.map((opt, idx) => (
              <label key={idx} className={`option ${answers[q.id] === idx ? "is-selected" : ""}`}>
                <input
                  type="radio"
                  name={`question-${q.id}`}
                  checked={answers[q.id] === idx}
                  onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: idx }))}
                />
                <span className="option-key">{String.fromCharCode(65 + idx)}</span>
                <span>{opt}</span>
              </label>
            ))}
          </div>
          )}
        </fieldset>
      ))}

      <div className="form-actions">
        <button
          type="button"
          className="btn btn-primary btn-lg"
          onClick={() => (answeredCount < questions.length ? setConfirmOpen(true) : handleSubmit())}
          disabled={submitting}
        >
          {submitting && <Spinner />}
          Submit assessment
        </button>
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Submit with unanswered questions?"
        subtitle={`${questions.length - answeredCount} of ${questions.length} still unanswered`}
        width={440}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmOpen(false)}>
              Keep answering
            </button>
            <button type="button" className="btn btn-primary" onClick={handleSubmit}>
              Submit anyway
            </button>
          </>
        }
      >
        <p className="modal-text">Unanswered questions score zero. You can't change answers after submitting.</p>
      </Modal>
    </div>
  );
}

export default AssessmentAttempt;
