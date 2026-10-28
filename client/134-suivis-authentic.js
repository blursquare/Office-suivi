// Suivis d'Authentic (étape 7 du plan Authen.TIC, 27/10 : « actes à signer, SAFER/DIA, état civil, MICEN, puis compteurs du tableau de
// bord ») : CLAIRE lit les quatre écrans de suivi par le navigateur du serveur (tableau affiché, jamais « Exporter »), quand on clique
// « Relire maintenant » (jamais de connexion automatique : audit 0.382.0) ; le serveur les garde. Ici : le widget « Suivis d'Authentic » du tableau de bord (compteurs, lignes
// en attente, dossier de CLAIRE retrouvé par sa référence) et les lignes d'un dossier dans le panneau « Authentic » de sa fiche.

var suivisAuthentic = { etat: null, t: 0, enCours: false, erreur: '' };
var DUREE_SUIVIS_AUTHENTIC_MS = 5 * 60 * 1000;

// Lit ce que le serveur a gardé (jamais une lecture dans Authentic : seul « Relire maintenant » en lance une). Un échec compte comme un
// essai — plus de nouvel appel avant 5 minutes — et ne redessine rien par lui-même (audit 0.382.0 : boucle de requêtes sans fin).
async function chargerSuivisAuthentic(forcer) {
  if (suivisAuthentic.enCours || (!forcer && Date.now() - suivisAuthentic.t < DUREE_SUIVIS_AUTHENTIC_MS)) return;
  if (!utilisateurPoste) { suivisAuthentic.erreur = 'aucun collaborateur choisi sur ce poste'; return; }
  suivisAuthentic.enCours = true;
  let change = false;
  try {
    const r = await fetchAvecAuth('/api/authentic-claire/suivis?utilisateur=' + encodeURIComponent(utilisateurPoste));
    if (r.ok) { suivisAuthentic.etat = await r.json(); suivisAuthentic.erreur = ''; change = true; }
    else suivisAuthentic.erreur = 'refusé par le serveur (' + r.status + ')';
  } catch (e) { suivisAuthentic.erreur = 'serveur injoignable'; }
  finally { suivisAuthentic.t = Date.now(); suivisAuthentic.enCours = false; }
  if (change) renderWidgetSuivisAuthentic();
}

// Pure : les lignes encore en attente des quatre écrans, les dossiers de CLAIRE d'abord, puis les plus anciennes (première date).
function lignesSuivisAuthenticEnAttente(etat) {
  const ecrans = (etat && etat.ecrans) || {};
  return (typeof ECRANS_SUIVIS_AT !== 'undefined' ? ECRANS_SUIVIS_AT : []).flatMap(e => ((ecrans[e.cle] && ecrans[e.cle].lignes) || [])
    .filter(l => l.enAttente).map(l => Object.assign({ ecran: e.cle, titre: e.titre }, l)))
    .sort((a, b) => (b.dossierId ? 1 : 0) - (a.dossierId ? 1 : 0) || String((a.dates || [])[0] || '9').localeCompare(String((b.dates || [])[0] || '9')));
}

