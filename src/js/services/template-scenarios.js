/**
 * Serviço para gerenciar cenários pré-preenchidos dos templates
 */

export const TEMPLATE_SCENARIOS = {
  default: [
    "Verificar se a funcionalidade está acessível e carregando corretamente",
    "Validar os campos obrigatórios e suas validações",
    "Testar o fluxo principal da funcionalidade",
    "Verificar mensagens de erro e sucesso",
    "Validar responsividade em diferentes dispositivos",
    "Testar integração com outras funcionalidades relacionadas",
  ],
  regression: [
    "Executar smoke test do fluxo crítico",
    "Validar regressão em funcionalidades adjacentes",
    "Conferir logs e mensagens de erro conhecidas",
    "Verificar dados persistidos após a operação",
  ],
  api: [
    "Validar contrato da API (status e payload)",
    "Testar cenários de erro (4xx / 5xx)",
    "Verificar autenticação e autorização",
    "Conferir idempotência quando aplicável",
  ],
};

const CUSTOM_TEMPLATES_KEY = "eveCustomTemplates";
const LEGACY_CUSTOM_TEMPLATES_KEY = "qaLiteCustomTemplates";

export function loadCustomTemplates() {
  try {
    const stored =
      localStorage.getItem(CUSTOM_TEMPLATES_KEY) ??
      localStorage.getItem(LEGACY_CUSTOM_TEMPLATES_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (e) {
    console.error("Erro ao carregar templates customizados:", e);
    return {};
  }
}

export function saveCustomTemplates(templates) {
  try {
    localStorage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(templates));
    return true;
  } catch (e) {
    console.error("Erro ao salvar templates customizados:", e);
    return false;
  }
}

export function getTemplateScenarios(template) {
  if (!template) return [];
  if (TEMPLATE_SCENARIOS[template]) return TEMPLATE_SCENARIOS[template];
  const customTemplates = loadCustomTemplates();
  if (customTemplates[template]?.scenarios) {
    return customTemplates[template].scenarios;
  }
  return TEMPLATE_SCENARIOS.default || [];
}

export function getTemplateInfo(templateId) {
  if (!templateId) return null;

  const defaultTemplates = {
    default: {
      id: "default",
      name: "Template Padrão",
      description: "Cenários genéricos para testes funcionais",
      isCustom: false,
    },
    regression: {
      id: "regression",
      name: "Regressão",
      description: "Foco em smoke e regressão",
      isCustom: false,
    },
    api: {
      id: "api",
      name: "API",
      description: "Cenários para testes de API",
      isCustom: false,
    },
  };

  if (defaultTemplates[templateId]) return defaultTemplates[templateId];

  const customTemplates = loadCustomTemplates();
  if (customTemplates[templateId]) {
    return { ...customTemplates[templateId], isCustom: true };
  }
  return null;
}

export function createPointsFromScenarios(scenarioTexts) {
  if (!scenarioTexts?.length) return [];
  return scenarioTexts.map((scenarioText) => ({
    id: crypto.randomUUID(),
    text: scenarioText.trim(),
    images: [],
    offerCode: "",
  }));
}

export function getPrefilledPoints(template, enabled = true) {
  if (!enabled) return [];
  return createPointsFromScenarios(getTemplateScenarios(template));
}

export function createCustomTemplate(name, description, scenarios) {
  const customTemplates = loadCustomTemplates();
  const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  customTemplates[id] = {
    id,
    name: name.trim(),
    description: description.trim(),
    scenarios: (scenarios || []).map((s) => s.trim()).filter((s) => s.length > 0),
    isCustom: true,
    createdAt: Date.now(),
    lastUsed: Date.now(),
  };
  saveCustomTemplates(customTemplates);
  return id;
}

export function updateCustomTemplate(id, name, description, scenarios) {
  const customTemplates = loadCustomTemplates();
  if (!customTemplates[id]) return false;
  customTemplates[id] = {
    ...customTemplates[id],
    name: name.trim(),
    description: description.trim(),
    scenarios: (scenarios || []).map((s) => s.trim()).filter((s) => s.length > 0),
    updatedAt: Date.now(),
  };
  saveCustomTemplates(customTemplates);
  return true;
}

export function deleteCustomTemplate(id) {
  const customTemplates = loadCustomTemplates();
  if (!customTemplates[id]) return false;
  delete customTemplates[id];
  saveCustomTemplates(customTemplates);
  return true;
}

export function getAllCustomTemplates() {
  return loadCustomTemplates();
}
