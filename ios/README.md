# Marquee for iOS

The iOS app is a native SwiftUI client for the Marquee app.

## Run it

1. Open `Marquee.xcodeproj` in Xcode.
2. Select a development team for the `Marquee` target and run it on an iPhone or simulator.

Debug builds use `http://localhost:8787` so the Simulator exercises the local Worker. Release
builds use `https://marquee.pashi.app`. Change the `MARQUEE_API_BASE_URL` build setting for another
deployment; a physical device needs a development origin it can reach. Keep the `marquee` URL
scheme: it is the allow-listed authentication return path.
