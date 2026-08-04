/**
 * Client-side document parsing for the action board "기타 파일" attachment viewer.
 *
 * Supported previews:
 *   - 스프레드시트  xlsx / xlsm / xls / ods / csv / tsv   → 시트별 표
 *   - 워드          docx                                  → 서식 있는 HTML
 *   - 프레젠테이션  pptx                                  → 슬라이드별 텍스트
 *   - 한글          hwpx (ZIP+XML) / hwp (HWP 5.0 바이너리, 베타)
 *   - 일반 텍스트   txt / md / json / xml / srt / 소스코드 등
 *   - 브라우저 기본 pdf / 이미지 / 오디오 / 비디오
 *   - 레거시 오피스 ppt / doc → Google Docs 뷰어로 폴백
 *
 * Everything runs in the browser; heavy parsers are dynamically imported so they
 * stay out of the main bundle.
 */

export type Sheet = { name: string; rows: string[][]; truncated: boolean };

export type ParsedDoc =
  | { kind: "sheets"; sheets: Sheet[] }
  | { kind: "html";   html: string; text: string }
  | { kind: "slides"; slides: { no: number; lines: string[] }[] }
  | { kind: "text";   text: string };

export type PreviewKind =
  | "sheet" | "word" | "slide" | "hwpx" | "hwp" | "text"
  | "pdf" | "image" | "audio" | "video" | "gdocs" | "none";

/** 파싱 대상 최대 크기 (그 이상은 다운로드만 제공) */
export const MAX_PARSE_BYTES = 30 * 1024 * 1024;
/** 시트 하나당 렌더링할 최대 행 수 */
const MAX_SHEET_ROWS = 2000;

const SHEET_EXT = ["xlsx", "xlsm", "xlsb", "ods", "xls"];
const TEXT_EXT = [
  "txt", "md", "markdown", "json", "xml", "yaml", "yml", "log", "srt", "vtt",
  "ini", "conf", "sql", "js", "ts", "jsx", "tsx", "css", "html", "htm", "py",
  "java", "c", "cpp", "cs", "go", "rs", "sh", "bat",
];
const IMAGE_EXT = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif"];
const AUDIO_EXT = ["mp3", "wav", "ogg", "m4a", "flac", "aac"];
const VIDEO_EXT = ["mp4", "webm", "mov", "m4v"];

export function getExt(name: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

export function previewKind(name: string): PreviewKind {
  const ext = getExt(name);
  if (ext === "csv" || ext === "tsv") return "sheet";
  if (SHEET_EXT.includes(ext)) return "sheet";
  if (ext === "docx") return "word";
  if (ext === "pptx") return "slide";
  if (ext === "hwpx") return "hwpx";
  if (ext === "hwp") return "hwp";
  if (ext === "pdf") return "pdf";
  if (IMAGE_EXT.includes(ext)) return "image";
  if (AUDIO_EXT.includes(ext)) return "audio";
  if (VIDEO_EXT.includes(ext)) return "video";
  if (TEXT_EXT.includes(ext)) return "text";
  if (ext === "ppt" || ext === "doc") return "gdocs";
  return "none";
}

/** 확장자별 아이콘 이모지 */
export function fileIcon(name: string): string {
  const ext = getExt(name);
  if (ext === "csv" || ext === "tsv" || SHEET_EXT.includes(ext)) return "📊";
  if (ext === "docx" || ext === "doc") return "📝";
  if (ext === "pptx" || ext === "ppt") return "📽️";
  if (ext === "hwp" || ext === "hwpx") return "🇰🇷";
  if (ext === "pdf") return "📕";
  if (IMAGE_EXT.includes(ext)) return "🖼️";
  if (AUDIO_EXT.includes(ext)) return "🎵";
  if (VIDEO_EXT.includes(ext)) return "🎬";
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return "🗜️";
  if (TEXT_EXT.includes(ext)) return "📄";
  return "📎";
}

export function fmtBytes(n: number): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// ─── Fetch (직접 → 실패 시 서버 프록시) ───────────────────────────────────────

export async function fetchFileBuffer(url: string): Promise<ArrayBuffer> {
  try {
    const r = await fetch(url);
    if (r.ok) return await r.arrayBuffer();
  } catch {
    // CORS 등 — 아래 프록시로 폴백
  }
  const r2 = await fetch(`/api/board-file?url=${encodeURIComponent(url)}`);
  if (!r2.ok) throw new Error("파일을 불러오지 못했습니다.");
  return await r2.arrayBuffer();
}

/**
 * 원본 파일명 그대로 저장되도록 blob으로 내려받는다.
 * (Storage 경로에는 타임스탬프가 붙은 이름이 들어 있어 그냥 링크로 받으면 이름이 지저분해진다)
 */
export async function downloadFile(url: string, name: string): Promise<void> {
  try {
    const buf = await fetchFileBuffer(url);
    const blobUrl = URL.createObjectURL(new Blob([buf]));
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);
  } catch {
    window.open(url, "_blank", "noopener");
  }
}

