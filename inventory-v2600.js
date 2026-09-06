/* CD San Bernabé Manager V24.5.0 — Existencias dentro de cada prenda y resumen compacto */
(() => {
  const readStock = () => ({...(window.MULTICLUB_EQUIPMENT_INVENTORY || {})});

  let stock = readStock();
  const saveStock = () => {
    window.MULTICLUB_EQUIPMENT_INVENTORY = {...stock};
    try { window.saveMulticlubEquipmentState?.(); }
    catch (error) { console.warn("No se pudo guardar el inventario", error); }
  };
  const keyOf = (itemKey, size) => `${itemKey}|||${size}`;
  const escText = value => String(value ?? "").replace(/[&<>"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[char]));

  function catalogItems() {
    const fallback = [
      {key:"game_shirt",label:"Camiseta equipación",audience:"players"},
      {key:"game_shorts",label:"Pantalón equipación",audience:"players"},
      {key:"socks",label:"Medias",audience:"players"},
      {key:"training_shirt",label:"Camiseta entrenamiento",audience:"both"},
      {key:"training_shorts",label:"Pantalón entrenamiento jugador",audience:"both"},
      {key:"training_shorts_goalkeeper",label:"Pantalón entrenamiento portero",audience:"players"},
      {key:"training_sweatshirt",label:"Sudadera entrenamiento",audience:"both"},
      {key:"tracksuit_jacket",label:"Chaqueta chándal",audience:"both"},
      {key:"tracksuit_trousers",label:"Pantalón chándal",audience:"both"},
      {key:"polo",label:"Polo de paseo",audience:"staff"},
      {key:"backpack",label:"Mochila",audience:"both",noSize:true,defaultForPlayer:true,defaultForStaff:true}
    ];
    const items = typeof CLOTHING_ITEMS !== "undefined" && Array.isArray(CLOTHING_ITEMS) ? CLOTHING_ITEMS : fallback;
    return items.map(item => {
      let cfg = {label:item.label, active:true};
      try { if (typeof clothingConfig === "function") cfg = clothingConfig(item); } catch (_) {}
      return {...item, displayLabel:cfg.label || item.label, active:cfg.active !== false};
    });
  }

  function supports(item, scope) {
    if (scope === "all") return true;
    return item.audience === "both" || item.audience === scope;
  }

  function sizesFor(item, scope) {
    if (item.key === "backpack") return ["Única"];
    if (["socks","socks_goalkeeper"].includes(item.key)) return ["S","M","L"];
    const player = ["4XS","3XS","2XS","XS","S","M","L","XL","2XL","3XL"];
    const staffOnly = ["S","M","L","XL","2XL","3XL"];
    if (scope === "staff") return staffOnly;
    if (scope === "players") return player;
    if (item.audience === "staff") return staffOnly;
    return player;
  }

  function cardSizesFor(item) {
    if (item.key === "backpack") return ["Única"];
    if (["socks","socks_goalkeeper"].includes(item.key)) return ["S","M","L"];
    if (item.audience === "staff") return ["S","M","L","XL","2XL","3XL"];
    return ["4XS","3XS","2XS","XS","S","M","L","XL","2XL","3XL"];
  }

  function getAvailable(item, size) {
    const key = keyOf(item.key, size);
    let value = Number(stock[key]);
    if (!Number.isFinite(value)) value = Number(stock[`${item.displayLabel}|||${size}`] || 0);
    return Math.max(0, Math.floor(value || 0));
  }

  function personSizes(type, person) {
    try {
      if (type === "players" && typeof sizeFor === "function") return sizeFor(person.id) || {};
      if (type === "staff" && typeof staffSizeFor === "function") return staffSizeFor(person.id) || {};
    } catch (_) {}
    return {};
  }

  function requestedMap(team, scope, onlySized) {
    const map = new Map();
    const countPeople = (type, people, teamField) => {
      for (const person of people || []) {
        const personTeam = String(person?.[teamField] || "");
        if (team && personTeam !== team) continue;
        const sizes = personSizes(type, person);
        const isSized = ["si","sí"].includes(String(sizes.sized || "").toLowerCase());
        for (const item of catalogItems().filter(entry => supports(entry, type))) {
          const automaticNoSize = !!(item.noSize && ((type === "players" && item.defaultForPlayer) || (type === "staff" && item.defaultForStaff)));
          if (onlySized && !isSized && !automaticNoSize) continue;
          const size = String(sizes[item.key] || (automaticNoSize ? "Única" : "")).trim();
          if (!size) continue;
          const key = keyOf(item.key, size);
          map.set(key, (map.get(key) || 0) + 1);
        }
      }
    };
    if (scope === "players" || scope === "all") countPeople("players", typeof players !== "undefined" ? players : [], "team");
    if (scope === "staff" || scope === "all") countPeople("staff", typeof staff !== "undefined" ? staff : [], "team_name");
    return map;
  }

  function sizeRows() {
    const team = document.getElementById("kitInventoryTeam")?.value || "";
    const scope = document.getElementById("kitInventoryScope")?.value || "players";
    const onlySized = document.getElementById("kitInventoryOnlySized")?.checked === true;
    const requested = requestedMap(team, scope, onlySized);
    const result = [];
    for (const item of catalogItems().filter(entry => supports(entry, scope))) {
      for (const size of sizesFor(item, scope)) {
        const key = keyOf(item.key, size);
        const available = getAvailable(item, size);
        const requestedUnits = Math.max(0, Number(requested.get(key) || 0));
        result.push({item, size, key, available, requested:requestedUnits, missing:Math.max(0, requestedUnits - available)});
      }
    }
    return result;
  }

  function summaryRows() {
    const grouped = new Map();
    for (const row of sizeRows()) {
      const current = grouped.get(row.item.key) || {item:row.item, requested:0, available:0, missing:0};
      current.requested += row.requested;
      current.available += row.available;
      current.missing += row.missing;
      grouped.set(row.item.key, current);
    }
    return [...grouped.values()];
  }

  function populateTeams() {
    const select = document.getElementById("kitInventoryTeam");
    if (!select) return;
    const current = select.value;
    const list = typeof teams !== "undefined" && Array.isArray(teams) ? teams : [];
    select.innerHTML = '<option value="">Todos los equipos</option>' + list.map(team => `<option value="${escText(team.name)}">${escText(team.name)}</option>`).join("");
    select.value = [...select.options].some(option => option.value === current) ? current : "";
  }

  function renderStats(data) {
    const stats = document.getElementById("kitInventoryStats");
    if (!stats) return;
    const requested = data.reduce((sum,row) => sum + row.requested, 0);
    const available = data.reduce((sum,row) => sum + row.available, 0);
    const missing = data.reduce((sum,row) => sum + row.missing, 0);
    stats.innerHTML = `<article><span>Solicitadas</span><strong>${requested}</strong></article><article><span>Existencias totales</span><strong>${available}</strong></article><article class="${missing ? "has-shortage" : ""}"><span>Unidades que faltan</span><strong>${missing}</strong></article>`;
  }

  function renderSummary() {
    if (rendering) return;
    const body = document.getElementById("kitInventoryBody");
    if (!body) return;
    rendering = true;
    try {
      populateTeams();
      const data = summaryRows();
      body.innerHTML = data.map(row => `<tr class="${row.missing ? "inventory-shortage" : "inventory-ok"}">
        <td><strong>${escText(row.item.displayLabel)}</strong>${row.item.active ? "" : '<small class="inventory-inactive-label">Inactiva en tallajes</small>'}</td>
        <td><strong>${row.requested}</strong></td>
        <td><strong>${row.available}</strong></td>
        <td><strong>${row.missing}</strong></td>
        <td>${row.missing ? '<span class="inventory-status pending">Falta stock</span>' : '<span class="inventory-status ready">Cubierto</span>'}</td>
      </tr>`).join("") || '<tr><td colspan="5">No se ha podido cargar el catálogo de prendas.</td></tr>';
      renderStats(data);
    } finally {
      rendering = false;
    }
  }

  function renderCardTotals(itemKey) {
    const item = catalogItems().find(entry => entry.key === itemKey);
    if (!item) return;
    const total = cardSizesFor(item).reduce((sum,size) => sum + getAvailable(item,size), 0);
    document.querySelectorAll("[data-stock-total]").forEach(node => {
      if (node.dataset.stockTotal === itemKey) node.textContent = total;
    });
  }

  function stockPanelHtml(item) {
    const sizes = cardSizesFor(item);
    const total = sizes.reduce((sum,size) => sum + getAvailable(item,size), 0);
    return `<details class="clothing-stock-details" data-stock-item-panel="${escText(item.key)}">
      <summary><span>Disponibles</span><strong data-stock-total="${escText(item.key)}">${total}</strong></summary>
      <div class="clothing-stock-dropdown" aria-label="Existencias disponibles de ${escText(item.displayLabel)}">
        ${sizes.map(size => `<label><span>${escText(size)}</span><input class="inventory-card-stock-input" type="number" min="0" step="1" inputmode="numeric" value="${getAvailable(item,size)}" data-stock-key="${escText(keyOf(item.key,size))}" data-stock-item-key="${escText(item.key)}" aria-label="${escText(item.displayLabel)} talla ${escText(size)}"></label>`).join("")}
      </div>
    </details>`;
  }

  function renderCardStock() {
    const byKey = new Map(catalogItems().map(item => [item.key, item]));
    document.querySelectorAll(".clothing-item-card[data-clothing-item]").forEach(card => {
      const item = byKey.get(card.dataset.clothingItem);
      const info = card.querySelector(".clothing-item-info");
      if (!item || !info) return;
      info.querySelector(".clothing-stock-details")?.remove();
      info.insertAdjacentHTML("beforeend", stockPanelHtml(item));
    });
  }

  function updateInput(input) {
    const key = input.dataset.stockKey;
    if (!key) return;
    const value = Math.max(0, Math.floor(Number(input.value) || 0));
    input.value = value;
    stock[key] = value;
    saveStock();
    const itemKey = input.dataset.stockItemKey || key.split("|||")[0];
    renderCardTotals(itemKey);
    renderSummary();
  }

  function reset() {
    if (!confirm("¿Quieres poner a cero todas las existencias guardadas?")) return;
    stock = {};
    saveStock();
    renderCardStock();
    renderSummary();
    try { if (typeof toast === "function") toast("Existencias puestas a cero"); } catch (_) {}
  }

  function exportInventory() {
    const rows = sizeRows();
    if (!rows.length) {
      try { if (typeof toast === "function") toast("No hay prendas activas para exportar"); } catch (_) {}
      return;
    }
    const data = rows.map(row => ({
      Prenda:row.item.displayLabel,
      Talla:row.size,
      Solicitadas:row.requested,
      Disponibles:row.available,
      Faltan:row.missing,
      Estado:row.missing > 0 ? "Falta stock" : "Cubierto"
    }));
    try {
      if (typeof downloadCSV === "function") {
        const team = document.getElementById("kitInventoryTeam")?.value || "todos_los_equipos";
        const fileName = typeof cleanName === "function" ? cleanName(team) : "inventario";
        downloadCSV(`inventario_ropa_${fileName}.csv`, data);
        if (typeof toast === "function") toast("Inventario exportado");
      }
    } catch (error) { console.error(error); }
  }

  function replaceControl(id, eventName, handler) {
    const current = document.getElementById(id);
    if (!current) return null;
    const replacement = current.cloneNode(true);
    replacement.value = current.value;
    if (current.type === "checkbox") replacement.checked = current.checked;
    current.replaceWith(replacement);
    replacement.addEventListener(eventName, handler);
    return replacement;
  }

  function bind() {
    const catalog = document.getElementById("clothingCatalogGrid");
    if (catalog && catalog.dataset.inventoryV2450Bound !== "1") {
      catalog.dataset.inventoryV2450Bound = "1";
      catalog.addEventListener("input", event => {
        const input = event.target.closest?.(".inventory-card-stock-input");
        if (input) updateInput(input);
      });
      catalog.addEventListener("change", event => {
        const input = event.target.closest?.(".inventory-card-stock-input");
        if (input) updateInput(input);
      });
    }

    ["kitInventoryTeam","kitInventoryScope","kitInventoryOnlySized"].forEach(id => replaceControl(id, "change", renderSummary));
    replaceControl("resetKitInventory", "click", reset);
    replaceControl("exportKitInventory", "click", exportInventory);
    document.querySelector('[data-view="kits"]')?.addEventListener("click", () => setTimeout(() => { renderCardStock(); renderSummary(); }, 50));
  }

  function wrapRenderers() {
    try {
      if (!catalogWrapped && typeof renderClothingCatalog === "function") {
        const previousCatalog = renderClothingCatalog;
        renderClothingCatalog = function(...args) {
          const result = previousCatalog.apply(this, args);
          setTimeout(renderCardStock, 0);
          return result;
        };
        catalogWrapped = true;
      }
    } catch (error) { console.warn("No se pudo enlazar el inventario con el catálogo", error); }

    try {
      if (!kitsWrapped && typeof renderKits === "function") {
        const previousKits = renderKits;
        renderKits = function(...args) {
          const result = previousKits.apply(this, args);
          setTimeout(() => { renderCardStock(); renderSummary(); }, 0);
          return result;
        };
        kitsWrapped = true;
      }
    } catch (error) { console.warn("No se pudo enlazar el inventario con tallajes", error); }

    try { renderKitInventory = renderSummary; } catch (_) {}
    window.renderKitInventory = renderSummary;
    window.renderInventoryV2450 = renderSummary;
  }

  window.multiclubInventoryLoad = data => {
    stock = {...(data || {})};
    window.MULTICLUB_EQUIPMENT_INVENTORY = {...stock};
    try { renderCardStock(); renderSummary(); } catch (_) {}
  };

  function start() {
    stock = readStock();
    wrapRenderers();
    bind();
    renderCardStock();
    renderSummary();
    setTimeout(() => { renderCardStock(); renderSummary(); }, 350);
    setTimeout(() => { renderCardStock(); renderSummary(); }, 1200);
  }

  window.addEventListener("load", start, {once:true});
  document.addEventListener("DOMContentLoaded", start, {once:true});
})();
