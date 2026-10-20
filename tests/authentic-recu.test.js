'use strict';
// « Reçu d'Authentic » (17/10) : ce qui manque d'après la fiche et les pages gardées. Données inventées.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');
const app = chargerApplication();

test('pages attendues : page du dossier, fiche client de chaque personne et de chaque société, chaque bien annoncé', () => {
  const d = { parties: [{ role: 'VENDEUR', nom: 'Léa ESSAI' }, { role: 'VENDEUR', nom: 'SCI DU TEST', qualitePersonne: 'morale' }, { role: 'ACQUEREUR', nom: 'Paul EXEMPLE' }],
    authentic: { fichesClients: { 'lea essai': { nom: 'Léa ESSAI', vuLe: '2026-10-19T08:00:00Z' } }, biensDossier: { nombre: 2 } } };
  const vide = app.pagesAttenduesAuthentic(d, []);
  assert.equal(vide.map((p) => `${p.libelle}:${p.recue ? 'oui' : 'non'}`).join(' | '),
    'Page du dossier:non | Fiche de Léa ESSAI:oui | Fiche de SCI DU TEST:non | Fiche de Paul EXEMPLE:non | Fiche du bien 1:non | Fiche du bien 2:non');
  const plein = app.pagesAttenduesAuthentic(d, [{ nature: 'dossier', recueLe: '2026-10-19T09:00:00Z' }, { nature: 'bien' }, { nature: 'bien' }]);
  assert.equal(plein.filter((p) => !p.recue).map((p) => p.libelle).join(','), 'Fiche de SCI DU TEST,Fiche de Paul EXEMPLE');
  assert.equal(app.formatDateHeureCourte('pas une date'), '');
});

test('panneau Authentic : lien, valeurs reprises corrigées à la main, état civil lu', () => {
  const d = { id: 'p1', nom: 'ESSAI / EXEMPLE', referenceAuthentic: 'A 2026 00017', intituleAuthentic: 'VTE ESSAI / EXEMPLE', prixVente: 210000, adresseBien: 'BLOIS (41000), 2 rue Haute',
    emailVendeur: 'lea@exemple.fr', parties: [{ role: 'VENDEUR', nom: 'Léa ESSAI' }],
    authentic: { valeurs: { prixVente: 200000, adresseBien: 'BLOIS (41000), 2 rue Haute' }, fichesAuthentic: { v1: { role: 'VENDEUR', nom: 'Léa ESSAI', emails: ['lea@exemple.fr'] } },
      fichesClients: { 'lea essai': { nom: 'Léa ESSAI', civilite: 'Mme', dateNaissance: '1985-02-14', lieuNaissance: 'TOURS', profession: 'Infirmière' } } } };
  assert.equal(app.lienAuthenticDossier(d).etat, 'reference');
  assert.equal(app.lienAuthenticDossier({ id: 'x' }).etat, 'aucun');
  const champs = app.champsReprisAuthentic(d);
  assert.equal(champs.map((c) => `${c.cle}:${c.etat}`).join(','), 'adresseBien:identique,prixVente:corrige,emails:v1:identique');
  const p = app.personnesLuesAuthentic(d)[0];
  assert.equal(p.nom, 'Madame Léa ESSAI');
  assert.equal(p.role, 'Vendeur');
  assert.match(p.lignes.map((l) => l.join(' ')).join(' | '), /Naissance née le 14 février 1985 à TOURS \| Profession Infirmière/);
  assert.equal(p.manque.join(','), 'Domicile,Email,Téléphone');
});

// Relecture du 17/10 : une promesse n'est jamais gardée ; seule une page qui désigne CE dossier est relue.
test('relecture : promesse « ignorer », page d’un autre dossier Authentic écartée, page rattachée relue', () => {
  const page = (entete, ref = 'A 2026 00017') => ({ champs: [], tableaux: [], texte: `${ref} VTE MARTEL / FOURNIER\n${entete} Importer avec 6e SENS\nComparants (2)\n1 - Promesse VTE MARTEL/FOURNIER\n2 - VTE MARTEL / FOURNIER` });
  assert.equal(app.clePageReleveAuthentic(page('1 - Promesse VTE MARTEL/FOURNIER')), 'ignorer');
  assert.notEqual(app.clePageReleveAuthentic(page('2 - VTE MARTEL / FOURNIER')), 'ignorer');
  const d = { id: 'v1', nom: 'MARTEL / FOURNIER', referenceAuthentic: 'A 2026 00017' };
  assert.equal(app.pageRelisibleAuthentic(d, page('2 - VTE MARTEL / FOURNIER')), true);
  assert.equal(app.pageRelisibleAuthentic(d, page('1 - Promesse VTE MARTEL/FOURNIER')), false);
  assert.equal(app.pageRelisibleAuthentic(d, page('2 - VTE MARTEL / FOURNIER', 'A 2026 00099')), false, 'autre référence');
  assert.equal(app.pageRelisibleAuthentic({ id: 'v2', nom: 'DURAND / LEROY' }, page('2 - VTE MARTEL / FOURNIER', 'A 2026 00099')), false, 'ne désigne pas ce dossier');
});

