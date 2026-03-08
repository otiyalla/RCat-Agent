#!/usr/bin/env python3
"""
RevenueCat Agentic AI Developer Advocate
Main entry point.

Usage:
    # Interactive single task
    python main.py --task "Write a tutorial on RevenueCat webhooks"

    # Run the full weekly schedule
    python main.py --weekly

    # Run a specific task from the weekly schedule
    python main.py --weekly --tasks content_piece_1 feature_requests

    # Generate this week's report only
    python main.py --weekly --report-only
"""

import argparse
import logging
import os
import sys

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)

logger = logging.getLogger("rcat.main")


def check_env() -> bool:
    missing = []
    if not os.environ.get("OPENAI_API_KEY"):
        missing.append("OPENAI_API_KEY")
    if missing:
        logger.error("Missing required environment variables: %s", ", ".join(missing))
        logger.error("Copy .env.example to .env and fill in your values.")
        return False
    return True


def main():
    parser = argparse.ArgumentParser(
        description="RevenueCat Agentic AI Developer Advocate",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )

    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--task", type=str, help="Run a single ad-hoc task.")
    mode.add_argument("--weekly", action="store_true", help="Run the full weekly schedule.")

    parser.add_argument("--week", type=str, default=None, help="Week start date (YYYY-MM-DD).")
    parser.add_argument("--tasks", nargs="+", default=None, help="Subset of weekly tasks to run.")
    parser.add_argument("--report-only", action="store_true", help="Only generate the weekly report.")
    parser.add_argument("--max-iter", type=int, default=10, help="Max agent iterations per task.")

    args = parser.parse_args()

    if not check_env():
        sys.exit(1)

    # ── Single task mode ──────────────────────────────────────────────────────
    if args.task:
        from agent.agent import run_agent
        logger.info("Running single task: %s", args.task)
        result = run_agent(task=args.task, max_iterations=args.max_iter)
        print("\n" + "=" * 60)
        print("AGENT RESPONSE")
        print("=" * 60)
        print(result["response"])
        print(f"\n[Tool calls made: {result['tool_calls_made']}]")

    # ── Weekly schedule mode ──────────────────────────────────────────────────
    elif args.weekly:
        from agent.scheduler import run_weekly_tasks
        run_weekly_tasks(
            week_start=args.week,
            tasks_to_run=args.tasks,
            dry_run_report_only=args.report_only,
        )


if __name__ == "__main__":
    main()
