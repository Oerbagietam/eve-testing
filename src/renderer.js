import {
  showAppAlert,
  showAppConfirm,
} from './js/ui/app-dialog.js';
import { createLazyImageElement } from './js/ui/lazy-image.js';
import {
  getPrefilledPoints,
  getTemplateScenarios,
  getTemplateInfo,
  getAllCustomTemplates,
  createCustomTemplate,
  updateCustomTemplate,
  deleteCustomTemplate,
} from './js/services/template-scenarios.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// Captura erros não tratados para facilitar diagnóstico em dev
window.addEventListener('error', (e) => {
  console.error('[unhandled error]', e.message, 'at', e.filename + ':' + e.lineno + ':' + e.colno, e.error?.stack || '');
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[unhandled promise rejection]', e.reason?.message || e.reason, e.reason?.stack || '');
});

// Inicializa ícones Lucide quando o DOM estiver pronto
function initIcons() {}

// Gerencia o tema (claro/escuro), persistindo em localStorage.
const THEME_STORAGE_KEY = 'eveTheme';
const VALID_THEMES = new Set(['dark', 'light']);

function getCurrentTheme() {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  return VALID_THEMES.has(saved) ? saved : 'dark';
}

function applyTheme(theme) {
  const next = VALID_THEMES.has(theme) ? theme : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch (e) {
    console.warn('[theme] falha ao salvar tema', e);
  }
  syncThemeControls(next);
}

function syncThemeControls(theme) {
  const btn = document.getElementById('themeToggleBtn');
  if (btn) {
    const label = theme === 'light' ? 'Alternar para tema escuro' : 'Alternar para tema claro';
    btn.setAttribute('aria-label', label);
    btn.setAttribute('title', label);
  }
  document
    .querySelectorAll('input[name="appTheme"]')
    .forEach((input) => {
      input.checked = input.value === theme;
    });
}

function initTheme() {
  const current = getCurrentTheme();
  applyTheme(current);

  document.getElementById('themeToggleBtn')?.addEventListener('click', () => {
    const next = getCurrentTheme() === 'light' ? 'dark' : 'light';
    applyTheme(next);
  });

  document
    .querySelectorAll('input[name="appTheme"]')
    .forEach((input) => {
      input.addEventListener('change', (e) => {
        if (e.target.checked) applyTheme(e.target.value);
      });
    });
}

// Liga os botões customizados do titlebar (minimizar/maximizar/fechar) à API IPC.
function initWindowControls() {
  const winApi = window.api?.window;
  if (!winApi) return;

  const titlebar = document.querySelector('.xp-titlebar');
  const minBtn = document.getElementById('winMinimizeBtn');
  const maxBtn = document.getElementById('winMaximizeBtn');
  const closeBtn = document.getElementById('winCloseBtn');

  const applyMaxState = (isMaximized) => {
    if (!titlebar) return;
    titlebar.classList.toggle('is-maximized', !!isMaximized);
    if (maxBtn) {
      maxBtn.setAttribute('aria-label', isMaximized ? 'Restaurar' : 'Maximizar');
      maxBtn.setAttribute('title', isMaximized ? 'Restaurar' : 'Maximizar');
    }
  };

  minBtn?.addEventListener('click', () => winApi.minimize());
  maxBtn?.addEventListener('click', async () => {
    const maximized = await winApi.toggleMaximize();
    applyMaxState(maximized);
  });
  closeBtn?.addEventListener('click', () => winApi.close());

  winApi.onMaximizeChanged?.(applyMaxState);
  winApi.isMaximized?.().then(applyMaxState).catch(() => {});
}

// Inicializa ícones quando o DOM estiver carregado
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initIcons();
    initWindowControls();
    initTheme();
  });
} else {
  initIcons();
  initWindowControls();
  initTheme();
}

let store = { tests: [] };
let tickInterval = null;
let detailColsHandler = null;
const state = { page: 1 };
let activeImageField = 'attachments'; // 'attachments' ou 'errorAttachments'
let activeErrorIndex = null; // Índice do erro ativo para colar imagens diretamente
let activePointIndex = null; // Índice do cenário testado ativo para colar imagens diretamente
let activeAttentionPointIndex = null; // Índice do ponto de atenção ativo para colar imagens diretamente
let activeObservationIndex = null; // Índice da observação ativa para colar imagens diretamente
let currentDetailPage = 'general';
let currentDetailTest = null;
let currentTemplate = 'default';
const TIME_ENTRY_MIN_DURATION_MS = 60 * 1000;
let currentPeriodReportPayload = null;

function addTrashIcon(btn) {
  if (!btn) return;
  if (!btn.textContent || btn.textContent.trim() === '') {
    btn.textContent = 'Remover';
  }
}

/**
 * Cria um botão de remover com ícone de lixeira
 */
function createRemoveButton(onClick, title = 'Remover') {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'icon-btn';
  btn.title = title;
  btn.textContent = 'Remover';
  btn.onclick = onClick;
  return btn;
}

/**
 * Adiciona ícone de lixeira a um botão existente
 */
/**
 * Obtém a URL da imagem (S3 se disponível, senão local)
 */
function getImageUrl(_test, imagePath) {
  return `file://${imagePath}`;
}

/**
 * Atualiza o mapeamento S3 de uma imagem no teste
 */
function combineBranches(branchFront, branchBack) {
  const front = (branchFront || '').trim();
  const back = (branchBack || '').trim();
  if (front && back) return `${front} | ${back}`;
  return front || back || '';
}

function formatBranches(test) {
  if (!test) return '';
  const front = (test.branchFront || '').trim();
  const back = (test.branchBack || '').trim();
  if (front && back) return `Front: ${front} | Back: ${back}`;
  if (front) return `Front: ${front}`;
  if (back) return `Back: ${back}`;
  const legacy = (test.branch || '').trim();
  return legacy;
}

// Funções auxiliares para reduzir complexidade cognitiva
function migrateFailuresToErrors(test) {
  if (!test.failures || !Array.isArray(test.failures) || test.failures.length === 0) {
    return false;
  }
  if (!test.errors) test.errors = [];
  if (!test.observations) test.observations = [];
  test.failures.forEach(f => {
    test.errors.push(f);
  });
  delete test.failures;
  return true;
}

function ensureRequiredArrays(test) {
  if (!test.errors) test.errors = [];
  if (!test.observations) test.observations = [];
  // Manter errorAttachments para compatibilidade, mas usar attentionPoints como principal
  if (!test.errorAttachments) test.errorAttachments = [];
  if (!test.attentionPoints) test.attentionPoints = [];
}

function ensureIsPending(test) {
  if (test.isPending === undefined) {
    test.isPending = false;
    return true;
  }
  return false;
}

function ensureBranchFields(test) {
  let migrated = false;
  if (test.branchFront === undefined) {
    test.branchFront = test.branch || '';
    migrated = true;
  }
  if (test.branchBack === undefined) {
    test.branchBack = '';
    migrated = true;
  }
  return migrated;
}

function updateCombinedBranch(test) {
  const combinedBranch = combineBranches(test.branchFront, test.branchBack);
  if ((test.branch || '') !== combinedBranch) {
    test.branch = combinedBranch;
    return true;
  }
  return false;
}

function addImagesToOldErrors(test) {
  if (!test.errors || !Array.isArray(test.errors)) {
    return false;
  }
  let migrated = false;
  test.errors.forEach(e => {
    if (!e.images) {
      e.images = [];
      migrated = true;
    }
  });
  return migrated;
}

// Migrar errorAttachments antigos (array de strings) para attentionPoints (array de objetos)
function migrateErrorAttachmentsToAttentionPoints(test) {
  if (!test.attentionPoints) {
    test.attentionPoints = [];
  }

  // Se errorAttachments existe e é um array de strings, migrar para attentionPoints
  if (test.errorAttachments && Array.isArray(test.errorAttachments) && test.errorAttachments.length > 0) {
    const firstItem = test.errorAttachments[0];
    // Se é string, precisa migrar
    if (typeof firstItem === 'string') {
      test.errorAttachments.forEach((imgPath, idx) => {
        // Verificar se já não foi migrado (evitar duplicatas)
        const alreadyMigrated = test.attentionPoints.some(ap =>
          ap.images && ap.images.length === 1 && ap.images[0] === imgPath
        );

        if (!alreadyMigrated) {
          test.attentionPoints.push({
            id: crypto.randomUUID(),
            text: `Ponto de atenção ${test.attentionPoints.length + 1}`,
            at: Date.now(),
            images: [imgPath],
            scenarioId: null
          });
        }
      });
      // Limpar errorAttachments antigo após migração
      test.errorAttachments = [];
      return true;
    }
  }

  // Garantir que todos os attentionPoints tenham estrutura completa
  let migrated = false;
  if (test.attentionPoints && test.attentionPoints.length > 0) {
    test.attentionPoints.forEach(ap => {
      if (!ap.id) {
        ap.id = crypto.randomUUID();
        migrated = true;
      }
      if (!ap.images) {
        ap.images = [];
        migrated = true;
      }
      if (ap.scenarioId === undefined) {
        ap.scenarioId = null;
        migrated = true;
      }
    });
  }

  return migrated;
}

function migrateTest(test) {
  let needsMigration = false;

  // Garantir que os novos campos existam (compatibilidade com testes antigos)
  if (test.testUsers === undefined) {
    if (test.testUser !== undefined) {
      test.testUsers = [];
      if (test.testUser) test.testUsers.push({ user: test.testUser });
      delete test.testUser;
      delete test.priceType;
      needsMigration = true;
    } else {
      test.testUsers = [];
      needsMigration = true;
    }
  }
  if (test.products === undefined) {
    test.products = '';
    needsMigration = true;
  }
  if (test.offersCodes === undefined) {
    test.offersCodes = '';
    needsMigration = true;
  }
  if (test.clients === undefined) {
    test.clients = '';
    needsMigration = true;
  }
  if (test.orders === undefined) {
    test.orders = '';
    needsMigration = true;
  }
  if (!Array.isArray(test.timeEntries)) {
    test.timeEntries = [];
    needsMigration = true;
  }

  // Migrar template (testes antigos não têm template, usar 'default' ou inferir de 'offers' se tiver produtos/ofertas)
  if (test.template === undefined) {
    // Se o teste tem produtos ou ofertas preenchidos, provavelmente era do template offers
    if (test.products || test.offersCodes) {
      test.template = 'offers';
    } else if (test.clients || test.orders) {
      test.template = 'televendas';
    } else {
      test.template = 'default';
    }
    needsMigration = true;
  }

  // Migrar points de string[] para objeto[]
  if (test.points && test.points.length > 0) {
    const firstPoint = test.points[0];
    if (typeof firstPoint === 'string') {
      test.points = test.points.map(text => ({
        id: crypto.randomUUID(),
        text: text,
        images: [],
        offerCode: ''
      }));
      needsMigration = true;
    } else {
      test.points = test.points.map(point => ({
        ...point,
        id: point.id || crypto.randomUUID(),
        offerCode: point.offerCode || ''
      }));
      if (test.points.some(p => !p.offerCode && p.offerCode !== '')) {
        needsMigration = true;
      }
    }
  }

  needsMigration = migrateFailuresToErrors(test) || needsMigration;
  ensureRequiredArrays(test);

  if (test.errors && test.errors.length > 0) {
    test.errors.forEach(error => {
      if (!error.id) {
        error.id = crypto.randomUUID();
        needsMigration = true;
      }
    });
  }

  // Migrar observações para incluir ID e estrutura completa
  if (test.observations && test.observations.length > 0) {
    test.observations.forEach(obs => {
      if (!obs.id) {
        obs.id = crypto.randomUUID();
        needsMigration = true;
      }
      if (!obs.images) {
        obs.images = [];
        needsMigration = true;
      }
      if (obs.scenarioId === undefined) {
        obs.scenarioId = null;
        needsMigration = true;
      }
      // Remover errorAttachmentIndex antigo se existir (não usado mais)
      if (obs.errorAttachmentIndex !== undefined && obs.errorAttachmentIndex !== null) {
        delete obs.errorAttachmentIndex;
        needsMigration = true;
      }
    });
  }

  needsMigration = ensureIsPending(test) || needsMigration;
  needsMigration = ensureBranchFields(test) || needsMigration;
  needsMigration = updateCombinedBranch(test) || needsMigration;
  needsMigration = addImagesToOldErrors(test) || needsMigration;

  // Migrar errorAttachments antigos (array de strings) para attentionPoints (array de objetos)
  needsMigration = migrateErrorAttachmentsToAttentionPoints(test) || needsMigration;

  return needsMigration;
}

function normalizeTimeEntries(test) {
  if (!Array.isArray(test.timeEntries)) test.timeEntries = [];
  test.timeEntries = test.timeEntries
    .map((entry) => ({
      startAt: Number(entry?.startAt) || null,
      endAt: entry?.endAt === null || entry?.endAt === undefined ? null : Number(entry.endAt)
    }))
    .filter((entry) => entry.startAt)
    .sort((a, b) => a.startAt - b.startAt);
}

function getOpenTimeEntry(test) {
  normalizeTimeEntries(test);
  return test.timeEntries.find((entry) => entry.startAt && !entry.endAt) || null;
}

function openTimeEntry(test, startAt = Date.now()) {
  normalizeTimeEntries(test);
  if (!getOpenTimeEntry(test)) {
    test.timeEntries.push({ startAt, endAt: null });
  }
}

function closeOpenTimeEntry(test, endAt = Date.now()) {
  const openEntry = getOpenTimeEntry(test);
  if (!openEntry) return;
  openEntry.endAt = Math.max(openEntry.startAt, endAt);
}

function getElapsedMs(test) {
  normalizeTimeEntries(test);
  const now = Date.now();
  let total = 0;
  test.timeEntries.forEach((entry) => {
    const endAt = entry.endAt ?? now;
    if (entry.startAt && endAt >= entry.startAt) {
      total += (endAt - entry.startAt);
    }
  });
  if (!total && typeof test.elapsedMs === 'number' && test.elapsedMs > 0) {
    total = test.elapsedMs;
  }
  return total;
}

function toDateTimeLocalValue(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const local = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
  return local.toISOString().slice(0, 16);
}

function fromDateTimeLocalValue(value) {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDateTimeDisplay(timestamp) {
  if (!timestamp) return '—';
  return new Date(timestamp).toLocaleString('pt-BR');
}

async function load() {
  store = await globalThis.api.getStore();
  if (!store.tests) store.tests = [];

  // Migração: converter failures antigos para errors e observations
  let needsMigration = false;
  store.tests.forEach(t => {
    const testNeedsMigration = migrateTest(t);
    needsMigration = testNeedsMigration || needsMigration;
  });
  if (needsMigration) {
    await flushSave(); // Salvar migração
  }

  loadFilters();
  if ($('#reportDateFrom') && !$('#reportDateFrom').value) {
    const firstDay = new Date();
    firstDay.setDate(1);
    $('#reportDateFrom').value = firstDay.toISOString().slice(0, 10);
  }
  if ($('#reportDateTo') && !$('#reportDateTo').value) {
    $('#reportDateTo').value = new Date().toISOString().slice(0, 10);
  }
  updatePendingStatus(); // Verificar status pendente ao carregar
  renderList();
  currentPeriodReportPayload = buildPeriodReportPayload();
  renderPeriodReportPreview(currentPeriodReportPayload);
  startTicker();

  // Auto-expand textareas
  setupAutoExpand();

  // Listener único para ações no modal de detalhes (evita múltiplas execuções)
  if (!detailColsHandler) {
    detailColsHandler = async (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const modal = $('#detailModal');
      const id = modal.dataset.id;
      const t = store.tests.find(x => x.id === id);
      if (!t) return;
      const act = btn.dataset.act;

      // Buscar elementos nas páginas ativas
      const root = document; // Buscar em todo o documento já que as páginas podem estar ocultas

      if (act === 'addComment') {
        const el = $('.comment-input');
        if (el) {
          addComment(t, el.value);
          el.value = '';
          el.focus();
        }
      }
      if (act === 'addPoint') {
        const el = $('.point-input');
        if (el) {
          addPoint(t, el.value);
          el.value = '';
          el.focus();
        }
      }
      if (act === 'addError') {
        const el = $('.error-input');
        const scenarioSelect = $('.error-scenario-select');
        if (el) {
          const scenarioId = scenarioSelect?.value || null;
          addError(t, el.value, [], scenarioId);
          el.value = '';
          if (scenarioSelect) scenarioSelect.value = '';
          el.focus();
        }
      }
      if (act === 'addObservation') {
        const el = $('.observation-input');
        const scenarioSelect = $('.observation-scenario-select');
        if (el) {
          const scenarioId = scenarioSelect?.value || null;
          addObservation(t, el.value, [], scenarioId);
          el.value = '';
          if (scenarioSelect) scenarioSelect.value = '';
          el.focus();
        }
      }
      if (act === 'addAttentionPoint') {
        const el = $('.attention-point-input');
        const scenarioSelect = $('.attention-point-scenario-select');
        if (el) {
          const scenarioId = scenarioSelect?.value || null;
          addAttentionPoint(t, el.value, [], scenarioId);
          el.value = '';
          if (scenarioSelect) scenarioSelect.value = '';
          el.focus();
        }
      }
      if (act === 'addImages') { await addImages(t); }
      if (act === 'addErrorImages') { await addErrorImages(t); }
      if (act === 'saveTestInfo') { saveTestInfoFromDetail(t); }
      if (act === 'addTestUser') { addTestUser(t); }
      if (act === 'addTimeEntry') { addTimeEntryFromDetail(t); }
      if (act === 'removeTestUser') {
        const idx = parseInt(btn.dataset.index);
        removeTestUser(t, idx);
      }
      if (act === 'removeTimeEntry') {
        const idx = parseInt(btn.dataset.index);
        removeTimeEntry(t, idx);
      }
    };
    document.addEventListener('click', detailColsHandler);
  }
}

function setupAutoExpand() {
  const autoExpand = (el) => {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  };
  document.addEventListener('input', (e) => {
    if (e.target.classList.contains('auto-expand')) {
      autoExpand(e.target);
    }
  });
  // Aplica na inicialização
  setTimeout(() => {
    $$('.auto-expand').forEach(el => autoExpand(el));
  }, 100);
}

function startTicker() {
  stopTicker();
  if (document.hidden) return;
  tickInterval = setInterval(() => {
    updateProgressBars();
    updatePendingStatus();
  }, 1000);
}

function stopTicker() {
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopTicker();
  } else if (!tickInterval) {
    startTicker();
  }
});

// Atualiza status pendente para testes não concluídos após 1 dia
function updatePendingStatus() {
  const oneDayMs = 24 * 60 * 60 * 1000; // 1 dia em milissegundos
  const now = Date.now();

  // Early return: nada para reclassificar se nao ha testes elegiveis para mudar de estado
  const hasCandidate = store.tests.some(t => {
    if (t.status !== 'completed' && (now - t.createdAt) >= oneDayMs && !t.isPending) return true;
    if (t.status === 'completed' && t.isPending) return true;
    return false;
  });
  if (!hasCandidate) return;

  let needsSave = false;
  store.tests.forEach(t => {
    if (t.status !== 'completed' && (now - t.createdAt) >= oneDayMs) {
      if (!t.isPending) {
        t.isPending = true;
        t.isNew = false;
        needsSave = true;
      }
    } else if (t.status === 'completed' && t.isPending) {
      t.isPending = false;
      needsSave = true;
    }
  });

  if (needsSave) {
    save();
    renderNewTiles();
    renderList();
  }
}

