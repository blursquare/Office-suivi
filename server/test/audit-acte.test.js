'use strict';

// Outil 2 (Audit des actes) — route /api/audit-acte/* devant un faux Ollama, et les deux fonctions
// pures de routage/troncature des documents (server/src/routes/auditActe.js).
//
// Trois comportements comptent particulièrement ici :
//   - le ROUTAGE des documents par type vers les seules passes qui en ont besoin (garder chaque
//     appel Ollama petit sur le CPU de bureau de l'étude) ;
//   - l'ISOLATION des passes : l'échec d'une seule (JSON hors schéma deux fois de suite) ne doit
//     pas priver l'étude des autres, déjà calculées ;
//   - le CALCUL DE VALIDITÉ des diagnostics fait en JS pur à partir de ce que le modèle a identifié,
//     jamais recalculé ni inventé par le modèle lui-même (§4/§14 du cahier des charges).

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');

const { creerApp } = require('../src/app');
const { ouvrirDb } = require('../src/db');
const { demarrerFauxOllama } = require('./helpers/faux-ollama');
const { documentsPourPasse, preparerDocumentsPourPasse, TYPES_PAR_PASSE, LIMITE_CARACTERES_PAR_DOCUMENT, PLAFOND_CARACTERES_PASSE } = require('../src/routes/auditActe');
const { construirePromptIdentification, construirePromptTravaux } = require('../src/audit/prompts');

// ---- documentsPourPasse : routage par type ----

test('documentsPourPasse ne garde que les types déclarés pertinents pour la passe', () => {
  const documents = [
    { nom: 'Projet.pdf', type: 'principal' }, { nom: 'DPE.pdf', type: 'diagnostic' },
    { nom: 'Titre.pdf', type: 'titre' }, { nom: 'Facture.pdf', type: 'facture' }
  ];
  assert.deepEqual(documentsPourPasse(documents, 'diagnostics').map((d) => d.nom), ['Projet.pdf', 'DPE.pdf']);
  assert.deepEqual(documentsPourPasse(documents, 'identification').map((d) => d.nom), ['Projet.pdf', 'Titre.pdf']);
  assert.deepEqual(documentsPourPasse(documents, 'travaux').map((d) => d.nom), ['Projet.pdf', 'Facture.pdf']);
});

test('TYPES_PAR_PASSE : "principal" figure dans les 5 passes', () => {
  for (const passe of Object.keys(TYPES_PAR_PASSE)) {
    assert.ok(TYPES_PAR_PASSE[passe].includes('principal'), passe);
  }
});

// ---- preparerDocumentsPourPasse : troncature ----

test('preparerDocumentsPourPasse tronque un document trop long et le signale', () => {
  const long = 'x'.repeat(LIMITE_CARACTERES_PAR_DOCUMENT + 500);
  const [resultat] = preparerDocumentsPourPasse([{ nom: 'Gros.pdf', texte: long }]);
  assert.equal(resultat.texte.length, LIMITE_CARACTERES_PAR_DOCUMENT);
  assert.equal(resultat.tronque, true);
});

test('preparerDocumentsPourPasse ne tronque pas un document sous la limite', () => {
  const [resultat] = preparerDocumentsPourPasse([{ nom: 'Court.pdf', texte: 'un texte court' }]);
  assert.equal(resultat.tronque, false);
  assert.equal(resultat.texte, 'un texte court');
});

test('preparerDocumentsPourPasse omet un document entier une fois le plafond de la passe atteint', () => {
  // Trois documents pile au plafond PAR DOCUMENT (aucune troncature individuelle) épuisent déjà le
  // plafond GLOBAL de la passe (60 000 = 3 × 20 000) : le quatrième doit être omis en entier, pas
  // coupé en plein milieu.
  const plein = 'a'.repeat(LIMITE_CARACTERES_PAR_DOCUMENT);
  assert.equal(plein.length * 3, PLAFOND_CARACTERES_PASSE);
  const documents = [
    { nom: 'A.pdf', texte: plein }, { nom: 'B.pdf', texte: plein }, { nom: 'C.pdf', texte: plein },
    { nom: 'D.pdf', texte: 'ce document ne doit jamais apparaître dans le résultat' }
  ];
  const resultat = preparerDocumentsPourPasse(documents);
  assert.deepEqual(resultat.map((d) => d.nom), ['A.pdf', 'B.pdf', 'C.pdf']);
});

