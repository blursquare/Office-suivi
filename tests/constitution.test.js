'use strict';

// Constitution de dossier (étude 15/10) : circuits des courriers d'une vente selon la commune, textes des trois modèles de l'étude,
// contenances, défunt et conjoint d'après Authentic. Données inventées.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const K = require('../commun/constitution');

test('circuits : Blois = pas de péril (site des notaires), numérotage par courriel, assainissement à Agglopolys', () => {
  const blois = { insee: '41018', epci: '200030385' };
  assert.deepEqual([K.circuitCourrierVente('peril', blois).mode, K.circuitCourrierVente('peril', blois).destinataire], ['en-ligne', 'blois-en-ligne']);
  const a = K.circuitCourrierVente('alignement', blois);
  assert.deepEqual([a.mode, a.destinataire, a.courriel], ['courriel', 'blois-geometre', 'geometre@blois.fr']);
  assert.equal(K.circuitCourrierVente('assainissement', blois).destinataire, 'agglopolys');
});

test('circuits : autre commune d’Agglopolys = papier à la mairie sauf l’assainissement ; Grand Chambord = communauté de communes', () => {
  const sulpice = { insee: '41230', epci: '200030385' };
  assert.equal(K.circuitCourrierVente('alignement', sulpice).destinataire, 'mairie');
  assert.equal(K.circuitCourrierVente('peril', sulpice).mode, 'papier');
  assert.equal(K.circuitCourrierVente('assainissement', sulpice).destinataire, 'agglopolys');
  const bracieux = { insee: '41025', epci: '244100798' };
  assert.equal(K.circuitCourrierVente('assainissement', bracieux).destinataire, 'grand-chambord');
  assert.equal(K.circuitCourrierVente('peril', bracieux).destinataire, 'mairie');
  const ailleurs = { insee: '41094', epci: '200000800' };
  ['alignement', 'peril', 'assainissement'].forEach((c) => assert.deepEqual([K.circuitCourrierVente(c, ailleurs).mode, K.circuitCourrierVente(c, ailleurs).destinataire], ['papier', 'mairie']));
});

test('Chailles : un guichet unique à part, dit ; les autres communes n’ont pas de note', () => {
  assert.match(K.noteGuichetCommune('41032'), /Chailles/);
  assert.equal(K.noteGuichetCommune('41018'), '');
  assert.match(K.URL_GNAU_CHAILLES, /sirap\.com\/041032/);
});

test('contenances : lues, additionnées, écrites ; une contenance illisible interdit le total', () => {
  assert.equal(K.centiaresDepuisContenance('18 a 22 ca'), 1822);
  assert.equal(K.centiaresDepuisContenance('1 ha 05 a 10 ca'), 10510);
  assert.equal(K.centiaresDepuisContenance('n’importe quoi'), null);
  assert.equal(K.contenanceTotale([{ surface: '18 a 22 ca' }, { surface: '7 a 03 ca' }]), '25 a 25 ca');
  assert.equal(K.contenanceTotale([{ surface: '18 a 22 ca' }, { surface: '' }]), '');
  assert.equal(K.contenanceDepuisCentiares(10510), '1 ha 05 a 10 ca');
});

const parcelles = [{ section: 'AE', numero: '77', lieuDit: '9 RUE DU HAUT BOURG', surface: '18 a 22 ca' }, { prefixe: '000', section: 'AB', numero: '12', surface: '2 a 00 ca' }];
const proprietaires = [{ civilite: 'Madame', nom: 'Monique DUPONT', domicile: 'VILLEFRANC (41000), 25 rue de la Gare' }, { civilite: 'Monsieur', nom: 'Michel DUPONT' }];

