import mongoose, { Types } from 'mongoose';

async function run() {
  const oid = new Types.ObjectId();
  console.log('Original ObjectId:', oid);

  try {
    const newOid = new Types.ObjectId(oid);
    console.log('New ObjectId from existing:', newOid);
    console.log('Equal?', oid.equals(newOid));
  } catch (e) {
    console.error('Error creating ObjectId from ObjectId:', e);
  }
}

run();
