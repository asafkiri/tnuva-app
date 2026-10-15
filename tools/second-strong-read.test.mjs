// v143: שירות 19 — הקריאה החזקה השנייה (Terra#2). הכרעת הבעלים: שתי הקריאות הזולות
// מסכימות — מתקבל. נחלקו — Terra קורא, ושדה ש-Terra מסכים בו עם אחת מהן מתקבל. שדה
// ש-Terra אינו מסכים בו עם אף אחת — קריאה חזקה שנייה, ואם היא קוראת אותו כמו Terra הוא
// מתקבל בלי פעולה של העובד. אחרת העובד מאשר או מתקן, כמו היום, עם הערכים של הקריאה
// שנבחרה ומה שכל קריאה ראתה. "מתקבל" הוא לפי שדה ושורה, לעולם לא לפי תעודה.
// השרת עושה את כל זה: שדה שהתקבל פשוט אינו ב-disputedRows. הבדיקות כאן מריצות את
// האפליקציה כולה מול שירות 19 מדומה, ובודקות שהיא קוראת את מה שנוסף — השלב
// second_strong_read, הרשומה consensus.secondStrongRead וקריאה רביעית בתוך משבצת
// קריאת ההצלה — ושמול שירות 18 (וגם שירות 19 עם SECOND_STRONG_READ=off) הכול כמו ב-142.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime } from './receipt-scan-harness.mjs';

// שני מוצרי YOLO באותו מחיר, ונייר של שתי שורות שנסגר ב-55.52 ₪ מול מונה "פריטים" 2.
const products = [
  { id: 'p_yolo_chocolate', name: 'YOLO שוקולד חלב מעולה 123 גרם', barcode: '7290014761056', price: 3.47 },
  { id: 'p_yolo_layers', name: 'YOLO מעדן שכבות שוקולד חלב ולבן 122 גרם', barcode: '7290014761414', price: 3.47 }
];
const paperRow = changes => ({ section: 'items', sourcePage: 1, promoStar: false, confidence: .8, ...changes });
const paperDoc = { noteIndex: 0, docType: 'invoice', docDate: null, pageCount: 1, vatPct: 18, confidence: .8,
  rows: [paperRow({ lineNumber: 1, code: '14761056', description: 'מעדן שוקולד חלב YOLO', quantity: 10, unitPriceExVat: 3.47, lineTotalExVat: 34.7 }),
    paperRow({ lineNumber: 2, code: '14761414', description: 'מעדן שכבות YOLO', quantity: 6, unitPriceExVat: 3.47, lineTotalExVat: 20.82 })],
  itemsSectionTotalExVat: 55.52, promoDiscountExVat: 0, itemsPrintedLines: 2, returnsSectionTotalExVat: null, returnsPrintedLines: null,
  subtotalExVat: 55.52, warnings: [] };

// שורה 2: Terra (הקריאה שנבחרה) קרא 6 ו-20.82 — מה שמודפס. הזולות קראו 13 ו-17.
const quantity = { field: 'quantity', selected: 6, other: 13, confirmed: 0 };
const total = { field: 'lineTotalExVat', selected: 20.82, other: 45.11, confirmed: 0 };
const code = { field: 'code', selected: '14761414', other: '14761056', confirmed: 0 };
const disputedRow = fields => ({ noteIndex: 0, rowIndex: 1, lineNumber: 2, code: '14761414', description: 'מעדן שכבות YOLO', fields });
// בדיוק כמו השרת: הקריאה שנבחרה ראשונה, אחריה העדים לפי השלב, ובסוף הקריאה הנוספת.
const place = { noteIndex: 0, rowIndex: 1, page: 1, lineNumber: 2 };
const reads = (values, extra) => [{ stage: 'consensus_escalation', value: values[0], selected: true },
  { stage: 'consensus_1', value: values[1] }, { stage: 'consensus_2', value: values[2] }].concat(extra ? [extra] : []);
const QUANTITY_READS = [6, 13, 17], TOTAL_READS = [20.82, 45.11, 58.99];
const closedEntry = (field, values, stage = 'second_strong_read') =>
  ({ ...place, field, value: values[0], reads: reads(values, { stage, value: values[0] }), rule: 'second_strong_read' });
