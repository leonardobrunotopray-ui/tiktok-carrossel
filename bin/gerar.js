#!/usr/bin/env node
// Gera as imagens (01.jpg, 02.jpg...) dos posts que têm "slides" no post.json e ainda não têm as imagens.
//
// Uso:
//   node bin/gerar.js              gera o que estiver faltando (posts ainda não publicados)
//   node bin/gerar.js <pasta>      gera (ou refaz) só essa pasta
//   node bin/gerar.js --verificar  sai com código 0 se há algo para gerar, 1 se não há
const fs = require('fs');
const path = require('path');
const config = require('../src/config');

const args = process.argv.slice(2);
const only = args.find((a) => !a.startsWith('--'));
const TEMPLATE = path.join(config.ROOT, 'templates', 'slide.html');

function fileName(i) { return String(i + 1).padStart(2, '0') + '.jpg'; }

function pending() {
  if (!fs.existsSync(config.POSTS_DIR)) return [];
  const dirs = only ? [only] : fs.readdirSync(config.POSTS_DIR);
  return dirs.filter((d) => {
    const dir = path.join(config.POSTS_DIR, d);
    const pj = path.join(dir, 'post.json');
    if (!fs.existsSync(pj)) return false;
    if (!only && fs.existsSync(path.join(dir, 'publicado.json'))) return false;
    let post;
    try { post = JSON.parse(fs.readFileSync(pj, 'utf8')); } catch { return false; }
    if (!Array.isArray(post.slides) || !post.slides.length) return false;
    return only || post.slides.some((_, i) => !fs.existsSync(path.join(dir, fileName(i))));
  });
}

async function main() {
  const list = pending();
  if (args.includes('--verificar')) {
    console.log(list.length ? `Para gerar: ${list.join(', ')}` : 'Nada para gerar.');
    process.exit(list.length ? 0 : 1);
  }
  if (!list.length) { console.log('Nada para gerar.'); return; }

  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  await page.goto('file://' + TEMPLATE, { waitUntil: 'networkidle' }).catch(() => page.goto('file://' + TEMPLATE));
  await page.evaluate(() => document.fonts.ready);

  for (const folder of list) {
    const dir = path.join(config.POSTS_DIR, folder);
    const post = JSON.parse(fs.readFileSync(path.join(dir, 'post.json'), 'utf8'));
    // remove imagens antigas desta pasta para não sobrar slide a mais
    for (const f of fs.readdirSync(dir)) if (/^\d+\.jpg$/.test(f)) fs.unlinkSync(path.join(dir, f));
    for (let i = 0; i < post.slides.length; i++) {
      await page.evaluate((d) => { render(d); return document.fonts.ready; }, {
        slide: post.slides[i], indice: i, total: post.slides.length,
        marca: post.marca || '', tema: post.tema || '', aviso: post.aviso || '',
      });
      await page.screenshot({ path: path.join(dir, fileName(i)), type: 'jpeg', quality: 90 });
    }
    console.log(`${folder}: ${post.slides.length} imagens geradas`);
  }
  await browser.close();
}

main().catch((e) => { console.error('Erro: ' + e.message); process.exit(1); });
