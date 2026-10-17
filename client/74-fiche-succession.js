  // ==== FICHE D'UNE SUCCESSION (étude 15/10 : « la même présentation que pour les fiches de dossiers de vente, sauf que le déroulé
  // n'est pas le même au niveau des échéances ; les actes ne sont pas les mêmes ») ====
  // Les règles (types, actes, étapes, pièces) sont dans commun/succession.js, lues aussi par le serveur (planning, rappels). Ici :
  // l'onglet Dossier (défunt, héritiers, régime matrimonial, donation entre époux, testament, type et actes), les cartes du Tableau,
  // l'étape « signature » du bandeau, et les gestes qui écrivent sur la fiche (`d.succession`, `d.defunt`).

  var REPONSES_SUCCESSION = [['', 'À vérifier'], ['oui', 'Oui'], ['non', 'Non']];
  var CHAMPS_SUCCESSION = {
    type: 'Type de succession', ouvertureLe: 'Rendez-vous d’ouverture', actifSuperieurSeuil: 'Actif de plus de 50 000 €',
    conjointSurvivant: 'Conjoint survivant', donationEpoux: 'Donation entre époux', testament: 'Testament', droitsDus: 'Droits de succession dus',
    inventaireNecessaire: 'Inventaire nécessaire', notorieteSigneeLe: 'Acte de notoriété signé le', declarationSigneeLe: 'Déclaration de succession signée le'
  };
  // Champs du défunt modifiables sur la fiche (les mêmes que la Constitution de dossier, `defuntConstitution`).
  var CHAMPS_DEFUNT_FICHE = ['civilite', 'prenoms', 'nom', 'domicile', 'naissanceDate', 'naissanceLieu', 'decesDate', 'decesLieu', 'conjointLien', 'conjointNom', 'regime'];

  // Pure : le texte d'historique d'un champ de la succession modifié.
  function texteHistoriqueSuccession(champ, valeur) {
    const libelle = CHAMPS_SUCCESSION[champ] || champ;
    if (valeur === undefined || valeur === '') return `${libelle} : effacé`;
    if (valeur === true) return `${libelle} : oui`;
    if (valeur === false) return `${libelle} : non`;
    if (champ === 'type') return `${libelle} : ${typeSuccessionDef(valeur).libelle}`;
    if (/Le$/.test(champ)) return `${libelle} ${formatDateFr(valeur)}`;
    return `${libelle} : ${valeur === 'oui' ? 'oui' : valeur === 'non' ? 'non' : valeur}`;
  }

  // Pure sur le dossier passé : un acte coché garde la date du jour (les fonds se débloquent à partir d'elle) ; décoché, elle part.
  function dateEtapeSuccession(d, type, fait) {
    const champ = { notoriete: 'notorieteSigneeLe', declarationSuccession: 'declarationSigneeLe' }[type];
    if (!champ || !d) return;
    d.succession = Object.assign({}, d.succession);
    if (fait) { if (!d.succession[champ]) d.succession[champ] = isoAujourdhuiLocal(); } else delete d.succession[champ];
  }

  function changerSuccession(id, champ, valeur) {
    const d = dossiers.find(x => x.id === id);
    if (!d || !estSuccession(d) || !CHAMPS_SUCCESSION[champ]) return;
    let v;
    if (champ === 'actifSuperieurSeuil') v = !!valeur;
    else if (champ === 'conjointSurvivant') v = valeur === 'oui' ? true : (valeur === 'non' ? false : undefined);
    else v = String(valeur == null ? '' : valeur).trim();
    if (champ === 'type' && v && !TYPES_SUCCESSION.some(t => t.cle === v)) return;
    if (/Le$/.test(champ) && v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
    if (['donationEpoux', 'testament', 'droitsDus', 'inventaireNecessaire'].includes(champ) && !['', 'oui', 'non'].includes(v)) return;
    const avant = (d.succession || {})[champ];
    if (avant === v || ((v === '' || v === undefined) && (avant === undefined || avant === ''))) return;
    d.succession = Object.assign({}, d.succession);
    if (v === '' || v === undefined) delete d.succession[champ]; else d.succession[champ] = v;
    ajouterHistorique(d, texteHistoriqueSuccession(champ, v));
    sauvegarder(d);
    render();
  }

  // Le défunt : ce qui diffère d'Authentic est gardé sur la fiche (`d.defunt`, comme la Constitution de dossier) ; le reste suit Authentic.
  function changerDefuntFiche(id, champ, valeur) {
    const d = dossiers.find(x => x.id === id);
    if (!d || !estSuccession(d) || !CHAMPS_DEFUNT_FICHE.includes(champ)) return;
    const v = String(valeur == null ? '' : valeur).trim();
    const actuel = defuntConstitution(d).champs[champ] || '';
    if (v === String(actuel)) return;
    const base = defuntConstitution(Object.assign({}, d, { defunt: null })).champs;
    const saisi = Object.assign({}, d.defunt);
    if (v === String(base[champ] || '')) delete saisi[champ]; else saisi[champ] = v;
    if (Object.keys(saisi).length) d.defunt = saisi; else delete d.defunt;
    ajouterHistorique(d, `Défunt — ${champ === 'decesDate' ? 'date de décès' : champ === 'regime' ? 'régime matrimonial' : champ} : ${v ? (/Date$/.test(champ) ? formatDateFr(v) : v) : 'effacé'}`);
    sauvegarder(d);
    render();
  }

  // Pure : les personnes de la succession, rangées d'après la rubrique « Comparants » d'Authentic (étude 15/10 : qualité « Défunt » /
  // « Héritier ») → { heritiers, autres }. Un héritier comparant sans fiche sur le dossier est montré quand même (`comparant: true`) ;
  // `autres` = personnes du dossier qu'Authentic ne range pas parmi les comparants. Sans comparants relevés : toutes les parties
  // hors défunt sont les héritiers (comme avant).
  function personnesSuccession(d) {
    const df = defuntConstitution(d).champs;
    const nomDefunt = [df.prenoms, df.nom].filter(Boolean).join(' ');
    const comps = comparantsSuccession(d);
    const defComp = comps.find(c => c.role === 'DEFUNT');
    const estDefunt = (n) => (nomDefunt && (memePersonneParNom(n, nomDefunt) || memePersonneNommee(n, nomDefunt) || normaliserPourRecherche(n) === normaliserPourRecherche(nomDefunt)))
      || (defComp && memePersonneNommee(n, defComp.nom));
    const parties = (Array.isArray(d && d.parties) ? d.parties : []).filter(p => p && p.nom && !estDefunt(p.nom) && !(p.nomUsage && defComp && memePersonneNommee([p.nom, p.nomUsage].join(' '), defComp.nom)));
    const her = comps.filter(c => c.role === 'HERITIER');
    if (!her.length) return { heritiers: parties, autres: [] };
    const heritiers = [], vus = new Set();
    her.forEach(c => {
      const p = parties.find(x => !vus.has(x) && (memePersonneNommee(x.nom, c.nom) || (x.nomUsage && memePersonneNommee([x.nom, x.nomUsage].join(' '), c.nom))));
      const qualite = /^h[ée]riti/i.test(c.qualite || '') ? '' : (c.qualite || '');
      if (p) { vus.add(p); heritiers.push(Object.assign({}, p, { qualite, civilite: p.civilite || c.civilite || '' })); return; }
      const np = nomPrenomsComparant(c.nom);
      heritiers.push({ nom: [np.prenoms, np.nom].filter(Boolean).join(' ') || c.nom, civilite: c.civilite || '', qualite, comparant: true });
    });
    return { heritiers, autres: parties.filter(p => !vus.has(p)) };
  }

  // Pure : les lignes d'historique quand les comparants d'une succession changent dans Authentic → textes.
  function noterComparantsSuccession(avant, apres) {
    const cle = (l) => (Array.isArray(l) ? l : []).filter(c => c && (c.role === 'DEFUNT' || c.role === 'HERITIER')).map(c => c.role + ':' + c.nom).sort().join('|');
    if (cle(avant) === cle(apres)) return [];
    const l = (Array.isArray(apres) ? apres : []);
    const def = l.find(c => c.role === 'DEFUNT');
    const her = l.filter(c => c.role === 'HERITIER');
    if (!def && !her.length) return [];
    return [`Comparants lus dans Authentic : ${def ? 'défunt ' + def.nom : 'défunt non indiqué'}${her.length ? ` ; ${her.length} héritier${her.length > 1 ? 's' : ''} (${her.map(c => c.nom).join(', ')})` : ''}`];
  }

  // Pure : l'état civil d'une personne d'après sa fiche client d'Authentic, en une ligne (naissance, nationalité, profession, domicile,
  // situation matrimoniale) — '' sans fiche lue.
  function etatCivilFicheSuccession(f) {
    if (!f) return '';
    const naissance = [f.dateNaissance ? 'né(e) le ' + formatDateFr(f.dateNaissance) : '', f.lieuNaissance ? 'à ' + f.lieuNaissance : '', f.paysNaissance && !/^france$/i.test(f.paysNaissance) ? '(' + f.paysNaissance + ')' : ''].filter(Boolean).join(' ');
    return [naissance, f.nationalite, f.profession, f.domicile ? 'domicile : ' + normaliserAdresse(f.domicile) : '', f.situationMatrimoniale ? libelleSituationMatrimoniale(f.situationMatrimoniale) : '']
      .filter(Boolean).join(' · ');
  }

  // Pure : un bien d'Authentic en une ligne de détail (type, désignation, parcelles avec nature et surface, lots).
  function detailBienSuccession(im) {
    if (!im) return '';
    const parcelles = (im.parcelles || []).map(p => [[p.prefixe, p.section, p.numero].filter(Boolean).join(' '), p.lieuDit, p.nature, p.surface ? contenanceEcrite(p.surface) : ''].filter(Boolean).join(' '));
    const lots = (im.lots || []).map(l => 'lot ' + l.numero + (l.type ? ' ' + l.type : ''));
    return [im.type, im.description, parcelles.join(' ; '), lots.join(', ')].filter(Boolean).join(' · ');
  }

  // Pure : l'état d'un acte en pastille { texte, dl }.
  function pastilleActeSuccession(a) {
    if (a.etat === 'signe') return { texte: a.signeLe ? `Signé le ${formatDateFr(a.signeLe)}` : 'Signé', dl: 'dl-success' };
    if (a.etat === 'redaction') return { texte: 'En cours de rédaction', dl: 'dl-acte' };
    if (a.etat === 'a_rediger') return { texte: 'Non rédigé', dl: 'dl-neutre' };
    return { texte: 'À préparer', dl: 'dl-neutre' };
  }

  // L'onglet Dossier d'une succession. `ligne`, `responsable`, `nas` : les briques de renderProprietesDossier (client/23).
  function renderDossierSuccession(d, ligne, responsable, nas) {
    const idJs = escapeOnclickArg(d.id);
    const s = infoSuccession(d);
    const df = defuntConstitution(d);
    const c = df.champs;
    const choixOuiNon = (champ, valeur, aria) => `<select class="prop-champ" aria-label="${escapeAttr(aria)}" onchange="changerSuccession('${idJs}', '${champ}', this.value)">${REPONSES_SUCCESSION.map(([v, l]) => `<option value="${v}"${(valeur || '') === v ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
    const date = (champ, valeur, aria, fonction) => `<input type="date" class="prop-champ" value="${escapeAttr(valeur || '')}" aria-label="${escapeAttr(aria)}" onchange="${fonction}('${idJs}', '${champ}', this.value)">`;
    const texte = (champ, valeur, placeholder, aria) => `<input type="text" class="prop-champ" value="${escapeAttr(valeur || '')}" placeholder="${escapeAttr(placeholder)}" aria-label="${escapeAttr(aria)}" onblur="changerDefuntFiche('${idJs}', '${champ}', this.value)" onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}">`;

    // Le dossier : type de succession (proposé par CLAIRE), actes, rendez-vous d'ouverture.
    const propose = typeSuccessionPropose(d);
    const type = typeSuccession(d);
    const selectType = `<select class="prop-champ" aria-label="Type de succession" onchange="changerSuccession('${idJs}', 'type', this.value)">${TYPES_SUCCESSION.map(t => `<option value="${t.cle}"${t.cle === type ? ' selected' : ''}>${escapeHtml(t.libelle)}${t.cle === propose ? ' (proposé)' : ''}</option>`).join('')}</select>`;
    const immobilier = successionAvecImmobilier(d);
    const actif = immobilier ? '' : `<label class="cst-actif"><input type="checkbox"${s.actifSuperieurSeuil ? ' checked' : ''} onchange="changerSuccession('${idJs}', 'actifSuperieurSeuil', this.checked)"> Actif de plus de 50 000 €</label>`;
    const actes = actesSuccession(d).map(a => {
      const p = pastilleActeSuccession(a);
      return `<span class="succ-acte"><span class="prop-texte">${escapeHtml(a.libelle)}</span> <span class="dot-label ${p.dl}"><span class="dot"></span>${escapeHtml(p.texte)}</span>${a.base ? '' : ' <span class="hint">(Authentic)</span>'}</span>`;
    }).join('');
    const attentes = attentesNotoriete(d);

    // Le défunt.
    const civilite = `<select class="prop-champ succ-civilite" aria-label="Civilité du défunt" onchange="changerDefuntFiche('${idJs}', 'civilite', this.value)">${['Madame', 'Monsieur'].map(v => `<option${c.civilite === v ? ' selected' : ''}>${v}</option>`).join('')}</select>`;
    const lien = `<select class="prop-champ succ-civilite" aria-label="Lien avec le conjoint" onchange="changerDefuntFiche('${idJs}', 'conjointLien', this.value)">${['', 'Veuve de', 'Veuf de', 'Épouse de', 'Époux de', 'Divorcée de', 'Divorcé de'].map(v => `<option value="${escapeAttr(v)}"${c.conjointLien === v ? ' selected' : ''}>${v || '—'}</option>`).join('')}</select>`;
    const conjoint = conjointSurvivant(d);
    const { heritiers, autres } = personnesSuccession(d);
    const compsLus = comparantsSuccession(d).length > 0;
    const coordonnees = (p) => [...(p.telephones || []), ...(p.emails || [])].map(escapeHtml).join(' · ');
    const etatCivil = (nom) => { const t = etatCivilFicheSuccession(ficheClientPourPersonneConstitution(d, nom)); return t ? `<span class="succ-etat-civil hint">${escapeHtml(t)}</span>` : ''; };
    const nomDefunt = [c.prenoms, c.nom].filter(Boolean).join(' ');
    const ficheDefunt = nomDefunt ? ficheClientPourPersonneConstitution(d, nomDefunt) : null;
    const immeubles = (d.authentic && d.authentic.immeubles) || [];
    const biens = immeubles.length ? immeubles.map(im => ({ adresse: im.adresse, detail: detailBienSuccession(im) }))
      : (Array.isArray(d.biens) ? d.biens : []).map(b => ({ adresse: b.adresse, detail: [b.type, Array.isArray(b.parcelles) ? b.parcelles.map(p => p && [p.prefixe, p.section, p.numero].filter(Boolean).join(' ')).filter(Boolean).join(', ') : b.parcelles].filter(Boolean).join(' · ') }));

    // Présentation façon Authentic (étude 17/10) : à gauche le défunt, les héritiers et les biens — fiches uniques, avec les autres dossiers
    // où chacun figure —, à droite le dossier, le contrôle à 2 mois et le FCDDV.
    return `<div class="fiche-proprietes-bloc">
      <div class="fiche-dossier-colonnes">
        <div class="fiche-dossier-gauche">
          ${renderCartesClientsBiensDossier(d)}
      ${df.avertissements.map(a => `<p class="cst-alerte">${escapeHtml(a)}</p>`).join('')}
          <details class="pb-modifier"${modifPartiesOuverts.has(d.id) ? ' open' : ''} ontoggle="basculerModifierPartiesFiche('${idJs}', this.open)">
            <summary>${icone('pencil')}Modifier le défunt, les héritiers et les biens</summary>
      <div class="section-eyebrow fiche-sous-titre">Le défunt ${df.source ? `<span class="hint">· ${escapeHtml(df.source)}</span>` : ''}</div>
      <dl class="fiche-proprietes">
        ${ligne('user', 'Défunt', `<span class="succ-identite">${civilite}${texte('prenoms', c.prenoms, 'Prénoms', 'Prénoms du défunt')}${texte('nom', c.nom, 'NOM', 'Nom du défunt')}</span>`, null, 'prop-pleine')}
        ${ligne('calendar', 'Décès', `<span class="succ-identite">${date('decesDate', c.decesDate, 'Date du décès', 'changerDefuntFiche')}${texte('decesLieu', c.decesLieu, 'Lieu du décès', 'Lieu du décès')}</span>`, null, 'prop-pleine')}
        ${ligne('home', 'Domicile', texte('domicile', c.domicile, 'COMMUNE (CP), voie', 'Domicile du défunt'), null, 'prop-pleine')}
        ${ligne('calendar', 'Naissance', `<span class="succ-identite">${date('naissanceDate', c.naissanceDate, 'Date de naissance du défunt', 'changerDefuntFiche')}${texte('naissanceLieu', c.naissanceLieu, 'Lieu de naissance', 'Lieu de naissance du défunt')}</span>`, null, 'prop-pleine')}
        ${ficheDefunt && (ficheDefunt.nationalite || ficheDefunt.profession) ? ligne('user', 'Autres', `<span class="hint">${escapeHtml([ficheDefunt.nationalite, ficheDefunt.profession].filter(Boolean).join(' · '))}</span>`, null, 'prop-pleine') : ''}
        ${ligne('key', 'Régime', texte('regime', c.regime, 'Régime matrimonial (communauté légale…)', 'Régime matrimonial du défunt'), null, 'prop-pleine')}
        ${ligne('users', 'Conjoint', `<span class="succ-identite">${lien}${texte('conjointNom', c.conjointNom, 'Monsieur Prénom NOM', 'Conjoint du défunt')}</span>`, null, 'prop-pleine')}
        ${ligne('users', 'Survivant', `<select class="prop-champ" aria-label="Conjoint survivant" onchange="changerSuccession('${idJs}', 'conjointSurvivant', this.value)">${[['', `Déduit : ${conjoint ? 'oui' : 'non'}`], ['oui', 'Oui'], ['non', 'Non']].map(([v, l]) => `<option value="${v}"${(s.conjointSurvivant === true ? 'oui' : s.conjointSurvivant === false ? 'non' : '') === v ? ' selected' : ''}>${l}</option>`).join('')}</select> ${infoBulle('Avec un conjoint survivant, les fonds ne sont pas débloqués : les comptes sont transférés à son profit.')}`, null)}
        ${ligne('file-text', 'Donation époux', choixOuiNon('donationEpoux', s.donationEpoux, 'Donation entre époux'), null)}
        ${ligne('file-text', 'Testament', choixOuiNon('testament', s.testament, 'Testament'), null)}
      </dl>
      <div class="section-eyebrow fiche-sous-titre">Héritiers <span class="hint">· ${heritiers.length}${compsLus ? ' · d’après les comparants d’Authentic' : ''}</span>${compsLus ? '' : ' ' + infoBulle('Les comparants de la page du dossier d’Authentic (qualité « Défunt » / « Héritier ») ne sont pas encore lus : ouvrez la page du dossier dans Authentic. En attendant, toutes les personnes du dossier sauf le défunt sont montrées.')}</div>
      <dl class="fiche-proprietes fiche-coordonnees">
        ${heritiers.length ? heritiers.map((p, i) => ligne(i ? 'users' : 'user', i ? '' : 'Héritiers', `<span class="succ-personne"><span class="prop-texte">${escapeHtml(p.nom)}${p.nomUsage ? ` <span class="hint">(${escapeHtml(p.nomUsage)})</span>` : ''}${p.qualite ? ` <span class="dot-label dl-neutre"><span class="dot"></span>${escapeHtml(p.qualite)}</span>` : ''}</span>${coordonnees(p) ? ` <span class="hint">${coordonnees(p)}</span>` : ''}${p.comparant ? '<span class="succ-etat-civil hint">Fiche client pas encore lue dans Authentic</span>' : etatCivil(p.nom)}</span>`, null, 'prop-pleine')).join('')
          : ligne('users', 'Héritiers', '<span class="prop-texte vide">Aucun — ouvrez la page du dossier dans Authentic</span>', null, 'prop-pleine')}
        ${autres.length ? ligne('users', 'Autres', `<span class="succ-personne"><span class="prop-texte">${autres.map(p => escapeHtml(p.nom)).join(', ')}</span><span class="hint">Ni défunt ni héritier dans les comparants d’Authentic</span></span>`, null, 'prop-pleine') : ''}
      </dl>
      <dl class="fiche-proprietes">
        ${biens.length ? biens.map((b, i) => ligne('map-pin', i ? '' : (biens.length > 1 ? 'Biens' : 'Bien'), `<span class="succ-personne"><span class="prop-texte">${escapeHtml(b.adresse || 'Adresse non relevée')}</span>${b.detail ? `<span class="hint">${escapeHtml(b.detail)}</span>` : ''}</span>`, null, 'prop-pleine')).join('')
          : ligne('map-pin', 'Bien', `<span class="prop-texte vide">${immobilier ? 'Bien immobilier noté' : 'Aucun bien immobilier relevé'}</span>`, null, 'prop-pleine')}
      </dl>
                  </details>
        </div>
        <div class="fiche-dossier-droite">
      <dl class="fiche-proprietes">
        ${ligne('user', 'Responsable', responsable, null)}
        ${ligne('calendar', 'Ouverture', date('ouvertureLe', s.ouvertureLe, 'Rendez-vous d’ouverture avec Sophie', 'changerSuccession') + ' <span class="hint">avec Sophie, en rendez-vous</span>', null)}
        ${ligne('clock', 'Rendez-vous', ligneRendezVousSuccessionFiche(d), null, 'prop-pleine')}
        ${ligne('file-text', 'Type', selectType + actif, null, 'prop-pleine')}
        ${ligne('list-check', 'Actes', `<span class="succ-actes">${actes}</span>`, null, 'prop-pleine')}
        ${attentes.length && !acteSigneSuccession(d, 'notoriete').fait ? ligne('clock', 'Notoriété', `<span class="hint">À réunir avant de la rédiger : ${escapeHtml(attentes.join(', '))}</span>`, null, 'prop-pleine') : ''}
        ${ligne('folder', 'Dossier NAS', nas, null, 'prop-pleine')}
        ${d.archive ? '' : ligne('mail', 'Courriers', `<wa-button appearance="outlined" size="s" pill type="button" class="action-rapide" onclick="ouvrirConstitutionDepuisFiche('${idJs}')" title="Courriers d’interrogation (banque, assurance-vie, impôts, caisses, EHPAD…) : en papier, ou envoyés par email depuis CLAIRE">Préparer et envoyer</wa-button>`, null, 'prop-pleine')}
      </dl>
      <div class="section-eyebrow fiche-sous-titre">Contrôle à 2 mois ${infoBulle('Deux mois après l’ouverture : vérifier si des droits de succession sont dus et si un inventaire est nécessaire, puis cocher l’étape.')}</div>
      <dl class="fiche-proprietes">
        ${ligne('banknote', 'Droits dus', choixOuiNon('droitsDus', s.droitsDus, 'Droits de succession dus'), null)}
        ${ligne('list-check', 'Inventaire', choixOuiNon('inventaireNecessaire', s.inventaireNecessaire, 'Inventaire nécessaire'), null)}
        ${ligne('scale', 'Forfait mobilier', ligneArbitrageFiche(d), null, 'prop-pleine')}
      </dl>
      ${renderFcddvSuccession(d)}
          ${renderTiroirAuthenticFiche(d)}
        </div>
      </div>
    </div>`;
  }

  // Pure : les cartes du Tableau d'une succession (à la place du planning d'une vente). `ajouter(colonne, carte)` : celui de
  // cartesTableauFiche (client/57).
  function cartesEtapesSuccessionFiche(d, aujourdhuiIso, ajouter) {
    const idJs = escapeOnclickArg(d.id);
    const attentes = attentesNotoriete(d);
    const s = infoSuccession(d);
    etapesSuccession(d, aujourdhuiIso).forEach(e => {
      const cochable = !e.authentic && !(e.type === 'ouvertureSuccession' && e.iso)
        && !((e.type === 'notoriete' || e.type === 'declarationSuccession' || e.avantRdv) && e.fait && !(d.echeancesValidees || {})[e.type]);
      const coche = cochable ? { onclick: `basculerEcheance('${idJs}', '${escapeOnclickArg(e.type)}')`, libelle: e.fait ? 'Rouvrir' : 'Marquer fait' } : null;
      const champDate = e.type === 'ouvertureSuccession' ? 'ouvertureLe' : (e.fait && e.type === 'notoriete' ? 'notorieteSigneeLe' : (e.fait && e.type === 'declarationSuccession' ? 'declarationSigneeLe' : ''));
      const date = champDate && !e.authentic ? { cle: 'succession:' + champDate, iso: s[champDate] || '', supprimable: !!s[champDate], envoi: false } : null;
      const base = { cle: 'succession:' + e.type, titre: e.label, iso: e.iso || '', sous: e.iso ? formatDateFr(e.iso) : '', categorie: 'succession', coche, date };
      // Agenda relié à la fiche (étude 15/10) : le rendez-vous de l'étape se place d'ici, prérempli.
      if (rdvAgendaSuccession(d, e.type, aujourdhuiIso)) base.bouton = { onclick: `placerRdvSuccessionAgenda('${idJs}', '${escapeOnclickArg(e.type)}')`, titre: 'Ouvrir l’agenda sur ce rendez-vous, prérempli', icone: icone('calendar'), libelle: 'Placer dans l’agenda' };
      // Arbitrage du forfait mobilier relié au contrôle à 2 mois (étude 15/10).
      if (e.type === 'controleDroits' && !e.fait) base.bouton = { onclick: `ouvrirArbitrageDepuisFiche('${idJs}')`, titre: 'Comparer le forfait mobilier de 5 % au coût d’un inventaire avec prisée', icone: icone('scale'), libelle: s.arbitrage ? 'Revoir l’arbitrage' : 'Arbitrage forfait mobilier' };
      if (e.fait) { ajouter('fait', Object.assign(base, { fait: true, auto: !cochable })); return; }
      if (e.type === 'ouvertureSuccession' && !e.iso) { ajouter('faire', Object.assign(base, { titre: 'Fixer le rendez-vous d’ouverture avec Sophie', sous: 'Les délais d’1 et 2 mois partent de lui (6 mois : depuis le décès)' })); return; }
      if (!e.active) { ajouter('attente', Object.assign(base, { iso: '', sous: e.type === 'receptionFonds' ? 'Après le déblocage des fonds' : 'Après l’acte de notoriété' })); return; }
      // Date butoir (étude 15/10) : confirmée par le rendez-vous placé dans l'agenda.
      if (e.butoir) base.sous = (e.fenetreDebut ? `Entre le ${formatDateFr(e.fenetreDebut)} et le ${formatDateFr(e.iso)} — date butoir, à confirmer par le rendez-vous` : 'Date butoir — à confirmer par le rendez-vous')
        + (e.depuisDeces ? ' (6 mois après le décès)' : (e.type === 'declarationSuccession' || e.fenetreDebut ? ' (date du décès inconnue : comptée depuis l’ouverture)' : ''));
      else if (e.rdvPlace) base.sous = 'Rendez-vous placé';
      if (e.type === 'notoriete' && attentes.length) base.sous = [base.sous, 'À réunir : ' + attentes.join(', ')].filter(Boolean).join(' · ');
      // Décompte et appel de fonds : 10 jours avant le dernier rendez-vous (étude 16/10).
      if (e.avantRdv && !e.iso) base.sous = '10 jours avant le dernier rendez-vous, une fois placé';
      const attenteRdv = e.avantRdv && !e.iso;
      if (e.type === 'appelFondsSuccession') {
        base.sous = [base.sous, conjointSurvivant(d) ? 'Comptes transférés au conjoint survivant : l’étude ne reçoit aucun fonds' : 'Si la comptabilité ne couvre pas nos frais'].filter(Boolean).join(' · ');
        base.bouton = { onclick: `marquerAppelFondsSuccessionInutile('${idJs}', true)`, titre: 'Les fonds en comptabilité suffisent : pas d’appel de fonds dans ce dossier', icone: icone('x'), libelle: 'Pas nécessaire' };
      }
      if (e.type === 'controleDroits') base.sous = [s.droitsDus ? `droits dus : ${s.droitsDus}` : 'droits à vérifier', s.inventaireNecessaire ? `inventaire : ${s.inventaireNecessaire}` : 'inventaire à vérifier'].join(' · ');
      // Décompte et appel de fonds sans rendez-vous placé : en attente, pas « à faire » pendant des mois (relecture 16/10).
      ajouter(e.attente || attenteRdv ? 'attente' : 'faire', base);
    });
    // Appel de fonds dit « pas nécessaire » : une carte discrète pour le rétablir.
    const dernierActe = etapesSuccession(d, aujourdhuiIso).filter(x => x.type === 'notoriete' || x.type === 'declarationSuccession').pop();
    if (s.appelFondsInutile === true && !(dernierActe && dernierActe.fait)) {
      ajouter('fait', { cle: 'succession:appelFondsInutile', titre: 'Appel de fonds — pas nécessaire', iso: '', sous: 'Fonds suffisants en comptabilité', categorie: 'succession', fait: true, auto: true,
        bouton: { onclick: `marquerAppelFondsSuccessionInutile('${idJs}', false)`, titre: 'Prévoir de nouveau un appel de fonds avant le dernier rendez-vous', icone: icone('rotate-ccw'), libelle: 'Rétablir' } });
    }
    cartesFacturesSuccessionFiche(d, ajouter);
  }

  // « Pas nécessaire » / « Rétablir » de l'appel de fonds d'une succession (étude 16/10 : « parfois » seulement).
  function marquerAppelFondsSuccessionInutile(dossierId, inutile) {
    const d = dossiers.find(x => x.id === dossierId);
    if (!d || !estSuccession(d)) return;
    d.succession = Object.assign({}, d.succession, { appelFondsInutile: inutile === true });
    ajouterHistorique(d, inutile ? 'Appel de fonds : pas nécessaire (fonds suffisants en comptabilité)' : 'Appel de fonds de nouveau prévu avant le dernier rendez-vous');
    sauvegarder(d);
    render();
  }

  // Pure : les alertes d'une succession pour la carte « Alertes importantes » (étude 16/10) — un acte dont la date butoir approche sans
  // rendez-vous placé, le décompte (et l'appel de fonds) à envoyer avant le dernier rendez-vous. → [{ gravite, titre, detail, jours }].
  function alertesSuccession(d, aujourdhuiIso) {
    const r = [];
    const court = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
    etapesSuccession(d, aujourdhuiIso).forEach(e => {
      if (e.fait || !e.active || !e.iso) return;
      const j = ecartJours(aujourdhuiIso, e.iso);
      if (j === null) return;
      if (e.butoir && j <= 15) r.push({ gravite: j <= 5 ? 'critique' : 'vigilance', titre: 'Placer le rendez-vous', detail: `${e.label} · date butoir le ${court(e.iso)}${j < 0 ? ' (dépassée)' : ''}`, jours: j });
      else if (e.avantRdv && j <= 3) r.push({ gravite: j <= 0 ? 'critique' : 'vigilance', titre: e.type === 'appelFondsSuccession' ? 'Envoyer l’appel de fonds' : 'Envoyer le décompte à faire valider', detail: `Avant le rendez-vous · le ${court(e.iso)}${j < 0 ? ' (en retard)' : ''}`, jours: j });
    });
    return r;
  }

  // Pure : la carte « signature » du bandeau d'une succession — le prochain acte à signer.
  function signatureBandeauSuccession(d, aujourdhuiIso) {
    const actes = etapesSuccession(d, aujourdhuiIso).filter(e => e.type === 'notoriete' || e.type === 'declarationSuccession' || e.authentic);
    const prochain = actes.find(e => !e.fait);
    if (!prochain) return { etat: 'signe', iso: '', jours: null, heure: '', texte: 'Actes signés', proba: null, eyebrow: 'Actes' };
    const rdv = String(d.rendezVousSignature || '').slice(0, 10);
    if (rdv && rdv >= String(aujourdhuiIso || '').slice(0, 10)) {
      return { etat: 'placee', iso: rdv, jours: ecartJours(aujourdhuiIso, rdv), heure: d.rendezVousSignatureHeure || '', texte: '', proba: null, eyebrow: prochain.label };
    }
    return { etat: 'aplacer', iso: prochain.iso || '', debut: prochain.fenetreDebut || '', jours: null, heure: '', texte: '', proba: null, eyebrow: 'Prochain acte', acte: prochain.label };
  }

  // ---- FCDDV (étude 15/10 : « que CLAIRE lise le FCDDV pour voir s'il y a des inscriptions et chez quel notaire, et pouvoir envoyer
  // un email au confrère pour lui demander la nature de l'acte et le coût de son acte ; parfois il peut y avoir différents notaires ») ----
  // La réponse du fichier central (PDF du dossier du NAS, pièce `fcddv`) est lue sur le poste ; ce qui est trouvé est gardé sur la
  // fiche (`d.succession.fcddv` : { luLe, fichier, aucune, inscriptions: [{ nature, date, notaire, ville, crpcen, email, demandeLe }] }),
  // se corrige à la main, et chaque notaire dépositaire reçoit, sur un clic, un email (premier jet de CLAIRE) via la fenêtre d'email.

  var RE_NATURE_FCDDV = /(testament(?:\s+(?:olographe|authentique|mystique|international|par\s+acte\s+public))?|donation\s+entre\s+[ée]poux|donation\s+au\s+dernier\s+vivant|institution\s+contractuelle|r[ée]vocation(?:\s+de\s+(?:testament|donation))?|codicille)/gi;
  var RE_NOTAIRE_FCDDV = /(?:Ma[îi]tre|Me|M[eE]\.)\s+((?:[A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]+\s+){0,3}[A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]+)/;

  // Pure : ce que dit une réponse du FCDDV — { aucune, inscriptions: [{ nature, date, notaire, ville, crpcen }] }. Chaque inscription
  // commence à sa nature (testament, donation entre époux…) ; le notaire dépositaire, la date, le CRPCEN et la ville sont cherchés
  // dans la suite, jusqu'à la nature suivante. L'en-tête (notre office, demandeur) précède la première nature : jamais pris.
  function analyseFcddv(texte) {
    const plat = String(texte || '').replace(/\s+/g, ' ').trim();
    const aucuneEcrite = /aucune\s+(?:disposition|inscription|testament)|n[ée]ant|r[ée]ponse\s+n[ée]gative|pas\s+d['’]\s*inscription|n['’]\s*(?:a|ont)\s+(?:été\s+)?(?:trouv|relev|enregistr)/i.test(plat);
    const debuts = [];
    let m;
    RE_NATURE_FCDDV.lastIndex = 0;
    while ((m = RE_NATURE_FCDDV.exec(plat))) debuts.push({ index: m.index, nature: m[1] });
    const inscriptions = [];
    debuts.forEach((dbt, i) => {
      const segment = plat.slice(dbt.index, i + 1 < debuts.length ? debuts[i + 1].index : dbt.index + 600);
      const n = RE_NOTAIRE_FCDDV.exec(segment);
      if (!n) return;
      const notaire = n[1].replace(/\s+(?:notaire|à|a|au|en|office|CRPCEN).*$/i, '').trim();
      if (/gossart/i.test(notaire)) return;
      const date = /(\d{1,2}[\/.]\d{1,2}[\/.]\d{4})/.exec(segment);
      const crpcen = /crpcen\s*(?:n°|:)?\s*(\d{5})/i.exec(segment);
      const ville = /(?:^|[^\d])\d{5}\s+([A-ZÀ-Ý][A-ZÀ-Ý'’ -]{2,40}?)(?=\s+(?:CRPCEN|T[ée]l|Date|Nature|$)|[,.;]|$)/.exec(segment.slice(n.index));
      const nature = dbt.nature.replace(/\s+/g, ' ');
      const ins = { nature: nature.charAt(0).toUpperCase() + nature.slice(1).toLowerCase(), date: date ? dateIsoDepuisFr(date[1]) || '' : '', notaire, ville: ville ? ville[1].trim() : '', crpcen: crpcen ? crpcen[1] : '' };
      if (!inscriptions.some(x => x.nature === ins.nature && x.notaire === ins.notaire && x.date === ins.date)) inscriptions.push(ins);
    });
    return { aucune: !inscriptions.length && aucuneEcrite, inscriptions };
  }

  // Pure : l'email de l'office d'un notaire dépositaire — l'annuaire (nom, ville), sinon le CRPCEN dans l'adresse (« ….41001@notaires.fr »).
  function emailNotaireFcddv(ins, carnet) {
    if (!ins || !Array.isArray(carnet) || !carnet.length) return '';
    const t = ins.notaire ? notaireAnnuaireLePlusProche(`Maître ${ins.notaire}${ins.ville ? ` (${ins.ville})` : ''}`, carnet) : null;
    if (t && t.office && t.office.email) return t.office.email;
    if (ins.crpcen) {
      const o = carnet.find(x => x && x.email && new RegExp('[.\\-_]' + ins.crpcen + '@').test(x.email));
      if (o) return o.email;
    }
    return '';
  }

  // Pure : les inscriptions regroupées par notaire dépositaire (un email par confrère) — [{ cle, notaire, ville, email, inscriptions }].
  function confreresFcddv(fcddv) {
    const groupes = [];
    ((fcddv && fcddv.inscriptions) || []).forEach((ins, index) => {
      const cle = normaliserPourRecherche(ins.notaire || '').replace(/[^a-z0-9]+/g, ' ').trim() || ('n' + index);
      let g = groupes.find(x => x.cle === cle);
      if (!g) { g = { cle, notaire: ins.notaire, ville: ins.ville || '', email: ins.email || '', inscriptions: [] }; groupes.push(g); }
      if (!g.email && ins.email) g.email = ins.email;
      g.inscriptions.push(Object.assign({ index }, ins));
    });
    return groupes;
  }

  // Pure : l'email au confrère (premier jet de CLAIRE, à remplacer par le texte de l'étude) — { sujet, corps }. Sans formule d'appel ni
  // de politesse : la fenêtre d'email pose « Mon Cher Maître, » et « Votre bien dévoué. » (confrère).
  function emailConfrereFcddv(d, groupe) {
    const c = defuntConstitution(d).champs;
    const qui = [c.civilite, (c.prenoms || '').split(/\s+/)[0], c.nom].filter(Boolean).join(' ') || 'la personne décédée';
    const decede = /^madame/i.test(c.civilite || '') ? 'décédée' : 'décédé';
    const deces = c.decesDate ? `, ${decede} le ${dateCourrierSuccession(c.decesDate)}${c.decesLieu ? ' à ' + c.decesLieu : ''}` : '';
    const lignes = groupe.inscriptions.map(i => `- ${i.nature}${i.date ? ` du ${formatDateFr(i.date)}` : ''}`);
    const une = groupe.inscriptions.length === 1;
    const corps = [
      `Notre office est chargé du règlement de la succession de ${qui}${deces}.`,
      `L’interrogation du Fichier central des dispositions de dernières volontés révèle ${une ? 'l’inscription suivante' : 'les inscriptions suivantes'} en votre office :\n${lignes.join('\n')}`,
      `Pourriez-vous nous indiquer la nature exacte de ${une ? 'cet acte' : 'ces actes'} et le coût de ${une ? 'votre acte' : 'vos actes'} ?`,
      'Vous en remerciant par avance,'
    ].join('\n\n');
    return { sujet: `Succession de ${qui} — FCDDV${d.referenceAuthentic ? ' — Réf. ' + d.referenceAuthentic : ''}`, corps };
  }

  // Pose ce que la lecture a trouvé : testament / donation entre époux répondus quand la fiche ne dit encore rien. Pure sur `d`.
  function appliquerFcddvSurDossier(d, analyse, fichier, maintenantIso) {
    const s = Object.assign({}, d.succession);
    const anciennes = (s.fcddv && s.fcddv.inscriptions) || [];
    const carnet = typeof carnetConfreres !== 'undefined' ? carnetConfreres : [];
    const inscriptions = analyse.inscriptions.map(i => {
      const deja = anciennes.find(a => a.notaire === i.notaire && a.nature === i.nature && a.date === i.date);
      return Object.assign({}, i, { email: (deja && deja.email) || emailNotaireFcddv(i, carnet), demandeLe: (deja && deja.demandeLe) || '' });
    });
    // Les inscriptions ajoutées à la main restent.
    anciennes.filter(a => a.saisie).forEach(a => inscriptions.push(a));
    s.fcddv = { luLe: maintenantIso, fichier: fichier || '', aucune: analyse.aucune && !inscriptions.length, inscriptions };
    const textes = [];
    const testament = inscriptions.some(i => /testament|codicille/i.test(i.nature));
    const donation = inscriptions.some(i => /donation/i.test(i.nature));
    if (!s.testament && (testament || s.fcddv.aucune)) { s.testament = testament ? 'oui' : 'non'; textes.push(`testament : ${s.testament}`); }
    if (!s.donationEpoux && (donation || s.fcddv.aucune)) { s.donationEpoux = donation ? 'oui' : 'non'; textes.push(`donation entre époux : ${s.donationEpoux}`); }
    d.succession = s;
    return textes;
  }

  var lecturesFcddvEnCours = new Set();
  var lecturesFcddvFaites = new Set();

  // Lit la réponse du FCDDV trouvée sur le NAS. `silencieux` : à l'ouverture de la fiche, une fois par fichier et par session.
  async function lireFcddvDossier(dossierId, silencieux) {
    const d = dossiers.find(x => x.id === dossierId);
    if (!d || !estSuccession(d) || lecturesFcddvEnCours.has(dossierId)) return;
    const chemin = fichierTrouve(d, 'fcddv');
    if (!chemin) { if (!silencieux) afficherToast('Réponse du FCDDV pas encore trouvée dans le dossier du NAS (« FCDDV » dans le nom du fichier).'); return; }
    lecturesFcddvEnCours.add(dossierId);
    lecturesFcddvFaites.add(dossierId + '|' + chemin);
    render();
    try {
      const pdf = await ouvrirPdfNas(chemin);
      const { texte } = await lireTextePdfParPage(pdf);
      const analyse = analyseFcddv(texte);
      const actuel = dossiers.find(x => x.id === dossierId);
      if (!actuel) return;
      if (!analyse.aucune && !analyse.inscriptions.length) {
        noterVerificationPoste('fcddv-lu', { ok: false, detail: 'réponse sans inscription ni mention « aucune » reconnue' });
        if (!silencieux) afficherToast('FCDDV lu, mais rien de reconnu : saisissez les inscriptions à la main.');
        actuel.succession = Object.assign({}, actuel.succession, { fcddv: Object.assign({}, (actuel.succession || {}).fcddv, { luLe: new Date().toISOString(), fichier: chemin, illisible: true }) });
      } else {
        const reponses = appliquerFcddvSurDossier(actuel, analyse, chemin, new Date().toISOString());
        noterVerificationPoste('fcddv-lu', { detail: analyse.aucune ? 'aucune inscription' : `${analyse.inscriptions.length} inscription(s)` });
        ajouterHistorique(actuel, `FCDDV lu : ${analyse.aucune ? 'aucune inscription' : analyse.inscriptions.map(i => `${i.nature} chez Maître ${i.notaire}`).join(' ; ')}${reponses.length ? ` (${reponses.join(', ')})` : ''}`, { auto: silencieux });
        if (!silencieux) afficherToast(analyse.aucune ? 'FCDDV : aucune inscription.' : `FCDDV : ${analyse.inscriptions.length} inscription${analyse.inscriptions.length > 1 ? 's' : ''}.`);
      }
      await sauvegarder(actuel);
    } catch (e) {
      console.error('FCDDV illisible', e);
      if (!silencieux) afficherToast('Réponse du FCDDV illisible.');
    } finally {
      lecturesFcddvEnCours.delete(dossierId);
      render();
    }
  }

  // À l'ouverture de la fiche : la réponse trouvée sur le NAS et jamais lue (ou un autre fichier) est lue seule.
  function lireFcddvSiNouveau(d) {
    if (!d || !estSuccession(d) || d.archive) return;
    const chemin = fichierTrouve(d, 'fcddv');
    const f = (d.succession || {}).fcddv;
    if (!chemin || (f && f.fichier === chemin) || lecturesFcddvFaites.has(d.id + '|' + chemin)) return;
    lireFcddvDossier(d.id, true);
  }

  function modifierInscriptionFcddv(dossierId, index, champ, valeur) {
    const d = dossiers.find(x => x.id === dossierId);
    const f = d && d.succession && d.succession.fcddv;
    if (!f || !f.inscriptions[index] || !['nature', 'notaire', 'email', 'date'].includes(champ)) return;
    const v = String(valeur == null ? '' : valeur).trim();
    if (f.inscriptions[index][champ] === v) return;
    f.inscriptions[index][champ] = v;
    if (champ === 'notaire' && !f.inscriptions[index].email) f.inscriptions[index].email = emailNotaireFcddv(f.inscriptions[index], typeof carnetConfreres !== 'undefined' ? carnetConfreres : []);
    sauvegarder(d);
    render();
  }

  function ajouterInscriptionFcddv(dossierId) {
    const d = dossiers.find(x => x.id === dossierId);
    if (!d || !estSuccession(d)) return;
    const nature = String((document.getElementById('fcddv-nature-' + dossierId) || {}).value || '').trim();
    const notaire = String((document.getElementById('fcddv-notaire-' + dossierId) || {}).value || '').trim().replace(/^(?:Ma[îi]tre|Me)\s+/i, '');
    if (!notaire) { afficherToast('Nom du notaire dépositaire à saisir.'); return; }
    const s = Object.assign({}, d.succession);
    const f = Object.assign({ inscriptions: [] }, s.fcddv);
    const ins = { nature: nature || 'Testament', date: '', notaire, ville: '', crpcen: '', saisie: true, demandeLe: '' };
    ins.email = emailNotaireFcddv(ins, typeof carnetConfreres !== 'undefined' ? carnetConfreres : []);
    f.inscriptions = f.inscriptions.concat(ins);
    f.aucune = false;
    s.fcddv = f;
    d.succession = s;
    ajouterHistorique(d, `FCDDV : inscription ajoutée à la main — ${ins.nature} chez Maître ${notaire}`);
    sauvegarder(d);
    render();
  }

  function retirerInscriptionFcddv(dossierId, index) {
    const d = dossiers.find(x => x.id === dossierId);
    const f = d && d.succession && d.succession.fcddv;
    if (!f || !f.inscriptions[index]) return;
    const ins = f.inscriptions.splice(index, 1)[0];
    ajouterHistorique(d, `FCDDV : inscription retirée — ${ins.nature} chez Maître ${ins.notaire}`);
    sauvegarder(d);
    render();
  }

  // L'email au confrère dépositaire : la fenêtre d'email s'ouvre, rien ne part sans « Envoyer ».
  async function ecrireConfrereFcddv(dossierId, cleGroupe) {
    const d = dossiers.find(x => x.id === dossierId);
    const f = d && d.succession && d.succession.fcddv;
    const groupe = f ? confreresFcddv(f).find(g => g.cle === cleGroupe) : null;
    if (!groupe) return;
    if (!groupe.email) { afficherToast(`Adresse email de Maître ${groupe.notaire} à saisir (introuvable dans l’annuaire).`); return; }
    const { sujet, corps } = emailConfrereFcddv(d, groupe);
    const r = await livrerEmailDossier({ destinataire: groupe.email, sujet, corps, confrere: true, responsableSignature: d.responsable, dossierId: d.id, geste: 'fcddv' });
    if (r && r.ok) {
      const actuel = dossiers.find(x => x.id === dossierId);
      const fa = actuel && actuel.succession && actuel.succession.fcddv;
      if (fa) groupe.inscriptions.forEach(i => { if (fa.inscriptions[i.index]) fa.inscriptions[i.index].demandeLe = isoAujourdhuiLocal(); });
      ajouterHistorique(actuel, `FCDDV : email préparé pour Maître ${groupe.notaire} (nature et coût de l’acte)`);
      sauvegarder(actuel);
      render();
    }
  }

  // Le bloc « FCDDV » de l'onglet Dossier.
  function renderFcddvSuccession(d) {
    const idJs = escapeOnclickArg(d.id);
    const f = (d.succession || {}).fcddv;
    const chemin = fichierTrouve(d, 'fcddv');
    const enCours = lecturesFcddvEnCours.has(d.id);
    const bouton = chemin ? `<wa-button appearance="outlined" size="s" pill type="button" class="action-rapide" onclick="lireFcddvDossier('${idJs}', false)"${enCours ? ' disabled' : ''}>${enCours ? 'Lecture…' : (f && f.luLe ? 'Relire' : 'Lire la réponse')}</wa-button>` : '';
    let etat;
    if (!f || !f.luLe) etat = `<span class="prop-texte vide">${chemin ? 'Réponse trouvée sur le NAS, pas encore lue' : 'Réponse pas encore trouvée sur le NAS'}</span>`;
    else if (f.aucune) etat = `<span class="dot-label dl-success"><span class="dot"></span>Aucune inscription</span> <span class="hint">lu le ${escapeHtml(formatDateFr(String(f.luLe).slice(0, 10)))}</span>`;
    else if (f.illisible && !(f.inscriptions || []).length) etat = '<span class="dot-label dl-urgent"><span class="dot"></span>Rien de reconnu dans la réponse</span> <span class="hint">saisissez les inscriptions ci-dessous</span>';
    else etat = `<span class="dot-label dl-urgent"><span class="dot"></span>${f.inscriptions.length} inscription${f.inscriptions.length > 1 ? 's' : ''}</span> <span class="hint">lu le ${escapeHtml(formatDateFr(String(f.luLe).slice(0, 10)))}</span>`;
    const groupes = f ? confreresFcddv(f) : [];
    const lignes = groupes.map(g => {
      const cleJs = escapeOnclickArg(g.cle);
      const insc = g.inscriptions.map(i => `<li class="fcddv-insc"><span class="prop-texte">${escapeHtml(i.nature)}${i.date ? ` <span class="hint">du ${escapeHtml(formatDateFr(i.date))}</span>` : ''}</span>
          ${i.demandeLe ? `<span class="dot-label dl-success"><span class="dot"></span>Demandé le ${escapeHtml(formatDateFr(i.demandeLe))}</span>` : ''}
          <wa-button appearance="plain" size="s" type="button" class="bouton-icone" title="Retirer cette inscription" onclick="retirerInscriptionFcddv('${idJs}', ${Number(i.index)})">${icone('x')}</wa-button></li>`).join('');
      const premier = g.inscriptions[0];
      return `<div class="fcddv-notaire">
        <div class="fcddv-tete"><strong>Maître ${escapeHtml(g.notaire)}</strong>${g.ville ? ` <span class="hint">${escapeHtml(g.ville)}</span>` : ''}${premier.crpcen ? ` <span class="hint">· CRPCEN ${escapeHtml(premier.crpcen)}</span>` : ''}</div>
        <ul class="fcddv-liste">${insc}</ul>
        <div class="fcddv-email"><input type="email" class="prop-champ" value="${escapeAttr(g.email)}" placeholder="adresse@notaires.fr" aria-label="Email de Maître ${escapeAttr(g.notaire)}" onchange="modifierInscriptionFcddv('${idJs}', ${Number(premier.index)}, 'email', this.value)">
          <wa-button appearance="outlined" size="s" pill type="button" class="action-rapide" onclick="ecrireConfrereFcddv('${idJs}', '${cleJs}')" title="Demander au confrère la nature de l’acte et son coût (fenêtre d’email, rien ne part sans « Envoyer »)">${icone('mail')} Écrire au confrère</wa-button></div>
      </div>`;
    }).join('');
    const ajout = `<div class="fcddv-ajout"><select class="prop-champ" id="fcddv-nature-${escapeAttr(d.id)}" aria-label="Nature de l’inscription">${['Testament olographe', 'Testament authentique', 'Donation entre époux', 'Institution contractuelle', 'Révocation'].map(n => `<option>${n}</option>`).join('')}</select>
      <input type="text" class="prop-champ" id="fcddv-notaire-${escapeAttr(d.id)}" placeholder="Notaire dépositaire (Prénom NOM)" aria-label="Notaire dépositaire">
      <wa-button appearance="plain" size="s" type="button" class="bouton-discret" onclick="ajouterInscriptionFcddv('${idJs}')">+ Inscription</wa-button></div>`;
    return `<div class="section-eyebrow fiche-sous-titre">FCDDV ${infoBulle('Réponse du fichier central des dispositions de dernières volontés, lue dans le dossier du NAS : inscriptions (testament, donation entre époux…) et notaire dépositaire. Un email par confrère pour lui demander la nature de l’acte et son coût.')}</div>
      <div class="fcddv-bloc"><div class="fcddv-etat">${etat}${bouton}</div>${lignes}${ajout}</div>`;
  }

  // ---- Lecture d'Authentic propre aux successions (appelée par appliquerReleveSurDossierBrut, client/30) ----

  // Modifie d : la fiche bien d'une SUCCESSION (étude 15/10 : « tout vient d'Authentic ; stocker toutes les données sur le bien ») —
  // gardée entière parmi les immeubles du dossier (`d.authentic.immeubles` : adresse, type, désignation, parcelles avec nature, surface,
  // lieu-dit, commune, préfixe ; lots et tantièmes), fusionnée avec le même bien (même adresse ou une parcelle commune) ; la liste des
  // biens de la fiche (`d.biens`) suit. Aucune adresse « du dossier » à contredire : une succession a souvent plusieurs biens.
  function appliquerBienSuccession(d, bien, noter, resultat) {
    if (!bien) return resultat;
    const a = bien.adresse || {};
    const details = (p) => Object.assign({ section: String(p.section || '').toUpperCase(), numero: String(p.numero || '') },
      Object.fromEntries(['prefixe', 'commune', 'lieuDit', 'nature', 'surface', 'zone', 'spf', 'adresseCadastre'].filter(k => p[k]).map(k => [k, String(p[k]).slice(0, 60)])));
    const fiche = {
      adresse: a.texte ? normaliserAdresse(a.texte) : '', codePostal: a.codePostal || '', commune: a.commune || '',
      type: bien.type || '', description: String(bien.description || '').slice(0, 160),
      parcelles: (bien.parcelles || []).slice(0, 40).map(details)
    };
    if ((bien.lots || []).length) { fiche.lots = bien.lots.slice(0, 40); if (bien.tantiemesTotal != null) fiche.tantiemesTotal = bien.tantiemesTotal; }
    if ((bien.details || []).length) fiche.details = bien.details.slice(0, 30);
    const avant = d.authentic || {};
    const immeubles = (avant.immeubles || []).slice();
    const net = (t) => normaliserPourRecherche(t || '').replace(/[^a-z0-9]+/g, ' ').trim();
    const cles = (im) => new Set((im.parcelles || []).map(p => cleParcelle(p.section, p.numero)).filter(Boolean));
    const clesFiche = cles(fiche);
    const i = immeubles.findIndex(im => (fiche.adresse && net(im.adresse) === net(fiche.adresse)) || [...cles(im)].some(c => clesFiche.has(c)));
    let fusion = fiche;
    if (i >= 0) {
      const ancien = immeubles[i];
      const parcelles = (ancien.parcelles || []).map(p => Object.assign({}, p, (fiche.parcelles.find(q => cleParcelle(q.section, q.numero) === cleParcelle(p.section, p.numero)) || {})));
      fiche.parcelles.forEach(q => { if (!parcelles.some(p => cleParcelle(p.section, p.numero) === cleParcelle(q.section, q.numero))) parcelles.push(q); });
      fusion = Object.assign({}, ancien, Object.fromEntries(Object.entries(fiche).filter(([, v]) => v !== '' && v != null && !(Array.isArray(v) && !v.length))), { parcelles });
      if (JSON.stringify(fusion) === JSON.stringify(ancien)) return resultat;
      immeubles[i] = fusion;
    } else {
      if (!fiche.adresse && !fiche.parcelles.length && !(fiche.lots || []).length) return resultat;
      immeubles.push(fiche);
    }
    d.authentic = Object.assign({}, avant, { immeubles: immeubles.slice(0, 12) });
    // La liste affichée : un bien par immeuble, les biens notés autrement (anciens dossiers) gardés.
    const affiche = (im) => ({ adresse: im.adresse || '', type: im.type || '', parcelles: (im.parcelles || []).map(p => `${p.section} ${p.numero}`).join(', '), description: im.description || '' });
    const anciens = (Array.isArray(d.biens) ? d.biens : []).filter(b => !immeubles.some(im => (b.adresse && net(b.adresse) === net(im.adresse)) || (b.parcelles && (im.parcelles || []).some(p => net(b.parcelles).includes(net(p.section + ' ' + p.numero))))));
    d.biens = immeubles.map(affiche).concat(anciens).slice(0, 20);
    noter(`Bien relevé dans Authentic${i >= 0 ? ' (complété)' : ''} : ${fusion.adresse || fusion.parcelles.map(p => p.section + ' ' + p.numero).join(', ')}${fusion.type ? ' — ' + fusion.type : ''}`);
    resultat.modifie = true;
    return resultat;
  }

  // Mots d'un intitulé ou d'un nom de succession qui ne désignent personne (scoreDossierAuthentic, client/30).
  var MOTS_LIEN_SUCCESSION_AUTHENTIC = new Set(['succ', 'veuve', 'veuf', 'epouse', 'epoux', 'divorce', 'divorcee', 'nee', 'ne', 'autres', 'autre', 'feu', 'defunt', 'defunte']);
  // Pure : page d'une SUCCESSION d'Authentic ? Intitulé « Succession / SUCC NOM », sous-dossier « N - Succession … », ou intitulé
  // réel « N - Mme X veuve de M. Y » (le défunt en tête, structure reçue le 05/10) avec des comparants Défunt / Héritier — jamais
  // une page de vente, de promesse ou d'avenant.
  function pageSuccessionAuthentic(capture, intitule) {
    if (RE_INTITULE_SUCCESSION_AUTHENTIC.test(intitule || '')) return true;
    const sous = sousDossierAuthentic(capture);
    if (sous === 'succession') return true;
    if (sous === 'vente' || sous === 'promesse' || sous === 'avenant') return false;
    if (/^\s*(?:vte|vente)(?![a-z])/i.test(intitule || '')) return false;
    if (comparantsAuthentic(capture).some(c => c.role === 'DEFUNT' || c.role === 'HERITIER')) return true;
    // Étude 16/10 (« le lien renvoie vers un nouveau dossier de vente ») : une page qui ne dit pas « Succession » dans son en-tête —
    // fiche d'un héritier ou du défunt ouverte dans l'onglet du dossier, intitulé « N - Jeanne DURAND veuve MARTIN » — est aussi
    // celle d'une succession quand : le bandeau du dossier porte « A 2026 00247 SUCC … », ou l'intitulé (sans « / » : une vente nomme
    // toujours ses deux côtés) cite une veuve / un veuf, ou la fiche ouverte est celle d'une personne décédée.
    if (bandeauSuccessionAuthentic(capture)) return true;
    const sansCotes = !!intitule && !/\//.test(intitule);
    if (sansCotes && /(?:^|[^a-zà-ÿ])(?:veuve|veuf)(?![a-zà-ÿ])/i.test(intitule)) return true;
    // Le volet du conjoint mis à part (relecture 16/10 : la date de décès d'un mari ouvert dans la fiche de sa veuve).
    const fiche = (partagerFicheConjointAuthentic(capture) || {}).principale || capture;
    return sansCotes && !!decesFicheAuthentic((fiche && fiche.champs) || []);
  }

  // Pure : la PREMIÈRE personne de la rubrique « Comparants » de la page, quelle que soit sa qualité (étude 16/10 : le défunt est le
  // premier de la liste, recoupé avec le nom du dossier — `premierComparantDefunt` de commun/constitution.js) → { nom, civilite, lien?,
  // conjoint? } ou null.
  function premierComparantAuthentic(capture) {
    const { lignes } = lignesComparantsAuthentic(capture);
    for (const l0 of lignes.slice(0, 5)) {
      if (RE_FIN_COMPARANTS.test(l0)) return null;
      if (RE_QUALITE_COMPARANT.test(l0) || /^\(?\d+\)?$/.test(l0)) continue;
      const fin = new RegExp('^(.*\\S)\\s+(' + QUALITES_COMPARANT + ')$', 'i').exec(l0);
      const p = personneComparantSuccession((fin ? fin[1] : l0).split(/\s+et\s+/i)[0]);
      if (p) return p;
    }
    return null;
  }

  // Pure : le PREMIER bien de la rubrique « Immeubles (n) » de la page (étude 16/10 : « bien principal : le premier bien de la liste »)
  // — sa ligne d'adresse, sans « Immeuble propre / commun », '' sinon.
  function premierImmeubleAuthentic(capture) {
    const lignes = String((capture && capture.texte) || '').split(/\n+/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const debut = lignes.findIndex(l => /^immeubles?\s*\(\d+\)/i.test(l));
    if (debut < 0) return '';
    const l = lignes[debut + 1] || '';
    if (/^(?:tiers|documents?|parties|informations|comparants|notes?|formalit|immeuble\s+(?:propre|commun))/i.test(l)) return '';
    return l.replace(/\s+immeuble\s+(?:propre|commun)\s*$/i, '').trim().slice(0, 200);
  }

  // Pure : le bandeau du dossier dit-il « A 2026 00247 SUCC … » / « … Succession … » (référence suivie de SUCC) ? Onglets inactifs
  // retirés : un autre dossier ouvert ne compte pas.
  function bandeauSuccessionAuthentic(capture) {
    const c = capture || {};
    const re = new RegExp(RE_REFERENCE_AUTHENTIC.source + '[^\\S\\n]+(?:SUCC|Succession)\\.?(?![A-Za-zÀ-ÿ])', 'i');
    const actif = (Array.isArray(c.onglets) ? c.onglets : []).find(o => o && o.actif);
    if (actif && re.test(String(actif.titre || ''))) return true;
    return [texteSansOngletsInactifsAuthentic(c), ...(c.champs || []).map(ch => String(ch.libelle || '') + ' ' + String(ch.valeur || ''))].some(t => re.test(t));
  }

  // Pure : les actes d'une SUCCESSION relevés dans le tableau « Rédaction » de la page du dossier (étude 15/10 : « des actes peuvent
  // venir se rajouter, tu les auras dans le dossier Authentic : délivrance de legs, convention de quasi-usufruit ») —
  // [{ intitule, etat: 'a_rediger' | 'redaction' | 'signe' | '', signeLe }]. Ni courrier, ni demande, ni procuration.
  function actesSuccessionAuthentic(capture) {
    const actes = [];
    ((capture && capture.tableaux) || []).forEach(t => {
      const titre = [t.titre, ...(t.entete || [])].join(' ');
      if (!/r[ée]daction/i.test(titre)) return;
      (t.lignes || []).forEach(l => {
        const cellules = (l || []).map(x => String(x == null ? '' : x).replace(/\s+/g, ' ').trim()).filter(x => x && !/^⟦icône⟧/.test(x));
        const textes = cellules.filter(x => !/^\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4}$/.test(x));
        if (!textes.length) return;
        const intitule = textes[0];
        if (/courrier|e-?mail|lettre|demande|procuration|convocation|mandat/i.test(intitule) || actes.some(a => a.intitule === intitule)) return;
        const signe = cellules.map(x => RE_SIGNE_LE_AUTHENTIC.exec(x)).find(Boolean);
        const etatTexte = textes.length > 1 ? textes[textes.length - 1] : '';
        const etat = signe || /^sign[ée]/i.test(etatTexte) ? 'signe' : (/^en\s+cours/i.test(etatTexte) ? 'redaction' : (/^(?:non|pas\s+encore)\s+r[ée]dig/i.test(etatTexte) ? 'a_rediger' : ''));
        actes.push({ intitule, etat, signeLe: signe ? dateIsoDepuisFr(signe[1]) : '' });
      });
    });
    return actes;
  }

  // Pure : les courriers de CLÔTURE ou de TRANSFERT des comptes d'une succession, relevés dans les tableaux « Banque » / « Courrier » /
  // « Mails-courriers » de la page du dossier (étude 16/10 : « valider l'envoi de la clôture ou transfert des comptes à la banque en croisant
  // dans Authentic la création du courrier de clôture et l'e-mail d'envoi à la banque ») —
  // [{ intitule, date (création, AAAA-MM-JJ), etat, mailLe, nature: 'cloture' | 'transfert' }]. Le serveur les croise avec les emails envoyés.
  // Un courrier sur les COMPTES (ou à la banque) qui dit clôture, déblocage ou transfert (relecture 16/10 : ni « liquidation du régime
  // matrimonial », ni « transfert du dossier », ni la lettre d'interrogation « solde des comptes au jour du décès », ni « frais funéraires »).
  var RE_COURRIER_CLOTURE_SUCCESSION = /cl[ôo]tur|d[ée]blocage/i;
  var RE_COURRIER_TRANSFERT_SUCCESSION = /transfert|changement\s+de\s+titulaire/i;
  var RE_COURRIER_COMPTES_SUCCESSION = /comptes?|avoirs|banque|bancaire/i;
  var RE_COURRIER_PAS_CLOTURE_SUCCESSION = /dossier|r[ée]gime|interrogation|fun[ée]raire|acompte|au\s+jour\s+du\s+d[ée]c[èe]s/i;
  function courriersBanqueSuccessionAuthentic(capture) {
    const r = [];
    lignesDocumentsAuthentic(capture).forEach(l => {
      const titre = String(l.titre || '');
      if (!RE_COURRIER_COMPTES_SUCCESSION.test(titre) || RE_COURRIER_PAS_CLOTURE_SUCCESSION.test(titre)) return;
      const nature = RE_COURRIER_TRANSFERT_SUCCESSION.test(titre) ? 'transfert' : (RE_COURRIER_CLOTURE_SUCCESSION.test(titre) ? 'cloture' : '');
      if (!nature) return;
      const mail = /mail\s+le\s+(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4})/i.exec(l.texte || '');
      if (r.some(x => x.intitule === titre && x.date === l.date)) return;
      r.push({ intitule: titre.slice(0, 160), date: l.date || '', etat: String(l.etat || '').slice(0, 80), mailLe: mail ? dateIsoDepuisFr(mail[1]) : '', nature });
    });
    return r;
  }

  // Pure : les pièces d'une SUCCESSION reçues d'après Authentic (étude 15/10 : « acte de naissance et EHF sont validés si envoyés et
  // réceptionnés depuis Authentic ») — actes de naissance : toutes les demandes d'actes de naissance vues revenues « positif »
  // (Comedec) ; EHF : la réquisition hors formalité envoyée ET revenue. { actesNaissance: { recue, total, recus }, ehf: { recue, envoyeeLe, retourLe } }.
  function piecesSuccessionAuthentic(infos) {
    // Une demande par personne (même libellé = même acte, relevé deux fois).
    const parLibelle = new Map();
    Object.values((infos && infos.etatsCivils) || {}).filter(e => e && /naissance/i.test(e.label || '')).forEach(e => {
      const cle = normaliserPourRecherche(e.label).replace(/[^a-z0-9]+/g, ' ').trim();
      const deja = parLibelle.get(cle);
      if (!deja || e.etat === 'positif') parLibelle.set(cle, e);
    });
    const naissances = [...parLibelle.values()];
    const recus = naissances.filter(e => e.etat === 'positif').length;
    const rhf = (infos && infos.rhf) || {};
    return {
      actesNaissance: { recue: naissances.length > 0 && recus === naissances.length, total: naissances.length, recus },
      ehf: { recue: !!(rhf.envoyeeLe && rhf.retourLe), envoyeeLe: rhf.envoyeeLe || '', retourLe: rhf.retourLe || '' }
    };
  }

