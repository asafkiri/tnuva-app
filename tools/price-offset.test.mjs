// v147: הכלל של בעל החנות — קיזוז לפי מחיר, לא לפי שם. חוסר ועודף באותו מחיר
// ליחידה (עד האגורה) הם אותו כסף, ולכן מתקזזים לבד: בתוך התעודה (הקיזוז הפנימי,
// עכשיו עם "בטל") ובין תעודות (הקיזוז האוטומטי, שעד כאן דרש אותו מוצר ואותה
// כמות). הכמות שמתקזזת היא המשותפת; היתרה נשארת חוסר או עודף פתוח. כל קיזוז
// אוטומטי מוצג בכרטיס התעודה וניתן לביטול, וזוג שבוטל אינו חוזר לבד.
// הרצה: node --test tools/price-offset.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as harness from './receipt-scan-harness.mjs';

const strip = s => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const json = (r, expression) => JSON.parse(r.run('JSON.stringify(' + expression + ')'));
const tick = () => new Promise(resolve => setImmediate(resolve));
const MOCHA = { id: 'mocha', name: 'מוקה ליטר', price: 4.4 };
const VANILLA = { id: 'vanilla', name: 'וניל ליטר', price: 4.4 };
const CHOCO = { id: 'choco', name: 'שוקו ליטר', price: 4.4 };
const BUTTER = { id: 'butter', name: 'חמאה', price: 4.41 };

function create() {
  const r = harness.runtime('tnuva');
  r.run(`cloudLog = []; runCloudTaskSilent = async (name, task) => { cloudLog.push(task); return true; };
    mkRc = (id, day, lines, extra) => Object.assign({ id, date: '2026-09-' + day, docDate: '2026-09-' + day, timestamp: Date.parse('2026-09-' + day + 'T08:00:00Z'), status: 'open',
      items: lines.map(([p, qty, noteQty]) => ({ productId: p.id, name: p.name, qty, noteQty, unitPrice: p.price, lineTotal: Math.round(p.price * qty * 100) / 100 })) }, extra || {});
    paperOf = rc => ({ ...rc, noteParts: [{ amount: Math.round(rc.items.reduce((a, l) => a + l.unitPrice * (l.noteQty != null ? l.noteQty : l.qty), 0) * 100) / 100, lines: rc.items.length }],
      noteTotalInc: Math.round(rc.items.reduce((a, l) => a + l.unitPrice * (l.noteQty != null ? l.noteQty : l.qty), 0) * 100) / 100 });`);
  r.context.P = { MOCHA, VANILLA, CHOCO, BUTTER };
  return r;
}
const sweep = r => r.run(`autoApplyExactOffsets().then(a => JSON.stringify(a.map(p => [p.rc.id, p.other.id, p.productId, p.otherProductId, p.qty, p.byPrice])))`).then(JSON.parse);
const state = (r, index) => json(r, `(d => ({ open: d.open, short: d.shortItems.map(x => x.productId + ':' + x.n), over: d.overItems.map(x => x.productId + ':' + x.n),
  groups: d.priceOffsets.map(g => [g.id, g.qty, g.shortItems.map(x => x.productId + ':' + x.n).join('+'), g.overItems.map(x => x.productId + ':' + x.n).join('+')]),
  external: d.externalOffsets.map(x => [x.dir, x.productId, x.qty]), payable: receiptPayableBaseEx(receipts[${index}]) }))(receiptDiscrepancyInfo(receipts[${index}]))`);
function renderHistory(r) {
  r.run("currentView = 'receiptsHistory'; receiptHistoryFilter = 'all'; renderReceiptsHistory()");
  return r.node('app').innerHTML;
}
const diffRows = html => [...html.matchAll(/<div class="font-bold truncate">([^<]*)<\/div><div class="text-\[11px\] opacity-80">([^<]*)<\/div>/g)].map(m => (m[1] + ' | ' + m[2]).replace(/ /g, ' '));

