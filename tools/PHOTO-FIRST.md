# Tnuva app 75 — photograph first, count while decoding

The default receiving screen groups up to four invoices/eight pages. After
orientation approval, starting receiving opens the existing barcode scanner
immediately while OCR runs in the background. The existing date choice,
manual entry, no-paper receiving and later attachment remain available.

The paper's net amount and printed item-line count become anchors only after
its independent checks pass. Tnuva does not print total units: no unit total
is invented. Product quantities are compared with the saved paper when actual
counting finishes, even if the grand total already matches. Repeated product
codes accumulate without comparing unique product count to printed row count.

The adapter retains an untouched raw paper before resolving Tnuva item codes.
Mixed invoices/credit notes remain explicitly separate from ordinary receiving;
they require the existing manual/returns workflow. Printed promotion discounts
are checked separately from product prices. Berman's monthly promotion rule is
not used.

Each successful document is checkpointed independently. Reload or a failed
second document reuses completed results. Images remain only in memory; an
interrupted upload requires explicit image completion. An uncertain network
failure never silently re-submits the paid invoice POST. Cancellation guards
discard late results. All model attempts are saved in draft/receipt `scanAudit`
and displayed in the receipt's expanded history.

`node --test tools/photo-first-test.mjs` tests the actual embedded functions,
including background counting, refresh, cancellation, partial failure, source
adapter, printed duplicate rows, final product comparison and manual finishing.
Inputs are synthetic; no inventory writes or paid model calls.

Release server 10 before app 75. The app checks `photoFirst` support before
uploading photos. Real phone/camera testing remains a store acceptance step:
photograph all pages including the summary, count products during OCR, finish
and compare product quantities/net totals, then inspect model details. A
quantity correction must reuse the existing read.
