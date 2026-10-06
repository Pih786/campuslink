// Client for the SEPARATE predictive placement-likelihood model (POST
// /ml/... on the AI service). Deliberately does not share code with
// ai-client.ts's aiMatch(): that's the rule + LLM hybrid matching engine and
// stays untouched. This is an independent, additive signal -- if the AI
// service or the trained model is unavailable, everything here resolves to
// "unavailable" rather than throwing, so nothing that depends on it can break.
import { env } from "../config/env";

const TIMEOUT_MS = 4000;

async function postJson<T>(path: string, body: unknown): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${env.AI_SERVICE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function getJson<T>(path: string): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${env.AI_SERVICE_URL}${path}`, { signal: controller.signal });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export interface MlSkill {
  name: string;
  proficiency: number;
  verified: boolean;
}

export interface MlStudent {
  cgpa: number;
  skills: MlSkill[];
  projects: { title: string; technologies: string[] }[];
  certifications: { name: string; verified: boolean }[];
  experienceMonths: number;
}

export interface MlRequirement {
  type: string;
  skillName?: string;
  minimumProficiency?: number;
  value?: number;
}

export interface MlJob {
  requirements: MlRequirement[];
}

interface PlacementLikelihoodResponse {
  available: boolean;
  probability: number | null;
}

export interface PlacementLikelihood {
  available: boolean;
  probability: number | null;
}

// Never throws; returns { available: false, probability: null } if the AI
// service, or the trained model specifically, isn't reachable/ready.
export async function predictPlacementLikelihood(student: MlStudent, job: MlJob): Promise<PlacementLikelihood> {
  const result = await postJson<PlacementLikelihoodResponse>("/ml/placement-likelihood", { student, job });
  return result ?? { available: false, probability: null };
}

export interface MlModelInfo {
  available: boolean;
  featureImportance?: { feature: string; coefficient: number }[];
  trainedOn?: { seasons: number; studentsPerSeason: number; eligiblePairs: number; hireRate: number };
  evaluatedOn?: { seasons: number; eligiblePairs: number; hireRate: number };
  metrics?: Record<string, { auc: number; precisionAt10: number }>;
  notes?: string;
}

export async function getMlModelInfo(): Promise<MlModelInfo> {
  const result = await getJson<MlModelInfo>("/ml/model-info");
  return result ?? { available: false };
}
