const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

async function testGenerate() {
  const apiKey = process.env.GOOGLE_AI_KEY;
  const model = "gemini-3-flash-preview";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  console.log("Testing Generate Content with:", model);

  const payload = {
    contents: [{ parts: [{ text: "Identify yourself and say hello." }] }]
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    console.log("Result:", JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Fetch Error:", error.message);
  }
}

testGenerate();
