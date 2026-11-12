# Reddit research: who wants this, in their own words

Done 2026-11-12. I read about 25 Reddit threads (post plus top comments) and skimmed about 75 search results. Upvote
counts are as of that day. Everything below is a summary of what people wrote, not quotes. Nobody here was contacted,
and nothing was posted.

This is evidence of the **problem**. It doesn't prove anyone would use Dynorex, and it doesn't prove anyone would pay.
Only the interviews in [outreach.md](outreach.md) can show that.

## The short version

1. **Logging is crowded and mostly free.** At least six indie build-log apps have launched on Reddit since 2024,
   plus Carfax's free Car Care app, LubeLogger (self-hosted) and Etsy spreadsheets. "Another mod tracker" won't stand
   out.
2. **People asked for the handover, and a competitor already built it.** Track My Mods' r/Miata launch post (460
   upvotes, 182 comments) got this request from a seller gathering invoices: let the record move to the buyer when
   you sell. The developer replied that it was the most-requested feature. Their App Store page now says you can
   transfer vehicles to a new owner. So the transfer alone doesn't set Dynorex apart. What's still different: the
   buyer reads the record and what backs each entry from a link, before paying and without an app; the shop
   confirms its own work; the VIN or frame check; and the listing sheets.
3. **Buyers assume a modded car was abused.** On r/Audi's "Do mods scare buyers?" (286 upvotes, 271 comments) the top
   comment (347) says they'd skip a modded car because it was probably beaten on. The comments that soften say the
   same thing: receipts, a paper trail from a known shop, and full service history change their mind.
4. **E-moto buyers can't check the two things they fear.** In r/Surron, used buyers ask how to tell battery health,
   whether the mileage is real (changing the display resets it) and whether the bike is stolen. The answers are
   mostly "you can't". Stolen-bike posts are common and active (NYC, June 2026: 77 upvotes).
5. **UK insurance is a live, repeated pain.** r/CarTalkUK and r/CarInsuranceUK have new "how do I declare mods" posts
   every week or two in 2026, plus claim stories: a payout with undeclared mods, a motorcycle whose declared mods
   didn't carry over at renewal, and a claim denied over a mod the owner didn't know about.

## The themes, with where they came from

### 1. How people track builds today (most do it badly or not at all)

- **r/askcarguys, "How do you actually keep track of everything…"** (99 upvotes, 481 comments, 2026): the top answers
  are a notepad in the garage, a 3-ring binder with page protectors, a glovebox notebook, and "I don't". One reply
  (14 upvotes) says spreadsheets fail because you want to log it at the car, not after you go inside and clean up.
  Another commenter's buyers were thrilled to get the binder at a private sale.
  https://www.reddit.com/r/askcarguys/comments/1wnfixy/how_do_you_actually_keep_track_of_everything/
- **r/projectcar, "How do you keep track of work on your project car?"** (57 comments): Google Sheets, a binder of
  receipts, Trello, photos with the date in them. The most-upvoted comment (38) is someone admitting they record
  nothing. One builder keeps a sheet "in case I ever sell".
  https://www.reddit.com/r/projectcar/comments/1pobuqp/how_do_you_keep_track_of_work_on_your_project_car/
- **r/classiccars (2026):** spreadsheet plus scanned receipts, put on a USB drive at sale; folders with sleeves. Two
  other founders showed up in the thread pitching their own sites.
  https://www.reddit.com/r/classiccars/comments/1t6k4yq/how_are_you_guys_organizing_documentation_and/

**What this means for Dynorex:** the competitor is the binder and the spreadsheet. Logging has to work in the garage
in under 30 seconds (photo of the receipt plus one line). Many enthusiasts won't track anything just for themselves.
The reason to start is the sale or the insurer.

### 2. Selling a modified car

- **r/Audi, "Do mods scare buyers?"** (271 comments): most say yes because they assume abuse, a bad install and
  warranty trouble. The minority who'd buy name the same three things: receipts for every mod, a reputable shop,
  full service history.
  https://www.reddit.com/r/Audi/comments/185ecpx/do_mods_scare_buyers/
- **r/Diesel, "How do you price a modded truck?"** (109 comments): mods add nothing at a dealer, and the buyer who
  wants the mods usually can't afford the truck. One seller keeps a 3-ring binder of everything done, to be honest
  with buyers. The owner put in $17K and hoped to get $3K to $5K back.
  https://www.reddit.com/r/Diesel/comments/1exeean/how_do_you_price_a_modded_truck/
- **r/cars, "How to sell a modified car?"**: the standard advice is to go back to stock and part out the mods, or
  sell in model-specific groups. One comment says a modded car only holds value if it's sought after and has the
  paper to prove the work.
  https://www.reddit.com/r/cars/comments/9d18gw/how_to_sell_a_modified_car/
- **r/CarTalkUK, redacting receipts before sale:** sellers want to hand over invoices without their name and address
  on them. https://www.reddit.com/r/CarTalkUK/comments/t7a3du/thoughts_on_redacting_personal_details_from/

**What this means for Dynorex:** "paper to prove it" is the buyer's own condition. The buyer link already shows what
backs each entry. One gap to consider: hide the seller's name and address on receipt photos in the buyer view.
Also: going back to stock is the main alternative to selling with mods, so the stock-parts-included line on the
listing sheet matters.

### 3. Buying a used e-moto (Sur-Ron, Talaria)

- **"BUYING USED: how to tell battery health (and mileage)?"**: answers say the stock Sur-Ron has no app to read the
  battery, and mileage can be reset by swapping the display.
  https://www.reddit.com/r/Surron/comments/1lgx596/buying_used_how_to_tell_the_health_of_the_battery/
