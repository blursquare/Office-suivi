'use strict';

// Tâches du jour (étude 22/10, client/104-taches-affaire.js) : étapes et factures des successions, choix Tout / Ventes / Successions.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app');

const AUJ = '2026-10-22';
const succ = (extra) => Object.assign({ id: 's1', nom: 'SUCC LEROY', typeAffaire: 'succession', sansPret: true, responsable: 'Julie VASSELIN', biens: [{ adresse: 'X' }],
  parties: [{ role: 'PARTIE', nom: 'LEROY', prenom: 'Hélène' }], succession: { type: 'classique', ouvertureLe: '2026-09-25' }, historique: [], echeancesValidees: {} }, extra);

test('filtre Tout / Ventes / Successions', () => {
  const app = chargerApplication();
  const actions = [{ cle: 'a', dossier: { id: 'v', nom: 'VTE X' } }, { cle: 'b', dossier: { id: 's', typeAffaire: 'succession', nom: 'SUCC Y' } }];
  assert.equal(app.filtrerActionsParAffaire(actions, 'tout').length, 2);
  assert.equal(app.filtrerActionsParAffaire(actions, 'vente').map(a => a.cle).join(), 'a');
  assert.equal(app.filtrerActionsParAffaire(actions, 'succession').map(a => a.cle).join(), 'b');
  assert.equal(app.filtrerActionsParAffaire(actions, 'n’importe quoi').length, 2);
});

test('étapes d’une succession : tâche à l’approche de la date, jamais le FCDDV, rien pour une vente', () => {
  const app = chargerApplication();
  const d = succ({ succession: { type: 'classique', ouvertureLe: '2026-09-25', rendezVous: [{ id: 'r', etape: 'notoriete', titre: 'NOTO LEROY', date: '2026-10-26', heure: '10:00' }] } });
  const types = app.tachesEtapesSuccession(d, AUJ).map(t => t.type);
  assert.ok(types.includes('notoriete'), types.join());
  assert.ok(!types.includes('fcddv'));
  const loin = succ({ succession: { type: 'classique', ouvertureLe: '2026-09-25', rendezVous: [{ id: 'r', etape: 'notoriete', titre: 'NOTO LEROY', date: '2026-12-20', heure: '10:00' }] } });
  assert.ok(!app.tachesEtapesSuccession(loin, AUJ).some(t => t.type === 'notoriete'), 'trop loin : pas encore une tâche');
  assert.equal(app.tachesEtapesSuccession({ id: 'v', nom: 'VTE X' }, AUJ).length, 0);
  assert.equal(app.tachesEtapesSuccession(Object.assign({}, d, { archive: true }), AUJ).length, 0);
});

test('comptes et fonds : tâches dès la notoriété signée (transfert avec conjoint, déblocage sinon)', () => {
  const app = chargerApplication();
  const signee = { notoriete: true };
  const heritiers = succ({ echeancesValidees: signee });
  assert.ok(app.tachesEtapesSuccession(heritiers, AUJ).some(t => t.type === 'deblocageFonds'));
  const conjoint = succ({ echeancesValidees: signee, succession: { type: 'classique', ouvertureLe: '2026-09-25', conjointSurvivant: true } });
  const t = app.tachesEtapesSuccession(conjoint, AUJ).map(x => x.type);
  assert.ok(t.includes('transfertComptes') && !t.includes('deblocageFonds'), t.join());
  const faite = succ({ echeancesValidees: { notoriete: true, deblocageFonds: true } });
  assert.ok(app.tachesEtapesSuccession(faite, AUJ).some(x => x.type === 'receptionFonds'), 'fonds débloqués : vérifier la réception');
});

test('factures à régler : une tâche par facture non réglée, clé unique', () => {
  const app = chargerApplication();
  const d = succ({ succession: { type: 'classique', ouvertureLe: '2026-09-25', factures: [
    { id: 'f1', organisme: 'EDF', montant: 120.5, recueLe: '2026-10-20', regleeLe: '' },
    { id: 'f2', organisme: 'Orange', montant: 30, recueLe: '2026-10-21', regleeLe: '' },
    { id: 'f3', organisme: 'Eau', montant: 10, recueLe: '2026-10-01', regleeLe: '2026-10-05' }] } });
  const t = app.tachesFacturesSuccession(d);
  assert.equal(t.length, 2);
  assert.notEqual(t[0].cle, t[1].cle);
  assert.ok(t[0].titre.startsWith('Régler la facture'), t[0].titre);
  assert.equal(t[0].type, 'factureSuccession');
  assert.equal(app.tachesFacturesSuccession({ id: 'v', nom: 'VTE X' }).length, 0);
});

test('actionsDuJour : les tâches de succession y figurent (étapes, factures)', () => {
  const app = chargerApplication();
  const d = succ({ echeancesValidees: { notoriete: true }, succession: { type: 'classique', ouvertureLe: '2026-09-25', factures: [{ id: 'f1', organisme: 'EDF', montant: 50, recueLe: '2026-10-20', regleeLe: '' }] } });
  const { actions } = app.actionsDuJour([d], AUJ);
  const types = actions.map(a => a.type);
  assert.ok(types.includes('factureSuccession') && types.includes('deblocageFonds'), types.join());
  assert.ok(app.TYPES_TACHES_ETAPES_SUCCESSION.every(t => !types.includes('fcddv') && t !== 'fcddv'));
});

