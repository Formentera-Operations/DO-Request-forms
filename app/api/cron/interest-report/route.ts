import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import ExcelJS from 'exceljs';
import nodemailer from 'nodemailer';

const TABLE_NAME = 'interest_tracker';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createServerSupabaseClient();
    const { data: pendingItems, error } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .eq('completion_status', 'Pending')
      .order('request_date', { ascending: false });

    if (error) throw error;

    if (!pendingItems || pendingItems.length === 0) {
      console.log('No pending interest tracker items found. Skipping email.');
      return NextResponse.json({
        success: true,
        message: 'No pending items to report',
      });
    }

    // Generate Excel workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'DO Request Forms App';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Pending Interest Tracker', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    sheet.columns = [
      { header: '#', key: 'row_number', width: 8 },
      { header: 'Owner', key: 'owner_display', width: 35 },
      { header: '% Interest Charged', key: 'interest_rate', width: 20 },
      { header: 'Interest Start Date (Prod)', key: 'interest_start_date', width: 25 },
      { header: 'Interest End Date (Prod)', key: 'interest_end_date', width: 25 },
      { header: 'Amount Due', key: 'amount_due', width: 18 },
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
    pendingItems.forEach((item, index) => {
      const ownerDisplay = item.owner_name
        ? `${item.owner_number} \u2013 ${item.owner_name}`
        : item.owner_number;

      const row = sheet.addRow({
        row_number: index + 1,
        owner_display: ownerDisplay,
        interest_rate: item.interest_rate,
        interest_start_date: item.interest_start_date || '',
        interest_end_date: item.interest_end_date || '',
        amount_due: item.amount_due,
        notes: item.notes || '',
        completion_status: item.completion_status,
        request_date: item.request_date
          ? new Date(item.request_date).toLocaleDateString('en-US')
          : '',
        created_by: item.created_by,
      });

      row.getCell('amount_due').numFmt = '$#,##0.00';
      row.getCell('interest_rate').numFmt = '0.00"%"';
      row.getCell('row_number').alignment = { horizontal: 'center' };

      // Unlock editable cells
      row.getCell('notes').protection = { locked: false };
      row.getCell('completion_status').protection = { locked: false };

      // Dropdown for Completion Status
      row.getCell('completion_status').dataValidation = {
        type: 'list',
        allowBlank: false,
        formulae: ['"Complete,Request Invalidated"'],
        showErrorMessage: true,
        errorTitle: 'Invalid Status',
        error: 'Please select Complete or Request Invalidated.',
      };
    });

    // Protect the sheet
    sheet.protect('', {
      selectLockedCells: true,
      selectUnlockedCells: true,
      autoFilter: true,
      sort: true,
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

    // Auto-filter (A through J = 10 columns)
    sheet.autoFilter = {
      from: 'A1',
      to: `J${pendingItems.length + 1}`,
    };

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    // Send email
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
    const filename = `Pending_Interest_Tracker_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-18.xlsx`;

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
      subject: `Pending Interest Tracker Report \u2014 ${monthYear}`,
      html: `
        <div style="font-family: Segoe UI, Arial, sans-serif; max-width: 600px;">
          <h2 style="color: #0078d4; margin-bottom: 4px;">Pending Interest Tracker Report</h2>
          <p style="color: #5a6275; margin-top: 0;">${monthYear}</p>
          <p>There are currently <strong>${pendingItems.length}</strong> pending interest tracker entr${pendingItems.length > 1 ? 'ies' : 'y'}.</p>
          <p>Please see the attached spreadsheet for full details.</p>
          <hr style="border: none; border-top: 1px solid #d4dae3; margin: 20px 0;" />
          <p style="font-size: 12px; color: #8c93a3;">
            This is an automated report generated by the DO Request Forms App.
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
      `Interest tracker report sent: ${pendingItems.length} items to ${recipients}`
    );

    return NextResponse.json({
      success: true,
      message: `Report sent with ${pendingItems.length} pending items`,
      recipients,
    });
  } catch (error: any) {
    console.error('Interest tracker cron job error:', error);
    return NextResponse.json(
      { error: 'Failed to generate/send report', details: error.message },
      { status: 500 }
    );
  }
}
