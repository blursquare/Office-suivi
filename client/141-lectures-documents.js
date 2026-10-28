// ==== Lectures automatiques de documents (étude 28/10) ====
//
// « Lorsque Claire détecte un acte de naissance dans Authentic ou sur le NAS, qu'elle le lise pour nous dire s'il y a une mention au
// répertoire civil ; qu'elle nous dise s'il y a une inscription hypothécaire sur un EHF ; s'il y a des travaux votés dans un procès-verbal
// d'assemblée générale d'une copropriété (à lire sur le NAS). Elle nous le dit dans la discussion du dossier. »
//
// Le POSTE lit (pdf.js, OCR des pages scannées : les mêmes lecteurs que « Demander à CLAIRE ») ; rien ne part à une IA : tout est du code.
// Un document est lu UNE fois (`d.lecturesDocuments[cle]`, gardé sur la fiche et partagé entre les postes) ; seuls les fichiers du NAS
// modifiés depuis 30 jours sont pris (jamais tout l'historique d'un coup dans les discussions) ; un document à la fois sur ce poste.
// Le résultat est un message de CLAIRE dans la discussion du dossier, et reste sur la fiche.

var JOURS_LECTURES_DOCUMENTS = 30;
var MAX_PAGES_LECTURE_DOCUMENT = 30;
var MAX_PAGES_OCR_LECTURE_DOCUMENT = 6;
var INTERVALLE_LECTURES_DOSSIER_MS = 30 * 60 * 1000;
// Mise en service (audit 0.391.0) : la lecture SEULE ne prend que ce qui arrive à partir de ce jour (pas de vague de messages sur tous les
// dossiers) ; « Demander à CLAIRE » relit les 30 derniers jours sur demande.
var DEBUT_LECTURES_DOCUMENTS = '2026-10-28';
var RESERVATION_LECTURE_MS = 15 * 60 * 1000;     // une lecture « en cours » plus vieille est reprise (fenêtre fermée pendant la lecture)
var MAX_LECTURES_PAR_TOUR = 3;                   // par dossier et par tour
var fileLecturesDocuments = Promise.resolve();
var lecturesDocumentsVues = {};   // dossier → dernière planification (ms), sur ce poste
var lecturesAuthenticEnFile = new Set();

// Pure : la sorte d'un document d'après son NOM (jamais le contenu, règle des pièces) — '' s'il n'est pas à lire.
// `copropriete` : un PV d'AG n'est lu que pour une vente en copropriété.
function sorteDocumentALire(nom, copropriete) {
  const n = String(nom || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[_-]+/g, ' ');
  if (!/\.pdf$/.test(n)) return '';
  // Une demande, une réquisition ou un courrier n'est pas le document lui-même (audit 0.391.0).
  if (/(^|[^a-z])(demande|requisition|requete|courrier|relance)([^a-z]|$)/.test(n)) return '';
  if (/naissance/.test(n) && !/(date|lieu) de naissance/.test(n)) return 'naissance';
  if (/(^|[^a-z])ehf([^a-z]|$)|hors\s*formalite|etat\s*hypoth|renseignements?\s*hypoth/.test(n)) return 'ehf';
  if (copropriete && (/proces\s*verbal|(^|[^a-z])pv([^a-z]|$)/.test(n) && /(^|[^a-z])(a\s?g|ago|age|agm)([^a-z]|$)|assemblee/.test(n) || /assemblee\s*generale/.test(n))) return 'pv-ag';
  return '';
}

