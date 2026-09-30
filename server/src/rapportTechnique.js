'use strict';
// Rapport technique de CLAIRE (étude, 30/09) : deux fois par jour ouvré (12 h et 17 h, heure de
// Paris), le serveur résume ce qui s'est passé depuis le rapport précédent — erreurs du serveur et
// des postes, agenda, rappels, Claire Scan, corrections faites à la main après une extraction,
// sauvegarde, signalements — et le dépose en issue dans le dépôt GitHub privé. Une routine Claude
// programmée le lit une demi-heure plus tard et propose ses corrections en demande de fusion
// (jamais directement sur main, qui reconstruit l'exe du bureau).
//
// Accord de l'étude du 30/09 pour cette sortie hors du réseau, À UNE CONDITION : rien de nominatif
// ne part. D'où l'anonymisation ci-dessous, faite ICI, avant l'envoi :
//   - chemins, noms de fichiers, emails, URL, IBAN, téléphones, nombres de 4 chiffres et plus ;
//   - tout mot tiré des dossiers en base (noms, prénoms, noms d'usage, adresses, communes,
//     agences, banques, notaires…) et des collaborateurs ;
//   - tout mot en capitales de 3 lettres et plus qui n'est pas un sigle technique connu (les noms
//     de famille sont écrits en capitales dans les dossiers et sur le NAS) ;
//   - jamais d'auteur de signalement, de capture d'écran, de nom de dossier ni de montant.
// Les positions dans le code (script.js:1234) sont gardées : c'est ce qui sert à corriger.

const { momentParis } = require('./emailsMatin');

const DEPOT_GITHUB_RAPPORT = 'blursquare/Office-suivi';
const ETIQUETTE_RAPPORT = 'rapport-claire';
const CRENEAUX_RAPPORT = [12, 17];
const MAX_CORPS_ISSUE = 60000;
const MAX_GROUPES = 25;
const DELAI_GITHUB_MS = 20000;

// Mots trop courants pour être un indice (et qui rendraient le rapport illisible si on les masquait).
const MOTS_COURANTS = new Set(('les des une aux par pour sur sous dans avec sans chez entre vers '
  + 'rue avenue chemin route place allee impasse boulevard quai cours lieu dit hameau lotissement residence '
  + 'saint sainte bis ter vte succ monsieur madame mademoiselle maitre epoux epouse veuve veuf ne nee '
  + 'societe sci sarl sas eurl commune ville cedex france loir cher indre loire centre val '
  + 'dossier vente acte avant contrat compromis promesse offre pret piece pieces claire scan '
  + 'null undefined true false').split(' '));

// Sigles et codes techniques écrits en capitales, gardés tels quels dans les messages.
const SIGLES_TECHNIQUES = new Set(('NAS PDF EWS HTTP HTTPS SMTP IMAP API JSON URL URI OCR UTC CLAIRE GET POST PUT DELETE PATCH HEAD '
  + 'SQL SQLITE NTLM NTLMV EML XML ZIP DOCX DOC XLSX UNC CDN VTE SUCC AAE SRU TEOM DPE ERP RIB IBAN DIA DPU '
  + 'TLS SSL DNS TCP UDP NSSM SEA EXE UTF ASCII CSV ISO UUID HTML CSS PNG JPEG JPG TIFF MIME CORS BOM '
  + 'ERR ECONNREFUSED ECONNRESET ETIMEDOUT ENOTFOUND EHOSTUNREACH ENETUNREACH ENOENT EACCES EPERM EBUSY '
  + 'EEXIST EISDIR ENOTDIR EPIPE EAI AGAIN ENOSPC EMFILE ABORT TIMEOUT BUSY LOCKED INVALID UNKNOWN NOT FOUND '
  + 'SAN FIND ITEM ERROR WARN INFO TEAMS GMAIL OUTLOOK EXCHANGE GITHUB OLLAMA MISTRAL ANTHROPIC RPC SOAP').split(' '));

