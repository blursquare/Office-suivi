'use strict';
// Statistiques au-dessus du Suivi (30/09) : chiffres du mois, signatures et dates butoir par
// semaine, charge par collaborateur, délais moyens. Dossiers inventés.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');
const app = chargerApplication();

const AUJ = '2026-10-07'; // un mercredi
const cree = (iso) => [{ date: iso + 'T09:00:00', texte: 'Dossier créé' }];
const dossiers = [
  { id: 'a', responsable: 'Julie VASSELIN', rendezVousSignature: '2026-10-09', prixVente: 200000, pret: '2026-09-20', offrePretStatut: 'recue', dossierLie: true,
    historique: cree('2026-07-01').concat([{ date: '2026-08-10T10:00:00', texte: 'Offre de prêt retrouvée dans le dossier NAS' }]) },
  { id: 'b', responsable: 'Julie VASSELIN', pret: '2026-10-15', acte: '2026-12-01', historique: cree('2026-08-01') },
  { id: 'c', responsable: 'Jérémy SAUJOT', ventebien: '2026-10-01', pret: '2026-11-20', historique: cree('2026-08-15') },
  { id: 'd', responsable: 'Bastien ANGLUMENT', sansPret: true, rendezVousSignature: '2026-10-28', prixVente: 150000, historique: cree('2026-09-01') }
];
const archive = { id: 'z', archive: true, responsable: 'Julie VASSELIN', rendezVousSignature: '2026-10-02', prixVente: 100000, sansPret: true, historique: cree('2026-07-04') };

test('statsSuivi : chiffres du mois, offres attendues, dates butoir', () => {
  const st = app.statsSuivi(dossiers, dossiers.concat([archive]), AUJ);
  assert.equal(st.mois.cle, '2026-10');
  assert.equal(st.mois.signatures, 3);          // a, d et le dossier archivé signé le 02/10
  assert.equal(st.mois.aVenir, 2);
  assert.equal(st.mois.montant, 450000);
  assert.equal(st.mois.prochaine, '2026-10-09');
  assert.equal(st.offres.attendues, 2);         // b et c (a reçue, d sans prêt)
  assert.equal(st.offres.bientot, 1);           // b : prêt le 15/10
  assert.equal(st.butoirs.dans15, 1);           // prêt de b
  assert.equal(st.butoirs.depasses, 1);         // vente préalable de c
});

test('statsSuivi : 8 semaines depuis le lundi, signatures et dates butoir à venir', () => {
  const st = app.statsSuivi(dossiers, dossiers, AUJ);
  assert.equal(st.semaines.length, 8);
  assert.equal(st.semaines[0].debut, '2026-10-05');
  assert.equal(st.semaines.map(s => s.signatures.length).join(''), '10010000');
  assert.equal(st.semaines.map(s => s.butoirs.length).join(''), '01000010');
  assert.equal(app.dossierDansSemaine(dossiers[1], '2026-10-12'), true);
  assert.equal(app.dossierDansSemaine(dossiers[3], '2026-10-12'), false);
  assert.equal(app.dossierDansSemaine(dossiers[3], ''), true);
});

test('statsSuivi : charge par collaborateur et délais moyens', () => {
  const st = app.statsSuivi(dossiers, dossiers.concat([archive]), AUJ);
  const julie = st.charge.find(c => c.responsable === 'Julie VASSELIN');
  assert.equal(`${julie.nombre}/${julie.urgents}/${julie.prochaine}`, '2/0/2026-10-09');
  const jeremy = st.charge.find(c => c.responsable === 'Jérémy SAUJOT');
  assert.equal(jeremy.urgents, 1);
  // Signé le 02/10, ouvert le 04/07 : 90 jours ; offre de a le 10/08, ouvert le 01/07 : 40 jours.
  assert.equal(st.delais.signature, 90);
  assert.equal(st.delais.nSignature, 1);
  assert.equal(st.delais.offre, 40);
  // Dossiers en cours ouverts depuis plus de 90 jours, sans signature passée : a (98 j).
  assert.equal(st.delais.auDela, 1);
});

test('statsSuivi : dans les 5 derniers jours du mois, les chiffres passent au mois suivant', () => {
  assert.equal(app.statsSuivi([], [], '2026-09-30').mois.cle, '2026-10');
  assert.equal(app.statsSuivi([], [], '2026-09-25').mois.cle, '2026-09');
  assert.equal(app.statsSuivi([], [], '2026-12-29').mois.cle, '2027-01');
  const vide = app.statsSuivi([], [], '2026-09-10');
  assert.equal(`${vide.mois.signatures}/${vide.delais.signature}/${vide.delais.offre}`, '0/null/null');
});
