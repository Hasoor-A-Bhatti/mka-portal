/**
 * Reads a group's travel list from a file the AeK drops on their link:
 * Excel (.xlsx/.xls/.ods), CSV, or a PDF with selectable text.
 *
 * Runs in the browser only. The parsers are loaded on demand, so the AeK page
 * stays light until someone actually drops a file. Nothing is sent anywhere
 * here: the people found are shown for the AeK to check before they go onto
 * the list.
 *
 * How it reads a file:
 *   1. Turn it into rows of cells, each with a horizontal position (the column
 *      number for spreadsheets, the x position on the page for PDFs).
 *   2. Look for a header row ("Name", "Arrival date", "Flight", …), including
 *      two-row headers ("Arrival" over "Date | Time | Flight").
 *   3. If there is one, read each row by column. If not, read each line as
 *      text, picking out the name, dates, times, flight numbers and airports.
 * Anything not in the file is left blank.
 */

export type ImportedPerson = {
  full_name: string;
  arrival_date: string;
  arrival_time: string;
  arrival_flight: string;
  arrival_place: string;
  departure_date: string;
  departure_time: string;
  departure_flight: string;
  departure_place: string;
};

export type ImportResult = { people: ImportedPerson[]; fileName: string };

export class ImportError extends Error {}

export const IMPORT_ACCEPT = ".xlsx,.xlsm,.xls,.ods,.csv,.tsv,.txt,.pdf";
const SHEET_EXT = new Set(["xlsx", "xlsm", "xls", "ods", "csv", "tsv", "txt"]);
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 3000;

type Leg = "arrival" | "departure";
type Part = "date" | "time" | "flight" | "place";
type Cell = { text: string; x0: number; x1: number };
type Row = Cell[];
/** `grid` rows come from a spreadsheet: cells sit exactly in numbered columns. */
type Sheet = { rows: Row[]; grid: boolean };

const blankPerson = (): ImportedPerson => ({
  full_name: "",
  arrival_date: "",
  arrival_time: "",
  arrival_flight: "",
  arrival_place: "",
  departure_date: "",
  departure_time: "",
  departure_flight: "",
  departure_place: "",
});

/** Same person, however the name is written ("AHMAD  Khan" = "Ahmad Khan"). */
export const nameKey = (name: string) =>
  name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z؀-ۿ]+/g, " ")
    .trim();

export async function readGroupFile(file: File, year: number): Promise<ImportResult> {
  if (file.size > MAX_BYTES) throw new ImportError(`${file.name} is over 10 MB.`);
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const isPdf = ext === "pdf" || file.type === "application/pdf";
  if (!isPdf && !SHEET_EXT.has(ext)) throw new ImportError("Please choose an Excel, CSV or PDF file.");

  let sheets: Sheet[];
  try {
    sheets = isPdf ? [await pdfSheet(file)] : await spreadsheetSheets(file, ext);
  } catch (e) {
    if (e instanceof ImportError) throw e;
    throw new ImportError(`We couldn't open ${file.name}. It may be damaged or password protected.`);
  }

  // A workbook can have several sheets: use the one with the most people on it.
  let best: ImportedPerson[] = [];
  for (const s of sheets) {
    const people = extract(s, year);
    if (people.length > best.length) best = people;
  }
  if (!best.length) {
    throw new ImportError(
      isPdf
        ? "We couldn't find any names in this PDF. If it's a scan or a photo, please use an Excel or CSV list instead, or add people below."
        : "We couldn't find any names in this file. A column headed “Name” helps us find them.",
    );
  }
  return { people: best, fileName: file.name };
}

// ---------- Reading files into rows ----------

