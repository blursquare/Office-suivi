// Contrôle de l'urbanisme en étapes (étude 31/10 : « au lieu de tout avoir sur le même écran, faire étape par étape : une première où on
// sélectionne le dossier, comme pour constituer le dossier ; ensuite on voit les parcelles, ça lit automatiquement les zones ; retrouver en
// fonction des mairies s'il y a un droit de préemption renforcé ; poser les questions pour affiner le droit de préemption, SAFER et compagnie ;
// puis un bel écran final avec le contrôle de l'urbanisme, le plan cadastral demandé automatiquement et visible, les photos aériennes » ; et
// « si CLAIRE doit l'utiliser ou le remplir toute seule, qu'elle fasse bien toutes les étapes »).
//
// Les rendus de l'écran d'avant (client/46, 55, 68, 69) restent ceux des zones de chaque étape ; ce fichier montre une étape à la fois, la
// barre des étapes, la navigation, la carte « DPU renforcé », la synthèse finale, l'aperçu du plan cadastral, et l'outil controle_urbanisme
// de « Demander à CLAIRE » qui passe par les mêmes étapes (dossier → zonage → questions → résultat → enregistrement).

var PAGES_PREEMPTION = [
  { cle: 'dossier', court: 'Dossier' },
  { cle: 'parcelles', court: 'Parcelles et zones' },
  { cle: 'questions', court: 'Questions' },
  { cle: 'rendu', court: 'Contrôle' }
];

// Pure : l'étape affichée. Sans dossier choisi (ni « sans dossier »), toujours la première.
function pageCourantePreemption(e) {
  if (!e || e.page === 'dossier' || (!e.dossierId && !e.sansDossier)) return 'dossier';
  return PAGES_PREEMPTION.some(p => p.cle === e.page) ? e.page : 'parcelles';
}

// Pure : le droit de préemption urbain publié au Géoportail par la commune, sur les parcelles lues (server/src/urbanisme.js, dpuDepuisInfos).
function dpuGeoportailPreemption(lus) {
  const dpus = (lus || []).map(z => z && z.dpu).filter(Boolean);
  const tous = (k) => dpus.length > 0 && dpus.length === (lus || []).length && dpus.every(x => x[k]);
  return { lu: dpus.some(x => x.lu), perimetre: dpus.some(x => x.perimetre), renforce: dpus.some(x => x.renforce),
    toutesPerimetre: tous('perimetre'), toutesRenforce: tous('renforce'),
    libelles: [...new Set(dpus.flatMap(x => x.libelles || []))].slice(0, 5) };
}

// Pure : ce que CLAIRE sait du DPU renforcé pour la commune et les parcelles — réponse donnée, règles connues de la commune (Blois :
// délibération A_D2025_200), puis le périmètre publié au Géoportail. → { statut: 'oui'|'probable'|'non'|'verifier'|'', source, motif }.
// Jamais « non » sans source : une commune qui n'a rien publié reste « à vérifier ».
function etatDpuRenforcePreemption(e) {
  if (!e) return { statut: '', source: '', motif: '' };
  const donne = e.reponses && e.reponses.dpur;
  if (donne === 'oui' || donne === 'non') return { statut: donne, source: 'Réponse donnée', motif: donne === 'oui' ? 'dans un périmètre de DPU renforcé' : 'hors périmètre' };
  const blois = typeof dpurBlois === 'function' ? dpurBlois(e.insee, parcellesDepuisTexte(e.parcelles), e.adresse) : { statut: '' };
  if (blois.statut) return { statut: blois.statut, source: 'Délibération connue (Blois, A_D2025_200 du 07/10/2025)', motif: blois.motif };
  const lus = zonagesLusPreemption(e);
  if (!lus.length) return { statut: '', source: '', motif: '' };
  const gpu = dpuGeoportailPreemption(lus);
  if (gpu.toutesRenforce) return { statut: 'oui', source: 'Géoportail de l’urbanisme (périmètre publié par la commune)', motif: gpu.libelles.join(' ; ') || 'périmètre de DPU renforcé' };
  if (gpu.renforce) return { statut: 'probable', source: 'Géoportail de l’urbanisme (périmètre publié par la commune)', motif: 'une partie seulement des parcelles touche le périmètre du DPU renforcé (peut-être par sa bordure) : à vérifier sur le plan' };
  if (gpu.perimetre) return { statut: 'verifier', source: 'Géoportail de l’urbanisme', motif: `DPU publié (${gpu.libelles.join(' ; ') || 'périmètre'}), sans mention « renforcé » — un DPU renforcé voté sans être publié reste possible : à vérifier en mairie si le bien n’est soumis qu’au DPU renforcé` };
  return { statut: 'verifier', source: gpu.lu ? 'Géoportail de l’urbanisme' : '', motif: gpu.lu ? 'aucun périmètre de droit de préemption publié au Géoportail sur ces parcelles : à vérifier en mairie (délibération)' : 'informations du document d’urbanisme non lues : à vérifier en mairie' };
}

