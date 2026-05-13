1. First, Prepare the design with the help of AI. Verify LLD for given requirements.
   a. Core Function Requirement:
   Problem Statement: Build an in-process Background Job Service. Producers submit jobs; workers pull jobs and execute them. The service guarantees at-least-once execution, retries failed jobs with backoff, surfaces stuck jobs, and exposes observability into queue health.
   Think of it as a minimal Sidekiq / Celery / SQS-with-workers, all in one process for the purpose of this exercise.
   Context:
   Language: TypeScript / Node.js
   Scope: Single-process HTTP middleware (Express)
   No external dependencies (no Redis, no DB)
   functional requirement: 1. Submit a job - submit(job_spec) -> job_id. The spec contains: - type (string) - which kind of work this is (e.g., "send_email", "resize_image") - payload (object) - opaque data passed to the handler - priority (int 0-9, higher executes earlier; default 5) - max_retries (int, default 3) 2. Worker model - workers register with a list of types they can handle. They pull jobs by acquiring a lease (visibility timeout). While a job is leased, no other worker can pick it up. Workers must renew the lease for long-running jobs; if the lease expires without renewal (worker crash, network partition, slow handler), the job becomes available to another worker. 3. Job lifecycle - implement the state machine:
   pending -> claimed -> succeeded
   -> failed (retries exhausted, moved to DLQ)
   -> retry_scheduled -> pending (after backoff)
   Lease expiry on claimed jobs returns them to pending. 4. Retry policy - failed jobs are re-queued with exponential backoff (you choose the formula, defend it). After max_retries exhausted, the job moves to a Dead Letter Queue (DLQ). 5. Job execution - the candidate provides a JobHandler interface. Workers invoke handler.run(payload) -> Result where Result is Success | TransientFailure | PermanentFailure. PermanentFailure skips retries and goes straight to DLQ. 6. Observability API - methods to query: - Pending count by type and by priority - Currently leased (in-flight) count - DLQ size, with ability to list DLQ entries - Per-worker stats: current lease, success/failure counts. 7. Tests - cover at-least-once on worker crash (lease expiry), retry behavior with backoff, lease renewal happy path, priority ordering, DLQ on max retries, permanent-failure short-circuit.
   LLD Direction: Use in-memory DS to create/store data model for above requirement. The Job data model must have below fields: Type(use enums), paylod: it should be json/object based field, priority, max_retries, name, description, createdAT, updatedAT, status: use enums for this,leasId, leaseExpireAT. for retries policy, use constants for defining exponential backoff delays.
   Number of workers can be dynamic

2. Document the code with proper comments and doc strings.
3. Implement LLD module wise, and commit the changes in git
4. Verify all the changes using PR reviews.
5. Try to run the code in local environment and verify it works as expected.
6. Add Observability API.
7. Add Unit test cases and test.
