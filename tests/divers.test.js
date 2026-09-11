'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

test('detecterNomDossier reconnaît vendeur et acquéreur au format "né(e) le"', () => {
  const app = chargerApplication();
  const texte = `
    ENTRE LES SOUSSIGNES :
    Le VENDEUR : Monsieur Jean DUPONT né le 5 mai 1970 à Paris.
    ci-après dénommé « le Vendeur »

    ET :
    Le ACQUEREUR : Madame Alice MARTIN née le 2 février 1985 à Lyon.
    ci-après dénommé « l'Acquéreur »
  `;
  assert.equal(app.detecterNomDossier(texte), 'DUPONT / MARTIN');
});

test('detecterNomDossier fonctionne avec les rôles Promettant / Bénéficiaire', () => {
  const app = chargerApplication();
  const texte = `
    Le PROMETTANT : Monsieur Paul BERNARD né le 1 janvier 1960 à Nice.
    ci-après dénommé « le Promettant »
    Le BENEFICIAIRE : Madame Julie PETIT née le 3 mars 1990 à Metz.
    ci-après dénommé « le Bénéficiaire »
  `;
  assert.equal(app.detecterNomDossier(texte), 'BERNARD / PETIT');
});

test('detecterNomDossier gère le style "étiquette finale" (nom avant le rôle, pas de bloc en-tête)', () => {
  // Régression : une vraie promesse remontait "PETIT / PETIT" (le nom du bénéficiaire recopié des
  // deux côtés). Cause : sans bloc "LE PROMETTANT :" en tête, le bloc du promettant était borné
  // par le PROCHAIN "ci-après dénommé" rencontré — celui du bénéficiaire — et avalait donc sa
  // présentation à la place de la bonne.
  const app = chargerApplication();
  const texte = `
    ENTRE LES SOUSSIGNES :

    Monsieur Paul BERNARD, né le 1 janvier 1960 à Nice,
    ci-après dénommé le "PROMETTANT",

    D'une part,

    ET :

    Madame Julie PETIT, née le 3 mars 1990 à Metz,
    ci-après dénommée le "BENEFICIAIRE",

    D'autre part,
  `;
  assert.equal(app.detecterNomDossier(texte), 'BERNARD / PETIT');
});

test('detecterNomDossier gère l\'étiquette finale même sans aucune ponctuation autour du rôle', () => {
  const app = chargerApplication();
  const texte = `
    Monsieur Marc ROUSSEAU né le 10 juin 1965 à Lille, ci-après dénommé le Vendeur,
    et Madame Sophie LEFEBVRE née le 12 août 1978 à Reims, ci-après dénommée l'Acquéreur,
    sont convenus de ce qui suit.
  `;
  assert.equal(app.detecterNomDossier(texte), 'ROUSSEAU / LEFEBVRE');
});

test('suggererEcheance classe une clause de prêt', () => {
  const app = chargerApplication();
  assert.equal(app.suggererEcheance("condition suspensive d'obtention d'un prêt immobilier"), 'pret');
});

test('suggererEcheance classe une clause de permis de construire en "autre"', () => {
  const app = chargerApplication();
  assert.equal(app.suggererEcheance('condition suspensive d\'obtention du permis de construire'), 'autre');
});

