'use strict';
// Pages d'Authentic lues par CLAIRE (relevé de l'extension Firefox) — structure des pages réelles
// relevées au bureau le 02/10 (gestion du dossier, fiche client, fiche bien), noms inventés.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');
const app = chargerApplication();

const ID = 'ui-ficho-tabs:mainTabPanel:tabForm2:tabContent:';
const gestion = {
  titre: 'Authentic',
  champs: [
    { groupe: '', libelle: 'Rechercher', valeur: '' },
    { groupe: '', libelle: '12 - Vente MARTEL/FOURNIER Importer avec 2e SENSComparants (3) personM. MARTEL Alexandre et Mme MARTEL personMme FOURNIER CamilleAcquéreur Immeubles (1) 41000 BLOIS L', valeur: '' }
  ],
  tableaux: [
    { titre: '', entete: [], lignes: [['Acte de naissance de M. MARTEL Alexandre', '', '03/09/2026', '', 'Reçu']] },
    { titre: '', entete: [], lignes: [['Notification SAFER', '', '10/09/2026', '25/09/2026', 'Non préemption']] },
    { titre: '', entete: [], lignes: [['Demande de certificat d’urbanisme', '', '01/09/2026', '', 'Envoyé'], ['Certificat d’urbanisme', '', '20/09/2026', '', '']] },
    { titre: '', entete: [], lignes: [['Déclaration d’intention d’aliéner', '', '05/09/2026', '', 'En attente']] }
  ],
  texte: '12 - Vente MARTEL/FOURNIER\nComparants'
};

const client = {
  titre: 'Authentic',
  champs: [
    { groupe: '', libelle: ID + 'tabView:ficheClientPhysiqueIdentite:etude_input', valeur: 'oui' },
    { groupe: '', libelle: ID + 'tabView:ficheClientPhysiqueIdentite:civilite:selectOneRadio', valeur: 'Madame' },
    { groupe: '', libelle: 'Nom de famille*', valeur: 'Fournier' },
    { groupe: '', libelle: 'Prénom*', valeur: 'Camille' },
    { groupe: '', libelle: 'Autre(s) Prénom(s)', valeur: 'Louise' },
    { groupe: '', libelle: "Dénomination d'usage", valeur: '' },
    { groupe: '', libelle: ID + 'tabView:ficheClientPhysiqueIdentite:naissanceDate:naissanceDate', valeur: '14/02/1985' },
    { groupe: '', libelle: 'CP, Ville (naissance)', valeur: '37000 TOURS' },
    { groupe: '', libelle: 'Profession', valeur: 'Infirmière' },
    { groupe: '', libelle: 'N° de voie', valeur: '8' },
    { groupe: '', libelle: 'Type de voie', valeur: 'rue' },
    { groupe: '', libelle: 'Nom de la voie', valeur: 'des Lilas' },
    { groupe: '', libelle: 'CP - Ville', valeur: '41000 BLOIS' },
    { groupe: '', libelle: ID + 'tabView:ficheClientPhysiqueAdresseContainer:coordooneesPrincipale:coordonneePrincipaleW1:Telephone:inputTelephone', valeur: '06 12 34 56 78' },
    { groupe: '', libelle: 'Email', valeur: 'camille.fournier@exemple.fr' },
    { groupe: '', libelle: ID + 'tabView:ficheClientPhysiqueAdresseContainer:coordooneesPrincipale:coordonneeSecondaireW1:Telephone:inputTelephone', valeur: '02 54 00 00 01' },
    { groupe: '', libelle: 'Email', valeur: '' },
    { groupe: '', libelle: 'CP, Ville', valeur: '41000 BLOIS' }
  ],
  tableaux: [],
  texte: ''
};

