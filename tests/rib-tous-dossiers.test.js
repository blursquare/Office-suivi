'use strict';
// Demande de RIB (étude 26/10) : dans tous les dossiers, vendeurs, acquéreurs et héritiers, sauf une partie accompagnée par un confrère ;
// toujours en avant dans l'onglet Fonds. Données inventées.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');
const app = chargerApplication();

const vente = (o) => Object.assign({ id: 'v1', nom: 'MARTIN / DURAND', typeAffaire: 'vente', historique: [],
  parties: [{ nom: 'Paul MARTIN', role: 'VENDEUR' }, { nom: 'Léa DURAND', role: 'ACQUEREUR' }] }, o);

test('partiesSignatureRib : vendeurs et acquéreurs accompagnés par l’étude, jamais une partie accompagnée par un confrère', () => {
  const cle = (d) => app.partiesSignatureRib(d).map((x) => x.role + ':' + x.partie.nom).join('|');
  assert.equal(cle(vente()), 'VENDEUR:Paul MARTIN|ACQUEREUR:Léa DURAND');
  assert.equal(cle(vente({ notaireAcquereur: 'Maître Jean NOTAIRE (TOURS)' })), 'VENDEUR:Paul MARTIN');
  assert.equal(cle(vente({ notaireVendeur: 'Maître Jean NOTAIRE (TOURS)' })), 'ACQUEREUR:Léa DURAND');
});

test('onglet Fonds : la demande de RIB est toujours en avant, dès l’ouverture (pas seulement à J-3)', () => {
  const d = vente({ rendezVousSignature: '' });
  const r = app.echangesSelonStade(d, '2026-10-26');
  assert.ok(r.utiles.includes('rib'), JSON.stringify(r));
  const confreres = vente({ notaireAcquereur: 'Maître Jean NOTAIRE (TOURS)', notaireVendeur: 'Maître Luc AUTRE (ORLEANS)' });
  const r2 = app.echangesSelonStade(confreres, '2026-10-26');
  assert.ok(!r2.utiles.includes('rib') && !r2.autres.includes('rib'));
});

test('RIB retenu PAR PERSONNE : une demande au vendeur ne coche pas celle de l’acquéreur (audit 26/10, M3)', () => {
  const d = vente({ ribDemandes: {} });
  const v = d.parties[0], a = d.parties[1];
  d.ribDemandes[app.cleRibPartie(v)] = '2026-10-20';
  assert.equal(app.ribDemandeLePour(d, v), '2026-10-20');
  assert.equal(app.ribDemandeLePour(d, a), '');
  assert.equal(app.ribResteADemander(d), true);
  // Ancienne demande du dossier entier : elle valait pour les acquéreurs.
  const ancien = vente({ ribDemandeLe: '2026-10-01' });
  assert.equal(app.ribDemandeLePour(ancien, ancien.parties[1]), '2026-10-01');
  assert.equal(app.ribDemandeLePour(ancien, ancien.parties[0]), '');
});
