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
        owner_number: c.ENTITY_CODE,
        owner_name: c.ENTITY_NAME,
        check_amount: c.CHECK_AMOUNT,
        check_date: c.CHECK_DATE,
      }))
    );
  } catch (error: any) {
    console.error('Error fetching checks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch checks', message: error?.message || 'Unknown error' },
      { status: 500 }
    );
  }
}
