import { randomUUID } from 'node:crypto';
import type { JobQueue } from './JobQueue.js';
import type { JobHandler } from './JobHandler.js';
import { JobResultType } from '../models/types.js';
import { DEFAULT_LEASE_DURATION_MS } from '../utils/constants.js';

export interface WorkerStats {
  id: string;
  types: string[];
  jobsProcessed: number;
  jobsSucceeded: number;
  jobsFailed: number;
  isPolling: boolean;
  currentJobId: string | null;
}

/**
 * Worker class that continuously polls the JobQueue, executes jobs via JobHandlers,
 * and maintains lease renewals during long-running execution.
 */
export class Worker {
  public readonly id: string;
  private queue: JobQueue;
  private handlers: Map<string, JobHandler> = new Map();
  private isPolling: boolean = false;
  private pollingIntervalId: NodeJS.Timeout | null = null;
  private currentJobId: string | null = null;

  // Stats
  private jobsProcessed: number = 0;
  private jobsSucceeded: number = 0;
  private jobsFailed: number = 0;

  constructor(queue: JobQueue, id?: string) {
    this.queue = queue;
    this.id = id ?? randomUUID();
  }

  /**
   * Registers a handler for a specific job type.
   * @param type The type of job this handler processes.
   * @param handler The implementation of the handler.
   */
  public registerHandler(type: string, handler: JobHandler): void {
    this.handlers.set(type, handler);
  }

  /**
   * Starts the worker polling mechanism.
   * @param pollIntervalMs How frequently to check for jobs if queue was empty.
   */
  public start(pollIntervalMs: number = 1000): void {
    if (this.isPolling) return;
    this.isPolling = true;

    const poll = async () => {
      if (!this.isPolling) return;

      const types = Array.from(this.handlers.keys());
      if (types.length === 0) {
        // No handlers, wait before polling again
        this.pollingIntervalId = setTimeout(poll, pollIntervalMs);
        return;
      }

      const job = this.queue.acquireLease(this.id, types);

      if (job) {
        this.currentJobId = job.id;
        const handler = this.handlers.get(job.type);

        if (!handler) {
          // Should not happen since we only acquire known types
          this.queue.failJob(job.id, this.id, {
            type: JobResultType.PERMANENT_FAILURE,
            error: `No handler found for type: ${job.type}`,
          });
          this.currentJobId = null;
          // Immediately poll again
          setImmediate(poll);
          return;
        }

        // Start lease renewal loop
        const renewIntervalMs = Math.floor(DEFAULT_LEASE_DURATION_MS / 2);
        const renewTimer = setInterval(() => {
          this.queue.renewLease(job.id, this.id);
        }, renewIntervalMs);

        try {
          const result = await handler.run(job.payload);
          
          this.jobsProcessed++;
          
          if (result.type === JobResultType.SUCCESS) {
            this.jobsSucceeded++;
            this.queue.completeJob(job.id, this.id);
          } else {
            this.jobsFailed++;
            this.queue.failJob(job.id, this.id, result);
          }
        } catch (error) {
          this.jobsProcessed++;
          this.jobsFailed++;
          // Uncaught exceptions are treated as transient failures to allow retries,
          // unless you'd prefer them to be permanent.
          this.queue.failJob(job.id, this.id, {
            type: JobResultType.TRANSIENT_FAILURE,
            error: error instanceof Error ? error.message : String(error),
          });
        } finally {
          clearInterval(renewTimer);
          this.currentJobId = null;
          // Immediately poll for the next job
          setImmediate(poll);
        }
      } else {
        // Queue empty or no eligible jobs, wait before next poll
        this.pollingIntervalId = setTimeout(poll, pollIntervalMs);
      }
    };

    // Start the loop
    setImmediate(poll);
  }

  /**
   * Stops the worker from picking up new jobs.
   */
  public stop(): void {
    this.isPolling = false;
    if (this.pollingIntervalId) {
      clearTimeout(this.pollingIntervalId);
      this.pollingIntervalId = null;
    }
  }

  /**
   * Retrieves the current statistics of this worker.
   */
  public getStats(): WorkerStats {
    return {
      id: this.id,
      types: Array.from(this.handlers.keys()),
      jobsProcessed: this.jobsProcessed,
      jobsSucceeded: this.jobsSucceeded,
      jobsFailed: this.jobsFailed,
      isPolling: this.isPolling,
      currentJobId: this.currentJobId,
    };
  }
}
