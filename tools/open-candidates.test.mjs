// v144: ב-22.10 שורה אחת מתוך 23 לא זוהתה (הקוד לא נקרא), ובעל החנות לא מצא איך
// להמשיך: רשימת המועמדים ישבה מקופלת מאחורי שורת טקסט קטנה, ובדיקת המחירים
// אמרה "בדיקת הנחת המבצעים ממתינה להשלמה · 22/23 מחירי בסיס תואמים" בלי לומר
// מה חסר. הבדיקות כאן מריצות תעודה סינתטית באותו מבנה — בלי נתונים פרטיים —
// ומוודאות שהרשימה פתוחה, שהשאלה כתובה, ושהבדיקה אומרת מה נבדק, מה המצב ומה
// לעשות — ושאחרי הבחירה היא באמת נסגרת לבד, כמו שהיא מבטיחה.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime } from './receipt-scan-harness.mjs';

const products = [
  { id: 'milk', name: 'חלב 3% בקרטון 1 ליטר', barcode: '7290004131074', price: 5.36 },
  { id: 'oat', name: 'משקה שיבולת שועל 1 ליטר', barcode: '7290110325619', price: 8.82 },
  { id: 'cheese5m', name: 'גבינה לבנה 5% ועדת מהדרין 250 גרם', barcode: '7290004127008', price: 4.19 },
  { id: 'cheese5b', name: 'גבינה לבנה 5% בד"צ 250 גרם', barcode: '7290004127015', price: 4.19 },
  { id: 'cheese3m', name: 'גבינה לבנה 3% ועדת מהדרין 250 גרם', barcode: '7290004127022', price: 4.19 }
];
const r2 = n => Math.round(n * 100) / 100;
const code = p => p.barcode.slice(-8).replace(/^0+/, '');
const promo = { id: 'drinks', name: 'משקה 15%', pct: 15, start: '2026-10-01', end: '2026-10-31',
  minQty: 1, minUnit: 'unit', type: 'receipt', productIds: ['oat'] };
// שלוש שורות: קוד תקין, שורת מבצע (כוכבית) שההנחה בסיכום היא בדיוק שלה, ושורה
// שהקוד שלה לא נקרא — עם שלושה מוצרים באותו מחיר במאגר, כמו בתעודה של 22.10.
function fixture({ cheeseCode = null, cheeseName = 'גבינה 5% 250 מהדרין', promos = [promo], returns = false, catalog = products } = {}) {
  const rows = [
    { lineNumber: 1, code: code(products[0]), description: products[0].name, quantity: 10, unitPriceExVat: 5.36, promoStar: false },
    { lineNumber: 2, code: code(products[1]), description: products[1].name, quantity: 4, unitPriceExVat: 8.82, promoStar: true },
    { lineNumber: 3, code: cheeseCode, description: cheeseName, quantity: 6, unitPriceExVat: 4.19, promoStar: false }
  ].map(row => ({ ...row, section: 'items', sourcePage: 1, confidence: .83, lineTotalExVat: r2(row.quantity * row.unitPriceExVat) }));
  const gross = r2(rows.reduce((n, r) => n + r.lineTotalExVat, 0));
  const discount = r2(8.82 * .15 * 4); // 5.29
  let subtotal = r2(gross - discount), returnsTotal = null;
  if (returns) {
    rows.push({ section: 'returns', sourcePage: 1, lineNumber: null, code: code(products[0]), description: products[0].name,
      quantity: 2, unitPriceExVat: 5.36, lineTotalExVat: 10.72, promoStar: false, confidence: .9 });
    returnsTotal = 10.72; subtotal = r2(subtotal - 10.72);
  }
  const consensus = { attempted: true, reads: 2, completedReads: 2, agreed: false, reason: 'reads_disagree', escalated: true,
    model: 'gpt-5.6-luna', escalationModel: 'gpt-5.6-terra', escalationSelected: true, escalationError: null, diffs: [],
    disputedRows: cheeseCode ? [] : [{ noteIndex: 0, rowIndex: 2, lineNumber: 3, code: null, description: cheeseName,
      fields: [{ field: 'code', selected: null, other: '2514', confirmed: 1 }] }] };
  return { products: catalog, promos, items: [],
    paper: { ok: true, serviceVersion: 19, model: 'gpt-5.6-terra', requestId: 'open-candidates-fixture', consensus,
      scan: { warnings: [], documents: [{ noteIndex: 0, docType: 'invoice', docDate: null, pageCount: 1, vatPct: 18, rows, confidence: .83,
        itemsSectionTotalExVat: gross, itemsPrintedLines: 3, printedLines: 3, returnsSectionTotalExVat: returnsTotal,
        returnsPrintedLines: returns ? 1 : null, promoDiscountExVat: discount, documentDiscountExVat: discount,
        subtotalExVat: subtotal, netToChargeExVat: subtotal, warnings: [] }] } } };
}
async function scanned(options) {
  const c = runtime('tnuva', { data: fixture(options) });
  c.run(`todayStr = () => '2026-10-22'; currentView = 'receiving'; mainMode = 'receiving'; scanPurpose = 'receiving';
    refreshScanHost = () => {};
    aiScanDocuments = [{ noteIndex: 0, amount: null, units: null, lines: null,
      pages: [{ dataUrl: 'data:image/jpeg;base64,Zml4dHVyZQ==', orientationConfirmed: true }] }];`);
  await c.run('tnuvaStartPaperScan()');
  return c;
}
const read = (c, expr) => JSON.parse(c.run(`JSON.stringify(${expr})`));
const html = c => { c.run('renderReceiving()'); return c.node('app').innerHTML; };
const view = c => c.run('receiptPriceAuditHtml()');
const candidatesBlock = page => { const from = page.indexOf('data-row-candidates'); const to = page.indexOf('data-row-other-ways');
  assert.ok(from > -1 && to > from, 'the candidate list and the "not in the list" block are both on the card');
  return page.slice(from, to); };
