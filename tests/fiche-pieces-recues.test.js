'use strict';
// Fiche agrandie : « Dernières pièces reçues » (02/10). Dossier inventé.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');
const app = chargerApplication();

test('piecesRecuesDossier : nouvelles d’abord, puis la plus récente ; validées à la main et sans date en dernier', () => {
  const d = {
    id: 'x', typeVente: 'maison', offrePretStatut: 'recue',
    pieces: { titrePropriete: 'recue', diagnosticsTechniques: 'recue', erp: 'recue', avisTaxeFonciere: 'recue', certificatUrbanisme: 'manquante' },
    piecesTrouveesLe: { titrePropriete: '2026-09-20T09:00:00Z', diagnosticsTechniques: '2026-09-28T09:00:00Z' },
    piecesNotifications: ['erp'],
    piecesValideesManuellement: ['avisTaxeFonciere'],
    historique: [
      { date: '2026-09-25T10:00:00Z', texte: 'Pièce validée à la main (hors dossier NAS) : « Avis de taxe foncière »' },
      { date: '2026-09-22T08:00:00Z', texte: 'Offre de prêt retrouvée dans le dossier NAS' }
    ],
    analyseJuridique: { engagements: [], documents: [{ label: 'Attestation d’assurance dommages-ouvrage', recu: true, recuLe: '2026-09-30T08:00:00Z' }, { label: 'Facture de la toiture' }] }
  };
  const l = app.piecesRecuesDossier(d);
  assert.equal(l.map(p => p.label).join(' | '),
    'ERP (état des risques et pollution) | Attestation d’assurance dommages-ouvrage | Diagnostics techniques | Avis de taxe foncière | Offre de prêt | Titre de propriété');
  const taxe = l.find(p => p.cle === 'avisTaxeFonciere');
  assert.equal(`${taxe.main}/${taxe.le}`, 'true/2026-09-25T10:00:00Z');
  assert.equal(l.find(p => p.type === 'offre').le, '2026-09-22T12:00:00');
  assert.equal(app.piecesRecuesDossier(d, 2).length, 2);
  assert.equal(app.piecesRecuesDossier(null).length, 0);
});
