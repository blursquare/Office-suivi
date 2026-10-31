'use strict';

// Contrôle de l'urbanisme en étapes et premier écran « Quel dossier ? » des outils (étude 31/10, client/152 et client/153).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const app = chargerApplication();
const vierge = () => app.etatPreemptionVierge();

test('étapes : sans dossier choisi, toujours la première ; un dossier choisi mène aux parcelles', () => {
  assert.equal(app.pageCourantePreemption(null), 'dossier');
  assert.equal(app.pageCourantePreemption(Object.assign(vierge(), { page: 'rendu' })), 'dossier', 'pas d’écran final sans dossier');
  assert.equal(app.pageCourantePreemption(Object.assign(vierge(), { dossierId: 'd1' })), 'parcelles');
  assert.equal(app.pageCourantePreemption(Object.assign(vierge(), { sansDossier: true, page: 'questions' })), 'questions');
  assert.equal(app.pageCourantePreemption(Object.assign(vierge(), { dossierId: 'd1', page: 'dossier' })), 'dossier', '« Changer de dossier »');
});

test('DPU renforcé : Blois par la délibération, ailleurs le périmètre publié au Géoportail, jamais « non » sans source', () => {
  const lu = (dpu) => ({ section: 'AB', numero: '12', statut: 'ok', resultat: { zones: [{ libelle: 'UB', typezone: 'U' }], dpu } });
  const ailleurs = (dpu) => Object.assign(vierge(), { insee: '41269', parcelles: 'AB 12', zonages: [lu(dpu)] });
  assert.equal(app.etatDpuRenforcePreemption(ailleurs({ lu: true, perimetre: true, renforce: true, libelles: ['DPU renforcé'] })).statut, 'oui');
  const simple = app.etatDpuRenforcePreemption(ailleurs({ lu: true, perimetre: true, renforce: false, libelles: ['DPU'] }));
  assert.equal(simple.statut, 'verifier');
  assert.equal(app.etatDpuRenforcePreemption(ailleurs({ lu: true, perimetre: false, renforce: false, libelles: [] })).statut, 'verifier');
  assert.equal(app.etatDpuRenforcePreemption(Object.assign(vierge(), { insee: '41018', parcelles: 'AL 839' })).statut, 'oui', 'Blois, AL 839');
  assert.equal(app.etatDpuRenforcePreemption(Object.assign(vierge(), { insee: '41269', parcelles: 'AB 12' })).statut, '', 'zonage pas encore lu');
  // Le périmètre renforcé publié répond à la question du DPU renforcé et dit que le DPU est institué.
  const r = app.reponsesPreemption(ailleurs({ lu: true, perimetre: true, renforce: true, libelles: ['DPU renforcé'] }));
  assert.equal(r.dpur, 'oui');
  assert.equal(r.dpuInstitue, 'oui');
  // Une réponse donnée l'emporte.
  assert.equal(app.reponsesPreemption(Object.assign(ailleurs({ lu: true, perimetre: true, renforce: true, libelles: [] }), { reponses: { mutation: 'vente', dpur: 'non' } })).dpur, 'non');
});

test('agent : réponses « oui / non » rendues dans la forme de l’outil, clés et valeurs inconnues refusées', () => {
  const r = app.reponsesAgentUrbanisme({ achevementMoins4ans: 'non', bien: 'bati', mutation: 'n’importe quoi', inconnue: 'oui', bois: 'peut-être' });
  assert.equal(r.reponses.achevementMoins4ans, false);
  assert.equal(r.reponses.bien, 'bati');
  assert.equal(r.refusees.sort().join(','), 'bois,inconnue,mutation');
});

test('premier écran des outils : dossiers en cours du bon genre, derniers consultés d’abord, recherche', () => {
  const ds = [
    { id: 'v1', nom: 'MARTIN / DURAND', responsable: 'Julie VASSELIN' },
    { id: 'v2', nom: 'PETIT / ROY', referenceAuthentic: 'A 2026 00247' },
    { id: 'v3', nom: 'LEGRAND', archive: true },
    { id: 's1', nom: 'BARON', typeAffaire: 'succession' }
  ];
  assert.equal(app.dossiersAccueilOutil(ds, 'vente', '', ['v2']).map(d => d.id).join(','), 'v2,v1');
  assert.equal(app.dossiersAccueilOutil(ds, 'succession', '', []).map(d => d.id).join(','), 's1');
  assert.equal(app.dossiersAccueilOutil(ds, 'vente', 'julie', []).map(d => d.id).join(','), 'v1');
  assert.equal(app.dossiersAccueilOutil(ds, 'vente', '00247', []).map(d => d.id).join(','), 'v2');
  assert.ok(app.ACCUEIL_OUTILS.preemption.pages, 'le contrôle de l’urbanisme montre l’accueil dans sa première étape');
  ['appel-fonds', 'quotites', 'calculateur', 'prorata', 'inventaire'].forEach(o => assert.ok(app.ACCUEIL_OUTILS[o], o));
});
