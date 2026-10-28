"use client";

import {LanguageSwitcher, useLanguage} from "@/components/language-provider";
import {Dialog, DialogTrigger, DialogContent, DialogTitle, DialogClose} from "@/components/ui/dialog";

import {
  BadgeDollarSign,
  Cake,
  ChevronDown,
  ChevronRight,
  LockKeyhole,
  NotebookPen,
  Plus,
  Search,
  ShieldBan,
  Tag,
  X,
} from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import {useRemotePage} from "@/components/use-remote-page";
import {MerchantPager} from "@/components/merchant-sheet";

import type { MerchantWorkspaceData } from "@/server/merchant/data";
import { formatLocalMonthDayTime } from "@/lib/presentation/date-time";

type Customer = MerchantWorkspaceData["customers"][number];
type CustomerTag = MerchantWorkspaceData["customerTags"][number];

export type CustomerProfileUpdate = {
  birthday?: string;
  depositMode?: "DEFAULT" | "REQUIRED" | "EXEMPT";
  isBlacklisted?: boolean;
  blacklistReason?: string;
};

export type NewCustomerInput = {
  displayName: string;
  phone: string;
  email: string;
  birthday: string;
};

function formatMoney(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amountMinor / 100);
}

function TagBadge({ tag }: { tag: CustomerTag }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
      <span
        aria-hidden="true"
        className="h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: tag.color ?? "#64748b" }}
      />
      {tag.name}
    </span>
  );
}

