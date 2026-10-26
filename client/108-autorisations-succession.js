// Autorisations de déblocage ou de transfert de fonds d'une succession (étude 23/10 : trois modèles de l'office, « à télécharger d'un clic en PDF »,
// dans les fiches de succession et dans un outil de la catégorie « Succession », « un peu comme pour la constitution » : les parties à gauche,
// l'aperçu éditable du PDF à droite, tout télécharger ou un par un, envoi par email). Les textes sont ceux des modèles
// (commun/autorisations-succession.js) ; l'identité du signataire et celle du défunt viennent de la fiche du dossier (fiches client d'Authentic),
// tout ce qui manque reste « [à compléter] » et se corrige sur l'aperçu. PDF composé dans le navigateur par pdf-lib (Times standard, A4) ;
// rien n'est gardé sur le serveur.

var autEtat = { dossierId: '', choisis: {}, courant: '', modeles: {}, edites: {} };

function autDossiersSuccession() {
  // Notoriété seule : aucune autorisation de fonds (étude 26/10) — le dossier n'est pas proposé dans l'outil.
  return (Array.isArray(dossiers) ? dossiers : []).filter(d => d && estSuccession(d) && !d.archive && autorisationsFondsSuccession(d));
}

function autDossierChoisi() {
  return autDossiersSuccession().find(d => d.id === autEtat.dossierId) || null;
}

