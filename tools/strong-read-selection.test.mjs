// v142: חוזה strongReadSelection. עד שירות 17 קריאת ההכרעה שהושלמה נבחרה תמיד.
// שירות 18 בוחר אחרי הסלמה את הקריאה שהנייר שלה נסגר הכי טוב (בשוויון — קריאת
// ההכרעה), אבל רק כשהבקשה נושאת "strongReadSelection": true. אפליקציה 142 שולחת
// את הדגל בכל בקשה שמתחילה סריקה; אפליקציה ישנה אינה שולחת אותו ומקבלת את הבחירה
// הישנה. כך סדר הפריסה של השירות והאפליקציה אינו משנה. הבדיקות כאן מריצות את
// האפליקציה כולה מול שירות 18 מדומה שמכבד את הדגל, ובודקות גם שאיסוף אחרי נתק
// (resume) ממשיך לעבוד, ושהתנהגות גרסה 141 (ראש תעודה חתוך, בלי מספר תעודה, זיכוי
// לפי המינוס, כפילות לפי סכום) נשמרת לצד שדות הקונצנזוס של שירות 18.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime } from './receipt-scan-harness.mjs';

// שני מוצרי YOLO באותו מחיר: מחלוקת על הקוד ביניהם היא בדיוק המקרה שבו "המודל
// החזק" סוגר זהות לבד — ולכן גם המקרה שבו חשוב מי נבחר בפועל.
const products = [
  { id: 'p_yolo_chocolate', name: 'YOLO שוקולד חלב מעולה 123 גרם', barcode: '7290014761056', price: 3.47 },
  { id: 'p_yolo_layers', name: 'YOLO מעדן שכבות שוקולד חלב ולבן 122 גרם', barcode: '7290014761414', price: 3.47 }
];
const row = { section: 'items', sourcePage: 1, lineNumber: 1, code: '14761056', description: 'מעדן שוקולד חלב YOLO',
  quantity: 10, unitPriceExVat: 3.47, lineTotalExVat: 34.7, promoStar: false, confidence: .8 };
// שירות 17 ומעלה אינו קורא את מספר התעודה, ולכן אין docNumber בכלל.
const paperDoc = (changes = {}) => ({ noteIndex: 0, docType: 'invoice', docDate: null, pageCount: 1, vatPct: 18,
  rows: [row], confidence: .8, itemsSectionTotalExVat: 34.7, promoDiscountExVat: 0, itemsPrintedLines: 1,
  returnsSectionTotalExVat: null, returnsPrintedLines: null, subtotalExVat: 34.7, warnings: [], ...changes });
const identity = [{ field: 'code', selected: '14761056', other: '14761414' }];
const quantity = [{ field: 'quantity', selected: 10, other: 16 }];
// שתי הקריאות הזולות נחלקו על שורה 1, וקריאת ההכרעה הושלמה.
const escalatedConsensus = fields => ({ attempted: true, reads: 2, completedReads: 2, model: 'gpt-5.6-luna', agreed: false,
  reason: 'reads_disagree', escalated: true, escalationModel: 'gpt-5.6-terra', escalationError: null, diffs: [],
  disputedRows: [{ noteIndex: 0, rowIndex: 0, lineNumber: 1, code: '14761056', description: 'מעדן שוקולד חלב YOLO', fields }],
  missingRows: [], unverifiedSingleRead: false, docDateUnconfirmed: [] });
const data = (consensus, doc = paperDoc()) => ({ products, promos: [], items: [],
  paper: { ok: true, serviceVersion: 18, model: 'gpt-5.6-terra', requestId: 'strong-read-selection-fixture', consensus,
    scan: { warnings: [], documents: [doc] } } });

