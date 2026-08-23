export type CalendarEvent = {
  uid: string;
  start: Date | string;
  end?: Date | string;
  summary: string;
  description?: string;
  url?: string;
  categories?: string[];
};

export type Calendar = {
  name: string;
  description: string;
  refreshHours: number;
  events: CalendarEvent[];
};

const CRLF = "\r\n";
const FOLD_OCTETS = 73;
const encoder = new TextEncoder();

function escapeText(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replaceAll(/\r?\n/gu, "\\n");
}

function fold(line: string) {
  let folded = "";
  let width = 0;

  for (const character of line) {
    const size = encoder.encode(character).length;

    if (width + size > FOLD_OCTETS) {
      folded += `${CRLF} `;
      width = 1;
    }

    folded += character;
    width += size;
  }

  return folded;
}

function stamp(value: Date) {
  return `${value.toISOString().replaceAll(/[-:]/gu, "").slice(0, 15)}Z`;
}

function dayStamp(value: string) {
  return value.slice(0, 10).replaceAll("-", "");
}

function nextDay(value: string) {
  const day = new Date(`${value.slice(0, 10)}T00:00:00Z`);

  day.setUTCDate(day.getUTCDate() + 1);

  return day.toISOString().slice(0, 10);
}

function moment(property: string, value: Date | string) {
  return value instanceof Date
    ? `${property}:${stamp(value)}`
    : `${property};VALUE=DATE:${dayStamp(value)}`;
}

function eventLines(event: CalendarEvent, now: Date) {
  const end =
    event.end ??
    (event.start instanceof Date
      ? new Date(event.start.getTime() + 3_600_000)
      : nextDay(event.start));

  return [
    "BEGIN:VEVENT",
    `UID:${escapeText(event.uid)}`,
    `DTSTAMP:${stamp(now)}`,
    moment("DTSTART", event.start),
    moment("DTEND", end),
    `SUMMARY:${escapeText(event.summary)}`,
    ...(event.description ? [`DESCRIPTION:${escapeText(event.description)}`] : []),
    ...(event.url ? [`URL;VALUE=URI:${escapeText(event.url)}`] : []),
    ...(event.categories?.length
      ? [`CATEGORIES:${event.categories.map(escapeText).join(",")}`]
      : []),
    "TRANSP:TRANSPARENT",
    "END:VEVENT",
  ];
}

export function buildCalendar(calendar: Calendar) {
  const now = new Date();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Marquee//Diary//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `NAME:${escapeText(calendar.name)}`,
    `X-WR-CALNAME:${escapeText(calendar.name)}`,
    `DESCRIPTION:${escapeText(calendar.description)}`,
    `X-WR-CALDESC:${escapeText(calendar.description)}`,
    `REFRESH-INTERVAL;VALUE=DURATION:PT${calendar.refreshHours}H`,
    `X-PUBLISHED-TTL:PT${calendar.refreshHours}H`,
    ...calendar.events.flatMap((event) => eventLines(event, now)),
    "END:VCALENDAR",
  ];

  return `${lines.map(fold).join(CRLF)}${CRLF}`;
}
