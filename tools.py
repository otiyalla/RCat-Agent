"""
Tool definitions for the RevenueCat Developer Advocate agent.

Each tool is exposed to GPT-4 via OpenAI function calling.
Real side-effects (posting, API calls) only fire when
DRY_RUN=false in the environment.
"""

from __future__ import annotations

import json
import os
import uuid
import datetime
import logging
import textwrap
from typing import Any

import httpx

from agent.config import (
    REVENUECAT_API_KEY,
    REVENUECAT_PROJECT_ID,
    REVENUECAT_API_BASE,
    GITHUB_TOKEN,
    TWITTER_BEARER_TOKEN,
    TAVILY_API_KEY,
    DATA_DIR,
    CONTENT_FILE,
    INTERACTIONS_FILE,
    FEATURE_REQUESTS_FILE,
)

logger = logging.getLogger("rcat.tools")
DRY_RUN: bool = os.environ.get("DRY_RUN", "true").lower() != "false"

os.makedirs(DATA_DIR, exist_ok=True)


# ─────────────────────────────────────────────────────────────────────────────
# Helper: persistent JSON log
# ─────────────────────────────────────────────────────────────────────────────

def _append_record(filepath: str, record: dict) -> None:
    records: list = []
    if os.path.exists(filepath):
        with open(filepath) as f:
            records = json.load(f)
    records.append(record)
    with open(filepath, "w") as f:
        json.dump(records, f, indent=2)


def _load_records(filepath: str) -> list:
    if not os.path.exists(filepath):
        return []
    with open(filepath) as f:
        return json.load(f)


# ─────────────────────────────────────────────────────────────────────────────
# TOOL SCHEMAS  (passed to OpenAI tools=[...])
# ─────────────────────────────────────────────────────────────────────────────

