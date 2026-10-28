  // ---- Panneau « Authentic » de la fiche (étude 19/10 : « réunir et améliorer dans les fiches ce qui vient d'Authentic, voir les données
  // qu'il manque, ce que l'on peut modifier ; visuel, attractif et intelligent ») ----
  // Un seul endroit, en tête de la colonne de droite de l'onglet Dossier (vente et succession) :
  //  1. le lien — référence et intitulé du dossier d'Authentic, rattaché sûrement ou pas encore ;
  //  2. à décider — ce qu'Authentic a changé depuis la dernière reprise (Mettre à jour / Ignorer) ;
  //  3. pages reçues — une barre et une pastille par page attendue (page du dossier, fiche client de chaque personne, fiche de chaque
  //     bien annoncé dans « Immeubles (n) »), ce qui manque dit « à ouvrir dans Authentic » ;
  //  4. repris sur la fiche — chaque valeur retenue d'Authentic face à la fiche : identique, corrigée sur la fiche (la correction reste ;
  //     « Remettre » rétablit la valeur d'Authentic) ou en attente ;
  //  5. personnes lues — tout l'état civil des fiches client (naissance, nationalité, profession, domicile, situation, décès), même ce que
  //     la fiche n'a pas d'emplacement pour garder ;
  //  6. suivi dans Authentic — acte, SAFER, réquisition, prix, collaborateur.

  var paSectionsOuvertes = new Set(); // `${dossierId}:${section}`

  function basculerSectionAuthentic(id, section, ouvert) {
    const k = id + ':' + section;
    if (ouvert) paSectionsOuvertes.add(k); else paSectionsOuvertes.delete(k);
  }

  // Pure : le lien du dossier de CLAIRE avec Authentic → { etat: 'reference' | 'intitule' | 'aucun', titre, texte }.
  function lienAuthenticDossier(d) {
    const a = (d && d.authentic) || {};
    const intitule = String((d && d.intituleAuthentic) || '').trim();
    if (d && referenceAuthenticValide(d.referenceAuthentic)) return { etat: 'reference', titre: [d.referenceAuthentic, intitule].filter(Boolean).join(' · '), texte: 'Rattaché par sa référence' };
    if (d && (d.intitulesAuthentic || []).length) return { etat: 'intitule', titre: intitule || 'Dossier rangé ici à la main', texte: 'Rattaché, référence pas encore lue' };
    return { etat: 'aucun', titre: a.releveLe ? 'Pages reçues sans référence' : 'Aucune page reçue', texte: 'Pas encore rattaché' };
  }

  // Pure : les personnes dont une fiche client est attendue — parties de la fiche, sociétés comprises (Authentic en a une, 20/10).
  function personnesAttenduesAuthentic(d) {
    const vues = new Set();
    return (Array.isArray(d && d.parties) ? d.parties : [])
      .filter(p => p && String(p.nom || '').trim())
      .map(p => {
        const prenom = String(p.prenom || '').trim();
        return !prenom || normaliserPourRecherche(String(p.nom)).includes(normaliserPourRecherche(prenom)) ? String(p.nom) : prenom + ' ' + p.nom;
      })
      .filter(n => { const k = normaliserPourRecherche(n); if (vues.has(k)) return false; vues.add(k); return true; });
  }

  // Pure : chaque page attendue d'Authentic et si elle est reçue — [{ libelle, recue, le }]. Les pages viennent du serveur (`pages`, null
  // tant qu'elles ne sont pas lues) ; une fiche client compte aussi quand elle a été retenue sur le dossier avant le 17/10.
  function pagesAttenduesAuthentic(d, pages) {
    const liste = Array.isArray(pages) ? pages : [];
    const a = (d && d.authentic) || {};
    const r = [];
    const dossier = liste.find(p => p.nature === 'dossier');
    r.push({ libelle: 'Page du dossier', recue: !!dossier || !!a.comparants, le: dossier ? dossier.recueLe : '' });
    personnesAttenduesAuthentic(d).forEach(nom => {
      const fiche = ficheClientDe(d, nom);
      r.push({ libelle: 'Fiche de ' + nom, recue: !!fiche, le: fiche ? fiche.vuLe || '' : '' });
    });
    const biensRecus = liste.filter(p => p.nature === 'bien');
    const annonces = Number(a.biensDossier && a.biensDossier.nombre) || 0;
    const connus = Math.max(biensRecus.length, (a.immeubles || []).length, parcellesDossier(d).length ? 1 : 0);
    const n = Math.max(1, annonces, Math.min(connus, 6));
    for (let i = 0; i < n; i++) {
      const p = biensRecus[i];
      r.push({ libelle: n > 1 ? `Fiche du bien ${i + 1}` : 'Fiche du bien', recue: i < connus, le: p ? p.recueLe : '' });
    }
    return r;
  }

  // Pure : les valeurs retenues d'Authentic face à la fiche — [{ cle, libelle, authentic, fiche, etat }] ; etat : 'identique' |
  // 'corrige' (la fiche a été corrigée à la main : la correction reste) | 'attente' (Authentic a changé, à décider).
  var CHAMPS_REPRIS_AUTHENTIC = [
    { cle: 'adresseBien', libelle: 'Adresse du bien', formater: v => normaliserAdresse(v), egal: (a, b) => normaliserAdresse(a) === normaliserAdresse(b) },
    { cle: 'prixVente', libelle: 'Prix', formater: v => (Number(v) > 0 ? formaterPrix(v) : ''), egal: (a, b) => Number(a) === Number(b) },
    { cle: 'typeVente', libelle: 'Type de vente', formater: v => LIBELLES_TYPE_VENTE_AUTHENTIC[v] || String(v || '') },
    { cle: 'situationVendeur', libelle: 'Situation des vendeurs', formater: v => libelleSituationClient(v) },
    { cle: 'situationAcquereur', libelle: 'Situation des acquéreurs', formater: v => libelleSituationClient(v) }
  ];
  function champsReprisAuthentic(d) {
    const v = valeursAuthenticDossier(d);
    const att = (d && d.authentic && d.authentic.majEnAttente) || {};
    const lignes = [];
    CHAMPS_REPRIS_AUTHENTIC.forEach(c => {
      if (v[c.cle] == null || v[c.cle] === '') return;
      const egal = c.egal || ((a, b) => String(a == null ? '' : a) === String(b == null ? '' : b));
      const etat = att[c.cle] ? 'attente' : egal(v[c.cle], d[c.cle]) ? 'identique' : 'corrige';
      lignes.push({ cle: c.cle, libelle: c.libelle, authentic: c.formater(v[c.cle]), fiche: d[c.cle] == null || d[c.cle] === '' ? '' : c.formater(d[c.cle]), etat });
    });
    // Coordonnées et identité reprises des fiches client : une ligne par personne et par nature.
    const reg = (d && d.authentic && d.authentic.fichesAuthentic) || {};
    Object.keys(reg).forEach(id => {
      const f = reg[id];
      if (!f || !f.nom) return;
      const cote = f.role === 'VENDEUR' ? 'vendeur' : f.role === 'ACQUEREUR' ? 'acquéreur' : '';
      [['emails', 'Email', f.role === 'VENDEUR' ? 'emailVendeur' : 'emailAcquereur'], ['telephones', 'Téléphone', f.role === 'VENDEUR' ? 'telephoneVendeur' : 'telephoneAcquereur']].forEach(([nature, lib, champ]) => {
        if (!Array.isArray(f[nature]) || !f[nature].length) return;
        const cle = clePourContact(nature);
        const surFiche = listeContactAuthentic(nature, d[champ]).map(cle);
        const etat = att[nature + ':' + id] ? 'attente' : f[nature].every(x => surFiche.includes(cle(x))) ? 'identique' : 'corrige';
        lignes.push({ cle: nature + ':' + id, libelle: `${lib} · ${f.nom}${cote ? ` (${cote})` : ''}`, authentic: formaterContactAuthentic(nature, f[nature]), fiche: String(d[champ] || ''), etat, contact: true });
      });
    });
    return lignes;
  }

  // Pure : ce que disent les fiches client d'Authentic retenues sur le dossier — une carte par personne, tout l'état civil.
  function personnesLuesAuthentic(d) {
    const reg = (d && d.authentic && d.authentic.fichesClients) || {};
    const parties = Array.isArray(d && d.parties) ? d.parties : [];
    return Object.keys(reg).map(k => reg[k]).filter(f => f && f.nom).map(f => {
      const partie = parties.find(p => p && memePersonneParNom([p.prenom, p.nom].filter(Boolean).join(' '), f.nom));
      const role = partie ? (/^VENDEUR$/i.test(partie.role) ? 'Vendeur' : /^ACQUEREUR$/i.test(partie.role) ? 'Acquéreur' : 'Partie') : '';
      const civ = f.civilite === 'Mme' ? 'Madame ' : f.civilite === 'M' ? 'Monsieur ' : '';
      const naissance = [f.dateNaissance ? 'né' + (f.civilite === 'Mme' ? 'e' : '') + ' le ' + formatDateFr(f.dateNaissance) : '', f.lieuNaissance ? 'à ' + f.lieuNaissance + (f.paysNaissance && !/^france$/i.test(f.paysNaissance) ? ` (${f.paysNaissance})` : '') : ''].filter(Boolean).join(' ');
      const lignes = f.qualitePersonne === 'morale' ? [
        ['Forme', f.forme], ['SIREN', f.siren], ['SIRET', f.siret], ['Siège', f.domicile], ['Capital', f.capital], ['Parts', f.nombreParts],
        ['Email', (f.emails || []).join(', ')], ['Téléphone', (f.telephones || []).join(' / ')]
      ].filter(([, v]) => v) : [
        ['Naissance', naissance], ['Nom d’usage', f.nomUsage], ['Nationalité', f.nationalite], ['Profession', f.profession], ['Domicile', f.domicile],
        ['Situation', f.situationMatrimoniale ? libelleSituationMatrimoniale(f.situationMatrimoniale) : ''],
        ['Décès', f.deces && f.deces.date ? `le ${formatDateFr(f.deces.date)}${f.deces.lieu ? ' à ' + f.deces.lieu : ''}` : ''],
        ['Email', (f.emails || []).join(', ')], ['Téléphone', (f.telephones || []).join(' / ')]
      ].filter(([, v]) => v);
      const manque = (f.qualitePersonne === 'morale' ? ['SIREN', 'Siège'] : ['Naissance', 'Domicile', 'Email', 'Téléphone']).filter(l => !lignes.some(x => x[0] === l));
      return { nom: civ + f.nom, role, lignes, manque, partie: !!partie, vuLe: f.vuLe || '', morale: f.qualitePersonne === 'morale' };
    }).sort((a, b) => (a.partie === b.partie ? 0 : a.partie ? -1 : 1));
  }

  function accepterToutesMajsAuthentic(id) {
    const d = dossiers.find(x => x.id === id);
    if (d) accepterMajsAuthentic(id, majsEnAttenteAuthentic(d).map(m => m.cle));
  }

  // « Remettre » : la valeur d'Authentic remplace une correction faite à la main sur la fiche (champs simples seulement).
  async function remettreValeurAuthentic(id, cle) {
    const d = dossiers.find(x => x.id === id);
    const def = CHAMPS_REPRIS_AUTHENTIC.find(c => c.cle === cle);
    const v = valeursAuthenticDossier(d);
    if (!d || !def || v[cle] == null) return;
    const avant = d[cle] == null || d[cle] === '' ? '' : def.formater(d[cle]);
    d[cle] = v[cle];
    let texte = `${def.libelle} remis comme dans Authentic : ${def.formater(v[cle])}${avant ? ` (correction retirée : ${avant})` : ''}`;
    if (cle === 'typeVente' && v[cle] === 'terre' && ajouterPieceSaferTerre(d)) texte += ' ; « Réponse SAFER » ajoutée aux pièces';
    ajouterHistoriqueMajAuthentic(d, texte);
    await sauvegarder(d);
    render();
    afficherToast(`${libelleDossierAffiche(d)} : ${def.libelle.toLowerCase()} remis comme dans Authentic.`, 'OK', null);
  }

  function renderPanneauAuthentic(d) {
    if (!d || !d.id) return '';
    const lien = lienAuthenticDossier(d);
    const majs = majsEnAttenteAuthentic(d);
    const champs = champsReprisAuthentic(d);
    const corriges = champs.filter(c => c.etat === 'corrige').length;
    const personnes = personnesLuesAuthentic(d);
    const suivi = lignesAuthenticDossier(d);
    const section = (cle, titre, compte, badge, corps) => `<details class="pa-section"${paSectionsOuvertes.has(d.id + ':' + cle) ? ' open' : ''} ontoggle="basculerSectionAuthentic('${escapeOnclickArg(d.id)}', '${cle}', this.open)">
        <summary><span class="pa-section-titre">${escapeHtml(titre)}</span>${compte ? `<span class="pa-compte">${compte}</span>` : ''}${badge || ''}${icone('chevron-down')}</summary>
        <div class="pa-section-corps">${corps}</div></details>`;
    const etiquette = { identique: ['dl-success', 'Identique'], corrige: ['dl-acte', 'Corrigé sur la fiche'], attente: ['dl-pret', 'À décider'] };
    // Identiques : une ligne chacune, cochée ; corrigés ou à décider : une carte qui montre les deux valeurs.
    const identiques = champs.filter(c => c.etat === 'identique').map(c => `<li class="pa-identique">${icone('check')}<span class="pa-champ-libelle">${escapeHtml(c.libelle)}</span><span class="pa-identique-valeur">${escapeHtml(c.authentic || '—')}</span></li>`).join('');
    const tableChamps = champs.filter(c => c.etat !== 'identique').map(c => `<div class="pa-champ pa-${c.etat}">
        <div class="pa-champ-tete"><span class="pa-champ-libelle">${escapeHtml(c.libelle)}</span><span class="dot-label ${etiquette[c.etat][0]}"><span class="dot"></span>${etiquette[c.etat][1]}</span></div>
        <div class="pa-champ-valeurs"><span class="pa-valeur"><span class="pa-source">Authentic</span>${escapeHtml(c.authentic || '—')}</span>
        <span class="pa-valeur"><span class="pa-source">Fiche</span>${escapeHtml(c.fiche || '—')}</span></div>
        ${c.etat === 'corrige' && !c.contact ? `<button type="button" class="lien-action" onclick="remettreValeurAuthentic('${escapeOnclickArg(d.id)}', '${escapeOnclickArg(c.cle)}')" title="Retirer la correction faite sur la fiche et reprendre la valeur d’Authentic">Remettre la valeur d’Authentic</button>` : ''}
      </div>`).join('') + (identiques ? `<ul class="pa-identiques">${identiques}</ul>` : '');
    const cartesPersonnes = personnes.map(p => `<div class="pa-personne">
        <div class="pa-personne-tete">${icone(p.morale ? 'users' : 'user')}<span class="pa-personne-nom">${escapeHtml(p.nom)}</span>${p.role ? `<span class="pa-role">${escapeHtml(p.role)}</span>` : '<span class="pa-role pa-role-hors">hors parties</span>'}</div>
        <dl class="pa-personne-infos">${p.lignes.map(([l, v]) => `<dt>${escapeHtml(l)}</dt><dd>${escapeHtml(v)}</dd>`).join('')}</dl>
        ${p.manque.length ? `<div class="pa-personne-manque">${icone('info')}Non renseigné dans Authentic : ${escapeHtml(p.manque.join(', ').toLowerCase())}</div>` : ''}
      </div>`).join('');
    const tuiles = suivi.map(l => `<div class="pa-tuile"><span class="pa-tuile-libelle">${escapeHtml(l.libelle)}</span>${l.classe ? `<span class="dot-label ${l.classe}"><span class="dot"></span>${escapeHtml(l.valeur)}</span>` : `<span class="pa-tuile-valeur">${escapeHtml(l.valeur)}</span>`}</div>`).join('');
    const decider = majs.length ? `<div class="pa-decider">
        <div class="pa-decider-titre">${icone('alert-triangle')}Authentic a changé ${majs.length > 1 ? `${majs.length} données` : 'une donnée'}${majs.length > 1 ? `<button type="button" class="lien-action" onclick="accepterToutesMajsAuthentic('${escapeOnclickArg(d.id)}')">Tout mettre à jour</button>` : ''}</div>
        ${majs.map(m => `<div class="pa-decider-ligne"><span class="pa-decider-texte"><b>${escapeHtml(m.libelle)}</b><span class="pa-avant">${escapeHtml(m.avant || 'vide')}</span>${icone('chevron-right')}<span class="pa-apres">${escapeHtml(m.apres)}</span></span>
          <span class="pa-decider-actions"><wa-button size="s" variant="brand" type="button" onclick="accepterMajAuthentic('${escapeOnclickArg(d.id)}', '${escapeOnclickArg(m.cle)}')">Mettre à jour</wa-button>
          <wa-button size="s" appearance="outlined" type="button" onclick="ignorerMajAuthenticFiche('${escapeOnclickArg(d.id)}', '${escapeOnclickArg(m.cle)}')" title="Garder la fiche telle quelle : Authentic ne le proposera plus tant qu’il ne change pas encore">Ignorer</wa-button></span></div>`).join('')}
      </div>` : '';
    return `<section class="pa-carte pa-lien-${lien.etat}" aria-label="Authentic">
      <header class="pa-tete">
        <span class="pa-pastille">${icone('link')}</span>
        <span class="pa-titres"><span class="pa-titre">Authentic</span><span class="pa-sous">${escapeHtml(lien.titre)}</span></span>
        <span class="pa-etat"><span class="dot-label ${lien.etat === 'reference' ? 'dl-success' : lien.etat === 'intitule' ? 'dl-acte' : 'dl-neutre'}"><span class="dot"></span>${escapeHtml(lien.texte)}</span>${infoBulle(lien.etat === 'aucun' ? 'Les pages d’Authentic ne vont à ce dossier qu’une fois le lien confirmé : ouvrez le dossier dans Authentic, CLAIRE demande « est-ce bien ce dossier ? »' : 'Les pages de ce dossier d’Authentic vont à cette fiche sans question.')}</span>
      </header>
      ${decider}
      ${htmlSousDossierAT(d) || (typeof htmlComptabiliteAT === 'function' ? htmlComptabiliteAT(d) : '')}
      ${renderRecuAuthenticFiche(d)}
      ${champs.length ? section('champs', 'Repris sur la fiche', champs.length, corriges ? `<span class="dot-label dl-acte"><span class="dot"></span>${corriges} corrigé${corriges > 1 ? 's' : ''}</span>` : '', `<p class="pa-aide">${icone('pencil')}Tout se corrige sur la fiche : la correction reste, même quand Authentic est relu. Si Authentic change ensuite, CLAIRE demande.</p>${tableChamps}`) : ''}
      ${personnes.length ? section('personnes', 'Fiches client lues', personnes.length, '', cartesPersonnes) : ''}
      ${(() => { const h = htmlCompleterAuthenticFiche(d); return h ? section('reprendre', 'Tout reprendre d’Authentic', 0, '', `<p class="pa-aide">${icone('info')}Reprend du dossier d’Authentic choisi les personnes, emails, téléphones, le bien et le prix, en remplaçant la fiche (l’ancienne valeur reste dans l’historique). À faire après une correction dans Authentic.</p>${h}`) : ''; })()}
      ${tuiles ? section('suivi', 'Suivi dans Authentic', suivi.length, '', `<div class="pa-tuiles">${tuiles}</div>`) : ''}
      ${lien.etat !== 'aucun' || d.authentic ? `<footer class="pa-pied"><wa-button appearance="plain" size="s" type="button" class="bouton-discret" onclick="confirmerOublierDonneesAuthentic('${escapeOnclickArg(d.id)}')" title="Oublier ce qui vient d’Authentic (page d’un autre dossier)">${icone('x')} Oublier ce qui vient d’Authentic</wa-button></footer>` : ''}
    </section>`;
  }
