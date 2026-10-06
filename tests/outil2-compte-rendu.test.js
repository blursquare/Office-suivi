'use strict';
// Compte rendu de relecture (étude 06/10) : résumé court, alertes et points à surveiller en lignes compactes, « Validé »
// borné à un quart de page, intitulés seuls au-delà du budget de lignes ; gabarit d'impression A4. Données inventées.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app');

const app = chargerApplication();
const ligne = (id, niveau, extra) => Object.assign({ id, intitule: 'Point ' + id, niveau, commentaire: 'Commentaire du point ' + id + '. Deuxième phrase longue qui ne doit pas apparaître en entier dans le compte rendu compact.', citations: [{ document: 1, page: 3, verifie: true, extrait: 'x' }] }, extra || {});

test('texteCourtRelecture et resumeCourtRelecture : fin de phrase ou dernier mot, deux phrases au plus', () => {
  assert.equal(app.texteCourtRelecture('Une phrase. Une autre phrase assez longue pour dépasser.', 30), 'Une phrase.');
  assert.equal(app.texteCourtRelecture('Pas de ponctuation du tout dans ce texte qui déborde largement', 30), 'Pas de ponctuation du tout…');
  assert.equal(app.texteCourtRelecture('court', 30), 'court');
  assert.equal(app.resumeCourtRelecture('Première. Deuxième ! Troisième ?', 100), 'Première. Deuxième !');
  assert.equal(app.resumeCourtRelecture('', 100), '');
  assert.equal(app.commentaireCourtRelecture('Non. Le bornage manque et le plan aussi. Troisième.', 200), 'Non. Le bornage manque et le plan aussi.');
  assert.equal(app.commentaireCourtRelecture('Une seule phrase sans point final', 200), 'Une seule phrase sans point final');
  assert.ok(app.resumeCourtRelecture('A'.repeat(200) + '. ' + 'B'.repeat(200) + '.', 120).length <= 121);
});

test('planCompteRenduRelecture : alertes, à surveiller, validé par thème ; contrôles CLAIRE, contradictions et anomalies rangés par niveau', () => {
  const plan = app.planCompteRenduRelecture({
    synthese: 'Le projet est globalement conforme. Deux points bloquent. Un troisième détail sans importance.',
    sections: [
      { cle: 'parties', titre: 'Parties', lignes: [ligne('a', 'valide'), ligne('b', 'critique', { base_legale: 'C. civ. 215' }), ligne('c', 'na')] },
      { cle: 'bien', titre: 'Bien', lignes: [ligne('d', 'surveiller'), ligne('e', 'valide')] }
    ],
    claire: [{ uid: 'k1', titre: 'Procédure en cours', description: 'Une procédure est citée.', niveau: 'critique', page: 7, document: 1 }],
    contradictions: [{ uid: 'x1', titre: 'Prix différent', description: '', niveau: 'surveiller', clauses: [{ page: 2, verifie: true }, { page: 9, verifie: false }] }],
    anomalies: [{ uid: 'y1', titre: 'Servitude oubliée', description: 'd', niveau: 'critique', citations: [] }]
  });
  assert.equal(plan.resume, 'Le projet est globalement conforme. Deux points bloquent.');
  assert.equal(plan.alertes.map(i => i.intitule).join(' | '), 'Point b | Procédure en cours | Servitude oubliée');
  assert.equal(plan.alertes[0].theme, 'Parties');
  assert.equal(plan.alertes[0].base_legale, 'C. civ. 215');
  assert.equal(plan.alertes[0].commentaire, 'Commentaire du point b.', 'commentaire ramené à sa première phrase');
  assert.equal(plan.surveiller.map(i => i.intitule).join(' | '), 'Point d | Prix différent');
  assert.equal(plan.surveiller[1].citations.length, 2);
  assert.equal(plan.valides.map(v => v.theme + ':' + v.points.join('/')).join(' ; '), 'Parties:Point a ; Bien:Point e');
  assert.equal(plan.validesReste, 0);
  assert.equal(plan.nonDetailles.length, 0);
  assert.equal(JSON.stringify(plan.compte), JSON.stringify({ critique: 3, surveiller: 2, valide: 2, na: 1 }));
});

