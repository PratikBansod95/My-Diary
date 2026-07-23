export function createToolbar({
  root,
  onTool,
  onAsk,
  onNewPage,
  onExport,
  onAutoDelay,
  onAcceptAll,
  onDiscardAll,
  onTheme,
}) {
  root.querySelectorAll(".tool").forEach((btn) => {
    btn.addEventListener("click", () => {
      root.querySelectorAll(".tool").forEach((el) => el.classList.remove("active"));
      btn.classList.add("active");
      onTool?.(btn.dataset.tool);
    });
  });

  root.querySelector("#askBtn")?.addEventListener("click", () => onAsk?.());
  root.querySelector("#newPageBtn")?.addEventListener("click", () => onNewPage?.());
  root.querySelector("#exportBtn")?.addEventListener("click", () => onExport?.());
  root.querySelector("#keepAllBtn")?.addEventListener("click", () => onAcceptAll?.());
  root.querySelector("#discardAllBtn")?.addEventListener("click", () => onDiscardAll?.());

  const delay = root.querySelector("#autoDelay");
  const delayLabel = root.querySelector("#autoDelayLabel");
  delay?.addEventListener("input", () => {
    delayLabel.textContent = `${delay.value}s`;
    onAutoDelay?.(Number(delay.value));
  });

  const theme = root.querySelector("#themeSelect");
  theme?.addEventListener("change", () => onTheme?.(theme.value));

  function setDelay(value) {
    if (!delay) return;
    delay.value = String(value);
    delayLabel.textContent = `${value}s`;
  }

  function setTheme(value) {
    if (theme) theme.value = value;
  }

  return { setDelay, setTheme };
}
