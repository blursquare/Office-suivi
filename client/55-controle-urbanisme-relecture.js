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
  // sitadel : les autorisations que Sitadel connaît sur les parcelles (null = pas cherché).
  function bilanTravailUrbanisme(t, enZoneProtegee, anneeCourante, sitadel) {
    const points = [];
    const phrase = String(t.phrase || '');
    const connues = Array.isArray(sitadel) ? sitadel.filter(a => a && a.type !== 'PD' && a.etat !== 'Annulé') : [];
    const achevee = connues.find(a => a.acheveLe);
    if (t.autorisationMentionnee) {
      points.push({ etat: 'ok', court: 'Autorisation citée', texte: 'Autorisation d’urbanisme citée (déclaration préalable ou permis)' });
      points.push(RE_ACHEVEMENT_TRAVAUX.test(phrase)
        ? { etat: 'ok', court: 'Achèvement cité', texte: 'Achèvement / conformité cités' }
        : achevee
          ? { etat: 'ok', court: 'Achèvement (Sitadel)', texte: `Achèvement déclaré le ${formatDateFr(achevee.acheveLe)} (${achevee.type} n° ${achevee.numero}, Sitadel) : réclamer la non-contestation de la conformité` }
             : { etat: 'manque', court: 'Achèvement à réclamer', texte: 'Déclaration attestant l’achèvement et non-contestation de la conformité non citées : les réclamer' });
    } else if (connues.length) {
      const a = connues[0];
      points.push({ etat: 'manque', court: `${a.type} ${String(a.autoriseLe || '').slice(0, 4)} dans Sitadel`.replace(/ +dans/, ' dans'), texte: `Aucune autorisation citée dans le compromis, mais Sitadel connaît ${connues.length > 1 ? connues.length + ' autorisations, dont ' : ''}${a.type} n° ${a.numero}${a.autoriseLe ? ' du ' + formatDateFr(a.autoriseLe) : ''}${a.etat ? ' (' + a.etat.toLowerCase() + ')' : ''} : la réclamer et vérifier qu’elle couvre ces travaux` });
    } else {
      const ancien = t.annee && anneeCourante && anneeCourante - t.annee >= 10;
      points.push({ etat: 'manque', court: ancien ? 'Autorisation ou prescription' : 'Autorisation à réclamer', texte: ancien
        ? `Aucune autorisation citée : réclamer la déclaration préalable ou le permis ; travaux de ${t.annee}, prescription à vérifier (art. L.421-9 du code de l’urbanisme)`
        : 'Aucune autorisation citée : réclamer la déclaration préalable ou le permis de construire' });
      if (Array.isArray(sitadel) && (!t.annee || t.annee >= 2013)) {
        points.push({ etat: 'info', court: 'Rien dans Sitadel', texte: 'Rien dans Sitadel pour ces parcelles (Sitadel ne recense, depuis 2013, que les autorisations qui créent un logement ou des locaux, les permis d’aménager et de démolir)' });
      }
    }
    if (t.sousDecennale === true) {
      if (t.decennaleMentionnee) points.push({ etat: 'ok', court: 'Décennale citée', texte: 'Assurance décennale citée' });
      else if (t.faitParLeVendeur) points.push({ etat: 'manque', court: 'Sans décennale', texte: 'Faits par le vendeur lui-même : pas de décennale, à indiquer à l’acte' });
      else points.push({ etat: 'manque', court: 'Décennale à réclamer', texte: `Moins de dix ans (${t.annee}) : attestation d’assurance décennale de l’entreprise et factures à réclamer` });
    } else if (t.sousDecennale === false) {
      points.push({ etat: 'info', court: 'Décennale expirée', texte: `Plus de dix ans (${t.annee}) : garantie décennale expirée` });
    } else {
      points.push({ etat: 'manque', court: 'Année à dater', texte: 'Année non lue : dater les travaux (factures) pour savoir si la décennale court' });
    }
    if (enZoneProtegee) {
      points.push(RE_ACCORD_ABF.test(phrase)
        ? { etat: 'ok', court: 'Accord ABF cité', texte: 'Accord de l’architecte des bâtiments de France cité' }
           : { etat: 'manque', court: 'Accord ABF à réclamer', texte: 'Zone protégée : accord de l’architecte des bâtiments de France à réclamer' });
    }
    return { statut: points.some(p => p.etat === 'manque') ? 'reclamer' : 'ok', points };
  }

  // Pure : les travaux à montrer (soumis à autorisation) avec leur bilan, et le nombre de travaux intérieurs laissés de côté.
  function analyseTravauxUrbanisme(liste, patrimoine, aujourdHui, sitadel) {
    const tous = Array.isArray(liste) ? liste.filter(Boolean) : [];
    const ligne = lignePatrimoinePreemption(patrimoine);
    const enZone = !!(ligne && ligne.statut === 'oui');
    const annee = Number(String(aujourdHui || new Date().toISOString()).slice(0, 4));
    const soumis = tous.filter(t => t.soumisAutorisation);
    return {
      travaux: soumis.map(t => Object.assign({}, t, bilanTravailUrbanisme(t, enZone, annee, sitadel))),
      interieurs: tous.length - soumis.length,
      enZoneProtegee: enZone
    };
  }

  // Pure : le titre d'un travail — sa nature (« Agrandissement »), plutôt qu'un bout de clause.
  function natureTravailUrbanisme(t) {
    const mots = String((t && t.phrase) || '').match(new RegExp(RE_TRAVAUX_MOT.source, 'gi')) || [];
    const mot = mots.find(x => !/^travaux$/i.test(x));
    const m = mot ? mot.toLowerCase().replace(/\s+/g, ' ') : '';
    return m ? m.charAt(0).toUpperCase() + m.slice(1) : 'Travaux';
  }

  var LIBELLES_TRAVAUX_URBANISME = { reclamer: 'À réclamer', ok: 'Tout est cité' };
  var CLASSES_TRAVAUX_URBANISME = { reclamer: 'dl-pret', ok: 'dl-success' };
  var ICONES_POINTS_TRAVAUX = { ok: 'check', manque: 'alert-triangle', info: 'info' };

  // Une pastille courte ; la phrase entière se lit au survol (classe avec-bulle, même bulle que la pastille « i »).
  function puceControleTravaux(p) {
    return `<span class="pr-puce pr-puce-${p.etat} avec-bulle" tabindex="0" data-info="${escapeAttr(p.texte)}">${icone(ICONES_POINTS_TRAVAUX[p.etat])}${escapeHtml(p.court || p.texte)}</span>`;
  }

  function renderTravauxUrbanismeListe(analyse) {
    const interieurs = analyse.interieurs ? `<p class="hint">+ ${analyse.interieurs} travail${analyse.interieurs > 1 ? 'x' : ''} intérieur${analyse.interieurs > 1 ? 's' : ''} (sans autorisation)</p>` : '';
    if (!analyse.travaux.length) return `<p class="pr-vide">${icone('check')} Aucun travail extérieur ni de gros œuvre déclaré</p>${interieurs}`;
    return `<div class="pr-travaux">${analyse.travaux.map(t => `<div class="pr-travail pr-travail-${t.statut}">
        <div class="pr-travail-tete">
          <div><div class="pr-travail-titre">${escapeHtml(natureTravailUrbanisme(t))}</div>
            <div class="pr-travail-meta">${[t.annee, t.grosOeuvre ? 'gros œuvre' : 'extérieur', t.page ? 'p. ' + t.page : ''].filter(Boolean).join(' · ')}</div></div>
          <span class="dot-label ${CLASSES_TRAVAUX_URBANISME[t.statut]}"><span class="dot"></span>${LIBELLES_TRAVAUX_URBANISME[t.statut]}</span>
        </div>
        <div class="pr-puces">${t.points.map(puceControleTravaux).join('')}${t.phrase ? `<span class="pr-puce pr-puce-clause avec-bulle" tabindex="0" data-info="${escapeAttr(t.phrase)}">${icone('file-text')}Clause</span>` : ''}</div>
      </div>`).join('')}</div>${interieurs}`;
  }

  // L'outil : section « Travaux et autorisations ».
  function renderTravauxPreemption() {
    const zone = document.getElementById('pr-travaux');
    if (!zone || !prEtat) return;
    const tr = prEtat.travaux || {};
    const d = prEtat.dossierId ? dossiers.find(x => x.id === prEtat.dossierId) : null;
    const boutons = `<div class="pr-zonage-actions">
        ${d && d.dossierLie && d.nasDossier ? `<wa-button appearance="outlined" size="s" onclick="lireTravauxCompromisPreemption()"${tr.lecture ? ' loading' : ''}>${icone('file-text')} Lire le compromis</wa-button>` : ''}
        <span class="pr-depot-compromis"><wa-button appearance="outlined" size="s" onclick="document.getElementById('pr-travaux-fichier').click()">${icone('upload')} Déposer un PDF</wa-button>
          <input type="file" id="pr-travaux-fichier" accept="application/pdf,.pdf" style="display:none" onchange="deposerCompromisTravauxPreemption(this)"></span>
      </div>`;
    const etat = tr.lecture ? '<p class="hint">Lecture du compromis…</p>'
      : tr.erreur ? `<p class="pr-erreur">${icone('alert-triangle')} ${escapeHtml(tr.erreur)}</p>` : '';
    const liste = tr.liste
      ? `<div class="section-eyebrow pr-eyebrow">Travaux du compromis${infoBulle(`Lus dans « ${tr.source || 'le compromis'} ». Une autorisation compte comme demandée quand le compromis la cite ; survolez une pastille pour le détail.`)}</div>
        ${renderTravauxUrbanismeListe(analyseTravauxUrbanisme(tr.liste, patrimoinePreemption(prEtat) || (d && d.preemption && d.preemption.patrimoine), null, sitadelPreemption()))}`
      : '';
    zone.innerHTML = boutons + etat + liste + renderSitadelPreemption() + renderPhotosPreemption();
    lancerHistoriqueParcellePreemption();
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
    const sit = p && p.sitadel && Array.isArray(p.sitadel.autorisations) ? p.sitadel.autorisations : null;
    const resumeSitadel = sit ? (sit.map(a => a.type + ' ' + String(a.autoriseLe || '').slice(0, 4) + ' · ' + String(a.etat || '').toLowerCase()).join(' · ') || 'Rien depuis 2013') : '';
    const ligneSitadel = sit ? `<div class="pr-fiche-ligne"><span class="dot-label ${sit.length ? 'dl-acte' : 'dl-neutre'}"><span class="dot"></span>${sit.length ? sit.length + ' trouvée' + (sit.length > 1 ? 's' : '') : 'Aucune'}</span>
        <span class="pr-fiche-titre">Sitadel${infoBulle(AIDE_SITADEL)}</span>
        <span class="hint">${escapeHtml(resumeSitadel)}</span></div>` : '';
    return renderTravauxFicheListe(p, sit) + ligneSitadel;
  }

  function renderTravauxFicheListe(p, sit) {
    const tr = p && p.travaux;
    if (!tr || !Array.isArray(tr.liste)) return '';
    const a = analyseTravauxUrbanisme(tr.liste, p.patrimoine, null, sit);
    if (!a.travaux.length) return `<div class="pr-fiche-ligne"><span class="dot-label dl-success"><span class="dot"></span>Aucun</span>
        <span class="pr-fiche-titre">Travaux déclarés</span><span class="hint">Rien d’extérieur ni de gros œuvre</span></div>`;
    return a.travaux.map(t => `<div class="pr-fiche-ligne">
        <span class="dot-label ${CLASSES_TRAVAUX_URBANISME[t.statut]}"><span class="dot"></span>${LIBELLES_TRAVAUX_URBANISME[t.statut]}</span>
        <span class="pr-fiche-titre">${escapeHtml(natureTravailUrbanisme(t))}${t.annee ? ` (${t.annee})` : ''}</span>
        <span class="pr-puces">${t.points.filter(x => x.etat !== 'ok').map(puceControleTravaux).join('') || '<span class="hint">Autorisation, achèvement et décennale cités</span>'}</span>
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
    const sitadel = await lireSitadel(d.preemption.insee, prefillPreemption(d).parcelles).catch(() => null);
    if (sitadel && !sitadel.erreur) d.preemption.sitadel = { le: new Date().toISOString(), autorisations: sitadel.autorisations };
    const a = analyseTravauxUrbanisme(liste, d.preemption.patrimoine, null, d.preemption.sitadel ? d.preemption.sitadel.autorisations : null);
    if (a.travaux.length) ajouterHistorique(d, `Travaux déclarés dans le compromis : ${a.travaux.length} (${a.travaux.filter(t => t.statut === 'reclamer').length} avec une pièce à réclamer)`);
    sauvegarder(d);
  }

  // ===== Sitadel et photos aériennes de la parcelle (étude 08/10 : « oui » aux photos dans le temps, « et recoupe aussi en
  // cherchant sur Sitadel des traces de permis » ; server/src/historiqueParcelle.js). Seuls la commune, les parcelles et leur
  // emprise partent, par le serveur. =====

  async function lireSitadel(insee, parcelles) {
    if (!insee || !String(parcelles || '').trim()) return null;
    const r = await fetchAvecAuth(`/api/urbanisme/sitadel?insee=${encodeURIComponent(insee)}&parcelles=${encodeURIComponent(parcelles)}`);
    const data = await r.json().catch(() => ({}));
    return r.ok ? data : { erreur: data.erreur || 'Sitadel injoignable.' };
  }

  // Les autorisations de Sitadel connues de l'outil : lues dans cette session, sinon gardées sur la fiche. null = pas cherché.
  function sitadelPreemption() {
    if (!prEtat) return null;
    if (prEtat.sitadel && Array.isArray(prEtat.sitadel.autorisations)) return prEtat.sitadel.autorisations;
    const d = prEtat.dossierId ? dossiers.find(x => x.id === prEtat.dossierId) : null;
    return d && d.preemption && d.preemption.sitadel && Array.isArray(d.preemption.sitadel.autorisations) ? d.preemption.sitadel.autorisations : null;
  }

  // Pure : la ligne d'une autorisation de Sitadel.
  function ligneAutorisationSitadel(a) {
    const dates = [a.autoriseLe ? 'autorisé le ' + formatDateFr(a.autoriseLe) : '', a.chantierLe ? 'chantier ouvert le ' + formatDateFr(a.chantierLe) : '',
      a.acheveLe ? 'achèvement déclaré le ' + formatDateFr(a.acheveLe) : ''].filter(Boolean).join(' · ');
    const quoi = [a.nature, a.travaux && a.travaux.length ? a.travaux.join(', ') : '', a.logements ? `${a.logements} logement${a.logements > 1 ? 's' : ''} créé${a.logements > 1 ? 's' : ''}` : '',
      a.surfaceCreee ? `${a.surfaceCreee} m² créés` : '', a.surfaceDemolie ? `${a.surfaceDemolie} m² démolis` : ''].filter(Boolean).join(' · ');
    return { titre: `${LIBELLES_TYPES_SITADEL[a.type] || a.type} n° ${a.numero}`, etat: a.etat || 'État inconnu', dates, quoi, parcelles: (a.parcelles || []).join(', ') };
  }
  var LIBELLES_TYPES_SITADEL = { PC: 'Permis de construire', DP: 'Déclaration préalable', PA: 'Permis d’aménager', PD: 'Permis de démolir' };
  var AIDE_SITADEL = 'Sitadel (ministère de la Transition écologique, données publiques) recense depuis 2013 les permis de construire et déclarations préalables qui créent un logement ou des locaux, les permis d’aménager et les permis de démolir. Une déclaration préalable pour une piscine, une clôture ou un ravalement sans logement créé n’y figure pas : l’absence de résultat ne prouve rien. Seuls la commune et les numéros de parcelle sont envoyés.';

  var CLASSES_ETAT_SITADEL = { 'Achevé': 'dl-success', 'Chantier commencé': 'dl-acte', 'Autorisé': 'dl-acte', 'Annulé': 'dl-neutre' };

  function renderSitadelPreemption() {
    const s = prEtat.sitadel || {};
    const liste = sitadelPreemption();
    const tete = `<div class="section-eyebrow pr-eyebrow">Sitadel${infoBulle(AIDE_SITADEL)}</div>`;
    if (s.lecture) return tete + '<p class="hint">Recherche…</p>';
    if (s.erreur) return tete + `<p class="pr-erreur">${icone('alert-triangle')} ${escapeHtml(s.erreur)}</p>`;
    if (!liste) return tete + `<p class="hint">${prEtat.insee && prEtat.parcelles ? 'Pas encore cherché.' : 'Commune et parcelles d’abord.'}</p>`;
    if (!liste.length) return tete + `<p class="pr-vide">${icone('info')} Aucune autorisation depuis 2013</p>`;
    return tete + `<div class="pr-sitadel">${liste.map(a => {
      const l = ligneAutorisationSitadel(a);
      const resume = [a.travaux && a.travaux.length ? a.travaux.join(', ') : a.nature, a.surfaceCreee ? a.surfaceCreee + ' m²' : ''].filter(Boolean).join(' · ');
      return `<div class="pr-sitadel-ligne avec-bulle" tabindex="0" data-info="${escapeAttr([l.titre, l.dates, l.quoi, l.parcelles ? 'parcelles ' + l.parcelles : ''].filter(Boolean).join(' — '))}">
          <span class="pr-sitadel-type">${escapeHtml(a.type)}</span>
          <span class="pr-sitadel-date">${escapeHtml(a.autoriseLe ? formatDateFr(a.autoriseLe) : 'Date inconnue')}</span>
          <span class="pr-sitadel-quoi">${escapeHtml(resume)}</span>
          <span class="dot-label ${CLASSES_ETAT_SITADEL[a.etat] || 'dl-neutre'}"><span class="dot"></span>${escapeHtml(l.etat)}</span>
        </div>`;
    }).join('')}</div>`;
  }

  // Pure : la prise de vue à mettre à gauche par défaut — la dernière période finie avant les travaux déclarés les plus anciens,
  // sinon 2000-2005.
  function priseDeVueAvantTravaux(couches, travaux) {
    const annees = (travaux || []).map(t => t && t.annee).filter(Boolean);
    const periodes = (couches || []).filter(c => /-/.test(c.cle));
    if (annees.length) {
      const avant = periodes.filter(c => c.fin < Math.min(...annees));
      if (avant.length) return avant[avant.length - 1].cle;
    }
    return periodes.some(c => c.cle === '2000-2005') ? '2000-2005' : ((periodes[0] && periodes[0].cle) || 'actuelle');
  }

  // Pure : le contour des parcelles en coordonnées de l'image (0-100), pour le tracer par-dessus la photo.
  function contoursImage(contours, emprise) {
    const [a, b, c, d] = emprise;
    return (contours || []).map(anneau => anneau.map(([x, y]) => `${(((x - a) / (c - a)) * 100).toFixed(2)},${(((d - y) / (d - b)) * 100).toFixed(2)}`).join(' '));
  }

  function cleHistoriquePreemption() { return prEtat ? `${prEtat.insee}|${prEtat.parcelles}` : ''; }

  // Lancé au rendu : une seule fois par commune + parcelles (photos : contour et emprise ; Sitadel : autorisations).
  function lancerHistoriqueParcellePreemption() {
    if (!prEtat || !prEtat.insee || !String(prEtat.parcelles || '').trim()) return;
    const cle = cleHistoriquePreemption();
    if (prEtat.historiqueCle === cle) return;
    prEtat.historiqueCle = cle;
    prEtat.historique = { lecture: true, images: {} };
    prEtat.sitadel = { lecture: true };
    fetchAvecAuth(`/api/urbanisme/vue?insee=${encodeURIComponent(prEtat.insee)}&parcelles=${encodeURIComponent(prEtat.parcelles)}`)
      .then(async r => {
        const v = await r.json().catch(() => ({}));
        if (!prEtat || cleHistoriquePreemption() !== cle) return;
        const travaux = prEtat.travaux && prEtat.travaux.liste;
        prEtat.historique = r.ok
          ? { vue: v, images: {}, gauche: priseDeVueAvantTravaux(v.couches, travaux), droite: 'actuelle' }
          : { erreur: v.erreur || 'Parcelle introuvable au cadastre.', images: {} };
        renderTravauxPreemption();
        if (r.ok) { chargerPhotoPreemption(prEtat.historique.gauche); chargerPhotoPreemption(prEtat.historique.droite); }
      })
      .catch(() => { if (prEtat && cleHistoriquePreemption() === cle) { prEtat.historique = { erreur: 'Serveur injoignable.', images: {} }; renderTravauxPreemption(); } });
    lireSitadel(prEtat.insee, prEtat.parcelles)
      .then(s => {
        if (!prEtat || cleHistoriquePreemption() !== cle) return;
        prEtat.sitadel = s && !s.erreur ? { autorisations: s.autorisations } : { erreur: (s && s.erreur) || 'Sitadel injoignable.' };
        renderTravauxPreemption();
      })
      .catch(() => { if (prEtat && cleHistoriquePreemption() === cle) { prEtat.sitadel = { erreur: 'Serveur injoignable.' }; renderTravauxPreemption(); } });
  }

  async function chargerPhotoPreemption(couche) {
    const h = prEtat && prEtat.historique;
    if (!h || !h.vue || h.images[couche]) return;
    h.images[couche] = { etat: 'chargement' };
    const cle = cleHistoriquePreemption();
    try {
      const r = await fetchAvecAuth(`/api/urbanisme/photo?couche=${encodeURIComponent(couche)}&emprise=${encodeURIComponent(h.vue.emprise.join(','))}`);
      if (!prEtat || cleHistoriquePreemption() !== cle) return;
      h.images[couche] = r.status === 204 ? { etat: 'vide' } : r.ok ? { etat: 'ok', url: URL.createObjectURL(await r.blob()) } : { etat: 'erreur' };
    } catch (e) {
      h.images[couche] = { etat: 'erreur' };
    }
    renderTravauxPreemption();
  }

  function choisirPhotoPreemption(cote, couche) {
    const h = prEtat && prEtat.historique;
    if (!h || !h.vue) return;
    h[cote === 'gauche' ? 'gauche' : 'droite'] = couche;
    chargerPhotoPreemption(couche);
    renderTravauxPreemption();
  }

  function renderPhotosPreemption() {
    const h = prEtat.historique;
    const tete = `<div class="section-eyebrow pr-eyebrow">Photos aériennes${infoBulle('Photos de l’IGN, contour du cadastre en orange. Une année seule n’a souvent pas de photo (le Loir-et-Cher est photographié environ tous les trois ans) : préférer les périodes. À comparer à l’œil.')}</div>`;
    if (!h) return tete + `<p class="hint">${prEtat.insee && prEtat.parcelles ? 'Pas encore chargées.' : 'Commune et parcelles d’abord.'}</p>`;
    if (h.lecture) return tete + '<p class="hint">Contour de la parcelle…</p>';
    if (h.erreur) return tete + `<p class="pr-erreur">${icone('alert-triangle')} ${escapeHtml(h.erreur)}</p>`;
    const polygones = contoursImage(h.vue.contours, h.vue.emprise);
    const vue = (cote) => {
      const couche = h[cote];
      const img = h.images[couche] || {};
      const options = h.vue.couches.map(c => `<option value="${escapeAttr(c.cle)}"${c.cle === couche ? ' selected' : ''}>${escapeHtml(c.libelle)}</option>`).join('');
      const fond = img.etat === 'ok' ? `<img src="${escapeAttr(img.url)}" alt="Photo aérienne ${escapeAttr(couche)} de la parcelle">`
        : `<div class="pr-photo-vide">${img.etat === 'vide' ? 'Pas de photo cette année' : img.etat === 'erreur' ? 'Photo indisponible' : 'Chargement…'}</div>`;
      return `<figure class="pr-photo">
          <select id="pr-photo-${cote}" aria-label="Prise de vue" onchange="choisirPhotoPreemption('${cote}', this.value)">${options}</select>
          <div class="pr-photo-cadre">${fond}
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${polygones.map(pts => `<polygon points="${pts}"></polygon>`).join('')}</svg>
          </div>
        </figure>`;
    };
    return tete + `<div class="pr-photos">${vue('gauche')}${vue('droite')}</div>`;
  }
