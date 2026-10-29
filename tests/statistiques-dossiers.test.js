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
  // Tous les dossiers, sans fenêtre de dates : un événement ancien compte toujours.
  assert.equal(app.statistiquesDelaisDossiers(dossiers, '2028-10-01').pret.n, 2);
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

test('lignesActesAgenda : toute l’année en cours (passés + à venir) contre toute l’année précédente', () => {
  const lignes = app.lignesActesAgenda({
    annee: 2026, precedente: 2025,
    anneeEnCours: { ventes: 51, successions: 12, donations: 7, dee: 4, pacs: 9 },
    actuel: { ventes: 42, successions: 12, donations: 6, dee: 3, pacs: 8 },
    aVenir: { ventes: 9, successions: 0, donations: 1, dee: 1, pacs: 1 },
    memePeriode: { ventes: 38, successions: 15, donations: 6, dee: 2, pacs: 5 },
    anneePrecedente: { ventes: 51, successions: 19, donations: 8, dee: 5, pacs: 6 }
  });
  assert.equal(lignes.map(l => `${l.libelle} ${l.annee}=${l.passes}+${l.aVenir} vs ${l.anneePrecedente} (${l.ecart})`).join(' | '),
    'Ventes 51=42+9 vs 51 (0) | Successions 12=12+0 vs 19 (-7) | Donations 7=6+1 vs 8 (-1) | Donations entre époux (DEE) 4=3+1 vs 5 (-1) | PACS 9=8+1 vs 6 (3)');
  // Réponse d'un serveur plus ancien (sans anneeEnCours) : passés + à venir.
  assert.equal(app.lignesActesAgenda({ actuel: { ventes: 3 }, aVenir: { ventes: 2 }, anneePrecedente: { ventes: 4 } })[0].annee, 5);
  assert.equal(app.lignesActesAgenda(null).length, 0);
});
