  // ---- Widget « Statistiques » (étude, 02/10 : délais entre l'ouverture du dossier et l'obtention du
  // prêt, la renonciation au droit de préemption, la signature ; nombre de dossiers par rapport au mois
  // précédent et au même mois de l'année précédente). Tout vient de ce que CLAIRE a déjà noté — l'entrée
  // « Dossier créé » de l'historique pour l'ouverture (la date du compromis n'est pas enregistrée) —,
  // rien n'est deviné : un dossier sans l'une des deux dates n'entre pas dans la moyenne.
  var RE_HISTORIQUE_PRET_OBTENU = /offre de pr[eê]t (?:retrouv|re[cç]u|confirm)|obtention du pr[eê]t.*marqu[ée]e r[ée]alis[ée]e/i;
  var RE_HISTORIQUE_PREEMPTION = /pr[ée]emption/i;

  // Pure : point de départ des statistiques (étude, 02/10 : « prends plutôt la date de signature de
  // l'avant-contrat que la date de création du dossier ») — la date de l'avant-contrat, à défaut
  // l'ouverture dans CLAIRE. → { date, source: 'avant-contrat' | 'ouverture' } ou null.
  function debutDossierStatistiques(d) {
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d.dateAvantContrat || '')) return { date: d.dateAvantContrat, source: 'avant-contrat' };
    const o = dateOuvertureDossier(d);
    return o ? { date: o, source: 'ouverture' } : null;
  }

  // Pure : date (AAAA-MM-JJ) de l'ouverture du dossier dans CLAIRE, ou null.
  function dateOuvertureDossier(d) {
    const h = ((d && d.historique) || []).find(x => x && x.texte === 'Dossier créé');
    return h && h.date ? isoLocalDepuisDate(h.date) : null;
  }
  // Pure : la plus ancienne entrée d'historique qui répond au motif (et à `filtre`), en AAAA-MM-JJ.
  function premiereDateHistorique(d, re, filtre) {
    const dates = ((d && d.historique) || []).filter(x => x && x.date && re.test(x.texte || '') && (!filtre || filtre(x.texte)))
      .map(x => isoLocalDepuisDate(x.date)).filter(Boolean).sort();
    return dates[0] || null;
  }
  // Pure : offre de prêt reçue (ou obtention du prêt marquée réalisée) — jamais pour un achat comptant.
  function dateObtentionPret(d) {
    if (!d || d.sansPret) return null;
    return premiereDateHistorique(d, RE_HISTORIQUE_PRET_OBTENU);
  }
  // Pure : renonciation au droit de préemption reçue — trouvée sur le NAS ou rangée (piecesTrouveesLe),
  // sinon validée à la main (historique).
  function dateRenonciationPreemption(d) {
    if (!d) return null;
    const trouvee = d.piecesTrouveesLe && d.piecesTrouveesLe.renonciationPreemption;
    if (trouvee) return isoLocalDepuisDate(trouvee);
    if (!(d.pieces && d.pieces.renonciationPreemption === 'recue')) return null;
    return premiereDateHistorique(d, RE_HISTORIQUE_PREEMPTION, t => /re[cç]u|valid|trouv|rang/i.test(t));
  }
  // Pure : jour de la signature, une fois passée — même règle que partout (dateSignatureDossier : signé dans Authentic ou coché,
  // sinon rendez-vous passé), plus le rendez-vous du jour même.
  function dateSignatureFaite(d, aujourdhuiIso) {
    const auj = aujourdhuiIso || isoAujourdhuiLocal();
    if (!d) return null;
    return dateSignatureDossier(d, auj) || (d.rendezVousSignature === auj ? auj : null);
  }

  // Pure : { pret, preemption, signature } → { moyenne, mediane, n, min, max } en jours depuis
  // l'ouverture, sur TOUS les dossiers mesurables (étude, 02/10 : « la moyenne sur tous les dossiers,
  // pas le mois en cours » — archivés compris, sans fenêtre de dates) ; moyenne null sans aucun dossier.
  function statistiquesDelaisDossiers(liste0, aujourdhuiIso) {
    const auj = aujourdhuiIso || isoAujourdhuiLocal();
    // Ventes seulement (étude 16/10 : une succession n'a ni avant-contrat, ni prêt, ni préemption).
    const liste = (liste0 || []).filter(d => !estSuccession(d));
    const mesurer = (dateDe) => {
      const ecarts = [];
      let parAvantContrat = 0;
      (liste || []).forEach(d => {
        const debut = debutDossierStatistiques(d);
        const fin = dateDe(d);
        if (!debut || !fin || fin > auj) return;
        const j = ecartJours(debut.date, fin);
        if (j !== null && j >= 0) { ecarts.push(j); if (debut.source === 'avant-contrat') parAvantContrat++; }
      });
      ecarts.sort((a, b) => a - b);
      const n = ecarts.length;
      if (!n) return { moyenne: null, mediane: null, n: 0, min: null, max: null, parAvantContrat: 0 };
      const mediane = n % 2 ? ecarts[(n - 1) / 2] : Math.round((ecarts[n / 2 - 1] + ecarts[n / 2]) / 2);
      return { moyenne: Math.round(ecarts.reduce((t, x) => t + x, 0) / n), mediane, n, min: ecarts[0], max: ecarts[n - 1], parAvantContrat };
    };
    return {
      pret: mesurer(dateObtentionPret),
      preemption: mesurer(dateRenonciationPreemption),
      signature: mesurer(d => dateSignatureFaite(d, auj))
    };
  }

  // Pure : dossiers ouverts dans CLAIRE ce mois-ci, le mois précédent et le même mois de l'année
  // précédente. `disponible` = false quand CLAIRE ne suivait encore aucun dossier ce mois-là (aucune
  // ouverture notée avant sa fin) : on affiche alors « — », pas un zéro trompeur.
  function comparaisonDossiersOuverts(liste0, aujourdhuiIso) {
    const auj = aujourdhuiIso || isoAujourdhuiLocal();
    const liste = (liste0 || []).filter(d => !estSuccession(d)); // avant-contrats : ventes seulement (étude 16/10)
    // Compté au mois de signature de l'avant-contrat (à défaut d'ouverture) ; « — » pour un mois
    // d'avant le premier dossier ouvert dans CLAIRE (un avant-contrat plus ancien n'y change rien).
    const ouvertures = (liste || []).map(d => { const x = debutDossierStatistiques(d); return x && x.date; }).filter(Boolean).sort();
    const premiere = (liste || []).map(dateOuvertureDossier).filter(Boolean).sort()[0] || null;
    const moisDecale = (n) => { const x = new Date(auj.slice(0, 7) + '-01T00:00:00'); x.setMonth(x.getMonth() + n); return isoLocalDepuisDate(x).slice(0, 7); };
    const periode = (cle) => {
      const n = ouvertures.filter(o => o.slice(0, 7) === cle).length;
      return { cle, n, disponible: !!premiere && premiere.slice(0, 7) <= cle };
    };
    return { mois: periode(auj.slice(0, 7)), precedent: periode(moisDecale(-1)), anPasse: periode(moisDecale(-12)), premiere };
  }

  // Pure : « octobre », « octobre 2025 » (l'année seulement si ce n'est pas celle de référence).
  function nomMoisStatistiques(cle, anneeRef, court) {
    const nom = new Date(cle + '-01T00:00:00').toLocaleDateString('fr-FR', { month: court ? 'short' : 'long' });
    return cle.slice(0, 4) === String(anneeRef) ? nom : `${nom} ${court ? cle.slice(2, 4) : cle.slice(0, 4)}`;
  }

  // ---- Actes à l'agenda (étude, 03/10) : ventes, successions (SUCC) et donations (DONATION…) de
  // l'année en cours vs l'année précédente, comptées par le serveur dans l'agenda partagé (GET
  // /api/agenda/actes-annee, voir compterActesAgendaPeriode). Relu toutes les 10 minutes ; tant que
  // l'historique n'est pas complet (mois lus un à un dans Exchange), relu 20 s plus tard.
  var actesAgendaAnnee = { donnees: null, t: 0, enCours: false };
  var minuterieActesAgenda = null;
  async function chargerActesAgendaAnnee(forcer) {
    if (!authToken || actesAgendaAnnee.enCours) return;
    if (!forcer && actesAgendaAnnee.t && Date.now() - actesAgendaAnnee.t < 10 * 60 * 1000) return;
    actesAgendaAnnee.enCours = true;
    try {
      const r = await fetchAvecAuth('/api/agenda/actes-annee');
      const corps = await r.json();
      if (r.ok) actesAgendaAnnee.donnees = corps;
    } catch (e) { /* la carte garde ce qu'elle avait */ }
    actesAgendaAnnee.enCours = false;
    actesAgendaAnnee.t = Date.now();
    const d = actesAgendaAnnee.donnees;
    clearTimeout(minuterieActesAgenda);
    if (d && !d.complet && (d.enCours || !d.message)) minuterieActesAgenda = setTimeout(() => chargerActesAgendaAnnee(true), 20000);
    if (ongletActuel === 'dashboard') renderStatistiquesDashboard(dossiersDuPerimetre(dossiers, utilisateurPoste, vueGlobaleDashboard()));
  }

  // Pure : une ligne par nature d'acte, écart de l'année en cours sur la même période l'an dernier.
  // Pure : une ligne par nature d'acte sur TOUS les mois de l'année (étude, 03/10 : « il faut compter
  // sur tous les mois de l'année ») — l'année en cours entière, rendez-vous déjà placés jusqu'au 31/12
  // compris (dont `passes` et `aVenir`), contre toute l'année précédente.
  function lignesActesAgenda(donnees) {
    if (!donnees || !donnees.actuel) return [];
    const n = (bloc, cle) => Number((bloc || {})[cle]) || 0;
    return [['ventes', 'Ventes'], ['successions', 'Successions'], ['donations', 'Donations']].map(([cle, libelle]) => {
      const passes = n(donnees.actuel, cle);
      const aVenir = n(donnees.aVenir, cle);
      const annee = donnees.anneeEnCours ? n(donnees.anneeEnCours, cle) : passes + aVenir;
      const anneePrecedente = n(donnees.anneePrecedente, cle);
      return { cle, libelle, annee, passes, aVenir, anneePrecedente, memePeriode: n(donnees.memePeriode, cle), ecart: annee - anneePrecedente };
    });
  }

  function renderActesAgendaStatistiques(presentation) {
    const d = actesAgendaAnnee.donnees;
    if (!d) {
      chargerActesAgendaAnnee();
      return { section: `<div class="w-section st-section"><h3 class="jour-carte-sous-titre">Actes à l’agenda</h3><p class="jour-vide">Lecture de l’agenda…</p></div>`, ligne: '' };
    }
    chargerActesAgendaAnnee();
    const lignes = lignesActesAgenda(d);
    const sur = (n) => (d.complet ? String(n) : '…');
    const memeJour = /^\d{4}-\d{2}-\d{2}$/.test(d.memeJour || '') ? `${d.memeJour.slice(8, 10)}/${d.memeJour.slice(5, 7)}` : '';
    const note = d.complet ? ''
      : d.message ? escapeHtml(d.message)
        : `Lecture de l’historique dans l’agenda (${d.moisManquants} mois restant${d.moisManquants > 1 ? 's' : ''})…`;
    const ecart = (l) => {
      if (!d.complet) return '<span class="st-ecart">…</span>';
      const t = formaterTendance(l.ecart);
      return `<span class="st-ecart">${t.icone}${t.texte}</span>`;
    };
    const aide = `De janvier à décembre, dans l’agenda partagé : titre commençant par VTE ou VENTE (ventes), contenant SUCC (successions) ou commençant par DONATION (donations). ${d.annee} : rendez-vous passés et déjà placés jusqu’au 31/12. Rendez-vous horaires confirmés (sans « ? »), ni annulés ni « à replacer », ni options d’un sondage.`;
    const ligne = (l) => `<tr title="${escapeAttr(`${l.libelle} ${d.annee} : ${l.annee} (${l.passes} passé${l.passes > 1 ? 's' : ''}, ${l.aVenir} à venir) · ${d.precedente} : ${l.anneePrecedente} (${l.memePeriode} au ${memeJour})`)}">
        <th scope="row">${escapeHtml(l.libelle)}</th>
        <td class="st-actes-n"><b>${sur(l.annee)}</b></td>
        <td class="st-actes-n">${sur(l.anneePrecedente)}</td>
        <td class="st-actes-n">${ecart(l)}</td>
      </tr>`;
    const section = `<div class="w-section st-section">
        <h3 class="jour-carte-sous-titre">Actes à l’agenda, sur l’année${infoBulle(aide)}</h3>
        <table class="st-actes">
          <thead><tr><th></th><th scope="col">${d.annee}</th><th scope="col">${d.precedente}</th><th scope="col" aria-label="Écart"></th></tr></thead>
          <tbody>${lignes.map(ligne).join('')}</tbody>
        </table>
        ${note ? `<div class="st-ecarts w-fixe">${note}</div>` : ''}
      </div>`;
    const v = lignes[0];
    const ligneCourte = v && d.complet ? `<div class="st-ecarts w-fixe"><b>${v.annee}</b> vente${v.annee > 1 ? 's' : ''} sur ${d.annee} · ${ecart(v)} vs ${d.precedente}</div>` : '';
    return { section, ligne: ligneCourte };
  }

  function renderStatistiquesDashboard(perimetreTous) {
    const bloc = document.getElementById('kpi-statistiques');
    if (!bloc) return;
    const presentation = presentationWidget('statistiques');
    const auj = isoAujourdhuiLocal();
    // Délais : tous les dossiers de l'étude, quel que soit le périmètre du tableau de bord.
    const delais = statistiquesDelaisDossiers(dossiers, auj);
    const cmp = comparaisonDossiersOuverts(perimetreTous, auj);
    const annee = auj.slice(0, 4);
    const court = presentation !== 'grand';   // « sept. », « oct. 25 » quand la place manque
    const lignesDelais = [
      { cle: 'pret', libelle: 'Obtention du prêt', court: 'Prêt', s: delais.pret, classe: 'pret' },
      { cle: 'preemption', libelle: 'Renonciation au droit de préemption (DIA)', court: 'Préemption (DIA)', s: delais.preemption, classe: 'preemption' },
      { cle: 'signature', libelle: 'Signature de l’acte', court: 'Signature', s: delais.signature, classe: 'signature' }
    ];
    const max = Math.max(1, ...lignesDelais.map(l => l.s.moyenne || 0));
    const ligneDelai = (l) => {
      const s = l.s;
      const aide = s.n ? `Moyenne sur ${s.n} dossier${s.n > 1 ? 's' : ''} · médiane ${s.mediane} j · de ${s.min} à ${s.max} j${s.parAvantContrat < s.n ? ` · ${s.n - s.parAvantContrat} compté${s.n - s.parAvantContrat > 1 ? 's' : ''} depuis l’ouverture dans CLAIRE (date de l’avant-contrat inconnue)` : ''}` : 'Aucun dossier mesurable';
      return `<li class="st-delai" title="${escapeAttr(aide)}">
          <span class="st-delai-lib">${escapeHtml(presentation === 'petit' ? l.court : l.libelle)}</span>
          <span class="st-delai-val">${s.n ? `<b>${s.moyenne}</b> j en moyenne` : '—'}</span>
          <span class="st-barre"><span class="st-barre-${l.classe}" style="width:${s.n ? Math.max(4, Math.round(100 * s.moyenne / max)) : 0}%"></span></span>
          ${presentation === 'petit' ? '' : `<span class="st-delai-n">${s.n ? `${s.n} dossier${s.n > 1 ? 's' : ''}` : ''}</span>`}
        </li>`;
    };
    const ecart = (a, b) => {
      if (!b.disponible) return '<span class="st-ecart">—</span>';
      const t = formaterTendance(a.n - b.n);
      return `<span class="st-ecart">${t.icone}${t.texte}</span>`;
    };
    const tuile = (p, lib, principal) => `<div class="st-tuile${principal ? ' principal' : ''}">
        <span class="st-tuile-n">${p.disponible || principal ? p.n : '—'}</span>
        <span class="st-tuile-lib">${escapeHtml(lib)}</span>
      </div>`;
    const nouveaux = `<div class="st-tuiles">
        ${tuile(cmp.mois, nomMoisStatistiques(cmp.mois.cle, annee, court), true)}
        ${tuile(cmp.precedent, nomMoisStatistiques(cmp.precedent.cle, annee, court))}
        ${tuile(cmp.anPasse, nomMoisStatistiques(cmp.anPasse.cle, annee, court))}
      </div>
      <div class="st-ecarts w-fixe">${ecart(cmp.mois, cmp.precedent)} vs mois précédent · ${ecart(cmp.mois, cmp.anPasse)} vs l’an dernier</div>`;
    const sectionDelais = `<div class="w-section st-section">
        <h3 class="jour-carte-sous-titre">Délai moyen depuis l’avant-contrat${infoBulle('En jours, depuis la signature de l’avant-contrat (à défaut, l’ouverture du dossier dans CLAIRE), moyenne sur tous les dossiers de l’étude (archivés compris). Prêt : offre reçue ou obtention marquée réalisée. Préemption : renonciation trouvée sur le NAS ou validée à la main. Signature : date du rendez-vous passée.')}</h3>
        <ul class="st-delais">${lignesDelais.map(ligneDelai).join('')}</ul>
      </div>`;
    const sectionNouveaux = `<div class="w-section st-section">
        <h3 class="jour-carte-sous-titre">Avant-contrats signés${infoBulle(cmp.premiere ? `Dossiers par mois de signature de l’avant-contrat (à défaut, d’ouverture dans CLAIRE). « — » : CLAIRE ne suivait pas encore de dossier ce mois-là (premier dossier ouvert le ${formatDateFr(cmp.premiere)}). Le mois en cours est compté au jour d’aujourd’hui.` : 'Aucun dossier ouvert noté.')}</h3>
        ${nouveaux}
      </div>`;
    const actes = renderActesAgendaStatistiques(presentation);
    const corps = presentation === 'petit'
      ? `<h3 class="jour-carte-sous-titre">Délai moyen${infoBulle('En jours, depuis la signature de l’avant-contrat (à défaut, l’ouverture du dossier dans CLAIRE), moyenne sur tous les dossiers de l’étude.')}</h3>
         <ul class="st-delais">${lignesDelais.map(ligneDelai).join('')}</ul>
         <div class="st-ecarts w-fixe"><b>${cmp.mois.n}</b> avant-contrat${cmp.mois.n > 1 ? 's' : ''} en ${escapeHtml(nomMoisStatistiques(cmp.mois.cle, annee))} · ${ecart(cmp.mois, cmp.precedent)}</div>
         ${actes.ligne}`
      : (dispositionWidgetsCourante().find(x => x.id === 'statistiques') || {}).taille === 'grand'
        ? `<div class="st-duo st-trio">${sectionDelais}${sectionNouveaux}${actes.section}</div>`
        : `<div class="st-duo">${sectionDelais}${sectionNouveaux}</div>${actes.section}`;
    bloc.innerHTML = carteWidget({ presentation, classe: 'statistiques', titre: 'Statistiques', sous: 'Délais, avant-contrats et actes de l’année', corps });
  }

  // ---- Activité de l'étude (Tableau de bord) : suivi en direct, tous collaborateurs ----
  // Une seule source : l'historique des dossiers, déjà synchronisé entre les postes par le sondage
  // (toutes les 7 s) — la carte se met donc à jour toute seule, sans mécanisme de plus. On garde :
  //   - tout ce qu'un collaborateur a fait (entrée signée d'un auteur, voir ajouterHistorique) :
  //     tâche du jour validée, date saisie ou corrigée, pièce validée, email préparé, archivage… ;
  //   - ce que l'agenda de l'office a changé (entrées écrites par le serveur qui citent l'agenda :
  //     rendez-vous relevé, déplacé ou retiré, envoi relevé) et ce que CLAIRE y a écrit.
  // Le reste des écritures automatiques (pièces trouvées sur le NAS…) a déjà son bloc « Dernières
  // pièces » : le répéter ici noierait les gestes des collaborateurs. Tous les dossiers, archivés
  // compris (archiver est une action), sans filtre de collaborateur : c'est le fil de l'étude.
  var MAX_ACTIVITE_ETUDE = 25;
  var RE_ENTREE_AGENDA = /agenda/i;

  // Pure : ce que CLAIRE a relevé seule (pièces trouvées sur le NAS, offre reconnue…) — les entrées
  // d'historique sans auteur, hors agenda. Appoint du fil quand les collaborateurs ont peu agi : la
  // carte « En direct » ne reste jamais vide sur un dossier qui vit (étude, 29/09 au soir).
  function activiteAutomatique(tousDossiers, limite) {
    const entrees = [];
    for (const d of tousDossiers || []) {
      for (const h of d.historique || []) {
        if (!h || !h.date || !h.texte || h.auteur || RE_ENTREE_AGENDA.test(h.texte)) continue;
        entrees.push({ date: h.date, auteur: '', texte: h.texte, source: 'claire', dossierId: d.id, dossierNom: libelleDossierAffiche(d) });
      }
    }
    entrees.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return entrees.slice(0, limite || MAX_ACTIVITE_ETUDE);
  }

  function activiteEtude(tousDossiers, limite) {
    const entrees = [];
    for (const d of tousDossiers || []) {
      for (const h of d.historique || []) {
        if (!h || !h.date || !h.texte) continue;
        const agenda = RE_ENTREE_AGENDA.test(h.texte);
        if (!h.auteur && !agenda) continue;
        entrees.push({ date: h.date, auteur: h.auteur || '', texte: h.texte, source: agenda ? 'agenda' : 'dossier', dossierId: d.id, dossierNom: libelleDossierAffiche(d) });
      }
    }
    entrees.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return entrees.slice(0, limite || MAX_ACTIVITE_ETUDE);
  }

  // « à l'instant », « il y a 12 min », « il y a 3 h », « hier », « 24 sept. »
  function ilYaActivite(dateIso, maintenantMs) {
    const t = Date.parse(dateIso);
    if (isNaN(t)) return '';
    const maintenant = maintenantMs || Date.now();
    const min = Math.max(0, Math.round((maintenant - t) / 60000));
    if (min < 1) return 'à l’instant';
    if (min < 60) return `il y a ${min} min`;
    const auj = new Date(maintenant); auj.setHours(0, 0, 0, 0);
    if (t >= auj.getTime()) return `il y a ${Math.round(min / 60)} h`;
    if (t >= auj.getTime() - 86400000) return 'hier';
    return new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  }

  function initialesCollaborateur(nom) {
    return String(nom || '').split(/[\s-]+/).filter(Boolean).slice(0, 2).map(m => m[0].toUpperCase()).join('');
  }

  // Collaborateur dans les vues Tableau et Échéances du Suivi (étude, 01/10) : ses initiales dans une
  // pastille ronde, le nom complet au survol. Sans responsable : un tiret.
  function pastilleCollaborateur(nom) {
    const ini = initialesCollaborateur(nom);
    if (!ini) return '<span class="echeance-jours calme">—</span>';
    return `<span class="pastille-collab" title="${escapeAttr(nom)}" aria-label="${escapeAttr(nom)}">${escapeHtml(ini)}</span>`;
  }

  // ---- Suivi en direct, version visuelle (demandé par l'étude : « plus visuel et graphique ») ----
  // Chaque entrée reçoit une catégorie d'après son texte (pure et testable) : une icône et une
  // couleur de catégorie déjà en place, jamais une couleur inventée. L'ordre des règles compte :
  // l'agenda d'abord (source), puis les gestes terminés (« Tâche du jour « Relancer… » : faite »
  // est un geste fait, pas un email), les emails, les pièces, l'archivage, les dates ; le reste
  // est une simple modification de fiche.
  var CATEGORIES_ACTIVITE = [
    { cle: 'agenda', libelle: 'Agenda', icone: 'calendar' },
    { cle: 'fait', libelle: 'Faits', icone: 'check', re: /faite?s?\b|r[ée]alis[ée]|valid[ée]|not[ée] fait|d[ée]j[àa] fait|complet/i },
    { cle: 'email', libelle: 'Emails', icone: 'mail', re: /e-?mail|courriel|relance|questionnaire|brouillon|\.eml/i },
    { cle: 'piece', libelle: 'Pièces', icone: 'file-text', re: /pi[èe]ce|document|offre de pr[êe]t|\bNAS\b|obligation|engagement/i },
    { cle: 'archive', libelle: 'Archives', icone: 'archive', re: /archiv/i },
    { cle: 'date', libelle: 'Dates', icone: 'clock', re: /date|[ée]ch[ée]ance|rendez-vous|butoir/i },
    { cle: 'modif', libelle: 'Fiches', icone: 'pencil' }
  ];

  function categorieActivite(entree) {
    const e = entree || {};
    if (e.source === 'agenda') return CATEGORIES_ACTIVITE[0];
    const texte = String(e.texte || '');
    return CATEGORIES_ACTIVITE.find(c => c.re && c.re.test(texte)) || CATEGORIES_ACTIVITE[CATEGORIES_ACTIVITE.length - 1];
  }

  function isoLocalDepuisMs(ms) {
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // Pure : le rythme de l'étude — actions par jour sur les 7 derniers jours (aujourd'hui en dernier)
  // et, pour aujourd'hui, qui a fait quoi (l'agenda compte comme un contributeur à part).
  function rythmeActivite(entrees, maintenantMs) {
    const maintenant = maintenantMs || Date.now();
    const jours = [];
    for (let i = 6; i >= 0; i--) {
      const ms = maintenant - i * 86400000;
      const iso = isoLocalDepuisMs(ms);
      const nom = new Date(ms).toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '');
      jours.push({ iso, n: 0, lettre: nom.charAt(0).toUpperCase(), nom, aujourdhui: i === 0 });
    }
    const index = {};
    jours.forEach((j, i) => { index[j.iso] = i; });
    const parQui = {};
    (entrees || []).forEach(e => {
      const t = Date.parse(e.date);
      if (isNaN(t)) return;
      const iso = isoLocalDepuisMs(t);
      if (!(iso in index)) return;
      jours[index[iso]].n++;
      if (iso === jours[6].iso) {
        const qui = e.auteur || 'Agenda';
        parQui[qui] = (parQui[qui] || 0) + 1;
      }
    });
    const equipe = Object.keys(parQui).map(nom => ({ nom, n: parQui[nom], agenda: nom === 'Agenda' }))
      .sort((a, b) => b.n - a.n || a.nom.localeCompare(b.nom));
    return { jours, aujourdhui: jours[6].n, equipe, max: Math.max(1, ...jours.map(j => j.n)) };
  }

  // Pure : les entrées du fil, la même action (même auteur, même texte, même jour) faite sur plusieurs dossiers réunie en UNE ligne
  // (étude 24/10 : « Pièce « Non péril… » non réclamée » répété une fois par dossier). L'entrée gardée est la plus récente ;
  // `dossiers` = [{ id, nom }] de toutes, dans l'ordre du fil.
  function regrouperActivite(entrees, maintenantMs) {
    const parCle = new Map();
    const out = [];
    (entrees || []).forEach(e => {
      const cle = [e.auteur || e.source || '', e.texte || '', groupeJourActivite(e.date, maintenantMs)].join('|');
      const deja = parCle.get(cle);
      if (deja) {
        if (!deja.dossiers.some(x => x.id === e.dossierId)) deja.dossiers.push({ id: e.dossierId, nom: e.dossierNom });
        return;
      }
      const g = Object.assign({}, e, { dossiers: [{ id: e.dossierId, nom: e.dossierNom }] });
      parCle.set(cle, g);
      out.push(g);
    });
    return out;
  }

  // Pure : l'intitulé du groupe d'une entrée dans le fil.
  function groupeJourActivite(dateIso, maintenantMs) {
    const t = Date.parse(dateIso);
    if (isNaN(t)) return 'Plus tôt';
    const iso = isoLocalDepuisMs(t);
    const maintenant = maintenantMs || Date.now();
    if (iso === isoLocalDepuisMs(maintenant)) return "Aujourd'hui";
    if (iso === isoLocalDepuisMs(maintenant - 86400000)) return 'Hier';
    return 'Plus tôt';
  }

  // Filtre du fil par catégorie : appliqué en CSS (attribut data-filtre sur la liste), sans
  // reconstruire la carte ; retenu d'un rendu à l'autre.
  let filtreActivite = 'tout';
  function filtrerActivite(cle, bouton) {
    filtreActivite = cle;
    const carte = bouton ? bouton.closest('.activite-etude') : document.querySelector('.activite-etude');
    if (!carte) return;
    carte.setAttribute('data-filtre', cle);
    carte.querySelectorAll('.act-filtre').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.cle === cle)));
  }

  // Activité de l'étude, selon la présentation du widget (presentationWidget) :
  //  - petit : les actions du jour et les barres des 7 jours ;
  //  - moyen : ce résumé à gauche, le fil à droite (coupé à la hauteur de la tuile) ;
  //  - grand : résumé, filtres par catégorie et fil complet qui défile dans la carte.
  function renderActiviteEtude(tousDossiers, presentation) {
    const p = partiesActiviteEtude(tousDossiers, presentation);
    const corps = presentation === 'petit' ? p.resume + p.derniereHtml
      : presentation === 'moyen' ? `<div class="act-duo">${p.resume}${p.fil}</div>`
        : `${p.resume}${p.puces}${p.fil}`;
    return carteWidget({
      presentation: presentation || 'grand', classe: 'activite-etude', attributs: `data-filtre="${p.filtreCourant}"`,
      titre: 'Activité de l’étude',
      droite: '<span class="activite-direct"><span class="activite-direct-point"></span>En direct</span>',
      corps
    });
  }

  // Les morceaux de la carte « Activité de l'étude » (résumé du jour, filtres, fil, dernière action),
  // partagés par le widget du tableau de bord et le carré de la colonne du Suivi (étude, 01/10).
  // `max` : nombre d'entrées du fil (MAX_ACTIVITE_ETUDE par défaut).
  function partiesActiviteEtude(tousDossiers, presentation, max) {
    const limite = max || MAX_ACTIVITE_ETUDE;
    const maintenant = Date.now();
    const toutes = activiteEtude(tousDossiers, 5000);
    const rythme = rythmeActivite(toutes, maintenant);
    // Peu d'actions des collaborateurs : les relevés de CLAIRE complètent le fil (le rythme et
    // « qui a agi » restent ceux des collaborateurs).
    const brutes = toutes.length >= limite ? toutes.slice(0, limite * 3)
      : toutes.concat(activiteAutomatique(tousDossiers, limite * 3 - toutes.length))
        .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const entrees = regrouperActivite(brutes, maintenant).slice(0, limite);

    // Barres des 7 jours : hauteur proportionnelle au jour le plus chargé ; aujourd'hui en accent.
    const barres = rythme.jours.map(j => `<span class="act-jour-col${j.aujourdhui ? ' auj' : ''}" title="${escapeAttr(`${j.nom} : ${j.n} action${j.n > 1 ? 's' : ''}`)}"><span class="act-barre"><span style="--h:${Math.round(100 * j.n / rythme.max)}%"></span></span><span class="act-lettre">${j.lettre}</span></span>`).join('');
    const maxEquipe = Math.max(1, ...rythme.equipe.map(q => q.n));
    const equipe = rythme.equipe.length ? rythme.equipe.slice(0, 4).map(q => `
      <li class="act-qui" title="${escapeAttr(`${q.agenda ? 'Agenda de l’office' : q.nom} : ${q.n} aujourd’hui`)}">
        <span class="activite-avatar${q.agenda ? ' agenda' : ''}" aria-hidden="true">${q.agenda ? icone('calendar') : escapeHtml(initialesCollaborateur(q.nom))}</span>
        <span class="act-qui-barre"><span style="--w:${Math.round(100 * q.n / maxEquipe)}%"></span></span>
        <b>${q.n}</b>
      </li>`).join('') : '<li class="act-qui-vide">Personne encore aujourd’hui</li>';

    // Filtres : une pastille par catégorie présente dans le fil, icône + nombre d'entrées (le
    // libellé en infobulle, et affiché sur la pastille active) — tient sur une ligne.
    const compte = {};
    entrees.forEach(e => { const c = categorieActivite(e).cle; compte[c] = (compte[c] || 0) + 1; });
    const filtres = [{ cle: 'tout', libelle: 'Tout', n: entrees.length }]
      .concat(CATEGORIES_ACTIVITE.filter(c => compte[c.cle]).map(c => Object.assign({ n: compte[c.cle] }, c)));
    const filtreCourant = filtres.some(f => f.cle === filtreActivite) ? filtreActivite : 'tout';
    const puces = filtres.length > 2 ? `<div class="act-filtres" role="group" aria-label="Filtrer le fil">${filtres.map(f => `<button type="button" class="act-filtre act-cat-${f.cle}" data-cle="${f.cle}" aria-pressed="${f.cle === filtreCourant}" onclick="filtrerActivite('${f.cle}', this)" title="${escapeAttr(f.libelle)}" aria-label="${escapeAttr(`${f.libelle} (${f.n})`)}">${f.icone ? icone(f.icone) : ''}<span class="act-filtre-lib">${f.libelle}</span><span class="act-filtre-n">${f.n}</span></button>`).join('')}</div>` : '';

    let groupe = '';
    const lignes = entrees.map(e => {
      const recent = maintenant - Date.parse(e.date) < 15 * 60000;
      const qui = e.auteur ? prenomCollaborateur(e.auteur) : e.source === 'claire' ? 'CLAIRE' : 'Agenda';
      const cat = categorieActivite(e);
      const g = groupeJourActivite(e.date, maintenant);
      const tete = g !== groupe ? `<li class="act-groupe">${escapeHtml(g)}</li>` : '';
      groupe = g;
      const plusieurs = e.dossiers && e.dossiers.length > 1;
      const noms = plusieurs ? e.dossiers.map(x => x.nom).join(', ') : e.dossierNom;
      return `${tete}<li class="act-item" data-cat="${cat.cle}"><button type="button" class="activite-ligne${recent ? ' recente' : ''}" onclick="ouvrirDossierDepuisDashboard('${escapeOnclickArg(e.dossierId)}')" title="${escapeAttr(qui + ' — ' + e.texte + ' — ' + noms)}">
        <span class="act-pastille act-cat-${cat.cle}" aria-hidden="true">${icone(cat.icone)}</span>
        <span class="activite-texte"><b>${escapeHtml(qui)}</b> ${escapeHtml(e.texte)}<span class="activite-dossier"> · ${escapeHtml(plusieurs ? e.dossiers.length + ' dossiers' : e.dossierNom)}</span></span>
        <span class="activite-quand">${escapeHtml(ilYaActivite(e.date, maintenant))}</span>
      </button></li>`;
    }).join('');

    const resume = `<div class="act-resume">
        <div class="act-compteur"><span class="act-compteur-num">${rythme.aujourdhui}</span><span class="act-compteur-lib">action${rythme.aujourdhui > 1 ? 's' : ''} aujourd’hui</span></div>
        <div class="act-semaine" role="img" aria-label="${escapeAttr('Actions par jour sur 7 jours : ' + rythme.jours.map(j => `${j.nom} ${j.n}`).join(', '))}">${barres}</div>
        ${presentation === 'petit' ? '' : `<ul class="act-equipe" aria-label="Qui a agi aujourd’hui">${equipe}</ul>`}
      </div>`;
    const fil = lignes
      ? `<ul class="activite-liste">${lignes}</ul>`
      : '<p class="activite-vide">Rien pour l’instant : les actions des collaborateurs et les changements de l’agenda s’afficheront ici.</p>';
    // En petit, la dernière action de l'étude occupe le bas de la tuile.
    const derniere = entrees[0];
    const derniereHtml = derniere ? `<div class="w-bas" data-ajuster="2"><button type="button" class="w-prochaine" onclick="ouvrirDossierDepuisDashboard('${escapeOnclickArg(derniere.dossierId)}')">
        <span class="w-prochaine-sous">${escapeHtml(derniere.auteur ? prenomCollaborateur(derniere.auteur) : derniere.source === 'claire' ? 'CLAIRE' : 'Agenda')} · ${escapeHtml(ilYaActivite(derniere.date, maintenant))}</span>
        <span class="w-prochaine-titre">${escapeHtml(derniere.texte)}</span></button></div>` : '';
    return { resume, puces, fil, derniereHtml, filtreCourant };
  }


  // « Dernières pièces trouvées » (Tableau de bord, demandé par l'étude au carnet de bord) : un
  // RAPPEL des pièces arrivées sur le NAS ces derniers jours, qui reste lisible après consultation
  // — contrairement à l'ancien bloc « Pièces reçues, pas encore consultées », qui disparaissait dès
  // que la fiche avait été ouverte. Les pièces pas encore vues gardent leur repère « Nouveau »
  // (d.piecesNotifications, même état que le badge de la sidebar et le tag de la fiche), et
  // remontent en tête. La date vient de d.piecesTrouveesLe, posée par verifierDossierLocal à chaque
  // pièce trouvée ou renouvelée ; une notification plus ancienne que ce champ n'a pas de date et
  // s'affiche quand même, en tête, marquée « Nouveau ».
  var JOURS_DERNIERES_PIECES = 14;
  var MAX_DERNIERES_PIECES = 6;   // demandé par l'étude : au plus 6 sur le tableau de bord

  // Pure et testable : une entrée par (dossier, pièce), les non vues d'abord puis la plus récente.
  function dernieresPiecesTrouvees(dossiersActifs, maintenantMs, max) {
    const limite = (maintenantMs || Date.now()) - JOURS_DERNIERES_PIECES * 86400000;
    const entrees = [];
    for (const d of dossiersActifs) {
      const nouvelles = new Set(d.piecesNotifications || []);
      const dates = d.piecesTrouveesLe || {};
      const cles = new Set([...Object.keys(dates), ...nouvelles]);
      for (const cle of cles) {
        const le = dates[cle] || null;
        const nouvelle = nouvelles.has(cle);
        if (!nouvelle && (!le || Date.parse(le) < limite)) continue;
        entrees.push({ dossier: d, cle, le, nouvelle });
      }
    }
    entrees.sort((a, b) => (b.nouvelle - a.nouvelle) || String(b.le || '').localeCompare(String(a.le || '')));
    return entrees.slice(0, max || MAX_DERNIERES_PIECES);
  }

  // Pure : les pièces encore attendues sur les dossiers reliés (hors participation), regroupées par
  // pièce — « Diagnostics techniques · 4 dossiers » — les plus attendues d'abord.
  function piecesEncoreAttendues(dossiersActifs) {
    const parLibelle = new Map();
    (dossiersActifs || []).forEach(d => {
      if (!d || d.archive || !d.dossierLie || d.roleNotaire === 'participant') return;
      checklistPieces(d.typeVente, d).forEach(p => {
        if ((d.pieces || {})[p.cle] === 'recue') return;
        const l = parLibelle.get(p.label) || [];
        l.push(d);
        parLibelle.set(p.label, l);
      });
    });
    return Array.from(parLibelle, ([libelle, ds]) => ({ libelle, dossiers: ds }))
      .sort((a, b) => b.dossiers.length - a.dossiers.length || a.libelle.localeCompare(b.libelle, 'fr'));
  }

  // Scans du copieur pour la carte « Dernières pièces » (étude, 30/09 : « dessous les scans à ranger
  // et/ou déjà rangés ») : ceux qui attendent dans le dossier Scan (les plus récents d'abord) et
  // ceux rangés ces 14 derniers jours (journal du serveur, le plus récent d'abord). Rien tant que le
  // classement n'est pas activé ou que le serveur n'a pas répondu. Pure.
  function scansPourCarte(etat, maintenantMs) {
    const e = etat || {};
    if (!e.charge || !e.reglages || !e.reglages.actif) return { actif: false, aRanger: [], ranges: [] };
    const limite = (maintenantMs || Date.now()) - JOURS_DERNIERES_PIECES * 86400000;
    const aRanger = (e.scans || []).slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    const ranges = (e.journal || []).filter(j => j && j.date && Date.parse(j.date) >= limite)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return { actif: true, aRanger, ranges };
  }

  // Libellé d'un type de scan (« État daté »), ou '' s'il est inconnu. Pure.
  function libelleTypeScan(cle) {
    const t = TYPES_SCAN.find(x => x.cle === cle);
    return t ? t.label : '';
  }

  // Carte « Dernières pièces », selon la présentation du widget (presentationWidget) :
  //  - petit : combien de pièces sont arrivées en 14 jours, dont les nouvelles, et la dernière ;
  //  - moyen : la liste (au plus 6, demandé par l'étude) ;
  //  - grand : la liste, puis les pièces encore attendues, regroupées par pièce.
  function renderPiecesRecuesDashboard(dossiersActifs) {
    const section = document.getElementById('dash-nouveautes');
    if (!section) return;
    const entrees = dernieresPiecesTrouvees(dossiersActifs);
    const presentation = presentationWidget('pieces');
    // Toujours affichée (étude, 29/09 au soir : elle disparaissait sans pièce récente) : sans arrivée
    // sur 14 jours, elle dit ce qui est encore attendu.
    const attendues = piecesEncoreAttendues(dossiersActifs);
    section.style.display = '';
    const ligne = (e) => {
      const quand = e.le ? new Date(e.le).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '';
      return `
        <button type="button" class="action-urgente-ligne derniere-piece${e.nouvelle ? ' nouvelle' : ''}" onclick="ouvrirDossierDepuisDashboard('${escapeOnclickArg(e.dossier.id)}')"
          title="${escapeAttr(libelleNotificationPiece(e.dossier, e.cle) + ' — ' + libelleDossierAffiche(e.dossier) + (e.nouvelle ? ' (nouveau)' : ''))}">
          <span class="derniere-piece-point" aria-hidden="true"></span>
          <span class="derniere-piece-texte"><b>${escapeHtml(libelleNotificationPiece(e.dossier, e.cle))}</b><span class="derniere-piece-dossier"> · ${escapeHtml(libelleDossierAffiche(e.dossier))}</span></span>
          <span class="derniere-piece-date">${escapeHtml(quand)}</span>
        </button>`;
    };
    const nouvelles = entrees.filter(e => e.nouvelle).length;
    const scans = scansPourCarte(etatScans);
    const quandCourt = (iso) => iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '';
    const ligneARanger = (sc) => {
      const l = lecturesScans[cleScan(sc)];
      const p = l && l.proposition;
      const dossier = p && p.dossierId && (dossiers || []).find(x => x.id === p.dossierId);
      const titre = (p && libelleTypeScan(p.type)) || 'Scan à identifier';
      return `
        <button type="button" class="action-urgente-ligne derniere-piece scan-a-ranger" onclick="definirOnglet('scans')" title="${escapeAttr(sc.nom + ' — à ranger')}">
          <span class="derniere-piece-point" aria-hidden="true"></span>
          <span class="derniere-piece-texte"><b>${escapeHtml(titre)}</b><span class="derniere-piece-dossier"> · ${escapeHtml(dossier ? libelleDossierAffiche(dossier) : sc.nom)}</span></span>
          <span class="derniere-piece-date">${escapeHtml(quandCourt(sc.date))}</span>
        </button>`;
    };
    const ligneRange = (j) => {
      const titre = libelleTypeScan(j.type) || j.nom;
      const dossier = (dossiers || []).find(x => x.id === j.dossierId);
      const clic = dossier ? `ouvrirDossierDepuisDashboard('${escapeOnclickArg(dossier.id)}')` : "definirOnglet('scans')";
      return `
        <button type="button" class="action-urgente-ligne derniere-piece scan-range" onclick="${clic}"
          title="${escapeAttr(`${titre} — ${j.dossier || ''} — rangé ${j.auto ? 'automatiquement' : 'à la main'}${j.rubrique ? ' dans ' + j.rubrique : ''}`)}">
          <span class="derniere-piece-point" aria-hidden="true"></span>
          <span class="derniere-piece-texte"><b>${escapeHtml(titre)}</b><span class="derniere-piece-dossier"> · ${escapeHtml(dossier ? libelleDossierAffiche(dossier) : libelleDossierParNom(j.dossier || ''))}${j.auto ? ' · auto' : ''}</span></span>
          <span class="derniere-piece-date">${escapeHtml(quandCourt(j.date))}</span>
        </button>`;
    };
    const sectionsScans = !scans.actif ? '' : `
        ${scans.aRanger.length ? `<div class="w-section">
          <h3 class="jour-carte-sous-titre">Claire Scan · ${scans.aRanger.length} à ranger</h3>
          <div class="dash-liste dash-liste-carte" data-ajuster="2" data-min="1">${scans.aRanger.map(ligneARanger).join('')}</div>
        </div>` : ''}
        ${scans.ranges.length ? `<div class="w-section">
          <h3 class="jour-carte-sous-titre">Scans rangés</h3>
          <div class="dash-liste dash-liste-carte" data-ajuster="3">${scans.ranges.map(ligneRange).join('')}</div>
        </div>` : ''}`;
    let corps;
    if (presentation === 'petit') {
      corps = `<div class="w-chiffre-bloc"><span class="w-chiffre">${entrees.length}</span><span class="w-chiffre-lib">pièce${entrees.length > 1 ? 's' : ''} en ${JOURS_DERNIERES_PIECES} jours</span></div>
        ${nouvelles ? `<span class="dot-label dl-urgent notif-nouveau-tag w-fixe"><span class="dot"></span>${nouvelles} nouvelle${nouvelles > 1 ? 's' : ''}</span>` : ''}
        ${entrees[0] ? `<div class="w-bas" data-ajuster="2"><button type="button" class="w-prochaine" onclick="ouvrirDossierDepuisDashboard('${escapeOnclickArg(entrees[0].dossier.id)}')">
          <span class="w-prochaine-titre">${escapeHtml(libelleNotificationPiece(entrees[0].dossier, entrees[0].cle))}</span>
          <span class="w-prochaine-sous">${escapeHtml(libelleDossierAffiche(entrees[0].dossier))}</span></button></div>`
          : attendues[0] ? `<div class="w-bas" data-ajuster="2"><div class="w-prochaine w-prochaine-info">
          <span class="w-prochaine-sous">La plus attendue</span>
          <span class="w-prochaine-titre">${escapeHtml(attendues[0].libelle)} · ${attendues[0].dossiers.length} dossier${attendues[0].dossiers.length > 1 ? 's' : ''}</span></div></div>` : ''}
        ${scans.aRanger.length ? `<button type="button" class="dot-label dl-pret w-fixe scan-a-ranger-tag" onclick="definirOnglet('scans')"><span class="dot"></span>${scans.aRanger.length} scan${scans.aRanger.length > 1 ? 's' : ''} à ranger</button>` : ''}`;
    } else {
      corps = `${entrees.length ? `<div class="dash-liste dash-liste-carte" data-ajuster="1" data-min="1">${entrees.map(ligne).join('')}</div>` : '<p class="w-message w-fixe">Aucune pièce arrivée ces 14 derniers jours.</p>'}
        ${sectionsScans}
        ${attendues.length ? `<div class="w-section">
          <h3 class="jour-carte-sous-titre">Encore attendues</h3>
          <ul class="w-lignes" data-ajuster="4">${attendues.map(p => `<li class="w-ligne" title="${escapeAttr(p.dossiers.map(d => libelleDossierAffiche(d)).join(', '))}">
            <span class="w-ligne-texte">${escapeHtml(p.libelle)}</span>
            <span class="w-ligne-meta">${p.dossiers.length} dossier${p.dossiers.length > 1 ? 's' : ''}</span></li>`).join('')}</ul>
        </div>` : ''}`;
    }
    section.innerHTML = carteWidget({
      presentation,
      titre: 'Dernières pièces',
      sous: `${scans.actif ? 'NAS et scans' : 'NAS'} · ${JOURS_DERNIERES_PIECES} derniers jours`,
      corps
    });
    planifierAjustementWidgets();
  }

  // ---- Avancement des dossiers (Tableau de bord) ----
  // Une ligne par dossier : un pourcentage d'avancement, une barre, un statut et le prix de vente.
  // Remplace le diagramme de Gantt (demande de l'étude, d'après une maquette « Avancement / Dans
  // les délais / À surveiller / En retard »). Le pourcentage est pour moitié les ÉTAPES du dossier
  // (vente préalable, prêt, appel de fonds, projet, signature — seules celles qui s'appliquent),
  // pour moitié les PIÈCES de sa checklist reçues ; sans checklist (participation), les étapes
  // seules. Le statut ne se calcule pas une seconde fois : c'est la gravité du point le plus
  // urgent de « À traiter » (pointsATraiter), pour que les deux blocs disent toujours la même chose.
  var ETAPES_AVANCEMENT = [
    { type: 'ventebien', label: 'Vente préalable' },
    { type: 'pret', label: 'Obtention du prêt' },
    { type: 'fixerRdv', label: 'Rendez-vous fixé' },
    { type: 'appelFonds', label: 'Envoi appel de fonds' },
    { type: 'projetEnvoye', label: 'Envoi projet' },
    { type: 'signature', label: 'Signature' }
  ];
  var STATUTS_AVANCEMENT = {
    retard: { texte: 'En retard', dl: 'dl-urgent', ordre: 0 },
    surveiller: { texte: 'À surveiller', dl: 'dl-pret', ordre: 1 },
    delais: { texte: 'Dans les délais', dl: 'dl-success', ordre: 2 }
  };

  function isoDepuisMs(ms) {
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }

  // Pure et testable. `aujourdhuiIso` injectée pour que le calcul ne dépende pas de l'horloge.
  function avancementDossier(d, aujourdhuiIso) {
    const etapes = etapesAvancement(d, aujourdhuiIso);
    const etapesFaites = etapes.filter(e => e.fait).length;
    const pieces = d.roleNotaire === 'participant' ? [] : checklistPieces(d.typeVente, d);
    const piecesRecues = pieces.filter(p => (d.pieces || {})[p.cle] === 'recue').length;
    const partEtapes = etapes.length ? etapesFaites / etapes.length : 0;
    const pct = pieces.length
      ? Math.round(50 * partEtapes + 50 * (piecesRecues / pieces.length))
      : Math.round(100 * partEtapes);
    const prochaine = etapes.find(e => !e.fait);
    return {
      pct, etapesFaites, etapesTotal: etapes.length, piecesRecues, piecesTotal: pieces.length,
      prochaine: prochaine ? prochaine.label : null
    };
  }

  // Pure : les étapes qui s'appliquent au dossier, chacune avec sa date et son état. Sert au
  // pourcentage ci-dessus et au détail pas à pas de la fiche dossier (renderAvancementFiche).
  // `iso` est la date à afficher en regard de l'étape, jamais une date inventée : vide si le
  // dossier n'en porte pas.
  function etapesAvancement(d, aujourdhuiIso) {
    // Succession (étude 15/10) : son propre déroulé (commun/succession.js).
    if (estSuccession(d)) return etapesSuccession(d, aujourdhuiIso).map(e => ({ type: e.type, label: e.label, fait: e.fait, iso: e.iso || '' }));
    return ETAPES_AVANCEMENT.filter(e => {
      if (e.type === 'ventebien') return !!d.ventebien;
      if (e.type === 'pret') return !d.sansPret;
      return true;
    }).map(e => {
      // La signature n'est faite qu'une fois le rendez-vous passé ; les autres étapes suivent la
      // même règle que partout ailleurs (offre reçue, date saisie, relevé dans l'agenda…).
      // Pour les deux envois, une date saisie vaut envoi fait (même règle que la carte « Envoi au
      // client »), y compris sur un dossier dont la date précède ce drapeau.
      const fait = e.type === 'signature'
        ? !!dateSignatureDossier(d, aujourdhuiIso)
        : echeanceValidee(d, e.type) || ((e.type === 'appelFonds' || e.type === 'projetEnvoye') && !!d[e.type]);
      const iso = (e.type === 'signature' || e.type === 'fixerRdv') ? (d.rendezVousSignature || '') : (d[e.type] || '');
      return { type: e.type, label: e.label, fait, iso };
    });
  }

  // Pure : le statut d'un dossier d'après la gravité de son point le plus urgent dans « À traiter ».
  function statutAvancement(gravite) {
    if (gravite === 'critique') return 'retard';
    if (gravite === 'vigilance') return 'surveiller';
    return 'delais';
  }

  // Pure et testable : les lignes du bloc, les plus urgentes d'abord, puis les moins avancées.
  function lignesAvancement(dossiersActifs, aujourdhuiIso) {
    const gravites = new Map(pointsATraiter(dossiersActifs, aujourdhuiIso).map(p => [p.dossier.id, p.gravite]));
    return (dossiersActifs || []).filter(d => d && !d.archive).map(d => {
      const statut = statutAvancement(gravites.get(d.id));
      return { dossier: d, statut, ...avancementDossier(d, aujourdhuiIso) };
    }).sort((a, b) => (STATUTS_AVANCEMENT[a.statut].ordre - STATUTS_AVANCEMENT[b.statut].ordre) || (a.pct - b.pct));
  }

  // Carte « Avancement des dossiers », selon la présentation du widget (presentationWidget) :
  //  - petit : l'avancement moyen et la répartition En retard / À surveiller / Dans les délais ;
  //  - moyen : une ligne compacte par dossier (nom, jauge, pourcentage, état) ;
  //  - grand : deux lignes par dossier (état, étapes, pièces, prochaine étape, prix, jauge).
  // Les plus urgents d'abord ; ce qui ne tient pas mène au Suivi (« Voir N de plus »).
  function renderAvancementDossiers(dossiersActifs) {
    const section = document.getElementById('dash-avancement');
    if (!section) return;
    const toutes = lignesAvancement(dossiersActifs, isoDepuisMs(Date.now()));
    if (!toutes.length) {
      section.style.display = 'none';
      section.innerHTML = '';
      return;
    }
    section.style.display = '';
    const presentation = presentationWidget('avancement');
    const moyenne = Math.round(toutes.reduce((t, l) => t + l.pct, 0) / toutes.length);
    const parStatut = { retard: 0, surveiller: 0, delais: 0 };
    toutes.forEach(l => { parStatut[l.statut]++; });
    const sous = `${toutes.length} dossier${toutes.length > 1 ? 's' : ''} · ${moyenne} % en moyenne`;
    let corps;
    if (presentation === 'petit') {
      corps = `<div class="w-chiffre-bloc"><span class="w-chiffre">${moyenne}<small>%</small></span><span class="w-chiffre-lib">en moyenne</span></div>
        <span class="avancement-barre w-barre" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${moyenne}" aria-label="Avancement moyen ${moyenne} %"><span style="width:${moyenne}%"></span></span>
        <ul class="w-repartition">${Object.keys(STATUTS_AVANCEMENT).map(k => `<li><span class="dot-label ${STATUTS_AVANCEMENT[k].dl}"><span class="dot"></span>${STATUTS_AVANCEMENT[k].texte}</span><b>${parStatut[k]}</b></li>`).join('')}</ul>`;
    } else if (presentation === 'moyen') {
      corps = `<ul class="w-lignes w-avancement" data-ajuster="1" data-min="1">${toutes.map(l => {
        const e = etatDossier(l.dossier);
        const nom = libelleDossierAffiche(l.dossier);
        return `<li><button type="button" class="w-ligne w-ligne-avancement statut-${l.statut}" onclick="ouvrirDossierDepuisDashboard('${escapeOnclickArg(l.dossier.id)}')" title="${escapeAttr(nom + ' — ' + e.detail)}">
          <span class="w-ligne-texte">${escapeHtml(nom)}</span>
          <span class="avancement-barre" aria-hidden="true"><span style="width:${l.pct}%"></span></span>
          <span class="w-ligne-pct">${l.pct}%</span>
          <span class="avancement-pilule ${e.dl}">${escapeHtml(e.texte)}</span></button></li>`;
      }).join('')}${plusWidget("definirOnglet('suivi')")}</ul>`;
    } else {
      corps = `<ul class="w-lignes w-avancement-riche" data-ajuster="1" data-min="1">${toutes.map(l => {
        // Le badge est l'état du dossier (même badge que le Suivi et la fiche) ; l'ordre de la liste
        // reste celui de l'urgence (lignesAvancement).
        const e = etatDossier(l.dossier);
        const detail = [`${l.etapesFaites}/${l.etapesTotal} étapes`];
        if (l.piecesTotal) detail.push(`${l.piecesRecues}/${l.piecesTotal} pièces`);
        if (l.dossier.prixVente) detail.push(formaterPrix(l.dossier.prixVente));
        if (l.prochaine) detail.push(l.prochaine);
        const nom = libelleDossierAffiche(l.dossier);
        return `<li><button type="button" class="w-avancement-ligne statut-${l.statut}" onclick="ouvrirDossierDepuisDashboard('${escapeOnclickArg(l.dossier.id)}')" title="${escapeAttr(nom + ' — ' + e.detail)}">
          <span class="w-av-nom">${escapeHtml(nom)}</span>
          <span class="avancement-pilule ${e.dl}">${escapeHtml(e.texte)}</span>
          <span class="w-av-detail">${escapeHtml(detail.join(' · '))}</span>
          <span class="avancement-barre" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${l.pct}" aria-label="Avancement ${l.pct} %"><span style="width:${l.pct}%"></span></span>
          <span class="w-ligne-pct">${l.pct}%</span></button></li>`;
      }).join('')}${plusWidget("definirOnglet('suivi')")}</ul>`;
    }
    section.innerHTML = carteWidget({
      presentation,
      titre: presentation === 'petit' ? 'Avancement' : 'Avancement des dossiers',
      sous: presentation === 'petit' ? `${toutes.length} dossier${toutes.length > 1 ? 's' : ''}` : escapeHtml(sous),
      corps
    });
    planifierAjustementWidgets();
  }

  // Ouvre un dossier depuis le tableau de bord : bascule vers le Suivi et ouvre sa fiche dans le
  // tiroir latéral, exactement comme un clic sur sa ligne (même chemin, voir ouvrirDossierDrawer).
  function ouvrirDossierDepuisDashboard(id) {
    definirOnglet('suivi');
    ouvrirDossierDrawer(id);
  }

  // Recherche de dossier depuis le tableau de bord : contrairement au Suivi (recherche-dossiers,
  // qui filtre une liste de lignes déjà affichée), le tableau de bord ne montre jamais tous les
  // dossiers — un menu de résultats s'ouvre donc sous le champ dès qu'on tape, chaque résultat
  // menant directement au tiroir du dossier via le même chemin que "Actions urgentes".
  function renderRechercheDashboard(dossiersActifs) {
    const input = document.getElementById('recherche-dashboard');
    const bloc = document.getElementById('dash-recherche-resultats');
    if (!input || !bloc) return;
    const q = normaliserPourRecherche(input.value.trim());
    if (!q) {
      bloc.style.display = 'none';
      bloc.innerHTML = '';
      return;
    }
    const resultats = dossiersActifs
      .filter(d => normaliserPourRecherche(libelleDossierAffiche(d) + ' ' + (d.responsable || '')).includes(q))
      .slice(0, 8);
    bloc.innerHTML = resultats.length === 0
      ? '<div class="dash-recherche-vide">Aucun dossier ne correspond.</div>'
      : resultats.map(d => `
        <button type="button" class="dash-recherche-ligne" onclick="ouvrirDossierDepuisDashboardRecherche('${escapeOnclickArg(d.id)}')">
          ${renderBadgeStatut(d)}
          <span class="dash-recherche-nom">${escapeHtml(libelleDossierAffiche(d))}</span>
          <span class="dash-recherche-resp">${escapeHtml(d.responsable || '')}</span>
        </button>`).join('');
    bloc.style.display = 'block';
  }

  // Vide le champ avant d'ouvrir le tiroir : sans ça, le menu de résultats resterait affiché
  // (avec la même recherche) une fois revenu sur le Tableau de bord.
  function ouvrirDossierDepuisDashboardRecherche(id) {
    const input = document.getElementById('recherche-dashboard');
    if (input) input.value = '';
    ouvrirDossierDepuisDashboard(id);
  }

  // Bascule entre les deux espaces de travail : « Nouveau dossier » (formulaire + aperçu PDF) et
  // « Suivi des dossiers » (liste complète, en pleine largeur). Choix non persisté : l'app rouvre
  // toujours sur « Nouveau dossier », cohérent avec le panneau replié/déplié qui n'est pas non
  // plus mémorisé d'une session à l'autre.
  // Les 3 étapes du formulaire "Nouveau dossier" (Importer / Vérifier / Finaliser) sont de simples
  // panneaux affichés un par un — aucune étape n'est verrouillée tant que la précédente n'est pas
  // remplie : un dossier peut toujours être créé entièrement à la main, sans jamais importer de PDF,
  // exactement comme avant ce découpage en étapes. Seule la présentation change.
  let etapeWizardActuelle = 1;
  // Une succession reprise d'Authentic est en cours de création (assistant réduit : pas de vente).
  function successionEnCoursWizard() {
    return !!exportAuthenticActuel && typeAffaireAuthentic(exportAuthenticActuel) === 'succession';
  }

  function definirEtapeWizard(n) {
    etapeWizardActuelle = n;
    const panneau = document.getElementById('panel');
    if (panneau) panneau.classList.toggle('wizard-succession', successionEnCoursWizard());
    adapterChampsWizardSuccession(successionEnCoursWizard());
    if (n === 1) { renderChoixImport(); chargerRelevesAuthenticRecents(); }
    // Ce qui a nourri le dossier se lit sous chaque étape du haut : plus de lignes de sources ici.
    // Trois étapes (étude, 02/10 au soir) : Importer · Vérifier (données, dossier, avant-contrat) · Valider.
    for (let i = 1; i <= 3; i++) {
      document.getElementById('wizard-step-' + i).classList.toggle('actif', i === n);
      document.getElementById('wizard-step-btn-' + i).classList.toggle('actif', i === n);
    }
    majStepperWizard();
    // L'encadré « Ce que CLAIRE repère » ne sert qu'avant l'import : retiré dès l'étape 2.
    document.body.classList.toggle('wizard-avance', n > 1);
    if (n > 1) { const onglet = document.getElementById('onglet-nouveau'); if (onglet) onglet.classList.remove('nd-accueil'); }
    if (n === 2) {
      majMarquesPreRemplies();
      remplirListeNotairesWizard(notairesProposesWizard().map(x => x.nom));
      majApercuPieces();
      if (extractionActuelle) renderPanneauRevision(extractionActuelle);
      renderComparaisonComplement();
    }
    if (n === 3) { if (complementDossierId) renderRecapComplement(); else renderRecapWizard(); }
    const wrap = document.querySelector('.wrap');
    if (wrap) wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Pure : le récapitulatif de l'étape « Valider » — une ligne par donnée, vide = « À compléter ».
  function lignesRecapWizard(v) {
    const x = v || {};
    const date = iso => iso ? formatDateFr(iso) : '';
    const lignes = [
      { libelle: 'Dossier', valeur: x.nom || '' },
      { libelle: 'Vendeur', valeur: (x.vendeurs || []).join(', '), vente: true },
      { libelle: 'Acquéreur', valeur: (x.acquereurs || []).join(', '), vente: true },
      { libelle: 'Bien', valeur: [x.adresse, x.typeVente].filter(Boolean).join(' · ') },
      { libelle: 'Prix', valeur: x.prix ? formaterPrix(x.prix) : '', vente: true },
      { libelle: 'Responsable', valeur: x.responsable || '' },
      { libelle: 'Notaires', valeur: x.notaireVendeur && x.notaireVendeur === x.notaireAcquereur
        ? `${x.notaireVendeur} (les deux côtés)`
        : [x.notaireVendeur && `${x.notaireVendeur} (vendeur)`, x.notaireAcquereur && `${x.notaireAcquereur} (acquéreur)`].filter(Boolean).join(' · '), vente: true },
      { libelle: 'Obtention du prêt', valeur: x.sansPret ? 'Sans prêt' : date(x.pret), vente: true },
      { libelle: 'Vente préalable', valeur: date(x.ventebien), vente: true, facultatif: true },
      { libelle: 'Signature de l’acte', valeur: date(x.acte), vente: true },
      { libelle: 'Engagements du vendeur', valeur: x.nbEngagements ? String(x.nbEngagements) : '', vente: true, facultatif: true },
      { libelle: 'Pièces d’Authentic', valeur: x.piecesAuthentic ? `${x.piecesAuthentic} marquée${x.piecesAuthentic > 1 ? 's' : ''} reçue${x.piecesAuthentic > 1 ? 's' : ''}` : '', facultatif: true }
    ];
    // Succession (étude 16/10) : ses propres lignes (défunt, décès, héritiers…) après le nom du dossier.
    if (x.succession && Array.isArray(x.lignesSuccession)) lignes.splice(1, 0, ...x.lignesSuccession);
    return lignes.filter(l => !(x.succession && (l.vente || (x.lignesSuccession && l.libelle === 'Bien')))).filter(l => l.valeur || !l.facultatif);
  }

  function renderRecapWizard() {
    const cible = document.getElementById('recap-wizard');
    if (!cible) return;
    const val = id => { const el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; };
    const texteOption = id => { const el = document.getElementById(id); return el && el.selectedIndex >= 0 && el.value ? el.options[el.selectedIndex].text : ''; };
    const parties = role => ((extractionActuelle && extractionActuelle.parties) || []).filter(p => p.role === role).map(p => p.nom);
    const caseAuthentic = document.getElementById('f-pieces-authentic');
    const nbAuthentic = caseAuthentic && caseAuthentic.checked ? (Number(caseAuthentic.dataset.nombre) || 1) : 0;
    const togglePret = document.getElementById('toggle-pret');
    const toggleVente = document.getElementById('toggle-ventebien');
    const lignes = lignesRecapWizard({
      nom: val('f-nom'), vendeurs: parties('VENDEUR'), acquereurs: parties('ACQUEREUR'),
      adresse: val('f-adresse-bien'), typeVente: successionEnCoursWizard() ? '' : texteOption('f-type-vente'), prix: eurosDepuisSaisie(val('f-prix-vente')),
      responsable: val('f-responsable'), notaireVendeur: val('f-notaire-vendeur'), notaireAcquereur: val('f-notaire-acquereur'),
      sansPret: togglePret ? !togglePret.checked : false, pret: val('f-pret'), acte: val('f-acte'),
      ventebien: toggleVente && toggleVente.checked ? val('f-ventebien') : '',
      nbEngagements: (analyseJuridiqueActuelle.engagements || []).length, piecesAuthentic: nbAuthentic,
      succession: successionEnCoursWizard(),
      lignesSuccession: successionEnCoursWizard() ? lignesRecapSuccession(saisieWizardSuccession(), propositionWizardSuccession(exportAuthenticActuel)) : null
    });
    const reste = etatRevision && extractionActuelle && !successionEnCoursWizard() ? etatRevision.aValider : 0;
    const etat = reste
      ? `<div class="recap-etat"><span class="dot-label dl-pret"><span class="dot"></span>${reste} donnée${reste > 1 ? 's' : ''} pas encore validée${reste > 1 ? 's' : ''}</span><button type="button" class="lien-action" onclick="definirEtapeWizard(2)">Revenir à Vérifier</button></div>`
      : '';
    cible.innerHTML = `${etat}<dl class="recap-liste">${lignes.map(l =>
      `<div class="recap-ligne"><dt>${escapeHtml(l.libelle)}</dt><dd${l.valeur ? '' : ' class="recap-manque"'}>${escapeHtml(l.valeur || 'À compléter')}</dd></div>`).join('')}</dl>`;
  }

  // Pure : l'état de chaque étape de « Nouveau dossier » — faite, et ce qu'elle dit (sous-titre).
  function etatStepperWizard(e) {
    const x = e || {};
    // Sous-titre = un état seulement (étude 02/10 : « trop de texte ») ; rien tant qu'il n'y a rien à dire.
    const source = x.compromis && x.authentic ? 'Compromis + Authentic' : x.compromis ? 'Compromis lu'
      : x.authentic ? 'Repris d’Authentic' : '';
    const r = x.revision || {};
    const verifier = !(x.compromis || x.authentic) ? ''
      : r.aValider ? `${r.aValider} à valider` : r.validees ? 'Tout est validé' : '';
    return [
      { fait: !!(x.compromis || x.authentic) && x.etape > 1, sous: source },
      // Faite seulement quand plus rien n'est à valider (passer l'étape ne suffit pas).
      { fait: !!(x.compromis || x.authentic) && !r.aValider && !!r.validees, sous: verifier },
      { fait: false, sous: '' }
    ];
  }

  function majStepperWizard() {
    const etats = etatStepperWizard({
      etape: etapeWizardActuelle, compromis: !!dernierTexteTraite, authentic: !!exportAuthenticActuel, revision: etatRevision
    });
    etats.forEach((e, i) => {
      const btn = document.getElementById('wizard-step-btn-' + (i + 1));
      const sous = document.getElementById('wizard-step-sous-' + (i + 1));
      const num = btn && btn.querySelector('.wizard-step-num');
      if (!btn) return;
      btn.classList.toggle('fait', e.fait);
      if (num) num.innerHTML = e.fait ? icone('check') : String(i + 1);
      if (sous) sous.textContent = e.sous;
    });
  }

  // Étape « Finaliser » : un champ rempli par CLAIRE (compromis, Authentic) et pas retouché porte
  // « Pré-rempli » à côté de son libellé — à relire avant d'enregistrer.
  var CHAMPS_PRE_REMPLIS_FINALISER = ['f-nom', 'f-adresse-bien', 'f-prix-vente', 'f-nom-agence', 'f-honoraires-agence', 'f-prix-mobilier', 'f-depot-garantie', 'f-sequestre-depot', 'f-email-vendeur', 'f-email-acquereur'];
  function majMarquesPreRemplies() {
    CHAMPS_PRE_REMPLIS_FINALISER.forEach(id => {
      const champ = document.getElementById(id);
      const label = document.querySelector(`label[for="${id}"]`);
      if (!champ || !label) return;
      const pre = !!champ.value && valeursAppliquees[id] !== undefined && String(valeursAppliquees[id]) === champ.value.trim();
      let marque = label.querySelector('.marque-pre-rempli');
      if (pre && !marque) {
        marque = document.createElement('span');
        marque.className = 'marque-pre-rempli';
        marque.textContent = 'Pré-rempli';
        label.appendChild(marque);
      } else if (!pre && marque) marque.remove();
      if (!champ.dataset.marqueEcoute) {
        champ.dataset.marqueEcoute = '1';
        champ.addEventListener('input', majMarquesPreRemplies);
      }
    });
  }

  // Aperçu (lecture seule) de la checklist de pièces attendue pour le type de vente choisi à
  // l'étape "Finaliser" — avant même l'enregistrement du dossier, pour que le type de vente ne
  // soit pas un choix fait à l'aveugle. Les vraies pièces ne sont vérifiées qu'une fois le dossier
  // enregistré et relié à un dossier local (voir renderPiecesDossier/verifierPiecesDossier).
  function majApercuPieces() {
    try { deduireRoleEtudeWizard(); renderNotairesWizard(); } catch (e) { /* étape Finaliser absente */ }
    majPiecesAuthentic();
    const select = document.getElementById('f-type-vente');
    const roleSelect = document.getElementById('f-role-notaire');
    const bloc = document.getElementById('pieces-apercu');
    // L'email de l'acquéreur est demandé que l'étude soit instrumentaire, seule ou en
    // participation (demandé par l'étude : « permettre d'écrire à l'acquéreur »). Il n'est masqué
    // que lorsque l'ACQUÉREUR est représenté par un office distinct du nôtre (voir
    // notaireParticipantRepresenteAcquereur, appliquée ici à l'acte en cours d'import plutôt qu'à
    // un dossier déjà enregistré) : on ne doit alors pas collecter son email personnel.
    const champEmailAcquereur = document.getElementById('champ-email-acquereur');
    if (champEmailAcquereur) {
      // D'après le champ « Notaire de l'acquéreur » de l'étape Finaliser, corrigeable. Une adresse
      // déjà saisie n'est JAMAIS effacée ni cachée : une lecture fausse de l'acte (confrère pris
      // pour le notaire de l'acquéreur) la faisait disparaître sans prévenir (signalé le 29/09).
      const champNotaireAcq = document.getElementById('f-notaire-acquereur');
      const notaireAcq = champNotaireAcq ? champNotaireAcq.value.trim() : '';
      const acquereurRepresenteParAutre = !!(notaireAcq && !estEtude({ nom: notaireAcq }));
      const saisi = !!document.getElementById('f-email-acquereur').value.trim();
      champEmailAcquereur.style.display = acquereurRepresenteParAutre && !saisi ? 'none' : '';
    }
    // Email du vendeur : même règle, d'après le champ « Notaire du vendeur ».
    const champEmailVendeur = document.getElementById('champ-email-vendeur');
    if (champEmailVendeur) {
      const champNotaireV = document.getElementById('f-notaire-vendeur');
      const notaireV = champNotaireV ? champNotaireV.value.trim() : '';
      const saisiV = !!document.getElementById('f-email-vendeur').value.trim();
      champEmailVendeur.style.display = notaireV && !estEtude({ nom: notaireV }) && !saisiV ? 'none' : '';
    }
    if (!select || !bloc) return;
    // Notaire participant/concourant : l'étude ne constitue pas le dossier complet, seuls le prêt
    // et les engagements du vendeur (analyse juridique) la concernent — la checklist de pièces ne
    // s'applique qu'au notaire instrumentaire, qui reçoit l'acte.
    if (roleSelect && roleSelect.value === 'participant') {
      bloc.innerHTML = `<div class="pieces-apercu-titre">Notaire participant : pas de checklist de pièces — seuls l'offre de prêt et les engagements du vendeur seront suivis.</div>`;
      return;
    }
    const checklist = checklistPieces(select.value);
    bloc.innerHTML = `
      <div class="pieces-apercu-titre">Pièces attendues pour ce type de vente (${checklist.length}) :</div>
      <div class="pieces-apercu-liste">
        ${checklist.map(p => `<span class="piece-item inconnu"><span class="piece-icone">?</span>${escapeHtml(p.label)}</span>`).join('')}
      </div>
    `;
  }

  // Sidebar repliée hors écran sous ~900px (voir style.css) : ce bouton/scrim la fait glisser à
  // l'écran sans changer sa structure ni dupliquer la navigation pour mobile.
  function toggleSidebarMobile(forcerOuvert) {
    const sidebar = document.getElementById('sidebar');
    const scrim = document.getElementById('sidebar-scrim');
    const ouverte = typeof forcerOuvert === 'boolean' ? forcerOuvert : !sidebar.classList.contains('ouverte');
    sidebar.classList.toggle('ouverte', ouverte);
    scrim.classList.toggle('visible', ouverte);
  }
