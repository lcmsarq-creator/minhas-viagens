# Implantação — expansão para 86 rotas icônicas

Branch de trabalho para concluir as 42 novas rotas e os novos emblemas internacionais sem alterar `main` antes da validação integral.

## Critério de publicação

- 86/86 rotas com geometria válida.
- Nenhuma rota com comprimento zero ou geometria vazia.
- Bundle/catálogo reconstruído e validado.
- Novos emblemas internacionais integrados, preservando os existentes.
- Testes de regressão do catálogo, preview e progresso aprovados.

## Bloqueio conhecido

- Estrada-Parque Morro do Diabo: revisar/corrigir a geometria antes da reconstrução do bundle.

## Emblemas

A implantação deve reutilizar o resolvedor internacional existente, acrescentando os novos países sem regressão do Brasil, Uruguai ou emblemas Via Panamericana já existentes.
