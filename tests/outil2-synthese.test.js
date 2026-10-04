'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

// Pièces attendues et commentaires de l'étude (Outil 2) — la synthèse rédigée et l'ancienne
// grille ont été retirées le 24/09/2026 (voir tests/outil2-relecture-claude.test.js). Résultats
// fabriqués à la main : ces fonctions ne lisent aucun texte, elles mettent en forme un rapport.


test('commentaires : portée dossier, portée générale, gravité corrigée', () => {
  const app = chargerApplication();
  const constat = { categorie: 'ETAT_DATE', gravite: 'IMPORTANT', titre: 'Procédure en cours signalée par le syndic',
    phrase: 'Une procédure oppose le syndicat des copropriétaires à la société de construction' };
  const empreinte = app.empreinteTexteConstat(constat);
  const retours = [
    { id: 'a', verdict: 'faux_positif', portee: 'dossier', dossierCle: 'dossier:1', empreinte, constat: { categorie: 'ETAT_DATE' }, date: '2026-09-23' }
  ];
  assert.equal(app.retourPourConstat(constat, retours, 'dossier:2'), null);
  assert.equal(app.retourPourConstat(constat, retours, 'dossier:1').id, 'a');
  // Une autre catégorie ne récupère jamais l'avis.
  assert.equal(app.retourPourConstat({ ...constat, categorie: 'URBANISME' }, retours, 'dossier:1'), null);

  const general = [{ id: 'g', verdict: 'gravite', portee: 'tous', graviteSouhaitee: 'A_VERIFIER', empreinte, constat: { categorie: 'ETAT_DATE' } }];
  const c = { ...constat };
  app.appliquerRetoursAuxConstats([c], general, 'dossier:9');
  assert.equal(c.gravite, 'A_VERIFIER');
  assert.equal(c.graviteOrigine, 'IMPORTANT');
  // Rejouer sans l'avis rétablit la gravité d'origine.
  app.appliquerRetoursAuxConstats([c], [], 'dossier:9');
  assert.equal(c.gravite, 'IMPORTANT');
  assert.equal(c.retour, null);
});

test('résumé : un faux positif ne compte plus', () => {
  const app = chargerApplication();
  const r = app.resumeConstatsOutil2([
    { gravite: 'CRITIQUE', retour: { verdict: 'faux_positif' } },
    { gravite: 'CRITIQUE' },
    { gravite: 'A_VERIFIER', memoire: { decision: 'ecarte' } }
  ]);
  assert.equal(r.CRITIQUE, 1);
  assert.equal(r.A_VERIFIER, 0);
});

test('clé de dossier, parties divergentes, rubrique AAE', () => {
  const app = chargerApplication();
  assert.equal(app.cleDossierAudit({ id: 'x1' }, 'a.pdf'), 'dossier:x1');
  assert.equal(app.cleDossierAudit(null, 'Projet VENTE Dupont.pdf'), 'document:projet vente dupont');
  const texte = [{ nom: 'DUPONT', role: 'VENDEUR' }, { nom: 'MARTIN', role: 'ACQUEREUR' }];
  assert.equal(app.partiesDivergentes([{ nom: 'Dupont', role: 'vendeur' }, { nom: 'MARTIN', role: 'ACQUEREUR' }], texte), false);
  assert.equal(app.partiesDivergentes([{ nom: 'DUPONT', role: 'VENDEUR' }, { nom: 'MARTIN', role: 'VENDEUR' }], texte), true);
  assert.equal(app.partiesDivergentes([{ nom: 'DUPONT', role: 'VENDEUR' }], []), false);
  assert.equal(app.estDansRubriqueAAE('9 - AAE/Certificat urbanisme.pdf'), true);
  assert.equal(app.estDansRubriqueAAE('Copie AAE PROMESSE.pdf'), false);
  assert.equal(app.estDansRubriqueAAE('8 - SRU\\compromis.pdf'), false);
});
