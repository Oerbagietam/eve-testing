/**
 * QA Documentation Generator
 * Electron + Markdown integration
 *
 * Objetivo:
 * Gerar automaticamente arquivos Markdown padronizados de documentação de testes QA,
 * com base nas informações fornecidas pelo usuário através da interface Electron.
 *
 * Recursos:
 *  - Gera relatório em .md (para versionamento)
 *  - Campos automáticos: data, branch, autor, status
 *  - Tabela de cenários dinâmica
 *  - Suporte a anexos (imagens)
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
} from 'docx';

let sharpLib = null;
let sharpConfigured = false;

async function getSharp() {
  if (!sharpLib) {
    const mod = await import('sharp');
    sharpLib = mod.default;
    if (!sharpConfigured) {
      sharpLib.cache({ memory: 50 });
      sharpLib.concurrency(1);
      sharpConfigured = true;
    }
  }
  return sharpLib;
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

/**
 * Mapeia um teste do sistema para o formato de documentação QA
 */
function mapTestToQADoc(test) {
  const fmt = (d) => new Date(d).toLocaleDateString('pt-BR');
  const fmtTime = (d) => new Date(d).toLocaleTimeString('pt-BR');
  const msToMin = (ms) => (ms / 60000).toFixed(1);
  
  return {
    title: test.title,
    createdAt: test.createdAt,
    status: test.status,
    estimatedMinutes: test.estimatedMinutes,
    elapsedMs: test.elapsedMs || 0,
    system: test.system || '—',
    branchFront: test.branchFront || '',
    branchBack: test.branchBack || '',
    branch: formatBranches(test),
    activityLink: test.activityLink || '',
    validated: test.validated,
    description: test.description || '',
    points: test.points || [],
    comments: test.comments || [],
    errors: test.errors || [],
    observations: test.observations || [],
    attachments: test.attachments || [],
    errorAttachments: test.errorAttachments || [], // Legado, mantido para compatibilidade
    attentionPoints: test.attentionPoints || [],
    testUsers: test.testUsers || [],
    products: test.products || '',
    offersCodes: test.offersCodes || '',
    fmt,
    fmtTime,
    msToMin
  };
}

/**
 * Converte uma imagem para base64 data URI com compressão e redimensionamento
 * para reduzir o tamanho do payload e evitar erro 413 no remoto
 */
async function imageToDataUri(imgPath) {
  try {
    if (!fs.existsSync(imgPath)) return '';
    
    const ext = path.extname(imgPath).toLowerCase();
    const isPng = ext === '.png';           
    const isGif = ext === '.gif';
    
    // Configurações de compressão agressiva para reduzir tamanho
    const MAX_WIDTH = 1024; // Largura máxima reduzida
    const MAX_HEIGHT = 1024; // Altura máxima reduzida
    const JPEG_QUALITY = 65; // Qualidade JPEG reduzida (0-100)
    
    const sharp = await getSharp();
    let image = sharp(imgPath);
    const metadata = await image.metadata();
    
    // Redimensionar sempre para garantir tamanho máximo (mantém proporção)
    image = image.resize(MAX_WIDTH, MAX_HEIGHT, {
      fit: 'inside',
      withoutEnlargement: true
    });
    
    // Converter TODAS as imagens para JPEG para máxima compressão
    // PNGs com transparência recebem fundo branco antes da conversão
    let outputBuffer;
    const mime = 'image/jpeg';
    
    if (isPng && metadata.hasAlpha) {
      // PNG com transparência: adiciona fundo branco e converte para JPEG
      outputBuffer = await image
        .flatten({ background: { r: 255, g: 255, b: 255 } }) // Fundo branco
        .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
        .toBuffer();
    } else if (isGif) {
      // GIF: converte primeiro frame para JPEG
      outputBuffer = await image
        .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
        .toBuffer();
    } else {
      // Todos os outros formatos (JPEG, WebP, PNG sem transparência): converte para JPEG
      console.error("Formato de imagem não suportado:", ext);
      return '';
    }
    
    const b64 = outputBuffer.toString('base64');
    return `data:${mime};base64,${b64}`;
  } catch (e) {
    console.error('Erro ao converter imagem para base64:', e);
    // Fallback: tenta ler o arquivo original sem compressão
    try {
      const buf = fs.readFileSync(imgPath);
      const ext = path.extname(imgPath).toLowerCase();
      let mime = 'application/octet-stream';
      if (ext === '.png') {
        mime = 'image/png';
      } else if (ext === '.jpg' || ext === '.jpeg') {
        mime = 'image/jpeg';
      } else if (ext === '.gif') {
        mime = 'image/gif';
      } else if (ext === '.webp') {
        mime = 'image/webp';
      }
      const b64 = buf.toString('base64');
      return `data:${mime};base64,${b64}`;
    } catch (fallbackError) {
      console.error('Erro no fallback:', fallbackError);
      return '';
    }
  }
}

// Funções auxiliares para reduzir complexidade cognitiva
function getValidationBadge(validated) {
  if (validated === true) {
    return '**Validada**';
  }
  if (validated === false) {
    return '**Não validada**';
  }
  return '';
}

