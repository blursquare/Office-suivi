// Autorisations de déblocage ou de transfert de fonds d'une succession (étude 23/10 : trois modèles de l'office, « à télécharger d'un clic en PDF »,
// à insérer dans les fiches de succession et dans un outil de la catégorie « Succession »). Les textes sont ceux des modèles
// (commun/autorisations-succession.js) ; l'identité du signataire et celle du défunt viennent de la fiche du dossier (fiches client d'Authentic),
// tout ce qui manque reste « à compléter » et se corrige sur l'aperçu avant le PDF. PDF composé dans le navigateur par pdf-lib (polices Times
// standard, une page A4) ; rien n'est gardé sur le serveur.

var autEtat = { dossierId: '', modeles: {}, edites: {}, ouvert: '' };

function autDossiersSuccession() {
  return (Array.isArray(dossiers) ? dossiers : []).filter(d => d && estSuccession(d) && !d.archive);
}

function autDossierChoisi() {
  const liste = autDossiersSuccession();
  return liste.find(d => d.id === autEtat.dossierId) || null;
}

// Pure : la personne d'une fiche client d'Authentic, au format des modèles.
function autPersonneDepuisFiche(d, nom, civilite) {
  const f = ficheClientDe(d, nom) || {};
  const sm = f.situationMatrimoniale || {};
  const civ = civiliteLibelleConstitution(f.civilite || civilite) || '';
  const conj = conjointDefunt(sm, civ || 'Madame');
  const m = (f.complement && f.complement.mariage) || {};
  const np = nomPrenomsComparant(nom);
  const lieu = (t) => String(t || '').replace(/^\s*(\d{5})\s+(.+?)\s*$/, '$2 ($1)');
  const dateMariage = m.date || sm.dateMariage || sm.date || '';
  const mariage = /mari/i.test(sm.situation || '') && dateMariage && conj.nom
    ? `${[civ, f.prenom, f.nomFamille].filter(Boolean).join(' ')} et ${conj.nom} mariés${m.lieu ? ` à la Mairie de ${lieu(m.lieu)}${m.pays && !/^france$/i.test(m.pays) ? ` (${m.pays})` : ''}` : ''}, le ${formatDateFr(dateMariage)}${m.regime || sm.regime ? `, sous le régime ${m.regime || sm.regime}` : ''}.`
    : '';
  return {
    civilite: civ, prenoms: [f.prenom, f.autresPrenoms].filter(Boolean).join(' ') || np.prenoms, nom: f.nomFamille || np.nom,
    profession: f.profession || '', domicile: f.domicile ? normaliserAdresse(f.domicile) : '',
    naissanceLieu: lieu(f.lieuNaissance), naissanceDate: f.dateNaissance || '', nationalite: f.nationalite || '',
    conjointLien: conj.lien, conjointNom: conj.nom, mariage, pacse: /pacs/i.test(sm.situation || '')
  };
}

function autDefunt(d) {
  const { fiche } = defuntDepuisFiches(d);
  const c = defuntConstitution(d).champs;
  return {
    civilite: c.civilite, prenoms: c.prenoms, nom: c.nom, profession: (fiche && fiche.profession) || '', domicile: c.domicile,
    naissanceLieu: c.naissanceLieu, naissanceDate: c.naissanceDate, nationalite: (fiche && fiche.nationalite) || '',
    decesLieu: c.decesLieu, decesDate: c.decesDate, conjointLien: c.conjointLien, conjointNom: c.conjointNom
  };
}

// Les personnes qui peuvent signer : les héritiers du dossier, le conjoint survivant compris.
function autPersonnes(d) {
  const { heritiers } = personnesSuccession(d);
  const survivant = heritiers.find(h => /^conjoint survivant$/i.test(String(h.qualite || '')));
  return heritiers.map((h, i) => {
    const estConjoint = h === survivant;
    return { index: i, nom: h.nom, qualite: h.qualite || '', civilite: h.civilite || '', estConjoint, modeleDefaut: modeleParDefautAutorisation(estConjoint, !!survivant) };
  });
}

function autModeleDe(d, p) {
  return autEtat.modeles[d.id + '|' + p.index] || p.modeleDefaut;
}

