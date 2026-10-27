'use strict';

// Canaux de CLAIRE (0.328.0), côté poste : les fonctions pures — rangement de la liste, qui répond, nettoyage du HTML d'un message venu d'un
// autre poste, mentions, recherche, repères d'affichage. Les gestes (ouvrir, écrire, décider) sont joués dans Chromium (npm run fumee).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const app = chargerApplication();
const COLLABS = ['Bastien ANGLUMENT', 'Julie VASSELIN', 'Jérémy SAUJOT'];

test('typeCanal et libelleCanal', () => {
  assert.equal(app.typeCanal('general'), 'general');
  assert.equal(app.typeCanal('d:p1'), 'dossier');
  assert.equal(app.typeCanal('l:compta'), 'libre');
  assert.equal(app.typeCanal('@traiter'), 'traiter');
  assert.equal(app.typeCanal('x'), '');
  assert.equal(app.libelleCanal('general', [], []), 'général');
  assert.equal(app.libelleCanal('l:compta', [{ id: 'l:compta', nom: 'Compta' }], []), 'Compta');
  assert.equal(app.libelleCanal('d:p1', [], [{ id: 'p1', nom: 'MARTIN / DURAND' }]), 'VTE - MARTIN / DURAND');
});

test('sectionsCanaux : favoris, équipe, dossiers actifs (non-lus d’abord), calmes, archivés, filtre', () => {
  const ds = [{ id: 'a', nom: 'ALPHA' }, { id: 'b', nom: 'BETA' }, { id: 'c', nom: 'GAMMA' }, { id: 'd', nom: 'DELTA', archive: true }];
  const serveur = [
    { id: 'd:b', nonLus: 0, dernierLe: 100 }, { id: 'd:a', nonLus: 2, dernierLe: 50 }, { id: 'd:c', nonLus: 0, dernierLe: 0, favori: true },
    { id: 'l:compta', nom: 'Compta', libre: true, nonLus: 1 }
  ];
  const s = app.sectionsCanaux(serveur, ds, '');
  assert.equal(s.favoris.map(e => e.id).join(','), ['d:c'].join(','));
  assert.equal(s.equipe.map(e => e.id).join(','), ['general', 'l:compta'].join(','));
  assert.equal(s.actifs.map(e => e.id).join(','), ['d:a', 'd:b'].join(','), 'les non-lus passent devant');
  assert.equal(s.calmes.map(e => e.id).join(','), [].join(','));
  assert.equal(s.archives.map(e => e.id).join(','), ['d:d'].join(','));
  assert.equal(app.sectionsCanaux(serveur, ds, 'bet').actifs.map(e => e.id).join(','), 'd:b', 'filtre sans accent ni casse');
  assert.equal(app.sectionsCanaux([], ds, '').calmes.length, 3, 'sans activité : calmes');
});

test('claireDoitRepondreCanal : dans un dossier ou un canal libre seulement si on la cite', () => {
  assert.equal(app.claireDoitRepondreCanal('Où en est le prêt ?', true, COLLABS, 'd:abc'), false);
  assert.equal(app.claireDoitRepondreCanal('Merci Julie, c’est noté', true, COLLABS, 'l:equipe'), false);
  assert.equal(app.claireDoitRepondreCanal('@CLAIRE où en est le prêt ?', true, COLLABS, 'd:abc'), true);
  assert.equal(app.claireDoitRepondreCanal('@Julie et @CLAIRE, regardez', true, COLLABS, 'l:equipe'), true);
});

test('claireDoitRepondreCanal : « général » comme les autres canaux — seulement si on la cite (0.363.0)', () => {
  assert.equal(app.claireDoitRepondreCanal('Où en est le prêt ?', true, COLLABS, 'general'), false, 'plus de réponse à tout dans général');
  assert.equal(app.claireDoitRepondreCanal('Où en est le prêt ?', true, COLLABS), false);
  assert.equal(app.claireDoitRepondreCanal('@Julie peux-tu regarder ?', true, COLLABS, 'general'), false);
  assert.equal(app.claireDoitRepondreCanal('@julie et @CLAIRE, regardez', true, COLLABS, 'general'), true);
  assert.equal(app.claireDoitRepondreCanal('@CLAIRE où en est le prêt ?', true, COLLABS, 'general'), true);
  assert.equal(app.claireDoitRepondreCanal('@claire relance', false, COLLABS), false, 'note à l’équipe : jamais');
  assert.equal(app.claireDoitRepondreCanal('écrire à mail@julie.fr', true, COLLABS), false, 'une adresse n’est pas une mention');
});

