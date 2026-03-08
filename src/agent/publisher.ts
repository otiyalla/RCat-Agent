/**
 * publisher.ts
 * Operator-facing publish pipeline.
 *
 * After the agent drafts content (published: false), the human operator
 * reviews data/content_log.json and triggers publishing via the CLI.
 *
 * Supported targets per content_type:
 *   blog_post      → GitHub Gist (Markdown)
 *   tutorial       → GitHub Gist (Markdown)
 *   code_sample    → GitHub Gist (Markdown)
 *   twitter_thread → Twitter/X API v2  (falls back to stdout if no token)
 *   discord_post   → Discord Webhook   (falls back to stdout if no webhook)
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { GITHUB_TOKEN, TWITTER_BEARER_TOKEN, DATA_DIR } from "./config";

const CONTENT_FILE = `${DATA_DIR}/content_log.json`;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ContentRecord {
  id: string;
  timestamp: string;
  content_type: "blog_post" | "tutorial" | "code_sample" | "twitter_thread" | "discord_post";
  title: string;
  body: string;
  tags: string[];
  published: boolean;
  publish_url: string | null;
  published_at?: string;
  published_by?: string;
}

export interface PublishResult {
  id: string;
  title: string;
  success: boolean;
  url: string | null;
  error?: string | undefined;
  skipped?: boolean | undefined;
  reason?: string | undefined;
}

// ── Record helpers ────────────────────────────────────────────────────────────

function loadContent(): ContentRecord[] {
  if (!existsSync(CONTENT_FILE)) return [];
  return JSON.parse(readFileSync(CONTENT_FILE, "utf8")) as ContentRecord[];
}

function saveContent(records: ContentRecord[]): void {
  writeFileSync(CONTENT_FILE, JSON.stringify(records, null, 2));
}

function updateRecord(id: string, patch: Partial<ContentRecord>): void {
  const records = loadContent();
  const idx = records.findIndex((r) => r.id === id);
  if (idx === -1) throw new Error(`Record not found: ${id}`);
  records[idx] = { ...records[idx]!, ...patch };
  saveContent(records);
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Return all content records that haven't been published yet. */
export function listUnpublished(): ContentRecord[] {
  return loadContent().filter((r) => !r.published);
}

/** Return all content records (published and unpublished). */
export function listAll(): ContentRecord[] {
  return loadContent();
}

/** Find a single record by ID (partial match OK). */
export function findById(id: string): ContentRecord | undefined {
  return loadContent().find((r) => r.id.startsWith(id));
}

/**
 * Publish a single content record by ID.
 * Marks it published=true and writes the URL back to the log.
 */
export async function publishOne(id: string): Promise<PublishResult> {
  const record = findById(id);

  if (!record) {
    return { id, title: "unknown", success: false, url: null, error: `No record found with id starting '${id}'` };
  }

  if (record.published) {
    return {
      id: record.id,
      title: record.title,
      success: true,
      url: record.publish_url,
      skipped: true,
      reason: "Already published",
    };
  }

  let url: string | null = null;
  let error: string | undefined;

  try {
    switch (record.content_type) {
      case "blog_post":
      case "tutorial":
      case "code_sample":
        url = await publishToGitHubGist(record);
        break;
      case "twitter_thread":
        url = await publishToTwitter(record);
        break;
      case "discord_post":
        url = await publishToDiscord(record);
        break;
    }
  } catch (e) {
    error = String(e);
  }

  const success = !error && url !== null;

  updateRecord(record.id, {
    published: success,
    publish_url: url,
    published_at: new Date().toISOString(),
    published_by: "operator",
  });

  return { id: record.id, title: record.title, success, url, error };
}

/**
 * Publish all pending (unpublished) content records.
 * Processes sequentially to avoid rate-limiting.
 */
export async function publishAll(): Promise<PublishResult[]> {
  const pending = listUnpublished();
  if (pending.length === 0) return [];

  const results: PublishResult[] = [];
  for (const record of pending) {
    const result = await publishOne(record.id);
    results.push(result);
    // Small delay to respect rate limits
    await new Promise((r) => setTimeout(r, 500));
  }
  return results;
}