export function CustomerManagement({
  customers,
  customerTags,
  currency,
  timezone,
  scope,
  canManage,
  canReadSensitive,
  depositsEnabled,
  blacklistEnabled,
  isSubmitting,
  onCreateCustomer,
  onUpdateCustomer,
  onCreateTag,
  onSetTag,
  onCreateNote,
  feedback,
  error,
}: {
  customers: Customer[];
  customerTags: CustomerTag[];
  currency: string;
  timezone: string;
  scope: string;
  canManage: boolean;
  canReadSensitive: boolean;
  depositsEnabled: boolean;
  blacklistEnabled: boolean;
  isSubmitting: boolean;
  feedback: string | null;
  error: string | null;
  onCreateCustomer: (input: NewCustomerInput) => Promise<boolean>;
  onUpdateCustomer: (
    customerId: string,
    update: CustomerProfileUpdate,
  ) => Promise<void>;
  onCreateTag: (input: {
    name: string;
    color: string;
  }) => Promise<boolean>;
  onSetTag: (input: {
    customerId: string;
    tagId: string;
    assigned: boolean;
  }) => Promise<void>;
  onCreateNote: (input: {
    customerId: string;
    note: string;
    sensitivity: "STANDARD" | "SENSITIVE";
  }) => Promise<boolean>;
}) {
  const {t, errorText} = useLanguage();
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("ALL");
  const [customerFormOpen, setCustomerFormOpen] = useState(false);
  const [page, setPage] = useState(0);
  const remote = useRemotePage<Customer>(`/api/merchant/customers?${scope}&limit=8&offset=${page*8}&search=${encodeURIComponent(search)}&tag=${tagFilter}`,customers);
  const filteredCustomers = remote.data?.items ?? [];

  async function submitCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const created = await onCreateCustomer({
      displayName: String(form.get("displayName") ?? ""),
      phone: String(form.get("phone") ?? ""),
      email: String(form.get("email") ?? ""),
      birthday: String(form.get("birthday") ?? ""),
    });
    if (created) {
      setCustomerFormOpen(false);
    }
  }

  async function submitTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const created = await onCreateTag({
      name: String(form.get("name") ?? ""),
      color: String(form.get("color") ?? "#0f766e"),
    });
    if (created) {
      formElement.reset();
    }
  }

  return (
    <div className="space-y-5">
      <div className="customer-toolbar">
        <label className="relative block">
          <span className="sr-only"> {t("搜尋顧客")} </span>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400"
          />
          <input
            className="h-11 w-full rounded-md border border-slate-300 bg-white pl-10 pr-3 text-sm text-ink outline-none focus:border-teal focus:ring-2 focus:ring-teal/10"
            placeholder={t("搜尋姓名、手機或標籤")}
            type="search"
            value={search}
            onChange={(event) => {setSearch(event.target.value); setPage(0);}}
          />
        </label>
        <label className="customer-filter">
          <span className="sr-only"> {t("標籤篩選")} </span>
          <select
            className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-ink"
            value={tagFilter}
            onChange={(event) => {setTagFilter(event.target.value); setPage(0);}}
          >
            <option value="ALL"> {t("全部標籤")} </option>
            {customerTags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </select>
        </label>
        {canManage ? (
          <button
            className="customer-add utility-icon !bg-ink !text-white"
            aria-label={t("新增顧客")} title={t("新增顧客")} aria-expanded={customerFormOpen}
            disabled={isSubmitting}
            type="button"
            onClick={() => setCustomerFormOpen((current) => !current)}
          >
            <Plus aria-hidden="true" className="h-5 w-5" /></button>
        ) : null}
      </div>

      {customerFormOpen ? (
        <form
          aria-label={t("新增顧客")}
          className="grid gap-4 border-y border-slate-200 bg-white px-4 py-5 sm:grid-cols-2"
          onSubmit={(event) => void submitCustomer(event)}
        >
          <CustomerField label={t("顧客姓名")} name="displayName" required />
          <CustomerField label={t("手機")} name="phone" required />
          <CustomerField label="Email" name="email" type="email" />
          <CustomerField label={t("生日")} name="birthday" type="date" />
          <button
            className="h-11 rounded-md bg-teal px-5 text-sm font-semibold text-white disabled:opacity-50 sm:col-span-2 sm:justify-self-start"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? t("儲存中") : t("建立顧客")}
          </button>
        </form>
      ) : null}

      {canManage ? (
        <details className="customer-tag-tools">
          <summary><Tag size={17} aria-hidden="true"/>{t("管理標籤")}<ChevronDown size={16} aria-hidden="true"/></summary>
        <form
          aria-label={t("建立顧客標籤")}
          className="grid gap-3 border-y border-slate-200 bg-white px-4 py-4 sm:grid-cols-[auto_minmax(160px,320px)_auto] sm:items-end"
          onSubmit={(event) => void submitTag(event)}
        >
          <label>
            <span className="block text-xs font-semibold text-slate-600"> {t("顏色")} </span>
            <input
              aria-label={t("標籤顏色")}
              className="mt-2 h-11 w-full min-w-16 cursor-pointer rounded-md border border-slate-300 bg-white p-1 sm:w-16"
              defaultValue="#0f766e"
              name="color"
              type="color"
            />
          </label>
          <CustomerField label={t("新標籤名稱")} name="name" required />
          <button
            className="flex h-11 items-center justify-center gap-2 rounded-md border border-slate-300 px-4 text-sm font-semibold text-ink disabled:opacity-50"
            disabled={isSubmitting}
            type="submit"
          >
            <Tag aria-hidden="true" className="h-4 w-4" /> {t("建立標籤")} </button>
        </form>
        </details>
      ) : null}

      {!blacklistEnabled ? (
        <div className="flex items-start gap-3 border-y border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <LockKeyhole
            aria-hidden="true"
            className="mt-0.5 h-4 w-4 shrink-0"
          />
          <p className="min-w-0 flex-1 font-semibold"> {t("顧客黑名單為加值功能")} </p>
          <Link
            className="shrink-0 font-semibold underline"
            href={`/merchant/subscription?${scope}`}
          > {t("查看方案")} </Link>
        </div>
      ) : null}

      {remote.loading && <p role="status">{t("載入中")}</p>}
      {remote.error && <div role="alert">{errorText(remote.error)} <button type="button" className="merchant-icon" onClick={remote.retry}>{t("重試")}</button></div>}
      {!remote.data ? null : remote.data.total === 0 && !search && tagFilter === "ALL" ? (
        <CustomerEmpty
          body={t("線上預約確認後，顧客會自動加入 CRM。")}
          title={t("尚未有顧客資料")}
        />
      ) : filteredCustomers.length === 0 ? (
        <CustomerEmpty body={t("請調整搜尋文字或標籤篩選。")} title={t("找不到顧客")} />
      ) : (
        <div aria-label={t("顧客清單")} className="merchant-person-grid">
          {filteredCustomers.map((customer) => (
            <CustomerRow
              blacklistEnabled={blacklistEnabled}
              canManage={canManage}
              canReadSensitive={canReadSensitive}
              currency={currency}
              customer={customer}
              customerTags={customerTags}
              depositsEnabled={depositsEnabled}
              isSubmitting={isSubmitting}
              key={customer.id}
              onCreateNote={onCreateNote}
              onSetTag={onSetTag}
              onUpdateCustomer={onUpdateCustomer}
              timezone={timezone}
              feedback={feedback}
              error={error}
            />
          ))}
        </div>
      )}
      {remote.data && <MerchantPager page={page} total={remote.data.total} size={8} onChange={setPage}/>}
    </div>
  );
}

