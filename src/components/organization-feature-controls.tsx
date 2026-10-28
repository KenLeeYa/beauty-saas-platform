"use client";

import { useLanguage } from "@/components/language-provider";

import { RotateCcw, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import type { AdminOrganizationFeaturesData } from "@/server/admin/features";

type ApiPayload = {
  data?: {
    success: boolean;
  };
  error?: {
    message?: string;
  };
};

const featureLabels: Readonly<Record<string, string>> = {
  ONLINE_BOOKING: "線上預約",
  BASIC_CALENDAR: "基本行事曆",
  STAFF_SCHEDULING: "人員排班",
  CUSTOMER_CRM: "顧客管理",
  CUSTOMER_BLACKLIST: "顧客黑名單（加值）",
  CUSTOMER_MEDIA: "顧客私密媒體",
  BUSINESS_HOURS: "營業時間",
  RESOURCE_MANAGEMENT: "空間與設備",
  LINE_NOTIFICATIONS: "LINE 通知",
  EMAIL_NOTIFICATIONS: "電子郵件通知",
  DEPOSITS: "訂金",
  CANCELLATION_RULES: "取消規則",
  MULTI_LOCATION: "多分店",
  CSV_EXPORT: "CSV 匯出",
  ADVANCED_REPORTS: "進階報表",
  SCHEDULED_REPORTS: "排程報表",
  CUSTOM_BRANDING: "自訂品牌",
  AUDIT_VIEWER: "稽核紀錄",
  API_ACCESS: "API 存取",
  WEBHOOK_ACCESS: "事件通知介接",
  CUSTOM_DOMAIN: "自訂網域",
  WHITE_LABEL: "白牌",
  MEMBERSHIPS_PACKAGES: "會員與套票",
  AI_ASSISTANT: "AI 助理",
  MARKETPLACE: "市集",
};
const statusLabels: Readonly<Record<string, string>> = {
  TRIALING: "試用中", ACTIVE: "使用中", PAST_DUE: "付款逾期", SUSPENDED: "已停用",
  GRACE_PERIOD: "寬限期", CANCELLED: "已取消", CANCELED: "已取消", EXPIRED: "已到期", INCOMPLETE: "待完成",
};
const overrideLabels: Readonly<Record<string, string>> = {
  ALLOW: "允許使用", DENY: "停用", LIMIT: "調整上限",
};

function csrfToken(): string {
  const match = document.cookie
    .split("; ")
    .find((item) => item.startsWith("beauty_csrf="));
  return match ? decodeURIComponent(match.split("=").slice(1).join("=")) : "";
}

export function OrganizationFeatureControls({
  data,
}: {
  data: AdminOrganizationFeaturesData;
}) {
  const { t, errorText } = useLanguage();
  const router = useRouter();
  const [selectedFeature, setSelectedFeature] = useState(
    data.features[0]?.key ?? "ONLINE_BOOKING",
  );
  const [overrideType, setOverrideType] = useState<
    "ALLOW" | "DENY" | "LIMIT"
  >("ALLOW");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function mutate(body: Readonly<Record<string, unknown>>) {
    setIsSubmitting(true);
    setFeedback(null);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/organizations/${data.organization.id}/features`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-csrf-token": csrfToken(),
          },
          body: JSON.stringify(body),
        },
      );
      const payload = (await response.json()) as ApiPayload;
      if (!response.ok || !payload.data?.success) {
        throw new Error(
          payload.error?.message ?? t("功能權益更新失敗。"),
        );
      }
      setFeedback("功能權益已更新。");
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error && /\p{Script=Han}/u.test(cause.message)
          ? cause.message
          : "功能權益更新失敗。",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const limitValue = Number(form.get("limitValue"));
    const expiresAtValue = String(form.get("expiresAt") ?? "");
    void mutate({
      action: "SET",
      featureKey: selectedFeature,
      overrideType,
      ...(overrideType === "LIMIT" ? { limitValue } : {}),
      reason: String(form.get("reason")),
      ...(expiresAtValue
        ? { expiresAt: new Date(expiresAtValue).toISOString() }
        : {}),
    });
  }

  return (
    <div className="platform-surface space-y-7">
      <section className="border-y border-slate-200 bg-white px-5 py-5">
        <h2 className="text-lg font-semibold text-ink">
          {data.organization.name}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          {data.subscription
            ? `${data.subscription.planName} · ${t("版本")} ${data.subscription.planVersion} · ${t(statusLabels[data.subscription.status] ?? "待確認")}`
            : t("尚未建立訂閱")}
        </p>
      </section>

      <form
        className="border-y border-slate-200 bg-white px-5 py-6"
        onSubmit={submit}
      >
        <h2 className="font-semibold text-ink">{t("新增或取代功能覆寫")}</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <label>
            <span className="text-sm font-medium text-slate-700">{t("功能")}</span>
            <select
              className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3"
              value={selectedFeature}
              onChange={(event) =>
                setSelectedFeature(
                  event.target.value as typeof selectedFeature,
                )
              }
            >
              {data.features.map((feature) => (
                <option key={feature.key} value={feature.key}>
                  {t(featureLabels[feature.key] ?? "其他功能")}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="text-sm font-medium text-slate-700">
              {t("覆寫方式")}</span>
            <select
              className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3"
              value={overrideType}
              onChange={(event) =>
                setOverrideType(
                  event.target.value as typeof overrideType,
                )
              }
            >
              <option value="ALLOW">{t("允許")}</option>
              <option value="DENY">{t("停用")}</option>
              <option value="LIMIT">{t("調整上限")}</option>
            </select>
          </label>
          <label>
            <span className="text-sm font-medium text-slate-700">
              {t("上限")}</span>
            <input
              className="mt-2 h-11 w-full rounded-md border border-slate-300 px-3 disabled:bg-slate-50"
              disabled={overrideType !== "LIMIT"}
              min="0"
              name="limitValue"
              required={overrideType === "LIMIT"}
              type="number"
            />
          </label>
          <label>
            <span className="text-sm font-medium text-slate-700">
              {t("到期時間")}</span>
            <input
              className="mt-2 h-11 w-full rounded-md border border-slate-300 px-3"
              name="expiresAt"
              type="datetime-local"
            />
          </label>
          <label className="md:col-span-2 lg:col-span-4">
            <span className="text-sm font-medium text-slate-700">{t("原因")}</span>
            <input
              className="mt-2 h-11 w-full rounded-md border border-slate-300 px-3"
              maxLength={500}
              minLength={3}
              name="reason"
              required
            />
          </label>
        </div>
        <button
          className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-md bg-ink px-4 text-sm font-semibold text-white disabled:opacity-50"
          disabled={isSubmitting}
          type="submit"
        >
          <Save aria-hidden="true" className="h-4 w-4" />
          {t("儲存覆寫")}</button>
      </form>

      <div aria-live="polite">
        {feedback ? (
          <p className="text-sm font-medium text-teal">{t(feedback)}</p>
        ) : null}
        {error ? (
          <p
            className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            role="alert"
          >
            {errorText(error)}
          </p>
        ) : null}
      </div>

      <section>
        <h2 className="text-lg font-semibold text-ink">{t("方案與有效權益")}</h2>
        <div className="mt-3 border-y border-slate-200 bg-white">
          <table className="block w-full text-left text-sm md:table">
            <thead className="hidden border-b border-slate-200 bg-slate-50 text-xs text-slate-500 md:table-header-group">
              <tr>
                <th className="px-4 py-3 font-semibold">{t("功能")}</th>
                <th className="px-4 py-3 font-semibold">{t("方案")}</th>
                <th className="px-4 py-3 font-semibold">{t("方案上限")}</th>
                <th className="px-4 py-3 font-semibold">{t("有效覆寫")}</th>
                <th className="px-4 py-3 font-semibold">{t("操作")}</th>
              </tr>
            </thead>
            <tbody className="block divide-y divide-slate-100 md:table-row-group">
              {data.features.map((feature) => (
                <tr key={feature.key} className="block py-3 md:table-row md:py-0">
                  <td className="block px-4 py-2 font-semibold break-words text-ink md:table-cell md:py-3">
                    {t(featureLabels[feature.key] ?? "其他功能")}
                  </td>
                  <td className="flex justify-between gap-3 px-4 py-2 text-slate-600 md:table-cell md:py-3">
                    <span className="md:hidden">{t("方案")}</span>
                    {feature.planEnabled ? t("啟用") : t("停用")}
                  </td>
                  <td className="flex justify-between gap-3 px-4 py-2 text-slate-600 md:table-cell md:py-3">
                    <span className="md:hidden">{t("方案上限")}</span>
                    <span>{feature.planLimit ?? t("無")}{feature.softLimit ? t("（軟性）") : ""}</span>
                  </td>
                  <td className="flex justify-between gap-3 px-4 py-2 text-slate-600 md:table-cell md:py-3">
                    <span className="md:hidden">{t("有效覆寫")}</span>
                    {feature.activeOverride
                      ? `${t(overrideLabels[feature.activeOverride.type] ?? "待確認")}${
                          feature.activeOverride.limitValue !== null
                            ? ` · ${feature.activeOverride.limitValue}`
                            : ""
                        }`
                      : t("無")}
                  </td>
                  <td className="block px-4 py-2 md:table-cell md:py-3">
                    {feature.activeOverride ? (
                      <button
                        aria-label={`${t("撤銷覆寫")} ${t(featureLabels[feature.key] ?? "其他功能")}`}
                        className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-semibold text-red-700 disabled:opacity-50"
                        disabled={isSubmitting}
                        title={t("撤銷覆寫")}
                        type="button"
                        onClick={() =>
                          void mutate({
                            action: "REVOKE",
                            overrideId: feature.activeOverride?.id,
                          })
                        }
                      >
                        <RotateCcw
                          aria-hidden="true"
                          className="h-4 w-4"
                        />
                        {t("撤銷")}</button>
                    ) : (
                      <span className="hidden text-slate-400 md:inline">{t("無")}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
