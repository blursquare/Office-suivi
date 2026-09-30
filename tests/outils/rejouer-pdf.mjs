#!/usr/bin/env node
// Banc de lecture des pièces de l'appel de fonds et du prorata sur de VRAIS PDF (jamais commités).
//
//   npm i --no-save pdfjs-dist@4.10.38          (une fois par session ; --no-save : package.json intact)
//   node tests/outils/rejouer-pdf.mjs chemin/vers/un.pdf [autre.pdf …]
//   node tests/outils/rejouer-pdf.mjs --lignes un.pdf   (affiche aussi les lignes reconstruites)
//
// Pour chaque PDF : les items pdf.js sont extraits comme dans le navigateur (mêmes items que le
// pdf.js 3.11 du client), puis TOUS les lecteurs de script.js sont appliqués — avis de taxe
// foncière (page 1 et bas de page 2), appel de charges, état daté, relevé de compte client — et
// leur résultat est imprimé en JSON. C'est ainsi que les huit documents du 30/09 ont été rejoués.
// Un document scanné sans texte donne des lignes vides : dans CLAIRE, c'est l'OCR qui prend le relais.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const racine = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const args = process.argv.slice(2);
const avecLignes = args.includes('--lignes');
const fichiers = args.filter(a => !a.startsWith('--'));
if (!fichiers.length) {
  console.error('Usage : node tests/outils/rejouer-pdf.mjs [--lignes] fichier.pdf [fichier2.pdf …]');
  process.exit(1);
}

let pdfjs;
try {
  pdfjs = await import(path.join(racine, 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.mjs'));
} catch (e) {
  console.error('pdfjs-dist introuvable : lancez d’abord  npm i --no-save pdfjs-dist@4.10.38  à la racine du dépôt.');
  process.exit(1);
}

const { chargerApplication } = require(path.join(racine, 'tests', 'helpers', 'load-app.js'));
const app = chargerApplication();

for (const fichier of fichiers) {
  const data = new Uint8Array(fs.readFileSync(fichier));
  const pdf = await pdfjs.getDocument({ data, useSystemFonts: true, verbosity: 0 }).promise;
  const pages = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const contenu = await page.getTextContent();
    pages.push(contenu.items.filter(it => typeof it.str === 'string'));
  }
  const lignesPositions = pages.flatMap(items => app.lignesAvecPositionsDepuisItems(items));
  const lignes = lignesPositions.map(l => l.texte);
  const texte = lignes.join('\n');
  const xy = (items) => items.map(it => ({ str: it.str, x: it.transform[4], y: it.transform[5] }));

  console.log(`\n===== ${path.basename(fichier)} — ${pdf.numPages} page(s), ${lignes.length} ligne(s) de texte`);
  if (avecLignes) { lignes.forEach((l, i) => console.log(String(i + 1).padStart(4), l)); console.log(''); }
  const resultats = {
    avisTaxeFonciere: {
      enTete: app.montantAvisTaxeFonciereEnTete(app.lignesDepuisItemsPdf(pages[0])),
      basDroitePage2: pages[1] ? app.montantBasDroitePage(xy(pages[1])) : null
    },
    appelCharges: app.analyserAppelCharges(texte),
    etatDate: app.fondsTravauxDepuisEtatDate(texte),
    offrePret: { montant: app.detecterMontantPret(texte), garanties: app.detecterGarantiesPret(texte) },
    releveCompte: (() => { const r = app.analyserReleveCompteClient(lignesPositions); return { titre: r.titre, nature: r.nature, ecritures: r.ecritures.length, recu: r.recu, reverse: r.reverse, tiers: r.tiers, solde: r.solde, ambigues: r.ambigues }; })()
  };
  console.log(JSON.stringify(resultats, null, 2));
}
process.exit(0);
