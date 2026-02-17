import { NextRequest, NextResponse } from 'next/server';
import { getChecks } from '@/lib/snowflake';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';

    const checks = await getChecks(search);

    return NextResponse.json(
      checks.map((c) => ({
        check_number: c.CHECK_NUMBER,
        check_description: c.CHECK_DESCRIPTION,
      }))
    );
  } catch (error: any) {
    console.error('Error fetching checks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch checks' },
      { status: 500 }
    );
  }
}
