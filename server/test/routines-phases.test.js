'use strict';
// Les routines de CLAIRE construites le 25/10 (étude : « toutes les phases pour demain », et les brouillons de réponse aux emails reçus
// après 18 h) : chaque exécutant rend des propositions sur des dossiers inventés, jamais refaites ; l'IA ne reçoit rien de nominatif.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const X = require('../src/routines/executants');
const IA = require('../src/routines/ia');
const R = require('../src/routines/reglages');
const P = require('../src/routines/propositions');
const { creerPlanificateur } = require('../src/routines/planificateur');
const { checklistPiecesBase } = require('../../commun/pieces');

// Page Actualités du CNAF et boîte Exchange inventées : aucun test n'ouvre de connexion réelle.
const PAGE_CNAF_TEST = '<main><div class="actus-list"><a href="/actualites/donation-et-dettes" class="actu js-reveal"><div class="content"><p class="date">23 octobre 2026</p><h3>Donation et dettes du donataire</h3><p>Retour sur la notification au créancier.</p></div></a></div></main>';
async function fauxCnaf(url) { return url.endsWith('/actualites') ? PAGE_CNAF_TEST : '<main>Retour aux actualités Donation et dettes du donataire. La notification au créancier reste nécessaire.</main>'; }
async function fauxEws() { return { statut: 200, corps: '<s:Envelope><s:Body><m:FindItemResponse><m:ResponseMessages><m:FindItemResponseMessage ResponseClass="Success"><m:ResponseCode>NoError</m:ResponseCode><m:RootFolder><t:Items></t:Items></m:RootFolder></m:FindItemResponseMessage></m:ResponseMessages></m:FindItemResponse></s:Body></s:Envelope>' }; }

const fauxRepo = (initial) => {
  const m = new Map(Object.entries(initial || {}).map(([k, v]) => [k, JSON.stringify(v)]));
  return {
    lireJsonBrut: (k, d) => (m.has(k) ? JSON.parse(m.get(k)) : d), ecrireJsonBrut: (k, v) => { m.set(k, JSON.stringify(v)); },
    lireReglages: () => ({}), lireRappelsPerso: () => [], lireSondagesCreneaux: () => []
  };
};
const AUJ = '2026-10-26'; // lundi
const cree = (date) => [{ date: date + 'T09:00:00.000Z', texte: 'Dossier créé' }];
const vente = (o) => Object.assign({ id: 'd1', nom: 'MARTIN / DURAND', responsable: 'Julie VASSELIN', typeVente: 'maison', pieces: {}, historique: cree('2026-09-01'),
  parties: [{ role: 'VENDEUR', nom: 'MARTIN', prenom: 'Paul' }, { role: 'ACQUEREUR', nom: 'DURAND', prenom: 'Léa' }] }, o);
const toutRecu = (d) => { d.pieces = Object.fromEntries(checklistPiecesBase(d.typeVente, d).map((p) => [p.cle, 'recue'])); return d; };

test('revue du matin : relance de l’offre de prêt, échéance dépassée, pièces manquantes à trois semaines — rien pour un dossier archivé, signé ou une succession', () => {
  const d = vente({ pret: '2026-11-05', ventebien: '2026-10-20', rendezVousSignature: '2026-11-10' });
  const liste = X.revueDuMatin([d, vente({ id: 'a', archive: true, pret: '2026-11-01' }), vente({ id: 's', typeAffaire: 'succession', pret: '2026-11-01' }),
    vente({ id: 'g', pret: '2026-11-01', authentic: { acte: { etat: 'signe' } } })], AUJ, { niveau: () => 1 });
  assert.equal(liste.filter((p) => p.dossierId !== 'd1').length, 0);
  const pret = liste.find((p) => p.details.modele === 'pret');
  assert.ok(pret, 'offre attendue dans 10 jours : relance proposée');
  assert.equal(pret.type, 'email');
  assert.ok(liste.some((p) => p.type === 'tache' && /Vente préalable dépassée/.test(p.titre)));
  assert.ok(liste.some((p) => p.type === 'tache' && /pièces? manquantes? avant la signature/.test(p.titre)));
  assert.ok(liste.every((p) => p.id && p.empreinte && p.responsable === 'Julie VASSELIN'));
  // Relancée il y a 3 jours : pas de nouvelle relance ; il y a 12 jours : si.
  assert.ok(!X.revueDuMatin([vente({ pret: '2026-11-05', derniereRelanceAuto: '2026-10-23' })], AUJ).some((p) => p.details.modele));
  assert.ok(X.revueDuMatin([vente({ pret: '2026-11-05', derniereRelanceAuto: '2026-10-14' })], AUJ).some((p) => p.details.modele));
  // Offre reçue : plus de relance, même si la vente préalable n'est pas réalisée.
  assert.ok(!X.revueDuMatin([vente({ pret: '2026-11-05', ventebien: '2026-12-01', echeancesValidees: { pret: true } })], AUJ).some((p) => p.details.modele));
});