const SAVE_DEBOUNCE_MS = 300;
let saveDebounceTimer = null;
let lastSaveError = null;

async function saveNow() {
  try {
    lastSaveError = null;
    const result = await globalThis.api.setStore(store);
    if (result && !result.ok) {
      const msg = result.error || 'Erro desconhecido';
      lastSaveError = msg;
      console.error('Erro ao salvar:', msg);
      return { ok: false, error: msg };
    }
    return { ok: true };
  } catch (error) {
    const msg = error.message || 'Erro desconhecido';
    lastSaveError = msg;
    console.error('Erro ao salvar store:', error);
    return { ok: false, error: msg };
  }
}

/** Agenda persistência em disco (coalesce de chamadas rápidas). */
function save() {
  if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(() => {
    saveDebounceTimer = null;
    void saveNow();
  }, SAVE_DEBOUNCE_MS);
}

/** Persistência imediata; use antes de exportação ou fechamento. */
async function flushSave() {
  if (saveDebounceTimer) {
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = null;
  }
  const result = await saveNow();
  if (!result.ok && lastSaveError) {
    alert('Erro ao salvar os dados: ' + lastSaveError);
  }
  return result;
}

$('#newTestBtn')?.addEventListener('click', () => openModal());

// Event listeners para modal de edição de templates
$('#closeTemplateEditor')?.addEventListener('click', closeTemplateEditor);
$('#saveTemplateBtn')?.addEventListener('click', saveTemplate);
$('#deleteTemplateBtn')?.addEventListener('click', () => {
  const id = $('#templateEditorId')?.value;
  if (id) deleteTemplate(id);
});
$('#createTemplateBtn')?.addEventListener('click', () => openTemplateEditor());
$('#addScenarioBtn')?.addEventListener('click', () => {
  const input = $('#newScenarioInput');
  const text = input.value.trim();
  if (text) {
    addScenarioToEditor(text);
    input.value = '';
    input.focus();
  }
});

// Adicionar cenário ao pressionar Enter no input
$('#newScenarioInput')?.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    $('#addScenarioBtn')?.click();
  }
});
$('#closeModal').addEventListener('click', closeModal);
$('#saveTest').addEventListener('click', saveTestFromModal);
const homeView = $('#homeView');
const historyView = $('#historyView');
const templatesView = $('#templatesView');
const reportsView = $('#reportsView');
$('#statusFilter').addEventListener('change', () => { saveFilters(); renderList(); });
$('#dateFrom').addEventListener('change', () => { saveFilters(); renderList(); });
$('#dateTo').addEventListener('change', () => { saveFilters(); renderList(); });
const textQuery = $('#textQuery');
if (textQuery) textQuery.addEventListener('input', () => { saveFilters(); renderList(); });
$('#reportDateFrom')?.addEventListener('change', () => {
  const payload = buildPeriodReportPayload();
  currentPeriodReportPayload = payload;
  renderPeriodReportPreview(payload);
});
$('#reportDateTo')?.addEventListener('change', () => {
  const payload = buildPeriodReportPayload();
  currentPeriodReportPayload = payload;
  renderPeriodReportPreview(payload);
});
$('#reportGrouping')?.addEventListener('change', () => {
  const payload = buildPeriodReportPayload();
  currentPeriodReportPayload = payload;
  renderPeriodReportPreview(payload);
});
$('#generatePeriodReportBtn')?.addEventListener('click', () => {
  const payload = buildPeriodReportPayload();
  currentPeriodReportPayload = payload;
  renderPeriodReportPreview(payload);
});
$('#openPeriodReportHtmlBtn')?.addEventListener('click', () => {
  const payload = currentPeriodReportPayload || buildPeriodReportPayload();
  currentPeriodReportPayload = payload;
  renderPeriodReportPreview(payload);

  const html = buildPeriodReportHtml(payload);
  const reportWindow = window.open('', '_blank');
  if (!reportWindow) {
    alert('Não foi possível abrir a janela de relatório HTML.');
    return;
  }
  reportWindow.document.open();
  reportWindow.document.write(html);
  reportWindow.document.close();
});
$('#openReportRepeatsDetailBtn')?.addEventListener('click', () => {
  openReportRepeatsDetailModal();
});
$('#reportRepeatsModalClose')?.addEventListener('click', closeReportRepeatsDetailModal);
$('#reportRepeatsModalOk')?.addEventListener('click', closeReportRepeatsDetailModal);
const prevPageBtn = $('#prevPage');
const nextPageBtn = $('#nextPage');
if (prevPageBtn && nextPageBtn) {
  prevPageBtn.addEventListener('click', () => { state.page = Math.max(1, state.page - 1); renderList(); });
  nextPageBtn.addEventListener('click', () => { state.page = state.page + 1; renderList(); });
}

// Sistema de navegação moderno
const pages = {
  home: { element: homeView, title: 'Início', navItem: document.querySelector('.nav-item[data-page="home"]') },
  templates: { element: templatesView, title: 'Templates', navItem: document.querySelector('.nav-item[data-page="templates"]') },
  history: { element: historyView, title: 'Histórico', navItem: document.querySelector('.nav-item[data-page="history"]') },
  reports: { element: reportsView, title: 'Relatórios', navItem: document.querySelector('.nav-item[data-page="reports"]') },
  settings: { element: $('#settingsView'), title: 'Configurações', navItem: document.querySelector('.nav-item[data-page="settings"]') },
};

let currentPage = 'home';

function navigateToPage(pageName) {
  // Esconde todas as páginas
  Object.values(pages).forEach(page => {
    if (page.element) {
      page.element.classList.remove('active');
      page.element.classList.add('hidden');
    }
  });

  // Remove active de todos os nav items
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
  });

  // Mostra a página selecionada
  if (pages[pageName] && pages[pageName].element) {
    pages[pageName].element.classList.remove('hidden');
    pages[pageName].element.classList.add('active');

    // Atualiza título da página
    const pageTitleEl = $('#pageTitle');
    if (pageTitleEl) {
      pageTitleEl.textContent = pages[pageName].title;
    }

    // Ativa o nav item correspondente
    if (pages[pageName].navItem) {
      pages[pageName].navItem.classList.add('active');
    }

    currentPage = pageName;

    // Ações específicas por página
    if (pageName === 'history') {
      renderList();
    } else if (pageName === 'reports') {
      const payload = buildPeriodReportPayload();
      currentPeriodReportPayload = payload;
      renderPeriodReportPreview(payload);
    } else if (pageName === 'templates') {
      renderTemplates();
    } else if (pageName === 'settings') {
      loadSystemsList();
    }
  }
}

// Renderizar templates com cenários pré-preenchidos
function renderTemplates() {
  const templatesGrid = $('#templatesGrid');
  if (!templatesGrid) return;

  // Templates padrão
  const defaultTemplates = [
    {
      id: 'default',
      name: 'Template Padrão',
      description: 'Cenários genéricos para testes funcionais',
      features: ['Campos básicos', 'Cenários pré-preenchidos', 'Erros e observações'],
      isCustom: false
    },
    {
      id: 'regression',
      name: 'Regressão',
      description: 'Smoke test e regressão',
      features: ['Fluxo crítico', 'Regressão adjacente', 'Logs e persistência'],
      isCustom: false
    },
    {
      id: 'api',
      name: 'API',
      description: 'Testes de API',
      features: ['Contrato HTTP', 'Erros 4xx/5xx', 'Auth e idempotência'],
      isCustom: false
    }
  ];

  // Carregar templates customizados
  const customTemplatesObj = getAllCustomTemplates();
  const customTemplates = Object.values(customTemplatesObj).map(t => ({
    id: t.id,
    name: t.name,
    description: t.description,
    features: [
      'Todos os campos básicos',
      'Cenários testados pré-preenchidos',
      'Erros e observações'
    ],
    isCustom: true
  }));

  // Combinar todos os templates
  const allTemplates = [...defaultTemplates, ...customTemplates];

  templatesGrid.innerHTML = '';

  // Botão para criar novo template
  const createCard = document.createElement('div');
  createCard.className = 'template-card card';
  createCard.style.cssText = 'padding:20px;cursor:pointer;transition:transform 0.2s;border:2px dashed var(--border);display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:300px;background:var(--card-hi)';
  createCard.innerHTML = `
    <i  style="width:48px;height:48px;color:var(--muted);margin-bottom:12px"></i>
    <h4 style="margin:0 0 8px;text-align:center">Criar Template</h4>
    <p class="muted" style="font-size:0.9em;margin:0 0 16px;text-align:center">Crie seu próprio template com cenários personalizados</p>
    <button class="btn small primary" data-action="create-template" style="width:100%">Novo Template</button>
  `;
  templatesGrid.appendChild(createCard);

  // Renderizar templates
  allTemplates.forEach(template => {
    const scenarios = getTemplateScenarios(template.id);
    const card = document.createElement('div');
    card.className = 'template-card card';
    card.setAttribute('data-template', template.id);
    card.style.cssText = 'padding:20px;cursor:pointer;transition:transform 0.2s;position:relative';

    // Botões de ação para templates customizados
    let actionsHtml = '';
    if (template.isCustom) {
      actionsHtml = `
        <div style="position:absolute;top:12px;right:12px;display:flex;gap:4px;z-index:10">
          <button class="icon-btn small" data-action="edit-template" data-template-id="${template.id}" title="Editar template" style="width:28px;height:28px;padding:0;display:flex;align-items:center;justify-content:center;background:var(--card-hi);border:1px solid var(--border);border-radius:6px">
            <i  style="width:14px;height:14px"></i>
          </button>
          <button class="icon-btn small" data-action="delete-template" data-template-id="${template.id}" title="Deletar template" style="width:28px;height:28px;padding:0;display:flex;align-items:center;justify-content:center;background:var(--card-hi);border:1px solid var(--border);border-radius:6px;color:var(--err)">
            <i  style="width:14px;height:14px"></i>
          </button>
        </div>
      `;
    }

    let scenariosHtml = '';
    if (scenarios.length > 0) {
      scenariosHtml = `
        <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
          <div style="font-size:0.75em;font-weight:600;color:var(--muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px">
            Cenários Pré-preenchidos (${scenarios.length})
          </div>
          <ul style="font-size:0.8em;color:var(--text);margin:0;padding-left:16px;list-style-type:disc;line-height:1.6">
            ${scenarios.slice(0, 4).map(s => `<li style="margin-bottom:4px">${escapeHtml(s.length > 60 ? s.substring(0, 60) + '...' : s)}</li>`).join('')}
            ${scenarios.length > 4 ? `<li style="color:var(--muted);font-style:italic">+${scenarios.length - 4} cenário(s) adicional(is)</li>` : ''}
          </ul>
        </div>
      `;
    }

    card.innerHTML = `
      ${actionsHtml}
      <h4 style="margin:0 0 8px;padding-right:${template.isCustom ? '60px' : '0'}">${escapeHtml(template.name)}</h4>
      <p class="muted" style="font-size:0.9em;margin:0 0 12px">${escapeHtml(template.description)}</p>
      <ul style="font-size:0.85em;color:#cbb7ff;margin:0;padding-left:20px">
        ${template.features.map(f => `<li>${escapeHtml(f)}</li>`).join('')}
      </ul>
      ${scenariosHtml}
      <button class="btn small primary" style="margin-top:12px;width:100%" data-use-template="${template.id}">Usar Template</button>
    `;

    templatesGrid.appendChild(card);
  });

  if (typeof lucide !== 'undefined') {
    lucide.createIcons(templatesGrid);
  }

  setupTemplateActions();
}

// Evita o popup nativo do SO; mantém chamadas existentes a alert().
const alert = (message) => showAppAlert(message);

// Configurar event listeners para ações de templates
function setupTemplateActions() {
  // Botão criar template
  document.querySelectorAll('[data-action="create-template"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openTemplateEditor();
    });
  });

  // Botão editar template
  document.querySelectorAll('[data-action="edit-template"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const templateId = btn.getAttribute('data-template-id');
      openTemplateEditor(templateId);
    });
  });

  // Botão deletar template
  document.querySelectorAll('[data-action="delete-template"]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const templateId = btn.getAttribute('data-template-id');
      await deleteTemplate(templateId);
    });
  });
}

// Abrir modal de edição de template
function openTemplateEditor(templateId = null) {
  const modal = $('#templateEditorModal');
  const title = $('#templateEditorTitle');
  const nameInput = $('#templateEditorName');
  const descInput = $('#templateEditorDesc');
  const idInput = $('#templateEditorId');
  const scenariosInput = $('#templateEditorScenarios');
  const deleteBtn = $('#deleteTemplateBtn');

  if (!modal) return;

  nameInput.value = '';
  descInput.value = '';
  idInput.value = '';
  if (scenariosInput) scenariosInput.value = '';

  if (templateId) {
    const templateInfo = getTemplateInfo(templateId);
    if (templateInfo?.isCustom) {
      title.textContent = 'Editar Template';
      idInput.value = templateId;
      nameInput.value = templateInfo.name || '';
      descInput.value = templateInfo.description || '';
      if (scenariosInput) {
        scenariosInput.value = getTemplateScenarios(templateId).join('\n');
      }
      deleteBtn?.classList.remove('hidden');
    }
  } else {
    title.textContent = 'Criar Template';
    deleteBtn?.classList.add('hidden');
  }

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  nameInput?.focus();
}

// Fechar modal de edição de template
function closeTemplateEditor() {
  const modal = $('#templateEditorModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
  }
}

// Adicionar cenário à lista do editor
function addScenarioToEditor(scenarioText) {
  const scenariosList = $('#templateScenariosList');
  if (!scenariosList) return;

  const scenarioId = crypto.randomUUID();
  const scenarioItem = document.createElement('div');
  scenarioItem.className = 'scenario-item';
  scenarioItem.setAttribute('data-scenario-id', scenarioId);
  scenarioItem.style.cssText = 'display:flex;align-items:center;gap:8px;padding:10px;background:var(--card);border:1px solid var(--border);border-radius:8px;margin-bottom:8px';

  scenarioItem.innerHTML = `
    <input type="text" class="scenario-text-input" value="${escapeHtml(scenarioText)}" style="flex:1;padding:8px;border-radius:6px;border:1px solid var(--border);background:var(--card-hi);color:var(--text);font-size:14px" />
    <button class="icon-btn small remove-scenario-btn" data-scenario-id="${scenarioId}" title="Remover cenário" style="width:32px;height:32px;padding:0;display:flex;align-items:center;justify-content:center;background:var(--card-hi);border:1px solid var(--border);border-radius:6px;color:var(--err)">
      <i  style="width:16px;height:16px"></i>
    </button>
  `;

  scenariosList.appendChild(scenarioItem);

  const removeBtn = scenarioItem.querySelector('.remove-scenario-btn');
  if (removeBtn) {
    removeBtn.addEventListener('click', () => {
      scenarioItem.remove();
    });
  }

  if (typeof lucide !== 'undefined') {
    lucide.createIcons(scenarioItem);
  }
}

// Salvar template (criar ou atualizar)
async function saveTemplate() {
  const idInput = $('#templateEditorId');
  const nameInput = $('#templateEditorName');
  const descInput = $('#templateEditorDesc');
  const scenariosInput = $('#templateEditorScenarios');

  const name = nameInput?.value.trim() || '';
  const description = descInput?.value.trim() || '';
  const templateId = idInput?.value.trim() || '';

  // Validação
  if (!name) {
    await openAppDialog({
      title: 'Campo obrigatório',
      message: 'Por favor, informe o nome do template.',
      confirmText: 'OK',
    });
    nameInput.focus();
    return;
  }

  const scenarios = (scenariosInput?.value || '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (scenarios.length === 0) {
    const allowEmpty = await openAppDialog({
      title: 'Salvar sem cenários?',
      message: 'Nenhum cenário foi adicionado. Deseja criar o template mesmo assim?',
      showCancel: true,
      confirmText: 'Salvar assim mesmo',
      cancelText: 'Voltar',
    });
    if (!allowEmpty) {
      return;
    }
  }

  // Salvar template
  let savedId;
  if (templateId) {
    // Atualizar existente
    if (updateCustomTemplate(templateId, name, description, scenarios)) {
      savedId = templateId;
    } else {
      await openAppDialog({
        title: 'Erro',
        message: 'Erro ao atualizar template.',
        confirmText: 'OK',
      });
      return;
    }
  } else {
    // Criar novo
    savedId = createCustomTemplate(name, description, scenarios);
  }

  // Fechar modal e recarregar templates
  closeTemplateEditor();
  renderTemplates();

  // Feedback
  const btn = $('#saveTemplateBtn');
  if (btn) {
    const originalText = btn.textContent;
    btn.textContent = 'Salvo!';
    btn.style.background = '#2ecd6f';
    setTimeout(() => {
      btn.textContent = originalText;
      btn.style.background = '';
    }, 2000);
  }
}

// Deletar template
async function deleteTemplate(templateId) {
  const templateInfo = getTemplateInfo(templateId);
  if (!templateInfo || !templateInfo.isCustom) return;

  const confirmed = await openAppDialog({
    title: 'Confirmar exclusão',
    message: `Tem certeza que deseja deletar o template "${templateInfo.name}"?\n\nEsta ação não pode ser desfeita.`,
    showCancel: true,
    confirmText: 'Deletar',
    cancelText: 'Cancelar',
  });
  if (!confirmed) return;

  if (deleteCustomTemplate(templateId)) {
    renderTemplates();
  } else {
    await openAppDialog({
      title: 'Erro',
      message: 'Erro ao deletar template.',
      confirmText: 'OK',
    });
  }
}

// Event listeners para navegação na sidebar
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    const page = item.getAttribute('data-page');
    if (page) {
      navigateToPage(page);
    }
  });
});

// Mantém compatibilidade com botões antigos (se existirem)
const goHomeBtn = $('#goHome');
const goTemplatesBtn = $('#goTemplates');
const goHistoryBtn = $('#goHistory');

if (goHomeBtn) {
  goHomeBtn.addEventListener('click', () => navigateToPage('home'));
}
if (goTemplatesBtn) {
  goTemplatesBtn.addEventListener('click', () => navigateToPage('templates'));
}
if (goHistoryBtn) {
  goHistoryBtn.addEventListener('click', () => navigateToPage('history'));
}

// Inicializa na página home
navigateToPage('home');

// Handlers para seleção de template
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-use-template]');
  if (btn) {
    const template = btn.dataset.useTemplate;
    currentTemplate = template;
    // Voltar para home e abrir modal com template
    navigateToPage('home');
    openModal(null, template);
  }
});
$('#closeDetail').addEventListener('click', closeDetail);