const openEntry = (field, values, reason, extra) => ({ ...place, field, value: values[0], reads: reads(values, extra), reason });
const usage = (input, output) => ({ input_tokens: input, output_tokens: output });
const record = (changes = {}) => ({ outcome: 'read', stage: 'second_strong_read', model: 'gpt-5.6-terra', requestId: 'fixture-4',
  asked: 2, usage: usage(301, 31), closed: [], open: [], ...changes });
const cheapAndStrong = (escalationSelected = true) => [
  { stage: 'consensus_1', requestedModel: 'gpt-5.6-luna', selected: false, outcome: 'read', usage: usage(101, 11) },
  { stage: 'consensus_2', requestedModel: 'gpt-5.6-luna', selected: false, outcome: 'read', usage: usage(102, 12) },
  { stage: 'consensus_escalation', requestedModel: 'gpt-5.6-terra', selected: escalationSelected, outcome: 'read', usage: usage(201, 21) }];
const extraAttempt = (stage = 'second_strong_read', selected = false, failed = false) =>
  ({ stage, requestedModel: 'gpt-5.6-terra', selected, outcome: failed ? 'network_error' : 'read', usage: failed ? null : usage(301, 31) });

// התשובה של השירות. secondStrongRead חסר — שירות 18, או שירות 19 עם SECOND_STRONG_READ=off.
// consensus — שינויים בקונצנזוס עצמו (למשל קריאה בודדת שההסלמה שלה נכשלה).
function service({ version = 19, disputedRows, secondStrongRead, attempts, escalationSelected = true, consensus: changes = {}, ...top }) {
  const consensus = { attempted: true, reads: 2, completedReads: 2, model: 'gpt-5.6-luna', agreed: false, reason: 'reads_disagree',
    escalated: true, escalationModel: 'gpt-5.6-terra', escalationError: null, escalationSelected, unverifiedSingleRead: false,
    strongReadSelection: true, diffs: [], disputedRows, missingRows: [], docDateUnconfirmed: [], ...changes };
  const extra = secondStrongRead && secondStrongRead.stage === 'second_strong_read'
    ? [extraAttempt('second_strong_read', false, secondStrongRead.outcome === 'failed')] : [];
  const scanAudit = { version: 1, attempts: attempts || cheapAndStrong(escalationSelected).concat(extra) };
  if (secondStrongRead) { consensus.secondStrongRead = secondStrongRead; scanAudit.secondStrongRead = secondStrongRead; }
  return { products, promos: [], items: [], paper: { ok: true, serviceVersion: version, model: 'gpt-5.6-terra', requestId: 'fixture-3',
    usage: usage(201, 21), consensus, scanAudit, checksumRetryAttempted: false, checksumRetryModel: null,
    scan: { warnings: [], documents: [paperDoc] }, ...top } };
}
async function scanned(data) {
  const c = runtime('tnuva', { data });
  c.run(`currentView='receiving'; mainMode='receiving'; scanPurpose='receiving'; refreshScanHost = () => {};
    aiScanDocuments = [{ noteIndex: 0, amount: null, units: null, lines: null,
      pages: [{ dataUrl: 'data:image/jpeg;base64,Zml4dHVyZQ==', orientationConfirmed: true }] }];`);
  await c.run('tnuvaStartPaperScan()');
  assert.equal(c.run('receiptPaperScanState'), 'ok', 'the paper closes');
  return c;
}
const actions = c => JSON.parse(c.run(`JSON.stringify((function(){ const a = receiptRowActions();
  return { state: a.state, total: a.total, settled: a.settled, modelSettled: a.modelSettled,
    disputed: a.disputed.map(x => ({ line: x.row.line, fields: x.dispute.fields.map(f => f.field) })) }; })())`));
