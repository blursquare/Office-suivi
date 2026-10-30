'use strict';
// Routines de CLAIRE, phase 0 (étude 24/10, cadrage docs/spec-routines-claire.md) : réglages et niveaux d'autonomie, boîte de propositions,
// journal, plafond, planificateur (résumé Teams de 9 h 30, jours ouvrés), routes. Noms et adresses inventés.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const R = require('../src/routines/reglages');
const P = require('../src/routines/propositions');
const J = require('../src/routines/journal');
const U = require('../src/routines/usage');
const { CATALOGUE } = require('../src/routines/catalogue');
const { creerPlanificateur, infosParis, texteResumeTeams, prenomDe } = require('../src/routines/planificateur');
const { proposerExemples } = require('../src/routines/essai');
const { creerApp } = require('../src/app');
const { ouvrirDb } = require('../src/db');

// Page Actualités du CNAF et boîte Exchange inventées : aucun test n'ouvre de connexion réelle.
const PAGE_CNAF_TEST = '<main><div class="actus-list"><a href="/actualites/donation-et-dettes" class="actu js-reveal"><div class="content"><p class="date">23 octobre 2026</p><h3>Donation et dettes du donataire</h3><p>Retour sur la notification au créancier.</p></div></a></div></main>';
async function fauxCnaf(url) { return url.endsWith('/actualites') ? PAGE_CNAF_TEST : '<main>Retour aux actualités Donation et dettes du donataire. La notification au créancier reste nécessaire.</main>'; }
async function fauxEws() { return { statut: 200, corps: '<s:Envelope><s:Body><m:FindItemResponse><m:ResponseMessages><m:FindItemResponseMessage ResponseClass="Success"><m:ResponseCode>NoError</m:ResponseCode><m:RootFolder><t:Items></t:Items></m:RootFolder></m:FindItemResponseMessage></m:ResponseMessages></m:FindItemResponse></s:Body></s:Envelope>' }; }

function fauxRepo(reglagesMail) {
  const m = new Map();
  return {
    lireJsonBrut: (k, def) => (m.has(k) ? JSON.parse(m.get(k)) : def),
    ecrireJsonBrut: (k, v) => { m.set(k, JSON.stringify(v)); },
    lireReglages: () => reglagesMail || {}
  };
}
const MAIL = { emailActif: true, smtpHote: 'smtp.exemple.fr', emailPasserelle: 'passerelle@exemple.fr', emailsResponsables: { 'Julie VASSELIN': 'julie@exemple.fr', 'Bastien ANGLUMENT': 'bastien@exemple.fr' } };
const lundi = (hhmm) => new Date(`2026-10-26T${hhmm}:00+01:00`); // 26/10/2026 : lundi, heure d'hiver en France
const samedi = (hhmm) => new Date(`2026-10-24T${hhmm}:00+02:00`);

test('réglages : jamais enregistrés (ou d’avant le 25/10), tout allumé au niveau 1 ; niveaux bornés par le maximum de chaque geste', () => {
  const d = R.assainirReglagesRoutines(null);
  assert.equal(d.actif, true, 'étude 25/10 : « toutes allumées, niveau 1 »');
  assert.equal(d.plafondEuros, 50);
  assert.equal(d.heure, '09:15');
  assert.equal(d.teams, true);
  assert.equal(CATALOGUE.length, Object.keys(d.routines).length);
  for (const r of CATALOGUE) assert.equal(d.routines[r.id].actif, r.id !== 'essai' && r.allumeeParDefaut !== false, r.id);
  for (const r of CATALOGUE) assert.equal(d.routines[r.id].niveau, 1);
  const s = R.assainirReglagesRoutines({ revision: R.REVISION_REGLAGES_ROUTINES, actif: true, heure: '25:99', plafondEuros: -3, routines: {
    essai: { actif: true, niveau: 3 },
    'revue-matin': { actif: true, niveau: 3, gestes: { relance: 2, tache: 3 } },
    inconnue: { actif: true }
  } });
  assert.equal(s.actif, true);
  assert.equal(s.heure, '09:15', 'heure illisible : l’heure par défaut');
  assert.equal(R.assainirReglagesRoutines({ heure: '09:30' }).heure, '09:15', 'l’ancienne heure par défaut passe à 9 h 15');
  assert.equal(R.assainirReglagesRoutines({ heure: '09:30', heureRevue: true }).heure, '09:30', 'un 9 h 30 choisi ensuite est gardé');
  assert.equal(s.plafondEuros, 50, 'plafond négatif : le défaut');
  assert.equal(s.routines.essai.actif, true);
  assert.equal(s.routines.essai.niveau, 1, 'l’essai ne dépasse pas le niveau 1');
  assert.equal(s.routines['revue-matin'].actif, true);
  assert.equal(s.routines['revue-matin'].niveau, 2, 'aucun geste n’accepte encore le niveau 3');
  assert.equal(s.routines['revue-matin'].gestes.relance, 2);
  assert.equal(s.routines['revue-matin'].gestes.tache, 1, 'le geste « tâche » plafonne au niveau 1');
  assert.equal(s.routines['constitution'].actif, false, 'un réglage enregistré fait foi');
  assert.equal(s.routines.inconnue, undefined);
});

