/* ii KKT single-chat glass UI: header calls, detail menu, and composer in one plugin. */
export default {
  manifest: {
    id: "ii-kkt-chat-header-calls",
    name: "kakao经典键位插件",
    apiVersion: 1,
    version: "0.13.1",
    description: "共通日夜图标、语音快捷入口、玻璃顶底栏与窄菜单；回车发送和翻译展开遵循原生设置。",
    permissions: ["ui"],
  },
  setup(ctx) {
    const palette = document.createElement("style");
    palette.dataset.iiKktOriginalArtworkPalette = "true";
    palette.textContent = `@layer ii-kkt-room-palette {
.chat-room-wrapper .chat-input-bar[data-ii-kkt-ready="true"] .chat-input-actions img[data-ii-kkt-art] {
  filter: none !important;
  width:var(--ii-input-icon-size,28px) !important; height:var(--ii-input-icon-size,28px) !important; display:block !important; object-fit:contain !important; pointer-events:none !important;
}
.chat-room-wrapper .chat-input-bar[data-ii-kkt-ready="true"] .chat-input-actions img[data-ii-kkt-art="plus"] { width:var(--ii-input-icon-size,28px) !important; height:var(--ii-input-icon-size,28px) !important; }
.chat-app[data-chat-theme="dark"] .chat-room-wrapper .chat-input-bar[data-ii-kkt-ready="true"] .chat-input-actions img[data-ii-kkt-art] {
  filter: none !important;
}
}`;
    document.head.append(palette);
    const stopHeader = installHeader(ctx);
    const stopComposer = installComposer(ctx);
    const stopQuoteLabels = installQuoteLabels();
    return () => { stopQuoteLabels?.(); stopComposer?.(); stopHeader?.(); palette.remove(); };
  },
};

function installHeader(ctx) {
    const doc = document;
    const phoneIcon = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7l.4 2.7a2 2 0 0 1-.6 1.7L7.1 9.9a16 16 0 0 0 7 7l1.8-1.8a2 2 0 0 1 1.7-.6l2.7.4a2 2 0 0 1 1.7 2Z"/></svg>';
    const videoIcon = '<svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="5" width="14" height="14" rx="2"/><path d="m16 10 6-4v12l-6-4"/></svg>';
    const menuIcon = '<svg data-ii-kkt-menu="" viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18"/></svg>';
    const originals = new Map();
    let queued = false;

    function isSkinned(host) {
      return getComputedStyle(host).getPropertyValue("--ii-kkt-chat-header").trim() === "1";
    }

    function clear(host) {
      host.querySelectorAll("[data-ii-kkt-header-call]").forEach((button) => button.remove());
      const more = host.querySelector('.page-header-right > button[aria-label="更多"]');
      if (more && originals.has(more)) {
        more.innerHTML = originals.get(more);
        originals.delete(more);
      }
    }

    function openNativeCall(host, label) {
      const actions = host.querySelector(".chat-input-bar .chat-input-actions");
      const nativeButtons = actions?.querySelectorAll(":scope > button:not([data-ii-kkt-header-call])");
      const plus = actions?.querySelector(':scope > button[data-ii-kkt-role="plus"]') || nativeButtons?.[3];
      if (!plus || plus.disabled) {
        ctx.ui.toast("当前无法发起通话");
        return;
      }
      if (!host.querySelector(".chat-plus-menu")) plus.click();
      const selectCall = (attempts) => {
        if (!host.isConnected) return;
        const item = [...host.querySelectorAll(".chat-plus-menu-item")]
          .find((node) => node.querySelector("span")?.textContent?.trim() === label);
        if (item) {
          item.click(); // React's existing call handler also closes the plus menu.
        } else if (attempts > 0) {
          requestAnimationFrame(() => selectCall(attempts - 1));
        } else {
          ctx.ui.toast("未找到" + label + "入口");
        }
      };
      requestAnimationFrame(() => selectCall(2));
    }

    function sync() {
      for (const host of doc.querySelectorAll(".chat-room-wrapper")) {
        if (!isSkinned(host)) {
          clear(host);
          continue;
        }
        const right = host.querySelector("header.page-header .page-header-right");
        const more = right?.querySelector(':scope > button[aria-label="更多"]');
        if (!more) continue;
        if (!originals.has(more)) originals.set(more, more.innerHTML);
        if (!more.querySelector("svg[data-ii-kkt-menu]")) more.innerHTML = menuIcon;
        for (const [kind, label, icon] of [["phone", "语音通话", phoneIcon], ["video", "视频通话", videoIcon]]) {
          if (right.querySelector(`[data-ii-kkt-header-call="${kind}"]`)) continue;
          const button = doc.createElement("button");
          button.type = "button";
          button.className = "ii-kkt-header-action";
          button.dataset.iiKktHeaderCall = kind;
          button.setAttribute("aria-label", label);
          button.title = label;
          button.innerHTML = icon;
          button.addEventListener("click", () => openNativeCall(host, label));
          right.insertBefore(button, more);
        }
      }
    }

    function queueSync() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; sync(); });
    }

    const observer = new MutationObserver(queueSync);
    observer.observe(doc.body, { childList: true, subtree: true });
    window.addEventListener("chat-session-css-updated", queueSync);
    queueSync();
    return () => {
      observer.disconnect();
      window.removeEventListener("chat-session-css-updated", queueSync);
      for (const host of doc.querySelectorAll(".chat-room-wrapper")) clear(host);
      originals.clear();
    };
}