// Handlers para abas do modal de detalhes
document.addEventListener('click', (e) => {
  const navItem = e.target.closest('.detail-tab');
  if (navItem) {
    const pageName = navItem.dataset.tab;
    if (pageName) {
      switchDetailTab(pageName);
    }
  }
});

function openModal(editingTest = null, template = null) {
  $('#modal').classList.remove('hidden');
  $('#modal').setAttribute('aria-hidden', 'false');
  $('#modalTitle').textContent = editingTest ? 'Editar Teste' : 'Novo Teste';
  $('#editId').value = editingTest ? editingTest.id : '';
  // Definir template
  if (template) {
    currentTemplate = template;
  } else if (editingTest) {
    currentTemplate = editingTest.template || 'default';
  } else {
    currentTemplate = 'default';
  }

  // Campos de produtos/ofertas NÃO aparecem no modal de registro
  // Eles aparecem apenas no modal de detalhes (Informações Gerais) quando o template for "offers"

  if (editingTest) {
    $('#titleInput').value = editingTest.title || '';
    $('#estimateInput').value = editingTest.estimatedMinutes || 15;
    $('#descInput').value = editingTest.description || '';
    $('#systemInput').value = editingTest.system || '';
    $('#branchFrontInput').value = editingTest.branchFront || '';
    $('#branchBackInput').value = editingTest.branchBack || '';
    $('#linkInput').value = editingTest.activityLink || '';
  } else {
    $('#titleInput').value = '';
    $('#estimateInput').value = 15;
    $('#descInput').value = '';
    $('#systemInput').value = '';
    $('#branchFrontInput').value = '';
    $('#branchBackInput').value = '';
    $('#linkInput').value = '';
  }
  loadSystemsList();
}

function closeModal() {
  $('#modal').classList.add('hidden');
  $('#modal').setAttribute('aria-hidden', 'true');
}

function saveTestFromModal() {
  const editId = $('#editId').value;
  const title = $('#titleInput').value.trim();
  const estimatedMinutes = Number.parseInt($('#estimateInput').value || '0', 10);
  const description = $('#descInput').value.trim();
  const system = $('#systemInput').value;
  const branchFront = $('#branchFrontInput').value.trim();
  const branchBack = $('#branchBackInput').value.trim();
  const activityLink = $('#linkInput').value.trim();
  const template = currentTemplate || 'default';

  // Campos de produtos/ofertas não são preenchidos no modal de registro
  // Eles são preenchidos apenas no modal de detalhes (Informações Gerais)

  if (!title || !estimatedMinutes) return;

  if (editId) {
    // Editar teste existente
    const t = store.tests.find(x => x.id === editId);
    if (t) {
      t.title = title;
      t.description = description;
      t.estimatedMinutes = estimatedMinutes;
      t.system = system;
      t.branchFront = branchFront;
      t.branchBack = branchBack;
      t.branch = combineBranches(branchFront, branchBack);
      t.activityLink = activityLink;
      t.template = template;
      // Manter produtos/ofertas existentes se mudar para template padrão, limpar apenas se mudar de padrão para offers
      if (template !== 'offers' && t.template === 'offers') {
        // Se estava em offers e mudou para default, limpar
        t.products = '';
        t.offersCodes = '';
      }
      // Limpar campos de televendas se mudar para outro template
      if (template !== 'televendas' && t.template === 'televendas') {
        t.clients = '';
        t.orders = '';
      }
      // Se mudou para offers ou televendas, manter valores existentes (serão editados no modal de detalhes)
      save();
      renderList();
      renderNewTiles();
      closeModal();
    }
  } else {
    // Criar novo teste
    const t = createTest({
      title,
      description,
      estimatedMinutes,
      system,
      branchFront,
      branchBack,
      activityLink,
      template,
      products: '', // Será preenchido no modal de detalhes se template for offers
      offersCodes: '', // Será preenchido no modal de detalhes se template for offers
      clients: '',
      orders: '',
    });
    store.tests.unshift(t);
    save();
    renderList();
    renderNewTiles();
    closeModal();
  }
}

function addTestUser(test) {
  if (!test.testUsers) test.testUsers = [];

  const userInput = $('.new-test-user-input');
  const user = userInput?.value.trim() || '';

  if (!user) {
    alert('Por favor, informe o usuário.');
    return;
  }

  test.testUsers.push({ user });

  if (userInput) userInput.value = '';

  save();
  refreshDetailIfOpen(test);
}

async function removeTestUser(test, index) {
  const shouldRemove = await showAppConfirm('Remover este usuário?', {
    title: 'Confirmar remoção',
    confirmText: 'Remover',
  });
  if (!shouldRemove) return;
  if (!test.testUsers) test.testUsers = [];
  test.testUsers.splice(index, 1);
  save();
  refreshDetailIfOpen(test);
}

function saveTestInfoFromDetail(test) {
  // Salvar edições dos usuários existentes
  if (!test.testUsers) test.testUsers = [];

  $$('.test-user-edit').forEach(input => {
    const index = parseInt(input.dataset.index);
    const field = input.dataset.field;
    if (test.testUsers[index]) {
      test.testUsers[index][field] = input.value.trim();
    }
  });

  // Salvar campos de produtos/ofertas se o template for offers
  const template = test.template || 'default';
  if (template === 'offers') {
    const products = $('.products-input')?.value.trim() || '';
    const offersCodes = $('.offers-codes-input')?.value.trim() || '';
    test.products = products;
    test.offersCodes = offersCodes;
  }
  // Salvar campos de clientes/pedidos se o template for televendas
  if (template === 'televendas') {
    const clients = $('.clients-input')?.value.trim() || '';
    const orders = $('.orders-input')?.value.trim() || '';
    test.clients = clients;
    test.orders = orders;
  }
  normalizeTimeEntries(test);
  const updatedEntries = [];
  let invalidTimeEntry = false;
  $$('.time-entry-item').forEach(item => {
    if (invalidTimeEntry) return;
    const startInput = $('.time-entry-start', item);
    const endInput = $('.time-entry-end', item);
    const startAt = fromDateTimeLocalValue(startInput?.value || '');
    const endAt = fromDateTimeLocalValue(endInput?.value || '');
    if (!startAt) {
      invalidTimeEntry = true;
      return;
    }
    if (endAt && endAt < startAt) {
      invalidTimeEntry = true;
      return;
    }
    updatedEntries.push({
      startAt,
      endAt: endAt || null
    });
  });
  if (invalidTimeEntry) {
    alert('Verifique os horários: início é obrigatório e o fim não pode ser menor que o início.');
    return;
  }
  test.timeEntries = updatedEntries;
  test.elapsedMs = getElapsedMs(test);

  save();
  refreshDetailIfOpen(test);

  // Feedback visual
  const btn = $('[data-act="saveTestInfo"]');
  if (btn) {
    const originalText = btn.textContent;
    btn.textContent = 'Salvo!';
    btn.style.background = '#2ecd6f';
    setTimeout(() => {
      btn.textContent = originalText;
      btn.style.background = '';
    }, 2000);
  }
}

function createTest({ title, description, estimatedMinutes, system, branchFront, branchBack, activityLink, template = 'default', testUsers, products, offersCodes, clients, orders, prefillScenarios = true }) {
  const initialPoints = prefillScenarios ? getPrefilledPoints(template, true) : [];

  return {
    id: crypto.randomUUID(),
    title,
    description,
    estimatedMinutes,
    system,
    branchFront: branchFront || '',
    branchBack: branchBack || '',
    branch: combineBranches(branchFront, branchBack),
    activityLink,
    createdAt: Date.now(),
    status: 'idle', // idle | running | paused | completed
    elapsedMs: 0,
    timeEntries: [],
    lastStartedAt: null,
    validated: null, // true | false | null
    isNew: true,
    comments: [],
    points: initialPoints,
    errors: [],
    observations: [],
    attachments: [],
    errorAttachments: [], // legado, mantido para compatibilidade
    attentionPoints: [],
    template: template || 'default',
    testUsers: testUsers || [], // [{ user: string, priceType?: string }]
    products: template === 'offers' ? (products || '') : '',
    offersCodes: template === 'offers' ? (offersCodes || '') : '',
    clients: template === 'televendas' ? (clients || '') : '',
    orders: template === 'televendas' ? (orders || '') : '',
  };
}

function filterTestsByStatus(t, filter, now, oneDayMs) {
  if (filter === 'validated' && t.validated !== true) return false;
  if (filter === 'notvalidated' && t.validated !== false) return false;
  if (filter === 'pending') {
    const daysSinceCreation = (now - t.createdAt) / oneDayMs;
    const isPending = t.status !== 'completed' && (daysSinceCreation >= 1 || t.isPending);
    if (!isPending) return false;
  }
  return true;
}

function filterTestsByDate(t, from, to) {
  if (from && t.createdAt < from) return false;
  if (to && t.createdAt > to) return false;
  return true;
}

function getReportRangeFromInputs() {
  const fromValue = $('#reportDateFrom')?.value || '';
  const toValue = $('#reportDateTo')?.value || '';
  const parseLocalDateStart = (value) => {
    if (!value) return null;
    const [y, m, d] = String(value).split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
  };
  const from = parseLocalDateStart(fromValue);
  const toStart = parseLocalDateStart(toValue);
  const to = toStart == null ? null : (toStart + 24 * 60 * 60 * 1000 - 1);
  return { from, to, fromValue, toValue };
}

function getGroupingKey(timestamp, mode) {
  const date = new Date(timestamp);
  if (mode === 'monthly') {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${date.getFullYear()}-${month}`;
  }
  if (mode === 'weekly') {
    const tmp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);
    return `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
  }
  return new Date(timestamp).toISOString().slice(0, 10);
}

function getGroupingLabel(groupKey, mode) {
  if (mode === 'monthly') {
    const [year, month] = groupKey.split('-');
    const date = new Date(Number(year), Number(month) - 1, 1);
    return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  }
  if (mode === 'weekly') {
    return `Semana ${groupKey.replaceAll('-', ' ')}`;
  }
  const date = new Date(`${groupKey}T12:00:00`);
  return date.toLocaleDateString('pt-BR');
}

function formatElapsedForReport(ms) {
  const totalMinutes = Math.round((Number(ms) || 0) / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}min`;
  return `${hours}h ${minutes}min`;
}

function formatHoursFromMs(ms) {
  const totalMinutes = Math.round((Number(ms) || 0) / 60000);
  if (totalMinutes < 60) {
    return `${totalMinutes}min`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (minutes === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${minutes}min`;
}