test('fiche bien : tout ce que dit chaque onglet est gardé, réuni par libellé', () => {
  const r = app.fusionnerBienAuthentic({ parcelles: [], details: [{ libelle: 'Type de bien', valeur: 'Maison' }, { libelle: 'Usage', valeur: 'Habitation' }] },
    { parcelles: [{ section: 'AB', numero: '1', zone: 'UA' }], details: [{ libelle: 'Usage', valeur: 'Mixte' }, { libelle: 'Surface habitable', valeur: '90 m²' }] });
  assert.equal(r.details.map((x) => `${x.libelle}=${x.valeur}`).join('|'), 'Type de bien=Maison|Usage=Mixte|Surface habitable=90 m²');
  assert.equal(r.parcelles[0].zone, 'UA');
  const d = app.detailsFicheBienAuthentic([{ libelle: 'Type de bien', valeur: 'Maison' }, { libelle: 'Adresse', valeur: '2 rue des Essais' }]);
  assert.equal(d.map((x) => x.libelle).join(','), 'Type de bien');
});

test('page réelle d’une succession (« … veuve de … », comparants Défunt / Héritier) : gardée et relue', () => {
  const page = { texte: ['1 - Mme DURAND Jeanne veuve de M. DURAND Pierre', 'Importer', 'Comparants (2)',
    'Mme DURAND Jeanne veuve de M. DURAND Pierre', 'Défunt', 'M. DURAND Marc', 'Héritier', 'Immeubles (0)'].join('\n'), tableaux: [], champs: [] };
  assert.notEqual(app.clePageReleveAuthentic(page), 'ignorer');
  assert.equal(app.sousDossierLuAuthentic(page), 'succession');
});

// Rendez-vous (étude 17/10) : contexte vente / succession, et le même client dans un autre dossier.
test('rendez-vous : contexte vente ou succession, mêmes clients ailleurs identifiés par prénom et nom', () => {
  const vente = { id: 'v1', nom: 'ESSAI / EXEMPLE', parties: [{ role: 'VENDEUR', nom: 'Léa ESSAI' }, { role: 'ACQUEREUR', nom: 'Paul EXEMPLE' }] };
  assert.equal(app.contexteRendezVousDossier(vente), 'Vente — Léa ESSAI (vendeur) avec Paul EXEMPLE (acquéreur)');
  const succ = { id: 's1', nom: 'ESSAI', typeAffaire: 'succession', defunt: { prenoms: 'Jean', nom: 'ESSAI' },
    parties: [{ role: 'PARTIE', nom: 'Jean ESSAI' }, { role: 'PARTIE', nom: 'Léa ESSAI' }], succession: { rendezVous: [{ id: 'r1', etape: 'notoriete', date: '2099-01-05' }] } };
  assert.match(app.contexteRendezVousDossier(succ), /^Succession de Jean ESSAI — héritier : Léa ESSAI$/);
  const autres = app.autresDossiersMemesClients(vente, [vente, succ, { id: 'v2', parties: [{ role: 'VENDEUR', nom: 'ESSAI' }] }], '2026-10-17');
  assert.equal(autres.length, 1, 'un nom de famille seul ne désigne personne');
  assert.equal(autres[0].dossier.id, 's1');
  assert.equal(autres[0].personnes[0].role, 'Héritier');
  assert.equal(autres[0].prochainRdv, '2099-01-05');
});