const html = c => { c.run('renderReceiving()'); return c.node('app').innerHTML; };
// כרטיס המחלוקת בלבד (התיבה הצהובה שבתוך הכרטיס), כדי להשוות אותו בין שתי ריצות.
const card = c => { const view = html(c); const at = view.indexOf('שתי הסריקות של הצילום');
  return at < 0 ? '' : view.slice(at, view.indexOf('</div></div>', at) + '</div></div>'.length); };
const diagnostics = c => c.run('aiScanDiagnosticsHtml({})');
const history = c => c.run('tnuvaScanHistoryHtml(tnuvaReceiptScanAudit())');
const decided = /הכריע gpt-5\.6-terra בקריאה שלישית\./;
const fourthDisagrees = /<div class="mt-1" data-fourth-read>נערכה גם קריאה רביעית ב־gpt-5\.6-terra, והיא לא אישרה את הקריאה שנבחרה — ההכרעה כאן שלך\.<\/div>/;
const fourthFailed = /<div class="mt-1" data-fourth-read>נערכה גם קריאה רביעית ב־gpt-5\.6-terra, אבל היא לא הושלמה — ההכרעה כאן שלך\.<\/div>/;
const notice = /רק קריאה אחת של הצילום הצליחה/;

test('v143: a field the second strong read accepted is simply not a dispute, and the scan details say which and with what value', async () => {
  const c = await scanned(service({ disputedRows: [],
    secondStrongRead: record({ closed: [closedEntry('quantity', QUANTITY_READS), closedEntry('lineTotalExVat', TOTAL_READS)] }) }));
  // אין כרטיס, אין מה לאשר, ושום דבר לא נספר כ"הוכרע מול המאגר".
  assert.deepEqual(actions(c), { state: 'ready', total: 0, settled: 0, modelSettled: 0, disputed: [] });
  const view = html(c);
  assert.doesNotMatch(view, /שתי הסריקות של הצילום|הסריקות נחלקו על השורה|קריאה רביעית|הוכרעו מול המאגר/);
  const status = c.run('tnuvaPaperStatusHtml()');
  assert.match(status, /התעודה נקראה ואומתה/);
  assert.doesNotMatch(status, notice);
  // פרטי הפענוח של הקליטה: הקריאה הרביעית ברשימת הניסיונות, ומה התקבל בה — הערך של הקריאה שנבחרה.
  const details = history(c);
  assert.match(details, /<div dir="ltr">gpt-5\.6-terra · second_strong_read · read<\/div>/);
  assert.match(details, /<div data-second-strong-closed class="text-emerald-800">התקבלו בקריאה חזקה שנייה, בלי אישור ידני: שורה 2: כמות 6, סכום שורה 20\.82<\/div>/);
  // והרשומה נשמרת עם הקליטה (scanAudit של התעודה השמורה), בקונצנזוס וביומן הניסיונות.
  const saved = JSON.parse(c.run('JSON.stringify(cloneSafe(tnuvaReceiptScanAudit()))'));
  assert.deepEqual(saved.perDocument[0].consensus.secondStrongRead.closed.map(item => [item.lineNumber, item.field, item.value, item.rule]),
    [[2, 'quantity', 6, 'second_strong_read'], [2, 'lineTotalExVat', 20.82, 'second_strong_read']]);
  assert.equal(saved.history[0].scanAudit.secondStrongRead.closed.length, 2);

  // אותו צילום משירות 18: שני השדות אצל העובד, כמו ב-142, בלי שום אזכור לקריאה רביעית.
  const v18 = await scanned(service({ version: 18, disputedRows: [disputedRow([quantity, total])] }));
  assert.deepEqual(actions(v18).disputed, [{ line: 2, fields: ['quantity', 'lineTotalExVat'] }]);
  assert.match(card(v18), /<div dir="rtl">כמות: 6 מול 13<\/div><div dir="rtl">סכום שורה: 20\.82 מול 45\.11<\/div>/);
  assert.doesNotMatch(html(v18), /קריאה רביעית/);
  assert.doesNotMatch(history(v18), /data-second-strong-closed/);
});