TOOL_SCHEMAS: list[dict] = [
    # ── 1. Write technical content ────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "write_technical_content",
            "description": (
                "Draft a technical content piece (blog post, tutorial, code sample, "
                "Twitter/X thread, or Discord post) about a RevenueCat-related topic. "
                "The content is saved locally and optionally published."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "content_type": {
                        "type": "string",
                        "enum": ["blog_post", "tutorial", "code_sample", "twitter_thread", "discord_post"],
                        "description": "Format of the content piece.",
                    },
                    "title": {
                        "type": "string",
                        "description": "Title or headline for the piece.",
                    },
                    "body": {
                        "type": "string",
                        "description": "Full Markdown (or plain text for threads) content.",
                    },
                    "tags": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "SEO / topic tags.",
                    },
                    "publish": {
                        "type": "boolean",
                        "description": "If true, attempt to publish via configured integrations.",
                        "default": False,
                    },
                },
                "required": ["content_type", "title", "body"],
            },
        },
    },

    # ── 2. Log community interaction ──────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "log_community_interaction",
            "description": (
                "Record a community interaction (reply, comment, GitHub issue response, "
                "Discord message). Logs locally and optionally posts to the real platform."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "channel": {
                        "type": "string",
                        "enum": ["twitter", "github", "discord"],
                        "description": "Platform where the interaction occurs.",
                    },
                    "interaction_type": {
                        "type": "string",
                        "enum": ["reply", "comment", "answer", "thread_start", "dm"],
                        "description": "Nature of the interaction.",
                    },
                    "original_url": {
                        "type": "string",
                        "description": "URL of the original post/issue being responded to.",
                    },
                    "message": {
                        "type": "string",
                        "description": "The text of the agent's response or post.",
                    },
                    "topic_tags": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Tags classifying the topic (e.g. ['ios', 'subscriptions']).",
                    },
                },
                "required": ["channel", "interaction_type", "message"],
            },
        },
    },

    # ── 3. File RevenueCat feature request ────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "file_feature_request",
            "description": (
                "Submit a structured product feedback / feature request based on "
                "community signals or direct RevenueCat API usage observations."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {
                        "type": "string",
                        "description": "Short feature request title.",
                    },
                    "problem_statement": {
                        "type": "string",
                        "description": "The developer pain point this solves.",
                    },
                    "proposed_solution": {
                        "type": "string",
                        "description": "Concrete suggestion for how RevenueCat could address it.",
                    },
                    "evidence": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Community signals: thread URLs, quotes, issue references.",
                    },
                    "priority": {
                        "type": "string",
                        "enum": ["low", "medium", "high", "critical"],
                        "description": "Estimated developer impact.",
                    },
                },
                "required": ["title", "problem_statement", "proposed_solution", "priority"],
            },
        },
    },

    # ── 4. Call RevenueCat REST API ───────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "call_revenuecat_api",
            "description": (
                "Make an authenticated call to the RevenueCat REST API. "
                "Use this to fetch subscriber data, list offerings, "
                "get transaction history, etc. for product research."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "method": {
                        "type": "string",
                        "enum": ["GET", "POST", "PUT", "DELETE"],
                        "description": "HTTP method.",
                    },
                    "path": {
                        "type": "string",
                        "description": "API path, e.g. /subscribers/:app_user_id",
                    },
                    "body": {
                        "type": "object",
                        "description": "Request body (for POST/PUT).",
                    },
                },
                "required": ["method", "path"],
            },
        },
    },

    # ── 5. Run growth experiment ──────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "run_growth_experiment",
            "description": (
                "Design and log a growth experiment: programmatic SEO page, "
                "social campaign, newsletter experiment, etc."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "experiment_type": {
                        "type": "string",
                        "enum": ["seo_page", "social_campaign", "email_campaign", "docs_improvement", "other"],
                    },
                    "hypothesis": {
                        "type": "string",
                        "description": "What you expect to happen and why.",
                    },
                    "execution_plan": {
                        "type": "string",
                        "description": "Step-by-step plan for this experiment.",
                    },
                    "success_metric": {
                        "type": "string",
                        "description": "How success will be measured (e.g. 'organic impressions', 'sign-ups').",
                    },
                },
                "required": ["experiment_type", "hypothesis", "execution_plan", "success_metric"],
            },
        },
    },

    # ── 6. Web search ─────────────────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": "Search the web for developer discussions, Stack Overflow questions, GitHub issues, or news relevant to RevenueCat, subscriptions, or mobile monetization.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search query string.",
                    },
                    "max_results": {
                        "type": "integer",
                        "default": 5,
                        "description": "Number of results to return.",
                    },
                },
                "required": ["query"],
            },
        },
    },

    # ── 7. Weekly report ──────────────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "generate_weekly_report",
            "description": (
                "Compile a weekly performance report: content produced, "
                "community interactions, feature requests filed, experiments run. "
                "Returns structured JSON metrics."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "week_start": {
                        "type": "string",
                        "description": "ISO date string for the start of the week (YYYY-MM-DD).",
                    },
                },
                "required": ["week_start"],
            },
        },
    },
]


# ─────────────────────────────────────────────────────────────────────────────
# TOOL IMPLEMENTATIONS
# ─────────────────────────────────────────────────────────────────────────────

def write_technical_content(
    content_type: str,
    title: str,
    body: str,
    tags: list[str] | None = None,
    publish: bool = False,
) -> dict:
    record = {
        "id": str(uuid.uuid4()),
        "timestamp": datetime.datetime.utcnow().isoformat(),
        "content_type": content_type,
        "title": title,
        "body": body,
        "tags": tags or [],
        "published": False,
        "publish_url": None,
    }

    # Save to local content log
    _append_record(CONTENT_FILE, record)
    logger.info("Content saved: [%s] %s", content_type, title)

    # Optional publish
    if publish and not DRY_RUN:
        if content_type == "github_gist" and GITHUB_TOKEN:
            record["publish_url"] = _publish_github_gist(title, body)
            record["published"] = bool(record["publish_url"])
        # Twitter / blog publishing hooks go here

    return {
        "status": "saved" if not record["published"] else "published",
        "id": record["id"],
        "publish_url": record["publish_url"],
        "word_count": len(body.split()),
    }