test('niveau effectif : le niveau du geste, sinon celui de la routine, jamais au-dessus du maximum', () => {
  const s = R.assainirReglagesRoutines({ revision: R.REVISION_REGLAGES_ROUTINES, routines: { 'appel-fonds': { niveau: 3, gestes: { courrier: 2 } }, 'reponses-emails': { niveau: 3 } } });
  assert.equal(R.niveauEffectif(s, 'appel-fonds', 'courrier'), 1, 'courrier : maximum 1');
  assert.equal(R.niveauEffectif(s, 'reponses-emails', 'reponse'), 2);
  assert.equal(R.niveauEffectif(s, 'inconnue', 'x'), 1);
});

test('réglages : lecture et écriture dans la clé de l’étude', () => {
  const repo = fauxRepo();
  assert.equal(R.lireReglagesRoutines(repo).actif, true, 'jamais enregistrés : allumées');
  R.ecrireReglagesRoutines(repo, { actif: false, plafondEuros: 20.456 });
  const r = R.lireReglagesRoutines(repo);
  assert.equal(r.actif, false, 'un choix enregistré n’est jamais rallumé d’office');
  assert.equal(r.plafondEuros, 20.46);
});

test('propositions : une même proposition n’est jamais refaite, même acceptée, refusée ou expirée', () => {
  let liste = [];
  const base = { id: 'p1', routine: 'revue-matin', responsable: 'Julie VASSELIN', type: 'email', titre: 'Relance', empreinte: 'rev:d1:pret:2026-10-24' };
  liste = P.ajouterProposition(liste, base).liste;
  assert.equal(liste.length, 1);
  assert.equal(P.ajouterProposition(liste, Object.assign({}, base, { id: 'p2' })).ajoutee, null);
  liste = P.decider(liste, 'p1', 'refusee', 'Julie VASSELIN').liste;
  assert.equal(P.ajouterProposition(liste, Object.assign({}, base, { id: 'p3' })).ajoutee, null, 'refusée : pas refaite');
  // Même empreinte pour un autre collaborateur (dossier qui a changé de responsable) : une proposition traitée n'est jamais refaite.
  const autre = P.ajouterProposition(liste, Object.assign({}, base, { id: 'p4', responsable: 'Jérémy SAUJOT' }));
  assert.equal(autre.ajoutee, null);
  assert.equal(autre.reattribuee, null);
});

test('propositions : une proposition en attente suit le dossier chez son nouveau responsable, sans doublon (26/10)', () => {
  const base = { id: 'p1', routine: 'revue-matin', responsable: 'Julie VASSELIN', type: 'email', titre: 'Relance', empreinte: 'rev:d1:pret:2026-10-24' };
  let liste = P.ajouterProposition([], base).liste;
  const r = P.ajouterProposition(liste, Object.assign({}, base, { id: 'p2', responsable: 'Sophie GOSSART' }));
  assert.equal(r.ajoutee, null);
  assert.equal(r.liste.length, 1, 'jamais deux propositions pour le même geste');
  assert.equal(r.liste[0].responsable, 'Sophie GOSSART');
  assert.equal(r.liste[0].id, 'p1', 'même proposition, même carte');
  assert.equal(r.reattribuee.avant, 'Julie VASSELIN');
  // Même responsable : rien.
  assert.equal(P.ajouterProposition(r.liste, Object.assign({}, base, { responsable: 'Sophie GOSSART' })).reattribuee, null);
});

