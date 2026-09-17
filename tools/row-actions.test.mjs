// v97: ההחלטות שהסריקה אינה יכולה לקבל לבד, על התעודה שחשפה אותן.
// תעודה 561010707 (17.9) נקראה עם כל הכסף נכון ועם עמודת הקוד מוסטת בשורה
// אחת מהשורה ה-13 והלאה. הבדיקות כאן מריצות את אותה קריאה שגויה מול אותו
// מאגר, ומוודאות שמסך הקליטה נותן למשתמש בדיוק את מה שחסר לו כדי לסגור אותה.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as harness from './receipt-scan-harness.mjs';

// שלוש שורות מהתעודה האמיתית: קוד תקין, קוד שנקרא שגוי, וקוד שלא נקרא כלל.
const products = [
  { id: 'p_yolo_chocolate', name: 'YOLO שוקולד חלב מעולה 123 גרם', barcode: '7290014761056', price: 3.47 },
  { id: 'p_yolo_layers', name: 'YOLO מעדן שכבות שוקולד חלב ולבן 122 גרם', barcode: '7290014761414', price: 3.47 },
  { id: 'p_prili', name: 'פרילי תות 125 גרם', barcode: '72961506', price: 2.58 },
  { id: 'p_cream', name: 'שמנת עמידה לבישול 15% השף הלבן 250 מ"ל', barcode: '7290004125721', price: 6.77 }
];
const paperRow = (overrides) => Object.assign({ section: 'items', sourcePage: 1, promoStar: false, confidence: .8 }, overrides);
const rows = [
  paperRow({ lineNumber: 1, code: '14761056', description: 'מעדן שוקולד חלב YOLO', quantity: 10, unitPriceExVat: 3.47, lineTotalExVat: 34.70 }),
  // הקוד המודפס 14761414 נקרא כ-14761014: ספרה אחת, מוצר שלא קיים במאגר.
  paperRow({ lineNumber: 2, code: '14761014', description: 'מעדן שוקו דל חלב YOLO', quantity: 6, unitPriceExVat: 3.47, lineTotalExVat: 20.82 }),
  // הקוד לא נקרא בביטחון ולכן הוחזר null, כפי שהשרת מורה.
  paperRow({ lineNumber: 3, code: null, description: 'מעדן שוקו דל חלב YOLO', quantity: 12, unitPriceExVat: 2.58, lineTotalExVat: 30.96 }),
  // מכאן ההסטה: הקוד של השורה הקודמת על הכמות והמחיר של השורה הזאת.
  paperRow({ lineNumber: 4, code: '72961506', description: 'פרה שוקו 125', quantity: 24, unitPriceExVat: 6.77, lineTotalExVat: 162.48 })
];
const sum = rows.reduce((total, row) => total + row.lineTotalExVat, 0);
const document = { noteIndex: 0, docNumber: '561010707', invoiceNumber: '561010707', docType: 'invoice', docDate: '17/09/2026',
  pageCount: 1, vatPct: 18, rows, confidence: .78, itemsSectionTotalExVat: sum, promoDiscountExVat: 0, documentDiscountExVat: 0,
  itemsPrintedLines: rows.length, printedLines: rows.length, returnsSectionTotalExVat: null, returnsPrintedLines: null,
  subtotalExVat: sum, netToChargeExVat: sum, printedUnits: null, totalUnits: null, warnings: [] };
const consensus = {
  attempted: true, reads: 2, completedReads: 2, agreed: false, reason: 'reads_disagree', escalated: true,
  model: 'gpt-5.6-luna', escalationModel: 'gpt-5.6-terra', escalationError: null, diffs: [],
  disputedRows: [{ noteIndex: 0, rowIndex: 3, lineNumber: 4, code: '72961506', description: 'פרה שוקו 125',
    fields: [{ field: 'code', selected: '72961506', other: '4125721' }] }]
};
const data = { products, promos: [], items: [],
  paper: { ok: true, serviceVersion: 11, model: 'gpt-5.6-terra', requestId: 'row-actions-fixture', consensus,
    scan: { warnings: [], documents: [document] } } };