def log_community_interaction(
    channel: str,
    interaction_type: str,
    message: str,
    original_url: str | None = None,
    topic_tags: list[str] | None = None,
) -> dict:
    record = {
        "id": str(uuid.uuid4()),
        "timestamp": datetime.datetime.utcnow().isoformat(),
        "channel": channel,
        "interaction_type": interaction_type,
        "original_url": original_url,
        "message": message,
        "topic_tags": topic_tags or [],
        "posted": False,
    }

    _append_record(INTERACTIONS_FILE, record)
    logger.info("Interaction logged: [%s/%s]", channel, interaction_type)

    # Real posting hooks (skipped in dry-run)
    if not DRY_RUN and channel == "twitter" and TWITTER_BEARER_TOKEN:
        logger.info("Twitter posting not yet wired — add OAuth 2.0 flow.")

    return {"status": "logged", "id": record["id"]}


def file_feature_request(
    title: str,
    problem_statement: str,
    proposed_solution: str,
    priority: str,
    evidence: list[str] | None = None,
) -> dict:
    record = {
        "id": str(uuid.uuid4()),
        "timestamp": datetime.datetime.utcnow().isoformat(),
        "title": title,
        "problem_statement": problem_statement,
        "proposed_solution": proposed_solution,
        "priority": priority,
        "evidence": evidence or [],
        "submitted": False,
    }

    _append_record(FEATURE_REQUESTS_FILE, record)
    logger.info("Feature request filed: %s [%s]", title, priority)

    # In a real setup you'd POST to an internal Notion/Linear endpoint here
    return {"status": "filed", "id": record["id"], "priority": priority}


def call_revenuecat_api(method: str, path: str, body: dict | None = None) -> dict:
    if not REVENUECAT_API_KEY:
        return {"error": "REVENUECAT_API_KEY not set"}

    url = f"{REVENUECAT_API_BASE}{path}"
    headers = {
        "Authorization": f"Bearer {REVENUECAT_API_KEY}",
        "Content-Type": "application/json",
        "X-Platform": "stripe",
    }

    if DRY_RUN:
        logger.info("[DRY RUN] Would call RevenueCat API: %s %s", method, url)
        return {"dry_run": True, "method": method, "url": url}

    try:
        with httpx.Client(timeout=15) as client:
            resp = client.request(method, url, headers=headers, json=body)
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPStatusError as e:
        return {"error": str(e), "status_code": e.response.status_code}
    except Exception as e:
        return {"error": str(e)}


def run_growth_experiment(
    experiment_type: str,
    hypothesis: str,
    execution_plan: str,
    success_metric: str,
) -> dict:
    record = {
        "id": str(uuid.uuid4()),
        "timestamp": datetime.datetime.utcnow().isoformat(),
        "experiment_type": experiment_type,
        "hypothesis": hypothesis,
        "execution_plan": execution_plan,
        "success_metric": success_metric,
        "status": "planned",
    }

    filepath = f"{DATA_DIR}/growth_experiments.json"
    _append_record(filepath, record)
    logger.info("Growth experiment logged: [%s] %s", experiment_type, hypothesis[:60])

    return {"status": "logged", "id": record["id"]}


def web_search(query: str, max_results: int = 5) -> dict:
    """
    Web search using Tavily if API key is set, otherwise returns mock.
    """
    if not TAVILY_API_KEY:
        logger.warning("TAVILY_API_KEY not set — returning mock search results.")
        return {
            "mock": True,
            "query": query,
            "results": [
                {
                    "title": f"Mock result for: {query}",
                    "url": "https://example.com",
                    "snippet": "Set TAVILY_API_KEY to enable real web search.",
                }
            ],
        }

    try:
        with httpx.Client(timeout=15) as client:
            resp = client.post(
                "https://api.tavily.com/search",
                json={
                    "api_key": TAVILY_API_KEY,
                    "query": query,
                    "max_results": max_results,
                    "search_depth": "basic",
                },
            )
            resp.raise_for_status()
            data = resp.json()
            return {
                "query": query,
                "results": [
                    {
                        "title": r.get("title"),
                        "url": r.get("url"),
                        "snippet": r.get("content", "")[:300],
                    }
                    for r in data.get("results", [])
                ],
            }
    except Exception as e:
        return {"error": str(e), "query": query}


