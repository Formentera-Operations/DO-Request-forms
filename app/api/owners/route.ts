import { NextRequest, NextResponse } from 'next/server';
import { getOwners } from '@/lib/snowflake';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || '';

    const results = await getOwners(search);

    const mapped = results.map((r) => ({
      owner_number: r.ENTITY_CODE,
      owner_name: r.ENTITY_NAME,
    }));

    return NextResponse.json(mapped);
  } catch (error: any) {
    console.error('Error fetching owners:', error);
    return NextResponse.json(
      { error: 'Failed to fetch owners', message: error?.message },
      { status: 500 }
    );
  }
}
