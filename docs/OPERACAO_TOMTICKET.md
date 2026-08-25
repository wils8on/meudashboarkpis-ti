# Operação da integração TomTicket

## Arquitetura e fluxo de dados

1. O workflow `.github/workflows/atualizar_dados.yml` roda a cada **20 minutos** ou por acionamento manual.
2. `scripts/sync-tomticket.mjs` pagina `GET /v2.0/ticket/list`, ordenado pela data de criação mais recente, e rejeita uma origem cuja última criação esteja defasada em mais de sete dias.
3. A sanitização remove os campos privados antes de atualizar `dados.json`. Esse é o único arquivo de chamados versionado e publicado com o site.
4. A cópia integral da listagem é gravada de forma privada no Firestore.
5. A camada incremental escolhe chamados novos, modificados ou ainda sem enriquecimento e consulta `GET /v2.0/ticket/detail`. O limite padrão é 20 detalhes por ciclo e pode ser ajustado com `TOMTICKET_DETAIL_LIMIT`.
6. Apenas mudanças relevantes geram snapshots. Dimensões, qualidade e métricas são recalculadas com a cobertura disponível.
7. O workflow testa o projeto, faz rebase e tenta publicar a base sanitizada até três vezes para tolerar concorrência entre sincronizações.

O navegador nunca recebe `TOMTICKET_TOKEN` nem `FIREBASE_SERVICE_ACCOUNT`. Esses valores existem somente como GitHub Actions Secrets. Não os inclua em arquivos, logs, capturas ou chamados de suporte.

## Persistência

| Coleção/documento | Finalidade |
| --- | --- |
| `tomticket_private/meta` e blocos privados | Cópia integral da listagem para usuários autenticados |
| `tomticket_private/metrics` | Agregado enriquecido consumido pelo painel |
| `tomticket_tickets` | Estado normalizado mais recente de cada chamado enriquecido |
| `tomticket_ticket_snapshots` | Histórico imutável quando o estado relevante muda |
| `tomticket_sync_state` | Índices incrementais, fatos métricos e histórico diário |
| `tomticket_sync_runs` | Duração, volumes, tentativas, erros e resultado de cada execução |
| `tomticket_dim_*` | Departamentos, categorias, operadores e demais dimensões |
| `tomticket_quality_reports` | Inconsistências detectadas por execução |

Não apague a base anterior antes de uma coleta. Uma falha de API, token vencido ou Firestore indisponível faz a execução falhar ou limita somente a camada incremental; os dados já publicados são preservados. O painel deve continuar exibindo a última base válida e identificar sua data/hora.

## Cobertura progressiva

A listagem fornece a visão ampla; alguns campos, como SLA, primeira resposta, interações, avaliação e tempo trabalhado, exigem o detalhe. Por isso, métricas enriquecidas exibem `enriched / total` e a taxa de cobertura. A cobertura cresce a cada ciclo e pode avançar mais lentamente quando há novos chamados ou alterações prioritárias.

Uma métrica de detalhe não deve ser interpretada como representativa de toda a base enquanto a cobertura for baixa. Alertas que dependem desses campos têm amostra mínima ou cobertura mínima configurável.

## Definições gerenciais

- **Backlog total:** chamados sem data de conclusão.
- **Backlog acionável pela TI:** chamados abertos classificados em estados cuja próxima ação pertence à TI.
- **Aguardando cliente / em espera / outros:** separação gerencial definida em `config/backlog-status-map.json`. Um status novo começa em `outros` até ser classificado.
- **Entrada × saída:** aberturas e conclusões no mesmo intervalo. O saldo é `entradas - saídas`; positivo aumenta o backlog e negativo reduz.
- **Velocidade de movimentação:** mudanças observadas no backlog dentro do período e da cobertura histórica disponível.
- **Crescimento/redução:** saldo acumulado da entrada menos a saída; o card e o gráfico usam a mesma convenção de sinal.
- **SLA:** taxa de itens elegíveis marcados como cumpridos, separando inicialização e deadline.
- **Primeira resposta:** média e mediana entre criação e primeira resposta válida.
- **Aging/staleness:** tempo desde a última movimentação dos chamados ainda abertos; faixas de 4 h, 8 h, 24 h e 72 h.
- **Tempo trabalhado:** horas registradas pelo TomTicket. A razão efetiva compara tempo trabalhado com tempo corrido somente em registros elegíveis.
- **Interações:** total e média de interações; `high touch` considera mais de dez.
- **CSAT:** média das notas válidas de 1 a 5, taxa de resposta entre concluídos e indicação de problema resolvido.
- **Tendência dimensional:** compara os últimos 30 dias com os 30 dias anteriores por departamento, categoria, operador e prioridade.

Os limites e regras de alertas ficam em `config/operational-alerts.json`. Ajustes devem ser revisados com o responsável da operação e validados por `npm test`.

Administradores podem alterar esses limites no menu **Metas e Alertas**. A tela grava a configuração ativa em `tomticket_config/operational_alerts` e cada mudança em `tomticket_config_history`. A sincronização prioriza a configuração administrativa remota e conserva `config/operational-alerts.json` como fallback. As alterações passam a valer no cálculo realizado pela sincronização seguinte.

## Qualidade, observabilidade e recuperação

Antes de confiar em um indicador, confira no painel:

- data e hora da última sincronização;
- data do chamado mais recente retornado;
- quantidade de registros;
- cobertura enriquecida;
- resultado da última execução e relatório de qualidade.

O cliente de detalhes repete falhas transitórias de rede e respostas HTTP 429/5xx, respeitando `Retry-After` quando disponível, com no máximo três tentativas. Erros permanentes são registrados e não devem provocar a exclusão do histórico.

### Procedimento de incidente

1. Consulte a execução mais recente de **Atualizar dados do TomTicket** no GitHub Actions.
2. Se houver 401/403, valide os segredos `TOMTICKET_TOKEN` e `FIREBASE_SERVICE_ACCOUNT`, o escopo do token e o projeto Firebase, sem expor seus conteúdos.
3. Se a origem for rejeitada como defasada, confirme no TomTicket se existem chamados recentes acessíveis à conta e se o token pertence ao ambiente correto.
4. Em 429/5xx, aguarde a tentativa automática; se persistir, preserve a base atual e verifique o estado do fornecedor.
5. Se apenas o enriquecimento falhar, a listagem sanitizada e a cópia privada atual ainda são preservadas. Corrija a causa e execute o workflow novamente; o índice incremental retoma os candidatos pendentes.
6. Após a recuperação, confirme registros, data/hora, cobertura, erros, snapshots e qualidade no painel.

Não edite `dados.json` manualmente para simular recuperação e não remova coleções para forçar uma carga completa. Uma reconstrução deve ser planejada, ter backup e ocorrer fora do ciclo automático.

## Checklist de mudança

1. Atualize testes ao alterar normalização, diff, qualidade ou fórmulas.
2. Execute `npm test`, `npm run check` e `git diff --check`.
3. Não publique PII no `dados.json` nem segredos no código.
4. Valide desktop, tablet e celular, inclusive tabelas com rolagem interna.
5. Após publicar, confira GitHub Pages e uma sincronização real antes de considerar a mudança concluída.

