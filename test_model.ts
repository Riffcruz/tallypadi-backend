import { GoogleGenAI } from '@google/genai';
import { env } from './src/config/env';

const ai = new GoogleGenAI({ apiKey: env.geminiApiKey });

async function testModel(modelName: string) {
  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: 'Hello',
    });
    console.log(`Model ${modelName} works! Response: ${response.text}`);
  } catch (error: any) {
    console.error(`Model ${modelName} failed:`, error.message);
  }
}

testModel('gemini-2.5-flash');
testModel('gemini-2.0-flash');
testModel('gemini-1.5-flash');
