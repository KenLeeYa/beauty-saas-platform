import {renderToStaticMarkup} from "react-dom/server";
import {expect, it} from "vitest";
import {MonthCalendar} from "./month-calendar";

it("shows each saved schedule mode without replacing its lamp on selection", () => {
  const days = [
    {date:"2026-10-27", availableCount:1, bookedCount:2, closedCount:0, scheduleMode:"NORMAL" as const},
    {date:"2026-10-28", availableCount:1, bookedCount:1, closedCount:0, scheduleMode:"CUSTOM" as const},
    {date:"2026-10-29", availableCount:0, bookedCount:0, closedCount:1, scheduleMode:"CLOSED" as const},
  ];
  for (const selectedDate of days.map(day => day.date)) {
    const html = renderToStaticMarkup(<MonthCalendar days={days} selectedDate={selectedDate} audience="merchant" onSelectDate={()=>{}}/>);
    for (const mode of ["NORMAL", "CUSTOM", "CLOSED"]) expect(html).toContain(`data-schedule-mode="${mode}"`);
    for (const label of ["一般營業", "自訂時段", "整日關閉"]) expect(html).toContain(label);
    expect(html).not.toContain("bg-white\" data-schedule");
  }
});