// שירות 18 מדומה, רק לכלל הבחירה: קריאת ההכרעה רצה, וקריאה זולה נסגרה מול הנייר
// טוב ממנה. עם הדגל נבחרת הקריאה הזולה; בלעדיו קריאת ההכרעה מנצחת כמו ב-16 ו-17.
// escalationSelected מדווח בשני המקרים את מה שנבחר בפועל. כמו בשרת, הבחירה שייכת
// לעבודה שהתחילה: איסוף (resume) נושא רק את המפתח ומקבל את מה שהעבודה בחרה.
// stripFlag מדמה אפליקציה ישנה (141 ומטה) — הבקשה מגיעה לשירות בלי הדגל.
function service18(c, { stripFlag = false } = {}) {
  const original = c.context.fetch, started = new Map(), fromApp = [];
  c.context.fetch = async (url, options) => {
    if (!String(url).endsWith('/scan')) return original(url, options);
    const sent = JSON.parse(options.body);
    fromApp.push(structuredClone(sent));
    if (stripFlag) { delete sent.strongReadSelection; options = { ...options, body: JSON.stringify(sent) }; }
    const response = await original(url, options);
    const payload = await response.json();
    if (!payload.ok) return response;
    if (sent.resume !== true) started.set(sent.scanKey, sent.strongReadSelection === true);
    const strongWins = started.get(sent.scanKey) !== true;
    payload.model = strongWins ? 'gpt-5.6-terra' : 'gpt-5.6-luna';
    payload.consensus = { ...payload.consensus, escalationSelected: strongWins };
    payload.scanAudit = { version: 1, attempts: [
      { stage: 'consensus_1', requestedModel: 'gpt-5.6-luna', selected: !strongWins, paperError: 0 },
      { stage: 'consensus_2', requestedModel: 'gpt-5.6-luna', selected: false, paperError: 0 },
      { stage: 'consensus_escalation', requestedModel: 'gpt-5.6-terra', selected: strongWins, paperError: 1 }] };
    const body = JSON.stringify(payload);
    return { ...response, text: async () => body, json: async () => JSON.parse(body) };
  };
  return fromApp;
}

function app(paper) {
  const c = runtime('tnuva', { data: paper });
  c.run(`currentView='receiving'; mainMode='receiving'; scanPurpose='receiving'; refreshScanHost = () => {};
    aiScanDocuments = [{ noteIndex: 0, amount: null, units: null, lines: null,
      pages: [{ dataUrl: 'data:image/jpeg;base64,Zml4dHVyZQ==', orientationConfirmed: true }] }];`);
  return c;
}
const scanBodies = c => c.requests.filter(r => r.url.endsWith('/scan')).map(r => JSON.parse(r.body));
const starts = bodies => bodies.filter(b => b.resume !== true);
const actions = c => JSON.parse(c.run(`JSON.stringify((function(){ const a = receiptRowActions();
  return { modelSettled: a.modelSettled, disputed: a.disputed.map(x => x.row.line) }; })())`));
const html = c => { c.run('renderReceiving()'); return c.node('app').innerHTML; };
const decided = /הכריע gpt-5\.6-terra בקריאה שלישית/;
const witnessOnly = /נערכה קריאה שלישית ב־gpt-5\.6-terra, אבל נבחרה הקריאה שנסגרה טוב יותר מול הנייר — ההכרעה כאן שלך/;
const notice = /רק קריאה אחת של הצילום הצליחה, והאימות לא הושלם — בדוק את השורות מול הנייר, או צלם שוב\./;

