/* CD San Bernabé Manager V27.2.2 · Inscripción pública con temporada activa */
const url = window.CDSB_CONFIG && typeof window.CDSB_CONFIG.supabaseUrl === "string"
  ? window.CDSB_CONFIG.supabaseUrl.trim()
  : "";
const key = window.CDSB_CONFIG && typeof window.CDSB_CONFIG.supabaseKey === "string"
  ? window.CDSB_CONFIG.supabaseKey.trim()
  : "";

const configOk =
  url.startsWith("https://") &&
  url.includes(".supabase.co") &&
  key.length > 20 &&
  !url.includes("PEGAR_AQUI") &&
  !key.includes("PEGAR_AQUI");

if (!configOk) {
  document.body.innerHTML = `<div style="font-family:Arial;padding:40px;max-width:760px;margin:auto">
    <h2>Formulario temporalmente no disponible</h2>
    <p>La configuración publicada no es válida. Contacta con el club.</p>
  </div>`;
  throw new Error("Configuración pública no válida");
}

const sb = window.supabase.createClient(url, key);
const registrationForm = document.getElementById("registrationForm");
const publicTeamSelect = document.getElementById("publicTeamSelect");
const submitBtn = document.getElementById("submitBtn");
const message = document.getElementById("message");
const publicSeasonTitle = document.getElementById("publicSeasonTitle");
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(["pdf", "jpg", "jpeg", "png"]);

function clean(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_");
}

function errorText(error) {
  return [error?.message, error?.details, error?.hint].filter(Boolean).join(" | ") || "Error desconocido";
}

function validateFile(file) {
  if (!file || !file.name) return;
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new Error(`El archivo ${file.name} no tiene un formato permitido`);
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`El archivo ${file.name} supera el máximo de 8 MB`);
  }
}


async function loadActiveSeason() {
  try {
    const { data, error } = await sb
      .from("club_seasons")
      .select("name")
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (data?.name && publicSeasonTitle) publicSeasonTitle.textContent = `Inscripción ${data.name}`;
  } catch (error) {
    // Compatibilidad durante la instalación: si todavía no se ha ejecutado
    // la actualización multitemporada, se mantiene el título de respaldo.
    console.warn("Temporada activa no disponible", error);
  }
}

async function loadTeams() {
  publicTeamSelect.innerHTML = '<option value="">Cargando equipos...</option>';
  const { data, error } = await sb.from("teams").select("name").is("deleted_at", null).order("name");
  if (error) {
    publicTeamSelect.innerHTML = '<option value="">No se pudieron cargar los equipos</option>';
    message.textContent = "No se pudieron cargar los equipos. Vuelve a intentarlo más tarde.";
    return;
  }
  publicTeamSelect.replaceChildren();
  const first = document.createElement("option");
  first.value = "";
  first.textContent = "Seleccionar equipo";
  publicTeamSelect.appendChild(first);
  for (const team of data || []) {
    const option = document.createElement("option");
    option.value = String(team.name || "");
    option.textContent = String(team.name || "");
    publicTeamSelect.appendChild(option);
  }
}

async function upload(file, registrationId, fieldName) {
  if (!file || !file.name) return null;
  validateFile(file);
  const path = `public-registration/${registrationId}/${fieldName}_${Date.now()}_${clean(file.name)}`;
  const { error } = await sb.storage.from("documents").upload(path, file, {
    cacheControl: "0",
    upsert: false,
    contentType: file.type || undefined
  });
  if (error) throw error;
  return path;
}

registrationForm?.addEventListener("submit", async event => {
  event.preventDefault();
  if (submitBtn.disabled) return;
  submitBtn.disabled = true;
  const originalText = submitBtn.textContent;
  submitBtn.textContent = "Enviando...";
  message.textContent = "Validando datos y documentación...";

  try {
    const fd = new FormData(registrationForm);
    const registrationId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const files = {
      doc_player_dni: fd.get("doc_player_dni"),
      doc_photo: fd.get("doc_photo"),
      doc_medical: fd.get("doc_medical")
    };
    Object.values(files).forEach(validateFile);

    const payload = {
      name: String(fd.get("name") || "").trim(),
      surname: String(fd.get("surname") || "").trim(),
      birth_date: fd.get("birth_date") || null,
      player_dni: String(fd.get("player_dni") || "").trim() || null,
      team: String(fd.get("team") || "").trim(),
      shirt_size: String(fd.get("shirt_size") || "").trim() || null,
      short_size: String(fd.get("short_size") || "").trim() || null,
      guardian: String(fd.get("guardian") || "").trim(),
      phone: String(fd.get("phone") || "").trim(),
      email: String(fd.get("email") || "").trim(),
      address: String(fd.get("address") || "").trim() || null,
      notes: String(fd.get("notes") || "").trim() || null,
      image_authorization: fd.get("image_authorization") === "on"
    };

    if (!payload.name || !payload.surname || !payload.birth_date || !payload.team || !payload.guardian || !payload.phone || !payload.email) {
      throw new Error("Completa todos los campos obligatorios");
    }

    message.textContent = "Subiendo documentación...";
    const paths = {
      player_dni_path: await upload(files.doc_player_dni, registrationId, "dni_jugador"),
      photo_path: await upload(files.doc_photo, registrationId, "fotografia"),
      medical_path: await upload(files.doc_medical, registrationId, "reconocimiento_medico")
    };

    message.textContent = "Guardando inscripción...";
    const { data, error } = await sb.rpc("public_register_player", {
      p_player: payload,
      p_documents: paths
    });
    if (error) throw error;
    const result = Array.isArray(data) ? data[0] : data;
    if (result?.error_message) throw new Error(result.error_message);
    if (!result?.player_id) throw new Error("La inscripción no devolvió un identificador válido");

    registrationForm.reset();
    message.textContent = "Inscripción enviada correctamente. El club revisará los datos.";
  } catch (error) {
    console.error(error);
    message.textContent = `No se pudo enviar la inscripción. ${errorText(error)}`;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;
  }
});

loadActiveSeason();
loadTeams().catch(error => {
  console.error(error);
  message.textContent = "No se pudieron cargar los equipos. Vuelve a intentarlo más tarde.";
});
