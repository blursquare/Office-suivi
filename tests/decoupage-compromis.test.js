'use strict';

// « Découper le compromis » (étude 31/10, client/152-decoupage-compromis.js) : découpage aux pages « Annexe n° » du logiciel de
// l'agence (Modelo), type et rubrique de chaque annexe, DDT en bloc redécoupé par diagnostic, PDF unique des diagnostics. Pages
// inventées sur la structure de deux compromis réels du 31/10 (jamais commités).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');
const app = chargerApplication();

const sep = (n, libelle, fichier) => `Annexe n°${n}\n${libelle}\n${fichier}`;
const corps = (titre, suite = 'Texte de la page inventé pour le test.\nDeuxième ligne.\nTroisième ligne.') => `${titre}\n${suite}`;

// Compromis d'agence inventé : 4 pages de compromis, le certificat de signature, 9 annexes, le certificat final.
function compromisInvente() {
  return [
    corps('Agence Exemple Immobilier'), corps('COMPROMIS DE VENTE', 'ENTRE LES SOUSSIGNÉS\nLe vendeur\nMonsieur Paul DURAND'),
    corps('Etat amiante', 'L’ACQUEREUR reconnaît… diagnostic de performance énergétique annexé…\nLigne\nLigne'), corps('ANNEXES', 'Sont annexés aux présentes :\nAnnexe n°1 : pièce d’identité\nAnnexe n°2 : titre'),
    corps('Certificat de signature électronique', 'Solution de signature électronique sécurisée'),
    sep(1, 'Une copie de la piece d\'identite du vendeur', 'passport durand paul'), '',                          // 6-7
    sep(2, 'Copie titre propriete', 'vente durand 2015'), corps("L'AN DEUX MILLE QUINZE"), '', '',              // 8-11
    sep(3, 'Attestation de mesurage', 'ddt 23-durand-1059'),                                                     // 12
    corps('M. DURAND Paul', '1 rue Inventée\n41000 BLOIS'), corps('Dossier de Diagnostics Techniques', 'Numéro de dossier : 23-X\nDate\nLigne'),
    corps('Certificat de superficie de la partie privative', 'Numéro de dossier\nLigne\nLigne'), '',               // 15-16 (16 : croquis scanné)
    corps('Diagnostic de performance N°ADEME : 2341E0000000A', 'énergétique (logement)\nLigne\nLigne'), corps('DPE Diagnostic de performance énergétique (logement) p.2'),
    corps('Constat de repérage Amiante n° 23-X', 'Sommaire\nLigne\nLigne'), corps('Constat de risque d\'exposition au Plomb', 'Ligne\nLigne\nLigne'),
    corps('Etat de l’Installation Intérieure d’Électricité', 'Ligne\nLigne\nLigne'),
    corps('ATTESTATION SUR L’HONNEUR réalisée pour le dossier', 'Ligne\nLigne\nLigne'), corps('Diagnostic Loi Pinel', 'Diagnostic de performance énergétique avec mention\nLigne\nLigne'), // 22-23
    sep(4, 'errial parcelle 000-di-121', '4 - errial'), corps('Ce QR Code peut servir à vérifier', 'Ligne\nLigne\nLigne'), // 24-25
    sep(5, 'Règlement de copropriété', 'rcp-123'), '', '',                                                       // 26-28
    sep(6, 'Fiche synthétique de copropriété', 'fiche synthese 2023'), corps('FICHE SYNTHETIQUE DE LA COPROPRIETE'), // 29-30
    sep(7, '0084 - attest immat 002991403', '7 -'), corps("ATTESTATION D'IMMATRICULATION"),                    // 31-32
    sep(8, 'Pv ag 3 dernières annees', 'pv ag 2022'), '',                                                        // 33-34
    sep(9, 'Fiche récapitulative amiante parties communes', 'amiante'), '',                                       // 35-36
    corps('Certificat de signature électronique du document', 'Solution de signature électronique sécurisée')    // 37
  ];
}

test('séparation : « Annexe n°N » en tête d’une page courte ; jamais « ANNEXE 1 : … » d’un état des risques ni une longue page', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(app.separateurAnnexeCompromis('Annexe n°12\nInformations financière copropriété\nappel 07-2023'))), { numero: 12, libelle: 'Informations financière copropriété', fichier: 'appel 07-2023' });
  assert.equal(app.separateurAnnexeCompromis('Annexe N° 3\namiante (16)\n3-').numero, 3);
  assert.equal(app.separateurAnnexeCompromis('ANNEXE 1 : A L’ADRESSE SAISIE, LES RISQUES SUIVANTS EXISTENT\nMAIS'), null);
  assert.equal(app.separateurAnnexeCompromis('Annexe n°1\n' + 'ligne\n'.repeat(8)), null, 'page longue : pas une séparation');
  assert.equal(app.separateurAnnexeCompromis('Le vendeur annexe n°1 aux présentes'), null);
});

