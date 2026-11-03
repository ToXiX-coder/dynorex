# Competitive Landscape: "Vehicle History Report for Modified Cars"

Research date: 2026-10-16. Budget-limited pass (about 16 tool calls), so several sub-questions are recorded as gaps rather than answered. Most product claims below come from vendor pages and are self-described; none were tested hands-on.

## 1. Do Carfax / AutoCheck / other VHRs record aftermarket modifications?

### Takeaway
No evidence that any mainstream US vehicle history report (VHR) records aftermarket modifications as a data category. Carfax builds its reports from third-party feeds (DMVs, insurers, shops, auctions, police). Owner-entered records in Carfax Car Care / myCARFAX do not appear on the Carfax report. Carfax does have a dealer valuation tool that can factor in aftermarket parts, but that tool draws on existing report data.

### Cited Findings
- Carfax report contents: number of owners, accidents, title issues, fleet use, maintenance records. Modifications are not listed. — [Wikipedia: Carfax, Inc.](https://en.wikipedia.org/wiki/Carfax,_Inc.)
- Carfax data comes from DMVs, salvage/title agencies, insurers, service shops, auction houses, fleet operators and police. Only those data providers can submit or correct records; owners cannot edit the report directly. (Secondary source, Quora answer.) — [Quora](https://www.quora.com/Are-car-owners-allowed-to-modify-their-vehicle-history-reports-on-Carfax)
- Carfax "History Impact" is a dealer-facing pricing tool. Trade press says it accounts for alterations such as aftermarket parts when estimating retail value, and that it is based on information already in Carfax VHRs. — [Auto Remarketing](https://www.autoremarketing.com/ar/carfaxs-new-history-report-enhancement-geared-specifically-dealers)
- A Carfax spokesperson acknowledged that Carfax does not have all the data on every car. — [NBC Connecticut](https://www.nbcconnecticut.com/news/local/carfax-caution-vehicle-history-report-may-not-tell-the-whole-story/2176546/?amp=1)
- Carfax Car Care (formerly myCARFAX) is a consumer app for service history and reminders. — [carfax.com/Service](https://www.carfax.com/Service/)
- Owner-entered DIY records do not appear on the Carfax VHR. A Rennlist user (July 14, 2020) quoted Carfax support: "this information will not be included on the CARFAX Vehicle History Report." This contradicts a 2015 post in the same thread that claimed the opposite. Another user (2019) noted the app lets owners attach receipts to service dates. — [Rennlist thread](https://rennlist.com/forums/997-forum/873378-my-carfax-app-for-diy-folks.html)
- A third-party review describes Carfax Car Care as having "limited customization for modified cars; manual entry for DIY." — cited via [CarJourney blog](https://carjourney.io/blog/best-app-tracking-car-modifications), a competitor's blog, so potentially biased.
- On enthusiast forums, VHR service history is described as "spotty at best," and buyers treat mods plus missing records as red flags. — [Bimmerpost F80 thread](https://f80.bimmerpost.com/forums/showthread.php?t=1650602)

### Inferences
- The structural gap: Carfax captures shop events through repair-order feeds. A mod installed by a shop may surface only as a generic categorized service line, and a DIY mod never surfaces. Carfax itself categorizes job titles (see Section 3), so mod-specific detail is likely lost. This is inferred, not verified.
- The Carfax brand's credibility rests on owners NOT being able to self-report. A competitor that mixes owner logs with shop confirmation needs a visible trust model that separates the two.

### Gaps
- Not checked: AutoCheck (Experian), VinAudit, Bumper, ClearVin and NMVTIS documentation on modifications. NMVTIS is title, brand and salvage data by design, so mods are very unlikely, but this is not verified.
- No source confirmed whether Carfax's service-network contributors include performance or tuning shops by name.
- Could not confirm whether any state DMV records modifications that might flow to VHRs (for example, California smog/CARB EO referee records).

## 2. Garage, build-log and maintenance apps: does any transfer to a buyer or produce a sale-ready history?

### Takeaway
Yes. Several small players already claim the core "transfer to next owner" mechanic. **BuildSheet** (US, free, beta) and **CarBuilds** (Hungary) are explicitly mod-focused and transfer-capable. **My Garage Journal** has the most concrete transfer flow (claim code, read-only archive for the seller, PDF Sale Report) but is maintenance-focused. None of the sources found describe **shop confirmation/verification** of entries or **measured results** (dyno or timeslip) as a verified field. That combination looks like the remaining white space. Every one of these products appears small, with no public user counts or funding found.

### Cited Findings
- **BuildSheet** (buildsheet.io, "Made in Charlotte"):
  - Logs mods, upgrades and maintenance with date, cost, brand, part number, vendor, mileage, notes and photos. Items can be public, private or wishlist.
  - Says build history stays with the car on sale, calls records "Permanent. Immutable. Forever.," and compares itself to Carfax.
  - Each car gets a unique URL and a QR code that can be printed for car shows.
  - Free, and "very much in beta."
  - Shops can create collections, but no shop verification is described. No installer field is described. No user counts given.
  - Source: [BuildSheet](https://buildsheet.io/)
- **CarBuilds** (carbuilds.com, Prodizon Kft., Debrecen, Hungary):
  - Has a mobile app (iOS and Android) and supports transferring the full build history to a new owner, which it calls "Verified Build History." The verification mechanism is not explained.
  - Pricing: Free plan (2 projects); Early Access free "forever" (page showed 131 of 200 spots taken, which signals a very small user base); Pro at $14.99/month.
  - No receipt or shop verification described.
  - Source: [CarBuilds](https://www.carbuilds.com/)
- **My Garage Journal** (Sisu Ventures Limited, © 2026):
  - Logs services, repairs and costs with invoices and photos. "Entries backed by evidence show as verified," meaning evidence-attached, not shop-confirmed.
  - On sale, the seller gives the buyer a claim code and the full history carries over; the seller keeps a read-only archive.
  - The Sale Report PDF links back to the live record.
  - Pricing: Free (1 vehicle) or €29.99/year.
  - Modifications not specifically mentioned. Home country not stated, with EUR pricing.
  - Source: [My Garage Journal](https://www.mygaragejournal.com/)
- **CarJourney** (carjourney.io): digital garage for mods and maintenance with AI receipt scanning, VIN-based setup, shareable build profiles for buyers and full history export. Free tier; paid price not stated. — [CarJourney blog](https://carjourney.io/blog/best-app-tracking-car-modifications) (self-published, so its comparisons of rivals are biased)
- **Track My Mods**: logs mods, repairs and expenses with photos, receipts and before/after shots, plus a wishlist. Free for 1 vehicle and up to 100 entries; PLUS+ subscription unlocks more. No buyer-sharing feature mentioned. — [CarJourney blog](https://carjourney.io/blog/best-app-tracking-car-modifications)
- **Auto ModList**: personal web build pages shareable by link, QR code or print, with member parts discounts. — [CarJourney blog](https://carjourney.io/blog/best-app-tracking-car-modifications)
- **MotorMia**: AI mod planning, visual mod timeline, "glovebox" photo documentation, free. — [CarJourney blog](https://carjourney.io/blog/best-app-tracking-car-modifications); [App Store](https://apps.apple.com/us/app/mia-ai-car-modding-assistant/id6737239101)
- **ModMap** (UK): gamified iOS mod tracker, closed beta. — [ModMap](https://modmap.co.uk/)
- **The Owners Club** (UK): imports MOT mileage history and hands buyers a structured "Transfer Pack." Maintenance-focused, not mods. — [The Owners Club](https://www.theownersclub.app/guides/how-to-prove-full-service-history-when-selling)
- **CarCare Diary**: shareable no-login link to a vehicle's log. — [CarCare Diary](https://www.carcarediary.com/vehicle-maintenance-log)
- Fuel and diagnostic tools (Fuelio, Car Scanner, Torque Pro) are not records products. Torque Pro can log data during dyno runs. — [CarJourney blog](https://carjourney.io/blog/best-app-tracking-car-modifications)

### Inferences
- The "transfer to buyer" feature is not novel. At least 3–4 apps claim it. Differentiation would have to come from:
  - third-party (shop) attestation;
  - measured results tied to an install event;
  - buyer-side trust: a buyer can see which entries are owner-claimed and which are shop-confirmed;
  - distribution into listings or auctions.
- All of these competitors look early or small (beta labels, a 200-seat Early Access program, no funding found). The category appears unconsolidated. Inferred from vendor pages; no funding databases were checked.
- The "verified" language from CarBuilds and My Garage Journal muddies the positioning. A new entrant would need to define "verified" precisely, for example as "confirmed by installing shop account."

### Gaps
- Not researched: Drivetribe (believed defunct around 2022; unverified here), Fuelly, aCar, Drivvo, Simply Auto, Wrench, Carvy, Motorious, Kinetic, Drivurs, Ryyve, Roadstr, Dragy, RaceChrono.
- No App Store rating counts, user numbers or funding (Crunchbase) were retrieved for any app.
- No Reddit threads were retrieved, because search returned none for "carfax for mods" phrasing. One source explicitly found no product branded as a "Carfax for modified cars." — [search summary based on Bimmerpost/Quora/alternativeto results](https://alternativeto.net/software/carfax/)

## 3. Shop-management software: do they share service history with owners or Carfax?

### Takeaway
Yes, at least Tekmetric and Shopmonkey push repair-order data to Carfax. In Tekmetric's case Carfax re-categorizes job titles into its standard descriptions, so mod-specific detail is likely flattened. This pipe is the likeliest channel through which shop-installed mods reach any VHR today, but only as generic service lines.

### Cited Findings
- **Tekmetric**'s Carfax integration:
  - Free, and once connected applies shop-wide; it cannot be toggled per customer.
  - Sends data only for repair orders with a license plate. Excludes declined work and $0 no-parts jobs.
  - Sends up to 10 days after the repair order posts.
  - Tekmetric sends the job title and Carfax "qualitatively interpret[s]/categorize[s]" it into Carfax's standard descriptions.
  - Shops can also view Carfax service history (excluding collision).
  - Source: [Tekmetric Support: CARFAX Integration FAQs](https://support.tekmetric.com/hc/en-us/articles/360036301793-CARFAX-Integration-FAQS-Configuration)
- **Shopmonkey** advertises a Carfax integration: search by plate, pull service histories, "send completed services" to Carfax. Marketing page; rules not documented. — [Shopmonkey CARFAX integration](https://www.shopmonkey.io/integrations/carfax)

### Inferences
- A product needing shop confirmation could integrate with these same SMS platforms, or offer a lightweight "confirm install" link for shops, rather than asking shops to adopt new software. This is inference.

### Gaps
- Not checked: Mitchell1, Shop-Ware, AutoLeap Carfax integrations; customer-facing history portals; adoption share among performance/tuning shops. No data found on what software tuning shops use.

## 4. Enthusiast auction marketplaces: how are modifications documented?

### Takeaway
Could not retrieve official BaT or Cars & Bids policies; carsandbids.com/faq returned 403. Available evidence is indirect: sellers voluntarily post mod lists and receipts. Evidence on whether modified cars sell better or worse is anecdotal and points both ways.

### Cited Findings
- BaT marketing emphasizes detail on "every modification," "every receipt," and 700+ photos. (Ad-library summary, not a listing rule.) — [Motion ad library: Bring a Trailer](https://motionapp.com/library/bring-a-trailer)
- Example: a 2019 Ford Ranger with $40K+ in mods was listed on BaT with 200+ photos and receipts on the auction page. (One seller's practice.) — [Ranger5G forum](https://www.ranger5g.com/forum/goto/post?id=624802)
- Cars & Bids is "more explicit about listing rules": no pulling a car mid-auction and no simultaneous listing elsewhere. Nothing found on mod disclosure. — [Jalopnik](https://www.jalopnik.com/2215657/rule-regarding-listing-car-multiple-auction-sites/)
- Hagerty valuation guidance: light, reversible changes need not hurt value, while highly personal, irreversible changes shrink the buyer pool. Hagerty also found custom C1/C2 Corvettes outselling stock examples in a two-car comparison (article roughly 2.7 years old). — [Hagerty Insider](https://www.hagerty.com/media/market-trends/hagerty-insider/c2-stock-v-restomod/)
- Hagerty's 2025 prediction review: only modified first-generation Miatas approached $50K; stock ones did not. — [Hagerty: Scoring 2025 predictions](https://www.hagerty.com/media/market-trends/hagerty-insider/data-driven/scoring-our-2025-market-predictions/)

### Inferences
- Auction sellers already assemble mod lists and receipts by hand for each listing. A product that exports a structured, verifiable build sheet into a BaT or C&B listing addresses a real, recurring chore. This is inference; no sources quantify it.

### Gaps
- Official BaT, Cars & Bids, PCarMarket and Hagerty Marketplace listing guidelines on mods were not retrieved.
- No systematic stock-vs-modified price dataset was found.

## 5. Digital vehicle passports and blockchain history startups

### Takeaway
No modification-focused digital passport product was found. Blockchain VHR efforts focus on mileage, accidents, title and ownership, and several are dated or of uncertain status.

### Cited Findings
- **VINchain**: blockchain vehicle history keyed by VIN. Sources are a roughly 2018–2020 whitepaper and ICO-era posts, so current status is unclear and the project is possibly defunct. — [Scribd whitepaper](https://www.scribd.com/document/460758582/white-paper-en-pdf); [Steemit](https://steemit.com/ico/@martilda/vinchain-platform-vehicle-history-on-blockchain)
- **carVertical** (Lithuania, notable non-US player): blockchain-anchored history reports aimed at used-car fraud; partnered with Volkswagen (older coverage). No evidence it records aftermarket mods. — [CoinGeek](https://coingeek.com/volkswagen-partners-carvertical-automotive-blockchain-apps/)
- **VINPassport**: 2026-era open-source zero-knowledge "Digital Circularity Vehicle Passport" referencing EU Reg. 2026/1738. Maturity unknown. — [GitHub](https://github.com/VINPassport/VINPassport)
- Academic work on blockchain documentation of classic-car restoration (closest conceptually to a build record). — [arXiv 2403.08093](https://arxiv.org/pdf/2403.08093)
- Academic "VehiclePassport" zero-knowledge framework. — [arXiv 2509.06133](https://arxiv.org/pdf/2509.06133)

### Inferences
- The EU regulatory push for digital vehicle and circularity passports could create OEM or regulator-backed records in Europe, but none found covers aftermarket parts.

### Gaps
- Not checked: MOBI (Mobility Open Blockchain Initiative) VID standard, CarDossier, Porsche Certificate of Authenticity / OEM heritage certificates, marque registries.

## 6. Specialty insurers: what mod documentation do they require, and do any store build docs?

### Takeaway
Insurers ask for documentation but do not store or transfer it. Hagerty requires 4 photos for custom/modified vehicles and typically no appraisal. Receipts and shop invoices become critical at value-increase or claim time. This makes insurers a plausible consumer and channel partner for a verified build record, but not a competitor based on the evidence found.

### Cited Findings
- Hagerty: "We need four photos for custom or modified vehicles (full vehicle, engine, interior, and trunk or bed, if it's a truck)." "We typically do not require appraisals." Hagerty may request more documentation during underwriting. — [Hagerty FAQ: General Guidelines](https://www.hagerty.com/insurance/frequently-asked-questions/general-guidelines)
- Hagerty advises that shop receipts or updated photos are often sufficient to support a value increase, and that owners should "keep careful documentation of any work." — [Hagerty: Valuating your collector car](https://www.hagerty.com/media/buying-and-selling/valuating-your-collector-car/)
- A 2026 consumer account (secondary review site): an insured raised agreed value, then after a crash faced demands for receipts and a fraud investigation. Treat as anecdote. — [Vantage Point Risk](https://vantagepointrisk.com/learning-center/hagerty-insurance-review/)
- Progressive Custom Parts & Equipment (CPE) is an add-on covering aftermarket parts. A baseline of about $5,000 is reported, with higher limits possible (one source says up to $30,000, unconfirmed). Receipts, installation records and photos are needed to support claims, reportedly for claims over $1,000 (secondary source). — [MoneyGeek](https://www.moneygeek.com/insurance/auto/modified-car-insurance/); [Baxter Insurance Agency](https://baxterinsuranceagency.com/custom-parts-equipment-coverage-progressive-texas/)
- General CPE guidance: original purchase receipts, professional installation invoices (DIY installs may not be covered), and photos of each mod. — [PennyPincher](https://pennypincher.com/articles/insurance/auto/custom-parts-equipment-coverage-car-modifications)

### Inferences
- "Professional installation invoice" language in CPE guidance suggests shop-confirmed installs could carry real value at claim time. This is a strong angle, but the insurer acceptance of such a record is unverified.

### Gaps
- Not checked: Grundy, American Modern, State Farm. No insurer product that stores build documentation was found; absence is not confirmed.

## 7. Tuning platforms (Cobb, HP Tuners, EcuTek): do they log install history?

### Takeaway
Tuning devices bind to a VIN ("married"), which creates an implicit tune-install record. However, no evidence was found of an owner- or buyer-viewable install or tune history log.

### Cited Findings
- A Cobb Accessport installed ("married") to one vehicle won't work on another until it is uninstalled or re-licensed by Cobb. The menu showing "Install" vs "Uninstall" reveals the state. Cobb can relicense units from totaled or stolen cars. — [Ford Raptor Forum quoting Cobb](https://fordraptorforum.com/threads/cobb-accessport-v3-with-tcm-module-for-gen-2-for-2017-2020.104393/post-2072736); [Cobb wiki](https://cobbtuning.atlassian.net/wiki/x/ZoBMHQ)
- Forum users report that custom tunes are coded to a specific VIN and must be re-assigned by the tuner. — [Rennlist: Cobb Accessport questions](https://rennlist.com/forums/gt4/1098065-cobb-accessport-questions.html)

### Inferences
- Cobb and tuner VIN-licensing records are a potential verification source: proof that a tune was installed on a VIN and by which protuner. No API or public lookup was found, so this is speculative.

### Gaps
- HP Tuners (VIN licensing and credits) and EcuTek were not researched; search returned nothing relevant.

## Overall bottom line

**Verified:**
- Mainstream VHRs (Carfax confirmed) do not record mods, and owner logs do not reach the Carfax report.
- Several small apps already offer mod logging plus transfer or sharing to buyers: BuildSheet, CarBuilds, My Garage Journal, CarJourney, Auto ModList.

**Not found:**
- Any product combining shop-confirmed installs (who installed, when), receipts, measured results, and buyer transfer.
- Any scaled or funded player in the category.

**Inference:**
- The closest competitor on positioning is BuildSheet, which compares itself to Carfax. The closest on transfer mechanics is My Garage Journal.
- The defensible differentiation is the trust layer (shop attestation plus measured results) and distribution into auctions and insurers.
