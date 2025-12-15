import axios from 'axios';
import readline from 'readline';

// 1. Setup the "Phone Interface" in your terminal
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const WEBHOOK_URL = 'http://localhost:3000/webhook';
const MY_PHONE_NUMBER = '2348012345678'; // Fake number for testing

console.log("==========================================");
console.log("🤖 Tallypadi Offline Simulator");
console.log("==========================================");
console.log("Type a message below (e.g., 'Sold 5 rice')");
console.log("Press Ctrl+C to exit");
console.log("------------------------------------------");

// 2. Function to Mimic WhatsApp's JSON Structure
const sendToWebhook = async (text: string) => {
  const fakeWhatsAppPayload = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WHATSAPP_BUSINESS_ID",
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "15550051234", phone_number_id: "123456" },
              contacts: [{ profile: { name: "Test User" }, wa_id: MY_PHONE_NUMBER }],
              messages: [
                {
                  from: MY_PHONE_NUMBER,
                  id: "wamid.test",
                  timestamp: Math.floor(Date.now() / 1000),
                  text: { body: text },
                  type: "text"
                }
              ]
            },
            field: "messages"
          }
        ]
      }
    ]
  };

  try {
    // Send to your local server
    await axios.post(WEBHOOK_URL, fakeWhatsAppPayload);
    console.log("✅ Message sent to server...");
  } catch (error: any) {
    console.error("❌ Error hitting server:", error.message);
  }
};

// 3. Loop: Ask for input -> Send -> Repeat
const ask = () => {
  rl.question('You: ', (input) => {
    sendToWebhook(input);
    setTimeout(ask, 1000); // Wait a bit then ask again
  });
};

ask();