export interface VoidCheckSubmission {
  id?: string;
  check_number: string;
  check_amount: number;
  owner_number: string;
  check_date: string;
  notes: string;
  request_date: string;
  completion_status: 'Pending' | 'Complete' | 'Request Invalidated';
  sign_off_date: string | null;
  created_by: string;
  attachments?: string[];
}

export interface OwnerOption {
  owner_number: string;
  owner_name: string;
}

export interface CheckOption {
  check_number: string;
  check_description: string;
}

export type TabView = 'new-entry' | 'submissions';

export interface SubmissionFilters {
  search: string;
  status: string;
  createdBy: string;
  dateFrom: string;
  dateTo: string;
}
