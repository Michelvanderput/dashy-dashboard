import type { Store } from './store.js';
export declare const INSTRUCTIONS = "Dashy is het werkscherm van de gebruiker: \u00E9\u00E9n ding tegelijk, met een kleine buddy. Alles gaat via deze tools. Id's zijn 8 tekens.\nBraindump verwerken: 1) haal eerst het dashboard op (voorkomt dubbelen; \"today\" is de datum van vandaag, \"tz\" de tijdzone). 2) Maak per taak een korte title (max 60 tekens, begint met een werkwoord, liefst 2 tot 5 woorden) zonder tijd, datum of uitleg erin. Het moment gaat in due, details in note (max 100). Voorbeeld: niet \"Morgenavond rond 18:00 naar oma (fiets meenemen!)\" maar title \"Naar oma\", due \"<morgen> 18:00\", note \"Fiets meenemen\". 3) due is Nederlandse tijd: \"YYYY-MM-DD HH:mm\", of alleen \"YYYY-MM-DD\" als alleen de dag bekend is (dan staat er geen tijd en komt de taak die ochtend aan de beurt), of \"HH:mm\" voor vandaag. Geef bij alles wat op een ander moment moet altijd een due, anders staat het meteen onder Nu. Vage tijden voor vandaag omzetten: vanmiddag 14:00, na de lunch 13:00, vanavond 19:00. 4) Een taak met een tijdstip staat onder Straks en komt pas een uur ervoor onder Nu. 5) category: werk, sport, thuis of prive. 6) Een afspraak van vandaag zet je met appointment, niet als taak. 7) now: true alleen als het eerst moet.\nDagplanning: kijk naar leftOpen (taken van een eerdere dag die nog openstaan). Benoem die neutraal (\"nog open\", zonder schuld of verwijt), kies samen een nieuw moment met update_tasks (due), en zet de eerste taak met reorder_tasks vooraan. Verplaats niets zonder dat de gebruiker het zegt.\nToon: Nederlands, rustig, warm, concreet. Geen schuld, geen cijfers of streaks, hooguit twee korte zinnen met \u00E9\u00E9n concrete stap.";
export interface McpDeps {
    store: Store | null;
    token: string | undefined;
    now: () => number; /** accept the token as the last URL segment too */
    allowPathToken?: boolean;
}
export declare function handleMcp(req: Request, d: McpDeps): Promise<Response>;
export interface StateDeps {
    store: Store | null;
    token: string | undefined;
    now: () => number;
}
/** Read-only: what the screen polls. A different token than the MCP one, so a screen can never write. */
export declare function handleState(req: Request, d: StateDeps): Promise<Response>;
export interface ActionDeps {
    store: Store | null;
    token: string | undefined;
    now: () => number;
}
/**
 * What the screen may write: check a task off or undo it, nothing else. Its own token (not the read token, not the MCP token),
 * so a leaked screen key cannot add, edit or delete tasks. Answers with the fresh state, so the screen shows what the server has.
 * POST { "action": "done" | "undo", "id": "<task id>" }
 */
export declare function handleAction(req: Request, d: ActionDeps): Promise<Response>;