def generate_weekly_report(week_start: str) -> dict:
    try:
        start = datetime.date.fromisoformat(week_start)
        end = start + datetime.timedelta(days=7)
    except ValueError:
        return {"error": "Invalid week_start date. Use YYYY-MM-DD."}

    def _filter_week(records: list) -> list:
        out = []
        for r in records:
            ts_str = r.get("timestamp", "")
            try:
                ts = datetime.date.fromisoformat(ts_str[:10])
                if start <= ts < end:
                    out.append(r)
            except ValueError:
                pass
        return out

    content = _filter_week(_load_records(CONTENT_FILE))
    interactions = _filter_week(_load_records(INTERACTIONS_FILE))
    feature_reqs = _filter_week(_load_records(FEATURE_REQUESTS_FILE))
    experiments_path = f"{DATA_DIR}/growth_experiments.json"
    experiments = _filter_week(_load_records(experiments_path))

    report = {
        "week": f"{week_start} → {end.isoformat()}",
        "kpis": {
            "content_pieces": {
                "count": len(content),
                "target": 2,
                "met": len(content) >= 2,
            },
            "community_interactions": {
                "count": len(interactions),
                "target": 50,
                "met": len(interactions) >= 50,
                "by_channel": {
                    ch: sum(1 for i in interactions if i["channel"] == ch)
                    for ch in ["twitter", "github", "discord"]
                },
            },
            "feature_requests": {
                "count": len(feature_reqs),
                "target": 3,
                "met": len(feature_reqs) >= 3,
            },
            "growth_experiments": {
                "count": len(experiments),
                "target": 1,
                "met": len(experiments) >= 1,
            },
        },
        "content_titles": [c["title"] for c in content],
        "feature_request_titles": [f["title"] for f in feature_reqs],
        "generated_at": datetime.datetime.utcnow().isoformat(),
    }

    report_path = f"{DATA_DIR}/weekly_reports.json"
    _append_record(report_path, report)
    return report


# ─────────────────────────────────────────────────────────────────────────────
# Dispatch map  (name → callable)
# ─────────────────────────────────────────────────────────────────────────────

TOOL_DISPATCH: dict[str, Any] = {
    "write_technical_content": write_technical_content,
    "log_community_interaction": log_community_interaction,
    "file_feature_request": file_feature_request,
    "call_revenuecat_api": call_revenuecat_api,
    "run_growth_experiment": run_growth_experiment,
    "web_search": web_search,
    "generate_weekly_report": generate_weekly_report,
}


def execute_tool(name: str, arguments: dict) -> str:
    """Dispatch a tool call and return the result as a JSON string."""
    fn = TOOL_DISPATCH.get(name)
    if fn is None:
        return json.dumps({"error": f"Unknown tool: {name}"})
    try:
        result = fn(**arguments)
        return json.dumps(result, ensure_ascii=False)
    except Exception as e:
        logger.exception("Tool %s raised an exception", name)
        return json.dumps({"error": str(e)})


# ─────────────────────────────────────────────────────────────────────────────
# Private helpers
# ─────────────────────────────────────────────────────────────────────────────

def _publish_github_gist(title: str, body: str) -> str | None:
    if not GITHUB_TOKEN:
        return None
    try:
        with httpx.Client(timeout=15) as client:
            resp = client.post(
                "https://api.github.com/gists",
                headers={
                    "Authorization": f"Bearer {GITHUB_TOKEN}",
                    "Accept": "application/vnd.github+json",
                },
                json={
                    "description": title,
                    "public": True,
                    "files": {f"{title[:50]}.md": {"content": body}},
                },
            )
            resp.raise_for_status()
            return resp.json().get("html_url")
    except Exception as e:
        logger.error("GitHub Gist publish failed: %s", e)
        return None