function sansAccents(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Clés des dossiers dont les valeurs sont nominatives (nom, adresse, banque…).
const RE_CLE_SENSIBLE = /nom|prenom|usage|adresse|commune|ville|voie|lieu|email|mail|tel|raison|denomination|representant|conjoint|naissance|profession|banque|etablissement|agence|notaire|confrere|office|cadastre|parcelle|syndic|chemin|fichier|dossier|reference|acquereur|vendeur|titulaire|client|beneficiaire|promettant|interlocuteur|contact/i;

// Pure : les mots à masquer, tirés des dossiers et des noms supplémentaires (collaborateurs).
function motsSensibles(dossiers, extras = []) {
  const mots = new Set();
  const ajouterTexte = (t) => {
    for (const m of sansAccents(t).split(/[^A-Za-z0-9]+/)) {
      if (m.length >= 3 && !/^\d+$/.test(m) && !MOTS_COURANTS.has(m.toLowerCase())) mots.add(m.toLowerCase());
    }
  };
  const parcourir = (v, cleSensible, profondeur) => {
    if (profondeur > 8 || v == null) return;
    if (typeof v === 'string') { if (cleSensible) ajouterTexte(v); return; }
    if (Array.isArray(v)) { for (const x of v.slice(0, 500)) parcourir(x, cleSensible, profondeur + 1); return; }
    if (typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        if (k === 'historique' || k === 'analyse' || k === 'texte') continue;
        parcourir(x, cleSensible || RE_CLE_SENSIBLE.test(k), profondeur + 1);
      }
    }
  };
  for (const d of dossiers || []) {
    if (!d || d.deleted) continue;
    ajouterTexte(d.nom || '');
    parcourir(d, false, 0);
  }
  for (const e of extras) ajouterTexte(e);
  return mots;
}

