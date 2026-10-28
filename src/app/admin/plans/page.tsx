import { redirect } from "next/navigation";

import { LogoutButton } from "@/components/logout-button";
import { PlatformNavigation } from "@/components/platform-navigation";
import { getAdminPlansData } from "@/server/admin/billing";
import { getCurrentSession } from "@/server/auth/session";
import {getLanguage} from "@/lib/i18n/server";
import type {Locale} from "@/lib/i18n/locale";

export const dynamic = "force-dynamic";

function formatMoney(amountMinor: number, currency: string, locale: Locale): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amountMinor / 100);
}

export default async function AdminPlansPage() {
  const session = await getCurrentSession();
  if (!session) {
    redirect("/");
  }
  if (session.platformRole !== "PLATFORM_ADMIN") {
    redirect("/merchant");
  }
  const data = await getAdminPlansData(session);
  const {locale, t} = await getLanguage();
  const cell = "flex min-w-0 flex-col gap-1 px-4 py-2 text-slate-600 before:text-xs before:font-medium before:content-[attr(data-label)] md:table-cell md:py-3 md:before:content-none";

  return (
    <main id="main-content" className="min-h-screen bg-mist">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-semibold text-teal">{t('平台管理')}</p>
            <h1 className="mt-1 text-xl font-semibold text-ink">
              {t('方案版本')}
            </h1>
          </div>
          <LogoutButton />
        </div>
      </header>
      <PlatformNavigation />
      <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6">
        <div className="border-y border-slate-200 bg-white">
          <table className="block w-full text-left text-sm md:table">
            <thead className="sr-only border-b border-slate-200 bg-slate-50 text-xs text-slate-500 md:not-sr-only md:table-header-group">
              <tr>
                {(['方案', '版本', '月費', '試用天數', '啟用功能', '狀態'] as const).map(label =>
                  <th key={label} className="px-4 py-3 font-semibold">{t(label)}</th>)}
              </tr>
            </thead>
            <tbody className="block divide-y divide-slate-100 md:table-row-group">
              {data.plans.flatMap((plan) =>
                plan.versions.map((version) => (
                  <tr key={version.id} className="grid grid-cols-2 py-3 md:table-row md:py-0">
                    <td className="col-span-2 block break-words px-4 py-2 md:table-cell">
                      <p className="font-semibold text-ink">{plan.name}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {plan.code}
                      </p>
                    </td>
                    <td className={cell} data-label={t('版本')}>
                      v{version.version}
                    </td>
                    <td className={cell} data-label={t('月費')}>
                      {formatMoney(
                        version.monthlyPriceMinor,
                        version.currency,
                        locale,
                      )}
                    </td>
                    <td className={cell} data-label={t('試用天數')}>
                      {version.trialDays}
                    </td>
                    <td className={cell} data-label={t('啟用功能')}>
                      {version.enabledFeatures} / {version.totalFeatures}
                    </td>
                    <td className={cell} data-label={t('狀態')}>
                      {plan.active ? t("使用中") : t("已停用")}
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