function renderWidgetSuivisAuthentic() {
  const bloc = document.getElementById('kpi-suivis-authentic');
  if (!bloc) return;
  // Rien n'est demandé au serveur tant que le widget n'est pas sur le tableau de bord (la demande peut lancer une lecture dans Authentic).
  const w = dispositionWidgetsCourante().find(x => x.id === 'suivis-authentic');
  if (!w || w.masque) { bloc.innerHTML = ''; return; }
  chargerSuivisAuthentic(false);
  const etat = suivisAuthentic.etat;
  const presentation = presentationWidget('suivis-authentic');
  const compteurs = (etat && etat.compteurs) || {};
  const tuiles = ECRANS_SUIVIS_AT.map(e => {
    const c = compteurs[e.cle];
    const titre = c ? `${c.enAttente} en attente sur ${c.total} ligne${c.total > 1 ? 's' : ''}${c.dansClaire ? `, dont ${c.dansClaire} dossier${c.dansClaire > 1 ? 's' : ''} de CLAIRE` : ''}` : 'Pas encore lu';
    return `<div class="sa-tuile" title="${escapeAttr(titre)}"><span class="sa-nombre">${c ? escapeHtml(String(c.enAttente)) : '—'}</span><span class="sa-libelle">${escapeHtml(e.titre)}</span></div>`;
  }).join('');
  const lignes = lignesSuivisAuthenticEnAttente(etat);
  const ligne = (l) => {
    const d = l.dossierId ? dossiers.find(x => x.id === l.dossierId) : null;
    const nom = d ? libelleDossierAffiche(d) : (l.reference || '');
    const quand = (l.dates || [])[0] ? formatDateFr(l.dates[0]) : '';
    const corps = `<span class="sa-ecran">${escapeHtml(l.titre)}</span><span class="sa-texte"><b>${escapeHtml(l.libelle)}</b>${nom ? `<span class="sa-dossier"> · ${escapeHtml(nom)}</span>` : ''}</span><span class="sa-date">${escapeHtml(l.situation || quand)}</span>`;
    return d ? `<button type="button" class="sa-ligne" onclick="ouvrirDossierDepuisDashboard('${escapeOnclickArg(d.id)}')">${corps}</button>` : `<div class="sa-ligne">${corps}</div>`;
  };
  const lu = etat && etat.luLe ? `Lu ${new Date(etat.luLe).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : '';
  const pagines = ECRANS_SUIVIS_AT.filter(e => etat && etat.ecrans && etat.ecrans[e.cle] && etat.ecrans[e.cle].tronque).map(e => e.titre);
  const sous = etat && etat.enCoursDeLecture ? 'Lecture en cours dans Authentic…'
    : (lu ? lu + (pagines.length ? ` · première page seulement : ${pagines.join(', ')}` : '') : (etat && !etat.actif ? 'Connexion à Authentic éteinte (Réglages › Authentic)' : 'Pas encore lu : « Relire maintenant »'));
  bloc.innerHTML = carteWidget({
    presentation, classe: 'suivis-authentic',
    titre: 'Suivis d’Authentic' + infoBulle('Les écrans de suivi d’Authentic lus par CLAIRE (actes à signer, SAFER et DIA, état civil, MICEN) : les lignes encore en attente. Lus quand vous cliquez « Relire maintenant », avec le compte de l’étude ; rien n’est écrit ni exporté dans Authentic.'),
    sous: escapeHtml(sous),
    droite: `<wa-button appearance="plain" size="s" type="button" class="bouton-icone" onclick="relireSuivisAuthentic()" title="Relire maintenant dans Authentic" aria-label="Relire maintenant dans Authentic">${icone('rotate-ccw')}</wa-button>`,
    corps: `<div class="sa-tuiles w-fixe">${tuiles}</div>${presentation === 'petit' ? '' : `<div class="sa-liste">${lignes.length ? lignes.map(ligne).join('')
      : `<p class="sa-vide">${etat && etat.luLe ? 'Rien en attente dans les suivis lus.' : 'Les suivis d’Authentic n’ont pas encore été lus.'}</p>`}</div>`}`
  });
  if (typeof planifierAjustementWidgets === 'function') planifierAjustementWidgets();
}

async function relireSuivisAuthentic() {
  try {
    const r = await fetchAvecAuth('/api/authentic-claire/suivis', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ auteur: utilisateurPoste || '' }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erreur || 'refusé');
    afficherToast('CLAIRE lit les suivis dans Authentic (quelques minutes).', 'OK', null);
    if (suivisAuthentic.etat) suivisAuthentic.etat.enCoursDeLecture = true;
    renderWidgetSuivisAuthentic();
    setTimeout(() => chargerSuivisAuthentic(true), 3 * 60 * 1000);
  } catch (e) {
    afficherToast('Suivis non relus : ' + (e && e.message ? e.message : 'erreur'), 'OK', null);
  }
}

// Les lignes des suivis qui portent la référence de ce dossier, pour le panneau « Authentic » de sa fiche.
function htmlSuivisDossierAT(d) {
  const etat = suivisAuthentic.etat;
  // Ce que le serveur a gardé (relu au plus toutes les 5 minutes, jamais une lecture dans Authentic).
  if (d && d.referenceAuthentic) chargerSuivisAuthentic(false);
  if (!etat || !d || !d.referenceAuthentic) return '';
  const lignes = suivisDuDossierAT(etat.ecrans || {}, d.referenceAuthentic);
  if (!lignes.length) return '';
  return `<div class="at-groupe"><div class="at-groupe-titre">Dans les suivis d’Authentic<span class="pa-compte">${lignes.length}</span></div><ul class="at-liste">${lignes.map(l =>
    `<li class="at-ligne at-ligne-suivi"><span class="at-badge">${escapeHtml(l.titre)}</span><span class="at-libelle">${escapeHtml(l.libelle)}</span>${l.situation ? `<span class="at-statut">${escapeHtml(l.situation)}</span>` : ''}${(l.dates || [])[0] ? `<span class="at-date">${escapeHtml(formatDateFr(l.dates[0]))}</span>` : ''}</li>`).join('')}</ul></div>`;
}
