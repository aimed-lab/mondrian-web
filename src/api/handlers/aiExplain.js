/**
 * AI Explain request handler.
 *
 * Deliberately framework-agnostic. It receives a plain normalized request
 * object and returns a plain normalized response object. It knows nothing
 * about Netlify events, Node.js http.IncomingMessage, or any other runtime.
 *
 * This makes it:
 *   • Easy to unit-test (no mocking of framework objects)
 *   • Portable (Netlify, Vercel, AWS Lambda, Vite dev middleware all adapt to it)
 *   • The single authoritative source of all AI Explain business logic
 *
 * Adapters live in src/api/functions/ and are intentionally trivial.
 */

import { rateLimiter } from '../middleware/rateLimiter.js';
import { callOpenAI, OpenAIError } from '../services/openai.js';
import { CONFIG } from '../../config.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build a rate-limit identifier from request headers.
 * Best-effort fingerprint — not cryptographic, just discriminating enough
 * to prevent casual abuse on a public tool.
 */
function buildIdentifier(headers) {
  const ip =
    headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    headers['client-ip'] ||
    'unknown';
  const ua = (headers['user-agent'] ?? '').slice(0, 80);
  return `${ip}||${ua}`;
}

/**
 * Print the full assembled prompt to the terminal for developer review.
 *
 * Controlled by:
 *   LOG_PROMPTS=true   in .env (explicit opt-in)
 *   NODE_ENV=development  (automatic in dev)
 *
 * This runs server-side (Vite dev middleware / Netlify function log),
 * so the API key is NEVER involved in what's printed.
 */
function logPromptToTerminal(systemPrompt, userPrompt) {
  const shouldLog =
    process.env.LOG_PROMPTS === 'true' ||
    process.env.NODE_ENV === 'development';

  if (!shouldLog) return;

  const W = 72;
  const line  = '─'.repeat(W);
  const dline = '═'.repeat(W);
  const cyan  = (s) => `\x1b[36m${s}\x1b[0m`;
  const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
  const dim   = (s) => `\x1b[2m${s}\x1b[0m`;

  console.log('\n' + cyan('╔' + dline + '╗'));
  console.log(cyan('║') + '  🧬 AI EXPLAIN — FULL PROMPT PREVIEW'.padEnd(W) + cyan('║'));
  console.log(cyan('╚' + dline + '╝'));

  console.log('\n' + yellow('── SYSTEM PROMPT ' + '─'.repeat(W - 17)));
  console.log(systemPrompt);

  console.log('\n' + yellow('── USER PROMPT ' + '─'.repeat(W - 15)));
  console.log(userPrompt);

  console.log('\n' + dim(line));
  console.log(dim(`  Char count — system: ${systemPrompt.length}  user: ${userPrompt.length}  total: ${systemPrompt.length + userPrompt.length}`));
  console.log(dim(line) + '\n');
}

/** Build a JSON response envelope. */
function json(status, data, extraHeaders = {}) {
  return {
    status,
    headers: { ...BASE_HEADERS, ...extraHeaders },
    body: JSON.stringify(data),
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Handle an AI Explain request.
 *
 * @param {{
 *   method:   string,
 *   headers:  Record<string, string>,
 *   rawBody:  string | null,
 * }} req  Normalized, framework-agnostic request.
 *
 * @returns {Promise<{
 *   status:  number,
 *   headers: Record<string, string>,
 *   body:    string,
 * }>} Normalized response.
 */
export async function handleAIExplain({ method, headers, rawBody }) {
  // ── CORS preflight ──────────────────────────────────────────────────────
  if (method === 'OPTIONS') {
    return { status: 204, headers: BASE_HEADERS, body: '' };
  }

  if (method !== 'POST') {
    return json(405, { error: 'Method Not Allowed' });
  }

  // ── Rate limiting ────────────────────────────────────────────────────────
  const id   = buildIdentifier(headers);
  const rate = rateLimiter.check(id);

  const rateHeaders = {
    'X-RateLimit-Limit':     String(CONFIG.HOURLY_REQUEST_LIMIT),
    'X-RateLimit-Remaining': String(rate.remaining),
    'X-RateLimit-Reset':     String(rate.resetAt),
  };

  if (!rate.allowed) {
    return json(429, {
      error:     `Rate limit exceeded. Maximum ${CONFIG.HOURLY_REQUEST_LIMIT} AI explanations per hour.`,
      remaining: 0,
      resetAt:   rate.resetAt,
    }, rateHeaders);
  }

  // ── Parse body ───────────────────────────────────────────────────────────
  let body;
  try {
    body = JSON.parse(rawBody || '{}');
  } catch {
    return json(400, { error: 'Request body must be valid JSON.' }, rateHeaders);
  }

  const { systemPrompt, userPrompt } = body;

  if (typeof systemPrompt !== 'string' || typeof userPrompt !== 'string' ||
      !systemPrompt.trim() || !userPrompt.trim()) {
    return json(400, { error: 'Both systemPrompt and userPrompt are required.' }, rateHeaders);
  }

  // Sanity-check lengths to guard against abuse
  if (systemPrompt.length > 6_000 || userPrompt.length > 25_000) {
    return json(400, { error: 'Prompt exceeds maximum allowed length.' }, rateHeaders);
  }

  // ── Log full prompt to terminal (dev / LOG_PROMPTS=true) ─────────────────
  logPromptToTerminal(systemPrompt, userPrompt);

  // ── API key guard ────────────────────────────────────────────────────────
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('[aiExplain] OPENAI_API_KEY is not set in the environment.');
    return json(500, {
      error: 'AI service is not configured. Set OPENAI_API_KEY in your environment.',
    }, rateHeaders);
  }

  const model = process.env.OPENAI_MODEL || 'gpt-5.4';

  // ── Call OpenAI ──────────────────────────────────────────────────────────
  try {
    const { explanation } = await callOpenAI({ apiKey, model, systemPrompt, userPrompt });

    return json(200, {
      explanation,
      model,
      remaining: rate.remaining,
      resetAt:   rate.resetAt,
    }, rateHeaders);

  } catch (err) {
    if (err instanceof OpenAIError) {
      // Map upstream 5xx → 502, 4xx → pass through
      const outStatus = err.statusCode >= 500 ? 502 : err.statusCode;
      console.error(`[aiExplain] OpenAIError (${err.statusCode}): ${err.message}`);
      return json(outStatus, {
        error:     'AI service temporarily unavailable. Please try again in a moment.',
        remaining: rate.remaining,
      }, rateHeaders);
    }

    // Unexpected (should never happen — defensive)
    console.error('[aiExplain] Unhandled error:', err);
    return json(502, {
      error:     'An unexpected error occurred. Please try again.',
      remaining: rate.remaining,
    }, rateHeaders);
  }
}
