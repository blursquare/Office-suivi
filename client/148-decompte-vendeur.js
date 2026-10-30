// ==== Décompte vendeur (étude 30/10 : « voici un modèle de décompte vendeur pour que CLAIRE sache le faire aussi ») ====
//
// Outil du tiroir (Outils › Vente) et de la fiche d'une vente : le décompte des sommes qui reviennent au vendeur le jour de la signature,
// MIS EN PAGE COMME LE MODÈLE DE L'ÉTUDE (choix du 30/10 : ni papier à en-tête ni signature) — « Références dossier », « Date de signature
// prévisionnelle », « DECOMPTE VENDEUR », le vendeur, puis un tableau DEBIT / CREDIT : prix de vente (crédit), prorata de taxes foncières
// (crédit, part de l'acquéreur du jour de l'acte au 31/12, avis du NAS), commission due à l'agence (débit, quand l'avant-contrat la met à la
// charge du vendeur), remboursement anticipé du prêt (débit, LU dans le décompte de remboursement de la banque trouvé sur le NAS), provision
// sur frais d'acte de mainlevée (débit, 450 € modifiable, quand une inscription est en cours sur le bien ou qu'un remboursement est lu),
// « Ensemble », « Solde », et la phrase de l'étude sur le R.I.B., mot pour mot. Toutes les lignes se corrigent, s'ajoutent, se retirent ; rien
// n'est deviné : un montant non lu reste à saisir. PDF, Word, « Ranger dans le dossier » (NAS, sur un clic) et email au vendeur — premier jet
// de CLAIRE, rien ne part sans « Envoyer ». Jamais quand un confrère représente le vendeur (choix de l'étude : l'outil est masqué).
// « Demander à CLAIRE » : outil `decompte_vendeur`.

var PROVISION_MAINLEVEE_VENDEUR = 450;
var PIED_DECOMPTE_VENDEUR = 'Pour le règlement du prix de vente, veuillez-vous munir d\'un R.I.B. pour le jour de la signature';
// Le décompte de remboursement de la banque, reconnu par le NOM du fichier (jamais par le contenu, règle des pièces) ; jamais notre propre
// décompte (vendeur, acquéreur, appel de fonds) ni celui d'un confrère.
var RE_NOM_DECOMPTE_REMBOURSEMENT = /(d[ée]compte|decompte).{0,40}(rembours|anticip|pr[eê]t|cr[ée]dit|banque)|rembours\w*.{0,20}anticip|(?:^|[^a-z])(?:ra|rap)(?:[^a-z]|$).{0,30}(?:pr[eê]t|banque)/i;
var RE_NOM_PAS_REMBOURSEMENT = /vendeur|acqu[ée]reur|appel\s*de\s*fonds|convocation|projet|tableau\s*d.?amortissement|offre/i;
var LIBELLE_PRORATA_DECOMPTE_VENDEUR = 'Prorata de taxes foncières';

let dvEtat = { dossierId: '', lignes: [], date: '', datePrevue: false, destinataire: [], lectures: {}, tfAnnuel: null, jeton: 0, envoi: false, range: false };
let dvIdLigne = 0;
let dvMinuterieApercu = null;

// Pure : le montant total à rembourser lu dans le décompte d'une banque — « Total à rembourser », « Montant total du remboursement
// anticipé », « Somme due au … », « Total dû » ; plusieurs prêts dans le même décompte : le plus grand des totaux (le total général). Rien de
// sûr = null (le montant reste à saisir, jamais deviné).
function montantRemboursementDansTexte(texte) {
  const t = String(texte || '').replace(/[   ]/g, ' ');
  const montant = '(\\d{1,3}(?:[ .]\\d{3})+(?:,\\d{2})|\\d+(?:,\\d{2}))\\s*(?:€|EUR|euros?)?';
  const motifs = [
    'total\\s+(?:g[ée]n[ée]ral\\s+)?(?:[àa]\\s+(?:rembourser|r[ée]gler|payer|verser)|dû(?![a-zà-ü])|du(?=\\s*[:\\d])|des\\s+sommes\\s+dues|du\\s+remboursement(?:\\s+anticip[ée]e?)?|du\\s+d[ée]compte)',
    'montant\\s+(?:total\\s+)?(?:du\\s+|de\\s+(?:la\\s+)?)?remboursement\\s+(?:anticip[ée]e?|total)',
    // « due » / « dû » seulement : « montant du prêt » est le capital emprunté, jamais ce qui reste à rembourser.
    '(?:somme|montant)\\s+(?:totale?\\s+)?(?:restant\\s+)?(?:due|dû)(?![a-zà-ü])(?!\\s+au\\s+titre)',
    'solde\\s+(?:[àa]\\s+(?:rembourser|r[ée]gler)|restant\\s+d[uû])'
  ];
  for (const m of motifs) {
    // Entre le libellé et le montant : du texte, ou une date (« au 01/12/2026 », « au 1er décembre 2026 »), jamais un autre nombre.
    const re = new RegExp(m + '(?:[^\\d\\n]|\\d{1,2}/\\d{1,2}/\\d{2,4}|\\d{1,2}(?:er)?\\s+[a-zéû]+\\s+\\d{4}){0,60}?' + montant, 'gi');
    const trouves = [];
    let x;
    while ((x = re.exec(t))) { const n = montantDepuisTexteFr(x[1]); if (n > 0) trouves.push(n); }
    if (trouves.length) return Math.round(Math.max(...trouves) * 100) / 100;
  }
  return null;
}

// Pure : le nom du fichier dit-il un décompte de remboursement d'un prêt du vendeur ?
function nomDitDecompteRemboursement(nom) {
  const n = normaliserNomPourMotif(String(nom || '').split(/[\\/]/).pop());
  return /\.pdf$/i.test(String(nom || '')) && RE_NOM_DECOMPTE_REMBOURSEMENT.test(n) && !RE_NOM_PAS_REMBOURSEMENT.test(n)
    && !(typeof nomDitDecompteConfrere === 'function' && nomDitDecompteConfrere(n));
}

// Pure : l'outil a-t-il lieu d'être pour ce dossier ? Une vente non archivée dont le vendeur n'est pas accompagné par un confrère (choix de
// l'étude du 30/10 : le décompte vendeur revient alors au confrère, l'outil est masqué).
function decompteVendeurPossible(d) {
  return !!(d && !d.archive && !d.deleted && !estSuccession(d) && !confrereRepresenteVendeur(d));
}

