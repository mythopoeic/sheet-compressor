// Minimal in-memory .xlsx builder used by adapter tests. Constructs a
// PKZIP archive of the OOXML files needed to round-trip a single sheet plus
// (optionally) a single embedded chart. Hand-assembled because SheetJS does
// not support chart authoring — see the TODOs flagged in xlsx.js for
// "embedded charts and other types of graphics".
//
// Only what the adapter under test consumes is emitted; this is NOT a
// general-purpose xlsx writer.

import { crc32, deflateRawSync } from "node:zlib";

type ZipEntry = { name: string; data: Buffer };

export type ChartType = "bar" | "line" | "pie" | "scatter" | "area";

export type ChartSeries = {
  /** Literal series name. Emitted as `<c:tx><c:v>…</c:v></c:tx>`. */
  nameLiteral?: string;
  /** Cell reference for the values, e.g. `Sheet1!$B$2:$B$4`. */
  valuesRange?: string;
};

export type ChartSpec = {
  chartType: ChartType;
  /** xdr anchor — 0-indexed col/row corners (inclusive). */
  anchor: { fromCol: number; fromRow: number; toCol: number; toRow: number };
  name: string;
  title?: string;
  xAxisTitle?: string;
  yAxisTitle?: string;
  series?: ChartSeries[];
};

export type BuildChartXlsxOptions = {
  data: (string | number)[][];
  sheetName?: string;
  chart?: ChartSpec;
};

const NS_REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const NS_DOC =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

function buildZip(entries: ZipEntry[]): Buffer {
  const parts: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const compressed = deflateRawSync(data);
    const checksum = crc32(data);

    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8); // method: deflate
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    nameBuf.copy(local, 30);
    parts.push(local, compressed);

    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    nameBuf.copy(central, 46);
    centrals.push(central);

    offset += local.length + compressed.length;
  }

  const cdStart = offset;
  const cdSize = centrals.reduce((s, c) => s + c.length, 0);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(cdStart, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...parts, ...centrals, eocd]);
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function colLetters(col0: number): string {
  let n = col0 + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}
function a1(row0: number, col0: number): string {
  return `${colLetters(col0)}${row0 + 1}`;
}

function buildSheetXml(
  data: (string | number)[][],
  withDrawing: boolean,
): string {
  const rowCount = data.length;
  const colCount = data.reduce((m, r) => Math.max(m, r.length), 0);
  const ref =
    rowCount === 0 || colCount === 0
      ? "A1"
      : `A1:${colLetters(colCount - 1)}${rowCount}`;
  const rows = data
    .map((row, r) => {
      const cells = row
        .map((v, c) => {
          const addr = a1(r, c);
          if (typeof v === "number") return `<c r="${addr}"><v>${v}</v></c>`;
          return `<c r="${addr}" t="inlineStr"><is><t>${xmlEscape(
            String(v),
          )}</t></is></c>`;
        })
        .join("");
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join("");
  const drawing = withDrawing ? `<drawing r:id="rIdDr1"/>` : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${NS_DOC}"><dimension ref="${ref}"/><sheetData>${rows}</sheetData>${drawing}</worksheet>`;
}

function buildDrawingXml(spec: ChartSpec): string {
  const { fromCol, fromRow, toCol, toRow } = spec.anchor;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${NS_DOC}" xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart">
<xdr:twoCellAnchor>
<xdr:from><xdr:col>${fromCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${fromRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
<xdr:to><xdr:col>${toCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${toRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
<xdr:graphicFrame><xdr:nvGraphicFramePr><xdr:cNvPr id="2" name="${xmlEscape(
    spec.name,
  )}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart r:id="rIdCh1"/></a:graphicData></a:graphic></xdr:graphicFrame>
<xdr:clientData/>
</xdr:twoCellAnchor>
</xdr:wsDr>`;
}

const CHART_BODY_TAG: Record<ChartType, string> = {
  bar: "barChart",
  line: "lineChart",
  pie: "pieChart",
  scatter: "scatterChart",
  area: "areaChart",
};

function buildChartXml(spec: ChartSpec): string {
  const tag = CHART_BODY_TAG[spec.chartType];
  const title = spec.title
    ? `<c:title><c:tx><c:rich><a:p><a:r><a:t>${xmlEscape(
        spec.title,
      )}</a:t></a:r></a:p></c:rich></c:tx></c:title>`
    : "";
  const series = (spec.series ?? [])
    .map((s) => {
      const tx = s.nameLiteral
        ? `<c:tx><c:v>${xmlEscape(s.nameLiteral)}</c:v></c:tx>`
        : "";
      const val = s.valuesRange
        ? `<c:val><c:numRef><c:f>${xmlEscape(s.valuesRange)}</c:f></c:numRef></c:val>`
        : "";
      return `<c:ser>${tx}${val}</c:ser>`;
    })
    .join("");
  const xAx = spec.xAxisTitle
    ? `<c:catAx><c:title><c:tx><c:rich><a:p><a:r><a:t>${xmlEscape(
        spec.xAxisTitle,
      )}</a:t></a:r></a:p></c:rich></c:tx></c:title></c:catAx>`
    : "";
  const yAx = spec.yAxisTitle
    ? `<c:valAx><c:title><c:tx><c:rich><a:p><a:r><a:t>${xmlEscape(
        spec.yAxisTitle,
      )}</a:t></a:r></a:p></c:rich></c:tx></c:title></c:valAx>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="${NS_DOC}" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
<c:chart>${title}<c:plotArea><c:layout/><c:${tag}>${series}</c:${tag}>${xAx}${yAx}</c:plotArea></c:chart>
</c:chartSpace>`;
}

export function buildChartXlsx(opts: BuildChartXlsxOptions): Buffer {
  const sheetName = opts.sheetName ?? "Sheet1";
  const withChart = !!opts.chart;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>${
    withChart
      ? `
<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>
<Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`
      : ""
  }
</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${NS_REL}">
<Relationship Id="rId1" Type="${NS_DOC}/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${NS_DOC}">
<sheets><sheet name="${xmlEscape(sheetName)}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${NS_REL}">
<Relationship Id="rId1" Type="${NS_DOC}/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`;

  const entries: ZipEntry[] = [
    { name: "[Content_Types].xml", data: Buffer.from(contentTypes) },
    { name: "_rels/.rels", data: Buffer.from(rootRels) },
    { name: "xl/workbook.xml", data: Buffer.from(workbook) },
    { name: "xl/_rels/workbook.xml.rels", data: Buffer.from(workbookRels) },
    {
      name: "xl/worksheets/sheet1.xml",
      data: Buffer.from(buildSheetXml(opts.data, withChart)),
    },
  ];

  if (opts.chart) {
    const sheetRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${NS_REL}">
<Relationship Id="rIdDr1" Type="${NS_DOC}/drawing" Target="../drawings/drawing1.xml"/>
</Relationships>`;
    const drawingRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${NS_REL}">
<Relationship Id="rIdCh1" Type="${NS_DOC}/chart" Target="../charts/chart1.xml"/>
</Relationships>`;
    entries.push(
      {
        name: "xl/worksheets/_rels/sheet1.xml.rels",
        data: Buffer.from(sheetRels),
      },
      { name: "xl/drawings/drawing1.xml", data: Buffer.from(buildDrawingXml(opts.chart)) },
      {
        name: "xl/drawings/_rels/drawing1.xml.rels",
        data: Buffer.from(drawingRels),
      },
      { name: "xl/charts/chart1.xml", data: Buffer.from(buildChartXml(opts.chart)) },
    );
  }

  return buildZip(entries);
}
