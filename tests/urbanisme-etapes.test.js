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
  // Une seule parcelle sur deux dans le périmètre (bordure ?) : « probable », jamais la réponse « oui » pour toutes.
  const deux = Object.assign(vierge(), { insee: '41269', parcelles: 'AB 12, AB 13', zonages: [lu({ lu: true, perimetre: true, renforce: true, libelles: ['DPU renforcé'] }), lu({ lu: true, perimetre: false, renforce: false, libelles: [] })] });
  assert.equal(app.etatDpuRenforcePreemption(deux).statut, 'probable');
  assert.equal(app.reponsesPreemption(deux).dpur, undefined);
  // Agglopolys : la règle par zone fait foi, le DPU « institué » n'est pas déduit du Géoportail.
  const agglo = ailleurs({ lu: true, perimetre: true, renforce: false, libelles: ['DPU'] });
  agglo.zonages[0].resultat.epciSiren = '200030385';
  assert.equal(app.reponsesPreemption(agglo).dpuInstitue, undefined);
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

test('arrière-plan automatique (31/10) : la demande en cours est confiée au serveur en partant, avec ce qui était déjà autorisé', () => {
  const d = { texte: 'Prépare la réponse à l’agence', dossierId: 'd1', pieces: 1, autorises: ['Cocher la pièce « ERP »'], debut: 1000 };
  const c = app.consigneRepriseArrierePlan(d, 'VTE - MOREAU');
  assert.match(c, /fenêtre fermée avant la fin/);
  assert.match(c, /Prépare la réponse à l’agence/);
  assert.match(c, /VTE - MOREAU/);
  assert.match(c, /Déjà autorisé.*ERP/);
  assert.match(c, /pièces jointes/);
  assert.equal(app.confierEnPartant(d, 5000, false), true);
  assert.equal(app.confierEnPartant(d, 1500, false), false, 'à peine lancée');
  assert.equal(app.confierEnPartant(d, 5000, true), false, 'page gardée en cache');
  assert.equal(app.confierEnPartant(null, 5000, false), false);
});

test('boutons (31/10) : calculer et lire sans carte, écrire après la carte, jamais télécharger, envoyer ni les Réglages', () => {
  const c = (l, t, p) => app.classementBoutonAgent(l, t || '', p || '');
  assert.equal(c('Calculer'), 'libre');
  assert.equal(c('Lire le zonage'), 'libre');
  assert.equal(c('Tirer le plan de situation'), 'libre');
  assert.equal(c('Suivant : questions →'), 'libre');
  assert.equal(c('Enregistrer sur la fiche'), 'carte');
  assert.equal(c('Placer le rendez-vous de signature'), 'carte');
  assert.equal(c('Retirer ce bien du dossier'), 'strict');
  assert.equal(c('Télécharger l’annexe (.docx)'), 'jamais');
  assert.equal(c('Envoyer les emails (3)'), 'jamais');
  assert.equal(c('PDF/A pour Authentic'), 'jamais');
  assert.equal(c('Imprimer tout (2)'), 'jamais');
  assert.equal(c('Ouvrir dans Outlook'), 'jamais');
  assert.equal(c('Ok', 'Envoyer la demande au client'), 'jamais', 'le titre compte aussi');
  assert.equal(c('Calculer', '', 'reglages'), 'jamais', 'aucun bouton des Réglages');
  assert.equal(c('Ouvrir', '', 'telechargement'), 'jamais', 'un lien de téléchargement');
  // Audit 0.415.0 : la fonction appelée compte aussi ; une carte de proposition n'est jamais décidée par CLAIRE.
  const f = (l, fn, p) => app.classementBoutonAgent(l, '', p || '', fn);
  assert.equal(f('Ouvrir le brouillon', "autoriserProposition('x')"), 'jamais');
  assert.equal(f('Autoriser', '', 'proposition'), 'jamais');
  assert.equal(f('Excel', "telechargerArtefactAssistant('a', 'xlsx')"), 'jamais');
  assert.equal(f('contrat.xls', "ouvrirPieceJointeEmail('e', 'p')"), 'jamais');
  assert.equal(f('plan.doc', "ouvrirFichierExplorateurNas('x')"), 'jamais');
  assert.equal(f('Coller', 'collerRendezVousAgenda()'), 'carte');
  assert.equal(f('Laisser dans Scan', ''), 'carte');
  assert.equal(f('+ Personne', ''), 'carte');
  assert.equal(f('👥', "reagirMessageAssistant('m', '👥')"), 'carte');
  assert.equal(f('Calculer', 'calculerQuotites()'), 'libre');
});
