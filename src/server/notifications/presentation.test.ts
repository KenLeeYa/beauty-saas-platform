import { describe, expect, it } from "vitest";

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
