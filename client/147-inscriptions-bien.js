// Inscriptions du bien vendu (étude 30/10 : « ne pas afficher toute la liste des annexes d'Authentic et la liste de toutes les inscriptions,
// seulement celles liées au bien vendu ; les afficher dans Analyse, nouvelle carte sous l'analyse de l'avant-contrat, et permettre de les
// supprimer à la main s'il y a une erreur » ; puis : « dans la carte Authentic, ne plus tout afficher ; mettre un bouton de lecture dans la
// carte »). L'état hypothécaire relu (client/136, `d.etatHypothecaire`) porte, pour chaque inscription, les parcelles de sa colonne
// « Immeuble(s) » (commun/etat-hypothecaire.js `parcellesInscription`) : elle est gardée si une parcelle est celle du bien vendu
// (`parcellesDossier`), « à vérifier » si aucune parcelle n'a été lue, cachée sinon (un autre bien du vendeur). Retirer = de la fiche CLAIRE
// seulement (`d.etatHypothecaire.retirees`), jamais rien dans Authentic ; « Annuler » le rend.

// Pure : la clé stable d'une inscription (référence d'enliassement, sinon nature + dépôt + créancier — jamais la page, qui change d'un état à
// l'autre).
function cleInscriptionEH(x) {
  return String((x && (x.reference || `${x.nature || ''}|${x.dateDepot || ''}|${x.creancier || ''}`)) || '');
}

// Pure : la clé « de contenu » d'une inscription (nature + dépôt + créancier), gardée aussi à la suppression : une relecture de l'état qui lit
// autrement la référence d'enliassement (OCR) ne remet pas sur la fiche une inscription retirée à la main (retour de l'étude 30/10).
function cleContenuInscriptionEH(x) {
  return x && (x.nature || x.dateDepot || x.creancier) ? `contenu:${x.nature || ''}|${x.dateDepot || ''}|${x.creancier || ''}` : '';
}

// Pure : les inscriptions EN COURS qui comptent pour ce dossier (celles du bien et celles à vérifier, hors retirées) — l'alerte de l'en-tête
// de la fiche et ce que lit l'agent passent par là (relecture 0.405.0).
function inscriptionsEnCoursDuBien(d) {
  const r = inscriptionsDuBien(d);
  return r.liees.concat(r.aVerifier).filter(x => x.etat === 'en_cours');
}

// Pure : les inscriptions à montrer sur la fiche — { liees, aVerifier, autres } (autres = d'un autre bien, jamais montrées), hors retirées.
function inscriptionsDuBien(d) {
  const e = d && d.etatHypothecaire;
  const vide = { liees: [], aVerifier: [], autres: [] };
  if (!e || !Array.isArray(e.inscriptions)) return vide;
  const retirees = new Set(Array.isArray(e.retirees) ? e.retirees : []);
  // Zéros de tête retirés de la section (« 0A » → « A ») comme du numéro (relecture 0.405.0).
  const norm = (p) => `${String(p.section || '').toUpperCase().trim().replace(/^0+(?=[A-Z])/, '')}|${String(p.numero || '').replace(/^0+(?=\d)/, '').trim()}`;
  const duBien = new Set((typeof parcellesDossier === 'function' ? parcellesDossier(d) : []).map(norm));
  return e.inscriptions.reduce((r, x) => {
    if (!x || retirees.has(cleInscriptionEH(x)) || (cleContenuInscriptionEH(x) && retirees.has(cleContenuInscriptionEH(x)))) return r;
    const parcelles = Array.isArray(x.parcelles) ? x.parcelles : [];
    if (!parcelles.length || !duBien.size) r.aVerifier.push(x);
    else if (parcelles.some(p => duBien.has(norm(p)))) r.liees.push(x);
    else r.autres.push(x);
    return r;
  }, vide);
}

// Pure : les pièces de mainlevée (« Décompte de remboursement — X », « Accord de mainlevée — X ») qui tombent avec une inscription retirée —
// pas encore reçues, et aucune autre inscription en cours du bien chez le même créancier (relecture 0.405.0).
function piecesMainleveeRetirees(d, x) {
  const creancier = (x && x.creancier) || 'créancier à identifier';
  if (inscriptionsEnCoursDuBien(d).some(y => y !== x && (y.creancier || 'créancier à identifier') === creancier)) return [];
  return (d.piecesPersonnalisees || []).filter(p => p && (p.label === `Décompte de remboursement — ${creancier}` || p.label === `Accord de mainlevée — ${creancier}`)
    && !(d.pieces && d.pieces[p.cle] === 'recue'));
}

