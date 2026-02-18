import { NextRequest, NextResponse } from 'next/server';

// Owners are now resolved automatically from the check selection
// via DIM_REVENUE_CHECK_REGISTER. This route is kept for compatibility.
export async function GET(request: NextRequest) {
  return NextResponse.json([]);
}