// Pure : les mentions au répertoire civil d'un acte de naissance. Une mention cite le « répertoire civil » ou « RC n° … » (jamais « RCS ») ;
// sa nature est lue autour (tutelle, curatelle, sauvegarde de justice, habilitation familiale, mandat de protection future, régime
// matrimonial, présomption d'absence). Rend { acteNaissance, mentions: [{ nature, extrait }] }.
var NATURES_MENTION_RC = [
  [/curatelle/i, 'curatelle'], [/tutelle/i, 'tutelle'], [/sauvegarde de justice/i, 'sauvegarde de justice'],
  [/habilitation familiale/i, 'habilitation familiale'], [/mandat de protection future/i, 'mandat de protection future'],
  [/r[ée]gime matrimonial|changement de r[ée]gime/i, 'changement de régime matrimonial'], [/(pr[ée]somption|d[ée]claration|jugement)\s+d.absence/i, 'présomption d’absence']
];
function mentionsRepertoireCivil(texte) {
  const t = String(texte || '').replace(/\s+/g, ' ');
  const re = /r[ée]pertoire\s+civil|(?:^|[^A-Za-z])R\.?\s?C\.?\s*(?:A\.?\s*)?(?:n[°ºo]\.?|num[ée]ro)\s*\S+/gi;
  const mentions = [];
  let m;
  while ((m = re.exec(t)) !== null && mentions.length < 5) {
    const debut = Math.max(0, m.index - 160);
    const extrait = t.slice(debut, Math.min(t.length, m.index + m[0].length + 160)).trim();
    const nature = (NATURES_MENTION_RC.find(([r]) => r.test(extrait)) || [null, 'mesure ou mention à lire'])[1];
    // Gardé : la nature et la référence de la mention seulement (« RC n° … »), jamais l'identité autour (audit 0.391.0).
    const reference = m[0].replace(/^[^A-Za-z]/, '').trim().slice(0, 60);
    if (!mentions.some(x => x.extrait === extrait)) mentions.push({ nature, extrait, reference });
  }
  return { acteNaissance: /acte de naissance|extrait d.acte de naissance|copie int[ée]grale|extrait avec filiation|extrait sans filiation/i.test(t), mentions: mentions.map(x => ({ nature: x.nature, reference: x.reference })) };
}

// Pure : les travaux votés dans un PV d'assemblée générale — une résolution de TRAVAUX (jamais la cotisation au fonds de travaux, le contrat
// ou les honoraires du syndic, l'approbation des comptes) dont le DERNIER verdict est l'adoption (passerelle de l'article 25-1 : « n'est pas
// adoptée à la majorité de l'article 25 … second vote … adoptée »). Rend { date, resolutions: [{ numero, intitule, montant }], lu, decoupe }.
var RE_VERDICT_PV = /(?:est|a\s+[ée]t[ée])\s+adopt[ée]e|adopt[ée]e\s+(?:[àa]\s+la\s+majorit|[àa]\s+l.unanimit)|r[ée]solution\s+adopt[ée]e|rejet[ée]e|non\s+adopt[ée]e|n.est\s+pas\s+adopt[ée]e|n.a\s+pas\s+[ée]t[ée]\s+adopt[ée]e|refus[ée]e|ajourn[ée]e|sans\s+objet/gi;
var RE_TRAVAUX_PV = /travaux|ravalement|r[ée]fection|remplacement|toiture|ascenseur|[ée]tanch[ée]it[ée]|mise\s+en\s+conformit[ée]|r[ée]novation|isolation/i;
var RE_RESOLUTION_PV = /(?:^|\s)(?:r[ée]solution\s*(?:n[°ºo]\.?\s*)?(\d{1,3})|(\d{1,3})\s*(?:e|[èe]me|er)\s+r[ée]solution|question\s*n[°ºo]\.?\s*(\d{1,3}))\s*[:.\-–—]/gi;
function travauxVotesPv(texte) {
  const t = String(texte || '').replace(/\s+/g, ' ');
  const dateAg = (() => {
    const m = /assembl[ée]e\s+g[ée]n[ée]rale[^.]{0,80}?(?:du|le|tenue le)\s+(\d{1,2})[/.](\d{1,2})[/.](\d{4})/i.exec(t.slice(0, 4000));
    return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
  })();
  // Têtes de résolution : « Résolution n° 5 : », « 5ème résolution : », « Question n° 5 . » (suivies d'un séparateur, pas une simple citation).
  const tetes = [];
  let m;
  RE_RESOLUTION_PV.lastIndex = 0;
  while ((m = RE_RESOLUTION_PV.exec(t)) !== null) tetes.push({ index: m.index, numero: m[1] || m[2] || m[3] || '' });
  const resolutions = [];
  tetes.forEach((h, i) => {
    if (resolutions.length >= 10) return;
    const bloc = t.slice(h.index, i + 1 < tetes.length ? tetes[i + 1].index : t.length).trim();
    const tete = bloc.slice(0, 2500);
    if (!RE_TRAVAUX_PV.test(tete)) return;
    // Écartée seulement quand c'est l'OBJET de la résolution (en tête de l'intitulé) : fonds de travaux, contrat ou honoraires du syndic,
    // comptes, budget — une résolution de travaux qui les cite plus loin reste (relecture 0.391.1).
    const objet = tete.replace(/^\s*(?:r[ée]solution\s*(?:n[°ºo]\.?\s*)?\d{1,3}|\d{1,3}\s*(?:e|[èe]me|er)\s+r[ée]solution|question\s*n[°ºo]\.?\s*\d{1,3})\s*[:.\-–—]?\s*/i, '').slice(0, 70);
    if (/^(?:\S+\s+){0,3}?(?:fonds\s+(?:de\s+)?travaux|cotisation|contrat\s+de\s+syndic|d[ée]signation\s+du\s+syndic|honoraires|approbation\s+des\s+comptes|budget\s+pr[ée]visionnel)/i.test(objet)) return;
    const verdicts = bloc.match(RE_VERDICT_PV) || [];
    const dernier = verdicts.length ? verdicts[verdicts.length - 1] : '';
    if (!dernier || /rejet|non\s+adopt|pas\s+(?:[ée]t[ée]\s+)?adopt|refus|ajourn|sans\s+objet/i.test(dernier)) return;
    const intitule = bloc.replace(/^\s*(?:r[ée]solution\s*(?:n[°ºo]\.?\s*)?\d{1,3}|\d{1,3}\s*(?:e|[èe]me|er)\s+r[ée]solution|question\s*n[°ºo]\.?\s*\d{1,3})\s*[:.\-–—]?\s*/i, '').slice(0, 140).trim();
    const montant = (/(\d{1,3}(?:[ .  ]\d{3})+(?:,\d{2})?|\d+(?:,\d{2})?)\s*(?:€|euros?\b)/i.exec(bloc) || [])[0] || '';
    resolutions.push({ numero: h.numero, intitule, montant: montant.replace(/\s+/g, ' ').trim() });
  });
  return { date: dateAg, resolutions, lu: t.length > 200, decoupe: tetes.length > 0 };
}

