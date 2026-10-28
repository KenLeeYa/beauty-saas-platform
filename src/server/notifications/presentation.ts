import type {
  customer_contact_type,
  notification_channel,
  notification_event_type,
} from "@prisma/client";
import {resolveLocale, type Locale} from "@/lib/i18n/locale";

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
  language?: string | null;
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

const translatedEvents: Record<'en' | 'vi', Record<notification_event_type, string>> = {
  en: {
    BOOKING_CONFIRMED: 'Appointment confirmed', BOOKING_RESCHEDULED: 'Appointment rescheduled',
    BOOKING_CANCELLED: 'Appointment cancelled', BOOKING_REMINDER_24H: 'Appointment reminder: 24 hours',
    BOOKING_REMINDER_3H: 'Appointment reminder: 3 hours', BOOKING_REMINDER_1H: 'Appointment reminder: 1 hour',
    BOOKING_PAYMENT_PENDING: 'Appointment deposit pending', BOOKING_PAYMENT_CONFIRMED: 'Deposit confirmed',
    BOOKING_COMPLETED: 'Service completed', REVIEW_REQUEST: 'Share your feedback',
    REVISIT_REMINDER: 'Time for your next visit', NO_SHOW_NOTICE: 'Missed appointment',
  },
  vi: {
    BOOKING_CONFIRMED: 'Lịch hẹn đã được xác nhận', BOOKING_RESCHEDULED: 'Lịch hẹn đã được đổi',
    BOOKING_CANCELLED: 'Lịch hẹn đã bị hủy', BOOKING_REMINDER_24H: 'Nhắc lịch hẹn trước 24 giờ',
    BOOKING_REMINDER_3H: 'Nhắc lịch hẹn trước 3 giờ', BOOKING_REMINDER_1H: 'Nhắc lịch hẹn trước 1 giờ',
    BOOKING_PAYMENT_PENDING: 'Đang chờ tiền đặt cọc', BOOKING_PAYMENT_CONFIRMED: 'Tiền đặt cọc đã được xác nhận',
    BOOKING_COMPLETED: 'Dịch vụ đã hoàn tất', REVIEW_REQUEST: 'Mời bạn chia sẻ đánh giá',
    REVISIT_REMINDER: 'Nhắc lịch quay lại', NO_SHOW_NOTICE: 'Thông báo vắng mặt',
  },
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
  locale: Locale,
): string | null {
  if (!startsAt) {
    return null;
  }

  return new Intl.DateTimeFormat(locale, {
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
  const locale = resolveLocale(null, input.language ?? null);
  const eventLabel = locale === 'zh-TW' ? eventLabels[input.eventType] : translatedEvents[locale][input.eventType];
  const bookingTime = formatBookingTime(input.startsAt, input.timezone, locale);
  const copy = {
    'zh-TW': {time: '時間：', service: '項目：', location: '店家：',
      greeting: `${input.customerName} 您好，${eventLabel}。`, help: '如需調整，請直接聯繫店家。'},
    en: {time: 'Time: ', service: 'Service: ', location: 'Location: ',
      greeting: `Hello ${input.customerName}, ${eventLabel}.`, help: 'To make changes, please contact the salon directly.'},
    vi: {time: 'Thời gian: ', service: 'Dịch vụ: ', location: 'Chi nhánh: ',
      greeting: `Xin chào ${input.customerName}, ${eventLabel}.`, help: 'Để thay đổi lịch hẹn, vui lòng liên hệ trực tiếp với cửa hàng.'},
  }[locale];
  const details = [
    bookingTime ? `${copy.time}${bookingTime}` : null,
    input.serviceName ? `${copy.service}${input.serviceName}` : null,
    `${copy.location}${input.locationName}`,
  ].filter((item): item is string => Boolean(item));
  const text = [
    copy.greeting,
    ...details,
    copy.help,
  ].join("\n");

  return {
    subject: `${input.organizationName}｜${eventLabel}`,
    text,
    html: `<div lang="${locale}"><p>${escapeHtml(copy.greeting)}</p><p>${details.map(escapeHtml).join("<br>")}</p><p>${escapeHtml(copy.help)}</p></div>`,
  };
}

export function retryDelayMilliseconds(attemptNumber: number): number {
  const boundedAttempt = Math.max(1, Math.min(attemptNumber, 8));
  return Math.min(60 * 60 * 1000, 30_000 * 2 ** (boundedAttempt - 1));
}
