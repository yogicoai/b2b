import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Lead } from '@/models/Lead';

// GET /api/leads/batches — list all import batches with count & date
export async function GET() {
  try {
    await dbConnect();

    // Aggregate: group by importBatch, count leads, get importedAt
    const batches = await Lead.aggregate([
      { $match: { importBatch: { $exists: true, $ne: '' } } },
      {
        $group: {
          _id: '$importBatch',
          count: { $sum: 1 },
          importedAt: { $first: '$importedAt' },
        },
      },
      { $sort: { importedAt: -1 } },
    ]);

    return NextResponse.json({
      success: true,
      data: batches.map((b) => ({
        batchId: b._id,
        count: b.count,
        importedAt: b.importedAt,
      })),
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