test('veille de signature : deux jours avant le rendez-vous, une fois par date', () => {
  const demain = X.veilleSignature([vente({ rendezVousSignature: '2026-10-27', rendezVousSignatureHeure: '14:30' })], AUJ);
  assert.equal(demain.length, 1);
  assert.equal(demain[0].details.outil, 'fiche-signature');
  assert.match(demain[0].resume, /demain à 14 h 30/);
  assert.equal(X.veilleSignature([vente({ rendezVousSignature: '2026-11-02' })], AUJ).length, 0);
  assert.equal(X.veilleSignature([vente({ rendezVousSignature: '2026-10-25' })], AUJ).length, 0, 'passé');
});

test('constitution : dossiers créés à compter du 24/10/2026, étude notaire du vendeur au sens large, ou succession', () => {
  const recent = cree('2026-10-25');
  assert.equal(X.constitutionDossier([vente({ historique: recent })], AUJ).length, 1);
  assert.equal(X.constitutionDossier([vente({ historique: cree('2026-10-20') })], AUJ).length, 0, 'aucun rattrapage');
  assert.equal(X.constitutionDossier([vente({ historique: recent, notaireVendeur: 'Maître Jean NOTAIRE (TOURS)', roleNotaire: 'participant' })], AUJ).length, 0,
    'un confrère représente le vendeur et reçoit l’acte : pas pour nous');
  assert.equal(X.constitutionDossier([vente({ historique: recent, notaireVendeur: 'Maître Jean NOTAIRE (TOURS)', roleNotaire: 'instrumentaire' })], AUJ).length, 1,
    'nous recevons l’acte : oui');
  assert.equal(X.constitutionDossier([vente({ historique: recent, typeAffaire: 'succession' })], AUJ).length, 1);
  assert.equal(X.constitutionDossier([vente({ historique: recent })], AUJ)[0].empreinte, 'constitution:d1', 'une seule fois par dossier');
});

test('appel de fonds : le jour de l’échéance (10 jours avant), seulement si nous représentons l’acquéreur et qu’il n’est pas parti', () => {
  assert.equal(X.appelDeFonds([vente({ rendezVousSignature: '2026-11-04' })], AUJ).length, 1);
  assert.equal(X.appelDeFonds([vente({ rendezVousSignature: '2026-11-20' })], AUJ).length, 0, 'trop tôt');
  assert.equal(X.appelDeFonds([vente({ rendezVousSignature: '2026-11-04', notaireAcquereur: 'Maître Jean NOTAIRE (TOURS)' })], AUJ).length, 0, 'confrère de l’acquéreur');
  assert.equal(X.appelDeFonds([vente({ rendezVousSignature: '2026-11-04', echeancesValidees: { appelFonds: true } })], AUJ).length, 0, 'déjà parti');
});

test('autorisations de fonds : deux jours avant le rendez-vous d’une notoriété', () => {
  const s = vente({ id: 's1', typeAffaire: 'succession', succession: { rendezVous: [{ id: 'r', etape: 'notoriete', date: '2026-10-28', heure: '10:00' }] } });
  const l = X.autorisationsNotoriete([s], AUJ);
  assert.equal(l.length, 1);
  assert.equal(l[0].details.outil, 'autorisations');
  assert.equal(X.autorisationsNotoriete([vente({ rendezVousSignature: '2026-10-27' })], AUJ).length, 0, 'une vente : non');
});