test('בתוך התעודה: חוסר ועודף באותו מחיר ליחידה מתקזזים לבד — מוצרים שונים, הכמות המשותפת, והיתרה נשארת פתוחה', () => {
  const r = create();
  // הנייר: 6 מוקה (₪4.40). נסרקו: 0 מוקה, 4 וניל (₪4.40) שאינם בנייר.
  r.run(`receipts = [paperOf(mkRc('rc', '28', [[P.MOCHA, 0, 6], [P.VANILLA, 4, 0]]))];`);
  assert.deepEqual(state(r, 0), { open: true, short: ['mocha:2'], over: [], groups: [['xin|440', 4, 'mocha:4', 'vanilla:4']], external: [], payable: 17.6 });
  const html = renderHistory(r);
  const box = strip(html.slice(html.indexOf('קיזוז פנימי אוטומטי'), html.indexOf('</div>', html.indexOf('לא נכון?'))));
  assert.equal(box, 'קיזוז פנימי אוטומטי — חוסר ועודף באותו מחיר ליחידה 4 × מוקה ליטר ⇄ 4 × וניל ליטר · ₪4.40 ליח׳ · ₪17.60 בטל הכסף זהה, ולכן השורות התקזזו לבד ואינן מופחתות מהתשלום. לא נכון? בטל — החוסר והעודף יחזרו להיות פתוחים ולא יקוזזו שוב לבד.');
  assert.match(html, /data-role="rc-offset-cancel" data-id="rc" data-group="xin\|440"/);
  assert.deepEqual(diffRows(html), ['חסר: מוקה ליטר | 2 יח׳ · ₪8.80'], 'רק היתרה נשארת שורת הפרש');
  // כמות שווה — התעודה מאוזנת, והסטטוס אומר איך
  r.run(`receipts = [paperOf(mkRc('rc', '28', [[P.MOCHA, 0, 6], [P.VANILLA, 6, 0]]))];`);
  assert.deepEqual(state(r, 0), { open: false, short: [], over: [], groups: [['xin|440', 6, 'mocha:6', 'vanilla:6']], external: [], payable: 26.4 });
  assert.ok(strip(renderHistory(r)).includes('אומתה · קיזוז פנימי'));
});

test('מחיר שנבדל באגורה אינו מתקזז, ושורת פיקדון מתקזזת לפי מחיר רק בתוך התעודה', async () => {
  const r = create();
  r.run(`receipts = [paperOf(mkRc('rc', '28', [[P.MOCHA, 0, 6], [P.BUTTER, 6, 0]]))];`);
  assert.deepEqual(state(r, 0).groups, []);
  assert.deepEqual(state(r, 0).short, ['mocha:6']);
  // פיקדון ₪13 חסר בתעודה אחת ומוצר ב-₪13 עודף בתעודה אחרת — לא מתקזזים לבד
  r.run(`receipts = [mkRc('today', '28', [[{ id: 'crate', name: 'ארגז', price: 13 }, 2, 0]]), mkRc('yday', '27', [[{ id: 'deposit-recv-x', name: 'פיקדון', price: 13 }, 0, 2]])];`);
  assert.deepEqual(await sweep(r), []);
});

