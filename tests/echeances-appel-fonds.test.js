'use strict';

// Trois demandes traitées ensemble (voir script.js, section "renderLigneEcheance") :
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
  assert.equal(app.libelleEcheancePourHistorique(d, 'appelFonds'), 'Envoi appel de fonds');
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
  assert.ok(ordreDesEcheances(app, d).includes('Envoi appel de fonds'));
});

test('une date d\'appel de fonds déjà saisie ne disparaît jamais, même si le dossier redevient incomplet', () => {
  // Cas réel : une pièce repasse automatiquement à « manquante » quand son fichier disparaît du
  // NAS. La date saisie deviendrait alors invisible ET non modifiable.
  const app = chargerApplication();
  const d = dossierBase({ sansPret: false, offrePretStatut: 'inconnu', appelFonds: '2026-11-20' });
  assert.equal(app.dossierEntierementComplet(d), false);
  assert.ok(ordreDesEcheances(app, d).includes('Envoi appel de fonds'));
});

test('appel de fonds masqué tant que rien ne le justifie', () => {
  // La règle d'origine reste : ni date saisie, ni rendez-vous, ni dossier complet → pas de carte.
  const app = chargerApplication();
  const d = dossierBase({ sansPret: false, offrePretStatut: 'inconnu' });
  assert.ok(!ordreDesEcheances(app, d).includes('Envoi appel de fonds'));
});

test('renderLigneEcheance : croix de suppression et bouton de validation présents sur les deux nouveaux types', () => {
  const app = chargerApplication();
  const htmlAppelFonds = app.renderLigneEcheance('appelFonds', 'Appel de fonds', '2099-11-20', 'd1', null, null, null, false, '', false, false);
  assert.match(htmlAppelFonds, /supprimerDateEcheance\('d1', 'appelFonds'\)/);
  assert.match(htmlAppelFonds, /basculerEcheance\('d1','appelFonds'\)/);
  assert.match(htmlAppelFonds, /aria-checked="false"/);
  assert.match(htmlAppelFonds, /Marquer réalisée/);

  const htmlRdv = app.renderLigneEcheance('rendezVousSignature', 'Rendez-vous de signature', '2026-12-01', 'd1', null, null, null, false, '', false, true);
  assert.match(htmlRdv, /supprimerDateEcheance\('d1', 'rendezVousSignature'\)/);
  assert.match(htmlRdv, /basculerEcheance\('d1','rendezVousSignature'\)/);
  assert.match(htmlRdv, /aria-checked="true"/);
  assert.match(htmlRdv, /cliquer pour décocher/);
});

test('renderLigneEcheance : le bouton de validation utilise la clé "autre-N" pour une échéance personnalisée', () => {
  const app = chargerApplication();
  const html = app.renderLigneEcheance('autre', 'Diagnostic amiante', '2026-10-01', 'd1', null, null, 2, false, '', false, false);
  assert.match(html, /basculerEcheance\('d1','autre-2'\)/);
});

test('renderLigneEcheance : la case d\'un prêt dont l\'offre est reçue (NAS) est cochée et non cliquable', () => {
  const app = chargerApplication();
  const html = app.renderLigneEcheance('pret', 'Obtention du prêt', '2026-09-01', 'd1', null, null, null, true, '', false, true);
  assert.doesNotMatch(html, /basculerEcheance/);
  assert.match(html, /class="ech-case cochee"[^>]*aria-checked="true"[^>]*disabled/);
});

test('renderLigneEcheance : le prêt non encore reçu propose bien "Marquer réalisée" (validation manuelle possible)', () => {
  const app = chargerApplication();
  const html = app.renderLigneEcheance('pret', 'Obtention du prêt', '2026-09-01', 'd1', null, null, null, false, '', false, false);
  assert.match(html, /basculerEcheance\('d1','pret'\)/);
  assert.match(html, /aria-checked="false"/);
});