// Pure : un texte sans donnée nominative. `mots` = motsSensibles(...).
function anonymiserTexte(texte, mots) {
  let s = String(texte == null ? '' : texte);
  const gardes = [];
  const garder = (m) => { gardes.push(m); return `\u0000${gardes.length - 1}\u0000`; };
  // Positions dans le code : utiles pour corriger, sans rien de nominatif.
  s = s.replace(/[A-Za-z0-9_.-]+\.(?:m?js|cjs):\d+(?::\d+)?/g, (m) => garder(m.split(/[\\/]/).pop()));
  s = s.replace(/https?:\/\/[^\s)'"«»<>]+/g, '[url]');
  s = s.replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[email]');
  // Chemins Windows (UNC, lecteur) et Unix : jusqu'au prochain délimiteur (les noms de dossiers
  // clients contiennent des espaces).
  s = s.replace(/(?:\\\\|\b[A-Za-z]:\\|(?:^|[\s'"(«])\/(?:home|mnt|Users|tmp|var|srv|media|opt|root)\/)[^'"«»()\n,;]*/g, (m) => {
    const debut = /^[\s'"(«]/.test(m) ? m[0] : '';
    return `${debut}[chemin]`;
  });
  s = s.replace(/[^\s'"«»/\\:]+\.(?:pdf|docx?|xlsx?|zip|eml|xml|jpe?g|png|tiff?|txt|odt)\b/gi, '[fichier]');
  s = s.replace(/\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}(?:\s?[A-Z0-9]{1,3})?\b/g, '[iban]');
  s = s.replace(/(?<!\d)0\d(?:[ .]?\d{2}){4}(?!\d)/g, '[tel]');
  s = s.replace(/(?<![\w\u0000])\d{1,3}(?:[ .  ]\d{3})+(?:,\d{1,2})?(?![\w\u0000])|(?<![\w\u0000])\d{4,}(?:,\d{1,2})?(?![\w\u0000])/g, '[n]');
  s = s.replace(/[A-Za-zÀ-ÖØ-öø-ÿ0-9]+/g, (mot) => {
    const cle = sansAccents(mot).toLowerCase();
    if (mots && mots.has(cle)) return '[nom]';
    if (/^[A-ZÀ-ÖØ-Þ]{3,}$/.test(mot) && !SIGLES_TECHNIQUES.has(sansAccents(mot))) return '[nom]';
    return mot;
  });
  // Masques voisins fusionnés (« [nom] [nom] / [nom] » → « [nom] / [nom] » reste lisible).
  s = s.replace(/\[nom\](?:[ -]\[nom\])+/g, '[nom]');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => gardes[Number(i)] || '');
}

// Pure : créneau dû maintenant (« 2026-09-30 17h »), ou null. Jours ouvrés, 12 h et 17 h ; un
// serveur allumé après l'heure rattrape le créneau manqué tant que le suivant n'est pas arrivé.
function creneauDu(maintenant, dernierCreneau, creneaux = CRENEAUX_RAPPORT) {
  const { date, heure } = momentParis(maintenant);
  const jour = new Date(date + 'T12:00:00Z').getUTCDay();
  if (jour === 0 || jour === 6) return null;
  const h = Number(String(heure).slice(0, 2));
  const passes = creneaux.filter((c) => h >= c);
  if (!passes.length) return null;
  const cle = `${date} ${String(passes[passes.length - 1]).padStart(2, '0')}h`;
  return cle === dernierCreneau ? null : cle;
}

function dateHeureParis(iso) {
  if (!iso) return '—';
  const { date, heure } = momentParis(new Date(iso));
  const [a, m, j] = date.split('-');
  return `${j}/${m}/${a} ${heure.replace(':', ' h ')}`;
}

function blocCode(texte, max = 1200) {
  const t = String(texte).slice(0, max).replace(/```/g, 'ˋˋˋ');
  return '```\n' + t + (String(texte).length > max ? '\n…' : '') + '\n```';
}

// Regroupe les entrées du journal par message anonymisé (les masques rapprochent les répétitions).
function grouperMessages(entrees, mots) {
  const groupes = new Map();
  for (const e of entrees) {
    const msg = anonymiserTexte(e.message, mots);
    const cle = msg + '|' + ((e.details && e.details.source) || '');
    const g = groupes.get(cle) || { message: msg, fois: 0, derniere: '', source: e.details && e.details.source ? anonymiserTexte(e.details.source, mots) : '', versions: new Set(), ecrans: new Set() };
    g.fois += e.fois || 1;
    if (e.derniere > g.derniere) g.derniere = e.derniere;
    if (e.details && e.details.version) g.versions.add(String(e.details.version).slice(0, 40));
    if (e.details && e.details.onglet) g.ecrans.add(anonymiserTexte(String(e.details.onglet).slice(0, 60), mots));
    groupes.set(cle, g);
  }
  return [...groupes.values()].sort((a, b) => b.fois - a.fois || b.derniere.localeCompare(a.derniere));
}

function dansPeriode(iso, depuis, jusqua) {
  return typeof iso === 'string' && iso > depuis && iso <= jusqua;
}

function compter(liste, cle) {
  const r = {};
  for (const x of liste) { const k = cle(x) || '—'; r[k] = (r[k] || 0) + 1; }
  return Object.entries(r).sort((a, b) => b[1] - a[1]);
}

function mediane(nombres) {
  const t = nombres.filter(Number.isFinite).sort((a, b) => a - b);
  if (!t.length) return null;
  const m = Math.floor(t.length / 2);
  return t.length % 2 ? t[m] : Math.round((t[m - 1] + t[m]) / 2);
}

// Pure : le rapport (titre + corps Markdown) à partir des données rassemblées. Rien de nominatif
// n'y entre qui ne soit passé par anonymiserTexte.
function construireRapport(d) {
  const mots = d.mots || new Set();
  const depuis = d.depuis;
  const jusqua = d.jusqua;
  const evenements = d.evenements || [];
  const erreursServeur = evenements.filter((e) => e.categorie === 'erreur-serveur');
  const avertissements = evenements.filter((e) => e.categorie === 'avertissement-serveur');
  const erreursPostes = evenements.filter((e) => e.categorie === 'erreur-poste');
  const corrections = evenements.filter((e) => e.categorie === 'correction-extraction');
  const scansLus = evenements.filter((e) => e.categorie === 'scan-lu');
  const signalements = (d.signalements || []).filter((s) => dansPeriode(s.created_at, depuis, jusqua));
  const rangements = (d.journalScans || []).filter((j) => dansPeriode(j.date, depuis, jusqua));
  const ecartes = (d.scansEcartes || []).filter((j) => dansPeriode(j.date, depuis, jusqua));
  const agenda = d.dernierTourAgenda || null;
  const rappels = d.dernierTourRappels || null;
  const sauvegarde = d.etatSauvegarde || null;
  const dossiers = (d.dossiers || []).filter((x) => x && !x.deleted);

  const nbOcc = (l) => l.reduce((n, e) => n + (e.fois || 1), 0);
  const aExaminer = [];
  if (erreursServeur.length) aExaminer.push(`${nbOcc(erreursServeur)} erreur(s) du serveur`);
  if (erreursPostes.length) aExaminer.push(`${nbOcc(erreursPostes)} erreur(s) dans les navigateurs`);
  if (signalements.length) aExaminer.push(`${signalements.length} signalement(s) de l'étude`);
  if (corrections.length) aExaminer.push(`${nbOcc(corrections)} correction(s) à la main après une extraction`);
  if (agenda && (agenda.erreur || agenda.identifiantsRefuses)) aExaminer.push("l'agenda n'a pas pu être lu au dernier tour");
  if (rappels && rappels.erreurs && rappels.erreurs.length) aExaminer.push(`${rappels.erreurs.length} erreur(s) au dernier tour des rappels`);
  if (sauvegarde && sauvegarde.derniereTentative && !sauvegarde.derniereTentative.ok) aExaminer.push('la dernière sauvegarde a échoué');
  const nonReconnus = scansLus.filter((e) => e.details && e.details.reconnu === false);
  if (nonReconnus.length) aExaminer.push(`${nonReconnus.length} scan(s) dont le type n'a pas été reconnu`);
  const calme = aExaminer.length === 0;

  const { date: jourFin, heure: heureFin } = momentParis(new Date(jusqua));
  const [a, m, j] = jourFin.split('-');
  const titre = `Rapport CLAIRE — ${j}/${m}/${a} ${heureFin.slice(0, 2)} h — ${calme ? 'rien à signaler' : aExaminer.length + ' point(s) à examiner'}`;

  const L = [];
  L.push('<!-- rapport-claire v1 : produit automatiquement par le serveur de l\'étude, anonymisé avant l\'envoi -->');
  const b = d.buildInstalle;
  const versionsPostes = [...new Set(evenements.map((e) => e.details && e.details.version).filter(Boolean))];
  L.push(`**Période** : du ${dateHeureParis(depuis)} au ${dateHeureParis(jusqua)} (heure de Paris)  `);
  L.push(`**Serveur** : ${b && b.build ? `build ${b.build}${b.commit ? ` (commit ${b.commit.slice(0, 7)})` : ''}` : 'version inconnue (mode développement ou exe ancien)'}${versionsPostes.length ? ` · **Postes** : ${versionsPostes.slice(0, 5).join(', ')}` : ''}  `);
  L.push('_Noms, adresses, montants, chemins et noms de fichiers sont remplacés par [nom], [n], [chemin], [fichier]… avant l\'envoi._');
  L.push('');
  L.push('## À examiner');
  L.push(calme ? '- Rien : aucune erreur, aucun signalement, aucune correction à la main.' : aExaminer.map((x) => `- ${x}`).join('\n'));

  const sectionMessages = (titreSection, entrees) => {
    if (!entrees.length) return;
    const groupes = grouperMessages(entrees, mots);
    L.push('', `## ${titreSection} (${nbOcc(entrees)})`);
    for (const g of groupes.slice(0, MAX_GROUPES)) {
      const meta = [`${g.fois} fois`, `dernière ${dateHeureParis(g.derniere)}`, g.source && `source ${g.source}`, g.ecrans.size && `écran ${[...g.ecrans].join(', ')}`, g.versions.size && `version ${[...g.versions].join(', ')}`].filter(Boolean).join(' · ');
      L.push(`- ${meta}`, blocCode(g.message));
    }
    if (groupes.length > MAX_GROUPES) L.push(`- … et ${groupes.length - MAX_GROUPES} autre(s) message(s).`);
  };
  sectionMessages('Erreurs du serveur', erreursServeur);
  sectionMessages('Erreurs dans les navigateurs', erreursPostes);

  if (signalements.length) {
    L.push('', `## Signalements (${signalements.length})`);
    for (const s of signalements) {
      let ctx = {};
      try { ctx = s.contexte ? JSON.parse(s.contexte) : {}; } catch (_) { ctx = {}; }
      const meta = [s.gravite, s.statut, ctx.onglet && `écran ${anonymiserTexte(String(ctx.onglet).slice(0, 60), mots)}`, ctx.version && `version ${String(ctx.version).slice(0, 40)}`, dateHeureParis(s.created_at)].filter(Boolean).join(' · ');
      L.push(`- **${meta}**`);
      if (s.action) L.push(`  - Ce qui était fait : ${anonymiserTexte(String(s.action).slice(0, 800), mots)}`);
      if (s.constat) L.push(`  - Constat : ${anonymiserTexte(String(s.constat).slice(0, 1500), mots)}`);
      const errs = Array.isArray(ctx.erreurs) ? ctx.erreurs.slice(-5) : [];
      for (const e of errs) if (e && e.message) L.push(`  - Erreur récente du poste : \`${anonymiserTexte(String(e.message).slice(0, 300), mots).replace(/`/g, 'ˋ')}\`${e.source ? ` (${anonymiserTexte(String(e.source), mots)})` : ''}`);
    }
  }

  if (corrections.length) {
    L.push('', `## Corrections à la main après extraction (${nbOcc(corrections)})`);
    L.push('Champs que l\'étude a dû corriger (la valeur n\'est jamais envoyée) :');
    const parChamp = {};
    for (const c of corrections) {
      const cle = `${(c.details && c.details.champ) || c.message}${c.details && c.details.origine ? ` (proposé par ${c.details.origine})` : ''}`;
      parChamp[cle] = (parChamp[cle] || 0) + (c.fois || 1);
    }
    for (const [k, n] of Object.entries(parChamp).sort((x, y) => y[1] - x[1])) L.push(`- ${anonymiserTexte(k, mots)} : ${n}`);
  }

  L.push('', '## Agenda (dernier tour de lecture)');
  if (!agenda || !agenda.at) L.push('- Aucun tour enregistré (connexion Exchange non configurée ?).');
  else {
    L.push(`- ${dateHeureParis(agenda.at)} : ${agenda.ok ? 'lu' : 'échec'} · ${agenda.evenementsLus || 0} événement(s) lu(s) · ${agenda.dossiersVerifies || 0} dossier(s) comparé(s) · ${(agenda.misAJour || []).length} mis à jour · ${(agenda.sansCorrespondance || []).length} sans correspondance · ${(agenda.echeancesPosees || []).length} date(s) butoir posée(s)`);
    if (agenda.identifiantsRefuses) L.push('- Identifiants Exchange refusés : lecture automatique suspendue.');
    if (agenda.erreur) L.push(`- Erreur : \`${anonymiserTexte(agenda.erreur, mots).replace(/`/g, 'ˋ')}\``);
  }

  L.push('', '## Rappels (dernier tour)');
  if (!rappels || !rappels.at) L.push('- Aucun tour enregistré.');
  else {
    L.push(`- ${dateHeureParis(rappels.at)} (${rappels.declenche}) : ${rappels.rappelsEnvoyes}/${rappels.rappelsDus} rappel(s) envoyé(s)`);
    for (const e of (rappels.erreurs || []).slice(0, 10)) L.push(`- Erreur : \`${anonymiserTexte(e, mots).replace(/`/g, 'ˋ')}\``);
    for (const e of (rappels.avertissements || []).slice(0, 5)) L.push(`- Avertissement : \`${anonymiserTexte(e, mots).replace(/`/g, 'ˋ')}\``);
  }

  L.push('', '## Claire Scan');
  if (!rangements.length && !ecartes.length && !scansLus.length) L.push('- Aucun scan traité sur la période.');
  else {
    const auto = rangements.filter((r) => r.auto).length;
    L.push(`- Rangés : ${rangements.length} (${auto} automatiquement, ${rangements.length - auto} à la main) · écartés : ${ecartes.length}`);
    if (rangements.length) L.push(`- Par type : ${compter(rangements, (r) => r.type).map(([k, n]) => `${anonymiserTexte(k, mots)} ${n}`).join(', ')}`);
    if (scansLus.length) {
      const ocr = scansLus.filter((e) => e.details && e.details.ocr);
      const med = mediane(scansLus.map((e) => e.details && e.details.dureeMs));
      const medOcr = mediane(ocr.map((e) => e.details && e.details.dureeMs));
      L.push(`- Lectures dans les navigateurs : ${nbOcc(scansLus)} (dont ${ocr.length} avec OCR) · durée médiane ${med != null ? Math.round(med / 100) / 10 + ' s' : '—'}${medOcr != null ? ` · avec OCR ${Math.round(medOcr / 100) / 10} s` : ''} · type non reconnu : ${nonReconnus.length} · dossier sûr : ${scansLus.filter((e) => e.details && e.details.sur).length}`);
    }
  }

  L.push('', '## Sauvegarde');
  const tentative = sauvegarde && sauvegarde.derniereTentative;
  if (!sauvegarde || (!sauvegarde.derniereReussie && !tentative)) L.push('- Aucun état enregistré.');
  else {
    L.push(`- Dernière réussie : ${dateHeureParis(sauvegarde.derniereReussie)}${tentative ? ` · dernière tentative ${dateHeureParis(tentative.at)} : ${tentative.ok ? 'réussie' : 'échec'}${tentative.locale ? ' (copie locale seulement, pas sur le NAS)' : ''}` : ''}`);
    if (tentative && !tentative.ok && tentative.erreur) L.push(`- Erreur : \`${anonymiserTexte(tentative.erreur, mots).replace(/`/g, 'ˋ')}\``);
  }

  const creesPeriode = dossiers.filter((x) => (x.historique || []).some((h) => h && h.texte === 'Dossier créé' && dansPeriode(h.date, depuis, jusqua))).length;
  const archivesPeriode = dossiers.filter((x) => (x.historique || []).some((h) => h && /^Dossier archivé/.test(h.texte || '') && dansPeriode(h.date, depuis, jusqua))).length;
  L.push('', '## Activité');
  L.push(`- Dossiers actifs : ${dossiers.filter((x) => !x.archive).length} · créés sur la période : ${creesPeriode} · archivés : ${archivesPeriode}`);
  if (avertissements.length) {
    L.push(`- Avertissements du serveur : ${nbOcc(avertissements)} (détail ci-dessous, les plus fréquents)`);
    for (const g of grouperMessages(avertissements, mots).slice(0, 8)) L.push(`  - ${g.fois} fois : \`${g.message.slice(0, 300).replace(/`/g, 'ˋ')}\``);
  }

  let corps = L.join('\n');
  if (corps.length > MAX_CORPS_ISSUE) corps = corps.slice(0, MAX_CORPS_ISSUE) + '\n\n… (rapport tronqué)';
  return { titre, corps, calme, points: aExaminer.length };
}