function installComposer(ctx) {
    const doc = document;
    const cleanups = new Map();
    const originalIcons = new Map();
    const originalPlaceholders = new Map();
    const messagePlaceholder = "输入一条消息…";
    function syncPlaceholder(input) {
      const current = input.getAttribute("placeholder");
      if (!current && !input.disabled && !input.readOnly) {
        originalPlaceholders.set(input, current);
        input.setAttribute("placeholder", messagePlaceholder);
      }
    }
    function restorePlaceholder(input) {
      if (!originalPlaceholders.has(input)) return;
      if (input.getAttribute("placeholder") === messagePlaceholder) {
        const original = originalPlaceholders.get(input);
        if (original === null) input.removeAttribute("placeholder");
        else input.setAttribute("placeholder", original);
      }
      originalPlaceholders.delete(input);
    }
    const artwork = {
  "day": {
    "plus": "https://imgbed.heliar.top/i/FcYCF8prQ3pUC_QC_plus_day.png",
    "sticker": "https://imgbed.heliar.top/i/TI02qCfGc6JMok3f_smile_day.png",
    "summon": "https://imgbed.heliar.top/i/tuU2Yx8PiBruLAzo_plane_day.png",
    "voice": "https://imgbed.heliar.top/i/2JGJBpaWuNBE3ael_voice_day.png"
  },
  "night": {
    "plus": "https://imgbed.heliar.top/i/NRMuYxQASD_ATMN8_plus_night.png",
    "sticker": "https://imgbed.heliar.top/i/s1jaG38buc3VyKwZ_smile_night.png",
    "summon": "https://imgbed.heliar.top/i/zNV9EpKWHXYlS_kK_plane_night.png",
    "voice": "https://imgbed.heliar.top/i/SZ2YcKknj_HIklgN_voice_night.png"
  }
};
    let queued = false;

    function skinned(host) {
      return getComputedStyle(host).getPropertyValue("--ii-kkt-chat-header").trim() === "1";
    }
    function setAttr(el, name, value) {
      if (el.getAttribute(name) !== value) el.setAttribute(name, value);
    }
    function nativeButtons(host) {
      const actions = host.querySelector('.chat-input-bar[data-ui="input"] .chat-input-actions');
      if (!actions) return null;
      const buttons = [...actions.querySelectorAll(":scope > button:not([data-ii-kkt-voice])")];
      const send = buttons.find(b => ["发送", "停止本轮生成"].includes(b.getAttribute("aria-label")));
      const trigger = buttons.find(b => ["发送输入框内容并触发回复", "触发 AI 主动回复"].includes(b.title));
      const plus = buttons.find(b => b.getAttribute("data-ii-kkt-role") === "plus") || buttons[3];
      if (!plus || !send) return null;
      return { actions, offline: buttons[0], emoji: buttons[1], sticker: buttons[2], plus, send, trigger };
    }
    const icons = {
      plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M7 12h10"/></svg>',
      offline: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0Z"/><circle cx="12" cy="10" r="3"/></svg>',
      emoji: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><circle cx="9" cy="10" r=".8"/><circle cx="15" cy="10" r=".8"/><path d="M8 14c2 3 6 3 8 0"/></svg>',
      sticker: '<svg data-ii-kkt-smile="" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8.2 14c2.2 2.6 5.4 2.6 7.6 0"/><circle cx="9" cy="10" r=".7" fill="currentColor"/><circle cx="15" cy="10" r=".7" fill="currentColor"/></svg>',
      summon: '<svg data-ii-kkt-summon="" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 3 3.8 10.4l7.3 2.4 2.5 7.4L21 3Z"/><path d="m11.1 12.8 5.2-5.2"/></svg>',
    };
    icons.trigger = icons.summon;
    function setIcon(button, role) {
      if (!button) return;
      const host = button.closest(".chat-room-wrapper");
      const theme = host?.closest(".chat-app")?.getAttribute("data-chat-theme") === "dark" ? "night" : "day";
      const cssIcon = getComputedStyle(host).getPropertyValue(`--ii-kkt-icon-${role}-${theme}`).trim();
      const src = cssIcon ? cssIcon.replace(/^url\(["']?(.*?)["']?\)$/, '$1') : artwork[theme][role];
      if (!src) return;
      let img = button.querySelector(`[data-ii-kkt-art="${role}"]`);
      if (!img) {
        if (!originalIcons.has(button)) originalIcons.set(button, button.innerHTML);
        img = doc.createElement("img");
        img.dataset.iiKktArt = role;
        img.alt = "";
        img.setAttribute("aria-hidden", "true");
        img.draggable = false;
        button.replaceChildren(img);
      }
      if (img.getAttribute("src") !== src) img.setAttribute("src", src);
    }
    function clickNative(host, role) {
      const native = nativeButtons(host);
      const target = native?.[role];
      if (!target || target.disabled) return;
      if (host.querySelector(".chat-plus-menu")) native.plus.click();
      requestAnimationFrame(() => { if (target.isConnected && !target.disabled) target.click(); });
    }
    function openVoice(host) {
      const native = nativeButtons(host);
      if (!native || native.plus.disabled) return;
      if (!host.querySelector(".chat-plus-menu")) native.plus.click();
      const choose = (remaining) => {
        if (!host.isConnected) return;
        const item = [...host.querySelectorAll(".chat-plus-menu-item")].find(node => [...node.querySelectorAll("span")].some(span => span.textContent.trim() === "语音条"));
        if (item) item.click();
        else if (remaining > 0) requestAnimationFrame(() => choose(remaining - 1));
        else ctx.ui.toast("未找到语音条入口");
      };
      requestAnimationFrame(() => choose(4));
    }
    function syncVoice(host, native) {
      let button = native.actions.querySelector("[data-ii-kkt-voice]");
      if (!button) {
        button = doc.createElement("button");
        button.type = "button";
        button.dataset.iiKktVoice = "true";
        button.setAttribute("aria-label", "发送语音条");
        button.title = "语音条";
        button.addEventListener("click", () => openVoice(host));
        native.actions.append(button);
      }
      setIcon(button, "voice");
    }
    function syncMenu(host) {
      const menu = host.querySelector('.chat-input-bar[data-ui="input"] > .chat-plus-menu');
      if (!menu) return;
      for (const [role, label] of [["sticker", "表情包"], ["emoji", "Emoji"], ["offline", "线下模式"], ["trigger", "召唤回复"]]) {
        if (menu.querySelector(`[data-ii-kkt-extra="${role}"]`)) continue;
        const item = doc.createElement("button");
        item.type = "button";
        item.className = "chat-plus-menu-item ii-kkt-extra-menu-item";
        item.dataset.iiKktExtra = role;
        item.innerHTML = `<span class="chat-plus-icon-box">${icons[role]}</span><span>${label}</span>`;
        item.addEventListener("click", () => clickNative(host, role));
        menu.append(item);
      }
    }
    function clear(host) {
      const bar = host.querySelector('.chat-input-bar[data-ui="input"]');
      if (!bar) return;
      bar.querySelectorAll("[data-ii-kkt-voice]").forEach(button => button.remove());
      bar.querySelectorAll(".chat-input-textarea").forEach(restorePlaceholder);
      bar.removeAttribute("data-ii-kkt-ready");
      bar.removeAttribute("data-ii-kkt-focus");
      bar.querySelectorAll("[data-ii-kkt-panel]").forEach(p => p.removeAttribute("data-ii-kkt-panel"));
      bar.querySelectorAll("[data-ii-kkt-role]").forEach(b => b.removeAttribute("data-ii-kkt-role"));
      bar.querySelectorAll("[data-ii-kkt-extra]").forEach(b => b.remove());
      for (const [button, markup] of originalIcons) if (bar.contains(button)) {
        button.innerHTML = markup;
        originalIcons.delete(button);
      }
    }
    function sync() {
      for (const host of doc.querySelectorAll('.chat-room-wrapper:not(:has(.chat-room-wrapper))')) {
        const bar = host.querySelector('.chat-input-bar[data-ui="input"]');
        const input = bar?.querySelector('.chat-input-textarea');
        if (!bar || !input) continue;
        if (!skinned(host)) { clear(host); continue; }
        const native = nativeButtons(host);
        if (!native) continue;
        for (const [role, button] of Object.entries(native)) {
          if (button instanceof HTMLButtonElement) setAttr(button, "data-ii-kkt-role", role);
        }
        syncPlaceholder(input);
        syncVoice(host, native);
        setIcon(native.plus, "plus");
        setIcon(native.sticker, "sticker");
        setIcon(native.trigger, "summon");
        setAttr(bar, "data-ii-kkt-ready", "true");
        setAttr(bar, "data-ii-kkt-generating", String(native.send.getAttribute("aria-label") === "停止本轮生成"));
        if (!cleanups.has(input)) {
          let blurTimer;
          const onFocus = () => { clearTimeout(blurTimer); setAttr(bar, "data-ii-kkt-focus", "true"); };
          const onBlur = () => { blurTimer = setTimeout(() => {
            if (!input.value.trim() && doc.activeElement !== input) setAttr(bar, "data-ii-kkt-focus", "false");
          }, 160); };
          const onInput = () => setAttr(bar, "data-ii-kkt-focus", String(!!input.value.trim() || doc.activeElement === input));
          input.addEventListener("focus", onFocus);
          input.addEventListener("blur", onBlur);
          input.addEventListener("input", onInput);
          cleanups.set(input, () => { clearTimeout(blurTimer); input.removeEventListener("focus", onFocus); input.removeEventListener("blur", onBlur); input.removeEventListener("input", onInput); });
        }
        setAttr(bar, "data-ii-kkt-focus", String(!!input.value.trim() || doc.activeElement === input || bar.getAttribute("data-ii-kkt-focus") === "true"));
        for (const child of bar.children) {
          if (child.classList?.contains("h-[220px]")) setAttr(child, "data-ii-kkt-panel", "true");
        }
        syncMenu(host);
      }
      for (const [input, cleanup] of cleanups) if (!input.isConnected) { cleanup(); cleanups.delete(input); restorePlaceholder(input); }
      for (const [button] of originalIcons) if (!button.isConnected) originalIcons.delete(button);
    }
    function queueSync() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; sync(); });
    }
    const observer = new MutationObserver(queueSync);
    observer.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-label", "title", "data-chat-theme", "placeholder", "disabled", "readonly"] });
    window.addEventListener("chat-session-css-updated", queueSync);
    queueSync();
    return () => {
      observer.disconnect();
      window.removeEventListener("chat-session-css-updated", queueSync);
      for (const [input, cleanup] of cleanups) { cleanup(); cleanups.delete(input); }
      doc.querySelectorAll(".chat-room-wrapper").forEach(clear);
      originalIcons.clear();
      for (const input of originalPlaceholders.keys()) restorePlaceholder(input);
    };
}