test('propositions : une décision est définitive, « vue » ne rétrograde rien, un type ou un titre vides sont refusés', () => {
  let liste = P.ajouterProposition([], { id: 'a', routine: 'r', responsable: 'Julie VASSELIN', type: 'tache', titre: 'T' }).liste;
  liste = P.decider(liste, 'a', 'vue', 'Julie VASSELIN').liste;
  assert.equal(liste[0].etat, 'vue');
  liste = P.decider(liste, 'a', 'acceptee', 'Julie VASSELIN', new Date('2026-10-24T10:00:00Z')).liste;
  assert.equal(liste[0].etat, 'acceptee');
  assert.equal(liste[0].traitePar, 'Julie VASSELIN');
  assert.equal(P.decider(liste, 'a', 'refusee', 'Julie VASSELIN').liste[0].etat, 'acceptee', 'un double clic ne défait pas la décision');
  assert.equal(P.decider(liste, 'a', 'vue', 'Julie VASSELIN').liste[0].etat, 'acceptee');
  assert.equal(P.decider(liste, 'inconnu', 'vue', 'x').proposition, null);
  assert.equal(P.ajouterProposition([], { id: 'b', type: 'inconnu', titre: 'T' }).ajoutee, null);
  assert.equal(P.ajouterProposition([], { id: 'b', type: 'email', titre: '   ' }).ajoutee, null);
});

test('propositions : 30 jours sans réponse = expirée ; la liste d’un collaborateur ne montre pas celle des autres', () => {
  const t0 = new Date('2026-09-01T09:00:00Z');
  let liste = P.ajouterProposition([], { id: 'a', routine: 'r', responsable: 'Julie VASSELIN', type: 'alerte', titre: 'Ancienne' }, t0).liste;
  liste = P.ajouterProposition(liste, { id: 'b', routine: 'r', responsable: 'Jérémy SAUJOT', type: 'alerte', titre: 'Autre' }, new Date('2026-10-20T09:00:00Z')).liste;
  const apres = P.expirer(liste, new Date('2026-10-24T09:00:00Z'));
  assert.equal(apres.find(p => p.id === 'a').etat, 'expiree');
  assert.equal(apres.find(p => p.id === 'b').etat, 'proposee');
  assert.equal(P.expirer(apres, new Date('2026-10-24T09:00:00Z')), apres, 'rien de plus à expirer : la même liste');
  assert.equal(P.compterATraiter(apres, 'Julie VASSELIN'), 0);
  assert.equal(P.compterATraiter(apres, 'Jérémy SAUJOT'), 1);
  assert.equal(P.compterATraiter(apres, 'Julie VASSELIN', true), 1, 'vue de tous');
  assert.deepEqual(P.listerPropositions(apres, { responsable: 'Julie VASSELIN', etats: ['proposee', 'vue'] }), []);
});

test('statistiques : le taux d’acceptation compte les décidées ; la promotion est proposée à 90 % sur 30 ; les exemples ne comptent pas', () => {
  let liste = [];
  const ajoute = (n, etat, exemple) => { for (let i = 0; i < n; i++) liste.push({ id: `${etat}${exemple ? 'x' : ''}${liste.length}`, routine: 'revue-matin', etat, exemple: !!exemple }); };
  ajoute(27, 'acceptee'); ajoute(2, 'refusee'); ajoute(1, 'proposee');
  let s = P.statsRoutine(liste, 'revue-matin');
  assert.equal(s.decidees, 29);
  assert.equal(s.promotionPossible, false, '29 décidées : pas encore 30');
  ajoute(1, 'acceptee');
  s = P.statsRoutine(liste, 'revue-matin');
  assert.equal(s.decidees, 30);
  assert.equal(Math.round(s.taux * 1000) / 1000, 0.933);
  assert.equal(s.promotionPossible, true);
  ajoute(10, 'refusee');
  assert.equal(P.statsRoutine(liste, 'revue-matin').promotionPossible, false, '28 sur 40 : sous 90 %');
  ajoute(100, 'acceptee', true);
  assert.equal(P.statsRoutine(liste, 'revue-matin').decidees, 40, 'les exemples ne comptent pas');
  assert.equal(P.statsRoutine([], 'revue-matin').taux, null);
});

test('journal : un libellé neutre borné, signé CLAIRE, 300 lignes au plus ; une entrée sans texte ou sans date est écartée', () => {
  const repo = fauxRepo();
  J.noterJournalRoutines(repo, { routine: 'essai', texte: '4 propositions déposées', niveau: 2 }, new Date('2026-10-24T09:00:00Z'));
  const l = J.lireJournalRoutines(repo);
  assert.equal(l.length, 1);
  assert.equal(l[0].auteur, 'CLAIRE');
  assert.equal(l[0].niveau, 2);
  assert.equal(J.ajouterAuJournal(l, { texte: '' }), l);
  assert.equal(J.ajouterAuJournal(l, { texte: 'x'.repeat(1000) }).slice(-1)[0].texte.length, 240);
  let gros = [];
  for (let i = 0; i < 350; i++) gros = J.ajouterAuJournal(gros, { texte: `ligne ${i}` });
  assert.equal(gros.length, 300);
});

