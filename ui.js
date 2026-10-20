// Модальные окна поверх игры (обычный HTML: так на телефоне работает экранная клавиатура).
import { tr } from "./i18n.js";

function modal(build) {
  return new Promise((resolve) => {
    const back = document.createElement("div");
    back.className = "modal";
    const box = document.createElement("div");
    box.className = "modal-box";
    back.appendChild(box);
    const close = (value) => {
      back.remove();
      resolve(value);
    };
    build(box, close);
    document.body.appendChild(back);
    const focus = box.querySelector("input, button");
    if (focus) focus.focus();
  });
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = tr(text);
  return e;
}

/** Окно подтверждения. Возвращает true/false. */
export function confirmDialog({ title, text, note, ok = "OK", cancel = "ОТМЕНА" }) {
  return modal((box, close) => {
    box.appendChild(el("h2", null, title));
    box.appendChild(el("p", null, text));
    if (note) box.appendChild(el("p", "modal-note", note));
    const row = el("div", "modal-row");
    const yes = el("button", "modal-ok", ok);
    const no = el("button", "modal-cancel", cancel);
    yes.onclick = () => close(true);
    no.onclick = () => close(false);
    row.append(no, yes);
    box.appendChild(row);
  });
}

/** Ввод имени. Возвращает строку или null (отмена). */
export function promptName({ title, text, value }) {
  return modal((box, close) => {
    box.appendChild(el("h2", null, title));
    box.appendChild(el("p", null, text));
    const input = el("input", "modal-input");
    input.type = "text";
    input.maxLength = 16;
    input.value = value || "";
    input.autocomplete = "off";
    input.setAttribute("autocapitalize", "words");
    box.appendChild(input);
    const row = el("div", "modal-row");
    const yes = el("button", "modal-ok", "СОХРАНИТЬ");
    const no = el("button", "modal-cancel", "ОТМЕНА");
    yes.onclick = () => close(input.value);
    no.onclick = () => close(null);
    input.onkeydown = (e) => {
      e.stopPropagation(); // буквы J/K/L в имени не должны бить скелета
      if (e.key === "Enter") close(input.value);
      if (e.key === "Escape") close(null);
    };
    row.append(no, yes);
    box.appendChild(row);
  });
}

export const modalOpen = () => !!document.querySelector(".modal");