function buildInfoPills(doc, escapeMd) {
  const infoPills = [];
  infoPills.push(`**Sistema:** ${escapeMd(doc.system)}`);
  if (doc.branchFront) {
    infoPills.push(`**Branch Front:** ${escapeMd(doc.branchFront)}`);
  }
  if (doc.branchBack) {
    infoPills.push(`**Branch Back:** ${escapeMd(doc.branchBack)}`);
  }
  if (!doc.branchFront && !doc.branchBack && doc.branch) {
    infoPills.push(`**Branch:** ${escapeMd(doc.branch)}`);
  }
  if (doc.activityLink) {
    infoPills.push(`**Atividade:** ${escapeMd(doc.activityLink)}`);
  }
  if (doc.finishedAt) {
    infoPills.push(`**Finished in:** ${new Date(doc.finishedAt).toLocaleDateString('pt-BR')}`);
  }

  return infoPills;
}

function buildMarkdownHeader(doc, fmt, escapeMd) {
  const validationBadge = getValidationBadge(doc.validated);
  const infoPills = buildInfoPills(doc, escapeMd);
  
  return `# ${escapeMd(doc.title)}

**Criado em:** ${fmt(doc.createdAt)}${doc.finishedAt ? ` • **Finished in:** ${fmt(doc.finishedAt)}` : ''} • **Status:** ${escapeMd(doc.status)}
${validationBadge ? `\n${validationBadge}` : ''}

---

${infoPills.map(p => `- ${p}`).join('\n')}
`;
}

function buildDescriptionSection(doc) {
  return `
---

## Descrição

${doc.description || '—'}
`;
}

async function buildScenariosSection(doc, escapeMd, imageUrlMap, embedImages) {
  let section = `
---

## Cenários Testados

`;
  if (doc.points && doc.points.length > 0) {
    for (let idx = 0; idx < doc.points.length; idx++) {
      const point = doc.points[idx];
      const pointNumber = idx + 1; // Garantir numeração sequencial
      const pointText = typeof point === 'string' ? point : point.text;
      const pointImages = typeof point === 'object' && point.images ? point.images : [];
      const pointOfferCode = typeof point === 'object' && point.offerCode ? point.offerCode : '';

      const offerCodeText = pointOfferCode ? ` *(Oferta: ${escapeMd(pointOfferCode)})*` : '';
      section += `**${pointNumber}.** ${escapeMd(pointText)}${offerCodeText}\n`;

      if (pointImages.length > 0) {
        section += `\n**Imagens da validação:**\n\n`;
        for (let imgIdx = 0; imgIdx < pointImages.length; imgIdx++) {
          const imgPath = pointImages[imgIdx];
          const imageUrl = await getImageUrl(imgPath, doc, imageUrlMap, embedImages, imgIdx, null, idx);

          if (imageUrl) {
            section += `![Cenário ${pointNumber} - Imagem ${imgIdx + 1}](${imageUrl})\n\n`;
          } else {
            section += `![Cenário ${pointNumber} - Imagem ${imgIdx + 1}](imagem não encontrada)\n\n`;
          }
        }
      }

      if (idx < doc.points.length - 1) {
        section += `\n`;
      }
    }
  } else {
    section += `- Nenhum cenário adicionado.\n`;
  }
  return section;
}

function buildSuggestionsSection(doc, escapeMd) {
  let section = `
---

## Sugestão de ajuste/melhoria

`;
  if (doc.comments && doc.comments.length > 0) {
    doc.comments.forEach(c => {
      section += `- ${escapeMd(c.text)}\n`;
    });
  } else {
    section += `- Nenhuma sugestão adicionada.\n`;
  }
  return section;
}

async function buildObservationsSection(doc, escapeMd, imageUrlMap = {}, embedImages = false) {
  let section = `
---

## Observações

`;
  if (doc.observations && doc.observations.length > 0) {
    for (const o of doc.observations) {
      let observationText = `- ${escapeMd(o.text)}`;
      
      // Mostrar informação sobre cenário vinculado se houver
      if (o.scenarioId && doc.points) {
        const scenarioIndex = doc.points.findIndex(p => {
          const pointId = typeof p === 'object' && p.id ? p.id : null;
          return pointId === o.scenarioId;
        });
        if (scenarioIndex !== -1) {
          const scenario = doc.points[scenarioIndex];
          const offerCode = typeof scenario === 'object' && scenario.offerCode ? scenario.offerCode : '';
          const offerCodeText = offerCode ? ` - Oferta: ${escapeMd(offerCode)}` : '';
          observationText += ` *[Cenário ${scenarioIndex + 1}${offerCodeText}]*`;
        }
      }
      
      section += observationText + `\n`;
      
      // Adicionar imagens da observação
      if (o.images && o.images.length > 0) {
        for (const imgPath of o.images) {
          const imgUrl = await getImageUrl(imgPath, doc, imageUrlMap, embedImages, 0, null, null);
          section += `\n![Imagem de observação](${imgUrl})\n\n`;
        }
      }
    }
  } else {
    section += `- Nenhuma observação adicionada.\n`;
  }
  return section;
}

