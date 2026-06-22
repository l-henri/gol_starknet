// Generates standalone previews of the v2 on-chain token renderer.
//
// htmlA / htmlB below are copied BYTE-FOR-BYTE from src/gol_metadata_v2.cairo (render_html), and
// derive() mirrors derive_params(token_id). The contract base64-encodes exactly this HTML into the
// token_uri animation_url, so what you open here is what a wallet/marketplace would render.
//
// Run:  node docs/v2-render-preview/generate.mjs
import { writeFileSync } from 'node:fs';

const htmlA = `<!doctype html><html><head><meta charset='utf-8'><title>Lifeform</title><style>html,body{margin:0;height:100%;background:#0b0b0f;display:flex;align-items:center;justify-content:center}canvas{image-rendering:pixelated;width:92vmin;height:92vmin}</style></head><body><canvas id='c'></canvas><script>const N=41,ROWS=`;
const htmlB = `;function hx(n){return '#'+n.toString(16).padStart(6,'0');}function U(rows){const g=[];for(let r=0;r<N;r++){const v=rows[r],l=[];for(let c=0;c<N;c++)l.push(Math.floor(v/Math.pow(2,c))%2);g.push(l);}return g;}function S(g){const n=[];for(let r=0;r<N;r++){const l=[];for(let c=0;c<N;c++){let k=0;for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){if(a||b)k+=g[(r+a+N)%N][(c+b+N)%N];}const al=g[r][c];l.push(((al&&(k===2||k===3))||(!al&&k===3))?1:0);}n.push(l);}return n;}let g=U(ROWS);const cv=document.getElementById('c'),px=12;cv.width=cv.height=N*px;const x=cv.getContext('2d');const bgc=hx(BG),cellc=hx(CELL);function D(){x.fillStyle=bgc;x.fillRect(0,0,cv.width,cv.height);x.fillStyle=cellc;for(let r=0;r<N;r++)for(let c=0;c<N;c++)if(g[r][c])x.fillRect(c*px,r*px,px-1,px-1);}D();setInterval(function(){g=S(g);D();},Math.round(1000/SPEED));</script></body></html>`;

const N = 41, SPEED_MAX = 200;
const rowsFrom = (cells) => { const rows = new Array(N).fill(0); for (const [r, c] of cells) rows[r] += 2 ** c; return rows; };
const html = (rows, bg, cell, speed) => htmlA + JSON.stringify(rows) + `,BG=${bg},CELL=${cell},SPEED=${speed}` + htmlB;

// mirror of derive_params(token_id) in gol_metadata_v2.cairo (token_id as BigInt)
const derive = (id) => {
  const cell = Number(id & 0xffffffn);
  const bgRaw = Number((id >> 24n) & 0xffffffn);
  const bg = bgRaw === cell ? bgRaw ^ 0xffffff : bgRaw;
  const speed = Number((id >> 48n) % BigInt(SPEED_MAX - 1)) + 1;
  return { bg, cell, speed };
};

const glider = rowsFrom([[18,19],[19,20],[20,18],[20,19],[20,20]]);
const blinker = rowsFrom([[20,19],[20,20],[20,21]]);
const block = rowsFrom([[19,19],[19,20],[20,19],[20,20]]);

// A few previews: A (derived from a token_id) and C (explicit owner-chosen params).
const d = derive(0x9f3c7a12b4e6d8059c1faa7733bbn);
const samples = {
  'glider-derived': { rows: glider, ...d, note: `A: derived from token_id (bg #${d.bg.toString(16).padStart(6,'0')}, cell #${d.cell.toString(16).padStart(6,'0')}, speed ${d.speed})` },
  'blinker-custom': { rows: blinker, bg: 0x101820, cell: 0x7ef9a0, speed: 6, note: 'C: owner-chosen teal-on-dark, speed 6' },
  'glider-fast':    { rows: glider,  bg: 0x000000, cell: 0xff5577, speed: 60, note: 'C: speed 60 (near the visible 60Hz cap)' },
  'block-still':    { rows: block,   bg: 0x0b0b0f, cell: 0xffd166, speed: 4, note: 'still life — renders, no visible motion' },
};

let index = `<!doctype html><meta charset='utf-8'><title>v2 render previews</title><body style='font-family:sans-serif;background:#0b0b0f;color:#ddd;padding:2rem'><h1>GoL v2 token renderer previews</h1><p>Decoded animation_url payloads (byte-identical to on-chain output). SPEED_MAX=${SPEED_MAX}.</p><ul>`;
for (const [name, s] of Object.entries(samples)) {
  const out = html(s.rows, s.bg, s.cell, s.speed);
  writeFileSync(new URL(`./${name}.html`, import.meta.url), out);
  index += `<li><a style='color:#7ef9a0' href='./${name}.html'>${name}</a> — ${s.note}</li>`;
  console.log(`wrote ${name}.html (${out.length} bytes)`);
}
index += `</ul></body>`;
writeFileSync(new URL('./index.html', import.meta.url), index);
console.log('wrote index.html');
