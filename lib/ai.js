import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from 'fs';
import path from 'path';
import { getTrainingKnowledge } from './ai-knowledge';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY);


/**
 * Unified AI reasoning engine.
 * Automatically handles Athlete, Squad, and Club contexts using facetted prompts.
 */
export async function analyzeSwimmer(dna, type = 'general') {
  return analyzeFacet(dna, 'general', null, type);
}

export async function analyzeSquad(dna, type = 'general') {
  const facet = type === 'club' || type === 'squad' || type === 'general' ? 'training' : type;
  return analyzeFacet(dna, facet, null, type);
}

/**
 * Facetted Intelligence: Analyzes a specific performance facet using a dedicated .md prompt.
 */
export async function analyzeFacet(dna, facet, customPrompt = null, type = 'general') {
  const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite-preview" }, { apiVersion: "v1beta" });
  
  let systemPrompt = customPrompt;
  
  if (!systemPrompt) {
    try {
      const promptPath = path.join(process.cwd(), 'lib', 'prompts', `${facet}.md`);
      if (fs.existsSync(promptPath)) {
        systemPrompt = fs.readFileSync(promptPath, 'utf8');
      } else {
        // Fallback to general if facet not found
        const generalPath = path.join(process.cwd(), 'lib', 'prompts', `general.md`);
        systemPrompt = fs.readFileSync(generalPath, 'utf8');
      }
    } catch (e) {
      console.error(`Prompt load failed [${facet}]:`, e.message);
      systemPrompt = "You are a professional swim coach. Analyze the following DNA data for insights. Return JSON.";
    }
  }

  // Handle specific sub-types (Burnout, Talent)
  let subTypeInstruction = "";
  if (type === 'burnout') {
    subTypeInstruction = "\n\nCRITICAL: Focus specifically on over-training and burnout risk. Look for declining performance despite high volume.";
  } else if (type === 'talent') {
    subTypeInstruction = "\n\nCRITICAL: Focus on identifying high potential. Look for rapid improvement rates relative to training volume.";
  }

  // Inject Club Knowledge Base
  const knowledgeBase = await getTrainingKnowledge();
  const finalSystemPrompt = `${systemPrompt}${subTypeInstruction}\n\n${knowledgeBase}`;

  // Explicitly set the context in the user prompt
  const isClub = dna.type === 'club' || dna.metadata?.squad_name === 'Club Overview';
  const isSquad = dna.squad_metrics || dna.metadata?.squad_name;
  const context = isClub ? "CLUB OVERVIEW" : (isSquad ? "SQUAD AUDIT" : "INDIVIDUAL ATHLETE PROFILE");

  const userPrompt = `CONTEXT: ${context}\nFACET: ${facet}\n\nInput Data (DNA):\n${JSON.stringify(dna, null, 2)}`;

  let attempts = 0;
  const maxAttempts = 2;

  while (attempts < maxAttempts) {
    try {
      const result = await model.generateContent([finalSystemPrompt, userPrompt]);
      const text = (await result.response).text();
      
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found in AI response");
      
      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      attempts++;
      const isQuota = error.message.includes('429') || error.message.includes('quota');
      
      let retrySeconds = 60;
      try {
        const details = error.errorDetails || (error.response && error.response.errorDetails);
        const retryInfo = details?.find(d => d.retryDelay);
        if (retryInfo) retrySeconds = parseInt(retryInfo.retryDelay.replace('s', '')) || 60;
      } catch (e) {}

      if (isQuota && attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, attempts * 2000));
        continue;
      }

      if (attempts >= maxAttempts) {
        return { 
          error: isQuota ? "AI Quota Limit Reached" : `Analysis failed: ${error.message}`,
          isQuotaLimit: isQuota,
          retryAfter: retrySeconds
        };
      }
    }
  }
}


/**
 * Interactive Chat Assistant
 * Handles conversational state and provides insights based on the full club context.
 */
export async function chatWithAssistant(history, clubDNA) {
  const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite-preview" }, { apiVersion: "v1beta" });
  
  let systemPrompt = "You are the CoachesEye Assistant.";
  try {
    const promptPath = path.join(process.cwd(), 'lib', 'prompts', 'chat.md');
    if (fs.existsSync(promptPath)) {
      systemPrompt = fs.readFileSync(promptPath, 'utf8');
    }
  } catch (e) {}

  const contextPrompt = `CLUB DATA CONTEXT (DNA):\n${JSON.stringify(clubDNA, null, 2)}`;
  
  // Format history for Gemini (must start with user)
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
