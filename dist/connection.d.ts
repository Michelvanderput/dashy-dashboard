/**
 * How the screen learns where its data lives, without secrets in the public bundle:
 * open the app once with  https://<app>/#key=<read token>&act=<action token>  (a desktop shell adds &api=https://<site>) and it remembers both on this device
 * (localStorage), then removes them from the address bar. The endpoints are on the same site (/api/...).
 */
import type { KeyValueStore } from './spotify/auth';
/** `api` is the site that serves /api/... when the app itself runs elsewhere (a desktop shell); empty = this site. */
export interface Connection {
    stateUrl: string;
    actionUrl: string;
    token: string;
    actionToken: string | null;
}
/** Reads `#key=…&act=…` from a hash and remembers it. Returns the hash without those parts (to put back in the address bar). */
export declare function adoptHash(hash: string, store: KeyValueStore): {
    cleaned: string;
    adopted: boolean;
};
export declare function loadConnection(store: KeyValueStore, origin: string): Connection | null;
export declare const forgetConnection: (store: KeyValueStore) => void;
/**
 * For a desktop shell, where there is no link to open: the same hash, built from what the person types in the connect form.
 * Returns null when something is missing or not acceptable. The site must be an https origin (or localhost); a trailing slash is fine.
 */
export declare function connectionHash(i: {
    site: string;
    key: string;
    act?: string;
}): string | null;