test('v143: a field the fourth read did not confirm stays with the worker — the selected value first, then what every read saw', async () => {
  for (const [reason, quantityExtra, totalExtra, quantityLine, totalLine, last] of [
    ['disagrees', { stage: 'second_strong_read', value: 9 }, { stage: 'second_strong_read', value: 31.23 },
      'כמות: 6 מול 13, 17 · קריאה רביעית: 9', 'סכום שורה: 20.82 מול 45.11, 58.99 · קריאה רביעית: 31.23', fourthDisagrees],
    ['not_seen', { stage: 'second_strong_read', value: null, seen: false }, { stage: 'second_strong_read', value: null, seen: false },
      'כמות: 6 מול 13, 17 · קריאה רביעית: לא ראתה את השורה', 'סכום שורה: 20.82 מול 45.11, 58.99 · קריאה רביעית: לא ראתה את השורה', fourthDisagrees],
    // הקריאה הרביעית נכשלה: אין לה ערך, והעדים מוצגים כמו שהם.
    ['failed', null, null, 'כמות: 6 מול 13, 17', 'סכום שורה: 20.82 מול 45.11, 58.99', fourthFailed]]) {
    const secondStrongRead = record({ ...(reason === 'failed' ? { outcome: 'failed', error: 'openai_network_error', usage: null } : {}),
      open: [openEntry('quantity', QUANTITY_READS, reason, quantityExtra), openEntry('lineTotalExVat', TOTAL_READS, reason, totalExtra)] });
    const c = await scanned(service({ disputedRows: [disputedRow([quantity, total])], secondStrongRead }));
    assert.deepEqual(actions(c).disputed, [{ line: 2, fields: ['quantity', 'lineTotalExVat'] }], reason);
    const box = card(c);
    assert.ok(box.includes('<div dir="rtl">' + quantityLine + '</div><div dir="rtl">' + totalLine + '</div>'), reason + ': ' + box);
    assert.match(box, decided, reason + ': Terra is still the selected read');
    assert.match(box, last, reason);
    if (reason === 'failed') assert.doesNotMatch(box, /קריאה רביעית:/, reason);
    // הכפתורים של העובד — כמו היום.
    assert.match(html(c), /data-role="rowfix-confirm" data-doc="0" data-row="1"/, reason);
  }

  // טיוטה ששוחזרה אומרת את אותו דבר, בלי סריקה נוספת בתשלום.
  const c = await scanned(service({ disputedRows: [disputedRow([quantity, total])], secondStrongRead: record({
    open: [openEntry('quantity', QUANTITY_READS, 'disagrees', { stage: 'second_strong_read', value: 9 })] }) }));
  const before = card(c);
  assert.match(before, fourthDisagrees);
  c.run('saveReceiptDraft()');
  const restored = runtime('tnuva', { data: service({ disputedRows: [] }), storage: c.storage });
  restored.run('restoreReceiptDraft()');
  assert.equal(card(restored), before);
  assert.equal(restored.requests.filter(r => r.url.endsWith('/scan')).length, 0);

  // שירות 18, ושירות 19 עם SECOND_STRONG_READ=off (אותה תשובה בלי הרשומה): הכרטיס של 142, תו בתו.
  const v18 = card(await scanned(service({ version: 18, disputedRows: [disputedRow([quantity, total])] })));
  const off = card(await scanned(service({ version: 19, disputedRows: [disputedRow([quantity, total])] })));
  assert.equal(off, v18);
  assert.ok(v18.includes('<div dir="rtl">כמות: 6 מול 13</div><div dir="rtl">סכום שורה: 20.82 מול 45.11</div>'), v18);
  assert.match(v18, decided);
  assert.doesNotMatch(v18, /רביעית/);
});

