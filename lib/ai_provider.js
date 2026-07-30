import { GoogleGenerativeAI } from "@google/generative-ai";
import Anthropic from "@anthropic-ai/sdk";

// Provider selection: AI_PROVIDER env var wins ('claude' | 'gemini').
// Otherwise favour Claude when a key is present, else fall back to Gemini.
function resolveProvider() {
  const forced = (process.env.AI_PROVIDER || '').toLowerCase();
  if (forced === 'claude' || forced === 'gemini') return forced;
  if (process.env.ANTHROPIC_API_KEY) return 'claude';
  return 'gemini';
}

const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
// Both Gemini defaults now name the same known-good model. The JSON path used
// to default to 'gemini-3.1-flash-lite' while the refine path had already been
// corrected to gemini-1.5-flash, so the two code paths silently ran different
// model families. Override with GEMINI_MODEL / GEMINI_REFINE_MODEL to move to a
// newer id once it has been verified against the account's model list.
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
const GEMINI_REFINE_MODEL = process.env.GEMINI_REFINE_MODEL || 'gemini-1.5-flash';

let _genAI = null;
function getGenAI() {
  // Explicit guard: without it a missing key surfaces as an opaque SDK error at
  // request time rather than a clear configuration failure. lib/supabase.js
  // does the same for its service-role key.
  if (!process.env.GOOGLE_AI_KEY) {
    throw new Error('Missing GOOGLE_AI_KEY. Set it in the hosting environment, or set AI_PROVIDER=claude with ANTHROPIC_API_KEY.');
  }
  if (!_genAI) _genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY);
  return _genAI;
}

let _anthropic = null;
function getAnthropic() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('Missing ANTHROPIC_API_KEY. Set it in the hosting environment, or set AI_PROVIDER=gemini with GOOGLE_AI_KEY.');
  }
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}

console.log(`>>> AI PROVIDER: Active provider = ${resolveProvider()}`);

function isRetryableError(error, provider) {
  const msg = error.message || '';
  if (provider === 'claude') {
    return msg.includes('429') || msg.includes('529') || error.status === 429 || error.status === 529;
  }
  return msg.includes('429') || msg.includes('quota') || msg.includes('503');
}

// Exported for unit testing: this is the pure, deterministic step between the
// model response and JSON.parse, and a bug here surfaces as "Analysis failed".
export function extractJson(text) {
  let cleanJson = text.trim();

  if (cleanJson.startsWith('```')) {
    cleanJson = cleanJson.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  const firstBrace = cleanJson.indexOf('{');
  const lastBrace = cleanJson.lastIndexOf('}');
  const firstBracket = cleanJson.indexOf('[');
  const lastBracket = cleanJson.lastIndexOf(']');

  let start = -1;
  let end = -1;

  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    start = firstBrace;
    end = lastBrace;
  } else if (firstBracket !== -1) {
    start = firstBracket;
    end = lastBracket;
  }

  if (start !== -1 && end !== -1 && end > start) {
    cleanJson = cleanJson.substring(start, end + 1);
  }

  cleanJson = cleanJson.replace(/,(\s*[\]}])/g, '$1');
  return cleanJson;
}

/**
 * Generate JSON output from a system + user prompt, with retry on rate limits.
 * Returns parsed object, or { error, isQuotaLimit } on final failure.
 */
