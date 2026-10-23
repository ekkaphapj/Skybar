/* Native form inputs plus a field-aware keyboard for touch / embedded browsers. */
(function (root) {
  "use strict";
  function edit(value, start, end, key, maxLength = 128) {
    start = Number.isInteger(start) ? start : value.length;
    end = Number.isInteger(end) ? end : start;
    if (key === "clear") return { value: "", cursor: 0 };
    if (key === "back") {
      if (start === end && start > 0) start -= Array.from(value.slice(0, start)).at(-1).length;
      return { value: value.slice(0, start) + value.slice(end), cursor: start };
    }
    if (value.length - (end - start) + key.length > maxLength) return { value, cursor: end };
    return { value: value.slice(0, start) + key + value.slice(end), cursor: start + key.length };
  }
  function wire(submit) {
    const get = id => document.getElementById(id);
    const user = get("username-input"), password = get("pin-input"), keyboard = get("pin-keypad");
    let target = user, layout = "alpha", upper = false;
    const render = () => {
      const alpha = layout === "alpha";
      keyboard.classList.toggle("alpha", alpha);
      get("login-keyboard-title").textContent = target === user ? "แป้นพิมพ์ชื่อผู้ใช้" : "แป้นพิมพ์รหัสผ่าน";
      get("login-layout-toggle").textContent = alpha ? "123" : "ABC";
      get("login-keyboard-next").textContent = target === user ? "ถัดไป → รหัสผ่าน" : "← ชื่อผู้ใช้";
      const keys = alpha ? (upper ? "1234567890QWERTYUIOPASDFGHJKLZXCVBNM._-" : "1234567890qwertyuiopasdfghjklzxcvbnm._-").split("") : "1234567890".split("");
      keyboard.innerHTML = keys.map(k => `<button type="button" class="key" data-login-key="${k}">${k}</button>`).join("") + (alpha ? '<button type="button" class="key" data-login-key="shift" aria-label="สลับตัวพิมพ์ใหญ่เล็ก">⇧</button>' : '<button type="button" class="key" data-login-key="back" aria-label="ลบตัวอักษรก่อนหน้า">⌫</button><button type="button" class="key" data-login-key="clear">ล้าง</button>');
    };
    const select = input => { target = input; upper = false; layout = input === user ? "alpha" : "numeric"; render(); };
    user.addEventListener("focus", () => select(user));
    password.addEventListener("focus", () => select(password));
    user.addEventListener("keydown", event => {
      if (event.key === "Enter" && !event.isComposing) { event.preventDefault(); password.focus(); }
    });
    // Prevent keyboard buttons from taking focus away from the text cursor.
    get("login-keyboard").addEventListener("pointerdown", event => { if (event.target.closest("button")) event.preventDefault(); });
    get("login-keyboard").addEventListener("click", event => {
      const key = event.target.closest("[data-login-key]");
      if (!key) return;
      if (key.dataset.loginKey === "shift") { upper = !upper; render(); return; }
      const result = edit(target.value, target.selectionStart, target.selectionEnd, key.dataset.loginKey, target.maxLength > 0 ? target.maxLength : 128);
      target.value = result.value;
      target.setSelectionRange(result.cursor, result.cursor);
      target.dispatchEvent(new Event("input", { bubbles: true }));
      get("login-error").textContent = "";
    });
    get("login-layout-toggle").onclick = () => { layout = layout === "alpha" ? "numeric" : "alpha"; render(); };
    get("login-keyboard-next").onclick = () => (target === user ? password : user).focus();
    get("login-card").onsubmit = event => { event.preventDefault(); if (!event.isComposing) submit(); };
    select(user);
  }
  root.LoginForm = { wire, edit };
})(globalThis);
