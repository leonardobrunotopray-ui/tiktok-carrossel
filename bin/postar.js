#!/usr/bin/env node
// Publica um carrossel a partir de uma pasta em posts/.
//
// Uso:
//   node bin/postar.js <pasta>            publica posts/<pasta>
//   node bin/postar.js --proxima          publica a próxima pasta ainda não publicada (ordem alfabética)
//   node bin/postar.js <pasta> --dry-run  só valida e mostra o que seria enviado
//   node bin/postar.js --info             mostra o que sua conta permite (privacidade etc.)
const fs = require('fs');
const path = require('path');
const config = require('../src/config');
const tiktok = require('../src/tiktok');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const positional = args.filter((a) => !a.startsWith('--'));

const LIMITS = { maxImages: 35, title: 90, description: 4000, ext: ['.jpg', '.jpeg', '.webp'] };

function summary(line) {
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, line + '\n');
}

function listPostDirs() {
  if (!fs.existsSync(config.POSTS_DIR)) return [];
  return fs.readdirSync(config.POSTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(config.POSTS_DIR, d.name, 'post.json')))
    .map((d) => d.name)
    .filter((d) => !d.startsWith('exemplo'))
    .sort();
}

function pickFolder() {
  if (args.includes('--proxima')) {
    const next = listPostDirs().find((d) => !fs.existsSync(path.join(config.POSTS_DIR, d, 'publicado.json')));
    if (!next) { console.log('Nenhum post pendente em posts/.'); summary('Nenhum post pendente na fila.'); process.exit(0); }
    return next;
  }
  if (!positional[0]) {
    console.error('Informe a pasta do post ou use --proxima.');
    process.exit(1);
  }
  return positional[0];
}

