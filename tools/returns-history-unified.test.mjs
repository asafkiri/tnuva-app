// v122: היסטוריית החזרות אוחדה לתוך מסך התעודות — מסך אחד לכל התעודות, קליטות וחזרות.
// עד כה היו שני מסכי היסטוריה: "היסטוריית חזרות" (returnsHistory, רק תעודות
// זיכוי) ו"תעודות" (receiptsHistory, קליטות וחזרות יחד). מעכשיו כל לחיצה על
// "היסטוריית חזרות" — הכפתור בלשונית החזרות, הבאנר האדום, כפתור ההיסטוריה
// העליון, חזרה ממסך האימות ומעריכת הפריטים, וגם רשומות ישנות בהיסטוריית
// הדפדפן — נוחתת במסך התעודות המאוחד. שום דבר שהמסך הישן ידע לא נעלם: כרטיס
// החזרה במסך המאוחד מציע את כל הפעולות שלו (שליחה חוזרת, אימות/אישור, עריכת
// פריטים, מחיקה, פירוט הפער), מאזן הזיכויים ושורות המצב עברו לראש המסך,
// ומחיקת ההיסטוריה יושבת תחת "ניהול תעודות". וגם מה שקרה מאחורי הקלעים:
// כל שרשרת ציור-מחדש שידעה "אם אנחנו במסך החזרות — צייר אותו" מציירת עכשיו
// את המסך המאוחד — אישור, ביטול אימות ומחיקה מתוכו, וגם עדכון שמגיע מהענן.
// הבדיקה מריצה את מודול האפליקציה המלא ולוחצת על הכפתורים עצמם.
//
// הרצה: node --test tools/returns-history-unified.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runtime } from './receipt-scan-harness.mjs';

const SUPPLIER = 'tnuva';
const json = (c, expression) => JSON.parse(c.run('JSON.stringify(' + expression + ')'));
const app = c => c.run("$('app').innerHTML");

// שתי שורות קבועות: 4 × 7.42 + 2 × 4.60 = 38.88 ללא מע״מ
const LINES = [
  { productId: 'p-milk', name: 'חלב בדיקה', barcode: '7290000000008', qty: 4, unitPrice: 7.42, lineTotal: 29.68 },
  { productId: 'p-cottage', name: 'קוטג׳ בדיקה', barcode: '7290000000015', qty: 2, unitPrice: 4.6, lineTotal: 9.2 }
];
const SENT_EX = 38.88;
// בתעודה עם הפער הספק זיכה 3 חלב במקום 4: 31.46 בנייר, חסר 7.42
const GAP_LINES = [Object.assign({}, LINES[0], { noteQty: 3 }), Object.assign({}, LINES[1], { noteQty: 2 })];
const GAP_NOTE = 31.46;
const GAP_OWED = 7.42;

// שלוש תעודות חזרה בשלושה מצבים — ממתינה לאימות (יומית), אומתה בלי פער, אומתה עם פער פתוח
const PENDING = { id: 'ret-pending', timestamp: Date.UTC(2026, 8, 26, 17, 35), date: '2026-09-26', docDate: '2026-09-26', sentTo: 'קבוצה בוואטסאפ',
  items: LINES, totalExVat: SENT_EX, totalIncVat: SENT_EX, credited: false, returnKind: 'daily' };
const VERIFIED_OK = { id: 'ret-ok', timestamp: Date.UTC(2026, 8, 24, 9, 0), date: '2026-09-24', docDate: '2026-09-24', sentTo: 'קבוצה בוואטסאפ',
  items: LINES, totalExVat: SENT_EX, totalIncVat: SENT_EX, credited: true, creditedAt: Date.UTC(2026, 8, 25, 10, 0), creditNoteTotal: SENT_EX, creditStatus: 'ok' };
const VERIFIED_GAP = { id: 'ret-gap', timestamp: Date.UTC(2026, 8, 22, 8, 0), date: '2026-09-22', docDate: '2026-09-22', sentTo: 'קבוצה בוואטסאפ',
  items: GAP_LINES, totalExVat: SENT_EX, totalIncVat: SENT_EX, credited: true, creditedAt: Date.UTC(2026, 8, 23, 10, 0), creditNoteTotal: GAP_NOTE, creditStatus: 'open' };

function setup(returnsDocs, opts) {
  const c = runtime(SUPPLIER);
  c.context.testConfirms = [];
  c.context.testResends = [];
  c.context.testCleared = [];
  c.run(`
    products = [
      { id: 'p-milk', name: 'חלב בדיקה', barcode: '7290000000008', price: 7.42 },
      { id: 'p-cottage', name: 'קוטג׳ בדיקה', barcode: '7290000000015', price: 4.6 }
    ];
    returns = ${JSON.stringify(returnsDocs || [PENDING, VERIFIED_OK, VERIFIED_GAP])};
    receipts = [];
    receiptHistoryFilter = ${JSON.stringify((opts && opts.filter) || 'all')};
    showConfirm = (title, msg, okText, cb) => { testConfirms.push({ title, msg, okText, cb }); };
    openReturnsResend = r => { testResends.push(r.id); };
    clearAllDocs = async name => { testCleared.push(name); };
  `);
  return c;
}

// הגבול מול Firebase: ההרנס מוחק את ייבוא הספרייה, ולכן המאזינים של startListeners()
// נרשמים אצלנו ואנחנו "משדרים" להם תמונת מצב — כמו שהענן היה עושה אחרי מחיקה או
// עדכון ממכשיר אחר. מחיקה בטוחה (סל מחזור + מחיקה) נרשמת כפעולות של writeBatch.
function withCloud(c) {
  const listeners = [], batches = [];
  Object.assign(c.context, {
    collection: (_db, ...path) => path.join('/'), doc: (_db, ...path) => path.join('/'),
    query: ref => ref, orderBy: () => null, limit: () => null, where: () => null, setDoc: async () => {},
    onSnapshot: (ref, a, b) => { listeners.push({ ref: String(ref), cb: typeof a === 'function' ? a : b }); return () => {}; },
    writeBatch: () => { const ops = []; return { set: (ref, data) => ops.push({ op: 'set', ref, data }), delete: ref => ops.push({ op: 'delete', ref }), commit: async () => { batches.push(ops); } }; }
  });
  c.run('startListeners()');
  const returnsListener = listeners.find(l => l.ref.endsWith('/returns'));
  assert.ok(returnsListener, 'המאזין לאוסף החזרות נרשם');
  const snapshot = docs => ({ empty: !docs.length, docs: docs.map(d => { const data = Object.assign({}, d); delete data.id; return { id: d.id, data: () => data }; }) });
  return { batches, push: docs => returnsListener.cb(snapshot(docs)) };
}