test('découpage : compromis (avec ses certificats de signature), une pièce par annexe, pages de séparation jamais recopiées', () => {
  const pages = compromisInvente();
  const d = app.decouperPagesCompromis(pages);
  assert.equal(d.separateurs, 9);
  assert.equal(d.segments[0].pages.join(','), '1,2,3,4,5,37');
  assert.equal(d.segments[1].pages.join(','), '7');
  assert.equal(d.segments[2].pages.join(','), '9,10,11');
  assert.equal(d.segments[9].pages.join(','), '36', 'la dernière annexe s’arrête avant le certificat final');
  const toutes = d.segments.flatMap(s => s.pages);
  [6, 8, 12, 24, 26, 29, 31, 33, 35].forEach(p => assert.ok(!toutes.includes(p), `page de séparation ${p} recopiée`));
});

test('sans page « Annexe n° » : rien n’est deviné, le document entier est proposé', () => {
  const d = app.decouperPagesCompromis([corps('COMPROMIS DE VENTE'), corps('Dossier de Diagnostics Techniques'), corps('Constat de risque d\'exposition au Plomb')]);
  assert.equal(d.separateurs, 0);
  assert.equal(d.segments.length, 1);
  assert.equal(d.segments[0].pages.join(','), '1,2,3');
});

test('pièces : types et rubriques, DDT redécoupé par diagnostic, PDF unique de tous les diagnostics', () => {
  const r = app.piecesDecoupageCompromis(compromisInvente());
  const resume = r.pieces.map(p => `${p.sorte}|${p.label}|${app.saisieDepuisPagesDecoupage(p.pages)}|${p.rubriques.join('/')}`);
  assert.equal(resume.join('\n'), [
    'compromis|Compromis signé|1-5, 37|sru',
    "annexe|Pièce d'identité|7|vendeur",
    'annexe|Titre de propriété|9-11|titre',
    'diagnostic|Dossier de diagnostics techniques (synthèse)|13-14|diagnostics',
    'diagnostic|Mesurage (loi Carrez - Boutin)|15-16|diagnostics',
    'diagnostic|Diagnostic de performance énergétique (DPE)|17-18|diagnostics',
    'diagnostic|Repérage amiante|19|diagnostics',
    'diagnostic|Constat de risque d’exposition au plomb (CREP)|20|diagnostics',
    'diagnostic|État de l’installation intérieure d’électricité|21|diagnostics',
    'diagnostic|État des risques et pollutions (ERP)|25|environnement/diagnostics/aae',
    'annexe|Règlement de copropriété|27-28|copro',
    'annexe|Fiche synthétique de la copropriété|30|copro',
    'annexe|Attestation d’immatriculation de la copropriété|32|copro',
    "annexe|Procès-verbal d'assemblée générale|34|copro",
    'annexe|Fiche récapitulative amiante (parties communes)|36|copro',
    'diagnostics|Diagnostics techniques|13-23, 25|diagnostics'
  ].join('\n'));
  // Les pièces du diagnostiqueur (attestation sur l'honneur, certificats) ne sont que dans le PDF unique ; la page « Diagnostic
  // Loi Pinel … performance énergétique avec mention » n'est pas un second DPE.
  assert.equal(r.pieces.filter(p => p.label.startsWith('Diagnostic de performance')).length, 1);
});

test('noms : libellé de CLAIRE, jamais le nom du fichier déposé chez l’agence (il porte un nom de client)', () => {
  const r = app.piecesDecoupageCompromis(compromisInvente());
  assert.equal(r.pieces[0].nom, 'Compromis signé (sans les annexes)');
  assert.equal(r.pieces[1].nom, "Pièce d'identité - annexe du compromis");
  assert.equal(r.pieces[r.pieces.length - 1].nom, 'Diagnostics techniques - tous les diagnostics');
  assert.ok(r.pieces.every(p => !/durand/i.test(p.nom)));
  assert.equal(app.nomPieceDecoupage('A/B: test'), 'A-B- test - annexe du compromis');
});

