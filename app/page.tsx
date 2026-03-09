'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSession, signIn } from 'next-auth/react';
import type {
  VoidCheckSubmission,
  InterestTrackerSubmission,
  TransferLogSubmission,
  CheckOption,
  OwnerOption,
  WellOption,
  AppView,
  TabView,
  SubmissionFilters,
} from '@/lib/types';

/* ============================================================
   Helper hooks
   ============================================================ */
function useDebounce(fn: (...args: any[]) => void, delay: number) {
  const timer = useRef<NodeJS.Timeout>();
  return useCallback(
    (...args: any[]) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => fn(...args), delay);
    },
    [fn, delay]
  );
}

function useClickOutside(ref: React.RefObject<HTMLElement | null>, handler: () => void) {
  useEffect(() => {
    function listener(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) handler();
    }
    document.addEventListener('mousedown', listener);
    return () => document.removeEventListener('mousedown', listener);
  }, [ref, handler]);
}

/* ============================================================
   Shared helpers
   ============================================================ */
function formatDate(d: string | null) {
  if (!d) return '—';
  // Parse as UTC to avoid timezone shift (date-only strings like "2026-01-25" are UTC)
  const dt = new Date(d);
  return dt.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function formatCurrency(v: number) {
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2 });
}

function statusClass(s: string) {
  return s === 'Complete'
    ? 'complete'
    : s === 'Request Invalidated'
    ? 'invalidated'
    : 'pending';
}

