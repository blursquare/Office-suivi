'use strict';

// Tableau de bord refait (carnet de bord de l'étude) : actions urgentes regroupées par statut,
// rappel des dernières pièces trouvées, diagramme d'avancement de chaque dossier.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const app = chargerApplication();

test('dernieresPiecesTrouvees : les non vues d\'abord, puis la plus récente ; au-delà de 14 jours, oubliées', () => {
  const maintenant = Date.parse('2026-09-24T12:00:00Z');
  const d1 = { id: '1', nom: 'UN', typeVente: 'maison', piecesTrouveesLe: { erp: '2026-09-23T10:00:00Z', titrePropriete: '2026-08-01T10:00:00Z' } };
  const d2 = { id: '2', nom: 'DEUX', typeVente: 'maison', piecesNotifications: ['avisTaxeFonciere'], piecesTrouveesLe: { avisTaxeFonciere: '2026-09-20T10:00:00Z' } };
  const e = app.dernieresPiecesTrouvees([d1, d2], maintenant);
  assert.equal(e.map(x => x.cle).join(','), 'avisTaxeFonciere,erp');
  assert.equal(e[0].nouvelle, true);
  assert.equal(e[1].nouvelle, false);
});

test('dernieresPiecesTrouvees : une notification sans date (données plus anciennes) reste affichée', () => {
  const d = { id: '1', nom: 'UN', typeVente: 'maison', piecesNotifications: ['erp'] };
  const e = app.dernieresPiecesTrouvees([d], Date.parse('2026-09-24T12:00:00Z'));
  assert.equal(e.length, 1);
  assert.equal(e[0].le, null);
});

test('donneesAvancement : barre de la création à la signature, jalons placés et marqués réalisés', () => {
  const d = {
    id: 'x', nom: 'DUPONT / MARTIN', typeVente: 'maison',
    historique: [{ date: '2026-09-01T09:00:00Z', texte: 'Dossier créé' }],
    pret: '2026-10-15', offrePretStatut: 'recue', rendezVousSignature: '2026-12-10', acte: '2026-12-01'
  };
  const r = app.donneesAvancement([d], '2026-09-24');
  assert.equal(r.lignes.length, 1);
  const l = r.lignes[0];
  assert.ok(l.barreDebut > 0 && l.barreDebut < r.aujourdhuiPct);
  assert.ok(l.barreFin > r.aujourdhuiPct);
  const pret = l.jalons.find(j => j.type === 'pret');
  assert.equal(pret.fait, true); // offre reçue
  // La date butoir est « faite » dès que le rendez-vous est pris : elle n'est plus qu'indicative.
  assert.equal(l.jalons.find(j => j.type === 'acte').fait, true);
  assert.equal(l.jalons.find(j => j.type === 'rendezVousSignature').fait, false);
  assert.ok(r.mois.length >= 5);
});

test('donneesAvancement : ce qui sort de la fenêtre est ramené au bord et signalé ; sans date, pas de ligne', () => {
  const loin = { id: 'l', nom: 'LOIN', typeVente: 'maison', acte: '2027-09-01' };
  const vide = { id: 'v', nom: 'VIDE', typeVente: 'maison' };
  const r = app.donneesAvancement([loin, vide], '2026-09-24');
  assert.equal(r.lignes.length, 1);
  assert.equal(r.lignes[0].jalons[0].pct, 100);
  assert.equal(r.lignes[0].jalons[0].hors, 'apres');
  assert.equal(r.lignes[0].coupeApres, true);
});

test('donneesAvancement : les dossiers sont triés par date de signature', () => {
  const a = { id: 'a', nom: 'A', typeVente: 'maison', acte: '2026-12-20' };
  const b = { id: 'b', nom: 'B', typeVente: 'maison', rendezVousSignature: '2026-10-20' };
  assert.equal(app.donneesAvancement([a, b], '2026-09-24').lignes.map(l => l.id).join(','), 'b,a');
});
