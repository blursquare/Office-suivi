'use strict';

// Extraction assistée par lot (parties / bien / dates) : fonctions pures de normalisation, découpe
// du contexte, et la route elle-même montée devant un faux serveur Ollama — Ollama n'est pas
// installé dans cet environnement de développement (voir server/README.md).
//
// Deux comportements comptent particulièrement ici :
//   - la RELANCE unique de genererJson() quand le modèle renvoie un JSON hors schéma (vérifiée par
//     le compteur d'appels du faux serveur : sans lui, on ne saurait pas distinguer une relance
//     réussie d'une première réponse déjà bonne) ;
//   - la VÉRIFICATION DES EXTRAITS : un extrait que le modèle cite sans qu'il figure dans le texte
//     est signalé comme tel, c'est le seul garde-fou fiable contre une valeur inventée.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');

const { creerApp } = require('../src/app');
const { ouvrirDb } = require('../src/db');
const { demarrerFauxOllama } = require('./helpers/faux-ollama');
const { construireContexte, LOTS, LIMITE_CARACTERES_TEXTE } = require('../src/routes/extractionIa');
const { construireFenetres, localiserExtrait, verifierExtraits } = require('../src/extraction/extraits');
const {
  normaliserLotParties, normaliserLotBien, normaliserLotDates,
  validerLotParties, validerLotDates
} = require('../src/extraction/normaliser');

// ---- Normalisation des lots ----

test('lot parties : le rôle et la qualité sont conservés, une qualité inventée est effacée', () => {
  // La qualité pilote la correspondance qualité → rôle côté client : une valeur fantaisiste y
  // ferait plus de dégâts qu'une absence.
  const r = normaliserLotParties({
    typeActe: { valeur: 'PROMESSE_D_ACHAT', extrait: 'promesse unilatérale d’achat' },
    parties: [
      { nom: 'DUPONT', qualiteActe: 'promettant', role: 'ACQUEREUR', extrait: 'M. DUPONT, promettant' },
      { nom: 'SCI DU PARC', qualiteActe: 'propriétaire', role: 'VENDEUR', qualitePersonne: 'morale', representant: 'M. MARTIN', extrait: 'la SCI DU PARC' },
      { nom: 'SANS ROLE', qualiteActe: 'vendeur' }
    ]
  });
  assert.equal(r.typeActe.valeur, 'PROMESSE_D_ACHAT');
  assert.equal(r.parties.length, 2); // la partie sans rôle exploitable est écartée
  assert.equal(r.parties[0].qualiteActe, 'promettant');
  assert.equal(r.parties[1].qualiteActe, null); // « propriétaire » n'est pas une qualité connue
  assert.equal(r.parties[1].qualitePersonne, 'morale');
  assert.equal(r.parties[1].representant, 'M. MARTIN');
});

test('lot parties : un type d’acte hors énumération est ignoré plutôt que conservé', () => {
  const r = normaliserLotParties({ typeActe: { valeur: 'ACTE_DE_VENTE_CLASSIQUE' } });
  assert.equal(r.typeActe, null);
});

test('lot bien : un code postal qui n’a pas 5 chiffres est rejeté', () => {
  // C'est de lui qu'on déduit le département, donc le notaire instrumentaire : une valeur de
  // travers s'y propagerait jusqu'au rôle de l'étude sur le dossier.
  assert.equal(normaliserLotBien({ adresse: { codePostal: '2026', commune: 'BLOIS' } }).adresse.codePostal, null);
  assert.equal(normaliserLotBien({ adresse: { codePostal: '41000', commune: 'BLOIS' } }).adresse.codePostal, '41000');
});

test('lot bien : une adresse sans code postal, commune ni voie n’est pas une adresse', () => {
  assert.equal(normaliserLotBien({ adresse: { numero: '25' } }).adresse, null);
});

test('lot bien : le prix est arrondi, un prix négatif est rejeté', () => {
  assert.equal(normaliserLotBien({ prixVente: { valeur: 200000.6 } }).prixVente.valeur, 200001);
  assert.equal(normaliserLotBien({ prixVente: { valeur: -5 } }).prixVente, null);
});

test('lot dates : une date explicite et un délai sont conservés sans être conciliés', () => {
  // Le serveur ne calcule JAMAIS : il rapporte ce que l'acte dit, le client tranche (et signale la
  // contradiction si les deux ne concordent pas).
  const r = normaliserLotDates({
    dates: [
      { type: 'BUTOIR_PRET', dateExplicite: '2026-11-15', delai: { valeur: 60, unite: 'jours', pointDepart: 'la signature' }, extrait: 'au plus tard le 15 novembre 2026' },
      { type: 'REITERATION_ACTE', dateExplicite: '15/12/2026', extrait: 'réitération' },
      { type: 'AUTRE_CHOSE', dateExplicite: '2026-12-15' },
      { type: 'BUTOIR_VENTE_PREALABLE', extrait: 'une vente préalable est prévue' }
    ]
  });
  assert.equal(r.dates.length, 1); // seul le premier survit : voir les trois cas ci-dessous
  assert.equal(r.dates[0].dateExplicite, '2026-11-15');
  assert.equal(r.dates[0].delai.valeur, 60);
  assert.equal(r.dates[0].delai.unite, 'jours');
});

