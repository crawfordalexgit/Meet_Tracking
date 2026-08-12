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
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
const GEMINI_REFINE_MODEL = process.env.GEMINI_REFINE_MODEL || 'gemini-1.5-flash';

let _genAI = null;
function getGenAI() {
  if (!_genAI) _genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY);
  return _genAI;
}

let _anthropic = null;
function getAnthropic() {
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

function extractJson(text) {
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
        console.error(`>>> ${logLabel}: JSON Parse failed. Raw text:`, text);
        console.error(`>>> ${logLabel}: Cleaned text:`, cleanJson);
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

      if (attempts >= maxAttempts) {
        console.error(`>>> ${logLabel}: Final failure after max attempts:`, error.message);
        return {
          error: isQuota ? "AI Quota Limit Reached" : `Analysis failed: ${error.message}`,
          isQuotaLimit: isQuota
        };
      }
    }
  }
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
}

/**
 * Multi-turn chat. `history` is [{role: 'user'|'assistant', content}], last entry is the new question.
 */
export async function chat({ history, systemPrompt, tools = null, runTool = null, maxToolRounds = 6 }) {
  const provider = resolveProvider();

  let cleanHistory = history;
  while (cleanHistory.length > 0 && cleanHistory[0].role !== 'user') {
    cleanHistory = cleanHistory.slice(1);
  }
  const lastUserMessage = cleanHistory[cleanHistory.length - 1]?.content || history[history.length - 1].content;

  // Tool-use loop: keep handing results back until the model answers in prose.
  // Only Claude supports this here; the Gemini path below stays plain chat.
  if (provider === 'claude' && tools?.length && runTool) {
    const messages = [
      ...cleanHistory.slice(0, -1).map(h => ({
        role: h.role === 'user' ? 'user' : 'assistant',
        content: h.content
      })),
      { role: 'user', content: lastUserMessage }
    ];

    for (let round = 0; round < maxToolRounds; round++) {
      const msg = await getAnthropic().messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 16000,
        system: systemPrompt,
        tools,
        messages
      });

      const calls = msg.content.filter(b => b.type === 'tool_use');
      if (!calls.length) {
        const text = msg.content.map(b => (b.type === 'text' ? b.text : '')).join('');
        if (text.trim()) return text;
        console.error(
          `AI PROVIDER: chat returned no text. stop_reason=${msg.stop_reason} ` +
          `blocks=${msg.content.map(b => b.type).join(',') || 'none'} ` +
          `in=${msg.usage?.input_tokens} out=${msg.usage?.output_tokens}`
        );
        return msg.stop_reason === 'max_tokens'
          ? 'That answer was too long for me to finish. Please narrow it down — for example ask about one squad at a time.'
          : 'I was unable to generate a response to that. Please try rephrasing the question.';
      }

      messages.push({ role: 'assistant', content: msg.content });
      const results = [];
      for (const call of calls) {
        console.log(`AI TOOL: ${call.name} ${JSON.stringify(call.input)}`);
        const result = await runTool(call.name, call.input);
        results.push({
          type: 'tool_result',
          tool_use_id: call.id,
          content: JSON.stringify(result)
        });
      }
      messages.push({ role: 'user', content: results });
    }

    return 'I needed too many lookups to answer that. Please ask something more specific.';
  }

  if (provider === 'claude') {
    const priorTurns = cleanHistory.slice(0, -1).map(h => ({
      role: h.role === 'user' ? 'user' : 'assistant',
      content: h.content
    }));
    const msg = await getAnthropic().messages.create({
      model: CLAUDE_MODEL,
      // This model reasons before answering, and that reasoning is charged
      // against max_tokens. At 4096 a roster question spent the entire budget
      // thinking and returned zero text blocks; at 2048 the visible answer was
      // truncated mid-table. Roster answers need room for both.
      max_tokens: 16000,
      system: systemPrompt,
      messages: [...priorTurns, { role: 'user', content: lastUserMessage }],
    });
    const text = msg.content.map(b => (b.type === 'text' ? b.text : '')).join('');
    if (!text.trim()) {
      // An empty string here renders as a blank chat bubble and looks like the
      // assistant ignored the question. Surface why instead.
      console.error(
        `AI PROVIDER: chat returned no text. stop_reason=${msg.stop_reason} ` +
        `blocks=${msg.content.map(b => b.type).join(',') || 'none'} ` +
        `in=${msg.usage?.input_tokens} out=${msg.usage?.output_tokens}`
      );
      if (msg.stop_reason === 'max_tokens') {
        return 'That answer was too long for me to finish. Please narrow it down — for example ask about one squad at a time.';
      }
      return 'I was unable to generate a response to that. Please try rephrasing the question.';
    }
    return text;
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
