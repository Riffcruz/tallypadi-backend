import { parseMessageWithGemini } from '../services/gemini.service';
import dotenv from 'dotenv';
import path from 'path';

// Load .env
const envPath = path.resolve(process.cwd(), '.env');
dotenv.config({ path: envPath });

async function testSupport() {
  const inputs = [
    "customer support",
    "contact support",
    "online support",
    "I need to contact customer service",
    "please support me", // might match 'support'
    "contact"
  ];

  for (const input of inputs) {
    console.log(`\nTesting input: "${input}"`);
    try {
      // Mocking console.log to avoid clutter from service
      const originalLog = console.log;
      // console.log = () => {}; 
      
      const result = await parseMessageWithGemini(input, 'English', []);
      
      // console.log = originalLog;

      if (result.reply_text.includes('wa.me/2349045382250')) {
        console.log(`✅ PASS (Intent: ${result.intent})`);
        console.log(`   Reply: ${result.reply_text}`);
      } else {
        console.log(`❌ FAIL (Intent: ${result.intent})`);
        console.log(`   Reply: ${result.reply_text}`);
      }
    } catch (error) {
      console.error('Error:', error);
    }
  }
}

testSupport();