test('annexes de diagnostics séparées (un fichier par diagnostic chez l’agence) : reprises telles quelles, sans redécoupage', () => {
  const pages = [corps('COMPROMIS DE VENTE'), sep(1, 'amiante (16)', '1-'), corps('ETAT MENTIONNANT LA PRESENCE OU L’ABSENCE', 'DE MATERIAUX ET PRODUITS CONTENANT DE\nL’AMIANTE\nLigne'),
    corps('CERTIFICAT DE COMPETENCES', 'Expertises et Diagnostics : Amiante - Plomb - Termites - Gaz\nLigne\nLigne'), sep(2, 'dpe (23)', '2-'), corps('diagnostic de performance n° : 2293E', 'énergétique\nLigne\nLigne'),
    sep(3, 'synthese (22)', '3-'), corps('RAPPORT OFFICIEL DE', 'DIAGNOSTICS IMMOBILIERS\nLigne\nLigne'), sep(4, 'pré état daté mr x', '4 -'), corps('PRE ETAT DATE')];
  const r = app.piecesDecoupageCompromis(pages);
  assert.equal(r.pieces.map(p => `${p.label}|${app.saisieDepuisPagesDecoupage(p.pages)}`).join('\n'), [
    'Compromis signé|1', 'Repérage amiante|3-4', 'Diagnostic de performance énergétique (DPE)|6', 'Dossier de diagnostics techniques (synthèse)|8',
    'Pré-état daté|10', 'Diagnostics techniques|3-4, 6, 8'
  ].join('\n'));
  assert.equal(r.pieces.find(p => p.label === 'Pré-état daté').rubriques.join('/'), 'preEtatDate/copro');
});

test('pièce par partie : côté lu dans le libellé, sinon racine (jamais deviné)', () => {
  const r = app.piecesDecoupageCompromis([corps('COMPROMIS'), sep(1, 'cni acquereur', 'x'), corps('Carte'), sep(2, 'cni saranya', 'y'), corps('Carte'), sep(3, 'justificatif saranya', 'z'), corps('Facture')]);
  assert.equal(r.pieces.slice(1).map(p => `${p.label}|${p.rubriques.join('/') || 'racine'}`).join(','), "Pièce d'identité|acquereur,Pièce d'identité|racine,Justificatif de domicile|racine");
});

test('pages saisies à la main : « 3-7, 9 » lu, borné au document, illisible refusé ; et l’inverse', () => {
  assert.equal(app.pagesDepuisSaisieDecoupage('3-5, 9;9', 10).join(','), '3,4,5,9');
  assert.equal(app.pagesDepuisSaisieDecoupage('3-12', 10), null);
  assert.equal(app.pagesDepuisSaisieDecoupage('5-3', 10), null);
  assert.equal(app.pagesDepuisSaisieDecoupage('abc', 10), null);
  assert.equal(app.pagesDepuisSaisieDecoupage('', 10), null);
  assert.equal(app.saisieDepuisPagesDecoupage([1, 2, 3, 5, 7, 8]), '1-3, 5, 7-8');
});

test('fiche : « Découper le compromis » proposé sur une vente reliée au NAS, jamais archivée ni succession', () => {
  const v = { id: 'v1', nom: 'MOREAU / LAMBERT', typeAffaire: 'vente', parties: [], pieces: {}, nasDossier: '2026-001 MOREAU' };
  assert.ok(app.outilsVenteFiche(v).some(o => o.cle === 'decoupage'));
  assert.ok(!app.outilsVenteFiche(Object.assign({}, v, { nasDossier: '' })).some(o => o.cle === 'decoupage'));
  assert.ok(!app.outilsVenteFiche(Object.assign({}, v, { archive: true })).some(o => o.cle === 'decoupage'));
  assert.equal(app.decoupagePossible(Object.assign({}, v, { typeAffaire: 'succession' })), false);
});

test('avant-contrat du NAS : jamais une pièce découpée par CLAIRE, toujours le compromis d’origine', () => {
  const fichiers = [{ nom: 'Compromis signé (sans les annexes).pdf', chemin: '1 - SRU/Compromis signé (sans les annexes).pdf' },
    { nom: 'Compromis signé.pdf', chemin: '1 - SRU/Compromis signé.pdf' }];
  assert.equal(app.choisirAvantContratNas(fichiers, '', null).fichier.nom, 'Compromis signé.pdf');
  assert.equal(app.raisonExclusionAvantContrat('Diagnostics techniques - tous les diagnostics.pdf', null), 'decoupe');
});

test('agent : jamais le libellé de l’agence ni un nom tapé (audit 0.411.0, H1) — libellé de CLAIRE ou « Annexe n°N (non reconnue) »', () => {
  const r = app.piecesDecoupageCompromis([corps('COMPROMIS'), sep(1, 'attestation dupont paul', 'dupont'), corps('Texte'), sep(2, 'Copie titre propriete', 'x'), corps("L'AN DEUX MILLE")]);
  const inconnue = r.pieces.find(p => p.numero === 1);
  assert.equal(inconnue.reconnu, false);
  assert.match(inconnue.nom, /dupont/i, 'le nom proposé à l’écran reprend le libellé, l’utilisateur le corrige');
  assert.equal(app.titrePieceAgentDecoupage(inconnue), 'Annexe n°1 (non reconnue)');
  assert.equal(app.titrePieceAgentDecoupage(Object.assign({}, r.pieces.find(p => p.numero === 2), { nom: 'Titre de M. DUPONT' })), 'Titre de propriété');
  assert.equal(app.titrePieceAgentDecoupage(r.pieces[0]), 'Compromis signé (sans les annexes)');
});
