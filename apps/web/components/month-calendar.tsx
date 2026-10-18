"use client";

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
import { useEffect, useMemo, useState } from "react";

export type MonthCalendarDay = {
  date: string;
  availableCount: number;
  bookedCount: number;
  closedCount: number;
};

const weekdayLabels = ["日", "一", "二", "三", "四", "五", "六"];

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
  const firstDate = selectedDate || days[0]?.date || format(new Date(), "yyyy-MM-dd");
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(parseISO(firstDate)));

  useEffect(() => {
    if (selectedDate) {
      setVisibleMonth(startOfMonth(parseISO(selectedDate)));
    }
  }, [selectedDate]);

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
    <section aria-label="月曆" className="min-w-0">
      <div className="flex h-12 items-center justify-between border-b border-slate-200 px-1">
        <button
          aria-label="上一個月"
          className="flex h-9 w-9 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
          disabled={!canGoPrevious}
          title="上一個月"
          type="button"
          onClick={() => setVisibleMonth((current) => subMonths(current, 1))}
        >
          <ChevronLeft aria-hidden="true" className="h-5 w-5" />
        </button>
        <h2 className="text-base font-semibold text-ink">{format(visibleMonth, "yyyy 年 M 月")}</h2>
        <button
          aria-label="下一個月"
          className="flex h-9 w-9 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
          disabled={!canGoNext}
          title="下一個月"
          type="button"
          onClick={() => setVisibleMonth((current) => addMonths(current, 1))}
        >
          <ChevronRight aria-hidden="true" className="h-5 w-5" />
        </button>
      </div>

      <div className="grid grid-cols-7 border-b border-slate-200">
        {weekdayLabels.map((label) => (
          <div key={label} className="flex h-9 items-center justify-center text-xs font-semibold text-slate-400">
            {label}
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
          const statusLabel =
            audience === "merchant"
              ? day
                ? `${day.bookedCount} 筆預約`
                : ""
              : day
                ? isBookable
                  ? `${day.availableCount} 個可約`
                  : "已額滿"
                : "";

          return (
            <button
              key={dateKey}
              aria-label={`${format(date, "M 月 d 日")}${statusLabel ? `，${statusLabel}` : ""}`}
              className={`relative flex min-h-16 flex-col border-b border-r border-slate-200 p-1.5 text-left transition sm:aspect-square sm:min-h-20 sm:p-2 ${
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
              <span className="text-xs font-semibold sm:text-sm">{format(date, "d")}</span>
              {day && isCurrentMonth ? (
                <span className={`mt-auto text-[10px] font-medium sm:text-xs ${isSelected ? "text-white/80" : isBookable ? "text-teal" : "text-slate-400"}`}>
                  {statusLabel}
                </span>
              ) : null}
              {audience === "merchant" && day && day.availableCount > 0 ? (
                <span
                  aria-hidden="true"
                  className={`absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full ${isSelected ? "bg-white" : "bg-emerald-500"}`}
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}
