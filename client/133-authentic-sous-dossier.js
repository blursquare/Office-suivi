// CLAIRE dans Authentic, étape 3 : le SOUS-DOSSIER d'Authentic sur la fiche (plan validé par l'étude le 27/10). D'après l'instantané calculé
// par le serveur sur les pages gardées (commun/authentic-modele.js, GET /api/authentic/dossier/:id/instantane) : le statut du sous-dossier
// (« Préparation définitive », « Signé », « Sans suite »… et sa date), puis les formalités préalables, les actes et les formalités
// postérieures avec leur badge (APR, ECV, T@, ACT, MIC, SPR, BRI, CJN), leur état et leurs dates — dans le panneau « Authentic » de l'onglet
// Dossier. Le Suivi signale un dossier « Sans suite » dans Authentic (GET /api/authentic/statuts). Rien n'est écrit sur la fiche ni dans
// Authentic : c'est une lecture de ce qu'Authentic montre, à jour à la dernière page relevée.

var instantanesAuthenticAT = {};   // dossierId → { t, inst, enCours }
var statutsAuthenticAT = {};       // dossierId → { statut, le, luLe }
var DUREE_INSTANTANE_AT_MS = 60 * 1000;
var LIBELLES_BADGES_AT = { APR: 'Acte préparatoire', ECV: 'État civil', 'T@': 'Télé@ctes', ACT: 'Acte', MIC: 'Copie MICEN', SPR: 'Publicité foncière', BRI: 'Références immobilières', CJN: 'Casier judiciaire' };

async function chargerInstantaneAuthenticAT(id) {
  const e = instantanesAuthenticAT[id] || (instantanesAuthenticAT[id] = { t: 0, inst: null, enCours: false });
  if (e.enCours || typeof fetchAvecAuth !== 'function') return;
  e.enCours = true;
  try {
    const r = await fetchAvecAuth(`/api/authentic/dossier/${encodeURIComponent(id)}/instantane`);
    if (!r.ok) return;
    const j = await r.json();
    const avant = JSON.stringify(e.inst);
    e.inst = j.instantane || null;
    // Redessiné seulement si quelque chose a changé (jamais de boucle de rendu).
    if (JSON.stringify(e.inst) !== avant) render();
    // Un acte de naissance dans les pièces jointes d'Authentic : lu une fois, dit dans la discussion (étude 28/10, client/141).
    if (typeof planifierLecturesAuthentic === 'function') planifierLecturesAuthentic(dossiers.find(x => x && x.id === id));
  } catch (err) { /* serveur injoignable : relu au prochain rendu */ } finally { e.t = Date.now(); e.enCours = false; }
}

async function chargerStatutsAuthenticAT() {
  if (typeof fetchAvecAuth !== 'function') return;
  try {
    const r = await fetchAvecAuth('/api/authentic/statuts');
    if (!r.ok) return;
    const j = await r.json();
    const avant = JSON.stringify(statutsAuthenticAT);
    statutsAuthenticAT = (j && j.statuts) || {};
    if (JSON.stringify(statutsAuthenticAT) !== avant && typeof ongletActuel !== 'undefined' && ongletActuel === 'suivi') render();
  } catch (err) { /* relu dans 5 minutes */ }
}

// Pure : la classe de couleur d'un statut de sous-dossier (couleurs des badges d'Authentic, relevées par l'étude le 05/10).
function classeStatutSousDossierAT(statut) {
  return { 'Signé': 'dl-success', 'Sans suite': 'dl-alerte', 'Préparation définitive': 'dl-acte', 'Préparation projet': 'dl-acte', 'Demande de pièces': 'dl-pret', 'En attente': 'dl-pret', 'Réception des pièces': 'dl-pret' }[statut] || 'dl-neutre';
}

// Pure : ce que l'aperçu de la formalité ajoute (étape 4 : dates Créée / Envoyée / Reçue, signature, n° de répertoire, n° chrono, réponse).
function detailsApercuAT(f) {
  const j = (iso) => formatDateFr(iso);
  return [f.creeLe && `créée le ${j(f.creeLe)}`, f.envoyeLe && `envoyée le ${j(f.envoyeLe)}`, f.recuLe && `reçue le ${j(f.recuLe)}`,
    f.situation && f.situation !== f.statut && f.situation, f.signeLe && `signé le ${j(f.signeLe)}`, f.numeroRepertoire && `répertoire n° ${f.numeroRepertoire}`,
    f.numeroChrono && `chrono n° ${f.numeroChrono}`, f.reponse].filter(Boolean);
}

