'use strict';

// Regroupement des échéances par semaine pour la vue "Échéances" du Suivi (voir la section
// « SUIVI : regroupement des échéances par semaine » dans script.js). Le point qui compte :
// UNE LIGNE = UN DOSSIER, à sa prochaine échéance EN ATTENTE. La première version listait toutes
// les échéances de chaque dossier, qui figurait donc sous chaque semaine où il avait une date —
// l'étude a demandé l'inverse : on ne montre que ce qu'il y a à faire maintenant, la suivante
// apparaît quand celle-ci est passée ou validée (voir echeanceValidee).
//
// La date du jour est toujours injectée : les fonctions restent pures et les tests reproductibles.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

// Mardi 15 septembre 2026. La semaine ISO correspondante commence le lundi 14.
const AUJOURDHUI = '2026-09-15';
const LUNDI = '2026-09-14';

function dossier(nom, champs) {
  return Object.assign({ id: nom, nom, responsable: 'Julie VASSELIN', pret: '', acte: '', ventebien: '', autres: [] }, champs);
}

test('debutSemaine ramène au lundi, dimanche compris', () => {
  const app = chargerApplication();
  assert.equal(app.debutSemaine('2026-09-14'), LUNDI); // déjà un lundi
  assert.equal(app.debutSemaine('2026-09-15'), LUNDI); // mardi
  // Dimanche : getDay() vaut 0, le piège classique du calcul de semaine ISO — il appartient à la
  // semaine qui a commencé le lundi précédent, pas à celle qui commence le lendemain.
  assert.equal(app.debutSemaine('2026-09-20'), LUNDI);
  assert.equal(app.debutSemaine('2026-09-21'), '2026-09-21'); // lundi suivant
});

test('debutSemaine ne plante pas sur une date absente ou invalide', () => {
  const app = chargerApplication();
  assert.equal(app.debutSemaine(''), null);
  assert.equal(app.debutSemaine(null), null);
  assert.equal(app.debutSemaine('pas une date'), null);
});

test('toutesEcheances renvoie TOUTES les échéances, pas seulement la plus proche', () => {
  // La DATE BUTOIR n'en fait pas partie : elle vient de l'avant-contrat et n'est qu'indicative —
  // c'est le rendez-vous pris à l'office qui engage l'étude (règle donnée par l'étude).
  const app = chargerApplication();
  const d = dossier('DUPONT / MARTIN', {
    pret: '2026-09-18', acte: '2026-12-15', ventebien: '2026-10-02',
    autres: [{ label: 'Diagnostic amiante', date: '2026-09-25' }]
  });
  assert.equal(app.toutesEcheances(d).map(e => e.type).sort().join(','), 'autre,pret,ventebien');
});

test('une offre de prêt déjà reçue retire son échéance du planning', () => {
  // La condition est résolue : la laisser apparaître donnerait du travail qui n'existe plus —
  // même exclusion que prochaineEcheanceDetail() dans la vue tableau.
  const app = chargerApplication();
  const d = dossier('X', { pret: '2026-09-18', ventebien: '2026-12-15', offrePretStatut: 'recue' });
  assert.equal(app.toutesEcheances(d).map(e => e.type).join(','), 'ventebien');
});

test('un dossier n’apparaît QU’UNE fois, à sa prochaine échéance en attente', () => {
  // Règle posée par l'étude : tant que la date butoir en attente n'est pas passée, le dossier ne
  // doit pas figurer une seconde fois plus loin. La première version listait toutes ses échéances.
  const app = chargerApplication();
  const d = dossier('DUPONT / MARTIN', { pret: '2026-09-17', ventebien: '2026-09-24' });
  const groupes = app.grouperEcheancesParSemaine([d], AUJOURDHUI);
  assert.equal(groupes.length, 1);
  assert.equal(groupes[0].items.length, 1);
  assert.equal(groupes[0].items[0].echeance.type, 'pret');
});

test('valider une échéance fait apparaître la suivante', () => {
  const app = chargerApplication();
  const d = dossier('DUPONT / MARTIN', { ventebien: '2026-09-17', pret: '2026-09-24' });
  assert.equal(app.grouperEcheancesParSemaine([d], AUJOURDHUI)[0].items[0].echeance.type, 'ventebien');
  // Réalisée : la date reste au dossier pour mémoire, mais ce n'est plus ce qu'il y a à surveiller.
  d.echeancesValidees = { ventebien: true };
  const apres = app.grouperEcheancesParSemaine([d], AUJOURDHUI);
  assert.equal(apres[0].items[0].echeance.type, 'pret');
  assert.equal(app.toutesEcheances(d).map(e => e.type).join(','), 'pret');
  assert.equal(app.prochaineEcheanceDetail(d).type, 'pret');
});

test('une offre de prêt reçue vaut échéance validée, sans drapeau supplémentaire', () => {
  // Le mécanisme générique ne double pas celui qui existait déjà pour le prêt.
  const app = chargerApplication();
  const d = dossier('X', { pret: '2026-09-18', offrePretStatut: 'recue' });
  assert.equal(app.echeanceValidee(d, 'pret'), true);
  assert.equal(app.echeanceValidee(d, 'acte'), false);
});