test('escapeHtml neutralise les balises HTML', () => {
  const app = chargerApplication();
  assert.equal(app.escapeHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
});

test('escapeAttr neutralise les guillemets pour un attribut HTML', () => {
  const app = chargerApplication();
  assert.equal(app.escapeAttr('Dupont "le rapide" & fils'), 'Dupont &quot;le rapide&quot; &amp; fils');
});

test('normaliserDossierImporte rejette une entrée sans nom', () => {
  const app = chargerApplication();
  assert.equal(app.normaliserDossierImporte({ pret: '2025-06-01' }, 'test.json'), null);
});

test('normaliserDossierImporte ignore une date malformée plutôt que de planter l\'affichage', () => {
  const app = chargerApplication();
  const d = app.normaliserDossierImporte({ nom: 'Dupont / Martin', pret: 'pas-une-date' }, 'test.json');
  assert.equal(d.nom, 'Dupont / Martin');
  assert.equal(d.pret, '');
});

test('normaliserDossierImporte applique les rappels par défaut (15 et 7 jours) si absents', () => {
  const app = chargerApplication();
  const d = app.normaliserDossierImporte({ nom: 'Dupont / Martin' }, 'test.json');
  // Le tableau vient d'un autre contexte vm (autre réalisation d'Array) : on le convertit avant
  // de le comparer pour ne comparer que sa structure, pas l'identité de son constructeur.
  assert.deepEqual([...d.reminderDays], [15, 7]);
});

test('joursRestants calcule un compte à rebours cohérent', () => {
  const app = chargerApplication();
  const demain = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
  assert.equal(app.joursRestants(demain), 1);
});

test('estDebutPageAnnexe ignore un renvoi "Annexe n°1" cité en milieu de clause', () => {
  // Régression : une promesse LD Notaires de 52 pages voyait son extraction tronquée dès la
  // page 6 à cause de ce renvoi page 7 ("Un extrait de plan cadastral est annexé. Annexe n°1"),
  // alors que le corps de l'acte se poursuivait jusqu'à la signature, page 52 — aucune pièce
  // jointe n'était en réalité annexée au même PDF.
  const app = chargerApplication();
  const texteClause = `
    Il est ici précisé que le PROMETTANT déclare que le BIEN n'a fait l'objet d'aucune division
    de propriété depuis son acquisition, sans aucune exception ni réserve.
    Un extrait de plan cadastral est annexé. Annexe n°1
    Un extrait de plan Géoportail avec vue aérienne est annexé. Annexe n°2
    HISTORIQUE DE LA PROPRIETE
  `;
  assert.equal(app.estDebutPageAnnexe(texteClause), false);
});

test('estDebutPageAnnexe reconnaît une vraie page d\'annexe (titre en tête, page quasi vide)', () => {
  const app = chargerApplication();
  assert.equal(app.estDebutPageAnnexe('Annexe n°1 — Extrait de plan cadastral'), true);
});

test('estDebutPageAnnexe reconnaît une page "ANNEXES" sans numéro (liste de pièces jointes)', () => {
  // Décision de l'étude : les dates butoir ne doivent venir que de l'avant-contrat lui-même —
  // l'ancien motif exigeait un chiffre ("annexe n°1"), ratant une simple page de titre "ANNEXES".
  const app = chargerApplication();
  assert.equal(app.estDebutPageAnnexe('ANNEXES'), true);
});

test('estDebutPageAnnexe reconnaît une pièce jointe reconnue par son propre titre, même sur une page longue', () => {
  // Certaines pièces jointes n'ont aucun renvoi "annexe" et ne se reconnaissent qu'à leur propre
  // titre de document (ici un DPE) — doit compter même si le reste de la page dépasse 300
  // caractères, tant que le titre est bien en tout début de page.
  const app = chargerApplication();
  const texte = 'DIAGNOSTIC DE PERFORMANCE ENERGETIQUE\n' +
    'Texte du diagnostic proprement dit qui continue sur plusieurs lignes pour dépasser le seuil '.repeat(4);
  assert.equal(app.estDebutPageAnnexe(texte), true);
});

test('estDebutPageAnnexe ignore une clause qui cite un diagnostic en passant, en milieu de page longue', () => {
  // Le titre de document (voir test ci-dessus) n'est reconnu qu'en tout début de page — une
  // clause du corps de l'acte qui mentionne un diagnostic en passant ne doit pas déclencher la
  // coupure (déjà couvert pour "annexe n°1" par le premier test de ce bloc, ici pour les titres).
  const app = chargerApplication();
  const texte = 'Il est précisé que le vendeur remettra à l\'acquéreur le diagnostic de performance ' +
    'énergétique du bien avant la signature, ainsi que les autres diagnostics obligatoires. '.repeat(3) +
    'HISTORIQUE DE LA PROPRIETE';
  assert.equal(app.estDebutPageAnnexe(texte), false);
});

test('detecteSignatureActe reconnaît les formulations usuelles de fin d\'acte', () => {
  const app = chargerApplication();
  assert.equal(app.detecteSignatureActe('Fait à Blois, le 3 mars 2026, signé électroniquement.'), true);
  assert.equal(app.detecteSignatureActe('DATE ET SIGNATURES'), true);
  assert.equal(app.detecteSignatureActe('Dont acte, fait et passé les jour, mois et an susdits.'), true);
  assert.equal(app.detecteSignatureActe('En foi de quoi les parties ont signé le présent acte.'), true);
  assert.equal(app.detecteSignatureActe("Il est ici précisé que le bien est desservi par les réseaux."), false);
});

test('calculerDernierePageUtile retient le repère le plus tôt parmi ceux trouvés', () => {
  const app = chargerApplication();
  // Aucun repère trouvé : tout le document est gardé (comportement historique, filet de sécurité).
  assert.equal(app.calculerDernierePageUtile(null, null, null, 80), 80);
  // Seule la signature est trouvée (cas réel signalé : ni "Page X sur Y", ni titre d'annexe
  // reconnu) — c'est elle qui doit fixer la coupure, pas la longueur totale du PDF.
  assert.equal(app.calculerDernierePageUtile(null, 12, null, 80), 14);
  // Un vrai début d'annexe détecté avant toute signature (mise en page inhabituelle) l'emporte.
  assert.equal(app.calculerDernierePageUtile(9, 12, null, 80), 8);
  // La pagination interne ("Page X sur Y") reste utilisée si elle est plus stricte que la
  // signature (ex. une page de garde de signature électronique en avance sur la pagination).
  assert.equal(app.calculerDernierePageUtile(null, 40, 10, 80), 13);
});

test('prochaineEcheanceDetail ignore l\'échéance de prêt une fois l\'offre reçue, au profit de la suivante', () => {
  const app = chargerApplication();
  const dansTroisJours = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const dansVingtJours = new Date(Date.now() + 20 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const d = { pret: dansTroisJours, acte: dansVingtJours, offrePretStatut: 'recue' };
  const prochaine = app.prochaineEcheanceDetail(d);
  assert.equal(prochaine.type, 'acte');
});

test('prochaineEcheanceDetail garde l\'échéance de prêt tant que l\'offre n\'est pas confirmée reçue', () => {
  const app = chargerApplication();
  const dansTroisJours = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const dansVingtJours = new Date(Date.now() + 20 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const d = { pret: dansTroisJours, acte: dansVingtJours, offrePretStatut: 'inconnu' };
  const prochaine = app.prochaineEcheanceDetail(d);
  assert.equal(prochaine.type, 'pret');
});

test('calculerProchaineEcheance ignore aussi l\'échéance de prêt une fois l\'offre reçue', () => {
  const app = chargerApplication();
  const dansTroisJours = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const dansVingtJours = new Date(Date.now() + 20 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const d = { pret: dansTroisJours, acte: dansVingtJours, offrePretStatut: 'recue' };
  assert.equal(app.calculerProchaineEcheance(d), 20);
});

test('statutDossier renvoie "archive" en priorité, même si le dossier a par ailleurs un blocage', () => {
  const app = chargerApplication();
  const d = { archive: true, sansPret: false, offrePretStatut: 'manquante', pret: '2099-01-01' };
  assert.equal(app.statutDossier(d), 'archive');
});

test('statutDossier renvoie "blocage" quand l\'offre de prêt est introuvable', () => {
  const app = chargerApplication();
  const d = { archive: false, sansPret: false, offrePretStatut: 'manquante', pret: '2099-01-01' };
  assert.equal(app.statutDossier(d), 'blocage');
});

test('statutDossier n\'est plus influencé par l\'accès à reconfirmer, l\'échéance dépassée ou la confiance de la date', () => {
  // Décision explicite de l'étude : la synthèse vert/orange/rouge ne porte plus que sur les
  // documents effectivement retrouvés (offre + pièces) — ces trois signaux restent visibles
  // ailleurs (bandeau "accès à reconfirmer", badge "⚠️ à vérifier"/"≈ estimée" sur la date), mais
  // n'affectent plus ce badge. Un dossier sans rien à vérifier (ici sans prêt, jamais relié) est
  // trivialement "prêt" quel que soit l'état de ces trois signaux.
  const app = chargerApplication();
  const hier = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);
  const d = { archive: false, sansPret: true, accesAReconfirmer: true, acte: hier, confiance: { acte: 'incertain' } };
  assert.equal(app.statutDossier(d), 'pret');
});

test('statutDossier renvoie "blocage" quand le dossier est relié mais qu\'aucune pièce n\'a été trouvée', () => {
  // Rouge = "aucun document trouvé", pas seulement l'offre de prêt : ici l'offre ET toute la
  // checklist de pièces ont été cherchées (dossier relié) et confirmées manquantes.
  const app = chargerApplication();
  const demain = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
  const pieces = {};
  app.checklistPieces('maison').forEach(p => { pieces[p.cle] = 'manquante'; });
  const d = {
    archive: false, sansPret: false, offrePretStatut: 'manquante', pret: demain,
    dossierLie: true, roleNotaire: 'instrumentaire', typeVente: 'maison', pieces
  };
  assert.equal(app.statutDossier(d), 'blocage');
});

test('statutDossier renvoie "aconfirmer" quand l\'offre de prêt n\'a jamais été confirmée', () => {
  const app = chargerApplication();
  const demain = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
  const d = { archive: false, sansPret: false, offrePretStatut: 'inconnu', pret: demain };
  assert.equal(app.statutDossier(d), 'aconfirmer');
});

test('statutDossier renvoie "pret" quand tout est en ordre', () => {
  const app = chargerApplication();
  const demain = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
  const d = { archive: false, sansPret: false, offrePretStatut: 'recue', pret: demain, confiance: { pret: 'auto' } };
  assert.equal(app.statutDossier(d), 'pret');
});

test('statutDossier renvoie "aconfirmer" quand une pièce de la checklist manque sur un dossier relié', () => {
  const app = chargerApplication();
  const demain = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
  const d = {
    archive: false, sansPret: false, offrePretStatut: 'recue', pret: demain, confiance: { pret: 'auto' },
    dossierLie: true, roleNotaire: 'instrumentaire', typeVente: 'maison', pieces: { titrePropriete: 'recue' }
  };
  assert.equal(app.statutDossier(d), 'aconfirmer');
});

test('statutDossier renvoie "pret" une fois l\'offre reçue et toutes les pièces de la checklist reçues', () => {
  // Signalé par l'étude comme restant bloqué en "à confirmer" (orange) en conditions réelles :
  // logique déjà correcte à ce niveau une fois testée isolément (voir CLAUDE.md — la cause réelle
  // était très probablement une mauvaise classification du type de vente, corrigée séparément).
  const app = chargerApplication();
  const demain = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
  const pieces = {};
  app.checklistPieces('maison').forEach(p => { pieces[p.cle] = 'recue'; });
  const d = {
    archive: false, sansPret: false, offrePretStatut: 'recue', pret: demain, confiance: { pret: 'auto' },
    dossierLie: true, roleNotaire: 'instrumentaire', typeVente: 'maison', pieces
  };
  assert.equal(app.statutDossier(d), 'pret');
});

test('statutDossier ignore la checklist de pièces pour un dossier non relié (rien à signaler)', () => {
  const app = chargerApplication();
  const demain = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
  const d = {
    archive: false, sansPret: false, offrePretStatut: 'recue', pret: demain, confiance: { pret: 'auto' },
    dossierLie: false, roleNotaire: 'instrumentaire', typeVente: 'maison', pieces: {}
  };
  assert.equal(app.statutDossier(d), 'pret');
});

test('statutDossier ignore la checklist de pièces pour un notaire participant', () => {
  const app = chargerApplication();
  const demain = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
  const d = {
    archive: false, sansPret: false, offrePretStatut: 'recue', pret: demain, confiance: { pret: 'auto' },
    dossierLie: true, roleNotaire: 'participant', typeVente: 'maison', pieces: {}
  };
  assert.equal(app.statutDossier(d), 'pret');
});

test('estDebutPageAnnexe reconnaît une page de scan courte même si le titre n\'est pas tout en tête', () => {
  const app = chargerApplication();
  // Le titre arrive après 120 caractères, mais la page reste courte dans l'ensemble (< 300) :
  // cas d'un scan avec un bref cartouche avant le titre de l'annexe.
  const texteScan = 'x'.repeat(150) + ' Annexe n°1';
  assert.equal(app.estDebutPageAnnexe(texteScan), true);
});

test('detecterMontantPret lit le montant chiffré entre parenthèses après "montant du prêt"', () => {
  const app = chargerApplication();
  const texte = "Le montant du prêt accordé est de CENT QUATRE-VINGT MILLE EUROS (180 000 €), remboursable sur 20 ans.";
  assert.equal(app.detecterMontantPret(texte), 180000);
});

test('detecterMontantPret reconnaît aussi "capital emprunté"', () => {
  const app = chargerApplication();
  const texte = "Le capital emprunté s'élève à la somme de (150 000,00 €).";
  assert.equal(app.detecterMontantPret(texte), 150000);
});

test('detecterMontantPret renvoie null sans montant entre parenthèses proche du vocabulaire attendu', () => {
  const app = chargerApplication();
  assert.equal(app.detecterMontantPret("Le prêt sera versé au notaire avant la signature de l'acte."), null);
});

test('calculerApport renvoie null tant que le prix ou le montant du prêt manque', () => {
  const app = chargerApplication();
  assert.equal(app.calculerApport({ prixVente: 250000, montantPret: null }), null);
  assert.equal(app.calculerApport({ prixVente: null, montantPret: 200000 }), null);
});

test('calculerApport calcule le montant et le pourcentage, avec un niveau "success" pour un apport confortable', () => {
  const app = chargerApplication();
  const apport = app.calculerApport({ prixVente: 250000, montantPret: 200000 });
  assert.equal(apport.montant, 50000);
  assert.equal(apport.pourcentage, 20);
  assert.equal(apport.niveau, 'success');
});

test('calculerApport renvoie un niveau "pret" (à surveiller) pour un apport faible mais positif', () => {
  const app = chargerApplication();
  const apport = app.calculerApport({ prixVente: 250000, montantPret: 240000 });
  assert.equal(apport.pourcentage, 4);
  assert.equal(apport.niveau, 'pret');
});

test('calculerApport renvoie un niveau "urgent" quand le prêt dépasse le prix (apport négatif)', () => {
  const app = chargerApplication();
  const apport = app.calculerApport({ prixVente: 250000, montantPret: 260000 });
  assert.equal(apport.montant, -10000);
  assert.equal(apport.niveau, 'urgent');
});
