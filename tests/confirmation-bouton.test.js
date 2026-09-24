const test = require('node:test');
const assert = require('node:assert');
const { chargerApplication } = require('./helpers/load-app.js');

test('le bouton de confirmation reprend le verbe de la question', () => {
  const app = chargerApplication();
  const b = m => { const r = app.boutonConfirmation(m); return r.bouton + '/' + r.ton; };
  assert.equal(b('Supprimer « X » du registre ?'), 'Supprimer/danger');
  assert.equal(b('Retirer la pièce « X » de la checklist ?'), 'Retirer/danger');
  assert.equal(b('Réinitialiser le statut de « X » ?'), 'Réinitialiser/danger');
  assert.equal(b('Vider le journal des corrections ?'), 'Vider/danger');
  assert.equal(b('Effacer la clé API ?'), 'Effacer/danger');
  assert.equal(b("Marquer « Certificat d'alignement » comme reçue ?"), 'Valider/valider');
  assert.equal(b('Importer 3 dossiers ?'), 'Importer/valider');
  assert.equal(b('Remplacer les parties de la fiche ?'), 'Mettre à jour/valider');
  // Jamais « Supprimer » par défaut sur une question inconnue.
  assert.equal(b('Continuer ?'), 'Confirmer/valider');
});
