'use strict';
// Colonne de gauche du Suivi (01/10) : à signer ce mois-ci, à placer (date butoir dans le mois),
// ventes et successions ; « Nouveau » en tête de liste. Dossiers inventés.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');
const app = chargerApplication();

const AUJ = '2026-10-07';
const cree = (iso) => [{ date: iso + 'T09:00:00', texte: 'Dossier créé' }];
const dossiers = [
  // Signature le 20/10, offre reçue : appel de fonds à envoyer avant le 20/10.
  { id: 'a', rendezVousSignature: '2026-10-20', pret: '2026-09-20', offrePretStatut: 'recue', dossierLie: true,
    historique: cree('2026-07-01').concat([{ date: '2026-08-10T10:00:00', texte: 'Offre de prêt retrouvée dans le dossier NAS' }]) },
  // Prêt le 15/10, date butoir le 01/12.
  { id: 'b', pret: '2026-10-15', acte: '2026-12-01', historique: cree('2026-08-01') },
  // Vente préalable dépassée (01/10), prêt en novembre.
  { id: 'c', ventebien: '2026-10-01', pret: '2026-11-20', historique: cree('2026-08-15') },
  // Participation, offre reçue, pas de rendez-vous : rendez-vous à fixer avant la date butoir du 25/10.
  { id: 'd', roleNotaire: 'participant', pret: '2026-09-01', offrePretStatut: 'recue', acte: '2026-10-25', historique: cree('2026-09-01') },
  // Signature en novembre : hors du mois.
  { id: 'e', rendezVousSignature: '2026-11-12', sansPret: true, historique: cree('2026-09-10') }
];
const archive = { id: 'z', archive: true, rendezVousSignature: '2026-10-02', sansPret: true, historique: cree('2026-07-04') };

test('syntheseMoisSuivi : à signer et à placer dans le mois en cours, ventes et successions', () => {
  const s = app.syntheseMoisSuivi(dossiers.concat([archive]), AUJ);
  assert.equal(s.mois.cle, '2026-10');
  assert.equal(s.mois.fin, '2026-10-31');
  // a signe le 20/10 ; e en novembre et l'archivé ne comptent pas.
  assert.equal(s.aSigner.map(d => d.id).join(','), 'a');
  assert.equal(s.signees, 0);
  // d : sans rendez-vous, date butoir le 25/10 ; b (décembre) hors du mois.
  assert.equal(s.aPlacer.map(d => d.id).join(','), 'd');
  assert.equal(s.depassees, 0);
  assert.equal(`${s.ventes.length}/${s.successions.length}`, '5/0');
});

test('syntheseMoisSuivi : signature passée, butoirs dépassées, rendez-vous fixé, succession', () => {
  const liste = [
    { id: 's1', rendezVousSignature: '2026-10-02' },
    { id: 's2', rendezVousSignature: '2026-10-28' },
    { id: 'p1', acte: '2026-10-03' },
    { id: 'p2', acte: '2026-10-30', rendezVousSignature: '2026-11-04' },
    { id: 'p3', acte: '2026-11-02' },
    { id: 'p0', acte: '2026-09-21' },
    { id: 'su', typeAffaire: 'succession' }
  ];
  const s = app.syntheseMoisSuivi(liste, AUJ);
  assert.equal(`${s.aSigner.map(d => d.id).join(',')}/${s.signees}`, 's1,s2/1');
  // p0 : butoir dépassée le mois dernier, toujours à placer.
  assert.equal(`${s.aPlacer.map(d => d.id).join(',')}/${s.depassees}`, 'p0,p1/2');
  assert.equal(`${s.ventes.length}/${s.successions.map(d => d.id).join(',')}`, '6/su');
  // Le filtre d'un compteur ne garde que ses dossiers ; sans filtre, tout.
  assert.equal(app.dossiersFiltreMoisSuivi(liste, 'signer', s).map(d => d.id).join(','), 's1,s2');
  assert.equal(app.dossiersFiltreMoisSuivi(liste, 'succession', s).map(d => d.id).join(','), 'su');
  assert.equal(app.dossiersFiltreMoisSuivi(liste, '', s).length, 7);
  // Février : le mois finit le 28.
  assert.equal(app.syntheseMoisSuivi([], '2027-02-10').mois.fin, '2027-02-28');
});

test('signauxDossierSuivi : notifications et fonds reçus à confirmer font remonter un dossier', () => {
  const offre = { id: 'o', typeVente: 'maison', piecesNotifications: ['offre-pret', 'diagnosticsTechniques'], pret: '2026-10-20' };
  assert.equal(app.signauxDossierSuivi(offre).map(s => s.texte).join(' | '), 'Offre de prêt reçue | Nouvelle pièce : Diagnostics techniques');
  const deux = { id: 'p', typeVente: 'maison', piecesNotifications: ['erp', 'diagnosticsTechniques'] };
  assert.match(app.signauxDossierSuivi(deux)[0].texte, /^2 nouvelles pièces : /);
  const fonds = { id: 'f', fondsRecus: { total: 30000, attendu: 30000, recus: [] } };
  assert.equal(app.signauxDossierSuivi(fonds)[0].cle, 'fonds');
  assert.equal(app.signauxDossierSuivi(Object.assign({}, fonds, { receptionFondsConfirmeeLe: '2026-10-01' })).length, 0);
  assert.equal(app.signauxDossierSuivi({ id: 'r' }).length, 0);
  assert.equal(app.signauxDossierSuivi(Object.assign({ archive: true }, offre)).length, 0);
});

test('partagerAVoirSuivi : les notifications d’abord, puis les fonds, le reste dans l’ordre reçu', () => {
  const liste = [
    { id: 'calme', pret: '2026-10-10' },
    { id: 'fonds', fondsRecus: { total: 100, attendu: 100 }, rendezVousSignature: '2026-10-12' },
    { id: 'piece', typeVente: 'maison', piecesNotifications: ['erp'], pret: '2026-11-30' },
    { id: 'calme2', pret: '2026-10-20' }
  ];
  const { aVoir, reste } = app.partagerAVoirSuivi(liste);
  assert.equal(aVoir.map(x => x.d.id).join(','), 'piece,fonds');
  assert.equal(reste.map(d => d.id).join(','), 'calme,calme2');
});