// Pure : les vendeurs du dossier au format des clients du courrier d'appel de fonds (civilité, prénom, nom).
function vendeursDecompteVendeur(d) {
  if (!d) return [];
  const parties = partiesCoteDossier(d, 'vendeur').filter(p => String(p.nom || '').trim());
  if (parties.length) {
    return parties.map(p => {
      if (p.qualitePersonne === 'morale') return { civilite: 'SCI', prenom: '', nom: p.nom || '' };
      return { civilite: civiliteDepuisTexte(p.civilite) || 'M', prenom: String(p.prenom || '').trim(), nom: p.nom || '' };
    });
  }
  const nom = String(d.nom || '').replace(/^\s*(?:VTE|VENTE)\s*-?\s*/i, '');
  return (nom.includes('/') ? nom.split('/')[0] : '').split('&').map(s => s.trim()).filter(Boolean).map(n => ({ civilite: 'M', prenom: '', nom: n }));
}

// Pure : la commission d'agence à la charge du vendeur (montant TTC lu dans l'avant-contrat), sinon null.
function commissionVendeurDecompte(d) {
  const h = d && d.honoraires;
  if (!h || h.direct || h.charge !== 'VENDEUR') return null;
  return { montant: Number(h.montantTTC) > 0 ? Number(h.montantTTC) : null, agence: String(h.nom || '').trim() };
}

// Pure : les lignes de départ du décompte — { prorata, remboursements: [montant|null], mainlevee: bool } → [{ id, cle, libelle, sens, montant,
// source }]. `cle` dit d'où vient la ligne (pour la garder corrigée à la main à la relecture du NAS). Un montant inconnu reste null (« à saisir »).
function lignesDecompteVendeurInitiales(d, lus) {
  const l = lus || {};
  const lignes = [];
  const ajouter = (cle, libelle, sens, montant, source) => lignes.push({ id: 'dv' + (++dvIdLigne), cle, libelle, sens, montant: Number(montant) > 0 ? Math.round(Number(montant) * 100) / 100 : null, source: source || '' });
  ajouter('prix', 'Prix de vente', 'credit', montantDossierAppelFonds(d && d.prixVente), d && d.prixVente ? 'fiche' : '');
  ajouter('prorata', LIBELLE_PRORATA_DECOMPTE_VENDEUR, 'credit', l.prorata, l.prorata ? 'avis de taxe foncière' : '');
  const commission = commissionVendeurDecompte(d);
  if (commission) ajouter('commission', 'Commission due à l\'agence', 'debit', commission.montant, commission.montant ? 'avant-contrat' : '');
  const remb = Array.isArray(l.remboursements) ? l.remboursements : [];
  remb.forEach((m, i) => ajouter('remboursement' + i, 'Remboursement anticipé prêt', 'debit', m, m ? 'décompte de la banque' : ''));
  if (l.mainlevee || remb.length) ajouter('mainlevee', 'Provision sur frais acte de mainlevée', 'debit', PROVISION_MAINLEVEE_VENDEUR, 'provision de l’étude');
  return lignes;
}

// Pure : les lignes lues sur le NAS posées sans perdre une ligne corrigée à la main pendant la lecture (gardée à la place de la ligne de même
// origine, `cle`, chacune une seule fois ; une ligne ajoutée à la main reste à la fin ; une ligne de départ retirée à la main ne revient pas).
function fusionLignesDecompteVendeur(avant, neuves, retirees) {
  const prises = new Set();
  const ecartees = new Set(retirees || []);
  const garde = (n) => { const m = (avant || []).find(x => x.modifiee && !prises.has(x) && x.cle && x.cle === n.cle); if (m) { prises.add(m); return m; } return n; };
  const sortie = (neuves || []).filter(n => !ecartees.has(n.cle)).map(garde);
  return sortie.concat((avant || []).filter(x => x.modifiee && !prises.has(x)));
}

// Pure : « Ensemble » (débit, crédit) et « Solde » (crédit − débit ; négatif = la somme manque au vendeur). Lignes sans montant ignorées.
function totauxDecompteVendeur(lignes) {
  const somme = (sens) => Math.round((lignes || []).filter(x => x && x.sens === sens && Number(x.montant) > 0).reduce((s, x) => s + Number(x.montant), 0) * 100) / 100;
  const debit = somme('debit');
  const credit = somme('credit');
  return { debit, credit, solde: Math.round((credit - debit) * 100) / 100 };
}

// Pure : le décompte comme le modèle de l'étude — { reference, ligneDate, titre, destinataire, rangees: [{ libelle, debit, credit, gras }],
// solde: { libelle, debit, credit }, pied }. Montant vide ou ligne sans libellé = « [à compléter] » ; date au format « 01/10/2026 ».
function documentDecompteVendeur(o) {
  const e = o || {};
  const euros = (n) => (Number(n) > 0 ? formaterMontantEuros(n) : '');
  const t = totauxDecompteVendeur(e.lignes);
  const rangees = (e.lignes || []).map(x => {
    const m = Number(x.montant) > 0 ? euros(x.montant) : '[à compléter]';
    return { libelle: String(x.libelle || '').trim() || '[à compléter]', debit: x.sens === 'debit' ? m : '', credit: x.sens === 'credit' ? m : '', gras: false };
  });
  rangees.push({ libelle: 'Ensemble :', debit: euros(t.debit), credit: euros(t.credit), gras: true });
  const solde = formaterMontantEuros(Math.abs(t.solde));
  const dateSig = /^\d{4}-\d{2}-\d{2}/.test(String(e.date || '')) ? String(e.date).slice(0, 10).split('-').reverse().join('/') : '[à compléter]';
  return {
    reference: `Références dossier : ${String(e.reference || '').trim() || '[à compléter]'}`,
    ligneDate: `${e.datePrevue ? 'Date de signature prévisionnelle' : 'Date de signature'} : ${dateSig}`,
    titre: 'DECOMPTE VENDEUR',
    destinataire: (e.destinataire || []).length ? e.destinataire.slice() : ['[à compléter]'],
    rangees,
    solde: t.solde < 0 ? { libelle: 'Solde à verser par le vendeur :', debit: solde, credit: '' } : { libelle: 'Solde :', debit: '', credit: solde },
    pied: PIED_DECOMPTE_VENDEUR
  };
}

