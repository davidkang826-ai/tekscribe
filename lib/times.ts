// Shared date/time picker helpers: an Apple-style time list in 5-minute
// increments (a native <select>, which iOS renders as a scroll wheel).

export type TimeOption = { value: string; label: string };

/** 288 options from 12:00 AM to 11:55 PM, value "HH:MM" (24h). */
export const TIME_OPTIONS: TimeOption[] = Array.from(
  { length: 24 * 12 },
  (_, i) => {
    const h = Math.floor(i / 12);
    const m = (i % 12) * 5;
    const value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    const h12 = h % 12 === 0 ? 12 : h % 12;
    const label = `${h12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
    return { value, label };
  }
);

/** A Date as the value an <input type="date"> wants (local time). */
export function dateInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local Date from a date input value + a TIME_OPTIONS value. */
export function combineDateTime(date: string, time: string): Date {
  return new Date(`${date}T${time}:00`);
}