test('proposition de dates : dossier complet sans rendez-vous ni sondage ouvert, pas en participation', () => {
  const complet = toutRecu(vente({ sansPret: true }));
  assert.equal(X.propositionDates([complet], AUJ).length, 1);
  assert.equal(X.propositionDates([complet], AUJ, { sondagesOuverts: new Set(['d1']) }).length, 0, 'sondage déjà ouvert');
  assert.equal(X.propositionDates([vente({ sansPret: true })], AUJ).length, 0, 'pièces manquantes');
  assert.equal(X.propositionDates([toutRecu(vente({ pret: '2026-11-01' }))], AUJ).length, 0, 'offre de prêt pas reçue');
  assert.equal(X.propositionDates([toutRecu(vente({ sansPret: true, rendezVousSignature: '2026-12-01' }))], AUJ).length, 0, 'rendez-vous placé');
  assert.equal(X.propositionDates([toutRecu(vente({ sansPret: true, roleNotaire: 'participant' }))], AUJ).length, 0, 'participation');
});

test('emails du soir : de la veille ouvrée 18 h à 8 h ce matin, le week-end compris le lundi', () => {
  assert.equal(IA.veilleOuvree('2026-10-26'), '2026-10-23', 'lundi → vendredi');
  assert.equal(IA.veilleOuvree('2026-10-27'), '2026-10-26');
  assert.equal(IA.recuApres18h('2026-10-23T17:30:00Z', '2026-10-26'), true, 'vendredi 19 h 30 à Paris');
  assert.equal(IA.recuApres18h('2026-10-23T15:00:00Z', '2026-10-26'), false, 'vendredi 17 h');
  assert.equal(IA.recuApres18h('2026-10-25T10:00:00Z', '2026-10-26'), true, 'dimanche');
  assert.equal(IA.recuApres18h('2026-10-26T06:30:00Z', '2026-10-26'), true, 'lundi 7 h 30');
  assert.equal(IA.recuApres18h('2026-10-26T08:00:00Z', '2026-10-26'), false, 'lundi 9 h : aux heures de bureau');
});

/** Un faux client de l'IA : garde chaque prompt, répond avec `reponse` (une fonction du prompt). */
function fausseIa(reponse) {
  const prompts = [];
  return { prompts, disponible: () => ({ ok: true }), async json(prompt) { prompts.push(prompt); return reponse(prompt); }, async texte(prompt) { prompts.push(prompt); return 'Rien de notable cette semaine.'; } };
}

const EMAILS = [
  { id: 'e1', sens: 'recu', dossierId: 'd1', date: '2026-10-23T18:30:00Z', de: { nom: 'Léa DURAND', adresse: 'lea.durand@exemple.fr' }, objet: 'Question de Léa DURAND sur le prêt', pj: [] },
  { id: 'e2', sens: 'recu', dossierId: 'd1', date: '2026-10-23T12:00:00Z', de: { nom: 'Léa DURAND', adresse: 'lea.durand@exemple.fr' }, objet: 'En journée', pj: [] },
  { id: 'e3', sens: 'recu', dossierId: 'd1', date: '2026-10-24T09:00:00Z', de: { nom: 'Paul MARTIN', adresse: 'paul.martin@exemple.fr' }, objet: 'Déjà répondu', pj: [] },
  { id: 'e4', sens: 'envoye', dossierId: 'd1', date: '2026-10-24T10:00:00Z', a: ['paul.martin@exemple.fr'], objet: 'RE: Déjà répondu', pj: [] }
];

