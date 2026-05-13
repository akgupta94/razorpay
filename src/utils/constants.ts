/**
 * Default priority for jobs. Higher numbers mean higher priority (0-9).
 */
export const DEFAULT_PRIORITY = 5;

/**
 * Default maximum number of retries for a job before it is moved to the DLQ.
 */
export const DEFAULT_MAX_RETRIES = 3;

/**
 * The base delay in milliseconds used for the exponential backoff formula.
 */
export const BASE_BACKOFF_MS = 1000;

/**
 * The maximum delay in milliseconds for the exponential backoff formula.
 */
export const MAX_BACKOFF_MS = 300000; // 5 minutes

/**
 * Default lease duration in milliseconds. A worker must renew or complete the job within this time.
 */
export const DEFAULT_LEASE_DURATION_MS = 30000; // 30 seconds
