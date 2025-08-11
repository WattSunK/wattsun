// Save as scan_rename_suggestions.js

const fs = require('fs');
const path = require('path');

const items = JSON.parse(fs.readFileSync('/volume1/web/wattsun/items.json', 'utf8'));
const imgDir = '/volume1/web/wattsun/public/images/products';

const images = fs.readdirSync(imgDir);

// Create sets for faster lookup
const filesSet = new Set(images);

const normalize = s => s ? s.toLowerCase().replace(/[-_\s\.]+/g,'') : '';

// Map normalized filename to actual filename
const normMap = {};
images.forEach(img => normMap[normalize(img)] = img);

let missing = [];
let renameSuggestions = [];

items.forEach(item => {
  if (!item.image) return;
  const wantFile = item.image;
  if (filesSet.has(wantFile)) {
    // Exact match exists
    return;
  }
  // Try to find a normalized match
  const norm = normalize(wantFile);
  if (normMap[norm]) {
    // Suggest a rename
    renameSuggestions.push({ from: normMap[norm], to: wantFile });
  } else {
    // File is missing entirely
    missing.push(wantFile);
  }
});

// Print results
console.log("=== Files that should be renamed ===");
renameSuggestions.forEach(r => {
  console.log(`"${r.from}"  -->  "${r.to}"`);
});
console.log("\n=== Files missing (should exist but not found) ===");
missing.forEach(f => {
  console.log(f);
});
