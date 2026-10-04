'use strict';
// Réglages › Mise à jour et sauvegarde › Vérifications sur le terrain (03/10) : une ligne par point,
// état lisible, boutons de confirmation pour les points qui se voient à l'œil.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');
const app = chargerApplication();

test('lignesVerificationsTerrain : vérifié, échec, en attente, point manuel à confirmer', () => {
  const html = app.lignesVerificationsTerrain([
    { id: 'piece-jointe-nas', titre: 'Pièce jointe rangée', comment: 'Coché à la première copie.', depuis: '2026-10-02 23:16', source: 'serveur', statut: 'verifie',
      etat: { premiereFois: '2026-10-03T08:12:00.000Z', fois: 3, detail: 'à la racine du dossier' } },
    { id: 'emails-envoyes-collaborateur', titre: 'Envoyés d’un collaborateur', comment: 'Accès délégué.', depuis: '2026-10-02 23:01', source: 'serveur', statut: 'echec',
      etat: { echecs: 2, dernierEchec: '2026-10-03T09:00:00.000Z', messageEchec: 'Accès non donné' } },
    { id: 'visio-ics', titre: 'Visio ADNOV', comment: 'Lien lu.', depuis: '2026-10-01 15:37', source: 'poste', statut: 'attente', etat: null },
    { id: 'notification-logo', titre: 'Logo dans la notification', comment: 'À l’œil.', depuis: '2026-10-03 07:27', source: 'manuel', statut: 'attente', etat: null }
  ]);
  assert.match(html, /dl-success[^]*Vérifié[^]*3 fois · à la racine du dossier/);
  assert.match(html, /dl-urgent[^]*Échec[^]*Accès non donné/);
  assert.match(html, /dl-neutre[^]*En attente[^]*Pas encore observé au bureau/);
  assert.match(html, /À confirmer[^]*C’est bon[^]*Ne marche pas/);
  assert.equal((html.match(/confirmerVerificationTerrain/g) || []).length, 2, 'boutons seulement sur le point manuel');
  assert.equal(app.lignesVerificationsTerrain([]), '');
});

test('comparerVersions : 0.13.10 est après 0.13.9 (comparaison chiffre par chiffre)', () => {
  const { comparerVersions } = require('../server/src/verificationsTerrain');
  assert.ok(comparerVersions('0.13.10', '0.13.9') > 0);
  assert.ok(comparerVersions('0.12.40', '0.13.1') < 0);
  assert.equal(comparerVersions('0.13.9', '0.13.9'), 0);
  assert.ok(comparerVersions('2026-10-04 08:26', '2026-10-03 20:27') > 0, 'ancien format : ordre alphabétique');
});
