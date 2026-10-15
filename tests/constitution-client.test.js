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

test('blocsPdfDepuisContenu : un « Me … » en fin de courrier porte le tampon, un saut de page est gardé', () => {
  const blocs = app.blocsPdfDepuisContenu('Objet : test\n\nMe Sophie GOSSART\n\n<<saut de page>>\n\nSuite');
  const types = Array.from(blocs, b => b.type).join(',');
  assert.ok(types.includes('tampon'));
  assert.ok(types.includes('saut'));
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

test('apercuHtmlConstitution : destinataire en tête, tableau, tampon après « Me … », texte échappé', () => {
  const html = app.apercuHtmlConstitution('MAIRIE\n41000 <BLOIS>\n\nBlois, le 15 octobre 2026\n\n| Section | N° |\n| AB | 12 |\n\nMe Sophie GOSSART', 'REF', { tampon: 'data:image/png;base64,AA' });
  assert.match(html, /cst-apercu-dest">MAIRIE<br>41000 &lt;BLOIS&gt;/);
  assert.match(html, /<th>Section<\/th>/);
  assert.match(html, /af-tampon-signature"><img class="af-tampon"/);
  assert.ok(!/<BLOIS>/.test(html));
});

test('resumeDonneesConstitution et resumeDestinataireConstitution', () => {
  const e = { type: 'vente', proprietaires: [{}, {}], groupes: [{ parcelles: [{ actif: true }, { actif: false }] }] };
  assert.equal(app.resumeDonneesConstitution(e), '2 vendeurs · 1 parcelle · 1 commune');
  assert.equal(app.resumeDestinataireConstitution({ lignes: ['CPAM', 'Assurance maladie', '41000 BLOIS'] }), 'CPAM, Assurance maladie');
  assert.equal(app.resumeDestinataireConstitution({ lignes: [] }), '');
});
