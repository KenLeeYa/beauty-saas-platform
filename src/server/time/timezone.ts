const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;

type DateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function parseDate(date: string): {
  year: number;
  month: number;
  day: number;
} {
  if (!DATE_PATTERN.test(date)) {
    throw new Error("INVALID_LOCAL_DATE");
  }
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day };
}

function parseTime(time: string): {
  hour: number;
  minute: number;
} {
  if (!TIME_PATTERN.test(time)) {
    throw new Error("INVALID_LOCAL_TIME");
  }
  const [hour, minute] = time.split(":").map(Number);
  if (hour > 23 || minute > 59) {
    throw new Error("INVALID_LOCAL_TIME");
  }
  return { hour, minute };
}

function partsInTimeZone(date: Date, timeZone: string): DateTimeParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = new Map(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );

  return {
    year: values.get("year") ?? 0,
    month: values.get("month") ?? 0,
    day: values.get("day") ?? 0,
    hour: values.get("hour") ?? 0,
    minute: values.get("minute") ?? 0,
    second: values.get("second") ?? 0,
  };
}

function partsAsUtc(parts: DateTimeParts): number {
  return Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
}

export function zonedDateTimeToUtc(
  date: string,
  time: string,
  timeZone: string,
): Date {
  const dateParts = parseDate(date);
  const timeParts = parseTime(time);
  const desiredUtc = Date.UTC(
    dateParts.year,
    dateParts.month - 1,
    dateParts.day,
    timeParts.hour,
    timeParts.minute,
  );
  let candidate = desiredUtc;

  for (let iteration = 0; iteration < 3; iteration += 1) {
    const observed = partsAsUtc(
      partsInTimeZone(new Date(candidate), timeZone),
    );
    const difference = desiredUtc - observed;
    candidate += difference;
    if (difference === 0) {
      break;
    }
  }

  return new Date(candidate);
}

export function formatDateInTimeZone(date: Date, timeZone: string): string {
  const parts = partsInTimeZone(date, timeZone);
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function formatTimeInTimeZone(date: Date, timeZone: string): string {
  const parts = partsInTimeZone(date, timeZone);
  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

export function addLocalDays(date: string, days: number): string {
  const parts = parseDate(date);
  const shifted = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + days, 12),
  );
  return shifted.toISOString().slice(0, 10);
}

export function localDayOfWeek(date: string): number {
  const parts = parseDate(date);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12)).getUTCDay();
}

export function databaseTimeToString(value: Date): string {
  return `${String(value.getUTCHours()).padStart(2, "0")}:${String(value.getUTCMinutes()).padStart(2, "0")}`;
}
