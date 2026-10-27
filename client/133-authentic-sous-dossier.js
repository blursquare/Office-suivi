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
  const lu = /^\d{4}-\d{2}-\d{2}/.test(String(e.inst.luLe || '')) ? `Lu le ${formatDateFr(String(e.inst.luLe).slice(0, 10))}` : '';
  return `<div class="at-sous-dossier">
    <div class="at-tete"><span class="at-intitule">${escapeHtml(sd.intitule || 'Sous-dossier')}</span>
      ${sd.statut ? `<span class="dot-label ${classeStatutSousDossierAT(sd.statut)}"><span class="dot"></span>${escapeHtml(sd.statut)}${sd.statutLe ? ` · ${escapeHtml(formatDateFr(sd.statutLe))}` : ''}</span>` : ''}
      ${infoBulle('Ce que montre le sous-dossier dans Authentic, à la dernière page relevée' + (lu ? ` (${lu.toLowerCase()})` : '') + ' : rien n’est écrit dans Authentic ni sur la fiche.')}</div>
    ${groupes || '<p class="pa-aide">Aucune formalité ni acte relevé sur la page du dossier.</p>'}
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
