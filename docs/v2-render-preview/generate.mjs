// Generates standalone previews of the v2 on-chain token renderer.
//
// htmlA / htmlB below are copied BYTE-FOR-BYTE from src/gol_metadata_v2.cairo (render_html). The
// contract base64-encodes exactly this HTML into the token_uri animation_url; these files are the
// decoded payload, so what you open here is what a wallet/marketplace would render.
//
// Run:  node docs/v2-render-preview/generate.mjs
import { writeFileSync } from 'node:fs';

const htmlA = `<!doctype html><html><head><meta charset='utf-8'><title>Lifeform</title><style>html,body{margin:0;height:100%;background:#0b0b0f;display:flex;align-items:center;justify-content:center}canvas{image-rendering:pixelated;width:92vmin;height:92vmin}</style></head><body><canvas id='c'></canvas><script>const N=41,ROWS=`;
const htmlB = `;function U(rows){const g=[];for(let r=0;r<N;r++){const v=rows[r],l=[];for(let c=0;c<N;c++)l.push(Math.floor(v/Math.pow(2,c))%2);g.push(l);}return g;}function S(g){const n=[];for(let r=0;r<N;r++){const l=[];for(let c=0;c<N;c++){let k=0;for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){if(a||b)k+=g[(r+a+N)%N][(c+b+N)%N];}const al=g[r][c];l.push(((al&&(k===2||k===3))||(!al&&k===3))?1:0);}n.push(l);}return n;}let g=U(ROWS);const cv=document.getElementById('c'),px=12;cv.width=cv.height=N*px;const x=cv.getContext('2d');const dead=STATUS==='Dead';const hue=(140+AGE*7)%360;const col=dead?'#555':'hsl('+hue+',75%,62%)';function D(){x.fillStyle=dead?'#0a0a0a':'#0b0b0f';x.fillRect(0,0,cv.width,cv.height);x.fillStyle=col;for(let r=0;r<N;r++)for(let c=0;c<N;c++)if(g[r][c])x.fillRect(c*px,r*px,px-1,px-1);}D();if(!dead&&KIND!=='Still life')setInterval(function(){g=S(g);D();},180);</script></body></html>`;

const N = 41;
// build the 41 row masks from a list of [row, col] live cells (bit c of row r == column c)
const rowsFrom = (cells) => {
  const rows = new Array(N).fill(0);
  for (const [r, c] of cells) rows[r] += 2 ** c;
  return rows;
};
const html = (rows, kind, status, age, seq) =>
  htmlA + JSON.stringify(rows) + `,KIND='${kind}',STATUS='${status}',AGE=${age},SEQ=${seq}` + htmlB;

const samples = {
  // glider near the middle: animates AND drifts diagonally, wrapping around the torus
  glider: { cells: [[18,19],[19,20],[20,18],[20,19],[20,20]], kind: 'Path', status: 'Alive', age: 12, seq: 30 },
  // blinker: simplest period-2 oscillator
  blinker: { cells: [[20,19],[20,20],[20,21]], kind: 'Loop', status: 'Alive', age: 0, seq: 2 },
  // block: a still life -> renders once, no animation
  block: { cells: [[19,19],[19,20],[20,19],[20,20]], kind: 'Still life', status: 'Alive', age: 3, seq: 1 },
  // a dead lifeform -> muted palette, static
  dead: { cells: [[10,10],[10,11],[11,10]], kind: 'Path', status: 'Dead', age: 99, seq: 5 },
};

let index = `<!doctype html><meta charset='utf-8'><title>v2 render previews</title><body style='font-family:sans-serif;background:#0b0b0f;color:#ddd;padding:2rem'><h1>GoL v2 token renderer previews</h1><p>Decoded animation_url payloads (byte-identical to the on-chain output).</p><ul>`;
for (const [name, s] of Object.entries(samples)) {
  const out = html(rowsFrom(s.cells), s.kind, s.status, s.age, s.seq);
  writeFileSync(new URL(`./${name}.html`, import.meta.url), out);
  index += `<li><a style='color:#7ef9a0' href='./${name}.html'>${name}</a> — ${s.kind} / ${s.status} / age ${s.age}</li>`;
  console.log(`wrote ${name}.html (${out.length} bytes)`);
}
index += `</ul></body>`;
writeFileSync(new URL('./index.html', import.meta.url), index);
console.log('wrote index.html');