// ===== א. הניווט: כל דרך ישנה למסך החזרות נוחתת במסך התעודות =====

test('setView("returnsHistory") הוא כינוי תאימות — נוחת במסך התעודות המאוחד', () => {
  const c = setup();
  c.run("setView('returnsHistory')");
  assert.equal(c.run('currentView'), 'receiptsHistory', 'המסך הישן אינו קיים יותר — הכינוי מוביל למסך התעודות');
  assert.ok(app(c).includes('<h2 class="font-black text-2xl text-slate-800">היסטוריית תעודות</h2>'), 'ונצייר המסך המאוחד, לא משהו אחר');
  // רשומה ישנה בהיסטוריית הדפדפן (popstate ממושב קודם) — אותו יעד
  c.run("setView('receiving'); setView('returnsHistory', { fromPop: true })");
  assert.equal(c.run('currentView'), 'receiptsHistory', 'גם חזרה אחורה בדפדפן אל רשומה ישנה');
});

test('setView("receiptsHistory") מצייר את הכותרת המאוחדת: "היסטוריית תעודות" ושורת המשנה', () => {
  const c = setup();
  c.run("setView('receiptsHistory')");
  const html = app(c);
  assert.equal(c.run('currentView'), 'receiptsHistory');
  assert.ok(html.includes('<h2 class="font-black text-2xl text-slate-800">היסטוריית תעודות</h2>'), 'הכותרת');
  assert.ok(html.includes('<div class="text-xs text-slate-500 font-bold">קליטות וחזרות יחד · פתח קודם את מה שדורש טיפול</div>'), 'שורת המשנה');
  assert.ok(!html.includes('תעודות קליטה</h2>'), 'הכותרת הישנה של מסך הקליטות נעלמה');
  assert.ok(!html.includes('<h2 class="font-black text-2xl text-slate-800">היסטוריית חזרות</h2>'), 'וגם הכותרת של מסך החזרות הישן');
  // גם מסך ריק לגמרי נושא את אותה כותרת
  const empty = setup([]);
  empty.run("setView('receiptsHistory')");
  assert.ok(app(empty).includes('היסטוריית תעודות</h2>') && app(empty).includes('אין תעודות עדיין'));
});

test('לחיצה על "היסטוריית חזרות" (ret-history) — מהכפתור בלשונית החזרות ומהבאנר האדום — מגיעה למסך התעודות', () => {
  // בלי תעודות ממתינות: הכפתור הלבן עם השעון, שעכשיו נקרא "היסטוריית תעודות — קליטות וחזרות"
  const quiet = setup([VERIFIED_OK]);
  quiet.run("setView('returns')");
  const returnsTab = app(quiet);
  assert.ok(returnsTab.includes('data-role="ret-history"'), 'כפתור ההיסטוריה בלשונית החזרות');
  assert.ok(returnsTab.includes('היסטוריית תעודות — קליטות וחזרות'), 'עם התווית החדשה');
  assert.ok(!returnsTab.includes('> היסטוריית חזרות</button>'), 'ולא עם התווית הישנה');
  quiet.click('ret-history');
  assert.equal(quiet.run('currentView'), 'receiptsHistory');
  assert.ok(app(quiet).includes('היסטוריית תעודות</h2>'), 'המסך המאוחד צויר');

  // עם תעודה ממתינה: הבאנר האדום "לאימות ←" — אותו תפקיד, אותו יעד
  const busy = setup();
  busy.run("setView('returns')");
  const banner = app(busy);
  assert.ok(banner.includes('data-role="ret-history"') && banner.includes('לאימות ←') && banner.includes('יש תעודת חזרות פתוחה לאימות'), 'הבאנר האדום נשאר');
  busy.click('ret-history');
  assert.equal(busy.run('currentView'), 'receiptsHistory');
  assert.ok(app(busy).includes('data-role="rv-approve" data-id="ret-pending"'), 'ומוצאים שם מיד את התעודה שממתינה לאימות');
});

test('כפתור ההיסטוריה העליון (btnHistory): חזרות, קליטה וניהול — למסך התעודות; הזמנות — להיסטוריית ההזמנות', () => {
  const c = setup();
  const press = mode => { c.run("mainMode = '" + mode + "'; currentView = '" + mode + "'"); c.events.get('btnHistory:click')(); return c.run('currentView'); };
  assert.equal(press('returns'), 'receiptsHistory', 'מלשונית החזרות');
  assert.ok(app(c).includes('היסטוריית תעודות</h2>'), 'המסך המאוחד צויר');
  assert.equal(press('receiving'), 'receiptsHistory', 'מלשונית הקליטה');
  assert.equal(press('manage'), 'receiptsHistory', 'מלשונית הניהול');
  assert.equal(press('order'), 'history', 'הזמנות שומרות על היסטוריית ההזמנות שלהן');
});

