/**
 * useAIExplain — React hook for the AI Explanation feature.
 *
 * Handles prompt assembly, API calls to the Netlify Function,
 * client-side rate-limit tracking, and response caching.
 */

import { useState, useRef, useCallback } from "react";
import { buildPrompt } from "../utils/promptBuilder";
import { CONFIG } from "../config";

/** Netlify function endpoint */
const ENDPOINT = "/.netlify/functions/ai-explain";

/**
 * @returns {{
 *   explanation: string | null,
 *   loading: boolean,
 *   error: string | null,
 *   remaining: number,
 *   resetAt: number | null,
 *   requestExplanation: Function,
 *   clearExplanation: Function,
 * }}
 */
export function useAIExplain() {
  const [explanation, setExplanation] = useState(null);
  const [modelName, setModelName] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [remaining, setRemaining] = useState(CONFIG.HOURLY_REQUEST_LIMIT);
  const [resetAt, setResetAt] = useState(null);

  // Cache keyed by sorted selected-node IDs → avoids duplicate API calls
  // (We now store an object { explanation, model } in the cache)
  const cache = useRef(new Map());

  /**
   * Request an AI explanation for the given selection.
   *
   * @param {Array}  selectedNodes  – entity objects from the Mondrian Map
   * @param {Array}  allEdges       – all relationship objects
   * @param {Object} metadata       – layoutJson.metadata
   * @param {Object} parameters     – current ParameterControls values
   */
  const requestExplanation = useCallback(
    async (selectedNodes, allEdges, metadata, parameters, force = false) => {
      // Need at least 1 selected term
      if (!selectedNodes || selectedNodes.length === 0) {
        setError("Please select at least one enriched term on the map.");
        return;
      }

      // Build cache key from sorted node IDs
      const cacheKey = selectedNodes
        .map((n) => n.id)
        .sort()
        .join("|");

      // Return cached result unless force-refresh was requested (Regenerate)
      if (!force && cache.current.has(cacheKey)) {
        const cached = cache.current.get(cacheKey);
        setExplanation(cached.explanation);
        setModelName(cached.model);
        setError(null);
        return;
      }

      // Remove stale cache entry so fresh result is stored after the call
      if (force) cache.current.delete(cacheKey);

      // Client-side rate-limit guard (prevents unnecessary round-trip)
      if (remaining <= 0 && resetAt && Date.now() < resetAt) {
        const mins = Math.ceil((resetAt - Date.now()) / 60000);
        setError(`Rate limit reached. Try again in ~${mins} minute${mins > 1 ? "s" : ""}.`);
        return;
      }

      setLoading(true);
      setError(null);
      setExplanation(null);
      setModelName(null);

      try {
        // Assemble prompts
        const { systemPrompt, userPrompt } = buildPrompt(
          selectedNodes,
          allEdges,
          metadata,
          parameters
        );

        // Call Netlify Function
        const res = await fetch(ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ systemPrompt, userPrompt }),
        });

        const data = await res.json();

        // Update rate-limit state from server headers / body
        if (data.remaining != null) setRemaining(data.remaining);
        if (data.resetAt != null) setResetAt(data.resetAt);

        if (res.status === 429) {
          throw new Error(data.error || "Rate limit exceeded.");
        }

        if (!res.ok) {
          throw new Error(data.error || `Server error (${res.status})`);
        }

        // Success — cache & display
        setExplanation(data.explanation);
        setModelName(data.model);
        cache.current.set(cacheKey, { explanation: data.explanation, model: data.model });
      } catch (err) {
        setError(err.message || "Something went wrong. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [remaining, resetAt]
  );

  /** Clear current explanation (e.g., when selection changes) */
  const clearExplanation = useCallback(() => {
    setExplanation(null);
    setModelName(null);
    setError(null);
  }, []);

  return {
    explanation,
    modelName,
    loading,
    error,
    remaining,
    resetAt,
    requestExplanation,
    clearExplanation,
  };
}
