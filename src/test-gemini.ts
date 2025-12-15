import { parseMessageWithGemini } from './services/gemini.service';

const testMessage = async () => {
  const message = 'Sold 2 bags';
  const result = await parseMessageWithGemini(message, 'English');
  console.log(JSON.stringify(result, null, 2));
};

testMessage();
