import { randomUUID } from 'node:crypto';
import { type Job, type JobSpec, JobStatus, type JobResult, JobResultType } from '../models/types.js';
import {
  DEFAULT_PRIORITY,
  DEFAULT_MAX_RETRIES,
  DEFAULT_LEASE_DURATION_MS,
  BASE_BACKOFF_MS,
  MAX_BACKOFF_MS,
} from '../utils/constants.js';

/**
 * Core JobQueue class that handles in-memory job storage, priority,
 * leasing, and retry logic.
 */
export class JobQueue {
  private jobs: Map<string, Job> = new Map();

  /**
   * Submits a new job to the queue.
   * @param spec The specification of the job to submit.
   * @returns The newly created job ID.
   */
  public submit(spec: JobSpec): string {
    const id = randomUUID();
    const now = Date.now();

    const job: Job = {
      id,
      type: spec.type,
      payload: spec.payload,
      priority: spec.priority ?? DEFAULT_PRIORITY,
      maxRetries: spec.maxRetries ?? DEFAULT_MAX_RETRIES,
      attemptCount: 0,
      name: spec.name,
      description: spec.description,
      createdAt: now,
      updatedAt: now,
      status: JobStatus.PENDING,
      leaseId: null,
      leaseExpireAt: null,
      nextRunAt: now,
    };

    this.jobs.set(id, job);
    return id;
  }

  /**
   * Acquires a lease for a job of the specified types.
   * Lazily reaps expired leases and schedules retries before finding a job.
   * Higher priority jobs are picked first.
   * @param workerId The ID of the worker requesting the lease.
   * @param types The job types the worker can handle.
   * @param leaseDurationMs The duration of the lease in milliseconds.
   * @returns The job acquired, or null if no jobs are available.
   */
  public acquireLease(
    workerId: string,
    types: string[],
    leaseDurationMs: number = DEFAULT_LEASE_DURATION_MS
  ): Job | null {
    this.reapExpiredLeases();
    this.scheduleRetries();

    const now = Date.now();

    // Filter available jobs
    const availableJobs = Array.from(this.jobs.values()).filter((job) => {
      return (
        types.includes(job.type) &&
        job.status === JobStatus.PENDING &&
        job.nextRunAt <= now
      );
    });

    if (availableJobs.length === 0) {
      return null;
    }

    // Sort by priority (descending), then by nextRunAt (ascending)
    availableJobs.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority; // Higher priority first
      }
      return a.nextRunAt - b.nextRunAt; // Older jobs first
    });

    const jobToAcquire = availableJobs[0];
    if (!jobToAcquire) return null;

    // Update job state
    jobToAcquire.status = JobStatus.CLAIMED;
    jobToAcquire.leaseId = workerId;
    jobToAcquire.leaseExpireAt = now + leaseDurationMs;
    jobToAcquire.updatedAt = now;

    return jobToAcquire;
  }

  /**
   * Renews the lease on a currently claimed job.
   * @param jobId The ID of the job.
   * @param workerId The ID of the worker holding the lease.
   * @param leaseDurationMs The new lease duration to add.
   * @returns boolean True if successful, false if the lease could not be renewed.
   */
  public renewLease(
    jobId: string,
    workerId: string,
    leaseDurationMs: number = DEFAULT_LEASE_DURATION_MS
  ): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    if (job.status !== JobStatus.CLAIMED || job.leaseId !== workerId) {
      return false;
    }

    job.leaseExpireAt = Date.now() + leaseDurationMs;
    job.updatedAt = Date.now();
    return true;
  }

  /**
   * Marks a job as completed successfully.
   * @param jobId The ID of the job.
   * @param workerId The ID of the worker completing the job.
   */
  public completeJob(jobId: string, workerId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    if (job.status === JobStatus.CLAIMED && job.leaseId === workerId) {
      job.status = JobStatus.SUCCEEDED;
      job.leaseId = null;
      job.leaseExpireAt = null;
      job.updatedAt = Date.now();
    }
  }

  /**
   * Fails a job, either scheduling it for a retry or moving it to the DLQ.
   * @param jobId The ID of the job.
   * @param workerId The ID of the worker failing the job.
   * @param result The result containing the failure type.
   */
  public failJob(jobId: string, workerId: string, result: JobResult): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    if (job.status !== JobStatus.CLAIMED || job.leaseId !== workerId) {
      return;
    }

    job.leaseId = null;
    job.leaseExpireAt = null;
    job.updatedAt = Date.now();
    job.attemptCount += 1;

    if (
      result.type === JobResultType.PERMANENT_FAILURE ||
      job.attemptCount > job.maxRetries
    ) {
      // Move to DLQ (FAILED state)
      job.status = JobStatus.FAILED;
    } else {
      // Schedule for retry with exponential backoff
      job.status = JobStatus.RETRY_SCHEDULED;
      const backoffDelay = Math.min(
        MAX_BACKOFF_MS,
        BASE_BACKOFF_MS * Math.pow(2, job.attemptCount)
      );
      job.nextRunAt = Date.now() + backoffDelay;
    }
  }

  /**
   * Returns a snapshot of all jobs in the queue.
   */
  public getAllJobs(): Job[] {
    return Array.from(this.jobs.values());
  }

  /**
   * Explicitly run the sweep for expired leases. (Used actively by observability)
   */
  public sweep(): void {
    this.reapExpiredLeases();
    this.scheduleRetries();
  }

  /**
   * Lazily reaps expired leases, returning those jobs to PENDING.
   */
  private reapExpiredLeases(): void {
    const now = Date.now();
    for (const job of this.jobs.values()) {
      if (
        job.status === JobStatus.CLAIMED &&
        job.leaseExpireAt !== null &&
        job.leaseExpireAt <= now
      ) {
        job.status = JobStatus.PENDING;
        job.leaseId = null;
        job.leaseExpireAt = null;
        job.updatedAt = now;
      }
    }
  }

  /**
   * Lazily transitions RETRY_SCHEDULED jobs to PENDING if their nextRunAt has passed.
   */
  private scheduleRetries(): void {
    const now = Date.now();
    for (const job of this.jobs.values()) {
      if (job.status === JobStatus.RETRY_SCHEDULED && job.nextRunAt <= now) {
        job.status = JobStatus.PENDING;
        job.updatedAt = now;
      }
    }
  }
}