const bien = {
  titre: 'Authentic',
  champs: [
    { groupe: 'Informations du bien', libelle: ID + 'ficheImmeubleTabView:infosComponent:ficheImmeubleIdentite:typeWithDialog:selectOneMenu_input', valeur: 'Maison individuelle' },
    { groupe: 'Informations du bien', libelle: 'N° de voie', valeur: '3' },
    { groupe: 'Informations du bien', libelle: 'Type de voie', valeur: 'chemin' },
    { groupe: 'Informations du bien', libelle: 'Nom de la voie', valeur: 'des Vignes' },
    { groupe: 'Informations du bien', libelle: 'CP - Ville*', valeur: '41350 VINEUIL' }
  ],
  tableaux: [{ titre: 'Cadastre', entete: ['Commune', 'Préfixe', 'Section', 'Numéro', 'Adresse ou lieu-dit', 'Nature', 'Zone urbanisme', 'SPF', 'surface', ''],
    lignes: [['41350 VINEUIL', '', 'ab', '0123', 'Les Vignes', '', '', 'BLOIS 1', '512', ''], ['41350 VINEUIL', '', 'AB', '124', 'Les Vignes', '', '', 'BLOIS 1', '80', '']] }],
  texte: ''
};

test('typePageAuthentic : gestion, fiche client, fiche bien', () => {
  assert.equal(app.typePageAuthentic(gestion), 'gestion');
  assert.equal(app.typePageAuthentic(client), 'client');
  assert.equal(app.typePageAuthentic(bien), 'bien');
  assert.equal(app.typePageAuthentic({ champs: [{ libelle: 'Rechercher', valeur: '' }] }), 'autre');
});

test('intituleDossierAuthentic et dossierPourIntituleAuthentic : mêmes noms des deux côtés, jamais deviné', () => {
  assert.equal(app.intituleDossierAuthentic(gestion), 'Vente MARTEL / FOURNIER');
  const dossiers = [{ id: 'a', nom: 'MARTEL / FOURNIER' }, { id: 'b', nom: 'MARTEL / DURAND' }, { id: 'c', nom: 'MARTIN / FOURNIER' }];
  assert.equal(app.dossierPourIntituleAuthentic('Vente MARTEL/FOURNIER', dossiers).id, 'a');
  assert.equal(app.dossierPourIntituleAuthentic('Vente MARTEL/LEROY', dossiers), null);
  // Deux dossiers en cours du même nom : rien n'est choisi.
  assert.equal(app.dossierPourIntituleAuthentic('Vente MARTEL/FOURNIER', dossiers.concat({ id: 'd', nom: 'Martel / Fournier' })), null);
});

test('piecesRecuesAuthentic : pièce de la checklist, acte de naissance et réponse SAFER ; jamais une demande ni une pièce en attente', () => {
  const lignes = app.lignesDocumentsAuthentic(gestion);
  assert.equal(lignes.length, 5);
  const r = app.piecesRecuesAuthentic(lignes, app.checklistPieces('maison'));
  const cles = r.map(x => x.cle).join(',');
  assert.ok(cles.includes('certificatUrbanisme'), cles);
  assert.ok(!cles.includes('renonciationPreemption'), 'DIA en attente : non reçue');
  const safer = r.find(x => x.cle === 'perso-safer');
  assert.equal(safer.label, 'Réponse SAFER');
  assert.equal(safer.nouvelle, true);
  assert.equal(safer.date, '2026-09-10');
  const naissance = r.find(x => /naissance/i.test(x.label));
  assert.equal(naissance.nouvelle, true);
  assert.equal(naissance.date, '2026-09-03');
  // Une seule entrée par pièce : la demande de CU ne compte pas, le CU reçu oui.
  assert.equal(r.filter(x => x.cle === 'certificatUrbanisme').length, 1);
  assert.equal(r.find(x => x.cle === 'certificatUrbanisme').date, '2026-09-20');
  // Notification SAFER sans non-préemption : rien.
  const sansDecision = app.piecesRecuesAuthentic([{ titre: 'Notification SAFER', date: '2026-09-10', etat: '', texte: 'Notification SAFER · 10/09/2026' }], []);
  assert.equal(sansDecision.length, 0);
});

