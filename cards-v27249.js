/* CD San Bernabé Manager V27.2.49 · Tarjetero: traspasar y eliminar fichas por entrenadores */
(() => {
  "use strict";

  const states = new Map();
  const historical = () => Boolean(window.CDSB_SEASON_STATE?.historical);
  const selectedSeasonId = () => window.CDSB_SEASON_STATE?.id || null;
  const imageCache = new Map();
  let activeContext = null;
  let importPages = [];
  let importContext = null;
  let importDialog = null;
  let viewerDialog = null;
  let transferDialog = null;
  let transferCardId = null;

  const normalize = value => String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  const html = value => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  const notify = message => {
    if (typeof activeContext?.notify === "function") activeContext.notify(message);
    else if (typeof window.toast === "function") window.toast(message);
    else alert(message);
  };

  const getState = teamId => {
    const key = `${selectedSeasonId() || "live"}:${teamId}`;
    if (!states.has(key)) states.set(key, { cards: [], index: 0, loading: false, loaded: false });
    return states.get(key);
  };

  function ensureDialogs() {
    if (!importDialog) {
      importDialog = document.createElement("dialog");
      importDialog.id = "teamCardsImportDialog";
      importDialog.className = "team-cards-dialog";
      importDialog.innerHTML = `
        <div class="team-cards-dialog-shell team-cards-import-shell">
          <header class="team-cards-dialog-head">
            <div><small>IMPORTACIÓN DE FICHAS</small><h2>Detectar y separar las fichas del PDF</h2><p>El programa analiza cada página, detecta todas las fichas que contiene, las recorta individualmente y permite asignarlas a cada jugador.</p></div>
            <button type="button" class="team-cards-dialog-close" aria-label="Cerrar">×</button>
          </header>
          <div class="team-cards-import-toolbar">
            <label class="team-cards-file-button">Seleccionar PDF<input id="teamCardsPdfFile" type="file" accept="application/pdf"></label>
            <div id="teamCardsImportStatus">Selecciona el PDF oficial. Puede contener varias fichas en cada página.</div>
          </div>
          <div id="teamCardsImportPreview" class="team-cards-import-preview"></div>
          <footer class="team-cards-dialog-actions">
            <button type="button" class="secondary" data-card-import-cancel>Cancelar</button>
            <button type="button" class="primary" id="teamCardsSaveImport" disabled>Guardar fichas</button>
          </footer>
        </div>`;
      document.body.appendChild(importDialog);
      importDialog.querySelector(".team-cards-dialog-close").addEventListener("click", () => importDialog.close());
      importDialog.querySelector("[data-card-import-cancel]").addEventListener("click", () => importDialog.close());
      importDialog.querySelector("#teamCardsPdfFile").addEventListener("change", onPdfSelected);
      importDialog.querySelector("#teamCardsSaveImport").addEventListener("click", saveImportedCards);
    }

    if (!viewerDialog) {
      viewerDialog = document.createElement("dialog");
      viewerDialog.id = "teamCardViewerDialog";
      viewerDialog.className = "team-card-viewer-dialog";
      viewerDialog.innerHTML = `
        <div class="team-card-viewer-shell">
          <header>
            <div><small id="teamCardViewerTeam"></small><h2 id="teamCardViewerName">Ficha</h2></div>
            <button type="button" class="team-cards-dialog-close" aria-label="Cerrar">×</button>
          </header>
          <div class="team-card-viewer-stage">
            <button type="button" class="team-card-viewer-nav prev" aria-label="Ficha anterior">‹</button>
            <img id="teamCardViewerImage" alt="Ficha digital del jugador">
            <button type="button" class="team-card-viewer-nav next" aria-label="Ficha siguiente">›</button>
          </div>
          <footer><span id="teamCardViewerCounter"></span><button type="button" class="secondary" id="teamCardViewerDownload">Descargar ficha</button></footer>
        </div>`;
      document.body.appendChild(viewerDialog);
      viewerDialog.querySelector(".team-cards-dialog-close").addEventListener("click", () => viewerDialog.close());
      viewerDialog.querySelector(".prev").addEventListener("click", () => shiftCard(-1, true));
      viewerDialog.querySelector(".next").addEventListener("click", () => shiftCard(1, true));
      viewerDialog.querySelector("#teamCardViewerDownload").addEventListener("click", downloadCurrentCard);
      viewerDialog.addEventListener("keydown", event => {
        if (event.key === "ArrowLeft") shiftCard(-1, true);
        if (event.key === "ArrowRight") shiftCard(1, true);
      });
      let startX = null;
      viewerDialog.querySelector(".team-card-viewer-stage").addEventListener("touchstart", event => { startX = event.changedTouches[0]?.clientX ?? null; }, { passive: true });
      viewerDialog.querySelector(".team-card-viewer-stage").addEventListener("touchend", event => {
        if (startX == null) return;
        const endX = event.changedTouches[0]?.clientX ?? startX;
        const diff = endX - startX;
        startX = null;
        if (Math.abs(diff) > 45) shiftCard(diff > 0 ? -1 : 1, true);
      }, { passive: true });
    }

    if (!transferDialog) {
      transferDialog = document.createElement("dialog");
      transferDialog.id = "teamCardTransferDialog";
      transferDialog.className = "team-cards-dialog team-card-transfer-dialog";
      transferDialog.innerHTML = `
        <div class="team-cards-dialog-shell team-card-transfer-shell">
          <header class="team-cards-dialog-head">
            <div><small>TRASPASAR FICHA</small><h2>Compartir ficha con otro equipo</h2><p>La ficha se copiará al tarjetero de destino. El jugador y la ficha del equipo actual no se modifican.</p></div>
            <button type="button" class="team-cards-dialog-close" aria-label="Cerrar">×</button>
          </header>
          <div class="team-card-transfer-body">
            <div class="team-card-transfer-player" id="teamCardTransferPlayer"></div>
            <div id="teamCardTransferStatus" class="team-card-transfer-status">Cargando equipos...</div>
            <div id="teamCardTransferTeams" class="team-card-transfer-teams"></div>
          </div>
          <footer class="team-cards-dialog-actions">
            <button type="button" class="secondary" data-card-transfer-cancel>Cancelar</button>
          </footer>
        </div>`;
      document.body.appendChild(transferDialog);
      transferDialog.querySelector(".team-cards-dialog-close").addEventListener("click", () => transferDialog.close());
      transferDialog.querySelector("[data-card-transfer-cancel]").addEventListener("click", () => transferDialog.close());
    }
  }

  function playerDisplayName(player) {
    if (!player) return "";
    const name = player.name ?? player.first_name ?? player.nombre ?? "";
    const surname = player.surname ?? player.last_name ?? player.apellidos ?? "";
    const full = player.full_name ?? player.nombre_completo ?? "";
    return `${name || ""} ${surname || ""}`.trim() || String(full || "").trim() || "Jugador sin nombre";
  }

  function teamKey(value) {
    return normalize(value)
      .replace(/\s+/g, " ")
      .trim();
  }

  function playerBelongsToContext(player, context) {
    if (!player || !context) return false;
    const teamId = String(context.teamId ?? "").trim();
    const playerTeamId = String(player.team_id ?? player.teamId ?? "").trim();
    if (teamId && playerTeamId && teamId === playerTeamId) return true;
    const expected = teamKey(context.teamName || "");
    if (!expected) return false;
    return [player.team, player.team_name, player.equipo, player.teamName]
      .some(value => teamKey(value || "") === expected);
  }

  async function resolveRoster(context, force = false) {
    if (!context) return [];
    const current = Array.isArray(context.roster) ? context.roster.filter(Boolean) : [];
    if (current.length && !force) return current;
    if (context.technical) return current;
    if (!context.client) return current;

    const { data, error } = await context.client
      .from("players")
      .select("*")
      .is("deleted_at", null);
    if (error) throw new Error(`No se pudo cargar la plantilla del equipo: ${error.message || "error de Supabase"}`);

    const allPlayers = Array.isArray(data) ? data : [];
    let roster = allPlayers.filter(player => playerBelongsToContext(player, context));

    // Compatibilidad con instalaciones antiguas en las que el equipo puede
    // tener espacios o mayúsculas distintas en el campo de texto del jugador.
    if (!roster.length) {
      const expected = teamKey(context.teamName || "");
      roster = allPlayers.filter(player => {
        const raw = [player.team, player.team_name, player.equipo, player.teamName]
          .map(value => teamKey(value || ""))
          .filter(Boolean);
        return expected && raw.some(value => value.includes(expected) || expected.includes(value));
      });
    }

    context.roster = roster;
    return roster;
  }

  function rosterMap(context) {
    return new Map((context.roster || []).map(player => [String(player.id), player]));
  }

  async function loadCards(context, force = false) {
    const state = getState(context.teamId);
    if (state.loading || (state.loaded && !force)) return state.cards;
    state.loading = true;
    renderLoading(context);
    try {
      let cards = [];
      if (context.technical) {
        const { data, error } = await context.client.rpc("technical_list_team_cards", { p_token: context.token });
        if (error) throw error;
        if (!data?.ok) throw new Error(data?.message || "No se pudo cargar el tarjetero");
        cards = Array.isArray(data.cards) ? data.cards : [];
      } else if (historical()) {
        const seasonId = selectedSeasonId();
        if (!seasonId) throw new Error("No se ha podido identificar la temporada histórica");
        const { data, error } = await context.client
          .from("season_team_player_cards")
          .select("id,season_id,original_card_id,team_id,player_id,player_name,page_number,source_pdf_name,created_at,updated_at")
          .eq("season_id", seasonId)
          .eq("team_id", context.teamId);
        if (error) throw error;
        cards = data || [];
      } else {
        const { data, error } = await context.client
          .from("team_player_cards")
          .select("id,team_id,player_id,player_name,page_number,source_pdf_name,created_at,updated_at")
          .eq("team_id", context.teamId);
        if (error) throw error;
        cards = data || [];
      }
      const order = new Map((context.roster || []).map((player, index) => [String(player.id), index]));
      cards.sort((a, b) => {
        const ai = order.has(String(a.player_id)) ? order.get(String(a.player_id)) : 9999;
        const bi = order.has(String(b.player_id)) ? order.get(String(b.player_id)) : 9999;
        if (ai !== bi) return ai - bi;
        return String(a.player_name || "").localeCompare(String(b.player_name || ""), "es", { sensitivity: "base" });
      });
      state.cards = cards;
      state.index = Math.min(state.index, Math.max(0, cards.length - 1));
      state.loaded = true;
      renderPanel(context);
      return cards;
    } catch (error) {
      console.error("Tarjetero", error);
      renderError(context, error.message || "No se pudo cargar el tarjetero");
      return [];
    } finally {
      state.loading = false;
    }
  }

  function renderLoading(context) {
    const target = document.getElementById(context.targetId);
    if (!target) return;
    target.innerHTML = `<div class="team-cards-loading"><span class="team-cards-spinner"></span><strong>Cargando tarjetero...</strong><small>Preparando las fichas del equipo.</small></div>`;
  }

  function renderError(context, message) {
    const target = document.getElementById(context.targetId);
    if (!target) return;
    target.innerHTML = `<div class="team-cards-empty"><span>!</span><h3>No se pudo abrir el tarjetero</h3><p>${html(message)}</p><button type="button" class="secondary" data-card-retry>Reintentar</button></div>`;
    target.querySelector("[data-card-retry]")?.addEventListener("click", () => loadCards(context, true));
  }

  function renderPanel(context) {
    const target = document.getElementById(context.targetId);
    if (!target) return;
    activeContext = context;
    const state = getState(context.teamId);
    const cards = state.cards;
    const mapped = rosterMap(context);

    if (!cards.length) {
      target.innerHTML = `
        <section class="team-cards-empty">
          <div class="team-cards-empty-icon">▣</div>
          <h3>Tarjetero digital vacío</h3>
          <p>${historical() ? "No hay fichas archivadas para este equipo en esta temporada." : (context.technical ? "La dirección todavía no ha importado las fichas de este equipo." : "Importa el PDF oficial. El programa detectará y separará automáticamente las fichas que haya dentro de cada página.")}</p>
          ${(context.technical || historical()) ? "" : `<button type="button" class="primary" data-card-import>Importar PDF de fichas</button>`}
        </section>`;
      target.querySelector("[data-card-import]")?.addEventListener("click", () => openImport(context));
      return;
    }

    const current = cards[state.index] || cards[0];
    const player = mapped.get(String(current.player_id));
    const displayName = playerDisplayName(player) || current.player_name || "Jugador";
    const thumbnails = cards.map((card, index) => {
      const p = mapped.get(String(card.player_id));
      const name = playerDisplayName(p) || card.player_name || `Ficha ${index + 1}`;
      return `<button type="button" class="team-card-thumb ${index === state.index ? "active" : ""}" data-card-index="${index}" title="${html(name)}"><span>${index + 1}</span><strong>${html(name)}</strong></button>`;
    }).join("");

    target.innerHTML = `
      <section class="team-cards-wrap">
        <header class="team-cards-head">
          <div><small>TARJETERO DIGITAL</small><h3>Fichas oficiales de ${html(context.teamName)}</h3><p>Desliza o utiliza las flechas para pasar de una ficha a otra. Se mantiene el diseño, la fotografía y el QR originales del PDF.</p></div>
          <div class="team-cards-head-actions">
            <span>${cards.length} ficha${cards.length === 1 ? "" : "s"}</span>
            ${(context.technical || historical()) ? "" : `<button type="button" class="secondary" data-card-import>Importar / actualizar PDF</button>`}
          </div>
        </header>
        <div class="team-cards-layout">
          <aside class="team-card-thumbs">${thumbnails}</aside>
          <main class="team-card-main">
            <div class="team-card-player-head"><div><small>FICHA ${state.index + 1} DE ${cards.length}</small><h3>${html(displayName)}</h3><p>${html(context.category || "Equipo")} · ${html(context.teamName)}</p></div><span class="team-card-source">${html(current.source_pdf_name || "PDF oficial")}</span></div>
            <div class="team-card-stage" data-card-stage>
              <button type="button" class="team-card-nav prev" aria-label="Ficha anterior">‹</button>
              <div class="team-card-image-shell"><div class="team-card-image-loading"><span class="team-cards-spinner"></span> Cargando ficha...</div><img data-card-image alt="Ficha digital de ${html(displayName)}"></div>
              <button type="button" class="team-card-nav next" aria-label="Ficha siguiente">›</button>
            </div>
            <div class="team-card-actions">
              <button type="button" class="secondary" data-card-fullscreen>Ver a pantalla completa</button>
              <button type="button" class="secondary" data-card-download>Descargar ficha</button>
              ${historical() ? "" : `<button type="button" class="card-transfer-button" data-card-transfer>TRASPASAR</button><button type="button" class="card-delete-button" data-card-delete>ELIMINAR</button>`}
            </div>
          </main>
        </div>
      </section>`;

    target.querySelector("[data-card-import]")?.addEventListener("click", () => openImport(context));
    target.querySelector(".team-card-nav.prev")?.addEventListener("click", () => shiftCard(-1));
    target.querySelector(".team-card-nav.next")?.addEventListener("click", () => shiftCard(1));
    target.querySelectorAll("[data-card-index]").forEach(button => button.addEventListener("click", () => selectCard(Number(button.dataset.cardIndex))));
    target.querySelector("[data-card-fullscreen]")?.addEventListener("click", openFullscreen);
    target.querySelector("[data-card-download]")?.addEventListener("click", downloadCurrentCard);
    target.querySelector("[data-card-transfer]")?.addEventListener("click", openTransferCurrentCard);
    target.querySelector("[data-card-delete]")?.addEventListener("click", deleteCurrentCard);

    let startX = null;
    const stage = target.querySelector("[data-card-stage]");
    stage?.addEventListener("touchstart", event => { startX = event.changedTouches[0]?.clientX ?? null; }, { passive: true });
    stage?.addEventListener("touchend", event => {
      if (startX == null) return;
      const endX = event.changedTouches[0]?.clientX ?? startX;
      const diff = endX - startX;
      startX = null;
      if (Math.abs(diff) > 45) shiftCard(diff > 0 ? -1 : 1);
    }, { passive: true });

    loadCurrentImage(context, current, target.querySelector("[data-card-image]"), target.querySelector(".team-card-image-loading"));
  }

  async function fetchCardImage(context, card) {
    const key = String(card.id);
    if (imageCache.has(key)) return imageCache.get(key);
    let imageData = null;
    if (context.technical) {
      const { data, error } = await context.client.rpc("technical_get_team_card", { p_token: context.token, p_card_id: card.id });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message || "No se pudo abrir la ficha");
      imageData = data.card?.image_data || null;
    } else if (historical()) {
      const { data, error } = await context.client.from("season_team_player_cards").select("image_data").eq("id", card.id).single();
      if (error) throw error;
      imageData = data?.image_data || null;
    } else {
      const { data, error } = await context.client.from("team_player_cards").select("image_data").eq("id", card.id).single();
      if (error) throw error;
      imageData = data?.image_data || null;
    }
    if (!imageData) throw new Error("La ficha no contiene una imagen válida");
    imageCache.set(key, imageData);
    return imageData;
  }

  async function loadCurrentImage(context, card, image, loading) {
    try {
      const data = await fetchCardImage(context, card);
      if (!image?.isConnected) return;
      image.onload = () => { if (loading) loading.hidden = true; image.classList.add("ready"); };
      image.src = data;
    } catch (error) {
      if (loading) loading.innerHTML = `<strong>No se pudo cargar la ficha</strong><small>${html(error.message || "Error")}</small>`;
    }
  }

  function selectCard(index, inViewer = false) {
    if (!activeContext) return;
    const state = getState(activeContext.teamId);
    if (!state.cards.length) return;
    state.index = Math.max(0, Math.min(index, state.cards.length - 1));
    renderPanel(activeContext);
    if (inViewer && viewerDialog?.open) updateFullscreen();
  }

  function shiftCard(delta, inViewer = false) {
    if (!activeContext) return;
    const state = getState(activeContext.teamId);
    if (!state.cards.length) return;
    state.index = (state.index + delta + state.cards.length) % state.cards.length;
    renderPanel(activeContext);
    if (inViewer && viewerDialog?.open) updateFullscreen();
  }

  async function openFullscreen() {
    ensureDialogs();
    if (!activeContext) return;
    viewerDialog.showModal();
    await updateFullscreen();
  }

  async function updateFullscreen() {
    if (!activeContext || !viewerDialog?.open) return;
    const state = getState(activeContext.teamId);
    const card = state.cards[state.index];
    if (!card) return;
    const player = rosterMap(activeContext).get(String(card.player_id));
    viewerDialog.querySelector("#teamCardViewerTeam").textContent = `${activeContext.teamName} · ${activeContext.category || "Equipo"}`;
    viewerDialog.querySelector("#teamCardViewerName").textContent = playerDisplayName(player) || card.player_name || "Ficha";
    viewerDialog.querySelector("#teamCardViewerCounter").textContent = `${state.index + 1} / ${state.cards.length}`;
    const image = viewerDialog.querySelector("#teamCardViewerImage");
    image.removeAttribute("src");
    try { image.src = await fetchCardImage(activeContext, card); }
    catch (error) { notify(error.message || "No se pudo abrir la ficha"); }
  }

  async function downloadCurrentCard() {
    if (!activeContext) return;
    const state = getState(activeContext.teamId);
    const card = state.cards[state.index];
    if (!card) return;
    try {
      const data = await fetchCardImage(activeContext, card);
      const player = rosterMap(activeContext).get(String(card.player_id));
      const name = normalize(playerDisplayName(player) || card.player_name || "ficha").replace(/\s+/g, "-") || "ficha";
      const a = document.createElement("a");
      a.href = data;
      a.download = `ficha-${name}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (error) { notify(error.message || "No se pudo descargar la ficha"); }
  }

  async function listTransferTeams(context) {
    if (!context?.client) return [];
    if (context.technical) {
      const { data, error } = await context.client.rpc("technical_card_transfer_targets_v27249", { p_token: context.token });
      if (error) throw error;
      const payload = Array.isArray(data) ? data[0] : data;
      if (!payload?.ok) throw new Error(payload?.message || "No se pudieron cargar los equipos");
      return Array.isArray(payload.teams) ? payload.teams : [];
    }
    let query = context.client.from("teams").select("id,name,age_category,category,season_id").is("deleted_at", null).order("name");
    const seasonId = selectedSeasonId();
    if (seasonId) query = query.eq("season_id", seasonId);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).filter(team => String(team.id) !== String(context.teamId)).map(team => ({
      team_id: team.id, team_name: team.name, age_category: team.age_category, category: team.category
    }));
  }

  async function openTransferCurrentCard() {
    if (!activeContext) return;
    if (historical()) return notify("La temporada histórica es de solo lectura");
    const state = getState(activeContext.teamId);
    const card = state.cards[state.index];
    if (!card) return;
    ensureDialogs();
    transferCardId = card.id;
    const player = rosterMap(activeContext).get(String(card.player_id));
    const displayName = playerDisplayName(player) || card.player_name || "Jugador";
    const playerBox = transferDialog.querySelector("#teamCardTransferPlayer");
    const status = transferDialog.querySelector("#teamCardTransferStatus");
    const teamsBox = transferDialog.querySelector("#teamCardTransferTeams");
    if (playerBox) playerBox.innerHTML = `<small>FICHA SELECCIONADA</small><strong>${html(displayName)}</strong><span>Origen: ${html(activeContext.teamName)}</span>`;
    if (status) status.textContent = "Cargando equipos disponibles...";
    if (teamsBox) teamsBox.innerHTML = "";
    transferDialog.showModal();
    try {
      const teams = await listTransferTeams(activeContext);
      if (!transferDialog.open || String(transferCardId) !== String(card.id)) return;
      if (!teams.length) {
        if (status) status.textContent = "No hay otro equipo disponible en la temporada actual.";
        return;
      }
      if (status) status.textContent = "Selecciona el equipo que recibirá una copia de la ficha:";
      teamsBox.innerHTML = teams.map(team => `<button type="button" class="team-card-transfer-team" data-transfer-team="${html(team.team_id)}"><span>⚽</span><div><strong>${html(team.team_name || "Equipo")}</strong><small>${html([team.age_category, team.category].filter(Boolean).join(" · ") || "Equipo del club")}</small></div><b>→</b></button>`).join("");
      teamsBox.querySelectorAll("[data-transfer-team]").forEach(button => button.addEventListener("click", () => transferCurrentCardTo(button.dataset.transferTeam, button)));
    } catch (error) {
      console.error("Equipos para traspaso", error);
      if (status) status.textContent = `No se pudieron cargar los equipos: ${error.message || "Error"}`;
    }
  }

  async function transferCurrentCardTo(targetTeamId, button) {
    if (!activeContext || !transferCardId || !targetTeamId) return;
    const state = getState(activeContext.teamId);
    const card = state.cards.find(item => String(item.id) === String(transferCardId));
    if (!card) return notify("La ficha seleccionada ya no está disponible");
    const targetName = button?.querySelector("strong")?.textContent || "el equipo seleccionado";
    if (!confirm(`¿Traspasar una copia de la ficha de ${card.player_name || "este jugador"} a ${targetName}?\n\nLa ficha seguirá también en ${activeContext.teamName}.`)) return;
    const status = transferDialog?.querySelector("#teamCardTransferStatus");
    if (button) button.disabled = true;
    if (status) status.textContent = `Traspasando ficha a ${targetName}...`;
    try {
      if (activeContext.technical) {
        const { data, error } = await activeContext.client.rpc("technical_transfer_team_card_v27249", {
          p_token: activeContext.token, p_card_id: card.id, p_target_team_id: targetTeamId
        });
        if (error) throw error;
        const payload = Array.isArray(data) ? data[0] : data;
        if (!payload?.ok) throw new Error(payload?.message || "No se pudo traspasar la ficha");
        notify(payload.already_exists ? `La ficha ya estaba en ${targetName}; no se ha duplicado.` : `Ficha traspasada a ${targetName}`);
      } else {
        const { data: existing, error: checkError } = await activeContext.client.from("team_player_cards").select("id").eq("team_id", targetTeamId).eq("player_id", card.player_id).maybeSingle();
        if (checkError) throw checkError;
        if (existing?.id) {
          notify(`La ficha ya estaba en ${targetName}; no se ha duplicado.`);
        } else {
          const imageData = await fetchCardImage(activeContext, card);
          const { error } = await activeContext.client.from("team_player_cards").insert({
            team_id: targetTeamId,
            player_id: card.player_id,
            player_name: card.player_name,
            page_number: card.page_number,
            source_pdf_name: card.source_pdf_name,
            image_data: imageData,
            updated_at: new Date().toISOString()
          });
          if (error) throw error;
          notify(`Ficha traspasada a ${targetName}`);
        }
      }
      transferDialog?.close();
    } catch (error) {
      console.error("Traspasar ficha", error);
      if (status) status.textContent = `No se pudo traspasar: ${error.message || "Error"}`;
      if (button) button.disabled = false;
    }
  }

  async function deleteCurrentCard() {
    if (!activeContext) return;
    if (historical()) return notify("La temporada histórica es de solo lectura");
    const state = getState(activeContext.teamId);
    const card = state.cards[state.index];
    if (!card) return;
    if (!confirm(`¿ELIMINAR la ficha de ${card.player_name || "este jugador"} del tarjetero de ${activeContext.teamName}?\n\nSolo se eliminará de este tarjetero. El jugador no se borrará y, si la ficha está compartida con otros equipos, seguirá apareciendo allí.`)) return;
    try {
      if (activeContext.technical) {
        const { data, error } = await activeContext.client.rpc("technical_delete_team_card_v27249", { p_token: activeContext.token, p_card_id: card.id });
        if (error) throw error;
        const payload = Array.isArray(data) ? data[0] : data;
        if (!payload?.ok) throw new Error(payload?.message || "No se pudo eliminar la ficha");
      } else {
        const { error } = await activeContext.client.from("team_player_cards").delete().eq("id", card.id).eq("team_id", activeContext.teamId);
        if (error) throw error;
      }
      imageCache.delete(String(card.id));
      notify(`Ficha eliminada del tarjetero de ${activeContext.teamName}`);
      await loadCards(activeContext, true);
    } catch (error) {
      console.error("Eliminar ficha", error);
      notify(`No se pudo eliminar: ${error.message || "Error"}`);
    }
  }

  async function openImport(context) {
    if (context.technical) return;
    if (historical()) return notify("La temporada histórica es de solo lectura");
    ensureDialogs();
    importContext = context;
    importPages = [];
    const file = importDialog.querySelector("#teamCardsPdfFile");
    const preview = importDialog.querySelector("#teamCardsImportPreview");
    const status = importDialog.querySelector("#teamCardsImportStatus");
    const save = importDialog.querySelector("#teamCardsSaveImport");
    file.value = "";
    preview.innerHTML = `<div class="team-cards-import-empty">Selecciona el PDF oficial del equipo. Puede contener varias fichas por página: se detectarán y recortarán automáticamente.</div>`;
    status.textContent = `Equipo: ${context.teamName} · cargando plantilla...`;
    save.disabled = true;
    importDialog.showModal();
    try {
      const roster = await resolveRoster(context, false);
      status.textContent = `Equipo: ${context.teamName} · ${roster.length} jugador${roster.length === 1 ? "" : "es"} disponible${roster.length === 1 ? "" : "s"}`;
      if (!roster.length) {
        preview.innerHTML = `<div class="team-cards-empty"><span>!</span><h3>No hay jugadores disponibles</h3><p>No se ha encontrado ningún jugador vinculado a ${html(context.teamName)}. Comprueba primero la pestaña Plantilla del equipo.</p></div>`;
      }
    } catch (error) {
      console.error("Plantilla para tarjetero", error);
      status.textContent = "No se pudo cargar la plantilla";
      preview.innerHTML = `<div class="team-cards-empty"><span>!</span><h3>No se pudo cargar la plantilla</h3><p>${html(error.message || "Error")}</p></div>`;
    }
  }

  function bestPlayerMatch(text, roster) {
    const normalizedText = normalize(text);
    let best = null;
    let bestScore = 0;
    for (const player of roster) {
      const name = normalize(player.name);
      const surname = normalize(player.surname);
      const full = normalize(`${player.name || ""} ${player.surname || ""}`);
      const reverse = normalize(`${player.surname || ""} ${player.name || ""}`);
      let score = 0;
      if (full && normalizedText.includes(full)) score += 16;
      if (reverse && normalizedText.includes(reverse)) score += 16;
      const surnameParts = surname.split(" ").filter(part => part.length > 2);
      const nameParts = name.split(" ").filter(part => part.length > 2);
      score += surnameParts.filter(part => normalizedText.includes(part)).length * 4;
      score += nameParts.filter(part => normalizedText.includes(part)).length * 2;
      if (score > bestScore) { best = player; bestScore = score; }
    }
    return bestScore >= 6 ? best?.id || "" : "";
  }

  function findBands(profile, threshold, mergeGap, minLength) {
    const raw = [];
    let start = -1;
    for (let i = 0; i <= profile.length; i++) {
      const active = i < profile.length && profile[i] >= threshold;
      if (active && start < 0) start = i;
      if ((!active || i === profile.length) && start >= 0) {
        raw.push([start, i]);
        start = -1;
      }
    }
    const merged = [];
    for (const band of raw) {
      const previous = merged[merged.length - 1];
      if (previous && band[0] - previous[1] <= mergeGap) previous[1] = band[1];
      else merged.push(band.slice());
    }
    return merged.filter(([a, b]) => b - a >= minLength);
  }

  function pixelIsInk(data, offset) {
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    return (255 - Math.min(r, g, b)) > 18 || (Math.max(r, g, b) - Math.min(r, g, b)) > 20;
  }

  function pixelIsOfficialCardBlue(data, offset) {
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    return b > 75 && r < 105 && g < 155 && b > r * 1.45 && b > g * 1.12;
  }

  // Los PDF oficiales que usamos en el tarjetero llevan una franja azul vertical
  // en el borde izquierdo de CADA ficha. Esa franja es el ancla más fiable para
  // recortar la tarjeta completa: así nunca se pierde la fotografía situada a la
  // izquierda ni el QR situado a la derecha.
  function detectOfficialCardRects(canvas) {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const width = canvas.width;
    const height = canvas.height;
    if (width < 200 || height < 200) return [];

    const image = ctx.getImageData(0, 0, width, height);
    const data = image.data;
    const sampleY = Math.max(1, Math.ceil(height / 1200));
    const sampleX = Math.max(1, Math.ceil(width / 1200));

    // 1) Buscar columnas que contienen azul durante gran parte de la página.
    // Las cabeceras azules son horizontales y no alcanzan este porcentaje;
    // las franjas laterales sí, porque se repiten en todas las filas.
    const colProfile = new Float32Array(Math.ceil(width / sampleX));
    for (let sx = 0, x = 0; sx < colProfile.length; sx++, x += sampleX) {
      let blue = 0;
      let total = 0;
      const xx = Math.min(width - 1, x);
      for (let y = 0; y < height; y += sampleY) {
        const offset = (y * width + xx) * 4;
        if (pixelIsOfficialCardBlue(data, offset)) blue++;
        total++;
      }
      colProfile[sx] = total ? blue / total : 0;
    }

    let stripeBands = findBands(
      colProfile,
      0.22,
      Math.max(1, Math.round(3 / sampleX)),
      Math.max(2, Math.round((width * 0.004) / sampleX))
    ).map(([a, b]) => [a * sampleX, Math.min(width, b * sampleX)]);

    stripeBands = stripeBands.filter(([a, b]) => {
      const bandWidth = b - a;
      return bandWidth >= width * 0.004 && bandWidth <= width * 0.055;
    });

    if (!stripeBands.length) return [];

    // En caso de que una misma franja se detecte en trozos muy próximos,
    // conservar solo las posiciones realmente distintas.
    stripeBands.sort((a, b) => a[0] - b[0]);
    const distinctStripes = [];
    for (const band of stripeBands) {
      const previous = distinctStripes[distinctStripes.length - 1];
      if (previous && band[0] - previous[1] < width * 0.035) {
        previous[1] = Math.max(previous[1], band[1]);
      } else {
        distinctStripes.push(band.slice());
      }
    }
    stripeBands = distinctStripes;

    // Anchuras de ficha estimadas a partir de la distancia entre franjas.
    const stripeStarts = stripeBands.map(([a]) => a);
    const distances = [];
    for (let i = 1; i < stripeStarts.length; i++) {
      const d = stripeStarts[i] - stripeStarts[i - 1];
      if (d > width * 0.20) distances.push(d);
    }
    const typicalColumnStep = distances.length
      ? distances.sort((a, b) => a - b)[Math.floor(distances.length / 2)]
      : width * 0.43;
    const estimatedCardWidth = Math.min(
      width * 0.46,
      Math.max(width * 0.30, typicalColumnStep - width * 0.016)
    );

    const rects = [];
    const edgePadX = Math.max(4, Math.round(width * 0.006));
    const edgePadY = Math.max(4, Math.round(height * 0.005));

    for (let c = 0; c < stripeBands.length; c++) {
      const [sx1, sx2] = stripeBands[c];
      const bandLeft = Math.max(0, Math.floor(sx1));
      const bandRight = Math.min(width, Math.ceil(sx2));
      const bandWidth = Math.max(1, bandRight - bandLeft);

      // 2) Dentro de cada franja, localizar cada tramo vertical continuo.
      const rowProfile = new Float32Array(Math.ceil(height / sampleY));
      for (let sy = 0, y = 0; sy < rowProfile.length; sy++, y += sampleY) {
        const yy = Math.min(height - 1, y);
        let blue = 0;
        let total = 0;
        for (let x = bandLeft; x < bandRight; x += sampleX) {
          const offset = (yy * width + x) * 4;
          if (pixelIsOfficialCardBlue(data, offset)) blue++;
          total++;
        }
        rowProfile[sy] = total ? blue / total : 0;
      }

      let rows = findBands(
        rowProfile,
        0.42,
        Math.max(1, Math.round(4 / sampleY)),
        Math.max(4, Math.round((height * 0.10) / sampleY))
      ).map(([a, b]) => [a * sampleY, Math.min(height, b * sampleY)]);

      rows = rows.filter(([a, b]) => {
        const h = b - a;
        return h >= height * 0.10 && h <= height * 0.30;
      });

      for (let r = 0; r < rows.length; r++) {
        const [ry1, ry2] = rows[r];
        const x = Math.max(0, bandLeft - edgePadX);
        const y = Math.max(0, Math.floor(ry1) - edgePadY);
        const right = Math.min(width, x + estimatedCardWidth + edgePadX * 2);
        const bottom = Math.min(height, Math.ceil(ry2) + edgePadY);
        const rect = {
          x,
          y,
          width: Math.max(1, right - x),
          height: Math.max(1, bottom - y),
          row: r,
          col: c,
          detector: "official-blue-stripe"
        };
        rects.push(rect);
      }
    }

    // Orden de lectura: fila superior izquierda -> derecha, luego siguiente fila.
    rects.sort((a, b) => {
      const rowTolerance = Math.max(12, height * 0.025);
      if (Math.abs(a.y - b.y) > rowTolerance) return a.y - b.y;
      return a.x - b.x;
    });

    return rects;
  }

  function detectCardRects(canvas) {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const width = canvas.width;
    const height = canvas.height;
    const image = ctx.getImageData(0, 0, width, height);
    const data = image.data;
    const step = Math.max(1, Math.ceil(Math.max(width, height) / 1000));
    const sampledRows = Math.ceil(height / step);
    const sampledCols = Math.ceil(width / step);
    const rowProfile = new Float32Array(sampledRows);

    for (let sy = 0, y = 0; sy < sampledRows; sy++, y += step) {
      let ink = 0;
      let total = 0;
      const yy = Math.min(height - 1, y);
      for (let x = 0; x < width; x += step) {
        const offset = (yy * width + x) * 4;
        if (pixelIsInk(data, offset)) ink++;
        total++;
      }
      rowProfile[sy] = total ? ink / total : 0;
    }

    let rowBands = findBands(
      rowProfile,
      0.008,
      Math.max(1, Math.round(4 / step)),
      Math.max(4, Math.round((height * 0.055) / step))
    ).map(([a, b]) => [a * step, Math.min(height, b * step)]);

    // El encabezado impreso por algunos navegadores (Firefox/Chrome) es una banda
    // muy fina. Las fichas reales ocupan bastante más altura y se conservan.
    rowBands = rowBands.filter(([a, b]) => (b - a) >= height * 0.07 && (b - a) <= height * 0.38);

    if (!rowBands.length) return [];

    const activeY = new Uint8Array(height);
    rowBands.forEach(([a, b]) => {
      for (let y = Math.max(0, a); y < Math.min(height, b); y++) activeY[y] = 1;
    });

    const colProfile = new Float32Array(sampledCols);
    for (let sx = 0, x = 0; sx < sampledCols; sx++, x += step) {
      let ink = 0;
      let total = 0;
      const xx = Math.min(width - 1, x);
      for (let y = 0; y < height; y += step) {
        if (!activeY[y]) continue;
        const offset = (y * width + xx) * 4;
        if (pixelIsInk(data, offset)) ink++;
        total++;
      }
      colProfile[sx] = total ? ink / total : 0;
    }

    let colBands = findBands(
      colProfile,
      0.008,
      Math.max(1, Math.round(4 / step)),
      Math.max(5, Math.round((width * 0.10) / step))
    ).map(([a, b]) => [a * step, Math.min(width, b * step)]);
    colBands = colBands.filter(([a, b]) => (b - a) >= width * 0.12 && (b - a) <= width * 0.72);

    if (!colBands.length) colBands = [[0, width]];

    const margin = Math.max(6, Math.round(Math.min(width, height) * 0.008));
    const rects = [];
    for (let r = 0; r < rowBands.length; r++) {
      for (let c = 0; c < colBands.length; c++) {
        const [ry1, ry2] = rowBands[r];
        const [cx1, cx2] = colBands[c];
        const rect = {
          x: Math.max(0, cx1 - margin),
          y: Math.max(0, ry1 - margin),
          width: Math.min(width, cx2 + margin) - Math.max(0, cx1 - margin),
          height: Math.min(height, ry2 + margin) - Math.max(0, ry1 - margin),
          row: r,
          col: c
        };
        let ink = 0;
        let total = 0;
        const densityStep = Math.max(2, step * 2);
        for (let y = rect.y; y < rect.y + rect.height; y += densityStep) {
          for (let x = rect.x; x < rect.x + rect.width; x += densityStep) {
            const offset = (y * width + x) * 4;
            if (pixelIsInk(data, offset)) ink++;
            total++;
          }
        }
        const density = total ? ink / total : 0;
        if (density >= 0.018) rects.push(rect);
      }
    }
    return rects;
  }

  function textItemsForViewport(textContent, viewport) {
    const util = window.pdfjsLib?.Util;
    return (textContent.items || []).map((item, index) => {
      try {
        const tx = util?.transform ? util.transform(viewport.transform, item.transform) : null;
        const fontHeight = tx ? Math.max(5, Math.hypot(tx[2], tx[3])) : Math.max(5, (item.height || 8) * (viewport.scale || 1));
        const x = tx ? tx[4] : 0;
        const baseline = tx ? tx[5] : 0;
        const width = Math.max(1, Math.abs((item.width || 1) * (viewport.scale || 1)));
        return {
          index,
          text: item.str || "",
          x,
          y: baseline - fontHeight,
          width,
          height: fontHeight,
          cx: x + width / 2,
          cy: baseline - fontHeight / 2
        };
      } catch (_) {
        return { index, text: item.str || "", x: 0, y: 0, width: 1, height: 1, cx: 0, cy: 0 };
      }
    });
  }

  function median(values) {
    const sorted = (values || []).filter(Number.isFinite).slice().sort((a, b) => a - b);
    if (!sorted.length) return 0;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function clusterCoordinates(values, tolerance) {
    const sorted = (values || []).filter(Number.isFinite).slice().sort((a, b) => a - b);
    const clusters = [];
    for (const value of sorted) {
      const current = clusters[clusters.length - 1];
      if (!current || Math.abs(value - current.mean) > tolerance) {
        clusters.push({ values: [value], mean: value });
      } else {
        current.values.push(value);
        current.mean = current.values.reduce((sum, item) => sum + item, 0) / current.values.length;
      }
    }
    return clusters.map(cluster => cluster.mean);
  }

  function nearestIndex(values, target) {
    let best = 0;
    let bestDistance = Infinity;
    values.forEach((value, index) => {
      const distance = Math.abs(value - target);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    });
    return best;
  }

  // Las licencias federativas RFAF no llevan la franja azul de las fichas AAFB.
  // Su maquetación tiene el bloque de datos a la izquierda y la fotografía/código
  // a la derecha. Algunas versiones del PDF repiten en la capa de texto etiquetas
  // como "Nombre:" varias veces en casi la misma posición. Si se cuentan esas
  // repeticiones como fichas distintas, el cálculo de tamaño termina recortando
  // únicamente el bloque de datos. Por eso primero unificamos anclas que pertenecen
  // a la MISMA licencia y después calculamos el área completa de cada ficha.
  function detectRfafCardRects(positionedText, canvas) {
    const width = canvas.width;
    const height = canvas.height;
    if (!Array.isArray(positionedText) || !positionedText.length || width < 200 || height < 150) return [];

    const wholeText = normalize(positionedText.map(item => item.text).join(" "));
    const looksRfaf =
      wholeText.includes("real federacion andaluza") ||
      wholeText.includes("codigo de licencia") ||
      (wholeText.includes("apellido 1") && wholeText.includes("apellido 2") && wholeText.includes("club"));
    if (!looksRfaf) return [];

    let rawAnchors = positionedText.filter(item => {
      const value = normalize(item.text);
      return /^nombre\b/.test(value) || value === "nombre";
    });
    if (!rawAnchors.length) {
      rawAnchors = positionedText.filter(item => /^apellido 1\b/.test(normalize(item.text)));
    }
    if (!rawAnchors.length) {
      rawAnchors = positionedText.filter(item => /^codigo de licencia\b/.test(normalize(item.text)));
    }
    if (!rawAnchors.length) return [];

    // Unificar etiquetas duplicadas de una misma licencia. El PDF de la RFAF puede
    // contener texto superpuesto/invisible y devolver dos o más "Nombre:" para la
    // misma ficha. Se agrupan por proximidad antes de decidir cuántas fichas hay.
    const anchors = [];
    const mergeX = Math.max(28, width * 0.14);
    const mergeY = Math.max(22, height * 0.10);
    for (const item of rawAnchors.sort((a, b) => a.cy - b.cy || a.x - b.x)) {
      const existing = anchors.find(anchor =>
        Math.abs(anchor.x - item.x) <= mergeX &&
        Math.abs(anchor.cy - item.cy) <= mergeY
      );
      if (!existing) {
        anchors.push({ ...item, _count: 1 });
      } else {
        const count = existing._count + 1;
        existing.x = (existing.x * existing._count + item.x) / count;
        existing.y = (existing.y * existing._count + item.y) / count;
        existing.cx = (existing.cx * existing._count + item.cx) / count;
        existing.cy = (existing.cy * existing._count + item.cy) / count;
        existing._count = count;
      }
    }

    // Caso habitual del PDF RFAF usado por el club: una licencia por página.
    // Aunque la capa de texto venga duplicada, una sola ancla LÓGICA significa que
    // toda la página pertenece a la misma licencia. Se conserva completa para no
    // perder nunca la fotografía, temporada ni código/barra de la derecha.
    if (anchors.length === 1) {
      return [{
        x: 0,
        y: 0,
        width,
        height,
        detector: "rfaf-single-complete-page"
      }];
    }

    // Si excepcionalmente hay varias licencias en una página, las posiciones de
    // "Nombre:" marcan el comienzo del bloque de datos de cada ficha. La distancia
    // entre anclas consecutivas define el ancho/alto de la celda COMPLETA, de forma
    // que la fotografía situada a la derecha queda dentro del mismo recorte.
    const xTolerance = Math.max(32, width * 0.16);
    const yTolerance = Math.max(26, height * 0.11);
    const xCenters = clusterCoordinates(anchors.map(item => item.x), xTolerance);
    const yCenters = clusterCoordinates(anchors.map(item => item.cy), yTolerance);

    const xSteps = [];
    for (let i = 1; i < xCenters.length; i++) {
      const step = xCenters[i] - xCenters[i - 1];
      if (step > width * 0.20) xSteps.push(step);
    }
    const ySteps = [];
    for (let i = 1; i < yCenters.length; i++) {
      const step = yCenters[i] - yCenters[i - 1];
      if (step > height * 0.12) ySteps.push(step);
    }

    // Nunca calcular el ancho de una ficha RFAF solo a partir del texto: la foto
    // y el código son imágenes y no aparecen en la capa textual del PDF.
    const cardWidth = xSteps.length ? median(xSteps) * 0.98 : width;
    const cardHeight = ySteps.length ? median(ySteps) * 0.98 : height;
    const padX = Math.max(4, width * 0.006);
    const padY = Math.max(4, height * 0.006);

    const rects = [];
    for (const anchor of anchors) {
      let x;
      let y;

      if (xSteps.length) {
        const col = nearestIndex(xCenters, anchor.x);
        x = xCenters[col] - cardWidth * 0.035 - padX;
      } else {
        x = 0;
      }

      if (ySteps.length) {
        const row = nearestIndex(yCenters, anchor.cy);
        y = yCenters[row] - cardHeight * 0.10 - padY;
      } else {
        y = 0;
      }

      x = Math.max(0, Math.min(width - 1, x));
      y = Math.max(0, Math.min(height - 1, y));
      const right = xSteps.length ? Math.min(width, x + cardWidth + padX * 2) : width;
      const bottom = ySteps.length ? Math.min(height, y + cardHeight + padY * 2) : height;

      rects.push({
        x: Math.round(x),
        y: Math.round(y),
        width: Math.max(1, Math.round(right - x)),
        height: Math.max(1, Math.round(bottom - y)),
        detector: "rfaf-complete-cell"
      });
    }

    const deduped = [];
    for (const rect of rects.sort((a, b) => a.y - b.y || a.x - b.x)) {
      const duplicate = deduped.some(prev => {
        const left = Math.max(prev.x, rect.x);
        const top = Math.max(prev.y, rect.y);
        const right = Math.min(prev.x + prev.width, rect.x + rect.width);
        const bottom = Math.min(prev.y + prev.height, rect.y + rect.height);
        const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
        const smaller = Math.min(prev.width * prev.height, rect.width * rect.height);
        return smaller > 0 && intersection / smaller > 0.82;
      });
      if (!duplicate) deduped.push(rect);
    }
    return deduped;
  }

  function textInsideRect(items, rect) {
    return items
      .filter(item => item.cx >= rect.x && item.cx <= rect.x + rect.width && item.cy >= rect.y && item.cy <= rect.y + rect.height)
      .sort((a, b) => {
        const dy = a.cy - b.cy;
        if (Math.abs(dy) > 8) return dy;
        return a.x - b.x;
      })
      .map(item => item.text)
      .filter(Boolean)
      .join(" ");
  }

  function cropCanvasToDataUrl(canvas, rect) {
    const crop = document.createElement("canvas");
    crop.width = Math.max(1, Math.round(rect.width));
    crop.height = Math.max(1, Math.round(rect.height));
    const cropCtx = crop.getContext("2d", { alpha: false });
    cropCtx.fillStyle = "#ffffff";
    cropCtx.fillRect(0, 0, crop.width, crop.height);
    cropCtx.drawImage(
      canvas,
      Math.round(rect.x), Math.round(rect.y), Math.round(rect.width), Math.round(rect.height),
      0, 0, crop.width, crop.height
    );
    return crop.toDataURL("image/jpeg", 0.92);
  }

  function fallbackGridRects(canvas, expectedPerPage) {
    const width = canvas.width;
    const height = canvas.height;
    let cols = 1;
    let rows = 1;
    if (expectedPerPage >= 7) { cols = 2; rows = 4; }
    else if (expectedPerPage >= 5) { cols = 2; rows = 3; }
    else if (expectedPerPage === 4) { cols = 2; rows = 2; }
    else if (expectedPerPage >= 2) { cols = 2; rows = Math.ceil(expectedPerPage / 2); }
    const top = Math.round(height * 0.035);
    const bottom = Math.round(height * 0.88);
    const left = Math.round(width * 0.035);
    const right = Math.round(width * 0.875);
    const cellW = (right - left) / cols;
    const cellH = (bottom - top) / rows;
    const gapX = Math.round(width * 0.012);
    const gapY = Math.round(height * 0.006);
    const rects = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        rects.push({
          x: Math.round(left + c * cellW + gapX),
          y: Math.round(top + r * cellH + gapY),
          width: Math.round(cellW - gapX * 2),
          height: Math.round(cellH - gapY * 2),
          row: r,
          col: c
        });
      }
    }
    return rects;
  }

  async function onPdfSelected(event) {
    const file = event.target.files?.[0];
    if (!file || !importContext) return;
    const status = importDialog.querySelector("#teamCardsImportStatus");
    const preview = importDialog.querySelector("#teamCardsImportPreview");
    const save = importDialog.querySelector("#teamCardsSaveImport");
    save.disabled = true;
    importPages = [];
    preview.innerHTML = `<div class="team-cards-loading"><span class="team-cards-spinner"></span><strong>Leyendo el PDF...</strong><small>Detectando y separando todas las fichas de cada página.</small></div>`;
    try {
      if (!window.pdfjsLib) throw new Error("No se pudo cargar el lector de PDF");
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
      const roster = await resolveRoster(importContext, false);
      if (!roster.length) {
        throw new Error(`No se han encontrado jugadores vinculados a ${importContext.teamName}. Abre la pestaña Plantilla y comprueba que los jugadores estén asignados a este equipo.`);
      }
      const approximatePerPage = Math.max(1, Math.ceil(roster.length / Math.max(1, pdf.numPages)));

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        status.textContent = `Analizando página ${pageNumber} de ${pdf.numPages}...`;
        const page = await pdf.getPage(pageNumber);
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = Math.min(2.5, 1500 / Math.max(1, baseViewport.width));
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        const ctx = canvas.getContext("2d", { alpha: false });
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;

        const textContent = await page.getTextContent().catch(() => ({ items: [] }));
        const positionedText = textItemsForViewport(textContent, viewport);
        // 1) Licencias RFAF: detectar por la estructura textual de cada ficha.
        // Se hace ANTES del detector por manchas para no separar el bloque de
        // datos y la fotografía en dos recortes distintos.
        let rects = detectRfafCardRects(positionedText, canvas);
        let detectedFormat = rects.length ? "RFAF" : "";

        // 2) Fichas AAFB: utilizar la franja azul izquierda como ancla.
        if (!rects.length) {
          rects = detectOfficialCardRects(canvas);
          if (rects.length) detectedFormat = "AAFB";
        }

        // 3) Otros formatos: detector genérico.
        if (!rects.length) {
          rects = detectCardRects(canvas);
          if (rects.length) detectedFormat = "genérico";
        }

        // 4) Último respaldo únicamente si no se detectó ninguna ficha.
        if (!rects.length && approximatePerPage > 1) {
          rects = fallbackGridRects(canvas, approximatePerPage);
          detectedFormat = "cuadrícula";
        }

        let pageDetected = 0;
        for (let cardIndex = 0; cardIndex < rects.length; cardIndex++) {
          const rect = rects[cardIndex];
          const cardText = textInsideRect(positionedText, rect);
          const playerId = bestPlayerMatch(cardText, roster);
          const imageData = cropCanvasToDataUrl(canvas, rect);

          // Evitar regiones vacías del último hueco de una página incompleta.
          const usefulText = normalize(cardText).replace(/firefox|http|https|copafacil/g, "").trim();
          if (!usefulText && !playerId && rects.length > 1) continue;

          importPages.push({
            pageNumber,
            cardIndex: cardIndex + 1,
            pageText: cardText,
            playerId,
            imageData,
            sourcePdfName: file.name
          });
          pageDetected++;
        }
        status.textContent = `Página ${pageNumber}: ${pageDetected} ficha${pageDetected === 1 ? "" : "s"} detectada${pageDetected === 1 ? "" : "s"}${detectedFormat ? ` · formato ${detectedFormat}` : ""}.`;
        page.cleanup?.();
      }

      // Como último respaldo, si el número total coincide exactamente con la plantilla,
      // completamos en orden únicamente las fichas que no hayan encontrado nombre.
      if (importPages.length === roster.length) {
        const already = new Set(importPages.map(card => String(card.playerId || "")).filter(Boolean));
        const remaining = roster.filter(player => !already.has(String(player.id)));
        const missing = importPages.filter(card => !card.playerId);
        if (missing.length === remaining.length) {
          missing.forEach((card, index) => { card.playerId = remaining[index]?.id || ""; });
        }
      }

      const assigned = importPages.filter(card => card.playerId).length;
      status.textContent = `${importPages.length} ficha${importPages.length === 1 ? "" : "s"} individual${importPages.length === 1 ? "" : "es"} detectada${importPages.length === 1 ? "" : "s"}; ${assigned} asignada${assigned === 1 ? "" : "s"} automáticamente. Revisa antes de guardar.`;
      renderImportPreview();
      save.disabled = !importPages.some(page => page.playerId);
    } catch (error) {
      console.error("Importación de fichas", error);
      status.textContent = "No se pudo leer el PDF";
      preview.innerHTML = `<div class="team-cards-empty"><span>!</span><h3>Error al importar</h3><p>${html(error.message || "El PDF no es compatible")}</p></div>`;
    }
  }

  function renderImportPreview() {
    const preview = importDialog.querySelector("#teamCardsImportPreview");
    const roster = Array.isArray(importContext?.roster) ? importContext.roster : [];
    if (!roster.length) {
      preview.innerHTML = `<div class="team-cards-empty"><span>!</span><h3>Plantilla no cargada</h3><p>No hay jugadores disponibles en el desplegable. Cierra esta ventana, abre Plantilla y vuelve a importar el PDF.</p></div>`;
      return;
    }
    preview.innerHTML = importPages.map((page, index) => `
      <article class="team-card-import-row" data-import-index="${index}">
        <img src="${page.imageData}" alt="Página ${page.pageNumber}, ficha ${page.cardIndex || index + 1}">
        <div class="team-card-import-info"><small>PÁGINA ${page.pageNumber} · FICHA ${page.cardIndex || index + 1}</small><strong>${html(page.pageText.slice(0, 110) || "Sin texto detectable")}</strong><label>Asignar a jugador<select data-import-player="${index}"><option value="">No importar esta ficha</option>${roster.map(player => `<option value="${html(player.id)}" ${String(page.playerId) === String(player.id) ? "selected" : ""}>${html(playerDisplayName(player))}</option>`).join("")}</select></label></div>
      </article>`).join("");
    preview.querySelectorAll("[data-import-player]").forEach(select => select.addEventListener("change", () => {
      importPages[Number(select.dataset.importPlayer)].playerId = select.value;
      importDialog.querySelector("#teamCardsSaveImport").disabled = !importPages.some(page => page.playerId);
    }));
  }

  async function saveImportedCards() {
    if (!importContext || importContext.technical) return;
    if (historical()) return notify("La temporada histórica es de solo lectura");
    const selected = importPages.filter(page => page.playerId);
    if (!selected.length) {
      importDialog.querySelector("#teamCardsImportStatus").textContent = "Debes asignar al menos una ficha a un jugador.";
      return notify("Asigna al menos una ficha a un jugador");
    }
    const ids = selected.map(page => String(page.playerId));
    if (new Set(ids).size !== ids.length) return notify("No puedes asignar dos páginas al mismo jugador");
    const save = importDialog.querySelector("#teamCardsSaveImport");
    const status = importDialog.querySelector("#teamCardsImportStatus");
    save.disabled = true;
    try {
      await resolveRoster(importContext, false);
      const roster = rosterMap(importContext);
      for (let index = 0; index < selected.length; index++) {
        const page = selected[index];
        const player = roster.get(String(page.playerId));
        status.textContent = `Guardando ficha ${index + 1} de ${selected.length}...`;
        const payload = {
          team_id: importContext.teamId,
          player_id: page.playerId,
          player_name: playerDisplayName(player),
          page_number: page.pageNumber,
          source_pdf_name: page.sourcePdfName,
          image_data: page.imageData,
          updated_at: new Date().toISOString()
        };
        const { data, error } = await importContext.client
          .from("team_player_cards")
          .upsert(payload, { onConflict: "team_id,player_id" })
          .select("id")
          .single();
        if (error) throw error;
        if (data?.id) imageCache.set(String(data.id), page.imageData);
      }
      status.textContent = `${selected.length} ficha${selected.length === 1 ? "" : "s"} guardada${selected.length === 1 ? "" : "s"}.`;
      notify("Tarjetero actualizado");
      importDialog.close();
      await loadCards(importContext, true);
    } catch (error) {
      console.error("Guardar fichas", error);
      status.textContent = `No se pudo guardar: ${error.message || "error"}`;
      save.disabled = false;
    }
  }

  async function renderTeamPanel(options) {
    const context = {
      teamId: options.teamId,
      teamName: options.teamName || "Equipo",
      category: options.category || "",
      roster: Array.isArray(options.roster) ? options.roster : [],
      technical: Boolean(options.technical),
      token: options.token || "",
      client: options.client,
      notify: options.notify,
      targetId: options.targetId || "teamCardsPanel"
    };
    activeContext = context;
    ensureDialogs();
    if (!context.technical && !context.roster.length) {
      try { await resolveRoster(context, true); }
      catch (error) { console.warn("No se pudo completar la plantilla del tarjetero", error); }
    }
    await loadCards(context);
  }

  const api = { renderTeamPanel, refresh: context => loadCards(context || activeContext, true) };
  window.cardHolderV2715 = api;
  window.cardHolderV2716 = api;
  window.cardHolderV2717 = api;
  window.cardHolderV2718 = api;
})();
