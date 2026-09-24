'use strict';

const os = require('node:os');

// Adresses IPv4 locales candidates (hors loopback) : à donner aux autres postes du bureau pour
// qu'ils rejoignent ce même registre (`http://<ip>:<port>/`) — évite à l'étude de devoir chercher
// elle-même l'IP du poste dans les paramètres réseau Windows. Sert aussi à construire les liens
// vers les pièces envoyés dans Teams (voir liensPieces.js).
function adressesLan() {
  const interfaces = os.networkInterfaces();
  const adresses = [];
  for (const nom of Object.keys(interfaces)) {
    for (const iface of interfaces[nom] || []) {
      if (iface.family === 'IPv4' && !iface.internal) adresses.push(iface.address);
    }
  }
  return adresses;
}

module.exports = { adressesLan };
