import "server-only";

import type { Prisma } from "@prisma/client";

import { prisma } from "./database/prisma";

export type AuditInput = {
  organizationId?: string;
  locationId?: string;
  actorProfileId?: string;
  action: string;
  targetType: string;
  targetId?: string;
  outcome: "SUCCESS" | "DENIED" | "FAILURE";
  requestId: string;
  ipHash?: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
};

export async function recordAudit(input: AuditInput): Promise<void> {
  await prisma.audit_logs.create({
    data: {
      organization_id: input.organizationId,
      location_id: input.locationId,
      actor_profile_id: input.actorProfileId,
      action: input.action,
      target_type: input.targetType,
      target_id: input.targetId,
      outcome: input.outcome,
      request_id: input.requestId,
      ip_hash: input.ipHash,
      before_json: input.before,
      after_json: input.after,
      metadata: input.metadata ?? {},
    },
  });
}
