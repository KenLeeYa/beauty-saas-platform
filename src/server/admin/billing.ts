import "server-only";

import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";

import type { ApplicationSession } from "../auth/session";
import { prisma } from "../database/prisma";
import { AppError } from "../http/errors";
import type { AdminBillingActionInput } from "./billing-schemas";

export type AdminBillingData = {
  organizations: Array<{
    id: string;
    name: string;
    slug: string;
    status: string;
    subscriptionId: string | null;
    subscriptionStatus: string | null;
    planName: string | null;
    periodEnd: string | null;
  }>;
  invoices: Array<{
    id: string;
    number: string;
    organizationName: string;
    status: string;
    totalMinor: number;
    amountPaidMinor: number;
    currency: string;
    periodStart: string;
    periodEnd: string;
    dueAt: string | null;
    createdAt: string;
  }>;
};

export type AdminPlansData = {
  plans: Array<{
    id: string;
    code: string;
    name: string;
    active: boolean;
    versions: Array<{
      id: string;
      version: number;
      monthlyPriceMinor: number;
      currency: string;
      trialDays: number;
      enabledFeatures: number;
      totalFeatures: number;
    }>;
  }>;
};

function requirePlatformAdmin(session: ApplicationSession): void {
  if (session.platformRole !== "PLATFORM_ADMIN") {
    throw new AppError("NOT_FOUND", "找不到指定頁面。", 404);
  }
}

