/**
 * User-facing error copy, verbatim from the handoff spec (section 5.16 "Error Message Copy").
 * Rules are enforced by tests/unit/errorCopy.test.ts. Never show raw codes or stack traces.
 */
export interface ErrorCopy {
  title: string;
  body: string;
  actions: readonly string[];
  /** The first action is destructive and must be Aggressive Red with a confirm step. */
  destructive?: boolean;
  torq?: "shrugging" | "armsCrossed" | "upgrade" | "neutral";
}

export const ERROR_COPY = {
  offline: {
    title: "You're offline",
    body: "Check your connection and try again.",
    actions: ["Retry"],
    torq: "shrugging",
  },
  server: {
    title: "Something broke on our end",
    body: "It's not you. We're on it. Try again in a sec.",
    actions: ["Retry"],
    torq: "armsCrossed",
  },
  wrongPassword: { title: "Wrong password", body: "Double-check your password and try again.", actions: ["Try Again"] },
  tooManyAttempts: { title: "Too many attempts", body: "Take a break and try again in 15 minutes.", actions: ["OK"] },
  sessionExpired: {
    title: "You've been logged out",
    body: "Your session expired. Sign back in.",
    actions: ["Sign In"],
    torq: "neutral",
  },
  uploadFailed: { title: "Upload failed", body: "That photo didn't make it. Try again.", actions: ["Retry"] },
  photoTooLarge: { title: "Photo too large", body: "Keep it under 10MB and try again.", actions: ["OK"] },
  buildNotFound: {
    title: "Build not found",
    body: "This build might be private or deleted.",
    actions: ["Go Back"],
    torq: "shrugging",
  },
  rateLimited: { title: "Slow down", body: "You're moving fast. Wait a minute and try again.", actions: ["OK"] },
  modSaveFailed: {
    title: "Couldn't save that mod",
    body: "Something went wrong. Your draft is saved — try again.",
    actions: ["Retry"],
  },
  searchEmpty: { title: "Nothing found", body: "Try a different search.", actions: [], torq: "shrugging" },
  paywall: {
    title: "That's a Dynorex+ thing",
    body: "Upgrade to unlock unlimited builds, advanced stats, and exclusive Torq stickers.",
    actions: ["Upgrade", "Maybe Later"],
    torq: "upgrade",
  },
  deleteVehicle: {
    title: "Delete this vehicle?",
    body: "This removes the vehicle and all its mods. You can't undo this.",
    actions: ["Delete", "Cancel"],
    destructive: true,
  },
  deleteMod: {
    title: "Delete this mod?",
    body: "Gone for good. You sure?",
    actions: ["Delete", "Cancel"],
    destructive: true,
  },
  reportSent: { title: "Report sent", body: "We'll look into it.", actions: ["OK"] },
  blocked: { title: "Blocked", body: "You won't see their content and they won't see yours.", actions: ["OK"] },
  savedOffline: { title: "Saved offline", body: "We'll upload this when you're back online.", actions: ["OK"] },
  subscriptionExpired: {
    title: "Your Dynorex+ expired",
    body: "Renew to keep your unlimited builds and exclusive stickers.",
    actions: ["Renew", "Not Now"],
    torq: "upgrade",
  },

  // ---- Phase 2 additions (same voice rules; not in the spec's table)
  notConnected: {
    title: "Not connected yet",
    body: "This build has no Dynorex server set up. Sign-in works once it does.",
    actions: ["OK"],
    torq: "shrugging",
  },
  signInFailed: { title: "Couldn't sign you in", body: "That didn't go through. Try again.", actions: ["Try Again"] },
  checkEmail: { title: "Check your email", body: "Tap the link we sent to finish signing up.", actions: ["Resend"] },
  resetSent: {
    title: "Check your email",
    body: "If an account uses that email, a reset link is on its way.",
    actions: ["OK"],
  },
  linkExpired: {
    title: "Link expired",
    body: "That link is old or already used. Ask for a new one.",
    actions: ["Go Back"],
  },
  reauthNeeded: {
    title: "Confirm it's you",
    body: "Sign in again before deleting your account.",
    actions: ["Sign In"],
  },
  deleteAccount: {
    title: "Delete your account?",
    body: "This removes your profile, vehicles and mods. You can't undo this.",
    actions: ["Delete", "Cancel"],
    destructive: true,
  },
  // Free-plan limits. The paywall itself says when Dynorex+ can't be bought yet.
  planLimitVehicles: {
    title: "Free plan limit",
    body: "Free accounts hold 2 vehicles. Dynorex+ makes it unlimited.",
    actions: ["See Dynorex+"],
    torq: "upgrade",
  },
  planLimitMods: {
    title: "Free plan limit",
    body: "Free accounts hold 20 mods per vehicle. Dynorex+ makes it unlimited.",
    actions: ["See Dynorex+"],
    torq: "upgrade",
  },
  photoRejected: {
    title: "Photo not accepted",
    body: "Use a JPG, PNG or WebP photo. We remove location data before upload.",
    actions: ["OK"],
  },
  confirmBlock: {
    title: "Block this person?",
    body: "You won't see their content and they won't see yours. They aren't told.",
    actions: ["Block", "Cancel"],
    destructive: true,
  },
  usernameTaken: { title: "Name taken", body: "Someone already has that username. Try another.", actions: ["OK"] },
  verifyFirst: { title: "Verify your email", body: "Confirm your email before you post or report.", actions: ["OK"] },
  saveFailed: { title: "Couldn't save", body: "Nothing changed on our side. Try again.", actions: ["Retry"] },

  // ---- Phase 4 additions
  buildGone: {
    title: "This build no longer exists",
    body: "The owner deleted it.",
    actions: ["Go Back"],
    torq: "shrugging",
  },
  notShareable: {
    title: "Can't share this yet",
    body: "Only public builds can be shared. Make it public first.",
    actions: ["OK"],
  },
  signInRequired: { title: "Sign in first", body: "You need an account for that.", actions: ["Sign In"] },
  // ---- Phase 5 additions
  purchasePending: {
    title: "Confirming your purchase",
    body: "The store took payment. We're still confirming it, so check again in a minute.",
    actions: ["Check Again"],
  },
  demoOnly: {
    title: "Off in pitch mode",
    body: "This needs a real account. Pitch mode runs on sample data.",
    actions: ["OK"],
    torq: "shrugging",
  },
  // ---- Phase 7 additions (Line, Paddock)
  planLimitRoutes: {
    title: "Free plan limit",
    body: "Free accounts record 5 drives a month. Dynorex+ makes it unlimited.",
    actions: ["See Dynorex+"],
    torq: "upgrade",
  },
  routeTooShort: {
    title: "Too short to share",
    body: "Shared drives hide the first and last half kilometre. Record a longer one to share it.",
    actions: ["OK"],
  },
  invalidRoute: { title: "Drive looks off", body: "The GPS track had gaps or jumps we can't save.", actions: ["OK"] },
  eventFull: { title: "Event is full", body: "Mark yourself as interested to hear about changes.", actions: ["OK"] },
  eventClosed: { title: "Event closed", body: "It was cancelled or it's already over.", actions: ["OK"] },
  eventInPast: { title: "Pick a future time", body: "Events have to start later than now.", actions: ["OK"] },
  checkinClosed: {
    title: "Check-in isn't open",
    body: "It opens an hour before the start and closes at the end.",
    actions: ["OK"],
  },
  rsvpRequired: { title: "RSVP first", body: "Tap Going before you check in.", actions: ["OK"] },
  discardDrive: {
    title: "Discard this drive?",
    body: "It isn't saved anywhere else. You can't undo this.",
    actions: ["Discard", "Cancel"],
    destructive: true,
  },
  deleteRoute: {
    title: "Delete this drive?",
    body: "Gone for good, including its ratings.",
    actions: ["Delete", "Cancel"],
    destructive: true,
  },
  cancelEvent: {
    title: "Cancel this event?",
    body: "Everyone who said they're coming gets told. You can't undo this.",
    actions: ["Cancel Event", "Keep It"],
    destructive: true,
  },
  invalidCode: {
    title: "Code didn't work",
    body: "Codes change every 90 seconds. Ask for the current one.",
    actions: ["Try Again"],
  },
  // Phase 7b (Paddock community, group drives)
  clubNameTaken: { title: "Name already taken", body: "Clubs need a unique name. Try another.", actions: ["OK"] },
  ownerCannotLeave: {
    title: "You run this club",
    body: "Owners can't leave. Delete the club instead.",
    actions: ["OK"],
  },
  routeNotPublic: {
    title: "Route isn't shared",
    body: "Group drives can only follow a shared route.",
    actions: ["OK"],
  },
  clubMemberRequired: { title: "Join first", body: "Only members can post or host in this club.", actions: ["OK"] },
  scanUnavailable: {
    title: "Camera unavailable",
    body: "Type the 6-digit code instead.",
    actions: ["OK"],
  },
  wrongQr: {
    title: "Not this event's code",
    body: "Scan the code the host is showing for this event.",
    actions: ["Try Again"],
  },
  deletePost: {
    title: "Delete this post?",
    body: "Its comments and likes go with it.",
    actions: ["Delete", "Cancel"],
    destructive: true,
  },
  deleteClub: {
    title: "Delete this club?",
    body: "Members lose access to its posts. You can't undo this.",
    actions: ["Delete", "Cancel"],
    destructive: true,
  },
  // Shop (D-56)
  planLimitListings: {
    title: "Listing limit reached",
    body: "Free sellers can have 5 listings up at once. Mark one sold or delete it, or go Dynorex+ for 25.",
    actions: ["OK"],
  },
  ownListing: { title: "That's your listing", body: "You can't make an offer on your own part.", actions: ["OK"] },
  listingUnavailable: {
    title: "Not taking offers",
    body: "This part is on hold or sold. Check back if it comes back up.",
    actions: ["OK"],
  },
  offerExists: {
    title: "You already offered",
    body: "Withdraw your current offer first if you want to change it.",
    actions: ["OK"],
  },
  offerClosed: { title: "Offer closed", body: "This offer was already answered or withdrawn.", actions: ["OK"] },
  acceptAnOffer: {
    title: "Accept an offer",
    body: "A listing goes on hold when you accept an offer.",
    actions: ["OK"],
  },
  deleteListing: {
    title: "Delete this listing?",
    body: "Open offers are declined and the chats close. You can't undo this.",
    actions: ["Delete", "Cancel"],
    destructive: true,
  },
  // D-58
  driveNotLive: {
    title: "Live map isn't open",
    body: "It opens 30 minutes before the drive for the host and people going, and closes 30 minutes after it ends.",
    actions: ["OK"],
  },
  notInRoom: {
    title: "Join to chat",
    body: "Event chat is for the host and people who RSVP. Club chat is for members.",
    actions: ["OK"],
  },
  clubPrivate: { title: "Invite-only club", body: "Ask to join and a club admin will let you in.", actions: ["OK"] },
  // D-61
  eventPhotoClosed: {
    title: "Can't add photos here",
    body: "The host and people who went can add photos, from an hour before the meet until a week after it.",
    actions: ["OK"],
  },
  historyGone: {
    title: "Link no longer works",
    body: "The owner turned it off or made a new one, or it expired after 90 days. Ask them for a fresh link.",
    actions: ["OK"],
  },
  // D-64: Build Record
  vehicleSold: {
    title: "This car was sold",
    body: "You handed its record to the buyer, so your copy is read-only.",
    actions: ["OK"],
  },
  inheritedEntry: {
    title: "Earlier owner's work",
    body: "Entries from a previous owner stay as they were logged. You can add your own.",
    actions: ["OK"],
  },
  vinLocked: {
    title: "VIN is locked",
    body: "A buyer's link or transfer code exists for this car, so its VIN can't change. Contact support if it's wrong.",
    actions: ["OK"],
  },
  vinRequired: {
    title: "Add the VIN first",
    body: "The buyer proves they have the car by typing its VIN. Add it on the vehicle's edit screen.",
    actions: ["OK"],
  },
  emissionsConfirm: {
    title: "Not for emissions parts",
    body: "Shops aren't asked to confirm emissions-related work without a CARB EO number, to protect them.",
    actions: ["OK"],
  },
  notFinished: {
    title: "Not finished yet",
    body: "Mark the mod Complete first. Plans aren't on the record.",
    actions: ["OK"],
  },
  alreadyConfirmed: {
    title: "Already confirmed",
    body: "The shop has confirmed this version of the entry.",
    actions: ["OK"],
  },
  deleteMaintenance: {
    title: "Delete this record?",
    body: "Its reminder goes too. You can't undo this.",
    actions: ["Delete", "Cancel"],
    destructive: true,
  },
  // Services (D-57)
  businessNameTaken: {
    title: "Name already taken",
    body: "Another business uses that name. Try another.",
    actions: ["OK"],
  },
  businessExists: { title: "Page already exists", body: "Each account runs one business page.", actions: ["OK"] },
  serviceLimit: {
    title: "Service limit reached",
    body: "A business page can list up to 30 services.",
    actions: ["OK"],
  },
  ownBusiness: { title: "That's your business", body: "You can't send a request to yourself.", actions: ["OK"] },
  requestExists: {
    title: "Already requested",
    body: "You have an open request for this service. Continue in its chat.",
    actions: ["OK"],
  },
  requestClosed: { title: "Request closed", body: "This request was already answered or closed.", actions: ["OK"] },
  deleteBusiness: {
    title: "Delete your business page?",
    body: "Your services come down and open requests are cancelled. You can't undo this.",
    actions: ["Delete", "Cancel"],
    destructive: true,
  },
  // not destructive, so the confirm button is lime
  confirmPublish: {
    title: "Go public",
    body: "Anyone with the link can see it, and it can show up in Discover and search. Your VIN, odometer, costs and notes stay private.",
    actions: ["Make Public", "Cancel"],
  },
} as const satisfies Record<string, ErrorCopy>;

export type ErrorKey = keyof typeof ERROR_COPY;
