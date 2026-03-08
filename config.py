"""
Configuration for the RevenueCat Agentic AI Developer Advocate.

Human operator: [OPERATOR_NAME] — the human responsible for oversight,
API key management, and final review of published content.
"""

import os
from dataclasses import dataclass, field
from typing import Optional


# ─────────────────────────────────────────────
# Identity
# ─────────────────────────────────────────────

AGENT_NAME = "RCat"
AGENT_VERSION = "1.0.0"
AGENT_DESCRIPTION = (
    "Agentic AI Developer Advocate for RevenueCat. "
    "Writes technical content, engages with the developer community, "
    "runs growth experiments, and surfaces product feedback."
)

OPERATOR_NAME = os.environ.get("OPERATOR_NAME", "[OPERATOR_PLACEHOLDER]")
OPERATOR_EMAIL = os.environ.get("OPERATOR_EMAIL", "operator@example.com")


# ─────────────────────────────────────────────
# API Keys (loaded from environment)
# ─────────────────────────────────────────────

OPENAI_API_KEY: str = os.environ.get("OPENAI_API_KEY", "")
OPENAI_MODEL: str = os.environ.get("OPENAI_MODEL", "gpt-4o")

REVENUECAT_API_KEY: str = os.environ.get("REVENUECAT_API_KEY", "")
REVENUECAT_PROJECT_ID: str = os.environ.get("REVENUECAT_PROJECT_ID", "")

# Optional: social posting
TWITTER_BEARER_TOKEN: Optional[str] = os.environ.get("TWITTER_BEARER_TOKEN")
GITHUB_TOKEN: Optional[str] = os.environ.get("GITHUB_TOKEN")

# Tavily for web search (optional but recommended)
TAVILY_API_KEY: Optional[str] = os.environ.get("TAVILY_API_KEY")


# ─────────────────────────────────────────────
# Weekly KPI targets (from job description)
# ─────────────────────────────────────────────

@dataclass
class WeeklyKPIs:
    content_pieces: int = 2          # blog posts / tutorials / code samples
    community_interactions: int = 50  # X, GitHub, Discord replies
    feature_requests: int = 3         # structured RevenueCat feature requests
    growth_experiments: int = 1       # SEO pages, social campaigns, etc.


WEEKLY_KPIS = WeeklyKPIs()


# ─────────────────────────────────────────────
# Content channels
# ─────────────────────────────────────────────

CONTENT_CHANNELS = ["blog", "github_gist", "twitter_thread", "discord_post"]
COMMUNITY_CHANNELS = ["twitter", "github", "discord"]

REVENUECAT_BLOG_BASE = "https://www.revenuecat.com/blog"
REVENUECAT_DOCS_BASE = "https://docs.revenuecat.com"
REVENUECAT_API_BASE = "https://api.revenuecat.com/v1"


# ─────────────────────────────────────────────
# Persistence
# ─────────────────────────────────────────────

DATA_DIR = os.environ.get("AGENT_DATA_DIR", "./data")
LOG_FILE = f"{DATA_DIR}/agent.log"
METRICS_FILE = f"{DATA_DIR}/metrics.json"
CONTENT_FILE = f"{DATA_DIR}/content_log.json"
INTERACTIONS_FILE = f"{DATA_DIR}/interactions_log.json"
FEATURE_REQUESTS_FILE = f"{DATA_DIR}/feature_requests.json"