test('מסנן שנבחר בביקור קודם אינו מסתיר חזרות: הכניסה מלשונית החזרות ונחיתה אחרי שמירה מאפסות ל"הכול"', async () => {
  // המשתמש סינן "הושלמו" במסך התעודות, חזר ללשונית החזרות ולחץ על הבאנר האדום "לאימות ←"
  const c = setup(undefined, { filter: 'done' });
  c.run("setView('receiptsHistory')");
  assert.ok(!app(c).includes('data-id="ret-pending"') && app(c).includes('data-id="ret-ok"'), 'במסנן "הושלמו" הממתינה אכן מוסתרת');
  c.run("setView('returns')");
  c.click('ret-history');
  assert.equal(c.run('currentView'), 'receiptsHistory');
  assert.equal(c.run('receiptHistoryFilter'), 'all', 'הבאנר האדום מאפס את המסנן');
  assert.ok(app(c).includes('data-role="rv-approve" data-id="ret-pending"') && app(c).includes('data-id="ret-gap"') && app(c).includes('data-id="ret-ok"'), 'רואים את כל התעודות — כמו במסך החזרות הישן');
  // כפתור ההיסטוריה העליון מלשונית החזרות — אותו דבר
  c.run("receiptHistoryFilter = 'credit'; mainMode = 'returns'; currentView = 'returns'");
  c.events.get('btnHistory:click')();
  assert.equal(c.run('receiptHistoryFilter'), 'all', 'כפתור ההיסטוריה מלשונית החזרות מאפס את המסנן');
  assert.ok(app(c).includes('data-id="ret-gap"') && app(c).includes('data-id="ret-ok"'));
  // שמירה בלי שליחה נוחתת במסך התעודות — והתעודה שנשמרה עכשיו (ממתינה) חייבת להיראות גם אם קודם סוננו "הושלמו"
  c.run("receiptHistoryFilter = 'done'; currentView = 'returns'; sendCtx = { type: 'returns', items: " + JSON.stringify(LINES) + ', totalExVat: ' + SENT_EX + ', totalIncVat: ' + SENT_EX + ' }');
  await c.run('saveReturnsWithoutSending()');
  assert.equal(c.run('currentView'), 'receiptsHistory');
  assert.equal(c.run('receiptHistoryFilter'), 'all', 'הנחיתה אחרי שמירה מראה את כל התעודות');
  assert.ok(app(c).includes('data-id="ret-pending"'));
});

test('צ׳יפי הסינון לא השתנו באיחוד: "פתוחות" — קליטות בלבד, "ממתינות לזיכוי" — חזרות שטרם אומתו, "הושלמו" — חזרות שאומתו', () => {
  const c = setup();
  c.run("setView('receiptsHistory')");
  c.click('rc-history-filter', undefined, { filter: 'open' });
  assert.equal(c.run('receiptHistoryFilter'), 'open');
  let html = app(c);
  assert.ok(!html.includes('data-id="ret-pending"') && !html.includes('data-id="ret-gap"') && !html.includes('data-id="ret-ok"'), '"פתוחות" הן קליטות עם הפרש — חזרות אינן שם, כמו לפני האיחוד');
  // שורות המצב למעלה סופרות את כל התעודות גם כשהרשימה מסוננת
  assert.ok(html.includes('תעודת חזרה אחת ממתינה לאימות זיכוי') && html.includes('תעודת חזרה אחת עם פער פתוח בזיכוי'));
  c.click('rc-history-filter', undefined, { filter: 'credit' });
  html = app(c);
  assert.ok(html.includes('data-id="ret-pending"') && !html.includes('data-id="ret-gap"') && !html.includes('data-id="ret-ok"'), '"ממתינות לזיכוי" — רק מה שטרם אומת');
  c.click('rc-history-filter', undefined, { filter: 'done' });
  html = app(c);
  assert.ok(!html.includes('data-id="ret-pending"') && html.includes('data-id="ret-gap"') && html.includes('data-id="ret-ok"'), '"הושלמו" — כל מה שאומת, גם עם פער פתוח');
  c.click('rc-history-filter', undefined, { filter: 'all' });
  html = app(c);
  assert.ok(html.includes('data-id="ret-pending"') && html.includes('data-id="ret-gap"') && html.includes('data-id="ret-ok"'), '"הכול" — הכול');
});

test('חזרה ממסך אימות הזיכוי ומעריכת הפריטים — תמיד למסך התעודות (rvOrigin נעלם)', () => {
  const c = setup();
  c.run("setView('receiptsHistory')");
  // "ערוך אימות" על תעודה מאומתת → מסך ההתאמה → ביטול
  c.click('rv-open', 'ret-ok');
  assert.equal(c.run('currentView'), 'returnReconcile');
  c.click('rv-cancel');
  assert.equal(c.run('currentView'), 'receiptsHistory', 'ביטול האימות חוזר למסך התעודות');
  assert.equal(c.run('returnVerify'), null);
  // "ערוך פריטים בתעודה" → מסך העריכה → ביטול
  c.click('ret-edit-items', 'ret-pending');
  assert.equal(c.run('currentView'), 'returnItemsEdit');
  assert.equal(json(c, 'returnEdit.origin'), 'receiptsHistory', 'מקור העריכה הוא תמיד מסך התעודות');
  c.click('re-cancel');
  assert.equal(c.run('currentView'), 'receiptsHistory', 'ביטול העריכה חוזר למסך התעודות');
  // ביטול בלי הקשר (למשל אחרי רענון) — אותו יעד, לא המסך הישן
  c.run("currentView = 'receiving'; returnEdit = null");
  c.click('re-cancel');
  assert.equal(c.run('currentView'), 'receiptsHistory');
  // מסכי ההתאמה והעריכה בלי הקשר נופלים חזרה למסך התעודות
  c.run("currentView = 'returnReconcile'; returnVerify = null; renderReturnReconcile()");
  assert.equal(c.run('currentView'), 'receiptsHistory');
  c.run("currentView = 'returnItemsEdit'; returnEdit = null; renderReturnItemsEdit()");
  assert.equal(c.run('currentView'), 'receiptsHistory');
});

// ===== ב. המסך המאוחד מכיל כל מה שמסך החזרות הישן ידע =====