async function spreadsheetSheets(file: File, ext: string): Promise<Sheet[]> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  // raw: keep text files' values as written (so 03/08 isn't read the American way).
  // cellNF: keep each cell's number format, to tell dates and times from numbers.
  const wb = XLSX.read(buf, { raw: true, cellNF: true, dense: false, ...(ext === "tsv" ? { FS: "\t" } : {}) });
  return wb.SheetNames.map((n) => {
    const ws = wb.Sheets[n];
    const ref = ws?.["!ref"];
    if (!ref) return { rows: [], grid: true };
    const range = XLSX.utils.decode_range(ref);
    const rows: Row[] = [];
    for (let r = range.s.r; r <= range.e.r && rows.length < MAX_ROWS; r++) {
      const row: Row = [];
      for (let c = range.s.c; c <= Math.min(range.e.c, range.s.c + 80); c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (!cell) continue;
        let text = "";
        if (cell.t === "n" && typeof cell.v === "number" && cell.z && XLSX.SSF.is_date(String(cell.z))) {
          // A real Excel date or time: read it without any time zone shifting.
          const d = XLSX.SSF.parse_date_code(cell.v);
          const day = cell.v >= 1 ? `${d.y}-${pad(d.m)}-${pad(d.d)}` : "";
          const time = cell.v % 1 > 0.0001 ? `${pad(d.H)}:${pad(d.M)}` : "";
          text = [day, time].filter(Boolean).join(" ");
        } else {
          text = String(cell.w ?? cell.v ?? "");
        }
        text = clean(text);
        if (text) row.push({ text, x0: c, x1: c + 1 });
      }
      if (row.length) rows.push(row);
    }
    return { rows, grid: true };
  });
}

async function pdfSheet(file: File): Promise<Sheet> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc ||= new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
  const doc = await pdfjs
    .getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, disableFontFace: true })
    .promise.catch((e: unknown) => {
      if (e && typeof e === "object" && "name" in e && e.name === "PasswordException") {
        throw new ImportError("This PDF is password protected. Please remove the password, or use an Excel or CSV list.");
      }
      throw e;
    });

  const rows: Row[] = [];
  try {
    for (let p = 1; p <= Math.min(doc.numPages, 60) && rows.length < MAX_ROWS; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      type Item = { str: string; x: number; y: number; w: number; h: number };
      const items: Item[] = [];
      for (const it of content.items) {
        if (!("str" in it) || !it.str.trim()) continue;
        const h = Math.abs(it.transform[3]) || it.height || 10;
        items.push({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width, h });
      }
      // Lines: items at (about) the same height, top of the page first.
      items.sort((a, b) => b.y - a.y || a.x - b.x);
      const lines: Item[][] = [];
      for (const it of items) {
        const line = lines[lines.length - 1];
        if (line && Math.abs(line[0].y - it.y) <= Math.max(2, Math.min(line[0].h, it.h) * 0.5)) line.push(it);
        else lines.push([it]);
      }
      // Cells: words close together; a wider gap starts the next column.
      for (const line of lines) {
        line.sort((a, b) => a.x - b.x);
        const row: Row = [];
        let cur: Cell | null = null;
        for (const it of line) {
          const gap = cur ? it.x - cur.x1 : Infinity;
          if (cur && gap < Math.max(4, it.h * 0.8)) {
            cur.text += (gap > it.h * 0.12 ? " " : "") + it.str;
            cur.x1 = Math.max(cur.x1, it.x + it.w);
          } else {
            cur = { text: it.str, x0: it.x, x1: it.x + it.w };
            row.push(cur);
          }
        }
        const cells = row.map((c) => ({ ...c, text: clean(c.text) })).filter((c) => c.text);
        if (cells.length) rows.push(cells);
      }
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }
  return { rows, grid: false };
}

// ---------- Finding the header ----------

type Kind = "name" | "first" | "last" | "date" | "time" | "datetime" | "flight" | "place" | "mixed" | "skip";
type Column = { x0: number; x1: number; text: string; kind: Kind | null; leg: Leg | null };

const has = (s: string, re: RegExp) => re.test(s);

