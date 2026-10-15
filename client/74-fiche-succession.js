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

  // Pure : les héritiers — les parties de la succession, sans le défunt.
  function heritiersSuccession(d) {
    const df = defuntConstitution(d).champs;
    const nomDefunt = [df.prenoms, df.nom].filter(Boolean).join(' ');
    return (Array.isArray(d && d.parties) ? d.parties : []).filter(p => p && p.nom && !(nomDefunt && (memePersonneParNom(p.nom, nomDefunt) || normaliserPourRecherche(p.nom) === normaliserPourRecherche(nomDefunt))));
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
    const heritiers = heritiersSuccession(d);
    const coordonnees = (p) => [...(p.telephones || []), ...(p.emails || [])].map(escapeHtml).join(' · ');
    const biens = Array.isArray(d.biens) ? d.biens : [];

    return `<div class="fiche-proprietes-bloc">
      <dl class="fiche-proprietes">
        ${ligne('user', 'Responsable', responsable, null)}
        ${ligne('calendar', 'Ouverture', date('ouvertureLe', s.ouvertureLe, 'Rendez-vous d’ouverture avec Sophie', 'changerSuccession') + ' <span class="hint">avec Sophie, en rendez-vous</span>', null)}
        ${ligne('file-text', 'Type', selectType + actif, null, 'prop-pleine')}
        ${ligne('list-check', 'Actes', `<span class="succ-actes">${actes}</span>`, null, 'prop-pleine')}
        ${attentes.length && !acteSigneSuccession(d, 'notoriete').fait ? ligne('clock', 'Notoriété', `<span class="hint">À réunir avant de la rédiger : ${escapeHtml(attentes.join(', '))}</span>`, null, 'prop-pleine') : ''}
        ${ligne('folder', 'Dossier NAS', nas, null, 'prop-pleine')}
        ${d.archive ? '' : ligne('mail', 'Courriers', `<wa-button appearance="outlined" size="s" pill type="button" class="action-rapide" onclick="ouvrirConstitutionDepuisFiche('${idJs}')" title="Courriers d’interrogation (banque, assurance-vie, impôts, caisses, EHPAD…) : en papier, ou envoyés par email depuis CLAIRE">Préparer et envoyer</wa-button>`, null, 'prop-pleine')}
      </dl>
      <div class="section-eyebrow fiche-sous-titre">Le défunt ${df.source ? `<span class="hint">· ${escapeHtml(df.source)}</span>` : ''}</div>
      ${df.avertissements.map(a => `<p class="cst-alerte">${escapeHtml(a)}</p>`).join('')}
      <dl class="fiche-proprietes">
        ${ligne('user', 'Défunt', `<span class="succ-identite">${civilite}${texte('prenoms', c.prenoms, 'Prénoms', 'Prénoms du défunt')}${texte('nom', c.nom, 'NOM', 'Nom du défunt')}</span>`, null, 'prop-pleine')}
        ${ligne('calendar', 'Décès', `<span class="succ-identite">${date('decesDate', c.decesDate, 'Date du décès', 'changerDefuntFiche')}${texte('decesLieu', c.decesLieu, 'Lieu du décès', 'Lieu du décès')}</span>`, null, 'prop-pleine')}
        ${ligne('home', 'Domicile', texte('domicile', c.domicile, 'COMMUNE (CP), voie', 'Domicile du défunt'), null, 'prop-pleine')}
        ${ligne('key', 'Régime', texte('regime', c.regime, 'Régime matrimonial (communauté légale…)', 'Régime matrimonial du défunt'), null, 'prop-pleine')}
        ${ligne('users', 'Conjoint', `<span class="succ-identite">${lien}${texte('conjointNom', c.conjointNom, 'Monsieur Prénom NOM', 'Conjoint du défunt')}</span>`, null, 'prop-pleine')}
        ${ligne('users', 'Survivant', `<select class="prop-champ" aria-label="Conjoint survivant" onchange="changerSuccession('${idJs}', 'conjointSurvivant', this.value)">${[['', `Déduit : ${conjoint ? 'oui' : 'non'}`], ['oui', 'Oui'], ['non', 'Non']].map(([v, l]) => `<option value="${v}"${(s.conjointSurvivant === true ? 'oui' : s.conjointSurvivant === false ? 'non' : '') === v ? ' selected' : ''}>${l}</option>`).join('')}</select> ${infoBulle('Avec un conjoint survivant, les fonds ne sont pas débloqués : les comptes sont transférés à son profit.')}`, null)}
        ${ligne('file-text', 'Donation époux', choixOuiNon('donationEpoux', s.donationEpoux, 'Donation entre époux'), null)}
        ${ligne('file-text', 'Testament', choixOuiNon('testament', s.testament, 'Testament'), null)}
      </dl>
      <div class="section-eyebrow fiche-sous-titre">Contrôle à 2 mois ${infoBulle('Deux mois après l’ouverture : vérifier si des droits de succession sont dus et si un inventaire est nécessaire, puis cocher l’étape.')}</div>
      <dl class="fiche-proprietes">
        ${ligne('banknote', 'Droits dus', choixOuiNon('droitsDus', s.droitsDus, 'Droits de succession dus'), null)}
        ${ligne('list-check', 'Inventaire', choixOuiNon('inventaireNecessaire', s.inventaireNecessaire, 'Inventaire nécessaire'), null)}
      </dl>
      <div class="section-eyebrow fiche-sous-titre">Héritiers <span class="hint">· ${heritiers.length}</span></div>
      <dl class="fiche-proprietes fiche-coordonnees">
        ${heritiers.length ? heritiers.map((p, i) => ligne(i ? 'users' : 'user', i ? '' : 'Héritiers', `<span class="prop-texte">${escapeHtml(p.nom)}${p.nomUsage ? ` <span class="hint">(${escapeHtml(p.nomUsage)})</span>` : ''}</span>${coordonnees(p) ? ` <span class="hint">${coordonnees(p)}</span>` : ''}`, null, 'prop-pleine')).join('')
          : ligne('users', 'Héritiers', '<span class="prop-texte vide">Aucun — ouvrez les fiches client dans Authentic</span>', null, 'prop-pleine')}
      </dl>
      <dl class="fiche-proprietes">
        ${biens.length ? biens.map((b, i) => ligne('map-pin', i ? '' : (biens.length > 1 ? 'Biens' : 'Bien'), `<span class="prop-texte">${escapeHtml(b.adresse || 'Adresse non relevée')}</span>${b.parcelles ? ` <span class="hint">· ${escapeHtml(b.parcelles)}</span>` : ''}`, null, 'prop-pleine')).join('')
          : ligne('map-pin', 'Bien', `<span class="prop-texte vide">${immobilier ? 'Bien immobilier noté' : 'Aucun bien immobilier relevé'}</span>`, null, 'prop-pleine')}
      </dl></div>`;
  }

  // Pure : les cartes du Tableau d'une succession (à la place du planning d'une vente). `ajouter(colonne, carte)` : celui de
  // cartesTableauFiche (client/57).
  function cartesEtapesSuccessionFiche(d, aujourdhuiIso, ajouter) {
    const idJs = escapeOnclickArg(d.id);
    const attentes = attentesNotoriete(d);
    const s = infoSuccession(d);
    etapesSuccession(d, aujourdhuiIso).forEach(e => {
      const cochable = !e.authentic && !(e.type === 'ouvertureSuccession' && e.iso)
        && !((e.type === 'notoriete' || e.type === 'declarationSuccession') && e.fait && !(d.echeancesValidees || {})[e.type]);
      const coche = cochable ? { onclick: `basculerEcheance('${idJs}', '${escapeOnclickArg(e.type)}')`, libelle: e.fait ? 'Rouvrir' : 'Marquer fait' } : null;
      const champDate = e.type === 'ouvertureSuccession' ? 'ouvertureLe' : (e.fait && e.type === 'notoriete' ? 'notorieteSigneeLe' : (e.fait && e.type === 'declarationSuccession' ? 'declarationSigneeLe' : ''));
      const date = champDate && !e.authentic ? { cle: 'succession:' + champDate, iso: s[champDate] || '', supprimable: !!s[champDate], envoi: false } : null;
      const base = { cle: 'succession:' + e.type, titre: e.label, iso: e.iso || '', sous: e.iso ? formatDateFr(e.iso) : '', categorie: 'succession', coche, date };
      if (e.fait) { ajouter('fait', Object.assign(base, { fait: true, auto: !cochable })); return; }
      if (e.type === 'ouvertureSuccession' && !e.iso) { ajouter('faire', Object.assign(base, { titre: 'Fixer le rendez-vous d’ouverture avec Sophie', sous: 'Les délais (1, 2 et 6 mois) partent de lui' })); return; }
      if (!e.active) { ajouter('attente', Object.assign(base, { iso: '', sous: e.type === 'receptionFonds' ? 'Après le déblocage des fonds' : 'Après l’acte de notoriété' })); return; }
      if (e.type === 'notoriete' && attentes.length) base.sous = 'À réunir : ' + attentes.join(', ');
      if (e.type === 'controleDroits') base.sous = [s.droitsDus ? `droits dus : ${s.droitsDus}` : 'droits à vérifier', s.inventaireNecessaire ? `inventaire : ${s.inventaireNecessaire}` : 'inventaire à vérifier'].join(' · ');
      ajouter(e.attente ? 'attente' : 'faire', base);
    });
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
    return { etat: 'aplacer', iso: prochain.iso || '', jours: null, heure: '', texte: '', proba: null, eyebrow: 'Prochain acte', acte: prochain.label };
  }
