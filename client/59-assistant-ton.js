// « Demander à CLAIRE » : le ton (étude 11/10 : « des réponses plus humaines, comme avec un assistant / collaborateur avec qui
// j'échange tous les jours » ; vouvoiement, attentionné). Les FAITS restent calculés par le code (client/49-assistant.js) : ici on
// ne fait que les enrober — salutation par prénom et selon l'heure, une phrase d'introduction qui varie, une suite utile quand le
// dossier le justifie (une pièce manque, un prêt n'est pas reçu), des messages d'attente et d'erreur plus doux. Tout est pur : la
// variation suit le rang du message dans la conversation (jamais le hasard), donc les tests rejouent exactement la même phrase.
// Seul l'échange libre est rédigé par l'IA (POST /api/assistant/converser, noms masqués, aucune donnée de dossier).

// Pure : « matin », « apres-midi » ou « soir » d'après l'heure locale. @param {Date} date
function momentJourneeAssistant(date) {
  const h = date && typeof date.getHours === 'function' && !Number.isNaN(date.getTime()) ? date.getHours() : 9;
  return h >= 18 || h < 4 ? 'soir' : h >= 12 ? 'apres-midi' : 'matin';
}

// Pure : choisit dans une liste selon le rang (variation sans hasard). @param {string[]} liste @param {number} rang
function varianteAssistant(liste, rang) {
  return liste[Math.abs(Number(rang) || 0) % liste.length];
}

// Pure : « Bonjour Bastien », « Bonsoir Julie ». Sans prénom : « Bonjour ». @param {string} prenom @param {Date} date
function salutationAssistant(prenom, date) {
  const mot = momentJourneeAssistant(date) === 'soir' ? 'Bonsoir' : 'Bonjour';
  return prenom ? `${mot} ${prenom}` : mot;
}

// Pure : la réponse d'une formule de politesse (bonjour, merci, au revoir, ça va). `texte` : la phrase du collaborateur.
// @param {string} texte @param {string} prenom @param {Date} date @param {number} rang
function reponseSalutationAssistant(texte, prenom, date, rang) {
  const t = normaliserDemande(texte);
  const nom = prenom ? ` ${prenom}` : '';
  if (/\b(merci|bravo|genial|super|parfait|top)\b/.test(t)) {
    return varianteAssistant(['Avec plaisir.', 'Je vous en prie, c’est normal.', 'Avec plaisir' + nom + ', n’hésitez pas si vous avez besoin d’autre chose.', 'De rien, c’est fait pour ça.'], rang);
  }
  if (/\b(au revoir|a bientot|a demain|a plus tard|bonne (journee|soiree|continuation))\b/.test(t)) {
    const fin = momentJourneeAssistant(date) === 'soir' ? 'Bonne soirée' : 'Bonne continuation';
    return varianteAssistant([`${fin}${nom} !`, `À bientôt${nom}, je reste là si besoin.`, `${fin}${nom}, à très vite.`], rang);
  }
  if (/\b(ca va|vas[- ]tu|allez[- ]vous)\b/.test(t)) {
    return varianteAssistant(['Très bien, merci de demander. Et vous ? Je suis à votre disposition.', 'Ça va très bien, merci. Que puis-je faire pour vous ?'], rang);
  }
  return `${salutationAssistant(prenom, date)} !`;
}

// Pure : la phrase d'introduction d'une réponse de lecture, ou '' (un geste qui écrit parle déjà de lui-même).
// @param {string} cle clé d'intention @param {string} prenom @param {number} rang
function introLectureAssistant(cle, prenom, rang) {
  const nom = prenom ? `, ${prenom}` : '';
  const phrases = {
    etat_dossier: ['Voici où nous en sommes.', 'Je viens de regarder ce dossier, voici le point.', 'Je fais le point pour vous.'],
    pieces_manquantes: ['Voyons ce qu’il manque.', 'J’ai passé les pièces en revue.', 'Voici ce qu’on attend encore.'],
    echeances_dossier: ['Voici le calendrier.', 'Regardons les échéances ensemble.', 'J’ai relu les dates de ce dossier.'],
    coordonnees: ['Voici les coordonnées que j’ai.', 'Je les ai retrouvées.', 'Les voici.'],
    fonds_dossier: ['Je regarde où en sont les fonds.', 'Voici la situation des fonds.', 'J’ai vérifié les reçus.'],
    taches_jour: [`Voici votre journée${nom}.`, `Voilà ce qui vous attend aujourd’hui${nom}.`, `J’ai préparé votre liste${nom}.`],
    depuis_hier: ['Voici ce qui est arrivé depuis hier soir.', 'Du nouveau depuis hier 18 h :', 'J’ai regardé ce qui a bougé.'],
    rappel_lister: [`Voici vos rappels${nom}.`, 'Je vous rappelle ce qui est noté.', 'Voilà ce que j’ai noté pour vous.'],
    agenda_jour: ['Voici l’agenda.', 'Je consulte l’agenda de l’office.', 'Voilà ce qui est prévu.'],
    creneaux_signature: ['J’ai cherché des créneaux.', 'Voici ce que je peux vous proposer.', 'Regardons les dates possibles.']
  };
  return phrases[cle] ? varianteAssistant(phrases[cle], rang) : '';
}