// Pure : une formalité en une ligne (badge, libellé, état, dernière date), et dessous ce que dit son aperçu.
function htmlLigneFormaliteAT(f) {
  const date = (f.signeLe || (f.dates || []).slice(-1)[0] || '');
  const details = detailsApercuAT(f);
  return `<li class="at-ligne"><span class="at-badge at-${escapeAttr(String(f.badge).replace('@', 'a'))}" title="${escapeAttr(LIBELLES_BADGES_AT[f.badge] || f.badge)}">${escapeHtml(f.badge)}</span>
    <span class="at-libelle">${escapeHtml(f.libelle)}</span>${f.statut ? `<span class="at-statut">${escapeHtml(f.statut)}</span>` : ''}${date ? `<span class="at-date">${escapeHtml(formatDateFr(date))}</span>` : ''}
    ${details.length ? `<span class="at-apercu">${escapeHtml(details.join(' · '))}</span>` : ''}</li>`;
}

// Pure : le résumé des formalités d'un sous-dossier et celles à surveiller (étude 28/10 : « dans Authentic, ça fait beaucoup de données à
// l'écran » ; choix : résumé + ce qui attend) — réponse négative, rejet, blocage, ou demande en attente depuis plus de 30 jours.
// { total, recues, attente, aSurveiller: FormaliteAT[] }.
function resumeFormalitesAT(sd, aujourdhuiIso) {
  // Les DEMANDES sont les formalités préalables (les formalités postérieures — publication, Micen — ne le sont pas, relecture 0.394.0).
  const toutes = sd.formalitesPrealables || [];
  const etat = (f) => {
    const e = etatLigneDemandeAuthentic([f.statut, f.reponse, f.situation].filter(Boolean).join(' '));
    return e === 'negative' ? 'probleme' : (f.recuLe || e === 'recue') ? 'recue' : 'attente';
  };
  const auj = aujourdhuiIso || isoAujourdhuiLocal();
  const vieux = (f) => { const d = (f.envoyeLe || (f.dates || []).slice(-1)[0] || ''); return /^\d{4}-\d{2}-\d{2}/.test(d) && ecartJours(d, auj) > 30; };
  const etats = toutes.map(f => ({ f, e: etat(f) }));
  return {
    total: toutes.length,
    recues: etats.filter(x => x.e === 'recue').length,
    attente: etats.filter(x => x.e === 'attente').length,
    aSurveiller: etats.filter(x => x.e === 'probleme' || (x.e === 'attente' && vieux(x.f))).map(x => x.f)
  };
}

// Le bloc « Sous-dossier dans Authentic » du panneau Authentic de la fiche ('' tant que rien n'est relevé).
function htmlSousDossierAT(d) {
  if (!d || !d.id) return '';
  const e = instantanesAuthenticAT[d.id];
  if (!e || (!e.enCours && Date.now() - e.t > DUREE_INSTANTANE_AT_MS)) chargerInstantaneAuthenticAT(d.id);
  const sd = e && e.inst && e.inst.sousDossier;
  if (!sd) return '';
  const groupes = [['Formalités préalables', sd.formalitesPrealables], ['Actes', sd.actes], ['Formalités postérieures', sd.formalitesPosterieures]]
    .filter(([, l]) => (l || []).length)
    .map(([t, l]) => `<div class="at-groupe"><div class="at-groupe-titre">${escapeHtml(t)}<span class="pa-compte">${l.length}</span></div><ul class="at-liste">${l.map(htmlLigneFormaliteAT).join('')}</ul></div>`).join('');
  // À l'écran : une ligne de résumé et ce qui attend ; tout le détail replié (étude 28/10).
  const res = resumeFormalitesAT(sd);
  const resume = res.total ? `<p class="at-resume">${res.total} demande${res.total > 1 ? 's' : ''} : ${res.recues} reçue${res.recues > 1 ? 's' : ''}, ${res.attente} en attente</p>
    ${res.aSurveiller.length ? `<div class="at-groupe"><div class="at-groupe-titre">À surveiller<span class="pa-compte">${res.aSurveiller.length}</span></div><ul class="at-liste">${res.aSurveiller.slice(0, 8).map(htmlLigneFormaliteAT).join('')}</ul></div>` : ''}` : '';
  const detail = groupes ? `${resume}<details class="at-detail"><summary>Voir tout le détail</summary>${groupes}</details>` : '';
  const lu = /^\d{4}-\d{2}-\d{2}/.test(String(e.inst.luLe || '')) ? `Lu le ${formatDateFr(String(e.inst.luLe).slice(0, 10))}` : '';
  return `<div class="at-sous-dossier">
    <div class="at-tete"><span class="at-intitule">${escapeHtml(sd.intitule || 'Sous-dossier')}</span>
      ${sd.statut ? `<span class="dot-label ${classeStatutSousDossierAT(sd.statut)}"><span class="dot"></span>${escapeHtml(sd.statut)}${sd.statutLe ? ` · ${escapeHtml(formatDateFr(sd.statutLe))}` : ''}</span>` : ''}
      ${infoBulle('Ce que montre le sous-dossier dans Authentic, à la dernière page relevée' + (lu ? ` (${lu.toLowerCase()})` : '') + ' : rien n’est écrit dans Authentic ni sur la fiche.')}</div>
    ${groupes || (sd.pieces || []).length ? detail : '<p class="pa-aide">Aucune formalité ni acte relevé sur la page du dossier.</p>'}
    ${typeof htmlEtatHypothecaireFiche === 'function' ? htmlEtatHypothecaireFiche(d) : ''}
    ${typeof htmlSuivisDossierAT === 'function' ? htmlSuivisDossierAT(d) : ''}
    ${typeof htmlComptabiliteAT === 'function' ? htmlComptabiliteAT(d) : ''}
    ${htmlPiecesJointesAT(d, sd)}
  </div>`;
}

