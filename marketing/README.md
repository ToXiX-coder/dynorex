# Dynorex marketing: Build Record launch

Built with the `marketing-kit` skill (adapted from coreyhaines31/marketingskills, MIT). Source of truth for
positioning: [`.agents/product-marketing.md`](../.agents/product-marketing.md).

Everything here is a draft. Nothing has been posted or sent.

## Files

- [landing-copy.md](landing-copy.md): landing page and app store copy.
- [landing/index.html](landing/index.html): the landing page, a scroll-driven experience (inspired by edolus.com,
  in Dynorex's brand): a "start engine" gate, a live tachometer where scrolling is the throttle, the sample WRX's
  logged dyno runs and mods as a pull, the record as a constellation of who said what, a live VIN check, a
  departures-board transfer code, optional synthesized engine sound, and real app screenshots (sample data). The
  waitlist form isn't connected; it says so instead of pretending.
  - Computers set to reduce motion get a still version. Add `#motion` to the link to show the full version anyway.
  - Run it locally with the `landing-page` entry in `.claude/launch.json` (port 8084).
- [outreach.md](outreach.md): emails and DMs to shops and sellers, with follow-ups.
- [content-plan.md](content-plan.md): pillars, 10 scored pieces, a six-week calendar.
- [pricing.md](pricing.md): first price to learn from ($49 per sale, e-moto $29 test) and how to test it.
- [social.md](social.md): content pillars, two-week calendar, video scripts (two e-moto videos added).
- [landing-copy.md](landing-copy.md) also has an e-moto version; [outreach.md](outreach.md) has e-moto seller and
  shop scripts.

## Where we are (updated 2026-11-11)

The Build Record is built and tested (587 vitest and 102 jest tests) and now covers motorcycles and e-motos
(D-71 to D-74). It is not live: the latest database change (D-74) still has to be applied to Supabase, and the app
isn't in the stores. The demo is at the artifact link; a permanent Vercel address is set up in the repo and waits
on approving Vercel's access to the team. `dynorex.app` isn't registered yet. There are no users yet. So this is a
pre-launch plan. The goal is learning from real people, not reach.

The investor deck ("Dynorex Pre-Seed") tells the same story: the Build Record, sellers first, the seller pays once
at the sale. Rebuild the demo whenever the app changes, or the QR code shows an older app.

**Goal for the first 60 days:** 25 sellers of modified cars use the Build Record on a real sale, and 5 shops
confirm at least one install. Those numbers are my estimates of what would prove demand, not industry rules.
Side test: 10 people selling a used e-moto try the Build Record with a battery check on it.

## Readiness check

- **Simple:** one job. Turn a build into a record a buyer can trust. Yes.
- **Lovable:** unknown until sellers try it. That's what the beta is for.
- **Complete:** log, confirm, share, transfer all work end to end in the demo. Yes, once deployed.

Verdict: stop adding features. Deploy, then put it in front of people.

## Channels

- **Owned:** a waitlist (email list) on a simple landing page. Everything points here.
- **Rented:** Instagram and TikTok (car content lives there), plus model-specific forums and subreddits. Pick 2.
- **Borrowed:** local shops (The Hamilton Collection already helped once), car meets and Cars and Coffee, car
  clubs, small car YouTubers and TikTokers who sell their project cars.

## Phases

1. **Internal (now):** 3 to 5 people you know with modified cars log their real builds. Watch them do it. Fix
   what confuses them.
2. **Alpha:** landing page with a waitlist. Deploy the backend. TestFlight / internal Play testing.
3. **Beta:** invite from the waitlist in small batches. Personally recruit sellers with a modified car listed or
   about to be listed. Ask 2 to 3 shops to confirm a real install.
4. **Early access:** post real (anonymized, with permission) build records as examples. Run a short survey: "How
   would you feel if you could no longer use Dynorex?"
5. **Full launch:** app stores, announce on every channel, then decide pricing for sellers.

## Next 7 days

1. **Day 1:** a parent or guardian applies the D-74 database change (paste
   `supabase/migrations/20261111000000_two_wheel_transfer.sql` into the Supabase SQL Editor) and approves Vercel's
   access, so the demo gets a permanent link.
2. **Day 1:** send the update email to Henry and Steve at The Hamilton Collection. Ask whether they'd confirm work
   through a link.
3. **Day 2:** put up the landing page from [landing-copy.md](landing-copy.md) with a waitlist form (car version;
   the e-moto version as a second page if the host allows it).
4. **Day 3 to 4:** get 3 to 5 people you know with a modified car or e-moto to log their builds. Sit next to them
   while they do it. Write down every question they ask.
5. **Day 4 to 5:** visit or email 5 local shops with the shop script in [outreach.md](outreach.md); include one
   shop that fits e-moto controllers or packs.
6. **Day 5 to 7:** post 3 videos from [social.md](social.md), including one e-moto video. Reply to every comment.
7. **Day 7:** write what you learned in the Learnings table in `.agents/product-marketing.md`, including whether
   the e-moto video drew more questions than the car ones.

## Rules that don't bend

- Never say verified, certified, guaranteed or dyno-proven.
- Never use "Carfax" (or anything that sounds like it) in public copy, names, ads or domains. "Carfax doesn't
  show your mods" is a comparison to check with a lawyer before using in ads.
- No made-up users, numbers or quotes. Use real ones or none.
- Keep the legal line exact: "Estimates based on user-reported data. Dynorex is not responsible for accuracy."
- Founder is 14: a parent or guardian handles accounts, payments, ads and any meetups with strangers. Decide as a
  family whether to say your age publicly. It's a strong story, but it's personal information.

## Fill these in

- `[NEED: pricing decision]`: [pricing.md](pricing.md) recommends $49 per sale; decide before charging anyone.
- `[NEED: landing page host and waitlist tool]`, for example a free Carrd or Tally page.
- `[NEED: real quotes]` from the first testers, for the landing page.