test('plafond mensuel : la dépense repart de zéro chaque mois, le plafond atteint coupe l’IA', () => {
  const repo = fauxRepo();
  const oct = new Date('2026-10-24T09:00:00Z');
  U.ajouterDepenseRoutines(repo, { euros: 12.5, jetons: 4000 }, oct);
  U.ajouterDepenseRoutines(repo, { euros: 37.5, jetons: 6000 }, oct);
  const u = U.lireUsageRoutines(repo, oct);
  assert.equal(u.euros, 50);
  assert.equal(u.jetons, 10000);
  assert.equal(U.plafondAtteint({ plafondEuros: 50 }, u), true);
  assert.equal(U.plafondAtteint({ plafondEuros: 60 }, u), false);
  assert.equal(U.lireUsageRoutines(repo, new Date('2026-11-02T09:00:00Z')).euros, 0, 'nouveau mois : zéro');
  assert.equal(U.plafondAtteint({ plafondEuros: 0 }, { euros: 0 }), true, '0 € = IA coupée');
});

test('essai : une proposition de chaque sorte, des exemples sans aucun dossier réel, jamais en double le même jour', () => {
  const ex = proposerExemples({ responsable: 'Julie VASSELIN', jour: '2026-10-24' });
  assert.deepEqual(ex.map(e => e.type).sort(), ['alerte', 'document', 'email', 'tache']);
  assert.ok(ex.every(e => e.exemple && !e.dossierId && /^Exemple/.test(e.titre)));
  let liste = [];
  for (const e of ex) liste = P.ajouterProposition(liste, e).liste;
  for (const e of proposerExemples({ responsable: 'Julie VASSELIN', jour: '2026-10-24' })) assert.equal(P.ajouterProposition(liste, e).ajoutee, null);
  assert.equal(liste.length, 4);
});

test('heure de Paris : jour ouvré ou non, heure d’hiver comme d’été', () => {
  assert.deepEqual(infosParis(lundi('09:30')), { iso: '2026-10-26', hhmm: '09:30', jour: 1, ouvre: true });
  assert.equal(infosParis(samedi('09:30')).ouvre, false);
  assert.equal(infosParis(new Date('2026-07-15T07:30:00Z')).hhmm, '09:30', 'été : UTC+2');
  assert.equal(prenomDe('Jérémy SAUJOT'), 'Jérémy');
});

test('résumé Teams : un message groupé par collaborateur, jamais une alerte par proposition', () => {
  const t = texteResumeTeams('Julie VASSELIN', [{ titre: 'Relance du prêt', dossierId: 'd1' }, { titre: 'Courrier de la mairie', dossierId: '' }], (id) => (id === 'd1' ? 'VTE - MARTIN' : ''));
  assert.match(t, /Bonjour Julie, j’ai préparé 2 choses/);
  assert.match(t, /• Relance du prêt — VTE - MARTIN/);
  assert.match(t, /• Courrier de la mairie\n/);
  assert.match(t, /Rien ne part sans votre clic/);
  const beaucoup = texteResumeTeams('Julie VASSELIN', Array.from({ length: 9 }, (_, i) => ({ titre: `T${i}` })), () => '');
  assert.match(beaucoup, /… et 3 autres/);
});

async function planifier(options, fn) {
  const repo = fauxRepo(MAIL);
  const envois = [];
  const envoyer = async (reglages, adresse, texte) => { envois.push({ adresse, texte }); return options.echec ? { ok: false, erreur: 'refusé' } : { ok: true }; };
  const p = creerPlanificateur({ lireUrl: fauxCnaf, posterEws: fauxEws, parametresRepo: repo, depot: { trouverParId: () => ({ nom: 'MARTIN / DURAND', typeAffaire: 'vente' }) }, envoyer });
  R.ecrireReglagesRoutines(repo, Object.assign({ actif: true }, options.reglages || {}));
  let liste = [];
  for (const [i, titre] of ['Relance du prêt', 'Appel de fonds'].entries()) liste = P.ajouterProposition(liste, { id: `n${i}`, routine: 'revue-matin', responsable: 'Julie VASSELIN', dossierId: 'd1', type: 'email', titre, empreinte: `e${i}` }, new Date('2026-10-23T16:00:00Z')).liste;
  liste = P.ajouterProposition(liste, { id: 'ex', routine: 'essai', responsable: 'Julie VASSELIN', type: 'alerte', titre: 'Exemple', exemple: true, empreinte: 'ex' }).liste;
  liste = P.ajouterProposition(liste, { id: 'sans-adresse', routine: 'revue-matin', responsable: 'Jérémy SAUJOT', type: 'alerte', titre: 'Sans adresse', empreinte: 's' }).liste;
  P.ecrirePropositions(repo, liste);
  await fn({ repo, p, envois });
}