// Pure : la clé stable d'une personne (ses mots, sans accents ni casse) — jamais sa position dans la liste.
function autClePersonne(nom) {
  return String(nom || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Pure : « 41250 BRACIEUX » → « BRACIEUX (41250) », suivi du pays entre parenthèses s'il n'est pas la France (« SAIGON (VIETNAM) »).
function autLieu(lieu, pays) {
  const base = String(lieu || '').replace(/^\s*(\d{5})\s+(.+?)\s*$/, '$2 ($1)').trim();
  const p = String(pays || '').trim();
  return [base, p && !/^france$/i.test(p) ? `(${p})` : ''].filter(Boolean).join(' ');
}

// La personne d'une fiche client d'Authentic, au format des modèles (rien n'est deviné : une donnée absente reste vide).
function autPersonneDepuisFiche(d, nom, civilite) {
  const f = ficheClientDe(d, nom) || {};
  const sm = f.situationMatrimoniale || {};
  const civ = civiliteLibelleConstitution(f.civilite || civilite) || '';
  const conj = civ ? conjointDefunt(sm, civ) : { lien: '', nom: String(sm.conjoint || '').trim() };
  const m = (f.complement && f.complement.mariage) || {};
  const np = nomPrenomsComparant(nom);
  const dateMariage = m.date || sm.dateMariage || sm.date || '';
  const famille = f.nomFamille || np.nom;
  const memeFamille = conj.nom && autClePersonne(conj.nom).split(' ').pop() === autClePersonne(famille).split(' ').pop();
  const mariage = /mari/i.test(sm.situation || '') && dateMariage && conj.nom
    ? `${memeFamille ? `${civ || '[à compléter]'} et ${conj.nom.split(' ')[0]} ${famille}` : `${[civ, f.prenom || np.prenoms, famille].filter(Boolean).join(' ')} et ${conj.nom}`} mariés${m.lieu ? ` à la Mairie de ${autLieu(m.lieu, m.pays)}` : ''}, le ${formatDateFr(dateMariage)}${m.regime || sm.regime ? `, sous le régime ${m.regime || sm.regime}` : ''}.`
    : '';
  return {
    civilite: civ, prenoms: [f.prenom, f.autresPrenoms].filter(Boolean).join(' ') || np.prenoms, nom: famille,
    profession: f.profession || '', domicile: f.domicile ? normaliserAdresse(f.domicile) : '',
    naissanceLieu: autLieu(f.lieuNaissance, f.paysNaissance), naissanceDate: f.dateNaissance || '', nationalite: f.nationalite || '',
    conjointLien: conj.lien, conjointNom: conj.nom, mariage, situation: sm.situation || ''
  };
}

// Le défunt : champs de la fiche du dossier (corrections comprises) ; la civilité n'est jamais forcée (défunt non lu = « [à compléter] »).
function autDefunt(d) {
  const { fiche, comparant } = defuntDepuisFiches(d);
  const c = defuntConstitution(d).champs;
  const saisi = (d && d.defunt) || {};
  return {
    civilite: civiliteLibelleConstitution(saisi.civilite || (fiche && fiche.civilite) || (comparant && comparant.civilite)) || '',
    prenoms: c.prenoms, nom: c.nom, profession: (fiche && fiche.profession) || '', domicile: c.domicile,
    naissanceLieu: saisi.naissanceLieu != null ? c.naissanceLieu : (fiche ? autLieu(fiche.lieuNaissance, fiche.paysNaissance) : c.naissanceLieu), naissanceDate: c.naissanceDate,
    nationalite: (fiche && fiche.nationalite) || '', decesLieu: saisi.decesLieu != null ? c.decesLieu : (fiche && fiche.deces ? autLieu(fiche.deces.lieu, fiche.deces.pays) : c.decesLieu),
    decesDate: c.decesDate, conjointLien: c.conjointLien, conjointNom: c.conjointNom
  };
}

// Les personnes qui peuvent signer : les héritiers du dossier, le conjoint survivant compris — même s'il n'est connu que par la case de la fiche
// ou par le conjoint du défunt.
function autPersonnes(d) {
  const { heritiers } = personnesSuccession(d);
  const survit = conjointSurvivant(d);
  const defunt = autDefunt(d);
  const nomConjoint = defunt.conjointNom && /^[ée]pou/i.test(defunt.conjointLien || '') ? defunt.conjointNom.replace(/^(monsieur|madame|mademoiselle|m\.|mme)\s+/i, '') : '';
  const liste = heritiers.map(h => ({ nom: h.nom, qualite: h.qualite || '', civilite: h.civilite || '', estConjoint: /^conjoint survivant$/i.test(String(h.qualite || '')) || (survit && !!nomConjoint && memePersonneNommee(h.nom, nomConjoint)), emails: [].concat(Array.isArray(h.emails) ? h.emails : [], h.email ? [h.email] : []) }));
  if (survit && !liste.some(p => p.estConjoint) && nomConjoint) {
    liste.push({ nom: nomConjoint, qualite: 'Conjoint survivant', civilite: /^monsieur/i.test(defunt.conjointNom) ? 'M' : /^madame|^mme/i.test(defunt.conjointNom) ? 'Mme' : '', estConjoint: true, emails: [] });
  }
  return liste.map(p => Object.assign(p, { cle: autClePersonne(p.nom), modeleDefaut: modeleParDefautAutorisation(p.estConjoint, survit), emails: p.emails.concat(((ficheClientDe(d, p.nom) || {}).emails) || []).filter((e, i, tab) => e && tab.findIndex(x => String(x).toLowerCase() === String(e).toLowerCase()) === i) }));
}

function autModeleDe(d, p) {
  return autEtat.modeles[d.id + '|' + p.cle] || p.modeleDefaut;
}

// Le texte de base d'une autorisation (sans les corrections de l'aperçu).
function autDocumentBrut(d, p, modele, personnes) {
  const signataire = autPersonneDepuisFiche(d, p.nom, p.civilite);
  const survivant = (personnes || autPersonnes(d)).find(x => x.estConjoint);
  const nomSurvivant = survivant ? nomCompletAutorisation(autPersonneDepuisFiche(d, survivant.nom, survivant.civilite)) : '';
  return documentAutorisationSuccession(modele, { signataire, defunt: autDefunt(d), conjointSurvivant: nomSurvivant });
}

// Le texte avec les corrections faites sur l'aperçu : elles ne valent que tant que le texte de base n'a pas changé (une fiche relue, un autre
// modèle) — sinon elles auraient glissé sur une autre ligne.
function autDocument(d, p, modele, personnes) {
  const brut = autDocumentBrut(d, p, modele, personnes);
  const edite = autEtat.edites[d.id + '|' + p.cle + '|' + modele];
  if (!edite || edite.sig !== JSON.stringify(brut.map(x => x.texte))) return brut;
  return brut.map((x, i) => (x.vide || edite.lignes[i] == null ? x : Object.assign({}, x, { texte: edite.lignes[i] })));
}

// ---- PDF ----

async function autGenererPdf(doc) {
  if (!window.PDFLib) await afChargerScript(URL_PDF_LIB_PDFA, SRI_PDF_LIB_PDFA);
  const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
  const pdf = await PDFDocument.create();
  const normale = await pdf.embedFont(StandardFonts.TimesRoman);
  const grasse = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const jeu = new Set(normale.getCharacterSet());
  let remplaces = 0;
  // Un caractère que la police standard n'a pas (« ễ », « ł »…) est écrit sans son accent ; à défaut « ? » (et signalé).
  const propre = t => Array.from(String(t).replace(/[‘’]/g, '\'').replace(/[\u00a0\u202f\u2009]/g, ' ').replace(/\u2011/g, '-').replace(/\s+/g, ' ')).map(c => {
    if (jeu.has(c.codePointAt(0))) return c;
    remplaces++;
    const nu = c.normalize('NFD').replace(/[̀-ͯ]/g, '');
    return nu && jeu.has(nu.codePointAt(0)) ? nu : '?';
  }).join('');
  const L = { gauche: 85, droite: 510, haut: 842 - 90, pas: 17, taille: 12 };
  let page = pdf.addPage([595, 842]);
  let y = L.haut;
  const lignes = (texte, police) => {
    const mots = propre(texte).split(/\s+/).filter(Boolean);
    const sortie = [];
    let ligne = '';
    mots.forEach(m => {
      const essai = ligne ? ligne + ' ' + m : m;
      if (ligne && police.widthOfTextAtSize(essai, L.taille) > L.droite - L.gauche) { sortie.push(ligne); ligne = m; } else ligne = essai;
    });
    if (ligne) sortie.push(ligne);
    return sortie;
  };
  doc.forEach(x => {
    if (x.vide) { y -= L.pas; return; }
    const police = x.gras ? grasse : normale;
    lignes(x.texte, police).forEach(l => {
      if (y < 90) { page = pdf.addPage([595, 842]); y = L.haut; }
      page.drawText(l, { x: L.gauche, y, size: L.taille, font: police, color: rgb(0, 0, 0) });
      if (x.gras) page.drawLine({ start: { x: L.gauche, y: y - 2 }, end: { x: L.gauche + police.widthOfTextAtSize(l, L.taille), y: y - 2 }, thickness: 0.7, color: rgb(0, 0, 0) });
      y -= L.pas;
    });
  });
  pdf.setTitle('Autorisation de fonds de succession');
  pdf.setCreator('CLAIRE');
  return { blob: new Blob([await pdf.save()], { type: 'application/pdf' }), remplaces };
}

// Le PDF d'une personne : { blob, nom, manques, remplaces }.
async function autPdfDe(d, p, personnes, options) {
  const modele = autModeleDe(d, p);
  // Pour Yousign : sans « Fait à : / Le : », Yousign date et situe lui-même la signature.
  const doc = options && options.sansLieuDate ? sansLieuDateAutorisation(autDocument(d, p, modele, personnes)) : autDocument(d, p, modele, personnes);
  const { blob, remplaces } = await autGenererPdf(doc);
  return { blob, nom: nomFichierAutorisation(modele, autPersonneDepuisFiche(d, p.nom, p.civilite)), manques: manquesAutorisation(doc), remplaces };
}

function autMessagePdf(liste) {
  const manques = liste.reduce((n, x) => n + x.manques, 0);
  const remplaces = liste.reduce((n, x) => n + x.remplaces, 0);
  return [manques ? `${manques} ligne(s) « à compléter » à corriger sur l’aperçu` : '', remplaces ? `${remplaces} caractère(s) absent(s) de la police remplacé(s) (écrits sans accent ou par « ? »)` : ''].filter(Boolean).join(' · ');
}

async function telechargerAutorisationsSuccession(idDossier, noms) {
  const d = dossiers.find(x => x.id === idDossier);
  if (!d) return;
  const personnes = autPersonnes(d);
  const cibles = (noms || []).map(n => personnes.find(p => p.cle === autClePersonne(n))).filter(Boolean);
  if (!cibles.length) { afficherToast('Aucune personne choisie.', 'OK', null); return; }
  try {
    const faits = [];
    for (const p of cibles) {
      const r = await autPdfDe(d, p, personnes);
      telechargerFichier(r.blob, r.nom);
      faits.push(r);
      if (cibles.length > 1) await new Promise(res => setTimeout(res, 400));
    }
    const avert = autMessagePdf(faits);
    afficherToast(`${faits.length} PDF téléchargé${faits.length > 1 ? 's' : ''}${avert ? ' — ' + avert : ''}.`, 'OK', null);
  } catch (e) {
    console.error(e);
    afficherToast('Le PDF n’a pas pu être généré. La première fois, le poste doit avoir accès au réseau (une bibliothèque est téléchargée une seule fois).', 'OK', null);
  }
}

// Depuis la fiche : un clic = le PDF de la personne.
function telechargerAutorisationSuccession(idDossier, nom) {
  return telechargerAutorisationsSuccession(idDossier, [nom]);
}

// ---- Email (rien ne part sans « Envoyer » dans la fenêtre d'email) ----

async function envoyerAutorisationsSuccession(idDossier, noms) {
  const d = dossiers.find(x => x.id === idDossier);
  if (!d) return;
  const personnes = autPersonnes(d);
  const defunt = autDefunt(d);
  const nomDefunt = [defunt.civilite, defunt.prenoms, defunt.nom].filter(Boolean).join(' ');
  const cibles = (noms || []).map(n => personnes.find(p => p.cle === autClePersonne(n))).filter(Boolean);
  if (!cibles.length) { afficherToast('Aucune personne choisie.', 'OK', null); return; }
  for (const p of cibles) {
    try {
      const modele = autModeleDe(d, p);
      const r = await autPdfDe(d, p, personnes);
      const piece = { nom: r.nom, type: 'application/pdf', contenuBase64: await base64DepuisBlob(r.blob) };
      const res = await livrerEmailDossier({ destinataire: p.emails.slice(0, 3).join(', '), sujet: `Succession ${nomDefunt || ''} — autorisation de ${modele === 'deblocage' ? 'déblocage' : 'transfert'} de fonds`.replace(/\s+/g, ' ').trim(),
        corps: corpsEmailAutorisation(modele, nomDefunt, autPersonneDepuisFiche(d, p.nom, p.civilite).civilite), pieces: [piece], responsableSignature: d.responsable, dossierId: d.id, geste: 'autorisation-fonds' });
      if (res && res.ok) { ajouterHistorique(d, `Autorisation de fonds de ${p.nom} préparée par email`); sauvegarder(d); }
      else if (res && res.annule) break;
    } catch (err) { console.error(err); afficherToast('Email impossible à préparer : ' + (err && err.message ? err.message : 'erreur'), 'OK', null); break; }
  }
}

// ---- Yousign (le brouillon est préparé par l'agent Yousign du serveur ; le PDF, téléchargé sans « Fait à / Le », se joint dans Yousign) ----

async function envoyerYousignAutorisations(idDossier, noms) {
  const d = dossiers.find(x => x.id === idDossier);
  if (!d) return;
  const personnes = autPersonnes(d);
  const cibles = (noms || []).map(n => personnes.find(p => p.cle === autClePersonne(n))).filter(Boolean);
  if (!cibles.length) { afficherToast('Aucune personne choisie.', 'OK', null); return; }
  if (signatureRibEnCours) { afficherToast('Un brouillon Yousign est déjà en cours de préparation.', 'OK', null); return; }
  // Ouvert avant toute attente : le navigateur n'autorise une fenêtre que dans le geste du clic.
  const secours = signatureRibAuto === true ? null : window.open('https://yousign.app/', '_blank', 'noopener');
  signatureRibEnCours = true;
  try {
    for (const p of cibles) {
      const f = ficheClientDe(d, p.nom) || {};
      const sig = autPersonneDepuisFiche(d, p.nom, p.civilite);
      const signataire = signataireSignatureRib({ prenom: String(sig.prenoms || '').split(/\s+/)[0], nom: sig.nom, emails: p.emails, telephones: f.telephones || [] });
      const r = await autPdfDe(d, p, personnes, { sansLieuDate: true });
      telechargerFichier(r.blob, r.nom);
      const manques = manquesSignatureRib(signataire);
      if (manques.length) { afficherToast(`PDF téléchargé sans « Fait à / Le ». Pour Yousign, il manque sur la fiche : ${manques.join(', ')}.`, 'OK', null); continue; }
      if (signatureRibAuto !== true) {
        afficherToast(`PDF téléchargé sans « Fait à / Le » : ${secours ? 'Yousign est ouvert, créez la demande et joignez-le.' : 'ouvrez https://yousign.app/, créez la demande et joignez-le.'}`, 'OK', null);
        continue;
      }
      afficherToast(`Préparation du brouillon Yousign pour ${signataire.prenom} ${signataire.nom}… (une minute au plus)`, 'OK', null, { fixe: true, cle: 'signature-aut' });
      const rep = await fetchAvecAuth('/api/signature-rib/brouillon', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ titre: r.nom.replace(/\.pdf$/i, '') }, signataire)) });
      const j = await rep.json().catch(() => ({}));
      if (typeof fermerToastFixe === 'function') fermerToastFixe('signature-aut');
      if (rep.ok && j.ok && j.url) {
        ajouterHistorique(d, `Autorisation de fonds de ${p.nom} : brouillon Yousign créé`);
        sauvegarder(d);
        afficherToast('Brouillon créé dans Yousign : joignez le PDF téléchargé (sans « Fait à / Le »), placez la signature, puis envoyez-le depuis Yousign.', 'Ouvrir', () => window.open(j.url, '_blank', 'noopener'), { fixe: true, cle: 'signature-aut' });
      } else {
        afficherToast(((j && j.raison) || 'Le brouillon n’a pas pu être préparé.') + ' Le PDF est téléchargé.', 'OK', null, { fixe: true, cle: 'signature-aut' });
      }
    }
  } catch (e) {
    console.error(e);
    afficherToast('Le PDF ou le brouillon n’a pas pu être préparé.', 'OK', null);
  } finally {
    signatureRibEnCours = false;
  }
}

