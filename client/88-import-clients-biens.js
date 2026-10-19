  // ==== Import du fichier clients et immeubles d'Authentic (Réglages › Authentic) ====
  //
  // Étude 19/10 : « fais l'import dans les réglages ; il faudra compléter les fiches avec les données qui n'y sont pas, grâce aux données
  // d'Authentic ». L'export d'Authentic (« Recherche de Personnes Physiques », « Recherche d'immeubles », .xls) est lu ICI, sur le poste
  // (SheetJS 0.20.3, servi par CLAIRE) ; chaque colonne est devinée d'après ses valeurs, montrée sur les premières lignes et modifiable ; seules les lignes rangées
  // partent au serveur du bureau (POST /api/clients-biens/import). Les fiches importées sont la base de « Clients et biens » ; ce que les
  // dossiers et Authentic en disent passe devant (server/src/clientsBiens.js). Rien ne part à une IA ; rien n'est gardé dans le navigateur.

  // SheetJS 0.20.3 servi par CLAIRE (relecture 19/10 : la 0.18.5 des CDN a deux failles connues, CVE-2023-30533 et CVE-2024-22363).
  var URL_SHEETJS = 'vendor/xlsx/xlsx.full.min.js';
  var CHAMPS_IMPORT = {
    personnes: [['nomComplet', 'Nom et prénom'], ['nom', 'Nom'], ['prenom', 'Prénom'], ['civilite', 'Civilité'], ['dateNaissance', 'Date de naissance'],
      ['deces', 'Décès'], ['situation', 'Situation matrimoniale'], ['conjoint', 'Conjoint / partenaire'],
      ['telephone', 'Téléphone'], ['email', 'Email'], ['adresse', 'Adresse'], ['codePostal', 'Code postal'], ['ville', 'Ville'], ['profession', 'Profession'],
      ['auto', 'Selon la cellule (téléphone, email ou date)'], ['ignorer', 'Ignorer']],
    biens: [['type', 'Type de bien'], ['adresse', 'Adresse'], ['cadastre', 'Cadastre'], ['commune', 'Commune'], ['codePostal', 'Code postal'], ['ignorer', 'Ignorer']]
  };
  var importCbEnCours = null;

  // Pure : la ligne d'en-tête d'un export d'Authentic (étude 19/10, « Recherche de Personnes Physiques » : Nom | Naissance | Décès | Situation |
  // Conjoint/Partenaire | Email | Téléphone | CP | Ville | Client) et le champ de chaque colonne d'après son titre ; null sans en-tête reconnu.
  var TITRES_COLONNES_IMPORT = [
    [/^(nom|nom et prenom|nom prenom|personne)$/, 'nomComplet', 'personnes'], [/^prenoms?$/, 'prenom', 'personnes'], [/^civilite$/, 'civilite', 'personnes'],
    [/^(naissance|date de naissance|ne\(e\) le|ne le)$/, 'dateNaissance', 'personnes'], [/^(deces|date de deces)$/, 'deces', 'personnes'],
    [/^(situation|situation matrimoniale|situation familiale)$/, 'situation', 'personnes'], [/^(conjoint|partenaire|conjoint\/partenaire|conjoint \/ partenaire)$/, 'conjoint', 'personnes'],
    [/^(e-?mail|courriel|adresse e-?mail)$/, 'email', 'personnes'], [/^(telephone|tel\.?|portable|telephones)$/, 'telephone', 'personnes'],
    [/^profession$/, 'profession', 'personnes'], [/^(cp|code postal)$/, 'codePostal', null], [/^(ville|commune|localite)$/, 'ville', null],
    [/^(adresse|adresse du bien|voie)$/, 'adresse', null], [/^(cadastre|references? cadastrales?|parcelles?|section et numero)$/, 'cadastre', 'biens'],
    [/^(type|type de bien|nature|nature du bien)$/, 'type', 'biens']
  ];
  function enTeteImport(lignes) {
    const net = (c) => normaliserPourRecherche(String(c == null ? '' : c)).replace(/\s+/g, ' ').trim();
    for (let i = 0; i < Math.min(15, (lignes || []).length); i++) {
      const l = lignes[i];
      if (!Array.isArray(l)) continue;
      const champs = l.map(c => { const t = net(c); const r = TITRES_COLONNES_IMPORT.find(([re]) => re.test(t)); return r ? r : null; });
      if (champs.filter(Boolean).length >= 3) return { index: i, champs: champs.map(r => (r ? r[1] : 'ignorer')), genres: champs.filter(Boolean).map(r => r[2]).filter(Boolean) };
    }
    return null;
  }

  // Pure : la nature d'une cellule d'un export.
  function typeCelluleImport(v) {
    const t = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
    if (!t) return 'vide';
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t)) return 'email';
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(t)) return 'date';
    if (/^\d{5}$/.test(t)) return 'cp';
    if (/^(?:\+33|0)[\s.]?[1-9](?:[\s.-]?\d{2}){4}$/.test(t) || /^0[1-9]\d{8}$/.test(t)) return 'telephone';
    if (/^(?:\d{3}\s+)?[A-Z]{1,2}\s*\d{1,4}(?:\s*[,;/]\s*(?:\d{3}\s+)?[A-Z]{1,2}\s*\d{1,4})*$/.test(t)) return 'cadastre';
    if (/^\d+(?:[.,]\d+)?$/.test(t)) return 'nombre';
    if (/^\d+\s*(?:bis|ter|[a-z])?\s+\S+/i.test(t) || /(?<![a-z])(rue|avenue|chemin|route|place|impasse|allee|allée|boulevard|lieu-?dit|quai|cours|square|hameau)(?![a-z])/i.test(t)) return 'adresse';
    return 'texte';
  }

  // Pure : les lignes de données d'un export (titre et lignes vides retirés). `lignes` = tableau de tableaux (SheetJS, header: 1).
  function lignesDonneesImport(lignes) {
    return (lignes || []).filter(l => Array.isArray(l) && l.filter(c => String(c == null ? '' : c).trim()).length >= 2);
  }

  // Pure : personnes ou immeubles, d'après le titre de l'export, sinon d'après les valeurs.
  function genreImport(lignes) {
    // Le titre de l'export seulement (« Recherche d'immeubles … », « Recherche de Personnes Physiques … ») : jamais une adresse « Immeuble … ».
    const titre = normaliserPourRecherche(String(((lignes || []).find(l => Array.isArray(l) && l.some(c => String(c || '').trim())) || []).find(c => String(c || '').trim()) || ''));
    if (/^recherche d.?immeubles?/.test(titre)) return 'biens';
    if (/^recherche de personnes?/.test(titre)) return 'personnes';
    const types = lignesDonneesImport(lignes).slice(0, 50).flat().map(typeCelluleImport);
    return types.includes('email') || types.includes('telephone') ? 'personnes' : 'biens';
  }

  // Pure : le champ deviné pour chaque colonne, d'après la nature majoritaire de ses cellules.
  function colonnesProposeesImport(donnees, genre) {
    const nb = Math.max(0, ...donnees.slice(0, 200).map(l => l.length));
    const colonnes = [];
    const pris = new Set();
    for (let c = 0; c < nb; c++) {
      const types = donnees.slice(0, 200).map(l => typeCelluleImport(l[c])).filter(t => t !== 'vide');
      const compte = {};
      types.forEach(t => { compte[t] = (compte[t] || 0) + 1; });
      const [maj, n] = Object.entries(compte).sort((a, b) => b[1] - a[1])[0] || ['vide', 0];
      const part = types.length ? n / types.length : 0;
      let champ = 'ignorer';
      if (genre === 'personnes') {
        if (!types.length) champ = 'ignorer';
        else if ([compte.telephone, compte.email, compte.date].filter(Boolean).length >= 2 || (part < 0.6 && (compte.telephone || compte.email || compte.date))) champ = 'auto';
        else if (maj === 'email') champ = 'email';
        else if (maj === 'telephone') champ = 'telephone';
        else if (maj === 'date') champ = 'dateNaissance';
        else if (maj === 'cp') champ = 'codePostal';
        else if (maj === 'adresse') champ = 'adresse';
        else if (maj === 'texte' && !pris.has('nomComplet')) champ = 'nomComplet';
        // La ville : un texte en capitales après le code postal (pays « FRANCE » exclu).
        else if (maj === 'texte' && pris.has('codePostal') && !pris.has('ville')) {
          const valeurs = donnees.slice(0, 200).map(l => String(l[c] == null ? '' : l[c]).trim()).filter(Boolean);
          if (valeurs.filter(v => v === v.toUpperCase() && !/^france$/i.test(v)).length / valeurs.length >= 0.6) champ = 'ville';
        }
      } else {
        if (!types.length) champ = 'ignorer';
        else if (maj === 'cadastre') champ = 'cadastre';
        else if (maj === 'adresse' && !pris.has('adresse')) champ = 'adresse';
        else if (maj === 'cp') champ = 'codePostal';
        else if (maj === 'texte' && !pris.has('type') && c === 0) champ = 'type';
        else if (maj === 'texte' && !pris.has('commune')) champ = 'commune';
      }
      if (['nomComplet', 'adresse', 'type', 'commune', 'cadastre', 'ville'].includes(champ) && pris.has(champ)) champ = 'ignorer';
      pris.add(champ);
      colonnes.push(champ);
    }
    return colonnes;
  }

  // Pure : « M. Paul DUPONT » / « DUPONT Paul » → { civilite, nom, prenom } (le nom : les mots en capitales).
  function nomPrenomImport(t) {
    let s = String(t || '').replace(/\s+/g, ' ').trim();
    let civilite = '';
    const m = /^(M\.|Mr\.?|Monsieur|Mme\.?|Madame|Mlle\.?|Mademoiselle)\s+/i.exec(s);
    if (m) { civilite = /^m(\.|r|onsieur)/i.test(m[1]) && !/^mme|^mlle|^mademoiselle|^madame/i.test(m[1]) ? 'M' : 'Mme'; s = s.slice(m[0].length); }
    const mots = s.split(' ').filter(Boolean);
    const caps = mots.filter(x => x.length >= 2 && x === x.toUpperCase() && /[A-ZÀ-Þ]/.test(x));
    if (!caps.length) return { civilite, nom: s, prenom: '' };
    return { civilite, nom: caps.join(' '), prenom: mots.filter(x => !caps.includes(x)).join(' ') };
  }

  // Pure : les numéros de téléphone d'une cellule (dix chiffres, espaces, points ou tirets permis ; « +33 » compris).
  function numerosImport(t) {
    const out = [];
    const re = /(?:\+33\s?|0)[1-9](?:[\s.\-]?\d{2}){4}/g;
    let m;
    while ((m = re.exec(String(t || ''))) !== null) out.push(m[0].replace(/[^\d+]/g, '').replace(/^\+33/, '0').replace(/(\d{2})(?=\d)/g, '$1 '));
    return out.slice(0, 4);
  }

  // Pure : les parcelles d'une cellule de cadastre (« AB 12, AB 13 », « 000 ZN 4 »).
  function parcellesImport(t) {
    const out = [];
    const re = /(?:(\d{3})\s+)?([A-Z]{1,2})\s*0*(\d{1,4}[A-Z]?)(?![0-9])/g;
    let m;
    while ((m = re.exec(String(t || ''))) !== null) out.push({ prefixe: m[1] && !/^0+$/.test(m[1]) ? m[1] : '', section: m[2], numero: m[3] });
    return out.slice(0, 40);
  }

  // Pure : les enregistrements à envoyer au serveur, d'après les colonnes choisies.
  function enregistrementsImport(donnees, colonnes, genre) {
    const val = (l, c) => String(l[c] == null ? '' : l[c]).replace(/\s+/g, ' ').trim();
    const dateIsoDe = (t) => { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : ''; };
    return donnees.map(l => {
      const r = { telephones: [], emails: [], parcelles: [] };
      const parts = { adresse: [], codePostal: '', ville: '', commune: '' };
      colonnes.forEach((champ, c) => {
        const v = val(l, c);
        if (!v || champ === 'ignorer') return;
        const type = typeCelluleImport(v);
        if (champ === 'nomComplet') Object.assign(r, nomPrenomImport(v));
        else if (champ === 'nom') r.nom = v;
        else if (champ === 'prenom') r.prenom = v;
        else if (champ === 'civilite') r.civilite = /^(m\.?|mr|monsieur)$/i.test(v) ? 'M' : /^(mme|madame|mlle|mademoiselle)\.?$/i.test(v) ? 'Mme' : '';
        else if (champ === 'dateNaissance') r.dateNaissance = dateIsoDe(v);
        // Plusieurs numéros, parfois étiquetés (« M:06… / Mme 06… »), séparés ou non : chaque numéro de dix chiffres.
        else if (champ === 'telephone') r.telephones.push(...numerosImport(v));
        else if (champ === 'email') { if (type === 'email') r.emails.push(v); }
        else if (champ === 'auto') { if (type === 'telephone') r.telephones.push(v); else if (type === 'email') r.emails.push(v); else if (type === 'date' && !r.dateNaissance) r.dateNaissance = dateIsoDe(v); }
        else if (champ === 'adresse') parts.adresse.push(v);
        else if (champ === 'codePostal') parts.codePostal = /^\d{5}$/.test(v) ? v : '';
        else if (champ === 'ville') parts.ville = v;
        else if (champ === 'commune') parts.commune = v;
        else if (champ === 'profession') r.profession = v;
        else if (champ === 'deces') { const dd = dateIsoDe(v); if (dd) r.deces = { date: dd }; else if (/inconnu/i.test(v)) r.deces = { date: '', lieu: 'date inconnue' }; }
        else if (champ === 'situation') r.situation = v;
        else if (champ === 'conjoint') r.conjoint = v;
        else if (champ === 'type') r.type = v;
        else if (champ === 'cadastre') r.parcelles = r.parcelles.concat(parcellesImport(v));
      });
      const adresse = parts.adresse.join(' ');
      const ville = parts.ville || parts.commune;
      const lieu = [parts.codePostal, ville].filter(Boolean).join(' ');
      const complete = adresse && lieu && !normaliserPourRecherche(adresse).includes(normaliserPourRecherche(ville || '---')) ? `${adresse} ${lieu}` : (adresse || lieu);
      if (genre === 'personnes') return { nom: r.nom || '', prenom: r.prenom || '', civilite: r.civilite || '', dateNaissance: r.dateNaissance || '', telephones: [...new Set(r.telephones)], emails: r.emails, domicile: complete, profession: r.profession || '',
        deces: r.deces || null, situation: r.situation || '', conjoint: r.conjoint || '' };
      return { adresse: complete, commune: ville, codePostal: parts.codePostal || ((/\b(\d{5})\b/.exec(adresse) || [])[1] || ''), type: r.type || '', parcelles: r.parcelles };
    }).filter(x => (genre === 'personnes' ? x.nom : (x.adresse || x.parcelles.length)));
  }

  async function renderImportClientsBiens() {
    const bloc = document.getElementById('reglages-import-cb');
    if (!bloc) return;
    if (importCbEnCours) { bloc.innerHTML = htmlApercuImportCb(); return; }
    let r = null;
    try { const rep = await fetchAvecAuth('/api/clients-biens/import'); if (rep.ok) r = await rep.json(); } catch (_) { /* serveur injoignable */ }
    const ligne = (titre, n, e, genre) => `<div class="reglages-option"><span><strong>${escapeHtml(titre)}</strong> — ${n ? `${n.toLocaleString('fr-FR')} ${genre === 'personnes' ? 'personne' : 'bien'}${n > 1 ? 's' : ''}` : 'rien d’importé'}${e && e.le ? ` <span class="hint">· ${escapeHtml(e.fichier || 'export')} importé le ${escapeHtml(formatDateFr(String(e.le).slice(0, 10)))}${e.par ? ` par ${escapeHtml(e.par)}` : ''}</span>` : ''}</span>
      ${n ? `<wa-button appearance="plain" size="s" class="bouton-discret" onclick="retirerImportCb('${genre}')">Retirer</wa-button>` : ''}</div>`;
    bloc.innerHTML = (r ? ligne('Clients', r.personnes, r.personnesImport, 'personnes') + ligne('Immeubles', r.biens, r.biensImport, 'biens') : '<p class="hint">Serveur injoignable.</p>')
      + `<div class="reglages-option"><input type="file" id="import-cb-fichier" accept=".xls,.xlsx,.csv" style="display:none" onchange="lireExportCb(this)"><wa-button appearance="outlined" size="s" onclick="document.getElementById('import-cb-fichier').click()">Importer un export d’Authentic (.xls)</wa-button></div>`;
  }

  // Pure : le genre, les lignes de données et la colonne de chacune — par l'en-tête de l'export quand il y en a un, sinon devinées.
  function lectureExportImport(lignes) {
    const tete = enTeteImport(lignes);
    let genre = genreImport(lignes);
    if (tete && !/^recherche d/.test(normaliserPourRecherche(String(((lignes || [])[0] || [])[0] || '')))) genre = tete.genres.includes('biens') ? 'biens' : 'personnes';
    const apres = tete ? lignes.slice(tete.index + 1) : lignes;
    const donnees = lignesDonneesImport(apres).filter(l => !/^recherche (de|d')/i.test(String(l[0] || '')) && !/^\d+\s+resultats?$/i.test(normaliserPourRecherche(String(l[0] || '')).trim()));
    const colonnes = tete ? tete.champs.map(c => (CHAMPS_IMPORT[genre].some(([k]) => k === c) ? c : 'ignorer')) : colonnesProposeesImport(donnees, genre);
    return { genre, donnees, colonnes };
  }

  async function lireExportCb(input) {
    const f = input && input.files && input.files[0];
    if (input) input.value = '';
    if (!f) return;
    try {
      if (!window.XLSX) await afChargerScript(URL_SHEETJS);
      const classeur = window.XLSX.read(await f.arrayBuffer(), { type: 'array', cellDates: false, raw: false, dateNF: 'dd/mm/yyyy' });
      const feuille = classeur.Sheets[classeur.SheetNames[0]];
      const lignes = window.XLSX.utils.sheet_to_json(feuille, { header: 1, raw: false, defval: '', dateNF: 'dd/mm/yyyy' });
      const { genre, donnees, colonnes } = lectureExportImport(lignes);
      if (!donnees.length) { afficherToast('Aucune ligne lisible dans ce fichier.', 'OK', null); return; }
      importCbEnCours = { genre, donnees, colonnes, fichier: f.name };
      noterVerificationPoste('import-clients-biens', { detail: `export ${genre === 'personnes' ? 'clients' : 'immeubles'} lu (${donnees.length} lignes)` });
      renderImportClientsBiens();
    } catch (e) {
      afficherToast('Fichier illisible : ' + (e && e.message ? e.message : 'format inconnu'), 'OK', null);
      noterVerificationPoste('import-clients-biens', { ok: false, message: 'export illisible ou bibliothèque injoignable' });
    }
  }

  function htmlApercuImportCb() {
    const e = importCbEnCours;
    const exemples = e.donnees.slice(0, 3);
    const champs = CHAMPS_IMPORT[e.genre];
    const n = enregistrementsImport(e.donnees, e.colonnes, e.genre).length;
    return `<p><strong>${escapeHtml(e.fichier)}</strong> — ${e.genre === 'personnes' ? 'fichier clients' : 'fichier immeubles'}, ${e.donnees.length.toLocaleString('fr-FR')} lignes.
        <span class="hint">Vérifiez la colonne choisie pour chacune (trois premières lignes, sur ce poste seulement).</span></p>
      <div class="import-cb-tableau"><table class="cb-historique"><thead><tr>${e.colonnes.map((c, i) => `<th><select class="prop-champ" onchange="choisirColonneImportCb(${i}, this.value)">${champs.map(([k, l]) => `<option value="${k}"${k === c ? ' selected' : ''}>${escapeHtml(l)}</option>`).join('')}</select></th>`).join('')}</tr></thead>
      <tbody>${exemples.map(l => `<tr>${e.colonnes.map((c, i) => `<td>${escapeHtml(String(l[i] == null ? '' : l[i]))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <div class="reglages-option"><wa-button variant="brand" size="s" onclick="envoyerImportCb()">Importer ${n.toLocaleString('fr-FR')} ${e.genre === 'personnes' ? 'personne' : 'bien'}${n > 1 ? 's' : ''}</wa-button>
        <wa-button appearance="outlined" size="s" onclick="annulerImportCb()">Annuler</wa-button></div>`;
  }

  function choisirColonneImportCb(i, champ) {
    if (!importCbEnCours) return;
    importCbEnCours.colonnes[i] = champ;
    renderImportClientsBiens();
  }

  function annulerImportCb() { importCbEnCours = null; renderImportClientsBiens(); }

  async function envoyerImportCb() {
    const e = importCbEnCours;
    if (!e) return;
    const lignes = enregistrementsImport(e.donnees, e.colonnes, e.genre);
    if (!lignes.length) { afficherToast(e.genre === 'personnes' ? 'Aucun nom : choisissez la colonne « Nom et prénom » ou « Nom ».' : 'Aucune adresse ni parcelle : choisissez leurs colonnes.', 'OK', null); return; }
    try {
      const r = await fetchAvecAuth('/api/clients-biens/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ genre: e.genre, lignes, fichier: e.fichier, par: utilisateurPoste || '' }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { afficherToast(j.erreur || 'Import refusé.', 'OK', null); return; }
      importCbEnCours = null;
      if (typeof cbParDossier !== 'undefined') cbParDossier.clear();
      afficherToast(`${(e.genre === 'personnes' ? j.personnes : j.biens).toLocaleString('fr-FR')} ${e.genre === 'personnes' ? 'clients' : 'immeubles'} importés : ils sont dans « Clients et biens ».`, 'OK', null);
      renderImportClientsBiens();
    } catch (_) { afficherToast('Serveur injoignable.', 'OK', null); }
  }

  function retirerImportCb(genre) {
    demanderConfirmation(genre === 'personnes' ? 'Retirer les clients importés ? Ceux des dossiers restent.' : 'Retirer les immeubles importés ? Ceux des dossiers restent.', async () => {
      try {
        const r = await fetchAvecAuth('/api/clients-biens/import?genre=' + genre, { method: 'DELETE' });
        if (!r.ok) { afficherToast('Retrait refusé.', 'OK', null); return; }
      } catch (_) { afficherToast('Serveur injoignable.', 'OK', null); return; }
      if (typeof cbParDossier !== 'undefined') cbParDossier.clear();
      renderImportClientsBiens();
    }, { bouton: 'Retirer', ton: 'danger' });
  }
