// « Demander à CLAIRE » et la Constitution de dossier (étude 24/10) : l'outil s'ouvre à droite, des organismes ou des banques
// s'ajoutent par leur nom — rien n'est généré ni envoyé, l'utilisateur valide.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const app = chargerApplication();

test('organismes : noms séparés par « ; », des retours à la ligne ou des virgules, sans doublon', () => {
  assert.equal(app.organismesDepuisTexteAgent('BNP Paribas ; Crédit Agricole\nCaisse d’Épargne, et La Banque Postale, bnp paribas').join('|'),
    'BNP Paribas|Crédit Agricole|Caisse d’Épargne|La Banque Postale');
  assert.equal(app.organismesDepuisTexteAgent('').length, 0);
  assert.equal(app.organismesDepuisTexteAgent(Array.from({ length: 30 }, (_, i) => 'Banque ' + i).join(';')).length, 12);
});

test('succession : le modèle de courrier suit le nom de l’organisme, banque par défaut', () => {
  const m = (n) => app.modeleSuccessionPourOrganismeAgent(n);
  assert.equal(m('Crédit Agricole Val de France'), 'banque');
  assert.equal(m('AXA Assurances'), 'assurance-vie');
  assert.equal(m('Mutuelle Harmonie'), 'mutuelle');
  assert.equal(m('CPAM de Loir-et-Cher'), 'cpam');
  assert.equal(m('CARSAT Centre'), 'carsat');
  assert.equal(m('MSA Berry Touraine'), 'msa');
  assert.equal(m('AGIRC-ARRCO'), 'retraite');
  assert.equal(m('EHPAD Les Lilas'), 'ehpad');
  assert.equal(m('SPFE de Blois'), 'impots');
});

test('répertoire : tous les mots du nom ; l’organisme exact passe avant les autres', () => {
  const contacts = [
    { id: 'a', organisme: 'Crédit Agricole', service: 'Succession' },
    { id: 'b', organisme: 'Crédit Agricole Mutuel', service: 'Agence' },
    { id: 'c', organisme: 'BNP Paribas', service: 'Succession' }
  ];
  assert.equal(app.contactsRepertoirePourNomAgent('crédit agricole', contacts).map(c => c.id).join(','), 'a');
  assert.equal(app.contactsRepertoirePourNomAgent('Crédit', contacts).map(c => c.id).join(','), 'a,b');
  assert.equal(app.contactsRepertoirePourNomAgent('Banque inconnue', contacts).length, 0);
  const services = [{ id: 'p', organisme: 'Crédit Agricole Val de France', service: 'Service prêt' }, { id: 's', organisme: 'Crédit Agricole Val de France', service: 'Service successions' }];
  assert.equal(app.contactsRepertoirePourNomAgent('Crédit Agricole Val de France', services).length, 2);
  assert.equal(app.contactsRepertoirePourNomAgent('Crédit Agricole Val de France', services, true).map(c => c.id).join(','), 's', 'succession : le service des successions s’il est seul');
});

test('mode ajouter : refusé sans dossier ni constitution ouverte sur lui', () => {
  assert.match(app.ajouterOrganismesConstitutionAgent('constitution', null, 'BNP').erreur, /dossier_id/);
  assert.match(app.ajouterOrganismesConstitutionAgent('quotites', { id: 'x' }, 'BNP').erreur, /constitution/);
  assert.match(app.ajouterOrganismesConstitutionAgent('constitution', { id: 'x' }, 'BNP').erreur, /pas ouverte/);
});
