  // ==== NOTIFICATIONS "NOUVELLE PIÈCE TROUVÉE" ====
  // Distinct de la surveillance périodique du NAS côté serveur (nasWatch.js, `d.nasNouveaute`) :
  // celle-ci ne sait détecter qu'un NOM DE FICHIER apparu, sans savoir à quelle pièce de la
  // checklist il correspond (aucun test de motifNom côté serveur) — un simple toast éphémère,
  // effacé dès que verifierDossierLocal() relit le dossier. ICI, on sait PRÉCISÉMENT quelle(s)
  // pièce(s) viennent de passer à "reçue" (le diff est fait dans verifierDossierLocal, qui a déjà
  // tout ce qu'il faut : d.pieces avant/après le parcours) — un signal plus riche, persisté sur le
  // dossier (d.piecesNotifications, un tableau de clés) jusqu'à ce que la fiche soit consultée puis
  // refermée (voir fermerDossierDrawer). CLE_NOTIF_OFFRE_PRET est un pseudo-"cle" de checklist pour
  // que l'offre de prêt (qui n'est pas dans checklistPieces) partage le même mécanisme plutôt que
  // d'en avoir un second à côté.
  var CLE_NOTIF_OFFRE_PRET = 'offre-pret';

  // Libellé humain d'une clé de notification, pour l'affichage (fiche, sidebar) et l'email
  // envoyé au responsable — un seul endroit qui sait résoudre les deux familles de clés
  // possibles (checklist de pièces, ou le pseudo-cle de l'offre).
  function libelleNotificationPiece(d, cle) {
    if (cle === CLE_NOTIF_OFFRE_PRET) return 'Offre de prêt';
    const piece = checklistPieces(d.typeVente, d).find(p => p.cle === cle);
    return piece ? piece.label : cle;
  }

  // Nombre total de notifications non vues, tous dossiers actifs confondus — affiché en badge dans
  // la sidebar à côté de "Suivi des dossiers" (voir majBadgeNotificationsSidebar). Un dossier
  // archivé n'est jamais compté : rien à signaler sur un dossier qu'on ne consulte plus.
  // Pure : tous les fonds sont reçus (reçus comptables, à 2 € près) et la réception n'a pas encore été confirmée au client.
  function fondsCompletsAConfirmer(d) {
    if (!d || d.archive || d.receptionFondsConfirmeeLe) return false;
    if (!d.fondsValidesLe && !(d.fondsRecus && typeof d.fondsRecus === 'object')) return false;
    return bilanFondsDossier(d).etat === 'complet';
  }

  function totalNotificationsPieces() {
    // Limité aux dossiers du collaborateur du poste, sauf pour l'administrateur (voir
    // « Collaborateur du poste ») : ce badge dit « il y a du nouveau POUR MOI ». Un dossier dont tous les fonds sont reçus
    // compte aussi, jusqu'à la confirmation au client (étude 05/10 : « une pastille de notification pour trouver le dossier ») —
    // il est en tête du Suivi, section « Nouveau ». Un dossier dont une donnée a changé dans Authentic (mise à jour à décider) compte pour 1 aussi
    // (étude 06/10 au soir : « une pastille de notification quand un dossier demande une mise à jour »).
    const global = !utilisateurPoste || estAdministrateur(utilisateurPoste);
    return dossiersDuPerimetre(dossiers, utilisateurPoste, global)
      .filter(d => !d.archive)
      .reduce((total, d) => total + ((d.piecesNotifications || []).length) + (fondsCompletsAConfirmer(d) ? 1 : 0) + (majsEnAttenteAuthentic(d).length ? 1 : 0), 0);
  }

  // Met à jour le badge numérique de la sidebar — appelée depuis render(), comme les autres
  // synthèses de portefeuille (renderKpisDashboard...). Masqué à zéro plutôt
  // qu'affiché à "0", cohérent avec les autres compteurs de l'outil.
  function majBadgeNotificationsSidebar() {
    const el = document.getElementById('badge-notif-suivi');
    if (!el) return;
    const n = totalNotificationsPieces();
    if (n > 0) {
      el.textContent = n > 99 ? '99+' : String(n);
      el.style.display = '';
    } else {
      el.style.display = 'none';
    }
    const lien = el.closest('.sidebar-link');
    if (lien) lien.classList.toggle('a-notif', n > 0);
    majPastilleMenuMobile();
  }

  // Prévient par email le collaborateur responsable qu'une ou plusieurs pièces viennent d'être
  // trouvées — un seul message par dossier par parcours, JAMAIS un par pièce (demandé explicitement
  // par l'étude : "grouper les notifications si plusieurs pièces trouvées en même temps"), ce que
  // le diff calculé dans verifierDossierLocal() donne déjà naturellement (toutes les pièces
  // nouvellement reçues lors de CE parcours arrivent ici en un seul appel). Fire-and-forget,
  // volontairement : un flux Power Automate indisponible ne doit jamais faire échouer la
  // vérification du dossier elle-même, qui a déjà eu lieu et a déjà mis à jour l'écran. Le serveur
  // lui-même n'envoie rien si l'envoi par email n'est pas activé (voir routes/notifications.js) —
  // pas de vérification redondante ici.
  async function notifierNouvellesPiecesTrouvees(d, cles) {
    try {
      // Chaque pièce part avec le chemin du fichier trouvé sur le NAS : le serveur en fait un lien
      // qui ouvre la pièce directement depuis le message Teams (voir server/src/liensPieces.js).
      const pieces = cles.map(cle => ({
        label: libelleNotificationPiece(d, cle),
        chemin: fichierTrouve(d, cle === CLE_NOTIF_OFFRE_PRET ? NAS_CLE_OFFRE : NAS_CLE_PIECE(cle))
      }));
      await fetchAvecAuth('/api/notifications/pieces-recues', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dossierId: d.id, dossierNom: libelleDossierAffiche(d), responsable: d.responsable || null, pieces })
      });
    } catch (e) {
      console.warn('Notification par email (pièces reçues) impossible :', e.message);
    }
  }

  // Notification navigateur/Windows (Notification API), opt-in — voir l'écran Réglages
  // (#reglages-notif-navigateur). Réglage PROPRE À CE POSTE (localStorage), pas un réglage partagé
  // de l'étude (parametresRepo) : la permission Notification elle-même est déjà propre au
  // navigateur, ça n'aurait aucun sens de la piloter depuis un réglage serveur commun à tout le
  // bureau. Ne se déclenche QUE si l'onglet n'est pas au premier plan (`document.hidden`) : sinon
  // ce serait un doublon pur avec le badge sidebar/l'indicateur Suivi/le tag sur la fiche, déjà
  // visibles à l'écran — c'est justement l'excès de redondance que l'étude a demandé d'éviter.
  const CLE_LOCALSTORAGE_NOTIF_NAVIGATEUR = 'claire-notif-navigateur';
  function notificationsNavigateurActivees() {
    try { return localStorage.getItem(CLE_LOCALSTORAGE_NOTIF_NAVIGATEUR) === '1'; } catch (e) { return false; }
  }
  // Icône des notifications Windows/Chrome (étude, 03/10 : « mettre le favicon ») : le logo de CLAIRE
  // en PNG 180 px déjà embarqué dans la page (lien apple-touch-icon d'index.html, data: URI). Pas
  // icone.svg : Chrome n'affiche pas une image SVG dans une notification. Aucun nouveau fichier à
  // servir, et pas de favicon PNG ajouté (voir CLAUDE.md, « icône de la barre des tâches »).
  function iconeNotificationClaire() {
    try {
      const lien = document.querySelector('link[rel="apple-touch-icon"]');
      const href = lien && lien.getAttribute('href');
      if (href) return href;
    } catch (e) { /* repli ci-dessous */ }
    return 'icone.svg';
  }
  function notifierNavigateurPieces(d, cles) {
    try {
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      if (!notificationsNavigateurActivees() || !document.hidden) return;
      const labels = cles.map(cle => libelleNotificationPiece(d, cle));
      new Notification('CLAIRE — Nouvelle(s) pièce(s) trouvée(s)', {
        body: `${libelleDossierAffiche(d)} : ${labels.join(', ')}`,
        icon: iconeNotificationClaire(),
        tag: 'claire-piece-' + d.id
      });
      noterVerificationPoste('notification-navigateur');
    } catch (e) {
      // Une Notification peut lever (permission révoquée entre-temps, navigateur non supporté...) —
      // jamais bloquant pour la vérification du dossier elle-même.
    }
  }

  let nasEtat = null; // { configure, racine, raison } — interrogé une fois au démarrage

  async function chargerEtatNas() {
    try {
      const reponse = await fetchAvecAuth('/api/nas/etat');
      nasEtat = reponse.ok ? await reponse.json() : { configure: false, raison: 'Serveur injoignable.' };
    } catch (e) {
      nasEtat = { configure: false, raison: e.message };
    }
    return nasEtat;
  }

  function nasDisponible() {
    return !!(nasEtat && nasEtat.configure);
  }

  // Chemin d'un fichier relativement à la RACINE du NAS (ce que les routes attendent), à partir
  // d'un chemin relatif au dossier client.
  function cheminNasComplet(d, cheminDansDossier) {
    const base = (d.nasDossier || '').replace(/[\\/]+$/, '');
    return base ? `${base}/${cheminDansDossier}` : cheminDansDossier;
  }

  // Où l'étude range l'avant-contrat SIGNÉ dans un dossier client (précisé par elle le
  // 19/09/2026) : à la RACINE du dossier, ou dans la rubrique « SRU » (« 8 - SRU », « 9 - SRU »…
  // selon le type d'affaire — voir l'arborescence dans CLAUDE.md). Jamais dans « AAE » : cette
  // rubrique-là contient les pièces constituées ENTRE le compromis et la vente (urbanisme,
  // entretien…), futures annexes de l'acte de vente — une première version de ce code y cherchait
  // l'avant-contrat, à tort. Seuls les DOSSIERS du chemin comptent, jamais le nom du fichier.
  // Séparateurs Windows et Unix acceptés : le chemin vient de path.relative() côté serveur, qui
  // écrit des antislashs sur un poste Windows.
  function segmentsDossier(chemin) {
    const segments = String(chemin || '').split(/[\\/]+/).filter(Boolean);
    segments.pop();
    return segments;
  }
  function estALaRacineDossier(chemin) {
    return String(chemin || '').length > 0 && segmentsDossier(chemin).length === 0;
  }
  var RE_RUBRIQUE_SRU = /\bSRU\b/i;
  function estDansRubriqueSRU(chemin) {
    return segmentsDossier(chemin).some(seg => RE_RUBRIQUE_SRU.test(seg));
  }
  function estEmplacementAvantContrat(chemin) {
    return estALaRacineDossier(chemin) || estDansRubriqueSRU(chemin);
  }

  // Choisit l'avant-contrat parmi les PDF d'un dossier NAS. Par ordre de confiance décroissant :
  //   1. le nom EXACT du PDF importé à la création (`d.compromisNomFichier`) — s'il existe en
  //      double, la copie à la racine ou sous SRU l'emporte ;
  //   2. un nom qui dit « compromis » puis « promesse », d'abord à la racine ou sous SRU, puis
  //      n'importe où — l'avant-contrat de la VENTE PRÉALABLE de l'acquéreur porte les mêmes mots
  //      mais est rangé ailleurs (rubrique Acquéreur), c'est l'emplacement qui les départage ;
  //   3. la rubrique SRU ne contenant qu'UN SEUL PDF : c'est lui, quel que soit son nom (la
  //      racine, elle, peut contenir n'importe quoi — pas de repli équivalent).
  // Tout ce qui n'est pas la méthode 1 est un repli à signaler à l'étude, jamais une certitude.
  // Fonction pure (liste `{nom, chemin}` en entrée), testable — voir tests/nas-avant-contrat.test.js.
  var RE_NOM_COMPROMIS = /compromis/i;
  var RE_NOM_PROMESSE = /promesse/i;

  // Jamais pris pour l'avant-contrat signé (étude 05/10) :
  //  - un nom qui dit « projet » ou « relecture » : souvent le projet d'acte, pas le compromis signé ;
  //  - un nom qui porte le nom d'un AUTRE dossier ou d'une autre personne : souvent la promesse ou le compromis de la
  //    vente préalable de l'acquéreur, rangé dans son dossier. « Autre personne » = un nom d'un autre dossier de CLAIRE
  //    (parties, nom du dossier), ou un mot écrit en capitales qui n'est ni une partie, ni le nom du dossier, ni un mot de
  //    l'adresse du bien ou des notaires, ni un mot d'usage (COMPROMIS, VENTE, AAE…).
  // Le fichier mémorisé (choisi à la main, ou lu à la création) n'est pas concerné : c'est un choix de l'étude.
  var RE_NOM_PROJET_AVANT_CONTRAT = /(?<![a-z])(projets?|relecture)(?![a-z])/;
  var MOTS_NON_NOMS_AVANT_CONTRAT = new Set(('compromis promesse promesses vente ventes vte unilaterale synallagmatique achat avant contrat '
    + 'signe signee signes signees signature copie aae sru scan scanne claire acte actes original originale definitif definitive final '
    + 'version annexe annexes avenant lot lots bien biens maison appartement terrain immeuble local garage parcelle cadastre '
    + 'les des dans pour par sur avec une aux mme mlle monsieur madame messieurs mesdames epoux epouse consorts consort indivision '
    + 'sci sarl sas scp selarl office etude notaire notaires maitre gossart blois pdf doc docx '
    + 'copro copropriete ssp seing prive authentique vendeur vendeurs acquereur acquereurs rdv '
    + 'janvier fevrier mars avril mai juin juillet aout septembre octobre novembre decembre').split(/\s+/));
  // Pure : les mots (≥ 3 lettres, sans accent, en minuscules) d'un texte.
  function motsNomAvantContrat(texte) {
    return normaliserPourRecherche(String(texte || '')).split(/[^a-z]+/).filter(m => m.length >= 3);
  }
  // Pure : ce qui désigne ce dossier (`propres`) et les noms des autres dossiers (`autres`), pour écarter un fichier qui
  // porte un autre nom. `tous` = tous les dossiers de CLAIRE (archivés compris).
  function contexteNomsAvantContrat(d, tous) {
    const nomsPartie = p => [p && p.nom, p && p.nomUsage, p && p.nomNaissance].filter(Boolean).join(' ');
    const propres = new Set([
      d && d.nom, d && d.adresseBien, d && d.bien && d.bien.adresse, d && d.notaireVendeur, d && d.notaireAcquereur,
      ...((d && d.parties) || []).map(p => nomsPartie(p) + ' ' + ((p && p.prenom) || ''))
    ].flatMap(motsNomAvantContrat));
    const autres = new Set();
    (tous || []).forEach(x => {
      if (!x || !d || x.id === d.id) return;
      [x.nom, ...(x.parties || []).map(nomsPartie)].flatMap(motsNomAvantContrat)
        .forEach(m => { if (!propres.has(m) && !MOTS_NON_NOMS_AVANT_CONTRAT.has(m)) autres.add(m); });
    });
    return { propres, autres };
  }
  // Pure : les noms étrangers au dossier que porte le nom du fichier ([] = aucun).
  function nomsEtrangersAvantContrat(nomFichier, contexte) {
    if (!contexte) return [];
    const nom = String(nomFichier || '').replace(/\.pdf$/i, '');
    const etrangers = new Set(motsNomAvantContrat(nom).filter(m => contexte.autres.has(m)));
    // Mots en capitales (un nom de famille, dans les usages de l'étude) qui ne sont pas ceux du dossier.
    nom.split(/[^A-Za-zÀ-ÖØ-öø-ÿ]+/).filter(t => t.length >= 3 && t === t.toUpperCase() && t !== t.toLowerCase())
      .forEach(t => motsNomAvantContrat(t).forEach(m => {
        if (!contexte.propres.has(m) && !MOTS_NON_NOMS_AVANT_CONTRAT.has(m)) etrangers.add(m);
      }));
    return [...etrangers];
  }
  // Pure : pourquoi ce fichier n'est jamais pris pour l'avant-contrat ('' = il peut l'être).
  function raisonExclusionAvantContrat(nomFichier, contexte) {
    if (RE_NOM_PROJET_AVANT_CONTRAT.test(normaliserPourRecherche(String(nomFichier || '')))) return 'projet';
    return nomsEtrangersAvantContrat(nomFichier, contexte).length ? 'autre-nom' : '';
  }

  // `contexte` (facultatif) : contexteNomsAvantContrat(d, dossiers) — sans lui, seuls « projet » et « relecture » écartent.
  function choisirAvantContratNas(fichiers, nomAttendu, contexte) {
    const tous = Array.isArray(fichiers) ? fichiers : [];
    const nomNormalise = f => normaliserNomPourMotif(String(f.nom || '')).toLowerCase();
    const bienPlace = f => estEmplacementAvantContrat(f.chemin);
    if (nomAttendu) {
      const cible = normaliserNomPourMotif(nomAttendu).toLowerCase();
      // Nom identique d'abord (« Compromis.pdf » ne doit pas être pris pour « Compromis signé Compromis.pdf »), puis nom contenu.
      const identiques = tous.filter(f => nomNormalise(f) === cible);
      const exacts = identiques.length ? identiques : tous.filter(f => nomNormalise(f).includes(cible));
      if (exacts.length) return { fichier: exacts.find(bienPlace) || exacts[0], methode: 'nom-exact' };
    }
    const liste = tous.filter(f => !raisonExclusionAvantContrat(f.nom, contexte));
    const parNom = liste.filter(f => RE_NOM_COMPROMIS.test(nomNormalise(f)))
      .concat(liste.filter(f => RE_NOM_PROMESSE.test(nomNormalise(f)) && !RE_NOM_COMPROMIS.test(nomNormalise(f))));
    const parNomBienPlace = parNom.find(bienPlace);
    if (parNomBienPlace) return { fichier: parNomBienPlace, methode: 'emplacement-nom' };
    if (parNom.length) return { fichier: parNom[0], methode: 'nom' };
    const dansSRU = liste.filter(f => estDansRubriqueSRU(f.chemin));
    if (dansSRU.length === 1) return { fichier: dansSRU[0], methode: 'sru-seul' };
    return { fichier: null, methode: null };
  }

  // Nom de l'avant-contrat que CLAIRE doit retrouver sur le NAS : le fichier choisi à la main sur la fiche (étude 05/10 : « permettre
  // de changer le compromis s'il n'a pas été bien rattaché », `d.compromisChoisiNas`, chemin depuis la racine du NAS — ignoré si le
  // dossier NAS relié a changé depuis), sinon le nom du PDF lu à la création (`d.compromisNomFichier`).
  function compromisChoisiValide(d) {
    const chemin = String((d && d.compromisChoisiNas) || '');
    const base = String((d && d.nasDossier) || '').replace(/[\\/]+$/, '');
    return chemin && base && chemin.startsWith(base + '/') ? chemin : '';
  }
  // Avant-contrat mémorisé, sauf s'il est désormais écarté (projet, relecture, autre nom — étude 05/10) sans avoir été choisi à
  // la main ni lu à la création : un projet retenu avant cette règle n'est plus ouvert, la recherche reprend.
  function compromisMemoriseValide(d) {
    const chemin = fichierTrouve(d, NAS_CLE_COMPROMIS);
    if (!chemin) return '';
    const nom = String(chemin).split(/[\\/]/).pop() || '';
    const attendu = nomCompromisAttendu(d);
    if (attendu && normaliserNomPourMotif(nom).toLowerCase() === normaliserNomPourMotif(attendu).toLowerCase()) return chemin;
    return raisonExclusionAvantContrat(nom, contexteNomsAvantContrat(d, dossiers)) ? '' : chemin;
  }
  function nomCompromisAttendu(d) {
    const choisi = compromisChoisiValide(d);
    if (choisi) return choisi.split(/[\\/]/).pop() || '';
    return (d && d.compromisNomFichier) || '';
  }

  // Liste les PDF du dossier NAS relié, sous-dossiers compris. Le parcours en largeur et les
  // plafonds vivent désormais côté serveur (voir server/src/nas.js) — la leçon déjà payée sur le
  // parcours en profondeur y est reprise telle quelle.
  async function listerFichiersNas(d) {
    const reponse = await fetchAvecAuth('/api/nas/fichiers?dossier=' + encodeURIComponent(d.nasDossier || ''));
    if (!reponse.ok) {
      const corps = await reponse.json().catch(() => ({}));
      throw new Error(corps.erreur || `erreur ${reponse.status}`);
    }
    const data = await reponse.json();
    return data.fichiers || [];
  }

  // Ouvre un PDF du NAS dans un nouvel onglet. Le type MIME est forcé côté serveur, ce qui règle
  // par construction le bug déjà rencontré une fois (contenu binaire affiché comme du texte quand
  // le `File` local n'avait pas de type reconnu).
  //
  // Bug corrigé : cette fonction faisait un `window.open()` DIRECT sur /api/nas/fichier — une
  // navigation ordinaire du navigateur, qui ne porte aucun en-tête `Authorization`. Le serveur la
  // rejetait donc systématiquement, et l'onglet n'affichait que le JSON
  // `{"erreur":"Authentification requise ou expirée."}` : jamais le PDF. Les octets sont désormais
  // récupérés par `fetchAvecAuth` (qui, elle, porte le jeton de session) puis présentés via une URL
  // d'objet locale.
  //
  // L'onglet est ouvert AVANT l'await, tant que le clic de l'utilisateur est encore actif :
  // ouvert après, il serait bloqué comme une fenêtre surgissante (même contrainte d'activation que
  // celle déjà documentée pour requestPermission).
  // `ongletOuvert` : un onglet déjà ouvert par l'appelant pendant le clic (quand il doit d'abord
  // chercher le fichier : ouvert après un await, l'onglet serait bloqué comme fenêtre surgissante).
  async function ouvrirFichierNas(cheminComplet, ongletOuvert) {
    if (!cheminComplet) {
      if (ongletOuvert) ongletOuvert.close();
      afficherToast("Ce fichier n'a pas encore été localisé — cliquez sur « Revérifier ».", 'OK', null);
      return;
    }
    const onglet = ongletOuvert || window.open('', '_blank');
    try {
      const reponse = await fetchAvecAuth('/api/nas/fichier?chemin=' + encodeURIComponent(cheminComplet));
      if (!reponse.ok) throw new Error('statut ' + reponse.status);
      const octets = await reponse.blob();
      const url = URL.createObjectURL(octets.type === 'application/pdf' ? octets : new Blob([octets], { type: 'application/pdf' }));
      if (onglet) onglet.location = url;
      else window.open(url, '_blank'); // onglet bloqué : dernière chance, sans garantie
      // L'onglet a besoin de l'URL le temps de charger le document ; la révoquer trop tôt donnerait
      // une page blanche.
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      if (onglet) onglet.close();
      afficherToast("Impossible d'ouvrir ce fichier depuis le NAS : " + e.message, 'OK', null);
    }
  }

  // Année la plus récente écrite dans un nom de fichier (« TF 2026.pdf », « Ramonage_2025-11 »…),
  // ou null. Seules les années plausibles comptent (2000 à l'an prochain) : un numéro de dossier
  // ou de parcelle à quatre chiffres ne doit pas passer pour une année. Le chemin complet peut être
  // fourni, seul le nom du fichier est lu (un dossier « Archives 2019 » ne dit rien du document).
  function anneeDansNomFichier(cheminOuNom) {
    const nom = String(cheminOuNom || '').split(/[\\/]/).pop();
    const max = new Date().getFullYear() + 1;
    let meilleure = null;
    for (const m of nom.matchAll(/(?<!\d)(20\d{2})(?!\d)/g)) {
      const a = Number(m[1]);
      if (a <= max && (meilleure === null || a > meilleure)) meilleure = a;
    }
    return meilleure;
  }

  // Parmi les fichiers qui correspondent à une même pièce, lequel retenir ? Celui dont le nom porte
  // l'année la plus récente — une pièce annuelle renouvelée (ramonage, entretien de chaudière, taxe
  // foncière) coexiste souvent avec la précédente dans le dossier, et c'est la nouvelle qui compte.
  // Stabilité : le fichier déjà retenu reste retenu tant qu'aucun candidat n'est STRICTEMENT plus
  // récent (sans ça, deux fichiers sans année échangeraient leur place au gré de l'ordre du
  // parcours, et la pièce changerait de fichier sans raison). Sans année nulle part : le premier
  // rencontré, comme avant. Fonction pure, testée.
  function choisirFichierPiece(candidats, cheminPrecedent) {
    const liste = (candidats || []).filter(c => c && c.chemin);
    if (!liste.length) return { chemin: null, annee: null };
    const avecAnnee = liste.map(c => ({ chemin: c.chemin, annee: anneeDansNomFichier(c.nom || c.chemin) }));
    const plusRecente = avecAnnee.reduce((max, c) => (c.annee !== null && (max === null || c.annee > max) ? c.annee : max), null);
    const precedent = cheminPrecedent ? avecAnnee.find(c => c.chemin === cheminPrecedent) : null;
    if (precedent && (plusRecente === null || (precedent.annee !== null && precedent.annee >= plusRecente))) return precedent;
    if (plusRecente === null) return precedent || avecAnnee[0];
    return avecAnnee.find(c => c.annee === plusRecente);
  }

  function fichierTrouve(d, cle) {
    return (d.fichiersTrouves || {})[cle] || null;
  }

  function memoriserFichierTrouve(d, cle, cheminComplet) {
    d.fichiersTrouves = d.fichiersTrouves || {};
    if (cheminComplet) d.fichiersTrouves[cle] = cheminComplet;
    else delete d.fichiersTrouves[cle];
  }

  // Charge un PDF du NAS dans pdf.js. Le serveur ne fait que servir les octets : toute l'analyse
  // (pages, titre de la page de garde, texte, OCR) reste côté client, exactement comme avant —
  // aucune dépendance PDF n'a été ajoutée au serveur.
  async function ouvrirPdfNas(cheminComplet) {
    const reponse = await fetchAvecAuth('/api/nas/fichier?chemin=' + encodeURIComponent(cheminComplet));
    if (!reponse.ok) throw new Error(`Lecture impossible (${reponse.status})`);
    const buffer = await reponse.arrayBuffer();
    return pdfjsLib.getDocument({ isEvalSupported: false, data: buffer, verbosity: (pdfjsLib.VerbosityLevel ? pdfjsLib.VerbosityLevel.ERRORS : 0) }).promise;
  }

  // Relie un dossier CLAIRE à un sous-dossier du NAS. Le serveur propose un rapprochement par NOM
  // (méthode choisie par l'étude, voir `rapprocherParNom` côté serveur) ; la liste complète reste
  // affichée pour corriger à la main — une proposition, jamais une décision.
  async function lierDossierLocal(id) {
    const d = dossiers.find(x => x.id === id);
    if (!d) return;
    if (!nasDisponible()) {
      await chargerEtatNas();
      if (!nasDisponible()) {
        afficherToast((nasEtat && nasEtat.raison) || "Aucun dossier NAS configuré sur le serveur.", 'OK', null);
        return;
      }
    }
    let data;
    try {
      const reponse = await fetchAvecAuth('/api/nas/dossiers?nom=' + encodeURIComponent(d.nom || ''));
      if (!reponse.ok) throw new Error(`erreur ${reponse.status}`);
      data = await reponse.json();
    } catch (e) {
      afficherToast('Lecture du NAS impossible : ' + e.message, 'OK', null);
      return;
    }
    if (!data.dossiers || data.dossiers.length === 0) {
      afficherToast('Aucun dossier trouvé à la racine configurée du NAS.', 'OK', null);
      return;
    }
    // Correspondance PARFAITE (tous les mots du nom du dossier retrouvés dans un seul dossier NAS,
    // voir rapprochementParfait côté serveur) : on relie directement, sans ouvrir la fenêtre de
    // choix — demandé par l'étude. Le lien reste défaisable par « Changer de dossier », et il est
    // journalisé comme tout autre rattachement. Jamais sur un simple « propose », qui n'est qu'un
    // meilleur candidat : se tromper de dossier ferait chercher les pièces d'une vente dans celles
    // d'une autre.
    if (data.parfait && data.parfait !== d.nasDossier && !dossierNasPrisParUnAutre(d, data.parfait)) {
      afficherToast(`Dossier NAS « ${data.parfait} » relié automatiquement (correspondance exacte du nom).`, 'OK', null);
      await definirDossierNas(id, data.parfait);
      return;
    }
    ouvrirChoixDossierNas(d, data.dossiers, data.propose);
  }

  // Pure : le dossier NAS est déjà relié à un AUTRE dossier en cours (étude 07/10, deux dossiers du même
  // nom de famille) — jamais relié seul une seconde fois : les pièces d'une vente iraient à l'autre.
  // Le choix à la main reste possible (fenêtre de choix).
  function dossierNasPrisParUnAutre(d, nomNas, liste) {
    return (liste || dossiers || []).some(x => x && x !== d && x.id !== (d && d.id) && !x.archive && x.nasDossier === nomNas);
  }

  // Dossiers pour lesquels une liaison automatique a déjà été tentée dans CETTE session : sans ce
  // garde-fou, la passe périodique (toutes les 5 min) relancerait une requête par dossier non
  // relié à chaque tour, pour un résultat qui ne change pas.
  const tentativesLiaisonNasAuto = new Set();

  // Relie le dossier au NAS sans aucun clic — demandé par l'étude (« éviter le clic pour la
  // liaison au NAS »). SILENCIEUSE et sans fenêtre de choix : elle ne relie que sur une
  // correspondance PARFAITE (tous les mots significatifs du nom retrouvés dans un seul dossier
  // NAS, voir rapprochementParfait côté serveur), et ne fait rien du tout sinon. Se tromper de
  // dossier ferait chercher les pièces d'une vente dans celles d'une autre : c'est la seule
  // certitude sur laquelle on accepte de décider à la place de l'étude. Sans correspondance
  // parfaite, le bouton « Relier un dossier du NAS » reste là, inchangé.
  async function lierDossierNasAutomatique(id) {
    const d = dossiers.find(x => x.id === id);
    if (!d || d.nasDossier || tentativesLiaisonNasAuto.has(id)) return false;
    tentativesLiaisonNasAuto.add(id);
    if (!nasDisponible()) return false;
    try {
      const reponse = await fetchAvecAuth('/api/nas/dossiers?nom=' + encodeURIComponent(d.nom || ''));
      if (!reponse.ok) return false;
      const data = await reponse.json();
      if (!data.parfait || dossierNasPrisParUnAutre(d, data.parfait)) return false;
      await definirDossierNas(id, data.parfait);
      afficherToast(`Dossier NAS « ${data.parfait} » relié automatiquement.`, 'OK', null);
      return true;
    } catch (e) {
      return false; // NAS injoignable : on réessaiera à la prochaine ouverture de l'outil.
    }
  }

  // Applique le choix, puis relance une vérification complète — même remise à zéro qu'avant : les
  // statuts d'un dossier NAS précédent ne valent plus rien pour un autre.
  async function definirDossierNas(id, chemin) {
    const d = dossiers.find(x => x.id === id);
    if (!d || !chemin) return;
    const etaitDejaLie = d.dossierLie;
    d.nasDossier = chemin;
    d.dossierLie = true;
      // Remis à zéro à CHAQUE lien (pas seulement le premier) : changer de dossier lié doit
      // relancer une recherche complètement fraîche, sans conserver les statuts "reçue"/
      // "manquante" de l'ancien dossier — sans quoi une pièce marquée reçue dans l'ancien
      // dossier restait affichée comme telle après avoir choisi un nouveau dossier qui ne la
      // contient peut-être pas. "Aucun document" (rouge)/"inconnu" (prêt) reflètent ce point de
      // départ pessimiste, corrigés dès que le scan ci-dessous retrouve quelque chose. Sans
      // effet sur les pièces pour un rôle participant, qui ne suit pas cette checklist (voir
      // statutDossier).
      d.offrePretStatut = 'inconnu';
      d.montantPret = null;
      d.garantiesPret = []; // lues dans l'offre de l'ancien dossier : elles ne valent plus rien ici
      d.mobilierLuLe = null; // l'avant-contrat du nouveau dossier pourra être relu
    // Pièces personnalisées cochées à la main avant que le drapeau piecesValideesManuellement ne
    // leur soit posé (voir basculerStatutPiecePersonnalisee) : reçues sans fichier mémorisé. À
    // relever AVANT de vider d.fichiersTrouves juste en dessous.
    const personnaliseesCocheesMain = (d.piecesPersonnalisees || [])
      .filter(p => (d.pieces || {})[p.cle] === 'recue' && !fichierTrouve(d, NAS_CLE_PIECE(p.cle)))
      .map(p => p.cle);
    // Les fichiers deja localises pointaient vers l'ANCIEN dossier : tout repart de zero, y
    // compris le compromis (jamais rescanne automatiquement — voir ouvrirCompromisTrouve()).
    d.fichiersTrouves = {};
    if (d.roleNotaire !== 'participant') {
      // Une pièce validée à la main ne dépend d'AUCUN dossier NAS (elle vit dans Authentic, ou
      // sur papier) : changer de dossier relié ne doit pas défaire cette décision.
      const valideesMain = new Set((d.piecesValideesManuellement || []).concat(personnaliseesCocheesMain));
      d.pieces = {};
      checklistPieces(d.typeVente, d).forEach(p => {
        d.pieces[p.cle] = valideesMain.has(p.cle) ? 'recue' : 'manquante';
      });
    }
    ajouterHistorique(d, etaitDejaLie
      ? `Dossier NAS relié modifié : ${chemin}`
      : `Dossier NAS relié : ${chemin}`);
    await sauvegarder(d);
    render();
    await verifierDossierLocal(id, true);
  }

  // Petite fenêtre de choix, sur le patron .confirm-overlay déjà utilisé partout ailleurs dans
  // l'outil (confirmation, À propos, info) plutôt qu'un second système de fenêtre modale. La liste
  // complète reste affichée même quand un rapprochement est proposé : c'est une proposition, pas
  // une décision — se tromper de dossier ferait chercher les pièces d'une vente dans celles d'une
  // autre.
  function ouvrirChoixDossierNas(d, nomsNas, propose) {
    const overlay = document.getElementById('nas-choix-overlay');
    const liste = document.getElementById('nas-choix-liste');
    const intro = document.getElementById('nas-choix-intro');
    if (!overlay || !liste) return;
    if (intro) {
      intro.textContent = propose
        ? `Dossier proposé pour « ${libelleDossierAffiche(d)} » d'après son nom — corrigez si ce n'est pas le bon.`
        : `Aucun rapprochement évident avec « ${libelleDossierAffiche(d)} » : choisissez le dossier client sur le NAS.`;
    }
    // Le dossier proposé (et celui déjà relié) passent EN TÊTE de liste — demandé par l'étude :
    // les marquer sans les remonter obligeait à les chercher au milieu de centaines d'entrées.
    const rang = (nom) => (nom === d.nasDossier ? 0 : (nom === propose ? 1 : 2));
    const ordonnes = nomsNas.slice().sort((a, b) => rang(a) - rang(b) || a.localeCompare(b, 'fr'));
    choixDossierNasEnCours = { dossierId: d.id, noms: ordonnes, propose, actuel: d.nasDossier || null };
    const recherche = document.getElementById('nas-choix-recherche');
    if (recherche) recherche.value = '';
    renderChoixDossierNas('');
    overlay.style.display = 'flex';
    if (recherche) recherche.focus();
  }

  // Liste et filtre de la fenêtre de choix du dossier NAS. L'état vit ici plutôt que dans le DOM :
  // filtrer reconstruit la liste, il faut donc garder les noms complets quelque part.
  let choixDossierNasEnCours = null;

  function renderChoixDossierNas(filtre) {
    const liste = document.getElementById('nas-choix-liste');
    if (!liste || !choixDossierNasEnCours) return;
    const { dossierId, noms, propose, actuel } = choixDossierNasEnCours;
    // Insensible aux accents et à la casse, comme la recherche de dossiers du Suivi.
    const cible = normaliserPourRecherche(filtre || '');
    const visibles = cible ? noms.filter(n => normaliserPourRecherche(n).includes(cible)) : noms;
    if (visibles.length === 0) {
      liste.innerHTML = '<p class="nas-choix-vide">Aucun dossier du NAS ne correspond à cette recherche.</p>';
      return;
    }
    liste.innerHTML = visibles.map(nom => {
      const marque = nom === actuel ? 'actuel' : (nom === propose ? 'proposé' : '');
      return `<button type="button" class="nas-choix-item${marque ? ' ' + (marque === 'actuel' ? 'actuel' : 'propose') : ''}"`
        + ` onclick="fermerChoixDossierNas(); definirDossierNas('${escapeOnclickArg(dossierId)}', '${escapeOnclickArg(nom)}')">`
        + `<span class="nas-choix-nom">${escapeHtml(nom)}</span>`
        + (marque ? `<span class="nas-choix-marque">${marque}</span>` : '')
        + `</button>`;
    }).join('');
  }

  function filtrerChoixDossierNas(valeur) {
    renderChoixDossierNas(valeur);
  }

  function fermerChoixDossierNas() {
    const overlay = document.getElementById('nas-choix-overlay');
    if (overlay) overlay.style.display = 'none';
    choixDossierNasEnCours = null;
  }

  // Changer de dossier réutilise lierDossierLocal : la même fenêtre de choix, où le dossier
  // actuellement relié est marqué comme tel.
  async function changerDossierLocal(id) {
    await lierDossierLocal(id);
  }

  // Plafond appliqué à chaque PDF individuel lors du parcours d'un dossier local relié (offre de
  // prêt, pièces) : identique à celui déjà retenu pour le compromis lui-même (PLAFOND_SECURITE dans
  // extraireTextesUtiles) plutôt qu'un chiffre arbitraire à part. Les 15 pages retenues jusqu'ici
  // ne couvraient pas certains documents réels (ex. un DDT ou un dossier d'urbanisme scanné en un
  // seul PDF de plusieurs dizaines de pages) — signalé par l'étude, pièces bien présentes non
  // détectées.
  const PLAFOND_PAGES_VERIFICATION = 60;
  // Repli OCR sur plusieurs pages (pas seulement la première) quand un PDF scanné n'a aucun texte
  // extractible : un document scanné place parfois son intitulé après une page de garde. Même
  // principe que le repli déjà utilisé pour la date de signature du compromis (traiterFichierPdf),
  // borné pour ne pas ralentir le parcours de tout un dossier local.
  const PAGES_OCR_VERIFICATION = 3;
  // Relecture d'actes (Outil 2, voir lireTextePdfParPage juste en dessous) : AUCUNE limite de
  // pages, ni pour la lecture du texte ni pour le repli OCR — demandé explicitement par l'étude
  // (« ne mets pas de limite de 60 pages, aucune limite »). La vérification des pièces du NAS garde,
  // elle, ses plafonds (PLAFOND_PAGES_VERIFICATION, PAGES_OCR_VERIFICATION) : elle ne fait que
  // RECONNAÎTRE un document, alors que la relecture doit en ANALYSER chaque page — une annexe
  // coupée en deux produirait un « absent » faux. Coût assumé : jusqu'à ~30 s/page d'OCR
  // (DELAI_MAX_OCR) sur un document entièrement scanné.

  // Texte utile d'un PDF du dossier local relié, avec repli OCR s'il n'a aucun texte extractible
  // (scan/image) : partagé par verifierDossierLocal(), qui n'a plus qu'à tester l'offre de prêt
  // et les pièces encore manquantes contre le texte renvoyé.
  async function lireTextePdfVerification(pdf) {
    let texte = '';
    for (let p = 1; p <= Math.min(pdf.numPages, PLAFOND_PAGES_VERIFICATION); p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      texte += content.items.map(it => it.str).join(' ') + '\n';
    }
    if (texte.trim().length < 40) {
      const workerVerif = await creerWorkerOcr();
      if (workerVerif) {
        try {
          let texteOcr = '';
          for (let p = 1; p <= Math.min(pdf.numPages, PAGES_OCR_VERIFICATION); p++) {
            texteOcr += (await ocrPage(pdf, p, workerVerif)) + '\n';
          }
          texte = texteOcr;
        } finally {
          await workerVerif.terminate();
        }
      }
    }
    return texte;
  }

  // Variante page par page de lireTextePdfVerification(), pour la relecture d'actes (Outil 2) :
  // chaque constat doit citer une PAGE précise de n'importe quel document fourni. Lit TOUTES les
  // pages, texte comme OCR (aucune limite, voir le commentaire ci-dessus), mémorise la position de
  // chaque page dans le texte joint, et un résumé de couverture (pagesLues/pagesTotal/viaOcr/
  // tronque) — `tronque` ne peut plus être vrai que si une page est illisible, jamais par plafond.
  // lireTextePdfVerification() n'est pas touchée : la vérification d'un dossier du NAS garde ses
  // plafonds et son temps de traitement.
  async function lireTextePdfParPage(pdf) {
    const pagesTotal = pdf.numPages;
    const textes = [];
    for (let p = 1; p <= pagesTotal; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      textes.push(content.items.map(it => it.str).join(' '));
    }
    // OCR page par page, seulement pour les pages sans texte : un PDF mixte (acte tapé, annexes scannées) envoyait ses
    // annexes vides (audit 12/10).
    let viaOcr = false;
    const vides = textes.map((t, i) => (t.trim().length < 40 ? i : -1)).filter(i => i >= 0);
    if (vides.length) {
      const workerVerif = await creerWorkerOcr();
      if (workerVerif) {
        try {
          for (const i of vides) {
            const lu = await ocrPage(pdf, i + 1, workerVerif);
            if (String(lu || '').trim().length > textes[i].trim().length) { textes[i] = lu; viaOcr = true; }
          }
        } finally {
          await workerVerif.terminate();
        }
      }
    }
    let texte = '';
    const pages = [];
    textes.forEach((t, i) => {
      const debut = texte.length;
      texte += t + '\n';
      pages.push({ numero: i + 1, debut, fin: texte.length });
    });
    const pagesLues = pages.length;
    return { texte, pages, pagesLues, pagesTotal, viaOcr, tronque: pagesLues < pagesTotal };
  }

  // Retour la page (1-indexée) contenant l'index donné dans un texte construit par
  // lireTextePdfParPage() — pendant analogue à pageDepuisIndex() (compromis en cours d'import) mais
  // pour n'importe quel document d'Outil 2. Repli sur la dernière page connue si l'index dépasse
  // (troncature du texte avant envoi au modèle, voir lancerAuditActe) plutôt qu'un numéro inventé.
  function pageDepuisIndexPages(pages, index) {
    if (!Array.isArray(pages) || pages.length === 0 || index == null || index < 0) return null;
    for (const p of pages) {
      if (index >= p.debut && index < p.fin) return p.numero;
    }
    return pages[pages.length - 1].numero;
  }

  // Lecture d'un PDF en RESTITUANT SES LIGNES, pour le générateur d'appel de fonds.
  //
  // Les deux lecteurs ci-dessus joignent tous les items d'une page par une espace : le texte qu'ils
  // rendent n'a qu'UN retour à la ligne PAR PAGE (piège déjà payé ailleurs dans ce fichier, voir
  // RE_TITRE_PARTIE_SUIVANTE). C'est sans conséquence pour eux — ils cherchent des mots-clés dans
  // un texte continu — mais le décompte d'un confrère est un TABLEAU : parserDecompteConfrere
  // travaille ligne par ligne, et recevait donc une seule ligne géante où plus rien ne
  // correspondait. C'est la cause du « aucune ligne de décompte reconnue » sur un PDF pourtant
  // parfaitement lisible.
  //
  // Les lignes sont reconstruites depuis la position VERTICALE de chaque item (transform[5], la
  // translation Y de la matrice de rendu) : deux items à la même hauteur appartiennent à la même
  // ligne du tableau. La tolérance est dérivée de la hauteur du texte lui-même plutôt que fixée en
  // dur — un décompte mélange couramment plusieurs corps de police, et un seuil absolu couperait
  // en deux une ligne écrite plus grand que les autres.
  var TOLERANCE_LIGNE_PDF = 0.6;

  // Regroupe les items pdf.js en lignes (par position verticale), chaque ligne gardant ses items
  // triés de gauche à droite avec leur abscisse — pour les lecteurs qui ont besoin de la COLONNE
  // d'un nombre (relevé de compte : Débit ou Crédit). Pure.
  function lignesAvecPositionsDepuisItems(items) {
    return grouperItemsPdfEnLignes(items).map(l => ({
      y: l.y,
      items: l.items.sort((a, b) => a.x - b.x),
      texte: l.items.map(i => i.str).join(' ').replace(/\s{2,}/g, ' ').trim()
    })).filter(l => l.texte);
  }

  function lignesDepuisItemsPdf(items) {
    return lignesAvecPositionsDepuisItems(items).map(l => l.texte);
  }

  function grouperItemsPdfEnLignes(items) {
    const utiles = (items || []).filter(it => it && typeof it.str === 'string' && it.str.trim());
    const lignes = [];
    utiles.forEach(it => {
      const t = it.transform || [];
      const y = Number(t[5]) || 0;
      const x = Number(t[4]) || 0;
      const hauteur = Math.abs(Number(it.height) || Number(t[3]) || 10) || 10;
      const marge = Math.max(2, hauteur * TOLERANCE_LIGNE_PDF);
      let ligne = null;
      for (const l of lignes) {
        if (Math.abs(l.y - y) <= Math.max(marge, l.marge)) { ligne = l; break; }
      }
      if (!ligne) { ligne = { y, marge, items: [] }; lignes.push(ligne); }
      ligne.marge = Math.max(ligne.marge, marge);
      ligne.items.push({ x, str: it.str });
    });
    // Y décroît vers le bas de la page en coordonnées PDF : on lit donc du plus grand au plus
    // petit pour retrouver l'ordre de lecture.
    lignes.sort((a, b) => b.y - a.y);
    return lignes;
  }

  async function lireTextePdfEnLignes(pdf) {
    const lignes = [];
    for (let p = 1; p <= Math.min(pdf.numPages, PLAFOND_PAGES_VERIFICATION); p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      lignesDepuisItemsPdf(content.items).forEach(l => lignes.push(l));
    }
    return lignes.join('\n');
  }

  // Retour visuel pendant le parcours du dossier local (peut prendre plusieurs secondes sur un
  // dossier volumineux/beaucoup de PDF/repli OCR) : sans ça, le bouton restait silencieux jusqu'au
  // résultat final, ce qui pouvait laisser croire à un clic sans effet — signalé par l'étude.
  // render() (appelé à la fin de verifierDossierLocal dans tous les cas) remplace de toute façon ce
  // bouton par un rendu à jour, donc pas besoin de remettre son texte d'origine ici si tout se
  // passe bien ; seul le cas où le bouton n'existe plus dans le DOM au moment du clic (rare) est à
  // ignorer sans casser l'appel.
  async function verifierDossierLocalDepuisBouton(id, btn) {
    if (btn) { btn.disabled = true; btn.innerHTML = `${icone('spinner', null, true)} Recherche…`; }
    await verifierDossierLocal(id, true);
  }

  // Fusion de deux anciennes fonctions (verifierOffrePret()/verifierPiecesDossier()) en UN SEUL
  // parcours du dossier local relié, qui teste l'offre de prêt ET les pièces encore manquantes
  // pendant le même passage — signalé par l'étude : trouver l'offre de prêt tôt dans le parcours
  // (ex. premier fichier lu) arrêtait la recherche avant d'avoir eu la moindre chance de reconnaître
  // les pièces d'urbanisme se trouvant plus loin dans l'arborescence, alors que les deux documents
  // se trouvent dans le même dossier local relié. Le parcours ne s'arrête plus tôt que si tout ce
  // qu'on cherche (offre comprise) est déjà résolu, ou si le dossier est entièrement parcouru.
  // Une seule vérification à la fois par dossier dans cette fenêtre : le tour automatique, la
  // détection d'un nouveau document et un rangement de scan pouvaient relire le même dossier en
  // même temps — chacune voyait la pièce « manquante » avant l'autre et la notifiait (étude, 30/09 :
  // deux notifications Teams pour le même certificat). Un appel pendant qu'une vérification tourne
  // attend simplement la même.
  var verificationsDossierEnCours = new Map();
  function verifierDossierLocal(id, viaClicUtilisateur) {
    if (verificationsDossierEnCours.has(id)) return verificationsDossierEnCours.get(id);
    const p = verifierDossierLocalUneFois(id, viaClicUtilisateur).finally(() => verificationsDossierEnCours.delete(id));
    verificationsDossierEnCours.set(id, p);
    return p;
  }

  // Formes de noms décidées et fichiers écartés : relus avant un parcours du NAS, au plus une fois par minute. Ils ne se chargeaient
  // qu'au démarrage de la fenêtre : une fenêtre restée ouverte pendant que l'étude validait une forme dans « Noms de fichiers du NAS »
  // ne la connaissait pas, et son parcours suivant repassait à « manquante » la pièce que l'autre fenêtre venait de cocher
  // (« Courrier réponse assainissement » cochée puis « devenue introuvable » toutes les 20 min, étude 05/10).
  var derniereRelectureReconnaissanceNom = 0;
  async function rafraichirReconnaissanceNom() {
    if (Date.now() - derniereRelectureReconnaissanceNom < 60000) return;
    derniereRelectureReconnaissanceNom = Date.now();
    await Promise.all([chargerFormesNoms(), chargerExclusionsMotifNom()]);
  }

  // Pure : le fichier est-il dans le sous-dossier « Constitution » (courriers de l'office préparés par CLAIRE) ?
  function cheminCourrierEnvoyeNas(chemin) {
    return String(chemin || '').split(/[\\/]/).slice(0, -1).some(seg => normaliserPourRecherche(seg).trim() === 'constitution');
  }

  async function verifierDossierLocalUneFois(id, viaClicUtilisateur) {
    const d = dossiers.find(x => x.id === id);
    if (!d || !d.dossierLie || !d.nasDossier) return;
    // Dossier archivé : terminé, aucune pièce à y chercher sur le commun (étude 07/10), quel que soit le chemin qui le demande
    // (email reçu, scan rangé, bouton de la fiche, relecture des formes de noms).
    if (d.archive) return;
    await rafraichirReconnaissanceNom();
    // Achat comptant (sans prêt) : rien à chercher côté offre, seul le nom de la fonction reste
    // générique. Notaire participant/concourant : la checklist de pièces ne le concerne pas (voir
    // renderCarteDossier/statutDossier) — inutile de tester quoi que ce soit dessus.
    const chercherOffre = !d.sansPret;
    const chercherPieces = d.roleNotaire !== 'participant';
    if (!chercherOffre && !chercherPieces) return;

    const checklist = chercherPieces ? checklistPieces(d.typeVente, d) : [];
    d.pieces = d.pieces || {};
    // Instantané AVANT le parcours (voir notifierNouvellesPiecesTrouvees plus bas) : un simple
    // objet copié, jamais la même référence que d.pieces qui va être modifiée juste en dessous.
    const piecesAvant = Object.assign({}, d.pieces);
    // TOUTES les pièces sont recherchées à chaque parcours, y compris celles déjà "reçues" —
    // sinon une pièce dont le fichier a été supprimé, déplacé ou renommé sur le NAS restait
    // "reçue" pour toujours, plus aucun scan ne la revérifiant (signalé par l'étude). Ne coûte
    // rien : depuis que la checklist est reconnue par le seul NOM de fichier, une pièce déjà
    // trouvée se re-teste sans ouvrir le moindre PDF.
    // Une pièce validée à la main (voir validerPieceManuellement) est détenue par l'étude AILLEURS
    // que sur le NAS — dans Authentic (Fichorga) le plus souvent : une réponse SAFER, par exemple.
    // Le parcours ne doit donc ni la chercher, ni la repasser à "manquante" faute de l'y trouver,
    // ce qui reviendrait à défaire une décision humaine à chaque tour automatique. Demandé
    // explicitement par l'étude.
    const validees = new Set(d.piecesValideesManuellement || []);
    // Une pièce PERSONNALISÉE cochée à la main reste cherchée : si un fichier à son nom apparaît,
    // il devient ouvrable depuis la fiche. Elle est seulement protégée de la remise à « manquante »
    // (voir plus bas).
    const aChercher = new Set(checklist.filter(p => p.personnalisee || !validees.has(p.cle)).map(p => p.cle));
    const fichierParPiece = {};
    const candidatsParPiece = {};
    const exclusionsRencontrees = [];

    // Un clic explicite sur « Revérifier » repart de zéro : la mémoire des PDF écartés pour
    // l'offre est oubliée pour CE dossier, et aucun budget ne s'applique (voir leur déclaration).
    if (viaClicUtilisateur) delete pdfEcartesPourOffre[id];
    const pdfEcartes = pdfEcartesPourOffre[id] || (pdfEcartesPourOffre[id] = new Set());
    const cheminsNouveaux = (d.nasNouveaute && Array.isArray(d.nasNouveaute.fichiers)) ? d.nasNouveaute.fichiers : [];

    let offreTrouvee = false;
    let offreAConfirmer = false; // trouvée par son titre, mais sans confirmation du modèle local
    // Vrai si le budget d'ouvertures du tour automatique s'est épuisé avant d'avoir pu examiner
    // tous les candidats : l'offre n'a alors pas été « cherchée et non trouvée », elle n'a pas été
    // cherchée jusqu'au bout — son statut ne doit surtout pas basculer sur « manquante ».
    let parcoursEcourte = false;
    let fichierOffre = null;
    let nbAnalyses = 0; // fichiers réellement ouverts (lus par pdf.js) — seuls les candidats offre
    let nbFichiersRencontres = 0;
    // Journal du parcours (voir dernierDiagnosticParcours/renderDiagnosticParcours) : une ligne par
    // événement notable, jamais une par fichier rencontré — illisible sur un dossier de plusieurs
    // centaines de PDF, et sans rien ajouter au compteur global. Jamais d'extrait du TEXTE d'un PDF
    // ici : uniquement des noms de fichiers, déjà visibles par l'étude dans son explorateur.
    const diagnosticJournal = [];

    let fichiers;
    try {
      fichiers = await listerFichiersNas(d);
    } catch (e) {
      console.error('Lecture du dossier NAS impossible', e);
      if (viaClicUtilisateur) afficherToast('Lecture du dossier NAS impossible : ' + e.message, 'OK', null);
      dernierDiagnosticParcours[id] = {
        horodatage: new Date().toISOString(), journal: [],
        resume: { erreur: `Le serveur n'a pas pu lire « ${d.nasDossier} » sur le NAS : ${e.message}` }
      };
      render();
      return;
    }

    for (const fichier of fichiers) {
      // Plus de sortie anticipée une fois toutes les pièces trouvées : il faut voir TOUS les
      // fichiers pour repérer une version plus récente d'une pièce déjà trouvée. Sans coût réel,
      // les pièces n'étant reconnues que par le nom (aucun PDF ouvert pour elles).
      if (chercherOffre && offreTrouvee && aChercher.size === 0) break; // plus rien à chercher du tout
      nbFichiersRencontres++;
      const cheminComplet = cheminNasComplet(d, fichier.chemin);
      // Nom normalisé (underscores/tirets → espaces, accents recomposés en NFC) avant tout test de
      // motif : un vrai nom de fichier de l'étude ne s'écrit pas comme une regex française.
      const nomNormalise = normaliserNomPourMotif(fichier.nom);
      // Les courriers ENVOYÉS par l'étude (sous-dossier « Constitution », relecture 0.283.0) ne sont jamais une pièce reçue :
      // « Péril, mise en sécurité, insalubrité - BLOIS - VTE - X.pdf » cochait « Non péril » dès la demande partie. Seul le plan
      // cadastral qui y est rangé avec eux compte (c'est bien le plan).
      const courrierEnvoye = cheminCourrierEnvoyeNas(fichier.chemin);

      // Offre de prêt : nombre de pages, puis TITRE de la page de garde, puis confirmation par le
      // modèle IA local — voir MIN_PAGES_OFFRE_PRET pour le pourquoi de chacun des trois filtres.
      // Le PDF n'est ouvert que tant que l'offre n'a pas été trouvée.
      // Le budget et la mémoire ne concernent que les tours automatiques : un clic explicite
      // ouvre tout ce qu'il faut, aussi longtemps qu'il faut.
      const prioritaire = !viaClicUtilisateur && pdfPrioritairePourOffre(nomNormalise, fichier.chemin, cheminsNouveaux);
      if (chercherOffre && !offreTrouvee && !pdfEcartes.has(fichier.chemin) &&
          (viaClicUtilisateur || prioritaire || budgetOuverturesTourAuto > 0)) {
        if (!viaClicUtilisateur && !prioritaire) budgetOuverturesTourAuto--;
        try {
          nbAnalyses++;
          const pdf = await ouvrirPdfNas(cheminComplet);
          if (pdf.numPages < MIN_PAGES_OFFRE_PRET) {
            // Écarté sans rien lire d'autre : une offre de prêt fait au moins une dizaine de
            // pages, un document d'une ou deux pages n'en est jamais une. Ce filtre s'applique aux
            // DEUX voies de reconnaissance ci-dessous, y compris quand le nom du fichier est
            // parfaitement explicite — demandé ainsi par l'étude (« toujours pour ceux de plus de
            // 6 pages »).
            pdfEcartes.add(fichier.chemin);
            diagnosticJournal.push(`${fichier.nom} → écarté pour l'offre (${pdf.numPages} page${pdf.numPages > 1 ? 's' : ''}, minimum ${MIN_PAGES_OFFRE_PRET})`);
          } else {
            // Deux voies, dans cet ordre (demandé par l'étude après avoir vu les deux méthodes
            // échouer chacune de son côté — voir l'historique de OFFRE_PRET_RE dans CLAUDE.md,
            // passée du contenu seul au nom seul puis au titre seul) :
            //   1. le NOM du fichier dit « offre de prêt » / « offre de crédit » / … → validé, sans
            //      lire le contenu ni solliciter le modèle : un collaborateur qui nomme ainsi un
            //      fichier a déjà fait le travail d'identification ;
            //   2. sinon (nom muet ou ambigu) → TITRE de la page de garde, puis confirmation par
            //      le modèle IA local, comme avant.
            const nomDitOffre = nomDitOffrePret(nomNormalise);
            let titre = '';
            let reconnu = nomDitOffre;
            let parLeNom = nomDitOffre;
            if (!reconnu) {
              const page1 = await pdf.getPage(1);
              const contenu = await page1.getTextContent();
              titre = titrePagePdf(contenu.items.map(it => it.str).join(' '));
              reconnu = OFFRE_PRET_RE.test(titre);
              if (!reconnu) {
                pdfEcartes.add(fichier.chemin);
                diagnosticJournal.push(`${fichier.nom} → ni le nom du fichier ni le titre de la page de garde n'évoquent une offre de prêt`);
              }
            }
            if (reconnu) {
              // Le modèle n'est sollicité que sur la voie « contenu » : quand le nom du fichier
              // l'annonce, il n'y a pas de doute à lever, et faire dépendre ce cas d'un modèle
              // absent ferait retomber en « à confirmer » un document parfaitement identifié.
              const confirmation = parLeNom
                ? { disponible: true, estOffrePret: true, raison: '' }
                : await confirmerOffrePretIa(titre);
              if (confirmation.disponible && !confirmation.estOffrePret) {
                pdfEcartes.add(fichier.chemin);
                diagnosticJournal.push(`${fichier.nom} → titre proche, mais écarté par le modèle local${confirmation.raison ? ' : ' + confirmation.raison : ''}`);
              } else {
                offreTrouvee = true;
                fichierOffre = fichier.nom;
                // Sans confirmation possible (modèle absent ou en panne), le document n'est pas
                // déclaré reçu d'office : il passe en « à confirmer », statut distinct que l'étude
                // tranche elle-même en ouvrant le fichier — choix explicite de sa part.
                offreAConfirmer = !confirmation.disponible;
                diagnosticJournal.push(parLeNom
                  ? `${fichier.nom} → offre de prêt reconnue au nom du fichier`
                  : offreAConfirmer
                    ? `${fichier.nom} → offre de prêt probable (titre de page de garde reconnu), à confirmer : ${confirmation.raison || 'modèle local indisponible'}`
                    : `${fichier.nom} → offre de prêt confirmée (titre de page de garde + modèle local)`);
                memoriserFichierTrouve(d, NAS_CLE_OFFRE, cheminComplet);
                // Le PDF est déjà ouvert : on en profite pour lire le montant emprunté (apport) et
                // les garanties du prêt. Best-effort, et jamais d'écrasement par un échec : une
                // valeur déjà connue est conservée si une revérification ne la retrouve pas.
                // Lecture à LIGNES (lireTextePdfEnLignes, reconstruites depuis la position
                // verticale des items) et non lireTextePdfVerification, qui joint tous les items
                // d'une page par une espace : ce dernier ne produit QU'UN SEUL retour à la ligne
                // PAR PAGE, si bien que RE_TITRE_GARANTIES — ancrée en début de ligne — ne pouvait
                // matcher que si le mot « GARANTIES » ouvrait une page. Sur une offre réelle il est
                // au milieu d'une page : le paragraphe n'était donc JAMAIS trouvé, et comme un
                // échec de détection ne doit pas écraser une valeur déjà connue (voir juste en
                // dessous), une garantie lue à tort par une version antérieure restait affichée
                // indéfiniment. Même piège que celui déjà payé sur RE_TITRE_PARTIE_SUIVANTE et sur
                // le parseur de décompte : toute regex ancrée sur ^ ou \n est suspecte tant que le
                // texte ne porte pas de vraies lignes.
                const texte = await lireTextePdfEnLignes(pdf);
                const montant = detecterMontantPret(texte);
                if (montant) d.montantPret = montant;
                const garanties = detecterGarantiesPret(texte);
                if (garanties.length) d.garantiesPret = garanties;
              }
            }
          }
        } catch (e) {
          // Un PDF illisible (chiffré, corrompu, police exotique) ne doit jamais interrompre le
          // parcours : il est simplement écarté pour l'offre, les pièces continuent d'être testées
          // par leur nom de fichier juste en dessous.
          // Une lecture qui échoue n'est volontairement PAS mémorisée comme écartée : la cause
          // peut être passagère (NAS momentanément injoignable), et un fichier écarté pour de bon
          // sur un incident réseau ne serait plus jamais réexaminé de la session.
          console.error('Lecture impossible pour', fichier.nom, e);
          diagnosticJournal.push(`${fichier.nom} → lecture impossible (${e.message})`);
        }
      } else if (chercherOffre && !offreTrouvee && !pdfEcartes.has(fichier.chemin)) {
        // Budget du tour automatique épuisé : ce candidat sera examiné au prochain tour.
        parcoursEcourte = true;
      }

      // TOUS les fichiers qui correspondent à une pièce sont retenus comme candidats, plus
      // seulement le premier : quand une pièce annuelle est renouvelée (ramonage, entretien, taxe
      // foncière 2025 → 2026), les deux fichiers coexistent dans le dossier, et c'est le plus
      // récent qui doit compter — voir choisirFichierPiece après la boucle. Demandé par l'étude.
      for (const piece of checklist) {
        if (!aChercher.has(piece.cle)) continue;
        if (courrierEnvoye && piece.cle !== 'planCadastral') continue;
        // Pièce personnalisée (voir checklistPieces/ajouterPiecePersonnalisee) : pas de motifNom
        // (nom libre saisi par l'étude), retrouvée par sous-chaîne de son libellé — même logique
        // que chercherFichierParNom, appliquée ici pour qu'un "Revérifier" ultérieur la retrouve
        // aussi, pas seulement la recherche ponctuelle faite à son ajout.
        let correspond = false;
        const reconnaissance = correspondancePieceNom(piece, nomNormalise);
        // Un nom que le motif prend mais qu'une réponse « Non » de l'étude écarte (Réglages › Noms de fichiers du NAS) : dit dans le
        // diagnostic, sinon la pièce reste « manquante » sans qu'aucune ligne n'explique pourquoi (05/10, « Certificat_Assainissement.pdf »).
        if (!reconnaissance && !piece.personnalisee && decisionFormePourNom(piece.cle, nomNormalise) === 'non' && correspondancePieceNomMotifs(piece, nomNormalise)) {
          diagnosticJournal.push(`${fichier.nom} → correspond à « ${piece.label} » mais écarté par une réponse « Non » donnée dans Réglages › Noms de fichiers du NAS (« Annuler » la décision pour le rétablir)`);
        }
        if (piece.personnalisee) {
          correspond = !!reconnaissance;
        } else if (reconnaissance) {
          if (estNomExcluPourPiece(piece.cle, nomNormalise)) {
            // Le nom correspond, mais une correction précédente l'a écarté pour cette pièce (bouton
            // « Réinitialiser », voir reinitialiserStatutPieceStandard). Écrit en clair dans le
            // diagnostic : sans ça, une exclusion posée une fois bloquait la pièce en silence sur
            // TOUS les dossiers suivants portant un fichier de même nom — cas signalé par l'étude
            // (« Courriel alignement et numérotage.pdf » : numérotage relié, alignement jamais).
            exclusionsRencontrees.push({ cle: piece.cle, label: piece.label, nom: nomNormalise, fichier: fichier.nom });
            diagnosticJournal.push(`${fichier.nom} → correspond à « ${piece.label} » mais écarté par une correction précédente (Réglages › Pièces et Claire Scan › Fichiers écartés pour rétablir)`);
          } else {
            correspond = true;
          }
        }
        if (correspond) {
          (candidatsParPiece[piece.cle] = candidatsParPiece[piece.cle] || []).push({ chemin: cheminComplet, nom: fichier.nom });
          diagnosticJournal.push(`${fichier.nom} → pièce trouvée par nom${reconnaissance === 'approche' ? ' (nom approchant)' : ''} : « ${piece.label} »`);
        }
      }
    }

    // Choix du fichier retenu pour chaque pièce, et repérage des pièces RENOUVELÉES (même pièce,
    // fichier d'une année plus récente que celui déjà connu) — elles sont notifiées comme une pièce
    // nouvelle, puisque c'en est une pour l'étude.
    const piecesMisesAJour = [];
    for (const piece of checklist) {
      const candidats = candidatsParPiece[piece.cle];
      if (!candidats || !candidats.length) continue;
      const precedent = fichierTrouve(d, NAS_CLE_PIECE(piece.cle));
      const choix = choisirFichierPiece(candidats, precedent);
      fichierParPiece[piece.cle] = choix.chemin;
      const anneePrecedente = precedent ? anneeDansNomFichier(precedent) : null;
      if (precedent && choix.chemin !== precedent && choix.annee && anneePrecedente && choix.annee > anneePrecedente) {
        piecesMisesAJour.push({ cle: piece.cle, label: piece.label, avant: anneePrecedente, apres: choix.annee });
        diagnosticJournal.push(`Pièce « ${piece.label} » : version ${choix.annee} retenue à la place de ${anneePrecedente}`);
      }
    }

    let nbPiecesTrouvees = 0;
    const desynchronisees = [];
    for (const piece of checklist) {
      // Pièce personnalisée « reçue » sans aucun fichier mémorisé : elle n'a pu être cochée qu'à la
      // main (une recherche réussie mémorise toujours son fichier). Rattrape les pièces cochées
      // avant que ce drapeau n'existe, sans qu'il faille les recocher une à une.
      const personnaliseeCocheeMain = piece.personnalisee && d.pieces[piece.cle] === 'recue'
        && !fichierTrouve(d, NAS_CLE_PIECE(piece.cle));
      if (fichierParPiece[piece.cle]) {
        d.pieces[piece.cle] = 'recue';
        nbPiecesTrouvees++;
        memoriserFichierTrouve(d, NAS_CLE_PIECE(piece.cle), fichierParPiece[piece.cle]);
      } else if (validees.has(piece.cle) || personnaliseeCocheeMain) {
        // Validée à la main : son statut ne dépend pas de ce que contient le NAS.
        d.pieces[piece.cle] = 'recue';
        nbPiecesTrouvees++;
      } else if (d.pieces[piece.cle] === 'recue') {
        // Elle était reçue et son fichier n'est plus là : désynchronisée. Garde-fou explicite — on
        // ne remet une pièce à "manquante" QUE si le parcours a effectivement vu des fichiers.
        // Un dossier NAS temporairement vide ou injoignable (partage démonté, chemin renommé) ne
        // doit jamais vider d'un coup tous les statuts déjà acquis d'un dossier.
        if (nbFichiersRencontres > 0) {
          d.pieces[piece.cle] = 'manquante';
          memoriserFichierTrouve(d, NAS_CLE_PIECE(piece.cle), null);
          desynchronisees.push(piece.label);
          diagnosticJournal.push(`Pièce « ${piece.label} » : fichier introuvable dans le dossier, repassée à manquante`);
        } else {
          nbPiecesTrouvees++; // statut conservé faute d'avoir pu vérifier quoi que ce soit
        }
      } else {
        d.pieces[piece.cle] = 'manquante';
      }
    }
    if (desynchronisees.length) {
      ajouterHistorique(d, `Pièce(s) devenue(s) introuvable(s) sur le NAS : ${desynchronisees.join(', ')}`, { auto: true });
    }

    // Résultat complet du parcours, pour le panneau de diagnostic (voir renderDiagnosticParcours) —
    // construit ici, une fois d.pieces à jour, plutôt que pendant la boucle : la liste des pièces
    // "encore manquantes" doit refléter l'état final, pas un instantané pris en cours de parcours.
    dernierDiagnosticParcours[id] = {
      horodatage: new Date().toISOString(),
      journal: diagnosticJournal,
      exclusions: exclusionsRencontrees,
      resume: {
        nbFichiersRencontres,
        nbAnalyses,
        dossierNas: d.nasDossier,
        offre: !chercherOffre ? null : { trouvee: offreTrouvee, aConfirmer: offreAConfirmer, fichier: fichierOffre },
        pieces: !chercherPieces ? null : {
          total: checklist.length,
          trouvees: nbPiecesTrouvees,
          manquantes: checklist.filter(p => d.pieces[p.cle] !== 'recue').map(p => p.label)
        }
      }
    };

    if (viaClicUtilisateur) {
      const messages = [];
      if (chercherOffre) {
        messages.push(!offreTrouvee
          ? "Offre de prêt non reconnue."
          : offreAConfirmer
            ? `Offre de prêt probable (${fichierOffre}) — à confirmer, le modèle local n'a pas pu la vérifier.`
            : `Offre de prêt trouvée (${fichierOffre}).`);
      }
      if (chercherPieces) {
        const manquantes = checklist.length - nbPiecesTrouvees;
        messages.push(manquantes === 0
          ? `Les ${checklist.length} pièces attendues ont été reconnues.`
          : `${nbPiecesTrouvees}/${checklist.length} pièces reconnues (${manquantes} manquante${manquantes > 1 ? 's' : ''}).`);
      }
      if (nbFichiersRencontres === 0) {
        afficherToast(`Aucun PDF dans « ${d.nasDossier} » (ni ses sous-dossiers) — vérifiez le dossier relié.`, 'OK', null);
      } else {
        afficherToast(messages.join(' '), 'OK', null);
      }
    }

    let offreEtaitManquante = false;
    let offreEtaitRecue = false;
    if (chercherOffre) {
      offreEtaitManquante = d.offrePretStatut === 'manquante';
      offreEtaitRecue = d.offrePretStatut === 'recue';
      // Trois issues, pas deux : trouvée et confirmée, trouvée mais pas confirmable (modèle local
      // indisponible — statut distinct demandé par l'étude, à trancher à la main), ou introuvable.
      // Un parcours écourté faute de budget (voir parcoursEcourte) ne conclut jamais « manquante » :
      // il reste des candidats à ouvrir, le statut précédent est conservé jusqu'au tour suivant.
      if (offreTrouvee) d.offrePretStatut = offreAConfirmer ? 'aconfirmer' : 'recue';
      else if (!parcoursEcourte) d.offrePretStatut = 'manquante';
    }

    // Diff pièces/offre AVANT → APRÈS ce parcours (voir piecesAvant/offreEtaitRecue plus haut) :
    // ce sont EXACTEMENT les documents qui viennent d'être trouvés lors de CE scan, groupés en une
    // seule notification par dossier — jamais une par pièce (demandé explicitement par l'étude).
    // L'offre "à confirmer" n'est volontairement pas comptée : rien n'est encore "reçu" tant que
    // l'étude (ou le modèle local) ne l'a pas confirmé.
    const nouvellesPieces = checklist
      .filter(p => d.pieces[p.cle] === 'recue' && piecesAvant[p.cle] !== 'recue' && !validees.has(p.cle))
      .map(p => p.cle);
    // Une pièce renouvelée (année plus récente, voir piecesMisesAJour) est une nouveauté pour
    // l'étude au même titre qu'une pièce jamais vue : même notification, même trace.
    for (const m of piecesMisesAJour) {
      if (!nouvellesPieces.includes(m.cle)) nouvellesPieces.push(m.cle);
    }
    if (piecesMisesAJour.length) {
      ajouterHistorique(d, 'Pièce(s) mise(s) à jour sur le NAS : ' +
        piecesMisesAJour.map(m => `${m.label} (${m.avant} → ${m.apres})`).join(', '), { auto: true });
    }
    if (chercherOffre && offreTrouvee && !offreAConfirmer && !offreEtaitRecue) {
      nouvellesPieces.push(CLE_NOTIF_OFFRE_PRET);
    }
    if (nouvellesPieces.length) {
      // Date à laquelle chaque pièce a été trouvée (ou renouvelée) — alimente « Dernières pièces
      // trouvées » sur le Tableau de bord, qui garde la trace après que la fiche a été consultée.
      const maintenant = new Date().toISOString();
      d.piecesTrouveesLe = d.piecesTrouveesLe || {};
      for (const cle of nouvellesPieces) d.piecesTrouveesLe[cle] = maintenant;
      d.piecesNotifications = Array.from(new Set([...(d.piecesNotifications || []), ...nouvellesPieces]));
      notifierNouvellesPiecesTrouvees(d, nouvellesPieces);
      notifierNavigateurPieces(d, nouvellesPieces);
    }
    signalerSiDossierDevenuComplet(d);

    // Ce parcours vient justement de relire le dossier NAS : la notification proactive d'un
    // nouveau document (voir appliquerChangementsDistants/nasWatch.js) a déjà rempli son rôle une
    // fois qu'elle a mené jusqu'ici, qu'elle vienne d'un clic explicite sur "Revérifier" ou de la
    // revérification automatique périodique — rien à laisser affiché après coup.
    if (d.nasNouveaute) d.nasNouveaute = null;
    enregistrerPdfEcartesOffre();

    await sauvegarder(d);
    render();
    // Offre de prêt désormais reçue : retire la date butoir que CLAIRE avait posée dans l'agenda.
    // Jamais de création depuis un parcours automatique (voir actionEcheanceAgenda).
    synchroniserEcheanceAgenda(d, 'pret', false);

    if (chercherOffre && offreTrouvee && offreEtaitManquante) {
      ajouterHistorique(d, 'Offre de prêt retrouvée dans le dossier NAS', { auto: true });
      await sauvegarder(d);
    }

    // Une offre déjà confirmée reçue ne doit jamais redéclencher une relance automatique même si
    // une vérification ultérieure ne la retrouve plus (fichier déplacé/archivé/renommé une fois
    // traité) : ce n'est pas un signe que l'offre manque réellement, l'étude l'a déjà en main.
    // relancerSiOffreManquante() écarte déjà elle-même le rôle participant.
    if (chercherOffre && !offreTrouvee && !offreEtaitRecue && !parcoursEcourte) relancerSiOffreManquante(d);
  }

  // Rouvre directement le PDF du NAS où une pièce (ou l'offre de prêt) a été reconnue, plutôt
  // que de se contenter d'un badge « reçue » sans rien derrière — demandé par l'étude. Le chemin du
  // fichier a été mémorisé SUR LE DOSSIER au moment de la détection (voir verifierDossierLocal) :
  // il est donc connu de tous les postes, contrairement à l'ancien handle propre à un navigateur.
  function ouvrirPieceTrouvee(id, cle) {
    const d = dossiers.find(x => x.id === id);
    if (d) ouvrirFichierNas(fichierTrouve(d, NAS_CLE_PIECE(cle)));
  }

  function ouvrirOffreTrouvee(id) {
    const d = dossiers.find(x => x.id === id);
    if (d) ouvrirFichierNas(fichierTrouve(d, NAS_CLE_OFFRE));
  }

  // "Ouvrir le compromis" : contrairement à l'offre/aux pièces, ce document n'est jamais recherché
  // par verifierDossierLocal() (ce n'est pas une pièce de la checklist) — son handle n'est donc
  // rempli qu'à la demande, ici, la première fois qu'on clique sur le bouton. Une fois trouvé, il
  // est mémorisé (CLE_HANDLE_COMPROMIS) comme les autres documents : un clic suivant l'ouvre
  // directement, sans reparcourir le dossier local.
  // Bug corrigé, signalé par l'étude : la recherche se faisait par les seuls mots "compromis" puis
  // "promesse", qui ramenaient souvent le MAUVAIS avant-contrat — celui de la VENTE PRÉALABLE de
  // l'acquéreur, rangé dans le même dossier local et portant lui aussi ces mots dans son nom.
  // C'est désormais le nom EXACT du fichier importé à la création du dossier
  // (`d.compromisNomFichier`) qui est cherché en premier ; la recherche floue ne sert plus que de
  // repli pour un dossier saisi entièrement à la main (ou créé avant cette évolution), et le
  // signale alors explicitement plutôt que d'ouvrir un document au hasard sans prévenir.
  // Avant-contrat retrouvé SEUL à l'ouverture de la fiche (étude 09/10 : « parfois j'ai "Recherché dans le dossier NAS à l'ouverture" » —
  // la ligne ne donnait un nom qu'après un clic sur « Ouvrir ») : même choix que `ouvrirCompromisTrouve`, sans toast ni ouverture ;
  // le fichier est mémorisé et la fiche en montre le nom. Une fois par dossier et par session ; rien trouvé = la ligne reste telle
  // quelle (« Changer » pour le choisir).
  var recherchesCompromisAuto = new Set();
  async function retrouverCompromisSilencieux(dossierId) {
    const d = dossiers.find(x => x.id === dossierId);
    if (!d || !d.dossierLie || !d.nasDossier || d.archive || estSuccession(d)) return;
    if (compromisMemoriseValide(d) || recherchesCompromisAuto.has(dossierId)) return;
    recherchesCompromisAuto.add(dossierId);
    try {
      const choix = choisirAvantContratNas(await listerFichiersNas(d), nomCompromisAttendu(d), contexteNomsAvantContrat(d, dossiers));
      if (!choix.fichier) return;
      memoriserFichierTrouve(d, NAS_CLE_COMPROMIS, cheminNasComplet(d, choix.fichier.chemin));
      await sauvegarder(d);
      render();
    } catch (e) {
      console.warn('Avant-contrat non retrouvé à l’ouverture :', e && e.message);
    }
  }

  // Pure : l'emplacement réseau du dossier client (racine configurée du serveur + dossier relié), à coller dans l'Explorateur.
  function cheminReseauDossierNas(racine, nasDossier) {
    const base = String(racine || '').replace(/[\\/]+$/, '');
    const rel = String(nasDossier || '').replace(/^[\\/]+|[\\/]+$/g, '');
    if (!base || !rel) return '';
    const win = base.includes('\\') || /^[A-Za-z]:/.test(base);
    return win ? `${base}\\${rel.replace(/\//g, '\\')}` : `${base}/${rel}`;
  }

  // « Ouvrir le NAS » (étude 20/10) : la fenêtre de l'explorateur du dossier client (client/93) ; l'emplacement réseau à coller
  // dans l'Explorateur Windows (étude 14/10 : une page web ne peut pas ouvrir l'Explorateur) s'y copie d'un clic.
  var racineNasPoste = '';
  function ouvrirDossierNas(dossierId) { ouvrirExplorateurNas(dossierId); }

  async function ouvrirCompromisTrouve(dossierId, btn) {
    const d = dossiers.find(x => x.id === dossierId);
    if (!d) return;
    const dejaTrouve = compromisMemoriseValide(d);
    if (dejaTrouve) { ouvrirFichierNas(dejaTrouve); return; }
    if (!d.dossierLie || !d.nasDossier) {
      afficherToast('Reliez d\u2019abord un dossier du NAS pour retrouver le compromis.', 'OK', null);
      return;
    }
    const texteOriginal = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = `${icone('spinner', null, true)} Recherche\u2026`; }
    try {
      const fichiers = await listerFichiersNas(d);
      // Nom exact d'abord, puis racine/rubrique SRU, mots « compromis »/« promesse » en dernier —
      // voir choisirAvantContratNas() pour l'ordre complet et ce qu'il départage.
      const choix = choisirAvantContratNas(fichiers, nomCompromisAttendu(d), contexteNomsAvantContrat(d, dossiers));
      const trouve = choix.fichier;
      const parRepli = choix.methode !== 'nom-exact';
      if (nomCompromisAttendu(d) && parRepli) {
        afficherToast(`\u00ab\u00a0${nomCompromisAttendu(d)}\u00a0\u00bb introuvable dans le dossier NAS \u2014 recherche \u00e9largie.`, 'OK', null);
      }
      if (!trouve) {
        afficherToast('Aucun avant-contrat trouv\u00e9 dans le dossier NAS reli\u00e9 (les projets, relectures et fichiers au nom d\u2019un autre dossier sont \u00e9cart\u00e9s) : choisissez-le avec \u00ab\u00a0Changer\u00a0\u00bb.', 'OK', null);
        return;
      }
      const chemin = cheminNasComplet(d, trouve.chemin);
      memoriserFichierTrouve(d, NAS_CLE_COMPROMIS, chemin);
      await sauvegarder(d);
      render();   // la ligne « Avant-contrat » montre aussitôt le nom retrouvé (étude 09/10 : « il a trouvé le compromis mais n'affiche pas le nom »)
      // Un repli peut tr\u00e8s bien avoir ramen\u00e9 l'avant-contrat d'une vente pr\u00e9alable : le dire,
      // plut\u00f4t que de laisser croire que c'est forc\u00e9ment le document import\u00e9 \u00e0 la cr\u00e9ation.
      if (parRepli) {
        afficherToast(`Ouverture de \u00ab\u00a0${trouve.nom}\u00a0\u00bb \u2014 v\u00e9rifiez qu'il s'agit bien du bon avant-contrat.`, 'OK', null);
      }
      ouvrirFichierNas(chemin);
    } catch (e) {
      console.error(e);
      afficherToast('Recherche du compromis impossible : ' + e.message, 'OK', null);
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = texteOriginal; }
    }
  }

  // « Changer » l'avant-contrat (étude 05/10 : « permettre de changer le compromis s'il n'a pas été bien rattaché ») : fenêtre
  // des PDF du dossier NAS relié — ceux de la racine et de « SRU » d'abord, le fichier actuel marqué. Le choix est gardé sur la
  // fiche (`d.compromisChoisiNas`) ET mémorisé comme fichier trouvé : « Ouvrir », la lecture du mobilier, la relecture d'actes
  // et les fonds reçus s'en servent désormais. « Revenir au choix automatique » l'oublie.
  var choixCompromisEnCours = null;
  async function ouvrirChoixCompromis(id) {
    const d = dossiers.find(x => x.id === id);
    const overlay = document.getElementById('compromis-choix-overlay');
    const liste = document.getElementById('compromis-choix-liste');
    if (!d || !overlay || !liste) return;
    if (!d.dossierLie || !d.nasDossier) { afficherToast('Reliez d’abord un dossier du NAS pour choisir le compromis.', 'OK', null); return; }
    choixCompromisEnCours = { id, fichiers: [] };
    const intro = document.getElementById('compromis-choix-intro');
    if (intro) intro.textContent = `Quel fichier est l’avant-contrat de ${libelleDossierAffiche(d)} ?`;
    const recherche = document.getElementById('compromis-choix-recherche');
    if (recherche) recherche.value = '';
    liste.innerHTML = `<p class="nas-choix-vide">${icone('spinner', null, true)} Lecture du dossier du NAS…</p>`;
    overlay.style.display = 'flex';
    try {
      const fichiers = await listerFichiersNas(d);
      if (!choixCompromisEnCours || choixCompromisEnCours.id !== id) return;
      const contexte = contexteNomsAvantContrat(d, dossiers);
      const actuel = choisirAvantContratNas(fichiers, nomCompromisAttendu(d), contexte).fichier;
      const ECARTS = { projet: 'projet ou relecture', 'autre-nom': 'autre nom' };
      const bienPlace = f => estEmplacementAvantContrat(f.chemin);
      const tri = fichiers.slice().sort((a, b) => (bienPlace(b) - bienPlace(a)) || String(a.chemin).localeCompare(String(b.chemin), 'fr'));
      choixCompromisEnCours.fichiers = tri;
      liste.innerHTML = tri.length ? tri.map((f, i) => {
        const dossierDe = segmentsDossier(f.chemin).join(' / ');
        const estActuel = actuel && actuel.chemin === f.chemin;
        const ecart = ECARTS[raisonExclusionAvantContrat(f.nom, contexte)] || '';
        return `<button type="button" class="nas-choix-item${estActuel ? ' actuel' : ''}" data-cherche="${escapeAttr(normaliserPourRecherche(f.chemin))}" onclick="choisirCompromisNas(${i})">`
          + `<span class="nas-choix-nom">${escapeHtml(f.nom)}</span>`
          + `<span class="nas-choix-marque">${escapeHtml(estActuel ? 'actuel' : (dossierDe || 'racine') + (ecart ? ' · ' + ecart : ''))}</span></button>`;
      }).join('') : '<p class="nas-choix-vide">Aucun PDF dans le dossier du NAS.</p>';
      if (recherche) recherche.style.display = tri.length > 6 ? '' : 'none';
      const retour = document.getElementById('compromis-choix-auto');
      if (retour) retour.style.display = compromisChoisiValide(d) ? '' : 'none';
    } catch (e) {
      liste.innerHTML = `<p class="nas-choix-vide">Dossier du NAS illisible (${escapeHtml(e.message)}).</p>`;
    }
  }

  function filtrerChoixCompromis(texte) {
    const q = normaliserPourRecherche(texte || '').trim();
    document.querySelectorAll('#compromis-choix-liste .nas-choix-item').forEach(b => {
      b.style.display = !q || (b.dataset.cherche || '').includes(q) ? '' : 'none';
    });
  }

  function fermerChoixCompromis() {
    choixCompromisEnCours = null;
    const overlay = document.getElementById('compromis-choix-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  // `indice` = rang dans la liste affichée (pas de chemin dans l'attribut onclick).
  async function choisirCompromisNas(indice) {
    const choix = choixCompromisEnCours;
    const d = choix ? dossiers.find(x => x.id === choix.id) : null;
    const f = choix ? choix.fichiers[indice] : null;
    if (!d || !f) return;
    fermerChoixCompromis();
    const chemin = cheminNasComplet(d, f.chemin);
    d.compromisChoisiNas = chemin;
    memoriserFichierTrouve(d, NAS_CLE_COMPROMIS, chemin);
    ajouterHistorique(d, `Avant-contrat choisi à la main : « ${f.nom} »`);
    await sauvegarder(d);
    render();
    afficherToast(`Avant-contrat : « ${f.nom} ».`, 'OK', null);
  }

  async function revenirCompromisAutomatique() {
    const choix = choixCompromisEnCours;
    const d = choix ? dossiers.find(x => x.id === choix.id) : null;
    if (!d) return;
    fermerChoixCompromis();
    delete d.compromisChoisiNas;
    memoriserFichierTrouve(d, NAS_CLE_COMPROMIS, null);
    ajouterHistorique(d, 'Avant-contrat : retour au choix automatique');
    await sauvegarder(d);
    render();
  }

  // Ouvre automatiquement une relance pré-rédigée si l'échéance approche et qu'aucune offre n'a
  // été trouvée — au plus une fois par jour et par dossier, pour ne pas rouvrir un brouillon à
  // chaque vérification. L'envoi final reste un geste volontaire de l'utilisateur.
  // Cadence de la relance « offre de prêt » adressée au client, demandée par l'étude : une
  // première relance quand l'échéance entre dans les 15 jours, puis une tous les 10 jours tant que
  // l'offre reste introuvable. Avant ce réglage, la seule garde était « pas deux fois le même
  // jour » — donc en pratique une relance PAR JOUR pendant quinze jours, ce que personne ne
  // souhaite envoyer à un acquéreur.
  var FENETRE_RELANCE_OFFRE_JOURS = 15;
  var JOURS_ENTRE_RELANCES_OFFRE = 10;

  // Comptée depuis la DERNIÈRE relance, et non sur des seuils fixes (J-15 puis J-5) : cette
  // relance n'est déclenchée que par un parcours du NAS, qui ne tourne que si CLAIRE est ouverte
  // ce jour-là — un seuil exact serait purement et simplement manqué un jour sur deux. Une date
  // illisible (dossier importé, valeur corrompue) autorise la relance plutôt que de la bloquer
  // indéfiniment : le pire cas est un email de trop, pas une offre jamais réclamée.
  function relanceOffreDue(derniereRelanceIso, aujourdhuiIso) {
    if (!derniereRelanceIso) return true;
    const ecart = ecartJours(derniereRelanceIso, aujourdhuiIso);
    if (ecart === null) return true;
    return ecart >= JOURS_ENTRE_RELANCES_OFFRE;
  }

  // Libellé de l'échéance pour l'historique : « J-3 » avant, « J » le jour même, « J+5 » après.
  // Sans ça, une relance postérieure à l'échéance écrivait « J--5 ».
  function libelleEcheanceRelance(jours) {
    if (jours > 0) return `échéance J-${jours}`;
    if (jours === 0) return `échéance aujourd'hui`;
    return `échéance dépassée de ${-jours} jour${-jours > 1 ? 's' : ''}`;
  }

  // Modèle fourni mot pour mot par l'étude (25/09), commun à la relance manuelle (« Prêt
  // manquant ») et à la relance automatique : une ligne par paragraphe, séparées par une ligne
  // vide, et SANS la signature texte de l'office — l'étude préfère la signature Outlook, qui porte
  // les images (un brouillon mailto: ne peut transporter que du texte). Seul écart au modèle : une
  // fois l'échéance passée, « était fixée » plutôt que « est fixée ». Sans date connue, la phrase
  // d'échéance est simplement omise. Fonction pure, testable.
  function corpsRelanceOffreManquante(nom, isoEcheance, jours) {
    const lignes = [
      'Bonjour,',
      'J’espère que vous allez bien.',
      "Nous n'avons pas encore reçu votre offre de prêt dans le cadre de votre dossier."
    ];
    if (isoEcheance) {
      const verbe = (typeof jours === 'number' && jours < 0) ? 'était fixée' : 'est fixée';
      lignes.push(`L'échéance d'obtention du prêt ${verbe} au ${formatDateFr(isoEcheance)}.`);
    }
    lignes.push("Merci de nous transmettre cette offre dès réception, ou de nous indiquer où en est votre demande de financement.");
    return lignes.join('\n\n');
  }

  function relancerSiOffreManquante(d) {
    // Le rôle participant n'interdit plus d'écrire à l'acquéreur (demandé par l'étude) : seule
    // compte la règle déontologique d'emailDestinataireRelance — un acquéreur représenté par un
    // autre office est relancé via ce confrère, jamais directement.
    // Un dossier archivé n'attend plus rien. En pratique la revérification automatique les saute
    // déjà, mais un clic explicite sur « Revérifier » passe encore par ici.
    if (d.archive) return;
    const destinataire = emailDestinataireRelance(d);
    if (!destinataire || !d.pret) return;
    const jours = joursRestants(d.pret);
    // Pas de borne basse : la relance CONTINUE une fois l'échéance passée, tous les 10 jours,
    // tant que l'offre n'est pas là (demandé par l'étude). C'est précisément à ce moment que la
    // condition suspensive est en jeu — s'arrêter là laisserait le dossier sans relance au pire
    // moment. Le seul arrêt est l'arrivée de l'offre (cette fonction n'est plus appelée) ou
    // l'archivage du dossier.
    if (jours === null || jours > FENETRE_RELANCE_OFFRE_JOURS) return;
    const aujourdhui = isoAujourdhuiLocal();
    if (!relanceOffreDue(d.derniereRelanceAuto, aujourdhui)) return;
    // Audit 25/10 : la relance n'est notée faite qu'une fois l'email envoyé ou préparé — fenêtre annulée, elle reviendra ;
    // une seule fenêtre à la fois par dossier tant qu'elle est ouverte, et une fenêtre annulée n'est pas rouverte le même jour.
    if (relancesOffreOuvertes.has(d.id) || relanceOffreAnnuleeLe(d.id) === aujourdhui) return;
    relancesOffreOuvertes.add(d.id);

    const { sujet: subject, corps: body } = emailDepuisModele('pret', d);
    livrerEmailDossier({ destinataire, sujet: subject, corps: body, confrere: notaireParticipantRepresenteAcquereur(d), responsableSignature: d.responsable, dossierId: d.id, geste: 'relancePret' })
      .then(r => {
        if (r && r.ok) {
          d.derniereRelanceAuto = aujourdhui;
          ajouterHistorique(d, `Relance automatique ${r.mode === 'envoye' ? 'envoyée' : 'préparée'} (offre de prêt introuvable, ${libelleEcheanceRelance(jours)})`, { auto: true });
          sauvegarder(d);
        } else if (r && r.annule) ecrireLocal('claire-relance-offre-annulee:' + d.id, aujourdhui);
        if (!r.annule) afficherToast(r.ok
        ? (r.mode === 'envoye' ? `Relance « offre de prêt » envoyée pour ${libelleDossierAffiche(d)}.` : `Relance « offre de prêt » prête pour ${libelleDossierAffiche(d)} — ${r.mode === 'eml' ? 'ouvrez le fichier téléchargé' : 'vérifiez'} puis envoyez.`)
        : `Relance « offre de prêt » de ${libelleDossierAffiche(d)} non préparée.`, 'OK', null); })
      .finally(() => relancesOffreOuvertes.delete(d.id));
  }
  var relancesOffreOuvertes = new Set();
  // Le jour d'une relance annulée, gardé par le poste pour qu'un F5 ou le rechargement après une mise à jour ne la rouvre pas.
  function relanceOffreAnnuleeLe(id) {
    try { return localStorage.getItem('claire-relance-offre-annulee:' + id) || ''; } catch (e) { return ''; }
  }

  // Statut de l'offre de prêt à afficher, dans le même vocabulaire court partout où il apparaît
  // (ligne de tableau, carte "Obtention du prêt" du tiroir) : avant cette fonction, chaque endroit
  // formulait le même fait à sa façon ("Offre de prêt : à vérifier" en phrase complète ici,
  // "Non vérifiée" en point + mot juste à côté) — une seule source, un seul texte. La distinction
  // "jamais relié" / "relié mais introuvable" (déjà utilisée dans le tiroir) s'applique désormais
  // aussi au tableau : un dossier jamais relié n'a pas plus "à vérifier" qu'un dossier relié où
  // l'offre reste introuvable, ce sont deux réalités différentes.
  function statutOffreAffichage(d) {
    if (!d.dossierLie) return { texte: 'Non vérifiée', dl: 'dl-neutre' };
    if (d.offrePretStatut === 'recue') return { texte: 'Reçue', dl: 'dl-success' };
    // Un document a bien été trouvé, mais sans la confirmation du modèle local : distinct d'une
    // offre reçue (personne ne l'a encore validée) comme d'une offre introuvable (le document est
    // là, il suffit de l'ouvrir pour trancher). Statut demandé explicitement par l'étude.
    if (d.offrePretStatut === 'aconfirmer') return { texte: 'À confirmer', dl: 'dl-pret' };
    if (d.offrePretStatut === 'manquante') return { texte: 'Introuvable', dl: 'dl-pret' };
    return { texte: 'À vérifier', dl: 'dl-neutre' };
  }

  // Prévient le responsable, une seule fois, qu'un dossier a tout reçu — demandé par l'étude : c'est
  // le signal qu'il peut commencer la rédaction de l'acte. `d.completNotifieLe` empêche tout
  // renvoi (y compris depuis un autre poste, le dossier étant partagé) ; il est effacé si le dossier
  // cesse d'être complet (une pièce disparue du NAS), pour que le prochain passage à « complet »
  // soit de nouveau annoncé. Rien pour un dossier archivé, ni pour une participation : la
  // rédaction revient alors au confrère. Appelée après toute mutation qui peut compléter un
  // dossier (parcours du NAS, validation manuelle d'une pièce, pièce personnalisée cochée).
  function doitNotifierDossierComplet(d) {
    if (!d || d.archive || d.roleNotaire === 'participant') return false;
    return dossierEntierementComplet(d) && !d.completNotifieLe;
  }

  // Prévenir le responsable du dossier, par la chaîne des rappels (email → passerelle → Teams),
  // quand un AUTRE collaborateur y ajoute ou y change une date (demandé par l'étude). L'auteur est
  // le collaborateur choisi sur ce poste : sans lui, on ne sait pas si le geste vient d'un autre,
  // et rien n'est envoyé. Une date vidée ne prévient personne, ni une date écrite par le serveur
  // (agenda, NAS) : ces chemins ne passent pas par ici. Pure, testable.
  // `heures` ({ heure, ancienneHeure }, page Agenda) : un rendez-vous avancé le même jour compte aussi.
  function doitNotifierDateAjoutee(d, auteur, nouvelleDate, ancienneDate, heures) {
    const h = heures || {};
    const memeMoment = nouvelleDate === ancienneDate && (h.heure || '') === (h.ancienneHeure || '');
    if (!d || d.archive || !nouvelleDate || memeMoment) return false;
    if (!auteur || !d.responsable) return false;
    return auteur !== d.responsable;
  }

  function notifierDateAjoutee(d, libelle, nouvelleDate, ancienneDate, heures) {
    if (!doitNotifierDateAjoutee(d, utilisateurPoste, nouvelleDate, ancienneDate || '', heures)) return;
    // Fire-and-forget : un envoi impossible ne doit jamais faire échouer la saisie de la date.
    fetchAvecAuth('/api/notifications/date-ajoutee', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        dossierNom: libelleDossierAffiche(d), responsable: d.responsable, auteur: utilisateurPoste,
        libelle, date: nouvelleDate, ancienneDate: ancienneDate || '',
        ...(heures ? { heure: heures.heure || '', ancienneHeure: heures.ancienneHeure || '' } : {})
      })
    }).catch(e => console.warn('Notification « date ajoutée » impossible :', e.message));
  }

  // Signature marquée « annulé / à replacer » depuis la page Agenda : le responsable est prévenu
  // (étude, 01/10), sauf si c'est lui.
  function notifierSignatureAReplacer(d, date, heure) {
    if (!d || !d.responsable || !utilisateurPoste || utilisateurPoste === d.responsable) return;
    fetchAvecAuth('/api/notifications/rendez-vous-agenda', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dossierNom: libelleDossierAffiche(d), responsable: d.responsable, auteur: utilisateurPoste, action: 'aReplacer', date, heure: heure || '' })
    }).catch(e => console.warn('Notification « à replacer » impossible :', e.message));
  }

  // Une tâche faite sur le dossier d'un collègue : il est prévenu sur Teams (demandé par l'étude le
  // 29/09, « comme pour la date du rendez-vous de signature »). Les dates d'envoi saisies passent
  // déjà par notifierDateAjoutee (le serveur dit alors « a envoyé l'appel de fonds ») ; celle-ci
  // couvre les autres gestes : « Déjà fait », emails, questionnaire, « Marquer réalisée ».
  function doitNotifierTacheFaite(d, auteur) {
    return !!(d && d.responsable && auteur && auteur !== d.responsable);
  }

  function notifierTacheFaite(d, tache, detail) {
    if (!doitNotifierTacheFaite(d, utilisateurPoste)) return;
    fetchAvecAuth('/api/notifications/tache-faite', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dossierNom: libelleDossierAffiche(d), responsable: d.responsable, auteur: utilisateurPoste, tache, detail: detail || '' })
    }).catch(e => console.warn('Notification « tâche faite » impossible :', e.message));
  }

  function signalerSiDossierDevenuComplet(d) {
    if (!d) return;
    const analyse = elementsAnalyseEnAttente(d);
    if (!dossierEntierementComplet(d) || analyse.engagements.length || analyse.documents.length) {
      if (d.completNotifieLe) d.completNotifieLe = null;
      return;
    }
    if (!doitNotifierDossierComplet(d)) return;
    d.completNotifieLe = new Date().toISOString();
    const succession = estSuccession(d);
    ajouterHistorique(d, succession ? 'Pièces de la succession toutes reçues : responsable prévenu' : 'Dossier complet (offre de prêt et pièces reçues) : responsable prévenu', { auto: true });
    // Fire-and-forget, comme la notification de pièces : un envoi impossible ne doit jamais faire
    // échouer ce qui vient d'être fait sur le dossier.
    fetchAvecAuth('/api/notifications/dossier-complet', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dossierNom: libelleDossierAffiche(d), responsable: d.responsable || null, succession })
    }).catch(e => console.warn('Notification « dossier complet » impossible :', e.message));
  }

  // Un dossier dont l'offre de prêt est déjà confirmée reçue ET toutes les pièces de la checklist
  // déjà reçues n'a plus rien à apprendre d'un nouveau parcours du dossier local — l'y soumettre
  // quand même à chaque démarrage/toutes les 5 minutes ne fait que ralentir l'outil pour rien sur
  // un portefeuille volumineux. Signalé par l'étude.
  function dossierEntierementComplet(d) {
    const offreOk = d.sansPret || d.offrePretStatut === 'recue';
    const piecesOk = d.roleNotaire === 'participant' ||
      checklistPieces(d.typeVente, d).every(p => (d.pieces || {})[p.cle] === 'recue');
    return offreOk && piecesOk;
  }

  // Revérifie les dossiers reliés à l'ouverture, sans exiger de clic (queryPermission seul, qui
  // n'affiche jamais de demande d'autorisation) : si l'accès est toujours accordé, tout se fait
  // silencieusement ; sinon un bandeau invite à cliquer pour le reconfirmer. Ne concerne que les
  // vérifications automatiques (démarrage, minuteur) — un clic explicite sur "Revérifier" doit
  // toujours fonctionner, même sur un dossier déjà complet (l'étude peut vouloir confirmer après
  // un doute, ou un document a pu être retiré du dossier local entre-temps).
  // Rend la main au navigateur entre deux dossiers : sans ça, un tour sur une soixantaine de
  // dossiers enchaîne les téléchargements et les analyses pdf.js sans jamais laisser passer le
  // sondage de synchronisation (7 s) ni un clic. Pendant du `respirer()` déjà posé côté serveur
  // dans nasWatch.js, pour exactement la même raison.
  function rendreLaMain() {
    return new Promise(r => setTimeout(r, 0));
  }

  // Un tour ne doit jamais se superposer au précédent. Le minuteur ci-dessous tire toutes les
  // 5 minutes ; un tour plus long que ça (portefeuille volumineux, NAS lent) faisait démarrer un
  // second tour par-dessus le premier, puis un troisième, chacun rouvrant les mêmes PDF — les
  // connexions du navigateur (6 par origine) étaient alors toutes prises et le sondage de
  // synchronisation ne passait plus : « plus d'accès au serveur » alors que le serveur répond.
  // Même garde-fou que l'indicateur `enCours` de nasWatch.js côté serveur.
  let tourVerificationEnCours = false;

  async function revérifierDossiersLiesAuDemarrage() {
    if (tourVerificationEnCours) return;
    tourVerificationEnCours = true;
    budgetOuverturesTourAuto = MAX_PDF_OUVERTS_TOUR_AUTO;
    try {
      for (const d of dossiers) {
        // Un dossier archivé est terminé : plus aucune pièce à y attendre, donc rien à relire.
        if (d.archive) continue;
        // Un dossier actif jamais relié : on tente le rattachement au NAS tout seul, une fois par
        // session (voir lierDossierNasAutomatique).
        if (!d.nasDossier) await lierDossierNasAutomatique(d.id);
        if (d.dossierLie && !dossierEntierementComplet(d)) {
          await verifierDossierLocal(d.id, false);
        }
        await rendreLaMain();
      }
    } finally {
      tourVerificationEnCours = false;
    }
  }
  setInterval(() => {
    revérifierDossiersLiesAuDemarrage().catch(e => console.error('Relecture des dossiers NAS', e));
  }, 5 * 60 * 1000);


  // ---- thème clair / sombre ----

  const CLE_THEME = 'theme';

  async function appliquerTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    // Le choix vit désormais dans les Réglages (interrupteur « Mode sombre »), plus dans le pied de
    // la sidebar — demandé par l'étude. L'interrupteur est resynchronisé ici pour refléter le
    // thème réellement appliqué, y compris celui chargé au démarrage.
    const inter = document.getElementById('reglages-theme-sombre');
    if (inter) inter.checked = theme === 'dark';
    try {
      if (window.storage) { await window.storage.set(CLE_THEME, theme, false); return; }
    } catch (e) { /* on tente le repli ci-dessous */ }
    try { localStorage.setItem(CLE_THEME, theme); } catch (e) { /* préférence non enregistrée : sans conséquence */ }
  }

  async function chargerTheme() {
    let theme = null;
    try {
      if (window.storage) {
        const res = await window.storage.get(CLE_THEME, false);
        if (res && res.value) theme = res.value;
      }
    } catch (e) { /* on tente le repli ci-dessous */ }
    if (!theme) {
      try { theme = localStorage.getItem(CLE_THEME); } catch (e) { /* aucune préférence enregistrée */ }
    }
    if (!theme && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      theme = 'dark';
    }
    appliquerTheme(theme === 'dark' ? 'dark' : 'light');
  }

  // ---- thème de couleur (accent) ----
  // Choix de l'accent retenu par poste, comme le mode sombre (Réglages › Général › Sur ce poste).
  // Les valeurs vivent dans style.css (--accent-* par :root[data-accent]) : ici on ne fait que
  // poser l'attribut. Bordeaux = défaut, donc aucun attribut.
  var ACCENTS_DISPONIBLES = ['bordeaux', 'bleu', 'vert', 'orange', 'noir'];
  const CLE_ACCENT = 'claire-accent';

  function accentValide(valeur) {
    return ACCENTS_DISPONIBLES.indexOf(valeur) >= 0 ? valeur : 'bordeaux';
  }

  function appliquerAccent(valeur, enregistrer) {
    const accent = accentValide(valeur);
    const racine = document.documentElement;
    if (!racine || typeof racine.setAttribute !== 'function') return;
    if (accent === 'bordeaux' && typeof racine.removeAttribute === 'function') racine.removeAttribute('data-accent');
    else racine.setAttribute('data-accent', accent);
    const radio = document.getElementById('reglages-accent-' + accent);
    if (radio) radio.checked = true;
    if (enregistrer === false) return;
    try { localStorage.setItem(CLE_ACCENT, accent); } catch (e) { /* préférence non enregistrée : sans conséquence */ }
  }

  function chargerAccent() {
    let accent = null;
    try { accent = localStorage.getItem(CLE_ACCENT); } catch (e) { /* aucune préférence enregistrée */ }
    appliquerAccent(accent, false);
  }

  // ---- préférences d'affichage du collaborateur ----
  // Le thème (mode sombre + couleur) est aussi gardé sur le serveur, au nom du collaborateur du
  // poste : le localStorage seul ne tient pas d'une relance à l'autre dès que le navigateur
  // perd ses données ou que CLAIRE est ouverte par une autre adresse (localhost / IP, deux
  // « sites » distincts). Le localStorage reste le cache immédiat, lu avant toute connexion.

  function choisirTheme(theme) {
    appliquerTheme(theme);
    enregistrerPreferenceCollaborateur({ theme });
  }

  function choisirAccent(valeur) {
    appliquerAccent(valeur);
    enregistrerPreferenceCollaborateur({ accent: accentValide(valeur) });
  }

  async function enregistrerPreferenceCollaborateur(preferences) {
    if (!utilisateurPoste || !authToken) return;
    try {
      await fetchAvecAuth('/api/preferences', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collaborateur: utilisateurPoste, preferences })
      });
    } catch (e) { /* le choix reste appliqué sur ce poste */ }
  }

  function preferencesLocales() {
    const out = {};
    try {
      const theme = localStorage.getItem(CLE_THEME);
      if (theme === 'dark' || theme === 'light') out.theme = theme;
      const accent = localStorage.getItem(CLE_ACCENT);
      if (accent && ACCENTS_DISPONIBLES.indexOf(accent) >= 0) out.accent = accent;
    } catch (e) { /* pas de préférence locale */ }
    return out;
  }

  async function chargerPreferencesCollaborateur() {
    if (!utilisateurPoste || !authToken) return;
    let serveur = {};
    try {
      const reponse = await fetchAvecAuth('/api/preferences?collaborateur=' + encodeURIComponent(utilisateurPoste));
      if (!reponse.ok) return;
      serveur = (await reponse.json()).preferences || {};
    } catch (e) { return; }
    if (serveur.theme) appliquerTheme(serveur.theme);
    if (serveur.accent) appliquerAccent(serveur.accent);
    appliquerDossiersConsultesServeur(serveur.dossiersConsultes);
    appliquerReglagesNotificationsServeur(serveur.notifications);
    if (serveur.sidebarDemarrage && serveur.sidebarDemarrage !== sidebarDemarrage()) {
      // Réglage d'un autre poste : pris comme cache ; appliqué seulement si la barre n'a pas été basculée.
      try { localStorage.setItem(CLE_SIDEBAR_DEMARRAGE, serveur.sidebarDemarrage); } catch (e) { /* cache local */ }
      if (sidebarReplieeSeance === null) appliquerEtatSidebar();
      else { const choix = document.getElementById('reglages-sidebar-demarrage'); if (choix) choix.value = serveur.sidebarDemarrage; }
    }
    // Disposition enregistrée pour une ancienne disposition par défaut : on repart de la nouvelle, une
    // fois (voir VERSION_DISPOSITION_WIDGETS) ; le collaborateur la réarrange ensuite à son goût.
    if (Array.isArray(serveur.widgets) && serveur.widgetsVersion === VERSION_DISPOSITION_WIDGETS) appliquerDispositionWidgets(serveur.widgets);
    else if (Array.isArray(serveur.widgets)) {
      appliquerDispositionWidgets(null);
      enregistrerPreferenceCollaborateur({ widgets: dispositionWidgetsCourante(), widgetsVersion: VERSION_DISPOSITION_WIDGETS });
    }
    // Premier passage de ce collaborateur : on reprend le choix déjà fait sur ce poste.
    const manquant = {};
    const locales = preferencesLocales();
    if (!serveur.theme && locales.theme) manquant.theme = locales.theme;
    if (!serveur.accent && locales.accent) manquant.accent = locales.accent;
    if (!serveur.sidebarDemarrage) manquant.sidebarDemarrage = sidebarDemarrage();
    if (Object.keys(manquant).length) enregistrerPreferenceCollaborateur(manquant);
  }

  // ---- barre de progression ----

  function majProgression(pourcent) {
    const barre = document.getElementById('pdf-progress');
    const fill = document.getElementById('pdf-progress-fill');
    if (!barre || !fill) return;
    if (pourcent === null) {                 // progression inconnue (OCR) : animation continue
      barre.classList.add('actif', 'indetermine');
      fill.style.width = '40%';
    } else if (pourcent < 0) {               // terminé
      barre.classList.remove('actif', 'indetermine');
      fill.style.width = '0%';
    } else {
      barre.classList.add('actif');
      barre.classList.remove('indetermine');
      fill.style.width = Math.min(100, Math.round(pourcent)) + '%';
    }
  }

  // ---- raccourcis clavier ----

  // Sélection de texte dans l'aperçu du compromis (voir construireCoucheTexte()/
  // gererSelectionPdf() plus haut) : la barre flottante se met à jour à chaque relâchement du
  // clic, qu'une sélection existe (la montrer au bon endroit) ou plus (la masquer).
  document.addEventListener('mouseup', gererSelectionPdf);

  document.addEventListener('keydown', (e) => {
    // Échap ferme la popup d'info post-action (.ics/email) si elle est ouverte, sinon l'écran
    // "À propos", sinon la boîte de confirmation, sinon la barre de sélection PDF, sinon le tiroir
    // de fiche dossier — dans cet ordre de superposition visuelle (la popup d'info s'ouvre par un
    // clic depuis le tiroir, donc au-dessus de lui ; "À propos" est un simple écran d'information,
    // jamais ouvert en même temps qu'un autre panneau, mais autant le garder en tête de liste par
    // cohérence).
    if (e.key === 'Escape') {
      const sondageOverlay = document.getElementById('sondage-overlay');
      const confirmOuverte = document.getElementById('confirm-overlay');
      if (sondageOverlay && sondageOverlay.style.display === 'flex' && !(confirmOuverte && confirmOuverte.style.display === 'flex')) {
        e.preventDefault();
        fermerModaleSondage();
        return;
      }
      const infoActionOverlay = document.getElementById('info-action-overlay');
      const aproposOverlay = document.getElementById('apropos-overlay');
      const overlay = document.getElementById('confirm-overlay');
      const barreSelection = document.getElementById('pdf-selection-toolbar');
      const formEngagementManuel = document.getElementById('ajout-engagement-manuel-form');
      const signalementOverlay = document.getElementById('signalement-overlay');
      const posteOverlay = document.getElementById('poste-overlay');
      if (posteOverlay && posteOverlay.style.display === 'flex') {
        e.preventDefault();
        ecarterChoixPoste();
      } else if (signalementOverlay && signalementOverlay.style.display === 'flex') {
        e.preventDefault();
        fermerSignalement();
      } else if (infoActionOverlay && infoActionOverlay.style.display === 'flex') {
        e.preventDefault();
        fermerInfoAction();
      } else if (aproposOverlay && aproposOverlay.style.display === 'flex') {
        e.preventDefault();
        fermerAPropos();
      } else if (overlay && overlay.style.display === 'flex') {
        e.preventDefault();
        annulerConfirmation();
      } else if (fenetreAujourdhuiOuverte) {
        e.preventDefault();
        fermerFenetreAujourdhui();
      } else if (ecranAffiche('agenda') && agendaCaseChoisie && !agendaModale && !agendaSelection) {
        e.preventDefault();
        agendaCaseChoisie = null;
        renderPageAgenda();
      } else if (ecranAffiche('agenda') && (agendaModale || agendaSelection)) {
        e.preventDefault();
        fermerModaleAgenda();
      } else if (barreSelection && barreSelection.style.display !== 'none') {
        e.preventDefault();
        masquerBoutonAjoutEngagement();
      } else if (formEngagementManuel && formEngagementManuel.style.display !== 'none') {
        e.preventDefault();
        masquerFormAjoutEngagementManuel();
      } else if (dossierOuvert && (!ficheACoteActive() || focusDansFicheCote())) {
        // Fiche à côté : Échap tapé dans l'écran de gauche (recherche de l'agenda, champ d'un outil) ne la ferme pas.
        e.preventDefault();
        fermerFicheEtOnglet();
      }
      return;
    }
    // Ctrl/Cmd + S enregistre le dossier en cours de saisie.
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      const panneau = document.getElementById('panel');
      if (panneau && panneau.open && ecranAffiche('nouveau')) {
        e.preventDefault();
        ajouterDossier();
      }
    }
  });

  // ---- installation en application (PWA) ----
  //
  // Le service worker n'est là que pour satisfaire le critère d'installation de Chrome ; l'outil
  // fonctionne à l'identique avec ou sans lui. S'il ne s'enregistre pas (fichier ouvert dans un
  // contexte restreint, navigateur différent…), l'app reste utilisable normalement — seul le
  // bouton "Installer" ne s'affichera pas, sans autre conséquence.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch((e) => {
      console.warn('Service worker non enregistré (l\u2019outil reste utilisable normalement) :', e);
    });
  }

  let evenementInstallation = null;

  // Le pied de la sidebar porte « Signaler un problème », toujours visible, et ce bouton-ci,
  // seulement quand le navigateur propose l'installation.
  function afficherBoutonInstallation(visible) {
    const btn = document.getElementById('install-btn');
    if (btn) btn.style.display = visible ? 'inline-block' : 'none';
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    evenementInstallation = e;
    afficherBoutonInstallation(true);
  });

  async function installerApplication() {
    if (!evenementInstallation) return;
    evenementInstallation.prompt();
    const { outcome } = await evenementInstallation.userChoice;
    evenementInstallation = null;
    afficherBoutonInstallation(false);
    if (outcome === 'accepted') afficherToast('Application installée — retrouvez-la depuis son icône, sans repasser par Chrome.', 'OK', null);
  }

  // Une fois installée, Chrome ne redéclenche plus l'événement : on masque le bouton pour de bon.
  window.addEventListener('appinstalled', () => {
    afficherBoutonInstallation(false);
    evenementInstallation = null;
  });


  // ---- Calculateur de provision sur frais d'acte (onglet indépendant, pas lié à un dossier) ----
  // Demandé par l'étude pour estimer rapidement la provision à demander au client avant signature,
  // à partir du barème notarial 2026 et des taux départementaux de DMTO — indépendant du suivi des
  // échéances, accessible depuis son propre onglet de la sidebar (voir definirOnglet('calculateur')).
  // Barème/taux repris tels quels d'une maquette fournie par l'étude, pas recalculés : les données
  // fiscales/tarifaires ne sont pas du ressort de cet outil, seule la mise en forme change.
  var DEPARTEMENTS_FRAIS_ACTE = {'01':{name:'Ain',base:0.045,temp:0.05},'02':{name:'Aisne',base:0.045,temp:0.05},'03':{name:'Allier',base:0.045,temp:0.05},'04':{name:'Alpes-de-Haute-Provence',base:0.045,temp:0.05},'05':{name:'Hautes-Alpes',base:0.045,temp:0.045},'06':{name:'Alpes-Maritimes',base:0.045,temp:0.045},'07':{name:'Ardèche',base:0.045,temp:0.045},'08':{name:'Ardennes',base:0.045,temp:0.05},'09':{name:'Ariège',base:0.045,temp:0.05},'10':{name:'Aube',base:0.045,temp:0.05},'11':{name:'Aude',base:0.045,temp:0.05},'12':{name:'Aveyron',base:0.045,temp:0.05},'13':{name:'Bouches-du-Rhône',base:0.045,temp:0.05},'14':{name:'Calvados',base:0.045,temp:0.05},'15':{name:'Cantal',base:0.045,temp:0.05},'16':{name:'Charente',base:0.045,temp:0.045},'17':{name:'Charente-Maritime',base:0.045,temp:0.05},'18':{name:'Cher',base:0.045,temp:0.05},'19':{name:'Corrèze',base:0.045,temp:0.05},'20':{name:'Corse',base:0.045,temp:0.05},'21':{name:"Côte-d'Or",base:0.045,temp:0.05},'22':{name:"Côtes-d'Armor",base:0.045,temp:0.05},'23':{name:'Creuse',base:0.045,temp:0.05},'24':{name:'Dordogne',base:0.045,temp:0.05},'25':{name:'Doubs',base:0.045,temp:0.05},'26':{name:'Drôme',base:0.045,temp:0.045},'27':{name:'Eure',base:0.045,temp:0.05},'28':{name:'Eure-et-Loir',base:0.045,temp:0.05},'29':{name:'Finistère',base:0.045,temp:0.05},'30':{name:'Gard',base:0.045,temp:0.05},'31':{name:'Haute-Garonne',base:0.045,temp:0.05},'32':{name:'Gers',base:0.045,temp:0.05},'33':{name:'Gironde',base:0.045,temp:0.05},'34':{name:'Hérault',base:0.045,temp:0.05},'35':{name:'Ille-et-Vilaine',base:0.045,temp:0.05},'36':{name:'Indre',base:0.038,temp:0.038},'37':{name:'Indre-et-Loire',base:0.045,temp:0.05},'38':{name:'Isère',base:0.045,temp:0.05},'39':{name:'Jura',base:0.045,temp:0.05},'40':{name:'Landes',base:0.045,temp:0.05},'41':{name:'Loir-et-Cher',base:0.045,temp:0.05},'42':{name:'Loire',base:0.045,temp:0.05},'43':{name:'Haute-Loire',base:0.045,temp:0.05},'44':{name:'Loire-Atlantique',base:0.045,temp:0.05},'45':{name:'Loiret',base:0.045,temp:0.05},'46':{name:'Lot',base:0.045,temp:0.05},'47':{name:'Lot-et-Garonne',base:0.045,temp:0.05},'48':{name:'Lozère',base:0.045,temp:0.045},'49':{name:'Maine-et-Loire',base:0.045,temp:0.05},'50':{name:'Manche',base:0.045,temp:0.05},'51':{name:'Marne',base:0.045,temp:0.05},'52':{name:'Haute-Marne',base:0.045,temp:0.05},'53':{name:'Mayenne',base:0.045,temp:0.05},'54':{name:'Meurthe-et-Moselle',base:0.045,temp:0.05},'55':{name:'Meuse',base:0.045,temp:0.05},'56':{name:'Morbihan',base:0.045,temp:0.05},'57':{name:'Moselle',base:0.045,temp:0.05},'58':{name:'Nièvre',base:0.045,temp:0.05},'59':{name:'Nord',base:0.045,temp:0.05},'60':{name:'Oise',base:0.045,temp:0.045},'61':{name:'Orne',base:0.045,temp:0.05},'62':{name:'Pas-de-Calais',base:0.045,temp:0.05},'63':{name:'Puy-de-Dôme',base:0.045,temp:0.05},'64':{name:'Pyrénées-Atlantiques',base:0.045,temp:0.05},'65':{name:'Hautes-Pyrénées',base:0.038,temp:0.045},'66':{name:'Pyrénées-Orientales',base:0.045,temp:0.05},'67/68':{name:'Alsace',base:0.045,temp:0.05},'69A':{name:'Métropole de Lyon',base:0.045,temp:0.05},'69B':{name:'Rhône (hors Métropole de Lyon)',base:0.045,temp:0.05},'70':{name:'Haute-Saône',base:0.045,temp:0.05},'71':{name:'Saône-et-Loire',base:0.045,temp:0.05},'72':{name:'Sarthe',base:0.045,temp:0.05},'73':{name:'Savoie',base:0.045,temp:0.05},'74':{name:'Haute-Savoie',base:0.045,temp:0.05},'75':{name:'Paris',base:0.045,temp:0.05},'76':{name:'Seine-Maritime',base:0.045,temp:0.05},'77':{name:'Seine-et-Marne',base:0.045,temp:0.05},'78':{name:'Yvelines',base:0.045,temp:0.05},'79':{name:'Deux-Sèvres',base:0.045,temp:0.05},'80':{name:'Somme',base:0.045,temp:0.05},'81':{name:'Tarn',base:0.045,temp:0.05},'82':{name:'Tarn-et-Garonne',base:0.045,temp:0.05},'83':{name:'Var',base:0.045,temp:0.05},'84':{name:'Vaucluse',base:0.045,temp:0.05},'85':{name:'Vendée',base:0.045,temp:0.05},'86':{name:'Vienne',base:0.045,temp:0.05},'87':{name:'Haute-Vienne',base:0.045,temp:0.05},'88':{name:'Vosges',base:0.045,temp:0.05},'89':{name:'Yonne',base:0.045,temp:0.05},'90':{name:'Territoire-de-Belfort',base:0.045,temp:0.05},'91':{name:'Essonne',base:0.045,temp:0.05},'92':{name:'Hauts-de-Seine',base:0.045,temp:0.05},'93':{name:'Seine-Saint-Denis',base:0.045,temp:0.05},'94':{name:'Val-de-Marne',base:0.045,temp:0.05},'95':{name:"Val-d'Oise",base:0.045,temp:0.05},'971':{name:'Guadeloupe',base:0.045,temp:0.045},'972':{name:'Martinique',base:0.045,temp:0.05},'973':{name:'Guyane',base:0.045,temp:0.05},'974':{name:'La Réunion',base:0.045,temp:0.05},'976':{name:'Mayotte',base:0.038,temp:0.045}};
  // Copropriété de 1 425 000 € à 2 000 000 € : valeurs du « Barème rapide A1 » 2025 fourni par l'étude le 12/10 (la colonne
  // relevée avant reprenait celle du terrain). Au-delà de 2 000 000 €, le barème se prolonge (interpolerBaremeFraisActe).
  // Pour chaque type de bien, un barème {palier de prix: [émoluments, trésor à 4,5 %]} — les mêmes
  // paliers que le tableau fourni par l'étude, interpolés linéairement entre deux paliers connus
  // (voir interpolerBaremeFraisActe). Trésor à un taux départemental différent de 4,5 % : voir
  // calculerFraisActe(), qui interpole entre la colonne à 4,5 % et une colonne à 5 % reconstituée.
  var BAREME_FRAIS_ACTE = {"house":{"500":[90,70],"1000":[100,100],"1500":[150,140],"2250":[230,200],"3000":[300,250],"3750":[380,310],"4500":[450,370],"5250":[530,430],"6000":[600,490],"6750":[680,550],"7500":[750,610],"8250":[830,660],"9000":[900,720],"9750":[980,780],"10500":[1050,840],"11250":[1130,900],"12000":[1200,960],"12750":[1280,1020],"13500":[1310,1060],"14250":[1320,1110],"15000":[1330,1160],"16500":[1360,1250],"18000":[1370,1340],"19500":[1390,1430],"21000":[1410,1530],"22500":[1420,1620],"24000":[1440,1710],"25500":[1450,1800],"27000":[1470,1890],"28500":[1490,1980],"30000":[1500,2080],"32000":[1520,2200],"34000":[1540,2320],"36000":[1570,2440],"38000":[1590,2570],"40000":[1610,2690],"42000":[1630,2810],"44000":[1650,2930],"46000":[1670,3060],"48000":[1690,3180],"50000":[1720,3300],"52000":[1740,3420],"54000":[1760,3550],"56000":[1780,3670],"58000":[1800,3790],"60000":[1820,3910],"62000":[1840,4030],"64000":[1850,4160],"66000":[1870,4280],"68000":[1890,4400],"70000":[1900,4520],"72000":[1920,4640],"74000":[1930,4760],"76000":[1950,4880],"78000":[1970,5000],"80000":[1980,5130],"83000":[2010,5310],"86000":[2030,5490],"89000":[2050,5670],"92000":[2080,5850],"95000":[2100,6040],"100000":[2140,6340],"105000":[2180,6640],"110000":[2220,6950],"115000":[2260,7250],"120000":[2300,7550],"125000":[2340,7860],"130000":[2380,8160],"135000":[2420,8460],"140000":[2460,8770],"150000":[2540,9370],"165000":[2660,10280],"180000":[2780,11190],"195000":[2900,12100],"210000":[3020,13010],"225000":[3140,13920],"240000":[3260,14830],"255000":[3380,15740],"270000":[3500,16650],"285000":[3620,17560],"300000":[3740,18470],"315000":[3860,19380],"330000":[3980,20290],"345000":[4100,21200],"360000":[4220,22110],"375000":[4340,23020],"390000":[4460,23930],"405000":[4580,24840],"420000":[4700,25750],"435000":[4820,26660],"450000":[4940,27570],"480000":[5180,29390],"510000":[5420,31210],"540000":[5660,33030],"570000":[5900,34850],"600000":[6140,36670],"630000":[6380,38490],"660000":[6620,40310],"690000":[6860,42130],"720000":[7100,43950],"750000":[7330,45770],"825000":[7930,50320],"900000":[8530,54870],"975000":[9130,59420],"1050000":[9730,63970],"1125000":[10330,68520],"1200000":[10930,73070],"1275000":[11530,77620],"1350000":[12130,82170],"1425000":[12730,86720],"1500000":[13330,91270],"1750000":[15320,106440],"2000000":[17320,121600]},"condo":{"500":[90,70],"1000":[100,100],"1500":[150,140],"2250":[230,200],"3000":[300,250],"3750":[380,310],"4500":[450,370],"5250":[530,430],"6000":[600,490],"6750":[680,550],"7500":[750,610],"8250":[830,660],"9000":[900,720],"9750":[980,780],"10500":[1050,840],"11250":[1130,900],"12000":[1200,960],"12750":[1280,1020],"13500":[1350,1070],"14250":[1430,1130],"15000":[1460,1180],"16500":[1480,1270],"18000":[1500,1370],"19500":[1520,1460],"21000":[1530,1550],"22500":[1550,1640],"24000":[1560,1730],"25500":[1580,1830],"27000":[1600,1920],"28500":[1610,2010],"30000":[1630,2100],"32000":[1650,2220],"34000":[1670,2350],"36000":[1690,2470],"38000":[1710,2590],"40000":[1730,2710],"42000":[1750,2840],"44000":[1780,2960],"46000":[1800,3080],"48000":[1820,3200],"50000":[1840,3330],"52000":[1860,3450],"54000":[1880,3570],"56000":[1900,3690],"58000":[1920,3810],"60000":[1950,3940],"62000":[1960,4060],"64000":[1980,4180],"66000":[1990,4300],"68000":[2010,4420],"70000":[2030,4540],"72000":[2040,4670],"74000":[2060,4790],"76000":[2070,4910],"78000":[2090,5030],"80000":[2110,5150],"83000":[2130,5330],"86000":[2150,5510],"89000":[2180,5700],"92000":[2200,5880],"95000":[2230,6060],"100000":[2270,6360],"105000":[2310,6670],"110000":[2350,6970],"115000":[2390,7270],"120000":[2430,7580],"125000":[2470,7880],"130000":[2510,8180],"135000":[2550,8490],"140000":[2590,8790],"150000":[2670,9400],"165000":[2790,10310],"180000":[2910,11220],"195000":[3020,12130],"210000":[3140,13040],"225000":[3260,13950],"240000":[3380,14860],"255000":[3500,15770],"270000":[3620,16680],"285000":[3740,17590],"300000":[3860,18500],"315000":[3980,19410],"330000":[4100,20320],"345000":[4220,21230],"360000":[4340,22140],"375000":[4460,23050],"390000":[4580,23960],"405000":[4700,24870],"420000":[4820,25780],"435000":[4940,26690],"450000":[5060,27600],"480000":[5300,29420],"510000":[5540,31240],"540000":[5780,33060],"570000":[6020,34880],"600000":[6260,36700],"630000":[6500,38520],"660000":[6740,40340],"690000":[6980,42160],"720000":[7220,43980],"750000":[7460,45800],"825000":[8060,50350],"900000":[8660,54900],"975000":[9260,59450],"1050000":[9860,64000],"1125000":[10460,68550],"1200000":[11050,73100],"1275000":[11650,77650],"1350000":[12250,82190],"1425000":[12850,86740],"1500000":[13450,91290],"1750000":[15450,106460],"2000000":[17450,121630]},"land":{"500":[90,70],"1000":[100,100],"1500":[150,140],"2250":[230,200],"3000":[300,250],"3750":[380,310],"4500":[450,370],"5250":[530,430],"6000":[600,490],"6750":[680,550],"7500":[750,610],"8250":[830,660],"9000":[900,720],"9750":[980,780],"10500":[1030,830],"11250":[1040,880],"12000":[1050,930],"12750":[1070,970],"13500":[1080,1020],"14250":[1090,1060],"15000":[1100,1110],"16500":[1130,1200],"18000":[1140,1300],"19500":[1160,1390],"21000":[1180,1480],"22500":[1190,1570],"24000":[1210,1660],"25500":[1220,1760],"27000":[1240,1850],"28500":[1260,1940],"30000":[1270,2030],"32000":[1290,2150],"34000":[1310,2280],"36000":[1340,2400],"38000":[1360,2520],"40000":[1380,2640],"42000":[1400,2760],"44000":[1420,2890],"46000":[1440,3010],"48000":[1460,3130],"50000":[1480,3250],"52000":[1510,3380],"54000":[1530,3500],"56000":[1550,3620],"58000":[1570,3740],"60000":[1590,3870],"62000":[1610,3990],"64000":[1620,4110],"66000":[1640,4230],"68000":[1660,4350],"70000":[1670,4470],"72000":[1690,4590],"74000":[1700,4720],"76000":[1720,4840],"78000":[1740,4960],"80000":[1750,5080],"83000":[1780,5260],"86000":[1800,5440],"89000":[1820,5630],"92000":[1850,5810],"95000":[1870,5990],"100000":[1910,6290],"105000":[1950,6600],"110000":[1990,6900],"115000":[2030,7200],"120000":[2070,7510],"125000":[2110,7810],"130000":[2150,8110],"135000":[2190,8420],"140000":[2230,8720],"150000":[2310,9330],"165000":[2430,10240],"180000":[2550,11150],"195000":[2670,12060],"240000":[3030,14790],"255000":[3150,15700],"270000":[3270,16610],"285000":[3390,17520],"300000":[3510,18430],"315000":[3630,19340],"330000":[3750,20250],"345000":[3870,21160],"360000":[3990,22070],"375000":[4110,22980],"390000":[4230,23890],"405000":[4350,24800],"420000":[4470,25710],"435000":[4590,26620],"450000":[4710,27530],"480000":[4950,29350],"510000":[5190,31170],"540000":[5430,32990],"570000":[5670,34810],"600000":[5910,36630],"630000":[6150,38450],"660000":[6390,40270],"690000":[6630,42090],"720000":[6860,43910],"750000":[7100,45730],"825000":[7700,50270],"900000":[8300,54820],"975000":[8900,59370],"1050000":[9500,63920],"1125000":[10100,68470],"1200000":[10700,73020],"1275000":[11300,77570],"1350000":[11900,82120],"1425000":[12500,86670],"1500000":[13100,91220],"1750000":[15090,106390],"2000000":[17090,121560]}};

  function interpolerBaremeFraisActe(table, prix) {
    const paliers = Object.keys(table).map(Number).sort((a, b) => a - b);
    if (prix <= paliers[0]) return table[paliers[0]];
    // Au-delà du dernier palier (2 M€) : la pente du dernier tronçon prolongée — émoluments et droits
    // restent proportionnels au prix (audit 12/10 : 3 M€ donnait le montant de 2 M€).
    if (prix >= paliers[paliers.length - 1]) {
      const bas = paliers[paliers.length - 2], haut = paliers[paliers.length - 1];
      return table[haut] + (table[haut] - table[bas]) * (prix - haut) / (haut - bas);
    }
    for (let i = 1; i < paliers.length; i++) {
      if (prix <= paliers[i]) {
        const bas = paliers[i - 1], haut = paliers[i];
        const t = (prix - bas) / (haut - bas);
        return table[bas] + (table[haut] - table[bas]) * t;
      }
    }
  }

  // Le calcul de provision, extrait de calculerFraisActe() (qui lit le DOM) pour être réutilisable
  // et testable : le générateur d'appel de fonds s'en sert pour CONTRÔLER le montant de frais
  // annoncé sur un décompte. Une seule formule pour les deux usages — deux copies divergeraient.
  // `eligiblePrimoAccedant` : primo-accédant ET résidence principale, seul cas où la hausse
  // départementale temporaire ne s'applique pas (voir la note affichée sous le simulateur).
  // Forfaits ajoutés à toute provision : taxe LCB-FT (300 € depuis le 19/10/2026, étude : « met 300 euros au lieu de 200 ») et débours du tableau.
  var TAXE_LCBFT_FRAIS_ACTE = 300;
  var DEBOURS_FRAIS_ACTE = 200;
  function estimerFraisActe(prix, cleDepartement, typeBien, eligiblePrimoAccedant) {
    const dept = DEPARTEMENTS_FRAIS_ACTE[cleDepartement];
    const bareme = BAREME_FRAIS_ACTE[typeBien];
    const montant = Number(prix);
    if (!dept || !bareme || !Number.isFinite(montant) || montant <= 0) return null;
    const tauxApplique = eligiblePrimoAccedant ? dept.base : dept.temp;
    const emoluments = interpolerBaremeFraisActe(Object.fromEntries(Object.entries(bareme).map(([k, v]) => [k, v[0]])), montant);
    const tresor45 = interpolerBaremeFraisActe(Object.fromEntries(Object.entries(bareme).map(([k, v]) => [k, v[1]])), montant);
    const tresor50 = tresor45 + montant * 0.0051185;
    const tresor = tresor45 + ((tauxApplique - 0.045) / 0.005) * (tresor50 - tresor45);
    return { emoluments, tresor, tauxApplique, total: emoluments + TAXE_LCBFT_FRAIS_ACTE + tresor + DEBOURS_FRAIS_ACTE };
  }

  // Pure : le détail de la ligne « Trésor » (rapport du 18/10 : 20.005,55 € pour un détail recalculé à 20.003,50 €). Le montant reste celui du
  // barème de l'étude (validé le 02/10), dont la colonne à 4,5 % est arrondie à la dizaine : l'écart est dit, jamais corrigé.
  // DMTO = taux départemental + 2,37 % de frais d'assiette sur ce taux + 1,2 % communal ; CSI 0,1 % (15 € au moins) ; TVA 20 % des émoluments.
  function detailTresorFraisActe(prix, tauxApplique, emoluments, tresor) {
    const arrondi = x => Math.round(x * 100) / 100;
    const dmto = arrondi(prix * (tauxApplique * 1.0237 + 0.012));
    const csi = arrondi(Math.max(15, prix * 0.001));
    const tva = arrondi(emoluments * 0.2);
    const somme = arrondi(dmto + csi + tva);
    return { dmto, csi, tva, somme, ecart: arrondi(tresor - somme) };
  }

  function formaterPourcentageFraisActe(x) {
    return (x * 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 5 }) + ' %';
  }

  // Recalculée à chaque changement de champ (voir les attributs oninput/onchange sur
  // #onglet-calculateur dans index.html) — aucune sauvegarde, purement une estimation à la volée.
  function calculerFraisActe() {
    const prixEl = document.getElementById('calc-price');
    const deptEl = document.getElementById('calc-dept');
    const typeEl = document.getElementById('calc-type');
    if (!prixEl || !deptEl || !typeEl || !deptEl.value) return;

    // Le champ part vide (demandé par l'étude) : tant qu'aucun prix n'est saisi, on n'affiche pas
    // un résultat calculé sur une valeur de repli — il aurait l'air d'une vraie provision.
    // Lu à la française (« 250.000,00 ») ; une saisie refusée est dite sous le champ (étude 24/10).
    const prixSaisi = controlerChampSaisie(prixEl, { positif: true });
    const mobilierEl = document.getElementById('calc-mobilier');
    // Le mobilier n'est qu'une partie du prix : au-delà, il n'est pas déduit, et le champ le dit (étude 24/10).
    const mobilier = controlerChampSaisie(mobilierEl, prixSaisi > 0
      ? { max: prixSaisi - 0.01, messageMax: 'Le mobilier doit être inférieur au prix : il n\'est pas déduit.' } : {}) || 0;
    if (!(prixSaisi > 0)) {
      document.getElementById('calc-tag').textContent = '';
      document.getElementById('calc-total').textContent = '—';
      if (document.getElementById('calc-tre-detail')) document.getElementById('calc-tre-detail').textContent = '';
      for (const id of ['calc-emol', 'calc-tre', 'calc-total2', 'calc-base-rate', 'calc-applied-rate', 'calc-dmt-rate']) {
        document.getElementById(id).textContent = '—';
      }
      document.getElementById('calc-saving').textContent = '';
      document.getElementById('calc-regime').textContent = 'Saisissez un prix pour obtenir la provision.';
      // Sans prix : la phrase seule, plus la grande boîte grise à tirets (étude 24/10).
      const carteVide = document.getElementById('calc-total').closest('.calc-card');
      if (carteVide) carteVide.classList.add('calc-carte-vide');
      return;
    }
    const carteResultat = document.getElementById('calc-total').closest('.calc-card');
    if (carteResultat) carteResultat.classList.remove('calc-carte-vide');

    // Le mobilier compris dans le prix sort de l'assiette des droits de mutation (art. 735 CGI) :
    // le barème s'applique au seul prix de l'immeuble.
    const prix = assietteImmobiliere(Math.max(1, prixSaisi), mobilier);
    const mobilierDeduit = prix < prixSaisi;
    const primoAccedant = document.querySelector('input[name="calc-first"]:checked').value === 'yes';
    const residencePrincipale = document.querySelector('input[name="calc-rp"]:checked').value === 'yes';
    const type = typeEl.value;
    const dept = DEPARTEMENTS_FRAIS_ACTE[deptEl.value];

    // Hausse temporaire du taux départemental (loi de finances 2025, jusqu'à 5 %) non appliquée au
    // primo-accédant achetant sa résidence principale (art. L. 31-10-3 du CCH) — voir la note
    // affichée sous le résultat.
    const eligiblePrimoAccedant = primoAccedant && residencePrincipale;
    const estimation = estimerFraisActe(prix, deptEl.value, type, eligiblePrimoAccedant);
    if (!estimation) return;
    const { emoluments, tresor, tauxApplique, total } = estimation;
    const dmto = tauxApplique + 0.012 + tauxApplique * 0.0237;

    const libelleType = type === 'house' ? 'Immeuble hors copropriété' : type === 'condo' ? 'Immeuble en copropriété' : 'Terrain à bâtir';
    document.getElementById('calc-tag').textContent = libelleType + ' · ' + (eligiblePrimoAccedant ? 'Primo-accédant éligible' : 'Régime sans exonération de la hausse')
      + (mobilierDeduit ? ' · assiette hors mobilier : ' + formaterPrix(prix) : '');
    document.getElementById('calc-emol').textContent = formaterPrix(emoluments);
    document.getElementById('calc-tre').textContent = formaterPrix(tresor);
    const detailTre = document.getElementById('calc-tre-detail');
    if (detailTre) {
      const dt = detailTresorFraisActe(prix, tauxApplique, emoluments, tresor);
      detailTre.textContent = `dont DMTO ${formaterPrix(dt.dmto)} + CSI ${formaterPrix(dt.csi)} + TVA sur émoluments ${formaterPrix(dt.tva)} = ${formaterPrix(dt.somme)}`
        + (Math.abs(dt.ecart) >= 0.01 ? ` · arrondi du barème de l’étude : ${dt.ecart > 0 ? '+' : '−'}${formaterPrix(Math.abs(dt.ecart))}` : '');
    }
    document.getElementById('calc-total2').textContent = formaterPrix(total);
    document.getElementById('calc-total').textContent = formaterPrix(total);
    document.getElementById('calc-base-rate').textContent = formaterPourcentageFraisActe(dept.base);
    document.getElementById('calc-applied-rate').textContent = formaterPourcentageFraisActe(tauxApplique);
    document.getElementById('calc-dmt-rate').textContent = formaterPourcentageFraisActe(dmto);

    const economie = (dept.temp - dept.base) * prix * 1.0237;
    document.getElementById('calc-saving').textContent = (eligiblePrimoAccedant && dept.temp > dept.base)
      ? 'Économie liée à la non-application de la hausse départementale : environ ' + formaterPrix(economie) + '.'
      : '';
    document.getElementById('calc-regime').textContent = eligiblePrimoAccedant
      ? 'Primo-accédant : taux départemental de droit commun ' + formaterPourcentageFraisActe(dept.base) + ' ; la hausse temporaire de ' + formaterPourcentageFraisActe(dept.temp - dept.base) + ' n’est pas appliquée.'
      : 'Taux départemental appliqué : ' + formaterPourcentageFraisActe(dept.temp) + ' au 1er juin 2026.';
  }

  // ==== SIMULATEUR DE PRORATA (taxe foncière, charges de copropriété, loyer) ====
  //
  // Demandé par l'étude : répartir entre vendeur et acquéreur une somme déjà appelée pour une
  // période que la vente coupe en deux. Trois cas, une seule règle de calcul.
  //
  // CONVENTION IMPOSÉE PAR L'ÉTUDE, à ne pas changer sans nouvelle demande explicite :
  //   - jours RÉELS sur la période réelle (365 jours, 366 une année bissextile — pas de mois de
  //     30 jours ni d'année de 360) ;
  //   - le JOUR DE L'ACTE est à la charge de l'ACQUÉREUR. Il compte donc dans sa part.
  // Tout le reste en découle : la part du vendeur est le complément, jamais recalculée à part
  // (sans quoi un arrondi pourrait faire que les deux parts ne totalisent plus la somme appelée).
  //
  // Fonctions pures, déclarées en `function`/`var` : testables depuis tests/helpers/load-app.js.

  // Nombre de jours entre deux dates ISO, bornes comprises. Passe par Date.UTC plutôt que par des
  // dates locales : sur un changement d'heure (fin mars, fin octobre en France), une différence de
  // millisecondes entre deux dates locales ne fait pas un multiple exact de 86 400 000 et le
  // résultat se décalait d'un jour.
  function joursEntre(debutIso, finIso) {
    if (!debutIso || !finIso) return null;
    const a = new Date(debutIso + 'T00:00:00Z');
    const b = new Date(finIso + 'T00:00:00Z');
    if (isNaN(a) || isNaN(b)) return null;
    return Math.round((b - a) / 86400000) + 1;
  }

  // Répartit `montant`, appelé pour la période [debut, fin], entre le vendeur et l'acquéreur à la
  // date de l'acte. Renvoie null si les données ne permettent pas un calcul sûr — jamais un chiffre
  // approximatif : c'est une somme qui sera réclamée à un client.
  function calculerProrata(montant, debutIso, finIso, dateActeIso) {
    const total = Number(montant);
    if (!Number.isFinite(total) || total <= 0) return null;
    const joursPeriode = joursEntre(debutIso, finIso);
    if (!joursPeriode || joursPeriode <= 0) return null;
    // L'acte doit tomber DANS la période : hors d'elle, il n'y a rien à répartir (la somme est
    // entièrement à l'un ou à l'autre), et le signaler vaut mieux que de rendre 0 % ou 100 % comme
    // si le calcul avait un sens.
    if (dateActeIso < debutIso || dateActeIso > finIso) return null;

    // Jour de l'acte inclus dans la part de l'acquéreur : sa période court de la date de l'acte à
    // la fin, bornes comprises.
    const joursAcquereur = joursEntre(dateActeIso, finIso);
    const joursVendeur = joursPeriode - joursAcquereur;
    const partAcquereur = Math.round(total * joursAcquereur / joursPeriode * 100) / 100;
    return {
      total,
      joursPeriode,
      joursVendeur,
      joursAcquereur,
      // Le complément, pas un second arrondi : les deux parts totalisent toujours exactement la
      // somme appelée, ce qu'un double arrondi ne garantirait pas (écart d'un centime).
      partVendeur: Math.round((total - partAcquereur) * 100) / 100,
      partAcquereur,
      pourcentageAcquereur: joursAcquereur / joursPeriode
    };
  }

  // Bornes de la période contenant `dateIso`, pour le découpage choisi. Le dernier jour est calculé
  // en reculant d'un jour depuis le premier jour de la période suivante : la seule façon sûre de
  // tomber juste sur un 28/29 février ou un mois de 30 jours.
  function bornesPeriodeProrata(dateIso, periode) {
    if (!dateIso) return null;
    const d = new Date(dateIso + 'T00:00:00Z');
    if (isNaN(d)) return null;
    const annee = d.getUTCFullYear();
    const mois = d.getUTCMonth();
    let debutMois;
    let nbMois;
    if (periode === 'mois') { debutMois = mois; nbMois = 1; }
    else if (periode === 'trimestre') { debutMois = Math.floor(mois / 3) * 3; nbMois = 3; }
    else { debutMois = 0; nbMois = 12; }
    const debut = new Date(Date.UTC(annee, debutMois, 1));
    const finExclue = new Date(Date.UTC(annee, debutMois + nbMois, 1));
    const fin = new Date(finExclue.getTime() - 86400000);
    const iso = (x) => `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`;
    return { debut: iso(debut), fin: iso(fin) };
  }

  // Bornes à poser après un changement : la période choisie autour de la date de l'acte, sauf des
  // bornes saisies à la main qui contiennent encore la date (audit 12/10 : appel du 01/07 au 30/06,
  // changer la date de l'acte réécrivait la période en année civile).
  function bornesProrataApresChangement(dateActe, periode, debut, fin, manuelles) {
    if (manuelles && debut && fin && dateActe && dateActe >= debut && dateActe <= fin) return null;
    return bornesPeriodeProrata(dateActe, periode);
  }

  let bornesProrataManuelles = false;
  function noterBornesProrataManuelles() {
    bornesProrataManuelles = true;
    calculerProrataAffichage();
  }

  function majPeriodeProrata(depuisPeriode) {
    if (depuisPeriode === true) bornesProrataManuelles = false;
    const dateActe = document.getElementById('prorata-date').value;
    const periode = document.getElementById('prorata-periode').value;
    const bornes = bornesProrataApresChangement(dateActe, periode,
      document.getElementById('prorata-debut').value, document.getElementById('prorata-fin').value, bornesProrataManuelles);
    if (bornes) {
      document.getElementById('prorata-debut').value = bornes.debut;
      document.getElementById('prorata-fin').value = bornes.fin;
    }
    calculerProrataAffichage();
  }

  function calculerProrataAffichage() {
    const lu = controlerChampSaisie(document.getElementById('prorata-montant'), { positif: true });
    const montant = lu === null ? NaN : lu;
    const debut = document.getElementById('prorata-debut').value;
    const fin = document.getElementById('prorata-fin').value;
    const dateActe = document.getElementById('prorata-date').value;
    const resultat = calculerProrata(montant, debut, fin, dateActe);
    const bloc = document.getElementById('prorata-resultat');
    const erreur = document.getElementById('prorata-erreur');

    if (!resultat) {
      bloc.style.display = 'none';
      erreur.style.display = 'block';
      erreur.textContent = (dateActe && debut && fin && (dateActe < debut || dateActe > fin))
        ? 'La date de l’acte doit tomber dans la période appelée : hors d’elle, il n’y a rien à répartir.'
        : 'Renseignez un montant, une période et une date d’acte pour obtenir la répartition.';
      return;
    }
    erreur.style.display = 'none';
    bloc.style.display = 'block';

    document.getElementById('prorata-part-acquereur').textContent = formaterPrixCentimes(resultat.partAcquereur);
    document.getElementById('prorata-part-vendeur').textContent = formaterPrixCentimes(resultat.partVendeur);
    document.getElementById('prorata-jours-acquereur').textContent =
      `${resultat.joursAcquereur} jour${resultat.joursAcquereur > 1 ? 's' : ''} sur ${resultat.joursPeriode}`;
    document.getElementById('prorata-jours-vendeur').textContent =
      `${resultat.joursVendeur} jour${resultat.joursVendeur > 1 ? 's' : ''} sur ${resultat.joursPeriode}`;
    // formaterPourcentageFraisActe() attend un RATIO (elle multiplie par 100 elle-même) et va
    // jusqu'à 5 décimales, utile pour un taux fiscal mais bruyant ici : deux décimales suffisent
    // pour une part de période.
    document.getElementById('prorata-pourcentage').textContent =
      (resultat.pourcentageAcquereur * 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      + ' % de la période à la charge de l’acquéreur';
    document.getElementById('prorata-detail').textContent =
      `${formaterPrixCentimes(resultat.total)} × ${resultat.joursAcquereur} / ${resultat.joursPeriode} jours`;
  }

  // Positionne la date du jour et la période par défaut au premier affichage, puis calcule.
  // La date posée d'office suit le jour (rapport du 18/10 : l'outil ouvert la veille proposait encore la date de la veille) ;
  // une date saisie ou reprise d'un dossier ne bouge pas.
  let prorataInitialise = false;
  var prorataDateAuto = '';
  function initProrata() {
    const champDate = document.getElementById('prorata-date');
    const auj = isoAujourdHui();
    const dateDuJour = champDate && (!champDate.value || (champDate.value === prorataDateAuto && prorataDateAuto !== auj));
    if (dateDuJour) {
      champDate.value = auj; prorataDateAuto = auj;
      // Toute date saisie ou posée ensuite (fiche, assistant) n'est plus celle d'office, même égale au jour.
      if (!champDate.dataset.suiviJour) { champDate.dataset.suiviJour = '1'; champDate.addEventListener('input', () => { prorataDateAuto = ''; }); }
    }
    if (prorataInitialise && !dateDuJour) return;
    prorataInitialise = true;
    majPeriodeProrata();
  }
