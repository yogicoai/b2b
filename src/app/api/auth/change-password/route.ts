import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { AdminUser } from '@/models/AdminUser';
import crypto from 'crypto';

export async function POST(req: Request) {
  try {
    const { username, currentPassword, newPassword } = await req.json();
    
    const currentPasswordHash = crypto.createHash('sha256').update(currentPassword).digest('hex');
    const newPasswordHash = crypto.createHash('sha256').update(newPassword).digest('hex');
    
    await dbConnect();
    const user = await AdminUser.findOne({ username, passwordHash: currentPasswordHash });
    
    if (user) {
      user.passwordHash = newPasswordHash;
      await user.save();
      return NextResponse.json({ success: true });
    }
    
    return NextResponse.json({ success: false, error: 'Invalid current password' }, { status: 401 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
