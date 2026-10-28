import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AppError, toPublicError } from "./errors";
import { jsonError, mobileJsonError } from "./response";
import { translateError } from "@/lib/i18n/messages";
import { publicMessage } from "@/lib/line-booking/validation";

describe("Traditional Chinese API errors", () => {
  it.each([['en', 'Please check your input.'], ['vi', 'Vui lòng kiểm tra thông tin đã nhập.']] as const)(
    'localizes field validation for %s without changing paths or leaking inputs', async (locale, message) => {
      const parsed = z.object({ contactEmail: z.email(), desiredSlug: z.string().min(3, '商家網址至少需要 3 個字元。') }).strict()
        .safeParse({ contactEmail: 'private-invalid-input', desiredSlug: 'x', secret: 'private-value' });
      if (parsed.success) throw new Error('Expected validation failure');
      const request = new Request('http://localhost/api/onboarding/application', {
        headers: { cookie: `beauty_language=${locale}`, 'accept-language': 'zh-TW' },
      });
      const response = jsonError(parsed.error, 'test-request', request);
      const body = await response.json();
      expect(response.status).toBe(400);
      expect(response.headers.get('x-request-id')).toBe('test-request');
      expect(body.error.message).toBe(message);
      expect(body.error.details.issues[0].path).toBe('contactEmail');
      expect(JSON.stringify(body)).not.toMatch(/private-|Invalid|Unrecognized|\p{Script=Han}/u);
      expect(translateError('zh-TW', body.error.message)).toBe('請檢查輸入內容。');
      expect(translateError(locale === 'en' ? 'vi' : 'en', body.error.message)).not.toBe(body.error.message);
    },
  );
  it('negotiates mobile errors from headers and preserves denial status', async () => {
    const response = mobileJsonError(new AppError('FORBIDDEN', 'Attendance access denied', 403),
      new Request('http://localhost/api/line-booking/attendance', { headers: { 'accept-language': 'vi-VN,en;q=0.5' } }));
    expect(response.status).toBe(403);
    expect((await response.json()).error).not.toMatch(/\p{Script=Han}/u);
  });
  it.each(['zh-TW', 'en', 'vi'] as const)('keeps required, maximum, enum and malformed JSON errors safe in %s', locale => {
    const parsed = z.object({ required: z.string(), count: z.number().max(5), mode: z.enum(['OPEN', 'CLOSED']) })
      .safeParse({ count: 6, mode: 'private-enum-value' });
    if (parsed.success) throw new Error('Expected validation failure');
    const body = toPublicError(parsed.error, locale).body;
    const issues = body.error.details?.issues as {path:string;message:string}[];
    expect(issues.map(issue => issue.path)).toEqual(['required', 'count', 'mode']);
    for (const issue of issues) {
      expect(issue.message).not.toContain('private-enum-value');
      expect(translateError('zh-TW', issue.message)).toMatch(/\p{Script=Han}/u);
      if (locale !== 'zh-TW') expect(issue.message).not.toMatch(/\p{Script=Han}/u);
    }
    const malformed = toPublicError(new SyntaxError('private request body'), locale);
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.message).not.toContain('private');
    const failure = toPublicError(new Error('private database credentials'), locale);
    expect(failure.status).toBe(500);
    expect(translateError('zh-TW', failure.body.error.message)).toBe('系統暫時無法處理此請求。');
  });
  it('isolates request language and falls back from invalid cookies to browser preference', async () => {
    const error = new AppError('UNAUTHENTICATED', 'Session expired', 401);
    const english = jsonError(error, undefined, new Request('http://localhost/api/auth/session', {
      headers:{cookie:'beauty_language=invalid', 'accept-language':'en-US'},
    }));
    const chinese = jsonError(error, undefined, new Request('http://localhost/api/auth/session', {
      headers:{cookie:'beauty_language=zh-TW', 'accept-language':'en-US'},
    }));
    expect((await english.json()).error.message).toBe('Your session is no longer valid. Sign in again.');
    expect((await chinese.json()).error.message).toBe('登入已失效，請重新登入。');
  });
  it.each([
    ["Benefit expired", "此權益已到期。"],
    ["Invalid clock sequence", "打卡順序不符，請重新載入最近紀錄後再試。"],
    ["Payroll sources changed; recalculate draft", "薪資來源資料已變更，請重新產生試算草稿。"],
  ])("localizes %s without changing domain identity", (source, translated) => {
    const error = new AppError("CONFLICT", source, 409);
    expect(error.message).toBe(source);
    expect(toPublicError(error)).toEqual({ status: 409, body: { error: { code: "CONFLICT", message: translated } } });
  });
  it("preserves actionable Chinese messages and safe details", () => {
    const error = new AppError("CONFLICT", "此人員休假中，請重新選擇。", 409, { expectedVersion: 2 });
    expect(toPublicError(error).body.error).toEqual({ code: "CONFLICT", message: error.message, details: { expectedVersion: 2 } });
  });
  it("localizes validation issues without echoing invalid input", () => {
    const result = z.object({ customerId: z.uuid(), amount: z.number().min(1) }).strict()
      .safeParse({ customerId: "private invalid input", amount: 0, secret: "do not echo" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const body = toPublicError(result.error).body;
      expect(JSON.stringify(body)).not.toMatch(/private invalid|do not echo|Invalid|Too small|Unrecognized/);
      expect(body.error.details?.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: "customerId", message: "格式不正確，請確認後再試。" }),
      ]));
    }
  });
  it("redacts unknown exceptions in both response envelopes", async () => {
    const error = new Error("relation private_customer_secrets does not exist");
    expect(JSON.stringify(toPublicError(error))).not.toContain("private_customer");
    const response = mobileJsonError(error);
    expect(await response.json()).toEqual({ error: "無法處理請求，請確認資料後再試。" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("retains mobile role denial and localized legacy conflicts", async () => {
    const response = mobileJsonError(new AppError("FORBIDDEN", "Attendance access denied", 403));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "您目前沒有執行此操作的權限。" });
    expect(publicMessage({ code: "23P01" })).toBe("此時段已無法預約，請選擇其他時段。");
    expect(publicMessage(new Error("session expired"))).toBe("登入已過期，請重新登入。");
  });
});
