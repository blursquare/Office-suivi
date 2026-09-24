'use strict';

// Trois demandes traitées ensemble (voir script.js, section "renderTab"/CLAUDE.md) :
// - une échéance "Appel de fonds", visible seulement une fois le dossier complet
//   (dossierEntierementComplet) et positionnée juste avant "Signature de l'acte" ;
// - une échéance fixe "Rendez-vous de signature", distincte de la date butoir "Signature de
//   l'acte" (indicative, lue dans l'avant-contrat) — le rendez-vous réel pris à l'office ;
// - la validation manuelle ("Marquer réalisée"/"Annuler la validation"), jusqu'ici réservée à la
//   vente préalable, généralisée à N'IMPORTE QUELLE échéance (fixe ou personnalisée).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

function dossierBase(extra) {
  return Object.assign({
    id: 'd1', nom: 'DUPONT / MARTIN', typeVente: 'maison', sansPret: true,
    roleNotaire: 'instrumentaire', pieces: {}, piecesRetirees: [], piecesPersonnalisees: [],
    piecesEngagementsDetectees: [], pret: '', acte: '', ventebien: '', autres: []
  }, extra || {});
}

// LIBELLES_CATEGORIE est un `const` de premier niveau, invisible depuis le contexte vm des tests
// (voir tests/helpers/load-app.js) : vérifié indirectement via libelleEcheancePourHistorique, qui
// s'appuie dessus et EST une `function` (donc exposée).
test('libelleEcheancePourHistorique résout les types fixes et une échéance personnalisée', () => {
  const app = chargerApplication();
  const d = dossierBase({ autres: [{ label: 'Diagnostic amiante', date: '2026-10-01' }] });
  assert.equal(app.libelleEcheancePourHistorique(d, 'appelFonds'), 'Appel de fonds');
  assert.equal(app.libelleEcheancePourHistorique(d, 'rendezVousSignature'), 'Rendez-vous de signature');
  assert.equal(app.libelleEcheancePourHistorique(d, 'autre-0'), 'Diagnostic amiante');
  // Index hors limites (échéance déjà supprimée entretemps) : repli sans planter.
  assert.equal(app.libelleEcheancePourHistorique(d, 'autre-9'), 'Échéance personnalisée');
});

test('echeanceValidee : le prêt peut être validé manuellement, en plus du statut offre reçue', () => {
  const app = chargerApplication();
  assert.equal(app.echeanceValidee(dossierBase({ offrePretStatut: 'inconnu' }), 'pret'), false);
  const valideManuel = dossierBase({ offrePretStatut: 'inconnu', echeancesValidees: { pret: true } });
  assert.equal(app.echeanceValidee(valideManuel, 'pret'), true);
  assert.equal(app.echeanceValidee(dossierBase({ offrePretStatut: 'recue' }), 'pret'), true);
});

test('echeanceValidee couvre appelFonds et rendezVousSignature comme n\'importe quel autre type', () => {
  const app = chargerApplication();
  const d = dossierBase({ echeancesValidees: { appelFonds: true } });
  assert.equal(app.echeanceValidee(d, 'appelFonds'), true);
  assert.equal(app.echeanceValidee(d, 'rendezVousSignature'), false);
});

test('dossierEntierementComplet distingue bien un dossier prêt à signer d\'un dossier incomplet', () => {
  const app = chargerApplication();
  const incomplet = dossierBase({ sansPret: false, offrePretStatut: 'inconnu' });
  const complet = dossierBase({ sansPret: true, roleNotaire: 'participant' });
  assert.equal(app.dossierEntierementComplet(incomplet), false);
  assert.equal(app.dossierEntierementComplet(complet), true);
});

// Signalé par l'étude : « parfois l'espace appel de fonds ne s'affiche pas alors que la date du
// rendez-vous est indiquée et remplie ». L'ancien test ci-dessus ne vérifiait que la fonction de
// complétude, jamais la carte RÉELLEMENT AFFICHÉE — c'est exactement par là que le défaut est
// passé. Ces trois cas verrouillent l'affichage lui-même.
test('appel de fonds affiché dès qu\'un rendez-vous de signature est fixé, même dossier incomplet', () => {
  const app = chargerApplication();
  const d = dossierBase({ sansPret: false, offrePretStatut: 'inconnu', rendezVousSignature: '2026-12-01' });
  assert.equal(app.dossierEntierementComplet(d), false, 'le dossier doit bien être incomplet pour que le test ait un sens');
  assert.ok(ordreDesEcheances(app, d).includes('Appel de fonds'));
});