function exportToCsv(filename: string, headers: string[], rows: string[][]) {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const csv = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function exportToExcel(
  filename: string,
  headers: string[],
  rows: string[][],
  dropdowns?: { col: number; options: string[] }[],
) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');

  // Header row
  const headerRow = ws.addRow(headers);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F8FA' } };
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FFD4DAE3' } },
    };
  });

  // Data rows
  rows.forEach((r) => ws.addRow(r));

  // Auto-width columns
  ws.columns.forEach((col, i) => {
    let max = headers[i]?.length || 10;
    rows.forEach((r) => { if (r[i] && r[i].length > max) max = r[i].length; });
    col.width = Math.min(max + 4, 40);
  });

  // Add dropdowns
  if (dropdowns) {
    for (const dd of dropdowns) {
      for (let r = 2; r <= rows.length + 1; r++) {
        ws.getCell(r, dd.col + 1).dataValidation = {
          type: 'list',
          allowBlank: false,
          formulae: [`"${dd.options.join(',')}"`],
        };
      }
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ============================================================
   SearchDropdown — reusable search-as-you-type component
   ============================================================ */
function SearchDropdown<T extends Record<string, string>>({
  placeholder,
  value,
  onChange,
  onSelect,
  fetchUrl,
  mapResult,
  displayValue,
  renderOption,
}: {
  placeholder: string;
  value: string;
  onChange: (value: string, display: string) => void;
  onSelect?: (item: T) => void;
  fetchUrl: string;
  mapResult: (data: any) => T[];
  displayValue: string;
  renderOption: (item: T) => React.ReactNode;
}) {
  const [search, setSearch] = useState(displayValue);
  const [options, setOptions] = useState<T[]>([]);
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useClickOutside(wrapperRef, () => setShow(false));

  useEffect(() => {
    setSearch(displayValue);
  }, [displayValue]);

  const fetchOptions = useCallback(
    async (query: string) => {
      setLoading(true);
      try {
        const res = await fetch(`${fetchUrl}?search=${encodeURIComponent(query)}`);
        const data = await res.json();
        if (Array.isArray(data)) setOptions(mapResult(data));
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setLoading(false);
      }
    },
    [fetchUrl, mapResult]
  );

  const debouncedFetch = useDebounce(fetchOptions, 300);

  const handleInputChange = (val: string) => {
    setSearch(val);
    onChange('', val);
    setShow(true);
    debouncedFetch(val);
  };

  const handleFocus = () => {
    setShow(true);
    if (!options.length) fetchOptions(search || '');
  };

  return (
    <div className="search-wrapper" ref={wrapperRef}>
      <input
        type="text"
        className="form-input"
        placeholder={placeholder}
        value={search}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={handleFocus}
      />
      {show && (
        <div className="search-dropdown">
          {loading ? (
            <div className="search-no-results">Loading...</div>
          ) : options.length > 0 ? (
            options.map((item, i) => (
              <div
                key={i}
                className="search-option"
                onClick={() => {
                  const key = Object.keys(item)[0];
                  const val = item[key];
                  setSearch(val);
                  onChange(val, val);
                  onSelect?.(item);
                  setShow(false);
                }}
              >
                {renderOption(item)}
              </div>
            ))
          ) : (
            <div className="search-no-results">No results found</div>
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Main Page
   ============================================================ */
export default function VoidChecksPage() {
  const { data: session, status } = useSession();
  const [activeApp, setActiveApp] = useState<AppView>('void-checks');
  const [vcTab, setVcTab] = useState<TabView>('new-entry');
  const [itTab, setItTab] = useState<TabView>('new-entry');
  const [tlTab, setTlTab] = useState<TabView>('new-entry');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [deepLinkId, setDeepLinkId] = useState<string | null>(null);

  // Handle deep link URL params: ?app=<app>&id=xxx
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const app = params.get('app');
    const id = params.get('id');
    if (app === 'void-checks') {
      setActiveApp('void-checks');
      setVcTab('submissions');
      if (id) setDeepLinkId(id);
      window.history.replaceState({}, '', window.location.pathname);
    } else if (app === 'interest-tracker') {
      setActiveApp('interest-tracker');
      setItTab('submissions');
      if (id) setDeepLinkId(id);
      window.history.replaceState({}, '', window.location.pathname);
    } else if (app === 'transfer-log') {
      setActiveApp('transfer-log');
      setTlTab('submissions');
      if (id) setDeepLinkId(id);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  useClickOutside(menuRef, () => setMenuOpen(false));

  // Show loading while checking auth
  if (status === 'loading') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-muted)' }}>
        Loading...
      </div>
    );
  }

  // Redirect to sign in if not authenticated
  if (!session) {
    signIn('azure-ad');
    return null;
  }

  const userEmail = session.user?.email || 'Unknown User';
  const activeTab = activeApp === 'void-checks' ? vcTab : activeApp === 'interest-tracker' ? itTab : tlTab;
  const setActiveTab = activeApp === 'void-checks' ? setVcTab : activeApp === 'interest-tracker' ? setItTab : setTlTab;
  const appLabel = activeApp === 'void-checks' ? 'Void Checks' : activeApp === 'interest-tracker' ? 'Interest Tracker' : 'Transfer Log';

  return (
    <div>
      <div className="tab-bar">
        <div className="hamburger-wrapper" ref={menuRef}>
          <button className="hamburger-btn" onClick={() => setMenuOpen((o) => !o)}>
            <span className="hamburger-icon">☰</span>
            {appLabel}
            <span className={`hamburger-chevron ${menuOpen ? 'open' : ''}`}>▾</span>
          </button>
          {menuOpen && (
            <div className="hamburger-dropdown">
              <button
                className={`hamburger-item ${activeApp === 'void-checks' ? 'active' : ''}`}
                onClick={() => { setActiveApp('void-checks'); setMenuOpen(false); }}
              >
                <span className="hamburger-item-icon">✓</span>
                Void Checks
              </button>
              <button
                className={`hamburger-item ${activeApp === 'interest-tracker' ? 'active' : ''}`}
                onClick={() => { setActiveApp('interest-tracker'); setMenuOpen(false); }}
              >
                <span className="hamburger-item-icon">%</span>
                Interest Tracker
              </button>
              <button
                className={`hamburger-item ${activeApp === 'transfer-log' ? 'active' : ''}`}
                onClick={() => { setActiveApp('transfer-log'); setMenuOpen(false); }}
              >
                <span className="hamburger-item-icon">↔</span>
                Transfer Log
              </button>
            </div>
          )}
        </div>
        <button
          className={`tab-btn ${activeTab === 'new-entry' ? 'active' : ''}`}
          onClick={() => setActiveTab('new-entry')}
        >
          + New Entry
        </button>
        <button
          className={`tab-btn ${activeTab === 'submissions' ? 'active' : ''}`}
          onClick={() => setActiveTab('submissions')}
        >
          📋 Submissions
        </button>
      </div>

      {activeApp === 'void-checks' ? (
        vcTab === 'new-entry' ? (
          <div className="content-area">
            <NewEntryForm onSuccess={() => setVcTab('submissions')} userEmail={userEmail} />
          </div>
        ) : (
          <div className="content-area wide">
            <SubmissionsView openId={deepLinkId} onOpenIdHandled={() => setDeepLinkId(null)} />
          </div>
        )
      ) : activeApp === 'interest-tracker' ? (
        itTab === 'new-entry' ? (
          <div className="content-area">
            <InterestTrackerForm onSuccess={() => setItTab('submissions')} userEmail={userEmail} />
          </div>
        ) : (
          <div className="content-area wide">
            <InterestTrackerSubmissionsView openId={deepLinkId} onOpenIdHandled={() => setDeepLinkId(null)} />
          </div>
        )
      ) : (
        tlTab === 'new-entry' ? (
          <div className="content-area">
            <TransferLogForm onSuccess={() => setTlTab('submissions')} userEmail={userEmail} />
          </div>
        ) : (
          <div className="content-area wide">
            <TransferLogSubmissionsView openId={deepLinkId} onOpenIdHandled={() => setDeepLinkId(null)} />
          </div>
        )
      )}
    </div>
  );
}

/* ============================================================
   New Entry Form
   ============================================================ */
function NewEntryForm({ onSuccess, userEmail }: { onSuccess: () => void; userEmail: string }) {
  const [checkNumber, setCheckNumber] = useState('');
  const [checkDisplay, setCheckDisplay] = useState('');
  const [checkAmount, setCheckAmount] = useState('');
  const [ownerNumber, setOwnerNumber] = useState('');
  const [checkDate, setCheckDate] = useState('');
  const [requestSource, setRequestSource] = useState('');
  const [notes, setNotes] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [ownerName, setOwnerName] = useState('');
  const mapChecks = useCallback((data: any[]) => data, []);

  const sanitizeAmount = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (val < 0) e.target.value = Math.abs(val).toString();
    setCheckAmount(e.target.value);
  };

  const formatAmount = (e: React.FocusEvent<HTMLInputElement>) => {
    if (e.target.value) {
      const val = Math.abs(parseFloat(e.target.value));
      if (isNaN(val)) {
        setCheckAmount('');
        return;
      }
      setCheckAmount(val.toFixed(2));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!checkNumber) { alert('Please select a Check Number'); return; }
    if (!ownerNumber) { alert('Please select an Owner Number'); return; }
    if (!checkAmount || !checkDate) return;

    // Duplicate check — warn if owner, check number, and amount already exist
    try {
      const res = await fetch('/api/submissions');
      const existing: VoidCheckSubmission[] = await res.json();
      const amt = parseFloat(checkAmount);
      const chk = String(checkNumber).trim();
      const own = String(ownerNumber).trim();
      const dupe = existing.find(
        (s) =>
          String(s.check_number).trim() === chk &&
          String(s.owner_number).trim() === own &&
          Math.abs(Number(s.check_amount) - amt) < 0.01
      );
      if (dupe) {
        const msg = `A submission already exists with Check # ${dupe.check_number}, Amount $${Number(dupe.check_amount).toFixed(2)}, and Owner # ${dupe.owner_number}.\n\nWould you like to submit anyway?`;
        if (!confirm(msg)) return;
      }
    } catch {}

    setSubmitting(true);
    try {
      // Upload attachments to Supabase Storage first
      let uploadedPaths: string[] = [];
      if (attachments.length > 0) {
        const formData = new FormData();
        attachments.forEach((f) => formData.append('files', f));
        const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
        if (!uploadRes.ok) throw new Error('Failed to upload attachments');
        const uploadData = await uploadRes.json();
        uploadedPaths = uploadData.paths;
      }

      const res = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          check_number: checkNumber,
          check_amount: checkAmount,
          owner_number: ownerNumber,
          owner_name: ownerName,
          check_date: checkDate.includes('-') && checkDate.length === 10
            ? `${checkDate.slice(6, 10)}-${checkDate.slice(0, 2)}-${checkDate.slice(3, 5)}`
            : checkDate,
          request_source: requestSource,
          notes,
          attachments: uploadedPaths,
          created_by: userEmail,
        }),
      });

      if (!res.ok) throw new Error('Failed to submit');

      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        setCheckNumber(''); setCheckDisplay('');
        setCheckAmount('');
        setOwnerNumber(''); setOwnerName('');
        setCheckDate(''); setRequestSource(''); setNotes(''); setAttachments([]);
        onSuccess();
      }, 1800);
    } catch (err) {
      console.error('Submit error:', err);
      alert('Failed to submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="form-card">
        <div className="form-card-accent" />
        <div className="form-card-body">
          <h1 className="form-card-title">New Void Check Entry</h1>
          <p className="form-card-subtitle">
            Submitting as {userEmail}
          </p>

          <form onSubmit={handleSubmit}>
            {/* Check Number */}
            <div className="form-group">
              <label className="form-label">
                Check Number <span className="required">*</span>
              </label>
              <SearchDropdown
                placeholder="Search and select a check..."
                value={checkNumber}
                displayValue={checkDisplay}
                onChange={(val, display) => {
                  setCheckNumber(val);
                  setCheckDisplay(display);
                }}
                onSelect={(item: any) => {
                  setOwnerNumber(item.owner_number || '');
                  setOwnerName(item.owner_name || '');
                  const amt = item.check_amount != null ? Number(item.check_amount) : NaN;
                  setCheckAmount(isNaN(amt) ? '' : amt.toFixed(2));
                  const raw = item.check_date || '';
                  if (raw) {
                    const parts = raw.split('T')[0].split('-');
                    setCheckDate(`${parts[1]}-${parts[2]}-${parts[0]}`);
                  } else {
                    setCheckDate('');
                  }
                }}
                fetchUrl="/api/checks"
                mapResult={mapChecks}
                renderOption={(item: any) => (
                  <span className="search-option-number">{item.check_number}</span>
                )}
              />
            </div>

            {/* Check Amount */}
            <div className="form-group">
              <label className="form-label">
                Check Amount <span className="required">*</span>
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="Auto-filled when check is selected"
                value={checkAmount ? `$${checkAmount}` : ''}
                readOnly
              />
            </div>

            {/* Owner Number (auto-filled from check) */}
            <div className="form-group">
              <label className="form-label">
                Owner Number <span className="required">*</span>
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="Auto-filled when check is selected"
                value={ownerNumber ? `${ownerNumber} – ${ownerName}` : ''}
                readOnly
              />
            </div>

            {/* Check Date */}
            <div className="form-group">
              <label className="form-label">
                Check Date <span className="required">*</span>
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="Auto-filled when check is selected"
                value={checkDate}
                readOnly
              />
            </div>

            {/* Request Source */}
            <div className="form-group">
              <label className="form-label">
                Request Source <span className="required">*</span>
              </label>
              <select
                className="form-input"
                value={requestSource}
                onChange={(e) => setRequestSource(e.target.value)}
                required
              >
                <option value="" disabled>Select a source...</option>
                <option value="Returned Check">Returned Check</option>
                <option value="Void Request">Void Request</option>
              </select>
            </div>

            {/* Notes */}
            <div className="form-group">
              <label className="form-label">Notes</label>
              <textarea
                className="form-textarea"
                placeholder="Input Notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            {/* Attachments */}
            <div className="attach-section">
              <label className="form-label">Attachments</label>
              {attachments.length === 0 ? (
                <p className="attach-empty">There is nothing attached.</p>
              ) : (
                <div className="attach-list">
                  {attachments.map((file, i) => (
                    <div key={i} className="attach-item">
                      <a
                        href={URL.createObjectURL(file)}
                        download={file.name}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'var(--primary)', textDecoration: 'none' }}
                      >
                        📎 {file.name}
                      </a>
                      <button
                        type="button"
                        className="attach-remove"
                        onClick={() => setAttachments((p) => p.filter((_, j) => j !== i))}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={(e) => {
                  const newFiles = e.target.files ? Array.from(e.target.files) : [];
                  if (newFiles.length > 0) {
                    setAttachments((p) => [...p, ...newFiles]);
                  }
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                className="attach-btn"
                onClick={() => fileInputRef.current?.click()}
              >
                📎 Attach file
              </button>
            </div>

            <button type="submit" className="submit-btn" disabled={submitting}>
              {submitting ? 'Submitting...' : 'Submit'}
            </button>
          </form>
        </div>
      </div>

      {showSuccess && (
        <div className="toast-overlay">
          <div className="toast">
            <div className="toast-icon">✓</div>
            <h3>Submitted Successfully</h3>
            <p>Your void check request is now pending.</p>
          </div>
        </div>
      )}
    </>
  );
}

/* ============================================================
   Submissions View — filters, bulk actions, detail/edit modal
   ============================================================ */
function SubmissionsView({ openId, onOpenIdHandled }: { openId?: string | null; onOpenIdHandled?: () => void }) {
  const [submissions, setSubmissions] = useState<VoidCheckSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<SubmissionFilters>({
    search: '', status: '', createdBy: '', dateFrom: '', dateTo: '',
  });
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState('');
  const [detailIndex, setDetailIndex] = useState<number | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState<Partial<VoidCheckSubmission>>({});
  const [editAttachments, setEditAttachments] = useState<string[]>([]);
  const editFileRef = useRef<HTMLInputElement>(null);

  // Spreadsheet upload
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<any>(null);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const uploadFileRef = useRef<HTMLInputElement>(null);

  const closeUploadModal = useCallback(() => {
    setShowUploadModal(false);
    setUploadFile(null);
    setUploadPreview(null);
    setUploadResult(null);
    setUploadError(null);
    setUploadLoading(false);
    if (uploadFileRef.current) uploadFileRef.current.value = '';
  }, []);

  const handleUploadPreview = useCallback(async () => {
    if (!uploadFile) return;
    setUploadLoading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append('file', uploadFile);
      fd.append('action', 'preview');
      const res = await fetch('/api/upload-spreadsheet', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) { setUploadError(data.error || 'Failed to parse spreadsheet'); return; }
      setUploadPreview(data);
    } catch {
      setUploadError('Failed to upload. Please try again.');
    } finally {
      setUploadLoading(false);
    }
  }, [uploadFile]);

  const handleUploadApply = useCallback(async () => {
    if (!uploadFile) return;
    setUploadLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', uploadFile);
      fd.append('action', 'apply');
      const res = await fetch('/api/upload-spreadsheet', { method: 'POST', body: fd });
      const data = await res.json();
      setUploadResult(data);
    } catch {
      setUploadError('Failed to apply changes.');
    } finally {
      setUploadLoading(false);
    }
  }, [uploadFile]);

  // Notes column resize
  const [notesWidth, setNotesWidth] = useState(200);
  const resizeStartX = useRef(0);
  const resizeStartW = useRef(0);

  const onNotesResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizeStartX.current = e.clientX;
    resizeStartW.current = notesWidth;

    const onMouseMove = (ev: MouseEvent) => {
      const diff = ev.clientX - resizeStartX.current;
      setNotesWidth(Math.max(80, resizeStartW.current + diff));
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [notesWidth]);

  const fetchSubmissions = useCallback(async () => {
    try {
      const res = await fetch('/api/submissions');
      const data = await res.json();
      if (Array.isArray(data)) setSubmissions(data);
    } catch (err) {
      console.error('Error fetching submissions:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSubmissions(); }, [fetchSubmissions]);

  // Auto-open detail from deep link
  useEffect(() => {
    if (openId && submissions.length > 0 && !loading) {
      const idx = submissions.findIndex((s) => s.id === openId);
      if (idx !== -1) setDetailIndex(idx);
      onOpenIdHandled?.();
    }
  }, [openId, submissions, loading, onOpenIdHandled]);

  // Filtering
  const filtered = submissions.filter((s) => {
    if (filters.search) {
      const q = filters.search.toLowerCase();
      if (!s.owner_number.toLowerCase().includes(q) && !s.check_number.toLowerCase().includes(q) && !(s.owner_name || '').toLowerCase().includes(q))
        return false;
    }
    if (filters.status && s.completion_status !== filters.status) return false;
    if (filters.createdBy && s.created_by !== filters.createdBy) return false;
    if (filters.dateFrom) {
      const rd = new Date(s.request_date).toISOString().slice(0, 10);
      if (rd < filters.dateFrom) return false;
    }
    if (filters.dateTo) {
      const rd = new Date(s.request_date).toISOString().slice(0, 10);
      if (rd > filters.dateTo) return false;
    }
    return true;
  }).sort((a, b) => new Date(b.request_date).getTime() - new Date(a.request_date).getTime());

  const uniqueUsers = [...new Set(submissions.map((s) => s.created_by))].sort();

  const clearFilters = () =>
    setFilters({ search: '', status: '', createdBy: '', dateFrom: '', dateTo: '' });

  const activeFilterTags = [
    filters.search && { label: `Search: ${filters.search}`, key: 'search' as const },
    filters.status && { label: `Status: ${filters.status}`, key: 'status' as const },
    filters.createdBy && {
      label: `By: ${filters.createdBy.split('@')[0]}`,
      key: 'createdBy' as const,
    },
    filters.dateFrom && { label: `From: ${formatDate(filters.dateFrom)}`, key: 'dateFrom' as const },
    filters.dateTo && { label: `To: ${formatDate(filters.dateTo)}`, key: 'dateTo' as const },
  ].filter(Boolean) as { label: string; key: keyof SubmissionFilters }[];

  // Selection
  const filteredIds = new Set(filtered.map((s) => s.id!));
  const allSelected = filtered.length > 0 && filtered.every((s) => selectedRows.has(s.id!));
  const someSelected = filtered.some((s) => selectedRows.has(s.id!));

  const toggleRow = (id: string) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelectedRows((prev) => {
        const next = new Set(prev);
        filteredIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedRows((prev) => {
        const next = new Set(prev);
        filteredIds.forEach((id) => next.add(id));
        return next;
      });
    }
  };

  const applyBulk = async () => {
    if (!bulkStatus || selectedRows.size === 0) return;
    const n = selectedRows.size;
    if (!confirm(`Change status to "${bulkStatus}" for ${n} submission${n > 1 ? 's' : ''}?`))
      return;

    try {
      const res = await fetch('/api/submissions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: Array.from(selectedRows),
          completion_status: bulkStatus,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      setSelectedRows(new Set());
      setBulkStatus('');
      fetchSubmissions();
    } catch (err) {
      alert('Failed to update. Please try again.');
    }
  };

  const clearSelection = () => {
    setSelectedRows(new Set());
    setBulkStatus('');
  };

  // Status change (single)
  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      const res = await fetch('/api/submissions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, completion_status: newStatus }),
      });
      if (!res.ok) throw new Error('Failed');
      fetchSubmissions();
    } catch (err) {
      alert('Failed to update status.');
    }
  };

  // Delete
  const handleDelete = async (sub: VoidCheckSubmission) => {
    if (
      !confirm(
        `Are you sure you want to delete this entry?\n\nCheck # ${sub.check_number} — ${formatCurrency(sub.check_amount)}\n\nThis action cannot be undone.`
      )
    )
      return;

    try {
      const res = await fetch('/api/submissions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sub.id }),
      });
      if (!res.ok) throw new Error('Failed');
      closeDetail();
      fetchSubmissions();
    } catch (err) {
      alert('Failed to delete. Please try again.');
    }
  };

  // Edit
  const startEdit = (sub: VoidCheckSubmission) => {
    setEditMode(true);
    setEditData({
      check_number: sub.check_number,
      check_amount: sub.check_amount,
      owner_number: sub.owner_number,
      owner_name: sub.owner_name,
      check_date: sub.check_date,
      request_source: sub.request_source,
      notes: sub.notes,
      completion_status: sub.completion_status,
    });
    setEditAttachments(sub.attachments ? [...sub.attachments] : []);
  };

  const saveEdit = async () => {
    if (detailIndex === null) return;
    const sub = submissions[detailIndex];
    if (!editData.check_number || !editData.owner_number || !editData.check_date) {
      alert('Please fill in all required fields.');
      return;
    }

    try {
      const res = await fetch('/api/submissions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sub.id, ...editData, attachments: editAttachments }),
      });
      if (!res.ok) throw new Error('Failed');
      setEditMode(false);
      fetchSubmissions();
    } catch (err) {
      alert('Failed to save changes.');
    }
  };

  const openDetail = (index: number) => {
    setDetailIndex(index);
    setEditMode(false);
  };

  const closeDetail = () => {
    setDetailIndex(null);
    setEditMode(false);
  };

  // Close modal on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeDetail(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const detailSub = detailIndex !== null ? submissions[detailIndex] : null;

  return (
    <>
      <div className="submissions-card">
        <div className="form-card-accent" />
        <div className="submissions-header">
          <h2>Submissions</h2>
          <span className="submissions-count">
            {filtered.length} of {submissions.length}
          </span>
          <button className="upload-spreadsheet-btn" onClick={() => setShowUploadModal(true)}>
            Upload Spreadsheet
          </button>
        </div>

        {/* Bulk bar */}
        {selectedRows.size > 0 && (
          <div className="bulk-bar">
            <span className="bulk-count">{selectedRows.size} selected</span>
            <select
              className="bulk-select"
              value={bulkStatus}
              onChange={(e) => setBulkStatus(e.target.value)}
            >
              <option value="">Change status to...</option>
              <option value="Pending">Pending</option>
              <option value="Complete">Complete</option>
              <option value="Request Invalidated">Request Invalidated</option>
            </select>
            <button
              className="bulk-apply"
              disabled={!bulkStatus}
              onClick={applyBulk}
            >
              Apply
            </button>
            <button className="bulk-cancel" onClick={clearSelection}>
              Cancel
            </button>
          </div>
        )}

        {/* Filters */}
        <div className="filters-bar">
          <div className="filter-group">
            <span className="filter-label">Search</span>
            <input
              className="filter-input"
              placeholder="Owner # or Check #"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            />
          </div>
          <div className="filter-group">
            <span className="filter-label">Status</span>
            <select
              className="filter-select"
              value={filters.status}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
            >
              <option value="">All Statuses</option>
              <option value="Pending">Pending</option>
              <option value="Complete">Complete</option>
              <option value="Request Invalidated">Request Invalidated</option>
            </select>
          </div>
          <div className="filter-group">
            <span className="filter-label">Created By</span>
            <select
              className="filter-select"
              value={filters.createdBy}
              onChange={(e) => setFilters((f) => ({ ...f, createdBy: e.target.value }))}
            >
              <option value="">All Users</option>
              {uniqueUsers.map((u) => (
                <option key={u} value={u}>
                  {u.split('@')[0]}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-divider" />
          <div className="filter-group">
            <span className="filter-label">Request Date From</span>
            <input
              type="date"
              className="filter-input filter-date"
              value={filters.dateFrom}
              onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
            />
          </div>
          <div className="filter-group">
            <span className="filter-label">Request Date To</span>
            <input
              type="date"
              className="filter-input filter-date"
              value={filters.dateTo}
              onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
            />
          </div>
          <button className="filter-clear" onClick={clearFilters}>
            Clear All
          </button>
          <button className="export-btn" onClick={() => {
            const headers = ['Check #', 'Check Amount', 'Owner #', 'Owner Name', 'Check Date', 'Request Source', 'Notes', 'Request Date', 'Completion Status', 'Sign-Off Date', 'Created By'];
            const rows = filtered.map((s) => [
              s.check_number,
              formatCurrency(s.check_amount),
              s.owner_number,
              s.owner_name || '',
              formatDate(s.check_date),
              s.request_source || '',
              s.notes || '',
              formatDate(s.request_date),
              s.completion_status,
              formatDate(s.sign_off_date),
              s.created_by,
            ]);
            exportToExcel('void-checks.xlsx', headers, rows, [
              { col: 8, options: ['Pending', 'Complete', 'Request Invalidated'] },
            ]);
          }}>
            Export
          </button>
        </div>

        {/* Active filter tags */}
        {activeFilterTags.length > 0 && (
          <div className="active-filters">
            {activeFilterTags.map((t) => (
              <span key={t.key} className="filter-tag">
                {t.label}
                <button
                  className="filter-tag-remove"
                  onClick={() => setFilters((f) => ({ ...f, [t.key]: '' }))}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="empty-state"><p>Loading submissions...</p></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <p>{submissions.length ? 'No submissions match your filters' : 'No submissions yet'}</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      className="row-checkbox"
                      checked={allSelected}
                      ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                      onChange={toggleAll}
                    />
                  </th>
                  <th>#</th>
                  <th>Check #</th>
                  <th>Check Amount</th>
                  <th>Owner #</th>
                  <th>Owner Name</th>
                  <th>Check Date</th>
                  <th>Request Source</th>
                  <th style={{ width: notesWidth, minWidth: 80 }}>
                    Notes
                    <span
                      className="col-resize-handle"
                      onMouseDown={onNotesResizeStart}
                    />
                  </th>
                  <th>Request Date</th>
                  <th>Completion Status</th>
                  <th>Sign-Off Date</th>
                  <th>Created By</th>
                  <th>Attachments</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s, i) => {
                  const ac = s.attachments?.length || 0;
                  return (
                    <tr key={s.id}>
                      <td onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="row-checkbox"
                          checked={selectedRows.has(s.id!)}
                          onChange={() => toggleRow(s.id!)}
                        />
                      </td>
                      <td style={{ color: 'var(--text-muted)' }} onClick={() => openDetail(submissions.indexOf(s))}>{i + 1}</td>
                      <td style={{ fontWeight: 600 }} onClick={() => openDetail(submissions.indexOf(s))}>{s.check_number}</td>
                      <td onClick={() => openDetail(submissions.indexOf(s))}>{formatCurrency(s.check_amount)}</td>
                      <td onClick={() => openDetail(submissions.indexOf(s))}>{s.owner_number}</td>
                      <td onClick={() => openDetail(submissions.indexOf(s))}>{s.owner_name || '\u2014'}</td>
                      <td onClick={() => openDetail(submissions.indexOf(s))}>{formatDate(s.check_date)}</td>
                      <td onClick={() => openDetail(submissions.indexOf(s))}>{s.request_source || '—'}</td>
                      <td
                        className="cell-truncate"
                        style={{ maxWidth: notesWidth }}
                        onClick={() => openDetail(submissions.indexOf(s))}
                        title={s.notes || ''}
                      >
                        {s.notes || '—'}
                      </td>
                      <td onClick={() => openDetail(submissions.indexOf(s))}>{formatDate(s.request_date)}</td>
                      <td onClick={() => openDetail(submissions.indexOf(s))}>
                        <span className={`status ${statusClass(s.completion_status)}`}>
                          {s.completion_status}
                        </span>
                      </td>
                      <td onClick={() => openDetail(submissions.indexOf(s))}>{formatDate(s.sign_off_date)}</td>
                      <td onClick={() => openDetail(submissions.indexOf(s))}>{s.created_by}</td>
                      <td onClick={() => openDetail(submissions.indexOf(s))}>
                        {ac > 0 ? `📎 ${ac}` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail / Edit Modal */}
      {detailSub && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeDetail(); }}>
          <div className="modal">
            <div className="modal-header">
              <h2>
                {editMode
                  ? `Editing Entry – Check ${detailSub.check_number}`
                  : `Entry Detail – Check ${detailSub.check_number}`}
              </h2>
              <div className="modal-actions">
                {editMode ? (
                  <>
                    <button className="save-btn" onClick={saveEdit}>Save</button>
                    <button className="cancel-edit-btn" onClick={() => setEditMode(false)}>Cancel</button>
                  </>
                ) : (
                  <>
                    <button className="delete-btn" onClick={() => handleDelete(detailSub)}>🗑 Delete</button>
                    <button className="edit-btn" onClick={() => startEdit(detailSub)}>✎ Edit</button>
                  </>
                )}
                <button className="modal-close" onClick={closeDetail}>×</button>
              </div>
            </div>
            <div className="modal-body">
              {editMode ? (
                <div className="detail-grid">
                  <div className="detail-field">
                    <div className="detail-label">Check Number</div>
                    <SearchDropdown
                      placeholder="Search check..."
                      value={editData.check_number || ''}
                      displayValue={editData.check_number || ''}
                      onChange={(val) => setEditData((d) => ({ ...d, check_number: val }))}
                      fetchUrl="/api/checks"
                      mapResult={(d) => d}
                      renderOption={(item: any) => (
                        <>
                          <span className="search-option-number">{item.check_number}</span>
                          <span className="search-option-name">{item.check_description}</span>
                        </>
                      )}
                    />
                  </div>
                  <div className="detail-field">
                    <div className="detail-label">Check Amount</div>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="edit-input"
                      value={editData.check_amount?.toFixed(2) || ''}
                      onChange={(e) => {
                        let v = parseFloat(e.target.value);
                        if (v < 0) v = Math.abs(v);
                        setEditData((d) => ({ ...d, check_amount: v }));
                      }}
                    />
                  </div>
                  <div className="detail-field">
                    <div className="detail-label">Owner</div>
                    <SearchDropdown
                      placeholder="Search owner..."
                      value={editData.owner_number || ''}
                      displayValue={editData.owner_name ? `${editData.owner_number} \u2013 ${editData.owner_name}` : editData.owner_number || ''}
                      onChange={(val) => setEditData((d) => ({ ...d, owner_number: val, owner_name: '' }))}
                      onSelect={(item: any) => setEditData((d) => ({ ...d, owner_number: item.owner_number, owner_name: item.owner_name || '' }))}
                      fetchUrl="/api/owners"
                      mapResult={(d) => d}
                      renderOption={(item: any) => (
                        <>
                          <span className="search-option-number">{item.owner_number}</span>
                          <span className="search-option-name">{item.owner_name}</span>
                        </>
                      )}
                    />
                  </div>
                  <div className="detail-field">
                    <div className="detail-label">Check Date</div>
                    <input
                      type="date"
                      className="edit-input"
                      value={editData.check_date || ''}
                      onChange={(e) => setEditData((d) => ({ ...d, check_date: e.target.value }))}
                    />
                  </div>
                  <div className="detail-field">
                    <div className="detail-label">Request Source</div>
                    <select
                      className="edit-input"
                      value={editData.request_source || ''}
                      onChange={(e) => setEditData((d) => ({ ...d, request_source: e.target.value }))}
                    >
                      <option value="" disabled>Select a source...</option>
                      <option value="Returned Check">Returned Check</option>
                      <option value="Void Request">Void Request</option>
                    </select>
                  </div>
                  <div className="detail-field">
                    <div className="detail-label">Request Date</div>
                    <div className="detail-value" style={{ paddingTop: 8 }}>
                      {formatDate(detailSub.request_date)}
                    </div>
                  </div>
                  <div className="detail-field">
                    <div className="detail-label">Created By</div>
                    <div className="detail-value" style={{ paddingTop: 8 }}>
                      {detailSub.created_by}
                    </div>
                  </div>
                  <div className="detail-field">
                    <div className="detail-label">Sign-Off Date</div>
                    <div className="detail-value" style={{ paddingTop: 8 }}>
                      {formatDate(detailSub.sign_off_date)}
                    </div>
                  </div>
                  <div className="detail-field">
                    <div className="detail-label">Completion Status</div>
                    <select
                      className="edit-input"
                      value={editData.completion_status || 'Pending'}
                      onChange={(e) =>
                        setEditData((d) => ({
                          ...d,
                          completion_status: e.target.value as any,
                        }))
                      }
                    >
                      <option value="Pending">Pending</option>
                      <option value="Complete">Complete</option>
                      <option value="Request Invalidated">Request Invalidated</option>
                    </select>
                  </div>
                  <div className="detail-field full">
                    <div className="detail-label">Notes</div>
                    <textarea
                      className="edit-textarea"
                      value={editData.notes || ''}
                      onChange={(e) => setEditData((d) => ({ ...d, notes: e.target.value }))}
                    />
                  </div>
                  <div className="detail-field full">
                    <div className="detail-label">Attachments</div>
                    {editAttachments.length === 0 ? (
                      <p className="attach-empty">No attachments</p>
                    ) : (
                      <div className="attach-list">
                        {editAttachments.map((f, i) => (
                          <div key={i} className="attach-item">
                            <span>📎 {f}</span>
                            <button
                              type="button"
                              className="attach-remove"
                              onClick={() => setEditAttachments((p) => p.filter((_, j) => j !== i))}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <input
                      ref={editFileRef}
                      type="file"
                      multiple
                      onChange={(e) => {
                        if (e.target.files) {
                          setEditAttachments((p) => [
                            ...p,
                            ...Array.from(e.target.files!).map((f) => f.name),
                          ]);
                        }
                        if (editFileRef.current) editFileRef.current.value = '';
                      }}
                      style={{ display: 'none' }}
                    />
                    <button
                      type="button"
                      className="attach-btn"
                      style={{ marginTop: 8 }}
                      onClick={() => editFileRef.current?.click()}
                    >
                      📎 Attach file
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="detail-grid">
                    <div className="detail-field">
                      <div className="detail-label">Check Number</div>
                      <div className="detail-value" style={{ fontWeight: 600 }}>
                        {detailSub.check_number}
                      </div>
                    </div>
                    <div className="detail-field">
                      <div className="detail-label">Check Amount</div>
                      <div className="detail-value">{formatCurrency(detailSub.check_amount)}</div>
                    </div>
                    <div className="detail-field">
                      <div className="detail-label">Owner</div>
                      <div className="detail-value">{detailSub.owner_name ? `${detailSub.owner_number} \u2013 ${detailSub.owner_name}` : detailSub.owner_number}</div>
                    </div>
                    <div className="detail-field">
                      <div className="detail-label">Check Date</div>
                      <div className="detail-value">{formatDate(detailSub.check_date)}</div>
                    </div>
                    <div className="detail-field">
                      <div className="detail-label">Request Source</div>
                      <div className="detail-value">{detailSub.request_source || '—'}</div>
                    </div>
                    <div className="detail-field">
                      <div className="detail-label">Request Date</div>
                      <div className="detail-value">{formatDate(detailSub.request_date)}</div>
                    </div>
                    <div className="detail-field">
                      <div className="detail-label">Created By</div>
                      <div className="detail-value">{detailSub.created_by}</div>
                    </div>
                    <div className="detail-field">
                      <div className="detail-label">Sign-Off Date</div>
                      <div className="detail-value">{formatDate(detailSub.sign_off_date)}</div>
                    </div>
                    <div className="detail-field">
                      <div className="detail-label">Completion Status</div>
                      <div className="detail-value">
                        <span className={`status ${statusClass(detailSub.completion_status)}`}>
                          {detailSub.completion_status}
                        </span>
                      </div>
                    </div>
                    <div className="detail-field full">
                      <div className="detail-label">Notes</div>
                      <div className={`detail-notes ${detailSub.notes ? '' : 'empty'}`}>
                        {detailSub.notes || 'No notes provided'}
                      </div>
                    </div>
                    <div className="detail-field full">
                      <div className="detail-label">Attachments</div>
                      {detailSub.attachments?.length ? (
                        <div className="detail-attachments">
                          {detailSub.attachments.map((a, i) => {
                            const fileName = a.split('/').pop() || a;
                            // Strip leading timestamp prefix (e.g. "1234567890-") from display name
                            const displayName = fileName.replace(/^\d+-/, '');
                            return (
                              <div
                                key={i}
                                className="detail-attach-item"
                                onClick={async () => {
                                  try {
                                    const res = await fetch(`/api/download?path=${encodeURIComponent(a)}`);
                                    const data = await res.json();
                                    if (data.url) {
                                      window.open(data.url, '_blank');
                                    } else {
                                      alert('Failed to get download link.');
                                    }
                                  } catch {
                                    alert('Failed to open file.');
                                  }
                                }}
                              >
                                📎 {displayName}
                                <span className="attach-dl">Open ↗</span>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: 13 }}>
                          No attachments
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="detail-status-row">
                    <label>Update Status:</label>
                    <select
                      className="detail-status-select"
                      value={detailSub.completion_status}
                      onChange={(e) => {
                        handleStatusChange(detailSub.id!, e.target.value);
                      }}
                    >
                      <option value="Pending">Pending</option>
                      <option value="Complete">Complete</option>
                      <option value="Request Invalidated">Request Invalidated</option>
                    </select>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Upload Spreadsheet Modal */}
      {showUploadModal && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeUploadModal(); }}>
          <div className="modal" style={{ maxWidth: 680 }}>
            <div className="modal-header">
              <h2>Upload Spreadsheet</h2>
              <div className="modal-actions">
                <button className="modal-close" onClick={closeUploadModal}>×</button>
              </div>
            </div>
            <div className="modal-body">

              {/* Phase 1: File Selection */}
              {!uploadPreview && !uploadResult && (
                <div>
                  <p style={{ marginBottom: 16, color: 'var(--text-secondary)', fontSize: 13 }}>
                    Upload the Excel report to update <strong>Notes</strong> and <strong>Completion Status</strong> for matching records.
                  </p>
                  <input
                    ref={uploadFileRef}
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={(e) => { setUploadFile(e.target.files?.[0] || null); setUploadError(null); }}
                  />
                  {uploadError && <p style={{ color: 'var(--danger, #e74c3c)', marginTop: 8, fontSize: 13 }}>{uploadError}</p>}
                  <div style={{ marginTop: 16 }}>
                    <button className="submit-btn" disabled={!uploadFile || uploadLoading} onClick={handleUploadPreview}>
                      {uploadLoading ? 'Parsing...' : 'Upload & Preview'}
                    </button>
                  </div>
                </div>
              )}

              {/* Phase 2: Preview */}
              {uploadPreview && !uploadResult && (
                <div>
                  {uploadPreview.updates.length > 0 ? (
                    <>
                      <p style={{ marginBottom: 12, fontSize: 13 }}>
                        <strong>{uploadPreview.updates.length}</strong> record(s) will be updated:
                      </p>
                      <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                        <table className="upload-preview-table">
                          <thead>
                            <tr>
                              <th>Check #</th>
                              <th>Field</th>
                              <th>Current</th>
                              <th>New</th>
                            </tr>
                          </thead>
                          <tbody>
                            {uploadPreview.updates.flatMap((u: any) =>
                              Object.entries(u.changes).map(([field, change]: [string, any]) => (
                                <tr key={`${u.id}-${field}`}>
                                  <td>{u.checkNumber}</td>
                                  <td>{field === 'completion_status' ? 'Status' : 'Notes'}</td>
                                  <td><span className="upload-change-from">{change.from || '(empty)'}</span></td>
                                  <td><span className="upload-change-to">{change.to || '(empty)'}</span></td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </>
                  ) : (
                    <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No changes detected in the spreadsheet.</p>
                  )}

                  {uploadPreview.warnings.length > 0 && (
                    <div className="upload-warnings">
                      <strong>Warnings ({uploadPreview.warnings.length})</strong>
                      {uploadPreview.warnings.map((w: any, i: number) => (
                        <div key={i} className="upload-warning-item">Row {w.row}: {w.message}</div>
                      ))}
                    </div>
                  )}

                  {uploadPreview.skipped.length > 0 && (
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                      {uploadPreview.skipped.length} row(s) skipped (no changes).
                    </p>
                  )}

                  {uploadError && <p style={{ color: 'var(--danger, #e74c3c)', marginTop: 8, fontSize: 13 }}>{uploadError}</p>}

                  <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                    {uploadPreview.updates.length > 0 && (
                      <button className="submit-btn" disabled={uploadLoading} onClick={handleUploadApply}>
                        {uploadLoading ? 'Applying...' : `Apply ${uploadPreview.updates.length} Change${uploadPreview.updates.length > 1 ? 's' : ''}`}
                      </button>
                    )}
                    <button className="cancel-edit-btn" onClick={closeUploadModal}>Cancel</button>
                  </div>
                </div>
              )}

              {/* Phase 3: Result */}
              {uploadResult && (
                <div>
                  <p style={{ fontSize: 14, marginBottom: 8 }}>
                    <strong>{uploadResult.applied.length}</strong> record(s) updated successfully.
                  </p>
                  {uploadResult.errors.length > 0 && (
                    <p style={{ color: 'var(--danger, #e74c3c)', fontSize: 13 }}>
                      {uploadResult.errors.length} error(s) occurred.
                    </p>
                  )}
                  {uploadResult.warnings.length > 0 && (
                    <p style={{ color: '#e67e22', fontSize: 13 }}>
                      {uploadResult.warnings.length} warning(s).
                    </p>
                  )}
                  <button className="submit-btn" style={{ marginTop: 16 }} onClick={() => {
                    closeUploadModal();
                    fetchSubmissions();
                  }}>
                    Done
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ============================================================
   Interest Tracker — New Entry Form
   ============================================================ */
function InterestTrackerForm({ onSuccess, userEmail }: { onSuccess: () => void; userEmail: string }) {
  const [ownerNumber, setOwnerNumber] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerDisplay, setOwnerDisplay] = useState('');
  const [interestRate, setInterestRate] = useState('');
  const [interestStartDate, setInterestStartDate] = useState('');
  const [interestEndDate, setInterestEndDate] = useState('');
  const [amountDue, setAmountDue] = useState('');
  const [notes, setNotes] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const mapOwners = useCallback((data: any[]) => data, []);

  const sanitizeRate = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = parseFloat(e.target.value);
    if (val < 0) val = Math.abs(val);
    if (val > 100) val = 100;
    setInterestRate(e.target.value);
  };

  const sanitizeAmount = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (val < 0) e.target.value = Math.abs(val).toString();
    setAmountDue(e.target.value);
  };

  const formatAmount = (e: React.FocusEvent<HTMLInputElement>) => {
    if (e.target.value) {
      const val = Math.abs(parseFloat(e.target.value));
      if (isNaN(val)) { setAmountDue(''); return; }
      setAmountDue(val.toFixed(2));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!ownerNumber) { alert('Please select an Owner'); return; }
    if (!interestRate) { alert('Please enter % Interest Charged'); return; }
    if (!interestStartDate) { alert('Please enter Interest Start Date'); return; }
    if (!interestEndDate) { alert('Please enter Interest End Date'); return; }
    const amt = amountDue ? parseFloat(amountDue) : NaN;
    if (amountDue && (isNaN(amt) || amt < 0)) { alert('Please enter a valid Amount of Late Payment'); return; }

    setSubmitting(true);
    try {
      let uploadedPaths: string[] = [];
      if (attachments.length > 0) {
        const formData = new FormData();
        attachments.forEach((f) => formData.append('files', f));
        formData.append('folder', 'interest-tracker');
        const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
        if (!uploadRes.ok) throw new Error('Failed to upload attachments');
        const uploadData = await uploadRes.json();
        uploadedPaths = uploadData.paths;
      }

      const res = await fetch('/api/interest-tracker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner_number: ownerNumber,
          owner_name: ownerName,
          interest_rate: interestRate,
          interest_start_date: interestStartDate,
          interest_end_date: interestEndDate,
          amount_due: amountDue,
          notes,
          attachments: uploadedPaths,
          created_by: userEmail,
        }),
      });

      if (!res.ok) throw new Error('Failed to submit');

      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        setOwnerNumber(''); setOwnerName(''); setOwnerDisplay('');
        setInterestRate(''); setInterestStartDate(''); setInterestEndDate('');
        setAmountDue(''); setNotes(''); setAttachments([]);
        onSuccess();
      }, 1800);
    } catch (err) {
      console.error('Submit error:', err);
      alert('Failed to submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="form-card">
        <div className="form-card-accent" />
        <div className="form-card-body">
          <h1 className="form-card-title">New Interest Tracker Entry</h1>
          <p className="form-card-subtitle">Submitting as {userEmail}</p>

          <form onSubmit={handleSubmit}>
            {/* Owner */}
            <div className="form-group">
              <label className="form-label">
                Owner # - Owner Name <span className="required">*</span>
              </label>
              <SearchDropdown
                placeholder="Search by owner # or name..."
                value={ownerNumber}
                displayValue={ownerDisplay}
                onChange={(val, display) => {
                  setOwnerNumber(val);
                  setOwnerDisplay(display);
                  setOwnerName('');
                }}
                onSelect={(item: any) => {
                  setOwnerNumber(item.owner_number || '');
                  setOwnerName(item.owner_name || '');
                  setOwnerDisplay(
                    item.owner_name
                      ? `${item.owner_number} \u2013 ${item.owner_name}`
                      : item.owner_number || ''
                  );
                }}
                fetchUrl="/api/owners"
                mapResult={mapOwners}
                renderOption={(item: any) => (
                  <>
                    <span className="search-option-number">{item.owner_number}</span>
                    <span className="search-option-name">{item.owner_name}</span>
                  </>
                )}
              />
            </div>

            {/* % Interest Charged */}
            <div className="form-group">
              <label className="form-label">
                % Interest Charged <span className="required">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                className="form-input"
                placeholder="e.g. 5.25"
                value={interestRate}
                onChange={sanitizeRate}
                required
              />
            </div>

            {/* Interest Start Date (Prod) */}
            <div className="form-group">
              <label className="form-label">
                Interest Start Date (Prod) <span className="required">*</span>
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="Enter start date"
                value={interestStartDate}
                onChange={(e) => setInterestStartDate(e.target.value)}
                required
              />
            </div>

            {/* Interest End Date (Prod) */}
            <div className="form-group">
              <label className="form-label">
                Interest End Date (Prod) <span className="required">*</span>
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="Enter end date"
                value={interestEndDate}
                onChange={(e) => setInterestEndDate(e.target.value)}
                required
              />
            </div>

            {/* Amount of Late Payment */}
            <div className="form-group">
              <label className="form-label">
                Amount of Late Payment
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="form-input"
                placeholder="0.00"
                value={amountDue}
                onChange={sanitizeAmount}
                onBlur={formatAmount}
              />
            </div>

            {/* Notes */}
            <div className="form-group">
              <label className="form-label">Notes</label>
              <textarea
                className="form-textarea"
                placeholder="Input Notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            {/* Attachments */}
            <div className="attach-section">
              <label className="form-label">Attachments</label>
              {attachments.length === 0 ? (
                <p className="attach-empty">There is nothing attached.</p>
              ) : (
                <div className="attach-list">
                  {attachments.map((file, i) => (
                    <div key={i} className="attach-item">
                      <a
                        href={URL.createObjectURL(file)}
                        download={file.name}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'var(--primary)', textDecoration: 'none' }}
                      >
                        📎 {file.name}
                      </a>
                      <button
                        type="button"
                        className="attach-remove"
                        onClick={() => setAttachments((p) => p.filter((_, j) => j !== i))}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={(e) => {
                  const newFiles = e.target.files ? Array.from(e.target.files) : [];
                  if (newFiles.length > 0) setAttachments((p) => [...p, ...newFiles]);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                className="attach-btn"
                onClick={() => fileInputRef.current?.click()}
              >
                📎 Attach file
              </button>
            </div>

            <button type="submit" className="submit-btn" disabled={submitting}>
              {submitting ? 'Submitting...' : 'Submit'}
            </button>
          </form>
        </div>
      </div>

      {showSuccess && (
        <div className="toast-overlay">
          <div className="toast">
            <div className="toast-icon">✓</div>
            <h3>Submitted Successfully</h3>
            <p>Your interest tracker entry is now pending.</p>
          </div>
        </div>
      )}
    </>
  );
}

/* ============================================================
   Interest Tracker — Submissions View
   ============================================================ */
function InterestTrackerSubmissionsView({ openId, onOpenIdHandled }: { openId?: string | null; onOpenIdHandled?: () => void }) {
  const [submissions, setSubmissions] = useState<InterestTrackerSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<SubmissionFilters>({
    search: '', status: '', createdBy: '', dateFrom: '', dateTo: '',
  });
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState('');
  const [detailIndex, setDetailIndex] = useState<number | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState<Partial<InterestTrackerSubmission>>({});
  const [editAttachments, setEditAttachments] = useState<string[]>([]);
  const editFileRef = useRef<HTMLInputElement>(null);

  // Notes column resize
  const [notesWidth, setNotesWidth] = useState(200);
  const resizeStartX = useRef(0);
  const resizeStartW = useRef(0);

  const onNotesResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizeStartX.current = e.clientX;
    resizeStartW.current = notesWidth;
    const onMouseMove = (ev: MouseEvent) => {
      const diff = ev.clientX - resizeStartX.current;
      setNotesWidth(Math.max(80, resizeStartW.current + diff));
    };
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [notesWidth]);

  const fetchSubmissions = useCallback(async () => {
    try {
      const res = await fetch('/api/interest-tracker');
      const data = await res.json();
      if (Array.isArray(data)) setSubmissions(data);
    } catch (err) {
      console.error('Error fetching interest tracker submissions:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSubmissions(); }, [fetchSubmissions]);

  // Auto-open detail from deep link
  useEffect(() => {
    if (openId && submissions.length > 0 && !loading) {
      const idx = submissions.findIndex((s) => s.id === openId);
      if (idx !== -1) setDetailIndex(idx);
      onOpenIdHandled?.();
    }
  }, [openId, submissions, loading, onOpenIdHandled]);

  // Filtering
  const filtered = submissions.filter((s) => {
    if (filters.search) {
      const q = filters.search.toLowerCase();
      if (
        !s.owner_number.toLowerCase().includes(q) &&
        !(s.owner_name || '').toLowerCase().includes(q)
      )
        return false;
    }
    if (filters.status && s.completion_status !== filters.status) return false;
    if (filters.createdBy && s.created_by !== filters.createdBy) return false;
    if (filters.dateFrom) {
      const rd = new Date(s.request_date).toISOString().slice(0, 10);
      if (rd < filters.dateFrom) return false;
    }
    if (filters.dateTo) {
      const rd = new Date(s.request_date).toISOString().slice(0, 10);
      if (rd > filters.dateTo) return false;
    }
    return true;
  }).sort((a, b) => new Date(b.request_date).getTime() - new Date(a.request_date).getTime());

  const uniqueUsers = [...new Set(submissions.map((s) => s.created_by))].sort();

  const clearFilters = () =>
    setFilters({ search: '', status: '', createdBy: '', dateFrom: '', dateTo: '' });

  const activeFilterTags = [
    filters.search && { label: `Search: ${filters.search}`, key: 'search' as const },
    filters.status && { label: `Status: ${filters.status}`, key: 'status' as const },
    filters.createdBy && { label: `By: ${filters.createdBy.split('@')[0]}`, key: 'createdBy' as const },
    filters.dateFrom && { label: `From: ${formatDate(filters.dateFrom)}`, key: 'dateFrom' as const },
    filters.dateTo && { label: `To: ${formatDate(filters.dateTo)}`, key: 'dateTo' as const },
  ].filter(Boolean) as { label: string; key: keyof SubmissionFilters }[];

  // Selection
  const filteredIds = new Set(filtered.map((s) => s.id!));
  const allSelected = filtered.length > 0 && filtered.every((s) => selectedRows.has(s.id!));
  const someSelected = filtered.some((s) => selectedRows.has(s.id!));

  const toggleRow = (id: string) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelectedRows((prev) => {
        const next = new Set(prev);
        filteredIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedRows((prev) => {
        const next = new Set(prev);
        filteredIds.forEach((id) => next.add(id));
        return next;
      });
    }
  };

  const applyBulk = async () => {
    if (!bulkStatus || selectedRows.size === 0) return;
    const n = selectedRows.size;
    if (!confirm(`Change status to "${bulkStatus}" for ${n} submission${n > 1 ? 's' : ''}?`))
      return;
    try {
      const res = await fetch('/api/interest-tracker', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedRows), completion_status: bulkStatus }),
      });
      if (!res.ok) throw new Error('Failed');
      setSelectedRows(new Set());
      setBulkStatus('');
      fetchSubmissions();
    } catch {
      alert('Failed to update. Please try again.');
    }
  };

  const clearSelection = () => { setSelectedRows(new Set()); setBulkStatus(''); };

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      const res = await fetch('/api/interest-tracker', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, completion_status: newStatus }),
      });
      if (!res.ok) throw new Error('Failed');
      fetchSubmissions();
    } catch {
      alert('Failed to update status.');
    }
  };

  const handleDelete = async (sub: InterestTrackerSubmission) => {
    if (!confirm(`Are you sure you want to delete this entry?\n\nOwner: ${sub.owner_number} — Amount of Late Payment: ${formatCurrency(sub.amount_due)}\n\nThis action cannot be undone.`))
      return;
    try {
      const res = await fetch('/api/interest-tracker', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sub.id }),
      });
      if (!res.ok) throw new Error('Failed');
      closeDetail();
      fetchSubmissions();
    } catch {
      alert('Failed to delete. Please try again.');
    }
  };

  const startEdit = (sub: InterestTrackerSubmission) => {
    setEditMode(true);
    setEditData({
      owner_number: sub.owner_number,
      owner_name: sub.owner_name,
      interest_rate: sub.interest_rate,
      interest_start_date: sub.interest_start_date,
      interest_end_date: sub.interest_end_date,
      amount_due: sub.amount_due,
      notes: sub.notes,
      completion_status: sub.completion_status,
    });
    setEditAttachments(sub.attachments ? [...sub.attachments] : []);
  };

  const saveEdit = async () => {
    if (detailIndex === null) return;
    const sub = submissions[detailIndex];
    if (!editData.owner_number) { alert('Please fill in all required fields.'); return; }
    try {
      const res = await fetch('/api/interest-tracker', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sub.id, ...editData, attachments: editAttachments }),
      });
      if (!res.ok) throw new Error('Failed');
      setEditMode(false);
      fetchSubmissions();
    } catch {
      alert('Failed to save changes.');
    }
  };

  const openDetail = (index: number) => { setDetailIndex(index); setEditMode(false); };
  const closeDetail = () => { setDetailIndex(null); setEditMode(false); };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeDetail(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const detailSub = detailIndex !== null ? submissions[detailIndex] : null;

  const ownerDisp = (s: InterestTrackerSubmission) =>
    s.owner_name ? `${s.owner_number} \u2013 ${s.owner_name}` : s.owner_number;

  return (
    <>
      <div className="submissions-card">
        <div className="form-card-accent" />
        <div className="submissions-header">
          <h2>Submissions</h2>
          <span className="submissions-count">{filtered.length} of {submissions.length}</span>
        </div>

        {/* Bulk bar */}
        {selectedRows.size > 0 && (
          <div className="bulk-bar">
            <span className="bulk-count">{selectedRows.size} selected</span>
            <select className="bulk-select" value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}>
              <option value="">Change status to...</option>
              <option value="Pending">Pending</option>
              <option value="Complete">Complete</option>
              <option value="Request Invalidated">Request Invalidated</option>
            </select>
            <button className="bulk-apply" disabled={!bulkStatus} onClick={applyBulk}>Apply</button>
            <button className="bulk-cancel" onClick={clearSelection}>Cancel</button>
          </div>
        )}

        {/* Filters */}
        <div className="filters-bar">
          <div className="filter-group">
            <span className="filter-label">Search</span>
            <input className="filter-input" placeholder="Owner # or Name" value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} />
          </div>
          <div className="filter-group">
            <span className="filter-label">Status</span>
            <select className="filter-select" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
              <option value="">All Statuses</option>
              <option value="Pending">Pending</option>
              <option value="Complete">Complete</option>
              <option value="Request Invalidated">Request Invalidated</option>
            </select>
          </div>
          <div className="filter-group">
            <span className="filter-label">Created By</span>
            <select className="filter-select" value={filters.createdBy} onChange={(e) => setFilters((f) => ({ ...f, createdBy: e.target.value }))}>
              <option value="">All Users</option>
              {uniqueUsers.map((u) => <option key={u} value={u}>{u.split('@')[0]}</option>)}
            </select>
          </div>
          <div className="filter-divider" />
          <div className="filter-group">
            <span className="filter-label">Request Date From</span>
            <input type="date" className="filter-input filter-date" value={filters.dateFrom} onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))} />
          </div>
          <div className="filter-group">
            <span className="filter-label">Request Date To</span>
            <input type="date" className="filter-input filter-date" value={filters.dateTo} onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))} />
          </div>
          <button className="filter-clear" onClick={clearFilters}>Clear All</button>
          <button className="export-btn" onClick={() => {
            const headers = ['Owner #', 'Owner Name', '% Interest Charged', 'Interest Start Date', 'Interest End Date', 'Amount of Late Payment', 'Notes', 'Request Date', 'Completion Status', 'Sign-Off Date', 'Created By'];
            const rows = filtered.map((s) => [
              s.owner_number,
              s.owner_name || '',
              `${s.interest_rate}%`,
              s.interest_start_date || '',
              s.interest_end_date || '',
              formatCurrency(s.amount_due),
              s.notes || '',
              formatDate(s.request_date),
              s.completion_status,
              formatDate(s.sign_off_date),
              s.created_by,
            ]);
            exportToExcel('interest-tracker.xlsx', headers, rows, [
              { col: 8, options: ['Pending', 'Complete', 'Request Invalidated'] },
            ]);
          }}>
            Export
          </button>
        </div>

        {activeFilterTags.length > 0 && (
          <div className="active-filters">
            {activeFilterTags.map((t) => (
              <span key={t.key} className="filter-tag">
                {t.label}
                <button className="filter-tag-remove" onClick={() => setFilters((f) => ({ ...f, [t.key]: '' }))}>×</button>
              </span>
            ))}
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="empty-state"><p>Loading submissions...</p></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <p>{submissions.length ? 'No submissions match your filters' : 'No submissions yet'}</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>
                    <input type="checkbox" className="row-checkbox" checked={allSelected}
                      ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                      onChange={toggleAll} />
                  </th>
                  <th>#</th>
                  <th>Owner #</th>
                  <th>Owner Name</th>
                  <th>% Interest Charged</th>
                  <th>Interest Start Date (Prod)</th>
                  <th>Interest End Date (Prod)</th>
                  <th>Amount of Late Payment</th>
                  <th style={{ width: notesWidth, minWidth: 80 }}>
                    Notes
                    <span className="col-resize-handle" onMouseDown={onNotesResizeStart} />
                  </th>
                  <th>Request Date</th>
                  <th>Completion Status</th>
                  <th>Sign-Off Date</th>
                  <th>Created By</th>
                  <th>Attachments</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s, i) => {
                  const ac = s.attachments?.length || 0;
                  return (
                    <tr key={s.id}>
                      <td onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" className="row-checkbox" checked={selectedRows.has(s.id!)} onChange={() => toggleRow(s.id!)} />
                      </td>
                      <td style={{ color: 'var(--text-muted)' }} onClick={() => openDetail(submissions.indexOf(s))}>{i + 1}</td>
                      <td style={{ fontWeight: 600 }} onClick={() => openDetail(submissions.indexOf(s))}>{s.owner_number}</td>
                      <td onClick={() => openDetail(submissions.indexOf(s))}>{s.owner_name || '\u2014'}</td>
                      <td onClick={() => openDetail(submissions.indexOf(s))}>{s.interest_rate}%</td>
                      <td onClick={() => openDetail(submissions.indexOf(s))}>{s.interest_start_date || '\u2014'}</td>
                      <td onClick={() => openDetail(submissions.indexOf(s))}>{s.interest_end_date || '\u2014'}</td>
                      <td onClick={() => openDetail(submissions.indexOf(s))}>{formatCurrency(s.amount_due)}</td>
                      <td className="cell-truncate" style={{ maxWidth: notesWidth }} onClick={() => openDetail(submissions.indexOf(s))} title={s.notes || ''}>{s.notes || '\u2014'}</td>
                      <td onClick={() => openDetail(submissions.indexOf(s))}>{formatDate(s.request_date)}</td>
                      <td onClick={() => openDetail(submissions.indexOf(s))}>
                        <span className={`status ${statusClass(s.completion_status)}`}>{s.completion_status}</span>
                      </td>
                      <td onClick={() => openDetail(submissions.indexOf(s))}>{formatDate(s.sign_off_date)}</td>
                      <td onClick={() => openDetail(submissions.indexOf(s))}>{s.created_by}</td>
                      <td onClick={() => openDetail(submissions.indexOf(s))}>{ac > 0 ? `📎 ${ac}` : '\u2014'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail / Edit Modal */}
      {detailSub && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeDetail(); }}>
          <div className="modal">
            <div className="modal-header">
              <h2>{editMode ? 'Editing Entry' : 'Entry Detail'} — {ownerDisp(detailSub)}</h2>
              <div className="modal-actions">
                {editMode ? (
                  <>
                    <button className="save-btn" onClick={saveEdit}>Save</button>
                    <button className="cancel-edit-btn" onClick={() => setEditMode(false)}>Cancel</button>
                  </>
                ) : (
                  <>
                    <button className="delete-btn" onClick={() => handleDelete(detailSub)}>🗑 Delete</button>
                    <button className="edit-btn" onClick={() => startEdit(detailSub)}>✎ Edit</button>
                  </>
                )}
                <button className="modal-close" onClick={closeDetail}>×</button>
              </div>
            </div>
            <div className="modal-body">
              {editMode ? (
                <div className="detail-grid">
                  <div className="detail-field">
                    <div className="detail-label">Owner</div>
                    <SearchDropdown
                      placeholder="Search owner..."
                      value={editData.owner_number || ''}
                      displayValue={editData.owner_name ? `${editData.owner_number} \u2013 ${editData.owner_name}` : editData.owner_number || ''}
                      onChange={(val) => setEditData((d) => ({ ...d, owner_number: val, owner_name: '' }))}
                      onSelect={(item: any) => setEditData((d) => ({ ...d, owner_number: item.owner_number, owner_name: item.owner_name || '' }))}
                      fetchUrl="/api/owners"
                      mapResult={(d) => d}
                      renderOption={(item: any) => (
                        <>
                          <span className="search-option-number">{item.owner_number}</span>
                          <span className="search-option-name">{item.owner_name}</span>
                        </>
                      )}
                    />
                  </div>
                  <div className="detail-field">
                    <div className="detail-label">% Interest Charged</div>
                    <input type="number" step="0.01" min="0" max="100" className="edit-input"
                      value={editData.interest_rate ?? ''}
                      onChange={(e) => setEditData((d) => ({ ...d, interest_rate: parseFloat(e.target.value) }))} />
                  </div>
                  <div className="detail-field">
                    <div className="detail-label">Interest Start Date (Prod)</div>
                    <input type="text" className="edit-input" value={editData.interest_start_date || ''}
                      onChange={(e) => setEditData((d) => ({ ...d, interest_start_date: e.target.value }))} />
                  </div>
                  <div className="detail-field">
                    <div className="detail-label">Interest End Date (Prod)</div>
                    <input type="text" className="edit-input" value={editData.interest_end_date || ''}
                      onChange={(e) => setEditData((d) => ({ ...d, interest_end_date: e.target.value }))} />
                  </div>
                  <div className="detail-field">
                    <div className="detail-label">Amount of Late Payment</div>
                    <input type="number" step="0.01" min="0" className="edit-input"
                      value={editData.amount_due?.toFixed(2) ?? ''}
                      onChange={(e) => {
                        let v = parseFloat(e.target.value);
                        if (v < 0) v = Math.abs(v);
                        setEditData((d) => ({ ...d, amount_due: v }));
                      }} />
                  </div>
                  <div className="detail-field">
                    <div className="detail-label">Completion Status</div>
                    <select className="edit-input" value={editData.completion_status || 'Pending'}
                      onChange={(e) => setEditData((d) => ({ ...d, completion_status: e.target.value as any }))}>
                      <option value="Pending">Pending</option>
                      <option value="Complete">Complete</option>
                      <option value="Request Invalidated">Request Invalidated</option>
                    </select>
                  </div>
                  <div className="detail-field">
                    <div className="detail-label">Request Date</div>
                    <div className="detail-value" style={{ paddingTop: 8 }}>{formatDate(detailSub.request_date)}</div>
                  </div>
                  <div className="detail-field">
                    <div className="detail-label">Created By</div>
                    <div className="detail-value" style={{ paddingTop: 8 }}>{detailSub.created_by}</div>
                  </div>
                  <div className="detail-field full">
                    <div className="detail-label">Notes</div>
                    <textarea className="edit-textarea" value={editData.notes || ''}
                      onChange={(e) => setEditData((d) => ({ ...d, notes: e.target.value }))} />
                  </div>
                  <div className="detail-field full">
                    <div className="detail-label">Attachments</div>
                    {editAttachments.length === 0 ? (
                      <p className="attach-empty">No attachments</p>
                    ) : (
                      <div className="attach-list">
                        {editAttachments.map((f, i) => (
                          <div key={i} className="attach-item">
                            <span>📎 {f}</span>
                            <button type="button" className="attach-remove" onClick={() => setEditAttachments((p) => p.filter((_, j) => j !== i))}>×</button>
                          </div>
                        ))}
                      </div>
                    )}
                    <input ref={editFileRef} type="file" multiple
                      onChange={(e) => {
                        if (e.target.files) setEditAttachments((p) => [...p, ...Array.from(e.target.files!).map((f) => f.name)]);
                        if (editFileRef.current) editFileRef.current.value = '';
                      }}
                      style={{ display: 'none' }} />
                    <button type="button" className="attach-btn" style={{ marginTop: 8 }} onClick={() => editFileRef.current?.click()}>📎 Attach file</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="detail-grid">
                    <div className="detail-field">
                      <div className="detail-label">Owner</div>
                      <div className="detail-value" style={{ fontWeight: 600 }}>{ownerDisp(detailSub)}</div>
                    </div>
                    <div className="detail-field">
                      <div className="detail-label">% Interest Charged</div>
                      <div className="detail-value">{detailSub.interest_rate}%</div>
                    </div>
                    <div className="detail-field">
                      <div className="detail-label">Interest Start Date (Prod)</div>
                      <div className="detail-value">{detailSub.interest_start_date || '\u2014'}</div>
                    </div>
                    <div className="detail-field">
                      <div className="detail-label">Interest End Date (Prod)</div>
                      <div className="detail-value">{detailSub.interest_end_date || '\u2014'}</div>
                    </div>
                    <div className="detail-field">
                      <div className="detail-label">Amount of Late Payment</div>
                      <div className="detail-value">{formatCurrency(detailSub.amount_due)}</div>
                    </div>
                    <div className="detail-field">
                      <div className="detail-label">Request Date</div>
                      <div className="detail-value">{formatDate(detailSub.request_date)}</div>
                    </div>
                    <div className="detail-field">
                      <div className="detail-label">Created By</div>
                      <div className="detail-value">{detailSub.created_by}</div>
                    </div>
                    <div className="detail-field">
                      <div className="detail-label">Sign-Off Date</div>
                      <div className="detail-value">{formatDate(detailSub.sign_off_date)}</div>
                    </div>
                    <div className="detail-field">
                      <div className="detail-label">Completion Status</div>
                      <div className="detail-value">
                        <span className={`status ${statusClass(detailSub.completion_status)}`}>{detailSub.completion_status}</span>
                      </div>
                    </div>
                    <div className="detail-field full">
                      <div className="detail-label">Notes</div>
                      <div className={`detail-notes ${detailSub.notes ? '' : 'empty'}`}>{detailSub.notes || 'No notes provided'}</div>
                    </div>
                    <div className="detail-field full">
                      <div className="detail-label">Attachments</div>
                      {detailSub.attachments?.length ? (
                        <div className="detail-attachments">
                          {detailSub.attachments.map((a, i) => {
                            const fileName = a.split('/').pop() || a;
                            const displayName = fileName.replace(/^\d+-/, '');
                            return (
                              <div key={i} className="detail-attach-item"
                                onClick={async () => {
                                  try {
                                    const res = await fetch(`/api/download?path=${encodeURIComponent(a)}`);
                                    const data = await res.json();
                                    if (data.url) window.open(data.url, '_blank');
                                    else alert('Failed to get download link.');
                                  } catch { alert('Failed to open file.'); }
                                }}>
                                📎 {displayName}
                                <span className="attach-dl">Open ↗</span>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: 13 }}>No attachments</span>
                      )}
                    </div>
                  </div>
                  <div className="detail-status-row">
                    <label>Update Status:</label>
                    <select className="detail-status-select" value={detailSub.completion_status}
                      onChange={(e) => handleStatusChange(detailSub.id!, e.target.value)}>
                      <option value="Pending">Pending</option>
                      <option value="Complete">Complete</option>
                      <option value="Request Invalidated">Request Invalidated</option>
                    </select>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ============================================================
   Transfer Log — New Entry Form
   ============================================================ */
function TransferLogForm({ onSuccess, userEmail }: { onSuccess: () => void; userEmail: string }) {
  const [accountingGroup, setAccountingGroup] = useState('');
  const [wellCode, setWellCode] = useState('');
  const [wellName, setWellName] = useState('');
  const [wellDisplay, setWellDisplay] = useState('');
  const [searchKey, setSearchKey] = useState('');
  const [notes, setNotes] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const mapWells = useCallback((data: any[]) => data, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!accountingGroup) { alert('Please select an Accounting Group'); return; }
    if (!wellCode) { alert('Please select a Well Code / Name'); return; }

    setSubmitting(true);
    try {
      let uploadedPaths: string[] = [];
      if (attachments.length > 0) {
        const formData = new FormData();
        attachments.forEach((f) => formData.append('files', f));
        formData.append('folder', 'transfer-log');
        const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
        if (!uploadRes.ok) throw new Error('Failed to upload attachments');
        const uploadData = await uploadRes.json();
        uploadedPaths = uploadData.paths;
      }

      const res = await fetch('/api/transfer-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accounting_group: accountingGroup,
          well_code: wellCode,
          well_name: wellName,
          search_key: searchKey,
          notes,
          attachments: uploadedPaths,
          created_by: userEmail,
        }),
      });

      if (!res.ok) throw new Error('Failed to submit');

      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        setAccountingGroup(''); setWellCode(''); setWellName('');
        setWellDisplay(''); setSearchKey(''); setNotes(''); setAttachments([]);
        onSuccess();
      }, 1800);
    } catch (err) {
      console.error('Submit error:', err);
      alert('Failed to submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="form-card">
        <div className="form-card-accent" />
        <div className="form-card-body">
          <h1 className="form-card-title">New Transfer Log Entry</h1>
          <p className="form-card-subtitle">Submitting as {userEmail}</p>

          <form onSubmit={handleSubmit}>
            {/* Accounting Group */}
            <div className="form-group">
              <label className="form-label">
                Accounting Group <span className="required">*</span>
              </label>
              <select
                className="form-input"
                value={accountingGroup}
                onChange={(e) => setAccountingGroup(e.target.value)}
                required
              >
                <option value="" disabled>Select accounting group...</option>
                <option value="JIB">JIB</option>
                <option value="Revenue">Revenue</option>
              </select>
            </div>

            {/* Well Code / Name */}
            <div className="form-group">
              <label className="form-label">
                Well Code / Name <span className="required">*</span>
              </label>
              <SearchDropdown
                placeholder="Search by well code or name..."
                value={wellCode}
                displayValue={wellDisplay}
                onChange={(val, display) => {
                  setWellCode(val);
                  setWellDisplay(display);
                  setWellName('');
                  setSearchKey('');
                }}
                onSelect={(item: any) => {
                  setWellCode(item.well_code || '');
                  setWellName(item.well_name || '');
                  setWellDisplay(
                    item.well_name
                      ? `${item.well_code} \u2013 ${item.well_name}`
                      : item.well_code || ''
                  );
                  setSearchKey(item.search_key || '');
                }}
                fetchUrl="/api/wells"
                mapResult={mapWells}
                renderOption={(item: any) => (
                  <>
                    <span className="search-option-number">{item.well_code}</span>
                    <span className="search-option-name">{item.well_name}</span>
                  </>
                )}
              />
            </div>

            {/* Search Key (auto-populated) */}
            <div className="form-group">
              <label className="form-label">Search Key</label>
              <input
                type="text"
                className="form-input"
                placeholder="Auto-populated from well selection"
                value={searchKey}
                readOnly
              />
            </div>

            {/* Notes */}
            <div className="form-group">
              <label className="form-label">Notes</label>
              <textarea
                className="form-textarea"
                placeholder="Input Notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            {/* Attachments */}
            <div className="attach-section">
              <label className="form-label">Attachments</label>
              {attachments.length === 0 ? (
                <p className="attach-empty">There is nothing attached.</p>
              ) : (
                <div className="attach-list">
                  {attachments.map((file, i) => (
                    <div key={i} className="attach-item">
                      <a
                        href={URL.createObjectURL(file)}
                        download={file.name}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'var(--primary)', textDecoration: 'none' }}
                      >
                        📎 {file.name}
                      </a>
                      <button
                        type="button"
                        className="attach-remove"
                        onClick={() => setAttachments((p) => p.filter((_, j) => j !== i))}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={(e) => {
                  const newFiles = e.target.files ? Array.from(e.target.files) : [];
                  if (newFiles.length > 0) setAttachments((p) => [...p, ...newFiles]);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                className="attach-btn"
                onClick={() => fileInputRef.current?.click()}
              >
                📎 Attach file
              </button>
            </div>

            <button type="submit" className="submit-btn" disabled={submitting}>
              {submitting ? 'Submitting...' : 'Submit'}
            </button>
          </form>
        </div>
      </div>

      {showSuccess && (
        <div className="toast-overlay">
          <div className="toast">
            <div className="toast-icon">✓</div>
            <h3>Submitted Successfully</h3>
            <p>Your transfer log entry is now pending.</p>
          </div>
        </div>
      )}
    </>
  );
}

/* ============================================================
   Transfer Log — Submissions View
   ============================================================ */
function TransferLogSubmissionsView({ openId, onOpenIdHandled }: { openId?: string | null; onOpenIdHandled?: () => void }) {
  const [submissions, setSubmissions] = useState<TransferLogSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<SubmissionFilters>({
    search: '', status: '', createdBy: '', dateFrom: '', dateTo: '', accountingGroup: '',
  });
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState('');
  const [detailIndex, setDetailIndex] = useState<number | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState<Partial<TransferLogSubmission>>({});
  const [editAttachments, setEditAttachments] = useState<string[]>([]);
  const editFileRef = useRef<HTMLInputElement>(null);

  // Notes column resize
  const [notesWidth, setNotesWidth] = useState(200);
  const resizeStartX = useRef(0);
  const resizeStartW = useRef(0);

  const onNotesResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizeStartX.current = e.clientX;
    resizeStartW.current = notesWidth;
    const onMouseMove = (ev: MouseEvent) => {
      const diff = ev.clientX - resizeStartX.current;
      setNotesWidth(Math.max(80, resizeStartW.current + diff));
    };
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [notesWidth]);

  const fetchSubmissions = useCallback(async () => {
    try {
      const res = await fetch('/api/transfer-log');
      const data = await res.json();
      if (Array.isArray(data)) setSubmissions(data);
    } catch (err) {
      console.error('Error fetching transfer log submissions:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSubmissions(); }, [fetchSubmissions]);

  // Auto-open detail from deep link
  useEffect(() => {
    if (openId && submissions.length > 0 && !loading) {
      const idx = submissions.findIndex((s) => s.id === openId);
      if (idx !== -1) setDetailIndex(idx);
      onOpenIdHandled?.();
    }
  }, [openId, submissions, loading, onOpenIdHandled]);

  // Filtering
  const filtered = submissions.filter((s) => {
    if (filters.search) {
      const q = filters.search.toLowerCase();
      if (
        !s.well_code.toLowerCase().includes(q) &&
        !(s.well_name || '').toLowerCase().includes(q) &&
        !(s.search_key || '').toLowerCase().includes(q)
      )
        return false;
    }
    if (filters.status && s.completion_status !== filters.status) return false;
    if (filters.accountingGroup && s.accounting_group !== filters.accountingGroup) return false;
    if (filters.createdBy && s.created_by !== filters.createdBy) return false;
    if (filters.dateFrom) {
      const rd = new Date(s.request_date).toISOString().slice(0, 10);
      if (rd < filters.dateFrom) return false;
    }
    if (filters.dateTo) {
      const rd = new Date(s.request_date).toISOString().slice(0, 10);
      if (rd > filters.dateTo) return false;
    }
    return true;
  }).sort((a, b) => new Date(b.request_date).getTime() - new Date(a.request_date).getTime());

  const uniqueUsers = [...new Set(submissions.map((s) => s.created_by))].sort();

  const clearFilters = () =>
    setFilters({ search: '', status: '', createdBy: '', dateFrom: '', dateTo: '', accountingGroup: '' });

  const activeFilterTags = [
    filters.search && { label: `Search: ${filters.search}`, key: 'search' as const },
    filters.status && { label: `Status: ${filters.status}`, key: 'status' as const },
    filters.accountingGroup && { label: `Group: ${filters.accountingGroup}`, key: 'accountingGroup' as const },
    filters.createdBy && { label: `By: ${filters.createdBy.split('@')[0]}`, key: 'createdBy' as const },
    filters.dateFrom && { label: `From: ${formatDate(filters.dateFrom)}`, key: 'dateFrom' as const },
    filters.dateTo && { label: `To: ${formatDate(filters.dateTo)}`, key: 'dateTo' as const },
  ].filter(Boolean) as { label: string; key: keyof SubmissionFilters }[];

  // Selection
  const filteredIds = new Set(filtered.map((s) => s.id!));
  const allSelected = filtered.length > 0 && filtered.every((s) => selectedRows.has(s.id!));
  const someSelected = filtered.some((s) => selectedRows.has(s.id!));

  const toggleRow = (id: string) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelectedRows((prev) => {
        const next = new Set(prev);
        filteredIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedRows((prev) => {
        const next = new Set(prev);
        filteredIds.forEach((id) => next.add(id));
        return next;
      });
    }
  };

  const applyBulk = async () => {
    if (!bulkStatus || selectedRows.size === 0) return;
    const n = selectedRows.size;
    if (!confirm(`Change status to "${bulkStatus}" for ${n} submission${n > 1 ? 's' : ''}?`))
      return;
    try {
      const res = await fetch('/api/transfer-log', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedRows), completion_status: bulkStatus }),
      });
      if (!res.ok) throw new Error('Failed');
      setSelectedRows(new Set());
      setBulkStatus('');
      fetchSubmissions();
    } catch {
      alert('Failed to update. Please try again.');
    }
  };

  const clearSelection = () => { setSelectedRows(new Set()); setBulkStatus(''); };

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      const res = await fetch('/api/transfer-log', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, completion_status: newStatus }),
      });
      if (!res.ok) throw new Error('Failed');
      fetchSubmissions();
    } catch {
      alert('Failed to update status.');
    }
  };

  const handleDelete = async (sub: TransferLogSubmission) => {
    const wellDisp = sub.well_name ? `${sub.well_code} \u2013 ${sub.well_name}` : sub.well_code;
    if (!confirm(`Are you sure you want to delete this entry?\n\nWell: ${wellDisp}\n\nThis action cannot be undone.`))
      return;
    try {
      const res = await fetch('/api/transfer-log', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sub.id }),
      });
      if (!res.ok) throw new Error('Failed');
      closeDetail();
      fetchSubmissions();
    } catch {
      alert('Failed to delete. Please try again.');
    }
  };

  const mapWells = useCallback((data: any[]) => data, []);

  const startEdit = (sub: TransferLogSubmission) => {
    setEditMode(true);
    setEditData({
      accounting_group: sub.accounting_group,
      well_code: sub.well_code,
      well_name: sub.well_name,
      search_key: sub.search_key,
      notes: sub.notes,
      completion_status: sub.completion_status,
    });
    setEditAttachments(sub.attachments ? [...sub.attachments] : []);
  };

  const saveEdit = async () => {
    if (detailIndex === null) return;
    const sub = submissions[detailIndex];
    if (!editData.well_code) { alert('Please fill in all required fields.'); return; }
    try {
      const res = await fetch('/api/transfer-log', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sub.id, ...editData, attachments: editAttachments }),
      });
      if (!res.ok) throw new Error('Failed');
      setEditMode(false);
      fetchSubmissions();
    } catch {
      alert('Failed to save changes.');
    }
  };

  const openDetail = (index: number) => { setDetailIndex(index); setEditMode(false); };
  const closeDetail = () => { setDetailIndex(null); setEditMode(false); };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeDetail(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const detailSub = detailIndex !== null ? submissions[detailIndex] : null;

  const wellDisp = (s: TransferLogSubmission) =>
    s.well_name ? `${s.well_code} \u2013 ${s.well_name}` : s.well_code;

  return (
    <>
      <div className="submissions-card">
        <div className="form-card-accent" />
        <div className="submissions-header">
          <h2>Submissions</h2>
          <span className="submissions-count">{filtered.length} of {submissions.length}</span>
        </div>

        {/* Bulk bar */}
        {selectedRows.size > 0 && (
          <div className="bulk-bar">
            <span className="bulk-count">{selectedRows.size} selected</span>
            <select className="bulk-select" value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}>
              <option value="">Change status to...</option>
              <option value="Pending">Pending</option>
              <option value="Complete">Complete</option>
              <option value="Request Invalidated">Request Invalidated</option>
            </select>
            <button className="bulk-apply" disabled={!bulkStatus} onClick={applyBulk}>Apply</button>
            <button className="bulk-cancel" onClick={clearSelection}>Cancel</button>
          </div>
        )}

        {/* Filters */}
        <div className="filters-bar">
          <div className="filter-group">
            <span className="filter-label">Search</span>
            <input className="filter-input" placeholder="Well code, name, or search key" value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} />
          </div>
          <div className="filter-group">
            <span className="filter-label">Status</span>
            <select className="filter-select" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
              <option value="">All Statuses</option>
              <option value="Pending">Pending</option>
              <option value="Complete">Complete</option>
              <option value="Request Invalidated">Request Invalidated</option>
            </select>
          </div>
          <div className="filter-group">
            <span className="filter-label">Accounting Group</span>
            <select className="filter-select" value={filters.accountingGroup || ''} onChange={(e) => setFilters((f) => ({ ...f, accountingGroup: e.target.value }))}>
              <option value="">All Groups</option>
              <option value="JIB">JIB</option>
              <option value="Revenue">Revenue</option>
            </select>
          </div>
          <div className="filter-group">
            <span className="filter-label">Created By</span>
            <select className="filter-select" value={filters.createdBy} onChange={(e) => setFilters((f) => ({ ...f, createdBy: e.target.value }))}>
              <option value="">All Users</option>
              {uniqueUsers.map((u) => <option key={u} value={u}>{u.split('@')[0]}</option>)}
            </select>
          </div>
          <div className="filter-divider" />
          <div className="filter-group">
            <span className="filter-label">Request Date From</span>
            <input type="date" className="filter-input filter-date" value={filters.dateFrom} onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))} />
          </div>
          <div className="filter-group">
            <span className="filter-label">Request Date To</span>
            <input type="date" className="filter-input filter-date" value={filters.dateTo} onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))} />
          </div>
          <button className="filter-clear" onClick={clearFilters}>Clear All</button>
          <button className="export-btn" onClick={() => {
            const headers = ['Search Key', 'Well Code / Name', 'Accounting Group', 'Request Date', 'Completion Status', 'Sign-Off Date', 'Notes', 'Created By'];
            const rows = filtered.map((s) => [
              s.search_key || '',
              wellDisp(s),
              s.accounting_group,
              formatDate(s.request_date),
              s.completion_status,
              formatDate(s.sign_off_date),
              s.notes || '',
              s.created_by,
            ]);
            exportToExcel('transfer-log.xlsx', headers, rows, [
              { col: 4, options: ['Pending', 'Complete', 'Request Invalidated'] },
            ]);
          }}>
            Export
          </button>
        </div>

        {activeFilterTags.length > 0 && (
          <div className="active-filters">
            {activeFilterTags.map((t) => (
              <span key={t.key} className="filter-tag">
                {t.label}
                <button className="filter-tag-remove" onClick={() => setFilters((f) => ({ ...f, [t.key]: '' }))}>×</button>
              </span>
            ))}
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="empty-state"><p>Loading submissions...</p></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <p>{submissions.length ? 'No submissions match your filters' : 'No submissions yet'}</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>
                    <input type="checkbox" className="row-checkbox" checked={allSelected}
                      ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                      onChange={toggleAll} />
                  </th>
                  <th>#</th>
                  <th>Search Key</th>
                  <th>Well Code / Name</th>
                  <th>Accounting Group</th>
                  <th>Request Date</th>
                  <th>Completion Status</th>
                  <th>Sign-Off Status</th>
                  <th style={{ width: notesWidth, minWidth: 80 }}>
                    Notes
                    <span className="col-resize-handle" onMouseDown={onNotesResizeStart} />
                  </th>
                  <th>Created By</th>
                  <th>Attachments</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s, i) => {
                  const ac = s.attachments?.length || 0;
                  return (
                    <tr key={s.id}>
                      <td onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" className="row-checkbox" checked={selectedRows.has(s.id!)} onChange={() => toggleRow(s.id!)} />
                      </td>
                      <td style={{ color: 'var(--text-muted)' }} onClick={() => openDetail(submissions.indexOf(s))}>{i + 1}</td>
                      <td onClick={() => openDetail(submissions.indexOf(s))}>{s.search_key || '\u2014'}</td>
                      <td style={{ fontWeight: 600 }} onClick={() => openDetail(submissions.indexOf(s))}>{wellDisp(s)}</td>
                      <td onClick={() => openDetail(submissions.indexOf(s))}>{s.accounting_group}</td>
                      <td onClick={() => openDetail(submissions.indexOf(s))}>{formatDate(s.request_date)}</td>
                      <td onClick={() => openDetail(submissions.indexOf(s))}>
                        <span className={`status ${statusClass(s.completion_status)}`}>{s.completion_status}</span>
                      </td>
                      <td onClick={() => openDetail(submissions.indexOf(s))}>{formatDate(s.sign_off_date)}</td>
                      <td className="cell-truncate" style={{ maxWidth: notesWidth }} onClick={() => openDetail(submissions.indexOf(s))} title={s.notes || ''}>{s.notes || '\u2014'}</td>
                      <td onClick={() => openDetail(submissions.indexOf(s))}>{s.created_by}</td>
                      <td onClick={() => openDetail(submissions.indexOf(s))}>{ac > 0 ? `📎 ${ac}` : '\u2014'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail / Edit Modal */}
      {detailSub && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeDetail(); }}>
          <div className="modal">
            <div className="modal-header">
              <h2>{editMode ? 'Editing Entry' : 'Entry Detail'} — {wellDisp(detailSub)}</h2>
              <div className="modal-actions">
                {editMode ? (
                  <>
                    <button className="save-btn" onClick={saveEdit}>Save</button>
                    <button className="cancel-edit-btn" onClick={() => setEditMode(false)}>Cancel</button>
                  </>
                ) : (
                  <>
                    <button className="delete-btn" onClick={() => handleDelete(detailSub)}>🗑 Delete</button>
                    <button className="edit-btn" onClick={() => startEdit(detailSub)}>✎ Edit</button>
                  </>
                )}
                <button className="modal-close" onClick={closeDetail}>×</button>
              </div>
            </div>
            <div className="modal-body">
              {editMode ? (
                <div className="detail-grid">
                  <div className="detail-field">
                    <div className="detail-label">Accounting Group</div>
                    <select className="edit-input" value={editData.accounting_group || ''}
                      onChange={(e) => setEditData((d) => ({ ...d, accounting_group: e.target.value as any }))}>
                      <option value="JIB">JIB</option>
                      <option value="Revenue">Revenue</option>
                    </select>
                  </div>
                  <div className="detail-field">
                    <div className="detail-label">Well Code / Name</div>
                    <SearchDropdown
                      placeholder="Search well..."
                      value={editData.well_code || ''}
                      displayValue={editData.well_name ? `${editData.well_code} \u2013 ${editData.well_name}` : editData.well_code || ''}
                      onChange={(val) => setEditData((d) => ({ ...d, well_code: val, well_name: '', search_key: '' }))}
                      onSelect={(item: any) => setEditData((d) => ({ ...d, well_code: item.well_code, well_name: item.well_name || '', search_key: item.search_key || '' }))}
                      fetchUrl="/api/wells"
                      mapResult={mapWells}
                      renderOption={(item: any) => (
                        <>
                          <span className="search-option-number">{item.well_code}</span>
                          <span className="search-option-name">{item.well_name}</span>
                        </>
                      )}
                    />
                  </div>
                  <div className="detail-field">
                    <div className="detail-label">Search Key</div>
                    <input type="text" className="edit-input" value={editData.search_key || ''} readOnly />
                  </div>
                  <div className="detail-field">
                    <div className="detail-label">Completion Status</div>
                    <select className="edit-input" value={editData.completion_status || 'Pending'}
                      onChange={(e) => setEditData((d) => ({ ...d, completion_status: e.target.value as any }))}>
                      <option value="Pending">Pending</option>
                      <option value="Complete">Complete</option>
                      <option value="Request Invalidated">Request Invalidated</option>
                    </select>
                  </div>
                  <div className="detail-field">
                    <div className="detail-label">Request Date</div>
                    <div className="detail-value" style={{ paddingTop: 8 }}>{formatDate(detailSub.request_date)}</div>
                  </div>
                  <div className="detail-field">
                    <div className="detail-label">Created By</div>
                    <div className="detail-value" style={{ paddingTop: 8 }}>{detailSub.created_by}</div>
                  </div>
                  <div className="detail-field full">
                    <div className="detail-label">Notes</div>
                    <textarea className="edit-textarea" value={editData.notes || ''}
                      onChange={(e) => setEditData((d) => ({ ...d, notes: e.target.value }))} />
                  </div>
                  <div className="detail-field full">
                    <div className="detail-label">Attachments</div>
                    {editAttachments.length === 0 ? (
                      <p className="attach-empty">No attachments</p>
                    ) : (
                      <div className="attach-list">
                        {editAttachments.map((f, i) => (
                          <div key={i} className="attach-item">
                            <span>📎 {f}</span>
                            <button type="button" className="attach-remove" onClick={() => setEditAttachments((p) => p.filter((_, j) => j !== i))}>×</button>
                          </div>
                        ))}
                      </div>
                    )}
                    <input ref={editFileRef} type="file" multiple
                      onChange={(e) => {
                        if (e.target.files) setEditAttachments((p) => [...p, ...Array.from(e.target.files!).map((f) => f.name)]);
                        if (editFileRef.current) editFileRef.current.value = '';
                      }}
                      style={{ display: 'none' }} />
                    <button type="button" className="attach-btn" style={{ marginTop: 8 }} onClick={() => editFileRef.current?.click()}>📎 Attach file</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="detail-grid">
                    <div className="detail-field">
                      <div className="detail-label">Accounting Group</div>
                      <div className="detail-value" style={{ fontWeight: 600 }}>{detailSub.accounting_group}</div>
                    </div>
                    <div className="detail-field">
                      <div className="detail-label">Well Code / Name</div>
                      <div className="detail-value" style={{ fontWeight: 600 }}>{wellDisp(detailSub)}</div>
                    </div>
                    <div className="detail-field">
                      <div className="detail-label">Search Key</div>
                      <div className="detail-value">{detailSub.search_key || '\u2014'}</div>
                    </div>
                    <div className="detail-field">
                      <div className="detail-label">Request Date</div>
                      <div className="detail-value">{formatDate(detailSub.request_date)}</div>
                    </div>
                    <div className="detail-field">
                      <div className="detail-label">Created By</div>
                      <div className="detail-value">{detailSub.created_by}</div>
                    </div>
                    <div className="detail-field">
                      <div className="detail-label">Sign-Off Date</div>
                      <div className="detail-value">{formatDate(detailSub.sign_off_date)}</div>
                    </div>
                    <div className="detail-field">
                      <div className="detail-label">Completion Status</div>
                      <div className="detail-value">
                        <span className={`status ${statusClass(detailSub.completion_status)}`}>{detailSub.completion_status}</span>
                      </div>
                    </div>
                    <div className="detail-field full">
                      <div className="detail-label">Notes</div>
                      <div className={`detail-notes ${detailSub.notes ? '' : 'empty'}`}>{detailSub.notes || 'No notes provided'}</div>
                    </div>
                    <div className="detail-field full">
                      <div className="detail-label">Attachments</div>
                      {detailSub.attachments?.length ? (
                        <div className="detail-attachments">
                          {detailSub.attachments.map((a, i) => {
                            const fileName = a.split('/').pop() || a;
                            const displayName = fileName.replace(/^\d+-/, '');
                            return (
                              <div key={i} className="detail-attach-item"
                                onClick={async () => {
                                  try {
                                    const res = await fetch(`/api/download?path=${encodeURIComponent(a)}`);
                                    const data = await res.json();
                                    if (data.url) window.open(data.url, '_blank');
                                    else alert('Failed to get download link.');
                                  } catch { alert('Failed to open file.'); }
                                }}>
                                📎 {displayName}
                                <span className="attach-dl">Open ↗</span>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: 13 }}>No attachments</span>
                      )}
                    </div>
                  </div>
                  <div className="detail-status-row">
                    <label>Update Status:</label>
                    <select className="detail-status-select" value={detailSub.completion_status}
                      onChange={(e) => handleStatusChange(detailSub.id!, e.target.value)}>
                      <option value="Pending">Pending</option>
                      <option value="Complete">Complete</option>
                      <option value="Request Invalidated">Request Invalidated</option>
                    </select>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