test('réponses aux emails du soir : un brouillon par email reçu après 18 h, déjà répondu sauté, rien de nominatif ne part, codes rétablis', async () => {
  const repo = fauxRepo();
  const ia = fausseIa((prompt) => {
    const code = (prompt.match(/\[NOM\d+\]/) || [''])[0];
    return { reponse: `Madame, ${code ? 'Merci ' + code + ',' : ''} nous revenons vers vous. Bien cordialement,` };
  });
  const lu = [];
  const r = await IA.reponsesEmailsDuSoir({ ia, parametresRepo: repo, dossiers: [vente({})], emails: EMAILS, aujourdhui: AUJ, maintenantMs: Date.parse('2026-10-26T07:05:00Z'),
    lireEmail: async (id) => { lu.push(id); return { texte: 'Bonjour, Madame Léa DURAND demande si le prêt de la banque est accordé. Je demeure à BLOIS (41000), 12 rue des Lices. Tél. 06 11 22 33 44, lea.durand@exemple.fr' }; },
    niveau: () => 1 });
  assert.deepEqual(lu, ['e1'], 'seul l’email du soir, auquel personne n’a répondu');
  assert.equal(r.propositions.length, 1);
  const p = r.propositions[0];
  assert.equal(p.details.destinataire, 'lea.durand@exemple.fr');
  assert.equal(p.details.reponseA, 'e1');
  assert.match(p.details.sujet, /^RE: /);
  assert.ok(!/\[NOM\d+\]/.test(p.details.corps), 'aucun code dans le brouillon');
  for (const mot of ['DURAND', 'Léa', 'MARTIN', 'Lices', '06 11 22 33 44', 'lea.durand@exemple.fr']) assert.ok(!ia.prompts.join('\n').includes(mot), `« ${mot} » est parti`);
  // Déjà lu : jamais relu le lendemain.
  const bis = await IA.reponsesEmailsDuSoir({ ia, parametresRepo: repo, dossiers: [vente({})], emails: EMAILS, aujourdhui: AUJ, maintenantMs: Date.parse('2026-10-26T07:10:00Z'), lireEmail: async () => ({ texte: 'x' }), niveau: () => 1 });
  assert.equal(bis.lus, 0);
});

test('relance des pièces : seulement si l’email envoyé demandait une pièce encore manquante ; rien de nominatif ne part', async () => {
  const d = vente({});
  const manquante = checklistPiecesBase('maison', d)[0].label;
  const repo = fauxRepo();
  const envoye = { id: 'v1', sens: 'envoye', dossierId: 'd1', date: '2026-10-22T09:00:00Z', a: ['lea.durand@exemple.fr'], objet: 'Pièces à fournir — DURAND', pj: [] };
  const ia = fausseIa(() => ({ pieces: [1, 99], relance: 'Madame, nous attendons toujours la pièce demandée. Bien cordialement,' }));
  const r = await IA.relancePiecesDemandees({ ia, parametresRepo: repo, dossiers: [d], emails: [envoye], maintenantMs: Date.parse('2026-10-26T08:00:00Z'),
    lireEmail: async () => ({ texte: 'Madame Léa DURAND, merci de nous transmettre les pièces suivantes.' }), niveau: () => 1 });
  assert.equal(r.propositions.length, 1);
  assert.ok(r.propositions[0].resume.includes(manquante));
  assert.ok(!/99/.test(r.propositions[0].resume), 'un numéro hors de la liste n’est jamais repris');
  for (const mot of ['DURAND', 'Léa']) assert.ok(!ia.prompts.join('\n').includes(mot), `« ${mot} » est parti`);
  const rien = await IA.relancePiecesDemandees({ ia: fausseIa(() => ({ pieces: [], relance: '' })), parametresRepo: fauxRepo(), dossiers: [d], emails: [envoye],
    maintenantMs: Date.parse('2026-10-26T08:00:00Z'), lireEmail: async () => ({ texte: 'Merci.' }), niveau: () => 1 });
  assert.equal(rien.propositions.length, 0);
});