test('htmlSurCanal : mise en forme gardée, script, gestionnaires, liens piégés et styles retirés ; balises refermées', () => {
  assert.equal(app.htmlSurCanal('<p>Bonjour <b>Julie</b></p>'), '<p>Bonjour <b>Julie</b></p>');
  assert.ok(!/script/i.test(app.htmlSurCanal('<p>a</p><script>alert(1)</script>')) || app.htmlSurCanal('<script>x</script>').startsWith('&lt;'));
  assert.ok(!/<img/i.test(app.htmlSurCanal('<img src=x onerror="alert(1)">')), 'une balise inconnue est écrite en texte, jamais posée');
  assert.ok(!/onclick/i.test(app.htmlSurCanal('<p onclick="x()">t</p>')));
  assert.ok(!/javascript:/i.test(app.htmlSurCanal('<a href="javascript:alert(1)">x</a>')));
  assert.match(app.htmlSurCanal('<a href="https://exemple.fr/a?b=1&amp;c=2">x</a>'), /href="https:\/\/exemple\.fr\/a\?b=1&amp;c=2" target="_blank" rel="noopener noreferrer"/);
  assert.ok(!/style=/.test(app.htmlSurCanal('<span style="position:fixed">x</span>')));
  assert.equal(app.htmlSurCanal('<div><p>ouvert'), '<div><p>ouvert</p></div>', 'balises refermées');
  assert.equal(app.htmlSurCanal('a < b'), 'a &lt; b');
  assert.ok(!/<iframe|<object|<svg|<form|<input/i.test(app.htmlSurCanal('<iframe src=x></iframe><svg onload=1></svg><form><input></form>')));
  assert.match(app.htmlSurCanal('<span class="asst-note x-y">t</span>'), /class="asst-note"/, 'seules les classes de CLAIRE (asst-, cx-, dot-, bouton-) passent');
  assert.ok(!/class="[^"]*"/.test(app.htmlSurCanal('<span class="a&quot;b">t</span>')) || !/"b/.test(app.htmlSurCanal('<span class="a&quot;b">t</span>')));
});

