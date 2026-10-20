'use strict';

// Biens d'un dossier d'Authentic (étude 19/10 : « il mélange les dossiers » — le bien d'une autre vente rangé dans GALLOYER / BORDAS ;
// « repérer dans la structure le nombre de biens du dossier et ne pas en rajouter d'autres »). Noms et adresses inventés.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const app = chargerApplication();
const PAGE = { texte: 'A 2025 00281\n1 - VTE MARTIN / DURAND\nComparants\nImmeubles (1)\n4 Grande Rue 41290 VIEVY LE RAYE Maison individuelle\nDocuments\nCompromis' };
const AUTRE = { adresse: { texte: '24 rue des Lilas 41190 SAINT LUBIN EN VERGONNOIS' }, parcelles: [{ section: 'ZN', numero: '4' }] };
const BON = { adresse: { texte: '4 Grande Rue 41290 VIEVY LE RAYE' }, parcelles: [{ section: 'B', numero: '234' }] };

test('rubrique « Immeubles (n) » de la page du dossier : nombre et biens cités', () => {
  const r = app.biensRubriqueAuthentic(PAGE);
  assert.equal(r.nombre, 1);
  assert.ok(r.texte.includes('VIEVY'));
  assert.equal(app.bienDansRubriqueAuthentic(BON.adresse, r), true);
  assert.equal(app.bienDansRubriqueAuthentic(AUTRE.adresse, r), false);
  assert.equal(app.bienDansRubriqueAuthentic('', r), null);
  assert.equal(app.bienDansRubriqueAuthentic(AUTRE.adresse, null), null);
  // Rubrique coupée (fin non trouvée, trop longue) : le nombre seul.
  assert.equal(app.biensRubriqueAuthentic({ texte: 'Immeubles (2)\n' + 'x '.repeat(900) }).texte, '');
  assert.equal(app.biensRubriqueAuthentic({ texte: 'Rien ici' }), null);
});

test('fiche bien ouverte hors de l’onglet d’un dossier : d’aucun dossier sûr', () => {
  assert.equal(app.ongletActifHorsDossierAuthentic({ onglets: [{ titre: 'Recherche d’immeubles', actif: true }] }), true);
  assert.equal(app.ongletActifHorsDossierAuthentic({ onglets: [{ titre: 'A 2025 00281 VTE MARTIN / DURAND', actif: true }] }), false);
  assert.equal(app.ongletActifHorsDossierAuthentic({ onglets: [{ titre: 'VTE MARTIN...', actif: true }] }), false);
  assert.equal(app.ongletActifHorsDossierAuthentic({ onglets: [] }), false);
  assert.equal(app.ongletActifHorsDossierAuthentic({}), false);
});

test('pas plus de biens que la page du dossier n’en annonce, jamais un bien absent de sa rubrique', () => {
  const d = { id: 'a', nom: 'MARTIN / DURAND', adresseBien: '4 Grande Rue 41290 VIEVY LE RAYE', bien: { cadastre: { parcelles: [{ section: 'B', numero: '234' }] } },
    authentic: { immeubles: [{ adresse: '4 Grande Rue 41290 VIEVY LE RAYE', parcelles: [{ section: 'B', numero: '234' }] }], biensDossier: app.biensRubriqueAuthentic(PAGE) } };
  assert.equal(app.retenirImmeubleVenteAuthentic(d, AUTRE, false), false);
  assert.equal(d.authentic.immeubles.length, 1);
  // Nombre seul (rubrique coupée) : un bien de plus que n refusé.
  d.authentic.biensDossier = { nombre: 1, texte: '' };
  assert.equal(app.retenirImmeubleVenteAuthentic(d, AUTRE, false), false);
  // Sans page du dossier lue : rien n'est refusé par cette règle.
  delete d.authentic.biensDossier;
  assert.notEqual(app.retenirImmeubleVenteAuthentic(d, AUTRE, false), false);
  assert.equal(d.authentic.immeubles.length, 2);
});

