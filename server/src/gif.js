// @ts-check
'use strict';
// GIF des discussions (étude 30/10 : « à côté des emoji, l'accès à une bibliothèque de GIF » ; choix : Tenor). Le SERVEUR interroge Tenor
// (seul le mot tapé part, jamais une donnée d'un dossier) et sert lui-même les images (la page n'appelle aucun site extérieur). Clé de l'API
// (Google, « Tenor API ») gardée en base, jamais renvoyée. Seules les images de media*.tenor.com, en https, GIF de 8 Mo au plus.

const CLE = 'gif-tenor';
const MAX_OCTETS = 8 * 1024 * 1024;
const RE_HOTE_IMAGE = /^https:\/\/media\d*\.tenor\.com\/[^\s?#]+$/i;

/** Pure : une adresse d'image Tenor permise. @param {any} url */
function urlImagePermise(url) {
  return typeof url === 'string' && url.length < 500 && RE_HOTE_IMAGE.test(url);
}

/** Pure : la requête de recherche (vide = les GIF du moment). @param {string} q @param {string} cle */
function urlRecherche(q, cle) {
  const mot = String(q || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  const base = mot ? 'https://tenor.googleapis.com/v2/search' : 'https://tenor.googleapis.com/v2/featured';
  const p = new URLSearchParams({ key: cle, client_key: 'claire', limit: '24', media_filter: 'tinygif,gif', locale: 'fr_FR', contentfilter: 'high' });
  if (mot) p.set('q', mot);
  return `${base}?${p.toString()}`;
}

/** Pure : les résultats de Tenor réduits à { id, apercu, gif } (adresses permises seulement). @param {any} json */
function resultatsTenor(json) {
  const liste = json && Array.isArray(json.results) ? json.results : [];
  return liste.map((r) => {
    const f = (r && r.media_formats) || {};
    const apercu = f.tinygif && f.tinygif.url;
    const gif = (f.gif && f.gif.url) || apercu;
    return { id: String((r && r.id) || '').slice(0, 40), apercu, gif };
  }).filter((r) => r.id && urlImagePermise(r.apercu) && urlImagePermise(r.gif));
}

/** @param {any} repo */
function lireCle(repo) {
  const v = repo.lireJsonBrut(CLE, {}) || {};
  return typeof v.cle === 'string' ? v.cle : '';
}

/**
 * @param {any} repo
 * @param {typeof fetch} [fetchImpl]
 */
function creerGif(repo, fetchImpl) {
  const f = fetchImpl || ((u, o) => fetch(u, o));
  return {
    disponible: () => !!lireCle(repo),
    /** @param {string} q */
    async rechercher(q) {
      const cle = lireCle(repo);
      if (!cle) return { disponible: false, resultats: [] };
      const r = await f(urlRecherche(q, cle), { redirect: 'error', signal: AbortSignal.timeout(10000) });
      if (!r.ok) throw new Error(r.status === 400 || r.status === 403 ? 'clé Tenor refusée' : `Tenor : HTTP ${r.status}`);
      return { disponible: true, resultats: resultatsTenor(await r.json()) };
    },
    /** @param {string} url */
    async image(url) {
      if (!urlImagePermise(url)) throw Object.assign(new Error('adresse refusée'), { status: 400 });
      const r = await f(url, { redirect: 'error', signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error(`image : HTTP ${r.status}`);
      // Taille contrôlée AVANT d'avoir tout reçu (audit 0.408.0 : un gros fichier de Tenor était chargé entier en mémoire) : la taille
      // annoncée, puis la lecture en flux arrêtée au-delà du plafond.
      if (Number(r.headers && r.headers.get ? r.headers.get('content-length') || 0 : 0) > MAX_OCTETS) throw new Error('image trop lourde');
      let tampon;
      if (r.body && typeof r.body.getReader === 'function') {
        const lecteur = r.body.getReader();
        const morceaux = [];
        let total = 0;
        for (;;) {
          const { done, value } = await lecteur.read();
          if (done) break;
          total += value.length;
          if (total > MAX_OCTETS) { try { await lecteur.cancel(); } catch (e) { /* déjà fermé */ } throw new Error('image trop lourde'); }
          morceaux.push(Buffer.from(value));
        }
        tampon = Buffer.concat(morceaux);
      } else {
        tampon = Buffer.from(await r.arrayBuffer());
        if (tampon.length > MAX_OCTETS) throw new Error('image trop lourde');
      }
      if (tampon.subarray(0, 4).toString('latin1') !== 'GIF8') throw new Error('ce n’est pas un GIF');
      return tampon;
    }
  };
}

module.exports = { CLE, MAX_OCTETS, urlImagePermise, urlRecherche, resultatsTenor, lireCle, creerGif };
