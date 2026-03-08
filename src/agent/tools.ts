/**
 * tools.ts
 * Tool definitions (OpenAI function-calling schemas) + implementations.
 * Real side-effects only fire when DRY_RUN=false.
 */

import { randomUUID } from "crypto";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "fs";
import type { ChatCompletionTool } from "openai/resources/chat/completions";

import {
    REVENUECAT_API_KEY,
    REVENUECAT_API_BASE,
    GITHUB_TOKEN,
    TWITTER_BEARER_TOKEN,
    TAVILY_API_KEY,
    DRY_RUN,
    DATA_DIR,
} from "./config";

// ── Ensure data directory exists ─────────────────────────────────────────────
mkdirSync(DATA_DIR, { recursive: true });

const CONTENT_FILE = `${DATA_DIR}/content_log.json`;
const INTERACTIONS_FILE = `${DATA_DIR}/interactions_log.json`;
const FEATURE_REQUESTS_FILE = `${DATA_DIR}/feature_requests.json`;
const EXPERIMENTS_FILE = `${DATA_DIR}/growth_experiments.json`;
const REPORTS_FILE = `${DATA_DIR}/weekly_reports.json`;

// ── Persistence helpers ───────────────────────────────────────────────────────

function loadRecords(filepath: string): Record<string, unknown>[] {
    if (!existsSync(filepath)) return [];
    return JSON.parse(readFileSync(filepath, "utf8")) as Record<string, unknown>[];
}

