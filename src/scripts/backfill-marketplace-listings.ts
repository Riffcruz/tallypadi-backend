import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

import mongoose from 'mongoose';
import { Inventory } from '../models/inventory.model';
import { connectDb } from '../config/db';
import { refreshMarketplaceFacets, refreshMarketplaceListing } from '../services/marketplaceIndex.service';

const batchSize = Math.max(50, Number(process.env.MARKETPLACE_BACKFILL_BATCH_SIZE || 500));

async function main() {
  await connectDb();

  let scanned = 0;
  let indexed = 0;
  let hidden = 0;
  let cursor = Inventory.find({})
    .select('_id')
    .sort({ _id: 1 })
    .lean<{ _id: mongoose.Types.ObjectId }>()
    .cursor();

  const batch: mongoose.Types.ObjectId[] = [];

  for await (const product of cursor) {
    batch.push(product._id);
    if (batch.length < batchSize) continue;

    for (const productId of batch.splice(0, batch.length)) {
      scanned++;
      const result = await refreshMarketplaceListing(productId, { invalidate: false });
      if (result.status === 'indexed') indexed++;
      if (result.status === 'hidden' || result.status === 'deleted') hidden++;
    }
    console.log(`Marketplace backfill progress: scanned=${scanned}, indexed=${indexed}, hidden=${hidden}`);
  }

  for (const productId of batch) {
    scanned++;
    const result = await refreshMarketplaceListing(productId, { invalidate: false });
    if (result.status === 'indexed') indexed++;
    if (result.status === 'hidden' || result.status === 'deleted') hidden++;
  }

  await refreshMarketplaceFacets();
  console.log(`Marketplace backfill complete: scanned=${scanned}, indexed=${indexed}, hidden=${hidden}`);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error('Marketplace backfill failed:', error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
