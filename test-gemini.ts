import * as dotenv from 'dotenv';
dotenv.config();
import { parseMessageWithGemini } from './src/services/gemini.service';

async function test() {
  const msg = `Invoice for Mr Matthew 
1. 5kwh/24v 1,250,000
2. 25mm dc cable 7k×4 yards 
3. Cable lock 25mm 
4. Logistics 40k
5. Workmanship 40k`;
  console.log('Running parser...');
  const res = await parseMessageWithGemini(msg, 'English');
  console.log(JSON.stringify(res, null, 2));
}

test().catch(console.error);