// ---- Écran ----

// Depuis la fiche d'une succession : l'outil ouvert sur ce dossier.
function ouvrirAutorisationsDepuisFiche(idDossier) {
  fermerDossierDrawer();
  definirOnglet('autorisations');
  autChoisirDossier(idDossier);
}

function autChoisirDossier(id) {
  autEtat.dossierId = id;
  autEtat.courant = '';
  renderAutorisationsSuccession();
}

function autChoisirModele(nom, modele) {
  autEtat.modeles[autEtat.dossierId + '|' + autClePersonne(nom)] = modele;
  autEtat.courant = autClePersonne(nom);
  renderAutorisationsSuccession();
}

function autCocher(nom, coche) {
  autEtat.choisis[autEtat.dossierId + '|' + autClePersonne(nom)] = !!coche;
  autEtat.courant = autClePersonne(nom);
  renderAutorisationsSuccession();
}

function autToutCocher(coche) {
  const d = autDossierChoisi();
  if (d) autPersonnes(d).forEach(p => { autEtat.choisis[d.id + '|' + p.cle] = !!coche; });
  renderAutorisationsSuccession();
}

function autVoir(nom) {
  autEtat.courant = autClePersonne(nom);
  renderAutorisationsSuccession();
}

// Une ligne de l'aperçu corrigée à la main (le texte de base sert de repère de validité).
function autEditer(el) {
  const d = autDossierChoisi();
  const p = d ? autPersonnes(d).find(x => x.cle === autEtat.courant) : null;
  if (!p) return;
  const modele = autModeleDe(d, p);
  const brut = autDocumentBrut(d, p, modele);
  const cle = d.id + '|' + p.cle + '|' + modele;
  const sig = JSON.stringify(brut.map(x => x.texte));
  const avant = autEtat.edites[cle] && autEtat.edites[cle].sig === sig ? autEtat.edites[cle].lignes : {};
  autEtat.edites[cle] = { sig, lignes: Object.assign({}, avant, { [el.dataset.i]: el.textContent }) };
}

