'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

// Grille de relecture, synthèse client et commentaires de l'étude (Outil 2). Résultats
// fabriqués à la main : ces fonctions ne lisent aucun texte, elles mettent en forme un rapport.

function resultatActe(extra) {
  return Object.assign({
    mode: 'acte', typeBien: 'copropriete', comparaisonFaite: true, dateAvantContrat: '2026-06-12',
    nbJustificatifs: 2,
    constats: [
      { categorie: 'COMPARAISON_COMPROMIS', gravite: 'CRITIQUE', titre: 'Prix de vente différent',
        description: 'Prix du compromis : 200 000 € — prix du projet : 210 000 €.' },
      { categorie: 'ETAT_DATE', gravite: 'IMPORTANT', titre: 'Procédure en cours signalée par le syndic',
        description: 'Le syndic mentionne une procédure contre le constructeur.', page: 3,
        destinataire: 'syndic', question: 'La procédure a-t-elle évolué ?' },
      { categorie: 'URBANISME', gravite: 'A_VERIFIER', titre: 'Emplacement réservé',
        description: 'Le certificat mentionne un emplacement réservé.' },
      { categorie: 'ACTE', gravite: 'INFORMATION', titre: 'Simple information' }
    ],
    obligations: [{ statut: 'tenue' }, { statut: 'non_tenue' }],
    etatsDates: [{ type: 'pre-etat-date' }],
    certificatsUrbanisme: [{}],
    carnets: [],
    ags: [],
    justificatifsReconnus: ['dpe', 'entretienChaudiere']
  }, extra || {});
}

test('grille : une colonne par section, état de chaque rubrique', () => {
  const app = chargerApplication();
  const cols = app.grilleRelectureOutil2(resultatActe());
  assert.equal(cols.map(c => c.cle).join(','), 'ACTE,AVANT_CONTRAT,ANNEXES');
  const ligne = cle => cols.reduce((acc, c) => acc.concat(c.lignes), []).find(l => l.cle === cle);
  assert.equal(ligne('COMPARAISON_COMPROMIS').etat, 'alerte');
  assert.equal(ligne('ETAT_DATE').etat, 'alerte');
  assert.equal(ligne('URBANISME').etat, 'attention');
  assert.equal(ligne('ACTE').etat, 'ok');
  // Copropriété sans carnet déposé : non contrôlé, pas « rien relevé ».
  assert.equal(ligne('CARNET_ENTRETIEN').etat, 'non_controle');
  assert.equal(ligne('OBLIGATIONS').detail, '1/2 justifié(s)');
  // Hors terrain, pas de case permis ; sur un compromis, pas de colonne avant-contrat.
  assert.equal(ligne('PERMIS'), undefined);
  const colsCompromis = app.grilleRelectureOutil2(resultatActe({ mode: 'compromis', constats: [] }));
  assert.equal(colsCompromis.map(c => c.cle).join(','), 'ACTE,ANNEXES');
});

test('grille : rubrique masquée et constat exclu', () => {
  const app = chargerApplication();
  const cols = app.grilleRelectureOutil2(resultatActe(), {
    estMasquee: cle => cle === 'URBANISME',
    estExclu: c => c.titre === 'Prix de vente différent'
  });
  const lignes = cols.reduce((acc, c) => acc.concat(c.lignes), []);
  assert.equal(lignes.find(l => l.cle === 'URBANISME').etat, 'masque');
  assert.equal(lignes.find(l => l.cle === 'COMPARAISON_COMPROMIS').etat, 'ok');
});

test('pièces attendues selon le type de bien', () => {
  const app = chargerApplication();
  const copro = app.piecesAttenduesOutil2(resultatActe());
  const etat = cle => copro.find(p => p.cle === cle).etat;
  assert.equal(etat('diagnostics'), 'fournie');
  assert.equal(etat('cu'), 'fournie');
  assert.equal(etat('etatDate'), 'partielle');
  assert.equal(etat('carnet'), 'absente');
  const maison = app.piecesAttenduesOutil2(resultatActe({ typeBien: 'maison', justificatifsReconnus: ['entretienChaudiere'] }));
  assert.equal(maison.map(p => p.cle).join(','), 'diagnostics,cu');
  assert.equal(maison[0].etat, 'absente');
  const terrain = app.piecesAttenduesOutil2(resultatActe({ typeBien: 'terrain', permis: { permis: { date: '2026-01-01' }, constatsAffichage: [] } }));
  assert.equal(terrain.filter(p => p.etat === 'fournie').map(p => p.cle).join(','), 'diagnostics,cu,permis');
});

