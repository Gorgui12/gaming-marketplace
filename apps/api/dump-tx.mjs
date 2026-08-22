import mongoose from 'mongoose';

const uri = process.env.MONGODB_URI;
await mongoose.connect(uri);
const db = mongoose.connection.db;

const txs = await db.collection('transactions').find({}).sort({ createdAt: -1 }).toArray();
console.log(`=== ${txs.length} transaction(s) ===`);
for (const t of txs) {
  console.log({
    _id: String(t._id),
    paymentReference: t.paymentReference,
    escrowStatus: t.escrowStatus,
    paymentStatus: t.paymentStatus,
    amount: t.amount,
    buyer: String(t.buyer),
    seller: String(t.seller),
    providerTransactionId: t.providerTransactionId ?? null,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    history: (t.stateHistory ?? []).map((h) => `${h.from}->${h.to}@${h.at?.toISOString?.()}`),
  });
}

const users = await db.collection('users').find({}).toArray();
console.log(`=== ${users.length} user(s) ===`);
for (const u of users) {
  console.log({ _id: String(u._id), email: u.email, roles: u.roles });
}

await mongoose.disconnect();
