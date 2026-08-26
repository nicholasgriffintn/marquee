# Marquee for iOS

The iOS app is a native SwiftUI client for the existing Marquee Worker API. It deliberately keeps
the web app as the source of truth for catalogue, profile, recommendation and notebook behaviour.

## What is included

- **Tonight** — personalised rails, the evening schedule, trending titles, curator requests and the
  Usher's single pick.
- **Listings** — catalogue search, film/series filtering, sorting and pagination.
- **Revival house** — the daily bill, programme shelves, native playback and signed-in progress.
- **My shelf** — filters, ratings, notes, status changes and removal.
- **This week** — the viewer's current digest and schedule.
- **Notebook** — beliefs, services, guests, alert preferences and private feeds.
- **Title panels** — watch links, sources and signed-in shelf editing.

The app targets iOS 18 and has no third-party dependencies.

## Run it

1. Apply the Worker migrations, including `0057_native_auth.sql`.
2. Deploy the Worker changes. The existing GitHub callback URL does not change.
3. Open `Marquee.xcodeproj` in Xcode.
4. Select a development team for the `Marquee` target and run it on an iPhone or simulator.

The checked-in configuration uses `https://marquee.pashi.app`. Change `MARQUEE_API_BASE_URL` in
`Info.plist` for another deployment. Keep the `marquee` URL scheme: it is the allow-listed OAuth
return path.

## Authentication

GitHub sign-in runs in `ASWebAuthenticationSession`. The Worker returns a short-lived, single-use
code to `marquee://auth/callback`; the app exchanges it for an API token and stores that token in the
Keychain with device-only accessibility. Signing out revokes the token on the Worker and removes the
local Keychain item.

Run the app against HTTPS outside local development. Do not add bearer tokens, OAuth codes or viewer
payloads to application logs.