test('שלוש תעודות חזרה בשלושה מצבים — כל אחת מקבלת כרטיס עם הסטטוס הנכון, מסודרות לפי תאריך', () => {
  const c = setup();
  c.run('renderReceiptsHistory()');
  const html = app(c);
  const cards = ['ret-pending', 'ret-ok', 'ret-gap'].map(id => c.run("returnCardInReceipts(returns.find(x => x.id === '" + id + "'))"));
  cards.forEach((card, i) => assert.ok(html.includes(card), 'הכרטיס של ' + ['ret-pending', 'ret-ok', 'ret-gap'][i] + ' מופיע במסך בדיוק כפי שהוא נבנה'));
  assert.ok(html.indexOf(cards[0]) < html.indexOf(cards[1]) && html.indexOf(cards[1]) < html.indexOf(cards[2]), 'החדשה למעלה, הישנה למטה');
  assert.equal((html.match(/תעודת חזרות \/ זיכוי<\/span>/g) || []).length, 3, 'שלושה כרטיסי חזרה בדיוק');
  // הסטטוסים — בנוסח הכרטיס, לא בנוסח המסך הישן
  const [pending, ok, gap] = cards;
  assert.ok(pending.includes('<i class="fa-solid fa-hourglass-half"></i> ממתינה לאימות זיכוי'), 'ממתינה');
  assert.ok(!pending.includes('לא אומתה'), 'הנוסח הישן "לא אומתה" הוחלף');
  assert.ok(ok.includes('<i class="fa-solid fa-circle-check"></i> אומתה · ' + new Date(VERIFIED_OK.creditedAt).toLocaleDateString('he-IL')), 'אומתה, עם תאריך האימות');
  assert.ok(gap.includes('<i class="fa-solid fa-triangle-exclamation"></i> נותר פער'), 'פער פתוח');
  assert.ok(pending.includes('border-amber-300') && ok.includes('border-emerald-300') && gap.includes('border-rose-300'), 'צבעי המסגרת לפי המצב');
});

test('כרטיס ממתינה לאימות: שליחה חוזרת, בדוק/אישור, עריכת פריטים, מחיקה — וגם תג "יומית"', () => {
  const c = setup();
  c.run('renderReceiptsHistory()');
  const html = app(c);
  for (const role of ['ret-resend', 'rv-verify-inline', 'rv-approve', 'ret-edit-items', 'ret-edit-date', 'ret-return-open', 'ret-delete']) {
    assert.ok(html.includes('data-role="' + role + '" data-id="ret-pending"'), role + ' על התעודה הממתינה');
  }
  assert.ok(html.includes('<i class="fa-brands fa-whatsapp"></i> שלח שוב בוואטסאפ'), 'תווית השליחה החוזרת');
  assert.ok(html.includes('id="rvNote_ret-pending"'), 'שדה סכום הזיכוי');
  assert.ok(html.includes('או אשר שהוא בדיוק ₪' + c.run('fmtMoney(' + SENT_EX + ')')), 'האישור מציע את הסכום מראש');
  assert.ok(!html.includes('data-role="del-return"'), 'בתנובה כפתור המחיקה הוא ret-delete בלבד — לא שניים');
  assert.equal((html.match(/data-role="ret-delete" data-id="ret-pending"/g) || []).length, 1, 'כפתור מחיקה אחד');
  assert.ok(html.includes('rounded px-1">יומית</span>'), 'תג "יומית" ליד התאריך');
  // ההפעלה: שליחה חוזרת פותחת את חלון השליחה עם התעודה הזאת; מחיקה שואלת קודם
  c.click('ret-resend', 'ret-pending');
  assert.deepEqual(json(c, 'testResends'), ['ret-pending']);
  c.click('ret-delete', 'ret-pending');
  assert.equal(json(c, 'testConfirms.length'), 1);
  assert.equal(json(c, 'testConfirms[0].title'), 'מחיקת תעודת חזרה');
  // תעודה מאומתת אינה מציעה שליחה חוזרת ולא אישור
  assert.ok(!html.includes('data-role="ret-resend" data-id="ret-ok"') && !html.includes('data-role="rv-approve" data-id="ret-ok"'));
});

test('שורות הפריטים מראות גם את הכסף: ברקוד, כמות וסכום שורה — כמו במסך הישן', () => {
  const c = setup([PENDING]);
  c.run('renderReceiptsHistory()');
  const html = app(c);
  for (const l of LINES) {
    assert.ok(html.includes('<i class="fa-solid fa-barcode"></i> ' + l.barcode), 'ברקוד ' + l.name);
    assert.ok(html.includes('>' + l.qty + ' יח׳</div>'), 'כמות ' + l.name);
    assert.ok(html.includes('₪' + c.run('fmtMoney(' + l.lineTotal + ')') + '</div>'), 'סכום השורה ' + l.name);
  }
  // שורה בלי מחיר שורה — מחושב ממחיר × כמות; שורה בלי מחיר כלל — בלי סכום; מבצע — מסומן
  const extra = setup([Object.assign({}, PENDING, { items: [
    { name: 'בלי סכום שורה', barcode: '7290000000022', qty: 3, unitPrice: 2.5 },
    { name: 'בלי מחיר', barcode: '', qty: 1 },
    { name: 'במבצע', barcode: '7290000000039', qty: 2, unitPrice: 4, lineTotal: 8, promoPct: 20 }
  ] })]);
  extra.run('renderReceiptsHistory()');
  const h = app(extra);
  assert.ok(h.includes('₪' + extra.run('fmtMoney(7.5)') + '</div>'), '3 × 2.50');
  assert.ok(h.includes('<i class="fa-solid fa-barcode"></i> —'), 'ברקוד חסר מסומן במקף');
  assert.ok(h.includes('· מבצע 20%'), 'אחוז המבצע');
  // שם עם תווים מיוחדים נמלט
  const esc = setup([Object.assign({}, PENDING, { items: [{ name: 'גבינה <b>5%</b> & "לבנה"', barcode: '7290000000046', qty: 1, unitPrice: 3, lineTotal: 3 }] })]);
  esc.run('renderReceiptsHistory()');
  assert.ok(app(esc).includes('גבינה &lt;b&gt;5%&lt;/b&gt; &amp; &quot;לבנה&quot;'), 'השם מוצג כטקסט, לא כ-HTML');
});

