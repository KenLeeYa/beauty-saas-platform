import "server-only";

import type { Prisma } from "@prisma/client";

import {
  assertCapability,
  type OrganizationContext,
} from "../../../server/authorization/context";
import { hasCapability } from "../../../server/authorization/capabilities";
import { prisma } from "../../../server/database/prisma";
import { requireEntitlement } from "../../../server/entitlements/service";
import { AppError } from "../../../server/http/errors";

async function assertCustomerBelongsToOrganization(
  transaction: Prisma.TransactionClient,
  context: OrganizationContext,
  customerId: string,
): Promise<void> {
  const customer = await transaction.customers.findFirst({
    where: {
      id: customerId,
      organization_id: context.organization.id,
      is_active: true,
    },
    select: { id: true },
  });
  if (!customer) {
    throw new AppError("NOT_FOUND", "找不到顧客。", 404);
  }
}

async function recordCrmAudit(
  transaction: Prisma.TransactionClient,
  input: {
    context: OrganizationContext;
    action: string;
    targetType: string;
    targetId: string;
    requestId: string;
    after: Prisma.InputJsonValue;
  },
): Promise<void> {
  await transaction.audit_logs.create({
    data: {
      organization_id: input.context.organization.id,
      location_id: input.context.location?.id,
      actor_profile_id: input.context.session.profileId,
      action: input.action,
      target_type: input.targetType,
      target_id: input.targetId,
      outcome: "SUCCESS",
      request_id: input.requestId,
      after_json: input.after,
    },
  });
}

async function assertCrmWriteAccess(context: OrganizationContext): Promise<void> {
  assertCapability(context, "customer.manage");
  await requireEntitlement(context.organization.id, "CUSTOMER_CRM");
}

export async function createCustomerTag(input: {
  context: OrganizationContext;
  name: string;
  color: string;
  requestId: string;
}): Promise<{ id: string; name: string; color: string }> {
  await assertCrmWriteAccess(input.context);

  return prisma.$transaction(async (transaction) => {
    const duplicate = await transaction.customer_tags.findFirst({
      where: {
        organization_id: input.context.organization.id,
        name: input.name,
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new AppError("CONFLICT", "已有相同名稱的顧客標籤。", 409);
    }

    const tag = await transaction.customer_tags.create({
      data: {
        organization_id: input.context.organization.id,
        name: input.name,
        color: input.color,
      },
      select: {
        id: true,
        name: true,
        color: true,
      },
    });
    await recordCrmAudit(transaction, {
      context: input.context,
      action: "CUSTOMER_TAG_CREATE",
      targetType: "CUSTOMER_TAG",
      targetId: tag.id,
      requestId: input.requestId,
      after: {
        name: tag.name,
        color: tag.color,
      },
    });

    return {
      id: tag.id,
      name: tag.name,
      color: tag.color ?? input.color,
    };
  });
}

export async function setCustomerTagAssignment(input: {
  context: OrganizationContext;
  customerId: string;
  tagId: string;
  assigned: boolean;
  requestId: string;
}): Promise<{ success: true }> {
  await assertCrmWriteAccess(input.context);

  await prisma.$transaction(async (transaction) => {
    await assertCustomerBelongsToOrganization(
      transaction,
      input.context,
      input.customerId,
    );
    const tag = await transaction.customer_tags.findFirst({
      where: {
        id: input.tagId,
        organization_id: input.context.organization.id,
      },
      select: { id: true },
    });
    if (!tag) {
      throw new AppError("NOT_FOUND", "找不到顧客標籤。", 404);
    }

    if (input.assigned) {
      await transaction.customer_tag_assignments.createMany({
        data: [
          {
            organization_id: input.context.organization.id,
            customer_id: input.customerId,
            tag_id: input.tagId,
            assigned_by: input.context.session.profileId,
          },
        ],
        skipDuplicates: true,
      });
    } else {
      await transaction.customer_tag_assignments.deleteMany({
        where: {
          organization_id: input.context.organization.id,
          customer_id: input.customerId,
          tag_id: input.tagId,
        },
      });
    }

    await recordCrmAudit(transaction, {
      context: input.context,
      action: input.assigned
        ? "CUSTOMER_TAG_ASSIGN"
        : "CUSTOMER_TAG_UNASSIGN",
      targetType: "CUSTOMER",
      targetId: input.customerId,
      requestId: input.requestId,
      after: {
        tagId: input.tagId,
        assigned: input.assigned,
      },
    });
  });

  return { success: true };
}

export async function createCustomerNote(input: {
  context: OrganizationContext;
  customerId: string;
  note: string;
  sensitivity: "STANDARD" | "SENSITIVE";
  requestId: string;
}): Promise<{
  id: string;
  note: string;
  sensitivity: "STANDARD" | "SENSITIVE";
  createdAt: string;
  authorName: string;
}> {
  await assertCrmWriteAccess(input.context);
  if (
    input.sensitivity === "SENSITIVE" &&
    !hasCapability(input.context.roles, "customer.sensitive.read")
  ) {
    throw new AppError("FORBIDDEN", "你的角色無法建立敏感備註。", 403);
  }

  return prisma.$transaction(async (transaction) => {
    await assertCustomerBelongsToOrganization(
      transaction,
      input.context,
      input.customerId,
    );
    const note = await transaction.customer_notes.create({
      data: {
        organization_id: input.context.organization.id,
        customer_id: input.customerId,
        note: input.note,
        sensitivity: input.sensitivity,
        created_by: input.context.session.profileId,
      },
      select: {
        id: true,
        created_at: true,
      },
    });
    await recordCrmAudit(transaction, {
      context: input.context,
      action: "CUSTOMER_NOTE_CREATE",
      targetType: "CUSTOMER_NOTE",
      targetId: note.id,
      requestId: input.requestId,
      after: {
        customerId: input.customerId,
        sensitivity: input.sensitivity,
        noteLength: input.note.length,
      },
    });

    return {
      id: note.id,
      note: input.note,
      sensitivity: input.sensitivity,
      createdAt: note.created_at.toISOString(),
      authorName: input.context.session.displayName,
    };
  });
}
