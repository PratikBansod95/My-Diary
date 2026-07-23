import katex from "katex";
import "katex/dist/katex.min.css";

export function renderLatex(latex, el) {
  try {
    katex.render(latex, el, {
      throwOnError: false,
      displayMode: true,
    });
  } catch {
    el.textContent = latex;
  }
}
