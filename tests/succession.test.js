'use strict';

// Fiches succession (étude 15/10) : types, actes, déroulé et pièces d'une succession (commun/succession.js), cartes du Tableau,
// bandeau, lecture des actes dans Authentic. Données inventées.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const S = require('../commun/succession');
const P = require('../commun/planning');
const { checklistPiecesBase } = require('../commun/pieces');
const { chargerApplication } = require('./helpers/load-app.js');
const app = chargerApplication();

const base = (plus) => Object.assign({ id: 's1', nom: 'SUCC DURAND', typeAffaire: 'succession', sansPret: true, parties: [], pieces: {} }, plus || {});

test('type proposé : immobilier → classique ; sans immobilier, plus de 50 000 € → notoriété + déclaration ; sinon notoriété seule', () => {
  assert.equal(S.typeSuccessionPropose(base({ biens: [{ adresse: 'BLOIS (41000), 1 rue X' }] })), 'classique');
  assert.equal(S.typeSuccessionPropose(base({ authentic: { immeubles: [{ parcelles: [] }] } })), 'classique');
  assert.equal(S.typeSuccessionPropose(base({ succession: { actifSuperieurSeuil: true } })), 'notoriete-ds');
  assert.equal(S.typeSuccessionPropose(base()), 'notoriete');
  // Le type choisi sur la fiche l'emporte ; un type inconnu est ignoré.
  assert.equal(S.typeSuccession(base({ biens: [{ adresse: 'X' }], succession: { type: 'notoriete' } })), 'notoriete');
  assert.equal(S.typeSuccession(base({ succession: { type: 'inconnu' } })), 'notoriete');
});

test('actes : ceux du type, plus ceux qu’Authentic ajoute (délivrance de legs…), avec leur état', () => {
  const d = base({ biens: [{ adresse: 'X' }], authentic: { actesSuccession: [
    { intitule: 'Acte de notoriété', etat: 'signe', signeLe: '2026-11-03' },
    { intitule: 'Délivrance de legs', etat: 'a_rediger', signeLe: '' },
    { intitule: 'Convention de quasi-usufruit', etat: '', signeLe: '' }
  ] } });
  const actes = S.actesSuccession(d);
  assert.equal(actes.map(a => `${a.libelle}:${a.etat}:${a.base ? 'base' : 'authentic'}`).join('|'),
    'Acte de notoriété:signe:base|Déclaration de succession::base|Attestation immobilière::base|Délivrance de legs:a_rediger:authentic|Convention de quasi-usufruit::authentic');
  assert.equal(S.acteBaseDepuisIntitule('Attestation immobilière après décès'), 'attestation');
  assert.equal(S.acteBaseDepuisIntitule('Déclaration de succession'), 'declaration');
});

test('déroulé : ouverture, notoriété à 1 mois, contrôle à 2 mois, déclaration à 6 mois — depuis le rendez-vous d’ouverture', () => {
  const d = base({ biens: [{ adresse: 'X' }], succession: { ouvertureLe: '2026-10-20' } });
  const e = S.etapesSuccession(d, '2026-10-15');
  assert.equal(e.map(x => `${x.type}:${x.iso}:${x.fait ? 'fait' : ''}:${x.active ? 'actif' : ''}`).join('|'),
    'ouvertureSuccession:2026-10-20::actif|notoriete:2026-11-20::actif|controleDroits:2026-12-20::actif|deblocageFonds:::|receptionFonds:::|decompteSuccession:::actif|projetSuccession:::actif|appelFondsSuccession:::actif|declarationSuccession:2027-04-20::actif');
  assert.match(e.find(x => x.type === 'declarationSuccession').label, /attestation immobilière et de la déclaration de succession/);
  // Notoriété seule : pas de déclaration de succession.
  assert.ok(!S.etapesSuccession(base({ succession: { ouvertureLe: '2026-10-20' } }), '2026-10-15').some(x => x.type === 'declarationSuccession'));
  // Ouverture passée : faite.
  assert.ok(S.etapesSuccession(d, '2026-10-21')[0].fait);
});

test('notoriété : date butoir à 1 mois, remplacée par le rendez-vous placé ; notoriété + DS : deux étapes, deux rendez-vous possibles', () => {
  const seule = S.etapesSuccession(base({ succession: { ouvertureLe: '2026-10-20' } }), '2026-10-15').find(x => x.type === 'notoriete');
  assert.deepEqual([seule.iso, seule.butoir, seule.rdvPlace], ['2026-11-20', true, false]);
  const placee = S.etapesSuccession(base({ succession: { ouvertureLe: '2026-10-20' }, rendezVousSignature: '2026-11-12' }), '2026-10-15').find(x => x.type === 'notoriete');
  assert.deepEqual([placee.iso, placee.butoir, placee.rdvPlace], ['2026-11-12', false, true]);
  const ds = base({ succession: { ouvertureLe: '2026-10-20', actifSuperieurSeuil: true } });
  const e = S.etapesSuccession(ds, '2026-10-15');
  const n = e.find(x => x.type === 'notoriete');
  assert.equal(n.label, 'Signature de l’acte de notoriété');
  assert.deepEqual([n.iso, n.fenetreDebut, n.butoir], ['2027-04-20', '2027-02-20', true]);
  const decl = e.find(x => x.type === 'declarationSuccession');
  assert.equal(decl.label, 'Signature de la déclaration de succession');
  assert.ok(!e.some(x => /ttestation/.test(x.label)));
  // Deux rendez-vous (21/10) : chacun sa date ; un seul rendez-vous « SUCC - … » sert aux deux étapes.
  const deux = S.etapesSuccession(Object.assign({}, ds, { succession: Object.assign({}, ds.succession, { rendezVous: [
    { id: 'a', etape: 'notoriete', date: '2027-03-02', heure: '10:00' }, { id: 'b', etape: 'declarationSuccession', date: '2027-03-09', heure: '10:00' }] }) }), '2027-02-01');
  assert.deepEqual([deux.find(x => x.type === 'notoriete').iso, deux.find(x => x.type === 'declarationSuccession').iso], ['2027-03-02', '2027-03-09']);
  const un = S.etapesSuccession(Object.assign({}, ds, { succession: Object.assign({}, ds.succession, { rendezVous: [{ id: 'b', etape: 'declarationSuccession', date: '2027-03-09', heure: '10:00' }] }) }), '2027-02-01');
  assert.deepEqual([un.find(x => x.type === 'notoriete').iso, un.find(x => x.type === 'declarationSuccession').iso], ['2027-03-09', '2027-03-09']);
  const acte = S.etapesSuccession(Object.assign({}, ds, { succession: Object.assign({}, ds.succession, { rendezVous: [{ id: 'c', etape: 'acte', date: '2027-03-12', heure: '10:00' }] }) }), '2027-02-01');
  assert.deepEqual([acte.find(x => x.type === 'notoriete').iso, acte.find(x => x.type === 'declarationSuccession').iso, acte.find(x => x.type === 'declarationSuccession').rdvPlace], ['2027-03-12', '2027-03-12', true]);
  // Pas d'attestation immobilière : aucune pièce d'immobilier, même avec un bien.
  assert.ok(!S.piecesSuccessionDossier(Object.assign({}, ds, { succession: Object.assign({}, ds.succession, { type: 'notoriete-ds' }), biens: [{ adresse: '1 rue des Tests' }] })).some(p => (S.PIECES_SUCCESSION.find(q => q.cle === p.cle) || {}).immobilier));
  const c = app.cartesTableauFiche(Object.assign({ id: 'sd' }, ds), '2026-10-15', []);
  assert.match(c.faire.find(x => x.cle === 'succession:notoriete').sous, /^Entre le .+ et le .+ — date butoir, à confirmer par le rendez-vous/);
  // Déclaration signée dans Authentic : la déclaration est faite, la notoriété garde sa propre étape.
  const signee = S.etapesSuccession(Object.assign({}, ds, { authentic: { actesSuccession: [{ intitule: 'Déclaration de succession', etat: 'signe', signeLe: '2027-03-01' }] } }), '2027-03-02');
  assert.ok(signee.find(x => x.type === 'declarationSuccession').fait);
});

test('après la notoriété signée : déblocage des fonds puis réception ; avec un conjoint survivant, transfert des comptes', () => {
  const d = base({ succession: { type: 'notoriete-ds', ouvertureLe: '2026-10-01', notorieteSigneeLe: '2026-11-04' }, echeancesValidees: { notoriete: true } });
  const e = S.etapesSuccession(d, '2026-11-10');
  const deb = e.find(x => x.type === 'deblocageFonds');
  assert.deepEqual([deb.iso, deb.active, deb.fait], ['2026-11-04', true, false]);
  assert.equal(e.find(x => x.type === 'receptionFonds').active, false);
  // Conjoint survivant : déduit de « Épouse de » sur le défunt, ou coché.
  const c = S.etapesSuccession(base({ succession: { type: 'classique' }, defunt: { conjointLien: 'Époux de' }, echeancesValidees: { notoriete: true } }), '2026-11-10');
  assert.ok(c.some(x => x.type === 'transfertComptes') && !c.some(x => x.type === 'deblocageFonds'));
  // Notoriété seule (étude 26/10) : ni déblocage, ni réception, ni transfert des comptes — avec ou sans conjoint survivant.
  for (const plus of [{}, { defunt: { conjointLien: 'Époux de' } }]) {
    const seule = base(Object.assign({ succession: { type: 'notoriete', ouvertureLe: '2026-10-01', notorieteSigneeLe: '2026-11-04' }, echeancesValidees: { notoriete: true } }, plus));
    assert.ok(!S.autorisationsFondsSuccession(seule));
    assert.ok(!S.etapesSuccession(seule, '2026-11-10').some(x => ['deblocageFonds', 'receptionFonds', 'transfertComptes'].includes(x.type)));
  }
  assert.ok(S.autorisationsFondsSuccession(base({ succession: { type: 'notoriete-ds' } })));
  assert.ok(!S.conjointSurvivant(base({ defunt: { conjointLien: 'Veuve de' } })));
  assert.ok(S.conjointSurvivant(base({ succession: { conjointSurvivant: true } })));
});

test('acte de notoriété signé dans Authentic : fait, sans coche ; planning et echeanceValidee le suivent', () => {
  const d = base({ succession: { type: 'notoriete-ds', ouvertureLe: '2026-10-01' }, authentic: { actesSuccession: [{ intitule: 'Notoriété', etat: 'signe', signeLe: '2026-10-28' }] } });
  assert.ok(P.echeanceValidee(d, 'notoriete'));
  assert.ok(!P.echeancesPlanning(d).some(x => x.type === 'notoriete'));
  assert.equal(P.echeancesPlanning(d).find(x => x.type === 'deblocageFonds').iso, '2026-10-28');
});

test('pièces : celles d’une succession, l’immobilier seulement s’il y en a ; reconnues par le nom du fichier', () => {
  const sans = checklistPiecesBase('maison', base()).map(p => p.cle).join(',');
  assert.equal(sans, 'acteDeces,livretFamille,actesNaissance,acteMariage,fcddv,estimationVehicules,carteGrise');
  const avec = checklistPiecesBase('maison', base({ biens: [{ adresse: 'X' }], piecesRetirees: ['carteGrise'] })).map(p => p.cle).join(',');
  assert.equal(avec, 'acteDeces,livretFamille,actesNaissance,acteMariage,fcddv,titrePropriete,ehf,estimationImmobilier,estimationVehicules');
  const motif = (cle) => S.PIECES_SUCCESSION.find(p => p.cle === cle).motifNom;
  assert.ok(motif('fcddv').test('Reponse FCDDV DURAND'));
  assert.ok(motif('fcddv').test('Fichier central des dernieres volontes'));
  assert.ok(motif('ehf').test('EHF DURAND'));
  assert.ok(motif('estimationVehicules').test('Estimation vehicule Clio'));
  assert.ok(!motif('estimationImmobilier').test('Estimation vehicule Clio'));
  assert.ok(motif('estimationImmobilier').test('Avis de valeur maison'));
  assert.ok(motif('carteGrise').test('Carte grise Clio'));
  assert.ok(motif('acteDeces').test('Acte de deces DURAND'));
  assert.ok(!motif('acteDeces').test('Declaration de succession'));
});

test('notoriété : actes de naissance, acte de décès, FCDDV reçus, donation et testament tranchés', () => {
  assert.equal(S.attentesNotoriete(base()).join(' | '), 'Acte de décès | Actes de naissance | Interrogation du FCDDV (fichier central des dernières volontés) | Donation entre époux à vérifier | Testament à vérifier');
  assert.equal(S.attentesNotoriete(base({ pieces: { acteDeces: 'recue', actesNaissance: 'recue', fcddv: 'recue' }, succession: { donationEpoux: 'non', testament: 'oui' } })).length, 0);
});

test('Tableau de la fiche : rendez-vous d’ouverture à fixer, puis les étapes en colonnes ; aucune carte d’une vente', () => {
  const d = base({ id: 's2', biens: [{ adresse: 'X' }] });
  const c = app.cartesTableauFiche(d, '2026-10-15', []);
  assert.ok(c.faire.some(x => /Fixer le rendez-vous d’ouverture/.test(x.titre)));
  assert.ok(!['faire', 'attente', 'fait'].some(col => c[col].some(x => !/^succession:/.test(x.cle || '') && /appel de fonds|projet|prêt/i.test(x.titre))));
  const ouverte = base({ id: 's3', biens: [{ adresse: 'X' }], succession: { ouvertureLe: '2026-10-01' } });
  const c2 = app.cartesTableauFiche(ouverte, '2026-10-15', []);
  assert.ok(c2.fait.some(x => x.cle === 'succession:ouvertureSuccession'));
  const noto = c2.faire.find(x => x.cle === 'succession:notoriete');
  // Plus de deux pièces à réunir : leur nombre seulement, la liste est dans « À obtenir » (étude 24/10).
  assert.match(noto.sous, /À réunir : 5 pièces/);
  const deux = app.cartesTableauFiche(base({ id: 's4', biens: [{ adresse: 'X' }], succession: { ouvertureLe: '2026-10-01', donationEpoux: 'non', testament: 'non' }, pieces: { actesNaissance: 'recue', fcddv: 'recue' } }), '2026-10-15', []);
  assert.match(deux.faire.find(x => x.cle === 'succession:notoriete').sous, /À réunir : Acte de décès$/);
  assert.ok(c2.attente.some(x => x.cle === 'succession:deblocageFonds'));
  // Étude 24/10 : la tâche « Placer le rendez-vous » ne double pas la carte de l'étape qui porte « Placer dans l'agenda ».
  assert.ok(noto.bouton && /agenda/i.test(noto.bouton.libelle), 'l’étape porte le geste');
  const avecTache = app.cartesTableauFiche(ouverte, '2026-10-15', [{ cle: 's3:point-placer-le-rendez-vous', type: 'point-placer-le-rendez-vous', titre: 'Placer le rendez-vous', jours: 5, gravite: 'critique', dossier: ouverte }]);
  assert.ok(!avecTache.faire.some(x => x.cle === 'action:s3:point-placer-le-rendez-vous'));
  assert.ok(c2.obtenir.some(x => x.cle === 'piece:fcddv'));
});

test('bandeau : le prochain acte à signer, avant sa date', () => {
  const d = base({ succession: { ouvertureLe: '2026-10-01' } });
  const s = app.signatureBandeauSuccession(d, '2026-10-15');
  assert.equal(s.etat, 'aplacer');
  assert.equal(s.iso, '2026-11-01');
  assert.match(s.acte, /acte de notoriété/);
  assert.equal(app.signatureBandeauSuccession(base({ echeancesValidees: { notoriete: true } }), '2026-10-15').etat, 'signe');
});

test('Authentic : actes d’une succession lus dans le tableau « Rédaction » (ni courrier ni demande)', () => {
  const capture = { tableaux: [{ titre: 'Rédaction', entete: ['Intitulé', 'Date', 'État'], lignes: [
    ['Acte de notoriété', '', 'Signé le 03/11/2026'],
    ['Déclaration de succession', '', 'En cours'],
    ['Délivrance de legs', '', 'Non rédigé'],
    ['Courrier banque', '12/10/2026', 'Envoyé']
  ] }] };
  const actes = app.actesSuccessionAuthentic(capture);
  assert.equal(actes.map(a => `${a.intitule}:${a.etat}:${a.signeLe}`).join('|'), 'Acte de notoriété:signe:2026-11-03|Déclaration de succession:redaction:|Délivrance de legs:a_rediger:');
});

test('fiche Dossier : défunt, héritiers, donation, testament, type proposé ; texte échappé', () => {
  const d = base({ id: 's4', parties: [{ nom: 'Jeanne DURAND', role: 'PARTIE' }, { nom: 'Paul <MARTIN>', role: 'PARTIE', emails: ['p@x.fr'] }],
    defunt: { civilite: 'Madame', prenoms: 'Jeanne', nom: 'DURAND', decesDate: '2026-09-14', regime: 'Communauté légale' } });
  const ligne = (ic, libelle, valeur) => `<div>${libelle}:${valeur}</div>`;
  const html = app.renderDossierSuccession(d, ligne, '<select></select>', 'NAS');
  assert.match(html, /Héritiers<\/span><\/span> <span class="hint">· 1<\/span>/);
  assert.match(html, /Paul &lt;MARTIN&gt;/);
  assert.match(html, /Donation entre époux/);
  assert.match(html, /Testament/);
  assert.match(html, /Communauté légale/);
  assert.match(html, /Acte de notoriété seul \(proposé\)/);
  assert.match(html, /value="2026-09-14"/);
});

