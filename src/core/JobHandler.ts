import type { JobPayload, JobResult } from '../models/types.js';

/**
 * Interface that all job handlers must implement.
 */
export interface JobHandler {
  /**
   * Executes the background job.
   * @param payload The data associated with the job.
   * @returns A promise that resolves to the result of the job execution.
   */
  run(payload: JobPayload): Promise<JobResult>;
}
