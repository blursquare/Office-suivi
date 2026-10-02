'use strict';

// « Ce que CLAIRE a appris » (étude, 02/10) : journal des corrections commun à tous les postes, retrait
// d'une correction apprise, erreurs de lecture fréquentes dans le rapport technique.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');

const { creerApp } = require('../src/app');
const { ouvrirDb } = require('../src/db');
const { assainirJournalCorrections, MAX_JOURNAL_CORRECTIONS } = require('../src/parametresRepo');
const { erreursFrequentesJournal } = require('../src/rapportTechnique');

let db, serveurApp, baseUrl, jeton;

before(async () => {
  db = ouvrirDb(':memory:');
  const { app, gestionnaireAuth } = creerApp({ db, config: { motDePasse: 'm', racineRepo: os.tmpdir(), port: 0, jetonCalendrier: '' } });
  jeton = gestionnaireAuth.creerSession();
  serveurApp = app.listen(0);
  await new Promise((r) => serveurApp.once('listening', r));
  baseUrl = `http://127.0.0.1:${serveurApp.address().port}`;
});

after(() => { serveurApp.close(); db.close(); });

const appeler = (chemin, methode, corps) => fetch(`${baseUrl}${chemin}`, {
  method: methode || 'GET',
  headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
  body: corps ? JSON.stringify(corps) : undefined
});

test('assainirJournalCorrections : champ obligatoire, valeurs bornées, plafond', () => {
  const p = assainirJournalCorrections([
    { champ: 'prixVente', valeurExtraite: 250000, valeurCorrigee: '245000', date: '2026-10-01T10:00:00Z' },
    { champ: 'bad champ!', valeurExtraite: 'x' },
    null,
    { champ: 'nom', valeurExtraite: 'x'.repeat(500) }
  ]);
  assert.equal(p.length, 2);
  assert.equal(p[0].valeurExtraite, '250000');
  assert.equal(p[1].valeurExtraite.length, 200);
  const beaucoup = Array.from({ length: MAX_JOURNAL_CORRECTIONS + 20 }, (_, i) => ({ champ: 'nom', valeurCorrigee: String(i) }));
  const borne = assainirJournalCorrections(beaucoup);
  assert.equal(borne.length, MAX_JOURNAL_CORRECTIONS);
  assert.equal(borne[borne.length - 1].valeurCorrigee, String(MAX_JOURNAL_CORRECTIONS + 19));
});

test('journal des corrections : ajout depuis deux postes, lecture commune, vidage', async () => {
  await appeler('/api/corrections-extraction', 'POST', { entrees: [{ champ: 'pret', valeurExtraite: '2026-11-15', valeurCorrigee: '2026-11-30' }] });
  await appeler('/api/corrections-extraction', 'POST', { entrees: [{ champ: 'nom', valeurExtraite: 'A', valeurCorrigee: 'B' }] });
  let r = await (await appeler('/api/corrections-extraction')).json();
  assert.equal(r.journal.map((e) => e.champ).join(','), 'pret,nom');
  assert.equal((await appeler('/api/corrections-extraction', 'POST', { entrees: 'x' })).status, 400);
  await appeler('/api/corrections-extraction', 'DELETE');
  r = await (await appeler('/api/corrections-extraction')).json();
  assert.equal(r.journal.length, 0);
});

test('correction apprise retirée par son identifiant', async () => {
  const c = { id: 'c-1', tokens: ['condition', 'suspensive', 'obtention'], categorie: 'date', classification: 'pret' };
  await appeler('/api/corrections-apprises', 'POST', { correction: c });
  await appeler('/api/corrections-apprises', 'POST', { correction: Object.assign({}, c, { id: 'c-2' }) });
  const r = await (await appeler('/api/corrections-apprises/c-1', 'DELETE')).json();
  assert.equal(r.corrections.map((x) => x.id).join(','), 'c-2');
  assert.equal((await appeler('/api/corrections-apprises/inconnu', 'DELETE')).status, 404);
});

test('erreursFrequentesJournal : 3 corrections ou plus sur 30 jours, les plus anciennes ignorées', () => {
  const j = [
    { champ: 'prixVente', date: '2026-09-20T10:00:00Z' }, { champ: 'prixVente', date: '2026-09-25T10:00:00Z' },
    { champ: 'prixVente', date: '2026-10-01T10:00:00Z' }, { champ: 'nom', date: '2026-10-01T10:00:00Z' },
    { champ: 'nom', date: '2026-10-01T11:00:00Z' }, { champ: 'nom', date: '2026-07-01T10:00:00Z' }
  ];
  const f = erreursFrequentesJournal(j, '2026-10-02T12:00:00Z');
  assert.equal(f.map((x) => `${x.champ}:${x.nombre}`).join(','), 'prixVente:3');
});

