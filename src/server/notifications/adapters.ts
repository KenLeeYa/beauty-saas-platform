import "server-only";

import { Prisma, type notification_channel } from "@prisma/client";
import { z } from "zod";

import { getServerEnv } from "../env";
import { prisma } from "../database/prisma";
import { getStoreLineMessagingChannel } from "./line-channel-registry";

export type NotificationMessage = {
  recipient: string;
  subject: string;
  text: string;
  html: string;
};

export type NotificationSendResult = {
  providerMessageId: string;
};

export interface NotificationAdapter {
  readonly channel: notification_channel;
  readonly configured: boolean;
  readonly unavailableCode: string | null;
  send(message: NotificationMessage): Promise<NotificationSendResult>;
}

const resendResponseSchema = z.object({
  id: z.string().min(1),
});

const lineResponseSchema = z.object({
  sentMessages: z
    .array(
      z.object({
        id: z.string().min(1),
      }),
    )
    .min(1),
});

class DisabledNotificationAdapter implements NotificationAdapter {
  readonly configured = false;

  constructor(
    readonly channel: notification_channel,
    readonly unavailableCode: string,
  ) {}

  async send(): Promise<NotificationSendResult> {
    throw new Error(this.unavailableCode);
  }
}

class ResendEmailAdapter implements NotificationAdapter {
  readonly channel = "EMAIL" as const;
  readonly configured: boolean;
  readonly unavailableCode: string | null;

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {
    this.configured = Boolean(apiKey && from);
    this.unavailableCode = this.configured
      ? null
      : "EMAIL_PROVIDER_NOT_CONFIGURED";
  }

  async send(
    message: NotificationMessage,
  ): Promise<NotificationSendResult> {
    if (!this.configured) {
      throw new Error("EMAIL_PROVIDER_NOT_CONFIGURED");
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.recipient],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`EMAIL_PROVIDER_HTTP_${response.status}`);
    }

    const parsed = resendResponseSchema.parse(await response.json());
    return {
      providerMessageId: parsed.id,
    };
  }
}

class LineNotificationAdapter implements NotificationAdapter {
  readonly channel = "LINE" as const;
  readonly configured: boolean;
  readonly unavailableCode: string | null;

  constructor(private readonly accessToken: string) {
    this.configured = Boolean(accessToken);
    this.unavailableCode = this.configured
      ? null
      : "LINE_PROVIDER_NOT_CONFIGURED";
  }

  async send(
    message: NotificationMessage,
  ): Promise<NotificationSendResult> {
    if (!this.configured) {
      throw new Error("LINE_PROVIDER_NOT_CONFIGURED");
    }

    const response = await fetch(
      "https://api.line.me/v2/bot/message/push",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          to: message.recipient,
          messages: [
            {
              type: "text",
              text: message.text,
            },
          ],
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (!response.ok) {
      throw new Error(`LINE_PROVIDER_HTTP_${response.status}`);
    }

    const parsed = lineResponseSchema.parse(await response.json());
    return {
      providerMessageId: parsed.sentMessages[0].id,
    };
  }
}

export function getNotificationAdapter(
  channel: notification_channel,
): NotificationAdapter {
  const env = getServerEnv();

  if (env.NOTIFICATION_PROVIDER === "disabled") {
    return new DisabledNotificationAdapter(
      channel,
      "NOTIFICATION_PROVIDER_DISABLED",
    );
  }

  if (
    channel === "EMAIL" &&
    env.NOTIFICATION_PROVIDER === "resend"
  ) {
    return new ResendEmailAdapter(env.RESEND_API_KEY, env.EMAIL_FROM);
  }

  if (
    channel === "LINE" &&
    env.NOTIFICATION_PROVIDER === "line"
  ) {
    return new LineNotificationAdapter(env.LINE_CHANNEL_ACCESS_TOKEN);
  }

  return new DisabledNotificationAdapter(
    channel,
    `${channel}_PROVIDER_DISABLED`,
  );
}

export async function getNotificationAdapterForLocation(
  channel:notification_channel, organizationId:string, locationId:string | null,
):Promise<NotificationAdapter> {
  if(channel!=="LINE" || !locationId) return getNotificationAdapter(channel);
  const active=await prisma.$queryRaw<{id:string}[]>(Prisma.sql`
    select id from public.mobile_store_entries
    where organization_id=${organizationId}::uuid
      and location_id=${locationId}::uuid and is_enabled limit 1
  `);
  if(!active.length) return getNotificationAdapter(channel);
  if(getServerEnv().NOTIFICATION_PROVIDER!=="line")
    return new DisabledNotificationAdapter("LINE","NOTIFICATION_PROVIDER_DISABLED");
  const configured=await getStoreLineMessagingChannel(organizationId,locationId);
  if(!configured) return new DisabledNotificationAdapter("LINE","STORE_LINE_CHANNEL_NOT_CONFIGURED");
  const tokens=z.record(z.string(),z.string()).parse(JSON.parse(
    process.env.LINE_BOOKING_CHANNEL_ACCESS_TOKENS_JSON||"{}") as unknown);
  const token=tokens[configured.channelId];
  return token?new LineNotificationAdapter(token):
    new DisabledNotificationAdapter("LINE","STORE_LINE_ACCESS_TOKEN_NOT_CONFIGURED");
}
