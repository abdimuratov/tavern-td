# Tavern TD

A single-player collection of tower defense Game Modes for Mac, iPhone and Android. See [docs/PLAN.md](docs/PLAN.md).

Play: https://abdimuratov.github.io/tavern-td/

## Develop

```sh
pnpm install
pnpm dev          # Vite dev server, also on your LAN
pnpm check        # typecheck, lint, unit tests, build
pnpm test:e2e     # Playwright: Mac Chrome, Mac Safari, iPhone and Android emulation
pnpm icons        # re-rasterise tools/icon.svg after editing it
```

Dev builds only: `?sandbox` skips the menu into the core's test Game Mode, and `?stress` plays the performance budget (300 creeps, 80 towers). `?fps` adds a frame-rate readout in any build.

## Install

- **Mac:** open the Play URL in Safari, then File → Add to Dock. Or in Chrome, ⋮ → Cast, save and share → Install page as app.
- **iPhone:** open the Play URL in Safari, then Share → Add to Home Screen.
- **Android (S24):** turn on USB debugging, connect by cable, and run `pnpm apk`.

`pnpm apk` needs `brew install openjdk@21` and `brew install --cask android-commandlinetools android-platform-tools`. On first run it installs the SDK packages and creates a signing keystore in `~/.config/tavern-td/`. **Back that folder up:** without it, a new APK can't update the installed app, and uninstalling wipes its saves.
