'use strict';

// Notification "nouvelle pièce trouvée" (voir CLAUDE.md, section sur d.piecesNotifications) :
// libelleNotificationPiece() résout le nom affiché d'une clé de notification (une clé de la
// checklist de pièces, ou le pseudo-cle CLE_NOTIF_OFFRE_PRET pour l'offre de prêt) ;
// tagNotificationsDossier() rend l'indicateur affiché sur une ligne du Suivi.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

function dossierBase(extra) {
  return Object.assign({
    id: 'd1', nom: 'DUPONT / MARTIN', typeVente: 'maison',
    piecesRetirees: [], piecesPersonnalisees: [], piecesEngagementsDetectees: [],
    pieces: {}, piecesNotifications: []
  }, extra || {});
}

test('libelleNotificationPiece résout le pseudo-cle de l\'offre de prêt', () => {
  const app = chargerApplication();
  assert.equal(app.libelleNotificationPiece(dossierBase(), app.CLE_NOTIF_OFFRE_PRET), 'Offre de prêt');
});

test('libelleNotificationPiece résout une clé de la checklist de pièces standard', () => {
  const app = chargerApplication();
  const d = dossierBase();
  const checklist = app.checklistPieces(d.typeVente, d);
  const premiere = checklist[0];
  assert.equal(app.libelleNotificationPiece(d, premiere.cle), premiere.label);
});

test('libelleNotificationPiece se rabat sur la clé elle-même si elle n\'existe plus dans la checklist', () => {
  const app = chargerApplication();
  assert.equal(app.libelleNotificationPiece(dossierBase(), 'clé-disparue'), 'clé-disparue');
});

test('tagNotificationsDossier : vide sans notification, singulier/pluriel sinon', () => {
  const app = chargerApplication();
  assert.equal(app.tagNotificationsDossier(dossierBase()), '');
  const uneSeule = app.tagNotificationsDossier(dossierBase({ piecesNotifications: ['x'] }));
  assert.match(uneSeule, /1 nouvelle pièce\b/);
  assert.doesNotMatch(uneSeule, /pièces</);
  const plusieurs = app.tagNotificationsDossier(dossierBase({ piecesNotifications: ['x', 'y'] }));
  assert.match(plusieurs, /2 nouvelles pièces\b/);
});

// totalNotificationsPieces()/majBadgeNotificationsSidebar() dépendent de `dossiers` (un `let` de
// premier niveau, invisible depuis le contexte vm des tests — voir tests/helpers/load-app.js) :
// non testables unitairement ici, même limite déjà documentée pour les autres fonctions de
// lecture/mutation de `dossiers` dans ce fichier. Vérifiées par lecture de code (une simple somme
// filtrée sur !d.archive) plutôt que par un test committé.

test('fondsCompletsAConfirmer (05/10) : tous les fonds reçus, réception pas encore confirmée — compte dans la pastille du Suivi', () => {
  const app = chargerApplication();
  const d = (extra) => dossierBase(Object.assign({ fondsRecus: { total: 180000, attendu: 180000 } }, extra));
  assert.equal(app.fondsCompletsAConfirmer(d()), true);
  assert.equal(app.fondsCompletsAConfirmer(d({ fondsRecus: { total: 179999, attendu: 180000 } })), true, 'à 2 € près');
  assert.equal(app.fondsCompletsAConfirmer(d({ fondsRecus: { total: 100000, attendu: 180000 } })), false, 'partiel');
  assert.equal(app.fondsCompletsAConfirmer(d({ receptionFondsConfirmeeLe: '2026-10-05' })), false, 'déjà confirmée');
  assert.equal(app.fondsCompletsAConfirmer(d({ archive: true })), false);
  assert.equal(app.fondsCompletsAConfirmer(dossierBase()), false, 'aucun reçu lu');
});
