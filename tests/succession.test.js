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
    'ouvertureSuccession:2026-10-20::actif|notoriete:2026-11-20::actif|controleDroits:2026-12-20::actif|deblocageFonds:::|receptionFonds:::|declarationSuccession:2027-04-20::actif');
  assert.match(e.find(x => x.type === 'declarationSuccession').label, /attestation immobilière et de la déclaration de succession/);
  // Notoriété seule : pas de déclaration de succession.
  assert.ok(!S.etapesSuccession(base({ succession: { ouvertureLe: '2026-10-20' } }), '2026-10-15').some(x => x.type === 'declarationSuccession'));
  // Ouverture passée : faite.
  assert.ok(S.etapesSuccession(d, '2026-10-21')[0].fait);
});

test('notoriété : date butoir à 1 mois, remplacée par le rendez-vous placé ; notoriété + DS : les deux actes ensemble, entre 4 et 6 mois', () => {
  const seule = S.etapesSuccession(base({ succession: { ouvertureLe: '2026-10-20' } }), '2026-10-15').find(x => x.type === 'notoriete');
  assert.deepEqual([seule.iso, seule.butoir, seule.rdvPlace], ['2026-11-20', true, false]);
  const placee = S.etapesSuccession(base({ succession: { ouvertureLe: '2026-10-20' }, rendezVousSignature: '2026-11-12' }), '2026-10-15').find(x => x.type === 'notoriete');
  assert.deepEqual([placee.iso, placee.butoir, placee.rdvPlace], ['2026-11-12', false, true]);
  const ds = base({ succession: { ouvertureLe: '2026-10-20', actifSuperieurSeuil: true } });
  const e = S.etapesSuccession(ds, '2026-10-15');
  const n = e.find(x => x.type === 'notoriete');
  assert.match(n.label, /notoriété et de la déclaration de succession/);
  assert.deepEqual([n.iso, n.fenetreDebut, n.butoir], ['2027-04-20', '2027-02-20', true]);
  assert.ok(!e.some(x => x.type === 'declarationSuccession'));
  const c = app.cartesTableauFiche(Object.assign({ id: 'sd' }, ds), '2026-10-15', []);
  assert.match(c.faire.find(x => x.cle === 'succession:notoriete').sous, /^Entre le .+ et le .+ — date butoir, à confirmer par le rendez-vous/);
  // Déclaration signée dans Authentic : les deux actes sont faits.
  assert.ok(S.etapesSuccession(Object.assign({}, ds, { authentic: { actesSuccession: [{ intitule: 'Déclaration de succession', etat: 'signe', signeLe: '2027-03-01' }] } }), '2027-03-02').find(x => x.type === 'notoriete').fait);
});

test('après la notoriété signée : déblocage des fonds puis réception ; avec un conjoint survivant, transfert des comptes', () => {
  const d = base({ succession: { ouvertureLe: '2026-10-01', notorieteSigneeLe: '2026-11-04' }, echeancesValidees: { notoriete: true } });
  const e = S.etapesSuccession(d, '2026-11-10');
  const deb = e.find(x => x.type === 'deblocageFonds');
  assert.deepEqual([deb.iso, deb.active, deb.fait], ['2026-11-04', true, false]);
  assert.equal(e.find(x => x.type === 'receptionFonds').active, false);
  // Conjoint survivant : déduit de « Épouse de » sur le défunt, ou coché.
  const c = S.etapesSuccession(base({ defunt: { conjointLien: 'Époux de' }, echeancesValidees: { notoriete: true } }), '2026-11-10');
  assert.ok(c.some(x => x.type === 'transfertComptes') && !c.some(x => x.type === 'deblocageFonds'));
  assert.ok(!S.conjointSurvivant(base({ defunt: { conjointLien: 'Veuve de' } })));
  assert.ok(S.conjointSurvivant(base({ succession: { conjointSurvivant: true } })));
});

test('acte de notoriété signé dans Authentic : fait, sans coche ; planning et echeanceValidee le suivent', () => {
  const d = base({ succession: { ouvertureLe: '2026-10-01' }, authentic: { actesSuccession: [{ intitule: 'Notoriété', etat: 'signe', signeLe: '2026-10-28' }] } });
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
  assert.ok(!['faire', 'attente', 'fait'].some(col => c[col].some(x => /appel de fonds|projet|prêt/i.test(x.titre))));
  const ouverte = base({ id: 's3', biens: [{ adresse: 'X' }], succession: { ouvertureLe: '2026-10-01' } });
  const c2 = app.cartesTableauFiche(ouverte, '2026-10-15', []);
  assert.ok(c2.fait.some(x => x.cle === 'succession:ouvertureSuccession'));
  const noto = c2.faire.find(x => x.cle === 'succession:notoriete');
  assert.match(noto.sous, /À réunir : Acte de décès/);
  assert.ok(c2.attente.some(x => x.cle === 'succession:deblocageFonds'));
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
  assert.match(html, /Héritiers <span class="hint">· 1<\/span>/);
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
  assert.equal(app.outilsVenteFiche(v).map(o => o.cle).join(','), 'agenda,appel-fonds,calculateur,prorata,quotites,preemption');
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