var LIBELLES_DPUR_PREEMPTION = { oui: 'Dans un périmètre', probable: 'Probable', non: 'Hors périmètre', verifier: 'À vérifier' };
var CLASSES_DPUR_PREEMPTION = { oui: 'dl-urgent', probable: 'dl-pret', non: 'dl-success', verifier: 'dl-neutre' };

function renderDpurCartePreemption(e) {
  const r = etatDpuRenforcePreemption(e);
  if (!r.statut) return '';
  return `<div class="pr-droit pr-dpur-carte">
      <div class="pr-droit-tete"><span class="pr-droit-titre">Droit de préemption urbain renforcé</span>
        <span class="dot-label ${CLASSES_DPUR_PREEMPTION[r.statut] || 'dl-neutre'}"><span class="dot"></span>${LIBELLES_DPUR_PREEMPTION[r.statut] || ''}</span></div>
      <div class="pr-droit-motif">${escapeHtml(r.motif)}</div>
      ${r.source ? `<div class="hint">${icone('info')} ${escapeHtml(r.source)}</div>` : ''}
    </div>`;
}

// Pure : le nom de la commune choisie (liste du code postal, sinon celle lue au cadastre).
function nomCommunePreemption(e) {
  const c = ((e && e.communes) || []).find(x => x.insee === e.insee);
  if (c) return c.nom;
  const z = zonagesLusPreemption(e)[0];
  return (z && z.parcelle && z.parcelle.commune) || '';
}

// Pure : la synthèse de l'écran final — compte des droits, parcelles et leurs zones, questions restantes.
function synthesePreemption(e) {
  const rep = reponsesPreemption(e);
  const lignes = lignesZonageParcelles(e.zonages || [], rep.zonesParcelles);
  const analyse = analyserPreemptionParcelles(rep, lignes);
  return {
    commune: nomCommunePreemption(e),
    parcelles: lignes.map(l => ({ parcelle: l.libelle, zone: l.zone || (l.statut === 'lecture' ? 'lecture…' : l.statut === 'erreur' ? 'non lue' : '—') })),
    aPurger: analyse.droits.filter(d => d.statut === 'oui').map(d => d.titre),
    aVerifier: analyse.droits.filter(d => d.statut === 'verifier').map(d => d.titre),
    questions: analyse.manques.length,
    dpur: etatDpuRenforcePreemption(e),
    patrimoine: typeof lignePatrimoinePreemption === 'function' ? lignePatrimoinePreemption(patrimoinePreemption(e)) : null
  };
}

function allerPagePreemption(cle) {
  if (!prEtat) prEtat = etatPreemptionVierge();
  if (cle !== 'dossier' && !prEtat.dossierId && !prEtat.sansDossier) return;
  prEtat.page = cle;
  renderPreemption();
  const panneau = document.getElementById('onglet-preemption');
  if (panneau && panneau.scrollIntoView) window.scrollTo({ top: 0 });
  if (cle === 'rendu') preparerRenduPreemption();
}

function continuerSansDossierPreemption() {
  prEtat = etatPreemptionVierge();
  prEtat.sansDossier = true;
  prEtat.page = 'parcelles';
  renderPreemption();
}

// À l'arrivée sur l'écran final : le plan cadastral (cadastre.gouv.fr) et le plan aérien (IGN) sont demandés seuls, une fois.
function preparerRenduPreemption() {
  const e = prEtat;
  if (!e || manqueConsultationSites(e)) return;
  const st = etatSitesPreemption();
  if (!st.plan) lancerPlanSituation();
  if (!st.aerien) lancerPlanAerien();
}

