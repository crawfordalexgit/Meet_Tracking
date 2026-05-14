const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config({ path: '.env.local' });

async function listModels() {
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY);
  try {
    const modelList = await genAI.listModels();
    console.log("Available Models:");
    modelList.models.forEach(m => {
      console.log(`- ${m.name} (Supports: ${m.supportedGenerationMethods.join(', ')})`);
    });
  } catch (error) {
    console.error("Error listing models:", error.message);
  }
}

listModels();
