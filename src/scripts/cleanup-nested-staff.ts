import mongoose from 'mongoose';
import { User } from '../models/user.model';
import { env } from '../config/env';

const connectDB = async () => {
  if (!env.mongoUri) {
    console.error('MONGO_URI is not defined');
    process.exit(1);
  }
  await mongoose.connect(env.mongoUri);
  console.log('📦 Connected to MongoDB');
};

const cleanupNestedStaff = async () => {
  await connectDB();

  console.log('🔍 Scanning for nested/orphaned staff...');

  // 1. Find all users who are linked to an owner
  const linkedUsers = await User.find({ ownerId: { $exists: true, $ne: null } });
  
  console.log(`Found ${linkedUsers.length} users with an ownerId.`);

  let nestedCount = 0;
  let orphanCount = 0;
  let selfRefCount = 0;

  for (const user of linkedUsers) {
    // Skip if ownerId is not a valid ObjectId (shouldn't happen with Schema but good to be safe)
    if (!user.ownerId) continue;

    // Check if user points to themselves
    if (user.ownerId.toString() === user._id.toString()) {
        console.log(`⚠️ User ${user.phoneNumber} (${user._id}) is their own owner (Self-Ref). Removing ownerId...`);
        await User.updateOne({ _id: user._id }, { $unset: { ownerId: 1 } });
        selfRefCount++;
        continue;
    }

    // Find the "owner"
    const owner = await User.findById(user.ownerId);

    if (!owner) {
      console.log(`🗑️ User ${user.phoneNumber} (${user._id}) has non-existent owner ${user.ownerId}. Deleting...`);
      await User.deleteOne({ _id: user._id });
      orphanCount++;
      continue;
    }

    // Check if the "owner" is actually a STAFF member
    if (owner.role === 'STAFF') {
      console.log(`🗑️ User ${user.phoneNumber} (${user._id}) is owned by STAFF ${owner.phoneNumber} (${owner._id}). This is invalid nesting. Deleting...`);
      await User.deleteOne({ _id: user._id });
      nestedCount++;
    }
  }

  console.log('\n✅ Cleanup Complete');
  console.log(`- Removed ${nestedCount} nested staff (staff under staff).`);
  console.log(`- Removed ${orphanCount} orphaned staff (owner missing).`);
  console.log(`- Fixed ${selfRefCount} self-referencing users.`);

  process.exit(0);
};

cleanupNestedStaff().catch((err) => {
  console.error(err);
  process.exit(1);
});
