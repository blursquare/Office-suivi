// Attestation de transmission de RIB (étude 23/10 : « faire signer au client ce document et lui demander d'y ajouter son RIB en document
// obligatoire », « adapte le PDF à l'image de l'office, plus moderne », « complété à l'aide des informations des clients »).
// Les textes sont ceux du modèle de l'office (commun/attestation-rib.js) ; l'identité, le domicile et la référence viennent de la fiche
// (fiches client d'Authentic comprises), « [à compléter] » sinon. PDF composé dans le navigateur par pdf-lib, sur le papier de l'office :
// logos du courrier d'appel de fonds, polices embarquées (Liberation Serif, Carlito), bordeaux et or du logo. Rien n'est gardé sur le serveur.
// Le PDF est ensuite déposé dans Yousign (le connecteur n'a pas d'outil de dépôt) ; le RIB est la pièce que le client y joint.

// Papier sobre (étude 23/10 : « un peu plus professionnel, moins coloré ») : une seule couleur, le bordeaux du titre ; texte presque noir,
// filets gris. `visible` = la part de chaque logo qui n'est pas blanche (fractions de l'image, relevées sur les logos du courrier) : les marges
// blanches des logos ne décalent plus les bords.
var COULEURS_ATTESTATION_RIB = { bordeaux: '6D2332', texte: '262224', gris: '666666', filet: '8C8C8C', filetFin: 'D6D6D6' };
var PAGE_ATTESTATION_RIB = { largeur: 595.28, hauteur: 841.89, marge: 56.7 };
var LOGOS_ATTESTATION_RIB = { logoOffice: { visible: [0.1031, 0.1946, 0.8987, 0.7617] }, logoNotaires: { visible: [0.3172, 0.1117, 0.6841, 0.7792] } };

// Le lien sous la personne, dans la fiche : un clic = le PDF de cette personne.
function boutonAttestationRib(idDossier, index) {
  return `<span class="personne-attestation"><button type="button" class="lien-action" onclick="telechargerAttestationRib('${escapeOnclickArg(idDossier)}', ${Number(index)})" title="PDF à faire signer au client (code par SMS) en lui demandant de joindre son RIB">${icone('file-text')} Attestation de transmission de RIB</button></span>`;
}

