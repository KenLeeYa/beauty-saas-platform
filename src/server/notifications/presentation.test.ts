import { describe, expect, it } from "vitest";
import {notification_event_type} from '@prisma/client';

import {
  renderNotification,
  retryDelayMilliseconds,
  selectNotificationRecipient,
} from "./presentation";

describe("selectNotificationRecipient", () => {
  it("uses the verified preference when a matching destination exists", () => {
    expect(
      selectNotificationRecipient({
        preference: "EMAIL",
        contacts: [
          {
            contactType: "PHONE",
            value: "+886912345678",
            primary: true,
          },
          {
            contactType: "EMAIL",
            value: "customer@example.test",
            primary: false,
          },
        ],
        lineLinks: [
          {
            providerUserReference: "U123",
          },
        ],
      }),
    ).toEqual({
      channel: "EMAIL",
      address: "customer@example.test",
    });
  });

  it("returns a null destination without inventing customer contact data", () => {
    expect(
      selectNotificationRecipient({
        preference: null,
        contacts: [],
        lineLinks: [],
      }),
    ).toEqual({
      channel: "EMAIL",
      address: null,
    });
  });
});

describe("renderNotification", () => {
  it.each(Object.values(notification_event_type))('renders %s in all supported languages', eventType => {
    const results = ['zh-TW', 'en', 'vi'].map(language => renderNotification({eventType, language,
      organizationName: 'Lumi', locationName: 'Salon', timezone: 'Asia/Taipei',
      customerName: 'QA', serviceName: 'Facial', startsAt: new Date('2026-07-29T02:15:00Z')}));
    expect(new Set(results.map(result => result.subject)).size).toBe(3);
    for (const result of results) {expect(result.text).toContain('10:15'); expect(result.subject).not.toContain('undefined');}
    expect(results[1].text).not.toMatch(/[\p{Script=Han}]/u);
    expect(results[2].text).not.toMatch(/[\p{Script=Han}]/u);
  });
  it.each([
    ['en-US', 'Appointment reminder: 1 hour', 'Time:', 'Hello'],
    ['vi-VN', 'Nhắc lịch hẹn trước 1 giờ', 'Thời gian:', 'Xin chào'],
    ['zh-Hant-TW', '預約前一小時提醒', '時間：', '您好'],
  ])('uses recipient language %s without translating business names', (language, subject, time, greeting) => {
    const result = renderNotification({eventType: 'BOOKING_REMINDER_1H', language,
      organizationName: 'Lumi', locationName: '台北店', timezone: 'Asia/Taipei',
      customerName: '<小美>', serviceName: '經典美睫', startsAt: new Date('2026-07-29T02:15:00Z')});
    expect(result.subject).toContain(subject);
    expect(result.text).toContain(time); expect(result.text).toContain(greeting);
    expect(result.text).toContain('10:15'); expect(result.text).toContain('經典美睫');
    expect(result.html).toContain('&lt;小美&gt;'); expect(result.html).not.toContain('<小美>');
  });
  it("renders the one-hour reminder in the branch timezone", () => {
    const result = renderNotification({
      eventType: "BOOKING_REMINDER_1H",
      organizationName: "Lumi Beauty",
      locationName: "台北店",
      timezone: "Asia/Taipei",
      customerName: "王小美",
      serviceName: "經典美睫",
      startsAt: new Date("2026-07-29T02:15:00.000Z"),
    });

    expect(result.subject).toContain("預約前一小時提醒");
    expect(result.text).toContain("10:15");
    expect(result.text).toContain("經典美睫");
  });

  it("escapes customer-controlled text in HTML", () => {
    const result = renderNotification({
      eventType: "BOOKING_CONFIRMED",
      organizationName: "Beauty",
      locationName: "台北店",
      timezone: "Asia/Taipei",
      customerName: "<script>alert(1)</script>",
      serviceName: null,
      startsAt: null,
    });

    expect(result.html).not.toContain("<script>");
    expect(result.html).toContain("&lt;script&gt;");
  });
});

describe("retryDelayMilliseconds", () => {
  it("uses bounded exponential backoff", () => {
    expect(retryDelayMilliseconds(1)).toBe(30_000);
    expect(retryDelayMilliseconds(2)).toBe(60_000);
    expect(retryDelayMilliseconds(20)).toBe(3_600_000);
  });
});
