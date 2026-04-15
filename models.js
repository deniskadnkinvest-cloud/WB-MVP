import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
async function checkModels() {
  try {
    const list = await ai.models.list();
    console.log("Доступные модели:");
    for await (const m of list) {
        if (m.name.includes("imagen") || m.name.includes("image") || m.name.includes("banano")) {
            console.log(m.name);
        }
    }
  } catch (err) {
    console.error(err);
  }
}
checkModels();
