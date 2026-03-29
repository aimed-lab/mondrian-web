/**
 * Netlify Functions adapter — AI Explain.
 *
 * This file is intentionally a thin shim. All business logic lives in
 * src/api/handlers/aiExplain.js. If you ever migrate away from Netlify
 * (Vercel, AWS Lambda, Cloudflare Workers), replace ONLY this file.
 *
 * Netlify event → our normalized request → our normalized response → Netlify response
 */

import { handleAIExplain } from '../handlers/aiExplain.js';

export async function handler(event) {
  const result = await handleAIExplain({
    method:  event.httpMethod,
    headers: event.headers ?? {},
    rawBody: event.body ?? null,
  });

  return {
    statusCode: result.status,
    headers:    result.headers,
    body:       result.body,
  };
}
