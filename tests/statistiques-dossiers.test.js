'use strict';
// Widget « Statistiques » (02/10) : délais depuis l'ouverture du dossier (prêt, préemption, signature)
// et dossiers ouverts par mois. Dossiers inventés.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');
const app = chargerApplication();

const AUJ = '2026-10-15';
const h = (iso, texte) => ({ date: iso + 'T10:00:00', texte });
const dossiers = [
  // Ouvert le 01/07 : offre reçue le 10/08 (40 j), préemption trouvée sur le NAS le 31/07 (30 j), signé le 29/09 (90 j).
  { id: 'a', historique: [h('2026-07-01', 'Dossier créé'), h('2026-08-10', 'Offre de prêt retrouvée dans le dossier NAS')],
    pieces: { renonciationPreemption: 'recue' }, piecesTrouveesLe: { renonciationPreemption: '2026-07-31T09:00:00' }, rendezVousSignature: '2026-09-29' },
  // Ouvert le 01/09 : prêt marqué réalisé le 21/09 (20 j), préemption validée à la main le 11/09 (10 j), signature à venir.
  { id: 'b', historique: [h('2026-09-01', 'Dossier créé'), h('2026-09-21', 'Obtention du prêt marquée réalisée'),
    h('2026-09-11', 'Pièce validée à la main (hors dossier NAS) : « Renonciation au droit de préemption »')],
    pieces: { renonciationPreemption: 'recue' }, rendezVousSignature: '2026-11-05' },
  // Comptant, ouvert en octobre : rien à mesurer.
  { id: 'c', sansPret: true, historique: [h('2026-10-02', 'Dossier créé'), h('2026-10-05', 'Offre de prêt retrouvée dans le dossier NAS')] },
  { id: 'd', historique: [h('2026-10-08', 'Dossier créé')] },
  // Sans entrée « Dossier créé » (ancien format) : jamais compté.
  { id: 'e', historique: [h('2026-09-20', 'Offre de prêt retrouvée dans le dossier NAS')], rendezVousSignature: '2026-10-01' }
];

test('dates relevées : ouverture, prêt (jamais pour un comptant), préemption (NAS puis historique), signature passée', () => {
  assert.equal(app.dateOuvertureDossier(dossiers[0]), '2026-07-01');
  assert.equal(app.dateObtentionPret(dossiers[0]), '2026-08-10');
  assert.equal(app.dateObtentionPret(dossiers[1]), '2026-09-21');
  assert.equal(app.dateObtentionPret(dossiers[2]), null);
  assert.equal(app.dateRenonciationPreemption(dossiers[0]), '2026-07-31');
  assert.equal(app.dateRenonciationPreemption(dossiers[1]), '2026-09-11');
  assert.equal(app.dateRenonciationPreemption({ pieces: {} }), null);
  assert.equal(app.dateSignatureFaite(dossiers[0], AUJ), '2026-09-29');
  assert.equal(app.dateSignatureFaite(dossiers[1], AUJ), null);
});

test('statistiquesDelaisDossiers : moyenne, médiane et nombre de dossiers mesurés', () => {
  const s = app.statistiquesDelaisDossiers(dossiers, AUJ);
  assert.equal(`${s.pret.moyenne}/${s.pret.mediane}/${s.pret.n}/${s.pret.min}-${s.pret.max}`, '30/30/2/20-40');
  assert.equal(`${s.preemption.moyenne}/${s.preemption.n}`, '20/2');
  assert.equal(`${s.signature.moyenne}/${s.signature.n}`, '90/1');
  const vide = app.statistiquesDelaisDossiers([], AUJ);
  assert.equal(`${vide.pret.moyenne}/${vide.pret.n}`, 'null/0');
  // Au-delà de 12 mois, un événement ne compte plus.
  assert.equal(app.statistiquesDelaisDossiers(dossiers, '2027-10-01').pret.n, 0);
});

test('comparaisonDossiersOuverts : ce mois, le précédent, le même mois l’an dernier (« — » avant CLAIRE)', () => {
  const c = app.comparaisonDossiersOuverts(dossiers, AUJ);
  assert.equal(`${c.mois.cle}:${c.mois.n}`, '2026-10:2');
  assert.equal(`${c.precedent.cle}:${c.precedent.n}:${c.precedent.disponible}`, '2026-09:1:true');
  assert.equal(`${c.anPasse.cle}:${c.anPasse.n}:${c.anPasse.disponible}`, '2025-10:0:false');
  assert.equal(c.premiere, '2026-07-01');
  // Janvier : le mois précédent est décembre de l'année d'avant.
  assert.equal(app.comparaisonDossiersOuverts(dossiers, '2027-01-10').precedent.cle, '2026-12');
  assert.equal(app.nomMoisStatistiques('2025-10', '2026'), 'octobre 2025');
  assert.equal(app.nomMoisStatistiques('2026-09', '2026'), 'septembre');
  assert.equal(app.nomMoisStatistiques('2025-10', '2026', true), 'oct. 25');
});