// שירות 19, מהביקורת (סבב שלישי): הקריאה הרביעית נספרת רק כשקראה את השורה המודפסת שנשאלה — בדיוק
// שורה אחת באותו עמוד ומספר שורה, באותו קוד, וקוד שמופיע אצלה פעם אחת — וכשורת פריטים רגילה.
test('v143: a fourth read that was not matched to the printed line, or saw a credit note or a deposit there, is never shown as a confirmation', async () => {
  const unmatched = { stage: 'second_strong_read', value: null, seen: false, unmatched: 'other_code' };
  const credit = value => ({ stage: 'second_strong_read', value, ineligible: 'credit_or_returns' });
  const deposit = value => ({ stage: 'second_strong_read', value, ineligible: 'deposit_row' });
  for (const [reason, quantityExtra, totalExtra, quantityLine, totalLine, diagnosticsLine] of [
    // קוד אחר באותה שורה (הסטה של עמודת הקוד): היא לא ראתה את השורה המודפסת הזאת.
    ['not_matched', unmatched, unmatched, 'כמות: 6 מול 13, 17 · קריאה רביעית: לא ראתה את השורה',
      'סכום שורה: 20.82 מול 45.11, 58.99 · קריאה רביעית: לא ראתה את השורה',
      'לעובד (not_matched) · שורה 2: כמות 6 · consensus_escalation=6✓ consensus_1=13 consensus_2=17 second_strong_read=לא ראתה (other_code)'],
    // היא קראה בשורה בדיוק את מה ש-Terra קרא, אבל ראתה בתעודה זיכוי: הערך שלה מוצג עם הסיבה, ואינו אישור.
    ['not_eligible', credit(6), credit(20.82), 'כמות: 6 מול 13, 17 · קריאה רביעית: 6 (קראה את התעודה כזיכוי או עם החזרות — לא נספרה)',
      'סכום שורה: 20.82 מול 45.11, 58.99 · קריאה רביעית: 20.82 (קראה את התעודה כזיכוי או עם החזרות — לא נספרה)',
      'לעובד (not_eligible) · שורה 2: כמות 6 · consensus_escalation=6✓ consensus_1=13 consensus_2=17 second_strong_read=6 (לא נספרה: credit_or_returns)'],
    ['not_eligible', deposit(6), deposit(20.82), 'כמות: 6 מול 13, 17 · קריאה רביעית: 6 (קראה את השורה כפיקדון — לא נספרה)',
      'סכום שורה: 20.82 מול 45.11, 58.99 · קריאה רביעית: 20.82 (קראה את השורה כפיקדון — לא נספרה)',
      'לעובד (not_eligible) · שורה 2: כמות 6 · consensus_escalation=6✓ consensus_1=13 consensus_2=17 second_strong_read=6 (לא נספרה: deposit_row)']]) {
    const secondStrongRead = record({ open: [openEntry('quantity', QUANTITY_READS, reason, quantityExtra), openEntry('lineTotalExVat', TOTAL_READS, reason, totalExtra)] });
    const c = await scanned(service({ disputedRows: [disputedRow([quantity, total])], secondStrongRead }));
    assert.deepEqual(actions(c).disputed, [{ line: 2, fields: ['quantity', 'lineTotalExVat'] }], reason);
    const box = card(c);
    assert.ok(box.includes('<div dir="rtl">' + quantityLine + '</div><div dir="rtl">' + totalLine + '</div>'), reason + ': ' + box);
    assert.match(box, decided, reason);
    assert.match(box, fourthDisagrees, reason);
    assert.ok(diagnostics(c).includes(diagnosticsLine), reason + '\n' + diagnostics(c));
  }
});

test('v143: acceptance is per field — a closed quantity leaves the line total and the code on the card', async () => {
  // הקריאה הרביעית קראה 6 (כמו Terra) אבל 20.28 בסכום. הקוד שבמחלוקת אינו נשאל כלל (C2):
  // שתי זהויות באותו מחיר, ובשורה גם סכום פתוח — ולכן גם הקוד נשאר אצל העובד, כמו ב-142.
  const c = await scanned(service({ disputedRows: [disputedRow([code, total])], secondStrongRead: record({
    closed: [closedEntry('quantity', QUANTITY_READS)],
    open: [openEntry('lineTotalExVat', TOTAL_READS, 'disagrees', { stage: 'second_strong_read', value: 20.28 })] }) }));
  assert.deepEqual(actions(c).disputed, [{ line: 2, fields: ['code', 'lineTotalExVat'] }]);
  const box = card(c);
  assert.ok(box.includes('<div dir="rtl">קוד: 14761414 מול 14761056</div><div dir="rtl">סכום שורה: 20.82 מול 45.11, 58.99 · קריאה רביעית: 20.28</div>'), box);
  assert.doesNotMatch(box, /כמות:/, 'the accepted quantity is not on the card');
  assert.match(box, fourthDisagrees);
  assert.match(history(c), /התקבלו בקריאה חזקה שנייה, בלי אישור ידני: שורה 2: כמות 6</);
});

