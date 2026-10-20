'use strict';

// Acte de prêt et DOD (étude 20/10) : qui rédige l'acte de prêt, qui envoie la déclaration d'origine des deniers, ce que dit le
// sous-dossier « prêt » d'Authentic. Dossiers inventés.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const app = chargerApplication();
const NOTRE = 'Maître Sophie GOSSART (BLOIS)';
const CONFRERE = 'Maître Paul DURAND (TOURS)';
const base = (extra) => Object.assign({
  id: 'p1', nom: 'MARTEL / FOURNIER', garantiesPret: ['hypothequeLegale'], offrePretStatut: 'recue',
  roleNotaire: 'instrumentaire', notaireVendeur: NOTRE, notaireAcquereur: NOTRE, historique: []
}, extra);
const types = (d) => app.tachesActePret(d, '2026-10-21').map(t => t.type).join(',');

test('hypothequesPret : seules les hypothèques comptent, la légale d’abord — ni caution ni sans garantie', () => {
  assert.equal(app.hypothequesPret(base({ garantiesPret: ['caution'] })).length, 0);
  assert.equal(app.hypothequesPret(base({ garantiesPret: ['sansGarantie'] })).length, 0);
  assert.equal(app.hypothequesPret(base({ garantiesPret: ['hypothequeConventionnelle', 'hypothequeLegale', 'caution'] })).map(h => h.cle).join(','), 'hypothequeLegale,hypothequeConventionnelle');
  assert.equal(app.hypothequesPret(base({ sansPret: true })).length, 0);
});

test('circuitActePret : seul notaire = dans l’acte de vente ; confrère de l’acquéreur = DOD attendue ; participation = nous rédigeons', () => {
  assert.equal(app.circuitActePret(base()).mode, 'dans-acte');
  assert.equal(app.circuitActePret(base({ notaireAcquereur: CONFRERE })).mode, 'attendu');
  assert.equal(app.circuitActePret(base({ roleNotaire: 'participant', notaireVendeur: CONFRERE })).mode, 'redige');
  // Participation côté vendeur : l’acquéreur est celui du confrère qui reçoit l’acte, rien pour nous.
  assert.equal(app.circuitActePret(base({ roleNotaire: 'participant', notaireAcquereur: CONFRERE })), null);
  assert.equal(app.circuitActePret(base({ garantiesPret: ['caution'] })), null);
  assert.equal(app.circuitActePret(base({ typeAffaire: 'succession' })), null);
});

test('tachesActePret : participation → acte de prêt puis DOD à envoyer ; confrère de l’acquéreur → DOD à réclamer ; seul → rien', () => {
  const part = base({ roleNotaire: 'participant', notaireVendeur: CONFRERE, emailConfrereVendeur: 'confrere@example.org' });
  assert.equal(types(part), 'actePret,dodEnvoi');
  const dod = app.tachesActePret(part, '2026-10-21')[1];
  assert.equal(dod.geste.type, 'dod');
  assert.equal(dod.geste.sens, 'envoi');
  assert.equal(types(base()), '');
  const attendu = base({ notaireAcquereur: CONFRERE, emailNotaireParticipant: 'acq@example.org' });
  assert.equal(types(attendu), 'dodAttendue');
  assert.equal(app.tachesActePret(attendu, '2026-10-21')[0].geste.sens, 'demande');
  assert.equal(types(Object.assign({}, attendu, { dodDemandeeLe: '2026-10-20' })), '', 'demandée : plus rien à faire');
  assert.equal(types(Object.assign({}, attendu, { dodRecueLe: '2026-10-20' })), '');
  // Sans email du confrère : la tâche ouvre la fiche.
  assert.equal(app.tachesActePret(base({ roleNotaire: 'participant', notaireVendeur: CONFRERE }), '2026-10-21')[1].geste.type, 'fiche');
});

test('tachesActePret : l’acte de prêt commencé (Authentic) ou noté fait retire sa tâche, la DOD envoyée la sienne', () => {
  const part = base({ roleNotaire: 'participant', notaireVendeur: CONFRERE, emailConfrereVendeur: 'c@example.org' });
  const enCours = Object.assign({}, part, { authentic: { pret: { etat: 'redaction', libelle: 'Acte de prêt en cours de rédaction', vuLe: '2026-10-20' } } });
  assert.equal(types(enCours), 'dodEnvoi');
  assert.equal(types(Object.assign({}, part, { actePretLe: '2026-10-20' })), 'dodEnvoi');
  const pasRedige = Object.assign({}, part, { authentic: { pret: { etat: 'a_rediger', libelle: 'Acte de prêt pas encore rédigé', vuLe: '2026-10-20' } } });
  assert.equal(types(pasRedige), 'actePret,dodEnvoi');
  assert.equal(types(Object.assign({}, enCours, { dodEnvoyeeLe: '2026-10-20' })), '');
  assert.equal(types(Object.assign({}, part, { archive: true })), '');
});

