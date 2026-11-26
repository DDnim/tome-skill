// A PowerPoint file (.pptx) from pictures of the slides: each slide is one
// picture that fills it, with its speaker notes and its transition. No
// dependencies: the zip and the XML are written here.

import zlib from "node:zlib";

// ---- zip ----

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A zip of [{name, data: Buffer | string}], in that order; pictures are stored, the rest deflated. */
export function zip(entries) {
  const parts = [];
  const central = [];
  let offset = 0;
  // 1980-01-01 00:00: the time in the headers (a fixed one: the same deck makes the same file).
  const time = 0;
  const date = (0 << 9) | (1 << 5) | 1;
  for (const e of entries) {
    const name = Buffer.from(e.name, "utf8");
    const raw = Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data, "utf8");
    const store = /\.(png|jpe?g)$/i.test(e.name);
    const body = store ? raw : zlib.deflateRawSync(raw, { level: 9 });
    const crc = crc32(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(store ? 0 : 8, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    parts.push(local, name, body);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0x0800, 8);
    c.writeUInt16LE(store ? 0 : 8, 10);
    c.writeUInt16LE(time, 12);
    c.writeUInt16LE(date, 14);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(body.length, 20);
    c.writeUInt32LE(raw.length, 24);
    c.writeUInt16LE(name.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, name);
    offset += local.length + name.length + body.length;
  }
  const size = central.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(size, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, ...central, end]);
}

// ---- the parts of a presentation ----

const xmlEsc = (s) =>
  String(s)
    // characters XML 1.0 does not allow
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, "")
    .replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS_A = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
const NS_R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const NS_P = 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const CT = "application/vnd.openxmlformats-officedocument.presentationml";

const rels = (list) =>
  `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list
    .map(([id, type, target]) => `<Relationship Id="${id}" Type="${type.startsWith("http") ? type : `${REL}/${type}`}" Target="${xmlEsc(target)}"/>`)
    .join("")}</Relationships>`;

function theme(name) {
  const scheme = [
    ["dk1", '<a:sysClr val="windowText" lastClr="000000"/>'],
    ["lt1", '<a:sysClr val="window" lastClr="FFFFFF"/>'],
    ["dk2", '<a:srgbClr val="1F2937"/>'],
    ["lt2", '<a:srgbClr val="F3F4F6"/>'],
    ["accent1", '<a:srgbClr val="2563EB"/>'],
    ["accent2", '<a:srgbClr val="DC2626"/>'],
    ["accent3", '<a:srgbClr val="16A34A"/>'],
    ["accent4", '<a:srgbClr val="9333EA"/>'],
    ["accent5", '<a:srgbClr val="EA580C"/>'],
    ["accent6", '<a:srgbClr val="0891B2"/>'],
    ["hlink", '<a:srgbClr val="2563EB"/>'],
    ["folHlink", '<a:srgbClr val="7C3AED"/>'],
  ];
  const solid = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
  const line = (w) => `<a:ln w="${w}" cap="flat" cmpd="sng" algn="ctr">${solid}<a:prstDash val="solid"/></a:ln>`;
  const fonts = '<a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/>';
  return `${HEAD}<a:theme ${NS_A} name="${name}"><a:themeElements><a:clrScheme name="Tome">${scheme
    .map(([k, v]) => `<a:${k}>${v}</a:${k}>`)
    .join("")}</a:clrScheme><a:fontScheme name="Tome"><a:majorFont>${fonts}</a:majorFont><a:minorFont>${fonts}</a:minorFont></a:fontScheme><a:fmtScheme name="Tome"><a:fillStyleLst>${solid}${solid}${solid}</a:fillStyleLst><a:lnStyleLst>${line(6350)}${line(12700)}${line(19050)}</a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst>${solid}${solid}${solid}</a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`;
}

const CLR_MAP = 'bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"';
const GROUP = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';

const master = () =>
  `${HEAD}<p:sldMaster ${NS_A} ${NS_R} ${NS_P}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>${GROUP}</p:spTree></p:cSld><p:clrMap ${CLR_MAP}/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`;