test('rapport technique : section « Erreurs de lecture fréquentes », sans aucune valeur', () => {
  const { construireRapport } = require('../src/rapportTechnique');
  const jusqua = '2026-10-02T10:00:00Z';
  const journal = ["09-29", "09-30", "10-01"].map((j) => ({ champ: "prixVente", valeurExtraite: "250000", valeurCorrigee: "245000", date: `2026-${j}T08:00:00Z` }));
  const r = construireRapport({ depuis: '2026-10-01T00:00:00Z', jusqua, evenements: [], journalCorrections: journal, dossiers: [], mots: new Set() });
  assert.match(r.corps, /## Erreurs de lecture fréquentes/);
  assert.match(r.corps, /prixVente : 3 correction/);
  assert.doesNotMatch(r.corps, /245000|250000/);
  assert.equal(r.calme, false);
});

test('rapport technique : « Ce que CLAIRE a appris » — clauses et commentaires anonymisés, aucune valeur ni aucun nom ne sort', () => {
  const { construireRapport, motsSensibles, natureCorrection } = require('../src/rapportTechnique');
  const dossiers = [{ id: 'd1', nom: 'MARTEL / FOURNIER', adresseBien: 'VINEUIL (41350), 3 chemin des Vignes',
    parties: [{ role: 'VENDEUR', nom: 'Alexandre Martel' }, { role: 'ACQUEREUR', nom: 'Camille Fournier' }], notaireAcquereur: 'Maître Jean Dupuis' }];
  const mots = motsSensibles(dossiers, ['Julie VASSELIN']);
  const jusqua = '2026-10-02T10:00:00Z';
  const r = construireRapport({
    depuis: '2026-10-01T00:00:00Z', jusqua, evenements: [], dossiers, mots,
    journalCorrections: [
      { champ: 'pret', origine: 'regex', typeActe: 'PROMESSE_DE_VENTE', valeurExtraite: '2026-11-15', valeurCorrigee: '2026-11-30', date: '2026-10-01T09:00:00Z',
        extrait: "Monsieur Alexandre Martel s'oblige à obtenir le prêt au plus tard le 15 novembre 2026 auprès de la banque." },
      { champ: 'prixVente', origine: 'authentic', valeurExtraite: '250000', valeurCorrigee: '245000', date: '2026-10-01T10:00:00Z', extrait: 'Prix : 250.000,00 euros payé par Camille Fournier' },
      { champ: 'notaireAcquereur', valeurExtraite: null, valeurCorrigee: 'Maître Jean Dupuis', date: '2026-10-01T11:00:00Z' }
    ],
    correctionsApprises: [{ id: 'c1', categorie: 'date', classification: 'acte', nbConfirmations: 2, dateMaj: '2026-10-01T12:00:00Z',
      contexteExemple: 'La réitération par acte authentique avec Madame FOURNIER aura lieu au plus tard le 15 décembre 2026' }],
    exclusionsPieces: { 'etat-date': ['etat date martel'] },
    retoursAudit: [{ id: 'r1', verdict: 'faux_positif', portee: 'tous', date: '2026-10-01T13:00:00Z', mode: 'compromis',
      commentaire: 'La clause parle de la vente précédente de Monsieur Martel, 3 chemin des Vignes',
      constat: { titre: 'Servitude non reprise (Fournier)', categorie: 'servitudes', gravite: 'IMPORTANT', phrase: 'Le fonds de M. MARTEL est grevé' } }]
  });
  const c = r.corps;
  assert.match(c, /## Ce que CLAIRE a appris/);
  assert.match(c, /pret \(proposé par regex\).*lu, date décalée de \+15 j/);
  assert.match(c, /notaireAcquereur : non trouvé, saisi à la main/);
  assert.match(c, /Clause lue : `Monsieur \[nom\] s'oblige à obtenir le prêt/);
  assert.match(c, /date → acte \(confirmé 2 fois\)/);
  assert.match(c, /etat-date : 1/);
  assert.match(c, /faux positif · tous les dossiers/);
  assert.match(c, /reclassé/);
  for (const interdit of [/martel/i, /fournier/i, /dupuis/i, /vignes/i, /vineuil/i, /250\.?000/, /245\.?000/, /2026-11-30/, /Alexandre/, /Camille/]) {
    assert.doesNotMatch(c, interdit, `fuite : ${interdit}`);
  }
  assert.equal(natureCorrection({ valeurExtraite: 'A', valeurCorrigee: '' }), 'lu, effacé');
  assert.equal(natureCorrection({ valeurExtraite: 'A', valeurCorrigee: 'B' }), 'lu, changé');
});