function startOfLocalDay(timestamp) {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function endOfLocalDay(timestamp) {
  const date = new Date(timestamp);
  date.setHours(23, 59, 59, 999);
  return date.getTime();
}

function splitTimeEntryByDay(startAt, endAt) {
  const result = [];
  if (!Number.isFinite(startAt) || !Number.isFinite(endAt) || endAt <= startAt) {
    return result;
  }
  let cursor = startAt;
  while (cursor < endAt) {
    const dayEnd = endOfLocalDay(cursor);
    const chunkEnd = Math.min(dayEnd + 1, endAt);
    result.push({
      dayStart: startOfLocalDay(cursor),
      elapsedMs: Math.max(0, chunkEnd - cursor),
    });
    cursor = chunkEnd;
  }
  return result;
}

function buildDailyTimeSlicesForTest(test, nowTs = Date.now()) {
  normalizeTimeEntries(test);
  const chunks = [];
  (test.timeEntries || []).forEach((entry) => {
    const startAt = Number(entry?.startAt);
    const endAt = entry?.endAt == null ? nowTs : Number(entry.endAt);
    chunks.push(...splitTimeEntryByDay(startAt, endAt));
  });

  // Fallback para dados legados sem timeEntries, usando elapsed total na data de criação.
  if (!chunks.length) {
    const legacyElapsed = getElapsedMs(test);
    if (legacyElapsed > 0) {
      chunks.push({
        dayStart: startOfLocalDay(test.createdAt || nowTs),
        elapsedMs: legacyElapsed,
      });
    }
  }
  return chunks;
}

function buildPeriodReportPayload() {
  const mode = $('#reportGrouping')?.value || 'daily';
  const { from, to, fromValue, toValue } = getReportRangeFromInputs();
  const nowTs = Date.now();
  const allSlices = [];
  store.tests.forEach((test) => {
    const testChunks = buildDailyTimeSlicesForTest(test, nowTs);
    testChunks.forEach((chunk) => {
      if (from != null && chunk.dayStart < from) return;
      if (to != null && chunk.dayStart > to) return;
      allSlices.push({
        testId: test.id,
        title: test.title || 'Sem título',
        activityLink: test.activityLink || '',
        validated: test.validated,
        dayStart: chunk.dayStart,
        elapsedMs: chunk.elapsedMs,
      });
    });
  });
  const sorted = [...allSlices].sort((a, b) => a.dayStart - b.dayStart);
  const map = new Map();

  sorted.forEach((slice) => {
    const key = getGroupingKey(slice.dayStart, mode);
    if (!map.has(key)) {
      map.set(key, {
        key,
        label: getGroupingLabel(key, mode),
        totalElapsedMs: 0,
        items: [],
        itemMap: new Map(),
      });
    }
    const group = map.get(key);
    let item = group.itemMap.get(slice.testId);
    if (!item) {
      item = {
        id: slice.testId,
        title: slice.title,
        activityLink: slice.activityLink,
        elapsedMs: 0,
        validated: slice.validated,
      };
      group.itemMap.set(slice.testId, item);
      group.items.push(item);
    }
    item.elapsedMs += slice.elapsedMs;
    group.totalElapsedMs += slice.elapsedMs;
  });

  const groupedEntries = Array.from(map.values())
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((group) => ({
      key: group.key,
      label: group.label,
      totalElapsedMs: group.totalElapsedMs,
      items: group.items,
    }));
  const totalElapsedMs = groupedEntries.reduce((acc, group) => acc + group.totalElapsedMs, 0);
  const uniqueActivityIds = new Set(sorted.map((slice) => slice.testId));

  const detailByTestId = new Map();
  groupedEntries.forEach((group) => {
    group.items.forEach((item) => {
      if (!detailByTestId.has(item.id)) {
        detailByTestId.set(item.id, {
          id: item.id,
          title: item.title,
          activityLink: item.activityLink,
          periods: [],
        });
      }
      detailByTestId.get(item.id).periods.push({
        label: group.label,
        elapsedMs: item.elapsedMs,
      });
    });
  });
  const repeatedActivitiesDetail = Array.from(detailByTestId.values())
    .filter((row) => row.periods.length > 1)
    .map((row) => ({
      ...row,
      totalElapsedMs: row.periods.reduce((sum, p) => sum + p.elapsedMs, 0),
    }))
    .sort((a, b) => String(a.title).localeCompare(String(b.title), 'pt-BR'));
  const repeatedActivitiesCount = repeatedActivitiesDetail.length;

  return {
    mode,
    from,
    to,
    fromValue,
    toValue,
    groupedEntries,
    totalActivities: uniqueActivityIds.size,
    repeatedActivitiesCount,
    repeatedActivitiesDetail,
    totalElapsedMs,
  };
}

function getReportPeriodNoun(mode) {
  if (mode === 'weekly') return 'semana';
  if (mode === 'monthly') return 'mês';
  return 'dia';
}

function updateReportRepeatsRow(payload) {
  const row = $('#reportRepeatsRow');
  const summaryEl = $('#reportRepeatsSummary');
  const btn = $('#openReportRepeatsDetailBtn');
  if (!row || !summaryEl || !btn) return;
  const n = payload.repeatedActivitiesCount || 0;
  if (n <= 0) {
    row.classList.add('hidden');
    btn.disabled = true;
    return;
  }
  row.classList.remove('hidden');
  btn.disabled = false;
  const noun = getReportPeriodNoun(payload.mode);
  summaryEl.textContent =
    `${n} atividade(s) com tempo em mais de um ${noun} neste relatório (a mesma atividade aparece em várias seções).`;
}

function openReportRepeatsDetailModal() {
  const payload = currentPeriodReportPayload;
  const list = payload?.repeatedActivitiesDetail;
  if (!list || !list.length) return;
  const body = $('#reportRepeatsModalBody');
  if (!body) return;
  body.innerHTML = list
    .map((row) => {
      const periodsHtml = row.periods
        .map(
          (p) =>
            `<li><strong>${escapeHtml(p.label)}</strong> — ${escapeHtml(formatElapsedForReport(p.elapsedMs))}</li>`
        )
        .join('');
      const linkHtml = row.activityLink
        ? `<p class="meta" style="margin:6px 0 10px"><a href="${escapeHtml(row.activityLink)}" target="_blank" rel="noopener noreferrer">${escapeHtml(row.activityLink)}</a></p>`
        : '';
      return `<section class="report-repeat-entry"><h4>${escapeHtml(row.title)}</h4>${linkHtml}<ul class="report-repeat-period-list">${periodsHtml}</ul><p class="meta" style="margin-top:10px"><strong>Total no filtro:</strong> ${escapeHtml(formatHoursFromMs(row.totalElapsedMs))}</p></section>`;
    })
    .join('<hr class="report-repeat-divider" />');
  const modal = $('#reportRepeatsModal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
  }
}

function closeReportRepeatsDetailModal() {
  const modal = $('#reportRepeatsModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
  }
}

function renderPeriodReportPreview(payload) {
  const previewEl = $('#periodReportMarkdownPreview');
  const totalActivitiesEl = $('#periodReportTotalActivities');
  const totalHoursEl = $('#periodReportTotalHours');
  if (!previewEl || !totalActivitiesEl || !totalHoursEl) return;

  totalActivitiesEl.textContent = String(payload.totalActivities || 0);
  totalHoursEl.textContent = formatHoursFromMs(payload.totalElapsedMs);
  updateReportRepeatsRow(payload);

  if (!payload.groupedEntries.length) {
    previewEl.textContent = 'Nenhuma atividade encontrada para o período informado.';
    return;
  }

  const modeLabelMap = { daily: 'Diário', weekly: 'Semanal', monthly: 'Mensal' };
  const modeLabel = modeLabelMap[payload.mode] || 'Diário';
  const periodLabel = `${payload.fromValue || '—'} até ${payload.toValue || '—'}`;
  let markdown = `# Relatório de Testes QA (${modeLabel})\n\n`;
  markdown += `Período: ${periodLabel}\n`;
  markdown += `Atividades únicas (no período): ${payload.totalActivities}\n`;
  markdown += `Total de horas registradas: ${formatHoursFromMs(payload.totalElapsedMs)}\n`;
  if ((payload.repeatedActivitiesCount || 0) > 0) {
    markdown += `Obs.: ${payload.repeatedActivitiesCount} atividade(s) aparecem em mais de um período (veja detalhes no app).\n`;
  }
  markdown += '\n';

  payload.groupedEntries.forEach((group) => {
    markdown += `## ${group.label}\n`;
    markdown += `Subtotal: ${group.items.length} atividade(s) | ${formatHoursFromMs(group.totalElapsedMs)}\n`;
    group.items.forEach((item, idx) => {
      const validatedText = item.validated === true ? 'Sim' : item.validated === false ? 'Não' : 'Pendente';
      markdown += `\n${idx + 1}. ${item.title}\n`;
      if (item.activityLink) markdown += `   - Link: ${item.activityLink}\n`;
      markdown += `   - Tempo decorrido: ${formatElapsedForReport(item.elapsedMs)}\n`;
      markdown += `   - Validada: ${validatedText}\n`;
    });
    markdown += '\n';
  });

  previewEl.textContent = markdown;
}

function buildPeriodReportHtml(payload) {
  const modeLabelMap = { daily: 'Diário', weekly: 'Semanal', monthly: 'Mensal' };
  const modeLabel = modeLabelMap[payload.mode] || 'Diário';
  const periodLabel = `${payload.fromValue || '—'} até ${payload.toValue || '—'}`;
  const generatedAt = new Date().toLocaleString('pt-BR');

  const groupsHtml = payload.groupedEntries.map((group) => {
    const itemsHtml = group.items.map((item, idx) => {
      const validatedText = item.validated === true ? 'Sim' : item.validated === false ? 'Não' : 'Pendente';
      const linkHtml = item.activityLink
        ? `<div class="meta"><strong>Link:</strong> <a href="${escapeHtml(item.activityLink)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.activityLink)}</a></div>`
        : '';
      return `
        <article class="item-card">
          <h4>${idx + 1}. ${escapeHtml(item.title)}</h4>
          ${linkHtml}
          <div class="meta"><strong>Tempo decorrido:</strong> ${escapeHtml(formatElapsedForReport(item.elapsedMs))}</div>
          <div class="meta"><strong>Validada:</strong> ${escapeHtml(validatedText)}</div>
        </article>
      `;
    }).join('');

    return `
      <section class="group-section">
        <h2>${escapeHtml(group.label)}</h2>
        <p class="group-subtitle">
          Subtotal: ${group.items.length} atividade(s) | ${escapeHtml(formatHoursFromMs(group.totalElapsedMs))}
        </p>
        ${itemsHtml}
      </section>
    `;
  }).join('');

  return `<!doctype html>
<html lang="pt-br">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Relatório QA (${modeLabel})</title>
    <style>
      :root {
        --bg:#1a0b2e;
        --card:#2a1b3d;
        --card-hi:#3a1f4d;
        --border:#5b3a6b;
        --text:#fce7f3;
        --muted:#d8a8d8;
        --pri:#a78bfa;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        background: radial-gradient(1200px 600px at 30% -10%, #6b21a8 0%, transparent 60%), var(--bg);
        color: var(--text);
      }
      .container {
        max-width: 1100px;
        margin: 24px auto;
        padding: 0 20px 32px;
      }
      .panel {
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 16px;
        padding: 20px;
      }
      h1 { margin: 0 0 12px; color: var(--pri); }
      h2 { margin: 0 0 10px; }
      h4 { margin: 0 0 8px; line-height: 1.4; }
      .meta, .subtitle, .group-subtitle { color: var(--muted); margin: 6px 0; }
      .summary {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 12px;
        margin: 14px 0 6px;
      }
      .summary-card {
        background: var(--card-hi);
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 12px;
      }
      .summary-card strong { display: block; color: var(--pri); font-size: 20px; margin-top: 4px; }
      .group-section {
        margin-top: 20px;
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 14px;
        padding: 16px;
      }
      .item-card {
        margin-top: 10px;
        padding: 12px;
        border: 1px solid var(--border);
        background: var(--card-hi);
        border-radius: 10px;
      }
      .badge {
        display: inline-block;
        margin-left: 6px;
        padding: 2px 8px;
        border-radius: 999px;
        border: 1px solid var(--border);
        color: var(--pri);
        font-size: 12px;
      }
      a { color: var(--pri); }
    </style>
  </head>
  <body>
    <main class="container">
      <section class="panel">
        <h1>Relatório de Testes QA (${escapeHtml(modeLabel)})</h1>
        <p class="subtitle"><strong>Gerado em:</strong> ${escapeHtml(generatedAt)}</p>
        <p class="subtitle"><strong>Período:</strong> ${escapeHtml(periodLabel)}</p>
        <div class="summary">
          <div class="summary-card">
            Atividades únicas (no período)
            <strong>${payload.totalActivities}</strong>
          </div>
          <div class="summary-card">
            Total de horas registradas
            <strong>${escapeHtml(formatHoursFromMs(payload.totalElapsedMs))}</strong>
          </div>
        </div>
        ${(payload.repeatedActivitiesCount || 0) > 0 ? `<p class="subtitle" style="margin-top:14px">${escapeHtml(String(payload.repeatedActivitiesCount))} atividade(s) com tempo em mais de um ${escapeHtml(getReportPeriodNoun(payload.mode))} (use o botão no app para ver o detalhe).</p>` : ''}
      </section>
      ${groupsHtml || '<section class="group-section"><p class="group-subtitle">Nenhuma atividade encontrada para o período informado.</p></section>'}
    </main>
  </body>
</html>`;
}

function filterTestsByQuery(t, q) {
  if (!q) return true;
  const pointsText = (t.points || []).map(p => typeof p === 'string' ? p : p.text).join(' ');
  const hay = [t.title, t.description, pointsText].join(' ').toLowerCase();
  return hay.includes(q);
}

function filterTests(filter, from, to, q, now, oneDayMs) {
  return store.tests.filter(t => {
    if (!filterTestsByStatus(t, filter, now, oneDayMs)) return false;
    if (!filterTestsByDate(t, from, to)) return false;
    if (!filterTestsByQuery(t, q)) return false;
    return true;
  });
}

function renderTestItem(t, tpl, list) {
  const node = tpl.content.cloneNode(true);
  $('.test-title', node).textContent = t.title;
  const linkShort = t.activityLink ? t.activityLink.replace(/^https?:\/\//, '') : '—';
  const branchInfo = formatBranches(t);
  const branchPart = branchInfo ? `${branchInfo} • ` : '';
  $('.test-sub', node).textContent = `${t.system || '—'} • ${branchPart}${linkShort} • Estimado: ${t.estimatedMinutes} min • Status: ${t.status}`;

  const root = node.querySelector('.test-item');
  root.dataset.id = t.id;

  addActions(root);
  applyActionStates(root, t);

  const bValid = root.querySelector('.badge-valid');
  const bNotValid = root.querySelector('.badge-notvalid');
  if (bValid) bValid.style.display = t.validated === true ? '' : 'none';
  if (bNotValid) bNotValid.style.display = t.validated === false ? '' : 'none';

  const testHead = $('.test-head', root);
  if (testHead) {
    testHead.addEventListener('click', (ev) => {
      if (ev.target.closest('.actions')) return;
      const id = root.dataset.id;
      const test = store.tests.find(x => x.id === id);
      if (test) {
        console.log('Abrindo detalhes do teste:', test.title);
        openDetail(test);
      } else {
        console.error('Teste não encontrado com id:', id);
      }
    });
  } else {
    console.error('Elemento .test-head não encontrado no root');
  }

  // Inicializa ícones no item renderizado
  if (typeof lucide !== 'undefined') {
    lucide.createIcons(root);
  }

  list.appendChild(node);
}

function renderList() {
  const filter = $('#statusFilter').value;
  const list = $('#list');
  list.innerHTML = '';
  const tpl = $('#testItemTpl');

  const from = $('#dateFrom').value ? new Date($('#dateFrom').value).getTime() : null;
  const to = $('#dateTo').value ? (new Date($('#dateTo').value).getTime() + 24 * 60 * 60 * 1000 - 1) : null;
  const qEl = $('#textQuery');
  const q = qEl ? (qEl.value || '').toLowerCase() : '';
  const oneDayMs = 24 * 60 * 60 * 1000;
  const now = Date.now();

  const testsAll = filterTests(filter, from, to, q, now, oneDayMs);
  const pageSize = 8;
  const total = testsAll.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (state.page > totalPages) state.page = totalPages;
  const start = (state.page - 1) * pageSize;
  const tests = testsAll.slice(start, start + pageSize);
  const pageInfo = $('#pageInfo');
  if (pageInfo) pageInfo.textContent = `Página ${state.page} de ${totalPages}`;

  // Atualiza contador de resultados
  const resultsCountEl = $('#resultsCount');
  if (resultsCountEl) {
    resultsCountEl.textContent = `${total} ${total === 1 ? 'teste encontrado' : 'testes encontrados'}`;
  }

  renderNewTiles();
  for (const t of tests) {
    renderTestItem(t, tpl, list);
  }
  updateProgressBars();
}

function addActions(root) {
  root.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    // Evita disparar também o clique do cabeçalho (.test-head),
    // que abre o modal de detalhes e conflita com ações como remover/editar.
    e.preventDefault();
    e.stopPropagation();
    const id = root.dataset.id;
    const t = store.tests.find(x => x.id === id);
    if (!t) return;
    const act = btn.dataset.act;

    const actionMap = {
      'start': () => startTest(t),
      'pause': () => pauseTest(t),
      'stop': () => openValidateModal(t),
      'remove': () => removeTest(t),
      'addComment': () => addComment(t, $('.comment-input', root).value),
      'addPoint': () => addPoint(t, $('.point-input', root).value),
      'addError': () => {
        const errorInput = $('.error-input', root);
        const scenarioSelect = $('.error-scenario-select', root);
        const scenarioId = scenarioSelect.value || null;
        addError(t, errorInput.value, [], scenarioId);
        errorInput.value = '';
        scenarioSelect.value = '';
      },
      'addObservation': () => {
        const observationInput = $('.observation-input', root);
        const errorAttachmentSelect = $('.observation-error-attachment-select', root);
        const errorAttachmentIndex = errorAttachmentSelect.value !== '' ? parseInt(errorAttachmentSelect.value) : null;
        addObservation(t, observationInput.value, errorAttachmentIndex);
        observationInput.value = '';
        errorAttachmentSelect.value = '';
      },
      'addImages': () => addImages(t),
      'addErrorImages': () => addErrorImages(t),
      'report': () => exportReport(t),
      'reportPdf': () => exportReportPdf(t),
      'reportMd': () => exportReportMarkdown(t),
      'reportSimple': () => exportReportSimple(t),
      'reportDocx': () => exportReportDocx(t),
      'reportUser': () => exportReportUser(t),
      'edit': () => openModal(t)
    };

    const handler = actionMap[act];
    if (handler) await handler();
  });
}

function startTest(t) {
  if (t.status === 'completed') return;
  if (t.status !== 'running') {
    const now = Date.now();
    t.lastStartedAt = now;
    openTimeEntry(t, now);
    t.status = 'running';
    t.elapsedMs = getElapsedMs(t);
    save();
    renderList();
  }
}

function pauseTest(t) {
  if (t.status !== 'running') return;
  const now = Date.now();
  closeOpenTimeEntry(t, now);
  t.elapsedMs = getElapsedMs(t);
  t.lastStartedAt = null;
  t.status = 'paused';
  save();
  renderList();
}

async function completeTest(t) {
  if (t.status === 'running') {
    const now = Date.now();
    closeOpenTimeEntry(t, now);
  }
  t.elapsedMs = getElapsedMs(t);
  t.status = 'completed';
  t.lastStartedAt = null;
  t.isNew = false;
  t.isPending = false; // Remove status pendente ao concluir
  save();
  renderList();
  renderNewTiles();

  // Gerar relatórios automaticamente ao concluir
  try {
    await exportReport(t);
    await exportReportPdf(t);
  } catch (e) {
    console.error('Erro ao gerar relatórios:', e);
  }
}

function removeTest(t) {
  const detailModal = $('#detailModal');
  if (detailModal && !detailModal.classList.contains('hidden') && detailModal.dataset.id === t.id) {
    closeDetail();
  }
  store.tests = store.tests.filter(x => x.id !== t.id);
  save();
  renderList();
}

function addComment(t, text) {
  if (!text.trim()) return;
  t.comments.push({ text: text.trim(), at: Date.now() });
  save();
  renderList();
  refreshDetailIfOpen(t);
}

function addPoint(t, text) {
  if (!text.trim()) return;
  if (!t.points) t.points = [];
  t.points.push({
    id: crypto.randomUUID(),
    text: text.trim(),
    images: [],
    offerCode: ''
  });
  save();
  renderList();
  refreshDetailIfOpen(t);
}

function addError(t, text, images = [], scenarioId = null) {
  if (!text.trim()) return;
  if (!t.errors) t.errors = [];
  const errorObj = {
    id: crypto.randomUUID(),
    text: text.trim(),
    at: Date.now(),
    images: images || [],
    scenarioId: scenarioId || null
  };
  t.errors.push(errorObj);

  save();
  renderList();
  refreshDetailIfOpen(t);
}


// Add images to a specific error
async function addImagesToError(t, errorIdx) {
  const result = await globalThis.api.openImages();
  if (result && result.length) {
    if (!t.errors[errorIdx].images) t.errors[errorIdx].images = [];
    result.forEach(item => {
      const localPath = typeof item === 'string' ? item : item.localPath;
      t.errors[errorIdx].images.push(localPath);
      });

    save();
    renderList();
    refreshDetailIfOpen(t);
  }
}

// Add images to a specific attention point
async function addImagesToAttentionPoint(t, attentionPointIdx) {
  const result = await globalThis.api.openImages();
  if (result && result.length) {
    if (!t.attentionPoints[attentionPointIdx].images) t.attentionPoints[attentionPointIdx].images = [];
    result.forEach(item => {
      const localPath = typeof item === 'string' ? item : item.localPath;
      t.attentionPoints[attentionPointIdx].images.push(localPath);
      });

    save();
    renderList();
    refreshDetailIfOpen(t);
  }
}

async function addImagesToObservation(t, observationIdx) {
  const result = await globalThis.api.openImages();
  if (result && result.length) {
    if (!t.observations[observationIdx].images) t.observations[observationIdx].images = [];
    result.forEach(item => {
      const localPath = typeof item === 'string' ? item : item.localPath;
      t.observations[observationIdx].images.push(localPath);
      });

    save();
    renderList();
    refreshDetailIfOpen(t);
  }
}

function removeObservationImage(t, observationIdx, imageIdx) {
  if (t.observations[observationIdx] && t.observations[observationIdx].images) {
    t.observations[observationIdx].images.splice(imageIdx, 1);
    save();
    renderList();
    refreshDetailIfOpen(t);
  }
}

async function removeErrorImage(t, errorIdx, imageIdx) {
  const shouldRemove = await showAppConfirm('Remover esta imagem do erro?', {
    title: 'Confirmar remoção',
    confirmText: 'Remover',
  });
  if (!shouldRemove) return;
  t.errors[errorIdx].images.splice(imageIdx, 1);
  save();
  renderList();
  refreshDetailIfOpen(t);
}

async function removeAttentionPointImage(t, attentionPointIdx, imageIdx) {
  const shouldRemove = await showAppConfirm('Remover esta imagem do ponto de atenção?', {
    title: 'Confirmar remoção',
    confirmText: 'Remover',
  });
  if (!shouldRemove) return;
  t.attentionPoints[attentionPointIdx].images.splice(imageIdx, 1);
  save();
  renderList();
  refreshDetailIfOpen(t);
}

function addObservation(t, text, images = [], scenarioId = null) {
  if (!text.trim()) return;
  if (!t.observations) t.observations = [];
  const observationObj = {
    id: crypto.randomUUID(),
    text: text.trim(),
    at: Date.now(),
    images: images || [],
    scenarioId: scenarioId || null
  };
  t.observations.push(observationObj);

  save();
  renderList();
  refreshDetailIfOpen(t);
}

// Adicionar ponto de atenção (similar a addError)
function addAttentionPoint(t, text, images = [], scenarioId = null) {
  if (!text.trim()) return;
  if (!t.attentionPoints) t.attentionPoints = [];
  const attentionPointObj = {
    id: crypto.randomUUID(),
    text: text.trim(),
    at: Date.now(),
    images: images || [],
    scenarioId: scenarioId || null
  };
  t.attentionPoints.push(attentionPointObj);

  save();
  renderList();
  refreshDetailIfOpen(t);
}

// Converter erro em ponto de atenção
function convertErrorToAttentionPoint(t, errorIdx) {
  if (!t.errors || !t.errors[errorIdx]) return;
  if (!t.attentionPoints) t.attentionPoints = [];

  const error = t.errors[errorIdx];

  // Criar ponto de atenção com todos os dados do erro
  const attentionPoint = {
    id: crypto.randomUUID(),
    text: error.text || 'Ponto de atenção',
    at: error.at || Date.now(),
    images: [...(error.images || [])],
    scenarioId: error.scenarioId || null
  };

  t.attentionPoints.push(attentionPoint);

  // Remover o erro
  t.errors.splice(errorIdx, 1);

  save();
  renderList();
  refreshDetailIfOpen(t);
}

async function addImages(t) {
  const result = await globalThis.api.openImages();
  if (result && result.length) {
    result.forEach(item => {
      const localPath = typeof item === 'string' ? item : item.localPath;
      t.attachments.push(localPath);
      });

    save();
    renderList();
    refreshDetailIfOpen(t);
  }
}

async function addErrorImages(t) {
  const result = await globalThis.api.openImages();
  if (result && result.length) {
    if (!t.errorAttachments) t.errorAttachments = [];

    result.forEach(item => {
      const localPath = typeof item === 'string' ? item : item.localPath;
      t.errorAttachments.push(localPath);
      });

    save();
    renderList();
    refreshDetailIfOpen(t);
  }
}

let isPastingImage = false; // Flag para evitar múltiplas execuções simultâneas

// Funções auxiliares para reduzir complexidade cognitiva
function canPasteImage() {
  if (isPastingImage) return false;
  const modal = $('#detailModal');
  if (modal.classList.contains('hidden')) return false;
  const testId = modal.dataset.id;
  if (!testId) return false;
  return true;
}

function getTestFromModal() {
  const modal = $('#detailModal');
  const testId = modal.dataset.id;
  if (!testId) return null;
  return store.tests.find(x => x.id === testId);
}

function extractImageData(result) {
  const imagePath = typeof result === 'string' ? result : result.localPath;
  return { imagePath };
}

function addImageToActiveError(test, imagePath) {
  if (activeErrorIndex === null || !test.errors || !test.errors[activeErrorIndex]) {
    return false;
  }
  if (!test.errors[activeErrorIndex].images) {
    test.errors[activeErrorIndex].images = [];
  }
  test.errors[activeErrorIndex].images.push(imagePath);
  return true;
}

function addImageToActivePoint(test, imagePath) {
  if (activePointIndex === null || !test.points || !test.points[activePointIndex]) {
    return false;
  }
  const point = test.points[activePointIndex];
  if (typeof point === 'string') {
    test.points[activePointIndex] = { text: point, images: [] };
  }
  if (!test.points[activePointIndex].images) {
    test.points[activePointIndex].images = [];
  }
  test.points[activePointIndex].images.push(imagePath);
  return true;
}

function addImageToErrorAttachments(test, imagePath) {
  if (activeImageField !== 'errorAttachments') {
    return false;
  }
  if (!test.errorAttachments) {
    test.errorAttachments = [];
  }
  test.errorAttachments.push(imagePath);
  return true;
}

