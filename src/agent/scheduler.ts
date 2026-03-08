/**
 * scheduler.ts
 * Orchestrates the agent's weekly workload in priority order.
 *
 * Run via:
 *   bun run src/main.ts --weekly
 *   bun run src/main.ts --weekly --tasks content_piece_1 feature_requests
 *   bun run src/main.ts --weekly --report-only --week 2025-01-20
 */

import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { runAgent } from "./agent";
import { WEEKLY_KPIS } from "./config";

// ── Task definitions ──────────────────────────────────────────────────────────

interface WeeklyTask {
  name: string;
  priority: number;
  prompt: string;
}

const WEEKLY_TASKS: WeeklyTask[] = [
  {
    name: "community_listening",
    priority: 1,
    prompt:
      "Use web_search to find the top 5 developer pain points about RevenueCat this week " +
      "(search GitHub issues, Stack Overflow, Twitter/X, and Discord). " +
      "Summarise each pain point and note its frequency. Do not file feature requests yet — just research.",
  },
  {
    name: "content_piece_1",
    priority: 2,
    prompt:
      "Based on what you found from community listening, write a deep-dive technical blog post " +
      "(800–1200 words, Markdown) solving the #1 developer pain point. Include working code examples. " +
      "Save it using write_technical_content with content_type='blog_post'. Set publish=false.",
  },
  {
    name: "content_piece_2",
    priority: 3,
    prompt:
      "Write a short, practical code sample or tutorial (300–600 words) addressing a RevenueCat SDK " +
      "usage question that appeared 3+ times in community channels. " +
      "Save it using write_technical_content with content_type='code_sample'. " +
      "Include a short Twitter/X thread version as well.",
  },
  {
    name: "community_interactions",
    priority: 4,
    prompt:
      `Log ${WEEKLY_KPIS.communityInteractions} community interactions this week. ` +
      "For each interaction: use web_search to find real unanswered questions on GitHub, Discord, or " +
      "Twitter/X about RevenueCat or in-app subscriptions. Draft a helpful, technically accurate reply " +
      "(with code if needed). Log each one using log_community_interaction. " +
      "Aim for at least 20 on GitHub, 20 on Discord, 10 on Twitter/X.",
  },
  {
    name: "feature_requests",
    priority: 5,
    prompt:
      `File ${WEEKLY_KPIS.featureRequests} structured feature requests with RevenueCat. ` +
      "Base each one on recurring developer pain points from community listening. " +
      "Each request must have a clear problem_statement, proposed_solution, and at least 2 evidence URLs. " +
      "Use file_feature_request for each.",
  },
  {
    name: "growth_experiment",
    priority: 6,
    prompt:
      "Design one growth experiment for this week. Options: a programmatic SEO page targeting a " +
      "high-intent search query, a social media campaign around a trending mobile dev topic, or a " +
      "documentation improvement for a high-traffic but confusing page. " +
      "Use run_growth_experiment to log the hypothesis, execution plan, and success metric.",
  },
  {
    name: "api_research",
    priority: 7,
    prompt:
      "Use call_revenuecat_api to fetch your project's current offerings list " +
      "(GET /projects/{project_id}/offerings). " +
      "Note any gaps or UX issues you observe in the response structure.",
  },
  {
    name: "weekly_report",
    priority: 8,
    prompt:
      "Generate a weekly report using generate_weekly_report for this week. " +
      "After generating it, write a concise human-readable summary: " +
      "1. KPIs hit vs missed, " +
      "2. Most impactful content piece, " +
      "3. Top community signal / developer pain point, " +
      "4. One recommendation for next week. " +
      "Format it as a brief memo for the human operator.",
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function currentMonday(): string {
  const today = new Date();
  const day = today.getDay(); // 0=Sun, 1=Mon ...
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diff);
  return monday.toISOString().slice(0, 10);
}

// ── Main scheduler ────────────────────────────────────────────────────────────

export interface SchedulerOptions {
  weekStart?: string | undefined;
  tasksToRun?: string[] | undefined;
  reportOnly?: boolean | undefined;
  maxIterations?: number | undefined;
}

export async function runWeeklyTasks(opts: SchedulerOptions = {}): Promise<Record<string, string>> {
  const weekStart = opts.weekStart ?? currentMonday();

  console.log("=".repeat(60));
  console.log(`Weekly run starting | week: ${weekStart}`);
  console.log("=".repeat(60));

  let tasks = [...WEEKLY_TASKS].sort((a, b) => a.priority - b.priority);

  if (opts.tasksToRun && opts.tasksToRun.length > 0) {
    tasks = tasks.filter((t) => opts.tasksToRun!.includes(t.name));
  }

  if (opts.reportOnly) {
    tasks = tasks.filter((t) => t.name === "weekly_report");
  }

  const results: Record<string, string> = {};
  let conversation: ChatCompletionMessageParam[] = [];

  for (const task of tasks) {
    console.log(`\n── Running task: ${task.name} ──`);

    const prompt = task.prompt.replace("{project_id}", process.env.REVENUECAT_PROJECT_ID ?? "YOUR_PROJECT_ID");

    const result = await runAgent(prompt, conversation, opts.maxIterations ?? 12);

    results[task.name] = result.response;
    conversation = result.messages; // carry forward full context

    console.log(`\n${"=".repeat(50)}`);
    console.log(`TASK: ${task.name} | Tool calls: ${result.toolCallsMade}`);
    console.log("=".repeat(50));
    console.log(result.response);
  }

  console.log(`\nWeekly run complete. Tasks run: ${Object.keys(results).length}`);
  return results;
}