const pickIds = block => [...block.matchAll(/data-role="rowfix-pick"[^>]*data-product="([^"]+)"/g)].map(m => m[1]);
const buttonClass = (page, role) => (new RegExp('data-role="' + role + '"[^>]*class="([^"]*)"').exec(page) || [])[1] || '';

test('the candidates are an open, numbered list under an explicit question — nothing to unfold', async () => {
  const c = await scanned();
  assert.deepEqual(read(c, 'receiptRowActions().unidentified.map(x => x.row.line)'), [3]);
  const page = html(c);
  assert.match(page, /שורה אחת דורשת החלטה לפני הקליטה/, 'singular, not "1 שורות"');
  assert.match(page, /הקוד שבשורה אינו במאגר — צריך לבחור מוצר/);
  const block = candidatesBlock(page);
  assert.doesNotMatch(block, /<details|<summary/, 'the list is not folded behind a summary line');
  assert.match(block, /איזה מוצר זה\? לחץ על המוצר הנכון ברשימה:/);
  assert.match(block, /ברשימה 3 מוצרים מהמאגר באותו מחיר כמו בשורה; הראשון הוא עם השם הכי דומה לשם שבנייר/);
  assert.deepEqual(pickIds(block), ['cheese5m', 'cheese5b', 'cheese3m'], 'the closest name first, every candidate a visible button');
  assert.equal((block.match(/השם הכי דומה לשם שבנייר/g) || []).length, 2, 'the mark is on one candidate only (plus the sentence above the list)');
  assert.match(block, /rounded-full[^>]*>1<\/span>/);
  assert.match(block, /rounded-full[^>]*>3<\/span>/);
  assert.doesNotMatch(block, /בחר מוצר מהמאגר · |מועמדים לפי המחיר והשם/);
  // הדרכים האחרות באות אחרי הרשימה, והסריקה כבר אינה הכפתור הראשי.
  assert.match(page, /המוצר לא ברשימה\?/);
  assert.match(page, /סרוק ברקוד מהמוצר/);
  assert.match(page, /מוצר חדש בלי סריקה/);
  assert.doesNotMatch(buttonClass(page, 'rowfix-scan'), /bg-violet-600/, 'the scan button is secondary when the answer may be in the list');
});

test('with no same-price product in the catalog, the card says how to identify and the scan button leads', async () => {
  const c = await scanned({ catalog: products.filter(p => !p.id.startsWith('cheese')) });
  const page = html(c);
  assert.doesNotMatch(page, /data-row-candidates/);
  assert.match(page, /איך מזהים את המוצר\?/);
  assert.match(buttonClass(page, 'rowfix-scan'), /bg-violet-600/);
});

test('when the names tie, nobody is marked as the closest', async () => {
  const c = await scanned({ cheeseName: 'גבינה 250' });
  const block = candidatesBlock(html(c));
  assert.equal(pickIds(block).length, 3);
  assert.doesNotMatch(block, /הכי דומה/);
  assert.match(block, /ברשימה 3 מוצרים מהמאגר באותו מחיר כמו בשורה\. הלחיצה משייכת/);
});

