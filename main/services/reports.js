import { escapeHtml, fileToDataUri } from "../utils/html.js";
import { formatBranches } from "../utils/format.js";

// Funções auxiliares para reduzir complexidade cognitiva
function renderValidationBadge(validated) {
  if (validated === true) {
    return '<span class="badge badge-valid">Validada</span>';
  }
  if (validated === false) {
    return '<span class="badge badge-notvalid">Não validada</span>';
  }
  return "";
}

function renderInfoPills(test, forPdf, fmt, msToMin, branchFront, branchBack, legacyBranch) {
  const pills = [
    ...(forPdf === false ? [
      `<div class="pill">Tempo estimado: ${test.estimatedMinutes} min</div>`,
      `<div class="pill">Tempo decorrido: ${msToMin(test.elapsedMs || 0)} min</div>`
    ] : []),
    `<div class="pill">Sistema: ${escapeHtml(test.system || "—")}</div>`,
    ...(branchFront ? [`<div class="pill">Branch Front: ${escapeHtml(branchFront)}</div>`] : []),
    ...(branchBack ? [`<div class="pill">Branch Back: ${escapeHtml(branchBack)}</div>`] : []),
    ...(legacyBranch ? [`<div class="pill">Branch: ${escapeHtml(legacyBranch)}</div>`] : []),
    ...(test.activityLink ? [`<div class="pill">Atividade: ${escapeHtml(test.activityLink)}</div>`] : []),
    ...(test.finishedAt ? [`<div class="pill">Finished in: ${fmt(test.finishedAt)}</div>`] : [])
  ];
  return pills.join("");
}

function renderErrorWithImages(error, test, forPdf, fmt) {
  const errorImages = error.images || [];
  let scenarioInfo = '';

  // Se o erro está vinculado a um cenário, mostrar o número do cenário e a oferta
  if (error.scenarioId && test.points) {
    const scenarioIndex = test.points.findIndex(p => {
      const pointId = typeof p === 'object' && p.id ? p.id : null;
      return pointId === error.scenarioId;
    });
    if (scenarioIndex !== -1) {
      const scenario = test.points[scenarioIndex];
      const offerCode = typeof scenario === 'object' && scenario.offerCode ? scenario.offerCode : '';
      const offerCodeText = offerCode ? ` - Oferta: ${escapeHtml(offerCode)}` : '';
      scenarioInfo = ` <span style="font-size:0.9em;color:#f7c948;margin-left:8px">[Cenário ${scenarioIndex + 1}${offerCodeText}]</span>`;
    }
  }

  let errorHtml = `<li>[${fmt(error.at)}] ${escapeHtml(error.text)}${scenarioInfo}`;
  if (error.detailedDescription) {
    errorHtml += `<div style="margin-left:16px;margin-top:4px;font-size:0.9em;color:#aaa;white-space:pre-wrap">${escapeHtml(error.detailedDescription)}</div>`;
  }
  errorHtml += `</li>`;
  if (errorImages.length > 0) {
    errorHtml += '<div style="margin-left:20px;margin-top:8px;">';
    errorImages.forEach((imgPath) => {
      const imgSrc = forPdf ? fileToDataUri(imgPath) : `file://${imgPath}`;
      errorHtml += `<p><img src="${imgSrc}" alt="erro" style="max-width:400px;border-radius:8px;"/></p>`;
    });
    errorHtml += '</div>';
  }
  return errorHtml;
}

function renderErrorsSection(test, forPdf, fmt) {
  const errors = (test.errors || []).length > 0 ? test.errors : [];
  if (errors.length === 0) {
    return "<li>—</li>";
  }
  return errors.map((e) => renderErrorWithImages(e, test, forPdf, fmt)).join("");
}

function renderAttachmentsSection(test, forPdf) {
  if ((test.attachments || []).length === 0) {
    return '<p class="muted">Nenhuma imagem anexada.</p>';
  }
  return (test.attachments || [])
    .map((a) => {
      const imgSrc = forPdf ? fileToDataUri(a) : `file://${a}`;
      return `<p><img src="${imgSrc}" alt="anexo"/></p>`;
    })
    .join("");
}