test('v143: the second strong read is never the selected read — the wording and the same-price rule follow the escalation, also in the checksum-retry slot', async () => {
  // (b) קוד שבמחלוקת בין שתי זהויות באותו מחיר, בשורה שהקריאה הרביעית לא נגעה בה: Terra נבחר,
  // ולכן הזהות נסגרת לפי המודל החזק כמו ב-142 — הקריאה הרביעית, שסגרה כמות בשורה אחרת, אינה משנה זאת.
  const elsewhere = { ...closedEntry('quantity', [10, 13, 17]), rowIndex: 0, lineNumber: 1 };
  const identity = await scanned(service({ disputedRows: [disputedRow([code])],
    secondStrongRead: record({ asked: 1, closed: [elsewhere] }) }));
  assert.equal(identity.run('receiptSelectedStrongerModel(aiScanResponse.perDocument[0])'), 'gpt-5.6-terra');
  assert.deepEqual(actions(identity), { state: 'ready', total: 0, settled: 1, modelSettled: 1, disputed: [] });
  // מהביקורת: בשורה שהקריאה הרביעית סגרה בה כמות או כסף, כלל שתי הזהויות באותו מחיר אינו חל.
  // ב-142 הכמות הייתה נשארת בכרטיס ("זהות אינה יכולה להסתיר מחלוקת על כמות/כסף"), והקוד עמה;
  // אילו הכרטיס נסגר כאן, הקריאה הרביעית הייתה מכריעה זהות בעקיפין. הקוד נשאר אצל העובד, כמו ב-142.
  // (שירות 19 אינו שואל שורה שהקוד של Terra בה אינו מאושר; זו הגנה נוספת, מול כל שרת.)
  const sameRow = await scanned(service({ disputedRows: [disputedRow([code])],
    secondStrongRead: record({ asked: 1, closed: [closedEntry('quantity', QUANTITY_READS)] }) }));
  assert.equal(sameRow.run('receiptSelectedStrongerModel(aiScanResponse.perDocument[0])'), 'gpt-5.6-terra');
  assert.deepEqual(actions(sameRow), { state: 'ready', total: 1, settled: 0, modelSettled: 0, disputed: [{ line: 2, fields: ['code'] }] });
  const sameRowBox = card(sameRow);
  assert.ok(sameRowBox.includes('<div dir="rtl">קוד: 14761414 מול 14761056</div>'), sameRowBox);
  assert.doesNotMatch(sameRowBox, /כמות:/, 'the accepted quantity is not on the card');
  assert.match(sameRowBox, decided);
  // שרת שיסמן בטעות את הקריאה הרביעית כנבחרת — היא אינה "המודל החזק שנבחר".
  const marked = await scanned(service({ disputedRows: [disputedRow([code])], escalationSelected: false,
    secondStrongRead: record({ asked: 1, closed: [closedEntry('quantity', QUANTITY_READS)] }),
    attempts: cheapAndStrong(false).concat([extraAttempt('second_strong_read', true)]) }));
  assert.equal(marked.run('receiptSelectedStrongerModel(aiScanResponse.perDocument[0])'), null);
  assert.equal(actions(marked).modelSettled, 0);
  assert.deepEqual(actions(marked).disputed, [{ line: 2, fields: ['code'] }]);

  // (a) המשבצת המשותפת: נייר אחר באותה בקשה צריך הצלה, והקריאה הרביעית היא קריאת ההצלה
  // עצמה. האפליקציה שולחת תעודה אחת בכל בקשה ולכן אינה מגיעה לכאן, אבל זה חלק מהחוזה של
  // שירות 19. היא הפסידה — Terra נשאר הקריאה שנבחרה, וההצבעה שלה נרשמה בשלב checksum_retry.
  const lost = await scanned(service({ disputedRows: [disputedRow([quantity])], checksumRetryAttempted: true, checksumRetryModel: 'gpt-5.6-terra',
    attempts: cheapAndStrong(true).concat([extraAttempt('checksum_retry')]),
    secondStrongRead: record({ stage: 'checksum_retry', asked: 1,
      open: [openEntry('quantity', QUANTITY_READS, 'disagrees', { stage: 'checksum_retry', value: 9 })] }) }));
  assert.equal(lost.run('receiptSelectedStrongerModel(aiScanResponse.perDocument[0])'), 'gpt-5.6-terra');
  const lostBox = card(lost);
  assert.ok(lostBox.includes('<div dir="rtl">כמות: 6 מול 13, 17 · קריאה רביעית: 9</div>'), lostBox);
  assert.match(lostBox, decided);
  assert.match(lostBox, fourthDisagrees);
  // קריאת ההצלה ניצחה: היא הקריאה שנבחרה ואינה מצביעה על עצמה — הכרטיס של 142 (שירות 18).
  const won = await scanned(service({ disputedRows: [disputedRow([quantity])], escalationSelected: false,
    checksumRetryAttempted: true, checksumRetryModel: 'gpt-5.6-terra',
    attempts: cheapAndStrong(false).concat([extraAttempt('checksum_retry', true)]),
    secondStrongRead: record({ stage: 'checksum_retry', outcome: 'selected', asked: 1 }) }));
  assert.equal(won.run('receiptSelectedStrongerModel(aiScanResponse.perDocument[0])'), 'gpt-5.6-terra');
  const wonBox = card(won);
  assert.match(wonBox, decided);
  assert.doesNotMatch(wonBox, /רביעית/);
  assert.ok(wonBox.includes('<div dir="rtl">כמות: 6 מול 13</div>'), wonBox);
});