test('the price check says what is checked, what the state is and what to do — in words, not in a fraction', async () => {
  const c = await scanned();
  const page = view(c);
  assert.match(page, /<span role="status">בדיקת המחירים עדיין לא הושלמה · המחיר תואם ב־2 מתוך 3 שורות<\/span>/);
  assert.match(page, /data-price-next>נשאר לזהות שורה אחת — בכרטיס הסגול למעלה\. האישורים שכבר נתת נשמרו; הפירוט למטה\./);
  assert.match(page, /למה הבדיקה עדיין לא הושלמה\?/);
  assert.match(page, /מה נבדק כאן: כל מחיר בתעודה מושווה למחיר שבמאגר, והנחת המבצעים שירדה בסיכום התעודה \(₪5\.29\)/);
  assert.match(page, /מה המצב\?/);
  assert.match(page, /✓ 2 שורות מתוך 3: המחיר בתעודה תואם למחיר במאגר\./);
  assert.match(page, /שורה אחת עדיין לא זוהתה: "גבינה 5% 250 מהדרין"\. בלי לדעת איזה מוצר זה/);
  assert.match(page, /הנחת המבצעים בתעודה: <b>₪5\.29<\/b> · מבצעים שנמצאו במאגר לשורות התעודה: <b>₪5\.29<\/b>\. המבצעים שבמאגר מסבירים את כל ההנחה\./);
  assert.match(page, /מה לעשות\?/);
  assert.match(page, /בחר את המוצר של השורה בכרטיס הסגול שמעל הבדיקה\. אחרי הבחירה הבדיקה תושלם לבד\./);
  assert.match(page, /פירוט המחירים לפי שורה \(3\)/);
  assert.doesNotMatch(page, /ממתינה להשלמה|מחירי בסיס תואמים|הנחה שעדיין צריך להסביר|אין מספיק ראיות לשיוך|נדרש להשלים בדיקה של/);
  // חלון הסיכום אינו יכול ללחוץ על הכרטיס, ולכן הוא מפנה חזרה למסך הקליטה.
  const summary = c.run('receiptPriceAuditHtml(null, { actions: false })');
  assert.match(summary, /שורה אחת דורשת החלטה — חזור למסך הקליטה כדי לסגור אותה/);
  assert.match(summary, /חזור למסך הקליטה ובחר את המוצר של השורה בכרטיס הסגול שמעל הבדיקה\./);
  assert.doesNotMatch(summary, /— בכרטיס הסגול למעלה/);
});

test('picking the first candidate closes the check by itself, as the text promised, without counting goods', async () => {
  const c = await scanned();
  const counted = c.run('JSON.stringify(receiptList)');
  c.click('rowfix-pick', null, { doc: '0', row: '2', product: 'cheese5m' });
  const row = read(c, 'aiScanResponse.scan.documents[0].rows[2]');
  assert.equal(row.__tnuvaProductId, 'cheese5m');
  assert.equal(row.barcodeMatchMethod, 'user_confirmed');
  assert.equal(read(c, 'receiptPriceAudit().complete'), true);
  assert.equal(read(c, 'receiptRowActions().total'), 0);
  assert.match(view(c), /<span role="status">המחירים שנבדקו תואמים · 3 שורות<\/span>/);
  assert.match(view(c), /שורה אחת שויכה על ידך למוצר/);
  assert.equal(c.run('JSON.stringify(receiptList)'), counted, 'the identity does not confirm a received quantity');
});

test('a starred row without a catalog promotion puts "what to do" on the promotion', async () => {
  const c = await scanned({ cheeseCode: '4127008', promos: [] });
  assert.equal(read(c, 'receiptRowActions().total'), 0);
  const page = view(c);
  assert.match(page, /data-price-next>נשאר להגדיר מבצע למוצר אחד\. האישורים שכבר נתת נשמרו/);
  assert.match(page, /₪5\.29 מההנחה עדיין לא מוסברים על ידי המבצעים שבמאגר — כנראה המבצע שחסר במאגר \(למטה\)\./);
  assert.match(page, /הגדר את המבצע של "משקה שיבולת שועל 1 ליטר" — שייך למבצע קיים או פתח מבצע חדש/);
  assert.match(page, /בתעודה המוצר מסומן בכוכבית \(מבצע\), אבל במאגר אין לו מבצע בתוקף לתאריך התעודה/);
  assert.match(page, /data-role="price-add-promo" data-doc="0" data-row="1"/);
  assert.doesNotMatch(page, /תושלם לבד|שורה אחת עדיין לא זוהתה/);
});

test('a reason that belongs to the whole paper is not phrased as a task for the owner', async () => {
  // עמוד חסר: כל השורות ממתינות לו, הבדיקה פתוחה, ואין לבעל החנות מה ללחוץ (כמו ב-no-doc-header).
  const c = await scanned({ cheeseCode: '4127008' });
  c.run("aiScanResponse.scan.warnings.push('חסר עמוד 2 בתעודה')");
  assert.equal(read(c, 'receiptPriceAudit().documents[0].summaryPending'), true);
  const page = view(c);
  assert.match(page, /<span role="status">בדיקת המחירים עדיין לא הושלמה · 3 מתוך 3 שורות לא נבדקו<\/span>/);
  assert.match(page, /data-price-next>אי אפשר להשלים את הבדיקה \(הסיבה למטה\)\. האישורים שכבר נתת נשמרו/);
  assert.match(page, /כל 3 השורות: הפענוח חלקי או חסר עמוד\/מסמך/);
  assert.match(page, /אין כאן מה לעשות עכשיו: את ההנחה בתעודה הזאת אי אפשר לשייך למוצרים אוטומטית/);
  assert.doesNotMatch(page, /נשאר ל|תושלם לבד/);
});
