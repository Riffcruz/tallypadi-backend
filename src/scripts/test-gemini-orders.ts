import { parseMessageWithGemini } from '../services/gemini.service';
import dotenv from 'dotenv';
import path from 'path';

// Load .env
const envPath = path.resolve(process.cwd(), '.env');
dotenv.config({ path: envPath });

async function testOrders() {
  const tests = [
    {
      input: "New order for Emeka sewing a dress 5000 delivery next friday",
      expectedIntent: "CREATE_ORDER",
      check: (res: any) => 
        res.customer_name === 'Emeka' && 
        res.total_money === 5000 && 
        !!res.order_params.delivery_date
    },
    {
      input: "I have a job for Sarah baking cake 20k deposit 5k delivery tomorrow",
      expectedIntent: "CREATE_ORDER",
      check: (res: any) => 
        res.customer_name === 'Sarah' && 
        res.total_money === 20000 && 
        res.amount_paid === 5000 &&
        !!res.order_params.delivery_date
    },
    {
      input: "New order for John fixing phone 10000",
      expectedIntent: "CREATE_ORDER",
      check: (res: any) => res.needs_clarification === true // Date missing
    },
    {
      input: "Show my orders",
      expectedIntent: "LIST_ORDERS",
      check: (res: any) => true
    },
    {
      input: "Active jobs",
      expectedIntent: "LIST_ORDERS",
      check: (res: any) => true
    },
    {
      input: "Mark order for Emeka as done",
      expectedIntent: "UPDATE_ORDER",
      check: (res: any) => res.customer_name === 'Emeka' && res.order_params?.status === 'COMPLETED'
    },
    {
      input: "Update order Sarah paid 5000",
      expectedIntent: "UPDATE_ORDER",
      check: (res: any) => res.customer_name === 'Sarah' && res.amount_paid === 5000
    }
  ];

  console.log("🚀 Starting Order Tests...\n");

  for (const t of tests) {
    console.log(`testing input: "${t.input}"`);
    try {
      const result = await parseMessageWithGemini(t.input, 'English', []);
      const passed = result.intent === t.expectedIntent && t.check(result);
      
      if (passed) {
        console.log(`✅ PASS: ${result.intent}`);
      } else {
        console.log(`❌ FAIL: Expected ${t.expectedIntent}, Got ${result.intent}`);
        console.log('Result:', JSON.stringify(result, null, 2));
      }
    } catch (e) {
      console.error('❌ ERROR:', e);
    }
    console.log('---');
  }
}

testOrders();
