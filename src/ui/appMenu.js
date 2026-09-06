/**
 * Classic File / View / About menubar for the viewer header.
 */

function menuIcon(name) {
  return `<ion-icon class="app-menu__icon" name="${name}" aria-hidden="true"></ion-icon>`;
}

export function createAppMenu({
  parent = document.querySelector("#viewer-panel .panel-header"),
  actions = {},
} = {}) {
  if (!parent) return { destroy() {} };

  const bar = document.createElement("nav");
  bar.className = "app-menu";
  bar.setAttribute("aria-label", "Menú de la aplicación");

  const menus = [
    {
      id: "file",
      label: "Archivo",
      items: [
        { id: "new", label: "Nuevo", shortcut: "⌘N", icon: "add-outline" },
        { id: "open", label: "Abrir…", shortcut: "⌘O", icon: "folder-open-outline" },
        { id: "importModel", label: "Importar modelo…", icon: "cube-outline" },
        { id: "save", label: "Guardar", shortcut: "⌘S", icon: "save-outline" },
        { id: "saveAs", label: "Guardar como…", icon: "download-outline" },
        { type: "separator" },
        { id: "exportGlb", label: "Exportar GLB…", icon: "cube-outline" },
        { id: "exportObj", label: "Exportar OBJ…", icon: "shapes-outline" },
        { id: "exportJson", label: "Exportar JSON…", icon: "code-slash-outline" },
        { type: "separator" },
        { id: "examples", label: "Ejemplos…", icon: "bug-outline" },
        {
          id: "fotogrametrias",
          label: "Fotogrametrías secta…",
          icon: "scan-outline",
        },
      ],
    },
    {
      id: "view",
      label: "Vista",
      items: [
        {
          id: "wireframe",
          label: "Wireframe",
          type: "checkbox",
          icon: "grid-outline",
          checked: () => actions.isWireframe?.(),
        },
        {
          id: "grid",
          label: "Grid",
          type: "checkbox",
          icon: "apps-outline",
          checked: () => actions.isGrid?.(),
        },
        {
          id: "axes",
          label: "Ejes",
          type: "checkbox",
          icon: "move-outline",
          checked: () => actions.isAxes?.(),
        },
      ],
    },
    {
      id: "about",
      label: "Acerca de",
      items: [
        { id: "about", label: "Acerca de MUSGO…", icon: "information-circle-outline" },
      ],
    },
  ];

  let openMenuId = null;
  const menuRoots = new Map();

  function closeAll() {
    openMenuId = null;
    for (const root of menuRoots.values()) {
      root.classList.remove("is-open");
      root.querySelector(".app-menu__trigger")?.setAttribute("aria-expanded", "false");
    }
  }

  function openMenu(id) {
    if (openMenuId === id) {
      closeAll();
      return;
    }
    closeAll();
    openMenuId = id;
    const root = menuRoots.get(id);
    if (!root) return;
    root.classList.add("is-open");
    root.querySelector(".app-menu__trigger")?.setAttribute("aria-expanded", "true");
    refreshCheckboxes(root);
  }

  function refreshCheckboxes(root) {
    root.querySelectorAll("[data-check]").forEach((el) => {
      const itemId = el.dataset.action;
      const menu = menus.find((m) => m.id === root.dataset.menu);
      const item = menu?.items.find((i) => i.id === itemId);
      const on = Boolean(item?.checked?.());
      el.classList.toggle("is-checked", on);
      el.setAttribute("aria-checked", on ? "true" : "false");
    });
  }

  async function runAction(id) {
    closeAll();
    const fn = actions[id];
    if (!fn) return;
    try {
      await fn();
    } catch (err) {
      if (err?.name === "AbortError" || err?.message === "File picker cancelled." || err?.message === "No file selected.") {
        return;
      }
      console.error(`[menu] ${id} failed`, err);
      window.alert(err?.message || `Failed: ${id}`);
    }
  }

  for (const menu of menus) {
    const root = document.createElement("div");
    root.className = "app-menu__item";
    root.dataset.menu = menu.id;

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "app-menu__trigger";
    trigger.textContent = menu.label;
    trigger.setAttribute("aria-haspopup", "true");
    trigger.setAttribute("aria-expanded", "false");
    trigger.addEventListener("click", (ev) => {
      ev.stopPropagation();
      openMenu(menu.id);
    });
    trigger.addEventListener("mouseenter", () => {
      if (openMenuId != null && openMenuId !== menu.id) openMenu(menu.id);
    });

    const panel = document.createElement("div");
    panel.className = "app-menu__dropdown";
    panel.setAttribute("role", "menu");

    for (const item of menu.items) {
      if (item.type === "separator") {
        const sep = document.createElement("div");
        sep.className = "app-menu__separator";
        sep.setAttribute("role", "separator");
        panel.appendChild(sep);
        continue;
      }

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "app-menu__action";
      btn.setAttribute("role", "menuitem");
      btn.dataset.action = item.id;
      const iconHtml = item.icon
        ? menuIcon(item.icon)
        : `<span class="app-menu__icon" aria-hidden="true"></span>`;
      if (item.type === "checkbox") {
        btn.dataset.check = "1";
        btn.setAttribute("role", "menuitemcheckbox");
        btn.innerHTML = `${iconHtml}<span class="app-menu__label">${item.label}</span><span class="app-menu__check" aria-hidden="true"></span>`;
      } else {
        btn.innerHTML = `${iconHtml}<span class="app-menu__label">${item.label}</span>${
          item.shortcut ? `<span class="app-menu__shortcut">${item.shortcut}</span>` : ""
        }`;
      }
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        runAction(item.id);
      });
      panel.appendChild(btn);
    }

    root.appendChild(trigger);
    root.appendChild(panel);
    bar.appendChild(root);
    menuRoots.set(menu.id, root);
  }

  function onDocClick() {
    closeAll();
  }

  function onKeyDown(ev) {
    if (ev.key === "Escape") closeAll();
  }

  document.addEventListener("click", onDocClick);
  window.addEventListener("keydown", onKeyDown);

  // Insert after the title (h1), before specimen label
  const title = parent.querySelector("h1");
  if (title?.nextSibling) {
    parent.insertBefore(bar, title.nextSibling);
  } else {
    parent.appendChild(bar);
  }

  return {
    close: closeAll,
    destroy() {
      document.removeEventListener("click", onDocClick);
      window.removeEventListener("keydown", onKeyDown);
      bar.remove();
    },
  };
}
