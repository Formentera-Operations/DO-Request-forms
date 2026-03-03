import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { sendMail } from '@/lib/email';

const TABLE_NAME = 'transfer_log';

// GET - Fetch all transfer log submissions
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
    console.error('Error fetching transfer log submissions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch submissions' },
      { status: 500 }
    );
  }
}

// POST - Create a new transfer log submission
export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const body = await request.json();

    const submission = {
      accounting_group: body.accounting_group,
      well_code: body.well_code,
      well_name: body.well_name || '',
      search_key: body.search_key || '',
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

    // Send confirmation email to submitter + accounting group recipients
    try {
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

      const wellDisplay = submission.well_name
        ? `${submission.well_code} \u2013 ${submission.well_name}`
        : submission.well_code;

      // Determine recipients: submitter + accounting group emails
      const groupEmails =
        submission.accounting_group === 'JIB'
          ? process.env.TRANSFER_JIB_EMAILS || ''
          : process.env.TRANSFER_REVENUE_EMAILS || '';

      const recipients = [
        submission.created_by,
        ...groupEmails
          .split(',')
          .map((e: string) => e.trim())
          .filter(Boolean),
      ].join(',');

      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://do-request-forms.vercel.app';
      const detailLink = `${appUrl}?app=transfer-log&id=${data.id}`;

      await sendMail({
        to: recipients,
        subject: `Transfer Log Form - ${wellDisplay}`,
        html: `
          <div style="font-family: Segoe UI, Arial, sans-serif; max-width: 480px;">
            <p style="font-size: 14px; color: #1a1a1a;">Hello,</p>
            <p style="font-size: 14px; color: #1a1a1a;">Land has entered a Reverse/Rebook to be processed.</p>
            <table style="border-collapse: collapse; margin: 16px 0;">
              <tr><td style="${th}">Accounting Group</td><td style="${td}">${submission.accounting_group}</td></tr>
              <tr><td style="${th}">Well Code / Name</td><td style="${td}">${wellDisplay}</td></tr>
              <tr><td style="${th}">Search Key</td><td style="${td}">${submission.search_key || '\u2014'}</td></tr>
              <tr><td style="${th}">Notes</td><td style="${td}">${submission.notes || '\u2014'}</td></tr>
            </table>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 20px 0;">
              <tr>
                <td style="background: #0078d4; border-radius: 50px; text-align: center;">
                  <!--[if mso]>
                  <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${detailLink}" style="height:48px;v-text-anchor:middle;width:200px;" arcsize="50%" strokecolor="#0078d4" fillcolor="#0078d4">
                  <w:anchorlock/>
                  <center style="color:#ffffff;font-family:Segoe UI,Arial,sans-serif;font-size:14px;font-weight:600;">View Entry &rarr;</center>
                  </v:roundrect>
                  <![endif]-->
                  <!--[if !mso]><!-->
                  <a href="${detailLink}" style="display: inline-block; padding: 14px 32px; background: #0078d4; color: #ffffff; text-decoration: none; border-radius: 50px; font-size: 14px; font-weight: 600; font-family: Segoe UI, Arial, sans-serif; letter-spacing: 0.3px; mso-hide: all;">View Entry &nbsp;&rarr;</a>
                  <!--<![endif]-->
                </td>
              </tr>
            </table>
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
    console.error('Error creating transfer log submission:', error);
    return NextResponse.json(
      { error: 'Failed to create submission' },
      { status: 500 }
    );
  }
}

// Helper: send "Request Completed" email for a transfer log record
async function sendCompletionEmail(sub: any, supabase: any) {
  try {
    const td = 'padding:6px 10px;border:1px solid #d4dae3;font-size:13px;';
    const th = `${td}font-weight:600;background:#f7f8fa;white-space:nowrap;`;

    const wellDisplay = sub.well_name
      ? `${sub.well_code} \u2013 ${sub.well_name}`
      : sub.well_code;

    // Download attachments
    const emailAttachments: { filename: string; content: Buffer }[] = [];
    for (const path of sub.attachments || []) {
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

    // Determine recipients: submitter + accounting group emails
    const groupEmails =
      sub.accounting_group === 'JIB'
        ? process.env.TRANSFER_JIB_EMAILS || ''
        : process.env.TRANSFER_REVENUE_EMAILS || '';

    const recipients = [
      sub.created_by,
      ...groupEmails.split(',').map((e: string) => e.trim()).filter(Boolean),
    ].join(',');

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://do-request-forms.vercel.app';
    const detailLink = `${appUrl}?app=transfer-log&id=${sub.id}`;

    await sendMail({
      to: recipients,
      subject: `Request Completed - ${wellDisplay}`,
      html: `
        <div style="font-family: Segoe UI, Arial, sans-serif; max-width: 480px;">
          <p style="font-size: 14px; color: #1a1a1a;">Request Completed.</p>
          <table style="border-collapse: collapse; margin: 16px 0;">
            <tr><td style="${th}">Accounting Group</td><td style="${td}">${sub.accounting_group}</td></tr>
            <tr><td style="${th}">Well Code / Name</td><td style="${td}">${wellDisplay}</td></tr>
            <tr><td style="${th}">Search Key</td><td style="${td}">${sub.search_key || '\u2014'}</td></tr>
            <tr><td style="${th}">Notes</td><td style="${td}">${sub.notes || '\u2014'}</td></tr>
          </table>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 20px 0;">
            <tr>
              <td style="background: #0078d4; border-radius: 50px; text-align: center;">
                <!--[if mso]>
                <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${detailLink}" style="height:48px;v-text-anchor:middle;width:200px;" arcsize="50%" strokecolor="#0078d4" fillcolor="#0078d4">
                <w:anchorlock/>
                <center style="color:#ffffff;font-family:Segoe UI,Arial,sans-serif;font-size:14px;font-weight:600;">View Entry &rarr;</center>
                </v:roundrect>
                <![endif]-->
                <!--[if !mso]><!-->
                <a href="${detailLink}" style="display: inline-block; padding: 14px 32px; background: #0078d4; color: #ffffff; text-decoration: none; border-radius: 50px; font-size: 14px; font-weight: 600; font-family: Segoe UI, Arial, sans-serif; letter-spacing: 0.3px; mso-hide: all;">View Entry &nbsp;&rarr;</a>
                <!--<![endif]-->
              </td>
            </tr>
          </table>
          <hr style="border: none; border-top: 1px solid #d4dae3; margin: 16px 0;" />
          <p style="font-size: 11px; color: #8c93a3;">
            This is an automated confirmation from the DO Request Forms App.
          </p>
        </div>
      `,
      attachments: emailAttachments.length > 0 ? emailAttachments : undefined,
    });
  } catch (emailError: any) {
    console.error('Failed to send completion email:', emailError);
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

      // Send completion emails for bulk "Complete" status change
      if (body.completion_status === 'Complete' && data) {
        for (const sub of data) {
          await sendCompletionEmail(sub, supabase);
        }
      }

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
    if (body.accounting_group !== undefined) updatePayload.accounting_group = body.accounting_group;
    if (body.well_code !== undefined) updatePayload.well_code = body.well_code;
    if (body.well_name !== undefined) updatePayload.well_name = body.well_name;
    if (body.search_key !== undefined) updatePayload.search_key = body.search_key;
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

    // Send completion email when status changes to "Complete"
    if (body.completion_status === 'Complete' && data) {
      await sendCompletionEmail(data, supabase);
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Error updating transfer log submission:', error);
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
    console.error('Error deleting transfer log submission:', error);
    return NextResponse.json(
      { error: 'Failed to delete submission' },
      { status: 500 }
    );
  }
}
