import type {
  customer_contact_type,
  notification_channel,
  notification_event_type,
} from "@prisma/client";

export type RecipientCandidate = {
  preference: customer_contact_type | null;
  contacts: ReadonlyArray<{
    contactType: customer_contact_type;
    value: string;
    primary: boolean;
  }>;
  lineLinks: ReadonlyArray<{
    providerUserReference: string;
  }>;
};

export type NotificationRecipient = {
  channel: notification_channel;
  address: string | null;
};

export type NotificationPresentationInput = {
  eventType: notification_event_type;
  organizationName: string;
  locationName: string;
  timezone: string;
  customerName: string;
  serviceName: string | null;
  startsAt: Date | null;
};

const eventLabels: Record<notification_event_type, string> = {
  BOOKING_CONFIRMED: "預約已確認",
  BOOKING_RESCHEDULED: "預約已改期",
  BOOKING_CANCELLED: "預約已取消",
  BOOKING_REMINDER_24H: "預約前一天提醒",
  BOOKING_REMINDER_3H: "預約前三小時提醒",
  BOOKING_REMINDER_1H: "預約前一小時提醒",
  BOOKING_PAYMENT_PENDING: "預約待確認訂金",
  BOOKING_PAYMENT_CONFIRMED: "訂金已確認",
  BOOKING_COMPLETED: "服務已完成",
  REVIEW_REQUEST: "服務回饋邀請",
  REVISIT_REMINDER: "回訪提醒",
  NO_SHOW_NOTICE: "未到店通知",
};

export function selectNotificationRecipient(
  input: RecipientCandidate,
): NotificationRecipient {
  const preferredLine = input.lineLinks[0]?.providerUserReference;
  const orderedContacts = [...input.contacts].sort(
    (left, right) => Number(right.primary) - Number(left.primary),
  );
  const email = orderedContacts.find(
    (contact) => contact.contactType === "EMAIL",
  )?.value;
  const phone = orderedContacts.find(
    (contact) => contact.contactType === "PHONE",
  )?.value;

  if (input.preference === "LINE" && preferredLine) {
    return {
      channel: "LINE",
      address: preferredLine,
    };
  }
  if (input.preference === "EMAIL" && email) {
    return {
      channel: "EMAIL",
      address: email,
    };
  }
  if (input.preference === "PHONE" && phone) {
    return {
      channel: "SMS",
      address: phone,
    };
  }
  if (preferredLine) {
    return {
      channel: "LINE",
      address: preferredLine,
    };
  }
  if (email) {
    return {
      channel: "EMAIL",
      address: email,
    };
  }
  if (phone) {
    return {
      channel: "SMS",
      address: phone,
    };
  }

  return {
    channel: "EMAIL",
    address: null,
  };
}

function formatBookingTime(
  startsAt: Date | null,
  timezone: string,
): string | null {
  if (!startsAt) {
    return null;
  }

  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: timezone,
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(startsAt);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function renderNotification(input: NotificationPresentationInput): {
  subject: string;
  text: string;
  html: string;
} {
  const eventLabel = eventLabels[input.eventType];
  const bookingTime = formatBookingTime(input.startsAt, input.timezone);
  const details = [
    bookingTime ? `時間：${bookingTime}` : null,
    input.serviceName ? `項目：${input.serviceName}` : null,
    `店家：${input.locationName}`,
  ].filter((item): item is string => Boolean(item));
  const text = [
    `${input.customerName} 您好，${eventLabel}。`,
    ...details,
    "如需調整，請直接聯繫店家。",
  ].join("\n");

  return {
    subject: `${input.organizationName}｜${eventLabel}`,
    text,
    html: `<p>${escapeHtml(input.customerName)} 您好，${escapeHtml(
      eventLabel,
    )}。</p><p>${details.map(escapeHtml).join("<br>")}</p><p>如需調整，請直接聯繫店家。</p>`,
  };
}

export function retryDelayMilliseconds(attemptNumber: number): number {
  const boundedAttempt = Math.max(1, Math.min(attemptNumber, 8));
  return Math.min(60 * 60 * 1000, 30_000 * 2 ** (boundedAttempt - 1));
}
