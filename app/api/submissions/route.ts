import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

const TABLE_NAME = 'void_checks';

// GET - Fetch all submissions
export async function GET() {
  try {
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .order('request_date', { ascending: false });

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error fetching submissions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch submissions' },
      { status: 500 }
    );
  }
}

// POST - Create a new submission
export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const body = await request.json();

    const submission = {
      check_number: body.check_number,
      check_amount: parseFloat(body.check_amount),
      owner_number: body.owner_number,
      check_date: body.check_date,
      notes: body.notes || '',
      request_date: new Date().toISOString(),
      completion_status: 'Pending',
      sign_off_date: null,
      created_by: body.created_by || 'Unknown User',
    };

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .insert([submission])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data, { status: 201 });
  } catch (error: any) {
    console.error('Error creating submission:', error);
    return NextResponse.json(
      { error: 'Failed to create submission' },
      { status: 500 }
    );
  }
}

// PATCH - Update a submission (status change, full edit, or bulk status)
export async function PATCH(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const body = await request.json();

    // Bulk status update
    if (body.ids && Array.isArray(body.ids) && body.completion_status) {
      const updatePayload: any = {
        completion_status: body.completion_status,
        sign_off_date:
          body.completion_status === 'Complete'
            ? new Date().toISOString()
            : null,
      };

      const { data, error } = await supabase
        .from(TABLE_NAME)
        .update(updatePayload)
        .in('id', body.ids)
        .select();

      if (error) throw error;
      return NextResponse.json(data);
    }

    // Single update
    const { id } = body;
    if (!id) {
      return NextResponse.json(
        { error: 'Missing id' },
        { status: 400 }
      );
    }

    const updatePayload: any = {};

    // Full edit fields
    if (body.check_number !== undefined) updatePayload.check_number = body.check_number;
    if (body.check_amount !== undefined) updatePayload.check_amount = parseFloat(body.check_amount);
    if (body.owner_number !== undefined) updatePayload.owner_number = body.owner_number;
    if (body.check_date !== undefined) updatePayload.check_date = body.check_date;
    if (body.notes !== undefined) updatePayload.notes = body.notes;
    if (body.attachments !== undefined) updatePayload.attachments = body.attachments;

    // Status change with auto sign-off date
    if (body.completion_status) {
      updatePayload.completion_status = body.completion_status;
      updatePayload.sign_off_date =
        body.completion_status === 'Complete'
          ? new Date().toISOString()
          : null;
    }

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error updating submission:', error);
    return NextResponse.json(
      { error: 'Failed to update submission' },
      { status: 500 }
    );
  }
}

// DELETE - Remove a submission
export async function DELETE(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Missing id' },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from(TABLE_NAME)
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting submission:', error);
    return NextResponse.json(
      { error: 'Failed to delete submission' },
      { status: 500 }
    );
  }
}