// Pure : « VENTE VENDEUR / ACQUÉREUR », comme la référence du modèle de l'étude.
function referenceDecompteVendeur(d) {
  return d ? libelleDossierAffiche(d).replace(/^VTE - /, 'VENTE ') : '';
}

// Pure : le premier jet de l'email au vendeur (CLAIRE) — formule selon les civilités, date de signature, phrase du R.I.B. de l'étude.
function corpsEmailDecompteVendeur(vendeurs, situation, date, datePrevue) {
  const quand = /^\d{4}-\d{2}-\d{2}/.test(String(date || '')) ? ` ${datePrevue ? 'prévue' : 'fixée'} le ${formatDateFr(String(date).slice(0, 10))}` : '';
  return [salutationAppelFonds(vendeurs, situation), '',
    `Veuillez trouver ci-joint le décompte des sommes qui vous reviendront lors de la signature de l’acte de vente${quand}.`, '',
    PIED_DECOMPTE_VENDEUR + '.', '', 'Bien cordialement,'].join('\n');
}

// Pure : l'aperçu HTML du décompte (page blanche du modèle, tout texte échappé).
function htmlDecompteVendeur(doc) {
  const cel = (t, cls) => `<td class="${cls || ''}">${escapeHtml(t || '')}</td>`;
  return `<div class="dv-page" aria-label="Aperçu du décompte vendeur">
    <div>${escapeHtml(doc.reference)}</div><div>${escapeHtml(doc.ligneDate)}</div>
    <div class="dv-page-titre">${escapeHtml(doc.titre)}</div>
    ${doc.destinataire.map(l => `<div class="dv-page-dest">${escapeHtml(l)}</div>`).join('')}
    <table class="dv-page-tableau"><colgroup><col class="dv-c1"><col class="dv-c2"><col class="dv-c2"></colgroup>
      <tr><td></td><td class="dv-gras dv-centre">DEBIT</td><td class="dv-gras dv-centre">CREDIT</td></tr>
      ${doc.rangees.map(r => `<tr${r.gras ? ' class="dv-gras"' : ''}>${cel(r.libelle)}${cel(r.debit, 'dv-droite')}${cel(r.credit, 'dv-droite')}</tr>`).join('')}
    </table>
    <table class="dv-page-tableau dv-page-solde"><colgroup><col class="dv-c1"><col class="dv-c2"><col class="dv-c2"></colgroup>
      <tr class="dv-gras">${cel(doc.solde.libelle)}${cel(doc.solde.debit, 'dv-droite')}${cel(doc.solde.credit, 'dv-droite')}</tr></table>
    <div class="dv-gras dv-page-pied">${escapeHtml(doc.pied)}</div></div>`;
}

// Le PDF aux positions du modèle de l'étude (A4, relevées sur le PDF reçu le 30/10) : texte à 70,8 pt, tableau de 65,5 à 529,9 pt (colonnes
// à 311,3 et 420,6), rangées de 12,65 pt, montants alignés à droite ; Helvetica (la Verdana du modèle n'est pas une police standard du PDF).
async function pdfDecompteVendeur(doc) {
  if (!window.PDFLib) await afChargerScript(URL_PDF_LIB_PDFA, SRI_PDF_LIB_PDFA);
  const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
  const pdf = await PDFDocument.create();
  const normale = await pdf.embedFont(StandardFonts.Helvetica);
  const grasse = await pdf.embedFont(StandardFonts.HelveticaBold);
  const jeu = new Set(normale.getCharacterSet());
  const propre = t => Array.from(String(t || '').replace(/[  ]/g, ' ').replace(/‑/g, '-')).map(c => {
    if (jeu.has(c.codePointAt(0))) return c;
    const nu = c.normalize('NFD').replace(/[̀-ͯ]/g, '');
    return nu && jeu.has(nu.codePointAt(0)) ? nu : '?';
  }).join('');
  const page = pdf.addPage([595.3, 841.9]);
  const H = 841.9;
  const noir = rgb(0, 0, 0);
  const ecrire = (texte, x, haut, police, taille, aligne, largeur) => {
    const t = propre(texte);
    const l = police.widthOfTextAtSize(t, taille);
    const xx = aligne === 'droite' ? x - l : aligne === 'centre' ? x + (largeur - l) / 2 : x;
    page.drawText(t, { x: xx, y: H - haut - taille * 0.8, size: taille, font: police, color: noir });
  };
  const trait = (x1, y1, x2, y2) => page.drawLine({ start: { x: x1, y: H - y1 }, end: { x: x2, y: H - y2 }, thickness: 0.5, color: noir });
  ecrire(doc.reference, 70.8, 73, normale, 10);
  ecrire(doc.ligneDate, 70.8, 85.2, normale, 10);
  ecrire(doc.titre, 0, 122.5, grasse, 14, 'centre', 595.3);
  let y = 139.1;
  doc.destinataire.forEach(l => { ecrire(l, 0, y, grasse, 12, 'centre', 595.3); y += 14.5; });
  const X = [65.5, 311.3, 420.6, 529.9];
  const PAS = 12.65;
  const tableau = (rangees, haut) => {
    rangees.forEach((r, i) => {
      const yr = haut + i * PAS;
      const police = r.gras ? grasse : normale;
      ecrire(r.libelle, 70.8, yr + 2.4, police, 10);
      ecrire(r.debit, 415.2, yr + 2.4, police, 10, 'droite');
      ecrire(r.credit, 524.5, yr + 2.4, police, 10, 'droite');
      trait(X[0], yr, X[3], yr);
    });
    const bas = haut + rangees.length * PAS;
    trait(X[0], bas, X[3], bas);
    X.forEach(x => trait(x, haut, x, bas));
    return bas;
  };
  const debut = Math.max(178, y + 25);
  const fin = tableau([{ libelle: '', debit: '', credit: '', gras: true }].concat(doc.rangees), debut);
  // En-tête DEBIT / CREDIT centrés dans leur colonne (par-dessus la première rangée).
  ecrire('DEBIT', X[1], debut + 2.4, grasse, 10, 'centre', X[2] - X[1]);
  ecrire('CREDIT', X[2], debut + 2.4, grasse, 10, 'centre', X[3] - X[2]);
  const finSolde = tableau([Object.assign({ gras: true }, doc.solde)], fin + 10.5);
  // La phrase du R.I.B., en gras, coupée à la largeur du tableau.
  const mots = propre(doc.pied).split(/\s+/);
  let ligne = '';
  let yp = finSolde + 27;
  mots.forEach(m => {
    const essai = ligne ? ligne + ' ' + m : m;
    if (ligne && grasse.widthOfTextAtSize(essai, 10) > X[3] - 70.8) { ecrire(ligne, 70.8, yp, grasse, 10); yp += 12.2; ligne = m; } else ligne = essai;
  });
  if (ligne) ecrire(ligne, 70.8, yp, grasse, 10);
  pdf.setTitle('Décompte vendeur');
  pdf.setCreator('CLAIRE');
  return new Blob([await pdf.save()], { type: 'application/pdf' });
}

