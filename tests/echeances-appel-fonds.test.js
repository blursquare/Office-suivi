'use strict';

// Trois demandes traitées ensemble (voir script.js, section "renderTab"/CLAUDE.md) :
// - une échéance "Appel de fonds", visible seulement une fois le dossier complet
//   (dossierEntierementComplet) et positionnée juste avant "Signature de l'acte" ;
// - une échéance fixe "Rendez-vous de signature", distincte de la date butoir "Signature de
//   l'acte" (indicative, lue dans l'avant-contrat) — le rendez-vous réel pris à l'office ;
// - la validation manuelle ("Marquer réalisée"/"Annuler la validation"), jusqu'ici réservée à la
//   vente préalable, généralisée à N'IMPORTE QUELLE échéance (fixe ou personnalisée).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

function dossierBase(extra) {
  return Object.assign({
    id: 'd1', nom: 'DUPONT / MARTIN', typeVente: 'maison', sansPret: true,
    roleNotaire: 'instrumentaire', pieces: {}, piecesRetirees: [], piecesPersonnalisees: [],
    piecesEngagementsDetectees: [], pret: '', acte: '', ventebien: '', autres: []
  }, extra || {});
}

// LIBELLES_CATEGORIE est un `const` de premier niveau, invisible depuis le contexte vm des tests
// (voir tests/helpers/load-app.js) : vérifié indirectement via libelleEcheancePourHistorique, qui
// s'appuie dessus et EST une `function` (donc exposée).
test('libelleEcheancePourHistorique résout les types fixes et une échéance personnalisée', () => {
  const app = chargerApplication();
  const d = dossierBase({ autres: [{ label: 'Diagnostic amiante', date: '2026-10-01' }] });
  assert.equal(app.libelleEcheancePourHistorique(d, 'appelFonds'), 'Appel de fonds');
  assert.equal(app.libelleEcheancePourHistorique(d, 'rendezVousSignature'), 'Rendez-vous de signature');
  assert.equal(app.libelleEcheancePourHistorique(d, 'autre-0'), 'Diagnostic amiante');
  // Index hors limites (échéance déjà supprimée entretemps) : repli sans planter.
  assert.equal(app.libelleEcheancePourHistorique(d, 'autre-9'), 'Échéance personnalisée');
});

test('echeanceValidee : le prêt peut être validé manuellement, en plus du statut offre reçue', () => {
  const app = chargerApplication();
  assert.equal(app.echeanceValidee(dossierBase({ offrePretStatut: 'inconnu' }), 'pret'), false);
  const valideManuel = dossierBase({ offrePretStatut: 'inconnu', echeancesValidees: { pret: true } });
  assert.equal(app.echeanceValidee(valideManuel, 'pret'), true);
  assert.equal(app.echeanceValidee(dossierBase({ offrePretStatut: 'recue' }), 'pret'), true);
});

test('echeanceValidee couvre appelFonds et rendezVousSignature comme n\'importe quel autre type', () => {
  const app = chargerApplication();
  const d = dossierBase({ echeancesValidees: { appelFonds: true } });
  assert.equal(app.echeanceValidee(d, 'appelFonds'), true);
  assert.equal(app.echeanceValidee(d, 'rendezVousSignature'), false);
});

test('dossierEntierementComplet pilote la visibilité de l\'appel de fonds', () => {
  const app = chargerApplication();
  const incomplet = dossierBase({ sansPret: false, offrePretStatut: 'inconnu' });
  const complet = dossierBase({ sansPret: true, roleNotaire: 'participant' });
  assert.equal(app.dossierEntierementComplet(incomplet), false);
  assert.equal(app.dossierEntierementComplet(complet), true);
});

test('renderTab : croix de suppression et bouton de validation présents sur les deux nouveaux types', () => {
  const app = chargerApplication();
  const htmlAppelFonds = app.renderTab('appelFonds', 'Appel de fonds', '2026-11-20', 'd1', null, null, null, false, '', false, false);
  assert.match(htmlAppelFonds, /supprimerDateEcheance\('d1', 'appelFonds'\)/);
  assert.match(htmlAppelFonds, /validerEcheance\('d1','appelFonds'\)/);
  assert.match(htmlAppelFonds, /Marquer réalisée/);

  const htmlRdv = app.renderTab('rendezVousSignature', 'Rendez-vous de signature', '2026-12-01', 'd1', null, null, null, false, '', false, true);
  assert.match(htmlRdv, /supprimerDateEcheance\('d1', 'rendezVousSignature'\)/);
  assert.match(htmlRdv, /devaliderEcheance\('d1','rendezVousSignature'\)/);
  assert.match(htmlRdv, /Annuler la validation/);
});

test('renderTab : le bouton de validation utilise la clé "autre-N" pour une échéance personnalisée', () => {
  const app = chargerApplication();
  const html = app.renderTab('autre', 'Diagnostic amiante', '2026-10-01', 'd1', null, null, 2, false, '', false, false);
  assert.match(html, /validerEcheance\('d1','autre-2'\)/);
});

test('renderTab : aucun bouton "Annuler la validation" mort quand le prêt est déjà auto-confirmé reçu', () => {
  const app = chargerApplication();
  const html = app.renderTab('pret', 'Obtention du prêt', '2026-09-01', 'd1', null, null, null, true, '', false, true);
  assert.doesNotMatch(html, /devaliderEcheance/);
  assert.doesNotMatch(html, /validerEcheance/);
});

test('renderTab : le prêt non encore reçu propose bien "Marquer réalisée" (validation manuelle possible)', () => {
  const app = chargerApplication();
  const html = app.renderTab('pret', 'Obtention du prêt', '2026-09-01', 'd1', null, null, null, false, '', false, false);
  assert.match(html, /validerEcheance\('d1','pret'\)/);
});

test('toutesEcheances/prochaineEcheanceDetail/calculerProchaineEcheance couvrent les deux nouvelles échéances', () => {
  const app = chargerApplication();
  const d = dossierBase({ appelFonds: '2026-11-20', rendezVousSignature: '2026-12-01' });
  const types = app.toutesEcheances(d).map((e) => e.type).sort();
  assert.equal(types.join(','), 'appelFonds,rendezVousSignature');

  const detail = app.prochaineEcheanceDetail(d);
  assert.equal(detail.type, 'appelFonds');

  const validees = Object.assign({}, d, { echeancesValidees: { appelFonds: true, rendezVousSignature: true } });
  assert.equal(app.prochaineEcheanceDetail(validees), null);
});

test('normaliserDossierImporte conserve appelFonds/rendezVousSignature comme les autres dates fixes', () => {
  const app = chargerApplication();
  const importe = { nom: 'X / Y', appelFonds: '2026-11-20', rendezVousSignature: '2026-12-01' };
  const d = app.normaliserDossierImporte(importe, 'x.json');
  assert.equal(d.appelFonds, '2026-11-20');
  assert.equal(d.rendezVousSignature, '2026-12-01');
});

test('normaliserDossierImporte écarte une date mal formée pour les deux nouveaux champs', () => {
  const app = chargerApplication();
  const d = app.normaliserDossierImporte({ nom: 'X / Y', appelFonds: 'pas une date' }, 'x.json');
  assert.equal(d.appelFonds, '');
});
