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

test('phrasePortefeuille : la première règle qui s\'applique (par étape du dossier)', () => {
  const vide = { conditions: 0, pieces: 0, rdv: 0, envois: 0, signature: 0 };
  const base = { actifs: 3, parEtape: Object.assign({}, vide, { conditions: 3 }), signaturesMois: { total: 0, faites: 0 } };
  const avec = (e) => Object.assign({}, base, { parEtape: Object.assign({}, vide, e) });
  assert.equal(app.phrasePortefeuille(Object.assign({}, base, { actifs: 0 })), 'Aucun dossier en cours.');
  assert.equal(app.phrasePortefeuille(avec({ signature: 3 })), 'Tous les dossiers sont à l’étape de la signature.');
  assert.equal(app.phrasePortefeuille(avec({ conditions: 1, pieces: 2 })), '2 dossiers avec des pièces manquantes.');
  assert.equal(app.phrasePortefeuille(Object.assign({}, base, { signaturesMois: { total: 3, faites: 1 } })), "Encore 2 signatures d'ici la fin du mois.");
  assert.equal(app.phrasePortefeuille(Object.assign({}, base, { signaturesMois: { total: 2, faites: 2 } })), 'Toutes les signatures du mois sont faites.');
  assert.equal(app.phrasePortefeuille(avec({ conditions: 2, rdv: 1 })), '1 rendez-vous de signature à fixer.');
  assert.equal(app.phrasePortefeuille(base), 'Les conditions suivent leur cours : rien de bloquant.');
});

test('statsPortefeuilleVisuel : répartition par étape du dossier', () => {
  const actifs = [
    dossier({ id: 'a', pret: '2026-10-20' }),                                        // attente de l'offre
    dossier({ id: 'b', sansPret: true, roleNotaire: 'participant' }),                 // rendez-vous à fixer
    dossier({ id: 'c', sansPret: true, roleNotaire: 'participant', rendezVousSignature: '2026-10-10' }), // appel de fonds
    dossier({ id: 'd', sansPret: true, roleNotaire: 'participant', rendezVousSignature: '2026-10-10', appelFonds: '2026-09-20', projetEnvoye: '2026-09-25' }) // prêt à signer
  ];
  const st = app.statsPortefeuilleVisuel(actifs, actifs, AUJ);
  assert.equal([st.parEtape.conditions, st.parEtape.pieces, st.parEtape.rdv, st.parEtape.envois, st.parEtape.signature].join(','), '1,0,1,1,1');
});