test('les échéances passées tombent dans « En retard », en tête', () => {
  const app = chargerApplication();
  const groupes = app.grouperEcheancesParSemaine([
    dossier('EN RETARD', { autres: [{ label: 'Échéance', date: '2026-08-20' }] }),
    dossier('CETTE SEMAINE', { autres: [{ label: 'Échéance', date: '2026-09-17' }] })
  ], AUJOURDHUI);
  assert.equal(groupes[0].cle, 'retard');
  assert.equal(groupes[0].items[0].dossier.nom, 'EN RETARD');
});

test('une échéance de la semaine en cours mais déjà passée reste dans la semaine', () => {
  // Le regroupement se fait sur la SEMAINE, pas sur le jour : lundi dernier et vendredi prochain
  // appartiennent à la même semaine de travail.
  const app = chargerApplication();
  const groupes = app.grouperEcheancesParSemaine([dossier('X', { autres: [{ label: 'Échéance', date: '2026-09-14' }] })], AUJOURDHUI);
  assert.equal(groupes.length, 1);
  assert.notEqual(groupes[0].cle, 'retard');
});

test('au-delà de l’horizon affiché, tout tombe dans un seul groupe « Plus tard »', () => {
  const app = chargerApplication();
  const loin = app.SEMAINES_AFFICHEES * 7 + 30;
  const groupes = app.grouperEcheancesParSemaine([
    dossier('A', { autres: [{ label: 'Échéance', date: app.addDays(AUJOURDHUI, loin) }] }),
    dossier('B', { autres: [{ label: 'Échéance', date: app.addDays(AUJOURDHUI, loin + 60) }] })
  ], AUJOURDHUI);
  assert.equal(groupes.length, 1);
  assert.equal(groupes[0].cle, 'plus-tard');
  assert.equal(groupes[0].items.length, 2);
});

test('les groupes sont ordonnés retard → semaines chronologiques → plus tard', () => {
  const app = chargerApplication();
  const groupes = app.grouperEcheancesParSemaine([
    dossier('LOIN', { autres: [{ label: 'Échéance', date: app.addDays(AUJOURDHUI, app.SEMAINES_AFFICHEES * 7 + 30) }] }),
    dossier('RETARD', { autres: [{ label: 'Échéance', date: '2026-08-20' }] }),
    dossier('S+2', { autres: [{ label: 'Échéance', date: '2026-09-29' }] }),
    dossier('S+1', { autres: [{ label: 'Échéance', date: '2026-09-22' }] })
  ], AUJOURDHUI);
  assert.equal(groupes.map(g => g.items[0].dossier.nom).join(','), 'RETARD,S+1,S+2,LOIN');
});

test('dans une semaine, les échéances sont triées par date puis par nom', () => {
  const app = chargerApplication();
  const groupes = app.grouperEcheancesParSemaine([
    dossier('ZOLA', { autres: [{ label: 'Échéance', date: '2026-09-16' }] }),
    dossier('ARAGON', { autres: [{ label: 'Échéance', date: '2026-09-16' }] }),
    dossier('BALZAC', { autres: [{ label: 'Échéance', date: '2026-09-15' }] })
  ], AUJOURDHUI);
  assert.equal(groupes[0].items.map(i => i.dossier.nom).join(','), 'BALZAC,ARAGON,ZOLA');
});

test('un dossier sans aucune échéance datée n’apparaît nulle part', () => {
  const app = chargerApplication();
  assert.equal(app.grouperEcheancesParSemaine([dossier('VIDE', {})], AUJOURDHUI).length, 0);
});

test('libelleSemaine nomme les groupes en français, année tue si c’est la même', () => {
  const app = chargerApplication();
  const groupes = app.grouperEcheancesParSemaine([
    dossier('RETARD', { autres: [{ label: 'Échéance', date: '2026-08-20' }] }),
    dossier('X', { autres: [{ label: 'Échéance', date: '2026-09-17' }] })
  ], AUJOURDHUI);
  assert.equal(app.libelleSemaine(groupes[0], AUJOURDHUI), 'En retard');
  assert.equal(app.libelleSemaine(groupes[1], AUJOURDHUI), 'Semaine du 14 septembre');
});

test('ORDRE_ETAT_DOSSIER classe du plus pressant au terminé', () => {
  // C'est lui qui pilote le tri "Statut" du tableau : ce qui presse en premier.
  const app = chargerApplication();
  assert.equal(app.ORDRE_ETAT_DOSSIER.join(','), 'urgent,arelier,attente,complet,pret,archive');
});

test('la vue Échéances porte des titres de colonne, une seule fois, en haut', () => {
  const app = chargerApplication();
  const dossiers = [
    { id: 'a', nom: 'A / B', responsable: 'Julie VASSELIN', pret: '2020-01-10' },
    { id: 'b', nom: 'C / D', responsable: 'Julie VASSELIN', pret: '2099-06-10' },
  ];
  const html = app.renderVueSemaines(dossiers);
  assert.equal(html.split('<thead>').length - 1, 1);
  assert.ok(html.indexOf('<thead>') < html.indexOf('<tbody>'));
  for (const titre of ['Date', 'Échéance', 'Dossier']) assert.ok(html.includes(`<th>${titre}</th>`));
  // Responsable abrégé (étude, 01/10 : initiales en pastille, colonne étroite), nom entier au survol.
  assert.ok(html.includes('<th title="Responsable">Resp.</th>'));
  assert.ok(html.includes('class="pastille-collab" title="Julie VASSELIN"'));
  assert.ok(html.includes('>JV</span>'));
});
