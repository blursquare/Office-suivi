// Fiche de veille de signature (étude 24/10 : « 48 h avant le rendez-vous un pop-up s'affiche et propose de télécharger le PDF prérempli, avec les
// dates et les conditions remplies ; mettre la coche et la date en plus gros — à imprimer et à mettre dans le dossier »). Une page A4 par vente :
// le rendez-vous (date, heure, lieu) en grand, puis une ligne par condition de la signature — prêt, vente préalable, préemption, SAFER, pièces,
// engagements du vendeur, appel de fonds, projet, fonds, RIB — avec une grande case cochée quand c'est fait et sa date en gros. Rien n'est écrit
// sur le dossier ; la fiche dit l'état au moment où elle est éditée (et l'heure). La même fiche s'obtient à tout moment depuis la fiche du dossier
// (ligne « Outils » de l'onglet Dossier). Le pop-up ne s'affiche qu'à l'ouverture de CLAIRE ou à l'ouverture de la fiche du dossier concerné, une seule fois par rendez-vous et par poste (une nouvelle date le fait revenir).
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

// Pure : l'instant où la fiche est proposée pour un rendez-vous commençant à `debut` — 48 h avant, sauf si ces 48 h tombent un samedi ou un
// dimanche (l'office est fermé : un rendez-vous du lundi ou du mardi tôt serait proposé trop tard) : alors le vendredi précédent à 17 h
// (étude 24/10 : « oui » à une avance le vendredi 17 h).
function debutVeilleSignature(debut) {
  const t = new Date(debut.getTime() - HEURES_VEILLE_SIGNATURE * 3600 * 1000);
  const jour = t.getDay();
  if (jour !== 6 && jour !== 0) return t;
  const vendredi = new Date(t.getTime());
  vendredi.setDate(vendredi.getDate() - (jour === 6 ? 1 : 2));
  vendredi.setHours(17, 0, 0, 0);
  return vendredi;
}

// Pure : la fiche est-elle « due » — rendez-vous dans les 48 prochaines heures, ou dès le vendredi 17 h si ces 48 h tombent un week-end (et pas encore passé), vente non archivée et pas déjà signée.
// Jamais pour une succession (autre déroulé, pas de conditions de vente).
function veilleSignatureDue(d, maintenant) {
  if (!d || d.archive || estSuccession(d) || signatureFaiteSuivi(d)) return false;
  const r = instantsSignatureVeille(d);
  if (!r) return false;
  const t = (maintenant || new Date()).getTime();
  return t >= debutVeilleSignature(r.debut).getTime() && t <= r.fin.getTime();
}

