// גרסה 166 — סגירת התעודה אינה מחכה למנתח: "סגור תעודה עם החוסרים" נשמרת מיד, גם כשהמנתח עוד מסביר את הפער
// קליטת תנובה — service worker v1 (מעבר-דרך, בלי מטמון)
// בכוונה אין כאן שום cache בשלב הזה: אנחנו בצפי לגרסאות תכופות,
// ומטמון ישן היה מציג גרסה קודמת. ההתקנה כאפליקציה עובדת גם כך.
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(clients.claim()));
self.addEventListener('fetch', e => {});
