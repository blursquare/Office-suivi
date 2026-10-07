'use strict';

// « Demander à CLAIRE » (étude 06/10) : la part SANS IA de l'assistant — liste fermée des intentions, lecture par
// mots-clés, dates/heures/montants écrits en français, dossier désigné par son nom ou celui d'une partie
// (commun/assistant.js), et les aides pures de la page (client/49-assistant.js).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const A = require('../commun/assistant');
const { chargerApplication } = require('./helpers/load-app');

const AUJ = '2026-10-06'; // un mardi
const DOSSIERS = [
  { id: 'd1', nom: 'MARTIN / DUPONT', parties: [{ nom: 'MARTIN' }, { nom: 'DUPONT' }] },
  { id: 'd2', nom: 'LEROY', parties: [{ nom: 'LEROY' }, { nom: 'BERNARD' }] },
  { id: 'd3', nom: 'DUPONT / ROUX', parties: [] },
  { id: 'd4', nom: 'LE ROUX', archive: true, parties: [] }
];

test('chaque intention a une clé unique, un libellé, une description et des exemples (sauf inconnu)', () => {
  const cles = A.INTENTIONS_ASSISTANT.map(i => i.cle);
  assert.equal(new Set(cles).size, cles.length);
  for (const i of A.INTENTIONS_ASSISTANT) {
    assert.ok(i.libelle && i.description, i.cle);
    if (i.cle !== 'inconnu') assert.ok(i.exemples.length >= 1 && i.motifs.length >= 1, i.cle);
  }
  // Chaque exemple est compris par les mots-clés comme son intention (sans IA).
  for (const i of A.INTENTIONS_ASSISTANT) {
    for (const ex of i.exemples) {
      const r = A.interpreterParMotsCles(ex, { aujourdhui: AUJ });
      assert.equal(r.intention, i.cle, `« ${ex} » → ${r.intention}`);
    }
  }
});

test('dateDepuisTexte : demain, jour de la semaine, « prochain », dans N jours, JJ/MM, « le 14 novembre », « 1er mars »', () => {
  assert.equal(A.dateDepuisTexte('demain', AUJ), '2026-10-07');
  assert.equal(A.dateDepuisTexte('après-demain', AUJ), '2026-10-08');
  assert.equal(A.dateDepuisTexte('vendredi', AUJ), '2026-10-09');
  assert.equal(A.dateDepuisTexte('mardi', AUJ), '2026-10-13'); // jamais aujourd'hui
  assert.equal(A.dateDepuisTexte('mercredi prochain', AUJ), '2026-10-14'); // « prochain » dit un mardi = pas demain
  assert.equal(A.dateDepuisTexte('dans 3 jours', AUJ), '2026-10-09');
  assert.equal(A.dateDepuisTexte('dans 2 semaines', AUJ), '2026-10-20');
  assert.equal(A.dateDepuisTexte('le 14/11', AUJ), '2026-11-14');
  assert.equal(A.dateDepuisTexte('le 14/11/2027', AUJ), '2027-11-14');
  assert.equal(A.dateDepuisTexte('le 15/01', AUJ), '2027-01-15'); // déjà passé cette année → l'an prochain
  assert.equal(A.dateDepuisTexte('le 14 novembre à 10 h', AUJ), '2026-11-14');
  assert.equal(A.dateDepuisTexte('1er mars', AUJ), '2027-03-01');
  assert.equal(A.dateDepuisTexte('12 nov. 2026', AUJ), '2026-11-12');
  assert.equal(A.dateDepuisTexte('la semaine prochaine', AUJ), '2026-10-12');
  assert.equal(A.dateDepuisTexte('31/02', AUJ), '');
  assert.equal(A.dateDepuisTexte('rien', AUJ), '');
});

test('heureDepuisTexte : « à 10 h », « 10h30 », « 14:15 », « 9 heures »', () => {
  assert.equal(A.heureDepuisTexte('à 10 h'), '10:00');
  assert.equal(A.heureDepuisTexte('10h30'), '10:30');
  assert.equal(A.heureDepuisTexte('à 14:15'), '14:15');
  assert.equal(A.heureDepuisTexte('9 heures'), '09:00');
  assert.equal(A.heureDepuisTexte('le 14 novembre'), '');
});

test('montantsDepuisTexte : espaces, points, virgules, k, euros — jamais un jour, une heure ni un pourcentage', () => {
  assert.deepEqual(A.montantsDepuisTexte('250 000 €'), [250000]);
  assert.deepEqual(A.montantsDepuisTexte('250.000,50 euros'), [250000.5]);
  assert.deepEqual(A.montantsDepuisTexte('250k'), [250000]);
  assert.deepEqual(A.montantsDepuisTexte('1 200 € le 15/06 à 10 h, 60 % et 40 %'), [1200]);
  assert.deepEqual(A.montantsDepuisTexte('le 14 novembre 2026'), []);
  assert.deepEqual(A.partsDepuisTexte('60/40'), [60, 40]);
  assert.deepEqual(A.partsDepuisTexte('70 % et 30 %'), [70, 30]);
  assert.deepEqual(A.partsDepuisTexte('14/11'), []);
});