test('planificateur : le lundi, les routines allumées déposent leurs propositions dans le canal du dossier, une seule fois ; la veille juridique dans « général »', async () => {
  const repo = fauxRepo();
  const d = vente({ pret: '2026-11-05', rendezVousSignature: '2026-10-27' });
  const depot = { tousActifs: () => [d], trouverParId: (id) => (id === 'd1' ? d : null) };
  const ia = fausseIa(() => ({ reponse: 'Madame, bien reçu. Bien cordialement,' }));
  const p = creerPlanificateur({ lireUrl: fauxCnaf, posterEws: fauxEws, parametresRepo: repo, depot, envoyer: async () => ({ ok: true }), ia, lireEmail: async () => ({ texte: 'Bonjour' }) });
  repo.ecrireJsonBrut('emails-dossiers', { emails: EMAILS, prepares: [] });
  assert.equal(R.lireReglagesRoutines(repo).actif, true, 'jamais enregistrés : allumées');
  await p.tour(new Date('2026-10-26T09:40:00+01:00'));
  const apres = P.lirePropositions(repo);
  assert.ok(apres.some((x) => x.routine === 'revue-matin'), 'revue du matin');
  assert.ok(apres.some((x) => x.routine === 'veille-signature'), 'veille de signature');
  assert.ok(apres.some((x) => x.routine === 'reponses-emails'), 'réponse à l’email du soir');
  assert.ok(apres.some((x) => x.routine === 'veille-juridique'), 'veille juridique du lundi');
  const canal = repo.lireJsonBrut('canal:d:d1', []);
  assert.ok(canal.some((m) => m.carte), 'annoncées dans le canal du dossier');
  const nombre = apres.length;
  await p.tour(new Date('2026-10-26T10:00:00+01:00'));
  await p.tour(new Date('2026-10-26T10:20:00+01:00'));
  assert.equal(P.lirePropositions(repo).length, nombre, 'jamais refaites');
  // Éteintes : rien.
  const repo2 = fauxRepo();
  R.ecrireReglagesRoutines(repo2, { actif: false });
  await creerPlanificateur({ lireUrl: fauxCnaf, posterEws: fauxEws, parametresRepo: repo2, depot, envoyer: async () => ({ ok: true }), ia, lireEmail: async () => ({ texte: '' }) }).tour(new Date('2026-10-26T09:40:00+01:00'));
  assert.equal(P.lirePropositions(repo2).length, 0);
});

test('relance des pièces : le libellé d’une pièce ajoutée à la main part masqué ; identifiants Exchange refusés = arrêt et disjoncteur', async () => {
  const d = vente({ piecesPersonnalisees: [{ cle: 'perso-pouvoir', label: 'Pouvoir de Monsieur Paul MARTIN' }] });
  const envoye = (id) => ({ id, sens: 'envoye', dossierId: 'd1', date: '2026-10-22T09:00:00Z', a: ['lea.durand@exemple.fr'], objet: 'Pièces', pj: [] });
  const ia = fausseIa(() => ({ pieces: [], relance: '' }));
  await IA.relancePiecesDemandees({ ia, parametresRepo: fauxRepo(), dossiers: [d], emails: [envoye('v1')], maintenantMs: Date.parse('2026-10-26T08:00:00Z'),
    lireEmail: async () => ({ texte: 'Merci.' }), niveau: () => 1 });
  assert.ok(!ia.prompts.join('\n').includes('MARTIN'), 'le nom d’une pièce personnalisée ne part pas');
  let refus = 0;
  const lus = [];
  const r = await IA.reponsesEmailsDuSoir({ ia: fausseIa(() => ({ reponse: 'x' })), parametresRepo: fauxRepo(), dossiers: [vente({})],
    emails: [EMAILS[0], Object.assign({}, EMAILS[0], { id: 'e9', date: '2026-10-23T19:00:00Z' })], aujourdhui: AUJ, maintenantMs: Date.parse('2026-10-26T07:05:00Z'),
    lireEmail: async (id) => { lus.push(id); return { erreur: 'Identifiants de messagerie refusés.' }; }, niveau: () => 1, signalerRefus: () => { refus += 1; } });
  assert.equal(lus.length, 1, 'un seul essai, jamais un enchaînement de refus');
  assert.equal(refus, 1);
  assert.deepEqual(r.propositions, []);
});

