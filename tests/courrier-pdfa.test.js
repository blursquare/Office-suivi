'use strict';

// Courrier d'appel de fonds en PDF/A-2U (client/56-courrier-pdfa.js) et tampon + signature du modèle Word
// (appel-de-fonds-modele.js). Le PDF est composé à part du .docx : ce test vérifie qu'il dit MOT POUR MOT ce que dit le modèle.
// Données inventées.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { chargerApplication } = require('./helpers/load-app');

const racine = path.join(__dirname, '..');
const modele = fs.readFileSync(path.join(racine, 'appel-de-fonds-modele.js'), 'utf8');

// Lecteur ZIP minimal (répertoire central) : rend le contenu d'un fichier du .docx.
function fichierDuDocx(nom) {
  const zip = Buffer.from(/docxB64: "([^"]+)"/.exec(modele)[1], 'base64');
  let fin = zip.length - 22;
  while (zip.readUInt32LE(fin) !== 0x06054b50) fin--;
  let p = zip.readUInt32LE(fin + 16);
  const total = zip.readUInt16LE(fin + 10);
  for (let i = 0; i < total; i++) {
    const methode = zip.readUInt16LE(p + 10);
    const taille = zip.readUInt32LE(p + 20);
    const lNom = zip.readUInt16LE(p + 28);
    const lExtra = zip.readUInt16LE(p + 30);
    const lCom = zip.readUInt16LE(p + 32);
    const local = zip.readUInt32LE(p + 42);
    const n = zip.toString('utf8', p + 46, p + 46 + lNom);
    if (n === nom) {
      const debut = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const donnees = zip.subarray(debut, debut + taille);
      return methode === 8 ? zlib.inflateRawSync(donnees) : donnees;
    }
    p += 46 + lNom + lExtra + lCom;
  }
  return null;
}

const decoder = (s) => s.replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

test('modèle Word : tampon puis signature par-dessus, sous « Me {notaire} », images transparentes', () => {
  const doc = fichierDuDocx('word/document.xml').toString('utf8');
  const rels = fichierDuDocx('word/_rels/document.xml.rels').toString('utf8');
  assert.match(rels, /Id="rId25"[^>]*Target="media\/image6\.png"/);
  assert.match(rels, /Id="rId26"[^>]*Target="media\/image7\.png"/);
  const apres = doc.slice(doc.indexOf('Me {notaire}'));
  const tampon = apres.indexOf('r:embed="rId25"');
  const signature = apres.indexOf('r:embed="rId26"');
  assert.ok(tampon > 0 && signature > tampon, 'tampon puis signature après « Me {notaire} »');
  const hauteurs = [...apres.matchAll(/relativeHeight="(\d+)"/g)].map(m => +m[1]);
  assert.ok(hauteurs[1] > hauteurs[0], 'la signature passe devant le tampon');
  assert.ok(!/behindDoc="1"/.test(apres), 'ni l’un ni l’autre derrière le texte');
  for (const img of ['word/media/image6.png', 'word/media/image7.png']) {
    const png = fichierDuDocx(img);
    assert.strictEqual(png.readUInt8(25), 6, img + ' : PNG avec couche alpha (sans fond)');
  }
});

test('PDF/A : les textes du courrier sont ceux du modèle Word, mot pour mot', () => {
  const app = chargerApplication();
  const doc = fichierDuDocx('word/document.xml').toString('utf8');
  const corps = doc.slice(doc.indexOf('<w:body>'), doc.indexOf('<w:sectPr>'));
  // Le texte du modèle, paragraphe par paragraphe, balises {…} retirées.
  const paragraphesModele = [...corps.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)]
    .map(m => decoder([...m[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>|<w:br\/>/g)].map(t => t[1] === undefined ? ' ' : t[1]).join('')).replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ').trim())
    .filter(t => t.length > 25);
  const donneesVides = { debitRows: [], creditRows: [] };
  const textePdf = app.blocsCourrierPdfA(donneesVides).filter(b => b.type === 'para')
    .map(b => b.runs.map(r => r.t).join('')).join(' ').replace(/\s+/g, ' ');
  assert.ok(paragraphesModele.length >= 8);
  for (const p of paragraphesModele) {
    const sansMe = p.replace(/^Me $/, '');
    const morceaux = sansMe.split(/ ?, ?(?=[a-zé])|\. /).filter(m => m.length > 15);
    for (const m of morceaux) assert.ok(textePdf.includes(m.trim()), 'absent du PDF : « ' + m + ' »');
  }
  // Les libellés fixes du tableau.
  const tableau = app.blocsCourrierPdfA(donneesVides).find(b => b.type === 'tableau');
  const libelles = tableau.rangees.map(r => r.cellules[0]).filter(Boolean).join('|');
  assert.strictEqual(libelles, 'Soit au total|A déduire|Soit au total|Solde à verser');
});

