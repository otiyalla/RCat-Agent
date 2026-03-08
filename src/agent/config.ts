/**
 * config.ts
 * All configuration loaded from environment variables.
 * Human operator: set OPERATOR_NAME in your .env file.
 */

export const AGENT_NAME = "RCat";
export const AGENT_VERSION = "1.0.0";
export const AGENT_DESCRIPTION =
  "Agentic AI Developer Advocate for RevenueCat. " +
  "Writes technical content, engages with the developer community, " +
  "runs growth experiments, and surfaces product feedback.";

// ── Operator ────────────────────────────────────────────────────────────────
export const OPERATOR_NAME = process.env.OPERATOR_NAME ?? "[OPERATOR_PLACEHOLDER]";
export const OPERATOR_EMAIL = process.env.OPERATOR_EMAIL ?? "operator@example.com";

// ── OpenAI ───────────────────────────────────────────────────────────────────
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
export const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o";

// ── RevenueCat ────────────────────────────────────────────────────────────────
export const REVENUECAT_API_KEY = process.env.REVENUECAT_API_KEY ?? "";
export const REVENUECAT_PROJECT_ID = process.env.REVENUECAT_PROJECT_ID ?? "";
export const REVENUECAT_API_BASE = "https://api.revenuecat.com/v1";

// ── Optional integrations ─────────────────────────────────────────────────────
export const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
export const TWITTER_BEARER_TOKEN = process.env.TWITTER_BEARER_TOKEN;
export const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

// ── Behaviour ─────────────────────────────────────────────────────────────────
export const DRY_RUN = (process.env.DRY_RUN ?? "true").toLowerCase() !== "false";
export const DATA_DIR = process.env.AGENT_DATA_DIR ?? "./data";

// ── Weekly KPI targets (from job description) ─────────────────────────────────
export interface WeeklyKPIs {
  contentPieces: number;
  communityInteractions: number;
  featureRequests: number;
  growthExperiments: number;
}

export const WEEKLY_KPIS: WeeklyKPIs = {
  contentPieces: 2,
  communityInteractions: 50,
  featureRequests: 3,
  growthExperiments: 1,
};
