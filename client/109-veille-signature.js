// Fiche de veille de signature (étude 24/10 : « 48 h avant le rendez-vous un pop-up s'affiche et propose de télécharger le PDF prérempli, avec les
// dates et les conditions remplies ; mettre la coche et la date en plus gros — à imprimer et à mettre dans le dossier »). Une page A4 par vente :
// le rendez-vous (date, heure, lieu) en grand, puis une ligne par condition de la signature — prêt, vente préalable, préemption, SAFER, pièces,
// engagements du vendeur, appel de fonds, projet, fonds, RIB — avec une grande case cochée quand c'est fait et sa date en gros. Rien n'est écrit
// sur le dossier ; la fiche dit l'état au moment où elle est éditée (et l'heure). La même fiche s'obtient à tout moment depuis la fiche du dossier
// (ligne « Outils » de l'onglet Dossier). Le pop-up n'est montré qu'une fois par rendez-vous et par poste (une nouvelle date le fait revenir).
// PDF composé dans le navigateur par pdf-lib avec les polices embarquées du courrier (Carlito, Liberation Serif), jamais un PDF/A : c'est une fiche
// de travail, pas une pièce de dossier à déposer dans Authentic.

var HEURES_VEILLE_SIGNATURE = 48;
var CLE_STOCKAGE_VEILLE_SIGNATURE = 'claire-veille-signature:';
var LIMITE_VUES_VEILLE_SIGNATURE = 200;

// Pure : AAAA-MM-JJ d'une date (ou d'un horodatage) valide, sinon ''.
function isoValideVeille(valeur) {
  return typeof valeur === 'string' && /^\d{4}-\d{2}-\d{2}/.test(valeur) ? valeur.slice(0, 10) : '';
}

