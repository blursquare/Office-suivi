  // ===== Contrôle de l'urbanisme dans la relecture d'actes (étude 08/10 : « intègre cela à l'outil droit de préemption, appelle
  // cela contrôle de l'urbanisme, et dans un second temps à l'outil relecture d'actes »). Quand la relecture est liée à un
  // dossier, ce que l'outil « Contrôle de l'urbanisme » a gardé sur la fiche (d.preemption : droits de préemption, monuments
  // historiques et sites protégés) est confronté au texte relu : un droit à purger dont l'acte ne parle pas, un bien en zone
  // protégée que l'acte ne signale pas, des travaux extérieurs déclarés en zone protégée sans accord de l'architecte des
  // bâtiments de France. Sans dossier lié, ou sans analyse sur la fiche, rien n'est dit (pas de bruit).

  // Ce que l'acte doit citer pour qu'un droit soit regardé comme traité (purge, renonciation, notification, réponse).
  var MENTIONS_DROITS_URBANISME = {
    dpu: /droit\s+de\s+pr[ée]emption\s+urbain|\bDPU\b|d[ée]claration\s+d.intention\s+d.ali[ée]ner|\bDIA\b/i,
    safer: /\bSAFER\b|soci[ée]t[ée]\s+d.am[ée]nagement\s+foncier/i,
    foret: /droit\s+de\s+pr[ée]f[ée]rence|pr[ée]emption[^.]{0,60}(?:bois|for[êe]t)|(?:bois|for[êe]ts?)[^.]{0,60}pr[ée]emption|L\.?\s*331-(?:19|2[0-4])/i
  };
  var RE_PATRIMOINE_DANS_ACTE = /monuments?\s+historiques?|abords\s+(?:d.un|des?)\s+monument|p[ée]rim[èe]tre\s+d[ée]limit[ée]\s+des\s+abords|sites?\s+(?:inscrits?|class[ée]s?)|site\s+patrimonial\s+remarquable|architecte\s+des\s+b[âa]timents\s+de\s+France|\bABF\b|\bAC\s*[124]\b/i;
  var RE_ACCORD_ABF = /architecte\s+des\s+b[âa]timents\s+de\s+France|\bABF\b|accord\s+de\s+l.architecte/i;

  // Pure : les constats du contrôle de l'urbanisme. mode = 'acte' (projet de vente) ou 'compromis'.
  function constatsControleUrbanisme(entree) {
    const e = entree || {};
    const p = e.preemption;
    if (!p || typeof p !== 'object' || !Array.isArray(p.droits)) return [];
    const texte = String(e.texte || '');
    const acte = e.mode === 'acte';
    const constats = [];
    const droits = droitsPreemptionFiche(p).filter(dr => dr && (dr.statut === 'oui' || dr.statut === 'probable'));
    for (const dr of droits) {
      const re = MENTIONS_DROITS_URBANISME[dr.cle];
      if (!re || re.test(texte)) continue;
      constats.push({
        categorie: 'CONTROLE_URBANISME',
        gravite: acte ? 'IMPORTANT' : 'A_VERIFIER',
        titre: `${dr.titre} à purger : non mentionné dans ${acte ? "l'acte" : "l'avant-contrat"}`,
        description: `Le contrôle de l'urbanisme de la fiche retient ce droit${dr.motif ? ' (' + dr.motif + ')' : ''}. ${acte ? "L'acte doit relater la purge (notification et renonciation ou délai expiré)." : "L'avant-contrat doit le prévoir (condition de non-exercice)."}${dr.formalite ? ' Formalité : ' + dr.formalite : ''}`
      });
    }
    const patrimoine = lignePatrimoinePreemption(p.patrimoine);
    if (patrimoine && patrimoine.statut === 'oui') {
      const exterieurs = (e.travaux || []).filter(t => t && (t.exterieur || t.grosOeuvre) && !RE_ACCORD_ABF.test(t.phrase || ''));
      // Un seul point, quel que soit le nombre de clauses : la même déclaration est souvent reprise de l'avant-contrat au projet.
      if (exterieurs.length) {
        const t = exterieurs[0];
        constats.push({
          categorie: 'CONTROLE_URBANISME', gravite: 'IMPORTANT',
          titre: `Travaux en zone protégée (${patrimoine.titre.toLowerCase()}) : accord de l'architecte des bâtiments de France non mentionné`,
          description: `${patrimoine.motif}. Des travaux extérieurs ou de gros œuvre y exigent l'accord de l'architecte des bâtiments de France : le réclamer avec l'autorisation d'urbanisme.${exterieurs.length > 1 ? ` ${exterieurs.length} clauses de travaux concernées.` : ''}`,
          phrase: t.phrase, page: t.page
        });
      }
      if (!RE_PATRIMOINE_DANS_ACTE.test(texte)) {
        constats.push({
          categorie: 'CONTROLE_URBANISME', gravite: 'A_VERIFIER',
          titre: `Bien en zone protégée (${patrimoine.titre.toLowerCase()}) : non signalé dans ${acte ? "l'acte" : "l'avant-contrat"}`,
          description: `${patrimoine.motif}. ${patrimoine.conseil}`
        });
      }
    }
    return constats;
  }

  // ===== Travaux déclarés dans le compromis (étude 08/10 : « reprends ton idée de détecter les travaux dans le compromis et de
  // pouvoir analyser si les autorisations ont été demandées ») — outil Contrôle de l'urbanisme et fiche. Mêmes lecteurs que la
  // relecture d'actes (detecterTravauxRealises, annexes de diagnostic écartées) ; l'autorisation est « demandée » quand le
  // compromis la cite (déclaration préalable, permis, non-opposition…) — l'outil ne consulte aucun registre des permis.
  var RE_ACHEVEMENT_TRAVAUX = /d[ée]claration\s+attestant\s+l.ach[èe]vement|\bDAACT\b|conformit[ée]|non[-\s]?contestation|certificat\s+de\s+conformit/i;

  // Pure : ce qui est gardé d'un travail lu (la clause bornée : elle se relit sur la fiche).
  function travailPourFiche(t) {
    return {
      libelle: String(t.libelle || '').slice(0, 120), phrase: String(t.phrase || '').slice(0, 500), page: t.page || null,
      grosOeuvre: !!t.grosOeuvre, exterieur: !!t.exterieur, soumisAutorisation: !!t.soumisAutorisation,
      autorisationMentionnee: !!t.autorisationMentionnee, decennaleMentionnee: !!t.decennaleMentionnee,
      factureMentionnee: !!t.factureMentionnee, faitParLeVendeur: !!t.faitParLeVendeur,
      annee: t.annee || null, sousDecennale: t.sousDecennale === undefined ? null : t.sousDecennale
    };
  }

  // Pure : le bilan d'un travail — autorisation, achèvement, décennale, architecte des bâtiments de France en zone protégée.
  // points : { etat: 'ok' | 'manque' | 'info', texte }. statut : 'reclamer' dès qu'un point manque, sinon 'ok'.
  function bilanTravailUrbanisme(t, enZoneProtegee, anneeCourante) {
    const points = [];
    const phrase = String(t.phrase || '');
    if (t.autorisationMentionnee) {
      points.push({ etat: 'ok', texte: 'Autorisation d’urbanisme citée (déclaration préalable ou permis)' });
      points.push(RE_ACHEVEMENT_TRAVAUX.test(phrase)
        ? { etat: 'ok', texte: 'Achèvement / conformité cités' }
        : { etat: 'manque', texte: 'Déclaration attestant l’achèvement et non-contestation de la conformité non citées : les réclamer' });
    } else {
      const ancien = t.annee && anneeCourante && anneeCourante - t.annee >= 10;
      points.push({ etat: 'manque', texte: ancien
        ? `Aucune autorisation citée : réclamer la déclaration préalable ou le permis ; travaux de ${t.annee}, prescription à vérifier (art. L.421-9 du code de l’urbanisme)`
        : 'Aucune autorisation citée : réclamer la déclaration préalable ou le permis de construire' });
    }
    if (t.sousDecennale === true) {
      if (t.decennaleMentionnee) points.push({ etat: 'ok', texte: 'Assurance décennale citée' });
      else if (t.faitParLeVendeur) points.push({ etat: 'manque', texte: 'Faits par le vendeur lui-même : pas de décennale, à indiquer à l’acte' });
      else points.push({ etat: 'manque', texte: `Moins de dix ans (${t.annee}) : attestation d’assurance décennale de l’entreprise et factures à réclamer` });
    } else if (t.sousDecennale === false) {
      points.push({ etat: 'info', texte: `Plus de dix ans (${t.annee}) : garantie décennale expirée` });
    } else {
      points.push({ etat: 'manque', texte: 'Année non lue : dater les travaux (factures) pour savoir si la décennale court' });
    }
    if (enZoneProtegee) {
      points.push(RE_ACCORD_ABF.test(phrase)
        ? { etat: 'ok', texte: 'Accord de l’architecte des bâtiments de France cité' }
        : { etat: 'manque', texte: 'Zone protégée : accord de l’architecte des bâtiments de France à réclamer' });
    }
    return { statut: points.some(p => p.etat === 'manque') ? 'reclamer' : 'ok', points };
  }

  // Pure : les travaux à montrer (soumis à autorisation) avec leur bilan, et le nombre de travaux intérieurs laissés de côté.
  function analyseTravauxUrbanisme(liste, patrimoine, aujourdHui) {
    const tous = Array.isArray(liste) ? liste.filter(Boolean) : [];
    const ligne = lignePatrimoinePreemption(patrimoine);
    const enZone = !!(ligne && ligne.statut === 'oui');
    const annee = Number(String(aujourdHui || new Date().toISOString()).slice(0, 4));
    const soumis = tous.filter(t => t.soumisAutorisation);
    return {
      travaux: soumis.map(t => Object.assign({}, t, bilanTravailUrbanisme(t, enZone, annee))),
      interieurs: tous.length - soumis.length,
      enZoneProtegee: enZone
    };
  }

  // Pure : le titre d'un travail — sa nature (« Travaux : agrandissement »), plutôt qu'un bout de clause.
  function natureTravailUrbanisme(t) {
    const mots = String((t && t.phrase) || '').match(new RegExp(RE_TRAVAUX_MOT.source, 'gi')) || [];
    const mot = mots.find(x => !/^travaux$/i.test(x));
    return mot ? 'Travaux : ' + mot.toLowerCase().replace(/\s+/g, ' ') : 'Travaux';
  }

  var LIBELLES_TRAVAUX_URBANISME = { reclamer: 'À réclamer', ok: 'Cité' };
  var CLASSES_TRAVAUX_URBANISME = { reclamer: 'dl-pret', ok: 'dl-success' };
  var ICONES_POINTS_TRAVAUX = { ok: 'check', manque: 'alert-triangle', info: 'info' };

  function renderTravauxUrbanismeListe(analyse, compact) {
    if (!analyse.travaux.length) {
      return `<p class="hint">Aucun travail extérieur ni de gros œuvre déclaré${analyse.interieurs ? ` (${analyse.interieurs} travail${analyse.interieurs > 1 ? 'x' : ''} intérieur${analyse.interieurs > 1 ? 's' : ''}, sans autorisation exigée)` : ''}.</p>`;
    }
    return `<div class="pr-droits">${analyse.travaux.map(t => `<div class="pr-droit pr-droit-${t.statut === 'reclamer' ? 'oui' : 'non'}">
        <div class="pr-droit-tete"><span class="pr-droit-titre">${escapeHtml(natureTravailUrbanisme(t))}${t.annee ? ` (${t.annee})` : ''}</span>
          <span class="dot-label ${CLASSES_TRAVAUX_URBANISME[t.statut]}"><span class="dot"></span>${LIBELLES_TRAVAUX_URBANISME[t.statut]}</span></div>
        <div class="pr-droit-motif">${t.grosOeuvre ? 'Gros œuvre' : 'Extérieur du bien'}${t.page ? ` · page ${t.page}` : ''}</div>
        ${t.points.filter(p => !compact || p.etat !== 'ok').map(p => `<div class="pr-droit-formalite pr-travaux-${p.etat}">${icone(ICONES_POINTS_TRAVAUX[p.etat])} ${escapeHtml(p.texte)}</div>`).join('')}
        ${!compact && t.phrase ? `<details class="pr-travaux-clause"><summary>Clause du compromis</summary><p>${escapeHtml(t.phrase)}</p></details>` : ''}
      </div>`).join('')}</div>
      ${analyse.interieurs ? `<p class="hint">${analyse.interieurs} travail${analyse.interieurs > 1 ? 'x' : ''} intérieur${analyse.interieurs > 1 ? 's' : ''} sans autorisation exigée, non détaillé${analyse.interieurs > 1 ? 's' : ''}.</p>` : ''}`;
  }

  // L'outil : section « Travaux et autorisations ».
  function renderTravauxPreemption() {
    const zone = document.getElementById('pr-travaux');
    if (!zone || !prEtat) return;
    const tr = prEtat.travaux || {};
    const d = prEtat.dossierId ? dossiers.find(x => x.id === prEtat.dossierId) : null;
    const boutons = `<div class="pr-zonage-actions">
        ${d && d.dossierLie && d.nasDossier ? `<wa-button appearance="outlined" size="s" onclick="lireTravauxCompromisPreemption()"${tr.lecture ? ' loading' : ''}>${icone('file-text')} Lire le compromis du dossier</wa-button>` : ''}
        <span class="pr-depot-compromis"><wa-button appearance="outlined" size="s" onclick="document.getElementById('pr-travaux-fichier').click()">${icone('upload')} Déposer un compromis (PDF)</wa-button>
          <input type="file" id="pr-travaux-fichier" accept="application/pdf,.pdf" style="display:none" onchange="deposerCompromisTravauxPreemption(this)"></span>
      </div>`;
    const etat = tr.lecture ? '<p class="hint">Lecture du compromis…</p>'
      : tr.erreur ? `<p class="pr-erreur">${icone('alert-triangle')} ${escapeHtml(tr.erreur)}</p>`
      : !tr.liste ? `<p class="hint">Les travaux déclarés par le vendeur sont lus dans le compromis ; pour chacun, CLAIRE dit si l’autorisation d’urbanisme, l’achèvement et la décennale y sont cités.</p>` : '';
    const liste = tr.liste
      ? `<p class="hint">Lu dans « ${escapeHtml(tr.source || 'compromis')} »${infoBulle('Une autorisation est regardée comme demandée quand le compromis la cite (déclaration préalable, permis, non-opposition). CLAIRE ne consulte aucun registre des permis : en cas de doute, demander à la mairie. Les annexes de diagnostic (DPE, plomb) ne sont pas lues comme des travaux.')}</p>
        ${renderTravauxUrbanismeListe(analyseTravauxUrbanisme(tr.liste, patrimoinePreemption(prEtat) || (d && d.preemption && d.preemption.patrimoine)))}`
      : '';
    zone.innerHTML = boutons + etat + liste;
  }

  function appliquerTexteTravauxPreemption(lu, source) {
    const liste = detecterTravauxRealises(lu.texte, lu.pages || [], new Date().toISOString().slice(0, 10));
    prEtat.travaux = { lecture: false, erreur: '', source, liste: liste.map(travailPourFiche) };
  }

  async function lireTravauxCompromisPreemption() {
    const d = prEtat && prEtat.dossierId ? dossiers.find(x => x.id === prEtat.dossierId) : null;
    if (!d || (prEtat.travaux && prEtat.travaux.lecture)) return;
    prEtat.travaux = Object.assign({}, prEtat.travaux, { lecture: true, erreur: '' });
    renderTravauxPreemption();
    const lu = await recupererTextCompromisDossier(d);
    if (!prEtat || prEtat.dossierId !== d.id) return;
    if (lu) { appliquerTexteTravauxPreemption(lu, lu.nom); noterVerificationPoste('travaux-compromis-nas', { detail: `${prEtat.travaux.liste.length} travail(x) lu(s)` }); }
    else prEtat.travaux = Object.assign({}, prEtat.travaux, { lecture: false, erreur: 'Compromis introuvable sur le NAS ou illisible : déposez le PDF.' });
    renderPreemption();
  }

  async function deposerCompromisTravauxPreemption(input) {
    const f = input && input.files && input.files[0];
    if (!f || !prEtat) return;
    input.value = '';
    if (!window.pdfjsLib) { prEtat.travaux = { erreur: 'Lecteur PDF indisponible (connexion à internet ?).' }; renderTravauxPreemption(); return; }
    prEtat.travaux = Object.assign({}, prEtat.travaux, { lecture: true, erreur: '' });
    renderTravauxPreemption();
    try {
      const pdf = await pdfjsLib.getDocument({ data: await f.arrayBuffer(), verbosity: (pdfjsLib.VerbosityLevel ? pdfjsLib.VerbosityLevel.ERRORS : 0) }).promise;
      const lu = await lireTextePdfParPage(pdf);
      if (String(lu.texte || '').trim().length < 20) throw new Error('texte vide');
      appliquerTexteTravauxPreemption(lu, f.name);
    } catch (e) {
      console.warn('Contrôle de l’urbanisme : compromis illisible', e && e.message);
      prEtat.travaux = { lecture: false, erreur: 'Ce PDF n’a pas pu être lu (scan sans texte ?).' };
    }
    renderPreemption();
  }

  // Fiche › Pièces et analyse : les travaux gardés (enregistrés depuis l'outil ou lus à l'ajout du dossier).
  function renderTravauxFicheUrbanisme(p) {
    const tr = p && p.travaux;
    if (!tr || !Array.isArray(tr.liste)) return '';
    const a = analyseTravauxUrbanisme(tr.liste, p.patrimoine);
    if (!a.travaux.length) return `<div class="pr-fiche-ligne"><span class="dot-label dl-success"><span class="dot"></span>Aucun</span>
        <span class="pr-fiche-titre">Travaux déclarés</span><span class="hint">Aucun travail extérieur ni de gros œuvre dans le compromis</span></div>`;
    return a.travaux.map(t => `<div class="pr-fiche-ligne">
        <span class="dot-label ${CLASSES_TRAVAUX_URBANISME[t.statut]}"><span class="dot"></span>${LIBELLES_TRAVAUX_URBANISME[t.statut]}</span>
        <span class="pr-fiche-titre">${escapeHtml(natureTravailUrbanisme(t))}${t.annee ? ` (${t.annee})` : ''}</span>
        <span class="hint">${escapeHtml(t.points.filter(x => x.etat === 'manque').map(x => x.texte).join(' · ') || 'Autorisation, achèvement et décennale cités')}</span>
      </div>`).join('');
  }

  // À l'ajout d'un dossier (analyse automatique des droits) : travaux du compromis du NAS lus une fois, sans bruit.
  async function lireTravauxDossierAuto(id) {
    const d0 = dossiers.find(x => x.id === id);
    if (!d0 || !d0.preemption || d0.preemption.travaux || !d0.dossierLie || !d0.nasDossier) return;
    const lu = await recupererTextCompromisDossier(d0);
    const d = dossiers.find(x => x.id === id);
    if (!d || !d.preemption || d.preemption.travaux) return;
    if (!lu) return;
    const liste = detecterTravauxRealises(lu.texte, lu.pages || [], new Date().toISOString().slice(0, 10)).map(travailPourFiche);
    d.preemption.travaux = { le: new Date().toISOString(), source: lu.nom, auto: true, liste };
    noterVerificationPoste('travaux-compromis-nas', { detail: `${liste.length} travail(x) lu(s)` });
    const a = analyseTravauxUrbanisme(liste, d.preemption.patrimoine);
    if (a.travaux.length) ajouterHistorique(d, `Travaux déclarés dans le compromis : ${a.travaux.length} (${a.travaux.filter(t => t.statut === 'reclamer').length} avec une pièce à réclamer)`);
    sauvegarder(d);
  }