// ---- Prompts : la consigne de comparaison n'apparaît qu'avec une référence ----

test('construirePromptIdentification/Travaux n’ajoutent la consigne de comparaison qu’avec avecReference', () => {
  const docs = [{ nom: 'Projet.pdf', texte: 'x', tronque: false }];
  assert.doesNotMatch(construirePromptIdentification(docs, false), /compromis ou une promesse de référence/);
  assert.match(construirePromptIdentification(docs, true), /compromis ou une promesse de référence/);
  assert.doesNotMatch(construirePromptTravaux(docs, false), /compromis ou une promesse de référence/);
  assert.match(construirePromptTravaux(docs, true), /compromis ou une promesse de référence/);
});

// ---- Route /api/audit-acte/* devant un faux Ollama ----

function config(ollamaUrl) {
  return { motDePasse: 'mdp-test', racineRepo: os.tmpdir(), port: 0, jetonCalendrier: '', ollama: { url: ollamaUrl, modele: 'llama3.1:8b' } };
}

const PROJET_TEXTE = 'Le vendeur Monsieur Jean Dupont vend a Monsieur Paul Martin. Prix : deux cent mille euros.';
const DPE_TEXTE = 'Diagnostic de performance energetique etabli le 01 janvier 2010 pour le bien vendu.';

function documentsBase() {
  return [
    { nom: 'Projet.pdf', type: 'principal', texte: PROJET_TEXTE, pages: [{ numero: 1, debut: 0, fin: PROJET_TEXTE.length }] },
    { nom: 'DPE.pdf', type: 'diagnostic', texte: DPE_TEXTE, pages: [{ numero: 1, debut: 0, fin: DPE_TEXTE.length }] }
  ];
}

const REPONSE_IDENTIFICATION = JSON.stringify({
  constats: [
    { categorie: 'PARTIES', gravite: 'CRITIQUE', titre: 'Nom différent', description: 'Écart de nom entre deux pièces.', action: null, sources: [{ document: 'Projet.pdf', extrait: 'Monsieur Jean Dupont' }] },
    { categorie: 'DATES', gravite: 'A_VERIFIER', titre: 'Date à vérifier', description: 'Une date reste incertaine.', action: null, sources: [] }
  ]
});
const REPONSE_DIAGNOSTICS = JSON.stringify({
  diagnostics: [{ nature: 'DPE', document: 'DPE.pdf', dateEtablissement: '2010-01-01', bienConcerne: null, extrait: 'Diagnostic de performance energetique' }]
});
const REPONSE_TRAVAUX = JSON.stringify({ travaux: [] });
const REPONSE_URBANISME = JSON.stringify({
  constats: [
    { categorie: 'PREEMPTION', gravite: 'A_VERIFIER', titre: 'DPU non retrouvé', description: '...', action: null, sources: [] },
    { categorie: 'URBANISME', gravite: 'INFORMATION', titre: 'Zone U', description: '...', action: null, sources: [] }
  ]
});
const REPONSE_COPROPRIETE = JSON.stringify({ copropriete: [{ gravite: 'INFORMATION', titre: 'Charges à jour', description: '...', action: null, sources: [] }] });

let db, serveurApp, baseUrl, jeton, fauxOllama;

before(async () => {
  fauxOllama = await demarrerFauxOllama(REPONSE_IDENTIFICATION);
  db = ouvrirDb(':memory:');
  const { app, gestionnaireAuth } = creerApp({ db, config: config(fauxOllama.url) });
  jeton = gestionnaireAuth.creerSession();
  serveurApp = app.listen(0);
  await new Promise((resolve) => serveurApp.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${serveurApp.address().port}`;
});

after(() => {
  serveurApp.close();
  fauxOllama.serveur.close();
  db.close();
});

function appeler(corps) {
  return fetch(`${baseUrl}/api/audit-acte/analyser`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(corps)
  });
}

test('GET /api/audit-acte/disponibilite sans authentification : 401', async () => {
  assert.equal((await fetch(`${baseUrl}/api/audit-acte/disponibilite`)).status, 401);
});

test('GET /api/audit-acte/disponibilite : renvoie l’état du modèle configuré', async () => {
  const reponse = await fetch(`${baseUrl}/api/audit-acte/disponibilite`, { headers: { Authorization: `Bearer ${jeton}` } });
  const corps = await reponse.json();
  assert.equal(corps.disponible, true);
  assert.equal(corps.modele, 'llama3.1:8b');
});

test('POST /api/audit-acte/analyser sans document "principal" : 400', async () => {
  const reponse = await appeler({ documents: [{ nom: 'DPE.pdf', type: 'diagnostic', texte: DPE_TEXTE, pages: [] }] });
  assert.equal(reponse.status, 400);
});

test('POST /api/audit-acte/analyser : Ollama indisponible renvoie 503', async () => {
  const db2 = ouvrirDb(':memory:');
  const { app: app2, gestionnaireAuth: auth2 } = creerApp({ db: db2, config: config('http://127.0.0.1:1') });
  const jeton2 = auth2.creerSession();
  const serveur2 = app2.listen(0);
  await new Promise((resolve) => serveur2.once('listening', resolve));
  const reponse = await fetch(`http://127.0.0.1:${serveur2.address().port}/api/audit-acte/analyser`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jeton2}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ documents: documentsBase() })
  });
  assert.equal(reponse.status, 503);
  serveur2.close();
  db2.close();
});