test('v142: every /scan request that starts a scan asks for the paper-based selection', async () => {
  // תעודה אחת, שתי תעודות, ומסך "הכמויות נבדקות ידנית".
  for (const [label, start] of [
    ['one paper', c => c.scan(1)],
    ['two papers', c => c.scan(2)],
    ['manual quantities', c => c.run('tnuvaStartPaperScan({manualQuantities:true})')]]) {
    const c = app(data(escalatedConsensus(quantity)));
    await start(c);
    const bodies = scanBodies(c);
    assert.ok(bodies.length >= 1, label);
    for (const body of bodies) {
      assert.ok(Array.isArray(body.documents) && body.documents.length === 1, label + ': a full scan request');
      assert.equal(body.strongReadSelection, true, label + ': the flag is the boolean true');
      assert.equal(body.resume, undefined, label);
    }
  }
  // צילום חדש לתעודה שכבר נקראה שולח סריקה חדשה — גם היא עם הדגל.
  const c = app(data(escalatedConsensus(quantity)));
  await c.scan(1);
  c.run("aiScanDocuments[0].pages=[{dataUrl:'data:image/jpeg;base64,Yg==',orientationConfirmed:true}]; aiScanDocuments[0].cachedPages=null;");
  await c.run('tnuvaStartPaperScan()');
  const bodies = scanBodies(c);
  assert.equal(bodies.length, 2);
  assert.ok(bodies.every(body => body.strongReadSelection === true && Array.isArray(body.documents)));
  assert.notEqual(bodies[0].scanKey, bodies[1].scanKey, 'a new photo is a new scan, not a collect');
});

test('v142: with the flag, service 18 selects by the paper and the card says the third read was only a witness', async () => {
  const c = app(data(escalatedConsensus(identity)));
  const sent = service18(c);
  await c.run('tnuvaStartPaperScan()');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].strongReadSelection, true);
  assert.equal(c.run('aiScanResponse.perDocument[0].consensus.escalationSelected'), false);
  // שתי זהויות באותו מחיר אינן נסגרות "לפי המודל החזק" — הוא לא נבחר.
  assert.deepEqual(actions(c), { modelSettled: 0, disputed: [1] });
  assert.match(html(c), witnessOnly);
  assert.doesNotMatch(html(c), decided);
  const words = app(data(escalatedConsensus(quantity)));
  service18(words);
  await words.run('tnuvaStartPaperScan()');
  assert.match(html(words), witnessOnly);
  assert.doesNotMatch(html(words), decided);
});

test('v142: without the flag (an app before 142) service 18 keeps the old selection, and app 142 reads it as before', async () => {
  const c = app(data(escalatedConsensus(identity)));
  const sent = service18(c, { stripFlag: true });
  await c.run('tnuvaStartPaperScan()');
  assert.equal(sent[0].strongReadSelection, true, 'app 142 sent it; the old app is simulated on the way');
  assert.equal(c.requests.filter(r => r.url.endsWith('/scan')).map(r => JSON.parse(r.body))[0].strongReadSelection, undefined,
    'the service received no flag');
  assert.equal(c.run('aiScanResponse.perDocument[0].consensus.escalationSelected'), true, 'reported truthfully');
  // הבחירה הישנה: קריאת ההכרעה נבחרה, וזהות באותו מחיר נסגרת לפי המודל החזק — כמו ב-16 ו-17.
  assert.deepEqual(actions(c), { modelSettled: 1, disputed: [] });
  const words = app(data(escalatedConsensus(quantity)));
  service18(words, { stripFlag: true });
  await words.run('tnuvaStartPaperScan()');
  assert.match(html(words), decided);
  assert.doesNotMatch(html(words), witnessOnly);
  // ושירות 17 (בלי escalationSelected בכלל) נקרא בדיוק כך.
  const { unverifiedSingleRead, docDateUnconfirmed, ...v17 } = escalatedConsensus(identity);
  const old = app({ ...data(v17), paper: { ...data(v17).paper, serviceVersion: 17 } });
  await old.run('tnuvaStartPaperScan()');
  assert.deepEqual(actions(old), { modelSettled: 1, disputed: [] });
});

