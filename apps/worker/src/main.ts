import type { BackgroundJob } from "@beauty-saas/queue";

export async function processJob(job: BackgroundJob): Promise<void> {
  console.log(`Processing job ${job.id} (${job.jobType}) for tenant ${job.tenantId}`);
}