test('כרטיס עם פער פתוח: הבאנר האדום עם הסכום החסר, "פירוט הפער" עם השורה שזוכתה חסר, ו"תקן פער"', () => {
  const c = setup();
  c.run('renderReceiptsHistory()');
  const html = app(c);
  assert.ok(html.includes('הספק חייב לך עוד ₪' + c.run('fmtMoney(' + GAP_OWED + ')') + ' בזיכוי!'), 'הבאנר האדום עם ההפרש');
  assert.ok(html.includes('החזרת ₪' + c.run('fmtMoney(' + SENT_EX + ')') + ' · בתעודת הזיכוי ₪' + c.run('fmtMoney(' + GAP_NOTE + ')')), 'שורת המשנה: הוחזר מול זוכה');
  assert.ok(html.includes('<div class="font-black text-rose-700 mb-1">פירוט הפער</div>'), 'תיבת הפירוט');
  assert.ok(html.includes('<span>זוכה חסר: חלב בדיקה</span><span>1 יח׳</span>'), 'השורה שזוכתה חסר');
  assert.ok(!html.includes('זוכה חסר: קוטג׳'), 'שורה שזוכתה במלואה אינה בפירוט');
  assert.ok(html.includes('data-role="rv-open" data-id="ret-gap"') && html.includes('fa-wrench"></i> תקן פער'), 'תקן פער');
  assert.ok(html.includes('data-role="rv-add-note" data-id="ret-gap"') && html.includes('id="rvAdd_ret-gap"'), 'תעודת זיכוי משלימה');
  assert.ok(html.includes('data-role="uncredit" data-id="ret-gap"'), 'ביטול אימות');
  // הפירוט מופיע רק בכרטיס עם הפער — לא בכרטיס שאומת בלי פער
  const ok = c.run("returnCardInReceipts(returns.find(x => x.id === 'ret-ok'))");
  assert.ok(!ok.includes('פירוט הפער') && !ok.includes('הספק חייב לך עוד'));
  assert.ok(ok.includes('data-role="rv-open" data-id="ret-ok"') && ok.includes('fa-pen"></i> ערוך אימות'));
  // זוכה יתר: הספק זיכה יותר מדי — הבאנר הכחול-אדום בניסוח ההפוך
  const over = setup([Object.assign({}, VERIFIED_GAP, { id: 'ret-over', items: [Object.assign({}, LINES[0], { noteQty: 5 }), Object.assign({}, LINES[1], { noteQty: 2 })], creditNoteTotal: 46.3 })]);
  over.run('renderReceiptsHistory()');
  const h = app(over);
  assert.ok(h.includes('הספק זיכה ₪' + over.run('fmtMoney(7.42)') + ' יותר מדי'), 'זוכה יתר בבאנר');
  assert.ok(h.includes('<span>זוכה יתר: חלב בדיקה</span><span>1 יח׳</span>'), 'השורה שזוכתה יתר');
  // תקן פער מוביל למסך ההתאמה, וביטול חוזר למסך המאוחד
  c.run("currentView = 'receiptsHistory'");
  c.click('rv-open', 'ret-gap');
  assert.equal(c.run('currentView'), 'returnReconcile');
  assert.equal(json(c, 'returnVerify.id'), 'ret-gap');
  c.click('rv-cancel');
  assert.equal(c.run('currentView'), 'receiptsHistory');
});

test('מאזן הזיכויים מול הספק יושב בראש המסך המאוחד — אחרי מאזן הסחורה ולפני סיכום התקופה', () => {
  // ok: 38.88 − 38.88 = 0; gap: 38.88 − 31.46 = 7.42 → הספק חייב ₪7.42
  const c = setup();
  c.run('renderReceiptsHistory()');
  const html = app(c);
  const banner = c.run('returnsBalanceBannerHtml()');
  assert.ok(banner.length > 0 && html.includes(banner), 'הבאנר של returnsBalanceBannerHtml מופיע במסך');
  assert.ok(banner.includes('<i class="fa-solid fa-scale-unbalanced"></i> הספק חייב לך ₪' + c.run('fmtMoney(' + GAP_OWED + ')') + '</div>'), 'אדום: הספק חייב');
  assert.ok(banner.includes('מאזן מצטבר מכל הזיכויים'), 'ההסבר של הבאנר הישן');
  assert.ok(html.indexOf(banner) < html.indexOf(c.run('receiptsRangeHtml()')), 'לפני סיכום התקופה');
  assert.ok(html.indexOf(banner) > html.indexOf('ניהול תעודות'), 'אחרי סרגל הסינון וניהול התעודות');
  // מאוזן: ירוק
  const even = setup([VERIFIED_OK]);
  assert.ok(even.run('returnsBalanceBannerHtml()').includes('<i class="fa-solid fa-scale-balanced"></i> מאזן הזיכויים מול הספק מאוזן ✓'), 'ירוק: מאוזן');
  even.run('renderReceiptsHistory()');
  assert.ok(app(even).includes('מאזן הזיכויים מול הספק מאוזן ✓'));
  // זוכית יותר: כחול
  const over = setup([Object.assign({}, VERIFIED_OK, { creditNoteTotal: 50 })]);
  const blue = over.run('returnsBalanceBannerHtml()');
  assert.ok(blue.includes('<i class="fa-solid fa-scale-unbalanced-flip"></i> זוכית ₪' + over.run('fmtMoney(11.12)') + ' יותר מסך הכל'), 'כחול: זוכית יותר');
  // רק ממתינות (אין זיכוי שאומת) — אין באנר, ואין אחד ישן בשום מקום
  const none = setup([PENDING]);
  assert.equal(none.run('returnsBalanceBannerHtml()'), '');
  none.run('renderReceiptsHistory()');
  assert.ok(!app(none).includes('מאזן הזיכויים') && !app(none).includes('fa-scale-unbalanced"></i> הספק חייב לך ₪'));
});

