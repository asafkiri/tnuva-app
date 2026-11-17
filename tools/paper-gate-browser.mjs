// v165 — השורה שמחכה לבחירת מוצר לפני הבדיקה, ומסך ההשוואה שמתרענן — בדפדפן אמיתי (Chromium, רוחב טלפון 390px), בלי רשת חיצונית
// ובלי Firebase. המצב נבנה קודם בקוד של האפליקציה עצמה (receipt-scan-harness): תעודה במבנה של 10.11 — 11 שורות ושבע החלטות, אחת מהן
// שורה בלי מוצר — עם "בדיקה שורה-שורה" שנבחרה במסך הצילום; והוא נכנס לדפדפן דרך הטיוטה שבזיכרון הטלפון (localStorage), בדיוק כמו
// פתיחה מחדש של האפליקציה. מה שנבדק בדום אמיתי, בלחיצות אמיתיות:
// - מסך הקליטה: הכרטיס ("צריך רק לבחור מוצר לשורה אחת — ואז ממשיכים לקלוט") מעל השורה עצמה; בלי כפתורי הבדיקה, בלי "חסר", בלי
//   גלילה לצדדים; שש ההחלטות האחרות מקופלות, ובדיקת המחירים סגורה.
// - החלטה בתוך הקיפול ("לא, מוצר אחר") מתעדכנת במקום, והקיפול נשאר פתוח; הכרטיס והבחירה נשארים.
// - לחיצה על המוצר הנכון — חלון הבדיקה שורה-שורה נפתח לבד, והכרטיס מוחלף בכפתורים הרגילים.
// - מסך ההשוואה: "השורה נכונה" מורידה את הכרטיס ומעדכנת את הכותרת (עד 164 המסך נשאר כמו שהיה); קיפול שנפתח נשאר פתוח אחרי הציור;
//   שדה תאריך שמקלידים בו אינו נהרס כשהחלטה נשמרת (בטלפון לחיצה על כפתור אינה מוציאה את הפוקוס מהשדה).
// הרצה: node tools/paper-gate-browser.mjs (Playwright + Chromium; TNUVA_CHROMIUM — נתיב לדפדפן, TNUVA_SHOTS — תיקייה לצילומי מסך; אופציונלי)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { runtime } from './receipt-scan-harness.mjs';
import { LONG_PRODUCTS, longFixture, cottagePromo } from './long-receipt-fixture.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');

const root = fileURLToPath(new URL('../', import.meta.url));
// 1. הקליטה נבנית בקוד של האפליקציה (node), והטיוטה שלה — מה שהטלפון שומר — עוברת לדפדפן
const storage = new Map();
{
  const c = runtime('tnuva', { storage, data: longFixture() });
  c.run(`todayStr = () => '2026-11-10'; currentView = 'receiving'; mainMode = 'receiving'; receiptDupConfirmed = true; showConfirm = (t, m, l, cb) => cb(); navigator.vibrate = () => true;
    aiScanDocuments = [{ noteIndex: 0, amount: null, units: null, lines: null, pages: [{ dataUrl: 'data:image/jpeg;base64,Zml4dHVyZQ==', orientationConfirmed: true }] }];`);
  await c.run(`tnuvaStartPaperScan({ manualQuantities: true, intent: 'lines' })`);
  assert.equal(c.run('receiptPaperScanState'), 'ok', JSON.stringify(c.run('receiptPaperScanProblems')));
  assert.ok(c.run('!!receiptPaperGate()'), 'שורה בלי מוצר עוצרת את הרשימה');
  assert.equal(c.run('receiptQuantityIntent'), 'lines');
  c.run(`saveReceiptDraft(); if (typeof draftHandoffs === 'object' && draftHandoffs) Object.values(draftHandoffs).forEach(h => h.stop())`);
}