// Rassemble les données du rapport depuis la base (non pur : lit le journal, les paramètres, les
// dossiers et les signalements).
function rassemblerDonnees({ journal, parametresRepo, depot, db, depuis, jusqua, buildInstalle, collaborateurs }) {
  let signalements = [];
  try {
    signalements = db.prepare('SELECT created_at, gravite, statut, action, constat, contexte FROM signalements WHERE created_at > ? AND created_at <= ? ORDER BY created_at').all(depuis, jusqua);
  } catch (_) { signalements = []; }
  const dossiers = depot.tous();
  return {
    depuis, jusqua, buildInstalle,
    evenements: journal.lire(depuis, jusqua),
    signalements,
    journalScans: parametresRepo.lireJournalScans ? parametresRepo.lireJournalScans() : [],
    scansEcartes: parametresRepo.lireScansEcartes ? parametresRepo.lireScansEcartes() : [],
    dernierTourAgenda: parametresRepo.lireDernierTourAgenda ? parametresRepo.lireDernierTourAgenda() : null,
    dernierTourRappels: parametresRepo.lireDernierTour ? parametresRepo.lireDernierTour() : null,
    etatSauvegarde: parametresRepo.lireEtatSauvegarde ? parametresRepo.lireEtatSauvegarde() : null,
    dossiers,
    mots: motsSensibles(dossiers, collaborateurs || [])
  };
}

