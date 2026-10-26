// « Demander à CLAIRE » prépare un nouveau dossier de vente depuis un compromis joint (24/10) : sans PDF joint ou sans formulaire préparé,
// rien n'est lu ni créé.
const test = require('node:test');
const assert = require('node:assert');
const { chargerApplication } = require('./helpers/load-app.js');

test('un document inconnu ou qui n’est pas un PDF joint est refusé, sans rien ouvrir', async () => {
  const app = chargerApplication();
  const r = await app.nouveauDossierDepuisCompromisAgent({ mode: 'preparer', document_id: 'pj9', responsable: '' });
  assert.match(r.erreur, /PDF joint au message/);
});

test('créer sans formulaire préparé : erreur claire, aucune carte d’autorisation', async () => {
  const app = chargerApplication();
  const r = await app.nouveauDossierDepuisCompromisAgent({ mode: 'creer', document_id: '', responsable: '' });
  assert.match(r.erreur, /prépare-le d’abord/);
});

test('yousign_rib : dossier inconnu, état sans brouillon créé, acquéreur absent — refusés avant toute demande', async () => {
  const app = chargerApplication();
  assert.match((await app.yousignRibAgent({ action: 'statut', dossier_id: 'zz', acquereur: 1 })).erreur, /introuvable/);
  require('node:vm').runInContext("dossiers.push({ id: 'd1', nom: 'A / B', parties: [{ role: 'VENDEUR', nom: 'Paul DUPONT' }] });", app);
  assert.match((await app.yousignRibAgent({ action: 'statut', dossier_id: 'd1', acquereur: 1 })).erreur, /aucun brouillon/);
  assert.match((await app.yousignRibAgent({ action: 'brouillon', dossier_id: 'd1', acquereur: 1 })).erreur, /aucun acquéreur/);
});

test('sans PDF ni dossier d’Authentic choisi : rien n’est préparé', async () => {
  const app = chargerApplication();
  const r = await app.nouveauDossierDepuisCompromisAgent({ mode: 'preparer', document_id: '', authentic_id: '', responsable: '' });
  assert.match(r.erreur, /authentic_id/);
});

test('compromis : un PDF joint ou un PDF du NAS est repris, un autre document est refusé', async () => {
  const app = chargerApplication();
  const pdf = { name: 'c.pdf' };
  assert.equal(await app.fichierCompromisAgent({ sorte: 'joint', sortePiece: 'pdf', fichier: pdf }), pdf);
  assert.equal(await app.fichierCompromisAgent({ sorte: 'joint', sortePiece: 'image', fichier: pdf }), null);
  assert.equal(await app.fichierCompromisAgent({ sorte: 'fichier', chemin: 'DOSSIER/compromis.docx' }), null, 'un Word du NAS n’est pas un PDF');
  assert.equal(await app.fichierCompromisAgent({ sorte: 'scan', chemin: 'x.pdf' }), null);
  assert.equal(await app.fichierCompromisAgent(null), null);
});

test('yousign_rib : toujours sa propre carte, jamais couverte par « Autoriser pour toute cette demande » (audit 26/10)', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'client', '110-assistant-nouveau-dossier.js'), 'utf8');
  const i = src.indexOf("'/api/signature-rib/brouillon'");
  assert.ok(i > 0);
  assert.match(src.slice(Math.max(0, i - 400), i), /demanderAutorisationAgent\(description, \{ strict: true \}\)/);
});
