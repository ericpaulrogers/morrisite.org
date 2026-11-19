// Run after build_index.py: writes index.json, the precomputed search index the Worker loads.
import fs from 'fs'; import * as A from './askcore.js';
const P = JSON.parse(fs.readFileSync('passages.json', 'utf8'));
fs.writeFileSync('index.json', JSON.stringify(A.packIndex(A.buildIndex(P))));
console.log('index.json written for', P.length, 'passages');