test('v142: a resume keeps working — it carries only the key, and the scan keeps the selection it started with', async () => {
  // הצילומים הגיעו והתשובה מתה בדרך: הניסיון החוזר אוסף את אותה סריקה.
  {
    const c = app(data(escalatedConsensus(identity)));
    const sent = service18(c);
    const withFlag = c.context.fetch;
    let dead = true;
    c.context.fetch = async (url, options) => {
      const answer = await withFlag(url, options);
      if (String(url).endsWith('/scan') && dead && !JSON.parse(options.body).resume) { dead = false; throw Error('Load failed'); }
      return answer;
    };
    await c.run('tnuvaStartPaperScan()');
    assert.equal(sent.length, 2);
    assert.equal(sent[0].strongReadSelection, true);
    assert.deepEqual(Object.keys(sent[1]).sort(), ['resume', 'scanKey'], 'the collect request carries only the key');
    assert.equal(sent[1].scanKey, sent[0].scanKey);
    assert.equal(c.run('receiptPaperScanState'), 'ok');
    assert.equal(c.run('aiScanResponse.perDocument[0].consensus.escalationSelected'), false, 'the selection the scan started with');
    assert.deepEqual(actions(c), { modelSettled: 0, disputed: [1] });
  }
  // ההעלאה נפלה לפני שהגיעה: השירות אינו מכיר את המפתח, והצילומים נשלחים שוב — עם הדגל ובאותו מפתח.
  {
    const c = app(data(escalatedConsensus(identity)));
    const sent = service18(c);
    const withFlag = c.context.fetch;
    let calls = 0;
    c.context.fetch = async (url, options) => {
      if (String(url).endsWith('/scan') && ++calls === 1) throw Error('Load failed');
      return withFlag(url, options);
    };
    await c.run('tnuvaStartPaperScan()');
    assert.deepEqual(sent.map(body => body.resume === true ? 'resume' : 'start'), ['resume', 'start']);
    assert.equal(sent[1].strongReadSelection, true);
    assert.equal(sent[1].scanKey, sent[0].scanKey);
    assert.deepEqual(actions(c), { modelSettled: 0, disputed: [1] });
  }
  // הקו מת שלוש פעמים: הסריקה נכשלת, והלחיצה הבאה אוספת אותה לפי טביעת האצבע — שאינה תלויה בדגל.
  {
    const c = app(data(escalatedConsensus(identity)));
    const sent = service18(c);
    const withFlag = c.context.fetch;
    let dead = true;
    c.context.fetch = async (url, options) => {
      const answer = await withFlag(url, options);
      if (dead && String(url).endsWith('/scan')) throw Error('Load failed');
      return answer;
    };
    await c.run('tnuvaStartPaperScan()');
    assert.equal(c.run('receiptPaperScanState'), 'failed');
    dead = false;
    await c.run('tnuvaStartPaperScan()');
    assert.equal(starts(sent).length, 1, 'the photos were paid for once');
    assert.equal(sent[sent.length - 1].resume, true, 'the next press collected');
    assert.equal(sent[sent.length - 1].scanKey, sent[0].scanKey);
    assert.equal(c.run('receiptPaperScanState'), 'ok');
    assert.deepEqual(actions(c), { modelSettled: 0, disputed: [1] });
  }
});