// ─── 공통 유틸 ────────────────────────────────────────────────────────────────

/** UTF-8 → 실패 시 EUC-KR(CP949)로 디코딩 (한글 텍스트/CSV 대응) */
export function decodeText(buf: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    try {
      return new TextDecoder("euc-kr").decode(buf);
    } catch {
      return new TextDecoder("utf-8").decode(buf);
    }
  }
}

function parseXml(s: string): Document {
  return new DOMParser().parseFromString(s, "application/xml");
}

/**
 * XML 트리를 한 번만 순회하며 문단 단위 텍스트를 뽑는다.
 * 문단이 중첩(표 안의 문단 등)돼도 텍스트가 중복되지 않는다.
 */
function extractParagraphs(
  root: Element | null,
  textLocal: string,
  paraLocal: string,
  breakLocals: string[] = [],
): string[] {
  if (!root) return [];
  const lines: string[] = [];
  let cur = "";
  const walk = (el: Element) => {
    const ln = el.localName;
    if (ln === textLocal) { cur += el.textContent ?? ""; return; }
    if (breakLocals.includes(ln)) { cur += "\n"; return; }
    for (const c of Array.from(el.children)) walk(c);
    if (ln === paraLocal) { lines.push(cur); cur = ""; }
  };
  walk(root);
  if (cur) lines.push(cur);
  return lines;
}

/** mammoth 결과 HTML 방어적 정리 (script / 이벤트 핸들러 제거) */
function sanitizeHtml(html: string): string {
  return html
    .replace(/<\s*(script|iframe|object|embed|link|meta)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|iframe|object|embed|link|meta)\b[^>]*\/?>/gi, "")
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "")
    .replace(/javascript:/gi, "");
}

function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const out: string[] = [];
  const blocks = doc.body.querySelectorAll("p, h1, h2, h3, h4, h5, h6, li, tr, pre, div");
  if (blocks.length === 0) return doc.body.textContent ?? "";
  blocks.forEach(el => {
    if (el.tagName === "TR") {
      out.push(Array.from(el.children).map(c => (c.textContent ?? "").trim()).join("\t"));
    } else if (!el.querySelector("p, h1, h2, h3, h4, h5, h6, li, tr, pre")) {
      out.push((el.textContent ?? "").trim());
    }
  });
  return out.join("\n");
}

// ─── CSV / TSV ────────────────────────────────────────────────────────────────

function parseDelimited(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === delim) { row.push(cell); cell = ""; continue; }
    if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; continue; }
    if (ch === "\r") continue;
    cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// ─── 스프레드시트 (SheetJS) ───────────────────────────────────────────────────

async function parseSpreadsheet(buf: ArrayBuffer): Promise<ParsedDoc> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(new Uint8Array(buf), { type: "array", cellDates: true });
  const sheets: Sheet[] = wb.SheetNames.map(name => {
    const ws = wb.Sheets[name];
    const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1, defval: "", raw: false, blankrows: false,
    });
    const truncated = raw.length > MAX_SHEET_ROWS;
    const rows = raw.slice(0, MAX_SHEET_ROWS).map(r => r.map(c => (c == null ? "" : String(c))));
    return { name, rows, truncated };
  });
  return { kind: "sheets", sheets };
}