test('reconnaitreDossier : nom du dossier, nom d’une partie, égalité → candidats, archivé après en cours', () => {
  assert.equal(A.reconnaitreDossier('Où en est le dossier martin ?', DOSSIERS).dossier, 'd1');
  assert.equal(A.reconnaitreDossier('relance Bernard', DOSSIERS).dossier, 'd2');
  const deux = A.reconnaitreDossier('demande le RIB à Dupont', DOSSIERS);
  assert.equal(deux.dossier, '');
  assert.deepEqual(deux.candidats.map(c => c.id).sort(), ['d1', 'd3']);
  assert.equal(A.reconnaitreDossier('dossier Dupont Roux', DOSSIERS).dossier, 'd3');
  assert.equal(A.reconnaitreDossier('le dossier Roux', DOSSIERS).dossier, 'd3'); // d4 (archivé) passe après
  assert.equal(A.reconnaitreDossier('mes tâches du jour', DOSSIERS).dossier, '');
  // Un mot d'usage (« pret », « dossier ») ne désigne jamais un dossier nommé ainsi.
  assert.equal(A.reconnaitreDossier('offre de prêt', [{ id: 'x', nom: 'PRET' }]).dossier, '');
});

test('interpreterParMotsCles : paramètres lus dans la phrase et départages', () => {
  const r = A.interpreterParMotsCles('Place la signature MARTIN le 14 novembre à 10 h', { aujourdhui: AUJ });
  assert.equal(r.intention, 'rendez_vous_placer');
  assert.equal(r.parametres.date, '2026-11-14');
  assert.equal(r.parametres.heure, '10:00');
  const e = A.interpreterParMotsCles('Relance Martin pour son offre de prêt', { aujourdhui: AUJ });
  assert.equal(e.intention, 'email');
  assert.equal(e.parametres.modele, 'pret');
  const c = A.interpreterParMotsCles('Marque le projet envoyé pour LEROY', { aujourdhui: AUJ });
  assert.equal(c.intention, 'echeance_cocher');
  assert.equal(c.parametres.echeance, 'projetEnvoye');
  const dc = A.interpreterParMotsCles("Décoche l'appel de fonds de MARTIN", { aujourdhui: AUJ });
  assert.equal(dc.intention, 'echeance_decocher');
  assert.equal(dc.parametres.echeance, 'appelFonds');
  const af = A.interpreterParMotsCles("Fais l'appel de fonds de LEROY", { aujourdhui: AUJ });
  assert.equal(af.intention, 'appel_fonds');
  const f = A.interpreterParMotsCles('Combien il manque sur les fonds de MARTIN ?', { aujourdhui: AUJ });
  assert.equal(f.intention, 'fonds_dossier');
  const p = A.interpreterParMotsCles('Provision pour une maison à 250 000 € dans le 41', { aujourdhui: AUJ });
  assert.equal(p.intention, 'provision');
  assert.equal(p.parametres.montant, 250000);
  assert.equal(p.parametres.departement, '41');
  assert.equal(p.parametres.typeBien, 'house');
  const q = A.interpreterParMotsCles('Quotités 60/40 pour LEROY sur 250 000 €', { aujourdhui: AUJ });
  assert.equal(q.intention, 'quotites');
  assert.deepEqual(q.parametres.parts, [60, 40]);
  const ecran = A.interpreterParMotsCles("Ouvre l'agenda", { aujourdhui: AUJ });
  assert.equal(ecran.intention, 'ouvrir_ecran');
  assert.equal(ecran.parametres.ecran, 'agenda');
  const resp = A.interpreterParMotsCles('Attribue le dossier MARTIN à Julie', { aujourdhui: AUJ });
  assert.equal(resp.intention, 'responsable');
  assert.equal(resp.parametres.collaborateur, 'Julie VASSELIN');
  const date = A.interpreterParMotsCles('Mets la date butoir du prêt de MARTIN au 15 novembre', { aujourdhui: AUJ });
  assert.equal(date.intention, 'date_fiche');
  assert.equal(date.parametres.champ, 'pret');
  assert.equal(date.parametres.date, '2026-11-15');
  assert.equal(A.interpreterParMotsCles('blabla', { aujourdhui: AUJ }).intention, 'inconnu');
  assert.equal(A.interpreterParMotsCles('blabla', { aujourdhui: AUJ }).surete, 'aucune');
});

test('texteRappelDepuisPhrase : la phrase sans « rappelle-moi » ni la date, majuscule en tête', () => {
  assert.equal(A.texteRappelDepuisPhrase("Rappelle-moi vendredi d'appeler le syndic pour DUPONT"), 'Appeler le syndic pour DUPONT');
  assert.equal(A.texteRappelDepuisPhrase('Rappel : relancer la banque le 12/11'), 'Relancer la banque');
  assert.equal(A.texteRappelDepuisPhrase("N'oublie pas de prévenir le confrère demain"), 'Prévenir le confrère');
});

