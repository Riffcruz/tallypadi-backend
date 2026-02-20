const mongoose = require('mongoose');
require('dotenv').config({ path: '../.env' });

async function check() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const subs = await mongoose.model('PushSubscription', new mongoose.Schema({
      userId: mongoose.Types.ObjectId,
      endpoint: String,
      userAgent: String,
      keys: Object
    }), 'pushsubscriptions').find({});
    
    console.log("=== SUBSCRIPTIONS IN DB ===");
    console.log(JSON.stringify(subs, null, 2));
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
check();