// Réponses du FCDDV inventées, reprenant la forme d'une réponse du fichier central (en-tête de l'office demandeur, puis une
// rubrique par inscription : nature, date, notaire dépositaire, CRPCEN). Texte « à plat » comme le donne pdf.js.
const FCDDV_DEUX = 'FICHIER CENTRAL DES DISPOSITIONS DE DERNIÈRES VOLONTÉS Réponse à l\'interrogation Demandeur : Maître Sophie GOSSART 41000 BLOIS '
  + 'Défunt : DURAND Jeanne née le 01/02/1930 Nature de la disposition : Testament olographe Date de la disposition : 12/03/2010 '
  + 'Notaire dépositaire : Maître Paul LEROUX 37000 TOURS CRPCEN : 37001 Nature de la disposition : Donation entre époux Date : 05/06/1995 '
  + 'Notaire : Me Anne MOREAU 41200 ROMORANTIN-LANTHENAY CRPCEN : 41099';

test('FCDDV : chaque inscription avec sa nature, sa date, le notaire dépositaire et son CRPCEN ; jamais l’office demandeur', () => {
  const a = app.analyseFcddv(FCDDV_DEUX);
  assert.equal(a.aucune, false);
  assert.equal(a.inscriptions.map(i => `${i.nature}|${i.date}|${i.notaire}|${i.ville}|${i.crpcen}`).join(' ; '),
    'Testament olographe|2010-03-12|Paul LEROUX|TOURS|37001 ; Donation entre époux|1995-06-05|Anne MOREAU|ROMORANTIN-LANTHENAY|41099');
  const vide = app.analyseFcddv('FICHIER CENTRAL ... Demandeur : Maître Sophie GOSSART. Aucune disposition de dernières volontés n\'a été enregistrée au nom de DURAND Jeanne.');
  assert.deepEqual([vide.aucune, vide.inscriptions.length], [true, 0]);
  assert.deepEqual([app.analyseFcddv('texte illisible').aucune, app.analyseFcddv('texte illisible').inscriptions.length], [false, 0]);
});

test('FCDDV : compte rendu réel de l’ADSN (20/10) — deux inscriptions « Acte du », sans nature, morceaux dans le désordre', () => {
  const texte = 'XXX;I;341089;20260930 ADSN 95 avenue des Logissons 13107 VENELLES cedex ETUDE : 41089 Référence : JS Me GOSSART Sophie NOTAIRE '
    + '3 RUE DU BOUT DES HAIES BP 20104 41001 BLOIS Folio 1 / 1 COMPTE RENDU D\'INTERROGATION Nom: DURAND Prénoms : Jeanne Date de décès : 14/09/2026 '
    + 'Le fichier central a enregistré les inscriptions suivantes : Acte du : 29/01/2002 LEROUX MOREAU NOTAIRE 9 AVENUE DE LA GARE B.P 2 41250 BRACIEUX '
    + 'Etude 41008 Compostage 2002020550563 Acte du : 25/11/2009 Etude 41008 LEROUX MOREAU Compostage 2009120370349 NOTAIRE 9 AVENUE DE LA GARE 41250 BRACIEUX Folio 1 / 1';
  const a = app.analyseFcddv(texte);
  assert.equal(a.aucune, false);
  assert.equal(a.inscriptions.map(i => `${i.nature}|${i.date}|${i.notaire}|${i.ville}|${i.crpcen}`).join(' ; '),
    'Disposition de dernières volontés|2002-01-29|LEROUX MOREAU|BRACIEUX|41008 ; Disposition de dernières volontés|2009-11-25|LEROUX MOREAU|BRACIEUX|41008');
  assert.equal(app.confreresFcddv({ inscriptions: a.inscriptions }).length, 1, 'un seul email à l’étude, pour ses deux actes');
  const vide = app.analyseFcddv('COMPTE RENDU D\'INTERROGATION Le fichier central n\'a enregistré aucune inscription au nom de DURAND Jeanne. Folio 1 / 1');
  assert.deepEqual([vide.aucune, vide.inscriptions.length], [true, 0]);
});

test('FCDDV ADSN : plusieurs pages, morceaux dans tous les ordres, associés d’une même étude, relecture qui garde les corrections (relecture 20/10)', () => {
  const tete = (n) => `XXX;I;341089;20260930 ADSN 95 avenue des Logissons 13107 VENELLES cedex Tél.: 0 800 306 212 fcddv@adsn.fr ETUDE : 41089 Référence : JS Me GOSSART Sophie NOTAIRE 3 RUE DU BOUT DES HAIES BP 20104 41001 BLOIS Folio ${n} / 2 `;
  const texte = tete(1) + 'COMPTE RENDU Le fichier central a enregistré les inscriptions suivantes : Acte du : 29/01/2002 Me LEROUX et Maître MOREAU NOTAIRE 9 AVENUE DE LA GARE 41250 BRACIEUX CEDEX Etude 41008 Compostage 2002020550563 '
    + 'Acte du : 25/11/2009 NOTAIRE 9 AVENUE DE LA GARE B.P 2 41250 BRACIEUX MOREAU LEROUX Etude 41008 Compostage 2009120370349\n'
    + tete(2) + 'Acte du : Etude 41099 12/03/2010 PETIT Compostage 2010031212345 NOTAIRE 2 RUE HAUTE 41200 ROMORANTIN-LANTHENAY '
    + 'Acte du : 01/02/2015 Etude 41089 GOSSART Compostage 2015020112345 NOTAIRE 3 RUE DU BOUT DES HAIES 41001 BLOIS';
  const a = app.analyseFcddv(texte);
  assert.equal(a.inscriptions.map(i => `${i.date}|${i.notaire}|${i.ville}|${i.crpcen}`).join(' ; '),
    '2002-01-29|LEROUX et MOREAU|BRACIEUX|41008 ; 2009-11-25|MOREAU LEROUX|BRACIEUX|41008 ; 2010-03-12|PETIT|ROMORANTIN-LANTHENAY|41099', 'en-têtes, CEDEX, notre étude écartés');
  assert.equal(app.confreresFcddv({ inscriptions: a.inscriptions }).length, 2, 'un email par étude, même avec des associés différents');
  const d = base();
  app.appliquerFcddvSurDossier(d, a, 'X/FCDDV.pdf', '2026-10-20T10:00:00Z');
  d.succession.fcddv.inscriptions[0].nature = 'Testament olographe';
  app.appliquerFcddvSurDossier(d, app.analyseFcddv(texte), 'X/FCDDV.pdf', '2026-10-21T10:00:00Z');
  assert.equal(d.succession.fcddv.inscriptions[0].nature, 'Testament olographe', 'la nature corrigée par l’étude reste à la relecture');
});

test('FCDDV : email du notaire par l’annuaire, sinon par le CRPCEN de l’adresse ; testament et donation répondus sur la fiche', () => {
  const carnet = [{ id: 'o1', notaires: ['Paul LEROUX'], ville: 'Tours', email: 'leroux@notaires.fr' }, { id: 'o2', notaires: ['Luc PETIT'], ville: 'Romorantin', email: 'office.41099@notaires.fr' }];
  assert.equal(app.emailNotaireFcddv({ notaire: 'Paul LEROUX', ville: 'TOURS' }, carnet), 'leroux@notaires.fr');
  assert.equal(app.emailNotaireFcddv({ notaire: 'Inconnu ZZZ', crpcen: '41099' }, carnet), 'office.41099@notaires.fr');
  const d = base({ succession: { testament: 'non' } });
  const textes = app.appliquerFcddvSurDossier(d, app.analyseFcddv(FCDDV_DEUX), 'X/FCDDV.pdf', '2026-10-15T10:00:00Z');
  assert.equal(d.succession.testament, 'non', 'une réponse déjà donnée sur la fiche reste');
  assert.equal(d.succession.donationEpoux, 'oui');
  assert.equal(textes.join(','), 'donation entre époux : oui');
  assert.equal(d.succession.fcddv.inscriptions.length, 2);
  const aucune = base();
  app.appliquerFcddvSurDossier(aucune, { aucune: true, inscriptions: [] }, 'X', '2026-10-15T10:00:00Z');
  assert.deepEqual([aucune.succession.testament, aucune.succession.donationEpoux, aucune.succession.fcddv.aucune], ['non', 'non', true]);
});

test('FCDDV : un email par notaire dépositaire, la nature et le coût de l’acte demandés', () => {
  const d = base({ referenceAuthentic: 'A 2026 00398', defunt: { civilite: 'Madame', prenoms: 'Jeanne Marie', nom: 'DURAND', decesDate: '2026-09-14', decesLieu: 'BLOIS (41000)' },
    succession: { fcddv: { inscriptions: [
      { nature: 'Testament olographe', date: '2010-03-12', notaire: 'Paul LEROUX', email: 'a@n.fr' },
      { nature: 'Codicille', date: '', notaire: 'Paul LEROUX', email: '' },
      { nature: 'Donation entre époux', date: '1995-06-05', notaire: 'Anne MOREAU', email: 'b@n.fr' }] } } });
  const groupes = app.confreresFcddv(d.succession.fcddv);
  assert.equal(groupes.map(g => `${g.notaire}:${g.inscriptions.length}:${g.email}`).join('|'), 'Paul LEROUX:2:a@n.fr|Anne MOREAU:1:b@n.fr');
  const e = app.emailConfrereFcddv(d, groupes[0]);
  assert.equal(e.sujet, 'Succession de Madame Jeanne DURAND — FCDDV — Réf. A 2026 00398');
  assert.match(e.corps, /succession de Madame Jeanne DURAND, décédée le 14 septembre 2026 à BLOIS \(41000\)\./);
  assert.match(e.corps, /les inscriptions suivantes en votre office :\n- Testament olographe du 12 mars 2010\n- Codicille/);
  assert.match(e.corps, /la nature exacte de ces actes et le coût de vos actes/);
  assert.doesNotMatch(e.corps, /Mon Cher Maître|Sauf erreur/);
});

test('Authentic : actes de naissance reçus quand toutes les demandes sont revenues positives ; EHF quand la réquisition est envoyée et revenue', () => {
  const ps = app.piecesSuccessionAuthentic({
    etatsCivils: { a: { label: 'Acte de naissance de Paul DURAND', etat: 'positif' }, b: { label: 'Acte de naissance de Léa DURAND', etat: 'attente' }, c: { label: 'Acte de décès', etat: 'positif' } },
    rhf: { envoyeeLe: '2026-10-02', retourLe: '' }
  });
  assert.deepEqual([ps.actesNaissance.recue, ps.actesNaissance.recus, ps.actesNaissance.total, ps.ehf.recue], [false, 1, 2, false]);
  const ok = app.piecesSuccessionAuthentic({ etatsCivils: { a: { label: 'Acte de naissance de Paul DURAND', etat: 'positif' } }, rhf: { envoyeeLe: '2026-10-02', retourLe: '2026-10-12' } });
  assert.deepEqual([ok.actesNaissance.recue, ok.ehf.recue], [true, true]);
  assert.equal(app.piecesSuccessionAuthentic({}).actesNaissance.recue, false);
  // Sur la fiche : la pièce cochée « dans Authentic », une seule fois.
  const d = base({ id: 's9', biens: [{ adresse: 'X' }], authentic: { etatsCivils: { a: { label: 'Acte de naissance de Paul DURAND', etat: 'positif' } } } });
  const capture = { titre: 'Authentic', champs: [], texte: '1 - Succession Paul DURAND\nComparants\nImmeubles', tableaux: [{ titre: 'Etat civil', entete: ['Intitulé', 'Date', 'État'], lignes: [['ECV Acte de naissance de Paul DURAND', '01/10/2026', 'Réponse positive']] },
    { titre: 'Demande', entete: ['Intitulé', 'Date', 'Date', 'État'], lignes: [['Réquisition hors formalité', '02/10/2026', '12/10/2026', 'Retour']] }] };
  assert.equal(app.typePageAuthentic(capture), 'gestion');
  const r = app.appliquerReleveSurDossier(d, capture, '2026-10-15T10:00:00Z', [d]);
  assert.equal(JSON.stringify(d.pieces), '{"actesNaissance":"recue","ehf":"recue"}');
  assert.ok(r.textes.some(t => /« Actes de naissance » \(1\/1 reçus\)/.test(t)));
  // Aucune pièce « Acte de naissance de … » ajoutée à part.
  assert.ok(!(d.piecesPersonnalisees || []).some(p => /naissance/i.test(p.label)));
  assert.equal(app.appliquerReleveSurDossier(d, capture, '2026-10-15T11:00:00Z', [d]).textes.filter(t => /Reçue dans Authentic/.test(t)).length, 0);
});

test('Authentic : la fiche bien d’une succession est gardée entière (parcelles, nature, surface), fusionnée avec le même bien', () => {
  const d = base({ id: 's10', biens: [{ adresse: 'Ancien bien noté à la main' }] });
  const noter = () => {};
  const bien = { id: 'b1', adresse: { texte: 'BRACIEUX (41250), 31 rue des Écoles', codePostal: '41250', commune: 'BRACIEUX' }, type: 'Maison individuelle', description: 'Une maison',
    parcelles: [{ section: 'AB', numero: '12', nature: 'S', surface: '512', lieuDit: 'Le Bourg' }], lots: [] };
  app.appliquerBienSuccession(d, bien, noter, { modifie: false });
  assert.equal(d.authentic.immeubles.length, 1);
  assert.equal(JSON.stringify(d.authentic.immeubles[0].parcelles[0]), '{"section":"AB","numero":"12","lieuDit":"Le Bourg","nature":"S","surface":"512"}');
  assert.equal(d.biens.map(b => b.adresse).join('|'), 'BRACIEUX (41250), 31 rue des Écoles|Ancien bien noté à la main');
  // Même bien relu avec une parcelle de plus : complété, pas doublé.
  app.appliquerBienSuccession(d, Object.assign({}, bien, { parcelles: bien.parcelles.concat({ section: 'AB', numero: '13' }) }), noter, { modifie: false });
  assert.deepEqual([d.authentic.immeubles.length, d.authentic.immeubles[0].parcelles.length], [1, 2]);
  // Un autre bien : ajouté.
  app.appliquerBienSuccession(d, { adresse: { texte: 'BLOIS (41000), 2 rue X' }, type: 'Appartement', parcelles: [{ section: 'CK', numero: '4' }], lots: [{ numero: '7', type: 'Appartement' }] }, noter, { modifie: false });
  assert.equal(d.authentic.immeubles.length, 2);
  assert.match(app.detailBienSuccession(d.authentic.immeubles[0]), /Maison individuelle · Une maison · AB 12 Le Bourg S 5 a 12 ca/);
});

test('fiche client d’une succession : tout l’état civil gardé (nationalité, profession, coordonnées) et montré sous l’héritier', () => {
  const d = base({ id: 's11', parties: [{ nom: 'Marc DURAND', role: 'PARTIE' }] });
  const personne = { nom: 'DURAND', prenom: 'Marc', civilite: 'Monsieur', dateNaissance: '1960-04-02', lieuNaissance: '41000 BLOIS', nationalite: 'Française', profession: 'Retraité',
    adresse: { texte: '3 rue X 41000 BLOIS' }, emails: ['marc@x.fr'], telephones: ['06 00 00 00 00'], situationMatrimoniale: { situation: 'Marié(e)', regime: 'Communauté légale' } };
  const r = app.appliquerClientSuccession(d, personne, () => {}, { modifie: false }, '2026-10-15T10:00:00Z');
  assert.ok(r.modifie);
  const f = Object.values(d.authentic.fichesClients)[0];
  assert.deepEqual([f.nationalite, f.profession, f.emails[0], f.telephones[0]], ['Française', 'Retraité', 'marc@x.fr', '06 00 00 00 00']);
  assert.equal(d.parties[0].emails[0], 'marc@x.fr');
  assert.match(app.etatCivilFicheSuccession(f), /né\(e\) le .*1960 à 41000 BLOIS · Française · Retraité · domicile : .* · Marié\(e\)/);
});