function renderErrorAttachmentsSection(test, forPdf) {
  // Manter compatibilidade com errorAttachments antigos (legado)
  if (!test.errorAttachments || test.errorAttachments.length === 0) {
    return "";
  }
  return `
    <div class="section">
      <h3>Imangens dos erros</h3>
      ${(test.errorAttachments || [])
      .map((a) => {
        const imgSrc = forPdf ? fileToDataUri(a) : `file://${a}`;
        return `<p><img src="${imgSrc}" alt="erro"/></p>`;
      })
      .join("")}
    </div>
  `;
}

function renderAttentionPointWithImages(attentionPoint, test, forPdf, fmt) {
  const attentionPointImages = attentionPoint.images || [];
  let scenarioInfo = '';

  // Se o ponto de atenção está vinculado a um cenário, mostrar o número do cenário e a oferta
  if (attentionPoint.scenarioId && test.points) {
    const scenarioIndex = test.points.findIndex(p => {
      const pointId = typeof p === 'object' && p.id ? p.id : null;
      return pointId === attentionPoint.scenarioId;
    });
    if (scenarioIndex !== -1) {
      const scenario = test.points[scenarioIndex];
      const offerCode = typeof scenario === 'object' && scenario.offerCode ? scenario.offerCode : '';
      const offerCodeText = offerCode ? ` - Oferta: ${escapeHtml(offerCode)}` : '';
      scenarioInfo = ` <span style="font-size:0.9em;color:#f7c948;margin-left:8px">[Cenário ${scenarioIndex + 1}${offerCodeText}]</span>`;
    }
  }

  let attentionPointHtml = `<li>[${fmt(attentionPoint.at)}] ${escapeHtml(attentionPoint.text)}${scenarioInfo}</li>`;
  if (attentionPointImages.length > 0) {
    attentionPointHtml += '<div style="margin-left:20px;margin-top:8px;">';
    attentionPointImages.forEach((imgPath) => {
      const imgSrc = forPdf ? fileToDataUri(imgPath) : `file://${imgPath}`;
      attentionPointHtml += `<p><img src="${imgSrc}" alt="ponto de atenção" style="max-width:400px;border-radius:8px;"/></p>`;
    });
    attentionPointHtml += '</div>';
  }
  return attentionPointHtml;
}

function renderAttentionPointsSection(test, forPdf, fmt) {
  const attentionPoints = (test.attentionPoints || []).length > 0 ? test.attentionPoints : [];
  if (attentionPoints.length === 0) {
    return "";
  }
  return `
    <div class="section">
      <h3>Pontos de atenção</h3>
      <ul>${attentionPoints.map((ap) => renderAttentionPointWithImages(ap, test, forPdf, fmt)).join("")}</ul>
    </div>
  `;
}

/**
 * Gera relatório simplificado para o cliente
 * Mostra apenas: usuários utilizados, observações e sugestões de melhorias
 */
export function buildUserReportHtml(test, forPdf = false) {
  const fmt = (d) => new Date(d).toLocaleDateString("pt-BR");

  const testUsers = test.testUsers || [];
  const usersHtml = testUsers.length > 0
    ? testUsers.map((tu) => `<li>${escapeHtml(tu.user)}</li>`).join('')
    : '<li>Nenhum usuário registrado.</li>';

  return `<!doctype html>
<html lang="pt-br">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Relatório para Cliente - ${escapeHtml(test.title)}</title>
  <style>
    body{font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;background:#0e0621;color:#f3eaff;margin:0;padding:24px}
    .card{background:#1a1033;border:1px solid #3a2670;border-radius:16px;padding:20px;max-width:980px;margin:0 auto;box-shadow:0 10px 30px rgba(0,0,0,.35)}
    h1{margin:0 0 8px;font-size:28px}
    h3{margin:0 0 8px;font-size:16px;color:#e9d5ff}
    .muted{color:#cbb7ff}
    .section{margin-top:12px;background:#160b2f;border:1px solid #3a2670;border-radius:14px;padding:12px}
    ul{margin:0 0 18px;padding-left:20px}
    li{margin-bottom:8px}
    .info-item{margin-bottom:8px}
    .info-label{font-weight:600;color:#e9d5ff}
  </style>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
</head>
<body>
  <div class="card">
    <h1>${escapeHtml(test.title)}</h1>
    
    <div class="section">
      <h3>Informações do Teste</h3>
      <div class="info-item">
        <span class="info-label">Usuários utilizados para testes:</span>
        <ul style="margin-top:8px;margin-bottom:0">${usersHtml}</ul>
      </div>
      ${test.products ? `<div class="info-item"><span class="info-label">Produtos ou marcas utilizadas:</span> ${escapeHtml(test.products)}</div>` : ''}
      ${test.offersCodes ? `<div class="info-item"><span class="info-label">Código das ofertas/negociações:</span> ${escapeHtml(test.offersCodes)}</div>` : ''}
      ${test.finishedAt ? `<div class="info-item"><span class="info-label">Finished in:</span> ${fmt(test.finishedAt)}</div>` : ''}
      
    </div>
    
    <div class="section">
      <h3>Observações</h3>
      <ul>${((test.observations || []).length > 0
      ? test.observations.map((o) => renderObservationWithImages(o, test, forPdf, fmt)).join("")
      : "<li>Nenhuma observação registrada.</li>")}
    </ul>
    </div>
    
    <div class="section">
      <h3>Sugestões de Melhorias</h3>
      <ul>${(test.comments || []).length > 0
      ? test.comments.map((c) => `<li>${escapeHtml(c.text)}</li>`).join("")
      : "<li>Nenhuma sugestão de melhoria registrada.</li>"
    }</ul>
    </div>
  </div>
</body>
</html>`;
}

