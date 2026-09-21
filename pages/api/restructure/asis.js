import fs from 'fs';
import path from 'path';
import { requireAuth } from '../../../lib/api-auth';
import { generateText } from '../../../lib/ai_provider';
import { fetchRestructureBaseline, resolveAttendanceDays } from '../../../lib/restructure-baseline';
import { buildAsIsReport } from '../../../lib/restructure-asis';

/**
 * The club as it stands, as figures and — on request — as prose.
 *
 * GET returns the report alone, which is what the page renders. POST adds a
 * written briefing on top of exactly those figures.
 *
 * The split matters: every number is computed in lib/restructure-asis.js and
 * handed to the write-up already finished, with the working spelled out. The
 * prompt is instructed to quote and never calculate, so the briefing cannot
 * drift from the tables beside it — and the page is fully usable with the
 * briefing empty, which is what happens when a provider is down.
 */
export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!await requireAuth(req, res)) return;

  try {
    // The window travels with the request so a report can be read over the last
    // month or the last year without changing anything else.
    const attendanceDays = resolveAttendanceDays(req.query.attendanceDays);
    // Holiday weeks are excluded unless the reader asks for the blended picture.
    const termOnly = req.query.termOnly !== '0';
    const baseline = await fetchRestructureBaseline({ attendanceDays, termOnly });
    const report = buildAsIsReport(baseline);
    if (!report) return res.status(500).json({ error: 'Could not read the club record' });

    if (req.method === 'GET') {
      return res.status(200).json({ success: true, report });
    }

    // The write-up is the part that can fail. The figures are already in hand,
    // so they go back either way — a provider outage should cost the prose, not
    // the report it was describing.
    try {
      const promptPath = path.join(process.cwd(), 'lib', 'prompts', 'restructure-asis.md');
      const systemPrompt = fs.readFileSync(promptPath, 'utf8');

      const narrative = await generateText({
        systemPrompt,
        userPrompt: `Write the committee briefing on the club as it stands.\n\n${JSON.stringify(report, null, 2)}`,
        // This model reasons before answering and that reasoning is charged
        // against max_tokens, the same trap lib/ai_provider.js records for chat.
        // At 2000 the thinking ate the budget and the briefing came back cut
        // off mid-sentence after 254 characters, with no error to say why.
        maxTokens: 16000,
        temperature: 0.4,
        logLabel: 'RESTRUCTURE AS-IS'
      });

      return res.status(200).json({ success: true, report, narrative });
    } catch (writeUpError) {
      console.error('restructure/asis write-up failed:', writeUpError);
      return res.status(200).json({
        success: false, report, narrative: null, error: writeUpError.message
      });
    }
  } catch (error) {
    console.error('restructure/asis failed:', error);
    return res.status(500).json({ error: error.message || 'Could not build the report' });
  }
}
