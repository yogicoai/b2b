import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import dbConnect from '@/lib/mongodb';
import { AdminUser } from '@/models/AdminUser';
import crypto from 'crypto';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'fallback_secret');

export async function PUT(req: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_session')?.value;
  if (!token) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const username = payload.user as string;

    const { newPassword } = await req.json();
    if (!newPassword || newPassword.length < 4) {
      return NextResponse.json({ success: false, error: 'Password must be at least 4 characters long' }, { status: 400 });
    }

    const passwordHash = crypto.createHash('sha256').update(newPassword).digest('hex');

    await dbConnect();
    const result = await AdminUser.updateOne({ username }, { $set: { passwordHash } });
    
    // If the user doesn't exist in DB yet (e.g., master logging in purely via env fallback), create them
    if (result.matchedCount === 0) {
      await AdminUser.create({ username, passwordHash });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
