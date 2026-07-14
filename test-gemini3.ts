import { GoogleGenAI } from '@google/genai';
import { env } from './src/config/env';

async function test() {
  console.log('Testing with API KEY:', env.geminiApiKey ? 'SET' : 'MISSING');
  const ai = new GoogleGenAI({ apiKey: env.geminiApiKey });

  try {
    console.log('Attempting caches.create with gemini-1.5-flash-001...');
    const cache = await ai.caches.create({
      model: 'gemini-1.5-flash-001',
      config: {
        systemInstruction: 'You are a test bot',
        ttl: '3600s',
      }
    });
    console.log('Cache created:', cache.name);
  } catch (e: any) {
    console.error('Cache create failed:', e.message);
  }

  try {
    console.log('Attempting generateContent with gemini-1.5-flash...');
    const result = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: 'Hello',
    });
    console.log('Generate successful:', result.text);
  } catch (e: any) {
    console.error('Generate failed:', e.message);
  }
}

test();
