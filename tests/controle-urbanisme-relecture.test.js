'use strict';

// Contrôle de l'urbanisme dans la relecture d'actes (client/55-controle-urbanisme-relecture.js) : ce que l'outil a gardé sur
// la fiche (droits de préemption, monuments historiques) confronté au texte relu. Textes et noms inventés.

const test = require('node:test');
const assert = require('node:assert');
const { chargerApplication } = require('./helpers/load-app');

const PREEMPTION = {
  droits: [
    { cle: 'dpu', titre: 'Droit de préemption urbain', statut: 'oui', motif: 'zone UA', formalite: 'DIA à la commune' },
    { cle: 'safer', titre: 'SAFER', statut: 'non', motif: 'zone U' }
  ],
  patrimoine: { lu: true, servitudes: [{ type: 'ac1', libelle: 'Monument historique', nom: 'Église Saint-Exemple', nature: 'Périmètre des abords', rayon: 500 }] }
};
const TRAVAUX_TOITURE = "Le VENDEUR déclare que des travaux de réfection de la toiture ont été réalisés en 2021 par l'entreprise Couvreurs Martin.";

test('constatsControleUrbanisme : droit à purger absent, zone protégée non signalée, travaux sans accord de l’ABF', () => {
  const app = chargerApplication();
  const texte = "Le VENDEUR vend à l'ACQUÉREUR une maison. " + TRAVAUX_TOITURE;
  const travaux = app.detecterTravauxRealises(texte, [{ numero: 1, debut: 0, fin: texte.length }], '2026-10-08');
  const c = app.constatsControleUrbanisme({ mode: 'acte', texte, travaux, preemption: PREEMPTION });
  const titres = c.map(x => x.titre).join(' | ');
  assert.match(titres, /Droit de préemption urbain à purger : non mentionné dans l'acte/);
  assert.match(titres, /Travaux en zone protégée \(monument historique\) : accord de l'architecte des bâtiments de France/);
  assert.match(titres, /Bien en zone protégée \(monument historique\) : non signalé dans l'acte/);
  assert.ok(!/SAFER/.test(titres), 'un droit qui ne s’applique pas n’est jamais réclamé');
  assert.ok(c.every(x => x.categorie === 'CONTROLE_URBANISME'));
  assert.equal(c.find(x => /Travaux/.test(x.titre)).gravite, 'IMPORTANT');
});

test('constatsControleUrbanisme : rien quand l’acte traite la purge et la protection', () => {
  const app = chargerApplication();
  const texte = "Une déclaration d'intention d'aliéner a été notifiée à la commune, qui a renoncé à exercer son droit de préemption urbain. "
    + "Le bien est situé dans le périmètre délimité des abords d'un monument historique ; l'accord de l'architecte des bâtiments de France a été obtenu pour les travaux de toiture réalisés en 2021.";
  const travaux = app.detecterTravauxRealises(texte, [{ numero: 1, debut: 0, fin: texte.length }], '2026-10-08');
  assert.equal(app.constatsControleUrbanisme({ mode: 'acte', texte, travaux, preemption: PREEMPTION }).length, 0);
});

test('constatsControleUrbanisme : sans analyse sur la fiche, aucun constat', () => {
  const app = chargerApplication();
  assert.equal(app.constatsControleUrbanisme({ mode: 'acte', texte: TRAVAUX_TOITURE, travaux: [], preemption: null }).length, 0);
  assert.equal(app.constatsControleUrbanisme({ mode: 'compromis', texte: '', travaux: [], preemption: { droits: [] } }).length, 0);
});

test('constatsControleUrbanisme : en avant-contrat le droit à purger est « à vérifier »', () => {
  const app = chargerApplication();
  const c = app.constatsControleUrbanisme({ mode: 'compromis', texte: 'Vente sans autre condition.', travaux: [], preemption: { droits: PREEMPTION.droits } });
  assert.equal(c.length, 1);
  assert.equal(c[0].gravite, 'A_VERIFIER');
  assert.match(c[0].titre, /non mentionné dans l'avant-contrat/);
});

test('relecture d’un projet de vente lié à un dossier : le contrôle de l’urbanisme entre dans le bilan', () => {
  const app = chargerApplication();
  const texteProjet = "PROJET D'ACTE. Le VENDEUR vend à l'ACQUÉREUR une maison. " + TRAVAUX_TOITURE;
  const r = app.analyserProjetVenteOutil2({
    texteProjet, pagesProjet: [{ numero: 1, debut: 0, fin: texteProjet.length }],
    texteAvantContrat: '', pagesAvantContrat: [], aujourdHui: '2026-10-08',
    dossierLie: { id: 'd1', typeVente: 'maison', preemption: PREEMPTION }
  });
  const urbanisme = r.constats.filter(c => c.categorie === 'CONTROLE_URBANISME');
  assert.equal(urbanisme.length, 3);
});

test('compte rendu : les points du contrôle de l’urbanisme vont dans la catégorie Urbanisme', () => {
  const app = chargerApplication();
  const plan = app.planCompteRenduRelecture({ sections: [], claire: [
    { uid: 'k1', categorie: 'CONTROLE_URBANISME', titre: 'Bien en zone protégée', description: 'x', niveau: 'surveiller' },
    { uid: 'k2', categorie: 'ACTE', titre: 'Autre', description: 'y', niveau: 'surveiller' }
  ] });
  const cles = app.categoriesCompteRenduRelecture(plan).map(c => c.cle + ':' + c.titre).join(',');
  assert.match(cles, /urbanisme:Contrôle de l’urbanisme/);
  assert.match(cles, /claire:Contrôle CLAIRE/);
});

// --- Travaux déclarés dans le compromis : autorisations demandées ? (outil Contrôle de l'urbanisme) ---------------------

function travauxDe(app, texte) {
  return app.detecterTravauxRealises(texte, [{ numero: 1, debut: 0, fin: texte.length }], '2026-10-08').map(app.travailPourFiche);
}

test('analyseTravauxUrbanisme : extension sans autorisation citée, décennale à réclamer', () => {
  const app = chargerApplication();
  const liste = travauxDe(app, "Le VENDEUR déclare que des travaux d'agrandissement ont été réalisés en 2021 par l'entreprise Bâtir Plus.");
  const a = app.analyseTravauxUrbanisme(liste, null, '2026-10-08');
  assert.equal(a.travaux.length, 1);
  const t = a.travaux[0];
  assert.equal(t.statut, 'reclamer');
  const textes = t.points.map(p => p.etat + ':' + p.texte).join(' | ');
  assert.match(textes, /manque:Aucune autorisation citée/);
  assert.match(textes, /manque:Moins de dix ans \(2021\)/);
});

test('analyseTravauxUrbanisme : permis, conformité et décennale cités → rien à réclamer', () => {
  const app = chargerApplication();
  const liste = travauxDe(app, "Le VENDEUR déclare qu'une véranda a été construite en 2020 en vertu d'un permis de construire n° PC 041 18 20 00012, la déclaration attestant l'achèvement et la conformité des travaux ayant été déposée ; l'entreprise était couverte par une assurance décennale.");
  const a = app.analyseTravauxUrbanisme(liste, null, '2026-10-08');
  assert.equal(a.travaux.length, 1);
  assert.equal(a.travaux[0].statut, 'ok', a.travaux[0].points.map(p => p.texte).join(' | '));
});

test('analyseTravauxUrbanisme : zone protégée → accord de l’architecte des bâtiments de France ; travaux anciens → prescription', () => {
  const app = chargerApplication();
  const liste = travauxDe(app, "Le VENDEUR déclare que la toiture a été refaite en 2005 par l'entreprise Couverture Exemple.");
  const a = app.analyseTravauxUrbanisme(liste, PREEMPTION.patrimoine, '2026-10-08');
  const textes = a.travaux[0].points.map(p => p.texte).join(' | ');
  assert.match(textes, /prescription à vérifier/);
  assert.match(textes, /garantie décennale expirée/);
  assert.match(textes, /architecte des bâtiments de France à réclamer/);
});

test('analyseTravauxUrbanisme : travail intérieur compté à part, annexes de diagnostic ignorées', () => {
  const app = chargerApplication();
  const liste = travauxDe(app, "Le VENDEUR déclare que des travaux de rénovation de la cuisine ont été réalisés en 2023. "
    + "Le présent CREP réalisé en application de l'article L.1334-7 porte uniquement sur les revêtements privatifs, y compris les revêtements extérieurs (volets, portail).");
  const a = app.analyseTravauxUrbanisme(liste, null, '2026-10-08');
  assert.equal(a.travaux.length, 0);
  assert.equal(a.interieurs, 1);
});

test('natureTravailUrbanisme : la nature du travail, pas un bout de clause', () => {
  const app = chargerApplication();
  assert.equal(app.natureTravailUrbanisme({ phrase: "Le VENDEUR déclare que des travaux d'agrandissement ont été réalisés en 2021." }), 'Travaux : agrandissement');
  assert.equal(app.natureTravailUrbanisme({ phrase: 'Des travaux ont été réalisés.' }), 'Travaux');
});
