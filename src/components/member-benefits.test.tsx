import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BenefitResult, MemberBenefits } from "./member-benefits";

describe("localized member benefits", () => {
  it("shows minor-unit balances, expiry and kinds without raw JSON", () => {
    const html = renderToStaticMarkup(<MemberBenefits timezone="Asia/Taipei"
      wallet={{ paidMinor: 12345, bonusMinor: 1000, totalMinor: 13345 }} benefits={[
        { id: "coupon", kind: "COUPON", available: 2, terms: { quantity: 3, discountMinor: 5050 }, expiresAt: "2099-01-01T20:00:00Z" },
        { id: "package", kind: "SERVICE_PACKAGE", available: 0, terms: { quantity: 1 }, expiresAt: null },
      ]} />);
    expect(html).toContain("133.45"); expect(html).toContain("優惠券");
    expect(html).toContain("服務套票"); expect(html).toContain("剩餘 2 次");
    expect(html).toContain("無可用次數"); expect(html).toContain("2099/01/02 04:00");
    expect(html).not.toMatch(/COUPON|SERVICE_PACKAGE|<pre/);
  });
  it("does not describe expired quantities as redeemable", () => {
    const html = renderToStaticMarkup(<MemberBenefits timezone="Asia/Taipei"
      wallet={{ paidMinor: 0, bonusMinor: 0, totalMinor: 0 }} benefits={[
        { id: "expired", kind: "COUPON", available: 2, terms: { quantity: 2 }, expiresAt: "2020-01-01T00:00:00Z" },
      ]} />);
    expect(html).toContain("已到期"); expect(html).not.toContain("剩餘 2 次");
  });
  it("formats zero and rejects an unsupported result without dumping it", () => {
    const html = renderToStaticMarkup(<BenefitResult timezone="Asia/Taipei" value={{ available: 0 }} />);
    expect(html).toContain("剩餘權益：0 次");
    const invalid = renderToStaticMarkup(<BenefitResult timezone="Asia/Taipei" value={{ secret: "private" }} />);
    expect(invalid).toContain("無法顯示權益結果"); expect(invalid).not.toContain("private");
  });
  it("renders promotion, commission and acknowledgement variants", () => {
    for (const [value, text] of [
      [{ listPriceMinor: 10000, discountMinor: 1000, payableMinor: 9000, currency: "TWD" }, "應付金額"],
      [{ quote: [], refundQuote: [] }, "抽成試算"], [{ published: true }, "規則已發布"],
      [{ issueId: "issue" }, "權益發放編號"], [{ policyId: "policy" }, "優惠草稿編號"],
    ] as const) expect(renderToStaticMarkup(<BenefitResult timezone="Asia/Taipei" value={value} />)).toContain(text);
  });
});
