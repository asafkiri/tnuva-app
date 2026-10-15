// v141: קריאה אחת בלי אף עד אינה קריאה מאומתת. כשאחת משתי הקריאות המקבילות
// נפלה וגם קריאת ההכרעה לא הושלמה, השרת החזיר ok בלי מחלוקת ובלי אזהרה — ומסך
// הקליטה הציג "נקראה ואומתה" כאילו שתי קריאות הסכימו. שירות 17 מסמן את זה
// (unverifiedSingleRead); מול שרת ישן הלקוח גוזר את אותו דבר מהשדות שכבר קיימים.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime, fixture } from './receipt-scan-harness.mjs';

const notice = /רק קריאה אחת של הצילום הצליחה, והאימות לא הושלם — בדוק את השורות מול הנייר, או צלם שוב\./;
const scanCount = c => c.requests.filter(r => r.url.endsWith('/scan')).length;
const twoReads = { attempted: true, reads: 2, completedReads: 2, model: 'gpt-5.6-luna', agreed: true, escalated: false,
  escalationModel: null, escalationError: null, reason: null, diffs: [], disputedRows: [], missingRows: [] };
// אחת הקריאות הזולות נפלה, וקריאת ההכרעה נפלה גם היא — כמו שהשרת (16 ו-17) מחזיר.
const lone = { ...twoReads, completedReads: 1, agreed: false, reason: 'read_failed', escalationError: 'openai_network_error' };
const audit = (...stages) => ({ version: 1, attempts: stages.map(([stage, selected]) => ({ stage, selected,
  requestedModel: stage === 'consensus_escalation' || stage === 'checksum_retry' ? 'gpt-5.6-terra' : 'gpt-5.6-luna' })) });
const loneAudit = audit(['consensus_1', true], ['consensus_2', false], ['consensus_2_retry', false], ['consensus_escalation', false]);

async function scanned(paper, count = 1) {
  const data = fixture('tnuva');
  Object.assign(data.paper, paper);
  const c = runtime('tnuva', { data });
  await c.scan(count);
  return c;
}
const status = c => c.run('tnuvaPaperStatusHtml()');

test('v141: a lone read the new service marks unverified shows a notice that does not block receiving', async () => {
  const c = await scanned({ serviceVersion: 17, consensus: { ...lone, escalationSelected: false, unverifiedSingleRead: true }, scanAudit: loneAudit });
  assert.equal(c.run('receiptPaperScanState'), 'ok', 'the paper itself still closes');
  assert.match(status(c), /התעודה נקראה ואומתה/);
  assert.match(status(c), notice);
  c.run('renderReceiving()');
  assert.match(c.node('app').innerHTML, notice);
  // אינה חוסמת: הקליטה נגמרת כרגיל.
  c.run('finishReceipt()');
  assert.equal(c.run('currentView'), 'reconcile');
});

test('v141: the notice survives a draft reload without another paid scan', async () => {
  const c = await scanned({ serviceVersion: 17, consensus: { ...lone, escalationSelected: false, unverifiedSingleRead: true }, scanAudit: loneAudit });
  const restored = runtime('tnuva', { storage: c.storage });
  assert.equal(restored.run('receiptPaperScanState'), 'ok');
  assert.match(status(restored), notice);
  assert.equal(scanCount(restored), 0);
});

test('v141: an old service is read the same way from the fields it already sends', async () => {
  // שירות 16: אין unverifiedSingleRead ואין escalationSelected.
  const old = await scanned({ serviceVersion: 16, consensus: lone, scanAudit: loneAudit });
  assert.match(status(old), notice);
  assert.match(status(runtime('tnuva', { storage: old.storage })), notice, 'and after a reload');
  // גם בלי יומן ניסיונות.
  assert.match(status(await scanned({ serviceVersion: 16, consensus: lone, scanAudit: null })), notice);
});

test('v141: the notice stays next to the paper problems when the paper does not close', async () => {
  const paper = fixture('tnuva').paper.scan;
  const c = await scanned({ consensus: { ...lone, unverifiedSingleRead: true },
    scan: { ...paper, documents: [{ ...paper.documents[0], subtotalExVat: 60 }] } });
  assert.equal(c.run('receiptPaperScanState'), 'failed');
  assert.match(status(c), notice);
  assert.match(status(c), /לפני הסיום צריך להשלים את נתוני התעודה/);
});

