'use strict';
// Constitution de dossier (étude 15/10) : la fiche client d'Authentic est la base — parcelles, vendeurs, défunt (décès, régime).
// Noms, adresses et dates inventés, structure des pages reprise de tests/authentic-pages.test.js.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');
const app = chargerApplication();

const ID = 'ui-ficho-tabs:mainTabPanel:tabForm2:tabContent:';
const ficheDefunt = {
  titre: 'Authentic',
  champs: [
    { groupe: '', libelle: ID + 'tabView:ficheClientPhysiqueIdentite:civilite:selectOneRadio', valeur: 'Madame' },
    { groupe: '', libelle: 'Nom de famille*', valeur: 'Fischer' },
    { groupe: '', libelle: 'Prénom*', valeur: 'Alice' },
    { groupe: '', libelle: ID + 'tabView:ficheClientPhysiqueIdentite:naissanceDate:naissanceDate', valeur: '03/05/1938' },
    { groupe: '', libelle: 'CP, Ville (naissance)', valeur: '67000 STRASBOURG' },
    { groupe: '', libelle: 'Pays (naissance)', valeur: 'France' },
    { groupe: '', libelle: ID + 'tabView:ficheClientPhysiqueIdentite:dateDeces:dateDeces', valeur: '12/08/2026' },
    { groupe: '', libelle: 'CP, Ville (décès)', valeur: '41250 BRACIEUX' },
    { groupe: '', libelle: 'N° de voie', valeur: '31' },
    { groupe: '', libelle: 'Type de voie', valeur: 'rue' },
    { groupe: '', libelle: 'Nom de la voie', valeur: 'des Écoles' },
    { groupe: '', libelle: 'CP - Ville', valeur: '41250 BRACIEUX' }
  ],
  tableaux: [], texte: ''
};

test('clientDepuisFicheAuthentic : la date et le lieu de décès sont lus, absents sur une personne vivante', () => {
  const c = app.clientDepuisFicheAuthentic(ficheDefunt);
  assert.equal(c.deces.date, '2026-08-12');
  assert.equal(c.deces.lieu, '41250 BRACIEUX');
  assert.equal(c.dateNaissance, '1938-05-03');
  assert.equal(c.paysNaissance, 'France');
  const vivante = { champs: ficheDefunt.champs.filter(x => !/dateDeces|décès/.test(x.libelle)) };
  assert.ok(!app.clientDepuisFicheAuthentic(vivante).deces);
});

test('retenirFicheClientAuthentic : la fiche est gardée entière, une relecture identique ne change rien', () => {
  const d = { id: 's', nom: 'SUCC Alice FISCHER', typeAffaire: 'succession', parties: [] };
  const c = app.clientDepuisFicheAuthentic(ficheDefunt);
  assert.equal(app.retenirFicheClientAuthentic(d, c, '2026-10-15T10:00:00Z'), true);
  const f = Object.values(d.authentic.fichesClients)[0];
  assert.equal(f.deces.date, '2026-08-12');
  assert.equal(f.dateNaissance, '1938-05-03');
  assert.equal(f.civilite, 'Mme');
  assert.equal(app.retenirFicheClientAuthentic(d, c, '2026-10-15T11:00:00Z'), false);
});

test('partieSuccessionDeLaFiche : le défunt se reconnaît à son décès et à son nom ET prénom dans l\'intitulé', () => {
  const c = app.clientDepuisFicheAuthentic(ficheDefunt);
  const d = { nom: 'SUCC Alice FISCHER', typeAffaire: 'succession', parties: [] };
  assert.ok(app.partieSuccessionDeLaFiche(d, c));
  // Un homonyme sans décès, ou un autre prénom : rien.
  assert.equal(app.partieSuccessionDeLaFiche(d, Object.assign({}, c, { deces: null })), null);
  assert.equal(app.partieSuccessionDeLaFiche({ nom: 'SUCC Paul FISCHER', parties: [] }, c), null);
});

test('releve d\'une fiche client sur une succession : le défunt entre comme partie et sa fiche est retenue', () => {
  const d = { id: 's', nom: 'SUCC Alice FISCHER', typeAffaire: 'succession', sansPret: true, parties: [], pieces: {}, historique: [] };
  app.appliquerReleveSurDossier(d, ficheDefunt, '2026-10-15T10:00:00.000Z', []);
  assert.ok(d.parties.some(p => /Alice/.test(p.nom) && p.role === 'PARTIE'));
  const def = app.defuntConstitution(d);
  assert.equal(def.champs.decesDate, '2026-08-12');
  assert.equal(def.champs.nom, 'FISCHER');
  assert.equal(def.champs.domicile.includes('BRACIEUX'), true);
  assert.equal(def.avertissements.length, 0);
});