export function buildReportHtml(test, forPdf = false) {
  const fmt = (d) => new Date(d).toLocaleDateString("pt-BR");
  const msToMin = (ms) => (ms / 60000).toFixed(1);
  const branchFront = (test.branchFront || "").trim();
  const branchBack = (test.branchBack || "").trim();
  const legacyBranch =
    !branchFront && !branchBack ? formatBranches(test) || "" : "";
  return `<!doctype html>
<html lang="pt-br">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Relatório - ${escapeHtml(test.title)}</title>
  <style>
    body{font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;background:#0e0621;color:#f3eaff;margin:0;padding:24px}
    .card{background:#1a1033;border:1px solid #3a2670;border-radius:16px;padding:20px;max-width:980px;margin:0 auto;box-shadow:0 10px 30px rgba(0,0,0,.35)}
    h1{margin:0 0 8px;font-size:28px}
    h3{margin:0 0 8px;font-size:16px;color:#e9d5ff}
    .muted{color:#cbb7ff}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
    .pill{display:inline-block;background:#2b1766;color:#d9c7ff;border:1px solid #5631c9;border-radius:999px;padding:6px 12px;margin-right:8px;margin-bottom:10px}
    .badge{display:inline-block;padding:6px 12px;border-radius:999px;font-weight:600;margin-right:8px;border:1px solid transparent}
    .badge-valid{background:linear-gradient(135deg,#f7c948,#f59e0b);color:#1b0e05;border-color:#f5c44b;box-shadow:0 8px 24px rgba(245,158,11,.4)}
    .badge-notvalid{background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff;border-color:#ef4444;box-shadow:0 8px 24px rgba(220,38,38,.3)}
    .section{margin-top:12px;background:#160b2f;border:1px solid #3a2670;border-radius:14px;padding:12px}
    img{max-width:100%;border-radius:10px;border:1px solid #3a2670}
    ul{margin:   0 0 18px}
    .code{white-space:pre-wrap;background:#160b2f;padding:12px;border-radius:12px;border:1px solid #3a2670}
  </style>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
</head>
<body>
  <div class="card">
    <h1>${escapeHtml(test.title)}</h1>
    <div class="muted">Criado em ${fmt(test.createdAt)}${test.finishedAt ? ` • Finished in: ${fmt(test.finishedAt)}` : ''} • Status: ${test.status
    }</div>
    <div class="section grid">
      <div>
        ${renderInfoPills(test, forPdf, fmt, msToMin, branchFront, branchBack, legacyBranch)}
      </div>
      <div style="text-align:right">
        ${renderValidationBadge(test.validated)}
      </div>
    </div>
    
    <div class="section">
      <h3>Descrição</h3>
      <div class="code">${escapeHtml(test.description || "")}</div>
    </div>
    <div class="section">
      <h3>Cenários Testados</h3>
      <ul>${(test.points || [])
      .map((p, idx) => {
        const pointText = typeof p === 'string' ? p : p.text;
        const pointImages = typeof p === 'object' && p.images ? p.images : [];
        const pointId = typeof p === 'object' && p.id ? p.id : null;
        const pointOfferCode = typeof p === 'object' && p.offerCode ? p.offerCode : '';
        const pointNumber = idx + 1;

        let html = `<li style="margin-bottom:24px">
          <strong>${pointNumber}. ${escapeHtml(pointText)}</strong>`;

        if (pointOfferCode) {
          html += ` <span style="font-size:0.85em;color:#f7c948;margin-left:8px">[Oferta: ${escapeHtml(pointOfferCode)}]</span>`;
        }

        if (pointId) {
          html += ` <span style="font-size:0.85em;color:#cbb7ff;margin-left:8px">[ID: ${pointId.substring(0, 8)}]</span>`;
        }

        if (pointImages.length > 0) {
          html += '<div style="margin-top:12px">';
          html += '<div style="font-size:0.9em;color:#cbb7ff;margin-bottom:8px;font-weight:600">Imagens da validação</div>';
          html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px">';
          pointImages.forEach(imgPath => {
            const imgSrc = forPdf ? fileToDataUri(imgPath) : `file://${imgPath}`;
            html += `<img src="${imgSrc}" alt="Cenário: ${escapeHtml(pointText)}" style="max-width:100%;border-radius:8px;border:1px solid #3a2670" />`;
          });
          html += '</div>';
          html += '</div>';
        }

        html += '</li>';
        return html;
      })
      .join("")}</ul>
    </div>
    <div class="section">
      <h3>Sugestão de ajuste/melhoria</h3>
      <ul>${(test.comments || [])
      .map((c) => `<li>[${fmt(c.at)}] ${escapeHtml(c.text)}</li>`)
      .join("")}</ul>
    </div>
    <div class="section">
      <h3>Erros</h3>
      <ul>${renderErrorsSection(test, forPdf, fmt)}</ul>
    </div>
    <div class="section">
      <h3>Observações</h3>
      <ul>${((test.observations || []).length > 0 ? test.observations : [])
      .map((o) => {
        let html = `<li>[${fmt(o.at)}] ${escapeHtml(o.text)}`;
        // Mostrar informação sobre imagem vinculada se houver
        if (o.errorAttachmentIndex !== null && o.errorAttachmentIndex !== undefined &&
          test.errorAttachments && test.errorAttachments[o.errorAttachmentIndex]) {
          html += ` <span style="font-size:0.9em;color:#f7c948;margin-left:8px">[Imagem ${o.errorAttachmentIndex + 1}]</span>`;
        }
        html += `</li>`;
        return html;
      })
      .join("") || "<li>—</li>"
    }</ul>
    </div>
    ${renderErrorAttachmentsSection(test, forPdf)}
    ${renderAttentionPointsSection(test, forPdf, fmt)}
  </div>
