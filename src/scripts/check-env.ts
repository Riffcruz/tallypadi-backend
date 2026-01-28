
import 'dotenv/config';

console.log('WHATSAPP_TOKEN:', process.env.WHATSAPP_TOKEN ? 'SET' : 'MISSING');
console.log('WHATSAPP_PHONE_NUMBER_ID:', process.env.WHATSAPP_PHONE_NUMBER_ID ? 'SET' : 'MISSING');
console.log('MONGODB_URI:', process.env.MONGODB_URI ? 'SET' : 'MISSING');
