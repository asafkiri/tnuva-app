// v158: תעודה ארוכה בצילום אחד מתחלקת לחלקים לפני השליחה. ב-10.11 חשבונית של 30 שורות (54 שורות
// טקסט) נשלחה ב-1850 פיקסל — כ-11 פיקסל לגובה ספרה — והמודלים קראו 7 כ-1 ו-5 כ-1 בחמש שורות.
// הבדיקות כאן מריצות את צינור התמונה על נייר מסונתז (שורות דפוס במרווח קבוע על רקע אפור), בלי
// מודל ובלי תמונה אמיתית: התכנון הטהור, החיתוך ברווח הלבן, ומה שקושר את החלקים במסך האישור —
// אישור אחד, סיבוב משותף, מחיקה ושחזור של הקבוצה כולה, ותקרת שמונת העמודים.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function source(name) {
  const m = new RegExp('^(?:async )?function ' + name + '\\(', 'm').exec(html);
  assert.ok(m, 'Missing function: ' + name);
  const eol = html.indexOf('\n', m.index);
  const end = html.slice(m.index, eol).trimEnd().endsWith('}') ? eol : html.indexOf('\n}', eol) + 2;
  return html.slice(m.index, end);
}
function constant(name) {
  const m = new RegExp('^const ' + name + ' = ([^;]+);', 'm').exec(html);
  assert.ok(m, 'Missing constant: ' + name);
  return Number(m[1]);
}
const names = ['aiCompressInvoiceImage', 'aiRenderInvoiceRegion', 'aiRenderSplitPages', 'aiPlanLongReceiptSplit', 'aiRowInkProfile', 'aiSplitSiblings',
  'aiSplitGroupPages', 'aiOrderSplitGroup', 'aiPageLabel', 'aiDetectPaperRegion', 'aiMeasurePageQuality', 'aiQualityAdvice', 'aiDrawCropMap',
  'aiCropInitFrame', 'aiCropResetOverlay', 'aiCropDraw', 'aiCropSyncCanvasBox', 'aiCropContainRect', 'aiCropFit', 'aiNormalizeQuarterTurns',
  'aiRenderInvoiceRotation', 'aiSetOrientationBusy', 'aiUpdateOrientationControls', 'aiRestoreOriginalImage', 'aiCropInfoText',
  'aiPaintOrientationReview', 'aiOrientationLocation', 'aiOpenOrientationReview', 'aiCloseOrientationReview', 'aiRotateOrientationReview',
  'aiConfirmOrientationReview', 'aiCancelOrientationReview', 'aiRemoveInvoicePage', 'aiAddInvoiceFiles', 'aiOpenNextUnconfirmedOrientation',
  'aiAllPagesOrientationConfirmed'];
const MIN_PITCH = constant('AI_SPLIT_MIN_PITCH'), MAX_SIDE = constant('AI_INVOICE_MAX_SIDE');

