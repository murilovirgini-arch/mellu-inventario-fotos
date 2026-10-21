# MelLu — inventário por fotos

Versão independente de inventário com análise de até seis fotos de uma embalagem, quantidade e localização.

## Publicação

O branch `main` está conectado ao projeto Netlify `mellu-inventario-fotos`. Cada commit dispara o build `npm run build`, publica `public` e instala as funções de `netlify/functions`.

## Dados

As fotos reduzidas e os registros são armazenados no Netlify Blobs e vinculados ao EAN. A galeria permite consultar as imagens por código. Cada nova contagem recebe um identificador próprio; tentativas de reenviar a mesma contagem reutilizam o identificador.

A integração dedicada do Apps Script grava em Página1 e Histórico de Correções App, incluindo localização. O aplicativo só confirma o envio após a confirmação das duas abas.

## IA e configuração

A função de análise usa Gemini por meio do Netlify AI Gateway. Opcionalmente aceita `MELLU_GEMINI_API_KEY` no servidor. `MELLU_SHEETS_URL` pode substituir o endpoint dedicado configurado no código. Nunca colocar chaves no navegador ou no repositório.

A versão anterior permanece em https://mellu-inventario-work.netlify.app/ como contingência.
