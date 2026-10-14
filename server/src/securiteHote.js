// @ts-check
'use strict';

// Contrôle de l'adresse et de l'origine des requêtes (audit 13/10, étude 14/10 : « les postes ouvrent CLAIRE par l'adresse IP
// du serveur et par localhost »). Sans mot de passe par défaut, une page web visitée par un collaborateur pouvait atteindre
// l'API de CLAIRE : par rebond DNS (un nom extérieur qui pointe vers le serveur — l'en-tête Host porte alors ce nom) ou par un
// formulaire envoyé à l'adresse IP (l'en-tête Origin porte alors le site extérieur). On refuse donc :
//   - toute requête dont le Host n'est ni une adresse IP, ni localhost, ni un nom listé dans config.json (`hotesAutorises`) ;
//   - toute requête qui écrit (hors GET/HEAD/OPTIONS) venue d'une page d'un autre site — une requête sans Origin (Word,
//     PowerShell, 3CX) et l'extension Firefox (moz-extension:) restent acceptées.

/** Le nom de machine d'un en-tête Host ou d'une adresse, sans port ni crochets, en minuscules. @param {string} hote */
function nomHote(hote) {
  const h = String(hote || '').trim().toLowerCase();
  if (h.startsWith('[')) return h.slice(1, h.indexOf(']') > 0 ? h.indexOf(']') : undefined);
  return h.replace(/:\d+$/, '');
}

/** @param {string} nom */
function estAdresseIp(nom) {
  if (/^(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(nom)) return true;
  return nom.includes(':') && /^[0-9a-f:.]+$/.test(nom);
}

/** Pure : l'en-tête Host est-il accepté ? @param {string} hote @param {string[]} [autres] noms listés dans config.json */
function hoteAutorise(hote, autres) {
  const nom = nomHote(hote);
  if (!nom) return true; // HTTP/1.0 sans Host : rien à rebondir
  if (nom === 'localhost' || estAdresseIp(nom)) return true;
  return (autres || []).map((x) => nomHote(x)).filter(Boolean).includes(nom);
}

/** Pure : l'en-tête Origin d'une requête qui écrit est-il accepté ? @param {string} origine @param {string} hote @param {string[]} [autres] */
function origineAutorisee(origine, hote, autres) {
  const o = String(origine || '').trim();
  if (!o) return true;
  if (/^(?:moz|chrome)-extension:\/\//i.test(o)) return true;
  if (o === 'null') return false;
  let url;
  try { url = new URL(o); } catch (_) { return false; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  const nom = nomHote(url.host);
  return nom === nomHote(hote) || hoteAutorise(url.host, autres);
}

/** Middleware Express. @param {{ hotesAutorises?: string[] }} [config] */
function creerControleHote(config) {
  const autres = Array.isArray(config && config.hotesAutorises) ? config.hotesAutorises : [];
  return (/** @type {any} */ req, /** @type {any} */ res, /** @type {any} */ next) => {
    const hote = req.headers.host || '';
    if (!hoteAutorise(hote, autres)) {
      res.status(421).type('text/plain; charset=utf-8')
        .send(`CLAIRE s'ouvre par l'adresse IP du serveur (ou localhost sur le serveur). Le nom « ${nomHote(hote).slice(0, 80)} » n'est pas accepté ; s'il doit l'être, l'ajouter à « hotesAutorises » dans config.json.`);
      return;
    }
    const methode = String(req.method || 'GET').toUpperCase();
    if (methode !== 'GET' && methode !== 'HEAD' && methode !== 'OPTIONS' && !origineAutorisee(req.headers.origin || '', hote, autres)) {
      res.status(403).json({ erreur: 'Requête refusée : elle vient d’une page extérieure à CLAIRE.' });
      return;
    }
    next();
  };
}

module.exports = { nomHote, estAdresseIp, hoteAutorise, origineAutorisee, creerControleHote };
