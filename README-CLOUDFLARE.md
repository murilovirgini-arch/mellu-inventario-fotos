# MelLu Inventário Livre — versão independente

Esta adaptação não está publicada. O aplicativo atual da Netlify permanece em produção. O código desta versão usa Cloudflare Workers com arquivos estáticos e banco D1, além da API Gemini diretamente no Google; não utiliza AI Gateway, Functions nem Blobs da Netlify.

## Mesma planilha e contagens dos dois sistemas

O endpoint de gravação é o mesmo Web App Apps Script já usado na produção. A planilha é `1t2EiHO_OeP34lyCnm2PtC3u_biiH_sEOeET2rx0z6Tg`, abas `Página1` e `Histórico de Correções App`.

- Não substituir nem republicar o Apps Script existente.
- Cada nova contagem recebe UUID próprio, mesmo com EAN repetido.
- Os dois aplicativos usam o mesmo gravador, que coordena as gravações com lock e reserva a próxima linha disponível nas duas abas.
- Uma repetição de transporte conserva o UUID e não cria outra contagem.
- A validade manual é enviada como `validade` ao gravador existente.
- Os testes de integração usam um gravador simulado; não adicionam linhas reais à planilha.

## Custo e limites

Não existe leitura de imagens por IA sem processamento de tokens. O projeto Google deve estar no **Free Tier**, sem faturamento pago habilitado. Verificar esse estado no AI Studio antes de configurar a chave. Uma chave de projeto pago continua sujeita à cobrança do Google, mesmo fora da Netlify.

O modelo selecionado é `gemini-3.5-flash-lite`, com raciocínio mínimo e entrada de imagens. A versão não muda automaticamente para outro provedor quando o Google recusa por cota. Os limites reais por minuto/dia são os exibidos no AI Studio para esse projeto.

Usar **Workers Free**. Arquivos estáticos são gratuitos; as rotas `/api/*` usam Workers, sujeitos à franquia diária e ao limite de CPU. O banco D1 Free limita cada banco a 500 MB e tem limites de consultas e gravações. Ao atingir a cota, o serviço pode parar; não habilitar Workers Paid para tentar esconder esse limite. Não usamos R2, que pode ter cobrança excedente. Fotos comprimidas são guardadas no D1 e vinculadas às análises e ao EAN/código interno das contagens. As fotos antigas continuam no sistema da Netlify e não são migradas automaticamente.

A chave é um segredo de servidor e não deve entrar em arquivo público, GitHub, HTML, JavaScript do navegador ou chat. Não existe integração automática com a assinatura pessoal do aplicativo Gemini.

## Publicar após autenticar

1. Criar repositório separado a partir desta adaptação, sem alterar `main` do aplicativo atual.
2. Na Cloudflare, confirmar conta e plano Workers Free. Criar banco D1 `mellu-inventario-livre`.
3. Substituir o UUID de exemplo em `wrangler.jsonc` pelo ID real do banco.
4. Aplicar `migrations/0001_objects.sql` ao banco remoto.
5. Configurar `GEMINI_API_KEY` como segredo no Worker, usando chave de projeto Free Tier confirmada no AI Studio.
6. Somente depois dessa confirmação, mudar `GEMINI_FREE_TIER_CONFIRMED` para `true`.
7. Publicar `npm run build` e `wrangler deploy` em novo endereço `workers.dev`. Não mudar o domínio da Netlify.
8. Conferir `/api/health`, câmera/múltiplas fotos, leitura real e envio de teste com verificação das duas abas antes de liberar para a operação.

## Desenvolvimento

```sh
npm ci
npm test
npm run build
npx wrangler d1 migrations apply mellu-inventario-livre --local
npx wrangler dev
```

O leitor convencional de barras roda no celular nas quatro orientações, evitando trabalho de CPU no servidor gratuito. A IA lê os rótulos e a validade; uma segunda leitura focada nos números recupera EAN ausente quando possível. Os campos continuam editáveis antes do envio.