// הנייר המסונתז: מקור 3000×4000 (פורטרט), פרוקסי 1125×1500 (0.375). מסגרת הנייר בפרוקסי
// x 350..775, y 100..1400; שורות דפוס ברוחב 10 פיקסל כל PITCH פיקסל, החל מ-y=110. לובן נייר 230,
// דיו 40, רקע 120 (מחצלת אפורה).
const SRC_W = 3000, SRC_H = 4000, PROXY = 1500, SCALE = PROXY / SRC_H;
const BOX = { x: 350, y: 100, width: 425, height: 1300 };
// band: רוחב שורת הדפוס בפיקסלים של הפרוקסי (10 — רווח לבן של 14; 23 — רווח של פיקסל אחד, שאינו נחשב רווח).
function synthetic(pitch, { band = 10 } = {}) {
  const pw = Math.round(SRC_W * SCALE), ph = Math.round(SRC_H * SCALE);
  const data = new Uint8ClampedArray(pw * ph * 4);
  for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
    const inside = x >= BOX.x && x < BOX.x + BOX.width && y >= BOX.y && y < BOX.y + BOX.height;
    const textRow = inside && ((y - BOX.y - 10) % pitch) >= 0 && ((y - BOX.y - 10) % pitch) < band && x > BOX.x + 20 && x < BOX.x + BOX.width - 20;
    const v = !inside ? 120 : textRow ? 40 : 230;
    const i = (y * pw + x) * 4; data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255;
  }
  return { pw, ph, data };
}
function context({ pitch = 24, band = 10, paper = true } = {}) {
  const scene = synthetic(pitch, { band });
  const images = new Map([['source', { naturalWidth: SRC_W, naturalHeight: SRC_H }]]);
  const draws = [], nodes = new Map();
  let seq = 0;
  function node(id) {
    if (nodes.has(id)) return nodes.get(id);
    const classes = new Set(id === 'aiCropCanvas' ? ['hidden'] : []);
    const n = { id, style: {}, width: 600, height: 450, clientWidth: 600, clientHeight: 450, naturalWidth: 3000, naturalHeight: 2250, textContent: '', innerHTML: '',
      classList: { add: v => classes.add(v), remove: v => classes.delete(v), contains: v => classes.has(v), toggle: (v, yes) => yes ? classes.add(v) : classes.delete(v) },
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 600, height: 450 }), parentElement: { getBoundingClientRect: () => ({ width: 624, height: 474 }) },
      getContext: () => ({ clearRect() {}, fillRect() {}, strokeRect() {} }) };
    nodes.set(id, n); return n;
  }
  const c = vm.createContext({ console, canEditDraft: () => true, Number, Math, Array, Object, String, Promise, Date, Set, Map,
    aiScanEditingImages: false, receiptScanChanged() {}, aiOrientationSession: null, aiOrientationBusy: false, aiCropState: null, aiScanBusy: false,
    aiScanDocuments: [], aiScanResponse: null, aiScanEvaluation: null, aiScanError: '', aiScanProgressText: '', aiScanRunId: 1,
    aiScanAutoRotationNote: '', aiScanAttemptCount: 0,
    $: node, setTimeout() {}, refreshScanHost() {}, tnuvaInvalidatePhotoDoc() {},
    showToast: message => { c.lastToast = message; },
    aiReadFile: async () => 'source', aiLoadImage: async url => { assert.ok(images.has(url), url); return images.get(url); },
    aiEnhanceDocumentPixels: () => false,
    AI_INVOICE_MAX_SIDE: MAX_SIDE, AI_CROP_PROXY_SIDE: PROXY,
    AI_SPLIT_MIN_PITCH: MIN_PITCH, AI_SPLIT_MAX_PARTS: constant('AI_SPLIT_MAX_PARTS'), AI_SPLIT_MIN_SOURCE_GAIN: constant('AI_SPLIT_MIN_SOURCE_GAIN'), AI_SPLIT_GAP_INK: constant('AI_SPLIT_GAP_INK'),
    Uint8ClampedArray, Uint8Array, Uint32Array, Float32Array, Float64Array,
    aiFlattenIllumination: () => true,
    // שני העוגנים מסכימים על מסגרת הנייר, ועוגן המחזוריות מודד את מרווח השורות (P) — כמו על נייר אמיתי.
    aiTextAnchorBox: () => paper ? { ...BOX } : null,
    aiTextCropBox: () => paper ? { box: { ...BOX }, P: pitch } : null,
    aiCanvasToInvoiceJpeg: canvas => { const dataUrl = 'encoded-' + (++seq); images.set(dataUrl, { naturalWidth: canvas.width, naturalHeight: canvas.height }); return { dataUrl, bytes: 100 }; },
    aiDataUrlBytes: () => 100,
    document: { createElement: tag => {
      assert.equal(tag, 'canvas');
      const canvas = { width: 0, height: 0 };
      canvas.getContext = () => ({ fillRect() {}, translate() {}, rotate() {}, putImageData() {},
        drawImage: (...args) => draws.push({ args, width: canvas.width, height: canvas.height }),
        // הפרוקסי מקבל את הנייר המסונתז; כל קנבס אחר — פיקסל לבן אחד (השיפור ממילא מדומה).
        getImageData: () => canvas.width === scene.pw && canvas.height === scene.ph ? { data: scene.data } : { data: new Uint8ClampedArray([255, 255, 255, 255]) } });
      return canvas;
    } }
  });
  vm.runInContext(names.map(source).join('\n'), c);
  Object.defineProperty(node('aiOrientationImage'), 'src', { set(url) {
    const img = images.get(url); if (img) { this.naturalWidth = img.naturalWidth; this.naturalHeight = img.naturalHeight; }
    c.aiCropInitFrame();
  } });
  return { c, node, images, draws };
}
// מערכים שנוצרו בתוך ה-vm שייכים למרחב אחר; להשוואה עמוקה מעתיקים אותם למרחב של הבדיקה.
const plain = value => JSON.parse(JSON.stringify(value));
const inGap = (sourceY, pitch) => { const proxyY = sourceY * SCALE - BOX.y - 10; const phase = ((proxyY % pitch) + pitch) % pitch; return phase >= 10; };

