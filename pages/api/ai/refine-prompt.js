import fs from 'fs';
import path from 'path';
import { requireAdminAuth } from '../../../lib/api-auth';
import { generateText } from '../../../lib/ai_provider';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!await requireAdminAuth(req, res)) return;

  const { currentPrompt, dna, originalOutput, feedback } = req.body;
  
  if (!currentPrompt || !feedback) {
    return res.status(400).json({ error: 'Current prompt and feedback required' });
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

    const currentPath = path.join(promptsDir, `${req.body.facet || 'training'}.md`);
    
    // Backup existing
    if (fs.existsSync(currentPath)) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(historyDir, `${req.body.facet || 'training'}_${timestamp}.md`);
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
