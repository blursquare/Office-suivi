  // ==== SUCCESSIONS : COURRIERS ET FACTURES RANGÉS PAR CLAIRE SCAN (étude 15/10) ====
  // « Demander à Claire Scan de ranger les courriers et les renonciations dans le dossier du commun de la succession, dans un
  // sous-dossier Courrier reçu ; les factures à régler dans un autre sous-dossier : Factures à régler. Le but est de simplifier la
  // comptabilité pour Sophie et lui permettre de suivre s'il y a des factures en attente de règlement. Envoyer une notification à
  // Sophie sur Teams avec le dossier, l'organisme et le montant. »
  // Pour un scan rattaché à une SUCCESSION : une facture va dans « Factures à régler » (organisme et montant lus sur la facture,
  // gardés sur la fiche dans `d.succession.factures`, Teams à Sophie) ; tout autre courrier (renonciation comprise) dans « Courrier
  // reçu ». Les pièces d'état civil, d'identité, le RIB et le titre gardent leur rangement habituel. Les sous-dossiers sont créés
  // par le serveur s'ils manquent (liste fermée, `SOUS_DOSSIERS_CREES` de server/src/scans.js).

  var SOUS_DOSSIER_COURRIER_SUCCESSION = 'Courrier reçu';
  var SOUS_DOSSIER_FACTURES_SUCCESSION = 'Factures à régler';
  // Types de Claire Scan qui gardent leur rubrique dans une succession (pièces du défunt et des héritiers).
  var TYPES_SCAN_HORS_COURRIER_SUCCESSION = ['identite', 'etatCivil', 'rib', 'titrePropriete', 'etatHypothecaire', 'avisTaxeFonciere'];
  // Une facture se dit en tête de page (texte normalisé, sans accents) ; « facture » cité plus bas dans un courrier ne compte pas.
  var RE_FACTURE_ENTETE_SUCCESSION = /^.{0,600}(?:\bfacture\b|note d'honoraires|avis des sommes a payer|montant a (?:regler|payer)|net a payer)/;

  // Pure : vrai si le haut de la page 1 d'un scan est celui d'une facture.
  function estFactureScanSuccession(textePage1, typeCle) {
    if (typeCle === 'facture') return true;
    if (typeCle && typeCle !== 'renonciationSuccession' && TYPES_SCAN.some(t => t.cle === typeCle && !t.faible)) {
      // Un type précis (état daté, avis de taxe foncière…) n'est une facture que si la page le dit dès son titre.
      return /^.{0,120}\bfacture\b/.test(enTeteScan(textePage1));
    }
    return RE_FACTURE_ENTETE_SUCCESSION.test(enTeteScan(textePage1));
  }

  // Pure : un montant écrit (« 1 234,56 », « 1.234,56 », « 1234.56 », « 150 ») → nombre, ou null.
  function nombreMontantFacture(t) {
    let s = String(t || '').replace(/[\s  ]/g, '');
    if (!/^\d[\d.,]*$/.test(s)) return null;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    const n = Number(s);
    return Number.isFinite(n) && n > 0 && n < 10000000 ? Math.round(n * 100) / 100 : null;
  }

  // Le total à régler, du plus sûr au plus vague : on prend le premier libellé trouvé, et sa DERNIÈRE occurrence (le total final
  // est en bas de la facture).
  var LIBELLES_MONTANT_FACTURE = ['net a payer', 'reste a payer', 'montant a regler', 'montant a payer', 'somme a payer', 'total a payer',
    'solde du', 'montant du', 'total ttc', 'montant ttc', 'total net', 'total'];

  // Pure : le montant à régler lu sur une facture, ou null.
  function montantFactureScan(texte) {
    const t = texteNormaliseScan(texte).replace(/[  ]/g, ' ');
    const nombre = '(\\d{1,3}(?:[ .]\\d{3})+(?:,\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?)(?![\\d/])';
    for (const libelle of LIBELLES_MONTANT_FACTURE) {
      const re = new RegExp('(?<![a-z])' + libelle.replace(/ /g, '\\s+') + '(?![a-z])[^0-9]{0,40}?' + nombre, 'g');
      let m, dernier = null;
      while ((m = re.exec(t))) { const v = nombreMontantFacture(m[1]); if (v) dernier = v; }
      if (dernier) return dernier;
    }
    return null;
  }

  // Émetteurs courants d'une facture de succession, cherchés dans le haut de la page (quand le répertoire ne nomme rien).
  var RE_ORGANISMES_FACTURE = /(pompes? funebres?[^,\n]{0,40}|marbrerie[^,\n]{0,40}|ehpad[^,\n]{0,40}|residence[^,\n]{0,40}|centre hospitalier[^,\n]{0,40}|hopital[^,\n]{0,30}|clinique[^,\n]{0,30}|edf|engie|totalenergies|veolia|saur|suez|orange|sfr|bouygues telecom|free|credit agricole|caisse d'epargne|banque populaire|credit mutuel|bnp paribas|societe generale|lcl|la banque postale|mutuelle[^,\n]{0,30}|maif|macif|matmut|axa|groupama|allianz|generali|tresor public|centre des finances publiques[^,\n]{0,30}|syndic[^,\n]{0,30})/;

  // Pure : l'organisme qui émet la facture — un organisme du répertoire cité en tête (le plus long), sinon un émetteur courant, sinon
  // la première ligne du scan (OCR). '' si rien de sûr : il se complète sur la fiche.
  function organismeFactureScan(textePage1, contacts) {
    const brut = String(textePage1 || '');
    const tete = texteMotsScan(brut.slice(0, LONGUEUR_ENTETE_SCAN));
    const repertoire = (contacts || []).map(c => c && c.organisme).filter(o => o && texteMotsScan(o).trim().length >= 5)
      .filter(o => tete.includes(texteMotsScan(o))).sort((a, b) => b.length - a.length);
    if (repertoire.length) return repertoire[0].trim();
    const plat = brut.replace(/\s+/g, ' ').slice(0, LONGUEUR_ENTETE_SCAN);
    const norm = [...plat].map(ch => ch.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()).join('');
    const m = norm.length === plat.length ? RE_ORGANISMES_FACTURE.exec(norm) : null;
    if (m) {
      const mots = plat.slice(m.index, m.index + m[0].length).split(/\s+/).filter(Boolean);
      // Arrêt avant un code postal, un numéro de voie ou le mot « facture ».
      const fin = mots.findIndex((w, i) => i > 0 && (/^\d/.test(w) || /^factur/i.test(w) || /^[—–\-|·•]+$/.test(w)));
      return (fin > 0 ? mots.slice(0, fin) : mots).slice(0, 6).join(' ').replace(/[\s,;:—–\-|·•]+$/, '');
    }
    const ligne = brut.split(/\n+/).map(l => l.trim()).find(l => /[A-Za-zÀ-ÿ]{4}/.test(l) && !/^(facture|page|date|n[o°]|objet|madame|monsieur)\b/i.test(l) && l.length <= 60);
    return brut.includes('\n') && ligne ? ligne : '';
  }

  // Pure : le rangement d'un scan dans une succession → { sousDossier, nomCible, facture: { organisme, montant } | null }, ou null
  // quand le scan garde son rangement habituel (pièce d'état civil, d'identité, RIB, titre…).
  function rangementScanSuccession(lecture, typeCle, contacts) {
    const page1 = (lecture && (lecture.page1 || lecture.texte)) || '';
    if (estFactureScanSuccession(page1, typeCle)) {
      const organisme = organismeFactureScan(page1, contacts);
      return { sousDossier: SOUS_DOSSIER_FACTURES_SUCCESSION, nomCible: `Facture${organisme ? ' - ' + organisme : ''} - ${SUFFIXE_NOM_SCAN}`,
        facture: { organisme, montant: montantFactureScan((lecture && lecture.texte) || page1) } };
    }
    if (typeCle && TYPES_SCAN_HORS_COURRIER_SUCCESSION.includes(typeCle)) return null;
    if (typeCle === 'renonciationSuccession') return { sousDossier: SOUS_DOSSIER_COURRIER_SUCCESSION, nomCible: `Renonciation à succession - ${SUFFIXE_NOM_SCAN}`, facture: null };
    const organisme = organismeFactureScan(page1, contacts);
    return { sousDossier: SOUS_DOSSIER_COURRIER_SUCCESSION, nomCible: `Courrier${organisme ? ' - ' + organisme : ''} - ${SUFFIXE_NOM_SCAN}`, facture: null };
  }

  // Pure : applique à une proposition (ou un choix) de Claire Scan le rangement d'une succession ; rend l'objet modifié.
  function appliquerRangementSuccessionScan(cible, d, lecture, typeCle, contacts) {
    if (!cible) return cible;
    delete cible.sousDossier;
    delete cible.facture;
    if (!d || !estSuccession(d)) return cible;
    const r = rangementScanSuccession(lecture, typeCle, contacts);
    if (!r) return cible;
    cible.sousDossier = r.sousDossier;
    cible.nomCible = r.nomCible;
    cible.facture = r.facture;
    cible.rubriques = [];
    return cible;
  }

  // ---- Suivi des factures sur la fiche ----

  // Pure : les factures d'une succession, les plus récentes d'abord.
  function facturesSuccession(d) {
    const l = d && d.succession && Array.isArray(d.succession.factures) ? d.succession.factures : [];
    return l.filter(f => f && f.id).slice().sort((a, b) => String(b.recueLe || '').localeCompare(String(a.recueLe || '')));
  }
  // Pure : celles qui attendent leur règlement.
  function facturesARegler(d) { return facturesSuccession(d).filter(f => !f.regleeLe); }

  // Pure : toutes les factures de successions en attente, tous dossiers → [{ d, f }], les plus anciennes d'abord.
  function facturesAReglerEtude(liste) {
    const r = [];
    (liste || []).filter(d => d && estSuccession(d)).forEach(d => facturesARegler(d).forEach(f => r.push({ d, f })));
    return r.sort((a, b) => String(a.f.recueLe || '').localeCompare(String(b.f.recueLe || '')));
  }

  // Modifie d : la facture rangée est notée sur la fiche (sans doublon : même fichier) → la facture notée, ou null.
  function noterFactureSuccession(d, facture, chemin, maintenantIso) {
    if (!d || !facture) return null;
    d.succession = Object.assign({}, d.succession);
    const liste = Array.isArray(d.succession.factures) ? d.succession.factures.slice() : [];
    const fichier = String(chemin || '').replace(/\\/g, '/');
    if (fichier && liste.some(f => f && f.fichier === fichier)) return null;
    const f = { id: 'fact-' + String(Date.parse(maintenantIso) || Date.now()).slice(-8) + Math.random().toString(36).slice(2, 5),
      organisme: String(facture.organisme || '').slice(0, 120), montant: Number.isFinite(facture.montant) ? facture.montant : null,
      recueLe: String(maintenantIso || new Date().toISOString()).slice(0, 10), fichier, regleeLe: '' };
    liste.push(f);
    d.succession.factures = liste.slice(-200);
    return f;
  }

  // Après le rangement d'un scan dans une succession : courrier noté dans l'historique ; facture notée sur la fiche et annoncée à
  // Sophie sur Teams (dossier, organisme, montant, lien vers le fichier).
  async function enregistrerScanSuccession(d, choix, corps, auto) {
    const chemin = corps && corps.chemin ? String(corps.chemin).replace(/\\/g, '/') : '';
    const maintenant = new Date().toISOString();
    const libelle = String(choix.nomCible || '').replace(new RegExp('\\s*-\\s*' + SUFFIXE_NOM_SCAN + '$', 'i'), '');
    noterVerificationPoste('scan-succession-factures', { detail: `rangé dans « ${choix.sousDossier} »` });
    const facture = choix.facture ? noterFactureSuccession(d, choix.facture, chemin, maintenant) : null;
    ajouterHistorique(d, `Scan rangé ${auto ? 'automatiquement' : 'à la main'} dans « ${choix.sousDossier} » : ${libelle}${facture && facture.montant ? ' — ' + formaterPrixCentimes(facture.montant) : ''}`, { auto });
    await sauvegarder(d);
    render();
    if (!facture) return;
    try {
      const r = await fetchAvecAuth('/api/notifications/facture-succession', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dossierId: d.id, dossierNom: libelleDossierAffiche(d), organisme: facture.organisme, montant: facture.montant, chemin }) });
      const res = await r.json().catch(() => ({}));
      noterVerificationPoste('facture-succession-teams', res && res.envoyeResponsable ? { detail: 'facture annoncée à Sophie sur Teams' }
        : { ok: false, detail: res && res.ignore ? 'envoi Teams non activé ou facture déjà annoncée' : 'adresse de Sophie GOSSART absente des Réglages ou envoi refusé' });
    } catch (e) { /* serveur injoignable : la facture reste sur la fiche */ }
  }

  function factureSuccessionParId(d, id) { return facturesSuccession(d).find(f => f.id === id) || null; }

  // Réglée / à régler (case de la fiche, carte du Tableau, liste de Claire Scan).
  function basculerFactureReglee(dossierId, factureId) {
    const d = dossiers.find(x => x.id === dossierId);
    const f = d && factureSuccessionParId(d, factureId);
    if (!f) return;
    f.regleeLe = f.regleeLe ? '' : new Date().toISOString().slice(0, 10);
    f.reglePar = f.regleeLe ? (utilisateurPoste || '') : '';
    ajouterHistorique(d, `Facture ${f.organisme || ''}${f.montant ? ' (' + formaterPrixCentimes(f.montant) + ')' : ''} : ${f.regleeLe ? 'réglée' : 'remise à régler'}`);
    sauvegarder(d);
    render();
    if (typeof ongletActuel !== 'undefined' && ongletActuel === 'scans') renderScans(true);
  }

  // Organisme ou montant corrigé à la main sur la fiche.
  function changerFactureSuccession(dossierId, factureId, champ, valeur) {
    const d = dossiers.find(x => x.id === dossierId);
    const f = d && factureSuccessionParId(d, factureId);
    if (!f || !['organisme', 'montant'].includes(champ)) return;
    if (champ === 'montant') {
      const n = eurosDepuisSaisie(valeur);
      f.montant = Number.isFinite(n) && n > 0 ? n : null;
    } else f.organisme = String(valeur || '').trim().slice(0, 120);
    sauvegarder(d);
    render();
  }

  function retirerFactureSuccession(dossierId, factureId) {
    const d = dossiers.find(x => x.id === dossierId);
    if (!d || !d.succession || !Array.isArray(d.succession.factures)) return;
    const f = factureSuccessionParId(d, factureId);
    d.succession.factures = d.succession.factures.filter(x => x && x.id !== factureId);
    ajouterHistorique(d, `Facture retirée du suivi : ${(f && f.organisme) || 'sans organisme'}`);
    sauvegarder(d);
    render();
  }

  // Bloc « Factures à régler » de l'onglet Dossier d'une succession.
  function renderFacturesSuccessionFiche(d) {
    const liste = facturesSuccession(d);
    const idJs = escapeOnclickArg(d.id);
    const enAttente = liste.filter(f => !f.regleeLe);
    const total = enAttente.reduce((s, f) => s + (f.montant || 0), 0);
    const ligneFacture = (f) => {
      const fJs = escapeOnclickArg(f.id);
      const montant = f.montant ? formaterPrixCentimes(f.montant) : '';
      return `<li class="succ-facture${f.regleeLe ? ' reglee' : ''}">
        <input type="checkbox" aria-label="Facture réglée"${f.regleeLe ? ' checked' : ''} onchange="basculerFactureReglee('${idJs}', '${fJs}')">
        <input type="text" class="prop-champ succ-facture-organisme" value="${escapeAttr(f.organisme || '')}" placeholder="Organisme" aria-label="Organisme de la facture" onchange="changerFactureSuccession('${idJs}', '${fJs}', 'organisme', this.value)">
        <input type="text" class="prop-champ succ-facture-montant" value="${escapeAttr(montant)}" placeholder="Montant" aria-label="Montant de la facture" onchange="changerFactureSuccession('${idJs}', '${fJs}', 'montant', this.value)">
        <span class="hint">reçue le ${escapeHtml(formatDateFr(f.recueLe))}${f.regleeLe ? ` · réglée le ${escapeHtml(formatDateFr(f.regleeLe))}` : ''}</span>
        ${f.fichier ? `<button type="button" class="lien-action" onclick="ouvrirFichierNas('${escapeOnclickArg(f.fichier)}')">Ouvrir</button>` : ''}
        <wa-button appearance="plain" size="s" class="bouton-icone" title="Retirer du suivi" aria-label="Retirer du suivi" onclick="retirerFactureSuccession('${idJs}', '${fJs}')">${icone('x')}</wa-button>
      </li>`;
    };
    return `<div class="section-eyebrow fiche-sous-titre">Factures à régler <span class="hint">· ${enAttente.length ? `${enAttente.length} en attente${total ? ' — ' + escapeHtml(formaterPrixCentimes(total)) : ''}` : 'aucune en attente'}</span> ${infoBulle('Chaque facture scannée pour cette succession est rangée par Claire Scan dans « Factures à régler » du dossier du NAS et annoncée à Sophie sur Teams. Cochez-la une fois réglée.')}</div>
      ${liste.length ? `<ul class="succ-factures">${liste.map(ligneFacture).join('')}</ul>` : '<p class="hint succ-factures-vide">Aucune facture reçue par Claire Scan.</p>'}`;
  }

  // Cartes du Tableau : une carte « À faire » par facture en attente.
  function cartesFacturesSuccessionFiche(d, ajouter) {
    const idJs = escapeOnclickArg(d.id);
    facturesARegler(d).forEach(f => ajouter('faire', {
      cle: 'facture:' + f.id, titre: `Régler la facture${f.organisme ? ' — ' + f.organisme : ''}`, iso: '',
      sous: [f.montant ? formaterPrixCentimes(f.montant) : 'montant à vérifier', 'reçue le ' + formatDateFr(f.recueLe)].join(' · '),
      categorie: 'succession', coche: { onclick: `basculerFactureReglee('${idJs}', '${escapeOnclickArg(f.id)}')`, libelle: 'Marquer réglée' }
    }));
  }

  // Liste de Claire Scan : toutes les factures des successions en attente de règlement.
  function renderFacturesAReglerScans() {
    const liste = facturesAReglerEtude(dossiers);
    if (!liste.length) return '';
    const total = liste.reduce((s, x) => s + (x.f.montant || 0), 0);
    return `<div class="calc-card scans-factures">
      <div class="dash-section-titre">Factures des successions à régler <span class="hint">· ${liste.length}${total ? ' — ' + escapeHtml(formaterPrixCentimes(total)) : ''}</span></div>
      <ul>${liste.map(({ d, f }) => `<li>
        <input type="checkbox" aria-label="Facture réglée" onchange="basculerFactureReglee('${escapeOnclickArg(d.id)}', '${escapeOnclickArg(f.id)}')">
        <button type="button" class="lien-action" onclick="ouvrirDossierDrawer('${escapeOnclickArg(d.id)}')">${escapeHtml(libelleDossierAffiche(d))}</button>
        <span>${escapeHtml(f.organisme || 'Organisme à préciser')}</span>
        <strong>${f.montant ? escapeHtml(formaterPrixCentimes(f.montant)) : '<span class="hint">montant à vérifier</span>'}</strong>
        <span class="hint">reçue le ${escapeHtml(formatDateFr(f.recueLe))}</span></li>`).join('')}</ul>
    </div>`;
  }