test('alignement et numérotage : texte de l’étude, TOUTES les parcelles et TOUS les propriétaires', () => {
  const c = K.contenuCourrierVente('alignement', { destinataire: ['MAIRIE', 'SERVICE URBANISME', '41000 SAINT SULPICE'], adresseImmeuble: 'SAINT SULPICE (41000), 9 rue du Haut Bourg', parcelles, proprietaires, dateLettre: '12 octobre 2026' });
  assert.match(c, /^MAIRIE\nSERVICE URBANISME\n41000 SAINT SULPICE\n\nBlois, le 12 octobre 2026\n\nMadame, Monsieur,\n\n/);
  assert.match(c, /Je vous serais très obligé de bien vouloir me faire parvenir dans les meilleurs délais possibles, concernant un immeuble situé à SAINT SULPICE \(41000\), 9 rue du Haut Bourg :/);
  assert.match(c, /- Un certificat de numérotage,\n- Un certificat d'alignement\./);
  assert.match(c, /\| AE \| 77 \|/);
  assert.match(c, /\| 000 \| AB \| 12 \|/);
  assert.match(c, /Contenance totale \| 20 a 22 ca \|/);
  assert.match(c, /Ledit immeuble appartenant à :\nMadame Monique DUPONT demeurant à VILLEFRANC \(41000\), 25 rue de la Gare\.\nMonsieur Michel DUPONT demeurant à \[adresse à compléter\]\./);
  assert.match(c, /Dans l'attente de vous lire, et avec mes remerciements anticipés,\n\nJe vous prie d'agréer, Madame, Monsieur, mes salutations distinguées\.\n\nMe Sophie GOSSART$/);
});

test('péril : les trois arrêtés de l’étude', () => {
  const c = K.contenuCourrierVente('peril', { destinataire: ['MAIRIE', 'SERVICE URBANISME'], adresseImmeuble: 'X (41000), 1 rue Y', parcelles, proprietaires, dateLettre: '12 octobre 2026' });
  assert.match(c, /me préciser dans les meilleurs délais possibles, concernant un immeuble situé à X \(41000\), 1 rue Y, si :/);
  assert.match(c, /- L'immeuble est frappé d'un arrêté de péril,\n- L'immeuble est frappé d'un arrêté de mise en sécurité,\n- L'immeuble est frappé d'un arrêté d'insalubrité\./);
});

test('assainissement : objet, texte de l’étude et page du questionnaire à retourner (saut de page, références du dossier)', () => {
  const c = K.contenuCourrierVente('assainissement', { destinataire: ['AGGLOPOLYS', 'Service de l’Assainissement', '1 rue Honoré de Balzac', '41000 BLOIS'], adresseImmeuble: 'X (41000), 1 rue Y', parcelles, proprietaires, dateLettre: '12 octobre 2026', reference: 'A 2026 00299', nomDossier: 'VTE - DUPONT' });
  assert.match(c, /Objet : Contrôle et conformité assainissement\n\nMadame, Monsieur,\n\nJe vous remercie de me préciser la situation au regard de l'assainissement de l'immeuble situé à X \(41000\), 1 rue Y, et cadastré :/);
  assert.match(c, /Vous en remerciant par avance,\n\nJe vous prie d'agréer, Madame, Monsieur, mes salutations distinguées\.\n\nMe Sophie GOSSART\n\n<<saut de page>>/);
  assert.match(c, /\*\*Références dossier :\*\* A 2026 00299 - VTE - DUPONT\n\*\*Adresse de l'immeuble :\*\* X \(41000\), 1 rue Y/);
  assert.match(c, /loi n° 92-3 du 3 janvier 1992/);
  assert.match(c, /Le délai de 2 ans de l'article L\.1331-1 Code de la santé publique est-il expiré \?/);
  assert.match(c, /\(signature et cachet de la Mairie\)$/);
  assert.equal(K.contenuCourrierVente('inconnu', {}), '');
});

test('défunt : la fiche qui porte une date de décès, jamais une autre ; conjoint selon la situation lue', () => {
  const d = { authentic: { fichesClients: {
    'alice fra': { nom: 'Alice FRA', deces: { date: '2026-09-14', lieu: 'BRACIEUX (41250)' }, situationMatrimoniale: { situation: 'Veuf(ve)', conjoint: 'Monsieur Maurice FISCHER' } },
    'paul fra': { nom: 'Paul FRA', deces: null }
  } } };
  const r = K.defuntDepuisFiches(d);
  assert.equal(r.fiche.nom, 'Alice FRA');
  assert.equal(r.autres.length, 0);
  assert.equal(K.defuntDepuisFiches({}).fiche, null);
  assert.deepEqual(K.conjointDefunt({ situation: 'Veuf(ve)', conjoint: 'Monsieur Maurice FISCHER' }, 'Madame'), { lien: 'Veuve de', nom: 'Monsieur Maurice FISCHER' });
  assert.deepEqual(K.conjointDefunt({ situation: 'Marié(e)', conjoint: 'Madame Léa X' }, 'Monsieur'), { lien: 'Époux de', nom: 'Madame Léa X' });
  assert.deepEqual(K.conjointDefunt(null, 'Madame'), { lien: '', nom: '' });
});

test('nom de fichier sûr', () => {
  assert.equal(K.nomFichierCourrierVente('assainissement', 'SAINT SULPICE', 'VTE - X/Y'), 'Assainissement - SAINT SULPICE - VTE - X Y');
});
