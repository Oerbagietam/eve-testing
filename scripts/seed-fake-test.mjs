#!/usr/bin/env node
/**
 * Seed de um teste fake totalmente preenchido para o EVE.
 *
 * Insere (ou atualiza) um teste de exemplo em `data.json` com:
 *  - Cenários testados (com IDs estáveis)
 *  - Erros vinculados a cenários (com descrição detalhada)
 *  - Observações
 *  - Pontos de atenção
 *  - Sugestões de melhoria (comments)
 *  - Usuários de teste, branches, link de atividade, tempos, etc.
 *
 * Uso:
 *   node scripts/seed-fake-test.mjs              # cria/atualiza o teste fake
 *   node scripts/seed-fake-test.mjs --remove     # remove o teste fake
 *   node scripts/seed-fake-test.mjs --data-dir <path>  # força um diretório
 *
 * O teste fake usa o ID fixo `00000000-0000-4000-8000-000000000001`,
 * portanto rodar o script múltiplas vezes não cria duplicatas.
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import process from "node:process";

const APP_NAME = "eve";
const LEGACY_APP_NAME = "qa-lite";
const FAKE_TEST_ID = "00000000-0000-4000-8000-000000000001";

const SCENARIO_IDS = {
  acesso: "11111111-1111-4111-8111-111111111111",
  obrigatorios: "22222222-2222-4222-8222-222222222222",
  fluxo: "33333333-3333-4333-8333-333333333333",
  mensagens: "44444444-4444-4444-8444-444444444444",
  responsivo: "55555555-5555-4555-8555-555555555555",
  integracao: "66666666-6666-4666-8666-666666666666",
};

function parseArgs(argv) {
  const args = { remove: false, dataDir: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--remove" || a === "-r") args.remove = true;
    else if (a === "--data-dir" && argv[i + 1]) {
      args.dataDir = argv[++i];
    }
  }
  return args;
}

function appDataDir(appName) {
  const platform = process.platform;
  let root;
  if (platform === "win32") {
    const base = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    root = path.join(base, appName);
  } else if (platform === "darwin") {
    root = path.join(os.homedir(), "Library", "Application Support", appName);
  } else {
    const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
    root = path.join(base, appName);
  }
  return path.join(root, appName);
}

function resolveDataDir(overrideDir) {
  if (overrideDir) return path.resolve(overrideDir);

  const primary = appDataDir(APP_NAME);
  if (fs.existsSync(path.join(primary, "data.json"))) return primary;

  const legacy = appDataDir(LEGACY_APP_NAME);
  if (fs.existsSync(path.join(legacy, "data.json"))) return legacy;

  return primary;
}

async function readStore(file) {
  if (!fs.existsSync(file)) return { tests: [], settings: {} };
  try {
    const raw = await fsp.readFile(file, "utf8");
    const data = JSON.parse(raw);
    if (!Array.isArray(data.tests)) data.tests = [];
    if (!data.settings) data.settings = {};
    return data;
  } catch (err) {
    throw new Error(`data.json corrompido: ${err.message}`);
  }
}

async function writeStore(file, store) {
  const dir = path.dirname(file);
  await fsp.mkdir(dir, { recursive: true });
  const tmp = file + ".tmp";
  await fsp.writeFile(tmp, JSON.stringify(store, null, 2));
  await fsp.rename(tmp, file);
}

function daysAgo(days) {
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

function hoursAgo(hours) {
  return Date.now() - hours * 60 * 60 * 1000;
}

function buildFakeTest() {
  const createdAt = daysAgo(2);
  const finishedAt = hoursAgo(1);

  return {
    id: FAKE_TEST_ID,
    title: "[EXEMPLO] Cadastro de cliente PJ — fluxo completo",
    description:
      "Validação ponta a ponta do novo formulário de cadastro de cliente Pessoa Jurídica.\n" +
      "Escopo: criação, edição, exclusão e validação de campos obrigatórios.\n" +
      "Ambiente: homologação (https://hml.exemplo.com.br).\n" +
      "Pré-condições: usuário com perfil 'Comercial' autenticado, base de testes resetada.",
    estimatedMinutes: 90,
    system: "Portal Comercial",
    branchFront: "feature/PJ-1234-cadastro-cliente",
    branchBack: "feature/PJ-1234-cadastro-cliente-api",
    branch: "feature/PJ-1234-cadastro-cliente",
    activityLink: "https://app.exemplo.com/tasks/PJ-1234",
    createdAt,
    status: "completed",
    elapsedMs: 1000 * 60 * 87,
    timeEntries: [
      { startedAt: createdAt + 1000 * 60 * 5, endedAt: createdAt + 1000 * 60 * 50 },
      { startedAt: createdAt + 1000 * 60 * 60, endedAt: createdAt + 1000 * 60 * 102 },
    ],
    lastStartedAt: null,
    finishedAt,
    validated: false,
    isNew: false,
    isPending: false,
    template: "default",
    testUsers: [
      { user: "qa.ana@exemplo.com" },
      { user: "qa.marina@exemplo.com" },
      { user: "comercial.junior@exemplo.com" },
    ],
    products: "",
    offersCodes: "",
    clients: "",
    orders: "",
    comments: [
      {
        at: createdAt + 1000 * 60 * 35,
        text:
          "Adicionar máscara automática no campo de CNPJ para reduzir erros de digitação.",
      },
      {
        at: createdAt + 1000 * 60 * 75,
        text:
          "Trocar o botão 'Salvar' por 'Salvar e continuar' quando houver mais de uma etapa pendente.",
      },
      {
        at: createdAt + 1000 * 60 * 90,
        text:
          "Exibir um resumo dos dados antes de confirmar o cadastro (passo de revisão).",
      },
      {
        at: finishedAt - 1000 * 60 * 10,
        text:
          "Permitir colar (paste) dados copiados da Receita Federal para preenchimento automático.",
      },
    ],
    points: [
      {
        id: SCENARIO_IDS.acesso,
        text: "Verificar se o módulo de cadastro PJ está acessível e carrega corretamente",
        images: [],        offerCode: "",
      },
      {
        id: SCENARIO_IDS.obrigatorios,
        text: "Validar campos obrigatórios (Razão Social, CNPJ, Inscrição Estadual, E-mail)",
        images: [],        offerCode: "",
      },
      {
        id: SCENARIO_IDS.fluxo,
        text: "Testar fluxo principal: criar, salvar e localizar o cliente recém-cadastrado",
        images: [],        offerCode: "",
      },
      {
        id: SCENARIO_IDS.mensagens,
        text: "Verificar mensagens de erro e sucesso em todas as ações",
        images: [],        offerCode: "",
      },
      {
        id: SCENARIO_IDS.responsivo,
        text: "Validar responsividade em desktop (1920x1080) e tablet (1024x768)",
        images: [],        offerCode: "",
      },
      {
        id: SCENARIO_IDS.integracao,
        text: "Testar integração com módulo de Pedidos (criar pedido para o cliente novo)",
        images: [],        offerCode: "",
      },
    ],
    errors: [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
        text: "Validação de CNPJ aceita números com dígito verificador inválido",
        detailedDescription:
          "Passos para reproduzir:\n" +
          "1. Acessar o módulo de cadastro PJ\n" +
          "2. Informar o CNPJ '11.111.111/1111-11' (dígito inválido)\n" +
          "3. Clicar em 'Salvar'\n\n" +
          "Resultado esperado: mensagem 'CNPJ inválido' e bloqueio do cadastro.\n" +
          "Resultado obtido: cadastro salvo com sucesso, sem qualquer validação.",
        at: createdAt + 1000 * 60 * 22,
        images: [],        scenarioId: SCENARIO_IDS.obrigatorios,
      },
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
        text: "Mensagem de sucesso desaparece antes de ser lida (toast com 800ms)",
        detailedDescription:
          "O toast 'Cliente cadastrado com sucesso' some em ~800ms, o que é insuficiente para leitura.\n" +
          "Sugestão: aumentar a duração para 4s ou exigir fechamento manual.",
        at: createdAt + 1000 * 60 * 48,
        images: [],        scenarioId: SCENARIO_IDS.mensagens,
      },
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
        text: "Erro 500 ao criar pedido para o cliente recém-cadastrado",
        detailedDescription:
          "Após cadastrar o cliente, ao tentar abrir um pedido para ele, a API retorna:\n" +
          "POST /api/orders -> 500 { code: 'CUSTOMER_NOT_INDEXED' }\n\n" +
          "Hipótese: a indexação do cliente no serviço de busca é assíncrona e o front\n" +
          "não está aguardando a confirmação antes de liberar o fluxo de pedidos.",
        at: createdAt + 1000 * 60 * 81,
        images: [],        scenarioId: SCENARIO_IDS.integracao,
      },
    ],
    observations: [
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
        text:
          "O carregamento inicial do módulo levou ~3.2s — aceitável, mas perceptível. " +
          "Vale acompanhar se piora com mais dados em produção.",
        at: createdAt + 1000 * 60 * 8,
        images: [],        scenarioId: SCENARIO_IDS.acesso,
      },
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2",
        text:
          "A label 'Inscrição Estadual' está com tamanho diferente das outras labels do formulário. " +
          "Não é bug funcional, mas quebra a consistência visual.",
        at: createdAt + 1000 * 60 * 30,
        images: [],        scenarioId: SCENARIO_IDS.obrigatorios,
      },
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3",
        text:
          "Em tablet (1024x768) o botão 'Salvar' fica colado ao 'Cancelar'. " +
          "Recomendado aumentar o espaçamento horizontal para evitar cliques acidentais.",
        at: createdAt + 1000 * 60 * 64,
        images: [],        scenarioId: SCENARIO_IDS.responsivo,
      },
    ],
    attentionPoints: [
      {
        id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
        text:
          "Campo 'Razão Social' aceita até 255 caracteres no front, mas o banco trunca em 120. " +
          "Não gera erro visível, porém os dados são perdidos silenciosamente.",
        at: createdAt + 1000 * 60 * 26,
        images: [],        scenarioId: SCENARIO_IDS.obrigatorios,
      },
      {
        id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc2",
        text:
          "Não existe confirmação ao excluir um cliente. Um clique no ícone de lixeira já remove o registro. " +
          "Considerar adicionar modal de confirmação para evitar exclusões acidentais.",
        at: createdAt + 1000 * 60 * 55,
        images: [],        scenarioId: SCENARIO_IDS.fluxo,
      },
    ],
    attachments: [],
    errorAttachments: [],
  };
}

function upsertTest(store, test) {
  const idx = store.tests.findIndex((t) => t.id === test.id);
  if (idx >= 0) {
    store.tests[idx] = test;
    return "updated";
  }
  store.tests.push(test);
  return "created";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dataDir = resolveDataDir(args.dataDir);
  const dataFile = path.join(dataDir, "data.json");

  console.log(`[seed-fake-test] data dir: ${dataDir}`);
  console.log(`[seed-fake-test] data file: ${dataFile}`);

  const store = await readStore(dataFile);

  if (args.remove) {
    const before = store.tests.length;
    store.tests = store.tests.filter((t) => t.id !== FAKE_TEST_ID);
    const removed = before - store.tests.length;
    await writeStore(dataFile, store);
    console.log(
      removed > 0
        ? `[seed-fake-test] teste fake removido (id=${FAKE_TEST_ID}).`
        : "[seed-fake-test] nenhum teste fake encontrado para remover."
    );
    return;
  }

  const test = buildFakeTest();
  const action = upsertTest(store, test);
  await writeStore(dataFile, store);

  console.log(`[seed-fake-test] teste fake ${action} com sucesso.`);
  console.log(`[seed-fake-test] título: "${test.title}"`);
  console.log(
    `[seed-fake-test] cenários: ${test.points.length} | erros: ${test.errors.length} | observações: ${test.observations.length} | pontos de atenção: ${test.attentionPoints.length} | sugestões: ${test.comments.length}`
  );
  console.log("[seed-fake-test] abra o EVE e gere o relatório (HTML/PDF/MD) para ver o exemplo.");
}

main().catch((err) => {
  console.error("[seed-fake-test] erro:", err);
  process.exitCode = 1;
});
