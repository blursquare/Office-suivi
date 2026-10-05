'use strict';

// Cocher puis décocher une échéance par erreur (étude 05/10) : le délai jusqu'à la date butoir doit REVENIR, sinon les rappels
// ne partent plus. Mêmes fonctions que la case ronde de la fiche et que les tâches d'« Aujourd'hui ». Dossiers inventés.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { chargerApplication } = require('./helpers/load-app.js');

function appareil(extra) {
  const app = chargerApplication();
  const appels = [];
  app.sauvegarder = () => {}; app.render = () => {}; app.afficherToast = () => {}; app.notifierTacheFaite = () => {}; app.notifierDateAjoutee = () => {};
  app.synchroniserEcheanceAgenda = (d, type, creer) => { appels.push(['agenda', type, creer]); };
  app.noterEnvoiDansAgenda = (id) => { appels.push(['noter', id]); };
  app.retirerEnvoiDansAgenda = (id) => { appels.push(['retirer', id]); };
  const d = Object.assign({
    id: 'dx', nom: 'DUPONT / MARTIN', responsable: 'Julie VASSELIN', typeVente: 'maison', roleNotaire: 'instrumentaire',
    pret: '2026-11-20', ventebien: '2026-11-10', acte: '2026-12-15', rendezVousSignature: '2026-12-10',
    detectionsAgenda: { rendezVousSignature: '2026-12-10' }, rendezVousSignatureLieu: 'BA',
    pieces: {}, echeancesValidees: {}, historique: [], dossierLie: true, nasDossier: 'X/DUPONT', offrePretStatut: 'manquante',
    autres: [{ label: 'Diagnostic amiante', date: '2026-11-30' }]
  }, extra || {});
  vm.runInContext('dossiers.length = 0', app);
  app.__d = d;
  vm.runInContext('dossiers.push(__d)', Object.assign(app, {}));
  return { app, d, appels, dossier: () => vm.runInContext("dossiers.find(x => x.id === 'dx')", app) };
}

const iso = (app, d, type) => { const e = app.toutesEcheances(d).find(x => x.type === type); return e ? e.iso : null; };

test('prêt, vente préalable, échéance perso : cocher retire du planning, décocher rend la MÊME date et le même délai', () => {
  const { app, d } = appareil();
  for (const [type, avant] of [['pret', '2026-11-20'], ['ventebien', '2026-11-10']]) {
    assert.equal(iso(app, d, type), avant);
    app.basculerEcheance('dx', type);
    assert.equal(app.echeanceValidee(d, type), true);
    assert.equal(iso(app, d, type), null, `${type} sorti du planning une fois coché`);
    assert.equal(d[type], avant, 'la date n’est jamais effacée par la coche');
    app.basculerEcheance('dx', type);
    assert.equal(app.echeanceValidee(d, type), false);
    assert.equal(iso(app, d, type), avant, `${type} : le délai jusqu’à la date butoir est revenu`);
  }
  // Échéance personnalisée.
  assert.equal(app.toutesEcheances(d).some(e => e.type === 'autre'), true);
  app.basculerEcheance('dx', 'autre-0');
  assert.equal(app.toutesEcheances(d).some(e => e.type === 'autre'), false);
  app.basculerEcheance('dx', 'autre-0');
  assert.equal(app.toutesEcheances(d).find(e => e.type === 'autre').iso, '2026-11-30');
});

