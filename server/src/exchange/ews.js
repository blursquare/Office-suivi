// Test de connexion à l'Exchange de l'office (hébergé chez Fichorga / Authentic Connect) par EWS,
// la même porte qu'Outlook — voir CLAUDE.md, section « Connexion Exchange (test) ». Microsoft Graph
// n'atteint pas ces boîtes (hébergées hors de Microsoft 365), d'où ce chemin.
//
// L'authentification Windows (NTLMv2) est déléguée à la bibliothèque httpntlm : on ne fait ici
// qu'une requête HTTP applicative, on ne construit aucun message d'authentification à la main.
//
// RÈGLES à ne pas assouplir :
//   - le mot de passe n'est ni journalisé, ni recopié dans un message d'erreur ou un diagnostic ;
//   - une seule tentative par appel : aucun réessai automatique (plusieurs échecs verrouillent le
//     compte de messagerie, exactement comme Outlook).
'use strict';

const httpntlm = require('httpntlm');

// Requête EWS en LECTURE SEULE : lire la fiche du dossier « Calendrier ». Prouve à la fois que
// l'authentification passe ET que le compte a bien accès à un agenda, sans rien créer ni modifier.
function corpsGetFolderCalendrier() {
  return '<?xml version="1.0" encoding="utf-8"?>'
    + '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"'
    + ' xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types"'
    + ' xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages">'
    + '<soap:Header><t:RequestServerVersion Version="Exchange2013"/></soap:Header>'
    + '<soap:Body><m:GetFolder>'
    + '<m:FolderShape><t:BaseShape>Default</t:BaseShape></m:FolderShape>'
    + '<m:FolderIds><t:DistinguishedFolderId Id="calendar"/></m:FolderIds>'
    + '</m:GetFolder></soap:Body></soap:Envelope>';
}

// Interprète la réponse d'Exchange. Fonction PURE (statut HTTP + corps), testable sans réseau ni
// serveur réel — voir server/test/ews.test.js. Ne reçoit jamais le mot de passe.
function interpreterReponseEws(statutHttp, corps) {
  const texte = String(corps || '');
  if (statutHttp === 401 || statutHttp === 403) {
    return {
      ok: false,
      raison: 'auth',
      message: "Identifiants refusés par le serveur. Vérifiez l'adresse email et le mot de passe de messagerie."
        + ' Si vous êtes certain des identifiants, le serveur exige peut-être une protection de connexion'
        + ' que ce test ne gère pas encore (à signaler).'
    };
  }
  if (statutHttp >= 500 && !/ResponseCode|ResponseClass/.test(texte)) {
    return { ok: false, raison: 'serveur', message: 'Le serveur Exchange a renvoyé une erreur (' + statutHttp + ').' };
  }
  if (/ResponseClass="Success"/.test(texte) || /<m:ResponseCode>NoError<\/m:ResponseCode>/.test(texte)) {
    const nom = (texte.match(/<t:DisplayName>([^<]*)<\/t:DisplayName>/) || [])[1] || '';
    return { ok: true, message: 'Connexion réussie' + (nom ? ' — agenda « ' + nom + ' » accessible.' : ', agenda accessible.') };
  }
  // 200 mais échec applicatif (SOAP Fault, ResponseClass="Error") : on remonte le code EWS s'il y est.
  const code = (texte.match(/<m:ResponseCode>([^<]+)<\/m:ResponseCode>/) || [])[1]
    || (texte.match(/<faultstring[^>]*>([^<]+)<\/faultstring>/) || [])[1] || '';
  return {
    ok: false,
    raison: 'ews',
    message: 'Connexion établie mais la lecture de l\'agenda a échoué' + (code ? ' (' + code + ')' : '') + '.'
  };
}

// Un seul essai, avec un délai maximal. `url` doit pointer vers .../EWS/Exchange.asmx.
// `injections` : uniquement pour les tests (faux transport). Jamais utilisé en production.
function testerConnexionExchange({ url, email, motDePasse, delaiMs = 20000 }, injections = {}) {
  const poster = injections.poster || httpntlm.post;
  return new Promise((resolve) => {
    let repondu = false;
    const fini = (r) => { if (!repondu) { repondu = true; resolve(r); } };
    const minuteur = setTimeout(
      () => fini({ ok: false, raison: 'reseau', message: 'Le serveur Exchange n\'a pas répondu à temps.' }),
      delaiMs
    );
    try {
      poster({
        url,
        username: String(email || ''),
        password: String(motDePasse || ''),
        domain: '',
        headers: { 'Content-Type': 'text/xml; charset=utf-8' },
        body: corpsGetFolderCalendrier()
      }, (err, res) => {
        clearTimeout(minuteur);
        if (err) {
          // Message d'erreur réseau seulement (code/host), jamais les identifiants.
          fini({ ok: false, raison: 'reseau', message: 'Impossible de joindre le serveur Exchange : ' + (err.code || err.message || 'erreur réseau') + '.' });
          return;
        }
        fini(interpreterReponseEws(res && res.statusCode, res && res.body));
      });
    } catch (e) {
      clearTimeout(minuteur);
      fini({ ok: false, raison: 'reseau', message: 'Impossible de joindre le serveur Exchange.' });
    }
  });
}

module.exports = { corpsGetFolderCalendrier, interpreterReponseEws, testerConnexionExchange };