test('lot dates : une unité de délai inconnue annule le délai, pas toute l’échéance', () => {
  const r = normaliserLotDates({
    dates: [{ type: 'BUTOIR_PRET', dateExplicite: '2026-11-15', delai: { valeur: 2, unite: 'semaines' } }]
  });
  assert.equal(r.dates.length, 1);
  assert.equal(r.dates[0].delai, null);
  assert.equal(r.dates[0].dateExplicite, '2026-11-15');
});

test('lot dates : un engagement sans extrait cité est ignoré', () => {
  const r = normaliserLotDates({ engagementsVendeur: [{ type: 'travaux' }, { type: 'inconnu', extrait: 'Le vendeur fera ramoner.' }] });
  assert.equal(r.engagementsVendeur.length, 1);
  assert.equal(r.engagementsVendeur[0].type, 'document'); // repli, jamais un plantage
});

// ---- Validation (ce qui déclenche la relance) ----

test('les validateurs acceptent un lot vide mais refusent une structure erronée', () => {
  // Un acte peut légitimement ne rien contenir pour un lot : ce n'est pas une raison de relancer
  // le modèle (chaque tentative coûte des dizaines de secondes sur CPU).
  assert.equal(validerLotParties({}), null);
  assert.equal(validerLotDates({ dates: [] }), null);
  assert.match(validerLotParties({ parties: 'DUPONT' }), /liste/);
  assert.match(validerLotDates({ dates: [{ type: 'PEUT_ETRE' }] }), /type/);
  assert.match(validerLotParties('une phrase'), /objet JSON/);
});

// ---- Extraits et fenêtres ----

test('localiserExtrait retrouve une citation malgré accents, casse et espaces', () => {
  const texte = 'Le  VENDEUR s’engage à faire ramoner la cheminée avant la vente.';
  assert.ok(localiserExtrait(texte, "le vendeur s'engage a faire ramoner la cheminee") !== -1);
});

test('localiserExtrait ne valide pas une citation absente du texte', () => {
  const texte = 'Le vendeur s’engage à faire ramoner la cheminée avant la vente.';
  assert.equal(localiserExtrait(texte, 'Le vendeur fournira une attestation de conformité électrique'), -1);
});

test('verifierExtraits annote chaque élément cité, trouvé ou non', () => {
  const texte = 'La condition suspensive de prêt doit être réalisée au plus tard le 15 novembre 2026.';
  const r = verifierExtraits({
    dates: [
      { type: 'BUTOIR_PRET', extrait: 'réalisée au plus tard le 15 novembre 2026' },
      { type: 'REITERATION_ACTE', extrait: 'la vente sera réitérée le 3 janvier 2027' }
    ]
  }, texte);
  assert.equal(r.dates[0].extraitTrouve, true);
  assert.ok(Number.isInteger(r.dates[0].extraitIndex));
  assert.equal(r.dates[1].extraitTrouve, false);
  assert.equal(r.dates[1].extraitIndex, null);
});

test('construireFenetres fusionne les zones qui se chevauchent et respecte le plafond', () => {
  const remplissage = 'x'.repeat(5000);
  const texte = `${remplissage} prêt et prêt ${remplissage} acte authentique ${remplissage}`;
  const fenetres = construireFenetres(texte, /pr[êe]t|acte\s+authentique/gi, 300, 2000);
  assert.ok(fenetres.length <= 2000);
  assert.ok(fenetres.includes('prêt'));
  // Les deux occurrences de « prêt » sont à 6 caractères l'une de l'autre : une seule zone, donc
  // un seul séparateur avant « acte authentique ».
  assert.equal((fenetres.match(/\[\.\.\.\]/g) || []).length, 1);
});

test('construireFenetres renvoie une chaîne vide si le motif est absent', () => {
  assert.equal(construireFenetres('Un texte sans rien de pertinent.', /cadastr/gi, 500, 2000), '');
});

test('construireContexte plafonne le contexte et retombe sur la tête du document', () => {
  const sansMotCle = 'a'.repeat(30000);
  const contexte = construireContexte(sansMotCle, 'bien');
  assert.equal(contexte.length, LOTS.bien.tete); // aucun mot-clé : juste la tête
  const enorme = `DÉSIGNATION ${'b'.repeat(LIMITE_CARACTERES_TEXTE * 2)}`;
  assert.ok(construireContexte(enorme, 'bien').length <= LOTS.bien.tete + LOTS.bien.maxFenetres + 10);
});

// ---- Route /api/extraction-ia devant un faux Ollama ----

function config(ollamaUrl) {
  return {
    motDePasse: 'mdp-test',
    racineRepo: os.tmpdir(),
    port: 0,
    jetonCalendrier: '',
    ollama: { url: ollamaUrl, modele: 'llama3.1:8b' }
  };
}

