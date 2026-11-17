// גרסה 165 — צריך רק לבחור מוצר לשורה אחת, ואז ממשיכים לקלוט: כרטיס במסך הקליטה במקום מסך ההשוואה; מסך ההשוואה מתרענן אחרי כל אישור
// קליטת תנובה — service worker v1 (מעבר-דרך, בלי מטמון)
// בכוונה אין כאן שום cache בשלב הזה: אנחנו בצפי לגרסאות תכופות,
// ומטמון ישן היה מציג גרסה קודמת. ההתקנה כאפליקציה עובדת גם כך.
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(clients.claim()));
self.addEventListener('fetch', e => {});
