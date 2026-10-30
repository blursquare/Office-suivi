  // ==== Outil « Noms de fichiers du NAS » (étude, 03/10) ====
  // « Scanne le dossier commun, classe les noms de fichiers par forme qui se ressemble et par type de
  // pièce attendu, et moi je te dis si c'est le bon document » — puis « garde les styles de rédaction
  // dans ta base » pour améliorer la détection. Le serveur relève les noms (server/src/nomsFichiersNas.js) ;
  // ici : la FORME d'un nom (ses mots courants gardés, un nombre → « # », les mots propres au dossier —
  // nom du client, rue… — → « … »), les groupes par forme et par pièce, et les décisions appliquées à la
  // reconnaissance (correspondancePieceNom, nomDitOffrePret).
  //
  // Termes ÉLARGIS, pour cet outil SEULEMENT (étude : « il faut élargir le regex que pour cet outil ») :
  // ils ne font que proposer des candidats à l'étude, jamais cocher une pièce. Un terme de 4 lettres ou
  // plus vaut aussi pour les mots qui commencent par lui (« risque » → « risques ») ; plus court, il doit
  // être le mot exact (« cu », « tf », « dia »).
  var TERMES_ELARGIS_PIECES = {
    certificatUrbanisme: ['urbanisme', 'cu', 'cua', 'cub', 'certificat'],
    certificatAlignement: ['alignement', 'voirie'],
    certificatNumerotage: ['numerotage', 'adressage'],
    nonPeril: ['peril', 'insalubrite', 'insalubre', 'securite'],
    reponseAssainissement: ['assainissement', 'spanc', 'egout', 'raccordement'],
    renonciationPreemption: ['preemption', 'dpu', 'dia', 'renonciation', 'aliener'],
    etatDate: ['etat', 'syndic'],
    article20: ['article', 'art'],
    ribCopro: ['rib', 'iban', 'syndic', 'copropriete', 'copro'],
    diagnosticsTechniques: ['diag', 'ddt', 'dpe', 'amiante', 'plomb', 'crep', 'electricite', 'electrique', 'gaz', 'carrez', 'boutin', 'mesurage'],
    erp: ['erp', 'ernmt', 'ermt', 'esris', 'risque', 'pollution', 'georisque', 'sismi', 'radon', 'ial'],
    avisTaxeFonciere: ['tf', 'taxe', 'fonciere', 'foncier', 'impot'],
    titrePropriete: ['titre', 'propriete', 'acquisition', 'origine'],
    planCadastral: ['cadastr', 'situation', 'parcellaire'],
    etudeSol: ['sol', 'sols', 'g1', 'g2', 'geotechni'],
    ramonage: ['ramonage', 'cheminee', 'conduit', 'poele', 'insert'],
    entretienChaudiere: ['chaudiere', 'chauffage'],
    entretienPac: ['pac', 'pompe', 'chaleur'],
    entretienClim: ['clim'],
    vidangeFosse: ['fosse', 'vidange', 'septique', 'microstation'],
    entretienAdoucisseur: ['adoucisseur'],
    debroussaillage: ['debroussaill', 'elagage'],
    travauxRemiseEtat: ['remise'],
    miseEnConformite: ['conformite'],
    miseEnConformiteElectricite: ['conformite', 'electri'],
    miseEnConformiteAssainissement: ['conformite', 'assainis', 'fosse'],
    miseEnConformiteGaz: ['conformite', 'gaz'],
    regularisationUrbanisme: ['regularisation'],
    cuveCiterne: ['cuve', 'citerne', 'degazage', 'fioul', 'mazout'],
    debarras: ['debarras', 'encombrant'],
    attestationConformite: ['conformite', 'daact', 'contestation'],
    consuel: ['consuel'],
    garantieDecennale: ['decennale'],
    dommageOuvrage: ['dommage', 'ouvrage'],
    facturesTravaux: ['facture', 'travaux', 'devis'],
    etatParasitaire: ['parasitaire', 'merule', 'termite', 'xylophage'],
    auditEnergetique: ['audit', 'energetique'],
    securitePiscine: ['piscine'],
    resiliationContrat: ['resiliation'],
    offrePret: ['pret', 'credit', 'financement', 'offre', 'emprunt', 'banque', 'bancaire', 'accord']
  };

  function termeElargiCorrespond(terme, mot) {
    return terme.length >= 4 ? mot.startsWith(terme) : mot === terme;
  }
  var CACHE_MOTS_ELARGIS = new Map();
  function estMotElargi(mot) {
    if (CACHE_MOTS_ELARGIS.has(mot)) return CACHE_MOTS_ELARGIS.get(mot);
    const r = Object.keys(TERMES_ELARGIS_PIECES).some(cle => TERMES_ELARGIS_PIECES[cle].some(t => termeElargiCorrespond(t, mot)));
    CACHE_MOTS_ELARGIS.set(mot, r);
    return r;
  }
  // Pure : les pièces dont un terme élargi figure parmi les mots du nom.
  function clesElargiesPourMots(mots) {
    return Object.keys(TERMES_ELARGIS_PIECES).filter(cle => TERMES_ELARGIS_PIECES[cle].some(t => mots.some(m => termeElargiCorrespond(t, m))));
  }

  // Pure : la forme d'un nom de fichier. `vocabulaire` = mots vus dans plusieurs dossiers (les mots
  // d'usage) ; un mot élargi est toujours gardé ; un mot avec un chiffre devient « # », un mot propre
  // à un dossier « … » ; deux « # » ou deux « … » de suite n'en font qu'un.
  // Un mot de voie ouvre une adresse : lui et les mots qui suivent (« rue de la Gare », « avenue Victor
  // Hugo ») sont mis de côté comme les noms propres — des noms de rue courants se retrouvent dans
  // plusieurs dossiers et couperaient un même groupe en autant de groupes que de rues.
  var MOTS_VOIE_NOM_FICHIER = ['rue', 'avenue', 'av', 'boulevard', 'bd', 'chemin', 'allee', 'impasse', 'place', 'route', 'rte', 'quai', 'square', 'cours', 'lotissement', 'residence', 'hameau', 'lieudit', 'faubourg', 'voie', 'sentier', 'passage'];
  function formeNomFichier(nom, vocabulaire) {
    const sortie = [];
    let adresse = false;
    for (const m of tokensNomFichier(nom)) {
      if (MOTS_VOIE_NOM_FICHIER.includes(m)) adresse = true;
      const p = estMotElargi(m) ? m : adresse ? '…' : (!/\d/.test(m) && vocabulaire && vocabulaire.has(m)) ? m : /\d/.test(m) ? '#' : '…';
      if ((p === '#' || p === '…') && sortie[sortie.length - 1] === p) continue;
      sortie.push(p);
    }
    return sortie.join(' ');
  }

  // Pure : l'expression qui reconnaît une forme sur les mots d'un nom (« # » = un ou plusieurs mots à
  // chiffre, « … » = un ou plusieurs mots quelconques), du premier au dernier mot.
  function regexFormeNom(forme) {
    const parties = String(forme || '').split(' ').filter(Boolean).map(p => p === '#'
      ? '[a-z]*\\d[a-z0-9]*(?: [a-z]*\\d[a-z0-9]*)*'
      : p === '…' ? '[a-z0-9]+(?: [a-z0-9]+)*' : p.replace(/[^a-z0-9]/g, ''));
    return new RegExp('^' + parties.join(' ') + '$');
  }

  // Décisions de l'étude (serveur : GET /api/formes-noms), compilées par pièce.
  var formesNomsDecisions = [];
  var formesNomsCompilees = {};
  function compilerFormesNoms(decisions) {
    formesNomsDecisions = Array.isArray(decisions) ? decisions : [];
    formesNomsCompilees = {};
    for (const d of formesNomsDecisions) {
      if (!d || !d.cle || !d.forme || (d.decision !== 'oui' && d.decision !== 'non')) continue;
      try { (formesNomsCompilees[d.cle] = formesNomsCompilees[d.cle] || []).push({ decision: d.decision, le: Date.parse(d.le) || 0, re: regexFormeNom(d.forme) }); } catch (e) { /* forme illisible : ignorée */ }
    }
  }
  // Pure (sur les décisions compilées) : la décision LA PLUS RÉCENTE parmi les formes qui correspondent au nom l'emporte
  // (étude 05/10 : un « Oui » donné sur une forme ne passait pas devant un ancien « Non » donné sur un nom précis ou une forme
  // voisine) ; à date égale, « non » ; null si aucune forme décidée ne correspond.
  function decisionFormePourNom(cle, nomNormalise) {
    const liste = formesNomsCompilees[cle];
    if (!liste || !liste.length) return null;
    const joint = tokensNomFichier(nomNormalise).join(' ');
    let retenue = null;
    for (const f of liste) {
      if (!f.re.test(joint)) continue;
      if (!retenue || f.le > retenue.le || (f.le === retenue.le && f.decision === 'non')) retenue = f;
    }
    return retenue ? retenue.decision : null;
  }
  async function chargerFormesNoms() {
    try {
      const r = await fetchAvecAuth('/api/formes-noms');
      if (r.ok) compilerFormesNoms((await r.json()).decisions || []);
    } catch (e) { /* sans formes apprises, les motifs seuls */ }
  }

  // Pure : regroupe les noms relevés (`[[indexDossier, nom]]`) par pièce candidate (termes élargis)
  // puis par forme, du groupe le plus fourni au moins fourni. Vocabulaire = mots vus dans au moins 3
  // dossiers (2 en dessous de 30 dossiers) : un nom de client ou de rue, propre à un dossier, devient
  // « … », ce qui rassemble « DIAG ERP 3 rue des Lilas » et « DIAG ERP 12 rue Haute ».
  // Le classement est écrit en générateur : il cède la main tous les TRANCHE_NOMS_NAS noms, pour qu'un commun
  // de plusieurs dizaines de milliers de PDF (4 s de calcul pour 30 000 noms) ne fige pas la fenêtre —
  // `groupesFormesNoms` le déroule d'un trait (tests), `groupesFormesNomsParTranches` avec une pause et une
  // progression entre deux tranches.
  var TRANCHE_NOMS_NAS = 1500;
  async function groupesFormesNomsParTranches(fichiers, progression) {
    const it = etapesGroupesFormesNoms(fichiers);
    for (;;) {
      const r = it.next();
      if (r.done) return r.value;
      if (progression) progression(r.value.fait, r.value.total);
      await new Promise(ok => setTimeout(ok, 0));
    }
  }
  function* etapesGroupesFormesNoms(fichiers) {
    const liste = (fichiers || []).map(f => (Array.isArray(f) ? { d: f[0], nom: f[1] } : f)).filter(f => f && typeof f.nom === 'string');
    const total = liste.length * 2;
    const motsParFichier = new Array(liste.length);
    const dossiersParMot = new Map();
    for (let i = 0; i < liste.length; i++) {
      const mots = motsParFichier[i] = tokensNomFichier(liste[i].nom);
      for (const m of new Set(mots)) {
        let e = dossiersParMot.get(m);
        if (!e) dossiersParMot.set(m, e = new Set());
        e.add(liste[i].d);
      }
      if ((i + 1) % TRANCHE_NOMS_NAS === 0) yield { fait: i + 1, total };
    }
    const nbDossiers = new Set(liste.map(f => f.d)).size;
    const seuil = nbDossiers >= 30 ? 3 : 2;
    const vocabulaire = new Set();
    dossiersParMot.forEach((e, m) => { if (e.size >= seuil) vocabulaire.add(m); });
    const parCle = {};
    for (let i = 0; i < liste.length; i++) {
      const f = liste[i];
      if ((i + 1) % TRANCHE_NOMS_NAS === 0) yield { fait: liste.length + i + 1, total };
      const cles = clesElargiesPourMots(motsParFichier[i]);
      if (!cles.length) continue;
      const forme = formeNomFichier(f.nom, vocabulaire);
      if (!/[a-z]/.test(forme)) continue;
      for (const cle of cles) {
        const m = parCle[cle] || (parCle[cle] = new Map());
        let g = m.get(forme);
        if (!g) m.set(forme, g = { forme, fichiers: 0, dossiers: new Set(), noms: new Map() });
        g.fichiers++;
        g.dossiers.add(f.d);
        g.noms.set(f.nom, (g.noms.get(f.nom) || 0) + 1);
      }
    }
    const groupes = {};
    Object.keys(parCle).forEach(cle => {
      groupes[cle] = [...parCle[cle].values()].map(g => {
        const noms = [...g.noms.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
        return { cle, forme: g.forme, fichiers: g.fichiers, dossiers: g.dossiers.size, nomsDistincts: noms.length, exemples: noms.slice(0, 40).map(n => n[0]) };
      }).sort((a, b) => b.fichiers - a.fichiers || a.forme.localeCompare(b.forme));
    });
    return { groupes, nbDossiers, nbFichiers: liste.length };
  }

  // Pure : ce que les motifs fixes disent aujourd'hui des noms d'un groupe (sans les formes apprises).
  function pieceParCleNomsNas(cle) {
    return [...PIECES_URBANISME, PIECE_NON_PERIL, ...PIECES_COPROPRIETE, ...PIECES_AUTRES, ...PIECES_TERRAIN_AUTRES, ...PIECES_ENGAGEMENTS_AUTO].find(p => p.cle === cle) || null;
  }
  function reconnaissanceGroupeNomsNas(g) {
    const piece = g.cle === 'offrePret' ? null : pieceParCleNomsNas(g.cle);
    const reconnus = g.exemples.filter(nom => {
      const n = normaliserNomPourMotif(nom);
      return g.cle === 'offrePret' ? nomDitOffrePretMotifs(n) : !!correspondancePieceNomMotifs(piece, n);
    }).length;
    return { reconnus, sur: g.exemples.length, etat: !reconnus ? 'aucun' : reconnus === g.exemples.length ? 'tous' : 'partie' };
  }
  function libellePieceNomsNas(cle) {
    if (cle === 'offrePret') return 'Offre de prêt';
    const p = pieceParCleNomsNas(cle);
    return p ? p.label : cle;
  }
  // Pure : forme lisible (« diag erp n° rue … »).
  function libelleFormeNom(forme) {
    return String(forme || '').split(' ').map(p => (p === '#' ? 'n°' : p)).join(' ');
  }

  // Pure : forme EXACTE d'un nom (tous ses mots gardés, seuls les nombres réduits à « # ») — pour une
  // décision sur ce seul nom, sans entraîner ses voisins de groupe (« ERP établissement recevant du
  // public » : non, sans écarter « ERP DUPONT »).
  function formeExacteNom(nom) {
    const sortie = [];
    for (const m of tokensNomFichier(nom)) {
      const p = /\d/.test(m) && !estMotElargi(m) ? '#' : m;
      if (p === '#' && sortie[sortie.length - 1] === '#') continue;
      sortie.push(p);
    }
    return sortie.join(' ');
  }

  // ---- Page de l'outil ----
  var nomsNas = { etat: null, groupes: null, nbDossiers: 0, nbFichiers: 0, cle: '', voir: 15, ouverts: {}, minuterie: null, calcul: false };
  var GROUPES_PAR_PAGE_NOMS_NAS = 15;

  function decisionFormeNomsNas(cle, forme) {
    const d = formesNomsDecisions.find(x => x.cle === cle && x.forme === forme);
    return d ? d.decision : null;
  }

  async function initNomsNas() {
    await chargerFormesNoms();
    await relireEtatNomsNas();
  }

  async function relireEtatNomsNas() {
    clearTimeout(nomsNas.minuterie);
    try {
      const r = await fetchAvecAuth('/api/nas/noms-fichiers');
      if (!r.ok) throw new Error('serveur');
      const etat = await r.json();
      nomsNas.etat = etat;
      if (etat.etat === 'pret' && Array.isArray(etat.fichiers) && (!nomsNas.groupes || nomsNas.fin !== etat.fin)) {
        nomsNas.calcul = true;
        nomsNas.progression = '';
        renderNomsNas();
        await new Promise(ok => setTimeout(ok, 30));
        const res = await groupesFormesNomsParTranches(etat.fichiers, (fait, total) => {
          nomsNas.progression = `${Math.min(100, Math.round(fait * 100 / Math.max(1, total)))} %`;
          const zone = document.getElementById('noms-nas-groupes');
          if (zone) zone.innerHTML = `<p class="jour-vide">Classement des noms par forme… ${nomsNas.progression}</p>`;
        });
        nomsNas.groupes = res.groupes;
        nomsNas.nbDossiers = res.nbDossiers;
        nomsNas.nbFichiers = res.nbFichiers;
        nomsNas.fin = etat.fin;
        nomsNas.calcul = false;
        if (!nomsNas.cle || !nomsNas.groupes[nomsNas.cle]) nomsNas.cle = clesNomsNasOrdonnees()[0] || '';
      }
      if (etat.etat === 'en-cours') nomsNas.minuterie = setTimeout(relireEtatNomsNas, 2000);
    } catch (e) {
      nomsNas.etat = { etat: 'erreur', message: 'Serveur injoignable.' };
    }
    renderNomsNas();
  }

  async function parcourirNomsNas() {
    try {
      const r = await fetchAvecAuth('/api/nas/noms-fichiers/parcourir', { method: 'POST' });
      const corps = await r.json();
      if (!r.ok) throw new Error(corps.erreur || 'erreur');
      nomsNas.groupes = null;
      await relireEtatNomsNas();
    } catch (e) {
      afficherToast('Parcours impossible : ' + e.message, 'OK', null);
    }
  }

  // Pièces dans l'ordre de la checklist, celles qui ont des groupes seulement.
  function clesNomsNasOrdonnees() {
    if (!nomsNas.groupes) return [];
    const ordre = [...new Set([...PIECES_URBANISME, PIECE_NON_PERIL, ...PIECES_COPROPRIETE, ...PIECES_AUTRES, ...PIECES_TERRAIN_AUTRES, ...PIECES_ENGAGEMENTS_AUTO].map(p => p.cle)), 'offrePret'];
    return ordre.filter(c => nomsNas.groupes[c] && nomsNas.groupes[c].length);
  }
  function groupesADeciderNomsNas(cle) {
    return ((nomsNas.groupes && nomsNas.groupes[cle]) || []).filter(g => !decisionFormeNomsNas(cle, g.forme));
  }

  function choisirPieceNomsNas(cle) {
    nomsNas.cle = cle;
    nomsNas.voir = GROUPES_PAR_PAGE_NOMS_NAS;
    nomsNas.ouverts = {};
    renderNomsNas();
  }

  function renderNomsNas() {
    const etatZone = document.getElementById('noms-nas-etat');
    const nav = document.getElementById('noms-nas-pieces');
    const zone = document.getElementById('noms-nas-groupes');
    const bouton = document.getElementById('noms-nas-parcourir');
    if (!etatZone || !nav || !zone) return;
    const e = nomsNas.etat || { etat: 'jamais' };
    if (bouton) {
      bouton.disabled = e.etat === 'en-cours';
      bouton.textContent = e.etat === 'en-cours' ? 'Parcours en cours…' : e.etat === 'pret' ? 'Parcourir à nouveau' : 'Parcourir le commun';
    }
    const apprises = formesNomsDecisions.length;
    etatZone.textContent = e.etat === 'en-cours' ? `Parcours du commun : ${e.dossiersLus} / ${e.dossiersTotal || '…'} dossiers, ${e.nbFichiers} PDF relevés`
      : e.etat === 'pret' ? `${(e.nbFichiers || 0).toLocaleString('fr-FR')} PDF dans ${(e.dossiersTotal || 0).toLocaleString('fr-FR')} dossiers, relevés le ${dateHeureVerification(e.fin)}${e.tronque ? ' (liste tronquée)' : ''} · ${apprises} forme${apprises > 1 ? 's' : ''} décidée${apprises > 1 ? 's' : ''}`
        : e.etat === 'erreur' ? (e.message || 'Le parcours a échoué.')
          : `Le commun n’a pas encore été parcouru depuis le démarrage du serveur · ${apprises} forme${apprises > 1 ? 's' : ''} décidée${apprises > 1 ? 's' : ''}`;
    if (nomsNas.calcul) { nav.innerHTML = ''; zone.innerHTML = '<p class="jour-vide">Classement des noms par forme…</p>'; return; }
    if (!nomsNas.groupes) {
      nav.innerHTML = '';
      zone.innerHTML = e.etat === 'en-cours' ? '<p class="jour-vide">Les noms s’affichent dès la fin du parcours.</p>' : '<p class="jour-vide">Lancez le parcours du commun pour classer les noms de fichiers.</p>';
      return;
    }
    const cles = clesNomsNasOrdonnees();
    nav.innerHTML = cles.map(c => {
      const n = groupesADeciderNomsNas(c).length;
      return `<button type="button" class="rep-nav-lien${nomsNas.cle === c ? ' actif' : ''}${n === 0 ? ' vide' : ''}" aria-pressed="${nomsNas.cle === c}" onclick="choisirPieceNomsNas('${escapeOnclickArg(c)}')"><span class="rep-nav-libelle">${escapeHtml(libellePieceNomsNas(c))}</span><span class="rep-nav-n">${n}</span></button>`;
    }).join('') || '<p class="jour-vide">Aucun nom de pièce repéré.</p>';
    zone.innerHTML = renderGroupesNomsNas(nomsNas.cle);
  }

  function renderGroupesNomsNas(cle) {
    if (!cle) return '';
    const tous = (nomsNas.groupes && nomsNas.groupes[cle]) || [];
    const aDecider = tous.filter(g => !decisionFormeNomsNas(cle, g.forme));
    const decides = tous.filter(g => decisionFormeNomsNas(cle, g.forme));
    const exactes = formesNomsDecisions.filter(d => d.cle === cle && !tous.some(g => g.forme === d.forme));
    const libelle = libellePieceNomsNas(cle);
    const visibles = aDecider.slice(0, nomsNas.voir);
    return `<div class="noms-nas-tete">
        <h2 class="noms-nas-titre">${escapeHtml(libelle)}</h2>
        <span class="hint">${aDecider.length ? `${aDecider.length} forme${aDecider.length > 1 ? 's' : ''} à voir, la plus fréquente d’abord` : 'Toutes les formes ont été vues'}</span>
      </div>
      <div class="noms-nas-liste">${visibles.map(g => renderGroupeNomsNas(g, libelle)).join('')}</div>
      ${aDecider.length > visibles.length ? `<button type="button" class="lien-discret" onclick="nomsNas.voir += GROUPES_PAR_PAGE_NOMS_NAS; renderNomsNas()">Voir ${Math.min(GROUPES_PAR_PAGE_NOMS_NAS, aDecider.length - visibles.length)} formes de plus</button>` : ''}
      ${decides.length || exactes.length ? `<details class="noms-nas-decides"><summary>Déjà décidées (${decides.length + exactes.length})</summary>
        <div class="noms-nas-liste">${decides.map(g => renderGroupeNomsNas(g, libelle)).join('')}${exactes.map(d => renderDecisionSeuleNomsNas(d)).join('')}</div></details>` : ''}`;
  }

  function renderGroupeNomsNas(g, libelle) {
    const decision = decisionFormeNomsNas(g.cle, g.forme);
    const rec = reconnaissanceGroupeNomsNas(g);
    const pastille = rec.etat === 'tous' ? '<span class="dot-label dl-success"><span class="dot"></span>Reconnu aujourd’hui</span>'
      : rec.etat === 'partie' ? `<span class="dot-label dl-pret"><span class="dot"></span>Reconnu en partie (${rec.reconnus}/${rec.sur})</span>`
        : '<span class="dot-label dl-neutre"><span class="dot"></span>Pas reconnu aujourd’hui</span>';
    const cleUi = g.cle + '|' + g.forme;
    const ouvert = !!nomsNas.ouverts[cleUi];
    const arg = (x) => escapeOnclickArg(x);
    const boutons = decision
      ? `<span class="dot-label ${decision === 'oui' ? 'dl-success' : 'dl-urgent'}"><span class="dot"></span>${decision === 'oui' ? 'Oui, validé' : 'Non, écarté'}</span>
         <wa-button appearance="outlined" class="secondary" onclick="deciderFormeNomsNas('${arg(g.cle)}', '${arg(g.forme)}', null)">Annuler</wa-button>`
      : `<wa-button appearance="outlined" class="secondary" onclick="deciderFormeNomsNas('${arg(g.cle)}', '${arg(g.forme)}', 'oui')">Oui</wa-button>
         <wa-button appearance="outlined" class="secondary" onclick="deciderFormeNomsNas('${arg(g.cle)}', '${arg(g.forme)}', 'non')">Non</wa-button>`;
    const noms = ouvert ? `<ul class="noms-nas-noms">${g.exemples.map(n => {
        const forme = formeExacteNom(n);
        const d = decisionFormeNomsNas(g.cle, forme);
        return `<li><code>${escapeHtml(n)}</code>${d ? `<span class="dot-label ${d === 'oui' ? 'dl-success' : 'dl-urgent'}"><span class="dot"></span>${d === 'oui' ? 'oui' : 'non'}</span><button type="button" class="lien-discret" onclick="deciderFormeNomsNas('${arg(g.cle)}', '${arg(forme)}', null)">annuler</button>`
          : `<button type="button" class="lien-discret" onclick="deciderFormeNomsNas('${arg(g.cle)}', '${arg(forme)}', 'oui', '${arg(n)}')">oui</button><button type="button" class="lien-discret" onclick="deciderFormeNomsNas('${arg(g.cle)}', '${arg(forme)}', 'non', '${arg(n)}')">non</button>`}</li>`;
      }).join('')}</ul>` : '';
    return `<div class="noms-nas-groupe${decision ? ' decide' : ''}" data-forme="${escapeAttr(g.forme)}">
        <div class="noms-nas-groupe-texte">
          <div class="noms-nas-exemple"><code>${escapeHtml(g.exemples[0] || '')}</code>${g.nomsDistincts > 1 ? ` <span class="hint">et ${g.nomsDistincts - 1} autre${g.nomsDistincts > 2 ? 's' : ''} nom${g.nomsDistincts > 2 ? 's' : ''} de même forme</span>` : ''}</div>
          <div class="hint noms-nas-meta">${pastille} trouvé ${g.fichiers} fois dans ${g.dossiers} dossier${g.dossiers > 1 ? 's' : ''} · forme <code>${escapeHtml(libelleFormeNom(g.forme))}</code>
            ${g.nomsDistincts > 1 ? `<button type="button" class="lien-discret" onclick="basculerNomsGroupeNomsNas('${arg(cleUi)}')">${ouvert ? 'Masquer les noms' : 'Voir les noms'}</button>` : ''}</div>
          ${noms}
        </div>
        <div class="noms-nas-actions" aria-label="Est-ce bien « ${escapeAttr(libelle)} » ?">${boutons}</div>
      </div>`;
  }

  // Une décision prise sur un nom précis (forme exacte), qui ne correspond à aucun groupe affiché.
  function renderDecisionSeuleNomsNas(d) {
    return `<div class="noms-nas-groupe decide">
        <div class="noms-nas-groupe-texte">
          <div class="noms-nas-exemple"><code>${escapeHtml(d.exemple || libelleFormeNom(d.forme))}</code></div>
          <div class="hint noms-nas-meta">forme <code>${escapeHtml(libelleFormeNom(d.forme))}</code> · décidée le ${dateHeureVerification(d.le)}</div>
        </div>
        <div class="noms-nas-actions"><span class="dot-label ${d.decision === 'oui' ? 'dl-success' : 'dl-urgent'}"><span class="dot"></span>${d.decision === 'oui' ? 'Oui, validé' : 'Non, écarté'}</span>
          <wa-button appearance="outlined" class="secondary" onclick="deciderFormeNomsNas('${escapeOnclickArg(d.cle)}', '${escapeOnclickArg(d.forme)}', null)">Annuler</wa-button></div>
      </div>`;
  }

  function basculerNomsGroupeNomsNas(cleUi) {
    nomsNas.ouverts[cleUi] = !nomsNas.ouverts[cleUi];
    renderNomsNas();
  }

  function deciderFormeNomsNas(cle, forme, decision, nomPrecis) {
    const g = ((nomsNas.groupes && nomsNas.groupes[cle]) || []).find(x => x.forme === forme);
    const envoyer = async () => {
      try {
        const r = await fetchAvecAuth('/api/formes-noms', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cle, forme, decision, exemple: nomPrecis || (g && g.exemples[0]) || '', fichiers: g ? g.fichiers : 1, dossiers: g ? g.dossiers : 1 })
        });
        const corps = await r.json();
        if (!r.ok) throw new Error(corps.erreur || 'erreur');
        compilerFormesNoms(corps.decisions || []);
        renderNomsNas();
      } catch (e) {
        afficherToast('Décision non enregistrée : ' + e.message, 'OK', null);
      }
    };
    // Écarter une forme que les motifs reconnaissent aujourd'hui : ces fichiers ne seront plus cochés.
    if (decision === 'non' && g && reconnaissanceGroupeNomsNas(g).reconnus) {
      demanderConfirmation(`Ces noms sont reconnus aujourd’hui comme « ${libellePieceNomsNas(cle)} ». Les écarter de cette pièce ?${g.nomsDistincts > 1 ? ' Pour un seul nom, utilisez plutôt « Voir les noms ».' : ''}`, envoyer, { bouton: 'Écarter', ton: 'danger' });
      return;
    }
    envoyer();
  }

  // Ordre d'affichage = ordre des listes fournies par l'étude : urbanisme (commun aux trois types),
  // puis les pièces propres à la copropriété si applicable, puis le reste, puis les pièces
  // auto-détectées depuis un engagement du compromis (voir PIECES_ENGAGEMENTS_AUTO ci-dessus),
  // puis enfin les pièces personnalisées ajoutées à la main.
  // `d` (optionnel, absent avant l'enregistrement du dossier — voir majApercuPieces) permet de
  // personnaliser la checklist standard pour CE dossier précis, demandé par l'étude : `d.piecesRetirees`
  // (tableau de clés) masque des pièces standard OU auto-détectées non pertinentes pour ce dossier ;
  // `d.piecesPersonnalisees` (tableau de {cle, label}) ajoute des pièces propres à ce dossier, sans
  // toucher aux listes PIECES_* partagées par tous les autres dossiers du même type de vente ;
  // Les pièces détectées depuis les documents du compromis viennent de DEUX sources réunies :
  // `d.piecesEngagementsDetectees` (calculé une fois à la création, voir ajouterDossier) et, en
  // plus, un recalcul à l'affichage depuis `d.analyseJuridique.documents`, lui bien conservé sur
  // le dossier. Ce second chemin rend la fonctionnalité RÉTROACTIVE, demandé explicitement par
  // l'étude : un dossier créé avant l'élargissement de `cleChecklist` à tous les documents (ou
  // avant l'existence même de ce champ) voit malgré tout ses documents apparaître dans la
  // checklist, sans avoir à le recréer.
  function clesChecklistDepuisDocuments(documents) {
    const cles = [];
    (documents || []).forEach(doc => {
      // Un document déjà porteur de sa clé (dossier récent) ; sinon on la retrouve par son
      // libellé, qui est la seule chose stockée sur les dossiers plus anciens.
      const cle = (doc && typeof doc === 'object' && doc.cleChecklist)
        ? doc.cleChecklist
        : (DOCUMENTS_VENDEUR_CONNUS.find(x => x.label === (typeof doc === 'string' ? doc : doc && doc.label)) || {}).cleChecklist;
      if (cle && !cles.includes(cle)) cles.push(cle);
    });
    return cles;
  }

  // La checklist vient du code commun (commun/pieces.js) ; le poste y ajoute les pièces d'engagement retrouvées dans les
  // documents de l'analyse d'un dossier ancien (clesChecklistDepuisDocuments, connu du poste seulement).
  function checklistPieces(typeVente, d) {
    return checklistPiecesBase(typeVente, d, d ? clesChecklistDepuisDocuments(d.analyseJuridique && d.analyseJuridique.documents) : []);
  }
  // "Offre de crédit (immobilier)" est une formulation bancaire tout aussi courante que "offre de
  // prêt" pour désigner le même document — à ne pas retirer sans revérifier ce cas.
  // Bug corrigé : ce motif servait jusqu'ici à reconnaître l'offre de prêt dans le CONTENU du PDF
  // (verifierDossierLocal() ouvrait et lisait chaque fichier). Signalé par l'étude : trop d'erreurs
  // en usage réel (polices embarquées mal encodées produisant un texte extrait illisible, ou à
  // l'inverse un autre document mentionnant l'offre en passant sans être l'offre elle-même) — même
  // classe de problème déjà résolue pour la checklist de pièces en abandonnant la lecture de
  // contenu au profit du seul nom de fichier (voir CLAUDE.md, "TOUTES les pièces de la checklist
  // sont désormais détectées uniquement par le NOM DU FICHIER"). Ce motif sert donc désormais
  // exclusivement à tester le NOM DU FICHIER (normalisé — voir normaliserNomPourMotif), plus jamais
  // son contenu : \s+ devient \s* pour couvrir aussi un nom concaténé sans séparateur
  // ("OffreDePret.pdf" — la casse n'a pas d'importance, le motif est insensible à la casse), en plus
  // des noms espacés ("Offre de prêt.pdf") ou à séparateurs underscore/tiret (déjà normalisés en
  // espaces avant ce test). "Accord de prêt" ajouté, autre intitulé bancaire réel pour ce document.
  // "Contrat de crédit"/"contrat de prêt" ajoutés ensuite, sur demande de l'étude : certains
  // établissements nomment le document remis à l'emprunteur "contrat" plutôt que "offre", une fois
  // signé/accepté (couvre aussi "Contrat de crédit immobilier.pdf" grâce au \s* déjà en place).
  // var (pas const) : exposée globalement comme les fonctions du fichier, pour rester testable
  // depuis tests/helpers/load-app.js sans dupliquer le motif dans les tests.
  // « contrat de prêt », « contrat de crédit » et « offre de contrat de prêt » : termes rappelés
  // par l'étude le 29/09 (les deux premiers suffisaient déjà à reconnaître le troisième).
  var OFFRE_PRET_RE = /offre\s*de\s*contrat\s*de\s*(?:pr[êe]t|cr[ée]dit)|offre\s*de\s*pr[êe]t|offre\s*pr[ée]alable\s*de\s*cr[ée]dit|offre\s*de\s*cr[ée]dit|offre\s*de\s*financement|accord\s*de\s*pr[êe]t|contrat\s*de\s*cr[ée]dit|contrat\s*de\s*pr[êe]t/i;