test('une date d\'appel de fonds déjà saisie ne disparaît jamais, même si le dossier redevient incomplet', () => {
  // Cas réel : une pièce repasse automatiquement à « manquante » quand son fichier disparaît du
  // NAS. La date saisie deviendrait alors invisible ET non modifiable.
  const app = chargerApplication();
  const d = dossierBase({ sansPret: false, offrePretStatut: 'inconnu', appelFonds: '2026-11-20' });
  assert.equal(app.dossierEntierementComplet(d), false);
  assert.ok(ordreDesEcheances(app, d).includes('Appel de fonds'));
});

test('appel de fonds masqué tant que rien ne le justifie', () => {
  // La règle d'origine reste : ni date saisie, ni rendez-vous, ni dossier complet → pas de carte.
  const app = chargerApplication();
  const d = dossierBase({ sansPret: false, offrePretStatut: 'inconnu' });
  assert.ok(!ordreDesEcheances(app, d).includes('Appel de fonds'));
});

test('renderTab : croix de suppression et bouton de validation présents sur les deux nouveaux types', () => {
  const app = chargerApplication();
  const htmlAppelFonds = app.renderTab('appelFonds', 'Appel de fonds', '2026-11-20', 'd1', null, null, null, false, '', false, false);
  assert.match(htmlAppelFonds, /supprimerDateEcheance\('d1', 'appelFonds'\)/);
  assert.match(htmlAppelFonds, /validerEcheance\('d1','appelFonds'\)/);
  assert.match(htmlAppelFonds, /Marquer réalisée/);

  const htmlRdv = app.renderTab('rendezVousSignature', 'Rendez-vous de signature', '2026-12-01', 'd1', null, null, null, false, '', false, true);
  assert.match(htmlRdv, /supprimerDateEcheance\('d1', 'rendezVousSignature'\)/);
  assert.match(htmlRdv, /devaliderEcheance\('d1','rendezVousSignature'\)/);
  assert.match(htmlRdv, /Annuler la validation/);
});

test('renderTab : le bouton de validation utilise la clé "autre-N" pour une échéance personnalisée', () => {
  const app = chargerApplication();
  const html = app.renderTab('autre', 'Diagnostic amiante', '2026-10-01', 'd1', null, null, 2, false, '', false, false);
  assert.match(html, /validerEcheance\('d1','autre-2'\)/);
});

test('renderTab : aucun bouton "Annuler la validation" mort quand le prêt est déjà auto-confirmé reçu', () => {
  const app = chargerApplication();
  const html = app.renderTab('pret', 'Obtention du prêt', '2026-09-01', 'd1', null, null, null, true, '', false, true);
  assert.doesNotMatch(html, /devaliderEcheance/);
  assert.doesNotMatch(html, /validerEcheance/);
});

test('renderTab : le prêt non encore reçu propose bien "Marquer réalisée" (validation manuelle possible)', () => {
  const app = chargerApplication();
  const html = app.renderTab('pret', 'Obtention du prêt', '2026-09-01', 'd1', null, null, null, false, '', false, false);
  assert.match(html, /validerEcheance\('d1','pret'\)/);
});

test('tant que l’appel de fonds n’est pas fait, c’est lui que le planning annonce', () => {
  // Règle donnée par l'étude : le rendez-vous a beau être fixé, ce qu'il reste À FAIRE est
  // l'appel de fonds — le planning n'annonce donc qu'une seule chose, celle-là.
  const app = chargerApplication();
  const d = dossierBase({ appelFonds: '2026-11-20', rendezVousSignature: '2026-12-01' });
  assert.equal(app.toutesEcheances(d).map((e) => e.type).join(','), 'appelFonds');
  assert.equal(app.prochaineEcheanceDetail(d).type, 'appelFonds');

  // Tout validé, y compris l'étape intermédiaire « projet envoyé » : plus rien à annoncer.
  const validees = Object.assign({}, d, {
    echeancesValidees: { appelFonds: true, projetEnvoye: true, rendezVousSignature: true }
  });
  assert.equal(app.prochaineEcheanceDetail(validees), null);
});

