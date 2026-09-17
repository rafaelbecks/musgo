/**
 * Classic File / View / About menubar for the viewer header.
 */

function menuIcon(name) {
  return `<ion-icon class="app-menu__icon" name="${name}" aria-hidden="true"></ion-icon>`;
}

function findMenuItem(items, id) {
  for (const item of items || []) {
    if (item.id === id) return item;
    if (item.items) {
      const nested = findMenuItem(item.items, id);
      if (nested) return nested;
    }
  }
  return null;
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
        { id: "save", label: "Guardar", shortcut: "⌘S", icon: "save-outline" },
        { id: "saveAs", label: "Guardar como…", icon: "download-outline" },
        { type: "separator" },
        {
          type: "submenu",
          id: "import",
          label: "Importar",
          icon: "cloud-upload-outline",
          items: [
            { id: "importGlb", label: "GLB…", icon: "cube-outline" },
            { id: "importObj", label: "OBJ…", icon: "shapes-outline" },
            { id: "importUsdz", label: "USDZ…", icon: "scan-outline" },
            { id: "importStl", label: "STL…", icon: "triangle-outline" },
          ],
        },
        {
          type: "submenu",
          id: "export",
          label: "Exportar",
          icon: "share-outline",
          items: [
            { id: "exportGlb", label: "GLB…", icon: "cube-outline" },
            { id: "exportObj", label: "OBJ…", icon: "shapes-outline" },
            { id: "exportStl", label: "STL…", icon: "triangle-outline" },
            { id: "exportJson", label: "JSON…", icon: "code-slash-outline" },
          ],
        },
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

  function closeSubmenus(scope = bar) {
    scope.querySelectorAll(".app-menu__submenu-item.is-open").forEach((el) => {
      el.classList.remove("is-open");
      el.querySelector(".app-menu__action")?.setAttribute("aria-expanded", "false");
    });
  }

  function closeAll() {
    openMenuId = null;
    closeSubmenus();
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
    const menu = menus.find((m) => m.id === root.dataset.menu);
    root.querySelectorAll("[data-check]").forEach((el) => {
      const item = findMenuItem(menu?.items, el.dataset.action);
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

  function appendMenuItems(panel, items) {
    for (const item of items) {
      if (item.type === "separator") {
        const sep = document.createElement("div");
        sep.className = "app-menu__separator";
        sep.setAttribute("role", "separator");
        panel.appendChild(sep);
        continue;
      }

      if (item.type === "submenu") {
        panel.appendChild(createSubmenu(item));
        continue;
      }

      panel.appendChild(createAction(item));
    }
  }

  function createAction(item) {
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
    return btn;
  }

  function createSubmenu(item) {
    const wrap = document.createElement("div");
    wrap.className = "app-menu__submenu-item";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "app-menu__action";
    btn.setAttribute("role", "menuitem");
    btn.setAttribute("aria-haspopup", "true");
    btn.setAttribute("aria-expanded", "false");
    const iconHtml = item.icon
      ? menuIcon(item.icon)
      : `<span class="app-menu__icon" aria-hidden="true"></span>`;
    btn.innerHTML = `${iconHtml}<span class="app-menu__label">${item.label}</span><ion-icon class="app-menu__icon app-menu__chevron" name="chevron-forward-outline" aria-hidden="true"></ion-icon>`;

    const submenu = document.createElement("div");
    submenu.className = "app-menu__submenu";
    submenu.setAttribute("role", "menu");
    appendMenuItems(submenu, item.items);

    function openSubmenu() {
      const parent = wrap.parentElement;
      if (parent) {
        parent.querySelectorAll(":scope > .app-menu__submenu-item.is-open").forEach((el) => {
          if (el === wrap) return;
          el.classList.remove("is-open");
          el.querySelector(".app-menu__action")?.setAttribute("aria-expanded", "false");
        });
      }
      wrap.classList.add("is-open");
      btn.setAttribute("aria-expanded", "true");
    }

    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (wrap.classList.contains("is-open")) {
        wrap.classList.remove("is-open");
        btn.setAttribute("aria-expanded", "false");
        return;
      }
      openSubmenu();
    });

    wrap.appendChild(btn);
    wrap.appendChild(submenu);
    return wrap;
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
    appendMenuItems(panel, menu.items);

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
