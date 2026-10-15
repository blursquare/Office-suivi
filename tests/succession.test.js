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
