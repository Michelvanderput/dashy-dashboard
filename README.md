# Dashy

Dashy is een levende avatar (twee zwarte pilvormige ogen op een wit lichaam) en een muziekspeler met Spotify en een draaiende vinylplaat. Dit is de herbouw: voor nu alleen deze twee dingen. De rest (dashboard, planning, MCP, Claude-advies, desktop) staat in de git-tag `pre-rebuild` en wordt vanaf de grond opnieuw opgezet.

## Snel starten

```bash
npm install
npm test        # grenzen, soepelheid, scenario's, ambient, sequenties, definitie
npm run build   # dist/dashy.js en types
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

## Meer leven: ambient, kopdraai, sequenties

Dashy combineert zijn eigen veerfysica en toestanden met ideeën uit [bible-strong-avatar-lab](https://github.com/smontlouis/bible-strong-avatar-lab) (uitdrukkingen, tijdlijnen, één JSON-definitie, photo mode). Die lab is AGPL-3.0; er is **geen code of dependency overgenomen**, alles is opnieuw gebouwd in Dashy's eigen kern.

| Wat | Waar | Standaard |
|---|---|---|
| **Ambient leven**: micro-saccades in de ogen en een trage zweving in het lijf, nooit helemaal stil | `ambient.ts` | aan in `mountDashy`, uit in `createDashy` |
| **Kopdraai**: kijkt hij opzij, dan wordt het verste oog smaller en het dichtste iets groter; omhoog/omlaag drukt de ogen plat | `perspective.ts` | idem |
| **Sequenties**: tijdlijn van uitdrukkingen met hold, overgang, `loop` / `once` / `pingPong` en eigen knipperritme | `timeline.ts` | n.v.t. |
| **Definitie-JSON**: kleuren, vorm, ooggrootte, eigen uitdrukkingen en sequenties in één bestand, met validatie | `definition.ts` | n.v.t. |
| **Photo mode**: SVG of PNG van wat nu op het scherm staat, met transparante, effen of verloop-achtergrond | `photo.ts` | n.v.t. |

`createDashy` houdt ambient en kopdraai standaard **uit**, zodat de opgenomen referentie voor de Swift-port (`swift:reference`) en de statische exports exact gelijk blijven. `mountDashy` zet ze aan, behalve bij "minder beweging".

```ts
import { mountDashy } from 'dashy-avatar';

const dashy = mountDashy(el, {
  definition: {
    schema: 'dashy/avatar-definition', schemaVersion: 1, shape: 'circle',
    colors: { body: '#ffe7a8', eyes: '#2a1b3d' },
    expressions: { smug: { state: 'idle', look: { cover: 0.45, lidA: -6, low: 0.2 } } },
    sequences: {
      hello: { mode: 'once', steps: [
        { expression: 'smug',  holdMs: 700, transitionMs: 250 },
        { expression: 'happy', holdMs: 900, transitionMs: 200, ease: 'snappy' },
      ] },
    },
  },
  onSequenceEnd: key => console.log(key, 'klaar'),   // hij blijft op de laatste stap staan tot stop()
});
dashy.play('hello');            // of dashy.express('smug'), dashy.stop()
const svg = await dashy.snapshot({ background: { type: 'radial', from: '#fff', to: '#ccd' } });
const png = await dashy.snapshot({ format: 'png', size: 512 });   // Blob
```

React: `<Dashy definition={def} sequence="hello" colors={{ body: '#fff' }} />`.

De `look` van een uitdrukking heeft dezelfde namen als de tabel in `core.ts`: `sd` (afstand tussen de ogen), `eh` (oog-hoogte), `cover` (bovenooglid), `lidA` (schuinte), `low` (blij-boog), `tilt`, `asym`. Een uitdrukking mag ook alleen een `state` hebben (een eigen naam voor een ingebouwde stand). Ongeldige definities worden geweigerd met een JSON-pointer naar het eerste probleem (`parseDefinition` / `validateDefinition`, max 256 KiB, geen dependencies).

## Laag 1: Dashy volgt je echte taken

`src/tasks.ts` vertaalt het dashboard (`{ today, tasks: [[id, titel, categorie, wanneer, notitie]], left_open, time_today }`) naar driver-gebeurtenissen:

| Gebeurt er | Dashy |
|---|---|
| nieuwe taak | `received` |
| taak verdwijnt (afgevinkt) | `done` |
| taak met tijdstip binnen 30 min | `strict` |
| dingen "nog open van eerder" | `waiting` (rustig, geen verwijt) |
| 2 uur niets gebeurd | `sad` |

Hij wordt bewust **nooit boos** op taken (`TASK_DRIVER_CONFIG`), en een tijdstip dat voorbij is telt niet meer als deadline.

Koppelen: zet het dashboard als JSON achter een https-adres (localhost mag ook over http) en open de app eenmalig met `https://<app>/#tasks=<url>&key=<sleutel>`. Dat wordt op dit apparaat onthouden en uit de adresbalk gehaald; de sleutel (optioneel) gaat mee als `Authorization: Bearer`. In React: `useDashyTasks({ url, token })`. Een mislukte poll houdt het laatste beeld vast en toont een rustige foutmelding.