test('the plan: a short receipt is one image; a long one splits at a white gap; no gap or no source pixels means no split', () => {
  const { c } = context();
  const profile = new Float32Array(1300);
  for (let y = 0; y < 1300; y++) profile[y] = ((y - 10) % 24) >= 0 && ((y - 10) % 24) < 10 ? 180 : 0;
  const base = { profile, profileStart: BOX.y, profileScale: SCALE, outputLong: MAX_SIDE };
  // מרווח שורות של 64 פיקסל במקור ונייר של 3467 פיקסל: בפלט 34 — מתחת לסף, שני חלקים.
  const plan = c.aiPlanLongReceiptSplit({ ...base, pitchSource: 24 / SCALE, sourceLong: BOX.height / SCALE });
  assert.equal(plan.parts, 2);
  assert.ok(plan.pitchOut < MIN_PITCH && plan.pitchOut > 30, String(plan.pitchOut));
  assert.equal(plan.cutsSource.length, 1);
  const cut = plan.cutsSource[0];
  assert.ok(Math.abs(cut - (BOX.y + 650) / SCALE) <= 24 / SCALE, 'the cut is within one row pitch of the middle: ' + cut);
  assert.ok(inGap(cut, 24), 'the cut falls between two printed rows');
  // תעודה קצרה: 12 שורות על אותו אורך נייר — מרווח גדול, אין חלוקה.
  assert.deepEqual(c.aiPlanLongReceiptSplit({ ...base, pitchSource: 60 / SCALE, sourceLong: BOX.height / SCALE }).parts, 1);
  assert.equal(c.aiPlanLongReceiptSplit({ ...base, pitchSource: 60 / SCALE, sourceLong: BOX.height / SCALE }).reason, 'pitch_ok');
  // מקור קטן (צילום של 1900 פיקסל): אין מה להרוויח מחלוקה.
  assert.equal(c.aiPlanLongReceiptSplit({ ...base, pitchSource: 12, sourceLong: 1900 }).reason, 'source_too_small');
  // אין רווח לבן רחב מספיק (שורות דיו עם רווח של פיקסל אחד) — אין חלוקה; דיו אחיד בלי מרקם — אין דיו, אין חלוקה.
  const narrowGaps = new Float32Array(1300); for (let y = 0; y < 1300; y++) narrowGaps[y] = y % 2 ? 150 : 140;
  assert.equal(c.aiPlanLongReceiptSplit({ ...base, profile: narrowGaps, pitchSource: 24 / SCALE, sourceLong: BOX.height / SCALE }).reason, 'no_gap');
  assert.equal(c.aiPlanLongReceiptSplit({ ...base, profile: new Float32Array(1300).fill(150), pitchSource: 24 / SCALE, sourceLong: BOX.height / SCALE }).reason, 'no_ink');
  // תעודה ארוכה במיוחד: מרווח של 24 פיקסל בפלט — שלושה חלקים, לא יותר.
  const long = c.aiPlanLongReceiptSplit({ ...base, pitchSource: 24 / SCALE, sourceLong: BOX.height / SCALE * 1.6 });
  assert.equal(long.parts, 2 === long.parts ? 2 : 3);
  assert.ok(long.parts <= 3);
  // בלי מרווח שורות — אין תכנון.
  assert.equal(c.aiPlanLongReceiptSplit({ ...base, pitchSource: null, sourceLong: 4000 }).reason, 'no_pitch');
  // המסגרת שזוהתה כוללת שוליים כהים (מחצלת) שנספרים כדיו בכל שורה — רצפה קבועה של 26: הרווח הלבן הוא
  // שורה שקרובה לרצפה, לא לאפס. (נמצא בהרצה עם הגלאי האמיתי על נייר מסונתז: בלי הרצפה — "no_gap".)
  const withMargins = new Float32Array(1300);
  for (let y = 0; y < 1300; y++) withMargins[y] = 26 + profile[y];
  const floored = c.aiPlanLongReceiptSplit({ ...base, profile: withMargins, pitchSource: 24 / SCALE, sourceLong: BOX.height / SCALE });
  assert.equal(floored.parts, 2);
  assert.ok(inGap(floored.cutsSource[0], 24), 'the cut is still between rows above a constant ink floor');
  // רצפה בלי מרקם (הכול אותו ערך) — אין דיו, אין חלוקה.
  assert.equal(c.aiPlanLongReceiptSplit({ ...base, profile: new Float32Array(1300).fill(26), pitchSource: 24 / SCALE, sourceLong: BOX.height / SCALE }).reason, 'no_ink');
});