// Pure : la fiche de signature reste-t-elle à imprimer (tâche « Imprimer la fiche dossier » d'« À faire », étude 24/10) — due, et pas déjà
// téléchargée pour CE rendez-vous (un rendez-vous déplacé la redemande). `aujourdhuiIso` = jour de référence (le jour même : l'heure réelle).
function ficheSignatureAImprimer(d, aujourdhuiIso) {
  const maintenant = !aujourdhuiIso || aujourdhuiIso === isoAujourdhuiLocal() ? new Date() : new Date(`${aujourdhuiIso}T12:00:00`);
  return veilleSignatureDue(d, maintenant) && d.ficheSignatureImprimeePour !== cleVeilleSignature(d);
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
    .filter(d => d && d.responsable === utilisateur && veilleSignatureDue(d, maintenant) && !deja.has(cleVeilleSignature(d)) && d.ficheSignatureImprimeePour !== cleVeilleSignature(d))
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
    const manquantes = checklistPieces(d.typeVente, d).filter(p => p.cle !== 'renonciationPreemption' && p.cle !== 'perso-safer' && pieces[p.cle] !== 'recue').map(p => p.label).concat(analyse.documents);
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
    // Ancien modèle (fiche imprimée de CLAIRE, imprimerFiche) : tuiles d'échéances, pièces à réclamer, engagements, procédure des fonds.
    cases: casesFicheImprimee(d),
    docs: ((d.analyseJuridique && d.analyseJuridique.documents) || []).map(x => typeof x === 'string' ? x : x.label).filter(Boolean),
    engagements: ((d.analyseJuridique && d.analyseJuridique.engagements) || []).map(x => typeof x === 'string' ? x : x.phrase).filter(Boolean).map(x => x.length > 140 ? x.slice(0, 140) + '…' : x),
    etapes: etatProcedureFonds(d).map((e, i) => Object.assign({ num: i + 1, lead: PROCEDURE_FONDS[i].lead.toUpperCase(), suite: PROCEDURE_FONDS[i].suite }, e)),
    achatComptant: !!d.sansPret,
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

// Pure : des segments de texte { t, cle } (cle = police) coupés en lignes d'au plus `largeur` points ; `mesurer(texte, cle)` rend la largeur.
// Chaque ligne est une liste de segments (un mot par segment, espaces comprises) prêts à être écrits à la suite.
function lignesRunsVeille(runs, largeur, mesurer) {
  const lignes = [];
  let courante = [];
  let l = 0;
  (runs || []).forEach(run => {
    String(run.t || '').split(/(\s+)/).filter(Boolean).forEach(morceau => {
      const espace = /^\s+$/.test(morceau);
      const texte = espace ? ' ' : morceau;
      const w = mesurer(texte, run.cle);
      if (!espace && courante.length && l + w > largeur) {
        while (courante.length && /^ $/.test(courante[courante.length - 1].t)) courante.pop();
        lignes.push(courante);
        courante = [];
        l = 0;
      }
      if (espace && !courante.length) return;
      courante.push({ t: texte, cle: run.cle, l: w });
      l += w;
    });
  });
  while (courante.length && /^ $/.test(courante[courante.length - 1].t)) courante.pop();
  if (courante.length) lignes.push(courante);
  return lignes;
}

// ---- Le PDF : le modèle de la fiche imprimée de CLAIRE (imprimerFiche), en A4 portrait ----

var MISE_EN_PAGE_VEILLE = { largeur: 595.28, hauteur: 841.89, gauche: 31, droite: 564.28, haut: 26, bas: 786, ecart: 11.3 };
var COULEURS_VEILLE = { marine: '16233C', texte: '1A1A1A', gris: '555555', filet: 'DDDDDD', vert: '1F6B45', fondCarte: 'FAFAFA' };

// Pure : le tracé SVG d'un rectangle à coins arrondis (origine en haut à gauche, y vers le bas — pdf-lib drawSvgPath).
function traceRectArrondiVeille(w, h, r) {
  return `M ${r} 0 H ${w - r} A ${r} ${r} 0 0 1 ${w} ${r} V ${h - r} A ${r} ${r} 0 0 1 ${w - r} ${h} H ${r} A ${r} ${r} 0 0 1 0 ${h - r} V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`;
}

// La page A4. `lib` = pdf-lib (+ fontkit, injectable pour un essai hors navigateur), `polices` = octets de chargerOutilsPdfA, `maintenant` = date d'édition.
async function composerPdfVeilleSignature(fiche, lib, polices, maintenant) {
  const { PDFDocument, rgb } = lib;
  const doc = await PDFDocument.create();
  doc.registerFontkit(lib.fontkit);
  const sansLigatures = { liga: false, clig: false, dlig: false, calt: false };
  const f = {
    sans: await doc.embedFont(polices.sans, { subset: false, features: sansLigatures }),
    gras: await doc.embedFont(polices.sansGras, { subset: false, features: sansLigatures })
  };
  const jeux = {};
  Object.keys(f).forEach(cle => { jeux[cle] = new Set(f[cle].getCharacterSet()); });
  const propre = (t, cle) => texteImprimablePdfA(t, cp => jeux[cle].has(cp));
  const M = MISE_EN_PAGE_VEILLE;
  const H = M.hauteur;
  const largeurUtile = M.droite - M.gauche;
  const hex = (h) => rgb(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255);
  const C = {};
  Object.keys(COULEURS_VEILLE).forEach(cle => { C[cle] = hex(COULEURS_VEILLE[cle]); });
  let page = null;
  const nouvellePage = () => { page = doc.addPage([M.largeur, H]); };
  // Coordonnées « depuis le haut » ; `droite` aligne le texte sur son bord droit.
  const ecrire = (texte, x, yHaut, cle, taille, couleur, droite) => {
    const s = propre(texte, cle);
    if (!s) return 0;
    const l = f[cle].widthOfTextAtSize(s, taille);
    page.drawText(s, { x: droite ? x - l : x, y: H - yHaut - taille * 0.8, size: taille, font: f[cle], color: couleur || C.texte });
    return l;
  };
  const mesurerRun = (taille) => (t, cle) => f[cle].widthOfTextAtSize(propre(t, cle), taille);
  const trait = (x1, y1, x2, y2, epaisseur, couleur, rond) => page.drawLine({ start: { x: x1, y: H - y1 }, end: { x: x2, y: H - y2 }, thickness: epaisseur, color: couleur, lineCap: rond ? 1 : 0 });
  const rect = (x, yHaut, w, h, remplissage, bord, epaisseur, rayon) => page.drawSvgPath(traceRectArrondiVeille(w, h, rayon == null ? 5.7 : rayon), Object.assign({ x, y: H - yHaut, color: remplissage }, bord ? { borderColor: bord, borderWidth: epaisseur || 0.6 } : {}));
  // Des lignes de segments écrites à partir de (x, yHaut) ; rend la hauteur occupée.
  const ecrireLignes = (lignes, x, yHaut, taille, interligne, couleur) => {
    lignes.forEach((ligne, i) => {
      let cx = x;
      ligne.forEach(seg => { cx += ecrire(seg.t, cx, yHaut + i * interligne, seg.cle, taille, couleur); });
    });
    return lignes.length * interligne;
  };
  // La grande case : cochée (coche verte plus grande que la case) ou vide.
  const grandeCase = (x, yHaut, t, fait) => {
    page.drawRectangle({ x, y: H - yHaut - t, width: t, height: t, borderColor: fait ? C.vert : C.marine, borderWidth: 1.8, color: rgb(1, 1, 1) });
    if (fait) {
      trait(x + t * 0.2, yHaut + t * 0.58, x + t * 0.43, yHaut + t * 0.82, t * 0.16, C.vert, true);
      trait(x + t * 0.43, yHaut + t * 0.82, x + t * 1.1, yHaut + t * 0.02, t * 0.16, C.vert, true);
    }
  };

  nouvellePage();
  // En-tête : le dossier, le responsable et la date d'édition, sous un trait marine.
  let tailleTitre = 19;
  const meta = [fiche.responsable ? 'Responsable : ' + fiche.responsable : '', fiche.achatComptant ? 'Achat comptant' : '', 'Édité le ' + maintenant.toLocaleDateString('fr-FR')].filter(Boolean).join(' · ');
  const largeurMeta = f.sans.widthOfTextAtSize(propre(meta, 'sans'), 8.5);
  while (tailleTitre > 12 && f.gras.widthOfTextAtSize(propre(fiche.dossier, 'gras'), tailleTitre) > largeurUtile - largeurMeta - 16) tailleTitre -= 1;
  ecrire(fiche.dossier, M.gauche, M.haut, 'gras', tailleTitre, C.marine);
  ecrire(meta, M.droite, M.haut + tailleTitre - 9, 'sans', 8.5, C.gris, true);
  trait(M.gauche, M.haut + tailleTitre + 5, M.droite, M.haut + tailleTitre + 5, 1.5, C.marine, false);
  let y = M.haut + tailleTitre + 16;

  // 1 · Échéances et points de vigilance : une tuile par échéance, quatre par ligne.
  ecrire('1 · Échéances et points de vigilance', M.gauche, y, 'gras', 12, C.marine);
  y += 20;
  if (!fiche.cases.length) {
    ecrire('Aucune échéance enregistrée.', M.gauche, y, 'sans', 9, C.gris);
    y += 16;
  } else {
    const gap = 6, wTuile = (largeurUtile - 3 * gap) / 4, hTuile = 40;
    fiche.cases.forEach((c, i) => {
      const col = i % 4;
      if (i && !col) y += hTuile + gap;
      const t = TEINTES_FICHE_IMPRIMEE[c.cls] || TEINTES_FICHE_IMPRIMEE.autre;
      const x = M.gauche + col * (wTuile + gap);
      rect(x, y, wTuile, hTuile, hex(t.fond.slice(1)), null, 0, 5.7);
      page.drawRectangle({ x, y: H - y - hTuile, width: 2.8, height: hTuile, color: hex(t.barre.slice(1)) });
      const label = c.cls === 'rendezVous' && fiche.heureTexte ? `${c.label} · ${fiche.heureTexte}` : c.label;
      const lignesLabel = lignesRunsVeille([{ t: label, cle: 'sans' }], wTuile - 16, mesurerRun(7.8)).slice(0, 2);
      ecrireLignes(lignesLabel, x + 9, y + 5, 7.8, 9, C.gris);
      ecrire(formatDateFr(c.date), x + 9, y + 5 + lignesLabel.length * 9 + 2, 'gras', 12, C.texte);
    });
    y += hTuile + 14;
  }

  // Pièces à réclamer au vendeur / Engagements du vendeur : deux encadrés côte à côte.
  const wBoite = (largeurUtile - M.ecart) / 2;
  const boite = (titre, items, vide, x, fond, bord) => {
    const maxHauteur = 118;
    let hauteur = 30;
    const traces = [];
    items.every((it, i) => {
      const lignes = lignesRunsVeille([{ t: it, cle: 'sans' }], wBoite - 36, mesurerRun(8.6));
      if (hauteur + lignes.length * 10.4 + 2 > maxHauteur) { traces.push({ reste: items.length - i }); return false; }
      traces.push({ lignes, y: hauteur });
      hauteur += lignes.length * 10.4 + 2;
      return true;
    });
    return { titre, x, fond, bord, vide, traces, hauteur: items.length ? hauteur + (traces.some(t => t.reste) ? 12 : 0) + 4 : 40 };
  };
  const boites = [
    boite('Pièces à réclamer au vendeur', fiche.docs, 'Aucune pièce identifiée.', M.gauche, 'F0F7F4', 'BFE0D2'),
    boite('Engagements du vendeur', fiche.engagements, 'Aucun engagement relevé.', M.gauche + wBoite + M.ecart, 'EEF3FA', 'C6D9EE')
  ];
  const hBoites = Math.max(boites[0].hauteur, boites[1].hauteur);
  boites.forEach(b => {
    rect(b.x, y, wBoite, hBoites, hex(b.fond), hex(b.bord), 0.7, 5.7);
    ecrire(b.titre, b.x + 10, y + 8, 'gras', 11, C.marine);
    if (!b.traces.length) ecrire(b.vide, b.x + 10, y + 28, 'sans', 8.6, C.gris);
    let yReste = y + 30;
    b.traces.forEach(t => {
      if (t.reste) { ecrire(`… et ${t.reste} autre${t.reste > 1 ? 's' : ''}`, b.x + 22, yReste, 'sans', 8.6, C.gris); return; }
      ecrire('•', b.x + 12, y + t.y, 'sans', 8.6, C.texte);
      ecrireLignes(t.lignes, b.x + 22, y + t.y, 8.6, 10.4, C.texte);
      yReste = y + t.y + t.lignes.length * 10.4 + 2;
    });
  });
  y += hBoites + 14;

  // 2 · Procédure des appels et de la réception des fonds : neuf étapes en deux colonnes, chacune avec sa grande case et sa date en gros.
  const l2 = ecrire('2 · Procédure — Appels et réception des fonds', M.gauche, y, 'gras', 12, C.marine);
  ecrire(`(cochée d’après CLAIRE le ${maintenant.toLocaleDateString('fr-FR')}, à compléter au fil du dossier)`, M.gauche + l2 + 8, y + 4, 'sans', 7, C.gris);
  y += 20;
  const tailleCase = 16;
  const carte = (e) => {
    const lignes = lignesRunsVeille([{ t: e.lead, cle: 'gras' }, { t: e.suite, cle: 'sans' }], wBoite - 52, mesurerRun(8.8));
    const note = e.note ? lignesRunsVeille([{ t: e.note, cle: 'sans' }], wBoite - 52, mesurerRun(8)) : [];
    return { e, lignes, note, hauteur: 10 + lignes.length * 10.8 + (note.length ? note.length * 9.6 + 3 : 0) + 6 + tailleCase + 8 };
  };
  const cartes = fiche.etapes.map(carte);
  for (let i = 0; i < cartes.length; i += 2) {
    const rangee = cartes.slice(i, i + 2);
    const h = Math.max(...rangee.map(c => c.hauteur));
    if (y + h > M.bas - 30) { nouvellePage(); y = M.haut; }
    rangee.forEach((c, j) => {
      const x = M.gauche + j * (wBoite + M.ecart);
      rect(x, y, wBoite, h, hex(COULEURS_VEILLE.fondCarte), hex(COULEURS_VEILLE.filet), 0.6, 5.7);
      // Pastille numérotée à gauche, texte en retrait.
      page.drawCircle({ x: x + 17, y: H - y - 17, size: 8.5, color: C.marine });
      const num = String(c.e.num);
      ecrire(num, x + 17 - f.gras.widthOfTextAtSize(num, 8.5) / 2, y + 17 - 8.5 * 0.4 - 3.4, 'gras', 8.5, rgb(1, 1, 1));
      const yt = y + 10;
      const bas = ecrireLignes(c.lignes, x + 33, yt, 8.8, 10.8, C.texte);
      if (c.note.length) ecrireLignes(c.note, x + 33, yt + bas + 1, 8, 9.6, C.marine);
      const yFait = y + h - tailleCase - 8;
      grandeCase(x + 33, yFait, tailleCase, c.e.fait);
      const xFait = x + 33 + tailleCase + 7;
      const lFait = ecrire(c.e.fait ? 'Fait' + (c.e.date ? ' le' : '') : 'Fait le', xFait, yFait + 3.5, 'sans', 9, c.e.fait ? C.vert : C.gris);
      if (c.e.fait && c.e.date) ecrire(dateCourteVeille(c.e.date), xFait + lFait + 5, yFait + 2.2, 'gras', 11, C.vert);
      else if (!c.e.fait) trait(xFait + lFait + 5, yFait + tailleCase - 2, xFait + lFait + 85, yFait + tailleCase - 2, 0.6, hex('999999'), false);
    });
    y += h + 6;
  }

  // Pied : le règlement de l'étude, puis l'instant de l'édition (l'état du dossier change).
  const yPied = Math.max(y + 4, M.bas - 24);
  trait(M.gauche, yPied, M.droite, yPied, 0.6, hex('999999'), false);
  const reglement = lignesRunsVeille([{ t: 'Les procédures écrites sont des règlements de l’entreprise. En cas de non-respect (non validé par le notaire), des sanctions disciplinaires peuvent être prononcées. · Dates issues d’une lecture automatique du compromis : à vérifier avant usage. · Fiche éditée par CLAIRE le ' + maintenant.toLocaleDateString('fr-FR') + ' à ' + maintenant.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) + ' — état du dossier à cet instant.', cle: 'sans' }], largeurUtile, mesurerRun(6.8));
  ecrireLignes(reglement, M.gauche, yPied + 3, 6.8, 8.4, C.gris);

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
    // Téléchargée pour CE rendez-vous : la tâche « Imprimer la fiche dossier » d'« À faire » et le pop-up ne reviennent pas.
    d.ficheSignatureImprimeeLe = isoAujourdhuiLocal();
    d.ficheSignatureImprimeePour = cleVeilleSignature(d);
    ajouterHistorique(d, 'Fiche de signature téléchargée pour impression');
    sauvegarder(d);
    render();
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
  // joursEntre compte les bornes comprises : 1 = le même jour.
  const jours = joursEntre(isoLocalDepuisDate(maintenant), r.iso) - 1;
  const quand = jours <= 0 ? 'aujourd’hui' : (jours === 1 ? 'demain' : `${dateAvecJourFr(r.iso)}`);
  return r.heure ? `${quand} à ${heureEmail(r.heure).replace('h', ' h ').trim()}` : quand;
}