test('v143: the diagnostics count the tokens of every paid read, the second strong read included, and say what it settled', async () => {
  const c = await scanned(service({ disputedRows: [disputedRow([total])], secondStrongRead: record({
    closed: [closedEntry('quantity', QUANTITY_READS)],
    open: [openEntry('lineTotalExVat', TOTAL_READS, 'disagrees', { stage: 'second_strong_read', value: 20.28 })] }) }));
  const lines = diagnostics(c);
  for (const expected of [
    'טוקנים · תעודה 1 · consensus_1 · gpt-5.6-luna: כניסה 101 · יציאה 11',
    'טוקנים · תעודה 1 · consensus_2 · gpt-5.6-luna: כניסה 102 · יציאה 12',
    'טוקנים · תעודה 1 · consensus_escalation · gpt-5.6-terra: כניסה 201 · יציאה 21',
    'טוקנים · תעודה 1 · second_strong_read · gpt-5.6-terra: כניסה 301 · יציאה 31',
    'קריאה חזקה שנייה · תעודה 1 · second_strong_read · gpt-5.6-terra: נשאלו 2 שדות · התקבלו 1 · נשארו לעובד 1',
    'התקבל · שורה 2: כמות 6 · consensus_escalation=6✓ consensus_1=13 consensus_2=17 second_strong_read=6',
    'לעובד (disagrees) · שורה 2: סכום שורה 20.82 · consensus_escalation=20.82✓ consensus_1=45.11 consensus_2=58.99 second_strong_read=20.28'
  ]) assert.ok(lines.includes(expected), expected + '\n' + lines);

  // (a) הקריאה הרביעית היא קריאת ההצלה — גם הטוקנים שלה נספרים, ושלב ההצבעה נאמר.
  const slot = await scanned(service({ disputedRows: [], checksumRetryAttempted: true, checksumRetryModel: 'gpt-5.6-terra',
    attempts: cheapAndStrong(true).concat([extraAttempt('checksum_retry')]),
    secondStrongRead: record({ stage: 'checksum_retry', asked: 1, closed: [closedEntry('quantity', QUANTITY_READS, 'checksum_retry')] }) }));
  const slotLines = diagnostics(slot);
  assert.ok(slotLines.includes('טוקנים · תעודה 1 · checksum_retry · gpt-5.6-terra: כניסה 301 · יציאה 31'), slotLines);
  assert.ok(slotLines.includes('קריאה חזקה שנייה · תעודה 1 · checksum_retry · gpt-5.6-terra: נשאלו 1 שדות · התקבלו 1 · נשארו לעובד 0'), slotLines);
  // קריאה רביעית שנכשלה.
  const failed = await scanned(service({ disputedRows: [disputedRow([quantity])], secondStrongRead: record({ outcome: 'failed',
    error: 'openai_network_error', usage: null, asked: 1, open: [openEntry('quantity', QUANTITY_READS, 'failed')] }) }));
  assert.ok(diagnostics(failed).includes(': נשאלו 1 שדות · התקבלו 0 · נשארו לעובד 1 · לא הושלמה (openai_network_error)'), diagnostics(failed));

  // רשומה שלא נשאלה בה שום שאלה (not_needed) — ובה קריאה בודדת שנכשלה לה ההסלמה: אין שורה
  // של קריאה חזקה שנייה, והתעודה עדיין מסומנת כקריאה אחת שלא אומתה, כמו בשירות 18.
  const lone = await scanned(service({ disputedRows: [], escalationSelected: false, secondStrongRead: record({ outcome: 'not_needed',
    stage: null, model: null, requestId: null, asked: 0, usage: null }), model: 'gpt-5.6-luna',
    consensus: { completedReads: 1, reason: 'read_failed', escalated: false, escalationModel: null,
      escalationError: 'openai_network_error', unverifiedSingleRead: true },
    attempts: [{ stage: 'consensus_1', requestedModel: 'gpt-5.6-luna', selected: true, outcome: 'read', usage: usage(101, 11) },
      { stage: 'consensus_2', requestedModel: 'gpt-5.6-luna', selected: false, outcome: 'network_error' },
      { stage: 'consensus_escalation', requestedModel: 'gpt-5.6-terra', selected: false, outcome: 'network_error' }] }));
  assert.doesNotMatch(diagnostics(lone), /קריאה חזקה שנייה/);
  assert.match(lone.run('tnuvaPaperStatusHtml()'), notice);

  // שירות 18: שלבי consensus בדיוק כמו קודם, ואין שורה של קריאה חזקה שנייה.
  const v18 = diagnostics(await scanned(service({ version: 18, disputedRows: [disputedRow([quantity])] })));
  assert.ok(v18.includes('טוקנים · תעודה 1 · consensus_escalation · gpt-5.6-terra: כניסה 201 · יציאה 21'), v18);
  assert.doesNotMatch(v18, /קריאה חזקה שנייה|second_strong_read/);
});

