# Tech platforms for a 2D tower defense (macOS + iPhone + Android, no app stores)

Researched 2026-10-15. Constraints: one hobby developer; this Mac has Node 26, pnpm 11, bun, Godot 4.7.2 mono (.NET 8), and **Xcode Command Line Tools only (no full Xcode)**.

Platform note: **iOS/iPadOS 27 / Safari 27.0 is now current.** WebKit's "WebKit Features for Safari 27.0" post is dated 2026-09-17 ([WebKit](https://webkit.org/blog/18325/webkit-features-for-safari-27-0/)). The Home Screen web app behaviour below arrived in iOS 26. The only PWA item firt.dev lists as new in 27.0 is Service Worker static routing ([firt.dev iOS PWA notes, updated 2026-10-13](https://firt.dev/notes/pwa-ios/)).

Legend: **[verified]** means a primary source was read. **[uncertain]** means secondary sources only, conflicting reports, or something to test on a device.

---

## 1. PWA on iOS/iPadOS 26–27

| Topic | Finding |
|---|---|
| Add to Home Screen | Since iOS 26, **every site added to the Home Screen opens as a web app by default**, manifest or not. The user can switch off "Open as Web App" in the dialog. Manifest icons are still used, and service-worker offline still works [verified] ([WebKit WWDC25](https://webkit.org/blog/16993/news-from-wwdc25-web-technology-coming-this-fall-in-safari-26-beta/)). There is no programmatic install prompt: the user goes through Share → Add to Home Screen. |
| Display modes | `standalone` is supported. `fullscreen` falls back to `standalone` and `minimal-ui` falls back to `browser`. `apple-mobile-web-app-status-bar-style=black-translucent` is still "the only way to get a fullscreen app" ([firt.dev](https://firt.dev/notes/pwa-ios/)). |
| Offline | Service Worker and Cache Storage have been supported since 11.3. Background Sync and Background Fetch are not supported ([firt.dev](https://firt.dev/notes/pwa-ios/)). Service workers need HTTPS, so the game has to be hosted somewhere (GitHub/Cloudflare Pages etc.); a LAN `http://` URL will not work. |
| Storage quota | A Home Screen or Dock web app gets the same quotas as the browser: up to **60% of disk per origin** and 80% overall. Eviction is per-origin LRU under storage pressure, or after an origin goes unused for a while. `navigator.storage.persist()` is granted "based on heuristics", with Home Screen web app status given as an example [verified] ([WebKit storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/)). Home Screen apps "have their own counter of days of use", and WebKit does "not expect the first-party in such a web application to have its website data deleted" by the 7-day ITP rule [verified] ([WebKit 2020](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/)). Storage is **not shared** with Safari ([firt.dev](https://firt.dev/notes/pwa-ios/)). **Conclusion:** IndexedDB saves are fine. Call `persist()`, and offer save export/import as a backup. |
| Web Audio | AudioContext is available. It must be resumed inside a user gesture. By default Web Audio counts as "ambient" and is **muted by the silent switch**. Setting `navigator.audioSession.type = 'playback'` (Safari 16.4+) is the fix [verified for the API's existence: [MDN BCD](https://github.com/mdn/browser-compat-data/blob/main/api/Navigator.json); behaviour per [WebKit bug 237322](https://bugs.webkit.org/show_bug.cgi?id=237322), where a WebKit engineer says the default type is `ambient`, so audio is muted when the phone is muted]. |
| WebGL2 / WebGPU | WebGL2 has been solid for years. **WebGPU shipped in Safari 26** on macOS, iOS and iPadOS [verified] ([WebKit WWDC25](https://webkit.org/blog/16993/news-from-wwdc25-web-technology-coming-this-fall-in-safari-26-beta/); [BCD](https://github.com/mdn/browser-compat-data/blob/main/api/Navigator.json): `gpu` safari 26). |
| Performance | A few hundred sprites plus particles is a light load for any batched WebGL2 renderer on a recent iPhone. This is engineering judgement rather than a benchmark; the risk sits in overdraw, filters and huge textures, not in the sprite count. Phaser 4 notes up to 16x speedups on filter-bound mobile scenes ([Phaser releases](https://github.com/phaserjs/phaser/releases)). |
| Orientation lock | **Not available.** `screen.orientation.lock()` has `version_added: false` in Safari and iOS ([BCD](https://github.com/mdn/browser-compat-data/blob/main/api/ScreenOrientation.json)), and the manifest `orientation` field is ignored on iOS ([firt.dev](https://firt.dev/notes/pwa-ios/)). The game has to handle both orientations or show a "rotate device" overlay. Chrome on Android supports `lock()`. |
| Safe areas / notch | Use `viewport-fit=cover` plus `env(safe-area-inset-*)` (supported). [uncertain] WebKit [bug 316008](https://bugs.webkit.org/show_bug.cgi?id=316008) (June 2026): `100vh`/`lvh` are wrong in standalone apps installed **without** `black-translucent`, and the meta tag must be present at install time. Size the canvas from `visualViewport` or `innerHeight` in JS and avoid vh units. |
| Fullscreen API | iPad only. Not available on iPhone ([BCD](https://github.com/mdn/browser-compat-data/blob/main/api/Element.json)). Standalone mode is the substitute. |
| Vibration / haptics | `navigator.vibrate` is **not supported** in Safari ([BCD](https://github.com/mdn/browser-compat-data/blob/main/api/Navigator.json)). The `<input type=checkbox switch>` haptic hack (`ios-haptics` on npm) is unofficial and reportedly patched in iOS 26.5 [uncertain] ([azukiazusa.dev](https://azukiazusa.dev/en/blog/ios-safari-web-haptics)). Treat haptics as Android-only. |
| Wake Lock | Works in standalone Home Screen apps since iOS 18.4 ([BCD](https://github.com/mdn/browser-compat-data/blob/main/api/Navigator.json)). |
| EU | In iOS 17.4 beta (Feb 2024) Apple removed Home Screen web apps in the EU, then **reversed** that before release. They remain WebKit-based ([The Register, 2024-03-02](https://www.theregister.com/2024/03/02/apple_reverses_pwa_decision/); [9to5Mac](https://9to5mac.com/2024/02/15/ios-17-4-web-apps-european-union/)). No 2026 re-removal was found. Apple's current DMA page doesn't mention web apps ([Apple DMA](https://developer.apple.com/support/dma-and-apps-in-the-eu/)). [uncertain: absence of evidence] |
| Debugging | You can inspect an iPhone Home Screen app from Safari's Develop menu on the Mac. No Xcode is needed. |

## 2. macOS

- **Safari "Add to Dock"** (macOS Sonoma 14+): any page becomes a Dock or Spotlight app in `~/Applications`, with its own cookies and storage ([Apple Support](https://support.apple.com/en-au/104996)). On Mac it "always opens as a web app" regardless of manifest ([WebKit](https://webkit.org/blog/16993/news-from-wwdc25-web-technology-coming-this-fall-in-safari-26-beta/)). This costs nothing.
- **Chrome** desktop PWA install uses the menu "Install app"; only the install *prompt* still needs a fetch handler ([Chrome blog](https://developer.chrome.com/blog/update-install-criteria)).
- **Native `.app` wrapper:**

| | Tauri 2 (`@tauri-apps/cli` 2.12.3, 2026-10-14) | Electron 44.7.2 (2026-10-14) |
|---|---|---|
| Engine | System WKWebView (same as Safari, so WebGPU/WebGL behave identically) | Bundled Chromium + Node |
| Bundle size | single-digit MB (≈3 MB hello-world) [uncertain, blog benchmarks] | ≈85 MB+ hello-world, >150 MB real apps [uncertain] ([tech-insider](https://tech-insider.org/tauri-vs-electron-2026/), [Better Stack](https://betterstack.com/community/guides/scaling-nodejs/tauri-vs-electron-vs-deno-vs-electrobun/)) |
| Toolchain | Rust (`rustup`). For desktop-only, **Command Line Tools suffice**; iOS needs full Xcode ([Tauri prereqs](https://v2.tauri.app/start/prerequisites/)) | Node only |
| Effort | Low for a static web game (`tauri init` pointing at `dist/`) | Low |

For personal use, a locally built `.app` doesn't need notarization. Distributing it to other Macs without Gatekeeper warnings needs the $99 program.

## 3. Android

- **Chrome PWA install** produces a WebAPK, a real launcher app with no "unknown sources" step ([web.dev](https://web.dev/learn/pwa/installation)). Manifest `orientation`, `navigator.vibrate` and Fullscreen all work. This is the lowest-friction path.
- **TWA via Bubblewrap** (`@bubblewrap/cli` 1.27.0): wraps the *hosted* PWA. It offers to auto-install JDK 17 and the Android CLI tools, outputs a signed APK and an AAB, `bubblewrap install` pushes the app over adb, and it needs `assetlinks.json` to hide the URL bar ([Bubblewrap CLI](https://github.com/GoogleChromeLabs/bubblewrap/tree/main/packages/cli)).
- **Capacitor 8** (8.5.3; 9.0 is in alpha): bundles assets **inside** the APK (offline without hosting) and gives native plugins such as haptics and orientation. It requires Android Studio 2025.2.1+ ([Capacitor env setup](https://capacitorjs.com/docs/getting-started/environment-setup)).
- **Sideloading in 2026–27 (important):** Android developer verification enforcement began **2026-09-30** for listed stores in Brazil, Indonesia, Singapore and Thailand, and expands to "all regions and app installations" in **2027**. Two exemptions matter here. **adb installs are exempt** ("Apps installed using ADB won't require verification"). A free **Limited Distribution account** covers up to 20 devices with no ID and no fee. Other users can install unregistered APKs after a one-time 24-hour "advanced flow" ([Android FAQ](https://developer.android.com/developer-verification/guides/faq?hl=en)). [uncertain] Whether WebAPKs minted by Chrome are affected is not addressed (they are Google-signed, so likely not).

## 4. Native iOS (Capacitor, Godot, Tauri, Defold, anything)

- **Full Xcode is required** for every route: Capacitor 8 needs Xcode 26.0+ ([Capacitor](https://capacitorjs.com/docs/getting-started/environment-setup)), Godot needs "macOS with Xcode installed" ([Godot iOS](https://docs.godotengine.org/en/4.7/tutorials/export/exporting_for_ios.html)), and Tauri says "Xcode and not Xcode Command Line Tools" ([Tauri](https://v2.tauri.app/start/prerequisites/)). Defold can bundle without Xcode, but the free-profile route still uses Xcode to mint the profile ([Defold iOS](https://defold.com/manuals/ios/)). **This Mac currently can't build any native iOS app.**
- **Free Apple Account (Personal Team):** "up to 3 devices", "up to 10 App IDs, which expire after 7 days", "up to 3 apps per device", and "Provisioning profiles … expire 7 days from issuance. You'll need to rebuild and reinstall" [verified] ([Apple compare memberships](https://developer.apple.com/support/compare-memberships/)).
- **Apple Developer Program: $99/year** ([Apple](https://developer.apple.com/programs/)). Profiles last a year, ad hoc distribution to registered devices is allowed, and you get TestFlight: up to 100 internal and 10,000 external testers, with external builds needing beta App Review ([TestFlight](https://developer.apple.com/testflight/)). Each build expires after **90 days** ([App Store Connect help](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/)).
- EU "Web Distribution" of notarized apps exists but needs the paid program and Apple's eligibility terms; it is not a hobby path ([Apple DMA](https://developer.apple.com/support/dma-and-apps-in-the-eu/)). AltStore/SideStore-style 7-day re-signing with a free Apple ID exists, but these are third-party tools [not evaluated].

## 5. Godot 4.7 (4.7-stable 2026-06-18; 4.7.2 2026-08-18; 4.8 in dev)

| Target | GDScript | C# (.NET) |
|---|---|---|
| macOS | Yes | Yes |
| Android | Yes. Needs JDK 17 + Android SDK/NDK (Android Studio optional). One-click deploy over USB ([Android export](https://docs.godotengine.org/en/4.7/tutorials/export/exporting_for_android.html), [one-click](https://docs.godotengine.org/en/4.7/tutorials/export/one-click_deploy.html)) | **"Experimental"** ([C# docs 4.7](https://docs.godotengine.org/en/4.7/tutorials/scripting/c_sharp/index.html)) |
| iOS | Yes. Exports an Xcode project; full Xcode is required (one-click deploy also needs Xcode) | **"Experimental and has a few limitations"**, export only from macOS ([C# docs](https://docs.godotengine.org/en/4.7/tutorials/scripting/c_sharp/index.html)) |
| Web | Yes. Compatibility renderer, **WebGL2 only**, no WebGPU yet | **No.** "Projects written in C# … cannot be exported to the web" ([Web export 4.7](https://docs.godotengine.org/en/4.7/tutorials/export/exporting_for_web.html)). A prototype was shown in May 2025 with no timeline ([Godot blog](https://godotengine.org/article/live-from-godotcon-boston-web-dotnet-prototype/)), and nothing in the 4.8 dev notes found [uncertain] |

Web export details ([Godot 4.7 web docs](https://docs.godotengine.org/en/4.7/tutorials/export/exporting_for_web.html)):
- Single-threaded export has been the default since 4.3. It needs no COOP/COEP headers and "works very well on macOS and iOS too".
- The docs still warn that "Safari has several issues with WebGL 2.0".
- Audio defaults to Web Audio "samples" mode, which has low latency but no audio effects.
- There is a built-in **PWA option** with offline service worker, icons and orientation (orientation is ignored on iOS).
- Forum reports from 4.3–4.4 describe iOS crashes with large assets and WebGL context loss [uncertain, older] ([forum](https://forum.godotengine.org/t/godot-4-4-1-html-exports-resets-crashes-when-playing-on-mobile-browsers/114247)).
- Download size is much larger than a JS bundle (multi-MB WASM).

New in 4.7 and relevant here: a built-in `VirtualJoystick` node and C# hot-reload ([4.7 release page](https://godotengine.org/releases/4.7/)).

Testing: GUT 9.7.1 has a Godot 4.7 branch ([GUT](https://github.com/bitwes/Gut)), gdUnit4 is at v6.2.2 (2026-10-07), and both run with `godot --headless`. Plain C# logic can be unit-tested with `dotnet test` without the engine.

## 6. Web 2D libraries (npm, checked 2026-10-15)

| Library | Version (date) | Status | Fit for a TD |
|---|---|---|---|
| **PixiJS** | 8.22.0 (2026-10-01) | Very active, releasing every 2–3 weeks; TS-native; TS 6/7 support added in 8.21 ([releases](https://github.com/pixijs/pixijs/releases)). Docs: WebGL "Recommended", WebGPU "Experimental" ([renderers](https://pixijs.com/8.x/guides/components/renderers)) | Renderer only (no physics, scenes or audio). `ParticleContainer` for particles, federated pointer events cover touch and mouse. Pairs well with a pure-TS simulation core, which gives the **best testability** |
| **Phaser** | 4.2.1 (2026-07-09); 4.0.0 shipped 2026-04-10 | Full framework, new WebGL renderer, `SpriteGPULayer`, bundled TS types ([releases](https://github.com/phaserjs/phaser/releases)) | Batteries included: scenes, tweens, input, audio with mobile unlock, particles, tilemaps. Fastest path to "a game", but logic tends to end up coupled to Scene objects |
| **Excalibur** | 0.32.0 (2025-12-23), 0.33 alphas | TS-first, pre-1.0, no 1.0 date ([releases](https://github.com/excaliburjs/Excalibur/releases)) | Nice API; smaller community; slower cadence |
| **KAPLAY** | 3001.0.19 (2025-06-15) stable; 4000 alpha.27.1 (2026-05-12) | Stable line is stale and v4000 is still alpha ([releases](https://github.com/kaplayjs/kaplay/releases)) | Fine for jams; riskier long-term |
| LittleJS | 1.27.0 (2026-10-09) | Tiny, fast, active (npm `littlejsengine`) | Minimalist; less tooling [not evaluated in depth] |

**Pick for a TD:** use a **PixiJS 8** renderer over a framework-free, deterministic TS simulation (vitest 5 for tests, Vite for HMR). Choose Phaser 4 instead if you want built-in scenes, audio and tweens and accept tighter coupling. Default both to WebGL; WebGPU is optional.

## 7. Other candidates (brief)

- **Defold 1.14.0** (2026-10-12): Lua, small and excellent HTML5 builds, strong mobile focus. iOS bundling can skip Xcode with a paid profile, but free profiles still come from Xcode ([Defold iOS](https://defold.com/manuals/ios/)). It's a solid option, but it means learning a new language and editor.
- **Bevy 0.20** (crates.io, Oct 2026): Rust ECS with web via WASM. iOS and Android work, but mobile is still DIY (backends became opt-in in 0.19) ([bevy_android](https://docs.rs/bevy_android)). Too much friction for this goal.
- **Flutter + Flame 1.38.2** (2026-08-27): fine on Android and iOS native (Xcode still needed); Flutter web is heavier and slower than a canvas engine. Not compelling here.

---

## Recommendation matrix

| Criterion | (a) TypeScript web stack as PWA (+ optional Tauri/Capacitor/TWA) | (b) Godot 4.7 GDScript | (c) Godot 4.7 C# |
|---|---|---|---|
| **Install: macOS** | Safari Add to Dock / Chrome install: zero friction. Tauri `.app` with CLT only | Native `.app` export, easy | Native `.app` export, easy |
| **Install: iPhone (no store, no Xcode)** | **Add to Home Screen: works today, no Apple account** | Web export → PWA (works, but WebGL2-on-Safari and WASM-size risks). Native needs Xcode plus free 7-day or $99 profile | **No web export → only native**: Xcode plus 7-day re-signing or $99. iOS C# is "experimental" |
| **Install: Android** | Chrome PWA install (WebAPK), zero friction; optional TWA/Capacitor APK via adb | APK export + one-click USB deploy (needs JDK 17 + SDK) | Same as (b), but C# Android is "experimental" |
| **Iteration speed** | Vite HMR in a browser; test on a phone by reloading the hosted URL; Safari remote inspector | Fast editor loop; mobile web needs an export each time | Fast editor loop plus C# hot-reload (4.7); mobile requires native builds |
| **Headless logic tests** | **Best**: vitest on a pure-TS sim in ms, CI-trivial | Good: GUT/gdUnit4 via `godot --headless` (engine boot per run) | Very good: `dotnet test` on engine-free C#; engine-bound code via gdUnit4Net |
| **Performance (hundreds of sprites)** | Ample with WebGL2 batching (Pixi/Phaser); WebGPU available as an extra | Native: excellent. Web: WASM single-thread, OK for 2D | Native: excellent. Web: n/a |
| **Long-term store option** | Capacitor (iOS/Android) or TWA (Play); Tauri also has mobile. All need Xcode for iOS | Strong: native exports for all stores | Strong once C# mobile matures; web/itch.io blocked until C# web ships |
| **Main risks** | iOS gaps: no orientation lock, no vibration, silent-switch audio, standalone viewport bug. Hosting over HTTPS required | Safari WebGL2 quirks and big downloads for the iPhone-PWA route; GDScript-only ecosystem | Blocks the no-Xcode iPhone path entirely; two experimental mobile targets |

**Bottom line:** given "no app stores" and no full Xcode, **(a) TypeScript + PixiJS (or Phaser 4) as a PWA** is the only option that installs on all three platforms today without an Apple account or Xcode. Capacitor stays open as an exit to the stores. **(b) Godot GDScript** is the runner-up: it can also reach iPhone via a web-export PWA, but prototype that on a real iPhone early. **(c) Godot C#** is a poor fit right now because there is no web export and its mobile support is experimental.
