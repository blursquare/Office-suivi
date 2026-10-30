// Demandes d'acte d'état civil par papier (commun/courriers-etat-civil.js, étude 29/10) : textes des modèles Word de l'étude, mot pour mot. Noms inventés.
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../commun/courriers-etat-civil');

test('naissance : texte du modèle de l’étude, mairie de naissance, date et nom', () => {
  const d = C.documentCourrierEtatCivil('naissance', { nom: 'Alice DURAND', feminin: true, naissanceDate: '1974-09-19', mairie: { codePostal: '94140', commune: 'Alfortville (94)' }, dateIso: '2026-10-29' });
  assert.deepEqual(d.adresse, ['HÔTEL DE VILLE', 'Madame ou Monsieur le Secrétaire de Mairie', '94140 ALFORTVILLE']);
  assert.equal(d.date, 'Blois, le 29 octobre 2026');
  const t = d.lignes.join('\n');
  assert.match(t, /^Madame ou Monsieur le Secrétaire de Mairie,$/m);
  assert.match(t, /agissant en qualité de mandataire de la personne ci-dessous désignée, au sens de l'article 197-5 de l'instruction générale relative à l'état civil du 11 mai 1999, et dans l'impossibilité de connaître la filiation/);
  assert.match(t, /\*\*UN EXTRAIT D'ACTE DE NAISSANCE\*\*/);
  assert.match(t, /Au nom de : Alice DURAND/);
  assert.match(t, /Née le : 19 septembre 1974/);
  assert.match(t, /Je vous prie d'agréer, Madame ou Monsieur le Secrétaire de Mairie, mes salutations distinguées\./);
  assert.equal(d.signature, 'Me  Sophie GOSSART');
  assert.equal(d.postScriptum, '(P.S. ci-joint une enveloppe timbrée pour la réponse)');
});

test('mariage : texte du modèle, date du mariage et conjoint', () => {
  const d = C.documentCourrierEtatCivil('mariage', { nom: 'Alice DURAND', mariageDate: '27/09/2008', conjoint: 'Paul MARTIN', dateIso: '2026-10-01' });
  const t = d.lignes.join('\n');
  assert.match(t, /Décret n° 2017-890 du 6 mai 2017 relatif à l'état civil, je vous serais très obligé/);
  assert.match(t, /\*\*UN EXTRAIT D'ACTE DE MARIAGE\*\*/);
  assert.match(t, /Marié\(e\) le : 27 septembre 2008/);
  assert.match(t, /^A : Paul MARTIN$/m);
  assert.equal(d.date, 'Blois, le 1er octobre 2026');
  assert.doesNotMatch(t, /mandataire/, 'le modèle du mariage n’a pas la phrase de filiation');
});

test('une donnée absente est « À compléter », jamais devinée ; masculin « Né le »', () => {
  const d = C.documentCourrierEtatCivil('naissance', { feminin: false });
  assert.equal(d.adresse[2], 'À compléter');
  assert.match(d.lignes.join('\n'), /Au nom de : À compléter/);
  assert.match(d.lignes.join('\n'), /Né le : À compléter/);
  assert.match(C.documentCourrierEtatCivil('naissance', {}).lignes.join('\n'), /Né\(e\) le : À compléter/, 'genre inconnu : jamais deviné');
  assert.equal(C.documentCourrierEtatCivil('autre', {}), null);
});

test('noms de fichiers et dates', () => {
  assert.equal(C.nomFichierCourrierEtatCivil('naissance', 'Alice DURAND'), 'Demande acte de naissance - Alice DURAND');
  assert.equal(C.nomFichierCourrierEtatCivil('mariage', 'A/B'), "Demande d'acte de mariage - A B");
  assert.equal(C.dateEtatCivil('31/02/x'), '');
  assert.equal(C.communeDuLieu('Alfortville 94140'), 'ALFORTVILLE');
});

test('lignes « APR » d’Authentic = demandes papier (jamais les Comedec)', () => {
  const { chargerApplication } = require('./helpers/load-app.js');
  const app = chargerApplication();
  const r = app.suiviEtatsCivilsPapierAuthentic([
    { titre: 'APR - Acte de naissance Alice DURAND', etat: 'Envoyé', date: '12/10/2026' },
    { titre: 'APR Acte de mariage Alice DURAND', etat: '', date: '' },
    { titre: 'ECV Acte de naissance Paul MARTIN', etat: 'Positif', date: '12/10/2026' },
    { titre: 'APR - Courrier au syndic', etat: '', date: '' }
  ]);
  const l = Object.values(r);
  assert.equal(l.length, 2);
  assert.deepEqual(l.map(x => x.type).sort(), ['mariage', 'naissance']);
  assert.match(l.find(x => x.type === 'naissance').label, /^Acte de naissance Alice DURAND$|^- ?Acte|Acte de naissance Alice DURAND/);
});

test('personnes et demandes papier d’un dossier (vente : parties que l’étude représente ; mariage pour un seul époux)', () => {
  const { chargerApplication } = require('./helpers/load-app.js');
  const app = chargerApplication();
  const d = { id: 'v1', nom: 'DURAND / MARTIN', typeAffaire: 'vente', situationAcquereur: 'marie',
    parties: [{ role: 'VENDEUR', nom: 'LEROY', prenom: 'Anne' }, { role: 'ACQUEREUR', nom: 'DURAND', prenom: 'Paul' }, { role: 'ACQUEREUR', nom: 'MARTIN', prenom: 'Léa' }],
    authentic: { fichesClients: { 'paul durand': { nom: 'Paul DURAND', prenom: 'Paul', nomFamille: 'DURAND', civilite: 'M.', dateNaissance: '1980-02-01', lieuNaissance: 'Alfortville (94)', situationMatrimoniale: { situation: 'Marié(e)', dateMariage: '2008-09-27', conjoint: 'Léa MARTIN' } } },
      etatsCivilsPapier: { a: { label: 'Acte de naissance Paul DURAND', type: 'naissance' }, b: { label: 'Acte de mariage Inconnu X', type: 'mariage' } } } };
  const p = app.personnesEtatCivilDossier(d);
  assert.equal(p.length, 3);
  assert.equal(p.filter(x => x.mariage).length, 1, 'un seul mariage pour le couple');
  const papier = app.demandesPapierDossier(d);
  assert.equal(papier.length, 2);
  assert.equal(papier.find(x => x.type === 'naissance').personne.nom, 'DURAND');
  assert.equal(papier.find(x => x.type === 'mariage').personne, null, 'une ligne qui ne désigne personne n’est pas rattachée');
  const doc = app.documentEtatCivilPersonne(d, { nom: 'DURAND', prenom: 'Paul' }, 'naissance', '2026-10-29');
  assert.match(doc.lignes.join('\n'), /Au nom de : Paul DURAND/);
  assert.match(doc.lignes.join('\n'), /Né le : 1er février 1980/);
  assert.match(doc.adresse[2], /ALFORTVILLE/);
});

test('le courrier papier se compose en Word avec son P.S., et l’étape de la Constitution montre chaque personne', () => {
  const { chargerApplication } = require('./helpers/load-app.js');
  const app = chargerApplication();
  const doc = app.documentCourrierEtatCivil('naissance', { nom: 'Alice DURAND', naissanceDate: '1974-09-19', mairie: { codePostal: '94140', commune: 'Alfortville' }, dateIso: '2026-10-29' });
  const xml = app.xmlCorpsCourrierFidele(doc, '');
  assert.match(xml, /UN EXTRAIT D/);
  assert.match(xml, /P\.S\. ci-joint une enveloppe timbrée/);
  assert.ok(xml.indexOf('Sophie GOSSART') < xml.indexOf('P.S.'), 'le P.S. suit la signature');
  const d = { id: 'v1', nom: 'DURAND', typeAffaire: 'vente', parties: [{ role: 'ACQUEREUR', nom: 'DURAND', prenom: 'Paul' }], authentic: {} };
  const html = app.renderEtatCivilConstitution(d);
  assert.match(html, /Paul DURAND/);
  assert.match(html, /telechargerCourrierEtatCivil\('v1'/);
  assert.match(app.renderEtatCivilFiche(d), /Lire l’EHF/);
  // Vente (étude 30/10) : Comedec d'abord ; le courrier papier proposé seulement pour une ligne « APR », le reste replié.
  assert.ok(html.indexOf('Demander par Comedec') < html.indexOf('Aucune demande papier'), 'Comedec en premier');
  assert.match(html, /<details class="ec-papier-tous">[\s\S]*Paul DURAND/);
  const apr = app.renderEtatCivilConstitution(Object.assign({}, d, { authentic: { etatsCivilsPapier: { a: { label: 'Acte de naissance Paul DURAND', type: 'naissance' } } } }));
  assert.match(apr, /Demandes papier à faire[\s\S]*Paul DURAND[\s\S]*APR[\s\S]*<details/);
});

test('succession : une ligne APR ne va au défunt que par son prénom ET son nom', () => {
  const { chargerApplication } = require('./helpers/load-app.js');
  const app = chargerApplication();
  const d = { id: 's1', nom: 'SUCC DUPONT Jean', typeAffaire: 'succession', defunt: { nom: 'DUPONT', prenoms: 'Jean Paul', civilite: 'Monsieur', naissanceDate: '1940-05-02', naissanceLieu: 'Blois (41)', conjointNom: 'Marie DUPONT' },
    authentic: { etatsCivilsPapier: { a: { label: 'Acte de naissance Marie DUPONT', type: 'naissance' }, b: { label: 'Acte de naissance Jean DUPONT', type: 'naissance' } } } };
  const papier = app.demandesPapierDossier(d);
  assert.equal(papier.find(x => /Marie/.test(x.libelle)).personne, null, 'le conjoint n’est pas le défunt');
  assert.equal(papier.find(x => /Jean/.test(x.libelle)).personne.role, 'DEFUNT');
});