test('v141: a normal two-read scan, or a lone read that has a witness, shows no notice', async () => {
  for (const [label, paper] of [
    ['two reads agreed (old service)', { consensus: twoReads }],
    ['two reads agreed (service 17)', { consensus: { ...twoReads, escalationSelected: false, unverifiedSingleRead: false } }],
    ['no consensus at all', { consensus: undefined }],
    ['consensus switched off', { consensus: { ...twoReads, attempted: false, reads: 1, completedReads: 1 } }],
    // ההסלמה הושלמה, ולכן היא העדה של הקריאה שנבחרה.
    ['the escalation completed', { consensus: { ...lone, escalated: true, escalationModel: 'gpt-5.6-terra', escalationError: null } }],
    // קריאת ההצלה של סכום הביקורת נבחרה, והקריאה הזולה שנותרה היא העדה שלה.
    ['a checksum retry was selected', { consensus: lone, checksumRetryAttempted: true, checksumRetryModel: 'gpt-5.6-terra',
      scanAudit: audit(['consensus_1', false], ['consensus_2', false], ['consensus_escalation', false], ['checksum_retry', true]) }],
    // שלוש קריאות הוגדרו ושתיים הושלמו — יש עד, גם בלי ההסלמה.
    ['three reads configured, two completed', { consensus: { ...lone, reads: 3, completedReads: 2 } }],
    // שירות 17 אומר במפורש שיש עד; הגזירה של שרת ישן אינה גוברת עליו.
    ['service 17 says a witness exists', { consensus: { ...lone, escalationSelected: false, unverifiedSingleRead: false } }]
  ]) {
    const c = await scanned(paper);
    assert.equal(c.run('receiptPaperScanState'), 'ok', label);
    assert.match(status(c), /התעודה נקראה ואומתה/, label);
    assert.doesNotMatch(status(c), notice, label);
  }
});

// "פענח תעודה — הכמויות נבדקות ידנית" מצייר מסך אחר (receiptManualReceivingHtml),
// שאינו עובר דרך tnuvaPaperStatusHtml. שם המשתמש מאשר את כל הכמויות בלחיצה אחת —
// המקום שבו שורה שרק קריאה אחת ראתה מזיקה יותר מכול.
async function scannedManual(paper) {
  const data = fixture('tnuva');
  Object.assign(data.paper, paper);
  const c = runtime('tnuva', { data });
  c.run(`receiptOpened = false; receiptList = []; receiptDupConfirmed = true;
    aiScanDocuments = [{noteIndex:0, amount:null, units:null, pages:[{dataUrl:'data:image/jpeg;base64,Zml4dHVyZQ==', orientationConfirmed:true}]}];`);
  await c.run('tnuvaStartPaperScan({manualQuantities:true})');
  return c;
}
const manualScreen = c => c.node('app').innerHTML;

test('v141: the manual-quantities screen shows the notice too, live and after a draft reload', async () => {
  for (const [label, paper] of [
    ['service 17', { serviceVersion: 17, consensus: { ...lone, escalationSelected: false, unverifiedSingleRead: true }, scanAudit: loneAudit }],
    ['service 16', { serviceVersion: 16, consensus: lone, scanAudit: loneAudit }]
  ]) {
    const c = await scannedManual(paper);
    assert.equal(c.run('receiptPaperScanState'), 'ok', label);
    assert.equal(c.run('receiptUsesManualQuantities()'), true, label);
    // המסך שצויר כשהפענוח הסתיים, בלי ציור נוסף מצד הבדיקה.
    assert.match(manualScreen(c), /data-manual-receiving/, label);
    assert.match(manualScreen(c), /הגיע בדיוק מה שכתוב בתעודה\?/, label);
    assert.match(manualScreen(c), notice, label);
    const restored = runtime('tnuva', { storage: c.storage });
    assert.equal(restored.run('receiptUsesManualQuantities()'), true, label + ' after reload');
    restored.run('renderReceiving()');
    assert.match(manualScreen(restored), /data-manual-receiving/, label + ' after reload');
    assert.match(manualScreen(restored), notice, label + ' after reload');
    assert.equal(scanCount(restored), 0, label + ' without another paid scan');
  }
});

test('v141: on the manual-quantities screen the notice stays above the paper problems, and a normal scan has none', async () => {
  const paper = fixture('tnuva').paper.scan;
  const failed = await scannedManual({ consensus: { ...lone, unverifiedSingleRead: true },
    scan: { ...paper, documents: [{ ...paper.documents[0], subtotalExVat: 60 }] } });
  assert.equal(failed.run('receiptPaperScanState'), 'failed');
  const html = manualScreen(failed);
  assert.match(html, notice);
  assert.match(html, /בדוק את צילומי התעודה \/ צלם שוב/);
  assert.ok(html.search(notice) < html.indexOf('בדוק את צילומי התעודה'), 'the notice comes before the problems box');

  for (const [label, consensus] of [['old service', twoReads], ['service 17', { ...twoReads, escalationSelected: false, unverifiedSingleRead: false }]]) {
    const c = await scannedManual({ consensus });
    assert.equal(c.run('receiptPaperScanState'), 'ok', label);
    assert.match(manualScreen(c), /הגיע בדיוק מה שכתוב בתעודה\?/, label);
    assert.doesNotMatch(manualScreen(c), notice, label);
  }
});

test('v141: with several papers the notice names the one read by a single read', async () => {
  const c = await scanned({ consensus: { ...lone, unverifiedSingleRead: true } }, 2);
  c.run('aiScanDocuments[0].scanResult.consensus = ' + JSON.stringify({ ...twoReads, unverifiedSingleRead: false }) + '; receiptRebuildScanResponse();');
  assert.match(status(c), /תעודה 2: רק קריאה אחת של הצילום הצליחה/);
  assert.doesNotMatch(status(c), /תעודה 1, 2:|תעודה 1:/);
});
