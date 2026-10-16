# Wat maakt een dashboard-buddy echt nuttig? Onderzoek en wat er is gebouwd

Gezocht op het web (oktober 2026). Veel bronnen zijn praktijkverhalen of productpagina's, geen gecontroleerd onderzoek. Waar het bewijs dun is staat dat erbij, en het ontwerp is er op gekozen: kleine, omkeerbare keuzes en geen grote beloftes.

## 1. ADHD: starten, tijd en meewerken
**Gevonden**
- Taakinitiatie is het moeilijkste deel; praktijkadvies is een kleine start (vijf minuten, micro-stappen) en één taak tegelijk tonen met korte lijsten. Dit leunt op behavioral activation, niet op ADHD-trials. ([Tiimo](https://tiimoapp.com/blog/task-initiation-tactics), [overzicht](https://www.simplypsychology.com/reviews/best-adhd-apps-2026))
- Tijdsblindheid: een zichtbare timer maakt tijd concreet. Dit is ontwerpredenering, geen bewezen uitkomst. ([Sumizeit](https://www.sumizeit.com/blog/adhd-apps-13-tools-to-defeat-procrastination-and-time-blindness))
- Body doubling (iemand werkt stil naast je) is de meest genoemde strategie in de community, maar de gecontroleerde evidentie is dun. Een HCI-raamwerk stelt dat zelfs minimale signalen van gedeelde aanwezigheid betrokkenheid kunnen verhogen. ([arXiv 2507.06864](https://arxiv.org/pdf/2507.06864), [Affine](https://affine.pro/blog/body-doubling-apps-for-planning))
- Hersentraining-spelletjes geven weinig overdracht naar het dagelijks leven; externe steun (timers, herinneringen, structuur) is de betere richting.

**Toegepast**
- Het blok **Nu** toont precies één ding, met reden en een Klaar-knop.
- **Begin (10 min):** een korte sessie op één taak met zichtbare aftellende tijd. Dashy werkt zichtbaar mee (body-doubling-signaal). Aan het eind vraagt hij "klaar, of nog 10 minuten?", nooit een verwijt en nooit een teller die doorloopt.
- Een deadline binnen 15 minuten op een andere taak gaat altijd voor; de sessie kan zonder schuld stoppen.

## 2. Gewoontes: zonder streaks
**Gevonden**
- Streaks werken via verliesangst, maar breken bij één gemiste dag en dat voelt als falen; zelfcompassie na een misser helpt het herstel meer dan schuld. Bronnen zijn vooral praktijk, de primaire studies zijn hier niet geverifieerd. ([lifewheel](https://lifewheel.us/glossary/habit-streak/), [Rubin](https://gretchenrubin.com/?p=34670), [DEV](https://dev.to/nucleusos/why-streaks-make-adhd-worse-and-what-actually-helps-5147))
- Als-dan-plannen (implementation intentions): meta-analyse Gollwitzer & Sheeran (2006), 94 tests, gemiddeld d = 0,65 op doelbereiking (medium tot groot, relatief aan alleen een intentie). ([bron](https://stafforini.com/works/gollwitzer-2006-implementation-intentions-and/), [samenvatting](https://cancercontrol.cancer.gov/brp/research/constructs/implementation-intentions))

**Toegepast**
- Gewoontes tonen alleen **"x van y deze week"**; een nieuwe week begint op nul, er is geen schuld en geen reeks.
- Elke gewoonte kan een **als-dan-plan** hebben ("Als ik koffie zet, dan loop ik 5 minuten"); Dashy noemt dat plan als er niets urgents is.
- Via de MCP (`dashy_habit`) zet Claude ze op; op het scherm vink je vandaag af. Dagen worden in Nederlandse tijd geteld, maandag tot zondag.

## 3. Verslaving en drang (gokken, porno, scrollen)
**Gevonden**
- Apps in dit veld combineren: uitstel-timer (10 minuten), ademhaling, een alternatieve activiteit, triggers loggen, zachte omgang met terugval, privacy (geen account) en snelle toegang. Dit zijn productclaims, geen bewijs. ([voorbeelden](https://apps.apple.com/app/id6758517734), [Craving Toolkit](https://www.saashub.com/craving-toolkit))
- Urge surfing: kleine trials zijn gemengd. Bowen & Marlatt (2009) zagen minder roken na een week zonder verschil in drang ([PubMed](https://pubmed.ncbi.nlm.nih.gov/20025372/)); een alcoholstudie vond dat **afleiding** acuut meer craving verminderde dan urge surfing. De bewering "een drang gaat in 20 tot 30 minuten voorbij" komt van een blog, niet van een trial.

**Toegepast (en eerlijk daarover)**
- **Even stoppen** (knop op Dashy): rustig scherm, 10 minuten uitstel, ademcirkel (4 s in, 6 s uit, uit bij verminderde beweging), een andere activiteit als alternatief (de afleiding-bevinding) én de ademhaling (de urge-surfing-richting). Geen vragen over de inhoud, geen teller, geen oordeel. "Het is gebeurd" krijgt een rustig antwoord en één klein volgend ding.
- Wat er gebeurde blijft alleen op dit apparaat (`localStorage`), wordt niet verstuurd en niet als aantal getoond.
- Het scherm zegt dat het geen medische hulp is en verwijst naar de huisarts. Het is een hulpmiddel, geen behandeling; er is geen bewijs dat deze app terugval vermindert.

## 4. Ambient dashboard: kalm, in één oogopslag
**Gevonden**: lage informatiedichtheid, hoge glanceability, signalen die pas aandacht vragen als het nodig is, details bij behoefte. ([Berkeley EECS-2006-113](https://www2.eecs.berkeley.edu/Pubs/TechRpts/2006/EECS-2006-113.pdf), [Calm Technology](https://eidosdesign.substack.com/p/calm-technology-design), [ambient presence](https://aiuxplayground.com/pattern/ambient-presence-displays))

**Toegepast (al eerder)**: vijf blokken, het blok dat aandacht nodig heeft groeit, Dashy is het rustige gezicht, nachtmodus, geen meldingen. Nieuw: alles op het scherm is aan te raken (add, afvinken, begin), maar niets vraagt erom.

## 5. Platformen
Eerlijke stand:
| Platform | Stand |
|---|---|
| Web | Klaar: Vite-app, PWA-manifest, iOS-meta, Wake Lock. Op iPhone: Deel > Zet op beginscherm. |
| iOS / macOS | Dashy zelf is geport (Swift-package `DashyCore`/`DashyUI`, golden replay). Het hele dashboard en de nieuwe functies zijn **niet** naar SwiftUI geport en niet gecompileerd (geen Xcode hier). |
| Windows / Mac desktop | Tauri 2-schil (kleine installer, OS-webview): scaffold staat in `src-tauri/`, zie `docs/PLATFORMS.md`. Alternatief was Electron (groter, rijper ecosysteem). Bron: [Tauri vs Electron](https://tech-insider.org/tauri-vs-electron-2026/). Windows/macOS-builds zijn niet getest. |

Lopend werk voor native: de gedeelde logica (`src/dashboard/*`, `src/driver.ts`) is puur en framework-vrij, dus te porten met dezelfde testvectoren.
