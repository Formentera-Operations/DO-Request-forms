export interface VoidCheckSubmission {
  id?: string;
  check_number: string;
  check_amount: number;
  owner_number: string;
  owner_name: string;
  check_date: string;
  notes: string;
  request_date: string;
  completion_status: 'Pending' | 'Complete' | 'Request Invalidated';
  sign_off_date: string | null;
  created_by: string;
  attachments?: string[];
}

export interface CheckOption {
  check_number: string;
  owner_number: string;
  owner_name: string;
  check_amount: number;
  check_date: string;
}

export interface InterestTrackerSubmission {
  id?: string;
  owner_number: string;
  owner_name: string;
  interest_rate: number;
  interest_start_date: string;
  interest_end_date: string;
  amount_due: number;
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

export type AppView = 'void-checks' | 'interest-tracker';

export type TabView = 'new-entry' | 'submissions';

export interface SubmissionFilters {
  search: string;
  status: string;
  createdBy: string;
  dateFrom: string;
  dateTo: string;
}
