import fs from 'fs';
import path from 'path';
import { requireAdminAuth } from '../../../lib/api-auth';
import { generateText } from '../../../lib/ai_provider';

const SAFE_FACET_RE = /^[a-z0-9_]+$/;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!await requireAdminAuth(req, res)) return;

  const { currentPrompt, dna, originalOutput, feedback } = req.body;

  if (!currentPrompt || !feedback) {
    return res.status(400).json({ error: 'Current prompt and feedback required' });
  }

  // This route WRITES ${facet}.md. prompts/save.js and prompts/rollback.js both
  // validate the facet; without the same check here, "../../pages/api/x" is an
  // arbitrary file write inside the deployment.
  const facet = req.body.facet || 'training';
  if (!SAFE_FACET_RE.test(facet)) {
    return res.status(400).json({ error: 'Invalid facet' });
  }

  try {
    const metaPromptPath = path.join(process.cwd(), 'lib', 'prompts', 'meta_prompter.md');
    const metaPrompt = fs.readFileSync(metaPromptPath, 'utf8');

    const userMessage = `
      CURRENT PROMPT:
      ${currentPrompt}

      ATHLETE DNA:
      ${JSON.stringify(dna, null, 2)}

      ORIGINAL AI OUTPUT:
      ${JSON.stringify(originalOutput, null, 2)}

      COACH FEEDBACK:
      "${feedback}"
    `;

    const updatedPrompt = await generateText({
      systemPrompt: metaPrompt,
      userPrompt: userMessage,
      logLabel: 'REFINE PROMPT'
    });

    const cleanedPrompt = updatedPrompt.replace(/^```markdown\n/, '').replace(/\n```$/, '').trim();

    // --- AUTO-SAVE LOGIC ---
    const promptsDir = path.join(process.cwd(), 'lib', 'prompts');
    const historyDir = path.join(promptsDir, '_history');
    if (!fs.existsSync(historyDir)) fs.mkdirSync(historyDir, { recursive: true });

    const currentPath = path.join(promptsDir, `${facet}.md`);

    // Backup existing
    if (fs.existsSync(currentPath)) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(historyDir, `${facet}_${timestamp}.md`);
      fs.copyFileSync(currentPath, backupPath);
    }

    // Save updated
    fs.writeFileSync(currentPath, cleanedPrompt, 'utf8');
    // --- END AUTO-SAVE ---

    res.status(200).json({ updatedPrompt: cleanedPrompt });
  } catch (err) {
    console.error("Refine Prompt Error:", err);
    res.status(500).json({ error: err.message });
  }
}