- **Same questions, different threads (2024 to Sep 2026):** "how to check battery condition", "battery tampered
  with?", "draining very fast" after a seller said it was fixed, "buying used: signs of a well-kept bike vs. one
  someone's dumping".
  https://www.reddit.com/r/Surron/comments/1wetluo/buying_used_what_should_i_look_out_for_what_are/
  https://www.reddit.com/r/Surron/comments/1wirc2q/surron_battery_tampered_with/
- **Stolen bikes:** a buyer who paid $5K to a sketchy seller asks how to check for theft. Replies say they probably
  bought a stolen bike, and a Toronto owner whose bike was taken asks for the color. Stolen-bike posts come from NYC,
  Dallas, Boulder and the UK. One Boulder poster found a dumped custom bike and couldn't trace it because it wasn't
  registered.
  https://www.reddit.com/r/Surron/comments/1th27zs/how_to_check_to_make_sure_there_is_no_tracker_and/
  https://www.reddit.com/r/boulder/comments/1ud1w4e/did_someone_steal_your_surron_bike_recently/

**What this means for Dynorex:** the battery log and the frame-number check (D-74) answer the exact questions people
ask. **Caution:** many of these posters are young teens, and commenters often point out that an LBX isn't street
legal. The marketing doc already says never target minors, never show street riding on off-road bikes. That rule
matters most here. Reach adult sellers and shops, not teen buyers.

### 4. Insurance (strongest in the UK and Australia)

- "Best way to declare mods on insurance?" (Nov 2026, 37 comments), "Folks with modified cars, who are you insured
  with?" (Oct 2026, 63 comments), "Declaring mods on Admiral" (Oct 2026), "How to declare car modification?" (Jul
  2026), and more.
  https://www.reddit.com/r/CarTalkUK/comments/1xn6siq/best_way_to_declare_mods_on_insurance/
  https://www.reddit.com/r/CarTalkUK/comments/1x42zle/folks_with_modified_cars_who_are_you_insured_with/
- **Claims:** "Declaration of mods didn't carry over" (a motorcycle insured with declared mods, then an accident).
  "Used car sales with undeclared mods": a commenter knows of a claim denied over a mod the owner didn't know about.
  https://www.reddit.com/r/CarInsuranceUK/comments/1tgtlap/declaration_of_mods_didnt_carry_over/
  https://www.reddit.com/r/CarTalkUK/comments/1fdetwe/used_car_sales_with_undeclared_mods/

**What this means for Dynorex:** the insurance mod list is a real second reason to keep a record, and the strongest
demand is outside the US. The record that moves to the next owner also tells them what's on the car before they
insure it. Never tell anyone how to word a declaration or what an insurer will do.

### 5. The competition people already see

Launched or promoted on Reddit since 2024: Track My Mods (r/Miata, r/RX7, r/F30, r/Supra), Revline 1
(r/projectcar), at least two unnamed "track everything" apps (r/CarHacking, r/carmodification), LubeLogger, SimplyAuto,
Carfax Car Care (free), Etsy mod spreadsheets. Feedback on Track My Mods: people dislike the subscription and would
pay once, and many don't want to see a total spent (a toggle to hide it was requested).

Track My Mods' App Store listing (checked 2026-11-12) says it can transfer ownership of vehicles and let others
collaborate on one: https://apps.apple.com/us/app/track-my-mods-tmm/id6737549764

**What this means for Dynorex:** don't pitch "the record goes to the buyer" as new. Pitch what the buyer sees before
paying. Charging once at the sale (the Sale kit) fits what these commenters say they'd pay
for better than a subscription does. Make the total spent optional or hidden by default.

## Where the people are

| Group | Subreddits | Best for |
|---|---|---|
| Sellers of modded cars | r/Audi, r/GolfGTI and r/Golf_R, r/Miata, r/WRX, r/Wrangler, r/Diesel, r/projectcar | Interviews with people mid-sale |
| Record keepers | r/askcarguys, r/Cartalk, r/classiccars, r/projectcar | The logging habit and the binder crowd |
| UK insurance | r/CarTalkUK, r/CarInsuranceUK | The insurance list |
| E-motos | r/Surron, r/ebikes | Battery and stolen-check questions (adults only) |

## How to use this without getting banned (all drafts, nothing posted)

- **Read each subreddit's rules first.** Most ban self-promotion or allow it once a week in a set thread. Founders
  who posted "I built this, what should I add?" in model subreddits (r/Miata) did well. Link drops in r/askcarguys
  didn't.
- **Ask, don't pitch.** Best first post: a question with no link, for example "If you sold a modded car, what did
  buyers ask to see?" Then read every answer and write the words down in the marketing doc's customer language.
- **Answer real questions with the free template** (content plan #1) where the rules allow it.
- **The founder is 14.** Reddit allows 13+, but a parent or guardian should know about the account, read DMs before
  any meeting, and handle anything to do with money. Don't share age, school or location.

Draft first post (for a model subreddit, after checking its rules):

> Title: Sold a modded car recently? What did buyers ask to see?
>
> I'm trying to understand what actually convinces a buyer that a modified car was looked after. If you've sold
> one (or bought one): what did you show or ask for? Receipts, shop invoices, the tune file, stock parts? Did any of
> it change the price? No link, not selling anything, just collecting answers.

## What's still unknown

- `[NEED: 5+ answers to the draft post, in people's own words]`
- `[NEED: whether anyone would move their binder into an app before a sale, and when in the ownership they'd start]`
- `[NEED: e-moto sellers (adults) who'd log battery checks, from shops or r/Surron]`
- `[NEED: try Track My Mods' transfer yourself: does the buyer see receipts and proof before buying, or only after
  the transfer?]`