// Le Word du même décompte (bibliothèque docx, comme les rendus de l'agent) : Verdana 10, titre 14, vendeur 12, tableau à trois colonnes.
async function docxDecompteVendeur(doc) {
  if (!window.docx) await afChargerScript('https://cdn.jsdelivr.net/npm/docx@9.7.1/dist/index.iife.min.js', 'sha384-7jc2SRdX+/eR9d3sDweapT3TGmIIUe3h4tlWVV1urVpUBlnPN5OsU6dM+zh9XwBz');
  const D = window.docx;
  const POLICE = 'Verdana';
  const run = (t, o) => new D.TextRun(Object.assign({ text: String(t || ''), font: POLICE, size: 20 }, o || {}));
  const P = (enfants, o) => new D.Paragraph(Object.assign({ spacing: { after: 0 }, children: enfants }, o || {}));
  const bord = { style: 'single', size: 4, color: '000000' };
  const largeurs = [4915, 2186, 2186];
  const cellule = (t, k, gras, centre) => new D.TableCell({ width: { size: largeurs[k], type: D.WidthType.DXA }, margins: { left: 100, right: 100 },
    children: [P([run(t, { bold: gras })], { alignment: centre ? D.AlignmentType.CENTER : k ? D.AlignmentType.RIGHT : D.AlignmentType.LEFT })] });
  const table = (rangees) => new D.Table({ width: { size: 9287, type: D.WidthType.DXA }, columnWidths: largeurs,
    borders: { top: bord, bottom: bord, left: bord, right: bord, insideHorizontal: bord, insideVertical: bord },
    rows: rangees.map(r => new D.TableRow({ children: [cellule(r.libelle, 0, r.gras), cellule(r.debit, 1, r.gras, r.centre), cellule(r.credit, 2, r.gras, r.centre)] })) });
  const enfants = [P([run(doc.reference)]), P([run(doc.ligneDate)]), P([]), P([]),
    P([run(doc.titre, { bold: true, size: 28 })], { alignment: D.AlignmentType.CENTER }), P([])]
    .concat(doc.destinataire.map(l => P([run(l, { bold: true, size: 24 })], { alignment: D.AlignmentType.CENTER })))
    .concat([P([]), P([]), table([{ libelle: '', debit: 'DEBIT', credit: 'CREDIT', gras: true, centre: true }].concat(doc.rangees)), P([]),
      table([Object.assign({ gras: true }, doc.solde)]), P([]), P([]), P([run(doc.pied, { bold: true })])]);
  const docu = new D.Document({ creator: 'CLAIRE', title: 'Décompte vendeur', sections: [{ properties: { page: { margin: { left: 1416, right: 1134 } } }, children: enfants }] });
  return D.Packer.toBlob(docu);
}

function dvDossier() { return dossiers.find(x => x && x.id === dvEtat.dossierId) || null; }

function dvDossiersVente() {
  return dossiers.filter(decompteVendeurPossible).sort((a, b) => libelleDossierAffiche(a).localeCompare(libelleDossierAffiche(b), 'fr'));
}

// Ouvre l'outil sur un dossier : lignes de la fiche aussitôt, puis l'avis de taxe foncière et le décompte de la banque lus sur le NAS.
async function dvChoisirDossier(id) {
  const d = dossiers.find(x => x && x.id === id);
  dvEtat = { dossierId: '', lignes: [], date: '', datePrevue: false, destinataire: [], lectures: {}, tfAnnuel: null, retirees: [], jeton: dvEtat.jeton + 1, envoi: false, range: false };
  if (!d || !decompteVendeurPossible(d)) {
    if (d) afficherToast('Un confrère représente le vendeur : le décompte vendeur lui revient.', 'OK', null);
    renderDecompteVendeur();
    return;
  }
  dvEtat.dossierId = d.id;
  const auj = isoAujourdhuiLocal();
  const prevue = d.rendezVousSignature ? null : signaturePrevueDossier(d, auj);
  dvEtat.date = String(d.rendezVousSignature || (prevue && prevue.date) || '').slice(0, 10);
  dvEtat.datePrevue = !d.rendezVousSignature;
  dvEtat.destinataire = lignesDestinatairesAppelFonds(vendeursDecompteVendeur(d), situationClientDossier(d, 'vendeur'));
  const mainlevee = typeof inscriptionsEnCoursDuBien === 'function' && inscriptionsEnCoursDuBien(d).length > 0;
  dvEtat.lignes = lignesDecompteVendeurInitiales(d, { mainlevee });
  dvEtat.lectures = { nas: d.nasDossier ? 'lecture' : 'non relié' };
  renderDecompteVendeur();
  if (d.nasDossier) await dvLireNas(d, dvEtat.jeton, mainlevee);
}

// « Relire » : la fiche et le NAS repris ; les corrections à la main perdues, donc confirmé d'abord s'il y en a (audit 0.406.0, M1).
function dvRelire() {
  const id = dvEtat.dossierId;
  if (!id) return;
  if (dvEtat.lignes.some(x => x.modifiee)) demanderConfirmation('Reprendre le décompte depuis la fiche et le NAS ? Les lignes corrigées à la main seront perdues.', () => dvChoisirDossier(id));
  else dvChoisirDossier(id);
}

