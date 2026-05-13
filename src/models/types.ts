/**
 * Represents the current status of a job in the queue.
 */
export enum JobStatus {
  PENDING = 'PENDING',
  CLAIMED = 'CLAIMED',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED', // Permanent failure or max retries exceeded (DLQ)
  RETRY_SCHEDULED = 'RETRY_SCHEDULED',
  CANCELLED = 'CANCELLED',
}

/**
 * Represents the result of a job execution by a worker.
 */
export enum JobResultType {
  SUCCESS = 'SUCCESS',
  TRANSIENT_FAILURE = 'TRANSIENT_FAILURE',
  PERMANENT_FAILURE = 'PERMANENT_FAILURE',
}

/**
 * The result returned by a JobHandler after attempting to process a job.
 */
export interface JobResult {
  type: JobResultType;
  error?: Error | string;
}

/**
 * Represents the input payload for a job.
 */
export type JobPayload = Record<string, any>;

/**
 * The specification for submitting a new job.
 */
export interface JobSpec {
  /** The type of job (e.g., 'send_email') */
  type: string;
  /** The data to be processed by the job handler */
  payload: JobPayload;
  /** Job priority (0-9). Higher numbers execute first. Defaults to 5. */
  priority?: number | undefined;
  /** Maximum number of retries before moving to DLQ. Defaults to 3. */
  maxRetries?: number | undefined;
  /** Optional name for the job */
  name?: string | undefined;
  /** Optional description for the job */
  description?: string | undefined;
  /** Optional delay in milliseconds before the job can be executed */
  delayInMs?: number | undefined;
}

/**
 * The complete data model for a Job stored in the queue.
 */
export interface Job {
  /** Unique identifier for the job */
  id: string;
  /** The type of job (e.g., 'send_email') */
  type: string;
  /** The data to be processed by the job handler */
  payload: JobPayload;
  /** Job priority (0-9). Higher numbers execute first. */
  priority: number;
  /** Maximum number of retries before moving to DLQ. */
  maxRetries: number;
  /** Current number of failed attempts. */
  attemptCount: number;
  /** Optional name for the job */
  name?: string | undefined;
  /** Optional description for the job */
  description?: string | undefined;
  /** Timestamp when the job was created */
  createdAt: number;
  /** Timestamp when the job was last updated */
  updatedAt: number;
  /** Current status of the job */
  status: JobStatus;
  /** ID of the worker/lease currently holding the job, if any */
  leaseId: string | null;
  /** Timestamp when the current lease expires, if any */
  leaseExpireAt: number | null;
  /** Timestamp when the job is eligible to run again (used for backoff) */
  nextRunAt: number;
}
