// CLAIRE répond d'elle-même à une question restée sans réponse dans le canal d'un dossier (étape 4 du vrai agent, étude 30/10 : « 15 min »).
// Une question (« ? ») posée par un collaborateur dans le canal d'un DOSSIER, sans réponse d'un collègue ni de CLAIRE depuis 15 minutes, en
// heures de bureau : CLAIRE y répond dans le fil, par le chemin habituel (agent, outils, cartes « Autoriser »). Seul le poste de celui qui a
// posé la question la lance (jamais deux réponses), quand le canal est ouvert et que CLAIRE ne travaille pas déjà ; une question adressée à un
// collègue (@julie) ou à CLAIRE (@CLAIRE, déjà traitée) n'est pas concernée ; au-delà de deux heures, on laisse.

var QUESTION_SANS_REPONSE_MS = 15 * 60 * 1000;
var QUESTION_SANS_REPONSE_MAX_MS = 2 * 60 * 60 * 1000;
var CLE_QUESTIONS_RELANCEES = 'claire-questions-relancees';

// Pure : en heures de bureau (lundi → vendredi, 8 h → 19 h, hors jour férié) ? @param {Date} date
function heuresBureauRelanceClaire(date) {
  const j = date.getDay();
  if (j === 0 || j === 6) return false;
  const h = date.getHours();
  if (h < 8 || h >= 19) return false;
  const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return !(typeof estJourFerie === 'function' && estJourFerie(iso));
}

// Pure : les questions de `auteur` dans le canal `canalId` (« d:… ») restées sans réponse depuis 15 minutes (et moins de deux heures), de la
// plus ancienne à la plus récente. Est une réponse : tout message d'un autre (collègue ou CLAIRE) écrit après la question, dans le canal ou
// dans son fil. `dejaFaites` : identifiants déjà relancés.
function questionsSansReponseCanal(messages, auteur, canalId, maintenant, collaborateurs, dejaFaites) {
  if (!/^d:/.test(String(canalId || '')) || !auteur) return [];
  const liste = Array.isArray(messages) ? messages.filter(m => m && m.id) : [];
  const prenoms = (collaborateurs || []).map(c => platCanal(String(c && (c.prenom || c.nom || c) || '').split(/\s+/)[0])).filter(Boolean);
  const faites = new Set(dejaFaites || []);
  return liste.filter(m => {
    if (m.parent || m.role === 'claire' || m.claireMessage || m.auteur !== auteur || faites.has(m.id)) return false;
    const age = maintenant - Number(m.quand || 0);
    if (!(age >= QUESTION_SANS_REPONSE_MS && age <= QUESTION_SANS_REPONSE_MAX_MS)) return false;
    const t = platCanal(m.texte || texteDepuisHtmlCanal(m.html));
    if (!t.includes('?')) return false;
    if (/(^|[^a-z0-9])@claire(?![a-z0-9])/.test(t)) return false;
    if (prenoms.some(p => new RegExp('(^|[^a-z0-9])@' + p + '(?![a-z0-9])').test(t))) return false;
    return !liste.some(x => x !== m && Number(x.quand || 0) > Number(m.quand || 0) && (x.role === 'claire' || x.claireMessage || x.auteur !== auteur) && (!x.parent || x.parent === m.id));
  }).sort((a, b) => a.quand - b.quand);
}

