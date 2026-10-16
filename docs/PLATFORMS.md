# Platformen: wat werkt, wat getest is

| Platform | Aanpak | Stand |
|---|---|---|
| Web (alle browsers) | Vite-app in `app/`, PWA-manifest, Wake Lock | Gebouwd en in Chromium getest (4 schermformaten, sneltoetsen). |
| iPhone / iPad | Zelfde webapp, "Zet op beginscherm" (PWA, iOS-meta staat erin) | Niet op een echt toestel getest. |
| Windows | Tauri 2-schil (`src-tauri/`), bouwt met `.github/workflows/desktop.yml` op een Windows-runner | **Niet gebouwd of gedraaid.** Workflow en config zijn geschreven, de eerste run kan kleine fixes nodig hebben. |
| macOS | Zelfde Tauri-schil, universele build (Apple Silicon en Intel) | **Niet gebouwd of gedraaid.** Niet ondertekend: zonder Apple Developer-account vraagt macOS bij het openen om bevestiging. |
| Linux (bonus) | Zelfde schil | `cargo check` slaagt hier (config, rechten, iconen en CSP worden dus door Tauri gelezen). Het venster is niet geopend (geen scherm in deze omgeving). |
| iOS / Mac native (SwiftUI) | `swift/`: alleen Dashy zelf (`DashyCore`, `DashyUI`) | Het dashboard is **niet** naar SwiftUI geport. |

## De desktop-schil
- Het is dezelfde webapp (`dist-app`) in de web view van het besturingssysteem. Alle gedrag zit in de webapp, de schil opent alleen een venster, zonder bestands-, shell- of OS-rechten (`capabilities/default.json` is leeg).
- **Eerste start:** er is geen link om te openen, dus de app toont een formulier "Dashy koppelen" (site, leessleutel, actiesleutel). De waarden blijven op dat apparaat (`localStorage`).
- **API:** de schil draait op `tauri://localhost` (Windows: `http://tauri.localhost`) en roept de API van je Vercel-site aan. Daarom staan die twee origins standaard in de CORS-lijst van `/api/dashy-state` en `/api/dashy-action`; extra origins kun je met `DASHY_ALLOWED_ORIGINS` (komma's) toevoegen. Elke andere origin krijgt geen CORS-headers. De sleutels gaan in een header, nooit in een cookie.
- **Spotify** werkt niet in de schil (Spotify accepteert `tauri://localhost` niet als redirect). Gebruik daarvoor de webapp of de PWA.
- **Sneltoetsen** werken in de schil zoals in de browser.

## Bouwen
```bash
npm run desktop:dev      # venster met de dev-server (vereist Rust en de platformbibliotheken van Tauri)
npm run desktop:build    # installer voor het eigen platform
npm run desktop:icons    # iconen opnieuw maken uit app/public/icons/icon-512.png
```
Op Linux zijn `libwebkit2gtk-4.1-dev` en `libgtk-3-dev` nodig. Voor Windows en macOS: gebruik de GitHub-workflow (Actions, "desktop", Run workflow); de installers komen als conceptrelease.

## Nog te doen voor desktop
- Eerste echte build en test op Windows en macOS, ondertekenen (Windows-certificaat, Apple Developer), automatisch updaten.
- Menubalk-icoon of widget, starten bij inloggen, altijd-bovenop-venster: nuttig voor een dashboard naast je werk, nog niet gebouwd.