test('defuntConstitution : ce qui est saisi sur la fiche l\'emporte, sans fiche l\'outil le dit', () => {
  const d = { nom: 'SUCC X', typeAffaire: 'succession', parties: [] };
  const vide = app.defuntConstitution(d);
  assert.ok(vide.avertissements.length >= 1);
  assert.equal(vide.champs.decesDate, '');
  d.defunt = { decesDate: '2026-01-02', nom: 'MARTIN' };
  const saisi = app.defuntConstitution(d);
  assert.equal(saisi.champs.decesDate, '2026-01-02');
  assert.equal(saisi.champs.nom, 'MARTIN');
});

test('manquesConstitution : donnée absente d\'un courrier', () => {
  assert.equal(app.manquesConstitution(null).length, 0);
  const m = app.manquesConstitution({ type: 'succession', defunt: { champs: { nom: 'A', decesDate: '', domicile: '' } } });
  assert.equal(m.join('|').includes('décès'), true);
  assert.equal(m.join('|').includes('Domicile'), true);
  const v = app.manquesConstitution({ type: 'vente', proprietaires: [{ nom: 'DURAND', domicile: '' }], groupes: [{ commune: 'BLOIS', parcelles: [] }] });
  assert.equal(v.length, 2);
});

test('proprietairesConstitution : tous les vendeurs, avec le domicile de leur fiche Authentic', () => {
  const d = {
    parties: [{ nom: 'Jean MARTEL', role: 'VENDEUR', civilite: 'M' }, { nom: 'Claire MARTEL', role: 'VENDEUR', civilite: 'Mme' }, { nom: 'Luc DUPONT', role: 'ACQUEREUR' }],
    authentic: { fichesClients: { 'jean martel': { nom: 'Jean MARTEL', domicile: '8 rue des Lilas 41000 BLOIS', civilite: 'M' } } }
  };
  const p = app.proprietairesConstitution(d);
  assert.equal(p.length, 2);
  assert.equal(p[0].domicile !== '', true);
  assert.equal(p[1].domicile, '');
});

test('groupesParcellesConstitution : toutes les parcelles d\'Authentic par commune, sans doublon', () => {
  const d = {
    adresseBien: 'BLOIS (41000), 3 rue Haute',
    authentic: { immeubles: [
      { adresse: '3 rue Haute', codePostal: '41000', commune: 'BLOIS', parcelles: [{ section: 'AB', numero: '0012' }, { section: 'AB', numero: '13' }] },
      { adresse: 'Les Vignes', codePostal: '41350', commune: 'VINEUIL', parcelles: [{ section: 'ZC', numero: '45', commune: 'VINEUIL' }] }
    ] },
    bien: { cadastre: { parcelles: [{ section: 'AB', numero: '12' }, { section: 'AB', numero: '14' }] } }
  };
  const g = app.groupesParcellesConstitution(d);
  assert.equal(g.length, 2);
  assert.equal(g[0].commune, 'BLOIS');
  assert.equal(g[0].parcelles.map(p => p.section + p.numero).join(','), 'AB12,AB13,AB14');
  assert.equal(g[1].commune, 'VINEUIL');
  assert.equal(g[1].parcelles.length, 1);
});

test('lignesMairieConstitution et lignesDestinataireVente : mairie par défaut, destinataire retenu sinon', () => {
  const l = app.lignesMairieConstitution({ cp: '41250', commune: 'BRACIEUX' }, null);
  assert.equal(l.join('|'), 'MAIRIE|SERVICE URBANISME|41250 BRACIEUX');
  const ag = app.lignesDestinataireVente({ destinataire: 'agglopolys' }, { cp: '', commune: '' }, null, null);
  assert.ok(ag.join(' ').toUpperCase().includes('ASSAINISSEMENT'));
});

test('contactPreferePourDefuntConstitution et etablissementDansDomicileConstitution', () => {
  const contacts = [
    { theme: 'social', organisme: 'CARSAT Centre-Val de Loire', adresse: '45000 ORLEANS' },
    { theme: 'social', organisme: 'CARSAT Bretagne', adresse: '35000 RENNES' }
  ];
  const c = app.contactPreferePourDefuntConstitution('carsat', contacts, { domicile: 'BRACIEUX (41250), 31 rue des Écoles' });
  assert.equal(c, null); // aucun contact du département 41 : jamais deviné
  assert.equal(app.contactPreferePourDefuntConstitution('banque', contacts, { domicile: '41250' }), null);
  const e = app.etablissementDansDomicileConstitution('EHPAD La Bonne Eure, 31 rue de Candy');
  assert.equal(e.nom, 'EHPAD LA BONNE EURE');
  assert.equal(app.etablissementDansDomicileConstitution('8 rue des Lilas 41000 BLOIS'), null);
});

