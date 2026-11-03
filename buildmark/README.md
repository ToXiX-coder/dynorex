# Buildmark

> **Folded into Dynorex (2026-10-17)** as the Build Record (D-64 in `../docs/decisions.md`). This folder stays as the
> standalone prototype and the home of the market research.

The build record for modified cars. Owners log each mod with the receipt and who fitted it; shops confirm their
own work through a one-time link; buyers open a shared record, check the VIN on the car against it, and take the
record over when they buy. Separate from Dynorex.

"Buildmark" is a working name: check it for trademark conflicts before using it publicly.

- Why it exists and what the research found: [research/reports/Modified car history market.md](research/reports/Modified%20car%20history%20market.md)
- Product rules and decisions: [docs/product.md](docs/product.md)

## Run it

```bash
npm install
```

```bash
npm run demo:web
```

That builds the web app with sample data (no backend) and serves it on http://localhost:8083. In the demo, take over
a car from **Take over a record from a seller** with code `HB3T-9WPZ` and VIN `JM1NC2PF0E0234567`.

With a Supabase project, copy `.env.example` to `.env`, fill in the public URL and anon key, then:

```bash
npx supabase link --project-ref <your-project-ref>
```

```bash
npx supabase db push
```

```bash
npx expo start
```

## Check it

```bash
npm run typecheck
```

```bash
npm run lint
```

```bash
npm test
```

`npm test` runs the rule tests and the database tests (the real migration on PGlite, with a small stand-in for
Supabase's auth and storage).

## Layout

- `src/app/`: screens (Expo Router). `r/[token]` is the buyer's record and `c/[token]` the shop's page; both work
  without an account.
- `src/domain/`: the rules, with no React: evidence levels, the emissions rule, odometer checks, the listing export.
- `src/services/`: the Supabase backend and the shared API shape. `src/demo/` is the sample-data twin.
- `supabase/migrations/`: tables, row-level security and every server-side rule.
