export function createToolbar({
  root,
  onTool,
  onAsk,
  onGames,
  onNewPage,
  onExport,
  onSettings,
  onAutoDelay,
}) {
  root.querySelectorAll(".tool").forEach((btn) => {
    btn.addEventListener("click", () => {
      root.querySelectorAll(".tool").forEach((el) => el.classList.remove("active"));
      btn.classList.add("active");
      onTool?.(btn.dataset.tool);
    });
  });

  root.querySelector("#askBtn")?.addEventListener("click", () => onAsk?.());
  root.querySelector("#gamesBtn")?.addEventListener("click", () => onGames?.());
  root.querySelector("#newPageBtn")?.addEventListener("click", () => onNewPage?.());
  root.querySelector("#exportBtn")?.addEventListener("click", () => onExport?.());
  root.querySelector("#settingsBtn")?.addEventListener("click", () => onSettings?.());

  const delay = root.querySelector("#autoDelay");
  const delayLabel = root.querySelector("#autoDelayLabel");
  delay?.addEventListener("input", () => {
    delayLabel.textContent = `${delay.value}s`;
    onAutoDelay?.(Number(delay.value));
  });

  function setDelay(value) {
    if (!delay) return;
    delay.value = String(value);
    delayLabel.textContent = `${value}s`;
  }

  return { setDelay };
}
