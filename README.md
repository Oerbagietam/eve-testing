# EVE

Aplicação desktop (Electron) para registrar testes manuais de QA, acompanhar progresso e gerar relatórios locais (HTML, PDF, Markdown, DOCX).

Tudo é armazenado localmente — sem servidores, sem cadastros, sem dependências externas.

## Requisitos

- Node.js 18+
- npm

## Desenvolvimento

```bash
npm install
npm run dev
```

## Build

```bash
npm run build:win   # Windows
npm run build:mac   # macOS
npm run build:linux # Linux
```

## Dados

Os dados ficam em `%APPDATA%/eve/eve/` (Windows) ou equivalente no sistema:

- `data.json` — testes
- `attachments/` — imagens e vídeos
- `reports/` — relatórios exportados
- `backups/` — backups automáticos

## Funcionalidades

- Criar e editar testes com cenários, erros, sugestões, observações e pontos de atenção
- Cronômetro (iniciar / pausar / concluir)
- Templates de cenários (padrão + customizados)
- Histórico com filtros e paginação
- Relatório de período (diário / semanal / mensal)
- Importação de JSON do Cypress
- Exportação HTML, PDF, Markdown e DOCX

## Tema

Interface inspirada no Windows XP Luna (azul Bliss, Tahoma).

## Licença

[MIT](./LICENSE)
