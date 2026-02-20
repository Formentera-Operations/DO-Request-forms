import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import ExcelJS from 'exceljs';
import nodemailer from 'nodemailer';

const TABLE_NAME = 'void_checks';

/**
 * Cron job: Runs on the 18th of every month.
 * Fetches all Pending void check submissions, generates an Excel
 * spreadsheet, and emails it to configured recipients.
 *
 * Triggered by Vercel Cron Jobs (see vercel.json).
 */
export async function GET(request: NextRequest) {
  // Verify the request is from Vercel Cron (security)
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 1. Fetch all Pending submissions from Supabase
    const supabase = createServerSupabaseClient();
    const { data: pendingItems, error } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .eq('completion_status', 'Pending')
      .order('request_date', { ascending: false });

    if (error) throw error;

    if (!pendingItems || pendingItems.length === 0) {
      console.log('No pending items found. Skipping email.');
      return NextResponse.json({
        success: true,
        message: 'No pending items to report',
      });
    }

    // 2. Generate Excel workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Void Checks App';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Pending Void Checks', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    // Define columns
    sheet.columns = [
      { header: 'ID', key: 'id', width: 38 },
      { header: 'Check #', key: 'check_number', width: 15 },
      { header: 'Check Amount', key: 'check_amount', width: 18 },
      { header: 'Owner #', key: 'owner_number', width: 15 },
      { header: 'Check Date', key: 'check_date', width: 15 },
      { header: 'Notes', key: 'notes', width: 35 },
      { header: 'Completion Status', key: 'completion_status', width: 20 },
      { header: 'Request Date', key: 'request_date', width: 20 },
      { header: 'Created By', key: 'created_by', width: 30 },
    ];

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0078D4' },
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 28;

    // Add data rows
    pendingItems.forEach((item) => {
      const row = sheet.addRow({
        id: item.id,
        check_number: item.check_number,
        check_amount: item.check_amount,
        owner_number: item.owner_number,
        check_date: item.check_date
          ? new Date(item.check_date).toLocaleDateString('en-US')
          : '',
        notes: item.notes || '',
        completion_status: item.completion_status,
        request_date: item.request_date
          ? new Date(item.request_date).toLocaleDateString('en-US')
          : '',
        created_by: item.created_by,
      });

      // Format amount as currency
      row.getCell('check_amount').numFmt = '$#,##0.00';
      // Muted style for ID column
      row.getCell('id').font = { size: 9, color: { argb: 'FF8C93A3' } };
    });

    // Add borders and alternating row colors
    sheet.eachRow((row, rowNumber) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD4DAE3' } },
          bottom: { style: 'thin', color: { argb: 'FFD4DAE3' } },
          left: { style: 'thin', color: { argb: 'FFD4DAE3' } },
          right: { style: 'thin', color: { argb: 'FFD4DAE3' } },
        };
      });
      if (rowNumber > 1 && rowNumber % 2 === 0) {
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF7F8FA' },
        };
      }
    });

    // Auto-filter (A through I = 9 columns)
    sheet.autoFilter = {
      from: 'A1',
      to: `I${pendingItems.length + 1}`,
    };

    // 3. Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    // 4. Send email
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });

    const now = new Date();
    const monthYear = now.toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });
    const filename = `Pending_Void_Checks_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-18.xlsx`;

    // Recipients - comma-separated list from env var
    const recipients = process.env.REPORT_RECIPIENTS || '';

    if (!recipients) {
      console.error('No REPORT_RECIPIENTS configured');
      return NextResponse.json({
        success: false,
        error: 'No recipients configured',
      }, { status: 500 });
    }

    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: recipients,
      subject: `Pending Void Checks Report — ${monthYear}`,
      html: `
        <div style="font-family: Segoe UI, Arial, sans-serif; max-width: 600px;">
          <h2 style="color: #0078d4; margin-bottom: 4px;">Pending Void Checks Report</h2>
          <p style="color: #5a6275; margin-top: 0;">${monthYear}</p>
          <p>There are currently <strong>${pendingItems.length}</strong> pending void check request${pendingItems.length > 1 ? 's' : ''}.</p>
          <p>Please see the attached spreadsheet for full details.</p>
          <hr style="border: none; border-top: 1px solid #d4dae3; margin: 20px 0;" />
          <p style="font-size: 12px; color: #8c93a3;">
            This is an automated report generated by the Void Checks Management App.
          </p>
        </div>
      `,
      attachments: [
        {
          filename,
          content: Buffer.from(buffer as ArrayBuffer),
          contentType:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
      ],
    });

    console.log(
      `Pending report sent: ${pendingItems.length} items to ${recipients}`
    );

    return NextResponse.json({
      success: true,
      message: `Report sent with ${pendingItems.length} pending items`,
      recipients,
    });
  } catch (error: any) {
    console.error('Cron job error:', error);
    return NextResponse.json(
      { error: 'Failed to generate/send report', details: error.message },
      { status: 500 }
    );
  }
}
