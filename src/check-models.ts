import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
  console.error("❌ No GEMINI_API_KEY found in .env file");
  process.exit(1);
}

const checkModels = async () => {
  console.log("🔍 Checking available models for your API Key...");
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`;

  try {
    const response = await axios.get(url);
    const models = response.data.models;
    
    console.log(`\n✅ Success! You have access to ${models.length} models.`);
    console.log("------------------------------------------------");
    models.forEach((m: any) => {
      // We only care about models that support "generateContent"
      if (m.supportedGenerationMethods.includes("generateContent")) {
        console.log(`Model Name: ${m.name.replace('models/', '')}`);
      }
    });
    console.log("------------------------------------------------");
    console.log("👉 Copy one of the names above into your .env file!");

  } catch (error: any) {
    console.error("\n❌ ERROR CONNECTING TO GOOGLE:");
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Reason: ${JSON.stringify(error.response.data, null, 2)}`);
    } else {
      console.error(error.message);
    }
  }
};

checkModels();