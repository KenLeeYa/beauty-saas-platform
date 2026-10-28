import { Building2, ChevronRight, MapPin } from "lucide-react";
import Link from "next/link";
import { getLanguage } from "@/lib/i18n/server";
import { translate } from "@/lib/i18n/messages";

import { LogoutButton } from "./logout-button";

type ScopeOption = {
  id: string;
  title: string;
  description: string;
  href: string;
};

export async function ScopeSelector({
  displayName,
  kind,
  options,
}: {
  displayName: string;
  kind: "organization" | "location";
  options: ScopeOption[];
}) {
  const { locale } = await getLanguage();
  const t = (key: string) => translate(locale, key);
  const Icon = kind === "organization" ? Building2 : MapPin;
  const title = kind === "organization" ? "選擇商家" : "選擇分店";
  const subtitle =
    kind === "organization"
      ? "請選擇這次要管理的商家。"
      : "請選擇這次要操作的分店。";

  return (
    <main className="scope-surface min-h-screen bg-mist">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-teal">
              Beauty SaaS
            </p>
            <p className="mt-1 text-sm font-semibold text-ink">
              {displayName}
            </p>
          </div>
          <LogoutButton />
        </div>
      </header>
      <section className="mx-auto max-w-3xl px-4 py-5 sm:px-6 sm:py-10">
        <Icon aria-hidden="true" className="h-6 w-6 text-teal" />
        <h1 className="mt-3 text-2xl font-semibold text-ink">{t(title)}</h1>
        <p className="mt-2 text-sm text-slate-600">{t(subtitle)}</p>

        <nav aria-label={t(title)} className="mt-5 divide-y divide-slate-200 border-y border-slate-200 bg-white">
          {options.map((option) => (
            <Link
              className="flex min-h-20 items-center justify-between gap-4 px-4 py-4 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-teal"
              href={option.href}
              key={option.id}
            >
              <span className="min-w-0">
                <span className="block font-semibold text-ink">
                  {option.title}
                </span>
                <span className="mt-1 block text-sm text-slate-500">
                  {option.description}
                </span>
              </span>
              <ChevronRight
                aria-hidden="true"
                className="h-5 w-5 shrink-0 text-slate-400"
              />
            </Link>
          ))}
        </nav>
      </section>
    </main>
  );
}