test('planificateur : le résumé part à 9 h 15 un jour ouvré, une fois, sans les exemples ni ceux dont le collaborateur n’a pas d’adresse', async () => {
  await planifier({}, async ({ repo, p, envois }) => {
    await p.tour(lundi('09:14'));
    assert.equal(envois.length, 0, 'avant l’heure');
    const bilan = await p.tour(lundi('09:16'));
    assert.equal(bilan.resumes, 1);
    assert.equal(envois.length, 1);
    assert.equal(envois[0].adresse, 'julie@exemple.fr');
    assert.match(envois[0].texte, /2 choses/);
    assert.match(envois[0].texte, /Relance du prêt — VTE - MARTIN \/ DURAND/);
    assert.ok(P.lirePropositions(repo).filter(x => x.resumeTeamsLe).every(x => x.responsable === 'Julie VASSELIN' && !x.exemple));
    await p.tour(lundi('11:00'));
    assert.equal(envois.length, 1, 'une seule fois par jour');
    assert.match(J.lireJournalRoutines(repo).map(e => e.texte).join(' | '), /Résumé Teams envoyé à 1 collaborateur \(2 propositions\)/);
  });
});

test('planificateur : rien le week-end, rien si les routines sont éteintes ou le résumé Teams coupé', async () => {
  await planifier({}, async ({ p, envois }) => { await p.tour(samedi('10:00')); assert.equal(envois.length, 0); });
  await planifier({ reglages: { actif: false } }, async ({ p, envois }) => { await p.tour(lundi('10:00')); assert.equal(envois.length, 0); });
  await planifier({ reglages: { teams: false } }, async ({ p, envois }) => { await p.tour(lundi('10:00')); assert.equal(envois.length, 0); });
});

test('planificateur : un envoi refusé est noté au journal, la proposition n’est pas marquée envoyée et le tour ne boucle pas', async () => {
  await planifier({ echec: true }, async ({ repo, p, envois }) => {
    await p.tour(lundi('10:00'));
    await p.tour(lundi('10:05'));
    assert.equal(envois.length, 1, 'jamais réessayé le même jour');
    assert.ok(P.lirePropositions(repo).every(x => !x.resumeTeamsLe));
    assert.match(J.lireJournalRoutines(repo).map(e => e.texte).join(' | '), /non envoyé à Julie : refusé/);
  });
});

test('planificateur : l’envoi non configuré est dit au journal, rien ne part', async () => {
  const repo = fauxRepo({});
  const envois = [];
  const p = creerPlanificateur({ lireUrl: fauxCnaf, posterEws: fauxEws, parametresRepo: repo, depot: null, envoyer: async () => { envois.push(1); return { ok: true }; } });
  R.ecrireReglagesRoutines(repo, { actif: true });
  P.ecrirePropositions(repo, P.ajouterProposition([], { id: 'a', routine: 'r', responsable: 'Julie VASSELIN', type: 'alerte', titre: 'T', empreinte: 'a' }).liste);
  await p.tour(lundi('10:00'));
  assert.equal(envois.length, 0);
  assert.match(J.lireJournalRoutines(repo).map(e => e.texte).join(' | '), /n’est pas configuré/);
});

test('planificateur : « Lancer » dépose les exemples dans la boîte, une seule fois par jour, et lance une routine construite', async () => {
  const repo = fauxRepo();
  const p = creerPlanificateur({ lireUrl: fauxCnaf, posterEws: fauxEws, parametresRepo: repo });
  const a = p.lancer('essai', { responsable: 'Julie VASSELIN', maintenant: lundi('10:00') });
  assert.equal(a.ok, true);
  assert.equal(a.ajoutees, 4);
  const b = p.lancer('essai', { responsable: 'Julie VASSELIN', maintenant: lundi('11:00') });
  assert.equal(b.ajoutees, 0);
  assert.match(b.message, /déjà dans la boîte/);
  assert.equal(p.lancer('essai', { responsable: 'Julie VASSELIN', maintenant: new Date('2026-10-27T10:00:00+01:00') }).ajoutees, 4, 'le lendemain : de nouveaux exemples');
  assert.equal((await p.lancer('revue-matin', { responsable: 'Julie VASSELIN' })).ok, true, 'routine construite (25/10) : lancée sur les dossiers');
  assert.equal(p.lancer('inconnue', { responsable: 'Julie VASSELIN' }).ok, false);
  assert.equal(p.lancer('essai', { responsable: '' }).ok, false);
});