test('retenirImmeublesAuthentic : tous les articles du dossier Authentic gardés', () => {
  const d = {};
  const donnees = { biens: [], immeubles: [
    { id: 'a', adresse: { texte: '3 rue Haute 41000 BLOIS', codePostal: '41000', commune: 'BLOIS' }, parcelles: [{ section: 'ab', numero: '12', commune: 'BLOIS' }] },
    { id: 'b', adresse: { texte: 'Les Vignes 41350 VINEUIL', codePostal: '41350', commune: 'VINEUIL' }, parcelles: [{ section: 'ZC', numero: '45', prefixe: '000' }] }
  ] };
  assert.equal(app.retenirImmeublesAuthentic(d, donnees), true);
  assert.equal(d.authentic.immeubles.length, 2);
  assert.equal(d.authentic.immeubles[0].parcelles[0].section, 'AB');
  assert.equal(app.retenirImmeublesAuthentic({}, { immeubles: [] }), false);
});

test('rechercheRepertoireConstitution : tous les mots, dans le nom, le service ou la ville', () => {
  const contacts = [
    { id: 'a', organisme: 'Crédit Agricole Val de France', service: 'Successions', adresse: '41000 BLOIS' },
    { id: 'b', organisme: 'Harmonie Mutuelle', adresse: '75015 PARIS' },
    { id: 'c', organisme: 'Banque Populaire', adresse: '41000 BLOIS' }
  ];
  assert.equal(Array.from(app.rechercheRepertoireConstitution('credit blois', contacts), c => c.id).join(','), 'a');
  assert.equal(Array.from(app.rechercheRepertoireConstitution('harmonie', contacts), c => c.id).join(','), 'b');
  assert.equal(app.rechercheRepertoireConstitution('', contacts).length, 0);
});

test('resumeDonneesConstitution et resumeDestinataireConstitution', () => {
  const e = { type: 'vente', proprietaires: [{}, {}], groupes: [{ parcelles: [{ actif: true }, { actif: false }] }] };
  assert.equal(app.resumeDonneesConstitution(e), '2 vendeurs · 1 parcelle · 1 commune');
  assert.equal(app.resumeDestinataireConstitution({ lignes: ['CPAM', 'Assurance maladie', '41000 BLOIS'] }), 'CPAM, Assurance maladie');
  assert.equal(app.resumeDestinataireConstitution({ lignes: [] }), '');
});

test('corpsEmailCourrierConstitution : le texte du courrier sans destinataire, date ni signature ; questionnaire signalé', () => {
  const doc = app.documentCourrierVente('assainissement', { destinataire: ['AGGLOPOLYS'], adresseImmeuble: 'X', parcelles: [{ section: 'AB', numero: '12' }], proprietaires: [], dateLettre: '1 octobre 2026' });
  const r = app.corpsEmailCourrierConstitution(doc);
  assert.ok(!/AGGLOPOLYS|Blois, le|Me Sophie|Questionnaire|\*\*|Préfixe/.test(r.texte));
  assert.match(r.texte, /^Objet : Contrôle et conformité assainissement\n\nMadame, Monsieur,/);
  assert.equal(r.suite, true);
  assert.equal(app.corpsEmailCourrierConstitution(app.documentCourrierSuccession('cpam', { dateIso: '2026-10-01', defunt: { civilite: 'Madame', nom: 'X' } })).suite, false);
});

test('rechercheRepertoireConstitution : pour une succession, les services successions d’abord, la banque des prêts en dernier', () => {
  const contacts = [
    { id: 'pret', theme: 'banquesPrets', organisme: 'Crédit Agricole Val de France', service: 'Service prêt de Blois' },
    { id: 'divers', theme: 'divers', organisme: 'Crédit Agricole Assurances' },
    { id: 'succ', theme: 'banquesSuccessions', organisme: 'Crédit Agricole Val de France', service: 'Successions' }
  ];
  assert.equal(Array.from(app.rechercheRepertoireConstitution('credit agricole', contacts, 'succession'), c => c.id).join(','), 'succ,divers,pret');
  assert.equal(Array.from(app.rechercheRepertoireConstitution('credit agricole', contacts, 'vente'), c => c.id).join(','), 'pret,divers,succ');
});

