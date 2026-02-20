import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import ExcelJS from 'exceljs';

const TABLE_NAME = 'void_checks';
const VALID_STATUSES = ['Pending', 'Complete', 'Request Invalidated'];

interface ParsedRow {
  rowNumber: number;
  id: string | null;
  checkNumber: string | null;
  notes: string | undefined;
  status: string | undefined;
}

interface Change {
  from: string;
  to: string;
}

interface Update {
  row: number;
  id: string;
  checkNumber: string;
  changes: { notes?: Change; completion_status?: Change };
}

interface Warning {
  row: number;
  checkNumber?: string;
  message: string;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const formData = await request.formData();
    const action = formData.get('action') as string; // 'preview' or 'apply'
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Parse the Excel file
    const arrayBuffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer as any);
    const sheet = workbook.getWorksheet(1);

    if (!sheet) {
      return NextResponse.json({ error: 'No worksheet found in file' }, { status: 400 });
    }

    // Read header row to find column indices (case-insensitive)
    const headerRow = sheet.getRow(1);
    const headers: Record<string, number> = {};
    headerRow.eachCell((cell, colNumber) => {
      const val = String(cell.value || '').trim().toLowerCase();
      headers[val] = colNumber;
    });

    const idCol = headers['id'];
    const checkCol = headers['check #'] || headers['check_number'] || headers['check number'];
    const notesCol = headers['notes'];
    const statusCol = headers['completion status'] || headers['completion_status'];

    if (!idCol && !checkCol) {
      return NextResponse.json(
        { error: 'Spreadsheet must have an "ID" or "Check #" column' },
        { status: 400 }
      );
    }

    if (!notesCol && !statusCol) {
      return NextResponse.json(
        { error: 'Spreadsheet must have a "Notes" and/or "Completion Status" column' },
        { status: 400 }
      );
    }

    // Parse data rows
    const parsedRows: ParsedRow[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const id = idCol ? String(row.getCell(idCol).value || '').trim() : null;
      const checkNumber = checkCol ? String(row.getCell(checkCol).value || '').trim() : null;
      const notes = notesCol ? String(row.getCell(notesCol).value || '').trim() : undefined;
      const status = statusCol ? String(row.getCell(statusCol).value || '').trim() : undefined;

      // Skip completely empty rows
      if (!id && !checkNumber && !notes && !status) return;

      parsedRows.push({ rowNumber, id, checkNumber, notes, status });
    });

    if (parsedRows.length === 0) {
      return NextResponse.json({ error: 'No data rows found in spreadsheet' }, { status: 400 });
    }

    // Fetch current DB records
    const { data: dbRecords, error: dbError } = await supabase
      .from(TABLE_NAME)
      .select('id, check_number, notes, completion_status');

    if (dbError) throw dbError;

    // Build lookup maps
    const dbById = new Map(dbRecords!.map((r: any) => [r.id, r]));
    const dbByCheckNumber = new Map<string, any[]>();
    for (const r of dbRecords!) {
      const cn = r.check_number;
      if (!dbByCheckNumber.has(cn)) dbByCheckNumber.set(cn, []);
      dbByCheckNumber.get(cn)!.push(r);
    }

    // Match and diff
    const updates: Update[] = [];
    const warnings: Warning[] = [];
    const skipped: { row: number; id?: string; reason: string }[] = [];

    for (const row of parsedRows) {
      let matchedRecord: any = null;

      // Try matching by ID first
      if (row.id && dbById.has(row.id)) {
        matchedRecord = dbById.get(row.id);
      } else if (row.id && !dbById.has(row.id)) {
        warnings.push({ row: row.rowNumber, message: `No record found for ID "${row.id}"` });
        continue;
      } else if (row.checkNumber) {
        // Fall back to check number matching
        const matches = dbByCheckNumber.get(row.checkNumber) || [];
        if (matches.length === 1) {
          matchedRecord = matches[0];
        } else if (matches.length > 1) {
          warnings.push({
            row: row.rowNumber,
            checkNumber: row.checkNumber,
            message: `Multiple records for Check #${row.checkNumber} — skipped (ambiguous). Use a report with the ID column for exact matching.`,
          });
          continue;
        } else {
          warnings.push({
            row: row.rowNumber,
            checkNumber: row.checkNumber,
            message: `No record found for Check #${row.checkNumber}`,
          });
          continue;
        }
      }

      if (!matchedRecord) continue;

      // Validate status
      if (row.status && !VALID_STATUSES.includes(row.status)) {
        warnings.push({
          row: row.rowNumber,
          checkNumber: matchedRecord.check_number,
          message: `Invalid status "${row.status}". Must be: ${VALID_STATUSES.join(', ')}`,
        });
        continue;
      }

      // Compute diff (only Notes and Completion Status)
      const changes: { notes?: Change; completion_status?: Change } = {};
      if (row.notes !== undefined && row.notes !== (matchedRecord.notes || '')) {
        changes.notes = { from: matchedRecord.notes || '', to: row.notes };
      }
      if (row.status && row.status !== matchedRecord.completion_status) {
        changes.completion_status = { from: matchedRecord.completion_status, to: row.status };
      }

      if (Object.keys(changes).length === 0) {
        skipped.push({ row: row.rowNumber, id: matchedRecord.id, reason: 'No changes' });
        continue;
      }

      updates.push({
        row: row.rowNumber,
        id: matchedRecord.id,
        checkNumber: matchedRecord.check_number,
        changes,
      });
    }

    // Preview mode — return diff without applying
    if (action === 'preview') {
      return NextResponse.json({ updates, warnings, skipped });
    }

    // Apply mode — write updates to DB
    const applied: { id: string; checkNumber: string }[] = [];
    const errors: { id: string; error: string }[] = [];

    for (const upd of updates) {
      const payload: any = {};
      if (upd.changes.notes) payload.notes = upd.changes.notes.to;
      if (upd.changes.completion_status) {
        payload.completion_status = upd.changes.completion_status.to;
        payload.sign_off_date =
          upd.changes.completion_status.to === 'Complete' ? new Date().toISOString() : null;
      }

      const { error } = await supabase.from(TABLE_NAME).update(payload).eq('id', upd.id);

      if (error) {
        errors.push({ id: upd.id, error: error.message });
      } else {
        applied.push({ id: upd.id, checkNumber: upd.checkNumber });
      }
    }

    return NextResponse.json({ applied, errors, warnings, skipped });
  } catch (error: any) {
    console.error('Upload spreadsheet error:', error);
    return NextResponse.json(
      { error: 'Failed to process spreadsheet', message: error?.message || 'Unknown error' },
      { status: 500 }
    );
  }
}
