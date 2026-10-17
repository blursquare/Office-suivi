// Extension d'essai (étude 17/10 : « fais-moi un add-on test avec de fausses données pré-remplies que je teste sur mon Mac ») : la même
// extension Chrome que celle du bureau, sans serveur CLAIRE — un dossier INVENTÉ est intégré (fiche construite par server/src/gnau.js, comme
// au bureau). Usage : node scripts/construire-extension-essai.mjs <dossier de sortie> → <sortie>/CLAIRE-essai/ et CLAIRE-extension-essai.zip.
// Rien n'est jamais transmis : liste noire des boutons et arrêt avant « Transmettre ma demande », comme l'extension du bureau.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { ficheGnau } = require(path.join(racine, 'server', 'src', 'gnau.js'));
const sortie = path.resolve(process.argv[2] || path.join(racine, 'dist-essai'));
const cible = path.join(sortie, 'CLAIRE-essai');

// Données inventées — l'adresse est une adresse publique de Blois (pour que l'assistant du guichet la propose), les personnes et les
// parcelles sont fictives.
const dossiers = [{
  id: 'essai1', nom: 'ESSAI / EXEMPLE', typeVente: 'maison', adresseBien: 'BLOIS (41000), 9 place Saint-Louis', prixVente: 185000, prixMobilier: 3000,
  referenceAuthentic: 'A 2026 99999',
  honoraires: { negociateur: 'agence', nom: 'AGENCE FICTIVE', montantTTC: 8000, charge: 'ACQUEREUR' },
  parties: [{ role: 'VENDEUR', nom: 'Jean ESSAI', civilite: 'M' }, { role: 'ACQUEREUR', nom: 'Marie EXEMPLE', civilite: 'Mme' }],
  authentic: {
    immeubles: [{ commune: 'BLOIS', codePostal: '41000', adresse: '9 place Saint-Louis 41000 BLOIS', parcelles: [
      { section: 'BA', numero: '21', surface: '234' }, { section: 'BA', numero: '22', surface: '333' },
      { section: 'BA', numero: '23', surface: '2311' }, { section: 'RE', numero: '432', surface: '111' }] }],
    fichesClients: {
      a: { nom: 'Jean ESSAI', nomFamille: 'ESSAI', prenom: 'Jean', civilite: 'M', dateNaissance: '1960-01-01', lieuNaissance: '41000 BLOIS', domicile: '1 rue Fictive 41000 BLOIS', adresse: { codePostal: '41000', commune: 'BLOIS' }, profession: 'Retraité' },
      b: { nom: 'Marie EXEMPLE', nomFamille: 'EXEMPLE', prenom: 'Marie', civilite: 'Mme', dateNaissance: '1985-06-15', lieuNaissance: '37000 TOURS', domicile: '2 rue Imaginaire 41000 BLOIS', adresse: { codePostal: '41000', commune: 'BLOIS' }, profession: 'Professeure' }
    }
  }
}];
const aujourdhui = new Date().toISOString().slice(0, 10);
const fiches = {};
for (const d of dossiers) for (const p of ['cua', 'dia']) fiches[`${d.id}|${p}`] = ficheGnau(d, p, aujourdhui);
const liste = dossiers.map((d) => ({ id: d.id, libelle: 'VTE - ' + d.nom + ' (ESSAI)', commune: 'BLOIS', reference: d.referenceAuthentic }));

fs.rmSync(cible, { recursive: true, force: true });
fs.cpSync(path.join(racine, 'extension-chrome'), cible, { recursive: true });

// Manifeste : autre nom, pour ne jamais la confondre avec celle du bureau.
const man = JSON.parse(fs.readFileSync(path.join(cible, 'manifest.json'), 'utf8'));
man.name = 'CLAIRE — ESSAI (données inventées)';
man.description = 'Extension d’essai : un dossier inventé, sans serveur CLAIRE. Ne transmet jamais rien.';
man.action.default_title = 'CLAIRE — ESSAI';
fs.writeFileSync(path.join(cible, 'manifest.json'), JSON.stringify(man, null, 2) + '\n');

