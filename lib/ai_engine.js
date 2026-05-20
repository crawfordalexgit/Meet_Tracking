import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from 'fs';
import path from 'path';
import { getTrainingKnowledge } from './ai-knowledge';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY);
console.log(">>> AI ENGINE: Initialized with gemini-3.1-flash-lite (v1)");

export async function analyzeSwimmer(dna, type = 'general', instructions = null) {
  return analyzeFacet(dna, 'general', null, type, instructions);
}

export async function analyzeSquad(dna, type = 'general') {
  const facet = type === 'club' || type === 'squad' || type === 'general' ? 'training' : type;
  return analyzeFacet(dna, facet, null, type);
}

export async function analyzeMeet(dna) {
  return analyzeFacet(dna, 'meet_audit', null, 'meet_audit');
}

export async function parseResults(text, targetDate = null) {
  return analyzeFacet({ pdf_evidence: text, target_date: targetDate }, 'result_parser', null, 'result_parser');
}

export async function analyzeFacet(dna, facet, customPrompt = null, type = 'general', instructions = null) {
  
  let systemPrompt = customPrompt;
  
  if (!systemPrompt) {
    try {
      const promptPath = path.join(process.cwd(), 'lib', 'prompts', `${facet}.md`);
      if (fs.existsSync(promptPath)) {
        systemPrompt = fs.readFileSync(promptPath, 'utf8');
      } else {
        const generalPath = path.join(process.cwd(), 'lib', 'prompts', `general.md`);
        systemPrompt = fs.readFileSync(generalPath, 'utf8');
      }
    } catch (e) {
      console.error(`Prompt load failed [${facet}]:`, e.message);
      systemPrompt = "You are a professional swim coach. Analyze the following DNA data for insights. Return JSON.";
    }
  }

  let subTypeInstruction = "";
  if (type === 'burnout') {
    subTypeInstruction = "\n\nCRITICAL: Focus specifically on over-training and burnout risk.";
  } else if (type === 'talent') {
    subTypeInstruction = "\n\nCRITICAL: Focus on identifying high potential.";
  } else if (type === 'block_audit') {
    subTypeInstruction = "\n\nCRITICAL: Focus on the Training Block ROI (TEI) and drop-off speed endurance ratios. Provide high-yield technical skill corrections.";
  }

  if (instructions && Array.isArray(instructions) && instructions.length > 0) {
    subTypeInstruction += "\n\nCUSTOM STRATEGIC DIRECTIVES:\n" + instructions.map(ins => `- ${ins}`).join("\n");
  }

  let knowledgeBase = await getTrainingKnowledge();
  if (knowledgeBase.length > 10000) {
    knowledgeBase = knowledgeBase.substring(0, 10000) + "... [KNOWLEDGE TRUNCATED FOR CONTEXT SPACE]";
  }
  const finalSystemPrompt = `${systemPrompt}${subTypeInstruction}\n\n${knowledgeBase}`;
  console.log(`>>> AI ENGINE: System Prompt Length: ${finalSystemPrompt.length} chars`);

  const model = genAI.getGenerativeModel(
    { 
      model: "gemini-3.1-flash-lite",
      systemInstruction: finalSystemPrompt,
      generationConfig: {
        maxOutputTokens: 4096,
        temperature: 0.8,
        responseMimeType: "application/json"
      }
    }, 
    { apiVersion: 'v1beta' }
  );

  const isClub = dna.type === 'club' || dna.metadata?.squad_name === 'Club Overview';
  const isSquad = dna.squad_metrics || dna.metadata?.squad_name;
  const context = isClub ? "CLUB OVERVIEW" : (isSquad ? "SQUAD AUDIT" : "INDIVIDUAL ATHLETE PROFILE");
  
  let pdfSection = "";
  let staffSection = "";
  let dataDna = { ...dna };
  
  if (dataDna.pdf_evidence) {
    pdfSection = `\n\n[PDF_EVIDENCE_START]\n${dataDna.pdf_evidence}\n[PDF_EVIDENCE_END]\n`;
    delete dataDna.pdf_evidence;
  }
  
  if (dataDna.staff_context) {
    console.log(`>>> AI ENGINE: Staff Context detected. Preview: ${dataDna.staff_context.substring(0, 100)}...`);
    staffSection = `\n\n### SUPPORT STAFF & VOLUNTEERS (TSC Helpers)\nUse these names and roles to credit the team in your report:\n${dataDna.staff_context}\n`;
    delete dataDna.staff_context;
  }

  const dnaString = JSON.stringify(dataDna, null, 2);
  console.log(`>>> AI ENGINE: DNA Data Length: ${dnaString.length} chars`);
  const userPrompt = `CONTEXT: ${context}
FACET: ${facet}

### PRIMARY RESULTS (Database Records)
These are the official times and PB status from our database. Use these to identify Personal Bests.
${dnaString}
${staffSection}

### OFFICIAL RANKINGS EVIDENCE (Gala PDF)
These are the extracted lines from the official gala results. Use these to identify Medals and Podium finishes.
${pdfSection}`;

  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    try {
      console.log(`>>> AI ENGINE: Calling Gemini for ${facet}. Context length: ${userPrompt.length}`);
      if (pdfSection) console.log(`>>> AI ENGINE: PDF Evidence Preview: ${pdfSection.substring(0, 200).replace(/\n/g, ' ')}...`);
      
      const result = await model.generateContent(userPrompt);
      const text = (await result.response).text();
      console.log(`>>> AI ENGINE: Received response from Gemini (${text.length} chars)`);
      
      // Robust JSON extraction
      let cleanJson = text.trim();
      
      // Remove markdown code blocks if present
      if (cleanJson.startsWith('```')) {
        cleanJson = cleanJson.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }

      // Find the first { and last } to isolate the object
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

      // Remove trailing commas before closing braces/brackets
      cleanJson = cleanJson.replace(/,(\s*[\]}])/g, '$1');

      try {
        return JSON.parse(cleanJson);
      } catch (parseError) {
        console.error(">>> AI ENGINE: JSON Parse failed. Raw text:", text);
        console.error(">>> AI ENGINE: Cleaned text:", cleanJson);
        throw parseError;
      }
    } catch (error) {
      attempts++;
      const isQuota = error.message.includes('429') || error.message.includes('quota');
      
      if (isQuota && attempts < maxAttempts) {
        const waitTime = attempts * 5000; // 5s, 10s...
        console.warn(`>>> AI ENGINE: Quota limit hit. Waiting ${waitTime/1000}s before retry...`);
        await new Promise(r => setTimeout(r, waitTime));
        continue;
      }

      if (attempts >= maxAttempts) {
        console.error(">>> AI ENGINE: Final failure after max attempts:", error.message);
        return { 
          error: isQuota ? "AI Quota Limit Reached" : `Analysis failed: ${error.message}`,
          isQuotaLimit: isQuota
        };
      }
    }
  }
}

