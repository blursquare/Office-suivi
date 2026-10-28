// « Demander à CLAIRE » du 28/10 (client/138) : coordonnées d'un client, bilan d'un dossier pour la notaire.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { chargerApplication } = require('./helpers/load-app');

test('bilan : faits de l’historique, écart en jours', () => {
  const app = chargerApplication();
  const f = app.faitsHistoriqueBilan([{ texte: 'Relance de l’offre de prêt envoyée' }, { texte: 'Pièce reçue : titre de propriété' }, { texte: 'Échéance dépassée : prêt' }, { texte: 'Rendez-vous déplacé au 12/11' }]);
  assert.equal(f.entrees, 4);
  assert.equal(f.relances, 1);
  assert.equal(f.pieces_recues, 1);
  assert.equal(f.echeances_depassees_notees, 1);
  assert.equal(f.rendez_vous_deplaces, 1);
  assert.equal(app.joursEntreBilan('2026-07-01', '2026-08-20'), 50);
  assert.equal(app.joursEntreBilan('', '2026-08-20'), null);
});

test('coordonnées : la carte s’affiche sur le poste, l’IA reçoit personnes, téléphones et emails de chaque côté', () => {
  const app = chargerApplication();
  vm.runInContext("dossiers.push({ id: 'c1', nom: 'ESSAI / EXEMPLE', typeVente: 'maison', pieces: {}, historique: [], telephoneVendeur: '06 00 00 00 01', emailVendeur: 'v@exemple.fr', parties: [{ role: 'VENDEUR', prenom: 'Léa', nom: 'ESSAI', telephones: ['06 00 00 00 01'] }, { role: 'ACQUEREUR', nom: 'EXEMPLE' }] })", app);
  const nb = () => vm.runInContext('assistantMessages.length', app);
  const avant = nb();
  const r = app.coordonneesClientAgent({ dossier_id: 'c1', partie: '' });
  assert.equal(r.vendeur.personnes[0].nom, 'Léa ESSAI');
  assert.equal(r.vendeur.telephone, '06 00 00 00 01');
  assert.equal(r.acquereur.personnes[0].nom, 'EXEMPLE');
  assert.equal(nb(), avant + 1, 'la carte cliquable est posée dans la conversation');
  assert.match(vm.runInContext('assistantMessages[assistantMessages.length - 1].html', app), /tel:|06 00 00 00 01/);
  assert.equal(app.coordonneesClientAgent({ dossier_id: 'inconnu', partie: '' }).erreur, 'aucun dossier avec cet id');
});
