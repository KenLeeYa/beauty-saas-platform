"use client";

import Link from "next/link";
import { Store } from "lucide-react";
import { LanguageSwitcher, useLanguage } from "./language-provider";
import { LogoutButton } from "./logout-button";

export function WorkspaceHeader({title, subtitle, bookingPath, disabled = false}: {
  title: string; subtitle?: string; bookingPath?: string; disabled?: boolean;
}) {
  const {t} = useLanguage();
  return <header className="workspace-header">
    <div className="workspace-heading">
      <p className="workspace-title" title={title}>{title}</p>
      {subtitle && <p className="workspace-subtitle" title={subtitle}>{subtitle}</p>}
    </div>
    <div className="workspace-tools">
      {bookingPath && <Link className="utility-icon" href={bookingPath} target="_blank" rel="noopener noreferrer"
        aria-label={t("開啟顧客預約頁")} title={t("開啟顧客預約頁")}>
        <Store size={20} aria-hidden="true" />
      </Link>}
      <LanguageSwitcher />
      <LogoutButton showLanguage={false} disabled={disabled} />
    </div>
  </header>;
}
