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
  assert.deepEqual([a.mode, a.destinataire, a.courriel], ['courriel', 'blois-geometre', 'geometres.notaires@blois.fr']);
  assert.equal(K.circuitCourrierVente('assainissement', blois).destinataire, 'agglopolys');
});

test('circuits : Paris (et ses arrondissements) = numérotage par courriel à la Direction de l’Urbanisme, péril en mairie, assainissement en ligne', () => {
  for (const insee of ['75056', '75108', '75120']) {
    assert.equal(K.courriersVenteCommune({ insee }).map((c) => c.cle).join(','), 'numerotage,alignementSeul,peril,assainissement');
    const n = K.circuitCourrierVente('numerotage', { insee, epci: '200054781' });
    assert.deepEqual([n.mode, n.destinataire, n.courriel], ['courriel', 'paris-numerotage', 'du-dtdf-numerotage@paris.fr']);
    const a = K.circuitCourrierVente('alignementSeul', { insee });
    assert.deepEqual([a.mode, a.destinataire], ['en-ligne', 'paris-renseignements']);
    assert.equal(K.circuitCourrierVente('peril', { insee }).destinataire, 'mairie');
    assert.match(K.circuitCourrierVente('peril', { insee }).note, /Préfecture de Police/);
    const s = K.circuitCourrierVente('assainissement', { insee });
    assert.deepEqual([s.mode, s.destinataire], ['en-ligne', 'paris-assainissement']);
    assert.match(s.url, /^https:\/\/cdn\.paris\.fr\//);
  }
  assert.equal(K.estParis('75121'), false);
  assert.equal(K.estParis('77056'), false);
  assert.deepEqual(['75001', '75016', '75116', '75020', '75021', '41000'].map(K.inseeArrondissementParis).join(','), '75101,75116,75116,75120,,');
  assert.equal(K.DESTINATAIRES_CONNUS['paris-numerotage'].lignes.at(-1), '75013 PARIS');
});

test('services séparés : numérotage et alignement en deux courriers du même modèle, chacun avec sa seule demande ; au choix ailleurs', () => {
  const sulpice = { insee: '41230', epci: '200030385' };
  assert.equal(K.courriersVenteCommune(sulpice).map((c) => c.cle).join(','), 'alignement,peril,assainissement');
  assert.equal(K.courriersVenteCommune(sulpice, true).map((c) => c.cle).join(','), 'numerotage,alignementSeul,peril,assainissement');
  assert.equal(K.circuitCourrierVente('numerotage', sulpice).destinataire, 'mairie');
  assert.equal(K.circuitCourrierVente('alignementSeul', { insee: '41018' }).courriel, 'geometres.notaires@blois.fr');
  const o = { destinataire: ['MAIRIE'], adresseImmeuble: 'BLOIS (41000), 1 rue Exemple', parcelles: [{ section: 'AB', numero: '1', surface: '100' }], proprietaires: [{ civilite: 'Madame', nom: 'Léa EXEMPLE', domicile: 'BLOIS (41000)' }] };
  const texte = (cle) => K.texteCorpsDocument(K.documentCourrierVente(cle, o));
  assert.match(texte('alignement'), /certificat de numérotage,[\s\S]*certificat d'alignement\./);
  assert.match(texte('numerotage'), /Un certificat de numérotage\./);
  assert.doesNotMatch(texte('numerotage'), /alignement/);
  assert.match(texte('alignementSeul'), /Un certificat d'alignement\./);
  assert.doesNotMatch(texte('alignementSeul'), /numérotage/);
  assert.equal(K.nomFichierCourrierVente('numerotage', 'PARIS', 'VTE - X'), 'Numérotage - PARIS - VTE - X');
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

const texte = (doc) => doc.lignes.map(l => typeof l === 'string' ? l : '[tableau]').join('\n');

test('alignement et numérotage : ligne à ligne comme le modèle, TOUTES les parcelles et TOUS les propriétaires', () => {
  const d = K.documentCourrierVente('alignement', { destinataire: ['MAIRIE', 'SERVICE URBANISME', '41000 SAINT SULPICE'], adresseImmeuble: 'SAINT SULPICE (41000), 9 rue du Haut Bourg', parcelles, proprietaires, dateLettre: '12 octobre 2026' });
  assert.equal(d.adresse.join('|'), 'MAIRIE|SERVICE URBANISME|41000 SAINT SULPICE');
  assert.equal(d.adresseDebut, 1);
  assert.equal(d.date, 'Blois, le 12 octobre 2026');
  assert.equal(texte(d), [
    '', '', '', 'Madame, Monsieur,', '',
    'Je vous serais très obligé de bien vouloir me faire parvenir dans les meilleurs délais possibles, concernant un immeuble situé à SAINT SULPICE (41000), 9 rue du Haut Bourg :', '',
    '- **Un certificat de numérotage,**', '**- Un certificat d\'alignement.**', '',
    'A toutes fins utiles, voici les références cadastrales de cet immeuble :', '[tableau]', 'Ledit immeuble appartenant à :',
    'Madame Monique DUPONT demeurant à VILLEFRANC (41000), 25 rue de la Gare.', 'Monsieur Michel DUPONT demeurant à [adresse à compléter].',
    'Dans l\'attente de vous lire, et avec mes remerciements anticipés,', '', 'Je vous prie d\'agréer, Madame, Monsieur, mes salutations distinguées.'].join('\n'));
  assert.equal(d.signature, 'Me  Sophie GOSSART');
  assert.equal(d.questionnaire, undefined);
});

test('péril : les trois arrêtés de l’étude, en gras comme l’original', () => {
  const t = texte(K.documentCourrierVente('peril', { destinataire: ['MAIRIE'], adresseImmeuble: 'X (41000), 1 rue Y', parcelles, proprietaires, dateLettre: '12 octobre 2026' }));
  assert.match(t, /me préciser dans les meilleurs délais possibles, concernant un immeuble situé à X \(41000\), 1 rue Y, si :/);
  assert.match(t, /- L'immeuble est frappé d'un \*\*arrêté de péril,\*\*\n- L'immeuble est frappé d'un \*\*arrêté de mise en sécurité,\*\*\n- L'immeuble est frappé d'un \*\*arrêté d'insalubrité\.\*\*/);
});

test('assainissement : objet en gras, texte de l’étude, questionnaire avec les références du dossier', () => {
  const d = K.documentCourrierVente('assainissement', { destinataire: ['AGGLOPOLYS'], adresseImmeuble: 'X (41000), 1 rue Y', parcelles, proprietaires, dateLettre: '12 octobre 2026', reference: 'A 2026 00299', nomDossier: 'VTE - DUPONT' });
  assert.match(texte(d), /^\n\n\n\*\*Objet : Contrôle et conformité assainissement\*\*\n\nMadame, Monsieur,\n\nJe vous remercie de me préciser la situation au regard de l’assainissement de l’immeuble situé à X \(41000\), 1 rue Y, et cadastré :\n\[tableau\]\nLedit immeuble/);
  assert.match(texte(d), /Vous en remerciant par avance,\n\nJe vous prie d'agréer, Madame, Monsieur, mes salutations distinguées\.$/);
  assert.deepEqual(d.questionnaire, { references: 'A 2026 00299 - VTE - DUPONT', adresseImmeuble: 'X (41000), 1 rue Y' });
  assert.equal(K.documentCourrierVente('inconnu', {}), null);
});

test('courrier vierge d’une vente : le texte saisi, puis les références cadastrales et les propriétaires', () => {
  const t = texte(K.documentCourrierVente('autre', { destinataire: ['SYNDICAT X'], adresseImmeuble: 'X (41000), 1 rue Y', parcelles, proprietaires, dateLettre: '12 octobre 2026', texteLibre: 'Ma demande.' }));
  assert.match(t, /Madame, Monsieur,\n\nMa demande\.\n\nA toutes fins utiles, voici les références cadastrales de cet immeuble :\n\[tableau\]/);
  assert.equal(K.documentCourrierVente('autre', { destinataire: [], parcelles: [], proprietaires: [] }).adresse.join(), 'À compléter');
});

test('tableau des parcelles : grille du modèle, en-tête grisé, contenance d’Authentic (m²) écrite et totalisée à droite', () => {
  const t = K.tableauParcellesCourrier([{ section: 'AB', numero: '123', surface: '512' }, { section: 'AB', numero: '124', surface: '80' }]);
  assert.equal(t.grille.join(','), '862,924,909,3808,1769');
  assert.equal(t.lignes[0].cellules.map(c => c.texte + ':' + (c.fond || '') + ':' + (c.jc || '')).join('|'), 'Préfixe:E6E6E6:|Section:E6E6E6:|N°:E6E6E6:|Adresse ou lieudit:E6E6E6:|Contenance:E6E6E6:center');
  assert.equal(t.lignes[1].cellules[4].texte, '5 a 12 ca');
  assert.equal(t.lignes[2].cellules[4].texte, '80 ca');
  assert.equal(t.lignes[3].cellules.map(c => `${c.texte}:${c.span || 1}:${c.jc}`).join('|'), 'Contenance totale:4:right|5 a 92 ca:1:right');
});

test('texteCorpsDocument : le texte sans marques, le tableau en lignes, sans la ligne d’en-tête', () => {
  const d = K.documentCourrierVente('alignement', { destinataire: ['MAIRIE'], adresseImmeuble: 'X', parcelles: [{ section: 'AB', numero: '12', surface: '2 a 00 ca' }], proprietaires: [], dateLettre: '1 octobre 2026' });
  const t = K.texteCorpsDocument(d);
  assert.match(t, /^Madame, Monsieur,\n\nJe vous serais/);
  assert.match(t, /- Un certificat de numérotage,\n- Un certificat d'alignement\./);
  assert.match(t, /cet immeuble :\nAB — 12 — 2 a 00 ca\nContenance totale — 2 a 00 ca\nLedit/);
  assert.doesNotMatch(t, /Préfixe|\*\*|MAIRIE|Blois, le|Me Sophie/);
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