async function scanned(overrides = {}) {
  const c = harness.runtime('tnuva', { data: JSON.parse(JSON.stringify(Object.assign({}, data, overrides))) });
  c.run(`currentView='receiving'; mainMode='receiving'; scanPurpose='receiving';
    openScanner = () => { scannerOpened = true; }; closeScanner = () => { scannerOpened = false; };
    scanBeep = () => {}; buzz = () => {}; refreshScanHost = () => {};
    showConfirm = (title, text, label, run) => { confirmed = { title, text }; run(); };
    aiScanDocuments = [{ noteIndex: 0, amount: null, units: null, lines: null,
      pages: [{ dataUrl: 'data:image/jpeg;base64,Zml4dHVyZQ==', orientationConfirmed: true }] }];
    if (typeof auditOriginalAnalyzer !== 'undefined') aiRunAnalyzer = auditOriginalAnalyzer;`);
  await c.run('tnuvaStartPaperScan()');
  return c;
}
const actions = c => JSON.parse(c.run(`JSON.stringify((function(){ const a = receiptRowActions();
  return { state: a.state, decided: a.decided, total: a.total,
    unidentified: a.unidentified.map(x => ({ line: x.row.line, code: x.row.code, doc: x.row.documentIndex, source: x.row.sourceIndex })),
    priced: a.priced.map(x => ({ line: x.row.line, name: x.row.name, printed: x.row.originalUnitPrice, catalog: x.row.catalogBasePrice, doc: x.row.documentIndex, source: x.row.sourceIndex })),
    disputed: a.disputed.map(x => ({ line: x.row.line, fields: x.dispute.fields })) };
})())`));
const html = c => { c.run('renderReceiving()'); return c.node('app').innerHTML; };

test('a code the catalog does not know reaches the receiving screen as a decision, not as silence', async () => {
  const c = await scanned();
  const list = actions(c);
  assert.equal(list.state, 'ready');
  assert.deepEqual(list.unidentified.map(row => row.line), [2, 3], 'the misread code and the unread code both surface');
  const view = html(c);
  assert.match(view, /הקוד שבשורה אינו במאגר/);
  assert.match(view, /סרוק ברקוד מהמוצר/);
  assert.match(view, /מוצר חדש בלי סריקה/);
  assert.match(view, /שורות דורשות החלטה לפני הקליטה/);
});

test('scanning the physical barcode maps the row to an existing product, after warning about the printed code', async () => {
  const c = await scanned();
  c.click('rowfix-scan', null, { doc: '0', row: '1' });
  assert.equal(c.run('scanPurpose'), 'rowproduct');
  assert.equal(c.run('scannerOpened'), true);
  c.run("onScanned('7290014761414')");
  // הקוד המודפס נקרא 14761014 והברקוד מסתיים ב-14761414 — המשתמש אישר במפורש.
  assert.match(c.run('confirmed.title'), /הברקוד אינו תואם/);
  assert.equal(c.run('scannerOpened'), false);
  const row = JSON.parse(c.run("JSON.stringify(aiScanResponse.scan.documents[0].rows[1])"));
  assert.equal(row.__tnuvaProductId, 'p_yolo_layers');
  assert.equal(row.barcodeMatchMethod, 'user_confirmed');
  assert.equal(row.barcodeUserConfirmedFromMethod, 'scanned_product');
  // הזהות שאושרה עומדת בכללי הראיות של המתאם, ולא רק נכתבה לשורה.
  assert.equal(JSON.parse(c.run("JSON.stringify(aiResolveInvoiceBarcode(aiScanResponse.scan.documents[0].rows[1]).product || null)")).id, 'p_yolo_layers');
  assert.deepEqual(actions(c).unidentified.map(item => item.line), [3], 'only the unread code is left');
});

test('a barcode that is not in the catalog opens the full new product card, prefilled from the paper', async () => {
  const c = await scanned();
  c.click('rowfix-scan', null, { doc: '0', row: '2' });
  c.run("onScanned('7290000000121')");
  assert.equal(c.run("$('prodTitle').textContent"), 'מוצר חדש');
  assert.equal(c.run("$('prod_barcode').value"), '7290000000121');
  assert.equal(c.run("$('prod_price').value"), '2.58', 'the printed unit price starts the card');
  assert.equal(c.run("$('prod_name').value"), 'מעדן שוקו דל חלב YOLO', 'the printed description starts the name');
  // שמירת המוצר סוגרת את השורה באותה ראיה: הברקוד שנסרק.
  c.run("$('prod_name').value = 'מעדן חדש'; products.push({id:'p_new', name:'מעדן חדש', barcode:'7290000000121', price:2.58});");
  c.run("receiptCompleteRowProduct(products[products.length-1])");
  const row = JSON.parse(c.run("JSON.stringify(aiScanResponse.scan.documents[0].rows[2])"));
  assert.equal(row.__tnuvaProductId, 'p_new');
  assert.equal(row.barcodeUserConfirmedFromMethod, 'scanned_product');
  assert.deepEqual(actions(c).unidentified.map(item => item.line), [2], 'only the row this test closed left the list');
});

