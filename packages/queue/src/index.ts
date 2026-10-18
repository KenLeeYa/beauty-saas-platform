export type JobStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";

export type JobType =
  | "SEND_INVITATION_EMAIL"
  | "GENERATE_REPORT"
  | "EXPORT_TENANT_DATA"
  | "CLEAN_EXPIRED_SESSIONS"
  | "PROCESS_STORAGE_CLEANUP";

export type JobOptions = {
  runAt?: Date;
  priority?: number;
  maxAttempts?: number;
};

export type BackgroundJob<TPayload = unknown> = {
  id: string;
  tenantId: string;
  jobType: JobType;
  payload: TPayload;
  status: JobStatus;
  priority: number;
  runAt: Date;
  attempts: number;
  maxAttempts: number;
};

export interface JobQueue {
  enqueue<TPayload>(name: JobType, tenantId: string, payload: TPayload, options?: JobOptions): Promise<string>;
}
