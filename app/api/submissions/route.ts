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

      const attachmentsList = submission.attachments.length > 0
        ? submission.attachments.map((a: string) => {
            const name = a.split('/').pop() || a;
            return `<li>${name}</li>`;
          }).join('')
        : '<li style="color: #8c93a3;">None</li>';

      await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: submission.created_by,
        subject: `Voided Check #${submission.check_number}`,
        html: `
          <div style="font-family: Segoe UI, Arial, sans-serif; max-width: 600px;">
            <h2 style="color: #0078d4; margin-bottom: 4px;">Void Check Submitted</h2>
            <p style="color: #5a6275; margin-top: 0;">Your void check request has been submitted successfully.</p>
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <tr>
                <td style="padding: 10px 12px; border: 1px solid #d4dae3; font-weight: 600; background: #f7f8fa; width: 140px;">Check Number</td>
                <td style="padding: 10px 12px; border: 1px solid #d4dae3;">${submission.check_number}</td>
              </tr>
              <tr>
                <td style="padding: 10px 12px; border: 1px solid #d4dae3; font-weight: 600; background: #f7f8fa;">Check Amount</td>
                <td style="padding: 10px 12px; border: 1px solid #d4dae3;">${formatCurrency(submission.check_amount)}</td>
              </tr>
              <tr>
                <td style="padding: 10px 12px; border: 1px solid #d4dae3; font-weight: 600; background: #f7f8fa;">Owner Number</td>
                <td style="padding: 10px 12px; border: 1px solid #d4dae3;">${submission.owner_number}</td>
              </tr>
              <tr>
                <td style="padding: 10px 12px; border: 1px solid #d4dae3; font-weight: 600; background: #f7f8fa;">Check Date</td>
                <td style="padding: 10px 12px; border: 1px solid #d4dae3;">${formatDate(submission.check_date)}</td>
              </tr>
              <tr>
                <td style="padding: 10px 12px; border: 1px solid #d4dae3; font-weight: 600; background: #f7f8fa;">Request Date</td>
                <td style="padding: 10px 12px; border: 1px solid #d4dae3;">${formatDate(submission.request_date)}</td>
              </tr>
              <tr>
                <td style="padding: 10px 12px; border: 1px solid #d4dae3; font-weight: 600; background: #f7f8fa;">Notes</td>
                <td style="padding: 10px 12px; border: 1px solid #d4dae3;">${submission.notes || '—'}</td>
              </tr>
              <tr>
                <td style="padding: 10px 12px; border: 1px solid #d4dae3; font-weight: 600; background: #f7f8fa; vertical-align: top;">Attachments</td>
                <td style="padding: 10px 12px; border: 1px solid #d4dae3;"><ul style="margin: 0; padding-left: 18px;">${attachmentsList}</ul></td>
              </tr>
            </table>
            <hr style="border: none; border-top: 1px solid #d4dae3; margin: 20px 0;" />
            <p style="font-size: 12px; color: #8c93a3;">
              This is an automated confirmation from the Void Checks Management App.
            </p>
          </div>
        `,
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
