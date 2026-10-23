// Attestation de transmission de RIB (étude 23/10 : « faire signer au client ce document et lui demander d'y ajouter son RIB en document
// obligatoire », « adapte le PDF à l'image de l'office, plus moderne », « complété à l'aide des informations des clients »).
// Les textes sont ceux du modèle de l'office (commun/attestation-rib.js) ; l'identité, le domicile et la référence viennent de la fiche
// (fiches client d'Authentic comprises), « [à compléter] » sinon. PDF composé dans le navigateur par pdf-lib, sur le papier de l'office :
// logos du courrier d'appel de fonds, polices embarquées (Liberation Serif, Carlito), bordeaux et or du logo. Rien n'est gardé sur le serveur.
// Le PDF est ensuite déposé dans Yousign (le connecteur n'a pas d'outil de dépôt) ; le RIB est la pièce que le client y joint.

var COULEURS_ATTESTATION_RIB = { bordeaux: '6D2332', or: 'C4922F', texte: '2B2326', gris: '6B5E64', panneau: 'F8F2F3', trait: 'E6D9DC' };
var PAGE_ATTESTATION_RIB = { largeur: 595.28, hauteur: 841.89, marge: 56 };

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

  // En-tête : les logos du courrier de l'office (leurs marges blanches font l'aération), puis un filet or.
  const assets = (window.APPEL_FONDS_MODELE && window.APPEL_FONDS_MODELE.assets) || {};
  const poserLogo = async (cle, x, yHaut, l) => {
    if (!assets[cle]) return;
    const image = await pdf.embedPng(octetsDepuisDataUri(assets[cle]));
    const h = l * image.height / image.width;
    page.drawImage(image, { x, y: bas(yHaut + h), width: l, height: h });
  };
  await poserLogo('logoOffice', marge - 20, 6, 170);
  await poserLogo('logoNotaires', droite - 96, 14, 120);
  filet(106, C.or, 1.2);

  // Titre : étiquette espacée puis titre en deux lignes.
  espace(doc.surtitre.toUpperCase(), marge, 142, 'sansGras', 10, C.or, 3);
  doc.titre.forEach((l, i) => texte(l, marge, 170 + i * 28, 'serifGras', 24, C.bordeaux));

  // Identité du signataire : un panneau clair, étiquette à gauche, valeur à droite.
  let y = 226;
  const colValeur = marge + 150;
  const largeurValeur = droite - 16 - colValeur;
  const rangees = doc.champs.map(c => ({ c, l: lignes(c.valeur, c.manque ? 'serifItalique' : 'sans', 12.5, largeurValeur) }));
  const hauteurPanneau = 26 + rangees.reduce((n, r) => n + Math.max(1, r.l.length) * 16 + 12, 0) - 12;
  page.drawRectangle({ x: marge, y: bas(y + hauteurPanneau), width: droite - marge, height: hauteurPanneau, color: couleur(C.panneau) });
  page.drawRectangle({ x: marge, y: bas(y + hauteurPanneau), width: 3.5, height: hauteurPanneau, color: couleur(C.or) });
  let ry = y + 24;
  rangees.forEach(r => {
    espace(r.c.libelle.toUpperCase(), marge + 20, ry - 1, 'sansGras', 8.5, C.gris, 1.4);
    r.l.forEach((l, i) => texte(l, colValeur, ry + i * 16, r.c.manque ? 'serifItalique' : 'sans', 12.5, r.c.manque ? C.bordeaux : C.texte));
    ry += Math.max(1, r.l.length) * 16 + 12;
  });

  // Engagements : le verbe en bordeaux dans la marge, le texte du modèle à droite, un filet entre deux.
  y = y + hauteurPanneau + 34;
  const colTexte = marge + 96;
  doc.engagements.forEach((e, i) => {
    const corps = lignes(e.texte, 'sans', 11.5, droite - colTexte);
    texte(e.verbe, marge, y, 'sansGras', 12.5, C.bordeaux);
    corps.forEach((l, k) => texte(l, colTexte, y + k * 15.5, 'sans', 11.5, C.texte));
    y += corps.length * 15.5 + 8;
    if (i < doc.engagements.length - 1) { filet(y - 4, C.trait, 0.6); y += 14; }
  });

  // Clôture et cadre de signature (le champ de signature se place dans Yousign).
  y += 22;
  texte(doc.cloture, marge, y + 6, 'serifItalique', 12, C.gris);
  const cadreL = 236, cadreH = 72;
  page.drawRectangle({ x: droite - cadreL, y: bas(y + cadreH), width: cadreL, height: cadreH, borderColor: couleur(C.bordeaux), borderWidth: 0.9, color: undefined });
  espace(doc.signature.toUpperCase(), droite - cadreL + 14, y + 20, 'sansGras', 8.5, C.bordeaux, 1.4);

  // Pied de page : filet or, identité de l'office.
  filet(hauteur - 66, C.or, 0.8);
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