// L'aperçu du premier plan cadastral tiré, dans l'écran final (le PDF lu par le serveur, affiché dans un cadre).
async function chargerApercuPlanPreemption(plan) {
  const st = etatSitesPreemption();
  const doc = (plan.documents || [])[0];
  if (!doc || (st.apercu && st.apercu.tache === plan.id)) return;
  if (st.apercu && st.apercu.url) URL.revokeObjectURL(st.apercu.url);
  st.apercu = { tache: plan.id, url: '', etat: 'lecture' };
  try {
    const r = await fetchAvecAuth(`/api/navigation/taches/${encodeURIComponent(plan.id)}/documents/${encodeURIComponent(doc.id)}`);
    if (!r.ok) throw new Error(`réponse ${r.status}`);
    st.apercu = { tache: plan.id, url: URL.createObjectURL(await r.blob()), etat: 'ok' };
  } catch (err) {
    st.apercu = { tache: plan.id, url: '', etat: 'erreur' };
  }
  if (prEtat && prEtat.sites === st) renderApercuPlanPreemption();
}

function renderApercuPlanPreemption() {
  const zone = document.getElementById('pr-plan-apercu');
  if (!zone || !prEtat) return;
  const st = etatSitesPreemption();
  const plan = st.plan;
  if (!plan || plan.etat !== 'fini') {
    zone.innerHTML = plan && plan.etat !== 'erreur' ? '<p class="hint pr-plan-attente">Plan cadastral demandé à cadastre.gouv.fr…</p>' : '';
    return;
  }
  if (!st.apercu || st.apercu.tache !== plan.id) { zone.innerHTML = '<p class="hint">Aperçu du plan…</p>'; chargerApercuPlanPreemption(plan); return; }
  if (st.apercu.etat !== 'ok') { zone.innerHTML = st.apercu.etat === 'lecture' ? '<p class="hint">Aperçu du plan…</p>' : ''; return; }
  if (zone.querySelector('iframe') && zone.dataset.tache === plan.id) return;
  zone.dataset.tache = plan.id;
  zone.innerHTML = `<iframe class="pr-plan-cadre" src="${escapeAttr(st.apercu.url)}#view=FitH" title="Plan cadastral"></iframe>`;
}

function renderStepperPreemption(page) {
  const e = prEtat;
  const i = PAGES_PREEMPTION.findIndex(p => p.cle === page);
  const choisi = !!(e && (e.dossierId || e.sansDossier));
  const syn = choisi ? synthesePreemption(e) : null;
  const sous = { dossier: e && e.dossierId ? 'choisi' : e && e.sansDossier ? 'sans dossier' : '', parcelles: syn ? `${syn.parcelles.length} parcelle${syn.parcelles.length > 1 ? 's' : ''}` : '',
    questions: syn ? (syn.questions ? `${syn.questions} à répondre` : 'aucune restante') : '', rendu: syn ? (syn.aPurger.length ? `${syn.aPurger.length} à purger` : '') : '' };
  const coche = '<span slot="icon" class="anim-etape-coche" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7" pathLength="1"/></svg></span>';
  return `<div class="outil-sommaire-place cst-sommaire"><wa-stepper class="outil-sommaire" ${choisi ? 'clickable ' : ''}orientation="horizontal" label="Étapes du contrôle de l’urbanisme" active="${escapeAttr(page)}">${PAGES_PREEMPTION.map((p, k) => `<wa-step name="${escapeAttr(p.cle)}"${k < i ? ' completed data-suite' : ''}${k <= i ? ' data-avant-suite data-atteinte' : ''}>${escapeHtml(p.court)}${sous[p.cle] ? `<span slot="description">${escapeHtml(sous[p.cle])}</span>` : ''}${k < i ? coche : ''}</wa-step>`).join('')}</wa-stepper></div>`;
}
document.addEventListener('wa-step-change', (ev) => {
  const barre = ev.target && ev.target.closest ? ev.target.closest('#pr-stepper') : null;
  const cle = ev.detail && ev.detail.name;
  if (barre && cle && prEtat && cle !== pageCourantePreemption(prEtat)) allerPagePreemption(cle);
});

