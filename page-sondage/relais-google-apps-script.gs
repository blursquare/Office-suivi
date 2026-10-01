/**
 * Relais des réponses aux rendez-vous de signature — CLAIRE, Office notarial de la Salamandre.
 *
 * La page de réponse (https://blursquare.github.io/Claire-rdv/) envoie ici la réponse du client ; ce
 * script la transmet par email à la boîte de l'office que CLAIRE relit (objet « [CLAIRE-…] »). Le
 * client n'a ainsi qu'un clic à faire.
 *
 * Garde-fous :
 *  - le destinataire est FIXÉ ci-dessous : la page ne peut pas choisir à qui écrire (pas de relais
 *    ouvert) ;
 *  - seul un objet de la forme « [CLAIRE-CODE-P13S2-Q7AB] … » est accepté (code du sondage et code
 *    personnel du destinataire, que CLAIRE vérifie à la réception) ;
 *  - 200 envois par heure au plus, textes tronqués ;
 *  - rien n'est conservé par le script (ni feuille, ni journal).
 *
 * Installation (une fois, connecté au compte Gmail de l'étude) : voir LISEZMOI.md.
 */
var DESTINATAIRE = 'adresse-de-la-boite-relue-par-claire@exemple.fr'; // à remplacer
var MAX_PAR_HEURE = 200;
var RE_OBJET = /^\[CLAIRE-[A-HJ-NP-Z2-9]{6}-P(?:\d{1,5}(?:S\d{1,5})?|S\d{1,5})-[A-HJ-NP-Z2-9]{4}\] [^\r\n]{0,250}$/;

function doPost(e) {
  var resultat = { ok: false };
  try {
    var d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var objet = String(d.sujet || '');
    if (!RE_OBJET.test(objet)) throw new Error('Réponse non reconnue.');
    var corps = String(d.corps || '').slice(0, 3000);
    var cache = CacheService.getScriptCache();
    var n = Number(cache.get('envois') || 0);
    if (n >= MAX_PAR_HEURE) throw new Error('Trop de réponses pour le moment : réessayez plus tard.');
    cache.put('envois', String(n + 1), 3600);
    MailApp.sendEmail({ to: DESTINATAIRE, subject: objet, body: corps, name: 'Réponses rendez-vous de signature' });
    resultat.ok = true;
  } catch (err) {
    resultat.erreur = String((err && err.message) || err);
  }
  return ContentService.createTextOutput(JSON.stringify(resultat)).setMimeType(ContentService.MimeType.JSON);
}

// Une visite directe de l'adresse du script : simple vérification qu'il est en ligne.
function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, relais: 'CLAIRE' })).setMimeType(ContentService.MimeType.JSON);
}
