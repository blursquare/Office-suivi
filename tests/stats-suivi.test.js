'use strict';
// « Prévu ce mois-ci » au-dessus du Suivi (30/09) : signatures, envois, rendez-vous à fixer, dates
// butoir du mois, délais moyens. Dossiers inventés.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');
const app = chargerApplication();

const AUJ = '2026-10-07';
const cree = (iso) => [{ date: iso + 'T09:00:00', texte: 'Dossier créé' }];
const ids = (liste) => liste.map(x => x.d.id + ':' + x.iso + (x.retard ? '!' : '')).join(' ');
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

test('prevuDuMois : signatures, envois, rendez-vous à fixer et dates butoir du mois', () => {
  const p = app.prevuDuMois(dossiers, dossiers.concat([archive]), AUJ);
  assert.equal(p.mois.cle, '2026-10');
  assert.equal(ids(p.signatures), 'a:2026-10-20');
  assert.equal(ids(p.envois), 'a:2026-10-20');
  assert.equal(p.envois[0].libelle, 'Appel de fonds');
  assert.equal(ids(p.rdvAFixer), 'd:2026-10-25');
  // Retards d'abord (vente préalable de c), puis par date ; la date butoir de d reste (pas de
  // rendez-vous), celle de b (décembre) est hors du mois.
  assert.equal(ids(p.butoirs), 'c:2026-10-01! b:2026-10-15 d:2026-10-25');
});

test('prevuDuMois : délais moyens depuis l’ouverture du dossier', () => {
  const p = app.prevuDuMois(dossiers, dossiers.concat([archive]), AUJ);
  assert.equal(p.delais.signature, 90);   // archivé : ouvert le 04/07, signé le 02/10
  assert.equal(p.delais.nSignature, 1);
  assert.equal(p.delais.offre, 40);       // a : ouvert le 01/07, offre le 10/08
});

test('moisPrevuSuivi : le mois en cours, le suivant dans ses 5 derniers jours', () => {
  assert.equal(app.moisPrevuSuivi('2026-09-30').cle, '2026-10');
  assert.equal(app.moisPrevuSuivi('2026-09-25').cle, '2026-09');
  assert.equal(app.moisPrevuSuivi('2026-09-25').fin, '2026-09-30');
  assert.equal(app.moisPrevuSuivi('2026-12-29').cle, '2027-01');
  assert.equal(app.moisPrevuSuivi('2027-02-10').fin, '2027-02-28');
  const vide = app.prevuDuMois([], [], '2026-09-10');
  assert.equal(`${vide.signatures.length}/${vide.delais.signature}/${vide.delais.offre}`, '0/null/null');
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

test('agendaPrevuDuMois : à faire (retards, envois, rendez-vous) puis calendrier jour par jour, filtrable', () => {
  const p = app.prevuDuMois(dossiers, dossiers, AUJ);
  const ag = app.agendaPrevuDuMois(p, '');
  assert.equal(ag.aFaire.map(x => `${x.d.id}:${x.type}${x.retard ? '!' : ''}`).join(' '), 'c:ventebien! a:appelFonds d:fixerRdv');
  assert.equal(ag.jours.map(j => j.iso + '=' + j.items.map(x => x.d.id + ':' + x.type).join('+')).join(' '),
    '2026-10-15=b:pret 2026-10-20=a:rendezVousSignature 2026-10-25=d:acte');
  const sig = app.agendaPrevuDuMois(p, 'signatures');
  assert.equal(`${sig.aFaire.length}/${sig.jours.length}`, '0/1');
  const but = app.agendaPrevuDuMois(p, 'butoirs');
  assert.equal(`${but.aFaire.length}/${but.jours.length}`, '1/2');
});