function autRetablir() {
  const d = autDossierChoisi();
  const p = d ? autPersonnes(d).find(x => x.cle === autEtat.courant) : null;
  if (p) delete autEtat.edites[d.id + '|' + p.cle + '|' + autModeleDe(d, p)];
  renderAutorisationsSuccession();
}

function initAutorisationsSuccession() {
  const liste = autDossiersSuccession();
  if (!liste.some(d => d.id === autEtat.dossierId)) { autEtat.dossierId = ''; autEtat.courant = ''; }
  renderAutorisationsSuccession();
}

// Un redessin ne fait pas perdre le focus (case cochée, modèle changé au clavier).
function renderAutorisationsSuccession() {
  const actif = document.activeElement && document.activeElement.id;
  autRendreCorps();
  if (actif) { const e = document.getElementById(actif); if (e && e.focus && e !== document.activeElement) e.focus(); }
}

// Page d'accueil (comme la Constitution) : au centre, la recherche, puis les successions d'un clic.
function autDossiersAccueil(q) {
  const actifs = autDossiersSuccession();
  if (q) return actifs.filter(x => normaliserPourRecherche(libelleDossierAffiche(x)).includes(q) || normaliserPourRecherche(x.responsable || '').includes(q)).slice(0, 12);
  const recents = dossiersConsultesRecents(lireDossiersConsultes(), actifs).map(x => x.dossier);
  return recents.concat(actifs.filter(x => !recents.includes(x))).slice(0, 6);
}