test('a printed price that is neither the catalog price nor a promotion price becomes one decided row', async () => {
  const c = await scanned();
  const priced = actions(c).priced;
  assert.deepEqual(priced.map(row => row.line), [4]);
  assert.equal(priced[0].printed, 6.77);
  assert.equal(priced[0].catalog, 2.58, 'the shifted code pointed the row at the wrong product');
  const view = html(c);
  assert.match(view, /המחיר בתעודה שונה מהמחיר במאגר/);
  assert.match(view, /מחיר מודפס בתעודה: ₪6\.77/);
  assert.match(view, /מחיר במאגר: ₪2\.58/);
  assert.match(view, /אשר לתעודה הזאת/);
  assert.match(view, /עדכן את מחיר המאגר ל-₪6\.77/);
});

test('approving a price for the document alone leaves the catalog untouched, and survives a redraw', async () => {
  const c = await scanned();
  c.click('rowfix-price-doc', null, { doc: '0', row: '3' });
  assert.equal(c.run("products.find(p => p.id === 'p_prili').price"), 2.58, 'the catalog price is not touched');
  assert.equal(c.writes.length, 0, 'nothing was written to the cloud');
  assert.deepEqual(actions(c).priced, []);
  assert.equal(actions(c).decided, 1);
  assert.match(html(c), /1 שורות אושרו ידנית/);
  // ההחלטה שורדת שמירה וטעינה מחדש של הטיוטה.
  const b = harness.runtime('tnuva', { storage: c.storage, data: JSON.parse(JSON.stringify(data)) });
  b.run("currentView='receiving'; mainMode='receiving'");
  assert.equal(JSON.parse(b.run('JSON.stringify(receiptRowActions())')).decided, 1);
});

test('updating the catalog price writes once, and the row leaves the list because it now matches', async () => {
  const c = await scanned();
  c.click('rowfix-price-catalog', null, { doc: '0', row: '3' });
  await c.run('Promise.resolve()');
  assert.match(c.run('confirmed.title'), /עדכון מחיר במאגר/);
  assert.equal(c.writes.length, 1);
  assert.equal(c.writes[0].op, 'update');
  assert.equal(c.writes[0].data.price, 6.77);
  assert.equal(c.run("products.find(p => p.id === 'p_prili').price"), 6.77);
  assert.deepEqual(actions(c).priced, []);
});

test('a row the two reads disagreed on is raised with what each read saw', async () => {
  const c = await scanned();
  // השורה שבמחלוקת כאן היא גם שורת מחיר, ולכן היא מופיעה ככרטיס מחיר עם העדות.
  const view = html(c);
  assert.match(view, /שתי הסריקות של הצילום לא קראו את השורה אותו דבר/);
  assert.match(view, /קוד: 72961506 מול 4125721/);
  assert.match(view, /gpt-5\.6-terra/);
});

test('the summary window points back to receiving instead of showing buttons nothing listens to', async () => {
  const c = await scanned();
  const summary = c.run("receiptPriceAuditHtml(null, { actions: false })");
  assert.match(summary, /שורות דורשות החלטה — חזור למסך הקליטה/);
  assert.doesNotMatch(summary, /data-role="rowfix-/);
});

test('a decision expires when the numbers it was given on change', async () => {
  const c = await scanned();
  c.click('rowfix-price-doc', null, { doc: '0', row: '3' });
  assert.equal(actions(c).decided, 1);
  c.run("products.find(p => p.id === 'p_prili').price = 5; renderReceiving();");
  assert.equal(actions(c).decided, 0, 'the catalog moved, so the approval no longer covers the row');
  assert.deepEqual(actions(c).priced.map(row => row.line), [4]);
});
