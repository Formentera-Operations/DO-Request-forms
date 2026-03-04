import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { sendMail } from '@/lib/email';

const TABLE_NAME = 'interest_tracker';

// GET - Fetch all interest tracker submissions
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
    console.error('Error fetching interest tracker submissions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch submissions' },
      { status: 500 }
    );
  }
}

// POST - Create a new interest tracker submission
export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const body = await request.json();

    const submission = {
      owner_number: body.owner_number,
      owner_name: body.owner_name || '',
      interest_rate: parseFloat(body.interest_rate),
      interest_start_date: body.interest_start_date,
      interest_end_date: body.interest_end_date,
      amount_due: parseFloat(body.amount_due),
      notes: body.notes || '',
      attachments: body.attachments || [],
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

    // Send confirmation email to submitter
    try {
      const formatCurrency = (amount: number) =>
        new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

      // Download actual files from Supabase to attach to the email
      const emailAttachments: { filename: string; content: Buffer }[] = [];
      for (const path of submission.attachments) {
        try {
          const { data: fileData, error: dlError } = await supabase.storage
            .from('attachments')
            .download(path);
          if (dlError || !fileData) continue;
          const rawName = path.split('/').pop() || path;
          const cleanName = rawName.replace(/^\d+-/, '');
          emailAttachments.push({
            filename: cleanName,
            content: Buffer.from(await fileData.arrayBuffer()),
          });
        } catch {
          // skip files that fail to download
        }
      }

      const td = 'padding:6px 10px;border:1px solid #d4dae3;font-size:13px;';
      const th = `${td}font-weight:600;background:#f7f8fa;white-space:nowrap;`;

      const ownerDisplay = submission.owner_name
        ? `${submission.owner_number} \u2013 ${submission.owner_name}`
        : submission.owner_number;

      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://do-request-forms.vercel.app';
      const detailLink = `${appUrl}?app=interest-tracker&id=${data.id}`;

      await sendMail({
        to: submission.created_by,
        subject: `Interest Tracker \u2014 ${ownerDisplay}`,
        html: `
          <div style="font-family: Segoe UI, Arial, sans-serif; max-width: 480px;">
            <h2 style="color: #0078d4; margin-bottom: 4px; font-size: 18px;">Interest Tracker Submitted</h2>
            <p style="color: #5a6275; margin-top: 0; font-size: 13px;">Your interest tracker entry has been submitted successfully.</p>
            <table style="border-collapse: collapse; margin: 16px 0;">
              <tr><td style="${th}">Owner</td><td style="${td}">${ownerDisplay}</td></tr>
              <tr><td style="${th}">% Interest Charged</td><td style="${td}">${submission.interest_rate}%</td></tr>
              <tr><td style="${th}">Interest Start Date (Prod)</td><td style="${td}">${submission.interest_start_date || '\u2014'}</td></tr>
              <tr><td style="${th}">Interest End Date (Prod)</td><td style="${td}">${submission.interest_end_date || '\u2014'}</td></tr>
              <tr><td style="${th}">Amount Due</td><td style="${td}">${formatCurrency(submission.amount_due)}</td></tr>
              <tr><td style="${th}">Notes</td><td style="${td}">${submission.notes || '\u2014'}</td></tr>
            </table>
            <p><a href="${detailLink}" style="display: inline-block; padding: 10px 20px; background: #0078d4; color: #ffffff; text-decoration: none; border-radius: 4px; font-size: 13px; font-weight: 600; font-family: Segoe UI, Arial, sans-serif;">View Entry</a></p>
            <hr style="border: none; border-top: 1px solid #d4dae3; margin: 16px 0;" />
            <p style="font-size: 11px; color: #8c93a3;">
              This is an automated confirmation from the DO Request Forms App.
            </p>
          </div>
        `,
        attachments: emailAttachments.length > 0 ? emailAttachments : undefined,
      });
    } catch (emailError: any) {
      console.error('Failed to send confirmation email:', emailError);
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error: any) {
    console.error('Error creating interest tracker submission:', error);
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
    if (body.owner_number !== undefined) updatePayload.owner_number = body.owner_number;
    if (body.owner_name !== undefined) updatePayload.owner_name = body.owner_name;
    if (body.interest_rate !== undefined) updatePayload.interest_rate = parseFloat(body.interest_rate);
    if (body.interest_start_date !== undefined) updatePayload.interest_start_date = body.interest_start_date;
    if (body.interest_end_date !== undefined) updatePayload.interest_end_date = body.interest_end_date;
    if (body.amount_due !== undefined) updatePayload.amount_due = parseFloat(body.amount_due);
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
    console.error('Error updating interest tracker submission:', error);
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
    console.error('Error deleting interest tracker submission:', error);
    return NextResponse.json(
      { error: 'Failed to delete submission' },
      { status: 500 }
    );
  }
}