test('one photo of a long receipt becomes two pages of one document, cut in a white gap, each at full source resolution', async () => {
  const { c, draws } = context({ pitch: 24 });
  const pages = await c.aiCompressInvoiceImage({ name: 'receipt.jpg' });
  assert.ok(Array.isArray(pages), 'a split returns an array of pages');
  assert.equal(pages.length, 2);
  const [top, bottom] = pages;
  assert.equal(top.split.count, 2); assert.equal(top.split.index, 0); assert.equal(bottom.split.index, 1);
  assert.equal(top.split.group, bottom.split.group);
  // אזורי המקור רציפים ומכסים את כל הנייר, והחיתוך ברווח בין שורות.
  const regionTop = Math.floor(BOX.y / SCALE), regionHeight = Math.ceil(BOX.height / SCALE);
  assert.equal(top.sourceRegion.y, regionTop);
  assert.equal(top.sourceRegion.y + top.sourceRegion.height, bottom.sourceRegion.y);
  assert.equal(bottom.sourceRegion.y + bottom.sourceRegion.height, regionTop + regionHeight);
  assert.ok(inGap(bottom.sourceRegion.y, 24), 'cut at ' + bottom.sourceRegion.y + ' is between rows');
  // כל חלק גבוה מ-1850 פחות — ולכן נשלח בלי הקטנה: פי שניים פיקסלים לספרה.
  assert.equal(top.processScale, 1); assert.equal(bottom.processScale, 1);
  assert.deepEqual(plain(draws.slice(-2).map(d => [d.args[1], d.args[2], d.args[3], d.args[4]])), plain([
    [top.sourceRegion.x, top.sourceRegion.y, top.sourceRegion.width, top.sourceRegion.height],
    [bottom.sourceRegion.x, bottom.sourceRegion.y, bottom.sourceRegion.width, bottom.sourceRegion.height]]));
  // כל חלק מדווח על עצמו: סיבה, חלק, מרווח שורות, ומה הוא מהפריים המלא (לתרשים).
  assert.equal(top.cropInfo.reason, 'split'); assert.equal(top.cropInfo.parts, 2); assert.equal(bottom.cropInfo.part, 2);
  assert.ok(top.cropInfo.pitch > 30 && top.cropInfo.pitch < MIN_PITCH);
  assert.ok(top.cropInfo.kept.h < 0.6 && bottom.cropInfo.kept.y > top.cropInfo.kept.y);
  assert.equal(top.quality.splitParts, 2); assert.equal(top.quality.rowPitchPx, Math.round(24 / SCALE));
  assert.equal(top.quality.paperPx, top.sourceRegion.height);
  assert.match(c.aiCropInfoText(top), /v158 · תעודה ארוכה · חלק 1 מתוך 2/);
  assert.equal(c.aiPageLabel(bottom, 1), 'חלק 2 מתוך 2');
  assert.equal(c.aiPageLabel({ split: null }, 1), 'עמוד 2');
  assert.equal(top.name, 'receipt-1.jpg'); assert.equal(bottom.name, 'receipt-2.jpg');
  assert.ok(top.autoCropped && top.cropped && !top.originalImage && top.sourceBlob, 'restore goes through the source file, like an auto-crop');
});

test('a short receipt, a receipt wider than tall, a photo without paper and the full-frame path stay a single page', async () => {
  const short = await context({ pitch: 60 }).c.aiCompressInvoiceImage({ name: 'short.jpg' });
  assert.ok(!Array.isArray(short)); assert.equal(short.cropInfo.reason, 'cropped'); assert.ok(!short.split);
  assert.equal(short.quality.rowPitchPx, Math.round(60 / SCALE * Math.min(1, MAX_SIDE / (BOX.height / SCALE))), 'the measured pitch is kept for the audit');
  const none = await context({ paper: false }).c.aiCompressInvoiceImage({ name: 'mat.jpg' });
  assert.ok(!Array.isArray(none)); assert.equal(none.cropInfo.reason, 'no_text');
  const full = await context({ pitch: 24 }).c.aiCompressInvoiceImage({ name: 'long.jpg' }, true);
  assert.ok(!Array.isArray(full)); assert.equal(full.cropInfo.reason, 'full_image');
  const noSplit = await context({ pitch: 24 }).c.aiCompressInvoiceImage({ name: 'long.jpg' }, false, true);
  assert.ok(!Array.isArray(noSplit)); assert.equal(noSplit.cropInfo.reason, 'cropped'); assert.equal(noSplit.cropInfo.splitReason, undefined);
  // רווח לבן שלא נמצא (שורות דפוס כמעט רצופות — רווח של פיקסל אחד ב-24) — צילום אחד, והסיבה נרשמת.
  const solid = await context({ pitch: 24, band: 23 }).c.aiCompressInvoiceImage({ name: 'solid.jpg' });
  assert.ok(!Array.isArray(solid)); assert.ok(['no_gap', 'no_ink'].includes(solid.cropInfo.splitReason), solid.cropInfo.splitReason);
});