function renderNavPreemption(page) {
  const d = prEtat && prEtat.dossierId ? dossiers.find(x => x.id === prEtat.dossierId) : null;
  const bouton = (cle, texte, principal) => `<wa-button ${principal ? 'variant="brand"' : 'appearance="outlined"'} type="button" onclick="allerPagePreemption('${cle}')">${texte}</wa-button>`;
  if (page === 'parcelles') return `<span></span>${bouton('questions', 'Suivant : questions →', true)}`;
  if (page === 'questions') return `${bouton('parcelles', '← Parcelles et zones')}${bouton('rendu', 'Voir le contrôle →', true)}`;
  if (page === 'rendu') return `${bouton('questions', '← Questions')}<span class="hint">${d ? '« Enregistrer sur la fiche » est sous les droits.' : 'Sans dossier : rien à enregistrer.'}</span>`;
  return '';
}

function renderBarreDossierPreemption(page) {
  if (page === 'dossier') return '';
  const e = prEtat;
  const d = e.dossierId ? dossiers.find(x => x.id === e.dossierId) : null;
  const commune = nomCommunePreemption(e);
  return `<div class="cst-barre"><div class="cst-dossier">
      <strong class="cst-dossier-titre">${escapeHtml(d ? libelleDossierAffiche(d) : 'Sans dossier')}</strong>
      ${commune ? `<span class="cst-dossier-info">${icone('map-pin')} <strong>${escapeHtml(commune)}</strong></span>` : ''}
      ${e.parcelles ? `<span class="cst-dossier-info">${escapeHtml(e.parcelles)}</span>` : ''}
      ${d ? `<wa-button appearance="outlined" size="s" type="button" onclick="ouvrirDossierDrawer('${escapeOnclickArg(d.id)}')">${icone('file-text')} Ouvrir la fiche</wa-button>` : ''}
      <wa-button appearance="outlined" size="s" type="button" onclick="allerPagePreemption('dossier')">${icone('folder')} Changer de dossier</wa-button>
    </div></div>`;
}

function renderSynthesePreemption() {
  const zone = document.getElementById('pr-synthese');
  if (!zone || !prEtat) return;
  const s = synthesePreemption(prEtat);
  const tuile = (titre, valeur, detail, ton) => `<div class="pr-tuile pr-tuile-${ton}"><span class="pr-tuile-titre">${escapeHtml(titre)}</span><span class="pr-tuile-valeur">${escapeHtml(valeur)}</span>${detail ? `<span class="pr-tuile-detail">${escapeHtml(detail)}</span>` : ''}</div>`;
  const zones = [...new Set(s.parcelles.map(p => p.zone).filter(z => z && z !== '—'))];
  zone.innerHTML = `<div class="pr-synthese">
      ${tuile('Droits à purger', s.aPurger.length ? String(s.aPurger.length) : 'Aucun', s.aPurger.join(' · ') || (s.aVerifier.length ? `${s.aVerifier.length} à vérifier` : 'd’après les réponses données'), s.aPurger.length ? 'rouge' : s.aVerifier.length ? 'orange' : 'vert')}
      ${tuile('Zonage', zones.join(' · ') || '—', `${s.commune || 'commune ?'} · ${s.parcelles.length} parcelle${s.parcelles.length > 1 ? 's' : ''}`, 'neutre')}
      ${tuile('DPU renforcé', LIBELLES_DPUR_PREEMPTION[s.dpur.statut] || '—', s.dpur.source, s.dpur.statut === 'oui' ? 'rouge' : s.dpur.statut === 'non' ? 'vert' : 'neutre')}
      ${tuile('Patrimoine', s.patrimoine ? s.patrimoine.titre : '—', s.patrimoine ? (LIBELLES_PATRIMOINE[s.patrimoine.statut] || '') : '', s.patrimoine && s.patrimoine.statut === 'oui' ? 'orange' : 'neutre')}
    </div>
    ${s.questions ? `<p class="pr-erreur">${icone('alert-triangle')} ${s.questions} question${s.questions > 1 ? 's restent' : ' reste'} sans réponse : certains droits restent « à vérifier ». <a href="#" onclick="event.preventDefault(); allerPagePreemption('questions')">Y répondre</a></p>` : ''}`;
}