// 2. הדף: index.html בלי הסקריפטים החיצוניים (Tailwind, גופנים, Firebase), עם תחליפים ל-Firebase
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const moduleSource = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(/^import[\s\S]*?from "https:\/\/www\.gstatic\.com\/firebasejs\/[^"\n]+";\n/gm, '');
const setup = `
const initializeApp = () => ({}), getAuth = () => ({}), signInAnonymously = async () => ({}), onAuthStateChanged = () => {};
const initializeFirestore = () => ({}), getFirestore = () => ({}), persistentLocalCache = () => ({}), persistentMultipleTabManager = () => ({});
const collection = () => ({}), onSnapshot = () => () => {}, doc = () => ({}), getDoc = async () => ({ exists: () => false, data: () => null }), getDocFromServer = getDoc;
const deleteDoc = async () => {}, addDoc = async () => ({ id: 'x' }), updateDoc = async () => {}, setDoc = async () => {}, writeBatch = () => ({ set() {}, update() {}, delete() {}, commit: async () => {} });
const query = () => ({}), orderBy = () => ({}), limit = () => ({}), getDocs = async () => ({ docs: [] }), getDocsFromServer = getDocs, where = () => ({}), runTransaction = async () => {}, deleteField = () => ({});
`;
const replay = `
products = ${JSON.stringify(LONG_PRODUCTS)}; promos = ${JSON.stringify([cottagePromo])}; receipts = []; returns = [];
todayStr = () => '2026-11-10';
window.fetch = async url => { throw new Error('External network is forbidden in the browser check: ' + url); };
window.toasts = []; { const say = showToast; showToast = (text, ...rest) => { window.toasts.push(String(text)); return say(text, ...rest); }; }
setView('receiving');
// (המשתנים של המודול אינם גלובליים — הבדיקה ניגשת אליהם רק דרך t)
window.t = { view: () => currentView, intent: () => receiptQuantityIntent, cards: () => receiptRowActions().total, gate: () => !!receiptPaperGate(),
  mode: () => receiptQuantityReview && receiptQuantityReview.mode, pending: () => !!(receiptQuantityReview && receiptQuantityReview.pending),
  lines: () => receiptQuantityReview.docs.map(d => d.lines.length), reconcile: () => openReconcile(), reject: (d, r) => receiptRejectMatchedRow(d, r) };
window.t.loaded = true;
`;
const css = `.hidden{display:none!important}.flex{display:flex}.grid{display:grid}.block{display:block}.fixed{position:fixed}.absolute{position:absolute}.relative{position:relative}.sticky{position:sticky}
.inset-0{inset:0}.inset-x-0{left:0;right:0}.bottom-0{bottom:0}.top-0{top:0}.flex-col{flex-direction:column}.flex-1{flex:1}.items-center{align-items:center}.justify-center{justify-content:center}.justify-between{justify-content:space-between}
.overflow-y-auto{overflow-y:auto}.overflow-hidden{overflow:hidden}.min-h-0{min-height:0}.min-w-0{min-width:0}.shrink-0{flex-shrink:0}.w-full{width:100%}.h-full{height:100%}.max-w-lg{max-width:32rem}.mx-auto{margin-left:auto;margin-right:auto}
.gap-2{gap:.5rem}.p-2\\.5{padding:.625rem}.p-3{padding:.75rem}.p-4{padding:1rem}.mt-2{margin-top:.5rem}.mb-2{margin-bottom:.5rem}.mb-3{margin-bottom:.75rem}
.bg-white{background:#fff}.bg-amber-50{background:#fffbeb}.bg-emerald-600{background:#059669;color:#fff}.bg-violet-600{background:#7c3aed;color:#fff}.bg-indigo-600{background:#4f46e5;color:#fff}
.rounded-2xl{border-radius:1rem}.rounded-xl{border-radius:.75rem}.border-2{border:2px solid #cbd5e1}.border{border:1px solid #cbd5e1}.border-amber-300{border-color:#fcd34d}.border-violet-300{border-color:#c4b5fd}
.text-lg{font-size:1.125rem}.text-sm{font-size:.875rem}.text-xs{font-size:.75rem}.text-\\[11px\\]{font-size:11px}.text-\\[10px\\]{font-size:10px}.font-black{font-weight:900}.font-bold{font-weight:700}
body{margin:0;font:16px Arial}button,input{font:inherit;padding:8px;max-width:100%;box-sizing:border-box}`;
const pageHtml = html.replace(/<script\s+src="https:[^"]+"><\/script>/g, '').replace(/<link[^>]+(?:href="https:[^"]+"|rel="manifest")[^>]*>/g, '')
  .replace(/<script type="module">[\s\S]*?<\/script>/, () => '<script type="module">' + setup + moduleSource + replay + '</script>')
  .replace('</head>', '<style>' + css + '</style></head>');