function classify(label: string): { kind: Kind | null; leg: Leg | null } {
  const s = ` ${label.toLowerCase().replace(/[^a-z0-9#]+/g, " ").trim()} `;
  const leg: Leg | null = has(s, / (arr|arrival|arrivals|arriving|arrive|arrives|inbound|incoming|landing|lands|eta|sta) /) || has(s, / to (the )?(uk|london|england|britain) /)
    ? "arrival"
    : has(s, / (dep|departure|departures|departing|depart|departs|return|returning|outbound|outgoing|leaving|leave|leaves|etd|std|back|homeward) /)
      ? "departure"
      : null;

  // Columns we never want, even if they mention a date or a name.
  if (has(s, / (birth|dob|passport|visa|expiry|expiration|issued|issue|age|gender|sex|email|mail|phone|mobile|tel|telephone|whatsapp|contact|emergency|address|father|mother|guardian|spouse|nationality|seat|pnr|booking|ticket|room|hotel|jamaat|majlis|aims|id) /)) {
    return { kind: "skip", leg };
  }
  const notAName = has(s, / (flight|airline|airport|carrier|terminal|city|country|station) /);
  if (!notAName && has(s, / (first|given|fore) ?names? | forenames? /)) return { kind: "first", leg };
  if (!notAName && has(s, / (last|family|sur) ?names? | surnames? /)) return { kind: "last", leg };
  if (!notAName && has(s, / (name|names|full name|guest|guests|passenger|passengers|pax|traveller|travellers|traveler|travelers|participant|participants|member|members|delegate|delegates|khadim|khuddam|person|people|attendee|attendees|visitor|visitors) /)) {
    return { kind: "name", leg };
  }
  const dateWord = has(s, / (date|dates|day|dated|dt) /);
  const timeWord = has(s, / (time|times|hrs|hour|eta|etd|sta|std) /);
  if (dateWord && timeWord) return { kind: "datetime", leg };
  if (dateWord) return { kind: "date", leg };
  if (timeWord) return { kind: "time", leg };
  if (has(s, / (flight|flights|flt|flight no|airline|carrier|train|coach|bus|ferry|transport) /)) return { kind: "flight", leg };
  if (has(s, / (airport|airports|terminal|port|station|arriving at|leaving from|landing at|arrival point|departure point|point of entry) /)) {
    return { kind: "place", leg };
  }
  if (leg) return { kind: "mixed", leg };
  return { kind: null, leg: null };
}

const mid = (c: { x0: number; x1: number }) => (c.x0 + c.x1) / 2;

/** The label above a cell: the cell over it, or the nearest one to its left (a merged heading). */
function above(row: Row, x: number): Cell | null {
  let best: Cell | null = null;
  for (const c of row) {
    if (c.x0 <= x && x < c.x1) return c;
    if (c.x0 <= x && (!best || c.x0 > best.x0)) best = c;
  }
  return best;
}

const looksLikeData = (row: Row) => row.some((c) => findDates(c.text, 2000).length || findFlights(c.text).length);

function headerColumns(rows: Row[], i: number): Column[] {
  const row = rows[i];
  const top = i > 0 && rows[i - 1].length >= 2 && !looksLikeData(rows[i - 1]) ? rows[i - 1] : null;
  const cols: Column[] = row.map((c) => {
    const own = classify(c.text);
    const t = top ? above(top, mid(c)) : null;
    if (!t) return { x0: c.x0, x1: c.x1, text: c.text, ...own };
    const both = classify(`${t.text} ${c.text}`);
    return { x0: c.x0, x1: c.x1, text: c.text, kind: own.kind ?? both.kind, leg: own.leg ?? both.leg };
  });
  // Headings that span both rows ("Name" merged down) only appear in the top row.
  if (top) {
    for (const t of top) {
      if (row.some((c) => c.x0 < t.x1 && t.x0 < c.x1)) continue;
      cols.push({ x0: t.x0, x1: t.x1, text: t.text, ...classify(t.text) });
    }
  }
  return cols.sort((a, b) => a.x0 - b.x0);
}

function findHeader(rows: Row[]): { at: number; cols: Column[] } | null {
  let best: { at: number; cols: Column[]; score: number } | null = null;
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    if (looksLikeData(rows[i])) continue;
    const cols = headerColumns(rows, i);
    if (!cols.some((c) => c.kind === "name" || c.kind === "first" || c.kind === "last")) continue;
    const score = cols.reduce((n, c) => n + (c.kind === "skip" ? 0.5 : c.kind ? 1 : 0), 0);
    if (!best || score > best.score) best = { at: i, cols, score };
  }
  if (!best) return null;
  assignLegs(best.cols);
  return best;
}