test('complément depuis Authentic : le bien d’un autre dossier ou absent de la rubrique est écarté', () => {
  const d = { id: 'a', adresseBien: '4 Grande Rue 41290 VIEVY LE RAYE', bien: {} };
  const donnees = { immeubles: [Object.assign({ id: 'i1' }, BON), Object.assign({ id: 'i2' }, AUTRE)], biens: ['i1', 'i2'], infosAuthentic: { biensDossier: app.biensRubriqueAuthentic(PAGE) } };
  const r = app.donneesSansBiensEtrangersAuthentic(d, donnees, []);
  assert.equal(r.immeubles.map(x => x.id).join(','), 'i1');
  assert.equal(r.biens.join(','), 'i1');
  // Bien principal d'un autre dossier de CLAIRE, même sans rubrique lue.
  const autre = { id: 'b', nom: 'X / Y', adresseBien: '24 rue des Lilas 41190 SAINT LUBIN EN VERGONNOIS', bien: {} };
  const sans = app.donneesSansBiensEtrangersAuthentic(d, { immeubles: donnees.immeubles, biens: [] }, [d, autre]);
  assert.equal(sans.immeubles.map(x => x.id).join(','), 'i1');
});

test('au démarrage : seul le bien principal d’un autre dossier quitte la fiche, avec ses parcelles', () => {
  const fiche = () => ({ id: 'a', nom: 'MARTIN / DURAND', adresseBien: '4 Grande Rue 41290 VIEVY LE RAYE', historique: [],
    bien: { cadastre: { section: 'B', numero: '234', parcelles: [{ section: 'B', numero: '234' }, { section: 'ZN', numero: '4' }] } },
    authentic: { biensDossier: app.biensRubriqueAuthentic(PAGE), immeubles: [
      { adresse: '4 Grande Rue 41290 VIEVY LE RAYE', parcelles: [{ section: 'B', numero: '234' }] },
      { adresse: '24 rue des Lilas 41190 SAINT LUBIN EN VERGONNOIS', parcelles: [{ section: 'ZN', numero: '4' }] }] } });
  // La rubrique seule ne retire rien au démarrage (relecture 19/10).
  const seul = fiche();
  assert.equal(app.retirerBiensDAutresDossiers(seul, [seul]), false);
  const d = fiche();
  const autre = { id: 'b', nom: 'X / Y', adresseBien: '24 rue des Lilas 41190 SAINT LUBIN EN VERGONNOIS', bien: {} };
  assert.equal(app.retirerBiensDAutresDossiers(d, [d, autre]), true);
  assert.equal(d.authentic.immeubles.length, 1);
  assert.equal(d.bien.cadastre.parcelles.map(p => p.section + p.numero).join(','), 'B234');
});

