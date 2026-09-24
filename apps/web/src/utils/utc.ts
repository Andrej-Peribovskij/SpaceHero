export function utcDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function utcTimeStr(d: Date): string {
  return d.toISOString().slice(11, 16);
}

export function parseCalendarDate(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00Z`);
}

export function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

export function endOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setUTCHours(23, 59, 59, 999);
  return copy;
}
