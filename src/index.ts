import express from 'express';
import type { Request, Response } from 'express';
import { JobQueue } from './core/JobQueue.js';
import { Worker } from './core/Worker.js';
import type { JobHandler } from './core/JobHandler.js';
import { JobResultType } from './models/types.js';
import { createObservabilityRouter } from './api/ObservabilityMiddleware.js';

const app = express();
app.use(express.json());

// Initialize the central Job Queue
const queue = new JobQueue();

// Define a dummy handler to simulate actual work
class DummyHandler implements JobHandler {
  async run(payload: any) {
    console.log(`[JobHandler] Executing job with payload:`, payload);
    
    // Simulate some work taking 1 second
    await new Promise((resolve) => setTimeout(resolve, 1000));
    
    // Read the payload to optionally simulate failures
    if (payload.fail === 'transient') {
      console.log(`[JobHandler] Simulating transient failure`);
      return { type: JobResultType.TRANSIENT_FAILURE, error: 'Simulated transient failure' };
    }
    if (payload.fail === 'permanent') {
      console.log(`[JobHandler] Simulating permanent failure`);
      return { type: JobResultType.PERMANENT_FAILURE, error: 'Simulated permanent failure' };
    }
    
    console.log(`[JobHandler] Job completed successfully`);
    return { type: JobResultType.SUCCESS };
  }
}

// Initialize Workers
const worker1 = new Worker(queue, 'worker-1');
worker1.registerHandler('send_email', new DummyHandler());
worker1.registerHandler('resize_image', new DummyHandler());
worker1.start(); // Starts the polling loop

const worker2 = new Worker(queue, 'worker-2');
worker2.registerHandler('send_email', new DummyHandler());
worker2.start();

const workers = [worker1, worker2];

// Mount Observability API
app.use('/jobs/obs', createObservabilityRouter(queue, workers));

// Expose Job Submission API
app.post('/jobs/submit', (req: Request, res: Response) => {
  const spec = req.body;
  if (!spec || !spec.type || !spec.payload) {
    res.status(400).json({ error: 'Missing type or payload' });
    return;
  }

  const id = queue.submit({
    type: spec.type,
    payload: spec.payload,
    priority: spec.priority,
    maxRetries: spec.maxRetries,
    name: spec.name,
    description: spec.description,
    delayInMs: spec.delayInMs,
  });

  res.status(201).json({ id, message: 'Job submitted successfully' });
});

app.post('/jobs/cancel', (req: Request, res: Response) => {
  const { jobId } = req.body;
  if (!jobId) {
    res.status(400).json({ error: 'Missing job ID' });
    return;
  }
  const message = queue.cancelJob(jobId);
  res.status(200).json({ message });
})

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Job Service running on port ${PORT}`);
  console.log(`Submit jobs at POST http://localhost:${PORT}/jobs/submit`);
  console.log(`Observability at GET http://localhost:${PORT}/jobs/obs/queue`);
});
