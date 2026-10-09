import { useState } from "react";
import { ClipboardCheck, CodeXml, Database, Plus, Trash2 } from "lucide-react";
import { api } from "../../services/api";
import { useToast } from "../../context/ToastContext";
import { Alert, PageHeader, Spinner } from "../../components/ui";

const TABS = [
  { id: "sql", label: "SQL Lab", icon: Database },
  { id: "coding", label: "Coding Lab", icon: CodeXml },
  { id: "assessment", label: "Assessment", icon: ClipboardCheck },
];

const EMPTY_SQL = { title: "", description: "", schemaSql: "", seedSql: "", solutionQuery: "", skillName: "" };
const EMPTY_CODE = {
  title: "",
  description: "",
  difficulty: "EASY",
  skillName: "",
  starterCode: "",
  visibleTests: [{ input: "", expectedOutput: "" }],
  hiddenTests: [{ input: "", expectedOutput: "" }],
};
const newQuestion = (type = "MCQ") => ({
  questionText: "",
  points: "1",
  options: type === "MCQ" ? ["", "", "", ""] : [],
  correctOptionIndex: 0,
  rubric: "",
  maxWords: "300",
});
const EMPTY_ASSESSMENT = {
  title: "",
  description: "",
  type: "MCQ",
  durationMinutes: "30",
  passScore: "60",
  skillName: "",
  questions: [newQuestion()],
};

function Field({ label, hint, className = "", children }) {
  return (
    <label className={`field ${className}`.trim()}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

function TestCases({ title, tests, onChange }) {
  const update = (index, key, value) =>
    onChange(tests.map((test, i) => (i === index ? { ...test, [key]: value } : test)));

  return (
    <section className="stack">
      <div className="card-header">
        <h3 className="card-title">{title}</h3>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onChange([...tests, { input: "", expectedOutput: "" }])}>
          <Plus /> Add test
        </button>
      </div>
      {tests.map((test, index) => (
        <div className="form-grid" key={`${title}-${index}`}>
          <Field label={`Test ${index + 1} input`}>
            <textarea className="input" value={test.input} onChange={(e) => update(index, "input", e.target.value)} rows={2} required />
          </Field>
          <Field label={`Test ${index + 1} expected output`}>
            <textarea className="input" value={test.expectedOutput} onChange={(e) => update(index, "expectedOutput", e.target.value)} rows={2} required />
          </Field>
          {tests.length > 1 && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => onChange(tests.filter((_, i) => i !== index))}
              aria-label={`Remove ${title.toLowerCase()} ${index + 1}`}
            >
              <Trash2 /> Remove test
            </button>
          )}
        </div>
      ))}
    </section>
  );
}