// Appelée à la fin de renderPreemption (client/46) : l'étape affichée et tout ce qui l'entoure.
function renderEtapesPreemption() {
  if (!prEtat) return;
  const page = pageCourantePreemption(prEtat);
  const stepper = document.getElementById('pr-stepper');
  // Pas de barre d'étapes sur la page du choix du dossier (étude 31/10 : « ne mets pas les étapes dans la première page de choix »).
  if (stepper) stepper.innerHTML = page === 'dossier' ? '' : renderStepperPreemption(page);
  document.querySelectorAll('#onglet-preemption > .pr-page').forEach(s => { s.style.display = s.dataset.page === page ? '' : 'none'; });
  const accueil = document.getElementById('pr-accueil');
  // L'accueil n'est redessiné qu'à l'arrivée (une lecture qui avance ne doit pas effacer une recherche en cours de frappe).
  if (accueil) { if (page !== 'dossier') accueil.innerHTML = ''; else if (!accueil.querySelector('.outil-accueil-page')) accueil.innerHTML = htmlAccueilDossierOutil('preemption'); }
  const barre = document.getElementById('pr-barre-dossier');
  if (barre) barre.innerHTML = renderBarreDossierPreemption(page);
  const dpur = document.getElementById('pr-dpur-carte');
  if (dpur) dpur.innerHTML = renderDpurCartePreemption(prEtat);
  document.querySelectorAll('#onglet-preemption .pr-nav').forEach(n => { n.innerHTML = n.dataset.page === page ? renderNavPreemption(page) : ''; });
  if (page === 'rendu') { renderSynthesePreemption(); renderApercuPlanPreemption(); }
}

// ===== « Demander à CLAIRE » : controle_urbanisme — les mêmes étapes, sans écran =====
// analyser : dossier → commune → zonage de chaque parcelle (Géoportail) → droits et questions restantes ; repondre : réponses aux questions,
// analyse refaite ; enregistrer : sur la fiche, après la carte « Autoriser » (même enregistrement que le bouton) ; ouvrir : un bouton qui
// montre l'écran final de l'outil avec ce qui a été fait. L'état de chaque dossier est gardé le temps de la page.
var etatsUrbanismeAgent = {};
var REPONSES_LIBRES_URBANISME = { mutation: () => MUTATIONS_PREEMPTION, bien: () => BIENS_PREEMPTION, casBati: () => CAS_BATI_PREEMPTION,
  dpur: () => [{ cle: 'oui' }, { cle: 'non' }], dpuInstitue: () => [{ cle: 'oui' }, { cle: 'non' }], zone: () => ZONES_PREEMPTION };

// Pure : les réponses de l'agent rendues dans la forme de l'outil (« oui »/« non » → booléens pour les questions) ; les clés inconnues refusées.
function reponsesAgentUrbanisme(reponses) {
  const out = {};
  const refusees = [];
  Object.entries(reponses || {}).forEach(([cle, v]) => {
    const t = String(v == null ? '' : v).trim().toLowerCase();
    if (QUESTIONS_PREEMPTION.some(q => q.cle === cle)) {
      if (t === 'oui' || t === 'true') out[cle] = true;
      else if (t === 'non' || t === 'false') out[cle] = false;
      else refusees.push(cle);
      return;
    }
    const liste = REPONSES_LIBRES_URBANISME[cle] ? REPONSES_LIBRES_URBANISME[cle]() : null;
    if (liste && liste.some(x => x.cle === String(v))) out[cle] = String(v);
    else refusees.push(cle);
  });
  return { reponses: out, refusees };
}

// Pure : ce que l'agent reçoit — sans nom de personne (à Blois, le motif du DPU renforcé peut citer la rue, liste fermée ; masqué par le serveur comme tout résultat) : commune, parcelles et zones, droits, DPU renforcé, patrimoine, questions restantes.
function resultatAgentUrbanisme(e) {
  const rep = reponsesPreemption(e);
  const lignes = lignesZonageParcelles(e.zonages || [], rep.zonesParcelles);
  const analyse = analyserPreemptionParcelles(rep, lignes);
  const s = synthesePreemption(e);
  return {
    etapes_faites: ['dossier', s.parcelles.length ? 'zonage lu' : 'zonage non lu', analyse.manques.length ? 'questions restantes' : 'questions répondues'],
    commune: s.commune, parcelles: s.parcelles,
    droits: analyse.droits.map(d => ({ droit: d.titre, statut: LIBELLES_STATUT_PREEMPTION[d.statut] || d.statut, motif: d.motif || '', formalite: d.formalite || '' })),
    dpu_renforce: { statut: LIBELLES_DPUR_PREEMPTION[s.dpur.statut] || 'non lu', source: s.dpur.source, motif: s.dpur.motif },
    patrimoine: s.patrimoine ? { statut: LIBELLES_PATRIMOINE[s.patrimoine.statut] || '', titre: s.patrimoine.titre, motif: s.patrimoine.motif || '' } : null,
    reponses_donnees: Object.assign({}, e.reponses),
    questions_restantes: analyse.manques.map(cle => {
      const q = QUESTIONS_PREEMPTION.find(x => x.cle === cle);
      return { cle, question: q ? q.libelle : LIBELLES_MANQUES_PREEMPTION[cle] || cle, reponse: q ? 'oui ou non' : REPONSES_LIBRES_URBANISME[cle] ? REPONSES_LIBRES_URBANISME[cle]().map(x => x.cle).join(', ') : '' };
    })
  };
}