## Taken noteren via Claude (MCP)

De server staat in `src/server/` en draait als Vercel-functies in `api/`. Het idee komt uit de hoofd-Dashy (korte titel, `due` en `note` apart, Nu doen versus Straks, `left_open` zonder schuld, tools in batches), met bewuste verbeteringen:

| Hoofd-Dashy | Hier | Waarom |
|---|---|---|
| Alleen-datum wordt opgeslagen als 07:00 | `hasTime` is een eigen veld | een echte taak om 07:00 blijft een echte taak |
| Dashboard geeft tijden als tekst ("morgen 14:00") | epoch-tijd (`dueAt`) plus `hasTime` | niemand hoeft Nederlandse tekst terug te ontleden |
| Eén set rijen per gebruiker | één record per taak (Redis-hash) | Claude en het scherm overschrijven elkaar niet |
| Een tijd die niet bestaat wordt stil verschoven | wordt geweigerd met uitleg (zomertijd-uur, 30 februari) | Claude kan het meteen verbeteren |
| Een batch met één foute taak: de rest gaat door of niet, afhankelijk | alles wordt eerst gecontroleerd, dan pas geschreven | een fout verandert niets |
| Interne fouten worden als tekst teruggegeven | alleen invoerfouten gaan naar Claude, de rest blijft algemeen | geen details uit de opslag in een gesprek |
| Geheim in de URL is de enige stap voor sommige koppelingen | Bearer-header is standaard; het pad-geheim (`/api/mcp/<token>`) is een bewuste uitzondering | een geheim in een URL komt in logs terecht |

Bewust **niet** overgenomen: Supabase, meerdere gebruikers, de eigen OAuth-server en de native apps. Dit is een scherm voor één persoon.

**Tools** (5, alles in batches): `dashboard`, `add_tasks`, `update_tasks`, `reorder_tasks`, `appointment`. Titel max 60 tekens zonder tijd of datum erin; tijd in `due` (`YYYY-MM-DD HH:mm`, `YYYY-MM-DD` of `HH:mm`, Nederlandse tijd); toelichting in `note` (max 100).

**Opzetten**
1. Maak een gratis Upstash Redis-database via Vercel (Storage, Marketplace). Die zet de variabelen zelf (`KV_REST_API_URL` en `KV_REST_API_TOKEN`; de namen `UPSTASH_REDIS_REST_URL` en `UPSTASH_REDIS_REST_TOKEN` werken ook).
2. Zet drie verschillende lange sleutels: `DASHY_MCP_TOKEN` (Claude, mag schrijven), `DASHY_STATE_TOKEN` (het scherm, alleen lezen) en `DASHY_ACTION_TOKEN` (het scherm, mag alleen afvinken of ongedaan maken). Zie `.env.example`.
3. Claude: Instellingen, Connectors, eigen connector toevoegen met `https://<app>/api/mcp` en de header `Authorization: Bearer <DASHY_MCP_TOKEN>`. Kan jouw Claude-app geen header meegeven, gebruik dan `https://<app>/api/mcp/<DASHY_MCP_TOKEN>`.
4. Scherm koppelen: open eenmalig `https://<app>/#tasks=https://<app>/api/state&key=<DASHY_STATE_TOKEN>&act=<DASHY_ACTION_TOKEN>`. Zonder `act` kan het scherm alleen kijken.

