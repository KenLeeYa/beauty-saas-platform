"use client";

import {useLanguage} from "@/components/language-provider";

import {
  addDays,
  addMonths,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

export type MonthCalendarDay = {
  date: string;
  availableCount: number;
  bookedCount: number;
  closedCount: number;
  scheduleMode?: "NORMAL" | "CUSTOM" | "CLOSED";
};

const scheduleIndicators = {
  NORMAL: {label: "一般營業", color: "bg-emerald-500"},
  CUSTOM: {label: "自訂時段", color: "bg-amber-500"},
  CLOSED: {label: "整日關閉", color: "bg-rose-500"},
};

function monthKey(date: Date): string {
  return format(date, "yyyy-MM");
}

export function MonthCalendar({
  days,
  selectedDate,
  audience,
  onSelectDate
}: {
  days: MonthCalendarDay[];
  selectedDate: string;
  audience: "merchant" | "customer";
  onSelectDate: (date: string) => void;
}) {
  const {t, locale} = useLanguage();
  const weekdayLabels = Array.from({length: 7}, (_, day) =>
    new Intl.DateTimeFormat(locale, {weekday: 'short'}).format(new Date(2026, 0, 4 + day)));
  const dateLabel = (date: Date) => new Intl.DateTimeFormat(locale, {month: 'short', day: 'numeric'}).format(date);
  const firstDate = selectedDate || days[0]?.date || format(new Date(), "yyyy-MM-dd");
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(parseISO(firstDate)));

  const dayMap = useMemo(() => new Map(days.map((day) => [day.date, day])), [days]);
  const availableMonths = useMemo(() => Array.from(new Set(days.map((day) => day.date.slice(0, 7)))).sort(), [days]);
  const currentMonthKey = monthKey(visibleMonth);
  const firstAvailableMonth = availableMonths[0];
  const lastAvailableMonth = availableMonths.at(-1);
  const canGoPrevious = Boolean(firstAvailableMonth && currentMonthKey > firstAvailableMonth);
  const canGoNext = Boolean(lastAvailableMonth && currentMonthKey < lastAvailableMonth);

  const calendarDates = useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(visibleMonth), { weekStartsOn: 0 });
    return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  }, [visibleMonth]);

  return (
    <section aria-label={t("月曆")} className="min-w-0">
      <div className="flex h-11 items-center justify-between border-b border-slate-200 px-1 sm:h-12">
        <button
          aria-label={t("上一個月")}
          className="flex h-11 w-11 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-ink disabled:cursor-not-allowed disabled:opacity-30 sm:h-9 sm:w-9"
          disabled={!canGoPrevious}
          title={t("上一個月")}
          type="button"
          onClick={() => setVisibleMonth((current) => subMonths(current, 1))}
        >
          <ChevronLeft aria-hidden="true" className="h-5 w-5" />
        </button>
        <h2 className="min-w-0 text-center text-base font-semibold text-ink">{new Intl.DateTimeFormat(locale, {year: 'numeric', month: 'long'}).format(visibleMonth)}</h2>
        <button
          aria-label={t("下一個月")}
          className="flex h-11 w-11 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-ink disabled:cursor-not-allowed disabled:opacity-30 sm:h-9 sm:w-9"
          disabled={!canGoNext}
          title={t("下一個月")}
          type="button"
          onClick={() => setVisibleMonth((current) => addMonths(current, 1))}
        >
          <ChevronRight aria-hidden="true" className="h-5 w-5" />
        </button>
      </div>

      <div className="grid grid-cols-7 border-b border-slate-200">
        {weekdayLabels.map((label) => (
          <div key={label} className="flex h-8 items-center justify-center text-xs font-semibold text-slate-400 sm:h-9">
            {t(label)}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 overflow-hidden rounded-b-md border-l border-slate-200">
        {calendarDates.map((date) => {
          const dateKey = format(date, "yyyy-MM-dd");
          const day = dayMap.get(dateKey);
          const isCurrentMonth = isSameMonth(date, visibleMonth);
          const isSelected = dateKey === selectedDate;
          const isBookable = Boolean(day?.availableCount);
          const mode = day?.scheduleMode ?? (day?.closedCount ? "CLOSED" : "NORMAL");
          const indicator = scheduleIndicators[mode];
          const statusLabel =
            audience === "merchant"
              ? day
                ? `${day.bookedCount} ${t("筆預約")}, ${t(indicator.label)}`
                : ""
              : day
                ? isBookable
                  ? t("可查詢")
                  : t("休息")
                : "";

          return (
            <button
              key={dateKey}
              aria-label={`${dateLabel(date)}${statusLabel ? `, ${statusLabel}` : ""}`}
              aria-pressed={isSelected}
              data-date={dateKey}
              className={`relative flex min-h-12 flex-col border-b border-r border-slate-200 p-1 text-left transition sm:aspect-square sm:min-h-20 sm:p-2 ${
                isSelected
                  ? "bg-ink text-white"
                  : day && isCurrentMonth
                    ? "bg-white text-ink hover:bg-teal/5"
                    : "cursor-default bg-slate-50 text-slate-300"
              }`}
              disabled={!day || !isCurrentMonth}
              type="button"
              onClick={() => onSelectDate(dateKey)}
            >
              <span className="text-[11px] font-semibold sm:text-sm">{format(date, "d")}</span>
              {day && isCurrentMonth ? (
                <span className={`mt-auto max-w-full break-words text-[10px] font-medium leading-3 sm:text-xs ${isSelected ? "text-white/80" : isBookable ? "text-teal" : "text-slate-400"}`}>
                  <span className="sm:hidden">{audience === 'merchant' ? day.bookedCount : statusLabel}</span>
                  <span className="hidden sm:inline">{audience === "merchant" ? `${day.bookedCount} ${t("筆預約")}` : statusLabel}</span>
                </span>
              ) : null}
              {audience === "merchant" && day && isCurrentMonth ? (
                <span
                  aria-hidden="true"
                  data-schedule-mode={mode}
                  className={`absolute right-1 top-1 h-2 w-2 rounded-full ring-1 ring-white sm:right-1.5 sm:top-1.5 ${indicator.color}`}
                />
              ) : null}
            </button>
          );
        })}
      </div>
      {audience === "merchant" && <div className="flex flex-wrap gap-x-4 gap-y-2 py-3 text-xs text-slate-600">
        {Object.entries(scheduleIndicators).map(([key, indicator]) => <span key={key} className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${indicator.color}`}/>{t(indicator.label)}
        </span>)}
      </div>}
    </section>
  );
}