const PARTS: Record<string, Part[]> = {
  date: ["date"],
  time: ["time"],
  datetime: ["date", "time"],
  flight: ["flight"],
  place: ["place"],
  mixed: ["date", "time", "flight", "place"],
};

/** Columns that don't say arrival or return follow the ones before them, arrival first. */
function assignLegs(cols: Column[]) {
  const used: Record<Leg, Set<Part>> = { arrival: new Set(), departure: new Set() };
  const free = (leg: Leg, parts: Part[]) => parts.some((p) => !used[leg].has(p));
  let ctx: Leg | null = null;
  for (const c of cols) {
    const parts = c.kind ? PARTS[c.kind] : undefined;
    if (!parts) continue;
    let leg = c.leg;
    if (!leg) {
      leg = ctx && free(ctx, parts) ? ctx : free("arrival", parts) ? "arrival" : free("departure", parts) ? "departure" : null;
    }
    c.leg = leg;
    if (leg) {
      ctx = leg;
      for (const p of parts) used[leg].add(p);
    }
  }
}

// ---------- Reading people ----------

function extract(sheet: Sheet, year: number): ImportedPerson[] {
  const rows = sheet.rows;
  if (!rows.length) return [];
  const header = findHeader(rows);
  const people = header ? fromTable(rows, header, sheet.grid, year) : fromText(rows, year);
  return dedupe(people);
}

function fromTable(rows: Row[], header: { at: number; cols: Column[] }, grid: boolean, year: number): ImportedPerson[] {
  const cols = header.cols;
  // The stretch of the page each column owns: halfway to its neighbours.
  const bounds = cols.map((c, j) =>
    grid
      ? [c.x0, c.x1]
      : [j === 0 ? -Infinity : (cols[j - 1].x1 + c.x0) / 2, j === cols.length - 1 ? Infinity : (c.x1 + cols[j + 1].x0) / 2],
  );
  const headerNames = new Set(cols.filter((c) => c.kind === "name" || c.kind === "first" || c.kind === "last").map((c) => nameKey(c.text)));

  const people: ImportedPerson[] = [];
  for (let r = header.at + 1; r < rows.length; r++) {
    const vals = new Map<Column, string[]>();
    for (const cell of rows[r]) {
      let best = -1;
      let most = 0;
      bounds.forEach(([lo, hi], j) => {
        const overlap = Math.min(hi, cell.x1) - Math.max(lo, cell.x0);
        if (overlap > most) {
          most = overlap;
          best = j;
        }
      });
      if (best < 0) continue;
      const list = vals.get(cols[best]) ?? [];
      list.push(cell.text);
      vals.set(cols[best], list);
    }
    const text = (k: Kind) =>
      cols
        .filter((c) => c.kind === k)
        .map((c) => vals.get(c)?.join(" ") ?? "")
        .filter(Boolean)
        .join(" ");

    let full = text("name");
    if (!full) {
      const first = text("first");
      const last = text("last");
      full = [first, last].filter(Boolean).join(" ");
    }
    const name = tidyName(full);
    if (!name || headerNames.has(nameKey(name)) || /^(sub ?total|grand total|total|count|sum)\b/i.test(name)) continue;

    const p = blankPerson();
    p.full_name = name;
    // A time written inside a date cell is only used if there's no Time column with one.
    const spare: Partial<Record<Leg, string>> = {};
    for (const c of cols) {
      if (!c.leg || !c.kind || !PARTS[c.kind]) continue;
      const v = vals.get(c)?.join(" ");
      if (!v) continue;
      const got: Partial<Record<Part, string>> = c.kind === "time" ? { time: parseTime(v) } : c.kind === "flight" ? { flight: parseFlight(v) } : c.kind === "place" ? { place: parsePlace(v) } : pull(v, year);
      for (const part of PARTS[c.kind]) {
        const key = `${c.leg}_${part}` as keyof ImportedPerson;
        const value = got[part];
        if (value && !p[key]) p[key] = value;
      }
      // A date column that also has the time in it.
      if (c.kind === "date" && got.time) spare[c.leg] ??= got.time;
    }
    for (const leg of ["arrival", "departure"] as const) if (spare[leg] && !p[`${leg}_time`]) p[`${leg}_time`] = spare[leg];
    people.push(p);
  }
  return people;
}