function autDocument(d, p, modele) {
  const signataire = autPersonneDepuisFiche(d, p.nom, p.civilite);
  const survivant = autPersonnes(d).find(x => x.estConjoint);
  const nomSurvivant = survivant ? nomCompletAutorisation(autPersonneDepuisFiche(d, survivant.nom, survivant.civilite)) : '';
  const brut = documentAutorisationSuccession(modele, { signataire, defunt: autDefunt(d), conjointSurvivant: nomSurvivant });
  const edite = autEtat.edites[d.id + '|' + p.index + '|' + modele];
  if (!edite) return brut;
  return brut.map((x, i) => (x.vide || edite[i] == null ? x : Object.assign({}, x, { texte: edite[i] })));
}

// ---- PDF ----

async function autGenererPdf(doc) {
  if (!window.PDFLib) await afChargerScript(URL_PDF_LIB_PDFA);
  const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
  const pdf = await PDFDocument.create();
  const normale = await pdf.embedFont(StandardFonts.TimesRoman);
  const grasse = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const jeu = new Set(normale.getCharacterSet());
  const propre = t => Array.from(String(t).replace(/[‘’]/g, '\'').replace(/ /g, ' ')).map(c => (jeu.has(c.codePointAt(0)) ? c : '?')).join('');
  const L = { gauche: 85, droite: 510, haut: 842 - 90, pas: 17, taille: 12, retrait: 0 };
  let page = pdf.addPage([595, 842]);
  let y = L.haut;
  const nouvelle = () => { page = pdf.addPage([595, 842]); y = L.haut; };
  const lignes = (texte, police, largeur) => {
    const mots = propre(texte).split(/\s+/).filter(Boolean);
    const sortie = [];
    let ligne = '';
    mots.forEach(m => {
      const essai = ligne ? ligne + ' ' + m : m;
      if (ligne && police.widthOfTextAtSize(essai, L.taille) > largeur) { sortie.push(ligne); ligne = m; } else ligne = essai;
    });
    if (ligne) sortie.push(ligne);
    return sortie;
  };
  doc.forEach(x => {
    if (x.vide) { y -= L.pas; return; }
    const police = x.gras ? grasse : normale;
    lignes(x.texte, police, L.droite - L.gauche).forEach(l => {
      if (y < 90) nouvelle();
      page.drawText(l, { x: L.gauche, y, size: L.taille, font: police, color: rgb(0, 0, 0) });
      if (x.gras) page.drawLine({ start: { x: L.gauche, y: y - 2 }, end: { x: L.gauche + police.widthOfTextAtSize(l, L.taille), y: y - 2 }, thickness: 0.7, color: rgb(0, 0, 0) });
      y -= L.pas;
    });
  });
  pdf.setTitle('Autorisation de fonds de succession');
  pdf.setCreator('CLAIRE');
  const octets = await pdf.save();
  return new Blob([octets], { type: 'application/pdf' });
}

async function telechargerAutorisationSuccession(idDossier, index, modele) {
  const d = dossiers.find(x => x.id === idDossier);
  if (!d) return;
  const p = autPersonnes(d).find(x => x.index === Number(index));
  if (!p) return;
  const cle = modele || autModeleDe(d, p);
  try {
    const doc = autDocument(d, p, cle);
    const blob = await autGenererPdf(doc);
    const signataire = autPersonneDepuisFiche(d, p.nom, p.civilite);
    telechargerFichier(blob, nomFichierAutorisation(cle, signataire));
    const manques = manquesAutorisation(doc);
    afficherToast(manques ? `PDF téléchargé — ${manques} ligne(s) « à compléter » : corrigez-les sur l’aperçu avant de l’imprimer.` : 'PDF téléchargé.', 'OK', null);
  } catch (e) {
    console.error(e);
    afficherToast('Le PDF n’a pas pu être généré. La première fois, le poste doit avoir accès au réseau (une bibliothèque est téléchargée une seule fois).', 'OK', null);
  }
}

// ---- Écran ----

function autChoisirDossier(id) {
  autEtat.dossierId = id;
  autEtat.ouvert = '';
  renderAutorisationsSuccession();
}

function autChoisirModele(id, index, modele) {
  autEtat.modeles[id + '|' + index] = modele;
  autEtat.ouvert = '';
  renderAutorisationsSuccession();
}

function autBasculerApercu(id, index) {
  const cle = id + '|' + index;
  autEtat.ouvert = autEtat.ouvert === cle ? '' : cle;
  renderAutorisationsSuccession();
}

function autModifierLigne(id, index, modele, i, valeur) {
  autEtat.edites[id + '|' + index + '|' + modele] = Object.assign({}, autEtat.edites[id + '|' + index + '|' + modele], { [i]: valeur });
}

function autRetablirTexte(id, index, modele) {
  delete autEtat.edites[id + '|' + index + '|' + modele];
  renderAutorisationsSuccession();
}

