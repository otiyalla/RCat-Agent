/**
 * agent.ts
 * Core GPT-4 agent loop using OpenAI function calling.
 */

import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

import { OPENAI_API_KEY, OPENAI_MODEL, AGENT_NAME, AGENT_DESCRIPTION, OPERATOR_NAME } from "./config";
import { TOOL_SCHEMAS, executeTool } from "./tools";

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `
You are ${AGENT_NAME}, RevenueCat's Agentic AI Developer Advocate.

${AGENT_DESCRIPTION}

Your human operator is: ${OPERATOR_NAME}
They provide oversight, manage API credentials, and approve final publications.

## Weekly targets
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
`.trim();

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AgentResult {
  response: string;
  toolCallsMade: number;
  messages: ChatCompletionMessageParam[];
}

// ── Agent runner ──────────────────────────────────────────────────────────────

export async function runAgent(
  task: string,
  conversationHistory: ChatCompletionMessageParam[] = [],
  maxIterations = 10,
  verbose = true,
): Promise<AgentResult> {
  const client = new OpenAI({ apiKey: OPENAI_API_KEY });

  const messages: ChatCompletionMessageParam[] = conversationHistory.length > 0
    ? [...conversationHistory]
    : [{ role: "system", content: SYSTEM_PROMPT }];

  // Ensure system prompt is always first
  if (messages[0]?.role !== "system") {
    messages.unshift({ role: "system", content: SYSTEM_PROMPT });
  }

  messages.push({ role: "user", content: task });

  let toolCallsMade = 0;

  for (let i = 0; i < maxIterations; i++) {
    if (verbose) console.log(`\n[${AGENT_NAME}] Iteration ${i + 1}/${maxIterations}...`);

    const response = await client.chat.completions.create({
      model: OPENAI_MODEL,
      messages,
      tools: TOOL_SCHEMAS,
      tool_choice: "auto",
    });

    const message = response.choices[0]?.message;
    if (!message) break;

    // Type-safe push — OpenAI response messages are compatible with the param type
    messages.push(message as ChatCompletionMessageParam);

    // No tool calls → final answer
    if (!message.tool_calls || message.tool_calls.length === 0) {
      if (verbose) console.log(`\n[${AGENT_NAME}] ✓ Final response ready.`);
      return { response: message.content ?? "", toolCallsMade, messages };
    }

    // Execute each tool call
    for (const tc of message.tool_calls) {
      const fnName = tc.function.name;
      let fnArgs: Record<string, unknown> = {};
      try { fnArgs = JSON.parse(tc.function.arguments) as Record<string, unknown>; } catch { /* leave empty */ }

      if (verbose) {
        const preview = JSON.stringify(fnArgs).slice(0, 100);
        console.log(`  → Tool: ${fnName}(${preview}${preview.length === 100 ? "..." : ""})`);
      }

      const resultStr = await executeTool(fnName, fnArgs);
      toolCallsMade++;

      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: resultStr,
      });
    }
  }

  console.warn(`[${AGENT_NAME}] Warning: hit max iterations (${maxIterations}).`);
  return {
    response: "[Agent hit max_iterations without a final response. Check logs.]",
    toolCallsMade,
    messages,
  };
}