# RCat — RevenueCat Agentic AI Developer Advocate

An autonomous AI agent built on GPT-4 that fulfils the RevenueCat Agentic AI Developer Advocate role.

Human operator provides oversight, manages API credentials, and approves published content.

---

## Architecture

```
main.py                  ← CLI entry point
agent/
  config.py              ← API keys, KPI targets, constants
  agent.py               ← Core GPT-4 agent loop (function calling)
  tools.py               ← 7 tool implementations + OpenAI schemas
  scheduler.py           ← Weekly task orchestrator
data/                    ← Auto-created: logs, metrics, JSON records
```

### Agent Loop

```
User task → GPT-4 (with tools) → Tool call(s) → GPT-4 → ... → Final response
```

Each iteration the model decides whether to call a tool or return a final answer.
Tool results are fed back into the conversation until the task is complete.

---

## Tools

| Tool | Purpose |
|---|---|
| `write_technical_content` | Draft blog posts, tutorials, code samples, Twitter threads |
| `log_community_interaction` | Record replies on GitHub, Discord, Twitter/X |
| `file_feature_request` | Submit structured product feedback with evidence |
| `call_revenuecat_api` | Interact with the RevenueCat REST API |
| `run_growth_experiment` | Design and log SEO/social/docs experiments |
| `web_search` | Research developer pain points (uses Tavily) |
| `generate_weekly_report` | Compile KPI metrics for operator review |

---

## Weekly KPI Targets

| KPI | Target |
|---|---|
| Technical content pieces | 2+ per week |
| Community interactions | 50+ per week |
| Feature requests filed | 3+ per week |
| Growth experiments | 1+ per week |

---

## Setup

### 1. Install dependencies

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your API keys
```

Required:
- `OPENAI_API_KEY` — from platform.openai.com

Optional but recommended:
- `REVENUECAT_API_KEY` — from your RevenueCat dashboard
- `TAVILY_API_KEY` — for real web search
- `GITHUB_TOKEN` — to auto-publish GitHub Gists

### 3. Load environment

```bash
source .env  # or use python-dotenv / direnv
```

---

## Running the Agent

### Single task (interactive)

```bash
python main.py --task "Write a tutorial on implementing RevenueCat webhooks in a Node.js backend"
```

### Full weekly schedule

```bash
python main.py --weekly
```

### Specific tasks only

```bash
python main.py --weekly --tasks content_piece_1 feature_requests
```

### Weekly report only

```bash
python main.py --weekly --report-only --week 2025-01-20
```

---

## Dry Run Mode

By default `DRY_RUN=true` — the agent logs all actions but makes **no real API calls** to RevenueCat, GitHub, or Twitter.

To enable real side effects:

```bash
DRY_RUN=false python main.py --weekly
```

> **Important:** The human operator should review `data/content_log.json` before publishing any content.

---

## Scheduling (Production)

Add to crontab to run every Monday at 9am:

```cron
0 9 * * MON cd /path/to/revenuecat-agent && source .venv/bin/activate && python main.py --weekly >> data/cron.log 2>&1
```

Or use a managed scheduler (GitHub Actions, Railway, Render cron job):

```yaml
# .github/workflows/weekly.yml
name: Weekly Agent Run
on:
  schedule:
    - cron: '0 9 * * MON'
jobs:
  run:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.11' }
      - run: pip install -r requirements.txt
      - run: python main.py --weekly
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          REVENUECAT_API_KEY: ${{ secrets.REVENUECAT_API_KEY }}
          TAVILY_API_KEY: ${{ secrets.TAVILY_API_KEY }}
          DRY_RUN: 'false'
```

---

## Data Files

All agent activity is persisted as JSON under `./data/`:

| File | Contents |
|---|---|
| `content_log.json` | Every piece of content produced |
| `interactions_log.json` | Every community interaction logged |
| `feature_requests.json` | All feature requests filed |
| `growth_experiments.json` | All growth experiments designed |
| `weekly_reports.json` | Weekly KPI summaries |

---

## Human Operator Responsibilities

The operator (`OPERATOR_NAME`) is responsible for:

1. **API key management** — keeping credentials secure and rotated
2. **Content review** — approving drafts before publication (`published: false` → publish manually)
3. **Feature request routing** — forwarding filed requests to the RevenueCat product team
4. **Guardrail tuning** — adjusting `WEEKLY_KPIS` and system prompt as needed
5. **Experiment approval** — deciding which growth experiments to execute

---

## Extending the Agent

### Adding a new tool

1. Add a schema to `TOOL_SCHEMAS` in `agent/tools.py`
2. Implement the function
3. Add it to `TOOL_DISPATCH`
4. The agent will automatically use it

### Adding a new weekly task

Add a `WeeklyTask` to `WEEKLY_TASKS` in `agent/scheduler.py` with a `priority` number.

---

## Application

This agent was built as a job application for RevenueCat's [Agentic AI Developer Advocate](https://jobs.ashbyhq.com/revenuecat/998a9cef-3ea5-45c2-885b-8a00c4eeb149) role.

The `application_blog_post.md` file contains the required blog post written by the agent itself.
