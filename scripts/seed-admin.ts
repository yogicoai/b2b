import mongoose from 'mongoose';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { AdminUser } from '../src/models/AdminUser';

dotenv.config({ path: '.env.local' });

async function seedAdmin() {
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) throw new Error('MONGODB_URI not set');

  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  const adminId = process.env.ADMIN_ID || 'yogico';
  const adminPassword = process.env.ADMIN_PASSWORD || 'yogico';

  const passwordHash = crypto.createHash('sha256').update(adminPassword).digest('hex');

  await AdminUser.deleteMany({ username: adminId });
  await AdminUser.create({
    username: adminId,
    passwordHash: passwordHash
  });

  console.log(`✅ Admin user '${adminId}' created/updated successfully.`);
  await mongoose.disconnect();
}

seedAdmin().catch(console.error);
