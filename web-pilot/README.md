# Dynorex: pilot web MVP

"Prove Your Build. Find Your Road."

A small, mobile-first **web** pilot for an owner-kept build record. Owners log their mods, service and setup notes, and can share
read-only, revocable links. A shop can send one record through a one-time link, and the owner approves it.

"Prove" means keeping an organized record. Dynorex does **not** verify vehicles, parts, work, measurements or senders.

## Stack

Next.js (App Router) + TypeScript + Tailwind CSS 4 + zod. Tests use Vitest.

**Local mode only.** Data is stored in a JSON file plus an uploads folder (`.data/`, or `DYNOREX_DATA_DIR`), behind the
`DataStore` interface in `src/lib/store.ts`. Accounts use email and password, hashed with scrypt, with DB-backed sessions in an
httpOnly cookie. **Local mode is not a production database or a production identity system.** There is no Supabase, no email
sending, no analytics and no external scripts or fonts.

## Run

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # vitest service-level tests
npm run lint
npm run typecheck
npm run format:check
npm run build && npm start
```

Copy `.env.example` to `.env.local` if you need to change the defaults. No secrets are required.

## Layout

- `src/lib/services.ts`: all business rules and ownership checks. Every owner call takes the signed-in user ID.
- `src/lib/publicView.ts`: the only shaper of public share data, built from an allow-list (no VIN, IDs, email or attachments).
- `src/lib/schemas.ts`: server-side validation. `src/lib/upload.ts` handles upload type sniffing and size limits.
- `src/app/actions.ts`: server actions (thin; they call services).
- `src/app/api/attachments/[id]`: owner-only file download. `src/app/api/export`: CSV/JSON export.
- `/demo`: no-login sample garage, labeled SAMPLE DATA.

## Known limits

- Single-process file store and in-memory rate limits. Not for multi-instance hosting.
- No password reset and no email verification.
- Shops cannot attach files through request links, and sender identity is never checked.
- Attachments are never shown on public share pages.
- The Torq mark is a placeholder monogram, not approved art.
