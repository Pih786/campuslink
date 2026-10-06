import { env } from "../config/env";

const LANGUAGE_IDS: Record<string, number> = {
  javascript: 63, // Node.js
  python: 71, // Python 3
  java: 62, // OpenJDK
  cpp: 54, // GCC C++
};

export function isSupportedLanguage(language: string): boolean {
  return language in LANGUAGE_IDS;
}

export interface Judge0Result {
  passed: boolean;
  stdout: string;
  stderr: string;
  statusDescription: string;
  timedOut: boolean;
}

interface RunOptions {
  language: string;
  code: string;
  stdin: string;
  expectedOutput: string;
}

// Runs one submission against Judge0's public CE instance, passing
// expected_output so Judge0 itself does the trimmed stdout comparison
// (status "Accepted" = 3 means it matched).
export async function runOnJudge0(opts: RunOptions): Promise<Judge0Result> {
  const languageId = LANGUAGE_IDS[opts.language];
  if (!languageId) {
    throw new Error(`Unsupported language: ${opts.language}`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const res = await fetch(
      `${env.JUDGE0_URL}/submissions?base64_encoded=false&wait=true`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          source_code: opts.code,
          language_id: languageId,
          stdin: opts.stdin,
          expected_output: opts.expectedOutput,
          cpu_time_limit: 5,
        }),
      }
    );

    if (!res.ok) {
      return {
        passed: false,
        stdout: "",
        stderr: `Judge0 request failed with status ${res.status}`,
        statusDescription: "Judge Error",
        timedOut: false,
      };
    }

    const data = (await res.json()) as {
      stdout: string | null;
      stderr: string | null;
      compile_output: string | null;
      status: { id: number; description: string };
    };

    return {
      passed: data.status.id === 3, // 3 = Accepted (matches expected_output)
      stdout: data.stdout ?? "",
      stderr: data.stderr || data.compile_output || "",
      statusDescription: data.status.description,
      timedOut: data.status.id === 5, // 5 = Time Limit Exceeded
    };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      passed: false,
      stdout: "",
      stderr: aborted ? "Judge0 request timed out" : "Could not reach Judge0",
      statusDescription: aborted ? "Timeout" : "Judge Error",
      timedOut: aborted,
    };
  } finally {
    clearTimeout(timeout);
  }
}