function autCartesAccueil(q) {
  const cartes = autDossiersAccueil(q).map(x => `<button type="button" class="cst-accueil-carte" onclick="autChoisirDossier('${escapeOnclickArg(x.id)}')">
      <span class="cst-accueil-carte-icone succ" aria-hidden="true">${icone('users')}</span>
      <span class="cst-accueil-carte-texte"><span class="cst-accueil-carte-titre">${escapeHtml(libelleDossierAffiche(x))}</span>
      <span class="cst-accueil-carte-sous">${escapeHtml(['Succession', x.referenceAuthentic, x.responsable].filter(Boolean).join(' · '))}</span></span></button>`).join('');
  return cartes ? `<div class="cst-accueil-liste-titre"><span class="pieces-titre">${icone(q ? 'search' : 'clock')}<span class="pieces-titre-texte">${q ? 'Résultats' : 'Derniers dossiers'}</span></span></div><div class="cst-accueil-grille">${cartes}</div>` : '<div class="dash-recherche-vide">Aucune succession ne correspond.</div>';
}

function autRechercher(valeur) {
  const zone = document.getElementById('aut-cartes');
  if (zone) zone.innerHTML = autCartesAccueil(normaliserPourRecherche(String(valeur || '').trim()));
}

function autRendreCorps() {
  const carte = document.getElementById('aut-carte');
  if (!carte) return;
  const liste = autDossiersSuccession();
  const d = autDossierChoisi();
  const entete = `<div class="dash-header"><div><div class="dash-eyebrow">Succession</div><div class="dash-titre-ligne"><h1 class="dash-titre">Autorisations de fonds</h1>${infoBulle('Déblocage de fonds pour un héritier sans conjoint survivant ; transfert de fonds pour le conjoint survivant, et pour chaque héritier au nom du conjoint survivant. Texte des modèles de l’office, identité reprise de la fiche : ce qui manque est marqué « [à compléter] » et se corrige sur l’aperçu.')}</div></div></div>`;
  if (!liste.length) { carte.innerHTML = `${entete}<p class="hint">Aucune succession en cours. Créez-en une depuis Authentic (« Nouveau dossier »).</p>`; return; }
  if (!d) {
    autEtat.dossierId = '';
    carte.innerHTML = `<div class="cst-accueil">
      <span class="cst-accueil-icone" aria-hidden="true">${icone('file-text')}</span>
      <h2 class="cst-accueil-titre">Pour quelle succession ?</h2>
      <p class="cst-accueil-sous">Les autorisations de déblocage ou de transfert de fonds se préparent d’après la fiche du dossier, qui tient les données d’Authentic.</p>
      <div class="pr-dossier-recherche-bloc cst-recherche cst-accueil-recherche"><input type="search" id="aut-recherche" class="nas-choix-recherche" autocomplete="off" placeholder="Rechercher une succession…" aria-label="Rechercher une succession" oninput="autRechercher(this.value)"></div>
      <div id="aut-cartes" class="aut-cartes">${autCartesAccueil('')}</div>
    </div>`;
    return;
  }
  const personnes = autPersonnes(d);
  if (!personnes.some(p => p.cle === autEtat.courant)) autEtat.courant = personnes.length ? personnes[0].cle : '';
  const idJs = escapeOnclickArg(d.id);
  const choisies = personnes.filter(p => autEtat.choisis[d.id + '|' + p.cle]);
  const defunt = autDefunt(d);
  const avert = [!defunt.nom ? 'Défunt non lu : ouvrez sa fiche dans Authentic ou saisissez-le sur la fiche du dossier.' : '', defunt.nom && !defunt.decesDate ? 'Date de décès manquante.' : ''].filter(Boolean);
  const noms = ps => `[${ps.map(p => `'${escapeOnclickArg(p.nom)}'`).join(',')}]`;
  const rangees = personnes.map(p => {
    const modele = autModeleDe(d, p);
    const manques = manquesAutorisation(autDocument(d, p, modele, personnes));
    const nomJs = escapeOnclickArg(p.nom);
    return `<div class="cst-item aut-item${p.cle === autEtat.courant ? ' actif' : ''}" role="button" tabindex="0" aria-label="Voir l’aperçu de ${escapeAttr(p.nom)}" onclick="autVoir('${nomJs}')" onkeydown="if (event.target === this && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); autVoir('${nomJs}'); }">
      <input type="checkbox" id="aut-c-${escapeAttr(p.cle.replace(/ /g, '-'))}" aria-label="Choisir ${escapeAttr(p.nom)}"${autEtat.choisis[d.id + '|' + p.cle] ? ' checked' : ''} onclick="event.stopPropagation()" onchange="autCocher('${nomJs}', this.checked)">
      <div class="aut-personne"><span class="aut-nom">${escapeHtml(p.nom)}${p.qualite ? ` <span class="dot-label dl-neutre"><span class="dot"></span>${escapeHtml(p.qualite)}</span>` : ''}</span>
        <select class="aut-modele" id="aut-m-${escapeAttr(p.cle.replace(/ /g, '-'))}" aria-label="Modèle pour ${escapeAttr(p.nom)}" onclick="event.stopPropagation()" onchange="autChoisirModele('${nomJs}', this.value)">${MODELES_AUTORISATION_SUCCESSION.map(m => `<option value="${m.cle}" title="${escapeAttr(m.libelle)}"${m.cle === modele ? ' selected' : ''}>${escapeHtml(m.option || m.libelle)}</option>`).join('')}</select>
        ${manques ? `<span class="hint aut-manques">${manques} ligne${manques > 1 ? 's' : ''} à compléter</span>` : ''}</div>
      <span class="cst-item-actions" onclick="event.stopPropagation()">
        <wa-button appearance="plain" size="s" class="bouton-icone" type="button" title="Télécharger le PDF" aria-label="Télécharger le PDF de ${escapeAttr(p.nom)}" onclick="telechargerAutorisationsSuccession('${idJs}', ['${nomJs}'])">${icone('download')}</wa-button>
        <wa-button appearance="plain" size="s" class="bouton-icone" type="button" title="Envoyer par email${p.emails.length ? ' à ' + escapeAttr(p.emails[0]) : ''}" aria-label="Envoyer par email à ${escapeAttr(p.nom)}" onclick="envoyerAutorisationsSuccession('${idJs}', ['${nomJs}'])">${icone('mail')}</wa-button>
        <wa-button appearance="plain" size="s" class="bouton-icone" type="button" title="Envoyer sur Yousign (sans « Fait à / Le »)" aria-label="Envoyer sur Yousign à ${escapeAttr(p.nom)}" onclick="envoyerYousignAutorisations('${idJs}', ['${nomJs}'])">${icone('pencil')}</wa-button>
      </span></div>`;
  }).join('');
  const courant = personnes.find(p => p.cle === autEtat.courant);
  let apercu = '<p class="hint">Aucun héritier sur la fiche : ouvrez la page du dossier dans Authentic.</p>';
  if (courant) {
    const modele = autModeleDe(d, courant);
    const doc = autDocument(d, courant, modele, personnes);
    const editeCourant = autEtat.edites[d.id + '|' + courant.cle + '|' + modele];
    const corrige = editeCourant && editeCourant.sig === JSON.stringify(autDocumentBrut(d, courant, modele, personnes).map(x => x.texte));
    apercu = `<div class="aut-page" id="aut-page" aria-label="Aperçu de l’autorisation de ${escapeAttr(courant.nom)}">${doc.map((x, i) => (x.vide ? '<div class="aut-para aut-vide"></div>'
      : `<div class="aut-para${x.gras ? ' aut-gras' : ''}" contenteditable="plaintext-only" spellcheck="false" data-i="${i}" oninput="autEditer(this)">${escapeHtml(x.texte)}</div>`)).join('')}</div>
      <div class="aut-apercu-pied"><span class="hint">Corrigez le texte directement sur la page : le PDF et l’email partent tels qu’ils sont ici.</span>${corrige ? '<button type="button" class="lien-action" onclick="autRetablir()">Revenir au texte d’origine</button>' : ''}</div>`;
  }
  carte.innerHTML = `${entete}
    <div class="cst-corps">
      <div class="cst-barre">
        <span class="cst-dossier-titre">${escapeHtml(libelleDossierAffiche(d))}</span>
        <wa-button appearance="outlined" size="s" type="button" onclick="autChoisirDossier('')" title="Revenir au choix du dossier">${icone('rotate-ccw')} Changer de dossier</wa-button>
        <span class="cst-dossier-info">${personnes.length} personne${personnes.length > 1 ? 's' : ''}</span>
        <span class="aut-barre-actions">
          <button type="button" class="lien-action" onclick="autToutCocher(${choisies.length < personnes.length})">${choisies.length < personnes.length ? 'Tout cocher' : 'Tout décocher'}</button>
          <wa-button appearance="outlined" size="s" type="button"${choisies.length ? '' : ' disabled'} onclick="envoyerAutorisationsSuccession('${idJs}', ${noms(choisies)})">${icone('mail')}Envoyer par email${choisies.length ? ` (${choisies.length})` : ''}</wa-button>
          <wa-button appearance="outlined" size="s" type="button"${choisies.length ? '' : ' disabled'} onclick="envoyerYousignAutorisations('${idJs}', ${noms(choisies)})" title="PDF sans « Fait à / Le » téléchargé, brouillon préparé dans Yousign">${icone('pencil')}Envoyer sur Yousign${choisies.length ? ` (${choisies.length})` : ''}</wa-button>
          <wa-button variant="brand" size="s" type="button"${choisies.length ? '' : ' disabled'} onclick="telechargerAutorisationsSuccession('${idJs}', ${noms(choisies)})">${icone('download')}Télécharger${choisies.length ? ` (${choisies.length})` : ''}</wa-button>
        </span>
      </div>
      ${avert.length ? `<p class="hint">${avert.map(escapeHtml).join(' ')}</p>` : ''}
      <div class="cst-mise-en-page">
        <div class="cst-gauche"><div class="cst-bloc-titre">Parties</div>${personnes.length ? rangees : '<p class="hint">Aucun héritier sur la fiche : ouvrez la page du dossier dans Authentic.</p>'}</div>
        <div class="cst-droite"><div class="cst-bloc-titre">Aperçu du PDF</div>${apercu}</div>
      </div>
    </div>`;
}