async function attestationRibGenererPdf(doc) {
  const octets = await chargerOutilsPdfA();
  const { PDFDocument, rgb } = window.PDFLib;
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(window.fontkit);
  // Mêmes choix que le courrier : Carlito entière (le découpage de pdf-lib y perd des glyphes), ligatures coupées.
  const sansLigatures = { liga: false, clig: false, dlig: false, calt: false };
  const polices = {};
  for (const cle of ['serifGras', 'serifItalique', 'sans', 'sansGras']) polices[cle] = await pdf.embedFont(octets[cle], { subset: !/^sans/.test(cle), features: sansLigatures });
  const jeux = {};
  Object.keys(polices).forEach(cle => { jeux[cle] = new Set(polices[cle].getCharacterSet()); });
  let remplaces = 0;
  const propre = (texte, cle) => {
    const sortie = texteImprimablePdfA(texte, cp => jeux[cle].has(cp));
    remplaces += (sortie.match(/\?/g) || []).length - (String(texte).match(/\?/g) || []).length;
    return sortie;
  };
  const C = COULEURS_ATTESTATION_RIB;
  const couleur = h => rgb(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255);
  const { largeur, hauteur, marge } = PAGE_ATTESTATION_RIB;
  const page = pdf.addPage([largeur, hauteur]);
  const bas = y => hauteur - y; // coordonnées « depuis le haut », comme sur le papier
  const droite = largeur - marge;
  const largeurTexte = (t, cle, taille) => polices[cle].widthOfTextAtSize(propre(t, cle), taille);
  const texte = (t, x, y, cle, taille, hex) => page.drawText(propre(t, cle), { x, y: bas(y), font: polices[cle], size: taille, color: couleur(hex) });
  // Capitales espacées (étiquettes) : pdf-lib n'a pas d'espacement de lettres, chaque lettre est posée à son rang.
  const espace = (t, x, y, cle, taille, hex, ecart) => {
    let cx = x;
    Array.from(propre(t, cle)).forEach(c => { page.drawText(c, { x: cx, y: bas(y), font: polices[cle], size: taille, color: couleur(hex) }); cx += polices[cle].widthOfTextAtSize(c, taille) + ecart; });
  };
  const lignes = (t, cle, taille, maxL) => {
    const sortie = [];
    let ligne = '';
    propre(t, cle).split(/\s+/).filter(Boolean).forEach(m => {
      const essai = ligne ? ligne + ' ' + m : m;
      if (ligne && polices[cle].widthOfTextAtSize(essai, taille) > maxL) { sortie.push(ligne); ligne = m; } else ligne = essai;
    });
    if (ligne) sortie.push(ligne);
    return sortie;
  };
  const filet = (y, hex, epaisseur, x1, x2) => page.drawLine({ start: { x: x1 == null ? marge : x1, y: bas(y) }, end: { x: x2 == null ? droite : x2, y: bas(y) }, thickness: epaisseur, color: couleur(hex) });

  // En-tête : la partie visible de chaque logo posée sur les bords de la marge (office à gauche, Notaires de France à droite), un filet gris dessous.
  const assets = (window.APPEL_FONDS_MODELE && window.APPEL_FONDS_MODELE.assets) || {};
  const poserLogo = async (cle, cote, yHaut, hVisible) => {
    if (!assets[cle]) return;
    const image = await pdf.embedPng(octetsDepuisDataUri(assets[cle]));
    const [x0, y0, x1, y1] = LOGOS_ATTESTATION_RIB[cle].visible;
    const lVisible = hVisible * ((x1 - x0) * image.width) / ((y1 - y0) * image.height);
    const l = lVisible / (x1 - x0);
    const h = l * image.height / image.width;
    const xVisible = cote === 'droite' ? droite - lVisible : marge;
    page.drawImage(image, { x: xVisible - x0 * l, y: bas(yHaut - y0 * h + h), width: l, height: h });
  };
  await poserLogo('logoOffice', 'gauche', 40, 50);
  await poserLogo('logoNotaires', 'droite', 40, 50);
  filet(106, C.filet, 0.75);

  // Titre : étiquette espacée grise, puis le titre (seul élément en couleur).
  espace(doc.surtitre.toUpperCase(), marge, 146, 'sansGras', 9.5, C.gris, 2.5);
  doc.titre.forEach((l, i) => texte(l, marge, 176 + i * 27, 'serifGras', 23, C.bordeaux));

  // Identité du signataire : étiquette à gauche, valeur sur un filet.
  let y = 236;
  const colValeur = marge + 130;
  const rangees = doc.champs.map(c => ({ c, l: lignes(c.valeur, c.manque ? 'serifItalique' : 'sans', 12, droite - colValeur) }));
  rangees.forEach(r => {
    espace(r.c.libelle.toUpperCase(), marge, y, 'sansGras', 8.5, C.gris, 1.2);
    r.l.forEach((l, i) => texte(l, colValeur, y + i * 16, r.c.manque ? 'serifItalique' : 'sans', 12, r.c.manque ? C.gris : C.texte));
    const fin = y + (r.l.length - 1) * 16 + 6;
    filet(fin, C.filet, 0.5, colValeur, droite);
    y = fin + 22;
  });

  // Engagements : le verbe en gras dans la marge, le texte du modèle à droite, un filet fin entre deux.
  y += 14;
  const colTexte = marge + 85;
  doc.engagements.forEach((e, i) => {
    const corps = lignes(e.texte, 'sans', 11.5, droite - colTexte);
    texte(e.verbe, marge, y, 'sansGras', 11.5, C.texte);
    corps.forEach((l, k) => texte(l, colTexte, y + k * 15.5, 'sans', 11.5, C.texte));
    y += (corps.length - 1) * 15.5 + 12;
    if (i < doc.engagements.length - 1) { filet(y, C.filetFin, 0.6); y += 20; }
  });

  // Clôture et cadre de signature (le champ de signature se place dans Yousign).
  y += 34;
  texte(doc.cloture, marge, y + 6, 'sans', 11.5, C.texte);
  const cadreL = 226, cadreH = 74;
  page.drawRectangle({ x: droite - cadreL, y: bas(y - 12 + cadreH), width: cadreL, height: cadreH, borderColor: couleur(C.filet), borderWidth: 0.75 });
  espace(doc.signature.toUpperCase(), droite - cadreL + 12, y + 3, 'sansGras', 8.5, C.gris, 1.2);

  // Pied de page : filet gris, identité de l'office.
  filet(hauteur - 66, C.filet, 0.5);
  const pied = `${doc.entete.office}  ·  ${doc.entete.adresse}`;
  texte(pied, (largeur - largeurTexte(pied, 'sans', 8.5)) / 2, hauteur - 50, 'sans', 8.5, C.gris);

  pdf.setTitle('Attestation de transmission de relevé d’identité bancaire');
  pdf.setAuthor(doc.entete.office);
  pdf.setCreator('CLAIRE');
  pdf.setProducer('CLAIRE');
  const octetsPdf = await pdf.save();
  return { blob: new Blob([octetsPdf], { type: 'application/pdf' }), remplaces };
}

// Depuis la fiche : le PDF de la personne à `index` dans d.parties, rempli de ce que la fiche et Authentic en savent.
async function telechargerAttestationRib(idDossier, index) {
  const d = dossiers.find(x => x.id === idDossier);
  const partie = d && Array.isArray(d.parties) ? d.parties[index] : null;
  if (!partie) return;
  const personne = personneDossier(d, partie);
  const doc = documentAttestationRib(Object.assign({}, personne, { domicile: adressePostaleCourrier(personne.domicile).join(', ') }), referenceAttestationRib(libelleDossierAffiche(d), d.referenceAuthentic));
  try {
    const { blob, remplaces } = await attestationRibGenererPdf(doc);
    telechargerFichier(blob, nomFichierAttestationRib(personne));
    noterVerificationPoste('attestation-rib-pdf', { detail: 'PDF composé' });
    const manques = manquesAttestationRib(doc);
    const avert = [manques ? `${manques} ligne(s) « à compléter » dans le PDF` : '', remplaces ? `${remplaces} caractère(s) absent(s) de la police remplacé(s)` : ''].filter(Boolean).join(' · ');
    afficherToast(`Attestation de RIB téléchargée${avert ? ' — ' + avert : ''}.`, 'OK', null);
  } catch (e) {
    console.error(e);
    noterVerificationPoste('attestation-rib-pdf', { ok: false, message: 'composition du PDF impossible' });
    afficherToast('Le PDF n’a pas pu être généré. La première fois, le poste doit avoir accès au réseau (une bibliothèque est téléchargée une seule fois).', 'OK', null);
  }
}
