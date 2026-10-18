  // ==== CONSTITUTION DE DOSSIER : ZONAGE ET DROITS DE PRÉEMPTION (étude 16/10) ====
  // « Rajouter une section. Détecter le zonage pour savoir si la DIA urbaine ou la SAFER est nécessaire. »
  // Aucune règle nouvelle : la même analyse que le Contrôle de l'urbanisme et la fiche (client/45, 46, 54 — zonage de chaque parcelle lu sur le
  // Géoportail de l'urbanisme, DPU d'après le tableau Cheuvreux et Agglopolys, SAFER d'après le CRIDON, zone A ou N = SAFER à notifier).
  // Lancée seule à l'ouverture d'un dossier de vente qui n'a pas encore d'analyse ; une analyse faite dans l'outil est lue telle quelle.

  // Pure : ce que la section montre d'une analyse → { zones: [{ parcelle, zone }], dia: { statut, texte, motif }, safer: {…}, autres: [...] } ou null.
  function zonageConstitution(p) {
    if (!p || !Array.isArray(p.droits)) return null;
    const droits = droitsPreemptionFiche(p);
    const zones = (Array.isArray(p.lignes) && p.lignes.length ? p.lignes : (p.parcelles || [])).map(l => ({
      parcelle: l.libelle || l.parcelle || '',
      cle: l.cle || '',
      code: l.zone || '',
      famille: l.typezone || l.famille || '',
      libelong: l.libelong || '',
      contenance: Number(l.contenance) > 0 ? Number(l.contenance) : 0,
      zone: (l.zone ? `${l.zone}${l.typezone ? ' (' + l.typezone + ')' : ''}` : (l.famille || 'zone non lue'))
        + (!l.choisie && Array.isArray(l.autresFamilles) && l.autresFamilles.length ? ` + en partie ${l.autresFamilles.join(', ')}` : '')
    }));
    const texte = (dr, oui, non) => {
      if (!dr) return { statut: 'verifier', texte: 'À vérifier', motif: 'droit non analysé' };
      if (dr.statut === 'oui') return { statut: 'oui', texte: oui, motif: dr.motif || '' };
      if (dr.statut === 'probable') return { statut: 'probable', texte: `${oui} (probable)`, motif: dr.motif || '' };
      if (dr.statut === 'non') return { statut: 'non', texte: non, motif: dr.motif || '' };
      return { statut: 'verifier', texte: 'À vérifier', motif: dr.motif || '' };
    };
    const dpu = droits.find(dr => dr.cle === 'dpu');
    const safer = droits.find(dr => dr.cle === 'safer');
    const autres = droits.filter(dr => dr.cle !== 'dpu' && dr.cle !== 'safer' && (dr.statut === 'oui' || dr.statut === 'probable')).map(dr => dr.titre);
    const aCheval = (Array.isArray(p.lignes) ? p.lignes : []).filter(l => l && !l.choisie && Array.isArray(l.autresFamilles) && l.autresFamilles.length).map(l => l.libelle);
    return { aCheval, zones, dia: texte(dpu, 'DIA à déposer', 'Pas de DIA'), safer: texte(safer, 'SAFER à notifier', 'Pas de SAFER'), autres, incomplet: !!p.incomplet, le: p.le || '' };
  }

  // Le zonage du dossier ouvert dans la Constitution : lu seul s'il n'y a pas encore d'analyse (même lecture que l'ajout d'un dossier).
  async function lireZonageConstitution(force) {
    const e = cstEtat;
    const d = dossierConstitution();
    if (!e || !d || e.type !== 'vente' || e.zonageEnCours) return;
    if (d.preemption && Array.isArray(d.preemption.droits) && !force) return;
    if (d.roleNotaire === 'participant') return;
    if (force && d.preemption && !d.preemption.auto) { ouvrirPreemptionDepuisFiche(d.id); return; }
    d.preemptionAuto = true;
    if (force && d.preemption) d.preemption.signature = '';
    e.zonageEnCours = true;
    majZonageConstitution();
    try { await analyserPreemptionDossier(d.id); } finally {
      if (cstEtat === e) { e.zonageEnCours = false; majZonageConstitution(); }
    }
  }

  // Parcelles ajoutées ou décochées dans l'écran (bug signalé le 18/10 : le contrôle de l'urbanisme restait sur la parcelle retirée) : le choix
  // est gardé sur le dossier (`d.constitutionParcelles`, lu par prefillPreemption), puis le zonage est relu après une courte pause — une analyse
  // faite à la main dans le Contrôle de l'urbanisme n'est jamais refaite seule : la section dit qu'elle porte sur d'autres parcelles.
  var minuterieZonageConstitution = null;
  function memoriserParcellesConstitution(g) {
    const e = cstEtat;
    const d = dossierConstitution();
    if (!e || !d || e.type !== 'vente') return;
    const choix = choixParcellesConstitution(e.groupes);
    if (JSON.stringify(choix) === JSON.stringify(d.constitutionParcelles || null)) return;
    if (choix) d.constitutionParcelles = choix; else delete d.constitutionParcelles;
    sauvegarder(d);
    if (!g || !g.principale) return;
    clearTimeout(minuterieZonageConstitution);
    majZonageConstitution();
    const relire = () => {
      const d2 = dossierConstitution();
      if (cstEtat !== e || !d2 || (d2.preemption && !d2.preemption.auto) || !parcellesUrbanismeConstitution(d2) && d2.constitutionParcelles) return;
      // Une lecture encore en cours (sur les parcelles d'avant) : on attend qu'elle finisse, puis on relit.
      if (e.zonageEnCours) { minuterieZonageConstitution = setTimeout(relire, 2500); return; }
      lireZonageConstitution(true);
    };
    minuterieZonageConstitution = setTimeout(relire, 2500);
  }

  // Pure : l'analyse porte-t-elle sur d'autres parcelles que celles retenues dans cet écran ? (comparées par section et numéro)
  function zonageParcellesDepassees(d) {
    const p = d && d.preemption;
    // Seulement quand cet écran a changé les parcelles : une analyse faite dans l'outil sur une liste tapée à la main n'est pas signalée.
    if (!p || !parcellesUrbanismeConstitution(d) || !Array.isArray(p.lignes) || !p.lignes.length) return false;
    const etat = prefillPreemption(Object.assign({}, d, { preemption: null }));
    const voulues = parcellesDepuisTexte(etat.parcelles).map(x => cleParcelle(x.section, x.numero)).filter(Boolean).sort().join(',');
    const lues = [...new Set(p.lignes.map(l => l && l.cle).filter(Boolean))].sort().join(',');
    return voulues !== lues;
  }

  // Contenance d'une parcelle qu'Authentic ne donne pas : celle du cadastre de l'IGN, lue avec le zonage (test du 16/10 à Chaumont-sur-Tharonne :
  // la colonne « Contenance » du courrier restait vide). Jamais par-dessus une contenance d'Authentic ou saisie. → vrai si une a été posée.
  function completerContenancesConstitution() {
    const e = cstEtat;
    const d = dossierConstitution();
    const lignes = d && d.preemption && Array.isArray(d.preemption.lignes) ? d.preemption.lignes : [];
    if (!e || e.type !== 'vente' || !lignes.length) return false;
    let pose = false;
    e.groupes.forEach(g => g.parcelles.forEach(p => {
      if (String(p.surface || '').trim()) return;
      const l = lignes.find(x => x && x.cle === cleParcelle(p.section, p.numero));
      const m2 = l && Number(l.contenance);
      if (m2 > 0) { p.surface = String(Math.round(m2)); p.surfaceIgn = true; pose = true; }
    }));
    return pose;
  }

  // La section redessinée seule (une saisie en cours ailleurs dans l'écran n'est pas effacée).
  function majZonageConstitution() {
    const zone = document.getElementById('cst-zonage');
    const d = dossierConstitution();
    if (completerContenancesConstitution()) majApercuConstitution();
    if (zone && d) zone.outerHTML = renderZonageConstitution(d) || '<div id="cst-zonage"></div>';
    majStepperConstitution();
  }

  // La section, entre les données de la vente et les courriers.
  function renderZonageConstitution(d) {
    const e = cstEtat;
    if (!e || e.type !== 'vente' || !d) return '';
    if (d.roleNotaire === 'participant') return '<div class="cst-zonage" id="cst-zonage"><p class="hint">Participation : la DIA et la SAFER sont l’affaire du notaire qui reçoit l’acte.</p></div>';
    const z = zonageConstitution(d.preemption);
    const tete = '';
    const outil = `<wa-button appearance="outlined" size="s" type="button" onclick="ouvrirPreemptionDepuisFiche('${escapeOnclickArg(d.id)}')">${icone('map-pin')} Ouvrir le Contrôle de l’urbanisme</wa-button>`;
    if (e.zonageEnCours) return `<div class="cst-zonage" id="cst-zonage">${tete}<p class="hint">${icone('spinner', null, true)} Lecture du zonage sur le Géoportail…</p></div>`;
    if (!z) return `<div class="cst-zonage" id="cst-zonage">${tete}<p class="hint">Zonage pas encore lu.</p>
      <div class="cst-zonage-actions"><wa-button appearance="outlined" size="s" type="button" onclick="lireZonageConstitution(true)">Lire le zonage</wa-button>${outil}</div></div>`;
    const dl = s => s === 'oui' || s === 'probable' ? 'dl-urgent' : s === 'non' ? 'dl-success' : 'dl-pret';
    const ligne = (titre, r) => `<div class="cst-zonage-droit"><span class="cst-zonage-titre">${escapeHtml(titre)}</span><span class="dot-label ${dl(r.statut)}"><span class="dot"></span>${escapeHtml(r.texte)}</span>${r.motif ? `<span class="hint">${escapeHtml(r.motif)}</span>` : ''}</div>`;
    const zones = renderParcellesZonage(z.zones, naturesParcellesConstitution());
    return `<div class="cst-zonage" id="cst-zonage">${tete}${zones}
      ${ligne('DIA (préemption urbaine)', z.dia)}${ligne('SAFER', z.safer)}
      ${z.autres.length ? `<p class="cst-alerte">Aussi : ${escapeHtml(z.autres.join(', '))}</p>` : ''}
      ${z.aCheval.length ? `<p class="cst-alerte">${escapeHtml(z.aCheval.join(', '))} à cheval sur deux zones : les deux sont analysées ; choisir la zone retenue dans le Contrôle de l’urbanisme si l’une ne touche la parcelle que d’un filet.</p>` : ''}
      ${zonageParcellesDepassees(d) ? `<p class="cst-alerte">${d.preemption.auto ? (preemptionAutoAFaire(Object.assign({}, d, { preemptionAuto: true })) ? 'Parcelles changées : le zonage va être relu.' : 'Parcelles changées : relisez le zonage.') : 'Parcelles changées depuis l’analyse du Contrôle de l’urbanisme : refaites-la dans l’outil.'}</p>` : ''}
      ${z.incomplet ? '<p class="hint">Zonage lu en partie (Géoportail injoignable pour une parcelle) : relu plus tard.</p>' : ''}
      ${renderQuestionsUrbanismeConstitution(d)}
      <div class="cst-zonage-actions">${d.preemption.auto ? `<wa-button appearance="outlined" size="s" type="button" onclick="lireZonageConstitution(true)">${icone('rotate-ccw')} Relire le zonage</wa-button>` : ''}${outil}</div></div>`;
  }

  // Pure (étude 18/10 : « mieux identifier les parcelles et la nature pour le voir d'un coup d'œil », ici et dans le Contrôle de l'urbanisme) :
  // une carte par parcelle — section et numéro en gros, contenance, nature du cadastre (Authentic), zone du PLU avec sa famille en couleur
  // (U / AU urbaines, A agricole, N naturelle) et son nom long en bulle. `natures` : Map clé de parcelle → nature.
  var NOMS_FAMILLES_ZONE = { U: 'Urbaine', AU: 'À urbaniser', A: 'Agricole', N: 'Naturelle' };
  function renderParcellesZonage(zones, natures) {
    if (!zones || !zones.length) return '';
    return `<div class="parcelles-zonage">${zones.map(x => {
      const fam = String(x.famille || '').toUpperCase().replace(/^AU.*/, 'AU').replace(/^([UAN]).*/, '$1');
      const nature = natures && x.cle ? natures.get(x.cle) || '' : '';
      return `<div class="pz-carte pz-${escapeAttr(fam ? fam.toLowerCase() : 'inconnue')}">
          <div class="pz-ref">${escapeHtml(x.parcelle)}</div>
          <div class="pz-infos">${x.contenance ? `<span>${escapeHtml(formaterContenance(x.contenance))}</span>` : ''}${nature ? `<span>${escapeHtml(nature)}</span>` : ''}</div>
          <div class="pz-zone"${x.libelong ? ` title="${escapeAttr(x.libelong)}"` : ''}><b>${escapeHtml(x.code || 'Zone non lue')}</b>${fam ? `<span class="pz-famille">${escapeHtml(NOMS_FAMILLES_ZONE[fam] || fam)}</span>` : ''}</div>
          ${/en partie/.test(x.zone) ? `<div class="pz-cheval">${escapeHtml(x.zone.replace(/^[^+]*\+\s*/, '+ '))}</div>` : ''}
        </div>`;
    }).join('')}</div>`;
  }

  // Les natures du cadastre des parcelles de l'écran (Authentic), par clé de parcelle.
  function naturesParcellesConstitution() {
    const m = new Map();
    ((cstEtat && cstEtat.groupes) || []).forEach(g => (g.parcelles || []).forEach(p => { if (p.nature) m.set(cleParcelle(p.section, p.numero), p.nature); }));
    return m;
  }

  // Lien du guichet cliqué (étude 17/10 : « ouvrir Chrome avec l'add-on ouvert ») : le dossier est retenu par le serveur, l'extension
  // « CLAIRE — Assistant de saisie » le propose sur la page du guichet et le choisit d'avance dans son panneau. Sans attendre la réponse :
  // le lien s'ouvre de toute façon.
  function noterOuvertureGnau() {
    const d = dossierConstitution();
    if (!d) return;
    fetchAvecAuth('/api/gnau/ouverture', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dossierId: d.id }) }).catch(() => {});
  }

  // Étape « DIA et SAFER » : le guichet unique (GNAU) de chaque commune, où se déposent la DIA et le certificat d'urbanisme.
  function renderGnauConstitution() {
    const e = cstEtat;
    if (!e || e.type !== 'vente') return '';
    return `<div class="cst-gnau-liste">${e.groupes.map(g => {
      const info = g.info || {};
      const depot = info.depot || {};
      const chailles = String(info.insee || '') === INSEE_CHAILLES;
      const lien = chailles ? URL_GNAU_CHAILLES : lienDepotDiaSur(depot.url);
      const nom = chailles ? 'Guichet de Chailles (SIRAP)' : (depot.plateforme || (depot.mode === 'guichet' ? 'Guichet unique' : ''));
      const nomCommune = `<span>${escapeHtml(g.commune)}${g.cp ? ' (' + escapeHtml(g.cp) + ')' : ''}</span>`;
      // Paris : la DIA a son téléservice, le CU un autre (commun/constitution.js).
      if (estParis(info.insee)) {
        const lienParis = (url, texte) => `<a class="cst-gnau-bouton" href="${escapeAttr(url)}" target="_blank" rel="noopener">${icone('link')}<span>${texte}</span></a>`;
        return `<div class="cst-gnau-ligne">${nomCommune}<span class="cst-gnau-liens">${lien ? lienParis(lien, 'Déposer la DIA') : ''}${lienParis(URL_CU_PARIS, 'Demander le CU')}</span></div>`;
      }
      // Étude 18/10 : « à la fin un gros bouton pour ouvrir le GNAU s'il y a un droit de préemption urbain ».
      const d = dossierConstitution();
      const z = d ? zonageConstitution(d.preemption) : null;
      const dpu = !!(z && (z.dia.statut === 'oui' || z.dia.statut === 'probable'));
      return `<div class="cst-gnau-ligne${dpu ? ' cst-gnau-dpu' : ''}">${nomCommune}${lien
        ? `<a class="cst-gnau-bouton${dpu ? ' principal' : ''}" href="${escapeAttr(lien)}" target="_blank" rel="noopener" onclick="noterOuvertureGnau()" title="${escapeAttr(nom || 'Guichet unique')}">${icone('link')}<span>${dpu ? 'Ouvrir le guichet (GNAU) pour déposer la DIA' : 'Ouvrir le guichet (GNAU)'}</span></a>`
        : '<span class="hint" title="Aucun guichet relevé pour cette commune (outil « Où déposer la DIA »)">Guichet non relevé</span>'}</div>`;
    }).join('')}</div>`;
  }

  // Les questions du Contrôle de l'urbanisme (étude 16/10 : « reprends pour la partie DIA toutes les questions du contrôle de l'urbanisme »),
  // répondues sur place comme sur la fiche (`repondrePreemptionFiche` : analyse refaite, pièces mises à jour). Commune (DPU institué, DPU
  // renforcé), bien (celles d'une copropriété seulement pour une copropriété), rural, bois et forêts. Celles de la nature de la mutation
  // (donation, adjudication, parts de société, bail) ne concernent pas une vente : elles restent dans l'outil. Les questions dont l'analyse a
  // besoin sont en tête, marquées « À répondre » ; les autres se répondent aussi, pour être sûr.
  // Les questions suivent la zone de chaque parcelle (étude 16/10 : « les questions s'adaptent en fonction du type de zonage de la parcelle
  // et si les parcelles sont mixtes ») : un groupe par famille de zone lue — urbaine ou à urbaniser (DPU : la commune, le bien), agricole ou
  // naturelle (SAFER, bois et forêts), zone non lue (toutes) —, chacun nommant ses parcelles. Une question y figure si l'analyse de CETTE
  // zone en a besoin (« À répondre ») ou si elle relève de cette zone ; une question utile à plusieurs zones n'est posée qu'une fois, dans
  // le groupe de la première zone qui en a besoin, avec les parcelles qu'elle concerne.
  var QUESTIONS_COMMUNE_CONSTITUTION = ['dpuInstitue', 'dpur'];
  var FAMILLES_URBAINES_CONSTITUTION = ['U', 'AU'];
  var FAMILLES_RURALES_CONSTITUTION = ['A', 'N'];
  var NOMS_ZONES_CONSTITUTION = { U: 'Zone urbaine', AU: 'Zone à urbaniser', A: 'Zone agricole', N: 'Zone naturelle' };

  // Pure : les questions de la zone `f` qui relèvent d'elle (sans compter celles que l'analyse demande).
  function questionsDeZoneConstitution(f, typeVente) {
    const bien = QUESTIONS_PREEMPTION.filter(q => q.section === 'bien' && (!q.copro || typeVente === 'copropriete')).map(q => q.cle);
    const rural = QUESTIONS_PREEMPTION.filter(q => q.section === 'rural').map(q => q.cle);
    if (FAMILLES_URBAINES_CONSTITUTION.includes(f)) return QUESTIONS_COMMUNE_CONSTITUTION.concat(bien);
    if (FAMILLES_RURALES_CONSTITUTION.includes(f)) return rural;
    return QUESTIONS_COMMUNE_CONSTITUTION.concat(bien, rural);
  }

  // Pure : les questions à montrer, par zone → [{ titre, parcelles, questions: [{ cle, libelle, aide, valeurs, due, reponse, concerne }] }].
  function questionsUrbanismeConstitution(p, typeVente) {
    if (!p || !Array.isArray(p.droits)) return [];
    const rep = Object.assign({}, p.deduites || {}, p.reponses || {});
    const repAnalyse = Object.assign({}, rep);
    if (repAnalyse.dpur === 'oui' && p.insee === DPUR_BLOIS.insee && !repAnalyse.dpurDelegataire) repAnalyse.dpurDelegataire = DPUR_BLOIS.delegataire;
    const parCle = new Map();
    ((p.lignes) || []).forEach(l => { if (l && l.statut !== 'lecture') parCle.set(l.cle || l.libelle, l); });
    const parFamille = new Map();
    // Une parcelle à cheval sur deux zones (le Géoportail rend toutes celles qui la touchent, `autresFamilles`) compte dans chacune, « en
    // partie » pour l'autre — sauf si l'étude a choisi sa zone dans le Contrôle de l'urbanisme (`choisie`).
    const ajouter = (f, libelle) => { if (!parFamille.has(f)) parFamille.set(f, []); if (!parFamille.get(f).includes(libelle)) parFamille.get(f).push(libelle); };
    [...parCle.values()].forEach(l => {
      ajouter(l.famille || '', l.libelle);
      (!l.choisie && Array.isArray(l.autresFamilles) ? l.autresFamilles : []).forEach(f => { if (f && f !== (l.famille || '')) ajouter(f, `${l.libelle} (en partie)`); });
    });
    if (!parFamille.size) parFamille.set('', []);
    const ordre = ['U', 'AU', 'A', 'N', ''];
    const zones = [...parFamille.entries()].sort((a, b) => ordre.indexOf(a[0]) - ordre.indexOf(b[0])).map(([f, parcelles]) => {
      const dues = new Set(analyserPreemption(Object.assign({}, repAnalyse, { zone: f || repAnalyse.zone || undefined })).manques);
      return { f, parcelles, dues, propres: new Set(questionsDeZoneConstitution(f, typeVente)) };
    });
    const plusieurs = zones.length > 1;
    const groupes = zones.map(z => ({
      titre: z.f ? `${NOMS_ZONES_CONSTITUTION[z.f] || 'Zone ' + z.f} (${z.f})` : (plusieurs ? 'Zone non lue' : 'Toutes les parcelles'),
      parcelles: z.parcelles, questions: [] }));
    const toutes = QUESTIONS_COMMUNE_CONSTITUTION.map(questionPreemptionParCle).concat(QUESTIONS_PREEMPTION.filter(q => q.section === 'bien' || q.section === 'rural')).filter(Boolean)
      .filter(q => !q.copro || typeVente === 'copropriete');
    toutes.forEach(q => {
      const dues = zones.map((z, i) => z.dues.has(q.cle) ? i : -1).filter(i => i >= 0);
      const propres = zones.map((z, i) => z.propres.has(q.cle) ? i : -1).filter(i => i >= 0);
      const ou = dues.length ? dues[0] : propres.length ? propres[0] : -1;
      if (ou < 0) return;
      const brutes = [...new Set((dues.length ? dues : propres).flatMap(i => zones[i].parcelles))];
      // « AB 100 » et « AB 100 (en partie) » : la parcelle une fois.
      const concerne = brutes.filter(x => !(/ \(en partie\)$/.test(x) && brutes.includes(x.replace(/ \(en partie\)$/, ''))));
      groupes[ou].questions.push({ cle: q.cle, libelle: q.libelle, aide: q.aide || '', valeurs: q.valeurs, due: dues.length > 0, reponse: rep[q.cle],
        concerne: plusieurs && (dues.length > 1 || propres.length > 1) ? concerne : [] });
    });
    groupes.forEach(g => g.questions.sort((a, b) => Number(b.due) - Number(a.due)));
    return groupes.filter(g => g.questions.length);
  }

  function renderQuestionsUrbanismeConstitution(d) {
    const p = d && d.preemption;
    if (!p || !Array.isArray(p.droits)) return '';
    const groupes = questionsUrbanismeConstitution(p, d.typeVente);
    const dues = groupes.reduce((n, g) => n + g.questions.filter(q => q.due).length, 0);
    const reste = resteAPreciserPreemptionFiche(p);
    const id = escapeOnclickArg(d.id);
    const ligne = q => `<div class="pr-question${q.due ? ' pr-question-due' : ''}">
        <span class="pr-question-texte">${q.due ? '<span class="dot-label dl-urgent cst-a-repondre"><span class="dot"></span>À répondre</span> ' : ''}${escapeHtml(q.libelle)}${q.aide ? infoBulle(q.aide) : ''}${q.concerne.length ? `<span class="hint cst-concerne"> — concerne ${escapeHtml(q.concerne.join(', '))}</span>` : ''}</span>
        ${boutonsReponsePreemption(v => `cstRepondreUrbanisme('${id}', '${q.cle}', ${JSON.stringify(v).replace(/"/g, '&quot;')})`, q.reponse, q.valeurs)}
      </div>`;
    // Par zone : les questions à répondre et celles déjà répondues ; les autres de la zone repliées (on peut toujours y répondre).
    const bloc = groupes.map(g => {
      const visibles = g.questions.filter(q => q.due || q.reponse != null);
      const autres = g.questions.filter(q => !q.due && q.reponse == null);
      return `<div class="cst-questions-groupe"><div class="cst-liste-titre">${escapeHtml(g.titre)}${g.parcelles.length ? ` <span class="cst-questions-parcelles">${escapeHtml(g.parcelles.join(', '))}</span>` : ''}</div>
        ${visibles.map(ligne).join('') || '<p class="hint">Rien à répondre pour cette zone.</p>'}
        ${autres.length ? `<details class="cst-questions-autres"><summary>Autres questions de cette zone (${autres.length})</summary>${autres.map(ligne).join('')}</details>` : ''}</div>`;
    }).join('');
    return `<details class="cst-questions" id="cst-questions"${dues ? ' open' : ''}>
        <summary>Questions du Contrôle de l’urbanisme ${dues ? `<span class="dot-label dl-urgent"><span class="dot"></span>${dues} à répondre</span>` : '<span class="hint">toutes répondues ou sans effet</span>'}</summary>
        ${bloc}
        ${reste.length ? `<p class="hint">À préciser dans l’outil : ${escapeHtml(reste.join(', '))}.</p>` : ''}
      </details>`;
  }

  // Une réponse : analyse et pièces refaites (même voie que la fiche), puis la section et la barre des étapes redessinées.
  function cstRepondreUrbanisme(id, cle, valeur) {
    const ouvert = !!(document.getElementById('cst-questions') || {}).open;
    repondrePreemptionFiche(id, cle, valeur);
    majZonageConstitution();
    const q = document.getElementById('cst-questions');
    if (q && ouvert) q.open = true;
  }
