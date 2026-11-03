# Deep links and the web fallback

Every shareable screen has a stable URL on `https://dynorex.app` (see the table in `architecture.md`).
The same paths work from share sheets, push notifications, QR codes and a browser.

## What is done in the app

- Production builds declare `applinks:dynorex.app` (iOS) and an auto-verified `https://dynorex.app` intent
  filter (Android) in `app.config.ts`. Dev and staging builds use the `dynorex://` scheme only.
- Public pages (`/u/…`, `/build/…`, `/v/…`) sit outside the sign-in gates. Opening one, or `/discover`, while
  signed out starts guest mode instead of the welcome screen (launch link only).
- Every public page re-asks the server on load. Private, hidden, blocked and missing builds all show the same
  "Build not found"; a build that was public and then deleted shows "This build no longer exists".
- Web: the same routes render in a browser (`npx expo export --platform web`). A "Get the Dynorex app" banner
  appears only when `EXPO_PUBLIC_APP_STORE_URL` / `EXPO_PUBLIC_PLAY_STORE_URL` are set.

## What the owner still has to do (needs B-03 accounts)

Host these two files on `https://dynorex.app` over HTTPS with `Content-Type: application/json`, no redirects.
Replace the placeholders; **do not publish them with placeholders in**.

`/.well-known/apple-app-site-association` (no file extension):

```json
{
  "applinks": {
    "details": [
      {
        "appIDs": ["<APPLE_TEAM_ID>.app.dynorex"],
        "components": [
          { "/": "/discover*" },
          { "/": "/u/*" },
          { "/": "/v/*" },
          { "/": "/build/*" },
          { "/": "/settings/subscription" }
        ]
      }
    ]
  }
}
```

`/.well-known/assetlinks.json`:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "app.dynorex",
      "sha256_cert_fingerprints": ["<PLAY_APP_SIGNING_SHA256>"]
    }
  }
]
```

The Android fingerprint is the **Play App Signing** certificate (Play Console > App integrity), not the upload
key. Verify afterwards with Apple's AASA validator and `adb shell pm get-app-links app.dynorex`.

## QR codes

Point car-meet QR codes at `https://dynorex.app/discover` (event pages arrive with Paddock in v2).