test('relecture 19/10 : abréviations, rubrique sans code postal, bien principal — jamais un vrai bien écarté', () => {
  const rub = app.biensRubriqueAuthentic({ texte: 'Immeubles (2)\n41000 BLOIS\n3 Fbg St Jean\n41000 BLOIS\n5 Fbg St Jean (garage)\nDocuments' });
  assert.equal(app.bienDansRubriqueAuthentic('BLOIS (41000), 5 Faubourg Saint-Jean', rub), true);
  assert.equal(app.bienDansRubriqueAuthentic('Résidence Les Tilleuls Bâtiment B 12 avenue Wilson 41000 BLOIS', rub), true);
  // Rubrique sans code postal, ou suivie d'autre chose : on ne sait pas.
  assert.equal(app.bienDansRubriqueAuthentic('La Hupinière 41350 VINEUIL', { nombre: 1, texte: 'La Hupinière VINEUIL' }), null);
  assert.equal(app.bienDansRubriqueAuthentic('8 rue des Lilas 41000 BLOIS', { nombre: 1, texte: 'Martel Julie Tél. 06 00 00 00 00' }), null);
  // Le bien principal (adresse ou parcelle commune) est toujours retenu, même le premier, même contredit par la rubrique.
  const d = { id: 'a', adresseBien: 'BLOIS (41000), 8 rue des Lilas', bien: { cadastre: { parcelles: [{ section: 'AB', numero: '12' }] } },
    authentic: { biensDossier: { nombre: 1, texte: '41100 VENDOME 2 rue Haute' } } };
  assert.notEqual(app.retenirImmeubleVenteAuthentic(d, { adresse: { texte: '8 Rue des Lilas Résidence Les Iris 41000 BLOIS' }, parcelles: [{ section: 'AB', numero: '12' }] }, false), false);
  assert.equal(d.authentic.immeubles.length, 1);
  // Rubrique remplacée en entier par la page suivante.
  const f = app.fusionnerInfosAuthentic({ biensDossier: { nombre: 1, texte: '8 rue des Lilas 41000 BLOIS' } }, { biensDossier: { nombre: 2, texte: '' } });
  assert.equal(`${f.biensDossier.nombre}|${f.biensDossier.texte}`, '2|');
});

test('contre-relecture 19/10 : adresse écrite autrement, liste jamais vidée, bien non annoncé jamais écrit, tantièmes', () => {
  assert.equal(app.memeAdresseApprocheeAuthentic('3 Fbg St Jean 41000 BLOIS', 'BLOIS (41000), 3 Faubourg Saint-Jean'), true);
  assert.equal(app.memeAdresseApprocheeAuthentic('12 rue Denis Papin 41000 BLOIS', 'BLOIS (41000), 12 rue Denis Papin Résidence Les Tilleuls bât. B'), true);
  assert.equal(app.memeAdresseApprocheeAuthentic('4 bis Grande Rue 41290 VIEVY LE RAYE', '4B Grande Rue 41290 VIEVY LE RAYE'), true);
  assert.equal(app.memeAdresseApprocheeAuthentic('24 rue des Lilas 41190 SAINT LUBIN', '4 Grande Rue 41290 VIEVY LE RAYE'), false);
  assert.equal(app.memeAdresseApprocheeAuthentic('3 rue Neuve 41000 BLOIS', '12 rue Neuve 41000 BLOIS'), false);
  // Copropriété : l'autre vente du même immeuble ne vide pas la fiche.
  const d = { id: 'a', adresseBien: 'BLOIS (41000), 12 rue Denis Papin Résidence Les Tilleuls bât. B', historique: [], bien: { cadastre: { parcelles: [{ section: 'AB', numero: '100' }] } },
    authentic: { immeubles: [{ adresse: '12 rue Denis Papin 41000 BLOIS', parcelles: [{ section: 'AB', numero: '100' }] }, { adresse: '12 rue Denis Papin 41000 BLOIS', parcelles: [{ section: 'AB', numero: '100' }] }] } };
  const b = { id: 'b', nom: 'C / D', adresseBien: '12 rue Denis Papin 41000 BLOIS', bien: {} };
  assert.equal(app.retirerBiensDAutresDossiers(d, [d, b]), false);
  assert.equal(d.authentic.immeubles.length, 2);
  // Fiche bien non annoncée par la rubrique : ni parcelles, ni type de vente posés.
  const v = { id: 'v', typeVente: 'maison', adresseBien: '4 Grande Rue 41290 VIEVY LE RAYE', historique: [], pieces: {}, bien: { cadastre: { section: 'B', numero: '234', parcelles: [{ section: 'B', numero: '234' }] } },
    authentic: { biensDossier: { nombre: 1, texte: '' }, immeubles: [{ adresse: '4 Grande Rue 41290 VIEVY LE RAYE', parcelles: [{ section: 'B', numero: '234' }] }] } };
  const r = app.appliquerBienAuthentic(v, { adresse: null, type: 'terre', parcelles: [{ section: 'ZN', numero: '4' }] }, () => {}, { modifie: false }, {});
  assert.match(r.raison || '', /absent des immeubles/);
  assert.equal(v.typeVente, 'maison');
  assert.equal(v.bien.cadastre.parcelles.length, 1);
  // Tantièmes et numéros de lot ne sont pas des codes postaux ; un bien sans code postal dans la rubrique : on ne sait pas.
  assert.equal(app.bienDansRubriqueAuthentic('Le Bourg 41290 VIEVY LE RAYE', { nombre: 2, texte: 'Le Bourg VIEVY LE RAYE Lot 12 - 125/10000' }), null);
  assert.equal(app.bienDansRubriqueAuthentic('Les Grands Champs 41190 SAINT LUBIN', { nombre: 2, texte: '4 Grande Rue 41290 VIEVY LE RAYE Les Grands Champs' }), null);
  assert.equal(app.bienDansRubriqueAuthentic('24 rue des Lilas 41190 SAINT LUBIN', { nombre: 1, texte: '4 Grande Rue 41290 VIEVY LE RAYE' }), false);
});

