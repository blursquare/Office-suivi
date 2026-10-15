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
      ${renderFcddvSuccession(d)}
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
