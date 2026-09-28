'use strict';

// Tableau de bord refait (carnet de bord de l'étude) : actions urgentes regroupées par statut,
// rappel des dernières pièces trouvées, avancement de chaque dossier.

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

test('avancementDossier : moitié étapes, moitié pièces ; seules les étapes qui s\'appliquent', () => {
  const d = {
    id: 'x', nom: 'DUPONT / MARTIN', typeVente: 'maison', sansPret: true,
    appelFonds: '2026-09-10', rendezVousSignature: '2026-10-10',
    pieces: { certificatUrbanisme: 'recue', erp: 'recue' }
  };
  const a = app.avancementDossier(d, '2026-09-24');
  // Sans prêt ni vente préalable : rendez-vous fixé, appel de fonds, projet, signature — les deux premiers faits.
  assert.equal(a.etapesTotal, 4);
  assert.equal(a.etapesFaites, 2);
  assert.ok(a.piecesTotal > 2);
  assert.equal(a.piecesRecues, 2);
  assert.equal(a.pct, Math.round(50 * 2 / 4 + 50 * 2 / a.piecesTotal));
  assert.equal(a.prochaine, 'Envoi projet');
});

test('avancementDossier : en participation, les étapes seules ; signature faite une fois le rendez-vous passé', () => {
  const d = { id: 'p', nom: 'P', typeVente: 'maison', roleNotaire: 'participant', sansPret: true,
    appelFonds: '2026-08-01', projetEnvoye: '2026-08-05', rendezVousSignature: '2026-09-01' };
  const a = app.avancementDossier(d, '2026-09-24');
  assert.equal(a.piecesTotal, 0);
  assert.equal(a.pct, 100);
  assert.equal(a.prochaine, null);
});

test('lignesAvancement : statut tiré de « À traiter », les plus urgentes d\'abord', () => {
  const ok = { id: 'ok', nom: 'OK', typeVente: 'maison', roleNotaire: 'participant', sansPret: true };
  // Offre de prêt non reçue à 3 jours du butoir : critique dans « À traiter ».
  const retard = { id: 'r', nom: 'R', typeVente: 'maison', roleNotaire: 'participant', pret: '2026-09-27', offrePretStatut: 'manquante' };
  const l = app.lignesAvancement([ok, retard], '2026-09-24');
  assert.equal(l.map(x => x.dossier.id + ':' + x.statut).join(','), 'r:retard,ok:delais');
  assert.equal(app.statutAvancement('vigilance'), 'surveiller');
  assert.equal(app.statutAvancement(undefined), 'delais');
});

test('etapesAvancement : chaque étape porte sa date et son état, dans l\'ordre du dossier', () => {
  const d = { id: 'e', typeVente: 'maison', ventebien: '2026-10-02', pret: '2026-10-15', rendezVousSignature: '2026-12-04',
    appelFonds: '2026-11-20', echeancesValidees: { ventebien: true } };
  const e = app.etapesAvancement(d, '2026-09-25');
  assert.equal(e.map(x => x.type).join(','), 'ventebien,pret,fixerRdv,appelFonds,projetEnvoye,signature');
  assert.equal(e.map(x => x.fait ? 1 : 0).join(''), '101100');
  assert.equal(e.map(x => x.iso).join('|'), '2026-10-02|2026-10-15|2026-12-04|2026-11-20||2026-12-04');
  // Sans prêt ni vente préalable, ces deux étapes ne s'appliquent pas.
  const cash = app.etapesAvancement({ id: 'c', sansPret: true }, '2026-09-25');
  assert.equal(cash.map(x => x.type).join(','), 'fixerRdv,appelFonds,projetEnvoye,signature');
});