test('שורות המצב מתחת לסרגל הסינון: כמה ממתינות לאימות וכמה עם פער פתוח — ביחיד וברבים', () => {
  const amber = (n, html) => html.includes('<div class="px-1 mb-2 text-sm font-bold text-amber-600"><i class="fa-solid fa-hourglass-half"></i> ' + n + '</div>');
  const rose = (n, html) => html.includes('<div class="px-1 mb-2 text-sm font-bold text-rose-700"><i class="fa-solid fa-triangle-exclamation"></i> ' + n + '</div>');
  const one = setup();
  one.run('renderReceiptsHistory()');
  assert.ok(amber('תעודת חזרה אחת ממתינה לאימות זיכוי', app(one)), 'ממתינה אחת');
  assert.ok(rose('תעודת חזרה אחת עם פער פתוח בזיכוי', app(one)), 'פער פתוח אחד');
  assert.ok(app(one).indexOf('fa-hourglass-half"></i> תעודת חזרה אחת ממתינה') < app(one).indexOf('ניהול תעודות'), 'שורות המצב מעל ניהול התעודות');

  const many = setup([PENDING, Object.assign({}, PENDING, { id: 'ret-pending-2', timestamp: Date.UTC(2026, 8, 27, 8, 0), date: '2026-09-27', docDate: '2026-09-27' }),
    VERIFIED_GAP, Object.assign({}, VERIFIED_GAP, { id: 'ret-gap-2' })]);
  many.run('renderReceiptsHistory()');
  assert.ok(amber('2 תעודות חזרה ממתינות לאימות זיכוי', app(many)), 'שתיים ממתינות');
  assert.ok(rose('2 תעודות חזרה עם פער פתוח בזיכוי', app(many)), 'שני פערים');
  assert.ok(!app(many).includes('ממתינים לאימות זיכוי'), 'הנוסח הישן של מסך החזרות נעלם');

  // הכול אומת בלי פער — אין שורות מצב בכלל
  const clean = setup([VERIFIED_OK]);
  clean.run('renderReceiptsHistory()');
  assert.ok(!app(clean).includes('ממתינה לאימות זיכוי</div>') && !app(clean).includes('פער פתוח בזיכוי</div>'));
  assert.ok(!app(clean).includes('כל הזיכויים אומתו'), 'וגם לא השורה הירוקה של המסך הישן');
  // סינון "ממתינות לזיכוי" מסתיר כרטיסים — אבל שורות המצב סופרות את כל התעודות
  const filtered = setup(undefined, { filter: 'credit' });
  filtered.run('renderReceiptsHistory()');
  const f = app(filtered);
  assert.ok(f.includes('data-id="ret-pending"') && !f.includes('data-id="ret-ok"') && !f.includes('data-id="ret-gap"'), 'במסנן רואים רק את הממתינות');
  assert.ok(amber('תעודת חזרה אחת ממתינה לאימות זיכוי', f) && rose('תעודת חזרה אחת עם פער פתוח בזיכוי', f), 'אבל המספרים אינם תלויים במסנן');
});

test('"ניהול תעודות": מחיקת כל היסטוריית החזרות יושבת שם, שואלת קודם ומוחקת את אוסף החזרות', async () => {
  const c = setup();
  c.run('renderReceiptsHistory()');
  const html = app(c);
  const block = html.slice(html.indexOf('<details class="mb-3"><summary class="cursor-pointer text-xs font-bold text-slate-400 px-1">ניהול תעודות</summary>'), html.indexOf('</details>') + '</details>'.length);
  assert.ok(block.startsWith('<details class="mb-3">'), 'תיבת הניהול קיימת');
  assert.ok(block.includes('<button data-role="clear-returns-history" class="btn-tap mt-2 text-xs font-bold text-red-500 bg-red-50 px-3 py-2 rounded-lg"><i class="fa-solid fa-trash-can"></i> מחק את כל היסטוריית החזרות</button>'), 'כפתור מחיקת החזרות בתוכה');
  assert.ok(!block.includes('clear-receipts'), 'בלי תעודות קליטה — אין מה למחוק מהן');
  assert.ok(!html.includes('ניהול חזרות'), 'תיבת הניהול של המסך הישן נעלמה');
  c.click('clear-returns-history');
  assert.equal(json(c, 'testConfirms.length'), 1, 'שואלים לפני');
  assert.equal(json(c, 'testConfirms[0].title'), 'ניקוי היסטוריה');
  assert.match(json(c, 'testConfirms[0].msg'), /היסטוריית החזרות/);
  await c.run('testConfirms[0].cb()');
  assert.deepEqual(json(c, 'testCleared'), ['returns'], 'מוחק את אוסף החזרות בלבד');
  // גם קליטות וגם חזרות — שני הכפתורים, כל אחד בשורה משלו
  const both = setup([PENDING]);
  both.run("receipts = [{ id: 'rc-1', timestamp: " + Date.UTC(2026, 8, 20, 9, 0) + ", date: '2026-09-20', items: [{ name: 'חלב בדיקה', qty: 10, unitPrice: 7.42, lineTotal: 74.2 }], totalExVat: 74.2, count: 10 }]; renderReceiptsHistory()");
  const h = app(both);
  assert.ok(h.includes('<div><button data-role="clear-receipts"') && h.includes('<div><button data-role="clear-returns-history"'), 'שני הכפתורים');
  assert.ok(h.indexOf('clear-receipts') < h.indexOf('clear-returns-history'), 'קליטות קודם');
  // בלי שום תעודה — אין תיבת ניהול
  const empty = setup([]);
  empty.run('renderReceiptsHistory()');
  assert.ok(!app(empty).includes('ניהול תעודות'));
});

// ===== ג. המסך הישן באמת נעלם =====

