'use strict';

// Faux serveur Ollama pour les tests : Ollama n'est pas installé dans l'environnement de
// développement (plusieurs Go de modèle à télécharger — voir server/README.md), et de toute façon
// un vrai modèle ne renverrait pas deux fois la même chose, ce qui rend un test non reproductible.
// Ce serveur HTTP local répond exactement ce qu'on lui demande de répondre.
//
// Factorisé ici après avoir été dupliqué à l'identique dans analyse-ia.test.js et
// extraction-ia.test.js. Deux ajouts par rapport à cette version dupliquée :
//   - une FILE de réponses (la dernière est répétée indéfiniment une fois la file épuisée), pour
//     pouvoir tester la relance de genererJson() : premier appel invalide, second valide ;
//   - un compteur d'appels, seul moyen de vérifier qu'une relance a bien eu lieu — et surtout
//     qu'elle n'a PAS eu lieu quand la première réponse était déjà valide.

const http = require('node:http');

async function demarrerFauxOllama(reponses, options) {
  const o = options || {};
  const file = Array.isArray(reponses) ? reponses.slice() : [reponses];
  const etat = { appels: 0, prompts: [], modeles: o.modeles || [{ name: 'llama3.1:8b' }] };

  const serveur = http.createServer((req, res) => {
    if (req.url === '/api/tags') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ models: etat.modeles }));
      return;
    }
    if (req.url === '/api/generate') {
      let corps = '';
      req.on('data', (c) => { corps += c; });
      req.on('end', () => {
        try { etat.prompts.push(JSON.parse(corps).prompt || ''); } catch (e) { etat.prompts.push(''); }
        const reponse = file.length > 1 ? file.shift() : file[0];
        etat.appels += 1;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ response: reponse }));
      });
      return;
    }
    res.statusCode = 404;
    res.end();
  });

  await new Promise((resolve) => serveur.listen(0, resolve));
  return {
    serveur,
    url: `http://127.0.0.1:${serveur.address().port}`,
    get appels() { return etat.appels; },
    get prompts() { return etat.prompts; },
    reinitialiser() { etat.appels = 0; etat.prompts.length = 0; },
    // Remplace la file de réponses sans avoir à redémarrer un serveur (et donc sans changer le
    // port, auquel l'application testée est déjà configurée).
    definirReponses(nouvelles) {
      file.length = 0;
      file.push(...(Array.isArray(nouvelles) ? nouvelles : [nouvelles]));
    }
  };
}

module.exports = { demarrerFauxOllama };
