// v150: הסכמת קריאות על הקוד (שירות 20). בתעודה של 29.10 שתי הקריאות הזולות נחלקו על הקוד של
// שורה 27 (4172329 מול 4127329), הזולה הראשונה נבחרה על הכסף, ו-Terra קראה כמו השנייה. הכרעת
// הבעלים: קריאה חזקה שקראה כמו זולה, או שתי חזקות שקראו אותו קוד, סוגרות את הקוד בלי לשאול כשהקוד
// המוסכם במאגר ומחירו שווה בדיוק למודפס; שכן באותו מחיר שואל, אלא אם שתי החזקות הסכימו (ואז
// השמירות של כלל 109); קוד מוסכם שאינו במאגר — בלי ניחושים, השורה לבחירה. הבדיקות כאן מריצות את
// האפליקציה כולה מול שירות 20 מדומה, על תעודה סינתטית באותו מבנה (שישה קוטג'ים באותו מחיר במאגר).
import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime } from './receipt-scan-harness.mjs';

const products = [
  { id: 'milk', name: 'חלב 3% בקרטון 1 ליטר', barcode: '7290004131074', price: 5.36 },
  { id: 'cottage5m', name: "קוטג' ועדת מהדרין 5% 250 גרם", barcode: '7290004127329', price: 4.6 },
  { id: 'cottage9m', name: "קוטג' ועדת מהדרין 9% 250 גרם", barcode: '7290004127336', price: 4.6 },
  { id: 'cottage3', name: "קוטג' 3% 250 גרם", barcode: '7290004127077', price: 4.6 },
  { id: 'forest', name: 'יופלה פירות יער בשמנת 3% 150 גרם', barcode: '7290004130916', price: 3.69 }
];
const r2 = n => Math.round(n * 100) / 100;
const code = id => products.find(p => p.id === id).barcode.slice(-8).replace(/^0+/, '');
// שלוש שורות: חלב, השורה שבמחלוקת (קוטג' 5% בנייר), וקוטג' 9% שנקרא נכון בכל הקריאות.
function fixture({ selectedCode = '4172329', line = { description: "קוטג'5%'' 250 ו.מהדרין", quantity: 18, unitPriceExVat: 4.6 },
  field = null, secondStrongRead = undefined, escalationSelected = false, version = 20, promos = [], catalog = products } = {}) {
  const rows = [
    { lineNumber: 1, code: code('milk'), description: products[0].name, quantity: 10, unitPriceExVat: 5.36 },
    { lineNumber: 2, code: selectedCode, ...line },
    { lineNumber: 3, code: code('cottage9m'), description: "קוטג'9%'' 250 ו.מהדרין", quantity: 24, unitPriceExVat: 4.6 }
  ].map(row => ({ ...row, section: 'items', sourcePage: 1, promoStar: false, confidence: .85, lineTotalExVat: r2(row.quantity * row.unitPriceExVat) }));
  const subtotal = r2(rows.reduce((n, r) => n + r.lineTotalExVat, 0));
  const consensus = { attempted: true, reads: 2, completedReads: 2, agreed: false, reason: 'reads_disagree', escalated: true,
    model: 'gpt-5.6-luna', escalationModel: 'gpt-5.6-terra', escalationSelected, escalationError: null, unverifiedSingleRead: false,
    strongReadSelection: true, codeAgreement: version >= 20, diffs: [], missingRows: [], docDateUnconfirmed: [],
    disputedRows: field ? [{ noteIndex: 0, rowIndex: 1, lineNumber: 2, code: selectedCode, description: line.description, fields: [field] }] : [] };
  if (secondStrongRead !== undefined) consensus.secondStrongRead = secondStrongRead;
  const attempts = [
    { stage: 'consensus_1', requestedModel: 'gpt-5.6-luna', selected: !escalationSelected, outcome: 'read', paperError: 0 },
    { stage: 'consensus_2', requestedModel: 'gpt-5.6-luna', selected: false, outcome: 'read', paperError: 0 },
    { stage: 'consensus_escalation', requestedModel: 'gpt-5.6-terra', selected: escalationSelected, outcome: 'read', paperError: escalationSelected ? 0 : 2 }];
  return { products: catalog, promos, items: [],
    paper: { ok: true, serviceVersion: version, model: escalationSelected ? 'gpt-5.6-terra' : 'gpt-5.6-luna', requestId: 'code-agreement-fixture', consensus,
      scanAudit: { version: 1, attempts, ...(secondStrongRead !== undefined ? { secondStrongRead } : {}) }, checksumRetryAttempted: false, checksumRetryModel: null,
      scan: { warnings: [], documents: [{ noteIndex: 0, docType: 'invoice', docDate: null, pageCount: 1, vatPct: 18, rows, confidence: .85,
        itemsSectionTotalExVat: subtotal, itemsPrintedLines: 3, printedLines: 3, returnsSectionTotalExVat: null, returnsPrintedLines: null,
        promoDiscountExVat: 0, documentDiscountExVat: 0, subtotalExVat: subtotal, netToChargeExVat: subtotal, warnings: [] }] } } };
}
// שדה הקוד כפי ששירות 20 מוסר אותו: הקריאה שנבחרה ראשונה, אחריה העדים לפי הסדר.
const read = (stage, value, selected = false) => ({ stage, value, ...(selected ? { selected: true } : {}) });
const codeField = (reads, agreement, { confirmed = 0 } = {}) => {
  const selected = reads.find(r => r.selected), others = reads.filter(r => !r.selected && r.value != null);
  return { field: 'code', selected: selected.value, other: others.length ? others[0].value : null, confirmed, reads, agreement };
};
const agreement = (kind, code, stages) => ({ code, kind, stages });
// שירות 20 כשלא נקנתה קריאה רביעית (Terra הסכימה עם זולה): הרשומה אומרת למה.
const agreedRecord = agreed => ({ outcome: 'not_needed', stage: null, model: null, requestId: null, asked: 0, usage: null, closed: [], open: [], differences: [],
  notAsked: [{ noteIndex: 0, rowIndex: 1, page: 1, lineNumber: 2, field: 'code', value: '4172329', reads: [], reason: 'agreed', agreement: agreed }] });