// Pure : la phrase de CLAIRE pour la discussion du dossier.
function messageLectureDocument(sorte, nom, r) {
  const doc = `« ${String(nom || 'document').slice(0, 80)} »`;
  if (sorte === 'naissance') {
    if (!r || !r.lu) return `J’ai trouvé l’acte de naissance ${doc}, mais je n’ai pas pu le lire : à relire.`;
    if (r.mentions.length) return `Acte de naissance ${doc} : mention au répertoire civil (${[...new Set(r.mentions.map(x => x.nature))].join(', ')}${r.mentions[0].reference ? ` — ${r.mentions[0].reference}` : ''}). À vérifier avant la signature.`;
    // Jamais « aucune mention » sur un document qui n'est pas un acte de naissance, ni sur une lecture partielle (audit 0.391.0).
    if (!r.acteNaissance) return `J’ai lu ${doc}, mais je n’y reconnais pas un acte de naissance : à relire.`;
    if (r.partiel) return `Acte de naissance ${doc} : lecture partielle (${r.partiel}) — aucune mention au répertoire civil dans ce que j’ai pu lire, à relire.`;
    return `Acte de naissance ${doc} lu : aucune mention au répertoire civil${r.ocr ? ' (scan lu par reconnaissance de caractères : vérifiez les mentions marginales)' : ''}.`;
  }
  if (sorte === 'ehf') {
    if (!r || !r.etat) return `J’ai trouvé l’EHF ${doc}, mais je n’ai pas pu le lire : à relire.`;
    if (!r.etat.anf) return `EHF ${doc} lu, mais ce n’est pas un état-réponse que je sais lire : à relire par le notaire.`;
    return `EHF ${doc} — ${messageEtatHypothecaire(r.etat)}`;
  }
  if (sorte === 'pv-ag') {
    const quand = r && r.date ? ` du ${formatDateFr(r.date)}` : '';
    if (!r || !r.lu) return `J’ai trouvé le procès-verbal d’AG ${doc}, mais je n’ai pas pu le lire : à relire.`;
    if (!r.resolutions.length) {
      if (!r.decoupe) return `Procès-verbal de l’AG${quand} ${doc} : je n’y reconnais pas les résolutions, à relire.`;
      if (r.partiel) return `Procès-verbal de l’AG${quand} ${doc} : lecture partielle (${r.partiel}) — aucune résolution adoptée qui parle de travaux dans ce que j’ai pu lire, à relire.`;
      return `Procès-verbal de l’AG${quand} ${doc} lu : aucune résolution adoptée qui parle de travaux${r.ocr ? ' (scan lu par reconnaissance de caractères : à relire en cas de doute)' : ''}.`;
    }
    return `Procès-verbal de l’AG${quand} ${doc} : travaux votés${r.partiel ? ` (lecture partielle : ${r.partiel})` : ''} — ${r.resolutions.slice(0, 3).map(x => `résolution ${x.numero || '?'} : ${x.intitule.slice(0, 90)}${x.montant ? ` (${x.montant})` : ''}`).join(' ; ')}${r.resolutions.length > 3 ? ` (et ${r.resolutions.length - 3} autre${r.resolutions.length > 4 ? 's' : ''})` : ''}. Qui les paie : à régler dans l’acte.`;
  }
  return '';
}

