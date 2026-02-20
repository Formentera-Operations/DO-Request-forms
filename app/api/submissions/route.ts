import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import nodemailer from 'nodemailer';

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
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD,
        },
      });

      const formatDate = (d: string) => {
        if (!d) return '—';
        const date = new Date(d);
        return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
      };

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

      await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: submission.created_by,
        subject: `Voided Check #${submission.check_number}`,
        html: `
          <div style="font-family: Segoe UI, Arial, sans-serif; max-width: 480px;">
            <h2 style="color: #0078d4; margin-bottom: 4px; font-size: 18px;">Void Check Submitted</h2>
            <p style="color: #5a6275; margin-top: 0; font-size: 13px;">Your void check request has been submitted successfully.</p>
            <table style="border-collapse: collapse; margin: 16px 0;">
              <tr><td style="${th}">Check Number</td><td style="${td}">${submission.check_number}</td></tr>
              <tr><td style="${th}">Check Amount</td><td style="${td}">${formatCurrency(submission.check_amount)}</td></tr>
              <tr><td style="${th}">Owner Number</td><td style="${td}">${submission.owner_number}</td></tr>
              <tr><td style="${th}">Check Date</td><td style="${td}">${formatDate(submission.check_date)}</td></tr>
              <tr><td style="${th}">Request Date</td><td style="${td}">${formatDate(submission.request_date)}</td></tr>
              <tr><td style="${th}">Notes</td><td style="${td}">${submission.notes || '—'}</td></tr>
            </table>
            <hr style="border: none; border-top: 1px solid #d4dae3; margin: 16px 0;" />
            <p style="font-size: 11px; color: #8c93a3;">
              This is an automated confirmation from the Void Checks Management App.
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