function appendRecord(filepath: string, record: Record<string, unknown>): void {
    const records = loadRecords(filepath);
    records.push(record);
    writeFileSync(filepath, JSON.stringify(records, null, 2));
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type ContentType = "blog_post" | "tutorial" | "code_sample" | "twitter_thread" | "discord_post";
export type Channel = "twitter" | "github" | "discord";
export type InteractionType = "reply" | "comment" | "answer" | "thread_start" | "dm";
export type Priority = "low" | "medium" | "high" | "critical";
export type ExperimentType = "seo_page" | "social_campaign" | "email_campaign" | "docs_improvement" | "other";

// ─────────────────────────────────────────────────────────────────────────────
// TOOL SCHEMAS
// ─────────────────────────────────────────────────────────────────────────────

export const TOOL_SCHEMAS: ChatCompletionTool[] = [
    {
        type: "function",
        function: {
            name: "write_technical_content",
            description:
                "Draft a technical content piece (blog post, tutorial, code sample, Twitter/X thread, " +
                "or Discord post) about a RevenueCat-related topic. Saved locally and optionally published.",
            parameters: {
                type: "object",
                properties: {
                    content_type: {
                        type: "string",
                        enum: ["blog_post", "tutorial", "code_sample", "twitter_thread", "discord_post"],
                        description: "Format of the content piece.",
                    },
                    title: { type: "string", description: "Title or headline." },
                    body: { type: "string", description: "Full Markdown (or plain text for threads) content." },
                    tags: { type: "array", items: { type: "string" }, description: "SEO / topic tags." },
                    publish: {
                        type: "boolean",
                        description: "If true, attempt to publish via configured integrations.",
                        default: false,
                    },
                },
                required: ["content_type", "title", "body"],
            },
        },
    },

    {
        type: "function",
        function: {
            name: "log_community_interaction",
            description:
                "Record a community interaction (reply, comment, GitHub issue response, Discord message). " +
                "Logs locally and optionally posts to the real platform.",
            parameters: {
                type: "object",
                properties: {
                    channel: { type: "string", enum: ["twitter", "github", "discord"] },
                    interaction_type: {
                        type: "string",
                        enum: ["reply", "comment", "answer", "thread_start", "dm"],
                    },
                    original_url: { type: "string", description: "URL of the post/issue being responded to." },
                    message: { type: "string", description: "The text of the agent's response." },
                    topic_tags: { type: "array", items: { type: "string" } },
                },
                required: ["channel", "interaction_type", "message"],
            },
        },
    },

    {
        type: "function",
        function: {
            name: "file_feature_request",
            description:
                "Submit a structured product feedback / feature request based on community signals " +
                "or direct RevenueCat API usage observations.",
            parameters: {
                type: "object",
                properties: {
                    title: { type: "string" },
                    problem_statement: { type: "string", description: "The developer pain point this solves." },
                    proposed_solution: { type: "string" },
                    evidence: {
                        type: "array",
                        items: { type: "string" },
                        description: "Community signal URLs or quotes.",
                    },
                    priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
                },
                required: ["title", "problem_statement", "proposed_solution", "priority"],
            },
        },
    },

    {
        type: "function",
        function: {
            name: "call_revenuecat_api",
            description:
                "Make an authenticated call to the RevenueCat REST API. " +
                "Use to fetch subscribers, list offerings, get transactions, etc.",
            parameters: {
                type: "object",
                properties: {
                    method: { type: "string", enum: ["GET", "POST", "PUT", "DELETE"] },
                    path: { type: "string", description: "API path, e.g. /subscribers/:app_user_id" },
                    body: { type: "object", description: "Request body for POST/PUT." },
                },
                required: ["method", "path"],
            },
        },
    },

    {
        type: "function",
        function: {
            name: "run_growth_experiment",
            description:
                "Design and log a growth experiment: programmatic SEO page, social campaign, " +
                "newsletter experiment, docs improvement, etc.",
            parameters: {
                type: "object",
                properties: {
                    experiment_type: {
                        type: "string",
                        enum: ["seo_page", "social_campaign", "email_campaign", "docs_improvement", "other"],
                    },
                    hypothesis: { type: "string" },
                    execution_plan: { type: "string" },
                    success_metric: { type: "string" },
                },
                required: ["experiment_type", "hypothesis", "execution_plan", "success_metric"],
            },
        },
    },

    {
        type: "function",
        function: {
            name: "web_search",
            description:
                "Search the web for developer discussions, Stack Overflow questions, GitHub issues, " +
                "or news relevant to RevenueCat, subscriptions, or mobile monetization.",
            parameters: {
                type: "object",
                properties: {
                    query: { type: "string" },
                    max_results: { type: "integer", default: 5 },
                },
                required: ["query"],
            },
        },
    },

    {
        type: "function",
        function: {
            name: "generate_weekly_report",
            description:
                "Compile a weekly performance report: content produced, community interactions, " +
                "feature requests filed, experiments run. Returns structured metrics.",
            parameters: {
                type: "object",
                properties: {
                    week_start: { type: "string", description: "ISO date string YYYY-MM-DD." },
                },
                required: ["week_start"],
            },
        },
    },
];

// ─────────────────────────────────────────────────────────────────────────────
// TOOL IMPLEMENTATIONS
// ─────────────────────────────────────────────────────────────────────────────

async function write_technical_content(args: {
    content_type: ContentType;
    title: string;
    body: string;
    tags?: string[];
    publish?: boolean;
}): Promise<object> {
    const record = {
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        content_type: args.content_type,
        title: args.title,
        body: args.body,
        tags: args.tags ?? [],
        published: false,
        publish_url: null as string | null,
    };

    appendRecord(CONTENT_FILE, record);
    console.log(`  [tool] Content saved: [${args.content_type}] ${args.title}`);

    if (args.publish && !DRY_RUN && args.content_type === "twitter_thread" && GITHUB_TOKEN) {
        record.publish_url = await publishGitHubGist(args.title, args.body);
        record.published = !!record.publish_url;
    }

    return {
        status: record.published ? "published" : "saved",
        id: record.id,
        publish_url: record.publish_url,
        word_count: args.body.split(/\s+/).length,
    };
}

function log_community_interaction(args: {
    channel: Channel;
    interaction_type: InteractionType;
    message: string;
    original_url?: string;
    topic_tags?: string[];
}): object {
    const record = {
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        channel: args.channel,
        interaction_type: args.interaction_type,
        original_url: args.original_url ?? null,
        message: args.message,
        topic_tags: args.topic_tags ?? [],
        posted: false,
    };

    appendRecord(INTERACTIONS_FILE, record);
    console.log(`  [tool] Interaction logged: [${args.channel}/${args.interaction_type}]`);

    return { status: "logged", id: record.id };
}

function file_feature_request(args: {
    title: string;
    problem_statement: string;
    proposed_solution: string;
    priority: Priority;
    evidence?: string[];
}): object {
    const record = {
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        title: args.title,
        problem_statement: args.problem_statement,
        proposed_solution: args.proposed_solution,
        priority: args.priority,
        evidence: args.evidence ?? [],
        submitted: false,
    };

    appendRecord(FEATURE_REQUESTS_FILE, record);
    console.log(`  [tool] Feature request filed: "${args.title}" [${args.priority}]`);

    return { status: "filed", id: record.id, priority: args.priority };
}

async function call_revenuecat_api(args: {
    method: string;
    path: string;
    body?: Record<string, unknown>;
}): Promise<object> {
    if (!REVENUECAT_API_KEY) return { error: "REVENUECAT_API_KEY not set" };

    const url = `${REVENUECAT_API_BASE}${args.path}`;

    if (DRY_RUN) {
        console.log(`  [tool] [DRY RUN] Would call RevenueCat API: ${args.method} ${url}`);
        return { dry_run: true, method: args.method, url };
    }

    try {
        const res = await fetch(url, {
            method: args.method,
            headers: {
                Authorization: `Bearer ${REVENUECAT_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: args.body ? JSON.stringify(args.body) : undefined,
        });

        if (!res.ok) return { error: `HTTP ${res.status}`, status_code: res.status };
        return (await res.json()) as object;
    } catch (e) {
        return { error: String(e) };
    }
}

function run_growth_experiment(args: {
    experiment_type: ExperimentType;
    hypothesis: string;
    execution_plan: string;
    success_metric: string;
}): object {
    const record = {
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        ...args,
        status: "planned",
    };

    appendRecord(EXPERIMENTS_FILE, record);
    console.log(`  [tool] Growth experiment logged: [${args.experiment_type}]`);

    return { status: "logged", id: record.id };
}

async function web_search(args: { query: string; max_results?: number }): Promise<object> {
    if (!TAVILY_API_KEY) {
        console.log("  [tool] TAVILY_API_KEY not set — returning mock results.");
        return {
            mock: true,
            query: args.query,
            results: [{ title: `Mock: ${args.query}`, url: "https://example.com", snippet: "Set TAVILY_API_KEY for real results." }],
        };
    }

    try {
        const res = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                api_key: TAVILY_API_KEY,
                query: args.query,
                max_results: args.max_results ?? 5,
                search_depth: "basic",
            }),
        });

        if (!res.ok) return { error: `Tavily HTTP ${res.status}` };

        const data = (await res.json()) as { results: Array<{ title: string; url: string; content: string }> };
        return {
            query: args.query,
            results: data.results.map((r) => ({
                title: r.title,
                url: r.url,
                snippet: r.content?.slice(0, 300),
            })),
        };
    } catch (e) {
        return { error: String(e), query: args.query };
    }
}

function generate_weekly_report(args: { week_start: string }): object {
    const start = new Date(args.week_start);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);

    const inWeek = (record: Record<string, unknown>) => {
        const ts = new Date((record["timestamp"] as string).slice(0, 10));
        return ts >= start && ts < end;
    };

    const content = loadRecords(CONTENT_FILE).filter(inWeek);
    const interactions = loadRecords(INTERACTIONS_FILE).filter(inWeek);
    const featureReqs = loadRecords(FEATURE_REQUESTS_FILE).filter(inWeek);
    const experiments = loadRecords(EXPERIMENTS_FILE).filter(inWeek);

    const byChannel = (ch: string) => interactions.filter((i) => i["channel"] === ch).length;

    const report = {
        week: `${args.week_start} → ${end.toISOString().slice(0, 10)}`,
        kpis: {
            content_pieces: { count: content.length, target: 2, met: content.length >= 2 },
            community_interactions: {
                count: interactions.length,
                target: 50,
                met: interactions.length >= 50,
                by_channel: { twitter: byChannel("twitter"), github: byChannel("github"), discord: byChannel("discord") },
            },
            feature_requests: { count: featureReqs.length, target: 3, met: featureReqs.length >= 3 },
            growth_experiments: { count: experiments.length, target: 1, met: experiments.length >= 1 },
        },
        content_titles: content.map((c) => c["title"]),
        feature_request_titles: featureReqs.map((f) => f["title"]),
        generated_at: new Date().toISOString(),
    };

    appendRecord(REPORTS_FILE, report);
    return report;
}

// ─────────────────────────────────────────────────────────────────────────────
// DISPATCH
// ─────────────────────────────────────────────────────────────────────────────

type ToolFn = (args: Record<string, unknown>) => Promise<object> | object;

const TOOL_DISPATCH: Record<string, ToolFn> = {
    write_technical_content: (a) => write_technical_content(a as Parameters<typeof write_technical_content>[0]),
    log_community_interaction: (a) => log_community_interaction(a as Parameters<typeof log_community_interaction>[0]),
    file_feature_request: (a) => file_feature_request(a as Parameters<typeof file_feature_request>[0]),
    call_revenuecat_api: (a) => call_revenuecat_api(a as Parameters<typeof call_revenuecat_api>[0]),
    run_growth_experiment: (a) => run_growth_experiment(a as Parameters<typeof run_growth_experiment>[0]),
    web_search: (a) => web_search(a as Parameters<typeof web_search>[0]),
    generate_weekly_report: (a) => generate_weekly_report(a as Parameters<typeof generate_weekly_report>[0]),
};

export async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
    const fn = TOOL_DISPATCH[name];
    if (!fn) return JSON.stringify({ error: `Unknown tool: ${name}` });
    try {
        const result = await fn(args);
        return JSON.stringify(result);
    } catch (e) {
        return JSON.stringify({ error: String(e) });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Private helpers
// ─────────────────────────────────────────────────────────────────────────────

async function publishGitHubGist(title: string, body: string): Promise<string | null> {
    if (!GITHUB_TOKEN) return null;
    try {
        const res = await fetch("https://api.github.com/gists", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${GITHUB_TOKEN}`,
                Accept: "application/vnd.github+json",
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                description: title,
                public: true,
                files: { [`${title.slice(0, 50)}.md`]: { content: body } },
            }),
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { html_url: string };
        return data.html_url;
    } catch {
        return null;
    }
}