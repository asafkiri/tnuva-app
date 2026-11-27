// גרסה 167 — תיקון ל-166: אחרי שמירה שלא אושרה הפס מציג את הכפתור; ואחרי סגירה ופתיחה של האפליקציה "בדוק ונסה לשמור שוב" שומר
// קליטת תנובה — service worker v1 (מעבר-דרך, בלי מטמון)
// בכוונה אין כאן שום cache בשלב הזה: אנחנו בצפי לגרסאות תכופות,
// ומטמון ישן היה מציג גרסה קודמת. ההתקנה כאפליקציה עובדת גם כך.
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(clients.claim()));
self.addEventListener('fetch', e => {});
