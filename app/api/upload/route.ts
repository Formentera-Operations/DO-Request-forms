import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

const BUCKET = 'attachments';

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    if (!files.length) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    const uploaded: string[] = [];

    for (const file of files) {
      const timestamp = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `void-checks/${timestamp}-${safeName}`;

      const buffer = Buffer.from(await file.arrayBuffer());

      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, buffer, {
          contentType: file.type,
          upsert: false,
        });

      if (error) {
        console.error('Upload error:', error);
        throw error;
      }

      uploaded.push(path);
    }

    return NextResponse.json({ paths: uploaded });
  } catch (error: any) {
    console.error('Error uploading files:', error);
    return NextResponse.json(
      { error: 'Failed to upload files', message: error?.message || 'Unknown error' },
      { status: 500 }
    );
  }
}