async function avecServeur(fn) {
  const db = ouvrirDb(':memory:');
  const { app } = creerApp({ db, config: { authActive: false, estSea: () => false, racineRepo: process.cwd() + '/..' } });
  const srv = app.listen(0);
  await new Promise(r => srv.once('listening', r));
  const B = 'http://127.0.0.1:' + srv.address().port;
  const j = async (u, opts) => { const r = await fetch(B + u, opts && opts.corps ? { method: opts.methode || 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(opts.corps) } : { method: (opts && opts.methode) || 'GET' }); return { statut: r.status, corps: await r.json() }; };
  try { await fn(j); } finally { srv.close(); }
}

test('routes : état, réglages fusionnés sans effacer les routines inconnues du poste, lancement, boîte, décision, journal', async () => {
  await avecServeur(async (j) => {
    const e = await j('/api/routines');
    assert.equal(e.statut, 200);
    assert.equal(e.corps.catalogue.length, CATALOGUE.length);
    assert.equal(e.corps.reglages.actif, true);
    assert.equal(e.corps.niveaux.length, 3);
    assert.equal(e.corps.catalogue[0].stats.total, 0);
    // Un poste qui n'envoie que le plafond et une routine ne touche pas aux autres.
    assert.equal((await j('/api/routines/reglages', { methode: 'PUT', corps: { auteur: 'Julie VASSELIN', plafondEuros: 9000 } })).statut, 403, 'le plafond : administrateur seulement');
    assert.equal((await j('/api/routines/reglages', { methode: 'PUT', corps: { auteur: 'Julie VASSELIN', routines: { constitution: { actif: false } } } })).statut, 403, 'éteindre une routine : administrateur seulement');
    const m = await j('/api/routines/reglages', { methode: 'PUT', corps: { auteur: 'Bastien ANGLUMENT', plafondEuros: 30, routines: { 'veille-signature': { actif: false } } } });
    assert.equal(m.corps.plafondEuros, 30);
    assert.equal(m.corps.routines['veille-signature'].actif, false);
    assert.equal(m.corps.routines['constitution'].actif, true, 'les autres routines restent allumées');
    assert.equal(m.corps.routines['constitution'].niveau, 1);
    assert.equal((await j('/api/routines/reglages', { methode: 'PUT', corps: [] })).statut, 400);

    assert.equal((await j('/api/routines/essai/lancer', { corps: { responsable: 'Quelqu’un' } })).statut, 400);
    assert.equal((await j('/api/routines/revue-matin/lancer', { corps: { responsable: 'Julie VASSELIN' } })).statut, 200);
    const l = await j('/api/routines/essai/lancer', { corps: { responsable: 'Julie VASSELIN' } });
    assert.equal(l.statut, 200);
    assert.equal(l.corps.ajoutees, 4);

    assert.equal((await j('/api/propositions?utilisateur=Inconnu')).statut, 400);
    const boite = await j('/api/propositions?utilisateur=Julie%20VASSELIN&etat=a-traiter');
    assert.equal(boite.corps.aTraiter, 4);
    assert.equal(boite.corps.propositions.length, 4);
    assert.equal((await j('/api/propositions?utilisateur=J%C3%A9r%C3%A9my%20SAUJOT')).corps.propositions.length, 0, 'la boîte d’un autre collaborateur');
    assert.equal((await j('/api/propositions?utilisateur=J%C3%A9r%C3%A9my%20SAUJOT&tous=1')).corps.propositions.length, 0, '« tous » réservé à l’administrateur');
    assert.equal((await j('/api/propositions?utilisateur=Bastien%20ANGLUMENT&tous=1')).corps.propositions.length, 4, 'l’administrateur voit tout');

    const id = boite.corps.propositions[0].id;
    assert.equal((await j(`/api/propositions/${id}/decision`, { corps: { auteur: 'Julie VASSELIN', decision: 'n’importe quoi' } })).statut, 400);
    assert.equal((await j(`/api/propositions/${id}/decision`, { corps: { auteur: 'Personne', decision: 'acceptee' } })).statut, 400);
    assert.equal((await j('/api/propositions/inconnue/decision', { corps: { auteur: 'Julie VASSELIN', decision: 'acceptee' } })).statut, 404);
    const d = await j(`/api/propositions/${id}/decision`, { corps: { auteur: 'Julie VASSELIN', decision: 'acceptee' } });
    assert.equal(d.corps.proposition.etat, 'acceptee');
    assert.equal((await j('/api/propositions?utilisateur=Julie%20VASSELIN&etat=a-traiter')).corps.aTraiter, 3);
    assert.equal((await j('/api/propositions?utilisateur=Julie%20VASSELIN&etat=traitees')).corps.propositions.length, 1);
    const jr = await j('/api/routines/journal');
    assert.match(jr.corps.entrees[0].texte, /4 propositions d’exemple/);
  });
});

