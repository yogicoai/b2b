import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Lead } from '@/models/Lead';

// DELETE /api/leads/batches/[batchId] — delete all leads in a batch
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ batchId: string }> }
) {
  try {
    const { batchId } = await params;
    if (!batchId) {
      return NextResponse.json({ success: false, error: 'batchId is required' }, { status: 400 });
    }

    await dbConnect();
    const result = await Lead.deleteMany({ importBatch: batchId });

    return NextResponse.json({
      success: true,
      deleted: result.deletedCount,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