// ─── DOCX (mammoth) ───────────────────────────────────────────────────────────

async function parseDocx(buf: ArrayBuffer): Promise<ParsedDoc> {
  try {
    const mod = await import("mammoth");
    // CJS 번들 상호운용 — 번들러에 따라 default 아래에 실려 오는 경우가 있다.
    const mammoth = (mod as unknown as { default?: typeof mod }).default ?? mod;
    const res = await mammoth.convertToHtml({ arrayBuffer: buf });
    const html = sanitizeHtml(res.value || "");
    if (html.trim()) return { kind: "html", html, text: htmlToText(html) };
  } catch {
    // mammoth 실패 시 아래 원시 XML 추출로 폴백
  }
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) throw new Error("DOCX 본문을 찾지 못했습니다.");
  const lines = extractParagraphs(parseXml(xml).documentElement, "t", "p", ["br"]);
  return { kind: "text", text: lines.join("\n").trim() };
}

// ─── PPTX ─────────────────────────────────────────────────────────────────────

async function parsePptx(buf: ArrayBuffer): Promise<ParsedDoc> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files)
    .filter(n => /^ppt\/slides\/slide\d+\.xml$/i.test(n))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)\.xml$/i)?.[1] ?? 0);
      const nb = Number(b.match(/slide(\d+)\.xml$/i)?.[1] ?? 0);
      return na - nb;
    });
  if (!names.length) throw new Error("슬라이드를 찾지 못했습니다.");

  const slides: { no: number; lines: string[] }[] = [];
  for (let i = 0; i < names.length; i++) {
    const xml = await zip.file(names[i])!.async("string");
    const lines = extractParagraphs(parseXml(xml).documentElement, "t", "p", ["br"])
      .map(l => l.trim())
      .filter(Boolean);
    slides.push({ no: i + 1, lines });
  }
  return { kind: "slides", slides };
}

// ─── HWPX (한글 2014+ 개방형 포맷 = ZIP) ──────────────────────────────────────

async function parseHwpx(buf: ArrayBuffer): Promise<ParsedDoc> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files)
    .filter(n => /^Contents\/section\d+\.xml$/i.test(n))
    .sort((a, b) => {
      const na = Number(a.match(/section(\d+)\.xml$/i)?.[1] ?? 0);
      const nb = Number(b.match(/section(\d+)\.xml$/i)?.[1] ?? 0);
      return na - nb;
    });
  if (!names.length) throw new Error("HWPX 본문(section)을 찾지 못했습니다.");

  const parts: string[] = [];
  for (const n of names) {
    const xml = await zip.file(n)!.async("string");
    parts.push(extractParagraphs(parseXml(xml).documentElement, "t", "p", ["lineBreak"]).join("\n"));
  }
  return { kind: "text", text: parts.join("\n").replace(/\n{3,}/g, "\n\n").trim() };
}

// ─── HWP 5.0 (바이너리 CFB) — 베타 ────────────────────────────────────────────

/** HWP 본문 스트림은 헤더 없는 raw deflate로 압축돼 있다. */
async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// HWP 제어문자 분류 (각각 1 wchar / 8 wchar 를 차지)
const HWP_EXTENDED = new Set([1, 2, 3, 11, 12, 14, 15, 16, 17, 18, 21, 22, 23]);
const HWP_INLINE   = new Set([4, 5, 6, 7, 8, 9, 19, 20]);
const HWPTAG_PARA_TEXT = 67; // HWPTAG_BEGIN(0x10) + 51

function decodeHwpParaText(dv: DataView, off: number, size: number): string {
  const n = size >> 1;
  let s = "";
  for (let i = 0; i < n; ) {
    const c = dv.getUint16(off + i * 2, true);
    if (c < 32) {
      if (HWP_EXTENDED.has(c) || HWP_INLINE.has(c)) {
        if (c === 9) s += "\t";
        i += 8;
        continue;
      }
      if (c === 10 || c === 13) s += "\n";
      i += 1;
      continue;
    }
    s += String.fromCharCode(c);
    i += 1;
  }
  return s;
}

