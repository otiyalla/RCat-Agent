#!/usr/bin/env bun
/**
 * main.ts — RevenueCat Agentic AI Developer Advocate CLI
 *
 * Agent commands:
 *   bun run src/main.ts --task "Write a tutorial on RevenueCat webhooks"
 *   bun run src/main.ts --weekly
 *   bun run src/main.ts --weekly --tasks content_piece_1 feature_requests
 *   bun run src/main.ts --weekly --report-only --week 2025-01-20
 *
 * Publish commands (operator, after review):
 *   bun run src/main.ts --publish --list              # list all pending drafts
 *   bun run src/main.ts --publish --list --all        # list all drafts (inc. published)
 *   bun run src/main.ts --publish --list --verbose    # list with full body previews
 *   bun run src/main.ts --publish --id <id>           # publish one draft by ID
 *   bun run src/main.ts --publish --all               # publish all pending drafts
 */

import { runAgent } from "./agent/agent";
import { runWeeklyTasks } from "./agent/scheduler";
import { OPENAI_API_KEY } from "./agent/config";
import {
  listUnpublished,
  listAll,
  findById,
  publishOne,
  publishAll,
  printRecord,
  printResults,
} from "./agent/publisher";

// ── Env check ─────────────────────────────────────────────────────────────────

function checkEnv(): boolean {
  if (!OPENAI_API_KEY) {
    console.error("❌ Missing OPENAI_API_KEY. Copy .env.example → .env and fill it in.");
    return false;
  }
  return true;
}

// ── Arg parser ────────────────────────────────────────────────────────────────

interface Args {
  // Agent modes
  task?: string | undefined;
  weekly: boolean;
  week?: string | undefined;
  tasks?: string[] | undefined;
  reportOnly: boolean;
  maxIter: number;

  // Publish mode
  publish: boolean;
  publishId?: string | undefined;
  publishAll: boolean;
  list: boolean;
  listAll: boolean;
  verbose: boolean;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const args: Args = {
    weekly: false,
    reportOnly: false,
    maxIter: 10,
    publish: false,
    publishAll: false,
    list: false,
    listAll: false,
    verbose: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    switch (flag) {
      // Agent flags
      case "--task": args.task = argv[++i]; break;
      case "--weekly": args.weekly = true; break;
      case "--week": args.week = argv[++i]; break;
      case "--report-only": args.reportOnly = true; break;
      case "--max-iter": args.maxIter = parseInt(argv[++i] ?? "10", 10); break;
      case "--tasks":
        args.tasks = [];
        while (argv[i + 1] && !argv[i + 1]!.startsWith("--")) {
          args.tasks.push(argv[++i]!);
        }
        break;

      // Publish flags
      case "--publish": args.publish = true; break;
      case "--id": args.publishId = argv[++i]; break;
      case "--all": args.publishAll = true; break;
      case "--list": args.list = true; break;
      case "--verbose": args.verbose = true; break;
    }
  }
  return args;
}

// ── Publish command ───────────────────────────────────────────────────────────

async function runPublish(args: Args): Promise<void> {
  // --publish --list  →  show pending (or all) drafts
  if (args.list) {
    const records = args.listAll ? listAll() : listUnpublished();

    if (records.length === 0) {
      console.log(args.listAll
        ? "\nNo content records found. Run --weekly to generate drafts."
        : "\nNo pending drafts. Everything has been published (or no content generated yet)."
      );
      return;
    }

    const label = args.listAll ? "ALL CONTENT" : "PENDING DRAFTS";
    console.log(`\n${"=".repeat(60)}`);
    console.log(`${label} (${records.length})`);
    console.log("=".repeat(60));
    console.log("  Use --id <id> to publish a specific draft, or --all to publish everything.\n");

    for (const r of records) printRecord(r, args.verbose);
    console.log();
    return;
  }

  // --publish --id <id>  →  publish one specific draft
  if (args.publishId) {
    const record = findById(args.publishId);
    if (!record) {
      console.error(`❌ No draft found with ID starting: ${args.publishId}`);
      process.exit(1);
    }

    console.log(`\nPublishing: "${record.title}" [${record.content_type}]...`);
    const result = await publishOne(args.publishId);
    printResults([result]);
    process.exit(result.success || result.skipped ? 0 : 1);
  }

  // --publish --all  →  publish every pending draft
  if (args.publishAll) {
    const pending = listUnpublished();
    if (pending.length === 0) {
      console.log("\nNothing to publish — no pending drafts found.");
      return;
    }

    console.log(`\nPublishing ${pending.length} pending draft(s)...\n`);
    const results = await publishAll();
    printResults(results);
    const anyFailed = results.some((r: any) => !r.success && !r.skipped);
    process.exit(anyFailed ? 1 : 0);
  }

  // --publish with no sub-command  →  show help
  console.log(`
Publish commands:
  --publish --list              List all pending drafts
  --publish --list --all        List all drafts (including published)
  --publish --list --verbose    List with full body preview
  --publish --id <id>           Publish one draft by ID (partial ID ok)
  --publish --all               Publish all pending drafts
  `);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();

  // Publish commands don't need OPENAI_API_KEY
  if (args.publish) {
    await runPublish(args);
    return;
  }

  if (!checkEnv()) process.exit(1);

  if (!args.task && !args.weekly) {
    console.log(`
RevenueCat Agentic AI Developer Advocate

Agent commands:
  --task "..."                  Run a single ad-hoc task
  --weekly                      Run the full weekly schedule
  --weekly --week YYYY-MM-DD    Run for a specific week
  --weekly --tasks t1 t2        Run specific tasks only
  --weekly --report-only        Generate this week's report only

Publish commands (run after operator review):
  --publish --list              List all pending drafts
  --publish --list --all        List all drafts
  --publish --list --verbose    List with full body preview
  --publish --id <id>           Publish one draft by ID
  --publish --all               Publish all pending drafts
    `);
    process.exit(0);
  }

  // ── Single task ─────────────────────────────────────────────────────────────
  if (args.task) {
    console.log(`Running task: ${args.task}\n`);
    const result = await runAgent(args.task, [], args.maxIter);
    console.log("\n" + "=".repeat(60));
    console.log("AGENT RESPONSE");
    console.log("=".repeat(60));
    console.log(result.response);
    console.log(`\n[Tool calls made: ${result.toolCallsMade}]`);
    return;
  }

  // ── Weekly schedule ─────────────────────────────────────────────────────────
  if (args.weekly) {
    await runWeeklyTasks({
      weekStart: args.week,
      tasksToRun: args.tasks,
      reportOnly: args.reportOnly,
      maxIterations: args.maxIter,
    });
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});