test('PDF/A : les données placées comme dans le .docx (débit à droite, crédit au milieu, mention en italique)', () => {
  const app = chargerApplication();
  const blocs = app.blocsCourrierPdfA({
    addrLines: 'Madame Léa MARTIN\n3 rue des Ormes\n41000 BLOIS', mention: 'Envoi par e-mail uniquement', ville: 'Blois', dateLettre: '9 octobre 2026',
    rdvPhrase: 'le mardi 20 octobre 2026, à 10 heures', adresseBien: 'BLOIS', designation: 'une maison', notaire: 'Sophie GOSSART',
    debitRows: [{ label: 'Prix', amount: '200.000,00 €', formula: '200.000 € × 1' }], totalDebit: '200.000,00 €',
    creditRows: [{ label: 'Acompte', amount: '10.000,00 €' }], totalCredit: '10.000,00 €', solde: '190.000,00 €'
  });
  const adresse = blocs[1].runs;
  assert.ok(adresse.some(r => r.i && /Envoi par e-mail uniquement/.test(r.t)));
  const tableau = blocs.find(b => b.type === 'tableau');
  assert.strictEqual(tableau.rangees[0].cellules.join('|'), 'Prix||200.000,00 €');
  assert.strictEqual(tableau.rangees[0].formule, '200.000 € × 1');
  assert.ok(tableau.rangees.some(r => r.cellules.join('|') === 'Acompte|10.000,00 €|'));
  assert.ok(tableau.rangees.some(r => r.cellules.join('|') === 'Solde à verser||190.000,00 €' && r.gras));
  const rdv = blocs.flatMap(b => b.runs || []).find(r => /20 octobre/.test(r.t));
  assert.ok(rdv.b && rdv.u, 'le rendez-vous en gras souligné');
  assert.strictEqual(blocs[blocs.length - 1].type, 'tampon');
  assert.ok(blocs[blocs.length - 2].avecSuivant, '« Me … » reste sur la page du tampon');
});

test('PDF/A : coupe en lignes, retours forcés, jamais justifiée en dernière ligne', () => {
  const app = chargerApplication();
  const mesurer = (t) => t.length * 5;
  const lignes = app.lignesSegmentsPdfA([{ t: 'un deux trois quatre cinq six' }, { t: ' sept\nhuit', u: true }], 60, mesurer);
  assert.strictEqual(lignes.map(l => l.jetons.map(j => j.t).join('')).join('/'), 'un deux/trois quatre/cinq six/sept/huit');
  assert.ok(lignes[3].forcee, 'retour forcé');
  assert.ok(lignes[4].derniere);
  assert.ok(lignes[3].jetons[0].u, 'le soulignement suit le segment');
});

test('PDF/A : aucun glyphe absent de la police (interdit en PDF/A)', () => {
  const app = chargerApplication();
  const connus = new Set([...'abc '].map(c => c.codePointAt(0)));
  assert.strictEqual(app.texteImprimablePdfA('a b’c✓', cp => connus.has(cp)), "a b'c?");
});

test('PDF/A : métadonnées XMP pdfaid 2 / U, mêmes titre et date que le dictionnaire Info', () => {
  const app = chargerApplication();
  const xmp = app.xmpPdfA({ titre: 'Convocation - DUPONT & fils', auteur: 'Office', logiciel: 'CLAIRE', producteur: 'CLAIRE (pdf-lib 1.17.1)', date: new Date('2026-10-09T15:50:12.345Z') });
  assert.match(xmp, /<pdfaid:part>2<\/pdfaid:part>/);
  assert.match(xmp, /<pdfaid:conformance>U<\/pdfaid:conformance>/);
  assert.match(xmp, /<xmp:CreateDate>2026-10-09T15:50:12Z<\/xmp:CreateDate>/);
  assert.match(xmp, /DUPONT &amp; fils/);
  assert.strictEqual(app.nomFichierPdfA("Convocation au rendez-vous contenant l'appel de fonds - DUPONT.docx"), "Convocation au rendez-vous contenant l'appel de fonds - DUPONT.pdf");
});
