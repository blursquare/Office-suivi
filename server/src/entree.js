'use strict';
// Point d'entrée de CLAIRE-serveur.exe (étude 26/10, relais 2.0) : le même exécutable sert aussi de relais des postes. Téléchargé
// sous le nom « CLAIRE-relais.exe » (ou lancé avec --relais), il démarre le relais (src/relaisPoste.js), jamais le serveur ; sinon
// le serveur (src/index.js), comme avant.
const { estModeRelais, lancerRelais } = require('./relaisPoste');

if (estModeRelais(process.execPath, process.argv.slice(1))) {
  lancerRelais(process.argv.slice(1).filter((a) => a !== '--relais'))
    .then((code) => { process.exitCode = code; })
    .catch(() => { process.exitCode = 1; });
} else {
  require('./index');
}
