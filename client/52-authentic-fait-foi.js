  // ---- Authentic d'abord, puis la fiche ne bouge plus (étude 06/10 au soir) ----
  // « Authentic passe en premier partout et remplace les champs si déjà rempli. Si déjà rempli par Authentic et qu'une donnée
  // change — par exemple un e-mail erroné modifié dans Authentic — une notification pour demander la mise à jour. Sinon la fiche
  // ne bouge plus. » Champs concernés : adresse du bien, prix, type de vente, emails et téléphones de chaque côté, identité
  // d'une partie (civilité, prénom, nom d'usage, date de naissance).
  //  - PREMIÈRE fois qu'Authentic donne une valeur : elle REMPLACE celle de la fiche (l'ancienne reste dans l'historique) ;
  //  - la valeur d'Authentic est alors retenue : d.authentic.valeurs[champ] (champs) et d.authentic.fichesAuthentic[personne]
  //    (emails, téléphones, identité) — « Authentic a déjà rempli ce champ » ;
  //  - ensuite, tant qu'Authentic ne change pas, la fiche ne bouge plus (une correction à la main reste) ;
  //  - si Authentic CHANGE cette valeur : rien n'est écrit, la mise à jour est proposée (d.authentic.majEnAttente) — message
  //    fixe, ligne « Authentic a changé » sur la fiche, signal dans « Nouveau » du Suivi — et se décide d'un clic
  //    (« Mettre à jour » écrit la valeur, « Ignorer » la retient sans rien écrire) ;
  //  - le bouton « Compléter » de la fiche (geste explicite) reprend tout, sans demander.

  var LIBELLES_COTE_AUTHENTIC = { VENDEUR: 'du vendeur', ACQUEREUR: 'de l’acquéreur' };
  var CHAMPS_IDENTITE_AUTHENTIC = { nom: 'nom', civilite: 'civilité', nomUsage: 'nom d’usage', dateNaissance: 'date de naissance' };

  // Pure : ce qu'Authentic a déjà rempli sur la fiche (clé de champ → valeur retenue).
  function valeursAuthenticDossier(d) {
    return (d && d.authentic && d.authentic.valeurs) || {};
  }

  // Pure : les mises à jour proposées par Authentic, en attente de décision — [{ cle, type, libelle, avant, apres, le }].
  function majsEnAttenteAuthentic(d) {
    const att = (d && d.authentic && d.authentic.majEnAttente) || {};
    return Object.keys(att).map(cle => Object.assign({ cle }, att[cle])).sort((a, b) => String(a.le || '').localeCompare(String(b.le || '')) || a.cle.localeCompare(b.cle));
  }

  // Pure : copie des mises à jour en attente, pour savoir ensuite lesquelles sont nouvelles.
  function instantaneMajsAuthentic(d) {
    return JSON.parse(JSON.stringify((d && d.authentic && d.authentic.majEnAttente) || {}));
  }

  // Pure : l'empreinte de ce qu'Authentic a retenu sur la fiche (valeurs, fiches des personnes, mises à jour proposées) — un changement
  // d'empreinte veut dire qu'il y a quelque chose à enregistrer, même si aucun champ visible n'a bougé.
  function empreinteRegistreAuthentic(d) {
    const a = (d && d.authentic) || {};
    return JSON.stringify([a.valeurs || null, a.fichesAuthentic || null, a.majEnAttente || null]);
  }

  // Pure : les mises à jour apparues ou modifiées depuis l'instantané.
  function nouvellesMajsAuthentic(avant, d) {
    return majsEnAttenteAuthentic(d).filter(m => !(avant && avant[m.cle] && avant[m.cle].avant === m.avant && avant[m.cle].apres === m.apres));
  }

  function ecrireDonneesAuthentic(d, patch) {
    d.authentic = Object.assign({}, d.authentic || {}, patch);
  }

  // Modifie d : la valeur d'Authentic est retenue pour ce champ.
  function memoriserValeurAuthentic(d, cle, valeur) {
    ecrireDonneesAuthentic(d, { valeurs: Object.assign({}, valeursAuthenticDossier(d), { [cle]: valeur }) });
    retirerMajAuthentic(d, cle);
  }

  function retirerMajAuthentic(d, cle) {
    const att = d && d.authentic && d.authentic.majEnAttente;
    if (!att || !att[cle]) return;
    const reste = Object.assign({}, att);
    delete reste[cle];
    ecrireDonneesAuthentic(d, { majEnAttente: reste });
    if (!Object.keys(reste).length) delete d.authentic.majEnAttente;
  }

  // Modifie d : propose une mise à jour. → vrai si elle est nouvelle (ou différente de celle déjà proposée).
  function mettreEnAttenteAuthentic(d, cle, entree) {
    const att = Object.assign({}, (d.authentic && d.authentic.majEnAttente) || {});
    const deja = att[cle];
    if (deja && deja.avant === entree.avant && deja.apres === entree.apres) return false;
    att[cle] = Object.assign({}, entree);
    ecrireDonneesAuthentic(d, { majEnAttente: att });
    return true;
  }

  // Pure : que faire d'une valeur d'Authentic pour un champ ?
  //  'rien'       — Authentic n'a rien (de nouveau) à dire ;
  //  'enregistrer'— la fiche l'a déjà : on retient seulement qu'Authentic l'a donnée ;
  //  'poser'      — première fois (ou « Compléter ») : Authentic passe en premier, il remplace ;
  //  'attendre'   — Authentic a CHANGÉ une valeur déjà reprise : proposée, jamais écrite.
  function decisionValeurAuthentic(d, cle, valeur, courant, egal, forcer) {
    if (valeur === '' || valeur == null) return 'rien';
    const memeValeur = egal || ((a, b) => String(a == null ? '' : a).trim() === String(b == null ? '' : b).trim());
    if (memeValeur(courant, valeur)) return 'enregistrer';
    const vues = valeursAuthenticDossier(d);
    if (forcer || !Object.prototype.hasOwnProperty.call(vues, cle)) return 'poser';
    if (memeValeur(vues[cle], valeur)) return 'rien';
    return 'attendre';
  }

  // Modifie d : un champ simple de la fiche (adresse, prix, type de vente) d'après Authentic.
  // o = { cle, champ, libelle, valeur, egal, formater, maintenant, forcer }
  // → { etat: 'pose' | 'attente' | 'enregistre' | 'rien', avant } — `avant` : valeur remplacée, écrite pour l'historique.
  function poserChampAuthentic(d, o) {
    const formater = o.formater || (v => String(v == null ? '' : v));
    const courant = d[o.champ];
    const action = decisionValeurAuthentic(d, o.cle, o.valeur, courant, o.egal, o.forcer);
    if (action === 'rien') { retirerMajAuthentic(d, o.cle); return { etat: 'rien', avant: '' }; }
    if (action === 'enregistrer') { memoriserValeurAuthentic(d, o.cle, o.valeur); return { etat: 'enregistre', avant: '' }; }
    if (action === 'attendre') {
      mettreEnAttenteAuthentic(d, o.cle, { type: 'champ', champ: o.champ, valeur: o.valeur, libelle: o.libelle, avant: formater(courant), apres: formater(o.valeur), le: o.maintenant || new Date().toISOString() });
      return { etat: 'attente', avant: '' };
    }
    const avant = courant != null && courant !== '' && courant !== 0 ? formater(courant) : '';
    d[o.champ] = o.valeur;
    memoriserValeurAuthentic(d, o.cle, o.valeur);
    return { etat: 'pose', avant };
  }

  // ---- Coordonnées d'une personne (emails, téléphones) ----

  function clePourContact(nature) {
    return nature === 'emails' ? (e => String(e).toLowerCase()) : (t => String(t).replace(/\D/g, '').slice(-9));
  }

  // Pure : les valeurs d'un champ de coordonnées (« a@x.fr; b@y.fr », « 06 … / 02 … ») en liste.
  function listeContactAuthentic(nature, texte) {
    return nature === 'emails' ? emailsDepuisTexte(texte) : String(texte || '').split('/').map(t => t.trim()).filter(Boolean);
  }

  // Pure : une liste d'Authentic nettoyée — emails valides, téléphones de 9 chiffres, sans doublon.
  function nettoyerContactAuthentic(nature, liste) {
    const cle = clePourContact(nature);
    const brut = nature === 'emails' ? emailsDepuisTexte((liste || []).join(' ')) : (liste || []).map(t => String(t || '').trim()).filter(t => cle(t).length === 9 && /\d{9}/.test(t.replace(/\D/g, '').slice(-9)));
    return brut.filter((x, i, l) => l.findIndex(y => cle(y) === cle(x)) === i);
  }

  function formaterContactAuthentic(nature, liste) {
    return (liste || []).join(nature === 'emails' ? '; ' : ' / ');
  }

  function memeEnsembleContactAuthentic(nature, a, b) {
    const cle = clePourContact(nature);
    const ka = new Set((a || []).map(cle)), kb = new Set((b || []).map(cle));
    return ka.size === kb.size && [...ka].every(k => kb.has(k));
  }

  // Pure : le champ du côté, les anciennes valeurs d'Authentic retirées et les nouvelles ajoutées (le reste est gardé).
  function remplacerContactAuthentic(nature, courant, anciens, nouveaux) {
    const cle = clePourContact(nature);
    const retire = new Set((anciens || []).map(cle));
    const tous = listeContactAuthentic(nature, courant).filter(x => !retire.has(cle(x)));
    (nouveaux || []).forEach(n => { if (!tous.some(x => cle(x) === cle(n))) tous.push(n); });
    return formaterContactAuthentic(nature, tous);
  }

  // Pure : la fiche d'Authentic retenue pour cette personne d'un côté — { id, fiche } (fiche null : jamais vue).
  function ficheAuthenticPersonne(d, role, nom) {
    const reg = (d && d.authentic && d.authentic.fichesAuthentic) || {};
    for (const [id, f] of Object.entries(reg)) {
      if (f && f.role === role && (memePersonneParNom(f.nom, nom) || normaliserPourRecherche(f.nom) === normaliserPourRecherche(nom))) return { id, fiche: f };
    }
    return { id: role + '|' + motsIdentitePersonne(nom).sort().join(' '), fiche: null };
  }

  function majFicheAuthentic(d, id, role, nom, patch) {
    const reg = Object.assign({}, (d.authentic && d.authentic.fichesAuthentic) || {});
    reg[id] = Object.assign({ nom }, reg[id] || {}, { role }, patch);
    ecrireDonneesAuthentic(d, { fichesAuthentic: reg });
  }

  // Modifie d : emails et téléphones d'une personne d'Authentic reportés sur son côté. Première fois : ils REMPLACENT ceux de la
  // fiche (ceux d'une autre personne du même côté, déjà reprise d'Authentic, sont gardés) ; ensuite, un changement d'Authentic
  // est proposé (retire ses anciennes valeurs, ajoute les nouvelles), jamais écrit. o = { noter, maintenant, forcer }
  // → les libellés de ce qui a été écrit.
  function appliquerContactAuthentic(d, role, nom, contact, o) {
    const opts = o || {};
    const textes = [];
    if (!d || !LIBELLES_COTE_AUTHENTIC[role] || !nom) return textes;
    const noter = opts.noter || (() => {});
    const qui = LIBELLES_COTE_AUTHENTIC[role];
    const { id, fiche } = ficheAuthenticPersonne(d, role, nom);
    const retenu = {};
    [
      ['emails', role === 'VENDEUR' ? 'emailVendeur' : 'emailAcquereur', 'Email', 'email'],
      ['telephones', role === 'VENDEUR' ? 'telephoneVendeur' : 'telephoneAcquereur', 'Téléphone', 'téléphone']
    ].forEach(([nature, champ, Libelle, libelle]) => {
      const nouveaux = nettoyerContactAuthentic(nature, contact && contact[nature]);
      if (!nouveaux.length) return;
      const cleMaj = nature + ':' + id;
      const anciens = fiche && Array.isArray(fiche[nature]) && fiche[nature].length ? fiche[nature] : null;
      const courant = String(d[champ] || '');
      if (anciens && memeEnsembleContactAuthentic(nature, anciens, nouveaux)) { retirerMajAuthentic(d, cleMaj); return; }
      let apres;
      let proposer = false;
      if (!anciens) {
        const reg = (d.authentic && d.authentic.fichesAuthentic) || {};
        const autre = Object.keys(reg).some(k => k !== id && reg[k] && reg[k].role === role && Array.isArray(reg[k][nature]) && reg[k][nature].length);
        apres = autre ? remplacerContactAuthentic(nature, courant, [], nouveaux) : formaterContactAuthentic(nature, nouveaux);
      } else {
        apres = remplacerContactAuthentic(nature, courant, anciens, nouveaux);
        proposer = !opts.forcer && !memeEnsembleContactAuthentic(nature, listeContactAuthentic(nature, courant), listeContactAuthentic(nature, apres));
      }
      if (proposer) {
        mettreEnAttenteAuthentic(d, cleMaj, {
          type: 'contact', libelle: `${Libelle} ${qui}`, champ, nature, fiche: id, role, nom, anciens, nouveaux,
          avant: formaterContactAuthentic(nature, anciens), apres: formaterContactAuthentic(nature, nouveaux), le: opts.maintenant || new Date().toISOString()
        });
        return;
      }
      if (apres !== courant) {
        d[champ] = apres;
        noter(`${Libelle} ${qui} repris d’Authentic : ${formaterContactAuthentic(nature, nouveaux)}${courant ? ` (avant : ${courant})` : ''}`);
        textes.push(`${libelle} ${qui}`);
      }
      retenu[nature] = nouveaux;
      retirerMajAuthentic(d, cleMaj);
    });
    if (Object.keys(retenu).length) majFicheAuthentic(d, id, role, nom, retenu);
    return textes;
  }

  // ---- Identité d'une partie ----

  // Modifie la partie : un champ d'identité pris dans la cible d'Authentic.
  function appliquerChampIdentiteAuthentic(p, k, cible) {
    if (k === 'nom') { p.nom = cible.nom; delete p.prenom; }
    else if (k === 'civilite') p.civilite = cible.civilite;
    else if (k === 'nomUsage') p.nomUsage = cible.nomUsage;
    else if (k === 'dateNaissance') p.dateNaissance = cible.dateNaissance;
  }

  // ---- Changement d'acquéreur (ou de vendeur) dans Authentic (étude 07/10 : « si l'acquéreur change dans le dossier Authentic, le
  // modifier dans la fiche CLAIRE » ; choix : proposé, jamais écrit d'office ; à la mise à jour, le nom du dossier suit et les
  // coordonnées de l'ancien acquéreur sont retirées). Les personnes d'un côté qu'Authentic a données sont retenues
  // (d.authentic.valeurs['parties:ACQUEREUR'], noms « Prénom NOM ») ; si une personne retenue disparaît d'Authentic — et que le
  // nom du dossier dans Authentic ne la cite plus —, la mise à jour est proposée (« Acquéreurs : Camille FOURNIER → Paul DUBOIS »). ----

  var LIBELLES_PARTIES_AUTHENTIC = { VENDEUR: 'Vendeurs', ACQUEREUR: 'Acquéreurs' };

  // Pure : le côté `role` du nom du dossier dans Authentic (« Vente MARTEL / DUBOIS » → « DUBOIS » pour l'acquéreur), '' sinon.
  function coteIntituleAuthentic(intitule, role) {
    const m = /^\s*(?:vte|vente)\b\s*[-:]?\s*(.+?)\s*\/\s*(.+?)\s*$/i.exec(sansReferenceAuthentic(intitule || ''));
    if (!m) return '';
    return (role === 'VENDEUR' ? m[1] : m[2]).trim();
  }

  // Pure : la personne (« Camille FOURNIER ») est-elle encore citée par ce côté du nom du dossier d'Authentic ?
  function personneDansCoteIntitule(nom, cote) {
    const texte = ' ' + normaliserPourRecherche(cote || '').replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
    return motsIdentitePersonne(nom).filter(m => m.length >= 3).some(m => texte.includes(' ' + m + ' '));
  }

  // Pure : les personnes retenues d'Authentic pour ce côté que le dossier d'Authentic ne porte plus — [] si rien n'a changé, si
  // Authentic n'avait encore rien donné, ou si le nom du dossier d'Authentic est illisible (prudence : jamais sur une page partielle).
  function personnesPartiesAuthentic(d, role, venues, intitule) {
    const retenus = valeursAuthenticDossier(d)['parties:' + role];
    if (!Array.isArray(retenus) || !retenus.length || !(venues || []).length) return [];
    const cote = coteIntituleAuthentic(intitule, role);
    if (!cote) return [];
    // Le nom d'une société (« SCI DUBOIS ») ne « cite » pas la personne DUBOIS : la substitution reste vue.
    const coteSansSocietes = societesCoteAuthentic(cote).reduce((t, n) => t.replace(n, ' '), cote);
    return retenus.filter(n => !venues.some(v => memePersonneParNom(n, v.nom) || memePartieComplement({ nom: n }, v)) && !personneDansCoteIntitule(n, coteSansSocietes));
  }

  // Modifie d : propose le changement de personnes d'un côté. `venues` = parties d'Authentic (partiesExportAuthentic), `personnes`
  // = leurs fiches (nom de famille, prénom, civilité, emails, téléphones…).
  function proposerChangementPartiesAuthentic(d, role, retires, venues, personnes, intitule, maintenant) {
    const noms = venues.map(v => v.nom);
    return mettreEnAttenteAuthentic(d, 'parties:' + role, {
      type: 'parties', role, libelle: LIBELLES_PARTIES_AUTHENTIC[role], retires: retires.slice(), noms,
      nouveaux: venues.map(v => JSON.parse(JSON.stringify(v))), personnes: JSON.parse(JSON.stringify(personnes || [])),
      cote: coteIntituleAuthentic(intitule, role),
      avant: retires.join(', '), apres: noms.join(', '), le: maintenant || new Date().toISOString()
    });
  }

  // Modifie d : la mise à jour « personnes d'un côté » écrite — anciennes personnes retirées avec leurs coordonnées, nouvelles
  // posées (identité, civilité, emails, téléphones d'Authentic), situation du couple recalculée, nom du dossier qui suit.
  // → le texte d'historique.
  function appliquerChangementPartiesAuthentic(d, m) {
    const role = m.role;
    const estRetiree = (p) => (m.retires || []).some(n => memePersonneParNom(p.nom, n) || memePartieComplement(p, { nom: n }) || (p.nomUsage && memePersonneParNom(p.nomUsage, n)));
    const duCote = (p) => p && String(p.role || '').toUpperCase() === role;
    const avantCote = (d.parties || []).filter(duCote);
    const restantes = avantCote.filter(p => String(p.nom || '').trim() && !estRetiree(p));
    // Coordonnées : celles qu'Authentic avait données pour les personnes retirées ; tout le champ quand plus personne ne reste.
    [['emails', role === 'VENDEUR' ? 'emailVendeur' : 'emailAcquereur'], ['telephones', role === 'VENDEUR' ? 'telephoneVendeur' : 'telephoneAcquereur']].forEach(([nature, champ]) => {
      if (!restantes.length) { delete d[champ]; return; }
      (m.retires || []).forEach(n => {
        const { fiche } = ficheAuthenticPersonne(d, role, n);
        if (fiche && Array.isArray(fiche[nature]) && fiche[nature].length) d[champ] = remplacerContactAuthentic(nature, d[champ], fiche[nature], []);
      });
      if (!String(d[champ] || '').trim()) delete d[champ];
    });
    // Registre des personnes retirées oublié (une nouvelle venue sous ce nom repartira de zéro).
    const reg = Object.assign({}, (d.authentic && d.authentic.fichesAuthentic) || {});
    const att = Object.assign({}, (d.authentic && d.authentic.majEnAttente) || {});
    (m.retires || []).forEach(n => {
      const { id, fiche } = ficheAuthenticPersonne(d, role, n);
      if (!fiche) return;
      delete reg[id];
      Object.keys(att).filter(k => k.endsWith(':' + id)).forEach(k => delete att[k]);
    });
    ecrireDonneesAuthentic(d, { fichesAuthentic: reg, majEnAttente: att });
    d.parties = (d.parties || []).filter(p => !(duCote(p) && (estRetiree(p) || !String(p.nom || '').trim())));
    (m.nouveaux || []).forEach(v => { if (!d.parties.some(p => duCote(p) && memePartieComplement(p, v))) d.parties.push(Object.assign({}, v, { role }, civiliteDepuisTexte(v.civilite) ? { civilite: civiliteDepuisTexte(v.civilite) } : {})); });
    (m.personnes || []).forEach(pers => {
      const complet = [pers.prenom, pers.nom].filter(Boolean).join(' ');
      if (!d.parties.some(p => duCote(p) && memePartieComplement(p, { nom: complet }))) return;
      alignerIdentitePartieAuthentic(d, pers, role, { forcer: true });
      appliquerContactAuthentic(d, role, complet, { emails: pers.emails, telephones: pers.telephones }, { forcer: true });
    });
    // La situation du couple repart d'Authentic quand le côté a changé de personnes.
    const champSituation = role === 'VENDEUR' ? 'situationVendeur' : 'situationAcquereur';
    delete d[champSituation];
    const valeurs = Object.assign({}, valeursAuthenticDossier(d));
    delete valeurs[champSituation];
    valeurs['parties:' + role] = (m.noms || []).slice();
    ecrireDonneesAuthentic(d, { valeurs });
    appliquerSituationsAuthentic(d, {});
    // Nom du dossier : le côté changé prend le nom que lui donne Authentic.
    let renomme = '';
    const parts = /^(.*?)\s*\/\s*(.*)$/.exec(String(d.nom || ''));
    if (parts && m.cote) {
      const nouveau = role === 'VENDEUR' ? `${m.cote} / ${parts[2].trim()}` : `${parts[1].trim()} / ${m.cote}`;
      if (nouveau !== d.nom) { renomme = ` ; nom du dossier : ${d.nom} → ${nouveau}`; d.nom = nouveau; }
    }
    retirerMajAuthentic(d, 'parties:' + role);
    return `${m.libelle} mis à jour d’après Authentic : ${m.apres} (avant : ${m.avant})${renomme}`;
  }

  // ---- Situation du couple (étude 07/10 : « choisir la civilité à partir des données d'Authentic et remplir automatiquement,
  // idem pour la situation matrimoniale ») ----

  // Modifie d : la situation de chaque côté (`d.situationVendeur`, `d.situationAcquereur`) que les fiches client d'Authentic
  // disent sans ambiguïté (`situationClientDeduite`) est posée — Authentic d'abord : la première fois elle remplace celle de la
  // fiche, ensuite un changement d'Authentic est proposé. → les textes d'historique.
  function appliquerSituationsAuthentic(d, o) {
    const opts = o || {};
    const textes = [];
    if (!d || estSuccession(d)) return textes;
    ['vendeur', 'acquereur'].forEach(cote => {
      const valeur = situationClientDeduite(d, cote);
      if (!valeur) return;
      const champ = cote === 'vendeur' ? 'situationVendeur' : 'situationAcquereur';
      const libelle = cote === 'vendeur' ? 'Situation des vendeurs' : 'Situation des acquéreurs';
      const r = poserChampAuthentic(d, { cle: champ, champ, libelle, valeur, maintenant: opts.maintenant, forcer: opts.forcer, formater: v => libelleSituationClient(v) });
      if (r.etat === 'pose') textes.push(`${libelle} : ${libelleSituationClient(valeur)} (fiche Authentic)${r.avant ? ` — avant : ${r.avant}` : ''}`);
    });
    return textes;
  }

  // ---- Décision de l'étude ----

  function partieDeLaMajAuthentic(d, m) {
    const parties = Array.isArray(d.parties) ? d.parties : [];
    return parties.find(p => p && p.nom === m.partie) || parties.find(p => p && String(p.role || '').toUpperCase() === m.role && memePersonneParNom(p.nom, m.nom)) || null;
  }

  // Modifie d : la mise à jour proposée est écrite (« Mettre à jour »). → le texte d'historique, '' si elle n'existe plus.
  function appliquerMajAuthentic(d, cle) {
    const m = d && d.authentic && d.authentic.majEnAttente && d.authentic.majEnAttente[cle];
    if (!m) return '';
    let texte = '';
    if (m.type === 'champ') {
      d[m.champ] = m.valeur;
      memoriserValeurAuthentic(d, cle, m.valeur);
      texte = `${m.libelle} mis à jour d’après Authentic : ${m.apres}${m.avant ? ` (avant : ${m.avant})` : ''}`;
    } else if (m.type === 'contact') {
      d[m.champ] = remplacerContactAuthentic(m.nature, d[m.champ], m.anciens, m.nouveaux);
      majFicheAuthentic(d, m.fiche, m.role, m.nom, { [m.nature]: m.nouveaux });
      retirerMajAuthentic(d, cle);
      texte = `${m.libelle} mis à jour d’après Authentic : ${m.apres}${m.avant ? ` (avant : ${m.avant})` : ''}`;
    } else if (m.type === 'parties') {
      texte = appliquerChangementPartiesAuthentic(d, m);
    } else if (m.type === 'identite') {
      const p = partieDeLaMajAuthentic(d, m);
      if (p) (m.champs || []).forEach(k => appliquerChampIdentiteAuthentic(p, k, m.cible));
      majFicheAuthentic(d, m.fiche, m.role, m.nom, { identite: m.cible });
      retirerMajAuthentic(d, cle);
      texte = `${m.libelle} mise à jour d’après Authentic : ${m.apres}${m.avant ? ` (avant : ${m.avant})` : ''}`;
    }
    return texte;
  }

  // Modifie d : la mise à jour proposée est écartée (« Ignorer ») — Authentic est retenu tel quel, la fiche ne change pas, et
  // la prochaine proposition ne viendra que d'un nouveau changement d'Authentic.
  function ignorerMajAuthentic(d, cle) {
    const m = d && d.authentic && d.authentic.majEnAttente && d.authentic.majEnAttente[cle];
    if (!m) return false;
    if (m.type === 'champ') memoriserValeurAuthentic(d, cle, m.valeur);
    else if (m.type === 'contact') { majFicheAuthentic(d, m.fiche, m.role, m.nom, { [m.nature]: m.nouveaux }); retirerMajAuthentic(d, cle); }
    else if (m.type === 'identite') { majFicheAuthentic(d, m.fiche, m.role, m.nom, { identite: m.cible }); retirerMajAuthentic(d, cle); }
    else if (m.type === 'parties') memoriserValeurAuthentic(d, cle, (m.noms || []).slice());
    else retirerMajAuthentic(d, cle);
    return true;
  }

  function ajouterHistoriqueMajAuthentic(d, texte) {
    if (!texte) return;
    d.historique = d.historique || [];
    d.historique.push(Object.assign({ date: new Date().toISOString(), texte }, typeof utilisateurPoste !== 'undefined' && utilisateurPoste ? { auteur: utilisateurPoste } : {}));
  }

  async function accepterMajsAuthentic(id, cles) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    let fait = 0;
    (cles || []).forEach(cle => { const t = appliquerMajAuthentic(d, cle); if (t) { ajouterHistoriqueMajAuthentic(d, t); fait++; } });
    if (!fait) return;
    fermerToastFixe('maj-authentic-' + id);
    await sauvegarder(d);
    render();
    afficherToast(`${libelleDossierAffiche(d)} : ${fait > 1 ? `${fait} données mises à jour` : 'donnée mise à jour'} d’après Authentic.`, 'OK', null);
  }

  async function ignorerMajsAuthentic(id, cles) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    let fait = 0;
    (cles || []).forEach(cle => { if (ignorerMajAuthentic(d, cle)) fait++; });
    if (!fait) return;
    fermerToastFixe('maj-authentic-' + id);
    await sauvegarder(d);
    render();
  }

  function accepterMajAuthentic(id, cle) { return accepterMajsAuthentic(id, [cle]); }
  function ignorerMajAuthenticFiche(id, cle) { return ignorerMajsAuthentic(id, [cle]); }

  // Message fixe quand Authentic vient de changer une donnée déjà reprise : « Mettre à jour » l'écrit, la croix le laisse sur la fiche.
  function notifierMajAuthentic(d, nouvelles) {
    if (!d || !nouvelles || !nouvelles.length) return;
    const cles = majsEnAttenteAuthentic(d).map(m => m.cle);
    const detail = nouvelles.length === 1
      ? `${nouvelles[0].libelle} a changé dans Authentic (${nouvelles[0].avant || 'vide'} → ${nouvelles[0].apres})`
      : `${nouvelles.length} données ont changé dans Authentic (${nouvelles.map(m => m.libelle).join(', ')})`;
    afficherToast(`Authentic · ${libelleDossierAffiche(d)} : ${detail}. Mettre à jour la fiche ?`, 'Mettre à jour', () => accepterMajsAuthentic(d.id, cles), { fixe: true, cle: 'maj-authentic-' + d.id });
    try { noterVerificationPoste('authentic-changement-propose', { detail: `${nouvelles.length} changement(s) proposé(s)` }); } catch (e) { /* rapport facultatif */ }
  }

  // Ligne « À mettre à jour » de la première page de la fiche : chaque mise à jour proposée, « Mettre à jour » ou « Ignorer ».
  function renderMajAuthentic(d, ligne) {
    const liste = majsEnAttenteAuthentic(d);
    if (!liste.length) return '';
    const id = escapeOnclickArg(d.id);
    return ligne('alert-triangle', 'À mettre à jour', `<span class="notaires-a-placer">${liste.map(m => `<span class="notaires-a-placer-ligne"><span class="prop-texte texte-retour"><b>${escapeHtml(m.libelle)}</b> : ${m.avant ? `${escapeHtml(m.avant)} → ` : ''}${escapeHtml(m.apres)} <span class="hint">· changé dans Authentic</span></span>
          <button type="button" class="lien-action" onclick="accepterMajAuthentic('${id}', '${escapeOnclickArg(m.cle)}')" title="Écrire la valeur d’Authentic sur la fiche">Mettre à jour</button>
          <button type="button" class="lien-action" onclick="ignorerMajAuthenticFiche('${id}', '${escapeOnclickArg(m.cle)}')" title="Garder la fiche telle quelle : Authentic ne le proposera plus tant qu’il ne change pas encore">Ignorer</button></span>`).join('')}</span>`, null, 'prop-pleine');
  }
