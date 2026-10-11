
  // Dernières erreurs techniques de la page, jointes automatiquement à un signalement de problème
  // (voir envoyerSignalement) : un collaborateur décrit ce qu'il voit, pas la pile d'erreur qu'il
  // ne voit pas — c'est souvent elle qui donne la cause. Posé ici, en tête de fichier, pour
  // attraper aussi les erreurs du démarrage. Gardé en mémoire seulement, jamais stocké.
  var MAX_ERREURS_TAMPON = 10;
  var erreursRecentes = [];

  // Pure et testable : ajoute une erreur au tampon, sans doublon consécutif, borné.
  function ajouterErreurTampon(tampon, entree, max) {
    if (!entree || !entree.message) return tampon;
    const derniere = tampon[tampon.length - 1];
    if (derniere && derniere.message === entree.message && derniere.source === entree.source) {
      derniere.fois = (derniere.fois || 1) + 1;
      derniere.at = entree.at;
      return tampon;
    }
    tampon.push({ message: String(entree.message).slice(0, 500), source: entree.source || '', at: entree.at || '' });
    while (tampon.length > (max || MAX_ERREURS_TAMPON)) tampon.shift();
    return tampon;
  }

  // Fichier du poste qui n'a pas pu être chargé (rapport du 08/10 : « majsEnAttenteAuthentic is not defined », « renderWidgetAssistant
  // is not defined » — reproduit en coupant le chargement d'un fichier de client/, ce qui arrive quand la fenêtre se recharge
  // pendant que le serveur redémarre après une mise à jour) : la page restait incomplète jusqu'au F5. Elle se recharge seule
  // quelques secondes plus tard, trois fois au plus par onglet ; le compteur repart à zéro dès qu'un chargement est complet.
  var CLE_RECHARGE_SCRIPT_MANQUANT = 'claire-recharge-script';
  var scriptPosteManquant = false;
  function rechargerApresScriptManquant() {
    if (scriptPosteManquant) return;
    scriptPosteManquant = true;
    let n = 0;
    try { n = Number(sessionStorage.getItem(CLE_RECHARGE_SCRIPT_MANQUANT)) || 0; } catch (e) { /* stockage bloqué */ }
    try { noterJournalTechnique({ categorie: 'erreur-poste', message: `Fichier du poste non chargé (essai ${n + 1})`, source: 'chargement' }); } catch (e) { /* journal facultatif */ }
    if (n >= 3) return;
    try { sessionStorage.setItem(CLE_RECHARGE_SCRIPT_MANQUANT, String(n + 1)); } catch (e) { /* stockage bloqué */ }
    setTimeout(() => location.reload(), 3000 * (n + 1));
  }
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('error', (e) => {
      const t = e && e.target;
      if (t && t.tagName === 'SCRIPT' && /\/(?:client|commun|vendor)\//.test(t.src || '')) rechargerApresScriptManquant();
    }, true);
    window.addEventListener('load', () => {
      if (!scriptPosteManquant) { try { sessionStorage.removeItem(CLE_RECHARGE_SCRIPT_MANQUANT); } catch (e) { /* stockage bloqué */ } }
    });
  }

  // Journal technique (30/09, voir server/src/rapportTechnique.js) : les erreurs du navigateur, les
  // corrections faites à la main après une extraction et la lecture des scans partent au serveur,
  // qui les résume dans le rapport technique anonymisé de 12 h et 17 h. Seuls des champs neutres
  // partent (message d'erreur, nom du champ corrigé, durée) — jamais une valeur de dossier ; le
  // serveur refiltre par liste blanche (routes/rapportTechnique.js). Envoi groupé, au plus une fois
  // par minute ; un échec ne relance rien (la file est simplement vidée).
  var fileJournalTechnique = [];
  var envoiJournalTechniquePrevu = false;
  var MAX_FILE_JOURNAL_TECHNIQUE = 50;
  function noterJournalTechnique(evenement) {
    if (!evenement || !evenement.categorie) return;
    try {
      const e = Object.assign({ version: typeof VERSION_APP !== 'undefined' ? VERSION_APP : '' }, evenement);
      if (e.categorie === 'erreur-poste' && typeof ongletActuel !== 'undefined') e.onglet = (typeof LIBELLES_ONGLETS !== 'undefined' && LIBELLES_ONGLETS[ongletActuel]) || String(ongletActuel || '');
      if (fileJournalTechnique.length >= MAX_FILE_JOURNAL_TECHNIQUE) return;
      fileJournalTechnique.push(e);
      if (!envoiJournalTechniquePrevu && typeof setTimeout === 'function') {
        envoiJournalTechniquePrevu = true;
        setTimeout(envoyerJournalTechnique, 60000);
      }
    } catch (err) { /* jamais bloquant */ }
  }
  async function envoyerJournalTechnique() {
    envoiJournalTechniquePrevu = false;
    const lot = fileJournalTechnique.splice(0, MAX_FILE_JOURNAL_TECHNIQUE);
    if (!lot.length || typeof fetchAvecAuth !== 'function') return;
    try {
      await fetchAvecAuth('/api/journal-technique', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ evenements: lot }) });
    } catch (err) { /* serveur injoignable : ces événements sont perdus, sans conséquence */ }
  }

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('error', (e) => {
      const source = e && e.filename ? `${String(e.filename).split('/').pop()}:${e.lineno || '?'}` : '';
      ajouterErreurTampon(erreursRecentes, { message: (e && e.message) || 'Erreur', source, at: new Date().toISOString() });
      noterJournalTechnique({ categorie: 'erreur-poste', message: (e && e.message) || 'Erreur', source });
    });
    window.addEventListener('unhandledrejection', (e) => {
      const r = e && e.reason;
      const message = (r && (r.message || String(r))) || 'Promesse rejetée';
      ajouterErreurTampon(erreursRecentes, { message, source: 'promesse', at: new Date().toISOString() });
      // La pile d'une promesse rejetée donne la ligne fautive (script.js:1234) au rapport technique.
      const pile = r && r.stack ? String(r.stack).split('\n').slice(0, 4).join(' | ') : '';
      noterJournalTechnique({ categorie: 'erreur-poste', message: pile && !pile.includes(message) ? `${message} | ${pile}` : (pile || message), source: 'promesse' });
    });
  }

  // localStorage peut refuser d'écrire (mode privé, quota, stockage bloqué) : jamais bloquant (audit 04/10).
  function ecrireLocal(cle, valeur) {
    try { localStorage.setItem(cle, valeur); return true; } catch (e) { return false; }
  }

  // Envoi par Entrée (composants Web Awesome, 04/10) : pour le navigateur, un bouton wa-button d’envoi (type submit) n’est pas le
  // « bouton par défaut » d'un formulaire — Entrée dans un champ n'envoyait plus rien. Rétabli pour tout formulaire qui
  // n'a pas de bouton d'envoi natif.
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.defaultPrevented || e.isComposing || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
      const champ = e.target;
      if (!champ || champ.tagName !== 'INPUT' || ['checkbox', 'radio', 'button', 'submit', 'file', 'reset'].includes(champ.type)) return;
      const form = champ.form;
      if (!form || form.querySelector('button[type="submit"], input[type="submit"]')) return;
      if (!form.querySelector('wa-button[type="submit"]:not([disabled])')) return;
      e.preventDefault();
      form.requestSubmit();
    });
    // Libellé d’un interrupteur wa-switch (Réglages : toute la ligne est un <label>) : le navigateur ne bascule pas un
    // composant à shadow DOM au clic sur son libellé. Un clic hors de l’interrupteur le bascule comme avant.
    document.addEventListener('click', (e) => {
      const cible = e.target;
      if (!cible || !cible.closest || cible.closest('wa-switch, a, button, wa-button, input, select, textarea, .info-i')) return;
      const libelle = cible.closest('label');
      if (!libelle) return;
      const inter = libelle.htmlFor ? document.getElementById(libelle.htmlFor) : libelle.querySelector('wa-switch');
      if (!inter || inter.localName !== 'wa-switch' || inter.disabled) return;
      e.preventDefault();
      inter.click();
    });
  }

  let dossiers = [];
  let detectedDates = []; // {iso, label, contexte, suggestion}
  let autresEnCours = []; // {id, label, iso, active}
  let dateCompromisDetectee = '';
  let dateCompromisEstimee = false;
  let dernierTexteTraite = '';
  let compteurAutre = 0;
  let echeanceActive = { pret: true, acte: true, ventebien: false };
  let pdfActuel = null;
  let pdfDernierePageUtile = 1;
  // Nom EXACT du fichier PDF importé pour créer le dossier (jamais le PDF lui-même, qui n'est pas
  // conservé — voir CLAUDE.md). Enregistré sur le dossier (d.compromisNomFichier) et utilisé par
  // ouvrirCompromisTrouve() pour rouvrir le bon avant-contrat : signalé par l'étude, la recherche
  // floue "compromis"/"promesse" ramenait souvent l'avant-contrat d'une VENTE PRÉALABLE, rangé
  // dans le même dossier local et portant lui aussi ces mots dans son nom.
  let compromisNomFichierImporte = '';
  let frontieresPagesActuelles = null; // découpage du texte concaténé par page, pour retrouver la page d'une date
  let pageParType = { pret: null, acte: null, ventebien: null }; // page où chaque échéance a été repérée
  // Vrai quand la date pré-remplie a été choisie parmi plusieurs candidates de même catégorie sans
  // formulation de délai permettant de trancher (voir meilleureCandidateEcheance) — confiance
  // "incertain" plutôt que "auto" au moment d'enregistrer le dossier.
  let ambiguiteParType = { pret: false, acte: false, ventebien: false };
  // Vrai quand la date pré-remplie a été calculée à partir d'une formulation approximative
  // ("fin septembre 2026", "délai de 30 jours à compter de la signature", "J+30") plutôt que lue
  // telle quelle — confiance "estime" plutôt que "auto" (voir detecterDatesDepuisTexte).
  let approxParType = { pret: false, acte: false, ventebien: false };
  let analyseJuridiqueActuelle = { documents: [], engagements: [] };
  // Incrémenté à chaque nouvel import (traiterFichierPdf) et à chaque reset du formulaire
  // (reinitialiserFormulaire) — permet à lancerExtractionIa() de vérifier, une fois sa réponse
  // reçue, qu'elle porte encore sur l'import en cours plutôt que sur un import précédent déjà
  // enregistré ou abandonné (l'appel au LLM local peut prendre plusieurs dizaines de secondes).
  let generationImportActuel = 0;

  // ---- icônes ----
  // Un seul jeu d'icônes, dessiné à la main, pour toute l'application — remplace les emoji semés
  // au fil des évolutions successives (🔥 🔒 ⚠️ 📄 ✉️ 🔗 💰 📍 🧠 👁 📋 🤝 ☰ ⏳...), qui n'ont ni la
  // même épaisseur de trait ni le même style entre eux et changent de dessin d'un système
  // d'exploitation à l'autre. Grille 16x16, trait 1.4, extrémités arrondies — même recette que
  // iconeCalendrierSeuil() (déjà en place, voir plus bas) pour ne pas juxtaposer deux langages
  // graphiques. Dimensionnées en 1em (voir .icone dans style.css) : une icône suit la taille de
  // police du texte/bouton qui la contient, sans réglage au cas par cas à chaque usage.
  const ICONES = {
    // Caméra (visio ADNOV).
    video: '<rect x="1.5" y="4" width="9.5" height="8" rx="1.6"/><path d="M11 7.2 14.5 5v6L11 8.8"/>',
    layout: '<rect x="1.5" y="2" width="13" height="12" rx="1.6"/><line x1="6" y1="2" x2="6" y2="14"/>',
    // Fiche à côté (étude 11/10) : volet ancré à droite / revenir en pleine page.
    'volet-droit': '<rect x="1.5" y="2" width="13" height="12" rx="1.6"/><line x1="9.5" y1="2" x2="9.5" y2="14"/>',
    'plein-ecran': '<path d="M2 6V2.5h3.5M14 6V2.5h-3.5M2 10v3.5h3.5M14 10v3.5h-3.5"/>',
    // Tableau de bord (étude 05/10 : « change d'icône ») : des tuiles de tailles différentes, comme ses widgets.
    'tableau-bord': '<rect x="1.8" y="1.8" width="5.4" height="6.6" rx="1.3"/><rect x="8.8" y="1.8" width="5.4" height="3.8" rx="1.3"/><rect x="8.8" y="7.2" width="5.4" height="7" rx="1.3"/><rect x="1.8" y="10" width="5.4" height="4.2" rx="1.3"/>',
    // Trombone (joindre un fichier) et avion en papier (envoyer un email).
    paperclip: '<path d="M13.5 7.5 8 13a3.2 3.2 0 0 1-4.5-4.5l6-6a2.1 2.1 0 0 1 3 3L6.6 11.4a1 1 0 0 1-1.5-1.5L10.5 4.5"/>',
    send: '<path d="M14.5 1.5 7 9"/><path d="M14.5 1.5 10 14.5 7 9 1.5 6z"/>',
    plus: '<line x1="8" y1="3" x2="8" y2="13"/><line x1="3" y1="8" x2="13" y2="8"/>',
    minus: '<line x1="3.5" y1="8" x2="12.5" y2="8"/>',
    // Bannette à papier (Claire Scan) : un plateau et deux feuilles.
    bannette: '<path d="M1.8 9.2 3.4 5.2h9.2l1.6 4v3.6a.9.9 0 0 1-.9.9H2.7a.9.9 0 0 1-.9-.9z"/><path d="M1.8 9.2h3.6l.9 1.6h3.4l.9-1.6h3.6"/><path d="M4.6 5.2V2.6h6.8v2.6"/><line x1="6.2" y1="4" x2="9.8" y2="4"/>',
    list: '<circle cx="2.3" cy="4" r="0.9" fill="currentColor" stroke="none"/><line x1="5.4" y1="4" x2="14" y2="4"/><circle cx="2.3" cy="8" r="0.9" fill="currentColor" stroke="none"/><line x1="5.4" y1="8" x2="14" y2="8"/><circle cx="2.3" cy="12" r="0.9" fill="currentColor" stroke="none"/><line x1="5.4" y1="12" x2="14" y2="12"/>',
    menu: '<line x1="2.4" y1="4.5" x2="13.6" y2="4.5"/><line x1="2.4" y1="8" x2="13.6" y2="8"/><line x1="2.4" y1="11.5" x2="13.6" y2="11.5"/>',
    // Copier (copier-coller d'un rendez-vous de l'agenda) : deux feuilles décalées.
    copier: '<rect x="5.2" y="5.2" width="8.8" height="8.8" rx="1.4"/><path d="M10.8 5.2V3.4a1.4 1.4 0 0 0-1.4-1.4H3.4A1.4 1.4 0 0 0 2 3.4v6a1.4 1.4 0 0 0 1.4 1.4h1.8"/>',
    download: '<path d="M8 2v8"/><path d="M4.5 7 8 10.5 11.5 7"/><path d="M3 13.5h10"/>',
    search: '<circle cx="7" cy="7" r="4.3"/><line x1="10.2" y1="10.2" x2="14" y2="14"/>',
    clock: '<circle cx="8" cy="8" r="6.2"/><path d="M8 4.6V8l2.4 1.6"/>',
    'alert-triangle': '<path d="M8 2.3 14.4 13.2a0.9 0.9 0 0 1-0.8 1.3H2.4a0.9 0.9 0 0 1-0.8-1.3L8 2.3Z" stroke-linejoin="round"/><line x1="8" y1="6" x2="8" y2="9.3"/><circle cx="8" cy="11.5" r="0.8" fill="currentColor" stroke="none"/>',
    'file-text': '<path d="M4 2h5.5L12 4.5V14H4Z" stroke-linejoin="round"/><path d="M9.5 2v2.5H12"/><line x1="6" y1="8" x2="10" y2="8"/><line x1="6" y1="10.5" x2="9" y2="10.5"/>',
    mail: '<rect x="1.4" y="3.5" width="13.2" height="9" rx="1.4"/><path d="M2 4.3 8 9l6-4.7"/>',
    phone: '<path d="M4.3 1.9 5.9 4.6a1 1 0 0 1-.2 1.3l-1 .8a8 8 0 0 0 4.6 4.6l.8-1a1 1 0 0 1 1.3-.2l2.7 1.6a1 1 0 0 1 .4 1.2l-.5 1.2a1.6 1.6 0 0 1-1.7 1A11.6 11.6 0 0 1 1.9 3.8a1.6 1.6 0 0 1 1-1.7l1.2-.5a1 1 0 0 1 .2.3Z" stroke-linejoin="round"/>',
    sun: '<circle cx="8" cy="8" r="2.8"/><path d="M8 1.6v1.6M8 12.8v1.6M1.6 8h1.6M12.8 8h1.6M3.5 3.5l1.1 1.1M11.4 11.4l1.1 1.1M12.5 3.5l-1.1 1.1M4.6 11.4l-1.1 1.1"/>',
    calendar: '<rect x="1.5" y="2.8" width="13" height="11.2" rx="1.7"/><rect x="1.5" y="2.8" width="13" height="3" rx="1" fill="currentColor" opacity="0.22" stroke="none"/><line x1="4.6" y1="1.3" x2="4.6" y2="3.6"/><line x1="11.4" y1="1.3" x2="11.4" y2="3.6"/>',
    link: '<path d="M6.6 9.4 9.4 6.6"/><path d="M7 4.2 8.3 2.9a2.6 2.6 0 0 1 3.7 3.7L9.7 8"/><path d="M9 11.8 7.7 13.1a2.6 2.6 0 0 1-3.7-3.7L6.3 8"/>',
    eye: '<path d="M1.3 8S3.8 3.3 8 3.3 14.7 8 14.7 8 12.2 12.7 8 12.7 1.3 8 1.3 8Z" stroke-linejoin="round"/><circle cx="8" cy="8" r="2.1"/>',
    folder: '<path d="M1.6 4.3a1 1 0 0 1 1-1h3.2l1.3 1.6h6.3a1 1 0 0 1 1 1v7.2a1 1 0 0 1-1 1H2.6a1 1 0 0 1-1-1V4.3Z" stroke-linejoin="round"/>',
    clipboard: '<rect x="3" y="2.8" width="10" height="11.7" rx="1.4"/><rect x="5.8" y="1.5" width="4.4" height="2.3" rx="0.8" fill="currentColor" stroke="none"/><line x1="5.5" y1="7.5" x2="10.5" y2="7.5"/><line x1="5.5" y1="10" x2="10.5" y2="10"/>',
    sparkle: '<path d="M8 1.8 9 6l4.2 1-4.2 1L8 12.2 7 8 2.8 7 7 6 8 1.8Z" stroke-linejoin="round"/>',
    // Bouclier : la pseudonymisation locale, avant tout envoi à un service extérieur.
    shield: '<path d="M8 1.6 13.2 3.5v4.2c0 3.1-2.2 5.6-5.2 6.7-3-1.1-5.2-3.6-5.2-6.7V3.5L8 1.6Z" stroke-linejoin="round"/><path d="M5.6 8 7.3 9.7 10.5 6.3"/>',
    lock: '<rect x="3.3" y="7.2" width="9.4" height="7" rx="1.4"/><path d="M5.3 7.2V5a2.7 2.7 0 0 1 5.4 0v2.2"/>',
    upload: '<path d="M8 10.3V2.3"/><path d="M4.6 5.7 8 2.3l3.4 3.4"/><path d="M2.4 13.5h11.2"/>',
    key: '<circle cx="5.2" cy="5.2" r="2.8"/><path d="M7.2 7.2 13.5 13.5"/><path d="M11 10 12.6 8.4"/>',
    spinner: '<path d="M14 8a6 6 0 1 1-2-4.5"/>',
    banknote: '<rect x="1.3" y="4.3" width="13.4" height="7.4" rx="1.4"/><circle cx="8" cy="8" r="1.9"/>',
    'map-pin': '<path d="M8 14.3S13 9.7 13 6.2A5 5 0 0 0 3 6.2C3 9.7 8 14.3 8 14.3Z" stroke-linejoin="round"/><circle cx="8" cy="6.2" r="1.7"/>',
    pencil: '<path d="M11.1 2.3a1.5 1.5 0 0 1 2.1 2.1L5.4 12.2l-2.9.7.7-2.9 7.9-7.7Z" stroke-linejoin="round"/>',
    x: '<line x1="3.5" y1="3.5" x2="12.5" y2="12.5"/><line x1="12.5" y1="3.5" x2="3.5" y2="12.5"/>',
    check: '<path d="M3 8.4 6.4 11.8 13 4.6" stroke-linejoin="round"/>',
    'liste-puces': '<circle cx="2.8" cy="4.3" r="0.9" fill="currentColor" stroke="none"/><circle cx="2.8" cy="8.3" r="0.9" fill="currentColor" stroke="none"/><circle cx="2.8" cy="12.3" r="0.9" fill="currentColor" stroke="none"/><path d="M6 4.3H14M6 8.3H14M6 12.3H14"/>',
    'liste-numeros': '<path d="M2.2 3.2 3.2 2.6V6M2.2 6H4.2M2.1 9.6a1 1 0 0 1 2 .3c0 .8-2 1.6-2 2.6h2.1"/><path d="M6.6 4.3H14M6.6 8.3H14M6.6 12.3H14"/>',
    'effacer-format': '<path d="M3.5 3.2h8M7.5 3.2 5.6 12.8"/><path d="M10 9.6l3.6 3.6M13.6 9.6 10 13.2"/>',
    'list-check': '<path d="M1.8 4.2 3 5.4 5.2 3M1.8 8.2 3 9.4 5.2 7M1.8 12.2 3 13.4 5.2 11"/><path d="M7.6 4.3H14M7.6 8.3H14M7.6 12.3H14"/>',
    'bar-chart': '<path d="M3 13.5V8.5M8 13.5V3.5M13 13.5V6.5" stroke-linecap="round"/><path d="M1.8 13.8h12.4"/>',
    'trend-up': '<path d="M2.5 12 6.8 7.7 9.3 10.2 13.5 6"/><path d="M9.5 6h4v4"/>',
    'trend-down': '<path d="M2.5 4 6.8 8.3 9.3 5.8 13.5 10"/><path d="M9.5 10h4v-4"/>',
    info: '<circle cx="8" cy="8" r="6.2"/><line x1="8" y1="7.2" x2="8" y2="11.3"/><circle cx="8" cy="4.9" r="0.9" fill="currentColor" stroke="none"/>',
    'chevron-down': '<path d="M3.5 6 8 10.5 12.5 6"/>',
    'chevron-up': '<path d="M3.5 10 8 5.5 12.5 10"/>',
    'chevron-left': '<path d="M10 3.5 5.5 8 10 12.5"/>',
    'chevron-right': '<path d="M6 3.5 10.5 8 6 12.5"/>',
    'rotate-ccw': '<path d="M13.3 8A5.3 5.3 0 1 1 10.8 3.4"/><path d="M13.6 2.6v3.6h-3.6"/>',
    // Prorata : un disque coupé en deux parts inégales — une somme répartie entre deux parties.
    // Même grille 16x16 et même trait que le reste du jeu.
    'part-disque': '<circle cx="8" cy="8" r="5.6"/><path d="M8 2.4V8l4 3.8"/>',
    // Balance à deux plateaux : l'arbitrage du forfait mobilier met en regard ce que la prisée
    // fait gagner et ce qu'elle coûte. Même grille 16x16 et même trait 1.4 que le reste du jeu.
    book: '<path d="M3 2.5h8.2a1.3 1.3 0 0 1 1.3 1.3v9.7H4.3A1.3 1.3 0 0 1 3 12.2z"/><path d="M3 12.2a1.3 1.3 0 0 1 1.3-1.3h8.2"/><line x1="6" y1="5.6" x2="9.8" y2="5.6"/>',
    users: '<circle cx="6" cy="5.4" r="2.2"/><path d="M2 13c0-2.2 1.8-3.8 4-3.8s4 1.6 4 3.8"/><path d="M10.4 3.3a2.1 2.1 0 0 1 0 4.2"/><path d="M11.6 9.4c1.4.4 2.4 1.7 2.4 3.6"/>',
    scale: '<line x1="8" y1="3.2" x2="8" y2="13.2"/><line x1="5.2" y1="13.2" x2="10.8" y2="13.2"/><line x1="3" y1="4.4" x2="13" y2="4.4"/><path d="M3 4.4 1.4 8.4h3.2L3 4.4Z" stroke-linejoin="round"/><path d="M13 4.4 11.4 8.4h3.2L13 4.4Z" stroke-linejoin="round"/>',
    // Réglages : une vraie roue crantée (anneau + trou central + 8 dents), demandée par l'étude
    // à la place de l'ancien glyphe en étoile (cercle + rayons, sans anneau — trop proche d'un
    // soleil qu'd'un engrenage). Même trait que le reste du jeu.
    // Drapeau : « Signaler un problème ».
    // Fiche dossier (tiroir) : barre d'actions à icônes seules et lignes de propriétés.
    archive: '<rect x="1.8" y="2.6" width="12.4" height="3.2" rx="0.8"/><path d="M2.8 5.8v6.8a1 1 0 0 0 1 1h8.4a1 1 0 0 0 1-1V5.8"/><line x1="6.4" y1="8.4" x2="9.6" y2="8.4"/>',
    trash: '<path d="M2.6 4.2h10.8"/><path d="M6.2 4.2V2.6h3.6v1.6"/><path d="M3.8 4.2l.7 9.2a1 1 0 0 0 1 .9h5a1 1 0 0 0 1-.9l.7-9.2" stroke-linejoin="round"/>',
    printer: '<path d="M4.4 5.6V1.8h7.2v3.8"/><rect x="1.6" y="5.6" width="12.8" height="5.6" rx="1.2"/><rect x="4.4" y="9.2" width="7.2" height="5" rx="0.6"/>',
    maximize: '<path d="M9.4 2.2h4.4v4.4"/><path d="M13.8 2.2 9 7"/><path d="M6.6 13.8H2.2V9.4"/><path d="M2.2 13.8 7 9"/>',
    minimize: '<path d="M13.6 6.4H9.6V2.4"/><path d="M9.6 6.4 14 2"/><path d="M2.4 9.6h4v4"/><path d="M6.4 9.6 2 14"/>',
    home: '<path d="M2 7.4 8 2.4l6 5"/><path d="M3.6 6.2v7.4h8.8V6.2" stroke-linejoin="round"/><path d="M6.6 13.6V9.8h2.8v3.8"/>',
    user: '<circle cx="8" cy="5.2" r="2.6"/><path d="M2.8 14c0-2.8 2.3-4.8 5.2-4.8s5.2 2 5.2 4.8"/>',
    flag: '<path d="M3.6 14.4V2.2"/><path d="M3.6 2.8h8.6l-1.9 3.1 1.9 3.1H3.6"stroke-linejoin="round"/>',
    settings: '<circle cx="8" cy="8" r="4.6"/><circle cx="8" cy="8" r="1.6"/><line x1="12.6" y1="8" x2="14.1" y2="8"/><line x1="11.3" y1="4.7" x2="12.3" y2="3.7"/><line x1="8" y1="3.4" x2="8" y2="1.9"/><line x1="4.7" y1="4.7" x2="3.7" y2="3.7"/><line x1="3.4" y1="8" x2="1.9" y2="8"/><line x1="4.7" y1="11.3" x2="3.7" y2="12.3"/><line x1="8" y1="12.6" x2="8" y2="14.1"/><line x1="11.3" y1="11.3" x2="12.3" y2="12.3"/>',
    // En-tête du groupe « Outils » de la sidebar (repliable) : un simple coffret, dans le même
    // esprit que les autres pictos géométriques du jeu.
    package: '<path d="M8 1.6 14 5v6L8 14.4 2 11V5Z" stroke-linejoin="round"/><path d="M2 5 8 8.4 14 5"/><line x1="8" y1="8.4" x2="8" y2="14.4"/>',
    // Épingle (« garder la sidebar toujours ouverte ») : une tête + une tige, pour rester dans le
    // même vocabulaire minimal (pas une punaise/pin réaliste).
    pin: '<circle cx="8" cy="5" r="3.1"/><line x1="8" y1="8" x2="8" y2="14.2"/>'
  };
  // `cls` porte les classes de mise en page (taille via font-size hérité, marge...) ; `spin` anime
  // une rotation continue (voir @keyframes icone-spin) pour les icônes d'attente (ex. "spinner").
  function icone(nom, cls, spin) {
    const chemin = ICONES[nom];
    if (!chemin) return '';
    return `<svg class="icone${cls ? ' ' + cls : ''}${spin ? ' icone-spin' : ''}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${chemin}</svg>`;
  }

  const MOIS = {
    'janvier':0,'février':1,'fevrier':1,'mars':2,'avril':3,'mai':4,'juin':5,
    'juillet':6,'août':7,'aout':7,'septembre':8,'octobre':9,'novembre':10,
    'décembre':11,'decembre':11
  };

  function toISO(y, mIndex, d) {
    return `${y}-${pad(mIndex+1)}-${pad(d)}`;
  }

  function extraireDateDeFragment(str) {
    let m = str.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
    if (m) {
      const d = parseInt(m[1], 10), mo = parseInt(m[2], 10), y = parseInt(m[3], 10);
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return toISO(y, mo - 1, d);
    }
    const moisNoms = Object.keys(MOIS).join('|');
    // (?:er)? : le 1er jour du mois s'écrit toujours en ordinal ("le 1er janvier"), jamais "le 1
    // janvier" — sans ce groupe, cette date très fréquente en tête de compromis n'était jamais
    // reconnue.
    const re2 = new RegExp(`(\\d{1,2})(?:er)?\\s+(${moisNoms})\\s+(\\d{4})`, 'i');
    m = str.match(re2);
    if (m) {
      const d = parseInt(m[1], 10);
      const moKey = m[2].toLowerCase();
      const y = parseInt(m[3], 10);
      if (MOIS.hasOwnProperty(moKey)) return toISO(y, MOIS[moKey], d);
    }
    return null;
  }

  // ---- date écrite entièrement en lettres (en-tête d'un acte authentique) ----
  //
  // Tout acte reçu par notaire s'ouvre par sa date en toutes lettres, et par elle seule :
  //     L'AN DEUX MILLE VINGT-SIX,
  //     Le VINGT TROIS JUILLET
  // C'est le marqueur de date le plus fiable qui soit sur cette famille d'actes — il est imposé
  // par la forme authentique — et il n'était pas reconnu du tout. Sur le corpus, deux actes en
  // renvoient même explicitement à l'en-tête pour leur date (« … aux lieu, jour, mois et an
  // indiqués en en-tête du présent acte »), leur bloc de signature n'en portant aucune.
  var MOTS_NOMBRES = {
    zero: 0, un: 1, une: 1, premier: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7,
    huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15,
    seize: 16, vingt: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60,
    cent: 100, cents: 100, mille: 1000
  };

  // « VINGT TROIS » = 23, « DIX-SEPT » = 17, « TRENTE ET UN » = 31, « DEUX MILLE VINGT-SIX » = 2026.
  // Renvoie null dès qu'un mot n'est pas un nombre : mieux vaut ne rien lire qu'inventer une date.
  function nombreFrancaisEnChiffres(texte) {
    const mots = String(texte || '')
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .split(/[\s-]+/)
      .filter(mot => mot && mot !== 'et');
    if (!mots.length) return null;
    let total = 0;
    let courant = 0;
    for (const mot of mots) {
      const valeur = MOTS_NOMBRES[mot];
      if (valeur === undefined) return null;
      if (valeur === 1000) { total += (courant || 1) * 1000; courant = 0; }
      else if (valeur === 100) { courant = (courant || 1) * 100; }
      else courant += valeur;
    }
    return total + courant;
  }

  // L'année et le jour sont lus en DEUX TEMPS, et non par un seul motif : en une seule passe, le
  // groupe de l'année (paresseux, et fait des mêmes caractères que le reste) pouvait avaler le
  // « LE » de la ligne suivante quand aucune virgule ne les séparait — l'année devenait « DEUX
  // MIL », le jour « VINGT-CINQ LE DIX-SEPT », et la date entière était perdue. L'année s'arrête
  // donc à la fin de sa ligne (ou à sa virgule), et le jour est cherché juste après.
  var RE_AN_EN_LETTRES = /l['’]an\s+([A-Za-zÀ-ÿ\s-]{5,45}?)\s*(?=[,.\n])/i;
  var RE_JOUR_MOIS_EN_LETTRES = new RegExp(
    '\\ble\\s+([A-Za-zÀ-ÿ\\s-]{3,30}?)\\s+(' + Object.keys(MOIS).join('|') + ')\\b',
    'i'
  );
  var PORTEE_JOUR_APRES_AN = 120;

  function detecterDateEnToutesLettres(texte) {
    const source = String(texte || '');
    const mAn = RE_AN_EN_LETTRES.exec(source);
    if (!mAn) return null;
    const annee = nombreFrancaisEnChiffres(mAn[1]);
    if (annee === null || annee < 1900 || annee > 2200) return null;
    const apresAn = mAn.index + mAn[0].length;
    const mJour = RE_JOUR_MOIS_EN_LETTRES.exec(source.slice(apresAn, apresAn + PORTEE_JOUR_APRES_AN));
    if (!mJour) return null;
    const jour = nombreFrancaisEnChiffres(mJour[1]);
    const mois = MOIS[mJour[2].toLowerCase()];
    if (jour === null || jour < 1 || jour > 31 || mois === undefined) return null;
    return toISO(annee, mois, jour);
  }

  // Détecte automatiquement la date de signature du compromis lui-même (qui peut être électronique,
  // avec une date par partie : on retient alors la plus récente), pour écarter ensuite tout ce qui
  // lui est antérieur (diagnostics, actes précédents…).
  function detecterDateCompromis(texte) {
    const patterns = [
      // [^,.\n] (et non [^,\n]) dans les groupes qui précèdent un "le" obligatoire : un nom de lieu
      // ou une clause courte ne contient jamais de point, alors qu'un [^,\n] permissif laisse le
      // moteur de regex backtracker À TRAVERS une phrase entière pour aller chercher un "le" plus
      // loin dans le texte (ex. « ... à compter de la signature. Le vendeur s'engage... ») — cas
      // réel rencontré : le motif "a signé" ci-dessous capturait alors "vendeur s'engage à produire
      // ce document" comme si c'était la date de signature, un bug bien pire que ne rien détecter.
      /fait\s+(?:à|a)\s+[^,.\n]{0,60},?\s*le\s+([^\n,.;]{6,40})/gi,
      /le\s+pr[ée]sent\s+(?:compromis|promesse)(?:\s+de\s+vente)?\s+(?:est\s+)?(?:sign[ée]|[ée]tabli|conclu)\s+(?:à\s+[^,.\n]{0,40},?\s*)?le\s+([^\n,.;]{6,40})/gi,
      /(?:compromis|promesse)\s+de\s+vente\s+en\s+date\s+du\s+([^\n,.;]{6,40})/gi,
      /sign[ée]\s+[ée]lectroniquement\s+le\s+([^\n,.;]{6,40})/gi,
      /date\s+de\s+signature(?:\s+[ée]lectronique)?\s*:?\s*([^\n,.;]{6,40})/gi,
      /derni[èe]re\s+signature\s+(?:le\s+)?([^\n,.;]{6,40})/gi,
      // Bloc de signature électronique par partie (Yousign/DocuSign) qui ne nomme ni "compromis" ni
      // "promesse" ni le mot "électroniquement" : "Mme X a signé à BLOIS le 22 juillet 2026",
      // répété une fois par signataire. Cas réel : sans ce motif, aucune des dates ci-dessus ne
      // matchait, et `dateCompromis` restait vide — désactivant le filtre "écarte tout ce qui est
      // antérieur à la signature" pour tout le reste de l'extraction (voir detecterDatesDepuisTexte).
      /\ba\s+sign[ée]\s+(?:[àa]\s+[^,.\n]{0,40}\s+)?le\s+([^\n,.;]{6,40})/gi
    ];
    const dates = [];
    for (const re of patterns) {
      let m;
      while ((m = re.exec(texte)) !== null) {
        const iso = extraireDateDeFragment(m[1]);
        if (iso) dates.push(iso);
      }
    }
    // Repli : la date en toutes lettres de l'en-tête d'un acte authentique (voir
    // detecterDateEnToutesLettres). Volontairement en REPLI et non en premier : quand un bloc de
    // signature porte une date explicite, c'est lui qui fait foi — l'en-tête peut avoir été
    // préparé avant la signature effective.
    if (dates.length === 0) return detecterDateEnToutesLettres(texte);
    // Signature électronique = une date par partie : on retient la plus récente (dernière signature).
    dates.sort();
    return dates[dates.length - 1];
  }

  // Repère une éventuelle mention d'un achat sans recours à un prêt.
  // Attention : "paiement comptant" seul est un FAUX AMI — cette formule désigne presque toujours
  // le règlement du solde en une fois à la signature de l'acte, pas l'absence de prêt.
  // On ne se fie donc qu'à des marqueurs juridiques non ambigus (dont la renonciation Scrivener). Ajoutés le 05/10 sur deux
  // promesses réelles : « n'entend pas contracter d'emprunt », « déclare ne pas vouloir recourir à un prêt ».
  const CASH_RE = /ne\s+recourt?\s+pas\s+[àa]\s+(?:un\s+)?(?:pr[êe]t|emprunt)|sans\s+recours\s+[àa]\s+(?:un\s+)?(?:pr[êe]t|emprunt)|sans\s+financement\s+bancaire|sans\s+condition\s+suspensive\s+d.obtention\s+de\s+pr[êe]t|renonce\s+(?:express[ée]ment\s+)?au\s+b[ée]n[ée]fice\s+(?:des\s+dispositions\s+)?de\s+l.article\s*l\.?\s*313|d[ée]clare\s+ne\s+pas\s+recourir\s+[àa]\s+(?:un\s+)?(?:pr[êe]t|emprunt)|financement\s+(?:se\s+fera|r[ée]alis[ée])\s+(?:exclusivement\s+)?(?:sur|par)\s+(?:ses\s+)?fonds\s+propres|ne\s+recourir\s+[àa]\s+aucun\s+(?:pr[êe]t|emprunt)|absence\s+de\s+condition\s+suspensive\s+d['’]?\s*obtention\s+(?:d['’]un\s+|de\s+|du\s+)?pr[êe]t|n['’]entend\s+pas\s+(?:contracter|recourir\s+[àa])\s+(?:d['’]\s*|un\s+|aucun\s+)?(?:emprunt|pr[êe]t)|ne\s+pas\s+vouloir\s+recourir\s+[àa]\s+(?:un\s+)?(?:pr[êe]t|emprunt)/i;

  function detecterFinancementComptant(texte) {
    return CASH_RE.test(texte);
  }

  // Marqueurs juridiques propres à une vente de lot en copropriété (statut de la loi du 10 juillet
  // 1965), plutôt qu'une simple mention isolée de "copropriété" qui pourrait apparaître pour
  // d'autres raisons (ex. un diagnostic mentionnant un immeuble voisin).
  // Bug corrigé : signalé par l'étude, une vraie vente de lot restait classée "maison" par défaut
  // — la formulation la plus courante ("soumis au régime de la copropriété", juste avant la mention
  // du lot sous le tableau parcellaire) n'était pas reconnue, seul "statut de la copropriété"
  // l'était. "régime de la copropriété" ajouté en conséquence.
  const COPROPRIETE_RE = /lot\s+(?:de\s+)?copropri[ée]t[ée]|r[èe]glement\s+de\s+copropri[ée]t[ée]|syndicat\s+des\s+copropri[ée]taires|[ée]tat\s+descriptif\s+de\s+division|(?:statut|r[ée]gime)\s+de\s+la\s+copropri[ée]t[ée]|loi\s+(?:n[°ºo]\s*)?65-557|loi\s+du\s+10\s+juillet\s+1965/i;

  // Bug corrigé : signalé par l'étude, une vraie maison individuelle (pas de division en lots)
  // ressortait classée "copropriété". La désignation d'une maison comporte très souvent une clause
  // qui écarte explicitement ce statut, précisément pour lever toute ambiguïté — ex. « Le bien
  // vendu n'est pas soumis au statut de la copropriété » — et cette négation contient elle-même le
  // motif recherché par COPROPRIETE_RE, qui se déclenchait donc à tort. À l'inverse, une vraie
  // copropriété décrit le bien par son numéro de lot ET sa quote-part de parties communes
  // (tantièmes/millièmes) — une maison n'a ni l'un ni l'autre. Vérifie donc, pour chaque occurrence
  // de COPROPRIETE_RE, qu'elle n'est pas précédée d'une formule de négation.
  // Le PARTICIPE PRÉSENT (« ne relevANT pas du statut de la copropriété ») manquait, alors que
  // c'est la forme la plus courante de cette clause de style dans les actes réels du corpus.
  const NEGATION_COPROPRIETE_RE = /(?:n['’]est|n['’]en\s+est|ne\s+sont)\s+pas\s+soumis|non\s+soumis|ne\s+rel[èe]v(?:e|ent|ant)\s+pas|ne\s+d[ée]pend(?:ent|ant)?\s+pas|hors\s+copropri[ée]t[ée]|[àa]\s+l['’]exclusion\s+du\s+statut/i;

  // Une mention CONDITIONNELLE (« … au Syndicat des copropriétaires s'il y a lieu ») ne dit rien
  // du bien vendu : c'est une clause de style qui prévoit le cas où il y en aurait un. Elle
  // faisait passer une maison individuelle pour une copropriété.
  const CONDITIONNEL_COPROPRIETE_RE = /^\s*(?:s['’]il\s+y\s+a\s+lieu|le\s+cas\s+[ée]ch[ée]ant|[ée]ventuel)/i;

  // Fenêtre élargie à 140 caractères : la négation et le motif sont souvent séparés par la
  // référence complète du texte de loi (« ne relevant pas de la loi n° 65-557 du 10 juillet 1965
  // fixant le statut de la copropriété »), qui à elle seule dépasse les 60 caractères d'origine.
  var FENETRE_NEGATION_COPROPRIETE = 140;
  var FENETRE_CONDITIONNEL_COPROPRIETE = 30;

  // Une négation cesse de porter à la fin de sa phrase, et surtout à l'adversative qui la
  // contredit : « Ce lotissement n'est pas soumis au statut de la copropriété …, MAIS le bien
  // vendu constitue le lot de copropriété numéro 3 ». Sans cette borne, élargir la fenêtre pour
  // laisser passer une référence de loi complète faisait retomber la négation sur la mention
  // positive qui la suit.
  var RE_FIN_PORTEE_NEGATION = /[.\n;]|\bmais\b|\btoutefois\b|\ben\s+revanche\b|\bcependant\b|\bn[ée]anmoins\b/gi;

  function porteeNegation(avant) {
    const re = new RegExp(RE_FIN_PORTEE_NEGATION.source, 'gi');
    let coupure = 0;
    let m;
    while ((m = re.exec(avant)) !== null) coupure = m.index + m[0].length;
    return avant.slice(coupure);
  }

  function detecterTypeVenteCopropriete(texte) {
    // Le titre de la trame le dit (étude, 03/10 : compromis d'agence « Compromis de vente - Bien hors
    // copropriété », lu « copropriété » à cause des clauses types qui citent la loi de 1965 et le
    // « règlement de copropriété » parmi les servitudes possibles).
    if (/hors\s+copropri[ée]t[ée]/i.test(String(texte || '').slice(0, 600))) return false;
    const re = new RegExp(COPROPRIETE_RE.source, 'gi');
    let m;
    while ((m = re.exec(texte)) !== null) {
      // Titre de la loi (« loi n° 65-557 du 10 juillet 1965 fixant le statut de la copropriété ») : déjà jugé avec la loi.
      if (/fixant\s+le\s*$/i.test(texte.slice(Math.max(0, m.index - 20), m.index))) continue;
      const avant = porteeNegation(texte.slice(Math.max(0, m.index - FENETRE_NEGATION_COPROPRIETE), m.index));
      if (NEGATION_COPROPRIETE_RE.test(avant)) continue;
      const apres = texte.slice(m.index + m[0].length, m.index + m[0].length + FENETRE_CONDITIONNEL_COPROPRIETE);
      if (CONDITIONNEL_COPROPRIETE_RE.test(apres)) continue;
      return true;
    }
    return false;
  }

  // Adresse du bien : ancrée sur un code postal français (5 chiffres, marqueur fiable et rare
  // ailleurs dans l'acte) précédé de "sis(e) à/au" ou "situé(e) à/au/dans la commune de" — les
  // tournures notariales courantes pour introduire la désignation du bien. Capture tout le
  // fragment jusqu'au code postal puis un peu après (ville), sans dépasser la phrase (borne au
  // point suivant, comme extraireContexte) : un premier jet, pas encore confronté à de vrais
  // compromis autres que ceux déjà vus pour les dates/engagements — à resserrer si un vrai dossier
  // fait remonter un faux positif ou une capture tronquée.
  // Deux formes notariales, qui demandent deux traitements OPPOSÉS de la virgule — d'où
  // l'alternance plutôt qu'un motif unique :
  //  - « sis à ORLEANS (45000), 12 rue de la République » : code postal entre PARENTHÈSES, commune
  //    d'abord, la rue vient APRÈS la virgule — il faut donc la franchir pour ne pas perdre la rue.
  //  - « sise à 14 rue du Moulin 41100 VENDOME, cadastrée section AB numéro 245 » : code postal nu,
  //    la commune termine l'adresse — tout ce qui suit la virgule appartient à la phrase, pas à
  //    l'adresse. Sans cette borne, les 40 caractères pris après le code postal avalaient la
  //    désignation cadastrale ET la tronquaient en plein numéro de parcelle (« numéro 24 »),
  //    faute de place : la fiche affichait un mélange des deux, systématiquement coupé.
  // La forme parenthésée est essayée en premier ; elle ne peut pas matcher la seconde (aucun code
  // postal entre parenthèses), donc l'ordre ne crée pas d'ambiguïté.
  // La préposition est OPTIONNELLE : « un immeuble sis 22 boulevard Gambetta 41000 BLOIS » est une
  // rédaction notariale des plus courantes, où « sis » introduit directement l'adresse sans « à ».
  // Elle était jusqu'ici exigée, et ces désignations-là n'étaient pas détectées du tout — l'adresse
  // restait vide sur la fiche. « sur la commune de » et « se trouvant à » manquaient de même.
  // Le point d'ancrage réel reste le CODE POSTAL, dans la même phrase : c'est lui qui borne la
  // capture, la préposition ne faisait que restreindre inutilement les formulations acceptées.
  const ADRESSE_BIEN_RE = /(?:sis|sise|situ[ée]e?|se\s+trouvant)\s+(?:(?:[àa]|au|sur\s+la\s+commune\s+de|dans\s+la\s+commune\s+de|commune\s+de)\s+)?((?:[^.\n]{3,120}?\(\d{5}\)[^.]{0,40})|(?:[^.\n]{3,120}?\d{5}[^.,;]{0,40}))/i;

  // Forme des adresses dans tout CLAIRE, demandée par l'étude le 29/09 (Saint-Aignan n'était qu'un
  // exemple) : « SAINT-AIGNAN (41110), 2 rue des Cours de Meusnes » — la commune en capitales,
  // tirets et mention CEDEX conservés (précisé par l'étude le même jour), le code postal entre
  // parenthèses, puis la voie telle qu'écrite. Accepte « 2 rue … 41110 Saint-Aignan »,
  // « 2 rue …, 41110 Saint-Aignan », « 41110 Saint-Aignan, 2 rue … » et une adresse déjà normée
  // (idempotente). Une adresse sans code postal reste telle quelle. Le destinataire d'un courrier
  // garde, lui, la présentation postale (voir adressePostaleCourrier). Pures.
  function communeNormee(commune) {
    return String(commune || '').replace(/\s+/g, ' ').trim().toUpperCase();
  }
  // { voie, codePostal, commune } ou null si aucun code postal n'est reconnu.
  function decomposerAdresse(texte) {
    const brut = String(texte || '').replace(/\s*\n+\s*/g, ', ').replace(/\s+/g, ' ').trim();
    if (!brut) return null;
    const commune = '([^,()\\d]+?(?:\\s+cedex(?:\\s*\\d+)?)?)';
    let m = brut.match(/^([^,(]+?)\s*\((\d{5})\)\s*,\s*(.+)$/);
    if (m) return { voie: m[3].trim(), codePostal: m[2], commune: communeNormee(m[1]) };
    m = brut.match(new RegExp('^(\\d{5})\\s+' + commune + '\\s*,\\s*(.+)$', 'i'));
    if (m) return { voie: m[3].trim(), codePostal: m[1], commune: communeNormee(m[2]) };
    m = brut.match(new RegExp('^(.+?)[\\s,]+(\\d{5})\\s+' + commune + '\\s*$', 'i'));
    if (m) return { voie: m[1].replace(/[\s,]+$/, ''), codePostal: m[2], commune: communeNormee(m[3]) };
    return null;
  }
  function normaliserAdresse(texte) {
    const a = decomposerAdresse(texte);
    if (a) return `${a.commune} (${a.codePostal}), ${a.voie}`;
    return String(texte || '').replace(/\s*\n+\s*/g, ', ').replace(/\s+/g, ' ').trim();
  }
  // Adresse du destinataire d'un courrier : présentation postale, la voie puis « 41110 SAINT-AIGNAN »
  // (commune en capitales, CEDEX gardé) sur la dernière ligne. Une adresse saisie sur une seule
  // ligne, ou déjà à la forme CLAIRE, est remise sur deux lignes ; des lignes déjà séparées
  // (résidence, bâtiment…) restent dans leur ordre. Renvoie un tableau de lignes.
  function adressePostaleCourrier(texte) {
    const lignes = String(texte || '').split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const sortie = [];
    lignes.forEach(l => {
      const cpSeul = l.match(/^(\d{5})\s+(.+)$/);
      if (cpSeul) { sortie.push(`${cpSeul[1]} ${communeNormee(cpSeul[2])}`); return; }
      const a = decomposerAdresse(l);
      if (a) { sortie.push(a.voie, `${a.codePostal} ${a.commune}`); return; }
      sortie.push(l);
    });
    return sortie;
  }

  function detecterAdresseBien(texte) {
    const m = ADRESSE_BIEN_RE.exec(texte);
    if (!m) return null;
    return m[1].replace(/\s+/g, ' ').trim().replace(/[,\s]+$/, '');
  }

  // Nom de l'agence immobilière ayant fait signer le compromis — demandé par l'étude pour pouvoir
  // la mentionner dans l'email de "Demande de provision" envoyé à l'acquéreur (voir
  // construireEmailRelanceProvision). Premier jet, comme motifNom en son temps : pas encore
  // confronté à beaucoup de formulations réelles, à resserrer sur retour de l'étude. Ancré sur une
  // tournure d'intermédiation explicite ("par l'intermédiaire de l'agence...", "par l'entremise
  // de...") — jamais sur le seul mot "agence", trop ambigu (agence bancaire, agence France
  // Travail...) pour être un signal fiable à lui seul.
  // Trame d'agence (05/10, deux compromis réels) : « négociées par l'AGENCE   l'Agence Blois Immo  exploitée par la société … »,
  // « … par l'AGENCE   AIM TRANSACTIONS  Montlouis   exploitée par … » — l'article répété et « exploitée par » terminent le nom.
  const AGENCE_RE = /(?:l['’]interm[ée]diaire\s+de\s+(?:l['’]agence\s+)?|par\s+l['’]entremise\s+de\s+(?:l['’]agence\s+)?|n[ée]goci[ée]e?s?\s+par\s+(?:l['’]agence\s+)?|mandat[ée]?e?\s+[àa]\s+l['’]agence\s+|l['’]agence\s+immobili[èe]re\s+)(?:l['’](?=agence))?["«“]?\s*([A-Z0-9][^,.\n(;"»”]{1,60}?)\s*["»”]?(?=\s*[,.;\n(]|\s+(?:sise|situ[ée]e?|dont|repr[ée]sent[ée]e?|immatricul[ée]e?|exploit[ée]e?|avec\s+le\s+concours|qu['’](?:elles?|ils?))(?![A-Za-zÀ-ɏ]))/i;

  function detecterNomAgence(texte) {
    const m = AGENCE_RE.exec(texte);
    if (!m) return null;
    return m[1].replace(/\s+/g, ' ').trim().replace(/[,\s]+$/, '');
  }
  // ---- Honoraires de négociation (demandé par l'étude le 29/09) --------------------------------
  // Qui a négocié la vente (agence ou confrère), combien (TTC) et à la charge de qui. Structure réelle
  // d'une promesse (noms changés) : « REMUNERATION DU MANDATAIRE A LA CHARGE DU PROMETTANT Les
  // parties reconnaissent : - Que les présentes ont été négociées par l'agence "X", par
  // l'intermédiaire de … - Qu'en conformité de ce mandat, il lui est accordé … la somme, TVA incluse,
  // de 15.000,00 €, à titre de rémunération. » Deux pièges vus sur de vrais actes :
  //   - « NEGOCIATION DIRECTE ENTRE LES PARTIES … sans le concours ni la participation d'un
  //     intermédiaire » : aucun honoraire, et le « Frais de négociation … néant » du coût de
  //     l'opération le confirme ;
  //   - les « HONORAIRES DE PROMESSE DE VENTE » (240,00 EUR TTC) sont ceux du NOTAIRE pour l'acte :
  //     jamais des honoraires de négociation. Le motif ne part donc que d'une tournure de
  //     négociation (« négocié(e)s par … »), jamais du seul mot « honoraires ».
  var RE_NEGOCIATION_DIRECTE = /n[ée]goci[ée]e?s\s+directement\s+entre\s+(?:elles|les\s+parties)|sans\s+le\s+concours\s+(?:ni\s+la\s+participation\s+)?d['’]un\s+interm[ée]diaire/i;
  var RE_NEGOCIE_PAR = /n[ée]goci[ée]e?s?\s+par\s+(l['’]agence|l['’]office\s+notarial|l['’][ée]tude|Ma[îi]tre|Me|la\s+soci[ée]t[ée]|la\s+SARL|la\s+SAS|la\s+SCP|la\s+SELARL|la\s+SELAS|le\s+cabinet)\s*["«“]?\s*([^,.;"»”(]{2,70})/i;
  var RE_CHARGE_NEGOCIATION = /[àa]\s+la\s+charge\s+(?:exclusive\s+)?(?:du|de\s+l['’])\s*(PROMETTANT|B[ÉE]N[ÉE]FICIAIRE|VENDEUR|ACQU[ÉE]REUR)/i;
  // Montant avec ou sans séparateur de milliers : « 9 900 € TTC », mais aussi « 14000 € TTC » (trame d'agence, 05/10 —
  // le « 14000 » ne donnait que « 000 », écarté, et les honoraires restaient « À compléter »).
  var RE_MONTANT_TTC = /((?:\d{1,3}(?:[ .  ]\d{3})+|\d+)(?:,\d{2})?)\s*(?:€|eur(?:os?)?)(?![A-Za-zÀ-ɏ])/gi;
  var FENETRE_HONORAIRES = 900;

  function montantHonorairesDansFenetre(fenetre) {
    const re = new RegExp(RE_MONTANT_TTC.source, 'gi');
    const montants = [];
    let m;
    while ((m = re.exec(fenetre)) !== null) {
      const n = montantDepuisTexteFr(m[1]);
      if (!(n > 0)) continue;
      const autour = fenetre.slice(Math.max(0, m.index - 80), m.index + m[0].length + 60);
      montants.push({ n, ttc: /TVA\s+incluse|TTC|toutes\s+taxes\s+comprises|taxes?\s+incluses?/i.test(autour), ht: /\bHT\b|hors\s+taxes?/i.test(autour.slice(80)) });
    }
    const ttc = montants.find(x => x.ttc && !x.ht);
    return ttc ? ttc.n : (montants.find(x => !x.ht) || montants[0] || { n: null }).n;
  }

  // Pure. { negociateur: 'agence'|'confrere', nom, montantTTC, charge: 'VENDEUR'|'ACQUEREUR'|null,
  // source } ; { direct: true } pour une vente négociée entre les parties ; null si rien n'est dit.
  function detecterHonorairesNegociation(texte, typeActe) {
    const t = String(texte || '').replace(/\s+/g, ' ');
    const m = RE_NEGOCIE_PAR.exec(t);
    if (!m) return RE_NEGOCIATION_DIRECTE.test(t) ? { direct: true } : null;
    const introducteur = m[1].toLowerCase();
    const negociateur = /ma[îi]tre|^me$|office\s+notarial|[ée]tude|scp|selarl|selas/.test(introducteur) ? 'confrere' : 'agence';
    let nom = m[2].replace(/\s+par\s+l['’]interm[ée]diaire.*$/i, '').replace(/\s+/g, ' ').trim();
    if (/^ma[îi]tre|^me$/i.test(m[1])) nom = 'Maître ' + nom;
    const fenetre = t.slice(m.index, m.index + FENETRE_HONORAIRES);
    const avant = t.slice(Math.max(0, m.index - 300), m.index);
    const charge = RE_CHARGE_NEGOCIATION.exec(avant) || RE_CHARGE_NEGOCIATION.exec(fenetre);
    let role = null;
    if (charge) {
      const q = charge[1].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      role = q === 'vendeur' ? 'VENDEUR' : q === 'acquereur' ? 'ACQUEREUR' : roleDepuisQualite(typeActe, q);
    }
    return {
      negociateur, nom, montantTTC: montantHonorairesDansFenetre(fenetre), charge: role,
      source: { extrait: t.slice(Math.max(0, m.index - 60), m.index + 260).trim(), index: m.index }
    };
  }

  // ---- Honoraires d'agence TTC (étude, 03/10 : « détecter les honoraires d'agence TTC dans le compromis ») --
  // Un champ du formulaire, distinct de la lecture « négociée par … » ci-dessus (qui dit QUI et à la charge de
  // qui) : le montant TTC seul, EXPLICITEMENT TTC (« TVA incluse », « TTC ») — un montant sans mention ou
  // hors taxes n'est jamais présenté comme TTC. Deux voies : la clause de négociation déjà lue, puis les
  // intitulés « honoraires / commission / rémunération / frais … d'agence, de négociation, de l'intermédiaire,
  // du mandataire ». Jamais les « honoraires de promesse de vente » (ceux du notaire) : l'intitulé doit
  // nommer l'agence, la négociation, l'intermédiaire ou le mandataire. « Néant » ne donne rien.
  var RE_INTITULE_HONORAIRES_AGENCE = /(?:honoraires?|commission|r[ée]mun[ée]ration|frais)\s+(?:de\s+n[ée]gociation|d['’]agence|de\s+l['’]agence|d['’]entremise|de\s+l['’]interm[ée]diaire|d['’]interm[ée]diaire|du\s+mandataire|de\s+mandataire)/gi;
  var FENETRE_HONORAIRES_AGENCE = 260;

  function montantTTCExpliciteDansFenetre(fenetre) {
    const re = new RegExp(RE_MONTANT_TTC.source, 'gi');
    let m;
    while ((m = re.exec(fenetre)) !== null) {
      const n = montantDepuisTexteFr(m[1]);
      if (!(n > 0)) continue;
      const autour = fenetre.slice(Math.max(0, m.index - 80), m.index + m[0].length + 60);
      if (/TVA\s+incluse|\bTTC\b|toutes\s+taxes\s+comprises|taxes?\s+incluses?/i.test(autour) && !/\bHT\b|hors\s+taxes?/i.test(autour.slice(80))) return n;
    }
    return null;
  }

  // Pure : { valeur (euros TTC), index } ou null.
  function detecterHonorairesAgenceTTC(texte) {
    const t = String(texte || '').replace(/\s+/g, ' ');
    const neg = detecterHonorairesNegociation(t, null);
    if (neg && neg.montantTTC && neg.source) {
      const n = montantTTCExpliciteDansFenetre(t.slice(neg.source.index, neg.source.index + FENETRE_HONORAIRES));
      if (n) return { valeur: n, index: neg.source.index };
    }
    const re = new RegExp(RE_INTITULE_HONORAIRES_AGENCE.source, 'gi');
    let m;
    while ((m = re.exec(t)) !== null) {
      const fenetre = t.slice(m.index, m.index + FENETRE_HONORAIRES_AGENCE);
      const phrase = fenetre.split(/(?<=[.;])\s+(?=[A-ZÀ-Ý])/)[0];
      if (/n[ée]ant|\baucun(?:s|e|es)?\b/i.test(phrase.slice(0, 120))) continue;
      const n = montantTTCExpliciteDansFenetre(fenetre);
      if (n) return { valeur: n, index: m.index };
    }
    return null;
  }

  // ---- Fonds de travaux « loi ALUR » : remboursé ou non par l'acquéreur (29/09) ------------------
  // Structure réelle : « FONDS TRAVAUX LOI ALUR Le PROMETTANT déclare qu'un fonds travaux « Loi ALUR »
  // a été versé au syndic ainsi qu'il résulte du pré état-daté susvisé. Le BENEFICIAIRE remboursera
  // au PROMETTANT le fonds travaux. » — sans montant (il est dans l'état daté). Seule une phrase qui
  // TRANCHE compte : les clauses générales qui rappellent que le fonds reste attaché au lot, sans dire
  // qui rembourse quoi, ne décident rien. Pure : { rembourse: true|false, montant, source } ou null.
  var RE_FONDS_TRAVAUX = /fonds\s+(?:de\s+)?travaux/gi;
  var RE_FONDS_NON_REMBOURSE = /ne\s+(?:le\s+|lui\s+)?rembourser(?:a|ont)\s+pas|ne\s+(?:sera|seront|donnera|donneront)\s+(?:pas|lieu\s+[àa]\s+aucun)\s*(?:rembours|lieu)?|sans\s+(?:aucun\s+)?rembours|aucun\s+remboursement|n['’](?:est|sera)\s+pas\s+rembours|pas\s+de\s+remboursement/i;
  var RE_FONDS_REMBOURSE = /(?:B[ÉE]N[ÉE]FICIAIRE|ACQU[ÉE]REUR)S?\s+(?:s['’](?:engage|oblige)\s+[àa]\s+)?rembours(?:er|era|eront|e)\b/i;
  var FENETRE_FONDS_TRAVAUX = 420;

  function detecterFondsTravaux(texte) {
    const t = String(texte || '').replace(/\s+/g, ' ');
    const re = new RegExp(RE_FONDS_TRAVAUX.source, 'gi');
    let m;
    while ((m = re.exec(t)) !== null) {
      const fenetre = t.slice(m.index, m.index + FENETRE_FONDS_TRAVAUX);
      const phrase = fenetre.split(/(?<=[.;])\s+(?=[A-ZÀ-Ý])/).slice(0, 4).join(' ');
      let rembourse = null;
      if (RE_FONDS_NON_REMBOURSE.test(phrase) && /rembours/i.test(phrase)) rembourse = false;
      else if (RE_FONDS_REMBOURSE.test(phrase)) rembourse = true;
      if (rembourse === null) continue;
      const montant = montantHonorairesDansFenetre(phrase);
      return { rembourse, montant: montant > 0 ? montant : null, source: { extrait: phrase.slice(0, 300).trim(), index: m.index } };
    }
    return null;
  }

  // Formes enregistrées sur le dossier (et reprises d'une sauvegarde) : champs connus seulement. Pures.
  function honorairesPersistables(h) {
    if (!h || typeof h !== 'object') return null;
    if (h.direct === true) return { direct: true };
    const montant = Number(h.montantTTC);
    return {
      negociateur: h.negociateur === 'confrere' ? 'confrere' : 'agence',
      nom: typeof h.nom === 'string' ? h.nom.slice(0, 120) : '',
      montantTTC: montant > 0 ? Math.round(montant * 100) / 100 : null,
      charge: h.charge === 'ACQUEREUR' || h.charge === 'VENDEUR' ? h.charge : null
    };
  }
  // Pure : les honoraires de négociation du dossier d'après le champ « Honoraires d'agence TTC » du formulaire
  // (étude, 03/10) — le champ fait foi pour le MONTANT : vidé, le montant lu s'efface ; rempli sans clause lue,
  // une agence est créée (à la charge de personne tant que l'étude ne l'a pas dit : aucune ligne d'appel de
  // fonds n'est ajoutée sans qui paie). « Négociation directe » n'est remplacée que par un montant saisi.
  function honorairesAvecMontantFormulaire(honoraires, montant, nomAgence) {
    const m = Number(montant);
    const h = honoraires && typeof honoraires === 'object' ? honoraires : null;
    if (!(m > 0)) return h && !h.direct ? honorairesPersistables(Object.assign({}, h, { montantTTC: null })) : h;
    const base = h && !h.direct ? h : { negociateur: 'agence', nom: '', charge: null };
    return honorairesPersistables(Object.assign({}, base, { montantTTC: m, nom: base.nom || nomAgence || '' }));
  }
  function fondsTravauxPersistable(f) {
    if (!f || typeof f !== 'object' || typeof f.rembourse !== 'boolean') return null;
    const montant = Number(f.montant);
    return { rembourse: f.rembourse, montant: montant > 0 ? Math.round(montant * 100) / 100 : null };
  }
  // Libellés courts pour la fiche et le panneau de révision. Purs.
  function libelleHonoraires(h) {
    if (!h) return '';
    if (h.direct) return 'Négociation directe entre les parties : pas d’honoraires';
    const qui = h.negociateur === 'confrere' ? (h.nom || 'un confrère') : (h.nom ? 'agence ' + h.nom : 'une agence');
    const montant = h.montantTTC ? ` — ${formaterPrixCentimes(h.montantTTC)} TTC` : '';
    const charge = h.charge === 'ACQUEREUR' ? ', à la charge de l’acquéreur' : h.charge === 'VENDEUR' ? ', à la charge du vendeur' : '';
    return `Négociée par ${qui}${montant}${charge}`;
  }
  function libelleFondsTravaux(f) {
    if (!f) return '';
    return (f.rembourse ? 'Remboursé par l’acquéreur au vendeur' : 'Non remboursé par l’acquéreur')
      + (f.montant ? ` — ${formaterPrixCentimes(f.montant)}` : '');
  }

  // Prix de vente : le montant en lettres est presque toujours suivi de sa forme chiffrée entre
  // parenthèses (usage notarial constant, ex. "CENT MILLE EUROS (100 000 €)") — bien plus fiable à
  // parser que le nombre écrit en toutes lettres. Cherche "prix" puis, dans les 120 caractères
  // suivants (hors point/retour à la ligne, pour rester dans la même clause), un montant entre
  // parenthèses suivi de €/euros.
  // Deux corrections après un vrai acte où le prix n'était pas détecté du tout
  // (« … le prix de QUATRE-\nVINGT-DOUZE MILLE EUROS (92  000,00 EUR) ») :
  //  - le retour à la ligne n'est plus exclu. Il l'était pour « rester dans la même clause », mais
  //    un texte extrait d'un PDF est coupé à chaque ligne de mise en page : c'était exclure le cas
  //    normal. Le point reste exclu, et c'est lui qui borne réellement la clause.
  //  - « EUR » est accepté au même titre que « € » et « euros » : c'est la forme qu'emploient les
  //    trames notariales dans la reprise chiffrée entre parenthèses.
  const PRIX_VENTE_RE = /prix[^(.]{0,120}\(\s*([\d](?:[\d\s.]{0,14})?(?:,\d{2})?)\s*(?:€|eur(?:os?)?\b)\s*\.?\s*\)/i;

  function detecterPrixVente(texte) {
    const m = PRIX_VENTE_RE.exec(texte);
    if (!m) return null;
    const partieEntiere = m[1].split(',')[0].replace(/[\s.]/g, '');
    const valeur = parseInt(partieEntiere, 10);
    // Un prix de vente immobilier réel ne descend jamais sous 1000 € : filtre les faux positifs
    // (un numéro d'article, une référence de loi capturée par erreur près du mot "prix").
    return Number.isFinite(valeur) && valeur >= 1000 ? valeur : null;
  }

  // ---- Prix contradictoires ------------------------------------------------------------------
  // Toutes les mentions qui désignent LE prix de cette vente, pour signaler deux clauses qui ne
  // disent pas le même montant. Un acte cite couramment d'autres sommes près du mot « prix », qui
  // ne le contredisent pas — relevées sur le corpus réel et écartées :
  //  - la ventilation (« ce prix s'applique aux MEUBLES à concurrence de… / au BIEN à concurrence
  //    de… ») et le mobilier compris dans le prix ;
  //  - le prix de la vente PRÉCÉDENTE, cité dans l'origine de propriété (« Suivant acte reçu par
  //    Maître X… moyennant le prix de TRENTE-TROIS MILLE… ») ;
  //  - le net vendeur après honoraires, la commission, l'origine des fonds (« à concurrence de la
  //    somme de… au moyen d'un prêt »), les frais, le dépôt de garantie.
  // Deux écritures : la reprise chiffrée entre parenthèses (« moyennant le prix de … (92 000,00
  // EUR) ») et la ligne du tableau de financement (« Prix de vente : … 35 000,00 EUR »).
  var RE_MENTION_PRIX_PARENTHESES = /\bprix\b([^(.]{0,120})\(\s*([\d](?:[\d\s.]{0,14})?(?:,\d{2})?)\s*(?:€|eur(?:os?)?\b)\s*\.?\s*\)/gi;
  var RE_MENTION_PRIX_TABLEAU = /(?:^|[\s•-])(?:Prix|PRIX)(?:\s+de\s+vente)?\s*(?:\([^)]{0,80}\))?\s*[:|]?\s*(?:[A-ZÀ-Ü][A-ZÀ-Ü\s'’-]{3,90}EUROS?\s*\.?\s*)?(\d{1,3}(?:[\s.]\d{3})+(?:,\d{2})?)\s*(?:€|EUR\b)/g;
  var RE_PRIX_AUTRE_SOMME = /mobilier|meubles?|concurrence|honoraires|commission|net\s+vendeur|revers|acompte|d[ée]p[ôo]t|frais|provision|fonds|pr[êe]t|somme|ventil|dont\b|droits/i;
  var FENETRE_ORIGINE_PRIX = 220;
  // Le prix payé par le vendeur lors de SON acquisition, cité dans la clause de plus-value (« l'immeuble
  // a été acquis par eux moyennant le prix de 99 000 €, suivant acte du 02 août 2024 ») : le marqueur
  // vient ici APRÈS le montant, d'où un jugement sur la phrase entière (acte PUV FERNANDES).
  var RE_PRIX_ACQUISITION_ANTERIEURE = /\b(?:a|ont)\s+[ée]t[ée]\s+acquis|\bacquis\s+par\s+(?:eux|lui|elle|le\s+vendeur|le\s+promettant)|\bsuivant\s+acte\s+du\b|plus[-\s]?value/i;

  function montantDepuisChiffres(brut) {
    const valeur = parseInt(String(brut || '').split(',')[0].replace(/[\s.]/g, ''), 10);
    return Number.isFinite(valeur) && valeur >= 1000 ? valeur : null;
  }

  // [{ montant, index }] dans l'ordre du texte. Pure, testable.
  function detecterMentionsPrix(texte) {
    const src = String(texte || '');
    const mentions = [];
    const retenir = (montant, index) => {
      if (montant == null) return;
      if (RE_ORIGINE_PROPRIETE.test(src.slice(Math.max(0, index - FENETRE_ORIGINE_PRIX), index))) return;
      if (RE_PRIX_ACQUISITION_ANTERIEURE.test(phraseAutour(src, index, 250, 250).phrase)) return;
      if (mentions.some(x => Math.abs(x.index - index) < 20)) return;
      mentions.push({ montant, index });
    };
    let m;
    const reP = new RegExp(RE_MENTION_PRIX_PARENTHESES.source, 'gi');
    while ((m = reP.exec(src)) !== null) {
      if (RE_PRIX_AUTRE_SOMME.test(m[1])) continue;
      retenir(montantDepuisChiffres(m[2]), m.index);
    }
    const reT = new RegExp(RE_MENTION_PRIX_TABLEAU.source, 'g');
    while ((m = reT.exec(src)) !== null) {
      const avant = src.slice(Math.max(0, m.index - 40), m.index);
      if (RE_PRIX_AUTRE_SOMME.test(m[0].replace(/\d[\d\s.,]*\s*(?:€|EUR)$/, '')) || /\bdont\b|concurrence/i.test(avant)) continue;
      retenir(montantDepuisChiffres(m[1]), m.index);
    }
    return mentions.sort((a, b) => a.index - b.index);
  }

  // Le champ prix : la première mention fait la valeur (comme avant) ; si l'acte en porte une
  // autre, différente, la donnée passe « à vérifier » avec les deux montants proposés.
  function champPrixVente(source) {
    const valeur = detecterPrixVente(source);
    const mentions = detecterMentionsPrix(source);
    const distincts = [...new Set(mentions.map(x => x.montant))];
    const base = champAvecSource(source, 'prixVente', valeur);
    if (distincts.length < 2) return base;
    base.statut = 'NEEDS_REVIEW';
    base.candidats = distincts.map(montant => {
      const mention = mentions.find(x => x.montant === montant);
      return { valeur: montant, origine: 'regex', source: { page: pageDepuisIndex(mention.index), extrait: extraitAutour(source, mention.index, 160) } };
    });
    base.raison = `L’acte cite plusieurs prix pour cette vente : ${distincts.map(formaterPrix).join(' et ')}.`;
    return base;
  }

  // ---- Mobilier compris dans le prix ----------------------------------------------------------
  // Une vente porte parfois aussi sur des meubles (cuisine équipée, électroménager…) valorisés à
  // part. Le prix reste le prix TOTAL (c'est ce que l'acquéreur paie, et ce que l'apport compare au
  // prêt), mais la part du mobilier sort de l'assiette des droits de mutation (art. 735 CGI) : elle
  // doit donc être connue pour estimer les frais d'acte et relire la ventilation.
  // Formulations relevées sur les actes réels du stress test, toutes dans la clause du PRIX :
  //  - « Ce prix comprenant celui du mobilier dont le montant est évalué à SIX MILLE… (6110 €) » ;
  //  - « s'appliquant : - Aux MEUBLES à concurrence de QUATRE MILLE… (4 450,00 EUR) » ;
  //  - « Minorée de l'évaluation des meubles s'élevant à … (4 450,00 EUR) » (assiette des droits) ;
  // plus deux écritures courtes des trames d'agence : « dont 5 000 € de mobilier », « prix du
  // mobilier : 5 000 € ». Jamais la seule LISTE des meubles (son total peut ne pas être repris
  // dans le prix), jamais une clause « aucun meuble n'est vendu ».
  var MONTANT_MOBILIER = '([\\d](?:[\\d\\s.]{0,14})?(?:,\\d{2})?)\\s*(?:€|eur(?:os?)?\\b)';
  var RES_MOBILIER_PRIX = [
    new RegExp('(?:MEUBLES|mobilier|biens\\s+mobiliers|objets\\s+mobiliers)\\s+(?:à|a)\\s+concurrence\\s+de[^(.]{0,160}\\(\\s*' + MONTANT_MOBILIER + '\\s*\\.?\\s*\\)', 'i'),
    new RegExp('(?:comprenant|comprend|incluant|inclut|y\\s+compris)\\s+(?:celui|le\\s+prix|la\\s+valeur)?\\s*(?:du|des|de\\s+la)?\\s*(?:mobilier|meubles|biens\\s+mobiliers)[^(.]{0,200}\\(\\s*' + MONTANT_MOBILIER + '\\s*\\.?\\s*\\)', 'i'),
    new RegExp('(?:minor[ée]e?|diminu[ée]e?)\\s+de\\s+l[\'’][ée]valuation\\s+des\\s+(?:meubles|biens\\s+mobiliers|objets\\s+mobiliers)[^(.]{0,160}\\(\\s*' + MONTANT_MOBILIER + '\\s*\\.?\\s*\\)', 'i'),
    new RegExp('(?:prix|valeur)\\s+(?:du|des)\\s+(?:mobilier|meubles|biens\\s+mobiliers)[^(.]{0,160}\\(\\s*' + MONTANT_MOBILIER + '\\s*\\.?\\s*\\)', 'i'),
    new RegExp('\\bdont\\s+' + MONTANT_MOBILIER + '\\s+(?:de|du|pour\\s+le|au\\s+titre\\s+du|correspondant\\s+au)\\s+(?:mobilier|meubles|biens\\s+mobiliers)', 'i'),
    new RegExp('(?:prix|valeur)\\s+(?:du|des)\\s+(?:mobilier|meubles|biens\\s+mobiliers)\\s*(?:est\\s+(?:fix[ée]|[ée]valu[ée])\\s+[àa]|:)\\s*(?:la\\s+somme\\s+de\\s+)?' + MONTANT_MOBILIER, 'i')
  ];

  // Pure : { montant, index } de la première mention du mobilier compris dans le prix, ou null.
  function detecterMobilierPrixDetail(texte) {
    const src = String(texte || '');
    let meilleur = null;
    for (const re of RES_MOBILIER_PRIX) {
      const m = re.exec(src);
      if (!m) continue;
      const montant = parseInt(m[1].split(',')[0].replace(/[\s.]/g, ''), 10);
      if (!Number.isFinite(montant) || montant <= 0) continue;
      // Le prix de la vente précédente (clause de plus-value) peut citer ses propres meubles.
      if (RE_PRIX_ACQUISITION_ANTERIEURE.test(phraseAutour(src, m.index, 250, 250).phrase)) continue;
      if (!meilleur || m.index < meilleur.index) meilleur = { montant, index: m.index };
    }
    return meilleur;
  }

  function detecterPrixMobilier(texte) {
    const d = detecterMobilierPrixDetail(texte);
    return d ? d.montant : null;
  }

  // Assiette immobilière : le prix moins le mobilier, quand les deux sont connus et cohérents.
  // Sert à l'estimation des frais d'acte (droits de mutation hors mobilier). Pure.
  function assietteImmobiliere(prix, mobilier) {
    const p = Number(prix);
    if (!Number.isFinite(p) || p <= 0) return null;
    const m = Number(mobilier);
    if (!Number.isFinite(m) || m <= 0 || m >= p) return p;
    return p - m;
  }

  // Dépôt de garantie / acompte sur le prix : la somme que l'acquéreur verse à la signature de
  // l'avant-contrat, et surtout ENTRE LES MAINS DE QUI (l'office, l'agence, la CARPA) — les deux
  // font partie de ce que l'étude doit réclamer et suivre dès la création du dossier. Sur une
  // promesse unilatérale, la somme équivalente s'appelle « indemnité d'immobilisation » : même
  // rôle, vocabulaire différent, les deux sont reconnus.
  //
  // Deux formes acceptées, dans cet ordre de confiance :
  //  1. la reprise chiffrée entre parenthèses derrière le montant en lettres (usage notarial
  //     constant, même heuristique que PRIX_VENTE_RE/MONTANT_PRET_RE) ;
  //  2. le montant écrit directement en chiffres ("un dépôt de garantie de 10 000 €"), fréquent
  //     dans les trames d'agence, plus court donc plus exposé à un faux positif — d'où une
  //     fenêtre volontairement courte entre le mot-clé et le montant.
  // Premier jet, comme AGENCE_RE en son temps : à resserrer sur retour réel de l'étude.
  const DEPOT_ANCRE_RE = /d[ée]p[ôo]t\s+de\s+garantie|acompte\s+sur\s+(?:le\s+)?prix|indemnit[ée]\s+d['’]immobilisation/i;
  const DEPOT_GARANTIE_PARENTHESES_RE = /(?:d[ée]p[ôo]t\s+de\s+garantie|acompte\s+sur\s+(?:le\s+)?prix|indemnit[ée]\s+d['’]immobilisation)[^(.]{0,300}\(\s*([\d](?:[\d\s.]{0,14})?(?:,\d{2})?)\s*(?:€|eur(?:os?)?\b)\s*\.?\s*\)/i;
  const DEPOT_GARANTIE_CHIFFRES_RE = /(?:d[ée]p[ôo]t\s+de\s+garantie|acompte\s+sur\s+(?:le\s+)?prix|indemnit[ée]\s+d['’]immobilisation)[^(.]{0,60}?(?:de\s+(?:la\s+somme\s+de\s+)?|soit\s+|:\s*)([\d][\d\s.]{2,14}(?:,\d{2})?)\s*(?:€|eur(?:os?)?\b)/i;

  function montantDepuisCapture(brut) {
    const partieEntiere = String(brut).split(',')[0].replace(/[\s.]/g, '');
    const valeur = parseInt(partieEntiere, 10);
    // Un dépôt de garantie réel n'est jamais inférieur à quelques centaines d'euros : filtre les
    // faux positifs (un pourcentage, un numéro d'article capturé par erreur).
    return Number.isFinite(valeur) && valeur >= 100 ? valeur : null;
  }

  // Trame d'agence où le montant PRÉCÈDE le mot-clé : « La somme de huit mille sept cent quarante-cinq
  // euros (8 745 €), sera déposée à titre d'acompte entre les mains de Maître X ». Rencontrée sur un
  // vrai compromis : ni « dépôt de garantie » ni « acompte sur le prix » n'y figurent, et le dépôt
  // ressortait absent.
  const DEPOT_MONTANT_AVANT_RE = /\(\s*([\d](?:[\d\s.]{0,14})?(?:,\d{2})?)\s*(?:€|eur(?:os?)?\b)\s*\.?\s*\)[^.(]{0,80}?[àa]\s+titre\s+(?:d['’]acompte|de\s+d[ée]p[ôo]t\s+de\s+garantie)/i;

  // Sur une promesse, l'indemnité d'immobilisation stipulée n'est presque jamais versée en entier :
  // l'acte fixe un TOTAL, puis précise la part réellement remise au notaire (« Sur cette somme, le
  // BÉNÉFICIAIRE s'engage à verser … la somme de DEUX MILLE EUROS (2 000,00 EUR) … en la
  // comptabilité de Me X »), le solde n'étant dû que si la vente échoue. Constaté sur QUATRE vraies
  // promesses (10 350 sur 20 700, 4 600 sur 9 200, 2 000 sur 29 000, 11 000 sur 22 000). Retenir le
  // total faisait déduire de l'appel de fonds une somme que l'étude n'a jamais reçue — donc
  // réclamer trop peu au client, erreur qui ne se voit que le jour de la signature. C'est la somme
  // VERSÉE qui compte : elle seule est entre les mains du notaire.
  // Une phrase de versement : un verbe de remise ET un destinataire qui détient les fonds.
  const RE_PHRASE_VERSEMENT = /\b(?:vers[ée]e?s?|verser|versera|remise?|consign[ée]e?|s[ée]questr[ée]e?)(?![A-Za-z0-9_À-ÿ])/i; // pas de \b final : « versé » finit par une lettre accentuée
  const RE_DESTINATAIRE_FONDS = /comptabilit[ée]|entre\s+les\s+mains|s[ée]questre|d[ée]positaire|notaire|office/i;
  // … et jamais le SOLDE, dû seulement si la vente échoue.
  const RE_SOLDE_NON_VERSE = /\bsolde\b|en\s+cas\s+de\s+non[\s-]|dans\s+l['’](?:hypoth[èe]se|[ée]ventualit[ée])/i;
  const PORTEE_VERSEMENT_PARTIEL = 2500;
  // Titre de la clause, écrit en capitales : sert d'ancre quand le total n'est pas assez proche du
  // mot-clé pour DEPOT_GARANTIE_PARENTHESES_RE (« INDEMNITE D'IMMOBILISATION … le BÉNÉFICIAIRE
  // s'engage à verser au PROMETTANT la somme VINGT NEUF MILLE EUROS (29 000,00 EUR) »). Jamais
  // précédé de « ABSENCE DE » : « ABSENCE DE DEPOT DE GARANTIE » dit précisément l'inverse.
  const RE_TITRE_CLAUSE_DEPOT = /(?:INDEMNIT[ÉE]\s+D['’]\s*IMMOBILISATION|D[ÉE]P[ÔO]T\s+DE\s+GARANTIE)/g;
  const RE_ABSENCE_DEPOT = /ABSENCE|PAS\s+DE|SANS|NON[\s-]/i;
  const PORTEE_TITRE_CLAUSE_DEPOT = 1500;
  const RE_MONTANT_PARENTHESES_G = /\(\s*([\d](?:[\d\s.]{0,14})?(?:,\d{2})?)\s*(?:€|eur(?:os?)?\b)\s*\.?\s*\)/gi;

  function phraseContenant(source, index) {
    let debut = index;
    while (debut > 0 && !/[.;]\s/.test(source.slice(debut - 2, debut))) debut--;
    let fin = index;
    while (fin < source.length && !/[.;]\s/.test(source.slice(fin, fin + 2))) fin++;
    return { texte: source.slice(debut, fin), debut };
  }

  function versementPartiel(source, apres, total) {
    const zone = source.slice(apres, apres + PORTEE_VERSEMENT_PARTIEL);
    const re = new RegExp(RE_MONTANT_PARENTHESES_G.source, 'gi');
    let m;
    while ((m = re.exec(zone)) !== null) {
      const montant = montantDepuisCapture(m[1]);
      if (montant === null || montant >= total) continue;
      const phrase = phraseContenant(source, apres + m.index);
      if (!RE_PHRASE_VERSEMENT.test(phrase.texte) || !RE_DESTINATAIRE_FONDS.test(phrase.texte)) continue;
      if (RE_SOLDE_NON_VERSE.test(phrase.texte)) continue;
      return { montant, index: phrase.debut };
    }
    return null;
  }

  // Pure et testable. `montant` est la somme réellement versée (celle à déduire de l'appel de
  // fonds), `total` l'indemnité stipulée quand elle diffère, `index` l'endroit où chercher à qui
  // elle a été remise (voir detecterSequestreDepot).
  // Le dépôt de garantie d'un BAIL en cours (« Montant du loyer et charges : … Montant du dépôt de garantie : 455 € »,
  // bien vendu loué — compromis réel du 05/10) n'est jamais celui de la vente : il était pris à la place de l'acompte.
  var RE_CONTEXTE_BAIL = /\bloyers?\b|\bbail\b|locataires?|locaux\s+lou[ée]s|location\s+n[°o]/i;
  function premierHorsBail(re, source) {
    const g = new RegExp(re.source, 'gi');
    let m;
    while ((m = g.exec(source)) !== null) {
      if (RE_CONTEXTE_BAIL.test(source.slice(Math.max(0, m.index - 220), m.index + 40))) continue;
      const valeur = montantDepuisCapture(m[1]);
      if (valeur !== null) return { valeur, index: m.index, fin: m.index + m[0].length };
    }
    return null;
  }

  function detecterDepotGarantieDetail(texte) {
    const source = String(texte || '');
    let trouve = premierHorsBail(DEPOT_GARANTIE_PARENTHESES_RE, source);
    if (!trouve) trouve = premierHorsBail(DEPOT_GARANTIE_CHIFFRES_RE, source);
    if (!trouve) {
      const avant = DEPOT_MONTANT_AVANT_RE.exec(source);
      const valeur = avant ? montantDepuisCapture(avant[1]) : null;
      if (valeur !== null) trouve = { valeur, index: avant.index, fin: avant.index + avant[0].length };
    }
    if (!trouve) {
      const re = new RegExp(RE_TITRE_CLAUSE_DEPOT.source, 'g');
      let t;
      while (!trouve && (t = re.exec(source)) !== null) {
        if (RE_ABSENCE_DEPOT.test(source.slice(Math.max(0, t.index - 60), t.index))) continue;
        const zone = source.slice(t.index, t.index + PORTEE_TITRE_CLAUSE_DEPOT);
        const m = new RegExp(RE_MONTANT_PARENTHESES_G.source, 'i').exec(zone);
        const valeur = m ? montantDepuisCapture(m[1]) : null;
        if (valeur !== null) trouve = { valeur, index: t.index + m.index, fin: t.index + m.index + m[0].length };
      }
    }
    if (!trouve) return null;
    const partiel = versementPartiel(source, trouve.fin, trouve.valeur);
    if (partiel) return { montant: partiel.montant, total: trouve.valeur, index: partiel.index };
    return { montant: trouve.valeur, total: null, index: trouve.index };
  }

  function detecterDepotGarantie(texte) {
    const d = detecterDepotGarantieDetail(texte);
    return d ? d.montant : null;
  }

  // À QUI l'acquéreur verse ce dépôt. Cherché UNIQUEMENT autour de l'endroit où la somme VERSÉE est
  // énoncée (voir detecterDepotGarantieDetail) : « entre les mains du notaire » apparaît aussi dans
  // des clauses sans rapport (levée d'option, indemnité de retard, appel de fonds). Ancrée
  // jusqu'ici sur la première MENTION du mot-clé, la recherche ramenait sur une vraie promesse la
  // clause de levée d'option (« consignation entre les mains du notaire chargé de dresser l'acte
  // d'une somme suffisante pour… »), qui cite l'indemnité au passage. Aucun dépôt détecté = aucun
  // séquestre renvoyé, plutôt qu'un nom pris ailleurs au hasard.
  const FENETRE_SEQUESTRE_AVANT = 200;
  const FENETRE_SEQUESTRE_APRES = 900;
  const SEQUESTRE_RE = /(?:entre\s+les\s+mains\s+d[eu]\s*(?:la\s+|l['’])?|s[ée]questr[ée]?e?\s+(?:aupr[èe]s\s+d[eu]\s*(?:la\s+|l['’])?|chez\s+|entre\s+les\s+mains\s+d[eu]\s*(?:la\s+|l['’])?)|(?:en\s+)?la\s+comptabilit[ée]\s+d[eu]\s*(?:la\s+|l['’])?|vers[ée]e?\s+[àa]\s+(?:la\s+|l['’])?)([^,.;:\n(]{2,70})/i;
  // « Les parties choisissent … le notaire rédacteur des présentes comme dépositaire et tiers
  // séquestre de ces fonds » : le détenteur est nommé AVANT le mot-clé.
  const SEQUESTRE_DESIGNE_RE = /\b((?:l[ea]\s+|l['’])(?:notaire|office|agence|cabinet)[^,.;:\n(]{0,60}?)\s+comme\s+(?:d[ée]positaire|(?:tiers\s+)?s[ée]questre)/i;

  function detecterSequestreDepot(texte) {
    const source = String(texte || '');
    const depot = detecterDepotGarantieDetail(source);
    let fenetre;
    if (depot) {
      const debut = Math.max(0, depot.index - FENETRE_SEQUESTRE_AVANT);
      fenetre = source.slice(debut, depot.index + FENETRE_SEQUESTRE_APRES);
    } else {
      // Aucun montant lu : on accepte encore une phrase qui NOMME le dépôt ET dit qu'il est versé
      // ou séquestré (« Le dépôt de garantie est versé à la CARPA »), jamais une phrase qui ne
      // fait que le citer — c'est ce qui écarte la clause de levée d'option.
      const re = new RegExp(DEPOT_ANCRE_RE.source, 'gi');
      let m;
      while ((m = re.exec(source)) !== null) {
        const phrase = phraseContenant(source, m.index).texte;
        if (RE_PHRASE_VERSEMENT.test(phrase)) { fenetre = phrase; break; }
      }
      if (!fenetre) return null;
    }
    const candidats = [SEQUESTRE_RE.exec(fenetre), SEQUESTRE_DESIGNE_RE.exec(fenetre)].filter(Boolean)
      .sort((a, b) => a.index - b.index);
    if (!candidats.length) return null;
    const nom = candidats[0][1].replace(/\s+/g, ' ').trim()
      // Coupe une proposition relative qui suivrait ("... du notaire soussigné qui en donnera
      // quittance") : seul le destinataire nous intéresse.
      .replace(/\s+(?:qui|lequel|laquelle|auquel|dont|en\s+sa\s+qualit[ée]|sur\s+un\s+compte|au\s+PROMETTANT|au\s+VENDEUR)\b.*$/i, '')
      .replace(/[,\s]+$/, '');
    return nom.length >= 2 ? nom : null;
  }

  // Saisie d'un montant en euros entiers (« 250000 », « 250 000 », « 250.000,00 € ») : jamais
  // en ne gardant que les chiffres, qui ferait de « 250.000,00 » 25 000 000. Pure.
  function eurosDepuisSaisie(texte) {
    if (texte == null || String(texte).trim() === '') return null;
    const n = montantDepuisTexteFr(texte);
    return Number.isFinite(n) ? Math.round(n) : null;
  }

  // Montant emprunté, lu dans le texte de l'offre de prêt elle-même (pas le compromis) une fois
  // celle-ci retrouvée dans le dossier local relié — voir l'appel dans verifierDossierLocal(). Même
  // heuristique que PRIX_VENTE_RE (le montant en lettres est répété en chiffres entre parenthèses,
  // usage constant des établissements prêteurs), ancrée sur le vocabulaire d'une offre de prêt
  // ("montant du prêt", "capital emprunté"...) plutôt que sur "prix", qui n'y apparaît jamais dans
  // ce sens.
  const MONTANT_PRET_RE = /(?:montant\s+(?:du\s+)?(?:pr[êe]t|financement|emprunt[ée]?)|capital\s+emprunt[ée]|somme\s+pr[êe]t[ée]e?)[^(.\n]{0,120}\(\s*([\d](?:[\d\s.]{0,14})?(?:,\d{2})?)\s*(?:€|euros?)\s*\)/i;

  // Les offres réelles du corpus n'emploient PAS la reprise entre parenthèses : elles écrivent un
  // montant PAR PRÊT, en tableau (« Montant total du crédit : 294 000,00 EUR », « Montant et
  // monnaie du prêt à accorder : 59 606,00 EUR »). Sur les trois offres reçues, le montant restait
  // donc introuvable et l'apport estimé ne s'affichait jamais. Les prêts sont additionnés, SAUF un
  // prêt RELAIS : il se rembourse par la vente de l'ancien bien et ne finance pas l'achat — le
  // compter ferait ressortir un « prêt supérieur au prix » (constaté : 615 036 € empruntés dont
  // 294 000 € de relais).
  var RE_MONTANT_PAR_PRET = /(?:montant\s+total\s+du\s+cr[ée]dit|le\s+montant\s+du\s+cr[ée]dit\s+est\s+de|montant\s+et\s+monnaie\s+du\s+pr[êe]t\s+[àa]\s+accorder|montant\s+du\s+pr[êe]t)\s*:\s*([\d][\d\s.]{0,14}(?:,\d{2})?)\s*(?:€|eur(?:os?)?\b)/gi;
  var RE_PRET_RELAIS = /\brelais\b/i;

  function detecterMontantPret(texte) {
    const source = String(texte || '');
    const m = MONTANT_PRET_RE.exec(source);
    if (m) {
      const partieEntiere = m[1].split(',')[0].replace(/[\s.]/g, '');
      const valeur = parseInt(partieEntiere, 10);
      if (Number.isFinite(valeur) && valeur >= 1000) return valeur;
    }
    const re = new RegExp(RE_MONTANT_PAR_PRET.source, 'gi');
    const vus = new Set();
    let total = 0;
    let finPrecedente = 0;
    let t;
    while ((t = re.exec(source)) !== null) {
      const valeur = parseInt(t[1].split(',')[0].replace(/[\s.]/g, ''), 10);
      // Libellé du prêt : ce qui précède le montant, sans remonter au-delà du prêt précédent —
      // selon la mise en page, il est sur la même ligne ou sur la ligne du dessus.
      const libelle = source.slice(Math.max(finPrecedente, t.index - 250), t.index);
      finPrecedente = t.index + t[0].length;
      if (!Number.isFinite(valeur) || valeur < 1000) continue;
      if (RE_PRET_RELAIS.test(libelle)) continue;
      // Un même montant repris plus loin (récapitulatif, tableau d'amortissement) n'est compté qu'une fois.
      if (vus.has(valeur)) continue;
      vus.add(valeur);
      total += valeur;
    }
    return total >= 1000 ? total : null;
  }

  // Apport estimé une fois l'offre de prêt reçue : ce que le prêt ne couvre pas dans le prix total
  // (frais de notaire et autres coûts annexes non comptés — comparaison volontairement simple,
  // prix du bien contre montant emprunté). Purement informatif, aucune règle métier derrière.
  // Seuils arbitraires mais seules les couleurs déjà réservées ailleurs sont réutilisées : succès
  // (apport confortable), pret/amber (apport faible, à surveiller), urgent (prêt ≥ prix, aucun
  // apport ou financement des frais inclus).
  function calculerApport(d) {
    if (!d.prixVente || !d.montantPret) return null;
    const montant = d.prixVente - d.montantPret;
    const pourcentage = Math.round((montant / d.prixVente) * 100);
    const niveau = pourcentage < 0 ? 'urgent' : (pourcentage < 10 ? 'pret' : 'success');
    return { montant, pourcentage, niveau };
  }

  // Repère les noms de famille du VENDEUR et de l'ACQUÉREUR (un ou plusieurs de chaque côté) pour
  // préremplir le nom du dossier, au format "NOM1 / NOM2 & NOM3" (en majuscules).
  //
  // Méthode principale : dans un compromis, chaque personne est présentée sous la forme
  // "Monsieur/Madame Prénom(s) NOM né(e) le …" — on segmente le bloc de la partie par civilité
  // et on prend, pour chaque personne, le premier groupe MAJUSCULE juste avant "né"/"née"
  // (ce qui gère aussi les noms d'usage composés comme "COURTAS HUTTEAU" et ignore le nom de
  // jeune fille qui suit, ex. "DORLÉAC née PIAU née le …").
  // Repli : si aucune date de naissance n'est trouvée (autre modèle de document), on retombe sur
  // une recherche du nom en MAJUSCULES le plus proche de l'intitulé "Vendeur"/"Acquéreur".

  // Les PARTICULES d'un nom composé (« DE SOUSA MARTINS », « LE GOFF », « DU PONT ») ne
  // disqualifient un candidat que s'il n'est fait QUE d'elles. Tant qu'elles figuraient dans la
  // liste stricte ci-dessous, tout patronyme à particule était rejeté — un acte réel du corpus
  // n'avait ainsi qu'une seule partie, son bénéficiaire (« DE SOUSA MARTINS ») étant introuvable.
  // « ET » reste volontairement dans la liste STRICTE : aucun patronyme ne le contient, alors
  // qu'une capture « DUPONT ET MARTIN » en majuscules est un risque réel.
  const PARTICULES_NOM = new Set(['LE', 'LA', 'LES', 'DE', 'DU', 'DES', 'D']);

  const MOTS_EXCLUS_NOM = new Set([
    'SCI','SARL','SAS','EURL','DPE','ERP','CDC','TVA','SRU','M','MME','MLLE',
    'ET','MONSIEUR','MADAME','MADEMOISELLE','ENSEMBLE','PART','AGISSANT','SOLIDAIREMENT','AN',
    'VENDEUR','VENDEURS','ACQUEREUR','ACQUEREURS','ACHETEUR','ACHETEURS',
    'PROMETTANT','PROMETTANTS','BENEFICIAIRE','BENEFICIAIRES','PROMESSE',
    'ENTRE','SOUSSIGNES','SOUSSIGNE','COMPROMIS','VENTE','PRESENT','PRESENTS','FAIT',
    'CONDITIONS','CONDITION','SUSPENSIVES','SUSPENSIVE','DESIGNATION','ARTICLE',
    'OBJET','PRIX','GARANTIE','CLAUSE','CLAUSES','DECLARATION','DECLARATIONS',
    'ANNEXE','ANNEXES','SIGNATURE','SIGNATURES','DIAGNOSTIC','DIAGNOSTICS',
    'NOTAIRE','ETUDE','BIEN','IMMEUBLE','DESIGNE','DENOMME','DENOMMEE','PARTIES',
    'PARTIE','PRESENTES','DEPOT','GARANTIE','PRET','ACTE','AUTHENTIQUE','UNILATERALE'
  ]);

  function normaliserMaj(s) {
    return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase();
  }

  // pdf.js espace les tirets et multiplie les espaces (« DE   SOUSA   MARTINS », « LE - GOFF ») :
  // le nom retenu est remis à la forme sous laquelle on l'écrit.
  function normaliserEspacesNom(nom) {
    return String(nom || '').replace(/\s*-\s*/g, '-').replace(/\s+/g, ' ').trim();
  }

  function estNomValide(candidat) {
    const mots = candidat.split(/[\s-]+/).map(normaliserMaj);
    if (candidat.length < 2) return false;
    if (mots.some(m => MOTS_EXCLUS_NOM.has(m))) return false;
    // Un mot-nombre n'est jamais un patronyme. La date en toutes lettres de l'en-tête d'un acte
    // authentique (« L'AN DEUX MILLE VINGT-TROIS ») se glisse entre deux paragraphes à la coupure
    // de page, en plein milieu de la présentation d'une partie — elle ressortait comme son nom.
    if (mots.some(m => MOTS_NOMBRES[m.toLowerCase()] !== undefined)) return false;
    // Un candidat fait uniquement de particules (« DE », « LE », « DES ») n'est pas un nom.
    return !mots.every(m => PARTICULES_NOM.has(m));
  }

  // Isole le bloc de texte décrivant une partie (ex. tout ce qui suit "Le vendeur" jusqu'à
  // "Ci-après dénommé…"), en cherchant l'intitulé seulement après un point de départ donné
  // (utile pour ne pas retrouver deux fois le même intitulé, ou empiéter sur l'autre partie).
  // Un acte AUTHENTIQUE s'ouvre par la comparution des notaires, qui se désignent eux-mêmes par la
  // partie qu'ils assistent : « Maître X, notaire à …, Notaire assistant le PROMETTANT », « Avec le
  // concours de Maître Y … assistant le BENEFICIAIRE ». Ces occurrences des mots-clés de rôle ne
  // désignent AUCUNE partie — la première vraie mention est le titre du bloc d'état civil, plus bas.
  // Sans ce garde-fou, le nom du dossier prenait celui du NOTAIRE : constaté sur une vraie promesse
  // reçue par notaire, qui ressortait « GOSSART / RECU » (le nom de notre propre étude, et le verbe
  // de « A RECU le présent acte ») au lieu de « BOURGUEIL / CHARPENTIER ».
  var RE_COMPARUTION_NOTAIRE = /notaire|ma[îi]tre|crpcen|office\s+notarial|soussign[ée]|avec\s+le\s+concours|assistant\s+l|assist[ée]e?\s+par/i;
  // Fenêtre VOLONTAIREMENT courte : dans une comparution, le marqueur colle au mot-clé (« Notaire
  // assistant le PROMETTANT »). Trop large, elle mordait sur la ligne précédente et faisait rejeter
  // le vrai titre du bloc d'état civil, qui suit de peu la comparution du second notaire.
  var FENETRE_COMPARUTION = 45;

  // Première mention d'un rôle qui désigne réellement une partie. Repli sur la toute première
  // occurrence si elles sont TOUTES en contexte de comparution : mieux vaut l'ancien comportement
  // qu'aucune partie du tout.
  function chercherMentionPartie(texte, motRe, apresIndex) {
    const zone = String(texte).slice(apresIndex);
    const global = new RegExp(motRe.source, motRe.flags.replace('g', '') + 'g');
    let premiere = null;
    let m;
    while ((m = global.exec(zone)) !== null) {
      if (!premiere) premiere = { index: apresIndex + m.index, longueur: m[0].length };
      const avant = zone.slice(Math.max(0, m.index - FENETRE_COMPARUTION), m.index);
      if (!RE_COMPARUTION_NOTAIRE.test(avant)) return { index: apresIndex + m.index, longueur: m[0].length };
      if (global.lastIndex === m.index) global.lastIndex++;
    }
    return premiere;
  }

  // Titre du bloc d'une AUTRE partie. Écrit en majuscules sur sa propre ligne dans la trame, mais
  // le texte que lit l'outil n'a pas forcément de ligne : pdf.js rend une page comme une suite
  // d'items joints par une espace (voir lireTextePdfParPage/extraireTextesUtiles), si bien qu'un
  // acte authentique entièrement aplati n'avait plus AUCUN retour à la ligne où s'ancrer — le bloc
  // VENDEUR avalait alors la section ACQUÉREUR et ses noms ressortaient vendeurs (constat « rôle
  // changé » sur un projet de vente pourtant conforme). La FIN DE PHRASE est donc acceptée comme
  // seconde borne de gauche : un titre de section suit toujours un point, tandis qu'une mention au
  // fil du texte (« Les VENDEURS s'engagent de manière indivisible… ») est précédée d'un mot, donc
  // jamais retenue — c'est ce qui rend l'assouplissement sûr. Les majuscules restent exigées.
  var RE_TITRE_PARTIE_SUIVANTE = /(?:^|\n|[.;]\s)[^\S\n]*(?:VENDEURS?|ACQU[ÉE]REURS?|PROMETTANTS?|B[ÉE]N[ÉE]FICIAIRES?|ACHETEURS?|C[ÉE]DANTS?|CESSIONNAIRES?)[^\S\n]*(?::|\n|\s|$)/;

  // Rubriques qui SUIVENT toujours la présentation des parties dans un acte authentique : quotités,
  // présence/représentation, déclarations, état-capacité, objet du contrat. Écrites en capitales
  // (d'où le motif sensible à la casse), elles bornent le bloc de la DERNIÈRE partie présentée,
  // qu'aucun titre de partie suivante ne vient fermer. Sans elles, les 1200 caractères par défaut
  // débordaient sur « QUOTITES VENDUES : Monsieur X et Madame Y vendent… » et coupaient un nom en
  // plein milieu — constaté sur une vraie promesse, dont l'acquéreur gagnait un troisième nom
  // tronqué (« BOUS » pour « BOUSSELET », la venderesse).
  var RE_FIN_PRESENTATION_PARTIES = /QUOTIT[ÉE]\s*S?\s+(?:VENDUES?|ACQUISES?)|PR[ÉE]SENCE\s*-\s*REPR[ÉE]SENTATION|D[ÉE]CLARATIONS?\s+DES\s+PARTIES|[ÉE]TAT\s*-\s*CAPACIT[ÉE]|OBJET\s+DU\s+CONTRAT/;

  function extraireBlocPartie(texte, motRe, apresIndex) {
    const zone = texte.slice(apresIndex);
    const mention = chercherMentionPartie(texte, motRe, apresIndex);
    if (!mention) return null;
    const debut = mention.index - apresIndex + mention.longueur;
    const reste = zone.slice(debut);
    // Le bloc s'arrête à « ci-après dénommé » OU au titre de la partie suivante. Sans cette seconde
    // borne, les 1200 caractères par défaut débordaient sur le bloc voisin : sur un acte où le
    // PROMETTANT tient moins de 800 caractères, le nom du BENEFICIAIRE se retrouvait compté parmi
    // les vendeurs.
    const bornes = [reste.match(/ci\s*-\s*apr[èe]s\s+d[ée]nomm/i), reste.match(RE_TITRE_PARTIE_SUIVANTE), reste.match(RE_FIN_PRESENTATION_PARTIES)]
      .filter(Boolean).map(m => m.index);
    const longueur = bornes.length ? Math.min(...bornes) : Math.min(reste.length, 1200);
    return { texte: reste.slice(0, longueur), finAbsolue: apresIndex + debut + longueur };
  }

  // Repli quand l'ancre « né(e) » ne suit pas le patronyme. Beaucoup de trames écrivent l'état civil
  // en deux temps : « Monsieur Jean-Loup André Roger BOURGUEIL, enseignant, et Madame …, demeurant
  // ensemble à CHATEAUDUN. Monsieur est né à BUZANCAIS le 12 mai 1966. » — aucune majuscule ne
  // précède alors « né », et aucun nom n'était extrait.
  // Le patronyme est ici la première suite de MAJUSCULES qui suit la civilité et ses prénoms. Elle
  // ne doit PAS être introduite par une préposition de lieu : sans ce garde-fou, « né à BUZANCAIS »
  // et « demeurant à CHATEAUDUN » donneraient une commune pour un nom de famille — l'erreur déjà
  // rencontrée et corrigée ailleurs dans ce fichier (voir nomsAvantLabel).
  var PORTEE_NOM_APRES_CIVILITE = 90;
  var RE_SUITE_MAJUSCULES = /[A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ]{2,}(?:[^\S\n]*-[^\S\n]*[A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ]{2,}|[^\S\n]+[A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ]{2,})*/g;
  var RE_PREPOSITION_LIEU = /(?:^|[\s(])(?:[àa]|au|aux|de|du|des|en|dans|sur|pr[èe]s)\s+$/i;
  // Une civilité introduite par un lien de famille ne présente pas une partie : « Divorcé de Madame
  // Ana DA SILVA MARTINHO », « veuve de Monsieur X ». Sans ce garde-fou, l'ex-conjoint cité dans
  // l'état civil devenait un acquéreur.
  // « en premières/secondes noces » s'intercale couramment (« Divorcée en premières noces de
  // Monsieur X ») : sans lui, l'ex-conjoint d'une vraie promesse ressortait bénéficiaire.
  var RE_LIEN_FAMILIAL = /(?:(?:divorc[ée]e?|veuf|veuve|[ée]pou(?:x|se)|mari[ée]e?|remari[ée]e?|s[ée]par[ée]e?|pacs[ée]e?)\s+(?:en\s+\S+\s+noces\s+)?(?:de\s+|d['’]|avec\s+|[àa]\s+)?|pacte\s+civil\s+de\s+solidarit[ée]\s+avec\s+)$/i;

  function nomApresCivilite(segment) {
    const s = String(segment || '');
    const civ = s.match(/(?:Monsieur|Madame|Mademoiselle)\s+/);
    if (!civ) return null;
    // Seulement la proposition qui suit immédiatement la civilité : au-delà viennent les lieux de
    // naissance, de mariage et de domicile, eux aussi en majuscules dans ces trames.
    const debut = civ.index + civ[0].length;
    // Borné à la virgule ou au point, JAMAIS au retour à la ligne : un texte extrait d'un PDF est
    // coupé au gré de la mise en page, et le patronyme se retrouve régulièrement seul sur sa ligne
    // (« et Madame Yvette Marie Annie \nFONTANEL, retraitée »).
    const apres = s.slice(debut, debut + PORTEE_NOM_APRES_CIVILITE).split(/[,.]/)[0];
    const re = new RegExp(RE_SUITE_MAJUSCULES.source, 'g');
    let m;
    while ((m = re.exec(apres)) !== null) {
      if (RE_PREPOSITION_LIEU.test(apres.slice(0, m.index))) continue;
      if (estNomValide(m[0])) return m[0];
    }
    return null;
  }

  // Dans le bloc d'une partie, extrait le(s) nom(s) de famille via l'ancre "né(e) le".
  function extraireNomsParNaissance(bloc) {
    const civiliteRe = /Monsieur|Madame|Mademoiselle/gi;
    const positions = [];
    let m;
    while ((m = civiliteRe.exec(bloc)) !== null) positions.push(m.index);
    if (positions.length === 0) return [];
    positions.push(bloc.length);
    const noms = [];
    // Nom « X dit Y » (étude, 03/10 : « Lionel FRANCOIS dit CHARLEMAGNE ») : un seul nom de famille, gardé
    // en entier — sans le « dit », seul « CHARLEMAGNE » remontait et le dossier s'appelait « MERCIER /
    // CHARLEMAGNE » au lieu de « MERCIER / FRANCOIS » (Authentic).
    const nomAvantNaissanceRe = /\b([A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ]{2,}(?:[^\S\n]*-[^\S\n]*[A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ]{2,}|[^\S\n]+[A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ]{2,}|[^\S\n]+dite?[^\S\n]+[A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ]{2,})*)\s+n[ée]e?(?=\s)/;
    for (let i = 0; i < positions.length - 1; i++) {
      if (RE_LIEN_FAMILIAL.test(bloc.slice(Math.max(0, positions[i] - 40), positions[i]))) continue;
      const segment = bloc.slice(positions[i], positions[i + 1]);
      const nm = segment.match(nomAvantNaissanceRe);
      if (nm && estNomValide(nm[1])) { noms.push(nm[1]); continue; }
      const repli = nomApresCivilite(segment);
      if (repli) noms.push(repli);
    }
    return [...new Set(noms)];
  }

  // Style « étiquette finale » : « Monsieur Jean DUPONT, né le 3 mars 1970 à BLOIS, demeurant à
  // 5 rue des Lilas 41000 BLOIS, ci-après dénommé LE VENDEUR » — le patronyme est AVANT le mot-clé
  // de rôle. Jusqu'ici on prenait « le dernier mot en capitales avant l'étiquette » : or une
  // présentation de partie se termine presque toujours par son ADRESSE, dont la commune est en
  // capitales. C'est donc la VILLE qui remontait, jamais le nom — tous les dossiers créés depuis un
  // compromis de ce style (le plus répandu) ressortaient nommés d'après des communes
  // (« BLOIS / TOURS »). Signalé par l'étude en conditions réelles ; c'est très probablement aussi
  // ce que recouvrait le « les noms de dossier ne vont pas » resté longtemps ouvert faute d'exemple,
  // et qu'un correctif précédent avait cru régler.
  // On s'ancre désormais sur la CIVILITÉ, exactement comme extraireNomsParNaissance() le fait déjà
  // pour le style « en-tête » : le patronyme suit immédiatement « Monsieur/Madame », l'adresse ne
  // vient qu'après. Plusieurs civilités dans la fenêtre = plusieurs vendeurs (un couple), tous
  // retournés, cohérent avec le style « en-tête » qui gère déjà ce cas.
  // Repères par lesquels un acte annonce lui-même le début de la présentation des parties. Tout ce
  // qui les précède (comparution des notaires, en-tête, date) n'appartient à aucune partie.
  var RE_DEBUT_PRESENTATION_PARTIES = /[àa]\s+la\s+requ[êe]te\s+de\s*:?|entre\s+les\s+soussign[ée]s\s*:?|lesquels?\s+ont\s+requis|a\s+re[çc]u\s+le\s+pr[ée]sent\s+acte/gi;

  function dernierIndexPresentationParties(fenetre) {
    const re = new RegExp(RE_DEBUT_PRESENTATION_PARTIES.source, 'gi');
    let dernier = -1;
    let m;
    while ((m = re.exec(fenetre)) !== null) dernier = m.index + m[0].length;
    return dernier;
  }

  function nomsAvantLabel(fenetre) {
    const civiliteRe = /\b(?:Mademoiselle|Monsieur|Madame|Mlle|Mme|M\.)/gi;
    const bornes = [];
    let m;
    while ((m = civiliteRe.exec(fenetre)) !== null) bornes.push({ debut: m.index, fin: m.index + m[0].length });
    if (bornes.length === 0) return [];
    const noms = [];
    for (let i = 0; i < bornes.length; i++) {
      // Même garde-fou que extraireNomsParNaissance : le conjoint nommé dans l'état civil
      // (« Marié à Madame X », « pacte civil de solidarité avec Madame Y ») n'est pas une partie.
      // Constaté sur un vrai compromis d'agence où les trois conjoints des vendeurs ressortaient
      // vendeurs à leur tour.
      if (RE_LIEN_FAMILIAL.test(fenetre.slice(Math.max(0, bornes[i].debut - 60), bornes[i].debut))) continue;
      const finSegment = i + 1 < bornes.length ? bornes[i + 1].debut : fenetre.length;
      const segment = fenetre.slice(bornes[i].fin, finSegment);
      // « NOM né(e) » d'abord : l'ancre la plus sûre quand la date de naissance est mentionnée
      // (même motif que extraireNomsParNaissance). Sinon le PREMIER mot en capitales du segment,
      // qui précède nécessairement l'adresse — c'est tout l'objet du correctif.
      const parNaissance = segment.match(/\b([A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ]{2,}(?:[^\S\n]*-[^\S\n]*[A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ]{2,}|[^\S\n]+[A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ]{2,})*)\s+n[ée]e?(?=\s)/);
      if (parNaissance && estNomValide(parNaissance[1])) { noms.push(parNaissance[1]); continue; }
      const premier = trouverNomDansFenetre(segment, 'first');
      if (premier) noms.push(premier.nom);
    }
    return [...new Set(noms)];
  }

  function trouverNomDansFenetre(fenetre, direction) {
    const nomRe = /\b([A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ]{2,}(?:[^\S\n]*-[^\S\n]*[A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ]{2,}|[^\S\n]+[A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ]{2,})*)\b/g;
    let resultat = null;
    let nm;
    while ((nm = nomRe.exec(fenetre)) !== null) {
      if (!estNomValide(nm[1])) continue;
      // Même garde-fou que nomApresCivilite : un groupe en capitales précédé d'une préposition de
      // lieu est une COMMUNE, pas un patronyme. Une ligne d'état civil (« - Monsieur à BLOIS
      // (41000), le 6 mai 1979 ») donnait sinon « BLOIS » comme nom de partie.
      if (RE_PREPOSITION_LIEU.test(fenetre.slice(0, nm.index))) continue;
      resultat = { nom: nm[1], idx: nm.index };
      if (direction === 'first') break;
    }
    return resultat;
  }

  // Repère le style "…ci-après dénommé(e) « le Vendeur »" — avec OU SANS guillemets, formulation
  // tout aussi fréquente ("ci-après dénommé le Vendeur" sans aucune ponctuation particulière) —
  // où le nom de la personne est à chercher AVANT le mot-clé de rôle, pas après : la personne est
  // présentée puis étiquetée, contrairement au style "en-tête" ("LE VENDEUR : M. X né le..."), où
  // le nom suit. Bug corrigé : seul le cas avec guillemets était reconnu, un « ci-après dénommé »
  // sans guillemets retombait à tort sur une recherche en avant.
  function estStyleLabelEntreGuillemets(texte, index) {
    const avant = texte.slice(Math.max(0, index - 60), index);
    // Le guillemet ne doit pas être précédé d'une LETTRE : sans cette condition, l'apostrophe
    // d'élision de « L'ACQUÉREUR » (formulation des plus courantes) passait pour un guillemet
    // ouvrant, le style était pris pour une étiquette finale, et le nom était cherché EN ARRIÈRE —
    // ramenant le nom du vendeur présenté juste avant, au lieu de celui de l'acquéreur. Bug
    // préexistant, révélé par les textes de test des trois types d'acte.
    // Le PLURIEL doit être accepté (« ci-après dénommés LES VENDEURS ») : sans le `s?`, un acte
    // avec deux vendeurs — un couple, cas courant — n'était pas reconnu comme étiquette finale et
    // retombait sur la méthode « en-tête », qui va chercher le nom APRÈS le mot-clé et ramenait
    // donc celui de la partie suivante. Trouvé en écrivant le test de non-régression du couple.
    return /(^|[^A-Za-zÀ-ÿ])["«'’]\s*(?:les?|la|l['’]|du|des)?\s*$/i.test(avant) ||
      /ci\s*-\s*apr[èe]s\s+d[ée]nomm[ée]e?s?\s+(?:les?|la|l['’])?\s*$/i.test(avant) ||
      // Ordre des mots inversé, tout aussi courant : « Dénommés ci-après le PROMETTANT ». Sans
      // cette variante, l'étiquette n'était pas reconnue, le nom était cherché APRÈS le mot-clé,
      // et le dossier prenait le mot structurel qui suit (« ENSEMBLE D'UNE PART » → « ENSEMBLE »).
      /d[ée]nomm[ée]e?s?\s+ci\s*-\s*apr[èe]s\s+(?:les?|la|l['’])?\s*$/i.test(avant);
  }

  function extraireNomsRepli(texte, motRe) {
    const m = texte.match(motRe);
    if (!m) return [];
    const finMot = m.index + m[0].length;
    if (!estStyleLabelEntreGuillemets(texte, m.index)) {
      const fenetreApres = texte.slice(finMot, Math.min(texte.length, finMot + 300));
      const rApres = trouverNomDansFenetre(fenetreApres, 'first');
      if (rApres) return [rApres.nom];
    }
    const fenetreAvant = texte.slice(Math.max(0, m.index - 250), m.index);
    const rAvant = trouverNomDansFenetre(fenetreAvant, 'last');
    return rAvant ? [rAvant.nom] : [];
  }

  // Selon le type d'acte, le vendeur est désigné VENDEUR ou PROMETTANT, et l'acquéreur ACQUÉREUR,
  // ACHETEUR ou BÉNÉFICIAIRE (promesse unilatérale de vente réitérée par acte authentique).
  const RE_ROLE_VENDEUR = /vendeu?rs?|promettants?/i;
  const RE_ROLE_ACQUEREUR = /acqu[ée]reurs?|acheteurs?|b[ée]n[ée]ficiaires?/i;

  // Cherche une adresse email au voisinage de chaque mention de l'acquéreur/bénéficiaire (utile
  // pour préremplir "Email de l'acquéreur", utilisé pour la relance automatique de l'offre de
  // prêt — voir relancerSiOffreManquante). Ancré sur le rôle plutôt qu'un simple "premier email du
  // document" : un compromis contient aussi l'email du vendeur, de l'agence ou du notaire, et rien
  // ne garantit que l'acquéreur soit cité en premier.
  const EMAIL_RE = /[\w.+-]+@[\w-]+\.[a-z]{2,}/i;
  // Ancré sur la qualité qui joue réellement le rôle d'ACQUÉREUR dans CE type d'acte : sur une
  // promesse d'achat, « bénéficiaire » désigne le vendeur — s'y ancrer aurait rempli le champ
  // « email de l'acquéreur » avec l'adresse du vendeur, et donc adressé les relances de prêt à la
  // mauvaise partie. Le paramètre est optionnel : sans lui, le type est détecté à la volée.
  function detecterEmailAcquereur(texte, typeActe) {
    return detecterEmailPartie(texte, typeActe, 'ACQUEREUR');
  }

  // Email du vendeur (demandé par l'étude le 30/09, pour le sondage de créneaux) : même lecture que
  // celle de l'acquéreur, sur la qualité du vendeur. Une adresse qui est celle de l'acquéreur
  // (fenêtre qui déborde sur l'autre partie) n'est jamais reprise.
  function detecterEmailVendeur(texte, typeActe) {
    const acquereur = detecterEmailPartie(texte, typeActe, 'ACQUEREUR');
    return detecterEmailPartie(texte, typeActe, 'VENDEUR', acquereur);
  }

  function detecterEmailPartie(texte, typeActe, role, exclu) {
    const qualite = qualitePourRole(texte, typeActe || detecterTypeActe(texte).valeur, role);
    const roleRe = new RegExp((qualite ? qualite.re : (role === 'VENDEUR' ? RE_ROLE_VENDEUR : RE_ROLE_ACQUEREUR)).source, 'gi');
    const agence = emailsAgenceDansTexte(texte);
    let m;
    while ((m = roleRe.exec(texte)) !== null) {
      // Recul borné à la phrase courante (s'arrête au point précédent, comme extraireContexte) :
      // sans ça, l'email du VENDEUR cité juste avant dans le document pouvait être capté à la
      // place de celui de l'ACQUEREUR sur un simple recul à distance fixe.
      // Seul un point SUIVI D'UNE ESPACE arrête le recul : un point collé appartient à l'adresse
      // email elle-même (« pierre.martin@… ») ou à une abréviation — s'y arrêter tronquait la
      // fenêtre en plein milieu de l'adresse recherchée, qui était alors manquée au profit de la
      // suivante, c'est-à-dire celle de l'autre partie.
      let debut = m.index;
      let n = 0;
      while (debut > 0 && n < 150) {
        if (texte[debut - 1] === '.' && (debut >= texte.length || /\s/.test(texte[debut]))) break;
        debut--; n++;
      }
      const fenetre = texte.slice(debut, m.index + 300);
      // Jamais une adresse générique d'agence ou d'office (contact@…, …@notaires.fr) : la présentation de l'agence suit
      // souvent celle de l'acquéreur dans les trames d'agence (05/10).
      const em = (fenetre.match(new RegExp(EMAIL_RE.source, 'gi')) || []).find(e => !RE_EMAIL_GENERIQUE.test(e) && !agence.has(e.toLowerCase()));
      if (em && (!exclu || em.toLowerCase() !== String(exclu).toLowerCase())) return em;
    }
    return null;
  }

  // Adresses de l'agence (étude 08/10, compromis réel « l'Adresse » : « Ci-après dénommé(e)s l'ACQUEREUR » en fin de page 2, puis
  // « Avec le concours de l'Adresse Vineuil, … adresse mail vineuil@… » en tête de page 3 — l'adresse de l'agence, dans les 300
  // caractères qui suivent la qualité, devenait l'email de l'acquéreur). Une adresse précédée de près (250 caractères) d'un mot
  // qui présente l'agence l'est partout dans l'acte. Pure : Set des adresses en minuscules.
  var RE_PRESENTATION_AGENCE = /agence|concours\s+de|exploit[ée]e?s?\s+par|carte\s+professionnelle|transaction\s+sur\s+immeubles|courriel\s+en\s+ce\s+sens|mandat\s+n/i;
  function emailsAgenceDansTexte(texte) {
    const source = String(texte || '');
    const agence = new Set();
    const re = new RegExp(RE_EMAIL_GLOBAL.source, 'gi');
    let m;
    while ((m = re.exec(source)) !== null) {
      const avant = source.slice(Math.max(0, m.index - 250), m.index);
      // Seulement depuis la dernière mention d'une personne : « Madame X x@… » après un paragraphe sur l'agence reste à X.
      const depuisPersonne = avant.split(/\b(?:Monsieur|Madame|Mademoiselle|M\.|Mme)\s/).pop();
      if (RE_PRESENTATION_AGENCE.test(depuisPersonne)) agence.add(m[0].replace(/[.]+$/, '').toLowerCase());
    }
    return agence;
  }

  // Repli (05/10, compromis réels d'agence et promesses) : l'email d'une partie rattaché par son NOM, quand aucune mention
  // « acquéreur / vendeur » n'est assez proche — « Adresses électroniques : alexis.rigny@… / marion.gadriot@… » à la fin de la
  // présentation, tableau « Nom du titulaire  Adresse mail  Mr X  x@… », « les adresses électroniques des parties sont les
  // suivantes : Madame Y : y@… ». Une adresse va au côté dont un nom figure dans l'adresse elle-même, sinon au côté dont un nom
  // la précède de près (200 caractères, sans agence, société, notaire ni délégué entre les deux). Jamais une adresse générique
  // (contact@, dpo@…) ni d'un office notarial. Pure : « a@x.fr; b@y.fr » ou null.
  var RE_EMAIL_GLOBAL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}/gi;
  var RE_EMAIL_GENERIQUE = /^(?:contact|dpo|info|infos|accueil|agence|office|negociation|transaction|transactions|secretariat|immo|direction|gestion|noreply|no-reply)[.\d]*@|@(?:[\w-]+\.)*(?:notaires\.fr|adnov\.fr|notaires\.com)$/i;
  var RE_COUPURE_EMAIL_PARTIE = /agence|soci[ée]t[ée]|exploit[ée]|notaire|office|d[ée]l[ée]gu|courriel|cnil|mandataire|s[ée]questre/i;
  var MOTS_NOM_IGNORES = ['dit', 'dite', 'epouse', 'veuve', 'nee', 'monsieur', 'madame', 'mademoiselle', 'consorts', 'societe'];
  function sansAccentsMinuscules(t) { return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
  function motsNomsParties(parties, role) {
    const mots = [];
    for (const p of parties || []) {
      if (!p || p.role !== role || !p.nom) continue;
      for (const w of sansAccentsMinuscules(p.nom).split(/[^a-z]+/)) {
        if (w.length >= 4 && MOTS_NOM_IGNORES.indexOf(w) === -1 && mots.indexOf(w) === -1) mots.push(w);
      }
    }
    return mots;
  }
  // Pure : pour chaque adresse du texte, le ou les côtés que les NOMS des parties lui attribuent (Map adresse → Set de rôles).
  function attributionEmailsParNom(texte, parties) {
    const source = String(texte || '');
    const mots = { VENDEUR: motsNomsParties(parties, 'VENDEUR'), ACQUEREUR: motsNomsParties(parties, 'ACQUEREUR') };
    mots.VENDEUR = mots.VENDEUR.filter(w => mots.ACQUEREUR.indexOf(w) === -1);
    mots.ACQUEREUR = mots.ACQUEREUR.filter(w => motsNomsParties(parties, 'VENDEUR').indexOf(w) === -1);
    const resultat = new Map();
    if (!mots.VENDEUR.length && !mots.ACQUEREUR.length) return resultat;
    const agence = emailsAgenceDansTexte(source);
    const re = new RegExp(RE_EMAIL_GLOBAL.source, 'gi');
    let m;
    while ((m = re.exec(source)) !== null) {
      const email = m[0].replace(/[.]+$/, '').toLowerCase();
      if (RE_EMAIL_GENERIQUE.test(email) || agence.has(email)) continue;
      const local = sansAccentsMinuscules(email.split('@')[0]).replace(/[^a-z]/g, '');
      const dans = { VENDEUR: mots.VENDEUR.some(w => local.indexOf(w) !== -1), ACQUEREUR: mots.ACQUEREUR.some(w => local.indexOf(w) !== -1) };
      let cote = null;
      if (dans.VENDEUR !== dans.ACQUEREUR) cote = dans.VENDEUR ? 'VENDEUR' : 'ACQUEREUR';
      else if (!dans.VENDEUR) {
        const avant = sansAccentsMinuscules(source.slice(Math.max(0, m.index - 200), m.index));
        let meilleur = -1;
        for (const c of ['VENDEUR', 'ACQUEREUR']) {
          for (const w of mots[c]) {
            const k = avant.lastIndexOf(w);
            if (k > meilleur) { meilleur = k; cote = c; }
          }
        }
        if (meilleur === -1 || RE_COUPURE_EMAIL_PARTIE.test(avant.slice(meilleur))) cote = null;
      }
      if (!cote) continue;
      if (!resultat.has(email)) resultat.set(email, new Set());
      resultat.get(email).add(cote);
    }
    return resultat;
  }
  function emailsPartieParNom(texte, parties, role) {
    const trouves = [];
    for (const [email, cotes] of attributionEmailsParNom(texte, parties)) if (cotes.has(role) && cotes.size === 1) trouves.push(email);
    return trouves.length ? trouves.join('; ') : null;
  }
  // Pure : une adresse trouvée près du mot « acquéreur » / « vendeur » que les noms attribuent à L'AUTRE côté seulement est
  // écartée (la fenêtre de 300 caractères déborde souvent sur le tableau des adresses qui suit).
  function emailContreditParNom(email, texte, parties, role) {
    if (!email) return false;
    const cotes = attributionEmailsParNom(texte, parties).get(String(email).toLowerCase());
    return !!cotes && !cotes.has(role);
  }

  // Pour un rôle donné, trouve le nom de la personne ET le point où s'arrête sa présentation
  // (utile pour ne pas repartir dedans en cherchant l'autre partie). Deux styles rencontrés dans
  // les vrais compromis/promesses :
  //  - "en-tête" : "LE VENDEUR : M. X né le ..." — le nom suit le mot-clé, dans un bloc borné par
  //    le prochain "ci-après dénommé" (voir extraireBlocPartie).
  //  - "étiquette finale" : "M. X né le ..., ci-après dénommé LE PROMETTANT" — le nom est AVANT
  //    le mot-clé. Bug corrigé : en appliquant malgré tout la méthode "en-tête" à ce style, le
  //    bloc borné par le PROCHAIN "ci-après dénommé" empiétait sur la présentation de l'AUTRE
  //    partie (son propre "ci-après dénommé"), ce qui remontait son nom à la place du bon —
  //    reproduit sur une promesse réelle signalée par l'étude (le résultat sortait "NOM / NOM"
  //    avec deux fois le même nom, celui du bénéficiaire). Reconnaître ce style dès ce premier
  //    mot-clé (voir estStyleLabelEntreGuillemets) et chercher directement en arrière l'évite.
  function nomsEtFinPourRole(texte, motRe, apresIndex) {
    const mention = chercherMentionPartie(texte, motRe, apresIndex);
    if (!mention) return { noms: [], finAbsolue: apresIndex };
    const indexAbsolu = mention.index;
    const finAbsolue = indexAbsolu + mention.longueur;
    if (estStyleLabelEntreGuillemets(texte, indexAbsolu)) {
      // Fenêtre élargie à 600 caractères : une présentation réelle (état civil, nationalité,
      // régime matrimonial, profession, adresse) dépasse largement 250 caractères, et la civilité
      // — seule ancre fiable du patronyme, voir nomsAvantLabel — tombait alors hors fenêtre. Bornée
      // par `apresIndex` : jamais en deçà du point où commence la recherche de CETTE partie, sans
      // quoi la fenêtre empiéterait sur la présentation de la partie précédente et ramènerait son
      // nom (le bug « NOM / NOM » déjà rencontré, que les 250 caractères fixes ne prévenaient pas).
      // La fenêtre passe à 1200 caractères : sur une trame réelle, la présentation d'un couple
      // (état civil, professions, PACS, adresse, lieux et dates de naissance, déclarations) dépasse
      // largement 600, et les civilités — seule ancre fiable du patronyme — tombaient hors fenêtre.
      // Élargir seul ne suffisait pas : la comparution des notaires, juste avant, NOMME les parties
      // qu'ils assistent (« assistant : - Monsieur X, - Monsieur Y ») et ces noms-là remontaient
      // pour la mauvaise partie. La fenêtre est donc coupée à l'endroit où l'acte annonce lui-même
      // le début de la présentation (« à la requête de : », « Entre les soussignés : »).
      let fenetreAvant = texte.slice(Math.max(apresIndex, indexAbsolu - 1200), indexAbsolu);
      const debutPresentation = dernierIndexPresentationParties(fenetreAvant);
      if (debutPresentation !== -1) fenetreAvant = fenetreAvant.slice(debutPresentation);
      const parCivilite = nomsAvantLabel(fenetreAvant);
      if (parCivilite.length) return { noms: parCivilite, finAbsolue };
      // Aucune civilité (société, « les époux X »…) : on retombe sur l'ancien comportement plutôt
      // que de ne rien renvoyer.
      const r = trouverNomDansFenetre(fenetreAvant, 'last');
      return { noms: r ? [r.nom] : [], finAbsolue };
    }
    const bloc = extraireBlocPartie(texte, motRe, apresIndex);
    const noms = bloc ? extraireNomsParNaissance(bloc.texte) : [];
    return { noms, finAbsolue: bloc ? bloc.finAbsolue : finAbsolue };
  }

  // Le nom de dossier reste au format « VENDEUR / ACQUÉREUR » (demandé par l'étude), mais les deux
  // côtés sont désormais déterminés par detecterParties() en tenant compte du type d'acte : sur une
  // promesse d'achat, le promettant est l'ACQUÉREUR, et c'est lui qui doit figurer à droite.
  // Pure : le nom d'une partie tel qu'il figure dans le nom du dossier — « FRANCOIS dit CHARLEMAGNE »
  // devient « FRANCOIS », comme l'intitulé d'Authentic (« VTE MERCIER / FRANCOIS ») ; la partie garde
  // son nom entier.
  function nomPourNomDossier(nom) {
    return String(nom || '').replace(/\s+dite?\s+.*$/i, '').trim() || String(nom || '');
  }

  function detecterNomDossier(texte) {
    const parties = detecterParties(texte, detecterTypeActe(texte).valeur);
    const unique = (l) => [...new Set(l)];
    const partieVendeur = unique(parties.filter(p => p.role === 'VENDEUR').map(p => nomPourNomDossier(p.nom))).join(' & ');
    const partieAcquereur = unique(parties.filter(p => p.role === 'ACQUEREUR').map(p => nomPourNomDossier(p.nom))).join(' & ');
    if (partieVendeur && partieAcquereur) return `${partieVendeur} / ${partieAcquereur}`;
    return partieVendeur || partieAcquereur || null;
  }

  // Dates à écarter d'office : diagnostics, actes antérieurs, état civil, copropriété passée…
  // (dont les citations de loi, ex. « en vertu de la loi numéro 2022-270 du 28 février 2022 » —
  // une clause d'information sur l'assurance emprunteur, sans lien avec l'échéance du prêt lui-même
  // malgré le vocabulaire "prêteur"/"emprunteur" à proximité immédiate — cas réel rencontré).
  const EXCLUSION_RE = /diagnostic|dpe\b|amiante|plomb|termite|erp\b|carrez|m[ée]trage|\bn[ée]e?\s+le\b|suivant\s+acte|acte\s+(re[çc]u|d.acquisition|de\s+propri[ée]t[ée]|notari[ée]|initial)|pr[ée]c[ée]demment|[ée]tabli(e)?\s+le|dat[ée](e)?\s+du|dat[ée](e)?\s+de\s+validit[ée]|r[ée]alis[ée](e)?\s+le|dress[ée](e)?\s+le|d[ée]livr[ée](e)?\s+le|assembl[ée]e\s+g[ée]n[ée]rale|r[èe]glement\s+de\s+copropri[ée]t[ée]|contrat\s+de\s+mariage|acte\s+de\s+naissance|cadastr|co\s*m\s*m\s*ande\s+du|p[ée]riode\s+de\s+validit[ée]|num[ée]ro\s+de\s+police|r[ée]f[ée]rence\s+interne|r[ée]f\.\s*interne|attestation\s+de\s+qualification|identifiant\s+du\s+contrat|cl[ée]\s+de\s+hachage|mandat\s+(?:écrit|ecrit)|[ée]tat\s+des\s+risques|[ée]tat\s+parasitaire|assainissement|fosse\s+septique|entretien\s+et\s+vidange|vidange\s+du|contr[ôo]le\s+d[eu]|installation\s+(?:int[ée]rieure|[ée]lectrique|de\s+gaz|gaz)|catastrophe\s+(?:naturelle|technologique)|risques?\s+(?:naturels?|miniers?|technologiques?)|sinistres?\s+indemnis[ée]s?|potentiel\s+radon|mouvement\s+de\s+terrain|recul\s+du\s+trait\s+de\s+c[ôo]te|zone\s+(?:couverte|expos[ée]e)|(?:loi|ordonnance|d[ée]cret|arr[êe]t[ée]s?)\s+(?:n[°ºo]|num[ée]ro)\s*[\d\-]+|(?:loi|ordonnance|d[ée]cret|arr[êe]t[ée]s?)\s+du\s+\d/i;

  // Formulations qui indiquent une échéance à venir plutôt qu'une date déjà passée.
  var PORTEE_CITATION = 400;

  const CUE_FUTUR_RE = /au\s+plus\s+tard|avant\s+le|jusqu.au|date\s+limite|d[ée]lai\s+(?:expirant|fix[ée])|sera\s+(sign[ée]e?|r[ée]alis[ée]e?|conclu(e)?)|pr[ée]vue?\s+(le|pour|au)|fix[ée]e?\s+(au|le)|au\s+plus\s+tôt/i;

  // "à compter du/de <date>" introduit une date de PRISE D'EFFET (loyer, garantie, taux d'intérêt,
  // jouissance différée, prorata de taxe foncière...), pas une échéance à respecter — contrairement
  // à "au plus tard le"/"avant le" (CUE_FUTUR_RE), qui annoncent une vraie limite. Signalé par
  // l'étude avec un exemple réel ("à compter du 1er Janvier 2028.") : la clause se trouvait par
  // ailleurs dans le même paragraphe qu'une mention de l'acte authentique, ce qui suffisait à faire
  // classer cette date "acte" par suggererEcheance (voir sa ligne "acte authentique|réitération...",
  // qui ne regarde que la présence du mot dans tout le contexte, pas son lien réel avec la date).
  // Seule exception : si la clause parle explicitement de la RÉITÉRATION de l'acte de vente
  // lui-même (verbe "réitéré(e)" ou nom "réitération", voir \br[ée]it[ée]r au point d'appel),
  // "à compter du" peut alors désigner la date à laquelle l'acte sera effectivement réitéré —
  // cette date-là reste une vraie échéance, à ne pas écarter.
  const A_COMPTER_RE = /[àa]\s+compter\s+d[eu]\s*$/i;

  // Vocabulaire du financement, cherché à l'échelle de la CLAUSE (et non de la seule phrase) pour
  // rattacher une date issue d'un délai à l'échéance « prêt » — voir son usage dans ajouter().
  // `var` et non `const` : déclarée ainsi pour rester visible depuis le harnais de tests
  // (tests/helpers/load-app.js ne voit que les `function` et les `var` de premier niveau).
  var RE_DELAI_DE_VERSEMENT = /indemnit[ée]\s+d['’]immobilisation|d[ée]p[ôo]t\s+de\s+garantie|\bverser\b|\bversement\b|virement|s[ée]questre/i;
  var VOCABULAIRE_PRET_CLAUSE_RE = /\bpr[êe]ts?\b|\bemprunt|\bfinancement\b/i;

  function suggererEcheance(contexte) {
    const c = contexte.toLowerCase();
    if (/vente(?:.{0,60})?d.un\s+(?:autre\s+)?bien|condition\s+suspensive\s+de\s+vente\s+(?:d.un\s+bien|immobili[èe]re)|avant-contrat(?:.{0,150})?(?:vente|bien\s+(?:lui\s+)?appartenant)/.test(c)) return 'ventebien';
    // Ces clauses sont de vraies échéances mais ne correspondent ni à un prêt, ni à un acte, ni à
    // une vente préalable : elles sont classées "Autre" plutôt qu'ignorées.
    if (/permis\s+de\s+construire|certificat\s+d.urbanisme|autorisation\s+d.urbanisme|condition\s+suspensive\s+d.urbanisme|servitude/.test(c)) return 'autre';
    // Le VERSEMENT d'une somme (indemnité d'immobilisation, dépôt de garantie, acompte) porte sa
    // propre échéance, très courte — huit jours, dix jours — et n'a rien à voir avec la condition
    // de prêt ni avec la signature de la vente. Deux promesses réelles voyaient ainsi leur
    // « obtention du prêt » fixée dix jours après la signature. Le verbe de versement doit être
    // PROCHE de la formulation de délai : la vraie clause de prêt cite elle aussi un montant, et
    // un simple test sur « verser » quelque part dans la clause l'aurait écartée à son tour.
    if (/vers(?:er|era|ement)[^.]{0,80}au\s+plus\s+tard|au\s+plus\s+tard[^.]{0,80}vers(?:er|era|ement)|indemnit[ée]\s+d.immobilisation|d[ée]p[ôo]t\s+de\s+garantie/.test(c)) return 'autre';
    if (/pr[êe]t|financement|emprunt|offre\s+de\s+pr[êe]t/.test(c)) return 'pret';
    // « signature DUDIT acte » est aussi courant que « signature de l'acte » — sans cette variante,
    // « La signature dudit acte devra intervenir au plus tard le 15 septembre 2026 » n'était pas
    // classée du tout, et une citation d'ordonnance du même document prenait sa place.
    if (/acte\s+authentique|r[ée]it[ée]ration|signature\s+(?:de\s+l.|dudit\s+|du\s+dit\s+|de\s+cet\s+)acte/.test(c)) return 'acte';
    // Sur une promesse unilatérale, la RÉALISATION de la promesse est la signature de la vente.
    if (/r[ée]alisation\s+de\s+la\s+(?:pr[ée]sente\s+)?promesse|lev[ée]e\s+d[eu]\s*l?.?option/.test(c)) return 'acte';
    // Sur une promesse, la date d'expiration de l'option EST la date butoir pour signer la vente.
    if (/(?:promesse|option|convention)[^.]{0,80}expirant|dur[ée]e\s+expirant|rendez-vous\s+de\s+signature/.test(c)) return 'acte';
    // « notaire » TOUT SEUL ne dit rien de la nature d'une date : un acte notarié le mentionne dans
    // une clause sur deux. Associé à « au plus tard », il faisait passer pour la signature de l'acte
    // le versement de l'indemnité d'immobilisation (« … au plus tard dans les dix jours … en la
    // comptabilité du notaire rédacteur ») et la fin de la faculté de substitution — les deux
    // constatés sur une vraie promesse. Il faut désormais que la mention du notaire soit liée à la
    // SIGNATURE elle-même.
    if (/acte\s+de\s+vente|sign(?:er|ature)[^.]{0,40}notaire|notaire[^.]{0,40}sign/.test(c) && CUE_FUTUR_RE.test(c)) return 'acte';
    return null;
  }

  // Quand plusieurs dates détectées partagent la même catégorie suggérée (ex. une vraie échéance
  // de prêt et une citation de loi qui mentionne aussi "prêteur"), on ne peut pas se contenter de
  // prendre la première par ordre chronologique : cas réel rencontré où cela remontait une date de
  // loi de 2022 avant la vraie échéance de 2026. Une clause qui porte une formulation de délai
  // ("au plus tard le", "avant le"...) fait presque toujours foi sur une simple mention en passant
  // — si elle est la seule du lot à en porter une, elle est retenue sans marquer d'ambiguïté.
  // Sinon (aucune, ou plusieurs), le premier candidat est gardé par défaut mais signalé "ambigu" :
  // c'est à l'utilisateur de vérifier, pas à l'outil de deviner en silence.
  // Vocabulaire qui désigne l'échéance ELLE-MÊME, et non une clause qui la mentionne en passant.
  // Déclaré à un seul endroit, comme les autres tables de règles métier de ce fichier.
  var SIGNAUX_FORTS_ECHEANCE = {
    pret: /condition\s+suspensive[^.]{0,60}pr[êe]t|offres?\s+(?:[ée]crites?\s+)?de\s+pr[êe]t/i,
    acte: /r[ée]it[ée]ration|acte\s+authentique|dur[ée]e\s+expirant|rendez-vous\s+de\s+signature|signature\s+(?:de\s+l.|dudit\s+|du\s+dit\s+|de\s+cet\s+)acte|r[ée]alisation\s+de\s+la\s+(?:pr[ée]sente\s+)?promesse/i,
    ventebien: /condition\s+suspensive\s+de\s+vente|vente\s+(?:pr[ée]alable|d.un\s+autre\s+bien)/i
  };

  function meilleureCandidateEcheance(detectedDates, type) {
    const candidats = detectedDates.filter(d => d.suggestion === type);
    if (candidats.length === 0) return { candidat: null, ambigu: false };
    if (candidats.length === 1) return { candidat: candidats[0], ambigu: false };
    // Une clause que l'étude a déjà désignée à la main pour ce type, sur un acte de même trame
    // (voir trouverCorrectionApprise), l'emporte sur toutes les règles qui suivent : c'est une
    // décision humaine, pas une déduction. Sans cette règle, apprendre la bonne clause ne suffisait
    // pas — l'ancienne candidate, toujours classée du même type par ses mots-clés, restait retenue
    // en premier, et la correction semblait « ne pas avoir été apprise ».
    const apprises = candidats.filter(d => d.apprise);
    if (apprises.length === 1) return { candidat: apprises[0], ambigu: false };
    // Une date ÉCRITE dans l'acte l'emporte toujours sur une date CALCULÉE depuis un délai — même
    // règle que construireDatesMetier. Sur un vrai compromis, « au plus tard dans les 2 mois et demi
    // à compter de la signature, soit le 5 mars 2026 » donnait deux candidates ; la date calculée,
    // plus ancienne, était reportée dans le formulaire alors que le panneau affichait la bonne.
    const explicites = candidats.filter(d => !d.approx);
    if (explicites.length && explicites.length < candidats.length) {
      return meilleureCandidateEcheance(explicites, type);
    }
    // Départage d'abord sur le SIGNAL FORT du type : une clause qui nomme l'objet même de
    // l'échéance l'emporte sur une clause qui ne fait que citer le mot au passage. Sans ça, sur une
    // vraie promesse, « la faculté de substitution ne pourra être exercée que jusqu'au 30 septembre
    // 2026 … adressée au notaire chargé de rédiger l'acte de vente » était retenue comme date de
    // signature de l'acte, devant « la promesse est consentie pour une durée expirant le 9 octobre
    // 2026 » — qui est la vraie date butoir.
    const forts = SIGNAUX_FORTS_ECHEANCE[type]
      ? candidats.filter(d => SIGNAUX_FORTS_ECHEANCE[type].test(d.contexte || ''))
      : [];
    if (forts.length === 1) return { candidat: forts[0], ambigu: false };
    const avecEcheance = candidats.filter(d => CUE_FUTUR_RE.test(d.contexte));
    if (avecEcheance.length === 1) return { candidat: avecEcheance[0], ambigu: false };
    return { candidat: candidats[0], ambigu: true };
  }

  // Propose un intitulé plus parlant qu'"Autre échéance" quand le contexte le permet.
  function libelleAutreSuggere(contexte) {
    const c = (contexte || '').toLowerCase();
    if (/permis\s+de\s+construire/.test(c)) return 'Obtention du permis de construire';
    if (/certificat\s+d.urbanisme/.test(c)) return "Certificat d'urbanisme";
    if (/autorisation\s+d.urbanisme|condition\s+suspensive\s+d.urbanisme/.test(c)) return "Autorisation d'urbanisme";
    if (/servitude/.test(c)) return 'Levée de servitude';
    return '';
  }