export async function getAdminBillingData(
  session: ApplicationSession,
): Promise<AdminBillingData> {
  requirePlatformAdmin(session);
  const [organizations, invoices] = await Promise.all([
    prisma.organizations.findMany({
      orderBy: {
        created_at: "desc",
      },
      take: 100,
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        subscriptions: {
          where: {
            is_current: true,
          },
          take: 1,
          select: {
            id: true,
            status: true,
            billing_period_end: true,
            plan_versions: {
              select: {
                plans: {
                  select: {
                    display_name: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.invoices.findMany({
      orderBy: {
        created_at: "desc",
      },
      take: 200,
      select: {
        id: true,
        invoice_number: true,
        status: true,
        total_minor: true,
        amount_paid_minor: true,
        currency: true,
        period_start: true,
        period_end: true,
        due_at: true,
        created_at: true,
        organizations: {
          select: {
            name: true,
          },
        },
      },
    }),
  ]);

  return {
    organizations: organizations.map((organization) => {
      const subscription = organization.subscriptions[0];
      return {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        status: organization.status,
        subscriptionId: subscription?.id ?? null,
        subscriptionStatus: subscription?.status ?? null,
        planName:
          subscription?.plan_versions.plans.display_name ?? null,
        periodEnd:
          subscription?.billing_period_end.toISOString() ?? null,
      };
    }),
    invoices: invoices.map((invoice) => ({
      id: invoice.id,
      number: invoice.invoice_number,
      organizationName: invoice.organizations.name,
      status: invoice.status,
      totalMinor: invoice.total_minor,
      amountPaidMinor: invoice.amount_paid_minor,
      currency: invoice.currency,
      periodStart: invoice.period_start.toISOString(),
      periodEnd: invoice.period_end.toISOString(),
      dueAt: invoice.due_at?.toISOString() ?? null,
      createdAt: invoice.created_at.toISOString(),
    })),
  };
}

export async function getAdminPlansData(
  session: ApplicationSession,
): Promise<AdminPlansData> {
  requirePlatformAdmin(session);
  const plans = await prisma.plans.findMany({
    orderBy: {
      created_at: "asc",
    },
    select: {
      id: true,
      code: true,
      display_name: true,
      is_active: true,
      plan_versions: {
        orderBy: {
          version: "desc",
        },
        select: {
          id: true,
          version: true,
          monthly_price_minor: true,
          currency: true,
          trial_days: true,
          plan_entitlements: {
            select: {
              is_enabled: true,
            },
          },
        },
      },
    },
  });
  return {
    plans: plans.map((plan) => ({
      id: plan.id,
      code: plan.code,
      name: plan.display_name,
      active: plan.is_active,
      versions: plan.plan_versions.map((version) => ({
        id: version.id,
        version: version.version,
        monthlyPriceMinor: version.monthly_price_minor,
        currency: version.currency,
        trialDays: version.trial_days,
        enabledFeatures: version.plan_entitlements.filter(
          (entitlement) => entitlement.is_enabled,
        ).length,
        totalFeatures: version.plan_entitlements.length,
      })),
    })),
  };
}

function dateValue(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export async function runAdminBillingAction(input: {
  session: ApplicationSession;
  payload: AdminBillingActionInput;
  requestId: string;
}): Promise<{ success: true; id: string }> {
  requirePlatformAdmin(input.session);
  const now = new Date();

  return prisma.$transaction(
    async (transaction) => {
      if (input.payload.action === "ISSUE_INVOICE") {
        await transaction.$queryRaw(
          Prisma.sql`
            select id
            from public.organizations
            where id = ${input.payload.organizationId}::uuid
            for update
          `,
        );
        const subscription = await transaction.subscriptions.findFirst({
          where: {
            organization_id: input.payload.organizationId,
            is_current: true,
          },
          select: {
            id: true,
          },
        });
        if (!subscription) {
          throw new AppError(
            "CONFLICT",
            "商家目前沒有有效的訂閱合約。",
            409,
          );
        }
        const totalMinor =
          input.payload.subtotalMinor + input.payload.taxMinor;
        const invoiceNumber = `BL-${now
          .toISOString()
          .slice(0, 7)
          .replace("-", "")}-${randomUUID().slice(0, 8).toUpperCase()}`;
        const invoice = await transaction.invoices.create({
          data: {
            organization_id: input.payload.organizationId,
            subscription_id: subscription.id,
            invoice_number: invoiceNumber,
            status: "ISSUED",
            currency: "TWD",
            period_start: dateValue(input.payload.periodStart),
            period_end: dateValue(input.payload.periodEnd),
            subtotal_minor: input.payload.subtotalMinor,
            tax_minor: input.payload.taxMinor,
            total_minor: totalMinor,
            issued_at: now,
            due_at: new Date(input.payload.dueAt),
          },
          select: {
            id: true,
          },
        });
        await transaction.invoice_line_items.create({
          data: {
            organization_id: input.payload.organizationId,
            invoice_id: invoice.id,
            item_type: "SUBSCRIPTION",
            description: input.payload.description,
            quantity: 1,
            unit_price_minor: input.payload.subtotalMinor,
            amount_minor: input.payload.subtotalMinor,
          },
        });
        await transaction.billing_notifications.create({
          data: {
            organization_id: input.payload.organizationId,
            notification_type: "INVOICE_ISSUED",
            level: "INFO",
            title: `帳單 ${invoiceNumber} 已開立`,
            message: `應付金額 NT$${Math.round(
              totalMinor / 100,
            ).toLocaleString("zh-TW")}。`,
            expires_at: new Date(input.payload.dueAt),
          },
        });
        await transaction.audit_logs.create({
          data: {
            organization_id: input.payload.organizationId,
            actor_profile_id: input.session.profileId,
            action: "SAAS_INVOICE_ISSUE",
            target_type: "INVOICE",
            target_id: invoice.id,
            outcome: "SUCCESS",
            request_id: input.requestId,
            after_json: {
              invoiceNumber,
              totalMinor,
            },
          },
        });
        return { success: true as const, id: invoice.id };
      }

      if (input.payload.action === "CONFIRM_PAYMENT") {
        await transaction.$queryRaw(
          Prisma.sql`
            select id
            from public.invoices
            where id = ${input.payload.invoiceId}::uuid
            for update
          `,
        );
        const invoice = await transaction.invoices.findUnique({
          where: {
            id: input.payload.invoiceId,
          },
          select: {
            id: true,
            organization_id: true,
            subscription_id: true,
            status: true,
            total_minor: true,
            amount_paid_minor: true,
            currency: true,
          },
        });
        if (
          !invoice ||
          !["ISSUED", "OVERDUE"].includes(invoice.status)
        ) {
          throw new AppError(
            "CONFLICT",
            "此帳單目前無法確認付款。",
            409,
          );
        }
        const outstanding =
          invoice.total_minor - invoice.amount_paid_minor;
        if (input.payload.amountMinor > outstanding) {
          throw new AppError(
            "BAD_REQUEST",
            "付款金額不可超過帳單未付金額。",
            400,
          );
        }
        const amountPaid =
          invoice.amount_paid_minor + input.payload.amountMinor;
        const paidInFull = amountPaid === invoice.total_minor;
        const payment = await transaction.manual_payment_records.create({
          data: {
            organization_id: invoice.organization_id,
            invoice_id: invoice.id,
            status: "CONFIRMED",
            amount_minor: input.payload.amountMinor,
            currency: invoice.currency,
            reference: input.payload.reference,
            note: input.payload.note || null,
            recorded_by: input.session.profileId,
            confirmed_by: input.session.profileId,
            confirmed_at: now,
          },
          select: {
            id: true,
          },
        });
        await transaction.invoices.update({
          where: {
            id: invoice.id,
          },
          data: {
            amount_paid_minor: amountPaid,
            ...(paidInFull
              ? {
                  status: "PAID",
                  paid_at: now,
                }
              : {}),
          },
        });
        if (paidInFull) {
          await transaction.subscriptions.update({
            where: {
              id: invoice.subscription_id,
            },
            data: {
              status: "ACTIVE",
              suspended_at: null,
            },
          });
          await transaction.organizations.update({
            where: {
              id: invoice.organization_id,
            },
            data: {
              status: "ACTIVE",
              disabled_at: null,
            },
          });
        }
        await transaction.audit_logs.create({
          data: {
            organization_id: invoice.organization_id,
            actor_profile_id: input.session.profileId,
            action: "SAAS_MANUAL_PAYMENT_CONFIRM",
            target_type: "MANUAL_PAYMENT",
            target_id: payment.id,
            outcome: "SUCCESS",
            request_id: input.requestId,
            after_json: {
              invoiceId: invoice.id,
              amountMinor: input.payload.amountMinor,
              paidInFull,
            },
          },
        });
        return { success: true as const, id: payment.id };
      }

      await transaction.$queryRaw(
        Prisma.sql`
          select id
          from public.organizations
          where id = ${input.payload.organizationId}::uuid
          for update
        `,
      );
      const organization = await transaction.organizations.findUnique({
        where: {
          id: input.payload.organizationId,
        },
        select: {
          id: true,
          merchant_setup_progress: {
            select: {
              go_live_at: true,
            },
          },
          subscriptions: {
            where: {
              is_current: true,
            },
            take: 1,
            select: {
              id: true,
            },
          },
        },
      });
      const subscription = organization?.subscriptions[0];
      if (!organization || !subscription) {
        throw new AppError(
          "NOT_FOUND",
          "找不到商家訂閱資料。",
          404,
        );
      }
      const suspend = input.payload.action === "SUSPEND";
      await transaction.subscriptions.update({
        where: {
          id: subscription.id,
        },
        data: suspend
          ? {
              status: "SUSPENDED",
              suspended_at: now,
            }
          : {
              status: "ACTIVE",
              suspended_at: null,
            },
      });
      await transaction.organizations.update({
        where: {
          id: organization.id,
        },
        data: suspend
          ? {
              status: "SUSPENDED",
              public_profile_enabled: false,
              disabled_at: now,
            }
          : {
              status: "ACTIVE",
              public_profile_enabled: Boolean(
                organization.merchant_setup_progress?.go_live_at,
              ),
              disabled_at: null,
            },
      });
      await transaction.locations.updateMany({
        where: {
          organization_id: organization.id,
          is_active: true,
        },
        data: suspend
          ? {
              booking_state: "PAUSED",
              online_booking_enabled: false,
            }
          : {
              booking_state: organization.merchant_setup_progress?.go_live_at
                ? "OPEN"
                : "CLOSED",
              online_booking_enabled: Boolean(
                organization.merchant_setup_progress?.go_live_at,
              ),
            },
      });
      await transaction.billing_notifications.create({
        data: {
          organization_id: organization.id,
          notification_type: suspend
            ? "SUBSCRIPTION_SUSPENDED"
            : "SUBSCRIPTION_REACTIVATED",
          level: suspend ? "WARNING" : "INFO",
          title: suspend ? "訂閱已暫停" : "訂閱已恢復",
          message: input.payload.reason,
        },
      });
      await transaction.audit_logs.create({
        data: {
          organization_id: organization.id,
          actor_profile_id: input.session.profileId,
          action: suspend
            ? "SUBSCRIPTION_SUSPEND"
            : "SUBSCRIPTION_REACTIVATE",
          target_type: "SUBSCRIPTION",
          target_id: subscription.id,
          outcome: "SUCCESS",
          request_id: input.requestId,
          after_json: {
            reason: input.payload.reason,
            status: suspend ? "SUSPENDED" : "ACTIVE",
          },
        },
      });
      return { success: true as const, id: subscription.id };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5_000,
      timeout: 15_000,
    },
  );
}