test('une fois l’appel de fonds fait, le planning annonce le projet d’acte envoyé, puis la signature', () => {
  const app = chargerApplication();
  const base = dossierBase({ appelFonds: '2026-11-20', rendezVousSignature: '2026-12-01' });

  // Étape 1 : appel de fonds fait, mais pas encore le projet envoyé → c'est lui la suite.
  const apresAppelFonds = Object.assign({}, base, { echeancesValidees: { appelFonds: true } });
  const suivante1 = app.prochaineEcheanceDetail(apresAppelFonds);
  assert.equal(suivante1.type, 'projetEnvoye');
  assert.equal(suivante1.iso, '2026-12-01');
  assert.equal(suivante1.label, 'Projet d’acte envoyé');

  // Étape 2 : le projet est envoyé aussi → la signature devient la prochaine échéance.
  const apresProjetEnvoye = Object.assign({}, base, {
    echeancesValidees: { appelFonds: true, projetEnvoye: true }
  });
  const suivante2 = app.prochaineEcheanceDetail(apresProjetEnvoye);
  assert.equal(suivante2.type, 'rendezVousSignature');
  assert.equal(suivante2.iso, '2026-12-01');
  // C'est bien la signature qui est nommée, pas le « rendez-vous » : c'est ce qu'il reste à faire.
  assert.equal(suivante2.label, 'Signature de l’acte');
});

test('sans date propre, l’appel de fonds prend celle du rendez-vous', () => {
  // L'étude ne saisit pas toujours la date de l'appel de fonds ; il doit de toute façon être parti
  // avant la signature, c'est donc sa vraie échéance — mieux que de ne rien annoncer du tout.
  const app = chargerApplication();
  const d = dossierBase({ rendezVousSignature: '2026-12-01' });
  const suivante = app.prochaineEcheanceDetail(d);
  assert.equal(suivante.type, 'appelFonds');
  assert.equal(suivante.iso, '2026-12-01');
});

test('normaliserDossierImporte conserve appelFonds/rendezVousSignature comme les autres dates fixes', () => {
  const app = chargerApplication();
  const importe = { nom: 'X / Y', appelFonds: '2026-11-20', rendezVousSignature: '2026-12-01' };
  const d = app.normaliserDossierImporte(importe, 'x.json');
  assert.equal(d.appelFonds, '2026-11-20');
  assert.equal(d.rendezVousSignature, '2026-12-01');
});

test('normaliserDossierImporte écarte une date mal formée pour les deux nouveaux champs', () => {
  const app = chargerApplication();
  const d = app.normaliserDossierImporte({ nom: 'X / Y', appelFonds: 'pas une date' }, 'x.json');
  assert.equal(d.appelFonds, '');
});

// Ordre CHRONOLOGIQUE des cartes d'échéance sur la fiche (demandé par l'étude) — remplace
// l'ordre fixe prêt → appel de fonds → acte → rendez-vous → vente préalable → personnalisées.
// On lit l'ordre dans le HTML produit en cherchant la position de chaque libellé.
function ordreDesEcheances(app, d) {
  const html = app.echeancesOrdonneesFiche(d, {}, '');
  const libelles = ['Obtention du prêt', 'Appel de fonds', 'Date butoir',
    'Rendez-vous de signature', 'Vente préalable'].concat((d.autres || []).map((a) => a.label));
  // Ancrage sur le titre de la carte, jamais sur le libellé seul : les tabs recatégorisables
  // (prêt/acte/vente préalable) embarquent un <select> qui contient les TROIS libellés en
  // <option>, donc un simple indexOf du libellé retombe sur la mauvaise carte.
  return libelles
    // La classe peut porter un modificateur (tab-name-fort sur le rendez-vous de signature).
    .map((l) => ({ l, i: html.search(new RegExp('<div class="tab-name[^"]*">' + l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '</div>')) }))
    .filter((x) => x.i >= 0)
    .sort((a, b) => a.i - b.i)
    .map((x) => x.l);
}