async function scanned(options) {
  const c = runtime('tnuva', { data: fixture(options) });
  c.run(`todayStr = () => '2026-10-29'; currentView = 'receiving'; mainMode = 'receiving'; scanPurpose = 'receiving';
    refreshScanHost = () => {};
    aiScanDocuments = [{ noteIndex: 0, amount: null, units: null, lines: null,
      pages: [{ dataUrl: 'data:image/jpeg;base64,Zml4dHVyZQ==', orientationConfirmed: true }] }];`);
  await c.run('tnuvaStartPaperScan()');
  assert.equal(c.run('receiptPaperScanState'), 'ok', 'the paper closes');
  return c;
}
const json = (c, expr) => JSON.parse(c.run(`JSON.stringify(${expr})`));
const rowTwo = c => json(c, '(function(){ const r = aiScanResponse.scan.documents[0].rows[1]; return { product: r.__tnuvaProductId, method: r.barcodeMatchMethod, observed: r.barcodeObserved, repair: r.__tnuvaRepair }; })()');
const actions = c => json(c, `(function(){ const a = receiptRowActions();
  return { total: a.total, settled: a.settled, modelSettled: a.modelSettled, userSettled: a.userSettled, agreementSettled: a.agreementSettled, agreementMissing: a.agreementMissing,
    autoMatched: a.autoMatched, unidentified: a.unidentified.map(x => ({ line: x.row.line, matched: x.matchedProduct ? x.matchedProduct.id : null })),
    disputed: a.disputed.map(x => ({ line: x.row.line, fields: x.dispute.fields.map(f => f.field) })) }; })()`);
const audit = c => json(c, '(function(){ const a = receiptPriceAudit(); return { complete: a.complete, capabilities: a.rows.map(r => r.capability), products: a.rows.map(r => r.productId) }; })()');
const html = c => { c.run('renderReceiving()'); return c.node('app').innerHTML; };
const history = c => c.run('tnuvaScanHistoryHtml(tnuvaReceiptScanAudit())');
// ההערכה (האזהרות והרזולוציות האוטומטיות שנרשמות ביומן) מחושבת מהתשובה, כמו בכרטיס המנתח.
const evaluation = c => json(c, '(function(){ const e = aiEvaluateInvoiceScan(aiScanResponse) || {}; return { warnings: e.warnings || [], auto: (e.autoResolutions || []).map(x => [x.lineNumber, x.method, x.productId, x.observed]) }; })()');

