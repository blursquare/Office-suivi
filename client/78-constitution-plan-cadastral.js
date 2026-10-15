  // ==== CONSTITUTION DE DOSSIER : PLAN CADASTRAL SURLIGNÉ AVEC CHAQUE COURRIER DE VENTE (étude 15/10) ====
  // « Pour la constitution de dossier, il faut envoyer avec chaque courrier de vente un plan cadastral surligné. »
  // Un plan par commune : celui que le navigateur du serveur tire de cadastre.gouv.fr (client/68, server/src/navigateur/ — parcelles
  // surlignées en jaune fluo, A4 portrait, plusieurs plans si les parcelles sont éloignées), demandé seul dès que la commune et ses
  // parcelles sont connues. Il suit chaque courrier : imprimé juste derrière lui, joint à l'email, enregistré dans « Constitution »
  // (une fois par commune) et mis dans l'archive téléchargée. Le courrier PDF/A reste un fichier à part (le plan n'est pas en PDF/A).

  var DELAI_ATTENTE_PLAN_CONSTITUTION_MS = 6 * 60 * 1000;

  // Pure : les parcelles du plan d'une commune (« AB 12, AB 13 »), cochées seulement, 12 au plus (limite du serveur).
  function parcellesPlanConstitution(g) {
    return ((g && g.parcelles) || []).filter(p => p && p.actif && p.section && p.numero).slice(0, 12).map(p => `${String(p.section).toUpperCase()} ${p.numero}`).join(', ');
  }

  // Pure : où en est le plan d'une commune → { etat: 'sans-commune' | 'sans-parcelle' | 'a-tirer' | 'perime' | 'attente' | 'en-cours' | 'fini' | 'erreur', texte }.
  function etatPlanConstitution(g) {
    const info = (g && g.info) || {};
    const parcelles = parcellesPlanConstitution(g);
    if (info.etat !== 'ok' || !info.insee) return { etat: 'sans-commune', texte: 'Commune non retrouvée : pas de plan' };
    if (!parcelles) return { etat: 'sans-parcelle', texte: 'Aucune parcelle cochée : pas de plan' };
    const p = g.plan;
    if (!p) return { etat: 'a-tirer', texte: 'Plan cadastral à tirer' };
    if (p.parcelles !== parcelles) return { etat: 'perime', texte: 'Parcelles changées : plan à refaire' };
    if (p.etat === 'fini') { const n = (p.documents || []).length; return { etat: 'fini', texte: n > 1 ? `${n} plans cadastraux prêts` : 'Plan cadastral prêt' }; }
    if (p.etat === 'erreur' || p.etat === 'annule') return { etat: 'erreur', texte: `Plan non tiré : ${p.erreur || 'arrêté'}` };
    return { etat: p.etat === 'en-cours' ? 'en-cours' : 'attente', texte: p.etat === 'en-cours' ? 'Plan cadastral en cours sur cadastre.gouv.fr…' : 'Plan cadastral en attente…' };
  }

  // Demande le plan d'une commune au serveur, puis le suit jusqu'au bout. `force` : refait un plan déjà tiré.
  async function lancerPlanConstitution(cle, force) {
    const e = cstEtat;
    const g = e && e.groupes.find(x => x.cle === cle);
    const d = dossierConstitution();
    if (!g || !d) return;
    const etat = etatPlanConstitution(g);
    if (['sans-commune', 'sans-parcelle'].includes(etat.etat)) return;
    if (!force && ['attente', 'en-cours', 'fini'].includes(etat.etat)) return;
    const parcelles = parcellesPlanConstitution(g);
    g.plan = { id: '', etat: 'attente', parcelles, documents: [] };
    renderConstitution();
    try {
      const r = await fetchAvecAuth('/api/navigation/plan-cadastre', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ insee: g.info.insee, parcelles, echelle: 0, dossierId: d.id }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.id) throw new Error(j.erreur || `réponse ${r.status}`);
      g.plan.id = j.id;
      suivrePlanConstitution(e, g);
    } catch (err) {
      g.plan = { id: '', etat: 'erreur', parcelles, documents: [], erreur: err.message };
      noterVerificationPoste('constitution-plan-cadastral', { ok: false, detail: 'demande refusée' });
      renderConstitution();
    }
  }

  function suivrePlanConstitution(e, g) {
    const plan = g.plan;
    const tour = async () => {
      if (cstEtat !== e || g.plan !== plan) return; // autre dossier ou plan relancé entre-temps
      try {
        const r = await fetchAvecAuth(`/api/navigation/taches/${encodeURIComponent(plan.id)}`);
        if (r.status === 404) { Object.assign(plan, { etat: 'erreur', erreur: 'plan oublié par le serveur (redémarré ?)' }); renderConstitution(); return; }
        const t = await r.json();
        Object.assign(plan, { etat: t.etat, documents: t.documents || [], erreur: t.erreur || '' });
      } catch (_) { /* relecture manquée : la suivante */ }
      if (plan.etat === 'fini') noterVerificationPoste('constitution-plan-cadastral', { detail: `${plan.documents.length} plan(s)` });
      majItemConstitution();
      const zone = document.getElementById(`cst-plan-${g.cle}`);
      if (zone) zone.outerHTML = renderPlanCommuneConstitution(g);
      if (plan.etat === 'attente' || plan.etat === 'en-cours') setTimeout(tour, 2000);
    };
    setTimeout(tour, 1500);
  }

  // Attend le plan d'une commune (au plus 6 minutes) ; le lance s'il n'a pas été tiré. Rend les PDF [{ nom, blob }] ou [] (raison dans g.plan).
  async function plansPdfConstitution(g) {
    if (!g) return [];
    const etat = etatPlanConstitution(g).etat;
    if (etat === 'sans-commune' || etat === 'sans-parcelle') return [];
    if (etat === 'a-tirer' || etat === 'perime' || etat === 'erreur') await lancerPlanConstitution(g.cle, true);
    const fin = Date.now() + DELAI_ATTENTE_PLAN_CONSTITUTION_MS;
    while (g.plan && (g.plan.etat === 'attente' || g.plan.etat === 'en-cours') && Date.now() < fin) await new Promise(ok => setTimeout(ok, 1500));
    if (!g.plan || g.plan.etat !== 'fini') return [];
    if (g.plan.pdf) return g.plan.pdf;
    const pdf = [];
    const plusieurs = (g.plan.documents || []).length > 1;
    for (const [i, doc] of (g.plan.documents || []).entries()) {
      const r = await fetchAvecAuth(`/api/navigation/taches/${encodeURIComponent(g.plan.id)}/documents/${encodeURIComponent(doc.id)}`);
      if (!r.ok) continue;
      pdf.push({ nom: `Plan cadastral - ${g.commune}${plusieurs ? ` (${i + 1})` : ''}.pdf`.replace(/[\\/:*?"<>|]+/g, ' '), blob: await r.blob() });
    }
    g.plan.pdf = pdf;
    return pdf;
  }

  // Les plans de chaque commune utilisée par ces courriers → Map(clé de commune → [{ nom, blob }]) ; dit ce qui manque.
  async function plansDesCourriersConstitution(docs) {
    const plans = new Map();
    if (!cstEtat || cstEtat.type !== 'vente') return plans;
    const cles = [...new Set(docs.filter(x => x.genre === 'vente').map(x => x.groupe))];
    const manquants = [];
    for (const cle of cles) {
      const g = cstEtat.groupes.find(x => x.cle === cle);
      if (!g) continue;
      majMessageConstitution(`Plan cadastral de ${g.commune} : attente de cadastre.gouv.fr…`);
      const pdf = await plansPdfConstitution(g);
      plans.set(cle, pdf);
      if (!pdf.length) manquants.push(`${g.commune} (${etatPlanConstitution(g).texte.replace(/^Plan non tiré : /, '')})`);
    }
    if (manquants.length) afficherToast(`Sans plan cadastral pour ${manquants.join(', ')}.`, 'OK', null);
    return plans;
  }

  // Ligne « Plan cadastral » d'une commune, dans les données de la vente.
  function renderPlanCommuneConstitution(g) {
    const s = etatPlanConstitution(g);
    const k = escapeOnclickArg(g.cle);
    const dl = s.etat === 'fini' ? 'dl-success' : (s.etat === 'erreur' || s.etat === 'perime' || s.etat === 'sans-commune' ? 'dl-urgent' : 'dl-neutre');
    const tourne = s.etat === 'attente' || s.etat === 'en-cours';
    const docs = s.etat === 'fini' ? (g.plan.documents || []).map((doc, i) => `<button type="button" class="lien-action" onclick="ouvrirDocumentSite('${escapeOnclickArg(g.plan.id)}', '${escapeOnclickArg(doc.id)}')">Voir${(g.plan.documents || []).length > 1 ? ' ' + (i + 1) : ''}</button>`).join(' ') : '';
    const bouton = ['a-tirer', 'perime', 'erreur', 'fini'].includes(s.etat)
      ? `<button type="button" class="lien-action" onclick="lancerPlanConstitution('${k}', true)">${s.etat === 'fini' ? 'Refaire' : 'Tirer le plan'}</button>` : '';
    return `<div class="cst-plan" id="cst-plan-${escapeAttr(g.cle)}">${icone(tourne ? 'spinner' : 'map-pin', null, tourne)} <span class="dot-label ${dl}"><span class="dot"></span>${escapeHtml(s.texte)}</span> ${docs} ${bouton}
      ${infoBulle('Joint à chaque courrier de cette commune : imprimé juste derrière lui, joint à l’email, enregistré dans « Constitution ». Tiré de cadastre.gouv.fr par le serveur, parcelles cochées surlignées en jaune.')}</div>`;
  }
