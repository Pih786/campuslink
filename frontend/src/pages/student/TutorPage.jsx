import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowUp, BookOpen, ExternalLink, RotateCcw, Sparkles } from "lucide-react";
import { api } from "../../services/api";
import { formatTime } from "../../lib/format";
import { PageHeader, Spinner } from "../../components/ui";
import FormattedText from "../../components/common/FormattedText";

let nextId = 1;

const STARTERS = [
  "Explain {skill} like I'm new to it, with a small example.",
  "What {skill} questions come up in campus interviews?",
  "Give me a 2-week plan to get job-ready in {skill}.",
  "Quiz me with 3 short questions on {skill}.",
];

const GENERAL_STARTERS = [
  "How do I explain a project well in an interview?",
  "What's the difference between SQL joins, with an example?",
  "How should I prepare for an online coding assessment?",
  "Explain time complexity with simple examples.",
];

function TutorMessage({ message }) {
  return (
    <div className={`copilot-msg is-assistant ${message.source === "unavailable" ? "is-muted" : ""}`}>
      <span className="copilot-avatar" aria-hidden="true">
        <Sparkles />
      </span>
      <div className="copilot-bubble">
        {message.error ? <p className="copilot-error">{message.error}</p> : <FormattedText text={message.text} />}
        {message.cited?.length > 0 && (
          <div className="tutor-cited">
            <span>From the library</span>
            <ul>
              {message.cited.map((r) => (
                <li key={r.id}>
                  <a href={r.url} target="_blank" rel="noreferrer">
                    <BookOpen aria-hidden="true" />
                    {r.title}
                    <ExternalLink aria-hidden="true" className="icon-trailing" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
        {!message.error && (
          <div className="copilot-meta">
            <span>{formatTime(message.at)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Swaps "[R2]" markers for the resource title so the answer reads naturally.
function resolveRefs(text, references) {
  const byRef = new Map((references ?? []).map((r) => [r.ref, r.title]));
  return text.replace(/\[(R\d+)\]/g, (match, ref) => (byRef.has(ref) ? `“${byRef.get(ref)}”` : ""));
}

function TutorPage() {
  const [params, setParams] = useSearchParams();
  const skill = params.get("skill") ?? "";
  const [skills, setSkills] = useState([]);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const endRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    api
      .get("/learning/plan")
      .then((res) => setSkills(res.data.skills.map((s) => s.name)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pending]);

  const chooseSkill = (value) => {
    setParams(value ? { skill: value } : {}, { replace: true });
    setMessages([]);
  };

  const ask = async (question) => {
    const trimmed = question.trim();
    if (trimmed.length < 2 || pending) return;
    const history = messages
      .filter((m) => !m.error)
      .map((m) => ({ role: m.role, content: m.text }))
      .slice(-8);

    setMessages((prev) => [...prev, { id: nextId++, role: "user", text: trimmed, at: new Date() }]);
    setInput("");
    setPending(true);
    try {
      const res = await api.post("/learning/tutor", { question: trimmed, ...(skill ? { skill } : {}), history });
      const data = res.data;
      setMessages((prev) => [
        ...prev,
        {
          id: nextId++,
          role: "assistant",
          text: resolveRefs(data.answer, data.references),
          source: data.source,
          cited: data.cited,
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
              ? `You've asked a lot in a short time. Try again in ${retry ?? "a few"} seconds.`
              : err.message || "Something went wrong. Please try again.",
          at: new Date(),
        },
      ]);
    } finally {
      setPending(false);
      inputRef.current?.focus();
    }
  };

  const starters = skill ? STARTERS.map((s) => s.replaceAll("{skill}", skill)) : GENERAL_STARTERS;
  const skillOptions = skill && !skills.includes(skill) ? [skill, ...skills] : skills;

  return (
    <div className="page copilot-page">
      <PageHeader
        title="AI tutor"
        subtitle="Ask about any topic you're preparing. Answers point to material from the CampusLink library."
        actions={
          <>
            <select
              className="tutor-skill"
              value={skill}
              onChange={(e) => chooseSkill(e.target.value)}
              aria-label="Topic"
            >
              <option value="">Any topic</option>
              {skillOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            {messages.length > 0 && (
              <button type="button" className="btn btn-secondary" onClick={() => setMessages([])} disabled={pending}>
                <RotateCcw />
                New chat
              </button>
            )}
          </>
        }
      />

      <section className="card card-flush copilot-panel">
        <div className="copilot-thread" aria-live="polite">
          {messages.length === 0 && (
            <div className="copilot-empty">
              <h2>{skill ? `Let's work on ${skill}` : "What do you want to learn?"}</h2>
              <p>
                The tutor explains concepts and approaches. For company assignments it helps with the thinking, not
                the finished answer.
              </p>
              <div className="copilot-suggestions">
                {starters.map((s) => (
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
              <TutorMessage key={m.id} message={m} />
            )
          )}

          {pending && (
            <div className="copilot-msg is-assistant">
              <span className="copilot-avatar" aria-hidden="true">
                <Sparkles />
              </span>
              <div className="copilot-bubble copilot-pending">
                <Spinner />
                Thinking
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
            maxLength={1500}
            aria-label="Your question"
            placeholder={skill ? `Ask anything about ${skill}` : "Ask a question"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask(input);
              }
            }}
            disabled={pending}
          />
          <button type="submit" className="btn btn-primary btn-icon" disabled={pending || input.trim().length < 2} aria-label="Send question">
            <ArrowUp />
          </button>
        </form>
        <p className="copilot-hint">Enter to send · Shift + Enter for a new line</p>
      </section>
    </div>
  );
}

export default TutorPage;
