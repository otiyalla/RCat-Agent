"""
Weekly task scheduler for the RevenueCat Developer Advocate agent.

Orchestrates the agent's weekly workload in priority order:
  1. Community listening (search for developer pain points)
  2. Content creation (2+ pieces)
  3. Community interactions (targeted replies)
  4. Feature request filing (from observed patterns)
  5. Growth experiment (1 per week)
  6. Weekly report generation

Run manually:
    python -m agent.scheduler --week 2025-01-20

Or schedule with cron:
    0 9 * * MON python -m agent.scheduler
"""

from __future__ import annotations

import argparse
import datetime
import logging
import sys
from typing import NamedTuple

from agent.agent import run_agent
from agent.config import WEEKLY_KPIS

logger = logging.getLogger("rcat.scheduler")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)


# ─────────────────────────────────────────────────────────────────────────────
# Task definitions
# ─────────────────────────────────────────────────────────────────────────────

class WeeklyTask(NamedTuple):
    name: str
    prompt: str
    priority: int  # lower = runs first


WEEKLY_TASKS: list[WeeklyTask] = [
    WeeklyTask(
        name="community_listening",
        priority=1,
        prompt=(
            "Use web_search to find the top 5 developer pain points about RevenueCat "
            "this week (search GitHub issues, Stack Overflow, Twitter/X, and Discord). "
            "Summarise each pain point and note its frequency. "
            "Do not file feature requests yet — just research."
        ),
    ),
    WeeklyTask(
        name="content_piece_1",
        priority=2,
        prompt=(
            "Based on what you've found from community listening, write a deep-dive "
            "technical blog post (800–1200 words, Markdown) solving the #1 developer "
            "pain point from this week's research. Include working code examples. "
            "Save it using write_technical_content with content_type='blog_post'. "
            "Set publish=false for operator review."
        ),
    ),
    WeeklyTask(
        name="content_piece_2",
        priority=3,
        prompt=(
            "Write a short, practical code sample or tutorial (300–600 words) addressing "
            "a RevenueCat SDK usage question that appeared 3+ times in community channels. "
            "Save it using write_technical_content with content_type='code_sample'. "
            "Include a short Twitter/X thread version as well."
        ),
    ),
    WeeklyTask(
        name="community_interactions",
        prompt=(
            f"Log {WEEKLY_KPIS.community_interactions} community interactions this week. "
            "For each interaction: use web_search to find real unanswered questions on "
            "GitHub, Discord, or Twitter/X about RevenueCat or in-app subscriptions. "
            "Draft a helpful, technically accurate reply (with code if needed). "
            "Log each one using log_community_interaction. "
            "Aim for at least 20 on GitHub, 20 on Discord, 10 on Twitter/X."
        ),
        priority=4,
    ),
    WeeklyTask(
        name="feature_requests",
        priority=5,
        prompt=(
            f"File {WEEKLY_KPIS.feature_requests} structured feature requests with RevenueCat. "
            "Base each one on recurring developer pain points from community listening. "
            "Each request must have a clear problem_statement, proposed_solution, "
            "and at least 2 evidence URLs. Use file_feature_request for each."
        ),
    ),
    WeeklyTask(
        name="growth_experiment",
        priority=6,
        prompt=(
            "Design one growth experiment for this week. "
            "Options: a programmatic SEO page targeting a high-intent search query, "
            "a social media campaign around a trending mobile dev topic, "
            "or a documentation improvement for a high-traffic but confusing page. "
            "Use run_growth_experiment to log the hypothesis, execution plan, and success metric."
        ),
    ),
    WeeklyTask(
        name="api_research",
        priority=7,
        prompt=(
            "Use call_revenuecat_api to fetch your project's current offerings list "
            "(GET /projects/{project_id}/offerings). "
            "Note any gaps or UX issues you observe in the response structure. "
            "If you find anything surprising, note it for the weekly report."
        ),
    ),
    WeeklyTask(
        name="weekly_report",
        priority=8,
        prompt=(
            "Generate a weekly report using generate_weekly_report for this week. "
            "After generating it, write a concise human-readable summary of: "
            "1. KPIs hit vs missed, "
            "2. Most impactful content piece, "
            "3. Top community signal / developer pain point, "
            "4. One recommendation for next week. "
            "Format it as a brief memo for the human operator."
        ),
    ),
]


# ─────────────────────────────────────────────────────────────────────────────
# Scheduler runner
# ─────────────────────────────────────────────────────────────────────────────

def run_weekly_tasks(
    week_start: str | None = None,
    tasks_to_run: list[str] | None = None,
    dry_run_report_only: bool = False,
) -> dict[str, str]:
    """
    Run all (or a subset of) weekly tasks in priority order.

    Args:
        week_start:         ISO date string for week start; defaults to today's Monday.
        tasks_to_run:       Optional list of task names to run (default: all).
        dry_run_report_only: Skip everything, just generate the report.

    Returns:
        Dict mapping task name → agent response string.
    """
    if week_start is None:
        today = datetime.date.today()
        # Roll back to Monday
        week_start = (today - datetime.timedelta(days=today.weekday())).isoformat()

    logger.info("=" * 60)
    logger.info("Weekly run starting | week: %s", week_start)
    logger.info("=" * 60)

    tasks = sorted(WEEKLY_TASKS, key=lambda t: t.priority)

    if tasks_to_run:
        tasks = [t for t in tasks if t.name in tasks_to_run]

    if dry_run_report_only:
        tasks = [t for t in tasks if t.name == "weekly_report"]

    conversation: list[dict] = []  # Maintain context across tasks
    results: dict[str, str] = {}

    for task in tasks:
        logger.info("\n── Running task: %s ──", task.name)
        prompt = task.prompt.replace("{project_id}", "YOUR_PROJECT_ID")  # inject at runtime

        result = run_agent(
            task=prompt,
            conversation_history=conversation,
            max_iterations=12,
        )

        results[task.name] = result["response"]
        # Carry forward full conversation for context
        conversation = result["messages"]

        logger.info(
            "Task '%s' done. Tool calls: %d",
            task.name,
            result["tool_calls_made"],
        )
        print(f"\n{'='*50}")
        print(f"TASK: {task.name}")
        print(f"{'='*50}")
        print(result["response"])

    logger.info("\nWeekly run complete. Tasks run: %d", len(results))
    return results


# ─────────────────────────────────────────────────────────────────────────────
# CLI entry point
# ─────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="RevenueCat Agent Weekly Scheduler")
    parser.add_argument(
        "--week",
        type=str,
        default=None,
        help="Week start date (YYYY-MM-DD). Defaults to current Monday.",
    )
    parser.add_argument(
        "--tasks",
        nargs="+",
        default=None,
        help="Specific task names to run (default: all).",
    )
    parser.add_argument(
        "--report-only",
        action="store_true",
        help="Only generate the weekly report.",
    )
    args = parser.parse_args()

    run_weekly_tasks(
        week_start=args.week,
        tasks_to_run=args.tasks,
        dry_run_report_only=args.report_only,
    )


if __name__ == "__main__":
    main()
