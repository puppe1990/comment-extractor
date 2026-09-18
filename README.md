# Instagram Reels Comment Extractor

Extensão Chrome (Manifest V3) que extrai comentários e respostas de um Reel aberto, salva pouco a pouco e baixa um CSV.

## Carregar no Chrome

1. Abra `chrome://extensions`
2. Ative o modo desenvolvedor
3. **Carregar sem compactação** e escolha a raiz deste repositório (`manifest.json`)
4. Abra um Reel (`https://www.instagram.com/reels/.../`), abra os comentários e clique no ícone da extensão → **Extrair**

É preciso estar logado no Instagram.

## CSV

Colunas: `profile_name`, `comment_text`, `type` (`comment` ou `reply`), `reply_to`, `post_url`. UTF-8 com BOM.

## Desenvolvimento

```bash
npm install
npm test
npm run lint
npm run format:check
```

O pre-commit (Husky) roda Prettier, ESLint e os testes nos arquivos staged.