test('"בטל" על הקיזוז הפנימי: החוסר והעודף חוזרים, הביטול נשמר בתעודה ואינו מתקזז שוב — גם במסך העריכה', async () => {
  const r = create();
  r.run(`receipts = [paperOf(mkRc('rc', '28', [[P.MOCHA, 0, 6], [P.VANILLA, 6, 0]]))]; currentView = 'receiptsHistory';`);
  await r.run("cancelReceiptOffset('rc', 'xin|440')");
  const write = r.writes.at(-1);
  assert.equal(write.op, 'batch');
  assert.deepEqual(write.writes.map(w => w.data), [{ canceledOffsetIds: ['xin|440'] }], 'רק הסימון נכתב — אין רשומת קיזוז להסיר');
  assert.deepEqual(state(r, 0), { open: true, short: ['mocha:6'], over: ['vanilla:6'], groups: [], external: [], payable: 0 });
  assert.match(r.toasts.at(-1), /הקיזוז בוטל — החוסר והעודף חזרו להיות פתוחים/);
  const html = renderHistory(r);
  assert.ok(!html.includes('קיזוז פנימי אוטומטי'));
  assert.equal((html.match(/data-role="rc-offset-choose"/g) || []).length, 2, 'שני "מצא קיזוז" — החוסר והעודף פתוחים');
  assert.equal(r.run('findOffsetMatch(receipts[0])'), null);
  assert.deepEqual(await sweep(r), [], 'הסריקה האוטומטית אינה מקזזת בתוך תעודה שבוטלה');
  // מסך העריכה רואה את אותו ביטול
  r.run("openReceiptFix('rc')");
  assert.deepEqual(json(r, 'receiptFixOpenLines().map(l => l.productId)'), ['mocha', 'vanilla']);
  assert.equal(json(r, 'receiptFixLineState("mocha").internalOffsetQty'), 0);
  // ביטול שני של אותה קבוצה — אין מה לבטל
  await r.run("cancelReceiptOffset('rc', 'xin|440')");
  assert.equal(r.toasts.at(-1), 'הקיזוז כבר בוטל');
});

test('בין תעודות: מוצר אחר באותו מחיר מתקזז לבד, ההודעה והכרטיס אומרים מול מה ולמה', async () => {
  const r = create();
  r.run(`receipts = [paperOf(mkRc('today', '28', [[P.VANILLA, 6, 0]])), paperOf(mkRc('yday', '27', [[P.MOCHA, 0, 6]]))];`);
  const applied = await sweep(r);
  assert.deepEqual(applied, [['today', 'yday', 'vanilla', 'mocha', 6, true]]);
  const todayOffsets = json(r, 'receipts[0].externalOffsets'), ydayOffsets = json(r, 'receipts[1].externalOffsets');
  assert.equal(todayOffsets.length, 1); assert.equal(ydayOffsets.length, 1);
  assert.equal(todayOffsets[0].id, ydayOffsets[0].id);
  assert.deepEqual([todayOffsets[0].productId, todayOffsets[0].otherProductId, todayOffsets[0].dir, todayOffsets[0].price, todayOffsets[0].source], ['vanilla', 'mocha', 'over', 4.4, 'auto']);
  assert.deepEqual([ydayOffsets[0].productId, ydayOffsets[0].otherProductId, ydayOffsets[0].dir], ['mocha', 'vanilla', 'short']);
  assert.equal(state(r, 0).open, false); assert.equal(state(r, 1).open, false);
  assert.equal(state(r, 1).payable, 26.4, 'החוסר אינו מופחת — הכסף הגיע בוניל');
  const toast = r.run(`(async () => { const a = []; receipts = [paperOf(mkRc('t2', '28', [[P.VANILLA, 6, 0]])), paperOf(mkRc('y2', '27', [[P.MOCHA, 0, 6]]))]; return autoOffsetToastText(await autoApplyExactOffsets()); })()`);
  assert.equal(await toast, '⚖️ קיזוז אוטומטי: 6 × וניל ליטר (עודף) מול 6 × מוקה ליטר (חסר) בתעודה אחרת — אותו מחיר ליחידה ₪4.40 (₪26.40). אפשר לבטל בכרטיס התעודה.');
  const html = renderHistory(r);
  assert.ok(strip(html).includes('6 × וניל ליטר ⇄ 6 × מוקה ליטר — קוזז אוטומטית מול תעודה מ-27.9.2026 (אותו מחיר ליחידה ₪4.40)'), strip(html));
  assert.ok(strip(html).includes('6 × מוקה ליטר ⇄ 6 × וניל ליטר — קוזז אוטומטית מול תעודה מ-28.9.2026 (אותו מחיר ליחידה ₪4.40)'));
  assert.ok(strip(html).includes('קיזוזים פעילים — כולל קיזוז אוטומטי'));
  assert.equal((strip(html).match(/אומתה · קיזוז מול תעודה אחרת/g) || []).length, 2);
});