async function dvLireNas(d, jeton, mainlevee) {
  const encore = () => jeton === dvEtat.jeton && dvEtat.dossierId === d.id;
  const lus = { remboursements: [], mainlevee };
  const notes = [];
  try {
    const fichiers = await listerFichiersNas(d);
    if (!encore()) return;
    if (typeof pdfjsLib !== 'undefined') {
      const tf = fichierPieceNasAppelFonds(d, fichiers, 'avisTaxeFonciere', motifPieceChecklist(d, 'avisTaxeFonciere'));
      if (tf) {
        try {
          const avis = await lireAvisTaxeFonciere(await fichierNasPourLecture(tf.chemin, tf.nom));
          if (!encore()) return;
          // Plusieurs biens sur l'avis : le montant n'est pas tranché ici (bien vendu à choisir dans l'outil Prorata).
          if (avis && avis.montant && !(avis.biens && avis.biens.length > 1)) {
            dvEtat.tfAnnuel = avis.montant;
            const ligne = dvEtat.date ? ligneProrataTaxeFonciere(avis.montant, dvEtat.date) : null;
            if (ligne) lus.prorata = ligne.montant;
            notes.push(ligne ? `taxe foncière : « ${tf.nom} »` : `taxe foncière : « ${tf.nom} » lue, prorata calculé dès la date de signature saisie`);
          } else notes.push(`taxe foncière : « ${tf.nom} » à vérifier (montant ou bien non lu)`);
        } catch (e) { notes.push('taxe foncière illisible'); }
      } else notes.push('aucun avis de taxe foncière');
      const decomptes = fichiers.filter(f => f && f.chemin && nomDitDecompteRemboursement(f.nom || f.chemin))
        .sort((a, b) => String(b.modifie || '').localeCompare(String(a.modifie || ''))).slice(0, 3);
      for (const f of decomptes) {
        if (!encore()) return;
        try {
          const fichier = await fichierNasPourLecture(cheminNasComplet(d, f.chemin), f.nom);
          const pdf = await pdfjsLib.getDocument({ isEvalSupported: false, data: await fichier.arrayBuffer() }).promise;
          const m = montantRemboursementDansTexte(await lireTextePdfEnLignes(pdf));
          lus.remboursements.push(m);
          notes.push(m ? `remboursement : « ${f.nom} »` : `remboursement : « ${f.nom} » — total non lu, à saisir`);
        } catch (e) { lus.remboursements.push(null); notes.push(`« ${f.nom} » illisible`); }
      }
      if (!decomptes.length) notes.push('aucun décompte de remboursement de la banque');
    }
  } catch (e) { notes.push('NAS injoignable'); }
  if (!encore()) return;
  dvEtat.lignes = fusionLignesDecompteVendeur(dvEtat.lignes, lignesDecompteVendeurInitiales(d, lus), dvEtat.retirees);
  dvEtat.lectures = { nas: 'lu', notes };
  // Coché seulement quand un décompte de la banque a été trouvé ET son total lu (audit 0.406.0, B1).
  if (lus.remboursements.length) noterVerificationPoste('decompte-vendeur-nas', { ok: lus.remboursements.every(Boolean), detail: `${lus.remboursements.length} décompte(s) de la banque, prorata ${lus.prorata ? 'lu' : 'non lu'}` });
  renderDecompteVendeur();
}

function dvLigne(id) { return dvEtat.lignes.find(x => x.id === id); }

function dvChanger(id, champ, valeur) {
  const l = dvLigne(id);
  if (!l) return;
  if (champ === 'libelle') l.libelle = String(valeur || '').slice(0, 120);
  if (champ === 'sens') l.sens = valeur === 'credit' ? 'credit' : 'debit';
  if (champ === 'montant') { const n = montantSaisiAppelFonds(valeur); l.montant = Number(n) > 0 ? Math.round(n * 100) / 100 : null; }
  l.modifiee = true;
  if (champ !== 'libelle') { renderDecompteVendeur(); return; }
  // Une frappe dans un libellé : l'aperçu suit après une courte pause, pas à chaque touche (audit 0.406.0, B2).
  clearTimeout(dvMinuterieApercu);
  dvMinuterieApercu = setTimeout(dvMajApercu, 150);
}

function dvAjouterLigne() {
  dvEtat.lignes.push({ id: 'dv' + (++dvIdLigne), cle: '', libelle: '', sens: 'debit', montant: null, source: '', modifiee: true });
  renderDecompteVendeur();
}

function dvRetirerLigne(id) {
  const l = dvLigne(id);
  if (l && l.cle) dvEtat.retirees = (dvEtat.retirees || []).concat(l.cle);
  dvEtat.lignes = dvEtat.lignes.filter(x => x.id !== id);
  renderDecompteVendeur();
}

// La date de signature change : le prorata de taxe foncière suit (avis lu), sauf s'il a été corrigé à la main (audit 0.406.0, M2).
function dvChangerEntete(champ, valeur) {
  if (champ === 'date') {
    dvEtat.date = /^\d{4}-\d{2}-\d{2}$/.test(String(valeur || '')) ? valeur : '';
    const l = dvEtat.lignes.find(x => x.cle === 'prorata' && !x.modifiee);
    if (l && dvEtat.tfAnnuel) {
      const p = dvEtat.date ? ligneProrataTaxeFonciere(dvEtat.tfAnnuel, dvEtat.date) : null;
      l.montant = p && p.montant > 0 ? Math.round(p.montant * 100) / 100 : null;
      l.source = l.montant ? 'avis de taxe foncière' : '';
    }
    renderDecompteVendeur();
    return;
  }
  if (champ === 'prevue') { dvEtat.datePrevue = !!valeur; dvMajApercu(); return; }
  if (champ === 'destinataire') { dvEtat.destinataire = String(valeur || '').split('\n').map(x => x.trim()).filter(Boolean).slice(0, 6); clearTimeout(dvMinuterieApercu); dvMinuterieApercu = setTimeout(dvMajApercu, 150); }
}

function dvDocument() {
  const d = dvDossier();
  return documentDecompteVendeur({ lignes: dvEtat.lignes, destinataire: dvEtat.destinataire, reference: referenceDecompteVendeur(d), date: dvEtat.date, datePrevue: dvEtat.datePrevue });
}