// Le texte d'un PDF, page par page (OCR des pages sans texte, quelques-unes au plus).
async function textePdfLectureDocument(blob) {
  if (typeof pdfjsLib === 'undefined') throw new Error('lecteur de PDF indisponible');
  const pdf = await pdfjsLib.getDocument({ isEvalSupported: false, data: await blob.arrayBuffer(), verbosity: (pdfjsLib.VerbosityLevel ? pdfjsLib.VerbosityLevel.ERRORS : 0) }).promise;
  const pages = [];
  let worker = null;
  let ocr = 0;
  let nonLues = 0;
  try {
    for (let p = 1; p <= pdf.numPages && p <= MAX_PAGES_LECTURE_DOCUMENT; p++) {
      const page = await pdf.getPage(p);
      let texte = lignesDepuisItemsPdf((await page.getTextContent()).items).join('\n').trim();
      let ocrFaitPage = false;
      page.cleanup();
      if (texte.replace(/\s+/g, '').length < 30 && ocr < MAX_PAGES_OCR_LECTURE_DOCUMENT && typeof creerWorkerOcr === 'function') {
        if (worker === null) worker = (await creerWorkerOcr()) || false;
        if (worker) { texte = String(await ocrPage(pdf, p, worker) || '').trim(); ocr++; ocrFaitPage = true; }
      }
      // Non lue : une page sans texte que l'OCR n'a pas pu prendre (plafond, OCR indisponible) — une page passée par l'OCR et restée vide est
      // une page blanche (verso), pas une lecture partielle (relecture 0.391.1).
      if (texte.replace(/\s+/g, '').length < 30 && !ocrFaitPage) nonLues++;
      pages.push(texte);
    }
  } finally {
    if (worker) { try { await worker.terminate(); } catch (e) { /* déjà arrêté */ } }
    try { pdf.destroy(); } catch (e) { /* déjà libéré */ }
  }
  const total = pdf.numPages;
  nonLues += Math.max(0, total - MAX_PAGES_LECTURE_DOCUMENT);
  return { pages, ocr: ocr > 0, partiel: nonLues ? `${total - nonLues} page${total - nonLues > 1 ? 's' : ''} lue${total - nonLues > 1 ? 's' : ''} sur ${total}` : '' };
}