// « Sans suite » vu par ce poste : la date du badge, retenue à l'ouverture de la fiche (le signal du Suivi en sort, audit 0.377.0).
var CLE_SANS_SUITE_VUS_AT = 'claire-authentic-sans-suite-vus';
function lireSansSuiteVusAT() { try { return JSON.parse(localStorage.getItem(CLE_SANS_SUITE_VUS_AT) || '{}') || {}; } catch (e) { return {}; } }
function sansSuiteVuAT(id, le) { return lireSansSuiteVusAT()[id] === String(le || ''); }
function noterSansSuiteVuAT(id) {
  const st = statutsAuthenticAT[id];
  if (!st || st.statut !== 'Sans suite') return;
  const vus = lireSansSuiteVusAT();
  vus[id] = String(st.le || '');
  ecrireLocal(CLE_SANS_SUITE_VUS_AT, JSON.stringify(vus));
}

if (typeof window !== 'undefined' && typeof setInterval === 'function') {
  setTimeout(chargerStatutsAuthenticAT, 4000);
  setInterval(chargerStatutsAuthenticAT, 5 * 60 * 1000);
}

// ---- Étape 5 : les pièces jointes d'Authentic (GED), comparées à la checklist et au NAS, PDF ouvert à la demande ----

// Pure : ce qu'une pièce jointe d'Authentic est pour CLAIRE — la pièce de la checklist que son NOM désigne (mêmes règles que le NAS) et
// si un fichier du même nom est sur le NAS. { piece: { cle, label, recue } | null, nas: bool }.
function correspondancePieceAuthenticAT(d, nom, listeCalculee) {
  const nomNorm = normaliserNomPourMotif(String(nom || '').replace(/\.[a-z0-9]{2,4}$/i, ''));
  const liste = listeCalculee || (typeof checklistPieces === 'function' ? checklistPieces(d && d.typeVente, d) : []);
  const p = liste.find(x => correspondancePieceNom(x, nomNorm));
  const base = (c) => normaliserNomPourMotif(String(c || '').split(/[\\/]/).pop().replace(/\.[a-z0-9]{2,4}$/i, ''));
  const nas = (Array.isArray(d && d.nasInventaire) ? d.nasInventaire : []).some(c => base(c) === nomNorm);
  return { piece: p ? { cle: p.cle, label: p.label, recue: !!(d.pieces && d.pieces[p.cle] === 'recue') } : null, nas };
}

