// Carrega o .env (uso local, opcional) e expõe a configuração.
// No GitHub Actions os valores vêm dos Secrets do repositório.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

(function loadEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    let value = m[2];
    if (/^".*"$|^'.*'$/.test(value)) value = value.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
})();

function required(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Falta ${name}. No GitHub: Settings > Secrets and variables > Actions > New repository secret.`);
    process.exit(1);
  }
  return v;
}

// Endereço do GitHub Pages deste repositório: https://<dono>.github.io/<repo>
function pagesUrl() {
  const repo = process.env.GITHUB_REPOSITORY; // "dono/repo", definido no GitHub Actions
  if (!repo) return '';
  const [owner, name] = repo.split('/');
  return `https://${owner.toLowerCase()}.github.io/${name}`;
}

module.exports = {
  ROOT,
  POSTS_DIR: path.join(ROOT, 'posts'),
  TOKENS_FILE: path.join(ROOT, 'tokens.json'),
  TOKENS_ENC_FILE: path.join(ROOT, 'tokens.enc'),
  API_BASE: process.env.TIKTOK_API_BASE || 'https://open.tiktokapis.com',
  AUTH_URL: 'https://www.tiktok.com/v2/auth/authorize/',
  get clientKey() { return required('TIKTOK_CLIENT_KEY'); },
  get clientSecret() { return required('TIKTOK_CLIENT_SECRET'); },
  get redirectUri() {
    return process.env.TIKTOK_REDIRECT_URI || (pagesUrl() ? `${pagesUrl()}/callback.html` : required('TIKTOK_REDIRECT_URI'));
  },
  get publicBaseUrl() {
    return (process.env.PUBLIC_BASE_URL || (pagesUrl() ? `${pagesUrl()}/posts` : '')).replace(/\/+$/, '');
  },
  // Senha que criptografa os tokens salvos no repositório (tokens.enc). Sem ela, usa tokens.json local.
  get tokenKey() { return process.env.TIKTOK_TOKEN_KEY || ''; },
  scopes: (process.env.TIKTOK_SCOPES || 'user.info.basic,video.publish,video.upload').trim(),
};