// 29.10: הזולה שנבחרה קראה 4172329 (אינו במאגר), הזולה השנייה ו-Terra קראו 4127329 — קוטג' 5% ב-₪4.60.
const todayReads = [read('consensus_1', '4172329', true), read('consensus_2', '4127329'), read('consensus_escalation', '4127329')];
const todayAgreement = agreement('strong_cheap', '4127329', ['consensus_2', 'consensus_escalation']);

test('v150: a strong read that read the code like a cheap read settles the row — identified, checkable, no card, said in the settled line', async () => {
  const c = await scanned({ field: codeField(todayReads, todayAgreement), secondStrongRead: agreedRecord(todayAgreement) });
  assert.deepEqual(rowTwo(c), { product: 'cottage5m', method: 'tnuva_code_agreed', observed: '4172329',
    repair: { from: '4172329', to: '4127329', agreement: { kind: 'strong_cheap', stages: ['consensus_2', 'consensus_escalation'] } } });
  // הקוד שנקרא אינו משוכתב: הקריאה שנבחרה עדיין מספקת את הערכים.
  assert.equal(c.run('aiScanResponse.scan.documents[0].rows[1].supplierItemCode'), '4172329');
  assert.deepEqual(actions(c), { total: 0, settled: 1, modelSettled: 0, userSettled: 0, agreementSettled: 1, agreementMissing: 0, autoMatched: 0, unidentified: [], disputed: [] });
  // זיהוי ודאי לבדיקת המחירים — לא "שויכה בעזרת המחיר": הבדיקה נשלמת לבד.
  assert.deepEqual(audit(c), { complete: true, capabilities: ['checkable', 'checkable', 'checkable'], products: ['milk', 'cottage5m', 'cottage9m'] });
  assert.match(c.run('receiptPriceAuditHtml()'), /המחירים שנבדקו תואמים/);
  const view = html(c);
  assert.doesNotMatch(view, /שורה אחת דורשת החלטה|אשר זיהוי|שתי הסריקות של הצילום|data-role="rowfix-rival"/);
  assert.match(view, /<section [^>]*>מחלוקת אחת על הקוד הוכרעה לפי הסכמת הקריאות — המחיר אישר\.<\/section>/);
  // היומן: אזהרת ההתאמה והרזולוציה האוטומטית, כמו תיקון ספרה.
  const ev = evaluation(c);
  assert.ok(ev.warnings.some(w => w.includes("קוטג' ועדת מהדרין 5% 250 גרם: הקריאה שנבחרה קראה את הקוד 4172329, והמודל החזק וקריאה זולה קראו שניהם 4127329 — הוא במאגר ומחיר הקטלוג אישר אותו")), ev.warnings.join('\n'));
  assert.deepEqual(ev.auto, [[2, 'tnuva_code_agreed', 'cottage5m', '4172329']]);
  // פרטי הפענוח של הקליטה השמורה אומרים מה הוכרע ולפי מי.
  assert.match(history(c), /<div data-code-agreed class="text-emerald-800">קוד לפי הסכמת הקריאות: שורה 2: 4127329 \(המודל החזק וקריאה זולה קראו שניהם\)<\/div>/);
  // הבקשה לשירות נשאה את הדגל של שירות 20.
  const sent = JSON.parse(c.requests.find(r => r.url.endsWith('/scan')).body);
  assert.equal(sent.codeAgreement, true);
  assert.equal(sent.strongReadSelection, true);
  // טיוטה ששוחזרה — אותה זהות ואותו מסך, בלי סריקה נוספת.
  c.run('saveReceiptDraft()');
  const restored = runtime('tnuva', { data: fixture(), storage: c.storage });
  restored.run("todayStr = () => '2026-10-29'; restoreReceiptDraft()");
  assert.deepEqual(rowTwo(restored).method, 'tnuva_code_agreed');
  assert.deepEqual(actions(restored).agreementSettled, 1);
  assert.equal(restored.requests.filter(r => r.url.endsWith('/scan')).length, 0);
});