</body>
</html>`;
}

// Funções auxiliares para reduzir complexidade cognitiva
function getValidationStatus(validated) {
  if (validated === true) {
    return "[OK] Validada";
  }
  if (validated === false) {
    return "[ERRO] Não validada";
  }
  return "—";
}

function renderSimpleInfoItems(test, fmt, branchFront, branchBack, legacyBranch) {
  const items = [
    `<div class="info-item"><strong>Data:</strong> ${fmt(test.createdAt)}</div>`,
    `<div class="info-item"><strong>Sistema:</strong> ${escapeHtml(test.system || "—")}</div>`,
    branchFront ? `<div class="info-item"><strong>Branch Front:</strong> ${escapeHtml(branchFront)}</div>` : null,
    branchBack ? `<div class="info-item"><strong>Branch Back:</strong> ${escapeHtml(branchBack)}</div>` : null,
    legacyBranch ? `<div class="info-item"><strong>Branch:</strong> ${escapeHtml(legacyBranch)}</div>` : null,
    test.activityLink ? `<div class="info-item"><strong>Atividade:</strong> <a href="${escapeHtml(test.activityLink)}" target="_blank">${escapeHtml(test.activityLink)}</a></div>` : null,
    test.finishedAt ? `<div class="info-item"><strong>Finished in:</strong> ${fmt(test.finishedAt)}</div>` : null,
    `<div class="info-item"><strong>Status:</strong> ${getValidationStatus(test.validated)}</div>`,
  ];
  return items.filter(Boolean).join("");
}

function renderSimpleErrorWithImages(error, test, fmt, forPdf = false) {
  const errorImages = error.images || [];
  let scenarioInfo = '';

  // Se o erro está vinculado a um cenário, mostrar o número do cenário e a oferta
  if (error.scenarioId && test.points) {
    const scenarioIndex = test.points.findIndex(p => {
      const pointId = typeof p === 'object' && p.id ? p.id : null;
      return pointId === error.scenarioId;
    });
    if (scenarioIndex !== -1) {
      const scenario = test.points[scenarioIndex];
      const offerCode = typeof scenario === 'object' && scenario.offerCode ? scenario.offerCode : '';
      const offerCodeText = offerCode ? ` - Oferta: ${escapeHtml(offerCode)}` : '';
      scenarioInfo = ` <span style="font-size:0.9em;color:#f7c948;margin-left:8px">[Cenário ${scenarioIndex + 1}${offerCodeText}]</span>`;
    }
  }

  let errorHtml = `<li>[${fmt(error.at)}] ${escapeHtml(error.text)}${scenarioInfo}`;
  if (error.detailedDescription) {
    errorHtml += `<div style="margin-left:16px;margin-top:4px;font-size:0.9em;color:#aaa;white-space:pre-wrap">${escapeHtml(error.detailedDescription)}</div>`;
  }
  errorHtml += `</li>`;
  if (errorImages.length > 0) {
    errorHtml += '<div style="margin-left:20px;margin-top:8px;">';
    errorImages.forEach((imgPath) => {
      const imgSrc = forPdf ? fileToDataUri(imgPath) : `file://${imgPath}`;
      errorHtml += `<img src="${imgSrc}" alt="Imagem de erro" style="max-width:400px;border-radius:8px;margin:8px 0;"/>`;
    });
    errorHtml += '</div>';
  }

  return errorHtml;
}