test('création depuis Authentic : seule la dernière version de chaque page est rejouée, jamais une personne étrangère ni une correction défaite', () => {
  const ID = 'ui-ficho-tabs:mainTabPanel:tabForm2:tabContent:tabView:';
  const fiche = (prenom, nom, email) => ({ onglets: [{ titre: 'A 2026 00500 VTE MARTEL / FOURNIER', actif: true }], tableaux: [], texte: '', champs: [
    { libelle: ID + 'ficheClientPhysiqueIdentite:etude_input', valeur: 'oui' }, { libelle: 'Nom de famille*', valeur: nom }, { libelle: 'Prénom*', valeur: prenom }, { libelle: 'Email', valeur: email }] });
  const d = { id: 'a', nom: 'MARTEL / FOURNIER', parties: [{ role: 'VENDEUR', nom: 'Alexandre MARTEL' }, { role: 'ACQUEREUR', nom: 'Camilla FOURNIER' }], pieces: {}, historique: [] };
  const releves = [
    { id: '1', recueLe: '2026-10-19T09:00:00Z', capture: fiche('Alexandre', 'Martel', 'ancien@exemple.fr') },
    { id: '2', recueLe: '2026-10-19T09:05:00Z', capture: fiche('Alexandre', 'Martel', 'nouveau@exemple.fr') },
    { id: '3', recueLe: '2026-10-19T09:06:00Z', capture: fiche('Camille', 'Fournier', 'camille@exemple.fr') },  // prénom corrigé en « Camilla » dans « Vérifier »
    { id: '4', recueLe: '2026-10-19T09:07:00Z', capture: fiche('Paul', 'Durand', 'paul@exemple.fr') }          // personne étrangère au dossier
  ];
  assert.equal(app.pagesARejouerCreationAuthentic(d, releves).map(r => r.id).join(','), '2');
});

test('intitulé d’Authentic : un nom qui commence par « DE », « PV », « ACHAT »… garde ses lettres (cent scénarios du 19/10)', () => {
  assert.equal(app.intituleVenteNormalise('Vente DELMAS-EVRARD / PARIS-FLEURY'), 'Vente DELMAS-EVRARD / PARIS-FLEURY');
  assert.equal(app.intituleVenteNormalise('VTE DEBRAY / ROUX'), 'Vente DEBRAY / ROUX');
  assert.equal(app.intituleVenteNormalise('VTE ACHATIER / PVOLLE'), 'Vente ACHATIER / PVOLLE');
  assert.equal(app.intituleVenteNormalise('Promesse de vente MARTEL/FOURNIER'), 'Vente MARTEL / FOURNIER');
});