test('niveau 2 d’un geste vers l’extérieur (CLAIRE envoie après « Autoriser ») : réservé à l’administrateur, comme le niveau 3', async () => {
  await avecServeur(async (j) => {
    const demande = (auteur, niveau) => j('/api/routines/reglages', { methode: 'PUT', corps: { auteur, routines: { 'reponses-emails': { gestes: { reponse: niveau } } } } });
    assert.equal((await demande('Julie VASSELIN', 2)).statut, 403, 'un collaborateur ne peut pas');
    const ok = await demande('Bastien ANGLUMENT', 2);
    assert.equal(ok.statut, 200);
    assert.equal(ok.corps.routines['reponses-emails'].gestes.reponse, 2);
    // Un geste interne (pas vers l'extérieur) au niveau 2 reste ouvert à tous.
    const interne = await j('/api/routines/reglages', { methode: 'PUT', corps: { auteur: 'Julie VASSELIN', routines: { 'revue-matin': { gestes: { tache: 1 } } } } });
    assert.equal(interne.statut, 200);
  });
});

test('statistiques : une alerte ne compte jamais dans le taux d’acceptation', () => {
  const liste = [
    { id: 'a', routine: 'revue-matin', etat: 'acceptee', type: 'alerte' },
    { id: 'b', routine: 'revue-matin', etat: 'refusee', type: 'tache' }
  ];
  const s = P.statsRoutine(liste, 'revue-matin');
  assert.equal(s.decidees, 1);
  assert.equal(s.acceptees, 0);
});

test('résumé Teams : le titre tient sur une ligne et ne porte aucun lien', () => {
  const t = texteResumeTeams('Julie VASSELIN', [{ titre: 'Relancer\nle client http://exemple.fr/x vite' }], () => '');
  assert.ok(t.includes('• Relancer le client vite'));
  assert.ok(!t.includes('http'));
});

test('propositions : « déjà fait » ferme sans exécuter, « plus tard » masque jusqu’à 8 h puis revient, « reprendre » la rend', () => {
  const maintenant = new Date('2026-10-26T18:00:00Z'); // lundi soir
  let liste = P.ajouterProposition([], { id: 'a', routine: 'r', responsable: 'Julie VASSELIN', type: 'tache', titre: 'T' }).liste;
  liste = P.decider(liste, 'a', 'reporter', 'Julie VASSELIN', maintenant, { quand: 'demain' }).liste;
  assert.equal(liste[0].etat, 'proposee');
  assert.equal(P.estReportee(liste[0], maintenant), true);
  assert.equal(P.compterATraiter(liste, 'Julie VASSELIN', false, maintenant), 0, 'reportée : plus comptée');
  assert.equal(P.listerPropositions(liste, { responsable: 'Julie VASSELIN', etats: ['proposee', 'vue'], reportees: false, maintenant }).length, 0);
  assert.equal(P.listerPropositions(liste, { responsable: 'Julie VASSELIN', etats: ['proposee', 'vue'], reportees: true, maintenant }).length, 1);
  assert.equal(P.estReportee(liste[0], new Date('2026-10-27T08:00:00Z')), false, 'revenue le lendemain à 8 h');
  liste = P.decider(liste, 'a', 'reporter', 'Julie VASSELIN', maintenant, { quand: 'reprendre' }).liste;
  assert.equal(P.estReportee(liste[0], maintenant), false);
  liste = P.decider(liste, 'a', 'faite', 'Julie VASSELIN', maintenant).liste;
  assert.equal(liste[0].etat, 'faite');
  assert.equal(P.decider(liste, 'a', 'refusee', 'Julie VASSELIN').liste[0].etat, 'faite', 'définitif');
});