test('décision : le niveau en vigueur s’applique à une proposition déposée avant qu’il soit abaissé', async () => {
  const { creerApp } = require('../src/app');
  const { ouvrirDb } = require('../src/db');
  const { creerRepoParametres } = require('../src/parametresRepo');
  const db = ouvrirDb(':memory:');
  const repo = creerRepoParametres(db);
  R.ecrireReglagesRoutines(repo, { actif: true, routines: { 'reponses-emails': { actif: true, gestes: { reponse: 1 } } } });
  require('../src/canaux/deposer').deposerProposition(repo, { id: 'rt-x', routine: 'reponses-emails', responsable: 'Julie VASSELIN', dossierId: '', type: 'email', action: 'email',
    empreinte: 'reponse:x', titre: 'Répondre', details: { corps: 'Bonjour', geste: 'reponse', niveau: 2 } });
  const { app } = creerApp({ db, config: { authActive: false, estSea: () => false, racineRepo: process.cwd() + '/..' } });
  const srv = app.listen(0);
  await new Promise((ok) => srv.once('listening', ok));
  try {
    const r = await fetch(`http://127.0.0.1:${srv.address().port}/api/propositions/rt-x/decision`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ auteur: 'Julie VASSELIN', decision: 'acceptee' }) });
    const corps = await r.json();
    assert.equal(corps.proposition.details.niveau, '1', 'déposée au niveau 2, abaissée à 1 depuis : rien ne part sans clic');
  } finally { srv.close(); }
});

test('« Lancer maintenant » : refusé pour une routine éteinte', async () => {
  const repo = fauxRepo();
  R.ecrireReglagesRoutines(repo, { actif: true, routines: { 'revue-matin': { actif: false } } });
  const r = await creerPlanificateur({ lireUrl: fauxCnaf, posterEws: fauxEws, parametresRepo: repo, depot: { tousActifs: () => [] } }).lancer('revue-matin', { responsable: 'Julie VASSELIN' });
  assert.equal(r.ok, false);
});

test('jours fériés et week-end : la veille ouvrée saute les deux, les emails reçus un jour férié sont repris le lendemain ; rien ne tourne un jour férié', async () => {
  assert.equal(IA.veilleOuvree('2026-11-12'), '2026-11-10', 'jeudi après le 11 novembre (mercredi férié)');
  assert.equal(IA.veilleOuvree('2026-05-26'), '2026-05-22', 'mardi après le lundi de Pentecôte et le week-end');
  assert.equal(IA.recuApres18h('2026-11-11T10:00:00Z', '2026-11-12'), true, 'reçu le 11 novembre en journée');
  assert.equal(IA.recuApres18h('2026-11-10T18:30:00Z', '2026-11-12'), true, 'reçu le 10 au soir');
  assert.equal(IA.recuApres18h('2026-11-10T10:00:00Z', '2026-11-12'), false, 'le 10 aux heures de bureau');
  assert.equal(IA.recuApres18h('2026-05-25T09:00:00Z', '2026-05-26'), true, 'lundi de Pentecôte');
  assert.equal(IA.recuApres18h('2026-05-23T09:00:00Z', '2026-05-26'), true, 'samedi');
  const { infosParis } = require('../src/routines/planificateur');
  assert.equal(infosParis(new Date('2026-11-11T09:40:00+01:00')).ouvre, false, 'le 11 novembre n’est pas ouvré');
  const repo = fauxRepo();
  const d = vente({ pret: '2026-11-20' });
  await creerPlanificateur({ lireUrl: fauxCnaf, posterEws: fauxEws, parametresRepo: repo, depot: { tousActifs: () => [d], trouverParId: () => d }, envoyer: async () => ({ ok: true }), ia: fausseIa(() => ({ reponse: 'x' })), lireEmail: async () => ({ texte: '' }) })
    .tour(new Date('2026-11-11T09:40:00+01:00'));
  assert.equal(P.lirePropositions(repo).length, 0, 'aucune routine un jour férié');
});