test('POST /api/audit-acte/analyser : 4 passes (sans copropriété), constats routés dans les bons tableaux', async () => {
  fauxOllama.reinitialiser();
  fauxOllama.definirReponses([REPONSE_IDENTIFICATION, REPONSE_DIAGNOSTICS, REPONSE_TRAVAUX, REPONSE_URBANISME]);
  const reponse = await appeler({ mode: 'compromis', documents: documentsBase() });
  assert.equal(reponse.status, 200);
  const corps = await reponse.json();

  assert.equal(corps.constats.length, 1); // PARTIES (pas DATES, routé à part)
  assert.equal(corps.constats[0].categorie, 'PARTIES');
  assert.equal(corps.constats[0].sourceVerifiee, true); // "Monsieur Jean Dupont" figure bien dans Projet.pdf

  assert.equal(corps.dates.length, 1);
  assert.equal(corps.dates[0].categorie, 'DATES');

  assert.equal(corps.diagnostics.length, 1);
  assert.equal(corps.diagnostics[0].statutValidite, 'EXPIRE'); // établi en 2010, DPE valable 10 ans
  assert.equal(corps.diagnostics[0].gravite, 'IMPORTANT');
  assert.equal(corps.diagnostics[0].sourceVerifiee, true);

  assert.equal(corps.preemptions.length, 1);
  assert.equal(corps.urbanisme.length, 1);
  assert.equal(corps.servitudes.length, 0);
  assert.equal(corps.copropriete.length, 0); // pas demandée (pas de copropriété)

  assert.equal(corps.erreursPasses.length, 0);
  assert.equal(corps.resume.nombreDocuments, 2);
  assert.ok(corps.resume.syntheseParGravite.IMPORTANT >= 1);
  assert.equal(fauxOllama.appels, 4);
});

test('POST /api/audit-acte/analyser avec typeVente=copropriete : une 5e passe est exécutée', async () => {
  fauxOllama.reinitialiser();
  fauxOllama.definirReponses([REPONSE_IDENTIFICATION, REPONSE_DIAGNOSTICS, REPONSE_TRAVAUX, REPONSE_URBANISME, REPONSE_COPROPRIETE]);
  const corps = await (await appeler({ typeVente: 'copropriete', documents: documentsBase() })).json();
  assert.equal(corps.copropriete.length, 1);
  assert.equal(fauxOllama.appels, 5);
});

test('une passe qui échoue deux fois de suite n’empêche pas les autres de répondre', async () => {
  fauxOllama.reinitialiser();
  // identification (1 appel) puis diagnostics (1 appel) réussissent ; travaux échoue sur ses DEUX
  // tentatives (genererJson ne relance qu'une fois) ; urbanisme (1 appel) réussit malgré tout.
  fauxOllama.definirReponses([REPONSE_IDENTIFICATION, REPONSE_DIAGNOSTICS, 'ceci n\'est pas du JSON', 'ceci n\'est pas du JSON', REPONSE_URBANISME]);
  const corps = await (await appeler({ documents: documentsBase() })).json();
  assert.equal(corps.erreursPasses.length, 1);
  assert.equal(corps.erreursPasses[0].passe, 'travaux');
  assert.equal(corps.travaux.length, 0);
  assert.equal(corps.constats.length, 1); // identification n'a pas été affectée
  assert.equal(corps.urbanisme.length, 1); // urbanisme non plus, exécutée malgré l'échec de travaux
  assert.equal(fauxOllama.appels, 5);
});