test('בין תעודות: הכמות המשותפת מתקזזת, היתרה נשארת, ועודף שגדל אחר כך מצטרף לאותה רשומה (בלי כפילות ובלי לולאה)', async () => {
  const r = create();
  r.run(`receipts = [paperOf(mkRc('today', '28', [[P.VANILLA, 4, 0]])), paperOf(mkRc('yday', '27', [[P.MOCHA, 0, 6]]))];`);
  assert.deepEqual(await sweep(r), [['today', 'yday', 'vanilla', 'mocha', 4, true]]);
  assert.deepEqual(state(r, 1), { open: true, short: ['mocha:2'], over: [], groups: [], external: [['short', 'mocha', 4]], payable: 17.6 });
  assert.deepEqual(await sweep(r), [], 'אין עוד מה לקזז');
  // עוד 2 וניל הגיעו (עריכת התעודה) — הרשומה גדלה ל-6, לא נוספת רשומה שנייה
  r.run(`receipts[0].items[0].qty = 6; receipts[0].items[0].lineTotal = 26.4;`);
  assert.deepEqual(await sweep(r), [['today', 'yday', 'vanilla', 'mocha', 2, true]]);
  assert.deepEqual(json(r, 'receipts.map(rc => rc.externalOffsets.map(x => [x.id, x.qty]))'), [[[r.run("crossOffsetId('today', 'yday', 'vanilla', 'mocha')"), 6]], [[r.run("crossOffsetId('today', 'yday', 'vanilla', 'mocha')"), 6]]]);
  assert.equal(state(r, 1).open, false); assert.equal(state(r, 0).open, false);
  assert.deepEqual(await sweep(r), []);
});

test('אותו מוצר קודם לאותו מחיר, גם כשהתעודה עם אותו מחיר קרובה יותר', async () => {
  const r = create();
  r.run(`receipts = [paperOf(mkRc('today', '28', [[P.MOCHA, 0, 6]])), paperOf(mkRc('yday', '27', [[P.VANILLA, 6, 0]])), paperOf(mkRc('older', '26', [[P.MOCHA, 6, 0]]))];`);
  assert.deepEqual(await sweep(r), [['today', 'older', 'mocha', 'mocha', 6, false]]);
  assert.deepEqual(state(r, 1).over, ['vanilla:6'], 'הוניל נשאר עודף פתוח');
  assert.ok(strip(renderHistory(r)).includes('6 × מוקה ליטר — קוזז אוטומטית מול תעודה מ-26.9.2026 (אותו מוצר ואותו מחיר)'));
});

test('זוג שבוטל — גם של שני מוצרים — אינו חוזר לבד, ובכרטיס כתוב למה הוא מוצע לאישור', async () => {
  const r = create();
  r.run(`receipts = [paperOf(mkRc('today', '28', [[P.VANILLA, 6, 0]])), paperOf(mkRc('yday', '27', [[P.MOCHA, 0, 6]]))]; currentView = 'receiptsHistory';`);
  await sweep(r);
  const groupId = r.run("receipts[0].externalOffsets[0].id");
  await r.run(`cancelReceiptOffset('today', '${groupId}')`);
  assert.deepEqual(json(r, 'receipts.map(rc => [rc.externalOffsets.length, rc.canceledOffsetIds])'), [[0, [groupId]], [0, [groupId]]]);
  assert.deepEqual(await sweep(r), []);
  assert.equal(state(r, 1).open, true);
  const html = strip(renderHistory(r));
  assert.ok(html.includes('קיזוז מזוהה — ממתין לאישורך'));
  assert.ok(html.includes('קיזוז כזה בוטל בעבר, ולכן הוא לא מתבצע לבד.'));
  // מחוץ לחלון 9 התעודות — ההצעה אומרת זאת
  r.run(`receipts = [paperOf(mkRc('today', '28', [[P.VANILLA, 6, 0]]))].concat(Array.from({ length: 8 }, (_, i) => mkRc('f' + i, '2' + i, [[P.BUTTER, 1, 1]])), [paperOf(mkRc('old', '01', [[P.MOCHA, 0, 6]]))]);`);
  assert.deepEqual(await sweep(r), []);
  assert.ok(strip(renderHistory(r)).includes('אחת התעודות אינה בין 9 התעודות האחרונות, ולכן הקיזוז לא מתבצע לבד — אפשר לאשר אותו כאן.'));
});

