import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from 'fs';
import path from 'path';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { currentPrompt, dna, originalOutput, feedback } = req.body;
  
  if (!currentPrompt || !feedback) {
    return res.status(400).json({ error: 'Current prompt and feedback required' });
  }

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

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

    let attempts = 0;
    const maxAttempts = 3;
    let updatedPrompt = '';

    while (attempts < maxAttempts) {
      try {
        const result = await model.generateContent([metaPrompt, userMessage]);
        updatedPrompt = (await result.response).text();
        break; // Success
      } catch (error) {
        attempts++;
        console.error(`Refine Prompt Attempt ${attempts} failed:`, error.message);
        
        if ((error.message.includes('429') || error.message.includes('503')) && attempts < maxAttempts) {
          const delay = attempts * 2000;
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        throw error;
      }
    }

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
