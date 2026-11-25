#!/usr/bin/env node
// Publica um carrossel a partir de uma pasta em posts/.
//
// Uso:
//   node bin/postar.js <pasta>            publica posts/<pasta>
//   node bin/postar.js --proxima          publica o próximo post da fila (ordem alfabética)
//   node bin/postar.js <pasta> --dry-run  só valida e mostra o que seria enviado
//   node bin/postar.js --info             atualiza conta.json com os dados da conta (para a tela de aprovação)
//
// Regras:
//  - Modo "rascunho": o carrossel vai para a caixa de entrada do app TikTok e você finaliza lá.
//    Não precisa de aprovação na tela, porque a escolha de privacidade e o consentimento acontecem no app.
//  - Modo "direct" (publicação direta): só sai se o post foi aprovado em aprovar.html
//    (arquivo posts/<pasta>/aprovacao.json com privacidade, opções e consentimento escolhidos por você).
const fs = require('fs');
const path = require('path');
const config = require('../src/config');
const tiktok = require('../src/tiktok');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const positional = args.filter((a) => !a.startsWith('--'));

const LIMITS = { maxImages: 35, title: 90, description: 4000, ext: ['.jpg', '.jpeg', '.webp'] };
const CONTA_FILE = path.join(config.ROOT, 'conta.json');

function summary(line) {
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, line + '\n');
}

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {
    throw new Error(`${path.relative(config.ROOT, file)} tem um erro de digitação (aspas ou vírgula): ${e.message}`);
  }
}

function loadPost(folder) {
  const dir = path.join(config.POSTS_DIR, folder);
  const post = readJson(path.join(dir, 'post.json'));
  if (!post) throw new Error(`Não achei posts/${folder}/post.json`);
  const aprovacao = readJson(path.join(dir, 'aprovacao.json'));
  const mode = (aprovacao && aprovacao.mode) || (post.mode === 'direct' ? 'direct' : 'rascunho');
  return { dir, post, aprovacao, mode, publicado: fs.existsSync(path.join(dir, 'publicado.json')) };
}

function listPostDirs() {
  if (!fs.existsSync(config.POSTS_DIR)) return [];
  return fs.readdirSync(config.POSTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(config.POSTS_DIR, d.name, 'post.json')))
    .map((d) => d.name)
    .filter((d) => !d.startsWith('exemplo'))
    .sort();
}

// Próximo da fila: não publicado e pronto (rascunho, ou direto já aprovado).
// Data no horário de Brasília (AAAA-MM-DD).
function diaBrasil(d) { return new Date(d).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }); }

