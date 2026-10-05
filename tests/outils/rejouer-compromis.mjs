#!/usr/bin/env node
// Banc de lecture des AVANT-CONTRATS réels (jamais commités) : chaque PDF est lu comme « Nouveau dossier » le lit
// (texte page par page, arrêt aux annexes / à la signature — extraireTextesUtiles, sans OCR), puis
// construireExtractionRegex. Imprime, par document, les champs du panneau « Vérifier » trouvés et ceux qui resteraient
// « À compléter ».
//
//   npm i --no-save pdfjs-dist@4.10.38
//   node tests/outils/rejouer-compromis.mjs [--detail] compromis.pdf [autre.pdf …]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const racine = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const args = process.argv.slice(2);
const detail = args.includes('--detail');
const fichiers = args.filter(a => !a.startsWith('--'));
const pdfjs = await import(path.join(racine, 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.mjs'));
const { chargerApplication } = require(path.join(racine, 'tests', 'helpers', 'load-app.js'));
const app = chargerApplication();

// Champs lus dans l'acte (les champs « formulaire » — type de vente, responsable, rôle — viennent d'ailleurs).
const CLES = ['typeActe', 'nom', 'signature', 'pret', 'acte', 'ventebien', 'adresseBien', 'prixVente', 'prixMobilier',
  'emailAcquereur', 'emailVendeur', 'nomAgence', 'honorairesAgence', 'depotGarantie', 'sequestreDepot', 'notaireVendeur', 'notaireAcquereur', 'roleNotaire'];

const bilan = {};
for (const fichier of fichiers) {
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(fichier)), useSystemFonts: true, verbosity: 0 }).promise;
  // Même parcours que extraireTextesUtiles (sans OCR).
  const textesParPage = [];
  let dernierePageNumerotee = null, pageAnnexe = null, pageSignature = null;
  for (let i = 1; i <= pdf.numPages; i++) {
    const contenu = await (await pdf.getPage(i)).getTextContent();
    const t = contenu.items.map(it => it.str).join(' ');
    textesParPage.push(t);
    if (!dernierePageNumerotee) { const m = t.match(/page\s+(\d+)\s+sur\s+(\d+)/i); if (m && m[1] === m[2]) dernierePageNumerotee = i; }
    if (app.estDebutPageAnnexe(t)) { pageAnnexe = i; break; }
    if (pageSignature === null && app.detecteSignatureActe(t)) pageSignature = i;
    if (pageSignature !== null && i >= pageSignature + 2) break;
    if (i >= 120) break;
  }
  const utile = app.calculerDernierePageUtile(pageAnnexe, pageSignature, dernierePageNumerotee, textesParPage.length);
  const texte = textesParPage.slice(0, utile).join('\n');
  const date = app.detecterDateCompromis(texte) || '';
  const ex = app.construireExtractionRegex(texte, date, null, path.basename(fichier));
  const n = ex.notaires || {};
  const valeur = (cle) => {
    if (cle === 'notaireVendeur') return n.vendeur && (n.vendeur.nom || n.vendeur.valeur || n.vendeur.libelle);
    if (cle === 'notaireAcquereur') return n.acquereur && (n.acquereur.nom || n.acquereur.valeur || n.acquereur.libelle);
    if (cle === 'pret' && app.detecterFinancementComptant(texte)) return 'Sans prêt';
    const c = app.champRevision(ex, cle);
    if (!c) return null;
    if (cle === 'typeActe') return c.valeur && c.valeur !== 'INCONNU' ? c.valeur : null;
    return c.valeur || null;
  };
  const manquants = CLES.filter(c => !valeur(c));
  console.log(`\n===== ${path.basename(fichier)} — ${pdf.numPages} p., lues ${utile}, ${texte.length} car.${texte.trim().length < 200 ? ' (SCANNÉ : OCR au bureau)' : ''}`);
  console.log('  manquants :', manquants.join(', ') || '—');
  if (detail) for (const c of CLES) console.log('   ', c.padEnd(18), JSON.stringify(valeur(c)));
  for (const c of manquants) bilan[c] = (bilan[c] || 0) + 1;
}
console.log('\n===== Bilan (nombre de documents où le champ manque) :');
for (const [c, nb] of Object.entries(bilan).sort((a, b) => b[1] - a[1])) console.log('  ', c.padEnd(18), nb);
