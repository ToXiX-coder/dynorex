# Store listing pack (spec 17) — draft for owner review

## Text

| Field                              | Value                                                                 | Limit   |
| ---------------------------------- | --------------------------------------------------------------------- | ------- |
| App name (both)                    | Dynorex                                                               | 30      |
| Subtitle (App Store)               | Build. Drive. Your People.                                            | 26 / 30 |
| Short description (Google Play)    | The car enthusiast app for builds, routes, and community.             | 57 / 80 |
| Category                           | Lifestyle (primary), Social Networking (secondary) — owner to confirm |         |
| Support URL                        | https://dynorex.app/support                                           |         |
| Account deletion URL (Google Play) | https://dynorex.app/account-deletion                                  |         |
| Privacy policy URL                 | `EXPO_PUBLIC_PRIVACY_URL` (not published yet)                         |         |

Full description (spec text; section names without "The" per D-15):

> Dynorex is the app car enthusiasts have been waiting for. Document your build. Share your routes. Find your people.
>
> BUILD — Your digital garage. Log every mod, track every dollar, and show the world what you're building. Spec estimates update automatically as your build grows.
>
> LINE — Record and share your favorite drives. Discover routes rated by real enthusiasts. Plan group drives with your crew. (Coming soon)
>
> PADDOCK — Find car meets and events near you. Join clubs. Buy and sell parts with people who actually know cars. (Coming soon)
>
> Built for the people who live for their cars. Free to download. Dynorex+ unlocks unlimited builds, advanced analytics, and exclusive Torq stickers.
>
> Download Dynorex. Prove your build.

**Review risk (owner decision):** Apple's guidelines discourage describing features that aren't in the build
("Coming soon"). Safer: ship the first listing without the LINE and PADDOCK paragraphs and add them when those
features launch. Subscription terms (price, period, auto-renew) must also appear in the description or the
Terms link.

## Screenshots (spec order, both stores)

Capture from the **pitch build** (realistic sample data, no real users), iPhone 15 Pro frame for App Store and
Pixel 8 for Google Play. Dark background, lime accents in each; Torq visible in #6 and in at least one other.

1. Garage: vehicle cards + spec dashboard (Weekend Warrior)
2. Add Mod: category grid, status choice, photo buttons
3. Build timeline: mods with status chips
4. Public build page: hero photo, specs, reactions (add one real photo of your own car first)
5. Discover: trending builds
6. Paywall: Dynorex+ with Torq

Note: sample builds have no photos (no licensed car images). For #1 and #4 add your own photos in pitch mode
before capturing.

## Age rating and regions

User-generated content with reporting and blocking → expect Apple 12+ / Google "Teen". Questionnaire answers:
no gambling, no mature content, unrestricted web access no, user interaction yes (moderated). Regions: owner
decision (B-07 launch city).

## App Review notes (Apple) / testing instructions (Google)

Reviewers need a working account: create `review@<your domain>` on production with a verified email, two sample
vehicles and one public build. Mention: Dynorex+ uses App Store IAP; restore is on the paywall and Settings ›
Dynorex+; account deletion is Settings › Your data.

## Privacy declarations (what the app actually does)

Apple App Privacy ("Data Used to Track You": **none**; no ATT prompt needed while no ad/analytics vendor tracks):

| Data type                                             | Collected                           | Linked to user | Purpose                        |
| ----------------------------------------------------- | ----------------------------------- | -------------- | ------------------------------ |
| Email address                                         | Yes                                 | Yes            | App functionality (account)    |
| User ID                                               | Yes                                 | Yes            | App functionality              |
| Photos                                                | Yes (only those you add)            | Yes            | App functionality              |
| Other user content (vehicles, mods, profile, reports) | Yes                                 | Yes            | App functionality              |
| Coarse location                                       | Optional (Nearby, ~55 km cell)      | Yes            | App functionality              |
| Purchase history                                      | Yes (via App Store / RevenueCat)    | Yes            | App functionality              |
| Crash data, performance data                          | Yes (Sentry, scrubbed)              | No (random id) | App functionality, analytics   |
| Product interaction                                   | Not yet (no analytics vendor, D-05) | —              | Update when a vendor is chosen |

Not collected: precise location, contacts, browsing history, health, financial info, VIN in any analytics.

Google Play Data safety: same types; data encrypted in transit: yes; users can request deletion: yes (in app +
web URL); data shared with third parties: processors only (Supabase hosting, Sentry, RevenueCat, Expo push) —
declare as "not shared" only if counsel agrees they are service providers.
