// Bearer-token access for API specs. Tokens are written by tests/global-setup.js.
const fs = require('fs');
const path = require('path');

const TOKENS_FILE = path.join(__dirname, '..', '.auth', 'tokens.json');

function getToken(role = 'admin') {
  const tokens = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
  if (!tokens[role]) throw new Error(`No token for role "${role}"`);
  return tokens[role].access_token;
}

function authHeaders(role = 'admin') {
  return { Authorization: `Bearer ${getToken(role)}` };
}

module.exports = { getToken, authHeaders };