test('htmlTexteCanal : échappé, retours à la ligne, mentions de collègues et de CLAIRE', () => {
  assert.equal(app.htmlTexteCanal('a <b> & c', COLLABS, 'Julie VASSELIN'), 'a &lt;b&gt; &amp; c');
  assert.equal(app.htmlTexteCanal('ligne 1\nligne 2', COLLABS, ''), 'ligne 1<br>ligne 2');
  const h = app.htmlTexteCanal('@Julie et @CLAIRE et @Inconnu', COLLABS, 'Julie VASSELIN');
  assert.match(h, /cx-mention cx-mention-moi">@Julie/);
  assert.match(h, /cx-mention-claire">@CLAIRE/);
  assert.ok(!/cx-mention[^"]*">@Inconnu/.test(h));
});

test('texteDepuisHtmlCanal, filtrerMessagesCanal, initialesCollaborateur', () => {
  assert.equal(app.texteDepuisHtmlCanal('<p>Un &amp; deux</p><p>trois<br>quatre</p>'), 'Un & deux\ntrois\nquatre');
  const ms = [{ texte: 'La taxe foncière est arrivée' }, { html: '<p>Prêt accordé</p>' }, { texte: 'RIB reçu' }];
  assert.equal(app.filtrerMessagesCanal(ms, 'pret').length, 1);
  assert.equal(app.filtrerMessagesCanal(ms, '  ').length, 3);
  assert.equal(app.filtrerMessagesCanal(ms, 'foncière')[0].texte, 'La taxe foncière est arrivée');
  assert.equal(app.initialesCollaborateur('Julie VASSELIN'), 'JV');
  assert.equal(app.initialesCollaborateur(''), '');
});

test('repereMessagesCanal : jour, groupes par auteur, séparateur « Nouveau » une seule fois, cartes jamais groupées', () => {
  const t = Date.parse('2026-10-24T09:00:00');
  const ms = [
    { auteur: 'CLAIRE', quand: t }, { auteur: 'CLAIRE', quand: t + 60000 }, { auteur: 'Julie VASSELIN', quand: t + 120000 },
    { auteur: 'Julie VASSELIN', quand: t + 20 * 60000 }, { auteur: 'CLAIRE', quand: t + 21 * 60000, carte: 'x' }, { auteur: 'Julie VASSELIN', quand: t + 25 * 3600000 }
  ];
  const r = app.repereMessagesCanal(ms, t + 90000, 'Bastien ANGLUMENT');
  assert.equal(r.map(x => x.nouveauJour).join(','), 'true,false,false,false,false,true');
  assert.equal(r.map(x => x.debutGroupe).join(','), 'true,false,true,true,true,true');
  assert.equal(r.map(x => x.nouveau).join(','), 'false,false,true,false,false,false');
  assert.equal(app.repereMessagesCanal(ms, 0, 'x').some(x => x.nouveau), false);
});

test('mentionsPourCanal : CLAIRE d’abord, collègues sans soi-même, dossiers hors canal de dossier', () => {
  const ds = [{ id: 'p1', nom: 'MARTIN / DURAND', parties: [] }];
  const dansDossier = app.mentionsPourCanal('', COLLABS, ds, false, 'Julie VASSELIN');
  assert.equal(dansDossier.map(x => x.nom).join(','), 'CLAIRE,Bastien,Jérémy');
  assert.equal(dansDossier.map(x => x.insere).join(','), '@CLAIRE,@Bastien,@Jérémy');
  assert.equal(app.mentionsPourCanal('jer', COLLABS, ds, false, 'Julie VASSELIN').map(x => x.nom).join(','), 'Jérémy');
  const general = app.mentionsPourCanal('mar', COLLABS, ds, true, 'Julie VASSELIN');
  assert.equal(general[0].type, 'dossier');
  assert.equal(general[0].id, 'p1');
});

test('messageCanalVersVue : rôle selon l’auteur, boutons gardés pour un message déjà là', () => {
  const sm = { id: 'm1', auteur: 'Julie VASSELIN', claire: false, texte: 'Bonjour', quand: 5, pj: [{ nom: 'acte.pdf' }], mentions: [] };
  assert.equal(app.messageCanalVersVue(sm, 'Julie VASSELIN').role, 'moi');
  assert.equal(app.messageCanalVersVue(sm, 'Bastien ANGLUMENT').role, 'autre');
  assert.equal(app.messageCanalVersVue(Object.assign({}, sm, { claire: true, auteur: 'CLAIRE' }), 'Bastien ANGLUMENT').role, 'claire');
  const ancien = { id: 'm1', boutons: [{ libelle: 'Ouvrir' }], role: 'claire' };
  const vue = app.messageCanalVersVue(sm, 'Julie VASSELIN', ancien);
  assert.equal(vue, ancien, 'même objet');
  assert.equal(vue.boutons.length, 1);
  assert.equal(vue.texte, 'Bonjour');
});

test('accès rapide de la barre latérale : Général puis un message privé par collègue, pastille selon la règle de l’étincelle', () => {
  const equipe = ['Bastien ANGLUMENT', 'Julie VASSELIN', 'Jérémy SAUJOT', 'Sophie GOSSART'];
  const prive = (a, b, plus) => Object.assign({ id: 'p:' + [a, b].map(n => n.split(' ')[0].toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')).sort().join('-'), prive: true, membres: [a, b], nonLus: 0, mentions: 0, notif: 'tous' }, plus || {});
  const liste = [
    { id: 'general', nonLus: 3, mentions: 1, notif: 'tous' },
    prive('Bastien ANGLUMENT', 'Julie VASSELIN', { nonLus: 2 }),
    prive('Bastien ANGLUMENT', 'Jérémy SAUJOT', { nonLus: 4, notif: 'muet' }),
    prive('Bastien ANGLUMENT', 'Sophie GOSSART', { nonLus: 5, mentions: 1, notif: 'mentions' }),
    prive('Julie VASSELIN', 'Jérémy SAUJOT', { nonLus: 9 }),
    { id: 'p:bastien-julie-sophie', prive: true, membres: ['Bastien ANGLUMENT', 'Julie VASSELIN', 'Sophie GOSSART'], nonLus: 7 }
  ];
  const l = app.lignesAccesRapideCanaux(liste, equipe, 'Bastien ANGLUMENT');
  assert.deepEqual(l.map(x => x.libelle).join(','), 'Général,Julie,Jérémy,Sophie,CLAIRE');
  assert.deepEqual(l.map(x => x.nonLus).join(','), '3,2,0,1,0', 'muet = rien, mentions = ses mentions seules, jamais le privé de deux autres ni le groupe de trois');
  assert.equal(l[1].id, 'p:bastien-julie');
  assert.equal(l[4].claire, true);
  assert.equal(app.lignesAccesRapideCanaux(liste, equipe, 'Bastien ANGLUMENT', 3)[4].nonLus, 3, 'la pastille de CLAIRE = ce qu’elle a anticipé');
  // Liste pas encore lue : Général seul, sans pastille.
  assert.deepEqual(app.lignesAccesRapideCanaux([], equipe, 'Bastien ANGLUMENT').map(x => x.id).join(','), 'general,claire');
  assert.equal(app.lignesAccesRapideCanaux(null, null, 'x').length, 2);
});

test('mes dossiers d’abord : les dossiers dont je suis responsable, les autres à part', () => {
  const ds = [{ id: 'a', nom: 'ALPHA', responsable: 'Julie VASSELIN' }, { id: 'b', nom: 'BETA', responsable: 'Jérémy SAUJOT' }, { id: 'c', nom: 'GAMMA', responsable: 'Julie VASSELIN' }];
  const serveur = [{ id: 'd:a', nonLus: 0, dernierLe: 10 }, { id: 'd:b', nonLus: 3, dernierLe: 20 }, { id: 'd:c', nonLus: 1, dernierLe: 5 }];
  const s = app.sectionsCanaux(serveur, ds, '', 'Julie VASSELIN');
  assert.equal(s.mesActifs.map(e => e.id).join(','), 'd:c,d:a');
  assert.equal(s.autresActifs.map(e => e.id).join(','), 'd:b');
  assert.equal(s.actifs.length, 3, 'la liste complète reste disponible');
  assert.equal(app.sectionsCanaux(serveur, ds, '', '').mesActifs.length, 0, 'poste sans collaborateur : tout dans les autres');
});

test('conversations avec Claire : 3 visibles, la conversation ouverte jamais cachée, « voir plus » compte le reste', () => {
  const conv = (id) => ({ id });
  const groupes = [{ titre: 'Aujourd’hui', conversations: [conv('a'), conv('b')] }, { titre: 'Hier', conversations: [conv('c'), conv('d'), conv('e')] }];
  const v = app.groupesVisiblesConversationsAssistant(groupes, '', false, 3);
  assert.equal(v.groupes.map(g => g.conversations.map(c => c.id).join('')).join('|'), 'ab|c');
  assert.equal(v.cachees, 2);
  const ouverte = app.groupesVisiblesConversationsAssistant(groupes, 'e', false, 3);
  assert.equal(ouverte.groupes[1].conversations.map(c => c.id).join(''), 'ce', 'la conversation ouverte reste visible');
  assert.equal(ouverte.cachees, 1);
  assert.equal(app.groupesVisiblesConversationsAssistant(groupes, '', true, 3).cachees, 0);
  assert.equal(app.groupesVisiblesConversationsAssistant([groupes[0]], '', false, 3).cachees, 0, 'peu de conversations : tout est montré');
});

test('profil de CLAIRE : statut selon ce qu’elle a anticipé', () => {
  const app = chargerApplication();
  assert.equal(app.statutProfilClaire(0, false).texte, 'En ligne · rien à décider');
  assert.equal(app.statutProfilClaire(1, false).texte, 'J’ai anticipé 1 chose pour vous');
  assert.equal(app.statutProfilClaire(3, false).texte, 'J’ai anticipé 3 choses pour vous');
  assert.equal(app.statutProfilClaire(3, true).etat, 'ecrit');
});

test('moment de la journée à Paris : matin, pause de midi, soir, week-end, férié', () => {
  const app = chargerApplication();
  const m = (iso) => app.momentDeLaJournee(new Date(iso));
  assert.equal(m('2026-10-27T08:30:00+01:00').moment, 'matin');   // mardi
  assert.equal(m('2026-10-27T12:30:00+01:00').moment, 'pause de midi');
  assert.equal(m('2026-10-27T15:00:00+01:00').moment, 'après-midi');
  assert.equal(m('2026-10-27T18:30:00+01:00').moment, 'fin de journée');
  assert.equal(m('2026-10-27T20:00:00+01:00').ouvre, false);
  assert.equal(m('2026-10-31T10:00:00+01:00').moment, 'week-end');   // samedi
  assert.equal(m('2026-11-11T10:00:00+01:00').moment, 'jour férié');
});

test('présence dans Authentic : nature, onglets sans intitulé de dossier, idées et carte aux heures d’ouverture', () => {
  const app = chargerApplication();
  assert.equal(app.natureLisiblePageAuthentic('client'), 'une fiche client');
  assert.equal(app.natureLisiblePageAuthentic('autre'), '');
  const onglets = [{ titre: '1 - VTE DUPONT / MARTIN', actif: true }, { titre: 'Rédaction', actif: true }, { titre: 'Pièces', actif: false }];
  assert.equal(app.ongletsActifsAuthentic({ onglets }).join('|'), 'Rédaction');
  assert.equal(app.ideesPourDossierAuthentic(0, 0, 0).length, 0);
  assert.equal(app.ideesPourDossierAuthentic(2, 1, 1).join(' ; '), '2 choses que j’ai préparées attendent votre décision ; 1 pièce manque encore ; 1 geste est dû maintenant');
  const ouvert = app.momentDeLaJournee(new Date('2026-10-27T10:00:00+01:00'));
  const midi = app.momentDeLaJournee(new Date('2026-10-27T12:30:00+01:00'));
  assert.equal(app.nudgeAuthentiqueAutorise(ouvert, 0, 1e12), true);
  assert.equal(app.nudgeAuthentiqueAutorise(ouvert, 1e12 - 1000, 1e12), false, 'une fois par dossier et par demi-journée');
  assert.equal(app.nudgeAuthentiqueAutorise(midi, 0, 1e12), false);
});

test('repousser une tâche : demain (jour ouvré), lundi, une et deux semaines', () => {
  const app = chargerApplication();
  const o = (iso) => app.optionsReportTache(iso).map(x => `${x.libelle}:${x.iso}`).join(' | ');
  // mardi 27/10/2026
  assert.equal(o('2026-10-27'), 'Demain:2026-10-28 | Lundi prochain:2026-11-02 | Dans une semaine:2026-11-03 | Dans deux semaines:2026-11-10');
  // vendredi 30/10 : demain = lundi, pas de doublon « Lundi prochain »
  assert.equal(o('2026-10-30'), 'Demain:2026-11-02 | Dans une semaine:2026-11-06 | Dans deux semaines:2026-11-13');
});

test('poste de CLAIRE : décision lue sur la demande, texte du compte rendu', () => {
  const app = chargerApplication();
  assert.equal(app.decisionValidationPosteClaire('acceptee'), true);
  assert.equal(app.decisionValidationPosteClaire('refusee'), false);
  assert.equal(app.decisionValidationPosteClaire('expiree'), false);
  assert.equal(app.decisionValidationPosteClaire('faite'), false);
  assert.equal(app.decisionValidationPosteClaire('proposee'), null);
  assert.equal(app.decisionValidationPosteClaire('vue'), null);
  assert.equal(app.texteDuMessageClaire('<p>Fait &amp; vérifié.</p><ul><li>un</li><li>deux</li></ul>'), 'Fait & vérifié.\nun\ndeux');
  assert.equal(app.POSTE_CLAIRE, false, 'une fenêtre ordinaire n’est pas le poste de CLAIRE');
});

test('travaux de CLAIRE en arrière-plan : libellé de chaque état', () => {
  const app = chargerApplication();
  assert.equal(['attente', 'en-cours', 'fini', 'erreur', 'annule'].map(e => app.libelleEtatTravailClaire({ etat: e })).join('|'), 'En attente|En cours…|Fait|Non terminé|Annulé');
});

test('messages de CLAIRE dans le fil : 3 derniers jours et non-lus, chacun à son heure parmi les échanges', () => {
  const app = chargerApplication();
  const maintenant = Date.UTC(2026, 9, 27, 12);
  const h = 3600000;
  const liste = [{ id: 'vieux-lu', quand: maintenant - 5 * 24 * h, lu: true }, { id: 'vieux-non-lu', quand: maintenant - 5 * 24 * h, lu: false }, { id: 'recent', quand: maintenant - 2 * h, maj: maintenant - h, lu: true }];
  assert.equal(app.messagesClairePourFil(maintenant, liste).map(m => m.id).join(), 'vieux-non-lu,recent');
  const entrees = app.entreesFilClaire([{ role: 'moi', quand: maintenant - 3 * h }, { role: 'claire', quand: maintenant - 30 * 60000 }], app.messagesClairePourFil(maintenant, liste));
  assert.equal(entrees.map(x => (x.notif ? x.notif.id : x.m.role)).join(), 'vieux-non-lu,moi,recent,claire');
});

test('notifications : rubrique « Messages de CLAIRE » allumée par défaut, Teams éteint ; un message de CLAIRE a sa carte une fois', () => {
  const app = chargerApplication();
  const r = app.reglagesNotificationsComplets({});
  assert.equal(r.sources.claire, true); assert.equal(r.teams, false);
  assert.equal(app.reglagesNotificationsComplets({ teams: true }).teams, true);
  const avant = { canaux: {}, propositions: [], claire: ['a@1'] };
  const apres = { canaux: {}, propositions: [], claire: ['a@2', 'b@3'] };
  assert.equal(app.elementsNouveaux(avant, apres, {}).claire.join(','), 'b', 'un groupe qui grossit ne redonne pas de carte');
  assert.equal(app.elementsNouveaux(avant, apres, { sources: { claire: false } }).claire.length, 0);
});

test('CLAIRE ajoute un contact au Répertoire : organisme exigé, code inconnu refusé, contact existant complété sans rien perdre', () => {
  const app = chargerApplication();
  const vide = { contact_id: '', theme: 'syndics', organisme: '', service: '', personnes: [], adresse: '', telephones: [], emails: [], notes: '' };
  assert.ok(app.contactRepertoireDepuisAgent(vide, null, 1).erreur);
  assert.ok(app.contactRepertoireDepuisAgent(Object.assign({}, vide, { organisme: 'Cabinet [à compléter]' }), null, 1).erreur);
  assert.ok(app.contactRepertoireDepuisAgent(Object.assign({}, vide, { organisme: 'Syndic Exemple', emails: ['pas-un-email'] }), null, 1).erreur);
  const n = app.contactRepertoireDepuisAgent(Object.assign({}, vide, { organisme: 'Syndic Exemple', emails: ['contact@syndic-exemple.fr'] }), null, 1).contact;
  assert.equal(n.theme, 'syndics'); assert.equal(n.source, 'Ajouté par CLAIRE'); assert.match(n.id, /^claire-/);
  const existant = { id: 'c1', theme: 'syndics', organisme: 'Syndic Exemple', adresse: '1 rue Inventée', telephones: ['02 00 00 00 00'], emails: [], personnes: [] };
  const c = app.contactRepertoireDepuisAgent(Object.assign({}, vide, { contact_id: 'c1', emails: ['contact@syndic-exemple.fr'] }), existant, 1).contact;
  assert.equal(c.id, 'c1'); assert.equal(c.adresse, '1 rue Inventée'); assert.equal(c.telephones.join(), '02 00 00 00 00'); assert.equal(c.emails.join(), 'contact@syndic-exemple.fr');
});

test('lui confier depuis la saisie : sa réponse dit qu’elle s’y met et la place dans la file', () => {
  const app = chargerApplication();
  assert.match(app.texteTravailConfie(1), /^C’est noté, je m’en occupe en arrière-plan/);
  assert.doesNotMatch(app.texteTravailConfie(1), /avant celui-ci/);
  assert.match(app.texteTravailConfie(3), /J’ai 2 travaux avant celui-ci/);
  assert.match(app.texteTravailConfie(2), /J’ai 1 travail avant celui-ci/);
});
