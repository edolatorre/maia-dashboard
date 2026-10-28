'use strict';
// Tokens de integraciones (Meta, Anthropic). Se guardan solo en el servidor,
// en un archivo aparte de los datos, con permisos 600. Nunca se devuelven por la API.
const fs = require('fs');
const path = require('path');

module.exports = function createSecrets(dataDir) {
  const file = path.join(dataDir, 'secrets.json');
  let cache = {};
  try {
    cache = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    cache = {};
  }
  function save() {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(cache, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, file);
    try { fs.chmodSync(file, 0o600); } catch { /* noop */ }
  }
  return {
    get(key) {
      return process.env[key.toUpperCase()] || cache[key] || '';
    },
    has(key) {
      return Boolean(this.get(key));
    },
    set(key, value) {
      if (value) cache[key] = String(value).trim();
      else delete cache[key];
      save();
    },
    hint(key) {
      const v = this.get(key);
      return v ? '••••' + v.slice(-4) : '';
    },
  };
};