const NOT_A_PERSON =
  /\b(page|itinerary|schedule|programme|program|delegation|total|list|travel|details|summary|flight|flights|arrival|arrivals|departure|departures|date|time|name|names|airport|terminal|majlis|khuddam|ahmadiyya|jalsa|ijtema|from|to|via)\b/i;

function fromText(rows: Row[], year: number): ImportedPerson[] {
  const people: ImportedPerson[] = [];
  for (const row of rows) {
    const line = row.map((c) => c.text).join("   ");
    const got = pull(line, year);
    const name = tidyName(line.slice(0, got.firstAt));
    if (!name || /\d/.test(name) || NOT_A_PERSON.test(name)) continue;
    const words = name.split(" ").length;
    const any = got.dates.length || got.flights.length || got.times.length;
    if (words > 7 || (!any && words < 2)) continue;
    const p = blankPerson();
    p.full_name = name;
    [p.arrival_date = "", p.departure_date = ""] = got.dates;
    [p.arrival_time = "", p.departure_time = ""] = got.times;
    [p.arrival_flight = "", p.departure_flight = ""] = got.flights;
    [p.arrival_place = "", p.departure_place = ""] = got.places;
    people.push(p);
  }
  return people;
}

/** People listed twice (once per flight, say) become one, with both journeys. */
function dedupe(people: ImportedPerson[]): ImportedPerson[] {
  const byKey = new Map<string, ImportedPerson>();
  for (const p of people) {
    const k = nameKey(p.full_name);
    if (!k) continue;
    const seen = byKey.get(k);
    if (!seen) {
      byKey.set(k, { ...p });
      continue;
    }
    for (const key of Object.keys(p) as (keyof ImportedPerson)[]) if (!seen[key] && p[key]) seen[key] = p[key];
  }
  return [...byKey.values()];
}

// ---------- Values ----------

const pad = (n: number) => String(n).padStart(2, "0");
const clean = (s: string) => s.replace(/[ \s]+/g, " ").trim();