function CustomerRow({
  customer,
  customerTags,
  currency,
  timezone,
  canManage,
  canReadSensitive,
  depositsEnabled,
  blacklistEnabled,
  isSubmitting,
  onUpdateCustomer,
  onSetTag,
  onCreateNote,
  feedback,
  error,
}: {
  customer: Customer;
  customerTags: CustomerTag[];
  currency: string;
  timezone: string;
  canManage: boolean;
  canReadSensitive: boolean;
  depositsEnabled: boolean;
  blacklistEnabled: boolean;
  isSubmitting: boolean;
  feedback: string | null;
  error: string | null;
  onUpdateCustomer: (
    customerId: string,
    update: CustomerProfileUpdate,
  ) => Promise<void>;
  onSetTag: (input: {
    customerId: string;
    tagId: string;
    assigned: boolean;
  }) => Promise<void>;
  onCreateNote: (input: {
    customerId: string;
    note: string;
    sensitivity: "STANDARD" | "SENSITIVE";
  }) => Promise<boolean>;
}) {
  const {t, errorText} = useLanguage();
  const [open, setOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [sensitivity, setSensitivity] = useState("STANDARD");
  const [tagIdDraft, setTagIdDraft] = useState("");
  const unassignedTags = customerTags.filter(
    (tag) => !customer.tags.some((assigned) => assigned.id === tag.id),
  );

  async function assignTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const tagId = String(form.get("tagId") ?? "");
    if (tagId) {
      await onSetTag({ customerId: customer.id, tagId, assigned: true });
    }
  }

  async function submitNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const created = await onCreateNote({
      customerId: customer.id,
      note: String(form.get("note") ?? ""),
      sensitivity: String(form.get("sensitivity")) as
        | "STANDARD"
        | "SENSITIVE",
    });
    if (created) {
      formElement.reset();
      setNoteDraft("");
      setSensitivity("STANDARD");
    }
  }

  return (
    <Dialog open={open} onOpenChange={next => {if (!isSubmitting) setOpen(next);}}>
      <DialogTrigger asChild><button type="button" className="customer-list-row merchant-person-card" aria-label={`${t("顧客詳細資料")} ${customer.displayName}`}>
        <span className="merchant-person-heading">
        <span className="customer-avatar" aria-hidden="true">{Array.from(customer.displayName)[0]}</span>
        <span className="merchant-person-identity"><strong>{customer.displayName}</strong>
          <small>{customer.phone ?? (canReadSensitive ? t("未提供手機") : t("聯絡資料受限"))}</small>
        </span>
        <ChevronRight size={18} aria-hidden="true"/>
        </span>
        <span className="merchant-person-tags">
          {customer.isBlacklisted && <span className="merchant-person-warning">{t("黑名單")}</span>}
          {customer.tags.slice(0,3).map(tag=><span key={tag.id}>{tag.name}</span>)}
          {customer.tags.length>3 && <span>+{customer.tags.length-3}</span>}
          {customer.noShowCount>0 && <span>{t("爽約")} {customer.noShowCount}</span>}
        </span>
        <span className="merchant-person-foot"><span>{t("完成")} <strong>{customer.completedCount}</strong></span><strong>{formatMoney(Number(customer.totalSpendMinor), currency)}</strong></span>
      </button></DialogTrigger>
      <DialogContent className="customer-detail-dialog !max-w-2xl !rounded-lg" showCloseButton={false} aria-describedby={undefined}
        onInteractOutside={event => {if (isSubmitting) event.preventDefault();}} onEscapeKeyDown={event => {if (isSubmitting) event.preventDefault();}}>
        <div className="customer-detail-heading"><DialogTitle>{t("顧客詳細資料")}</DialogTitle><div className="flex items-center gap-1">
          <LanguageSwitcher compact/><DialogClose asChild><button type="button" className="utility-icon" disabled={isSubmitting} aria-label={t("關閉")} title={t("關閉")}><X size={20} aria-hidden="true"/></button></DialogClose>
        </div></div>
        <article className="customer-detail-body">
          {error && <p role="alert" className="mb-3 border-l-4 border-red-600 bg-red-50 p-3 text-red-700">{errorText(error)}</p>}
          {feedback && !error && <p role="status" className="mb-3 border-l-4 border-teal bg-teal/10 p-3">{t(feedback)}</p>}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-ink">{customer.displayName}</p>
            {customer.isBlacklisted ? (
              <span className="rounded bg-red-100 px-2 py-1 text-xs font-semibold text-red-700"> {t("黑名單")} </span>
            ) : null}
            {customer.tags.map((tag) => (
              <TagBadge key={tag.id} tag={tag} />
            ))}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {customer.phone ??
              (canReadSensitive ? t("未提供手機") : t("聯絡資料受限"))}
          </p>
        </div>
        <p className="text-lg font-semibold text-ink">
          {formatMoney(Number(customer.totalSpendMinor), currency)}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs sm:text-sm">
        <span className="rounded-md bg-emerald-50 px-2 py-2 text-emerald-800"> {t("完成")} {customer.completedCount}
        </span>
        <span className="rounded-md bg-amber-50 px-2 py-2 text-amber-800"> {t("取消")} {customer.cancelledCount}
        </span>
        <span className="rounded-md bg-red-50 px-2 py-2 text-red-700"> {t("爽約")} {customer.noShowCount}
        </span>
      </div>

      <div className="mt-4 grid gap-4 border-t border-slate-100 pt-4 md:grid-cols-[minmax(150px,0.8fr)_minmax(190px,1fr)_auto] md:items-end">
        <label>
          <span className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            <Cake aria-hidden="true" className="h-4 w-4" /> {t("會員生日")} </span>
          <input
            className="mt-2 h-11 w-full rounded-md border border-slate-300 px-3 text-sm"
            defaultValue={customer.birthday ?? ""}
            disabled={!canManage || isSubmitting}
            type="date"
            onBlur={(event) => {
              if (event.target.value !== (customer.birthday ?? "")) {
                void onUpdateCustomer(customer.id, {
                  birthday: event.target.value,
                });
              }
            }}
          />
        </label>
        <label>
          <span className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            <BadgeDollarSign aria-hidden="true" className="h-4 w-4" /> {t("此顧客訂金規則")} </span>
          <select
            className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm disabled:bg-slate-100"
            disabled={!canManage || !depositsEnabled || isSubmitting}
            value={customer.depositMode}
            onChange={(event) =>
              void onUpdateCustomer(customer.id, {
                depositMode: event.target.value as
                  | "DEFAULT"
                  | "REQUIRED"
                  | "EXEMPT",
              })
            }
          >
            <option value="DEFAULT"> {t("依分店設定")} </option>
            <option value="REQUIRED"> {t("指定收取訂金")} </option>
            <option value="EXEMPT"> {t("免收訂金")} </option>
          </select>
        </label>
        {canManage && blacklistEnabled ? (
          <button
            className={`flex h-11 items-center justify-center gap-2 rounded-md border px-3 text-sm font-semibold ${
              customer.isBlacklisted
                ? "border-slate-300 text-slate-700"
                : "border-red-200 text-red-700"
            }`}
            disabled={isSubmitting}
            type="button"
            onClick={() => {
              if (customer.isBlacklisted) {
                if (window.confirm(t("確定將此顧客移出黑名單？"))) {
                  void onUpdateCustomer(customer.id, {
                    isBlacklisted: false,
                  });
                }
                return;
              }
              const reason = window
                .prompt(t("請輸入列入黑名單原因："))
                ?.trim();
              if (reason) {
                void onUpdateCustomer(customer.id, {
                  isBlacklisted: true,
                  blacklistReason: reason,
                });
              }
            }}
          >
            <ShieldBan aria-hidden="true" className="h-4 w-4" />
            {customer.isBlacklisted ? t("移出黑名單") : t("列入黑名單")}
          </button>
        ) : null}
      </div>

      {customer.blacklistReason ? (
        <p className="mt-3 text-xs text-red-700"> {t("黑名單原因：")} {customer.blacklistReason}
        </p>
      ) : null}

      <details className="group mt-4 border-t border-slate-100 pt-1">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-2 text-sm font-semibold text-ink">
          <span className="flex items-center gap-2">
            <NotebookPen aria-hidden="true" className="h-4 w-4 text-teal" /> {t("顧客紀錄與標籤")} </span>
          <ChevronDown
            aria-hidden="true"
            className="h-4 w-4 text-slate-400 transition group-open:rotate-180"
          />
        </summary>
        <div className="grid gap-6 pb-2 pt-3 lg:grid-cols-2">
          <section aria-label={t("顧客標籤")}>
            <h3 className="text-xs font-semibold text-slate-600"> {t("顧客標籤")} </h3>
            <div className="mt-3 flex min-h-8 flex-wrap gap-2">
              {customer.tags.length === 0 ? (
                <span className="text-sm text-slate-400"> {t("尚未設定")} </span>
              ) : (
                customer.tags.map((tag) => (
                  <span
                    className="inline-flex items-center gap-1 rounded bg-slate-100 pl-2 text-xs font-semibold text-slate-700"
                    key={tag.id}
                  >
                    <span
                      aria-hidden="true"
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: tag.color ?? "#64748b" }}
                    />
                    {tag.name}
                    {canManage ? (
                      <button
                        aria-label={`${t("移除")} ${tag.name} ${t("顧客標籤")}`}
                        className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-200 hover:text-ink"
                        disabled={isSubmitting}
                        title={`${t("移除")} ${tag.name} ${t("顧客標籤")}`}
                        type="button"
                        onClick={() =>
                          void onSetTag({
                            customerId: customer.id,
                            tagId: tag.id,
                            assigned: false,
                          })
                        }
                      >
                        <X aria-hidden="true" className="h-4 w-4" />
                      </button>
                    ) : null}
                  </span>
                ))
              )}
            </div>
            {canManage && unassignedTags.length > 0 ? (
              <form
                className="mt-3 flex flex-col gap-2 sm:flex-row"
                onSubmit={(event) => void assignTag(event)}
              >
                <label className="min-w-0 flex-1">
                  <span className="sr-only"> {t("選擇顧客標籤")} </span>
                  <select
                    className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                    name="tagId"
                    value={tagIdDraft || unassignedTags[0]?.id || ""}
                    onChange={event => setTagIdDraft(event.target.value)}
                  >
                    {unassignedTags.map((tag) => (
                      <option key={tag.id} value={tag.id}>
                        {tag.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="flex h-11 items-center justify-center gap-2 rounded-md border border-slate-300 px-4 text-sm font-semibold text-ink"
                  disabled={isSubmitting}
                  type="submit"
                >
                  <Plus aria-hidden="true" className="h-4 w-4" /> {t("加入標籤")} </button>
              </form>
            ) : null}
          </section>

          <section aria-label={t("顧客備註")}>
            <h3 className="text-xs font-semibold text-slate-600"> {t("最近備註")} </h3>
            <div className="mt-3 divide-y divide-slate-100 border-y border-slate-100">
              {customer.notes.length === 0 ? (
                <p className="py-3 text-sm text-slate-400"> {t("尚未有備註")} </p>
              ) : (
                customer.notes.map((note) => (
                  <div className="py-3" key={note.id}>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                      <span>{note.authorName}</span>
                      <span>
                        {formatLocalMonthDayTime(note.createdAt, timezone)}
                      </span>
                      {note.sensitivity !== "STANDARD" ? (
                        <span className="font-semibold text-amber-700">
                          {note.sensitivity === "MEDICAL" ? t("醫療") : t("敏感")}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
                      {note.note}
                    </p>
                  </div>
                ))
              )}
            </div>
            {canManage ? (
              <form
                className="mt-3 grid gap-2"
                onSubmit={(event) => void submitNote(event)}
              >
                <label>
                  <span className="sr-only"> {t("新增顧客備註")} </span>
                  <textarea
                    className="min-h-24 w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm"
                    maxLength={2_000}
                    name="note"
                    value={noteDraft}
                    onChange={event => setNoteDraft(event.target.value)}
                    placeholder={t("新增顧客備註")}
                    required
                  />
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <label className="min-w-0 flex-1">
                    <span className="sr-only"> {t("備註敏感層級")} </span>
                    <select
                      className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                      name="sensitivity"
                      value={sensitivity}
                      onChange={event => setSensitivity(event.target.value)}
                    >
                      <option value="STANDARD"> {t("一般備註")} </option>
                      {canReadSensitive ? (
                        <option value="SENSITIVE"> {t("敏感備註")} </option>
                      ) : null}
                    </select>
                  </label>
                  <button
                    className="h-11 rounded-md bg-teal px-4 text-sm font-semibold text-white disabled:opacity-50"
                    disabled={isSubmitting}
                    type="submit"
                  > {t("新增備註")} </button>
                </div>
              </form>
            ) : null}
          </section>
        </div>
      </details>
        </article>
      </DialogContent>
    </Dialog>
  );
}

function CustomerField({
  label,
  name,
  required = false,
  type = "text",
}: {
  label: string;
  name: string;
  required?: boolean;
  type?: string;
}) {
  const {t} = useLanguage();
  return (
    <label>
      <span className="block text-xs font-semibold text-slate-600">
        {t(label)}
      </span>
      <input
        className="mt-2 h-11 w-full rounded-md border border-slate-300 px-3 text-sm"
        name={name}
        required={required}
        type={type}
      />
    </label>
  );
}

function CustomerEmpty({ title, body }: { title: string; body: string }) {
  const {t} = useLanguage();
  return (
    <div className="border-y border-slate-200 bg-white px-4 py-10 text-center">
      <p className="font-semibold text-ink">{t(title)}</p>
      <p className="mt-2 text-sm text-slate-500">{t(body)}</p>
    </div>
  );
}
