'use strict';

// État du dossier (voir etatDossier dans script.js) : le statut unique affiché partout, demandé par
// l'étude le 29/09 — À relier, Attente de pièces, Complet, Prêt ; Urgent dès qu'une date butoir est
// dépassée, puis retour à l'état normal une fois l'échéance levée.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const app = chargerApplication();
const AUJ = '2026-09-29';
const dossier = (extra) => Object.assign({ id: 'x', nom: 'DUPONT / MARTIN', typeVente: 'maison', roleNotaire: 'instrumentaire', pieces: {} }, extra);
const etat = (d) => app.etatDossier(d, AUJ);
// Toutes les pièces de la checklist reçues.
const toutesRecues = (d) => {
  const pieces = {};
  app.checklistPieces(d.typeVente, d).forEach(p => { pieces[p.cle] = 'recue'; });
  return Object.assign({}, d, { pieces });
};

test('ordre normal : à relier, attente de pièces, complet, prêt', () => {
  assert.equal(etat(dossier({ pret: '2026-11-20' })).texte, 'À relier');
  assert.equal(etat(dossier({ pret: '2026-11-20', dossierLie: true })).texte, 'Attente de pièces');
  const complet = toutesRecues(dossier({ dossierLie: true, pret: '2026-11-20', offrePretStatut: 'recue' }));
  assert.equal(etat(complet).texte, 'Complet');
  assert.equal(etat(Object.assign({}, complet, { rendezVousSignature: '2026-10-20' })).texte, 'Prêt');
  assert.equal(etat(dossier({ archive: true })).texte, 'Archivé');
});

test('attente de pièces : l’offre de prêt compte comme une pièce, pas pour un achat comptant', () => {
  const pieces = toutesRecues(dossier({ dossierLie: true, pret: '2026-11-20' }));
  const e = etat(pieces);
  assert.equal(e.cle, 'attente');
  assert.match(e.detail, /Offre de prêt/);
  assert.equal(etat(Object.assign({}, pieces, { sansPret: true })).cle, 'complet');
  // Une pièce manquante suffit, même avec l'offre reçue et un rendez-vous placé.
  const manque = Object.assign({}, pieces, { offrePretStatut: 'recue', rendezVousSignature: '2026-10-20' });
  manque.pieces = Object.assign({}, manque.pieces);
  const cle = Object.keys(manque.pieces)[0];
  manque.pieces[cle] = 'manquante';
  assert.equal(etat(manque).cle, 'attente');
});

test('participation : la checklist n’est pas suivie, seule l’offre compte', () => {
  const d = dossier({ roleNotaire: 'participant', dossierLie: true, pret: '2026-11-20' });
  assert.equal(etat(d).cle, 'attente');
  assert.equal(etat(Object.assign({}, d, { offrePretStatut: 'recue' })).cle, 'complet');
});

test('urgent : une date butoir dépassée passe avant tout, puis l’ordre normal reprend', () => {
  const d = dossier({ dossierLie: true, pret: '2026-09-20' });
  const e = etat(d);
  assert.equal(e.cle, 'urgent');
  assert.equal(e.dl, 'dl-urgent');
  assert.match(e.detail, /Obtention du prêt dépassée depuis le/);
  assert.equal(etat(Object.assign({}, d, { dossierLie: false })).cle, 'urgent', 'même non relié');
  // Offre reçue : l'échéance est levée, retour à l'état normal.
  assert.equal(etat(Object.assign({}, d, { offrePretStatut: 'recue' })).cle, 'attente');
  // Vente préalable dépassée, puis réalisée.
  const vp = dossier({ dossierLie: true, sansPret: true, ventebien: '2026-09-01' });
  assert.equal(etat(vp).cle, 'urgent');
  assert.equal(etat(Object.assign({}, vp, { echeancesValidees: { ventebien: true } })).cle, 'attente');
  // Date butoir dépassée sans rendez-vous ; un rendez-vous fixé la lève.
  const butoir = dossier({ dossierLie: true, sansPret: true, acte: '2026-09-15' });
  assert.equal(etat(butoir).cle, 'urgent');
  assert.equal(etat(Object.assign({}, butoir, { rendezVousSignature: '2026-10-15' })).cle, 'attente');
  // Aujourd'hui même n'est pas dépassé ; un achat comptant ignore la date du prêt.
  assert.equal(etat(dossier({ dossierLie: true, pret: AUJ })).cle, 'attente');
  assert.equal(etat(dossier({ dossierLie: true, sansPret: true, pret: '2026-09-01' })).cle, 'attente');
});

test('couleurs : urgent rouge, à relier neutre, attente ambre, complet accent, prêt vert', () => {
  assert.equal(app.ETATS_DOSSIER.map(e => e.cle + ':' + e.dl).join(','),
    'urgent:dl-urgent,arelier:dl-neutre,attente:dl-pret,complet:dl-complet,pret:dl-success');
  assert.equal(app.ORDRE_ETAT_DOSSIER.join(','), 'urgent,arelier,attente,complet,pret,signe,archive');
});