// Retire une inscription de la fiche (rien dans Authentic) et ses pièces de mainlevée pas encore reçues ; rend { retiree, pieces } ou null.
function retirerInscriptionDossier(d, cle) {
  const e = d && d.etatHypothecaire;
  const x = e && Array.isArray(e.inscriptions) ? e.inscriptions.find(y => cleInscriptionEH(y) === cle) : null;
  if (!x) return null;
  const pieces = piecesMainleveeRetirees(d, x);
  const contenu = cleContenuInscriptionEH(x);
  e.retirees = (Array.isArray(e.retirees) ? e.retirees : []).filter(y => y !== cle && y !== contenu).concat(cle, contenu || []);
  if (pieces.length) d.piecesPersonnalisees = d.piecesPersonnalisees.filter(p => !pieces.includes(p));
  ajouterHistorique(d, `Inscription retirée de la fiche (erreur de lecture)${pieces.length ? `, ${pieces.length} pièce(s) de mainlevée retirée(s)` : ''} — rien n’est changé dans Authentic`);
  return { retiree: x, pieces };
}

function retirerInscriptionFiche(dossierId, cle) {
  const d = dossiers.find(x => x.id === dossierId);
  if (!d) return;
  const r = retirerInscriptionDossier(d, cle);
  if (!r) return;
  sauvegarder(d);
  render();
  afficherToast('Inscription retirée de la fiche.', 'Annuler', () => {
    const d2 = dossiers.find(x => x.id === dossierId);
    if (!d2 || !d2.etatHypothecaire) return;
    d2.etatHypothecaire.retirees = (d2.etatHypothecaire.retirees || []).filter(x => x !== cle && x !== cleContenuInscriptionEH(r.retiree));
    d2.piecesPersonnalisees = (d2.piecesPersonnalisees || []).concat(r.pieces.filter(p => !(d2.piecesPersonnalisees || []).some(q => q.cle === p.cle)));
    ajouterHistorique(d2, 'Inscription remise sur la fiche');
    sauvegarder(d2);
    render();
  });
}

// Les états hypothécaires vus dans la GED d'Authentic (instantané du sous-dossier, client/133) : la pièce à lire.
function piecesEtatAuthenticDossier(d) {
  const inst = typeof instantanesAuthenticAT === 'object' && instantanesAuthenticAT[d.id];
  if (!inst && typeof chargerInstantaneAuthenticAT === 'function') chargerInstantaneAuthenticAT(d.id);
  const pieces = (inst && inst.inst && inst.inst.sousDossier && inst.inst.sousDossier.pieces) || [];
  // L'état-réponse (ANF) d'abord, comme l'agent (client/137).
  return (typeof pieceEstEtatHypothecaire === 'function' ? pieces.filter(p => pieceEstEtatHypothecaire(p)) : [])
    .sort((a, b) => (/etat\s*r[ée]?\s*ponse|anf/i.test(b.nom) ? 1 : 0) - (/etat\s*r[ée]?\s*ponse|anf/i.test(a.nom) ? 1 : 0));
}