test('v150: a fourth read that matched a cheap read, and two cheap reads alike, settle the row the same way — each said by name', async () => {
  // Terra נבחרה וקראה 4172329 (אינו במאגר), הזולות נחלקו (4127329 ו-4136916), והקריאה הרביעית קראה כמו
  // הזולה הראשונה — חזקה שמתאימה לזולה.
  const viaFourth = await scanned({ escalationSelected: true,
    field: codeField([read('consensus_escalation', '4172329', true), read('consensus_1', '4127329'), read('consensus_2', '4136916'), read('second_strong_read', '4127329')],
      agreement('strong_cheap', '4127329', ['consensus_1', 'second_strong_read'])) });
  assert.equal(rowTwo(viaFourth).method, 'tnuva_code_agreed');
  assert.equal(rowTwo(viaFourth).product, 'cottage5m');
  assert.equal(actions(viaFourth).agreementSettled, 1);
  // בלי הסכמה (הרביעית קראה כמו Terra, ושתיהן קוד שאינו במאגר): "הקוד של הקריאה השנייה" של 146 הוא הקוד של
  // הזולה הראשונה — 4172329, שאינו במאגר — ולכן אין הצעה, והשורה לבחירה. תיקון ספרה של 4136916 מוצא את
  // 4130916 (פירות יער), אבל המחיר ₪3.69 אינו ₪4.60.
  const noAgreement = await scanned({ escalationSelected: true, selectedCode: '4136916',
    field: codeField([read('consensus_escalation', '4136916', true), read('consensus_1', '4172329'), read('consensus_2', '4127329'), read('second_strong_read', '4136916')], null) });
  assert.deepEqual([rowTwo(noAgreement).product, rowTwo(noAgreement).method], [null, null]);
  assert.deepEqual(actions(noAgreement).unidentified, [{ line: 2, matched: null }]);
  // שתי זולות שהסכימו, ו-Terra (שנבחרה) חולקת: שלב 1 של שירות 19 — הן מכריעות.
  const cheapCheap = await scanned({ escalationSelected: true,
    field: codeField([read('consensus_escalation', '4172329', true), read('consensus_1', '4127329'), read('consensus_2', '4127329')],
      agreement('cheap_cheap', '4127329', ['consensus_1', 'consensus_2'])) });
  assert.equal(rowTwo(cheapCheap).method, 'tnuva_code_agreed');
  assert.match(html(cheapCheap), /מחלוקת אחת על הקוד הוכרעה לפי הסכמת הקריאות — המחיר אישר/);
  assert.ok(evaluation(cheapCheap).warnings.some(w => w.includes('ושתי הקריאות הזולות קראו 4127329')));
});