// Panneau : réponses du « serveur » données par le dossier inventé.
fs.writeFileSync(path.join(cible, 'lib', 'essai.js'), `// Données inventées de l'extension d'essai (construite par scripts/construire-extension-essai.mjs).
globalThis.CLAIRE_ESSAI = ${JSON.stringify({ dossiers: liste, fiches }, null, 1)};
(() => {
  const vrai = globalThis.fetch.bind(globalThis);
  const reponse = (j) => new Response(JSON.stringify(j), { status: 200, headers: { 'Content-Type': 'application/json' } });
  globalThis.fetch = async (url, o) => {
    const u = String(url);
    if (!u.startsWith('essai:')) return vrai(url, o);
    if (u.includes('/api/health')) return reponse({ ok: true });
    if (u.includes('/api/gnau/dossiers')) return reponse({ dossiers: globalThis.CLAIRE_ESSAI.dossiers });
    const m = /\\/api\\/gnau\\/fiche\\/([^?]+)\\?procedure=(\\w+)/.exec(u);
    if (m) return reponse({ fiche: globalThis.CLAIRE_ESSAI.fiches[decodeURIComponent(m[1]) + '|' + m[2]] });
    return new Response(JSON.stringify({ erreur: 'Pas dans l’essai.' }), { status: 404 });
  };
})();
`);
// Plan cadastral de l'essai : un PDF inventé d'une page (« PLAN CADASTRAL — ESSAI »), joint à la pièce CU1 comme le plan du NAS au bureau.
const pdf = (() => {
  const texte = 'BT /F1 28 Tf 72 720 Td (PLAN CADASTRAL - ESSAI) Tj 0 -40 Td /F1 14 Tf (Donnees inventees - ne pas transmettre) Tj ET';
  const objets = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${texte.length} >>\nstream\n${texte}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let corps = '%PDF-1.4\n';
  const positions = objets.map((o, i) => { const pos = corps.length; corps += `${i + 1} 0 obj\n${o}\nendobj\n`; return pos; });
  const xref = corps.length;
  corps += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n` + positions.map((p) => String(p).padStart(10, '0') + ' 00000 n \n').join('')
    + `trailer\n<< /Size ${objets.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(corps, 'latin1').toString('base64');
})();
fs.writeFileSync(path.join(cible, 'lib', 'plan-essai.js'), `// Plan inventé de l'extension d'essai.\nglobalThis.CLAIRE_PLAN_ESSAI = ${JSON.stringify(pdf)};\n`);
let bg = fs.readFileSync(path.join(cible, 'background.js'), 'utf8');
const repereBg = 'case "content.plan": {';
if (!bg.includes(repereBg)) throw new Error('background.js a changé (' + repereBg + ') : adapter la construction de l’essai.');
bg = 'importScripts("lib/plan-essai.js");\n' + bg.replace(repereBg, repereBg + '\n      if (globalThis.CLAIRE_PLAN_ESSAI) return { nom: "Plan cadastral (essai).pdf", source: "essai", b64: globalThis.CLAIRE_PLAN_ESSAI };');
fs.writeFileSync(path.join(cible, 'background.js'), bg);

let html = fs.readFileSync(path.join(cible, 'panel', 'panel.html'), 'utf8');
for (const repere of ['<script src="panel.js"></script>', '<section class="card" id="connexion">']) {
  if (!html.includes(repere)) throw new Error('panel.html a changé (' + repere + ') : adapter la construction de l’essai.');
}
html = html.replace('<script src="panel.js"></script>', '<script src="../lib/essai.js"></script>\n  <script src="panel.js"></script>')
  .replace('<section class="card" id="connexion">', '<p class="essai">ESSAI — dossier inventé, sans serveur CLAIRE. CLAIRE s’arrête avant « Transmettre » : supprimez ensuite le brouillon dans le guichet.</p>\n  <section class="card" id="connexion" hidden>');
fs.writeFileSync(path.join(cible, 'panel', 'panel.html'), html);
fs.appendFileSync(path.join(cible, 'panel', 'panel.css'), '\n.essai{margin:8px 12px;padding:8px 10px;border-radius:8px;background:#fff3cd;color:#6b4e00;font-size:12px}\n');
let panel = fs.readFileSync(path.join(cible, 'panel', 'panel.js'), 'utf8');
const avant = panel;
panel = panel.replace('serveur = st0.serveur || "";', 'serveur = "essai:";');
if (panel === avant) throw new Error('panel.js a changé : adapter la construction de l’essai.');
fs.writeFileSync(path.join(cible, 'panel', 'panel.js'), panel);

const zip = path.join(sortie, 'CLAIRE-extension-essai.zip');
fs.rmSync(zip, { force: true });
execFileSync('zip', ['-qr', zip, 'CLAIRE-essai'], { cwd: sortie });
console.log('Extension d’essai : ' + cible + '\n' + zip);
