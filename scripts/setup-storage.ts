/**
 * One-time script to create the "attachments" storage bucket in Supabase.
 *
 * Run with:  npx tsx --env-file=.env.local scripts/setup-storage.ts
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function main() {
  // Check if bucket already exists
  const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
  if (listErr) {
    console.error('Failed to list buckets:', listErr.message);
    process.exit(1);
  }

  const exists = buckets?.some((b) => b.name === 'attachments');
  if (exists) {
    console.log('Bucket "attachments" already exists. No action needed.');
    return;
  }

  // Create the bucket
  const { error } = await supabase.storage.createBucket('attachments', {
    public: false, // Files accessed via signed URLs only
    fileSizeLimit: 10 * 1024 * 1024, // 10 MB max per file
  });

  if (error) {
    console.error('Failed to create bucket:', error.message);
    process.exit(1);
  }

  console.log('Bucket "attachments" created successfully.');
}

main();