function hwpSectionText(data: Uint8Array): string {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const out: string[] = [];
  let p = 0;
  while (p + 4 <= data.byteLength) {
    const h = dv.getUint32(p, true); p += 4;
    const tag = h & 0x3ff;
    let size = (h >>> 20) & 0xfff;
    if (size === 0xfff) {
      if (p + 4 > data.byteLength) break;
      size = dv.getUint32(p, true); p += 4;
    }
    if (p + size > data.byteLength) break;
    if (tag === HWPTAG_PARA_TEXT) out.push(decodeHwpParaText(dv, p, size));
    p += size;
  }
  return out.join("\n");
}

function toU8(content: unknown): Uint8Array {
  if (content instanceof Uint8Array) return content;
  return new Uint8Array(content as number[]);
}

async function parseHwp(buf: ArrayBuffer): Promise<ParsedDoc> {
  const XLSX = await import("xlsx");
  const CFB = (XLSX as unknown as { CFB: {
    read: (d: Uint8Array, o: { type: string }) => unknown;
    find: (cfb: unknown, path: string) => { content: unknown } | null;
  } }).CFB;
  if (!CFB) throw new Error("HWP 파서를 초기화하지 못했습니다.");

  const cfb = CFB.read(new Uint8Array(buf), { type: "array" });
  const headerEntry = CFB.find(cfb, "/FileHeader");
  if (!headerEntry) throw new Error("HWP 5.0 문서가 아닙니다.");
  const hdr = toU8(headerEntry.content);
  const hdrView = new DataView(hdr.buffer, hdr.byteOffset, hdr.byteLength);
  const props = hdr.byteLength >= 40 ? hdrView.getUint32(36, true) : 0;
  const compressed = (props & 0x01) === 0x01;
  const encrypted  = (props & 0x02) === 0x02;
  if (encrypted) throw new Error("암호가 걸린 HWP 문서는 미리보기를 지원하지 않습니다.");

  const parts: string[] = [];
  for (let i = 0; i < 256; i++) {
    const entry = CFB.find(cfb, `/BodyText/Section${i}`);
    if (!entry) break;
    let data = toU8(entry.content);
    if (compressed) data = await inflateRaw(data);
    parts.push(hwpSectionText(data));
  }
  const text = parts.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) throw new Error("본문 텍스트를 추출하지 못했습니다.");
  return { kind: "text", text };
}

// ─── 진입점 ───────────────────────────────────────────────────────────────────

export async function parseDocument(buf: ArrayBuffer, name: string): Promise<ParsedDoc> {
  const ext = getExt(name);
  const kind = previewKind(name);

  if (kind === "sheet") {
    if (ext === "csv" || ext === "tsv") {
      const rows = parseDelimited(decodeText(buf), ext === "tsv" ? "\t" : ",");
      return {
        kind: "sheets",
        sheets: [{
          name: name.replace(/\.[^.]+$/, ""),
          rows: rows.slice(0, MAX_SHEET_ROWS),
          truncated: rows.length > MAX_SHEET_ROWS,
        }],
      };
    }
    return parseSpreadsheet(buf);
  }
  if (kind === "word")  return parseDocx(buf);
  if (kind === "slide") return parsePptx(buf);
  if (kind === "hwpx")  return parseHwpx(buf);
  if (kind === "hwp")   return parseHwp(buf);
  if (kind === "text")  return { kind: "text", text: decodeText(buf) };

  throw new Error("미리보기를 지원하지 않는 형식입니다.");
}

/** 뷰어의 "전체 복사"에 쓰이는 평문 변환 */
export function docToPlainText(doc: ParsedDoc): string {
  switch (doc.kind) {
    case "text":   return doc.text;
    case "html":   return doc.text;
    case "slides": return doc.slides.map(s => `[슬라이드 ${s.no}]\n${s.lines.join("\n")}`).join("\n\n");
    case "sheets": return doc.sheets.map(s => `[${s.name}]\n${sheetToTsv(s)}`).join("\n\n");
  }
}

export function sheetToTsv(sheet: Sheet): string {
  return sheet.rows.map(r => r.join("\t")).join("\n");
}
