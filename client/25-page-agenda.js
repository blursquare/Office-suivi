  // ==== PAGE AGENDA (étude, 30/09) ====
  // « Créer une page agenda … afficher l'agenda complet de la semaine du lundi au samedi de 7 h à
  // 20 h, tous les rendez-vous … ouvrir la fiche des dossiers présents dans CLAIRE … création et
  // suppression de rendez-vous, avec confirmation pour la suppression … un agenda intelligent et
  // proactif ». Les rendez-vous sont ceux du calendrier partagé de l'office, lus par le serveur à
  // chaque tour EWS (2 min, GET /api/agenda/evenements) ; créer et supprimer passent par Exchange
  // (un seul essai ; une suppression part dans les éléments supprimés d'Outlook). L'« intelligence »
  // est un calcul transparent sur les dossiers, sans IA, chaque point expliqué : probabilité de tenue
  // d'une signature, créneaux proposés aux dossiers prêts à signer, gestes de relation client dus.
  // Tout ce qui est pur est déclaré en `function`/`var` (testable, voir tests/agenda-page.test.js).

  // Plage affichée en vues Semaine et Jour (étude, 30/09 : « de 9 h jusqu'à 19 h ») ; un rendez-vous
  // qui en déborde est ramené au bord et garde ses vraies heures dans sa carte.
  var AGENDA_HEURE_DEBUT = 8;   // étude, 01/10 : « afficher l'agenda à partir de 8 h » (9 h le 30/09)
  var AGENDA_HEURE_FIN = 19;
  var AGENDA_JOURS_SEMAINE = 6; // lundi → samedi

  // Pure : les jours (lundi → samedi) de la semaine qui commence au lundi donné.
  function joursSemaineAgenda(lundiIso) {
    const jours = [];
    for (let i = 0; i < AGENDA_JOURS_SEMAINE; i++) jours.push(addDays(lundiIso, i));
    return jours;
  }

  // Pure : « HH:MM » → minutes depuis minuit (null si illisible).
  function minutesHeure(h) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(h || ''));
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  }

  // Pure : les rendez-vous qui touchent un jour (un rendez-vous de plusieurs jours y compte).
  function evenementsJourAgenda(evenements, iso) {
    return (evenements || []).filter(e => e && e.date <= iso && (e.dateFin || e.date) >= iso);
  }

  // Pure : place des rendez-vous horaires d'une journée dans la grille 8 h – 19 h (haut et hauteur
  // en % de la grille). Les rendez-vous qui se chevauchent se partagent la largeur en colonnes ; un
  // rendez-vous hors de la plage est ramené à son bord et signalé (`horsPlage`).
  function disposerEvenementsJour(evenements, iso) {
    const debutGrille = AGENDA_HEURE_DEBUT * 60;
    const finGrille = AGENDA_HEURE_FIN * 60;
    const total = finGrille - debutGrille;
    const horaires = (evenements || []).filter(e => e && !e.journeeEntiere && e.heure && e.date === iso).map(e => {
      const debut = minutesHeure(e.heure);
      let fin = minutesHeure(e.heureFin);
      if (fin === null || fin <= debut) fin = debut + (e.signature ? 60 : 30);
      return { e, debut, fin };
    }).filter(h => h.debut !== null).sort((a, b) => a.debut - b.debut || b.fin - a.fin);
    const places = [];
    let groupe = [];
    let finGroupe = -1;
    const fermer = () => {
      const n = groupe.reduce((m, p) => Math.max(m, p.colonne + 1), 1);
      groupe.forEach(p => { p.colonnes = n; });
      groupe = [];
      finGroupe = -1;
    };
    for (const h of horaires) {
      if (groupe.length && h.debut >= finGroupe) fermer();
      const occupees = groupe.filter(p => p.fin > h.debut).map(p => p.colonne);
      let colonne = 0;
      while (occupees.indexOf(colonne) !== -1) colonne++;
      const p = { e: h.e, debut: h.debut, fin: h.fin, colonne, colonnes: 1 };
      groupe.push(p);
      places.push(p);
      finGroupe = Math.max(finGroupe, h.fin);
    }
    if (groupe.length) fermer();
    return places.map(p => {
      const d = Math.max(debutGrille, Math.min(finGrille, p.debut));
      const f = Math.max(debutGrille, Math.min(finGrille, p.fin));
      return {
        e: p.e, colonne: p.colonne, colonnes: p.colonnes,
        haut: Math.min(d - debutGrille, total - 15) / total * 100,
        hauteur: Math.max((f - d) / total * 100, 15 / total * 100),
        horsPlage: p.debut < debutGrille || p.fin > finGrille
      };
    });
  }

  // Pure : les semaines (lundi → dimanche) qui couvrent un mois « AAAA-MM », pour le calendrier du mois.
  function grilleMoisAgenda(anneeMois) {
    const premier = anneeMois + '-01';
    const dernier = addDays(isoLocalDepuisDate(new Date(Number(anneeMois.slice(0, 4)), Number(anneeMois.slice(5, 7)), 1)), -1);
    const semaines = [];
    for (let lundi = debutSemaine(premier); lundi <= dernier; lundi = addDays(lundi, 7)) {
      const jours = [];
      for (let i = 0; i < 7; i++) jours.push(addDays(lundi, i));
      semaines.push(jours);
    }
    return semaines;
  }

  // Pure : jours fériés en France métropolitaine d'une année (AAAA-MM-JJ) — fixes, et ceux qui
  // suivent Pâques (lundi de Pâques, Ascension, lundi de Pentecôte). Aucun créneau n'y est proposé.
  function joursFeriesFrance(annee) {
    const a = annee % 19, b = Math.floor(annee / 100), c = annee % 100;
    const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mois = Math.floor((h + l - 7 * m + 114) / 31), jour = ((h + l - 7 * m + 114) % 31) + 1;
    const paques = `${annee}-${String(mois).padStart(2, '0')}-${String(jour).padStart(2, '0')}`;
    return ['01-01', '05-01', '05-08', '07-14', '08-15', '11-01', '11-11', '12-25'].map(md => `${annee}-${md}`)
      .concat([addDays(paques, 1), addDays(paques, 39), addDays(paques, 50)]).sort();
  }
  function estJourFerie(iso) {
    return joursFeriesFrance(Number(String(iso).slice(0, 4))).indexOf(iso) !== -1;
  }

  // ---- Probabilité de tenue d'une signature ----
  var PROBABILITE_MAX_SIGNATURE = 99;
  // Pure et indicative : part de 99 % et retire des points pour ce qui reste à faire, d'autant plus
  // que la date approche. Chaque retrait est un facteur affiché avec le geste qui le lève — rien de
  // caché, rien de deviné. null pour un dossier sans rendez-vous à venir.
  function probabiliteTenueSignature(d, aujourdhuiIso, absences) {
    if (!d || !d.rendezVousSignature) return null;
    const auj = aujourdhuiIso || isoAujourdhuiLocal();
    const jours = ecartJours(auj, d.rendezVousSignature);
    if (jours === null || jours < 0) return null;
    const facteurs = [];
    const f = (libelle, retrait, action) => facteurs.push({ libelle, retrait, ok: retrait === 0, action: action || '' });
    if (d.sansPret) f('Achat comptant', 0);
    else if (echeanceValidee(d, 'pret')) f('Offre de prêt reçue', 0);
    else f('Offre de prêt non reçue', jours <= 15 ? 40 : 25, 'Relancer l’offre de prêt');
    if (d.ventebien) {
      if (echeanceValidee(d, 'ventebien')) f('Vente préalable réalisée', 0);
      else f('Vente préalable non réalisée', jours <= 15 ? 35 : 25, 'Relancer la vente préalable');
    }
    if (!preemptionLevee(d)) f('Renonciation au droit de préemption attendue', 20, 'Obtenir la renonciation');
    if (!saferLevee(d)) {
      const echeanceSafer = echeanceSaferDossier(d);
      if (!echeanceSafer) f('Réponse de la SAFER attendue', 20, 'Suivre la SAFER dans Authentic');
      else if (echeanceSafer >= d.rendezVousSignature) f(`Délai SAFER jusqu’au ${formatDateFr(echeanceSafer)}, après le rendez-vous`, 40, 'Déplacer le rendez-vous');
      else f(`Délai SAFER jusqu’au ${formatDateFr(echeanceSafer)}`, jours <= 15 ? 10 : 5, 'Suivre la SAFER dans Authentic');
    }
    const engagementsEnAttente = elementsAnalyseEnAttente(d).engagements;
    const pieces = piecesAttenduesDossier(d).filter(p => p !== 'Offre de prêt' && p !== 'Vente préalable' && !engagementsEnAttente.includes(p));
    if (pieces.length) {
      f(`${pieces.length} pièce${pieces.length > 1 ? 's' : ''} manquante${pieces.length > 1 ? 's' : ''} : ${pieces.slice(0, 3).join(', ')}${pieces.length > 3 ? '…' : ''}`,
        Math.min(20, pieces.length * (jours <= 10 ? 6 : 3)), 'Réclamer les pièces');
    } else if (d.roleNotaire !== 'participant') f('Pièces du dossier reçues', 0);
    // Engagements du vendeur (onglet Analyse) : des travaux ou un entretien non faits peuvent
    // repousser la signature autant qu'une pièce.
    const nbEngagements = d.roleNotaire === 'participant' ? 0 : ((d.analyseJuridique && d.analyseJuridique.engagements) || []).length;
    if (engagementsEnAttente.length) {
      const n = engagementsEnAttente.length;
      f(`${n} engagement${n > 1 ? 's' : ''} du vendeur non réalisé${n > 1 ? 's' : ''} : ${engagementsEnAttente.slice(0, 2).map(x => x.replace(/^Engagement : /, '')).join(', ')}${n > 2 ? '…' : ''}`,
        Math.min(15, n * (jours <= 10 ? 6 : 3)), 'Relancer le vendeur');
    } else if (nbEngagements) f('Engagements du vendeur réalisés', 0);
    const appelFait = echeanceValidee(d, 'appelFonds');
    if (appelFait) f('Appel de fonds envoyé', 0);
    else if (jours <= 20) f('Appel de fonds à envoyer', jours <= 10 ? 15 : 8, 'Envoyer l’appel de fonds');
    if (echeanceValidee(d, 'projetEnvoye')) f('Projet d’acte envoyé', 0);
    else if (jours <= 10) f('Projet d’acte à envoyer', jours <= 5 ? 12 : 5, 'Envoyer le projet');
    if (appelFait && jours <= 5) {
      const b = bilanFondsDossier(d);
      if (b.etat === 'complet') f('Fonds reçus', 0);
      else f(d.fondsRecus ? 'Fonds pas encore tous reçus' : 'Arrivée des fonds pas encore vérifiée', 10, 'Vérifier l’arrivée des fonds');
    }
    // Étude 06/10 : l'absence d'un collaborateur ne retire rien à un rendez-vous déjà placé — il n'est
    // pas indispensable, seule Sophie reçoit les actes (`absences` ne sert plus qu'à proposer des dates).
    const retrait = facteurs.reduce((t, x) => t + x.retrait, 0);
    const pourcent = Math.max(5, Math.min(PROBABILITE_MAX_SIGNATURE, PROBABILITE_MAX_SIGNATURE - retrait));
    return { pourcent, niveau: pourcent >= 80 ? 'haute' : pourcent >= 55 ? 'moyenne' : 'basse', jours, facteurs };
  }

  // ---- Créneaux proposés aux dossiers prêts à signer ----
  // Règles de l'étude (30/09) : pas de rendez-vous à 9 h, ni entre 12 h et 14 h, ni après 18 h, et
  // 6 rendez-vous par jour au plus — « sauf exception, ça doit être exceptionnel ». Les créneaux
  // normaux sont donc cherchés d'abord ; un créneau hors règles n'est proposé qu'à défaut de tout
  // créneau normal, et marqué exceptionnel (avec la règle qu'il enfreint).
  var DUREE_CRENEAU_SIGNATURE = 60;
  var MAX_RDV_JOUR = 6;
  var DEBUT_JOURNEE_AGENDA = '09:00';
  var FIN_JOURNEE_AGENDA = '18:00';
  var PAUSE_MIDI_AGENDA = ['12:00', '14:00'];
  // Heures de début essayées, dans l'ordre : les créneaux normaux d'abord.
  var CRENEAUX_SIGNATURE = ['09:30', '10:00', '10:30', '11:00', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00'];
  var CRENEAUX_EXCEPTIONNELS = ['09:00', '12:00', '12:30', '13:00', '13:30', '17:30', '18:00'];
  // Le temps d'envoyer l'appel de fonds (dû 10 jours avant le rendez-vous) et le projet avant la signature.
  var DELAI_MIN_SIGNATURE_JOURS = 14;

  // Pure : les rendez-vous horaires d'un jour (hors journées entières), comme le compte la règle des 6.
  function rendezVousHorairesJour(evenements, iso) {
    return evenementsJourAgenda(evenements, iso).filter(e => !e.journeeEntiere && e.heure && e.date === iso);
  }

  // Pure : ce qui rend un créneau exceptionnel ('' s'il respecte les règles de l'étude).
  function motifCreneauExceptionnel(heure, dureeMinutes, nbRdvJour) {
    const a = minutesHeure(heure);
    if (a === null) return '';
    const b = a + (Number(dureeMinutes) || DUREE_CRENEAU_SIGNATURE);
    const motifs = [];
    if (a === minutesHeure(DEBUT_JOURNEE_AGENDA)) motifs.push('à 9 h');
    if (a < minutesHeure(PAUSE_MIDI_AGENDA[1]) && b > minutesHeure(PAUSE_MIDI_AGENDA[0])) motifs.push('entre 12 h et 14 h');
    if (b > minutesHeure(FIN_JOURNEE_AGENDA)) motifs.push('après 18 h');
    if ((nbRdvJour || 0) >= MAX_RDV_JOUR) motifs.push(`déjà ${nbRdvJour} rendez-vous ce jour-là`);
    return motifs.join(', ');
  }

  // Pure : les dossiers prêts à signer sans rendez-vous — financement levé, vente préalable réalisée,
  // préemption purgée — ceux à qui CLAIRE propose des créneaux (étape « Fixer le rendez-vous »).
  function dossiersAPlacer(liste) {
    return (liste || []).filter(d => d && !d.archive && !estSuccession(d) && !d.rendezVousSignature && pretLeve(d) && preemptionLevee(d)
      && (!d.ventebien || echeanceValidee(d, 'ventebien')));
  }

  // Pure : jusqu'à `nombre` créneaux libres (un par jour), du lundi au vendredi hors jours fériés,
  // dans l'agenda de l'office, sans chevauchement ni responsable absent. Au plus tôt dans
  // DELAI_MIN_SIGNATURE_JOURS (3 jours si la date butoir est plus proche). Premier passage : les seuls
  // créneaux normaux ; s'il en manque, second passage sur les créneaux hors règles, marqués
  // `exceptionnel` (le motif). `apresButoir` signale un créneau au-delà de la date butoir.
  // `bornes` ({ depuis, limite }, facultatif) : chercher dans une période donnée — la semaine où la
  // signature est probable (carte fantôme de la page Agenda).
  function creneauxProposesSignature(d, evenements, absences, aujourdhuiIso, nombre, bornes) {
    const auj = aujourdhuiIso || isoAujourdhuiLocal();
    const n = nombre || 3;
    let depuis = addDays(auj, DELAI_MIN_SIGNATURE_JOURS);
    if (d.acte && d.acte < depuis) depuis = addDays(auj, 3);
    if (bornes && bornes.depuis) depuis = bornes.depuis > auj ? bornes.depuis : addDays(auj, 1);
    // Pas de signature avant la fin du délai de la SAFER (étude, 02/10).
    const echeanceSafer = echeanceSaferDossier(d);
    if (echeanceSafer && addDays(echeanceSafer, 1) > depuis) depuis = addDays(echeanceSafer, 1);
    const limite = bornes && bornes.limite ? bornes.limite : addDays(depuis, 60);
    const joursPossibles = [];
    for (let iso = depuis; iso <= limite; iso = addDays(iso, 1)) {
      const jourSemaine = new Date(iso + 'T00:00:00').getDay();
      if (jourSemaine === 0 || jourSemaine === 6 || estJourFerie(iso)) continue;
      if (d.responsable && responsableAbsentLeJour(absences, d.responsable, iso)) continue;
      joursPossibles.push(iso);
    }
    const libreLe = (iso, heures, exceptionnel) => {
      const horaires = rendezVousHorairesJour(evenements, iso);
      if (!exceptionnel && horaires.length >= MAX_RDV_JOUR) return null;
      const pris = horaires.map(e => {
        const a = minutesHeure(e.heure);
        let b = minutesHeure(e.heureFin);
        if (b === null || b <= a) b = a + 30;
        return [a, b];
      });
      const heure = heures.find(h => {
        const a = minutesHeure(h);
        const b = a + DUREE_CRENEAU_SIGNATURE;
        return !pris.some(([x, y]) => x < b && a < y);
      });
      if (!heure) return null;
      const motif = motifCreneauExceptionnel(heure, DUREE_CRENEAU_SIGNATURE, horaires.length);
      return { date: iso, heure, apresButoir: !!(d.acte && iso > d.acte), exceptionnel: motif };
    };
    const creneaux = [];
    for (const iso of joursPossibles) {
      if (creneaux.length >= n) break;
      const c = libreLe(iso, CRENEAUX_SIGNATURE, false);
      if (c) creneaux.push(c);
    }
    // Exceptionnel, seulement à défaut : les jours encore sans proposition, toutes heures confondues.
    for (const iso of joursPossibles) {
      if (creneaux.length >= n) break;
      if (creneaux.some(c => c.date === iso)) continue;
      const c = libreLe(iso, CRENEAUX_SIGNATURE.concat(CRENEAUX_EXCEPTIONNELS), true);
      if (c) creneaux.push(c);
    }
    return creneaux.sort((x, y) => (x.exceptionnel ? 1 : 0) - (y.exceptionnel ? 1 : 0) || x.date.localeCompare(y.date));
  }

  // ---- Semaine probable d'une signature pas encore placée ----
  // Étude, 30/09 : « pour les dossiers pas encore placés, afficher quand on arrive sur cette semaine
  // qu'il est probable que ce rendez-vous se tienne cette semaine-là — une manière proactive de placer
  // le rendez-vous ». Choix de l'étude : AU PLUS TÔT, la première date où tout ce qu'on sait est levé :
  //  - le délai d'envoi de l'appel de fonds et du projet (DELAI_MIN_SIGNATURE_JOURS) ;
  //  - l'offre de prêt : attendue au plus tard à la date de la condition (ou dès aujourd'hui si elle
  //    est dépassée), puis 11 jours — l'emprunteur ne peut l'accepter qu'après 10 jours de réflexion ;
  //  - la vente préalable, à sa date.
  // Jour ouvré (ni week-end ni férié). La préemption et les pièces ne fixent pas de date : elles
  // pèsent sur la probabilité (celle de probabiliteTenueSignature à cette date, moins 10 points parce
  // que le rendez-vous n'est pas fixé). Pure ; null pour un dossier archivé ou déjà placé.
  var DELAI_REFLEXION_OFFRE_JOURS = 11;

  // Pure : le rendez-vous du dossier posé dans l'agenda EN ATTENTE DE CONFIRMATION — titre marqué
  // d'un « ? » ou « ?? » (« VTE - NOM ?? »), marque de l'étude pour un rendez-vous non confirmé, qui
  // n'écrit rien sur la fiche (estRendezVousSignature côté serveur). Le prochain à venir, horaire,
  // jamais une option d'un sondage de CLAIRE (suivie par le sondage) ni une carte fantôme. null sinon.
  function rendezVousAConfirmerDossier(d, evenements, aujourdhuiIso) {
    if (!d || !d.id) return null;
    const auj = aujourdhuiIso || isoAujourdhuiLocal();
    return (evenements || []).filter(e => e && e.dossierId === d.id && !e.fantome && !e.option && !e.journeeEntiere && e.heure
        && /^\d{4}-\d{2}-\d{2}$/.test(String(e.date || '')) && e.date >= auj
        && /\?/.test(String(e.sujet || '') + ' ' + String(e.lieu || '')) && !/option CLAIRE/i.test(String(e.sujet || '')))
      .sort((a, b) => a.date.localeCompare(b.date) || String(a.heure).localeCompare(String(b.heure)))[0] || null;
  }

  // `evenements` (facultatif) : l'agenda de l'office. Étude, 02/10 : « pour les probabilités de
  // rendez-vous, vérifier avant si un rendez-vous n'est pas en attente de confirmation avec des ?? » —
  // un tel rendez-vous donne la date (au lieu de la date au plus tôt), sans carte fantôme.
  function semaineProbableSignature(d, aujourdhuiIso, absences, evenements) {
    if (!d || d.archive || d.rendezVousSignature) return null;
    const auj = aujourdhuiIso || isoAujourdhuiLocal();
    const aConfirmer = rendezVousAConfirmerDossier(d, evenements, auj);
    if (aConfirmer) {
      const tenueConf = probabiliteTenueSignature(Object.assign({}, d, { rendezVousSignature: aConfirmer.date }), auj, absences);
      const facteursConf = (tenueConf ? tenueConf.facteurs : []).concat([{ libelle: 'Rendez-vous en attente de confirmation (« ? » dans l’agenda)', retrait: 5, ok: false, action: 'Confirmer le rendez-vous' }]);
      const depasse = !!(d.acte && aConfirmer.date > d.acte);
      if (depasse) facteursConf.push({ libelle: `Au-delà de la date butoir (${formatDateFr(d.acte)})`, retrait: 15, ok: false, action: 'Prévoir la prorogation' });
      const pc = Math.max(5, Math.min(PROBABILITE_MAX_SIGNATURE, PROBABILITE_MAX_SIGNATURE - facteursConf.reduce((t, x) => t + x.retrait, 0)));
      return {
        date: aConfirmer.date, lundi: debutSemaine(aConfirmer.date), heure: aConfirmer.heure,
        raison: `rendez-vous en attente de confirmation le ${formatDateFr(aConfirmer.date)} à ${String(aConfirmer.heure).replace(':', ' h ')}`,
        depasseButoir: depasse, facteurs: facteursConf, pourcent: pc, aConfirmer,
        niveau: pc >= 80 ? 'haute' : pc >= 55 ? 'moyenne' : 'basse'
      };
    }
    let date = addDays(auj, DELAI_MIN_SIGNATURE_JOURS);
    let raison = `le temps d’envoyer l’appel de fonds et le projet (${DELAI_MIN_SIGNATURE_JOURS} jours)`;
    const auPlusTot = (iso, libelle) => { if (iso && iso > date) { date = iso; raison = libelle; } };
    if (!d.sansPret && !echeanceValidee(d, 'pret')) {
      const attendue = d.pret && d.pret > auj ? d.pret : auj;
      auPlusTot(addDays(attendue, DELAI_REFLEXION_OFFRE_JOURS),
        d.pret && d.pret > auj
          ? `offre de prêt attendue au plus tard le ${formatDateFr(d.pret)}, puis ${DELAI_REFLEXION_OFFRE_JOURS} jours de réflexion`
          : `offre de prêt attendue, puis ${DELAI_REFLEXION_OFFRE_JOURS} jours de réflexion`);
    }
    if (d.ventebien && !echeanceValidee(d, 'ventebien') && d.ventebien > auj) {
      auPlusTot(d.ventebien, `vente préalable prévue le ${formatDateFr(d.ventebien)}`);
    }
    const echeanceSafer = echeanceSaferDossier(d);
    if (echeanceSafer) auPlusTot(addDays(echeanceSafer, 1), `délai SAFER jusqu’au ${formatDateFr(echeanceSafer)}`);
    // Jour ouvré, et jamais un jour où le responsable est absent : il peut falloir modifier l'acte
    // (étude 06/10) — contrairement à un rendez-vous déjà placé, où son absence ne pèse pas.
    for (let i = 0; i < 90; i++) {
      const js = new Date(date + 'T00:00:00').getDay();
      if (js !== 0 && js !== 6 && !estJourFerie(date) && !responsableAbsentLeJour(absences, d.responsable, date)) break;
      if (responsableAbsentLeJour(absences, d.responsable, date) && raison.indexOf('absence') === -1) {
        raison += ` ; ${prenomCollaborateur(d.responsable)} absent(e), le rendez-vous est repoussé à son retour`;
      }
      date = addDays(date, 1);
    }
    const tenue = probabiliteTenueSignature(Object.assign({}, d, { rendezVousSignature: date }), auj, absences);
    const facteurs = (tenue ? tenue.facteurs : []).concat([{ libelle: 'Rendez-vous pas encore fixé', retrait: 10, ok: false, action: 'Placer le rendez-vous' }]);
    const depasseButoir = !!(d.acte && date > d.acte);
    if (depasseButoir) facteurs.push({ libelle: `Au-delà de la date butoir (${formatDateFr(d.acte)})`, retrait: 15, ok: false, action: 'Prévoir la prorogation' });
    const retrait = facteurs.reduce((t, x) => t + x.retrait, 0);
    const pourcent = Math.max(5, Math.min(PROBABILITE_MAX_SIGNATURE, PROBABILITE_MAX_SIGNATURE - retrait));
    return {
      date, lundi: debutSemaine(date), raison, depasseButoir, facteurs, pourcent,
      niveau: pourcent >= 80 ? 'haute' : pourcent >= 55 ? 'moyenne' : 'basse'
    };
  }

  // Pure : les cartes fantômes d'une semaine affichée — une par dossier dont la signature est probable
  // cette semaine-là, posée sur le premier créneau libre de la semaine (à partir de la date au plus
  // tôt), selon les règles de l'étude ; sans créneau libre, en « Journée » à sa date.
  function fantomesSemaineAgenda(liste, evenements, absences, jours, aujourdhuiIso) {
    if (!jours || !jours.length) return [];
    const auj = aujourdhuiIso || isoAujourdhuiLocal();
    const lundi = debutSemaine(jours[0]);
    const fin = addDays(lundi, 5);
    const fantomes = [];
    (liste || []).forEach(d => {
      const p = semaineProbableSignature(d, auj, absences, evenements);
      if (!p || p.aConfirmer || p.lundi !== lundi) return;
      const creneau = creneauxProposesSignature(d, (evenements || []).concat(fantomes), absences, auj, 1, { depuis: p.date, limite: fin })[0] || null;
      const debut = creneau ? minutesHeure(creneau.heure) : null;
      const heureFin = debut === null ? null
        : `${String(Math.floor((debut + DUREE_CRENEAU_SIGNATURE) / 60)).padStart(2, '0')}:${String((debut + DUREE_CRENEAU_SIGNATURE) % 60).padStart(2, '0')}`;
      fantomes.push({
        sujet: libelleDossierAffiche(d), lieu: '', date: creneau ? creneau.date : p.date, dateFin: creneau ? creneau.date : p.date,
        heure: creneau ? creneau.heure : null, heureFin, journeeEntiere: !creneau, categories: [], signature: true,
        absence: false, dossierId: d.id, dossierNom: d.nom, fantome: true, probable: p, creneau
      });
    });
    return fantomes;
  }

  // ---- Relation client ----
  // Pure : les emails de relation client dus aujourd'hui, du plus pressant au moins pressant.
  //  - questionnaire de satisfaction dans les 14 jours après la signature ;
  //  - un mot un an après la signature.
  // Jamais quand l'acquéreur est accompagné par un confrère (étude, 01/10 : « que pour les clients non
  // accompagnés par un confrère ») — c'est alors son notaire qui tient la relation. Ces emails vivent
  // dans l'onglet Échanges de la fiche (echangesSelonStade), plus dans la barre de l'agenda (01/10).
  // « Confirmer le rendez-vous » retiré (étude 05/10 : doublon de « Demander le RIB et la pièce d'identité ») ; son modèle
  // d'email reste dans Réglages › Modèles d'emails et le menu « Modèles » de la fenêtre d'email.
  var ORDRE_GESTES_RELATION = { questionnaire: 1, anniversaire: 2 };
  function gestesRelationClient(liste, aujourdhuiIso) {
    const auj = aujourdhuiIso || isoAujourdhuiLocal();
    const gestes = [];
    for (const d of liste || []) {
      const rdv = d && d.rendezVousSignature;
      if (!rdv) continue;
      const j = ecartJours(auj, rdv);
      if (j === null) continue;
      if (notaireParticipantRepresenteAcquereur(d)) continue;
      if (j <= -1 && j >= -14 && !d.questionnaireEnvoyeLe) gestes.push({ d, type: 'questionnaire', j });
      if (j <= -358 && j >= -372 && !d.anniversaireEnvoyeLe) gestes.push({ d, type: 'anniversaire', j });
    }
    return gestes.sort((a, b) => ORDRE_GESTES_RELATION[a.type] - ORDRE_GESTES_RELATION[b.type] || Math.abs(a.j) - Math.abs(b.j));
  }

  // ---- État de la page ----
  // Trois vues (étude, 30/09, sur un exemple de design fourni) : Mois, Semaine (lundi → samedi),
  // Jour. `agendaJour` est le jour sélectionné (vue Jour, carte foncée de la bande des jours).
  var VUES_AGENDA = ['mois', 'semaine', 'jour'];
  let agendaVue = 'semaine';
  let agendaJour = null;           // jour sélectionné (AAAA-MM-JJ)
  let agendaLundi = null;          // lundi de la semaine affichée
  let agendaMois = null;           // « AAAA-MM » du mois affiché (vue Mois et calendrier de droite)
  let agendaEvenements = [];
  let agendaLu = '';
  let agendaSource = null;
  let agendaErreur = '';
  let agendaCharge = false;
  let agendaModale = null;         // { type: 'creation', date, heure } ou { type: 'modification', cle }
  let agendaSelection = null;      // clé du rendez-vous affiché dans le panneau de détail
  // Notes des rendez-vous (corps du rendez-vous dans Outlook), lues à l'ouverture du détail :
  // itemId → { etat: 'chargement' | 'ok' | 'erreur', notes, changeKey, message }.
  let notesAgenda = {};
  let notesAgendaEdition = null;   // itemId dont la note est en cours d'écriture
  let notesAgendaBrouillon = '';

  // Le mois du calendrier de droite : celui d'aujourd'hui si la semaine affichée le contient,
  // sinon celui du jeudi de la semaine (le mois qui en porte le plus de jours).
  function moisDeSemaineAgenda(lundiIso, aujourdhuiIso) {
    const jours = joursSemaineAgenda(lundiIso);
    return (jours.indexOf(aujourdhuiIso) !== -1 ? aujourdhuiIso : addDays(lundiIso, 3)).slice(0, 7);
  }

  // Pure : durée lisible d'un rendez-vous (« 30 min », « 1 h », « 1 h 30 ») ; '' sans heure de fin.
  function dureeRendezVous(heure, heureFin) {
    const a = minutesHeure(heure);
    const b = minutesHeure(heureFin);
    if (a === null || b === null || b <= a) return '';
    const m = b - a;
    const h = Math.floor(m / 60);
    const r = m % 60;
    return h ? `${h} h${r ? ' ' + String(r).padStart(2, '0') : ''}` : `${r} min`;
  }

  // Pure : le jour affiché après un pas en vue Jour — le dimanche est sauté (agenda lundi → samedi).
  function jourSuivantAgenda(iso, pas) {
    let j = addDays(iso, pas);
    if (new Date(j + 'T00:00:00').getDay() === 0) j = addDays(j, pas > 0 ? 1 : -1);
    return j;
  }

  function positionnerAgenda(jourIso) {
    const auj = isoAujourdhuiLocal();
    agendaJour = new Date(jourIso + 'T00:00:00').getDay() === 0 ? addDays(jourIso, 1) : jourIso;
    agendaLundi = debutSemaine(agendaJour);
    agendaMois = agendaVue === 'mois' ? agendaJour.slice(0, 7) : moisDeSemaineAgenda(agendaLundi, joursSemaineAgenda(agendaLundi).indexOf(agendaJour) !== -1 ? agendaJour : auj);
  }

  let popoverAgendaInit = false;
  function initPopoverAgenda() {
    if (popoverAgendaInit) return;
    popoverAgendaInit = true;
    document.addEventListener('click', (e) => {
      if (ongletActuel !== 'agenda' || !agendaSelection || agendaModale || notesAgendaEdition) return;
      if (!document.body.contains(e.target)) return;
      // Le clic venu d'ailleurs (widget Agenda du tableau de bord) qui vient d'ouvrir un rendez-vous ne le referme pas.
      if (e.target.closest('#agenda-popover, .ag-evt, .ag-journee-evt, .ag-vm-evt, .ag-ligne, .ag-placer, .confirm-overlay, #agenda-overlay, #sondage-overlay, .toast, #onglet-dashboard, .ag-recherche')) return;
      agendaSelection = null;
      renderPageAgenda();
    });
    window.addEventListener('resize', positionnerPopoverAgenda);
  }

  function initAgenda() {
    initPopoverAgenda();
    // Premier affichage sur un écran étroit (téléphone) : la vue Jour, lisible sans défilement latéral.
    if (!agendaJour && window.innerWidth && window.innerWidth < 700) agendaVue = 'jour';
    if (!agendaJour) positionnerAgenda(isoAujourdhuiLocal());
    renderPageAgenda();
    chargerAgendaSemaine();
  }

  function periodeChargeeAgenda() {
    // Agenda jamais ouvert (rapport du 07/10 : « Placer » depuis « Demander à CLAIRE » relit l'agenda avant tout affichage de la
    // page — agendaMois vide, grilleMoisAgenda(null) levait) : la semaine du jour.
    if (!agendaJour || !agendaMois || !agendaLundi) positionnerAgenda(isoAujourdhuiLocal());
    const grille = grilleMoisAgenda(agendaMois);
    const debut = [agendaLundi, grille[0][0]].sort()[0];
    const fin = [addDays(agendaLundi, 6), grille[grille.length - 1][6]].sort()[1];
    return { debut, fin };
  }

  // Historique (étude, 01/10 : « remonter jusqu'au 1er janvier, si possible toutes les années ») : avant
  // le stock du serveur (lundi de la semaine dernière), les rendez-vous viennent de GET /api/agenda/passe,
  // lus mois par mois dans Outlook à la première consultation puis gardés. En lecture seule (`archive`).
  var agendaHistorique = { enCours: false, message: '' };
  var jetonChargementAgenda = 0;
  async function chargerAgendaSemaine() {
    if (!authToken) return;
    const { debut, fin } = periodeChargeeAgenda();
    const jeton = ++jetonChargementAgenda;
    let debutStock = '';
    try {
      const r = await fetchAvecAuth(`/api/agenda/evenements?debut=${debut}&fin=${fin}`);
      const corps = await r.json();
      if (jeton !== jetonChargementAgenda) return;
      if (!r.ok) { agendaErreur = corps.erreur || 'Lecture de l’agenda impossible.'; }
      else {
        agendaEvenements = Array.isArray(corps.evenements) ? corps.evenements : [];
        agendaLu = corps.lu || '';
        agendaSource = corps.source || null;
        agendaErreur = '';
        debutStock = corps.debutLu || '';
      }
    } catch (e) {
      agendaErreur = 'Serveur injoignable.';
    }
    agendaCharge = true;
    selectionnerCibleDossierAgenda();
    agendaHistorique = { enCours: !!(debutStock && debut < debutStock), message: '' };
    if (ongletActuel === 'agenda') renderPageAgenda();
    if (!agendaHistorique.enCours) { agendaCibleDossier = null; return; }
    try {
      const r = await fetchAvecAuth(`/api/agenda/passe?debut=${debut}&fin=${fin < debutStock ? fin : addDays(debutStock, -1)}`);
      const corps = await r.json();
      if (jeton !== jetonChargementAgenda) return;
      const vus = new Set(agendaEvenements.map(e => e.itemId).filter(Boolean));
      const passes = (r.ok && Array.isArray(corps.evenements) ? corps.evenements : [])
        .filter(e => !e.itemId || !vus.has(e.itemId)).map(e => Object.assign({}, e, { archive: true }));
      agendaEvenements = passes.concat(agendaEvenements);
      selectionnerCibleDossierAgenda();
      agendaCibleDossier = null;
      agendaHistorique = { enCours: false, message: r.ok ? (corps.message || '') : (corps.erreur || 'Historique illisible.') };
    } catch (e) {
      if (jeton !== jetonChargementAgenda) return;
      agendaHistorique = { enCours: false, message: 'Serveur injoignable — historique non lu.' };
    }
    if (ongletActuel === 'agenda') renderPageAgenda();
  }

  // Précédent / Aujourd'hui / Suivant, selon la vue : un mois, une semaine ou un jour.
  function naviguerAgenda(pas) {
    if (pas === 0) positionnerAgenda(isoAujourdhuiLocal());
    else if (agendaVue === 'jour') positionnerAgenda(jourSuivantAgenda(agendaJour, pas));
    else if (agendaVue === 'semaine') positionnerAgenda(addDays(agendaJour, pas * 7));
    else {
      const d = new Date(agendaMois + '-01T00:00:00');
      d.setMonth(d.getMonth() + pas);
      positionnerAgenda(isoLocalDepuisDate(d));
    }
    renderPageAgenda();
    chargerAgendaSemaine();
  }

  function choisirVueAgenda(vue) {
    if (VUES_AGENDA.indexOf(vue) === -1) return;
    agendaVue = vue;
    positionnerAgenda(agendaJour || isoAujourdhuiLocal());
    renderPageAgenda();
    chargerAgendaSemaine();
  }

  // Un jour choisi (carte de la bande, case du mois) : la vue Jour s'ouvre sur lui.
  function choisirJourAgenda(iso) {
    agendaVue = 'jour';
    positionnerAgenda(iso);
    renderPageAgenda();
    chargerAgendaSemaine();
  }

  // Calendrier de droite : ses flèches changent seulement le mois qu'il montre.
  function naviguerMoisAgenda(pas) {
    const d = new Date(agendaMois + '-01T00:00:00');
    d.setMonth(d.getMonth() + pas);
    agendaMois = isoLocalDepuisDate(d).slice(0, 7);
    renderPageAgenda();
    chargerAgendaSemaine();
  }

  function allerAuJourAgenda(iso) {
    positionnerAgenda(iso);
    renderPageAgenda();
    chargerAgendaSemaine();
  }

  // Clé stable d'un rendez-vous de la page (identifiant Exchange, sinon titre + date + heure).
  function cleEvenementAgenda(e) {
    if (e && e.fantome) return 'probable:' + e.dossierId;
    return e.itemId || `${e.sujet}|${e.date}|${e.heure || ''}`;
  }

  // Signatures fixées dans CLAIRE qui ne sont pas (ou pas encore) dans l'agenda de l'office : montrées
  // en pointillé à leur jour, pour que la semaine soit complète. Pure.
  function signaturesHorsAgenda(liste, evenements, jours) {
    return (liste || []).filter(d => d && !d.archive && d.rendezVousSignature && jours.indexOf(d.rendezVousSignature) !== -1
      && !(evenements || []).some(e => e.dossierId === d.id && e.date === d.rendezVousSignature))
      .map(d => ({
        sujet: libelleDossierAffiche(d), lieu: '', date: d.rendezVousSignature, dateFin: d.rendezVousSignature,
        heure: d.rendezVousSignatureHeure || null, heureFin: d.rendezVousSignatureHeureFin || null,
        journeeEntiere: !d.rendezVousSignatureHeure, categories: [], signature: true, absence: false,
        dossierId: d.id, dossierNom: d.nom, horsAgenda: true
      }));
  }

  function joursAffichesAgenda() {
    if (agendaVue === 'mois') return grilleMoisAgenda(agendaMois).reduce((t, s) => t.concat(s), []);
    return joursSemaineAgenda(agendaLundi);
  }

  function evenementsAffichesAgenda() {
    return agendaEvenements.concat(signaturesHorsAgenda(dossiers, agendaEvenements, joursAffichesAgenda()));
  }

  // Cartes fantômes de la semaine affichée (vues Semaine et Jour), pour les dossiers du périmètre.
  function fantomesAffichesAgenda() {
    if (agendaVue === 'mois') return [];
    const perimetre = dossiersDuPerimetre(dossiers, utilisateurPoste, vueGlobaleDashboard());
    const jours = joursSemaineAgenda(agendaVue === 'jour' ? debutSemaine(agendaJour) : agendaLundi);
    // Un dossier en sondage de créneaux a déjà ses options dans l'agenda : pas de carte fantôme.
    return fantomesSemaineAgenda(perimetre.filter(d => !sondageOuvertDossier(d.id)), evenementsAffichesAgenda(), absencesOffice, jours, isoAujourdhuiLocal());
  }

  function dossierDeEvenement(e) {
    return e && e.dossierId ? dossiers.find(d => d.id === e.dossierId) || null : null;
  }

  // Pure : la probabilité affichée sur un rendez-vous de l'agenda — celle de la signature fixée, ou,
  // pour un rendez-vous en attente de confirmation (« ?? ») d'un dossier sans signature fixée, celle
  // de la semaine probable posée à cette date (étude, 02/10). null pour tout autre rendez-vous.
  function probabiliteEvenementAgenda(d, e, aujourdhuiIso, absences) {
    if (!d || !e) return null;
    if (e.signature) return probabiliteTenueSignature(d, aujourdhuiIso, absences);
    const p = semaineProbableSignature(d, aujourdhuiIso, absences, [e]);
    return p && p.aConfirmer ? Object.assign({}, p, { lundi: null }) : null;
  }

  function renderPastilleProbabilite(p) {
    if (!p) return '';
    const dl = p.niveau === 'haute' ? 'dl-success' : p.niveau === 'moyenne' ? 'dl-pret' : 'dl-urgent';
    const titre = p.lundi ? 'Probabilité que la signature se tienne cette semaine-là' : 'Probabilité que le rendez-vous soit maintenu à cette date';
    return `<span class="ag-proba dot-label ${dl}" title="${titre}"><span class="dot"></span>${p.pourcent} %</span>`;
  }

  // ---- Ce qu'un rendez-vous d'un dossier dit de lui (comme la note du rendez-vous dans Outlook) ----
  // Étude, 30/09 : « dans le rendez-vous, mettre comme dans Outlook le responsable du dossier, le nom
  // du notaire autre que nous, si l'appel de fonds et le décompte ont été faits ». Le décompte est le
  // décompte acquéreur joint à l'appel de fonds (réponse de l'étude) : « fait » quand le courrier
  // d'appel de fonds / décompte est retrouvé sur le NAS, ou quand CLAIRE y a lu le montant attendu.
  function decompteAcquereurFait(d) {
    return !!(d && (courrierAppelFondsDossier(d) || (d.fondsRecus && d.fondsRecus.attenduChemin)));
  }

  // Pure : { responsable, confrere, etats: [{ cle, libelle, fait }] } pour un dossier.
  function infosRendezVousDossier(d) {
    if (!d) return null;
    return {
      responsable: d.responsable ? prenomCollaborateur(d.responsable) : '',
      confrere: confrereLieuAgenda(d),
      // Étude 05/10 : « le décompte, c'est à noter dans les dossiers de successions. Pour les ventes, on a l'appel de fonds si on
      // représente l'acquéreur et un décompte acquéreur si c'est un confrère, mais on marque appel de fonds envoyé » — une vente
      // montre donc l'appel de fonds seul, une succession le décompte.
      etats: [
        estSuccession(d)
          ? { cle: 'decompte', libelle: 'Décompte', fait: decompteAcquereurFait(d) }
          : { cle: 'appelFonds', libelle: 'Appel de fonds', fait: echeanceValidee(d, 'appelFonds') },
        // Projet d'acte envoyé (étude, 30/09 : la probabilité se lit « sous projet envoyé »).
        { cle: 'projet', libelle: 'Projet', fait: echeanceValidee(d, 'projetEnvoye') }
      ]
    };
  }

  // Les mêmes états en deux pastilles courtes (« AF » « P »), pour la carte d'une heure qui ne tient pas les lignes complètes
  // (étude 06/10 : « sur l'agenda, que je voie en un coup d'œil si l'appel de fonds et le projet ont été envoyés ») : lettres seules,
  // vert plein = fait, rouge au contour en tirets = pas encore (la couleur ne porte pas seule l'information).
  var ABREGES_ETATS_RENDEZ_VOUS = { appelFonds: 'AF', decompte: 'D', projet: 'P' };
  function renderEtatsMiniRendezVous(infos) {
    return `<span class="ag-etats-mini">${infos.etats.map(x => `<span class="ag-mini ${x.fait ? 'fait' : 'afaire'}" title="${escapeAttr(`${x.libelle} ${x.fait ? 'fait' : 'pas encore fait'}`)}">${escapeHtml(ABREGES_ETATS_RENDEZ_VOUS[x.cle] || x.libelle)}</span>`).join('')}</span>`;
  }

  function renderEtatsRendezVous(infos) {
    return infos.etats.map(x => `<span class="ag-etat ${x.fait ? 'fait' : 'afaire'}" title="${escapeAttr(`${x.libelle} ${x.fait ? 'fait' : 'pas encore fait'}`)}">${icone(x.fait ? 'check' : 'x')}${escapeHtml(x.libelle)}</span>`).join('');
  }

  // Carte d'un rendez-vous dans la grille, à la manière d'Outlook : liseré et fond clair de la couleur
  // de sa catégorie, titre, heure et durée ; pour un dossier, le responsable et le confrère, puis
  // l'appel de fonds et le décompte (fait ou non) — autant de lignes que la hauteur en laisse.
  // Vue Semaine (étude, 30/09 : « afficher le nom du dossier entier ou presque ; si trop long,
  // retirer l'heure de fin et la durée, laisser le début et mettre les initiales du collaborateur ») :
  // le titre passe sur autant de lignes que la carte en tient, puis une ligne « 10:00 · BA ».
  // Hauteur d'une heure dans la grille, en pixels — la même que --ag-heure (style.css), 60 px depuis
  // le 01/10 (étude : « réduis la hauteur de l'agenda », 90 px auparavant).
  var AGENDA_PX_HEURE = 60;
  // Pure : les lignes « Appel de fonds (Décompte en succession) / Projet » d'une signature ne s'affichent que si la
  // carte peut les tenir sans les couper (≈ 80 px : 1 h 20 à 60 px l'heure).
  function etatsTiennentAgenda(minutes) {
    return minutes * AGENDA_PX_HEURE / 60 >= 81;
  }
  // Pure : lignes du titre d'une carte de la vue Semaine — la carte moins l'heure (« 10:00 · BA »),
  // le rembourrage et, s'il y en a, les états ; 15 px par ligne, 1 à 6.
  function lignesTitreEvenement(minutes, avecEtats) {
    const px = minutes * AGENDA_PX_HEURE / 60;
    return Math.max(1, Math.min(6, Math.floor((px - 24 - (avecEtats ? 42 : 0)) / 15)));
  }

  function renderEvenementSemaine(place, auj) {
    const e = place.e;
    const teinte = teinteEvenementAgenda(e, categoriesRdvReglees());
    const d = dossierDeEvenement(e);
    const infos = infosRendezVousDossier(d);
    const proba = probabiliteEvenementAgenda(d, e, auj, absencesOffice);
    const largeur = 100 / place.colonnes;
    const style = `top:${place.haut.toFixed(2)}%;height:${place.hauteur.toFixed(2)}%;left:calc(${(place.colonne * largeur).toFixed(2)}% + 2px);width:calc(${largeur.toFixed(2)}% - 4px)`;
    const minutes = place.hauteur * (AGENDA_HEURE_FIN - AGENDA_HEURE_DEBUT) * 60 / 100;
    const court = minutes < 40;
    const etats = infos && e.signature && !court && etatsTiennentAgenda(minutes);
    const lignes = lignesTitreEvenement(minutes, etats);
    const initiales = d && d.responsable ? initialesResponsable(d) : '';
    const meta = [initiales, infos && infos.confrere ? infos.confrere.replace(/\s+en 2nd$/, '') : ''].filter(Boolean);
    const cle = cleEvenementAgenda(e);
    const duree = dureeRendezVous(e.heure, e.heureFin);
    const bulle = [`${e.heure}${e.heureFin ? ' – ' + e.heureFin : ''}${duree ? ' (' + duree + ')' : ''}`, e.sujet, e.lieu,
      infos ? [infos.responsable, infos.confrere].filter(Boolean).join(' · ') : '',
      proba ? `${proba.pourcent} % de chances que le rendez-vous soit maintenu` : ''].filter(Boolean).join(' · ');
    const heure = `<b class="ag-evt-debut">${escapeHtml(e.heure)}</b>`;
    return `<button type="button" class="ag-evt ag-evt-compact ajd-${teinte}${e.horsAgenda ? ' ag-hors-agenda' : ''}${e.option ? ' ag-option' : ''}${court ? ' ag-evt-court' : ''}${agendaSelection === cle ? ' selection' : ''}" style="${style}"
        data-cle="${escapeAttr(cle)}"${attributGlisseAgenda(e)} onclick="ouvrirDetailAgenda('${escapeOnclickArg(cle)}')" title="${escapeAttr(bulle)}">
        ${e.option && !court ? `<span class="ag-fantome-tete ag-option-tete">Option ${escapeHtml(libelleOptionSondage(e.sujet).rang)}</span>` : ''}
        <span class="ag-evt-titre" style="--lignes:${e.option && !court ? Math.max(1, lignes - 1) : lignes}">${court ? heure + ' ' : ''}${escapeHtml(e.option ? libelleOptionSondage(e.sujet).titre : (e.sujet || '(sans titre)'))}</span>
        ${court ? '' : `<span class="ag-evt-meta">${heure}${meta.length ? ` · ${escapeHtml(meta.join(' · '))}` : (e.lieu && !d ? ` · ${escapeHtml(e.lieu)}` : '')}${!etats && infos && e.signature ? renderEtatsMiniRendezVous(infos) : ''}</span>`}
        ${etats ? `<span class="ag-evt-etats">${renderEtatsRendezVous(infos)}</span>` : ''}
        ${proba && !court ? renderPastilleProbabilite(proba) : ''}
        ${poigneesAgenda(e)}
      </button>`;
  }

  function renderEvenementGrille(place, auj) {
    const e = place.e;
    if (e.fantome) return renderFantomeGrille(place);
    if (agendaVue === 'semaine') return renderEvenementSemaine(place, auj);
    const teinte = teinteEvenementAgenda(e, categoriesRdvReglees());
    const d = dossierDeEvenement(e);
    const infos = infosRendezVousDossier(d);
    const proba = probabiliteEvenementAgenda(d, e, auj, absencesOffice);
    const largeur = 100 / place.colonnes;
    const style = `top:${place.haut.toFixed(2)}%;height:${place.hauteur.toFixed(2)}%;left:calc(${(place.colonne * largeur).toFixed(2)}% + 2px);width:calc(${largeur.toFixed(2)}% - 4px)`;
    const heures = `${e.heure}${e.heureFin ? ' – ' + e.heureFin : ''}`;
    const duree = dureeRendezVous(e.heure, e.heureFin);
    const minutesAffichees = place.hauteur * (AGENDA_HEURE_FIN - AGENDA_HEURE_DEBUT) * 60 / 100;
    const court = minutesAffichees < 40;
    const haut = minutesAffichees >= 90;
    const etroit = court && place.colonnes > 1;
    const selection = agendaSelection === cleEvenementAgenda(e);
    const qui = infos ? [infos.responsable, infos.confrere].filter(Boolean).join(' · ') : '';
    const bulle = [`${heures}${duree ? ' (' + duree + ')' : ''}`, e.sujet, e.lieu, qui,
      infos ? infos.etats.map(x => `${x.libelle} ${x.fait ? 'fait' : 'à faire'}`).join(', ') : '',
      proba ? `${proba.pourcent} % de chances que la signature se tienne` : ''].filter(Boolean).join(' · ');
    return `<button type="button" class="ag-evt ajd-${teinte}${e.horsAgenda ? ' ag-hors-agenda' : ''}${e.option ? ' ag-option' : ''}${court ? ' ag-evt-court' : ''}${haut ? ' ag-evt-haut' : ''}${etroit ? ' ag-evt-etroit' : ''}${selection ? ' selection' : ''}${proba ? ' ag-evt-avec-proba' : ''}" style="${style}"
        data-cle="${escapeAttr(cleEvenementAgenda(e))}"${attributGlisseAgenda(e)} onclick="ouvrirDetailAgenda('${escapeOnclickArg(cleEvenementAgenda(e))}')" title="${escapeAttr(bulle)}">
        <span class="ag-evt-titre">${e.option ? `<span class="ag-fantome-tete ag-option-tete">Option ${escapeHtml(libelleOptionSondage(e.sujet).rang)}</span> ` : ''}${escapeHtml(e.option ? libelleOptionSondage(e.sujet).titre : (e.sujet || '(sans titre)'))}</span>
        <span class="ag-evt-heure"><span>${escapeHtml(e.heure)}</span>${e.heureFin ? `<span class="ag-evt-fin">– ${escapeHtml(e.heureFin)}</span>` : ''}${duree ? `<span class="ag-evt-duree">${escapeHtml(duree)}</span>` : ''}</span>
        ${qui ? `<span class="ag-evt-qui">${escapeHtml(qui)}${infos && e.signature && !court && !etatsTiennentAgenda(minutesAffichees) ? renderEtatsMiniRendezVous(infos) : ''}</span>` : (e.lieu ? `<span class="ag-evt-qui">${escapeHtml(e.lieu)}</span>` : '')}
        ${infos && e.signature && etatsTiennentAgenda(minutesAffichees) ? `<span class="ag-evt-etats">${renderEtatsRendezVous(infos)}</span>` : ''}
        ${proba ? renderPastilleProbabilite(proba) : ''}
        ${poigneesAgenda(e)}
      </button>`;
  }

  // Carte fantôme : signature probable cette semaine, pas encore placée — un clic ouvre le détail
  // (pourquoi cette semaine, créneaux, « Placer »).
  function renderFantomeGrille(place) {
    const e = place.e;
    const p = e.probable;
    const largeur = 100 / place.colonnes;
    const style = `top:${place.haut.toFixed(2)}%;height:${place.hauteur.toFixed(2)}%;left:calc(${(place.colonne * largeur).toFixed(2)}% + 2px);width:calc(${largeur.toFixed(2)}% - 4px)`;
    const selection = agendaSelection === cleEvenementAgenda(e);
    return `<button type="button" class="ag-evt ag-fantome ajd-signature${selection ? ' selection' : ''}" style="${style}"
        data-cle="${escapeAttr(cleEvenementAgenda(e))}" onclick="ouvrirDetailAgenda('${escapeOnclickArg(cleEvenementAgenda(e))}')"
        title="${escapeAttr(`Il est probable que la signature de ${e.sujet} se tienne cette semaine-là (${p.pourcent} %). Proposé : ${e.heure}. Cliquer pour le placer.`)}">
        <span class="ag-fantome-tete">${icone('sparkle')}Probable</span>
        <span class="ag-evt-titre">${escapeHtml(e.sujet)}</span>
        <span class="ag-evt-heure"><span>${escapeHtml(e.heure)}</span>${e.heureFin ? `<span class="ag-evt-fin">– ${escapeHtml(e.heureFin)}</span>` : ''}<span class="ag-evt-duree">${p.pourcent} %</span></span>
      </button>`;
  }

  // Pure : le trait de l'heure (étude, 30/09 : « une barre du temps en fonction de l'heure ») —
  // null si aujourd'hui n'est pas affiché ou si l'heure est hors de la plage 8 h – 19 h.
  function traitHeureAgenda(maintenant, jours, aujourdhuiIso) {
    const colonne = (jours || []).indexOf(aujourdhuiIso);
    const minutes = maintenant.getHours() * 60 + maintenant.getMinutes();
    if (colonne === -1 || minutes < AGENDA_HEURE_DEBUT * 60 || minutes > AGENDA_HEURE_FIN * 60) return null;
    return {
      haut: (minutes - AGENDA_HEURE_DEBUT * 60) / ((AGENDA_HEURE_FIN - AGENDA_HEURE_DEBUT) * 60) * 100,
      colonne,
      libelle: `${String(maintenant.getHours()).padStart(2, '0')}:${String(maintenant.getMinutes()).padStart(2, '0')}`
    };
  }

  // Un trait fin sur toute la semaine, appuyé sur la colonne d'aujourd'hui, l'heure dans une pastille.
  function renderTraitHeureAgenda(t, nbJours) {
    const largeur = 100 / nbJours;
    return `<div class="ag-maintenant" style="top:${t.haut.toFixed(2)}%" aria-hidden="true">
        <i class="ag-maintenant-jour" style="left:${(t.colonne * largeur).toFixed(3)}%;width:${largeur.toFixed(3)}%"></i>
        <span>${escapeHtml(t.libelle)}</span>
      </div>`;
  }

  // Toutes les 30 s, page Agenda ouverte : le trait suit l'heure sans redessiner la grille ; il
  // n'est redessiné que s'il doit apparaître ou disparaître (9 h, 19 h, minuit).
  function majTraitHeureAgenda() {
    if (ongletActuel !== 'agenda' || agendaVue === 'mois') return;
    const jours = agendaVue === 'jour' ? [agendaJour] : joursSemaineAgenda(agendaLundi);
    const t = traitHeureAgenda(new Date(), jours, isoAujourdhuiLocal());
    const el = document.querySelector('#agenda-contenu .ag-maintenant');
    if (!!t !== !!el) { renderPageAgenda(); return; }
    if (!t) return;
    el.style.top = t.haut.toFixed(2) + '%';
    const pastille = el.querySelector('span');
    if (pastille && pastille.textContent !== t.libelle) pastille.textContent = t.libelle;
  }

  // ---- Créneau choisi, comme dans Outlook (étude, 30/09) : un clic sur une case vide surligne un
  // créneau d'une heure à la demi-heure près ; un double-clic — ou un second appui sur le créneau
  // surligné (téléphone, clavier) — ouvre « Nouveau rendez-vous » sur ce créneau, 1 h par défaut.
  // Étude, 01/10 : à la souris, un second clic simple déplace le créneau, il n'ouvre plus rien. ----
  let agendaCaseChoisie = null;   // { date, heure }

  // Pure : l'heure « HH:MM » d'un clic dans la case de l'heure h (première moitié → h:00, seconde → h:30).
  function heureCaseAgenda(h, positionY, hauteurCase) {
    const demi = hauteurCase > 0 && positionY >= hauteurCase / 2;
    return `${String(h).padStart(2, '0')}:${demi ? '30' : '00'}`;
  }

  function renderCaseChoisieAgenda(iso) {
    const c = agendaCaseChoisie;
    if (!c || c.date !== iso) return '';
    const debut = minutesHeure(c.heure);
    const total = (AGENDA_HEURE_FIN - AGENDA_HEURE_DEBUT) * 60;
    const haut = (debut - AGENDA_HEURE_DEBUT * 60) / total * 100;
    const hauteur = Math.min(60, AGENDA_HEURE_FIN * 60 - debut) / total * 100;
    const fin = debut + 60;
    const libelleFin = `${String(Math.floor(fin / 60)).padStart(2, '0')}:${String(fin % 60).padStart(2, '0')}`;
    // Un rendez-vous copié (client/53) : « Coller » sur le créneau choisi, pour la souris et le doigt (Ctrl+V au clavier).
    const coller = agendaPressePapier ? `<button type="button" class="ag-case-coller" onclick="event.stopPropagation(); collerRendezVousAgenda()" title="${escapeAttr(`Coller « ${agendaPressePapier.sujet} » ici (Ctrl+V)`)}">${icone('copier')} Coller</button>` : '';
    return `<div class="ag-case-choisie" style="top:${haut.toFixed(2)}%;height:${hauteur.toFixed(2)}%"${coller ? '' : ' aria-hidden="true"'}><span>${icone('plus')}${escapeHtml(c.heure)} – ${escapeHtml(libelleFin)}</span>${coller}</div>`;
  }

  function choisirCaseAgenda(evt, iso, h) {
    const cible = evt && evt.currentTarget;
    const r = cible && cible.getBoundingClientRect ? cible.getBoundingClientRect() : null;
    // Au clavier (Entrée), pas de position : l'heure pleine.
    const heure = r && evt.clientY ? heureCaseAgenda(h, evt.clientY - r.top, r.height) : heureCaseAgenda(h, 0, 0);
    // Étude, 01/10 : « un clic pour placer le curseur du rendez-vous puis un double-clic pour ouvrir
    // le formulaire ». À la souris, un clic place (ou déplace) le créneau, jamais plus ; le double-clic
    // (second clic, evt.detail = 2) ouvre le formulaire sur le créneau placé au premier clic. Au clavier
    // (evt.detail = 0) et au doigt, un second appui sur le créneau surligné l'ouvre.
    const clics = evt && typeof evt.detail === 'number' ? evt.detail : 0;
    const choisie = agendaCaseChoisie && agendaCaseChoisie.date === iso ? agendaCaseChoisie : null;
    const auDoigt = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if (clics >= 2 || ((clics === 0 || auDoigt) && choisie && choisie.heure === heure)) {
      const h0 = clics >= 2 && choisie && Math.abs(minutesHeure(choisie.heure) - minutesHeure(heure)) <= 30 ? choisie.heure : heure;
      agendaCaseChoisie = null;
      ouvrirCreationAgenda(iso, h0);
      return;
    }
    agendaCaseChoisie = { date: iso, heure };
    agendaSelection = null;
    renderPageAgenda();
    // Le focus revient sur la case, pour qu'un second Entrée crée le rendez-vous.
    const col = document.querySelector(`#agenda-contenu .ag-colonne[data-jour="${iso}"]`);
    const cases = col ? col.querySelectorAll('.ag-case') : [];
    const i = h - AGENDA_HEURE_DEBUT;
    if (cases[i]) cases[i].focus({ preventScroll: true });
  }

  function renderGrilleAgenda() {
    const auj = isoAujourdhuiLocal();
    const jours = agendaVue === 'jour' ? [agendaJour] : joursSemaineAgenda(agendaLundi);
    const evenements = evenementsFiltresRecherche(evenementsAffichesAgenda().concat(fantomesAffichesAgenda()), agendaRecherche);
    const heures = [];
    for (let h = AGENDA_HEURE_DEBUT; h < AGENDA_HEURE_FIN; h++) heures.push(h);
    // En-têtes des jours comme dans Outlook : le nom du jour, la date dessous ; aujourd'hui en gras.
    const tetes = jours.map(iso => {
      const dt = new Date(iso + 'T00:00:00');
      const nom = dt.toLocaleDateString('fr-FR', { weekday: 'long' });
      const absents = (absencesOffice || []).filter(a => absenceCouvreJour(a, iso)).map(a => a.initiales || prenomCollaborateur(a.collaborateur));
      const note = estJourFerie(iso) ? 'Férié' : absents.length ? `Absent : ${absents.join(', ')}` : '';
      return `<button type="button" class="ag-tete${iso === auj ? ' aujourdhui' : ''}${estJourFerie(iso) ? ' ferie' : ''}" onclick="choisirJourAgenda('${iso}')" title="Voir le ${escapeAttr(formatDateFr(iso))}">
          <span class="ag-tete-nom">${escapeHtml(nom.charAt(0).toUpperCase() + nom.slice(1))}</span>
          <span class="ag-tete-date">${escapeHtml(dt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }))}</span>
          ${note ? `<span class="ag-tete-note">${escapeHtml(note)}</span>` : ''}
        </button>`;
    }).join('');
    const journees = jours.map(iso => {
      const liste = evenementsJourAgenda(evenements, iso).filter(e => e.journeeEntiere || !e.heure || e.date !== iso);
      return `<div class="ag-journee${iso === auj ? ' aujourdhui' : ''}">${liste.map(e => `<button type="button"
          class="ag-journee-evt ajd-${teinteEvenementAgenda(e, categoriesRdvReglees())}${e.horsAgenda ? ' ag-hors-agenda' : ''}${e.option ? ' ag-option' : ''}${e.fantome ? ' ag-fantome' : ''}${agendaSelection === cleEvenementAgenda(e) ? ' selection' : ''}"
          data-cle="${escapeAttr(cleEvenementAgenda(e))}" onclick="ouvrirDetailAgenda('${escapeOnclickArg(cleEvenementAgenda(e))}')" title="${escapeAttr(e.fantome ? `Signature probable cette semaine (${e.probable.pourcent} %) — aucun créneau libre` : e.sujet || '')}">${e.fantome ? `${icone('sparkle')}${escapeHtml(e.probable.pourcent + ' % · ')}` : ''}${escapeHtml(e.sujet || '(sans titre)')}</button>`).join('')}</div>`;
    }).join('');
    const trait = traitHeureAgenda(new Date(), jours, auj);
    const colonnes = jours.map(iso => `<div class="ag-colonne${iso === auj ? ' aujourdhui' : ''}" data-jour="${iso}">
        ${heures.map(h => `<button type="button" class="ag-case" onclick="choisirCaseAgenda(event, '${iso}', ${h})" aria-label="Créneau du ${escapeAttr(formatDateFr(iso))} à ${h} h — double-clic pour créer un rendez-vous"></button>`).join('')}
        ${renderCaseChoisieAgenda(iso)}
        ${disposerEvenementsJour(evenements, iso).map(p => renderEvenementGrille(p, auj)).join('')}
      </div>`).join('');
    const avecJournees = jours.some(iso => evenementsJourAgenda(evenements, iso).some(e => e.journeeEntiere || !e.heure || e.date !== iso));
    return `<div class="ag-grille-defil"><div class="ag-grille ag-vue-${agendaVue}" style="--ag-colonnes:${jours.length}">
        <div class="ag-coin"></div><div class="ag-tetes">${tetes}</div>
        ${avecJournees ? `<div class="ag-coin ag-coin-journee">Journée</div><div class="ag-journees">${journees}</div>` : ''}
        <div class="ag-heures">${heures.map(h => `<span>${h} h</span>`).join('')}</div>
        <div class="ag-corps">
          ${colonnes}
          ${trait ? renderTraitHeureAgenda(trait, jours.length) : ''}
        </div>
      </div></div>`;
  }

  // Vue Mois, comme celle d'Outlook : une case par jour, trois rendez-vous au plus, « + N » ensuite.
  function renderVueMoisAgenda() {
    const auj = isoAujourdhuiLocal();
    const evenements = evenementsFiltresRecherche(evenementsAffichesAgenda(), agendaRecherche);
    const semaines = grilleMoisAgenda(agendaMois);
    return `<div class="ag-vue-mois">
        ${['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'].map(j => `<span class="ag-vm-jsem">${j}</span>`).join('')}
        ${semaines.map(s => s.map(iso => {
          const liste = evenementsJourAgenda(evenements, iso)
            .sort((a, b) => (a.journeeEntiere ? 0 : 1) - (b.journeeEntiere ? 0 : 1) || String(a.heure || '').localeCompare(String(b.heure || '')));
          const classes = ['ag-vm-case'];
          if (iso.slice(0, 7) !== agendaMois) classes.push('hors-mois');
          if (iso === auj) classes.push('aujourdhui');
          return `<div class="${classes.join(' ')}">
              <button type="button" class="ag-vm-num" onclick="choisirJourAgenda('${iso}')" title="Voir le ${escapeAttr(formatDateFr(iso))}">${Number(iso.slice(8))}</button>
              ${liste.slice(0, 3).map(e => `<button type="button" class="ag-vm-evt ajd-${teinteEvenementAgenda(e, categoriesRdvReglees())}${e.horsAgenda ? ' ag-hors-agenda' : ''}${e.option ? ' ag-option' : ''}" data-cle="${escapeAttr(cleEvenementAgenda(e))}"
                  onclick="ouvrirDetailAgenda('${escapeOnclickArg(cleEvenementAgenda(e))}')" title="${escapeAttr(`${e.heure ? e.heure + (e.heureFin ? ' – ' + e.heureFin : '') + ' · ' : ''}${e.sujet || ''}`)}">
                  ${e.heure && !e.journeeEntiere ? `<b>${escapeHtml(e.heure)}</b> ` : ''}${escapeHtml(e.sujet || '(sans titre)')}</button>`).join('')}
              ${liste.length > 3 ? `<button type="button" class="ag-vm-plus" onclick="choisirJourAgenda('${iso}')">+ ${liste.length - 3} autre${liste.length - 3 > 1 ? 's' : ''}</button>` : ''}
            </div>`;
        }).join('')).join('')}
      </div>`;
  }

  // Calendrier du mois de la colonne de gauche : jour affiché en rond foncé, aujourd'hui cerclé,
  // un point sous les jours qui ont des rendez-vous (bleu des actes pour une signature).
  function renderMoisAgenda() {
    const auj = isoAujourdhuiLocal();
    const semaines = grilleMoisAgenda(agendaMois);
    const titre = new Date(agendaMois + '-01T00:00:00').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    const periode = agendaVue === 'jour' ? [agendaJour] : agendaVue === 'semaine' ? joursSemaineAgenda(agendaLundi) : [];
    const lus = evenementsFiltresRecherche(agendaEvenements, agendaRecherche);
    const compte = (iso) => evenementsJourAgenda(lus, iso).length;
    const signature = (iso) => evenementsJourAgenda(lus, iso).some(e => e.signature)
      || (!agendaRecherche.trim() && dossiers.some(d => !d.archive && d.rendezVousSignature === iso));
    return `<div class="ag-mois">
        <div class="ag-mois-tete">
          <wa-button appearance="plain" size="s" type="button" class="bouton-icone icon-btn" onclick="naviguerMoisAgenda(-1)" aria-label="Mois précédent">${icone('chevron-left')}</wa-button>
          <span class="ag-mois-titre">${escapeHtml(titre.charAt(0).toUpperCase() + titre.slice(1))}</span>
          <wa-button appearance="plain" size="s" type="button" class="bouton-icone icon-btn" onclick="naviguerMoisAgenda(1)" aria-label="Mois suivant">${icone('chevron-right')}</wa-button>
        </div>
        <div class="ag-mois-grille" role="grid">
          ${['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'].map(l => `<span class="ag-mois-jsem">${l}</span>`).join('')}
          ${semaines.map(s => s.map(iso => {
            const n = compte(iso);
            const classes = ['ag-mois-jour'];
            if (iso.slice(0, 7) !== agendaMois) classes.push('hors-mois');
            if (iso === auj) classes.push('aujourdhui');
            if (iso === agendaJour && agendaVue !== 'mois') classes.push('choisi');
            else if (periode.indexOf(iso) !== -1) classes.push('dans-semaine');
            return `<button type="button" class="${classes.join(' ')}" onclick="allerAuJourAgenda('${iso}')" title="${escapeAttr(`${formatDateFr(iso)} — ${n ? n + ' rendez-vous' : 'aucun rendez-vous'}`)}">
                <span class="ag-mois-n">${Number(iso.slice(8))}</span>
                <span class="ag-mois-points">${n ? `<i class="${signature(iso) ? 'sig' : ''}"></i>` : ''}</span>
              </button>`;
          }).join('')).join('')}
        </div>
      </div>`;
  }

  // « Rendez-vous à placer » (étude 07/10 : « mettre en premier les plus complets, que ça prenne moins de hauteur ») : les dossiers
  // prêts à signer d'abord (`dossiersAPlacer`), puis la plus forte probabilité de tenue, puis la semaine la plus proche. Pure.
  var NB_RDV_A_PLACER_AFFICHES = 5;
  let agendaPlacerTous = false;
  function ordreRendezVousAPlacer(probables, prets) {
    const pret = (x) => (prets || []).indexOf(x.d.id) !== -1 ? 0 : 1;
    return (probables || []).slice().sort((a, b) => pret(a) - pret(b) || (b.p.pourcent || 0) - (a.p.pourcent || 0) || String(a.p.date).localeCompare(String(b.p.date)));
  }
  function basculerRendezVousAPlacerTous() {
    agendaPlacerTous = !agendaPlacerTous;
    renderPageAgenda();
  }

  // Anticipations : ce que CLAIRE voit venir, avec le geste qui y répond.
  function renderAnticipationsAgenda() {
    const auj = isoAujourdhuiLocal();
    const global = vueGlobaleDashboard();
    const perimetre = dossiersDuPerimetre(dossiers, utilisateurPoste, global);
    // « Signatures de la semaine » retiré à la demande de l'étude (01/10) ; la probabilité de tenue reste
    // dans le détail de chaque rendez-vous.
    // Dossiers sans rendez-vous, par semaine probable de signature (au plus tôt) : un clic affiche
    // cette semaine, carte fantôme ouverte. Ceux qui sont prêts à signer gardent trois créneaux libres.
    const prets = dossiersAPlacer(perimetre).map(d => d.id);
    const probables = ordreRendezVousAPlacer(perimetre.map(d => ({ d, p: semaineProbableSignature(d, auj, absencesOffice, agendaEvenements) })).filter(x => x.p), prets);
    const aPlacer = agendaPlacerTous ? probables : probables.filter((x, i) => i < NB_RDV_A_PLACER_AFFICHES || agendaSelection === 'probable:' + x.d.id);
    // Créneaux proposés seulement sur le premier dossier et sur celui qu'on vient de choisir (étude 07/10 : « que ça prenne moins de
    // hauteur ») — un clic sur un autre dossier lui donne les siens.
    const avecCreneaux = (d, i) => i === 0 || agendaSelection === 'probable:' + d.id;
    const ecrire = exchangeAgendaPret();
    const blocPlacer = `<section class="ag-anticipe">
        <h3 class="jour-section-titre">Rendez-vous à placer${probables.length ? ` <span class="jour-onglet-nb">${probables.length}</span>` : ''} ${infoBulle('Dossiers sans rendez-vous de signature, les plus complets d’abord (prêts à signer, puis par pourcentage). Semaine probable : au plus tôt, une fois l’offre de prêt attendue reçue et ses 11 jours de réflexion passés, la vente préalable faite, et au moins deux semaines après aujourd’hui (appel de fonds et projet). Le pourcentage tient compte de ce qui reste à lever. Un clic affiche la semaine, où le rendez-vous est proposé en pointillé sur un créneau libre. Pour le premier dossier prêt à signer (ou celui choisi), trois créneaux libres : jamais à 9 h, entre 12 h et 14 h ni après 18 h, 6 rendez-vous par jour au plus (triangle = exception).')}</h3>
        ${aPlacer.length ? `<ul class="ag-liste">${aPlacer.map(({ d, p }, i) => {
          const creneaux = avecCreneaux(d, i) && prets.indexOf(d.id) !== -1 && !p.aConfirmer ? creneauxProposesSignature(d, agendaEvenements, absencesOffice, auj, 3) : [];
          const semaine = new Date(p.lundi + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
          return `<li class="ag-placer">
              <button type="button" class="ag-ligne${agendaSelection === 'probable:' + d.id ? ' selection' : ''}" onclick="allerSemaineProbableAgenda('${d.id}')" title="${escapeAttr(libelleDossierAffiche(d) + ' — ' + (p.aConfirmer ? `Rendez-vous en attente de confirmation (« ? » dans l’agenda) le ${formatDateFr(p.date)}. L’afficher.` : `Au plus tôt le ${formatDateFr(p.date)} : ${p.raison}. Afficher cette semaine.`))}">
                <span class="ag-ligne-texte"><b>${escapeHtml(libelleDossierAffiche(d))}</b>
                <span class="ag-placer-meta">${renderPastilleProbabilite(p)}<span>${p.aConfirmer ? `À confirmer : ${escapeHtml(new Date(p.date + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', ''))} ${escapeHtml(String(p.heure).replace(':', ' h '))}` : `Semaine du ${escapeHtml(semaine)}`}${p.depasseButoir ? ' · après la date butoir' : ''}${d.responsable ? ' · ' + escapeHtml(prenomCollaborateur(d.responsable)) : ''}</span></span></span>
              </button>
              ${creneaux.length ? `<span class="ag-creneaux">${creneaux.map(c => `<wa-button appearance="outlined" size="s" pill type="button" class="action-rapide ag-creneau${c.apresButoir ? ' apres-butoir' : ''}${c.exceptionnel ? ' exceptionnel' : ''}"
                  onclick="placerCreneauSignature('${d.id}', '${c.date}', '${c.heure}')" ${ecrire ? '' : 'disabled'}
                  title="${escapeAttr([c.exceptionnel ? 'Créneau exceptionnel : ' + c.exceptionnel : '', c.apresButoir ? 'Après la date butoir' : ''].filter(Boolean).join(' · ') || 'Placer le rendez-vous de signature à ce créneau')}">${c.exceptionnel ? icone('alert-triangle') : ''}${escapeHtml(new Date(c.date + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' }).replace('.', ''))} · ${escapeHtml(c.heure.replace(/^0/, '').replace(':', ' h '))}</wa-button>`).join('')}${sondageOuvertDossier(d.id)
                  ? `<span class="ag-sondage-en-cours" title="Sondage de créneaux en cours">${icone('users')} sondage</span>`
                  : `<wa-button appearance="outlined" size="s" pill type="button" class="action-rapide ag-creneau ag-sonder" onclick="ouvrirSondageCreneaux('${d.id}')" title="Proposer plusieurs créneaux aux parties, qui choisissent par email">${icone('users')} Proposer</wa-button>`}</span>` : ''}
            </li>`;
        }).join('')}</ul>${probables.length > NB_RDV_A_PLACER_AFFICHES ? `<button type="button" class="lien-discret ag-placer-plus" onclick="basculerRendezVousAPlacerTous()">${agendaPlacerTous ? 'Voir moins' : `Voir ${probables.length - aPlacer.length} de plus`}</button>` : ''}` : '<p class="jour-vide">Tous les dossiers ont un rendez-vous de signature.</p>'}
      </section>`;
    // « Relation client » retiré de la barre (étude, 01/10) : ces emails sont dans l'onglet Échanges
    // de la fiche du dossier (echangesSelonStade).
    return blocPlacer;
  }

  // « Dates proposées » : les sondages sans dossier en cours (ceux d'un dossier vivent sur sa fiche),
  // leurs réponses, et le geste pour en lancer un (étude, 01/10).
  // Lien de la colonne de l'agenda vers le suivi des dates proposées (étude, 01/10 : « un lien pour
  // accéder à une page qui permet de suivre les dates en attente de confirmation ou déjà validées »).
  function renderSondagesSansDossierAgenda() {
    if (!exchangeAgendaPret()) return '';
    const attente = sondagesCreneaux.filter(x => x.statut === 'ouvert').length;
    const nouvelles = reponsesNonVuesSondages(sondagesCreneaux, dateDatesVues()).length;
    return `<button type="button" class="ag-lien-dates${nouvelles ? ' a-nouveau' : ''}" onclick="ouvrirSuiviDatesProposees()">
        ${icone('users')}<span class="ag-lien-dates-texte">Dates proposées${nouvelles ? `<span class="ag-lien-dates-nouveau">${nouvelles} nouvelle${nouvelles > 1 ? 's' : ''} réponse${nouvelles > 1 ? 's' : ''}</span>` : ''}</span>
        ${nouvelles ? `<span class="sidebar-badge-notif" title="Réponses pas encore vues">${nouvelles}</span>` : attente ? `<span class="jour-onglet-nb" title="En attente de réponse">${attente}</span>` : ''}
        ${icone('chevron-right')}
      </button>`;
  }

  // ---- Réponses aux dates proposées pas encore vues (étude, 01/10 : « une notification sur Agenda quand
  // une réponse est revenue ») : pastille rouge sur « Agenda » dans la barre latérale et sur le lien
  // « Dates proposées », effacée à l'ouverture du volet. Repère « vu le » propre au poste.
  // Pure : les réponses reçues après `vuLe` sur les sondages encore ouverts.
  function reponsesNonVuesSondages(sondages, vuLe) {
    const depuis = Date.parse(vuLe || '') || 0;
    const sortie = [];
    for (const x of sondages || []) {
      if (!x || x.statut !== 'ouvert') continue;
      for (const r of x.reponses || []) {
        const t = Date.parse(r && r.recuLe || '');
        if (t && t > depuis) sortie.push({ id: x.id, email: r.email });
      }
    }
    return sortie;
  }

  function cleDatesVues() { return 'claire-dates-vues:' + (utilisateurPoste || 'poste'); }
  function dateDatesVues() {
    try {
      let v = localStorage.getItem(cleDatesVues());
      // Premier passage sur ce poste : rien d'ancien n'est signalé.
      if (!v) { v = new Date().toISOString(); ecrireLocal(cleDatesVues(), v); }
      return v;
    } catch (e) { return ''; }
  }
  function marquerDatesVues() {
    try { localStorage.setItem(cleDatesVues(), new Date().toISOString()); } catch (e) { /* stockage refusé */ }
    majBadgeAgendaDates();
  }

  function majBadgeAgendaDates() {
    const el = document.getElementById('badge-notif-agenda');
    if (!el) return;
    const n = reponsesNonVuesSondages(sondagesCreneaux, dateDatesVues()).length;
    el.textContent = n > 99 ? '99+' : String(n);
    el.style.display = n > 0 ? '' : 'none';
    el.title = n ? `${n} réponse${n > 1 ? 's' : ''} aux dates proposées` : '';
    const lien = el.closest('.sidebar-link');
    if (lien) lien.classList.toggle('a-notif', n > 0);
    majPastilleMenuMobile();
  }

  // ---- Suivi des dates proposées (tiroir à droite, comme une fiche) : en attente, validées, sans suite ----
  // Pure : les sondages de créneaux rangés pour le suivi. En attente = ouverts (les plus récents
  // d'abord) ; validées = placés, par date retenue (la plus proche à venir d'abord, puis les passées) ;
  // sans suite = annulés ou expirés, les 20 plus récents.
  function classerSuiviDatesProposees(sondages, aujourdhuiIso) {
    const liste = Array.isArray(sondages) ? sondages : [];
    const auj = aujourdhuiIso || isoAujourdhuiLocal();
    const retenu = (x) => (x.creneaux || []).find(c => c.n === x.choisi) || null;
    const attente = liste.filter(x => x.statut === 'ouvert')
      .sort((a, b) => String(b.creeLe || '').localeCompare(String(a.creeLe || '')));
    const valides = liste.filter(x => x.statut === 'place').map(x => ({ s: x, creneau: retenu(x) }))
      .sort((a, b) => {
        const da = a.creneau ? a.creneau.date : '', db = b.creneau ? b.creneau.date : '';
        const fa = da >= auj, fb = db >= auj;
        if (fa !== fb) return fa ? -1 : 1;
        return fa ? da.localeCompare(db) : db.localeCompare(da);
      });
    const sansSuite = liste.filter(x => x.statut === 'annule' || x.statut === 'expire')
      .sort((a, b) => String(b.closLe || '').localeCompare(String(a.closLe || ''))).slice(0, 20);
    return { attente, valides, sansSuite };
  }

  function libelleSondageSuivi(x) {
    const d = x.dossierId ? dossiers.find(y => y.id === x.dossierId) : null;
    return d ? libelleDossierAffiche(d) : x.titre || libelleDossierParNom(x.dossierNom, x.dossierId) || 'Rendez-vous';
  }

  var datesVuesAvantOuverture = '';
  function ouvrirSuiviDatesProposees() {
    const overlay = document.getElementById('dates-proposees-overlay');
    if (!overlay) return;
    overlay.style.display = 'flex';
    document.body.classList.add('tiroir-dates-ouvert');
    datesVuesAvantOuverture = dateDatesVues();
    marquerDatesVues();
    if (ongletActuel === 'agenda') renderPageAgenda();
    renderSuiviDatesProposees();
    chargerSondages().then(renderSuiviDatesProposees);
  }

  function fermerSuiviDatesProposees() {
    const overlay = document.getElementById('dates-proposees-overlay');
    if (overlay) overlay.style.display = 'none';
    document.body.classList.remove('tiroir-dates-ouvert');
  }
  // Rendez-vous que CLAIRE peut retirer de l'agenda de l'office : lu dans Exchange (itemId), réel (ni fantôme ni option hors
  // agenda), du stock courant (pas l'historique en lecture seule), et l'écriture Outlook réglée. Commun au bouton « Supprimer » du
  // détail et à la touche Suppr.
  function evenementSupprimableAgenda(e) {
    return !!(e && exchangeAgendaPret() && e.itemId && !e.horsAgenda && !e.archive && !e.fantome);
  }

  // Touche Suppr (étude 05/10) : sur le rendez-vous sélectionné, elle ouvre la MÊME confirmation que le bouton (jamais de
  // suppression silencieuse : l'élément part dans les éléments supprimés d'Outlook). Sans effet pendant une saisie, une fenêtre
  // ouverte, une confirmation en cours, ou hors de la page Agenda.
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Delete' || ev.defaultPrevented || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (ongletActuel !== 'agenda' || !agendaSelection || agendaModale || notesAgendaEdition) return;
    const cible = ev.target;
    if (cible && (cible.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(cible.tagName || ''))) return;
    if (document.querySelector('#confirm-overlay[style*="flex"]')) return;
    const e = evenementsAffichesAgenda().find(x => cleEvenementAgenda(x) === agendaSelection);
    if (!evenementSupprimableAgenda(e)) return;
    ev.preventDefault();
    supprimerEvenementAgenda(agendaSelection);
  });

  document.addEventListener('keydown', (e) => {
    const overlay = document.getElementById('dates-proposees-overlay');
    if (e.key === 'Escape' && overlay && overlay.style.display !== 'none' && !document.querySelector('#confirm-overlay[style*="flex"]')) fermerSuiviDatesProposees();
  });

  function voirDateProposeeDansAgenda(date) {
    fermerSuiviDatesProposees();
    positionnerAgenda(date);
    if (ongletActuel !== 'agenda') definirOnglet('agenda');
    else { renderPageAgenda(); chargerAgendaSemaine(); }
  }

  function ouvrirFicheDepuisDatesProposees(id) {
    fermerSuiviDatesProposees();
    ouvrirDossierDepuisDashboard(id);
  }

  function renderSuiviDatesProposees() {
    const overlay = document.getElementById('dates-proposees-overlay');
    const zone = document.getElementById('dates-proposees-liste');
    if (!overlay || !zone || overlay.style.display === 'none') return;
    const { attente, valides, sansSuite } = classerSuiviDatesProposees(sondagesCreneaux, isoAujourdhuiLocal());
    const jourCourt = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', '');
    const dateCourte = (t) => t ? formatDateFr(String(t).slice(0, 10)) : '';
    const titre = (x) => {
      const d = x.dossierId ? dossiers.find(y => y.id === x.dossierId) : null;
      return d
        ? `<button type="button" class="lien-bouton dp-titre" onclick="ouvrirFicheDepuisDatesProposees('${d.id}')" title="Ouvrir la fiche du dossier">${escapeHtml(libelleSondageSuivi(x))} ${icone('file-text')}</button>`
        : `<b class="dp-titre">${escapeHtml(libelleSondageSuivi(x))}</b>`;
    };
    const groupe = (texte, n, aide) => `<div class="widgets-galerie-groupe">${texte} <span class="jour-onglet-nb">${n}</span>${aide ? ' ' + infoBulle(aide) : ''}</div>`;
    const nouvelles = new Set(reponsesNonVuesSondages(sondagesCreneaux, datesVuesAvantOuverture).map(r => r.id));
    const carteAttente = (x) => {
      if (x.optionsSeules) {
        return `<div class="sondage-panneau dp-carte">
            <div class="sondage-tete">${titre(x)}<span class="hint">Options posées le ${escapeHtml(dateCourte(x.creeLe))}, sans email · gardées jusqu’au placement</span></div>
            ${renderTableSondage(x, true)}
            <div class="sondage-actions"><button type="button" class="lien-bouton" onclick="annulerSondage('${escapeOnclickArg(x.id)}')">${icone('x')} Retirer les options</button></div>
          </div>`;
      }
      const repondu = x.participants.length - sansReponseSondage(x).length;
      return `<div class="sondage-panneau dp-carte${nouvelles.has(x.id) ? ' dp-nouveau' : ''}">
          <div class="sondage-tete">${titre(x)}${nouvelles.has(x.id) ? '<span class="dot-label dl-urgent dp-badge-nouveau"><span class="dot"></span>Nouvelle réponse</span>' : ''}<span class="hint">Envoyé le ${escapeHtml(dateCourte(x.creeLe))} · ${repondu}/${x.participants.length} réponse${x.participants.length > 1 ? 's' : ''}</span></div>
          ${renderTableSondage(x, true)}
          <div class="sondage-actions">
            <button type="button" class="lien-bouton" onclick="relancerSondage('${escapeOnclickArg(x.id)}')" ${sansReponseSondage(x).length ? '' : 'disabled'}>${icone('mail')} Relancer</button>
            <button type="button" class="lien-bouton" onclick="relireSondage('${escapeOnclickArg(x.id)}')">${icone('rotate-ccw')} Relire</button>
            <button type="button" class="lien-bouton" onclick="annulerSondage('${escapeOnclickArg(x.id)}')">${icone('x')} Annuler</button>
          </div>
        </div>`;
    };
    const ligneValidee = ({ s: x, creneau }) => `<li class="dp-ligne">
        <span class="dp-ligne-texte">${titre(x)}<span class="hint">${creneau ? `Validé : ${escapeHtml(jourCourt(creneau.date))} ${escapeHtml(creneau.heure.replace(':', ' h '))}` : 'Validé'}${x.closLe ? ` · le ${escapeHtml(dateCourte(x.closLe))}` : ''}${x.placeSeul ? ' · dernière option, les autres effacées dans Outlook' : ''}</span></span>
        ${creneau ? `<wa-button appearance="outlined" size="s" pill type="button" class="action-rapide" onclick="voirDateProposeeDansAgenda('${creneau.date}')">${icone('calendar')} Voir dans l’agenda</wa-button>` : ''}
      </li>`;
    const ligneSansSuite = (x) => `<li class="dp-ligne dp-sans-suite">
        <span class="dp-ligne-texte">${titre(x)}<span class="hint">${x.statut === 'expire' ? 'Expiré sans réponse retenue' : 'Annulé'}${x.closLe ? ` le ${escapeHtml(dateCourte(x.closLe))}` : ''}</span></span>
      </li>`;
    zone.innerHTML = `
      ${groupe('En attente de réponse', attente.length, 'Dates envoyées par email aux parties ou au confrère : les réponses arrivent toutes seules. « Placer » crée le rendez-vous et retire les options de l’agenda.')}
      ${attente.length ? attente.map(carteAttente).join('') : '<p class="jour-vide">Aucune date en attente de réponse.</p>'}
      ${groupe('Validées', valides.length)}
      ${valides.length ? `<ul class="dp-liste">${valides.map(ligneValidee).join('')}</ul>` : '<p class="jour-vide">Aucune date validée pour l’instant.</p>'}
      ${sansSuite.length ? `<details class="dp-details"><summary>${groupe('Sans suite', sansSuite.length)}</summary><ul class="dp-liste">${sansSuite.map(ligneSansSuite).join('')}</ul></details>` : ''}`;
  }

  var LIBELLES_GESTES_RELATION = {
    confirmationRdv: (g) => `Signature le ${formatDateFr(g.d.rendezVousSignature)}`,
    questionnaire: (g) => `Signé il y a ${-g.j} jour${-g.j > 1 ? 's' : ''}`,
    anniversaire: (g) => `Signé le ${formatDateFr(g.d.rendezVousSignature)}`
  };

  // ---- Comparaison avec la même semaine l'an dernier (étude, 01/10 : « + x rendez-vous, hausse ou
  // baisse de x % ») : comptée par le serveur (GET /api/agenda/comparaison), l'an dernier lu une fois
  // dans Exchange puis gardé. Une semaine par lundi, relue toutes les 2 minutes au plus. ----
  var comparaisonsAgenda = {};
  async function chargerComparaisonAgenda(lundi) {
    const deja = comparaisonsAgenda[lundi];
    if (deja && (deja.chargement || Date.now() - deja.t < 120000)) return;
    comparaisonsAgenda[lundi] = Object.assign({}, deja || {}, { chargement: true, t: Date.now() });
    try {
      const r = await fetchAvecAuth('/api/agenda/comparaison?lundi=' + encodeURIComponent(lundi));
      const corps = await r.json();
      comparaisonsAgenda[lundi] = r.ok ? Object.assign({ t: Date.now() }, corps) : { t: Date.now(), message: corps.erreur || '' };
    } catch (e) {
      comparaisonsAgenda[lundi] = { t: Date.now(), message: 'Serveur injoignable.' };
    }
    if (ongletActuel === 'agenda' && agendaLundi === lundi) renderPageAgenda();
  }

  // Pure : le texte de la comparaison. `null` quand un des deux comptes manque (jamais un faux zéro).
  function texteComparaisonAgenda(c) {
    if (!c || !c.actuel || !c.anPasse || typeof c.ecart !== 'number') return null;
    const annee = String(c.lundiAnPasse || '').slice(0, 4);
    const n = Math.abs(c.ecart);
    const rdv = `${n} rendez-vous`;
    if (c.ecart === 0) return { sens: 'egal', texte: `Autant de rendez-vous qu’en ${annee}` };
    const signe = c.ecart > 0 ? '+' : '−';
    const pourcent = c.pourcent == null ? 'aucun l’an dernier' : `${c.ecart > 0 ? 'hausse' : 'baisse'} de ${Math.abs(c.pourcent)} %`;
    return { sens: c.ecart > 0 ? 'hausse' : 'baisse', texte: `${signe}${rdv} vs ${annee} (${pourcent})` };
  }

  function renderComparaisonAgenda() {
    if (agendaVue === 'mois' || !exchangeAgendaPret()) return '';
    const c = comparaisonsAgenda[agendaLundi];
    if (!c || Date.now() - c.t >= 120000) chargerComparaisonAgenda(agendaLundi);
    const t = texteComparaisonAgenda(c);
    if (!t) return '';
    const debutAnPasse = new Date(c.lundiAnPasse + 'T00:00:00');
    const finAnPasse = new Date(addDays(c.lundiAnPasse, 5) + 'T00:00:00');
    const detail = `Comparé à la même semaine l’an dernier. Cette semaine : ${c.actuel.rendezVous} rendez-vous (dont ${c.actuel.signatures} signature${c.actuel.signatures > 1 ? 's' : ''}). `
      + `Même semaine l’an dernier, du ${debutAnPasse.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} au ${finAnPasse.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })} : ${c.anPasse.rendezVous} (dont ${c.anPasse.signatures} signature${c.anPasse.signatures > 1 ? 's' : ''}). `
      + 'Rendez-vous d’une heure ou plus, du lundi au samedi, lus dans l’agenda partagé ; rendez-vous plus courts, journées entières (absences, dates butoir) et options de sondage non comptés.';
    return ` · <span class="ag-compare ag-compare-${t.sens}">${t.sens === 'egal' ? '' : icone(t.sens === 'hausse' ? 'trend-up' : 'trend-down')}${escapeHtml(t.texte)}</span> ${infoBulle(detail)}`;
  }

  // ---- Recherche d'un dossier dans l'agenda (étude, 01/10) ----
  // Pure : les dossiers dont le nom contient la recherche (sans accents ni casse), en cours d'abord, avec
  // leur rendez-vous de signature (fixé) ou, à défaut, la semaine probable de la signature. 8 au plus.
  function resultatsRechercheAgenda(texte, liste, aujourdhuiIso, absences, evenements) {
    const q = normaliserPourRecherche(String(texte || '').trim());
    if (!q) return [];
    return (liste || [])
      .filter(d => d && normaliserPourRecherche(libelleDossierAffiche(d) + ' ' + (d.nom || '')).includes(q))
      .sort((a, b) => (a.archive ? 1 : 0) - (b.archive ? 1 : 0)
        || String(a.rendezVousSignature || '9999').localeCompare(String(b.rendezVousSignature || '9999'))
        || libelleDossierAffiche(a).localeCompare(libelleDossierAffiche(b)))
      .slice(0, 8)
      .map(d => {
        if (d.rendezVousSignature) {
          return { id: d.id, libelle: libelleDossierAffiche(d), archive: !!d.archive, type: 'rdv', date: d.rendezVousSignature, heure: d.rendezVousSignatureHeure || '' };
        }
        const probable = semaineProbableSignature(d, aujourdhuiIso, absences, evenements);
        if (probable && probable.aConfirmer) return { id: d.id, libelle: libelleDossierAffiche(d), archive: !!d.archive, type: 'aConfirmer', date: probable.date, heure: probable.heure || '' };
        return probable
          ? { id: d.id, libelle: libelleDossierAffiche(d), archive: !!d.archive, type: 'probable', date: probable.date, lundi: probable.lundi }
          : { id: d.id, libelle: libelleDossierAffiche(d), archive: !!d.archive, type: 'aucun', date: '' };
      });
  }

  // Pure : les rendez-vous dont le titre, le lieu ou le dossier contient la recherche (sans accents ni
  // casse) — tous si la recherche est vide. Filtre de l'agenda, comme la recherche du Suivi.
  function evenementsFiltresRecherche(liste, texte) {
    const q = normaliserPourRecherche(String(texte || '').trim());
    if (!q) return liste || [];
    return (liste || []).filter(e => e && normaliserPourRecherche([e.sujet, e.lieu, e.dossierNom].filter(Boolean).join(' ')).includes(q));
  }

  var agendaRecherche = '';
  var agendaRechercheActif = 0;
  var agendaCibleDossier = null;
  function changerRechercheAgenda(valeur) {
    agendaRecherche = valeur;
    agendaRechercheActif = 0;
    renderResultatsRechercheAgenda();
    renderPageAgenda();
  }

  function effacerRechercheAgenda() {
    agendaRecherche = '';
    const champ = document.getElementById('agenda-recherche');
    if (champ) champ.value = '';
    renderResultatsRechercheAgenda();
    renderPageAgenda();
  }

  // L'icône « fiche » d'une ligne de résultat : la fiche du dossier, sans quitter la recherche.
  function ouvrirFicheDepuisRechercheAgenda(id) {
    const bloc = document.getElementById('agenda-recherche-resultats');
    if (bloc) bloc.style.display = 'none';
    ouvrirDossierDepuisDashboard(id);
  }

  function renderResultatsRechercheAgenda() {
    const bloc = document.getElementById('agenda-recherche-resultats');
    if (!bloc) return;
    if (!agendaRecherche.trim()) { bloc.style.display = 'none'; bloc.innerHTML = ''; return; }
    const res = resultatsRechercheAgenda(agendaRecherche, dossiers, isoAujourdhuiLocal(), absencesOffice, agendaEvenements);
    const quand = (r) => r.type === 'rdv' || r.type === 'aConfirmer'
      ? `${r.type === 'aConfirmer' ? 'À confirmer' : 'Signature'} le ${formatDateFr(r.date)}${r.heure ? ' à ' + r.heure.replace(':', ' h ') : ''}`
      : r.type === 'probable' ? `Signature probable semaine du ${formatDateFr(r.lundi)}` : 'Aucun rendez-vous';
    bloc.innerHTML = res.length === 0
      ? '<div class="ag-recherche-vide">Aucun dossier ne correspond.</div>'
      : res.map((r, i) => `<div class="ag-recherche-ligne${i === agendaRechercheActif ? ' actif' : ''}" role="option">
          <button type="button" class="ag-recherche-aller" onmousedown="event.preventDefault()" onclick="allerAuDossierAgenda('${escapeOnclickArg(r.id)}')" title="${escapeAttr(r.type === 'aucun' ? 'Ouvrir la fiche' : 'Aller au rendez-vous dans l’agenda')}">
            <span class="ag-recherche-nom">${escapeHtml(r.libelle)}${r.archive ? ' <span class="ag-recherche-archive">archivé</span>' : ''}</span>
            <span class="ag-recherche-quand">${escapeHtml(quand(r))}</span>
          </button>
          <button type="button" class="ag-recherche-fiche" onmousedown="event.preventDefault()" onclick="ouvrirFicheDepuisRechercheAgenda('${escapeOnclickArg(r.id)}')" title="Ouvrir la fiche du dossier" aria-label="Ouvrir la fiche de ${escapeAttr(r.libelle)}">${icone('file-text')}</button>
        </div>`).join('');
    bloc.style.display = 'block';
  }

  function fermerRechercheAgendaSiHors() {
    const zone = document.querySelector('.ag-recherche');
    const bloc = document.getElementById('agenda-recherche-resultats');
    if (bloc && zone && !zone.contains(document.activeElement)) bloc.style.display = 'none';
  }

  // L'icône « Actualiser » tourne jusqu'à l'agenda relu.
  async function actualiserAgenda(bouton) {
    if (bouton) bouton.classList.add('en-cours');
    await chargerAgendaSemaine();
  }

  function toucheRechercheAgenda(e) {
    const lignes = document.querySelectorAll('#agenda-recherche-resultats .ag-recherche-aller');
    if (e.key === 'Escape') { effacerRechercheAgenda(); return; }
    if (e.key === 'Enter' && !lignes.length) e.preventDefault();
    if (!lignes.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      agendaRechercheActif = (agendaRechercheActif + (e.key === 'ArrowDown' ? 1 : lignes.length - 1)) % lignes.length;
      lignes.forEach((l, i) => l.parentNode.classList.toggle('actif', i === agendaRechercheActif));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      (lignes[agendaRechercheActif] || lignes[0]).click();
    }
  }

  // Un dossier choisi : l'agenda va au jour de sa signature et en ouvre le détail ; sans rendez-vous, à
  // la semaine probable (carte fantôme) ; sans rien à montrer, sa fiche s'ouvre.
  function allerAuDossierAgenda(id) {
    const d = dossiers.find(x => x.id === id);
    agendaRecherche = '';
    const champ = document.getElementById('agenda-recherche');
    if (champ) { champ.value = ''; champ.blur(); }
    renderResultatsRechercheAgenda();
    if (!d) { renderPageAgenda(); return; }
    const r = resultatsRechercheAgenda(d.nom || libelleDossierAffiche(d), [d], isoAujourdhuiLocal(), absencesOffice, agendaEvenements)[0];
    if (!r || r.type === 'aucun') { renderPageAgenda(); ouvrirDossierDepuisDashboard(id); return; }
    if (agendaVue === 'mois' && r.type === 'probable') agendaVue = 'semaine';
    positionnerAgenda(r.date);
    agendaSelection = r.type === 'probable' ? 'probable:' + id : null;
    agendaCibleDossier = r.type === 'rdv' || r.type === 'aConfirmer' ? { id, date: r.date } : null;
    selectionnerCibleDossierAgenda();
    renderPageAgenda();
    chargerAgendaSemaine();
  }

  // Le rendez-vous du dossier cherché, une fois les rendez-vous de sa période lus.
  function selectionnerCibleDossierAgenda() {
    if (!agendaCibleDossier) return;
    const e = evenementsAffichesAgenda().find(x => x.dossierId === agendaCibleDossier.id && x.date === agendaCibleDossier.date);
    if (e) { agendaSelection = cleEvenementAgenda(e); agendaCibleDossier = null; }
  }

  // « Aller à une date » : une icône calendrier à côté de « Aujourd’hui » (étude, 01/10 : la date affichée
  // à côté du bouton faisait doublon) ; le champ date reste caché, son sélecteur s'ouvre au clic.
  function ouvrirAllerDateAgenda() {
    const champ = document.getElementById('agenda-aller');
    if (!champ) return;
    try {
      if (typeof champ.showPicker === 'function') { champ.showPicker(); return; }
    } catch (e) { /* showPicker refusé : repli sur le focus */ }
    champ.focus();
    champ.click();
  }

  // Mot de l'en-tête de l'agenda (étude, 01/10, d'après l'image « Wed. », puis « en français, pas de fond
  // de couleur, juste les 3 lettres et le point ») : le jour en trois lettres — « Jeu » —, ou le mois en
  // vue Mois — « Oct » —, suivi d'un point orange. Pure.
  function motPastilleAgenda(date, vue) {
    const brut = date.toLocaleDateString('fr-FR', vue === 'mois' ? { month: 'long' } : { weekday: 'long' }).slice(0, 3);
    return brut.charAt(0).toUpperCase() + brut.slice(1);
  }

  function renderPageAgenda() {
    const zone = document.getElementById('agenda-contenu');
    if (!zone) return;
    if (!agendaJour) positionnerAgenda(isoAujourdhuiLocal());
    const samedi = addDays(agendaLundi, 5);
    const lu = agendaLu ? new Date(agendaLu).toLocaleString('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' }).replace(':', '\u00a0h\u00a0').replace(/ (\d)/, '\u00a0$1') : '';
    const source = agendaErreur ? `<span class="dot-label dl-alerte"><span class="dot"></span>${escapeHtml(agendaErreur)}</span>`
      : !agendaCharge ? 'Lecture de l’agenda…'
      : agendaSource && !agendaSource.configuree ? 'Connexion à l’agenda Outlook à configurer (Réglages › Agenda et Outlook).'
      : lu ? `Agenda de l’office lu ${escapeHtml(lu)}${agendaHistorique.enCours ? ' · Historique : lecture dans Outlook…' : agendaHistorique.message ? ` · <span class="dot-label dl-alerte"><span class="dot"></span>${escapeHtml(agendaHistorique.message)}</span>` : ''}${renderComparaisonAgenda()}` : 'Agenda pas encore lu par le serveur.';
    // Titre à la manière d'Outlook : la pastille du jour (mois en tête, grand numéro), la date en
    // clair et, dessous, le jour ou la période affichée.
    const ref = agendaVue === 'mois' ? agendaMois + '-01' : agendaJour;
    const dRef = new Date(ref + 'T00:00:00');
    const titre = agendaVue === 'mois'
      ? dRef.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
      : dRef.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    // « Actualiser » (étude, 01/10) : une icône à côté de l'état de lecture, la recherche d'un dossier
    // ayant pris la place du bouton dans l'en-tête de la page.
    const actualiser = `<button type="button" class="ag-actualiser" onclick="actualiserAgenda(this)" title="Actualiser l’agenda" aria-label="Actualiser l’agenda">${icone('rotate-ccw')}</button>`;
    // Recherche en cours (étude, 01/10 : « comme sur la page Suivi ») : l'agenda n'affiche que les
    // rendez-vous qui correspondent ; le nombre trouvé sur la période affichée est dit ici.
    const filtre = agendaRecherche.trim()
      ? (() => {
        const jours = joursAffichesAgenda();
        const n = evenementsFiltresRecherche(evenementsAffichesAgenda(), agendaRecherche).filter(e => jours.indexOf(e.date) !== -1).length;
        return ` · <span class="ag-filtre">${n} rendez-vous pour « ${escapeHtml(agendaRecherche.trim())} » <button type="button" class="lien-bouton" onclick="effacerRechercheAgenda()">Tout afficher</button></span>`;
      })() : '';
    const etat = `${source} ${actualiser}${filtre}`;
    const sous = agendaVue === 'mois' ? etat
      : agendaVue === 'semaine'
        ? `Semaine du ${new Date(agendaLundi + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} au ${new Date(samedi + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} · ${etat}`
        : etat; // Vue Jour : le jour est déjà écrit en grand à gauche (motPastilleAgenda).
    // Une note en cours d'écriture garde le focus et le curseur à travers les rafraîchissements
    // automatiques (agenda relu toutes les 2 minutes, dossiers mis à jour par un autre poste).
    const champNotes = document.activeElement && document.activeElement.id === 'agenda-notes-texte' ? document.activeElement : null;
    const curseurNotes = champNotes ? [champNotes.selectionStart, champNotes.selectionEnd, champNotes.scrollTop] : null;
    zone.innerHTML = `<div class="ag-page">
        <div class="ag-tete-page">
          <div class="ag-pastille-jour" aria-hidden="true">${escapeHtml(motPastilleAgenda(dRef, agendaVue))}<i></i></div>
          <div class="ag-titre-bloc">
            <div class="ag-titre-ligne">
              <h2 class="ag-titre">${escapeHtml(titre.charAt(0).toUpperCase() + titre.slice(1))}</h2>
              <wa-button-group class="ag-nav" label="Se déplacer dans l’agenda">
                <wa-button appearance="outlined" size="s" type="button" class="ag-nav-btn" onclick="naviguerAgenda(-1)" aria-label="Précédent">${icone('chevron-left')}</wa-button>
                <wa-button appearance="outlined" size="s" type="button" class="ag-nav-btn ag-auj" onclick="naviguerAgenda(0)">Aujourd’hui</wa-button>
                <wa-button appearance="outlined" size="s" type="button" class="ag-nav-btn" onclick="naviguerAgenda(1)" aria-label="Suivant">${icone('chevron-right')}</wa-button>
                <span class="ag-aller-zone">
                  <wa-button appearance="outlined" size="s" type="button" class="ag-nav-btn ag-aller-btn" onclick="ouvrirAllerDateAgenda()" aria-label="Aller à une date" title="Aller à une date — l’historique est lu dans Outlook à la première consultation">${icone('calendar')}</wa-button>
                  <input type="date" class="ag-aller" id="agenda-aller" value="${escapeAttr(agendaJour || '')}" min="2000-01-01" onchange="if (this.value) allerAuJourAgenda(this.value)" tabindex="-1" aria-hidden="true">
                </span>
              </wa-button-group>
            </div>
            <span class="ag-sous">${sous}</span>
          </div>
          <label class="ag-vue-choix">
            <select id="agenda-vue" aria-label="Vue de l’agenda" onchange="choisirVueAgenda(this.value)">
              ${VUES_AGENDA.map(v => `<option value="${v}"${agendaVue === v ? ' selected' : ''}>${{ mois: 'Vue mois', semaine: 'Vue semaine', jour: 'Vue jour' }[v]}</option>`).join('')}
            </select></label>
        </div>
        <div class="ag-page-corps">
          <aside class="ag-cote">
            ${renderMoisAgenda()}
            ${renderSondagesSansDossierAgenda()}
            ${renderAnticipationsAgenda()}
          </aside>
          <div class="ag-principal">
            ${agendaVue === 'mois' ? renderVueMoisAgenda() : renderGrilleAgenda()}
          </div>
        </div>
      </div>`;
    renderBoutonsCreationAgenda();
    renderPopoverAgenda();
    if (curseurNotes) {
      const champ = document.getElementById('agenda-notes-texte');
      if (champ) { champ.focus({ preventScroll: true }); champ.setSelectionRange(curseurNotes[0], curseurNotes[1]); champ.scrollTop = curseurNotes[2]; }
    }
    renderModaleAgenda();
  }

  // Bouton double « Nouveau rendez-vous | Proposer des dates » dans l'en-tête de la page, à droite du champ de recherche
  // (étude, 01/10) — seulement quand l'écriture dans Outlook est réglée. Appelé aussi à la fin du chargement des réglages
  // Exchange (chargerReglagesExchange) : la page Agenda dessinée avant leur arrivée (démarrage, rechargement après une mise
  // à jour) gardait les boutons masqués jusqu'au rendu suivant (étude 04/10 : « je ne vois pas le bouton »).
  function renderBoutonsCreationAgenda() {
    const zoneCreation = document.getElementById('agenda-creation');
    if (!zoneCreation) return;
    zoneCreation.innerHTML = exchangeAgendaPret() ? `<div class="ag-ajout-double" role="group" aria-label="Créer un rendez-vous">
          <wa-button variant="brand" class="primary ag-ajout" onclick="ouvrirCreationAgenda()">${icone('plus')} Nouveau rendez-vous</wa-button>
          <wa-button variant="brand" class="primary ag-ajout ag-ajout-dates" onclick="ouvrirSondageSansDossier('', [])" title="Proposer plusieurs dates par email et placer celle qui convient à tous">${icone('users')} Proposer des dates</wa-button>
        </div>` : '';
    zoneCreation.style.display = zoneCreation.innerHTML ? '' : 'none';
  }

  // ---- Détail d'un rendez-vous (panneau de gauche, comme le volet de lecture d'Outlook) ----
  function ouvrirDetailAgenda(cle) {
    if (notesAgendaEdition && notesAgendaEdition !== cle) { notesAgendaEdition = null; notesAgendaBrouillon = ''; }
    // La note peut avoir changé dans Outlook : relue à chaque ouverture.
    if (cle !== agendaSelection && notesAgenda[cle] && notesAgenda[cle].etat !== 'chargement') delete notesAgenda[cle];
    agendaSelection = cle;
    renderPageAgenda();
    const pop = document.getElementById('agenda-popover');
    if (pop && pop.style.display !== 'none' && !pop.classList.contains('feuille') && pop.scrollIntoView) pop.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ---- Détail d'un rendez-vous en fenêtre posée sur l'agenda (étude, 30/09 : « quand on clique sur
  // un rendez-vous, ouvrir le contenu dans un popup dans l'agenda, pas à gauche ») : à droite du
  // rendez-vous cliqué, à gauche s'il manque la place, au milieu de la grille sans rendez-vous
  // repérable ; en feuille au bas de l'écran sur téléphone. ----
  function renderPopoverAgenda() {
    const pop = document.getElementById('agenda-popover');
    if (!pop) return;
    const html = agendaSelection && ongletActuel === 'agenda' ? renderPanneauDetailAgenda() : '';
    if (!html) { pop.style.display = 'none'; pop.innerHTML = ''; return; }
    pop.innerHTML = html;
    pop.style.display = 'block';
    positionnerPopoverAgenda();
  }

  function positionnerPopoverAgenda() {
    const pop = document.getElementById('agenda-popover');
    const panneau = document.getElementById('onglet-agenda');
    if (!pop || !panneau || pop.style.display === 'none') return;
    const telephone = window.innerWidth < 700;
    pop.classList.toggle('feuille', telephone);
    if (telephone) { pop.style.left = ''; pop.style.top = ''; return; }
    const pr = panneau.getBoundingClientRect();
    const largeur = pop.offsetWidth;
    const echappe = (v) => (window.CSS && CSS.escape ? CSS.escape(v) : String(v).replace(/["\\]/g, '\\$&'));
    const ancre = agendaSelection ? document.querySelector(`#agenda-contenu [data-cle="${echappe(agendaSelection)}"]`) : null;
    let left;
    let top;
    if (ancre) {
      const ar = ancre.getBoundingClientRect();
      left = ar.right + 10 + largeur <= pr.right ? ar.right - pr.left + 10 : ar.left - pr.left - 10 - largeur;
      top = ar.top - pr.top - 6;
    } else {
      const zone = document.querySelector('#agenda-contenu .ag-principal') || panneau;
      const zr = zone.getBoundingClientRect();
      left = zr.left - pr.left + (zr.width - largeur) / 2;
      top = zr.top - pr.top + 60;
    }
    pop.style.left = `${Math.round(Math.max(0, Math.min(left, pr.width - largeur)))}px`;
    pop.style.top = `${Math.round(Math.max(0, top))}px`;
  }

  // Ferme la fenêtre de création si elle est ouverte, sinon le détail du rendez-vous.
  function fermerModaleAgenda() {
    if (agendaModale) { agendaModale = null; renderModaleAgenda(); return; }
    if (notesAgendaEdition) { annulerNotesAgenda(); return; }
    if (agendaSelection) { agendaSelection = null; renderPageAgenda(); }
  }

  function renderPanneauDetailAgenda() {
    const e = agendaSelection ? evenementsAffichesAgenda().concat(fantomesAffichesAgenda()).find(x => cleEvenementAgenda(x) === agendaSelection) : null;
    if (!e) return '';
    if (e.fantome) return renderDetailFantomeAgenda(e);
    const auj = isoAujourdhuiLocal();
    const teinte = teinteEvenementAgenda(e, categoriesRdvReglees());
    const d = dossierDeEvenement(e);
    const infos = infosRendezVousDossier(d);
    const duree = dureeRendezVous(e.heure, e.heureFin);
    const jour = e.dateFin && e.dateFin !== e.date ? `Du ${dateAvecJourFr(e.date)} au ${dateAvecJourFr(e.dateFin)}` : dateAvecJourFr(e.date);
    const horaire = e.journeeEntiere || !e.heure ? 'Toute la journée' : `${duree ? duree + ' ' : ''}(${e.heure}${e.heureFin ? ' – ' + e.heureFin : ''})`;
    const proba = probabiliteEvenementAgenda(d, e, auj, absencesOffice);
    const blocProba = proba ? `<div class="ag-detail-proba">
        <div class="ag-detail-proba-tete">${renderPastilleProbabilite(proba)} <b>de chances que le rendez-vous soit maintenu</b> ${infoBulle('Indicatif : 99 % moins les points de ce qui reste à faire avant la date (financement, préemption, pièces, envois, fonds), pondérés par sa proximité. Sans IA.')}</div>
        <ul class="ag-facteurs">${proba.facteurs.map(x => `<li class="${x.ok ? 'ok' : 'ko'}">${icone(x.ok ? 'check' : 'alert-triangle')}<span>${escapeHtml(x.libelle)}${x.ok ? '' : ` <em>−${x.retrait} pts</em>`}</span></li>`).join('')}</ul>
      </div>` : '';
    const relation = d && e.signature && !d.archive && d.rendezVousSignature === e.date && e.date >= auj && !notaireParticipantRepresenteAcquereur(d)
      && relanceFondsDue(d, auj) ? `<div class="ag-detail-actions">${renderLigneEmailDossier(d, 'relanceFonds')}</div>` : '';
    // Un rendez-vous de l'historique (`archive`) se consulte (détail, notes) mais ne se modifie pas.
    const peutSupprimer = evenementSupprimableAgenda(e);
    const notesLisibles = exchangeAgendaPret() && e.itemId && e.archive;
    const ligne = (ic, html) => `<div class="ag-detail-ligne">${icone(ic)}<span>${html}</span></div>`;
    return `<section class="ag-detail ajd-${teinte}" aria-labelledby="agenda-detail-titre">
        <div class="ag-detail-tete">
          <div>
            <div class="ag-detail-etiquette"><i></i>${escapeHtml(e.horsAgenda ? 'Signature fixée dans CLAIRE — pas dans l’agenda Outlook' : e.option ? (sondagesCreneaux.some(x => x.optionsSeules && x.creneaux.some(c => c.option && c.option.itemId === e.itemId)) ? 'Option' : 'Option — sondage de créneaux') : etiquetteEvenementAgenda(e, natureEvenementAgenda(e, categoriesRdvReglees())))}</div>
            <h3 class="ag-detail-titre" id="agenda-detail-titre">${escapeHtml(e.option ? libelleOptionSondage(e.sujet).titre : (e.sujet || '(sans titre)'))}</h3>
          </div>
          <div class="ag-detail-outils">
            ${peutSupprimer && evenementModifiableAgenda(e) ? `<wa-button appearance="plain" size="s" type="button" class="bouton-icone icon-btn" onclick="ouvrirModificationAgenda('${escapeOnclickArg(cleEvenementAgenda(e))}')" aria-label="Modifier le rendez-vous" title="Modifier le titre, la date ou l’horaire${e.heure && !e.journeeEntiere ? ' — ou glisser le rendez-vous dans la grille' : ''}">${icone('pencil')}</wa-button>` : ''}
            ${copieRendezVousAgenda(e) && exchangeAgendaPret() ? `<wa-button appearance="plain" size="s" type="button" class="bouton-icone icon-btn" onclick="copierRendezVousAgenda('${escapeOnclickArg(cleEvenementAgenda(e))}')" aria-label="Copier le rendez-vous" title="Copier (Ctrl+C), puis choisir une case et Coller (Ctrl+V)">${icone('copier')}</wa-button>` : ''}
            ${peutSupprimer ? `<wa-button appearance="plain" size="s" type="button" class="bouton-icone icon-btn ag-supprimer-ico" onclick="supprimerEvenementAgenda('${escapeOnclickArg(cleEvenementAgenda(e))}')" aria-label="Supprimer le rendez-vous" title="Supprimer de l’agenda (après confirmation)">${icone('trash')}</wa-button>` : ''}
            <wa-button appearance="plain" size="s" type="button" class="bouton-icone icon-btn" onclick="fermerModaleAgenda()" aria-label="Fermer le détail">${icone('x')}</wa-button>
          </div>
        </div>
        ${ligne('calendar', escapeHtml(jour.charAt(0).toUpperCase() + jour.slice(1)))}
        ${ligne('clock', escapeHtml(horaire))}
        ${/* Rendez-vous relié à un dossier de CLAIRE : pas de ligne « lieu » (étude, 01/10) — le Lieu Outlook n'y porte que les initiales et la note d'envoi, déjà dits par le responsable et les états. */ ''}
        ${e.lieu && !d ? ligne('map-pin', escapeHtml(e.lieu)) : ''}
        ${infos && infos.responsable ? ligne('user', `Responsable : <b>${escapeHtml(infos.responsable)}</b>`) : ''}
        ${infos && infos.confrere ? ligne('users', `Confrère : <b>${escapeHtml(infos.confrere)}</b>`) : ''}
        ${infos && !e.option ? `<div class="ag-detail-etats">${renderEtatsRendezVous(infos)}</div>` : ''}
        ${e.option ? renderOptionSondageAgenda(e) : ''}
        ${peutSupprimer && !e.option ? renderVisioRendezVous(e) : ''}
        ${d ? `<wa-button ${e.option ? 'appearance="plain"' : 'variant="brand"'} class="${e.option ? 'lien-bouton' : 'primary'} ag-ouvrir-fiche" onclick="ouvrirDossierDepuisDashboard('${d.id}')">${icone('folder')} Ouvrir la fiche</wa-button>` : ''}
        ${(peutSupprimer || notesLisibles) && !e.option ? renderNotesRendezVous(e, !peutSupprimer) : ''}
        ${blocProba}
        ${relation}
        ${!d && e.dossierNom ? `<p class="jour-vide">Dossier « ${escapeHtml(e.dossierNom)} » archivé ou introuvable dans CLAIRE.</p>` : ''}
      </section>`;
  }

  // Détail d'une carte fantôme : pourquoi cette semaine, ce qui reste à lever, et le geste pour placer.
  // Pure : le rappel de la date butoir dans la fenêtre d'une signature probable (étude, 02/10 : « bien
  // rappeler la date butoir dans le pop-up »). niveau : 'ok' (le créneau proposé tient avant), 'proche'
  // (moins de 7 jours de marge), 'depasse' (créneau ou semaine probable au-delà), 'inconnue' (pas de date).
  function rappelButoirSignatureProbable(d, p, creneau, aujourdhuiIso) {
    if (!d || !d.acte) return { niveau: 'inconnue', html: 'Date butoir non renseignée sur la fiche' };
    const auj = aujourdhuiIso || isoAujourdhuiLocal();
    const reference = (creneau && creneau.date) || (p && p.date) || auj;
    const restants = ecartJours(auj, d.acte);
    const marge = ecartJours(reference, d.acte);
    const quand = restants < 0 ? `dépassée depuis ${-restants} jour${-restants > 1 ? 's' : ''}` : restants === 0 ? 'aujourd’hui' : `dans ${restants} jour${restants > 1 ? 's' : ''}`;
    const base = `Date butoir : <b>${escapeHtml(dateAvecJourFr(d.acte))}</b> (${quand})`;
    if (marge < 0) return { niveau: 'depasse', html: `${base} — ${creneau ? 'ce créneau la dépasse' : 'la semaine probable la dépasse'} : prévoir la prorogation` };
    if (marge < 7) return { niveau: 'proche', html: `${base} — ${marge} jour${marge > 1 ? 's' : ''} de marge seulement` };
    return { niveau: 'ok', html: base };
  }

  function renderDetailFantomeAgenda(e) {
    const d = dossierDeEvenement(e);
    const p = e.probable;
    if (!d || !p) return '';
    const auj = isoAujourdhuiLocal();
    const infos = infosRendezVousDossier(d);
    const ecrire = exchangeAgendaPret();
    const autres = creneauxProposesSignature(d, evenementsAffichesAgenda(), absencesOffice, auj, 4, { depuis: p.date, limite: addDays(p.lundi, 5) })
      .filter(c => !e.creneau || c.date !== e.creneau.date || c.heure !== e.creneau.heure).slice(0, 3);
    const libelleCreneau = (c) => `${new Date(c.date + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', '')} ${c.heure.replace(':', ' h ')}`;
    const ligne = (ic, html) => `<div class="ag-detail-ligne">${icone(ic)}<span>${html}</span></div>`;
    const semaine = new Date(p.lundi + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
    const butoir = rappelButoirSignatureProbable(d, p, e.creneau, auj);
    return `<section class="ag-detail ag-detail-fantome ajd-signature" aria-labelledby="agenda-detail-titre">
        <div class="ag-detail-tete">
          <div>
            <div class="ag-detail-etiquette"><i></i>Signature probable — pas encore placée</div>
            <h3 class="ag-detail-titre" id="agenda-detail-titre">${escapeHtml(e.sujet)}</h3>
          </div>
          <wa-button appearance="plain" size="s" type="button" class="bouton-icone icon-btn" onclick="fermerModaleAgenda()" aria-label="Fermer le détail">${icone('x')}</wa-button>
        </div>
        <div class="ag-detail-proba">
          <div class="ag-detail-proba-tete">${renderPastilleProbabilite(p)} <b>Il est probable que ce rendez-vous se tienne la semaine du ${escapeHtml(semaine)}</b></div>
          <p class="ag-detail-raison">Au plus tôt le ${escapeHtml(dateAvecJourFr(p.date))} : ${escapeHtml(p.raison)}.</p>
          <div class="ag-detail-butoir ${butoir.niveau}">${icone(butoir.niveau === 'ok' ? 'calendar' : 'alert-triangle')}<span>${butoir.html}</span></div>
          <ul class="ag-facteurs">${p.facteurs.map(x => `<li class="${x.ok ? 'ok' : 'ko'}">${icone(x.ok ? 'check' : 'alert-triangle')}<span>${escapeHtml(x.libelle)}${x.ok ? '' : ` <em>−${x.retrait} pts</em>`}</span></li>`).join('')}</ul>
        </div>
        ${infos && infos.responsable ? ligne('user', `Responsable : <b>${escapeHtml(infos.responsable)}</b>`) : ''}
        ${infos && infos.confrere ? ligne('users', `Confrère : <b>${escapeHtml(infos.confrere)}</b>`) : ''}
        ${e.creneau ? `<wa-button variant="brand" class="primary ag-ouvrir-fiche" onclick="placerCreneauSignature('${d.id}', '${e.creneau.date}', '${e.creneau.heure}')" ${ecrire ? '' : 'disabled title="Connexion à l’agenda Outlook à activer dans les Réglages"'}>${icone('calendar')} Placer le ${escapeHtml(libelleCreneau(e.creneau))}</wa-button>`
          : '<p class="jour-vide">Aucun créneau libre cette semaine dans les règles de l’office.</p>'}
        ${autres.length ? `<div class="ag-creneaux">${autres.map(c => `<wa-button appearance="outlined" size="s" pill type="button" class="action-rapide ag-creneau${c.exceptionnel ? ' exceptionnel' : ''}${d.acte && c.date > d.acte ? ' apres-butoir' : ''}" onclick="placerCreneauSignature('${d.id}', '${c.date}', '${c.heure}')" ${ecrire ? '' : 'disabled'}
            title="${escapeAttr([c.exceptionnel ? 'Créneau exceptionnel : ' + c.exceptionnel : '', d.acte && c.date > d.acte ? `Après la date butoir du ${formatDateFr(d.acte)}` : ''].filter(Boolean).join(' · ') || 'Placer le rendez-vous de signature à ce créneau')}">${c.exceptionnel ? icone('alert-triangle') : ''}${escapeHtml(libelleCreneau(c))}</wa-button>`).join('')}</div>` : ''}
        ${sondageOuvertDossier(d.id) ? '<p class="jour-vide">Sondage de créneaux en cours : réponses sur la fiche.</p>'
          : `<button type="button" class="lien-bouton" onclick="ouvrirSondageCreneaux('${d.id}', ${escapeAttr(JSON.stringify((e.creneau ? [e.creneau] : []).concat(autres).map(c => ({ date: c.date, heure: c.heure, exceptionnel: c.exceptionnel || '' }))))})">${icone('users')} Proposer ces créneaux aux parties</button>`}
        <button type="button" class="lien-bouton" onclick="ouvrirDossierDepuisDashboard('${d.id}')">${icone('folder')} Ouvrir la fiche</button>
      </section>`;
  }

  // Depuis « Rendez-vous à placer » : la semaine probable s'affiche, carte fantôme ouverte.
  function allerSemaineProbableAgenda(id) {
    const d = dossiers.find(x => x.id === id);
    const p = semaineProbableSignature(d, isoAujourdhuiLocal(), absencesOffice, agendaEvenements);
    if (!p) return;
    if (agendaVue === 'mois') agendaVue = 'semaine';
    positionnerAgenda(p.date);
    // En attente de confirmation : le vrai rendez-vous « ?? » est ouvert, pas une carte fantôme.
    agendaSelection = p.aConfirmer ? cleEvenementAgenda(p.aConfirmer) : 'probable:' + id;
    renderPageAgenda();
    chargerAgendaSemaine();
  }

  // ---- Visio ADNOV (étude, 01/10) ----
  // « Le lien pour créer un rendez-vous visio … le site de la profession nous sort un .ics à ajouter
  // dans notre agenda ». Après la création d'un rendez-vous en visio, « Créer la visio » ouvre le site
  // ADNOV ; l'invitation .ics qu'il rend, déposée sur l'agenda (ou choisie dans le détail du rendez-vous),
  // n'est PAS ajoutée comme un second rendez-vous : CLAIRE en lit le lien et l'écrit dans les notes (le
  // corps dans Outlook) du rendez-vous existant de même date et même heure — jamais de doublon. Le
  // fichier est lu dans le navigateur ; seul le texte ajouté aux notes part vers l'agenda.
  var URL_VISIO_ADNOV = 'https://ls.visio.adnov.fr/';
  var ENTETE_NOTES_VISIO = 'Visio ADNOV :';

  function ouvrirSiteVisio() {
    window.open(URL_VISIO_ADNOV, '_blank', 'noopener');
  }

  // Pure : un rendez-vous en visio — catégorie « visio » réglée, ou signature d'un dossier en visio.
  function estVisioAgenda(e, categoriesRdv, d) {
    if (!e) return false;
    if (typeEvenementAgenda(e, categoriesRdv) === 'visio') return true;
    return !!(d && e.signature && d.rendezVousType === 'visio' && !typeEvenementAgenda(e, categoriesRdv));
  }

  // Pure : lit une invitation .ics (RFC 5545) — lignes repliées dépliées, échappements défaits.
  // Rend { lien, date, heure, heureFin, resume, details } ou null sans événement. Le lien est le premier
  // https:// trouvé dans URL, puis LOCATION, puis DESCRIPTION (jamais deviné). Les heures sont celles de
  // Paris : « …Z » (UTC) converti, TZID ou heure flottante pris tels quels.
  function lireInvitationIcs(texte) {
    const brut = String(texte || '').replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
    const debutEvt = brut.search(/^BEGIN:VEVENT$/m);
    if (debutEvt === -1) return null;
    const bloc = brut.slice(debutEvt, (brut.indexOf('END:VEVENT', debutEvt) + 1 || brut.length + 1) - 1);
    const props = {};
    for (const ligne of bloc.split('\n')) {
      const m = /^([A-Z-]+)((?:;[^:]*)?):(.*)$/.exec(ligne);
      if (m && props[m[1]] === undefined) props[m[1]] = { params: m[2], valeur: m[3] };
    }
    const texteIcs = (v) => String(v || '').replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1').trim();
    const heureParis = (p) => {
      if (!p) return null;
      const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})\d{0,2}(Z?))?$/.exec(p.valeur.trim());
      if (!m) return null;
      if (!m[4]) return { date: `${m[1]}-${m[2]}-${m[3]}`, heure: '' };
      if (m[6] === 'Z') {
        const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
        const parts = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
          .formatToParts(dt).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
        return { date: `${parts.year}-${parts.month}-${parts.day}`, heure: `${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}` };
      }
      return { date: `${m[1]}-${m[2]}-${m[3]}`, heure: `${m[4]}:${m[5]}` };
    };
    const premierLien = (t) => { const m = /https:\/\/[^\s<>"')\]]+/i.exec(String(t || '')); return m ? m[0].replace(/[.,;]+$/, '') : ''; };
    const description = texteIcs(props.DESCRIPTION && props.DESCRIPTION.valeur);
    const lien = premierLien(props.URL && props.URL.valeur) || premierLien(texteIcs(props.LOCATION && props.LOCATION.valeur)) || premierLien(description);
    const debut = heureParis(props.DTSTART);
    const fin = heureParis(props.DTEND);
    // Informations de connexion (code de la réunion, numéro d'appel…) : les lignes non vides de la
    // description, sans le lien déjà repris, 25 lignes et 2 000 caractères au plus.
    // Une ligne qui ne fait qu'annoncer le lien (« Rejoindre la réunion : » ou « Rejoindre : https://… »)
    // est retirée : le lien est déjà en tête du bloc.
    const lignes = description.split('\n').map(l => l.trim());
    const details = lignes.map((l, i) => {
      const sansLien = lien ? l.split(lien).join('').replace(/[\s.,;]+$/, '').trim() : l;
      if (lien && l.indexOf(lien) !== -1 && (!sansLien || /:$/.test(sansLien))) return '';
      if (/:$/.test(l) && l.length <= 60 && lien && (lignes[i + 1] || '').indexOf(lien) === 0) return '';
      return l;
    }).filter(l => l && !/^[-_=*~]{3,}$/.test(l)).slice(0, 25).join('\n').slice(0, 2000);
    return {
      lien, details,
      resume: texteIcs(props.SUMMARY && props.SUMMARY.valeur).slice(0, 200),
      date: debut ? debut.date : '', heure: debut ? debut.heure : '',
      heureFin: fin && debut && fin.date === debut.date ? fin.heure : ''
    };
  }

  // Pure : le lien de visio écrit par CLAIRE dans les notes (ligne « Visio ADNOV : https://… »).
  function lienVisioDansNotes(notes) {
    const m = new RegExp(ENTETE_NOTES_VISIO.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*(https://\\S+)').exec(String(notes || ''));
    return m ? m[1] : '';
  }

  // Pure : le bloc de la visio des notes — le lien et les informations de connexion qui le suivent
  // (jusqu'à la ligne vide). Rend { lien, details } ou null.
  function blocVisioDansNotes(notes) {
    const t = String(notes || '').replace(/\r\n/g, '\n');
    const i = t.indexOf(ENTETE_NOTES_VISIO);
    const lien = lienVisioDansNotes(t);
    if (i === -1 || !lien) return null;
    const fin = t.indexOf('\n\n', i);
    const lignes = t.slice(i, fin === -1 ? t.length : fin).split('\n').slice(1).map(l => l.trim()).filter(Boolean);
    return { lien, details: lignes.join('\n') };
  }

  // Pur : l'email qui envoie le lien de la visio — premier jet de CLAIRE (étude, 01/10 : « ça peut être
  // les deux », clients et confrère), à remplacer par le texte de l'étude. Le bouton porte le lien ; les
  // informations de connexion de la note suivent. La formule du confrère est posée par adapterCorpsEmail.
  function corpsEmailVisio({ confrere, signature, quand, dossier, details }) {
    const objet = signature ? `rendez-vous de signature${dossier ? ' de la vente ' + dossier : ''}` : `rendez-vous${dossier ? ' (' + dossier + ')' : ''}`;
    const infos = details ? `Informations de connexion :\n${details}` : '';
    if (confrere) {
      return [
        `Le ${objet} du ${quand} se tiendra en visioconférence. Vous trouverez ci-dessous le lien pour rejoindre la réunion.`,
        '{{BOUTONS}}',
        infos
      ].filter(Boolean).join('\n\n');
    }
    return [
      'Bonjour,',
      `Votre ${objet} du ${quand} se tiendra en visioconférence.`,
      `Quelques minutes avant l’heure, cliquez sur le bouton ci-dessous pour rejoindre la réunion depuis un ordinateur, une tablette ou un téléphone équipé d’une caméra et d’un micro.${signature ? ' Merci de vous munir de votre pièce d’identité.' : ''}`,
      '{{BOUTONS}}',
      infos
    ].filter(Boolean).join('\n\n');
  }

  // Pure : les destinataires proposés — ceux du dossier (clients, ou le confrère qui représente une
  // partie), plus une ligne « confrère » libre, décochée, s'il n'y en a pas ; sans dossier, un client et
  // un confrère libres.
  function destinatairesVisio(d, carnet) {
    const base = d ? participantsSondage(d, carnet).map(p => Object.assign({}, p, { coche: true }))
      : [{ role: 'autre', nom: '', email: '', confrere: false, coche: true }];
    if (!base.some(p => p.confrere)) base.push({ role: 'confrere-libre', nom: '', email: '', confrere: true, coche: false });
    return base;
  }

  // Pure : les notes avec le bloc de la visio — remplacé s'il y en avait déjà un (nouvelle invitation),
  // ajouté à la fin sinon ; le reste des notes est gardé tel quel.
  function notesAvecVisio(notes, invitation) {
    const bloc = [`${ENTETE_NOTES_VISIO} ${invitation.lien}`].concat(invitation.details ? [invitation.details] : []).join('\n');
    const avant = String(notes || '').replace(/\r\n/g, '\n');
    const i = avant.indexOf(ENTETE_NOTES_VISIO);
    if (i !== -1) {
      const fin = avant.indexOf('\n\n', i);
      return (avant.slice(0, i) + bloc + (fin === -1 ? '' : avant.slice(fin))).trim();
    }
    return (avant.trim() ? avant.trim() + '\n\n' : '') + bloc;
  }

  // Pure : le(s) rendez-vous de l'agenda à la date et à l'heure de l'invitation (options et
  // signatures hors agenda écartées : on ne peut écrire que dans un rendez-vous d'Outlook).
  function rendezVousPourInvitation(evenements, invitation) {
    if (!invitation || !invitation.date || !invitation.heure) return [];
    return (evenements || []).filter(e => e && e.itemId && !e.option && !e.horsAgenda && !e.fantome && !e.journeeEntiere
      && e.date === invitation.date && e.heure === invitation.heure);
  }

  function renderVisioRendezVous(e) {
    const d = dossierDeEvenement(e);
    const n = notesAgenda[e.itemId];
    const lien = n && n.etat === 'ok' ? lienVisioDansNotes(n.notes) : '';
    if (!lien && !estVisioAgenda(e, categoriesRdvReglees(), d)) return '';
    const cle = escapeOnclickArg(cleEvenementAgenda(e));
    const choisir = `<label class="lien-bouton ag-visio-ics" title="Choisir l’invitation .ics rendue par le site ADNOV — ou la déposer sur l’agenda">${icone('upload')} ${lien ? 'Remplacer l’invitation (.ics)' : 'Ajouter l’invitation (.ics)'}<input type="file" accept=".ics,text/calendar" hidden onchange="choisirIcsRendezVous('${cle}', this)"></label>`;
    return `<div class="ag-visio">
        ${lien ? `<a class="primary ag-visio-rejoindre" href="${escapeAttr(lien)}" target="_blank" rel="noopener">${icone('video')} Rejoindre la visio</a>
          <wa-button appearance="outlined" class="secondary ag-visio-creer" onclick="ouvrirEnvoiVisio('${cle}')" title="Préparer l’email aux clients et/ou au confrère, avec le lien et les informations de connexion">${icone('mail')} Envoyer le lien</wa-button>`
          : `<wa-button appearance="outlined" class="secondary ag-visio-creer" onclick="ouvrirSiteVisio()" title="Ouvrir le site de visio de la profession (ADNOV)">${icone('video')} Créer la visio</wa-button>`}
        ${choisir}
      </div>`;
  }

  async function choisirIcsRendezVous(cle, input) {
    const f = input && input.files && input.files[0];
    if (input) input.value = '';
    if (!f) return;
    const e = evenementsAffichesAgenda().find(x => cleEvenementAgenda(x) === cle);
    const invitation = lireInvitationIcs(await f.text());
    if (!invitation || !invitation.lien) { afficherToast('Aucun lien de visio trouvé dans ce fichier .ics.', 'OK', null); return; }
    noterVerificationPoste('visio-ics');
    if (!e) return;
    const ecart = invitation.date && (invitation.date !== e.date || (invitation.heure && invitation.heure !== e.heure));
    const ajouter = () => ajouterVisioAuRendezVous(e, invitation);
    if (ecart) demanderConfirmation(`L’invitation est prévue le ${formatDateFr(invitation.date)}${invitation.heure ? ' à ' + invitation.heure.replace(':', ' h ') : ''}, pas à l’heure de ce rendez-vous. Ajouter quand même son lien à « ${e.sujet} » ?`, ajouter, { bouton: 'Ajouter le lien', ton: 'valider' });
    else ajouter();
  }

  function survolDepotIcsAgenda(evt) {
    if (!evt.dataTransfer || Array.from(evt.dataTransfer.types || []).indexOf('Files') === -1) return;
    evt.preventDefault();
    const p = document.getElementById('onglet-agenda');
    if (p) p.classList.add('ag-depot-ics');
  }
  function quitteDepotIcsAgenda(evt) {
    const p = document.getElementById('onglet-agenda');
    if (p && (!evt.relatedTarget || !p.contains(evt.relatedTarget))) p.classList.remove('ag-depot-ics');
  }

  // Une invitation déposée sur l'agenda : ajoutée au rendez-vous ouvert si on la pose sur son détail,
  // sinon au rendez-vous de même date et même heure (confirmé). Jamais créée à part.
  async function deposerIcsAgenda(evt) {
    const fichiers = Array.from((evt.dataTransfer && evt.dataTransfer.files) || []);
    const f = fichiers.find(x => /\.ics$/i.test(x.name) || x.type === 'text/calendar');
    const p = document.getElementById('onglet-agenda');
    if (p) p.classList.remove('ag-depot-ics');
    if (!fichiers.length) return;
    evt.preventDefault();
    if (!f) { afficherToast('Déposez ici l’invitation de visio (.ics) rendue par le site ADNOV.', 'OK', null); return; }
    if (!exchangeAgendaPret()) { afficherToast('Connexion à l’agenda Outlook à activer dans les Réglages.', 'OK', null); return; }
    const invitation = lireInvitationIcs(await f.text());
    if (!invitation || !invitation.lien) { afficherToast('Aucun lien de visio trouvé dans ce fichier .ics.', 'OK', null); return; }
    noterVerificationPoste('visio-ics');
    const pop = document.getElementById('agenda-popover');
    if (agendaSelection && pop && pop.contains(evt.target)) {
      const e = evenementsAffichesAgenda().find(x => cleEvenementAgenda(x) === agendaSelection);
      if (e && e.itemId && !e.option && !e.horsAgenda) { ajouterVisioAuRendezVous(e, invitation); return; }
    }
    const cibles = rendezVousPourInvitation(evenementsAffichesAgenda(), invitation);
    const quand = invitation.date ? `le ${formatDateFr(invitation.date)}${invitation.heure ? ' à ' + invitation.heure.replace(':', ' h ') : ''}` : 'à une date illisible';
    if (cibles.length !== 1) {
      afficherToast(cibles.length
        ? `Plusieurs rendez-vous ${quand} : ouvrez le bon puis déposez l’invitation sur son détail.`
        : `Aucun rendez-vous de l’agenda ${quand}. Créez-le d’abord, ou ouvrez le rendez-vous et déposez l’invitation sur son détail.`, 'OK', null);
      if (invitation.date) { positionnerAgenda(invitation.date); renderPageAgenda(); chargerAgendaSemaine(); }
      return;
    }
    const e = cibles[0];
    demanderConfirmation(`Ajouter le lien de la visio au rendez-vous « ${e.sujet} » ${quand} ? Il sera écrit dans ses notes, lisibles aussi dans Outlook.`,
      () => ajouterVisioAuRendezVous(e, invitation), { bouton: 'Ajouter le lien', ton: 'valider' });
  }

  // Relit les notes du rendez-vous (pour ne rien écraser), y ajoute le bloc de la visio et les
  // réécrit dans Outlook. Un seul essai, comme toute écriture EWS.
  async function ajouterVisioAuRendezVous(e, invitation) {
    try {
      const lu = await (await fetchAvecAuth(`/api/exchange/evenement/notes?itemId=${encodeURIComponent(e.itemId)}`)).json();
      if (!lu.ok) { afficherToast(lu.message || 'Les notes du rendez-vous n’ont pas pu être lues : lien non ajouté.', 'OK', null); return; }
      const notes = notesAvecVisio(lu.notes || '', invitation);
      const r = await fetchAvecAuth('/api/exchange/evenement/notes', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: e.itemId, changeKey: lu.changeKey || e.changeKey || '', notes })
      });
      const corps = await r.json();
      if (!corps.ok) { afficherToast(corps.message || 'Le lien de la visio n’a pas été ajouté.', 'OK', null); return; }
      notesAgenda[e.itemId] = { etat: 'ok', notes, changeKey: corps.changeKey || '' };
      const brut = agendaEvenements.find(x => x.itemId === e.itemId);
      if (brut && corps.changeKey) brut.changeKey = corps.changeKey;
      const d = dossierDeEvenement(e);
      if (d) { ajouterHistorique(d, `Lien de la visio ajouté au rendez-vous du ${formatDateFr(e.date)} (notes du rendez-vous dans l’agenda).`); sauvegarder(d); }
      const cleEvt = cleEvenementAgenda(e);
      afficherToast('Lien de la visio ajouté au rendez-vous.', 'Envoyer le lien', () => ouvrirEnvoiVisio(cleEvt));
      agendaSelection = cleEvt;
      renderPageAgenda();
    } catch (err) {
      afficherToast('Serveur injoignable — lien de la visio non ajouté.', 'OK', null);
    }
  }

  // Envoi du lien (étude, 01/10) : les informations de connexion sont RELUES dans la note du rendez-vous
  // au moment d'ouvrir la fenêtre (une note retouchée dans Outlook est prise telle quelle).
  async function ouvrirEnvoiVisio(cle) {
    const e = evenementsAffichesAgenda().find(x => cleEvenementAgenda(x) === cle);
    if (!e || !e.itemId) return;
    let notes = '';
    try {
      const lu = await (await fetchAvecAuth(`/api/exchange/evenement/notes?itemId=${encodeURIComponent(e.itemId)}`)).json();
      if (!lu.ok) { afficherToast(lu.message || 'Les notes du rendez-vous n’ont pas pu être lues.', 'OK', null); return; }
      notes = lu.notes || '';
      notesAgenda[e.itemId] = { etat: 'ok', notes, changeKey: lu.changeKey || '' };
    } catch (err) { afficherToast('Serveur injoignable — notes du rendez-vous non lues.', 'OK', null); return; }
    const bloc = blocVisioDansNotes(notes);
    if (!bloc) { afficherToast('Aucun lien de visio dans les notes de ce rendez-vous : ajoutez d’abord l’invitation (.ics).', 'OK', null); return; }
    const d = dossierDeEvenement(e);
    agendaSelection = null;
    renderPageAgenda();
    agendaModale = { type: 'envoiVisio', cle, bloc, dossierId: d ? d.id : '', participants: destinatairesVisio(d, typeof carnetConfreres !== 'undefined' ? carnetConfreres : []) };
    const contenu = document.getElementById('agenda-modale-contenu');
    if (contenu) contenu.innerHTML = '';
    renderModaleAgenda();
  }

  function renderEnvoiVisio(m) {
    const e = evenementsAffichesAgenda().find(x => cleEvenementAgenda(x) === m.cle);
    if (!e) return '';
    const libelleRole = (p) => p.role === 'confrere-libre' ? 'Confrère' : p.role === 'autre' ? 'Client' : (LIBELLES_ROLE_SONDAGE[p.role] || '');
    return `<header class="ag-modale-tete" id="agenda-visio-envoi">
        <div><h2 class="ag-modale-titre" id="agenda-modale-titre">Envoyer le lien de la visio</h2>
        <div class="ag-modale-quand">${escapeHtml(e.sujet || '')} · ${escapeHtml(libelleCreneauSondage({ date: e.date, heure: e.heure }))} ${infoBulle('Les clients reçoivent un email ensemble, chaque confrère le sien (formule d’usage). L’email porte un bouton vers la visio et les informations de connexion de la note du rendez-vous. Texte : premier jet de CLAIRE.')}</div></div>
        <wa-button appearance="plain" size="s" type="button" class="bouton-icone icon-btn ag-modale-x" onclick="fermerModaleAgenda()" aria-label="Fermer">${icone('x')}</wa-button>
      </header>
      <form class="ag-modale-corps ag-form" onsubmit="event.preventDefault(); preparerEmailsVisio();">
        <div class="sondage-bloc">
          <div class="sondage-bloc-titre">Destinataires</div>
          <ul class="sondage-participants">${m.participants.map((p, i) => `<li>
            <label class="sondage-case"><input type="checkbox" id="visio-dest-${i}" ${p.coche ? 'checked' : ''} onchange="agendaModale.participants[${i}].coche = this.checked">
              <span><b>${escapeHtml(libelleRole(p))}</b>${p.nom ? ' · ' + escapeHtml(p.nom) : ''}</span></label>
            <input type="email" class="sondage-email" id="visio-email-${i}" value="${escapeAttr(p.email)}" placeholder="Adresse email" oninput="agendaModale.participants[${i}].email = this.value.trim(); if (this.value.trim()) { agendaModale.participants[${i}].coche = true; document.getElementById('visio-dest-${i}').checked = true; }" aria-label="Email — ${escapeAttr(libelleRole(p))}">
          </li>`).join('')}</ul>
        </div>
        <div class="sondage-bloc">
          <div class="sondage-bloc-titre">Informations de connexion</div>
          <div class="ag-notes-texte">${escapeHtml([m.bloc.lien].concat(m.bloc.details ? [m.bloc.details] : []).join('\n'))}</div>
        </div>
        <footer class="ag-modale-pied ag-modale-pied-form">
          <span class="jour-espace"></span>
          <wa-button appearance="outlined" class="secondary" onclick="fermerModaleAgenda()">Annuler</wa-button>
          <wa-button variant="brand" type="submit" class="primary" id="visio-envoi-ok">${icone('mail')} Préparer les emails</wa-button>
        </footer>
      </form>`;
  }

  async function preparerEmailsVisio() {
    const m = agendaModale;
    if (!m || m.type !== 'envoiVisio') return;
    const e = evenementsAffichesAgenda().find(x => cleEvenementAgenda(x) === m.cle);
    if (!e) return;
    const d = m.dossierId ? dossiers.find(x => x.id === m.dossierId) : null;
    const retenus = m.participants.filter(p => p.coche);
    if (!retenus.length) { afficherToast('Cochez au moins un destinataire.', 'OK', null); return; }
    const invalide = retenus.find(p => !adressesEmailValides(p.email));
    if (invalide) { afficherToast('Adresse email manquante ou invalide pour un destinataire coché.', 'OK', null); return; }
    const bouton = document.getElementById('visio-envoi-ok');
    if (bouton) bouton.disabled = true;
    const quand = libelleCreneauSondage({ date: e.date, heure: e.heure });
    const signature = !!e.signature;
    const sujet = `Rendez-vous en visioconférence du ${new Date(e.date + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}${d ? ' — ' + libelleDossierAffiche(d) : ''}`;
    let dernier = null;
    for (const g of groupesEmailSondage(retenus)) {
      dernier = await livrerEmailDossier({ dossierId: d ? d.id : '',
        destinataire: g.participants.map(p => p.email).join(', '),
        sujet,
        corps: emailDepuisModele('visio', d, null, contexteVisio({ confrere: g.confrere, signature, quand, dossier: d ? libelleDossierAffiche(d) : '', details: m.bloc.details })).corps,
        confrere: g.confrere,
        boutons: [{ libelle: 'Rejoindre la visioconférence', href: m.bloc.lien }],
        responsableSignature: d ? d.responsable : ''
      });
      if (!dernier.ok) { if (bouton) bouton.disabled = false; if (!dernier.annule) afficherToast(dernier.message || 'L’email n’a pas pu être préparé.', 'OK', null); return; }
    }
    if (d) {
      // Une adresse saisie ici pour le vendeur ou l'acquéreur est gardée sur la fiche (comme le sondage).
      for (const p of retenus) {
        if (p.role === 'vendeur' && p.email !== (d.emailVendeur || '')) { d.emailVendeur = p.email; ajouterHistorique(d, `Email du vendeur : ${p.email}`); }
        if (p.role === 'acquereur' && p.email !== (d.emailAcquereur || '')) { d.emailAcquereur = p.email; ajouterHistorique(d, `Email de l’acquéreur : ${p.email}`); }
      }
      ajouterHistorique(d, `Lien de la visio du ${formatDateFr(e.date)} : email préparé (${groupesEmailSondage(retenus).map(g => g.confrere ? 'confrère' : 'clients').join(', ')}).`);
      sauvegarder(d);
    }
    agendaModale = null;
    renderModaleAgenda();
    annoncerEmailPret(dernier, true, '');
  }

  // ---- Notes du rendez-vous (corps du rendez-vous dans Outlook, choix de l'étude du 30/09) ----
  function renderNotesRendezVous(e, lectureSeule) {
    const n = notesAgenda[e.itemId];
    if (!n) chargerNotesAgenda(e.itemId);
    const edition = !lectureSeule && notesAgendaEdition === e.itemId;
    const aide = infoBulle('La note est écrite dans le rendez-vous de l’agenda partagé : elle se lit aussi dans Outlook, et une note tapée dans Outlook s’affiche ici. Enregistrée en texte simple.');
    let corps;
    if (edition) {
      corps = `<textarea id="agenda-notes-texte" class="ag-notes-champ" rows="5" maxlength="8000" oninput="notesAgendaBrouillon = this.value" aria-label="Notes du rendez-vous">${escapeHtml(notesAgendaBrouillon)}</textarea>`;
    } else if (!n || n.etat === 'chargement') {
      corps = '<p class="jour-vide">Lecture des notes…</p>';
    } else if (n.etat === 'erreur') {
      corps = `<p class="jour-vide">${escapeHtml(n.message || 'Notes illisibles.')}</p>`;
    } else {
      corps = n.notes ? `<div class="ag-notes-texte">${escapeHtml(n.notes)}</div>` : '<p class="jour-vide">Aucune note.</p>';
    }
    const cle = escapeOnclickArg(e.itemId);
    const boutons = edition
      ? `<wa-button appearance="plain" size="s" type="button" class="bouton-icone icon-btn" id="agenda-notes-ok" onclick="enregistrerNotesAgenda('${cle}')" aria-label="Enregistrer la note" title="Enregistrer dans le rendez-vous">${icone('check')}</wa-button>
         <wa-button appearance="plain" size="s" type="button" class="bouton-icone icon-btn" onclick="annulerNotesAgenda()" aria-label="Annuler" title="Annuler">${icone('x')}</wa-button>`
      : (n && n.etat === 'ok' && !lectureSeule ? `<wa-button appearance="plain" size="s" type="button" class="bouton-icone icon-btn" onclick="modifierNotesAgenda('${cle}')" aria-label="Modifier la note" title="Modifier la note">${icone('pencil')}</wa-button>` : '');
    return `<div class="ag-notes">
        <div class="ag-notes-tete"><span class="ag-notes-titre">Notes</span> ${aide}<span class="jour-espace"></span>${boutons}</div>
        ${corps}
      </div>`;
  }

  async function chargerNotesAgenda(itemId) {
    if (!itemId || (notesAgenda[itemId] && notesAgenda[itemId].etat === 'chargement')) return;
    notesAgenda[itemId] = { etat: 'chargement' };
    try {
      const r = await fetchAvecAuth(`/api/exchange/evenement/notes?itemId=${encodeURIComponent(itemId)}`);
      const corps = await r.json();
      notesAgenda[itemId] = corps.ok
        ? { etat: 'ok', notes: corps.notes || '', changeKey: corps.changeKey || '' }
        : { etat: 'erreur', message: corps.message || 'Notes illisibles.' };
    } catch (err) {
      notesAgenda[itemId] = { etat: 'erreur', message: 'Serveur injoignable — notes non lues.' };
    }
    if (ongletActuel === 'agenda' && agendaSelection === itemId && notesAgendaEdition !== itemId) renderPageAgenda();
  }

  function modifierNotesAgenda(itemId) {
    const n = notesAgenda[itemId];
    notesAgendaEdition = itemId;
    notesAgendaBrouillon = n && n.notes ? n.notes : '';
    renderPageAgenda();
    const champ = document.getElementById('agenda-notes-texte');
    if (champ) { champ.focus({ preventScroll: true }); champ.setSelectionRange(champ.value.length, champ.value.length); }
  }

  function annulerNotesAgenda() {
    notesAgendaEdition = null;
    notesAgendaBrouillon = '';
    renderPageAgenda();
  }

  async function enregistrerNotesAgenda(itemId) {
    const champ = document.getElementById('agenda-notes-texte');
    const texte = champ ? champ.value : notesAgendaBrouillon;
    const n = notesAgenda[itemId] || {};
    const e = agendaEvenements.find(x => x.itemId === itemId);
    const bouton = document.getElementById('agenda-notes-ok');
    if (bouton) bouton.disabled = true;
    try {
      const r = await fetchAvecAuth('/api/exchange/evenement/notes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, changeKey: n.changeKey || (e && e.changeKey) || '', notes: texte })
      });
      const corps = await r.json();
      if (!corps.ok) {
        if (bouton) bouton.disabled = false;
        afficherToast(corps.message || 'La note n’a pas été enregistrée.', 'OK', null);
        return;
      }
      notesAgenda[itemId] = { etat: 'ok', notes: texte.trim(), changeKey: corps.changeKey || '' };
      if (e && corps.changeKey) e.changeKey = corps.changeKey;
      notesAgendaEdition = null;
      notesAgendaBrouillon = '';
      afficherToast('Note enregistrée dans le rendez-vous.', 'OK', null);
      renderPageAgenda();
    } catch (err) {
      if (bouton) bouton.disabled = false;
      afficherToast('Serveur injoignable — note non enregistrée.', 'OK', null);
    }
  }

  // ---- Création d'un rendez-vous ----
  function ouvrirCreationAgenda(date, heure) {
    if (!exchangeAgendaPret()) { afficherToast('Connexion à l’agenda Outlook à activer dans les Réglages pour créer un rendez-vous.', 'OK', null); return; }
    const auj = isoAujourdhuiLocal();
    const jour = date || (agendaVue === 'jour' ? agendaJour : joursSemaineAgenda(agendaLundi).indexOf(auj) !== -1 ? auj : agendaLundi);
    agendaModale = { type: 'creation', date: jour, heure: heure || '09:00' };
    agendaCaseChoisie = null;
    const contenu = document.getElementById('agenda-modale-contenu');
    if (contenu) contenu.innerHTML = '';
    renderModaleAgenda();
    const champ = document.getElementById('agenda-creation-titre');
    if (champ) champ.focus({ preventScroll: true });
  }

  function renderCreationAgenda(m) {
    const actifs = dossiers.filter(d => !d.archive).sort((a, b) => libelleDossierAffiche(a).localeCompare(libelleDossierAffiche(b), 'fr'));
    return `<header class="ag-modale-tete">
        <div><h2 class="ag-modale-titre" id="agenda-modale-titre">Nouveau rendez-vous</h2>
        <div class="ag-modale-quand">Dans l’agenda partagé de l’office</div></div>
        <wa-button appearance="plain" size="s" type="button" class="bouton-icone icon-btn ag-modale-x" onclick="fermerModaleAgenda()" aria-label="Fermer">${icone('x')}</wa-button>
      </header>
      <form class="ag-modale-corps ag-form" onsubmit="event.preventDefault(); creerEvenementAgenda();">
        <label class="ag-champ"><span>Dossier <span class="ag-facultatif">— facultatif</span></span>
          <select id="agenda-creation-dossier" onchange="choisirDossierCreationAgenda(this.value)">
            <option value="">Aucun dossier</option>
            ${actifs.map(d => `<option value="${escapeAttr(d.id)}">${escapeHtml(libelleDossierAffiche(d))}</option>`).join('')}
          </select></label>
        <label class="ag-champ ag-case-signature" id="agenda-creation-signature-bloc" style="display:none">
          <input type="checkbox" id="agenda-creation-signature" onchange="choisirDossierCreationAgenda(document.getElementById('agenda-creation-dossier').value)"> Rendez-vous de signature (date notée sur la fiche)</label>
        <label class="ag-champ">Titre <input type="text" id="agenda-creation-titre" required maxlength="200" placeholder="Ex. : Rendez-vous client, lecture d’acte…"></label>
        <div class="ag-champs-ligne">
          <label class="ag-champ">Date <input type="date" id="agenda-creation-date" value="${escapeAttr(m.date)}" required></label>
          <label class="ag-champ">Début <input type="time" id="agenda-creation-heure" value="${escapeAttr(m.heure)}" step="900" required></label>
          <label class="ag-champ">Durée
            <select id="agenda-creation-duree">
              <option value="30">30 min</option><option value="60" selected>1 h</option><option value="90">1 h 30</option><option value="120">2 h</option><option value="180">3 h</option>
            </select></label>
        </div>
        <label class="ag-champ">Lieu <input type="text" id="agenda-creation-lieu" maxlength="160" placeholder="Facultatif"></label>
        <label class="ag-champ">Notes <textarea id="agenda-creation-notes" rows="3" maxlength="8000" placeholder="Facultatif — visibles aussi dans Outlook"></textarea></label>
        <div class="rdv-type-choix" role="radiogroup" aria-label="Couleur du rendez-vous">
          <label class="rdv-type-option"><input type="radio" name="agenda-creation-type" value="" checked><span class="rdv-type-pastille"></span>Sans catégorie</label>
          ${Object.entries(TYPES_RDV).map(([cle, t]) => `<label class="rdv-type-option"><input type="radio" name="agenda-creation-type" value="${cle}"><span class="rdv-type-pastille rdv-type-${cle}"></span>${t.libelle}</label>`).join('')}
        </div>
        <footer class="ag-modale-pied ag-modale-pied-form">
          <wa-button appearance="outlined" class="secondary" id="agenda-creation-plusieurs" onclick="proposerPlusieursDatesAgenda()" title="Envoyer aux parties plusieurs créneaux, dont celui-ci : chacun indique ceux qui lui conviennent">${icone('users')} Proposer plusieurs dates</wa-button>
          <span class="jour-espace"></span>
          <wa-button appearance="outlined" class="secondary" onclick="fermerModaleAgenda()">Annuler</wa-button>
          <wa-button variant="brand" type="submit" class="primary" id="agenda-creation-ok">${icone('calendar')} Créer le rendez-vous</wa-button>
        </footer>
      </form>`;
  }

  // Un dossier choisi : titre « VTE - NOM » proposé, et la case « signature » offerte tant que le
  // dossier n'a pas de rendez-vous de signature.
  function choisirDossierCreationAgenda(id) {
    const d = dossiers.find(x => x.id === id);
    const bloc = document.getElementById('agenda-creation-signature-bloc');
    const titre = document.getElementById('agenda-creation-titre');
    if (bloc) bloc.style.display = d && !d.rendezVousSignature ? '' : 'none';
    if (d && titre && (!titre.value || RE_NOM_DEJA_PREFIXE.test(titre.value))) titre.value = libelleDossierAffiche(d);
    const sig = document.getElementById('agenda-creation-signature');
    if (sig && (!d || d.rendezVousSignature)) sig.checked = false;
    // Le lieu reprend celui que CLAIRE écrit pour une signature (étude, 01/10 : responsable, confrère
    // en 1er / en 2nd, appel de fonds et projet envoyés) : « BA - Me DURAND en 2nd - Appel de fonds
    // envoyé ». Rempli tant qu'il est vide ou qu'il porte encore la proposition précédente ; un lieu
    // tapé à la main n'est jamais remplacé.
    const lieu = document.getElementById('agenda-creation-lieu');
    if (lieu && (!lieu.value.trim() || lieu.value === lieu.dataset.propose)) {
      lieu.value = d ? lieuRdvAgenda(d) : '';
      lieu.dataset.propose = lieu.value;
    }
    // « Proposer plusieurs dates » (étude, 01/10) : le sondage de créneaux du dossier (sans rendez-vous
    // de signature), ou un sondage sans dossier.
    const plusieurs = document.getElementById('agenda-creation-plusieurs');
    if (plusieurs) plusieurs.style.display = !d || !d.rendezVousSignature ? '' : 'none';
  }

  // Étude, 01/10 : « lors de l'ajout d'un rendez-vous, proposer l'option pour proposer plusieurs
  // dates ». Passe du formulaire au sondage de créneaux du dossier (ouvrirSondageCreneaux) : le créneau
  // saisi vient en tête, coché, suivi des créneaux que CLAIRE propose ; d'autres s'ajoutent à la main.
  function proposerPlusieursDatesAgenda() {
    const val = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
    const d = dossiers.find(x => x.id === val('agenda-creation-dossier'));
    const date = val('agenda-creation-date');
    const heure = val('agenda-creation-heure');
    const enTete = /^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{2}:\d{2}$/.test(heure)
      ? [{ date, heure, exceptionnel: motifCreneauExceptionnel(heure, DUREE_CRENEAU_SIGNATURE, rendezVousHorairesJour(agendaEvenements, date).length) || '' }] : [];
    const titre = val('agenda-creation-titre');
    agendaModale = null;
    renderModaleAgenda();
    // Sans dossier (étude, 01/10) : un sondage libre, au titre saisi.
    if (d) ouvrirSondageCreneaux(d.id, null, enTete);
    else ouvrirSondageSansDossier(titre, enTete);
  }

  // Pur : les créneaux du sondage — ceux mis en tête (saisis à la main), puis les propositions qui
  // ne les répètent pas.
  function creneauxSondageAvecTete(enTete, proposes, max) {
    const tete = (enTete || []).filter(c => c && c.date && c.heure);
    const reste = (proposes || []).filter(c => !tete.some(t => t.date === c.date && t.heure === c.heure));
    return tete.concat(reste).slice(0, max);
  }

  async function creerEvenementAgenda() {
    const val = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
    const sujet = val('agenda-creation-titre');
    const date = val('agenda-creation-date');
    const heure = val('agenda-creation-heure');
    const dureeMinutes = parseInt(val('agenda-creation-duree'), 10) || 60;
    const lieu = val('agenda-creation-lieu');
    const notes = val('agenda-creation-notes');
    const choix = document.querySelector('input[name="agenda-creation-type"]:checked');
    const typeRdv = choix && TYPES_RDV[choix.value] ? choix.value : '';
    const d = dossiers.find(x => x.id === val('agenda-creation-dossier')) || null;
    const signature = !!(d && document.getElementById('agenda-creation-signature') && document.getElementById('agenda-creation-signature').checked);
    if (!sujet || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(heure)) { afficherToast('Titre, date et heure sont nécessaires.', 'OK', null); return; }
    const creer = async () => {
      const bouton = document.getElementById('agenda-creation-ok');
      if (bouton) { bouton.disabled = true; bouton.textContent = 'Création…'; }
      const ok = await posterEvenementAgenda({ sujet, date, heure, dureeMinutes, lieu, typeRdv, dossier: d, signature, notes });
      if (bouton) { bouton.disabled = false; }
      if (ok) { agendaModale = null; renderPageAgenda(); chargerAgendaSemaine(); }
    };
    // Règles de l'étude (9 h, 12 h – 14 h, après 18 h, 6 rendez-vous par jour) : une exception reste
    // possible, mais elle se confirme.
    const motif = motifCreneauExceptionnel(heure, dureeMinutes, rendezVousHorairesJour(agendaEvenements, date).length);
    if (motif) demanderConfirmation(`Créer ce rendez-vous malgré tout ? Il est exceptionnel : ${motif}.`, creer, { bouton: 'Créer quand même', ton: 'valider' });
    else creer();
  }

  // Écrit un rendez-vous dans l'agenda de l'office (un seul essai). Rendez-vous de signature d'un
  // dossier : la date et l'heure sont notées sur la fiche, comme depuis la fiche elle-même.
  async function posterEvenementAgenda({ sujet, date, heure, dureeMinutes, lieu, typeRdv, dossier, signature, notes }) {
    const categorie = typeRdv ? (categoriesRdvReglees()[typeRdv] || '') : '';
    try {
      const reponse = await fetchAvecAuth('/api/exchange/rendez-vous', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sujet, date, heure, dureeMinutes, lieu, categorie, signature,
          dossierId: dossier ? dossier.id : null, dossierNom: dossier ? dossier.nom : null,
          // Les notes saisies deviennent le corps du rendez-vous dans Outlook.
          corps: notes || (signature ? 'Rendez-vous de signature créé depuis l’agenda de CLAIRE.' : 'Rendez-vous créé depuis l’agenda de CLAIRE.')
        })
      });
      const corps = await reponse.json();
      if (!corps.ok) { afficherToast(corps.message || 'La création du rendez-vous a échoué.', 'OK', null); return false; }
      if (dossier && signature) {
        dossier.rendezVousSignature = date;
        dossier.rendezVousSignatureHeure = heure;
        if (typeRdv) dossier.rendezVousType = typeRdv;
        dossier.rdvAgendaCreeLe = new Date().toISOString();
        dossier.rdvAgendaItem = corps.itemId ? { itemId: corps.itemId, changeKey: corps.changeKey || '', date } : null;
        dossier.confiance = dossier.confiance || {};
        dossier.confiance.rendezVousSignature = 'manuel';
        ajouterHistorique(dossier, `Rendez-vous de signature fixé depuis l’agenda : ${formatDateFr(date)} à ${heure}${typeRdv ? `, ${TYPES_RDV[typeRdv].libelle.toLowerCase()}` : ''} (créé dans l’agenda Outlook).`);
        notifierDateAjoutee(dossier, LIBELLES_CATEGORIE.rendezVousSignature || 'Rendez-vous de signature', date, '');
        sauvegarder(dossier);
      } else if (dossier) {
        ajouterHistorique(dossier, `Rendez-vous « ${sujet} » créé dans l’agenda de l’office le ${formatDateFr(date)} à ${heure}.`);
        sauvegarder(dossier);
      }
      if (typeRdv === 'visio') afficherToast('Rendez-vous créé. Créez la visio sur le site ADNOV, puis déposez son invitation (.ics) sur l’agenda.', 'Créer la visio', ouvrirSiteVisio);
      else afficherToast('Rendez-vous créé dans l’agenda de l’office.', 'OK', null);
      render();
      return true;
    } catch (e) {
      afficherToast('Serveur injoignable — rendez-vous non créé.', 'OK', null);
      return false;
    }
  }

  // Créneau proposé → rendez-vous de signature placé, après confirmation.
  function placerCreneauSignature(id, date, heure) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    const motif = motifCreneauExceptionnel(heure, DUREE_CRENEAU_SIGNATURE, rendezVousHorairesJour(agendaEvenements, date).length);
    demanderConfirmation(`Placer la signature de ${libelleDossierAffiche(d)} le ${dateAvecJourFr(date)} à ${heure.replace(':', ' h ')} dans l’agenda de l’office ?${motif ? ` Créneau exceptionnel : ${motif}.` : ''}`, async () => {
      const typeRdv = typeRendezVous(d, categoriesRdvReglees()) || 'office';
      const ok = await posterEvenementAgenda({ sujet: libelleDossierAffiche(d), date, heure, dureeMinutes: DUREE_CRENEAU_SIGNATURE, lieu: lieuRdvAgenda(d), typeRdv, dossier: d, signature: true });
      if (ok) chargerAgendaSemaine();
    }, { bouton: 'Placer', ton: 'valider' });
  }