function addImageToActiveAttentionPoint(test, imagePath) {
  if (activeAttentionPointIndex === null || !test.attentionPoints || !test.attentionPoints[activeAttentionPointIndex]) {
    return false;
  }
  if (!test.attentionPoints[activeAttentionPointIndex].images) {
    test.attentionPoints[activeAttentionPointIndex].images = [];
  }
  test.attentionPoints[activeAttentionPointIndex].images.push(imagePath);
  return true;
}

function addImageToActiveObservation(test, imagePath) {
  if (activeObservationIndex === null || !test.observations || !test.observations[activeObservationIndex]) {
    return false;
  }
  if (!test.observations[activeObservationIndex].images) {
    test.observations[activeObservationIndex].images = [];
  }
  test.observations[activeObservationIndex].images.push(imagePath);
  return true;
}

function addImageToAttachments(test, imagePath) {
  if (!test.attachments) {
    test.attachments = [];
  }
  test.attachments.push(imagePath);
}

function processPastedImage(test, result) {
  const { imagePath } = extractImageData(result);

  if (addImageToActiveError(test, imagePath)) return;
  if (addImageToActivePoint(test, imagePath)) return;
  if (addImageToActiveAttentionPoint(test, imagePath)) return;
  if (addImageToActiveObservation(test, imagePath)) return;
  if (addImageToErrorAttachments(test, imagePath)) return;
  addImageToAttachments(test, imagePath);
}

function updateUIAfterPaste(test) {
  save();
  renderList();
  refreshDetailIfOpen(test);
}

async function pasteImage(prefetchedResult) {
  if (!canPasteImage()) return;

  const t = getTestFromModal();
  if (!t) return;

  try {
    isPastingImage = true;

    const result =
      prefetchedResult ?? (await globalThis.api.getClipboardImage());
    if (!result) return;

    processPastedImage(t, result);
    updateUIAfterPaste(t);
  } catch (error) {
    console.error('Erro ao colar imagem:', error);
  } finally {
    setTimeout(() => {
      isPastingImage = false;
    }, 100);
  }
}

// ===== Modal de Edição de Item
let editItemCallback = null;
let editItemType = null; // 'error' | null
$('#closeEditItem').addEventListener('click', closeEditItemModal);
$('#btnCancelEditItem').addEventListener('click', closeEditItemModal);
$('#btnSaveEditItem').addEventListener('click', () => {
  const val = $('#editItemInput').value.trim();
  if (val && editItemCallback) {
    // Se for edição de erro, passar também o scenarioId
    if (editItemType === 'error') {
      const scenarioId = $('#editItemScenarioSelect').value || null;
      editItemCallback(val, scenarioId);
    } else if (editItemType === 'point') {
      // Se for edição de ponto, passar também o offerCode
      const offerCode = $('#editItemOfferCodeInput').value.trim() || '';
      editItemCallback(val, offerCode);
    } else if (editItemType === 'observation') {
      // Se for edição de observação, passar também o errorAttachmentIndex
      const errorAttachmentIndex = $('#editItemErrorAttachmentSelect').value !== '' ? parseInt($('#editItemErrorAttachmentSelect').value) : null;
      editItemCallback(val, errorAttachmentIndex);
    } else {
      editItemCallback(val);
    }
  }
  closeEditItemModal();
});

