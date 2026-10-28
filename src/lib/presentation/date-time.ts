type DatePart =
  | "year"
  | "month"
  | "day"
  | "hour"
  | "minute";

function dateParts(
  value: string | Date,
  timeZone: string,
  includeTime: boolean,
): Readonly<Record<DatePart, string>> {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(includeTime
      ? {
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23" as const,
        }
      : {}),
  }).formatToParts(new Date(value));
  const values = new Map(parts.map((part) => [part.type, part.value]));

  return {
    year: values.get("year") ?? "",
    month: values.get("month") ?? "",
    day: values.get("day") ?? "",
    hour: values.get("hour") ?? "",
    minute: values.get("minute") ?? "",
  };
}

export function formatLocalDate(
  value: string | Date,
  timeZone = "Asia/Taipei",
): string {
  const parts = dateParts(value, timeZone, false);
  return `${parts.year}/${parts.month}/${parts.day}`;
}

export function formatLocalDateKey(
  value: string | Date,
  timeZone = "Asia/Taipei",
): string {
  const parts = dateParts(value, timeZone, false);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function formatLocalDateTime(
  value: string | Date,
  timeZone = "Asia/Taipei",
): string {
  const parts = dateParts(value, timeZone, true);
  return `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
}

export function formatLocalMonthDayTime(
  value: string | Date,
  timeZone = "Asia/Taipei",
): string {
  const parts = dateParts(value, timeZone, true);
  return `${Number(parts.month)}/${Number(parts.day)} ${parts.hour}:${parts.minute}`;
}

export function formatLocalTime(
  value: string | Date,
  timeZone = "Asia/Taipei",
): string {
  const parts = dateParts(value, timeZone, true);
  return `${parts.hour}:${parts.minute}`;
}