function messageErreurGithubRapport(statut) {
  if (statut === 401) return 'Jeton GitHub refusé : il a expiré ou a été révoqué (Réglages › Mise à jour).';
  if (statut === 403 || statut === 404) return "Le jeton GitHub n'a pas le droit d'écrire les issues : ajoutez la permission « Issues : lecture et écriture » au jeton (github.com › Settings › Developer settings › Fine-grained tokens).";
  if (statut === 410) return 'Les issues sont désactivées sur le dépôt GitHub.';
  return `GitHub a refusé le rapport (HTTP ${statut}).`;
}

// Dépose le rapport en issue. Une étiquette inconnue que le jeton ne peut pas créer fait échouer la
// création (422) : on réessaie alors une fois sans étiquette (le titre suffit à le retrouver).
async function envoyerIssue({ jeton, titre, corps, fetchFn = fetch, depot = DEPOT_GITHUB_RAPPORT }) {
  const appel = async (avecEtiquette) => {
    const ctrl = new AbortController();
    const minuteur = setTimeout(() => ctrl.abort(), DELAI_GITHUB_MS);
    try {
      return await fetchFn(`https://api.github.com/repos/${depot}/issues`, {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          'User-Agent': 'CLAIRE-serveur', Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json', Authorization: `Bearer ${jeton}`
        },
        body: JSON.stringify(avecEtiquette ? { title: titre, body: corps, labels: [ETIQUETTE_RAPPORT] } : { title: titre, body: corps })
      });
    } finally { clearTimeout(minuteur); }
  };
  let r;
  try { r = await appel(true); if (r.status === 422) r = await appel(false); }
  catch (e) { throw new Error(e && e.name === 'AbortError' ? 'GitHub ne répond pas (délai dépassé).' : `GitHub injoignable : ${e.message}`); }
  if (!r.ok) throw new Error(messageErreurGithubRapport(r.status));
  const json = await r.json();
  return { numero: json.number, url: json.html_url };
}

