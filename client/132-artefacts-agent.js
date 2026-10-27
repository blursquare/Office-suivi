// CLAIRE corrige ce qu'elle a produit, sur demande (étude 27/10 : « qu'elle ouvre ses brouillons d'email sur le côté, idem pour tous les
// éléments qu'elle génère dans les conversations, pas de pop-up, et qu'elle puisse les corriger en suivant nos instructions » ; « permettre
// à CLAIRE d'enregistrer ses modèles de brouillon d'email dans les réglages si on lui demande après une génération »).
//   - outil `artefact` : lister / lire / modifier ce qui est ouvert dans le panneau de droite (client/99) — brouillon d'email (la fenêtre
//     d'email de client/28, posée dans le panneau), courrier, document, tableau. Lire rend l'état ACTUEL, corrections de l'utilisateur
//     comprises (résultat masqué par le serveur comme tout résultat d'outil ; un tableau : son aperçu seulement) ; modifier remplace
//     l'élément sous ses yeux — jamais un lien ni un IBAN nouveau, jamais un tableau —, le dit dans la conversation et le panneau ; rien ne
//     part ni ne s'enregistre (« Envoyer », « Word », « Ranger » restent à l'utilisateur) : pas de carte d'autorisation.
//   - outil `modele_email` : lister les modèles et leurs variables ; enregistrer un modèle de l'étude (Réglages › Modèles d'emails) après
//     la carte « Autoriser » — le serveur refuse un modèle qui cite un client ou un dossier (`origine: 'claire'`, routes/modelesEmails.js).

var MAX_TEXTE_ARTEFACT_AGENT = 20000;

// Pure : l'élément tel que l'agent le voit dans la liste.
function resumeArtefactAgent(a) {
  return { artefact_id: a.id, type: a.type, titre: a.titre, ...(a.dossierId ? { dossier_id: a.dossierId } : {}) };
}

function artefactAgentParId(id) {
  return artefactsAssistant.liste.find(x => x.id === id) || null;
}

// Le brouillon d'email lié à CET élément du panneau, jamais une autre rédaction ouverte entre-temps (audit 0.374.0, M3).
function brouillonDeArtefact(a) {
  return redaction && redaction.artefactId === a.id ? redaction : null;
}

