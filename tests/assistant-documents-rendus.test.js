'use strict';

// « Demander à CLAIRE » : lire les documents du dossier et produire un document Word (étude 13/10, client/65).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chargerApplication } = require('./helpers/load-app.js');

const app = chargerApplication();

test('pages à lire : 30 au plus, bornées au document', () => {
  const p = (t, d, f) => { const r = app.pagesLectureAgent(t, d, f); return `${r.debut}-${r.fin}`; };
  assert.equal(p(12, 1, 0), '1-12');
  assert.equal(p(80, 1, 0), '1-30');
  assert.equal(p(80, 31, 0), '31-60');
  assert.equal(p(80, 70, 200), '70-80');
  assert.equal(p(80, 10, 12), '10-12');
  assert.equal(p(80, 0, 5), '1-5');
  assert.equal(p(5, 9, 0), '5-5');
  assert.equal(p(0, 1, 0), '0--1');
});

test('contenu de l’IA → blocs du document : titres, puces, numéros, tableaux, paragraphes', () => {
  const blocs = app.blocsDocumentAgent('# Synthèse\n\nLe prix est de **245 000 €**\net le prêt attendu.\n## Conditions\n- Prêt : 20/11\n1. Vérifier l’ERP\n| Pièce | État |\n|---|---|\n| ERP | reçue |\n| DPE | attendue |\n\nFin.');
  assert.equal(blocs.map(b => b.type).join(','), 'titre1,para,titre2,puce,numero,tableau,para');
  assert.equal(blocs[1].texte, 'Le prix est de **245 000 €** et le prêt attendu.');
  assert.equal(blocs[5].lignes.length, 3, 'la ligne de séparation est retirée');
  assert.equal(blocs[5].lignes[2].join('|'), 'DPE|attendue');
  const m = app.morceauxGrasAgent('Le prix est de **245 000 €** net');
  assert.equal(m.map(x => (x.gras ? '*' : '') + x.texte).join('/'), 'Le prix est de /*245 000 €/ net');
});

test('nom du fichier produit : sûr pour Windows', () => {
  assert.equal(app.nomFichierRenduAgent('Synthèse : compromis / FOURNIER?'), 'Synthèse compromis FOURNIER');
  assert.equal(app.nomFichierRenduAgent('  ...  '), 'Document CLAIRE');
});

test('courrier sur le papier de l’office : lignes d’adresse gardées, texte échappé, en-têtes du modèle gardés', () => {
  const blocs = app.blocsDocumentAgent('Monsieur Paul DURAND\n2 rue des Lices\n41000 BLOIS\n\nBlois, le 13 octobre 2026\n\n**Objet : votre vente**\n\nMadame <& Monsieur>,', true);
  assert.equal(blocs[0].texte, 'Monsieur Paul DURAND\n2 rue des Lices\n41000 BLOIS');
  const corps = app.xmlCorpsCourrierAgent(blocs);
  assert.match(corps, /DURAND<\/w:t><\/w:r><w:r><w:br\/><\/w:r>/, 'retour à la ligne dans le bloc d’adresse');
  assert.match(corps, /<w:spacing w:before="200" w:after="80"\/><\/w:pPr>.*BLOIS<\/w:t><\/w:r><w:r>(<w:br\/>){5}<\/w:r>/, 'adresse comme le modèle, cinq retours');
  assert.match(corps, /<w:spacing w:before="300" w:after="300"\/><\/w:pPr><w:r><w:t xml:space="preserve">Blois, le 13 octobre 2026/, 'lieu et date comme le modèle');
  assert.match(corps, /<w:b\/>.*Objet : votre vente/);
  assert.match(corps, /Madame &lt;&amp; Monsieur&gt;,/);
  const modele = '<?xml version="1.0"?><w:document xmlns:w="w"><w:body><w:p>{addrLines}</w:p><w:sectPr><w:headerReference w:type="first" r:id="rId18"/></w:sectPr></w:body></w:document>';
  const x = app.documentXmlCourrierAgent(modele, corps);
  assert.doesNotMatch(x, /addrLines/, 'le corps du modèle est remplacé');
  assert.match(x, /headerReference w:type="first" r:id="rId18"/, 'les en-têtes de l’office restent');
  assert.match(x, /<\/w:sectPr><\/w:body><\/w:document>$/);
  assert.equal(app.documentXmlCourrierAgent('pas un document', corps), '');
});

test('courrier : signature « Me … » à droite en fin de lettre, espace après une liste', () => {
  const corps = app.xmlCorpsCourrierAgent(app.blocsDocumentAgent('Texte.\n\n- un\n- deux\n\nPolitesse.\n\nMe Sophie GOSSART', true));
  assert.match(corps, /<w:jc w:val="right"\/><\/w:pPr><w:r><w:t xml:space="preserve">Me Sophie GOSSART/);
  assert.match(corps, /w:after="60"\/>.*- un/);
  assert.match(corps, /w:after="200"\/><w:ind w:left="284"\/><w:jc w:val="both"\/><\/w:pPr><w:r><w:t xml:space="preserve">- deux/);
});

test('pièces jointes : PDF et images seulement, jamais le nom du fichier dans la phrase envoyée', () => {
  assert.equal(app.sortePieceJointeAssistant('Compromis DUPONT.pdf', ''), 'pdf');
  assert.equal(app.sortePieceJointeAssistant('scan', 'application/pdf'), 'pdf');
  assert.equal(app.sortePieceJointeAssistant('capture.PNG', ''), 'image');
  assert.equal(app.sortePieceJointeAssistant('x', 'image/jpeg'), 'image');
  assert.equal(app.sortePieceJointeAssistant('acte.docx', ''), '');
  const m = app.mentionPiecesJointesAgent([{ id: 'pj1', nom: 'Compromis DUPONT.pdf', sorte: 'pdf' }, { id: 'pj2', nom: 'MARTIN.png', sorte: 'image' }]);
  assert.match(m, /pj1 — PDF ; pj2 — image/);
  assert.doesNotMatch(m, /DUPONT|MARTIN/);
  assert.equal(app.mentionPiecesJointesAgent([]), '');
});

test('courrier pré-signé : le tampon et la signature du modèle suivent « Me … », y compris avant un saut de page', () => {
  const modele = '<w:body><w:p><w:pPr/><w:r><w:t>{x}</w:t></w:r></w:p><w:p><w:pPr/><w:r><w:drawing><a:blip r:embed="rId25"/></w:drawing></w:r><w:r><w:drawing><a:blip r:embed="rId26"/></w:drawing></w:r></w:p><w:sectPr/></w:body>';
  const sig = app.paragrapheSignatureModele(modele);
  assert.match(sig, /^<w:p><w:pPr\/>.*rId25.*rId26.*<\/w:p>$/);
  assert.equal(app.paragrapheSignatureModele('<w:p>rien</w:p>'), '');
  const blocs = app.blocsDocumentAgent('Texte.\n\nMe Sophie GOSSART\n\n<<saut de page>>\n\nPage deux.', true);
  assert.equal(blocs.map(b => b.type).join(), 'para,para,saut,para');
  const corps = app.xmlCorpsCourrierAgent(blocs, sig);
  assert.match(corps, /Me Sophie GOSSART<\/w:t><\/w:r><\/w:p><w:p><w:pPr\/>.*rId25.*<\/w:p><w:p><w:r><w:br w:type="page"\/><\/w:r><\/w:p>/, 'signature juste après Me, puis le saut de page');
  assert.doesNotMatch(app.xmlCorpsCourrierAgent(blocs), /rId25/, 'sans option, aucun tampon');
});
