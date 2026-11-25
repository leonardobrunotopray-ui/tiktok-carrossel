#!/usr/bin/env node
// Autorização pelo GitHub Actions (sem computador).
//  - Sem URL_RETORNO: mostra o link de autorização no resumo da execução.
//  - Com URL_RETORNO (a URL da página callback.html depois de autorizar): troca o código pelos tokens
//    e salva em tokens.enc (criptografado com o secret TIKTOK_TOKEN_KEY).
const fs = require('fs');
const config = require('../src/config');
const tiktok = require('../src/tiktok');
const store = require('../src/tokenstore');

const STATE = 'github-actions';

function summary(md) {
  console.log(md.replace(/\*\*/g, ''));
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
}

async function main() {
  if (!config.tokenKey) throw new Error('Falta o secret TIKTOK_TOKEN_KEY (uma senha longa que você inventa).');
  const retorno = (process.env.URL_RETORNO || '').trim();

  if (!retorno) {
    // O GitHub esconde (***) qualquer valor de secret que apareça no log ou no resumo, inclusive o Client key.
    // Por isso o link aponta para autorizar.html no site, que recebe o Client key codificado e monta o link do TikTok.
    // O Client key não é sigiloso: ele aparece na barra do navegador em qualquer login do TikTok.
    const k = Buffer.from(config.clientKey).toString('base64url');
    const s = encodeURIComponent(config.scopes);
    const url = config.redirectUri.replace(/callback\.html$/, 'autorizar.html') + `#k=${k}&s=${s}`;
    summary([
      '## Passo 1 de 2: autorize no TikTok',
      '',
      `**[Toque aqui para abrir a autorização do TikTok](${url})**`,
      '',
      'Entre com a conta do seu canal e toque em Autorizar. Você vai cair na página "Autorização recebida":',
      'toque em **Copiar** e rode este workflow de novo, colando no campo **url_retorno**.',
      '',
      `Redirect URI usado (tem que ser igual ao do portal): \`${config.redirectUri}\``,
    ].join('\n'));
    return;
  }

  const u = new URL(retorno);
  if (u.searchParams.get('error')) {
    throw new Error(`Autorização negada: ${u.searchParams.get('error')} ${u.searchParams.get('error_description') || ''}`);
  }
  const code = u.searchParams.get('code');
  if (!code) throw new Error('A URL colada não tem o "code". Copie a URL inteira da página "Autorização recebida".');
  store.mask(code);
  if (u.searchParams.get('state') !== STATE) throw new Error('Essa URL não veio do link gerado por este workflow. Gere um link novo.');

  const t = await tiktok.exchangeCode(code);
  summary([
    '## Conta autorizada',
    '',
    `Escopos concedidos: \`${t.scope}\``,
    '',
    'Os tokens foram salvos criptografados em `tokens.enc`. Agora é só rodar o workflow **Publicar no TikTok**.',
  ].join('\n'));
}

main().catch((e) => { console.error('Erro: ' + e.message); process.exit(1); });