test('v150: a same-price neighbour still asks, unless both strong reads agreed and rule 109\'s guards hold', async () => {
  // הקריאה שנבחרה קראה את הקוד של קוטג' 9% (במאגר, ₪4.60); הזולה השנייה ו-Terra קראו קוטג' 5% (גם ₪4.60).
  const twins = [read('consensus_1', code('cottage9m'), true), read('consensus_2', code('cottage5m')), read('consensus_escalation', code('cottage5m'))];
  const asked = await scanned({ selectedCode: code('cottage9m'), field: codeField(twins, agreement('strong_cheap', code('cottage5m'), ['consensus_2', 'consensus_escalation'])) });
  assert.deepEqual(rowTwo(asked), { product: 'cottage9m', method: 'exact_full', observed: '7290004127336', repair: null });
  assert.deepEqual(actions(asked).disputed, [{ line: 2, fields: ['code'] }]);
  assert.equal(actions(asked).agreementSettled, 0);
  const askedView = html(asked);
  assert.match(askedView, /הסריקות נחלקו על השורה/);
  assert.ok(askedView.includes('<div dir="rtl">קוד: קריאה זולה 1 (נבחרה) 4127336 · קריאה זולה 2 4127329 · המודל החזק 4127329</div>'), askedView);
  assert.ok(askedView.includes('<div dir="rtl" data-code-agreement>המודל החזק וקריאה זולה קראו שניהם 4127329 — אבל גם קוד אחר שנקרא מוביל למוצר באותו מחיר, ולכן ההכרעה שלך.</div>'), askedView);
  assert.ok(!askedView.includes('קוד: 4127336 מול'), askedView);
  // שתי החזקות הסכימו על קוטג' 5%: מכריעים כמו בכלל 109 — הזהות מוחלפת, בלי לשאול.
  const bothStrong = twins.concat([read('second_strong_read', code('cottage5m'))]);
  const decided = await scanned({ selectedCode: code('cottage9m'), field: codeField(bothStrong, agreement('strong_strong', code('cottage5m'), ['consensus_escalation', 'second_strong_read'])) });
  assert.deepEqual(rowTwo(decided).product, 'cottage5m');
  assert.equal(rowTwo(decided).method, 'tnuva_code_agreed');
  assert.deepEqual(actions(decided), { total: 0, settled: 1, modelSettled: 0, userSettled: 0, agreementSettled: 1, agreementMissing: 0, autoMatched: 0, unidentified: [], disputed: [] });
  assert.deepEqual(audit(decided).products, ['milk', 'cottage5m', 'cottage9m']);
  assert.ok(evaluation(decided).warnings.some(w => w.includes('ושתי הקריאות החזקות קראו 4127329')));
  // שמירה של כלל 109 שנכשלת — מבצע פעיל רק על אחד מהשניים — משאירה את ההכרעה אצל העובד.
  const promo = { id: 'p5', name: "קוטג' 5% במבצע", pct: 10, start: '2026-10-01', end: '2026-10-31', minQty: 1, minUnit: 'unit', type: 'receipt', productIds: ['cottage5m'] };
  const guarded = await scanned({ selectedCode: code('cottage9m'), promos: [promo],
    field: codeField(bothStrong, agreement('strong_strong', code('cottage5m'), ['consensus_escalation', 'second_strong_read'])) });
  assert.equal(rowTwo(guarded).product, 'cottage9m');
  assert.deepEqual(actions(guarded).disputed, [{ line: 2, fields: ['code'] }]);
  assert.ok(html(guarded).includes('שתי הקריאות החזקות קראו 4127329 — אבל גם קוד אחר שנקרא מוביל למוצר באותו מחיר, ולכן ההכרעה שלך.'));
  // קוד שנבחר שאינו במאגר, אבל קריאה אחרת קראה שכן באותו מחיר: חזקה+זולה שואלת (ההצעה של 146 נשארת לחיצה), שתי חזקות מכריעות.
  const neighbour = [read('consensus_1', '4172329', true), read('consensus_2', code('cottage9m')), read('consensus_escalation', code('cottage5m'))];
  const neighbourAsked = await scanned({ field: codeField(neighbour, null) });
  assert.equal(rowTwo(neighbourAsked).method, 'tnuva_code_repair', 'no agreement: 146 — the one-digit repair (a transposition) matches by price');
  assert.deepEqual([actions(neighbourAsked).autoMatched, actions(neighbourAsked).agreementSettled], [1, 0]);
  const neighbourStrong = await scanned({ field: codeField(neighbour.concat([read('second_strong_read', code('cottage5m'))]),
    agreement('strong_strong', code('cottage5m'), ['consensus_escalation', 'second_strong_read'])) });
  assert.equal(rowTwo(neighbourStrong).method, 'tnuva_code_agreed');
  const neighbourCheap = await scanned({ field: codeField([read('consensus_1', '4172329', true), read('consensus_2', code('cottage5m')), read('consensus_escalation', code('cottage9m'))],
    agreement('strong_cheap', code('cottage9m'), ['consensus_escalation'])) });
  // חזקה+זולה על קוטג' 9%, אבל הזולה השנייה קראה קוטג' 5% באותו מחיר: אין הכרעה לפי ההסכמה — נשאר מה ש-146 עשה
  // (תיקון הספרה לפי המחיר, שיוך אוטומטי לפי כלל 119), ושום דבר אינו נספר כהסכמה.
  assert.equal(rowTwo(neighbourCheap).method, 'tnuva_code_repair');
  assert.deepEqual([actions(neighbourCheap).autoMatched, actions(neighbourCheap).agreementSettled], [1, 0]);
});