// Construit (et envoie, sauf `apercu`) le rapport de la période écoulée depuis le dernier envoi.
async function executerRapportTechnique({ journal, parametresRepo, depot, db, buildInstalle, collaborateurs, fetchFn, horloge = () => new Date(), creneau = null, apercu = false }) {
  const etat = parametresRepo.lireRapportTechnique();
  const jusqua = horloge().toISOString();
  const depuis = (etat.dernierEnvoi && etat.dernierEnvoi.jusqua) || new Date(Date.parse(jusqua) - 24 * 3600000).toISOString();
  const rapport = construireRapport(rassemblerDonnees({ journal, parametresRepo, depot, db, depuis, jusqua, buildInstalle, collaborateurs }));
  if (apercu) return { rapport, etat };
  const suivant = { ...etat, derniereTentative: jusqua };
  if (creneau) suivant.dernierCreneau = creneau;
  const jeton = parametresRepo.lireReglagesMiseAJour().jetonGithub;
  if (!jeton) {
    suivant.derniereErreur = 'Aucun jeton GitHub enregistré (Réglages › Mise à jour) : le rapport ne peut pas partir.';
  } else {
    try {
      const r = await envoyerIssue({ jeton, titre: rapport.titre, corps: rapport.corps, fetchFn });
      suivant.dernierEnvoi = { at: jusqua, depuis, jusqua, numero: r.numero, url: r.url, calme: rapport.calme, points: rapport.points };
      suivant.derniereErreur = null;
    } catch (e) {
      suivant.derniereErreur = e.message;
    }
  }
  const enregistre = parametresRepo.ecrireRapportTechnique(suivant);
  try { journal.purger(); } catch (_) { /* jamais bloquant */ }
  return { rapport, etat: enregistre };
}

// Minuteur : une vérification par minute, un seul essai par créneau (jamais de relance automatique
// après un échec — le bouton « Envoyer maintenant » des Réglages sert à réessayer).
function demarrerRapportTechnique(options, intervalleMs = 60 * 1000) {
  let enCours = false;
  const tour = async () => {
    if (enCours) return;
    const etat = options.parametresRepo.lireRapportTechnique();
    if (!etat.actif) return;
    const creneau = creneauDu(new Date(), etat.dernierCreneau);
    if (!creneau) return;
    enCours = true;
    try { await executerRapportTechnique({ ...options, creneau }); }
    catch (e) { console.warn('[CLAIRE] Rapport technique interrompu :', e.message); }
    finally { enCours = false; }
  };
  tour();
  return setInterval(tour, intervalleMs);
}

module.exports = {
  DEPOT_GITHUB_RAPPORT, ETIQUETTE_RAPPORT, CRENEAUX_RAPPORT, SIGLES_TECHNIQUES,
  motsSensibles, anonymiserTexte, creneauDu, construireRapport, rassemblerDonnees,
  envoyerIssue, messageErreurGithubRapport, executerRapportTechnique, demarrerRapportTechnique
};
