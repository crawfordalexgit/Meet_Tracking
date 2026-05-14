import { chatWithAssistant } from '../../../lib/ai';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { messages, clubDNA } = req.body;
  if (!messages || !clubDNA) {
    return res.status(400).json({ error: 'Messages and Club DNA are required.' });
  }

  try {
    const response = await chatWithAssistant(messages, clubDNA);
    res.status(200).json({ response });
  } catch (err) {
    console.error("Chat API Error:", err);
    res.status(500).json({ error: err.message });
  }
}
