export function utcDay(value: Date = new Date()) {
  return value.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

export function daysBetween(startDate: string, endDate: string) {
  return Math.round(
    (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000,
  );
}

export function startOfHour(value: Date = new Date()) {
  return `${value.toISOString().slice(0, 13)}:00:00Z`;
}

export function hoursFrom(iso: string, hours: number) {
  return new Date(Date.parse(iso) + hours * 3_600_000).toISOString();
}