test('mêmes clients ailleurs : ni civilité, ni particule, ni prénom en plus ne font une même personne', () => {
  const v = (id, nom) => ({ id, parties: [{ role: 'VENDEUR', nom }] });
  const d = v('a', 'Mme DURAND');
  assert.equal(app.autresDossiersMemesClients(d, [d, v('b', 'DURAND')], '2026-10-17').length, 0);
  const f = v('c', 'DE LA FONTAINE');
  assert.equal(app.autresDossiersMemesClients(f, [f, v('d', 'DE LA FONTAINE')], '2026-10-17').length, 0);
  const j = v('e', 'Jean MARTIN');
  assert.equal(app.autresDossiersMemesClients(j, [j, v('f', 'Jean Paul MARTIN')], '2026-10-17').length, 0);
  assert.equal(app.autresDossiersMemesClients(j, [j, v('g', 'MARTIN Jean')], '2026-10-17').length, 1);
});

test('rendez-vous d’une succession : le titre ne redit ni le dossier ni l’étape', () => {
  const d = { id: 's1', nom: 'MOREAU', typeAffaire: 'succession' };
  assert.equal(app.complementTitreRdvSuccession(d, { etape: 'notoriete', titre: 'SUCC - MOREAU - Acte de notoriété' }), '');
  assert.equal(app.complementTitreRdvSuccession(d, { etape: 'ouvertureSuccession', titre: 'SUCC - MOREAU - Ouverture avec Sophie' }), '');
  assert.equal(app.complementTitreRdvSuccession(d, { etape: 'autre', titre: 'SUCC - MOREAU - Visite de la maison' }), 'Visite de la maison');
  assert.equal(app.complementTitreRdvSuccession(d, { etape: 'notoriete', titre: '' }), '');
});