// Lit un document et le dit dans la discussion du dossier. `source` : 'nas' (chemin) ou 'authentic' (pjId). Une seule fois par document.
async function lireDocumentAutomatique(dossierId, source, ref, nom, sorte) {
  const cle = `${source}:${ref}`;
  // Ni sur un poste sans collaborateur (le message ne partirait pas) ni dans la fenêtre de CLAIRE (discussions interdites).
  if (!utilisateurPoste || (typeof POSTE_CLAIRE !== 'undefined' && POSTE_CLAIRE)) return;
  // Plusieurs postes planifient les mêmes documents : un délai au hasard, puis la fiche relue du serveur, avant de réserver (audit 0.391.0).
  await new Promise(r => setTimeout(r, Math.floor(Math.random() * 20000)));
  if (typeof rattraperDossiersDistants === 'function') await rattraperDossiersDistants();
  let d = dossiers.find(x => x && x.id === dossierId);
  if (!d || !lectureDocumentALancer((d.lecturesDocuments || {})[cle], Date.now())) return;
  // Réservé tout de suite (un autre poste qui relit la fiche ne le reprend pas).
  d.lecturesDocuments = Object.assign({}, d.lecturesDocuments, { [cle]: { sorte, nom: String(nom || '').slice(0, 160), le: new Date().toISOString(), enCours: true } });
  sauvegarder(d);
  let resultat = null;
  try {
    let blob;
    if (source === 'nas') {
      const r = await fetchAvecAuth('/api/nas/fichier?chemin=' + encodeURIComponent(ref));
      if (!r.ok) throw new Error('fichier illisible sur le NAS');
      blob = await r.blob();
    } else {
      blob = await blobPieceAuthenticAT(dossierId, ref);
    }
    if (sorte === 'ehf') {
      // L'EHF : la lecture de « Relire l'état hypothécaire » (200 pages, coupure DITE — jamais « aucune inscription » sur un relevé coupé).
      const { pages, tronque } = await textePagesPdfEtat(blob);
      resultat = { etat: Object.assign(analyserEtatHypothecaire(pages, isoAujourdhuiLocal()), { tronque }) };
    } else {
      const { pages, ocr, partiel } = await textePdfLectureDocument(blob);
      const texte = pages.join('\n');
      if (sorte === 'naissance') resultat = Object.assign({ lu: texte.replace(/\s+/g, '').length > 80, ocr, partiel }, mentionsRepertoireCivil(texte));
      else if (sorte === 'pv-ag') resultat = Object.assign({ ocr, partiel }, travauxVotesPv(texte));
    }
  } catch (e) {
    resultat = null;
  }
  d = dossiers.find(x => x && x.id === dossierId) || d;
  const message = messageLectureDocument(sorte, nom, resultat);
  const alerte = !!resultat && ((sorte === 'naissance' && resultat.mentions && resultat.mentions.length > 0)
    || (sorte === 'ehf' && resultat.etat && inscriptionsEnCours(resultat.etat).length > 0) || (sorte === 'pv-ag' && resultat.resolutions && resultat.resolutions.length > 0));
  d.lecturesDocuments = Object.assign({}, d.lecturesDocuments, { [cle]: { sorte, nom: String(nom || '').slice(0, 160), le: new Date().toISOString(), resume: message.slice(0, 500), alerte, lu: !!resultat } });
  ajouterHistorique(d, `Document lu par CLAIRE : ${message.slice(0, 220)}`);
  sauvegarder(d);
  try {
    const r = await fetchAvecAuth(`/api/canaux/${encodeURIComponent('d:' + d.id)}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auteur: utilisateurPoste || '', claire: true, texte: message }) });
    if (!r.ok) console.warn('Lecture de document : message non déposé dans la discussion du dossier (' + r.status + ')');
  } catch (e) { /* le résultat reste sur la fiche et dans l'historique */ }
  noterVerificationPoste('lecture-document-' + sorte, resultat ? { detail: alerte ? 'point signalé' : 'rien à signaler' } : { ok: false, message: 'document illisible' });
}

// Pure : une lecture est à lancer si rien n'est noté, ou si sa réservation est restée « en cours » plus de 15 min (fenêtre fermée pendant la
// lecture — audit 0.391.0).
function lectureDocumentALancer(deja, maintenantMs) {
  if (!deja) return true;
  return !!deja.enCours && !(maintenantMs - Date.parse(deja.le) < RESERVATION_LECTURE_MS);
}

// Les documents du NAS à lire pour ce dossier (modifiés depuis 30 jours — et depuis la mise en service, sauf `toutRelire` —, pas encore
// lus), 3 au plus par tour, mis dans la file du poste. Rend le nombre mis en file.
async function planifierLecturesDocuments(d, toutRelire) {
  if (!d || d.archive || !d.nasDossier || typeof fetchAvecAuth !== 'function') return 0;
  const maintenant = Date.now();
  if (lecturesDocumentsVues[d.id] && maintenant - lecturesDocumentsVues[d.id] < INTERVALLE_LECTURES_DOSSIER_MS) return 0;
  lecturesDocumentsVues[d.id] = maintenant;
  let fichiers = [];
  let base = '';
  try {
    const r = await fetchAvecAuth('/api/nas/fichiers?recents=300&dossier=' + encodeURIComponent(d.nasDossier));
    if (!r.ok) return 0;
    const j = await r.json();
    base = String(j.base || '');
    fichiers = j.fichiers || [];
  } catch (e) { return 0; }
  const limite = Math.max(maintenant - JOURS_LECTURES_DOCUMENTS * 86400000, toutRelire ? 0 : Date.parse(DEBUT_LECTURES_DOCUMENTS + 'T00:00:00'));
  const copro = !estSuccession(d) && d.typeVente === 'copropriete';
  const deja = d.lecturesDocuments || {};
  let n = 0;
  fichiers.forEach(f => {
    const nom = String(f.nom || String(f.chemin || '').split(/[\\/]/).pop());
    const sorte = sorteDocumentALire(nom, copro);
    const chemin = (base ? base + '/' : '') + String(f.chemin || '');
    if (n >= MAX_LECTURES_PAR_TOUR || !sorte || !lectureDocumentALancer(deja['nas:' + chemin], maintenant) || !(Date.parse(f.modifieLe) >= limite)) return;
    n++;
    fileLecturesDocuments = fileLecturesDocuments.then(() => lireDocumentAutomatique(d.id, 'nas', chemin, nom, sorte)).catch(() => {});
  });
  return n;
}

// Les actes de naissance des pièces jointes d'Authentic (GED relevée), pas encore lus — seulement quand CLAIRE est connectée à Authentic.
function planifierLecturesAuthentic(d) {
  if (!d || d.archive || !connexionAuthenticClaire || !connexionAuthenticClaire.actif) return;
  const sd = ((instantanesAuthenticAT[d.id] || {}).inst || {}).sousDossier;
  // Les pièces d'Authentic n'ont pas de date : seulement pour un dossier ouvert dans CLAIRE depuis la mise en service (sinon toute la GED
  // d'un ancien dossier passerait d'un coup) ; un acte aussi sur le NAS y est lu (audit 0.391.0) ; une pièce en file n'y est mise qu'une fois.
  const cree = ((d.historique || []).find(x => x && x.texte === 'Dossier créé') || {}).date;
  if (!cree || !(Date.parse(cree) >= Date.parse(DEBUT_LECTURES_DOCUMENTS + 'T00:00:00'))) return;
  const deja = d.lecturesDocuments || {};
  const maintenant = Date.now();
  let n = 0;
  ((sd && sd.pieces) || []).forEach(p => {
    const nom = String(p.nom || '');
    const cle = d.id + '|authentic:' + p.pjId;
    if (n >= MAX_LECTURES_PAR_TOUR || sorteDocumentALire(nom.replace(/(\.pdf)?$/i, '.pdf'), false) !== 'naissance' || !lectureDocumentALancer(deja['authentic:' + p.pjId], maintenant) || lecturesAuthenticEnFile.has(cle)) return;
    if (typeof correspondancePieceAuthenticAT === 'function' && correspondancePieceAuthenticAT(d, nom).nas) return;
    n++;
    lecturesAuthenticEnFile.add(cle);
    fileLecturesDocuments = fileLecturesDocuments.then(() => lireDocumentAutomatique(d.id, 'authentic', p.pjId, nom, 'naissance')).catch(() => {}).then(() => lecturesAuthenticEnFile.delete(cle));
  });
}

// Pour l'onglet Dossier et « Demander à CLAIRE » : les lectures faites, les plus récentes d'abord.
function lecturesDocumentsDossier(d) {
  return Object.entries((d && d.lecturesDocuments) || {}).map(([cle, v]) => Object.assign({ cle }, v)).filter(x => !x.enCours)
    .sort((a, b) => String(b.le).localeCompare(String(a.le)));
}

// « Demander à CLAIRE » (outil `lectures_documents`) : ce qui a été lu (sorte, date, résumé, point à signaler) ; relire = planifier tout de suite
// la lecture des documents du NAS pas encore lus (après « Autoriser » : CLAIRE écrira dans la discussion du dossier).
async function lecturesDocumentsAgent(e) {
  const d = dossiers.find(x => x && x.id === String((e && e.dossier_id) || ''));
  if (!d) return { erreur: 'aucun dossier avec cet id' };
  const lectures = lecturesDocumentsDossier(d).map(x => ({ sorte: x.sorte, lu_le: String(x.le).slice(0, 10), point_a_signaler: !!x.alerte, resume: x.resume || '' }));
  if (e && e.relire === true) {
    if (!d.nasDossier) return { erreur: 'dossier non relié au NAS', lectures };
    if (!(await demanderAutorisationAgent(`Lire les actes de naissance, EHF et procès-verbaux d’AG du dossier du NAS de ${libelleDossierAffiche(d)} (modifiés depuis 30 jours, pas encore lus) et le dire dans la discussion du dossier.`))) {
      return { refuse: true, message: 'l’utilisateur a refusé : ne le refais pas sans nouvelle demande', lectures };
    }
    delete lecturesDocumentsVues[d.id];
    const n = await planifierLecturesDocuments(d, true);
    if (!n) return { lancee: false, message: 'aucun document du NAS (30 derniers jours) à lire ou relire pour ce dossier', lectures };
    return { lancee: true, documents_mis_en_lecture: n, consigne: 'lecture en cours sur ce poste : le résultat arrive dans la discussion du dossier', lectures };
  }
  return { dossier_id: d.id, lectures, note: lectures.length ? '' : 'aucun acte de naissance, EHF ni procès-verbal d’AG lu pour ce dossier' };
}