function tidyName(raw: string): string {
  let s = clean(raw)
    .replace(/^[\s#*•\-–.]*\d{1,4}\s*[.)\]:\-–]?\s+/, "") // a list number in front: "12. Ahmad Khan"
    .replace(/[|,;:–\-]+$/, "")
    .trim();
  // Airline style: "KHAN/AHMAD MR" → "Ahmad Khan".
  const slash = s.match(/^([^/]+)\/([^/]+)$/);
  if (slash) s = `${slash[2].replace(/\s+(mr|mrs|ms|miss|mstr|dr|chd|inf)\.?$/i, "")} ${slash[1]}`.trim();
  if (!/\p{L}/u.test(s)) return "";
  // ALL CAPS reads better in title case.
  if (s.length > 3 && s === s.toUpperCase() && /[A-Z]/.test(s)) {
    s = s.toLowerCase().replace(/(^|[\s'’\-.])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());
  }
  return s.slice(0, 120);
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MON = "(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?";

function isoDate(y: number, m: number, d: number): string {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return "";
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 ? `${y}-${pad(m)}-${pad(d)}` : "";
}

type Hit = { at: number; len: number; value: string };

/** UK order (day first) unless that can't be right. */
function dayMonth(a: number, b: number): [number, number] {
  return b > 12 && a <= 12 ? [b, a] : [a, b];
}

function findDates(text: string, year: number): Hit[] {
  const hits: Hit[] = [];
  const scan = (re: RegExp, read: (m: RegExpExecArray) => string) => {
    for (const m of text.matchAll(re)) {
      const value = read(m as RegExpExecArray);
      if (value) hits.push({ at: m.index ?? 0, len: m[0].length, value });
    }
  };
  scan(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/g, (m) => isoDate(+m[1], +m[2], +m[3]));
  scan(/\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4}|\d{2})\b(?![:.]\d)/g, (m) => {
    const [d, mo] = dayMonth(+m[1], +m[2]);
    return isoDate(+m[3], mo, d);
  });
  scan(/\b(\d{1,2})\/(\d{1,2})\b(?![/.\-]\d)/g, (m) => {
    const [d, mo] = dayMonth(+m[1], +m[2]);
    return isoDate(year, mo, d);
  });
  scan(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?[\\s\\-/.]*(?:of\\s+)?${MON}(?:[\\s\\-/.,]+(\\d{4}|\\d{2})(?![:.]\\d))?\\b`, "gi"), (m) =>
    isoDate(m[3] ? +m[3] : year, MONTHS.indexOf(m[2].toLowerCase()) + 1, +m[1]),
  );
  scan(new RegExp(`\\b${MON}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, "gi"), (m) =>
    isoDate(m[3] ? +m[3] : year, MONTHS.indexOf(m[1].toLowerCase()) + 1, +m[2]),
  );
  return nonOverlapping(hits);
}

function findTimes(text: string, strict: boolean): Hit[] {
  const hits: Hit[] = [];
  const to24 = (h: number, min: number, ap?: string) => {
    const p = ap?.toLowerCase().replace(/\./g, "");
    if (p === "pm" && h < 12) h += 12;
    if (p === "am" && h === 12) h = 0;
    return h <= 23 && min <= 59 ? `${pad(h)}:${pad(min)}` : "";
  };
  for (const m of text.matchAll(/\b(\d{1,2})[:.h](\d{2})(?:\s*(am|pm|a\.m\.|p\.m\.))?(?!\d)/gi)) {
    const v = to24(+m[1], +m[2], m[3]);
    if (v) hits.push({ at: m.index ?? 0, len: m[0].length, value: v });
  }
  for (const m of text.matchAll(/\b(\d{1,2})\s*(am|pm)\b/gi)) {
    const v = to24(+m[1], 0, m[2]);
    if (v) hits.push({ at: m.index ?? 0, len: m[0].length, value: v });
  }
  for (const m of text.matchAll(/\b([01]\d|2[0-3])([0-5]\d)\s*(hrs|hours|h)\b/gi)) {
    hits.push({ at: m.index ?? 0, len: m[0].length, value: `${m[1]}:${m[2]}` });
  }
  // "1435" on its own: the whole cell in a Time column, or (in a line of text,
  // once dates and flights are taken out) a lone 4-digit group that isn't part
  // of a longer number such as a phone number.
  const bare = strict && text.match(/^\s*([01]\d|2[0-3])([0-5]\d)\s*$/);
  if (bare) hits.push({ at: 0, len: text.length, value: `${bare[1]}:${bare[2]}` });
  if (!strict) {
    for (const m of text.matchAll(/(?<![\d+()\-] ?)\b([01]\d|2[0-3])([0-5]\d)\b(?! ?[\d\-])/g)) {
      hits.push({ at: m.index ?? 0, len: m[0].length, value: `${m[1]}:${m[2]}` });
    }
  }
  return nonOverlapping(hits);
}

function findFlights(text: string): Hit[] {
  const hits: Hit[] = [];
  for (const m of text.matchAll(/\b([A-Z]{2}|[A-Z]\d|\d[A-Z])\s?-?(\d{1,4})([A-Z])?\b/g)) {
    hits.push({ at: m.index ?? 0, len: m[0].length, value: `${m[1]}${m[2]}${m[3] ?? ""}` });
  }
  return nonOverlapping(hits);
}

const AIRPORTS: Record<string, string> = {
  lhr: "Heathrow",
  heathrow: "Heathrow",
  lgw: "Gatwick",
  gatwick: "Gatwick",
  stn: "Stansted",
  stansted: "Stansted",
  ltn: "Luton",
  luton: "Luton",
  man: "Manchester",
  manchester: "Manchester",
  bhx: "Birmingham",
  birmingham: "Birmingham",
  lcy: "London City",
  "london city": "London City",
  edi: "Edinburgh",
  edinburgh: "Edinburgh",
  gla: "Glasgow",
  glasgow: "Glasgow",
  brs: "Bristol",
  bristol: "Bristol",
  "st pancras": "St Pancras",
  "st. pancras": "St Pancras",
};
const PLACE_RE =
  /\b(heathrow|gatwick|stansted|luton|manchester|birmingham|london city|edinburgh|glasgow|bristol|st\.? pancras|lhr|lgw|stn|ltn|man|bhx|lcy|edi|gla|brs)\b(?:\s*(?:airport|intl|international)?\s*[,\-–(]?\s*(?:(?:terminal|term\.?|t)\s*([1-5]|north|south|n|s)|(north|south))\b\)?)?/gi;

function findPlaces(text: string): Hit[] {
  const hits: Hit[] = [];
  for (const m of text.matchAll(PLACE_RE)) {
    const word = m[1];
    // Three-letter codes only when written as codes (LHR, not "man").
    if (word.length === 3 && word !== word.toUpperCase()) continue;
    const t = (m[2] ?? m[3])?.toLowerCase();
    const term = !t ? "" : t === "n" || t === "north" ? " North" : t === "s" || t === "south" ? " South" : ` T${t}`;
    hits.push({ at: m.index ?? 0, len: m[0].length, value: `${AIRPORTS[word.toLowerCase().replace(/\s+/g, " ")] ?? word}${term}` });
  }
  return nonOverlapping(hits);
}

function nonOverlapping(hits: Hit[]): Hit[] {
  hits.sort((a, b) => a.at - b.at || b.len - a.len);
  const out: Hit[] = [];
  for (const h of hits) {
    const last = out[out.length - 1];
    if (!last || h.at >= last.at + last.len) out.push(h);
  }
  return out;
}

/** Blanks out what's been read, so a date's "12.08" isn't read again as a time. */
const blankOut = (text: string, hits: Hit[]) => hits.reduce((t, h) => t.slice(0, h.at) + " ".repeat(h.len) + t.slice(h.at + h.len), text);

/** Everything travel-related in a bit of free text, in the order it appears. */
function pull(text: string, year: number) {
  const dates = findDates(text, year);
  let rest = blankOut(text, dates);
  const places = findPlaces(rest);
  rest = blankOut(rest, places);
  const flights = findFlights(rest);
  rest = blankOut(rest, flights);
  const times = findTimes(rest, false);
  const all = [...dates, ...places, ...flights, ...times];
  return {
    date: dates[0]?.value ?? "",
    time: times[0]?.value ?? "",
    flight: flights[0]?.value ?? "",
    place: places[0]?.value ?? "",
    dates: dates.map((h) => h.value),
    times: times.map((h) => h.value),
    flights: flights.map((h) => h.value),
    places: places.map((h) => h.value),
    firstAt: all.length ? Math.min(...all.map((h) => h.at)) : text.length,
  };
}

function parseTime(v: string): string {
  return findTimes(v, true)[0]?.value ?? "";
}

function parseFlight(v: string): string {
  const f = findFlights(v.toUpperCase())[0]?.value;
  if (f) return f;
  // Not a flight number (a train or coach, say): keep what they wrote.
  return /^(n\/?a|none|tbc|tba|-+|\?)$/i.test(v.trim()) ? "" : clean(v).slice(0, 40);
}

function parsePlace(v: string): string {
  const p = findPlaces(v)[0]?.value ?? findPlaces(v.toUpperCase())[0]?.value;
  if (p) return p;
  return /^(n\/?a|none|tbc|tba|-+|\?)$/i.test(v.trim()) ? "" : clean(v).slice(0, 80);
}

// ---------- A spreadsheet to fill in ----------

const CSV_HEAD = ["No.", "Full name", "Arrival date", "Arrival time", "Arrival flight", "Arriving at", "Return date", "Return time", "Return flight", "Leaving from"];

/** The group as a CSV (opens in Excel), so the AeK can fill it in and drop it back. */
export function groupCsv(people: Omit<ImportedPerson, never>[]): string {
  const q = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = [CSV_HEAD.join(",")];
  people.forEach((p, i) =>
    lines.push(
      [String(i + 1), p.full_name, p.arrival_date, p.arrival_time, p.arrival_flight, p.arrival_place, p.departure_date, p.departure_time, p.departure_flight, p.departure_place]
        .map((v) => q(v ?? ""))
        .join(","),
    ),
  );
  return "﻿" + lines.join("\r\n") + "\r\n";
}