test('echeancesOrdonneesFiche classe les échéances datées par date croissante', () => {
  const app = chargerApplication();
  const d = dossierBase({
    pret: '2026-11-15', acte: '2026-09-30', ventebien: '2026-08-01',
    rendezVousSignature: '2026-10-05',
    autres: [{ label: 'Diagnostic amiante', date: '2026-07-01' }]
  });
  assert.equal(
    ordreDesEcheances(app, d).join(' | '),
    // L'appel de fonds est désormais affiché dès qu'un rendez-vous est fixé ; sans date propre,
    // il part en fin de liste comme toute échéance non renseignée.
    'Diagnostic amiante | Vente préalable | Date butoir | Rendez-vous de signature | Obtention du prêt | Appel de fonds'
  );
});

test('echeancesOrdonneesFiche relègue les échéances sans date en fin, dans leur ordre naturel', () => {
  const app = chargerApplication();
  // Seule "Signature de l'acte" porte une date : elle passe devant le prêt et le rendez-vous,
  // qui gardent entre eux l'ordre d'affichage historique.
  const d = dossierBase({ pret: '', acte: '2026-09-30', rendezVousSignature: '' });
  assert.equal(
    ordreDesEcheances(app, d).join(' | '),
    'Date butoir | Obtention du prêt | Rendez-vous de signature'
  );
});

test('echeancesOrdonneesFiche garde l\'index réel d\'une échéance personnalisée malgré le tri', () => {
  const app = chargerApplication();
  // La 2e entrée de d.autres (index 1) est la plus ancienne : elle s'affiche en premier, mais son
  // bouton de suppression doit toujours viser l'index 1, pas son rang après tri.
  const d = dossierBase({
    acte: '2026-12-31',
    autres: [{ label: 'Tardive', date: '2026-11-01' }, { label: 'Ancienne', date: '2026-01-15' }]
  });
  const html = app.echeancesOrdonneesFiche(d, {}, '');
  assert.ok(html.indexOf('<div class="tab-name">Ancienne</div>') < html.indexOf('<div class="tab-name">Tardive</div>'));
  assert.ok(html.includes("supprimerEcheanceAutre('d1', 1)"));
  assert.ok(html.includes("supprimerEcheanceAutre('d1', 0)"));
});

// Ordre métier du dossier donné par l'étude : compromis signé → vente préalable → obtention du
// prêt → date butoir de réitération → appel de fonds → rendez-vous de signature. Il ne décide que
// du sort des échéances SANS date (le tri se fait par date pour les autres).
test('echeancesOrdonneesFiche : les échéances sans date suivent l\'ordre métier du dossier', () => {
  const app = chargerApplication();
  const d = dossierBase({ pret: '', acte: '', rendezVousSignature: '', ventebien: '' });
  // ventebien n'est rendue que si elle porte une date (comportement d'origine, inchangé).
  assert.equal(
    ordreDesEcheances(app, d).join(' | '),
    'Obtention du prêt | Date butoir | Rendez-vous de signature'
  );
});

test('ecartJours donne une différence signée, distincte de joursEntre (bornes comprises)', () => {
  const app = chargerApplication();
  assert.equal(app.ecartJours('2026-10-01', '2026-10-06'), 5);
  assert.equal(app.ecartJours('2026-10-06', '2026-10-01'), -5);
  assert.equal(app.ecartJours('2026-10-01', '2026-10-01'), 0);
  // Traverse le changement d'heure d'octobre sans perdre un jour (calcul en UTC).
  assert.equal(app.ecartJours('2026-10-20', '2026-11-03'), 14);
  assert.equal(app.ecartJours('2026-10-01', ''), null);
  assert.equal(app.joursEntre('2026-10-01', '2026-10-06'), 6);
});