// גרסה 141 (ראש התעודה אינו תנאי לקליטה) ושירות 18 יחד: נייר שהכותרת, המספר
// והתאריך שלו נחתכו, שרק קריאה אחת שלו הצליחה, ושעל התאריך שלו הקריאות נחלקו.
test('v142 with 141: a cut header, no number, a credit by its minus sign and a duplicate by amount behave as in 141', async () => {
  const lone = { attempted: true, reads: 2, completedReads: 1, model: 'gpt-5.6-luna', agreed: false, reason: 'read_failed',
    escalated: false, escalationModel: null, escalationError: 'openai_network_error', escalationSelected: false,
    diffs: [], disputedRows: [], missingRows: [], unverifiedSingleRead: true, docDateUnconfirmed: [0] };
  const header = ['כותרת המסמך ומספר התעודה חתוכים/אינם קריאים בצילום'];
  // 'unknown' — טיוטה מלפני שירות 17; 'invoice' — מה ששירות 17 ומעלה מחזיר לכותרת חתוכה.
  for (const docType of ['invoice', 'unknown']) {
    const c = app(data(lone, paperDoc({ docType, docDate: '14/10/2026', warnings: header })));
    c.run(`todayStr = () => '2026-10-15';`);
    await c.run('tnuvaStartPaperScan()');
    assert.equal(c.run('receiptPaperScanState'), 'ok', docType + ': the header is not a condition (141)');
    assert.doesNotMatch(c.run('JSON.stringify(receiptPaperScanProblems)'), /סוג התעודה|כותרת/, docType);
    assert.equal(c.run('receiptNoteTotal'), 34.7, docType + ': the paper amount was adopted');
    const status = c.run('tnuvaPaperStatusHtml()');
    assert.match(status, /התעודה נקראה ואומתה/, docType);
    assert.match(status, notice, docType + ': the single-read notice (142) stays');
    const a = JSON.parse(c.run('JSON.stringify(receiptPriceAudit())'));
    assert.equal(a.complete, true, docType + ': the price review is complete without a header (141)');
    assert.equal(a.rows[0].result, 'match', docType);
    // התאריך שנחלקו עליו אינו היום של המבצעים (142), והשורה בלי מספר תעודה (141).
    assert.deepEqual([a.documents[0].date, a.documents[0].dateDoubt], ['2026-10-15', 'disputed'], docType);
    const view = c.run('receiptPriceAuditHtml()');
    assert.match(view, /<span data-price-date-doubt="disputed"[^>]*>תאריך התעודה לא נקרא בוודאות/, docType);
    assert.match(view, /תאריך התעודה<input type="date"/, docType + ': one paper — no number, no ordinal');
    assert.doesNotMatch(view, /מספר לא נקרא|תעודה 1|לא נקרא · /, docType);
    assert.equal(c.requests.filter(r => r.url.endsWith('/scan')).length, 1, docType + ': one paid scan');
  }

  // זיכוי שהכותרת שלו נחתכה נעצר לפי המינוס בסיכום (141), בלי סריקה נוספת, וההודעה של 142 נשארת.
  const credit = app(data(lone, paperDoc({ subtotalExVat: -34.7, vatAmount: -6.25, totalInclVat: -40.95, warnings: header })));
  await credit.run('tnuvaStartPaperScan()');
  assert.equal(credit.run('receiptPaperScanState'), 'failed');
  assert.match(credit.run('JSON.stringify(receiptPaperScanProblems)'), /כנראה חשבונית זיכוי/);
  assert.equal(credit.run('receiptNoteTotal'), null, 'a credit is never received as goods');
  assert.match(credit.run('tnuvaPaperStatusHtml()'), notice);
  assert.equal(credit.requests.filter(r => r.url.endsWith('/scan')).length, 1, 'no re-read from the app');

  // כפילות לפי סכום הנייר ותאריך (141) אינה תלויה בתאריך הנייר שנחשד (142): היא נמדדת לפי היום שהוקלד והיום.
  const dup = app(data(lone, paperDoc({ docDate: '14/10/2026', warnings: header })));
  dup.run(`todayStr = () => '2026-10-15';`);
  await dup.run('tnuvaStartPaperScan()');
  dup.run(`receipts = [{ id: 'earlier', date: '2026-10-14', docDate: '2026-10-14', timestamp: Date.parse('2026-10-14T06:00:00Z'),
      status: 'ok', count: 1, noteParts: [{ amount: 34.7, lines: 1 }], totalExVat: 34.7 }];
    receiptList = [{ productId: 'p_yolo_chocolate', name: 'YOLO שוקולד חלב מעולה 123 גרם', qty: 10 }]; receiptDupConfirmed = true;
    asked = null; showConfirm = (title, text) => { asked = { title, text }; };`);
  dup.run('finishReceipt()');
  const asked = JSON.parse(dup.run('JSON.stringify(asked)'));
  assert.equal(asked && asked.title, 'ייתכן שהתעודה כבר נקלטה');
  assert.match(asked.text, /כבר נקלטה תעודה בסכום ₪34\.70 · 1 שורות/);
  assert.doesNotMatch(asked.text, /מספר/);
});
