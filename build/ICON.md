# Anexus app icon

The app icon uses the user-provided `app_icon.png` at the project root.
macOS `sips` and `iconutil` resize and encode the supplied image.

- Source: `../app_icon.png` (1254 × 1254 pixels).
- Preview: `icon.png` (1024 × 1024 pixels).
- Packaged icon: `icon.icns` (16–1024 pixels, including Retina sizes).
- Rebuild: `npm run build:icon`; `npm run app` and `npm run dist` also rebuild it.