async function getImageUrl(imgPath, doc, imageUrlMap, embedImages, idx, errorIdx = null, pointIdx = null) {
  const remoteUrl = imageUrlMap[imgPath];
  if (remoteUrl) {
    return remoteUrl;
  }
  if (embedImages) {
    const dataUri = await imageToDataUri(imgPath);
    return dataUri || null;
  }
  let prefix;
  if (pointIdx !== null) {
    prefix = `cenario_${String(pointIdx + 1).padStart(2, '0')}_`;
  } else if (errorIdx !== null) {
    prefix = `erro_${String(errorIdx + 1).padStart(2, '0')}_`;
  } else {
    prefix = 'validacao_';
  }
  const suffix = `${String(idx + 1).padStart(2, '0')}`;
  const fileName = `${prefix}${suffix}${path.extname(imgPath)}`;
  return `evidencias/${fileName}`;
}

async function buildErrorImageMarkdown(imgPath, doc, imageUrlMap, embedImages, errorIdx, imgIdx) {
  const imageUrl = await getImageUrl(imgPath, doc, imageUrlMap, embedImages, imgIdx, errorIdx);
  
  if (!imageUrl) {
    return `**Imagem - ${imgIdx + 1}**\n\n![Imagem do erro ${errorIdx + 1}.${imgIdx + 1}](imagem não encontrada)\n\n`;
  }
  
  if (imageUrl.startsWith('evidencias/')) {
    return `**Imagem - ${imgIdx + 1}**\n\n![Imagem do erro ${errorIdx + 1}.${imgIdx + 1}](${imageUrl})\n\n`;
  }
  
  return `**Imagem - ${imgIdx + 1}**\n\n![Imagem do erro ${errorIdx + 1}.${imgIdx + 1}](${imageUrl})\n\n`;
}

async function buildErrorsSection(doc, escapeMd, imageUrlMap, embedImages) {
  let section = `
---

## Erros

`;
  if (!doc.errors || doc.errors.length === 0) {
    section += `- Nenhum erro registrado.\n`;
    return section;
  }
  
  console.log(`[QA-DOC] [ERROS] Total de erros encontrados: ${doc.errors.length}`);
  
  for (let idx = 0; idx < doc.errors.length; idx++) {
    const e = doc.errors[idx];
    
    // Verificar se o erro tem texto válido
    if (!e) {
      console.warn(`[QA-DOC] [ERROS] Erro no índice ${idx} é null/undefined, pulando...`);
      continue;
    }
    
    if (!e.text || typeof e.text !== 'string' || !e.text.trim()) {
      console.warn(`[QA-DOC] [ERROS] Erro no índice ${idx} ignorado: sem texto válido`, e);
      continue; // Pular erros sem texto válido
    }
    
    console.log(`[QA-DOC] [ERROS] Processando erro ${idx + 1}/${doc.errors.length}: "${e.text.substring(0, 50)}..."`);
    
    const errorImages = e.images || [];
    let scenarioInfo = '';
    
    // Se o erro está vinculado a um cenário, mostrar o número do cenário e a oferta
    if (e.scenarioId && doc.points) {
      const scenarioIndex = doc.points.findIndex(p => {
        const pointId = typeof p === 'object' && p.id ? p.id : null;
        return pointId === e.scenarioId;
      });
      if (scenarioIndex !== -1) {
        const scenario = doc.points[scenarioIndex];
        const offerCode = typeof scenario === 'object' && scenario.offerCode ? scenario.offerCode : '';
        const offerCodeText = offerCode ? ` - Oferta: ${escapeMd(offerCode)}` : '';
        scenarioInfo = ` *(Cenário ${scenarioIndex + 1}${offerCodeText})*`;
      }
    }
    
    section += `**Erro:**${scenarioInfo} ${escapeMd(e.text)}\n\n`;
    if(e.detailedDescription){
      section += `**Descrição detalhada:**\n\n${escapeMd(e.detailedDescription)}\n\n`;
    }
    
    if (errorImages.length > 0) {
      for (let imgIdx = 0; imgIdx < errorImages.length; imgIdx++) {
        const imgPath = errorImages[imgIdx];
        section += await buildErrorImageMarkdown(imgPath, doc, imageUrlMap, embedImages, idx, imgIdx);
      }
    }

    section += `\n`;
  }
  
  console.log(`[QA-DOC] [ERROS] Seção de erros gerada com sucesso. Total processado: ${doc.errors.length}`);
  return section;
}

async function buildValidationImageMarkdown(imgPath, doc, imageUrlMap, embedImages, idx) {
  const imageUrl = await getImageUrl(imgPath, doc, imageUrlMap, embedImages, idx);
  
  if (!imageUrl) {
    return `![Imagem de validação ${idx + 1}](imagem não encontrada)\n\n`;
  }
  
  return `![Imagem de validação ${idx + 1}](${imageUrl})\n\n`;
}