test('renderReturnsHistory ו-rvOrigin אינם קיימים עוד — ו"returnsHistory" נשאר רק ככינוי התאימות ב-setView', () => {
  const c = setup();
  assert.equal(c.run('typeof renderReturnsHistory'), 'undefined', 'הפונקציה של המסך הישן נמחקה');
  assert.equal(c.run('typeof rvOrigin'), 'undefined', 'ואין יותר "מאיזה מסך נפתח האימות"');
  assert.equal(c.run('typeof returnsBalanceBannerHtml'), 'function', 'הבאנר עבר לפונקציה משלו');
  const html = fs.readFileSync(process.env.RECEIPT_TEST_APP || new URL('../index.html', import.meta.url), 'utf8');
  const lines = html.split('\n');
  const stray = lines.map((l, i) => [i + 1, l]).filter(([, l]) => l.includes('returnsHistory') && !l.includes("if (v === 'returnsHistory') v = 'receiptsHistory'"));
  assert.deepEqual(stray.map(([n]) => n), [], 'אין שום הפניה אחרת למסך הישן (שורות: ' + stray.map(([n]) => n).join(', ') + ')');
  assert.equal(lines.filter(l => l.includes('renderReturnsHistory') || l.includes('rvOrigin')).length, 0, 'ואין שרידים בקוד');
  assert.ok(Number(c.run('APP_VERSION')) >= 122, 'הגרסה שבה אוחד המסך, או מאוחרת ממנה');
});

// ===== ד. שרשראות הציור-מחדש: פעולה מתוך המסך המאוחד מציירת אותו במקום =====
// במסך הישן כל פעולה הסתיימה ב"אם אנחנו בהיסטוריית החזרות — צייר אותה מחדש";
// הענף הזה נמחק, ולכן חייבים לראות שהמסך המאוחד מתעדכן בעצמו, ושמסך אחר אינו
// נדרס בטעות בציור של היסטוריית התעודות.

test('אישור וביטול אימות מתוך המסך המאוחד מציירים אותו מחדש במקום — בלי לעבור מסך ובלי רענון ידני', async () => {
  const c = setup();
  c.run("setView('receiptsHistory')");
  assert.ok(app(c).includes('data-role="rv-approve" data-id="ret-pending"') && app(c).includes('תעודת חזרה אחת ממתינה לאימות זיכוי'));
  // "אישור" → חלון → אישור → markReturnVerified
  c.click('rv-approve', 'ret-pending');
  assert.equal(json(c, 'testConfirms.length'), 1);
  await c.run('testConfirms[0].cb()');
  assert.equal(c.run('currentView'), 'receiptsHistory', 'נשארים במסך המאוחד');
  let html = app(c);
  const pendingCard = html.slice(html.indexOf('data-id="ret-pending"') - 400, html.indexOf('data-id="ret-pending"') + 2400);
  assert.ok(!html.includes('data-role="rv-approve" data-id="ret-pending"'), 'כפתור האישור נעלם מהכרטיס');
  assert.ok(pendingCard.includes('<i class="fa-solid fa-circle-check"></i> אומתה'), 'הכרטיס ירוק — "אומתה"');
  assert.ok(!html.includes('ממתינה לאימות זיכוי</div>'), 'שורת המצב הכתומה נעלמה — אין ממתינות');
  assert.ok(html.includes('data-role="uncredit" data-id="ret-pending"') && html.includes('data-role="rv-open" data-id="ret-pending"'), 'ובמקומה — עריכת אימות וביטול');
  assert.ok(html.includes('מאזן הזיכויים') || html.includes('הספק חייב לך ₪'), 'באנר המאזן חושב מחדש עם התעודה שאומתה');
  // ביטול אימות → חלון → אישור → clearReturnVerification
  c.click('uncredit', 'ret-pending');
  assert.equal(json(c, 'testConfirms.length'), 2);
  assert.equal(json(c, 'testConfirms[1].title'), 'ביטול אימות');
  await c.run('testConfirms[1].cb()');
  html = app(c);
  assert.equal(c.run('currentView'), 'receiptsHistory');
  assert.ok(html.includes('data-role="rv-approve" data-id="ret-pending"') && html.includes('data-role="ret-resend" data-id="ret-pending"'), 'הכרטיס חזר להיות ממתין — עם אישור ושליחה חוזרת');
  assert.ok(html.includes('תעודת חזרה אחת ממתינה לאימות זיכוי'), 'ושורת המצב הכתומה חזרה');
  // גם הסימון הישן (markCredited) מצייר את המסך המאוחד
  await c.run("markCredited('ret-pending', true)");
  assert.ok(!app(c).includes('data-role="rv-approve" data-id="ret-pending"') && !app(c).includes('ממתינה לאימות זיכוי</div>'));
  await c.run("markCredited('ret-pending', false)");
  assert.ok(app(c).includes('data-role="rv-approve" data-id="ret-pending"') && app(c).includes('תעודת חזרה אחת ממתינה לאימות זיכוי'));
  // מסך אחר אינו נדרס: אימות שמתבצע כשאיננו במסך התעודות (למשל מתוך מסך האימות המלא) לא מצייר את ההיסטוריה עליו
  c.run("currentView = 'receiving'; $('app').innerHTML = '<div id=\"marker\">מסך הקליטה</div>'");
  await c.run("markReturnVerified('ret-pending', " + SENT_EX + ')');
  assert.equal(app(c), '<div id="marker">מסך הקליטה</div>', 'המסך הנוכחי נשאר כפי שהוא');
  assert.equal(json(c, "returns.find(x => x.id === 'ret-pending').credited"), true, 'אבל האימות עצמו נרשם');
  // וכשחוזרים למסך המאוחד — רואים את התוצאה: אין ממתינות, ובמאזן נשאר רק הפער של ret-gap
  c.run("setView('receiptsHistory')");
  assert.ok(!app(c).includes('data-role="rv-approve" data-id="ret-pending"') && !app(c).includes('ממתינה לאימות זיכוי</div>'));
  assert.ok(app(c).includes('הספק חייב לך ₪' + c.run('fmtMoney(' + GAP_OWED + ')') + '</div>'), 'המאזן: רק הפער הפתוח של התעודה השלישית');
});

