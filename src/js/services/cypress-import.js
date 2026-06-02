/**
 * Importação de relatórios gerados pelo agente Cypress / qa-tester-agent.
 * Formato: { tests: [{ id, title, activity_url, status, test_points, ... }] }
 */

export function parseCypressImportPayload(raw) {
  if (!raw || typeof raw !== "object") {
    throw new Error("Arquivo JSON inválido.");
  }
  if (!Array.isArray(raw.tests)) {
    throw new Error('JSON inválido: esperado um array "tests".');
  }
  if (raw.tests.length === 0) {
    throw new Error('O JSON não contém nenhum teste em "tests".');
  }
  return raw.tests;
}

function buildDescription(raw) {
  const lines = [];
  if (raw.base_url) lines.push(`URL base: ${raw.base_url}`);
  if (raw.environment) lines.push(`Ambiente: ${raw.environment}`);
  if (raw.cypress_spec) lines.push(`Spec Cypress: ${raw.cypress_spec}`);
  if (raw.triage_notes) lines.push(`Notas de triagem: ${raw.triage_notes}`);
  if (raw.filed_by) lines.push(`Registrado por: ${raw.filed_by}`);
  return lines.join("\n");
}

function buildPointText(tp) {
  const parts = [tp.description].filter(Boolean);
  if (tp.notes) parts.push(`Notas: ${tp.notes}`);
  if (tp.result && tp.result !== "passed") {
    parts.push(`Resultado: ${tp.result}`);
  }
  return parts.join("\n");
}

function mapResultToValidated(status) {
  const s = String(status || "").toLowerCase();
  if (s === "passed") return true;
  if (s === "failed") return false;
  return null;
}

export function mapCypressTestToHubTest(raw, screenshotMap = {}) {
  const externalId = String(raw.id || "").trim();
  const activityLink =
    String(raw.activity_url || raw.task_url || "").trim() ||
    (externalId ? `task://${externalId}` : "");

  const testedAtMs = raw.tested_at ? Date.parse(raw.tested_at) : NaN;
  const createdAt = Number.isFinite(testedAtMs) ? testedAtMs : Date.now();
  const runDurationMs = Math.max(0, Number(raw.run_duration_ms) || 0);
  const estimatedMinutes = Math.max(1, Math.round(runDurationMs / 60000) || 15);

  const points = [];
  const errors = [];
  const testPoints = Array.isArray(raw.test_points) ? raw.test_points : [];

  testPoints.forEach((tp) => {
    const screenshot = String(tp.screenshot || "").trim();
    const localImage =
      screenshot && screenshotMap[screenshot] ? [screenshotMap[screenshot]] : [];
    const text = buildPointText(tp);
    const result = String(tp.result || "passed").toLowerCase();

    points.push({
      id: crypto.randomUUID(),
      text,
      images: [...localImage],
      offerCode: "",
    });

    if (result === "failed" || result === "skipped") {
      errors.push({
        id: crypto.randomUUID(),
        text,
        at: createdAt,
        images: [...localImage],
        scenarioId: null,
      });
    }
  });

  const timeEntries = [];
  if (runDurationMs > 0) {
    const endAt = Number.isFinite(testedAtMs) ? testedAtMs : Date.now();
    timeEntries.push({
      startAt: Math.max(0, endAt - runDurationMs),
      endAt,
    });
  }

  const overallStatus = String(raw.status || "").toLowerCase();
  const validated = mapResultToValidated(overallStatus);

  return {
    id: crypto.randomUUID(),
    title: String(raw.title || externalId || "Teste importado").trim() || "Teste importado",
    description: buildDescription(raw),
    estimatedMinutes,
    system: String(raw.system || "Cypress E2E").trim(),
    branchFront: "",
    branchBack: "",
    branch: "",
    activityLink,
    createdAt,
    status: overallStatus === "blocked" ? "pending" : "completed",
    elapsedMs: runDurationMs,
    timeEntries,
    lastStartedAt: null,
    validated,
    isNew: false,
    isPending: overallStatus === "blocked",
    comments: [],
    points,
    errors,
    observations: [],
    attachments: [],
    errorAttachments: [],
    attentionPoints: [],
    template: "default",
    testUsers: [],
    products: "",
    offersCodes: "",
    clients: "",
    orders: "",
    cypressImport: {
      externalId,
      environment: raw.environment || "",
      baseUrl: raw.base_url || "",
      runDurationMs,
      cypressSpec: raw.cypress_spec || "",
      triageNotes: raw.triage_notes || "",
      filedBy: raw.filed_by || "",
      testedAt: raw.tested_at || "",
      importStatus: raw.status || "",
      importedAt: Date.now(),
    },
  };
}

export function findExistingImportIndex(tests, externalId) {
  if (!externalId) return -1;
  return tests.findIndex((t) => {
    if (t.cypressImport?.externalId === externalId) return true;
    if (t.activityLink && t.activityLink.includes(externalId)) return true;
    return false;
  });
}
