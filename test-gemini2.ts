import * as dotenv from 'dotenv';
dotenv.config();
import { parseMessageWithGemini } from './src/services/gemini.service';
import { extractJsonObject, safeParsedResult } from './src/services/gemini.parsers';
import { GoogleGenerativeAI } from '@google/generative-ai';
import getSystemPrompt from './src/services/gemini.prompt';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash', generationConfig: { responseMimeType: 'application/json' } });

async function test() {
  const msg = `Invoice for Mr Matthew 
1. 5kwh/24v 1,250,000
2. 25mm dc cable 7k×4 yards 
3. Cable lock 25mm 
4. Logistics 40k
5. Workmanship 40k`;

  const basePrompt = getSystemPrompt('English', new Date().toISOString(), []);
  const userPrompt = `${basePrompt}\n\nUSER MESSAGE: "${msg}"\n\nReturn JSON only.`;

  console.log('Sending to Gemini with newlines preserved...');
  const result = await model.generateContent([userPrompt]);
  const text = result.response.text();
  const cleanJson = extractJsonObject(text);
  console.log(JSON.stringify(safeParsedResult(JSON.parse(cleanJson)), null, 2));
}

test().catch(console.error);