function dvNomFichier() {
  const d = dvDossier();
  return ('Décompte vendeur - ' + (d ? libelleDossierAffiche(d) : '')).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
}

function initDecompteVendeur() {
  if (dvEtat.dossierId && !decompteVendeurPossible(dvDossier())) dvEtat.dossierId = '';
  renderDecompteVendeur();
}

// Depuis la fiche d'une vente.
function ouvrirDecompteVendeurDepuisFiche(id) {
  fermerDossierDrawer();
  definirOnglet('decompte-vendeur');
  dvChoisirDossier(id);
}

function dvCartesAccueil(q) {
  const actifs = dvDossiersVente();
  const liste = q ? actifs.filter(x => normaliserPourRecherche(libelleDossierAffiche(x)).includes(q) || normaliserPourRecherche(x.responsable || '').includes(q)).slice(0, 12)
    : (() => { const recents = dossiersConsultesRecents(lireDossiersConsultes(), actifs).map(x => x.dossier); return recents.concat(actifs.filter(x => !recents.includes(x))).slice(0, 6); })();
  const cartes = liste.map(x => `<button type="button" class="cst-accueil-carte" onclick="dvChoisirDossier('${escapeOnclickArg(x.id)}')">
      <span class="cst-accueil-carte-icone" aria-hidden="true">${icone('home')}</span>
      <span class="cst-accueil-carte-texte"><span class="cst-accueil-carte-titre">${escapeHtml(libelleDossierAffiche(x))}</span>
      <span class="cst-accueil-carte-sous">${escapeHtml(['Vente', x.referenceAuthentic, x.responsable].filter(Boolean).join(' · '))}</span></span></button>`).join('');
  return cartes ? `<div class="cst-accueil-liste-titre"><span class="pieces-titre">${icone(q ? 'search' : 'clock')}<span class="pieces-titre-texte">${q ? 'Résultats' : 'Derniers dossiers'}</span></span></div><div class="cst-accueil-grille">${cartes}</div>` : '<div class="dash-recherche-vide">Aucune vente ne correspond.</div>';
}

function dvRechercher(valeur) {
  const zone = document.getElementById('dv-cartes');
  if (zone) zone.innerHTML = dvCartesAccueil(normaliserPourRecherche(String(valeur || '').trim()));
}

function dvMajApercu() {
  const zone = document.getElementById('dv-apercu');
  if (!zone || !dvDossier()) return;
  zone.innerHTML = htmlDecompteVendeur(dvDocument());
}

// Un redessin ne fait pas perdre le champ en cours (montant tapé, sens changé au clavier).
function renderDecompteVendeur() {
  const actif = document.activeElement && document.activeElement.id;
  dvRendreCorps();
  if (actif) { const e = document.getElementById(actif); if (e && e.focus && e !== document.activeElement) e.focus(); }
}