test('ביטול של זוג ידני בתוך התעודה משחרר את שני המוצרים — והקיזוז הפנימי אינו בולע אותם מיד בחזרה', async () => {
  const r = create();
  // קיזוז לפי שווי שנשמר בתוך אותה תעודה (מוקה חסר ⇄ וניל עודף), ואז "בטל"
  r.run(`receipts = [paperOf(mkRc('rc', '28', [[P.MOCHA, 0, 6], [P.VANILLA, 6, 0]], { externalOffsets: [
      { id: 'g|short|rc|mocha', groupId: 'g', otherId: 'rc', productId: 'mocha', name: 'מוקה ליטר', qty: 6, dir: 'short', at: 1, source: 'manual-value', amountEx: 26.4, shortName: 'מוקה ליטר', overName: 'וניל ליטר', shortProductId: 'mocha', overProductId: 'vanilla' },
      { id: 'g|over|rc|vanilla', groupId: 'g', otherId: 'rc', productId: 'vanilla', name: 'וניל ליטר', qty: 6, dir: 'over', at: 1, source: 'manual-value', amountEx: 26.4, shortName: 'מוקה ליטר', overName: 'וניל ליטר', shortProductId: 'mocha', overProductId: 'vanilla' }] }))]; currentView = 'receiptsHistory';`);
  assert.deepEqual(state(r, 0), { open: false, short: [], over: [], groups: [], external: [['short', 'mocha', 6], ['over', 'vanilla', 6]], payable: 26.4 }, 'הקיזוז השמור נצרך קודם — הקיזוז הפנימי אינו מוצג פעמיים');
  assert.ok(strip(renderHistory(r)).includes('קיזוז ידני: מוקה ליטר ⇄ וניל ליטר · ₪26.40'));
  await r.run("cancelReceiptOffset('rc', 'g')");
  assert.deepEqual(json(r, '[receipts[0].externalOffsets, receipts[0].canceledOffsetIds]'), [[], ['g', 'xin|440']]);
  assert.deepEqual(state(r, 0), { open: true, short: ['mocha:6'], over: ['vanilla:6'], groups: [], external: [], payable: 0 });
});

// הקליטה עצמה: הנייר אומר 12 × גבינה, נסרקו 12 × חלב באותו מחיר. מסך התוצאות אומר
// מראש שהזוג יתקזז, הסיכום מציג את הקיזוז, והתעודה נשמרת מאוזנת.
const CATALOG = [
  { id: 'A', name: 'גבינה א בדיקה', barcode: '7290000000008', price: 5 },
  { id: 'B', name: 'חלב ב בדיקה', barcode: '7290000000015', price: 5 },
  { id: 'C', name: 'קפה ג בדיקה', barcode: '7290000000022', price: 6 }
];
function paperScan(paper, scanned) {
  const rows = Object.entries(paper).map(([id, quantity], i) => {
    const p = CATALOG.find(x => x.id === id);
    return { section: 'items', sourcePage: 1, lineNumber: i + 1, code: String(i + 1), barcode: p.barcode, barcodeObserved: p.barcode,
      barcodeReadType: 'full', barcodeMatchMethod: 'exact_full', description: p.name, quantity, unitPriceExVat: p.price,
      grossLineTotalExVat: quantity * p.price, lineTotalExVat: quantity * p.price, lineDiscountExVat: 0, promoStar: false, confidence: .95 };
  });
  const total = rows.reduce((a, row) => a + row.lineTotalExVat, 0);
  return { products: CATALOG, promos: [],
    items: Object.entries(scanned).map(([id, qty]) => { const p = CATALOG.find(x => x.id === id); return { productId: id, name: p.name, barcode: p.barcode, qty }; }),
    paper: { ok: true, serviceVersion: 10, model: 'fixture', requestId: 'v147', scan: { warnings: [], documents: [{
      noteIndex: 0, docNumber: 'INV-1', invoiceNumber: 'INV-1', docType: 'invoice', docDate: '28/09/2026', pageCount: 1, vatPct: 18,
      rows, confidence: .95, itemsSectionTotalExVat: total, promoDiscountExVat: 0, documentDiscountExVat: 0,
      itemsPrintedLines: rows.length, printedLines: rows.length, returnsSectionTotalExVat: null, returnsPrintedLines: null,
      subtotalExVat: total, netToChargeExVat: total, printedUnits: null, totalUnits: null, warnings: [] }] } } };
}