function initAutorisationsSuccession() {
  const liste = autDossiersSuccession();
  if (!liste.some(d => d.id === autEtat.dossierId)) autEtat.dossierId = liste.length ? liste[0].id : '';
  renderAutorisationsSuccession();
}

function renderAutorisationsSuccession() {
  const carte = document.getElementById('aut-carte');
  if (!carte) return;
  const liste = autDossiersSuccession();
  const d = autDossierChoisi();
  const options = liste.map(x => `<option value="${escapeAttr(x.id)}"${x.id === autEtat.dossierId ? ' selected' : ''}>${escapeHtml(libelleDossierAffiche(x))}</option>`).join('');
  let corps = '';
  if (!liste.length) corps = '<p class="hint">Aucune succession en cours. Créez-en une depuis Authentic (« Nouveau dossier »).</p>';
  else if (d) {
    const personnes = autPersonnes(d);
    const defunt = autDefunt(d);
    const avert = [];
    if (!defunt.nom) avert.push('Défunt non lu : ouvrez sa fiche dans Authentic ou saisissez-le sur la fiche du dossier.');
    if (!defunt.decesDate) avert.push('Date de décès manquante.');
    corps = (avert.length ? `<p class="hint">${avert.map(escapeHtml).join(' ')}</p>` : '')
      + (personnes.length ? `<div class="aut-liste">${personnes.map(p => {
        const modele = autModeleDe(d, p);
        const doc = autDocument(d, p, modele);
        const manques = manquesAutorisation(doc);
        const cle = d.id + '|' + p.index;
        const ouvert = autEtat.ouvert === cle;
        const idJs = escapeOnclickArg(d.id);
        return `<div class="aut-ligne">
          <div class="aut-ligne-tete">
            <span class="aut-nom">${escapeHtml(p.nom)}${p.qualite ? ` <span class="dot-label dl-neutre"><span class="dot"></span>${escapeHtml(p.qualite)}</span>` : ''}</span>
            <select class="aut-modele" aria-label="Modèle pour ${escapeAttr(p.nom)}" onchange="autChoisirModele('${idJs}', ${p.index}, this.value)">${MODELES_AUTORISATION_SUCCESSION.map(m => `<option value="${m.cle}"${m.cle === modele ? ' selected' : ''}>${escapeHtml(m.libelle)}</option>`).join('')}</select>
            ${manques ? `<span class="dot-label dl-attente" title="Données absentes de la fiche, à corriger sur l’aperçu"><span class="dot"></span>${manques} à compléter</span>` : ''}
            <wa-button appearance="outlined" size="s" type="button" onclick="autBasculerApercu('${idJs}', ${p.index})">${ouvert ? 'Fermer l’aperçu' : 'Aperçu'}</wa-button>
            <wa-button variant="brand" size="s" type="button" onclick="telechargerAutorisationSuccession('${idJs}', ${p.index})">${icone('download')}PDF</wa-button>
          </div>
          ${ouvert ? `<div class="aut-apercu">${doc.map((x, i) => (x.vide ? '' : `<textarea class="aut-ligne-texte${x.gras ? ' aut-gras' : ''}" rows="${Math.max(1, Math.ceil(x.texte.length / 90))}" aria-label="Ligne ${i + 1}" oninput="autModifierLigne('${idJs}', ${p.index}, '${modele}', ${i}, this.value)">${escapeHtml(x.texte)}</textarea>`)).join('')}
            <div><button type="button" class="lien-action" onclick="autRetablirTexte('${idJs}', ${p.index}, '${modele}')">Revenir au texte d’origine</button></div></div>` : ''}
        </div>`;
      }).join('')}</div>` : '<p class="hint">Aucun héritier sur la fiche : ouvrez la page du dossier dans Authentic.</p>');
  }
  carte.innerHTML = `<div class="dash-header"><div><div class="dash-eyebrow">Succession</div><div class="dash-titre-ligne"><h1 class="dash-titre">Autorisations de fonds</h1>${infoBulle('Déblocage de fonds pour un héritier sans conjoint survivant ; transfert de fonds pour le conjoint survivant, et pour chaque héritier au nom du conjoint survivant. Texte des modèles de l’office, identité reprise de la fiche : ce qui manque est marqué « à compléter » et se corrige sur l’aperçu.')}</div></div></div>
    <div class="aut-choix"><label for="aut-dossier">Dossier</label><select id="aut-dossier" onchange="autChoisirDossier(this.value)">${options}</select></div>
    ${corps}`;
}
