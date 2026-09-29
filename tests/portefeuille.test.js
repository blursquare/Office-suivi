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

test('statsPortefeuilleVisuel : états, signatures du mois (archivés compris), offres, avancement', () => {
  const actifs = [
    dossier({ id: 'a', sansPret: true, roleNotaire: 'participant' }), // rien à vérifier → prêt
    dossier({ id: 'b', offrePretStatut: 'manquante', dossierLie: true }),
    dossier({ id: 'c', offrePretStatut: 'recue', rendezVousSignature: '2026-09-30' }),
    dossier({ id: 'd' })
  ];
  const archive = dossier({ id: 'e', archive: true, rendezVousSignature: '2026-09-10' });
  const st = app.statsPortefeuilleVisuel(actifs, actifs.concat([archive]), AUJ);
  assert.equal(st.actifs, 4);
  assert.equal(Object.values(st.parEtat).reduce((t, n) => t + n, 0), 4);
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

test('phrasePortefeuille : la première règle qui s\'applique (par état du dossier)', () => {
  const vide = { urgent: 0, arelier: 0, attente: 0, complet: 0, pret: 0 };
  const base = { actifs: 3, parEtat: Object.assign({}, vide, { arelier: 3 }), signaturesMois: { total: 0, faites: 0 } };
  const avec = (e) => Object.assign({}, base, { parEtat: Object.assign({}, vide, e) });
  assert.equal(app.phrasePortefeuille(Object.assign({}, base, { actifs: 0 })), 'Aucun dossier en cours.');
  assert.equal(app.phrasePortefeuille(avec({ urgent: 1, attente: 2 })), '1 dossier avec une date butoir dépassée.');
  assert.equal(app.phrasePortefeuille(avec({ pret: 3 })), 'Tous les dossiers sont prêts à signer.');
  assert.equal(app.phrasePortefeuille(avec({ complet: 1, attente: 2 })), '2 dossiers en attente de pièces.');
  assert.equal(app.phrasePortefeuille(Object.assign({}, avec({ complet: 3 }), { signaturesMois: { total: 3, faites: 1 } })), "Encore 2 signatures d'ici la fin du mois.");
  assert.equal(app.phrasePortefeuille(Object.assign({}, base, { signaturesMois: { total: 2, faites: 2 } })), 'Toutes les signatures du mois sont faites.');
  assert.equal(app.phrasePortefeuille(avec({ complet: 2, pret: 1 })), '2 dossiers complets : rendez-vous à placer.');
  assert.equal(app.phrasePortefeuille(base), '3 dossiers à relier au NAS.');
});

test('statsPortefeuilleVisuel : répartition par état du dossier', () => {
  const actifs = [
    dossier({ id: 'a', pret: '2026-09-20', dossierLie: true }),                        // urgent (prêt dépassé)
    dossier({ id: 'b', pret: '2026-10-20' }),                                          // à relier
    dossier({ id: 'c', pret: '2026-10-20', dossierLie: true }),                        // attente de pièces
    dossier({ id: 'd', sansPret: true, roleNotaire: 'participant', dossierLie: true }), // complet
    dossier({ id: 'e', sansPret: true, roleNotaire: 'participant', dossierLie: true, rendezVousSignature: '2026-10-10' }) // prêt
  ];
  const st = app.statsPortefeuilleVisuel(actifs, actifs, AUJ);
  assert.equal([st.parEtat.urgent, st.parEtat.arelier, st.parEtat.attente, st.parEtat.complet, st.parEtat.pret].join(','), '1,1,1,1,1');
});
