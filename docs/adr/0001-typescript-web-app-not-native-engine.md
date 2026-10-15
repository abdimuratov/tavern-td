# TypeScript + PixiJS web app instead of a native engine

The game is a TypeScript web app rendered with PixiJS 8. On iPhone it's installed from Safari via Add to Home Screen. On Mac it's installed via Add to Dock or Chrome's "Install app". On Android it's wrapped with Capacitor 8 into an APK for Android 16+ and installed over USB. Godot 4.7 was already installed and was seriously considered. It lost for three reasons:

- Godot C# has no web export.
- Godot's GDScript web export has known WebGL2 and download-size problems on Safari.
- Any native iPhone build without the paid Apple program stops working every 7 days.

A web app is the only route that installs free and permanently on all three platforms. It also lets the game logic run in fast headless tests.

## Consequences

The game inherits the limits of iPhone web apps:
- There is no orientation lock, so the game shows a "rotate your phone" screen when held upright.
- It can't vibrate.
- Audio is muted by the silent switch unless `navigator.audioSession.type` is set.
- The game must be served over HTTPS. It is published to GitHub Pages from a public repo.

Native store builds stay possible later through Capacitor.