test('הקליטה מתחילתה ועד הכרטיס: "יתקזז לבד בסיום" במסך התוצאות, הקיזוז בסיכום, והתעודה נשמרת מאוזנת', async () => {
  const cloud = harness.fakeCloud();
  const r = harness.runtime('tnuva', { data: paperScan({ A: 12, C: 2 }, { B: 12, C: 2 }), cloud });
  await cloud.tick();
  r.run("openScanner=()=>{}; closeScanner=()=>{}; scanBeep=()=>{}; buzz=()=>{}; refreshScanHost=()=>{};");
  await r.scan(1);
  r.run('finishReceipt()');
  for (let i = 0; i < 20; i++) await tick();
  assert.equal(r.run('rcStep'), 'ai');
  let html = r.node('app').innerHTML;
  const preview = strip(html.slice(html.indexOf('data-price-offset-preview') + 'data-price-offset-preview'.length, html.indexOf('אלה הבעיות שנמצאו')));
  assert.equal(preview, '> יתקזז לבד בסיום — חוסר ועודף באותו מחיר ליחידה 12 × גבינה א בדיקה ⇄ 12 × חלב ב בדיקה · ₪5.00 ליח׳ הכסף זהה, ולכן הכמות המשותפת לא תופחת מהתשלום; יתרה, אם יש, נשארת חוסר או עודף. אפשר לבטל אחר כך בכרטיס התעודה.');
  assert.ok(strip(html).includes('גבינה א בדיקה חסר 12 יח׳'), 'החוסר עצמו עדיין מוצג כממצא');
  assert.ok(strip(html).includes('חלב ב בדיקה עודף 12 יח׳'));
  r.click('ai-confirm-findings');
  r.run('aiApplyInvoiceResult()');
  const summary = strip(r.node('rsBody').innerHTML);
  assert.ok(summary.includes('קיזוז פנימי אוטומטי — חוסר ועודף באותו מחיר ליחידה 12 × גבינה א בדיקה ⇄ 12 × חלב ב בדיקה · ₪5.00 ליח׳ · ₪60.00 הכסף זהה, ולכן הכמות הזאת אינה מופחתת מהתשלום. אפשר לבטל אחר כך בכרטיס התעודה.'), summary);
  assert.ok(!summary.includes('נשמר עם הפרשים'), 'התעודה מאוזנת');
  assert.ok(summary.includes('לתשלום ללא מע״מ ₪72.00'), summary);
  await r.run('confirmReceipt()');
  const saved = r.writes.slice().reverse().find(w => w && w.data && Array.isArray(w.data.items));
  assert.ok(saved, 'receipt saved');
  assert.equal(saved.data.status, 'ok');
  assert.equal(saved.data.totalExVat, 72);
  r.context.savedRc = { ...saved.data, id: 'rc1' };
  r.run("receipts = [savedRc]; receiptHistoryFilter = 'all'; renderReceiptsHistory()");
  html = strip(r.node('app').innerHTML);
  assert.ok(html.includes('אומתה · קיזוז פנימי'));
  assert.ok(html.includes('קיזוז פנימי אוטומטי — חוסר ועודף באותו מחיר ליחידה 12 × גבינה א בדיקה ⇄ 12 × חלב ב בדיקה · ₪5.00 ליח׳ · ₪60.00 בטל'));
});