const server = http.createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const file = req.url === '/' ? null : path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!file) { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(pageHtml); return; }
  if (/\.js$/.test(file) && fs.existsSync(file) && !/sw\.js$/.test(file)) { res.setHeader('Content-Type', 'text/javascript; charset=utf-8'); res.end(fs.readFileSync(file)); return; }
  res.statusCode = 404; res.end();
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ headless: true, executablePath: process.env.TNUVA_CHROMIUM, args: ['--no-sandbox'] });
const shots = process.env.TNUVA_SHOTS; // תיקייה לצילומי מסך (אופציונלי)
const snap = async (page, name) => { if (shots) await page.screenshot({ path: path.join(shots, name + '.png') }); };
const flat = s => String(s || '').replace(/\s+/g, ' ').trim();
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, locale: 'he-IL' });
  await context.addInitScript(entries => { for (const [k, v] of entries) localStorage.setItem(k, v); }, [...storage.entries()]);
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(String(e && e.stack || e)));
  // (sw.js אינו מוגש כאן בכוונה — הודעת ה-404 של רישום ה-service worker אינה שגיאה של הבדיקה)
  page.on('console', m => { if (m.type() === 'error' && !/ERR_|net::|Failed to load resource|favicon|bad HTTP response code .* fetching the script/.test(m.text())) errors.push(m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => window.t && window.t.loaded, null, { timeout: 15000 }).catch(e => { throw new Error('הדף לא עלה: ' + errors.join(' | ') + ' — ' + e.message); });
  const open = sel => page.evaluate(s => { const el = document.querySelector(s); return el ? el.open : null; }, sel);
  const appText = async () => flat(await page.locator('#app').innerText());

  // ===== א. מסך הקליטה: הכרטיס, ומתחתיו השורה =====
  await page.waitForSelector('[data-paper-gate]');
  assert.equal(await page.evaluate(() => t.view()), 'receiving', 'מסך הקליטה — לא מסך ההשוואה');
  assert.equal(await page.evaluate(() => t.intent()), 'lines', 'הבחירה חזרה מהטיוטה'); assert.equal(await page.evaluate(() => t.cards()), 7);
  const card = flat(await page.locator('[data-paper-gate]').innerText());
  assert.match(card, /התעודה נקראה · 11 שורות/);
  assert.match(card, /צריך רק לבחור מוצר לשורה אחת — ואז ממשיכים לקלוט/);
  assert.match(card, /מיד אחרי זה הבדיקה שורה-שורה נפתחת לבד, וממשיכים לקלוט את הסחורה\./);
  assert.match(card, /שום דבר לא חסר — עוד לא נספר כלום\./);
  assert.equal(await page.locator('[data-gate-rows] article').count(), 1, 'רק השורה שעוצרת את הרשימה');
  assert.match(flat(await page.locator('[data-gate-rows]').innerText()), /הקוד שבשורה אינו במאגר — צריך לבחור מוצר.*יופ\.שזיף 3%.*שורה 11/);
  const gateBox = await page.locator('[data-paper-gate]').boundingBox(), rowBox = await page.locator('[data-gate-rows]').boundingBox();
  assert.ok(gateBox.y + gateBox.height <= rowBox.y + 1, 'הכרטיס מעל השורה');
  assert.equal(await page.locator('button[data-role^="rc-quantity"]').count(), 0, 'כפתורי הבדיקה אינם מוצגים עד שהמוצר נבחר');
  assert.equal(await open('[data-gate-later]'), false, 'שאר ההחלטות מקופלות'); assert.equal(await open('[data-price-panel]'), false, 'בדיקת המחירים סגורה');
  assert.match(flat(await page.locator('[data-gate-later] > summary').innerText()), /^עוד 6 שורות מחכות לאישור — אפשר עכשיו, ואפשר בסוף הקליטה$/);
  assert.doesNotMatch(await appText(), /לא נסרקה אף יחידה|חסר ₪|שורות דורשות החלטה לפני הקליטה/);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'בלי גלילה לצדדים');
  assert.equal(await page.locator('#receiptQuantityModal').isVisible(), false);
  await snap(page, 'gate-1-card');

  // ===== ב. החלטה בתוך הקיפול מתעדכנת במקום, והקיפול נשאר פתוח =====
  await page.locator('[data-gate-later] > summary').click();
  assert.equal(await open('[data-gate-later]'), true);
  assert.equal(await page.locator('[data-gate-later] button[data-role="rowfix-reject"]').count(), 5);
  await page.locator('[data-gate-later] button[data-role="rowfix-reject"]').first().click();
  await page.waitForFunction(() => /נדחה על ידך — בחר מוצר אחר/.test(document.querySelector('[data-gate-later]').textContent));
  assert.equal(await page.locator('[data-gate-later] button[data-role="rowfix-reject"]').count(), 4, 'הזיהוי שנדחה חזר ככרטיס בחירה');
  assert.equal(await open('[data-gate-later]'), true, 'הקיפול נשאר פתוח אחרי ההחלטה');
  assert.equal(await page.locator('[data-paper-gate]').count(), 1, 'הכרטיס נשאר — השורה שעוצרת עוד מחכה'); assert.equal(await page.evaluate(() => t.intent()), 'lines');
  await page.locator('[data-gate-later] > summary').click();
  await snap(page, 'gate-2-later-decided');

  // ===== ג. לוחצים על המוצר הנכון — הבדיקה שורה-שורה נפתחת לבד =====
  const candidate = page.locator('[data-gate-rows] button[data-role="rowfix-pick"]').first();
  assert.match(flat(await candidate.innerText()), /יופלה פירות יער בשמנת 3% 150 גרם/);
  await candidate.click();
  await page.waitForSelector('#receiptQuantityModal:not(.hidden)');
  assert.equal(await page.evaluate(() => t.mode()), 'lines'); assert.equal(await page.evaluate(() => t.pending()), false);
  assert.equal(await page.evaluate(() => t.intent()), null, 'הבחירה נפתחה — פעם אחת'); assert.equal(await page.evaluate(() => t.view()), 'receiving');
  assert.ok((await page.evaluate(() => t.lines()))[0] >= 10, 'הרשימה עלתה, עם השורה שנבחר לה מוצר');
  assert.equal(await page.evaluate(() => toasts.at(-1)), 'השורה שויכה ל"יופלה פירות יער בשמנת 3% 150 גרם"');
  assert.equal(await page.locator('[data-paper-gate]').count(), 0, 'הכרטיס ירד'); assert.ok(await page.locator('button[data-role="rc-quantity-lines"]').count() >= 1, 'מאחורי החלון — הכפתורים הרגילים');
  await snap(page, 'gate-3-list-open');

  // ===== ד. מסך ההשוואה מתרענן אחרי כל אישור =====
  await page.locator('#receiptQuantityClose').click();
  await page.evaluate(() => t.reconcile());
  await page.waitForFunction(() => t.view() === 'reconcile');
  const headline = async () => flat(await page.locator('[data-row-actions] [role="status"]').first().innerText());
  assert.match(await headline(), /^6 שורות דורשות החלטה לפני הקליטה/);
  assert.equal(await page.locator('#rcPriceAudit').count(), 0, 'במסך הזה אין מארח לבדיקת המחירים');
  // בדיקת המחירים פתוחה כאן (הבדיקה עוד לא הושלמה); בתוכה "פירוט המחירים לפי שורה" סגור — פותחים אותו
  assert.equal(await open('[data-price-panel]'), true); assert.equal(await open('[data-price-details]'), false);
  await page.locator('[data-price-details] > summary').click();
  assert.equal(await open('[data-price-details]'), true);
  await page.locator('button[data-role="rowfix-confirm"]').click();
  await page.waitForFunction(() => !document.querySelector('button[data-role="rowfix-confirm"]'), null, { timeout: 5000 })
    .catch(() => assert.fail('"השורה נכונה" נשמרה, אבל הכרטיס נשאר על המסך'));
  assert.match(await headline(), /^5 שורות דורשות החלטה לפני הקליטה · שורה אחת אושרה ידנית/);
  assert.equal(await page.evaluate(() => toasts.at(-1)), 'השורה אושרה כפי שנקראה'); assert.equal(await page.evaluate(() => t.cards()), 5);
  assert.equal(await open('[data-price-details]'), true, 'הקיפול שנפתח נשאר פתוח אחרי הציור');
  await snap(page, 'gate-4-reconcile-refreshed');
  // שדה תאריך בעריכה: החלטה שנשמרת באותו זמן אינה הורסת אותו (בטלפון לחיצה על כפתור אינה מוציאה את הפוקוס מהשדה)
  await page.locator('[data-price-date] > summary').first().click();
  await page.locator('input[data-role="price-doc-date"]').first().focus();
  await page.evaluate(() => { window.dateField = document.activeElement; });
  assert.equal(await page.evaluate(() => dateField.dataset.role), 'price-doc-date');
  assert.equal(await page.evaluate(() => t.reject(0, 4)), true);
  assert.equal(await page.evaluate(() => dateField.isConnected && document.activeElement === dateField), true, 'השדה שמקלידים בו נשאר במקומו');
  assert.match(flat(await page.locator('[data-price-panel] [role="status"]').first().innerText()), /נתוני הבדיקה השתנו — המחירים יתעדכנו בסיום עריכת התאריך/);
  // בזמן העריכה המסך נשאר כמו שהיה: הזיהוי שנדחה עוד מוצג בו כזיהוי (ארבעה כפתורי "לא, מוצר אחר")
  assert.equal(await page.locator('button[data-role="rowfix-reject"]').count(), 4);
  // יוצאים מהשדה, והלחיצה הבאה מציירת את המסך — גם כשהיא על הכפתור הישן של אותה שורה: שתי השורות שנדחו מוצגות ככרטיסי בחירה
  await page.evaluate(() => dateField.blur());
  await page.locator('button[data-role="rowfix-reject"]').first().click();
  await page.waitForFunction(() => (document.getElementById('app').textContent.match(/נדחה על ידך — בחר מוצר אחר/g) || []).length === 2
    && document.querySelectorAll('button[data-role="rowfix-reject"]').length === 3, null, { timeout: 5000 })
    .catch(() => assert.fail('ההחלטה נשמרה, אבל מסך ההשוואה לא צויר מחדש'));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'בלי גלילה לצדדים');
  assert.deepEqual(errors, [], 'בלי שגיאות דף');
  console.log('paper-gate-browser: ok');
} finally {
  await browser.close();
  server.close();
}