async function buildValidationImagesSection(doc, imageUrlMap, embedImages) {
  let section = `
---

## Imagens do aceite/validação

`;
  if (!doc.attachments || doc.attachments.length === 0) {
    section += `Nenhuma imagem anexada.\n`;
    return section;
  }
  
  for (let idx = 0; idx < doc.attachments.length; idx++) {
    const imgPath = doc.attachments[idx];
    section += await buildValidationImageMarkdown(imgPath, doc, imageUrlMap, embedImages, idx);
  }
  return section;
}

async function buildErrorAttachmentsSection(doc, escapeMd, imageUrlMap, embedImages) {
  // Usar attentionPoints (nova estrutura) se disponível, senão usar errorAttachments (legado)
  const attentionPoints = doc.attentionPoints || [];
  const errorAttachments = doc.errorAttachments || [];
  
  if (attentionPoints.length === 0 && errorAttachments.length === 0) {
    return '';
  }
  
  let section = `
---

## Pontos de atenção

`;
  
  // Renderizar attentionPoints (nova estrutura)
  if (attentionPoints.length > 0) {
    for (let idx = 0; idx < attentionPoints.length; idx++) {
      const ap = attentionPoints[idx];
      section += `### Ponto de atenção ${idx + 1}\n\n`;
      section += `${escapeMd(ap.text || '')}\n\n`;
      
      if (ap.images && ap.images.length > 0) {
        for (let imgIdx = 0; imgIdx < ap.images.length; imgIdx++) {
          const imgPath = ap.images[imgIdx];
          const imageUrl = await getImageUrl(imgPath, doc, imageUrlMap, embedImages, imgIdx);
          
          if (imageUrl) {
            section += `![Imagem ${imgIdx + 1}](${imageUrl})\n\n`;
          } else {
            section += `![Imagem ${imgIdx + 1}](imagem não encontrada)\n\n`;
          }
        }
      }
    }
  } else {
    // Fallback para errorAttachments (legado)
    for (let idx = 0; idx < errorAttachments.length; idx++) {
      const imgPath = errorAttachments[idx];
      const imageUrl = await getImageUrl(imgPath, doc, imageUrlMap, embedImages, idx);
      
      if (imageUrl) {
        section += `![Imagem de erro ${idx + 1}](${imageUrl})\n\n`;
      } else {
        section += `![Imagem de erro ${idx + 1}](imagem não encontrada)\n\n`;
      }
    }
  }
  
  return section;
}

/**
 * Gera o conteúdo Markdown formatado seguindo o mesmo formato do HTML
 * @param {Object} doc - Documento QA
 * @param {boolean} embedImages - Se true, embute imagens como base64. Se false, usa caminhos relativos.
 * @param {Object} imageUrlMap - Mapeamento de caminhos de imagens para URLs do remoto (ex: { '/path/to/img.png': 'https://...' })
 */