test('synthèse : points retenus classés, informations et exclus omis', () => {
  const app = chargerApplication();
  const texte = app.syntheseClientOutil2(resultatActe(), {
    dossierNom: 'VENTE DUPONT / MARTIN',
    estExclu: c => c.titre === 'Emplacement réservé'
  });
  assert.match(texte, /^Objet : Relecture du projet d'acte de vente — VENTE DUPONT \/ MARTIN/);
  assert.match(texte, /avant-contrat signé le 12 juin 2026/);
  assert.match(texte, /2 point\(s\) doivent être réglés avant la signature\./);
  assert.match(texte, /1\. Prix de vente différent\./);
  assert.match(texte, /Procédure en cours signalée par le syndic\. \(page 3\)/);
  assert.doesNotMatch(texte, /Emplacement réservé/);
  assert.doesNotMatch(texte, /Simple information/);
  assert.match(texte, /Engagements du vendeur : 1 sur 2 justifié\(s\)/);
  assert.match(texte, /Pièces non communiquées : .*État daté \(pré-état daté seulement\)/);
  assert.match(texte, /Auprès du syndic :\n  • La procédure a-t-elle évolué \?/);
});

test('synthèse : aucun point, et conformité à l’avant-contrat dite seulement si comparée', () => {
  const app = chargerApplication();
  const vide = app.syntheseClientOutil2(resultatActe({ constats: [], typeBien: 'maison', justificatifsReconnus: ['dpe'] }));
  assert.match(vide, /aucun point n'appelle d'observation/);
  assert.match(vide, /conformes à l'avant-contrat/);
  const sansRef = app.syntheseClientOutil2(resultatActe({ constats: [], comparaisonFaite: false }));
  assert.doesNotMatch(sansRef, /conformes à l'avant-contrat/);
});

test('commentaires : portée dossier, portée générale, gravité corrigée', () => {
  const app = chargerApplication();
  const constat = { categorie: 'ETAT_DATE', gravite: 'IMPORTANT', titre: 'Procédure en cours signalée par le syndic',
    phrase: 'Une procédure oppose le syndicat des copropriétaires à la société de construction' };
  const empreinte = app.empreinteTexteConstat(constat);
  const retours = [
    { id: 'a', verdict: 'faux_positif', portee: 'dossier', dossierCle: 'dossier:1', empreinte, constat: { categorie: 'ETAT_DATE' }, date: '2026-09-23' }
  ];
  assert.equal(app.retourPourConstat(constat, retours, 'dossier:2'), null);
  assert.equal(app.retourPourConstat(constat, retours, 'dossier:1').id, 'a');
  // Une autre catégorie ne récupère jamais l'avis.
  assert.equal(app.retourPourConstat({ ...constat, categorie: 'URBANISME' }, retours, 'dossier:1'), null);

  const general = [{ id: 'g', verdict: 'gravite', portee: 'tous', graviteSouhaitee: 'A_VERIFIER', empreinte, constat: { categorie: 'ETAT_DATE' } }];
  const c = { ...constat };
  app.appliquerRetoursAuxConstats([c], general, 'dossier:9');
  assert.equal(c.gravite, 'A_VERIFIER');
  assert.equal(c.graviteOrigine, 'IMPORTANT');
  // Rejouer sans l'avis rétablit la gravité d'origine.
  app.appliquerRetoursAuxConstats([c], [], 'dossier:9');
  assert.equal(c.gravite, 'IMPORTANT');
  assert.equal(c.retour, null);
});

test('résumé : un faux positif ne compte plus', () => {
  const app = chargerApplication();
  const r = app.resumeConstatsOutil2([
    { gravite: 'CRITIQUE', retour: { verdict: 'faux_positif' } },
    { gravite: 'CRITIQUE' },
    { gravite: 'A_VERIFIER', memoire: { decision: 'ecarte' } }
  ]);
  assert.equal(r.CRITIQUE, 1);
  assert.equal(r.A_VERIFIER, 0);
});

test('clé de dossier, parties divergentes, rubrique AAE', () => {
  const app = chargerApplication();
  assert.equal(app.cleDossierAudit({ id: 'x1' }, 'a.pdf'), 'dossier:x1');
  assert.equal(app.cleDossierAudit(null, 'Projet VENTE Dupont.pdf'), 'document:projet vente dupont');
  const texte = [{ nom: 'DUPONT', role: 'VENDEUR' }, { nom: 'MARTIN', role: 'ACQUEREUR' }];
  assert.equal(app.partiesDivergentes([{ nom: 'Dupont', role: 'vendeur' }, { nom: 'MARTIN', role: 'ACQUEREUR' }], texte), false);
  assert.equal(app.partiesDivergentes([{ nom: 'DUPONT', role: 'VENDEUR' }, { nom: 'MARTIN', role: 'VENDEUR' }], texte), true);
  assert.equal(app.partiesDivergentes([{ nom: 'DUPONT', role: 'VENDEUR' }], []), false);
  assert.equal(app.estDansRubriqueAAE('9 - AAE/Certificat urbanisme.pdf'), true);
  assert.equal(app.estDansRubriqueAAE('Copie AAE PROMESSE.pdf'), false);
  assert.equal(app.estDansRubriqueAAE('8 - SRU\\compromis.pdf'), false);
});
