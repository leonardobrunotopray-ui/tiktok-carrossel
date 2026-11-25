#!/usr/bin/env node
// Gera posts/index.json com a lista de posts para a tela de aprovação (aprovar.html).
// Roda antes de publicar o site; o arquivo não precisa ir para o git.
const fs = require('fs');
const path = require('path');
const config = require('../src/config');

const EXT = ['.jpg', '.jpeg', '.webp'];

function read(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

const posts = [];
if (fs.existsSync(config.POSTS_DIR)) {
  for (const d of fs.readdirSync(config.POSTS_DIR, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const dir = path.join(config.POSTS_DIR, d.name);
    const post = read(path.join(dir, 'post.json'));
    if (!post) continue;
    const images = post.images || fs.readdirSync(dir)
      .filter((f) => EXT.includes(path.extname(f).toLowerCase()))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const aprovacao = read(path.join(dir, 'aprovacao.json'));
    const publicado = read(path.join(dir, 'publicado.json'));
    posts.push({
      pasta: d.name,
      exemplo: d.name.startsWith('exemplo'),
      title: post.title || '',
      description: post.description || '',
      images,
      cover_index: post.cover_index ?? 0,
      mode: (aprovacao && aprovacao.mode) || (post.mode === 'direct' ? 'direct' : 'rascunho'),
      aprovacao,
      publicado,
    });
  }
}
posts.sort((a, b) => a.pasta.localeCompare(b.pasta));
fs.writeFileSync(path.join(config.POSTS_DIR, 'index.json'), JSON.stringify({ gerado_em: new Date().toISOString(), posts }, null, 2) + '\n');
console.log(`posts/index.json: ${posts.length} posts`);