test('cartes de l’onglet Dossier : chaque fiche une fois, homonymes par le rôle, prénom à part, société sans lien', () => {
  const d = { id: 'v1', nom: 'MARTIN / MARTIN', parties: [{ role: 'VENDEUR', nom: 'Jean MARTIN' }, { role: 'ACQUEREUR', nom: 'Jean MARTIN' },
    { role: 'ACQUEREUR', nom: 'DURAND', prenom: 'Léa' }, { role: 'ACQUEREUR', nom: 'SCI DU TEST', qualitePersonne: 'morale' }] };
  const f = { personnes: [{ id: 'pA', nom: 'Jean MARTIN', role: 'Acquéreur' }, { id: 'pV', nom: 'Jean MARTIN', role: 'Vendeur' }, { id: 'pD', nom: 'DURAND', role: 'Acquéreur' }], biens: [] };
  const html = app.htmlCartesClientsBiensDossier(d, f);
  const ids = [...html.matchAll(/ouvrirFicheClientBien\('personne', '([^']+)'\)/g)].map((m) => m[1]);
  assert.equal(ids.join(','), 'pV,pA,pD', 'vendeur puis acquéreur, chacun sa fiche ; Léa DURAND reliée à « DURAND »');
  assert.match(html, /pb-groupe-titre">Vendeur<[^]*pb-groupe-titre">Acquéreurs</, 'un titre par groupe');
  assert.match(html, /pb-carte pb-carte-simple[^]*SCI DU TEST/, 'une société : carte simple, sans lien');
  assert.doesNotMatch(html, /en cours de lecture/, 'fiches lues : jamais « en cours de lecture »');
});

test('cartes d’une succession : civilité du défunt et des héritiers, titres Défunt / Héritiers', () => {
  const d = { id: 's1', nom: 'ESSAI', typeAffaire: 'succession', defunt: { civilite: 'Monsieur', prenoms: 'Jean', nom: 'ESSAI' },
    parties: [{ role: 'PARTIE', nom: 'Jean ESSAI' }, { role: 'PARTIE', nom: 'Léa ESSAI', civilite: 'Mme' }, { role: 'PARTIE', nom: 'Paul ESSAI' }],
    authentic: { fichesClients: { 'paul essai': { nom: 'Paul ESSAI', nomFamille: 'ESSAI', prenom: 'Paul', civilite: 'M' } } } };
  const html = app.htmlCartesClientsBiensDossier(d, null);
  assert.match(html, /Défunt<\/div>[^]*Monsieur Jean ESSAI/);
  assert.match(html, /Héritiers<\/div>[^]*Madame Léa ESSAI[^]*Monsieur Paul ESSAI/);
});

test('civilité d’une succession : jamais inventée pour le défunt, jamais pour une société, reprise des comparants', () => {
  const html = app.htmlCartesClientsBiensDossier({ id: 's2', nom: 'ESSAI', typeAffaire: 'succession', defunt: { prenoms: 'Jean', nom: 'ESSAI' },
    parties: [{ role: 'PARTIE', nom: 'Jean ESSAI' }, { role: 'PARTIE', nom: 'SCI PAUL ESSAI', qualitePersonne: 'morale' }, { role: 'PARTIE', nom: 'Paul ESSAI' }],
    authentic: { fichesClients: { 'paul essai': { nom: 'Paul ESSAI', nomFamille: 'ESSAI', prenom: 'Paul', civilite: 'M' } } } }, null);
  assert.doesNotMatch(html, /Madame Jean ESSAI/);
  assert.doesNotMatch(html, /Monsieur SCI/);
  assert.match(html, /Monsieur Paul ESSAI/);
});

test('succession : le défunt reconnu parmi les parties sans faire disparaître un héritier au nom proche', () => {
  assert.equal(app.memeDefunt('Jean ESSAI', 'ESSAI', 'Jean Paul'), true, 'premier prénom seul');
  assert.equal(app.memeDefunt('ESSAI Jean Paul', 'ESSAI', 'Jean Paul'), true, 'ordre inversé');
  assert.equal(app.memeDefunt('Paul ESSAI', 'ESSAI', 'Jean Paul'), false, 'l’héritier « Paul ESSAI »');
  assert.equal(app.memeDefunt('ESSAI', 'ESSAI', 'Jean'), false, 'nom seul');
  assert.equal(app.memeDefunt('Marie ESSAI', 'ESSAI', 'Jean'), false);
  const d = { id: 's1', nom: 'ESSAI', typeAffaire: 'succession', defunt: { prenoms: 'Jean Paul', nom: 'ESSAI' },
    parties: [{ role: 'PARTIE', nom: 'Jean ESSAI' }, { role: 'PARTIE', nom: 'Paul ESSAI' }] };
  assert.equal(app.personnesSuccession(d).heritiers.map((p) => p.nom).join(','), 'Paul ESSAI');
});

test('succession : un prénom composé n’est pas le prénom simple du défunt', () => {
  assert.equal(app.memeDefunt('Jean-Pierre ESSAI', 'ESSAI', 'Jean'), false);
  assert.equal(app.memeDefunt('Jean-Pierre ESSAI', 'ESSAI', 'Jean-Pierre'), true);
  assert.equal(app.memeDefunt('Mme ESSAI Marie', 'ESSAI', 'Marie Louise'), true);
});

test('succession : tirets, apostrophes et fiche sans nom de famille (relecture du 17/10)', () => {
  assert.equal(app.memeDefunt('Jean MARTIN ESSAI', 'MARTIN-ESSAI', 'Jean'), true);
  assert.equal(app.memeDefunt('Jean MARTIN-ESSAI', 'MARTIN ESSAI', 'Jean'), true);
  assert.equal(app.memeDefunt('Jeanne D ARC', 'D\'ARC', 'Jeanne'), true);
  assert.equal(app.memeDefunt('Jean-Pierre ESSAI', 'ESSAI', 'Jean Pierre'), true);
  assert.equal(app.memeDefunt('Jean Pierre ESSAI', 'ESSAI', 'Jean-Pierre'), true);
  assert.equal(app.memeDefunt('Jean-Pierre ESSAI', 'ESSAI', 'Jean'), false);
  assert.equal(app.memeDefunt('Me Jean ESSAI', 'ESSAI', 'Jean'), true);
  assert.equal(app.memeDefunt('Jean Paul ESSAI', '', 'Jean Paul', 'Jean Paul ESSAI'), true, 'fiche sans nom de famille');
  assert.equal(app.memeDefunt('Paul ESSAI', '', 'Jean Paul', 'Jean Paul ESSAI'), false);
  assert.equal(app.memeDefunt('Essai Jean', '', 'Essai Jean', 'Essai Jean'), true, 'comparant sans capitales');
});

test('fiche client d’une SOCIÉTÉ (structure du 20/10) : raison sociale, forme, SIREN, SIRET, siège ; la partie devient une personne morale', () => {
  const ID = 'ui-ficho-tabs:mainTabPanel:tabForm9:tabContent:tabView:';
  const capture = { onglets: [{ titre: 'SCI LES TILLEULS', actif: true }], tableaux: [], texte: '', champs: [
    { libelle: ID + 'clientEtude_input', valeur: 'oui' },
    { libelle: ID + 'identiteClient:categorie:selectonemenu_input', valeur: 'Société' },
    { libelle: ID + 'identiteClient:societeType:selectonemenu_input', valeur: 'Société civile immobilière' },
    { libelle: 'Dénomination sociale*', valeur: 'SCI Les Tilleuls' },
    { libelle: "Numéro d'identification", valeur: '123 456 789' },
    { libelle: 'Numéro de SIRET', valeur: '12345678900017' },
    { libelle: 'Nombre de parts', valeur: '1000' },
    { libelle: 'N° de voie', valeur: '3' }, { libelle: 'Type de voie', valeur: 'rue' }, { libelle: 'Nom de la voie', valeur: 'des Lilas' },
    { libelle: 'CP - Ville', valeur: '41000 BLOIS' },
    { libelle: ID + 'panelAdresseEtCoordonnees:coordonneesClientPrincipale:ficheClientCoordonneesContactPrincipale:Telephone:inputTelephone', valeur: '02 54 00 00 00' },
    { libelle: 'Email', valeur: 'contact@sci-tilleuls.fr' }] };
  assert.equal(app.typePageAuthentic(capture), 'client');
  const p = app.clientDepuisFicheAuthentic(capture);
  assert.equal(p.morale, true);
  assert.equal(p.nom, 'SCI LES TILLEULS');
  assert.equal(p.forme, 'Société civile immobilière');
  assert.equal(p.siren, '123456789');
  assert.equal(p.siret, '12345678900017');
  const d = { id: 'm1', nom: 'SCI LES TILLEULS / DURAND', parties: [{ role: 'VENDEUR', nom: 'SCI LES TILLEULS' }, { role: 'ACQUEREUR', nom: 'DURAND', prenom: 'Léa' }], pieces: {}, historique: [] };
  const r = app.appliquerReleveSurDossier(d, capture, '2026-10-20T10:00:00Z', [d]);
  assert.equal(r.modifie, true);
  assert.equal(d.parties[0].qualitePersonne, 'morale');
  assert.match(d.emailVendeur || '', /sci-tilleuls/);
  const fiche = Object.values(d.authentic.fichesClients)[0];
  assert.equal(fiche.siren, '123456789');
  const lue = app.personnesLuesAuthentic(d)[0];
  assert.match(lue.lignes.map((l) => l.join(' ')).join(' | '), /Forme Société civile immobilière \| SIREN 123456789 \| SIRET 12345678900017/);
  assert.equal(app.personneDuDossierSurAuthentic(d, p), true, 'fiche de la société dans son onglet : la société du dossier');
});

test('fiche d’une société : jamais le gérant du même nom pris pour la société (relecture 0.293.0)', () => {
  const d = { id: 'm2', nom: 'DUPONT / DURAND', parties: [{ role: 'VENDEUR', nom: 'DUPONT', prenom: 'Paul', civilite: 'M' }, { role: 'VENDEUR', nom: 'SCI DUPONT' }], historique: [] };
  const notes = [];
  app.marquerSocieteAuthentic(d, { morale: true, nom: 'SCI DUPONT' }, 'VENDEUR', (t) => notes.push(t));
  assert.equal(d.parties[0].qualitePersonne, undefined);
  assert.equal(d.parties[0].civilite, 'M');
  assert.equal(d.parties[1].qualitePersonne, 'morale');
  const d2 = { parties: [{ role: 'VENDEUR', nom: 'DUPONT' }] };
  app.marquerSocieteAuthentic(d2, { morale: true, nom: 'SCI DUPONT' }, 'VENDEUR', () => {});
  assert.equal(d2.parties[0].qualitePersonne, undefined, 'un nom contenu dans la raison sociale n’est pas la société');
  assert.equal(app.personneDuDossierSurAuthentic({ parties: [{ nom: 'SCI LES PINS DU LAC' }] }, { morale: true, nom: 'SCI LES PINS' }), false);
});

test('fiches client de deux personnes du même nom sans date de naissance : deux identifiants (étude 20/10, succession MARTINEAU)', () => {
  const ID = 'ui-ficho-tabs:mainTabPanel:tabForm9:tabContent:tabView:';
  const fiche = (prenom) => ({ onglets: [{ titre: 'COSTE ' + prenom, actif: true }], tableaux: [], texte: '', champs: [
    { libelle: ID + 'ficheClientPhysiqueIdentite:etude_input', valeur: 'oui' }, { libelle: 'Nom de famille*', valeur: 'Coste' }, { libelle: 'Prénom*', valeur: prenom }] });
  const a = app.clientDepuisFicheAuthentic(fiche('Alain'));
  const c = app.clientDepuisFicheAuthentic(fiche('Claude'));
  assert.notEqual(a.id, c.id);
  assert.equal(app.clientDepuisFicheAuthentic(fiche('Alain')).id, a.id, 'la même personne garde son identifiant');
});
