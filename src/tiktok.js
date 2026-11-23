// Cliente mínimo da TikTok API v2: OAuth + Content Posting API (posts de foto/carrossel).
const crypto = require('crypto');
const config = require('./config');
const store = require('./tokenstore');

// ---------- OAuth ----------

function buildAuthUrl(state = crypto.randomBytes(16).toString('hex')) {
  const params = new URLSearchParams({
    client_key: config.clientKey,
    scope: config.scopes,
    response_type: 'code',
    redirect_uri: config.redirectUri,
    state,
  });
  return { url: `${config.AUTH_URL}?${params}`, state };
}

async function tokenRequest(body) {
  const res = await fetch(`${config.API_BASE}/v2/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache' },
    body: new URLSearchParams({ client_key: config.clientKey, client_secret: config.clientSecret, ...body }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error || !json.access_token) {
    throw new Error(`Falha ao obter token: ${json.error || res.status} - ${json.error_description || 'sem detalhes'}`);
  }
  return json;
}

function saveTokens(t) {
  const now = Date.now();
  return store.save({
    open_id: t.open_id,
    scope: t.scope,
    access_token: t.access_token,
    access_expires_at: now + (t.expires_in - 60) * 1000,
    refresh_token: t.refresh_token,
    refresh_expires_at: now + (t.refresh_expires_in - 60) * 1000,
  });
}

async function exchangeCode(code) {
  return saveTokens(await tokenRequest({ code, grant_type: 'authorization_code', redirect_uri: config.redirectUri }));
}

// Devolve um access token válido, renovando com o refresh token quando preciso.
async function getAccessToken() {
  const t = store.load();
  if (!t) throw new Error('A conta ainda não foi autorizada. Rode o workflow "Autorizar TikTok" (ou npm run auth no computador).');
  if (Date.now() < t.access_expires_at) return t.access_token;
  if (Date.now() >= t.refresh_expires_at) {
    throw new Error('A autorização expirou (validade de ~1 ano). Rode o workflow "Autorizar TikTok" de novo.');
  }
  return saveTokens(await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh_token })).access_token;
}

// ---------- Chamadas autenticadas ----------

async function api(pathname, body) {
  const token = await getAccessToken();
  const res = await fetch(`${config.API_BASE}${pathname}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(body || {}),
  });
  const json = await res.json().catch(() => ({}));
  const err = json.error || {};
  if (!res.ok || (err.code && err.code !== 'ok')) {
    throw new Error(`TikTok ${pathname}: ${err.code || res.status} - ${err.message || 'sem detalhes'} (log_id ${err.log_id || '?'})`);
  }
  return json.data;
}

// Opções que o criador permite (privacidade, comentários etc.). Obrigatório consultar antes de postar.
function creatorInfo() {
  return api('/v2/post/publish/creator_info/query/');
}

/**
 * Publica um carrossel de fotos.
 * mode: 'direct'   -> publica direto no perfil (escopo video.publish)
 *       'rascunho' -> envia para a caixa de entrada do app TikTok, você finaliza lá (escopo video.upload)
 */
function postCarousel({ title, description, imageUrls, coverIndex = 0, privacyLevel, disableComment = false,
  autoAddMusic = true, brandContent = false, brandOrganic = false, mode = 'direct' }) {
  const direct = mode === 'direct';
  const post_info = { title, description };
  if (direct) {
    Object.assign(post_info, {
      privacy_level: privacyLevel,
      disable_comment: disableComment,
      auto_add_music: autoAddMusic,
      brand_content_toggle: brandContent,
      brand_organic_toggle: brandOrganic,
    });
  }
  return api('/v2/post/publish/content/init/', {
    post_info,
    source_info: {
      source: 'PULL_FROM_URL', // posts de foto só aceitam URL de domínio/prefixo verificado no portal
      photo_cover_index: coverIndex,
      photo_images: imageUrls,
    },
    post_mode: direct ? 'DIRECT_POST' : 'MEDIA_UPLOAD',
    media_type: 'PHOTO',
  });
}

function fetchStatus(publishId) {
  return api('/v2/post/publish/status/fetch/', { publish_id: publishId });
}

module.exports = { buildAuthUrl, exchangeCode, getAccessToken, creatorInfo, postCarousel, fetchStatus };
