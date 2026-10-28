import "server-only";

import { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "../database/prisma";
import { getServerEnv } from "../env";
import { AppError } from "../http/errors";
import { hmacSha256, sha256 } from "../security/crypto";
import {
  isFreshLineEvent,
  verifyLineSignature,
} from "./line-security";

const lineWebhookEventSchema = z
  .object({
    webhookEventId: z.string().min(1).max(128).optional(),
    type: z.string().min(1).max(64),
    timestamp: z.number().int().positive(),
    source: z
      .object({
        type: z.string().min(1).max(32),
        userId: z.string().min(1).max(256).optional(),
      })
      .passthrough()
      .optional(),
    postback: z
      .object({
        data: z.string().max(2048),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const lineWebhookBodySchema = z
  .object({
    events: z.array(lineWebhookEventSchema).max(50),
  })
  .passthrough();

type LineWebhookEvent = z.infer<typeof lineWebhookEventSchema>;

function linkTokenFromEvent(event: LineWebhookEvent): string | null {
  if (!event.postback?.data) {
    return null;
  }

  const params = new URLSearchParams(event.postback.data);
  const token = params.get("link");
  return token?.trim() || null;
}

async function linkLineCustomer(input: {
  organizationId: string;
  providerId?: string;
  event: LineWebhookEvent;
  now: Date;
}): Promise<"LINKED" | "RECORDED"> {
  const token = linkTokenFromEvent(input.event);
  const providerUserReference = input.event.source?.userId;
  if (!token || !providerUserReference) {
    return "RECORDED";
  }

  const env = getServerEnv();
  return prisma.$transaction(async (transaction) => {
    const linkSession = await transaction.line_link_sessions.findFirst({
      where: {
        organization_id: input.organizationId,
        token_hash: sha256(token),
        status: "ACTIVE",
        expires_at: {
          gt: input.now,
        },
      },
      select: {
        id: true,
        customer_id: true,
      },
    });
    if (!linkSession) {
      return "RECORDED";
    }

    const providerUserHash = hmacSha256(
      env.TOKEN_DERIVATION_SECRET,
      input.providerId ? `line-user:${input.providerId}:${providerUserReference}` :
        `line-user:${providerUserReference}`,
    );
    await transaction.customer_contact_links.upsert({
      where: {
        organization_id_channel_provider_user_hash: {
          organization_id: input.organizationId,
          channel: "LINE",
          provider_user_hash: providerUserHash,
        },
      },
      update: {
        customer_id: linkSession.customer_id,
        provider_user_reference: providerUserReference,
        is_active: true,
        revoked_at: null,
      },
      create: {
        organization_id: input.organizationId,
        customer_id: linkSession.customer_id,
        channel: "LINE",
        provider_user_reference: providerUserReference,
        provider_user_hash: providerUserHash,
      },
    });
    await transaction.line_link_sessions.update({
      where: {
        id: linkSession.id,
      },
      data: {
        status: "CONSUMED",
        consumed_at: input.now,
      },
    });

    return "LINKED";
  });
}

export async function processLineWebhook(input: {
  organizationSlug: string;
  channelId?: string;
  body: string;
  signature: string;
  now?: Date;
}): Promise<{
  accepted: number;
  duplicates: number;
  rejected: number;
}> {
  const env = getServerEnv();
  const integration = await prisma.notification_integrations.findFirst({
    where: {
      channel: "LINE",
      status: "ACTIVE",
      organizations: {
        slug: input.organizationSlug,
        status: {
          in: ["TRIALING", "ACTIVE", "GRACE_PERIOD"],
        },
      },
    },
    select: {
      organization_id: true,
    },
  });

  let channelSecret = env.LINE_CHANNEL_SECRET;
  let providerId: string | undefined;
  if (!input.channelId && integration) {
    const active=await prisma.$queryRaw<{id:string}[]>(Prisma.sql`
      select id from public.mobile_store_entries
      where organization_id=${integration.organization_id}::uuid and is_enabled limit 1
    `);
    if (active.length) throw new AppError("FEATURE_UNAVAILABLE",
      "Store-specific LINE webhook URL required",503);
  }
  if (input.channelId && integration) {
    const rows=await prisma.$queryRaw<{providerId:string}[]>(Prisma.sql`
      select provider_id as "providerId" from public.store_line_channels
      where organization_id=${integration.organization_id}::uuid
        and channel_id=${input.channelId}
        and purpose='MESSAGING' and is_enabled limit 1
    `);
    providerId=rows[0]?.providerId;
    const secrets=z.record(z.string(),z.string()).parse(JSON.parse(
      process.env.LINE_BOOKING_CHANNEL_SECRETS_JSON || "{}") as unknown);
    channelSecret=providerId ? (secrets[input.channelId] ?? "") : "";
  }
  if (
    !integration ||
    env.NOTIFICATION_PROVIDER !== "line" ||
    !channelSecret ||
    (!input.channelId && !env.LINE_CHANNEL_ACCESS_TOKEN)
  ) {
    throw new AppError(
      "FEATURE_UNAVAILABLE",
      "LINE 通知整合尚未啟用。",
      503,
    );
  }

  if (
    !verifyLineSignature({
      body: input.body,
      secret: channelSecret,
      signature: input.signature,
    })
  ) {
    throw new AppError("FORBIDDEN", "LINE webhook 簽章無效。", 403);
  }

  const payload = lineWebhookBodySchema.parse(JSON.parse(input.body));
  const now = input.now ?? new Date();
  let accepted = 0;
  let duplicates = 0;
  let rejected = 0;

  for (const event of payload.events) {
    const eventHash = sha256(
      `${integration.organization_id}:${input.channelId ?? "legacy"}:${
        event.webhookEventId ?? JSON.stringify(event)
      }`,
    );
    const fresh = isFreshLineEvent(event.timestamp, now);

    try {
      const created = await prisma.line_webhook_events.create({
        data: {
          event_hash: eventHash,
          organization_id: integration.organization_id,
          event_type: event.type,
          event_timestamp: new Date(event.timestamp),
          signature_verified: true,
          processed_at: fresh ? null : now,
          outcome: fresh ? "ACCEPTED" : "REJECTED",
          error_code: fresh ? null : "STALE_EVENT",
        },
        select: {
          id: true,
        },
      });

      if (!fresh) {
        rejected += 1;
        continue;
      }

      const outcome = await linkLineCustomer({
        organizationId: integration.organization_id,
        providerId,
        event,
        now,
      });
      await prisma.line_webhook_events.update({
        where: {
          id: created.id,
        },
        data: {
          processed_at: now,
          outcome,
        },
      });
      accepted += 1;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        duplicates += 1;
        continue;
      }
      throw error;
    }
  }

  return {
    accepted,
    duplicates,
    rejected,
  };
}