test('appel de fonds et projet : cocher note l’envoi d’aujourd’hui, décocher EFFACE la date — l’échéance redevient le rendez-vous', () => {
  const { app, d } = appareil({ echeancesValidees: { pret: true, ventebien: true }, autres: [] });
  assert.equal(app.prochaineEcheanceDetail(d).type, 'appelFonds');
  assert.equal(app.prochaineEcheanceDetail(d).iso, '2026-12-09', 'la veille du rendez-vous');
  const jours = app.prochaineEcheanceDetail(d).jours;

  app.basculerEcheance('dx', 'appelFonds');
  assert.equal(app.echeanceValidee(d, 'appelFonds'), true);
  assert.match(d.appelFonds, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(app.prochaineEcheanceDetail(d).type, 'projetEnvoye');

  app.basculerEcheance('dx', 'appelFonds');
  assert.equal(app.echeanceValidee(d, 'appelFonds'), false);
  assert.equal(d.appelFonds, '', 'la date d’envoi est partie avec la coche');
  const apres = app.prochaineEcheanceDetail(d);
  assert.equal(apres.type, 'appelFonds');
  assert.equal(apres.iso, '2026-12-09', 'ancré sur la veille du rendez-vous, pas sur la date d’hier');
  assert.equal(apres.jours, jours, 'le délai J-n est exactement celui d’avant');

  app.basculerEcheance('dx', 'appelFonds'); app.basculerEcheance('dx', 'projetEnvoye');
  assert.equal(app.prochaineEcheanceDetail(d).type, 'rendezVousSignature');
  app.basculerEcheance('dx', 'projetEnvoye');
  assert.equal(d.projetEnvoye, '');
  assert.equal(app.prochaineEcheanceDetail(d).type, 'projetEnvoye');
});

test('une date d’envoi sans case cochée vaut envoi fait : jamais une échéance dans le passé', () => {
  const { app, d } = appareil({ echeancesValidees: { pret: true, ventebien: true }, appelFonds: '2026-10-01' });
  assert.equal(app.echeanceValidee(d, 'appelFonds'), true);
  assert.equal(app.toutesEcheances(d).some(e => e.type === 'appelFonds'), false);
});

test('envois : la mention d’Outlook suit — notée à la coche, retirée à la décoche, jamais pour une autre échéance', () => {
  const { app, appels } = appareil({ echeancesValidees: { pret: true, ventebien: true } });
  app.majMentionAgendaEnvoi = (id) => { appels.push(['mention', id]); };
  app.basculerEcheance('dx', 'appelFonds');
  assert.deepEqual(appels.filter(a => a[0] === 'noter').map(a => a[1]), ['dx']);
  appels.length = 0;
  app.basculerEcheance('dx', 'appelFonds');
  assert.deepEqual(appels.filter(a => a[0] === 'mention').map(a => a[1]), ['dx']);
  appels.length = 0;
  app.basculerEcheance('dx', 'acte');
  assert.equal(appels.some(a => a[0] === 'mention' || a[0] === 'noter' || a[0] === 'retirer'), false);
});

test('prêt / vente préalable : l’événement Outlook est retiré à la coche et reposé à la décoche', () => {
  const { app, appels } = appareil();
  app.basculerEcheance('dx', 'pret');
  app.basculerEcheance('dx', 'pret');
  assert.deepEqual(appels.filter(a => a[0] === 'agenda'), [['agenda', 'pret', false], ['agenda', 'pret', true]]);
});

test('majMentionAgendaEnvoi : un envoi encore coché réécrit la mention, aucun envoi → retrait', async () => {
  const { app, appels } = appareil({ echeancesValidees: { pret: true }, appelFonds: '2026-10-02' });
  const reel = app.majMentionAgendaEnvoi;
  await reel('dx', true);
  assert.deepEqual(appels.map(a => a[0]), ['noter']);
  appels.length = 0;
  const d = vm.runInContext("dossiers.find(x => x.id === 'dx')", app);
  d.appelFonds = '';
  await reel('dx', true);
  assert.deepEqual(appels.map(a => a[0]), ['retirer']);
});

test('lieuPorteMentionEnvoi : seulement une vraie mention d’envoi, du rendez-vous de la fiche', () => {
  const { app } = appareil();
  const d = (lieu, rep) => ({ rendezVousSignature: '2026-12-10', rendezVousSignatureLieu: lieu, detectionsAgenda: rep === undefined ? { rendezVousSignature: '2026-12-10' } : rep });
  assert.equal(app.lieuPorteMentionEnvoi(d('BA - Me DURAND en 2nd - Appel de fonds et projet envoyé')), true);
  assert.equal(app.lieuPorteMentionEnvoi(d('BA - Projet envoyé')), true);
  assert.equal(app.lieuPorteMentionEnvoi(d('BA - Me DURAND en 2nd')), false);
  assert.equal(app.lieuPorteMentionEnvoi(d('BA - Appel de fonds envoyé', {})), false, 'lieu d’un autre rendez-vous');
});

test('« Aujourd’hui » : une tâche cochée puis décochée par erreur ne reste pas « faite » dans la liste', () => {
  const { app } = appareil();
  const aujourdhui = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const jour = `${aujourdhui.getFullYear()}-${pad(aujourdhui.getMonth() + 1)}-${pad(aujourdhui.getDate())}`;
  const t = (ms, texte) => ({ date: new Date(aujourdhui.getTime() - ms).toISOString(), texte });
  const base = { id: 'dy', nom: 'X / Y' };
  const fait = Object.assign({}, base, { historique: [t(5000, 'Appel de fonds marqué réalisé (date saisie)')] });
  assert.equal(app.tachesFaitesAilleurs([fait], 'Julie VASSELIN', jour, new Set(), new Set()).length, 1);
  const annule = Object.assign({}, base, { historique: [t(5000, 'Appel de fonds marqué réalisé (date saisie)'), t(1000, 'Envoi appel de fonds : validation annulée')] });
  assert.equal(app.tachesFaitesAilleurs([annule], 'Julie VASSELIN', jour, new Set(), new Set()).length, 0);
  // Recoché après l'annulation : de nouveau « fait ».
  const recoche = Object.assign({}, base, { historique: annule.historique.concat([t(0, 'Appel de fonds marqué réalisé (date saisie)')]) });
  assert.equal(app.tachesFaitesAilleurs([recoche], 'Julie VASSELIN', jour, new Set(), new Set()).length, 1);
});

test('« Aujourd’hui » : « Offre de prêt reçue » / « Vente préalable réalisée » cochent l’échéance, « Annuler » la décoche', () => {
  const { app, d } = appareil({ rendezVousSignature: '', ventebien: '2026-10-07', pret: '2026-10-09', autres: [] });
  vm.runInContext("utilisateurPoste = 'Julie VASSELIN'", app);
  const jour = vm.runInContext('isoAujourdhuiLocal()', app);
  const actions = app.actionsDuJour([d], jour).actions;
  const pret = actions.find(a => a.type === 'pret');
  assert.ok(pret && pret.second && pret.second.type === 'valider' && pret.second.champ === 'pret', 'relance de l’offre : « Offre de prêt reçue » en second geste');
  // La case de la tâche « Confirmer la vente préalable » EST l'échéance : cochée, puis décochée par « Annuler ».
  const confirmer = actions.find(a => a.type === 'point-confirmer-la-vente-prealable');
  assert.ok(confirmer, 'vente préalable à confirmer');
  app.marquerFaitJour(confirmer.cle);
  assert.equal(app.echeanceValidee(d, 'ventebien'), true);
  assert.equal(d.ventebien, '2026-10-07', 'la date reste');
  assert.equal(app.actionsDuJour([d], jour).actions.some(a => a.type === 'point-confirmer-la-vente-prealable'), false, 'tâche réglée');
  app.annulerTraiteJour(confirmer.cle);
  assert.equal(app.echeanceValidee(d, 'ventebien'), false, 'décochée : le délai revient');
  assert.equal(app.actionsDuJour([d], jour).actions.some(a => a.type === 'point-confirmer-la-vente-prealable'), true, 'la tâche revient');
});
