// The v2 token's on-chain HTML renderer, reconstructed CLIENT-SIDE.
//
// `htmlA`/`htmlB` are copied BYTE-FOR-BYTE from the contract's `render_html`
// (src/gol_metadata_v2.cairo, mirrored in docs/v2-render-preview/generate.mjs). The contract
// base64-encodes exactly this into `token_uri`'s `animation_url`. The only per-token data is the
// rows + bg/cell/speed — which the app already fetches cheaply via get_lifeform_data +
// get_render_params — so we rebuild the artifact here instead of pulling the whole ~1.3KB HTML over
// RPC for every creature. The template is the cached "generic part"; only the specifics vary.
//
// The bundled htmlA/htmlB are the DEFAULT (offline fallback). At app start the template is refreshed
// from a live token's animation_url (see adoptTemplateFromHtml + GolSdkProvider), so it tracks the
// DEPLOYED renderer and catches a contract upgrade automatically — one read per session, then cached.

const htmlA = `<!doctype html><html><head><meta charset='utf-8'><title>Lifeform</title><style>html,body{margin:0;height:100%;background:#0b0b0f;display:flex;align-items:center;justify-content:center}canvas{image-rendering:pixelated;width:92vmin;height:92vmin}</style></head><body><canvas id='c'></canvas><script>const N=41,ROWS=`;

const htmlB = `;function hx(n){return '#'+n.toString(16).padStart(6,'0');}function U(rows){const g=[];for(let r=0;r<N;r++){const v=rows[r],l=[];for(let c=0;c<N;c++)l.push(Math.floor(v/Math.pow(2,c))%2);g.push(l);}return g;}function S(g){const n=[];for(let r=0;r<N;r++){const l=[];for(let c=0;c<N;c++){let k=0;for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){if(a||b)k+=g[(r+a+N)%N][(c+b+N)%N];}const al=g[r][c];l.push(((al&&(k===2||k===3))||(!al&&k===3))?1:0);}n.push(l);}return n;}let g=U(ROWS);const cv=document.getElementById('c'),px=12;cv.width=cv.height=N*px;const x=cv.getContext('2d');const bgc=hx(BG),cellc=hx(CELL);function D(){x.fillStyle=bgc;x.fillRect(0,0,cv.width,cv.height);x.fillStyle=cellc;for(let r=0;r<N;r++)for(let c=0;c<N;c++)if(g[r][c])x.fillRect(c*px,r*px,px-1,px-1);}D();setInterval(function(){g=S(g);D();},Math.round(1000/SPEED));</script></body></html>`;

// The ACTIVE template — defaults to the bundled copy, replaced at app start by adoptTemplateFromHtml.
let tplA = htmlA;
let tplB = htmlB;

/** A permanently-minted token to read the live renderer from on boot (the seeded blinker). */
export const REF_TOKEN_ID = "0x743d91e948cc844ef3e08dc46ede35fe5ea085981a0176d3203810da80d9416";

/** Re-derive the template from a live token's decoded animation HTML so it tracks the DEPLOYED
 *  renderer. Splits on `ROWS=` … `SPEED=<n>`; keeps the bundled default if the markers aren't found
 *  (e.g. an unexpected renderer shape), so a parse failure can never break the artifact. */
export function adoptTemplateFromHtml(html: string): boolean {
  const aIdx = html.indexOf("ROWS=");
  const sIdx = html.indexOf("SPEED=", aIdx);
  if (aIdx < 0 || sIdx < 0) return false;
  let e = sIdx + "SPEED=".length;
  while (e < html.length && html[e] >= "0" && html[e] <= "9") e++;
  tplA = html.slice(0, aIdx + "ROWS=".length);
  tplB = html.slice(e);
  return true;
}

/** Reconstruct the contract's animation HTML for one creature. `rows` = the 41 row bitmasks
 *  (a lifeform's `current_state`); `bg`/`cell` are 0xRRGGBB; `speed` is generations/second. */
export function onchainHtml(rows: number[], bg: number, cell: number, speed: number): string {
  return tplA + JSON.stringify(rows) + `,BG=${bg},CELL=${cell},SPEED=${speed}` + tplB;
}

/** The contract's fixed lifeform description (from build_metadata_json). */
export const LIFEFORM_DESCRIPTION =
  "An autonomous Conway's Game of Life lifeform living forever on Starknet. The image is a self-contained on-chain renderer.";