test('מחיקת תעודה מתוך המסך המאוחד: גיבוי לסל המחזור, והענן שמחזיר את הרשימה בלעדיה מצייר את המסך מחדש (שומר onSnapshot)', async () => {
  const c = setup();
  const cloud = withCloud(c);
  c.run("setView('receiptsHistory')");
  assert.ok(app(c).includes('data-id="ret-pending"') && app(c).includes('data-id="ret-ok"') && app(c).includes('data-id="ret-gap"'));
  c.click('ret-delete', 'ret-pending');
  assert.equal(json(c, 'testConfirms.length'), 1, 'שואלים לפני מחיקה');
  assert.equal(json(c, 'testConfirms[0].title'), 'מחיקת תעודת חזרה');
  await c.run('testConfirms[0].cb()');
  // המחיקה הבטוחה: העתק לסל המחזור + מחיקה — באותה חבילה
  assert.equal(cloud.batches.length, 1, 'חבילת כתיבה אחת');
  const ops = cloud.batches[0];
  const trash = ops.find(o => o.op === 'set'), del = ops.find(o => o.op === 'delete');
  assert.ok(trash && trash.ref.includes('/trash/') && trash.data.collectionName === 'returns' && trash.data.originalId === 'ret-pending' && trash.data.data.id === 'ret-pending', 'הגיבוי בסל המחזור');
  assert.ok(del && del.ref.endsWith('/returns/ret-pending'), 'והמחיקה של התעודה עצמה');
  assert.match(json(c, 'testToasts.at(-1)'), /נמחקה ונשמר גיבוי/);
  // עד שהענן לא ענה — הרשימה המקומית לא השתנתה (המסך מצטייר מהמאזין, לא מניחוש)
  assert.equal(json(c, 'returns.length'), 3);
  // הענן מחזיר את שתי התעודות שנותרו — בסדר הפוך בכוונה, כדי לראות שהמיון לפי תאריך הנייר נשמר
  cloud.push([VERIFIED_GAP, VERIFIED_OK]);
  assert.equal(c.run('currentView'), 'receiptsHistory');
  assert.deepEqual(json(c, 'returns.map(r => r.id)'), ['ret-ok', 'ret-gap'], 'החדשה קודם');
  const html = app(c);
  assert.ok(!html.includes('data-id="ret-pending"'), 'הכרטיס שנמחק נעלם מהמסך בלי רענון ידני');
  assert.ok(html.includes('data-id="ret-ok"') && html.includes('data-id="ret-gap"'), 'השתיים האחרות נשארו');
  assert.ok(html.indexOf('data-id="ret-ok"') < html.indexOf('data-id="ret-gap"'), 'ובסדר הנכון');
  assert.ok(!html.includes('ממתינה לאימות זיכוי</div>') && html.includes('תעודת חזרה אחת עם פער פתוח בזיכוי'), 'שורות המצב חושבו מחדש');
  assert.ok(html.includes('הספק חייב לך ₪' + c.run('fmtMoney(' + GAP_OWED + ')') + '</div>'), 'וגם מאזן הזיכויים');
  // הענן מחזיר רשימה ריקה — מסך ריק, עדיין תחת הכותרת המאוחדת
  cloud.push([]);
  assert.ok(app(c).includes('היסטוריית תעודות</h2>') && app(c).includes('אין תעודות עדיין') && !app(c).includes('ניהול תעודות'));
  // עדכון מהענן כשאנחנו בלשונית החזרות — מצייר אותה (הבאנר האדום מופיע); במסך אחר — לא נוגע
  c.run("setView('returns')");
  assert.ok(!app(c).includes('יש תעודת חזרות פתוחה לאימות'));
  cloud.push([PENDING]);
  assert.equal(c.run('currentView'), 'returns');
  assert.ok(app(c).includes('יש תעודת חזרות פתוחה לאימות') && app(c).includes('data-role="ret-history"'), 'לשונית החזרות צוירה מחדש עם הבאנר');
  c.run("currentView = 'receiving'; $('app').innerHTML = '<div id=\"marker\">מסך הקליטה</div>'");
  cloud.push([PENDING, VERIFIED_OK]);
  assert.equal(app(c), '<div id="marker">מסך הקליטה</div>', 'מסך הקליטה לא נדרס');
  assert.equal(json(c, 'returns.length'), 2, 'אבל הנתונים התעדכנו');
});

// ===== ה. v123: כפתור "בטל אימות" אחד =====
// בכרטיס מאומת היו שני כפתורים לאותה פעולה: טקסט מלא, ולצד "ערוך אימות" גם
// אייקון חץ בודד. נשאר הטקסט — הוא אומר מה יקרה — מתחת לפעולה הראשית.
test('v123: בכרטיס מאומת יש כפתור "בטל אימות" אחד — עם טקסט, אחרי פעולת האימות הראשית', () => {
  const c = setup();
  c.run('renderReceiptsHistory()');
  for (const id of ['ret-ok', 'ret-gap']) {
    const card = c.run("returnCardInReceipts(returns.find(x => x.id === '" + id + "'))");
    assert.equal((card.match(/data-role="uncredit"/g) || []).length, 1, id + ': כפתור ביטול אימות אחד');
    assert.ok(card.includes('<i class="fa-solid fa-rotate-left"></i> בטל אימות — פתח מחדש לתיקון'), id + ': עם טקסט שמסביר');
    assert.ok(!card.includes('title="בטל אימות"'), id + ': האייקון הבודד ירד');
    assert.ok(card.indexOf('data-role="rv-open"') < card.indexOf('data-role="uncredit"'), id + ': מתחת לפעולה הראשית');
    assert.ok(card.indexOf('data-role="uncredit"') < card.indexOf('data-role="ret-edit-items"'), id + ': ולפני עריכת הפריטים');
  }
  // תעודה ממתינה — אין מה לבטל
  assert.ok(!c.run("returnCardInReceipts(returns.find(x => x.id === 'ret-pending'))").includes('data-role="uncredit"'));
  // והכפתור עדיין חי: שואל קודם, ואז פותח מחדש
  c.click('uncredit', 'ret-ok');
  assert.equal(json(c, 'testConfirms.length'), 1);
  assert.equal(json(c, 'testConfirms[0].title'), 'ביטול אימות');
});