function renderSimpleErrorsSection(test, fmt, forPdf = false) {
  if (!test.errors || test.errors.length === 0) {
    return "";
  }
  return `
  <div class="section">
    <h2>Erros</h2>
    <ul>
      ${test.errors.map((e) => renderSimpleErrorWithImages(e, test, fmt, forPdf)).join("")}
    </ul>
  </div>
  `;
}

function renderSimpleAttachmentsSection(test, title, attachments, forPdf = false) {
  if (!attachments || attachments.length === 0) {
    return "";
  }
  return `
  <div class="section">
    <h2>${title}</h2>
    ${attachments
      .map((a) => {
        const imgSrc = forPdf ? fileToDataUri(a) : `file://${a}`;
        return `<img src="${imgSrc}" alt="${title}" />`;
      })
      .join("")}
  </div>
  `;
}

function renderSimpleSection(title, content) {
  if (!content) {
    return "";
  }
  return `
  <div class="section">
    <h2>${title}</h2>
    ${content}
  </div>
  `;
}

function buildPointsContent(points, test = null, forPdf = false) {
  if (!points || points.length === 0) {
    return null;
  }
  const items = points.map((p, idx) => {
    const pointText = typeof p === 'string' ? p : p.text;
    const pointImages = typeof p === 'object' && p.images ? p.images : [];
    const pointId = typeof p === 'object' && p.id ? p.id : null;
    const pointOfferCode = typeof p === 'object' && p.offerCode ? p.offerCode : '';
    const pointNumber = idx + 1; // Numeração sequencial

    let html = `<li style="margin-bottom:24px">
      <strong>${pointNumber}. ${escapeHtml(pointText)}</strong>`;

    if (pointOfferCode) {
      html += ` <span style="font-size:0.85em;color:#f7c948;margin-left:8px">[Oferta: ${escapeHtml(pointOfferCode)}]</span>`;
    }

    if (pointId) {
      html += ` <span style="font-size:0.85em;color:#cbb7ff;margin-left:8px">[ID: ${pointId.substring(0, 8)}]</span>`;
    }

    if (pointImages.length > 0 && test) {
      html += '<div style="margin-top:12px">';
      html += '<div style="font-size:0.9em;color:#cbb7ff;margin-bottom:8px;font-weight:600">Imagens da validação</div>';
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px">';
      pointImages.forEach(imgPath => {
        const imgSrc = forPdf ? fileToDataUri(imgPath) : `file://${imgPath}`;
        html += `<img src="${imgSrc}" alt="Cenário: ${escapeHtml(pointText)}" style="max-width:100%;border-radius:8px;border:1px solid #3a2670" />`;
      });
      html += '</div>';
      html += '</div>';
    }

    html += '</li>';
    return html;
  }).join("");
  return `<ul>${items}</ul>`;
}

function buildCommentsContent(comments, fmt) {
  if (!comments || comments.length === 0) {
    return null;
  }
  const items = comments.map((c) => `<li>${escapeHtml(c.text)}</li>`).join("");
  return `<ul>${items}</ul>`;
}