async function withGroup(options) {
  const h = context(options);
  const pages = await h.c.aiCompressInvoiceImage({ name: 'receipt.jpg' });
  h.c.aiScanDocuments = [{ noteIndex: 0, pages: pages }];
  return { ...h, pages };
}
test('the parts of one photo are confirmed together, rotated together (180° reverses their order), deleted together and restored together', async () => {
  // אישור אחד — שני החלקים מאושרים.
  const confirm = await withGroup({ pitch: 24 });
  assert.ok(confirm.c.aiOpenOrientationReview(0, 0, false));
  assert.match(confirm.node('aiOrientationLabel').textContent, /חלק 1 מתוך 2/);
  assert.match(confirm.node('aiOrientationHint').textContent, /חולקה ל-2 חלקים/);
  await confirm.c.aiConfirmOrientationReview();
  assert.deepEqual(plain(confirm.c.aiScanDocuments[0].pages.map(p => p.orientationConfirmed)), [true, true]);
  assert.equal(confirm.c.aiAllPagesOrientationConfirmed(), true);
  // סיבוב של 180° — שני החלקים מסתובבים, והסדר מתהפך כדי שראש התעודה יישאר ראשון.
  const rotate = await withGroup({ pitch: 24 });
  rotate.c.aiOpenOrientationReview(0, 0, false);
  await rotate.c.aiRotateOrientationReview(2);
  const after = rotate.c.aiScanDocuments[0].pages;
  assert.deepEqual(plain(after.map(p => [p.rotation, p.split.index])), [[180, 1], [180, 0]]);
  await rotate.c.aiRotateOrientationReview(2);
  assert.deepEqual(plain(rotate.c.aiScanDocuments[0].pages.map(p => [p.rotation, p.split.index])), [[0, 0], [0, 1]]);
  // מחיקה של חלק אחד מוחקת את שניהם — גם מהכרטיס וגם ממסך האישור.
  const remove = await withGroup({ pitch: 24 });
  remove.c.aiRemoveInvoicePage(0, 1);
  assert.equal(remove.c.aiScanDocuments[0].pages.length, 0);
  const cancel = await withGroup({ pitch: 24 });
  cancel.c.aiOpenOrientationReview(0, 1, false);
  cancel.c.aiCancelOrientationReview();
  assert.equal(cancel.c.aiScanDocuments[0].pages.length, 0);
  // "השאר תמונה מלאה" על חלק אחד — הפריים המלא מחליף את כל החלקים.
  const restore = await withGroup({ pitch: 24 });
  restore.c.aiOpenOrientationReview(0, 1, false);
  await restore.c.aiRestoreOriginalImage();
  const kept = restore.c.aiScanDocuments[0].pages;
  assert.equal(kept.length, 1);
  assert.equal(kept[0].split, null);
  assert.equal(kept[0].cropInfo.reason, 'full_image');
  assert.deepEqual(plain(kept[0].sourceRegion), { x: 0, y: 0, width: SRC_W, height: SRC_H });
});

test('adding photos spreads the parts into the document, and a long receipt that has no room under eight pages is sent as one image', async () => {
  const h = context({ pitch: 24 });
  h.c.aiScanDocuments = [{ noteIndex: 0, pages: [] }];
  await h.c.aiAddInvoiceFiles(0, [{ name: 'a.jpg' }]);
  assert.equal(h.c.aiScanDocuments[0].pages.length, 2);
  assert.ok(h.c.aiScanDocuments[0].pages.every(p => p.split && p.split.count === 2));
  const full = context({ pitch: 24 });
  full.c.aiScanDocuments = [{ noteIndex: 0, pages: Array.from({ length: 7 }, (_, i) => ({ dataUrl: 'p' + i, orientationConfirmed: true })) }];
  await full.c.aiAddInvoiceFiles(0, [{ name: 'b.jpg' }]);
  assert.equal(full.c.aiScanDocuments[0].pages.length, 8);
  const added = full.c.aiScanDocuments[0].pages[7];
  assert.ok(!added.split, 'no room for two parts: one cropped image');
  assert.equal(added.cropInfo.reason, 'cropped');
});