test('v150: an agreement on the selected code itself is no shortcut — the price, the confirming witness and rule 109 decide as in 146', async () => {
  // Terra נבחרה וקראה את הקוד של קוטג' 9% (במאגר); הזולות קראו קוטג' 5% (אותו מחיר); הקריאה הרביעית קראה כמו Terra.
  // ההסכמה היא על הקוד שנבחר (state 'same'): הזהות אינה משתנה, והשאלה מוכרעת ככלל 109 — לפי המודל החזק, עם השמירות.
  const same = codeField([read('consensus_escalation', code('cottage9m'), true), read('consensus_1', code('cottage5m')), read('consensus_2', code('cottage5m')), read('second_strong_read', code('cottage9m'))],
    agreement('strong_strong', code('cottage9m'), ['consensus_escalation', 'second_strong_read']));
  const decided = await scanned({ escalationSelected: true, selectedCode: code('cottage9m'), field: same });
  assert.deepEqual([rowTwo(decided).product, rowTwo(decided).method], ['cottage9m', 'exact_full']);
  assert.deepEqual([actions(decided).total, actions(decided).modelSettled, actions(decided).agreementSettled], [0, 1, 0]);
  assert.match(html(decided), /מחלוקת אחת על זהות המוצר הוכרעה אוטומטית לפי המודל החזק — המחיר זהה/);
  // אותה הסכמה, אבל מבצע פעיל רק על אחד מהשניים: שמירה של 109 נכשלת, והשאלה פתוחה — ההסכמה אינה מקצרת דרך.
  const promo = { id: 'p9', name: "קוטג' 9% במבצע", pct: 10, start: '2026-10-01', end: '2026-10-31', minQty: 1, minUnit: 'unit', type: 'receipt', productIds: ['cottage9m'] };
  const guarded = await scanned({ escalationSelected: true, selectedCode: code('cottage9m'), promos: [promo], field: same });
  // המבצע על קוטג' 9% גם מציג פער מחיר בשורות 2 ו-3 (המבצע לא ירד בנייר): הכרטיס האדום של 141, והשאלה על הזהות אינה נסגרת.
  assert.ok(actions(guarded).total >= 1, 'the row still asks');
  assert.deepEqual([actions(guarded).agreementSettled, actions(guarded).modelSettled, actions(guarded).settled], [0, 0, 0]);
  // והמחיר שאינו מחיר המאגר: השאלה נשארת פתוחה כמו ב-146, גם כשהקריאות הסכימו על הקוד שנבחר.
  const priced = await scanned({ escalationSelected: true, selectedCode: code('cottage9m'), line: { description: "קוטג'9%", quantity: 18, unitPriceExVat: 4.9 }, field: same });
  assert.equal(actions(priced).agreementSettled, 0);
  assert.ok(actions(priced).total >= 1, 'a price difference is still a decision for the worker');
});

