import { NextRequest, NextResponse } from 'next/server';
import { getOwners } from '@/lib/snowflake';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';

    const owners = await getOwners(search);

    return NextResponse.json(
      owners.map((o) => ({
        owner_number: o.OWNER_NUMBER,
        owner_name: o.OWNER_NAME,
      }))
    );
  } catch (error: any) {
    console.error('Error fetching owners:', error);
    return NextResponse.json(
      { error: 'Failed to fetch owners' },
      { status: 500 }
    );
  }
}