function LabManagement() {
  const toast = useToast();
  const [active, setActive] = useState("sql");
  const [sql, setSql] = useState(EMPTY_SQL);
  const [code, setCode] = useState(EMPTY_CODE);
  const [assessment, setAssessment] = useState(EMPTY_ASSESSMENT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const updateSql = (key, value) => setSql((prev) => ({ ...prev, [key]: value }));
  const updateCode = (key, value) => setCode((prev) => ({ ...prev, [key]: value }));
  const updateAssessment = (key, value) => setAssessment((prev) => ({ ...prev, [key]: value }));
  const updateQuestion = (index, key, value) =>
    updateAssessment(
      "questions",
      assessment.questions.map((question, i) => (i === index ? { ...question, [key]: value } : question))
    );

  const changeAssessmentType = (type) => {
    updateAssessment("type", type);
    updateAssessment("questions", assessment.questions.map(() => newQuestion(type)));
  };

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (active === "sql") {
        await api.post("/sql/problems", {
          title: sql.title.trim(),
          description: sql.description.trim(),
          schemaSql: sql.schemaSql.trim(),
          ...(sql.seedSql.trim() ? { seedSql: sql.seedSql.trim() } : {}),
          solutionQuery: sql.solutionQuery.trim(),
          ...(sql.skillName.trim() ? { skillName: sql.skillName.trim() } : {}),
        });
        setSql(EMPTY_SQL);
        toast.success("SQL Lab question created");
      } else if (active === "coding") {
        await api.post("/coding/problems", {
          title: code.title.trim(),
          description: code.description.trim(),
          difficulty: code.difficulty,
          ...(code.skillName.trim() ? { skillName: code.skillName.trim() } : {}),
          ...(code.starterCode.trim() ? { starterCode: { javascript: code.starterCode } } : {}),
          visibleTests: code.visibleTests,
          hiddenTests: code.hiddenTests,
        });
        setCode(EMPTY_CODE);
        toast.success("Coding Lab question created");
      } else {
        const questions = assessment.questions.map((question) => ({
          questionText: question.questionText.trim(),
          points: Number(question.points),
          ...(assessment.type === "MCQ"
            ? {
                options: question.options.map((option) => option.trim()),
                correctOptionIndex: Number(question.correctOptionIndex),
              }
            : {
                rubric: question.rubric.trim(),
                maxWords: Number(question.maxWords),
              }),
        }));
        await api.post("/assessments", {
          title: assessment.title.trim(),
          ...(assessment.description.trim() ? { description: assessment.description.trim() } : {}),
          type: assessment.type,
          durationMinutes: Number(assessment.durationMinutes),
          passScore: Number(assessment.passScore),
          ...(assessment.skillName.trim() ? { skillName: assessment.skillName.trim() } : {}),
          questions,
        });
        setAssessment(EMPTY_ASSESSMENT);
        toast.success("Assessment created");
      }
    } catch (err) {
      const first = err.details?.details?.[0];
      setError(first ? `${first.path}: ${first.message}` : err.message || "Could not create this item");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page page-wide">
      <PageHeader
        title="Lab & assessment creation"
        subtitle="Create questions for the shared SQL Lab, Coding Lab, or student assessments."
      />

      <div className="segmented" role="tablist" aria-label="Choose content type">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" role="tab" aria-selected={active === id} onClick={() => { setActive(id); setError(""); }}>
            <Icon aria-hidden="true" /> {label}
          </button>
        ))}
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      <section className="card stack">
        <div className="card-header">
          <div>
            <h2 className="card-title">Create {active === "assessment" ? "assessment" : `${active === "sql" ? "SQL" : "Coding"} Lab question`}</h2>
            <p className="card-subtitle">
              {active === "sql"
                ? "Define the problem tables and sample data, then provide the query whose output is the answer."
                : active === "coding"
                  ? "Add examples students can see and hidden test cases used to verify submissions."
                  : "Build a timed multiple-choice or written assessment. Written answers are scored by the AI service."}
            </p>
          </div>
        </div>

        <form className="stack" onSubmit={submit}>
          {active === "sql" && (
            <>
              <div className="form-grid">
                <Field label="Title">
                  <input className="input" value={sql.title} onChange={(e) => updateSql("title", e.target.value)} required />
                </Field>
                <Field label="Skill (optional)">
                  <input className="input" value={sql.skillName} onChange={(e) => updateSql("skillName", e.target.value)} placeholder="e.g. SQL" />
                </Field>
                <Field label="Problem description" className="span-all">
                  <textarea className="input" value={sql.description} onChange={(e) => updateSql("description", e.target.value)} rows={3} required />
                </Field>
                <Field label="Table schema SQL" hint="CREATE TABLE statements for this problem." className="span-all">
                  <textarea className="input code-input" value={sql.schemaSql} onChange={(e) => updateSql("schemaSql", e.target.value)} rows={5} required />
                </Field>
                <Field label="Sample data SQL (optional)" hint="INSERT statements that populate the problem tables." className="span-all">
                  <textarea className="input code-input" value={sql.seedSql} onChange={(e) => updateSql("seedSql", e.target.value)} rows={4} />
                </Field>
                <Field label="Expected solution query" hint="Students pass when their result matches this query's output." className="span-all">
                  <textarea className="input code-input" value={sql.solutionQuery} onChange={(e) => updateSql("solutionQuery", e.target.value)} rows={4} required />
                </Field>
              </div>
              <Alert tone="warning">SQL setup statements run with the application database owner account. Only submit reviewed, trusted schema and sample-data SQL.</Alert>
            </>
          )}

          {active === "coding" && (
            <>
              <div className="form-grid">
                <Field label="Title">
                  <input className="input" value={code.title} onChange={(e) => updateCode("title", e.target.value)} required />
                </Field>
                <Field label="Difficulty">
                  <select className="input" value={code.difficulty} onChange={(e) => updateCode("difficulty", e.target.value)}>
                    <option value="EASY">Easy</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HARD">Hard</option>
                  </select>
                </Field>
                <Field label="Skill (optional)">
                  <input className="input" value={code.skillName} onChange={(e) => updateCode("skillName", e.target.value)} placeholder="e.g. JavaScript" />
                </Field>
                <Field label="Starter JavaScript code (optional)" className="span-all">
                  <textarea className="input code-input" value={code.starterCode} onChange={(e) => updateCode("starterCode", e.target.value)} rows={4} />
                </Field>
                <Field label="Problem description" className="span-all">
                  <textarea className="input" value={code.description} onChange={(e) => updateCode("description", e.target.value)} rows={3} required />
                </Field>
              </div>
              <TestCases title="Visible examples" tests={code.visibleTests} onChange={(tests) => updateCode("visibleTests", tests)} />
              <TestCases title="Hidden grading tests" tests={code.hiddenTests} onChange={(tests) => updateCode("hiddenTests", tests)} />
            </>
          )}

          {active === "assessment" && (
            <>
              <div className="form-grid">
                <Field label="Assessment title">
                  <input className="input" value={assessment.title} onChange={(e) => updateAssessment("title", e.target.value)} required />
                </Field>
                <Field label="Question type">
                  <select className="input" value={assessment.type} onChange={(e) => changeAssessmentType(e.target.value)}>
                    <option value="MCQ">Multiple choice</option>
                    <option value="WRITTEN">Written response</option>
                  </select>
                </Field>
                <Field label="Duration (minutes)">
                  <input className="input" type="number" min="1" value={assessment.durationMinutes} onChange={(e) => updateAssessment("durationMinutes", e.target.value)} required />
                </Field>
                <Field label="Pass mark (%)">
                  <input className="input" type="number" min="0" max="100" value={assessment.passScore} onChange={(e) => updateAssessment("passScore", e.target.value)} required />
                </Field>
                <Field label="Skill (optional)">
                  <input className="input" value={assessment.skillName} onChange={(e) => updateAssessment("skillName", e.target.value)} placeholder="e.g. SQL" />
                </Field>
                <Field label="Description (optional)" className="span-all">
                  <textarea className="input" value={assessment.description} onChange={(e) => updateAssessment("description", e.target.value)} rows={2} />
                </Field>
              </div>

              {assessment.questions.map((question, index) => (
                <section className="card card-flush stack" key={`question-${index}`}>
                  <div className="card-header">
                    <h3 className="card-title">Question {index + 1}</h3>
                    {assessment.questions.length > 1 && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => updateAssessment("questions", assessment.questions.filter((_, i) => i !== index))}
                      >
                        <Trash2 /> Remove
                      </button>
                    )}
                  </div>
                  <div className="form-grid">
                    <Field label="Question text" className="span-all">
                      <textarea className="input" value={question.questionText} onChange={(e) => updateQuestion(index, "questionText", e.target.value)} rows={2} required />
                    </Field>
                    <Field label="Points">
                      <input className="input" type="number" min="1" value={question.points} onChange={(e) => updateQuestion(index, "points", e.target.value)} required />
                    </Field>
                    {assessment.type === "MCQ" ? (
                      <>
                        <Field label="Correct option">
                          <select className="input" value={question.correctOptionIndex} onChange={(e) => updateQuestion(index, "correctOptionIndex", Number(e.target.value))}>
                            {question.options.map((_, optionIndex) => <option key={optionIndex} value={optionIndex}>Option {optionIndex + 1}</option>)}
                          </select>
                        </Field>
                        {question.options.map((option, optionIndex) => (
                          <Field key={optionIndex} label={`Option ${optionIndex + 1}`}>
                            <input
                              className="input"
                              value={option}
                              onChange={(e) => updateQuestion(index, "options", question.options.map((item, i) => i === optionIndex ? e.target.value : item))}
                              required
                            />
                          </Field>
                        ))}
                        {question.options.length < 6 && (
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => updateQuestion(index, "options", [...question.options, ""])}>
                            <Plus /> Add option
                          </button>
                        )}
                        {question.options.length > 2 && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => {
                              const options = question.options.slice(0, -1);
                              updateAssessment(
                                "questions",
                                assessment.questions.map((item, i) =>
                                  i === index
                                    ? {
                                        ...item,
                                        options,
                                        correctOptionIndex: Math.min(item.correctOptionIndex, options.length - 1),
                                      }
                                    : item
                                )
                              );
                            }}
                          >
                            <Trash2 /> Remove last option
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        <Field label="Scoring rubric" className="span-all">
                          <textarea className="input" value={question.rubric} onChange={(e) => updateQuestion(index, "rubric", e.target.value)} rows={3} required />
                        </Field>
                        <Field label="Maximum answer words">
                          <input className="input" type="number" min="20" max="2000" value={question.maxWords} onChange={(e) => updateQuestion(index, "maxWords", e.target.value)} required />
                        </Field>
                      </>
                    )}
                  </div>
                </section>
              ))}
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => updateAssessment("questions", [...assessment.questions, newQuestion(assessment.type)])}>
                <Plus /> Add question
              </button>
            </>
          )}

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? <Spinner /> : <Plus />}
              Create {active === "assessment" ? "assessment" : "question"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default LabManagement;
