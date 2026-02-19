import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

const BUCKET = 'attachments';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const path = searchParams.get('path');

    if (!path) {
      return NextResponse.json({ error: 'Missing path parameter' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 60 * 5); // 5-minute signed URL

    if (error) throw error;

    return NextResponse.json({ url: data.signedUrl });
  } catch (error: any) {
    console.error('Error creating signed URL:', error);
    return NextResponse.json(
      { error: 'Failed to get download URL', message: error?.message || 'Unknown error' },
      { status: 500 }
    );
  }
}