function openEditItemModal(title, currentValue, callback, options = {}) {
  $('#editItemTitle').textContent = title;
  $('#editItemInput').value = currentValue;
  editItemCallback = callback;
  editItemType = options.type || null;

  // Mostrar/ocultar seletor de cenários baseado no tipo
  const scenarioContainer = $('#editItemScenarioContainer');
  const scenarioSelect = $('#editItemScenarioSelect');
  const offerCodeContainer = $('#editItemOfferCodeContainer');
  const offerCodeInput = $('#editItemOfferCodeInput');
  const errorAttachmentContainer = $('#editItemErrorAttachmentContainer');
  const errorAttachmentSelect = $('#editItemErrorAttachmentSelect');

  if (editItemType === 'error' && options.test) {
    // Popular o seletor com os cenários disponíveis
    scenarioSelect.innerHTML = '<option value="">Nenhum cenário (geral)</option>';
    if (options.test.points && options.test.points.length > 0) {
      options.test.points.forEach((point, idx) => {
        const pointText = typeof point === 'string' ? point : point.text;
        const pointId = typeof point === 'object' && point.id ? point.id : null;
        if (pointId) {
          const option = document.createElement('option');
          option.value = pointId;
          const offerCode = typeof point === 'object' && point.offerCode ? point.offerCode : '';
          const offerCodeText = offerCode ? ` [Oferta: ${offerCode}]` : '';
          option.textContent = `${idx + 1}. ${pointText.substring(0, 50)}${pointText.length > 50 ? '...' : ''}${offerCodeText}`;
          // Selecionar o cenário atual se houver
          if (options.currentScenarioId === pointId) {
            option.selected = true;
          }
          scenarioSelect.appendChild(option);
        }
      });
    }
    scenarioContainer.style.display = 'block';
    offerCodeContainer.style.display = 'none';
    offerCodeInput.value = '';
    errorAttachmentContainer.style.display = 'none';
    errorAttachmentSelect.value = '';
  } else if (editItemType === 'point') {
    // Mostrar campo de oferta para edição de ponto
    scenarioContainer.style.display = 'none';
    scenarioSelect.value = '';
    offerCodeContainer.style.display = 'block';
    offerCodeInput.value = options.currentOfferCode || '';
    errorAttachmentContainer.style.display = 'none';
    errorAttachmentSelect.value = '';
  } else if (editItemType === 'observation' && options.test) {
    // Mostrar seletor de imagens de erro para observação
    scenarioContainer.style.display = 'none';
    scenarioSelect.value = '';
    offerCodeContainer.style.display = 'none';
    offerCodeInput.value = '';
    errorAttachmentContainer.style.display = 'block';

    // Popular o seletor com as imagens de erro disponíveis
    errorAttachmentSelect.innerHTML = '<option value="">Nenhuma imagem (geral)</option>';
    if (options.test.errorAttachments && options.test.errorAttachments.length > 0) {
      options.test.errorAttachments.forEach((imgPath, idx) => {
        const option = document.createElement('option');
        option.value = idx;
        const fileName = imgPath.split(/[/\\]/).pop() || `Imagem ${idx + 1}`;
        option.textContent = `Imagem ${idx + 1}: ${fileName.substring(0, 40)}${fileName.length > 40 ? '...' : ''}`;
        // Selecionar a imagem atual se houver
        if (options.currentErrorAttachmentIndex === idx) {
          option.selected = true;
        }
        errorAttachmentSelect.appendChild(option);
      });
    }
  } else {
    scenarioContainer.style.display = 'none';
    scenarioSelect.value = '';
    offerCodeContainer.style.display = 'none';
    offerCodeInput.value = '';
    errorAttachmentContainer.style.display = 'none';
    errorAttachmentSelect.value = '';
  }

  $('#editItemModal').classList.remove('hidden');
  $('#editItemModal').setAttribute('aria-hidden', 'false');
  setTimeout(() => {
    $('#editItemInput').focus();
    const el = $('#editItemInput');
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, 50);
}

function closeEditItemModal() {
  $('#editItemModal').classList.add('hidden');
  $('#editItemModal').setAttribute('aria-hidden', 'true');
  editItemCallback = null;
  editItemType = null;
  $('#editItemInput').value = '';
  $('#editItemScenarioSelect').value = '';
  $('#editItemScenarioContainer').style.display = 'none';
  $('#editItemOfferCodeInput').value = '';
  $('#editItemOfferCodeContainer').style.display = 'none';
  $('#editItemErrorAttachmentSelect').value = '';
  $('#editItemErrorAttachmentContainer').style.display = 'none';
}

// Editar/remover funções
function editPoint(t, idx) {
  const current = t.points[idx];
  const currentText = typeof current === 'string' ? current : current.text;
  const currentOfferCode = typeof current === 'object' && current.offerCode ? current.offerCode : '';
  openEditItemModal('Editar cenário testado', currentText, (newVal, offerCode) => {
    if (newVal) {
      if (typeof t.points[idx] === 'string') {
        t.points[idx] = {
          id: crypto.randomUUID(),
          text: newVal,
          images: [],
          offerCode: offerCode || ''
        };
      } else {
        t.points[idx].text = newVal;
        t.points[idx].offerCode = offerCode || '';
      }
      save();
      renderList();
      refreshDetailIfOpen(t);
    }
  }, {
    type: 'point',
    test: t,
    currentOfferCode: currentOfferCode
  });
}

async function removePoint(t, idx) {
  const shouldRemove = await showAppConfirm('Remover este cenário testado?', {
    title: 'Confirmar remoção',
    confirmText: 'Remover',
  });
  if (!shouldRemove) return;
  t.points.splice(idx, 1);
  save();
  renderList();
  refreshDetailIfOpen(t);
}

async function addImagesToPoint(t, pointIdx) {
  const result = await globalThis.api.openImages();
  if (result && result.length) {
    const point = t.points[pointIdx];
    if (!point) return;

    if (typeof point === 'string') {
      t.points[pointIdx] = {
        id: crypto.randomUUID(),
        text: point,
        images: []
      };
    }

    if (!t.points[pointIdx].images) {
      t.points[pointIdx].images = [];
    }

    result.forEach(item => {
      const localPath = typeof item === 'string' ? item : item.localPath;
      t.points[pointIdx].images.push(localPath);
      });

    save();
    renderList();
    refreshDetailIfOpen(t);
  }
}

function removePointImage(t, pointIdx, imageIdx) {
  const point = t.points[pointIdx];
  if (!point || typeof point === 'string') return;

  if (!point.images) point.images = [];

  if (point.images[imageIdx]) {
    point.images.splice(imageIdx, 1);
    save();
    renderList();
    refreshDetailIfOpen(t);
  }
}

function editComment(t, idx) {
  const current = t.comments[idx];
  openEditItemModal('Editar comentário', current.text, (newVal) => {
    if (newVal) {
      t.comments[idx].text = newVal;
      t.comments[idx].at = Date.now();
      save();
      renderList();
      refreshDetailIfOpen(t);
    }
  });
}

async function removeComment(t, idx) {
  const shouldRemove = await showAppConfirm('Remover este comentário?', {
    title: 'Confirmar remoção',
    confirmText: 'Remover',
  });
  if (!shouldRemove) return;
  t.comments.splice(idx, 1);
  save();
  renderList();
  refreshDetailIfOpen(t);
}

function editError(t, idx) {
  if (!t.errors) t.errors = [];
  const current = t.errors[idx];
  // Ensure images array exists
  if (!current.images) current.images = [];
  const currentScenarioId = current.scenarioId || null;
  openEditItemModal('Editar erro', current.text, (newVal, scenarioId) => {
    if (newVal) {
      t.errors[idx].text = newVal;
      t.errors[idx].at = Date.now();
      t.errors[idx].scenarioId = scenarioId || null;
      save();
      renderList();
      refreshDetailIfOpen(t);
    }
  }, {
    type: 'error',
    test: t,
    currentScenarioId: currentScenarioId
  });
}

async function removeError(t, idx) {
  if (!t.errors) t.errors = [];
  const shouldRemove = await showAppConfirm('Remover este erro?', {
    title: 'Confirmar remoção',
    confirmText: 'Remover',
  });
  if (!shouldRemove) return;
  t.errors.splice(idx, 1);
  save();
  renderList();
  refreshDetailIfOpen(t);
}

function editObservation(t, idx) {
  if (!t.observations) t.observations = [];
  const current = t.observations[idx];
  if (!current) return;
  // Ensure images array exists
  if (!current.images) current.images = [];
  const currentScenarioId = current.scenarioId || null;
  openEditItemModal('Editar observação', current.text, (newVal, scenarioId) => {
    if (newVal) {
      t.observations[idx].text = newVal;
      t.observations[idx].at = Date.now();
      t.observations[idx].scenarioId = scenarioId || null;
      save();
      renderList();
      refreshDetailIfOpen(t);
    }
  }, {
    type: 'error', // Usar mesmo tipo de erro para ter campos de cenário
    test: t,
    currentScenarioId: currentScenarioId
  });
}

async function removeObservation(t, idx) {
  if (!t.observations) t.observations = [];
  const shouldRemove = await showAppConfirm('Remover esta observação?', {
    title: 'Confirmar remoção',
    confirmText: 'Remover',
  });
  if (!shouldRemove) return;
  t.observations.splice(idx, 1);
  save();
  renderList();
  refreshDetailIfOpen(t);
}

function editAttentionPoint(t, idx) {
  if (!t.attentionPoints) t.attentionPoints = [];
  const current = t.attentionPoints[idx];
  if (!current) return;
  // Ensure images array exists
  if (!current.images) current.images = [];
  const currentScenarioId = current.scenarioId || null;
  openEditItemModal('Editar ponto de atenção', current.text, (newVal, scenarioId) => {
    if (newVal) {
      t.attentionPoints[idx].text = newVal;
      t.attentionPoints[idx].at = Date.now();
      t.attentionPoints[idx].scenarioId = scenarioId || null;
      save();
      renderList();
      refreshDetailIfOpen(t);
    }
  }, {
    type: 'error', // Usar mesmo tipo de erro para ter campos de cenário
    test: t,
    currentScenarioId: currentScenarioId
  });
}

async function removeAttentionPoint(t, idx) {
  if (!t.attentionPoints) t.attentionPoints = [];
  const shouldRemove = await showAppConfirm('Remover este ponto de atenção?', {
    title: 'Confirmar remoção',
    confirmText: 'Remover',
  });
  if (!shouldRemove) return;
  t.attentionPoints.splice(idx, 1);
  save();
  renderList();
  refreshDetailIfOpen(t);
}

async function removeAttachment(t, idx) {
  const shouldRemove = await showAppConfirm('Remover esta imagem?', {
    title: 'Confirmar remoção',
    confirmText: 'Remover',
  });
  if (!shouldRemove) return;
  t.attachments.splice(idx, 1);
  save();
  renderList();
  refreshDetailIfOpen(t);
}

async function removeErrorAttachment(t, idx) {
  if (!t.errorAttachments) t.errorAttachments = [];
  const shouldRemove = await showAppConfirm('Remover esta imagem de erro?', {
    title: 'Confirmar remoção',
    confirmText: 'Remover',
  });
  if (!shouldRemove) return;
  t.errorAttachments.splice(idx, 1);
  save();
  renderList();
  refreshDetailIfOpen(t);
}

async function exportReport(t) {
  await flushSave();
  await globalThis.api.exportReport(t);
}

async function exportReportPdf(t) {
  try {
    await flushSave();
    await globalThis.api.exportReportPdf(t);
  } catch (error) {
    console.error('Erro ao gerar PDF:', error);
    alert('Erro ao gerar PDF: ' + (error.message || 'Erro desconhecido'));
  }
}

async function exportReportMarkdown(t) {
  await flushSave();
  await globalThis.api.exportReportMarkdown(t);
}

async function exportReportSimple(t) {
  await flushSave();
  await globalThis.api.exportReportSimple(t);
}

async function exportReportDocx(t) {
  try {
    await flushSave();
    await globalThis.api.exportReportDocx(t);
  } catch (error) {
    console.error('Erro ao gerar DOCX:', error);
    alert('Erro ao gerar DOCX: ' + (error.message || 'Erro desconhecido'));
  }
}

async function exportReportUser(t) {
  await flushSave();
  await globalThis.api.exportReportUser(t);
}

function updateProgressBars() {
  $$('.test-item').forEach(card => {
    const id = card.dataset.id;
    const t = store.tests.find(x => x.id === id);
    if (!t) return;
    const elapsed = getElapsedMs(t);
    const estMs = Math.max(1, t.estimatedMinutes) * 60000;
    const percent = t.status === 'completed' ? 100 : Math.min(100, Math.round((elapsed / estMs) * 100));
    $('.bar', card).style.width = percent + '%';
    const branchInfo = formatBranches(t);
    const branchSegment = branchInfo ? ` • ${branchInfo}` : '';
    $('.test-sub', card).textContent = `Estimado: ${t.estimatedMinutes} min • Decorrido: ${(elapsed / 60000).toFixed(1)} min${branchSegment} • Data: ${new Date(t.createdAt).toLocaleDateString('pt-BR')} • Status: ${t.status}`;

    // Atualiza estado dos botões do cartão
    applyActionStates(card, t);
  });

  // Atualiza barra do modal de detalhes, se aberto
  const detail = $('#detailModal');
  if (!detail.classList.contains('hidden') && detail.dataset.id) {
    const t = store.tests.find(x => x.id === detail.dataset.id);
    if (t) {
      updateDetailProgressBar(t);
    }
  }
}

// ===== New Tests tiles on home
function updateHomeStats() {
  const oneDayMs = 24 * 60 * 60 * 1000;
  const now = Date.now();

  const newTests = store.tests.filter(t => {
    if (t.status === 'completed') return false;
    const daysSinceCreation = (now - t.createdAt) / oneDayMs;
    return daysSinceCreation < 1;
  });

  const pendingTests = store.tests.filter(t => {
    if (t.status === 'completed') return false;
    const daysSinceCreation = (now - t.createdAt) / oneDayMs;
    return daysSinceCreation >= 1 || t.isPending;
  });

  const completedTests = store.tests.filter(t => t.status === 'completed');

  const statNewEl = $('#statNew');
  const statPendingEl = $('#statPending');
  const statCompletedEl = $('#statCompleted');
  const homeStatsEl = $('#homeStats');

  if (statNewEl) statNewEl.textContent = newTests.length;
  if (statPendingEl) statPendingEl.textContent = pendingTests.length;
  if (statCompletedEl) statCompletedEl.textContent = completedTests.length;

  if (homeStatsEl) {
    homeStatsEl.style.display = store.tests.length > 0 ? 'flex' : 'none';
  }
}

function renderNewTiles() {
  const grid = $('#newTiles');
  if (!grid) return;
  grid.innerHTML = '';

  // Atualiza estatísticas
  updateHomeStats();

  // Filtrar testes novos e pendentes (não concluídos)
  const oneDayMs = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const activeTests = store.tests.filter(t => {
    if (t.status === 'completed') return false;
    const daysSinceCreation = (now - t.createdAt) / oneDayMs;
    // Mostra se for novo (menos de 1 dia) ou pendente (mais de 1 dia)
    return daysSinceCreation < 1 || (t.isPending || daysSinceCreation >= 1);
  });

  if (!activeTests.length) {
    $('#emptyNewMsg').style.display = '';
    return;
  }
  $('#emptyNewMsg').style.display = 'none';

  // Ordenar: pendentes primeiro, depois novos
  activeTests.sort((a, b) => {
    const aDays = (now - a.createdAt) / oneDayMs;
    const bDays = (now - b.createdAt) / oneDayMs;
    const aPending = aDays >= 1 || a.isPending;
    const bPending = bDays >= 1 || b.isPending;
    if (aPending && !bPending) return -1;
    if (!aPending && bPending) return 1;
    return b.createdAt - a.createdAt; // Mais recentes primeiro
  });

  activeTests.slice(0, 12).forEach(t => {
    const div = document.createElement('div');
    div.className = 'tile';
    const daysSinceCreation = (now - t.createdAt) / oneDayMs;
    const isPending = daysSinceCreation >= 1 || t.isPending;
    const tagText = isPending ? 'Pendente' : 'Novo!';
    const tagClass = isPending ? 'tag pending' : 'tag';
    div.innerHTML = `<span class="${tagClass}">${tagText}</span><div class="title">${escapeHtml(t.title)}</div><div class="muted">${escapeHtml(t.system || '')}</div>`;
    div.addEventListener('click', () => openDetail(t));
    grid.appendChild(div);
  });
}

// ===== Persist filters
function saveFilters() {
  const data = {
    status: $('#statusFilter').value,
    from: $('#dateFrom').value,
    to: $('#dateTo').value,
    q: ($('#textQuery') ? $('#textQuery').value : ''),
    page: state.page
  };
  localStorage.setItem('eveFilters', JSON.stringify(data));
}
function loadFilters() {
  try {
    const raw = localStorage.getItem('eveFilters') ?? localStorage.getItem('qaLiteFilters');
    if (!raw) return;
    const d = JSON.parse(raw);
    if (d.status) $('#statusFilter').value = d.status;
    if (d.from) $('#dateFrom').value = d.from;
    if (d.to) $('#dateTo').value = d.to;
    if (d.q && $('#textQuery')) $('#textQuery').value = d.q;
    state.page = d.page || 1;
  } catch (e) {
    console.error("Erro ao carregar filtros:", e);
  }
}

// Ajusta labels/cores/disabled dos botões start/pause/stop dentro de um container
function applyActionStates(container, t) {
  const startBtn = container.querySelector('[data-act="start"]');
  const pauseBtn = container.querySelector('[data-act="pause"]');
  const stopBtn = container.querySelector('[data-act="stop"]');
  if (!startBtn || !pauseBtn || !stopBtn) return;
  const completed = t.status === 'completed';
  startBtn.disabled = completed;
  pauseBtn.disabled = completed;
  if (completed) {
    stopBtn.textContent = 'Concluído';
    stopBtn.classList.add('warning');
    stopBtn.disabled = true;
  } else {
    stopBtn.textContent = 'Concluir';
    stopBtn.classList.remove('warning');
    stopBtn.disabled = false;
  }
}

// Funções auxiliares para reduzir complexidade cognitiva
function setupDetailModal(test) {
  const modal = $('#detailModal');
  modal.dataset.id = test.id;
  $('#detailTitle').textContent = test.title;
  // Limpar páginas será feito em openDetail
}

// Função para alternar entre páginas
function switchDetailTab(pageName) {
  currentDetailPage = pageName;

  // Esconder todas as páginas
  $$('.detail-page').forEach(page => {
    page.classList.add('hidden');
    page.classList.remove('active');
  });

  // Remover active de todos os nav items
  $$('.detail-tab').forEach(item => {
    item.classList.remove('active');
  });

  // Mostrar página selecionada
  const page = $(`#page${pageName.charAt(0).toUpperCase() + pageName.slice(1)}`);
  if (page) {
    page.classList.remove('hidden');
    page.classList.add('active');
  }

  // Ativar nav item selecionado
  const navItem = $(`.detail-tab[data-tab="${pageName}"]`);
  if (navItem) {
    navItem.classList.add('active');
  }
}

// Criar página de informações gerais
function createGeneralInfoPage(test) {
  const container = document.createElement('div');

  const testUsers = test.testUsers || [];
  const usersListHtml = testUsers.map((tu, idx) => `
    <div class="test-user-card">
      <div class="test-user-fields">
        <div>
          <label class="field-label-sm">Usuário</label>
          <input type="text" class="test-user-edit" data-index="${idx}" data-field="user" placeholder="usuario@empresa.com" value="${escapeHtml(tu.user || '')}" />
        </div>
      </div>
      <button type="button" class="icon-btn" data-act="removeTestUser" data-index="${idx}" title="Remover usuário">Remover</button>
    </div>
  `).join('');

  const template = test.template || 'default';
  const isOffersTemplate = template === 'offers';
  const isTelevendasTemplate = template === 'televendas';
  normalizeTimeEntries(test);
  const timeEntriesHtml = (test.timeEntries || []).map((entry, idx) => `
    <div class="time-entry-item" data-index="${idx}">
      <div>
        <label class="field-label-sm">Início</label>
        <input type="datetime-local" class="time-entry-start" value="${toDateTimeLocalValue(entry.startAt)}" />
      </div>
      <div>
        <label class="field-label-sm">Finalização</label>
        <input type="datetime-local" class="time-entry-end" value="${toDateTimeLocalValue(entry.endAt)}" />
      </div>
      <button type="button" class="icon-btn" data-act="removeTimeEntry" data-index="${idx}" title="Remover intervalo">Remover</button>
    </div>
  `).join('');
  const latestEntry = test.timeEntries && test.timeEntries.length ? test.timeEntries[test.timeEntries.length - 1] : null;
  const newEntryStart = latestEntry && latestEntry.endAt ? toDateTimeLocalValue(latestEntry.endAt) : '';

  container.innerHTML = `
    <div class="section">
      <div class="section-head">
        <h3 class="section-title">Descrição</h3>
      </div>
      <div class="detail-panel">
        <div class="desc">${escapeHtml(test.description || '—')}</div>
      </div>
    </div>

    <div class="section">
      <div class="section-head">
        <h3 class="section-title">Registros de Tempo</h3>
      </div>
      <div class="detail-panel">
        <p class="muted" style="margin:0 0 10px;font-size:11px">
          Você pode editar horários mesmo após concluir o teste. Use vários intervalos quando houver pausas.
        </p>
        <div class="time-entries-list">
          ${timeEntriesHtml || '<p class="muted" style="margin:0;padding:6px 0">Nenhum intervalo registrado.</p>'}
        </div>
        <div class="time-entry-grid" style="margin-top:10px">
          <div>
            <label class="field-label-sm">Novo início</label>
            <input type="datetime-local" class="new-time-entry-start" value="${newEntryStart}" />
          </div>
          <div>
            <label class="field-label-sm">Novo fim</label>
            <input type="datetime-local" class="new-time-entry-end" />
          </div>
          <button type="button" data-act="addTimeEntry" class="btn small">Adicionar</button>
        </div>
        <p class="muted" style="margin:10px 0 0;font-size:11px">
          Total atual: <strong>${(getElapsedMs(test) / 60000).toFixed(1)} min</strong> (${formatDateTimeDisplay(test.createdAt)} criação)
        </p>
      </div>
    </div>

    <div class="section test-info">
      <div class="section-head">
        <h3 class="section-title">Informações do Teste</h3>
      </div>

      <div class="detail-panel" style="margin-bottom:12px">
        <p class="field-label-sm" style="margin-bottom:10px">Usuários utilizados para testes</p>
        <div class="test-users-list" style="margin-bottom:12px">
          ${usersListHtml || '<div class="empty-state-small">Nenhum usuário adicionado</div>'}
        </div>
        <div class="test-users-form">
          <div>
            <label class="field-label-sm">Usuário</label>
            <input type="text" class="new-test-user-input" placeholder="usuario@empresa.com" />
          </div>
          <button type="button" data-act="addTestUser" class="btn small primary">Adicionar</button>
        </div>
      </div>

      ${isOffersTemplate ? `
      <!-- Produtos e Ofertas (Template Offers) -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px;padding-top:24px;border-top:1px solid var(--border)">
        <div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
            <i  style="width:18px;height:18px;color:var(--muted)"></i>
            <label style="font-size:14px;font-weight:600;color:var(--text);margin:0">Produtos ou marcas utilizadas</label>
          </div>
          <textarea class="products-input" rows="3" placeholder="Liste os produtos ou marcas utilizadas nos testes" style="width:100%;padding:12px;border-radius:10px;border:1px solid var(--border);background:var(--card);color:var(--text);resize:vertical;font-size:14px;font-family:inherit;transition:all 0.2s">${escapeHtml(test.products || '')}</textarea>
        </div>
        <div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
            <i  style="width:18px;height:18px;color:var(--muted)"></i>
            <label style="font-size:14px;font-weight:600;color:var(--text);margin:0">Código das ofertas/negociações</label>
          </div>
          <textarea class="offers-codes-input" rows="3" placeholder="Ex.: 005234, 005235" style="width:100%;padding:12px;border-radius:10px;border:1px solid var(--border);background:var(--card);color:var(--text);resize:vertical;font-size:14px;font-family:inherit;transition:all 0.2s">${escapeHtml(test.offersCodes || '')}</textarea>
        </div>
      </div>
      ` : ''}
      
      ${isTelevendasTemplate ? `
      <!-- Clientes e Pedidos (Template Televendas) -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px;padding-top:24px;border-top:1px solid var(--border)">
        <div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
            <i  style="width:18px;height:18px;color:var(--muted)"></i>
            <label style="font-size:14px;font-weight:600;color:var(--text);margin:0">Clientes utilizados nos testes</label>
          </div>
          <textarea class="clients-input" rows="3" placeholder="Liste os clientes ou empresas utilizadas nos testes" style="width:100%;padding:12px;border-radius:10px;border:1px solid var(--border);background:var(--card);color:var(--text);resize:vertical;font-size:14px;font-family:inherit;transition:all 0.2s">${escapeHtml(test.clients || '')}</textarea>
        </div>
        <div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
            <i  style="width:18px;height:18px;color:var(--muted)"></i>
            <label style="font-size:14px;font-weight:600;color:var(--text);margin:0">Números de pedidos/protocolos</label>
          </div>
          <textarea class="orders-input" rows="3" placeholder="Ex.: 12345, 12346, PROTO-001" style="width:100%;padding:12px;border-radius:10px;border:1px solid var(--border);background:var(--card);color:var(--text);resize:vertical;font-size:14px;font-family:inherit;transition:all 0.2s">${escapeHtml(test.orders || '')}</textarea>
        </div>
      </div>
      ` : ''}

      <div class="detail-save-row">
        <button type="button" data-act="saveTestInfo" class="btn primary">Salvar Informações</button>
      </div>
    </div>
  `;
  return container;
}

// Criar página de cenários testados
function createScenariosPage() {
  const container = document.createElement('div');
  container.innerHTML = `
    <div class="section points">
      <div class="section-head">
        <h3 class="section-title">Cenários Testados</h3>
      </div>
      <ul class="points-list"></ul>
      <div class="row">
        <input class="point-input" type="text" placeholder="Adicionar cenário testado" />
        <button data-act="addPoint" class="btn small">Adicionar</button>
      </div>
    </div>
  `;
  return container;
}

// Criar página de sugestões
function createSuggestionsPage() {
  const container = document.createElement('div');
  container.innerHTML = `
    <div class="section comments">
      <div class="section-head">
        <h3 class="section-title">Sugestão de ajuste/melhoria</h3>
      </div>
      <ul class="comments-list"></ul>
      <div class="row">
        <input class="comment-input" type="text" placeholder="Escreva uma sugestão" />
        <button data-act="addComment" class="btn small">Enviar</button>
      </div>
    </div>
  `;
  return container;
}

// Criar página de erros
function createErrorsPage() {
  const container = document.createElement('div');
  container.innerHTML = `
    <div class="section errors">
      <div class="section-head">
        <h3 class="section-title">Erros</h3>
      </div>
      <div class="errors-list-container" style="margin-bottom:24px;min-height:200px">
        <ul class="errors-list" style="list-style:none;padding:0;margin:0"></ul>
      </div>
      <div class="add-error-form" style="padding:20px;background:var(--card-hi);border:1px solid var(--border);border-radius:12px">
        <label style="display:block;margin-bottom:12px;font-size:14px;font-weight:600;color:var(--text)">
          Adicionar novo erro
        </label>
        <div style="display:flex;flex-direction:column;gap:12px">
          <input class="error-input" type="text" placeholder="Descreva o erro encontrado" />
          <select class="error-scenario-select" style="padding:12px 16px;border-radius:10px;border:1px solid var(--border);background:var(--card);color:var(--text);font-size:14px">
            <option value="">Nenhum cenário (geral)</option>
          </select>
          <button type="button" data-act="addError" class="btn primary">Adicionar</button>
        </div>
      </div>
    </div>
  `;
  return container;
}

// Criar página de observações
function createObservationsPage() {
  const container = document.createElement('div');
  container.innerHTML = `
    <div class="section observations">
      <div class="section-head">
        <h3 class="section-title">Observações</h3>
      </div>
      <div class="observations-list-container" style="margin-bottom:24px;min-height:200px">
        <ul class="observations-list" style="list-style:none;padding:0;margin:0"></ul>
      </div>
      <div class="add-observation-form" style="padding:20px;background:var(--card-hi);border:1px solid var(--border);border-radius:12px">
        <label style="display:block;margin-bottom:12px;font-size:14px;font-weight:600;color:var(--text)">
          Adicionar nova observação
        </label>
        <div style="display:flex;flex-direction:column;gap:12px">
          <input class="observation-input" type="text" placeholder="Descreva uma observação" />
          <select class="observation-scenario-select" style="padding:12px 16px;border-radius:10px;border:1px solid var(--border);background:var(--card);color:var(--text);font-size:14px">
            <option value="">Nenhum cenário (geral)</option>
          </select>
          <button type="button" data-act="addObservation" class="btn primary">Adicionar</button>
        </div>
      </div>
    </div>
  `;
  return container;
}

// Criar página de pontos de atenção
function createAttentionPage() {
  const container = document.createElement('div');
  container.innerHTML = `
    <div class="section attention-points">
      <div class="section-head">
        <h3 class="section-title">Pontos de atenção</h3>
      </div>
      <div class="attention-points-list-container" style="margin-bottom:24px;min-height:200px">
        <ul class="attention-points-list" style="list-style:none;padding:0;margin:0"></ul>
      </div>
      <div class="add-attention-form" style="padding:20px;background:var(--card-hi);border:1px solid var(--border);border-radius:12px">
        <label style="display:block;margin-bottom:12px;font-size:14px;font-weight:600;color:var(--text)">
          Adicionar novo ponto de atenção
        </label>
        <div style="display:flex;flex-direction:column;gap:12px">
          <input class="attention-point-input" type="text" placeholder="Descreva o ponto de atenção" />
          <select class="attention-point-scenario-select" style="padding:12px 16px;border-radius:10px;border:1px solid var(--border);background:var(--card);color:var(--text);font-size:14px">
            <option value="">Nenhum cenário (geral)</option>
          </select>
          <button type="button" data-act="addAttentionPoint" class="btn primary">Adicionar</button>
        </div>
      </div>
    </div>
  `;
  return container;
}

function createListItemWithActions(text, onEdit, onDelete) {
  const li = document.createElement('li');
  li.style.display = 'flex';
  li.style.alignItems = 'center';
  li.style.gap = '8px';
  li.innerHTML = `<span style="flex:1">${text}</span>`;

  const editBtn = document.createElement('button');
  editBtn.className = 'icon-btn';
  editBtn.textContent = 'E';
  editBtn.title = 'Editar';
  editBtn.onclick = onEdit;

  const delBtn = document.createElement('button');
  delBtn.className = 'icon-btn';
  addTrashIcon(delBtn);
  delBtn.title = 'Remover';
  delBtn.onclick = onDelete;

  li.appendChild(editBtn);
  li.appendChild(delBtn);
  return li;
}

function renderPointsList(test, root) {
  const pointsList = $('.points-list', root);
  pointsList.innerHTML = '';

  (test.points || []).forEach((p, idx) => {
    const pointText = typeof p === 'string' ? p : p.text;
    const pointImages = typeof p === 'object' && p.images ? p.images : [];

    const li = document.createElement('li');
    li.className = 'scenario-card';
    li.style.display = 'flex';
    li.style.flexDirection = 'column';
    li.style.gap = '12px';
    li.style.marginBottom = '16px';

    // Texto do cenário com botões de ação
    const pointOfferCode = typeof p === 'object' && p.offerCode ? p.offerCode : '';
    const offerCodeDisplay = pointOfferCode ? ` <span style="font-size:0.85em;color:#f7c948;margin-left:8px">[Oferta: ${escapeHtml(pointOfferCode)}]</span>` : '';
    const textRow = document.createElement('div');
    textRow.style.display = 'flex';
    textRow.style.alignItems = 'center';
    textRow.style.gap = '8px';
    textRow.innerHTML = `<span style="flex:1">${escapeHtml(pointText)}${offerCodeDisplay}</span>`;

    const editBtn = document.createElement('button');
    editBtn.className = 'icon-btn';
    editBtn.textContent = 'E';
    editBtn.title = 'Editar';
    editBtn.onclick = () => editPoint(test, idx);

    const delBtn = document.createElement('button');
    delBtn.className = 'icon-btn';
    addTrashIcon(delBtn);
    delBtn.title = 'Remover';
    delBtn.onclick = () => removePoint(test, idx);

    textRow.appendChild(editBtn);
    textRow.appendChild(delBtn);
    li.appendChild(textRow);

    // Handler de clique para ativar o cenário (Ctrl+V)
    li.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      activePointIndex = idx;
      activeErrorIndex = null;
      // Destacar visualmente
      $$('.points-list li', root).forEach((item, i) => {
        if (i === idx) {
          item.style.border = '2px solid var(--accent, #7c3aed)';
          item.style.boxShadow = '0 0 0 2px rgba(124, 58, 237, 0.2)';
        } else {
          item.style.border = '1px solid var(--border)';
          item.style.boxShadow = 'none';
        }
      });
    });

    // Imagens do cenário
    if (pointImages.length > 0) {
      const imagesContainer = document.createElement('div');
      imagesContainer.style.display = 'grid';
      imagesContainer.style.gridTemplateColumns = 'repeat(auto-fill, minmax(120px, 1fr))';
      imagesContainer.style.gap = '8px';
      imagesContainer.style.marginTop = '8px';

      pointImages.forEach((imgPath, imgIdx) => {
        const imgDiv = document.createElement('div');
        imgDiv.style.position = 'relative';

        const img = createLazyImageElement();
        img.src = getImageUrl(test, imgPath, 'attachments');
        img.style.width = '100%';
        img.style.height = '100px';
        img.style.objectFit = 'cover';
        img.style.borderRadius = '6px';
        img.style.border = '1px solid var(--border)';

        img.onerror = () => {
          if (img.src.startsWith('http')) {
            img.src = `file://${imgPath}`;
          }
        };

        const removeImgBtn = document.createElement('button');
        removeImgBtn.className = 'icon-btn';
        removeImgBtn.style.position = 'absolute';
        removeImgBtn.style.top = '4px';
        removeImgBtn.style.right = '4px';
        removeImgBtn.style.background = 'rgba(0,0,0,0.7)';
        addTrashIcon(removeImgBtn);
        removeImgBtn.title = 'Remover imagem';
        removeImgBtn.onclick = () => removePointImage(test, idx, imgIdx);

        imgDiv.appendChild(img);
        imgDiv.appendChild(removeImgBtn);
        imagesContainer.appendChild(imgDiv);
      });

      li.appendChild(imagesContainer);
    }

    const buttonsRow = document.createElement('div');
    buttonsRow.style.display = 'flex';
    buttonsRow.style.gap = '8px';
    buttonsRow.style.marginTop = '4px';

    const addImgBtn = document.createElement('button');
    addImgBtn.className = 'btn small';
    addImgBtn.textContent = 'Adicionar imagens';
    addImgBtn.onclick = () => addImagesToPoint(test, idx);

    buttonsRow.appendChild(addImgBtn);
    li.appendChild(buttonsRow);

    pointsList.appendChild(li);
  });
}

