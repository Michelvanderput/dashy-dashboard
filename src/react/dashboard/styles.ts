export const CSS = `
.db{
 /* paper: warm stone neutrals, one vermilion accent for urgency, one sage for done */
 --bg:#e8e6e0;--card:#f4f3ee;--card-hi:#faf9f6;--ink:#17181a;--muted:#6a6963;--hair:rgba(23,24,26,.09);--attn:#c7391f;--ok:#4b8a69;--floor:rgba(23,24,26,.24);--edge:none;
 --font:"Geist Variable",Geist,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;--ease:cubic-bezier(.22,.8,.2,1);
 position:relative;width:100%;height:100%;box-sizing:border-box;display:grid;gap:clamp(10px,1.6vmin,18px);padding:clamp(10px,1.8vmin,22px);
 background:var(--bg);color:var(--ink);font:400 clamp(.9375rem,calc(.55rem + .95vmin),1.5rem)/1.45 var(--font);letter-spacing:-.006em;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:optimizeLegibility;font-feature-settings:"tnum" 1;overflow:hidden;
 grid-template-areas:var(--areas);grid-template-columns:var(--cols);grid-template-rows:var(--rows);
 transition:grid-template-columns .8s var(--ease),grid-template-rows .8s var(--ease)}
/* graphite: near-black, cards one step lighter, a one-pixel light edge on top (the only 'ornament') */
@media (prefers-color-scheme:dark){.db:not([data-theme="light"]){--bg:#080809;--card:#121214;--card-hi:#18181b;--ink:#eeece8;--muted:#8d8c86;--hair:rgba(255,255,255,.075);--attn:#ff8a6b;--ok:#6fb28d;--floor:rgba(255,255,255,.09);--edge:inset 0 1px 0 rgba(255,255,255,.045)}}
.db[data-theme="dark"]{--bg:#080809;--card:#121214;--card-hi:#18181b;--ink:#eeece8;--muted:#8d8c86;--hair:rgba(255,255,255,.075);--attn:#ff8a6b;--ok:#6fb28d;--floor:rgba(255,255,255,.09);--edge:inset 0 1px 0 rgba(255,255,255,.045)}
/* night: dark and dimmed, so a phone on the charger is not a lamp (and a white block does not burn into an OLED) */
.db[data-night="true"]{filter:brightness(.62)}
.db *{box-sizing:border-box}
.db-sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}

/* a block: flat, no border, no shadow, no title. It explains itself. */
.db-block{grid-area:var(--area);position:relative;min-width:0;min-height:0;display:flex;flex-direction:column;cursor:pointer;
 padding:clamp(18px,3vmin,34px);background:var(--card);border-radius:clamp(22px,3.4vmin,32px);box-shadow:var(--edge);transition:background .6s var(--ease)}
.db-block[data-focus="true"]{background:var(--card-hi)}
.db-block[data-attn="true"]::after{content:"";position:absolute;top:clamp(16px,2.8vmin,28px);right:clamp(16px,2.8vmin,28px);width:8px;height:8px;border-radius:50%;background:var(--attn)}
.db-body{flex:1;min-height:0;container-type:size;position:relative}
/* the grow button is there for keyboard and screen readers; the whole block is the touch target */
.db-toggle{position:absolute;top:6px;right:6px;z-index:2;display:grid;place-items:center;width:44px;height:44px;border:0;border-radius:50%;background:transparent;color:var(--muted);opacity:0;cursor:pointer;transition:opacity .2s}
.db-toggle:focus-visible{opacity:1;outline:2px solid var(--ink);outline-offset:-2px}
.db-toggle svg{width:16px;height:16px}
.db-why{margin:0;font-size:.9em;color:var(--muted);max-height:0;opacity:0;overflow:hidden;transition:opacity .5s var(--ease) .15s,max-height .5s var(--ease)}
.db-block[data-focus="true"] .db-why{max-height:3em;opacity:1}

/* Dashy IS the block: a white block that stands still like the others. His life is in his face (eyes, mood), drawn on top. */
.db-bodyblock,.db-bodyblock[data-focus="true"]{background:#fff;color:#17181a;--ink:#17181a;--muted:#66645e;--attn:#c7391f;box-shadow:inset 0 0 0 1px rgba(23,24,26,.06);cursor:default;touch-action:manipulation}
.db-face{position:absolute;inset:0;border-radius:inherit;overflow:hidden}
.db-bodyblock .db-toggle{color:#66645e}
.db-bodyblock .db-body{position:relative;z-index:1;display:flex;flex-direction:column;justify-content:flex-end;pointer-events:none}
.db-say{display:flex;flex-direction:column;align-items:center;gap:2px;text-align:center}
.db-line{margin:0;font-size:clamp(1em,2.6cqmin,1.15em);font-weight:450;letter-spacing:-.012em;line-height:1.3;max-width:34ch;text-wrap:balance;overflow-wrap:anywhere;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden}
@container (max-height:150px){.db-say{display:none}}

/* Straks */
.db-now{height:100%;display:flex;flex-direction:column;justify-content:center;gap:.25em;overflow:hidden}
.db-big{margin:0;font-size:clamp(2.4rem,19cqmin,7rem);font-weight:200;letter-spacing:-.05em;line-height:.95;font-variant-numeric:tabular-nums}
.db-big small{font-size:.3em;font-weight:400;letter-spacing:0;color:var(--muted);margin-left:.3em}
.db-what{margin:.5em 0 0;font-size:clamp(1em,4.2cqmin,1.55em);font-weight:500;letter-spacing:-.02em;line-height:1.2;overflow-wrap:anywhere;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden}
.db-when{margin:.3em 0 0;color:var(--muted);font-size:.95em}
.db-note-now{margin:.4em 0 0;color:var(--muted);font-size:.9em;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
.db-done{align-self:flex-start;margin-top:.9em;min-height:44px;min-width:44px;padding:.55em 1.4em;border:1px solid var(--ink);border-radius:999px;background:transparent;color:var(--ink);font:inherit;font-weight:500;cursor:pointer;transition:background .3s,color .3s}
.db-done:hover{background:var(--ink);color:var(--card)}
.db-done:focus-visible{outline:2px solid var(--ink);outline-offset:3px}
.db-after{margin:auto 0 0;padding-top:.8em;color:var(--muted);font-size:.9em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.db-empty{color:var(--muted);font-size:clamp(1em,4.2cqmin,1.4em);margin:auto 0}
.db-more{margin:1em 0 0;padding:0;list-style:none;color:var(--muted);font-size:.9em;max-height:0;opacity:0;overflow:hidden;transition:opacity .5s var(--ease) .15s,max-height .6s var(--ease)}
.db-block[data-focus="true"] .db-more{max-height:12em;opacity:1}
@container (max-height:210px){.db-after,.db-note-now{display:none}}
@container (max-height:150px){.db-when{display:none}.db-done{margin-top:.5em}.db-big{font-size:2rem}}
@container (max-height:95px){.db-what{display:none}.db-big{font-size:1.7rem}}

/* Planning */
.db-plan{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;height:100%;overflow:auto;scrollbar-width:none;
 mask-image:linear-gradient(#000 calc(100% - 28px),transparent);-webkit-mask-image:linear-gradient(#000 calc(100% - 28px),transparent)}
.db-plan::-webkit-scrollbar{display:none}
.db-item{display:grid;grid-template-columns:40px 1fr auto;align-items:center;column-gap:4px;min-height:48px;cursor:default}
.db-item+.db-item{box-shadow:0 -1px 0 var(--hair)}
.db-check{display:grid;place-items:center;width:44px;height:44px;margin-left:-8px;border:0;background:none;color:var(--muted);cursor:pointer;border-radius:50%}
.db-check:focus-visible{outline:2px solid var(--ink);outline-offset:-6px}
.db-check i{display:block;width:18px;height:18px;border-radius:50%;border:1.5px solid currentColor;transition:background .3s,border-color .3s,transform .3s var(--ease)}
.db-check:hover i{transform:scale(1.12)}
.db-check[aria-checked="true"] i{background:var(--ok);border-color:var(--ok)}
.db-name{min-width:0;font-weight:450;letter-spacing:-.012em;overflow-wrap:anywhere;line-height:1.25;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
.db-item[data-done="true"] .db-name,.db-item[data-done="true"] .db-time{color:var(--muted);text-decoration:line-through;text-decoration-color:var(--hair)}
.db-note{grid-column:2/4;margin:-4px 0 8px;font-size:.9em;color:var(--muted);max-height:0;opacity:0;overflow:hidden;transition:opacity .5s,max-height .5s var(--ease)}
.db-block[data-focus="true"] .db-note{max-height:3em;opacity:1}
.db-time{font-size:.92em;color:var(--muted);font-variant-numeric:tabular-nums;white-space:nowrap}
.db-item[data-urgency="soon"] .db-time{color:var(--attn)}
.db-item[data-urgency="near"] .db-time{color:var(--attn);font-weight:650}
.db-item[data-urgency="near"] .db-name{font-weight:650}
.db-item[data-urgency="late"] .db-name,.db-item[data-urgency="late"] .db-time{color:var(--muted)}
.db-item[data-urgency="late"] .db-time{font-style:italic}
@container (max-height:240px){.db-item:nth-child(n+4){display:none}}
@container (max-width:200px){.db-time{display:none}}

/* Vandaag */
.db-clock{height:100%;display:flex;flex-direction:column;justify-content:center;gap:.4em;overflow:hidden}
.db-time-big{margin:0;font-size:clamp(2.6rem,22cqmin,8.5rem);font-weight:200;letter-spacing:-.055em;line-height:.92;font-variant-numeric:tabular-nums}
.db-date{margin:0;color:var(--muted)}
.db-date::first-letter{text-transform:uppercase}
.db-day{height:2px;border-radius:2px;background:var(--hair);overflow:hidden;margin-top:.5em}
.db-day i{display:block;height:100%;background:var(--ink);opacity:.6;transform-origin:left;transition:transform 1s linear}
.db-left{margin:0;font-size:.85em;color:var(--muted);max-height:0;opacity:0;overflow:hidden;transition:opacity .5s var(--ease) .15s,max-height .5s var(--ease)}
.db-block[data-focus="true"] .db-left{max-height:2em;opacity:1}
@container (max-height:150px){.db-date,.db-day{display:none}}
@container (max-height:95px){.db-time-big{font-size:1.9rem}}

/* Muziek */
.db-music{height:100%;display:flex;align-items:center;--music-s:min(70cqh,34cqw)}
.db-music .dnp{width:100%;flex-wrap:nowrap;gap:12px 16px}
.db-music .dnp-meta{flex:1 1 0;min-width:0}
@container (min-width:481px){.db-music{--music-s:min(80cqh,27cqw)}}
@container (max-width:300px){.db-music .dnp[data-playing] .dnp-meta,.db-music .dnp[data-paused="true"] .dnp-meta{display:none}.db-music{--music-s:min(76cqh,54cqw)}}
@container (max-width:480px){.db-music .dnp-time,.db-music .dnp-bar,.db-music .dnp-logo{display:none}}
@container (max-height:140px){.db-music .dnp-time,.db-music .dnp-bar,.db-music .dnp-logo{display:none}}
@container (max-height:110px){.db-music .dnp-actions .dnp-btn{display:none}}

@media (prefers-reduced-motion:reduce){.db,.db-block,.db-why,.db-more,.db-note,.db-left,.db-day i{transition:none}}
`;