function dvRendreCorps() {
  const carte = document.getElementById('dv-carte');
  if (!carte) return;
  const d = dvDossier();
  const entete = `<div class="dash-header"><div><div class="dash-eyebrow">Vente</div><div class="dash-titre-ligne"><h1 class="dash-titre">Décompte vendeur</h1>${infoBulle('Sur le modèle de l’étude : prix et prorata de taxes foncières au crédit ; commission d’agence (à la charge du vendeur), remboursement anticipé du prêt lu dans le décompte de la banque trouvé sur le NAS et provision de mainlevée (450 €) au débit. Toutes les lignes se corrigent ; un montant non lu reste à saisir. Pas de décompte quand un confrère représente le vendeur.')}</div></div></div>`;
  if (!d) {
    carte.innerHTML = `<div class="cst-accueil">
      <span class="cst-accueil-icone" aria-hidden="true">${icone('banknote')}</span>
      <h2 class="cst-accueil-titre">Pour quelle vente ?</h2>
      <p class="cst-accueil-sous">Décompte préparé d’après la fiche et le dossier du NAS.</p>
      <div class="pr-dossier-recherche-bloc cst-recherche cst-accueil-recherche"><input type="search" id="dv-recherche" class="nas-choix-recherche" autocomplete="off" placeholder="Rechercher une vente…" aria-label="Rechercher une vente" oninput="dvRechercher(this.value)"></div>
      <div id="dv-cartes" class="aut-cartes">${dvCartesAccueil('')}</div>
    </div>`;
    return;
  }
  const t = totauxDecompteVendeur(dvEtat.lignes);
  const lignes = dvEtat.lignes.map(x => {
    const ida = escapeAttr(x.id);
    return `<div class="dv-ligne">
      <input type="text" id="dv-l-${ida}" class="dv-libelle" value="${escapeAttr(x.libelle)}" placeholder="Libellé" aria-label="Libellé" oninput="dvChanger('${escapeOnclickArg(x.id)}', 'libelle', this.value)">
      <select id="dv-s-${ida}" class="dv-sens" aria-label="Débit ou crédit" onchange="dvChanger('${escapeOnclickArg(x.id)}', 'sens', this.value)"><option value="debit"${x.sens === 'debit' ? ' selected' : ''}>Débit</option><option value="credit"${x.sens === 'credit' ? ' selected' : ''}>Crédit</option></select>
      <input type="text" inputmode="decimal" id="dv-m-${ida}" class="dv-montant${x.montant ? '' : ' dv-a-saisir'}" value="${x.montant ? escapeAttr(formaterMontantEuros(x.montant).replace(/\s*€$/, '')) : ''}" placeholder="À saisir" aria-label="Montant" onchange="dvChanger('${escapeOnclickArg(x.id)}', 'montant', this.value)">
      <wa-button appearance="plain" size="s" class="bouton-icone" type="button" title="Retirer la ligne" aria-label="Retirer la ligne" onclick="dvRetirerLigne('${escapeOnclickArg(x.id)}')">${icone('x')}</wa-button>
      ${x.source ? `<span class="dv-source">${escapeHtml(x.source)}</span>` : ''}</div>`;
  }).join('');
  const notes = dvEtat.lectures.nas === 'lecture' ? 'Lecture du dossier du NAS…'
    : dvEtat.lectures.nas === 'non relié' ? 'Dossier non relié au NAS : taxe foncière et remboursement à saisir.'
    : (dvEtat.lectures.notes || []).join(' · ');
  const manque = dvEtat.lignes.some(x => !(Number(x.montant) > 0) || !String(x.libelle || '').trim()) || !dvEtat.date;
  carte.innerHTML = `${entete}
    <div class="cst-corps">
      <div class="cst-barre">
        <span class="cst-dossier-titre">${escapeHtml(libelleDossierAffiche(d))}</span>
        <wa-button appearance="outlined" size="s" type="button" onclick="dvChoisirDossier('')" title="Revenir au choix du dossier">${icone('rotate-ccw')} Changer de dossier</wa-button>
        <wa-button appearance="outlined" size="s" type="button" onclick="dvRelire()" title="Reprendre la fiche et relire le NAS">${icone('rotate-ccw')} Relire</wa-button>
        <span class="aut-barre-actions">
          <wa-button appearance="outlined" size="s" type="button" onclick="telechargerDecompteVendeur('word')">${icone('download')}Word</wa-button>
          <wa-button appearance="outlined" size="s" type="button"${d.nasDossier ? '' : ' disabled title="Dossier non relié au NAS"'}${dvEtat.range ? ' loading' : ''} onclick="rangerDecompteVendeur()">${icone('folder')}Ranger dans le dossier</wa-button>
          <wa-button appearance="outlined" size="s" type="button" onclick="envoyerDecompteVendeur()"${dvEtat.envoi ? ' loading' : ''}>${icone('mail')}Envoyer au vendeur</wa-button>
          <wa-button variant="brand" size="s" type="button" onclick="telechargerDecompteVendeur('pdf')">${icone('download')}PDF</wa-button>
        </span>
      </div>
      ${notes ? `<p class="hint">${escapeHtml(notes)}</p>` : ''}
      <div class="cst-mise-en-page">
        <div class="cst-gauche">
          <div class="cst-bloc-titre">Lignes</div>
          <div class="dv-lignes">${lignes}</div>
          <wa-button appearance="outlined" class="bouton-ajout" type="button" onclick="dvAjouterLigne()"><span slot="start" class="bouton-ajout-plus">+</span>Ajouter une ligne</wa-button>
          <div class="dv-totaux"><span>Débit <b>${escapeHtml(formaterMontantEuros(t.debit))}</b></span><span>Crédit <b>${escapeHtml(formaterMontantEuros(t.credit))}</b></span>
            <span class="${t.solde < 0 ? 'dv-solde-negatif' : ''}">${t.solde < 0 ? 'Solde à verser par le vendeur' : 'Solde'} <b>${escapeHtml(formaterMontantEuros(Math.abs(t.solde)))}</b></span></div>
          <div class="cst-bloc-titre">Signature et vendeur</div>
          <div class="reglages-champ"><label for="dv-date">Date de signature</label>
            <input type="date" id="dv-date" value="${escapeAttr(dvEtat.date)}" onchange="dvChangerEntete('date', this.value)"></div>
          <label class="reglages-option"><wa-switch id="dv-prevue"${dvEtat.datePrevue ? ' checked' : ''} onchange="dvChangerEntete('prevue', this.checked)"></wa-switch><span>Date prévisionnelle</span></label>
          <div class="reglages-champ"><label for="dv-dest">Vendeur (en tête du décompte)</label>
            <textarea id="dv-dest" rows="3" oninput="dvChangerEntete('destinataire', this.value)">${escapeHtml(dvEtat.destinataire.join('\n'))}</textarea></div>
          ${manque ? '<p class="hint">Ce qui manque est écrit « [à compléter] » sur le décompte.</p>' : ''}
        </div>
        <div class="cst-droite"><div class="cst-bloc-titre">Aperçu</div><div id="dv-apercu" class="dv-apercu"></div></div>
      </div>
    </div>`;
  dvMajApercu();
}

// Le dossier, le document et le solde sont FIGÉS au clic : un changement de dossier pendant le chargement des bibliothèques ne mélange jamais
// deux dossiers (relecture 0.406.0).
function dvFiger() {
  const d = dvDossier();
  return d ? { d, doc: dvDocument(), nom: dvNomFichier(), solde: totauxDecompteVendeur(dvEtat.lignes).solde, date: dvEtat.date, datePrevue: dvEtat.datePrevue } : null;
}

async function dvBlob(format, f) {
  if (!f) throw new Error('aucun dossier');
  if (format === 'word') return { blob: await docxDecompteVendeur(f.doc), nom: f.nom + '.docx' };
  return { blob: await pdfDecompteVendeur(f.doc), nom: f.nom + '.pdf' };
}

function dvNoterHistorique(f, quoi) {
  ajouterHistorique(f.d, `Décompte vendeur ${quoi} — solde ${formaterMontantEuros(f.solde)}`);
  sauvegarder(f.d);
}

async function telechargerDecompteVendeur(format) {
  const f = dvFiger();
  try {
    const { blob, nom } = await dvBlob(format === 'word' ? 'word' : 'pdf', f);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nom;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    dvNoterHistorique(f, `téléchargé (${format === 'word' ? 'Word' : 'PDF'})`);
  } catch (err) { afficherToast('Décompte impossible à produire : ' + (err && err.message ? err.message : 'erreur'), 'OK', null); }
}

// Le PDF rangé à la racine du dossier client du NAS, sur un clic (même voie que les courriers : dossier relu par le serveur, copie sans
// jamais écraser).
async function rangerDecompteVendeur() {
  const f = dvFiger();
  if (!f || !f.d.nasDossier || dvEtat.range) return { ok: false };
  dvEtat.range = true;
  renderDecompteVendeur();
  try {
    const { blob } = await dvBlob('pdf', f);
    const r = await fetchAvecAuth('/api/nas/deposer-document', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dossierId: f.d.id, nom: f.nom, contenu: await base64DepuisBlob(blob), format: 'pdf' }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erreur || `le serveur a répondu ${r.status}`);
    const nom = String(j.chemin || '').split(/[\\/]/).pop() || f.nom + '.pdf';
    dvNoterHistorique(f, `rangé dans le dossier du NAS (${nom})`);
    afficherToast(`Rangé dans le dossier de la vente : ${nom}`, 'OK', null);
    noterVerificationPoste('decompte-vendeur-email', { detail: 'rangé sur le NAS' });
    return { ok: true, nom };
  } catch (err) {
    afficherToast('Décompte non rangé : ' + (err && err.message ? err.message : 'erreur'), 'OK', null);
    return { ok: false };
  } finally { dvEtat.range = false; renderDecompteVendeur(); }
}