// Read the native resolved quote name (remark -> screen name -> name); never rewrite React text nodes.
function installQuoteLabels() {
  const labelled = new Set();
  const markedHosts = new Set();
  let queued = false;
  let stopped = false;
  const sync = () => {
    queued = false;
    if (stopped) return;
    for (const host of document.querySelectorAll('.chat-room-wrapper:not(:has(.chat-room-wrapper))')) {
      const flat = getComputedStyle(host).getPropertyValue('--ii-kkt-flat-quote').trim() === '1';
      const kind = flat ? 'flat' : 'glass';
      if (host.getAttribute('data-ii-kkt-style') !== kind) host.setAttribute('data-ii-kkt-style', kind);
      markedHosts.add(host);
      for (const label of host.querySelectorAll('.chat-quote-message > .chat-quote-preview > strong')) {
        if (!flat) {
          label.removeAttribute('data-ii-kkt-reply-name');
          labelled.delete(label);
          continue;
        }
        const name = label.textContent.trim().replace(/[:：]\s*$/, '').trim();
        if (label.getAttribute('data-ii-kkt-reply-name') !== name) label.setAttribute('data-ii-kkt-reply-name', name);
        labelled.add(label);
      }
    }
    for (const label of labelled) if (!label.isConnected) labelled.delete(label);
  };
  const queue = () => { if (queued || stopped) return; queued = true; requestAnimationFrame(sync); };
  const observer = new MutationObserver(queue);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  window.addEventListener('chat-session-css-updated', queue);
  queue();
  return () => {
    stopped = true;
    observer.disconnect();
    window.removeEventListener('chat-session-css-updated', queue);
    for (const host of markedHosts) host.removeAttribute('data-ii-kkt-style');
    markedHosts.clear();
    for (const label of labelled) label.removeAttribute('data-ii-kkt-reply-name');
    labelled.clear();
  };
}