const TEXTE = 'Le présent compromis est signé le 15 septembre 2026. ' +
  "L'acquéreur devra obtenir son prêt au plus tard le 15 novembre 2026.";

const REPONSE_DATES = JSON.stringify({
  dates: [{ type: 'BUTOIR_PRET', dateExplicite: '2026-11-15', delai: null, extrait: 'obtenir son prêt au plus tard le 15 novembre 2026' }],
  engagementsVendeur: []
});

let db, serveurApp, baseUrl, jeton, fauxOllama;

before(async () => {
  fauxOllama = await demarrerFauxOllama(REPONSE_DATES);
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
  return fetch(`${baseUrl}/api/extraction-ia`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(corps)
  });
}

test('POST /api/extraction-ia sans authentification : 401', async () => {
  const reponse = await fetch(`${baseUrl}/api/extraction-ia`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texte: TEXTE, lot: 'dates' })
  });
  assert.equal(reponse.status, 401);
});

test('POST /api/extraction-ia sans texte : 400', async () => {
  assert.equal((await appeler({ texte: '   ', lot: 'dates' })).status, 400);
});

test('POST /api/extraction-ia avec un lot inconnu (ou absent) : 400', async () => {
  assert.equal((await appeler({ texte: TEXTE })).status, 400);
  assert.equal((await appeler({ texte: TEXTE, lot: 'notaires' })).status, 400);
});

test('POST /api/extraction-ia : renvoie le lot normalisé, extrait vérifié', async () => {
  fauxOllama.reinitialiser();
  fauxOllama.definirReponses(REPONSE_DATES);
  const reponse = await appeler({ texte: TEXTE, lot: 'dates' });
  assert.equal(reponse.status, 200);
  const corps = await reponse.json();
  assert.equal(corps.lot, 'dates');
  assert.equal(corps.resultat.dates[0].dateExplicite, '2026-11-15');
  assert.equal(corps.resultat.dates[0].extraitTrouve, true);
  assert.equal(fauxOllama.appels, 1); // première réponse valide : aucune relance
});

test('un extrait absent du texte est signalé, la valeur n’est pas rejetée pour autant', async () => {
  // Le client en fera un « à vérifier » plutôt que de la jeter : le modèle peut avoir vu juste en
  // citant de travers — c'est à l'étude de trancher, pas au serveur.
  fauxOllama.reinitialiser();
  fauxOllama.definirReponses(JSON.stringify({
    dates: [{ type: 'BUTOIR_PRET', dateExplicite: '2026-11-15', extrait: 'une phrase que le modèle a inventée de toutes pièces' }]
  }));
  const corps = await (await appeler({ texte: TEXTE, lot: 'dates' })).json();
  assert.equal(corps.resultat.dates[0].dateExplicite, '2026-11-15');
  assert.equal(corps.resultat.dates[0].extraitTrouve, false);
});

test('un JSON hors schéma déclenche UNE relance, qui aboutit', async () => {
  fauxOllama.reinitialiser();
  fauxOllama.definirReponses([JSON.stringify({ dates: 'le 15 novembre' }), REPONSE_DATES]);
  const reponse = await appeler({ texte: TEXTE, lot: 'dates' });
  assert.equal(reponse.status, 200);
  assert.equal((await reponse.json()).resultat.dates.length, 1);
  assert.equal(fauxOllama.appels, 2);
});

test('la relance rappelle au modèle ce qui clochait dans sa réponse', async () => {
  fauxOllama.reinitialiser();
  fauxOllama.definirReponses([JSON.stringify({ dates: 'le 15 novembre' }), REPONSE_DATES]);
  await appeler({ texte: TEXTE, lot: 'dates' });
  assert.match(fauxOllama.prompts[1], /rejet[ée]e/);
  assert.match(fauxOllama.prompts[1], /liste/);
});

test('deux réponses hors schéma de suite : 502, sans troisième tentative', async () => {
  // Un modèle qui se trompe deux fois sur le même schéma ne se corrigera pas à la troisième, et
  // chaque tentative fait attendre l'étude — l'outil continue sans cette passe, les regex ont
  // déjà répondu.
  fauxOllama.reinitialiser();
  fauxOllama.definirReponses('pas du tout du JSON');
  const reponse = await appeler({ texte: TEXTE, lot: 'dates' });
  assert.equal(reponse.status, 502);
  assert.equal(fauxOllama.appels, 2);
  fauxOllama.definirReponses(REPONSE_DATES);
});

test('POST /api/extraction-ia : Ollama indisponible renvoie 503', async () => {
  const db2 = ouvrirDb(':memory:');
  const { app: app2, gestionnaireAuth: auth2 } = creerApp({ db: db2, config: config('http://127.0.0.1:1') });
  const jeton2 = auth2.creerSession();
  const serveur2 = app2.listen(0);
  await new Promise((resolve) => serveur2.once('listening', resolve));

  const reponse = await fetch(`http://127.0.0.1:${serveur2.address().port}/api/extraction-ia`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jeton2}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ texte: TEXTE, lot: 'dates' })
  });
  assert.equal(reponse.status, 503);

  serveur2.close();
  db2.close();
});
