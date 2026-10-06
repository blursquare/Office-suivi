  // ===== Outil « Droits de préemption » (étude 06/10) : l'écran, pré-rempli depuis la fiche, zonage lu sur le Géoportail de
  // l'urbanisme (server/src/urbanisme.js), règles dans 45-preemption-regles.js, résultat gardé sur la fiche (d.preemption). =====

  var prEtat = null;           // { dossierId, cp, insee, communes, parcelles, adresse, zonage, erreurZonage, lecture, reponses }

  function etatPreemptionVierge() {
    return { dossierId: '', cp: '', insee: '', communes: [], parcelles: '', adresse: '', zonage: null, erreurZonage: '', lecture: false, reponses: { mutation: 'vente' } };
  }

  // Les questions oui / non, par section de l'écran. Une question n'est posée que si l'analyse en a besoin, ou si elle a déjà
  // une réponse (on peut toujours la changer).
  var QUESTIONS_PREEMPTION = [
    { cle: 'adjudicationFinIndivision', section: 'mutation', libelle: 'L’adjudication met-elle fin à une indivision créée volontairement ?', aide: 'Hors indivision issue d’une donation-partage.' },
    { cle: 'donationEntreParents', section: 'mutation', libelle: 'Le donataire est-il un parent jusqu’au 6e degré ?' },
    { cle: 'partsMajoritaires', section: 'mutation', libelle: 'La cession porte-t-elle sur la majorité des parts, ou y conduit-elle l’acquéreur ?', aide: 'Société dont le patrimoine est une unité foncière soumise au DPU.' },
    { cle: 'sciFamiliale', section: 'mutation', libelle: 'La SCI est-elle familiale (parents et alliés jusqu’au 4e degré) ?' },
    { cle: 'bailTransfertPropriete', section: 'mutation', libelle: 'En fin de bail, la propriété est-elle transférée au preneur ?' },
    { cle: 'achevementMoins4ans', section: 'bien', libelle: 'L’immeuble est-il achevé depuis moins de 4 ans ?' },
    { cle: 'maisonCoproHorizontale', section: 'bien', libelle: 'Maison individuelle dans une copropriété horizontale ?', copro: true },
    { cle: 'locauxAutreHabitation', section: 'bien', libelle: 'Locaux à usage autre que d’habitation (commerce, bureaux…) ?', copro: true },
    { cle: 'plusieursUnites', section: 'bien', libelle: 'Plusieurs unités d’habitation ou professionnelles vendues au même acquéreur ?', copro: true },
    { cle: 'issuePartageAttribution', section: 'bien', libelle: 'Copropriété issue du partage d’une société d’attribution ?', copro: true },
    { cle: 'reglementPlusDe10ans', section: 'bien', libelle: 'Règlement de copropriété publié depuis plus de 10 ans ?', copro: true },
    { cle: 'usageAgricole', section: 'rural', libelle: 'Le bien a-t-il un usage agricole au moment de la vente ?' },
    { cle: 'utilise5ans', section: 'rural', libelle: 'Le bâtiment a-t-il servi à une activité agricole au cours des 5 dernières années ?' },
    { cle: 'zoneAgricole', section: 'rural', libelle: 'Le terrain est-il dans une zone à vocation agricole ?', aide: 'Zones A ou N d’un PLU, NB/NC/ND d’un POS, ZAP, PEAEN, secteur non urbanisé d’une commune au RNU (hors bois), zone non constructible d’une carte communale.' },
    { cle: 'bois', section: 'rural', libelle: 'Les parcelles sont-elles toutes classées en nature de bois et forêts au cadastre ?', aide: 'Natures BT, B, BR, BM, BS, BP, BF, BO — sur le relevé de propriété ou l’extrait cadastral.' },
    { cle: 'massif4ha', section: 'rural', libelle: 'Sont-elles situées dans un massif forestier d’au moins 4 ha ?', aide: 'Le seuil du défrichement est fixé par arrêté préfectoral, entre 0,5 et 4 ha selon le département.' },
    { cle: 'installations', section: 'rural', libelle: 'Le terrain supporte-t-il des installations qui compromettent définitivement sa vocation agricole ?' },
    { cle: 'seuilSafer', section: 'rural', libelle: 'La superficie atteint-elle le seuil à partir duquel la SAFER peut préempter ?', aide: 'Fixé par le décret qui autorise la SAFER du Centre à préempter.' },
    { cle: 'superficieMoins4ha', section: 'rural', libelle: 'La propriété boisée vendue fait-elle moins de 4 ha ?' },
    { cle: 'foretDomaniale', section: 'rural', libelle: 'Une forêt domaniale jouxte-t-elle la parcelle vendue ?' },
    { cle: 'communeBoiseeContigue', section: 'rural', libelle: 'La commune possède-t-elle une parcelle réellement boisée contiguë, soumise à un document de gestion ?' },
    { cle: 'acquereurPrivilegie', section: 'rural', libelle: 'L’acquéreur est-il un voisin titulaire du droit de préférence, le conjoint, le partenaire de PACS, le concubin, un parent ou allié jusqu’au 4e degré, un coïndivisaire, le nu-propriétaire ou l’usufruitier ?' },
    { cle: 'partieBoiseeMoinsMoitie', section: 'rural', libelle: 'La partie réellement boisée représente-t-elle moins de la moitié de la surface totale ?' }
  ];

  // Pure : les réponses de l'outil enrichies de ce qui se déduit du zonage lu (zone, Agglopolys, DPU renforcé de Blois).
  function reponsesPreemption(etat) {
    const e = etat || etatPreemptionVierge();
    const r = Object.assign({}, e.reponses);
    const zonage = e.zonage;
    const zoneLue = zonage && zonage.zones && zonage.zones[0] ? familleZonePreemption(zonage.zones[0].typezone) : '';
    if (!r.zone && zoneLue) r.zone = zoneLue;
    if (zonage && zonage.epciSiren === SIREN_AGGLOPOLYS) r.agglopolys = true;
    if (!r.dpur) {
      const blois = dpurBlois(e.insee, parcellesDepuisTexte(e.parcelles), e.adresse);
      if (blois.statut === 'oui') r.dpur = 'oui';
      else if (blois.statut === 'non' && e.insee === DPUR_BLOIS.insee) r.dpur = 'non';
      else if (e.insee && e.insee !== DPUR_BLOIS.insee && zonage) r.dpur = 'non';
    }
    if (r.dpur === 'oui' && e.insee === DPUR_BLOIS.insee) r.dpurDelegataire = DPUR_BLOIS.delegataire;
    return r;
  }

  // Pure : « AL 839, AL 840 » / « AL0839 » → [{ section, numero }].
  function parcellesDepuisTexte(texte) {
    const out = [];
    const re = /(?:^|[^A-Z0-9])([0-9]?[A-Z]{1,2})\s*(?:N°|n°|no|n)?\s*(\d{1,4})(?![0-9])/gi;
    let m;
    while ((m = re.exec(String(texte || ''))) && out.length < 20) out.push({ section: m[1].toUpperCase(), numero: String(Number(m[2])) });
    return out;
  }

  // Pure : ce que la fiche apporte à l'outil (commune, parcelles, adresse, nature du bien).
  function prefillPreemption(d) {
    const e = etatPreemptionVierge();
    if (!d) return e;
    e.dossierId = d.id;
    const a = (d.bien && d.bien.adresse) || {};
    const cp = a.codePostal || (/\((\d{5})\)/.exec(d.adresseBien || '') || [])[1] || (/\b(\d{5})\b/.exec(d.adresseBien || '') || [])[1] || '';
    e.cp = cp;
    e.adresse = d.adresseBien || a.adresseComplete || '';
    const cad = d.bien && d.bien.cadastre;
    const parcelles = cad ? (Array.isArray(cad.parcelles) && cad.parcelles.length ? cad.parcelles : [cad]) : [];
    e.parcelles = parcelles.filter(p => p && p.section && p.numero).map(p => `${p.section} ${p.numero}`).join(', ');
    const type = String(d.typeVente || '').toLowerCase();
    if (/copro/.test(type)) e.reponses.bien = 'lot-copro';
    else if (/terrain/.test(type)) e.reponses.bien = 'terrain';
    else if (type) e.reponses.bien = 'bati';
    if (d.preemption && d.preemption.reponses) e.reponses = Object.assign({}, e.reponses, d.preemption.reponses);
    if (d.preemption && d.preemption.insee) e.insee = d.preemption.insee;
    return e;
  }

  function initPreemption() {
    if (!prEtat) prEtat = etatPreemptionVierge();
    renderPreemption();
  }

  function reinitialiserPreemption() {
    prEtat = etatPreemptionVierge();
    const champ = document.getElementById('pr-dossier-recherche');
    if (champ) champ.value = '';
    renderPreemption();
  }

  function rechercherDossierPreemption(valeur) {
    const boite = document.getElementById('pr-dossier-resultats');
    if (!boite) return;
    const q = normaliserPourRecherche(String(valeur || '').trim());
    if (!q) { boite.style.display = 'none'; boite.innerHTML = ''; return; }
    const trouves = dossiers.filter(d => !d.archive && !estSuccession(d) &&
      (normaliserPourRecherche(libelleDossierAffiche(d)).includes(q) || normaliserPourRecherche(d.responsable || '').includes(q))).slice(0, 8);
    boite.innerHTML = trouves.length
      ? trouves.map(d => `<button type="button" class="dash-recherche-ligne" onclick="choisirDossierPreemption('${escapeOnclickArg(d.id)}')">
          <span class="dash-recherche-nom">${escapeHtml(libelleDossierAffiche(d))}</span>
          <span class="dash-recherche-resp">${escapeHtml(d.responsable || '')}</span>
        </button>`).join('')
      : '<div class="dash-recherche-vide">Aucun dossier ne correspond.</div>';
    boite.style.display = 'block';
  }

  // Depuis la fiche (« Vérifier les droits de préemption ») ou la recherche de l'outil.
  function choisirDossierPreemption(id) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    const champ = document.getElementById('pr-dossier-recherche');
    if (champ) champ.value = '';
    const boite = document.getElementById('pr-dossier-resultats');
    if (boite) { boite.style.display = 'none'; boite.innerHTML = ''; }
    prEtat = prefillPreemption(d);
    renderPreemption();
    if (prEtat.cp) chargerCommunesPreemption(true);
  }

  function ouvrirPreemptionDepuisFiche(id) {
    fermerDossierDrawer();
    definirOnglet('preemption');
    choisirDossierPreemption(id);
  }

  async function chargerCommunesPreemption(puisZonage) {
    const cp = String(prEtat.cp || '').trim();
    if (!/^\d{5}$/.test(cp)) { prEtat.communes = []; renderPreemption(); return; }
    try {
      const r = await fetchAvecAuth(`/api/urbanisme/communes?cp=${encodeURIComponent(cp)}`);
      const corps = await r.json().catch(() => ({}));
      prEtat.communes = r.ok ? (corps.communes || []) : [];
      if (!r.ok) prEtat.erreurZonage = corps.erreur || 'Communes introuvables.';
      if (prEtat.communes.length && !prEtat.communes.some(c => c.insee === prEtat.insee)) {
        // Commune de l'adresse si elle est citée, sinon la seule du code postal.
        const adresse = normaliserPourRecherche(prEtat.adresse || '');
        const citee = prEtat.communes.find(c => adresse.includes(normaliserPourRecherche(c.nom)));
        prEtat.insee = (citee || (prEtat.communes.length === 1 ? prEtat.communes[0] : {})).insee || '';
      }
    } catch (e) {
      prEtat.erreurZonage = 'Serveur injoignable.';
    }
    renderPreemption();
    if (puisZonage && prEtat.insee && parcellesDepuisTexte(prEtat.parcelles).length) lireZonagePreemption();
  }

  async function lireZonagePreemption() {
    const p = parcellesDepuisTexte(prEtat.parcelles)[0];
    if (!prEtat.insee || !p) { prEtat.erreurZonage = 'Choisir la commune et indiquer la parcelle (ex. AL 839).'; renderPreemption(); return; }
    prEtat.lecture = true;
    prEtat.erreurZonage = '';
    renderPreemption();
    try {
      const r = await fetchAvecAuth(`/api/urbanisme/parcelle?insee=${encodeURIComponent(prEtat.insee)}&section=${encodeURIComponent(p.section)}&numero=${encodeURIComponent(p.numero)}`);
      const corps = await r.json().catch(() => ({}));
      if (!r.ok) { prEtat.zonage = null; prEtat.erreurZonage = corps.erreur || 'Zonage illisible.'; }
      else { prEtat.zonage = corps; delete prEtat.reponses.zone; }
    } catch (e) {
      prEtat.erreurZonage = 'Serveur injoignable.';
    } finally {
      prEtat.lecture = false;
      renderPreemption();
    }
  }

  function changerChampPreemption(champ, valeur) {
    prEtat[champ] = valeur;
    if (champ === 'insee' || champ === 'parcelles') { prEtat.zonage = null; prEtat.erreurZonage = ''; }
    if (champ === 'cp') { prEtat.insee = ''; chargerCommunesPreemption(false); return; }
    renderPreemption();
  }

  // Une réponse : valeur, ou retirée (« effacer » une réponse oui/non en recliquant).
  function repondrePreemption(cle, valeur) {
    if (valeur === '' || valeur == null || prEtat.reponses[cle] === valeur) delete prEtat.reponses[cle];
    else prEtat.reponses[cle] = valeur;
    renderPreemption();
  }

  function boutonOuiNonPreemption(cle, valeur) {
    const btn = (v, lib) => `<wa-button appearance="outlined" size="s" class="vue-bascule-btn${valeur === v ? ' actif' : ''}" onclick="repondrePreemption('${cle}', ${v})">${lib}</wa-button>`;
    return `<wa-button-group label="Réponse">${btn(true, 'Oui')}${btn(false, 'Non')}</wa-button-group>`;
  }

  function renderQuestionsPreemption(section, rep, manques) {
    return QUESTIONS_PREEMPTION.filter(q => q.section === section && (manques.includes(q.cle) || rep[q.cle] != null))
      .map(q => `<div class="pr-question${manques.includes(q.cle) ? ' pr-question-due' : ''}">
          <span class="pr-question-texte">${escapeHtml(q.libelle)}${q.aide ? infoBulle(q.aide) : ''}</span>
          ${boutonOuiNonPreemption(q.cle, rep[q.cle])}
        </div>`).join('');
  }

  function selectPreemption(cle, liste, valeur, vide) {
    return `<select id="pr-${cle}" onchange="repondrePreemption('${cle}', this.value)">
      ${vide ? `<option value="">${escapeHtml(vide)}</option>` : ''}
      ${liste.map(o => `<option value="${escapeAttr(o.cle)}"${o.cle === valeur ? ' selected' : ''}>${escapeHtml(o.libelle)}</option>`).join('')}
    </select>`;
  }

  var LIBELLES_STATUT_PREEMPTION = { oui: 'À purger', non: 'Non applicable', verifier: 'À vérifier' };
  var CLASSES_STATUT_PREEMPTION = { oui: 'dl-pret', non: 'dl-success', verifier: 'dl-neutre' };

  function renderPreemption() {
    if (!prEtat) prEtat = etatPreemptionVierge();
    const e = prEtat;
    const rep = reponsesPreemption(e);
    const analyse = analyserPreemption(rep);
    const d = e.dossierId ? dossiers.find(x => x.id === e.dossierId) : null;

    const pill = document.getElementById('pr-dossier-pill');
    if (pill) pill.innerHTML = d ? `<div class="dash-recherche-pill">
        <span class="dot-label dl-success"><span class="dot"></span>${escapeHtml(libelleDossierAffiche(d))}</span>
        <wa-button appearance="outlined" size="s" pill type="button" class="action-rapide" onclick="reinitialiserPreemption()">Détacher</wa-button>
      </div>` : '';

    const zone = document.getElementById('pr-parcelle');
    if (zone) {
      const z = e.zonage;
      const zoneLue = z && z.zones && z.zones[0];
      const blois = dpurBlois(e.insee, parcellesDepuisTexte(e.parcelles), e.adresse);
      const actif = document.activeElement && document.activeElement.id;
      zone.innerHTML = `<div class="calc-champs pr-champs">
          <div class="calc-champ"><label for="pr-cp">Code postal</label>
            <input type="text" id="pr-cp" inputmode="numeric" maxlength="5" value="${escapeAttr(e.cp)}" onchange="changerChampPreemption('cp', this.value)"></div>
          <div class="calc-champ"><label for="pr-commune">Commune</label>
            <select id="pr-commune" onchange="changerChampPreemption('insee', this.value)">
              <option value="">${e.communes.length ? 'Choisir…' : 'Code postal d’abord'}</option>
              ${e.communes.map(c => `<option value="${escapeAttr(c.insee)}"${c.insee === e.insee ? ' selected' : ''}>${escapeHtml(c.nom)}</option>`).join('')}
            </select></div>
          <div class="calc-champ"><label for="pr-parcelles">Parcelle(s)</label>
            <input type="text" id="pr-parcelles" placeholder="AL 839, AL 840" value="${escapeAttr(e.parcelles)}" onchange="changerChampPreemption('parcelles', this.value)"></div>
          <div class="calc-champ pr-champ-large"><label for="pr-adresse">Adresse du bien</label>
            <input type="text" id="pr-adresse" value="${escapeAttr(e.adresse)}" onchange="changerChampPreemption('adresse', this.value)"></div>
        </div>
        <div class="pr-zonage-actions">
          <wa-button appearance="outlined" size="s" onclick="lireZonagePreemption()"${e.lecture ? ' loading' : ''}>${icone('map-pin')} Lire le zonage</wa-button>
          <span class="hint">Géoportail de l’urbanisme (IGN) : seuls la commune et le numéro de parcelle sont envoyés.</span>
        </div>
        ${e.erreurZonage ? `<p class="pr-erreur">${icone('alert-triangle')} ${escapeHtml(e.erreurZonage)}</p>` : ''}
        ${z ? `<div class="pr-zonage">
            <div class="pr-zonage-ligne"><span class="pr-zonage-libelle">Document</span><span>${escapeHtml(z.document ? `${z.document.type} — ${z.document.titre}` : z.rnu ? 'Règlement national d’urbanisme (aucun document)' : 'Aucun document d’urbanisme publié')}</span></div>
            <div class="pr-zonage-ligne"><span class="pr-zonage-libelle">Zone</span><span>${zoneLue ? `<strong>${escapeHtml(zoneLue.libelle)}</strong> (${escapeHtml(zoneLue.typezone)})${zoneLue.libelong ? ` — ${escapeHtml(zoneLue.libelong)}` : ''}` : 'aucune zone lue'}</span></div>
            ${z.infos && z.infos.length ? `<div class="pr-zonage-ligne"><span class="pr-zonage-libelle">Informations</span><span>${z.infos.map(escapeHtml).join(' · ')}</span></div>` : ''}
            ${z.prescriptions && z.prescriptions.length ? `<div class="pr-zonage-ligne"><span class="pr-zonage-libelle">Prescriptions</span><span>${z.prescriptions.map(escapeHtml).join(' · ')}</span></div>` : ''}
            ${z.parcelle && z.parcelle.contenance ? `<div class="pr-zonage-ligne"><span class="pr-zonage-libelle">Contenance</span><span>${escapeHtml(String(z.parcelle.contenance))} m² (parcelle ${escapeHtml(z.parcelle.section)} ${escapeHtml(String(Number(z.parcelle.numero)))})</span></div>` : ''}
          </div>` : ''}
        <div class="calc-champs pr-champs">
          <div class="calc-champ"><label for="pr-zone">Zone retenue</label>
            ${selectPreemption('zone', [{ cle: 'U', libelle: 'U — urbaine' }, { cle: 'AU', libelle: 'AU — à urbaniser' }, { cle: 'A', libelle: 'A — agricole' }, { cle: 'N', libelle: 'N — naturelle' }], rep.zone || '', 'Inconnue')}</div>
          <div class="calc-champ"><label for="pr-dpur">DPU renforcé</label>
            ${selectPreemption('dpur', [{ cle: 'oui', libelle: 'Dans un périmètre' }, { cle: 'non', libelle: 'Hors périmètre' }], rep.dpur || '', 'Inconnu')}</div>
          ${!rep.agglopolys ? `<div class="calc-champ"><label for="pr-dpuInstitue">DPU institué par la commune</label>
            ${selectPreemption('dpuInstitue', [{ cle: 'oui', libelle: 'Oui' }, { cle: 'non', libelle: 'Non' }], rep.dpuInstitue || '', 'Inconnu')}</div>` : ''}
        </div>
        ${rep.agglopolys ? `<p class="hint">PLUi d’Agglopolys : DPU institué sur toutes les zones U et AU (délibération du 29/11/2022), exercé par la commune.</p>` : ''}
        ${blois.statut ? `<p class="hint pr-blois">${icone(blois.statut === 'oui' ? 'check' : 'info')} DPU renforcé de Blois : ${escapeHtml(blois.motif)}. <a href="#" onclick="event.preventDefault(); basculerPlansDpurBlois()">Voir les plans</a></p>
          <div id="pr-plans-dpur" class="pr-plans" style="display:none;">
            <figure><img src="vendor/plans/dpur-blois-centre-ville.jpg" alt="Plan du périmètre du DPU renforcé, centre-ville de Blois" loading="lazy"><figcaption>Centre-ville (Action Cœur de Ville / ORT)</figcaption></figure>
            <figure><img src="vendor/plans/dpur-blois-coty.jpg" alt="Plan du périmètre du DPU renforcé, secteur Coty" loading="lazy"><figcaption>Secteur Coty — parcelle AL 839</figcaption></figure>
          </div>` : ''}`;
      if (actif) { const el = document.getElementById(actif); if (el && el.focus) el.focus(); }
    }

    const mutation = document.getElementById('pr-mutation-zone');
    if (mutation) mutation.innerHTML = `<div class="calc-champ"><label for="pr-mutation">Nature de la mutation</label>${selectPreemption('mutation', MUTATIONS_PREEMPTION, rep.mutation || '', 'Choisir…')}</div>
      ${renderQuestionsPreemption('mutation', rep, analyse.manques)}`;

    const bien = document.getElementById('pr-bien-zone');
    if (bien) {
      const avecCas = rep.bien === 'bati' || rep.bien === 'lot-copro';
      bien.innerHTML = `<div class="calc-champs pr-champs">
          <div class="calc-champ"><label for="pr-bien">Nature du bien</label>${selectPreemption('bien', BIENS_PREEMPTION, rep.bien || '', 'Choisir…')}</div>
          ${avecCas ? `<div class="calc-champ"><label for="pr-casBati">Cas particulier</label>${selectPreemption('casBati', CAS_BATI_PREEMPTION, rep.casBati || 'standard')}</div>` : ''}
        </div>
        ${renderQuestionsPreemption('bien', rep, analyse.manques)}`;
    }

    const rural = document.getElementById('pr-rural-zone');
    if (rural) {
      const questions = renderQuestionsPreemption('rural', rep, analyse.manques);
      rural.innerHTML = questions || '<p class="hint">Rien à préciser : ni la SAFER ni le code forestier ne demandent d’autre réponse.</p>';
    }

    const res = document.getElementById('pr-resultat');
    if (res) {
      res.innerHTML = `<div class="pr-droits">${analyse.droits.map(dr => `<div class="pr-droit pr-droit-${dr.statut}">
          <div class="pr-droit-tete"><span class="pr-droit-titre">${escapeHtml(dr.titre)}</span>
            <span class="dot-label ${CLASSES_STATUT_PREEMPTION[dr.statut]}"><span class="dot"></span>${LIBELLES_STATUT_PREEMPTION[dr.statut]}</span></div>
          ${dr.motif ? `<div class="pr-droit-motif">${escapeHtml(dr.motif)}</div>` : ''}
          ${dr.formalite && dr.statut !== 'non' ? `<div class="pr-droit-formalite">${icone('file-text')} ${escapeHtml(dr.formalite)}</div>` : ''}
        </div>`).join('')}</div>
        <p class="hint">Assistance à la décision, d’après les tableaux fournis par l’étude (Cheuvreux, CRIDON, Letulle) : le notaire garde la décision. Exceptions (parent jusqu’au 4e degré, preneur en place…) à vérifier au cas par cas.</p>
        ${d ? `<div class="reglages-actions"><wa-button variant="brand" onclick="enregistrerPreemptionFiche()">${icone('check')} Enregistrer sur la fiche</wa-button>
          ${d.preemption && d.preemption.le ? `<span class="hint">Enregistré le ${escapeHtml(formatDateFr(d.preemption.le.slice(0, 10)))}</span>` : ''}</div>` : ''}`;
    }
    if (typeof majSommaireOutil === 'function') majSommaireOutil('preemption');
  }

  function basculerPlansDpurBlois() {
    const z = document.getElementById('pr-plans-dpur');
    if (z) z.style.display = z.style.display === 'none' ? '' : 'none';
  }

  // Pure : ce qui est gardé sur la fiche — les réponses données, la zone lue, le résultat de chaque droit.
  function preemptionPourFiche(etat, maintenant) {
    const rep = reponsesPreemption(etat);
    const analyse = analyserPreemption(rep);
    const z = etat.zonage;
    const zoneLue = z && z.zones && z.zones[0];
    return {
      le: (maintenant || new Date()).toISOString(),
      insee: etat.insee || '',
      zone: zoneLue ? `${zoneLue.libelle} (${zoneLue.typezone})` : (rep.zone || ''),
      document: z && z.document ? `${z.document.type} — ${z.document.titre}` : '',
      reponses: Object.assign({}, etat.reponses),
      droits: analyse.droits.map(dr => ({ cle: dr.cle, titre: dr.titre, statut: dr.statut, motif: dr.motif, formalite: dr.formalite }))
    };
  }

  function enregistrerPreemptionFiche() {
    const d = prEtat && prEtat.dossierId ? dossiers.find(x => x.id === prEtat.dossierId) : null;
    if (!d) return;
    d.preemption = preemptionPourFiche(prEtat);
    const aPurger = d.preemption.droits.filter(dr => dr.statut === 'oui').map(dr => dr.titre);
    ajouterHistorique(d, `Droits de préemption vérifiés : ${aPurger.length ? 'à purger — ' + aPurger.join(', ') : 'aucun droit à purger'}`);
    sauvegarder(d);
    afficherToast(aPurger.length ? `Enregistré sur la fiche : ${aPurger.join(', ')} à purger.` : 'Enregistré sur la fiche : aucun droit à purger.');
    renderPreemption();
  }

  // Fiche › Pièces et analyse : le dernier résultat enregistré, ou le geste pour vérifier.
  function renderPreemptionFiche(d) {
    if (!d || estSuccession(d)) return '';
    const p = d.preemption;
    const ouvrir = `ouvrirPreemptionDepuisFiche('${escapeOnclickArg(d.id)}')`;
    if (!p || !Array.isArray(p.droits)) {
      return `<div class="fiche-sous-partie"><div class="section-eyebrow fiche-sous-titre">Droits de préemption</div>
        <ul class="ja-liste">${renderLigneAction({ titre: 'Vérifier les droits de préemption', sous: 'DPU, SAFER, bois et forêts — d’après le zonage de la parcelle', bouton: { libelle: 'Vérifier', onclick: ouvrir } })}</ul></div>`;
    }
    return `<div class="fiche-sous-partie"><div class="section-eyebrow fiche-sous-titre">Droits de préemption
        <span class="hint">${p.zone ? 'zone ' + escapeHtml(p.zone) + ' · ' : ''}vérifiés le ${escapeHtml(formatDateFr(String(p.le || '').slice(0, 10)))}</span></div>
      <div class="pr-fiche">${p.droits.map(dr => `<div class="pr-fiche-ligne">
          <span class="dot-label ${CLASSES_STATUT_PREEMPTION[dr.statut] || 'dl-neutre'}"><span class="dot"></span>${escapeHtml(LIBELLES_STATUT_PREEMPTION[dr.statut] || dr.statut)}</span>
          <span class="pr-fiche-titre">${escapeHtml(dr.titre)}</span>
          <span class="hint">${escapeHtml(dr.statut === 'oui' ? dr.formalite : dr.motif)}</span>
        </div>`).join('')}</div>
      <wa-button appearance="plain" size="s" class="bouton-discret" onclick="${ouvrir}">${icone('pencil')} Revoir</wa-button></div>`;
  }