test('acte signé : « Signé » (vert), jamais « Attente de pièces » ni « Urgent », jusqu’à l’archivage', () => {
  // Pièce manquante et date butoir dépassée, mais acte signé dans Authentic.
  const d = dossier({ dossierLie: true, pret: '2026-09-01', authentic: { acte: { etat: 'signe', date: '2026-09-25' } } });
  assert.equal(app.dateSignatureDossier(d, AUJ) !== '', true, 'signature lue');
  const e = etat(d);
  assert.equal(e.cle + ':' + e.texte + ':' + e.dl, 'signe:Signé:dl-success');
  assert.match(e.detail, /^Acte signé le /);
  assert.equal(etat(Object.assign({}, d, { archive: true })).cle, 'archive');
  // Signature cochée à la main : « Signé » aussi.
  assert.equal(etat(dossier({ dossierLie: true, rendezVousSignature: '2026-09-25', echeancesValidees: { rendezVousSignature: true } })).cle, 'signe');
  // Relecture 24/10 : un rendez-vous simplement PASSÉ (ni signé dans Authentic ni coché) n'est pas « Signé » — l'urgence reste visible.
  const passe = dossier({ dossierLie: true, pret: '2026-09-01', rendezVousSignature: '2026-09-28' });
  assert.equal(etat(passe).cle, 'urgent');
  // Succession : « Signé » seulement quand tous ses actes le sont (signatureFaiteSuivi), pas sur une case « acte » seule.
  assert.notEqual(etat(dossier({ typeAffaire: 'succession', dossierLie: true, echeancesValidees: { acte: true }, rendezVousSignature: '2026-09-20' })).cle, 'signe');
});

test('anneau « Dossiers ouverts » : un dossier signé a son segment (le total au centre = la somme des segments)', () => {
  const st = app.statsPortefeuilleVisuel([
    dossier({ id: 'a', dossierLie: true, rendezVousSignature: '2026-09-25', echeancesValidees: { rendezVousSignature: true } }),
    dossier({ id: 'b', pret: '2026-11-20', dossierLie: true })
  ], null, AUJ);
  assert.equal(st.parEtat.signe, 1);
  assert.equal(Object.values(st.parEtat).reduce((x, y) => x + y, 0), 2);
});

test('vente préalable en cours : liée au financement, le dossier n’est ni complet ni prêt tant qu’elle n’est pas réalisée', () => {
  const d = toutesRecues(dossier({ dossierLie: true, sansPret: true, ventebien: '2026-11-15', rendezVousSignature: '2026-12-01' }));
  const e = etat(d);
  assert.equal(e.cle, 'attente');
  assert.match(e.detail, /En attente : Vente préalable/);
  assert.equal(etat(Object.assign({}, d, { echeancesValidees: { ventebien: true } })).cle, 'pret');
  const sansRdv = Object.assign({}, d, { rendezVousSignature: '', echeancesValidees: { ventebien: true } });
  assert.equal(etat(sansRdv).cle, 'complet');
});

test('rendez-vous placé avec une pièce manquante : reste « Attente de pièces » (confirmé par l’étude)', () => {
  const d = toutesRecues(dossier({ dossierLie: true, sansPret: true, rendezVousSignature: '2026-10-20' }));
  const cle = Object.keys(d.pieces)[0];
  d.pieces = Object.assign({}, d.pieces, { [cle]: 'manquante' });
  assert.equal(etat(d).cle, 'attente');
});

test('syntheseEtatsSuivi : un compte par statut et le fait qui compte (Suivi, 30/09)', () => {
  const lie = { dossierLie: true };
  const complet = toutesRecues(dossier({ dossierLie: true, pret: '2026-11-20', offrePretStatut: 'recue' }));
  const liste = [
    dossier({ pret: '2026-09-26', ...lie }),                        // urgent, 3 j
    dossier({ ventebien: '2026-09-19', pret: '2026-12-01', ...lie }), // urgent, 10 j
    dossier({ pret: '2026-11-20' }),                                 // à relier
    toutesRecues(dossier({ pret: '2026-11-20', ...lie })),           // attente : offre de prêt
    toutesRecues(dossier({ pret: '2026-12-20', ...lie })),           // attente : offre de prêt
    complet,
    Object.assign({}, complet, { rendezVousSignature: '2026-10-20' }),
    Object.assign({}, complet, { rendezVousSignature: '2026-10-08' })
  ];
  const s = app.syntheseEtatsSuivi(liste, AUJ);
  assert.equal(s.map(e => `${e.cle}:${e.nombre}`).join(' '), 'urgent:2 arelier:1 attente:2 complet:1 pret:2');
  const detail = (cle) => s.find(e => e.cle === cle).detail;
  assert.equal(detail('urgent'), "jusqu'à 10 j de retard");
  assert.equal(detail('attente'), 'surtout : Offre de prêt (2)');
  assert.match(detail('pret'), /^prochaine signature 8 oct/);
  // Aucun dossier : cinq statuts à zéro, sans détail.
  const vide = app.syntheseEtatsSuivi([], AUJ);
  assert.equal(vide.map(e => e.nombre + e.detail).join(''), '00000');
});
