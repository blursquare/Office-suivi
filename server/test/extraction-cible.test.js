'use strict';

// Relance ciblée à l'IA locale sur un seul champ (voir src/extraction/cible.js) : demandée
// explicitement par l'étude pour éviter de relancer les trois lots automatiques (parties/bien/
// dates) quand une seule donnée reste « à vérifier ». Montée dans la même route que les trois lots
// existants (POST /api/extraction-ia), distinguée par `lot: 'cible'` + `champ`.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');

const { creerApp } = require('../src/app');
const { ouvrirDb } = require('../src/db');
const { demarrerFauxOllama } = require('./helpers/faux-ollama');
const {
  CHAMPS_CIBLE, construireContexteCible, normaliserCible, validerCible
} = require('../src/extraction/cible');

// ---- Fonctions pures ----

test('normaliserCible : catégorie texte/nombre/typeActe/date', () => {
  assert.equal(normaliserCible({ valeur: '  DUPONT / MARTIN  ', extrait: 'x' }, 'texte').valeur, 'DUPONT / MARTIN');
  assert.equal(normaliserCible({ valeur: 250000.7 }, 'nombre').valeur, 250001);
  assert.equal(normaliserCible({ valeur: -10 }, 'nombre').valeur, null);
  assert.equal(normaliserCible({ valeur: 'ACTE_INCONNU' }, 'typeActe').valeur, null);
  assert.equal(normaliserCible({ valeur: 'PROMESSE_D_ACHAT' }, 'typeActe').valeur, 'PROMESSE_D_ACHAT');
});

test('normaliserCible : catégorie date, délai avec unité invalide annulé', () => {
  const r = normaliserCible({ dateExplicite: null, delai: { valeur: 60, unite: 'semaines', pointDepart: 'la signature' } }, 'date');
  assert.equal(r.dateExplicite, null);
  assert.equal(r.delai, null);
});

test('normaliserCible : catégorie date, délai valide conservé', () => {
  const r = normaliserCible({ delai: { valeur: 60, unite: 'jours', pointDepart: 'la signature des présentes' } }, 'date');
  assert.equal(r.delai.valeur, 60);
  assert.equal(r.delai.unite, 'jours');
  assert.equal(r.delai.pointDepart, 'la signature des présentes');
});

test('validerCible : refuse une valeur hors énumération pour typeActe, accepte null', () => {
  assert.match(validerCible({ valeur: 'AUTRE_CHOSE' }, 'typeActe'), /valeur/);
  assert.equal(validerCible({ valeur: null }, 'typeActe'), null);
  assert.equal(validerCible('pas un objet', 'texte'), 'la réponse doit être un objet JSON');
});

test('construireContexteCible plafonne et retombe sur une large tête sans mot-clé', () => {
  const sansMotCle = 'z'.repeat(80000);
  const contexte = construireContexteCible(sansMotCle, 'prixVente');
  assert.ok(contexte.length <= CHAMPS_CIBLE.prixVente.tete + CHAMPS_CIBLE.prixVente.maxFenetres);
  assert.ok(contexte.length > CHAMPS_CIBLE.prixVente.tete); // plus généreux qu'une simple tête
});

test('CHAMPS_CIBLE ne couvre pas roleNotaire : ce n’est pas une donnée du texte à redemander', () => {
  assert.equal(CHAMPS_CIBLE.roleNotaire, undefined);
});

// ---- Route /api/extraction-ia avec lot: 'cible' ----

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
  "Monsieur Jean DUPONT (vendeur) vend à Madame Alice MARTIN (acquéreur) un bien sis à Blois. " +
  'Le prix de vente est de CENT MILLE EUROS (100 000 €).';

let db, serveurApp, baseUrl, jeton, fauxOllama;

before(async () => {
  fauxOllama = await demarrerFauxOllama(JSON.stringify({ valeur: 100000, extrait: 'CENT MILLE EUROS (100 000 €)' }));
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

test('lot cible sans champ connu : 400', async () => {
  assert.equal((await appeler({ texte: TEXTE, lot: 'cible' })).status, 400);
  assert.equal((await appeler({ texte: TEXTE, lot: 'cible', champ: 'notaireVendeur' })).status, 400);
});

test('lot cible : renvoie la valeur normalisée avec son extrait vérifié', async () => {
  fauxOllama.reinitialiser();
  fauxOllama.definirReponses(JSON.stringify({ valeur: 100000, extrait: 'CENT MILLE EUROS (100 000 €)' }));
  const reponse = await appeler({ texte: TEXTE, lot: 'cible', champ: 'prixVente' });
  assert.equal(reponse.status, 200);
  const corps = await reponse.json();
  assert.equal(corps.lot, 'cible');
  assert.equal(corps.champ, 'prixVente');
  assert.equal(corps.resultat.valeur, 100000);
  assert.equal(corps.resultat.extraitTrouve, true);
});

test('lot cible : un extrait inventé par le modèle est signalé, pas rejeté', async () => {
  fauxOllama.reinitialiser();
  fauxOllama.definirReponses(JSON.stringify({ valeur: 'jean.dupont@example.fr', extrait: 'une phrase totalement absente du texte' }));
  const corps = await (await appeler({ texte: TEXTE, lot: 'cible', champ: 'emailAcquereur' })).json();
  assert.equal(corps.resultat.valeur, 'jean.dupont@example.fr');
  assert.equal(corps.resultat.extraitTrouve, false);
});

test('lot cible : catégorie date, un délai est rapporté sans être calculé côté serveur', async () => {
  fauxOllama.reinitialiser();
  fauxOllama.definirReponses(JSON.stringify({
    dateExplicite: null,
    delai: { valeur: 60, unite: 'jours', pointDepart: 'la signature des présentes' },
    extrait: 'dans un délai de 60 jours à compter de la signature des présentes'
  }));
  const corps = await (await appeler({ texte: TEXTE, lot: 'cible', champ: 'pret' })).json();
  assert.equal(corps.resultat.dateExplicite, null);
  assert.equal(corps.resultat.delai.valeur, 60);
  assert.equal(corps.resultat.delai.unite, 'jours');
});

test('lot cible : Ollama indisponible renvoie 503', async () => {
  const db2 = ouvrirDb(':memory:');
  const { app: app2, gestionnaireAuth: auth2 } = creerApp({ db: db2, config: config('http://127.0.0.1:1') });
  const jeton2 = auth2.creerSession();
  const serveur2 = app2.listen(0);
  await new Promise((resolve) => serveur2.once('listening', resolve));

  const reponse = await fetch(`http://127.0.0.1:${serveur2.address().port}/api/extraction-ia`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jeton2}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ texte: TEXTE, lot: 'cible', champ: 'prixVente' })
  });
  assert.equal(reponse.status, 503);

  serveur2.close();
  db2.close();
});