function renderVeilleSignature(liste, maintenant, depuisFiche) {
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
            ${depuisFiche ? '' : `<wa-button variant="brand" size="s" type="button" onclick="ouvrirFicheDossierVeilleSignature('${escapeOnclickArg(d.id)}')">${icone('folder')}Ouvrir la fiche du dossier</wa-button>`}
            <wa-button ${depuisFiche ? 'variant="brand"' : 'appearance="outlined"'} size="s" type="button" onclick="telechargerFicheSignature('${escapeOnclickArg(d.id)}')">${icone('download')}Télécharger la fiche (PDF)</wa-button>
          </div>
        </div>`;
      }).join('')}
    </div>
    <div class="confirm-actions"><wa-button appearance="outlined" type="button" onclick="fermerVeilleSignature()">Fermer</wa-button></div>`;
}

// Le pop-up mène à la fiche du dossier (onglet Dossier, où se trouve « Fiche de signature » dans la ligne « Outils ») — étude 24/10.
function ouvrirFicheDossierVeilleSignature(id) {
  fermerVeilleSignature();
  ouvrirDossierDepuisDashboard(id);
  definirOngletFiche('dossier');
}

function fermerVeilleSignature() {
  const overlay = document.getElementById('veille-signature-overlay');
  if (overlay) overlay.style.display = 'none';
  // Fermer vaut « vu » : le pop-up ne revient pas pour ce rendez-vous (la fiche reste dans l'onglet Dossier).
  veilleSignatureAffichee.forEach(noteVeilleSignatureVue);
  veilleSignatureAffichee = [];
}