async function controleUrbanismeAgent(entree) {
  const e = entree || {};
  const d = e.dossier_id ? dossiers.find(x => x.id === e.dossier_id) : null;
  if (!d) return { erreur: 'dossier introuvable : cherche-le d’abord (chercher_dossiers)' };
  if (estSuccession(d)) return { erreur: 'le contrôle de l’urbanisme porte sur une vente' };
  let etat = etatsUrbanismeAgent[d.id];
  if (!etat || e.action === 'analyser') {
    etat = prefillPreemption(d);
    if (etatsUrbanismeAgent[d.id]) etat.reponses = Object.assign({}, etat.reponses, etatsUrbanismeAgent[d.id].reponses);
    if (etat.cp) { const err = await lireCommunesEtatPreemption(etat); if (err) return { erreur: err }; }
    if (!etat.insee) return { erreur: 'commune du bien non reconnue (code postal ou adresse de la fiche) : à compléter sur la fiche' };
    if (!parcellesDepuisTexte(etat.parcelles).length) return { erreur: 'aucune parcelle sur la fiche (section et numéro) : à renseigner d’abord' };
    await lireZonagesEtatPreemption(etat);
    etatsUrbanismeAgent[d.id] = etat;
  }
  let refusees = [];
  if (e.action === 'repondre') {
    const r = reponsesAgentUrbanisme(e.reponses);
    refusees = r.refusees;
    etat.reponses = Object.assign({}, etat.reponses, r.reponses);
  }
  if (e.action === 'enregistrer') {
    const res = resultatAgentUrbanisme(etat);
    const purger = res.droits.filter(x => x.statut === LIBELLES_STATUT_PREEMPTION.oui).map(x => x.droit);
    const ok = await demanderAutorisationAgent(`Enregistrer le contrôle de l’urbanisme sur la fiche ${libelleDossierAffiche(d)} : ${purger.length ? purger.join(', ') + ' à purger' : 'aucun droit à purger'}${res.questions_restantes.length ? ` (${res.questions_restantes.length} question(s) sans réponse)` : ''} ; les pièces à obtenir suivent.`);
    if (!ok) return { refuse: true, message: 'refusé par l’utilisateur : rien n’est enregistré' };
    const fait = enregistrerPreemptionEtat(dossiers.find(x => x.id === d.id) || d, etat);
    return { enregistre: true, a_purger: fait.a_purger, pieces_ajoutees: fait.pieces.length };
  }
  if (e.action === 'ouvrir') {
    const copie = etat;
    poserMessageAssistant('claire', `<p>Contrôle de l’urbanisme — ${escapeHtml(libelleDossierAffiche(d))} : prêt, avec le plan cadastral demandé à l’ouverture.</p>`,
      [{ libelle: 'Voir le contrôle', principal: true, action: () => { prEtat = Object.assign({}, copie, { reponses: Object.assign({}, copie.reponses), zonages: (copie.zonages || []).slice(), sites: null, page: 'rendu' }); definirOnglet('preemption'); renderPreemption(); preparerRenduPreemption(); } }]);
    return Object.assign(resultatAgentUrbanisme(etat), { affiche_a_l_utilisateur: 'bouton « Voir le contrôle » affiché' });
  }
  return Object.assign(resultatAgentUrbanisme(etat), refusees.length ? { reponses_refusees: refusees } : {});
}