test('thèmes : chaque type de tâche a sa colonne, le reste « À décider », les colonnes vides gardées', () => {
  const app = chargerApplication();
  assert.equal(app.themeTache({ type: 'redaction' }), 'rediger');
  assert.equal(app.themeTache({ type: 'pret' }), 'relances');
  assert.equal(app.themeTache({ type: 'appelFonds' }), 'avant');
  assert.equal(app.themeTache({ type: 'receptionFonds' }), 'avant');
  assert.equal(app.themeTache({ type: 'questionnaire' }), 'apres');
  assert.equal(app.themeTache({ type: 'factureSuccession' }), 'apres');
  assert.equal(app.themeTache({ type: 'point-droit-de-preemption' }), 'decider');
  const g = app.regrouperTachesParTheme([{ type: 'pret' }, { type: 'pret' }, { type: 'copieActe' }]);
  assert.equal(g.map(x => x.theme.cle + ':' + x.actions.length).join(), 'rediger:0,relances:2,avant:0,apres:1,decider:0');
});

test('outil lié : l’appel de fonds d’une vente ouvre l’outil prérempli, pas pour une succession ni une relance', () => {
  const app = chargerApplication();
  const vente = { id: 'v1', nom: 'VTE X' };
  const o = app.outilDeTache({ type: 'appelFonds', dossier: vente });
  assert.equal(o.cle, 'appel-fonds');
  assert.ok(o.onclick.includes('preparerAppelFondsDepuisDossier') && o.onclick.includes('v1'));
  assert.equal(app.outilDeTache({ type: 'appelFondsSuccession', dossier: { id: 's', typeAffaire: 'succession', nom: 'SUCC Y' } }), null);
  assert.equal(app.outilDeTache({ type: 'pret', dossier: vente }), null);
  assert.equal(app.outilDeTache({ type: 'point-x', categorieLabel: 'Droit de préemption', dossier: vente }).cle, 'preemption');
});

test('colonnes : une carte par tâche avec case ronde, geste et outil ; la colonne « À décider » seulement si utile', () => {
  const app = chargerApplication();
  const dossier = { id: 'v1', nom: 'MARTIN / DUPONT', historique: [], pieces: {} };
  const html = app.renderTachesColonnes([{ cle: 'v1:appelFonds', type: 'appelFonds', titre: 'Envoyer l’appel de fonds', categorie: 'appelFonds', categorieLabel: 'Envoi appel de fonds', jours: 3, dossier, geste: { type: 'appelFonds' } }]);
  assert.ok(html.includes('tf-taches-colonnes') && html.includes('Avant la signature'));
  assert.ok(html.includes("marquerFaitJour('v1:appelFonds')"));
  assert.ok(!html.includes('preparerAppelFondsDepuisDossier'), 'le geste de l’appel de fonds ouvre déjà l’outil : pas d’icône en double');
  assert.ok(html.includes("executerActionJour('v1:appelFonds')"));
  assert.ok(!html.includes('À décider'), 'pas de colonne vide « À décider »');
  assert.ok(app.renderTachesColonnes([{ cle: 'v1:point-x', type: 'point-x', titre: 'Décider', categorieLabel: 'À décider', jours: 1, dossier, geste: { type: 'fiche' } }]).includes('À décider'));
});

test('relecture 0.318 : pas de tâche de notoriété sans rendez-vous placé, plus d’étape une fois le questionnaire envoyé', () => {
  const app = chargerApplication();
  const sansRdv = succ({ succession: { type: 'classique', ouvertureLe: '2026-09-25' } });
  assert.ok(!app.tachesEtapesSuccession(sansRdv, AUJ).some(t => t.type === 'notoriete'), 'date butoir seule : l’alerte « placer le rendez-vous » suffit');
  const close = succ({ questionnaireSuccessionEnvoyeLe: '2026-10-20', echeancesValidees: { notoriete: true } });
  assert.equal(app.tachesEtapesSuccession(close, AUJ).length, 0);
});

test('les tâches traitées suivent le choix Tout / Ventes / Successions (progression, fête)', () => {
  const app = chargerApplication();
  const v = { id: 'v1', nom: 'VTE X' }; const s = { id: 's1', nom: 'SUCC Y', typeAffaire: 'succession' };
  const tous = [v, s];
  const traites = [{ cle: 'v1:pret', dossierId: 'v1' }, { cle: 's1:notoriete', dossierId: 's1' }];
  assert.equal(app.filtrerTraitesParAffaire(traites, 'tout', tous).length, 2);
  assert.equal(app.filtrerTraitesParAffaire(traites, 'vente', tous).map(t => t.cle).join(), 'v1:pret');
  assert.equal(app.filtrerTraitesParAffaire(traites, 'succession', tous).map(t => t.cle).join(), 's1:notoriete');
});

test('regroupement à partir de 2 tâches du même type : une carte, une ligne par dossier', () => {
  const app = chargerApplication();
  const mk = (id, type) => ({ cle: id + ':' + type, type, titre: 'Relancer l’offre de prêt', categorie: 'pret', categorieLabel: 'Obtention du prêt', jours: 2, dossier: { id, nom: 'DOS ' + id, historique: [], pieces: {} }, geste: { type: 'email' } });
  const el = app.elementsColonneTaches([mk('a', 'pret'), mk('b', 'pret'), mk('c', 'ventePrealable')]);
  assert.equal(el.length, 2);
  assert.equal(el[0].groupe.length, 2);
  assert.equal(el[1].action.type, 'ventePrealable');
  const html = app.renderCarteGroupeTaches(el[0].groupe);
  assert.ok(html.includes('2 dossiers') && (html.match(/tf-groupe-ligne/g) || []).length === 2);
  assert.ok(html.includes("marquerFaitJour('a:pret')") && html.includes("marquerFaitJour('b:pret')"));
  assert.equal(app.elementsColonneTaches([mk('a', 'pret')]).length, 1);
});