test('comparants d’une succession : la qualité « Défunt » / « Héritier » d’Authentic désigne le défunt et les héritiers', () => {
  const capture = { texte: [
    'Comparants (4)',
    'Mme DURAND Jeanne veuve de M. DURAND Pierre', 'Défunt',
    'M. DURAND Marc', 'Héritier',
    'Mme LEROY Sophie épouse de M. LEROY Alain   Héritier',
    'M. PETIT Louis', 'Légataire universel',
    'Immeubles (1)', 'BLOIS (41000), 1 rue X'
  ].join('\n') };
  const c = app.comparantsAuthentic(capture);
  assert.equal(c.map(x => `${x.role}:${x.nom}:${x.qualite}`).join('|'),
    'DEFUNT:DURAND Jeanne:Défunt|HERITIER:DURAND Marc:Héritier|HERITIER:LEROY Sophie:Héritier|HERITIER:PETIT Louis:Légataire universel');
  assert.deepEqual([c[0].civilite, c[0].lien, c[0].conjoint], ['Mme', 'Veuve de', 'Monsieur DURAND Pierre']);
  // Une vente garde sa lecture (aucun champ en plus).
  assert.equal(JSON.stringify(app.comparantsAuthentic({ texte: 'Comparants (2)\nM. MARTEL Alexandre\nVendeur\nMme ROY Léa\nAcquéreur' })),
    '[{"nom":"MARTEL Alexandre","role":"VENDEUR"},{"nom":"ROY Léa","role":"ACQUEREUR"}]');

  // Sur la fiche : le défunt vient des comparants (sans fiche client lue), ses parties sont rangées.
  const d = base({ id: 's12', parties: [
    { nom: 'Jeanne DURAND', role: 'PARTIE' }, { nom: 'Marc DURAND', role: 'PARTIE' }, { nom: 'Sophie LEROY', role: 'PARTIE' }, { nom: 'Alain LEROY', role: 'PARTIE' }
  ], authentic: { comparants: c } });
  const df = app.defuntConstitution(d);
  assert.deepEqual([df.champs.civilite, df.champs.prenoms, df.champs.nom, df.champs.conjointLien, df.champs.conjointNom], ['Madame', 'Jeanne', 'DURAND', 'Veuve de', 'Monsieur DURAND Pierre']);
  assert.match(df.source, /Comparants/);
  const { heritiers, autres } = app.personnesSuccession(d);
  assert.equal(heritiers.map(h => h.nom + (h.qualite ? ` [${h.qualite}]` : '') + (h.comparant ? ' *' : '')).join('|'), 'Marc DURAND|Sophie LEROY|Louis PETIT [Légataire universel] *');
  assert.equal(autres.map(p => p.nom).join('|'), 'Alain LEROY');
  // Veuve : pas de conjoint survivant (fonds débloqués, pas de transfert des comptes).
  assert.equal(S.conjointSurvivant(d), false);
  assert.equal(S.conjointSurvivant(base({ authentic: { comparants: [{ nom: 'X Y', role: 'HERITIER', qualite: 'Conjoint survivant' }] } })), true);

  // Une fiche client lue avant la date de décès : retenue comme celle du défunt parce que les comparants la nomment.
  d.authentic.fichesClients = { 'jeanne durand': { nom: 'Jeanne DURAND', prenom: 'Jeanne', nomFamille: 'DURAND', civilite: 'Mme', domicile: 'BLOIS (41000), 1 rue X' },
    'marc durand': { nom: 'Marc DURAND', prenom: 'Marc', nomFamille: 'DURAND', deces: { date: '2026-01-01' } } };
  const df2 = app.defuntConstitution(d);
  assert.equal(df2.champs.domicile, 'BLOIS (41000), 1 rue X');
  assert.match(df2.avertissements.join(' '), /défunt retenu est celui des comparants/);
  assert.match(app.noterComparantsSuccession([], c)[0], /défunt DURAND Jeanne ; 3 héritiers/);
  assert.equal(app.noterComparantsSuccession(c, c).length, 0);
});

test('Claire Scan dans une succession : facture → « Factures à régler » (organisme, montant), courrier et renonciation → « Courrier reçu »', () => {
  const facture = 'POMPES FUNÈBRES DU VAL — 12 rue des Lilas 41000 BLOIS\nFACTURE N° 2026-118 du 03/10/2026\nObsèques de Madame Jeanne DURAND\nCercueil 1 450,00\nTotal HT 1 980,00\nTVA 396,00\nTotal TTC 2 376,00 €\nNet à payer 2 376,00 €';
  assert.equal(app.montantFactureScan(facture), 2376);
  assert.equal(app.montantFactureScan('Montant TTC : 89.90 EUR le 12/10/2026'), 89.9);
  assert.equal(app.montantFactureScan('Montant à régler 1.234,56 €'), 1234.56);
  assert.equal(app.montantFactureScan('Aucun montant ici, date 12/10/2026'), null);
  assert.equal(app.organismeFactureScan(facture, []), 'POMPES FUNÈBRES DU VAL');
  // Un organisme du répertoire cité en tête l'emporte.
  assert.equal(app.organismeFactureScan('EHPAD LES TILLEULS\nFacture de septembre', [{ organisme: 'EHPAD Les Tilleuls' }]), 'EHPAD Les Tilleuls');

  const r = app.rangementScanSuccession({ page1: facture, texte: facture }, 'facture', []);
  assert.deepEqual([r.sousDossier, r.nomCible, r.facture.organisme, r.facture.montant], ['Factures à régler', 'Facture - POMPES FUNÈBRES DU VAL - Claire Scan', 'POMPES FUNÈBRES DU VAL', 2376]);
  const courrier = 'CRÉDIT AGRICOLE\nSuccession de Madame Jeanne DURAND\nMaître, nous vous informons du solde des comptes…';
  assert.equal(app.rangementScanSuccession({ page1: courrier }, null, []).sousDossier, 'Courrier reçu');
  assert.equal(app.rangementScanSuccession({ page1: courrier }, null, []).facture, null);
  assert.equal(app.rangementScanSuccession({ page1: 'Greffe du tribunal judiciaire\nDéclaration de renonciation à succession' }, 'renonciationSuccession', []).nomCible, 'Renonciation à succession - Claire Scan');
  // Les pièces d'état civil gardent leur rangement habituel.
  assert.equal(app.rangementScanSuccession({ page1: 'Acte de naissance' }, 'etatCivil', []), null);

  // Proposition complète : dossier de succession reconnu, rangé seul (même sans type), sous-dossier choisi.
  const d = base({ id: 's13', nasDossier: 'SUCC DURAND', parties: [{ nom: 'Jeanne DURAND', role: 'PARTIE' }, { nom: 'Marc DURAND', role: 'PARTIE' }] });
  const p = app.propositionScan({ page1: courrier.replace('Jeanne DURAND', 'Jeanne DURAND et Monsieur Marc DURAND'), texte: courrier.replace('Jeanne DURAND', 'Jeanne DURAND et Monsieur Marc DURAND') }, [d], '2026-10-15T10:00:00Z');
  assert.deepEqual([p.dossierId, p.sousDossier, p.automatique], ['s13', 'Courrier reçu', true]);
  const pv = app.propositionScan({ page1: courrier, texte: courrier }, [base({ id: 'v1', typeAffaire: 'vente', nasDossier: 'X', parties: [{ nom: 'Jeanne DURAND', role: 'VENDEUR' }, { nom: 'Marc DURAND', role: 'VENDEUR' }] })], '');
  assert.equal(pv.sousDossier, undefined, 'une vente garde ses rubriques');

  // Fiche : facture notée une fois par fichier, en attente jusqu'à « réglée » ; liste de l'étude.
  const f = app.noterFactureSuccession(d, r.facture, 'SUCC DURAND/Factures à régler/Facture.pdf', '2026-10-15T10:00:00Z');
  assert.equal(app.noterFactureSuccession(d, r.facture, 'SUCC DURAND/Factures à régler/Facture.pdf', '2026-10-15T11:00:00Z'), null);
  assert.equal(app.facturesARegler(d).length, 1);
  assert.equal(app.facturesAReglerEtude([d, base({ id: 'v2', typeAffaire: 'vente' })]).map(x => x.f.organisme).join(), 'POMPES FUNÈBRES DU VAL');
  f.regleeLe = '2026-10-20';
  assert.equal(app.facturesARegler(d).length, 0);
  const cartes = [];
  app.cartesFacturesSuccessionFiche(Object.assign({}, d, { succession: { factures: [Object.assign({}, f, { regleeLe: '' })] } }), (col, c) => cartes.push(col + ':' + c.titre + ':' + c.sous));
  assert.match(cartes[0], /^faire:Régler la facture — POMPES FUNÈBRES DU VAL:2\.376,00\s€ · reçue le/);
});