export async function generateJSON({ systemPrompt, userPrompt, maxTokens = 4096, temperature = 0.8, logLabel = 'AI ENGINE' }) {
  const provider = resolveProvider();
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    try {
      let text;
      if (provider === 'claude') {
        // `temperature` is rejected (400) by claude-sonnet-5 and later models — omit it for Claude.
        const msg = await getAnthropic().messages.create({
          model: CLAUDE_MODEL,
          max_tokens: maxTokens,
          system: `${systemPrompt}\n\nRespond with valid JSON only. No markdown code fences, no commentary.`,
          messages: [{ role: 'user', content: userPrompt }],
        });
        text = msg.content.map(b => (b.type === 'text' ? b.text : '')).join('');
      } else {
        const model = getGenAI().getGenerativeModel(
          {
            model: GEMINI_MODEL,
            systemInstruction: systemPrompt,
            generationConfig: { maxOutputTokens: maxTokens, temperature, responseMimeType: "application/json" }
          },
          { apiVersion: 'v1beta' }
        );
        const result = await model.generateContent(userPrompt);
        text = (await result.response).text();
      }

      console.log(`>>> ${logLabel}: Received response from ${provider} (${text.length} chars)`);
      const cleanJson = extractJson(text);

      try {
        return JSON.parse(cleanJson);
      } catch (parseError) {
        // Length only — the raw model response echoes athlete names and squad
        // data into the platform logs.
        console.error(`>>> ${logLabel}: JSON parse failed (${text.length} raw chars, ${cleanJson.length} cleaned).`);
        throw parseError;
      }
    } catch (error) {
      attempts++;
      const isQuota = isRetryableError(error, provider);

      if (isQuota && attempts < maxAttempts) {
        const waitTime = attempts * 5000;
        console.warn(`>>> ${logLabel}: Rate/quota limit hit (${provider}). Waiting ${waitTime / 1000}s before retry...`);
        await new Promise(r => setTimeout(r, waitTime));
        continue;
      }

      // Return on ANY non-retryable error, not just once attempts are exhausted.
      // Falling through here meant a bad request (invalid model, malformed
      // prompt) was retried twice more before reporting the same failure.
      console.error(`>>> ${logLabel}: Failing after ${attempts} attempt(s):`, error.message);
      return {
        error: isQuota ? "AI Quota Limit Reached" : `Analysis failed: ${error.message}`,
        isQuotaLimit: isQuota
      };
    }
  }

  // Unreachable in practice, but never let this function resolve undefined:
  // callers dereference the result.
  return { error: 'Analysis failed: retry loop exhausted', isQuotaLimit: false };
}

/**
 * Generate plain text output from a system + user prompt, with retry on rate limits.
 * Throws on final failure (caller handles).
 */
export async function generateText({ systemPrompt, userPrompt, maxTokens = 4096, temperature = 0.7, logLabel = 'AI ENGINE' }) {
  const provider = resolveProvider();
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    try {
      if (provider === 'claude') {
        // `temperature` is rejected (400) by claude-sonnet-5 and later models — omit it for Claude.
        const msg = await getAnthropic().messages.create({
          model: CLAUDE_MODEL,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        });
        return msg.content.map(b => (b.type === 'text' ? b.text : '')).join('');
      } else {
        const model = getGenAI().getGenerativeModel({ model: GEMINI_REFINE_MODEL });
        const result = await model.generateContent([systemPrompt, userPrompt]);
        return (await result.response).text();
      }
    } catch (error) {
      attempts++;
      console.error(`Refine attempt ${attempts} failed (${provider}):`, error.message);
      const isQuota = isRetryableError(error, provider);
      if (isQuota && attempts < maxAttempts) {
        const delay = attempts * 2000;
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw error;
    }
  }

  // Never resolve undefined — callers use the return value directly.
  throw new Error('generateText: retry loop exhausted without a result');
}

/**
 * Multi-turn chat. `history` is [{role: 'user'|'assistant', content}], last entry is the new question.
 */
export async function chat({ history, systemPrompt }) {
  const provider = resolveProvider();

  let cleanHistory = history;
  while (cleanHistory.length > 0 && cleanHistory[0].role !== 'user') {
    cleanHistory = cleanHistory.slice(1);
  }
  const lastUserMessage = cleanHistory[cleanHistory.length - 1]?.content || history[history.length - 1].content;

  if (provider === 'claude') {
    const priorTurns = cleanHistory.slice(0, -1).map(h => ({
      role: h.role === 'user' ? 'user' : 'assistant',
      content: h.content
    }));
    const msg = await getAnthropic().messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [...priorTurns, { role: 'user', content: lastUserMessage }],
    });
    return msg.content.map(b => (b.type === 'text' ? b.text : '')).join('');
  }

  const model = getGenAI().getGenerativeModel({ model: GEMINI_MODEL }, { apiVersion: 'v1beta' });
  const geminiHistory = cleanHistory.slice(0, -1).map(h => ({
    role: h.role === 'user' ? 'user' : 'model',
    parts: [{ text: h.content }]
  }));
  const geminiChat = model.startChat({ history: geminiHistory });
  const result = await geminiChat.sendMessage(`${systemPrompt}\n\nUSER QUESTION: ${lastUserMessage}`);
  return (await result.response).text();
}

export function activeProvider() {
  return resolveProvider();
}
