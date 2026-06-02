const $ = (sel) => document.querySelector(sel);

export function openAppDialog({
  title = "Aviso",
  message = "",
  confirmText = "OK",
  cancelText = "Cancelar",
  extraText = "",
  showCancel = false,
  showExtra = false,
} = {}) {
  return new Promise((resolve) => {
    const modal = $("#appDialogModal");
    const titleEl = $("#appDialogTitle");
    const messageEl = $("#appDialogMessage");
    const closeBtn = $("#appDialogClose");
    const cancelBtn = $("#appDialogCancel");
    const extraBtn = $("#appDialogExtra");
    const confirmBtn = $("#appDialogConfirm");
    if (!modal || !titleEl || !messageEl || !confirmBtn || !cancelBtn || !closeBtn) {
      resolve(showExtra ? "cancel" : false);
      return;
    }

    titleEl.textContent = title;
    messageEl.textContent = message;
    confirmBtn.textContent = confirmText;
    cancelBtn.textContent = cancelText;
    cancelBtn.classList.toggle("hidden", !showCancel);
    if (extraBtn) {
      extraBtn.textContent = extraText || "Extra";
      extraBtn.classList.toggle("hidden", !showExtra);
    }

    const cleanup = () => {
      closeBtn.onclick = null;
      cancelBtn.onclick = null;
      if (extraBtn) extraBtn.onclick = null;
      confirmBtn.onclick = null;
      modal.classList.add("hidden");
      modal.setAttribute("aria-hidden", "true");
      if (extraBtn) extraBtn.classList.add("hidden");
    };

    const finish = (result) => {
      cleanup();
      resolve(result);
    };

    closeBtn.onclick = () => finish(showExtra ? "cancel" : false);
    cancelBtn.onclick = () => finish(showExtra ? "cancel" : false);
    if (extraBtn) extraBtn.onclick = () => finish("extra");
    confirmBtn.onclick = () => finish(showExtra ? "confirm" : true);

    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    setTimeout(() => {
      if (showExtra && extraBtn) extraBtn.focus();
      else if (showCancel) cancelBtn.focus();
      else confirmBtn.focus();
    }, 30);
  });
}

export function showAppAlert(message, title = "Aviso") {
  return openAppDialog({
    title,
    message: String(message ?? ""),
    confirmText: "OK",
    showCancel: false,
  });
}

export function showAppConfirm(
  message,
  { title = "Confirmar ação", confirmText = "Confirmar", cancelText = "Cancelar" } = {}
) {
  return openAppDialog({
    title,
    message: String(message ?? ""),
    confirmText,
    cancelText,
    showCancel: true,
  });
}

export function showImportDuplicateChoice(externalId) {
  return openAppDialog({
    title: "Teste duplicado",
    message: `Já existe um teste para a atividade ${externalId || "(sem ID)"}.\n\nO que deseja fazer?`,
    cancelText: "Ignorar",
    extraText: "Criar um Novo",
    confirmText: "Substituir",
    showCancel: true,
    showExtra: true,
  }).then((choice) => {
    if (choice === "confirm") return "replace";
    if (choice === "extra") return "create";
    return "ignore";
  });
}