test('v143: the settings say whether the second strong read is on; service 18 shows nothing new', async () => {
  const c = await scanned(service({ disputedRows: [] }));
  const line = async status => {
    c.context.fetch = async () => ({ ok: true, status: 200, json: async () => status });
    await c.run('tnuvaShowServiceVersion()');
    return c.node('cfgServiceLine').textContent;
  };
  const health = { ok: true, keyConfigured: true, photoFirst: true, model: 'gpt-5.6-luna', retryModel: 'gpt-5.6-terra' };
  assert.equal(await line({ ...health, serviceVersion: 19, secondStrongRead: true }),
    'שירות הסריקה: גרסה 19 · gpt-5.6-luna · הסלמה: gpt-5.6-terra · קריאה חזקה שנייה: פעילה');
  // SECOND_STRONG_READ=off, או שאין מודל הסלמה.
  assert.equal(await line({ ...health, serviceVersion: 19, secondStrongRead: false }),
    'שירות הסריקה: גרסה 19 · gpt-5.6-luna · הסלמה: gpt-5.6-terra · קריאה חזקה שנייה: כבויה');
  assert.equal(await line({ ...health, serviceVersion: 18 }), 'שירות הסריקה: גרסה 18 · gpt-5.6-luna · הסלמה: gpt-5.6-terra');
});