test('planCompteRenduRelecture : au-delà du budget de lignes, les points à surveiller passent en intitulés seuls ; « Validé » borné', () => {
  const lignes = [];
  for (let i = 0; i < 10; i++) lignes.push(ligne('c' + i, 'critique'));
  for (let i = 0; i < 10; i++) lignes.push(ligne('s' + i, 'surveiller'));
  for (let i = 0; i < 30; i++) lignes.push(ligne('v' + i, 'valide', { intitule: 'Point validé numéro ' + i + ' avec un intitulé assez long pour peser' }));
  const plan = app.planCompteRenduRelecture({ sections: [{ cle: 't', titre: 'Thème', lignes }] }, { lignesDetaillees: 14, validesCaracteres: 300 });
  assert.equal(plan.alertes.length, 10);
  assert.equal(plan.surveiller.length, 4);
  assert.equal(plan.nonDetailles.length, 6);
  assert.equal(plan.nonDetailles[0].intitule, 'Point s4');
  const gardes = plan.valides[0].points.length;
  assert.ok(gardes >= 3 && gardes < 30, 'validés bornés : ' + gardes);
  assert.equal(gardes + plan.validesReste, 30);
  // Plus d'alertes que le budget : les dernières alertes passent aussi en intitulés seuls.
  const plan2 = app.planCompteRenduRelecture({ sections: [{ cle: 't', titre: 'Thème', lignes }] }, { lignesDetaillees: 6 });
  assert.equal(plan2.alertes.length, 6);
  assert.equal(plan2.surveiller.length, 0);
  assert.equal(plan2.nonDetailles.length, 14);
  assert.equal(plan2.nonDetailles[0].intitule, 'Point c6');
});

test('renderCompteRenduRelecture : lignes compactes à l’écran (pastilles cliquables) et texte seul à l’impression', () => {
  const plan = app.planCompteRenduRelecture({
    sections: [{ cle: 'bien', titre: 'Bien', lignes: [ligne('a', 'critique'), ligne('b', 'valide')] }],
    contradictions: [{ uid: 'x1', titre: 'Prix', niveau: 'surveiller', clauses: [{ page: 2, verifie: false }] }]
  });
  const ecran = app.renderCompteRenduRelecture(plan, false);
  assert.match(ecran, /class="cr-bloc cr-alertes" id="relecture-section-alertes"/);
  assert.match(ecran, /class="cr-ligne niveau-critique" data-theme="bien"/);
  assert.match(ecran, /<span class="cr-theme">Bien<\/span>Point a/);
  assert.match(ecran, /class="page-chip/, 'pastille de page cliquable à l’écran');
  assert.match(ecran, /<b>Bien<\/b> : Point b/);
  assert.doesNotMatch(ecran, /Deuxième phrase longue/);
  const papier = app.renderCompteRenduRelecture(plan, true);
  assert.doesNotMatch(papier, /page-chip|onclick=/);
  assert.match(papier, /<span class="cr-page">Doc 1 · p\.3<\/span>/);
  assert.match(papier, /class="cr-page cr-page-alerte">Doc [?] · p[.]2 [?]<[/]span>/, 'citation non vérifiée marquée');
  const vide = app.renderCompteRenduRelecture(app.planCompteRenduRelecture({ sections: [] }), true);
  assert.match(vide, /Aucun point critique\./);
  assert.match(vide, /Rien à surveiller\./);
  assert.match(vide, /Aucun point validé\./);
});

test('htmlImpressionCompteRenduRelecture : en-tête, verdict, compteurs, résumé, pied — sans bouton', () => {
  const plan = app.planCompteRenduRelecture({ synthese: 'Résumé bref.', sections: [{ cle: 'bien', titre: 'Bien', lignes: [ligne('a', 'critique')] }] });
  const html = app.htmlImpressionCompteRenduRelecture(plan, { titre: 'Projet de vente', typeBien: 'Copropriété', dossier: 'VTE - MARTEL / FOURNIER', date: '06/10/2026', niveau: 'critique', compte: { critique: 1, surveiller: 0, valide: 0, na: 0 } });
  assert.match(html, /<h1>Projet de vente<\/h1>/);
  assert.match(html, /Copropriété · VTE - MARTEL \/ FOURNIER · Relecture du 06\/10\/2026/);
  assert.match(html, /Points critiques/);
  assert.match(html, /<b class="c-critique">1<\/b> critique/);
  assert.match(html, /class="cr-print-resume">Résumé bref\./);
  assert.match(html, /cr-print-pied/);
  assert.doesNotMatch(html, /wa-button|onclick/);
});
