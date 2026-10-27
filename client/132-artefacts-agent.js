// CLAIRE corrige ce qu'elle a produit, sur demande (étude 27/10 : « qu'elle ouvre ses brouillons d'email sur le côté, idem pour tous les
// éléments qu'elle génère dans les conversations, pas de pop-up, et qu'elle puisse les corriger en suivant nos instructions » ; « permettre
// à CLAIRE d'enregistrer ses modèles de brouillon d'email dans les réglages si on lui demande après une génération »).
//   - outil `artefact` : lister / lire / modifier ce qui est ouvert dans le panneau de droite (client/99) — brouillon d'email (la fenêtre
//     d'email de client/28, posée dans le panneau), courrier, document, tableau. Lire rend l'état ACTUEL, corrections de l'utilisateur
//     comprises (résultat masqué par le serveur comme tout résultat d'outil) ; modifier remplace l'élément sous ses yeux, rien ne part ni
//     ne s'enregistre (« Envoyer », « Word », « Ranger » restent à l'utilisateur) : pas de carte d'autorisation.
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

function lireArtefactAgent(a) {
  if (a.type === 'email') {
    if (!redaction) return { erreur: 'le brouillon d’email a été fermé ou envoyé' };
    return { ...resumeArtefactAgent(a), destinataire: redaction.a || '', cc: redaction.cc || '', objet: redaction.sujet || '',
      texte: String(redaction.texte || texteDeHtmlRedaction(redaction.html) || '').slice(0, MAX_TEXTE_ARTEFACT_AGENT),
      pieces_jointes: (redaction.pieces || []).length };
  }
  if (a.type === 'courrier') return { ...resumeArtefactAgent(a), texte: texteCourrierArtefact(a.doc).slice(0, MAX_TEXTE_ARTEFACT_AGENT) };
  if (a.type === 'document') return { ...resumeArtefactAgent(a), texte: String(a.contenu || '').slice(0, MAX_TEXTE_ARTEFACT_AGENT) };
  if (a.type === 'tableau') {
    return { ...resumeArtefactAgent(a), colonnes: a.colonnes, lignes: a.lignes.slice(0, 200).map(l => l.map(v => (v == null ? '' : String(v)))),
      ...(a.lignes.length > 200 ? { lignes_en_tout: a.lignes.length, note: 'seules les 200 premières lignes sont rendues : ne réécris pas un tableau plus long' } : {}) };
  }
  return { ...resumeArtefactAgent(a), note: 'un outil ouvert se remplit par outil_champs, pas ici' };
}

function modifierArtefactAgent(a, e) {
  const texte = typeof e.texte === 'string' ? e.texte.replace(/\r/g, '') : '';
  if (a.type === 'email') {
    const r = redaction;
    if (!r) return { erreur: 'le brouillon d’email a été fermé ou envoyé : prépare-le de nouveau' };
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
    a.doc = documentCourrierDepuisTexteAgent(texte, '');
  } else if (a.type === 'document') {
    if (!texte.trim()) return { erreur: 'texte vide : donne le document entier' };
    a.contenu = texte.slice(0, 60000);
  } else if (a.type === 'tableau') {
    if (a.lignes.length > 200) return { erreur: 'tableau trop long pour être réécrit ici : refais le calcul (calcul) avec la correction' };
    const colonnes = Array.isArray(e.colonnes) ? e.colonnes.map(c => String(c == null ? '' : c).slice(0, 200)).slice(0, 60) : [];
    const lignes = Array.isArray(e.lignes) ? e.lignes.filter(Array.isArray).slice(0, 2000).map(l => l.slice(0, 60).map(v => String(v == null ? '' : v).slice(0, 2000))) : [];
    if (!colonnes.length) return { erreur: 'colonnes vides : donne les en-têtes et les lignes entières' };
    a.colonnes = colonnes;
    a.lignes = lignes;
  } else return { erreur: 'cet élément ne se modifie pas ici (un outil se remplit par outil_champs)' };
  artefactsAssistant.courant = a.id;
  artefactsAssistant.version++;
  renderArtefactAssistant();
  return { fait: true, affiche_a_l_utilisateur: `« ${a.titre} » corrigé dans le panneau de droite ; rien n’est envoyé ni enregistré` };
}

async function artefactAgent(e) {
  const mode = e && e.mode;
  if (POSTE_CLAIRE) return { erreur: 'pas de panneau sur l’ordinateur de CLAIRE' };
  if (mode === 'lister') {
    const liste = artefactsAssistant.liste.filter(a => a.type !== 'email' || redaction).map(resumeArtefactAgent);
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