// Pure : de quoi proposer une suite quand le dossier le justifie. `faits` : { nom (nom court du dossier), manque (nombre d'éléments
// attendus), pretAttendu (offre de prêt pas reçue), retard ({ label, jours } si la prochaine échéance est dépassée), fondsReste }.
// Rend { texte, boutons: [{ libelle, phrase }] } ou null. La phrase d'un bouton repart dans la conversation comme si elle était tapée.
// @param {string} cle @param {{ nom?: string, manque?: number, pretAttendu?: boolean, retard?: { label: string, jours: number } | null, fondsReste?: number, nbTaches?: number }} faits
function suiteLectureAssistant(cle, faits) {
  const f = faits || {};
  const nom = f.nom || '';
  if (cle === 'etat_dossier' && nom) {
    const boutons = [];
    let texte = '';
    if (f.retard) texte = `Attention : « ${f.retard.label} » est dépassée de ${f.retard.jours} jour${f.retard.jours > 1 ? 's' : ''}.`;
    else if (f.manque) texte = `Il reste ${f.manque} élément${f.manque > 1 ? 's' : ''} à recevoir.`;
    if (f.manque) boutons.push({ libelle: 'Quelles pièces manquent ?', phrase: `Quelles pièces manquent pour ${nom} ?` });
    if (f.pretAttendu) {
      texte = (texte ? texte + ' ' : '') + 'L’offre de prêt n’est pas encore là.';
      boutons.push({ libelle: 'Relancer pour l’offre de prêt', phrase: `Relance ${nom} pour son offre de prêt` });
    }
    if (texte || boutons.length) return { texte: texte ? texte + ' Souhaitez-vous que je m’en occupe ?' : '', boutons };
  }
  if (cle === 'fonds_dossier' && nom && f.fondsReste > 0) {
    return { texte: 'Il manque encore des fonds. Je peux préparer la relance.', boutons: [{ libelle: 'Relancer pour les fonds', phrase: `Relance ${nom} pour les fonds` }] };
  }
  if (cle === 'taches_jour' && f.nbTaches > 0) {
    return { texte: 'Dites-moi par où commencer, je peux préparer l’email ou le geste correspondant.', boutons: [] };
  }
  return null;
}

// Pure : l'accueil de la page (« Bonjour Bastien, que puis-je faire pour vous ? »). @param {string} prenom @param {Date} date
function accueilAssistant(prenom, date) {
  return `${salutationAssistant(prenom, date)}, que puis-je faire pour vous ?`;
}

// Pure : paragraphes HTML d'un texte libre rendu par l'IA (retours à la ligne doubles = paragraphes), tout échappé. @param {string} texte
function htmlTexteLibreAssistant(texte) {
  return String(texte || '').split(/\n{2,}|\n/).map(l => l.trim()).filter(Boolean).map(l => `<p>${escapeHtml(l)}</p>`).join('');
}

// Les faits d'un dossier utiles aux suites, calculés avec les fonctions de CLAIRE (jamais écrits ici). Aucune suite pour un dossier
// archivé, déjà signé, en participation (l'étude n'y relance pas le prêt) ou une succession. `nom` : le nom complet du dossier (sans
// « VTE - »), pour que la phrase d'un bouton désigne CE dossier même si un autre porte le même premier nom de famille. @param {any} d
function faitsDossierAssistant(d) {
  if (!d) return {};
  const nom = String(d.nom || '').replace(/\b(VTE|SUCC|VENTE|SUCCESSION)\b/gi, '').replace(/\s*\/\s*/g, ' / ').replace(/^[\s–-]+|[\s–-]+$/g, '');
  if (d.archive || estSuccession(d) || d.roleNotaire === 'participant' || signatureFaiteSuivi(d)) return { nom: '' };
  const prochaine = prochaineEcheanceDetail(d);
  const bilan = d.fondsRecus && typeof d.fondsRecus === 'object' ? bilanFondsDossier(d) : null;
  return {
    nom, manque: piecesAttenduesDossier(d).length,
    pretAttendu: !d.sansPret && !echeanceValidee(d, 'pret') && d.offrePretStatut !== 'recue' && d.offrePretStatut !== 'aconfirmer',
    retard: prochaine && prochaine.jours < 0 ? { label: prochaine.label, jours: -prochaine.jours } : null,
    fondsReste: bilan && bilan.etat === 'partiel' ? bilan.reste : 0
  };
}

// Le prénom du collaborateur de ce poste (« Bastien »), '' s'il n'est pas choisi. @returns {string}
function prenomPosteAssistant() {
  return typeof utilisateurPoste === 'string' ? prenomCollaborateur(utilisateurPoste) : '';
}

// Les faits qu'une suite peut citer : ceux du dossier, ou le nombre de tâches du jour pour « Ce que j'ai à faire ».
function faitsAssistant(cle, d) {
  if (d) return faitsDossierAssistant(d);
  if (cle === 'taches_jour') {
    try { return { nbTaches: actionsDuJour(dossiersPerimetreDashboard(), isoAujourdhuiLocal()).actions.length }; } catch (e) { return {}; }
  }
  return {};
}

// Le point de la journée dit à la première salutation (« Vous avez 3 choses à faire aujourd'hui, à commencer par… »), ou ''. @returns {string}
function pointJourneeAssistant() {
  try {
    const auj = isoAujourdhuiLocal();
    const { actions } = actionsDuJour(dossiersPerimetreDashboard(), auj);
    const { aFaire } = rappelsDuJour(rappelsPerso, auj);
    const n = actions.length + aFaire.length;
    if (!n) return 'Rien d’urgent de votre côté pour l’instant.';
    const premiere = actions[0] ? ` à commencer par « ${actions[0].titre} » (${libelleDossierAffiche(actions[0].dossier)})` : '';
    return `Vous avez ${n} chose${n > 1 ? 's' : ''} à faire aujourd’hui,${premiere || ' voici de quoi vous y retrouver'}.`;
  } catch (e) { return ''; }
}
