// Loads .env.local so tests and scripts see the same config as `next dev`.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env.local') });

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name} (check .env.local)`);
  return v;
}

module.exports = { requireEnv };
