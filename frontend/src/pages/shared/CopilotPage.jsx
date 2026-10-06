import { useEffect, useRef, useState } from "react";
import { api } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { ArrowUp, Database, MessageSquareText, RotateCcw, TriangleAlert } from "lucide-react";
import { formatTime } from "../../lib/format";
import { PageHeader, Spinner } from "../../components/ui";
import FormattedText from "../../components/common/FormattedText";

const SUGGESTIONS = {
  officer: [
    "Which skills have the largest campus shortage?",
    "Which department has the highest placement conversion?",
    "Which companies hired the most?",
    "Which applicants have the highest match scores?",
    "Which drives have scheduling conflicts?",
    "Give me a one-line summary of placements.",
  ],
  recruiter: [
    "Summarize my hiring funnel.",
    "Who are my strongest applicants by match score?",
    "What's my offer acceptance rate?",
    "Which skills do my open jobs need that campus supply is weakest in?",
  ],
};

const HEADLINE_LABELS = {
  registeredStudents: "Registered students",
  applicationsSubmitted: "Applications",
  applicationsShortlistedOrBeyond: "Shortlisted+",
  applicationsThatReachedInterview: "Interviewed",
  applicationsSelected: "Selected",
  offersMade: "Offers made",
  offersAccepted: "Offers accepted",
  offersWithStudentJoined: "Joined",
  collegePlacementRatePct: "Placement rate %",
};

let nextId = 1;

function FactsPanel({ facts }) {
  const headline = facts?.headline ?? {};
  return (
    <div className="copilot-facts">
      <div className="tag-list">
        {Object.entries(HEADLINE_LABELS)
          .filter(([key]) => headline[key] != null)
          .map(([key, label]) => (
            <span key={key} className="tag">
              {label} <strong className="num">{headline[key]}</strong>
            </span>
          ))}
      </div>
      <details>
        <summary>Raw data snapshot</summary>
        <pre className="code-block">{JSON.stringify(facts, null, 2)}</pre>
      </details>
    </div>
  );
}

function AssistantMessage({ message }) {
  const [showFacts, setShowFacts] = useState(false);

  return (
    <div className={`copilot-msg is-assistant ${message.source !== "llm" ? "is-muted" : ""}`}>
      <span className="copilot-avatar" aria-hidden="true">
        <MessageSquareText />
      </span>
      <div className="copilot-bubble">
        {message.error ? <p className="copilot-error">{message.error}</p> : <FormattedText text={message.text} />}

        {message.unverifiedNumbers?.length > 0 && (
          <div className="alert alert-warning copilot-warning">
            <TriangleAlert aria-hidden="true" />
            <div className="alert-body">
              Couldn't trace {message.unverifiedNumbers.join(", ")} back to platform data. Check{" "}
              {message.unverifiedNumbers.length === 1 ? "it" : "them"} before relying on{" "}
              {message.unverifiedNumbers.length === 1 ? "it" : "them"}.
            </div>
          </div>
        )}

        {!message.error && (
          <div className="copilot-meta">
            {message.source === "llm" && (
              <span className="copilot-source">
                <Database aria-hidden="true" />
                From live platform data
              </span>
            )}
            <span>{formatTime(message.at)}</span>
            {message.facts && (
              <button type="button" className="copilot-link" onClick={() => setShowFacts((v) => !v)} aria-expanded={showFacts}>
                {showFacts ? "Hide data used" : "Show data used"}
              </button>
            )}
          </div>
        )}

        {showFacts && message.facts && <FactsPanel facts={message.facts} />}
      </div>
    </div>
  );
}

function CopilotPage() {
  const { user } = useAuth();
  const audience = user?.role === "RECRUITER" ? "recruiter" : "officer";

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const endRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pending]);

  const ask = async (question) => {
    const trimmed = question.trim();
    if (trimmed.length < 3 || pending) return;

    setMessages((prev) => [...prev, { id: nextId++, role: "user", text: trimmed, at: new Date() }]);
    setInput("");
    setPending(true);

    try {
      const res = await api.post("/copilot/query", { question: trimmed });
      const data = res.data;
      setMessages((prev) => [
        ...prev,
        {
          id: nextId++,
          role: "assistant",
          text: data.answer,
          source: data.source,
          unverifiedNumbers: data.unverifiedNumbers ?? [],
          facts: data.facts,
          at: new Date(),
        },
      ]);
    } catch (err) {
      const retry = err.details?.retryAfterSeconds;
      setMessages((prev) => [
        ...prev,
        {
          id: nextId++,
          role: "assistant",
          error:
            err.code === "RATE_LIMITED"
              ? `Too many questions in a short time. Try again in ${retry ?? "a few"} seconds.`
              : err.message || "Something went wrong. Please try again.",
          at: new Date(),
        },
      ]);
    } finally {
      setPending(false);
      inputRef.current?.focus();
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      ask(input);
    }
  };

  return (
    <div className="page copilot-page">
      <PageHeader
        title="Ask Copilot"
        subtitle={
          audience === "recruiter"
            ? "Questions about your hiring, answered from your company's live data."
            : "Questions about placements, skills, companies and drives, answered from live campus data."
        }
        actions={
          messages.length > 0 && (
            <button type="button" className="btn btn-secondary" onClick={() => setMessages([])} disabled={pending}>
              <RotateCcw />
              New conversation
            </button>
          )
        }
      />

      <section className="card card-flush copilot-panel">
        <div className="copilot-thread" aria-live="polite">
          {messages.length === 0 && (
            <div className="copilot-empty">
              <h2>Try one of these</h2>
              <p>
                Each answer is built from a fresh snapshot of platform data. Figures that can't be traced back to it
                are flagged.
              </p>
              <div className="copilot-suggestions">
                {SUGGESTIONS[audience].map((s) => (
                  <button key={s} type="button" className="copilot-suggestion" onClick={() => ask(s)} disabled={pending}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="copilot-msg is-user">
                <div className="copilot-bubble">{m.text}</div>
              </div>
            ) : (
              <AssistantMessage key={m.id} message={m} />
            )
          )}

          {pending && (
            <div className="copilot-msg is-assistant">
              <span className="copilot-avatar" aria-hidden="true">
                <MessageSquareText />
              </span>
              <div className="copilot-bubble copilot-pending">
                <Spinner />
                Reading the latest data
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <form
          className="copilot-composer"
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
        >
          <textarea
            ref={inputRef}
            rows={1}
            maxLength={500}
            aria-label="Your question"
            placeholder="Ask a question about the data"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={pending}
          />
          <button
            type="submit"
            className="btn btn-primary btn-icon"
            disabled={pending || input.trim().length < 3}
            aria-label="Send question"
          >
            <ArrowUp />
          </button>
        </form>
        <p className="copilot-hint">Enter to send · Shift + Enter for a new line</p>
      </section>
    </div>
  );
}

export default CopilotPage;
