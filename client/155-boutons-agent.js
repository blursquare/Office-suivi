// CLAIRE appuie sur les boutons de CLAIRE (étude 31/10 : « il faut autoriser CLAIRE à appuyer sur tous les boutons de CLAIRE — calculer,
// lire le zonage, demander le plan cadastral… comme si c'était moi, sauf qu'elle le fait à ma place — mais jamais valider un téléchargement,
// couper un service dans les réglages, enregistrer un mot de passe ou envoyer quelque chose à un client ou à un service »).
// Outil `outil_boutons` de l'agent : « lister » les boutons visibles d'un outil, de la fiche ou de l'écran affiché, puis « cliquer » l'un d'eux,
// exactement comme la souris. Chaque bouton est classé par son libellé et sa place (`classementBoutonAgent`) :
//   - jamais : télécharger, envoyer, imprimer, exporter, ouvrir dans Outlook, signer, Yousign, Teams, mot de passe, tout bouton des Réglages ;
//   - après la carte « Autoriser » : ce qui écrit (enregistrer, valider, cocher, ajouter, placer…), carte stricte pour ce qui retire ou supprime ;
//   - sans carte : tout le reste (calculer, lire, tirer le plan, suivant, voir, ouvrir…), comme un clic de l'utilisateur.
// Le poste de CLAIRE (client/128) garde en plus le refus du serveur sur les envois et les réglages (routeInterditePosteClaire).

var RE_BOUTON_JAMAIS = /t[ée]l[ée]charg|download|envoy|envoi|\bsend\b|e-?mail|courriel|outlook|imprim|export|\bpdf\b|\bword\b|\bexcel\b|docx|xlsx|\bcsv\b|yousign|\bsigner\b|teams|mot de passe|identifiant|d[ée]connect|mise [àa] jour|restaur|sauvegard|partager/i;
var RE_BOUTON_STRICT = /supprim|effac|retir|archiv|vider|r[ée]initialis|d[ée]tach|oubli|annuler le|remettre/i;
var RE_BOUTON_CARTE = /^\s*\+|[ée]cart|coller|laisser|r[ée]tabl|aucune inscription|enregistr|valid|confirm|coch|ajout|cr[ée]er|plac|appliqu|mettre [àa] jour|compl[ée]t|reprendre|marqu|d[ée]plac|renomm|d[ée]j[àa] fait|pas de pr[êe]t|ranger|autoris|refus|accept|ignorer|choisir|rattach|relier/i;
var MAX_BOUTONS_LUS_AGENT = 80;
var compteurBoutonsAgent = 0;

// Pure : le libellé lisible d'un bouton (texte, sinon aria-label ou title).
function libelleBoutonAgent(texte, aria, titre) {
  return String(texte || aria || titre || '').replace(/\s+/g, ' ').trim().slice(0, 80);
}

// Audit 0.415.0 : le libellé ne suffit pas (« Ouvrir le brouillon » envoie au niveau 2, « Excel » télécharge, une pièce jointe s'appelle par
// son nom de fichier) — la FONCTION appelée au clic est lue aussi. Jamais : décider une proposition (y compris ses propres « Demande de
// CLAIRE »), télécharger, imprimer, envoyer, ouvrir un fichier ou un document ; carte : ce qui ajoute, colle, écarte, réagit, déplace.
var RE_FONCTION_JAMAIS = /(autoriser|refuser|decider)Proposition|telecharg|imprim|envoy|exporter|ouvrir(PieceJointe|Fichier|Document|PlanAerien|Eml|Outlook)|livrer(Eml|Email)|genererConstitution|copierPresse|navigator\.clipboard|window\.open|location\.href/i;
var RE_FONCTION_CARTE = /coller|ecart|retablir|ajouter|reagir|deplacer|renommer|ranger|laisser|archiver|cocher|marquer|placer|valider|enregistrer|sauvegarder|changer|repondre|basculer(Engagement|Echeance)|supprimer|retirer/i;

// Pure : 'jamais' | 'strict' | 'carte' | 'libre' — d'après le libellé, le titre, la place du bouton et la fonction appelée au clic.
function classementBoutonAgent(libelle, titre, place, fonction) {
  const t = `${libelle || ''} ${titre || ''}`;
  const f = String(fonction || '');
  if (place === 'reglages' || place === 'telechargement' || place === 'proposition') return 'jamais';
  if (RE_FONCTION_JAMAIS.test(f)) return 'jamais';
  if (RE_BOUTON_JAMAIS.test(t)) return 'jamais';
  if (RE_BOUTON_STRICT.test(t)) return 'strict';
  if (RE_BOUTON_CARTE.test(t) || RE_FONCTION_CARTE.test(f)) return 'carte';
  return 'libre';
}