test('tant que l’appel de fonds n’est pas fait, c’est lui que le planning annonce', () => {
  // Règle donnée par l'étude : le rendez-vous a beau être fixé, ce qu'il reste À FAIRE est
  // l'appel de fonds — le planning n'annonce donc qu'une seule chose, celle-là.
  const app = chargerApplication();
  const d = dossierBase({ rendezVousSignature: '2026-12-01' });
  assert.equal(app.toutesEcheances(d).map((e) => e.type).join(','), 'appelFonds');
  assert.equal(app.prochaineEcheanceDetail(d).type, 'appelFonds');
  assert.equal(app.prochaineEcheanceDetail(d).iso, '2026-12-01', 'son échéance est le rendez-vous de signature');

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
  assert.equal(suivante1.label, 'Envoi projet');

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

// Ordre des lignes d'échéance sur la fiche : l'ORDRE DU DOSSIER (demandé par l'étude le 29/09,
// « le mettre dans l'ordre du dossier » — auparavant par date, le prêt tombait en bas quand sa date
// suivait le rendez-vous). On lit l'ordre dans le HTML produit, ancré sur le nom de chaque ligne
// (jamais sur le libellé seul : le petit menu de recatégorisation contient les TROIS libellés).
function ordreDesEcheances(app, d) {
  const html = app.echeancesOrdonneesFiche(d, {}, '');
  return [...html.matchAll(/<span class="ech-nom[^"]*">([^<]*)<\/span>/g)].map((m) => m[1]);
}

test('echeancesOrdonneesFiche : étapes dans l’ordre du dossier, échéances personnalisées placées par date', () => {
  const app = chargerApplication();
  const d = dossierBase({
    sansPret: false, pret: '2026-11-15', acte: '2026-09-30', ventebien: '2026-08-01',
    rendezVousSignature: '2026-10-05',
    autres: [{ label: 'Diagnostic amiante', date: '2026-07-01' }, { label: 'Relance syndic', date: '2026-10-20' }]
  });
  assert.equal(
    ordreDesEcheances(app, d).join(' | '),
    // Le prêt (15/11) reste à sa place d'étape, avant les envois et la signature (05/10).
    // Rendez-vous fixé : la date butoir n'a plus sa propre ligne (elle est dite sous la signature).
    'Diagnostic amiante | Vente préalable | Obtention du prêt | Envoi appel de fonds | Envoi projet | Signature | Relance syndic'
  );
});

test('echeancesOrdonneesFiche : une date seule ne fait pas remonter une étape', () => {
  const app = chargerApplication();
  const d = dossierBase({ pret: '', acte: '2026-09-30', rendezVousSignature: '' });
  assert.equal(
    ordreDesEcheances(app, d).join(' | '),
    // Dossier de base en achat comptant : la ligne du prêt s'appelle « Financement comptant ».
    'Financement comptant | Date butoir | Signature'
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
  assert.ok(html.indexOf('<span class="ech-nom">Ancienne</span>') < html.indexOf('<span class="ech-nom">Tardive</span>'));
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
    'Financement comptant | Date butoir | Signature'
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

test('date butoir : pas d\'échéance propre, mais elle sert d\'ancre quand rien d\'autre ne reste', () => {
  // La date butoir vient de l'avant-contrat et n'est qu'indicative : elle ne crée jamais une
  // échéance de type 'acte'. Mais quand un rendez-vous est fixé, l'appel de fonds prend sa date ;
  // et quand rien d'autre ne reste (offre reçue, pas encore de rendez-vous — cas participation),
  // le dossier ne doit pas disparaître : l'étape courante est alors ancrée sur la date butoir.
  const app = chargerApplication();
  const avecRdv = dossierBase({ acte: '2026-10-01', rendezVousSignature: '2026-10-06' });
  const e1 = app.toutesEcheances(avecRdv);
  assert.equal(e1.map((e) => e.type).join(','), 'appelFonds');
  assert.equal(e1[0].iso, '2026-10-06');

  // Sans rendez-vous et sans autre échéance : le dossier reste visible, ancré sur le butoir
  // (demande de l'étude), mais jamais avec une échéance de TYPE 'acte'.
  const sansRdv = dossierBase({ acte: '2026-10-01', pieces: { renonciationPreemption: 'recue' } });
  // Offre reçue, pas de rendez-vous : l'étape est « Fixer le rendez-vous », avant
  // l'appel de fonds (demande de l'étude du 28/09), bornée par la date butoir.
  const e2 = app.toutesEcheances(sansRdv);
  assert.equal(e2.map((e) => e.type).join(','), 'fixerRdv');
  assert.equal(e2[0].iso, '2026-10-01');
  assert.ok(!e2.some((e) => e.type === 'acte'));
  assert.equal(app.prochaineEcheanceDetail(sansRdv).type, 'fixerRdv');
});

test('rendez-vous fixé : la date butoir devient une précision sous la signature, avec son écart', () => {
  const app = chargerApplication();
  assert.equal(app.ecartButoirRendezVous('2026-10-01', '2026-10-06').texte, 'Signature 5 j APRÈS la date butoir');
  assert.equal(app.ecartButoirRendezVous('2026-10-01', '2026-10-06').alerte, true);
  assert.equal(app.ecartButoirRendezVous('2026-10-10', '2026-10-07').texte, 'Signature 3 j avant la date butoir');
  assert.equal(app.ecartButoirRendezVous('2026-10-10', '2026-10-07').alerte, false);
  assert.equal(app.ecartButoirRendezVous('2026-10-10', '2026-10-10').texte, 'Signature le jour même');

  const html = app.echeancesOrdonneesFiche(dossierBase({ acte: '2026-10-01', rendezVousSignature: '2026-10-06' }), {}, '');
  assert.ok(!html.includes('<span class="ech-nom">Date butoir</span>'), 'plus de ligne propre');
  assert.ok(html.includes('Signature 5 j APRÈS la date butoir'));
  assert.ok(html.includes('ech-butoir alerte'));
  // Toujours corrigeable sur place : mêmes ids que ceux attendus par validerEditionDate.
  assert.ok(html.includes('id="tabdate-d1-acte-input"'));
  assert.ok(html.includes("validerEditionDate('d1','acte')"));

  // Sans rendez-vous, la date butoir garde sa ligne et sa validation manuelle.
  const normal = app.echeancesOrdonneesFiche(dossierBase({ acte: '2099-10-01' }), {}, '');
  assert.ok(normal.includes('<span class="ech-nom">Date butoir</span>'));
  assert.ok(normal.includes("basculerEcheance('d1','acte')"));
  assert.ok(!normal.includes('la date butoir'));
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
  assert.ok(app.renderAppelFondsDossier(d).includes('Préparer l’appel de fonds'));
  assert.ok(app.renderAppelFondsDossier(d).includes("preparerAppelFondsDepuisDossier('d1')"));
  d.echeancesValidees = { appelFonds: true };
  assert.equal(app.renderAppelFondsDossier(d), '');
});

test('le rendez-vous de signature est la seule ligne au nom en gras', () => {
  const app = chargerApplication();
  const html = app.echeancesOrdonneesFiche(dossierBase({ rendezVousSignature: '2026-12-01' }), {}, '');
  assert.equal((html.match(/ech-nom-fort/g) || []).length, 1);
  assert.ok(html.includes('<span class="ech-nom ech-nom-fort">Signature</span>'));
});

// Ancienne carte « Envoi au client » (25/09) : ses deux entrées sont deux lignes de la liste,
// chacune sa date — « Envoi appel de fonds » et « Envoi projet ».
test('envois avant signature : deux lignes, dates et états propres à chacune', () => {
  const app = chargerApplication();
  const vide = app.echeancesOrdonneesFiche(dossierBase({ rendezVousSignature: '2099-12-01' }), {}, '');
  assert.ok(vide.includes('<span class="ech-nom">Envoi appel de fonds</span>'));
  assert.ok(vide.includes('<span class="ech-nom">Envoi projet</span>'));
  // Chaque envoi a sa case ronde (même sans date) : un clic note l'envoi d'aujourd'hui, un second le décoche.
  assert.ok(vide.includes(`onclick="basculerEcheance('d1','appelFonds')"`));
  assert.ok(vide.includes(`onclick="basculerEcheance('d1','projetEnvoye')"`));
  assert.ok(!vide.includes('>Projet envoyé</wa-button>'), 'plus de bouton à part : la case le fait');
  // Pas encore envoyés : l'échéance affichée est celle du rendez-vous de signature, avec son délai J-n.
  assert.equal((vide.match(/ech-date-ancre/g) || []).length, 2);
  assert.ok(vide.includes('1 déc. 2099'));
  // Les deux champs de saisie existent, avec les id attendus par validerEditionDate.
  assert.ok(vide.includes('id="tabdate-d1-appelFonds-input"'));
  assert.ok(vide.includes('id="tabdate-d1-projetEnvoye-input"'));
  assert.ok(!vide.includes("validerEcheance('d1','appelFonds')"));

  const html = app.echeancesOrdonneesFiche(dossierBase({
    rendezVousSignature: '2099-12-01', appelFonds: '2026-09-25', echeancesValidees: { appelFonds: true },
    detectionsAgenda: { appelFonds: '2026-09-25' }
  }), {}, '');
  assert.ok(html.includes('25 sept. 2026'));
  assert.ok(html.includes('title="25 septembre 2026"'));
  assert.ok(html.includes('Relevé dans l’agenda'));
  assert.ok(html.includes('✓ Envoyé'));
  // Appel de fonds coché ; le projet reste à faire (case vide, échéance du rendez-vous).
  assert.match(html, /aria-checked="true"[^>]*title="Fait[^"]*"[^>]*aria-label="Fait[^"]*Envoi appel de fonds"/);
  assert.equal((html.match(/ech-date-ancre/g) || []).length, 1);
  // Une fois daté, le projet est coché lui aussi.
  const fait = app.echeancesOrdonneesFiche(dossierBase({ rendezVousSignature: '2099-12-01', projetEnvoye: '2026-09-26' }), {}, '');
  assert.equal((fait.match(/class="ech-case cochee"/g) || []).length, 1);
});

test('etatLigneEcheance : un mot par état', () => {
  const app = chargerApplication();
  assert.equal(app.etatLigneEcheance('', {}).texte, 'Non renseignée');
  assert.equal(app.etatLigneEcheance('', { sansPret: true }).texte, 'Sans prêt');
  assert.equal(app.etatLigneEcheance('', { etatSansDate: 'À envoyer' }).texte, 'À envoyer');
  assert.equal(app.etatLigneEcheance('', { validee: true, etatFait: '✓ Envoyé' }).texte, '✓ Fait');
  assert.equal(app.etatLigneEcheance('2000-01-01', { offrePretRecue: true }).texte, '✓ Offre reçue');
  assert.equal(app.etatLigneEcheance('2000-01-01', { validee: true }).texte, '✓ Réalisée');
  assert.equal(app.etatLigneEcheance('2000-01-01', {}).texte, 'Dépassée');
  assert.match(app.etatLigneEcheance('2099-01-01', {}).texte, /^J-\d+$/);
});

test("normaliserDossierImporte : conserve les envois déjà relevés dans l'agenda", () => {
  const app = chargerApplication();
  const d = app.normaliserDossierImporte(dossierBase({ detectionsAgenda: { appelFonds: '2026-09-25', autre: 'x', projetEnvoye: 3 } }));
  assert.equal(JSON.stringify(d.detectionsAgenda), '{"appelFonds":"2026-09-25"}');
});

test('offre reçue : « Fixer le rendez-vous » précède l’appel de fonds', () => {
  const app = chargerApplication();
  const d = { id: 'f', nom: 'F / G', offrePretStatut: 'recue', acte: '2026-11-20', pieces: { renonciationPreemption: 'recue' } };
  assert.equal(app.toutesEcheances(d).map((e) => e.type).join(','), 'fixerRdv');
  // Rendez-vous placé : l'appel de fonds est à faire, à la date du rendez-vous.
  const place = Object.assign({}, d, { rendezVousSignature: '2026-11-18' });
  const e = app.toutesEcheances(place);
  assert.equal(e.map((x) => x.type).join(','), 'appelFonds');
  assert.equal(e[0].iso, '2026-11-18');
  // Offre pas encore reçue, ou vente préalable en attente : pas encore le moment.
  assert.ok(!app.toutesEcheances({ id: 'h', pret: '2026-10-30', acte: '2026-11-20' }).some((x) => x.type === 'fixerRdv'));
  assert.ok(!app.toutesEcheances(Object.assign({}, d, { ventebien: '2026-10-25' })).some((x) => x.type === 'fixerRdv'));
  // Appel de fonds déjà parti avant que le rendez-vous soit noté : on ne recule pas.
  assert.ok(!app.toutesEcheances(Object.assign({}, d, { appelFonds: '2026-10-01' })).some((x) => x.type === 'fixerRdv'));
});

test('renonciation au droit de préemption non reçue : pas de « Fixer le rendez-vous »', () => {
  const app = chargerApplication();
  const d = { id: 'p', nom: 'P / Q', offrePretStatut: 'recue', acte: '2026-11-20', pieces: {} };
  const e = app.toutesEcheances(d);
  assert.ok(!e.some((x) => x.type === 'fixerRdv'));
  assert.equal(e.map((x) => x.type).join(','), 'preemption');
  assert.equal(e[0].iso, '2026-11-20');
  // Reçue (y compris validée à la main), retirée du dossier, ou participation : l'étape revient.
  assert.equal(app.toutesEcheances(Object.assign({}, d, { pieces: { renonciationPreemption: 'recue' } }))[0].type, 'fixerRdv');
  assert.equal(app.toutesEcheances(Object.assign({}, d, { piecesRetirees: ['renonciationPreemption'] }))[0].type, 'fixerRdv');
  assert.equal(app.toutesEcheances(Object.assign({}, d, { roleNotaire: 'participant' }))[0].type, 'fixerRdv');
  // Alertes : l'étude est invitée à obtenir la renonciation, jamais à fixer le rendez-vous.
  const titres = app.alertesImportantes([d], '2026-11-10').map((a) => a.titre).join('|');
  assert.ok(!titres.includes('Fixer le rendez-vous'));
  assert.ok(titres.includes('renonciation'));
});

test('copropriété : pas d\'attente de préemption, sauf pièce de préemption ajoutée à la main', () => {
  const app = chargerApplication();
  const d = { id: 'c', nom: 'C / D', typeVente: 'copropriete', offrePretStatut: 'recue', acte: '2026-11-20', pieces: {} };
  assert.equal(app.toutesEcheances(d)[0].type, 'fixerRdv');
  const titres = app.alertesImportantes([d], '2026-11-10').map((a) => a.titre).join('|');
  assert.ok(!titres.includes('renonciation'));
  // Pièce personnalisée « Renonciation DPU » ajoutée par l'étude, pas encore reçue : on l'attend.
  const avecPiece = Object.assign({}, d, { piecesPersonnalisees: [{ cle: 'perso-1', label: 'Renonciation DPU' }] });
  assert.equal(app.toutesEcheances(avecPiece).map((x) => x.type).join(','), 'preemption');
  // Reçue : l'étape « Fixer le rendez-vous » revient.
  const recue = Object.assign({}, avecPiece, { pieces: { 'perso-1': 'recue' } });
  assert.equal(app.toutesEcheances(recue)[0].type, 'fixerRdv');
  // Une autre pièce personnalisée sans rapport ne bloque rien.
  const autre = Object.assign({}, d, { piecesPersonnalisees: [{ cle: 'perso-2', label: 'Attestation loi Carrez' }] });
  assert.equal(app.toutesEcheances(autre)[0].type, 'fixerRdv');
});

test('achat comptant : « Financement comptant », sans date, sans état ni rien à cocher', () => {
  const app = chargerApplication();
  const html = app.echeancesOrdonneesFiche(dossierBase({ sansPret: true, pret: '' }), {}, '');
  const ligne = html.match(/<li class="ech ech-pret[^"]*">[\s\S]*?<\/li>/)[0];
  assert.ok(ligne.includes('<span class="ech-nom">Financement comptant</span>'));
  assert.ok(!html.includes('<span class="ech-nom">Obtention du prêt</span>'));
  assert.ok(!ligne.includes('validerEcheance'));
  assert.ok(!ligne.includes('supprimerDateEcheance'));
  assert.ok(!ligne.includes('tab-select-icone'));
  assert.ok(!ligne.includes('Sans prêt'));
  assert.ok(ligne.includes('ech-info'));
  // Seul le crayon reste : un prêt qui apparaît finalement se saisit ici.
  assert.ok(ligne.includes("activerEditionDate('d1','pret')"));
  assert.ok(ligne.includes('id="tabdate-d1-pret-input"'));
});
