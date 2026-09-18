'use strict';

// Modèles d'email de relance différenciés par motif (voir script.js, section « Relances ciblées »)
// — demandé pour ne plus avoir à réécrire le même email à la main selon ce qui manque au dossier
// (prêt manquant / pièce à fournir / RIB), distincts du rappel générique ouvrirEmailRappel().

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

function dossierBase(app, extra) {
  return Object.assign({
    id: 'd1', nom: 'DUPONT / MARTIN', emailAcquereur: 'martin@example.fr',
    typeVente: 'maison', pieces: {}, piecesRetirees: [], piecesPersonnalisees: [],
    piecesEngagementsDetectees: [], analyseJuridique: {}
  }, extra || {});
}

test('construireEmailRelancePret mentionne l’échéance quand elle est connue', () => {
  const app = chargerApplication();
  const d = dossierBase(app, { pret: '2026-11-15' });
  const { sujet, corps } = app.construireEmailRelancePret(d);
  assert.match(sujet, /DUPONT \/ MARTIN/);
  assert.match(corps, /15 novembre 2026/);
});

test('construireEmailRelancePret reste correct sans date de prêt connue', () => {
  const app = chargerApplication();
  const d = dossierBase(app, { pret: '' });
  const { corps } = app.construireEmailRelancePret(d);
  assert.doesNotMatch(corps, /échéance/i);
});

test('construireEmailRelancePieces liste les pièces encore manquantes', () => {
  const app = chargerApplication();
  const d = dossierBase(app, {});
  const { corps } = app.construireEmailRelancePieces(d);
  // Une checklist "maison" par défaut inclut le diagnostic technique, jamais reçu ici (d.pieces = {}).
  assert.match(corps, /- /);
});

test('construireEmailRelancePieces ne relance pas une pièce déjà reçue', () => {
  const app = chargerApplication();
  const checklist = app.checklistPieces('maison', null);
  const toutRecu = {};
  for (const p of checklist) toutRecu[p.cle] = 'recue';
  const d = dossierBase(app, { pieces: toutRecu });
  const { corps } = app.construireEmailRelancePieces(d);
  assert.match(corps, /voir avec l'étude|voir avec l’étude/);
});

test('construireEmailRelanceRib ne dépend d’aucun champ du dossier au-delà du nom', () => {
  const app = chargerApplication();
  const d = dossierBase(app, {});
  const { sujet, corps } = app.construireEmailRelanceRib(d);
  assert.match(sujet, /RIB|bancaire/i);
  assert.match(corps, /DUPONT \/ MARTIN/);
});

test('MODELES_EMAIL_RELANCE couvre exactement les trois motifs demandés', () => {
  const app = chargerApplication();
  assert.equal(Object.keys(app.MODELES_EMAIL_RELANCE).sort().join(','), 'pieces,pret,rib');
});