async function generateMarkdown(doc, embedImages = false, imageUrlMap = {}) {
  const fmt = doc.fmt;
  
  // Função auxiliar para escape básico de Markdown
  const escapeMd = (s) => {
    if (!s) return '';
    return String(s).replaceAll(/([\\`*_{}[\]()#+\-.!])/g, String.raw`\$1`);
  };
  
  let markdown = buildMarkdownHeader(doc, fmt, escapeMd);
  markdown += buildDescriptionSection(doc);
  
  // Usuários utilizados para testes
  const testUsers = doc.testUsers || [];
  if (testUsers.length > 0) {
    markdown += `---\n\n## Usuários Utilizados para Testes\n\n`;
    testUsers.forEach((tu) => {
      markdown += `- ${escapeMd(tu.user)}\n`;
    });
    markdown += `\n`;
  }
  
  // Produtos ou marcas utilizadas
  if (doc.products) {
    markdown += `---\n\n## Produtos ou Marcas Utilizadas\n\n${escapeMd(doc.products)}\n\n`;
  }
  
  // Código das ofertas/negociações
  if (doc.offersCodes) {
    markdown += `---\n\n## Código das Ofertas/Negociações\n\n${escapeMd(doc.offersCodes)}\n\n`;
  }
  
  markdown += await buildScenariosSection(doc, escapeMd, imageUrlMap, embedImages);
  markdown += buildSuggestionsSection(doc, escapeMd);
  markdown += await buildErrorsSection(doc, escapeMd, imageUrlMap, embedImages);
  markdown += await buildObservationsSection(doc, escapeMd, imageUrlMap, embedImages);
  markdown += await buildErrorAttachmentsSection(doc, escapeMd, imageUrlMap, embedImages);
  
  return markdown;
}

/**
 * Gera apenas a página de informações gerais (header, descrição, branchs, produtos, ofertas, etc.)
 */
async function generateGeneralInfoPage(doc, test, embedImages = false, imageUrlMap = {}) {
  const fmt = doc.fmt;
  const escapeMd = (s) => {
    if (!s) return '';
    return String(s).replaceAll(/([\\`*_{}[\]()#+\-.!])/g, String.raw`\$1`);
  };
  
  let markdown = buildMarkdownHeader(doc, fmt, escapeMd);
  markdown += buildDescriptionSection(doc);
  
  // Usuários utilizados
  const testUsers = test.testUsers || [];
  if (testUsers.length > 0) {
    markdown += `---\n\n## Usuários Utilizados para Testes\n\n`;
    testUsers.forEach((tu) => {
      markdown += `- ${escapeMd(tu.user)}\n`;
    });
    markdown += `\n`;
  }
  
  // Produtos ou marcas utilizadas
  if (test.products) {
    markdown += `---\n\n## Produtos ou Marcas Utilizadas\n\n${escapeMd(test.products)}\n\n`;
  }
  
  // Código das ofertas/negociações
  if (test.offersCodes) {
    markdown += `---\n\n## Código das Ofertas/Negociações\n\n${escapeMd(test.offersCodes)}\n\n`;
  }
  
  return markdown;
}

/**
 * Gera apenas a seção de cenários (para páginas separadas)
 */
async function generateScenariosPage(doc, embedImages = false, imageUrlMap = {}) {
  const fmt = doc.fmt;
  const escapeMd = (s) => {
    if (!s) return '';
    return String(s).replaceAll(/([\\`*_{}[\]()#+\-.!])/g, String.raw`\$1`);
  };
  
  // Apenas o header e a seção de cenários (sem informações gerais, que estão em outra página)
  let markdown = buildMarkdownHeader(doc, fmt, escapeMd);
  markdown += await buildScenariosSection(doc, escapeMd, imageUrlMap, embedImages);
  
  return markdown;
}

/**
 * Gera apenas a seção de erros (para páginas separadas)
 */
async function generateErrorsPage(doc, embedImages = false, imageUrlMap = {}) {
  const fmt = doc.fmt;
  const escapeMd = (s) => {
    if (!s) return '';
    return String(s).replaceAll(/([\\`*_{}[\]()#+\-.!])/g, String.raw`\$1`);
  };
  
  let markdown = buildMarkdownHeader(doc, fmt, escapeMd);
  markdown += buildDescriptionSection(doc);
  markdown += await buildErrorsSection(doc, escapeMd, imageUrlMap, embedImages);
  markdown += await buildErrorAttachmentsSection(doc, escapeMd, imageUrlMap, embedImages);
  
  return markdown;
}

/**
 * Gera apenas a seção de observações e sugestões (para páginas separadas)
 */
async function generateObservationsPage(doc, embedImages = false, imageUrlMap = {}) {
  const escapeMd = (s) => {
    if (!s) return '';
    return String(s).replaceAll(/([\\`*_{}[\]()#+\-.!])/g, String.raw`\$1`);
  };
  
  const fmt = doc.fmt;
  let markdown = buildMarkdownHeader(doc, fmt, escapeMd);
  markdown += buildDescriptionSection(doc);
  markdown += await buildObservationsSection(doc, escapeMd, imageUrlMap, embedImages);
  markdown += buildSuggestionsSection(doc, escapeMd);
  
  return markdown;
}

/**
 * Gera o markdown completo a partir de um teste (sem salvar em disco).
 * @param {Object} test - Objeto de teste
 * @param {boolean} embedImages - Se true, embute imagens como base64 (útil para remoto)
 * @param {Object} imageUrlMap - Mapeamento de caminhos de imagens para URLs do remoto
 */
export async function buildMarkdownFromTest(test, embedImages = false, imageUrlMap = {}) {
  const qaDoc = mapTestToQADoc(test);
  return await generateMarkdown(qaDoc, embedImages, imageUrlMap);
}

/**
 * Gera apenas a página de informações gerais
 */
export async function buildGeneralInfoPage(test, embedImages = false, imageUrlMap = {}) {
  const qaDoc = mapTestToQADoc(test);
  return await generateGeneralInfoPage(qaDoc, test, embedImages, imageUrlMap);
}

/**
 * Gera apenas a página de cenários
 */
export async function buildScenariosPage(test, embedImages = false, imageUrlMap = {}) {
  const qaDoc = mapTestToQADoc(test);
  return await generateScenariosPage(qaDoc, embedImages, imageUrlMap);
}

/**
 * Gera apenas a página de erros
 */
export async function buildErrorsPage(test, embedImages = false, imageUrlMap = {}) {
  const qaDoc = mapTestToQADoc(test);
  return await generateErrorsPage(qaDoc, embedImages, imageUrlMap);
}

/**
 * Gera apenas a página de observações e sugestões
 */
export async function buildObservationsPage(test, embedImages = false, imageUrlMap = {}) {
  const qaDoc = mapTestToQADoc(test);
  return await generateObservationsPage(qaDoc, embedImages, imageUrlMap);
}

export async function buildUserMarkdownFromTest(test, embedImages = false, imageUrlMap = {}) {
  const escapeMd = (s) => {
    if (!s) return '';
    return String(s).replaceAll(/([\\`*_{}[\]()#+\-.!])/g, String.raw`\$1`);
  };

  const doc = mapTestToQADoc(test);
  
  // Aplicar regra de versão provisória
  const isProvisional = test.validated === null;
  const titlePrefix = isProvisional ? '[PROVISÓRIO] ' : '';
  
  let markdown = `# ${titlePrefix}${escapeMd(test.title)}\n\n`;
  
  if (isProvisional) {
    markdown += `> **Relatório provisório:** Os testes ainda estão em andamento!\n\n`;
  }
  
  // Informações do Teste
  markdown += `## Informações do Teste\n\n`;
  
  // Usuários utilizados
  const testUsers = test.testUsers || [];
  if (testUsers.length > 0) {
    markdown += `### Usuários utilizados para testes:\n\n`;
    testUsers.forEach((tu) => {
      markdown += `- ${escapeMd(tu.user)}\n`;
    });
    markdown += `\n`;
  } else {
    markdown += `- Nenhum usuário registrado.\n\n`;
  }
  
  // Produtos ou marcas utilizadas
  if (test.products) {
    markdown += `### Produtos ou marcas utilizadas:\n\n${escapeMd(test.products)}\n\n`;
  }
  
  // Código das ofertas/negociações
  if (test.offersCodes) {
    markdown += `### Código das ofertas/negociações:\n\n${escapeMd(test.offersCodes)}\n\n`;
  }

  if (test.finishedAt) {
    markdown += `### Finished in:\n\n${new Date(test.finishedAt).toLocaleDateString('pt-BR')}\n\n`;
  }

  // Observações (texto + imagens, alinhado ao relatório interno / buildObservationsSection)
  markdown += `---\n\n## Observações\n\n`;
  if (doc.observations && doc.observations.length > 0) {
    for (const o of doc.observations) {
      let observationText = `- ${escapeMd(o.text)}`;

      if (o.scenarioId && doc.points) {
        const scenarioIndex = doc.points.findIndex((p) => {
          const pointId = typeof p === 'object' && p.id ? p.id : null;
          return pointId === o.scenarioId;
        });
        if (scenarioIndex !== -1) {
          const scenario = doc.points[scenarioIndex];
          const offerCode = typeof scenario === 'object' && scenario.offerCode ? scenario.offerCode : '';
          const offerCodeText = offerCode ? ` - Oferta: ${escapeMd(offerCode)}` : '';
          observationText += ` *[Cenário ${scenarioIndex + 1}${offerCodeText}]*`;
        }
      }

      markdown += `${observationText}\n`;

      if (o.images && o.images.length > 0) {
        for (const imgPath of o.images) {
          const imgUrl = await getImageUrl(imgPath, doc, imageUrlMap, embedImages, 0, null, null);
          if (imgUrl) {
            markdown += `\n![Evidência da observação](${imgUrl})\n\n`;
          }
        }
      }
    }
  } else {
    markdown += `- Nenhuma observação registrada.\n`;
  }
  
  // Sugestões de Melhorias
  markdown += `\n---\n\n## Sugestões de Melhorias\n\n`;
  if (test.comments && test.comments.length > 0) {
    test.comments.forEach((c) => {
      markdown += `- ${escapeMd(c.text)}\n`;
    });
  } else {
    markdown += `- Nenhuma sugestão de melhoria registrada.\n`;
  }
  
  return markdown;
}

function formatElapsedHoursFromMs(totalMs) {
  const totalMinutes = Math.round((Number(totalMs) || 0) / 60000);
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

function formatElapsedLabelFromMs(totalMs) {
  const safeMs = Math.max(0, Number(totalMs) || 0);
  const totalMinutes = Math.round(safeMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}min`;
  return `${hours}h ${minutes}min`;
}

export function buildPeriodReportMarkdown({
  groupedEntries = [],
  mode = 'daily',
  from,
  to,
  totalActivities = 0,
  repeatedActivitiesCount = 0,
  totalElapsedMs = 0,
}) {
  const modeLabelMap = {
    daily: 'Diário',
    weekly: 'Semanal',
    monthly: 'Mensal',
  };
  const modeLabel = modeLabelMap[mode] || 'Diário';
  const fromLabel = from ? new Date(from).toLocaleDateString('pt-BR') : '—';
  const toLabel = to ? new Date(to).toLocaleDateString('pt-BR') : '—';
  const createdAtLabel = new Date().toLocaleString('pt-BR');

  let markdown = `# Relatório de Testes QA (${modeLabel})\n\n`;
  markdown += `**Gerado em:** ${createdAtLabel}\n`;
  markdown += `**Período:** ${fromLabel} até ${toLabel}\n`;
  markdown += `**Atividades únicas (no período):** ${totalActivities}\n`;
  markdown += `**Total de horas registradas:** ${formatElapsedHoursFromMs(totalElapsedMs)}\n`;
  if (repeatedActivitiesCount > 0) {
    markdown += `**Obs.:** ${repeatedActivitiesCount} atividade(s) com tempo em mais de um período do agrupamento.\n`;
  }
  markdown += `\n`;
  markdown += `---\n\n`;

  if (!groupedEntries.length) {
    markdown += `Nenhuma atividade encontrada para o período informado.\n`;
    return markdown;
  }

  groupedEntries.forEach((group) => {
    markdown += `## ${group.label}\n\n`;
    markdown += `- **Subtotal de atividades:** ${group.items.length}\n`;
    markdown += `- **Subtotal de horas:** ${formatElapsedHoursFromMs(group.totalElapsedMs)}\n\n`;
    markdown += `### Atividades\n\n`;

    group.items.forEach((item, index) => {
      const validationText = item.validated === true ? 'Sim' : item.validated === false ? 'Não' : 'Pendente';
      const title = item.title || 'Sem título';
      const activityLink = item.activityLink || '';
      const elapsedLabel = formatElapsedLabelFromMs(item.elapsedMs);
      const linkLine = activityLink ? `- **Link:** ${activityLink}\n` : '';

      markdown += `#### ${index + 1}. ${title}\n`;
      markdown += linkLine;
      markdown += `- **Tempo decorrido:** ${elapsedLabel}\n`;
      markdown += `- **Validada:** ${validationText}\n\n`;
    });
  });

  return markdown;
}

/**
 * Exporta documentação QA para arquivo Markdown
 */
export async function exportQADocument(test, dialog, mainWindow, getDataDir) {
  // Mapear teste para formato QA
  const qaDoc = mapTestToQADoc(test);
  
  // Gerar nome do arquivo
  const dateStr = new Date(test.createdAt).toISOString().split('T')[0];
  const fileName = `${dateStr}_${test.title
    .replaceAll(/[^a-z0-9-_]+/gi, '_')
    .toLowerCase()}.md`;

  // Solicitar local para salvar
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Salvar documentação QA (Markdown)',
    defaultPath: fileName,
    filters: [
      { name: 'Markdown', extensions: ['md'] },
      { name: 'Todos os arquivos', extensions: ['*'] }
    ]
  });

  if (!result.canceled && result.filePath) {
    const savePath = result.filePath;
    // Gerar conteúdo Markdown
    const markdown = await generateMarkdown(qaDoc);
    
    // Salvar arquivo
    fs.writeFileSync(savePath, markdown, 'utf-8');
    
    // Copiar anexos para diretório relativo ao arquivo markdown se existirem
    const markdownDir = path.dirname(savePath);
    const attachmentsDir = path.join(markdownDir, 'evidencias');
    if (!fs.existsSync(attachmentsDir)) {
      fs.mkdirSync(attachmentsDir, { recursive: true });
    }
    
    // Copy error images from errorAttachments (legacy), attentionPoints, and from errors array
    const errorAttachments = test.errorAttachments || [];
    const attentionPointImages = (test.attentionPoints || []).flatMap(ap => ap.images || []);
    const errorImages = [...errorAttachments, ...attentionPointImages];
    
    errorAttachments.forEach((attachmentPath, idx) => {
      if (fs.existsSync(attachmentPath)) {
        const ext = path.extname(attachmentPath);
        const newName = `erro_legacy_${String(idx + 1).padStart(2, '0')}${ext}`;
        const destPath = path.join(attachmentsDir, newName);
        fs.copyFileSync(attachmentPath, destPath);
      }
    });
    
    // Copy error images from errors array (new structure)
    if (test.errors && Array.isArray(test.errors)) {
      test.errors.forEach((error, errorIdx) => {
        if (error.images && Array.isArray(error.images)) {
          error.images.forEach((imgPath, imgIdx) => {
            if (fs.existsSync(imgPath)) {
              const ext = path.extname(imgPath);
              const newName = `erro_${String(errorIdx + 1).padStart(2, '0')}_${String(imgIdx + 1).padStart(2, '0')}${ext}`;
              const destPath = path.join(attachmentsDir, newName);
              fs.copyFileSync(imgPath, destPath);
            }
          });
        }
      });
    }
    
    // Copy attention point images
    if (test.attentionPoints && Array.isArray(test.attentionPoints)) {
      test.attentionPoints.forEach((attentionPoint, apIdx) => {
        if (attentionPoint.images && Array.isArray(attentionPoint.images)) {
          attentionPoint.images.forEach((imgPath, imgIdx) => {
            if (fs.existsSync(imgPath)) {
              const ext = path.extname(imgPath);
              const newName = `atencao_${String(apIdx + 1).padStart(2, '0')}_${String(imgIdx + 1).padStart(2, '0')}${ext}`;
              const destPath = path.join(attachmentsDir, newName);
              fs.copyFileSync(imgPath, destPath);
            }
          });
        }
      });
    }
    
    // Copiar imagens de validação
    const validationImages = test.attachments || [];
    validationImages.forEach((attachmentPath, idx) => {
      if (fs.existsSync(attachmentPath)) {
        const ext = path.extname(attachmentPath);
        const newName = `validacao_${String(idx + 1).padStart(2, '0')}${ext}`;
        const destPath = path.join(attachmentsDir, newName);
        fs.copyFileSync(attachmentPath, destPath);
      }
    });
    
    // Copiar imagens dos cenários testados
    if (test.points && Array.isArray(test.points)) {
      test.points.forEach((point, pointIdx) => {
        const pointImages = typeof point === 'object' && point.images ? point.images : [];
        pointImages.forEach((imgPath, imgIdx) => {
          if (fs.existsSync(imgPath)) {
            const ext = path.extname(imgPath);
            const newName = `cenario_${String(pointIdx + 1).padStart(2, '0')}_${String(imgIdx + 1).padStart(2, '0')}${ext}`;
            const destPath = path.join(attachmentsDir, newName);
            fs.copyFileSync(imgPath, destPath);
          }
        });
      });
    }
    
    return savePath;
  }
  
  return null;
}

function docxHeading(text, level = HeadingLevel.HEADING_1) {
  return new Paragraph({ text: String(text || ''), heading: level });
}

function docxParagraph(text, bold = false) {
  return new Paragraph({
    children: [new TextRun({ text: String(text ?? ''), bold })],
  });
}

function docxBullet(text) {
  return new Paragraph({
    text: String(text || '—'),
    bullet: { level: 0 },
  });
}

function validationLabel(validated) {
  if (validated === true) return 'Validada';
  if (validated === false) return 'Não validada';
  return 'Pendente';
}

/**
 * Monta parágrafos do relatório Word a partir do teste.
 */
function buildDocxChildren(test) {
  const doc = mapTestToQADoc(test);
  const fmt = doc.fmt;
  const children = [
    docxHeading(doc.title, HeadingLevel.TITLE),
    docxParagraph(`Criado em: ${fmt(doc.createdAt)}`),
    docxParagraph(`Status: ${doc.status} • Validada: ${validationLabel(doc.validated)}`),
    docxParagraph(`Sistema: ${doc.system}`),
  ];

  if (doc.branch) children.push(docxParagraph(`Branch: ${doc.branch}`));
  if (doc.activityLink) children.push(docxParagraph(`Atividade: ${doc.activityLink}`));
  children.push(
    docxParagraph(
      `Tempo estimado: ${doc.estimatedMinutes} min • Decorrido: ${doc.msToMin(doc.elapsedMs)} min`
    )
  );

  children.push(docxHeading('Descrição', HeadingLevel.HEADING_2));
  children.push(docxParagraph(doc.description || '—'));

  if (doc.testUsers?.length) {
    children.push(docxHeading('Usuários de teste', HeadingLevel.HEADING_2));
    doc.testUsers.forEach((tu) => {
      children.push(docxBullet(tu.user || '—'));
    });
  }

  if (doc.products) {
    children.push(docxHeading('Produtos / marcas', HeadingLevel.HEADING_2));
    children.push(docxParagraph(doc.products));
  }
  if (doc.offersCodes) {
    children.push(docxHeading('Códigos de ofertas', HeadingLevel.HEADING_2));
    children.push(docxParagraph(doc.offersCodes));
  }

  if (doc.points?.length) {
    children.push(docxHeading('Cenários testados', HeadingLevel.HEADING_2));
    doc.points.forEach((p, i) => {
      const text = typeof p === 'string' ? p : p.text;
      children.push(docxBullet(`${i + 1}. ${text || '—'}`));
    });
  }

  if (doc.comments?.length) {
    children.push(docxHeading('Sugestões', HeadingLevel.HEADING_2));
    doc.comments.forEach((c) => children.push(docxBullet(c.text || '—')));
  }

  if (doc.errors?.length) {
    children.push(docxHeading('Erros', HeadingLevel.HEADING_2));
    doc.errors.forEach((e, i) => children.push(docxBullet(`${i + 1}. ${e.text || '—'}`)));
  }

  if (doc.observations?.length) {
    children.push(docxHeading('Observações', HeadingLevel.HEADING_2));
    doc.observations.forEach((o, i) => children.push(docxBullet(`${i + 1}. ${o.text || '—'}`)));
  }

  if (doc.attentionPoints?.length) {
    children.push(docxHeading('Pontos de atenção', HeadingLevel.HEADING_2));
    doc.attentionPoints.forEach((a, i) => children.push(docxBullet(`${i + 1}. ${a.text || '—'}`)));
  }

  children.push(
    docxParagraph(`Gerado em ${new Date().toLocaleString('pt-BR')}`, true)
  );

  return children;
}

/**
 * Exporta documentação QA para arquivo Word (.docx)
 */
export async function exportQADocumentDocx(test, dialog, mainWindow) {
  const dateStr = new Date(test.createdAt).toISOString().split('T')[0];
  const baseName = `${dateStr}_${test.title.replaceAll(/[^a-z0-9-_]+/gi, '_').toLowerCase()}`;

  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Salvar documentação QA (Word)',
    defaultPath: `${baseName}.docx`,
    filters: [
      { name: 'Word', extensions: ['docx'] },
      { name: 'Word legado', extensions: ['doc'] },
      { name: 'Todos os arquivos', extensions: ['*'] },
    ],
  });

  if (result.canceled || !result.filePath) return null;

  let savePath = result.filePath;
  if (savePath.toLowerCase().endsWith('.doc') && !savePath.toLowerCase().endsWith('.docx')) {
    savePath = `${savePath.slice(0, -4)}.docx`;
  } else if (!savePath.toLowerCase().endsWith('.docx')) {
    savePath = `${savePath}.docx`;
  }

  const wordDoc = new Document({
    sections: [{ properties: {}, children: buildDocxChildren(test) }],
  });

  const buffer = await Packer.toBuffer(wordDoc);
  fs.writeFileSync(savePath, buffer);
  return savePath;
}