// La carte de l'onglet « Pièces et analyse », sous l'analyse de l'avant-contrat. Rien quand il n'y a ni état lu ni état dans Authentic.
function renderInscriptionsBienFiche(d) {
  if (!d || estSuccession(d)) return '';
  const e = d.etatHypothecaire;
  const etats = piecesEtatAuthenticDossier(d);
  if (!(e && Array.isArray(e.inscriptions)) && !etats.length) return '';
  const r = inscriptionsDuBien(d);
  const idj = escapeOnclickArg(d.id);
  const date = (x) => (x ? formatDateFr(x) : '');
  const ligne = (x, classe) => `<li class="eh-ligne ${classe}"><span class="eh-nature">${escapeHtml(x.nature || 'Inscription')}</span>
    <span class="eh-detail">${escapeHtml([x.creancier || 'créancier à vérifier', x.montant, x.dateDepot ? 'déposée le ' + date(x.dateDepot) : '', x.reference,
      x.dateExtremeEffet ? (x.etat === 'perimee' ? 'périmée le ' : 'effet jusqu’au ') + date(x.dateExtremeEffet) : 'date extrême d’effet à vérifier',
      x.etat === 'radiee' ? 'radiée' : x.radiation === 'partielle' ? 'radiation partielle' : '',
      (x.parcelles || []).length ? 'parcelle' + (x.parcelles.length > 1 ? 's ' : ' ') + x.parcelles.map(p => `${p.section} ${p.numero}`).join(', ') : 'parcelle non lue',
      'p. ' + x.page].filter(Boolean).join(' · '))}</span>
    <wa-button appearance="plain" size="s" class="bouton-icone" type="button" onclick="retirerInscriptionFiche('${idj}', '${escapeOnclickArg(cleInscriptionEH(x))}')" title="Retirer de la fiche (erreur) — rien n’est changé dans Authentic" aria-label="Retirer de la fiche">${icone('x')}</wa-button></li>`;
  const montrees = r.liees.concat(r.aVerifier);
  const enCours = montrees.filter(x => x.etat === 'en_cours');
  const passees = montrees.filter(x => x.etat !== 'en_cours');
  const piece = etats[0];
  const lire = piece ? `<wa-button appearance="outlined" size="s" type="button" onclick="lireEhfDepuisFiche('${idj}')" title="CLAIRE ouvre l’état dans Authentic et relève les inscriptions (une minute environ)">${e ? 'Relire l’état' : 'Lire l’état hypothécaire'}</wa-button>
    <wa-button appearance="plain" size="s" class="bouton-icone" type="button" onclick="ouvrirPieceAuthenticAT('${idj}', '${escapeOnclickArg(piece.pjId)}')" title="Ouvrir l’état (PDF lu dans Authentic, une minute environ)" aria-label="Ouvrir l’état">${icone('file-text')}</wa-button>` : '';
  const corps = !e ? '<p class="fiche-vide">L’état hypothécaire est dans Authentic, pas encore lu.</p>'
    : `${!lectureEtatComplete(e) ? '<p class="eh-alerte">Lecture incomplète : relevé à vérifier par le notaire.</p>' : ''}
      ${enCours.length ? `<ul class="at-liste">${enCours.map(x => ligne(x, r.aVerifier.includes(x) ? 'eh-en-cours eh-a-verifier' : 'eh-en-cours')).join('')}</ul>`
        : lectureEtatComplete(e) ? `<p class="eh-ok">Aucune inscription en cours sur le bien vendu${e.facesStock ? ' (relevé depuis 2002)' : ''}.</p>` : ''}
      ${r.aVerifier.length ? `<p class="eh-note">${!(typeof parcellesDossier === 'function' && parcellesDossier(d).length) ? 'Parcelles du bien vendu non connues sur la fiche : toutes les inscriptions sont montrées, à vérifier.' : `${r.aVerifier.length} inscription${r.aVerifier.length > 1 ? 's' : ''} sans parcelle lue : à rattacher au bien par le notaire.`}</p>` : ''}
      ${passees.length ? `<details class="eh-autres"><summary>${passees.length} radiée${passees.length > 1 ? 's' : ''} ou périmée${passees.length > 1 ? 's' : ''}</summary><ul class="at-liste">${passees.map(x => ligne(x, 'eh-passee')).join('')}</ul></details>` : ''}
      ${r.autres.length ? `<p class="eh-note">${r.autres.length} inscription${r.autres.length > 1 ? 's' : ''} sur d’autres biens du vendeur, non montrée${r.autres.length > 1 ? 's' : ''}.</p>` : ''}
      ${e.facesStock ? `<p class="eh-note">Fiches d’avant 2002 à relire par le notaire.</p>` : ''}`;
  return `<div class="pieces-dossier bloc-fiche inscriptions-bien">
    ${enteteBlocFiche('file-text', 'Inscriptions sur le bien vendu', infoBulle('Relevées par CLAIRE dans l’état hypothécaire d’Authentic : seules celles dont la parcelle est une parcelle du bien vendu (et celles dont la parcelle n’a pas été lue). La croix retire une erreur de la fiche ; rien n’est changé dans Authentic. Le notaire garde l’analyse juridique.'), enCours.length ? `<span class="pieces-compteur">${enCours.length}</span>` : '')}
    <div class="bloc-fiche-corps">${lire ? `<div class="inscriptions-actions">${lire}</div>` : ''}${corps}</div>
  </div>`;
}