test('runsLigneCourrier et refLignesCourrier : gras et souligné ; colonne « Nos Réf » de l’en-tête', () => {
  assert.equal(Array.from(app.runsLigneCourrier('A **b __c__** d'), r => `${r.t}:${r.b ? 'b' : ''}${r.u ? 'u' : ''}`).join('|'), 'A :|b :b|c:bu| d:');
  assert.equal(app.refLignesCourrier({ nom: 'DUPONT', referenceAuthentic: 'A 2026 00299', responsable: 'Julie VASSELIN' }).join('|'),
    'Nos Réf : VTE DUPONT|A 2026 00299|Dossier suivi par :|Julie VASSELIN|office.gossart@notaires.fr|0254786170');
});

test('xmlCorpsCourrierFidele : une ligne = un paragraphe Times 11 sans espacement, adresse puis date à la 10e ligne, tableau grisé, questionnaire rempli', () => {
  const doc = app.documentCourrierVente('assainissement', { destinataire: ['AGGLOPOLYS', 'Service <assainissement>'], adresseImmeuble: 'X & Y', parcelles: [{ section: 'AB', numero: '12', surface: '512' }],
    proprietaires: [{ civilite: 'Madame', nom: 'Léa DUPONT', domicile: 'BLOIS (41000), 1 rue Z' }], dateLettre: '1 octobre 2026', reference: 'A 2026 00299', nomDossier: 'VTE - DUPONT' });
  const xml = app.xmlCorpsCourrierFidele(doc, '');
  const paras = xml.split('<w:p>');
  assert.match(paras[2], /AGGLOPOLYS/);
  assert.match(paras[10], /Blois, le 1 octobre 2026/);
  assert.match(xml, /Service &lt;assainissement&gt;/);
  assert.ok(!xml.includes('<assainissement>'));
  assert.match(xml, /<w:b\/><w:sz w:val="22"\/><w:szCs w:val="22"\/><\/w:rPr><w:t xml:space="preserve">Objet : Contrôle et conformité assainissement/);
  assert.match(xml, /<w:shd w:val="clear" w:color="auto" w:fill="E6E6E6"\/>/);
  assert.match(xml, /<w:gridCol w:w="862"\/><w:gridCol w:w="924"\/>/);
  assert.match(xml, /5 a 12 ca/);
  assert.match(xml, /<w:pageBreakBefore\/>/);
  assert.match(xml, /A 2026 00299 - VTE - DUPONT/);
  assert.match(xml, /X &amp; Y/);
  assert.ok(!/\{QREF\}|\{QADR\}/.test(xml));
  assert.match(xml, /C00000/);
});

test('htmlCourrierFidele : texte échappé, tampon seulement signé, colonne « Nos Réf »', () => {
  const doc = app.documentCourrierSuccession('cpam', { destinataire: ['CPAM <41>'], dateIso: '2026-10-01', defunt: { civilite: 'Madame', nom: 'X' } });
  const signe = app.htmlCourrierFidele(doc, ['Nos Réf : SUCC X'], { tampon: 'data:image/png;base64,AA' }, true);
  assert.match(signe, /CPAM &lt;41&gt;/);
  assert.match(signe, /af-tampon-signature/);
  assert.match(signe, /Nos Réf : SUCC X/);
  assert.match(signe, /<u>Succession de : Madame X<\/u>/);
  assert.ok(!app.htmlCourrierFidele(doc, [], { tampon: 'data:image/png;base64,AA' }, false).includes('af-tampon-signature'));
});

test('emailsContactConstitution : « Libellé : adresse » et adresses invalides écartées', () => {
  const e = app.emailsContactConstitution({ emails: ['tiers@carsat-centre.fr', 'Première demande : notaires.premieredemande@carsat-centre.fr', 'pas une adresse'] });
  assert.equal(Array.from(e, x => x.libelle + '|' + x.adresse).join(','), '|tiers@carsat-centre.fr,Première demande|notaires.premieredemande@carsat-centre.fr');
});

test('objetEmailConstitution : défunt et référence', () => {
  assert.equal(app.objetEmailConstitution({ genre: 'succession' }, { referenceAuthentic: 'A 2026 00398' }, { civilite: 'Madame', prenoms: 'Alice', nom: 'FISCHER' }),
    'Succession de Madame Alice FISCHER — Réf. A 2026 00398');
});

test('departementDeTexteConstitution : le code postal, jamais le numéro d’une CS ou d’une BP', () => {
  assert.equal(app.departementDeTexteConstitution('19 avenue de Vendôme, CS 72301, 41023 BLOIS CEDEX'), '41');
  assert.equal(app.departementDeTexteConstitution('BRACIEUX (41250), 31 rue des Écoles'), '41');
});