// ── Publishers ────────────────────────────────────────────────────────────────

async function publishToGitHubGist(record: ContentRecord): Promise<string> {
  if (!GITHUB_TOKEN) throw new Error("GITHUB_TOKEN not set — cannot publish to GitHub Gist.");

  const filename = `${record.title.slice(0, 50).replace(/[^a-z0-9\s-]/gi, "").trim().replace(/\s+/g, "-")}.md`;

  const res = await fetch("https://api.github.com/gists", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      description: record.title,
      public: true,
      files: { [filename]: { content: record.body } },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub Gist API error ${res.status}: ${err}`);
  }

  const data = (await res.json()) as { html_url: string };
  return data.html_url;
}

async function publishToTwitter(record: ContentRecord): Promise<string> {
  if (!TWITTER_BEARER_TOKEN) {
    // Graceful fallback: print to stdout so operator can post manually
    console.log("\n── Twitter/X thread (post manually) ──────────────────────");
    console.log(record.body);
    console.log("──────────────────────────────────────────────────────────\n");
    return "stdout://manual-post";
  }

  // Twitter API v2 — post first tweet; thread continuation would require
  // chaining reply_to IDs. For now we post the first 280 chars as a tweet.
  const tweetText = record.body.slice(0, 280);

  const res = await fetch("https://api.twitter.com/2/tweets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TWITTER_BEARER_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text: tweetText }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Twitter API error ${res.status}: ${err}`);
  }

  const data = (await res.json()) as { data: { id: string } };
  return `https://twitter.com/i/web/status/${data.data.id}`;
}

async function publishToDiscord(record: ContentRecord): Promise<string> {
  if (!DISCORD_WEBHOOK_URL) {
    // Graceful fallback
    console.log("\n── Discord post (send manually) ──────────────────────────");
    console.log(record.body);
    console.log("──────────────────────────────────────────────────────────\n");
    return "stdout://manual-post";
  }

  const res = await fetch(DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: record.body.slice(0, 2000), // Discord message limit
      username: "RCat",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Discord webhook error ${res.status}: ${err}`);
  }

  return DISCORD_WEBHOOK_URL.split("/").slice(0, 5).join("/"); // sanitised URL
}

// ── Display helpers ───────────────────────────────────────────────────────────

/** Pretty-print a content record for operator review. */
export function printRecord(record: ContentRecord, verbose = false): void {
  const status = record.published ? "✅ published" : "⏳ pending";
  const short = record.id.slice(0, 8);
  const date = record.timestamp.slice(0, 10);

  console.log(`\n  ${status}  [${short}]  ${record.content_type.padEnd(16)}  ${date}`);
  console.log(`           "${record.title}"`);
  if (record.tags.length > 0) console.log(`           tags: ${record.tags.join(", ")}`);
  if (record.publish_url) console.log(`           url:  ${record.publish_url}`);

  if (verbose) {
    console.log(`\n${"─".repeat(60)}`);
    console.log(record.body);
    console.log("─".repeat(60));
  }
}

/** Print a summary table of publish results. */
export function printResults(results: PublishResult[]): void {
  console.log(`\n${"=".repeat(60)}`);
  console.log("PUBLISH RESULTS");
  console.log("=".repeat(60));

  let ok = 0, skipped = 0, failed = 0;

  for (const r of results) {
    if (r.skipped) {
      console.log(`  ⏭️  [${r.id.slice(0, 8)}] ${r.title} — ${r.reason}`);
      skipped++;
    } else if (r.success) {
      console.log(`  ✅  [${r.id.slice(0, 8)}] ${r.title}`);
      if (r.url) console.log(`       → ${r.url}`);
      ok++;
    } else {
      console.log(`  ❌  [${r.id.slice(0, 8)}] ${r.title}`);
      if (r.error) console.log(`       error: ${r.error}`);
      failed++;
    }
  }

  console.log(`\n  Total: ${results.length}  ✅ ${ok}  ⏭️  ${skipped}  ❌ ${failed}`);
}
