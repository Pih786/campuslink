import { CircleCheck, CircleX } from "lucide-react";

// cases: [{ input, expectedOutput, actualOutput?, stderr?, passed? }]
function TestCaseList({ cases }) {
  return (
    <ol className="test-cases">
      {cases.map((c, i) => {
        const judged = typeof c.passed === "boolean";
        return (
          <li key={i} className={`test-case ${judged ? (c.passed ? "is-pass" : "is-fail") : ""}`}>
            <div className="test-case-head">
              {judged && (c.passed ? <CircleCheck aria-hidden="true" /> : <CircleX aria-hidden="true" />)}
              <span>Case {i + 1}</span>
              {judged && <span className="test-case-verdict">{c.passed ? "Passed" : "Failed"}</span>}
            </div>
            <dl className="test-case-io">
              <div>
                <dt>Input</dt>
                <dd>
                  <pre>{c.input || " "}</pre>
                </dd>
              </div>
              <div>
                <dt>Expected</dt>
                <dd>
                  <pre>{c.expectedOutput || " "}</pre>
                </dd>
              </div>
              {c.actualOutput !== undefined && (
                <div>
                  <dt>Your output</dt>
                  <dd>
                    <pre>{c.actualOutput || " "}</pre>
                  </dd>
                </div>
              )}
              {c.stderr && (
                <div className="test-case-stderr">
                  <dt>Error</dt>
                  <dd>
                    <pre>{c.stderr}</pre>
                  </dd>
                </div>
              )}
            </dl>
          </li>
        );
      })}
    </ol>
  );
}

export default TestCaseList;