function questionsRelanceesClaire() {
  try { const v = JSON.parse(localStorage.getItem(CLE_QUESTIONS_RELANCEES) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
}

// Les canaux où j'ai posé une question sans appeler CLAIRE (noté par client/49) : le tour y répond quand le canal est ouvert.
var CLE_QUESTIONS_A_RELANCER = 'claire-questions-a-relancer';
var MAX_RELANCES_JOUR_CLAIRE = 10;   // plafond par poste et par jour (audit 0.404.0, M5 : l'agent part sans geste humain)

function lireListeLocale(cle) { try { const v = JSON.parse(localStorage.getItem(cle) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } }

function noterQuestionCanalPourRelance(canalId, texte) {
  if (!/^d:/.test(String(canalId || '')) || !String(texte || '').includes('?')) return;
  const liste = lireListeLocale(CLE_QUESTIONS_A_RELANCER).filter(x => x && x.canal !== canalId);
  ecrireLocal(CLE_QUESTIONS_A_RELANCER, JSON.stringify(liste.concat({ canal: canalId, quand: Date.now() }).slice(-20)));
}

// Pure : les canaux à regarder maintenant (question de 15 min à 2 h) et la liste à garder (les plus récentes que 2 h).
function canauxARelancer(liste, maintenant) {
  const gardes = (liste || []).filter(x => x && x.canal && maintenant - Number(x.quand || 0) <= QUESTION_SANS_REPONSE_MAX_MS);
  return { dus: gardes.filter(x => maintenant - x.quand >= QUESTION_SANS_REPONSE_MS).map(x => x.canal), gardes };
}

function relancesDuJourClaire() {
  const jour = isoAujourdhuiLocal();
  const v = lireListeLocale('claire-relances-jour').filter(x => x === jour);
  return { jour, n: v.length };
}

// Répond aux questions du canal OUVERT (assistantMessages = ses messages). Rend vrai si CLAIRE a répondu.
async function repondreQuestionsCanalOuvert() {
  const faites = questionsRelanceesClaire();
  // Plusieurs questions d'affilée : une seule réponse de CLAIRE, dans le fil de la première, qui les reprend (3 au plus).
  const questions = questionsSansReponseCanal(assistantMessages, utilisateurPoste, canaux.actif, Date.now(), canaux.collaborateurs, faites).slice(0, 3);
  const q = questions[0];
  if (!q) return false;
  ecrireLocal(CLE_QUESTIONS_RELANCEES, JSON.stringify(faites.concat(questions.map(x => x.id)).slice(-200)));
  const { jour } = relancesDuJourClaire();
  ecrireLocal('claire-relances-jour', JSON.stringify(lireListeLocale('claire-relances-jour').filter(x => x === jour).concat(jour)));
  const question = questions.map(x => String(x.texte || texteDepuisHtmlCanal(x.html)).replace(/\s+/g, ' ').trim().slice(0, 600)).join(' » puis « ');
  const avant = assistantMessages.filter(m => m.role === 'claire').length;
  canaux.questionSansRelance = true;
  canaux.dernierMessageMoi = q;   // 👀 puis ✅ de CLAIRE sur la question elle-même
  try {
    // Le fil ne s'ouvre à l'écran que si personne n'écrit dans un autre fil (audit 0.404.0, B5).
    if (!canaux.fil || !(document.getElementById('fil-saisie') || {}).value) ouvrirFilCanal(q.id);
    await envoyerDansFilCanal(`Personne n’a encore répondu à cette question, posée il y a ${Math.round((Date.now() - q.quand) / 60000)} minutes dans le canal du dossier : « ${question} ». Réponds-y dans ce fil si tu le peux, en LECTURE seulement (lis le dossier et ce qu’il faut) : aucune action, aucune carte « Autoriser » — propose-la en une phrase si elle serait utile ; sinon, dis en une phrase ce qui te manque.`, q.id);
    if (assistantMessages.filter(m => m.role === 'claire').length > avant) noterVerificationPoste('claire-question-sans-reponse', { detail: 'réponse à une question restée sans réponse' });
  } finally { canaux.questionSansRelance = false; }
  return true;
}

// Un tour (chaque minute) : seulement dans le canal OUVERT sur la page Discussions, saisie vide. Une ouverture du canal en arrière-plan,
// quand on est parti ailleurs, a été écartée (relecture 0.404.0 : une carte « Autoriser » invisible bloquait CLAIRE, la vue et le brouillon
// d'avant se perdaient, le canal passait « lu ») — la question est reprise quand on revient dans le canal, dans les deux heures.
async function tourRelanceQuestionsClaire() {
  if (POSTE_CLAIRE || !assistantDisponibilite.agent || assistantEnCours || assistantTraitementEnCours) return;
  if (!heuresBureauRelanceClaire(new Date()) || relancesDuJourClaire().n >= MAX_RELANCES_JOUR_CLAIRE) return;
  const { dus, gardes } = canauxARelancer(lireListeLocale(CLE_QUESTIONS_A_RELANCER), Date.now());
  ecrireLocal(CLE_QUESTIONS_A_RELANCER, JSON.stringify(gardes));
  if (!dus.includes(canaux.actif) || !ecranAffiche('assistant')) return;
  const champ = document.getElementById('assistant-saisie');
  if (champ && champ.value.trim()) return;
  await repondreQuestionsCanalOuvert();
  ecrireLocal(CLE_QUESTIONS_A_RELANCER, JSON.stringify(lireListeLocale(CLE_QUESTIONS_A_RELANCER).filter(x => x.canal !== canaux.actif)));
}

function demarrerRelanceQuestionsClaire() {
  setInterval(() => { tourRelanceQuestionsClaire().catch(e => console.warn('Question sans réponse :', e && e.message)); }, 60 * 1000);
}
