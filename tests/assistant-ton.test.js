'use strict';

// « Demander à CLAIRE » : le ton (étude 11/10, client/59-assistant-ton.js). Les faits restent ceux du code ; ici seulement la
// salutation, l'introduction, la suite proposée et l'accueil. Tout est pur : même rang → même phrase.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');
const A = require('../commun/assistant');

const app = chargerApplication();
const matin = new Date(2026, 9, 11, 9, 30);
const soir = new Date(2026, 9, 11, 19, 0);

test('salutation : Bonjour le jour, Bonsoir à partir de 18 h, avec le prénom quand on le connaît', () => {
  assert.equal(app.salutationAssistant('Bastien', matin), 'Bonjour Bastien');
  assert.equal(app.salutationAssistant('Julie', soir), 'Bonsoir Julie');
  assert.equal(app.salutationAssistant('', matin), 'Bonjour');
  assert.equal(app.accueilAssistant('Jérémy', matin), 'Bonjour Jérémy, que puis-je faire pour vous ?');
});

test('formules de politesse : merci, au revoir, ça va, bonjour — vouvoiement, sans hasard', () => {
  assert.match(app.reponseSalutationAssistant('Merci beaucoup', 'Bastien', matin, 0), /Avec plaisir/);
  assert.notEqual(app.reponseSalutationAssistant('Merci', 'Bastien', matin, 0), app.reponseSalutationAssistant('Merci', 'Bastien', matin, 1), 'la réponse varie avec le rang');
  assert.equal(app.reponseSalutationAssistant('Merci', 'Bastien', matin, 4), app.reponseSalutationAssistant('Merci', 'Bastien', matin, 4), 'mais jamais au hasard');
  assert.match(app.reponseSalutationAssistant('À bientôt', 'Julie', soir, 0), /Bonne soirée Julie/);
  assert.match(app.reponseSalutationAssistant('Ça va ?', '', matin, 0), /merci/i);
  assert.equal(app.reponseSalutationAssistant('Bonsoir CLAIRE', 'Bastien', soir, 0), 'Bonsoir Bastien !');
  ['Merci', 'Bonjour', 'Ça va ?', 'À bientôt'].forEach(t => assert.doesNotMatch(app.reponseSalutationAssistant(t, 'Bastien', matin, 0), /\btu\b|\bton\b|\bta\b|\bte\b/i, `vouvoiement : ${t}`));
});

test('« bonjour » et « merci » sont compris sans IA ; une demande précise gagne sur la politesse ; l’échange libre est reconnu', () => {
  const lire = (t) => A.interpreterParMotsCles(t, { aujourdhui: '2026-10-11' });
  assert.equal(lire('Bonjour').intention, 'salutation');
  assert.equal(lire('Merci beaucoup').intention, 'salutation');
  assert.equal(lire('Bonjour, où en est le dossier MARTIN ?').intention, 'etat_dossier');
  assert.equal(lire('Bonjour, où en est le dossier MARTIN ?').surete, 'haute');
  assert.equal(lire('Merci de relancer MARTIN pour son prêt').intention, 'email');
  assert.equal(lire('Explique-moi la différence entre une promesse et un compromis').intention, 'conversation');
  assert.equal(lire('Que sais-tu faire ?').intention, 'aide');
  assert.equal(lire('Quel temps fait-il à Blois ?').intention, 'inconnu');
});

test('introductions : une par intention de lecture, variées, aucune pour un geste qui écrit', () => {
  ['etat_dossier', 'pieces_manquantes', 'echeances_dossier', 'coordonnees', 'fonds_dossier', 'taches_jour', 'depuis_hier', 'rappel_lister', 'agenda_jour', 'creneaux_signature']
    .forEach(cle => {
      const a = app.introLectureAssistant(cle, 'Bastien', 0);
      assert.ok(a, cle);
      assert.notEqual(a, app.introLectureAssistant(cle, 'Bastien', 1), `${cle} varie`);
    });
  assert.equal(app.introLectureAssistant('email', 'Bastien', 0), '');
  assert.equal(app.introLectureAssistant('archiver', 'Bastien', 0), '');
  assert.match(app.introLectureAssistant('taches_jour', 'Julie', 0), /Julie/);
});

test('suites : proposées seulement quand le dossier le justifie, avec la phrase qui repart dans la conversation', () => {
  const s = app.suiteLectureAssistant('etat_dossier', { nom: 'MARTIN', manque: 3, pretAttendu: true, retard: { label: 'Obtention du prêt', jours: 4 } });
  assert.match(s.texte, /Attention : « Obtention du prêt » est dépassée de 4 jours/);
  assert.match(s.texte, /offre de prêt n’est pas encore là/);
  assert.match(s.texte, /Souhaitez-vous que je m’en occupe/);
  assert.equal(s.boutons.map(b => b.phrase).join(' | '), 'Quelles pièces manquent pour MARTIN ? | Relance MARTIN pour son offre de prêt');
  // Les phrases proposées sont comprises par le code, sans IA.
  assert.equal(A.interpreterParMotsCles(s.boutons[0].phrase, {}).intention, 'pieces_manquantes');
  assert.equal(A.interpreterParMotsCles(s.boutons[1].phrase, {}).intention, 'email');
  assert.equal(app.suiteLectureAssistant('etat_dossier', { nom: 'MARTIN', manque: 0, pretAttendu: false, retard: null }), null, 'rien à proposer : rien');
  assert.equal(app.suiteLectureAssistant('etat_dossier', { manque: 2 }), null, 'sans nom de dossier, pas de bouton');
  assert.match(app.suiteLectureAssistant('fonds_dossier', { nom: 'LEROY', fondsReste: 1200 }).boutons[0].phrase, /Relance LEROY pour les fonds/);
  assert.equal(app.suiteLectureAssistant('fonds_dossier', { nom: 'LEROY', fondsReste: 0 }), null);
  assert.equal(app.suiteLectureAssistant('taches_jour', { nbTaches: 0 }), null);
});

test('texte libre de l’IA : paragraphes échappés, jamais de HTML interprété', () => {
  const html = app.htmlTexteLibreAssistant('Bonjour <b>Julie</b>\n\nUne promesse engage un seul côté.');
  assert.equal(html, '<p>Bonjour &lt;b&gt;Julie&lt;/b&gt;</p><p>Une promesse engage un seul côté.</p>');
  assert.equal(app.htmlTexteLibreAssistant(''), '');
});

test('faits d’un dossier pour les suites : pièces attendues, prêt non reçu, échéance dépassée', () => {
  const d = { id: 'd1', nom: 'VTE - MARTIN / DUPONT', typeVente: 'maison', roleNotaire: 'instrumentaire', pret: '2026-09-01', acte: '2026-12-15',
    pieces: {}, echeancesValidees: {}, historique: [], offrePretStatut: 'manquante', autres: [] };
  const f = app.faitsDossierAssistant(d);
  assert.equal(f.nom, 'MARTIN');
  assert.ok(f.manque > 0);
  assert.equal(f.pretAttendu, true);
  assert.equal(JSON.stringify(app.faitsDossierAssistant(null)), '{}');
  assert.equal(app.faitsDossierAssistant({ ...d, typeAffaire: 'succession', sansPret: true }).manque, 0, 'succession : pas de pièces de vente');
});
