# RCat — RevenueCat Agentic AI Developer Advocate

Autonomous AI Developer Advocate built with **GPT-4 + TypeScript + Bun**.

---

## Project structure

```
src/
  main.ts                  ← CLI entry point
  agent/
    config.ts              ← Env vars, KPI targets, constants
    agent.ts               ← GPT-4 agent loop (function calling)
    tools.ts               ← 7 tools: schemas + implementations
    scheduler.ts           ← Weekly task orchestrator
    index.ts               ← Barrel exports
.github/workflows/
  weekly.yml               ← GitHub Actions Monday cron
data/                      ← Auto-created: JSON logs & records
```

---

## Setup

### Prerequisites

- [Bun](https://bun.sh) ≥ 1.1 — `curl -fsSL https://bun.sh/install | bash`
- An OpenAI API key with GPT-4 access

### Install

```bash
bun install
```

### Configure

```bash
cp .env.example .env
# Edit .env — Bun loads it automatically
```

**Required:**
- `OPENAI_API_KEY`

**Recommended:**
- `TAVILY_API_KEY` — real web search (get one at tavily.com)
- `REVENUECAT_API_KEY` + `REVENUECAT_PROJECT_ID` — for live API calls

**Optional:**
- `GITHUB_TOKEN` — `gist` scope only, for auto-publishing GitHub Gists

---

## Running the agent

### Single task

```bash
bun run src/main.ts --task "Write a tutorial on RevenueCat webhooks in a Node.js backend"
```

### Full weekly schedule

```bash
bun run src/main.ts --weekly
```

### Specific tasks only

```bash
bun run src/main.ts --weekly --tasks content_piece_1 feature_requests
```

### Weekly report only

```bash
bun run src/main.ts --weekly --report-only --week 2025-01-20
```

### Via npm scripts

```bash
bun start         # --weekly (full schedule)
bun run report    # --weekly --report-only
```

---

## Publishing (operator review workflow)

The agent always saves content as `published: false`. After you review the drafts
in `data/content_log.json`, use the `--publish` command to ship them.

### 1. List pending drafts

```bash
bun run src/main.ts --publish --list
```

Output:
```
============================================================
PENDING DRAFTS (3)
============================================================
  ⏳ pending  [a3f1c2d8]  blog_post         2025-01-20
             "How to Handle RevenueCat Webhook Failures"
             tags: webhooks, ios, backend

  ⏳ pending  [b7e90a12]  code_sample       2025-01-20
             "Detecting Subscription State Changes in SwiftUI"
             tags: swift, ios, subscriptions
```

### 2. Preview a draft's full body

```bash
bun run src/main.ts --publish --list --verbose
```

### 3. Publish a single draft by ID

```bash
bun run src/main.ts --publish --id a3f1c2d8
# Partial IDs work — just enough to be unique
```

### 4. Publish all pending drafts at once

```bash
bun run src/main.ts --publish --all
```

### 5. Review everything (including already-published)

```bash
bun run src/main.ts --publish --list --all
```

### Publish targets per content type

| Content type | Published to |
|---|---|
| `blog_post` | GitHub Gist (requires `GITHUB_TOKEN`) |
| `tutorial` | GitHub Gist (requires `GITHUB_TOKEN`) |
| `code_sample` | GitHub Gist (requires `GITHUB_TOKEN`) |
| `twitter_thread` | Twitter/X API v2 (requires `TWITTER_BEARER_TOKEN`), falls back to stdout |
| `discord_post` | Discord Webhook (requires `DISCORD_WEBHOOK_URL`), falls back to stdout |

If a token isn't configured, the content is printed to stdout for manual posting — nothing is lost.

---

## Tools

| Tool | Purpose |
|---|---|
| `write_technical_content` | Draft blog posts, tutorials, code samples, threads |
| `log_community_interaction` | Record replies on GitHub, Discord, Twitter/X |
| `file_feature_request` | Submit structured product feedback with evidence |
| `call_revenuecat_api` | Interact with the RevenueCat REST API |
| `run_growth_experiment` | Design and log SEO/social/docs experiments |
| `web_search` | Research developer pain points via Tavily |
| `generate_weekly_report` | Compile KPI metrics for operator review |

---

## Weekly KPIs

| KPI | Target |
|---|---|
| Technical content pieces | 2+ / week |
| Community interactions | 50+ / week |
| Feature requests filed | 3+ / week |
| Growth experiments | 1+ / week |

---

## Dry run mode

`DRY_RUN=true` by default — no real API calls, no real posts.  
All activity is logged to `./data/*.json`.

```bash
DRY_RUN=false bun run src/main.ts --weekly  # live mode
```

Always review `data/content_log.json` before publishing anything.

---

## Scheduling (GitHub Actions)

Push to GitHub, add secrets, and the agent runs every Monday at 9am UTC automatically.

**Required secrets:**
- `OPENAI_API_KEY`
- `REVENUECAT_API_KEY`
- `REVENUECAT_PROJECT_ID`
- `OPERATOR_NAME`

**Optional secrets:**
- `TAVILY_API_KEY`
- `GH_GIST_TOKEN` (gist scope)

The workflow also supports `workflow_dispatch` for manual runs with custom params.

---

## Data files

All activity is persisted as JSON under `./data/`:

| File | Contents |
|---|---|
| `content_log.json` | Every content piece produced |
| `interactions_log.json` | Every community interaction |
| `feature_requests.json` | All feature requests filed |
| `growth_experiments.json` | All experiments designed |
| `weekly_reports.json` | Weekly KPI summaries |

---

## Human operator responsibilities

1. **Credentials** — keep API keys secure and rotate them
2. **Content review** — approve drafts before publishing (`published: false` in the log)
3. **Feature request routing** — forward filed requests to the RevenueCat product team
4. **Guardrail tuning** — adjust `WEEKLY_KPIS` in `config.ts` as needed
5. **Experiment approval** — decide which growth experiments to actually execute