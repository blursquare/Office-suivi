  // Courrier d'appel de fonds en PDF/A-2U (ISO 19005-2), prêt à déposer dans Authentic (étude 09/10 : « le certificat est celui-ci
  // dans authentic : Conformité Norme : PDF/A-2B, Nom ISO : ISO 19005-2 », puis « passe en 2U » — le niveau au-dessus : tout le
  // texte a sa correspondance Unicode ; un fichier 2U est aussi un 2B valide).
  //
  // Le PDF est COMPOSÉ ici, dans le navigateur, avec pdf-lib : un .docx ne se convertit pas en PDF sans Word ni LibreOffice, et ni
  // l'un ni l'autre ne tourne sur le serveur de l'étude. Il reprend le même courrier que le .docx : mêmes données
  // (`donneesCourrierAppelFonds`, ou celles d'un courrier gardé), mêmes textes (`blocsCourrierPdfA`, copiés du modèle Word — test
  // `tests/courrier-pdfa.test.js` qui relit le modèle), même en-tête, même tampon et même signature, mêmes positions (relevées sur
  // le modèle : marges de 5 cm à gauche et 1 cm à droite, Times New Roman 11 pt, en-tête en Calibri Light).
  //
  // Ce qui fait un PDF/A-2U : toutes les polices EMBARQUÉES (Liberation Serif = métriques de Times New Roman, Carlito = métriques
  // de Calibri, servies par le serveur dans vendor/polices/courrier/, jamais une police standard du PDF) ; aucun glyphe absent
  // (`texteImprimablePdfA`) ; métadonnées XMP `pdfaid:part 2 / conformance U` identiques au dictionnaire Info (`xmpPdfA`) ; un profil
  // de couleur sRGB en OutputIntent ; un identifiant de fichier dans le trailer. La transparence (tampon, signature, logos) est
  // permise en PDF/A-2. Contrôlé avec veraPDF (profils PDF/A-2U et 2B) au moment de l'écriture ; l'acceptation par Authentic se vérifie au
  // bureau (point terrain `courrier-pdfa-authentic`).

  var URL_PDF_LIB_PDFA = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';
  var URL_FONTKIT_PDFA = 'https://cdn.jsdelivr.net/npm/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js';
  var POLICES_COURRIER_PDFA = {
    serif: 'vendor/polices/courrier/LiberationSerif-Regular.ttf',
    serifGras: 'vendor/polices/courrier/LiberationSerif-Bold.ttf',
    serifItalique: 'vendor/polices/courrier/LiberationSerif-Italic.ttf',
    sans: 'vendor/polices/courrier/Carlito-Regular.ttf',
    sansGras: 'vendor/polices/courrier/Carlito-Bold.ttf'
  };
  // Profil sRGB (ICC) de l'OutputIntent : 588 octets, créé par LittleCMS (« sRGB built-in »).
  var PROFIL_SRGB_PDFA = 'AAACTGxjbXMEQAAAbW50clJHQiBYWVogB+oACgAJAA8AKgAuYWNzcEFQUEwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPbWAAEAAAAA0y1sY21zAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALZGVzYwAAAQgAAAA2Y3BydAAAAUAAAABMd3RwdAAAAYwAAAAUY2hhZAAAAaAAAAAsclhZWgAAAcwAAAAUYlhZWgAAAeAAAAAUZ1hZWgAAAfQAAAAUclRSQwAAAggAAAAgZ1RSQwAAAggAAAAgYlRSQwAAAggAAAAgY2hybQAAAigAAAAkbWx1YwAAAAAAAAABAAAADGVuVVMAAAAaAAAAHABzAFIARwBCACAAYgB1AGkAbAB0AC0AaQBuAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAADAAAAAcAE4AbwAgAGMAbwBwAHkAcgBpAGcAaAB0ACwAIAB1AHMAZQAgAGYAcgBlAGUAbAB5WFlaIAAAAAAAAPbWAAEAAAAA0y1zZjMyAAAAAAABDEIAAAXe///zJQAAB5MAAP2Q///7of///aIAAAPcAADAblhZWiAAAAAAAABvoAAAOPUAAAOQWFlaIAAAAAAAACSfAAAPhAAAtsNYWVogAAAAAAAAYpcAALeHAAAY2XBhcmEAAAAAAAMAAAACZmYAAPKnAAANWQAAE9AAAApbY2hybQAAAAAAAwAAAACj1wAAVHsAAEzNAACZmgAAJmYAAA9c';

  // Mise en page, en points (1 pt = 1/72 de pouce), relevée sur le modèle Word (A4, marges 2835/567/567/1079 twips).
  var PAGE_PDFA = { largeur: 595.28, hauteur: 841.89, gauche: 141.75, droite: 566.93, haut: 28.35, bas: 787.9, basPremiere: 780 };
  var CORPS_PDFA = { taille: 11, interligne: 12.65, montee: 9.8 };
  // Première page : le destinataire et la date s'écrivent à droite du bloc « Nous contacter », comme dans le .docx (cadre à
  // habillage) ; sous lui, le texte reprend toute la largeur.
  var HABILLAGE_PREMIERE_PDFA = { gauche: 300.1, jusqua: 309, depart: 139.6 };
  var TABLEAU_PDFA = { gauche: 136.35, largeur: 425.2, colonnes: [0.6, 0.2, 0.2], marge: 5.4, ligne: 13.15 };
  // Pictogrammes de la colonne « Nous contacter » (grille de 24, comme les icônes du modèle) : téléphone, enveloppe, souris (site), repère.
  var PICTOGRAMMES_PDFA = {
    telephone: 'M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z',
    email: 'M2 6.5C2 5.1 3.1 4 4.5 4h15C20.9 4 22 5.1 22 6.5v11c0 1.4-1.1 2.5-2.5 2.5h-15C3.1 20 2 18.9 2 17.5v-11zM4.6 6.4l7.4 5.4 7.4-5.4H4.6zM4 8.3v9.2c0 .3.2.5.5.5h15c.3 0 .5-.2.5-.5V8.3l-8 5.8-8-5.8z',
    site: 'M13 1.1V9h7c0-4.1-3.1-7.4-7-7.9zM4 15c0 4.4 3.6 8 8 8s8-3.6 8-8v-4H4v4zm7-13.9C7.1 1.6 4 4.9 4 9h7V1.1z',
    adresse: 'M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5c-1.4 0-2.5-1.1-2.5-2.5S10.6 6.5 12 6.5s2.5 1.1 2.5 2.5-1.1 2.5-2.5 2.5z'
  };
  var TAMPON_PDFA = { x: 413.4, largeur: 141.73, hauteur: 82.88, decalage: 4.72, bloc: 87.6, signatureLargeur: 125.98, signatureHauteur: 75.11 };

  // Pure : les paragraphes et le tableau du courrier, dans l'ordre du modèle Word (word/document.xml d'appel-de-fonds-modele.js).
  // Les textes fixes sont ceux du modèle MOT POUR MOT (vérifié par le test) ; `avant` / `apres` = espacements du modèle en points.
  function blocsCourrierPdfA(donnees) {
    const d = donnees || {};
    const t = (texte, style) => Object.assign({ t: String(texte == null ? '' : texte) }, style || {});
    const blocs = [];
    blocs.push({ type: 'para', runs: [], avant: 0, apres: 0 });
    const adresse = [t(d.addrLines || '')];
    if (d.mention) adresse.push(t('\n' + d.mention, { i: true }));
    adresse.push(t('\n\n\n\n\n'));
    blocs.push({ type: 'para', runs: adresse, avant: 10, apres: 4, habillage: true });
    blocs.push({ type: 'para', runs: [t((d.ville || '') + ', le ' + (d.dateLettre || '') + '\n\n')], avant: 15, apres: 15, habillage: true });
    const just = { jc: 'both', apres: 10 };
    blocs.push(Object.assign({ type: 'para', runs: [t(d.salut1)] }, just));
    blocs.push(Object.assign({ type: 'para', runs: [
      t("J'ai le plaisir de vous confirmer le rendez-vous pour la signature de l'acte de "), t('vente', { u: true }),
      t(', à votre profit, portant sur ' + (d.designation || '') + ' située à '), t(d.adresseBien, { u: true }), t(', '),
      t(d.rdvPhrase, { b: true, u: true }), t('.')
    ] }, just));
    blocs.push(Object.assign({ type: 'para', runs: [t("Votre décompte prévisionnel s'établit comme suit :")] }, just));
    const rangees = [];
    (d.debitRows || []).forEach(r => rangees.push({ cellules: [r.label, '', r.amount], formule: r.formula || '' }));
    rangees.push({ cellules: ['Soit au total', '', d.totalDebit], gras: true });
    rangees.push({ cellules: ['', '', ''] });
    rangees.push({ cellules: ['A déduire', '', ''] });
    (d.creditRows || []).forEach(r => rangees.push({ cellules: [r.label, r.amount, ''], formule: r.formula || '' }));
    rangees.push({ cellules: ['Soit au total', d.totalCredit, ''], gras: true });
    rangees.push({ cellules: ['Solde à verser', '', d.solde], gras: true });
    blocs.push({ type: 'tableau', rangees });
    blocs.push({ type: 'para', runs: [], avant: 0, apres: 0 });
    const g = { b: true };
    blocs.push(Object.assign({ type: 'para', runs: [t('ATTENTION : Les paiements effectués ou reçus par un notaire doivent être assurés par virement (article L.112-6.1 du Code monétaire et financier).', g)] }, just));
    blocs.push(Object.assign({ type: 'para', runs: [
      t("A cet effet, vous trouverez ci-joint le R.I.B. de l'étude et je vous remercie de prendre toutes dispositions pour que le compte de l'étude soit crédité, au plus tard, ", g),
      t('2 jours ouvrés avant la date de signature', { b: true, u: true }), t('. ' + (d.phraseDeblocage || ''), g)
    ] }, just));
    blocs.push(Object.assign({ type: 'para', runs: [
      t("Par ailleurs, conformément à la réglementation en vigueur et aux directives de notre profession, je vous remercie de bien vouloir vous munir d'une ", g),
      t("pièce d'identité", { b: true, u: true }), t(", d'un ", g), t('RIB', { b: true, u: true }), t(" et d'une ", g),
      t('attestation émanant de la banque', { b: true, u: true }), t(" qui aura émis le virement justifiant de l'origine des fonds.", g)
    ] }, just));
    blocs.push(Object.assign({ type: 'para', runs: [t('Je vous rappelle enfin que vous devez, préalablement à la signature :')] }, just));
    blocs.push({ type: 'para', apres: 10, runs: [t("- effectuer une visite du bien ;\n- procéder à un relevé contradictoire des compteurs ;\n- le cas échéant, vous assurer de la bonne libération de l'immeuble et de la présence du mobilier repris ;\n- souscrire une assurance habitation.")] });
    blocs.push(Object.assign({ type: 'para', runs: [t("Dans l'attente du plaisir de notre rencontre, et avec mes remerciements anticipés, je vous prie d'agréer, " + (d.salut2 || '') + ' mes salutations distinguées.')] }, just));
    blocs.push({ type: 'para', runs: [t('Me ' + (d.notaire || ''))], avant: 20, apres: 0, jc: 'right', avecSuivant: true });
    blocs.push({ type: 'tampon' });
    return blocs;
  }

  // Pure : découpe des segments de texte (gras / italique / souligné) en mots et espaces, puis en lignes d'au plus `largeur`
  // points ; `mesurer(texte, style)` rend la largeur d'un texte. Un « \n » force la ligne. Chaque ligne dit si elle est la
  // dernière de son paragraphe ou finie par un retour forcé : celles-là ne sont jamais justifiées.
  function lignesSegmentsPdfA(runs, largeur, mesurer) {
    const jetons = [];
    (runs || []).forEach(r => {
      const style = { b: !!r.b, i: !!r.i, u: !!r.u };
      String(r.t || '').split(/(\n| +)/).forEach(morceau => {
        if (!morceau) return;
        if (morceau === '\n') jetons.push({ retour: true });
        else jetons.push(Object.assign({ t: morceau, espace: /^ +$/.test(morceau), l: mesurer(morceau, style) }, style));
      });
    });
    const lignes = [];
    let courante = [];
    let l = 0;
    const fermer = (forcee) => {
      while (courante.length && courante[courante.length - 1].espace) courante.pop();
      lignes.push({ jetons: courante, largeur: courante.reduce((s, j) => s + j.l, 0), forcee });
      courante = [];
      l = 0;
    };
    jetons.forEach(j => {
      if (j.retour) { fermer(true); return; }
      if (j.espace && !courante.length) return;
      if (!j.espace && courante.length && l + j.l > largeur + 0.01) fermer(false);
      if (j.espace && !courante.length) return;
      courante.push(j);
      l += j.l;
    });
    fermer(true);
    lignes[lignes.length - 1].derniere = true;
    return lignes;
  }

  // Pure : le texte tel que la police peut l'écrire. Un glyphe absent ferait référencer le glyphe « .notdef », interdit en
  // PDF/A : les espaces insécables deviennent des espaces si la police ne les a pas, tout autre caractère absent un « ? ».
  function texteImprimablePdfA(texte, aGlyphe) {
    return Array.from(String(texte == null ? '' : texte)).map(c => {
      if (c === '\n') return c;
      if (aGlyphe(c.codePointAt(0))) return c;
      if (/\s/.test(c)) return ' ';
      if (c === '’' || c === '‘') return "'";
      if (c === '–' || c === '—') return '-';
      return '?';
    }).join('');
  }

  function echapperXmlPdfA(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Pure : date au format XMP, en UTC, à la seconde — le même instant que le dictionnaire Info écrit par pdf-lib (D:…Z).
  function dateXmpPdfA(date) {
    return new Date(Math.floor(date.getTime() / 1000) * 1000).toISOString().replace('.000Z', 'Z');
  }

  // Pure : métadonnées XMP d'un PDF/A-2U. Titre, auteur, logiciel et dates doivent être les mêmes que dans le dictionnaire Info.
  function xmpPdfA(meta) {
    const m = meta || {};
    const date = dateXmpPdfA(m.date || new Date());
    return '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>\n'
      + '<x:xmpmeta xmlns:x="adobe:ns:meta/">\n'
      + '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n'
      + '<rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/" xmlns:dc="http://purl.org/dc/elements/1.1/"'
      + ' xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">\n'
      + '<pdfaid:part>2</pdfaid:part>\n<pdfaid:conformance>U</pdfaid:conformance>\n'
      + '<dc:format>application/pdf</dc:format>\n'
      + '<dc:title><rdf:Alt><rdf:li xml:lang="x-default">' + echapperXmlPdfA(m.titre) + '</rdf:li></rdf:Alt></dc:title>\n'
      + '<dc:creator><rdf:Seq><rdf:li>' + echapperXmlPdfA(m.auteur) + '</rdf:li></rdf:Seq></dc:creator>\n'
      + '<xmp:CreatorTool>' + echapperXmlPdfA(m.logiciel) + '</xmp:CreatorTool>\n'
      + '<xmp:CreateDate>' + date + '</xmp:CreateDate>\n<xmp:ModifyDate>' + date + '</xmp:ModifyDate>\n<xmp:MetadataDate>' + date + '</xmp:MetadataDate>\n'
      + '<pdf:Producer>' + echapperXmlPdfA(m.producteur) + '</pdf:Producer>\n'
      + '</rdf:Description>\n</rdf:RDF>\n</x:xmpmeta>\n<?xpacket end="w"?>';
  }

  // Pure : nom du PDF à partir de celui du .docx (même convocation, même client).
  function nomFichierPdfA(nomDocx) {
    const base = String(nomDocx || "Convocation au rendez-vous contenant l'appel de fonds").replace(/\.docx$/i, '');
    return base + '.pdf';
  }

  var outilsPdfAEnCours = null;
  function chargerOutilsPdfA() {
    if (outilsPdfAEnCours) return outilsPdfAEnCours;
    outilsPdfAEnCours = (async () => {
      await chargerModeleAppelFonds();
      if (!window.PDFLib) await afChargerScript(URL_PDF_LIB_PDFA);
      if (!window.fontkit) await afChargerScript(URL_FONTKIT_PDFA);
      const polices = {};
      await Promise.all(Object.keys(POLICES_COURRIER_PDFA).map(async cle => {
        const r = await fetch(POLICES_COURRIER_PDFA[cle]);
        if (!r.ok) throw new Error('Police du courrier introuvable : ' + POLICES_COURRIER_PDFA[cle]);
        polices[cle] = new Uint8Array(await r.arrayBuffer());
      }));
      return polices;
    })();
    outilsPdfAEnCours.catch(() => { outilsPdfAEnCours = null; });
    return outilsPdfAEnCours;
  }

  function octetsDepuisDataUri(uri) {
    return afBase64VersOctets(String(uri || '').replace(/^data:[^,]*,/, ''));
  }

  // Génère le PDF/A-2U du courrier et renvoie { blob, nom, donnees } — même contrat que genererBlobAppelFonds.
  // `generique` (étude 15/10, « Constitution de dossier ») : { blocs, ref } ou { fidele, refLignes, signe } — n'importe quel courrier de l'office sur le même papier
  // (en-tête, polices embarquées, tampon et signature, PDF/A-2U) ; sans lui, le courrier d'appel de fonds.
  async function genererPdfAAppelFonds(donneesGardees, nomGarde, generique) {
    const octetsPolices = await chargerOutilsPdfA();
    const { PDFDocument, PDFName, PDFString, PDFHexString, rgb } = window.PDFLib;
    const donnees = generique ? { ref: String(generique.ref || '') } : normaliserDonneesCourrierAppelFonds(donneesGardees || donneesCourrierAppelFonds());
    const nomDocx = nomGarde || (generique ? 'Courrier' : afNomFichierDocx(afClients.filter(c => String(c.nom || '').trim())));
    const doc = await PDFDocument.create();
    doc.registerFontkit(window.fontkit);
    const polices = {};
    // Carlito embarquée entière : le découpage de pdf-lib y perd des glyphes (en-tête illisible, vu le 09/10) ; Liberation
    // Serif, elle, se découpe sans perte. Ligatures coupées : celle de « ti » (Carlito) était mal espacée (« desti né »).
    const sansLigatures = { liga: false, clig: false, dlig: false, calt: false };
    for (const cle of Object.keys(octetsPolices)) polices[cle] = await doc.embedFont(octetsPolices[cle], { subset: !/^sans/.test(cle), features: sansLigatures });
    const jeux = {};
    Object.keys(polices).forEach(cle => { jeux[cle] = new Set(polices[cle].getCharacterSet()); });
    const serif = (style) => style && style.b ? 'serifGras' : (style && style.i ? 'serifItalique' : 'serif');
    const propre = (texte, cle) => texteImprimablePdfA(texte, cp => jeux[cle].has(cp));
    const mesurer = (texte, style, taille) => { const cle = serif(style); return polices[cle].widthOfTextAtSize(propre(texte, cle), taille || CORPS_PDFA.taille); };
    const noir = rgb(0, 0, 0);
    const hex = (h) => rgb(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255);
    const assets = window.APPEL_FONDS_MODELE.assets;
    const images = {};
    for (const cle of ['logoNotaires', 'logoOffice', 'iconVisio', 'iconFacebook', 'iconInstagram', 'tampon', 'signature']) {
      if (assets[cle]) images[cle] = await doc.embedPng(octetsDepuisDataUri(assets[cle]));
    }

    let page = null;
    let numero = 0;
    let y = 0;
    const H = PAGE_PDFA.hauteur;
    // Coordonnées « depuis le haut » comme dans Word ; pdf-lib compte depuis le bas.
    const ecrire = (texte, x, yHaut, cle, taille, couleur, montee) => {
      const s = propre(texte, cle);
      if (!s) return 0;
      page.drawText(s, { x, y: H - yHaut - (montee == null ? taille * 0.891 : montee), size: taille, font: polices[cle], color: couleur || noir });
      return polices[cle].widthOfTextAtSize(s, taille);
    };
    const trait = (x1, y1, x2, y2, epaisseur, couleur) => page.drawLine({ start: { x: x1, y: H - y1 }, end: { x: x2, y: H - y2 }, thickness: epaisseur, color: couleur || noir });
    const image = (cle, x, yHaut, largeur, hauteur) => { if (images[cle]) page.drawImage(images[cle], { x, y: H - yHaut - hauteur, width: largeur, height: hauteur }); };

    const enTetePremiere = () => {
      const gris = hex('999999');
      image('logoNotaires', 6.4, 1.8, 224, 115.2);
      image('logoOffice', 290.6, -6.7, 218.2, 127.6);
      // Sous le logo de l'office, détachée de « Office notarial de la Salamandre » et plus fine (étude 18/10 : « un peu collée et un peu
      // grosse » ; le modèle l'écrit en Calibri Light, que Carlito n'a pas : un corps plus petit compense).
      const adr = '3 RUE DU BOUT DES HAIES – 41000 BLOIS';
      const lAdr = polices.sans.widthOfTextAtSize(propre(adr, 'sans'), 8.5);
      ecrire(adr, 399.7 - lAdr / 2, 97.5, 'sans', 8.5, hex('A6A6A6'));
      // Coins du cadre du destinataire.
      [[262.8, 131.3, 1, 1], [550.8, 131.3, -1, 1], [262.8, 232.9, 1, -1], [550.8, 232.9, -1, -1]].forEach(([cx, cy, sx, sy]) => {
        trait(cx, cy, cx + 6 * sx, cy, 0.6, gris);
        trait(cx, cy, cx, cy + 6 * sy, 0.6, gris);
      });
      const rouge = hex('C00000');
      const or = hex('BF8F00');
      const lien = hex('0000EE');
      const titre = (texte, x, yHaut) => { const l = ecrire(texte, x, yHaut, 'sansGras', 10, rouge, 9.52); trait(x, yHaut + 11, x + l, yHaut + 11, 0.6, rouge); };
      titre('NOUS CONTACTER', 21.6, 127);
      // Les icônes du modèle Word devant chaque ligne (✆, enveloppe, souris, repère — en or), dessinées en tracés vectoriels (étude 18/10 :
      // « il n'y a pas les icônes devant les numéro, adresse »).
      const pictogramme = (cle, yHaut) => page.drawSvgPath(PICTOGRAMMES_PDFA[cle], { x: 21.2, y: H - yHaut - 0.6, scale: 9 / 24, color: or });
      pictogramme('telephone', 139.1); ecrire('02 54 78 61 70', 34, 139.1, 'sans', 10, noir, 9.52);
      pictogramme('email', 151.2);
      let l = ecrire('office.gossart@notaires.fr', 34, 151.2, 'sans', 10, lien, 9.52); trait(34, 162.2, 34 + l, 162.2, 0.5, lien);
      pictogramme('site', 163.3);
      l = ecrire('sophie-gossart-blois.notaires.fr', 34, 163.3, 'sans', 10, lien, 9.52); trait(34, 174.3, 34 + l, 174.3, 0.5, lien);
      pictogramme('adresse', 175.4); ecrire('3 rue du Bout des Haies - 41000 BLOIS', 34, 175.4, 'sans', 10, noir, 9.52);
      image('iconFacebook', 21, 187, 10.5, 10.5); ecrire('@bloisnotaire', 34, 187.5, 'sans', 10, noir, 9.52);
      image('iconInstagram', 21, 200.6, 10.5, 10.5); ecrire('@bloisnotairegossart', 34, 200.1, 'sans', 10, noir, 9.52);
      // Un courrier de la Constitution de dossier porte la colonne entière (intitulé, référence, responsable), six lignes au plus avant « HORAIRES ».
      const refLignes = generique && generique.refLignes && generique.refLignes.length ? generique.refLignes.slice(0, 6) : ['Nos Réf : ' + (donnees.ref || '')];
      refLignes.forEach((ligne, i) => ecrire(ligne, 21.6, 224.9 + i * 12.1, 'sans', 10, noir, 9.52));
      titre('HORAIRES', 19.4, 309.7);
      ['Ouvert au public', 'du LUNDI au', 'VENDREDI', 'de 9 h à 12 h', 'et de 14 h à 18 h.', 'SAMEDI matin :', 'sur rendez-vous.', 'PARKING']
        .forEach((ligne, i) => ecrire(ligne, 19.4, 321.8 + i * 12.1, 'sans', 10, noir, 9.52));
      ['OFFICE EQUIPE', 'DE LA', 'VISIOCONFERENCE', 'DE LA PROFESSION'].forEach((ligne, i) => ecrire(ligne, 19.4, 624.3 + i * 9.7, 'sans', 8, noir, 7.6));
      image('iconVisio', 21, 674, 64.7, 57.2);
      // Pied de la première page (footer2.xml) : deux lignes centrées, la seconde en or.
      const centre = 295.9;
      const ligneCentree = (segments, yHaut, couleur) => {
        const total = segments.reduce((s, sg) => s + polices.sans.widthOfTextAtSize(propre(sg.t, 'sans'), 10), 0);
        let x = centre - total / 2;
        segments.forEach(sg => {
          const lg = ecrire(sg.t, x, yHaut, 'sans', 10, couleur, 9.52);
          if (sg.u) trait(x, yHaut + 10.8, x + lg, yHaut + 10.8, 0.5, couleur || noir);
          x += lg;
        });
      };
      ligneCentree([{ t: 'Toute somme supérieure à 3.000 € qui nous est versée en vue d’un acte destiné à la publicité foncière doit' }], 791.4);
      ligneCentree([{ t: 'nous parvenir ' }, { t: 'obligatoirement', u: true }, { t: ' par ' }, { t: 'virement anticipé', u: true }, { t: '. (Article L 112-6-1 du code monétaire et financier)' }], 803.5);
      ligneCentree([{ t: 'Membre d’une association agréé – Le règlement des honoraires par chèque est accepté' }], 815.6, or);
    };
    const nouvellePage = () => {
      page = doc.addPage([PAGE_PDFA.largeur, PAGE_PDFA.hauteur]);
      numero += 1;
      if (numero === 1) { enTetePremiere(); y = HABILLAGE_PREMIERE_PDFA.depart; } else y = PAGE_PDFA.haut;
    };
    const bas = () => numero === 1 ? PAGE_PDFA.basPremiere : PAGE_PDFA.bas;
    const place = (hauteur) => { if (y + hauteur > bas()) nouvellePage(); };

    // Une ligne de texte : segments, justification, soulignés.
    const dessinerLigne = (ligne, x, largeur, jc, yHaut) => {
      const espaces = ligne.jetons.filter(j => j.espace).length;
      const justifier = jc === 'both' && !ligne.forcee && !ligne.derniere && espaces > 0;
      const surplus = justifier ? (largeur - ligne.largeur) / espaces : 0;
      let cx = jc === 'right' ? x + largeur - ligne.largeur : x;
      ligne.jetons.forEach((j, i) => {
        const l = j.l + (j.espace ? surplus : 0);
        if (!j.espace) ecrire(j.t, cx, yHaut, serif(j), CORPS_PDFA.taille, noir, CORPS_PDFA.montee);
        const suivant = ligne.jetons[i + 1];
        if (j.u && (!j.espace || (suivant && suivant.u))) trait(cx, yHaut + CORPS_PDFA.montee + 1.4, cx + l, yHaut + CORPS_PDFA.montee + 1.4, j.b ? 0.8 : 0.55);
        cx += l;
      });
    };

    let apresPrecedent = 0;
    const blocs = generique ? (generique.blocs || []) : blocsCourrierPdfA(donnees);
    nouvellePage();
    // Courrier fidèle au modèle de l'étude (client/73) : dessiné ligne à ligne aux positions des originaux.
    if (generique && generique.fidele) {
      composerPdfCourrierFidele(generique.fidele, { numero: () => numero, nouvellePage, mesurer, dessinerLigne, image, trait, ecrire, page: () => page, H, hex, signe: !!generique.signe });
    }
    for (let n = 0; n < blocs.length; n++) {
      const b = blocs[n];
      if (b.type === 'para') {
        // Espacement entre deux paragraphes : le plus grand des deux (comme le rendu relevé du modèle).
        y += Math.max(apresPrecedent, b.avant || 0) - apresPrecedent;
        const enHabillage = () => numero === 1 && b.habillage && y < HABILLAGE_PREMIERE_PDFA.jusqua;
        const xGauche = enHabillage() ? HABILLAGE_PREMIERE_PDFA.gauche : PAGE_PDFA.gauche;
        const largeur = PAGE_PDFA.droite - xGauche;
        const lignes = b.runs.length ? lignesSegmentsPdfA(b.runs, largeur, (texte, style) => mesurer(texte, style)) : [{ jetons: [], largeur: 0, derniere: true }];
        if (b.avecSuivant) place(lignes.length * CORPS_PDFA.interligne + TAMPON_PDFA.bloc);
        lignes.forEach(ligne => {
          place(CORPS_PDFA.interligne);
          dessinerLigne(ligne, xGauche, largeur, b.jc, y);
          y += CORPS_PDFA.interligne;
        });
        y += b.apres || 0;
        apresPrecedent = b.apres || 0;
      } else if (b.type === 'tableau') {
        const T = TABLEAU_PDFA;
        const bords = [T.gauche];
        T.colonnes.forEach(c => bords.push(bords[bords.length - 1] + c * T.largeur));
        let hautTableau = y;
        const filetsVerticaux = (de, a) => {
          bords.forEach((bx, i) => {
            const exterieur = i === 0 || i === bords.length - 1;
            if (exterieur) { trait(bx, de, bx, a, 0.25); trait(bx + (i === 0 ? 1.2 : -1.2), de, bx + (i === 0 ? 1.2 : -1.2), a, 0.25); } else trait(bx, de, bx, a, 0.5);
          });
        };
        const filetDouble = (yy, dessous) => { trait(T.gauche, yy, bords[3], yy, 0.25); trait(T.gauche, yy + (dessous ? -1.2 : 1.2), bords[3], yy + (dessous ? -1.2 : 1.2), 0.25); };
        filetDouble(y, false);
        y += 2.2;
        b.rangees.forEach((r, i) => {
          const formule = r.formule ? '  ' + r.formule : '';
          const style = r.gras ? { b: true } : {};
          // Libellé sur autant de lignes qu'il en faut (audit 12/10 : un libellé long était coupé à sa première ligne —
          // les dates d'un prorata disparaissaient).
          const lignesLibelle = r.cellules[0]
            ? lignesSegmentsPdfA([Object.assign({ t: r.cellules[0] }, style)], bords[1] - bords[0] - 2 * T.marge, (tx, st) => mesurer(tx, st))
            : [];
          const enPlus = Math.max(0, lignesLibelle.length - 1) * CORPS_PDFA.interligne;
          const hauteur = T.ligne + enPlus + (formule ? 10.35 : 0);
          if (y + hauteur > bas()) {
            filetsVerticaux(hautTableau, y); filetDouble(y, true);
            nouvellePage(); hautTableau = y; filetDouble(y, false); y += 2.2;
          }
          if (i > 0 && y > hautTableau + 3) trait(T.gauche, y - 0.6, bords[3], y - 0.6, 0.5);
          r.cellules.forEach((texte, c) => {
            if (!texte) return;
            if (c === 0) {
              lignesLibelle.forEach((ligne, k) => {
                ecrire(ligne.jetons.map(j => j.t).join(''), bords[0] + T.marge, y + k * CORPS_PDFA.interligne, serif(style), CORPS_PDFA.taille, noir, CORPS_PDFA.montee);
              });
            } else {
              const l = mesurer(texte, style);
              ecrire(texte, bords[c + 1] - T.marge - l, y, serif(style), CORPS_PDFA.taille, noir, CORPS_PDFA.montee);
            }
          });
          if (formule) ecrire(formule, bords[0] + T.marge, y + enPlus + CORPS_PDFA.interligne, 'serifItalique', 9, hex('6b6250'), 8);
          y += hauteur;
        });
        filetsVerticaux(hautTableau, y + 0.5);
        filetDouble(y + 0.5, true);
        y += 1.7;
        apresPrecedent = 0;
      } else if (b.type === 'saut') {
        nouvellePage();
        apresPrecedent = 0;
      } else if (b.type === 'tampon') {
        const T = TAMPON_PDFA;
        place(T.bloc);
        image('tampon', T.x, y + T.decalage, T.largeur, T.hauteur);
        image('signature', T.x + (T.largeur - T.signatureLargeur) / 2, y + T.decalage + (T.hauteur - T.signatureHauteur) / 2, T.signatureLargeur, T.signatureHauteur);
        y += T.bloc;
        apresPrecedent = 0;
      }
    }

    // PDF/A-2U : Info = XMP, profil sRGB en OutputIntent, identifiant du fichier.
    const date = new Date(Math.floor(Date.now() / 1000) * 1000);
    const titre = nomFichierPdfA(nomDocx).replace(/\.pdf$/i, '');
    const meta = { titre, auteur: 'Office notarial de Maître Sophie GOSSART', logiciel: 'CLAIRE', producteur: 'CLAIRE (pdf-lib 1.17.1)', date };
    doc.setTitle(meta.titre);
    doc.setAuthor(meta.auteur);
    doc.setCreator(meta.logiciel);
    doc.setProducer(meta.producteur);
    doc.setCreationDate(date);
    doc.setModificationDate(date);
    const ctx = doc.context;
    const xmp = new TextEncoder().encode(xmpPdfA(meta));
    const flux = ctx.stream(xmp, { Type: 'Metadata', Subtype: 'XML', Length: xmp.length });
    doc.catalog.set(PDFName.of('Metadata'), ctx.register(flux));
    const profil = ctx.flateStream(afBase64VersOctets(PROFIL_SRGB_PDFA), { N: 3 });
    const intention = ctx.obj({
      Type: 'OutputIntent', S: 'GTS_PDFA1',
      OutputConditionIdentifier: PDFString.of('sRGB IEC61966-2.1'), Info: PDFString.of('sRGB IEC61966-2.1'),
      DestOutputProfile: ctx.register(profil)
    });
    doc.catalog.set(PDFName.of('OutputIntents'), ctx.obj([intention]));
    const alea = new Uint8Array(16);
    (window.crypto || {}).getRandomValues ? window.crypto.getRandomValues(alea) : alea.forEach((_, i) => { alea[i] = Math.floor(Math.random() * 256); });
    const id = Array.from(alea).map(o => o.toString(16).padStart(2, '0')).join('');
    ctx.trailerInfo.ID = ctx.obj([PDFHexString.of(id), PDFHexString.of(id)]);
    const octets = await doc.save({ useObjectStreams: false, updateFieldAppearances: false });
    return { blob: new Blob([octets], { type: 'application/pdf' }), nom: nomFichierPdfA(nomDocx), donnees };
  }

  async function telechargerAppelFondsPdfA(btn) {
    const libelleInitial = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Génération…'; }
    try {
      const { blob, nom, donnees } = await genererPdfAAppelFonds();
      telechargerFichier(blob, nom);
      // L'historique garde le nom du .docx : « Télécharger » y refait le Word, « PDF/A » ce même PDF.
      enregistrerAppelFondsHistorique('telecharge', nom.replace(/\.pdf$/i, '.docx'), donnees);
    } catch (e) {
      console.error(e);
      afficherToast("Le PDF n'a pas pu être généré. La première fois, le poste doit avoir accès au réseau (deux bibliothèques sont téléchargées une seule fois).", 'OK', null);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = libelleInitial; }
    }
  }
