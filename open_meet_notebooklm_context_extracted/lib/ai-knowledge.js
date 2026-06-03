import fs from 'fs';
import path from 'path';
// pdf-parse is replaced with pdf.js-extract for better stability

/**
 * Loads all training knowledge from the AiTraining directory (MD and PDF).
 * This ensures the AI is always using the "Club Ground Truth".
 */
export async function getTrainingKnowledge() {
  const trainingPath = path.join(process.cwd(), 'AiTraining');
  let knowledge = "\n\n# CLUB TRAINING KNOWLEDGE BASE (GROUND TRUTH)\n";

  try {
    const files = fs.readdirSync(trainingPath);
    
    // Process Markdown Files
    const mdFiles = files.filter(f => f.endsWith('.md'));
    for (const file of mdFiles) {
      const content = fs.readFileSync(path.join(trainingPath, file), 'utf8');
      knowledge += `\n--- DOCUMENT: ${file} ---\n${content}\n`;
    }

    // Process PDF Files
    const pdfFiles = files.filter(f => f.endsWith('.pdf'));
    for (const file of pdfFiles) {
      try {
        const pdfJsExtractPromise = require('pdf.js-extract');
        const PDFExtract = await pdfJsExtractPromise;
        const pdfExtract = typeof PDFExtract === 'function' ? new PDFExtract() : new PDFExtract.PDFExtract();
        
        const data = await pdfExtract.extract(path.join(trainingPath, file), {});
        
        const text = data.pages
          .map(page => page.content.map(item => item.str).join(' '))
          .join('\n');

        knowledge += `\n--- DOCUMENT (PDF): ${file} ---\n${text}\n`;
      } catch (pdfErr) {
        console.error(`Error parsing PDF ${file}:`, pdfErr);
      }
    }

    return knowledge;
  } catch (error) {
    console.error("Error loading training knowledge:", error);
    return "";
  }
}
