# Painel de KPIs de TI

Painel operacional para acompanhar chamados do TomTicket, backlog, SLA, aging, clientes, soluções desenvolvidas e indicadores de capacidade. A interface é uma aplicação web estática; a coleta é executada no GitHub Actions e a camada sensível permanece no Firestore.

## Visão rápida

- Atualização automática a cada **20 minutos** e execução manual pelo GitHub Actions.
- `dados.json` contém somente o conjunto sanitizado usado pelos indicadores públicos.
- Chamados completos, snapshots, dimensões, qualidade e métricas enriquecidas ficam no Firestore.
- Se a API ou a credencial falhar, a execução é interrompida antes da publicação: a última base válida continua disponível.
- O endpoint de detalhe é processado progressivamente, por padrão em lotes de 20 chamados por ciclo.
- A interface informa data/hora da sincronização, período dos dados e cobertura da amostra enriquecida.

## Desenvolvimento local

O projeto não exige etapa de compilação. Sirva a raiz com um servidor HTTP local e abra `index.html`.

```powershell
npm test
npm run check
```

Nunca salve tokens ou credenciais no repositório. A automação utiliza os segredos `TOMTICKET_TOKEN` e `FIREBASE_SERVICE_ACCOUNT`.

## Configuração

- Classificação gerencial do backlog: [`config/backlog-status-map.json`](config/backlog-status-map.json)
- Limites dos alertas: menu administrativo **Metas e Alertas**, persistido no Firestore; [`config/operational-alerts.json`](config/operational-alerts.json) é o fallback seguro
- Automação: [`.github/workflows/atualizar_dados.yml`](.github/workflows/atualizar_dados.yml)

O manual completo de arquitetura, indicadores e recuperação está em [`docs/OPERACAO_TOMTICKET.md`](docs/OPERACAO_TOMTICKET.md).

