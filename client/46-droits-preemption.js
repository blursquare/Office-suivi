  // ===== Outil « Droits de préemption » (étude 06/10) : l'écran, pré-rempli depuis la fiche, zonage lu sur le Géoportail de
  // l'urbanisme (server/src/urbanisme.js), règles dans 45-preemption-regles.js, résultat gardé sur la fiche (d.preemption). =====

  var prEtat = null;           // { dossierId, cp, insee, communes, parcelles, adresse, zonages, erreurZonage, lecture, reponses }

  function etatPreemptionVierge() {
    return { dossierId: '', cp: '', insee: '', communes: [], parcelles: '', adresse: '', zonages: [], erreurZonage: '', lecture: false, reponses: { mutation: 'vente' } };
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

  // Pure : les zonages lus avec succès.
  function zonagesLusPreemption(etat) {
    return ((etat && etat.zonages) || []).filter(z => z.statut === 'ok' && z.resultat).map(z => z.resultat);
  }

  // Pure : monuments historiques et sites protégés qui touchent les parcelles lues (étude 08/10 : « une information importante si les
  // acquéreurs veulent faire des travaux »). `lu` : toutes les parcelles lues ont reçu la réponse de la couche des servitudes —
  // sinon l'absence de servitude ne dit rien. Les servitudes de plusieurs parcelles sont réunies, sans doublon.
  function patrimoinePreemption(etat) {
    const lus = zonagesLusPreemption(etat);
    if (!lus.length) return null;
    const vus = new Set();
    const servitudes = [];
    lus.forEach(z => ((z.patrimoine && z.patrimoine.servitudes) || []).forEach(x => {
      const cle = `${x.type}|${x.nom}|${x.nature}`;
      if (!vus.has(cle)) { vus.add(cle); servitudes.push({ type: x.type, libelle: x.libelle, nom: x.nom, nature: x.nature, rayon: x.rayon || null }); }
    }));
    return { lu: lus.every(z => z.patrimoine && z.patrimoine.lu === true), servitudes: servitudes.slice(0, 20) };
  }

  // Pure : la ligne d'information « Monument historique » de l'analyse, d'après ce qui a été gardé. null = rien à montrer.
  function lignePatrimoinePreemption(patrimoine) {
    if (!patrimoine || typeof patrimoine !== 'object') return null;
    const servitudes = Array.isArray(patrimoine.servitudes) ? patrimoine.servitudes : [];
    if (servitudes.length) {
      const monuments = servitudes.filter(x => x.type === 'ac1');
      const autres = servitudes.filter(x => x.type !== 'ac1');
      const parts = [];
      if (monuments.length) {
        const noms = monuments.map(x => `${x.nom ? '« ' + x.nom + ' »' : 'monument'}${x.rayon ? ' (' + x.rayon + ' m)' : ''}`);
        parts.push(`${monuments.every(x => /abords/i.test(x.nature)) ? 'Abords de monument historique' : 'Monument historique'} : ${noms.join(', ')}`);
      }
      autres.forEach(x => parts.push(`${x.libelle}${x.nom ? ' : ' + x.nom : ''}`));
      return {
        statut: 'oui',
        titre: monuments.length ? 'Monument historique' : 'Site protégé',
        motif: parts.join(' · '),
        conseil: 'Travaux visibles de l’extérieur (façade, toiture, menuiseries, clôture, abords) : l’accord de l’architecte des bâtiments de France est à prévoir. À signaler aux acquéreurs.'
      };
    }
    if (patrimoine.lu === false) return { statut: 'verifier', titre: 'Monument historique', motif: 'Servitudes du Géoportail non lues — à vérifier', conseil: '' };
    return { statut: 'non', titre: 'Monument historique', motif: 'Aucun monument historique ni site protégé publié au Géoportail pour cette parcelle', conseil: '', hors: true };
  }

  var LIBELLES_PATRIMOINE = { oui: 'En zone protégée', non: 'Aucun publié', verifier: 'À vérifier' };
  var CLASSES_PATRIMOINE = { oui: 'dl-pret', non: 'dl-success', verifier: 'dl-neutre' };
  var AIDE_PATRIMOINE = 'Servitudes d’utilité publique lues sur le Géoportail de l’urbanisme (monuments historiques AC1, sites inscrits et classés AC2, sites patrimoniaux remarquables AC4). Une commune qui n’a pas versé ses servitudes n’y apparaît pas : l’absence de résultat ne prouve pas l’absence de protection. Information donnée à titre d’aide, à vérifier auprès de la mairie ou du service de l’urbanisme.';

  // Pure : les réponses de l'outil enrichies de ce qui se déduit du zonage lu (Agglopolys, DPU renforcé de Blois). La zone de
  // chaque parcelle est prise à part par analyserPreemptionParcelles ; `zone` ne sert qu'au choix à la main sans parcelle lue.
  function reponsesPreemption(etat) {
    const e = etat || etatPreemptionVierge();
    const r = Object.assign({}, e.reponses);
    const lus = zonagesLusPreemption(e);
    if (lus.some(z => z.epciSiren === SIREN_AGGLOPOLYS)) r.agglopolys = true;
    if (!r.dpur) {
      const blois = dpurBlois(e.insee, parcellesDepuisTexte(e.parcelles), e.adresse);
      if (blois.statut === 'oui') r.dpur = 'oui';
      else if (blois.statut === 'non' && e.insee === DPUR_BLOIS.insee) r.dpur = 'non';
      // Ailleurs qu'à Blois, aucun périmètre de DPU renforcé n'est connu : la question reste posée quand elle compte (audit
      // 12/10 : « non » posé sans source rendait le DPU non applicable à un bien soumis au seul DPU renforcé).
    }
    if (r.dpur === 'oui' && e.insee === DPUR_BLOIS.insee) r.dpurDelegataire = DPUR_BLOIS.delegataire;
    return r;
  }

  // Pure : « AL 839, AL 840 » / « AL0839 » → [{ section, numero }].
  function parcellesDepuisTexte(texte) {
    // « et », « n », « de »… ne sont pas des sections (audit 12/10 : « AB 12 et 13 » donnait « ET 13 ») ; un numéro seul qui
    // suit (« et 13 », « , 14 ») garde la section précédente.
    const out = [];
    const re = /(?:^|[^A-Za-z0-9])([0-9]?[A-Z]{1,2})\s*(?:N°|n°|no|n)?\s*(\d{1,4})(?![0-9])((?:\s*(?:,|et|&)\s*(?:n°\s*)?\d{1,4}(?![0-9])(?!\s*(?:m2|m²|m|ha|ca)(?![A-Za-z])|\s*a\s+\d))*)/gi;
    let m;
    while ((m = re.exec(String(texte || ''))) && out.length < 20) {
      const section = m[1].toUpperCase();
      // Écrite en minuscules, une section d'une lettre ou un petit mot (« et », « n », « m2 ») n'en est pas une ; en capitales,
      // N, AU, LA… sont de vraies sections.
      if (m[1] !== section && (section.replace(/^[0-9]/, '').length < 2 || /^(ET|OU|NO|DE|DU|LA|LE|AU|EN)$/.test(section))) continue;
      out.push({ section, numero: String(Number(m[2])) });
      (m[3].match(/\d{1,4}/g) || []).forEach(n => { if (out.length < 20) out.push({ section, numero: String(Number(n)) }); });
    }
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
    else if (/terrain|terre/.test(type)) e.reponses.bien = 'terrain';
    else if (type) e.reponses.bien = 'bati';
    if (d.preemption && d.preemption.reponses) e.reponses = Object.assign({}, e.reponses, d.preemption.reponses);
    if (d.preemption && d.preemption.insee) e.insee = d.preemption.insee;
    if (d.preemption && d.preemption.travaux && Array.isArray(d.preemption.travaux.liste)) e.travaux = { source: d.preemption.travaux.source || '', liste: d.preemption.travaux.liste };
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
    if (!prEtat.travaux && d.dossierLie && d.nasDossier) lireTravauxCompromisPreemption();
  }

  function ouvrirPreemptionDepuisFiche(id) {
    fermerDossierDrawer();
    definirOnglet('preemption');
    choisirDossierPreemption(id);
  }

  // Pure : la commune retenue parmi celles du code postal — celle citée dans l'adresse, sinon la seule ; '' si rien ne départage.
  function communeDuCodePostalPreemption(communes, adresse) {
    // Mot entier seulement et commune en tête d'abord (« BLOIS (41000), 2 rue Mermoz » ; audit 12/10 : « Mermoz » donnait
    // Mer, « route de Blois » donnait Blois) ; puis la commune juste après le code postal ; puis la plus longue citée.
    const liste = communes || [];
    const mots = (x) => ' ' + normaliserPourRecherche(x || '').replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
    const brut = String(adresse || '');
    const tete = mots(brut.split(/[(,]/)[0]);
    const apresCp = mots((/\b\d{5}\b\s*([^,\d]+)/.exec(brut) || [])[1] || '');
    const texte = mots(brut);
    const nom = c => mots(c.nom);
    const egal = (zone) => liste.find(c => nom(c).trim() && zone.trim() === nom(c).trim());
    // Un nom précédé de « de / du / d' » est celui d'une voie (« route de Blois »), pas la commune.
    const citeeHorsVoie = (c) => {
      const n = nom(c);
      let i = texte.indexOf(n);
      while (i !== -1) {
        if (!/ (de|du|d)$/.test(texte.slice(0, i))) return true;
        i = texte.indexOf(n, i + 1);
      }
      return false;
    };
    const citees = liste.filter(c => nom(c).trim() && citeeHorsVoie(c)).sort((a, b) => nom(b).length - nom(a).length);
    const choisie = egal(tete) || egal(apresCp) || (citees.length === 1 ? citees[0] : null) || (liste.length === 1 ? liste[0] : null);
    return (choisie || {}).insee || '';
  }

  // Les communes du code postal de l'état (outil ou analyse d'un dossier) et la commune retenue. Rend '' ou l'erreur.
  async function lireCommunesEtatPreemption(etat) {
    const cp = String(etat.cp || '').trim();
    if (!/^\d{5}$/.test(cp)) { etat.communes = []; return ''; }
    try {
      const r = await fetchAvecAuth(`/api/urbanisme/communes?cp=${encodeURIComponent(cp)}`);
      const corps = await r.json().catch(() => ({}));
      etat.communes = r.ok ? (corps.communes || []) : [];
      if (etat.communes.length && !etat.communes.some(c => c.insee === etat.insee)) etat.insee = communeDuCodePostalPreemption(etat.communes, etat.adresse);
      return r.ok ? '' : (corps.erreur || 'Communes introuvables.');
    } catch (e) {
      return 'Serveur injoignable.';
    }
  }

  // Le zonage de chaque parcelle de l'état (20 au plus), trois à la fois ; `apres` est appelé à chaque réponse.
  async function lireZonagesEtatPreemption(etat, apres) {
    etat.zonages = parcellesDepuisTexte(etat.parcelles).map(p => ({ section: p.section, numero: p.numero, statut: 'lecture', resultat: null, erreur: '' }));
    const lire = async (z) => {
      try {
        const r = await fetchAvecAuth(`/api/urbanisme/parcelle?insee=${encodeURIComponent(etat.insee)}&section=${encodeURIComponent(z.section)}&numero=${encodeURIComponent(z.numero)}`);
        const corps = await r.json().catch(() => ({}));
        if (r.ok && !corps.erreur) { z.statut = 'ok'; z.resultat = corps; }
        else { z.statut = 'erreur'; z.erreur = corps.erreur || 'Zonage illisible.'; }
      } catch (e) {
        z.statut = 'erreur'; z.erreur = 'Serveur injoignable.';
      }
      if (apres) apres();
    };
    const file = etat.zonages.slice();
    await Promise.all([0, 1, 2].map(async () => { while (file.length) await lire(file.shift()); }));
  }

  async function chargerCommunesPreemption(puisZonage) {
    const erreur = await lireCommunesEtatPreemption(prEtat);
    if (erreur) prEtat.erreurZonage = erreur;
    renderPreemption();
    if (puisZonage && prEtat.insee && parcellesDepuisTexte(prEtat.parcelles).length) lireZonagePreemption();
  }

  // Toutes les parcelles (20 au plus), trois à la fois : chaque ligne du tableau se remplit dès que sa réponse arrive.
  async function lireZonagePreemption() {
    const parcelles = parcellesDepuisTexte(prEtat.parcelles);
    if (!prEtat.insee || !parcelles.length) { prEtat.erreurZonage = 'Choisir la commune et indiquer la ou les parcelles (ex. AL 839, AL 840).'; renderPreemption(); return; }
    const etat = prEtat;
    etat.lecture = true;
    etat.erreurZonage = '';
    const lecture = lireZonagesEtatPreemption(etat, () => { if (prEtat === etat) renderPreemption(); });
    renderPreemption();
    await lecture;
    etat.lecture = false;
    if (prEtat === etat) renderPreemption();
  }

  // Zone retenue d'une parcelle, choisie à la main (vide = celle du Géoportail).
  function choisirZoneParcellePreemption(cle, valeur) {
    const choix = Object.assign({}, prEtat.reponses.zonesParcelles || {});
    if (valeur) choix[cle] = valeur; else delete choix[cle];
    if (Object.keys(choix).length) prEtat.reponses.zonesParcelles = choix; else delete prEtat.reponses.zonesParcelles;
    renderPreemption();
  }

  function changerChampPreemption(champ, valeur) {
    prEtat[champ] = valeur;
    if (champ === 'insee' || champ === 'parcelles') { prEtat.zonages = []; prEtat.erreurZonage = ''; }
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
    return boutonsReponsePreemption(v => `repondrePreemption('${cle}', ${v})`, valeur);
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

  var ZONES_PREEMPTION = [{ cle: 'U', libelle: 'U — urbaine' }, { cle: 'AU', libelle: 'AU — à urbaniser' }, { cle: 'A', libelle: 'A — agricole' }, { cle: 'N', libelle: 'N — naturelle' }];

  // Le zonage lu, une ligne par parcelle (étude 06/10 : « attention à ne pas mettre trop de scroll, pense à un tableau ») :
  // parcelle, zone du document d'urbanisme, zone retenue (modifiable), contenance ; document, informations et prescriptions
  // communes en dessous, les secondes repliées.
  function renderTableauZonagePreemption(e, lignes) {
    if (!lignes.length) return '';
    const lus = zonagesLusPreemption(e);
    const docs = [...new Set(lus.map(z => z.document ? `${z.document.type} — ${z.document.titre}` : z.rnu ? 'Règlement national d’urbanisme (aucun document)' : 'Aucun document d’urbanisme publié'))];
    const infos = [...new Set(lus.flatMap(z => z.infos || []))];
    const prescriptions = [...new Set(lus.flatMap(z => z.prescriptions || []))];
    const total = lignes.reduce((s, l) => s + (l.contenance || 0), 0);
    const ligne = (l) => `<tr>
        <td class="pr-zt-parcelle">${escapeHtml(l.libelle)}</td>
        <td class="pr-zt-zone">${l.statut === 'lecture' ? `<span class="hint">${icone('spinner')} Lecture…</span>`
          : l.statut === 'erreur' ? `<span class="pr-zt-erreur" title="${escapeAttr(l.erreur)}">${icone('alert-triangle')} ${escapeHtml(l.erreur)}</span>`
          : l.zone ? `<strong>${escapeHtml(l.zone)}</strong>${l.libelong ? ` <span class="pr-zt-long" title="${escapeAttr(l.libelong)}">${escapeHtml(l.libelong)}</span>` : ''}` : '<span class="hint">aucune zone lue</span>'}</td>
        <td class="pr-zt-retenue"><select aria-label="Zone retenue pour ${escapeAttr(l.libelle)}" onchange="choisirZoneParcellePreemption('${escapeOnclickArg(l.cle)}', this.value)">
          <option value="">${l.lue ? escapeHtml(l.lue) + ' (lue)' : 'Inconnue'}</option>
          ${ZONES_PREEMPTION.map(z => `<option value="${z.cle}"${l.choisie && l.famille === z.cle ? ' selected' : ''}>${escapeHtml(z.libelle)}</option>`).join('')}
        </select></td>
        <td class="pr-zt-surface">${l.contenance ? escapeHtml(formaterContenance(l.contenance)) : ''}</td>
      </tr>`;
    return `<div class="pr-zonage">
        <div class="pr-zt-cadre"><table class="pr-zt">
          <thead><tr><th>Parcelle</th><th>Zone lue</th><th>Zone retenue</th><th class="pr-zt-surface">Contenance</th></tr></thead>
          <tbody>${lignes.map(ligne).join('')}</tbody>
          ${lignes.length > 1 && total ? `<tfoot><tr><td colspan="3">Total</td><td class="pr-zt-surface">${escapeHtml(formaterContenance(total))}</td></tr></tfoot>` : ''}
        </table></div>
        ${docs.length ? `<div class="pr-zonage-ligne"><span class="pr-zonage-libelle">Document</span><span>${docs.map(escapeHtml).join(' · ')}</span></div>` : ''}
        ${infos.length || prescriptions.length ? `<wa-details class="pr-zt-details" summary="Informations et prescriptions (${infos.length + prescriptions.length})">
            ${infos.length ? `<div class="pr-zonage-ligne"><span class="pr-zonage-libelle">Informations</span><span>${infos.map(escapeHtml).join(' · ')}</span></div>` : ''}
            ${prescriptions.length ? `<div class="pr-zonage-ligne"><span class="pr-zonage-libelle">Prescriptions</span><span>${prescriptions.map(escapeHtml).join(' · ')}</span></div>` : ''}
          </wa-details>` : ''}
      </div>`;
  }

  var LIBELLES_STATUT_PREEMPTION = { oui: 'À purger', non: 'Non applicable', verifier: 'À vérifier' };
  var CLASSES_STATUT_PREEMPTION = { oui: 'dl-pret', non: 'dl-success', verifier: 'dl-neutre' };

  function renderPreemption() {
    if (!prEtat) prEtat = etatPreemptionVierge();
    const e = prEtat;
    const rep = reponsesPreemption(e);
    const lignes = lignesZonageParcelles(e.zonages, rep.zonesParcelles);
    const analyse = analyserPreemptionParcelles(rep, lignes);
    const d = e.dossierId ? dossiers.find(x => x.id === e.dossierId) : null;

    const pill = document.getElementById('pr-dossier-pill');
    if (pill) pill.innerHTML = d ? `<div class="dash-recherche-pill">
        <span class="dot-label dl-success"><span class="dot"></span>${escapeHtml(libelleDossierAffiche(d))}</span>
        <wa-button appearance="outlined" size="s" pill type="button" class="action-rapide" onclick="reinitialiserPreemption()">Détacher</wa-button>
      </div>` : '';

    const zone = document.getElementById('pr-parcelle');
    if (zone) {
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
          <span class="hint">Géoportail de l’urbanisme (IGN) : chaque parcelle est lue ; seuls la commune et les numéros de parcelle sont envoyés.</span>
        </div>
        ${e.erreurZonage ? `<p class="pr-erreur">${icone('alert-triangle')} ${escapeHtml(e.erreurZonage)}</p>` : ''}
        ${renderTableauZonagePreemption(e, lignes)}
        <div class="calc-champs pr-champs">
          ${lignes.length ? '' : `<div class="calc-champ"><label for="pr-zone">Zone retenue</label>
            ${selectPreemption('zone', ZONES_PREEMPTION, rep.zone || '', 'Inconnue')}</div>`}
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
          ${dr.formalite ? `<div class="pr-droit-formalite">${icone('file-text')} ${escapeHtml(dr.formalite)}</div>` : ''}
        </div>`).join('')}</div>
        ${renderPatrimoineOutil(patrimoinePreemption(e))}
        <p class="hint">Assistance à la décision, d’après les tableaux fournis par l’étude (Cheuvreux, CRIDON, Letulle) : le notaire garde la décision. Exceptions (parent jusqu’au 4e degré, preneur en place…) à vérifier au cas par cas.</p>
        ${d ? `<div class="reglages-actions"><wa-button variant="brand" onclick="enregistrerPreemptionFiche()">${icone('check')} Enregistrer sur la fiche</wa-button>
          ${d.preemption && d.preemption.le ? `<span class="hint">Enregistré le ${escapeHtml(formatDateFr(d.preemption.le.slice(0, 10)))}</span>` : ''}</div>` : ''}`;
    }
    renderTravauxPreemption();
    if (typeof majSommaireOutil === 'function') majSommaireOutil('preemption');
  }

  // Le bloc « Monument historique » sous les droits, dans l'outil (même forme qu'un droit : titre, état, motif, conseil).
  function renderPatrimoineOutil(patrimoine) {
    const l = lignePatrimoinePreemption(patrimoine);
    if (!l) return '';
    return `<div class="pr-droits"><div class="pr-droit pr-droit-${l.statut === 'oui' ? 'oui' : l.statut === 'non' ? 'non' : 'verifier'}">
        <div class="pr-droit-tete"><span class="pr-droit-titre">${escapeHtml(l.titre)}${infoBulle(AIDE_PATRIMOINE)}</span>
          <span class="dot-label ${CLASSES_PATRIMOINE[l.statut]}"><span class="dot"></span>${LIBELLES_PATRIMOINE[l.statut]}</span></div>
        <div class="pr-droit-motif">${escapeHtml(l.motif)}</div>
        ${l.conseil ? `<div class="pr-droit-formalite">${icone('alert-triangle')} ${escapeHtml(l.conseil)}</div>` : ''}
      </div></div>`;
  }

  function basculerPlansDpurBlois() {
    const z = document.getElementById('pr-plans-dpur');
    if (z) z.style.display = z.style.display === 'none' ? '' : 'none';
  }

  // Pure : ce qui est gardé sur la fiche — les réponses données, la zone lue, le résultat de chaque droit.
  function preemptionPourFiche(etat, maintenant) {
    const rep = reponsesPreemption(etat);
    const lignes = lignesZonageParcelles(etat.zonages || [], rep.zonesParcelles);
    const analyse = analyserPreemptionParcelles(rep, lignes);
    const z = zonagesLusPreemption(etat)[0] || null;
    const zoneLigne = (l) => l.zone ? `${l.zone} (${l.typezone})` : (l.famille || 'inconnue');
    const zone = lignes.length === 1 ? zoneLigne(lignes[0])
      : lignes.length ? lignes.map(l => `${l.libelle} : ${zoneLigne(l)}`).join(' · ') : (rep.zone || '');
    return {
      le: (maintenant || new Date()).toISOString(),
      insee: etat.insee || '',
      zone,
      parcelles: lignes.map(l => ({ parcelle: l.libelle, zone: l.zone, famille: l.famille, contenance: l.contenance })),
      document: z && z.document ? `${z.document.type} — ${z.document.titre}` : '',
      reponses: Object.assign({}, etat.reponses),
      // Ce que le zonage a fait déduire (Agglopolys, DPU renforcé de Blois) et la zone de chaque parcelle : de quoi refaire
      // l'analyse sur la fiche quand une question y reçoit sa réponse, sans relire le Géoportail.
      deduites: deduitesPreemption(etat.reponses, rep),
      lignes: lignes.map(l => ({ cle: l.cle, libelle: l.libelle, statut: l.statut, zone: l.zone, typezone: l.typezone, lue: l.lue, famille: l.famille, autresFamilles: l.autresFamilles || [], choisie: l.choisie, contenance: l.contenance })),
      droits: analyse.droits.map(dr => ({ cle: dr.cle, titre: dr.titre, statut: dr.statut, motif: dr.motif, formalite: dr.formalite })),
      // Toujours un objet : « non lu » est une réponse (sinon la relecture automatique repartirait à chaque ouverture de la fiche).
      patrimoine: patrimoinePreemption(etat) || { lu: false, servitudes: [] },
      ...(etat.travaux && Array.isArray(etat.travaux.liste) ? { travaux: { le: (maintenant || new Date()).toISOString(), source: etat.travaux.source || '', liste: etat.travaux.liste } } : {}),
      ...(etat.sitadel && Array.isArray(etat.sitadel.autorisations) ? { sitadel: { le: (maintenant || new Date()).toISOString(), autorisations: etat.sitadel.autorisations } } : {})
    };
  }

  // Pure : les réponses ajoutées par le zonage à celles données (Agglopolys, DPU renforcé et son délégataire).
  function deduitesPreemption(donnees, completes) {
    const out = {};
    Object.keys(completes || {}).forEach(k => { if (k !== 'zonesParcelles' && (donnees || {})[k] !== completes[k]) out[k] = completes[k]; });
    return out;
  }

  function enregistrerPreemptionFiche() {
    const d = prEtat && prEtat.dossierId ? dossiers.find(x => x.id === prEtat.dossierId) : null;
    if (!d) return;
    // Pièces déjà ajoutées par une analyse précédente : suivies, pour être retirées si le droit tombe.
    const avant = d.preemption && d.preemption.piecesAjoutees;
    const travauxAvant = d.preemption && d.preemption.travaux;
    const sitadelAvant = d.preemption && d.preemption.sitadel;
    d.preemption = Object.assign(preemptionPourFiche(prEtat), { signature: signaturePreemptionDossier(d) }, avant ? { piecesAjoutees: avant } : {});
    if (!d.preemption.travaux && travauxAvant) d.preemption.travaux = travauxAvant;
    if (!d.preemption.sitadel && sitadelAvant) d.preemption.sitadel = sitadelAvant;
    const pieces = appliquerPreemptionSurPieces(d, { explicite: true });
    const aPurger = d.preemption.droits.filter(dr => dr.statut === 'oui').map(dr => dr.titre);
    ajouterHistorique(d, `Droits de préemption vérifiés : ${aPurger.length ? 'à purger — ' + aPurger.join(', ') : 'aucun droit à purger'}${pieces.length ? ' — ' + pieces.join(' ; ') : ''}`);
    sauvegarder(d);
    afficherToast(aPurger.length ? `Enregistré sur la fiche : ${aPurger.join(', ')} à purger.` : 'Enregistré sur la fiche : aucun droit à purger.');
    renderPreemption();
  }

  // Une réponse oui / non posée sur la ligne d'une question (outil ou fiche).
  function boutonsReponsePreemption(onclick, valeur, valeurs) {
    const [oui, non] = valeurs || [true, false];
    const btn = (v, lib) => `<wa-button appearance="outlined" size="s" class="vue-bascule-btn${valeur === v ? ' actif' : ''}" onclick="${onclick(v)}">${lib}</wa-button>`;
    return `<wa-button-group label="Réponse">${btn(oui, 'Oui')}${btn(non, 'Non')}</wa-button-group>`;
  }

  // Fiche › Pièces et analyse : le dernier résultat (lu seul à la création, ou enregistré depuis l'outil), les questions qui
  // restent — à répondre sur place —, ou le geste pour vérifier.
  function renderPreemptionFiche(d) {
    if (!d || estSuccession(d)) return '';
    const p = d.preemption;
    const ouvrir = `ouvrirPreemptionDepuisFiche('${escapeOnclickArg(d.id)}')`;
    if (!p || !Array.isArray(p.droits)) {
      const enCours = preemptionsAutoEnCours.has(d.id);
      return `<div class="fiche-sous-partie"><div class="section-eyebrow fiche-sous-titre">Contrôle de l’urbanisme</div>
        <ul class="ja-liste">${renderLigneAction({ titre: enCours ? 'Lecture du zonage…' : 'Vérifier les droits de préemption', sous: 'DPU, SAFER, bois et forêts — d’après le zonage de chaque parcelle', bouton: { libelle: 'Vérifier', onclick: ouvrir } })}</ul></div>`;
    }
    const droits = droitsPreemptionFiche(p);
    const questions = questionsPreemptionFiche(p);
    const reste = resteAPreciserPreemptionFiche(p);
    const piecesChecklist = checklistPieces(d.typeVente, d);
    const dpu = droits.find(dr => dr.cle === 'dpu');
    const renonciationInutile = dpu && dpu.statut === 'non' && d.typeVente !== 'copropriete'
      && piecesChecklist.some(pc => pc.cle === 'renonciationPreemption') && !(d.pieces && d.pieces.renonciationPreemption === 'recue');
    return `<div class="fiche-sous-partie"><div class="section-eyebrow fiche-sous-titre">Contrôle de l’urbanisme
        <span class="hint">${p.zone ? 'zone ' + escapeHtml(p.zone) + ' · ' : ''}${p.auto ? 'lus seuls' : 'vérifiés'} le ${escapeHtml(formatDateFr(String(p.le || '').slice(0, 10)))}</span>${p.auto ? infoBulle('Analyse faite par CLAIRE à l’ajout du dossier, avec l’outil « Contrôle de l’urbanisme » : zonage de chaque parcelle lu sur le Géoportail de l’urbanisme, nature du bien d’après la fiche. Un droit à purger ajoute sa pièce à attendre ; une réponse manquante laisse le droit « À vérifier ».') : ''}</div>
      <div class="pr-fiche">${droits.map(dr => `<div class="pr-fiche-ligne">
          <span class="dot-label ${CLASSES_STATUT_PREEMPTION[dr.statut] || 'dl-neutre'}"><span class="dot"></span>${escapeHtml(LIBELLES_STATUT_PREEMPTION[dr.statut] || dr.statut)}</span>
          <span class="pr-fiche-titre">${escapeHtml(dr.titre)}</span>
          <span class="hint">${escapeHtml(dr.statut === 'oui' ? dr.formalite : [dr.motif, dr.formalite].filter(Boolean).join(' — '))}</span>
        </div>`).join('')}
        ${(() => {
          const l = lignePatrimoinePreemption(p.patrimoine);
          return l ? `<div class="pr-fiche-ligne">
          <span class="dot-label ${CLASSES_PATRIMOINE[l.statut]}"><span class="dot"></span>${LIBELLES_PATRIMOINE[l.statut]}</span>
          <span class="pr-fiche-titre">${escapeHtml(l.titre)}${infoBulle(AIDE_PATRIMOINE)}</span>
          <span class="hint">${escapeHtml(l.motif)}${l.conseil ? ' — ' + escapeHtml(l.conseil) : ''}</span>
        </div>` : '';
        })()}${renderTravauxFicheUrbanisme(p)}</div>
      ${questions.length ? `<div class="pr-fiche-questions">${questions.map(q => `<div class="pr-question pr-question-due">
          <span class="pr-question-texte">${escapeHtml(q.libelle)}${q.aide ? infoBulle(q.aide) : ''}</span>
          ${boutonsReponsePreemption(v => `repondrePreemptionFiche('${escapeOnclickArg(d.id)}', '${q.cle}', ${JSON.stringify(v).replace(/"/g, '&quot;')})`, (p.reponses || {})[q.cle], q.valeurs)}
        </div>`).join('')}</div>` : ''}
      ${reste.length ? `<p class="hint">À préciser dans l’outil : ${escapeHtml(reste.join(', '))}.</p>` : ''}
      ${renonciationInutile ? `<ul class="ja-liste">${renderLigneAction({ titre: 'Retirer « Renonciation au droit de préemption » des pièces', sous: 'Le droit de préemption urbain ne s’applique pas à cette vente', bouton: { libelle: 'Retirer', onclick: `retirerPieceStandard('${escapeOnclickArg(d.id)}', 'renonciationPreemption', 'Renonciation au droit de préemption')` } })}</ul>` : ''}
      <wa-button appearance="plain" size="s" class="bouton-discret" onclick="${ouvrir}">${icone('pencil')} Revoir</wa-button></div>`;
  }