function renderCommentsList(test, root) {
  const commentsList = $('.comments-list', root);
  commentsList.innerHTML = '';
  test.comments.forEach((c, idx) => {
    const text = `[${new Date(c.at).toLocaleTimeString()}] ${escapeHtml(c.text)}`;
    const li = createListItemWithActions(
      text,
      () => editComment(test, idx),
      () => removeComment(test, idx)
    );
    commentsList.appendChild(li);
  });
}

function createObservationImageElement(test, observationIdx, imgPath, imgIdx) {
  const imgDiv = document.createElement('div');
  imgDiv.style.position = 'relative';
  imgDiv.style.display = 'inline-block';
  imgDiv.style.marginRight = '8px';
  imgDiv.style.marginBottom = '8px';

  const img = createLazyImageElement();
  img.src = getImageUrl(test, imgPath, 'observations');
  img.style.width = '120px';
  img.style.height = '120px';
  img.style.objectFit = 'cover';
  img.style.borderRadius = '6px';
  img.style.border = '1px solid var(--border)';
  img.style.cursor = 'pointer';
  img.onclick = () => {
    window.open(img.src, '_blank');
  };

  const removeImgBtn = document.createElement('button');
  removeImgBtn.className = 'icon-btn';
  removeImgBtn.style.position = 'absolute';
  removeImgBtn.style.top = '4px';
  removeImgBtn.style.right = '4px';
  removeImgBtn.style.background = 'rgba(0,0,0,0.7)';
  addTrashIcon(removeImgBtn);
  removeImgBtn.title = 'Remover imagem';
  removeImgBtn.onclick = () => removeObservationImage(test, observationIdx, imgIdx);

  imgDiv.appendChild(img);
  imgDiv.appendChild(removeImgBtn);
  return imgDiv;
}

function createObservationImagesContainer(test, observation, observationIdx, root) {
  if (!observation.images || observation.images.length === 0) {
    return null;
  }

  const imagesContainer = document.createElement('div');
  imagesContainer.style.marginTop = '12px';
  imagesContainer.style.display = 'flex';
  imagesContainer.style.flexWrap = 'wrap';
  imagesContainer.style.gap = '8px';

  observation.images.forEach((imgPath, imgIdx) => {
    const imgDiv = createObservationImageElement(test, observationIdx, imgPath, imgIdx);
    imagesContainer.appendChild(imgDiv);
  });

  return imagesContainer;
}

function setupObservationClickHandler(li, observationIdx, root) {
  li.onclick = (e) => {
    // Não ativar se clicou em botões ou imagens
    if (e.target.tagName === 'BUTTON' || e.target.tagName === 'IMG' || e.target.closest('button')) {
      return;
    }

    activeObservationIndex = observationIdx;
    $$('.observations-list li', root).forEach((item, i) => {
      if (i === observationIdx) {
        item.style.border = '2px solid var(--accent, #7c3aed)';
        item.style.boxShadow = '0 0 0 2px rgba(124, 58, 237, 0.2)';
      } else {
        item.style.border = '1px solid var(--border)';
        item.style.boxShadow = 'none';
      }
    });
  };
}

function createObservationListItem(test, observation, observationIdx, root) {
  if (!observation.images) observation.images = [];

  const li = document.createElement('li');
  li.style.display = 'flex';
  li.style.flexDirection = 'column';
  li.style.gap = '8px';
  li.style.marginBottom = '16px';
  li.style.padding = '12px';
  li.style.background = 'var(--card-hi)';
  li.style.borderRadius = '8px';
  li.style.border = '1px solid var(--border)';
  li.dataset.observationIndex = observationIdx;

  if (activeObservationIndex === observationIdx) {
    li.style.border = '2px solid var(--accent, #7c3aed)';
    li.style.boxShadow = '0 0 0 2px rgba(124, 58, 237, 0.2)';
  }

  // Verificar se a observação está vinculada a um cenário
  let scenarioInfo = '';
  if (observation.scenarioId && test.points) {
    const scenarioIndex = test.points.findIndex(p => {
      const pointId = typeof p === 'object' && p.id ? p.id : null;
      return pointId === observation.scenarioId;
    });
    if (scenarioIndex !== -1) {
      const scenario = test.points[scenarioIndex];
      const offerCode = typeof scenario === 'object' && scenario.offerCode ? scenario.offerCode : '';
      const offerCodeText = offerCode ? ` - Oferta: ${escapeHtml(offerCode)}` : '';
      scenarioInfo = ` <span style="font-size:0.85em;color:#f7c948;margin-left:8px">[Cenário ${scenarioIndex + 1}${offerCodeText}]</span>`;
    }
  }

  const textRow = document.createElement('div');
  textRow.style.display = 'flex';
  textRow.style.alignItems = 'center';
  textRow.style.gap = '8px';
  textRow.innerHTML = `<span style="flex:1">[${new Date(observation.at).toLocaleTimeString()}] ${escapeHtml(observation.text)}${scenarioInfo}</span>`;

  const editBtn = document.createElement('button');
  editBtn.className = 'icon-btn';
  editBtn.textContent = 'E';
  editBtn.title = 'Editar';
  editBtn.onclick = () => editObservation(test, observationIdx);

  const delBtn = document.createElement('button');
  delBtn.className = 'icon-btn';
  addTrashIcon(delBtn);
  delBtn.title = 'Remover';
  delBtn.onclick = () => removeObservation(test, observationIdx);

  textRow.appendChild(editBtn);
  textRow.appendChild(delBtn);
  li.appendChild(textRow);

  setupObservationClickHandler(li, observationIdx, root);

  const imagesContainer = createObservationImagesContainer(test, observation, observationIdx, root);
  if (imagesContainer) {
    li.appendChild(imagesContainer);
  }

  const buttonsRow = document.createElement('div');
  buttonsRow.style.display = 'flex';
  buttonsRow.style.gap = '8px';
  buttonsRow.style.marginTop = '8px';

  const addImgBtn = document.createElement('button');
  addImgBtn.className = 'btn small';
  addImgBtn.textContent = '+ Adicionar imagem';
  addImgBtn.onclick = async () => {
    await addImagesToObservation(test, observationIdx);
  };

  buttonsRow.appendChild(addImgBtn);
  li.appendChild(buttonsRow);

  return li;
}

function renderObservationsList(test, root) {
  const observationsList = $('.observations-list', root);
  if (!observationsList) return;
  observationsList.innerHTML = '';
  if (!test.observations || test.observations.length === 0) {
    observationsList.innerHTML = '<li class="muted">Nenhuma observação registrada.</li>';
    return;
  }

  test.observations.forEach((observation, observationIdx) => {
    const li = createObservationListItem(test, observation, observationIdx, root);
    observationsList.appendChild(li);
  });
}

function createImageElement(test, imgPath, category, onRemove) {
  const div = document.createElement('div');
  div.style.position = 'relative';

  const img = createLazyImageElement();
  img.src = getImageUrl(test, imgPath, category);
  img.style.width = '100%';
  img.style.height = '100px';
  img.style.objectFit = 'cover';
  img.style.borderRadius = '10px';
  img.style.border = '1px solid var(--border)';

  img.onerror = () => {
    if (img.src.startsWith('http')) {
      img.src = `file://${imgPath}`;
    }
  };

  const delBtn = document.createElement('button');
  delBtn.className = 'icon-btn';
  delBtn.style.position = 'absolute';
  delBtn.style.top = '4px';
  delBtn.style.right = '4px';
  delBtn.style.background = 'rgba(0,0,0,0.7)';
  addTrashIcon(delBtn);
  delBtn.title = 'Remover';
  delBtn.onclick = onRemove;

  div.appendChild(img);
  div.appendChild(delBtn);
  return div;
}

function renderAttachmentsList(test, root) {
  const attachmentsList = $('.attachments-list', root);
  attachmentsList.innerHTML = '';
  test.attachments.forEach((a, idx) => {
    const div = createImageElement(test, a, 'attachments', () => removeAttachment(test, idx));
    attachmentsList.appendChild(div);
  });
}

function renderErrorAttachmentsList(test, root) {
  const errorAttachmentsList = $('.error-attachments-list', root);
  errorAttachmentsList.innerHTML = '';
  test.errorAttachments.forEach((a, idx) => {
    const div = createImageElement(test, a, 'errorAttachments', () => removeErrorAttachment(test, idx));
    errorAttachmentsList.appendChild(div);
  });
}

function createErrorImageElement(test, errorIdx, imgPath, imgIdx) {
  const imgDiv = document.createElement('div');
  imgDiv.style.position = 'relative';

  const img = createLazyImageElement();
  img.src = getImageUrl(test, imgPath, 'errorAttachments');
  img.style.width = '100%';
  img.style.height = '100px';
  img.style.objectFit = 'cover';
  img.style.borderRadius = '8px';
  img.style.border = '1px solid var(--border)';

  img.onerror = () => {
    if (img.src.startsWith('http')) {
      img.src = `file://${imgPath}`;
    }
  };

  const removeImgBtn = document.createElement('button');
  removeImgBtn.className = 'icon-btn';
  removeImgBtn.style.position = 'absolute';
  removeImgBtn.style.top = '4px';
  removeImgBtn.style.right = '4px';
  removeImgBtn.style.background = 'rgba(0,0,0,0.7)';
  addTrashIcon(removeImgBtn);
  removeImgBtn.title = 'Remover imagem';
  removeImgBtn.onclick = () => removeErrorImage(test, errorIdx, imgIdx);

  imgDiv.appendChild(img);
  imgDiv.appendChild(removeImgBtn);
  return imgDiv;
}

function createErrorImagesContainer(test, error, errorIdx, root) {
  if (!error.images || error.images.length === 0) {
    return null;
  }

  const imagesContainer = document.createElement('div');
  imagesContainer.style.display = 'grid';
  imagesContainer.style.gridTemplateColumns = 'repeat(auto-fill, minmax(150px, 1fr))';
  imagesContainer.style.gap = '8px';
  imagesContainer.style.marginTop = '8px';

  error.images.forEach((imgPath, imgIdx) => {
    const imgDiv = createErrorImageElement(test, errorIdx, imgPath, imgIdx);
    imagesContainer.appendChild(imgDiv);
  });

  return imagesContainer;
}

function setupErrorClickHandler(li, errorIdx, root) {
  li.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    activeErrorIndex = errorIdx;
    $$('.errors-list li', root).forEach((item, i) => {
      if (i === errorIdx) {
        item.style.border = '2px solid var(--accent, #7c3aed)';
        item.style.boxShadow = '0 0 0 2px rgba(124, 58, 237, 0.2)';
      } else {
        item.style.border = '1px solid var(--border)';
        item.style.boxShadow = 'none';
      }
    });
  });
}

function createErrorListItem(test, error, errorIdx, root) {
  if (!error.images) error.images = [];

  const li = document.createElement('li');
  li.style.display = 'flex';
  li.style.flexDirection = 'column';
  li.style.gap = '8px';
  li.style.marginBottom = '16px';
  li.style.padding = '12px';
  li.style.background = 'var(--card-hi)';
  li.style.borderRadius = '8px';
  li.style.border = '1px solid var(--border)';
  li.dataset.errorIndex = errorIdx;

  if (activeErrorIndex === errorIdx) {
    li.style.border = '2px solid var(--accent, #7c3aed)';
    li.style.boxShadow = '0 0 0 2px rgba(124, 58, 237, 0.2)';
  }

  // Verificar se o erro está vinculado a um cenário
  let scenarioInfo = '';
  if (error.scenarioId && test.points) {
    const scenarioIndex = test.points.findIndex(p => {
      const pointId = typeof p === 'object' && p.id ? p.id : null;
      return pointId === error.scenarioId;
    });
    if (scenarioIndex !== -1) {
      const scenario = test.points[scenarioIndex];
      const offerCode = typeof scenario === 'object' && scenario.offerCode ? scenario.offerCode : '';
      const offerCodeText = offerCode ? ` - Oferta: ${escapeHtml(offerCode)}` : '';
      scenarioInfo = ` <span style="font-size:0.85em;color:#f7c948;margin-left:8px">[Cenário ${scenarioIndex + 1}${offerCodeText}]</span>`;
    }
  }

  const textRow = document.createElement('div');
  textRow.style.display = 'flex';
  textRow.style.alignItems = 'center';
  textRow.style.gap = '8px';
  textRow.innerHTML = `<span style="flex:1">[${new Date(error.at).toLocaleTimeString()}] ${escapeHtml(error.text)}${scenarioInfo}</span>`;

  const editBtn = document.createElement('button');
  editBtn.className = 'icon-btn';
  editBtn.textContent = 'E';
  editBtn.title = 'Editar';
  editBtn.onclick = () => editError(test, errorIdx);

  const delBtn = document.createElement('button');
  delBtn.className = 'icon-btn';
  addTrashIcon(delBtn);
  delBtn.title = 'Remover';
  delBtn.onclick = () => removeError(test, errorIdx);

  textRow.appendChild(editBtn);
  textRow.appendChild(delBtn);
  li.appendChild(textRow);

  setupErrorClickHandler(li, errorIdx, root);

  const imagesContainer = createErrorImagesContainer(test, error, errorIdx, root);
  if (imagesContainer) {
    li.appendChild(imagesContainer);
  }

  const buttonsRow = document.createElement('div');
  buttonsRow.style.display = 'flex';
  buttonsRow.style.gap = '8px';
  buttonsRow.style.marginTop = '8px';

  const addImgBtn = document.createElement('button');
  addImgBtn.className = 'btn small';
  addImgBtn.textContent = '+ Adicionar imagem';
  addImgBtn.onclick = async () => {
    await addImagesToError(test, errorIdx);
  };

  buttonsRow.appendChild(addImgBtn);
  li.appendChild(buttonsRow);

  return li;
}

function renderErrorsList(test, root) {
  if (!test.errors) test.errors = [];
  if (!test.observations) test.observations = [];
  if (!test.errorAttachments) test.errorAttachments = [];

  const errorsList = $('.errors-list', root);
  errorsList.innerHTML = '';
  if (test.errors.length === 0) {
    errorsList.innerHTML = '<li class="muted">Nenhum erro registrado.</li>';
    return;
  }

  test.errors.forEach((e, idx) => {
    const li = createErrorListItem(test, e, idx, root);

    // Adicionar botão para converter em ponto de atenção
    const convertBtn = document.createElement('button');
    convertBtn.className = 'btn small';
    convertBtn.textContent = '→ Ponto de Atenção';
    convertBtn.style.marginTop = '8px';
    convertBtn.style.marginBottom = '8px';
    convertBtn.onclick = async () => {
      const shouldConvert = await showAppConfirm(
        'Converter este erro em ponto de atenção? Todos os dados (texto e imagens) serão preservados.',
        {
          title: 'Converter erro',
          confirmText: 'Converter',
        }
      );
      if (!shouldConvert) return;
      convertErrorToAttentionPoint(test, idx);
    };

    // Adicionar o botão antes dos botões de adicionar imagem
    const buttonsRow = li.querySelector('div[style*="display: flex"]');
    if (buttonsRow && buttonsRow.style.display === 'flex' && buttonsRow.querySelector('.btn.small')) {
      buttonsRow.insertBefore(convertBtn, buttonsRow.firstChild);
    } else {
      // Se não encontrar, adicionar após a linha de texto
      const textRow = li.querySelector('div[style*="display: flex"]');
      if (textRow) {
        const newRow = document.createElement('div');
        newRow.style.display = 'flex';
        newRow.style.gap = '8px';
        newRow.style.marginTop = '8px';
        newRow.appendChild(convertBtn);
        textRow.parentNode.insertBefore(newRow, textRow.nextSibling);
      }
    }

    errorsList.appendChild(li);
  });
}

// Criar elemento de imagem para ponto de atenção
function createAttentionPointImageElement(test, attentionPointIdx, imgPath, imgIdx) {
  const imgDiv = document.createElement('div');
  imgDiv.style.position = 'relative';

  const img = createLazyImageElement();
  img.src = getImageUrl(test, imgPath, 'attachments');
  img.style.width = '100%';
  img.style.height = '100px';
  img.style.objectFit = 'cover';
  img.style.borderRadius = '8px';
  img.style.border = '1px solid var(--border)';

  img.onerror = () => {
    if (img.src.startsWith('http')) {
      img.src = `file://${imgPath}`;
    }
  };

  const removeImgBtn = document.createElement('button');
  removeImgBtn.className = 'icon-btn';
  removeImgBtn.style.position = 'absolute';
  removeImgBtn.style.top = '4px';
  removeImgBtn.style.right = '4px';
  removeImgBtn.style.background = 'rgba(0,0,0,0.7)';
  addTrashIcon(removeImgBtn);
  removeImgBtn.title = 'Remover imagem';
  removeImgBtn.onclick = () => removeAttentionPointImage(test, attentionPointIdx, imgIdx);

  imgDiv.appendChild(img);
  imgDiv.appendChild(removeImgBtn);
  return imgDiv;
}

function createAttentionPointImagesContainer(test, attentionPoint, attentionPointIdx, root) {
  if (!attentionPoint.images || attentionPoint.images.length === 0) {
    return null;
  }

  const imagesContainer = document.createElement('div');
  imagesContainer.style.display = 'grid';
  imagesContainer.style.gridTemplateColumns = 'repeat(auto-fill, minmax(150px, 1fr))';
  imagesContainer.style.gap = '8px';
  imagesContainer.style.marginTop = '8px';

  attentionPoint.images.forEach((imgPath, imgIdx) => {
    const imgDiv = createAttentionPointImageElement(test, attentionPointIdx, imgPath, imgIdx);
    imagesContainer.appendChild(imgDiv);
  });

  return imagesContainer;
}

function setupAttentionPointClickHandler(li, attentionPointIdx, root) {
  li.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    activeAttentionPointIndex = attentionPointIdx;
    $$('.attention-points-list li', root).forEach((item, i) => {
      if (i === attentionPointIdx) {
        item.style.border = '2px solid var(--accent, #7c3aed)';
        item.style.boxShadow = '0 0 0 2px rgba(124, 58, 237, 0.2)';
      } else {
        item.style.border = '1px solid var(--border)';
        item.style.boxShadow = 'none';
      }
    });
  });
}

