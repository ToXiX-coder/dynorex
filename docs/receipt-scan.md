# Receipt scan (D-68)

"Scan a receipt" at the top of Add mod reads a receipt photo and fills the form's blank fields: part, brand, part
number, cost, date and the shop. The same photo is attached as the mod's private receipt, so the mod lands on the
Build Record as "Paperwork on file".

## How it works

1. The phone re-encodes the photo (no location or camera data), the same as every upload.
2. The app sends it, as base64, to the `receipt-scan` Edge Function, signed in.
3. The function checks the bytes like register-photo does, then `receipt_scan_allow()` (10 an hour, 30 a day).
4. It asks Claude (`claude-opus-5-5`) for one forced tool answer (`receipt_fields`), never free text.
5. `cleanReceipt()` checks the answer like any untrusted input (types, lengths, a real past date, a sane amount,
   a known currency) and returns it. Nothing is stored or logged: not the image, not the answer.
6. The app fills only blank fields, says which ones it filled, and the owner checks them before saving.

Code: `supabase/functions/receipt-scan/index.ts`, `supabase/functions/_shared/receipt.ts`,
`src/features/mods/receiptScan.ts`, `src/features/mods/receiptFill.ts`, `src/features/mods/ReceiptScanCard.tsx`.

## Turning it on

It's behind the `receiptScan` flag: on in pitch mode (a labelled sample reading, no AI call), off in every real
build. Before turning it on:

- [ ] Add Anthropic to the privacy policy as a processor for receipt photos (see `docs/legal/privacy-facts.md`).
- [ ] Set `ANTHROPIC_API_KEY` as an Edge Function secret (shared with Torq chat) and deploy `receipt-scan`.
- [ ] Decide the limits (10 an hour, 30 a day now) and whether Dynorex+ gets more; each scan costs money.
- [ ] Flip the flag default in `src/domain/flags.ts` and ship a build.
