import { type CSSProperties } from 'react';
import { type Resolution } from '../driver';
import { type NowPlaying } from '../spotify/model';
import type { SpotifyStatus } from '../spotify/session';
export interface NowPlayingBlockProps {
    /**
     * URL of the official Spotify logo (full logo, icon + wordmark, at least 70 px wide). Spotify requires its logo next to
     * its metadata and cover art. Download it from Spotify's design guidelines; it is not drawn here on purpose.
     */
    spotifyLogoSrc?: string;
    nowPlaying: NowPlaying | null;
    status: SpotifyStatus;
    onConnect?: () => void;
    onDisconnect?: () => void;
    /** What the state driver says right now. Dashy dances to the music only when this is calm (idle, quiet, working). Default: idle. */
    driver?: Resolution;
    /** Size of the album cover in px. Default 160. */
    size?: number;
    /** Message to show with status "error". */
    error?: string;
    className?: string;
    style?: CSSProperties;
}
/**
 * Spotify block: album cover with a vinyl record behind it. The record slides out and spins while music plays; Dashy
 * dances next to it (his motion comes from core.ts, not from this component). Spotify's rules for the cover are followed:
 * shown whole and unaltered (not cropped, covered or animated), 4 px corners (8 px from 300 px up), and a link back to Spotify. The record colour is picked per album from a fixed palette; the cover is never used on the label.
 */
export declare function NowPlayingBlock({ spotifyLogoSrc, nowPlaying: np, status, onConnect, onDisconnect, driver, size, error, className, style }: NowPlayingBlockProps): import("react").JSX.Element;
