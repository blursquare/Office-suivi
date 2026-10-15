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

  // Pure : Authentic a-t-il déjà donné les emails (ou téléphones) d'une personne de ce côté ? nature : 'emails' | 'telephones'.
  function contactRetenuAuthentic(d, role, nature) {
    const reg = (d && d.authentic && d.authentic.fichesAuthentic) || {};
    return Object.values(reg).some(f => f && f.role === role && Array.isArray(f[nature]) && f[nature].length);
  }

  // Pure : les clés du complément par le compromis qu'Authentic a déjà remplies — la fiche y est gardée telle quelle, le compromis
  // ne la change jamais (étude 07/10 : « toutes les valeurs client et bien doivent venir d'Authentic partout dans CLAIRE »).
  function clesComplementAuthentic(d) {
    const v = valeursAuthenticDossier(d);
    const cles = ['adresseBien', 'typeVente', 'prixVente'].filter(c => v[c] != null && v[c] !== '');
    if (v['parties:VENDEUR'] || v['parties:ACQUEREUR']) cles.push('nom');
    if (contactRetenuAuthentic(d, 'VENDEUR', 'emails')) cles.push('emailVendeur');
    if (contactRetenuAuthentic(d, 'ACQUEREUR', 'emails')) cles.push('emailAcquereur');
    return cles;
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

  // ---- Comparants du sous-dossier (étude 09/10 : « il faut comparer avec la structure du sous-dossier où il est indiqué l'état
  // civil et qui est vendeur et acquéreur » — une vendeuse seule propriétaire avait reçu son mari, une acquéreuse seule son
  // partenaire pacsé, tous deux repris de leur fiche client par le conjoint). Rubrique « Comparants (N) » de la page du dossier :
  // une ligne de noms (« M. MARTEL Alexandre et Mme MARTEL Nadia »), puis la qualité (« Vendeur », « Acquéreur »). ----
  // Succession (étude 15/10 : « tu ne sais pas qui est défunt et héritier ») : la qualité de la rubrique est « Défunt » ou « Héritier »
  // (légataire et conjoint survivant comptés avec les héritiers, leur qualité gardée telle quelle).
  var QUALITES_COMPARANT = 'vendeurs?|promettants?|c[ée]dants?|acqu[ée]reurs?|b[ée]n[ée]ficiaires?|cessionnaires?|(?:autres?\\s+)?intervenants?'
    + '|d[ée]funte?s?|h[ée]riti[eè]re?s?|l[ée]gataires?(?:\\s+universel(?:le)?s?)?|conjoint\\s+survivant|conjointe\\s+survivante';
  var RE_QUALITE_COMPARANT = new RegExp('^(' + QUALITES_COMPARANT + ')$', 'i');
  var RE_FIN_COMPARANTS = /^(informations?\s+financi|parties?\s+prenantes?|immeubles?|tiers\b|documents?|pi[eè]ces|notes?|historique|formalit)/i;

  // « Mme X épouse de M. Y », « veuve de », « divorcé de », « époux de » : la personne vend ou achète SEULE — le conjoint cité après
  // « de » n'est pas comparant par ce seul fait (étude 09/10) ; il l'est s'il figure lui-même plus bas comme vendeur ou acquéreur.
  var RE_LIEN_CONJOINT_COMPARANT = /\s+(?:[ée]pouse|[ée]poux|veuve|veuf|divorc[ée]e?|s[ée]par[ée]e?)\s+(?:de\s|d['’]).*$/i;

  // Pure : un comparant de succession tel qu'Authentic l'écrit (« Mme DUPONT Marie veuve de M. DUPONT Jean ») →
  // { nom: 'DUPONT Marie', civilite: 'Mme', lien: 'Veuve de', conjoint: 'Monsieur DUPONT Jean' } ; null sans nom.
  function personneComparantSuccession(texte) {
    let t = String(texte || '').replace(/^\s*et\s+/i, '').trim();
    const civ = /^(M\.|Mme|Mlle|Monsieur|Madame|Mademoiselle|Mr)\s+/i.exec(t);
    const civilite = civ ? (/^(mme|madame|mlle|mademoiselle)/i.test(civ[1]) ? 'Mme' : 'M') : '';
    if (civ) t = t.slice(civ[0].length);
    const l = /\s+([ée]pouse|[ée]poux|veuve|veuf|divorc[ée]e?|s[ée]par[ée]e?)\s+(?:de\s+|d['’])(.*)$/i.exec(t);
    const r = { nom: (l ? t.slice(0, l.index) : t).trim().slice(0, 120), civilite };
    if (r.nom.length < 2) return null;
    if (l) {
      const mot = l[1].toLowerCase().replace(/^e/, 'é');
      r.lien = mot.charAt(0).toUpperCase() + mot.slice(1) + ' de';
      r.conjoint = l[2].replace(/^(M\.|Mr)\s+/i, 'Monsieur ').replace(/^Mme\s+/i, 'Madame ').trim().slice(0, 120);
    }
    return r;
  }

  // Pure : [{ nom, role }] des comparants vendeurs et acquéreurs (et, d'une succession, défunt et héritiers : { nom, role, qualite,
  // civilite, lien?, conjoint? }), [] si la rubrique n'est pas sur la page.
  function comparantsAuthentic(capture) {
    const lignes = String((capture && capture.texte) || '').split(/\n+/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const debut = lignes.findIndex(l => /^comparants?\b/i.test(l));
    if (debut < 0) return [];
    const r = [];
    let noms = [];
    for (const l0 of lignes.slice(debut + 1)) {
      if (RE_FIN_COMPARANTS.test(l0)) break;
      // La qualité est seule sur sa ligne, ou en fin de ligne (cellule suivante d'un tableau : « M. X et Mme Y   Vendeur »).
      let l = l0;
      let q = RE_QUALITE_COMPARANT.exec(l);
      if (!q) {
        const fin = new RegExp('^(.*\\S)\\s+(' + QUALITES_COMPARANT + ')$', 'i').exec(l);
        if (fin) { l = fin[1]; q = [fin[2], fin[2]]; noms.push(l); }
      }
      if (!q) { noms.push(l); continue; }
      // « Autre intervenant » : une personne qui n'est ni vendeur ni acquéreur (étude 09/10) — jamais reprise dans la fiche, et ses noms
      // ne se collent pas à la qualité suivante.
      if (/intervenant/i.test(q[1])) { noms = []; continue; }
      if (/^(d[ée]f|h[ée]r|l[ée]g|conj)/i.test(q[1])) {
        const role = /^d[ée]f/i.test(q[1]) ? 'DEFUNT' : 'HERITIER';
        const qualite = q[1].replace(/\s+/g, ' ').replace(/^./, x => x.toUpperCase());
        noms.join(' et ').split(/\s+et\s+/i).map(n => personneComparantSuccession(n)).filter(Boolean)
          .forEach(p => r.push(Object.assign({ role, qualite }, p)));
        noms = [];
        continue;
      }
      const role = /^(vend|prom|c[ée]d)/i.test(q[1]) ? 'VENDEUR' : 'ACQUEREUR';
      // « M. X et Mme Y » = deux personnes du même côté (un couple qui vend ou achète à deux) ; « et » en début ou fin de ligne ignoré.
      noms.join(' et ').split(/\s+et\s+/i).map(n => n.replace(RE_LIEN_CONJOINT_COMPARANT, '')).map(n => n.replace(/^(?:et\s+)?(?:M\.|Mme|Mlle|Monsieur|Madame|Mademoiselle|Mr)\s+/i, '').replace(/^et\s+/i, '').trim())
        .filter(n => n.length > 1).forEach(nom => r.push({ nom: nom.slice(0, 120), role }));
      noms = [];
    }
    return r.slice(0, 12);
  }

  // Pure : vrai si la personne d'une fiche client est un comparant de ce côté (nom de naissance ou d'usage, et prénom quand le
  // comparant en porte un). Sans comparants relevés : vrai seulement si son NOM la place de ce côté (jamais par le conjoint).
  function personneComparantAuthentic(d, personne, role) {
    const comparants = (d && d.authentic && Array.isArray(d.authentic.comparants)) ? d.authentic.comparants : [];
    const mots = (x) => ' ' + normaliserPourRecherche(x || '').replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
    const noms = [personne.nom, personne.nomUsage].filter(Boolean).map(n => mots(n).trim()).filter(Boolean);
    if (!comparants.length) return noms.some(n => roleClientAuthenticParNom(d, n, personne.prenom) === role);
    const prenom = mots(personne.prenom).trim().split(' ')[0] || '';
    return comparants.some(c => c.role === role && noms.some(n => mots(c.nom).includes(' ' + n + ' '))
      && (!prenom || !/[a-z]{2,}\s+[a-z]{2,}/.test(mots(c.nom).trim()) || mots(c.nom).includes(' ' + prenom + ' ')));
  }

  // Modifie d : une personne reprise d'une fiche client d'Authentic (`origine: 'authentic'`) qui n'est pas comparante de son côté
  // dans le sous-dossier est retirée, et la situation du couple posée par Authentic tombe avec elle. Seulement quand les deux
  // côtés ont été lus (une rubrique coupée ne retire personne). → vrai si quelque chose a changé.
  function retirerPartiesHorsComparants(d, noter) {
    const comparants = (d && d.authentic && Array.isArray(d.authentic.comparants)) ? d.authentic.comparants : [];
    if (!comparants.some(c => c.role === 'VENDEUR') || !comparants.some(c => c.role === 'ACQUEREUR') || estSuccession(d)) return false;
    const mots = (x) => ' ' + normaliserPourRecherche(x || '').replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
    // Nom de famille = les mots en capitales (« Cidem SARUHAN »), sinon tous les mots de trois lettres et plus.
    const familles = (nom) => {
      const maj = String(nom || '').split(/\s+/).filter(m => m.length >= 2 && m === m.toUpperCase() && /[A-ZÀ-Þ]/.test(m));
      return (maj.length ? maj : String(nom || '').split(/\s+/).filter(m => m.length >= 3)).map(m => mots(m).trim()).filter(Boolean);
    };
    // Le nom d'usage compte aussi (audit 12/10 : une comparante citée « Mme Léa DURAND » sous son nom d'usage était retirée,
    // puis remise par la fiche client suivante, en boucle).
    const estComparant = (p) => comparants.some(c => c.role === String(p.role || '').toUpperCase()
      && familles(p.nom).concat(familles(p.nomUsage)).some(m => mots(c.nom).includes(' ' + m + ' ')));
    const retires = (d.parties || []).filter(p => p && p.origine === 'authentic' && p.qualitePersonne !== 'morale'
      && (p.role === 'VENDEUR' || p.role === 'ACQUEREUR') && !estComparant(p));
    if (!retires.length) return false;
    d.parties = d.parties.filter(p => !retires.includes(p));
    retires.forEach(p => noter(`${p.role === 'VENDEUR' ? 'Vendeur' : 'Acquéreur'} retiré : ${p.nom} n’est pas comparant du sous-dossier dans Authentic`));
    const valeurs = (d.authentic && d.authentic.valeurs) || {};
    [['VENDEUR', 'situationVendeur'], ['ACQUEREUR', 'situationAcquereur']].forEach(([role, champ]) => {
      const reste = d.parties.filter(p => p && p.role === role && p.qualitePersonne !== 'morale').length;
      if (reste < 2 && d[champ] && retires.some(p => p.role === role)) {
        delete d[champ];
        if (valeurs[champ] !== undefined) delete valeurs[champ];
        noter(`${role === 'VENDEUR' ? 'Situation des vendeurs' : 'Situation des acquéreurs'} retirée (une seule personne comparante)`);
      }
    });
    const cles = new Set(retires.map(p => mots(p.nom).trim()));
    if (d.authentic && Array.isArray(d.authentic.personnes)) d.authentic.personnes = d.authentic.personnes.filter(f => !cles.has(mots(f.nom).trim()));
    return true;
  }

  // ---- À la création d'un dossier avec Authentic (étude 07/10 : « lors de l'ajout d'un nouveau dossier avec les informations
  // Authentic, récupérer dès ce moment civilité, email, téléphone, situation maritale ») ----

  // Modifie d (le dossier qu'on va enregistrer) : ce que les fiches client d'Authentic disent des parties est posé TOUT DE SUITE —
  // civilité, identité, situation matrimoniale de chaque personne et situation du couple de chaque côté ; emails et téléphones sur
  // un côté resté vide. Ce qu'Authentic a donné est retenu (personnes, coordonnées, identité, adresse, prix, type de vente) : la
  // première page relevée après la création ne repose rien, et une valeur corrigée à la main dans « Vérifier » reste.
  // → les textes d'historique.
  // Modifie d : TOUS les immeubles du dossier Authentic (adresse, type, parcelles avec leur commune) retenus à la création — un
  // dossier à plusieurs articles ne perd aucune parcelle (étude 15/10). d.authentic.immeubles, 12 au plus.
  function retenirImmeublesAuthentic(d, donnees) {
    if (!d || !donnees) return false;
    const ids = donnees.biens || [];
    const liste = (donnees.immeubles || []).filter(im => !ids.length || ids.includes(im.id)).slice(0, 12).map(im => ({
      adresse: im.adresse && im.adresse.texte ? normaliserAdresse(im.adresse.texte) : '',
      codePostal: (im.adresse && im.adresse.codePostal) || '', commune: (im.adresse && im.adresse.commune) || '',
      type: im.type || '', description: String(im.description || '').slice(0, 160),
      parcelles: (im.parcelles || []).slice(0, 40).map(p => Object.assign({ section: String(p.section || '').toUpperCase(), numero: String(p.numero || '') },
        Object.fromEntries(['prefixe', 'commune', 'lieuDit', 'nature', 'surface'].filter(k => p[k]).map(k => [k, String(p[k]).slice(0, 60)]))))
    })).filter(im => im.adresse || im.parcelles.length);
    if (!liste.length) return false;
    d.authentic = Object.assign({}, d.authentic || {}, { immeubles: liste });
    return true;
  }

  function fichesAuthenticACreation(d, donnees, o) {
    const textes = [];
    if (!d || !donnees) return textes;
    const maintenant = (o && o.maintenant) || new Date().toISOString();
    // Les fiches client lues avant la création sont retenues telles quelles (domicile, décès, situation…), pour tous les dossiers.
    (donnees.personnes || []).forEach(pers => retenirFicheClientAuthentic(d, pers, maintenant));
    retenirImmeublesAuthentic(d, donnees);
    const parties = partiesExportAuthentic(donnees);
    // Succession : la civilité est déjà sur chaque partie (partiesSuccessionDepuisAuthentic) ; ni côté ni couple.
    if (estSuccession(d)) return textes;
    // Parcelles en bois lues dans la fiche bien (désignation « parcelle de bois », nature vide) : gardées dès la création.
    const im = bienExportAuthentic(donnees);
    if (d.typeVente === 'terre' && im && typeof im.bois === 'boolean' && (donnees.immeubles || []).length <= 1) d.bien = Object.assign({}, d.bien || {}, { natureBois: im.bois });
    d.parties = Array.isArray(d.parties) ? d.parties : [];
    const surLaFiche = (v) => d.parties.find(p => p && String(p.role || '').toUpperCase() === v.role && memePartieComplement(p, v)) || null;
    const venues = parties.filter(v => (v.role === 'VENDEUR' || v.role === 'ACQUEREUR') && v.qualitePersonne !== 'morale' && String(v.nom || '').trim());
    ['VENDEUR', 'ACQUEREUR'].forEach(role => {
      const noms = parties.filter(v => v.role === role && String(v.nom || '').trim()).map(v => v.nom);
      if (noms.length) memoriserValeurAuthentic(d, 'parties:' + role, noms);
    });
    const fiches = ((d.authentic && d.authentic.personnes) || []).slice();
    (donnees.personnes || []).forEach(pers => {
      const complet = [pers.prenom, pers.nom].filter(Boolean).join(' ');
      const venue = venues.find(v => v.nom === complet);
      if (!venue || !surLaFiche(venue)) return;
      alignerIdentitePartieAuthentic(d, pers, venue.role, { maintenant }).forEach(t => textes.push(t));
      const p = surLaFiche(venue);
      const sm = pers.situationMatrimoniale || null;
      if (p && sm && !(p.situationMatrimoniale && p.situationMatrimoniale.situation)) p.situationMatrimoniale = Object.assign({}, sm);
      const cle = normaliserPourRecherche(complet).replace(/[^a-z0-9]+/g, ' ').trim();
      const i = fiches.findIndex(f => normaliserPourRecherche(f.nom).replace(/[^a-z0-9]+/g, ' ').trim() === cle);
      const fiche = { nom: complet, role: venue.role, situationMatrimoniale: sm };
      if (i >= 0) fiches[i] = fiche; else fiches.push(fiche);
    });
    if (fiches.length) ecrireDonneesAuthentic(d, { personnes: fiches, releveLe: maintenant });
    appliquerSituationsAuthentic(d, { maintenant }).forEach(t => textes.push(t));
    // Coordonnées : le formulaire a déjà été rempli avec celles d'Authentic (completerExtractionDepuisAuthentic) — ce qui y est
    // reste (une correction à la main dans « Vérifier » est gardée) ; un côté vide les reçoit. Authentic est retenu dans tous les cas.
    const remplis = new Set();
    venues.filter(surLaFiche).forEach(v => {
      const { id } = ficheAuthenticPersonne(d, v.role, v.nom);
      const retenu = {};
      [['emails', v.role === 'VENDEUR' ? 'emailVendeur' : 'emailAcquereur', 'Email'], ['telephones', v.role === 'VENDEUR' ? 'telephoneVendeur' : 'telephoneAcquereur', 'Téléphone']].forEach(([nature, champ, libelle]) => {
        const nouveaux = nettoyerContactAuthentic(nature, v[nature]);
        if (!nouveaux.length) return;
        retenu[nature] = nouveaux;
        if (String(d[champ] || '').trim() && !remplis.has(champ)) return;
        d[champ] = remplacerContactAuthentic(nature, d[champ], [], nouveaux);
        remplis.add(champ);
        textes.push(`${libelle} ${LIBELLES_COTE_AUTHENTIC[v.role]} : ${formaterContactAuthentic(nature, nouveaux)}`);
      });
      if (Object.keys(retenu).length) majFicheAuthentic(d, id, v.role, v.nom, retenu);
    });
    // Champs simples : retenus tels qu'Authentic les donne, jamais écrits ici (le formulaire fait foi à la création).
    const bien = bienExportAuthentic(donnees);
    const adresse = bien && bien.adresse && bien.adresse.texte ? normaliserAdresse(bien.adresse.texte) : '';
    if (adresse) memoriserValeurAuthentic(d, 'adresseBien', adresse);
    if (bien && bien.type && LIBELLES_TYPE_VENTE_AUTHENTIC[bien.type]) memoriserValeurAuthentic(d, 'typeVente', bien.type);
    const prix = donnees.infosAuthentic && Number(donnees.infosAuthentic.prix);
    if (prix > 0) memoriserValeurAuthentic(d, 'prixVente', prix);
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
      // Passage en terre agricole / terrain non bâti : la pièce « Réponse SAFER », comme par les autres voies.
      if (m.champ === 'typeVente' && m.valeur === 'terre' && ajouterPieceSaferTerre(d)) texte += ' ; « Réponse SAFER » ajoutée aux pièces';
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
          <button type="button" class="lien-action" onclick="accepterMajAuthentic('${escapeOnclickArg(id)}', '${escapeOnclickArg(m.cle)}')" title="Écrire la valeur d’Authentic sur la fiche">Mettre à jour</button>
          <button type="button" class="lien-action" onclick="ignorerMajAuthenticFiche('${escapeOnclickArg(id)}', '${escapeOnclickArg(m.cle)}')" title="Garder la fiche telle quelle : Authentic ne le proposera plus tant qu’il ne change pas encore">Ignorer</button></span>`).join('')}</span>`, null, 'prop-pleine');
  }
