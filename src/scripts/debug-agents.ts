
import mongoose from 'mongoose';
import { env } from '../config/env';
import { SupportAgent } from '../models/supportAgent.model';

async function main() {
  await mongoose.connect(env.mongoUri);
  console.log('Connected to DB');

  const agents = await SupportAgent.find({});
  console.log(`Found ${agents.length} agents:`);
  
  for (const agent of agents) {
    console.log(`- ${agent.username} (${agent.phoneNumber}): Active=${agent.isWhatsAppActive}, Status=${agent.status}`);
  }

  await mongoose.disconnect();
}

main().catch(console.error);
