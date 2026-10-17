'use strict';
// « Reçu d'Authentic » (17/10) : ce qui manque d'après la fiche et les pages gardées. Données inventées.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');
const app = chargerApplication();

test('manques : page du dossier, fiche client de chaque personne (jamais une société), fiche bien sans parcelle', () => {
  const d = { parties: [{ role: 'VENDEUR', nom: 'Léa ESSAI' }, { role: 'VENDEUR', nom: 'SCI DU TEST', qualitePersonne: 'morale' }, { role: 'ACQUEREUR', nom: 'Paul EXEMPLE' }],
    authentic: { fichesClients: { 'lea essai': { nom: 'Léa ESSAI' } } } };
  const m = app.manquesAuthenticDossier(d, []).map((x) => x.texte).join(' | ');
  assert.match(m, /Page du dossier/);
  assert.match(m, /Fiche client de Paul EXEMPLE/);
  assert.doesNotMatch(m, /Léa ESSAI|SCI/);
  assert.match(m, /Fiche bien/);
  const plein = app.manquesAuthenticDossier(Object.assign({}, d, { bien: { cadastre: { parcelles: [{ section: 'AB', numero: '1' }] } } }), [{ nature: 'dossier' }]).map((x) => x.texte).join(' | ');
  assert.equal(plein, 'Fiche client de Paul EXEMPLE');
  assert.equal(app.libellePageRecueAuthentic({ nature: 'client', cle: 'client:lea essai' }), 'Fiche client — LEA ESSAI');
  assert.equal(app.formatDateHeureCourte('pas une date'), '');
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
