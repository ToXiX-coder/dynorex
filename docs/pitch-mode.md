# Pitch mode

Sign-in off, full app on made-up sample data, for demos and investor pitches.

## Run it

| Where                      | How                                                                                       |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| Browser on this computer   | `npm run pitch:web` (opens http://localhost:8081)                                         |
| Your phone, same Wi-Fi     | `npm run pitch`, then scan the QR code with Expo Go (iOS camera / Expo Go app on Android) |
| Phone, different network   | `npm run pitch -- --tunnel`                                                               |
| Installable app, no laptop | `npx eas-cli@latest build --profile pitch` (needs the Expo account, B-03/B-02)            |
| A link anyone can open     | `npm run pitch:export`, then host `dist/pitch` (serve `_expo/` as `expo/`)                |

The investor deck's QR code opens a hosted copy of `npm run pitch:export`. Rebuild and re-host it whenever the app
changes, or the QR code shows an older app. Last rebuilt 2026-10-17 (Build Record and motion pass).

Expo Go can show everything except in-app purchase sheets and push; pitch mode never uses those anyway.

## What it is

- No sign-in screen: the app opens as **@demo_driver** with two vehicles (a public "Weekend Warrior" WRX and a
  private Miata), a followed-build feed, notifications, and six made-up other owners with public builds.
- Every feature works on the sample data, using the same rules as the real server: free limits (the garage is
  already at 2 vehicles, so "Add" shows the Dynorex+ upsell), private builds disappear from public pages,
  blocking hides people everywhere, stickers need Dynorex+, and so on.
- **Dynorex+ purchase is simulated**: the paywall says "Pitch mode: no store is contacted and nothing is
  charged", and subscribing switches Plus on in the sample data so you can show stickers, advanced specs and
  build analytics.
- Dynorex+, Nearby, Build of the Week, **Line** and **Paddock** are switched on in pitch mode only.
  - Line: tap Start → **Simulate a drive (pitch mode)** fills in a sample loop so you can show review, sharing
    (with the privacy trim explained) and the saved route page without driving. Three rated sample routes are
    in "Routes".
  - Paddock: four sample events; **Weekend Warrior meetup** is yours and starts within the hour, so the host
    screen shows the live check-in code; **Track walk** is full, to show capacity.
- **Build Record** (the investor story): tap the Weekend Warrior WRX on Home, then **Open Build Record**. It has
  11 sample entries at every evidence step, a waiting shop confirmation, a "Next up" card, the buyer's link with
  the VIN check (sample VIN `JF1VA1A60F9800012` matches) and the transfer code.
- A **PITCH MODE · SAMPLE DATA** pill is always on screen. Tap it to explain pitch mode or **Reset sample data**.

## Good to know

- Data lives in memory: reloading the browser page (or restarting the app) starts the sample data over. Use the
  in-app back button rather than the browser's address bar during a demo.
- Photos you add stay on that device; nothing is uploaded.
- Account actions (sign out, delete account, password) say "Off in pitch mode". Data export works and is
  labeled as sample data.

## Safety

- Controlled by `EXPO_PUBLIC_DEMO_MODE=true`. The app **refuses it when `APP_ENV=production`** (unit-tested), so
  store builds always require an account.
- In pitch mode the app never creates a Supabase client, so it cannot read or write any real project, even if
  one is configured.
- Real sign-in, row-level security and every server rule are unchanged; pitch mode only swaps the app's data
  layer (`src/demo/`).

## Showing the animations on any computer

If the computer is set to reduce motion (Windows: Settings > Accessibility > Visual effects > Animation effects off), the app plays its still version, as it should. For a demo, open it once with `?motion=full` (for example `http://localhost:8082/garage?motion=full`): every animation plays for the rest of that browser tab's session. Phones always follow their own setting. The landing page does the same with `#motion`.

