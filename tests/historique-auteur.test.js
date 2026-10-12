'use strict';

// Historique d'un dossier : un geste fait seul par CLAIRE n'est jamais signé du collaborateur dont la fenêtre l'a posé (étude 12/10 :
// « Jérémy a fait l'envoi du projet mais c'est noté comme Julie » — mention de l'agenda posée par la fenêtre de Julie).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { chargerApplication } = require('./helpers/load-app.js');

test('ajouterHistorique : geste du collaborateur signé, geste automatique de CLAIRE sans auteur', () => {
  const app = chargerApplication();
  vm.runInContext("utilisateurPoste = 'Julie VASSELIN'", app);
  const d = { id: 'd1', historique: [] };
  app.ajouterHistorique(d, 'Envoi appel de fonds coché');
  app.ajouterHistorique(d, 'Mention « projet envoyé » notée dans l’agenda Outlook (automatique).', { auto: true });
  assert.equal(d.historique[0].auteur, 'Julie VASSELIN');
  assert.equal('auteur' in d.historique[1], false);
});