export async function chatWithAssistant(history, clubDNA) {
  const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" }, { apiVersion: 'v1beta' });
  
  let systemPrompt = "You are the CoachesEye Assistant.";
  try {
    const promptPath = path.join(process.cwd(), 'lib', 'prompts', 'chat.md');
    if (fs.existsSync(promptPath)) {
      systemPrompt = fs.readFileSync(promptPath, 'utf8');
    }
  } catch (e) {}

  const contextPrompt = `CLUB DATA CONTEXT (DNA):\n${JSON.stringify(clubDNA, null, 2)}`;
  
  let cleanHistory = history;
  while (cleanHistory.length > 0 && cleanHistory[0].role !== 'user') {
    cleanHistory = cleanHistory.slice(1);
  }

  const geminiHistory = cleanHistory.slice(0, -1).map(h => ({
    role: h.role === 'user' ? 'user' : 'model',
    parts: [{ text: h.content }]
  }));

  const chat = model.startChat({
    history: geminiHistory,
  });

  const lastUserMessage = cleanHistory[cleanHistory.length - 1]?.content || history[history.length - 1].content;
  const result = await chat.sendMessage(`${systemPrompt}\n\n${contextPrompt}\n\nUSER QUESTION: ${lastUserMessage}`);

  return (await result.response).text();
}