// Une saisie, une fenêtre ou un autre pop-up ouvert : pas de pop-up par-dessus le travail en cours. À l'ouverture d'une fiche (`sansSaisie`),
// le clic qui l'ouvre vient d'avoir lieu : seules les fenêtres déjà ouvertes comptent.
function posteOccupeVeilleSignature(sansSaisie) {
  const a = document.activeElement;
  if (!sansSaisie && a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) return true;
  return Array.from(document.querySelectorAll('.confirm-overlay')).some(o => o.style.display && o.style.display !== 'none');
}

// Affiche le pop-up pour ces dossiers et les compte « vus » AUSSITÔT : il ne se propose qu'une fois par rendez-vous.
function afficherVeilleSignature(liste, maintenant, depuisFiche) {
  const overlay = document.getElementById('veille-signature-overlay');
  if (!overlay || !liste.length) return;
  veilleSignatureAffichee = liste;
  renderVeilleSignature(liste, maintenant, depuisFiche);
  overlay.style.display = 'flex';
  liste.forEach(noteVeilleSignatureVue);
}

// À l'ouverture de CLAIRE : les fiches des dossiers du collaborateur dont le rendez-vous est dans les 48 h (ou dès le vendredi 17 h).
function verifierVeilleSignature() {
  if (!utilisateurPoste || posteOccupeVeilleSignature(false)) return;
  const maintenant = new Date();
  afficherVeilleSignature(dossiersVeilleSignature(dossiers, utilisateurPoste, maintenant, veillesSignatureVues()), maintenant, false);
}

// À l'ouverture de la fiche d'un dossier : la sienne seulement, si elle est due et pas encore proposée.
function proposerVeilleSignatureFiche(id) {
  if (!utilisateurPoste || posteOccupeVeilleSignature(true)) return;
  const d = (Array.isArray(dossiers) ? dossiers : []).find(x => x && x.id === id);
  if (!d) return;
  const maintenant = new Date();
  afficherVeilleSignature(dossiersVeilleSignature([d], utilisateurPoste, maintenant, veillesSignatureVues()), maintenant, true);
}
