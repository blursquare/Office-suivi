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

test('claireDoitRepondreCanal : dans « général », oui par défaut, non à un collègue ou en note à l’équipe, oui si @CLAIRE', () => {
  assert.equal(app.claireDoitRepondreCanal('Où en est le prêt ?', true, COLLABS, 'general'), true);
  assert.equal(app.claireDoitRepondreCanal('Où en est le prêt ?', false, COLLABS), false);
  assert.equal(app.claireDoitRepondreCanal('@Julie peux-tu regarder ?', true, COLLABS), false);
  assert.equal(app.claireDoitRepondreCanal('@julie et @CLAIRE, regardez', true, COLLABS), true);
  assert.equal(app.claireDoitRepondreCanal('@claire relance', false, COLLABS), false, 'note à l’équipe : jamais');
  assert.equal(app.claireDoitRepondreCanal('écrire à mail@julie.fr', true, COLLABS), true, 'une adresse n’est pas une mention');
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
  assert.equal(dansDossier.map(x => x.nom).join(','), 'Claire,Bastien,Jérémy');
  assert.equal(dansDossier.map(x => x.insere).join(','), '@Claire,@Bastien,@Jérémy');
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
  assert.deepEqual(l.map(x => x.libelle).join(','), 'Général,Bastien,Julie,Jérémy,Sophie');
  assert.deepEqual(l.map(x => x.nonLus).join(','), '3,0,2,0,1', 'muet = rien, mentions = ses mentions seules, jamais le privé de deux autres ni le groupe de trois');
  assert.equal(l[2].id, 'p:bastien-julie');
  assert.equal(l[1].vous, true);
  // Liste pas encore lue : Général seul, sans pastille.
  assert.deepEqual(app.lignesAccesRapideCanaux([], equipe, 'Bastien ANGLUMENT').map(x => x.id).join(','), 'general,moi');
  assert.equal(app.lignesAccesRapideCanaux(null, null, 'x').length, 1);
});