test('veille juridique : un échec n’est pas relancé le lendemain ; un lundi férié, elle part le mardi, une seule fois', async () => {
  const depot = { tousActifs: () => [], trouverParId: () => null };
  const repo = fauxRepo();
  let appels = 0;
  const enEchec = Object.assign(fausseIa(() => ({})), { async texte() { appels += 1; throw new Error('recherche interrompue'); } });
  const cnafRecent = async (url) => (url.endsWith('/actualites') ? PAGE_CNAF_TEST.replace('23 octobre', '31 octobre') : '<main>Texte</main>');
  const p = creerPlanificateur({ lireUrl: cnafRecent, posterEws: fauxEws, parametresRepo: repo, depot, envoyer: async () => ({ ok: true }), ia: enEchec, lireEmail: async () => ({ texte: '' }) });
  await p.tour(new Date('2026-10-26T09:40:00+01:00'));
  await p.tour(new Date('2026-10-27T09:40:00+01:00'));
  await p.tour(new Date('2026-10-28T09:40:00+01:00'));
  assert.equal(appels, 1, 'un seul essai payé dans la semaine');
  await p.tour(new Date('2026-11-02T09:40:00+01:00'));
  assert.equal(appels, 2, 'la semaine suivante, un nouvel essai');

  const repo2 = fauxRepo();
  const cnaf2027 = async (url) => (url.endsWith('/actualites') ? PAGE_CNAF_TEST.replace('23 octobre 2026', '14 mai 2027') : '<main>Texte</main>');
  const p2 = creerPlanificateur({ lireUrl: cnaf2027, posterEws: fauxEws, parametresRepo: repo2, depot, envoyer: async () => ({ ok: true }), ia: fausseIa(() => ({})), lireEmail: async () => ({ texte: '' }) });
  await p2.tour(new Date('2027-05-17T09:40:00+02:00'));
  assert.equal(P.lirePropositions(repo2).filter((x) => x.routine === 'veille-juridique').length, 0, 'lundi de Pentecôte : rien');
  await p2.tour(new Date('2027-05-18T09:40:00+02:00'));
  await p2.tour(new Date('2027-05-19T09:40:00+02:00'));
  assert.equal(P.lirePropositions(repo2).filter((x) => x.routine === 'veille-juridique').length, 1, 'le mardi, une seule');
});

test('veille notariale : page du CNAF méconnaissable = erreur dite, jamais « rien de neuf »', async () => {
  const V = require('../src/routines/veille');
  const r = await V.sourcesCnaf({ lire: async () => '<main><p>Nouvelle présentation</p></main>', aujourdhui: '2026-10-26', vus: [] });
  assert.match(r.erreur, /non reconnue/);
});

test('veille notariale : page Actualités du CNAF lue (date, titre, chapô), emails du CRIDON reconnus', () => {
  const V = require('../src/routines/veille');
  const a = V.articlesCnafDepuisHtml(PAGE_CNAF_TEST + '<a href="https://ailleurs.example/x" class="actu"><h3>Hors site</h3></a>');
  assert.equal(a.length, 1);
  assert.equal(a[0].url, 'https://www.cnaf.notaires.fr/actualites/donation-et-dettes');
  assert.equal(a[0].date, '2026-10-23');
  assert.equal(a[0].titre, 'Donation et dettes du donataire');
  assert.equal(a[0].chapo, 'Retour sur la notification au créancier.');
  assert.equal(V.isoDepuisDateFr('1er août 2026'), '2026-08-01');
  assert.equal(V.decoderEntites('&#99999999;&#x41;&#233;'), ' Aé', 'entité hors Unicode : jamais une erreur qui coupe la veille');
  assert.equal(V.estEmailCridon({ de: 'flash@evilcridon.fr', objet: 'Flash' }), false, 'domaine qui ne commence pas par cridon');
  assert.equal(V.texteArticleCnaf('<nav>Menu</nav><main>Retour aux actualités Titre <script>x()</script>Partagez cet article Le texte.</main>'), 'Titre Partagez cet article Le texte.'.replace('Partagez cet article ', ''));
  assert.equal(V.estEmailCridon({ de: 'lettre@cridon-nord-est.fr', objet: 'Flash' }), true);
  assert.equal(V.estEmailCridon({ de: 'contact@cridonlyon.fr', objet: 'Le Magazine du CRIDON n° 8' }), true);
  assert.equal(V.estEmailCridon({ de: 'contact@cridonlyon.fr', objet: 'Votre consultation n° 12345 — succession' }), false, 'une consultation expose un dossier');
  assert.equal(V.estEmailCridon({ de: 'juriste@cridon-paris.fr', objet: 'RE: Flash' }), false, 'une réponse');
  assert.equal(V.estEmailCridon({ de: 'juriste@cridon-paris.fr', objet: 'Votre question' }), false);
  assert.equal(V.estEmailCridon({ de: 'client@exemple.fr', objet: 'RE: Flash CRIDON n° 12' }), false, 'un client qui répond à une lettre');
  assert.equal(V.estEmailCridon({ de: 'x@notaires.fr', objet: 'CRIDON Flash n° 12' }), false, 'pas le CRIDON lui-même');
});