var RAISONS_BOUTON_AGENT = { jamais: 'jamais : téléchargement, envoi, réglage ou mot de passe — c’est à l’utilisateur', strict: 'après la carte « Autoriser » (à chaque fois)', carte: 'après la carte « Autoriser »', libre: 'permis' };

// La zone où chercher : un outil (même monté dans le panneau de la conversation), la fiche ouverte, ou l'écran affiché.
function zoneBoutonsAgent(cible) {
  if (cible === 'fiche') return document.getElementById('dossier-drawer');
  if (cible === 'ecran') return typeof ongletActuel !== 'undefined' ? document.getElementById('onglet-' + ongletActuel) : null;
  return typeof noeudOutilAgent === 'function' ? noeudOutilAgent(cible) : null;
}

function placeBoutonAgent(el) {
  if (el.closest && el.closest('#onglet-reglages, .reglages-corps')) return 'reglages';
  if (el.closest && el.closest('[class*="proposition"], .pc-actions, .canal-carte-routine, .rt-carte')) return 'proposition';
  const tag = String(el.tagName || '').toLowerCase();
  if (tag === 'a' && (el.hasAttribute('download') || /^blob:|\.(pdf|docx?|xlsx?|csv|eml|zip)(\?|$)/i.test(el.getAttribute('href') || ''))) return 'telechargement';
  return '';
}

function boutonsVisiblesAgent(zone) {
  return Array.from(zone.querySelectorAll('wa-button, button, a[onclick], [role="button"]'))
    .filter(el => !(el.matches && el.matches('.info-i, .avec-bulle')))   // les pastilles « i » ne sont pas des boutons
    .filter(el => !el.disabled && !el.hasAttribute('disabled') && el.offsetParent !== null && !(el.closest && el.closest('wa-button') !== el && el.closest('wa-button')))
    .filter(el => libelleBoutonAgent(el.textContent, el.getAttribute('aria-label'), el.getAttribute('title')));
}

async function boutonsAgent(entree) {
  const e = entree || {};
  const zone = zoneBoutonsAgent(String(e.cible || ''));
  if (!zone) return { erreur: 'cible inconnue ou pas ouverte : un outil (outil_claire, mode ouvrir), « fiche » (fiche ouverte) ou « ecran » (l’écran affiché)' };
  const boutons = boutonsVisiblesAgent(zone);
  if (!boutons.length) return { erreur: 'aucun bouton visible ici : ouvre d’abord l’outil, la fiche ou l’écran' };
  if (e.mode === 'lister') {
    return { nombre: boutons.length, boutons: boutons.slice(0, MAX_BOUTONS_LUS_AGENT).map(el => {
      if (!el.dataset.agentBouton) el.dataset.agentBouton = 'b' + (++compteurBoutonsAgent);
      const libelle = libelleBoutonAgent(el.textContent, el.getAttribute('aria-label'), el.getAttribute('title'));
      const c = classementBoutonAgent(libelle, el.getAttribute('title'), placeBoutonAgent(el), el.getAttribute('onclick'));
      return { id: el.dataset.agentBouton, libelle, clic: RAISONS_BOUTON_AGENT[c] };
    }), ...(boutons.length > MAX_BOUTONS_LUS_AGENT ? { coupe: 'seuls les premiers boutons sont listés' } : {}) };
  }
  if (e.mode !== 'cliquer') return { erreur: 'mode : lister ou cliquer' };
  const el = boutons.find(b => b.dataset.agentBouton === String(e.bouton || ''));
  if (!el) return { erreur: 'bouton introuvable ou plus visible : liste d’abord les boutons (mode lister), n’invente jamais un id' };
  const libelle = libelleBoutonAgent(el.textContent, el.getAttribute('aria-label'), el.getAttribute('title'));
  const c = classementBoutonAgent(libelle, el.getAttribute('title'), placeBoutonAgent(el), el.getAttribute('onclick'));
  if (c === 'jamais') return { refuse: true, message: `« ${libelle} » : ${RAISONS_BOUTON_AGENT.jamais}. Dis à l’utilisateur de cliquer lui-même.` };
  if (c !== 'libre') {
    const ok = await demanderAutorisationAgent(`Cliquer « ${libelle} »${e.pourquoi ? ` — ${String(e.pourquoi).slice(0, 160)}` : ''}.`, { strict: c === 'strict' });
    if (!ok) return { refuse: true, message: 'refusé par l’utilisateur : rien n’est cliqué' };
  }
  el.click();
  await new Promise(ok => setTimeout(ok, 400));   // le temps que l'écran se redessine
  return { clique: libelle, suite: 'relis l’écran (outil_boutons lister, outil_champs lister) pour voir le résultat ; une lecture qui prend du temps (zonage, plan) se relit un peu plus tard' };
}
