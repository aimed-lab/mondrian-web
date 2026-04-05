/**
 * OpenAI API service.
 *
 * Single responsibility: communicate with the OpenAI completions endpoint.
 * No request handling, no rate limiting, no environment reading here —
 * those belong in the handler layer above.
 */

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

/**
 * Call the OpenAI chat completions endpoint.
 *
 * @param {object} opts
 * @param {string}   opts.apiKey
 * @param {string}   opts.model
 * @param {string}   opts.systemPrompt
 * @param {string}   opts.userPrompt
 * @param {number}  [opts.temperature=0.1]
 * @param {number}  [opts.maxTokens=1500]
 * @returns {Promise<{ explanation: string, model: string }>}
 * @throws {OpenAIError}
 */
export async function callOpenAI({
  apiKey,
  model,
  systemPrompt,
  userPrompt,
  temperature = 0.1,
  maxTokens = 1500,
}) {
  let response;

  try {
    response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature,
        // max_completion_tokens replaces the deprecated max_tokens for
        // GPT-5.4 nano and newer OpenAI models. Older models silently
        // accept it via the API's backward-compat layer.
        max_completion_tokens: maxTokens,
      }),
    });
  } catch (networkErr) {
    throw new OpenAIError(`Network error reaching OpenAI: ${networkErr.message}`, 503);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new OpenAIError(
      `OpenAI returned ${response.status}: ${body.slice(0, 200)}`,
      response.status,
    );
  }

  const data = await response.json();
  const explanation = data.choices?.[0]?.message?.content?.trim();

  if (!explanation) {
    throw new OpenAIError('OpenAI returned an empty response.', 502);
  }

  return { explanation, model: data.model ?? model };
}

export class OpenAIError extends Error {
  /** @param {string} message @param {number} statusCode */
  constructor(message, statusCode) {
    super(message);
    this.name = 'OpenAIError';
    this.statusCode = statusCode;
  }
}
