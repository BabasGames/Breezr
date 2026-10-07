# Breezr

The real Deezer web player in a desktop window, **vanilla+**: Discord Rich Presence
plus a few personal touches the official app doesn't offer — starting with fully
custom colors.

Breezr is a hard fork of [deezer-discord-rpc](https://github.com/CuteTenshii/deezer-discord-rpc)
by Tenshii (MIT). It installs side by side with it and keeps its own settings.

## Features

- Discord Rich Presence for tracks, albums, podcasts and radios
- Custom theme: pick an accent, background and text color, everything else is derived;
  an Advanced mode lets you override any single color
- Colour sources (optional): follow your desktop's palette live — [Caelestia](https://github.com/caelestia-dots),
  any pywal-format `colors.json` (pywal, wallust, matugen…), or the system accent colour
- Smooth cross-fade when colours change
- Settings window (`Ctrl+,` / `Cmd+,`, tray menu, or the ⚙ button)
- Available in 14 languages (follows Deezer's language by default)

## Build

```bash
bun install
bun run run      # dev
bun run build    # installers in dist/
bun test
```

## Translations

Initial translations were machine-generated. Corrections from native speakers are
very welcome — edit `src/locales/<code>.json` and open a pull request.

## License

MIT — see [LICENSE](LICENSE).