test('actionsDuJour : les tâches de l’acte de prêt y figurent', () => {
  const part = base({ roleNotaire: 'participant', notaireVendeur: CONFRERE, emailConfrereVendeur: 'c@example.org' });
  const r = app.actionsDuJour([part], '2026-10-21');
  assert.equal(r.actions.map(a => a.type).filter(t => /^(actePret|dodEnvoi)$/.test(t)).join(','), 'actePret,dodEnvoi');
});

test('sousDossierAuthentic : le sous-dossier « Prêt » est reconnu', () => {
  const page = (entete) => ({ texte: `A 2026 00017 VTE MARTEL / FOURNIER\n${entete} Importer avec 6e SENS\nComparants (2)\n` });
  assert.equal(app.sousDossierAuthentic(page('4 - Prêt MARTEL / FOURNIER')), 'pret');
  assert.equal(app.sousDossierAuthentic(page('4 - Acte de prêt FOURNIER')), 'pret');
  assert.equal(app.sousDossierAuthentic(page('2 - VTE MARTEL / FOURNIER')), 'vente');
  assert.equal(app.sousDossierAuthentic(page('5 - Prétendu accord')), 'autre');
});

test('lireActePretAuthentic : « Non rédigé », « En cours », « Signé le » du sous-dossier prêt', () => {
  const tableau = (etat) => ({ texte: '', champs: [], tableaux: [{ titre: 'Rédaction', entete: ['Document', 'Date', 'État'], lignes: [['Acte de prêt', '', etat]] }] });
  assert.equal(app.lireActePretAuthentic(tableau('Non rédigé')).etat, 'a_rediger');
  assert.equal(app.lireActePretAuthentic(tableau('En cours')).etat, 'redaction');
  const signe = app.lireActePretAuthentic({ texte: 'Acte de prêt\nSigné le 12/10/2026', champs: [], tableaux: [] });
  assert.equal(signe.etat, 'signe');
  assert.equal(signe.date, '2026-10-12');
  assert.equal(app.lireActePretAuthentic({ texte: 'rien', champs: [], tableaux: [] }), null);
});

test('appliquerActePretAuthentic : retenu une fois, historique, jamais sans lecture', () => {
  const d = base({ roleNotaire: 'participant', notaireVendeur: CONFRERE });
  const lu = { etat: 'redaction', libelle: 'Acte de prêt en cours de rédaction', date: '' };
  assert.equal(app.appliquerActePretAuthentic(d, null, '2026-10-21'), false);
  assert.equal(app.appliquerActePretAuthentic(d, lu, '2026-10-21'), true);
  assert.equal(d.authentic.pret.etat, 'redaction');
  assert.equal(d.historique.length, 1);
  assert.equal(app.appliquerActePretAuthentic(d, lu, '2026-10-22'), false, 'même état : rien de neuf');
  assert.equal(d.authentic.pret.vuLe, '2026-10-22');
  assert.equal(d.historique.length, 1);
  assert.equal(app.appliquerActePretAuthentic(d, { etat: 'signe', libelle: 'Acte de prêt signé', date: '2026-10-30' }, '2026-10-30'), true);
});

test('ligneActePretFonds et pastillesHypothequeEntete : la légale en pastille pleine près du prix, rien sans hypothèque', () => {
  assert.equal(app.ligneActePretFonds(base()).texte, 'Rédigé dans l’acte de vente');
  assert.match(app.ligneActePretFonds(base({ roleNotaire: 'participant', notaireVendeur: CONFRERE })).texte, /À faire rédiger par l’office · DOD à envoyer/);
  assert.match(app.ligneActePretFonds(base({ notaireAcquereur: CONFRERE, dodRecueLe: '2026-10-20' })).texte, /DOD reçue le/);
  const html = app.pastillesHypothequeEntete(base({ garantiesPret: ['caution', 'hypothequeLegale'] }));
  assert.match(html, /garantie-forte/);
  assert.match(html, /Hypothèque légale/);
  assert.doesNotMatch(html, /Caution/);
  assert.equal(app.pastillesHypothequeEntete(base({ garantiesPret: ['caution'] })), '');
});

test('construireEmailDod : au notaire instrumentaire (envoi) ou au confrère de l’acquéreur (demande)', () => {
  const d = base({ nom: 'MARTEL / FOURNIER' });
  const envoi = app.construireEmailDod(d, 'envoi');
  assert.match(envoi.sujet, /^DOD — /);
  assert.match(envoi.corps, /ci-joint la déclaration d’origine des deniers/);
  const demande = app.construireEmailDod(d, 'demande');
  assert.match(demande.corps, /Pouvez-vous nous adresser votre déclaration d’origine des deniers/);
  assert.doesNotMatch(envoi.corps + demande.corps, /Sauf erreur/i);
});
