  // Clients et biens (étude 16/10 : « des fiches clients et biens à partir des données d'Authentic … si un client se retrouve dans un autre
  // dossier ou un bien dans un autre dossier, on pourra les retrouver facilement » ; choix de l'étude : page « Clients et biens », Authentic
  // fait foi, homonymes proposés puis confirmés). La base est calculée par le serveur (server/src/clientsBiens.js) depuis les dossiers ;
  // ce poste n'écrit que les choix de l'étude (même personne / distinctes, corrections à la main).

  let cbRecherche = '';
  let cbResultats = null;
  let cbMinuterie = null;
  // Nombre de lignes demandées par colonne (80, puis + 80 par « Afficher plus »), remis à 80 à chaque recherche.
  let cbLimites = { personnes: 80, biens: 80 };
  let cbOuvert = null;              // { type: 'personne' | 'bien', id }
  let cbEdition = '';               // champ en cours de correction
  const cbParDossier = new Map();   // dossierId → { t, fiches, enCours }

  var LIBELLES_CHAMPS_CB = { civilite: 'Civilité', nomFamille: 'Nom', prenom: 'Prénom(s)', nomUsage: 'Nom d’usage', dateNaissance: 'Naissance',
    lieuNaissance: 'Lieu de naissance', nationalite: 'Nationalité', profession: 'Profession', domicile: 'Domicile', emails: 'Emails', telephones: 'Téléphones' };

  // Pure : la valeur d'un champ telle que la fiche la montre.
  function valeurAfficheeCb(champ, v) {
    if (Array.isArray(v)) return v.join(', ');
    if (champ === 'dateNaissance' && /^\d{4}-\d{2}-\d{2}$/.test(v || '')) return v.split('-').reverse().join('/');
    return v || '';
  }

  // Pure : tout ce que la fiche client d'Authentic porte en plus de l'identité de base (étude 16/10 : « reprends tout le contenu de la fiche
  // Authentic ») — capacité, mandat de protection, activité, adresse (imposition, correspondance), coordonnées principales et secondaires
  // avec leurs commentaires, mariage (date, lieu, uniques noces, divorce, séparation de corps), contrat et ancien contrat, situation dans
  // l'acte, historique des relations. Lu sur la page de la personne (volet du conjoint déjà retiré). null si rien de plus n'est renseigné.
  function complementFicheClientAuthentic(capture) {
    const champs = ((capture && capture.champs) || []).filter(Boolean);
    const net = c => libelleNetAuthentic(c.libelle).replace(/[’‘]/g, "'");
    const val = c => String(c && c.valeur != null ? c.valeur : '').replace(/\s+/g, ' ').trim();
    const brut = re => val(champs.find(c => re.test(String(c.libelle || ''))));
    const lib = l => val(champs.find(c => net(c) === l));
    const oui = v => /^(oui|true|on)$/i.test(v);
    // Champ qui suit un autre dans la page (« Pays », « CP, Ville » du mariage ; « CP, Ville » du notaire du contrat).
    const apres = (test, l) => {
      const i = champs.findIndex(test);
      if (i < 0) return '';
      // Dans les trois champs qui suivent seulement : un champ absent n'est jamais pris dans la rubrique suivante.
      return val(champs.slice(i + 1, i + 4).find(c => net(c) === l));
    };
    const r = {
      clientEtude: oui(brut(/:etude_input$/)),
      autresPrenoms: lib('autre(s) prenom(s)'),
      alias: lib("alias pour l'acte"),
      capacite: brut(/:capacite:selectonemenu_input/i),
      mandatProtection: brut(/:mandat:selectonemenu_input/i),
      secteurActivite: brut(/:secteurActivite:selectonemenu_input/i),
      siren: lib('siren (autoentrepreneur)'),
      adresseImposition: oui(lib("adresse d'imposition")),
      adresseCorrespondance: oui(lib('adresse de correspondance')),
      adresseSuite: lib('adresse suite'),
      paysDomicile: apres(c => net(c) === 'cp - ville', 'pays'),
      coordonnees: [],
      mariage: null,
      historique: []
    };
    // Coordonnées : chaque téléphone ou email, son bloc (principales / secondaires) et le commentaire qui le suit.
    let bloc = 'principales';
    let dernier = null;
    champs.forEach(c => {
      const b = String(c.libelle || '');
      if (/coordonneeSecondaire/i.test(b)) bloc = 'secondaires';
      else if (/coordonneePrincipale/i.test(b)) bloc = 'principales';
      const m = /:(Portable|Telephone|Fax):inputTelephone/i.exec(b);
      if (m || net(c) === 'email') {
        dernier = { bloc, type: m ? (/portable/i.test(m[1]) ? 'Portable' : /fax/i.test(m[1]) ? 'Fax' : 'Téléphone') : 'Email', valeur: val(c), commentaire: '' };
        if (dernier.valeur) r.coordonnees.push(dernier); else dernier = null;
      } else if (net(c) === 'commentaire' && dernier && val(c)) dernier.commentaire = val(c);
      else if (net(c) === 'commentaire general' && val(c)) r.coordonnees.push({ bloc, type: 'Commentaire', valeur: val(c), commentaire: '' });
    });
    const estDateMariage = c => net(c) === 'date de mariage';
    const estAncienContrat = c => net(c) === "date de l'ancien contrat";
    const mariage = {
      date: dateIsoDepuisFr(lib('date de mariage')),
      pays: apres(estDateMariage, 'pays'),
      lieu: apres(estDateMariage, 'cp, ville'),
      uniquesNoces: brut(/somInfoMariageUniquesNocesId/i),
      divorceEnCours: brut(/somInfoDivorceEnCoursId/i),
      separeDeCorps: oui(brut(/separeDeCorps_input/i)),
      contrat: brut(/somContratTypeId/i),
      regime: brut(/somContratRegimeId/i),
      ancienContrat: brut(/somAncienContratTypeId/i),
      ancienRegime: brut(/somAncienContratRegimeId/i),
      dateAncienContrat: dateIsoDepuisFr(lib("date de l'ancien contrat")),
      notaireAncienContrat: apres(estAncienContrat, 'notaire'),
      lieuAncienContrat: apres(c => estAncienContrat(c) || net(c) === 'notaire', 'cp, ville'),
      situationActe: lib("situation dans l'acte")
    };
    // Les listes d'Authentic valent « Non » par défaut : la rubrique n'existe que si quelque chose de réel est dit.
    const reel = ['date', 'lieu', 'contrat', 'regime', 'ancienContrat', 'ancienRegime', 'dateAncienContrat', 'notaireAncienContrat', 'situationActe'].some(k => mariage[k])
      || mariage.separeDeCorps || /^oui$/i.test(mariage.uniquesNoces) || /^oui$/i.test(mariage.divorceEnCours);
    if (reel) r.mariage = mariage;
    // Historique des relations : toutes les lignes du tableau « Situation | Date | Conjoint | … ».
    ((capture && capture.tableaux) || []).forEach(t => {
      const entete = (t.entete || []).map(libelleNetAuthentic);
      const iSit = entete.indexOf('situation');
      if (iSit < 0) return;
      const iDate = entete.indexOf('date'), iConj = entete.indexOf('conjoint');
      (t.lignes || []).forEach(l => {
        const ligne = { situation: String(l[iSit] || '').trim(), date: iDate >= 0 ? dateIsoDepuisFr(l[iDate]) : '', conjoint: iConj >= 0 ? String(l[iConj] || '').trim() : '',
          // Colonnes titrées seulement : la colonne sans titre porte les icônes d'action du tableau (« edit », « delete »…).
          detail: l.filter((x, i) => i !== iSit && i !== iDate && i !== iConj && entete[i]).map(x => String(x || '').trim()).filter(Boolean).join(' · ') };
        if (ligne.situation || ligne.conjoint) r.historique.push(ligne);
      });
    });
    r.coordonnees = r.coordonnees.slice(0, 12);
    r.historique = r.historique.slice(0, 10);
    const utile = Object.entries(r).some(([k, v]) => (Array.isArray(v) ? v.length : !!v) && k !== 'clientEtude');
    return utile || r.clientEtude ? r : null;
  }

  // Pure (étude 18/10 : « récupérer toutes les informations sur le régime matrimonial, date, lieu du mariage depuis Authentic ») : la ligne
  // d'état civil d'une fiche client gardée — « Marié(e) le 12 juin 2010 à BLOIS — Communauté réduite aux acquêts — conjoint : … » ; '' sans rien.
  function etatCivilMariageAuthentic(fiche) {
    if (!fiche) return '';
    const sm = fiche.situationMatrimoniale || {};
    const m = (fiche.complement && fiche.complement.mariage) || {};
    const date = m.date || sm.dateMariage || sm.date || '';
    const situation = sm.situation || (date ? 'Marié(e)' : '');
    const lieu = m.lieu ? `à ${m.lieu}${m.pays && !/^france$/i.test(m.pays) ? ` (${m.pays})` : ''}` : '';
    const contrat = m.contrat || sm.contrat || '';
    const ancien = m.ancienRegime || m.ancienContrat ? `ancien régime : ${m.ancienRegime || m.ancienContrat}${m.dateAncienContrat ? ` du ${formatDateFr(m.dateAncienContrat)}` : ''}`
      + `${m.notaireAncienContrat ? `, ${m.notaireAncienContrat}${m.lieuAncienContrat ? ` (${m.lieuAncienContrat})` : ''}` : ''}` : '';
    return [
      [situation, date ? `le ${formatDateFr(date)}` : '', lieu].filter(Boolean).join(' '),
      m.regime || sm.regime || '',
      contrat ? (/^sans/i.test(contrat) ? 'sans contrat de mariage' : `contrat : ${contrat}`) : '',
      ancien,
      /^oui$/i.test(m.divorceEnCours || '') ? 'divorce en cours' : '',
      m.separeDeCorps ? 'séparé(e) de corps' : '',
      sm.conjoint ? `conjoint : ${sm.conjoint}` : ''
    ].filter(Boolean).join(' — ');
  }

  // Pure : la zone lue dans la colonne « Zone » d'Authentic, ou '' quand ce n'est pas une zone (22/10, fiche CH 562… « zone Agricole (PLU)Bois et
  // forêt dans une commune sans document d… » : la liste déroulante sans choix rendait le texte de TOUTES ses options, collées). Une vraie zone
  // est courte et sans mots collés (« U », « Agricole (PLU) ») ; la vraie zone vient du Géoportail de l'urbanisme, jamais de ce champ.
  function zoneParcelleAuthentic(texte) {
    const t = String(texte || '').replace(/\s+/g, ' ').trim();
    if (!t || t.length > 60 || /[a-zà-ÿ)][A-ZÀ-Ý]/.test(t)) return '';
    return t;
  }

  // Pure : une parcelle d'un bien, « EV 10 · 6 a 6 ca · Sol ».
  function libelleParcelleCb(p) {
    return [[p.prefixe, p.section, p.numero].filter(Boolean).join(' '), typeof p.surface === 'number' ? formaterContenance(p.surface) : '', p.nature, p.lieuDit, zoneParcelleAuthentic(p.zone) ? `zone ${zoneParcelleAuthentic(p.zone)}` : ''].filter(Boolean).join(' · ');
  }

  function initClientsBiens() {
    const champ = document.getElementById('cb-recherche');
    if (champ && champ.value !== cbRecherche) champ.value = cbRecherche;
    chercherClientsBiens(cbRecherche);
  }

  function saisirRechercheClientsBiens(v) {
    cbRecherche = String(v || '');
    cbLimites = { personnes: 80, biens: 80 };
    clearTimeout(cbMinuterie);
    cbMinuterie = setTimeout(() => chercherClientsBiens(cbRecherche), 200);
  }

  async function chercherClientsBiens(q) {
    try {
      const r = await fetchAvecAuth('/api/clients-biens?q=' + encodeURIComponent(q || '') + '&np=' + cbLimites.personnes + '&nb=' + cbLimites.biens);
      cbResultats = r.ok ? await r.json() : { erreur: 'Lecture impossible.' };
    } catch (_) { cbResultats = { erreur: 'Serveur injoignable.' }; }
    renderPageClientsBiens();
  }

  function renderPageClientsBiens() {
    const zone = document.getElementById('cb-resultats');
    if (!zone) return;
    const r = cbResultats;
    if (!r) { zone.innerHTML = '<p class="hint">Chargement…</p>'; return; }
    if (r.erreur) { zone.innerHTML = `<p class="hint">${escapeHtml(r.erreur)}</p>`; return; }
    const personnes = (r.personnes || []).map(p => `<button type="button" class="cb-ligne" onclick="ouvrirFicheClientBien('personne', '${escapeOnclickArg(p.id)}')">
        <span class="cb-ligne-titre">${p.civilite ? escapeHtml(p.civilite === 'Mme' ? 'Madame' : 'Monsieur') + ' ' : ''}${escapeHtml(p.nom)}${p.decede ? ' <span class="hint">· décédé(e)</span>' : ''}</span>
        <span class="cb-ligne-detail">${[p.naissance ? 'né(e) le ' + valeurAfficheeCb('dateNaissance', p.naissance) : '', p.commune].filter(Boolean).map(escapeHtml).join(' · ')}</span>
        <span class="cb-ligne-badges">${p.dossiers > 1 ? `<span class="cb-badge">${p.dossiers} dossiers</span>` : ''}${p.peutEtre ? '<span class="cb-badge cb-badge-question">Homonyme à confirmer</span>' : ''}${p.aRevoir ? '<span class="cb-badge cb-badge-question">Authentic a changé</span>' : ''}</span>
      </button>`).join('');
    const biens = (r.biens || []).map(b => `<button type="button" class="cb-ligne" onclick="ouvrirFicheClientBien('bien', '${escapeOnclickArg(b.id)}')">
        <span class="cb-ligne-titre">${escapeHtml(b.adresse ? normaliserAdresse(b.adresse) : b.commune || 'Bien')}</span>
        <span class="cb-ligne-detail">${escapeHtml(b.parcelles.join(', '))}</span>
        <span class="cb-ligne-badges">${b.dossiers > 1 ? `<span class="cb-badge">${b.dossiers} dossiers</span>` : ''}</span>
      </button>`).join('');
    const plus = (n, total, cle) => total > n ? `<div class="cb-plus"><span class="hint">${n} sur ${total}</span>${n < 1000 ? `<wa-button appearance="outlined" size="s" type="button" onclick="afficherPlusClientsBiens('${cle}')">Afficher ${Math.min(80, total - n)} de plus</wa-button>` : '<span class="hint">précisez la recherche</span>'}</div>` : '';
    zone.innerHTML = `<div class="cb-colonnes">
      <section class="cb-colonne" id="cb-colonne-personnes"><h2 class="w-titre">Clients <span class="hint">${r.total ? r.total.personnes : 0}</span></h2>${personnes || '<p class="hint">Aucun client.</p>'}${plus((r.personnes || []).length, r.total ? r.total.personnes : 0, 'personnes')}</section>
      <section class="cb-colonne" id="cb-colonne-biens"><h2 class="w-titre">Biens <span class="hint">${r.total ? r.total.biens : 0}</span></h2>${biens || '<p class="hint">Aucun bien.</p>'}${plus((r.biens || []).length, r.total ? r.total.biens : 0, 'biens')}</section>
    </div>`;
  }

  // Centaines de fiches (étude 18/10) : chaque colonne défile seule, 80 lignes de plus à la demande, défilement gardé.
  async function afficherPlusClientsBiens(cle) {
    if (cle !== 'personnes' && cle !== 'biens') return;
    const colonne = document.getElementById('cb-colonne-' + cle);
    const haut = colonne ? colonne.scrollTop : 0;
    cbLimites[cle] = Math.min(1000, cbLimites[cle] + 80);
    await chercherClientsBiens(cbRecherche);
    const apres = document.getElementById('cb-colonne-' + cle);
    if (apres) apres.scrollTop = haut;
  }

  // ---------- Fenêtre d'une fiche ----------

  async function ouvrirFicheClientBien(type, id) {
    cbOuvert = { type: type === 'bien' ? 'bien' : 'personne', id: String(id || ''), fiche: null };
    cbEdition = '';
    const ov = document.getElementById('cb-overlay');
    if (!ov) return;
    ov.style.display = 'flex';
    document.getElementById('cb-contenu').innerHTML = '<p class="hint">Chargement…</p>';
    await rechargerFicheClientBien();
  }

  async function rechargerFicheClientBien() {
    if (!cbOuvert) return;
    try {
      const r = await fetchAvecAuth(`/api/clients-biens/${cbOuvert.type}/${encodeURIComponent(cbOuvert.id)}`);
      const j = await r.json();
      if (!r.ok) { document.getElementById('cb-contenu').innerHTML = `<p class="hint">${escapeHtml(j.erreur || 'Fiche introuvable.')}</p>`; return; }
      cbOuvert.fiche = j.personne || j.bien;
    } catch (_) { document.getElementById('cb-contenu').innerHTML = '<p class="hint">Serveur injoignable.</p>'; return; }
    renderFicheClientBien();
  }

  function fermerFicheClientBien() {
    cbOuvert = null;
    const ov = document.getElementById('cb-overlay');
    if (ov) ov.style.display = 'none';
  }

  function renderDossiersLiesCb(dossiersLies) {
    return `<div class="cb-dossiers">${(dossiersLies || []).map(x => `<button type="button" class="cb-dossier" onclick="ouvrirDossierDepuisFicheCb('${escapeOnclickArg(x.id)}')">
      <span>${escapeHtml(x.libelle)}</span>${x.roleLibelle ? `<span class="hint">${escapeHtml(x.roleLibelle)}</span>` : ''}${x.archive ? '<span class="hint">archivé</span>' : ''}</button>`).join('')}</div>`;
  }

  // Pure : les rubriques de la fiche client d'Authentic au-delà de l'identité de base, comme dans Authentic (une ligne par renseignement
  // rempli ; un renseignement vide n'est pas montré). → HTML.
  function renderComplementFicheCb(f) {
    const x = f.complement || {};
    const date = v => valeurAfficheeCb('dateNaissance', v || '');
    const dl = lignes => {
      const h = lignes.filter(([, v]) => v).map(([l, v]) => `<dt>${escapeHtml(l)}</dt><dd>${escapeHtml(v)}</dd>`).join('');
      return h ? `<dl class="cb-champs">${h}</dl>` : '';
    };
    const rubrique = (titre, corps) => corps ? `<h3 class="cb-sous-titre">${escapeHtml(titre)}</h3>${corps}` : '';
    const identite = dl([
      ['Autre(s) prénom(s)', f.autresPrenoms || x.autresPrenoms], ['Alias pour l’acte', x.alias], ['Pays de naissance', f.paysNaissance],
      ['Capacité', x.capacite], ['Mandat de protection future', x.mandatProtection], ['Secteur d’activité', x.secteurActivite],
      ['SIREN', x.siren], ['Client de l’étude', x.clientEtude ? 'Oui' : '']
    ]);
    const adresse = dl([
      ['Adresse suite', x.adresseSuite], ['Pays', x.paysDomicile],
      ['Usage', [x.adresseImposition ? 'adresse d’imposition' : '', x.adresseCorrespondance ? 'adresse de correspondance' : ''].filter(Boolean).join(', ')]
    ]);
    const coord = (x.coordonnees || []).length ? ['principales', 'secondaires'].map(b => {
      const l = x.coordonnees.filter(c => c.bloc === b);
      return l.length ? `<div class="cb-bloc"><div class="hint">Coordonnées ${b}</div><dl class="cb-champs">${l.map(c => `<dt>${escapeHtml(c.type)}</dt><dd>${c.type === 'Email' || c.type === 'Commentaire' ? escapeHtml(c.valeur) : `${escapeHtml(c.valeur)} ${liensAppelTelephone(c.valeur)}`}${c.commentaire ? ` <span class="hint">· ${escapeHtml(c.commentaire)}</span>` : ''}</dd>`).join('')}</dl></div>` : '';
    }).join('') : '';
    const m = x.mariage || {};
    const mariage = dl([
      ['Date de mariage', date(m.date)], ['Lieu', [m.lieu, m.pays].filter(Boolean).join(', ')], ['Mariage en uniques noces', m.uniquesNoces],
      ['Divorce en cours', m.divorceEnCours], ['Séparé de corps', m.separeDeCorps ? 'Oui' : ''], ['Contrat de mariage', m.contrat], ['Régime', m.regime],
      ['Ancien contrat', m.ancienContrat], ['Ancien régime', m.ancienRegime], ['Date de l’ancien contrat', date(m.dateAncienContrat)],
      ['Notaire', [m.notaireAncienContrat, m.lieuAncienContrat].filter(Boolean).join(', ')], ['Situation dans l’acte', m.situationActe]
    ]);
    const histo = (x.historique || []).length ? `<table class="cb-historique"><thead><tr><th>Situation</th><th>Date</th><th>Conjoint</th></tr></thead><tbody>${x.historique.map(h => `<tr><td>${escapeHtml(h.situation)}</td><td>${escapeHtml(date(h.date))}</td><td>${escapeHtml(h.conjoint)}${h.detail ? `<div class="hint">${escapeHtml(h.detail)}</div>` : ''}</td></tr>`).join('')}</tbody></table>` : '';
    return rubrique('Identité', identite) + rubrique('Adresse', adresse) + rubrique('Coordonnées', coord) + rubrique('Situation matrimoniale', mariage) + rubrique('Historique des relations', histo);
  }

  function renderFicheClientBien() {
    const zone = document.getElementById('cb-contenu');
    if (!zone || !cbOuvert || !cbOuvert.fiche) return;
    const f = cbOuvert.fiche;
    if (cbOuvert.type === 'bien') {
      zone.innerHTML = `<h2 class="cb-titre">${escapeHtml(f.adresse ? normaliserAdresse(f.adresse) : f.commune || 'Bien')}</h2>
        <dl class="cb-champs">
          ${f.type ? `<dt>Type</dt><dd>${escapeHtml(f.type)}</dd>` : ''}
          <dt>Parcelles</dt><dd>${f.parcelles.length ? f.parcelles.map(p => `<div>${escapeHtml(libelleParcelleCb(p))}</div>`).join('') : '—'}${typeof f.surfaceTotale === 'number' && f.parcelles.length > 1 ? `<div class="hint">Total · ${escapeHtml(formaterContenance(f.surfaceTotale))}</div>` : ''}</dd>
          ${f.lots && f.lots.length ? `<dt>Lots</dt><dd>${f.lots.map(l => `<div>${escapeHtml(libelleLotCopropriete(l, null))}</div>`).join('')}</dd>` : ''}
          ${f.description ? `<dt>Désignation</dt><dd>${escapeHtml(f.description)}</dd>` : ''}
        </dl>
        ${(f.details || []).length ? `<h3 class="cb-sous-titre">Dans Authentic</h3><dl class="cb-champs">${f.details.map(x => `<dt>${escapeHtml(x.libelle)}</dt><dd>${escapeHtml(x.valeur)}</dd>`).join('')}</dl>` : ''}
        <h3 class="cb-sous-titre">Dossiers</h3>${renderDossiersLiesCb(f.dossiers)}`;
      return;
    }
    const c = f.champs || {};
    const titre = `${c.civilite === 'Mme' ? 'Madame ' : c.civilite === 'M' ? 'Monsieur ' : ''}${f.nomComplet}`;
    const ligneChamp = (k) => {
      const v = valeurAfficheeCb(k, c[k]);
      const corrige = JSON.stringify(c[k]) !== JSON.stringify((f.authentic || {})[k]);
      if (cbEdition === k) {
        return `<dt>${LIBELLES_CHAMPS_CB[k]}</dt><dd class="cb-edition"><input id="cb-champ-saisie" type="${k === 'dateNaissance' ? 'date' : 'text'}" value="${escapeAttr(Array.isArray(c[k]) ? c[k].join(', ') : c[k] || '')}" onkeydown="if (event.key === 'Enter') enregistrerCorrectionCb('${escapeOnclickArg(k)}'); if (event.key === 'Escape') annulerCorrectionCb()">
          <wa-button appearance="plain" size="s" class="bouton-icone" onclick="enregistrerCorrectionCb('${escapeOnclickArg(k)}')" title="Enregistrer">${icone('check')}</wa-button>
          <wa-button appearance="plain" size="s" class="bouton-icone" onclick="annulerCorrectionCb()" title="Annuler">${icone('x')}</wa-button></dd>`;
      }
      if (!v && !['profession', 'domicile', 'dateNaissance'].includes(k)) return '';
      return `<dt>${LIBELLES_CHAMPS_CB[k]}</dt><dd>${v ? escapeHtml(v) : '<span class="hint">—</span>'}${corrige ? ' <span class="hint" title="Corrigé dans CLAIRE (Authentic dit autrement)">· corrigé</span>' : ''}
        <wa-button appearance="plain" size="s" class="bouton-icone cb-crayon" onclick="corrigerChampCb('${escapeOnclickArg(k)}')" title="Corriger">${icone('pencil')}</wa-button></dd>`;
    };
    const situation = f.conjoint ? `<dt>Situation</dt><dd>${escapeHtml(f.conjoint.situation || '')} ${f.conjoint.id
      ? `<button type="button" class="lien-action" onclick="ouvrirFicheClientBien('personne', '${escapeOnclickArg(f.conjoint.id)}')">${escapeHtml(f.conjoint.nom)}</button>`
      : escapeHtml(f.conjoint.nom)}</dd>` : (f.situation && f.situation.situation ? `<dt>Situation</dt><dd>${escapeHtml(f.situation.situation)}</dd>` : '');
    const regime = f.situation && f.situation.regime ? `<dt>Régime</dt><dd>${escapeHtml(f.situation.regime)}</dd>` : '';
    const deces = f.deces && (f.deces.date || f.deces.lieu) ? `<dt>Décès</dt><dd>${[f.deces.date ? escapeHtml(valeurAfficheeCb('dateNaissance', f.deces.date)) : '', f.deces.lieu ? escapeHtml(f.deces.lieu) : ''].filter(Boolean).join(' · ')}</dd>` : '';
    const revoir = (f.aRevoir || []).map(a => `<div class="cb-alerte">${escapeHtml(LIBELLES_CHAMPS_CB[a.champ] || a.champ)} : Authentic dit « ${escapeHtml(valeurAfficheeCb(a.champ, a.authentic))} », corrigé dans CLAIRE en « ${escapeHtml(valeurAfficheeCb(a.champ, a.correction))} ».
      <span class="cb-alerte-actions"><wa-button appearance="outlined" size="s" onclick="revenirAuthenticCb('${escapeOnclickArg(a.occ)}', '${escapeOnclickArg(a.champ)}')">Prendre Authentic</wa-button>
      <wa-button appearance="plain" size="s" onclick="garderCorrectionCb('${escapeOnclickArg(a.occ)}', '${escapeOnclickArg(a.champ)}')">Garder</wa-button></span></div>`).join('');
    const homonymes = (f.peutEtre || []).map(h => `<div class="cb-alerte">Même personne que <button type="button" class="lien-action" onclick="ouvrirFicheClientBien('personne', '${escapeOnclickArg(h.id)}')">${escapeHtml(h.nom)}</button>
      <span class="hint">(${escapeHtml(h.dossiers.join(', '))})</span> ? ${infoBulle('Même nom et prénom, sans date de naissance pour les départager : CLAIRE ne les réunit pas seule.')}
      <span class="cb-alerte-actions"><wa-button appearance="outlined" size="s" onclick="decideHomonymeCb('${escapeOnclickArg(h.occA)}', '${escapeOnclickArg(h.occB)}', 'meme')">Oui, la même</wa-button>
      <wa-button appearance="plain" size="s" onclick="decideHomonymeCb('${escapeOnclickArg(h.occA)}', '${escapeOnclickArg(h.occB)}', 'distinct')">Non, différentes</wa-button></span></div>`).join('');
    zone.innerHTML = `<h2 class="cb-titre">${escapeHtml(titre)} ${infoBulle(f.source === 'Authentic' ? 'Repris des fiches client d’Authentic (la plus récente d’abord). Une correction faite ici reste ; si Authentic change ensuite, CLAIRE le propose.' : f.source === 'Import' ? 'Repris du fichier clients d’Authentic importé dans les Réglages : ouvrez sa fiche dans Authentic depuis un dossier pour la compléter.' : 'Repris de la fiche du dossier : ouvrez la fiche client dans Authentic pour compléter (naissance, domicile, profession).')}</h2>
      ${revoir}${homonymes}
      <dl class="cb-champs">${['nomUsage', 'dateNaissance', 'lieuNaissance', 'nationalite', 'profession', 'domicile', 'emails', 'telephones'].map(ligneChamp).join('')}${situation}${regime}${deces}</dl>
      ${renderComplementFicheCb(f)}
      <h3 class="cb-sous-titre">Dossiers</h3>${renderDossiersLiesCb(f.dossiers)}`;
    if (cbEdition) { const s = document.getElementById('cb-champ-saisie'); if (s) s.focus(); }
  }

  function corrigerChampCb(champ) { cbEdition = champ; renderFicheClientBien(); }
  function annulerCorrectionCb() { cbEdition = ''; renderFicheClientBien(); }

  async function envoyerCorrectionCb(corps) {
    try {
      const r = await fetchAvecAuth('/api/clients-biens/correction', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
      if (!r.ok) { const j = await r.json().catch(() => ({})); afficherToast(j.erreur || 'Correction refusée.', 'OK', null); return false; }
      return true;
    } catch (_) { afficherToast('Serveur injoignable.', 'OK', null); return false; }
  }

  async function enregistrerCorrectionCb(champ) {
    const s = document.getElementById('cb-champ-saisie');
    if (!s || !cbOuvert || !cbOuvert.fiche) return;
    if (await envoyerCorrectionCb({ occ: cbOuvert.fiche.occurrences[0], champ, valeur: s.value })) { cbEdition = ''; await rechargerFicheClientBien(); }
  }

  async function revenirAuthenticCb(occ, champ) {
    if (await envoyerCorrectionCb({ occ, champ, retirer: true })) await rechargerFicheClientBien();
  }

  async function garderCorrectionCb(occ, champ) {
    const a = ((cbOuvert && cbOuvert.fiche && cbOuvert.fiche.aRevoir) || []).find(x => x.occ === occ && x.champ === champ);
    if (a && await envoyerCorrectionCb({ occ, champ, valeur: a.correction })) await rechargerFicheClientBien();
  }

  async function decideHomonymeCb(occA, occB, decision) {
    let j = {};
    try {
      const r = await fetchAvecAuth('/api/clients-biens/liaison', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ occA, occB, decision }) });
      j = await r.json().catch(() => ({}));
      if (!r.ok) { afficherToast(j.erreur || 'Choix refusé.', 'OK', null); return; }
    } catch (_) { afficherToast('Serveur injoignable.', 'OK', null); return; }
    cbParDossier.clear();
    // Réunies, la fiche prend l'identifiant que le serveur rend (la fenêtre a pu être fermée entre-temps).
    if (cbOuvert && j.id) cbOuvert.id = j.id;
    if (cbOuvert) await rechargerFicheClientBien();
    if (ecranAffiche('clients-biens')) chercherClientsBiens(cbRecherche);
  }

  function ouvrirDossierDepuisFicheCb(id) {
    fermerFicheClientBien();
    if (!dossiers.some(d => d.id === id)) { afficherToast('Dossier introuvable sur ce poste.', 'OK', null); return; }
    ouvrirDossierDrawer(id);
  }

  // ---------- Onglet Dossier : « Aussi dans un autre dossier » ----------
  // Chaque personne et chaque bien est une FICHE unique (la même dans tous les dossiers où il figure). Les fiches d'un dossier sont lues
  // sur le serveur (60 s de cache) : rendues tout de suite si connues, sinon l'emplacement (vide, masqué) est rempli à l'arrivée.

  // Pure : « Vente · Vendeur — avec Paul EXEMPLE (Acquéreur) », « Succession · Héritier — défunt Jean ESSAI ».
  function texteContexteDossierCb(x) {
    if (!x) return '';
    const avec = (x.avec || []);
    const defunt = avec.find(q => q.role === 'Défunt');
    const autres = x.succession ? (defunt ? `défunt ${defunt.nom}` : '')
      : avec.filter(q => q.role !== x.role).map(q => `${q.nom} (${q.role})`).slice(0, 4).join(', ');
    return [x.succession ? 'Succession' : 'Vente', x.role].filter(Boolean).join(' · ') + (autres ? ` — ${x.succession ? '' : 'avec '}${autres}` : '');
  }

  // Onglet Dossier, colonne de gauche (étude 17/10 : « juste une carte par client et par bien à gauche, on ouvre la carte pour voir la fiche
  // client et bien ») : les personnes et les biens du dossier, chacun une carte qui ouvre sa FICHE unique (Clients et biens). Les cartes se
  // dessinent tout de suite d'après le dossier ; la fiche (et les autres dossiers où chacun figure) arrive du serveur.
  var modifPartiesOuverts = new Set();
  function basculerModifierPartiesFiche(id, ouvert) { if (ouvert) modifPartiesOuverts.add(id); else modifPartiesOuverts.delete(id); }

  // Pure : les personnes du dossier, dans l'ordre de la fiche — vente : vendeurs puis acquéreurs ; succession : défunt puis héritiers.
  function personnesCartesDossier(d) {
    if (!d) return [];
    const civ = (p) => (p.qualitePersonne === 'morale' ? '' : civiliteDepuisTexte(p.civilite) === 'Mme' ? 'Madame ' : civiliteDepuisTexte(p.civilite) === 'M' ? 'Monsieur ' : '');
    if (estSuccession(d)) {
      // Civilité (étude 17/10 : « pour les successions je ne vois pas la civilité ») : celle du défunt sur la fiche ; d'un héritier, celle
      // des comparants ou de la partie, sinon de sa fiche client d'Authentic.
      const df = defuntConstitution(d).champs;
      const nomDefunt = [df.prenoms, df.nom].filter(Boolean).join(' ');
      // Jamais la civilité par défaut des courriers (« Madame » quand rien n'est lu) : seulement celle saisie, lue sur la fiche ou chez les
      // comparants (relecture du 17/10).
      const lu = defuntDepuisFiches(d);
      const civDefunt = civ({ civilite: (d.defunt && d.defunt.civilite) || (lu.fiche && lu.fiche.civilite) || (lu.comparant && lu.comparant.civilite) || '' });
      const civHeritier = (h) => (h.qualitePersonne === 'morale' ? '' : civ(h) || civ({ civilite: (ficheClientDe(d, h.nom) || {}).civilite }));
      // Carte du défunt comme celles des héritiers (étude 18/10), avec le décès, le domicile et le régime en dessous.
      const decede = /^madame/i.test(civDefunt) ? 'Décédée' : 'Décédé';
      const sousDefunt = [df.decesDate ? `${decede} le ${formatDateFr(df.decesDate)}${df.decesLieu ? ` à ${df.decesLieu}` : ''}` : '', df.domicile ? `domicile : ${df.domicile}` : '', df.regime || ''].filter(Boolean).join(' · ');
      return [nomDefunt ? { nom: nomDefunt, affiche: civDefunt + nomDefunt, role: 'Défunt', sous: sousDefunt } : { nom: '', affiche: 'Défunt à compléter', role: 'Défunt', sous: 'Ouvrez la page du dossier dans Authentic, ou « Modifier » ci-dessous', vide: true }]
        .concat(personnesSuccession(d).heritiers.map(h => ({ nom: h.nom, affiche: civHeritier(h) + h.nom, morale: h.qualitePersonne === 'morale', role: 'Héritier' })));
    }
    const rang = (r) => (/^VENDEUR$/i.test(r) ? 0 : /^ACQUEREUR$/i.test(r) ? 1 : 2);
    return (Array.isArray(d.parties) ? d.parties : []).filter(p => p && p.nom)
      .sort((a, b) => rang(a.role || '') - rang(b.role || ''))
      .map(p => {
        const prenom = String(p.prenom || '').trim();
        const nom = !prenom || normaliserPourRecherche(String(p.nom)).includes(normaliserPourRecherche(prenom)) ? String(p.nom) : [prenom, p.nom].join(' ');
        return { nom, affiche: civ(p) + nom, morale: p.qualitePersonne === 'morale', role: rang(p.role || '') === 0 ? 'Vendeur' : rang(p.role || '') === 1 ? 'Acquéreur' : 'Partie' };
      });
  }

  function renderCartesClientsBiensDossier(d) {
    if (!d || !d.id) return '';
    const e = cbParDossier.get(d.id);
    if (!e || (!e.enCours && Date.now() - e.t > 60000)) chargerFichesClientsBiensDossier(d.id);
    return `<div class="pb-cartes" data-pb-dossier="${escapeAttr(d.id)}">${htmlCartesClientsBiensDossier(d, e && e.fiches)}</div>`;
  }

  function htmlCartesClientsBiensDossier(d, f) {
    const cle = (n) => motsNomPersonneAgenda(n).sort().join(' ');
    const fichesP = (f && f.personnes) || [];
    const roleLu = (idDossier, nom, role) => {
      if (role !== 'Partie' || !nom) return role;
      const autre = dossiers.find(x => x.id === idDossier);
      const memes = autre && estSuccession(autre) ? personnesContexteAgenda(autre).filter(q => cle(q.nom) && cle(q.nom) === cle(nom)) : [];
      return memes.length === 1 ? memes[0].role : role;
    };
    const ailleurs = (liste, peutEtre, nom) => (liste || []).map(x => `<span class="pb-ailleurs-ligne">${peutEtre ? 'Peut-être aussi : ' : 'Aussi : '}<b>${escapeHtml(x.libelle || 'Dossier')}</b> · ${escapeHtml(texteContexteDossierCb(Object.assign({}, x, { role: roleLu(x.id, nom, x.role), avec: (x.avec || []).map(q => Object.assign({}, q, { role: roleLu(x.id, q.nom, q.role) })) })))}</span>`).join('');
    // Carte reliée à sa fiche : un bouton qui l'ouvre ; fiches pas encore lues : « en cours de lecture » ; lues sans fiche pour elle (société,
    // nom introuvable) : une carte simple, jamais un message faux (relecture du 17/10).
    const carte = (icone_, titre, sous, fiche, genre, ligneAilleurs, sansFiche) => {
      const corps = `<span class="pb-carte-tete">${icone(icone_)}<span class="pb-carte-titre">${escapeHtml(titre)}</span>${fiche || !f ? icone('chevron-right') : ''}</span>
        ${sous ? `<span class="pb-carte-sous">${escapeHtml(sous)}</span>` : ''}${ligneAilleurs}`;
      if (fiche) return `<button type="button" class="pb-carte" onclick="ouvrirFicheClientBien('${genre}', '${escapeOnclickArg(fiche.id)}')" title="Ouvrir la fiche ${genre === 'bien' ? 'du bien' : 'client'}">${corps}</button>`;
      if (!f && !sansFiche) return `<button type="button" class="pb-carte" onclick="afficherToast('Fiche en cours de lecture : réessayez dans un instant.', 'OK', null)">${corps}</button>`;
      return `<div class="pb-carte pb-carte-simple">${corps}</div>`;
    };
    // Chaque fiche ne sert qu'une fois : même nom ET même rôle d'abord (homonymes vendeur / acquéreur, père et fils), puis même nom, puis
    // un nom contenu dans l'autre (prénom à part, prénom composé) s'il ne désigne qu'une fiche.
    const prises = new Set();
    const ficheDe = (p) => {
      if (p.morale) return null;
      const k = cle(p.nom);
      if (!k) return null;
      const libres = fichesP.filter(x => !prises.has(x.id));
      const mots = k.split(' ');
      const inclus = (x) => { const m = cle(x.nom).split(' ').filter(Boolean); return m.length && (m.every(w => mots.includes(w)) || mots.every(w => m.includes(w))); };
      const choix = libres.find(x => cle(x.nom) === k && x.role === p.role) || libres.find(x => cle(x.nom) === k)
        || (libres.filter(x => inclus(x) && x.role === p.role).length === 1 ? libres.find(x => inclus(x) && x.role === p.role) : null)
        || (libres.filter(inclus).length === 1 ? libres.find(inclus) : null);
      if (choix) prises.add(choix.id);
      return choix || null;
    };
    // Un titre par groupe (étude 17/10 : « mets un titre pour vendeurs, acquéreurs, bien ») : le rôle n'est plus répété sur chaque carte.
    const parRole = new Map();
    personnesCartesDossier(d).forEach(p => {
      const fiche = p.vide ? null : ficheDe(p);
      if (!parRole.has(p.role)) parRole.set(p.role, []);
      parRole.get(p.role).push(carte(p.morale ? 'users' : 'user', p.affiche || p.nom, p.sous || '', fiche, 'personne', fiche ? ailleurs(fiche.autres, false, fiche.nom) + ailleurs(fiche.peutEtreAutres, true, fiche.nom) : '', p.morale || p.vide));
    });
    const TITRES = { Vendeur: ['Vendeur', 'Vendeurs'], 'Acquéreur': ['Acquéreur', 'Acquéreurs'], 'Défunt': ['Défunt', 'Défunt'], 'Héritier': ['Héritier', 'Héritiers'], Partie: ['Autre partie', 'Autres parties'] };
    const groupe = (titre, cartes) => `<div class="pb-groupe"><div class="pb-groupe-titre">${escapeHtml(titre)}</div>${cartes.join('')}</div>`;
    const personnes = [...parRole].map(([role, cartes]) => groupe((TITRES[role] || [role, role])[cartes.length > 1 ? 1 : 0], cartes));
    const fichesB = (f && f.biens) || [];
    const biens = biensDossier(d).map(b => {
      const parcelles = (b.parcelles || []).map(q => [q.prefixe, q.section, q.numero].filter(Boolean).join(' '));
      const fiche = fichesB.find(x => (x.libelle && b.adresse && normaliserPourRecherche(normaliserAdresse(x.libelle)) === normaliserPourRecherche(normaliserAdresse(b.adresse)))
        || (x.parcelles || []).some(q => parcelles.includes(q))) || (fichesB.length === 1 && biensDossier(d).length === 1 ? fichesB[0] : null);
      return carte('home', b.adresse ? normaliserAdresse(b.adresse) : (b.commune || 'Bien'), [parcelles.slice(0, 6).join(', '), (b.lots || []).length ? `${b.lots.length} lot${b.lots.length > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · '), fiche, 'bien', fiche ? ailleurs(fiche.autres, false, '') : '');
    });
    return `${personnes.join('') || '<span class="hint">Aucune partie</span>'}
      ${biens.length ? groupe(biens.length > 1 ? 'Biens' : 'Bien', biens) : groupe('Bien', ['<span class="hint">Aucun bien relevé</span>'])}`;
  }

  async function chargerFichesClientsBiensDossier(id) {
    const e = cbParDossier.get(id) || { t: 0, fiches: null };
    e.enCours = true;
    cbParDossier.set(id, e);
    try {
      const r = await fetchAvecAuth('/api/clients-biens/dossier/' + encodeURIComponent(id));
      if (r.ok) e.fiches = await r.json();
    } catch (_) { /* hors ligne : l'emplacement reste vide (masqué) */ }
    e.t = Date.now();
    e.enCours = false;
    const dossierCartes = dossiers.find(x => x.id === id);
    document.querySelectorAll('.pb-cartes').forEach(el => { if (el.dataset.pbDossier === id && e.fiches && dossierCartes) el.innerHTML = htmlCartesClientsBiensDossier(dossierCartes, e.fiches); });
  }