test('veille notariale : CNAF + CRIDON lus, rien de nominatif ne part, source dite, jamais reprise deux fois', async () => {
  const repo = fauxRepo();
  repo.ecrireReglagesExchange && repo.ecrireReglagesExchange({});
  const env = (corps) => `<s:Envelope><s:Body>${corps}</s:Body></s:Envelope>`;
  const ews = async (corps) => {
    if (/<m:FindItem/.test(corps)) {
      return { statut: 200, corps: env('<m:FindItemResponse><m:ResponseMessages><m:FindItemResponseMessage ResponseClass="Success"><m:ResponseCode>NoError</m:ResponseCode><m:RootFolder><t:Items>'
        + '<t:Message><t:ItemId Id="cr1" ChangeKey="k"/><t:Subject>Flash CRIDON n° 42</t:Subject><t:From><t:Mailbox><t:EmailAddress>flash@cridon-paris.fr</t:EmailAddress></t:Mailbox></t:From></t:Message>'
        + '<t:Message><t:ItemId Id="cl1" ChangeKey="k"/><t:Subject>Mon dossier</t:Subject><t:From><t:Mailbox><t:EmailAddress>lea.durand@exemple.fr</t:EmailAddress></t:Mailbox></t:From></t:Message>'
        + '</t:Items></m:RootFolder></m:FindItemResponseMessage></m:ResponseMessages></m:FindItemResponse>') };
    }
    assert.ok(!/cl1/.test(corps), 'l’email d’un client n’est jamais relu');
    return { statut: 200, corps: env('<m:GetItemResponse><m:ResponseMessages><m:GetItemResponseMessage ResponseClass="Success"><m:ResponseCode>NoError</m:ResponseCode><m:Items>'
      + '<t:Message><t:ItemId Id="cr1" ChangeKey="k"/><t:Body BodyType="Text">Réforme de la réserve héréditaire. Exemple : Madame Léa DURAND, 12 rue des Lices.</t:Body></t:Message>'
      + '</m:Items></m:GetItemResponseMessage></m:ResponseMessages></m:GetItemResponse>') };
  };
  const ia = fausseIa(() => ({}));
  const d = vente({ adresseBien: 'BLOIS (41000), 12 rue des Lices' }); // une lettre qui citerait par hasard l'adresse d'un bien
  const p = creerPlanificateur({ lireUrl: fauxCnaf, posterEws: ews, parametresRepo: repo, depot: { tousActifs: () => [d], trouverParId: () => d },
    envoyer: async () => ({ ok: true }), ia, lireEmail: async () => ({ texte: '' }) });
  await p.lancer('veille-juridique', { responsable: 'Bastien ANGLUMENT', maintenant: new Date('2026-10-26T09:40:00+01:00') });
  const prompt = ia.prompts.find((x) => /SOURCES/.test(x));
  assert.ok(prompt, 'veille demandée');
  assert.ok(/CNAF — 2026-10-23 — Donation et dettes du donataire — https:\/\/www\.cnaf\.notaires\.fr\/actualites\/donation-et-dettes/.test(prompt));
  assert.ok(/CRIDON — Flash CRIDON n° 42/.test(prompt) && /réserve héréditaire/.test(prompt));
  assert.ok(!/DURAND|Léa|Lices|cridon-paris|lea\.durand/.test(prompt), 'rien de nominatif ne part');
  assert.ok(!/web_search|Légifrance/.test(prompt), 'plus de recherche web');
  assert.equal(P.lirePropositions(repo).filter((x) => x.routine === 'veille-juridique').length, 1);
  const avant = ia.prompts.length;
  await p.lancer('veille-juridique', { responsable: 'Bastien ANGLUMENT', maintenant: new Date('2026-11-02T09:40:00+01:00') });
  assert.equal(ia.prompts.length, avant, 'semaine suivante : sources déjà reprises, aucun appel');
});