test('v150: an agreed code that is not in the catalog is no dispute and no guess — the row is left to be picked, with the reads on the card', async () => {
  // 23.9: "יופ.שזיף" נרשם כ"יופלה פירות יער" אחרי תיקון ספרה. כאן הקריאה שנבחרה והמודל החזק קראו 4136916
  // (אינו במאגר), הזולה השנייה 4136619; תיקון ספרה של 4136916 היה מוצא את 4130916 (פירות יער, ₪3.69) —
  // ולכן אסור לו לרוץ: הקריאות הסכימו על קוד, והוא פשוט חסר במאגר.
  const plum = { description: 'יופ.שזיף 3%', quantity: 12, unitPriceExVat: 3.69 };
  const reads = [read('consensus_1', '4136916', true), read('consensus_2', '4136619'), read('consensus_escalation', '4136916')];
  const missing = await scanned({ selectedCode: '4136916', line: plum, field: codeField(reads, agreement('strong_cheap', '4136916', ['consensus_1', 'consensus_escalation']), { confirmed: 1 }) });
  assert.deepEqual(rowTwo(missing), { product: null, method: null, observed: null, repair: null });
  assert.deepEqual(actions(missing), { total: 1, settled: 1, modelSettled: 0, userSettled: 0, agreementSettled: 0, agreementMissing: 1, autoMatched: 0,
    unidentified: [{ line: 2, matched: null }], disputed: [] });
  const view = html(missing);
  assert.match(view, /הקוד שבשורה אינו במאגר — צריך לבחור מוצר/);
  assert.doesNotMatch(view, /אשר זיהוי|שתי הסריקות של הצילום|ההתאמה הסבירה ביותר|data-role="rowfix-rival"/);
  assert.ok(view.includes('<div>הקריאות של הצילום הסכימו על הקוד שבשורה, והוא אינו במאגר:</div><div dir="rtl">קוד: קריאה זולה 1 (נבחרה) 4136916 · קריאה זולה 2 4136619 · המודל החזק 4136916</div><div dir="rtl" data-code-agreement>המודל החזק וקריאה זולה קראו שניהם 4136916 — והוא אינו במאגר.</div>'), view);
  // המועמדים לפי המחיר נשארים לבחירה (פירות יער ב-₪3.69), בלי "ההתאמה הסבירה ביותר".
  assert.match(view, /איזה מוצר זה\? לחץ על המוצר הנכון ברשימה:/);
  assert.match(view, /יופלה פירות יער בשמנת 3% 150 גרם/);
  assert.match(view, /בשורה אחת הקריאות הסכימו על קוד שאינו במאגר/);
  // אותו צילום משירות 19 (בלי הסכמה): תיקון הספרה רץ, פירות יער מחכה לאישור — כמו ב-146.
  const guessed = await scanned({ version: 19, selectedCode: '4136916', line: plum, field: { field: 'code', selected: '4136916', other: '4136619', confirmed: 1 } });
  assert.equal(rowTwo(guessed).method, 'tnuva_code_repair');
  assert.equal(rowTwo(guessed).product, 'forest');
  // בלי הנחת סיכום שממתינה, שיוך לפי המחיר נספר כשיוך אוטומטי (כלל 119) — פירות יער נרשם בלי שאלה.
  assert.deepEqual([actions(guessed).autoMatched, actions(guessed).unidentified], [1, []]);
  assert.match(html(guessed), /שורה אחת שויכה אוטומטית כשהמחיר אישר את הקוד/);
  // וכשהקוד שנבחר כן במאגר והמחיר מאשר אותו, הסכמה על קוד אחר שאינו במאגר אינה מורידה את הזהות (כלל 100 נשאר).
  const kept = await scanned({ selectedCode: code('cottage5m'), field: codeField([read('consensus_1', code('cottage5m'), true), read('consensus_2', '4136916'), read('consensus_escalation', '4136916')],
    agreement('strong_cheap', '4136916', ['consensus_2', 'consensus_escalation'])) });
  assert.deepEqual([rowTwo(kept).product, rowTwo(kept).method], ['cottage5m', 'exact_full']);
  assert.equal(actions(kept).total, 0);
});