**Afvinken vanaf het scherm:** de knop "Klaar" bij de taak onder Dashy. Het scherm toont het meteen (en Dashy viert het), de server bevestigt daarna; lukt dat niet, dan komt de taak terug met een rustige melding. Daarna staat er 8 seconden "Ongedaan maken". `POST /api/action` kan niets anders dan `done` en `undo`, en is idempotent (dubbel tikken doet niets extra's). Een uitgelekte schermsleutel kan dus nooit taken toevoegen of verwijderen.

**Lokaal proberen:** `npm run api:dev` start dezelfde handlers op `http://127.0.0.1:8787` met een geheugenopslag (weg bij herstart) en toont de ontwikkelsleutels. Koppel de app met `#tasks=http://127.0.0.1:8787/api/state&key=dev-state-token-0123456789abcdef&act=dev-action-token-0123456789abcdef`. Getest met de officiële MCP-client.

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

## Spotify-blok

`<NowPlayingBlock />`: de albumhoes met een vinylplaat die eruit schuift en draait (33⅓ toeren) zolang er muziek speelt. In de app danst Dashy in zijn eigen blok terwijl er muziek speelt (met `showDashy` kan hij ook naast de plaat staan). Pauzeert de muziek, dan stopt de plaat en wordt Dashy weer rustig.

```tsx
import { NowPlayingBlock, useSpotify } from 'dashy-avatar/react';

const sp = useSpotify({ clientId: SPOTIFY_CLIENT_ID, redirectUri: 'https://jouw-app.example/callback' });
<NowPlayingBlock {...sp} onConnect={sp.connect} onDisconnect={sp.disconnect} driver={driverResolution} spotifyLogoSrc="/spotify-logo.svg" />
```

**In deze app (`npm run dev`) koppel je Spotify zo:**
1. Maak een app op <https://developer.spotify.com/dashboard> (Web API) en zet bij Redirect URI precies het adres waarop de app draait: `http://127.0.0.1:5173/` lokaal, of `https://jouw-site.vercel.app/` online. Niet `localhost`.
2. Maak een bestand `.env.local` naast `package.json` met `VITE_SPOTIFY_CLIENT_ID=<je Client ID>` en (lokaal) `VITE_SPOTIFY_REDIRECT_URI=http://127.0.0.1:5173/`. Online zet je dezelfde variabelen in de Vercel-projectinstellingen. Het Client ID is geen geheim; er is geen client secret nodig.
3. Start de app opnieuw en tik op "Verbind met Spotify". Zonder client id toont het blok een melding dat Spotify nog niet gekoppeld is.

**Wat jij moet regelen (kan ik niet voor je doen):**
1. Maak een app aan op <https://developer.spotify.com/dashboard> en zet de redirect-URL erin. Alleen `https://...` of `http://127.0.0.1:POORT/...`, **niet** `localhost`.
2. Een nieuwe app staat in ontwikkelmodus: maximaal **5 gebruikers**, die je onder User Management op de lijst zet, en de eigenaar moet **Spotify Premium** hebben. Anders krijg je 403 en toont het blok een uitleg.
3. Download het **officiële Spotify-logo** (volledig logo, minstens 70 px breed) uit Spotify's design guidelines en geef het mee als `spotifyLogoSrc`. Spotify eist het logo bij hoes en titels. Ik teken het niet zelf na.

- **Inloggen:** Authorization Code met PKCE, zonder geheim in de app. De tokens staan in `localStorage`; de gegevens die Spotify teruggeeft (titel, artiest, hoes) worden alleen getoond.
- **Hoes:** onaangeroerd (niet bijgesneden, niets erover, niet geanimeerd), met 4 px afgeronde hoeken (8 px vanaf 300 px) en de link "LISTEN ON SPOTIFY". Het vinyl kleurt per album uit een vast palet en gebruikt de hoes nooit voor het label.
- **Dashy danst alleen** als de driver niets urgents heeft (`idle`, `quiet`, `working`). Een deadline, blokkade, pauze of viering blijft zoals de driver zegt.
- **Tempo:** Dashy danst in zijn eigen tempo uit `core.ts`, niet op het ritme van het nummer.
- **Verminder beweging:** de plaat blijft stil. Het polling staat stil als het venster verborgen is.

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