function htmlPiecesJointesAT(d, sd) {
  const pieces = (sd && sd.pieces) || [];
  if (!pieces.length) return '';
  const checklist = typeof checklistPieces === 'function' ? checklistPieces(d && d.typeVente, d) : [];
  const parDossier = new Map();
  pieces.forEach(p => { const k = p.dossierGed || 'Pièces jointes'; if (!parDossier.has(k)) parDossier.set(k, []); parDossier.get(k).push(p); });
  const lignes = [...parDossier.entries()].map(([dossierGed, liste]) => `<li class="at-ged-dossier">${escapeHtml(dossierGed)}</li>${liste.map(p => {
    const c = correspondancePieceAuthenticAT(d, p.nom, checklist);
    const etat = c.piece ? (c.piece.recue ? `<span class="at-ged-piece">✓ ${escapeHtml(c.piece.label)}</span>` : `<span class="at-ged-piece at-ged-manque" title="Dans Authentic, pas encore cochée reçue dans CLAIRE">${escapeHtml(c.piece.label)} : pas encore reçue dans CLAIRE</span>`) : '';
    return `<li class="at-ged-ligne"><span class="at-libelle" title="${escapeAttr(p.nom)}">${escapeHtml(p.nom)}</span>${etat}${c.nas ? '<span class="at-ged-nas">aussi sur le NAS</span>' : ''}
      ${typeof pieceEstEtatHypothecaire === 'function' && pieceEstEtatHypothecaire(p) ? `<wa-button appearance="outlined" size="s" type="button" onclick="relireEtatHypothecaireAT('${escapeOnclickArg(d.id)}', '${escapeOnclickArg(p.pjId)}')" title="CLAIRE lit l’état hypothécaire et relève les inscriptions (rubrique Charge)">Relire l’état</wa-button>` : ''}
      <wa-button appearance="plain" size="s" type="button" class="bouton-icone" onclick="ouvrirPieceAuthenticAT('${escapeOnclickArg(d.id)}', '${escapeOnclickArg(p.pjId)}')" title="Ouvrir le PDF (lu dans Authentic par CLAIRE, une minute environ)" aria-label="Ouvrir le PDF">${icone('file-text')}</wa-button></li>`;
  }).join('')}`).join('');
  return `<div class="at-groupe"><div class="at-groupe-titre">Pièces jointes${infoBulle('La liste de la GED du sous-dossier, à la dernière lecture. « Ouvrir » : CLAIRE ouvre la pièce dans Authentic et vous montre le PDF ; rien n’est modifié dans Authentic, le PDF ne reste que quelques minutes en mémoire du serveur.')}<span class="pa-compte">${pieces.length}</span></div><ul class="at-liste">${lignes}</ul></div>`;
}

// Le PDF d'une pièce jointe, lu dans Authentic par une tâche du navigateur du serveur (une minute environ) : rend un Blob, ou lève l'erreur.
async function blobPieceAuthenticAT(dossierId, pjId) {
  const r = await fetchAvecAuth('/api/authentic-claire/piece', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dossierId, pjId, auteur: utilisateurPoste || '' }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erreur || 'refusé par le serveur');
  const fin = Date.now() + 5 * 60 * 1000;
  while (Date.now() < fin) {
    await new Promise(ok => setTimeout(ok, 2000));
    const rt = await fetchAvecAuth(`/api/navigation/taches/${encodeURIComponent(j.id)}`);
    if (rt.status === 404) throw new Error('la lecture n’est plus suivie par le serveur');
    const t = await rt.json().catch(() => null);
    if (!t) continue;
    if (t.etat === 'erreur' || t.etat === 'annule') throw new Error(t.erreur || 'arrêté');
    if (t.etat !== 'fini') continue;
    const pdf = await fetchAvecAuth(`/api/navigation/taches/${encodeURIComponent(j.id)}/documents/piece`);
    if (!pdf.ok) throw new Error('PDF non rendu');
    return pdf.blob();
  }
  throw new Error('toujours en cours au bout de 5 minutes');
}

// « Ouvrir » : le PDF de la pièce, dans un onglet.
async function ouvrirPieceAuthenticAT(dossierId, pjId) {
  const fenetre = window.open('', '_blank');
  if (fenetre) fenetre.document.body.textContent = 'CLAIRE ouvre la pièce dans Authentic…';
  try {
    const url = URL.createObjectURL(await blobPieceAuthenticAT(dossierId, pjId));
    setTimeout(() => URL.revokeObjectURL(url), 10 * 60 * 1000);
    if (fenetre) fenetre.location.href = url;
    else if (!window.open(url, '_blank')) afficherToast('Le navigateur a bloqué la fenêtre de la pièce : autorisez les fenêtres de CLAIRE, puis recommencez.', 'OK', null);
  } catch (e) {
    if (fenetre) fenetre.close();
    afficherToast('Pièce non ouverte : ' + (e && e.message ? e.message : 'erreur'), 'OK', null);
  }
}
