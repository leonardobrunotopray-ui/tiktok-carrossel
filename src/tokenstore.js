// Guarda os tokens do TikTok.
// - Com TIKTOK_TOKEN_KEY (GitHub Actions): arquivo tokens.enc criptografado (AES-256-GCM) e salvo no repositório,
//   para que o token renovado em uma execução sirva na próxima. Sem a senha, o arquivo é ilegível.
// - Sem a senha (uso local): tokens.json em texto, fora do git.
const crypto = require('crypto');
const fs = require('fs');
const config = require('./config');

function mask(value) {
  if (process.env.GITHUB_ACTIONS && value) console.log(`::add-mask::${value}`);
}

function encrypt(obj, pass) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(pass, salt, 32);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()]);
  return JSON.stringify({
    v: 1, salt: salt.toString('base64'), iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64'),
  }, null, 2) + '\n';
}

function decrypt(text, pass) {
  const p = JSON.parse(text);
  const key = crypto.scryptSync(pass, Buffer.from(p.salt, 'base64'), 32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(p.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(p.tag, 'base64'));
  try {
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(p.data, 'base64')), decipher.final()]).toString('utf8'));
  } catch {
    throw new Error('Não consegui abrir tokens.enc: o secret TIKTOK_TOKEN_KEY mudou? Rode o workflow "Autorizar TikTok" de novo.');
  }
}

function load() {
  const pass = config.tokenKey;
  let t = null;
  if (pass && fs.existsSync(config.TOKENS_ENC_FILE)) t = decrypt(fs.readFileSync(config.TOKENS_ENC_FILE, 'utf8'), pass);
  else if (!pass && fs.existsSync(config.TOKENS_FILE)) t = JSON.parse(fs.readFileSync(config.TOKENS_FILE, 'utf8'));
  if (t) { mask(t.access_token); mask(t.refresh_token); }
  return t;
}

function save(data) {
  mask(data.access_token); mask(data.refresh_token);
  const pass = config.tokenKey;
  if (pass) fs.writeFileSync(config.TOKENS_ENC_FILE, encrypt(data, pass));
  else fs.writeFileSync(config.TOKENS_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
  return data;
}

module.exports = { load, save, mask };