test('onglet « Factures » de la fiche succession : à régler puis réglées, ajout à la main', () => {
  const d = base({ id: 's14', succession: { factures: [
    { id: 'f1', organisme: 'EHPAD TEST', montant: 1200, recueLe: '2026-10-01', fichier: 'SUCC/Factures à régler/a.pdf', regleeLe: '' },
    { id: 'f2', organisme: 'EDF', montant: 80.5, recueLe: '2026-09-20', fichier: '', regleeLe: '2026-10-02' }
  ] } });
  const html = app.renderFacturesSuccessionFiche(d);
  assert.match(html, /succ-factures-nombre">1<\/span><span>à régler — 1\.200,00\s€/);
  assert.match(html, /Réglées/);
  assert.ok(html.indexOf('EHPAD TEST') < html.indexOf('EDF'), 'à régler en tête');
  assert.match(html, /Ajouter une facture/);
});

test('agenda et arbitrage reliés à la fiche succession : rendez-vous proposé par étape, arbitrage gardé sur la fiche', () => {
  const d = base({ id: 's15', nom: 'DURAND', succession: { ouvertureLe: '' } });
  // Ouverture pas fixée : rendez-vous proposé dans 7 jours, sans case « signature ».
  const o = app.rdvAgendaSuccession(d, 'ouvertureSuccession', '2026-10-15');
  assert.deepEqual([o.titre, o.date, o.signature], ['SUCC - DURAND - Ouverture avec Sophie', '2026-10-22', false]);
  // Ouverture fixée : plus rien à placer pour elle ; la notoriété est proposée à sa date butoir (1 mois), case « signature » cochée.
  d.succession.ouvertureLe = '2026-10-10';
  assert.equal(app.rdvAgendaSuccession(d, 'ouvertureSuccession', '2026-10-15'), null);
  const n = app.rdvAgendaSuccession(d, 'notoriete', '2026-10-15');
  assert.deepEqual([n.titre, n.date, n.signature], ['SUCC - DURAND - Acte de notoriété', '2026-11-10', true]);
  // Rendez-vous déjà placé : plus de bouton.
  assert.equal(app.rdvAgendaSuccession(Object.assign({}, d, { rendezVousSignature: '2026-11-05' }), 'notoriete', '2026-10-15'), null);
  const cartes = [];
  app.cartesEtapesSuccessionFiche(d, '2026-10-15', (col, c) => cartes.push(c));
  assert.match(cartes.find(c => c.cle === 'succession:notoriete').bouton.onclick, /placerRdvSuccessionAgenda\('s15', 'notoriete'\)/);
  assert.match(cartes.find(c => c.cle === 'succession:controleDroits').bouton.onclick, /ouvrirArbitrageDepuisFiche\('s15'\)/);

  // Arbitrage : rien d'enregistré tant que les deux simulations de droits manquent ; sinon le verdict et la saisie.
  assert.equal(app.arbitrageAEnregistrer({ droitsSans: '', droitsAvec: '5000' }, '2026-10-15T10:00:00Z', 'Bastien ANGLUMENT'), null);
  const a = app.arbitrageAEnregistrer({ droitsSans: '8000', droitsAvec: '5000', fraisOuverture: '300', prisee: '600', fraisCloture: '300', sermentNb: '1', sermentUnit: '240', trajetActif: false }, '2026-10-15T10:00:00Z', 'Bastien ANGLUMENT');
  assert.deepEqual([a.verdict, a.net, a.le, a.saisie.droitsSans], ['favorable', 1560, '2026-10-15', '8000']);
  assert.match(app.ligneArbitrageFiche(Object.assign({}, d, { succession: { arbitrage: a } })), /Intéressant pour le client.*Revoir l’arbitrage/);
});

test('vente : agenda et outils reliés à la fiche (placer le rendez-vous, provision, prorata, quotités…)', () => {
  const v = { id: 'v9', nom: 'MOREAU / LAMBERT', typeAffaire: 'vente', typeVente: 'copropriete', prixVente: 245000, prixMobilier: 5000, adresseBien: 'BLOIS (41000), 12 rue des Lices',
    parties: [{ role: 'VENDEUR', nom: 'Paul MOREAU' }, { role: 'ACQUEREUR', nom: 'Claire LAMBERT' }, { role: 'ACQUEREUR', nom: 'Marc LAMBERT' }], pieces: {} };
  const r = app.rdvAgendaVente(v, '2026-10-15');
  assert.equal(r.titre, 'VTE - MOREAU / LAMBERT');
  assert.ok(r.date >= '2026-10-15');
  assert.equal(app.rdvAgendaVente(Object.assign({}, v, { rendezVousSignature: '2026-11-20' }), '2026-10-15'), null);
  assert.equal(app.rdvAgendaVente(Object.assign({}, v, { roleNotaire: 'participant' }), '2026-10-15'), null);
  assert.deepEqual(Object.values(app.saisieProvisionDossier(v)).join('|'), '245000|5000|condo|41');
  assert.equal(app.outilsVenteFiche(v).map(o => o.cle).join(','), 'agenda,appel-fonds,calculateur,decompte-vendeur,prorata,quotites,resume,preemption');
  const place = app.outilsVenteFiche(Object.assign({}, v, { rendezVousSignature: '2026-11-20', parties: v.parties.slice(0, 2) }));
  assert.equal(place[0].libelle, 'Voir dans l’agenda');
  assert.ok(!place.some(o => o.cle === 'quotites'), 'un seul acquéreur : pas de quotités');
  assert.equal(app.outilsVenteFiche(base()).length, 0);

  // Provision gardée sur la fiche : rien sans prix ni département ; sinon le total du barème, assiette hors mobilier.
  assert.equal(app.provisionAEnregistrer({ prix: 0, dept: '41', type: 'condo' }, '2026-10-15T10:00:00Z', 'Bastien ANGLUMENT'), null);
  assert.equal(app.provisionAEnregistrer({ prix: 245000, dept: '', type: 'condo' }, '2026-10-15T10:00:00Z', ''), null);
  const p = app.provisionAEnregistrer({ prix: 245000, mobilier: 5000, dept: '41', type: 'condo', primo: false, residencePrincipale: true }, '2026-10-15T10:00:00Z', 'Bastien ANGLUMENT');
  const attendu = app.estimerFraisActe(240000, '41', 'condo', false);
  assert.deepEqual([p.total, p.assiette, p.le, p.par], [attendu.total, 240000, '2026-10-15', 'Bastien ANGLUMENT']);
  assert.match(app.ligneProvisionFiche(Object.assign({}, v, { provision: p })), /provision estimée le 15 octobre 2026/);
  assert.doesNotMatch(app.ligneProvisionFiche(Object.assign({}, v, { provision: p })), /Prix changé/);
  assert.match(app.ligneProvisionFiche(Object.assign({}, v, { prixVente: 250000, provision: p })), /Prix changé depuis/);
  assert.equal(app.ligneProvisionFiche(v), '');
  assert.equal(app.renderProvisionFondsFiche(v), '');
  assert.match(app.renderProvisionFondsFiche(Object.assign({}, v, { provision: p })), /ouvrirProvisionDepuisFiche\('v9'\)/);
});

test('relecture 15/10 : prénom composé, veuve héritière, montant de facture, scan sans type, rendez-vous de la déclaration', () => {
  const C = require('../commun/constitution');
  // Le fils « Jean-Pierre » n'est pas le père « Jean » ; « Jean-Pierre » et « Jean Pierre » restent la même personne.
  assert.equal(C.memePersonneNommee('Jean-Pierre DUPONT', 'DUPONT Jean'), false);
  assert.equal(C.memePersonneNommee('Marie-Claire DUPONT', 'DUPONT Marie'), false);
  assert.equal(C.memePersonneNommee('Jean-Pierre DUPONT', 'DUPONT Jean Pierre'), true);
  assert.equal(C.memePersonneNommee('DUPONT Jean-Pierre', 'Jean-Pierre DUPONT'), true);
  assert.equal(C.memePersonneNommee('Marie DUPONT', 'DUPONT Marie'), true);
  // Défunt « DUPONT Jean » : la fiche du fils lue en premier n'est pas prise pour la sienne.
  const d = base({ authentic: { comparants: [{ nom: 'DUPONT Jean', role: 'DEFUNT' }, { nom: 'DUPONT Jean-Pierre', role: 'HERITIER' }],
    fichesClients: { a: { nom: 'Jean-Pierre DUPONT', prenom: 'Jean-Pierre', nomFamille: 'DUPONT' }, b: { nom: 'Jean DUPONT', prenom: 'Jean', nomFamille: 'DUPONT', deces: { date: '2026-03-01' } } } } });
  assert.equal(C.defuntDepuisFiches(d).fiche.nom, 'Jean DUPONT');

  // Une héritière « veuve de » le défunt, ou « épouse de » lui : conjoint survivant.
  assert.equal(S.conjointSurvivant(base({ authentic: { comparants: [{ nom: 'DUPONT Jean', role: 'DEFUNT' }, { nom: 'DUPONT Marie', role: 'HERITIER', lien: 'Veuve de', conjoint: 'Monsieur DUPONT Jean' }] } })), true);
  assert.equal(S.conjointSurvivant(base({ authentic: { comparants: [{ nom: 'DUPONT Jean', role: 'DEFUNT' }, { nom: 'DUPONT Marie', role: 'HERITIER', lien: 'Épouse de', conjoint: 'Monsieur DUPONT Jean' }] } })), true);
  // L'épouse d'un AUTRE (un héritier marié ailleurs) n'en est pas une.
  assert.equal(S.conjointSurvivant(base({ authentic: { comparants: [{ nom: 'DUPONT Jean', role: 'DEFUNT' }, { nom: 'MARTIN Léa', role: 'HERITIER', lien: 'Épouse de', conjoint: 'Monsieur MARTIN Paul' }] } })), false);

  // Montant d'une facture corrigé à la main : les centimes restent.
  assert.equal(app.montantSaisiAppelFonds('1.234,56 €'), 1234.56);

  // Réponse du FCDDV scannée : nommée pour que la pièce « FCDDV » se coche (et soit lue).
  const fcddv = app.rangementScanSuccession({ page1: 'FICHIER CENTRAL DES DISPOSITIONS DE DERNIÈRES VOLONTÉS Réponse à l\'interrogation' }, null, []);
  assert.equal(fcddv.nomCible, 'Réponse FCDDV - Claire Scan');
  assert.match(fcddv.nomCible, S.PIECES_SUCCESSION.find(x => x.cle === 'fcddv').motifNom);

  // Déclaration de succession après la notoriété signée : la case « signature » est cochée (la fiche apprend le rendez-vous).
  const ds = base({ id: 's41', succession: { ouvertureLe: '2026-06-01', type: 'classique' }, echeancesValidees: { notoriete: true }, rendezVousSignature: '2026-07-10' });
  const r = app.rdvAgendaSuccession(ds, 'declarationSuccession', '2026-10-15');
  assert.equal(r.signature, true);
  // Le rendez-vous de la déclaration placé (après aujourd'hui) : plus rien à placer.
  assert.equal(app.rdvAgendaSuccession(Object.assign({}, ds, { rendezVousSignature: '2026-11-20' }), 'declarationSuccession', '2026-10-15'), null);
});

test('succession : plusieurs rendez-vous par dossier (étude 16/10), chacun à son étape, rien ne s\'écrase', () => {
  const d = base({ id: 's50', nom: 'SUCC LEFEBVRE', succession: { ouvertureLe: '2026-09-01', type: 'classique' } });
  // Une fiche d'avant : la date de signature seule devient un rendez-vous « acte », compté pour la notoriété.
  const ancien = Object.assign({}, d, { rendezVousSignature: '2026-10-20', rendezVousSignatureHeure: '10:00' });
  assert.equal(S.rendezVousSuccession(ancien).map(r => r.etape + ':' + r.date).join(','), 'acte:2026-10-20');
  assert.equal(S.etapesSuccession(ancien, '2026-10-16').find(e => e.type === 'notoriete').rdvPlace, true);

  // Ouverture, notoriété, un rendez-vous avec les héritiers et la déclaration : tous gardés, chacun à sa place.
  let x = d;
  [['ouvertureSuccession', '2026-09-01', '14:00'], ['notoriete', '2026-10-05', '10:00'], ['autre', '2026-10-28', '15:00'], ['declarationSuccession', '2026-12-10', '11:00']]
    .forEach(([etape, date, heure], i) => { x = Object.assign({}, x, { succession: Object.assign({}, x.succession, { rendezVous: app.rendezVousSuccessionAvecAjout(x, { id: 'r' + i, etape, titre: etape, date, heure, itemId: 'it' + i }) }) }); });
  assert.equal(S.rendezVousSuccession(x).length, 4);
  // Notoriété signée le 05/10 : la déclaration du 10/12 est le rendez-vous placé de sa carte, plus rien à placer.
  x.echeancesValidees = { notoriete: true };
  x.succession.notorieteSigneeLe = '2026-10-05';
  const decl = S.etapesSuccession(x, '2026-10-16').find(e => e.type === 'declarationSuccession');
  assert.deepEqual([decl.rdvPlace, decl.iso], [true, '2026-12-10']);
  assert.equal(app.rdvAgendaSuccession(x, 'declarationSuccession', '2026-10-16'), null);
  // Un rendez-vous « autre » se propose toujours (on peut en ajouter autant qu'il faut).
  assert.match(app.rdvAgendaSuccession(x, 'autre', '2026-10-16').titre, /SUCC - .* - Rendez-vous/);
  // La ligne de la fiche les montre tous, avec « Ajouter un rendez-vous ».
  const ligne = app.ligneRendezVousSuccessionFiche(x);
  assert.equal((ligne.match(/succ-rdv[ "]/g) || []).length, 4);
  assert.match(ligne, /placerRdvSuccessionAgenda\('s50', 'autre'\)/);
});

test('succession : rendez-vous suivis dans l\'agenda, titre « ? », signature de la fiche, carte en pointillé (relecture 16/10)', () => {
  const rdvs = [{ id: 'o', etape: 'ouvertureSuccession', date: '2026-09-01', heure: '14:00', itemId: 'IO' }, { id: 'n', etape: 'notoriete', date: '2099-01-10', heure: '10:00', itemId: 'IN' }];
  const d = base({ id: 's60', nom: 'SUCC PERRIN', succession: { ouvertureLe: '2026-09-01', rendezVous: rdvs } });
  // La date de signature = le prochain rendez-vous d'acte ; une ouverture seule n'en donne aucune.
  app.synchroniserSignatureSuccession(d);
  assert.deepEqual([d.rendezVousSignature, d.rdvAgendaItem.itemId], ['2099-01-10', 'IN']);
  const ouvSeule = base({ succession: { rendezVous: [rdvs[0]] } });
  app.synchroniserSignatureSuccession(ouvSeule);
  assert.equal(ouvSeule.rendezVousSignature, null);
  // Déplacé dans l'agenda (nouvel identifiant, nouveau titre) : la liste et la signature suivent.
  assert.equal(app.majRendezVousSuccessionAgenda(d, 'IN', { date: '2099-02-03', heure: '11:00', itemId: 'IN2', titre: 'SUCC - PERRIN - Notoriété' }), true);
  const n = S.rendezVousSuccession(d).find(r => r.id === 'n');
  assert.deepEqual([n.date, n.itemId, n.titre, d.rendezVousSignature, d.rdvAgendaItem.itemId], ['2099-02-03', 'IN2', 'SUCC - PERRIN - Notoriété', '2099-02-03', 'IN2']);
  // Supprimé (dernier acte) : plus de date de signature ; l'ouverture reste, sa date aussi.
  app.majRendezVousSuccessionAgenda(d, 'IN2', null);
  assert.deepEqual([S.rendezVousSuccession(d).length, d.rendezVousSignature, d.rdvAgendaItem, d.succession.ouvertureLe], [1, null, null, '2026-09-01']);
  // Fiche d'avant (date seule) : supprimée dans l'agenda, elle quitte la fiche.
  const ancien = base({ rendezVousSignature: '2099-03-01', rdvAgendaItem: { itemId: 'IA' } });
  app.majRendezVousSuccessionAgenda(ancien, 'IA', null);
  assert.equal(ancien.rendezVousSignature, null);
  // Un titre « ? » n'est jamais un acte (étude 07/10), même ouvert depuis la carte de la notoriété.
  assert.equal(app.etapeRendezVousSuccessionCree('notoriete', true, true), 'autre');
  assert.equal(app.etapeRendezVousSuccessionCree('', true, false), 'acte');
  assert.equal(app.etapeRendezVousSuccessionCree('', false, false), 'autre');
  assert.equal(app.etapeRendezVousSuccessionCree('ouvertureSuccession', false, true), 'ouvertureSuccession');
  // Carte en pointillé : pas de doublon d'un rendez-vous « SUCC … » d'Outlook (sans dossierId), reconnu par son identifiant.
  const s = base({ id: 's61', rendezVousSignature: '2099-04-01', rendezVousSignatureHeure: '10:00', rdvAgendaItem: { itemId: 'X1' } });
  assert.equal(app.signaturesHorsAgenda([s], [{ itemId: 'X1', date: '2099-04-01', dossierId: null }], ['2099-04-01']).length, 0);
  assert.equal(app.signaturesHorsAgenda([s], [], ['2099-04-01']).length, 1);
});

test('succession dans l\'agenda : pas de confrère ni de probabilité, lien visio aux héritiers (étude 16/10)', () => {
  const d = base({ id: 's70', nom: 'SUCC ROBIN', rendezVousSignature: '2099-05-04', parties: [
    { nom: 'Claire ROBIN', role: 'PARTIE', emails: ['claire.robin@exemple.fr'] }, { nom: 'Paul ROBIN', role: 'PARTIE' }] });
  const dest = app.destinatairesVisio(d, []);
  assert.equal(dest.map(p => `${p.role}:${p.email}:${p.coche}`).join('|'), 'heritier:claire.robin@exemple.fr:true|heritier::false|autre::false');
  assert.ok(!dest.some(p => p.confrere), 'jamais de confrère pour une succession');
  assert.equal(app.probabiliteEvenementAgenda(d, { signature: true, date: '2099-05-04' }, '2099-04-01', []), null);
  assert.equal(app.infosRendezVousDossier(d).confrere, '');
  assert.equal(S.etapeRendezVousSuccessionDepuisTitre('SUCC - ROBIN - Ouverture du dossier'), 'ouvertureSuccession');
  assert.equal(S.etapeRendezVousSuccessionDepuisTitre('SUCC - ROBIN - Déclaration de succession ?'), 'autre');
  assert.equal(S.etapeRendezVousSuccessionDepuisTitre('SUCC ROBIN - attestation immobilière'), 'acte');
});

test('agenda des successions : croix, « ? » retiré, journée entière, jaune, fiche d\'avant, doublons, lecture concurrente (relecture 16/10)', () => {
  const evt = (o) => Object.assign({ itemId: 'E1', date: '2099-06-10', heure: '10:00', sujet: 'SUCC - ROBIN - Notoriété', dossierId: 's80' }, o);
  // Croix : un rendez-vous écarté n'est jamais relevé de nouveau.
  const ecarte = base({ id: 's80', succession: { rendezVous: [], rendezVousEcartes: ['E1'] } });
  assert.equal(S.rendezVousSuccessionDepuisAgenda(ecarte, [evt()], '2099-06-01', '2099-12-01').ajoutes.length, 0);
  // « ? » retiré dans Outlook : l'étape lue dans le titre est relue.
  const prov = base({ id: 's80', succession: {} });
  const r1 = S.rendezVousSuccessionDepuisAgenda(prov, [evt({ sujet: 'SUCC - ROBIN - Notoriété ?' })], '2099-06-01', '2099-12-01');
  assert.equal(r1.liste[0].etape, 'autre');
  prov.succession.rendezVous = r1.liste;
  const r2 = S.rendezVousSuccessionDepuisAgenda(prov, [evt()], '2099-06-01', '2099-12-01');
  assert.equal(r2.liste[0].etape, 'notoriete');
  assert.equal(S.signatureSuccessionDepuisRendezVous(r2.liste, '2099-06-01').date, '2099-06-10');
  // Une étape choisie sur le poste (sans etapeAuto) n'est pas relue.
  const poste = base({ id: 's80', succession: { rendezVous: [{ id: 'p', etape: 'declarationSuccession', date: '2099-06-10', heure: '10:00', itemId: 'E1' }] } });
  assert.equal(S.rendezVousSuccessionDepuisAgenda(poste, [evt({ sujet: 'SUCC - ROBIN' })], '2099-06-01', '2099-12-01').liste[0].etape, 'declarationSuccession');
  // Journée entière et « ? » dans le lieu : jamais un acte.
  assert.equal(S.etapeEvenementSuccession(evt({ journeeEntiere: true, sujet: 'SUCC - ROBIN - butoir notoriété' })), 'autre');
  assert.equal(S.etapeEvenementSuccession(evt({ lieu: '?' })), 'autre');
  assert.equal(S.etapeRendezVousSuccessionDepuisTitre('SUCC - ROBIN - ouverture du testament'), 'autre');
  // Jaune « Annulé / à replacer » : gardé mais plus la date de signature.
  const r3 = S.rendezVousSuccessionDepuisAgenda(prov, [evt({ annule: true })], '2099-06-01', '2099-12-01');
  assert.equal(r3.liste[0].annule, true);
  assert.equal(S.signatureSuccessionDepuisRendezVous(r3.liste, '2099-06-01'), null);
  // Fiche d'avant (date seule) : le rendez-vous du même jour est adopté, pas doublé.
  const ancien = base({ id: 's80', rendezVousSignature: '2099-06-10' });
  const r4 = S.rendezVousSuccessionDepuisAgenda(ancien, [evt()], '2099-06-01', '2099-12-01');
  assert.equal(r4.liste.length, 1);
  assert.equal(r4.adoptes.length, 1);
  assert.equal(r4.liste[0].itemId, 'E1');
  // Même identifiant deux fois (fusion) : une seule entrée.
  const doublon = base({ id: 's80', succession: { rendezVous: [{ id: 'a', etape: 'acte', date: '2099-06-10', itemId: 'E1' }, { id: 'b', etape: 'acte', date: '2099-06-11', itemId: 'E1' }] } });
  assert.equal(S.rendezVousSuccession(doublon).length, 1);
  // Lecture plus ancienne qu'un geste du poste : ni retrait, ni retour à l'ancienne date, ni re-ajout d'un rendez-vous retiré.
  const fiche = base({ id: 's80', succession: { rendezVous: [{ id: 'n', etape: 'notoriete', date: '2099-06-12', heure: '11:00', itemId: 'NEUF' }] } });
  const r5 = S.rendezVousSuccessionDepuisAgenda(fiche, [], '2099-06-01', '2099-12-01', new Map());
  assert.equal(r5.retires.length, 0);
  const deplace = base({ id: 's80', succession: { rendezVous: [{ id: 'n', etape: 'notoriete', date: '2099-06-15', heure: '11:00', itemId: 'E1' }] } });
  const avant = new Map([['E1', S.empreinteRendezVousSuccession({ date: '2099-06-10', heure: '10:00', etape: 'notoriete', itemId: 'E1' })]]);
  assert.equal(S.rendezVousSuccessionDepuisAgenda(deplace, [evt()], '2099-06-01', '2099-12-01', avant).liste[0].date, '2099-06-15');
  const retire = base({ id: 's80', succession: { rendezVous: [] } });
  assert.equal(S.rendezVousSuccessionDepuisAgenda(retire, [evt()], '2099-06-01', '2099-12-01', avant).ajoutes.length, 0);
});

test('succession : décompte et appel de fonds 10 jours avant le dernier rendez-vous ; courriers de clôture d\'Authentic (étude 16/10)', () => {
  const auj = '2099-01-15';
  const d = base({ id: 's90', typeAffaire: 'succession', succession: { type: 'classique', ouvertureLe: '2099-01-02',
    rendezVous: [{ id: 'r', etape: 'declarationSuccession', date: '2099-06-20', heure: '10:00' }] }, echeancesValidees: { notoriete: true } });
  const types = S.etapesSuccession(d, auj).map(e => e.type);
  assert.ok(types.indexOf('decompteSuccession') < types.indexOf('declarationSuccession'));
  assert.ok(types.indexOf('appelFondsSuccession') === types.indexOf('declarationSuccession') - 1);
  const dec = S.etapesSuccession(d, auj).find(e => e.type === 'decompteSuccession');
  assert.equal(dec.iso, '2099-06-10');
  assert.ok(P.echeancesPlanning(d).some(e => e.type === 'appelFondsSuccession' && e.iso === '2099-06-10'));
  // Pas de rendez-vous placé : sans date.
  const sansRdv = base({ id: 's91', typeAffaire: 'succession', succession: { type: 'classique', ouvertureLe: '2099-01-02' } });
  assert.equal(S.etapesSuccession(sansRdv, auj).find(e => e.type === 'decompteSuccession').iso, '');
  // « Pas nécessaire » : plus d'appel de fonds.
  d.succession.appelFondsInutile = true;
  assert.ok(!S.etapesSuccession(d, auj).some(e => e.type === 'appelFondsSuccession'));
  // Coche : echeanceValidee suit.
  d.echeancesValidees.decompteSuccession = true;
  assert.equal(P.echeanceValidee(d, 'decompteSuccession'), true);
  // Notoriété seule : avant la notoriété.
  const noto = base({ id: 's92', typeAffaire: 'succession', succession: { type: 'notoriete' } });
  const tn = S.etapesSuccession(noto, auj).map(e => e.type);
  assert.ok(tn.indexOf('decompteSuccession') < tn.indexOf('notoriete'));
  // Courriers de clôture / transfert lus dans le tableau Banque d'Authentic.
  const capture = { tableaux: [{ titre: 'Banque', entete: ['Intitulé', 'Date', 'État'], lignes: [
    ['Lettre banque demande d’acompte', '02/10/2099', 'Mail le 03/10/2099'],
    ['Lettre banque clôture des comptes', '10/10/2099', 'Mail le 11/10/2099'],
    ['Courrier transfert des comptes au conjoint', '12/10/2099', '']] }] };
  const c = app.courriersBanqueSuccessionAuthentic(capture);
  assert.equal(c.map(x => `${x.nature}:${x.date}:${x.mailLe}`).join('|'), 'cloture:2099-10-10:2099-10-11|transfert:2099-10-12:');
  // Pas des courriers de clôture des comptes (relecture 16/10).
  const voisins = { tableaux: [{ titre: 'Courrier', entete: ['Intitulé', 'Date', 'État'], lignes: [
    ['Liquidation du régime matrimonial', '02/10/2099', ''], ['Transfert du dossier à Me X', '02/10/2099', ''],
    ['Demande de solde des comptes au jour du décès', '02/10/2099', ''], ['Demande de déblocage frais funéraires', '02/10/2099', ''],
    ['Clôture du dossier', '02/10/2099', '']] }] };
  assert.equal(app.courriersBanqueSuccessionAuthentic(voisins).length, 0);
});

test('Authentic : une page de succession sans dossier dans CLAIRE est proposée « à créer », comme une vente (étude 16/10)', () => {
  const page = (redaction) => ({ texte: [
    '1 - Mme DURAND Jeanne veuve de M. DURAND Pierre', 'Importer', 'Comparants (2)',
    'Mme DURAND Jeanne veuve de M. DURAND Pierre', 'Défunt', 'M. DURAND Marc', 'Héritier', 'Immeubles (0)'
  ].join('\n'), tableaux: redaction ? [{ titre: 'Rédaction', entete: ['Intitulé', 'Date', 'État'], lignes: redaction }] : [] });
  const intitule = 'Mme DURAND Jeanne veuve de M. DURAND Pierre';
  assert.equal(app.pageSuccessionAuthentic(page(), intitule), true);
  assert.equal(app.proposerCreationDossierAuthentic(page(), intitule), true);
  assert.equal(app.proposerCreationDossierAuthentic({ texte: '' }, 'SUCC DURAND'), true);
  // Tous les actes signés : une succession terminée qu'on consulte, rien à créer.
  assert.equal(app.proposerCreationDossierAuthentic(page([['Acte de notoriété', '01/02/2026', 'Signé le 01/02/2026']]), intitule), false);
  assert.equal(app.proposerCreationDossierAuthentic(page([['Acte de notoriété', '01/02/2026', 'Signé le 01/02/2026'], ['Déclaration de succession', '', 'Non rédigé']]), intitule), true);
  // Une page de vente reste une vente.
  assert.equal(app.pageSuccessionAuthentic({ texte: 'Comparants\nM. MARTEL Alexandre\nVendeur' }, 'VTE MARTEL / ROY'), false);
  // Le dossier de succession déjà créé est retrouvé par son nom (pas re-proposé).
  const d = base({ id: 's95', nom: 'Mme DURAND Jeanne veuve de M. DURAND Pierre' });
  assert.ok(app.scoreDossierAuthentic(intitule, '', d).score >= 6);
  assert.equal(app.scoreDossierAuthentic(intitule, '', base({ id: 's96', nom: 'SUCC LEROY' })).score, 0);
  // Nom raccourci ou « SUCC NOM » : retrouvé quand même (relecture 16/10).
  assert.equal(app.scoreDossierAuthentic(intitule, '', base({ id: 's97', nom: 'SUCC DURAND' })).score, 6);
  assert.equal(app.scoreDossierAuthentic(intitule, '', base({ id: 's98', nom: 'DURAND Pierre' })).score, 6);
  // Une page de vente ou de promesse au nom du défunt ne va jamais à la succession (un héritier qui vend la maison).
  assert.equal(app.scoreDossierAuthentic('Vente DURAND', '', base({ id: 's99', nom: 'DURAND' })).score, 0);
  assert.equal(app.scoreDossierAuthentic('DURAND Promesse', '', base({ id: 's99', nom: 'DURAND' })).score, 0);
  assert.equal(app.scoreDossierAuthentic('VTE DURAND - MARTIN', '', base({ id: 's99', nom: 'DURAND' })).score, 0);
  // Une vente au même nom n'est jamais retenue pour la page de succession.
  assert.equal(app.scoreDossierAuthentic(intitule, '', { id: 'v1', nom: 'DURAND / MARTIN', parties: [] }).score, 0);
});

test('Nouveau dossier d’une succession : défunt, héritiers, conjoint et type proposés d’Authentic ; la saisie gardée sur la fiche (étude 16/10)', () => {
  const donnees = { intitule: 'Mme DURAND Jeanne veuve de M. DURAND Pierre', type: 'succession', personnes: [
      { id: 'p1', nom: 'DURAND', prenom: 'Jeanne', civilite: 'Madame', deces: { date: '2026-09-01', lieu: '41000 BLOIS', pays: 'France' } },
      { id: 'p2', nom: 'DURAND', prenom: 'Marc', civilite: 'Monsieur', emails: ['marc.durand@exemple.fr'] }],
    immeubles: [{ id: 'i1', adresse: { texte: '1 rue des Lices 41000 Blois' }, parcelles: [{ section: 'AB', numero: '12' }] }],
    infosAuthentic: { comparants: [{ role: 'DEFUNT', nom: 'DURAND Jeanne', qualite: 'Défunt', lien: 'Veuve de' }, { role: 'HERITIER', nom: 'DURAND Marc', qualite: 'Héritier' }] } };
  const p = app.propositionWizardSuccession(donnees);
  assert.equal(p.defunt, 'Jeanne DURAND');
  assert.equal(p.decesDate, '2026-09-01');
  assert.equal(p.type, 'classique', 'bien immobilier : classique');
  assert.equal(p.conjoint, false, 'veuve : pas de conjoint survivant');
  assert.equal(p.heritiers.map(h => h.nom).join(','), 'Marc DURAND');
  assert.equal(`${p.prenoms}|${p.nom}`, 'Jeanne|DURAND');
  // Rien de changé : aucune correction sur la fiche, seulement l'ouverture.
  const d = { id: 'n1' };
  app.appliquerSaisieWizardSuccession(d, { prenoms: p.prenoms, nom: p.nom, decesDate: p.decesDate, decesLieu: p.decesLieu, conjoint: '', type: p.type, ouverture: '2026-10-20' }, p);
  assert.equal(d.defunt, undefined);
  assert.equal(JSON.stringify(d.succession), '{"ouvertureLe":"2026-10-20"}');
  // Corrections : gardées comme sur la fiche.
  const d2 = { id: 'n2' };
  app.appliquerSaisieWizardSuccession(d2, { prenoms: 'Jeanne Louise', nom: 'DURAND', decesDate: '2026-09-02', decesLieu: '', conjoint: 'oui', type: 'notoriete', ouverture: '' }, p);
  assert.equal(JSON.stringify(d2.defunt), '{"prenoms":"Jeanne Louise","decesDate":"2026-09-02"}');
  // Un champ vidé n'efface rien de ce qu'Authentic donne.
  const d3 = { id: 'n3' };
  app.appliquerSaisieWizardSuccession(d3, { prenoms: '', nom: 'DURAND', decesDate: p.decesDate, decesLieu: p.decesLieu, conjoint: '', type: p.type, ouverture: '' }, p);
  assert.equal(d3.defunt, undefined);
  assert.equal(d2.succession.conjointSurvivant, true);
  assert.equal(d2.succession.type, 'notoriete');
  // Récapitulatif.
  const lignes = app.lignesRecapSuccession({ prenoms: 'Jeanne', nom: 'DURAND', decesDate: '2026-09-01', decesLieu: 'BLOIS (41000)', conjoint: '', type: 'classique', ouverture: '' }, p);
  assert.equal(lignes.map(l => l.libelle).join('|'), 'Défunt|Décès|Héritiers|Conjoint survivant|Type de succession|Biens');
  const recap = app.lignesRecapWizard({ nom: 'SUCC DURAND', responsable: 'Julie VASSELIN', succession: true, lignesSuccession: lignes });
  assert.equal(recap[1].libelle, 'Défunt');
  assert.ok(!recap.some(l => /Vendeur|Prix|Notaires/.test(l.libelle)));
});

test('Nouveau dossier de succession : défunt = premier comparant recoupé avec le nom du dossier, bien principal = premier bien (étude 16/10)', () => {
  const texte = 'A 2026 00247 SUCC Jeanne DURAND veuve MARTIN\n1 - Succession Jeanne DURAND veuve MARTIN Importer\nComparants (2)\nMme DURAND Jeanne veuve de M. MARTIN Paul\nM. MARTIN Luc\nImmeubles (2)\n3 rue des Lilas 41000 BLOIS\nImmeuble propre\n8 route de Paris 41350 VINEUIL\nImmeuble commun\nTiers (0)';
  const premier = app.premierComparantAuthentic({ texte });
  assert.equal(premier.nom, 'DURAND Jeanne');
  assert.equal(premier.lien, 'Veuve de');
  assert.equal(app.premierImmeubleAuthentic({ texte }), '3 rue des Lilas 41000 BLOIS');
  const d = (nom, c) => ({ nom, authentic: { premierComparant: c } });
  assert.equal(app.premierComparantDefunt(d('Jeanne DURAND veuve MARTIN', premier)).nom, 'DURAND Jeanne');
  assert.equal(app.premierComparantDefunt(d('SUCC DURAND', premier)).role, 'DEFUNT', 'nom de famille seul dans le nom du dossier');
  // Le premier comparant n'est pas celui que le nom du dossier désigne : personne.
  assert.equal(app.premierComparantDefunt(d('Jeanne DURAND veuve MARTIN', { nom: 'MARTIN Luc', civilite: 'M' })), null, 'autre prénom');
  assert.equal(app.premierComparantDefunt(d('Paul LEROY', premier)), null, 'autre nom');
  // Proposition de l'assistant : défunt et bien principal.
  const p = app.propositionWizardSuccession({ intitule: 'SUCC Jeanne DURAND veuve MARTIN', type: 'succession', personnes: [], immeubles: [],
    infosAuthentic: { premierComparant: premier, premierImmeuble: '3 rue des Lilas 41000 BLOIS' } });
  assert.equal(p.nom, 'DURAND');
  assert.equal(p.prenoms, 'Jeanne');
  assert.equal(p.bienPrincipal, '3 rue des Lilas 41000 BLOIS');
  // Une qualité « Défunt » lue passe avant le premier de la liste.
  const p2 = app.propositionWizardSuccession({ intitule: 'SUCC Jeanne DURAND veuve MARTIN', type: 'succession', personnes: [], immeubles: [],
    infosAuthentic: { premierComparant: premier, comparants: [{ nom: 'MARTIN Paul', civilite: 'M', role: 'DEFUNT', qualite: 'Défunt' }] } });
  assert.equal(p2.nom, 'MARTIN');
});

test('Comparants collés dans un seul champ (page réelle, 16/10 ; noms inventés) : icônes retirées, qualité collée, rubrique coupée', () => {
  const lib = '4 - Succession Gérard PRADEL Importer avec 6e SENSSuccession Gérard PRADELComparants (3) personM. PRADEL Gérard veuf de Mme KOVAC ILIEVA MilenaDéfunt euro_symbol keyboard_arrow_up keyboard_arrow_down personMme PRADEL Sylvie épouse de M. BO';
  const cap = { champs: [{ groupe: '', libelle: lib, valeur: '' }], tableaux: [], texte: '' };
  const comps = app.comparantsAuthentic(cap);
  assert.equal(comps.map(c => c.role + ':' + c.nom).join('|'), 'DEFUNT:PRADEL Gérard|HERITIER:PRADEL Sylvie');
  assert.equal(comps[0].lien, 'Veuf de');
  assert.equal(comps[1].conjoint, undefined, 'conjoint coupé : pas gardé');
  assert.equal(app.premierComparantAuthentic(cap).nom, 'PRADEL Gérard');
  assert.equal(app.pageSuccessionAuthentic(cap, app.intituleDossierAuthentic(cap)), true);
  // Même rubrique dans le texte de la page, une cellule par ligne : entière.
  const texte = 'Succession Gérard PRADEL\nComparants (3)\npersonM. PRADEL Gérard veuf de Mme KOVAC ILIEVA Milena\nDéfunt\neuro_symbol\nkeyboard_arrow_up\nkeyboard_arrow_down\npersonMme PRADEL Sylvie épouse de M. BOREL Marc\nHéritier\npersonM. PRADEL Louis\nHéritier\nImmeubles (1)';
  assert.equal(app.comparantsAuthentic({ champs: [], texte }).map(c => c.role + ':' + c.nom).join('|'), 'DEFUNT:PRADEL Gérard|HERITIER:PRADEL Sylvie|HERITIER:PRADEL Louis');
  // Une vente au même format : vendeur / acquéreur lus.
  const vente = 'Comparants (2)\npersonM. MOREAU Paul\nVendeur\neuro_symbol\npersonMme LAMBERT Claire\nAcquéreur\nImmeubles (1)';
  assert.equal(app.comparantsAuthentic({ champs: [], texte: vente }).map(c => c.role + ':' + c.nom).join('|'), 'VENDEUR:MOREAU Paul|ACQUEREUR:LAMBERT Claire');
});

test('délais d’une succession : 1 et 2 mois depuis l’ouverture, 6 mois depuis le décès (étude 16/10)', () => {
  const base = { id: 's', nom: 'SUCC PRADEL', typeAffaire: 'succession', sansPret: true, parties: [], succession: { ouvertureLe: '2026-11-10', type: 'classique' } };
  const iso = (d, t) => (app.etapesSuccession(d, '2026-10-16').find(e => e.type === t) || {}).iso;
  const avecDeces = Object.assign({}, base, { defunt: { decesDate: '2026-08-20' } });
  assert.equal(iso(avecDeces, 'notoriete'), '2026-12-10', 'notoriété : 1 mois après l’ouverture');
  assert.equal(iso(avecDeces, 'controleDroits'), '2027-01-10', 'contrôle : 2 mois après l’ouverture');
  assert.equal(iso(avecDeces, 'declarationSuccession'), '2027-02-20', 'déclaration : 6 mois après le décès');
  // Décès lu sur la fiche client d'Authentic.
  const authentic = Object.assign({}, base, { authentic: { fichesClients: { a: { nom: 'Gérard PRADEL', deces: { date: '2026-07-31' } } } } });
  assert.equal(app.decesSuccession(authentic), '2026-07-31');
  assert.equal(iso(authentic, 'declarationSuccession'), '2027-01-31');
  // Sans date du décès : depuis l'ouverture, comme avant.
  assert.equal(iso(base, 'declarationSuccession'), '2027-05-10');
  // Notoriété + déclaration ensemble : entre 4 et 6 mois du décès.
  const ensemble = Object.assign({}, avecDeces, { succession: { ouvertureLe: '2026-11-10', type: 'notoriete-ds' } });
  const e = app.etapesSuccession(ensemble, '2026-10-16').find(x => x.type === 'notoriete');
  assert.equal(e.fenetreDebut + '|' + e.iso, '2026-12-20|2027-02-20');
});

test('une succession n’est pas une vente : alertes, statistiques, échanges (étude 16/10)', () => {
  const auj = '2026-10-16';
  const s = { id: 's', nom: 'Gérard PRADEL', typeAffaire: 'succession', sansPret: true, parties: [], pieces: {},
    defunt: { decesDate: '2026-04-20' }, succession: { ouvertureLe: '2026-09-26', type: 'classique', rendezVous: [{ id: 'r', etape: 'notoriete', date: '2026-10-21', heure: '10:00' }] },
    rendezVousSignature: '2026-10-21', rendezVousSignatureHeure: '10:00' };
  const titres = app.alertesImportantes([s], auj).map(a => a.titre + ' · ' + a.detail).join(' | ');
  assert.ok(!/appel de fonds et le projet|offre de prêt|préemption|SAFER/i.test(titres), titres);
  // Déclaration de succession à 6 mois du décès (20/10/2026) : date butoir dans 4 jours, rendez-vous à placer.
  assert.ok(/Placer le rendez-vous · Signature de l’attestation immobilière et de la déclaration de succession · date butoir/.test(titres), titres);
  // Statistiques des ventes : la succession n'y entre pas.
  assert.equal(app.statistiquesDelaisDossiers([Object.assign({ dateAvantContrat: '2026-09-01' }, s)], auj).signature.n, 0);
  assert.equal(app.comparaisonDossiersOuverts([Object.assign({ dateAvantContrat: '2026-10-01' }, s)], auj).mois.n, 0);
});

test('relecture 16/10 : icônes jamais coupées dans un mot, fiche décédée prioritaire, premier comparant remplacé en entier', () => {
  const vente = 'Comparants (2)\nM. MOREAU Paul\nVendeur\nSARL Credit Immobilier Acquéreur\nM. X Benedit\nAcquéreur\nImmeubles (1)';
  assert.equal(app.comparantsAuthentic({ champs: [], texte: vente }).map(c => c.role + ':' + c.nom).join('|'), 'VENDEUR:MOREAU Paul|ACQUEREUR:SARL Credit Immobilier|ACQUEREUR:X Benedit');
  // Le premier comparant (la veuve) ne passe pas devant la fiche décédée de son mari.
  const d = { nom: 'SUCC DURAND', typeAffaire: 'succession', authentic: { premierComparant: { nom: 'DURAND Jeanne', civilite: 'Mme', lien: 'Veuve de', conjoint: 'Monsieur DURAND Paul' },
    fichesClients: { p: { nom: 'Paul DURAND', prenom: 'Paul', nomFamille: 'DURAND', deces: { date: '2026-03-01' } } } } };
  const r = app.defuntDepuisFiches(d);
  assert.equal(r.fiche && r.fiche.nom, 'Paul DURAND');
  assert.equal(r.comparant, null);
  const f = app.fusionnerInfosAuthentic({ premierComparant: { nom: 'DURAND Jeanne', lien: 'Veuve de', conjoint: 'Monsieur MARTIN Paul' } }, { premierComparant: { nom: 'MARTIN Paul', civilite: 'M' } });
  assert.equal(JSON.stringify(f.premierComparant), JSON.stringify({ nom: 'MARTIN Paul', civilite: 'M' }));
});

test('fiche client d’un héritier nommé seulement dans les comparants : rattachée à la succession et ajoutée aux parties (étude 19/10)', () => {
  const d = base({ id: 's12', nom: 'SUCC - TESTARD Lucien', parties: [],
    authentic: { comparants: [{ role: 'DEFUNT', nom: 'TESTARD Lucien', qualite: 'Défunt' }, { role: 'HERITIER', nom: 'TESTARD Claire', qualite: 'Héritier' },
      { role: 'HERITIER', nom: 'MOREAU Anne', qualite: 'Héritier' }] } });
  // Fille sous son nom de naissance.
  assert.equal(app.roleClientAuthenticDansDossier(d, { nom: 'TESTARD', prenom: 'Claire' }), 'PARTIE');
  // Fille mariée : fiche au nom de naissance, comparant au nom d'usage.
  assert.equal(app.roleClientAuthenticDansDossier(d, { nom: 'TESTARD', prenom: 'Anne', nomUsage: 'MOREAU' }), 'PARTIE');
  // Personne étrangère au dossier, ou sans prénom : rien.
  assert.equal(app.roleClientAuthenticDansDossier(d, { nom: 'TESTARD', prenom: 'Paul' }), '');
  assert.equal(app.roleClientAuthenticDansDossier(d, { nom: 'TESTARD' }), '');
  const r = app.appliquerClientSuccession(d, { nom: 'TESTARD', prenom: 'Claire', civilite: 'Madame', emails: ['claire@exemple.fr'], telephones: ['06 11 22 33 44'] }, () => {}, { modifie: false }, '2026-10-19T09:00:00Z');
  assert.ok(r.modifie);
  assert.equal(d.parties.map(p => p.nom).join('|'), 'Claire TESTARD');
  assert.equal(d.parties[0].emails[0], 'claire@exemple.fr');
});

test('héritier des comparants : pas de doublon sous le nom d’usage, premier prénom exigé, jamais le défunt (relecture 19/10)', () => {
  const d = base({ id: 's13', nom: 'SUCC - TESTARD Lucien', parties: [{ nom: 'Nathalie BAZIN', role: 'PARTIE' }],
    authentic: { comparants: [{ role: 'DEFUNT', nom: 'TESTARD Lucien' }, { role: 'HERITIER', nom: 'TESTARD Nathalie' }, { role: 'HERITIER', nom: 'TESTARD Claire Marie' }] } });
  app.appliquerClientSuccession(d, { nom: 'TESTARD', prenom: 'Nathalie', nomUsage: 'BAZIN' }, () => {}, { modifie: false }, '2026-10-19T09:00:00Z');
  assert.equal(d.parties.map(p => p.nom).join('|'), 'Nathalie BAZIN');
  // « Marie TESTARD » n'est pas l'héritière « Claire Marie TESTARD » (premier prénom différent).
  assert.equal(app.roleClientAuthenticDansDossier(d, { nom: 'TESTARD', prenom: 'Marie' }), '');
  // Un homonyme vivant du défunt n'entre pas par les comparants.
  assert.equal(app.roleClientAuthenticDansDossier(d, { nom: 'TESTARD', prenom: 'Lucien' }), '');
});

test('bien retiré à la main d’une succession : Authentic ne le remet pas (étude 19/10)', () => {
  const d = base({ id: 's14', authentic: { biensRetires: [{ adresse: '', parcelles: ['AE0171'] }] } });
  const bien = { adresse: { texte: '1 rue de Chauchy 41320 LA CHAPELLE MONTMARTIN' }, parcelles: [{ section: 'AE', numero: '171' }, { section: 'AE', numero: '173' }] };
  assert.equal(app.bienRetireSuccession(d, bien), true);
  const r = app.appliquerBienSuccession(d, bien, () => {}, { modifie: false });
  assert.equal(r.modifie, false);
  assert.equal(((d.authentic && d.authentic.immeubles) || []).length, 0);
  // Un autre bien entre toujours.
  app.appliquerBienSuccession(d, { adresse: { texte: '5 rue Nationale 41700 COUR CHEVERNY' }, parcelles: [{ section: 'AB', numero: '12' }] }, () => {}, { modifie: false });
  assert.equal(d.authentic.immeubles.length, 1);
});

test('bien retiré : jamais remis par le complément depuis Authentic non plus (relecture 19/10)', () => {
  const d = base({ id: 's15', authentic: { biensRetires: [{ adresse: '', parcelles: ['AE0171'] }], immeubles: [] } });
  assert.equal(app.retenirImmeubleVenteAuthentic(d, { adresse: { texte: '1 rue X 41320 LA CHAPELLE' }, parcelles: [{ section: 'AE', numero: '171' }] }, false), false);
  assert.equal(d.authentic.immeubles.length, 0);
});

test('bien retiré depuis la liste aux parcelles en texte : clé gardée, Authentic ne le remet pas (relecture 19/10)', () => {
  const k = app.clesBienSuccession({ adresse: '', parcelles: 'AE 171, AE 173' });
  assert.equal(k.parcelles.join(','), 'AE0171,AE0173');
  const d = base({ id: 's16', authentic: { biensRetires: [k] } });
  assert.equal(app.bienRetireSuccession(d, { parcelles: [{ section: 'AE', numero: '171' }] }), true);
});

test('FCDDV : le fichier retrouvé par le parcours du NAS (clé des pièces) est celui que la fiche lit (étude 19/10)', () => {
  const d = base({ id: 's17', fichiersTrouves: { 'piece::fcddv': 'SUCC DURAND/Etat civil/FCDDV DURAND Paul.pdf' } });
  assert.equal(app.fichierFcddv(d), 'SUCC DURAND/Etat civil/FCDDV DURAND Paul.pdf');
  assert.equal(app.fichierFcddv(base({ id: 's18' })), null);
});

test('deux biens de communes différentes qui portent le même numéro de parcelle restent deux biens (étude 19/10)', () => {
  const D = require('../commun/donnees-dossier');
  const paris = { adresse: 'PARIS 17E ARRONDISSEMENT (75017), 37 rue Dulong', codePostal: '75017', type: 'copropriete', parcelles: [{ section: 'CJ', numero: '99', lieuDit: '37 rue Dulong' }] };
  // La maison avait reçu la parcelle du bien de Paris (adresse cadastrale : la rue de Paris).
  const maison = { adresse: 'COUR CHEVERNY (41700), 5 rue nationale', codePostal: '41700', type: 'maison', parcelles: [{ section: 'AK', numero: '221', lieuDit: '5 RUE NATIONALE' }, { section: 'CJ', numero: '99', lieuDit: '37 rue Dulong' }] };
  const d = base({ id: 's19', authentic: { immeubles: [paris, maison] } });
  const biens = D.biensDossier(d);
  assert.equal(biens.length, 2);
  assert.equal(biens.map(b => b.adresse + ' : ' + b.parcelles.map(p => p.section + p.numero).join(',')).join(' | '),
    'PARIS 17E ARRONDISSEMENT (75017), 37 rue Dulong : CJ99 | COUR CHEVERNY (41700), 5 rue nationale : AK221');
  // Le même numéro de parcelle, sans adresse cadastrale contraire, reste sur son bien.
  const autre = D.immeublesSansParcellesEgarees([paris, { adresse: 'BLOIS (41000), 2 rue X', parcelles: [{ section: 'CJ', numero: '99' }] }]);
  assert.equal(autre[1].parcelles.length, 1);
  // À la lecture d'une fiche bien : la parcelle de Paris ne rapproche pas la fiche de la maison.
  const s = base({ id: 's20', authentic: { immeubles: [{ adresse: maison.adresse, codePostal: '41700', parcelles: [{ section: 'AK', numero: '221' }, { section: 'CJ', numero: '99', lieuDit: '37 rue Dulong' }] }] } });
  app.appliquerBienSuccession(s, { adresse: { texte: '37 rue Dulong 75017 PARIS', codePostal: '75017', commune: 'PARIS' }, type: 'Appartement', parcelles: [{ section: 'CJ', numero: '99' }] }, () => {}, { modifie: false });
  assert.equal(s.authentic.immeubles.length, 2);
  assert.equal(s.authentic.immeubles[0].parcelles.map(p => p.section + p.numero).join(','), 'AK221');
});

test('bien retiré : une parcelle de même numéro dans une autre commune n’est pas le bien retiré (relecture 0.290.1)', () => {
  const paris = { adresse: 'PARIS 17E ARRONDISSEMENT (75017), 37 rue Dulong', codePostal: '75017', parcelles: [{ section: 'CJ', numero: '99' }] };
  const maison = { adresse: 'COUR CHEVERNY (41700), 5 rue nationale', codePostal: '41700', parcelles: [{ section: 'AK', numero: '221' }, { section: 'CJ', numero: '99' }] };
  const d = base({ id: 's21', authentic: { biensRetires: [app.clesBienSuccession(paris)] } });
  assert.equal(app.bienRetireSuccession(d, paris), true);
  assert.equal(app.bienRetireSuccession(d, maison), false);
});

test('fiche bien qui complète un bien par une parcelle : l’historique nomme ce bien (relecture 0.290.1)', () => {
  const d = base({ id: 's22', authentic: { immeubles: [
    { adresse: 'BLOIS (41000), 1 rue A', codePostal: '41000', parcelles: [{ section: 'AB', numero: '1' }] },
    { adresse: 'VINEUIL (41350), 2 rue B', codePostal: '41350', parcelles: [{ section: 'ZC', numero: '7' }] }] } });
  const notes = [];
  app.appliquerBienSuccession(d, { adresse: { texte: '', codePostal: '41000', commune: 'BLOIS' }, parcelles: [{ section: 'AB', numero: '1' }, { section: 'AB', numero: '3' }] }, (t) => notes.push(t), { modifie: false });
  assert.equal(d.authentic.immeubles.length, 2);
  assert.match(notes.join(' '), /complété\) : BLOIS/);
});

test('conjoint survivant lu dans le volet de la fiche du défunt : avec les héritiers (étude 19/10)', () => {
  const d = base({ id: 's23', nom: 'SUCC Philippe BARON', parties: [{ nom: 'Arnaud BARON', role: 'PARTIE' }, { nom: 'Marie BARON', role: 'PARTIE' }],
    authentic: { comparants: [{ nom: 'BARON Philippe', role: 'DEFUNT' }, { nom: 'BARON Arnaud', role: 'HERITIER' }, { nom: 'BARON Marie', role: 'HERITIER' }] } });
  // Le volet de l'épouse dans la fiche du défunt : sa situation nomme le défunt.
  const veuve = { nom: 'BARON', prenom: 'Zivka', civilite: 'Madame', situationMatrimoniale: { situation: 'Marié(e)', conjoint: 'Philippe BARON' } };
  assert.equal(app.conjointPartieDuDossierAuthentic(d, veuve), true);
  assert.equal(app.partieSuccessionDeLaFiche(d, veuve).nouvelle, true);
  // Divorcée, ou décédée : non.
  assert.equal(app.conjointPartieDuDossierAuthentic(d, Object.assign({}, veuve, { situationMatrimoniale: { situation: 'Divorcé(e)', conjoint: 'Philippe BARON' } })), false);
  assert.equal(app.conjointPartieDuDossierAuthentic(d, Object.assign({}, veuve, { deces: { date: '2020-01-01' } })), false);
  // Une fois partie, sa fiche retenue : avec les héritiers, « Conjoint survivant ».
  d.parties.push({ nom: 'Zivka BARON', role: 'PARTIE' });
  d.authentic.fichesClients = { zb: Object.assign({}, veuve, { nom: 'Zivka BARON' }) };
  const { heritiers, autres } = app.personnesSuccession(d);
  assert.equal(heritiers.map(h => h.nom + (h.qualite ? ' (' + h.qualite + ')' : '')).join(', '), 'Arnaud BARON, Marie BARON, Zivka BARON (Conjoint survivant)');
  assert.equal(autres.length, 0);
});

test('création d’une succession : le conjoint du volet de la fiche du défunt est repris (étude 19/10)', () => {
  const g = { succession: true, personnes: new Map([['p1', { nom: 'BARON', prenom: 'Philippe', deces: { date: '2026-03-14' } }]]) };
  assert.equal(app.conjointSurvivantAuthentic(g, { nom: 'BARON', prenom: 'Zivka', situationMatrimoniale: { situation: 'Marié(e)', conjoint: 'Philippe BARON' } }), true);
  assert.equal(app.conjointSurvivantAuthentic(Object.assign({}, g, { succession: false }), { nom: 'BARON', prenom: 'Zivka', situationMatrimoniale: { situation: 'Marié(e)', conjoint: 'Philippe BARON' } }), false);
  assert.equal(app.conjointSurvivantAuthentic(g, { nom: 'MARTIN', prenom: 'Léa', situationMatrimoniale: { situation: 'Marié(e)', conjoint: 'Paul MARTIN' } }), false);
});

test('pages d’Authentic : l’onglet et l’en-tête d’un même dossier forment un seul groupe (étude 19/10, BARON)', () => {
  const g = (intitule, reference, plus) => Object.assign({ intitule, reference, derniere: '', personnes: new Map(), immeubles: new Map(), documents: new Map(), infos: {} }, plus || {});
  const page = g('1 - Succession Philippe BARON', '', { infos: { comparants: [1] }, succession: true });
  const fiches = g('SUCC BARON Philippe', '', { personnes: new Map([['p1', { nom: 'BARON' }]]), immeubles: new Map([['b1', {}], ['b2', {}]]) });
  const vente = g('VTE BARON / MARTIN', '');
  const r = app.fusionnerGroupesAuthentic([page, fiches, vente]);
  assert.equal(r.length, 2);
  assert.equal(r[0].intitule, '1 - Succession Philippe BARON');
  assert.deepEqual([r[0].personnes.size, r[0].immeubles.size, r[0].succession], [1, 2, true]);
  // Même référence : réunis ; références différentes : jamais.
  assert.equal(app.fusionnerGroupesAuthentic([g('X', 'A 2026 00001'), g('Y', 'A 2026 00001')]).length, 1);
  assert.equal(app.fusionnerGroupesAuthentic([g('SUCC BARON', 'A 2026 00001'), g('Succession BARON', 'A 2026 00002')]).length, 2);
});

test('complément depuis Authentic d’une succession : chaque bien reste un bien (étude 19/10, BARON)', () => {
  const d = base({ id: 's24', nom: 'SUCC Philippe BARON', authentic: { immeubles: [] } });
  const im = (cp, commune, voie, section, numero) => ({ adresse: { texte: `${voie} ${cp} ${commune}`, codePostal: cp, commune }, parcelles: [{ section, numero }] });
  app.complementDossierDepuisAuthentic(d, { intitule: 'SUCC BARON', type: 'succession', personnes: [], immeubles: [
    im('41130', 'SELLES SUR CHER', 'Les Iles Bergues', 'ZM', '96'), im('41320', 'MENNETOU SUR CHER', 'Le Bourg', 'ZX', '113'), im('41200', 'ROMORANTIN LANTHENAY', '2 rue X', 'R', '340')] }, []);
  assert.equal(d.authentic.immeubles.length, 3);
  assert.equal(d.authentic.immeubles.map(i => i.parcelles.map(p => p.section + p.numero).join('+')).join(' | '), 'ZM96 | ZX113 | R340');
});

test('relecture 0.290.1 : volet du défunt dans la fiche de la veuve, groupes ambigus, côtés d’une vente', () => {
  const d = base({ id: 's25', nom: 'SUCC Philippe BARON', parties: [{ nom: 'Philippe BARON', role: 'PARTIE' }],
    authentic: { comparants: [{ nom: 'BARON Philippe', role: 'DEFUNT' }], fichesClients: {} } });
  // Le défunt vu dans le volet de la fiche de la veuve : jamais repris par ce volet.
  assert.equal(app.conjointPartieDuDossierAuthentic(d, { nom: 'BARON', prenom: 'Philippe', situationMatrimoniale: { situation: 'Marié(e)', conjoint: 'Zivka BARON' } }), false);
  // Fiche de la veuve déjà retenue : le volet ne la remplace pas.
  const veuve = { nom: 'BARON', prenom: 'Zivka', situationMatrimoniale: { situation: 'Marié(e)', conjoint: 'Philippe BARON' } };
  assert.equal(app.conjointPartieDuDossierAuthentic(d, veuve), true);
  d.authentic.fichesClients[app.cleFicheClientAuthentic(veuve)] = Object.assign({}, veuve, { domicile: 'X' });
  assert.equal(app.conjointPartieDuDossierAuthentic(d, veuve), false);
  // Création : seul le défunt (comparant « Défunt »), pas un enfant mort avant.
  const g = { succession: true, infos: { comparants: [{ nom: 'BARON Philippe', role: 'DEFUNT' }] },
    personnes: new Map([['p1', { nom: 'BARON', prenom: 'Philippe', deces: {} }], ['p2', { nom: 'BARON', prenom: 'Luc', deces: {} }]]) };
  assert.equal(app.conjointSurvivantAuthentic(g, { nom: 'DURAND', prenom: 'Anne', situationMatrimoniale: { situation: 'Marié(e)', conjoint: 'Luc BARON' } }), false);
  // Groupes : un onglet sans référence et deux dossiers des mêmes clients → rien n'est réuni ; côtés inversés → distincts.
  const gr = (intitule, reference, plus) => Object.assign({ intitule, reference, derniere: '', personnes: new Map(), immeubles: new Map(), documents: new Map(), infos: {} }, plus || {});
  const r = app.fusionnerGroupesAuthentic([gr('VTE DUPONT / MARTIN', '', { aCreer: true }), gr('2 - Vente DUPONT / MARTIN', 'A 2020 00001', { infos: { a: 1 } }), gr('2 - Vente DUPONT / MARTIN', 'A 2026 00002', { infos: { a: 1 } })]);
  assert.equal(r.length, 3);
  assert.equal(app.fusionnerGroupesAuthentic([gr('2 - VTE MARTIN / DUPONT', '', { infos: { a: 1 } }), gr('VTE DUPONT / MARTIN', '')]).length, 2);
  // Réunis : « à créer » dit par la page du dossier.
  const r2 = app.fusionnerGroupesAuthentic([gr('VTE DUPONT / MARTIN', '', { aCreer: true }), gr('2 - Vente DUPONT / MARTIN', 'A 2020 00001', { infos: { a: 1 }, aCreer: false })]);
  assert.deepEqual([r2.length, r2[0].aCreer], [1, false]);
});

test('Nouveau dossier d’une succession : fiches à ouvrir dans Authentic, cochées quand elles sont lues (étude 20/10)', () => {
  const d = { authentic: { comparants: [{ role: 'DEFUNT', nom: 'Mme MARTEL Jeanne' }], fichesClients: { a: { nom: 'Alain COSTE', prenom: 'Alain' } }, biensDossier: { nombre: 2 } } };
  const p = { defunt: 'Jeanne MARTEL', heritiers: [{ nom: 'Alain COSTE' }, { nom: 'Claude COSTE' }], biens: [{ adresse: 'BLOIS (41000), 15 rue de Touraine' }], bienPrincipal: '' };
  const l = app.pagesAOuvrirWizardSuccession(p, d);
  assert.equal(l.map(x => (x.recue ? '✓' : '○') + x.libelle).join(' | '),
    '○Fiche de Jeanne MARTEL (défunt) | ✓Fiche de Alain COSTE | ○Fiche de Claude COSTE | ✓Fiche du bien BLOIS (41000), 15 rue de Touraine | ○Fiche d’un autre bien');
  assert.equal(app.pagesAOuvrirWizardSuccession({ defunt: '', heritiers: [], biens: [], bienPrincipal: '41000 BLOIS, 2 rue Haute' }, {}).map(x => x.libelle).join(' | '),
    'Fiche du défunt | Fiche du bien 41000 BLOIS, 2 rue Haute');
});

test('FCDDV ADSN, seconde relecture : CEDEX suivi des noms, ville de plusieurs mots par l’annuaire, « Maître » entier, deux actes le même jour', () => {
  const debut = 'Le fichier central a enregistré les inscriptions suivantes : ';
  const cedex = app.analyseFcddv(debut + 'Acte du : 25/11/2009 NOTAIRE 9 AVENUE DE LA GARE 41250 BRACIEUX CEDEX MOREAU LEROUX Etude 41008 Compostage 2009120370349');
  assert.equal(cedex.inscriptions.map(i => `${i.notaire}|${i.ville}`).join(), 'MOREAU LEROUX|BRACIEUX');
  const maitre = app.analyseFcddv(debut + 'Acte du : 25/11/2009 Etude 41008 9 RUE HAUTE 41250 BRACIEUX Maître Jean Leroux Compostage 2009120370349');
  assert.equal(maitre.inscriptions.map(i => `${i.notaire}|${i.ville}`).join(), 'Jean Leroux|BRACIEUX');
  assert.equal(app.analyseFcddv(debut + 'Acte du : 29/01/2002 MOREAU NOTAIRE 9 AVENUE X 41000 BLOIS. Etude 41008 Compostage 2002020550563').inscriptions.map(i => `${i.notaire}|${i.ville}`).join(), 'MOREAU|BLOIS');
  assert.equal(app.analyseFcddv(debut + 'Acte du : 29/01/2002 NOTAIRE 9 AVENUE X 41000 BLOIS CEDEX 9 MOREAU Etude 41008 Compostage 2002020550563').inscriptions.map(i => `${i.notaire}|${i.ville}`).join(), 'MOREAU|BLOIS');
  app.carnetConfreres = [{ id: 'o', ville: 'Les Montils', email: 'office.41077@notaires.fr', notaires: ['Paul DURAND'] }];
  const montils = app.analyseFcddv(debut + 'Acte du : 02/03/2004 NOTAIRE 2 RUE HAUTE 41120 LES MONTILS DURAND Etude 41077 Compostage 2004030212345');
  assert.equal(montils.inscriptions.map(i => `${i.notaire}|${i.ville}`).join(), 'DURAND|LES MONTILS');
  app.carnetConfreres = [];
  // Deux actes de la même étude, le même jour : la correction de l'un ne passe pas à l'autre.
  const deux = debut + 'Acte du : 10/05/2012 PETIT NOTAIRE 1 RUE X 41000 BLOIS Etude 41050 Compostage 2012051011111 Acte du : 10/05/2012 PETIT NOTAIRE 1 RUE X 41000 BLOIS Etude 41050 Compostage 2012051022222';
  const d = base();
  app.appliquerFcddvSurDossier(d, app.analyseFcddv(deux), 'X', '2026-10-20T10:00:00Z');
  Object.assign(d.succession.fcddv.inscriptions[0], { nature: 'Testament olographe', demandeLe: '2026-10-20' });
  app.appliquerFcddvSurDossier(d, app.analyseFcddv(deux), 'X', '2026-10-21T10:00:00Z');
  assert.equal(d.succession.fcddv.inscriptions.map(i => `${i.nature}|${i.demandeLe}`).join(' ; '), 'Testament olographe|2026-10-20 ; Disposition de dernières volontés|');
});

test('Fiches à ouvrir : père et fils du même prénom jamais cochés l’un pour l’autre ; biens manquants plafonnés', () => {
  const pere = { authentic: { comparants: [{ role: 'DEFUNT', nom: 'M. DUPONT Jean Pierre' }, { role: 'HERITIER', nom: 'M. DUPONT Pierre' }], fichesClients: { a: { nom: 'Jean Pierre DUPONT', prenom: 'Jean Pierre', deces: { date: '2026-08-01' } } } } };
  const l = app.pagesAOuvrirWizardSuccession({ defunt: 'Jean Pierre DUPONT', heritiers: [{ nom: 'Pierre DUPONT' }], biens: [], bienPrincipal: '' }, pere);
  assert.equal(l.map(x => (x.recue ? '✓' : '○') + x.libelle).join(' | '), '✓Fiche de Jean Pierre DUPONT (défunt) | ○Fiche de Pierre DUPONT');
  const fils = { authentic: { comparants: [{ role: 'DEFUNT', nom: 'M. DUPONT Jean Pierre' }, { role: 'HERITIER', nom: 'M. DUPONT Jean' }], fichesClients: { b: { nom: 'Jean DUPONT', prenom: 'Jean' } } } };
  const lf = app.pagesAOuvrirWizardSuccession({ defunt: 'Jean Pierre DUPONT', heritiers: [{ nom: 'Jean DUPONT' }], biens: [], bienPrincipal: '' }, fils);
  assert.equal(lf.map(x => (x.recue ? '✓' : '○') + x.libelle).join(' | '), '○Fiche de Jean Pierre DUPONT (défunt) | ✓Fiche de Jean DUPONT', 'la fiche du fils coche le fils, pas le défunt');
  const beaucoup = app.pagesAOuvrirWizardSuccession({ defunt: '', heritiers: [], biens: [], bienPrincipal: '' }, { authentic: { biensDossier: { nombre: 40 } } });
  assert.equal(beaucoup.length, 7);
});

test('agenda 21/10 : titres NOTO / INVENTAIRE / SUCC seuls', () => {
  const S = require('../commun/succession');
  for (const t of ['NOTO Marie DUPONT', 'NOTORITE Marie DUPONT', 'NOTORIETE - Marie DUPONT', 'INVENTAIRE + NOTO Marie DUPONT', 'INVENTAIRE et NOTORIETE Marie DUPONT', 'INVENTAIRE et NOTO Marie DUPONT']) {
    assert.equal(S.etapeRendezVousSuccessionDepuisTitre(t), 'notoriete', t);
  }
  for (const t of ['SUCC - Marie DUPONT', 'SUCCESSION Marie DUPONT', 'SUCCESSION - Marie DUPONT', 'SUCC - Jean-Pierre MARTIN']) {
    assert.equal(S.etapeRendezVousSuccessionDepuisTitre(t), 'declarationSuccession', t);
  }
  assert.equal(S.etapeRendezVousSuccessionDepuisTitre('SUCC - Marie DUPONT ?'), 'autre');
  assert.equal(S.etapeRendezVousSuccessionDepuisTitre('SUCC - DUPONT - ouverture du testament'), 'autre');
});

test('agenda 21/10 : INVENTAIRE hors tête de titre et SUCC suivi de chiffres ne sont pas des actes', () => {
  const S = require('../commun/succession');
  assert.equal(S.etapeRendezVousSuccessionDepuisTitre('SUCC - DUPONT - Contrôle des droits et inventaire'), 'autre');
  assert.equal(S.etapeRendezVousSuccessionDepuisTitre('SUCC - DUPONT - Inventaire'), 'autre');
  assert.equal(S.etapeRendezVousSuccessionDepuisTitre('SUCC - Marie DUPONT 14h'), 'autre');
  assert.equal(S.etapeRendezVousSuccessionDepuisTitre('SUCC - Marie DUPONT (visite)'), 'autre');
  assert.equal(S.etapeRendezVousSuccessionDepuisTitre('SUCC - DUPONT - Notoriété'), 'notoriete');
});

test('timeline 21/10 : un acte ajouté dans Authentic n\'est pas une étape, son état reste lisible', () => {
  const d = base({ succession: { ouvertureLe: '2026-10-20' }, authentic: { actesSuccession: [{ intitule: 'ACT Attestation SUCC Claude SIMON T@', etat: 'en_cours' }] } });
  assert.ok(!S.etapesSuccession(d, '2026-10-21').some(x => String(x.type).startsWith('acte:')));
  assert.equal(S.actesSuccession(d).length > 0, true);
});

test('étude 21/10 : INVENTAIRE seul = contrôle des droits (rendez-vous à 2 mois), INVENTAIRE + NOTO = notoriété ; le projet suit le décompte', () => {
  assert.equal(S.etapeRendezVousSuccessionDepuisTitre('INVENTAIRE Marie DUPONT'), 'controleDroits');
  assert.equal(S.etapeRendezVousSuccessionDepuisTitre('INVENTAIRE + NOTO Marie DUPONT'), 'notoriete');
  assert.equal(S.etapeRendezVousSuccessionDepuisTitre('INVENTAIRE et NOTORIETE Marie DUPONT'), 'notoriete');
  const d = base({ succession: { ouvertureLe: '2026-10-20', rendezVous: [{ id: 'i', etape: 'controleDroits', date: '2026-12-15', heure: '10:00' }] } });
  const e = S.etapesSuccession(d, '2026-10-21');
  assert.deepEqual([e.find(x => x.type === 'controleDroits').iso, e.find(x => x.type === 'controleDroits').rdvPlace], ['2026-12-15', true]);
  // Un rendez-vous d'inventaire n'est pas une signature.
  assert.equal(S.signatureSuccessionDepuisRendezVous(S.rendezVousSuccession(d), '2026-10-21'), null);
  const ds = S.etapesSuccession(base({ succession: { ouvertureLe: '2026-10-20', type: 'notoriete-ds', rendezVous: [{ id: 'd', etape: 'declarationSuccession', date: '2027-03-10', heure: '10:00' }] } }), '2027-02-01');
  assert.deepEqual(['decompteSuccession', 'projetSuccession'].map(t => ds.find(x => x.type === t).iso), ['2027-02-28', '2027-02-28']);
  const noto = S.etapesSuccession(base({ succession: { ouvertureLe: '2026-10-20', type: 'notoriete' } }), '2027-02-01');
  assert.ok(!noto.some(x => x.type === 'projetSuccession' || x.type === 'decompteSuccession'));
});

test('étude 21/10 : personne ajoutée à la main à « Nouveau dossier » (conjointe survivante), gardée quand sa fiche est ouverte dans Authentic', () => {
  const exp = { intitule: 'SUCC MAILLARD Paul', type: 'succession', parties: [], immeubles: [],
    infosAuthentic: { comparants: [{ nom: 'MAILLARD Paul', role: 'DEFUNT' }, { nom: 'MAILLARD Lucie', role: 'HERITIER' }] },
    personnes: [] };
  const ajouts = [{ nom: 'Odile MAILLARD', qualite: 'Conjoint survivant' }];
  const avant = app.propositionWizardSuccession(exp, ajouts);
  assert.equal(avant.heritiers.map(h => h.nom + ':' + (h.qualite || '')).join('|'), 'Lucie MAILLARD:|Odile MAILLARD:Conjoint survivant');
  assert.equal(avant.conjoint, true);
  const apres = app.propositionWizardSuccession(Object.assign({}, exp, { personnes: [{ id: 'o', nom: 'MAILLARD', prenom: 'Odile', civilite: 'Madame', emails: ['odile@exemple.fr'], telephones: [] }] }), ajouts);
  assert.equal(apres.heritiers.map(h => h.nom + ':' + (h.qualite || '')).join('|'), 'Lucie MAILLARD:|Odile MAILLARD:Conjoint survivant');
  assert.equal(apres.conjoint, true);
  // Un héritier ajouté à la main.
  assert.equal(app.propositionWizardSuccession(exp, [{ nom: 'Hugo MAILLARD', qualite: 'Héritier' }]).heritiers.map(h => h.nom).join('|'), 'Lucie MAILLARD|Hugo MAILLARD');
  // À la création : la partie porte sa qualité, le conjoint survivant est gardé.
  const d = { parties: [], succession: {} };
  app.appliquerSaisieWizardSuccession(d, {}, { conjoint: true });
  assert.equal(d.succession.conjointSurvivant, true);
});

test('étude 21/10 : « INVENTAIRE + NOTO » = un seul rendez-vous pour l\'inventaire et la notoriété ; en deux temps, deux rendez-vous', () => {
  const un = S.etapesSuccession(base({ succession: { ouvertureLe: '2026-10-20', rendezVous: [{ id: 'a', etape: 'notoriete', titre: 'INVENTAIRE + NOTO Marie DUPONT', date: '2026-12-09', heure: '10:00' }] } }), '2026-10-21');
  assert.deepEqual([un.find(x => x.type === 'controleDroits').iso, un.find(x => x.type === 'notoriete').iso], ['2026-12-09', '2026-12-09']);
  const deux = S.etapesSuccession(base({ succession: { ouvertureLe: '2026-10-20', rendezVous: [
    { id: 'i', etape: 'controleDroits', titre: 'INVENTAIRE Marie DUPONT', date: '2026-12-09', heure: '10:00' },
    { id: 'n', etape: 'notoriete', titre: 'NOTO Marie DUPONT', date: '2027-01-12', heure: '10:00' }] } }), '2026-10-21');
  assert.deepEqual([deux.find(x => x.type === 'controleDroits').iso, deux.find(x => x.type === 'notoriete').iso], ['2026-12-09', '2027-01-12']);
});

test('étude 21/10 : après le contrôle des droits, l\'inventaire se place dans l\'agenda en orange (à l\'extérieur)', () => {
  const d = base({ id: 'inv', nom: 'SUCC Marie DUPONT', typeAffaire: 'succession', succession: { ouvertureLe: '2026-10-20' }, echeancesValidees: { controleDroits: true } });
  const r = app.rdvAgendaSuccession(d, 'controleDroits', '2026-11-05');
  assert.equal(r.typeRdv, 'confrere');
  assert.equal(r.signature, true);
  assert.match(r.titre, /Inventaire$/);
  // Itinéraire : depuis la maison du défunt (domicile de sa fiche), pour l'inventaire seulement.
  const avecDomicile = Object.assign({}, d, { defunt: { domicile: 'SAINT-AIGNAN (41110), 2 rue des Cours' } });
  assert.equal(app.adresseInventaireSuccession(avecDomicile, 'controleDroits'), '2 rue des Cours, 41110 SAINT-AIGNAN');
  assert.equal(app.adresseInventaireSuccession(avecDomicile, 'notoriete'), '');
  assert.equal(app.adresseInventaireSuccession(d, 'controleDroits'), '');
  // Déjà un rendez-vous placé : plus de bouton.
  const place = base({ id: 'inv2', nom: 'SUCC Marie DUPONT', typeAffaire: 'succession', succession: { ouvertureLe: '2026-10-20', rendezVous: [{ id: 'i', etape: 'controleDroits', date: '2026-12-09', heure: '10:00' }] } });
  assert.equal(app.rdvAgendaSuccession(place, 'controleDroits', '2026-11-05'), null);
});

test('conjoint survivant : l’appel de fonds est dû (on transfère les fonds, peu en comptabilité), non facultatif ; héritiers seuls : facultatif', () => {
  const d = base({ biens: [{ adresse: 'X' }], succession: { type: 'notoriete-ds', conjointSurvivant: true, ouvertureLe: '2026-08-15',
    rendezVous: [{ id: 'a', etape: 'declarationSuccession', titre: 'SUCC DURAND', date: '2026-12-10', heure: '10:00' }] } });
  const types = S.etapesSuccession(d, '2026-10-22').map(e => e.type);
  assert.ok(types.includes('decompteSuccession'));
  assert.ok(types.includes('appelFondsSuccession'));
  assert.equal(S.etapesSuccession(d, '2026-10-22').find(e => e.type === 'appelFondsSuccession').facultatif, false);
  d.succession.conjointSurvivant = false;
  assert.equal(S.etapesSuccession(d, '2026-10-22').find(e => e.type === 'appelFondsSuccession').facultatif, true);
});

test('actes d’Authentic « ACT Déclaration Succ … » et « ACT Attestation Succ … T@ » rapprochés des actes de base (22/10)', () => {
  assert.equal(S.acteBaseDepuisIntitule('ACT Déclaration Succ Joël RASQUIER'), 'declaration');
  assert.equal(S.acteBaseDepuisIntitule('ACT Attestation Succ Joël RASQUIER T@'), 'attestation');
  assert.equal(S.acteBaseDepuisIntitule('ACT Attestation immobilière RASQUIER'), 'attestation');
  assert.equal(S.acteBaseDepuisIntitule('ACT Délivrance de legs RASQUIER'), '');
  assert.equal(S.acteBaseDepuisIntitule('ACT Attestation de vente RASQUIER'), '');
  assert.equal(S.acteBaseDepuisIntitule('ACT Vente API'), '');
});

test('« À faire » : décompte, projet et appel de fonds d’une succession ne sortent qu’une fois (tâche), pas aussi comme alerte', () => {
  const d = base({ biens: [{ adresse: 'X' }], responsable: 'Bastien ANGLUMENT', succession: { type: 'notoriete-ds', ouvertureLe: '2026-08-15',
    rendezVous: [{ id: 'a', etape: 'declarationSuccession', titre: 'SUCC DURAND', date: '2026-10-31', heure: '14:00' }] }, rendezVousSignature: '2026-10-31' });
  const titres = app.actionsDuJour([d], '2026-10-22').actions.map(a => a.titre);
  assert.equal(titres.filter(t => /décompte/.test(t)).length, 1);
  assert.equal(titres.filter(t => /projet/.test(t)).length, 1);
});

test('« SUCC - … (NOTO API DS PARTAGE) » : un seul rendez-vous pour la notoriété, l’attestation et la déclaration — tous les actes signés à sa date', () => {
  const titre = 'SUCC - Christian VIEL (NOTO API DS PARTAGE)';
  assert.equal(S.etapeRendezVousSuccessionDepuisTitre(titre), 'declarationSuccession');
  assert.equal(S.etapeRendezVousSuccessionDepuisTitre('SUCC - Christian VIEL (NOTO API DS PARTAGE) ?'), 'autre', 'provisoire');
  assert.equal(S.titreToutEnsembleSuccession('SUCC - Marie DURAND (DS NOTO PAI)'), true, 'ordre libre, PAI accepté');
  assert.equal(S.titreToutEnsembleSuccession('SUCC - Marie DURAND (NOTO DS)'), true, 'NOTO + DS : tout le même jour');
  assert.equal(S.titreToutEnsembleSuccession('SUCC - Marie DURAND (NOTO API)'), true, 'NOTO + API');
  assert.equal(S.titreToutEnsembleSuccession('SUCC - Marie DURAND (API DS)'), false, 'sans notoriété : pas « tout »');
  assert.equal(S.etapeRendezVousSuccessionDepuisTitre('SUCC - Marie DURAND (API DS)'), 'declarationSuccession');
  const d = base({ biens: [{ adresse: 'X' }], succession: { type: 'classique', ouvertureLe: '2026-08-15',
    rendezVous: [{ id: 'a', etape: 'declarationSuccession', titre, date: '2026-12-10', heure: '10:00' }] } });
  const avant = S.etapesSuccession(d, '2026-11-20');
  const noto = avant.find(e => e.type === 'notoriete'), ds = avant.find(e => e.type === 'declarationSuccession');
  assert.equal(noto.iso, '2026-12-10'); assert.equal(noto.fait, false); assert.equal(noto.rdvPlace, true, 'la notoriété prend aussi ce rendez-vous');
  assert.equal(ds.iso, '2026-12-10'); assert.equal(ds.fait, false);
  const apres = S.etapesSuccession(d, '2026-12-11');
  const n2 = apres.find(e => e.type === 'notoriete'), d2 = apres.find(e => e.type === 'declarationSuccession');
  assert.equal(n2.fait, true); assert.equal(n2.iso, '2026-12-10');
  assert.equal(d2.fait, true); assert.equal(d2.iso, '2026-12-10');
});

test('rendez-vous « NOTO API DS » redevenu provisoire (étape « autre ») : plus aucun acte signé par lui', () => {
  const d = base({ biens: [{ adresse: 'X' }], succession: { type: 'classique', ouvertureLe: '2026-08-15',
    rendezVous: [{ id: 'a', etape: 'autre', titre: 'SUCC - Christian VIEL (NOTO API DS PARTAGE)', date: '2026-12-10', heure: '10:00' }] } });
  assert.equal(S.etapesSuccession(d, '2026-12-11').find(e => e.type === 'notoriete').fait, false);
});

test('rendez-vous « NOTO API DS » : le jour même, l’acte n’est signé qu’une fois l’heure passée', () => {
  const d = (heure) => base({ biens: [{ adresse: 'X' }], succession: { type: 'classique', ouvertureLe: '2026-08-15',
    rendezVous: [{ id: 'a', etape: 'declarationSuccession', titre: 'SUCC - Christian VIEL (NOTO API DS PARTAGE)', date: '2026-12-10', heure }] } });
  // Date du jour simulée (pas celle d'aujourd'hui à Paris) : le jour du rendez-vous compte comme passé.
  assert.equal(S.etapesSuccession(d('10:00'), '2026-12-10').find(e => e.type === 'notoriete').fait, true);
  // Horloge injectée : 10 h 30 à Paris (CEST = UTC+2) le 10/12/2026 (hiver : UTC+1 → 09:30 UTC).
  const h = new Date('2026-12-10T09:30:00Z');
  assert.equal(S.rendezVousPasse({ date: '2026-12-10', heure: '10:00' }, '2026-12-10', h), true, 'heure passée');
  assert.equal(S.rendezVousPasse({ date: '2026-12-10', heure: '10:31' }, '2026-12-10', h), false, 'heure pas encore passée');
  assert.equal(S.rendezVousPasse({ date: '2026-12-10', heure: '' }, '2026-12-10', h), true, 'sans heure');
});

test('actesSignesSuccession : notoriété signée mais déclaration à venir = pas terminé ; tout signé = terminé avec le nom des actes (étude 23/10)', () => {
  const noto = S.actesSignesSuccession(base({ succession: { type: 'notoriete-ds', notorieteSigneeLe: '2026-09-15' }, echeancesValidees: { notoriete: true } }), '2026-10-10');
  assert.equal(noto.complet, false);
  assert.equal(noto.libelle, 'Notoriété');
  assert.equal(noto.restants.map((x) => x.label).join(','), 'DS');
  const classique = S.actesSignesSuccession(base({ succession: { type: 'classique', notorieteSigneeLe: '2026-09-15' }, echeancesValidees: { notoriete: true } }), '2026-10-10');
  assert.equal(classique.restants.map((x) => x.label).join(','), 'API et DS');
  const seule = S.actesSignesSuccession(base({ succession: { type: 'notoriete', notorieteSigneeLe: '2026-09-15' }, echeancesValidees: { notoriete: true } }), '2026-10-10');
  assert.equal(seule.complet, true);
  assert.equal(seule.iso, '2026-09-15');
  const tout = S.actesSignesSuccession(base({ succession: { type: 'notoriete-ds', notorieteSigneeLe: '2026-09-15', declarationSigneeLe: '2026-09-20' }, echeancesValidees: { notoriete: true, declarationSuccession: true } }), '2026-10-10');
  assert.equal(tout.complet, true);
  assert.equal(tout.libelle, 'Notoriété + DS');
  assert.equal(tout.iso, '2026-09-20');
  // Dans le Suivi : la notoriété seule signée d'un dossier à DS n'est pas « Acte signé » ; le dossier terminé dit son acte.
  assert.equal(app.signatureFaiteSuivi(base({ succession: { type: 'notoriete-ds', notorieteSigneeLe: '2026-09-15' }, echeancesValidees: { notoriete: true } })), null);
  assert.equal(app.signatureFaiteSuivi(base({ succession: { type: 'notoriete', notorieteSigneeLe: '2026-09-15' }, echeancesValidees: { notoriete: true } })).actes, 'Notoriété');
});

test('libellé de l’acte d’un rendez-vous de succession', () => {
  assert.equal(S.libelleActeRendezVousSuccession('notoriete', false, true), 'Notoriété');
  assert.equal(S.libelleActeRendezVousSuccession('declarationSuccession', false, true), 'API et DS');
  assert.equal(S.libelleActeRendezVousSuccession('declarationSuccession', false, false), 'DS');
  assert.equal(S.libelleActeRendezVousSuccession('notoriete', true, false), 'Notoriété + DS');
  assert.equal(S.libelleActeRendezVousSuccession('acte', false, false), 'Acte à préciser');
});

test('succession non terminée : un rendez-vous passé ne la rend pas « signée » (étude 23/10)', () => {
  const d = base({ succession: { type: 'notoriete-ds', notorieteSigneeLe: '2026-09-15' }, echeancesValidees: { notoriete: true }, rendezVousSignature: '2026-09-15' });
  assert.equal(app.dateSignatureDossier(d, '2026-10-20'), '');
});

test('dossier de succession repris d’Authentic : la référence qui apparaît ou un intitulé relevé autrement restent le même dossier (étude 23/10)', () => {
  const k = (intitule) => app.cleDossierWizardSuccession({ intitule });
  assert.equal(k('12 - Succession LEBLOND Pierre'), k('Succession Pierre LEBLOND'));
  assert.equal(k('SUCC LEBLOND Pierre'), k('3 - SUCC Pierre LEBLOND'));
  assert.notEqual(k('Succession LEBLOND Pierre'), k('Succession DURAND Marie'));
  assert.equal(k('???'), '???', 'sans nom lisible : l’intitulé tel quel');
});

test('succession (étude 28/10) : la liste des pièces faite des demandes d’Authentic, cochées à leur retour ; panneau Authentic résumé', () => {
  const lignes = [
    { titre: 'ECV - Acte de naissance - DUPONT Jean', etat: 'Réponse positive', date: '2026-10-01', dates: ['2026-10-01', '2026-10-05'], tableau: 'Etat civil' },
    { titre: 'ECV - Acte de naissance - DUPONT Anne', etat: 'Envoyé', date: '2026-10-01', dates: ['2026-10-01'], tableau: 'Etat civil' },
    { titre: 'APR - Lettre à la banque EXEMPLE', etat: 'Envoyé', date: '2026-09-20', dates: ['2026-09-20'], tableau: 'Banque' },
    { titre: 'APR - Caisse de retraite ESSAI', etat: 'Retour le 10/10/2026', date: '2026-09-21', dates: ['2026-09-21', '2026-10-10'], tableau: 'Demande' },
    { titre: 'ACT Acte de notoriété', etat: 'Non rédigé', date: '2026-10-02', dates: ['2026-10-02'], tableau: 'Rédaction' }
  ];
  const ds = app.demandesSuccessionDepuisLignes(lignes);
  const liste = Object.values(ds);
  assert.equal(liste.length, 4, 'jamais un acte du tableau Rédaction');
  assert.equal(liste.filter((x) => x.cleBase === 'actesNaissance').length, 2);
  assert.equal(liste.find((x) => /banque/i.test(x.libelle)).etat, 'attente', 'un courrier envoyé à la banque reste à cocher');
  assert.equal(liste.find((x) => /retraite/i.test(x.libelle)).etat, 'recue');
  const d = { id: 's1', nom: 'DUPONT', typeAffaire: 'succession', pieces: {}, historique: [], authentic: { demandesSuccession: ds },
    piecesPersonnalisees: [{ cle: 'perso-authentic-acte-de-naissance-dupont-jean', label: 'Acte de naissance - DUPONT Jean' }] };
  const cles = app.checklistPieces(undefined, d).map((p) => p.label);
  assert.ok(cles.includes('Lettre à la banque EXEMPLE') && cles.includes('Caisse de retraite ESSAI'), 'les demandes deviennent des lignes');
  assert.ok(cles.includes('Actes de naissance') && !cles.some((l) => /DUPONT Jean/.test(l)), 'naissance rattachée à la pièce de base, plus en double');
  const notes = [];
  assert.equal(app.cocherPiecesSuccessionAuthentic(d, d.authentic, (t) => notes.push(t), '2026-10-28T10:00:00Z'), true);
  const cleRetraite = Object.keys(ds).find((k) => /retraite/.test(k));
  assert.equal(d.pieces[cleRetraite], 'recue');
  assert.notEqual(d.pieces.actesNaissance, 'recue', 'un des deux actes de naissance n’est pas revenu');
  assert.match(app.etatDemandeSuccessionPiece(d, { cle: 'actesNaissance' }).texte, /1\/2 revenue/);
  assert.match(app.etatDemandeSuccessionPiece(d, { cle: Object.keys(ds).find((k) => /banque/.test(k)) }).texte, /demandée le/);
  // Panneau Authentic : résumé et seulement ce qui attend depuis longtemps ou a échoué.
  const r = app.resumeFormalitesAT({ formalitesPrealables: [
    { badge: 'ECV', libelle: 'a', statut: 'Réponse positive', dates: ['2026-10-01'] },
    { badge: 'ECV', libelle: 'b', statut: 'Réponse négative', dates: ['2026-10-01'] },
    { badge: 'APR', libelle: 'c', statut: 'Envoyé', dates: ['2026-08-01'] },
    { badge: 'APR', libelle: 'd', statut: 'Envoyé', dates: ['2026-10-25'] }] }, '2026-10-28');
  assert.equal(`${r.total}|${r.recues}|${r.attente}|${r.aSurveiller.map((f) => f.libelle).join('')}`, '4|1|2|bc');
});

test('relecture 0.394.0 : demandes de même libellé, même acte en Comedec et en papier, document déposé, pas des pièces, états trompeurs', () => {
  const l = (titre, etat, tableau = 'Demande') => ({ titre, etat, date: '2026-10-01', dates: ['2026-10-01'], tableau });
  const ds = app.demandesSuccessionDepuisLignes([
    l("APR - Interrogation d'une Banque", 'Mail le 01/10/2026'), l("APR - Interrogation d'une Banque", 'Mail le 01/10/2026'), l("APR - Interrogation d'une Banque", 'Retour le 05/10/2026'),
    l('ECV - Acte de décès - X', 'Réponse positive', 'Etat civil'), l('APR - Acte de décès - X', 'Envoyé', 'Courrier'),
    l('Acte de mariage - X', '', 'Etat civil'),
    l("Lettre banque demande d'acompte", 'Envoyé'), l('Matrice de courrier libre (sans intervenant)', ''),
    l('APR - Livret A EXEMPLE', 'Envoyé', 'Banque'), l('APR - Caisse ESSAI', 'En attente de réponse')]);
  const liste = Object.values(ds);
  assert.equal(liste.filter((x) => /Interrogation/.test(x.libelle)).length, 3, 'trois banques = trois demandes');
  assert.equal(new Set(Object.keys(ds)).size, liste.length);
  const deces = liste.filter((x) => /décès/.test(x.libelle));
  assert.equal(deces.length, 1, 'un même acte en Comedec et en papier = une demande');
  assert.equal(deces[0].etat, 'recue', 'le meilleur état gagne, quel que soit l’ordre');
  assert.equal(liste.find((x) => /mariage/.test(x.libelle)).etat, 'recue', 'un document déposé sans état est reçu');
  assert.ok(!liste.some((x) => /acompte|Matrice/.test(x.libelle)), 'ni une demande d’acompte ni une matrice de courrier');
  assert.equal(liste.find((x) => /Livret A/.test(x.libelle)).cleBase, '', '« Livret A » n’est pas le livret de famille');
  assert.equal(liste.find((x) => /Caisse/.test(x.libelle)).etat, 'attente', '« En attente de réponse » n’est pas reçu');
  assert.equal(app.etatLigneDemandeAuthentic('Non reçu'), 'attente');
  assert.equal(app.etatLigneDemandeAuthentic('indéterminé'), 'attente');
  // Une ancienne pièce perso cochée compte dans « x/n revenues ».
  const d = { typeAffaire: 'succession', pieces: { 'perso-authentic-acte-de-naissance-y': 'recue' },
    piecesPersonnalisees: [{ cle: 'perso-authentic-acte-de-naissance-y', label: 'Acte de naissance - Y' }],
    authentic: { demandesSuccession: { 'dem-a': { libelle: 'Acte de naissance - Y', cleBase: 'actesNaissance', etat: 'attente' }, 'dem-b': { libelle: 'Acte de naissance - Z', cleBase: 'actesNaissance', etat: 'attente' } } } };
  assert.match(app.etatDemandeSuccessionPiece(d, { cle: 'actesNaissance' }).texte, /1\/2/);
});