function renderObservationWithImages(observation, test, forPdf, fmt) {
  const observationImages = observation.images || [];
  let scenarioInfo = '';

  // Se a observação está vinculada a um cenário, mostrar o número do cenário e a oferta
  if (observation.scenarioId && test.points) {
    const scenarioIndex = test.points.findIndex(p => {
      const pointId = typeof p === 'object' && p.id ? p.id : null;
      return pointId === observation.scenarioId;
    });
    if (scenarioIndex !== -1) {
      const scenario = test.points[scenarioIndex];
      const offerCode = typeof scenario === 'object' && scenario.offerCode ? scenario.offerCode : '';
      const offerCodeText = offerCode ? ` - Oferta: ${escapeHtml(offerCode)}` : '';
      scenarioInfo = ` <span style="font-size:0.9em;color:#f7c948;margin-left:8px">[Cenário ${scenarioIndex + 1}${offerCodeText}]</span>`;
    }
  }

  let observationHtml = `<li>[${fmt(observation.at)}] ${escapeHtml(observation.text)}${scenarioInfo}</li>`;
  if (observationImages.length > 0) {
    observationHtml += '<div style="margin-left:20px;margin-top:8px;">';
    observationImages.forEach((imgPath) => {
      const imgSrc = forPdf ? fileToDataUri(imgPath) : `file://${imgPath}`;
      observationHtml += `<p><img src="${imgSrc}" alt="observação" style="max-width:400px;border-radius:8px;"/></p>`;
    });
    observationHtml += '</div>';
  }
  return observationHtml;
}

function buildObservationsContent(observations, fmt, test = null, forPdf = false) {
  if (!observations || observations.length === 0) {
    return null;
  }
  const items = observations.map((o) => renderObservationWithImages(o, test, forPdf, fmt)).join("");
  return `<ul>${items}</ul>`;
}

export function buildSimpleReportHtml(test, forPdf = false) {
  const fmt = (d) => new Date(d).toLocaleDateString("pt-BR");
  const branchFront = (test.branchFront || "").trim();
  const branchBack = (test.branchBack || "").trim();
  const legacyBranch =
    !branchFront && !branchBack ? formatBranches(test) || "" : "";

  // Preparar conteúdo das seções para evitar template literals aninhados
  const descriptionContent = test.description
    ? `<div class="text-content">${escapeHtml(test.description)}</div>`
    : null;
  const pointsContent = buildPointsContent(test.points, test, forPdf);
  const commentsContent = buildCommentsContent(test.comments, fmt);
  const observationsContent = buildObservationsContent(test.observations, fmt, test, forPdf);

  return `<!doctype html>
<html lang="pt-br">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Relatório Simplificado - ${escapeHtml(test.title)}</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      line-height: 1.6;
      color: #333;
    }
    h1 {
      color: #2c3e50;
      border-bottom: 3px solid #3498db;
      padding-bottom: 10px;
    }
    h2 {
      color: #34495e;
      margin-top: 30px;
      border-bottom: 2px solid #ecf0f1;
      padding-bottom: 5px;
    }
    h3 {
      color: #555;
      margin-top: 20px;
    }
    p {
      margin: 10px 0;
    }
    ul {
      margin: 10px 0;
      padding-left: 30px;
    }
    li {
      margin: 5px 0;
    }
    img {
      max-width: 100%;
      height: auto;
      margin: 15px 0;
      border: 1px solid #ddd;
      border-radius: 4px;
      display: block;
    }
    .info {
      background: #f8f9fa;
      padding: 15px;
      border-radius: 5px;
      margin: 15px 0;
    }
    .info-item {
      margin: 5px 0;
    }
    .section {
      margin: 20px 0;
    }
    .text-content {
      white-space: pre-wrap;
      background: #f5f5f5;
      padding: 15px;
      border-radius: 5px;
      border-left: 4px solid #3498db;
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(test.title)}</h1>
  
  <div class="info">
    ${renderSimpleInfoItems(test, fmt, branchFront, branchBack, legacyBranch)}
  </div>

  ${renderSimpleSection("Descrição", descriptionContent)}

  ${renderSimpleSection("Cenários Testados", pointsContent)}

  ${renderSimpleSection("Sugestões de Ajuste/Melhoria", commentsContent)}

  ${renderSimpleErrorsSection(test, fmt, forPdf)}

  ${renderSimpleSection("Observações", observationsContent)}

  ${renderSimpleAttachmentsSection(test, "Imagens dos Erros", test.errorAttachments, forPdf)}

</body>
</html>`;
}