// Pure : « 2026-10-29 » → « 29/10/2026 » (la date en gros de la fiche).
function dateCourteVeille(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

// Pure : l'instant du rendez-vous de signature d'un dossier — { iso, heure, debut, fin } ; sans heure, le rendez-vous vaut toute la journée.
// null sans date valide.
function instantsSignatureVeille(d) {
  const iso = isoValideVeille(d && d.rendezVousSignature);
  if (!iso) return null;
  const h = /^(\d{1,2}):(\d{2})$/.exec(String((d && d.rendezVousSignatureHeure) || ''));
  const heure = h ? `${h[1].padStart(2, '0')}:${h[2]}` : '';
  const debut = new Date(`${iso}T${heure || '00:00'}:00`);
  const fin = new Date(`${iso}T${heure || '23:59'}:${heure ? '00' : '59'}`);
  if (isNaN(debut.getTime()) || isNaN(fin.getTime())) return null;
  return { iso, heure, debut, fin };
}

// Pure : la fiche est-elle « due » — rendez-vous dans les 48 prochaines heures (et pas encore passé), vente non archivée et pas déjà signée.
// Jamais pour une succession (autre déroulé, pas de conditions de vente).
function veilleSignatureDue(d, maintenant) {
  if (!d || d.archive || estSuccession(d) || signatureFaiteSuivi(d)) return false;
  const r = instantsSignatureVeille(d);
  if (!r) return false;
  const t = (maintenant || new Date()).getTime();
  return t >= r.debut.getTime() - HEURES_VEILLE_SIGNATURE * 3600 * 1000 && t <= r.fin.getTime();
}

// Pure : repère d'un rendez-vous déjà proposé (dossier + date + heure) — un rendez-vous déplacé revient.
function cleVeilleSignature(d) {
  const r = instantsSignatureVeille(d);
  return d && r ? `${d.id}|${r.iso}|${r.heure}` : '';
}

// Pure : les dossiers dont la fiche est à proposer à ce collaborateur — les siens (responsable), pas encore proposés, le plus proche d'abord.
function dossiersVeilleSignature(liste, utilisateur, maintenant, vues) {
  if (!utilisateur) return [];
  const deja = new Set(Array.isArray(vues) ? vues : []);
  return (Array.isArray(liste) ? liste : [])
    .filter(d => d && d.responsable === utilisateur && veilleSignatureDue(d, maintenant) && !deja.has(cleVeilleSignature(d)))
    .sort((a, b) => instantsSignatureVeille(a).debut - instantsSignatureVeille(b).debut);
}

// Pure : les libellés (à afficher) de ce qui manque dans la liste, tronquée à `max` avec « … ».
function listeCourteVeille(libelles, max) {
  const l = (libelles || []).filter(Boolean);
  return l.length > max ? `${l.slice(0, max).join(', ')}…` : l.join(', ');
}

// Pure : les conditions de la signature d'un dossier, dans l'ordre où l'étude les suit. Chaque ligne :
// { cle, label, etat: 'fait' | 'attente' | 'sans-objet', date (AAAA-MM-JJ ou ''), note }. Une date n'est écrite que lorsqu'elle est relevée
// (jamais devinée) ; une condition qui ne s'applique pas à ce dossier est dite « sans objet » (jamais cochée).
function lignesVeilleSignature(d) {
  const lignes = [];
  const ligne = (cle, label, etat, date, note) => lignes.push({ cle, label, etat, date: date || '', note: note || '' });
  const participation = d.roleNotaire === 'participant';

  if (d.ventebien) {
    const fait = echeanceValidee(d, 'ventebien');
    ligne('ventebien', 'Vente préalable réalisée', fait ? 'fait' : 'attente', '', fait ? '' : `date butoir : ${dateCourteVeille(d.ventebien)}`);
  }
  if (d.sansPret) {
    ligne('pret', 'Offre de prêt', 'sans-objet', '', 'Achat sans prêt');
  } else {
    const fait = echeanceValidee(d, 'pret');
    ligne('pret', 'Offre de prêt reçue', fait ? 'fait' : 'attente', fait ? (dateObtentionPret(d) || '') : '', fait || !d.pret ? '' : `condition suspensive jusqu’au ${dateCourteVeille(d.pret)}`);
  }

  // Renonciation de la commune au droit de préemption.
  if (d.pieces && d.pieces.renonciationPreemption === 'recue') {
    ligne('preemption', 'Renonciation au droit de préemption reçue', 'fait', dateRenonciationPreemption(d) || '', '');
  } else if (preemptionLevee(d)) {
    ligne('preemption', 'Droit de préemption', 'sans-objet', '', participation ? 'Dossier en participation' : (droitNonApplicable(d, 'dpu') ? 'Pas de droit de préemption urbain' : 'Aucune renonciation à attendre'));
  } else {
    const reponse = echeanceDiaDossier(d);
    ligne('preemption', 'Renonciation au droit de préemption reçue', 'attente', '', reponse ? `réponse de la commune attendue avant le ${dateCourteVeille(reponse)}` : '');
  }

  // SAFER : seulement si le dossier en parle (notification d'Authentic ou pièce « Réponse SAFER »).
  const safer = d.authentic && d.authentic.safer;
  if (safer || (d.piecesPersonnalisees || []).some(p => p && /safer/i.test(p.label || ''))) {
    if (saferNonApplicable(d)) {
      ligne('safer', 'SAFER', 'sans-objet', '', 'Pas de droit de préemption de la SAFER');
    } else if (saferLevee(d)) {
      ligne('safer', 'Réponse de la SAFER', 'fait', isoValideVeille(safer && safer.decisionLe), safer && safer.decision === 'non_preemption' ? 'non-préemption' : '');
    } else {
      const tacite = echeanceSaferDossier(d);
      ligne('safer', 'Réponse de la SAFER', 'attente', '', tacite ? `non-préemption tacite le ${dateCourteVeille(tacite)}` : 'réponse attendue');
    }
  }

  // Pièces de la checklist (jamais en participation : l'étude ne la suit pas) et engagements du vendeur de l'analyse.
  if (!participation) {
    const pieces = d.pieces || {};
    const analyse = elementsAnalyseEnAttente(d);
    const manquantes = checklistPieces(d.typeVente, d).filter(p => p.cle !== 'renonciationPreemption' && pieces[p.cle] !== 'recue').map(p => p.label).concat(analyse.documents);
    ligne('pieces', 'Pièces du dossier réunies', manquantes.length ? 'attente' : 'fait', '', manquantes.length ? `${manquantes.length} manquante${manquantes.length > 1 ? 's' : ''} : ${listeCourteVeille(manquantes, 4)}` : '');
    const engagements = (d.analyseJuridique && d.analyseJuridique.engagements) || [];
    if (engagements.length) {
      ligne('engagements', 'Engagements du vendeur réalisés', analyse.engagements.length ? 'attente' : 'fait', '',
        analyse.engagements.length ? `${analyse.engagements.length} à vérifier : ${listeCourteVeille(analyse.engagements.map(e => e.replace(/^Engagement : /, '')), 3)}` : '');
    }
  }

  const rdv = isoValideVeille(d.rendezVousSignature);
  const appel = echeanceValidee(d, 'appelFonds');
  ligne('appelFonds', 'Appel de fonds envoyé', appel ? 'fait' : 'attente', appel ? isoValideVeille(d.appelFonds) : '', appel || !rdv ? '' : `à envoyer avant le ${dateCourteVeille(echeanceAppelFonds(d))}`);
  const projet = echeanceValidee(d, 'projetEnvoye');
  ligne('projetEnvoye', 'Projet d’acte envoyé', projet ? 'fait' : 'attente', projet ? isoValideVeille(d.projetEnvoye) : '', '');

  // Fonds : reçus complets (ou validés à la main), puis confirmation au client.
  const bilan = bilanFondsDossier(d);
  const recus = ((d.fondsRecus && d.fondsRecus.recus) || []).map(r => isoValideVeille(r && r.date)).filter(Boolean).sort();
  const complet = bilan.etat === 'complet';
  let noteFonds = '';
  if (bilan.manuel) noteFonds = 'validés à la main';
  else if (bilan.attendu) noteFonds = `${formaterPrixCentimes(bilan.total)} reçus sur ${formaterPrixCentimes(bilan.attendu)} attendus`;
  else if (bilan.total > 0) noteFonds = `${formaterPrixCentimes(bilan.total)} reçus (montant attendu inconnu)`;
  ligne('fonds', 'Fonds reçus', complet ? 'fait' : 'attente', complet ? (isoValideVeille(d.fondsValidesLe) || recus[recus.length - 1] || '') : '', noteFonds);
  const confirmee = isoValideVeille(d.receptionFondsConfirmeeLe);
  ligne('confirmationFonds', 'Réception des fonds confirmée au client', confirmee ? 'fait' : 'attente', confirmee, '');

  // RIB et pièce d'identité : jamais demandés directement quand un confrère accompagne l'acquéreur.
  if (notaireParticipantRepresenteAcquereur(d)) {
    ligne('rib', 'RIB et pièce d’identité', 'sans-objet', '', 'À demander par l’office du confrère');
  } else {
    const rib = isoValideVeille(d.ribDemandeLe);
    ligne('rib', 'RIB et pièce d’identité demandés', rib ? 'fait' : 'attente', rib, '');
  }
  return lignes;
}

// Pure : toute la fiche — en-tête (dossier, rendez-vous, lieu, responsable), conditions et compte. `options.categoriesRdv` = catégories réglées.
function ficheVeilleSignature(d, options) {
  const o = options || {};
  const r = instantsSignatureVeille(d);
  const lieu = lieuAppelFondsDossier(d, o.categoriesRdv || {});
  const texteLieu = lieu.valeur === '__autre' ? lieu.autre : lieu.valeur;
  const lignes = lignesVeilleSignature(d);
  const applicables = lignes.filter(l => l.etat !== 'sans-objet');
  const faites = applicables.filter(l => l.etat === 'fait').length;
  return {
    dossier: libelleDossierAffiche(d),
    iso: r ? r.iso : '',
    heure: r ? r.heure : '',
    jour: r ? dateAvecJourFr(r.iso) : '',
    heureTexte: r && r.heure ? heureEmail(r.heure).replace('h', ' h ') : '',
    lieu: texteLieu ? texteLieu.charAt(0).toUpperCase() + texteLieu.slice(1) : '',
    responsable: d.responsable || '',
    lignes,
    faites,
    total: applicables.length,
    reste: applicables.length - faites
  };
}

// Pure : nom du fichier PDF, sans caractère refusé par Windows.
function nomFichierVeilleSignature(d, aujourdhuiIso) {
  const base = `Fiche de signature - ${libelleDossierAffiche(d)}${d.rendezVousSignature ? ' - ' + isoValideVeille(d.rendezVousSignature) : ''}`;
  return base.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() + '.pdf';
}

// Pure : un texte coupé en lignes d'au plus `largeur` points ; `mesurer(texte)` rend la largeur.
function lignesTexteVeille(texte, largeur, mesurer) {
  const lignes = [];
  let courante = '';
  String(texte || '').split(/\s+/).filter(Boolean).forEach(mot => {
    const essai = courante ? `${courante} ${mot}` : mot;
    if (courante && mesurer(essai) > largeur) { lignes.push(courante); courante = mot; } else courante = essai;
  });
  if (courante) lignes.push(courante);
  return lignes;
}

// ---- Le PDF ----

var MISE_EN_PAGE_VEILLE = { largeur: 595.28, hauteur: 841.89, gauche: 40, droite: 555.28, haut: 40, bas: 790, caseTaille: 30, ligneMax: 46, ligneMin: 34 };

// La page A4. `lib` = pdf-lib (injectable pour un essai hors navigateur), `polices` = octets de chargerOutilsPdfA, `maintenant` = date d'édition.
async function composerPdfVeilleSignature(fiche, lib, polices, maintenant) {
  const { PDFDocument, rgb } = lib;
  const doc = await PDFDocument.create();
  doc.registerFontkit(lib.fontkit);
  const sansLigatures = { liga: false, clig: false, dlig: false, calt: false };
  const f = {
    sans: await doc.embedFont(polices.sans, { subset: false, features: sansLigatures }),
    gras: await doc.embedFont(polices.sansGras, { subset: false, features: sansLigatures }),
    titre: await doc.embedFont(polices.serifGras, { subset: true, features: sansLigatures })
  };
  const jeux = {};
  Object.keys(f).forEach(cle => { jeux[cle] = new Set(f[cle].getCharacterSet()); });
  const propre = (t, cle) => texteImprimablePdfA(t, cp => jeux[cle].has(cp));
  const M = MISE_EN_PAGE_VEILLE;
  const H = M.hauteur;
  const hex = (h) => rgb(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255);
  const bordeaux = hex('6D2332'), noir = hex('1A1A1A'), gris = hex('666666'), filet = hex('D9D9D9'), vert = hex('1F7A3D'), rouge = hex('B3261E');
  let page = null;
  const nouvellePage = () => { page = doc.addPage([M.largeur, H]); };
  // Coordonnées « depuis le haut » ; `droite` aligne le texte sur son bord droit.
  const ecrire = (texte, x, yHaut, cle, taille, couleur, droite) => {
    const s = propre(texte, cle);
    if (!s) return 0;
    const l = f[cle].widthOfTextAtSize(s, taille);
    page.drawText(s, { x: droite ? x - l : x, y: H - yHaut - taille * 0.8, size: taille, font: f[cle], color: couleur || noir });
    return l;
  };
  const mesure = (cle, taille) => (t) => f[cle].widthOfTextAtSize(propre(t, cle), taille);
  const trait = (x1, y1, x2, y2, epaisseur, couleur, rond) => page.drawLine({ start: { x: x1, y: H - y1 }, end: { x: x2, y: H - y2 }, thickness: epaisseur, color: couleur, lineCap: rond ? 1 : 0 });

  nouvellePage();
  // En-tête : ce que c'est, puis le dossier.
  ecrire('FICHE DE SIGNATURE — À JOINDRE AU DOSSIER', M.gauche, M.haut, 'gras', 10, bordeaux);
  let tailleTitre = 22;
  while (tailleTitre > 14 && f.titre.widthOfTextAtSize(propre(fiche.dossier, 'titre'), tailleTitre) > M.droite - M.gauche) tailleTitre -= 1;
  ecrire(fiche.dossier, M.gauche, M.haut + 18, 'titre', tailleTitre, noir);

  // Le rendez-vous, en grand, dans un cadre.
  const hautCadre = 100, hautCadreBloc = 92;
  page.drawRectangle({ x: M.gauche, y: H - hautCadre - hautCadreBloc, width: M.droite - M.gauche, height: hautCadreBloc, borderColor: bordeaux, borderWidth: 1.6 });
  ecrire(fiche.jour || 'Rendez-vous à fixer', M.gauche + 16, hautCadre + 12, 'gras', 30, bordeaux);
  if (fiche.heureTexte) ecrire('à ' + fiche.heureTexte, M.gauche + 16, hautCadre + 48, 'gras', 26, noir);
  const infos = [fiche.lieu, fiche.responsable ? 'Responsable : ' + fiche.responsable : ''].filter(Boolean);
  infos.forEach((t, i) => ecrire(t, M.droite - 16, hautCadre + 52 + i * 16, 'sans', 12, gris, true));

  // Le compte des conditions.
  const yCompte = hautCadre + hautCadreBloc + 14;
  const compte = fiche.total ? (fiche.reste ? `${fiche.faites} condition${fiche.faites > 1 ? 's' : ''} sur ${fiche.total} remplie${fiche.faites > 1 ? 's' : ''} — ${fiche.reste} à lever` : `Les ${fiche.total} conditions sont remplies`) : '';
  if (compte) ecrire(compte, M.gauche, yCompte, 'gras', 13, fiche.reste ? rouge : vert);

  // Les conditions : grande case (cochée en vert quand c'est fait), libellé, note, date en gros à droite.
  const debutLignes = yCompte + 26;
  const reserveNotes = 96;
  const hauteurLigne = Math.max(M.ligneMin, Math.min(M.ligneMax, Math.floor((M.bas - reserveNotes - debutLignes) / Math.max(1, fiche.lignes.length))));
  let y = debutLignes;
  fiche.lignes.forEach(l => {
    if (y + hauteurLigne > M.bas) { nouvellePage(); y = M.haut; }
    const cx = M.gauche, cy = y + (hauteurLigne - M.caseTaille) / 2, t = M.caseTaille;
    if (l.etat === 'sans-objet') {
      page.drawRectangle({ x: cx, y: H - cy - t, width: t, height: t, color: hex('F1F1F1'), borderColor: hex('BDBDBD'), borderWidth: 1.2 });
      trait(cx + 8, cy + t / 2, cx + t - 8, cy + t / 2, 1.6, hex('9A9A9A'), true);
    } else {
      page.drawRectangle({ x: cx, y: H - cy - t, width: t, height: t, borderColor: l.etat === 'fait' ? vert : noir, borderWidth: 2 });
      if (l.etat === 'fait') {
        // La coche : deux traits épais arrondis, plus grands que la case.
        trait(cx + 6, cy + 17, cx + 13, cy + 24, 4.2, vert, true);
        trait(cx + 13, cy + 24, cx + t + 3, cy + 1, 4.2, vert, true);
      }
    }
    const xTexte = cx + t + 16;
    const largeurTexte = M.droite - 130 - xTexte;
    const gris2 = l.etat === 'sans-objet';
    const noteLignes = l.note ? lignesTexteVeille(l.note, largeurTexte, mesure('sans', 9.5)).slice(0, 2) : [];
    const blocHauteur = 14 + noteLignes.length * 11.5;
    const yTexte = y + (hauteurLigne - blocHauteur) / 2;
    ecrire(l.label, xTexte, yTexte, 'gras', 13, gris2 ? gris : noir);
    noteLignes.forEach((n, i) => ecrire(n, xTexte, yTexte + 16 + i * 11.5, 'sans', 9.5, l.etat === 'attente' ? rouge : gris));
    if (l.date) ecrire(dateCourteVeille(l.date), M.droite, y + (hauteurLigne - 18) / 2, 'gras', 18, l.etat === 'fait' ? vert : noir, true);
    else if (l.etat === 'sans-objet') ecrire('sans objet', M.droite, y + (hauteurLigne - 11) / 2, 'sans', 11, gris, true);
    trait(M.gauche, y + hauteurLigne, M.droite, y + hauteurLigne, 0.6, filet, false);
    y += hauteurLigne;
  });

  // Notes à la main, puis la mention d'édition (l'état change : la date et l'heure disent de quand est la fiche).
  const yNotes = Math.min(M.bas - 70, y + 14);
  ecrire('Notes', M.gauche, yNotes, 'gras', 10, bordeaux);
  page.drawRectangle({ x: M.gauche, y: H - M.bas, width: M.droite - M.gauche, height: M.bas - yNotes - 16, borderColor: filet, borderWidth: 1 });
  const edition = `Fiche éditée par CLAIRE le ${maintenant.toLocaleDateString('fr-FR')} à ${maintenant.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} — état du dossier à cet instant.`;
  ecrire(edition, M.gauche, H - 28, 'sans', 8, gris);

  doc.setTitle(`Fiche de signature — ${fiche.dossier}`);
  doc.setCreator('CLAIRE');
  doc.setProducer('CLAIRE (pdf-lib)');
  doc.setCreationDate(maintenant);
  return doc.save();
}

// Le PDF d'un dossier : { blob, nom }.
async function genererPdfVeilleSignature(d) {
  const polices = await chargerOutilsPdfA();
  const fiche = ficheVeilleSignature(d, { categoriesRdv: categoriesRdvReglees() });
  const octets = await composerPdfVeilleSignature(fiche, Object.assign({}, window.PDFLib, { fontkit: window.fontkit }), polices, new Date());
  return { blob: new Blob([octets], { type: 'application/pdf' }), nom: nomFichierVeilleSignature(d) };
}

async function telechargerFicheSignature(id) {
  const d = dossiers.find(x => x.id === id);
  if (!d) return;
  try {
    const { blob, nom } = await genererPdfVeilleSignature(d);
    telechargerFichier(blob, nom, 'application/pdf');
    noteVeilleSignatureVue(d);
    noterVerificationPoste('veille-signature-pdf', { detail: 'fiche de signature produite' });
  } catch (e) {
    afficherToast('Impossible de produire la fiche de signature : ' + (e && e.message ? e.message : 'erreur inconnue'), 'OK', null);
    noterVerificationPoste('veille-signature-pdf', { ok: false, message: 'PDF non produit' });
  }
}

// ---- Le pop-up ----

function clePosteVeilleSignature() {
  return CLE_STOCKAGE_VEILLE_SIGNATURE + String(utilisateurPoste || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function veillesSignatureVues() {
  try {
    const l = JSON.parse(localStorage.getItem(clePosteVeilleSignature()) || '[]');
    return Array.isArray(l) ? l.filter(x => typeof x === 'string') : [];
  } catch (e) { return []; }
}

function noteVeilleSignatureVue(d) {
  const cle = cleVeilleSignature(d);
  if (!cle) return;
  const vues = veillesSignatureVues();
  if (vues.indexOf(cle) !== -1) return;
  vues.push(cle);
  ecrireLocal(clePosteVeilleSignature(), JSON.stringify(vues.slice(-LIMITE_VUES_VEILLE_SIGNATURE)));
}

var veilleSignatureAffichee = [];

// Le texte du délai : « demain à 14 h 30 », « aujourd'hui à 10 h », « dans 2 jours ».
function delaiVeilleSignature(d, maintenant) {
  const r = instantsSignatureVeille(d);
  if (!r) return '';
  const jours = joursEntre(isoLocalDepuisDate(maintenant), r.iso);
  const quand = jours <= 0 ? 'aujourd’hui' : (jours === 1 ? 'demain' : `${dateAvecJourFr(r.iso)}`);
  return r.heure ? `${quand} à ${heureEmail(r.heure).replace('h', ' h ').trim()}` : quand;
}

function renderVeilleSignature(liste, maintenant) {
  const contenu = document.getElementById('veille-signature-contenu');
  if (!contenu) return;
  const categoriesRdv = categoriesRdvReglees();
  contenu.innerHTML = `
    <h2 class="veille-titre">${icone('calendar')}Signature dans moins de 48 h</h2>
    <p class="veille-intro">La fiche de signature est prête : les conditions remplies sont cochées avec leur date. Imprimez-la pour le dossier.</p>
    <div class="veille-liste">
      ${liste.map(d => {
        const f = ficheVeilleSignature(d, { categoriesRdv });
        const manque = f.lignes.filter(l => l.etat === 'attente').map(l => l.label);
        const etat = f.reste
          ? `<span class="dot-label dl-urgent"><span class="dot"></span>${f.reste} condition${f.reste > 1 ? 's' : ''} à lever</span><span class="veille-manque">${escapeHtml(listeCourteVeille(manque, 3))}</span>`
          : '<span class="dot-label dl-success"><span class="dot"></span>Toutes les conditions sont remplies</span>';
        return `<div class="veille-dossier">
          <div class="veille-dossier-tete"><strong>${escapeHtml(f.dossier)}</strong><span class="veille-quand">${escapeHtml(delaiVeilleSignature(d, maintenant))}</span></div>
          <div class="veille-etat">${etat}</div>
          <div class="veille-actions">
            <wa-button variant="brand" size="s" type="button" onclick="telechargerFicheSignature('${escapeOnclickArg(d.id)}')">${icone('download')}Télécharger la fiche (PDF)</wa-button>
            <wa-button appearance="outlined" size="s" type="button" onclick="fermerVeilleSignature(); ouvrirDossierDrawer('${escapeOnclickArg(d.id)}')">Ouvrir la fiche du dossier</wa-button>
          </div>
        </div>`;
      }).join('')}
    </div>
    <div class="confirm-actions"><wa-button appearance="outlined" type="button" onclick="fermerVeilleSignature()">Fermer</wa-button></div>`;
}

function fermerVeilleSignature() {
  const overlay = document.getElementById('veille-signature-overlay');
  if (overlay) overlay.style.display = 'none';
  // Fermer vaut « vu » : le pop-up ne revient pas pour ce rendez-vous (la fiche reste dans l'onglet Dossier).
  veilleSignatureAffichee.forEach(noteVeilleSignatureVue);
  veilleSignatureAffichee = [];
}

// Une saisie, une fenêtre ou un autre pop-up ouvert : on attend le tour suivant plutôt que de couper le travail.
function posteOccupeVeilleSignature() {
  const a = document.activeElement;
  if (a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) return true;
  return Array.from(document.querySelectorAll('.confirm-overlay')).some(o => o.style.display && o.style.display !== 'none');
}

function verifierVeilleSignature() {
  if (!utilisateurPoste || posteOccupeVeilleSignature()) return;
  const maintenant = new Date();
  const liste = dossiersVeilleSignature(dossiers, utilisateurPoste, maintenant, veillesSignatureVues());
  if (!liste.length) return;
  const overlay = document.getElementById('veille-signature-overlay');
  if (!overlay) return;
  veilleSignatureAffichee = liste;
  renderVeilleSignature(liste, maintenant);
  overlay.style.display = 'flex';
}