const layout = () =>
  `${HEAD}<p:sldLayout ${NS_A} ${NS_R} ${NS_P} type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${GROUP}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;

/** The notes page's shapes: a picture of the slide on top, the notes under it. */
function notesShapes(nw, nh, text) {
  const pad = Math.round(nw * 0.08);
  const imgW = nw - 2 * pad;
  const imgH = Math.round(imgW * 0.5625);
  const bodyY = pad + imgH + pad;
  const paragraphs = text === null ? "<a:p><a:endParaRPr lang=\"en-US\"/></a:p>" : text.split(/\r?\n/).map((l) => (l ? `<a:p><a:r><a:rPr lang="en-US" dirty="0"/><a:t>${xmlEsc(l)}</a:t></a:r></a:p>` : '<a:p><a:endParaRPr lang="en-US"/></a:p>')).join("");
  return `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="${pad}" y="${pad}"/><a:ext cx="${imgW}" cy="${imgH}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="${pad}" y="${bodyY}"/><a:ext cx="${imgW}" cy="${nh - bodyY - pad}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/>${paragraphs}</p:txBody></p:sp>`;
}

const notesMaster = (nw, nh) =>
  `${HEAD}<p:notesMaster ${NS_A} ${NS_R} ${NS_P}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>${GROUP}${notesShapes(nw, nh, null)}</p:spTree></p:cSld><p:clrMap ${CLR_MAP}/><p:notesStyle><a:lvl1pPr marL="0" algn="l" rtl="0" latinLnBrk="0"><a:defRPr sz="1200" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl1pPr></p:notesStyle></p:notesMaster>`;

const notesSlide = (nw, nh, text) =>
  `${HEAD}<p:notes ${NS_A} ${NS_R} ${NS_P}><p:cSld><p:spTree>${GROUP}${notesShapes(nw, nh, text)}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`;

const TRANSITION = {
  fade: '<p:transition spd="med"><p:fade/></p:transition>',
  slide: '<p:transition spd="med"><p:push dir="l"/></p:transition>',
  none: "",
};

const slideXml = (cx, cy, title, transition) =>
  `${HEAD}<p:sld ${NS_A} ${NS_R} ${NS_P}><p:cSld><p:spTree>${GROUP}<p:pic><p:nvPicPr><p:cNvPr id="2" name="Slide" descr="${xmlEsc(title)}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>${TRANSITION[transition] ?? ""}</p:sld>`;

/** EMU per CSS px: 1920 px is 13.333 in, PowerPoint's 16:9 (1 px = 0.5 pt). */
export const EMU_PER_PX = 6350;

/**
 * The .pptx of a deck: `{title, size: [w, h] (px), slides: [{png: Buffer, title, notes, transition}]}`.
 * Notes pages are portrait, 7.5 × 10 in.
 */
