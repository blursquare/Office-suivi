'use strict';

// Carte « Portefeuille » du tableau de bord : répartition par statut, signatures du mois, offres
// reçues, avancement moyen, et la phrase qui les résume.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const app = chargerApplication();
const AUJ = '2026-09-28';

function dossier(extra) {
  return Object.assign({ id: 'x', nom: 'X', typeVente: 'maison', roleNotaire: 'instrumentaire', historique: [], pieces: {} }, extra);
}

test('statsPortefeuilleVisuel : statuts, signatures du mois (archivés compris), offres, avancement', () => {
  const actifs = [
    dossier({ id: 'a', sansPret: true, roleNotaire: 'participant' }), // rien à vérifier → prêt
    dossier({ id: 'b', offrePretStatut: 'manquante', dossierLie: true }),
    dossier({ id: 'c', offrePretStatut: 'recue', rendezVousSignature: '2026-09-30' }),
    dossier({ id: 'd' })
  ];
  const archive = dossier({ id: 'e', archive: true, rendezVousSignature: '2026-09-10' });
  const st = app.statsPortefeuilleVisuel(actifs, actifs.concat([archive]), AUJ);
  assert.equal(st.actifs, 4);
  assert.equal(st.parStatut.pret, 2);      // a (rien à vérifier) et c (offre reçue, jamais relié)
  assert.equal(st.parStatut.blocage, 1);   // b
  assert.equal(st.parStatut.arelier, 1);   // d
  assert.equal(st.parStatut.pret + st.parStatut.aconfirmer + st.parStatut.blocage + st.parStatut.arelier, 4);
  assert.equal(st.signaturesMois.total, 2);
  assert.equal(st.signaturesMois.faites, 1);
  assert.equal(st.offres.total, 3);
  assert.equal(st.offres.recues, 1);
  assert.ok(st.avancementMoyen >= 0 && st.avancementMoyen <= 100);
});

test('statsPortefeuilleVisuel : un rendez-vous d\'un autre mois ne compte pas', () => {
  const actifs = [dossier({ rendezVousSignature: '2026-10-02' })];
  const st = app.statsPortefeuilleVisuel(actifs, actifs, AUJ);
  assert.equal(st.signaturesMois.total, 0);
});

test('phrasePortefeuille : la première règle qui s\'applique', () => {
  const base = { actifs: 3, parStatut: { pret: 0, aconfirmer: 3, blocage: 0, arelier: 0 }, signaturesMois: { total: 0, faites: 0 } };
  assert.equal(app.phrasePortefeuille(Object.assign({}, base, { actifs: 0 })), 'Aucun dossier en cours.');
  assert.equal(app.phrasePortefeuille(Object.assign({}, base, { parStatut: { pret: 3, aconfirmer: 0, blocage: 0, arelier: 0 } })), 'Tous les dossiers sont prêts à signer.');
  assert.equal(app.phrasePortefeuille(Object.assign({}, base, { parStatut: { pret: 0, aconfirmer: 1, blocage: 2, arelier: 0 } })), '2 dossiers sans aucun document reçu.');
  assert.equal(app.phrasePortefeuille(Object.assign({}, base, { signaturesMois: { total: 3, faites: 1 } })), "Encore 2 signatures d'ici la fin du mois.");
  assert.equal(app.phrasePortefeuille(Object.assign({}, base, { signaturesMois: { total: 2, faites: 2 } })), 'Toutes les signatures du mois sont faites.');
  assert.equal(app.phrasePortefeuille(base), 'Les pièces arrivent : rien de bloquant.');
});
