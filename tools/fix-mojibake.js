/**
 * Fix mojibake/special-character artifacts across public HTML files.
 * Usage: node tools/fix-mojibake.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PUB = path.join(ROOT, 'public');

const REPLACEMENTS = [
  ['Â©', '©'],
  ['Â®', '®'],
  ['Â ', ' '],
  ['â€“', '–'],
  ['â€”', '—'],
  ['â€™', "'"],
  ['â€˜', "'"],
  ['â€œ', '"'],
  ['â€', '"'],
  ['â€¦', '…'],
  ['â€¢', '•'],
  ['â€¯', ' '],
  [/ðŸ[..]?/g, ''], // strip emoji mojibake
  [/�/g, ''],
];

function fixContent(txt) {
  let out = txt;
  for (const [from, to] of REPLACEMENTS) {
    if (from instanceof RegExp) out = out.replace(from, to);
    else out = out.split(from).join(to);
  }
  return out;
}

function walk(dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

function main() {
  const files = walk(PUB).filter(f => /\.html?$/i.test(f));
  let changed = 0;
  for (const f of files) {
    const prev = fs.readFileSync(f, 'utf8');
    const next = fixContent(prev);
    if (next !== prev) { fs.writeFileSync(f, next, 'utf8'); changed++; }
  }

  // Solutions table cleanup
  const sol = path.join(PUB, 'solutions.html');
  if (fs.existsSync(sol)) {
    let s = fs.readFileSync(sol, 'utf8');
    s = s.replace(/>\s*1\S*?kW\s*</g, '>1 kW<')
         .replace(/>\s*3\S*?kW\s*</g, '>3 kW<')
         .replace(/>\s*6\S*?kW\s*</g, '>6 kW<')
         .replace(/>\s*9\S*?kW\s*</g, '>9 kW<')
         .replace(/>\s*12\S*?kW\s*</g, '>12 kW<')
         .replace(/>[^<]*1[^<]*rooms[^<]*</, '>1–2 rooms, TV, phone charging<')
         .replace(/>[^<]*Small[^<]*home[^<]*</, '>Small home, fridge, TV, internet<')
         .replace(/>[^<]*Full[^<]*house[^<]*</, '>Full house: appliances, entertainment, water pump<')
         .replace(/>[^<]*Large[^<]*family[^<]*</, '>Large family homes, partial A/C<')
         .replace(/>[^<]*Premium[^<]*homes[^<]*</, '>Premium homes, backup + solar split loads<');
    fs.writeFileSync(sol, s, 'utf8');
  }

  console.log(`Fixed mojibake in ${changed} file(s).`);
}

main();

