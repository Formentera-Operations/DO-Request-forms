import { NextRequest, NextResponse } from 'next/server';
import { getWells } from '@/lib/snowflake';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || '';

    const results = await getWells(search);

    const mapped = results.map((r) => ({
      well_code: r.COST_CENTER_NUMBER,
      well_name: r.WELL_NAME,
      search_key: r.SEARCH_KEY,
    }));

    return NextResponse.json(mapped);
  } catch (error: any) {
    console.error('Error fetching wells:', error);
    return NextResponse.json(
      { error: 'Failed to fetch wells', message: error?.message },
      { status: 500 }
    );
  }
}
