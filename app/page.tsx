'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  VoidCheckSubmission,
  CheckOption,
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
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
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
  const [activeTab, setActiveTab] = useState<TabView>('new-entry');

  return (
    <div>
      <div className="tab-bar">
        <div className="tab-bar-title">Void Checks</div>
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

      {activeTab === 'new-entry' ? (
        <div className="content-area">
          <NewEntryForm onSuccess={() => setActiveTab('submissions')} />
        </div>
      ) : (
        <div className="content-area wide">
          <SubmissionsView />
        </div>
      )}
    </div>
  );
}

/* ============================================================
   New Entry Form
   ============================================================ */
function NewEntryForm({ onSuccess }: { onSuccess: () => void }) {
  const [checkNumber, setCheckNumber] = useState('');
  const [checkDisplay, setCheckDisplay] = useState('');
  const [checkAmount, setCheckAmount] = useState('');
  const [ownerNumber, setOwnerNumber] = useState('');
  const [checkDate, setCheckDate] = useState('');
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
          check_date: checkDate.includes('-') && checkDate.length === 10
            ? `${checkDate.slice(6, 10)}-${checkDate.slice(0, 2)}-${checkDate.slice(3, 5)}`
            : checkDate,
          notes,
          attachments: uploadedPaths,
          created_by: 'current.user@formenteraops.com', // TODO: replace with auth
        }),
      });

      if (!res.ok) throw new Error('Failed to submit');

      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        setCheckNumber(''); setCheckDisplay('');
        setCheckAmount('');
        setOwnerNumber(''); setOwnerName('');
        setCheckDate(''); setNotes(''); setAttachments([]);
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
            Submitting as current.user@formenteraops.com
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
                    const d = new Date(raw);
                    const dd = String(d.getDate()).padStart(2, '0');
                    const mm = String(d.getMonth() + 1).padStart(2, '0');
                    const yyyy = d.getFullYear();
                    setCheckDate(`${mm}-${dd}-${yyyy}`);
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
                type="number"
                step="0.01"
                min="0"
                className="form-input"
                placeholder="0.00"
                value={checkAmount}
                onChange={sanitizeAmount}
                onBlur={formatAmount}
                required
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
                placeholder="MM-DD-YYYY"
                value={checkDate}
                onChange={(e) => setCheckDate(e.target.value)}
                required
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
function SubmissionsView() {
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

  // Filtering
  const filtered = submissions.filter((s) => {
    if (filters.search) {
      const q = filters.search.toLowerCase();
      if (!s.owner_number.toLowerCase().includes(q) && !s.check_number.toLowerCase().includes(q))
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
      check_date: sub.check_date,
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
                  <th>Check Date</th>
                  <th style={{ width: notesWidth, minWidth: 80, position: 'relative' }}>
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
                      <td onClick={() => openDetail(submissions.indexOf(s))}>{formatDate(s.check_date)}</td>
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
                    <div className="detail-label">Owner Number</div>
                    <SearchDropdown
                      placeholder="Search owner..."
                      value={editData.owner_number || ''}
                      displayValue={editData.owner_number || ''}
                      onChange={(val) => setEditData((d) => ({ ...d, owner_number: val }))}
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
                      <div className="detail-label">Owner Number</div>
                      <div className="detail-value">{detailSub.owner_number}</div>
                    </div>
                    <div className="detail-field">
                      <div className="detail-label">Check Date</div>
                      <div className="detail-value">{formatDate(detailSub.check_date)}</div>
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
    </>
  );
}