test('Point 2 (19/10) : un dossier n’est sûr que par sa référence ou un intitulé rangé ici ; sinon proposé, jamais pris', () => {
  const galois = { id: 'g', nom: 'GALOIS / MERLE', referenceAuthentic: 'A 2026 00101', parties: [] };
  const sansRef = { id: 's', nom: 'DUVAL / NOEL', parties: [{ role: 'VENDEUR', nom: 'DUVAL' }, { role: 'ACQUEREUR', nom: 'NOEL' }] };
  const range = { id: 'r', nom: 'LEROY / BRUN', intitulesAuthentic: [app.cleIntituleAuthentic('VTE LEROY / BRUN')], parties: [] };
  const liste = [galois, sansRef, range];
  assert.equal(app.dossierSurAuthentic(galois, 'A 2026 00101', 'VTE GALOIS / MERLE'), true);
  assert.equal(app.dossierSurAuthentic(sansRef, 'A 2026 00200', 'VTE DUVAL / NOEL'), false, 'les noms seuls ne suffisent pas');
  assert.equal(app.dossierSurAuthentic(range, '', 'VTE LEROY / BRUN'), true, 'intitulé rangé à la main');
  assert.equal(app.dossierSurAuthentic(galois, 'A 2026 00999', 'VTE GALOIS / MERLE'), false, 'autre référence');
  const onglet = (titre) => ({ onglets: [{ titre, actif: true }], champs: [], tableaux: [], texte: '' });
  const c1 = app.contexteSurAuthentic(onglet('A 2026 00101 VTE GALOIS / MERLE'), liste, null);
  assert.equal(c1.d, galois);
  const c2 = app.contexteSurAuthentic(onglet('A 2026 00200 VTE DUVAL / NOEL'), liste, null);
  assert.equal(c2.d, null, 'jamais rangé par les noms de l’onglet');
  assert.equal(c2.propose, sansRef, 'mais proposé pour un clic');
  assert.equal(c2.groupe, 'A 2026 00200');
  const c3 = app.contexteSurAuthentic(onglet('Recherche d’immeubles'), liste, galois);
  assert.equal(c3.d, null, 'onglet sans dossier : pas le dernier vu');
  const c4 = app.contexteSurAuthentic({ champs: [], tableaux: [], texte: '' }, liste, galois);
  assert.equal(c4.d, galois, 'ancienne extension sans onglets : le dernier dossier SÛR vu');
});

test('Création (20/10) : une fiche bien ouverte dans son propre onglet n’entre au dossier à créer que si sa rubrique « Immeubles » la cite', () => {
  const ID = 'ui-ficho-tabs:mainTabPanel:tabForm2:tabContent:';
  const bien = (numero, voie, cpVille, onglet) => ({ onglets: [{ titre: onglet, actif: true }], texte: '', champs: [
    { groupe: 'Informations du bien', libelle: ID + 'ficheImmeubleTabView:infosComponent:ficheImmeubleIdentite:typeWithDialog:selectOneMenu_input', valeur: 'Maison individuelle' },
    { groupe: 'Informations du bien', libelle: 'N° de voie', valeur: numero }, { groupe: 'Informations du bien', libelle: 'Type de voie', valeur: 'rue' },
    { groupe: 'Informations du bien', libelle: 'Nom de la voie', valeur: voie }, { groupe: 'Informations du bien', libelle: 'CP - Ville*', valeur: cpVille }],
    tableaux: [{ titre: 'Cadastre', entete: ['Commune', 'Préfixe', 'Section', 'Numéro', 'Adresse ou lieu-dit', 'Nature', 'Zone urbanisme', 'SPF', 'surface', ''], lignes: [[cpVille, '', 'B', numero, '', '', '', '', '500', '']] }] });
  const page = { onglets: [{ titre: 'A 2026 00777 VTE MARTIN / DURAND', actif: true }], champs: [], tableaux: [],
    texte: 'A 2026 00777 VTE MARTIN / DURAND\n2 - Vente d’immeuble Importer\nComparants (2)\nM. MARTIN Paul\nVendeur\nImmeubles (1)\n4 Grande Rue 41290 VIEVY LE RAYE Maison individuelle\nDocuments' };
  const releves = [
    { recueLe: '2026-10-20T08:00:00Z', capture: page },
    { recueLe: '2026-10-20T08:01:00Z', capture: bien('4', 'Grande Rue', '41290 VIEVY LE RAYE', 'Grande Rue') },
    { recueLe: '2026-10-20T08:02:00Z', capture: bien('24', 'des Lilas', '41190 SAINT LUBIN', 'Recherche d’immeubles') }
  ];
  const g = app.dossiersDepuisRelevesAuthentic(releves).find(x => /MARTIN/.test(x.intitule));
  assert.ok(g, 'groupe du dossier');
  assert.equal(g.export.immeubles.map(im => im.adresse && im.adresse.texte).join(' | ').includes('Lilas'), false, 'bien d’ailleurs écarté');
  assert.equal(g.export.immeubles.length, 1);
  assert.match(String(g.export.immeubles[0].adresse && g.export.immeubles[0].adresse.texte), /Grande Rue/);
});