function createAttentionPointListItem(test, attentionPoint, attentionPointIdx, root) {
  if (!attentionPoint.images) attentionPoint.images = [];

  const li = document.createElement('li');
  li.style.display = 'flex';
  li.style.flexDirection = 'column';
  li.style.gap = '8px';
  li.style.marginBottom = '16px';
  li.style.padding = '12px';
  li.style.background = 'var(--card-hi)';
  li.style.borderRadius = '8px';
  li.style.border = '1px solid var(--border)';
  li.dataset.attentionPointIndex = attentionPointIdx;

  if (activeAttentionPointIndex === attentionPointIdx) {
    li.style.border = '2px solid var(--accent, #7c3aed)';
    li.style.boxShadow = '0 0 0 2px rgba(124, 58, 237, 0.2)';
  }

  // Verificar se o ponto de atenção está vinculado a um cenário
  let scenarioInfo = '';
  if (attentionPoint.scenarioId && test.points) {
    const scenarioIndex = test.points.findIndex(p => {
      const pointId = typeof p === 'object' && p.id ? p.id : null;
      return pointId === attentionPoint.scenarioId;
    });
    if (scenarioIndex !== -1) {
      const scenario = test.points[scenarioIndex];
      const offerCode = typeof scenario === 'object' && scenario.offerCode ? scenario.offerCode : '';
      const offerCodeText = offerCode ? ` - Oferta: ${escapeHtml(offerCode)}` : '';
      scenarioInfo = ` <span style="font-size:0.85em;color:#f7c948;margin-left:8px">[Cenário ${scenarioIndex + 1}${offerCodeText}]</span>`;
    }
  }

  const textRow = document.createElement('div');
  textRow.style.display = 'flex';
  textRow.style.alignItems = 'center';
  textRow.style.gap = '8px';
  textRow.innerHTML = `<span style="flex:1">[${new Date(attentionPoint.at).toLocaleTimeString()}] ${escapeHtml(attentionPoint.text)}${scenarioInfo}</span>`;

  const editBtn = document.createElement('button');
  editBtn.className = 'icon-btn';
  editBtn.textContent = 'E';
  editBtn.title = 'Editar';
  editBtn.onclick = () => editAttentionPoint(test, attentionPointIdx);

  const delBtn = document.createElement('button');
  delBtn.className = 'icon-btn';
  addTrashIcon(delBtn);
  delBtn.title = 'Remover';
  delBtn.onclick = () => removeAttentionPoint(test, attentionPointIdx);

  textRow.appendChild(editBtn);
  textRow.appendChild(delBtn);
  li.appendChild(textRow);

  setupAttentionPointClickHandler(li, attentionPointIdx, root);

  const imagesContainer = createAttentionPointImagesContainer(test, attentionPoint, attentionPointIdx, root);
  if (imagesContainer) {
    li.appendChild(imagesContainer);
  }

  const buttonsRow = document.createElement('div');
  buttonsRow.style.display = 'flex';
  buttonsRow.style.gap = '8px';
  buttonsRow.style.marginTop = '8px';

  const addImgBtn = document.createElement('button');
  addImgBtn.className = 'btn small';
  addImgBtn.textContent = '+ Adicionar imagem';
  addImgBtn.onclick = async () => {
    await addImagesToAttentionPoint(test, attentionPointIdx);
  };

  buttonsRow.appendChild(addImgBtn);
  li.appendChild(buttonsRow);

  return li;
}

function renderAttentionPointsList(test, root) {
  const attentionPointsList = $('.attention-points-list', root);
  if (!attentionPointsList) return;
  attentionPointsList.innerHTML = '';
  if (!test.attentionPoints || test.attentionPoints.length === 0) {
    attentionPointsList.innerHTML = '<li class="muted">Nenhum ponto de atenção registrado.</li>';
    return;
  }

  test.attentionPoints.forEach((attentionPoint, attentionPointIdx) => {
    const li = createAttentionPointListItem(test, attentionPoint, attentionPointIdx, root);
    attentionPointsList.appendChild(li);
  });
}

// ===== Modal de Detalhes =====
function setupAttachmentListeners(root) {
  const errorAttachmentsSection = $('.error-attachments', root);

  if (errorAttachmentsSection) {
    const handleErrorAttachmentsClick = (e) => {
      if (e.target.closest('[data-act="addErrorImages"]')) return;
      activeImageField = 'errorAttachments';
      activeErrorIndex = null;
      activePointIndex = null;
    };
    errorAttachmentsSection.addEventListener('click', handleErrorAttachmentsClick);
    errorAttachmentsSection.addEventListener('mousedown', () => {
      activeImageField = 'errorAttachments';
      activeErrorIndex = null;
      activePointIndex = null;
    });
  }
}

function setupDetailModalButtons(t) {
  const bind = (selector, handler) => {
    const btn = $(selector);
    if (btn) btn.onclick = handler;
  };
  bind('[data-detail-act="start"]', () => { startTest(t); refreshDetailIfOpen(t); });
  bind('[data-detail-act="pause"]', () => { pauseTest(t); refreshDetailIfOpen(t); });
  bind('[data-detail-act="stop"]', () => { openValidateModal(t); });
  bind('[data-detail-act="report"]', () => exportReport(t));
  bind('[data-detail-act="reportPdf"]', () => exportReportPdf(t));
  bind('[data-detail-act="reportMd"]', () => exportReportMarkdown(t));
  bind('[data-detail-act="reportSimple"]', () => exportReportSimple(t));
  bind('[data-detail-act="reportDocx"]', () => exportReportDocx(t));
  bind('[data-detail-act="edit"]', () => { closeDetail(); openModal(t); });
  bind('[data-detail-act="remove"]', async () => {
    const ok = await showAppConfirm('Remover este teste? Esta ação não pode ser desfeita.', {
      title: 'Remover teste',
      confirmText: 'Remover',
    });
    if (!ok) return;
    closeDetail();
    removeTest(t);
  });
}

function setupValidationButton(t) {
  // Procurar no novo layout (.detail-footer) ou no layout antigo (.modal-footer)
  const modalFooter = $('.detail-footer') || $('.modal-footer');
  if (!modalFooter) {
    console.warn('Footer do modal não encontrado');
    return;
  }

  const existingValidationBtn = modalFooter.querySelector('.validation-status-btn');
  if (existingValidationBtn) {
    existingValidationBtn.remove();
  }

  if (t.status !== 'completed' || t.validated === null) return;

  const validationStatusBtn = document.createElement('button');
  validationStatusBtn.className = 'btn small validation-status-btn';

  if (t.validated === false) {
    validationStatusBtn.textContent = 'Marcar como Validada';
    validationStatusBtn.onclick = async () => {
      const shouldValidate = await showAppConfirm(
        'Deseja alterar o status desta atividade para Validada?',
        {
          title: 'Alterar validação',
          confirmText: 'Marcar validada',
        }
      );
      if (!shouldValidate) return;
      t.validated = true;
      save();
      renderList();
      refreshDetailIfOpen(t);
    };
  } else if (t.validated === true) {
    validationStatusBtn.textContent = 'Marcar como Não Validada';
    validationStatusBtn.onclick = async () => {
      const shouldInvalidate = await showAppConfirm(
        'Deseja alterar o status desta atividade para Não Validada?',
        {
          title: 'Alterar validação',
          confirmText: 'Marcar não validada',
        }
      );
      if (!shouldInvalidate) return;
      t.validated = false;
      save();
      renderList();
      refreshDetailIfOpen(t);
    };
  }

  // Adicionar ao primeiro grupo de ações do footer
  const firstActionGroup = modalFooter.querySelector('.detail-footer-actions') || modalFooter;
  firstActionGroup.appendChild(validationStatusBtn);
}

function openDetail(t) {
  currentDetailTest = t;
  setupDetailModal(t);

  // Limpar páginas anteriores
  $$('.detail-page').forEach(page => {
    page.innerHTML = '';
    page.classList.remove('active', 'hidden');
  });

  // Criar e popular páginas
  const generalPage = createGeneralInfoPage(t);
  $('#pageGeneral').appendChild(generalPage);

  const scenariosPage = createScenariosPage();
  $('#pageScenarios').appendChild(scenariosPage);

  const suggestionsPage = createSuggestionsPage();
  $('#pageSuggestions').appendChild(suggestionsPage);

  const errorsPage = createErrorsPage();
  $('#pageErrors').appendChild(errorsPage);

  const observationsPage = createObservationsPage();
  $('#pageObservations').appendChild(observationsPage);

  const attentionPage = createAttentionPage();
  $('#pageAttention').appendChild(attentionPage);

  // Inicializa ícones após criar todas as páginas
  if (typeof lucide !== 'undefined') {
    lucide.createIcons($('#detailModal'));
  }

  // Renderizar listas em cada página específica
  renderPointsList(t, $('#pageScenarios'));
  renderCommentsList(t, $('#pageSuggestions'));
  renderErrorsList(t, $('#pageErrors'));
  renderObservationsList(t, $('#pageObservations'));
  renderAttentionPointsList(t, $('#pageAttention'));

  // Inicializa ícones após renderizar todas as listas
  if (typeof lucide !== 'undefined') {
    lucide.createIcons($('#detailModal'));
  }

  // Popular selects (precisam estar acessíveis nas páginas corretas)
  populateScenarioSelect(t, $('#pageErrors'));
  populateScenarioSelect(t, $('#pageAttention'), '.attention-point-scenario-select');
  populateScenarioSelect(t, $('#pageObservations'), '.observation-scenario-select');

  setupAttachmentListeners(document);
  activeErrorIndex = null;
  activePointIndex = null;
  activeAttentionPointIndex = null;

  setupDetailModalButtons(t);
  setupValidationButton(t);
  updateDetailProgressBar(t);
  enableDetailInputs(document);
  updateDetailMainButtons(t);

  const modal = $('#detailModal');
  if (!modal) {
    console.error('Modal #detailModal não encontrado!');
    return;
  }

  console.log('Removendo classe hidden do modal');
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  modal.dataset.id = t.id;

  console.log('Modal exibido. Classes:', modal.className, 'Display:', window.getComputedStyle(modal).display);

  // Iniciar na primeira página
  switchDetailTab('general');

  // Inicializar ícones novamente após exibir o modal
  if (typeof lucide !== 'undefined') {
    setTimeout(() => {
      lucide.createIcons($('#detailModal'));
    }, 100);
  }
}

function closeDetail() {
  const modal = $('#detailModal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  delete modal.dataset.id;
}

function escapeHtml(s) {
  return String(s).replaceAll(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[ch]));
}


function refreshDetailIfOpen(t) {
  const modal = $('#detailModal');
  if (!modal.classList.contains('hidden') && modal.dataset.id === t.id) {
    const currentPage = currentDetailPage;
    openDetail(store.tests.find(x => x.id === t.id));
    switchDetailTab(currentPage);
  }
}

// ====== Funções de apoio do Modal de Detalhes ======

/** Popula um <select> dentro de um container com a lista de cenários (points) do teste. */
function populateScenarioSelect(test, container, selector = '.error-scenario-select') {
  if (!container) return;
  const select = container.querySelector(selector);
  if (!select) return;
  const previousValue = select.value;
  const points = test.points || [];
  const options = ['<option value="">Nenhum cenário (geral)</option>'];
  points.forEach((p, idx) => {
    const id = p.id || String(idx);
    const raw = (p.text || `Cenário ${idx + 1}`).split('\n')[0];
    const label = raw.length > 80 ? raw.slice(0, 77) + '…' : raw;
    options.push(`<option value="${escapeHtml(id)}">${escapeHtml(label)}</option>`);
  });
  select.innerHTML = options.join('');
  if (previousValue && points.some(p => (p.id || '') === previousValue)) {
    select.value = previousValue;
  }
}

/** Atualiza a barra de progresso e os textos do header do modal de detalhes. */
function updateDetailProgressBar(t) {
  const estimateEl = $('#detailEstimate');
  const elapsedEl = $('#detailElapsed');
  const barEl = $('#detailBar');
  if (!estimateEl || !elapsedEl || !barEl) return;
  const elapsedMs = getElapsedMs(t);
  const estMs = Math.max(1, t.estimatedMinutes || 0) * 60000;
  const percent = t.status === 'completed'
    ? 100
    : Math.min(100, Math.round((elapsedMs / estMs) * 100));
  estimateEl.textContent = `${t.estimatedMinutes || 0} min`;
  elapsedEl.textContent = `${(elapsedMs / 60000).toFixed(1)} min`;
  barEl.style.width = percent + '%';
}

/** Habilita/desabilita campos do modal de detalhes conforme o status do teste. */
function enableDetailInputs(root) {
  const scope = root && root.querySelector ? root : document;
  const modal = scope.querySelector ? scope.querySelector('#detailModal') : null;
  if (!modal) return;
  const t = currentDetailTest;
  if (!t) return;
  // Sempre habilitar — usuário pode ajustar dados mesmo após concluir
  modal.querySelectorAll('input, textarea, select').forEach(el => {
    el.disabled = false;
  });
}

/** Atualiza os botões principais (start/pause/stop) do footer do detalhe. */
function updateDetailMainButtons(t) {
  const startBtn = $('[data-detail-act="start"]');
  const pauseBtn = $('[data-detail-act="pause"]');
  const stopBtn = $('[data-detail-act="stop"]');
  if (!startBtn || !pauseBtn || !stopBtn) return;
  const completed = t.status === 'completed';
  const running = t.status === 'running';
  startBtn.disabled = completed || running;
  pauseBtn.disabled = completed || !running;
  stopBtn.disabled = completed;
  stopBtn.textContent = completed ? 'Concluído' : 'Concluir';
}

/** Adiciona um intervalo de tempo manual a partir dos inputs do modal de detalhes. */
function addTimeEntryFromDetail(t) {
  const startEl = $('.new-time-entry-start');
  const endEl = $('.new-time-entry-end');
  const start = startEl?.value;
  const end = endEl?.value;
  if (!start || !end) {
    showAppAlert('Informe início e fim para adicionar um intervalo.');
    return;
  }
  const startTs = fromDateTimeLocalValue(start);
  const endTs = fromDateTimeLocalValue(end);
  if (!startTs || !endTs) {
    showAppAlert('Datas inválidas.');
    return;
  }
  if (endTs <= startTs) {
    showAppAlert('A finalização deve ser depois do início.');
    return;
  }
  if (endTs - startTs < TIME_ENTRY_MIN_DURATION_MS) {
    showAppAlert('O intervalo deve ter pelo menos 1 minuto.');
    return;
  }
  if (!t.timeEntries) t.timeEntries = [];
  t.timeEntries.push({ startAt: startTs, endAt: endTs });
  t.timeEntries.sort((a, b) => (a.startAt || 0) - (b.startAt || 0));
  t.elapsedMs = getElapsedMs(t);
  save();
  renderList();
  refreshDetailIfOpen(t);
}

/** Remove um intervalo de tempo manual após confirmação. */
async function removeTimeEntry(t, idx) {
  const ok = await showAppConfirm('Remover este intervalo de tempo?', {
    title: 'Remover intervalo',
    confirmText: 'Remover',
  });
  if (!ok) return;
  if (!t.timeEntries) return;
  t.timeEntries.splice(idx, 1);
  t.elapsedMs = getElapsedMs(t);
  save();
  renderList();
  refreshDetailIfOpen(t);
}

// ====== Handlers do modal de validação ======
async function onValidatedYes() {
  const id = validateModal.dataset.id;
  closeValidate();
  const t = store.tests.find(x => x.id === id);
  if (!t) return;
  t.validated = true;
  await completeTest(t);
  refreshDetailIfOpen(t);
}

async function onValidatedNo() {
  const id = validateModal.dataset.id;
  closeValidate();
  const t = store.tests.find(x => x.id === id);
  if (!t) return;
  t.validated = false;
  await completeTest(t);
  refreshDetailIfOpen(t);
}

function loadSystemsList() {
  const list = store.settings?.systemsList || ['Web App', 'API', 'Mobile'];
  const ta = $('#systemsListInput');
  if (ta) ta.value = list.join('\n');
  const dl = $('#systemsDatalist');
  if (dl) {
    dl.innerHTML = list.map((s) => `<option value="${escapeHtml(s)}"></option>`).join('');
  }
}

async function saveSystemsList() {
  const raw = $('#systemsListInput')?.value || '';
  const systemsList = raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  if (!store.settings) store.settings = {};
  store.settings.systemsList = systemsList;
  await saveNow();
  loadSystemsList();
  showAppAlert('Lista de sistemas salva.');
}

$('#saveSystemsBtn')?.addEventListener('click', () => saveSystemsList());

await load();
const statusBar = $('#statusBarText');
if (statusBar) statusBar.textContent = `${store.tests.length} teste(s) registrado(s)`;
loadSystemsList();

window.addEventListener('beforeunload', () => {
  if (saveDebounceTimer) {
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = null;
  }
  void saveNow();
});

// Renderizar templates se a página de templates estiver visível
setTimeout(() => {
  const templatesView = $('#templatesView');
  if (templatesView && !templatesView.classList.contains('hidden')) {
    renderTemplates();
  }
}, 100);

// Colar imagem no modal de detalhes (um listener; um IPC por colagem)
document.addEventListener(
  "paste",
  async (e) => {
    const modal = $("#detailModal");
    if (!modal || modal.classList.contains("hidden")) return;
    if (isPastingImage) return;

    try {
      const result = await globalThis.api.getClipboardImage();
      const { imagePath } = extractImageData(result);
      if (!imagePath) return;

      e.preventDefault();
      e.stopPropagation();
      await pasteImage(result);
    } catch (error) {
      console.error("Erro ao processar colagem:", error);
    }
  },
  true,
);

// ====== Validate Modal ======
const validateModal = $('#validateModal');
$('#closeValidate').addEventListener('click', () => closeValidate());
$('#btnValidatedYes').addEventListener('click', () => onValidatedYes());
$('#btnValidatedNo').addEventListener('click', () => onValidatedNo());
function openValidateModal(t) {
  validateModal.dataset.id = t.id;
  validateModal.classList.remove('hidden');
  validateModal.setAttribute('aria-hidden', 'false');
}

function closeValidate() {
  validateModal.classList.add('hidden');
  validateModal.setAttribute('aria-hidden', 'true');
  delete validateModal.dataset.id;
}

// ====== Navegação por Teclado - Acessibilidade ======
// Fechar modais com a tecla Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    // Não fechar se estiver digitando em um input/textarea
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      return;
    }

    // Verificar qual modal está aberto e fechar
    const detailModal = $('#detailModal');
    if (detailModal && !detailModal.classList.contains('hidden')) {
      closeDetail();
      return;
    }

    const modal = $('#modal');
    if (modal && !modal.classList.contains('hidden')) {
      closeModal();
      return;
    }

    const validateModalEl = $('#validateModal');
    if (validateModalEl && !validateModalEl.classList.contains('hidden')) {
      closeValidate();
      return;
    }

    const editItemModal = $('#editItemModal');
    if (editItemModal && !editItemModal.classList.contains('hidden')) {
      closeEditItemModal();
      return;
    }

    const appDialogModal = $('#appDialogModal');
    if (appDialogModal && !appDialogModal.classList.contains('hidden')) {
      $('#appDialogClose')?.click();
      return;
    }
  }
});