test('clientDepuisFicheAuthentic : état civil, adresse, téléphones et emails', () => {
  const p = app.clientDepuisFicheAuthentic(client);
  assert.equal(p.nom, 'FOURNIER');
  assert.equal(p.prenom, 'Camille');
  assert.equal(p.civilite, 'Madame');
  assert.equal(p.autresPrenoms, 'Louise');
  assert.equal(p.dateNaissance, '1985-02-14');
  assert.equal(p.lieuNaissance, '37000 TOURS');
  assert.equal(p.profession, 'Infirmière');
  assert.equal(p.adresse.texte, '8 rue des Lilas 41000 BLOIS');
  assert.equal(p.telephones.join(' / '), '06 12 34 56 78 / 02 54 00 00 01');
  assert.equal(p.emails.join(','), 'camille.fournier@exemple.fr');
});

test('bienDepuisFicheAuthentic : type, adresse et parcelles du cadastre', () => {
  const b = app.bienDepuisFicheAuthentic(bien);
  assert.equal(b.type, 'maison');
  assert.equal(b.adresse.texte, '3 chemin des Vignes 41350 VINEUIL');
  assert.equal(b.parcelles.map(x => x.section + x.numero).join(','), 'AB123,AB124');
});

test('dossiersDepuisRelevesAuthentic : pages regroupées par dossier ; parties retrouvées par l’intitulé', () => {
  const vendeur = JSON.parse(JSON.stringify(client));
  vendeur.champs.find(c => c.libelle === 'Nom de famille*').valeur = 'Martel';
  vendeur.champs.find(c => c.libelle === 'Prénom*').valeur = 'Alexandre';
  vendeur.champs.find(c => /naissanceDate/.test(c.libelle)).valeur = '02/06/1970';
  const releves = [
    { recueLe: '2026-10-02T09:00:00Z', capture: gestion },
    { recueLe: '2026-10-02T09:01:00Z', capture: vendeur },
    { recueLe: '2026-10-02T09:02:00Z', capture: client },
    { recueLe: '2026-10-02T09:02:30Z', capture: client },   // même fiche relevée deux fois
    { recueLe: '2026-10-02T09:03:00Z', capture: bien }
  ];
  const groupes = app.dossiersDepuisRelevesAuthentic(releves);
  assert.equal(groupes.length, 1);
  const ex = groupes[0].export;
  assert.equal(ex.intitule, 'Vente MARTEL / FOURNIER');
  assert.equal(ex.personnes.length, 2);
  assert.equal(ex.immeubles.length, 1);
  const parties = app.partiesExportAuthentic(ex);
  assert.equal(parties.map(p => `${p.nom}:${p.role}`).join(','), 'Alexandre MARTEL:VENDEUR,Camille FOURNIER:ACQUEREUR');
  assert.equal(parties[1].telephones.length, 2);
  assert.equal(app.bienExportAuthentic(ex).type, 'maison');
  // Pièces présentes : celles de la page de gestion (le CU reçu, pas la demande).
  assert.ok(app.piecesExportAuthentic(ex, app.checklistPieces('maison')).some(p => p.cle === 'certificatUrbanisme'));
});

test('piecesAuthenticAAppliquer : une fois par pièce, jamais déjà reçue ni retirée, jamais en participation', () => {
  const d = { id: 'a', nom: 'MARTEL / FOURNIER', typeVente: 'maison', pieces: {}, historique: [] };
  const cles = app.piecesAuthenticAAppliquer(d, gestion).map(p => p.cle);
  assert.ok(cles.includes('certificatUrbanisme') && cles.includes('perso-safer'), cles.join(','));
  // Déjà reprise une fois (puis décochée par l'étude) : plus reprise.
  assert.ok(!app.piecesAuthenticAAppliquer(Object.assign({}, d, { piecesAuthentic: ['certificatUrbanisme'] }), gestion).some(p => p.cle === 'certificatUrbanisme'));
  // Déjà reçue (NAS) ou retirée de la checklist : rien.
  assert.ok(!app.piecesAuthenticAAppliquer(Object.assign({}, d, { pieces: { certificatUrbanisme: 'recue' } }), gestion).some(p => p.cle === 'certificatUrbanisme'));
  assert.ok(!app.piecesAuthenticAAppliquer(Object.assign({}, d, { piecesRetirees: ['certificatUrbanisme'] }), gestion).some(p => p.cle === 'certificatUrbanisme'));
  assert.equal(app.piecesAuthenticAAppliquer(Object.assign({}, d, { roleNotaire: 'participant' }), gestion).length, 0);
});
