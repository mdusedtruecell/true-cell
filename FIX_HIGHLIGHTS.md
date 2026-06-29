# Invoice History Save Fix

## Root Cause Found

The main inconsistent History issue was caused by the saved invoice draft remaining in Local Storage under `invoice-draft`.

After saving an invoice, the app kept the same `invoiceNumber` inside the draft. When the user opened a new invoice again, the form could load that old invoice number. Because History was using `invoiceNumber` as the unique key, saving the next invoice with the same number replaced the previous History record instead of appending a new one.

This made it look like the second invoice was not saved.

## Files Fixed

### `src/pages/CreateInvoicePage/index.tsx`

- Added `getUniqueInvoiceNumber()` so a new invoice never reuses an invoice number that already exists in History.
- Added `persistInvoice()` to make Save and Share use one reliable save path.
- After a successful Save or Share, the normal draft key `invoice-draft` is removed so the next new invoice starts clean.
- Preview now also stores the preview invoice under `invoice-<number>` and updates `last-invoice`, so preview still works without depending on the normal draft.

### `src/store/invoiceStore.ts`

- Added Local Storage history validation and normalization.
- Added safe custom persistence storage for `invoice-store`, so invalid JSON is reset safely and storage quota/blocking errors are logged.
- Added safe upsert logic for History.
- `addToHistory()` now always inserts the invoice and removes only matching duplicates by invoice number.
- `updateInHistory()` now also upserts, so an edited/saved invoice cannot disappear if the previous record is missing.
- Invalid/corrupted persisted History data is ignored instead of breaking the History page.
- Invoice numbers are trimmed before comparing to prevent hidden-space duplicate problems.

### `src/utils/localStorage.ts`

- Local Storage read/write/remove errors are no longer silently ignored.
- Invalid JSON is handled safely and logged to the browser console.
- `setDraft()` and `removeDraft()` now return success/failure booleans for future debugging.

## Result

Every saved or shared invoice now goes through the same reliable History save path. Stale drafts, duplicate invoice numbers, and malformed Local Storage values should no longer cause History records to be overwritten or disappear.

## Verified

- `npm run build` completed successfully.
- `npm test -- --run` completed successfully: 1 test passed.