function pickFolder() {
  if (args.includes('--proxima')) {
    // Envio agendado: no máximo 1 post por dia. Se já saiu um hoje (por exemplo, enviado à mão
    // porque o agendamento do GitHub atrasou), não manda o de amanhã antes da hora.
    if (process.env.EVENTO === 'schedule') {
      const hoje = diaBrasil(Date.now());
      const jaSaiu = listPostDirs().some((d) => {
        const pub = readJson(path.join(config.POSTS_DIR, d, 'publicado.json'));
        return pub && pub.em && diaBrasil(pub.em) === hoje;
      });
      if (jaSaiu) { console.log('Já saiu um post hoje. O próximo vai amanhã.'); summary('Já saiu um post hoje. O próximo vai amanhã.'); process.exit(0); }
    }
    for (const d of listPostDirs()) {
      const p = loadPost(d);
      if (p.publicado) continue;
      if (p.mode === 'direct' && !p.aprovacao) { console.log(`Pulando ${d}: publicação direta aguardando aprovação.`); continue; }
      return d;
    }
    console.log('Nenhum post pronto na fila.');
    summary('Nenhum post pronto na fila (posts diretos precisam ser aprovados em aprovar.html).');
    process.exit(0);
  }
  if (!positional[0]) { console.error('Informe a pasta do post ou use --proxima.'); process.exit(1); }
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

function validate(info, urls) {
  const errors = [];
  if (!urls.length) errors.push('Nenhuma imagem encontrada (coloque 01.jpg, 02.jpg... ou "slides" no post.json).');
  if (urls.length > LIMITS.maxImages) errors.push(`Máximo de ${LIMITS.maxImages} imagens (tem ${urls.length}).`);
  for (const u of urls) {
    const ext = path.extname(new URL(u).pathname).toLowerCase();
    if (!LIMITS.ext.includes(ext)) errors.push(`Formato não aceito (use JPG ou WEBP; PNG não é aceito): ${u}`);
  }
  if (info.title.length > LIMITS.title) errors.push(`Título passa de ${LIMITS.title} caracteres.`);
  if (info.description.length > LIMITS.description) errors.push(`Legenda passa de ${LIMITS.description} caracteres.`);
  if (info.coverIndex < 0 || info.coverIndex >= urls.length) errors.push(`cover_index ${info.coverIndex} fora do intervalo 0..${urls.length - 1}.`);
  if (errors.length) throw new Error('Post inválido:\n - ' + errors.join('\n - '));
}

// O GitHub Pages pode levar alguns minutos para publicar imagens novas: espera até 6 min.
async function waitReachable(urls) {
  const deadline = Date.now() + 6 * 60 * 1000;
  for (const u of urls) {
    for (;;) {
      const res = await fetch(u, { method: 'HEAD' }).catch((e) => ({ ok: false, status: e.message }));
      if (res.ok) break;
      if (Date.now() > deadline) throw new Error(`Imagem inacessível (${res.status}): ${u}\nO site do GitHub Pages está ativo?`);
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

// Busca os dados da conta e salva o que a tela de aprovação precisa mostrar.
async function refreshConta() {
  const info = await tiktok.creatorInfo();
  const conta = {
    creator_username: info.creator_username,
    creator_nickname: info.creator_nickname,
    creator_avatar_url: info.creator_avatar_url,
    privacy_level_options: info.privacy_level_options || [],
    comment_disabled: !!info.comment_disabled,
    atualizado_em: new Date().toISOString(),
  };
  fs.writeFileSync(CONTA_FILE, JSON.stringify(conta, null, 2) + '\n');
  return { info, conta };
}

async function main() {
  if (args.includes('--info')) {
    const { conta } = await refreshConta();
    console.log(JSON.stringify(conta, null, 2));
    summary(`Conta conectada: **@${conta.creator_username}**. Privacidades permitidas agora: ${conta.privacy_level_options.join(', ')}`);
    return;
  }

  const folder = pickFolder();
  const { post, aprovacao, mode } = loadPost(folder);
  const ap = aprovacao || {};
  const data = {
    title: (ap.title ?? post.title ?? '').trim(),
    description: (ap.description ?? post.description ?? '').trim(),
    coverIndex: post.cover_index ?? 0,
  };
  const urls = resolveImages(folder, post);
  validate(data, urls);

  if (mode === 'direct') {
    if (!aprovacao) throw new Error(`O post ${folder} é de publicação direta e ainda não foi aprovado em aprovar.html.`);
    if (!ap.consentimento) throw new Error(`A aprovação de ${folder} está sem o consentimento.`);
    if (!ap.privacy) throw new Error(`A aprovação de ${folder} está sem a escolha de privacidade.`);
  }

  console.log(`Post: ${folder}  (${urls.length} imagens, modo ${mode === 'direct' ? 'publicação direta' : 'rascunho na caixa de entrada'})`);
  urls.forEach((u, i) => console.log(`  ${i + 1}. ${u}${i === data.coverIndex ? '  [capa]' : ''}`));

  if (dryRun) {
    console.log('\n--dry-run: nada foi enviado.');
    summary(`Teste do post **${folder}**: ${urls.length} imagens, tudo certo. Nada foi publicado.`);
    return;
  }

  await waitReachable(urls);

  let privacyLevel = null;
  let disableComment = true;
  if (mode === 'direct') {
    const { info } = await refreshConta();
    const options = info.privacy_level_options || [];
    if (!options.includes(ap.privacy)) {
      throw new Error(`A privacidade escolhida (${ap.privacy}) não está mais disponível para a conta. Opções: ${options.join(', ')}. Aprove o post de novo.`);
    }
    if (ap.conteudo_de_marca && ap.privacy === 'SELF_ONLY') {
      throw new Error('Conteúdo de marca (parceria paga) não pode ser publicado como "Só eu". Aprove o post de novo.');
    }
    privacyLevel = ap.privacy;
    disableComment = info.comment_disabled ? true : !ap.permitir_comentarios;
    console.log(`  Conta: @${info.creator_username} | privacidade: ${privacyLevel} | comentários: ${disableComment ? 'não' : 'sim'}`);
  }

  const { publish_id } = await tiktok.postCarousel({
    title: data.title,
    description: data.description,
    imageUrls: urls,
    coverIndex: data.coverIndex,
    privacyLevel,
    disableComment,
    autoAddMusic: post.auto_add_music !== false,
    brandContent: !!ap.conteudo_de_marca,
    brandOrganic: !!ap.sua_marca,
    mode,
  });
  console.log(`  Enviado. publish_id=${publish_id}`);

  const result = await waitForResult(publish_id);
  if (result.status === 'FAILED') throw new Error(`Publicação falhou: ${result.fail_reason || 'motivo não informado'}`);

  fs.writeFileSync(path.join(config.POSTS_DIR, folder, 'publicado.json'), JSON.stringify({
    publish_id, status: result.status, privacy: privacyLevel, mode, em: new Date().toISOString(),
  }, null, 2) + '\n');
  const msg = result.status === 'SEND_TO_USER_INBOX'
    ? `**${folder}** enviado para a caixa de entrada do app TikTok: abra o app para escolher a música e publicar.`
    : `**${folder}** publicado (${result.status}, privacidade ${privacyLevel}). Pode levar alguns minutos para aparecer no perfil.`;
  console.log(msg.replace(/\*\*/g, ''));
  summary(msg);
}

main().catch((e) => {
  let msg = e.message;
  if (/unaudited_client_can_only_post_to_private_accounts/.test(msg)) {
    msg += '\nEnquanto o app não for aprovado pelo TikTok, a publicação direta só funciona em conta privada. Use o modo rascunho.';
  }
  console.error('\nErro: ' + msg);
  summary('Erro: ' + msg);
  process.exit(1);
});