test('validerReponseAssistant : intention hors liste refusée, paramètres non objet refusés', () => {
  assert.equal(A.validerReponseAssistant({ intention: 'email', parametres: {} }), null);
  assert.equal(A.validerReponseAssistant({ intention: 'email' }), null);
  assert.ok(A.validerReponseAssistant({ intention: 'envoyer_email' }));
  assert.ok(A.validerReponseAssistant({ intention: 'email', parametres: [] }));
  assert.ok(A.validerReponseAssistant(null));
});

test('page : suggestions avec les noms des dossiers du poste, titre d’un rendez-vous, liste envoyée au serveur', () => {
  const app = chargerApplication();
  const s = app.suggestionsAssistant([{ nom: 'DURAND / PETIT' }, { nom: 'MOREAU', archive: true }, { nom: 'LAMBERT' }]);
  assert.ok(s[0].indexOf('DURAND') !== -1, s[0]);
  assert.ok(s.join(' ').indexOf('MOREAU') === -1, 'un archivé ne sert pas d’exemple');
  assert.ok(s.join(' ').indexOf('MARTIN') === -1);
  assert.equal(app.titreRendezVousDepuisPhrase('Rendez-vous avec le syndic jeudi à 14 h'), 'Rendez-vous avec le syndic');
  assert.equal(app.titreRendezVousDepuisPhrase("Ajoute un rdv lecture d'acte demain à 9h30 dans l'agenda"), "Rendez-vous lecture d'acte");
  const liste = app.dossiersPourAssistant([{ id: 'a', nom: 'X / Y', parties: [{ nom: 'X', prenom: 'P', telephones: ['06'] }], emailAcquereur: 'secret@x.fr' }]);
  assert.equal(JSON.stringify(liste), '[{"id":"a","nom":"X / Y","archive":false,"parties":[{"nom":"X","civilite":""}]}]');
});

test('proximité avec la base d\'exemples : des variantes sans le mot-clé exact sont comprises, les phrases hors base restent inconnues', () => {
  const lire = (t) => A.interpreterParMotsCles(t, { aujourdhui: AUJ });
  assert.equal(lire('Dis-moi ce qu\'il manque comme pièces pour Bernard').intention, 'pieces_manquantes');
  assert.equal(lire('Je veux savoir où on en est avec Garnier').intention, 'etat_dossier');
  assert.equal(lire('Peux-tu me trouver une date de signature pour Bernard').intention, 'creneaux_signature');
  assert.equal(lire('Quel temps fait-il à Blois ?').intention, 'inconnu');
  assert.equal(A.intentionParExemples('Quel temps fait-il à Blois ?'), '');
  const proches = A.exemplesProches('Où en sommes-nous avec Garnier ?', 3);
  assert.equal(proches[0].cle, 'etat_dossier');
  assert.ok(proches.every((x, i) => i === 0 || proches[i - 1].score >= x.score), 'du plus proche au moins proche');
});

test('civilité dans la phrase : « Monsieur MARTIN » / « Madame MARTIN » départagent deux dossiers du même nom', () => {
  const D = [{ id: 'a', nom: 'MARTIN / DUPONT', parties: [{ nom: 'MARTIN', civilite: 'M' }, { nom: 'DUPONT', civilite: 'Mme' }] },
    { id: 'b', nom: 'MARTIN / ROUX', parties: [{ nom: 'MARTIN', civilite: 'Mme' }, { nom: 'ROUX' }] }];
  assert.equal(A.reconnaitreDossier('Où en est Monsieur MARTIN ?', D).dossier, 'a');
  assert.equal(A.reconnaitreDossier('Relance M. Martin pour son prêt', D).dossier, 'a');
  assert.equal(A.reconnaitreDossier('Où en est Madame MARTIN ?', D).dossier, 'b');
  assert.equal(A.reconnaitreDossier('Où en est Mme Martin', D).dossier, 'b');
  assert.equal(A.reconnaitreDossier('Où en est MARTIN ?', D).candidats.length, 2, 'sans civilité : toujours « Lequel ? »');
  assert.equal(A.civilitesDansPhrase('Monsieur MARTIN et Mme Dupont').map(c => c.civilite + ':' + c.mot).join(), 'M:martin,Mme:dupont');
});

test('« Appel de fonds envoyé pour MARTIN », « Note dans l\'agenda l\'appel de fonds envoyé » : cocher l\'envoi (mention dans le lieu Outlook)', () => {
  const lire = (t) => A.interpreterParMotsCles(t, { aujourdhui: AUJ });
  for (const t of ['Appel de fonds envoyé pour MARTIN', 'Note dans l\'agenda l\'appel de fonds envoyé pour MARTIN', 'Mets dans l\'agenda appel de fonds envoyé MARTIN']) {
    const r = lire(t);
    assert.equal(r.intention, 'echeance_cocher', t);
    assert.equal(r.parametres.echeance, 'appelFonds', t);
  }
  assert.equal(lire('Fais l\'appel de fonds de MARTIN').intention, 'appel_fonds');
  assert.equal(lire('Prépare l\'appel de fonds pour DUPONT').intention, 'appel_fonds');
});
