  // Ce qu'Authentic a donné à un dossier, gardé sur le serveur (étude 16/10 : « la connexion entre Authentic et CLAIRE est bancale, il manque
  // souvent des données » ; choix : « pages gardées par dossier sur le serveur et Relire depuis Authentic », puis « encadré Reçu d'Authentic
  // sur la fiche »). Le serveur garde la dernière version de chaque page rangée dans un dossier (server/src/pagesAuthentic.js) ; la fiche
  // montre ce qui a été reçu et quand, ce qui manque, et peut tout relire avec les règles du jour sans retourner dans Authentic.

  const recuAuthenticParDossier = new Map(); // dossierId → { t, pages, enCours }
  const relecturesAuthenticEnCours = new Set();

  // Pure : la clé d'une page dans son dossier, donnée au serveur avec le résultat (une page revue remplace la précédente) — la page du
  // dossier une fois, une fiche client par personne (prénom et nom), une fiche bien par adresse, sinon par parcelles.
  function clePageReleveAuthentic(capture) {
    try { return clePageReleveAuthenticBrute(capture); } catch (_) { return ''; } // le résultat part quand même (clé tirée par le serveur)
  }
  function clePageReleveAuthenticBrute(capture) {
    const net = t => normaliserPourRecherche(String(t || '')).replace(/[^a-z0-9]+/g, ' ').trim();
    const type = typePageAuthentic(capture);
    if (type === 'client') {
      const p = clientDepuisFicheAuthentic(capture);
      const ident = p ? net([p.prenom, p.nom].filter(Boolean).join(' ')) : '';
      return ident ? 'client:' + ident.slice(0, 180) : '';
    }
    if (type === 'bien') {
      const b = bienDepuisFicheAuthentic(capture);
      const adresse = b && b.adresse ? net(b.adresse.texte || '') : '';
      const parcelles = b ? (b.parcelles || []).map(p => net(`${p.section} ${p.numero}`)).join(' ') : '';
      return (adresse || parcelles) ? 'bien:' + (adresse || parcelles).slice(0, 180) : '';
    }
    // Promesse, avenant… : jamais gardée (relecture du 17/10 — elle remplaçait la page de la VENTE gardée sous la même clé, que le serveur
    // lui donne aussi quand le poste ne la reconnaît pas).
    const sous = sousDossierLuAuthentic(capture);
    if (sous && sous !== 'vente' && sous !== 'succession') return 'ignorer';
    return type === 'dossier' || type === 'gestion' ? 'dossier' : '';
  }

  // Le sous-dossier de la page, une succession comprise même quand son intitulé ne le dit pas (« 1 - Mme X veuve de M. Y » avec ses comparants
  // Défunt / Héritier : relecture du 17/10).
  function sousDossierLuAuthentic(capture) {
    const sous = sousDossierAuthentic(capture);
    if (sous === 'autre' && pageSuccessionAuthentic(capture, intituleDossierAuthentic(capture))) return 'succession';
    return sous;
  }

  // ---------- Relire depuis Authentic ----------

  // Rejoue sur le dossier toutes les pages gardées pour lui, de la plus ancienne à la plus récente, avec les règles du jour (mêmes lecteurs
  // qu'une page qui arrive : Authentic d'abord, une valeur déjà reprise qui a changé est PROPOSÉE, jamais écrite d'office).
  async function relireDepuisAuthentic(id) {
    const d = dossiers.find(x => x.id === id);
    if (!d || relecturesAuthenticEnCours.has(id)) return;
    relecturesAuthenticEnCours.add(id);
    majRecuAuthenticFiche(id);
    let pages = [];
    try {
      const r = await fetchAvecAuth(`/api/authentic/dossier/${encodeURIComponent(id)}/pages?contenu=1`);
      if (r.ok) pages = ((await r.json()).pages || []);
      else throw new Error('réponse ' + r.status);
    } catch (e) {
      relecturesAuthenticEnCours.delete(id);
      majRecuAuthenticFiche(id);
      afficherToast('Relire depuis Authentic : serveur injoignable.', 'OK', null);
      return;
    }
    const textes = [];
    let modifie = false;
    try {
      for (const page of pages) {
        if (!pageRelisibleAuthentic(d, page.capture)) continue;
        const partage = partagerFicheConjointAuthentic(page.capture);
        const r = appliquerReleveSurDossier(d, partage ? partage.principale : page.capture, undefined, dossiers);
        if (r.modifie) modifie = true;
        textes.push(...(r.textes || []));
        if (partage && conjointPartieDuDossierAuthentic(d, clientDepuisFicheAuthentic(partage.conjoint))) {
          const rc = appliquerReleveSurDossier(d, partage.conjoint, undefined, dossiers);
          if (rc.modifie) modifie = true;
          textes.push(...(rc.textes || []));
        }
      }
      if (modifie) {
        d.historique = d.historique || [];
        d.historique.push({ date: new Date().toISOString(), texte: `Relu depuis Authentic (${pages.length} page${pages.length > 1 ? 's' : ''})` });
        await sauvegarder(d);
        render();
      }
      completerDossierDepuisRelevesRecents(d);
      afficherToast(!pages.length ? 'Aucune page d’Authentic gardée pour ce dossier : ouvrez-le dans Authentic.'
        : modifie ? `Relu depuis Authentic : ${textes[0] || 'fiche mise à jour'}${textes.length > 1 ? ` (+${textes.length - 1})` : ''}.`
          : `Relu depuis Authentic (${pages.length} page${pages.length > 1 ? 's' : ''}) : rien de neuf.`, 'OK', null);
    } catch (e) {
      noterJournalTechnique({ categorie: 'erreur-poste', message: 'Relire depuis Authentic : ' + String((e && e.message) || e).slice(0, 120) });
      afficherToast('Relire depuis Authentic : une page n’a pas pu être relue.', 'OK', null);
    } finally {
      relecturesAuthenticEnCours.delete(id);
      recuAuthenticParDossier.delete(id);
      majRecuAuthenticFiche(id);
    }
  }

  // Pure : une page gardée se relit-elle sur ce dossier ? Les mêmes garde-fous qu'à l'arrivée d'une page (appliquerReleveAuthentic) :
  // jamais la page d'un sous-dossier autre que la vente (promesse, avenant — son « Signé le » et ses pièces ne sont pas ceux de la
  // vente), jamais celle d'un ancien dossier des mêmes clients (acte signé avant ce dossier) sauf intitulé ou référence rattachés.
  function pageRelisibleAuthentic(d, capture) {
    if (!d || !capture) return false;
    const type = typePageAuthentic(capture);
    if (type === 'client' || type === 'bien') return true;
    const sous = sousDossierLuAuthentic(capture);
    if (sous && sous !== 'vente' && sous !== 'succession') return false;
    const lu = intituleDossierAuthentic(capture);
    const reference = referenceDossierAuthentic(capture);
    const rattache = (reference && d.referenceAuthentic === reference) || (lu && (d.intitulesAuthentic || []).includes(cleIntituleAuthentic(lu)));
    if (rattache) return true;
    if (ancienDossierAuthentic(capture, d)) return false;
    // La page doit désigner CE dossier (relecture du 17/10 : une page d'un autre dossier rangée par erreur revenait à la relecture).
    if (autreReferenceAuthentic(d, referenceAuthenticValide(reference) ? reference : '')) return false;
    if (!lu && !referenceAuthenticValide(reference)) return true;
    return dossierPourIntituleAuthentic(lu, dossiers, adresseBienPageAuthentic(capture), reference) === d;
  }

  // ---------- Encadré « Reçu d'Authentic » ----------

  // Pure : ce qui manque d'après la fiche et les pages reçues — la page du dossier, la fiche client de chaque personne (jamais pour une
  // société, qui n'en a pas), une fiche bien quand aucun bien n'a de parcelle. [{ texte }].
  function manquesAuthenticDossier(d, pages) {
    const liste = Array.isArray(pages) ? pages : [];
    const manques = [];
    if (!liste.some(p => p.nature === 'dossier')) manques.push({ texte: 'Page du dossier (comparants, pièces, rédaction)' });
    (Array.isArray(d && d.parties) ? d.parties : []).filter(p => p && p.qualitePersonne !== 'morale' && String(p.nom || '').trim()).forEach(p => {
      if (!ficheClientDe(d, p.nom)) manques.push({ texte: `Fiche client de ${p.nom}` });
    });
    if (!liste.some(p => p.nature === 'bien') && !parcellesDossier(d).length) manques.push({ texte: 'Fiche bien (adresse, parcelles, lots)' });
    return manques;
  }

  // Pure : le libellé d'une page reçue.
  function libellePageRecueAuthentic(p) {
    const qui = String(p.cle || '').replace(/^(client|bien):/, '');
    if (p.nature === 'dossier') return 'Page du dossier';
    if (p.nature === 'client') return 'Fiche client' + (qui ? ' — ' + qui.toUpperCase() : '');
    if (p.nature === 'bien') return 'Fiche bien' + (qui ? ' — ' + qui : '');
    return 'Page';
  }

  function renderRecuAuthenticFiche(d) {
    if (!d || !d.id) return '';
    const e = recuAuthenticParDossier.get(d.id);
    if (!e || (!e.enCours && Date.now() - e.t > 60000)) chargerRecuAuthentic(d.id);
    return `<div class="recu-authentic" data-recu-authentic="${escapeAttr(d.id)}">${htmlRecuAuthentic(d, e)}</div>`;
  }

  function htmlRecuAuthentic(d, e) {
    const pages = e && e.pages ? e.pages : null;
    const relecture = relecturesAuthenticEnCours.has(d.id);
    const bouton = `<wa-button appearance="outlined" size="s" pill type="button" class="action-rapide" ${relecture || !pages || !pages.length ? 'disabled ' : ''}onclick="relireDepuisAuthentic('${escapeOnclickArg(d.id)}')" title="Relire toutes les pages d’Authentic gardées pour ce dossier avec les règles du jour">${relecture ? icone('spinner', null, true) + ' Relecture…' : icone('rotate-ccw') + ' Relire depuis Authentic'}</wa-button>`;
    if (!pages) return `<span class="hint">…</span>`;
    const recues = pages.slice(0, 12).map(p => `<li><span>${escapeHtml(libellePageRecueAuthentic(p))}</span><span class="hint">${escapeHtml(p.recueLe ? formatDateHeureCourte(p.recueLe) : '')}</span></li>`).join('');
    const manques = manquesAuthenticDossier(d, pages).map(m => `<li class="recu-manque">${icone('alert-triangle')}<span>${escapeHtml(m.texte)}</span></li>`).join('');
    return `${pages.length ? `<ul class="recu-liste">${recues}</ul>` : '<p class="hint">Rien de reçu d’Authentic pour ce dossier depuis le 17/10.</p>'}
      ${manques ? `<div class="recu-sous-titre">À ouvrir dans Authentic</div><ul class="recu-liste">${manques}</ul>` : ''}
      <div class="recu-actions">${bouton}</div>`;
  }

  // Pure : « 17/10 à 09:42 ».
  function formatDateHeureCourte(iso) {
    const t = new Date(iso);
    if (isNaN(t)) return '';
    const deux = n => String(n).padStart(2, '0');
    return `${deux(t.getDate())}/${deux(t.getMonth() + 1)} à ${deux(t.getHours())}:${deux(t.getMinutes())}`;
  }

  async function chargerRecuAuthentic(id) {
    const e = recuAuthenticParDossier.get(id) || { t: 0, pages: null };
    e.enCours = true;
    recuAuthenticParDossier.set(id, e);
    try {
      const r = await fetchAvecAuth(`/api/authentic/dossier/${encodeURIComponent(id)}/pages`);
      if (r.ok) e.pages = (await r.json()).pages || [];
    } catch (_) { /* hors ligne : l'encadré reste « … » */ }
    e.t = Date.now();
    e.enCours = false;
    majRecuAuthenticFiche(id);
  }

  function majRecuAuthenticFiche(id) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    document.querySelectorAll('.recu-authentic').forEach(el => { if (el.dataset.recuAuthentic === id) el.innerHTML = htmlRecuAuthentic(d, recuAuthenticParDossier.get(id)); });
  }

  // ---------- Fiche bien : tout ce qu'Authentic en dit ----------

  // Pure : tous les champs renseignés de la fiche bien d'Authentic (étude 17/10 : « il faut bien tout récupérer d'Authentic pour les fiches,
  // toutes les données utiles ») — type, désignation, lotissement, surfaces, usage, servitudes… —, libellé lisible et valeur, sans les champs
  // techniques ni l'adresse et le cadastre déjà lus à part. 30 au plus, 200 caractères par valeur.
  function detailsFicheBienAuthentic(champs) {
    const vus = new Set();
    const details = [];
    (champs || []).forEach(c => {
      if (!c || details.length >= 30) return;
      const brut = String(c.libelle || '').replace(/\*/g, '').replace(/\s+/g, ' ').trim();
      const valeur = String(c.valeur == null ? '' : c.valeur).replace(/\s+/g, ' ').trim();
      if (!brut || !valeur || brut.length > 60 || /[:_]|^j_id|^form|^ui-/i.test(brut) || /^(true|false|off|on)$/i.test(valeur) && !/lotissement|copropri/i.test(brut)) return;
      const net = libelleNetAuthentic(brut);
      if (/^(adresse|numero|n°|voie|type de voie|nom de (la )?voie|complement|code postal|cp|ville|commune|pays|section|prefixe|numero de parcelle|lieu-dit|lieu dit)$/.test(net)) return;
      if (vus.has(net)) return;
      vus.add(net);
      details.push({ libelle: brut.slice(0, 60), valeur: valeur.slice(0, 200) });
    });
    return details;
  }

  // Pure : le dossier de CLAIRE désigné par l'onglet actif d'Authentic (« N - … » ou « VTE X / Y »), ou null.
  function dossierOngletActifAuthentic(capture, liste) {
    // La référence de l'onglet actif d'abord, quel que soit son titre (succession, titre coupé — relecture 19/10).
    const actif = ((capture && capture.onglets) || []).find(x => x && x.actif);
    const ref = actif ? (referencesDansTexteAuthentic(actif.titre)[0] || '') : '';
    const parRef = ref ? (liste || []).filter(d => d && !d.deleted && d.referenceAuthentic === ref) : [];
    if (parRef.length === 1) return parRef[0];
    const o = ongletDossierActifAuthentic(capture);
    const intitule = intituleOngletActifAuthentic(capture);
    return intitule ? dossierPourIntituleAuthentic(intitule, liste, '', referenceDossierAuthentic({ onglets: [o] })) : null;
  }
  function ongletDossierActifAuthentic(capture) {
    // Titre réel : référence en tête (« A 2026 00106 VTE X / Y », relecture 19/10) — retirée avant de reconnaître le dossier.
    return ((capture && capture.onglets) || []).find(x => x && x.actif && (/^\s*\d{1,6}\s*-/.test(sansReferenceAuthentic(x.titre)) || RE_INTITULE_VTE_SEUL_AUTHENTIC.test(sansReferenceAuthentic(x.titre)))) || null;
  }
  // Pure : l'onglet actif d'Authentic est celui d'un AUTRE dossier que `noms` (nom du dernier dossier vu) ? Un onglet de dossier (VTE,
  // Vente, SUCC, Succession, « N - », référence) dont aucun nom ne se retrouve dans ce dossier — même coupé à l'affichage
  // (« VTE BOURNOUVE... ») — n'est pas lui (étude 19/10 : fiche bien d'une autre vente rangée dans la succession VIEL). Sans onglet de
  // dossier actif : on ne sait pas, `false`.
  function ongletActifAutreDossierAuthentic(capture, noms, reference) {
    const o = ((capture && capture.onglets) || []).find(x => x && x.actif);
    const titre = o ? sansReferenceAuthentic(o.titre) : '';
    const refOnglet = o ? (referencesDansTexteAuthentic(o.titre)[0] || '') : '';
    // La référence d'abord (relecture 19/10) : différente = un autre dossier (ancien dossier des mêmes clients compris), égale = le même.
    if (refOnglet && reference) return refOnglet !== reference;
    if (!titre || !(/^\s*(?:\d{1,6}\s*-|vte\b|vente\b|succ\b|succession\b)/i.test(titre) || refOnglet)) return false;
    const mots = (t) => normaliserPourRecherche(String(t || '')).replace(/\.{2,}|…/g, ' ').split(/[^a-z0-9]+/).filter(m => m.length >= 3 && !/^(vte|vente|succ|succession|veuve|epouse|epoux|consorts?)$/.test(m));
    const duTitre = mots(titre);
    if (!duTitre.length) return false;
    const duDossier = new Set(mots(noms));
    // Un mot coupé (« BOURNOUVE... ») compte s'il commence un nom du dossier.
    return !duTitre.some(m => duDossier.has(m) || [...duDossier].some(x => x.startsWith(m) && m.length >= 4));
  }
  // Pure : l'intitulé du dossier de l'onglet actif d'Authentic (même absent de CLAIRE), '' sinon — une fiche ouverte dans l'onglet d'un AUTRE
  // dossier n'est jamais celle du dernier dossier vu (étude 19/10 : fiche bien d'une vente rangée dans la succession VIEL).
  function intituleOngletActifAuthentic(capture) {
    const o = ongletDossierActifAuthentic(capture);
    return o ? (intituleNumeroteAuthentic({ onglets: [o], champs: [], tableaux: [], texte: '' }).intitule || '') : '';
  }
