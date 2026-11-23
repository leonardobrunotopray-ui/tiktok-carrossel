# TikTok Carrossel

Publica **carrosséis de imagens** no seu canal do TikTok pela API oficial, **direto do celular**,
usando o GitHub Actions. Não precisa de computador, de domínio nem de hospedagem paga: as imagens
ficam no GitHub Pages deste repositório.

- Site (GitHub Pages): `https://leonardobrunotopray-ui.github.io/tiktok-carrossel/`
- Redirect URI para o portal do TikTok: `https://leonardobrunotopray-ui.github.io/tiktok-carrossel/callback.html`
- Termos de Uso: `https://leonardobrunotopray-ui.github.io/tiktok-carrossel/termos.html`
- Política de Privacidade: `https://leonardobrunotopray-ui.github.io/tiktok-carrossel/privacidade.html`

## Configuração (uma vez, pelo navegador do celular)

> Dica: no Chrome do Android, toque em ⋮ e marque **Site para computador** quando um menu do GitHub
> ou do TikTok não aparecer.

1. **Torne o repositório público** (o GitHub Pages grátis exige):
   Settings → General → lá embaixo, *Danger Zone* → **Change visibility** → **Make public**.
   Seus secrets continuam protegidos; o token do TikTok fica criptografado.
2. **Ative o GitHub Pages:** Settings → **Pages** → *Build and deployment* → Source: **GitHub Actions**.
3. **Publique o site:** aba **Actions** → **Atualizar site** → **Run workflow**. Em 1 ou 2 minutos,
   abra o endereço do site acima e veja se carrega.
4. **Crie o app no portal do TikTok** (developers.tiktok.com), usando os endereços acima para site,
   Termos, Privacidade e Redirect URI. Adicione os produtos **Login Kit** e **Content Posting API**
   (com **Direct Post**) e os escopos `user.info.basic`, `video.publish` e `video.upload`.
5. **Verifique o endereço das imagens:** no portal, em **URL properties**, adicione o prefixo
   `https://leonardobrunotopray-ui.github.io/tiktok-carrossel/`. O TikTok dá um arquivo de verificação:
   suba-o na raiz deste repositório (**Add file → Upload files**) ou mande o nome e o conteúdo para o
   Claude subir. Espere o workflow *Atualizar site* terminar e conclua a verificação no portal.
6. **Cadastre os secrets:** Settings → **Secrets and variables** → **Actions** → **New repository secret**:
   | Nome | Valor |
   |---|---|
   | `TIKTOK_CLIENT_KEY` | Client key do portal |
   | `TIKTOK_CLIENT_SECRET` | Client secret do portal |
   | `TIKTOK_TOKEN_KEY` | Uma senha longa que você inventa (ex.: 5 palavras aleatórias). Não precisa decorar, mas não troque depois. |
7. **Autorize a conta:**
   1. Actions → **Autorizar TikTok** → **Run workflow** com o campo vazio.
   2. Abra a execução e toque no link **“Toque aqui para abrir a autorização do TikTok”** no resumo.
   3. Autorize com a conta do canal. Você cai na página **Autorização recebida**: toque em **Copiar**.
   4. Rode **Autorizar TikTok** de novo, colando no campo `url_retorno`. Faça em poucos minutos.
   5. O resumo deve mostrar **Conta autorizada** e o seu @.

## Publicar um carrossel

Cada post é uma pasta em `posts/`. Há duas formas:

**A) Só texto: as imagens são geradas automaticamente.** Crie `posts/<pasta>/post.json` com `slides`
(veja `posts/exemplo-reserva-emergencia/post.json`). Tipos de slide:

| tipo | campos |
|---|---|
| `capa` | `titulo`, `subtitulo`, `chamada` (opcional, padrão “Arrasta pro lado”) |
| `conteudo` | `numero` (opcional), `titulo`, `texto` |
| `destaque` | `titulo`, `valor` (ex.: `6×`, `R$ 2.600`), `texto` |
| `lista` | `titulo`, `itens` (lista de frases) |
| `final` | `titulo`, `texto` (mostra o `aviso` do post embaixo) |

Coloque `*asteriscos*` em volta das palavras que devem ficar destacadas na cor de acento.
Outros campos do post: `marca` (seu @), `tema` (`""` azul, `"verde"` ou `"claro"`) e `aviso`.

**B) Imagens prontas (Canva etc.).** Suba `01.jpg`, `02.jpg`… na pasta (**JPG**, não PNG; ideal 1080×1920)
e um `post.json` sem `slides`.

Campos de publicação do `post.json`: `title` (até 90 caracteres), `description` (legenda com hashtags),
`cover_index`, `mode` (`direct` ou `rascunho`), `privacy`, `auto_add_music`, `disable_comment`,
`brand_content`, `brand_organic`.

Depois: Actions → **Publicar no TikTok** → **Run workflow**. Deixe `pasta` vazio para publicar o próximo
da fila (pastas em ordem alfabética, por isso use datas no nome: `2026-12-01-cdb`). Marque **teste**
para conferir sem publicar. As pastas que começam com `exemplo` nunca entram na fila.

O Claude também pode criar os posts para você: peça na conversa (“faz um carrossel sobre CDB x poupança”)
e ele sobe o `post.json` e as imagens neste repositório.

## Publicar automaticamente

Em `.github/workflows/publicar.yml`, apague o `#` das linhas `schedule:` e `- cron:`. O padrão
`0 21 * * 1,3,5` publica segunda, quarta e sexta às 18h (Brasília), sempre o próximo post da fila.

## Avisos importantes

- Enquanto o TikTok **não auditar o app**, os posts saem **privados (SELF_ONLY)**. O workflow avisa.
  Teste assim e depois peça a auditoria no portal. Até lá, `"mode": "rascunho"` manda o post para a
  caixa de entrada do app, onde você publica manualmente.
- A autorização vale cerca de 1 ano e se renova sozinha a cada publicação. Se aparecer erro de
  autorização, rode **Autorizar TikTok** de novo.
- Se trocar o `TIKTOK_TOKEN_KEY`, rode **Autorizar TikTok** de novo.
- Conteúdo sobre investimentos: mantenha o aviso de que é educativo e não é recomendação.

## No computador (opcional)

`npm run auth` (com `.env`: `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REDIRECT_URI`,
`PUBLIC_BASE_URL`), `npm run gerar` (precisa do Playwright), `npm run postar -- <pasta>`.