// « Une fois que cette date est rentrée la date butoir n'a plus lieu d'être mais est indicative
// pour savoir si on signe avant ou après » (l'étude).
test('echeanceValidee : un rendez-vous fixé clôt la date butoir de réitération', () => {
  const app = chargerApplication();
  assert.equal(app.echeanceValidee(dossierBase({ acte: '2026-10-01' }), 'acte'), false);
  assert.equal(app.echeanceValidee(dossierBase({ acte: '2026-10-01', rendezVousSignature: '2026-10-06' }), 'acte'), true);
  // La validation manuelle continue de fonctionner indépendamment.
  assert.equal(app.echeanceValidee(dossierBase({ acte: '2026-10-01', echeancesValidees: { acte: true } }), 'acte'), true);
});

test('la date butoir ne figure JAMAIS au planning, rendez-vous fixé ou non', () => {
  // Elle vient de l'avant-contrat et n'est qu'indicative : c'est le rendez-vous pris à l'office
  // qui engage l'étude. Elle reste visible sur la fiche, avec l'écart entre les deux.
  const app = chargerApplication();
  const avecRdv = dossierBase({ acte: '2026-10-01', rendezVousSignature: '2026-10-06' });
  assert.equal(app.toutesEcheances(avecRdv).map((e) => e.type).join(','), 'appelFonds');

  const sansRdv = dossierBase({ acte: '2026-10-01' });
  assert.equal(app.toutesEcheances(sansRdv).length, 0);
  assert.equal(app.prochaineEcheanceDetail(sansRdv), null);
});

test('renderTab : la date butoir remplacée affiche l\'écart avec le rendez-vous, pas un décompte', () => {
  const app = chargerApplication();
  const apres = app.renderTab('acte', 'Date butoir', '2026-10-01', 'd1', null, null, null, false, '', false, true, '2026-10-06');
  assert.ok(apres.includes('Signature 5 j APRÈS la date butoir'), apres);
  assert.ok(apres.includes('tab-countdown passed'));
  // Aucun bouton de validation : ce n'est pas une décision manuelle, l'annuler n'annulerait rien.
  assert.ok(!apres.includes('devaliderEcheance'));
  assert.ok(!apres.includes('validerEcheance'));

  const avant = app.renderTab('acte', 'Date butoir', '2026-10-10', 'd1', null, null, null, false, '', false, true, '2026-10-07');
  assert.ok(avant.includes('Signature 3 j avant la date butoir'), avant);
  assert.ok(avant.includes('tab-countdown recue'));

  const memeJour = app.renderTab('acte', 'Date butoir', '2026-10-10', 'd1', null, null, null, false, '', false, true, '2026-10-10');
  assert.ok(memeJour.includes('Signature le jour même'), memeJour);

  // Sans rendez-vous, le comportement d'origine est intact.
  const normal = app.renderTab('acte', 'Date butoir', '2026-10-01', 'd1', null, null, null, false, '', false, false, '');
  assert.ok(!normal.includes('la date butoir'));
  assert.ok(normal.includes('validerEcheance'));
});

test("saisir une date d'appel de fonds le marque réalisé, la vider annule la validation", () => {
  const app = chargerApplication();
  const d = { id: 'd1', historique: [] };
  app.marquerAppelFondsSelonDate(d, '2026-10-15');
  assert.equal(app.echeanceValidee(d, 'appelFonds'), true);
  const nbHisto = d.historique.length;
  // Une seconde saisie ne rejournalise rien : l'appel de fonds était déjà fait.
  app.marquerAppelFondsSelonDate(d, '2026-10-20');
  assert.equal(d.historique.length, nbHisto);
  app.marquerAppelFondsSelonDate(d, '');
  assert.equal(app.echeanceValidee(d, 'appelFonds'), false);
});

test("la section « Appel de fonds » du bas de fiche disparaît une fois l'appel fait", () => {
  const app = chargerApplication();
  const d = { id: 'd1', rendezVousSignature: '2026-11-01', prixVente: 200000, adresseBien: 'x' };
  assert.ok(app.renderAppelFondsDossier(d).includes("Préparer l'appel de fonds"));
  d.echeancesValidees = { appelFonds: true };
  assert.equal(app.renderAppelFondsDossier(d), '');
});

test('le titre de la carte « Appel de fonds » est en gras', () => {
  const app = chargerApplication();
  const html = app.renderTab('appelFonds', 'Appel de fonds', '2026-11-20', 'd1', null, null, null, false, '', false, false);
  assert.ok(html.includes('tab-name tab-name-fort'));
});