// Pure : liens et IBAN d'un texte (une correction de CLAIRE n'en ajoute jamais un qui n'y était pas — audit 0.374.0, M4).
function liensEtIbanTexte(t) {
  return new Set((String(t || '').match(/https?:\/\/[^\s)\]>"']+|www\.[^\s)\]>"']+|\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}\b/gi) || []).map(x => x.replace(/\s+/g, '').toLowerCase()));
}

function lireArtefactAgent(a) {
  if (a.type === 'email') {
    const r = brouillonDeArtefact(a);
    if (!r) return { erreur: 'le brouillon d’email a été fermé, envoyé ou remplacé' };
    return { ...resumeArtefactAgent(a), destinataire: r.a || '', cc: r.cc || '', objet: r.sujet || '',
      texte: String(r.texte || texteDeHtmlRedaction(r.html) || '').slice(0, MAX_TEXTE_ARTEFACT_AGENT),
      pieces_jointes: (r.pieces || []).length };
  }
  if (a.type === 'courrier') return { ...resumeArtefactAgent(a), texte: texteCourrierArtefact(a.doc).slice(0, MAX_TEXTE_ARTEFACT_AGENT) };
  if (a.type === 'document') return { ...resumeArtefactAgent(a), texte: String(a.contenu || '').slice(0, MAX_TEXTE_ARTEFACT_AGENT) };
  // Le tableau d'un calcul ne repasse jamais par l'IA (client/98, audit 21/10 H1 ; audit 0.374.0, H1) : son aperçu seulement, comme à sa création.
  if (a.type === 'tableau') {
    return { ...resumeArtefactAgent(a), colonnes: a.colonnes, lignes_total: a.lignes.length,
      // L'aperçu fait au calcul, repères D001… compris — jamais les lignes affichées, où les repères sont devenus des libellés de dossiers.
      apercu: Array.isArray(a.apercuIa) ? a.apercuIa : [],
      note: 'pour corriger un tableau, refais le calcul (outil calcul) avec la correction' };
  }
  return { ...resumeArtefactAgent(a), note: 'un outil ouvert se remplit par outil_champs, pas ici' };
}

function modifierArtefactAgent(a, e) {
  const texte = typeof e.texte === 'string' ? e.texte.replace(/\r/g, '') : '';
  const brouillon = a.type === 'email' ? brouillonDeArtefact(a) || {} : null;
  const avant = brouillon ? `${brouillon.texte || ''} ${brouillon.sujet || ''}` : a.type === 'courrier' ? texteCourrierArtefact(a.doc) : a.contenu;
  const nouveaux = [...liensEtIbanTexte(texte + ' ' + (e.objet || ''))].filter(x => !liensEtIbanTexte(avant).has(x));
  if (nouveaux.length) return { erreur: 'une correction n’ajoute ni lien ni IBAN qui n’était pas dans le texte : demande à l’utilisateur de le coller lui-même' };
  if (a.type === 'email') {
    const r = brouillonDeArtefact(a);
    if (!r) return { erreur: 'le brouillon d’email a été fermé, envoyé ou remplacé : prépare-le de nouveau' };
    if (r.envoi) return { erreur: 'l’email est en cours d’envoi' };
    if (!texte.trim() && !String(e.objet || '').trim()) return { erreur: 'rien à modifier : donne le texte entier (et l’objet s’il change)' };
    if (String(e.objet || '').trim()) r.sujet = String(e.objet).replace(/\s+/g, ' ').trim().slice(0, 300);
    if (texte.trim()) {
      // « [Boutons de réponse] » (sondage) retrouve sa place de boutons, comme une saisie à la main.
      const corps = corpsDepuisTexteEditable(texte.trim().slice(0, 12000), r.boutons);
      // Comme une saisie à la main : le texte de l'éditeur change, pas le texte de départ — l'envoi part de l'éditeur, et un brouillon
      // de routine refermé garde la correction pour sa réouverture (relecture 0.374.0).
      r.html = htmlRedactionDepuisTexte(corps);
      r.texte = texteEditableEmail(corps);
      r.proposition = null;
    }
    a.titre = r.sujet ? 'Email : ' + r.sujet.slice(0, 60) : a.titre;
    renderRedaction();
  } else if (a.type === 'courrier') {
    if (!texte.trim()) return { erreur: 'texte vide : donne le courrier entier' };
    const doc = documentCourrierDepuisTexteAgent(texte, '');
    // La date déjà sur la page reste si le texte réécrit l'a omise (audit 0.374.0, B2).
    if (/…$/.test(doc.date) && a.doc && a.doc.date) doc.date = a.doc.date;
    a.doc = doc;
  } else if (a.type === 'document') {
    if (!texte.trim()) return { erreur: 'texte vide : donne le document entier' };
    a.contenu = texte.slice(0, 60000);
  } else if (a.type === 'tableau') {
    return { erreur: 'un tableau se corrige en refaisant le calcul (outil calcul) : tu n’en vois que l’aperçu' };
  } else return { erreur: 'cet élément ne se modifie pas ici (un outil se remplit par outil_champs)' };
  // Une correction de CLAIRE se voit (audit 0.374.0, M4) : bandeau dans le panneau et ligne dans la conversation.
  a.corrigeLe = Date.now();
  artefactsAssistant.courant = a.id;
  artefactsAssistant.version++;
  renderArtefactAssistant();
  poserMessageAssistant('claire', `<p>J’ai corrigé « ${escapeHtml(a.titre)} » à droite : relisez-le avant ${a.type === 'email' ? 'd’envoyer' : 'de le télécharger'}.</p>`, []);
  return { fait: true, affiche_a_l_utilisateur: `« ${a.titre} » corrigé dans le panneau de droite ; rien n’est envoyé ni enregistré` };
}

async function artefactAgent(e) {
  const mode = e && e.mode;
  if (POSTE_CLAIRE) return { erreur: 'pas de panneau sur l’ordinateur de CLAIRE' };
  if (mode === 'lister') {
    const liste = artefactsAssistant.liste.filter(a => a.type !== 'email' || brouillonDeArtefact(a)).map(resumeArtefactAgent);
    return { elements: liste, ...(liste.length ? {} : { note: 'rien n’est ouvert dans le panneau de droite' }) };
  }
  const a = artefactAgentParId(String(e && e.artefact_id || ''));
  if (!a) return { erreur: 'aucun élément ouvert avec cet artefact_id : appelle d’abord le mode lister' };
  if (mode === 'lire') return lireArtefactAgent(a);
  if (mode === 'modifier') return modifierArtefactAgent(a, e || {});
  return { erreur: 'mode inconnu (lister, lire ou modifier)' };
}

// ---- Modèles d'emails ----

async function modeleEmailAgent(e) {
  const mode = e && e.mode;
  if (mode === 'lister') {
    const etat = await chargerModelesEmails();
    return {
      modeles: listeModelesEmails(etat, { pourFenetre: true }).map(m => ({ nom: m.nom, de_l_etude: m.type === 'perso' })).slice(0, 80),
      variables: VARIABLES_MODELE_EMAIL.map(v => `{${v.nom}} : ${v.aide}`),
      conditions: CONDITIONS_MODELE_EMAIL.map(c => `{${c.nom}} en tête de paragraphe : ${c.aide}`)
    };
  }
  if (mode !== 'enregistrer') return { erreur: 'mode inconnu (lister ou enregistrer)' };
  const nom = String(e.nom || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  const sujet = String(e.objet || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  const corps = String(e.corps || '').replace(/\r/g, '').trim().slice(0, 12000);
  if (!nom) return { erreur: 'donne un nom court au modèle' };
  if (!corps) return { erreur: 'le texte du modèle est vide' };
  if (/\[à compléter\]/i.test(nom)) return { erreur: 'le nom du modèle ne peut pas être « à compléter »' };
  const ok = await demanderAutorisationAgent(`Enregistrer le modèle d’email « ${nom} » dans Réglages › Modèles d’emails (pour toute l’étude)`);
  if (!ok) return { refuse: true, message: 'l’utilisateur a refusé : ne le refais pas sans nouvelle demande' };
  try {
    const r = await fetchAvecAuth('/api/modeles-emails/perso', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nom, sujet, corps, par: utilisateurPoste || '', origine: 'claire' }) });
    const corpsRep = await r.json().catch(() => ({}));
    if (!r.ok) return { erreur: corpsRep.erreur || `le serveur a répondu ${r.status}` };
    await chargerModelesEmails();
    noterVerificationPoste('modele-email-claire', { detail: 'modèle enregistré' });
    return { fait: true, affiche_a_l_utilisateur: `modèle « ${nom} » enregistré dans Réglages › Modèles d’emails ; il apparaît dans le menu « Modèles » de la fenêtre d’email` };
  } catch (err) { return { erreur: 'serveur injoignable' }; }
}
