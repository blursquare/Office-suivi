// @ts-check
'use strict';
// Planning d’un dossier : échéances en attente (vente préalable, prêt, SAFER, étape avant signature, personnalisées) — le poste l’affiche, le serveur en tire les rappels et les dates butoir de l’agenda.
// Code COMMUN au poste (navigateur, <script> classique chargé avant client/) et au serveur (require) — écrit une fois,
// jamais en miroir (étude, 04/10). Dans le navigateur, les noms exportés deviennent des globaux (comme les fonctions de
// client/) ; côté Node, module.exports. Pas de syntaxe réservée à l'un des deux mondes.
/** @param {typeof import('./dates') & typeof import('./dossier')} C — les autres fichiers de commun/ dont celui-ci dépend */
(function (C) {
  // Date limite de l'envoi de l'appel de fonds : 10 jours avant le rendez-vous de signature (étude 05/10 : « c'est dix jours
  // avant pour l'appel de fonds » — 1 jour le même soir, corrigé) ; le rappel Teams part ce jour-là (seuil 0, jobs/rappels.js).
  var JOURS_APPEL_FONDS_AVANT_RDV = 10;
  // Fonds pas encore arrivés à 3 jours du rendez-vous : relance au client (« À faire », onglet Fonds) et alerte Teams au
  // responsable le même jour (étude 03/10 et 05/10 : « pour Teams il faut suivre les délais des échanges ») — un seul nombre
  // pour le poste et le serveur (audit 07/10 : le serveur l'écrivait en dur).
  var JOURS_RELANCE_FONDS = 3;
  /** @param {any} d @returns {string} */
  function echeanceAppelFonds(d) {
    return d && d.rendezVousSignature ? C.addDays(d.rendezVousSignature, -JOURS_APPEL_FONDS_AVANT_RDV) : '';
  }

  function echeanceValidee(d, type) {
    if (type === 'fixerRdv') return !!d.rendezVousSignature;
    if (type === 'pret') return d.offrePretStatut === 'recue' || !!(d.echeancesValidees && d.echeancesValidees.pret);
    if (type === 'acte') return !!d.rendezVousSignature || !!(d.echeancesValidees && d.echeancesValidees.acte);
    // Appel de fonds / projet : la date saisie EST la date d'envoi, elle vaut envoi fait (étude : « une date d'envoi saisie vaut
    // envoi fait »). Une date d'envoi sans case cochée ne doit jamais servir d'échéance : elle est dans le passé, le délai
    // jusqu'au rendez-vous (et les rappels qui en partent) ne reviendrait pas après un décochage.
    if ((type === 'appelFonds' || type === 'projetEnvoye') && d[type]) return true;
    // Rédaction de l'acte (étude 07/10) : cochée dès qu'Authentic la dit « En cours » (ou l'acte signé), jamais tant qu'il dit
    // « Non rédigé » ; une coche ou une décoche à la main (true / false) l'emporte jusqu'au prochain changement d'état dans Authentic.
    if (type === 'redaction') {
      const v = d.echeancesValidees && d.echeancesValidees.redaction;
      if (v === false || v === true) return v;
      return ['redaction', 'signe'].includes(etatRedactionActe(d));
    }
    return !!(d.echeancesValidees && d.echeancesValidees[type]);
  }

  // ---- Rédaction de l'acte (étude 07/10 : « rajouter une étape avant l'envoi du projet » — Authentic dit « Non rédigé », puis
  // « En cours » quand l'acte commence à être rédigé, puis « Signé le … ») ----
  // État lu dans le tableau « Rédaction » d'Authentic : 'a_rediger' (Non rédigé), 'redaction' (En cours), 'signe', ou ''.
  function etatRedactionActe(d) {
    const a = d && d.authentic && d.authentic.acte;
    return (a && a.etat) || '';
  }
  // Échéance de la rédaction : 15 jours avant la signature (avant l'appel de fonds à J-10 et l'envoi du projet). Étude 07/10 :
  // « si pas de rendez-vous placé ou des propositions en cours, mettez bien l'échéance quand même » — la signature qui sert de
  // repère est le rendez-vous placé ; sinon, sur le poste, la première date encore proposée au client (sondage ouvert), puis la
  // date de signature au plus tôt (signaturePrevueDossier, client/27 : sondages et agenda ne sont connus que du poste) ; sinon
  // la date butoir. Une signature estimée ne met jamais la rédaction avant aujourd'hui (à faire dès maintenant, pas « en retard »).
  var JOURS_REDACTION_AVANT_RDV = 15;
  let calculRepereRedaction = false;
  /** @param {any} d @param {string} [aujourdhuiIso] @returns {{ date: string, source: string } | null} */
  function repereSignatureRedaction(d, aujourdhuiIso) {
    if (!d) return null;
    if (d.rendezVousSignature) return { date: d.rendezVousSignature, source: 'rdv' };
    const g = /** @type {any} */ (globalThis);
    if (typeof g.signaturePrevueDossier === 'function' && !calculRepereRedaction) {
      calculRepereRedaction = true;
      try {
        const p = g.signaturePrevueDossier(d, aujourdhuiIso);
        if (p && /^\d{4}-\d{2}-\d{2}$/.test(String(p.date || ''))) return { date: p.date, source: p.source || 'probable' };
      } finally { calculRepereRedaction = false; }
    }
    if (d.acte) return { date: d.acte, source: 'butoir' };
    return null;
  }
  /** @param {any} d @param {string} [aujourdhuiIso] @returns {string} */
  function echeanceRedaction(d, aujourdhuiIso) {
    const r = repereSignatureRedaction(d, aujourdhuiIso);
    if (!r) return '';
    const iso = C.addDays(r.date, -JOURS_REDACTION_AVANT_RDV);
    if (r.source === 'rdv') return iso;
    const t = new Date();
    const auj = aujourdhuiIso || `${t.getFullYear()}-${C.pad(t.getMonth() + 1)}-${C.pad(t.getDate())}`;
    return iso < auj ? auj : iso;
  }
  // Ce qui retient encore la rédaction : les conditions à date butoir — offre de prêt (et vente préalable, voir pretLeve),
  // renonciation au droit de préemption (DIA), SAFER. Les pièces d'urbanisme ne la retiennent jamais (étude 07/10).
  function attentesRedaction(d) {
    const r = [];
    if (!d.sansPret && !echeanceValidee(d, 'pret')) r.push('offre de prêt');
    if (d.ventebien && !echeanceValidee(d, 'ventebien')) r.push('vente préalable');
    if (!preemptionLevee(d)) r.push('renonciation au droit de préemption');
    if (!saferLevee(d)) r.push('réponse de la SAFER');
    return r;
  }
  // « Rédiger l'acte » est proposé quand Authentic dit « Non rédigé » (jamais sans état lu — choix de l'étude), que plus rien ne
  // retient la rédaction et qu'elle n'est pas déjà notée commencée ; jamais en participation (le confrère rédige) ni en succession.
  function redactionAProposer(d) {
    if (!d || d.archive || C.estSuccession(d) || d.roleNotaire === 'participant') return false;
    if (etatRedactionActe(d) !== 'a_rediger' || echeanceValidee(d, 'redaction')) return false;
    return !attentesRedaction(d).length;
  }

  // Détermine, parmi les échéances d'un dossier, la plus proche à afficher en un coup d'œil dans
  // la vue tableau (celle déjà retenue pour le tri par calculerProchaineEcheance, mais avec son
  // type/libellé/date en plus, pas seulement le nombre de jours).
  // Une échéance peut être déclarée RÉALISÉE sans être supprimée : la vente préalable de
  // l'acquéreur s'est faite, la date reste au dossier pour mémoire, mais elle ne doit plus
  // ressortir comme la prochaine chose à surveiller — exactement le rôle que joue déjà
  // `offrePretStatut === 'recue'` pour l'obtention du prêt. Demandé par l'étude pour la vente
  // préalable ; l'état est stocké par TYPE (et non sous un booléen dédié) pour que l'étendre à une
  // autre échéance ne demande rien de plus qu'un bouton.
  // Le prêt reste avant tout piloté par le statut dérivé du parcours NAS (offrePretStatut) — mais
  // "permettre de valider n'importe quelle date d'échéance" (demandé explicitement) doit aussi
  // couvrir un dossier où cette confirmation automatique n'a pas lieu (prêt confirmé par un autre
  // moyen, dossier non relié au NAS...). Le drapeau manuel n'intervient qu'en complément : dès que
  // l'offre est effectivement reçue, c'est ce statut-là qui fait foi (voir aussi renderLigneEcheance, qui
  // évite d'afficher un bouton "Annuler la validation" sans effet dans ce cas).
  // Une échéance peut être close par une décision manuelle (d.echeancesValidees) ou par un fait du
  // dossier qui la résout d'office. Deux tels faits, l'un et l'autre décrits par l'étude :
  //  - l'offre de prêt effectivement reçue clôt « Obtention du prêt » ;
  //  - un rendez-vous de signature FIXÉ clôt la date butoir de réitération : « une fois que cette
  //    date est rentrée la date butoir n'a plus lieu d'être, mais reste indicative pour savoir si
  //    on signe avant ou après ». Elle continue donc de s'afficher sur la fiche (avec l'écart, voir
  //    renderSousRendezVous), mais elle sort du planning : plus de décompte à surveiller,
  //    plus de rappel automatique, plus de « prochaine échéance ». Le rendez-vous réel prend le relais.
  // Prêt « levé » : offre reçue (ou validée à la main), ou pas de prêt du tout — et la vente
  // préalable, s'il y en a une, réalisée : elle précède le prêt dans l'ordre du dossier, et le
  // rendez-vous de signature ne se place qu'une fois ces deux conditions tombées.
  function pretLeve(d) {
    return (!!d.sansPret || echeanceValidee(d, 'pret')) && (!d.ventebien || echeanceValidee(d, 'ventebien'));
  }

  // Renonciation au droit de préemption reçue — ou sans objet : pièce retirée de la checklist de
  // ce dossier, ou étude en participation (pas de checklist suivie). Une validation à la main compte
  // (elle pose aussi 'recue'). Conditionne l'étape « Fixer le rendez-vous » (demande de l'étude).
  // En copropriété, la vente d'un lot n'appelle pas cette attente (demande de l'étude) — sauf si
  // une pièce de préemption a été AJOUTÉE À LA MAIN au dossier (pièce personnalisée) et n'est pas
  // encore reçue : c'est alors l'étude qui a dit qu'il fallait l'attendre.
  var RE_PIECE_PREEMPTION = /pr[ée]emption|\bDPU\b|\bDIA\b/i;
  // Pièces de préemption ajoutées par l'analyse des droits de préemption (client/54, d.preemption.piecesAjoutees : DIA d'un lot
  // de copropriété, droit de préférence ou préemption des bois et forêts) et pas encore reçues — elles retiennent la signature
  // comme la renonciation de la mairie (étude 07/10 : « cohérence des échéances avec les pièces reçues pour droit de préemption »).
  // « Réponse SAFER » est suivie à part (saferLevee).
  /** @param {any} d @returns {string[]} */
  // La pièce standard « Renonciation au droit de préemption » y figure pour un lot de copropriété soumis au DPU (audit 07/10 : une
  // seconde pièce « (DIA) » doublait la checklist et ni le scan ni Authentic ne la cochaient) — sauf retirée à la main.
  function piecesPreemptionEnAttente(d) {
    const ajoutees = d && d.preemption && Array.isArray(d.preemption.piecesAjoutees) ? d.preemption.piecesAjoutees : [];
    const perso = (d && d.piecesPersonnalisees) || [];
    const presente = c => (c === 'renonciationPreemption'
      ? ((d && d.piecesRetirees) || []).indexOf(c) === -1
      : perso.some(p => p && p.cle === c));
    return ajoutees.filter(c => c !== 'perso-safer' && presente(c) && !(d.pieces && d.pieces[c] === 'recue'));
  }
  function preemptionLevee(d) {
    if (d.roleNotaire === 'participant' || C.estSuccession(d)) return true;
    if (piecesPreemptionEnAttente(d).length) return false;
    if (d.typeVente === 'copropriete') {
      return !(d.piecesPersonnalisees || []).some(p => p && RE_PIECE_PREEMPTION.test(p.label || '')
        && !(d.pieces && d.pieces[p.cle] === 'recue'));
    }
    if ((d.piecesRetirees || []).indexOf('renonciationPreemption') !== -1) return true;
    return !!(d.pieces && d.pieces.renonciationPreemption === 'recue');
  }

  // Pure : délai de réponse de la SAFER et date à laquelle, sans réponse, la non-préemption est
  // acquise (étude, 02/10) — compté de la prise en compte, à défaut de l'envoi. '' si inconnue.
  // 2 mois de base ; « réponse rapide » (1 mois) ou « très rapide » (8 jours) se cochent sous la pièce
  // « Réponse SAFER » (`delaiManuel`), jamais devinés.
  var DELAIS_SAFER = { normal: { mois: 2, libelle: '2 mois' }, rapide: { mois: 1, libelle: '1 mois, réponse rapide' }, tres_rapide: { jours: 8, libelle: '8 jours, réponse très rapide' } };
  function delaiSafer(safer) {
    return safer && DELAIS_SAFER[safer.delaiManuel] ? safer.delaiManuel : 'normal';
  }
  function echeanceSaferTacite(safer) {
    if (!safer) return '';
    // Départ = date d'envoi (étude, 02/10). Relevés d'avant cette règle (sans envoyeeLe) : leur
    // « prise en compte » était la 2e date de la ligne, donc déjà l'envoi.
    const depart = safer.envoyeeLe || safer.priseEnCompteLe || safer.notifieeLe;
    // Date mal formée (relevé incomplet) : rien plutôt qu'une date fausse (le serveur l'exigeait déjà, le poste non).
    if (!depart || !/^\d{4}-\d{2}-\d{2}$/.test(depart)) return '';
    const delai = DELAIS_SAFER[delaiSafer(safer)];
    return delai.jours ? C.addDays(depart, delai.jours) : C.ajouterMois(depart, delai.mois);
  }

  // Pure : la SAFER ne retient plus la signature — non-préemption (reçue ou délai écoulé), pièce
  // « Réponse SAFER » reçue, participation, ou aucune SAFER dans le dossier. Comme la renonciation
  // de la mairie (preemptionLevee), elle conditionne « Fixer le rendez-vous » (étude, 02/10).
  function saferLevee(d) {
    if (!d || d.roleNotaire === 'participant') return true;
    const sa = d.authentic && d.authentic.safer;
    if (sa && sa.decision === 'non_preemption') return true;
    const piece = (d.piecesPersonnalisees || []).find(p => p && /safer/i.test(p.label || ''));
    if (piece && d.pieces && d.pieces[piece.cle] === 'recue') return true;
    return !sa && !piece;
  }

  // Pure : date jusqu'à laquelle la SAFER peut encore préempter ('' si levée ou sans date connue).
  function echeanceSaferDossier(d) {
    return saferLevee(d) ? '' : echeanceSaferTacite(d.authentic && d.authentic.safer);
  }

  // Pure : date à laquelle la commune doit avoir répondu à la DIA — 2 mois après son envoi relevé dans Authentic (« Demande
  // envoyée le … » de la ligne DIA). '' si la renonciation est reçue ou si l'envoi n'est pas daté. Ce n'est JAMAIS une
  // renonciation tacite (étude 07/10 : « pour la DIA on doit avoir le document de renonciation pour signer ») : la date sert à
  // suivre et à relancer la mairie ; le rendez-vous ne se place qu'avec la pièce reçue (preemptionLevee).
  var MOIS_REPONSE_DIA = 2;
  /** @param {any} d @returns {string} */
  function echeanceDiaDossier(d) {
    if (!d || preemptionLevee(d)) return '';
    const dia = d.authentic && d.authentic.demandes && d.authentic.demandes.renonciationPreemption;
    const envoi = dia && dia.date;
    if (!envoi || !/^\d{4}-\d{2}-\d{2}$/.test(envoi)) return '';
    return C.ajouterMois(envoi, MOIS_REPONSE_DIA);
  }

  // Toutes les échéances ACTIVES d'un dossier, pas seulement la plus proche. Même exclusion que
  // prochaineEcheanceDetail() pour une offre de prêt déjà reçue : la condition est résolue, la
  // faire apparaître dans le planning de la semaine donnerait du travail qui n'existe plus.
  // La liste des échéances qui composent le PLANNING d'un dossier — le tableau du Suivi, la vue
  // Échéances, les rappels. Une seule définition, partagée par toutesEcheances() et
  // prochaineEcheanceDetail() : les deux en portaient une copie, et toute règle ajoutée à l'une
  // devait être reportée à l'autre à la main.
  //
  // Trois règles métier, données par l'étude, que la seule lecture des dates ne suffit pas à poser :
  //
  //  1. La DATE BUTOIR (`acte`) n'y figure jamais. Elle vient de l'avant-contrat et n'est
  //     qu'indicative : ce qui engage l'étude, c'est le rendez-vous pris à l'office. Elle reste
  //     visible sur la fiche (avec l'écart entre les deux, voir renderLigneEcheance) mais n'annonce plus
  //     rien dans le planning.
  //  2. Tant que l'APPEL DE FONDS n'est pas fait, c'est lui qu'il reste à faire, même si le
  //     rendez-vous est déjà fixé : le planning annonce donc « Appel de fonds ». Faute de date
  //     propre — le cas courant, l'étude ne la saisit pas toujours — il prend celle du
  //     rendez-vous : l'appel doit de toute façon être parti avant, c'est sa vraie échéance.
  //  3. Une fois l'appel de fonds fait, c'est l'envoi du PROJET D'ACTE au client qui devient
  //     l'étape à surveiller (même repli sur la date du rendez-vous à défaut de date propre) —
  //     ajouté sur demande de l'étude, lue automatiquement depuis l'agenda de l'office quand elle
  //     l'y note (voir agendaWatch.js côté serveur), ou saisie à la main comme les autres dates.
  //  4. Une fois le projet envoyé, le rendez-vous devient la prochaine échéance, sous le nom
  //     de « Signature de l'acte » — c'est ce qu'il reste à faire, et c'est la seule signature
  //     dont la date soit certaine.
  //
  // Ordre métier du dossier : compromis signé → vente préalable (elle finance l'acquisition) →
  // obtention du prêt → appel de fonds → projet d'acte envoyé → signature. Ne départage que les
  // ex æquo, le tri se faisant par date.
  /**
   * Une échéance du planning : `iso` AAAA-MM-JJ (null = étape sans date propre), `index` pour une échéance personnalisée.
   * @typedef {{ type: string, label: string, iso: (string|null), index?: number }} Echeance
   */
  /** @returns {Echeance[]} */
  function echeancesPlanning(d) {
    /** @type {Echeance[]} */
    const items = [];
    if (C.estSuccession(d)) {
      // Succession : la signature (si placée) et les échéances ajoutées à la main, rien d'autre.
      if (d.rendezVousSignature && !echeanceValidee(d, 'rendezVousSignature')) items.push({ type: 'rendezVousSignature', label: 'Signature de l’acte', iso: d.rendezVousSignature });
      (d.autres || []).forEach((a, i) => {
        if (!echeanceValidee(d, 'autre-' + i) && a.date) items.push({ type: 'autre', label: a.label, iso: a.date, index: i });
      });
      return items;
    }
    if (!echeanceValidee(d, 'ventebien')) items.push({ type: 'ventebien', label: 'Vente préalable', iso: d.ventebien });
    // Une offre déjà reçue clôt cette échéance : la garder ici referait apparaître « Obtention du
    // prêt » comme la prochaine chose à surveiller alors qu'il n'y a plus rien à y suivre.
    if (!echeanceValidee(d, 'pret')) items.push({ type: 'pret', label: 'Obtention du prêt', iso: d.pret });
    // SAFER notifiée (relevée dans Authentic) : la date où, sans réponse, la non-préemption est acquise
    // est une date butoir du dossier (étude, 02/10) — jusqu'à elle, pas de « Fixer le rendez-vous ».
    const echeanceSafer = echeanceSaferDossier(d);
    if (echeanceSafer) items.push({ type: 'safer', label: 'Délai SAFER', iso: echeanceSafer });
    // DIA envoyée (Authentic), renonciation pas encore reçue : la date où la commune doit avoir répondu — l'attente de la
    // renonciation, datée (elle remplace « Renonciation préemption attendue » sans date ; la pièce reste exigée).
    const echeanceDia = echeanceDiaDossier(d);
    if (echeanceDia) items.push({ type: 'dia', label: 'Réponse à la DIA', iso: echeanceDia });

    // L'étape courante avant signature : appel de fonds, puis projet d'acte envoyé, puis signature.
    // À défaut de date propre, elle prend celle du rendez-vous de signature (elle doit de toute
    // façon être faite avant lui). La date butoir de réitération (d.acte) n'y sert PAS d'ancre par
    // défaut : elle vient de l'avant-contrat, n'est qu'indicative, et l'utiliser partout ferait
    // apparaître un « Envoi appel de fonds » prématuré sur chaque dossier encore en cours de prêt.
    // Étape ajoutée à la demande de l'étude (28/09) : une fois l'offre de prêt reçue (ou sur un
    // achat comptant), la première chose à faire est de PLACER le rendez-vous de signature ; l'appel
    // de fonds ne vient qu'ensuite. Ancrée sur la date butoir, seule date qui borne ce rendez-vous
    // tant qu'il n'est pas pris. Close d'elle-même dès que d.rendezVousSignature est renseignée.
    let etape = null;
    // Un appel de fonds déjà daté ou fait (cas où il est parti avant que le rendez-vous soit noté)
    // garde sa place : on ne recule pas d'une étape.
    // Demandé par l'étude : pas de « Fixer le rendez-vous » tant que la renonciation au droit de
    // préemption n'est pas reçue — le rendez-vous ne peut pas être pris avant. L'étape devient alors
    // cette attente, SANS date propre : elle ne ressort que par le filet de sécurité ci-dessous
    // (dossier qui n'a plus rien d'autre à surveiller), ancrée sur la date butoir.
    if (!d.rendezVousSignature && pretLeve(d) && !d.appelFonds && !echeanceValidee(d, 'appelFonds')) {
      etape = !preemptionLevee(d) ? (echeanceDia ? null : { type: 'preemption', label: 'Renonciation préemption attendue', iso: null })
        : !saferLevee(d) ? (echeanceSafer ? null : { type: 'safer', label: 'Réponse SAFER attendue', iso: null })
          : { type: 'fixerRdv', label: 'Fixer le rendez-vous', iso: d.acte };
    } else if (!echeanceValidee(d, 'appelFonds')) {
      etape = { type: 'appelFonds', label: 'Envoi appel de fonds', iso: d.appelFonds || echeanceAppelFonds(d) };
    } else if (!echeanceValidee(d, 'projetEnvoye')) {
      etape = { type: 'projetEnvoye', label: 'Envoi projet', iso: d.projetEnvoye || d.rendezVousSignature };
    } else if (!echeanceValidee(d, 'rendezVousSignature')) {
      etape = { type: 'rendezVousSignature', label: 'Signature de l’acte', iso: d.rendezVousSignature };
    }
    if (etape) items.push(etape);
    // Rédaction de l'acte (étude 07/10) : à côté de l'étape en cours, dès que les pièces sont réunies et qu'Authentic dit « Non rédigé ».
    if (redactionAProposer(d)) items.push({ type: 'redaction', label: 'Rédaction de l’acte', iso: echeanceRedaction(d) || null });

    (d.autres || []).forEach((a, i) => {
      if (!echeanceValidee(d, 'autre-' + i)) items.push({ type: 'autre', label: a.label, iso: a.date, index: i });
    });
    let reels = items.filter(it => it.iso);

    // Filet de sécurité (demandé par l'étude) : un dossier dont l'offre est reçue mais dont le
    // rendez-vous n'est pas encore placé — typiquement une participation — n'avait plus AUCUNE
    // échéance datée et DISPARAISSAIT du planning, au moment précis où il faut placer le rendez-vous
    // avec le confrère. Si rien ne reste, qu'une étape avant signature est encore à faire mais sans
    // date, et qu'une date butoir existe (sans rendez-vous ni butoir déjà validé), on garde le
    // dossier visible en ancrant cette étape sur la date butoir — seule échéance opérante tant
    // qu'aucun rendez-vous ne la remplace. Ciblé sur ce seul cas : jamais une échéance sur le butoir
    // quand le dossier a déjà autre chose à surveiller (prêt, vente préalable…).
    if (!reels.length && etape && !etape.iso && d.acte && !d.rendezVousSignature && !echeanceValidee(d, 'acte')) {
      reels = [Object.assign({}, etape, { iso: d.acte })];
    }
    return reels;
  }

  const exportes = { JOURS_APPEL_FONDS_AVANT_RDV, JOURS_RELANCE_FONDS, echeanceAppelFonds, echeanceValidee, JOURS_REDACTION_AVANT_RDV, etatRedactionActe, repereSignatureRedaction, echeanceRedaction, attentesRedaction, redactionAProposer, pretLeve, piecesPreemptionEnAttente, preemptionLevee, MOIS_REPONSE_DIA, echeanceDiaDossier, DELAIS_SAFER, delaiSafer, echeanceSaferTacite, saferLevee, echeanceSaferDossier, echeancesPlanning };
  // Node : module.exports ; navigateur : des globaux (noms nus, comme les fonctions de client/).
  if (typeof module !== 'undefined' && module.exports) module.exports = exportes; else Object.assign(globalThis, exportes);
})(
  // Les autres fichiers de commun/ dont celui-ci dépend : require côté Node, globaux déjà chargés côté navigateur.
  typeof module !== 'undefined' && module.exports ? Object.assign({}, require('./dates'), require('./dossier')) : /** @type {any} */ (globalThis)
);