export function makePptx({ title, size, slides }) {
  const cx = Math.round(size[0] * EMU_PER_PX);
  const cy = Math.round(size[1] * EMU_PER_PX);
  const [nw, nh] = [6858000, 9144000];
  const n = slides.length;
  const files = [];
  const add = (name, data) => files.push({ name, data });

  add(
    "[Content_Types].xml",
    `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/ppt/presentation.xml" ContentType="${CT}.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="${CT}.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="${CT}.slideLayout+xml"/><Override PartName="/ppt/notesMasters/notesMaster1.xml" ContentType="${CT}.notesMaster+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/ppt/theme/theme2.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/ppt/presProps.xml" ContentType="${CT}.presProps+xml"/><Override PartName="/ppt/viewProps.xml" ContentType="${CT}.viewProps+xml"/><Override PartName="/ppt/tableStyles.xml" ContentType="${CT}.tableStyles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>${slides
      .map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="${CT}.slide+xml"/><Override PartName="/ppt/notesSlides/notesSlide${i + 1}.xml" ContentType="${CT}.notesSlide+xml"/>`)
      .join("")}</Types>`,
  );
  add(
    "_rels/.rels",
    rels([
      ["rId1", "officeDocument", "ppt/presentation.xml"],
      ["rId2", "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties", "docProps/core.xml"],
      ["rId3", "extended-properties", "docProps/app.xml"],
    ]),
  );
  add(
    "docProps/core.xml",
    `${HEAD}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlEsc(title)}</dc:title></cp:coreProperties>`,
  );
  add(
    "docProps/app.xml",
    `${HEAD}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>tome-slides</Application><Slides>${n}</Slides><Notes>${n}</Notes><PresentationFormat>Custom</PresentationFormat></Properties>`,
  );
  // presentation.xml.rels: rId1 master, rId2 notes master, rId3 theme, rId4–6 props, rId10+ slides.
  add(
    "ppt/presentation.xml",
    `${HEAD}<p:presentation ${NS_A} ${NS_R} ${NS_P} saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:notesMasterIdLst><p:notesMasterId r:id="rId2"/></p:notesMasterIdLst><p:sldIdLst>${slides
      .map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${10 + i}"/>`)
      .join("")}</p:sldIdLst><p:sldSz cx="${cx}" cy="${cy}"/><p:notesSz cx="${nw}" cy="${nh}"/><p:defaultTextStyle/></p:presentation>`,
  );
  add(
    "ppt/_rels/presentation.xml.rels",
    rels([
      ["rId1", "slideMaster", "slideMasters/slideMaster1.xml"],
      ["rId2", "notesMaster", "notesMasters/notesMaster1.xml"],
      ["rId3", "theme", "theme/theme1.xml"],
      ["rId4", "presProps", "presProps.xml"],
      ["rId5", "viewProps", "viewProps.xml"],
      ["rId6", "tableStyles", "tableStyles.xml"],
      ...slides.map((_, i) => [`rId${10 + i}`, "slide", `slides/slide${i + 1}.xml`]),
    ]),
  );
  add("ppt/presProps.xml", `${HEAD}<p:presentationPr ${NS_A} ${NS_R} ${NS_P}/>`);
  add("ppt/viewProps.xml", `${HEAD}<p:viewPr ${NS_A} ${NS_R} ${NS_P}><p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="80000"/></p:normalViewPr><p:gridSpacing cx="76200" cy="76200"/></p:viewPr>`);
  add("ppt/tableStyles.xml", `${HEAD}<a:tblStyleLst ${NS_A} def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>`);
  add("ppt/theme/theme1.xml", theme("Tome"));
  add("ppt/theme/theme2.xml", theme("Tome notes"));
  add("ppt/slideMasters/slideMaster1.xml", master());
  add(
    "ppt/slideMasters/_rels/slideMaster1.xml.rels",
    rels([
      ["rId1", "slideLayout", "../slideLayouts/slideLayout1.xml"],
      ["rId2", "theme", "../theme/theme1.xml"],
    ]),
  );
  add("ppt/slideLayouts/slideLayout1.xml", layout());
  add("ppt/slideLayouts/_rels/slideLayout1.xml.rels", rels([["rId1", "slideMaster", "../slideMasters/slideMaster1.xml"]]));
  add("ppt/notesMasters/notesMaster1.xml", notesMaster(nw, nh));
  add("ppt/notesMasters/_rels/notesMaster1.xml.rels", rels([["rId1", "theme", "../theme/theme2.xml"]]));
  for (const [i, s] of slides.entries()) {
    const k = i + 1;
    add(`ppt/slides/slide${k}.xml`, slideXml(cx, cy, s.title ?? `Slide ${k}`, s.transition));
    add(
      `ppt/slides/_rels/slide${k}.xml.rels`,
      rels([
        ["rId1", "slideLayout", "../slideLayouts/slideLayout1.xml"],
        ["rId2", "image", `../media/slide${k}.png`],
        ["rId3", "notesSlide", `../notesSlides/notesSlide${k}.xml`],
      ]),
    );
    add(`ppt/notesSlides/notesSlide${k}.xml`, notesSlide(nw, nh, s.notes ?? ""));
    add(
      `ppt/notesSlides/_rels/notesSlide${k}.xml.rels`,
      rels([
        ["rId1", "notesMaster", "../notesMasters/notesMaster1.xml"],
        ["rId2", "slide", `../slides/slide${k}.xml`],
      ]),
    );
    add(`ppt/media/slide${k}.png`, s.png);
  }
  return zip(files);
}