// "images" em post.json aceita URLs completas (https://...) ou nomes de arquivo;
// nomes de arquivo viram PUBLIC_BASE_URL/<pasta>/<arquivo>.
// Se "images" for omitido, usa todos os .jpg/.jpeg/.webp da pasta em ordem (01.jpg, 02.jpg...).
function resolveImages(folder, post) {
  const dir = path.join(config.POSTS_DIR, folder);
  const list = post.images || fs.readdirSync(dir)
    .filter((f) => LIMITS.ext.includes(path.extname(f).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return list.map((item) => {
    if (/^https:\/\//i.test(item)) return item;
    if (!config.publicBaseUrl) throw new Error(`"${item}" é um arquivo local: defina PUBLIC_BASE_URL ou rode pelo GitHub Actions.`);
    return `${config.publicBaseUrl}/${encodeURIComponent(folder)}/${encodeURIComponent(item)}`;
  });
}

function validate(post, urls) {
  const errors = [];
  if (!urls.length) errors.push('Nenhuma imagem encontrada (coloque 01.jpg, 02.jpg... ou "slides" no post.json).');
  if (urls.length > LIMITS.maxImages) errors.push(`Máximo de ${LIMITS.maxImages} imagens (tem ${urls.length}).`);
  for (const u of urls) {
    const ext = path.extname(new URL(u).pathname).toLowerCase();
    if (!LIMITS.ext.includes(ext)) errors.push(`Formato não aceito (use JPG ou WEBP; PNG não é aceito): ${u}`);
  }
  if ((post.title || '').length > LIMITS.title) errors.push(`Título passa de ${LIMITS.title} caracteres.`);
  if ((post.description || '').length > LIMITS.description) errors.push(`Descrição passa de ${LIMITS.description} caracteres.`);
  const cover = post.cover_index ?? 0;
  if (cover < 0 || cover >= urls.length) errors.push(`cover_index ${cover} fora do intervalo 0..${urls.length - 1}.`);
  if (errors.length) throw new Error('Post inválido:\n - ' + errors.join('\n - '));
}

// O GitHub Pages pode levar alguns minutos para publicar imagens novas: espera até 6 min.
async function waitReachable(urls) {
  const deadline = Date.now() + 6 * 60 * 1000;
  for (const u of urls) {
    for (;;) {
      const res = await fetch(u, { method: 'HEAD' }).catch((e) => ({ ok: false, status: e.message }));
      if (res.ok) break;
      if (Date.now() > deadline) {
        throw new Error(`Imagem inacessível (${res.status}): ${u}\nO TikTok precisa baixar cada imagem dessa URL. O site do GitHub Pages está ativo?`);
      }
      console.log(`  aguardando a imagem ficar no ar (${res.status}): ${u}`);
      await new Promise((r) => setTimeout(r, 15000));
    }
  }
}

async function waitForResult(publishId) {
  const finals = ['PUBLISH_COMPLETE', 'SEND_TO_USER_INBOX', 'FAILED'];
  for (let i = 0; i < 40; i++) {
    const s = await tiktok.fetchStatus(publishId);
    console.log(`  status: ${s.status}`);
    if (finals.includes(s.status)) return s;
    await new Promise((r) => setTimeout(r, 3000));
  }
  return { status: 'AINDA_PROCESSANDO' };
}

async function main() {
  if (args.includes('--info')) {
    const info = await tiktok.creatorInfo();
    console.log(JSON.stringify(info, null, 2));
    summary(`Conta conectada: **@${info.creator_username}**. Privacidades permitidas agora: ${(info.privacy_level_options || []).join(', ')}`);
    return;
  }

  const folder = pickFolder();
  const file = path.join(config.POSTS_DIR, folder, 'post.json');
  if (!fs.existsSync(file)) throw new Error(`Não achei posts/${folder}/post.json`);
  let post;
  try { post = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {
    throw new Error(`posts/${folder}/post.json tem um erro de digitação (aspas ou vírgula): ${e.message}`);
  }
  const mode = post.mode === 'rascunho' ? 'rascunho' : 'direct';
  const urls = resolveImages(folder, post);
  validate(post, urls);

  console.log(`Post: ${folder}  (${urls.length} imagens, modo ${mode === 'direct' ? 'publicação direta' : 'rascunho na caixa de entrada'})`);
  urls.forEach((u, i) => console.log(`  ${i + 1}. ${u}${i === (post.cover_index ?? 0) ? '  [capa]' : ''}`));

  if (dryRun) {
    console.log('\n--dry-run: nada foi enviado.');
    summary(`Teste do post **${folder}**: ${urls.length} imagens, tudo certo. Nada foi publicado.`);
    return;
  }

  await waitReachable(urls);

  let privacyLevel;
  if (mode === 'direct') {
    const info = await tiktok.creatorInfo();
    const options = info.privacy_level_options || [];
    privacyLevel = post.privacy || 'PUBLIC_TO_EVERYONE';
    if (!options.includes(privacyLevel)) {
      // Apps ainda não auditados pelo TikTok só podem postar como SELF_ONLY (privado).
      const fallback = options.includes('SELF_ONLY') ? 'SELF_ONLY' : options[0];
      console.log(`  Privacidade "${privacyLevel}" não permitida agora; usando "${fallback}". Opções: ${options.join(', ')}`);
      privacyLevel = fallback;
    }
    console.log(`  Conta: @${info.creator_username} | privacidade: ${privacyLevel}`);
  }

  const send = (privacy) => tiktok.postCarousel({
    title: post.title || '',
    description: post.description || '',
    imageUrls: urls,
    coverIndex: post.cover_index ?? 0,
    privacyLevel: privacy,
    disableComment: !!post.disable_comment,
    autoAddMusic: post.auto_add_music !== false,
    brandContent: !!post.brand_content,
    brandOrganic: !!post.brand_organic,
    mode,
  });
  let publish_id;
  try {
    ({ publish_id } = await send(privacyLevel));
  } catch (e) {
    // App ainda não aprovado (Sandbox/sem auditoria): o TikTok só aceita posts privados.
    if (mode === 'direct' && privacyLevel !== 'SELF_ONLY' && /unaudited|private/i.test(e.message)) {
      console.log('  O TikTok só aceita posts privados enquanto o app não for aprovado. Enviando como SELF_ONLY.');
      privacyLevel = 'SELF_ONLY';
      ({ publish_id } = await send(privacyLevel));
    } else throw e;
  }
  console.log(`  Enviado. publish_id=${publish_id}`);

  const result = await waitForResult(publish_id);
  if (result.status === 'FAILED') throw new Error(`Publicação falhou: ${result.fail_reason || 'motivo não informado'}`);

  fs.writeFileSync(path.join(config.POSTS_DIR, folder, 'publicado.json'), JSON.stringify({
    publish_id, status: result.status, privacy: privacyLevel || null, mode, em: new Date().toISOString(),
  }, null, 2) + '\n');
  const msg = result.status === 'SEND_TO_USER_INBOX'
    ? `**${folder}** enviado para a caixa de entrada do app TikTok: abra o app para finalizar.`
    : `**${folder}** publicado (${result.status}${privacyLevel ? ', privacidade ' + privacyLevel : ''}).`;
  console.log(msg.replace(/\*\*/g, ''));
  summary(msg);
}

main().catch((e) => { console.error('\nErro: ' + e.message); summary('Erro: ' + e.message); process.exit(1); });
