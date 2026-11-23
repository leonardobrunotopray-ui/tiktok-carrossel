#!/usr/bin/env node
// Autoriza sua conta do TikTok e salva os tokens em tokens.json.
// Se o redirect URI for localhost, captura o código automaticamente;
// senão, cole no terminal a URL completa para onde o TikTok te mandou.
const http = require('http');
const readline = require('readline');
const config = require('../src/config');
const tiktok = require('../src/tiktok');

function parseCallback(urlStr, expectedState) {
  const u = new URL(urlStr);
  if (u.searchParams.get('error')) {
    throw new Error(`Autorização negada: ${u.searchParams.get('error')} ${u.searchParams.get('error_description') || ''}`);
  }
  const code = u.searchParams.get('code');
  if (!code) throw new Error('A URL não tem o parâmetro "code".');
  if (u.searchParams.get('state') !== expectedState) throw new Error('O "state" não confere; recomece o processo.');
  return code;
}

async function finish(code) {
  const t = await tiktok.exchangeCode(code);
  console.log(`\nConta autorizada! open_id=${t.open_id}`);
  console.log(`Escopos concedidos: ${t.scope}`);
  console.log('Tokens salvos em tokens.json (não compartilhe nem faça commit desse arquivo).');
}

async function main() {
  const { url, state } = tiktok.buildAuthUrl();
  const redirect = new URL(config.redirectUri);
  console.log('1) Abra este link no navegador, logado na conta do seu canal, e autorize:\n');
  console.log(url + '\n');

  if (['localhost', '127.0.0.1'].includes(redirect.hostname)) {
    const port = Number(redirect.port || 80);
    const server = http.createServer(async (req, res) => {
      const full = new URL(req.url, config.redirectUri);
      if (full.pathname !== redirect.pathname) { res.writeHead(404).end(); return; }
      try {
        await finish(parseCallback(full.href, state));
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Pronto! Pode fechar esta aba.');
      } catch (e) {
        console.error(e.message);
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Erro: ' + e.message);
        process.exitCode = 1;
      }
      server.close();
    });
    server.listen(port, () => console.log(`2) Aguardando o retorno em ${config.redirectUri} ...`));
    return;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question('2) Depois de autorizar, copie a URL inteira da barra do navegador e cole aqui:\n> ', async (answer) => {
    rl.close();
    try {
      await finish(parseCallback(answer.trim(), state));
    } catch (e) {
      console.error(e.message);
      process.exitCode = 1;
    }
  });
}

main().catch((e) => { console.error(e.message); process.exit(1); });