test('v150: no agreement, or no service-20 data, is exactly version 149 — with what every read saw added to the card', async () => {
  // הקריאה שנבחרה קראה את הקוד של קוטג' 9% (במאגר), הזולה השנייה קוטג' 5%, Terra קוד שלישי, והקריאה הרביעית
  // לא הושלמה: אין הסכמה, ושני מוצרים באותו מחיר — הכרטיס של 146, ועליו מה כל קריאה קראה.
  const none = await scanned({ selectedCode: code('cottage9m'),
    field: codeField([read('consensus_1', code('cottage9m'), true), read('consensus_2', code('cottage5m')), read('consensus_escalation', '4172923')], null),
    secondStrongRead: { outcome: 'failed', stage: 'second_strong_read', model: 'gpt-5.6-terra', requestId: 'fixture-4', asked: 1, usage: null, error: 'openai_network_error',
      closed: [], open: [], notAsked: [], differences: [], codes: [{ noteIndex: 0, rowIndex: 1, page: 1, lineNumber: 2, field: 'code', value: code('cottage9m'), reads: [], agreement: null }] } });
  assert.deepEqual([rowTwo(none).product, rowTwo(none).method], ['cottage9m', 'exact_full']);
  assert.deepEqual(actions(none).disputed, [{ line: 2, fields: ['code'] }]);
  assert.equal(actions(none).agreementSettled, 0);
  const view = html(none);
  assert.match(view, /הסריקות נחלקו על השורה/);
  assert.ok(view.includes('<div dir="rtl">קוד: קריאה זולה 1 (נבחרה) 4127336 · קריאה זולה 2 4127329 · המודל החזק 4172923</div><div dir="rtl" data-code-agreement>אף שתי קריאות לא הסכימו על הקוד.</div>'), view);
  assert.match(view, /נערכה קריאה שלישית ב־gpt-5\.6-terra, אבל נבחרה הקריאה שנסגרה טוב יותר מול הנייר — ההכרעה כאן שלך\./);
  assert.match(view, /data-role="rowfix-confirm" data-doc="0" data-row="1"/);
  assert.doesNotMatch(history(none), /data-code-agreed/);
  // קריאה שלא ראתה את השורה נאמרת כך.
  const unseen = await scanned({ selectedCode: code('cottage9m'),
    field: codeField([read('consensus_1', code('cottage9m'), true), read('consensus_2', code('cottage5m')), { stage: 'consensus_escalation', value: null, seen: false, unmatched: 'numbers_differ' }], null) });
  assert.ok(html(unseen).includes('המודל החזק לא קראה את השורה</div>'), html(unseen));
  // שירות 19 (בלי reads ובלי agreement): הכרטיס של 149, תו בתו.
  const v19 = await scanned({ version: 19, selectedCode: code('cottage9m'), field: { field: 'code', selected: code('cottage9m'), other: code('cottage5m'), confirmed: 0 } });
  assert.deepEqual(actions(v19).disputed, [{ line: 2, fields: ['code'] }]);
  const v19View = html(v19);
  assert.ok(v19View.includes('<div dir="rtl">קוד: 4127336 מול 4127329</div>'), v19View);
  assert.doesNotMatch(v19View, /data-code-agreement|הסכמת הקריאות|קריאה זולה 1/);
  // בלי הסכמה ובלי זהות לפי הקוד שנבחר, 146 נשאר: 4172329 הוא היפוך ספרות של 4127329, ותיקון הספרה (סבילות שתי
  // אגורות) משייך אותו — כשיוך אוטומטי לפי כלל 119, לא כהסכמה.
  const repaired = await scanned({ field: codeField([read('consensus_1', '4172329', true), read('consensus_2', '4127329'), read('consensus_escalation', '4172923')], null) });
  assert.equal(rowTwo(repaired).method, 'tnuva_code_repair');
  assert.deepEqual([actions(repaired).autoMatched, actions(repaired).agreementSettled], [1, 0]);
  // הסכמה בסוג שאינו מוכר — מתעלמים ממנה.
  const odd = await scanned({ field: codeField(todayReads, { code: '4127329', kind: 'majority', stages: [] }) });
  assert.equal(rowTwo(odd).method, 'tnuva_code_repair');
  assert.equal(actions(odd).agreementSettled, 0);
});

test('v150: the price must equal exactly, and an ambiguous or missing catalog product settles nothing', async () => {
  // המחיר המודפס ₪4.62 — אגורותיים מעל מחיר המאגר: לא "בדיוק", ולכן אין הכרעה אוטומטית; תיקון הספרה של 146 (סבילות שתי אגורות) עדיין מציע בלחיצה.
  const offByTwo = await scanned({ line: { description: "קוטג'5%'' 250 ו.מהדרין", quantity: 18, unitPriceExVat: 4.62 }, field: codeField(todayReads, todayAgreement) });
  assert.equal(rowTwo(offByTwo).method, 'tnuva_code_repair');
  assert.equal(actions(offByTwo).agreementSettled, 0);
  // מחיר מבצע פעיל שווה בדיוק — מאשר.
  const promo = { id: 'p5', name: "קוטג' 5% במבצע", pct: 10, start: '2026-10-01', end: '2026-10-31', minQty: 1, minUnit: 'unit', type: 'receipt', productIds: ['cottage5m'] };
  const promoPrice = await scanned({ promos: [promo], line: { description: "קוטג'5%'' 250 ו.מהדרין", quantity: 18, unitPriceExVat: 4.14 }, field: codeField(todayReads, todayAgreement) });
  assert.equal(rowTwo(promoPrice).method, 'tnuva_code_agreed');
  // שני מוצרים עם אותו ברקוד במאגר — הקוד המוסכם אינו חד-משמעי.
  const doubled = products.concat([{ id: 'cottage5dup', name: "קוטג' 5% כפול", barcode: '7290004127329', price: 4.6 }]);
  const ambiguous = await scanned({ catalog: doubled, field: codeField(todayReads, todayAgreement) });
  assert.notEqual(rowTwo(ambiguous).method, 'tnuva_code_agreed');
  assert.equal(actions(ambiguous).agreementSettled, 0);
});