test('Relecture 0.292.1 : le voisin de la même rue n’est pas le bien du dossier ; des comparants lus qui écartent une personne l’emportent', () => {
  const d = { id: 'v', nom: 'MARTIN / DURAND', adresseBien: 'VIEVY-LE-RAYE (41290), 4 Grande Rue', bien: { cadastre: { parcelles: [{ section: 'B', numero: '234' }] } },
    parties: [{ role: 'VENDEUR', nom: 'DUPONT', prenom: 'Paul' }, { role: 'VENDEUR', nom: 'DUPONT', prenom: 'Claire' }],
    authentic: { biensDossier: { nombre: 1, texte: '4 Grande Rue 41290 VIEVY LE RAYE Maison' }, comparants: [{ nom: 'DUPONT Claire', role: 'VENDEUR' }] } };
  assert.equal(app.bienDuDossierSurAuthentic(d, { adresse: { texte: '4 Grande Rue 41290 VIEVY LE RAYE' }, parcelles: [] }), true, 'son bien');
  assert.equal(app.bienDuDossierSurAuthentic(d, { adresse: { texte: '8 Grande Rue 41290 VIEVY LE RAYE' }, parcelles: [{ section: 'B', numero: '240' }] }), false, 'le voisin');
  assert.equal(app.bienDuDossierSurAuthentic(d, { adresse: null, parcelles: [{ section: 'B', numero: '234' }] }), true, 'sans adresse : la parcelle');
  const rural = Object.assign({}, d, { adresseBien: 'VIEVY-LE-RAYE (41290), Lieu-dit Les Bordes', bien: { cadastre: { parcelles: [{ section: 'ZA', numero: '12' }] } }, authentic: {} });
  assert.equal(app.bienDuDossierSurAuthentic(rural, { adresse: { texte: '8 Lieu-dit Les Bordes 41290 VIEVY LE RAYE' }, parcelles: [{ section: 'ZA', numero: '13' }] }), false, 'voisin du lieu-dit');
  assert.equal(app.bienDuDossierSurAuthentic(rural, { adresse: { texte: 'Lieu-dit Les Bordes 41290 VIEVY LE RAYE' }, parcelles: [{ section: 'ZA', numero: '12' }] }), true, 'même parcelle');
  assert.equal(app.comparantsCoteIllisiblesAuthentic(d, 'VENDEUR'), false, 'Mme DUPONT est lue : Paul reste écarté');
  const rate = Object.assign({}, d, { authentic: { comparants: [{ nom: 'SCI LES TILLEULS', role: 'VENDEUR' }] } });
  assert.equal(app.comparantsCoteIllisiblesAuthentic(rate, 'VENDEUR'), true, 'personne de la fiche dans les comparants lus : lecture ratée');
});
