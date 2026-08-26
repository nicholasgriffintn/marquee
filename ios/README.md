# Marquee for iOS

The iOS app is a native SwiftUI client for the Marquee app.

## Run it

1. Open `Marquee.xcodeproj` in Xcode.
2. Select a development team for the `Marquee` target and run it on an iPhone or simulator.

The checked-in configuration uses `https://marquee.pashi.app`. Change `MARQUEE_API_BASE_URL` in
`Info.plist` for another deployment. Keep the `marquee` URL scheme: it is the allow-listed OAuth
return path.
