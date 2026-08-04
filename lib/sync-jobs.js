/**
 * The syncs shown on the Settings health panel, and how long each may go
 * without a successful run before it should be treated as overdue.
 *
 * Kept free of server-only imports so client pages can use it without pulling
 * the service-role Supabase client into the browser bundle.
 */
export const SYNC_JOBS = [
  { job: 'scm',         label: 'SCM Baseline',        expectedEveryHours: 48 },
  { job: 'attendance',  label: 'Training Attendance', expectedEveryHours: 48 },
  { job: 'memberships', label: 'Session Memberships', expectedEveryHours: 48 },
  { job: 'join-dates',  label: 'Join Dates',          expectedEveryHours: 24 * 45 },
  { job: 'rankings',    label: 'Rankings',            expectedEveryHours: 24 * 14 },
];