// L'email au vendeur, décompte en PDF joint : la fenêtre d'email s'ouvre, rien ne part sans « Envoyer ».
async function envoyerDecompteVendeur() {
  const f = dvFiger();
  if (!f || dvEtat.envoi) return { ok: false };
  const d = f.d;
  dvEtat.envoi = true;
  renderDecompteVendeur();
  try {
    const { blob, nom } = await dvBlob('pdf', f);
    const r = await livrerEmailDossier({
      destinataire: String(d.emailVendeur || '').trim(), sujet: `Décompte vendeur — ${referenceDecompteVendeur(d)}`,
      corps: corpsEmailDecompteVendeur(vendeursDecompteVendeur(d), situationClientDossier(d, 'vendeur'), f.date, f.datePrevue),
      pieces: [{ nom, type: 'application/pdf', contenuBase64: await base64DepuisBlob(blob) }],
      responsableSignature: d.responsable, dossierId: d.id, geste: 'decompteVendeur'
    });
    if (r && r.ok) {
      dvNoterHistorique(f, r.mode === 'envoye' ? 'envoyé par email' : 'préparé par email');
      noterVerificationPoste('decompte-vendeur-email', { detail: r.mode === 'envoye' ? 'envoyé depuis CLAIRE' : 'préparé' });
    }
    return r || { ok: false };
  } catch (err) {
    afficherToast('Email impossible à préparer : ' + (err && err.message ? err.message : 'erreur'), 'OK', null);
    return { ok: false };
  } finally { dvEtat.envoi = false; renderDecompteVendeur(); }
}

// « Demander à CLAIRE » (outil `decompte_vendeur`) : ouvre l'outil sur le dossier, attend la lecture du NAS et rend les lignes et le solde
// (montants et libellés, jamais un nom ; masqués par le serveur comme tout résultat d'outil). Un décompte déjà corrigé à la main n'est
// remplacé qu'après une carte « Autoriser » (audit 0.406.0, M1). email = true : la fenêtre d'email au vendeur, après la carte « Autoriser » ;
// rien ne part sans « Envoyer ». ranger = true : le PDF dans le dossier du NAS, après la carte.
async function decompteVendeurAgent(e) {
  const d = dossiers.find(x => x && x.id === String((e && e.dossier_id) || ''));
  if (!d) return { erreur: 'aucun dossier avec cet id' };
  if (estSuccession(d)) return { erreur: 'une succession n’a pas de décompte vendeur' };
  if (confrereRepresenteVendeur(d)) return { erreur: 'un confrère représente le vendeur : le décompte vendeur lui revient (outil masqué par choix de l’étude)' };
  if (d.archive) return { erreur: 'dossier archivé' };
  const remplacer = dvEtat.dossierId !== d.id || e.relire;
  if (remplacer && dvEtat.lignes.some(x => x.modifiee)) {
    const ok = await demanderAutorisationAgent('Remplacer le décompte vendeur ouvert (des lignes y ont été corrigées à la main) par celui de ce dossier, repris de la fiche et du NAS ?');
    if (!ok) return { erreur: 'refusé par l’utilisateur : le décompte ouvert est gardé' };
  }
  definirOnglet('decompte-vendeur');
  if (remplacer) await dvChoisirDossier(d.id);
  // Changé de dossier entre-temps (un clic pendant la lecture du NAS) : rien n'est rendu ni préparé sous ce dossier.
  const memeDossier = () => dvEtat.dossierId === d.id;
  if (!memeDossier()) return { erreur: 'un autre dossier a été ouvert dans l’outil pendant la préparation : redemande' };
  const t = totauxDecompteVendeur(dvEtat.lignes);
  const sortie = {
    dossier_id: d.id, date_signature: dvEtat.date, date_previsionnelle: dvEtat.datePrevue,
    lignes: dvEtat.lignes.map(x => ({ libelle: x.libelle, sens: x.sens, montant: x.montant, source: x.source || (x.modifiee ? 'saisi à la main' : 'à saisir') })),
    debit: t.debit, credit: t.credit, solde: t.solde, a_completer: dvEtat.lignes.filter(x => !(Number(x.montant) > 0)).map(x => x.libelle || 'ligne sans libellé'),
    lecture_nas: (dvEtat.lectures.notes || []).map(n => n.replace(/« [^»]*»/g, '(fichier)')),
    email_vendeur_connu: !!String(d.emailVendeur || '').trim(), dossier_nas_relie: !!d.nasDossier, lecture_nas_en_cours: dvEtat.lectures.nas === 'lecture',
    consigne: 'Outil « Décompte vendeur » ouvert sur le poste : l’utilisateur corrige les lignes à l’écran (PDF, Word, ranger dans le dossier, email au vendeur).'
  };
  if (e.ranger) {
    const ok = await demanderAutorisationAgent(`Ranger le décompte vendeur (${referenceDecompteVendeur(d)}) en PDF dans le dossier du NAS ?`);
    if (ok && !memeDossier()) return Object.assign(sortie, { rangement: 'un autre dossier a été ouvert entre-temps : rien rangé' });
    sortie.rangement = !ok ? 'refusé par l’utilisateur' : ((await rangerDecompteVendeur()).ok ? 'rangé' : 'non rangé');
  }
  if (e.email) {
    const ok = await demanderAutorisationAgent(`Préparer l’email du décompte vendeur (${referenceDecompteVendeur(d)}), PDF joint — la fenêtre d’email s’ouvre, rien ne part sans « Envoyer ».`);
    if (!ok) return Object.assign(sortie, { email: 'refusé par l’utilisateur' });
    if (!memeDossier()) return Object.assign(sortie, { email: 'un autre dossier a été ouvert entre-temps : rien préparé' });
    const r = await envoyerDecompteVendeur();
    sortie.email = r && r.ok ? (r.mode === 'envoye' ? 'envoyé' : 'fenêtre ouverte') : (r && r.annule ? 'fenêtre fermée sans envoi' : 'non préparé');
  }
  return sortie;
}
