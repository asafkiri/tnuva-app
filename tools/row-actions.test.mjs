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
    settled: a.settled, autoMatched: a.autoMatched, disputed: a.disputed.map(x => ({ line: x.row.line, fields: x.dispute.fields })) };
})())`));
const html = c => { c.run('renderReceiving()'); return c.node('app').innerHTML; };
const paperWith = changes => ({ paper: { ...data.paper, scan: { warnings: [], documents: [{ ...document, ...changes }] } } });
const today = new Date().toLocaleDateString('en-CA');
// מחלוקת על שורה 1 (קוד 14761056, מודפס ₪3.47 — בדיוק מחיר המאגר).
const disputeOnFirstRow = fields => ({ paper: { ...data.paper,
  consensus: { ...consensus, disputedRows: [{ noteIndex: 0, rowIndex: 0, lineNumber: 1, code: '14761056', description: 'מעדן שוקולד חלב YOLO', fields }] },
  scan: { warnings: [], documents: [document] } } });

test('a code disagreement the catalog can settle by itself is not a question for the user', async () => {
  // הקוד השני אינו קיים במאגר, והמחיר המודפס מאשר את הקוד שנבחר.
  const c = await scanned(disputeOnFirstRow([{ field: 'code', selected: '14761056', other: '99999999' }]));
  const list = actions(c);
  assert.deepEqual(list.disputed, [], 'nothing to decide');
  assert.equal(list.settled, 1);
  // שאר השורות של התעודה הזאת (קוד שלא נקרא ושורת מחיר) אינן קשורות.
  assert.equal(list.total, 2);
  // מה שהוכרע נאמר, ולא נעלם בשקט.
  assert.match(html(c), /1 מחלוקות בין שתי הקריאות הוכרעו מול המאגר/);
});

test('a code disagreement where both codes fit the printed price stays a question', async () => {
  // שני מוצרי YOLO במחיר זהה: הכסף אינו מכריע ביניהם, ולכן המשתמש כן נשאל.
  const c = await scanned(disputeOnFirstRow([{ field: 'code', selected: '14761056', other: '14761414' }]));
  const list = actions(c);
  assert.deepEqual(list.disputed.map(item => item.line), [1]);
  assert.equal(list.settled, 0);
  assert.match(html(c), /הסריקות נחלקו על השורה/);
});

test('a promotion star disagreement never blocks a receipt, and a quantity disagreement always does', async () => {
  const star = actions(await scanned(disputeOnFirstRow([{ field: 'promoStar', selected: true, other: false }])));
  assert.deepEqual(star.disputed, [], 'the star only produces an informational finding');
  assert.equal(star.settled, 1);
  const qty = actions(await scanned(disputeOnFirstRow([{ field: 'quantity', selected: 10, other: 16 }])));
  assert.deepEqual(qty.disputed.map(item => item.line), [1], 'a quantity is money');
  assert.equal(qty.settled, 0);
});

// קוד שאין לו שום מועמד תיקון-ספרה במאגר הבדיקה, כדי לבודד את מסלול הקריאה
// השנייה ממסלול תיקון הספרה הוותיק.
const secondReadCase = (rowIndex, other, code = '88888888') => ({ paper: { ...data.paper,
  consensus: { ...consensus, disputedRows: [{ noteIndex: 0, rowIndex, lineNumber: rowIndex + 1, code, description: rows[rowIndex].description,
    fields: [{ field: 'code', selected: code, other }] }] },
  scan: { warnings: [], documents: [{ ...document, rows: rows.map((row, index) => index === rowIndex ? { ...row, code } : row) }] } } });

test('when the losing read holds the only code the catalog knows, the row is matched without asking', async () => {
  // שורה 2: הקוד שנבחר (14761014) אינו במאגר; הקוד של הקריאה השנייה כן,
  // ומחירו שווה למחיר המודפס — בדיוק המצב של 12:29 בתעודה האמיתית.
  const c = await scanned(secondReadCase(1, '14761056'));
  const row = JSON.parse(c.run("JSON.stringify(aiScanResponse.scan.documents[0].rows[1])"));
  assert.equal(row.__tnuvaProductId, 'p_yolo_chocolate');
  assert.equal(row.barcodeMatchMethod, 'tnuva_code_second_read');
  assert.deepEqual(row.__tnuvaRepair, { from: '88888888', to: '14761056', secondRead: true });
  // הזהות עומדת בכללי הראיות של המתאם, ולא רק נכתבה לשורה.
  assert.equal(JSON.parse(c.run("JSON.stringify(aiResolveInvoiceBarcode(aiScanResponse.scan.documents[0].rows[1]).product || null)")).id, 'p_yolo_chocolate');
  // השורה כבר אינה שאלה, והשיוך נאמר במסך ובמסמך הביקורת.
  const list = actions(c);
  assert.deepEqual(list.unidentified.map(item => item.line), [3], 'only the row with no code at all is left');
  assert.equal(list.autoMatched, 1);
  assert.match(html(c), /1 שורות שויכו אוטומטית כשהמחיר אישר את הקוד/);
  assert.equal(c.run("JSON.stringify((aiEvaluateInvoiceScan(aiScanResponse).autoResolutions||[]).map(x=>x.method))"), '["tnuva_code_second_read"]');
  // אבל היא אינה ראיה למחיר: בדיקת המחירים לא תאשר מחיר על סמך זהות שהמחיר בחר.
  assert.equal(JSON.parse(c.run("JSON.stringify(receiptPriceAudit().rows.find(r => r.line === 2).capability)")), 'unidentified');
});

test('a second-read code is adopted only when the catalog price confirms it', async () => {
  // פרילי ₪2.58 מול ₪3.47 בשורה — הקוד קיים במאגר, המחיר שולל אותו.
  const c = await scanned(secondReadCase(1, '72961506'));
  const row = JSON.parse(c.run("JSON.stringify(aiScanResponse.scan.documents[0].rows[1])"));
  assert.equal(row.__tnuvaProductId, null);
  assert.deepEqual(actions(c).unidentified.map(item => item.line), [2, 3]);
  assert.equal(actions(c).autoMatched, 0);
  // וכך גם כשהקריאה השנייה לא קראה קוד כלל — המצב של "יופ. דנונה" ב-12:29.
  const unread = await scanned(secondReadCase(1, null));
  assert.deepEqual(actions(unread).unidentified.map(item => item.line), [2, 3]);
});

test('a code that swallowed digits from the next column still points at one product', async () => {
  // שורה 3: הקוד לא נקרא כלל, הקריאה השנייה נתנה 7296150612 — שמתחיל ב-72961506
  // (פרילי תות, ₪2.58, בדיוק המחיר בשורה). זה המצב של שורה 18 ב-13:50.
  const c = await scanned(secondReadCase(2, '7296150612', null));
  const view = html(c);
  assert.match(view, /פרילי תות 125 גרם/);
  assert.match(view, /הקוד שנקרא \(7296150612\) מכיל את 72961506, והמחיר תואם/);
  c.click('rowfix-pick', null, { doc: '0', row: '2', product: 'p_prili' });
  const row = JSON.parse(c.run("JSON.stringify(aiScanResponse.scan.documents[0].rows[2])"));
  assert.equal(row.__tnuvaProductId, 'p_prili');
  assert.equal(row.barcodeUserConfirmedFromMethod, 'picked_from_catalog');
  assert.equal(JSON.parse(c.run("JSON.stringify(aiResolveInvoiceBarcode(aiScanResponse.scan.documents[0].rows[2]).product || null)")).id, 'p_prili');
  assert.deepEqual(actions(c).unidentified, [], 'the last open row closed with one tap');
});

test('a row with no readable price offers no candidates rather than a guess', async () => {
  const c = await scanned(paperWith({ rows: rows.map((row, index) => index === 2 ? { ...row, unitPriceExVat: null, lineTotalExVat: null } : row) }));
  const candidates = c.run(`JSON.stringify(receiptRowCandidates(receiptPriceAudit().rows.find(r => r.line === 3), null))`);
  assert.deepEqual(JSON.parse(candidates), [], 'no price, no shortlist');
});

test('a product added to the catalog after the scan is still offered as one tap', async () => {
  // בזמן הסריקה הקוד של הקריאה השנייה לא היה במאגר, ולכן לא שויך אוטומטית.
  const c = await scanned(secondReadCase(1, '55503'));
  assert.deepEqual(actions(c).unidentified.map(item => item.line), [2, 3]);
  c.run("products.push({ id: 'p_added', name: 'מוצר שנוסף אחרי הסריקה', barcode: '7290000055503', price: 3.47 });");
  const view = html(c);
  assert.match(view, /הקוד של הקריאה השנייה, 55503, כן קיים במאגר/);
  assert.match(view, /מוצר שנוסף אחרי הסריקה/);
  c.click('rowfix-rival', null, { doc: '0', row: '1' });
  const row = JSON.parse(c.run("JSON.stringify(aiScanResponse.scan.documents[0].rows[1])"));
  assert.equal(row.__tnuvaProductId, 'p_added');
  assert.equal(row.barcodeUserConfirmedFromMethod, 'second_read_code');
  assert.deepEqual(actions(c).unidentified.map(item => item.line), [3]);
});

test('a rival code the catalog does not know, or one whose price disagrees, is not offered', async () => {
  const unknown = await scanned({ paper: { ...data.paper,
    consensus: { ...consensus, disputedRows: [{ noteIndex: 0, rowIndex: 1, lineNumber: 2, code: '14761014', description: 'YOLO',
      fields: [{ field: 'code', selected: '14761014', other: '99999999' }] }] },
    scan: { warnings: [], documents: [document] } } });
  assert.doesNotMatch(html(unknown), /זה המוצר — שייך את השורה/);
  // קוד שקיים במאגר אבל במחיר אחר אינו ראיה: פרילי ₪2.58 מול ₪3.47 בשורה.
  const wrongPrice = await scanned({ paper: { ...data.paper,
    consensus: { ...consensus, disputedRows: [{ noteIndex: 0, rowIndex: 1, lineNumber: 2, code: '14761014', description: 'YOLO',
      fields: [{ field: 'code', selected: '14761014', other: '72961506' }] }] },
    scan: { warnings: [], documents: [document] } } });
  assert.doesNotMatch(html(wrongPrice), /זה המוצר — שייך את השורה/);
});

test('a code disagreement on a row whose printed price contradicts the catalog stays open', async () => {
  const c = await scanned();
  // שורה 4: מודפס ₪6.77 מול ₪2.58 במאגר — הכסף אינו מאשר את הקוד שנבחר.
  const open = c.run(`JSON.stringify((function(){
    const row = receiptPriceAudit().rows.find(r => r.line === 4);
    return receiptDisputeOpenFields(row, { fields: [{ field: 'code', selected: '72961506', other: '99999999' }] });
  })())`);
  assert.equal(JSON.parse(open).length, 1, 'an unconfirmed price cannot settle an identity');
});

test('a date the photo did not carry falls back to today, says so, and stays editable', async () => {
  const c = await scanned(paperWith({ docDate: null }));
  const doc = JSON.parse(c.run('JSON.stringify(receiptPriceAudit().documents[0])'));
  assert.equal(doc.date, today);
  assert.equal(doc.dateAssumed, true);
  // התאריך המונח אינו חוסם שורות: המחירים נבדקים, והמבצעים נשפטים לפי היום.
  assert.equal(c.run("JSON.stringify(receiptPriceAudit().rows.filter(r => r.reason === 'חסר תאריך תעודה לבדיקת תוקף המבצע').length)"), '0');
  const view = html(c);
  assert.match(view, /התאריך לא נקרא מהנייר. הבדיקה מניחה את היום/);
  assert.match(view, /data-role="price-doc-date"/);
  // שינוי ידני מפסיק להיות הנחה ומחושב מחדש מיד.
  c.run("priceAuditSetDate(0, '2026-09-10')");
  const fixed = JSON.parse(c.run('JSON.stringify(receiptPriceAudit().documents[0])'));
  assert.equal(fixed.date, '2026-09-10');
  assert.equal(fixed.dateAssumed, false);
  assert.doesNotMatch(html(c), /הבדיקה מניחה את היום/);
});

test('a date that was read from the paper is not replaced by today', async () => {
  const c = await scanned();
  const doc = JSON.parse(c.run('JSON.stringify(receiptPriceAudit().documents[0])'));
  assert.equal(doc.date, '2026-09-17');
  assert.equal(doc.dateAssumed, false);
});

test('a summary that does not close shows the arithmetic instead of asking for a number out of thin air', async () => {
  // שורת הסיכום נקראה בפחות 60 ₪ — בדיוק הכשל של 17.9, ספרה אחת בסכום.
  const printed = r => Math.round((r - 60) * 100) / 100;
  const c = await scanned(paperWith({ subtotalExVat: printed(sum), netToChargeExVat: printed(sum) }));
  assert.equal(c.run('receiptPaperScanState'), 'failed');
  const banner = c.run('tnuvaPaperStatusHtml()');
  assert.match(banner, /החשבון שנקרא מהנייר/);
  assert.match(banner, new RegExp('שורות הפריטים \\(4\\): ₪' + sum.toFixed(2)));
  assert.match(banner, new RegExp('לפי החשבון הזה הסיכום הוא ₪' + sum.toFixed(2)));
  assert.match(banner, new RegExp('מה שנקרא בשורת "סהכ חייב מעמ": ₪' + printed(sum).toFixed(2)));
  assert.match(banner, /הפרש ₪60\.00 — אחד משני המספרים נקרא שגוי/);
  assert.match(banner, /הקלד עם הסיכום המחושב/);
  assert.match(banner, /הקלד עם המספר שנקרא/);
});

test('choosing one of the two numbers fills the manual entry instead of leaving it blank', async () => {
  const c = await scanned(paperWith({ subtotalExVat: Math.round((sum - 60) * 100) / 100 }));
  c.click('rc-anchor-entry', null, { doc: '0', basis: 'computed' });
  assert.equal(c.run('receiptEntryMode'), 'manual');
  // הסכום נכנס לשדה מעוגל לאגורה, ולא כזנב הצף של חיבור השורות.
  assert.equal(c.run('JSON.stringify(receiptManualInput)'), JSON.stringify({ amount: '248.96', count: '4' }));
  assert.match(html(c), /id="rcNoteInput" value="248\.96"/, 'the number is in the field, not in the user head');
  // הבחירה אינה הופכת את הנייר למאומת.
  assert.notEqual(c.run('receiptAnchorSource'), 'paper');
});

test('a code the catalog does not know reaches the receiving screen as a decision, not as silence', async () => {
  const c = await scanned();
  const list = actions(c);
  assert.equal(list.state, 'ready');
  // שורה 2 (14761014) משויכת מאליה בתיקון ספרה שהמחיר אישר; נשארת שורה 3,
  // שבה לא נקרא קוד כלל ואין מה לתקן.
  assert.deepEqual(list.unidentified.map(row => row.line), [3], 'only the row with no code at all is a question');
  assert.equal(list.autoMatched, 1);
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
  // שורה 2 משויכת מאליה בתיקון ספרה (14761014 ← 14761414, המחיר אישר), ולכן
  // אחרי סגירת שורה 3 לא נותרה שאלה.
  assert.deepEqual(actions(c).unidentified, [], 'nothing left to ask');
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
