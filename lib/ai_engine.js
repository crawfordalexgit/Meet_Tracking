import fs from 'fs';
import path from 'path';
import { getTrainingKnowledge } from './ai-knowledge';
import { generateJSON, chat as aiChat, activeProvider } from './ai_provider';

console.log(`>>> AI ENGINE: Initialized with provider=${activeProvider()}`);

export async function analyzeSwimmer(dna, type = 'general', instructions = null) {
  const facet = type === 'parent_audit' ? 'parent_audit' : (type === 'training' ? 'training' : (type === 'pathway' ? 'pathway' : 'general'));
  return analyzeFacet(dna, facet, null, type, instructions);
}

export async function analyzeSquad(dna, type = 'general') {
  const facet = type === 'club' || type === 'squad' || type === 'general' ? 'training' : type;
  return analyzeFacet(dna, facet, null, type);
}

export async function analyzeMeet(dna) {
  const facet = dna.metadata?.type === 'team' ? 'team_meet_audit' : 'meet_audit';
  return analyzeFacet(dna, facet, null, 'meet_audit');
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
    staffSection = `\n\n### COACHING NOTES & STAFF CONTEXT\nThese are notes entered by the coaching team about this meet. They may include observations on swimmer performance, meet conditions, squad priorities, scale/context data, or volunteer/helper credits. You MUST incorporate these insights into your narrative and recommendations. Credit named helpers in the support_team section:\n${dataDna.staff_context}\n`;
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

  console.log(`>>> AI ENGINE: Calling AI for ${facet}. Context length: ${userPrompt.length}`);
  if (pdfSection) console.log(`>>> AI ENGINE: PDF Evidence Preview: ${pdfSection.substring(0, 200).replace(/\n/g, ' ')}...`);

  return generateJSON({
    systemPrompt: finalSystemPrompt,
    userPrompt,
    // pathway/training facets emit deeply nested JSON (SWOT + safety_build_up +
    // risk_flags + action_items) that routinely overflowed the old 4096 cap,
    // truncating mid-object and failing to parse on every retry.
    maxTokens: 8192,
    temperature: 0.8,
    logLabel: 'AI ENGINE'
  });
}

export async function chatWithAssistant(history, clubDNA) {
  let systemPrompt = "You are the CoachesEye Assistant.";
  try {
    const promptPath = path.join(process.cwd(), 'lib', 'prompts', 'chat.md');
    if (fs.existsSync(promptPath)) {
      systemPrompt = fs.readFileSync(promptPath, 'utf8');
    }
  } catch (e) {}

  // clubDNA is the browser's squad-level summary and stays inline because it is
  // small. Per-athlete allocation and attendance are reached through tools
  // instead: pre-loading them cost ~20k tokens a turn, could only answer the
  // windows the prompt happened to anticipate, and left the model doing
  // arithmetic over hundreds of rows.
  const contextPrompt = `CLUB DATA CONTEXT (DNA):\n${JSON.stringify(clubDNA, null, 2)}`;
  const fullSystemPrompt = `${systemPrompt}\n\n${contextPrompt}`;

  const { TOOL_SPECS, runTool } = await import('./ai_tools');

  return aiChat({
    history,
    systemPrompt: fullSystemPrompt,
    tools: TOOL_SPECS,
    runTool
  });
}
