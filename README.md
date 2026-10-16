# Dashy

Een levend avatar-figuurtje: een wit lijf met alleen ogen. Geen afhankelijkheden, ongeveer 250 regels simulatie.

## Snel starten

```bash
npm install
npm test        # 34 tests: grenzen, soepelheid, scenario's
npm run build   # dist/dashy.js, types en dist/demo.html (dubbelklikken om te proberen)
```

```ts
import { mountDashy } from 'dashy-avatar';

const dashy = mountDashy(document.getElementById('avatar')!, { shape: 'circle' });
dashy.setState('working');   // idle, received, working, thinking, waiting, blocked, done
dashy.setState('happy');     // happy, sad, angry, strict, dancing, sleepy
dashy.poke();                // schrikken (4x snel = boos)
dashy.destroy();
```

Het element waar je Dashy in zet bepaalt de grootte (vierkant, schaalt mee).

## Hoe het in elkaar zit

- `src/core.ts`: de simulatie. Geen DOM, geen timers. Je geeft de tijd mee via `step(now)` en krijgt geometrie terug (lijf, gezicht, twee ogen). Dit is het deel dat je naar andere platforms overzet.
- `src/svg.ts`: tekent die geometrie als SVG, volgt de muis, respecteert "minder beweging" en zet een leesbare tekst voor schermlezers.
- `tests/sim.test.ts`: dient tegelijk als specificatie. Een Swift- of Kotlin-port is klaar zodra dezelfde scenario's slagen.

Standaard zijn de ogen 34 x 55 (gulden snede). Voor 34 x 66: `createDashy({ eyeScale: 1 })`.

## Aansturen vanuit je app

Jouw app vertaalt gebeurtenissen naar een toestand. Voorbeeld:

| Gebeurtenis | Toestand |
|---|---|
| Nieuwe taak | `received` (gaat zelf door naar `working`) |
| Taak afgevinkt | `done` (valt na enkele seconden terug naar `idle`) |
| Wacht op jouw antwoord | `waiting` |
| Kan niet verder | `blocked` |
| Deadline dichtbij | `strict`, daarna `angry` |
| Uur niks gedaan | `sad` |
| Pauze | `sleepy` |

## Kleine formaten

Op 32 px en kleiner kiest Dashy automatisch een eenvoudiger tekening (`variant: 'auto'`): stilstaand lijf, bredere ogen, dikkere oogleden en een zwaardere rand. Alle beweging komt nog steeds uit `core.ts`. Forceren kan met `variant: 'small'` of `'full'`.

## Statische exports

`npm run export` maakt uit `core.ts` (via Chromium voor de PNG's) alles in `exports/`:

| Map | Inhoud |
|---|---|
| `svg/`, `svg/small/` | SVG per toestand (volle en kleine tekening) |
| `png/` | PNG per toestand, 512 en 128 px, transparant |
| `app-icon/` | 1024 px per toestand zonder transparantie (voor iOS en macOS) en `apple-touch-icon.png` (180 px) |
| `favicon/` | `favicon.svg`, `favicon.ico` (16, 32, 48) en per toestand 16 en 32 px |
| `docs/states.png` | overzicht van alle toestanden |

De achtergrondkleur van de app-iconen staat bovenaan `scripts/export-static.ts` (`ICON_BACKGROUND`). Een test controleert dat de SVG's in `exports/` overeenkomen met wat de generator nu maakt: pas je `core.ts` aan, draai dan `npm run export`.

![alle toestanden](exports/docs/states.png)

## Andere platforms

| Platform | Aanpak |
|---|---|
| Web | `mountDashy` zoals hierboven (of zet `core.ts` achter je eigen React-component). |
| Desktop / Mac (Electron, Tauri) | Zelfde webcode. |
| iPhone / native Mac | Eerste versie: web-view met dezelfde code. Daarna: SwiftUI `Canvas` plus een Swift-port van `core.ts`. De tests zijn de specificatie. |

## Bekende grenzen

- Getest op berekening en stilstaande beelden. Het live gevoel op echte apparaten (60 en 120 Hz, mobiel) moet nog met de hand beoordeeld worden.
- In heel kleine formaten (rond 24 px) zijn de details van oogleden niet meer zichtbaar. Daarvoor is een vereenvoudigde variant nodig.
- De stijl ligt bewust dicht bij Dots, Grokbot en MausBot. Geef Dashy een eigen kleur of eigenaardigheid voor je lanceert.
