import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { JobQueue } from '../core/JobQueue.js';
import type { Worker } from '../core/Worker.js';
import { JobStatus } from '../models/types.js';

/**
 * Creates an Express Router providing observability endpoints for the JobQueue.
 * @param queue The JobQueue instance to monitor.
 * @param workers An array of Worker instances to monitor.
 * @returns An Express Router object.
 */
export function createObservabilityRouter(queue: JobQueue, workers: Worker[]): Router {
  const router = Router();

  // Middleware to explicitly sweep for accurate metrics before returning responses
  const sweepBeforeMetrics = (req: Request, res: Response, next: NextFunction) => {
    queue.sweep();
    next();
  };

  router.use(sweepBeforeMetrics);

  /**
   * GET /queue
   * Returns overall queue metrics: pending counts by type/priority, and inflight counts.
   */
  router.get('/queue', (req: Request, res: Response) => {
    const jobs = queue.getAllJobs();

    const pendingByType: Record<string, number> = {};
    const pendingByPriority: Record<number, number> = {};
    let inflightCount = 0;

    const now = Date.now();

    for (const job of jobs) {
      // Consider RETRY_SCHEDULED as pending if it's eligible to run
      const isPending =
        job.status === JobStatus.PENDING ||
        (job.status === JobStatus.RETRY_SCHEDULED && job.nextRunAt <= now);

      if (isPending) {
        pendingByType[job.type] = (pendingByType[job.type] || 0) + 1;
        pendingByPriority[job.priority] = (pendingByPriority[job.priority] || 0) + 1;
      } else if (job.status === JobStatus.CLAIMED) {
        inflightCount++;
      }
    }

    res.json({
      pendingByType,
      pendingByPriority,
      inflightCount,
      totalJobs: jobs.length,
    });
  });

  /**
   * GET /dlq
   * Returns the size of the DLQ (Dead Letter Queue).
   */
  router.get('/dlq', (req: Request, res: Response) => {
    const jobs = queue.getAllJobs();
    const dlqJobs = jobs.filter((j) => j.status === JobStatus.FAILED);

    res.json({
      dlqSize: dlqJobs.length,
    });
  });

  /**
   * GET /dlq/entries
   * Returns the actual entries in the DLQ.
   */
  router.get('/dlq/entries', (req: Request, res: Response) => {
    const jobs = queue.getAllJobs();
    const dlqJobs = jobs.filter((j) => j.status === JobStatus.FAILED);

    res.json({
      entries: dlqJobs,
    });
  });

  /**
   * GET /workers
   * Returns statistics for all registered workers.
   */
  router.get('/workers', (req: Request, res: Response) => {
    const workerStats = workers.map((w) => w.getStats());

    res.json({
      workers: workerStats,
    });
  });

  return router;
}
