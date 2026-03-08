"""
Core agent loop.

Sends a task prompt to GPT-4, processes tool calls in a loop,
and returns the final text response.

Usage:
    from agent.agent import run_agent
    result = run_agent("Write a tutorial on RevenueCat webhooks.")
"""

from __future__ import annotations

import json
import logging
import os
from typing import Iterator

from openai import OpenAI

from agent.config import OPENAI_API_KEY, OPENAI_MODEL, AGENT_NAME, AGENT_DESCRIPTION, OPERATOR_NAME
from agent.tools import TOOL_SCHEMAS, execute_tool

logger = logging.getLogger("rcat.agent")

# ─────────────────────────────────────────────────────────────────────────────
# System prompt
# ─────────────────────────────────────────────────────────────────────────────

SYSTEM_PROMPT = f"""
You are {AGENT_NAME}, RevenueCat's Agentic AI Developer Advocate.

{AGENT_DESCRIPTION}

Your human operator is: {OPERATOR_NAME}
They provide oversight, manage API credentials, and approve final publications.

## Your weekly targets
- 2+ technical content pieces (blog posts, tutorials, code samples)
- 50+ community interactions on X/Twitter, GitHub, and Discord
- 3+ structured RevenueCat feature requests based on developer pain points
- 1+ growth experiment (programmatic SEO, social campaign, docs improvement)

## Your personality
- Deeply technical and hands-on — you actually use the RevenueCat SDK
- Genuinely curious about developer problems, not promotional
- Concise, opinionated, and direct in writing
- You cite evidence (threads, issues, docs) when filing feedback

## Decision framework
1. Search for real developer signals before writing content (use web_search)
2. Write content that solves actual problems, not marketing fluff
3. When engaging with community questions, give actionable answers with code
4. File feature requests only when you have observed a real pain point 3+ times
5. Every growth experiment must have a clear hypothesis and success metric

## Rules
- Never fabricate RevenueCat API responses — always call the real API
- Mark content as published=false until human operator approves
- Log every community interaction, even small ones
- Surface surprising findings to the operator in your responses
""".strip()


# ─────────────────────────────────────────────────────────────────────────────
# Agent runner
# ─────────────────────────────────────────────────────────────────────────────

def run_agent(
    task: str,
    conversation_history: list[dict] | None = None,
    max_iterations: int = 10,
    verbose: bool = True,
) -> dict:
    """
    Run the agent on a task string.

    Args:
        task:                 The task or instruction to execute.
        conversation_history: Previous messages if continuing a session.
        max_iterations:       Hard cap on tool-call rounds to prevent runaway loops.
        verbose:              Print tool call activity to stdout.

    Returns:
        {
          "response": str,          # Final text from the agent
          "tool_calls_made": int,   # Number of tool calls in this run
          "messages": list[dict],   # Full message history
        }
    """
    client = OpenAI(api_key=OPENAI_API_KEY)

    messages: list[dict] = list(conversation_history or [])
    if not messages or messages[0].get("role") != "system":
        messages.insert(0, {"role": "system", "content": SYSTEM_PROMPT})

    messages.append({"role": "user", "content": task})

    tool_calls_made = 0

    for iteration in range(max_iterations):
        if verbose:
            print(f"\n[{AGENT_NAME}] Iteration {iteration + 1}/{max_iterations}...")

        response = client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=messages,
            tools=TOOL_SCHEMAS,
            tool_choice="auto",
        )

        message = response.choices[0].message
        messages.append(message.model_dump(exclude_unset=False))

        # ── No more tool calls → done ──────────────────────────────────────
        if not message.tool_calls:
            if verbose:
                print(f"\n[{AGENT_NAME}] Final response ready.\n")
            return {
                "response": message.content or "",
                "tool_calls_made": tool_calls_made,
                "messages": messages,
            }

        # ── Execute each tool call ─────────────────────────────────────────
        for tc in message.tool_calls:
            fn_name = tc.function.name
            try:
                fn_args = json.loads(tc.function.arguments)
            except json.JSONDecodeError:
                fn_args = {}

            if verbose:
                print(f"  → Tool: {fn_name}({json.dumps(fn_args, indent=2)[:120]}...)")

            result_str = execute_tool(fn_name, fn_args)
            tool_calls_made += 1

            messages.append({
                "role": "tool",
                "tool_call_id": tc.id,
                "content": result_str,
            })

    # Fallback: max iterations hit
    logger.warning("Max iterations (%d) reached without a final response.", max_iterations)
    return {
        "response": "[Agent hit max_iterations without a final response. Check logs.]",
        "tool_calls_made": tool_calls_made,
        "messages": messages,
    }


def run_agent_stream(
    task: str,
    conversation_history: list[dict] | None = None,
    max_iterations: int = 10,
) -> Iterator[str]:
    """
    Generator version: yields text chunks as they stream from GPT-4.
    Tool calls are still executed synchronously before streaming resumes.
    """
    result = run_agent(task, conversation_history, max_iterations, verbose=False)
    for word in result["response"].split(" "):
        yield word + " "