// Étude 27/10 : « quand une routine est faite, comment indiquer que c'est terminé ? la constitution est terminée mais Claire ne le sait pas ».
test('terminée : une proposition autorisée se termine (🏁), une encore à décider passe « faite » ; la constitution faite n’est plus proposée', () => {
  const P = require('../src/routines/propositions');
  const E = require('../src/canaux/etatCartes');
  const X = require('../src/routines/executants');
  const base = { routine: 'constitution', dossierId: 'd1', type: 'document', titre: 'Constitution', resume: '', creeLe: '2026-10-27T08:00:00Z' };
  let liste = [P.assainirProposition(Object.assign({ id: 'p1', etat: 'acceptee', traitePar: 'Bastien ANGLUMENT' }, base)), P.assainirProposition(Object.assign({ id: 'p2', etat: 'proposee' }, base, { dossierId: 'd2' }))];
  const r = P.terminerParDossier(liste, 'd1', 'constitution', 'Julie VASSELIN', new Date('2026-10-27T18:00:00Z'));
  assert.equal(r.touchees.length, 1);
  assert.equal(r.liste[0].etat, 'acceptee');
  assert.equal(r.liste[0].termineePar, 'Julie VASSELIN');
  assert.equal(E.emojiEtatCarte(r.liste[0], Date.now()), '🏁');
  assert.equal(P.terminerParDossier(r.liste, 'd1', 'constitution', 'Julie VASSELIN').touchees.length, 0, 'jamais deux fois');
  const ouverte = P.decider(r.liste, 'p2', 'terminee', 'Bastien ANGLUMENT');
  assert.equal(ouverte.proposition.etat, 'faite');
  assert.ok(ouverte.proposition.termineeLe);
  liste = [P.assainirProposition(Object.assign({ id: 'p3', etat: 'refusee' }, base))];
  assert.equal(P.decider(liste, 'p3', 'terminee', 'Bastien ANGLUMENT').proposition.termineeLe, '', 'une refusée ne se termine pas');
  const dossier = { id: 'd9', nom: 'ESSAI', typeAffaire: 'succession', parties: [], historique: [{ date: '2026-10-26T09:00:00Z', texte: 'Dossier créé' }], constitutionFaiteLe: '2026-10-27' };
  assert.equal(X.constitutionDossier([dossier], '2026-10-27', { niveau: () => 1 }).length, 0, 'constitution déjà faite : rien à proposer');
});

test('« À traiter » (étude 27/10) : une proposition autorisée (document, tâche) reste à traiter jusqu’à « Terminé » ; une alerte lue en sort', () => {
  const maintenant = new Date('2026-10-28T09:00:00Z');
  const liste = [
    { id: 'a', responsable: 'Julie VASSELIN', etat: 'acceptee', type: 'document', traiteLe: '2026-10-28T08:00:00Z', creeLe: '2026-10-27T08:00:00Z' },
    { id: 'b', responsable: 'Julie VASSELIN', etat: 'acceptee', type: 'document', traiteLe: '2026-10-28T08:00:00Z', termineeLe: '2026-10-28T08:30:00Z', creeLe: '2026-10-27T08:00:00Z' },
    { id: 'c', responsable: 'Julie VASSELIN', etat: 'acceptee', type: 'email', traiteLe: '2026-10-28T08:00:00Z', creeLe: '2026-10-27T08:00:00Z' },
    { id: 'd', responsable: 'Julie VASSELIN', etat: 'vue', type: 'tache', creeLe: '2026-10-27T08:00:00Z' },
    { id: 'e', responsable: 'Julie VASSELIN', etat: 'acceptee', type: 'tache', traiteLe: '2026-10-26T08:00:00Z', creeLe: '2026-10-25T08:00:00Z' },
    { id: 'f', responsable: 'Julie VASSELIN', etat: 'vue', type: 'alerte', creeLe: '2026-10-27T08:00:00Z' }];
  assert.equal(P.compterATraiter(liste, 'Julie VASSELIN', false, maintenant), 2, 'la vue et l’autorisée récente non terminée');
  assert.deepEqual(P.listerPropositions(liste, { responsable: 'Julie VASSELIN', etats: ['proposee', 'vue'], enCours: true, maintenant }).map((p) => p.id).sort(), ['a', 'd']);
  assert.equal(P.enCoursProposition(liste[2], maintenant), false, 'un email autorisé est parti par sa fenêtre : rien à terminer');
  assert.equal(P.enCoursProposition(liste[4], maintenant), false, 'autorisée avant le bouton « Terminé » : ne revient pas');
  assert.equal(P.enCoursProposition(liste[0], new Date('2026-11-06T09:00:00Z')), false, 'plus de 7 jours : sortie');
  assert.equal(P.aDeciderProposition(liste[5]), false, 'une alerte vue est lue');
});
