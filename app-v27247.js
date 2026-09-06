// CD San Bernabé Manager · V27.2.32 · cambio de equipo accesible desde área privada
let sb, players=[], payments=[], documents=[], kits=[], teams=[], staff=[], events=[], playerSizes=[], staffSizes=[], pitchUsage=[], financeMovements=[], deletedPlayers=[], deletedTeams=[], activityLogs=[], channel;let signedCache={}, clothingImages={};
let lastLoadErrorSignature="";
const sharedCfg=()=>({
  url:(window.CDSB_CONFIG?.supabaseUrl && !window.CDSB_CONFIG.supabaseUrl.includes("PEGAR_AQUI")) ? window.CDSB_CONFIG.supabaseUrl.trim() : "",
  key:(window.CDSB_CONFIG?.supabaseKey && !window.CDSB_CONFIG.supabaseKey.includes("PEGAR_AQUI")) ? window.CDSB_CONFIG.supabaseKey.trim() : ""
});
const cfg=()=>{
  // La configuración publicada es la fuente principal para evitar que una
  // conexión antigua guardada en el navegador apunte a otro proyecto.
  const shared=sharedCfg();
  if(shared.url&&shared.key)return shared;
  return {url:localStorage.getItem("sb_url")||"",key:localStorage.getItem("sb_key")||""};
};
const euro=n=>new Intl.NumberFormat("es-ES",{style:"currency",currency:"EUR"}).format(Number(n||0));
const PAYMENT_STANDARD_AMOUNTS=Object.freeze({registration:50,sizing:50,clothing:100});
function standardPaymentAmount(concept){return Number(PAYMENT_STANDARD_AMOUNTS[concept]||0)}
function syncPaymentAmount(){
  if(!paymentForm)return;
  const concept=paymentForm.elements.concept?.value||"registration";
  const status=paymentForm.elements.status?.value||"Pagado";
  const amountInput=paymentForm.elements.amount;
  if(!amountInput)return;
  const standard=standardPaymentAmount(concept);
  amountInput.max=standard||"";
  amountInput.placeholder=standard?`${standard.toFixed(2)} €`:"0.00 €";
  if(status==="Pagado"){
    amountInput.value=standard.toFixed(2);
    amountInput.readOnly=true;
    amountInput.title="Importe automático según el concepto elegido";
  }else if(status==="Parcial"){
    amountInput.readOnly=false;
    const current=Number(amountInput.value||0);
    if(!current||current>=standard)amountInput.value="";
    amountInput.title=`Introduce el importe parcial (máximo ${standard.toFixed(2)} €)`;
  }else{
    amountInput.value="0.00";
    amountInput.readOnly=true;
    amountInput.title=status==="Exento"?"Los cobros exentos no tienen importe":"Los cobros pendientes no se contabilizan como pagados";
  }
}
const cleanName=s=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9._-]/g,"_");
const LIST_SORT_KEY="cdsb_list_sort_direction_v2712";
let listSortDirection=localStorage.getItem(LIST_SORT_KEY)==="za"?"za":"az";
function alphaText(value){return String(value??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim()}
function alphaCompareValues(a,b){
  const result=alphaText(a).localeCompare(alphaText(b),"es",{sensitivity:"base",numeric:true});
  return listSortDirection==="za"?-result:result;
}
function sortByAlpha(list,getter=x=>x){return [...(list||[])].sort((a,b)=>alphaCompareValues(getter(a),getter(b)))}
function sortPlayersAlpha(list){return sortByAlpha(list,p=>`${p?.name||""} ${p?.surname||""}`)}
function sortTeamsAlpha(list){return sortByAlpha(list,t=>t?.name||"")}
function sortStaffAlpha(list){return sortByAlpha(list,m=>m?.name||"")}
window.cdsbAlphaCompare=alphaCompareValues;
window.cdsbSortByAlpha=sortByAlpha;
window.cdsbSortPlayers=sortPlayersAlpha;
window.cdsbListSortDirection=()=>listSortDirection;
async function uploadPrivate(file,folder){if(!file||!file.name)return null;const path=`${folder}/${Date.now()}_${cleanName(file.name)}`;const {error}=await sb.storage.from("documents").upload(path,file);if(error)throw error;return path}
async function signedUrl(path){if(!path)return null;const {data}=await sb.storage.from("documents").createSignedUrl(path,3600);return data?.signedUrl||null}
const placeholderPhoto="assets/avatar-jugador.svg";
const BASE_CLOTHING_ITEMS=[
  {key:"game_shirt",label:"Camiseta primera equipación jugador",icon:"👕",category:"Juego",audience:"players",custom:false},
  {key:"game_shirt_goalkeeper",label:"Camiseta primera equipación portero",icon:"🧤",category:"Juego",audience:"players",custom:false},
  {key:"game_shorts",label:"Pantalón equipación jugador",icon:"🩳",category:"Juego",audience:"players",custom:false},
  {key:"game_shorts_goalkeeper",label:"Pantalón equipación portero",icon:"🩳",category:"Juego",audience:"players",custom:false},
  {key:"second_shirt_player",label:"Camiseta segunda equipación jugador",icon:"👕",category:"Juego",audience:"players",custom:false},
  {key:"socks",label:"Medias jugador",icon:"🧦",category:"Juego",audience:"players",custom:false},
  {key:"socks_goalkeeper",label:"Medias portero",icon:"🧦",category:"Juego",audience:"players",custom:false},
  {key:"training_shirt",label:"Camiseta entrenamiento jugador",icon:"👕",category:"Entrenamiento",audience:"both",custom:false},
  {key:"training_shirt_goalkeeper",label:"Camiseta entrenamiento portero",icon:"🧤",category:"Entrenamiento",audience:"players",custom:false},
  {key:"training_shorts",label:"Pantalón entrenamiento jugador",icon:"🩳",category:"Entrenamiento",audience:"both",custom:false},
  {key:"training_shorts_goalkeeper",label:"Pantalón entrenamiento portero",icon:"🩳",category:"Entrenamiento",audience:"players",custom:false},
  {key:"training_sweatshirt",label:"Sudadera entrenamiento",icon:"🧥",category:"Entrenamiento",audience:"both",custom:false},
  {key:"tracksuit_jacket",label:"Chaqueta chándal",icon:"🧥",category:"Paseo",audience:"both",custom:false},
  {key:"tracksuit_trousers",label:"Pantalón chándal",icon:"👖",category:"Paseo",audience:"both",custom:false},
  {key:"polo",label:"Polo de paseo",icon:"👔",category:"Paseo",audience:"staff",custom:false},
  {key:"backpack",label:"Mochila",icon:"🎒",category:"Complementos",audience:"both",custom:false,noSize:true,defaultForPlayer:true,defaultForStaff:true}
];
const CLOTHING_CATEGORIES=["Juego","Entrenamiento","Paseo","Complementos"];
const CUSTOM_CLOTHING_KEY="cdsb_custom_clothing_v24_4_4";
const CUSTOM_PLAYER_SIZES_KEY="cdsb_custom_player_clothing_sizes_v24_4_5";
const CUSTOM_STAFF_SIZES_KEY="cdsb_custom_staff_clothing_sizes_v24_4_5";
const STAFF_KIT_STATUS_KEY="cdsb_staff_kit_status_v24_4_7";
function seasonStorageSuffix(){return String(window.CDSB_SEASON_STATE?.label||"2026/27").replace(/[^0-9A-Za-z]+/g,"_")}
function staffKitSeasonKey(){return `${STAFF_KIT_STATUS_KEY}_${seasonStorageSuffix()}`}
let customPlayerClothingSizes={},customStaffClothingSizes={},staffKitStatus={};
function loadStaffKitStatus(){
  try{
    const key=staffKitSeasonKey();
    let raw=localStorage.getItem(key);
    if(raw==null&&(window.CDSB_SEASON_STATE?.label||"2026/27")==="2026/27"){
      raw=localStorage.getItem(STAFF_KIT_STATUS_KEY);
      if(raw!=null)localStorage.setItem(key,raw);
    }
    staffKitStatus=JSON.parse(raw||"{}")||{};
  }catch(_){staffKitStatus={}}
}
function saveStaffKitStatus(){localStorage.setItem(staffKitSeasonKey(),JSON.stringify(staffKitStatus))}
function staffKitStatusFor(id){return staffKitStatus[id]||{}}
function setStaffKitStatus(id,values){staffKitStatus[id]={...(staffKitStatus[id]||{}),...values};saveStaffKitStatus()}
function loadCustomClothingSizes(){
  try{customPlayerClothingSizes=JSON.parse(localStorage.getItem(CUSTOM_PLAYER_SIZES_KEY)||"{}")||{}}catch(_){customPlayerClothingSizes={}}
  try{customStaffClothingSizes=JSON.parse(localStorage.getItem(CUSTOM_STAFF_SIZES_KEY)||"{}")||{}}catch(_){customStaffClothingSizes={}}
}
function saveCustomClothingSizes(){
  localStorage.setItem(CUSTOM_PLAYER_SIZES_KEY,JSON.stringify(customPlayerClothingSizes));
  localStorage.setItem(CUSTOM_STAFF_SIZES_KEY,JSON.stringify(customStaffClothingSizes));
}
function customClothingSizesFor(audience,id){
  return audience==="staff"?(customStaffClothingSizes[id]||{}):(customPlayerClothingSizes[id]||{});
}
function savePersonCustomClothingSizes(audience,id,values){
  const store=audience==="staff"?customStaffClothingSizes:customPlayerClothingSizes;
  store[id]={...(store[id]||{}),...values};saveCustomClothingSizes();
}
function activeClothingItemsFor(audience){
  return CLOTHING_ITEMS.filter(item=>clothingConfig(item).active!==false&&(item.audience===audience||item.audience==="both"));
}
loadCustomClothingSizes();
loadStaffKitStatus();
let CLOTHING_ITEMS=[...BASE_CLOTHING_ITEMS];
let clothingCatalogConfig={};
function loadCustomClothingItems(){
  let saved=[];
  try{saved=JSON.parse(localStorage.getItem(CUSTOM_CLOTHING_KEY)||"[]")||[]}catch(_){saved=[]}
  const valid=saved.filter(item=>item&&item.key&&item.label).map(item=>({
    key:String(item.key),label:String(item.label),icon:item.icon||"👕",category:CLOTHING_CATEGORIES.includes(item.category)?item.category:"Complementos",audience:["players","staff","both"].includes(item.audience)?item.audience:"both",custom:true
  }));
  CLOTHING_ITEMS=[...BASE_CLOTHING_ITEMS,...valid.filter(item=>!BASE_CLOTHING_ITEMS.some(base=>base.key===item.key))];
}
function saveCustomClothingItems(){
  localStorage.setItem(CUSTOM_CLOTHING_KEY,JSON.stringify(CLOTHING_ITEMS.filter(item=>item.custom)));
}
loadCustomClothingItems();
function loadClothingCatalogConfig(){
  try{clothingCatalogConfig=JSON.parse(localStorage.getItem("cdsb_clothing_catalog_v24_1")||"{}")||{}}
  catch(_){clothingCatalogConfig={}}
  const renameLegacy={
    game_shirt:["Camiseta equipación","Camiseta de juego"],
    game_shorts:["Pantalón equipación","Pantalón de juego"],
    socks:["Medias"],
    training_shirt:["Camiseta entrenamiento"],
    training_shorts:["Pantalón entrenamiento"]
  };
  const currentDefaults={
    game_shirt:"Camiseta primera equipación jugador",
    game_shorts:"Pantalón equipación jugador",
    socks:"Medias jugador",
    training_shirt:"Camiseta entrenamiento jugador",
    training_shorts:"Pantalón entrenamiento jugador"
  };
  let changed=false;
  Object.entries(renameLegacy).forEach(([key,legacy])=>{
    const cfg=clothingCatalogConfig[key];
    if(cfg&&legacy.includes(String(cfg.label||"").trim())){
      clothingCatalogConfig[key]={...cfg,label:currentDefaults[key]};
      changed=true;
    }
  });
  if(changed)saveClothingCatalogConfig();
}
function saveClothingCatalogConfig(){localStorage.setItem("cdsb_clothing_catalog_v24_1",JSON.stringify(clothingCatalogConfig))}
function clothingConfig(item){
  const saved=clothingCatalogConfig[item.key]||{};
  return {label:saved.label||item.label,category:saved.category||item.category,active:saved.active!==false};
}
function clothingLabelForAudience(item,audience){
  const label=clothingConfig(item).label;
  if(item?.key==="training_shirt"&&label==="Camiseta entrenamiento jugador"){
    if(audience==="staff")return "Camiseta entrenamiento cuerpo técnico";
    if(audience==="all")return "Camiseta entrenamiento";
  }
  if(item?.key==="training_shorts"&&label==="Pantalón entrenamiento jugador"){
    if(audience==="staff")return "Pantalón entrenamiento cuerpo técnico";
    if(audience==="all")return "Pantalón entrenamiento";
  }
  return label;
}
function refreshClothingItem(key,changes){
  const item=CLOTHING_ITEMS.find(x=>x.key===key);if(!item)return;
  clothingCatalogConfig[key]={...clothingConfig(item),...changes};saveClothingCatalogConfig();renderClothingCatalog();renderKits();
}
window.renameClothingItem=(key,input)=>{const value=String(input?.value||"").trim();if(!value)return;refreshClothingItem(key,{label:value});toast("Nombre de la prenda actualizado")};
window.changeClothingCategory=(key,select)=>{refreshClothingItem(key,{category:select.value});toast("Categoría actualizada")};
window.changeClothingAudience=(key,select)=>{
  const item=CLOTHING_ITEMS.find(x=>x.key===key&&x.custom);if(!item)return;
  item.audience=select.value;saveCustomClothingItems();renderClothingCatalog();renderKits();toast("Apartado actualizado");
};
window.toggleClothingItem=(key,checkbox)=>{refreshClothingItem(key,{active:!!checkbox.checked});toast(checkbox.checked?"Prenda activada":"Prenda desactivada")};
window.removeCustomClothingItem=async key=>{
  const item=CLOTHING_ITEMS.find(x=>x.key===key&&x.custom);if(!item)return;
  if(!confirm(`¿Eliminar ${clothingConfig(item).label} del catálogo?`))return;
  CLOTHING_ITEMS=CLOTHING_ITEMS.filter(x=>x.key!==key);delete clothingCatalogConfig[key];delete clothingImages[key];
  Object.values(customPlayerClothingSizes).forEach(values=>delete values[key]);
  Object.values(customStaffClothingSizes).forEach(values=>delete values[key]);
  saveCustomClothingItems();saveClothingCatalogConfig();saveCustomClothingSizes();
  try{await sb.storage.from("documents").remove([`clothing-catalog/${key}.jpg`])}catch(_){}
  renderClothingCatalog();renderKits();toast("Prenda eliminada del catálogo");
};
function openNewClothingItem(){
  const form=document.getElementById("clothingItemForm"),dialog=document.getElementById("clothingItemDialog");
  if(!form||!dialog)return;form.reset();dialog.showModal();
}
async function createCustomClothingItem(event){
  event.preventDefault();const form=event.currentTarget,raw=Object.fromEntries(new FormData(form));
  const label=String(raw.label||"").trim();if(!label)return toast("Escribe el nombre de la prenda");
  const key=`custom_${Date.now()}_${cleanName(label).toLowerCase()}`;
  CLOTHING_ITEMS.push({key,label,icon:"👕",category:raw.category||"Complementos",audience:raw.audience||"both",custom:true});
  saveCustomClothingItems();clothingCatalogConfig[key]={label,category:raw.category||"Complementos",active:true};saveClothingCatalogConfig();
  document.getElementById("clothingItemDialog")?.close();renderClothingCatalog();renderKits();toast("Prenda añadida al apartado seleccionado");
}
async function imageToJpeg(file){
  if(!file?.type?.startsWith("image/"))throw new Error("Selecciona un archivo de imagen");
  const bitmap=await createImageBitmap(file);
  const max=1200, scale=Math.min(1,max/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const ctx=canvas.getContext("2d");ctx.fillStyle="#ffffff";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close?.();
  return await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("No se pudo preparar la imagen")),"image/jpeg",.86));
}
async function loadClothingImages(){
  clothingImages={};
  try{
    const {data,error}=await sb.storage.from("documents").list("clothing-catalog",{limit:100});
    if(error)throw error;
    for(const item of data||[]){
      const key=String(item.name||"").replace(/\.jpg$/i,"");
      if(CLOTHING_ITEMS.some(x=>x.key===key)){
        const path=`clothing-catalog/${item.name}`;
        clothingImages[key]=await signedUrl(path);
      }
    }
  }catch(error){console.warn("No se pudieron cargar las fotos de ropa",error)}
}
function renderClothingCatalog(){
  const grid=document.getElementById("clothingCatalogGrid");if(!grid)return;
  if(!(typeof isHistoricalSeason==="function"&&isHistoricalSeason()))loadClothingCatalogConfig();
  grid.innerHTML=CLOTHING_CATEGORIES.map(category=>{
    const items=CLOTHING_ITEMS.filter(item=>clothingConfig(item).category===category);
    if(!items.length)return "";
    return `<section class="clothing-category-block"><div class="clothing-category-title"><span>${esc(category)}</span><small>${items.length} prenda${items.length===1?"":"s"}</small></div><div class="clothing-category-grid">${items.map(item=>{
      const cfg=clothingConfig(item);
      return `<article class="clothing-item-card ${cfg.active?"":"is-inactive"}" data-clothing-item="${item.key}">
        <div class="clothing-item-status"><label><input type="checkbox" ${cfg.active?"checked":""} onchange="toggleClothingItem('${item.key}',this)"><span>${cfg.active?"Activa":"Inactiva"}</span></label></div>
        <div class="clothing-item-image">${clothingImages[item.key]?`<img src="${clothingImages[item.key]}" alt="${esc(cfg.label)}">`:`<span class="clothing-placeholder">${item.icon}</span>`}</div>
        <div class="clothing-item-info">
          <input class="clothing-name-input" value="${esc(cfg.label)}" aria-label="Nombre de la prenda" onchange="renameClothingItem('${item.key}',this)">
          <select class="clothing-category-select" aria-label="Categoría" onchange="changeClothingCategory('${item.key}',this)">${CLOTHING_CATEGORIES.map(c=>`<option ${c===cfg.category?"selected":""}>${esc(c)}</option>`).join("")}</select>
          ${item.custom?`<select class="clothing-audience-select" aria-label="Apartado" onchange="changeClothingAudience('${item.key}',this)"><option value="players" ${item.audience==="players"?"selected":""}>Jugadores</option><option value="staff" ${item.audience==="staff"?"selected":""}>Cuerpo técnico</option><option value="both" ${item.audience==="both"?"selected":""}>Jugadores y técnicos</option></select>`:`<div class="clothing-audience-badge">${item.audience==="players"?"Jugadores":item.audience==="staff"?"Cuerpo técnico":"Jugadores y técnicos"}</div>`}
          <button class="clothing-upload-btn" type="button" onclick="document.getElementById('clothing-file-${item.key}').click()">${clothingImages[item.key]?"Cambiar foto":"Subir foto"}</button>
          <input id="clothing-file-${item.key}" class="clothing-file-input" type="file" accept="image/*" onchange="uploadClothingImage('${item.key}',this)">
          ${item.custom?`<button class="clothing-delete-btn" type="button" onclick="removeCustomClothingItem('${item.key}')">Eliminar prenda</button>`:""}
        </div></article>`}).join("")}</div></section>`;
  }).join("");
  refreshKitDialogImages();
}
function refreshKitDialogImages(){
  document.querySelectorAll(".visual-size-field[data-clothing-key]").forEach(field=>{
    const key=field.dataset.clothingKey,box=field.querySelector(".visual-size-photo"),title=field.querySelector(".visual-size-name");if(!box)return;
    const item=CLOTHING_ITEMS.find(x=>x.key===key),cfg=item?clothingConfig(item):null;
    field.classList.toggle("is-disabled",cfg?.active===false);
    if(title&&cfg)title.textContent=cfg.label;
    box.innerHTML=clothingImages[key]?`<img src="${clothingImages[key]}" alt="${esc(cfg?.label||"Prenda")}">`:"";
  });
}
window.uploadClothingImage=async(key,input)=>{
  const file=input?.files?.[0];if(!file)return;
  const button=input.previousElementSibling;const oldText=button?.textContent;
  try{
    if(button){button.disabled=true;button.textContent="Subiendo..."}
    const blob=await imageToJpeg(file);
    const path=`clothing-catalog/${key}.jpg`;
    const {error}=await sb.storage.from("documents").upload(path,blob,{contentType:"image/jpeg",upsert:true,cacheControl:"0"});
    if(error)throw error;
    signedCache[path]=null;
    const url=await signedUrl(path);clothingImages[key]=url?`${url}${url.includes("?")?"&":"?"}v=${Date.now()}`:null;
    renderClothingCatalog();toast("Foto de la prenda guardada");
  }catch(error){console.error(error);toast("No se pudo subir la foto: "+(error.message||"error"))}
  finally{if(button){button.disabled=false;button.textContent=oldText||"Subir foto"}input.value=""}
};

// Utilidad global para mostrar texto de forma segura en cualquier módulo.
const esc=value=>String(value??"-")
  .replace(/&/g,"&amp;")
  .replace(/</g,"&lt;")
  .replace(/>/g,"&gt;")
  .replace(/"/g,"&quot;")
  .replace(/'/g,"&#039;");

const getEl=id=>document.getElementById(id);
const playerFormEl=getEl("playerForm");
const playerDialogEl=getEl("playerDialog");
const headerAddPlayerEl=getEl("headerAddPlayer");
const playersAddPlayerEl=getEl("playersAddPlayer");
// Referencias explícitas: no depender de variables automáticas del navegador.
const addEvent=getEl("addEvent");
const addMovement=getEl("addMovement");
const addPitch=getEl("addPitch");
const addStaff=getEl("addStaff");
const addTeam=getEl("addTeam");
const alerts=getEl("alerts");
const authMessage=getEl("authMessage");
const calendarList=getEl("calendarList");
const changeConnection=getEl("changeConnection");
const copyUrl=getEl("copyUrl");
const dashboardProgress=getEl("dashboardProgress");
const documentDialog=getEl("documentDialog");
const documentForm=getEl("documentForm");
const documentsBody=getEl("documentsBody");
const documentsTeamFilter=getEl("documentsTeamFilter");
const clearDocumentsTeamFilter=getEl("clearDocumentsTeamFilter");
const email=getEl("email");
const eventDialog=getEl("eventDialog");
const eventForm=getEl("eventForm");
const existingReceipt=getEl("existingReceipt");
const financeBalance=getEl("financeBalance");
const financeBody=getEl("financeBody");
const financeExpense=getEl("financeExpense");
const financeIncome=getEl("financeIncome");
const financeMonth=getEl("financeMonth");
const financeTypeFilter=getEl("financeTypeFilter");
const kitDialog=getEl("kitDialog");
const kitForm=getEl("kitForm");
const kitsBody=getEl("kitsBody");
const loginForm=getEl("loginForm");
const logout=getEl("logout");
const movementDialog=getEl("movementDialog");
const movementForm=getEl("movementForm");
const pageSub=getEl("pageSub");
const pageTitle=getEl("pageTitle");
const password=getEl("password");
const paymentDialog=getEl("paymentDialog");
const paymentForm=getEl("paymentForm");
const paymentsBody=getEl("paymentsBody");
const paymentsTeamFilter=getEl("paymentsTeamFilter");
const clearPaymentsTeamFilter=getEl("clearPaymentsTeamFilter");
const pitchDialog=getEl("pitchDialog");
const pitchForm=getEl("pitchForm");
const pitchMatches=getEl("pitchMatches");
const pitchMonth=getEl("pitchMonth");
const pitchAllMonths=getEl("pitchAllMonths");
const pitchTeamFilter=getEl("pitchTeamFilter");
const pitchFieldFilter=getEl("pitchFieldFilter");
const pitchPdf=getEl("pitchPdf");
const pitchTotal=getEl("pitchTotal");
const pitchTrainings=getEl("pitchTrainings");
const pitchCancelled=getEl("pitchCancelled");
const pitchesBody=getEl("pitchesBody");
const publicUrl=getEl("publicUrl");
const rDocs=getEl("rDocs");
const rFinance=getEl("rFinance");
const rPayments=getEl("rPayments");
const rPitches=getEl("rPitches");
const rPlayers=getEl("rPlayers");
const rPrint=getEl("rPrint");
const rSizes=getEl("rSizes");
const reportStatDocs=getEl("reportStatDocs");
const reportStatPayments=getEl("reportStatPayments");
const reportStatPitches=getEl("reportStatPitches");
const reportStatPlayers=getEl("reportStatPlayers");
const setupForm=getEl("setupForm");
const setupKey=getEl("setupKey");
const setupUrl=getEl("setupUrl");
const trashPlayers=getEl("trashPlayers");
const trashTeams=getEl("trashTeams");
const activityList=getEl("activityList");
const dashboardActivity=getEl("dashboardActivity");
const refreshTrash=getEl("refreshTrash");
const refreshActivity=getEl("refreshActivity");
const createBackup=getEl("createBackup");
const backupStatus=getEl("backupStatus");
const seasonSelector=getEl("seasonSelector");
const seasonsList=getEl("seasonsList");
const seasonCurrentTitle=getEl("seasonCurrentTitle");
const seasonCurrentState=getEl("seasonCurrentState");
const openSeasonWizardButton=getEl("openSeasonWizard");
const seasonRolloverWizard=getEl("seasonRolloverWizard");
const seasonWizardSteps=getEl("seasonWizardSteps");
const seasonWizardBody=getEl("seasonWizardBody");
const seasonWizardBack=getEl("seasonWizardBack");
const seasonWizardNext=getEl("seasonWizardNext");
const seasonWizardHint=getEl("seasonWizardHint");
const seasonWizardTitle=getEl("seasonWizardTitle");
const closeSeasonWizard=getEl("closeSeasonWizard");
const historicalSeasonBanner=getEl("historicalSeasonBanner");
const dashboardSeasonLabel=getEl("dashboardSeasonLabel");

const stApproved=getEl("stApproved");
const stBalance=getEl("stBalance");
const stDocumentsPending=getEl("stDocumentsPending");
const stKitsPending=getEl("stKitsPending");
const stPaid=getEl("stPaid");
const stPending=getEl("stPending");
const stPendingPlayers=getEl("stPendingPlayers");
const stPitches=getEl("stPitches");
const stPlayers=getEl("stPlayers");
const stStaff=getEl("stStaff");
const stTeams=getEl("stTeams");
const staffBody=getEl("staffBody");
const staffDialog=getEl("staffDialog");
const staffDialogTitle=getEl("staffDialogTitle");
const staffForm=getEl("staffForm");
const syncState=getEl("syncState");
const teamDetailContent=getEl("teamDetailContent");
const teamDetailDialog=getEl("teamDetailDialog");
const teamDetailTitle=getEl("teamDetailTitle");
const teamDialog=getEl("teamDialog");
const deletePlayerFromForm=getEl("deletePlayerFromForm");
const deleteTeamFromForm=getEl("deleteTeamFromForm");
const deleteTeamFromDetail=getEl("deleteTeamFromDetail");

const teamForm=getEl("teamForm");
const teamsGrid=getEl("teamsGrid");
const upcomingEvents=getEl("upcomingEvents");

const toast=t=>{const e=document.getElementById("toast");e.textContent=t;e.classList.add("show");setTimeout(()=>e.classList.remove("show"),1800)};
const badge=t=>{let c="warn";if(["Aprobada","Pagado","Completa","Recibido","Sí"].includes(t))c="ok";if(["Rechazada","Baja","Pendiente","Incompleta","No"].includes(t))c="bad";return `<span class="badge ${c}">${t}</span>`};
// ================================================================
// V27.2.10 · Desplazamiento independiente y diálogos con scroll vertical
// La base operativa siempre representa la temporada activa. Al cerrar una
// temporada se archiva una instantánea completa y queda disponible en modo
// consulta, sin duplicar jugadores ni romper los accesos de los técnicos.
// ================================================================
const SEASON_SELECTED_KEY="cdsb_selected_season_v2725";
let clubSeasons=[];
let activeClubSeason=null;
let selectedClubSeason=null;
let seasonSystemReady=false;
window.CDSB_SEASON_STATE={id:null,label:"2026/27",historical:false,active:true};
function currentSeasonLabel(){return selectedClubSeason?.name||activeClubSeason?.name||"2026/27"}
function isHistoricalSeason(){return Boolean(selectedClubSeason&&activeClubSeason&&selectedClubSeason.id!==activeClubSeason.id)}
function nextSeasonLabel(label=currentSeasonLabel()){
  const m=String(label||"").match(/^(\d{4})\/(\d{2})$/);
  if(!m)return "";
  const start=Number(m[1])+1;
  return `${start}/${String((start+1)%100).padStart(2,"0")}`;
}
function setSeasonState(season){
  selectedClubSeason=season||activeClubSeason;
  const historical=isHistoricalSeason();
  window.CDSB_SEASON_STATE={id:selectedClubSeason?.id||null,label:currentSeasonLabel(),historical,active:!historical};
  document.body.classList.toggle("season-history-mode",historical);
  historicalSeasonBanner?.classList.toggle("hidden",!historical);
  if(dashboardSeasonLabel)dashboardSeasonLabel.textContent=`CD SAN BERNABÉ · TEMPORADA ${currentSeasonLabel()}`;
  const sidebar=document.querySelector(".season-switcher");
  if(sidebar)sidebar.dataset.historical=historical?"true":"false";
  const posterSeason=document.getElementById("posterSeason");if(posterSeason)posterSeason.value=currentSeasonLabel();
  if(seasonCurrentTitle)seasonCurrentTitle.textContent=`Temporada ${currentSeasonLabel()}`;
}
function seasonFallback(){
  const fallback={id:null,name:"2026/27",start_year:2026,end_year:2027,status:"active",created_at:null,closed_at:null};
  clubSeasons=[fallback];activeClubSeason=fallback;selectedClubSeason=fallback;setSeasonState(fallback);
}
async function loadClubSeasons(){
  try{
    const {data,error}=await sb.from("club_seasons").select("id,name,start_year,end_year,status,created_at,closed_at").order("start_year",{ascending:false});
    if(error)throw error;
    clubSeasons=Array.isArray(data)?data:[];
    activeClubSeason=clubSeasons.find(x=>x.status==="active")||clubSeasons[0]||null;
    if(!activeClubSeason)throw new Error("No existe una temporada activa");
    seasonSystemReady=true;
    const saved=localStorage.getItem(SEASON_SELECTED_KEY);
    let selected=clubSeasons.find(x=>String(x.id)===String(saved))||activeClubSeason;
    if(typeof isTechnicalReadOnly==="function"&&isTechnicalReadOnly())selected=activeClubSeason;
    setSeasonState(selected);
    renderSeasonSelector();
    return true;
  }catch(error){
    console.warn("Gestión de temporadas no disponible",error);
    seasonSystemReady=false;seasonFallback();renderSeasonSelector();
    return false;
  }
}
function renderSeasonSelector(){
  if(!seasonSelector)return;
  seasonSelector.innerHTML=clubSeasons.map(season=>`<option value="${esc(season.id||"")}">${esc(season.name)}${season.status==="active"?" · ACTIVA":" · HISTÓRICO"}</option>`).join("");
  seasonSelector.value=selectedClubSeason?.id||"";
  seasonSelector.disabled=typeof isTechnicalReadOnly==="function"&&isTechnicalReadOnly();
}
function snapshotLocalData(){
  return {
    clubMatches:Array.isArray(clubMatches)?clubMatches:[],
    staffKitStatus:staffKitStatus||{},
    customPlayerClothingSizes:customPlayerClothingSizes||{},
    customStaffClothingSizes:customStaffClothingSizes||{},
    clothingItems:Array.isArray(CLOTHING_ITEMS)?JSON.parse(JSON.stringify(CLOTHING_ITEMS)):[],
    clothingCatalogConfig:clothingCatalogConfig||{}
  };
}
async function buildSeasonSnapshot(){
  // Los datos de Supabase se capturan dentro del RPC para que el cierre sea
  // atómico y no dependa del tamaño de una descarga/subida desde el navegador.
  // Aquí solo enviamos la pequeña parte que vive en este dispositivo.
  return {
    application:"CD San Bernabé Manager",
    version:"V27.2.10",
    season:currentSeasonLabel(),
    archived_at:new Date().toISOString(),
    local:snapshotLocalData()
  };
}
function applySnapshotTables(snapshot){
  const t=snapshot?.tables||{};
  const p=Array.isArray(t.players)?t.players:[];players=p.filter(x=>!x.deleted_at);deletedPlayers=p.filter(x=>x.deleted_at);
  const tm=Array.isArray(t.teams)?t.teams:[];teams=tm.filter(x=>!x.deleted_at);deletedTeams=tm.filter(x=>x.deleted_at);
  payments=Array.isArray(t.payments)?t.payments:[];documents=Array.isArray(t.documents)?t.documents:[];kits=Array.isArray(t.kits)?t.kits:[];
  playerSizes=Array.isArray(t.player_sizes)?t.player_sizes:[];staff=Array.isArray(t.staff)?t.staff:[];staffSizes=Array.isArray(t.staff_sizes)?t.staff_sizes:[];
  events=Array.isArray(t.events)?t.events:[];pitchUsage=Array.isArray(t.pitch_usage)?t.pitch_usage:[];financeMovements=Array.isArray(t.finance_movements)?t.finance_movements:[];
  activityLogs=Array.isArray(t.activity_logs)?t.activity_logs:[];
  clubMatches=Array.isArray(snapshot?.local?.clubMatches)?JSON.parse(JSON.stringify(snapshot.local.clubMatches)):[];
  staffKitStatus=snapshot?.local?.staffKitStatus||{};
  customPlayerClothingSizes=snapshot?.local?.customPlayerClothingSizes||{};
  customStaffClothingSizes=snapshot?.local?.customStaffClothingSizes||{};
  if(Array.isArray(snapshot?.local?.clothingItems)&&snapshot.local.clothingItems.length)CLOTHING_ITEMS=JSON.parse(JSON.stringify(snapshot.local.clothingItems));
  else CLOTHING_ITEMS=[...BASE_CLOTHING_ITEMS];
  clothingCatalogConfig=snapshot?.local?.clothingCatalogConfig?JSON.parse(JSON.stringify(snapshot.local.clothingCatalogConfig)):{};
  signedCache={};clothingImages={};
}
async function loadArchivedSeason(season){
  syncState.textContent="● Cargando histórico...";
  const {data,error}=await sb.from("club_seasons").select("id,name,status,snapshot").eq("id",season.id).single();
  if(error)throw error;
  if(!data?.snapshot)throw new Error("Esta temporada no tiene una copia histórica disponible");
  applySnapshotTables(data.snapshot);
  for(const player of players){if(player.photo_path&&!signedCache[player.photo_path])signedCache[player.photo_path]=await signedUrl(player.photo_path)}
  await loadClothingImages();
  window.sportsV2703?.loadSnapshot?.(data.snapshot.sports||{});
  syncState.textContent="● Histórico · solo lectura";
  render();
}
async function loadActiveSeasonData(){
  loadCustomClothingItems();loadClothingCatalogConfig();loadCustomClothingSizes();loadStaffKitStatus();
  if(typeof loadClubMatches==="function")loadClubMatches();
  await loadAll();
  await window.sportsV2703?.load?.();
}
async function switchClubSeason(id){
  if(!seasonSystemReady)return;
  const target=clubSeasons.find(x=>String(x.id)===String(id));if(!target)return;
  document.querySelectorAll("dialog[open]").forEach(dialog=>{try{dialog.close()}catch(_){}});
  if(typeof isTechnicalReadOnly==="function"&&isTechnicalReadOnly()&&target.id!==activeClubSeason?.id)return;
  setSeasonState(target);localStorage.setItem(SEASON_SELECTED_KEY,target.id);renderSeasonSelector();renderSeasonsManager();
  try{
    if(isHistoricalSeason())await loadArchivedSeason(target);else{
      await loadActiveSeasonData();
      if(!isTechnicalReadOnly()&&!channel)realtime();
    }
    setTimeout(applySeasonReadOnlyUi,0);
  }catch(error){showOperationError("No se pudo abrir la temporada.",error);setSeasonState(activeClubSeason);renderSeasonSelector();await loadActiveSeasonData();if(!isTechnicalReadOnly()&&!channel)realtime();setTimeout(applySeasonReadOnlyUi,0)}
}
function renderSeasonsManager(){
  if(!seasonCurrentState||!seasonsList)return;
  if(!seasonSystemReady){
    seasonCurrentState.innerHTML=`<span class="season-badge closed">PENDIENTE</span><strong>Gestión multitemporada no disponible</strong><span>Comprueba que se ha ejecutado EJECUTAR_ACTUALIZACION_V27_2_1.sql en Supabase y que la conexión está activa.</span>`;
    seasonsList.innerHTML='<div class="empty-state">Todavía no se ha podido cargar el histórico de temporadas.</div>';
    document.getElementById("seasonRolloverPanel")?.classList.add("hidden");
    return;
  }
  const historical=isHistoricalSeason();
  const state=selectedClubSeason?.status==="active"?"Temporada activa":"Temporada cerrada";
  seasonCurrentState.innerHTML=`<span class="season-badge ${historical?"closed":""}">${esc(state)}</span><strong>${esc(currentSeasonLabel())}</strong><span>${historical?"Consulta histórica. Los datos no se pueden modificar.":"Todos los cambios se guardan en esta temporada."}</span>`;
  seasonsList.innerHTML=clubSeasons.map(season=>`<article class="season-list-item ${String(season.id)===String(selectedClubSeason?.id)?"active-selection":""}"><div><strong>${esc(season.name)}</strong><small>${season.status==="active"?"ACTIVA":`Cerrada${season.closed_at?" · "+new Date(season.closed_at).toLocaleDateString("es-ES"):""}`}</small></div><button type="button" class="mini" data-season-open="${esc(season.id||"")}">${String(season.id)===String(selectedClubSeason?.id)?(season.status==="active"?"Activa":"Consultando"):"Ver temporada"}</button></article>`).join("");
  seasonsList.querySelectorAll("[data-season-open]").forEach(btn=>btn.onclick=()=>switchClubSeason(btn.dataset.seasonOpen));
  const rolloverPanel=document.getElementById("seasonRolloverPanel");if(rolloverPanel)rolloverPanel.classList.toggle("hidden",historical||!seasonSystemReady||(typeof isTechnicalReadOnly==="function"&&isTechnicalReadOnly()));
}
function applySeasonReadOnlyUi(){
  const historical=isHistoricalSeason();
  document.querySelectorAll('button[data-season-readonly-disabled="true"]').forEach(button=>{
    if(!historical){button.disabled=false;button.removeAttribute("data-season-readonly-disabled");if(button.title==="La temporada histórica es de solo lectura")button.removeAttribute("title")}
  });
  document.querySelectorAll('[data-season-readonly-field="true"]').forEach(field=>{
    if(!historical){field.disabled=false;field.removeAttribute("data-season-readonly-field")}
  });
  if(!historical)return;
  document.querySelectorAll("#clothingCatalogGrid .clothing-name-input,#clothingCatalogGrid .clothing-category-select,#clothingCatalogGrid .clothing-audience-select,#clothingCatalogGrid .clothing-item-status input,#clothingCatalogGrid .clothing-file-input,#clothingCatalogGrid .inventory-card-stock-input,.inventory-stock-input").forEach(field=>{
    if(!field.disabled){field.disabled=true;field.dataset.seasonReadonlyField="true"}
  });
  const writeWords=/nuevo|nueva|añadir|agregar|editar|eliminar|guardar|registrar|subir|importar|cobrar|resultado|finalizar|restaurar|entregar|crear|borrar|modificar|actualizar|reiniciar/i;
  document.querySelectorAll("#app button, dialog button").forEach(button=>{
    if(button.matches("[data-season-open],.nav,#rPrint,[data-close]")||button.closest("#seasons")||button.disabled)return;
    const text=(button.textContent||"").trim();
    if(writeWords.test(text)){
      button.disabled=true;
      button.dataset.seasonReadonlyDisabled="true";
      button.title="La temporada histórica es de solo lectura";
    }
  });
}
document.addEventListener("submit",event=>{
  if(!isHistoricalSeason())return;
  if(["loginForm","setupForm"].includes(event.target.id))return;
  event.preventDefault();event.stopImmediatePropagation();toast("La temporada histórica es de solo lectura");
},true);
document.addEventListener("click",event=>{
  if(!isHistoricalSeason())return;
  const button=event.target.closest?.("button");if(!button)return;
  if(button.matches("[data-season-open],.nav,#rPrint,[data-close],[data-report-export]")||button.closest("#seasons"))return;
  const text=(button.textContent||"").trim();
  if(/nuevo|nueva|añadir|agregar|editar|eliminar|guardar|registrar|subir|importar|cobrar|resultado|finalizar|restaurar|entregar|crear|borrar|modificar|actualizar|reiniciar/i.test(text)){
    event.preventDefault();event.stopImmediatePropagation();toast("La temporada histórica es de solo lectura");
  }
},true);
let seasonRolloverDraft=null;
let seasonPlayerFilter="";
let seasonPlayerCategoryFilter="";
let seasonPlayerBulkTeam="";
let seasonStaffFilter="";

function normalizeSeasonCategory(value){
  const text=String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  if(text.includes("prebenjamin"))return "Prebenjamín";
  if(text.includes("benjamin"))return "Benjamín";
  if(text.includes("alevin"))return "Alevín";
  if(text.includes("infantil"))return "Infantil";
  if(text.includes("cadete"))return "Cadete";
  if(text.includes("juvenil"))return "Juvenil";
  if(text.includes("bebe"))return "Bebé";
  return "";
}
function seasonStartYearFromLabel(label){
  const match=String(label||"").match(/^(\d{4})\//);
  return match?Number(match[1]):null;
}
function suggestedSeasonCategory(birthDate,seasonName){
  const birthYear=Number(String(birthDate||"").slice(0,4));
  const startYear=seasonStartYearFromLabel(seasonName);
  if(!birthYear||!startYear)return "";
  const age=startYear-birthYear;
  if(age>=4&&age<=5)return "Bebé";
  if(age>=6&&age<=7)return "Prebenjamín";
  if(age>=8&&age<=9)return "Benjamín";
  if(age>=10&&age<=11)return "Alevín";
  if(age>=12&&age<=13)return "Infantil";
  if(age>=14&&age<=15)return "Cadete";
  if(age>=16&&age<=18)return "Juvenil";
  return "";
}
function seasonTeamCategory(teamName){
  const team=(teams||[]).find(t=>String(t?.name||"").trim()===String(teamName||"").trim());
  return normalizeSeasonCategory(team?.age_category)||normalizeSeasonCategory(team?.name||teamName)||normalizeSeasonCategory(team?.category);
}
function seasonDraftTeamId(){
  return (crypto?.randomUUID?.()||`draft_${Date.now()}_${Math.random().toString(16).slice(2)}`);
}
function seasonNewTeamById(id){
  return seasonRolloverDraft?.newTeams?.find(team=>String(team.draftId)===String(id))||null;
}
function seasonNewTeamName(id){
  return String(seasonNewTeamById(id)?.name||"").trim();
}
function seasonNewTeamsForCategory(category){
  const list=seasonRolloverDraft?.newTeams||[];
  if(!category)return[];
  return list.filter(t=>(normalizeSeasonCategory(t.age_category)||normalizeSeasonCategory(t.name)||normalizeSeasonCategory(t.category))===category);
}
function seasonPlayerAutomaticTeamId(item,seasonName){
  const suggested=suggestedSeasonCategory(item.birthDate,seasonName);
  if(!suggested)return "";
  const currentCategory=seasonTeamCategory(item.currentTeam);
  const proposals=seasonRolloverDraft?.newTeams||[];
  if(currentCategory===suggested&&String(item.currentTeam||"").trim()){
    const same=proposals.find(t=>String(t.name||"").trim().toLocaleLowerCase("es")===String(item.currentTeam||"").trim().toLocaleLowerCase("es"));
    if(same)return same.draftId;
  }
  const candidates=seasonNewTeamsForCategory(suggested);
  return candidates.length===1?candidates[0].draftId:"";
}
function recalculateSeasonPlayerSuggestions(){
  const d=seasonRolloverDraft;if(!d)return;
  const validIds=new Set((d.newTeams||[]).map(t=>String(t.draftId)));
  d.players.forEach(x=>{
    x.currentCategory=seasonTeamCategory(x.currentTeam);
    x.suggestedCategory=suggestedSeasonCategory(x.birthDate,d.newName);
    x.autoTargetTeamId=seasonPlayerAutomaticTeamId(x,d.newName);
    if(x.targetTeamId&&!validIds.has(String(x.targetTeamId)))x.targetTeamId="";
    if(!x.teamTouched)x.targetTeamId=x.autoTargetTeamId||"";
  });
  d.staff.forEach(x=>{
    if(x.targetTeamId&&!validIds.has(String(x.targetTeamId)))x.targetTeamId="";
    if(!x.teamTouched){
      const match=(d.newTeams||[]).find(t=>String(t.name||"").trim().toLocaleLowerCase("es")===String(x.currentTeam||"").trim().toLocaleLowerCase("es"));
      x.targetTeamId=match?.draftId||"";
    }
  });
}
function seasonTargetTeamOptions(selectedId,includePlaceholder=true){
  const d=seasonRolloverDraft;
  const teamsList=[...(d?.newTeams||[])].sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""),"es",{sensitivity:"base"}));
  const current=String(selectedId||"");
  return `${includePlaceholder?'<option value="">— Sin equipo / decidir después —</option>':""}${teamsList.map(team=>`<option value="${esc(team.draftId)}" ${String(team.draftId)===current?"selected":""}>${esc(team.name||"Equipo sin nombre")}${team.age_category?` · ${esc(team.age_category)}`:""}${team.category?` · ${esc(team.category)}`:""}</option>`).join("")}`;
}
function seasonDefaultNewTeams(){
  return sortTeamsAlpha(teams||[]).map(t=>({
    draftId:seasonDraftTeamId(),
    name:String(t.name||"").trim(),
    age_category:String(t.age_category||normalizeSeasonCategory(t.name)||"").trim(),
    category:String(t.category||"").trim(),
    delegate_name:String(t.delegate_name||"").trim(),
    training_schedule:String(t.training_schedule||"").trim(),
    field:String(t.field||"").trim(),
    notes:String(t.notes||"").trim()
  }));
}
function initSeasonRolloverDraft(){
  seasonPlayerFilter="";seasonPlayerCategoryFilter="";seasonPlayerBulkTeam="";seasonStaffFilter="";
  const newName=nextSeasonLabel(activeClubSeason?.name||currentSeasonLabel());
  seasonRolloverDraft={
    step:1,
    newName,
    keepDocuments:true,
    keepSizes:true,
    newTeams:seasonDefaultNewTeams(),
    players:[],
    staff:[],
    confirmation:"",
    executing:false,
    simulating:false,
    simulation:null,
    simulationFingerprint:""
  };
  seasonRolloverDraft.players=sortByAlpha((players||[]).filter(p=>!p.deleted_at),p=>`${p.team||""} ${p.surname||""} ${p.name||""}`).map(p=>({
    id:p.id,
    name:`${p.name||""} ${p.surname||""}`.trim(),
    birthDate:p.birth_date||"",
    birthYear:String(p.birth_date||"").slice(0,4),
    currentTeam:p.team||"",
    currentCategory:seasonTeamCategory(p.team||""),
    suggestedCategory:suggestedSeasonCategory(p.birth_date,newName),
    targetTeamId:"",
    autoTargetTeamId:"",
    teamTouched:false,
    keep:String(p.status||"").toLowerCase()!=="baja"
  }));
  seasonRolloverDraft.staff=sortByAlpha(staff||[],m=>`${m.team_name||""} ${m.name||""}`).map(m=>({
    id:m.id,name:m.name||"",role:m.role||"",currentTeam:m.team_name||"",targetTeamId:"",teamTouched:false,keep:true
  }));
  recalculateSeasonPlayerSuggestions();
}
function seasonDraftCounts(){
  const d=seasonRolloverDraft||{players:[],staff:[],newTeams:[]};
  return {
    teamsTotal:d.newTeams.length,
    playersTotal:d.players.length,
    playersKeep:d.players.filter(x=>x.keep).length,
    playersDrop:d.players.filter(x=>!x.keep).length,
    playersPending:d.players.filter(x=>x.keep&&!String(x.targetTeamId||"")).length,
    staffTotal:d.staff.length,
    staffKeep:d.staff.filter(x=>x.keep).length,
    staffDrop:d.staff.filter(x=>!x.keep).length,
    staffPending:d.staff.filter(x=>x.keep&&!String(x.targetTeamId||"")).length
  };
}

function seasonRolloverTeamPlan(){
  const d=seasonRolloverDraft;
  return (d?.newTeams||[]).map(t=>({
    name:String(t.name||"").trim(),
    age_category:String(t.age_category||"").trim(),
    category:String(t.category||"").trim(),
    delegate_name:String(t.delegate_name||"").trim(),
    training_schedule:String(t.training_schedule||"").trim(),
    field:String(t.field||"").trim(),
    notes:String(t.notes||"").trim()
  }));
}
function seasonRolloverPlayerPlan(){
  const d=seasonRolloverDraft;
  return (d?.players||[]).map(x=>({id:x.id,keep:Boolean(x.keep),team:seasonNewTeamName(x.targetTeamId)}));
}
function seasonRolloverStaffPlan(){
  const d=seasonRolloverDraft;
  return (d?.staff||[]).map(x=>({id:x.id,keep:Boolean(x.keep),team_name:seasonNewTeamName(x.targetTeamId)}));
}
function seasonRolloverFingerprint(){
  const d=seasonRolloverDraft;if(!d)return "";
  return JSON.stringify({
    currentSeasonId:activeClubSeason?.id||"",
    newName:d.newName,
    keepDocuments:Boolean(d.keepDocuments),
    keepSizes:Boolean(d.keepSizes),
    teams:seasonRolloverTeamPlan(),
    players:seasonRolloverPlayerPlan(),
    staff:seasonRolloverStaffPlan()
  });
}
function seasonSimulationIsCurrent(){
  const d=seasonRolloverDraft;
  return Boolean(d?.simulation?.ok===true&&d.simulationFingerprint&&d.simulationFingerprint===seasonRolloverFingerprint());
}
function seasonSimulationMarkup(){
  const d=seasonRolloverDraft;
  if(!d)return "";
  if(d.simulating)return `<div class="season-simulation-card running"><strong>Comprobando en Supabase…</strong><span>Se valida la temporada, equipos, jugadores y cuerpo técnico sin modificar ningún dato.</span></div>`;
  if(!d.simulation)return `<div class="season-simulation-card"><strong>Simulación pendiente</strong><span>Ejecuta una simulación antes del cierre real. No modifica ningún dato.</span></div>`;
  if(!seasonSimulationIsCurrent())return `<div class="season-simulation-card warning"><strong>La simulación ya no es válida</strong><span>El plan ha cambiado desde la última comprobación. Vuelve a simular antes de cerrar.</span></div>`;
  const r=d.simulation||{};
  return `<div class="season-simulation-card ok"><strong>✓ Simulación superada</strong><span>Supabase confirma que el cambio puede ejecutarse con el plan actual.</span>
    <div class="season-simulation-summary">
      <span><b>${Number(r.teams_new||0)}</b> equipos nuevos</span>
      <span><b>${Number(r.players_keep||0)}</b> jugadores continúan</span>
      <span><b>${Number(r.players_unassigned||0)}</b> jugadores sin equipo</span>
      <span><b>${Number(r.staff_keep||0)}</b> técnicos continúan</span>
      <span><b>${Number(r.staff_unassigned||0)}</b> técnicos sin equipo</span>
    </div></div>`;
}
async function simulateSeasonRolloverWizard(){
  const d=seasonRolloverDraft;if(!d||d.executing||d.simulating)return;
  if(!validateSeasonWizardStep())return;
  d.simulating=true;d.simulation=null;d.simulationFingerprint="";renderSeasonWizard();
  try{
    const fingerprint=seasonRolloverFingerprint();
    const {data,error}=await sb.rpc("cdsb_simulate_rollover_v2728",{
      p_current_season_id:activeClubSeason.id,
      p_new_name:d.newName,
      p_team_plan:seasonRolloverTeamPlan(),
      p_player_plan:seasonRolloverPlayerPlan(),
      p_staff_plan:seasonRolloverStaffPlan(),
      p_keep_documents:Boolean(d.keepDocuments),
      p_keep_sizes:Boolean(d.keepSizes)
    });
    if(error)throw error;
    const result=Array.isArray(data)?data[0]:data;
    if(!result?.ok)throw new Error(result?.message||"La simulación no se pudo completar");
    d.simulation=result;d.simulationFingerprint=fingerprint;
    toast("Simulación superada. No se ha modificado ningún dato.");
  }catch(error){
    d.simulation={ok:false,message:supabaseErrorText(error)};d.simulationFingerprint="";
    showOperationError("La simulación detectó un problema.",error);
  }finally{d.simulating=false;renderSeasonWizard()}
}
const SEASON_SAFETY_BACKUP_TABLES=["players","teams","payments","documents","kits","player_sizes","staff","staff_sizes","events","pitch_usage","finance_movements","activity_logs","sports_training_sessions","sports_training_attendance","sports_matches","sports_match_player_stats","team_player_cards","club_seasons","season_team_player_cards","user_profiles"];
async function fetchSeasonBackupTable(table,{optional=false}={}){
  const pageSize=500;let from=0;const rows=[];
  while(true){
    const {data,error}=await sb.from(table).select("*").range(from,from+pageSize-1);
    if(error){if(optional)return {warning:supabaseErrorText(error),rows:[]};throw new Error(`${table}: ${supabaseErrorText(error)}`)}
    const page=Array.isArray(data)?data:[];rows.push(...page);
    if(page.length<pageSize)break;
    from+=pageSize;
    if(from>100000)throw new Error(`${table}: la copia supera el límite de seguridad de 100.000 registros`);
  }
  return rows;
}
async function createSeasonRolloverSafetyBackup(){
  const d=seasonRolloverDraft;if(!d)throw new Error("No existe un plan de cambio de temporada");
  const backup={
    application:"CD San Bernabé Manager",
    version:"V27.2.10",
    created_at:new Date().toISOString(),
    reason:"automatic_pre_season_rollover",
    season:activeClubSeason?.name||currentSeasonLabel(),
    next_season:d.newName,
    rollover_plan:{
      teams:seasonRolloverTeamPlan(),
      players:seasonRolloverPlayerPlan(),
      staff:seasonRolloverStaffPlan(),
      keep_documents:Boolean(d.keepDocuments),
      keep_sizes:Boolean(d.keepSizes)
    },
    simulation:d.simulation||null,
    local:snapshotLocalData(),
    tables:{}
  };
  for(const table of SEASON_SAFETY_BACKUP_TABLES){
    backup.tables[table]=await fetchSeasonBackupTable(table,{optional:table==="user_profiles"});
  }
  const blob=new Blob([JSON.stringify(backup,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const stamp=new Date().toISOString().replace(/[:.]/g,"-");
  const safeSeason=String(activeClubSeason?.name||"temporada").replace("/","-");
  const filename=`CDSB_SEGURIDAD_ANTES_CIERRE_${safeSeason}_${stamp}.json`;
  const a=document.createElement("a");
  a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
  localStorage.setItem("cdsb_last_backup",new Date().toISOString());
  if(backupStatus)backupStatus.textContent=`Última copia: ${new Date().toLocaleString("es-ES")}`;
  return filename;
}

function openSeasonRolloverWizard(){
  if(!seasonSystemReady||isHistoricalSeason()||!activeClubSeason?.id)return toast("Solo puedes cambiar la temporada desde la temporada activa");
  initSeasonRolloverDraft();
  renderSeasonWizard();
  seasonRolloverWizard?.showModal();
}
function renderSeasonWizardSteps(){
  if(!seasonWizardSteps||!seasonRolloverDraft)return;
  const labels=["Nueva temporada","Equipos","Jugadores","Cuerpo técnico","Revisión final"];
  seasonWizardSteps.innerHTML=labels.map((label,i)=>`<div class="season-wizard-step ${i+1===seasonRolloverDraft.step?"active":i+1<seasonRolloverDraft.step?"done":""}"><b>${i+1<seasonRolloverDraft.step?"✓":i+1}</b><span>${label}</span></div>`).join("");
}
function renderSeasonNewTeams(){
  const d=seasonRolloverDraft;
  return `<div class="season-new-teams-head">
    <div><strong>Equipos que existirán en ${esc(d.newName)}</strong><span>Se ha copiado la estructura actual solo como propuesta. Puedes renombrar, añadir o quitar equipos antes de asignar jugadores.</span></div>
    <button type="button" class="primary" data-season-team-action="add">+ Añadir equipo</button>
  </div>
  <div class="season-wizard-info"><strong>Importante:</strong> estos son equipos <b>nuevos de ${esc(d.newName)}</b>. No se reutilizan los registros de ${esc(activeClubSeason?.name||"la temporada actual")}. Al confirmar el cambio se crearán con identificadores nuevos y los equipos anteriores quedarán vinculados únicamente a su temporada.</div>
  <div class="season-new-team-list">
    ${(d.newTeams||[]).map((team,index)=>`<article class="season-new-team-card">
      <div class="season-new-team-number">${index+1}</div>
      <label>Nombre del equipo<input data-season-new-team-name="${esc(team.draftId)}" value="${esc(team.name)}" placeholder="Ej. CDSB Infantil A"></label>
      <label>Categoría de edad<select data-season-new-team-age-category="${esc(team.draftId)}"><option value="">Seleccionar</option>${["Bebé","Prebenjamín","Benjamín","Alevín","Infantil","Cadete","Juvenil"].map(c=>`<option value="${c}" ${c===team.age_category?"selected":""}>${c}</option>`).join("")}</select></label>
      <label>Modalidad<input data-season-new-team-category="${esc(team.draftId)}" value="${esc(team.category)}" placeholder="Fútbol 7 / Fútbol 11"></label>
      <label>Horario<input data-season-new-team-schedule="${esc(team.draftId)}" value="${esc(team.training_schedule)}" placeholder="Opcional"></label>
      <label>Campo<input data-season-new-team-field="${esc(team.draftId)}" value="${esc(team.field)}" placeholder="Opcional"></label>
      <button type="button" class="mini danger-soft" data-season-team-remove="${esc(team.draftId)}">Quitar</button>
    </article>`).join("")||'<div class="team-tab-empty">Todavía no has creado ningún equipo para la nueva temporada.</div>'}
  </div>`;
}
function renderSeasonPlayerRows(){
  const d=seasonRolloverDraft;
  const filters=[...new Set(d.players.map(x=>x.currentTeam||"Sin equipo"))].sort((a,b)=>a.localeCompare(b,"es",{sensitivity:"base"}));
  const categoryFilters=[...new Set(d.players.map(x=>x.suggestedCategory||"Datos incompletos"))].sort((a,b)=>a.localeCompare(b,"es",{sensitivity:"base"}));
  const visible=d.players.filter(x=>(!seasonPlayerFilter||(x.currentTeam||"Sin equipo")===seasonPlayerFilter)&&(!seasonPlayerCategoryFilter||(x.suggestedCategory||"Datos incompletos")===seasonPlayerCategoryFilter));
  return `<div class="season-wizard-toolbar season-player-toolbar">
    <label>Equipo ${esc(activeClubSeason?.name||"actual")}<select id="seasonPlayerFilter"><option value="">Todos los equipos</option>${filters.map(x=>`<option ${x===seasonPlayerFilter?"selected":""}>${esc(x)}</option>`).join("")}</select></label>
    <label>Categoría orientativa ${esc(d.newName)}<select id="seasonPlayerCategoryFilter"><option value="">Todas</option>${categoryFilters.map(x=>`<option ${x===seasonPlayerCategoryFilter?"selected":""}>${esc(x)}</option>`).join("")}</select></label>
    <label>Asignar visibles a<select id="seasonPlayerBulkTeam"><option value="">Seleccionar equipo nuevo</option>${seasonTargetTeamOptions(seasonPlayerBulkTeam,false)}</select></label>
    <div class="season-wizard-bulk"><button type="button" class="mini" data-season-player-action="assign">Asignar equipo</button><button type="button" class="mini" data-season-player-action="keep">Continúan</button><button type="button" class="mini danger-soft" data-season-player-action="drop">Baja</button></div>
  </div>
  <div class="season-wizard-info season-age-info"><strong>Asignación segura:</strong> solo puedes elegir entre los equipos que acabas de preparar para ${esc(d.newName)}. Si falta la fecha de nacimiento o todavía no sabes su equipo, puedes dejar al jugador <b>Sin equipo</b> y continuar; lo asignarás después desde Jugadores.</div>
  <div class="season-wizard-table-wrap"><table class="season-wizard-table season-player-table"><thead><tr><th>Continúa</th><th>Jugador</th><th>Nac.</th><th>Equipo ${esc(activeClubSeason?.name||"")}</th><th>Categoría ${esc(d.newName)}</th><th>Equipo ${esc(d.newName)}</th></tr></thead><tbody>
    ${visible.map(x=>`<tr class="${x.keep&&!x.targetTeamId?"season-row-review":!x.keep?"season-row-drop":""}"><td><input type="checkbox" data-season-player-keep="${esc(x.id)}" ${x.keep?"checked":""}></td><td><strong>${esc(x.name)}</strong></td><td>${esc(x.birthYear||"-")}</td><td>${esc(x.currentTeam||"Sin equipo")}</td><td><span class="season-category-badge ${x.suggestedCategory?"":"review"}">${esc(x.suggestedCategory||"DATOS INCOMPLETOS")}</span></td><td><select data-season-player-team="${esc(x.id)}" ${x.keep?"":"disabled"}>${seasonTargetTeamOptions(x.targetTeamId)}</select>${x.keep&&!x.targetTeamId?'<small class="season-pending-text">Quedará sin equipo hasta asignarlo</small>':""}</td></tr>`).join("")||'<tr><td colspan="6">No hay jugadores en este filtro.</td></tr>'}
  </tbody></table></div>`;
}
function renderSeasonStaffRows(){
  const d=seasonRolloverDraft;
  const filters=[...new Set(d.staff.map(x=>x.currentTeam||"Sin equipo"))].sort((a,b)=>a.localeCompare(b,"es",{sensitivity:"base"}));
  const visible=d.staff.filter(x=>!seasonStaffFilter||(x.currentTeam||"Sin equipo")===seasonStaffFilter);
  return `<div class="season-wizard-toolbar">
    <label>Equipo ${esc(activeClubSeason?.name||"actual")}<select id="seasonStaffFilter"><option value="">Todos los equipos</option>${filters.map(x=>`<option ${x===seasonStaffFilter?"selected":""}>${esc(x)}</option>`).join("")}</select></label>
    <div class="season-wizard-bulk"><button type="button" class="mini" data-season-staff-action="keep">Marcar visibles: continúan</button><button type="button" class="mini danger-soft" data-season-staff-action="drop">Marcar visibles: baja</button></div>
  </div>
  <div class="season-wizard-info"><strong>Equipo de destino:</strong> el desplegable contiene únicamente equipos nuevos de ${esc(d.newName)}. También puedes dejar a un miembro temporalmente sin equipo y asignarlo después.</div>
  <div class="season-wizard-table-wrap"><table class="season-wizard-table"><thead><tr><th>Continúa</th><th>Nombre</th><th>Cargo</th><th>Equipo ${esc(activeClubSeason?.name||"")}</th><th>Equipo ${esc(d.newName)}</th></tr></thead><tbody>
    ${visible.map(x=>`<tr class="${x.keep&&!x.targetTeamId?"season-row-review":!x.keep?"season-row-drop":""}"><td><input type="checkbox" data-season-staff-keep="${esc(x.id)}" ${x.keep?"checked":""}></td><td><strong>${esc(x.name)}</strong></td><td>${esc(x.role||"-")}</td><td>${esc(x.currentTeam||"Sin equipo")}</td><td><select data-season-staff-team="${esc(x.id)}" ${x.keep?"":"disabled"}>${seasonTargetTeamOptions(x.targetTeamId)}</select>${x.keep&&!x.targetTeamId?'<small class="season-pending-text">Sin equipo al abrir</small>':""}</td></tr>`).join("")||'<tr><td colspan="5">No hay miembros en este filtro.</td></tr>'}
  </tbody></table></div>`;
}
function renderSeasonWizard(){
  if(!seasonWizardBody||!seasonRolloverDraft)return;
  const d=seasonRolloverDraft,c=seasonDraftCounts();
  renderSeasonWizardSteps();
  if(seasonWizardTitle)seasonWizardTitle.textContent=`${activeClubSeason?.name||currentSeasonLabel()} → ${d.newName||"siguiente temporada"}`;
  if(seasonWizardBack){seasonWizardBack.disabled=d.step===1||d.executing;seasonWizardBack.classList.toggle("hidden",d.step===1)}
  if(seasonWizardNext){seasonWizardNext.disabled=d.executing||d.simulating;seasonWizardNext.textContent=d.step===5?`Cerrar ${activeClubSeason?.name||"temporada"} y abrir ${d.newName}`:"Continuar"}
  if(seasonWizardHint)seasonWizardHint.textContent=d.executing?"Guardando histórico y creando la nueva temporada…":`Paso ${d.step} de 5`;
  if(d.step===1){
    seasonWizardBody.innerHTML=`<div class="season-wizard-intro"><h3>1. Configura la temporada que se va a abrir</h3><p>La actual quedará archivada exactamente como está antes de aplicar altas, bajas y cambios de equipo.</p></div>
      <div class="season-wizard-config">
        <label>Nueva temporada<input id="wizardNewSeasonName" value="${esc(d.newName)}" placeholder="2027/28"></label>
        <label class="season-wizard-check"><input id="wizardKeepDocuments" type="checkbox" ${d.keepDocuments?"checked":""}><span><strong>Conservar documentación personal</strong><small>Fotografías, DNI/libro de familia y documentación médica siguen vinculados a la persona.</small></span></label>
        <label class="season-wizard-check"><input id="wizardKeepSizes" type="checkbox" ${d.keepSizes?"checked":""}><span><strong>Conservar tallajes como referencia</strong><small>Las tallas se mantienen, pero las entregas de equipación empiezan a cero.</small></span></label>
      </div>
      <div class="season-wizard-info"><strong>Siempre empiezan de nuevo:</strong> cobros, entregas, calendario, uso de pistas, tesorería, asistencia, partidos, estadísticas y fichas RFAF. Las fichas RFAF de ${esc(activeClubSeason?.name||"")} quedan guardadas solo en su histórico.</div>`;
  }else if(d.step===2){
    seasonWizardBody.innerHTML=`<div class="season-wizard-intro"><h3>2. Crea la estructura de equipos de ${esc(d.newName)}</h3><p>Primero defines qué equipos existirán la próxima temporada. Después jugadores y técnicos solo podrán asignarse a estos equipos nuevos.</p></div>
      <div class="season-wizard-stats"><span class="ok"><b>${c.teamsTotal}</b> equipos nuevos</span></div>${renderSeasonNewTeams()}`;
  }else if(d.step===3){
    seasonWizardBody.innerHTML=`<div class="season-wizard-intro"><h3>3. Decide qué jugadores continúan</h3><p>Marca las bajas y asigna, cuando ya lo sepas, el equipo de ${esc(d.newName)}. El histórico conservará siempre el equipo de ${esc(activeClubSeason?.name||"la temporada anterior")}.</p></div>
      <div class="season-wizard-stats"><span><b>${c.playersTotal}</b> actuales</span><span class="ok"><b>${c.playersKeep}</b> continúan</span><span class="bad"><b>${c.playersDrop}</b> bajas</span><span class="pending"><b>${c.playersPending}</b> seguirán sin equipo</span></div>${renderSeasonPlayerRows()}`;
  }else if(d.step===4){
    seasonWizardBody.innerHTML=`<div class="season-wizard-intro"><h3>4. Revisa el cuerpo técnico</h3><p>Puedes mantener, dar de baja o asignar a los nuevos equipos de ${esc(d.newName)} a entrenadores, delegados y demás miembros.</p></div>
      <div class="season-wizard-stats"><span><b>${c.staffTotal}</b> actuales</span><span class="ok"><b>${c.staffKeep}</b> continúan</span><span class="bad"><b>${c.staffDrop}</b> bajas</span><span class="pending"><b>${c.staffPending}</b> sin equipo</span></div>${renderSeasonStaffRows()}<div class="season-wizard-info"><strong>Usuarios del cuerpo técnico:</strong> al cerrar la temporada se desactivarán temporalmente los accesos vinculados a los equipos anteriores. Después podrás reasignarlos a los equipos nuevos desde Usuarios y activarlos de nuevo.</div>`;
  }else{
    const confirmation=`CERRAR ${activeClubSeason?.name||currentSeasonLabel()}`;
    const playerMoves=d.players.filter(x=>x.keep&&x.targetTeamId&&seasonNewTeamName(x.targetTeamId)!==String(x.currentTeam||"").trim()).length;
    const staffMoves=d.staff.filter(x=>x.keep&&x.targetTeamId&&seasonNewTeamName(x.targetTeamId)!==String(x.currentTeam||"").trim()).length;
    seasonWizardBody.innerHTML=`<div class="season-wizard-intro"><h3>5. Revisión final</h3><p>Esta es la última pantalla antes de realizar el cambio anual.</p></div>
      <div class="season-review-grid">
        <article><small>TEMPORADA QUE SE CIERRA</small><strong>${esc(activeClubSeason?.name||"")}</strong><span>Quedará histórica y de solo lectura.</span></article>
        <article><small>NUEVA TEMPORADA</small><strong>${esc(d.newName)}</strong><span>Será la única temporada editable.</span></article>
        <article><small>EQUIPOS NUEVOS</small><strong>${c.teamsTotal}</strong><span>${(d.newTeams||[]).map(t=>esc(t.name)).join(" · ")}</span></article>
        <article><small>JUGADORES</small><strong>${c.playersKeep} continúan · ${c.playersDrop} bajas</strong><span>${playerMoves} cambio(s) · ${c.playersPending} sin equipo al abrir.</span></article>
        <article><small>CUERPO TÉCNICO</small><strong>${c.staffKeep} continúan · ${c.staffDrop} bajas</strong><span>${staffMoves} cambio(s) · ${c.staffPending} sin equipo.</span></article>
        <article><small>DOCUMENTACIÓN</small><strong>${d.keepDocuments?"Se conserva":"Se reinicia"}</strong><span>El histórico siempre mantiene una copia.</span></article>
        <article><small>TALLAJES</small><strong>${d.keepSizes?"Se conservan como referencia":"Se reinician"}</strong><span>Las entregas empiezan siempre de cero.</span></article>
      </div>
      <div class="season-final-warning"><strong>Los equipos de ${esc(d.newName)} serán registros nuevos.</strong> Los equipos de ${esc(activeClubSeason?.name||"")} seguirán vinculados a su temporada e histórico. Las fichas RFAF tampoco se trasladan como vigentes: deberás importar las nuevas licencias.</div>
      <div class="season-simulation-panel">
        <div><strong>Comprobación previa obligatoria</strong><span>La simulación valida el cambio completo en Supabase sin cerrar ni crear nada.</span></div>
        <button type="button" class="secondary" data-season-simulate ${d.simulating||d.executing?"disabled":""}>${d.simulating?"Simulando…":"Simular cambio de temporada"}</button>
      </div>
      ${seasonSimulationMarkup()}
      <div class="season-auto-backup-note"><strong>🛡 Copia automática antes del cierre:</strong> al pulsar el cierre definitivo, el programa descargará primero una copia de seguridad de los datos. Si la copia no puede prepararse, el cierre se cancelará.</div>
      <label class="season-confirm-label">Para confirmar escribe exactamente <b>${esc(confirmation)}</b><input id="seasonWizardConfirmation" autocomplete="off" value="${esc(d.confirmation||"")}" placeholder="${esc(confirmation)}"></label>`;
    if(seasonWizardNext)seasonWizardNext.disabled=d.confirmation.trim()!==confirmation||d.executing||d.simulating||!seasonSimulationIsCurrent();
  }
}
function validateSeasonWizardStep(){
  const d=seasonRolloverDraft;if(!d)return false;
  if(d.step===1){
    const expected=nextSeasonLabel(activeClubSeason?.name||currentSeasonLabel());
    if(!/^\d{4}\/\d{2}$/.test(d.newName))return toast("La temporada debe tener formato 2027/28"),false;
    if(d.newName!==expected)return toast(`La siguiente temporada debe ser ${expected}`),false;
  }
  if(d.step===2){
    if(!d.newTeams.length)return toast("Crea al menos un equipo para la nueva temporada"),false;
    const names=d.newTeams.map(t=>String(t.name||"").trim());
    if(names.some(name=>!name))return toast("Todos los equipos nuevos deben tener nombre"),false;
    if(d.newTeams.some(t=>!normalizeSeasonCategory(t.age_category)))return toast("Selecciona la categoría de edad de todos los equipos nuevos"),false;
    const normalized=names.map(name=>name.toLocaleLowerCase("es"));
    if(new Set(normalized).size!==normalized.length)return toast("Hay nombres de equipos repetidos en la nueva temporada"),false;
  }
  if(d.step===3){
    const valid=new Set(d.newTeams.map(t=>String(t.draftId)));
    const invalid=d.players.filter(x=>x.keep&&x.targetTeamId&&!valid.has(String(x.targetTeamId)));
    if(invalid.length)return toast("Hay jugadores asignados a un equipo que ya no existe en el plan"),false;
  }
  if(d.step===4){
    const valid=new Set(d.newTeams.map(t=>String(t.draftId)));
    const invalid=d.staff.filter(x=>x.keep&&x.targetTeamId&&!valid.has(String(x.targetTeamId)));
    if(invalid.length)return toast("Hay miembros del cuerpo técnico asignados a un equipo que ya no existe en el plan"),false;
  }
  return true;
}
async function executeSeasonRolloverWizard(){
  const d=seasonRolloverDraft;if(!d||d.executing)return;
  const confirmation=`CERRAR ${activeClubSeason?.name||currentSeasonLabel()}`;
  if(d.confirmation.trim()!==confirmation)return toast("Escribe la confirmación exacta para continuar");
  if(!seasonSimulationIsCurrent())return toast("Primero ejecuta y supera la simulación con el plan actual");
  d.executing=true;renderSeasonWizard();
  try{
    toast("Preparando copia automática de seguridad…");
    await createSeasonRolloverSafetyBackup();
    loadCustomClothingItems();loadClothingCatalogConfig();loadCustomClothingSizes();loadStaffKitStatus();
    if(typeof loadClubMatches==="function")loadClubMatches();
    const snapshot=await buildSeasonSnapshot();
    const {data,error}=await sb.rpc("cdsb_rollover_season_v2726",{
      p_current_season_id:activeClubSeason.id,
      p_new_name:d.newName,
      p_snapshot:snapshot,
      p_team_plan:seasonRolloverTeamPlan(),
      p_player_plan:seasonRolloverPlayerPlan(),
      p_staff_plan:seasonRolloverStaffPlan(),
      p_keep_documents:Boolean(d.keepDocuments),
      p_keep_sizes:Boolean(d.keepSizes),
      p_confirmation:confirmation
    });
    if(error)throw error;
    const result=Array.isArray(data)?data[0]:data;
    if(result?.ok===false)throw new Error(result.message||"No se pudo crear la temporada");
    localStorage.removeItem(SEASON_SELECTED_KEY);
    await loadClubSeasons();setSeasonState(activeClubSeason);renderSeasonSelector();
    clubMatches=[];saveClubMatches();staffKitStatus={};saveStaffKitStatus();
    if(!d.keepSizes){customPlayerClothingSizes={};customStaffClothingSizes={};saveCustomClothingSizes()}
    await loadActiveSeasonData();renderSeasonsManager();
    seasonRolloverWizard?.close();seasonRolloverDraft=null;
    toast(`Temporada ${activeClubSeason.name} abierta correctamente · copia de seguridad descargada`);
  }catch(error){d.executing=false;renderSeasonWizard();showOperationError("No se pudo cerrar la temporada y crear la nueva.",error)}
}
function seasonWizardVisiblePlayers(){
  if(!seasonRolloverDraft)return[];
  return seasonRolloverDraft.players.filter(x=>(!seasonPlayerFilter||(x.currentTeam||"Sin equipo")===seasonPlayerFilter)&&(!seasonPlayerCategoryFilter||(x.suggestedCategory||"Datos incompletos")===seasonPlayerCategoryFilter));
}
function seasonWizardVisibleStaff(){
  if(!seasonRolloverDraft)return[];
  return seasonRolloverDraft.staff.filter(x=>!seasonStaffFilter||(x.currentTeam||"Sin equipo")===seasonStaffFilter);
}
seasonWizardBody?.addEventListener("change",event=>{
  const d=seasonRolloverDraft;if(!d)return;
  const t=event.target;
  if(t.id==="wizardNewSeasonName"){d.newName=t.value.trim();if(seasonWizardTitle)seasonWizardTitle.textContent=`${activeClubSeason?.name||currentSeasonLabel()} → ${d.newName||"siguiente temporada"}`;return}
  if(t.id==="wizardKeepDocuments"){d.keepDocuments=t.checked;return}
  if(t.id==="wizardKeepSizes"){d.keepSizes=t.checked;return}
  if(t.id==="seasonPlayerFilter"){seasonPlayerFilter=t.value;renderSeasonWizard();return}
  if(t.id==="seasonPlayerCategoryFilter"){seasonPlayerCategoryFilter=t.value;renderSeasonWizard();return}
  if(t.id==="seasonPlayerBulkTeam"){seasonPlayerBulkTeam=t.value;return}
  if(t.id==="seasonStaffFilter"){seasonStaffFilter=t.value;renderSeasonWizard();return}
  if(t.dataset.seasonNewTeamAgeCategory){const team=d.newTeams.find(x=>String(x.draftId)===String(t.dataset.seasonNewTeamAgeCategory));if(team)team.age_category=t.value;return}
  if(t.dataset.seasonPlayerKeep){const x=d.players.find(v=>String(v.id)===String(t.dataset.seasonPlayerKeep));if(x){x.keep=t.checked;if(x.keep&&!x.targetTeamId&&!x.teamTouched)x.targetTeamId=x.autoTargetTeamId||""}renderSeasonWizard();return}
  if(t.dataset.seasonPlayerTeam){const x=d.players.find(v=>String(v.id)===String(t.dataset.seasonPlayerTeam));if(x){x.targetTeamId=t.value;x.teamTouched=true}renderSeasonWizard();return}
  if(t.dataset.seasonStaffKeep){const x=d.staff.find(v=>String(v.id)===String(t.dataset.seasonStaffKeep));if(x)x.keep=t.checked;renderSeasonWizard();return}
  if(t.dataset.seasonStaffTeam){const x=d.staff.find(v=>String(v.id)===String(t.dataset.seasonStaffTeam));if(x){x.targetTeamId=t.value;x.teamTouched=true}renderSeasonWizard();return}
});
seasonWizardBody?.addEventListener("input",event=>{
  const d=seasonRolloverDraft;if(!d)return;
  const t=event.target;
  if(t.id==="wizardNewSeasonName"){d.newName=t.value.trim();if(seasonWizardTitle)seasonWizardTitle.textContent=`${activeClubSeason?.name||currentSeasonLabel()} → ${d.newName||"siguiente temporada"}`;return}
  if(t.id==="seasonWizardConfirmation"){
    d.confirmation=t.value;
    const exact=`CERRAR ${activeClubSeason?.name||currentSeasonLabel()}`;
    if(seasonWizardNext)seasonWizardNext.disabled=d.confirmation.trim()!==exact||d.executing||d.simulating||!seasonSimulationIsCurrent();
    return;
  }
  const teamId=t.dataset.seasonNewTeamName||t.dataset.seasonNewTeamAgeCategory||t.dataset.seasonNewTeamCategory||t.dataset.seasonNewTeamSchedule||t.dataset.seasonNewTeamField;
  if(teamId){
    const team=d.newTeams.find(x=>String(x.draftId)===String(teamId));if(!team)return;
    if(t.dataset.seasonNewTeamName)team.name=t.value;
    if(t.dataset.seasonNewTeamAgeCategory)team.age_category=t.value;
    if(t.dataset.seasonNewTeamCategory)team.category=t.value;
    if(t.dataset.seasonNewTeamSchedule)team.training_schedule=t.value;
    if(t.dataset.seasonNewTeamField)team.field=t.value;
  }
});
seasonWizardBody?.addEventListener("click",event=>{
  const d=seasonRolloverDraft;if(!d)return;
  if(event.target.closest?.("[data-season-simulate]")){simulateSeasonRolloverWizard();return}
  const teamAction=event.target.closest?.("[data-season-team-action]")?.dataset.seasonTeamAction;
  if(teamAction==="add"){
    d.newTeams.push({draftId:seasonDraftTeamId(),name:"",age_category:"",category:"",delegate_name:"",training_schedule:"",field:"",notes:""});
    renderSeasonWizard();return;
  }
  const removeId=event.target.closest?.("[data-season-team-remove]")?.dataset.seasonTeamRemove;
  if(removeId){
    const team=d.newTeams.find(x=>String(x.draftId)===String(removeId));
    if(team&&!confirm(`¿Quitar ${team.name||"este equipo"} del plan de ${d.newName}?`))return;
    d.newTeams=d.newTeams.filter(x=>String(x.draftId)!==String(removeId));
    d.players.forEach(x=>{if(String(x.targetTeamId)===String(removeId)){x.targetTeamId="";x.teamTouched=true}});
    d.staff.forEach(x=>{if(String(x.targetTeamId)===String(removeId)){x.targetTeamId="";x.teamTouched=true}});
    if(String(seasonPlayerBulkTeam)===String(removeId))seasonPlayerBulkTeam="";
    renderSeasonWizard();return;
  }
  const playerAction=event.target.closest?.("[data-season-player-action]")?.dataset.seasonPlayerAction;
  if(playerAction){
    const visible=seasonWizardVisiblePlayers();
    if(playerAction==="assign"){
      if(!seasonPlayerBulkTeam)return toast("Selecciona primero un equipo nuevo para los jugadores visibles");
      visible.filter(x=>x.keep).forEach(x=>{x.targetTeamId=seasonPlayerBulkTeam;x.teamTouched=true});
    }else if(playerAction==="keep"){
      visible.forEach(x=>{x.keep=true;if(!x.targetTeamId&&!x.teamTouched)x.targetTeamId=x.autoTargetTeamId||""});
    }else if(playerAction==="drop")visible.forEach(x=>x.keep=false);
    renderSeasonWizard();return;
  }
  const staffAction=event.target.closest?.("[data-season-staff-action]")?.dataset.seasonStaffAction;
  if(staffAction){seasonWizardVisibleStaff().forEach(x=>x.keep=staffAction==="keep");renderSeasonWizard()}
});
openSeasonWizardButton?.addEventListener("click",openSeasonRolloverWizard);
closeSeasonWizard?.addEventListener("click",()=>{if(!seasonRolloverDraft?.executing)seasonRolloverWizard?.close()});
seasonWizardBack?.addEventListener("click",()=>{if(!seasonRolloverDraft||seasonRolloverDraft.executing||seasonRolloverDraft.step<=1)return;seasonRolloverDraft.step--;renderSeasonWizard()});
seasonWizardNext?.addEventListener("click",async()=>{
  const d=seasonRolloverDraft;if(!d||d.executing)return;
  if(d.step<5){
    if(!validateSeasonWizardStep())return;
    if(d.step===2)recalculateSeasonPlayerSuggestions();
    d.step++;renderSeasonWizard();return;
  }
  await executeSeasonRolloverWizard();
});
seasonRolloverWizard?.addEventListener("cancel",event=>{if(seasonRolloverDraft?.executing)event.preventDefault()});
seasonSelector?.addEventListener("change",()=>switchClubSeason(seasonSelector.value));
function initClient(){const c=cfg();if(!c.url||!c.key)return false;sb=window.supabase.createClient(c.url,c.key);return true}
if(sharedCfg().url&&sharedCfg().key)changeConnection?.classList.add("hidden");
function show(id){["setupScreen","authScreen","technicalTeamScreen","app"].forEach(x=>document.getElementById(x)?.classList.add("hidden"));document.getElementById(id)?.classList.remove("hidden")}
if(!initClient())show("setupScreen");else setTimeout(()=>{checkSession().catch(error=>{console.error("Inicio",error);authMessage.textContent=error?.message||"No se pudo iniciar la aplicación";show("authScreen")})},0);
setupForm.onsubmit=e=>{e.preventDefault();localStorage.setItem("sb_url",setupUrl.value.trim());localStorage.setItem("sb_key",setupKey.value.trim());location.reload()};
changeConnection.onclick=()=>{
  const current=cfg();
  setupUrl.value=current.url||"";
  setupKey.value=current.key||"";
  show("setupScreen");
};
const TECH_SESSION_KEY="cdsb_technical_session";
const TECH_PBKDF2_ITERATIONS=210000;
function getTechnicalSessionToken(){return localStorage.getItem(TECH_SESSION_KEY)||""}
function clearTechnicalSession(){localStorage.removeItem(TECH_SESSION_KEY)}
function bytesToHex(bytes){return Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("")}
function hexToBytes(hex){const clean=String(hex||"").trim();if(!/^[0-9a-f]+$/i.test(clean)||clean.length%2)throw new Error("Salt de contraseña no válido");return new Uint8Array(clean.match(/.{2}/g).map(x=>parseInt(x,16)))}
function randomHex(size=16){const bytes=new Uint8Array(size);crypto.getRandomValues(bytes);return bytesToHex(bytes)}
async function deriveTechnicalPassword(password,saltHex,iterations=TECH_PBKDF2_ITERATIONS){
  if(!window.crypto?.subtle)throw new Error("Este navegador no permite el acceso seguro. Actualízalo o usa Chrome/Firefox moderno.");
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(String(password||"")),"PBKDF2",false,["deriveBits"]);
  const bits=await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt:hexToBytes(saltHex),iterations:Number(iterations)||TECH_PBKDF2_ITERATIONS},key,256);
  return bytesToHex(new Uint8Array(bits));
}
async function restoreTechnicalSession(){
  const token=getTechnicalSessionToken();
  if(!token)return false;
  const {data,error}=await sb.rpc("technical_session",{p_token:token});
  const profile=Array.isArray(data)?data[0]:data;
  if(error||!profile){clearTechnicalSession();return false}
  window.__technicalAccess=profile;
  return true;
}
async function authenticatedUserIsAdmin(){
  const {data,error}=await sb.rpc("cdsb_is_admin");
  if(error)throw new Error("No se pudo comprobar el permiso de administrador: "+(error.message||"error desconocido"));
  return data===true;
}
async function checkSession(){
  // V27.2.30: una sesión técnica se resuelve ANTES que cualquier sesión de administrador.
  // El selector se muestra en una pantalla independiente, nunca sobre una app aún sin cargar.
  if(getTechnicalSessionToken()){
    try{
      await enterTechnicalAccessV27230();
      return;
    }catch(error){
      console.error("Acceso técnico",error);
      clearTechnicalSession();
      window.__technicalAccess=null;
      window.__technicalTeamsPending=[];
      authMessage.textContent=error.message||"La sesión del cuerpo técnico ha caducado. Vuelve a iniciar sesión.";
      show("authScreen");
      return;
    }
  }

  const {data,error}=await sb.auth.getSession();
  if(error){authMessage.textContent=error.message||"No se pudo comprobar la sesión";show("authScreen");return}
  if(data.session){
    try{
      if(!await authenticatedUserIsAdmin())throw new Error("Este usuario no está autorizado como administrador");
      show("app");await start();return;
    }catch(error){await sb.auth.signOut();authMessage.textContent=error.message||"Acceso no autorizado";show("authScreen");return}
  }
  show("authScreen");
}
loginForm.onsubmit=async e=>{
  e.preventDefault();authMessage.textContent="";
  const submit=loginForm.querySelector('button[type="submit"]');
  const original=submit?.textContent||"Entrar";
  if(submit){submit.disabled=true;submit.textContent="Comprobando..."}
  const identifier=email.value.trim();const secret=password.value;
  try{
    if(identifier.includes("@")){
      const {error}=await sb.auth.signInWithPassword({email:identifier,password:secret});
      if(error)throw error;
      if(!await authenticatedUserIsAdmin()){
        await sb.auth.signOut();
        throw new Error("Este usuario no está autorizado como administrador");
      }
      clearTechnicalSession();
    }else{
      const {data:saltData,error:saltError}=await sb.rpc("technical_login_salt",{p_username:identifier});
      if(saltError)throw saltError;
      const saltInfo=Array.isArray(saltData)?saltData[0]:saltData;
      if(!saltInfo?.password_salt)throw new Error("Usuario o contraseña incorrectos");
      const verifier=await deriveTechnicalPassword(secret,saltInfo.password_salt,saltInfo.password_iterations);
      const {data,error}=await sb.rpc("technical_login",{p_username:identifier,p_password_hash:verifier});
      const result=Array.isArray(data)?data[0]:data;
      if(error)throw error;
      if(!result?.token)throw new Error(result?.message||"Usuario o contraseña incorrectos");
      localStorage.setItem(TECH_SESSION_KEY,result.token);window.__technicalAccess=result;
      await enterTechnicalAccessV27230();
      return;
    }
    show("app");await start();
  }catch(error){authMessage.textContent=error.message||"No se pudo iniciar sesión.";show("authScreen")}
  finally{if(submit){submit.disabled=false;submit.textContent=original}}
};
logout.onclick=async()=>{
  const technicalToken=getTechnicalSessionToken();
  if(technicalToken){try{await sb.rpc("technical_logout",{p_token:technicalToken})}catch(_){} }
  clearTechnicalSession();
  localStorage.removeItem(TECH_TEAM_CHOICE_KEY);
  await sb.auth.signOut();
  location.reload();
};
document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>document.getElementById(b.dataset.close).close());
document.querySelectorAll(".nav").forEach(b=>b.onclick=()=>{document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));document.querySelectorAll(".nav").forEach(n=>n.classList.remove("active"));b.classList.add("active");document.getElementById(b.dataset.view).classList.add("active");const names={dashboard:["Panel principal","Resumen actualizado del club"],players:["Jugadores","Gestión de jugadores y familias"],payments:["Cobros","Control de los tres pagos"],documents:["Documentos","Seguimiento de expedientes"],kits:["Equipaciones","Tallajes y entregas"],teams:["Equipos","Plantillas, categorías y responsables"],staff:["Cuerpo técnico","Entrenadores, delegados y coordinación"],staffSizing:["Tallaje cuerpo técnico","Listado independiente para descargar e imprimir"],calendar:["Calendario","Entrenamientos, partidos y eventos"],sportsAttendance:["Asistencia","Control de asistencia a entrenamientos"],sportsMatches:["Partidos","Convocatorias, minutos y tarjetas"],sportsStats:["Estadísticas","Resumen deportivo de jugadores y equipos"],pitches:["Pistas","Control mensual de entrenamientos y partidos"],finance:["Ingresos y gastos","Tesorería general del club"],reports:["Informes","Listados para imprimir y exportar"],trash:["Papelera","Recuperación de jugadores y equipos"],activity:["Registro de actividad","Historial de cambios del programa"],backup:["Copias de seguridad","Protección y exportación de datos"],users:["Usuarios","Accesos del cuerpo técnico a uno o varios equipos"],seasons:["Temporadas","Histórico y cambio anual del club"],publicForm:["Inscripción pública","Enlace para las familias"]};pageTitle.textContent=names[b.dataset.view][0];pageSub.textContent=names[b.dataset.view][1]});
function pay(id,c){return payments.find(x=>x.player_id===id&&x.concept===c)||{status:"Pendiente",amount:0}}
function totalPaid(id){return ["registration","sizing","clothing"].reduce((s,c)=>s+Number(pay(id,c).amount||0),0)}
function pending(id){return Math.max(0,200-totalPaid(id))}
function docs(id){return documents.find(x=>x.player_id===id)||{}}
function kit(id){return kits.find(x=>x.player_id===id)||{}}
function docState(id){const d=docs(id);return ["player_dni_status","photo_status","medical_status"].every(k=>["Recibido","No requerido"].includes(d[k]))?"Completa":"Incompleta"}

async function currentUserEmail(){
  try{
    const {data}=await sb.auth.getUser();
    return data?.user?.email||"Usuario";
  }catch{return "Usuario"}
}
async function logActivity(action,entityType,entityId,description){
  try{
    const user_email=await currentUserEmail();
    const {error}=await sb.from("activity_logs").insert({
      action,entity_type:entityType,entity_id:entityId||null,description,user_email
    });
    if(error)console.warn("No se pudo registrar actividad",error);
  }catch(error){console.warn("Actividad",error)}
}
function activityDate(value){
  if(!value)return "-";
  return new Date(value).toLocaleString("es-ES",{dateStyle:"short",timeStyle:"short"});
}
async function loadTrashAndActivity(){
  const [p,t,a]=await Promise.all([
    sb.from("players").select("*").not("deleted_at","is",null).order("deleted_at",{ascending:false}),
    sb.from("teams").select("*").eq("season_id",activeClubSeason.id).not("deleted_at","is",null).order("deleted_at",{ascending:false}),
    sb.from("activity_logs").select("*").order("created_at",{ascending:false}).limit(150)
  ]);
  if(!p.error)deletedPlayers=p.data||[]; else console.warn("Papelera jugadores",p.error);
  if(!t.error)deletedTeams=t.data||[]; else console.warn("Papelera equipos",t.error);
  if(!a.error)activityLogs=a.data||[]; else console.warn("Actividad",a.error);
}

function initListSortControl(){
  const select=document.getElementById("globalListSort");
  if(!select)return;
  select.value=listSortDirection;
  select.addEventListener("change",()=>{
    listSortDirection=select.value==="za"?"za":"az";
    localStorage.setItem(LIST_SORT_KEY,listSortDirection);
    render();
    if(window.currentTeamDetailId&&document.getElementById("teamDetailDialog")?.open){
      window.renderTeamDetailTab?.(window.currentTeamDetailTab||"overview");
    }
    window.sportsV2703?.render?.();
    toast(listSortDirection==="az"?"Listas ordenadas por nombre de A a Z":"Listas ordenadas por nombre de Z a A");
  });
}
initListSortControl();

async function loadTechnicalTeamData(){
  const token=getTechnicalSessionToken();
  if(!token)throw new Error("La sesión técnica no es válida");
  const {data,error}=await sb.rpc("technical_team_snapshot",{p_token:token});
  if(error)throw error;
  const snapshot=data||{};
  if(!snapshot.ok)throw new Error(snapshot.message||"No se pudo cargar el equipo asignado");

  if(snapshot.profile){
    window.__technicalAccess=snapshot.profile;
    currentAccess={...snapshot.profile,role:"technical",active:true};
  }
  players=Array.isArray(snapshot.players)?snapshot.players:[];
  payments=Array.isArray(snapshot.payments)?snapshot.payments:[];
  documents=Array.isArray(snapshot.documents)?snapshot.documents:[];
  kits=Array.isArray(snapshot.kits)?snapshot.kits:[];
  teams=Array.isArray(snapshot.teams)?snapshot.teams:[];
  staff=Array.isArray(snapshot.staff)?snapshot.staff:[];
  events=Array.isArray(snapshot.events)?snapshot.events:[];
  playerSizes=Array.isArray(snapshot.player_sizes)?snapshot.player_sizes:[];
  staffSizes=Array.isArray(snapshot.staff_sizes)?snapshot.staff_sizes:[];
  pitchUsage=Array.isArray(snapshot.pitch_usage)?snapshot.pitch_usage:[];
  financeMovements=[];
  deletedPlayers=[];
  deletedTeams=[];
  activityLogs=[];
  signedCache={};
  clothingImages={};
}
async function loadAll(){
  syncState.textContent="● Sincronizando...";

  if(isTechnicalReadOnly()){
    try{
      await loadTechnicalTeamData();
      loadClubMatches();
      await hydrateClubMatchesFromCloudV27244({migrateLocal:false});
      syncState.textContent="● Solo lectura";
      render();
      applyTechnicalReadOnlyUi();
      return;
    }catch(error){
      console.error("Acceso técnico",error);
      clearTechnicalSession();
      window.__technicalAccess=null;
      authMessage.textContent=error.message||"La sesión técnica ha caducado";
      show("authScreen");
      return;
    }
  }

  const queries=await Promise.allSettled([
    sb.from("players").select("*").is("deleted_at",null).order("created_at",{ascending:false}),
    sb.from("payments").select("*"),
    sb.from("documents").select("*"),
    sb.from("kits").select("*"),
    sb.from("teams").select("*").eq("season_id",activeClubSeason.id).is("deleted_at",null).order("name"),
    sb.from("staff").select("*").order("name"),
    sb.from("events").select("*").order("event_date"),
    sb.from("player_sizes").select("*"),
    sb.from("staff_sizes").select("*"),
    sb.from("pitch_usage").select("*").order("usage_date",{ascending:false}),
    sb.from("finance_movements").select("*").order("movement_date",{ascending:false})
  ]);
  const loadErrors=[];
  const get=(i,name)=>{
    const q=queries[i];
    if(q.status==="rejected"){
      console.error(name,q.reason);loadErrors.push(`${name}: ${supabaseErrorText(q.reason)}`);return [];
    }
    if(q.value.error){
      console.error(name,q.value.error);loadErrors.push(`${name}: ${supabaseErrorText(q.value.error)}`);return [];
    }
    return q.value.data||[];
  };
  players=get(0,"players"); payments=get(1,"payments"); documents=get(2,"documents"); kits=get(3,"kits");
  teams=get(4,"teams"); staff=get(5,"staff"); events=get(6,"events"); playerSizes=get(7,"player_sizes");
  staffSizes=get(8,"staff_sizes"); pitchUsage=get(9,"pitch_usage"); financeMovements=get(10,"finance_movements");
  for(const player of players){if(player.photo_path&&!signedCache[player.photo_path])signedCache[player.photo_path]=await signedUrl(player.photo_path)}
  await Promise.all([loadTrashAndActivity(),loadClothingImages()]);
  const signature=loadErrors.join("\n");
  syncState.textContent=loadErrors.length?"● Conectado con avisos":"● Conectado";
  syncState.title=signature;
  if(loadErrors.length&&signature!==lastLoadErrorSignature){
    toast(`No se pudieron cargar ${loadErrors.length} apartado(s). Pulsa el indicador de conexión para ver el detalle.`);
  }
  lastLoadErrorSignature=signature;
  loadClubMatches();
  await hydrateClubMatchesFromCloudV27244({migrateLocal:true});
  render();
}
syncState?.addEventListener("click",()=>{
  if(syncState.title)alert("Avisos de sincronización:\n\n"+syncState.title);
});

function render(){
  renderDashboard();
  renderPlayers();renderPayments();renderDocuments();renderKits();renderClothingCatalog();renderTeams();renderStaff();
  renderCalendar();renderBirthdays();renderUpcomingEvents();renderPitches();renderFinance();
  renderDashboardExtras();renderReportStats();renderTeamReportOptions();renderTrash();renderActivity();renderSeasonsManager();
  window.sportsV2700?.render?.();
  setTimeout(applySeasonReadOnlyUi,0);
  publicUrl.textContent=location.href.replace(/index\.html.*$/,"")+"inscripcion.html";
  if(isTechnicalReadOnly())setTimeout(applyTechnicalReadOnlyUi,0);
}

function paymentTeamNames(){
  return sortByAlpha([...new Set([
    ...teams.map(t=>String(t.name||"").trim()),
    ...players.map(p=>String(p.team||"").trim())
  ].filter(Boolean))],name=>name);
}
function renderPaymentsTeamFilter(){
  if(!paymentsTeamFilter)return;
  const selected=paymentsTeamFilter.value;
  const names=paymentTeamNames();
  paymentsTeamFilter.innerHTML='<option value="">Todos los equipos</option>'+names.map(name=>`<option value="${esc(name)}">${esc(name)}</option>`).join("");
  paymentsTeamFilter.value=names.includes(selected)?selected:"";
}
function renderPayments(){
  renderPaymentsTeamFilter();
  const selectedTeam=paymentsTeamFilter?.value||"";
  const list=sortPlayersAlpha(selectedTeam?players.filter(p=>String(p.team||"").trim()===selectedTeam):players);
  paymentsBody.innerHTML=list.length?list.map(p=>`<tr>
    <td><strong>${esc(p.name||"")} ${esc(p.surname||"")}</strong></td>
    <td><span class="payment-team-badge">${esc(p.team||"Sin equipo")}</span></td>
    <td>${badge(pay(p.id,"registration").status)}<br><small>${euro(pay(p.id,"registration").amount)}</small></td>
    <td>${badge(pay(p.id,"sizing").status)}<br><small>${euro(pay(p.id,"sizing").amount)}</small></td>
    <td>${badge(pay(p.id,"clothing").status)}<br><small>${euro(pay(p.id,"clothing").amount)}</small></td>
    <td><strong>${euro(totalPaid(p.id))}</strong></td>
    <td><strong>${euro(pending(p.id))}</strong></td>
    <td><button class="mini" onclick="openPayment('${p.id}')">Registrar</button></td>
  </tr>`).join(""):`<tr><td colspan="8">${players.length?"No hay jugadores en el equipo seleccionado.":"No hay jugadores."}</td></tr>`;
}

function renderDocumentsTeamFilter(){
  if(!documentsTeamFilter)return;
  const selected=documentsTeamFilter.value;
  const names=paymentTeamNames();
  documentsTeamFilter.innerHTML='<option value="">Todos los equipos</option>'+names.map(name=>`<option value="${esc(name)}">${esc(name)}</option>`).join("");
  documentsTeamFilter.value=names.includes(selected)?selected:"";
}
function playerDocumentAsset(playerId,kind){
  const player=players.find(x=>String(x.id)===String(playerId))||{};
  const d=docs(playerId);
  const assets={
    dni:{path:d.player_dni_path||null,label:"DNI o libro de familia",fileBase:"dni_jugador"},
    photo:{path:player.photo_path||d.photo_path||null,label:"fotografía",fileBase:"fotografia"},
    medical:{path:d.medical_path||null,label:"reconocimiento médico",fileBase:"reconocimiento_medico"}
  };
  return assets[kind]||{path:null,label:"documento",fileBase:"documento"};
}
function documentFileControls(playerId,kind){
  const asset=playerDocumentAsset(playerId,kind);
  if(!asset.path)return '<small class="document-file-empty">Sin archivo adjunto</small>';
  if(isTechnicalReadOnly())return '<small class="document-file-private">Solo administración</small>';
  return `<div class="document-file-actions"><button class="mini document-view-btn" type="button" onclick="openPlayerDocument('${playerId}','${kind}',false)">👁 Ver</button><button class="mini document-download-btn" type="button" onclick="openPlayerDocument('${playerId}','${kind}',true)">⬇ Descargar</button></div>`;
}
window.openPlayerDocument=async(playerId,kind,download=false)=>{
  if(isTechnicalReadOnly())return toast("Los archivos personales solo están disponibles para administración");
  const player=players.find(x=>String(x.id)===String(playerId));
  const asset=playerDocumentAsset(playerId,kind);
  if(!asset.path)return toast("Este documento todavía no tiene un archivo adjunto");
  const safeName=cleanName(`${asset.fileBase}_${player?.name||"jugador"}_${player?.surname||""}`)||asset.fileBase;
  const ext=String(asset.path).split(".").pop()?.split("?")[0]?.toLowerCase();
  const filename=`${safeName}${ext&&ext.length<=5?`.${ext}`:""}`;
  const popup=download?null:window.open("about:blank","_blank");
  if(!download&&!popup)return toast("El navegador ha bloqueado la ventana. Permite las ventanas emergentes para ver documentos.");
  try{
    const request=download
      ?sb.storage.from("documents").createSignedUrl(asset.path,300,{download:filename})
      :sb.storage.from("documents").createSignedUrl(asset.path,300);
    const {data,error}=await request;
    if(error)throw error;
    if(!data?.signedUrl)throw new Error("Supabase no devolvió un enlace válido");
    if(download){
      const a=document.createElement("a");a.href=data.signedUrl;a.download=filename;a.rel="noopener";document.body.appendChild(a);a.click();a.remove();
    }else popup.location.replace(data.signedUrl);
  }catch(error){
    if(popup&&!popup.closed)popup.close();
    showOperationError(`No se pudo ${download?"descargar":"abrir"} ${asset.label}.`,error);
  }
};
function documentStatusCell(status,playerId,kind){
  return `<div class="document-status-cell">${badge(status||"Pendiente")}${documentFileControls(playerId,kind)}</div>`;
}

function renderDocuments(){
  renderDocumentsTeamFilter();
  const selectedTeam=documentsTeamFilter?.value||"";
  const list=sortPlayersAlpha(selectedTeam?players.filter(p=>String(p.team||"").trim()===selectedTeam):players);
  documentsBody.innerHTML=list.length?list.map(p=>{const d=docs(p.id);return `<tr>
    <td><strong>${esc(p.name||"")} ${esc(p.surname||"")}</strong></td>
    <td><span class="payment-team-badge">${esc(p.team||"Sin equipo")}</span></td>
    <td>${documentStatusCell(d.player_dni_status,p.id,"dni")}</td>
    <td>${documentStatusCell(d.photo_status,p.id,"photo")}</td>
    <td>${documentStatusCell(d.medical_status,p.id,"medical")}</td>
    <td>${badge(docState(p.id))}</td>
    <td>${isTechnicalReadOnly()?'<small class="document-file-private">Solo consulta</small>':`<button class="mini" onclick="openDocs('${p.id}')">Actualizar estado</button>`}</td>
  </tr>`}).join(""):`<tr><td colspan="7">${players.length?"No hay jugadores en el equipo seleccionado.":"No hay jugadores."}</td></tr>`;
}

function renderBirthdays(){
  const target=document.getElementById("birthdays");
  if(!target)return;
  const today=new Date();
  const list=players.map(p=>{
    if(!p.birth_date)return null;
    const birth=new Date(p.birth_date+"T12:00:00");
    let next=new Date(today.getFullYear(),birth.getMonth(),birth.getDate());
    if(next<today)next.setFullYear(today.getFullYear()+1);
    return {...p,next,diff:Math.ceil((next-today)/86400000)};
  }).filter(Boolean).filter(p=>p.diff<=30).sort((a,b)=>a.diff-b.diff);
  target.innerHTML=list.length?list.map(p=>`<div class="row"><div class="person"><div class="avatar">${(p.name||"?")[0]}${(p.surname||"?")[0]}</div><div><strong>${p.name} ${p.surname}</strong><br><small>${p.next.toLocaleDateString("es-ES",{day:"2-digit",month:"long"})}</small></div></div><strong>${p.diff===0?"Hoy":p.diff+" días"}</strong></div>`).join(""):"No hay cumpleaños en los próximos 30 días.";
}

function filteredPlayers(){
  const searchValue=(document.getElementById("playerSearch")?.value||"").trim().toLowerCase();
  const teamValue=document.getElementById("playerTeamFilter")?.value||"";
  const statusValue=document.getElementById("playerStatusFilter")?.value||"";
  const issueValue=document.getElementById("playerIssueFilter")?.value||"";

  return sortPlayersAlpha(players.filter(p=>{
    const haystack=[p.name,p.surname,p.guardian,p.phone,p.email,p.team,p.player_dni]
      .filter(Boolean).join(" ").toLowerCase();
    if(searchValue&&!haystack.includes(searchValue))return false;
    if(teamValue&&p.team!==teamValue)return false;
    if(statusValue&&p.status!==statusValue)return false;
    if(issueValue==="documents"&&docState(p.id)!=="Incompleta")return false;
    if(issueValue==="payments"&&pending(p.id)<=0)return false;
    if(issueValue==="sizing"&&sizeFor(p.id).sized==="Sí")return false;
    if(issueValue==="kit"&&kit(p.id).delivered==="Sí")return false;
    if(issueValue==="photo"&&p.photo_path)return false;
    return true;
  }));
}
function playerStatusClass(value){
  if(value==="Aprobada")return"ok";
  if(value==="Rechazada"||value==="Baja")return"bad";
  return"warn";
}
function renderPlayerTeamFilter(){
  const select=document.getElementById("playerTeamFilter");
  if(!select)return;
  const selected=select.value;
  const names=sortByAlpha([...new Set([...teams.map(t=>t.name),...players.map(p=>p.team)].filter(Boolean))],n=>n);
  select.innerHTML='<option value="">Todos los equipos</option>'+names.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join("");
  if(names.includes(selected))select.value=selected;
}
function playerIssueSummary(p){
  const issues=[];
  if(docState(p.id)==="Incompleta")issues.push("Documentación");
  if(pending(p.id)>0)issues.push("Pagos");
  if(sizeFor(p.id).sized!=="Sí")issues.push("Tallaje");
  if(kit(p.id).delivered!=="Sí")issues.push("Equipación");
  if(!p.photo_path)issues.push("Foto");
  return issues;
}
function renderPlayers(){
  renderPlayerTeamFilter();
  const list=filteredPlayers();

  document.getElementById("playersOverviewTotal").textContent=players.length;
  document.getElementById("playersOverviewPhotos").textContent=players.filter(p=>p.photo_path).length;
  document.getElementById("playersOverviewDocs").textContent=players.filter(p=>docState(p.id)==="Completa").length;
  document.getElementById("playersOverviewPayments").textContent=players.filter(p=>pending(p.id)<=0).length;
  document.getElementById("playersResultCount").textContent=`${list.length} ${list.length===1?"jugador":"jugadores"}`;

  const grid=document.getElementById("playersGrid");
  const tableBody=document.getElementById("playersTableBody");
  if(!grid||!tableBody)return;

  grid.innerHTML=list.length?list.map(p=>{
    const issues=playerIssueSummary(p);
    const photo=signedCache[p.photo_path]||placeholderPhoto;
    return `<article class="player-professional-card" onclick="editPlayer('${p.id}')">
      <div class="player-photo-wrap">
        <img src="${photo}" alt="Foto de ${esc(p.name||"jugador")}" onerror="this.src='${placeholderPhoto}'">
        <span class="player-status-dot ${playerStatusClass(p.status)}"></span>
      </div>
      <div class="player-card-main">
        <div class="player-card-title">
          <div><h3>${esc(p.name||"")} ${esc(p.surname||"")}</h3><p>${esc(p.team||"Sin equipo")} · ${reportDate(p.birth_date)}</p></div>
          ${badge(p.status||"Pendiente revisión")}
        </div>
        <div class="player-card-flags">
          <span class="${docState(p.id)==="Completa"?"good":"pending"}">📄 ${docState(p.id)}</span>
          <span class="${pending(p.id)<=0?"good":"pending"}">💶 ${pending(p.id)<=0?"Al día":euro(pending(p.id))}</span>
          <span class="${sizeFor(p.id).sized==="Sí"?"good":"pending"}">📏 ${sizeFor(p.id).sized==="Sí"?"Tallado":"Pendiente"}</span>
          <span class="${kit(p.id).delivered==="Sí"?"good":"pending"}">👕 ${kit(p.id).delivered==="Sí"?"Entregada":"Sin entregar"}</span>
        </div>
        <div class="player-card-footer">
          <span>${issues.length?`${issues.length} ${issues.length===1?"pendiente":"pendientes"}`:"Todo correcto"}</span>
          <button class="mini" type="button" onclick="event.stopPropagation();editPlayer('${p.id}')">Abrir ficha</button>
        </div>
      </div>
    </article>`;
  }).join(""):'<div class="players-empty-state"><strong>No hay jugadores con estos filtros</strong><p>Modifica la búsqueda o limpia los filtros.</p></div>';

  tableBody.innerHTML=list.length?list.map(p=>{
    const photo=signedCache[p.photo_path]||placeholderPhoto;
    return `<tr>
      <td><img class="player-table-photo" src="${photo}" onerror="this.src='${placeholderPhoto}'"></td>
      <td><strong>${esc(p.name||"")} ${esc(p.surname||"")}</strong><small>${esc(p.guardian||"Sin tutor")}</small></td>
      <td>${esc(p.team||"Sin equipo")}</td>
      <td>${badge(p.status||"Pendiente revisión")}</td>
      <td><span class="${docState(p.id)==="Completa"?"report-state-ok":"report-state-warn"}">${docState(p.id)}</span></td>
      <td><span class="${pending(p.id)<=0?"report-state-ok":"report-state-bad"}">${pending(p.id)<=0?"Al día":euro(pending(p.id))}</span></td>
      <td>${sizeFor(p.id).sized==="Sí"?"Sí":"Pendiente"}</td>
      <td>${kit(p.id).delivered==="Sí"?"Entregada":"Pendiente"}</td>
      <td><button class="mini" onclick="editPlayer('${p.id}')">Abrir</button></td>
    </tr>`;
  }).join(""):'<tr><td colspan="9">No hay jugadores con estos filtros.</td></tr>';
}
function renderUpcomingEvents(){
 const today=new Date().toISOString().slice(0,10);const list=events.filter(e=>e.event_date>=today).slice(0,5);
 upcomingEvents.innerHTML=list.length?list.map(e=>`<div class="row"><div><strong>${e.title}</strong><br><small>${new Date(e.event_date+"T12:00:00").toLocaleDateString("es-ES")} · ${e.event_time||"Sin hora"}</small></div><span class="badge warn">${e.event_type}</span></div>`).join(""):"No hay próximos eventos.";
}
function renderTeams(){
  const orderedTeams=sortTeamsAlpha(teams);
  teamsGrid.innerHTML=orderedTeams.length?orderedTeams.map(t=>{
    const count=players.filter(p=>p.team===t.name).length;
    const coach=staff.find(s=>s.id===t.coach_id)?.name||"-";
    return `<article class="team-card">
      <div class="team-card-top">
        <div><h4>${esc(t.name)}</h4><p>${esc(t.age_category||normalizeSeasonCategory(t.name)||"Sin categoría de edad")}${t.category?` · ${esc(t.category)}`:""}</p></div>
        <span class="team-player-count"><i>⚽</i>${count} jugadores</span>
      </div>
      <div class="team-meta">
        <div><span>Entrenador</span><strong>${esc(coach)}</strong></div>
        <div><span>Delegado</span><strong>${esc(t.delegate_name||"-")}</strong></div>
        <div><span>Horario</span><strong>${esc(t.training_schedule||"-")}</strong></div>
        <div><span>Campo</span><strong>${esc(t.field||"-")}</strong></div>
      </div>
      <div class="team-actions">
        <button class="mini" onclick="openTeamDetail('${t.id}')">Abrir equipo</button>
        <button class="mini team-report-shortcut" onclick="openTeamReport('${String(t.name).replace(/'/g,"\\'")}','full')">Generar informe</button>
        <button class="mini" onclick="editTeam('${t.id}')">Editar</button>
        <button class="mini danger-mini" onclick="deleteTeam('${t.id}')">Eliminar</button>
      </div>
    </article>`;
  }).join(""):"No hay equipos creados.";
}
function renderStaff(){const orderedStaff=sortStaffAlpha(staff);staffBody.innerHTML=orderedStaff.length?orderedStaff.map(s=>`<tr><td><strong>${esc(s.name)}</strong></td><td>${esc(s.role||"-")}</td><td>${esc(s.team_name||"-")}</td><td>${esc(s.phone||"-")}</td><td>${esc(s.email||"-")}</td><td><button class="mini" onclick="editStaff('${s.id}')">Editar</button> <button class="mini danger-mini" onclick="deleteStaff('${s.id}')">Eliminar</button></td></tr>`).join(""):'<tr><td colspan="6">No hay miembros registrados.</td></tr>'}
function renderCalendar(){
  if(!calendarList)return;
  const months=["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];
  const agenda=[];

  (Array.isArray(events)?events:[]).forEach(e=>{
    if(!e?.event_date)return;
    agenda.push({
      kind:"event",
      date:e.event_date,
      time:e.event_time||"",
      sort:`${e.event_date} ${e.event_time||"99:99"}`,
      data:e
    });
  });

  (Array.isArray(clubMatches)?clubMatches:[]).forEach(m=>{
    if(!m?.match_date)return;
    agenda.push({
      kind:"match",
      date:m.match_date,
      time:m.match_time||"",
      sort:`${m.match_date} ${m.match_time||"99:99"}`,
      data:m
    });
  });

  agenda.sort((a,b)=>a.sort.localeCompare(b.sort));

  calendarList.innerHTML=agenda.length?agenda.map(item=>{
    const d=new Date(item.date+"T12:00:00");
    const day=`<div class="event-date"><span>${String(d.getDate()).padStart(2,"0")}</span><small>${months[d.getMonth()]}</small></div>`;

    if(item.kind==="match"){
      const m=item.data;
      const home=m.venue!=="away";
      const left=home?m.team:m.opponent;
      const right=home?m.opponent:m.team;
      const venueLabel=home?"LOCAL":"VISITANTE";
      const result=matchIsPlayed(m)?` · ${home?esc(m.goals_for):esc(m.goals_against)}-${home?esc(m.goals_against):esc(m.goals_for)}`:"";
      return `<article class="event-card calendar-match-card">
        ${day}
        <div class="event-info calendar-match-info">
          <div class="calendar-match-top"><span class="event-type calendar-match-type">⚽ PARTIDO</span>${competitionLogoHTML(m.competition,true)}</div>
          <div class="calendar-match-versus-line"><span class="calendar-match-team">${crestHTML(left,left===m.team,m)}<strong>${esc(left||"Equipo")}</strong></span><span class="calendar-match-vs">VS</span><span class="calendar-match-team">${crestHTML(right,right===m.team,m)}<strong>${esc(right||"Rival")}</strong></span></div>
          <p><strong>${esc(m.team||"Equipo")}</strong> · ${esc(m.match_time||"Sin hora")} · ${esc(m.location||"Campo pendiente")}</p>
          <p>${esc(m.round||m.competition||"Partido")} · ${venueLabel}${result}</p>
        </div>
        <button class="mini" onclick="editClubMatch('${m.id}')">Editar partido</button>
      </article>`;
    }

    const e=item.data;
    return `<article class="event-card">${day}<div class="event-info"><h4>${esc(e.title)}</h4><p>${esc(e.event_time||"Sin hora")} · ${esc(e.location||"Sin lugar")}${e.team_name?" · "+esc(e.team_name):""}</p><span class="event-type">${esc(e.event_type)}</span></div><button class="mini" onclick="editEvent('${e.id}')">Editar</button></article>`;
  }).join(""):"No hay eventos ni partidos programados.";
}

function fillCoachOptions(selected=""){
  teamForm.elements.coach_id.innerHTML='<option value="">Sin asignar</option>'+sortStaffAlpha(staff.filter(s=>s.role==="Entrenador")).map(s=>`<option value="${s.id}">${s.name}</option>`).join("");
  teamForm.elements.coach_id.value=selected||"";
}
addTeam.onclick=()=>{
  teamForm.reset();
  teamForm.elements.id.value="";
  deleteTeamFromForm?.classList.add("hidden");
  deleteTeamFromForm?.removeAttribute("data-team-id");
  fillCoachOptions();
  teamDialog.showModal();
};
window.editTeam=id=>{
  const team=teams.find(x=>x.id===id);
  if(!team) return toast("Equipo no encontrado");
  teamForm.reset();
  deleteTeamFromForm?.classList.remove("hidden");
  deleteTeamFromForm?.setAttribute("data-team-id",id);
  fillCoachOptions(team.coach_id);
  ["id","name","age_category","category","delegate_name","training_schedule","field","notes"].forEach(name=>{
    if(teamForm.elements[name]) teamForm.elements[name].value=team[name]||"";
  });
  teamDialog.showModal();
};
teamForm.onsubmit=async event=>{
  event.preventDefault();
  const raw=Object.fromEntries(new FormData(teamForm));
  const id=raw.id||null;
  const data={name:(raw.name||"").trim(),age_category:(raw.age_category||"").trim()||null,category:(raw.category||"").trim()||null,coach_id:raw.coach_id||null,delegate_name:(raw.delegate_name||"").trim()||null,training_schedule:(raw.training_schedule||"").trim()||null,field:(raw.field||"").trim()||null,notes:(raw.notes||"").trim()||null,season_id:activeClubSeason?.id||null};
  try{
    if(!data.name)throw new Error("El nombre del equipo es obligatorio");
    let r=id?await sb.from("teams").update(data).eq("id",id):await sb.from("teams").insert(data);
    if(r.error && /coach_id|schema cache|column/i.test(r.error.message||"")){
      const fallback={...data};delete fallback.coach_id;
      r=id?await sb.from("teams").update(fallback).eq("id",id):await sb.from("teams").insert(fallback);
    }
    if(r.error)throw r.error;
    await logActivity(id?"actualizar":"crear","equipo",id||null,`${id?"Equipo actualizado":"Equipo creado"}: ${data.name}`);teamDialog.close();toast("Equipo guardado correctamente");await loadAll();
  }catch(error){console.error(error);toast("Equipo: "+(error.message||"No se pudo guardar"))}
}

addEvent.onclick=()=>{eventForm.reset();eventDialog.showModal()};
window.editEvent=id=>{const ev=events.find(x=>x.id===id);eventForm.reset();Object.entries(ev).forEach(([k,v])=>{if(eventForm.elements[k])eventForm.elements[k].value=v??""});eventDialog.showModal()};
eventForm.onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(eventForm));const id=d.id;delete d.id;try{const r=id?await sb.from("events").update(d).eq("id",id):await sb.from("events").insert(d);if(r.error)throw r.error;eventDialog.close();toast("Evento guardado");await loadAll()}catch(error){showOperationError("No se pudo guardar el evento.",error)}};


const PLAYER_SIZES=["","4XS","3XS","2XS","XS","S","M","L","XL","2XL","3XL"];
const SOCK_SIZES=["","S","M","L"];
const STAFF_SIZES=["","S","M","L","XL","2XL","3XL"];
const PLAYER_NATIVE_SIZE_FIELDS=["game_shirt","game_shirt_goalkeeper","game_shorts","game_shorts_goalkeeper","second_shirt_player","training_shirt","training_shirt_goalkeeper","training_shorts","training_shorts_goalkeeper","training_sweatshirt","tracksuit_jacket","tracksuit_trousers"];
const PLAYER_SOCK_FIELDS=["socks","socks_goalkeeper"];
function fillSelect(select,values){if(!select)return;select.innerHTML=values.map(v=>`<option value="${v}">${v||"Seleccionar"}</option>`).join("")}
function sizeFor(id){return {...(playerSizes.find(x=>x.player_id===id)||{}),...customClothingSizesFor("players",id),backpack:"Única"}}
function clothingDisplayValue(item,sizes){
  if(item?.key==="backpack")return "Incluida";
  return sizes?.[item?.key]||"-";
}
function staffSizeFor(id){
  const base=staffSizes.find(x=>x.staff_id===id)||{}, custom=customClothingSizesFor("staff",id), status=staffKitStatusFor(id);
  const hasSize=["training_shirt","training_shorts","training_sweatshirt","tracksuit_jacket","tracksuit_trousers","polo",...activeClothingItemsFor("staff").filter(item=>item.custom).map(item=>item.key)].some(key=>String(base[key]??custom[key]??"").trim());
  return {...base,...custom,backpack:"Única",sized:status.sized||(hasSize?"Sí":"No"),delivered:status.delivered||"No"};
}
function financeMovementsForActivePlayers(){
  // Los ingresos automáticos nacen de un cobro. Si el jugador asociado está
  // en la papelera, ese ingreso no debe formar parte de la contabilidad activa.
  // Conservamos el movimiento en la base de datos para que pueda recuperarse
  // correctamente si el jugador se restaura.
  const activePlayerIds=new Set((players||[]).filter(p=>!p.deleted_at).map(p=>String(p.id)));
  const paymentOwner=new Map((payments||[]).map(p=>[String(p.id),String(p.player_id)]));
  return (financeMovements||[]).filter(m=>{
    if(!m.source_payment_id)return true;
    const playerId=paymentOwner.get(String(m.source_payment_id));
    return !playerId||activePlayerIds.has(playerId);
  });
}
function renderDashboardExtras(){
 const ym=new Date().toISOString().slice(0,7);
 stPitches.textContent=euro(pitchUsage.filter(x=>x.usage_date?.startsWith(ym)&&!pitchIsCancelled(x)).reduce((s,x)=>s+Number(x.amount||0),0));
 const activeFinance=financeMovementsForActivePlayers();
 const inc=activeFinance.filter(x=>x.movement_type==="Ingreso").reduce((s,x)=>s+Number(x.amount||0),0);
 const exp=activeFinance.filter(x=>x.movement_type==="Gasto").reduce((s,x)=>s+Number(x.amount||0),0);
 stBalance.textContent=euro(inc-exp);
}
function kitOrderRows(){
  const team=document.getElementById("kitOrderTeam")?.value||"";
  const scope=document.getElementById("kitOrderScope")?.value||"players";
  const onlySized=document.getElementById("kitOrderOnlySized")?.checked!==false;
  const rows=[];
  const add=(personType,name,teamName,sizes,fields)=>{
    if(team&&teamName!==team)return;
    const isSized=["si","sí"].includes(String(sizes.sized||"").toLowerCase());
    fields.forEach(([key,defaultLabel])=>{
      const item=CLOTHING_ITEMS.find(x=>x.key===key);
      const automaticNoSize=!!(item?.noSize&&((personType==="Jugador"&&item.defaultForPlayer)||(personType==="Cuerpo técnico"&&item.defaultForStaff)));
      if(onlySized&&!isSized&&!automaticNoSize)return;
      const size=String(sizes[key]||"").trim();if(!size)return;
      const label=item?clothingLabelForAudience(item,personType==="Cuerpo técnico"?"staff":"players"):defaultLabel;
      if(item&&clothingConfig(item).active===false)return;
      rows.push({Tipo:personType,Nombre:name,Equipo:teamName||"Sin equipo",Prenda:label,Talla:size,Unidades:1});
    });
  };
  const playerFields=activeClothingItemsFor("players").map(item=>[item.key,clothingLabelForAudience(item,"players")]);
  const staffFields=activeClothingItemsFor("staff").map(item=>[item.key,clothingLabelForAudience(item,"staff")]);
  if(scope==="players"||scope==="all")players.forEach(p=>add("Jugador",`${p.name||""} ${p.surname||""}`.trim(),p.team||"",sizeFor(p.id),playerFields));
  if(scope==="staff"||scope==="all")staff.forEach(s=>add("Cuerpo técnico",s.name||"",s.team_name||"",staffSizeFor(s.id),staffFields));
  return rows;
}
const CLOTHING_SIZE_ORDER=["4XS","3XS","2XS","XS","S","M","L","XL","2XL","3XL","ÚNICA"];
function clothingSizeSortRank(size){
  const value=String(size||"").trim().toUpperCase();
  const index=CLOTHING_SIZE_ORDER.indexOf(value);
  return index>=0?index:100;
}
function clothingItemOrderForLabel(label){
  const itemIndex=CLOTHING_ITEMS.findIndex(item=>
    clothingConfig(item).label===label||
    clothingLabelForAudience(item,"players")===label||
    clothingLabelForAudience(item,"staff")===label||
    clothingLabelForAudience(item,"all")===label
  );
  if(itemIndex<0)return {category:999,item:999};
  const item=CLOTHING_ITEMS[itemIndex],categoryName=clothingConfig(item).category||item.category||"Complementos";
  const categoryIndex=CLOTHING_CATEGORIES.indexOf(categoryName);
  return {category:categoryIndex>=0?categoryIndex:999,item:itemIndex};
}
function kitOrderSummary(){
  const map=new Map();
  kitOrderRows().forEach(row=>{const key=`${row.Prenda}|||${row.Talla}`;const current=map.get(key)||{Prenda:row.Prenda,Talla:row.Talla,Unidades:0};current.Unidades++;map.set(key,current)});
  return [...map.values()].sort((a,b)=>{
    const orderA=clothingItemOrderForLabel(a.Prenda),orderB=clothingItemOrderForLabel(b.Prenda);
    if(orderA.category!==orderB.category)return orderA.category-orderB.category;
    if(orderA.item!==orderB.item)return orderA.item-orderB.item;
    const sizeA=clothingSizeSortRank(a.Talla),sizeB=clothingSizeSortRank(b.Talla);
    if(sizeA!==sizeB)return sizeA-sizeB;
    return String(a.Talla||"").localeCompare(String(b.Talla||""),"es",{numeric:true,sensitivity:"base"});
  });
}
function renderKitOrder(){
  const teamSelect=document.getElementById("kitOrderTeam");
  if(teamSelect){const current=teamSelect.value;teamSelect.innerHTML='<option value="">Todos los equipos</option>'+sortTeamsAlpha(teams).map(t=>`<option value="${esc(t.name)}">${esc(t.name)}</option>`).join("");teamSelect.value=current}
  const summary=kitOrderSummary(),detail=kitOrderRows();
  const body=document.getElementById("kitOrderSummaryBody");
  if(body)body.innerHTML=summary.length?summary.map(r=>`<tr><td><strong>${esc(r.Prenda)}</strong></td><td>${esc(r.Talla)}</td><td><b>${r.Unidades}</b></td></tr>`).join(""):'<tr><td colspan="3">No hay tallajes para los filtros seleccionados.</td></tr>';
  const stats=document.getElementById("kitOrderStats");
  if(stats){const people=new Set(detail.map(r=>`${r.Tipo}|${r.Nombre}|${r.Equipo}`)).size;stats.innerHTML=`<article><span>Personas</span><strong>${people}</strong></article><article><span>Prendas</span><strong>${detail.length}</strong></article><article><span>Combinaciones</span><strong>${summary.length}</strong></article>`}
}
function exportKitOrder(){
  const team=document.getElementById("kitOrderTeam")?.value||"todos_los_equipos";
  const summary=kitOrderSummary();if(!summary.length)return toast("No hay datos para exportar");
  downloadCSV(`pedido_ropa_${cleanName(team)}.csv`,summary);toast("Pedido exportado")
}
function printKitOrderReport(){
  const team=document.getElementById("kitOrderTeam")?.value||"Todos los equipos",scope=document.getElementById("kitOrderScope")?.selectedOptions?.[0]?.textContent||"Jugadores";
  const summary=kitOrderSummary();if(!summary.length)return toast("No hay datos para imprimir");
  const total=summary.reduce((n,r)=>n+r.Unidades,0),w=window.open("","_blank","width=1000,height=800");if(!w)return toast("El navegador ha bloqueado la ventana de impresión");
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Pedido de ropa</title><style>body{font-family:Arial,sans-serif;color:#14213d;padding:32px}header{display:flex;align-items:center;gap:18px;border-bottom:3px solid #0757c7;padding-bottom:18px;margin-bottom:24px}header img{width:70px;height:70px;object-fit:contain}h1{margin:0;font-size:26px}p{margin:5px 0;color:#556}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{padding:11px;border-bottom:1px solid #dce3ee;text-align:left}th{background:#eef4ff}.total{margin-top:18px;text-align:right;font-size:18px;font-weight:bold}@media print{button{display:none}}</style></head><body><header><img src="assets/escudo-oficial.png"><div><h1>CD San Bernabé · Pedido de ropa</h1><p>${esc(team)} · ${esc(scope)}</p><p>Generado el ${new Date().toLocaleDateString("es-ES")}</p></div></header><table><thead><tr><th>Prenda</th><th>Talla</th><th>Unidades</th></tr></thead><tbody>${summary.map(r=>`<tr><td>${esc(r.Prenda)}</td><td>${esc(r.Talla)}</td><td>${r.Unidades}</td></tr>`).join("")}</tbody></table><div class="total">Total de prendas: ${total}</div><script>window.onload=()=>setTimeout(()=>window.print(),250)<\/script></body></html>`);w.document.close();
}
function setupKitOrder(){
  ["kitOrderTeam","kitOrderScope","kitOrderOnlySized"].forEach(id=>document.getElementById(id)?.addEventListener("change",renderKitOrder));
  document.getElementById("exportKitOrderCsv")?.addEventListener("click",exportKitOrder);
  document.getElementById("printKitOrder")?.addEventListener("click",printKitOrderReport);
}
document.addEventListener("DOMContentLoaded",()=>{
  setupKitOrder();
  document.getElementById("addClothingItem")?.addEventListener("click",openNewClothingItem);
  document.getElementById("clothingItemForm")?.addEventListener("submit",createCustomClothingItem);
});
function clothingTableHeader(audience){
  return activeClothingItemsFor(audience).map(item=>`<th>${esc(clothingLabelForAudience(item,audience))}</th>`).join("");
}
function clothingTableCells(audience,sizes){
  return activeClothingItemsFor(audience).map(item=>`<td>${esc(clothingDisplayValue(item,sizes))}</td>`).join("");
}
function renderCustomClothingFields(audience,values={}){
  const container=document.getElementById(audience==="staff"?"staffCustomClothingFields":"playerCustomClothingFields");if(!container)return;
  const items=activeClothingItemsFor(audience).filter(item=>item.custom);
  const sizes=audience==="staff"?STAFF_SIZES:PLAYER_SIZES;
  container.innerHTML=items.length?`<div class="custom-clothing-fields-title">Prendas añadidas al catálogo</div>${items.map(item=>{
    const cfg=clothingConfig(item),options=sizes.map(v=>`<option value="${esc(v)}" ${String(values[item.key]||"")===String(v)?"selected":""}>${esc(v||"Seleccionar")}</option>`).join("");
    return `<label class="visual-size-field custom-visual-size-field" data-clothing-key="${item.key}"><span class="visual-size-photo">${clothingImages[item.key]?`<img src="${clothingImages[item.key]}" alt="${esc(cfg.label)}">`:""}</span><span class="visual-size-name">${esc(cfg.label)}</span><select name="custom__${item.key}">${options}</select></label>`;
  }).join("")}`:"";
}
function collectCustomClothingValues(form,audience){
  const values={};activeClothingItemsFor(audience).filter(item=>item.custom).forEach(item=>{values[item.key]=form.elements[`custom__${item.key}`]?.value||""});return values;
}
function renderKits(){
 const playerItems=activeClothingItemsFor("players"),staffItems=activeClothingItemsFor("staff");
 const playerHead=document.getElementById("kitsHeadRow"),staffHead=document.getElementById("kitsStaffHeadRow");
 if(playerHead)playerHead.innerHTML=`<th>Jugador</th><th>Equipo</th>${clothingTableHeader("players")}<th>Tallaje</th><th>Entrega</th><th></th>`;
 if(staffHead)staffHead.innerHTML=`<th>Nombre</th><th>Equipo</th><th>Cargo</th>${clothingTableHeader("staff")}<th>Tallaje</th><th>Entrega</th><th></th>`;
 kitsBody.innerHTML=sortPlayersAlpha(players).map(p=>{const s=sizeFor(p.id),k=kit(p.id);return `<tr>
  <td><strong>${esc(p.name||"")} ${esc(p.surname||"")}</strong></td><td>${esc(p.team||"Sin equipo")}</td>
  ${clothingTableCells("players",s)}
  <td>${badge(s.sized||"No")}</td><td>${badge(k.delivered||"No")}</td><td><button class="mini" onclick="openKit('${p.id}')">Actualizar</button></td></tr>`}).join("")||`<tr><td colspan="${playerItems.length+5}">No hay jugadores.</td></tr>`;
 const staffBody=document.getElementById("kitsStaffBody");
 if(staffBody)staffBody.innerHTML=sortStaffAlpha(staff).map(member=>{const z=staffSizeFor(member.id);return `<tr>
  <td><strong>${esc(member.name||"")}</strong></td><td>${esc(member.team_name||"Sin equipo")}</td><td>${esc(member.role||"-")}</td>
  ${clothingTableCells("staff",z)}
  <td>${badge(z.sized||"No")}</td><td>${badge(z.delivered||"No")}</td>
  <td><button class="mini" onclick="editStaff('${member.id}')">Actualizar</button></td></tr>`}).join("")||`<tr><td colspan="${staffItems.length+6}">No hay miembros del cuerpo técnico.</td></tr>`;
 renderKitOrder();
 if(typeof renderKitInventory==="function")renderKitInventory();
 renderStaffSizingReport();
}

function staffSizingRows(){
  const teamFilter=document.getElementById("staffSizingTeam")?.value||"";
  return sortStaffAlpha(staff).filter(member=>!teamFilter||String(member.team_name||"")===teamFilter).map(member=>{
    const sizes=staffSizeFor(member.id);
    const row={Nombre:member.name||"",Equipo:member.team_name||"Sin equipo",Cargo:member.role||"-"};
    activeClothingItemsFor("staff").forEach(item=>{
      row[clothingLabelForAudience(item,"staff")]=clothingDisplayValue(item,sizes);
    });
    row["Tallaje realizado"]=sizes.sized||"No";
    row["Ropa entregada"]=sizes.delivered||"No";
    return row;
  });
}
function renderStaffSizingReport(){
  const select=document.getElementById("staffSizingTeam");
  if(select){
    const current=select.value||"";
    const names=[...new Set(staff.map(s=>String(s.team_name||"").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"es",{sensitivity:"base"}));
    select.innerHTML='<option value="">Todos los equipos</option>'+names.map(name=>`<option value="${esc(name)}">${esc(name)}</option>`).join("");
    if(names.includes(current))select.value=current;
  }
  const rows=staffSizingRows(),head=document.getElementById("staffSizingReportHead"),body=document.getElementById("staffSizingReportBody"),stats=document.getElementById("staffSizingStats");
  const labels=["Nombre","Equipo","Cargo",...activeClothingItemsFor("staff").map(item=>clothingLabelForAudience(item,"staff")),"Tallaje realizado","Ropa entregada"];
  if(head)head.innerHTML=labels.map(label=>`<th>${esc(label)}</th>`).join("");
  if(body)body.innerHTML=rows.length?rows.map(row=>`<tr>${labels.map(label=>`<td>${label==="Nombre"?`<strong>${esc(row[label]||"")}</strong>`:esc(row[label]??"-")}</td>`).join("")}</tr>`).join(""):`<tr><td colspan="${labels.length}">No hay miembros del cuerpo técnico para este filtro.</td></tr>`;
  if(stats){
    const sized=rows.filter(row=>["si","sí"].includes(String(row["Tallaje realizado"]||"").toLowerCase())).length;
    stats.innerHTML=`<span><b>${rows.length}</b> miembros</span><span><b>${sized}</b> tallajes realizados</span>`;
  }
}
function exportStaffSizingReport(){
  const rows=staffSizingRows();
  downloadCSV("tallajes_cuerpo_tecnico.csv",rows);
  if(rows.length)toast("Tallaje del cuerpo técnico descargado");
}
function openStaffSizingPdf(){
  const rows=staffSizingRows();
  if(!rows.length)return toast("No hay tallajes del cuerpo técnico para generar el PDF");
  if(!window.jspdf?.jsPDF)return toast("No se pudo cargar el generador PDF");
  const {jsPDF}=window.jspdf;
  if(typeof jsPDF.API.autoTable!=="function"&&!window.jspdfAutoTable)return toast("No se pudo cargar la tabla del PDF");

  // Abrimos la pestaña de forma inmediata dentro del gesto del usuario para
  // evitar bloqueos de ventanas emergentes en navegador y PWA instalada.
  const viewer=window.open("about:blank","_blank");
  if(viewer){
    try{
      viewer.document.title="Tallaje cuerpo técnico · CD San Bernabé";
      viewer.document.body.innerHTML='<div style="font:16px Arial,sans-serif;padding:32px;color:#123">Generando PDF del tallaje técnico…</div>';
    }catch(_){ }
  }

  try{
    const labels=Object.keys(rows[0]);
    const team=document.getElementById("staffSizingTeam")?.value||"Todos los equipos";
    const doc=new jsPDF({orientation:"landscape",unit:"mm",format:"a4"});
    const pageWidth=doc.internal.pageSize.getWidth();
    const pageHeight=doc.internal.pageSize.getHeight();

    doc.setProperties({
      title:`Tallaje cuerpo técnico · ${team}`,
      subject:"Tallaje del cuerpo técnico · CD San Bernabé",
      author:"CD San Bernabé Manager",
      creator:"CD San Bernabé Manager"
    });

    doc.setFillColor(8,42,78);
    doc.rect(0,0,pageWidth,30,"F");

    // El escudo ya está cargado en la aplicación y puede incorporarse al PDF
    // sin ninguna petición adicional a Internet.
    try{
      const img=document.querySelector(".brand img, .crest-logo img");
      if(img?.complete&&img.naturalWidth){
        const canvas=document.createElement("canvas");
        canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
        canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);
        doc.addImage(canvas.toDataURL("image/png"),"PNG",9,4,22,22);
      }
    }catch(_){ }

    doc.setTextColor(255,255,255);
    doc.setFont(undefined,"bold");doc.setFontSize(15);
    doc.text("CD SAN BERNABÉ",36,11);
    doc.setFont(undefined,"normal");doc.setFontSize(11);
    doc.text("Tallaje exclusivo del cuerpo técnico",36,19);
    doc.setFontSize(8);
    doc.text(`Equipo: ${team} · ${rows.length} miembro${rows.length===1?"":"s"} · ${new Date().toLocaleDateString("es-ES")}`,36,25);

    doc.autoTable({
      head:[labels],
      body:rows.map(row=>labels.map(label=>String(row[label]??"-"))),
      startY:35,
      theme:"grid",
      styles:{fontSize:6.2,cellPadding:1.25,overflow:"linebreak",valign:"middle"},
      headStyles:{fillColor:[17,93,151],textColor:255,fontStyle:"bold",fontSize:6.1},
      alternateRowStyles:{fillColor:[244,248,251]},
      margin:{left:7,right:7,bottom:12},
      didDrawPage:()=>{
        const current=doc.internal.getCurrentPageInfo().pageNumber;
        doc.setTextColor(90);doc.setFontSize(7);
        doc.text("CD San Bernabé · Tallaje del cuerpo técnico",7,pageHeight-5);
        doc.text(`Página ${current}`,pageWidth-22,pageHeight-5);
      }
    });

    const blob=doc.output("blob");
    const pdfUrl=URL.createObjectURL(blob);

    if(viewer&&!viewer.closed){
      viewer.location.replace(pdfUrl);
    }else{
      const link=document.createElement("a");
      link.href=pdfUrl;
      link.target="_blank";
      link.rel="noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
    }

    // Tiempo suficiente para que el visor haya cargado el documento.
    setTimeout(()=>URL.revokeObjectURL(pdfUrl),5*60*1000);
    toast("PDF abierto. Desde el visor puedes imprimirlo o descargarlo");
  }catch(error){
    console.error("No se pudo generar el PDF del tallaje técnico",error);
    try{viewer?.close()}catch(_){ }
    toast("No se pudo generar el PDF del tallaje técnico");
  }
}
document.getElementById("staffSizingTeam")?.addEventListener("change",renderStaffSizingReport);
document.getElementById("exportStaffSizingCsv")?.addEventListener("click",exportStaffSizingReport);
document.getElementById("printStaffSizingReport")?.addEventListener("click",openStaffSizingPdf);

window.openKit=id=>{const s=sizeFor(id),k=kit(id);kitForm.reset();kitForm.player_id.value=id;
 PLAYER_NATIVE_SIZE_FIELDS.forEach(n=>{const field=kitForm.elements[n];if(!field)return;fillSelect(field,PLAYER_SIZES);field.value=s[n]||""});
 PLAYER_SOCK_FIELDS.forEach(n=>{const field=kitForm.elements[n];if(!field)return;fillSelect(field,SOCK_SIZES);field.value=s[n]||""});
 kitForm.sized.value=s.sized||"No";kitForm.sizing_date.value=s.sizing_date||"";kitForm.notes.value=s.notes||"";
 kitForm.delivered.value=k.delivered||"No";kitForm.delivery_date.value=k.delivery_date||"";renderCustomClothingFields("players",s);refreshKitDialogImages();kitDialog.showModal()}
kitForm.onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(kitForm));const pid=d.player_id;
 const sizeData={player_id:pid,game_shirt:d.game_shirt,game_shirt_goalkeeper:d.game_shirt_goalkeeper,game_shorts:d.game_shorts,game_shorts_goalkeeper:d.game_shorts_goalkeeper,second_shirt_player:d.second_shirt_player,socks:d.socks,socks_goalkeeper:d.socks_goalkeeper,training_shirt:d.training_shirt,training_shirt_goalkeeper:d.training_shirt_goalkeeper,training_shorts:d.training_shorts,training_shorts_goalkeeper:d.training_shorts_goalkeeper,training_sweatshirt:d.training_sweatshirt,tracksuit_jacket:d.tracksuit_jacket,tracksuit_trousers:d.tracksuit_trousers,sized:d.sized,sizing_date:d.sizing_date||null,notes:d.notes};
 const kitData={player_id:pid,sized:d.sized,delivered:d.delivered,delivery_date:d.delivery_date||null};
 let r1=await sb.from("player_sizes").upsert(sizeData,{onConflict:"player_id"});let r2=await sb.from("kits").upsert(kitData,{onConflict:"player_id"});
 if(r1.error||r2.error)return showOperationError("No se pudo guardar el tallaje.",r1.error||r2.error);savePersonCustomClothingSizes("players",pid,collectCustomClothingValues(kitForm,"players"));kitDialog.close();toast("Tallaje guardado");await loadAll()}

function fillStaffTeams(selected=""){
  staffForm.elements.team_name.innerHTML='<option value="">Sin asignar</option>'+sortTeamsAlpha(teams).map(t=>`<option value="${t.name}">${t.name}</option>`).join("");
  staffForm.elements.team_name.value=selected||"";
}
function prepareStaffSizeSelects(values={}){
  ["training_shirt","training_shorts","training_sweatshirt","tracksuit_jacket","tracksuit_trousers","polo"].forEach(name=>{
    const field=staffForm.elements[name];
    if(!field) return;
    fillSelect(field,STAFF_SIZES);
    field.value=values[name]||"";
  });
}
addStaff.onclick=()=>{
  staffForm.reset();
  staffForm.elements.id.value="";
  staffDialogTitle.textContent="Nuevo miembro";
  fillStaffTeams();
  prepareStaffSizeSelects();
  if(staffForm.elements.sized)staffForm.elements.sized.value="No";
  if(staffForm.elements.delivered)staffForm.elements.delivered.value="No";
  renderCustomClothingFields("staff",{});
  staffDialog.showModal();
};
window.editStaff=id=>{
  const member=staff.find(x=>x.id===id);
  const sizes=staffSizeFor(id);
  if(!member) return toast("Miembro no encontrado");
  staffForm.reset();
  staffDialogTitle.textContent="Editar miembro";
  prepareStaffSizeSelects(sizes);
  if(staffForm.elements.sized)staffForm.elements.sized.value=sizes.sized||"No";
  if(staffForm.elements.delivered)staffForm.elements.delivered.value=sizes.delivered||"No";
  renderCustomClothingFields("staff",sizes);
  fillStaffTeams(member.team_name);
  ["id","name","role","phone","email","notes"].forEach(name=>{
    if(staffForm.elements[name]) staffForm.elements[name].value=member[name]||"";
  });
  staffDialog.showModal();
};
staffForm.onsubmit=async event=>{
  event.preventDefault();
  const raw=Object.fromEntries(new FormData(staffForm));
  const id=raw.id||null;
  const staffData={name:(raw.name||"").trim(),role:raw.role||null,team_name:raw.team_name||null,phone:(raw.phone||"").trim()||null,email:(raw.email||"").trim()||null,notes:(raw.notes||"").trim()||null};
  const sizeData={training_shirt:raw.training_shirt||null,training_shorts:raw.training_shorts||null,training_sweatshirt:raw.training_sweatshirt||null,tracksuit_jacket:raw.tracksuit_jacket||null,tracksuit_trousers:raw.tracksuit_trousers||null,polo:raw.polo||null};
  try{
    if(!staffData.name) throw new Error("El nombre es obligatorio");
    let staffId=id;
    if(id){const r=await sb.from("staff").update(staffData).eq("id",id).select("id").single();if(r.error)throw r.error;staffId=r.data.id}
    else{const r=await sb.from("staff").insert(staffData).select("id").single();if(r.error)throw r.error;staffId=r.data.id}
    const sizeResult=await sb.from("staff_sizes").upsert({staff_id:staffId,...sizeData},{onConflict:"staff_id"});
    if(sizeResult.error){console.warn("Tallaje no guardado",sizeResult.error);toast("Miembro creado; el tallaje queda pendiente de reparar")}
    else toast("Miembro guardado correctamente");
    savePersonCustomClothingSizes("staff",staffId,collectCustomClothingValues(staffForm,"staff"));
    setStaffKitStatus(staffId,{sized:raw.sized||"No",delivered:raw.delivered||"No"});
    staffDialog.close();
    await loadAll();
  }catch(error){console.error(error);toast("Cuerpo técnico: "+(error.message||"No se pudo guardar"))}
}

const PITCH_TEAM_DEFAULTS=[
  {keys:["cadete a","cadete b","infantil a","infantil b"],field:"La Menacha",training:1.90,match:3.80},
  {keys:["alevin a","alevin b","prebenjamin","escuela"],field:"Montepalma",training:12.50,match:37.50}
];
const PITCH_EXPECTED_TEAM_LABELS=["Cadete A","Cadete B","Infantil A","Infantil B","Alevín A","Alevín B","Prebenjamín","Escuela"];
function pitchTeamKey(value){return alphaText(value).toLowerCase().replace(/[^a-z0-9]+/g,"").replace(/^cdsb/,"")}
function pitchTeamNames(extra=[]){
  const names=sortTeamsAlpha(teams).map(t=>String(t?.name||"").trim()).filter(Boolean);
  for(const label of PITCH_EXPECTED_TEAM_LABELS){
    const lk=pitchTeamKey(label);
    if(!names.some(name=>{const nk=pitchTeamKey(name);return nk===lk||nk.endsWith(lk)||nk.includes(lk)}))names.push(label);
  }
  for(const value of extra){const name=String(value||"").trim();if(name&&!names.includes(name))names.push(name)}
  return [...new Set(names)].sort((a,b)=>a.localeCompare(b,"es",{sensitivity:"base"}));
}
function pitchDefaultsForTeam(teamName){
  const key=pitchTeamKey(teamName);
  for(const group of PITCH_TEAM_DEFAULTS){
    if(group.keys.some(k=>key.endsWith(pitchTeamKey(k))))return group;
  }
  return null;
}
function pitchDefaultAmount(teamName,type){
  const cfg=pitchDefaultsForTeam(teamName);if(!cfg)return type==="Partido"?0:0;
  return type==="Partido"?cfg.match:cfg.training;
}
function applyPitchFormDefaults(forceAmount=true){
  const teamName=pitchForm?.team_name?.value||"",type=pitchForm?.usage_type?.value||"Entrenamiento";
  const cfg=pitchDefaultsForTeam(teamName);if(!cfg)return;
  if(pitchForm.field_name)pitchForm.field_name.value=cfg.field;
  if(forceAmount&&pitchForm.amount)pitchForm.amount.value=pitchDefaultAmount(teamName,type).toFixed(2);
}
function pitchIsCancelled(x){return x?.cancelled===true||String(x?.cancelled).toLowerCase()==="true"}
function pitchFieldNames(){
  return [...new Set(pitchUsage.map(x=>String(x.field_name||"").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"es",{sensitivity:"base"}));
}
function pitchFilteredRows(){
  const ym=pitchMonth?.value||"",tf=pitchTeamFilter?.value||"",ff=pitchFieldFilter?.value||"";
  return pitchUsage.filter(x=>(!ym||x.usage_date?.startsWith(ym))&&(!tf||x.team_name===tf)&&(!ff||x.field_name===ff));
}
function renderPitches(){
 const tf=pitchTeamFilter?.value||"",ff=pitchFieldFilter?.value||"";
 if(pitchTeamFilter){pitchTeamFilter.innerHTML='<option value="">Todos los equipos</option>'+pitchTeamNames().map(name=>`<option>${esc(name)}</option>`).join("");pitchTeamFilter.value=tf;}
 if(pitchFieldFilter){pitchFieldFilter.innerHTML='<option value="">Todos los campos</option>'+pitchFieldNames().map(name=>`<option>${esc(name)}</option>`).join("");pitchFieldFilter.value=ff;}
 const list=pitchFilteredRows();
 const active=list.filter(x=>!pitchIsCancelled(x));
 pitchTrainings.textContent=active.filter(x=>x.usage_type==="Entrenamiento").length;
 pitchMatches.textContent=active.filter(x=>x.usage_type==="Partido").length;
 if(pitchCancelled)pitchCancelled.textContent=list.filter(pitchIsCancelled).length;
 pitchTotal.textContent=euro(active.reduce((s,x)=>s+Number(x.amount||0),0));
 pitchesBody.innerHTML=list.map(x=>{
   const cancelled=pitchIsCancelled(x),fixed=x.is_fixed===true||String(x.is_fixed).toLowerCase()==="true";
   const time=x.usage_time?String(x.usage_time).slice(0,5):"-";
   return `<tr class="${cancelled?"pitch-row-cancelled":""}"><td>${new Date(x.usage_date+"T12:00:00").toLocaleDateString("es-ES")}</td><td><strong>${time}</strong></td><td>${esc(x.team_name||"")} ${fixed?'<span class="pitch-origin">Horario fijo</span>':'<span class="pitch-origin">Registro manual</span>'}</td><td>${esc(x.usage_type||"")}</td><td>${esc(x.field_name||"-")}</td><td><strong>${cancelled?"0,00 €":euro(x.amount)}</strong></td><td><span class="pitch-status ${cancelled?"cancelled":"active"}">${cancelled?"⊘ Anulado":"✓ Activo"}</span></td><td><div class="pitch-actions"><button class="mini" onclick="editPitch('${x.id}')">Editar</button><button class="mini ${cancelled?"success-soft":"danger-soft"}" onclick="togglePitchCancelled('${x.id}')">${cancelled?"Reactivar":"Anular"}</button></div></td></tr>`
 }).join("")||'<tr><td colspan="8">Sin registros para este filtro.</td></tr>'
}
async function exportPitchesPDF(){
  const list=pitchFilteredRows();
  if(!list.length)return toast("No hay registros para exportar con estos filtros");
  if(!window.jspdf?.jsPDF)return toast("No se pudo cargar el generador PDF");
  const {jsPDF}=window.jspdf;
  const doc=new jsPDF({orientation:"landscape",unit:"mm",format:"a4"});
  const width=doc.internal.pageSize.getWidth();
  doc.setFillColor(8,42,78);doc.rect(0,0,width,30,"F");
  doc.setTextColor(255,255,255);doc.setFont(undefined,"bold");doc.setFontSize(16);doc.text("CD SAN BERNABÉ · PISTAS Y CAMPOS",10,12);
  doc.setFont(undefined,"normal");doc.setFontSize(9);doc.text(`Temporada ${activeClubSeason?.name||"2026/27"} · ${new Date().toLocaleDateString("es-ES")}`,10,20);
  const filters=[];
  if(pitchMonth?.value)filters.push(`Mes: ${pitchMonth.value}`);else filters.push("Todos los meses");
  if(pitchTeamFilter?.value)filters.push(`Equipo: ${pitchTeamFilter.value}`);
  if(pitchFieldFilter?.value)filters.push(`Campo: ${pitchFieldFilter.value}`);else filters.push("Todos los campos");
  doc.text(filters.join(" · "),10,26);
  const active=list.filter(x=>!pitchIsCancelled(x));
  const total=active.reduce((s,x)=>s+Number(x.amount||0),0);
  doc.autoTable({
    startY:35,theme:"grid",
    head:[["Fecha","Hora","Equipo","Tipo","Campo","Importe","Estado","Origen"]],
    body:list.map(x=>{
      const cancelled=pitchIsCancelled(x),fixed=x.is_fixed===true||String(x.is_fixed).toLowerCase()==="true";
      return [new Date(x.usage_date+"T12:00:00").toLocaleDateString("es-ES"),x.usage_time?String(x.usage_time).slice(0,5):"-",x.team_name||"",x.usage_type||"",x.field_name||"-",cancelled?"0,00 €":euro(x.amount),cancelled?"Anulado":"Activo",fixed?"Horario fijo":"Manual"];
    }),
    styles:{fontSize:7.5,cellPadding:1.7,valign:"middle"},
    headStyles:{fillColor:[17,93,151],textColor:255,fontStyle:"bold"},
    alternateRowStyles:{fillColor:[244,248,251]},margin:{left:8,right:8,bottom:15},
    didDrawPage:()=>{doc.setTextColor(90);doc.setFontSize(7);doc.text(`Registros: ${list.length} · Activos: ${active.length} · Total: ${euro(total)}`,8,doc.internal.pageSize.getHeight()-7);doc.text(`Página ${doc.internal.getNumberOfPages()}`,doc.internal.pageSize.getWidth()-22,doc.internal.pageSize.getHeight()-7);}
  });
  const suffix=[pitchMonth?.value||"todos",pitchFieldFilter?.value||"todos-los-campos"].join("_").replace(/[^a-zA-Z0-9_-]+/g,"-");
  doc.save(`pistas_${suffix}.pdf`);
}
pitchMonth.onchange=renderPitches;
if(pitchAllMonths)pitchAllMonths.onclick=()=>{pitchMonth.value="";renderPitches()};
pitchTeamFilter.onchange=renderPitches;
if(pitchFieldFilter)pitchFieldFilter.onchange=renderPitches;
if(pitchPdf)pitchPdf.onclick=exportPitchesPDF;
addPitch.onclick=()=>{
  pitchForm.reset();pitchForm.usage_date.value=new Date().toISOString().slice(0,10);
  pitchForm.team_name.innerHTML=pitchTeamNames().map(name=>`<option>${esc(name)}</option>`).join("");
  applyPitchFormDefaults(true);pitchDialog.showModal()
}
pitchForm.usage_type.onchange=()=>applyPitchFormDefaults(true);
pitchForm.team_name.onchange=()=>applyPitchFormDefaults(true);
window.editPitch=id=>{
  const x=pitchUsage.find(v=>v.id===id);if(!x)return toast("Registro no encontrado");
  pitchForm.reset();pitchForm.team_name.innerHTML=pitchTeamNames([x.team_name]).map(name=>`<option>${esc(name)}</option>`).join("");
  Object.entries(x).forEach(([k,v])=>{if(pitchForm.elements[k])pitchForm.elements[k].value=v??""});pitchDialog.showModal()
}
window.togglePitchCancelled=async id=>{
  const x=pitchUsage.find(v=>v.id===id);if(!x)return toast("Registro no encontrado");
  const cancelled=pitchIsCancelled(x);
  const restoredAmount=Number(x.default_amount??pitchDefaultAmount(x.team_name,x.usage_type)??x.amount??0);
  const payload=cancelled?{cancelled:false,amount:restoredAmount}:{cancelled:true,default_amount:Number(x.default_amount??x.amount??pitchDefaultAmount(x.team_name,x.usage_type)??0),amount:0};
  try{
    const r=await sb.from("pitch_usage").update(payload).eq("id",id);if(r.error)throw r.error;
    toast(cancelled?"Registro reactivado":"Registro anulado");await loadAll();
  }catch(error){
    if(/cancelled|default_amount|schema cache|column/i.test(error?.message||"")){
      showOperationError("Para anular registros debes ejecutar primero el SQL de la V27.2.40.",error)
    }else showOperationError("No se pudo cambiar el estado del registro.",error)
  }
}
pitchForm.onsubmit=async e=>{
  e.preventDefault();const d=Object.fromEntries(new FormData(pitchForm));d.amount=Number(d.amount);const id=d.id;delete d.id;
  const cfg=pitchDefaultsForTeam(d.team_name);if(cfg&&!d.field_name)d.field_name=cfg.field;
  const existing=id?pitchUsage.find(v=>v.id===id):null;
  d.default_amount=Number(d.amount||0);
  if(existing&&pitchIsCancelled(existing)){d.cancelled=true;d.amount=0}
  try{
    const r=id?await sb.from("pitch_usage").update(d).eq("id",id):await sb.from("pitch_usage").insert(d);if(r.error)throw r.error;
    pitchDialog.close();toast("Uso registrado");await loadAll()
  }catch(error){showOperationError("No se pudo guardar el uso de pista.",error)}
}

function renderFinance(){
 const ym=financeMonth.value||"",tf=financeTypeFilter.value;
 const list=financeMovementsForActivePlayers().filter(x=>(!ym||x.movement_date?.startsWith(ym))&&(!tf||x.movement_type===tf));
 const inc=list.filter(x=>x.movement_type==="Ingreso").reduce((s,x)=>s+Number(x.amount||0),0),exp=list.filter(x=>x.movement_type==="Gasto").reduce((s,x)=>s+Number(x.amount||0),0);
 financeIncome.textContent=euro(inc);financeExpense.textContent=euro(exp);financeBalance.textContent=euro(inc-exp);
 financeBody.innerHTML=list.map(x=>`<tr><td>${new Date(x.movement_date+"T12:00:00").toLocaleDateString("es-ES")}</td><td>${badge(x.movement_type==="Ingreso"?"Aprobada":"Pendiente").replace(x.movement_type==="Ingreso"?"Aprobada":"Pendiente",x.movement_type)}</td><td>${x.category}</td><td>${x.concept}</td><td><strong>${euro(x.amount)}</strong></td><td>${x.payment_method||"-"}</td><td>${x.source_payment_id?'<span class="auto-income-badge">Automático</span>':`<button class="mini" onclick="editMovement('${x.id}')">Editar</button>`}</td></tr>`).join("")||'<tr><td colspan="7">Sin movimientos.</td></tr>'
}
financeMonth.onchange=renderFinance;financeTypeFilter.onchange=renderFinance;document.getElementById("financeAllMonths")?.addEventListener("click",()=>{financeMonth.value="";renderFinance();});
addMovement.onclick=()=>{movementForm.reset();movementForm.movement_date.value=new Date().toISOString().slice(0,10);movementDialog.showModal()}
window.editMovement=id=>{const x=financeMovements.find(v=>v.id===id);movementForm.reset();Object.entries(x).forEach(([k,v])=>{if(movementForm.elements[k])movementForm.elements[k].value=v??""});movementDialog.showModal()}
movementForm.onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(movementForm));d.amount=Number(d.amount);const id=d.id;delete d.id;try{const r=id?await sb.from("finance_movements").update(d).eq("id",id):await sb.from("finance_movements").insert(d);if(r.error)throw r.error;movementDialog.close();toast("Movimiento guardado");await loadAll()}catch(error){showOperationError("No se pudo guardar el movimiento.",error)}}

function downloadCSV(name,rows){if(!rows.length)return toast("No hay datos");const h=Object.keys(rows[0]),q=v=>`"${String(v??"").replaceAll('"','""')}"`;const csv=[h.join(";"),...rows.map(r=>h.map(k=>q(r[k])).join(";"))].join("\n");const b=new Blob(["\ufeff"+csv],{type:"text/csv"}),a=document.createElement("a");a.href=URL.createObjectURL(b);a.download=name;a.click();URL.revokeObjectURL(a.href)}
rPlayers.onclick=()=>downloadCSV("jugadores.csv",sortPlayersAlpha(players).map(p=>({Jugador:`${p.name} ${p.surname}`,Equipo:p.team,Tutor:p.guardian,Telefono:p.phone,Email:p.email,Estado:p.status})));
rPayments.onclick=()=>downloadCSV("cobros_pendientes.csv",sortPlayersAlpha(players.filter(p=>pending(p.id)>0)).map(p=>({Jugador:`${p.name} ${p.surname}`,Equipo:p.team,Pagado:totalPaid(p.id),Pendiente:pending(p.id)})));
rSizes.onclick=()=>downloadCSV("tallajes_jugadores.csv",sortPlayersAlpha(players).map(p=>{const s=sizeFor(p.id);return {Jugador:`${p.name} ${p.surname}`,Equipo:p.team,CamisetaPrimeraJugador:s.game_shirt,CamisetaPrimeraPortero:s.game_shirt_goalkeeper,PantalonEquipacionJugador:s.game_shorts,PantalonEquipacionPortero:s.game_shorts_goalkeeper,CamisetaSegundaJugador:s.second_shirt_player,MediasJugador:s.socks,MediasPortero:s.socks_goalkeeper,CamisetaEntrenoJugador:s.training_shirt,CamisetaEntrenoPortero:s.training_shirt_goalkeeper,PantalonEntrenoJugador:s.training_shorts,PantalonEntrenoPortero:s.training_shorts_goalkeeper,Sudadera:s.training_sweatshirt,ChaquetaChandal:s.tracksuit_jacket,PantalonChandal:s.tracksuit_trousers,Mochila:"Incluida"}}));
if(window.rStaffSizes)rStaffSizes.onclick=()=>downloadCSV("tallajes_cuerpo_tecnico.csv",sortStaffAlpha(staff).map(s=>{const z=staffSizeFor(s.id);return {Nombre:s.name,Cargo:s.role,Equipo:s.team_name,CamisetaEntreno:z.training_shirt,PantalonEntreno:z.training_shorts,Sudadera:z.training_sweatshirt,ChaquetaChandal:z.tracksuit_jacket,PantalonChandal:z.tracksuit_trousers,Polo:z.polo,Mochila:"Incluida"}}));
rDocs.onclick=()=>downloadCSV("documentacion_pendiente.csv",sortPlayersAlpha(players.filter(p=>docState(p.id)==="Incompleta")).map(p=>{const d=docs(p.id);return {Jugador:`${p.name} ${p.surname}`,Equipo:p.team||"Sin equipo",DNIJugador:d.player_dni_status,Foto:d.photo_status,Reconocimiento:d.medical_status}}));
rPitches.onclick=()=>downloadCSV("pistas.csv",pitchUsage.map(x=>({Fecha:x.usage_date,Hora:x.usage_time||"",Equipo:x.team_name,Tipo:x.usage_type,Campo:x.field_name,Importe:x.amount,Estado:pitchIsCancelled(x)?"Anulado":"Activo",Origen:(x.is_fixed===true||String(x.is_fixed).toLowerCase()==="true")?"Horario fijo":"Manual"})));
rFinance.onclick=()=>downloadCSV("ingresos_gastos.csv",financeMovementsForActivePlayers().map(x=>({Fecha:x.movement_date,Tipo:x.movement_type,Categoria:x.category,Concepto:x.concept,Importe:x.amount,FormaPago:x.payment_method})));
rPrint.onclick=()=>window.print();

document.getElementById("search")?.addEventListener("input",renderPlayers);document.getElementById("statusFilter")?.addEventListener("change",renderPlayers);
paymentsTeamFilter?.addEventListener("change",renderPayments);
clearPaymentsTeamFilter?.addEventListener("click",()=>{if(paymentsTeamFilter)paymentsTeamFilter.value="";renderPayments()});
documentsTeamFilter?.addEventListener("change",renderDocuments);
clearDocumentsTeamFilter?.addEventListener("click",()=>{if(documentsTeamFilter)documentsTeamFilter.value="";renderDocuments()});
function preparePlayerTeamSelect(selected=""){
  const field=playerFormEl?.elements?.team;
  if(!field)return;
  field.innerHTML='<option value="">Seleccionar equipo</option>'+sortTeamsAlpha(teams).map(t=>`<option value="${String(t.name).replace(/"/g,"&quot;")}">${t.name}</option>`).join("");
  field.value=selected||"";
}
function preparePlayerSizeSelects(values={}){
  if(!playerFormEl)return;
  PLAYER_NATIVE_SIZE_FIELDS.forEach(name=>{
    const field=playerFormEl.elements[name];if(!field)return;fillSelect(field,PLAYER_SIZES);field.value=values[name]||"";
  });
  PLAYER_SOCK_FIELDS.forEach(name=>{
    const field=playerFormEl.elements[name];if(!field)return;fillSelect(field,SOCK_SIZES);field.value=values[name]||"";
  });
}
function showExistingPlayerFiles(playerId){
  const d=docs(playerId);
  const p=players.find(x=>x.id===playerId)||{};
  const set=(id,path,label)=>{const el=document.getElementById(id);if(!el)return;el.textContent=path?`Adjunto actual: ${label}`:""};
  set("currentPhotoFile",p.photo_path||d.photo_path,"fotografía");
  set("currentPlayerDniFile",d.player_dni_path,"DNI / libro de familia");
  set("currentMedicalFile",d.medical_path,"reconocimiento médico");
}
function openNewPlayerForm(){
  if(!playerFormEl||!playerDialogEl){
    toast("No se encuentra el formulario de jugadores");
    return;
  }
  playerFormEl.reset();
  if(playerFormEl.elements.id)playerFormEl.elements.id.value="";
  deletePlayerFromForm?.classList.add("hidden");
  deletePlayerFromForm?.removeAttribute("data-player-id");
  preparePlayerTeamSelect();
  preparePlayerSizeSelects();
  showExistingPlayerFiles(null);
  playerDialogEl.showModal();
}
headerAddPlayerEl?.addEventListener("click",openNewPlayerForm);
playersAddPlayerEl?.addEventListener("click",openNewPlayerForm);

window.editPlayer=id=>{
  const p=players.find(x=>x.id===id);if(!p)return toast("Jugador no encontrado");
  if(!playerFormEl||!playerDialogEl)return toast("No se encuentra el formulario de jugadores");
  playerFormEl.reset();preparePlayerTeamSelect(p.team);preparePlayerSizeSelects(sizeFor(id));
  deletePlayerFromForm?.classList.remove("hidden");
  deletePlayerFromForm?.setAttribute("data-player-id",id);
  ["id","name","surname","birth_date","player_dni","status","guardian","phone","email","address","notes"].forEach(k=>{if(playerFormEl.elements[k])playerFormEl.elements[k].value=p[k]??""});
  showExistingPlayerFiles(id);playerDialogEl.showModal()
};

function supabaseErrorText(err){
  if(!err)return "Error desconocido";
  return [err.message,err.details,err.hint,err.code].filter(Boolean).join(" | ");
}

function showOperationError(title,error){
  const detail=supabaseErrorText(error);
  console.error(title,error);
  alert(`${title}\n\n${detail}`);
}

if(playerFormEl)playerFormEl.onsubmit=async e=>{
  e.preventDefault();
  const submit=playerFormEl.querySelector('button[type="submit"]');
  const original=submit?.textContent||"Guardar";
  if(submit){submit.disabled=true;submit.textContent="Guardando..."}
  const fd=new FormData(playerFormEl),raw=Object.fromEntries(fd),editingId=raw.id||null;
  const playerData={
    name:(raw.name||"").trim(),surname:(raw.surname||"").trim(),birth_date:raw.birth_date||null,
    player_dni:(raw.player_dni||"").trim()||null,team:raw.team||null,status:raw.status||"Pendiente revisión",
    guardian:(raw.guardian||"").trim()||null,
    phone:(raw.phone||"").trim()||null,email:(raw.email||"").trim()||null,address:(raw.address||"").trim()||null,notes:(raw.notes||"").trim()||null
  };
  const sizeData={game_shirt:raw.game_shirt||null,game_shirt_goalkeeper:raw.game_shirt_goalkeeper||null,game_shorts:raw.game_shorts||null,game_shorts_goalkeeper:raw.game_shorts_goalkeeper||null,second_shirt_player:raw.second_shirt_player||null,socks:raw.socks||null,socks_goalkeeper:raw.socks_goalkeeper||null,training_shirt:raw.training_shirt||null,training_shirt_goalkeeper:raw.training_shirt_goalkeeper||null,training_shorts:raw.training_shorts||null,training_shorts_goalkeeper:raw.training_shorts_goalkeeper||null,training_sweatshirt:raw.training_sweatshirt||null,tracksuit_jacket:raw.tracksuit_jacket||null,tracksuit_trousers:raw.tracksuit_trousers||null};

  try{
    if(!playerData.name||!playerData.surname)throw new Error("Nombre y apellidos son obligatorios");

    let playerId=editingId;
    if(editingId){
      const r=await sb.from("players").update(playerData).eq("id",editingId).select("id").single();
      if(r.error)throw new Error("PLAYERS UPDATE: "+supabaseErrorText(r.error));
      playerId=r.data.id;
    }else{
      const r=await sb.from("players").insert(playerData).select("id").single();
      if(r.error)throw new Error("PLAYERS INSERT: "+supabaseErrorText(r.error));
      playerId=r.data.id;
    }

    const warnings=[];
    const existing=docs(playerId);
    const photoFile=fd.get("photo_file"),playerDniFile=fd.get("player_dni_file"),medicalFile=fd.get("medical_file");
    const docData={player_id:playerId,
      player_dni_status:existing.player_dni_status||"Pendiente",guardian_dni_status:"No requerido",photo_status:existing.photo_status||"Pendiente",medical_status:existing.medical_status||"Pendiente",
      player_dni_path:existing.player_dni_path||null,guardian_dni_path:existing.guardian_dni_path||null,photo_path:existing.photo_path||null,medical_path:existing.medical_path||null};

    try{
      if(photoFile?.name){
        const path=await uploadPrivate(photoFile,`players/${playerId}/photo`);
        docData.photo_path=path;docData.photo_status="Recibido";
        const u=await sb.from("players").update({photo_path:path}).eq("id",playerId);
        if(u.error)throw u.error;
      }
      if(playerDniFile?.name){docData.player_dni_path=await uploadPrivate(playerDniFile,`players/${playerId}/dni`);docData.player_dni_status="Recibido"}
      if(medicalFile?.name){docData.medical_path=await uploadPrivate(medicalFile,`players/${playerId}/medical`);docData.medical_status="Recibido"}
      const dres=await sb.from("documents").upsert(docData,{onConflict:"player_id"});
      if(dres.error)throw dres.error;
    }catch(auxErr){warnings.push("Documentos: "+supabaseErrorText(auxErr))}

    try{
      const sres=await sb.from("player_sizes").upsert({player_id:playerId,...sizeData,sized:Object.values(sizeData).some(Boolean)?"Sí":"No"},{onConflict:"player_id"});
      if(sres.error)throw sres.error;
    }catch(auxErr){warnings.push("Tallaje: "+supabaseErrorText(auxErr))}

    try{
      const kres=await sb.from("kits").upsert({player_id:playerId,sized:Object.values(sizeData).some(Boolean)?"Sí":"No",delivered:kit(playerId).delivered||"No",delivery_date:kit(playerId).delivery_date||null},{onConflict:"player_id"});
      if(kres.error)throw kres.error;
    }catch(auxErr){warnings.push("Equipación: "+supabaseErrorText(auxErr))}

    if(!editingId){
      try{
        const pres=await sb.from("payments").upsert([
          {player_id:playerId,concept:"registration",status:"Pendiente",amount:0},
          {player_id:playerId,concept:"sizing",status:"Pendiente",amount:0},
          {player_id:playerId,concept:"clothing",status:"Pendiente",amount:0}
        ],{onConflict:"player_id,concept"});
        if(pres.error)throw pres.error;
      }catch(auxErr){warnings.push("Pagos: "+supabaseErrorText(auxErr))}
    }

    await logActivity(editingId?"actualizar":"crear","jugador",playerId,`${editingId?"Jugador actualizado":"Jugador creado"}: ${playerData.name} ${playerData.surname}`);
    playerDialogEl.close();
    await loadAll();
    if(warnings.length){
      console.warn("Jugador guardado con avisos",warnings);
      alert((editingId?"Jugador actualizado":"Jugador creado correctamente")+"\n\nAvisos secundarios:\n"+warnings.join("\n"));
    }else{
      toast(editingId?"Jugador actualizado":"Jugador creado correctamente");
    }
  }catch(err){
    showOperationError("No se pudo guardar el jugador.",err);
  }finally{
    if(submit){submit.disabled=false;submit.textContent=original}
  }
};
paymentForm.elements.concept?.addEventListener("change",syncPaymentAmount);
paymentForm.elements.status?.addEventListener("change",syncPaymentAmount);
window.openPayment=id=>{
  paymentForm.reset();
  paymentForm.player_id.value=id;
  paymentForm.elements.concept.value="registration";
  paymentForm.elements.status.value="Pagado";
  paymentForm.paid_at.value=new Date().toISOString().slice(0,10);
  existingReceipt.classList.add("hidden");
  syncPaymentAmount();
  paymentDialog.showModal();
};
paymentForm.onsubmit=async e=>{
  e.preventDefault();
  const fd=new FormData(paymentForm);
  const d=Object.fromEntries(fd);
  delete d.receipt_file;
  d.amount=Number(d.amount||0);
  const standard=standardPaymentAmount(d.concept);
  if(d.status==="Parcial"&&(d.amount<=0||d.amount>=standard)){
    alert(`Para un cobro parcial introduce una cantidad mayor que 0 € y menor que ${standard.toFixed(2)} €.`);
    paymentForm.elements.amount.focus();
    return;
  }
  try{
    const file=fd.get("receipt_file");
    if(file&&file.name)d.receipt_path=await uploadPrivate(file,`payments/${d.player_id}/${d.concept}`);
    const {error}=await sb.from("payments").upsert(d,{onConflict:"player_id,concept"});
    if(error)throw error;
    paymentDialog.close();
    toast("Cobro guardado y añadido automáticamente a Ingresos");
    await loadAll();
  }catch(error){showOperationError("No se pudo guardar el cobro.",error)}
};
window.openDocs=id=>{const d=docs(id);documentForm.player_id.value=id;["player_dni_status","photo_status","medical_status"].forEach(k=>documentForm.elements[k].value=d[k]||"Pendiente");documentDialog.showModal()};
documentForm.onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(documentForm));d.guardian_dni_status="No requerido";try{const {error}=await sb.from("documents").upsert(d,{onConflict:"player_id"});if(error)throw error;documentDialog.close();toast("Documentación guardada");await loadAll()}catch(error){showOperationError("No se pudo guardar la documentación.",error)}};
copyUrl.onclick=async()=>{await navigator.clipboard.writeText(publicUrl.textContent);toast("Enlace copiado")};

function renderTrash(){
  if(trashPlayers){
    const orderedDeletedPlayers=sortPlayersAlpha(deletedPlayers);
    trashPlayers.innerHTML=orderedDeletedPlayers.length?orderedDeletedPlayers.map(p=>`
      <article class="trash-item">
        <div><strong>${esc(p.name||"")} ${esc(p.surname||"")}</strong><small>${esc(p.team||"Sin equipo")} · Eliminado ${activityDate(p.deleted_at)}</small></div>
        <button class="primary small" onclick="restorePlayer('${p.id}')">Restaurar</button>
      </article>`).join(""):'<div class="empty-state">No hay jugadores en la papelera.</div>';
  }
  if(trashTeams){
    const orderedDeletedTeams=sortTeamsAlpha(deletedTeams);
    trashTeams.innerHTML=orderedDeletedTeams.length?orderedDeletedTeams.map(t=>`
      <article class="trash-item">
        <div><strong>${esc(t.name||"")}</strong><small>${esc(t.category||"Sin categoría")} · Eliminado ${activityDate(t.deleted_at)}</small></div>
        <button class="primary small" onclick="restoreTeam('${t.id}')">Restaurar</button>
      </article>`).join(""):'<div class="empty-state">No hay equipos en la papelera.</div>';
  }
}
window.restorePlayer=async id=>{
  const p=deletedPlayers.find(x=>x.id===id);
  if(!p)return toast("Jugador no encontrado en la papelera");
  const {error}=await sb.from("players").update({deleted_at:null}).eq("id",id);
  if(error)return showOperationError("No se pudo restaurar el jugador.",error);
  await logActivity("restaurar","jugador",id,`Jugador restaurado: ${p.name||""} ${p.surname||""}`);
  toast("Jugador restaurado correctamente");
  await loadAll();
};
window.restoreTeam=async id=>{
  const t=deletedTeams.find(x=>x.id===id);
  if(!t)return toast("Equipo no encontrado en la papelera");
  const {error}=await sb.from("teams").update({deleted_at:null}).eq("id",id);
  if(error)return showOperationError("No se pudo restaurar el equipo.",error);
  await logActivity("restaurar","equipo",id,`Equipo restaurado: ${t.name||""}`);
  toast("Equipo restaurado correctamente");
  await loadAll();
};
function activityIcon(action){
  return ({crear:"＋",actualizar:"✎",eliminar:"♻",restaurar:"↺",copia:"⬇"})[action]||"•";
}
function activityMarkup(log){
  return `<article class="activity-item">
    <span class="activity-icon">${activityIcon(log.action)}</span>
    <div><strong>${esc(log.description||log.action||"Actividad")}</strong><small>${esc(log.user_email||"Usuario")} · ${activityDate(log.created_at)}</small></div>
  </article>`;
}
function renderActivity(){
  if(activityList)activityList.innerHTML=activityLogs.length?activityLogs.map(activityMarkup).join(""):'<div class="empty-state">Todavía no hay actividad registrada.</div>';
  if(dashboardActivity)dashboardActivity.innerHTML=activityLogs.length?activityLogs.slice(0,6).map(activityMarkup).join(""):'<div class="empty-state">Todavía no hay actividad registrada.</div>';
}
async function createFullBackup(){
  if(!createBackup)return;
  const original=createBackup.textContent;
  createBackup.disabled=true;createBackup.textContent="Preparando copia...";
  try{
    const tables=["players","teams","payments","documents","kits","player_sizes","staff","staff_sizes","events","pitch_usage","finance_movements","activity_logs","sports_training_sessions","sports_training_attendance","sports_matches","sports_match_player_stats","team_player_cards","club_seasons","season_team_player_cards"];
    const backup={application:"CD San Bernabé Manager",version:"V27.2.10",created_at:new Date().toISOString(),tables:{}};
    for(const table of tables){
      const {data,error}=await sb.from(table).select("*");
      if(error)throw new Error(`${table}: ${supabaseErrorText(error)}`);
      backup.tables[table]=data||[];
    }
    const blob=new Blob([JSON.stringify(backup,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    const stamp=new Date().toISOString().slice(0,10);
    a.href=url;a.download=`CDSB_copia_seguridad_${stamp}.json`;
    document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
    localStorage.setItem("cdsb_last_backup",new Date().toISOString());
    if(backupStatus)backupStatus.textContent=`Última copia: ${new Date().toLocaleString("es-ES")}`;
    await logActivity("copia","sistema",null,"Copia de seguridad completa descargada");
    toast("Copia de seguridad descargada");
    await loadTrashAndActivity();renderActivity();
  }catch(error){showOperationError("No se pudo crear la copia de seguridad.",error)}
  finally{createBackup.disabled=false;createBackup.textContent=original}
}
refreshTrash?.addEventListener("click",async()=>{await loadTrashAndActivity();renderTrash();toast("Papelera actualizada")});
refreshActivity?.addEventListener("click",async()=>{await loadTrashAndActivity();renderActivity();toast("Actividad actualizada")});
createBackup?.addEventListener("click",createFullBackup);
const lastBackup=localStorage.getItem("cdsb_last_backup");
if(lastBackup&&backupStatus)backupStatus.textContent=`Última copia en este dispositivo: ${new Date(lastBackup).toLocaleString("es-ES")}`;

function realtime(){
  if(channel)return channel;
  channel=sb.channel("club-live").on("postgres_changes",{event:"*",schema:"public"},async payload=>{
    if(payload?.table==="club_seasons"){
      const wasHistorical=isHistoricalSeason();
      const previousActiveId=activeClubSeason?.id||null;
      await loadClubSeasons();
      if(!wasHistorical&&activeClubSeason?.id&&String(activeClubSeason.id)!==String(previousActiveId)){
        localStorage.removeItem(SEASON_SELECTED_KEY);
        setSeasonState(activeClubSeason);renderSeasonSelector();renderSeasonsManager();
        await loadActiveSeasonData();
        toast(`Temporada ${activeClubSeason.name} activada`);
      }
      return;
    }
    if(isHistoricalSeason())return;
    await loadAll();await window.sportsV2700?.load?.();
  }).subscribe();
  return channel;
}
async function start(){
  await loadCurrentAccess();
  await loadClubSeasons();
  if(isTechnicalReadOnly()){setSeasonState(activeClubSeason);renderSeasonSelector()}
  if(isHistoricalSeason())await loadArchivedSeason(selectedClubSeason);else{await loadAll();await window.sportsV2700?.load?.()}
  await applyCurrentAccess();
  renderSeasonsManager();
  if(!isTechnicalReadOnly()&&!isHistoricalSeason())realtime();
}


// Instalación como aplicación (PWA)
let deferredInstallPrompt = null;
const installButton = document.getElementById("installApp");

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  if (installButton) installButton.classList.remove("hidden");
});

if (installButton) {
  installButton.addEventListener("click", async () => {
    if (!deferredInstallPrompt) {
      toast("En iPhone: Compartir → Añadir a pantalla de inicio");
      return;
    }
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    installButton.classList.add("hidden");
  });
}

window.addEventListener("appinstalled", () => {
  if (installButton) installButton.classList.add("hidden");
  toast("Aplicación instalada correctamente");
});

window.deletePlayer=async id=>{
  const p=players.find(x=>x.id===id);
  if(!p)return toast("Jugador no encontrado");
  if(!confirm(`¿Enviar a la papelera a ${p.name||""} ${p.surname||""}?

Podrás recuperarlo posteriormente.`))return;
  const {error}=await sb.from("players").update({deleted_at:new Date().toISOString()}).eq("id",id);
  if(error)return showOperationError("No se pudo enviar el jugador a la papelera.",error);
  await logActivity("eliminar","jugador",id,`Jugador enviado a la papelera: ${p.name||""} ${p.surname||""}`);
  playerDialogEl?.close();
  toast("Jugador enviado a la papelera");
  await loadAll();
};

window.deleteStaff=async id=>{if(!confirm("¿Eliminar este miembro del cuerpo técnico?"))return;const {error}=await sb.from("staff").delete().eq("id",id);if(error)return showOperationError("No se pudo eliminar el miembro.",error);delete staffKitStatus[id];saveStaffKitStatus();delete customStaffClothingSizes[id];saveCustomClothingSizes();toast("Miembro eliminado");await loadAll()};

window.deleteTeam=async id=>{
  const t=teams.find(x=>x.id===id);
  if(!t)return toast("Equipo no encontrado");
  const assigned=players.filter(p=>(p.team||"").trim()===(t.name||"").trim());
  if(assigned.length){
    alert(`No se puede enviar el equipo a la papelera porque tiene ${assigned.length} jugador${assigned.length===1?"":"es"} asignado${assigned.length===1?"":"s"}.

Primero cambia esos jugadores de equipo o envíalos a la papelera.`);
    return;
  }
  if(!confirm(`¿Enviar el equipo "${t.name}" a la papelera?

Podrás recuperarlo posteriormente.`))return;
  const {error}=await sb.from("teams").update({deleted_at:new Date().toISOString()}).eq("id",id);
  if(error)return showOperationError("No se pudo enviar el equipo a la papelera.",error);
  await logActivity("eliminar","equipo",id,`Equipo enviado a la papelera: ${t.name}`);
  teamDialog?.close();
  teamDetailDialog?.close();
  toast("Equipo enviado a la papelera");
  await loadAll();
};

deletePlayerFromForm?.addEventListener("click",()=>{
  const id=deletePlayerFromForm.getAttribute("data-player-id")||playerFormEl?.elements?.id?.value;
  if(id)deletePlayer(id);
});
deleteTeamFromForm?.addEventListener("click",()=>{
  const id=deleteTeamFromForm.getAttribute("data-team-id")||teamForm?.elements?.id?.value;
  if(id)deleteTeam(id);
});
deleteTeamFromDetail?.addEventListener("click",()=>{
  if(currentTeamDetailId)deleteTeam(currentTeamDetailId);
});

window.currentTeamDetailId=null;
window.openTeamDetail=id=>{
  const t=teams.find(x=>x.id===id);
  if(!t)return toast("Equipo no encontrado");
  currentTeamDetailId=id;
  teamDetailTitle.textContent=t.name;
  renderTeamDetailTab("overview");
  if(!teamDetailDialog.open)teamDetailDialog.showModal();
};
window.openTeamSports=(id,tab)=>{
  const t=teams.find(x=>x.id===id);
  if(!t)return toast("Equipo no encontrado");
  currentTeamDetailId=id;
  teamDetailTitle.textContent=t.name;
  renderTeamDetailTab(tab);
  if(!teamDetailDialog.open)teamDetailDialog.showModal();
};

window.renderTeamDetailTab=function(tab){
  window.currentTeamDetailTab=tab;
  const t=teams.find(x=>x.id===currentTeamDetailId);
  if(!t)return;
  const teamMemberKey=value=>String(value??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLowerCase().replace(/\s+/g," ");
  const roster=sortPlayersAlpha(players.filter(p=>{
    if(String(p.team_id||"")&&String(p.team_id)===String(t.id))return true;
    const expected=teamMemberKey(t.name||"");
    return [p.team,p.team_name,p.equipo,p.teamName].some(value=>teamMemberKey(value||"")===expected);
  }));
  const staffList=sortStaffAlpha(staff.filter(s=>(s.team_name||"").trim()===(t.name||"").trim()));
  const coach=staff.find(s=>s.id===t.coach_id)?.name||staffList.find(s=>s.role==="Entrenador")?.name||"Sin asignar";
  const totalPending=roster.reduce((sum,p)=>sum+pending(p.id),0);
  const incompleteDocs=roster.filter(p=>docState(p.id)==="Incompleta").length;
  const pendingKits=roster.filter(p=>kit(p.id).delivered!=="Sí").length;
  const teamAccidentKey=teamMemberKey(t.name||"")
    .replace(/^cdsb\s+/,"")
    .replace(/^cd\s+san\s+bernabe\s+/,"")
    .trim();
  const accidentDocs=(()=>{
    const rfafTeam=["cadete a","cadete b","infantil a","infantil b","alevin a"].some(name=>teamAccidentKey.includes(name));
    const aafbTeam=["alevin b","prebenjamin"].some(name=>teamAccidentKey.includes(name));
    if(rfafTeam)return [{
      title:"Parte de lesiones RFAF",
      description:"Parte oficial de la Mutualidad de Futbolistas para comunicar y tramitar una lesión.",
      file:"assets/accidentes/parte-lesiones-rfaf.pdf",
      badge:"RFAF"
    }];
    if(aafbTeam)return [
      {title:"Parte de accidentes AAFB",description:"Certificado de accidentes para enseñanza y escuelas deportivas de menores.",file:"assets/accidentes/parte-accidentes-aafb.pdf",badge:"AAFB"},
      {title:"Protocolo de accidentes AAFB",description:"Instrucciones de tramitación, centros médicos y teléfonos de asistencia en Algeciras.",file:"assets/accidentes/protocolo-accidentes-aafb-algeciras.pdf",badge:"AAFB"}
    ];
    return [];
  })();
  const tabs=[
    ["overview","Resumen"],["players","Plantilla"],["cards","Tarjetero"],["staff","Cuerpo técnico"],
    ["documents","Documentación"],["payments","Pagos"],["sizes","Tallajes"],["calendar","Calendario"],
    ["sportsAttendance","Asistencia"],["sportsMatches","Partidos y tarjetas"],["sportsStats","Estadísticas"],
    ["reports","Informes"]
  ];
  if(accidentDocs.length)tabs.splice(5,0,["accidents","Accidentes"]);
  const esc=s=>String(s??"-").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  let body="";
  if(tab==="overview") body=`
    <div class="team-detail-hero">
      <div><small>${esc(t.age_category||normalizeSeasonCategory(t.name)||"Sin categoría de edad")}${t.category?` · ${esc(t.category)}`:""}</small><h3>${esc(t.name)}</h3><p>${esc(t.training_schedule||"Horario sin definir")} · ${esc(t.field||"Campo sin definir")}</p></div>
      <button class="primary" onclick="teamDetailDialog.close();openTeamReport('${String(t.name).replace(/'/g,"\\'")}','full')">Generar informe completo</button>
    </div>
    <section class="team-sports-home">
      <div class="team-sports-home-head"><small>GESTIÓN DEPORTIVA</small><h3>Seguimiento del equipo</h3><p>Estas opciones aparecen automáticamente en todos los equipos actuales y nuevos.</p></div>
      <div class="team-sports-home-grid">
        <button type="button" data-sports-action="true" onclick="renderTeamDetailTab('sportsAttendance')"><span>✓</span><div><strong>Control de asistencia</strong><small>Crear entrenamientos y marcar presentes, ausentes, justificadas, lesionados y tardanzas.</small></div><b>Entrar →</b></button>
        <button type="button" data-sports-action="true" onclick="renderTeamDetailTab('sportsMatches')"><span>⚽</span><div><strong>Partidos, minutos y tarjetas</strong><small>Registrar convocatoria, titularidad, minutos jugados y tarjetas de cada jugador.</small></div><b>Entrar →</b></button>
        <button type="button" data-sports-action="true" onclick="renderTeamDetailTab('sportsStats')"><span>▥</span><div><strong>Estadísticas</strong><small>Consultar asistencia, partidos, minutos, tarjetas y datos individuales de la plantilla.</small></div><b>Entrar →</b></button>
      </div>
    </section>
    <div class="team-detail-kpis">
      <article><span>Jugadores</span><strong>${roster.length}</strong></article>
      <article><span>Cuerpo técnico</span><strong>${staffList.length}</strong></article>
      <article><span>Documentos pendientes</span><strong>${incompleteDocs}</strong></article>
      <article><span>Pagos pendientes</span><strong>${euro(totalPending)}</strong></article>
      <article><span>Equipaciones pendientes</span><strong>${pendingKits}</strong></article>
    </div>
    <div class="team-detail-info-grid">
      <article><span>Entrenador</span><strong>${esc(coach)}</strong></article>
      <article><span>Delegado</span><strong>${esc(t.delegate_name||staffList.find(s=>s.role==="Delegado")?.name||"Sin asignar")}</strong></article>
      <article><span>Horario</span><strong>${esc(t.training_schedule||"Sin definir")}</strong></article>
      <article><span>Campo</span><strong>${esc(t.field||"Sin definir")}</strong></article>
    </div>`;
  if(tab==="players") body=roster.length?`<div class="team-roster">${roster.map(p=>`<div class="roster-card"><img src="${signedCache[p.photo_path]||placeholderPhoto}"><div class="roster-meta"><strong>${esc(p.name)} ${esc(p.surname)}</strong><small>${esc(p.birth_date||"Sin fecha")} · ${esc(p.phone||"Sin teléfono")}</small><small>Tutor: ${esc(p.guardian||"-")} · Estado: ${esc(p.status)}</small></div><button class="mini" onclick="editPlayer('${p.id}');teamDetailDialog.close()">Abrir ficha</button></div>`).join("")}</div>`:`<div class="team-tab-empty">Este equipo no tiene jugadores asignados.</div>`;
  if(tab==="cards") body=`<div id="teamCardsPanel" class="team-cards-panel"><div class="team-cards-loading"><span class="team-cards-spinner"></span><strong>Cargando tarjetero...</strong><small>Preparando las fichas del equipo.</small></div></div>`;
  if(tab==="staff") body=staffList.length?`<div class="team-staff-grid">${staffList.map(s=>`<article><div class="team-staff-avatar">${esc((s.name||"?").charAt(0))}</div><div><strong>${esc(s.name)}</strong><span>${esc(s.role||"Sin cargo")}</span><small>${esc(s.phone||"Sin teléfono")} · ${esc(s.email||"Sin email")}</small></div></article>`).join("")}</div>`:`<div class="team-tab-empty">No hay miembros del cuerpo técnico asignados.</div>`;
  if(tab==="documents") body=`<div class="table-wrap team-detail-table"><table><thead><tr><th>Jugador</th><th>DNI / Libro</th><th>Foto</th><th>Médico</th><th>Estado</th><th>Gestión</th></tr></thead><tbody>${roster.map(p=>{const d=docs(p.id);return `<tr><td><strong>${esc(p.surname)}, ${esc(p.name)}</strong></td><td>${documentStatusCell(d.player_dni_status,p.id,"dni")}</td><td>${documentStatusCell(d.photo_status,p.id,"photo")}</td><td>${documentStatusCell(d.medical_status,p.id,"medical")}</td><td><span class="badge ${docState(p.id)==="Completa"?"ok":"warn"}">${docState(p.id)}</span></td><td>${isTechnicalReadOnly()?'<small class="document-file-private">Solo consulta</small>':`<button class="mini" onclick="openDocs('${p.id}')">Actualizar estado</button>`}</td></tr>`}).join("")||'<tr><td colspan="6">Sin jugadores</td></tr>'}</tbody></table></div>`;
  if(tab==="accidents"){
    body=accidentDocs.length?`
      <section class="team-accidents-panel">
        <div class="team-accidents-head">
          <div class="team-accidents-icon">✚</div>
          <div><small>DOCUMENTACIÓN DE ACCIDENTES</small><h3>Partes y protocolo del equipo</h3><p>Consulta el documento necesario y descárgalo para cumplimentarlo cuando se produzca un accidente o lesión.</p></div>
        </div>
        <div class="team-accidents-grid">
          ${accidentDocs.map(doc=>`<article class="team-accident-card">
            <div class="team-accident-card-top"><span class="team-accident-pdf">PDF</span><span class="team-accident-badge">${esc(doc.badge)}</span></div>
            <h4>${esc(doc.title)}</h4>
            <p>${esc(doc.description)}</p>
            <div class="team-accident-actions">
              <a class="secondary team-accident-link" href="${doc.file}" target="_blank" rel="noopener">Ver PDF</a>
              <a class="primary team-accident-link" href="${doc.file}" download>Descargar PDF</a>
            </div>
          </article>`).join("")}
        </div>
        <p class="team-accidents-note">Los archivos son de consulta y descarga. La documentación original permanece sin modificar.</p>
      </section>`:`<div class="team-tab-empty">Este equipo no tiene documentación de accidentes asignada.</div>`;
  }
  if(tab==="payments") body=`<div class="team-payment-summary"><strong>Total pendiente del equipo: ${euro(totalPending)}</strong></div><div class="table-wrap team-detail-table"><table><thead><tr><th>Jugador</th><th>Matrícula</th><th>Tallaje</th><th>Equipación</th><th>Pagado</th><th>Pendiente</th></tr></thead><tbody>${roster.map(p=>`<tr><td><strong>${esc(p.surname)}, ${esc(p.name)}</strong></td><td>${esc(pay(p.id,"registration").status)}</td><td>${esc(pay(p.id,"sizing").status)}</td><td>${esc(pay(p.id,"clothing").status)}</td><td>${euro(totalPaid(p.id))}</td><td><strong>${euro(pending(p.id))}</strong></td></tr>`).join("")||'<tr><td colspan="6">Sin jugadores</td></tr>'}</tbody></table></div>`;
  if(tab==="sizes"){
    const sizeItems=activeClothingItemsFor("players");
    const sizeHeaders=sizeItems.map(item=>`<th>${esc(clothingConfig(item).label)}</th>`).join("");
    const sizeRows=roster.map(p=>{
      const sizes=sizeFor(p.id),k=kit(p.id);
      const garmentCells=sizeItems.map(item=>`<td>${esc(clothingDisplayValue(item,sizes))}</td>`).join("");
      return `<tr><td class="team-size-player"><strong>${esc(p.name)} ${esc(p.surname)}</strong></td>${garmentCells}<td>${esc(k.delivered||"No")}</td></tr>`;
    }).join("");
    body=`<div class="team-sizing-intro"><strong>Tallajes completos de la plantilla</strong><span>Cada prenda aparece en una columna independiente. Desplázate horizontalmente para consultar todas las tallas.</span></div><div class="table-wrap team-detail-table team-sizes-table"><table><thead><tr><th class="team-size-player">Jugador</th>${sizeHeaders}<th>Entregado</th></tr></thead><tbody>${sizeRows||`<tr><td colspan="${sizeItems.length+2}">Sin jugadores</td></tr>`}</tbody></table></div>`;
  }
  if(tab==="calendar"){
    const matches=clubMatches.filter(m=>String(m.team||"").trim()===String(t.name||"").trim()).sort((a,b)=>`${a.match_date||"9999"} ${a.match_time||""}`.localeCompare(`${b.match_date||"9999"} ${b.match_time||""}`));
    const played=matches.filter(matchIsPlayed).length;
    body=`<div class="team-calendar-head"><div><h3>Calendario de partidos y competiciones</h3><p>Importa el calendario del equipo o añade partidos manualmente. Después podrás editar fecha, hora, campo y resultado.</p></div><div class="team-calendar-actions"><button class="secondary" type="button" onclick="openTeamPdfImport('${String(t.name).replace(/'/g,"\'")}')">Importar calendario PDF</button><button class="primary" type="button" data-new-team-match="${esc(t.name)}">+ Nuevo partido</button></div></div>
    <div class="team-calendar-stats"><article><span>Total</span><strong>${matches.length}</strong></article><article><span>Jugados</span><strong>${played}</strong></article><article><span>Pendientes</span><strong>${matches.length-played}</strong></article></div>
    <div class="team-calendar-list">${matches.length?matches.map(m=>{const home=m.venue!=="away",done=matchIsPlayed(m),homeName=home?m.team:m.opponent,awayName=home?m.opponent:m.team;return `<article class="team-match-card ${m.finished?"is-finished":""}"><div class="team-match-date"><strong>${esc(m.match_date?new Date(m.match_date+"T12:00:00").toLocaleDateString("es-ES",{weekday:"short",day:"2-digit",month:"short"}):"Sin fecha")}</strong><span>${esc(m.match_time||"Hora pendiente")}</span></div><div class="team-match-main"><div class="team-match-heading">${competitionLogoHTML(m.competition,true)}<div><h4>${esc(homeName)} – ${esc(awayName)}</h4><p>${esc(m.round||"Sin jornada")} · ${esc(m.location||"Campo pendiente")}</p></div></div><div class="team-match-actions"><button class="mini" type="button" onclick="editClubMatch('${m.id}')">Editar partido</button><button class="mini result-button" type="button" onclick="openResultDialog('${m.id}')">Resultado</button><button class="mini finish-button ${m.finished?"active":""}" type="button" onclick="toggleMatchFinished('${m.id}')">${m.finished?"Finalizado ✓":"Finalizar"}</button><button class="mini danger-mini" type="button" onclick="deleteClubMatch('${m.id}')">Eliminar</button></div></div><div class="team-match-result">${done?`${home?esc(m.goals_for):esc(m.goals_against)} - ${home?esc(m.goals_against):esc(m.goals_for)}`:'<span class="match-pending">Pendiente</span>'}${m.finished?'<small>FINALIZADO</small>':''}</div></article>`}).join(""):'<div class="team-tab-empty">Todavía no hay partidos registrados para este equipo.</div>'}</div>`;
  }
  if(tab==="sportsAttendance") body=`<div id="teamSportsPanel" class="team-sports-panel"><div class="team-sports-loading"><strong>Cargando asistencia...</strong><span>Preparando la plantilla del equipo.</span></div></div>`;
  if(tab==="sportsMatches") body=`<div id="teamSportsPanel" class="team-sports-panel"><div class="team-sports-loading"><strong>Cargando partidos...</strong><span>Preparando minutos y tarjetas del equipo.</span></div></div>`;
  if(tab==="sportsStats") body=`<div id="teamSportsPanel" class="team-sports-panel"><div class="team-sports-loading"><strong>Cargando estadísticas...</strong><span>Calculando los datos deportivos del equipo.</span></div></div>`;
  if(tab==="reports") body=`<div class="team-report-menu">
    ${[["players","Listado de jugadores","Datos generales y contactos"],["documents","Documentación","Estado de documentos por jugador"],["payments","Pagos","Cuotas pagadas y pendientes"],["sizes","Tallajes","Tallas y entrega de equipaciones"],["full","Informe completo","Toda la información del equipo"]].map(r=>`<button onclick="teamDetailDialog.close();openTeamReport('${String(t.name).replace(/'/g,"\\'")}','${r[0]}')"><span>▦</span><div><strong>${r[1]}</strong><small>${r[2]}</small></div><b>→</b></button>`).join("")}
  </div>`;
  const tabButtonsHtml=tabs.map(([id,label])=>`<button type="button" class="${tab===id?"active":""} ${id.startsWith("sports")?"sports-tab":""} ${id==="cards"?"cards-tab":""}" onclick="renderTeamDetailTab('${id}')">${id==="cards"?"▣ ":id==="accidents"?"✚ ":id==="sportsAttendance"?"✓ ":id==="sportsMatches"?"⚽ ":id==="sportsStats"?"▥ ":""}${label}</button>`).join("");
  const canSwitchTechnicalTeam=isTechnicalReadOnly()&&Array.isArray(currentTechnicalTeams)&&currentTechnicalTeams.length>1;
  const technicalSwitchMenuHtml=canSwitchTechnicalTeam?`<button type="button" class="team-detail-switch-team" onclick="openTechnicalTeamSwitcherV27231()">⇄ Cambiar de equipo</button>`:"";
  const activeTabLabel=tabs.find(([id])=>id===tab)?.[1]||"Resumen";
  teamDetailContent.innerHTML=`<details class="team-detail-mobile-menu"><summary><span class="team-detail-mobile-menu-icon">☰</span><span class="team-detail-mobile-menu-title">${esc(activeTabLabel)}</span><small>Cambiar apartado</small></summary><div class="team-detail-mobile-menu-list">${technicalSwitchMenuHtml}${tabButtonsHtml}</div></details><nav class="team-detail-tabs">${tabButtonsHtml}</nav><div class="team-detail-tab-content">${body}</div>`;
  if(tab==="cards"){
    const cardApi=window.cardHolderV2718||window.cardHolderV2717||window.cardHolderV2716||window.cardHolderV2715;
    if(cardApi?.renderTeamPanel){
      cardApi.renderTeamPanel({
        teamId:t.id,
        teamName:t.name,
        category:t.category,
        roster,
        technical:isTechnicalReadOnly(),
        token:getTechnicalSessionToken(),
        client:sb,
        notify:toast,
        targetId:"teamCardsPanel"
      });
    }else{
      const panel=document.getElementById("teamCardsPanel");
      if(panel)panel.innerHTML='<div class="team-tab-empty">No se pudo iniciar el tarjetero digital. Recarga la aplicación.</div>';
    }
  }
  if(["sportsAttendance","sportsMatches","sportsStats"].includes(tab)){
    const sportsApi=window.sportsV2703||window.sportsV2702||window.sportsV2701||window.sportsV2700;
    if(sportsApi?.renderTeamPanel){
      sportsApi.renderTeamPanel(tab,t.id,"teamSportsPanel");
    }else{
      const panel=document.getElementById("teamSportsPanel");
      if(panel)panel.innerHTML='<div class="team-tab-empty">No se pudo iniciar el seguimiento deportivo. Recarga la aplicación.</div>';
    }
  }
};

window.addEventListener("DOMContentLoaded", () => {
  const el = document.getElementById("publicUrl");
  if (el) {
    const base = location.href.replace(/index\.html.*$/, "").replace(/\/?$/, "/");
    el.textContent = base + "inscripcion.html";
  }
});


function renderReportStats(){
  const playersEl=document.getElementById("reportStatPlayers");
  if(!playersEl) return;

  reportStatPlayers.textContent=players.length;
  reportStatPayments.textContent=players.filter(p=>pending(p.id)>0).length;
  reportStatDocs.textContent=players.filter(p=>docState(p.id)==="Incompleta").length;

  const currentMonth=new Date().toISOString().slice(0,7);
  const monthPitchTotal=pitchUsage
    .filter(item=>item.usage_date && item.usage_date.startsWith(currentMonth))
    .reduce((sum,item)=>sum+Number(item.amount||0),0);

  reportStatPitches.textContent=euro(monthPitchTotal);
}


// INFORMES POR EQUIPO V15
function reportSeason(){return currentSeasonLabel()}
function reportText(value){return value===null||value===undefined||value===""?"-":String(value)}
function reportDate(value){
  if(!value)return "-";
  const d=new Date(value+"T12:00:00");
  return Number.isNaN(d.getTime())?value:d.toLocaleDateString("es-ES");
}
function reportYesNo(v){return v===true||v==="true"||v==="Sí"?"Sí":"No"}
function teamReportPlayers(){
  const teamName=document.getElementById("teamReportTeam")?.value||"";
  let list=players.filter(p=>(p.team||"").trim()===teamName.trim());
  const sort=document.getElementById("teamReportSort")?.value||"surname";
  list=[...list].sort((a,b)=>alphaCompareValues(reportText(a[sort]),reportText(b[sort])));
  return list;
}
function teamReportConfig(){
  return {
    teamName:document.getElementById("teamReportTeam")?.value||"",
    type:document.getElementById("teamReportType")?.value||"players",
    sensitive:document.getElementById("teamReportSensitive")?.checked||false,
    notes:document.getElementById("teamReportNotes")?.checked||false,
    onlyPending:document.getElementById("teamReportOnlyPending")?.checked||false
  };
}
function reportTypeName(type){
  return {players:"Listado de jugadores",documents:"Documentación",payments:"Pagos",sizes:"Tallajes",full:"Informe completo"}[type]||"Informe";
}
function teamReportRows(){
  const cfg=teamReportConfig();
  let list=teamReportPlayers();
  const rows=[];
  let headers=[];

  if(cfg.type==="players"){
    headers=["Jugador","Fecha nacimiento","Estado","Tutor"];
    if(cfg.sensitive)headers.push("DNI jugador","Teléfono","Email","Dirección");
    if(cfg.notes)headers.push("Observaciones");
    list.forEach(p=>{
      const row=[`${p.surname||""}, ${p.name||""}`.replace(/^, /,""),reportDate(p.birth_date),reportText(p.status),reportText(p.guardian)];
      if(cfg.sensitive)row.push(reportText(p.player_dni),reportText(p.phone),reportText(p.email),reportText(p.address));
      if(cfg.notes)row.push(reportText(p.notes));
      rows.push(row);
    });
  }

  if(cfg.type==="documents"){
    headers=["Jugador","DNI / Libro familia","Fotografía","Certificado médico","Estado"];
    list=list.filter(p=>!cfg.onlyPending||docState(p.id)==="Incompleta");
    list.forEach(p=>{const d=docs(p.id);rows.push([
      `${p.surname||""}, ${p.name||""}`.replace(/^, /,""),
      reportText(d.player_dni_status||"Pendiente"),
      reportText(d.photo_status||"Pendiente"),
      reportText(d.medical_status||"Pendiente"),
      docState(p.id)
    ])});
  }

  if(cfg.type==="payments"){
    headers=["Jugador","Matrícula 50 €","Tallaje 50 €","Equipación 100 €","Pagado","Pendiente"];
    list=list.filter(p=>!cfg.onlyPending||pending(p.id)>0);
    list.forEach(p=>rows.push([
      `${p.surname||""}, ${p.name||""}`.replace(/^, /,""),
      `${pay(p.id,"registration").status} · ${euro(pay(p.id,"registration").amount)}`,
      `${pay(p.id,"sizing").status} · ${euro(pay(p.id,"sizing").amount)}`,
      `${pay(p.id,"clothing").status} · ${euro(pay(p.id,"clothing").amount)}`,
      euro(totalPaid(p.id)),
      euro(pending(p.id))
    ]));
  }

  if(cfg.type==="sizes"){
    const sizeItems=activeClothingItemsFor("players");
    headers=["Jugador",...sizeItems.map(item=>clothingConfig(item).label),"Tallado","Entregado"];
    if(cfg.notes)headers.push("Observaciones");
    list=list.filter(p=>!cfg.onlyPending||sizeFor(p.id).sized!=="Sí"||kit(p.id).delivered!=="Sí");
    list.forEach(p=>{const s=sizeFor(p.id),k=kit(p.id);const row=[
      `${p.surname||""}, ${p.name||""}`.replace(/^, /,""),
      ...sizeItems.map(item=>reportText(clothingDisplayValue(item,s))),
      reportText(s.sized||"No"),reportText(k.delivered||"No")
    ];if(cfg.notes)row.push(reportText(s.notes));rows.push(row)});
  }

  if(cfg.type==="full"){
    headers=["Jugador","Nacimiento","Estado","Tutor","Documentación","Matrícula","Tallaje","Equipación","Pagado","Pendiente","Tallas juego","Tallas entreno","Chándal","Entregado"];
    if(cfg.sensitive)headers.push("Teléfono","Email","DNI jugador");
    if(cfg.notes)headers.push("Observaciones");
    list=list.filter(p=>!cfg.onlyPending||docState(p.id)==="Incompleta"||pending(p.id)>0||kit(p.id).delivered!=="Sí");
    list.forEach(p=>{const s=sizeFor(p.id),k=kit(p.id);const row=[
      `${p.surname||""}, ${p.name||""}`.replace(/^, /,""),
      reportDate(p.birth_date),reportText(p.status),reportText(p.guardian),docState(p.id),
      pay(p.id,"registration").status,pay(p.id,"sizing").status,pay(p.id,"clothing").status,
      euro(totalPaid(p.id)),euro(pending(p.id)),
      [s.game_shirt,s.game_shirt_goalkeeper,s.game_shorts,s.game_shorts_goalkeeper,s.second_shirt_player,s.socks,s.socks_goalkeeper].filter(Boolean).join(" / ")||"-",
      [s.training_shirt,s.training_shirt_goalkeeper,s.training_shorts,s.training_shorts_goalkeeper,s.training_sweatshirt].filter(Boolean).join(" / ")||"-",
      [s.tracksuit_jacket,s.tracksuit_trousers].filter(Boolean).join(" / ")||"-",
      reportText(k.delivered||"No")
    ];if(cfg.sensitive)row.push(reportText(p.phone),reportText(p.email),reportText(p.player_dni));if(cfg.notes)row.push(reportText(p.notes));rows.push(row)});
  }
  return {headers,rows,list};
}
function renderTeamReportOptions(){
  const select=document.getElementById("teamReportTeam");
  if(!select)return;
  const selected=select.value;
  const names=sortByAlpha([...new Set([...teams.map(t=>t.name),...players.map(p=>p.team)].filter(Boolean))],n=>n);
  select.innerHTML='<option value="">Seleccionar equipo</option>'+names.map(n=>`<option value="${n.replace(/"/g,"&quot;")}">${n}</option>`).join("");
  if(names.includes(selected))select.value=selected;
}
function teamReportStats(list){
  return {
    total:list.length,
    pendingPayments:list.filter(p=>pending(p.id)>0).length,
    incompleteDocs:list.filter(p=>docState(p.id)==="Incompleta").length,
    pendingKits:list.filter(p=>kit(p.id).delivered!=="Sí").length
  };
}
function previewTeamReport(showMessage=true){
  const cfg=teamReportConfig();
  if(!cfg.teamName){if(showMessage)toast("Selecciona un equipo");return false}
  const data=teamReportRows(), stats=teamReportStats(teamReportPlayers());
  const team=teams.find(t=>t.name===cfg.teamName)||{};
  document.getElementById("teamReportEmpty").classList.add("hidden");
  document.getElementById("teamReportPreviewArea").classList.remove("hidden");
  document.getElementById("teamReportTitle").textContent=`${reportTypeName(cfg.type)} · ${cfg.teamName}`;
  const coach=staff.find(s=>s.id===team.coach_id)?.name||team.coach||"Sin asignar";
  document.getElementById("teamReportMeta").textContent=`Temporada ${reportSeason()} · Entrenador: ${coach} · Generado: ${new Date().toLocaleDateString("es-ES")}`;
  document.getElementById("teamReportSummary").innerHTML=`
    <article><small>Jugadores</small><strong>${stats.total}</strong></article>
    <article><small>Pagos pendientes</small><strong>${stats.pendingPayments}</strong></article>
    <article><small>Documentos incompletos</small><strong>${stats.incompleteDocs}</strong></article>
    <article><small>Equipaciones pendientes</small><strong>${stats.pendingKits}</strong></article>`;
  document.getElementById("teamReportHead").innerHTML="<tr>"+data.headers.map(h=>`<th>${h}</th>`).join("")+"</tr>";
  document.getElementById("teamReportBody").innerHTML=data.rows.length?data.rows.map(row=>"<tr>"+row.map(v=>`<td>${String(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</td>`).join("")+"</tr>").join(""):`<tr><td colspan="${data.headers.length}">No hay registros para los filtros seleccionados.</td></tr>`;
  return true;
}
function teamReportFilename(ext){
  const cfg=teamReportConfig();
  const clean=s=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9]+/g,"_").replace(/^_|_$/g,"").toLowerCase();
  return `${clean(cfg.teamName)}_${clean(reportTypeName(cfg.type))}_${new Date().toISOString().slice(0,10)}.${ext}`;
}
function teamReportObjects(){
  const data=teamReportRows();
  return data.rows.map(row=>Object.fromEntries(data.headers.map((h,i)=>[h,row[i]??""])));
}
function exportTeamReportCSV(){
  if(!previewTeamReport(false))return toast("Selecciona un equipo");
  downloadCSV(teamReportFilename("csv"),teamReportObjects());
}
function exportTeamReportExcel(){
  if(!previewTeamReport(false))return toast("Selecciona un equipo");
  if(!window.XLSX)return toast("No se pudo cargar el exportador Excel");
  const data=teamReportObjects();
  const ws=XLSX.utils.json_to_sheet(data);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,"Informe");
  XLSX.writeFile(wb,teamReportFilename("xlsx"));
}
async function reportLogoData(){
  const img=document.querySelector(".report-document-header img");
  if(!img)return null;
  try{
    const canvas=document.createElement("canvas");
    canvas.width=img.naturalWidth||200;canvas.height=img.naturalHeight||200;
    canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);
    return canvas.toDataURL("image/png");
  }catch(e){return null}
}
async function exportTeamReportPDF(){
  if(!previewTeamReport(false))return toast("Selecciona un equipo");
  if(!window.jspdf?.jsPDF)return toast("No se pudo cargar el generador PDF");
  const cfg=teamReportConfig(), data=teamReportRows();
  const landscape=cfg.type==="full"||cfg.type==="sizes"||data.headers.length>8;
  const {jsPDF}=window.jspdf;
  const doc=new jsPDF({orientation:landscape?"landscape":"portrait",unit:"mm",format:"a4"});
  const width=doc.internal.pageSize.getWidth();
  doc.setFillColor(8,42,78);doc.rect(0,0,width,31,"F");
  const logo=await reportLogoData();if(logo)doc.addImage(logo,"PNG",10,4,23,23);
  doc.setTextColor(255,255,255);doc.setFontSize(15);doc.setFont(undefined,"bold");
  doc.text("CD SAN BERNABÉ",38,12);
  doc.setFontSize(11);doc.setFont(undefined,"normal");
  doc.text(`${reportTypeName(cfg.type)} · ${cfg.teamName}`,38,20);
  doc.setFontSize(8);doc.text(`Temporada ${reportSeason()} · ${new Date().toLocaleDateString("es-ES")}`,38,26);
  doc.autoTable({
    head:[data.headers],body:data.rows,startY:36,
    theme:"grid",
    styles:{fontSize:landscape?6.4:7.4,cellPadding:1.6,overflow:"linebreak",valign:"top"},
    headStyles:{fillColor:[17,93,151],textColor:255,fontStyle:"bold"},
    alternateRowStyles:{fillColor:[244,248,251]},
    margin:{left:8,right:8,bottom:13},
    didDrawPage:hook=>{
      const page=doc.internal.getNumberOfPages();
      doc.setTextColor(90);doc.setFontSize(7);
      doc.text("Documento interno sujeto a protección de datos",8,doc.internal.pageSize.getHeight()-6);
      doc.text(`Página ${page}`,doc.internal.pageSize.getWidth()-22,doc.internal.pageSize.getHeight()-6);
    }
  });
  doc.save(teamReportFilename("pdf"));
}
function printTeamReport(){
  if(!previewTeamReport(false))return toast("Selecciona un equipo");
  document.body.classList.add("team-report-printing");
  window.print();
  setTimeout(()=>document.body.classList.remove("team-report-printing"),500);
}
function setupTeamReports(){
  const preview=document.getElementById("teamReportPreview");
  if(!preview)return;
  preview.onclick=()=>previewTeamReport();
  document.getElementById("teamReportPdf").onclick=exportTeamReportPDF;
  document.getElementById("teamReportExcel").onclick=exportTeamReportExcel;
  document.getElementById("teamReportCsv").onclick=exportTeamReportCSV;
  document.getElementById("teamReportPrint").onclick=printTeamReport;
  ["teamReportTeam","teamReportType","teamReportSort","teamReportSensitive","teamReportNotes","teamReportOnlyPending"].forEach(id=>{
    document.getElementById(id)?.addEventListener("change",()=>{
      if(document.getElementById("teamReportTeam").value)previewTeamReport(false);
    });
  });
}
document.addEventListener("DOMContentLoaded",setupTeamReports);


// ACCESO DIRECTO A INFORMES DESDE EQUIPOS V16
window.openTeamReport=function(teamName,type="full"){
  const reportsNav=document.querySelector('.nav[data-view="reports"]');
  if(reportsNav){
    reportsNav.click();
  }else{
    document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
    document.getElementById("reports")?.classList.add("active");
  }

  renderTeamReportOptions();

  const teamSelect=document.getElementById("teamReportTeam");
  const typeSelect=document.getElementById("teamReportType");
  if(teamSelect) teamSelect.value=teamName;
  if(typeSelect) typeSelect.value=type;

  previewTeamReport(false);

  setTimeout(()=>{
    document.querySelector(".team-report-builder")?.scrollIntoView({
      behavior:"smooth",
      block:"start"
    });
  },80);
};


// DASHBOARD PROFESIONAL V20
function dashboardOpenView(view){
  const button=document.querySelector(`.nav[data-view="${view}"]`);
  if(button)button.click();
}
function dashboardPlayerPhoto(player){
  return signedCache[player.photo_path]||placeholderPhoto;
}
function renderDashboard(){
  const approved=players.filter(p=>p.status==="Aprobada").length;
  const pendingPlayers=players.filter(p=>pending(p.id)>0).length;
  const documentPending=players.filter(p=>docState(p.id)==="Incompleta").length;
  const kitPending=players.filter(p=>kit(p.id).delivered!=="Sí").length;
  const missingPhotos=players.filter(p=>{
    const d=docs(p.id);
    return !p.photo_path && !["Recibido","No requerido"].includes(d.photo_status);
  }).length;
  const missingSizing=players.filter(p=>sizeFor(p.id).sized!=="Sí").length;
  const totalPaidAmount=players.reduce((sum,p)=>sum+totalPaid(p.id),0);
  const totalExpected=players.length*200;
  const pendingAmount=players.reduce((sum,p)=>sum+pending(p.id),0);

  stPlayers.textContent=players.length;
  stApproved.textContent=`${approved} aprobados`;
  stTeams.textContent=teams.length;
  stStaff.textContent=staff.length;
  stPaid.textContent=euro(totalPaidAmount);
  stPending.textContent=euro(pendingAmount);
  stPendingPlayers.textContent=`${pendingPlayers} ${pendingPlayers===1?"jugador":"jugadores"}`;
  stDocumentsPending.textContent=documentPending;
  stKitsPending.textContent=kitPending;

  const today=new Date();
  const dateNode=document.getElementById("dashboardDate");
  if(dateNode){
    dateNode.textContent=today.toLocaleDateString("es-ES",{
      weekday:"long",day:"numeric",month:"long",year:"numeric"
    }).replace(/^./,c=>c.toUpperCase())+" · Resumen actualizado del club";
  }

  recent.innerHTML=players.slice(0,6).map(p=>`
    <button class="dashboard-player-row" onclick="editPlayer('${p.id}')">
      <img src="${dashboardPlayerPhoto(p)}" alt="Fotografía de ${esc(p.name||"jugador")}" onerror="this.src='${placeholderPhoto}'">
      <span class="dashboard-player-info">
        <strong>${esc(p.name||"")} ${esc(p.surname||"")}</strong>
        <small>${esc(p.team||"Sin equipo")} · ${reportDate(p.created_at?.slice?.(0,10)||p.created_at||"")}</small>
      </span>
      ${badge(p.status||"Pendiente revisión")}
    </button>`).join("")||'<div class="dashboard-empty">Todavía no hay jugadores inscritos.</div>';

  const alertItems=[
    {count:documentPending,label:"Expedientes con documentación incompleta",view:"documents",icon:"📄",tone:"red"},
    {count:pendingPlayers,label:`Jugadores con pagos pendientes · ${euro(pendingAmount)}`,view:"payments",icon:"💶",tone:"orange"},
    {count:missingSizing,label:"Jugadores pendientes de tallaje",view:"kits",icon:"📏",tone:"blue"},
    {count:kitPending,label:"Equipaciones pendientes de entrega",view:"kits",icon:"👕",tone:"purple"},
    {count:missingPhotos,label:"Jugadores sin fotografía",view:"documents",icon:"📷",tone:"gray"}
  ];
  alerts.innerHTML=alertItems.map(item=>`
    <button class="dashboard-alert-row ${item.count===0?"resolved":""}" onclick="dashboardOpenView('${item.view}')">
      <span class="dashboard-alert-icon ${item.tone}">${item.icon}</span>
      <span><strong>${item.label}</strong><small>${item.count===0?"Todo al día":`${item.count} ${item.count===1?"caso pendiente":"casos pendientes"}`}</small></span>
      <b>${item.count}</b>
    </button>`).join("");

  const percent=value=>Math.max(0,Math.min(100,Math.round(value)));
  const docComplete=players.length-documentPending;
  const kitsDelivered=players.length-kitPending;
  const sizingDone=players.length-missingSizing;
  const progress=[
    {label:"Objetivo de jugadores",value:percent(players.length/190*100),detail:`${players.length} de 190`},
    {label:"Documentación completa",value:players.length?percent(docComplete/players.length*100):0,detail:`${docComplete} de ${players.length}`},
    {label:"Cobros realizados",value:totalExpected?percent(totalPaidAmount/totalExpected*100):0,detail:`${euro(totalPaidAmount)} de ${euro(totalExpected)}`},
    {label:"Tallajes realizados",value:players.length?percent(sizingDone/players.length*100):0,detail:`${sizingDone} de ${players.length}`},
    {label:"Equipaciones entregadas",value:players.length?percent(kitsDelivered/players.length*100):0,detail:`${kitsDelivered} de ${players.length}`}
  ];
  dashboardProgress.innerHTML=progress.map(item=>`
    <div class="dashboard-progress-row">
      <div><strong>${item.label}</strong><small>${item.detail}</small></div>
      <div class="dashboard-progress-track"><span style="width:${item.value}%"></span></div>
      <b>${item.value}%</b>
    </div>`).join("");
}
function setupDashboardActions(){
  document.querySelectorAll("[data-dashboard-go],[data-go]").forEach(button=>{
    button.addEventListener("click",()=>dashboardOpenView(button.dataset.dashboardGo||button.dataset.go));
  });
  document.getElementById("dashboardAddPlayer")?.addEventListener("click",openNewPlayerForm);
}
document.addEventListener("DOMContentLoaded",setupDashboardActions);


// MÓDULO JUGADORES PROFESIONAL V21
function setupPlayersProfessional(){
  ["playerSearch","playerTeamFilter","playerStatusFilter","playerIssueFilter"].forEach(id=>{
    const el=document.getElementById(id);
    if(el)el.addEventListener(id==="playerSearch"?"input":"change",renderPlayers);
  });
  document.getElementById("clearPlayerFilters")?.addEventListener("click",()=>{
    ["playerSearch","playerTeamFilter","playerStatusFilter","playerIssueFilter"].forEach(id=>{
      const el=document.getElementById(id);if(el)el.value="";
    });
    renderPlayers();
  });
  document.getElementById("playersGridView")?.addEventListener("click",()=>{
    document.getElementById("playersGrid").classList.remove("hidden");
    document.getElementById("playersTableWrap").classList.add("hidden");
    document.getElementById("playersGridView").classList.add("active");
    document.getElementById("playersTableView").classList.remove("active");
  });
  document.getElementById("playersTableView")?.addEventListener("click",()=>{
    document.getElementById("playersGrid").classList.add("hidden");
    document.getElementById("playersTableWrap").classList.remove("hidden");
    document.getElementById("playersGridView").classList.remove("active");
    document.getElementById("playersTableView").classList.add("active");
  });
  document.getElementById("playersAddPlayer")?.addEventListener("click",openNewPlayerForm);
}
document.addEventListener("DOMContentLoaded",setupPlayersProfessional);

// REPARACIÓN V21.1: evita que un control opcional ausente bloquee toda la interfaz.
window.addEventListener("error",event=>{
  console.error("Error de interfaz:",event.error||event.message);
});


// V23.1 — navegación robusta para nuevas pantallas
document.querySelectorAll(".nav[data-view]").forEach(button=>{
  button.addEventListener("click",()=>{
    const target=button.dataset.view;
    document.querySelectorAll(".view").forEach(view=>view.classList.remove("active"));
    document.getElementById(target)?.classList.add("active");
    document.querySelectorAll(".nav").forEach(nav=>nav.classList.remove("active"));
    button.classList.add("active");
    const names={
      trash:["Papelera","Recuperación de jugadores y equipos"],
      activity:["Registro de actividad","Historial de cambios del programa"],
      backup:["Copias de seguridad","Protección y exportación de datos"]
    };
    if(names[target]){
      if(typeof pageTitle!=="undefined"&&pageTitle)pageTitle.textContent=names[target][0];
      if(typeof pageSubtitle!=="undefined"&&pageSubtitle)pageSubtitle.textContent=names[target][1];
    }
  });
});

// V24.4.8 — INVENTARIO COMPLETO DE EQUIPACIONES
// El inventario muestra siempre todas las prendas activas y todas sus tallas,
// aunque todavía no exista ningún tallaje registrado.
let kitInventoryStock={};
try{kitInventoryStock=JSON.parse(localStorage.getItem("cdsb_kit_inventory_v24_3")||"{}")||{}}catch(_){kitInventoryStock={}}
function saveKitInventory(){localStorage.setItem("cdsb_kit_inventory_v24_3",JSON.stringify(kitInventoryStock))}
function inventoryKey(prendaKey,talla){return `${prendaKey}|||${talla}`}
function inventoryLegacyKey(prenda,talla){return `${prenda}|||${talla}`}
function itemSupportsAudience(item,audience){return item.audience===audience||item.audience==="both"}
function inventoryItemsForScope(scope){
  return CLOTHING_ITEMS.filter(item=>{
    if(clothingConfig(item).active===false)return false;
    if(scope==="all")return itemSupportsAudience(item,"players")||itemSupportsAudience(item,"staff");
    return itemSupportsAudience(item,scope);
  });
}
function inventorySizesForItem(item,scope){
  const values=[];
  const add=list=>list.filter(Boolean).forEach(size=>{if(!values.includes(size))values.push(size)});
  if(item.key==="backpack")return ["Única"];
  if(["socks","socks_goalkeeper"].includes(item.key)){
    add(SOCK_SIZES);
    return values;
  }
  if((scope==="players"||scope==="all")&&itemSupportsAudience(item,"players"))add(PLAYER_SIZES);
  if((scope==="staff"||scope==="all")&&itemSupportsAudience(item,"staff"))add(STAFF_SIZES);
  return values;
}
function inventoryRows(){
  const originalTeam=document.getElementById("kitOrderTeam")?.value||"";
  const originalScope=document.getElementById("kitOrderScope")?.value||"players";
  const originalOnly=document.getElementById("kitOrderOnlySized")?.checked!==false;
  const team=document.getElementById("kitInventoryTeam")?.value||"";
  const scope=document.getElementById("kitInventoryScope")?.value||"players";
  const only=document.getElementById("kitInventoryOnlySized")?.checked!==false;
  const orderTeam=document.getElementById("kitOrderTeam"),orderScope=document.getElementById("kitOrderScope"),orderOnly=document.getElementById("kitOrderOnlySized");
  if(orderTeam)orderTeam.value=team;if(orderScope)orderScope.value=scope;if(orderOnly)orderOnly.checked=only;
  const requested=kitOrderSummary();
  if(orderTeam)orderTeam.value=originalTeam;if(orderScope)orderScope.value=originalScope;if(orderOnly)orderOnly.checked=originalOnly;

  const requestedMap=new Map(requested.map(row=>[`${row.Prenda}|||${row.Talla}`,Number(row.Unidades||0)]));
  const rows=[];
  inventoryItemsForScope(scope).forEach(item=>{
    const label=clothingLabelForAudience(item,scope);
    inventorySizesForItem(item,scope).forEach(talla=>{
      const key=inventoryKey(item.key,talla);
      const legacyKey=inventoryLegacyKey(label,talla);
      const stored=Object.prototype.hasOwnProperty.call(kitInventoryStock,key)
        ? kitInventoryStock[key]
        : kitInventoryStock[legacyKey];
      const available=Math.max(0,Number(stored||0));
      const units=Math.max(0,Number(requestedMap.get(legacyKey)||0));
      const missing=Math.max(0,units-available);
      rows.push({Prenda:label,Talla:talla,Unidades:units,key,Disponibles:available,Faltan:missing});
    });
  });
  return rows;
}
function setInventoryStock(key,input){
  const value=Math.max(0,Math.floor(Number(input.value)||0));
  input.value=value;
  kitInventoryStock[key]=value;
  saveKitInventory();
  const row=input.closest("tr");
  if(row){
    const requested=Math.max(0,Number(row.dataset.requested||0));
    const missing=Math.max(0,requested-value);
    const missingCell=row.querySelector("[data-inventory-missing]");
    const statusCell=row.querySelector("[data-inventory-status]");
    if(missingCell)missingCell.textContent=missing;
    if(statusCell)statusCell.innerHTML=missing>0?'<span class="inventory-status pending">Falta stock</span>':'<span class="inventory-status ready">Cubierto</span>';
    row.classList.toggle("inventory-shortage",missing>0);
    row.classList.toggle("inventory-ok",missing===0);
  }
  updateKitInventoryStats();
}
function updateKitInventoryStats(){
  const rows=inventoryRows();
  const stats=document.getElementById("kitInventoryStats");
  if(!stats)return;
  const requested=rows.reduce((n,r)=>n+r.Unidades,0);
  const availableTotal=rows.reduce((n,r)=>n+r.Disponibles,0);
  const covered=rows.reduce((n,r)=>n+Math.min(r.Disponibles,r.Unidades),0);
  const missing=rows.reduce((n,r)=>n+r.Faltan,0);
  stats.innerHTML=`<article><span>Solicitadas</span><strong>${requested}</strong></article><article><span>Existencias totales</span><strong>${availableTotal}</strong><small>${covered} asignables al pedido</small></article><article class="${missing?'has-shortage':''}"><span>Unidades que faltan</span><strong>${missing}</strong></article>`;
}
function renderKitInventory(){
  const teamSelect=document.getElementById("kitInventoryTeam");
  if(teamSelect){const current=teamSelect.value;teamSelect.innerHTML='<option value="">Todos los equipos</option>'+sortTeamsAlpha(teams).map(t=>`<option value="${esc(t.name)}">${esc(t.name)}</option>`).join("");teamSelect.value=current}
  const rows=inventoryRows(),body=document.getElementById("kitInventoryBody");
  if(body)body.innerHTML=rows.length?rows.map(r=>`<tr data-requested="${r.Unidades}" class="${r.Faltan>0?'inventory-shortage':'inventory-ok'}"><td><strong>${esc(r.Prenda)}</strong></td><td>${esc(r.Talla)}</td><td>${r.Unidades}</td><td><input class="inventory-stock-input" type="number" min="0" step="1" inputmode="numeric" value="${r.Disponibles}" aria-label="Existencias de ${esc(r.Prenda)} talla ${esc(r.Talla)}" onchange="setInventoryStock('${r.key.replace(/'/g,"\\'")}',this)"></td><td data-inventory-missing><strong>${r.Faltan}</strong></td><td data-inventory-status>${r.Faltan>0?'<span class="inventory-status pending">Falta stock</span>':'<span class="inventory-status ready">Cubierto</span>'}</td></tr>`).join(""):'<tr><td colspan="6">No hay prendas activas en el catálogo.</td></tr>';
  updateKitInventoryStats();
}
function exportKitInventory(){
  const rows=inventoryRows();if(!rows.length)return toast("No hay prendas activas para exportar");
  downloadCSV(`inventario_ropa_${cleanName(document.getElementById("kitInventoryTeam")?.value||"todos_los_equipos")}.csv`,rows.map(r=>({Prenda:r.Prenda,Talla:r.Talla,Solicitadas:r.Unidades,Disponibles:r.Disponibles,Faltan:r.Faltan,Estado:r.Faltan>0?"Falta stock":"Cubierto"})));toast("Inventario exportado")
}
function resetKitInventory(){
  if(!confirm("¿Quieres poner a cero todas las existencias guardadas?"))return;kitInventoryStock={};saveKitInventory();renderKitInventory();toast("Existencias puestas a cero")
}
function setupKitInventory(){
  ["kitInventoryTeam","kitInventoryScope","kitInventoryOnlySized"].forEach(id=>document.getElementById(id)?.addEventListener("change",renderKitInventory));
  document.getElementById("exportKitInventory")?.addEventListener("click",exportKitInventory);
  document.getElementById("resetKitInventory")?.addEventListener("click",resetKitInventory);
  renderKitInventory();
}
document.addEventListener("DOMContentLoaded",setupKitInventory);
const originalRenderKitsV243=renderKits;
renderKits=function(){originalRenderKitsV243();renderKitInventory()};

/* V24.5.1 - Calendario de partidos y competiciones dentro de Equipos */
const MATCHES_STORAGE_KEY="cdsb_matches_v24_5_1";
function matchesSeasonKey(){return `${MATCHES_STORAGE_KEY}_${seasonStorageSuffix()}`}
let clubMatches=[];
let pdfParsedMatches=[];
const COMPETITION_META={
  "Liga RFAF":{abbr:"RFAF",label:"Liga RFAF",className:"rfaf"},
  "Liga AAFB":{abbr:"AAFB",label:"Liga AAFB",className:"aafb"},
  "Copa Primavera":{abbr:"CP",label:"Copa Primavera",className:"primavera"},
  "Amistoso":{abbr:"AM",label:"Amistoso",className:"friendly"}
};
function competitionLogoHTML(name,compact=false){const m=COMPETITION_META[name]||{abbr:"?",label:name||"Sin competición",className:"other"};return `<span class="competition-logo ${m.className} ${compact?"compact":""}"><b>${esc(m.abbr)}</b><small>${esc(m.label)}</small></span>`}
function populateMatchRoundSelect(value=""){const el=document.getElementById("matchRound");if(!el)return;el.innerHTML='<option value="">Selecciona jornada</option>'+Array.from({length:40},(_,i)=>`<option value="Jornada ${i+1}">Jornada ${i+1}</option>`).join('')+'<option value="Amistoso">Amistoso</option><option value="Eliminatoria">Eliminatoria</option>';el.value=value||""}
function knownOpponents(){return [...new Set(clubMatches.map(m=>String(m.opponent||"").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"es",{sensitivity:"base"}))}
function knownLocations(){const values=["Centro Deportivo Montepalma","La Menacha","Ignacio Villaverde",...clubMatches.map(m=>m.location),...(pitchUsages||[]).map(x=>x.field_name)];return [...new Set(values.map(x=>String(x||"").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"es",{sensitivity:"base"}))}
function populateOpponentSelect(value=""){const el=document.getElementById("matchOpponent");if(!el)return;const list=knownOpponents();el.innerHTML='<option value="">Selecciona rival</option>'+list.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('')+'<option value="__custom__">+ Añadir otro rival</option>';el.value=list.includes(value)?value:(value?"__custom__":"");const wrap=document.getElementById("customOpponentWrap");if(wrap){wrap.hidden=el.value!=="__custom__";const input=wrap.querySelector("input");if(input)input.value=list.includes(value)?"":value}}
function populateLocationSelect(value=""){const el=document.getElementById("matchLocation");if(!el)return;const list=knownLocations();el.innerHTML='<option value="">Selecciona campo</option>'+list.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('')+'<option value="__custom__">+ Añadir otro campo</option>';el.value=list.includes(value)?value:(value?"__custom__":"");const wrap=document.getElementById("customLocationWrap");if(wrap){wrap.hidden=el.value!=="__custom__";const input=wrap.querySelector("input");if(input)input.value=list.includes(value)?"":value}}
function updateCompetitionPreview(){const value=document.getElementById("matchCompetition")?.value||"";const box=document.getElementById("competitionLogoPreview");if(box)box.innerHTML=value?competitionLogoHTML(value):'<span>Selecciona una competición</span>'}

function loadClubMatches(){
  try{
    const key=matchesSeasonKey();
    let raw=localStorage.getItem(key);
    if(raw==null&&(window.CDSB_SEASON_STATE?.label||"2026/27")==="2026/27"){
      raw=localStorage.getItem(MATCHES_STORAGE_KEY);
      if(raw!=null)localStorage.setItem(key,raw);
    }
    clubMatches=JSON.parse(raw||"[]")||[];
  }catch(_){clubMatches=[]}
}
function saveClubMatches(){localStorage.setItem(matchesSeasonKey(),JSON.stringify(clubMatches));if(typeof renderCalendar==="function")renderCalendar()}

/* V27.2.44 · Sincronización real del calendario entre PC y móvil */
let calendarCloudSyncingV27244=false;
let calendarCloudReadyV27244=false;
function calendarTokenV27244(){
  try{return isTechnicalReadOnly()&&typeof getTechnicalSessionToken==="function"?getTechnicalSessionToken():null}catch(_){return null}
}
function calendarTeamIdV27244(name){
  const wanted=String(name||"").trim().toLocaleLowerCase("es");
  return (Array.isArray(teams)?teams:[]).find(t=>String(t.name||"").trim().toLocaleLowerCase("es")===wanted)?.id||null;
}
function calendarTeamNameV27244(id,fallback=""){
  return (Array.isArray(teams)?teams:[]).find(t=>String(t.id)===String(id))?.name||fallback||"";
}
function calendarKeyV27244(match){
  const norm=v=>String(v||"").trim().toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  const teamId=match?.team_id||calendarTeamIdV27244(match?.team)||"";
  return [teamId,String(match?.match_date||""),norm(match?.opponent),norm(match?.competition)].join("|");
}
function calendarCloudRowToLocalV27244(row){
  return {
    id:String(row.id||""),
    team:row.team_name||calendarTeamNameV27244(row.team_id,""),
    team_id:row.team_id||null,
    competition:row.competition||"",
    round:row.round||"",
    match_date:row.match_date||"",
    match_time:row.match_time?String(row.match_time).slice(0,5):"",
    venue:row.venue||"home",
    opponent:row.opponent||"",
    location:row.location||"",
    goals_for:row.goals_for??"",
    goals_against:row.goals_against??"",
    finished:Boolean(row.finished),
    notes:row.notes||"",
    opponent_crest:(row.opponent_crest!==undefined&&row.opponent_crest!==null)?row.opponent_crest:((typeof rivalByName==="function"&&rivalByName(row.opponent))?.crest||"")
  };
}
function calendarPayloadV27244(match){
  const teamId=match?.team_id||calendarTeamIdV27244(match?.team);
  if(!teamId)throw new Error(`No se encontró el equipo ${match?.team||""}`);
  return {
    id:/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(match?.id||""))?match.id:null,
    season_id:activeClubSeason?.id||null,
    team_id:teamId,
    competition:String(match?.competition||"").trim()||null,
    round:String(match?.round||"").trim()||null,
    match_date:match?.match_date||null,
    match_time:match?.match_time||null,
    venue:match?.venue==="away"?"away":"home",
    opponent:String(match?.opponent||"").trim(),
    location:String(match?.location||"").trim()||null,
    goals_for:match?.goals_for===""||match?.goals_for==null?null:Number(match.goals_for),
    goals_against:match?.goals_against===""||match?.goals_against==null?null:Number(match.goals_against),
    finished:Boolean(match?.finished),
    notes:String(match?.notes||"").trim()||null,
    opponent_crest:String(match?.opponent_crest||((typeof rivalByName==="function"&&rivalByName(match?.opponent))?.crest)||"")||null
  };
}
async function fetchClubMatchesCloudV27244(){
  if(typeof sb==="undefined"||!sb||!activeClubSeason?.id)return [];
  const args={p_token:calendarTokenV27244(),p_season_id:activeClubSeason.id};
  let response=await sb.rpc("calendar_matches_snapshot_v27245",args);
  if(response.error){
    console.warn("Feed V27.2.45 no disponible; usando compatibilidad V27.2.44",response.error);
    response=await sb.rpc("calendar_matches_snapshot_v27244",args);
  }
  const {data,error}=response;
  if(error)throw error;
  if(data?.ok===false)throw new Error(data.message||"No se pudo cargar el calendario compartido");
  return Array.isArray(data?.matches)?data.matches:[];
}
async function saveClubMatchCloudV27244(match,{silent=false}={}){
  if(isTechnicalReadOnly()||isHistoricalSeason()||typeof sb==="undefined"||!sb)return match;
  try{
    const payload=calendarPayloadV27244(match);
    let response=await sb.rpc("calendar_match_save_v27245",{p_token:null,p_payload:payload});
    if(response.error){
      console.warn("Guardado V27.2.45 no disponible; usando compatibilidad V27.2.44",response.error);
      const legacyPayload={...payload};delete legacyPayload.opponent_crest;
      response=await sb.rpc("calendar_match_save_v27244",{p_token:null,p_payload:legacyPayload});
    }
    const {data,error}=response;
    if(error)throw error;
    if(data?.ok===false)throw new Error(data.message||"No se pudo guardar el partido");
    const saved=data?.match?calendarCloudRowToLocalV27244(data.match):null;
    if(saved){
      const key=calendarKeyV27244(match),idx=clubMatches.findIndex(x=>String(x.id)===String(match.id)||calendarKeyV27244(x)===key);
      if(idx>=0)clubMatches[idx]={...clubMatches[idx],...saved};
      else clubMatches.push(saved);
      saveClubMatches();
    }
    return saved||match;
  }catch(error){
    console.error("Calendario compartido",error);
    if(!silent)toast(`El partido queda guardado en este dispositivo, pero no se pudo sincronizar: ${error?.message||"error de conexión"}`);
    return match;
  }
}
async function deleteClubMatchCloudV27244(id){
  if(isTechnicalReadOnly()||isHistoricalSeason()||typeof sb==="undefined"||!sb)return;
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id||"")))return;
  const {data,error}=await sb.rpc("calendar_match_delete_v27244",{p_token:null,p_id:id});
  if(error)throw error;
  if(data?.ok===false)throw new Error(data.message||"No se pudo eliminar el partido compartido");
}
async function hydrateClubMatchesFromCloudV27244({migrateLocal=true}={}){
  if(calendarCloudSyncingV27244||typeof sb==="undefined"||!sb||!activeClubSeason?.id)return;
  calendarCloudSyncingV27244=true;
  const localSnapshot=Array.isArray(clubMatches)?clubMatches.map(x=>({...x})):[];
  try{
    let cloudRows=await fetchClubMatchesCloudV27244();
    let cloudMatches=cloudRows.map(calendarCloudRowToLocalV27244);
    if(migrateLocal&&!isTechnicalReadOnly()&&!isHistoricalSeason()&&localSnapshot.length){
      const cloudKeys=new Set(cloudMatches.map(calendarKeyV27244));
      const pending=[];
      for(const match of localSnapshot){
        const key=calendarKeyV27244(match);
        if(!key||cloudKeys.has(key)||!calendarTeamIdV27244(match.team))continue;
        pending.push(match);cloudKeys.add(key);
      }
      if(pending.length){
        let uploaded=0;
        for(const match of pending){
          try{
            const payload=calendarPayloadV27244(match);payload.id=null;
            const {data,error}=await sb.rpc("calendar_match_save_v27244",{p_token:null,p_payload:payload});
            if(error)throw error;
            if(data?.ok===false)throw new Error(data.message||"No se pudo migrar el partido");
            uploaded++;
          }catch(error){console.warn("Migración calendario",match,error)}
        }
        if(uploaded)cloudMatches=(await fetchClubMatchesCloudV27244()).map(calendarCloudRowToLocalV27244);
      }
    }
    const merged=[...cloudMatches];
    const seen=new Set(merged.map(calendarKeyV27244));
    for(const local of localSnapshot){const key=calendarKeyV27244(local);if(key&&!seen.has(key)){merged.push(local);seen.add(key)}}
    clubMatches=merged.sort((a,b)=>`${a.match_date||"9999"} ${a.match_time||""}`.localeCompare(`${b.match_date||"9999"} ${b.match_time||""}`));
    saveClubMatches();
    calendarCloudReadyV27244=true;
    renderClubMatches();renderDashboardMatches();
    if(typeof renderCalendar==="function")renderCalendar();
    if(currentTeamDetailId&&document.getElementById("teamDetailDialog")?.open)renderTeamDetailTab("calendar");
    if(typeof repairRivalCrestsWebV27247==="function")setTimeout(repairRivalCrestsWebV27247,150);
  }catch(error){
    console.error("Carga calendario compartido",error);
    clubMatches=localSnapshot;
    saveClubMatches();
  }finally{calendarCloudSyncingV27244=false}
}
window.hydrateClubMatchesFromCloudV27244=hydrateClubMatchesFromCloudV27244;
function matchTeamNames(){return sortByAlpha([...new Set(teams.map(t=>String(t.name||"").trim()).filter(Boolean))],n=>n)}
function fillMatchTeamSelects(){
  const names=matchTeamNames();
  const options='<option value="">Selecciona equipo</option>'+names.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join("");
  const filter=document.getElementById("matchesTeamFilter"), importSelect=document.getElementById("pdfImportTeam"), formSelect=document.querySelector('#matchForm select[name="team"]');
  if(filter){const current=filter.value;filter.innerHTML='<option value="">Todos los equipos</option>'+names.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join("");filter.value=names.includes(current)?current:""}
  if(importSelect){const current=importSelect.value;importSelect.innerHTML=options;importSelect.value=names.includes(current)?current:""}
  if(formSelect){const current=formSelect.value;formSelect.innerHTML=options;formSelect.value=names.includes(current)?current:""}
}
function matchIsPlayed(m){return m.goals_for!==""&&m.goals_for!=null&&m.goals_against!==""&&m.goals_against!=null}
function formatMatchDate(value,time){
  if(!value)return "-";
  const d=new Date(`${value}T${time||"00:00"}`);
  return Number.isNaN(d.getTime())?value:d.toLocaleDateString("es-ES",{day:"2-digit",month:"2-digit",year:"numeric"})+(time?` · ${time}`:"");
}
function renderMatchesCompetitionFilter(){
  const select=document.getElementById("matchesCompetitionFilter");if(!select)return;
  const current=select.value;
  const names=[...new Set(clubMatches.map(m=>String(m.competition||"").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"es",{sensitivity:"base"}));
  select.innerHTML='<option value="">Todas las competiciones</option>'+names.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join("");
  select.value=names.includes(current)?current:"";
}
function renderClubMatches(){
  fillMatchTeamSelects();renderMatchesCompetitionFilter();
  const body=document.getElementById("matchesBody");if(!body)return;
  const team=document.getElementById("matchesTeamFilter")?.value||"";
  const competition=document.getElementById("matchesCompetitionFilter")?.value||"";
  const search=(document.getElementById("matchesSearch")?.value||"").trim().toLowerCase();
  const list=clubMatches.filter(m=>(!team||m.team===team)&&(!competition||m.competition===competition)&&(!search||[m.opponent,m.round,m.location,m.competition,m.team].some(v=>String(v||"").toLowerCase().includes(search)))).sort((a,b)=>`${a.match_date||"9999"} ${a.match_time||""}`.localeCompare(`${b.match_date||"9999"} ${b.match_time||""}`));
  body.innerHTML=list.length?list.map(m=>{
    const home=m.venue!=="away",played=matchIsPlayed(m);
    const homeName=home?m.team:m.opponent,awayName=home?m.opponent:m.team;
    return `<tr>
      <td>${esc(formatMatchDate(m.match_date,m.match_time))}</td>
      <td><strong>${esc(m.team)}</strong></td>
      <td>${esc(m.competition||"-")}</td>
      <td>${esc(m.round||"-")}</td>
      <td><span class="match-home-away">${esc(homeName)} <b>–</b> ${esc(awayName)}</span></td>
      <td>${played?`<span class="match-result">${home?esc(m.goals_for):esc(m.goals_against)} - ${home?esc(m.goals_against):esc(m.goals_for)}</span>`:'<span class="match-pending">Pendiente</span>'}</td>
      <td>${esc(m.location||"-")}</td>
      <td class="match-row-actions"><button class="mini" type="button" onclick="editClubMatch('${m.id}')">Editar</button><button class="mini danger-mini" type="button" onclick="deleteClubMatch('${m.id}')">Eliminar</button></td>
    </tr>`;
  }).join(""):'<tr><td colspan="8">No hay partidos registrados con estos filtros.</td></tr>';
  const filtered=list;
  document.getElementById("matchesTotal").textContent=filtered.length;
  document.getElementById("matchesPlayed").textContent=filtered.filter(matchIsPlayed).length;
  document.getElementById("matchesPending").textContent=filtered.filter(m=>!matchIsPlayed(m)).length;
  document.getElementById("matchesCompetitions").textContent=new Set(filtered.map(m=>m.competition).filter(Boolean)).size;
}
function openMatchDialog(match=null,presetTeam=""){
  const dialog=document.getElementById("matchDialog"),form=document.getElementById("matchForm");if(!dialog||!form)return;
  fillMatchTeamSelects();form.reset();form.elements.id.value=match?.id||"";
  form.elements.team.value=match?.team||presetTeam||"";
  form.elements.competition.value=match?.competition||"";
  populateMatchRoundSelect(match?.round||"");
  form.elements.match_date.value=match?.match_date||"";
  form.elements.match_time.value=match?.match_time||"";
  form.elements.venue.value=match?.venue||"home";
  populateOpponentSelect(match?.opponent||"");
  populateLocationSelect(match?.location||"");
  form.elements.notes.value=match?.notes||"";
  updateCompetitionPreview();
  document.getElementById("matchDialogTitle").textContent=match?"Editar partido":"Nuevo partido";
  dialog.showModal();
}
window.openTeamMatchDialog=team=>openMatchDialog(null,team);
window.openTeamPdfImport=team=>{fillMatchTeamSelects();pdfParsedMatches=[];const file=document.getElementById("matchesPdfFile"),status=document.getElementById("matchesPdfStatus"),select=document.getElementById("pdfImportTeam");if(file)file.value="";if(status)status.textContent="";if(select)select.value=team;renderPdfPreview();document.getElementById("matchesPdfDialog")?.showModal()};
window.editClubMatch=id=>openMatchDialog(clubMatches.find(m=>m.id===id));
window.deleteClubMatch=async id=>{const m=clubMatches.find(x=>x.id===id);if(!m||!confirm(`¿Eliminar el partido contra ${m.opponent}?`))return;try{await deleteClubMatchCloudV27244(m.id)}catch(error){console.error("Eliminar calendario compartido",error);return toast(`No se pudo eliminar el partido del calendario compartido: ${error?.message||"error"}`)}clubMatches=clubMatches.filter(x=>x.id!==id);saveClubMatches();renderClubMatches();renderDashboardMatches();if(currentTeamDetailId)renderTeamDetailTab("calendar");toast("Partido eliminado")};
async function saveMatchForm(event){
  event.preventDefault();const raw=Object.fromEntries(new FormData(event.currentTarget));
  const opponent=raw.opponent==="__custom__"?String(raw.opponent_custom||"").trim():String(raw.opponent||"").trim();
  const location=raw.location==="__custom__"?String(raw.location_custom||"").trim():String(raw.location||"").trim();
  if(!opponent)return toast("Escribe o selecciona el equipo rival");
  const previous=clubMatches.find(x=>x.id===raw.id)||{};
  const currentRival=typeof rivalByName==="function"?rivalByName(opponent):null;
  const match={...previous,id:raw.id||`match_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,team:raw.team,competition:String(raw.competition||"").trim(),round:String(raw.round||"").trim(),match_date:raw.match_date,match_time:raw.match_time||"",venue:raw.venue||"home",opponent,location,goals_for:previous.goals_for??"",goals_against:previous.goals_against??"",finished:Boolean(previous.finished),notes:String(raw.notes||"").trim(),opponent_crest:currentRival?.crest||""};
  const i=clubMatches.findIndex(x=>x.id===match.id);if(i>=0)clubMatches[i]=match;else clubMatches.push(match);
  saveClubMatches();document.getElementById("matchDialog")?.close();renderClubMatches();renderDashboardMatches();if(currentTeamDetailId)renderTeamDetailTab("calendar");
  await saveClubMatchCloudV27244(match,{silent:false});
  renderClubMatches();renderDashboardMatches();if(currentTeamDetailId)renderTeamDetailTab("calendar");toast(i>=0?"Partido actualizado":"Partido añadido");
}
function openResultDialog(id){const m=clubMatches.find(x=>x.id===id),dialog=document.getElementById("resultDialog"),form=document.getElementById("resultForm");if(!m||!dialog||!form)return;form.reset();form.elements.id.value=m.id;form.elements.goals_for.value=m.goals_for??"";form.elements.goals_against.value=m.goals_against??"";document.getElementById("resultTeamLabel").textContent=m.team;document.getElementById("resultOpponentLabel").textContent=m.opponent;document.getElementById("resultDialogTitle").textContent=`Resultado · ${m.team} - ${m.opponent}`;dialog.showModal()}
window.openResultDialog=openResultDialog;
async function saveResultForm(event){event.preventDefault();const raw=Object.fromEntries(new FormData(event.currentTarget)),m=clubMatches.find(x=>x.id===raw.id);if(!m)return;m.goals_for=Number(raw.goals_for);m.goals_against=Number(raw.goals_against);saveClubMatches();document.getElementById("resultDialog")?.close();renderClubMatches();renderDashboardMatches();if(currentTeamDetailId)renderTeamDetailTab("calendar");await saveClubMatchCloudV27244(m,{silent:false});toast("Resultado guardado")}
window.toggleMatchFinished=async id=>{const m=clubMatches.find(x=>x.id===id);if(!m)return;if(!matchIsPlayed(m)&&!m.finished)return toast("Introduce primero el resultado");m.finished=!m.finished;saveClubMatches();renderClubMatches();renderDashboardMatches();if(currentTeamDetailId)renderTeamDetailTab("calendar");await saveClubMatchCloudV27244(m,{silent:false});toast(m.finished?"Partido finalizado":"Partido reabierto")};
function normalizePdfDate(raw){
  const m=String(raw||"").match(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\b/);if(!m)return "";
  let y=Number(m[3]);if(y<100)y+=2000;return `${String(y).padStart(4,"0")}-${String(Number(m[2])).padStart(2,"0")}-${String(Number(m[1])).padStart(2,"0")}`;
}
function cleanPdfLine(line){return String(line||"").replace(/\s+/g," ").replace(/[|]+/g," ").trim()}
function detectRound(text){const m=text.match(/\b(?:jornada|jor\.?|j\.)\s*(\d+[A-Za-z]?)/i);return m?`Jornada ${m[1]}`:""}
function splitTeamsFromLine(text){
  const cleaned=text.replace(/\b\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}\b/g," ").replace(/\b\d{1,2}:\d{2}\b/g," ").replace(/\b(?:jornada|jor\.?|j\.)\s*\d+[A-Za-z]?/ig," ").replace(/\s+/g," ").trim();
  const patterns=[/\s+[-–—]\s+/,/\s+vs\.?\s+/i,/\s+contra\s+/i,/\s+v\.\s+/i];
  for(const p of patterns){const parts=cleaned.split(p).map(x=>x.trim()).filter(Boolean);if(parts.length>=2)return [parts[0],parts[1]]}
  return null;
}
function parsePdfLines(lines,team,competition){
  const result=[];
  lines.forEach((line,index)=>{
    const text=cleanPdfLine(line);if(!text)return;
    const date=normalizePdfDate(text);if(!date)return;
    const time=(text.match(/\b([01]?\d|2[0-3]):[0-5]\d\b/)||[])[0]||"";
    const pair=splitTeamsFromLine(text);if(!pair)return;
    let [home,away]=pair;
    const trailingFields=away.split(/\s{2,}|\s+campo\s*:|\s+instalaci[oó]n\s*:/i);away=trailingFields.shift().trim();
    let location=trailingFields.join(" ").trim();
    const teamNorm=String(team||"").toLowerCase();
    let venue="home",opponent=away;
    if(teamNorm){
      const homeMatch=home.toLowerCase().includes(teamNorm)||teamNorm.includes(home.toLowerCase());
      const awayMatch=away.toLowerCase().includes(teamNorm)||teamNorm.includes(away.toLowerCase());
      if(awayMatch&&!homeMatch){venue="away";opponent=home}else if(homeMatch){venue="home";opponent=away}
      else opponent=away;
    }
    if(!team||!opponent)return;
    result.push({tempId:`pdf_${index}_${Date.now()}`,selected:true,team,competition:competition||"Competición",round:detectRound(text),match_date:date,match_time:time,venue,home,away,opponent,location,goals_for:"",goals_against:"",notes:"Importado desde PDF"});
  });
  return result;
}
function normalizePdfTeamName(value){
  return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/[^A-Z0-9]+/g," ").replace(/\s+/g," ").trim();
}
function pdfNameMatchesSelectedTeam(pdfName,selectedTeam){
  const pdf=normalizePdfTeamName(pdfName),team=normalizePdfTeamName(selectedTeam);
  if(!pdf||!team)return false;
  if(team.includes("CDSB")||team.includes("SAN BERNABE"))return pdf.includes("SAN BERNABE");
  const genericTeam=team.replace(/\b(CD|C D|CF|C F|UD|U D)\b/g," ").replace(/\b(CADETE|INFANTIL|ALEVIN|BENJAMIN|PREBENJAMIN|ESCUELA)\b.*$/g," ").replace(/\s+/g," ").trim();
  return Boolean(genericTeam)&&(pdf.includes(genericTeam)||genericTeam.includes(pdf));
}
function pdfIsByeTeam(value){return normalizePdfTeamName(value).includes("DESCANSA")}
function pdfMatchDuplicate(match){
  const team=normalizePdfTeamName(match?.team),opp=normalizePdfTeamName(match?.opponent),round=normalizePdfTeamName(match?.round),date=String(match?.match_date||"");
  return clubMatches.some(existing=>{
    if(normalizePdfTeamName(existing?.team)!==team)return false;
    const sameDate=date&&String(existing?.match_date||"")===date;
    const sameRound=round&&normalizePdfTeamName(existing?.round)===round;
    const sameOpponent=opp&&normalizePdfTeamName(existing?.opponent)===opp;
    return (sameDate&&(sameRound||sameOpponent))||(sameRound&&sameOpponent);
  });
}
function pdfDefaultHomeField(team){
  try{return pitchDefaultsForTeam(team)?.field||""}catch(_){return ""}
}
let pdfJsLoadPromiseV27245=null;
function loadExternalScriptV27245(src){
  return new Promise((resolve,reject)=>{
    const existing=[...document.scripts].find(s=>s.src===src);
    if(existing){
      if(window.pdfjsLib)return resolve();
      existing.addEventListener("load",resolve,{once:true});
      existing.addEventListener("error",()=>reject(new Error(`No se pudo cargar ${src}`)),{once:true});
      return;
    }
    const script=document.createElement("script");
    script.src=src;script.async=true;
    script.onload=resolve;
    script.onerror=()=>reject(new Error(`No se pudo cargar ${src}`));
    document.head.appendChild(script);
  });
}
async function ensurePdfJsV27245(){
  if(window.pdfjsLib)return window.pdfjsLib;
  if(!pdfJsLoadPromiseV27245){
    pdfJsLoadPromiseV27245=(async()=>{
      const sources=[
        "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js",
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
        "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js"
      ];
      let lastError=null;
      for(const src of sources){
        try{
          await loadExternalScriptV27245(src);
          if(window.pdfjsLib)return window.pdfjsLib;
        }catch(error){lastError=error;}
      }
      throw lastError||new Error("No se pudo cargar el lector de PDF.");
    })().catch(error=>{pdfJsLoadPromiseV27245=null;throw error;});
  }
  return pdfJsLoadPromiseV27245;
}
async function extractPdfDocumentData(file){
  const pdfLib=await ensurePdfJsV27245();
  pdfLib.GlobalWorkerOptions.workerSrc="https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
  const data=await file.arrayBuffer(),pdf=await pdfLib.getDocument({data}).promise;
  const pages=[],flatLines=[],allText=[];
  for(let pageNum=1;pageNum<=pdf.numPages;pageNum++){
    const page=await pdf.getPage(pageNum),viewport=page.getViewport({scale:1}),content=await page.getTextContent(),middle=viewport.width/2;
    const columnGroups=[[],[]],allGroups=[];
    const addToGroup=(groups,item)=>{
      let group=groups.find(g=>Math.abs(g.y-item.y)<=2.4);
      if(!group){group={y:item.y,items:[]};groups.push(group)}
      group.items.push(item);
    };
    content.items.forEach(raw=>{
      const text=String(raw.str||"").trim();if(!text)return;
      const x=Number(raw.transform?.[4]||0),y=Number(raw.transform?.[5]||0),item={x,y,text};
      addToGroup(allGroups,item);
      addToGroup(columnGroups[x>=middle?1:0],item);
      allText.push(text);
    });
    const toLines=groups=>groups.sort((a,b)=>b.y-a.y).map(group=>cleanPdfLine(group.items.sort((a,b)=>a.x-b.x).map(i=>i.text).join(" "))).filter(Boolean);
    const columns=columnGroups.map(toLines);
    const pageLines=toLines(allGroups);flatLines.push(...pageLines);
    pages.push({number:pageNum,width:viewport.width,columns,lines:pageLines});
  }
  const fullText=allText.join(" ");
  const isRfaf=/REAL\s+FEDERACI[ÓO]N\s+ANDALUZA\s+DE\s+F[ÚU]TBOL/i.test(fullText)&&/CALENDARIO\s+DE\s+COMPETICIONES/i.test(fullText)&&/JORNADA/i.test(fullText);
  const season=(fullText.match(/TEMPORADA\s+(\d{4})\s*[-\/]\s*(\d{4})/i)||[]).slice(1,3).join("-");
  return {pages,lines:flatLines,fullText,model:isRfaf?"RFAF_CALENDARIO":"GENERIC",season};
}
function parseRfafCompetitionCalendar(documentData,team,competition){
  const result=[],used=new Set(),sourceCompetition=competition||"Liga RFAF";
  for(const page of documentData.pages||[]){
    for(const columnLines of page.columns||[]){
      let currentRound="",currentDate="";
      for(const rawLine of columnLines){
        const text=cleanPdfLine(rawLine);if(!text)continue;
        const jornada=text.match(/\bJornada\s+(\d+)\s*\((\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4})\)/i);
        if(jornada){currentRound=`Jornada ${jornada[1]}`;currentDate=normalizePdfDate(jornada[2]);continue}
        if(!currentRound||!currentDate)continue;
        const pair=splitTeamsFromLine(text);if(!pair)continue;
        const [home,away]=pair.map(x=>String(x||"").trim());
        const homeIsClub=pdfNameMatchesSelectedTeam(home,team),awayIsClub=pdfNameMatchesSelectedTeam(away,team);
        if(!homeIsClub&&!awayIsClub)continue;
        const venue=homeIsClub?"home":"away",opponent=homeIsClub?away:home;
        if(pdfIsByeTeam(opponent))continue;
        const key=[currentRound,currentDate,normalizePdfTeamName(opponent)].join("|");if(used.has(key))continue;used.add(key);
        const match={tempId:`rfaf_${page.number}_${currentRound.replace(/\D/g,"")}_${Date.now()}_${result.length}`,selected:true,team,competition:sourceCompetition,round:currentRound,match_date:currentDate,match_time:"",venue,home,away,opponent,location:venue==="home"?pdfDefaultHomeField(team):"",goals_for:"",goals_against:"",notes:"Importado automáticamente desde calendario RFAF",sourceModel:"RFAF"};
        match.duplicate=pdfMatchDuplicate(match);match.selected=!match.duplicate;result.push(match);
      }
    }
  }
  return result.sort((a,b)=>`${a.match_date||"9999"} ${String(a.round||"").padStart(12,"0")}`.localeCompare(`${b.match_date||"9999"} ${String(b.round||"").padStart(12,"0")}`));
}
function renderPdfPreview(){
  const body=document.getElementById("matchesPdfPreview"),button=document.getElementById("confirmMatchesImport");if(!body)return;
  body.innerHTML=pdfParsedMatches.length?pdfParsedMatches.map((m,i)=>`<tr class="${m.duplicate?"pdf-match-duplicate":""}">
    <td><input type="checkbox" data-pdf-field="selected" data-index="${i}" ${m.selected?"checked":""} ${m.duplicate?"disabled":""}></td>
    <td><input type="date" data-pdf-field="match_date" data-index="${i}" value="${esc(m.match_date)}"></td>
    <td><input type="time" data-pdf-field="match_time" data-index="${i}" value="${esc(m.match_time)}"></td>
    <td><input data-pdf-field="round" data-index="${i}" value="${esc(m.round)}"></td>
    <td><input data-pdf-field="home" data-index="${i}" value="${esc(m.home)}"></td>
    <td><input data-pdf-field="away" data-index="${i}" value="${esc(m.away)}"></td>
    <td><input data-pdf-field="location" data-index="${i}" value="${esc(m.location)}" placeholder="Campo pendiente"></td>
    <td>${m.duplicate?'<span class="match-import-existing">Ya existe</span>':'<span class="match-import-new">Nuevo</span>'}</td>
  </tr>`).join(""):'<tr><td colspan="8">Todavía no hay partidos detectados.</td></tr>';
  if(button)button.disabled=!pdfParsedMatches.some(m=>m.selected&&!m.duplicate);
  body.querySelectorAll("input").forEach(input=>input.addEventListener("change",()=>{
    const m=pdfParsedMatches[Number(input.dataset.index)],field=input.dataset.pdfField;if(!m)return;
    m[field]=input.type==="checkbox"?input.checked:input.value;
    if(field==="home"||field==="away"){
      const team=document.getElementById("pdfImportTeam")?.value||"";
      const homeMatch=pdfNameMatchesSelectedTeam(m.home,team),awayMatch=pdfNameMatchesSelectedTeam(m.away,team);
      m.venue=awayMatch&&!homeMatch?"away":"home";m.opponent=m.venue==="away"?m.home:m.away;
      if(m.venue==="home"&&!m.location)m.location=pdfDefaultHomeField(team);
    }
    if(field!=="selected"){
      m.duplicate=pdfMatchDuplicate(m);if(m.duplicate)m.selected=false;
      renderPdfPreview();
    }else if(button)button.disabled=!pdfParsedMatches.some(x=>x.selected&&!x.duplicate);
  }));
}
async function handlePdfFile(){
  const file=document.getElementById("matchesPdfFile")?.files?.[0],team=document.getElementById("pdfImportTeam")?.value||"",competitionInput=document.getElementById("pdfImportCompetition"),status=document.getElementById("matchesPdfStatus");
  let competition=competitionInput?.value.trim()||"";
  if(!file){if(status)status.textContent="Selecciona primero el archivo PDF.";toast("Selecciona primero el archivo PDF");return}
  if(!team){toast("Selecciona el equipo antes de importar");if(status)status.textContent="Selecciona el equipo antes de analizar el PDF.";return}
  try{
    if(status)status.textContent=`Leyendo ${file.name||"el PDF"} y reconociendo el calendario...`;
    const documentData=await extractPdfDocumentData(file);
    if(documentData.model==="RFAF_CALENDARIO"){
      if(!competition){competition="Liga RFAF";if(competitionInput)competitionInput.value=competition}
      pdfParsedMatches=parseRfafCompetitionCalendar(documentData,team,competition);
      const duplicates=pdfParsedMatches.filter(m=>m.duplicate).length,newMatches=pdfParsedMatches.length-duplicates;
      status.textContent=pdfParsedMatches.length?`Modelo RFAF reconocido${documentData.season?` · Temporada ${documentData.season}`:""}. ${pdfParsedMatches.length} partido(s) del CD San Bernabé detectado(s): ${newMatches} nuevo(s)${duplicates?` y ${duplicates} ya existente(s)`:""}. Las jornadas y fechas se han rellenado automáticamente; la hora queda pendiente hasta que se fije.`:"Modelo RFAF reconocido, pero no se encontró ningún partido del equipo seleccionado. Comprueba que has elegido el equipo correcto.";
    }else{
      pdfParsedMatches=parsePdfLines(documentData.lines,team,competition);
      pdfParsedMatches.forEach(m=>{m.duplicate=pdfMatchDuplicate(m);m.selected=!m.duplicate});
      const duplicates=pdfParsedMatches.filter(m=>m.duplicate).length;
      status.textContent=pdfParsedMatches.length?`${pdfParsedMatches.length} partido(s) detectado(s)${duplicates?` · ${duplicates} ya existente(s)`:""}. Revisa los datos antes de importar.`:"No se detectaron partidos automáticamente. Este PDF no coincide con el modelo RFAF reconocido ni con los formatos genéricos compatibles.";
    }
    renderPdfPreview();
  }catch(error){console.error(error);status.textContent=error.message||"No se pudo leer el PDF";pdfParsedMatches=[];renderPdfPreview()}
}
async function analyzeMatchesPdfV27245(){
  const button=document.getElementById("analyzeMatchesPdf");
  const original=button?.textContent||"Analizar PDF";
  if(button){button.disabled=true;button.textContent="Analizando...";}
  try{await handlePdfFile();}
  finally{if(button){button.disabled=false;button.textContent=original;}}
}
function ensurePdfImportBindingsV27245(){
  const file=document.getElementById("matchesPdfFile");
  const analyze=document.getElementById("analyzeMatchesPdf");
  if(file&&file.dataset.pdfBoundV27245!=="1"){
    file.dataset.pdfBoundV27245="1";
    file.addEventListener("change",()=>{
      const status=document.getElementById("matchesPdfStatus");
      if(status&&file.files?.[0])status.textContent=`PDF seleccionado: ${file.files[0].name}. Analizando...`;
      analyzeMatchesPdfV27245();
    });
  }
  if(analyze&&analyze.dataset.pdfBoundV27245!=="1"){
    analyze.dataset.pdfBoundV27245="1";
    analyze.addEventListener("click",analyzeMatchesPdfV27245);
  }
}
window.analyzeMatchesPdfV27245=analyzeMatchesPdfV27245;
window.ensurePdfImportBindingsV27245=ensurePdfImportBindingsV27245;
function addImportedRivals(matches){
  try{
    if(typeof loadRivalTeams==="function")loadRivalTeams();
    if(!Array.isArray(rivalTeams))return;
    let changed=false;
    for(const match of matches){
      const name=String(match?.opponent||"").trim();if(!name||pdfIsByeTeam(name))continue;
      if(!rivalTeams.some(r=>normalizePdfTeamName(r?.name)===normalizePdfTeamName(name))){rivalTeams.push({id:`rival_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,name,crest:""});changed=true}
    }
    if(changed&&typeof saveRivalTeams==="function")saveRivalTeams({silent:true});
  }catch(error){console.warn("No se pudieron añadir automáticamente los rivales importados",error)}
}
async function confirmPdfImport(){
  const selected=pdfParsedMatches.filter(m=>m.selected&&!m.duplicate);if(!selected.length)return;
  selected.forEach(m=>clubMatches.push({id:`match_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,team:m.team,competition:m.competition,round:m.round,match_date:m.match_date,match_time:m.match_time,venue:m.venue,opponent:m.opponent,location:m.location,goals_for:"",goals_against:"",finished:false,notes:m.notes||"Importado desde PDF"}));
  addImportedRivals(selected);saveClubMatches();document.getElementById("matchesPdfDialog")?.close();pdfParsedMatches=[];renderClubMatches();renderDashboardMatches();if(currentTeamDetailId)renderTeamDetailTab("calendar");
  await hydrateClubMatchesFromCloudV27244({migrateLocal:true});
  toast(`${selected.length} partido(s) importado(s) y sincronizado(s) automáticamente`);
}
function renderDashboardMatches(){
  const home=document.getElementById("dashboardHomeMatches"),away=document.getElementById("dashboardAwayMatches");if(!home||!away)return;
  const now=new Date(),day=(now.getDay()+6)%7,start=new Date(now);start.setHours(0,0,0,0);start.setDate(now.getDate()-day);const end=new Date(start);end.setDate(start.getDate()+7);
  const weekly=clubMatches.filter(m=>{if(!m.match_date)return false;const d=new Date(m.match_date+"T12:00:00");return d>=start&&d<end}).sort((a,b)=>`${a.match_date} ${a.match_time||""}`.localeCompare(`${b.match_date} ${b.match_time||""}`));
  const card=m=>{
    const done=matchIsPlayed(m),date=new Date(m.match_date+"T12:00:00"),home=m.venue!=="away";
    const homeName=home?m.team:m.opponent,awayName=home?m.opponent:m.team;
    const weekday=date.toLocaleDateString("es-ES",{weekday:"short"}).replace(".","").toUpperCase();
    const day=String(date.getDate()).padStart(2,"0");
    const month=date.toLocaleDateString("es-ES",{month:"short"}).replace(".","").toUpperCase();
    const score=done?`${home?esc(m.goals_for):esc(m.goals_against)} - ${home?esc(m.goals_against):esc(m.goals_for)}`:"PENDIENTE";
    return `<article class="dashboard-match-item ${home?"is-home":"is-away"}">
      <div class="dashboard-match-datebox"><span>${esc(weekday)}</span><strong>${esc(day)}</strong><small>${esc(month)}</small><em>${esc(m.match_time||"Sin hora")}</em></div>
      <div class="dashboard-match-body">
        <div class="dashboard-match-badges"><span class="dashboard-match-competition">${esc(m.competition||"Partido")}</span>${m.round?`<span class="dashboard-match-round">${esc(m.round)}</span>`:""}</div>
        <div class="dashboard-match-versus"><span class="dashboard-match-team">${crestHTML(homeName,home,m)}<strong>${esc(homeName||"Equipo")}</strong></span><b>VS</b><span class="dashboard-match-team">${crestHTML(awayName,!home,m)}<strong>${esc(awayName||"Rival")}</strong></span></div>
        <div class="dashboard-match-meta"><span>📍 ${esc(m.location||"Campo pendiente")}</span><span>${home?"🏠 En casa":"🚌 Fuera"}</span></div>
      </div>
      <div class="dashboard-match-score ${done?"is-result":"is-pending"}">${score}</div>
    </article>`;
  };
  const h=weekly.filter(m=>m.venue!=="away"),a=weekly.filter(m=>m.venue==="away");home.innerHTML=h.length?h.map(card).join(""):'<div class="dashboard-match-empty">No hay partidos en casa esta semana.</div>';away.innerHTML=a.length?a.map(card).join(""):'<div class="dashboard-match-empty">No hay partidos fuera esta semana.</div>';
}
function setupMatchesModule(){
  loadClubMatches();renderClubMatches();renderDashboardMatches();
  setTimeout(()=>hydrateClubMatchesFromCloudV27244({migrateLocal:!isTechnicalReadOnly()}),1200);
  document.querySelectorAll("[data-team-tab]").forEach(btn=>btn.addEventListener("click",()=>{document.querySelectorAll(".teams-section-tab").forEach(x=>x.classList.remove("active"));document.querySelectorAll(".teams-tab-panel").forEach(x=>x.classList.remove("active"));btn.classList.add("active");document.getElementById(btn.dataset.teamTab)?.classList.add("active");if(btn.dataset.teamTab==="matchesPanel")renderClubMatches()}));
  document.getElementById("addMatch")?.addEventListener("click",()=>openMatchDialog());
  document.getElementById("matchForm")?.addEventListener("submit",saveMatchForm);
  document.getElementById("resultForm")?.addEventListener("submit",saveResultForm);
  document.getElementById("matchCompetition")?.addEventListener("change",updateCompetitionPreview);
  document.getElementById("matchOpponent")?.addEventListener("change",e=>{document.getElementById("customOpponentWrap").hidden=e.target.value!=="__custom__"});
  document.getElementById("matchLocation")?.addEventListener("change",e=>{document.getElementById("customLocationWrap").hidden=e.target.value!=="__custom__"});
  document.getElementById("importMatchesPdf")?.addEventListener("click",()=>{fillMatchTeamSelects();pdfParsedMatches=[];const file=document.getElementById("matchesPdfFile"),status=document.getElementById("matchesPdfStatus"),competition=document.getElementById("pdfImportCompetition");if(file)file.value="";if(status)status.textContent="Selecciona un PDF RFAF para analizarlo.";if(competition&&!competition.value)competition.value="Liga RFAF";renderPdfPreview();ensurePdfImportBindingsV27245();document.getElementById("matchesPdfDialog")?.showModal()});
  ensurePdfImportBindingsV27245();
  document.getElementById("confirmMatchesImport")?.addEventListener("click",confirmPdfImport);
  ["matchesTeamFilter","matchesCompetitionFilter"].forEach(id=>document.getElementById(id)?.addEventListener("change",renderClubMatches));
  document.getElementById("matchesSearch")?.addEventListener("input",renderClubMatches);
}
const renderTeamsBeforeMatches=renderTeams;
renderTeams=function(){renderTeamsBeforeMatches();fillMatchTeamSelects();renderClubMatches()};
document.addEventListener("DOMContentLoaded",setupMatchesModule);

/* V24.5.4 - Calendario profesional, logos oficiales y registro de rivales */
const RIVAL_TEAMS_STORAGE_KEY="cdsb_rival_teams_v24_5_4";
let rivalTeams=[];
function loadRivalTeams(){try{const raw=JSON.parse(localStorage.getItem(RIVAL_TEAMS_STORAGE_KEY)||"[]");rivalTeams=Array.isArray(raw)?raw:[]}catch(_){rivalTeams=[]}}
function saveRivalTeams(options={}){
  try{
    localStorage.setItem(RIVAL_TEAMS_STORAGE_KEY,JSON.stringify(rivalTeams));
    return true;
  }catch(error){
    console.error("No se pudieron guardar los equipos rivales:",error);
    if(!options.silent){
      const quota=error?.name==="QuotaExceededError"||error?.code===22||error?.code===1014;
      toast(quota?"El navegador se ha quedado sin espacio para los escudos. El programa intentará optimizarlos automáticamente.":`No se pudieron guardar los equipos: ${error?.message||error}`);
    }
    return false;
  }
}
function imageFromSource(source){
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>resolve(img);
    img.onerror=()=>reject(new Error("No se pudo leer el escudo"));
    if(typeof source==="string")img.src=source;
    else{const url=URL.createObjectURL(source);img.onload=()=>{URL.revokeObjectURL(url);resolve(img)};img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error("No se pudo leer el escudo"))};img.src=url;}
  });
}
async function optimizeRivalCrest(source,maxSide=220){
  if(!source)return "";
  const img=await imageFromSource(source);
  const naturalW=Math.max(1,img.naturalWidth||img.width||1),naturalH=Math.max(1,img.naturalHeight||img.height||1);
  const scale=Math.min(1,maxSide/Math.max(naturalW,naturalH));
  const canvas=document.createElement("canvas");
  canvas.width=Math.max(1,Math.round(naturalW*scale));
  canvas.height=Math.max(1,Math.round(naturalH*scale));
  const ctx=canvas.getContext("2d",{alpha:true});
  ctx.imageSmoothingEnabled=true;
  ctx.imageSmoothingQuality="high";
  ctx.drawImage(img,0,0,canvas.width,canvas.height);
  let data=canvas.toDataURL("image/webp",.78);
  if(!String(data).startsWith("data:image/webp"))data=canvas.toDataURL("image/png");
  return data;
}
async function compactStoredRivalCrests(force=false){
  let changed=false;
  for(const rival of rivalTeams){
    const crest=String(rival?.crest||"");
    if(!crest||(!force&&crest.length<70000&&crest.startsWith("data:image/webp")))continue;
    try{
      const optimized=await optimizeRivalCrest(crest);
      if(optimized&&optimized.length<crest.length){rival.crest=optimized;changed=true;}
    }catch(error){console.warn("No se pudo optimizar el escudo de",rival?.name,error);}
  }
  if(changed)saveRivalTeams({silent:true});
  return changed;
}
function updateRivalTeamsCount(){
  const el=document.getElementById("rivalTeamsCount");
  if(el)el.textContent=`${rivalTeams.length} equipo${rivalTeams.length===1?"":"s"} rival${rivalTeams.length===1?"":"es"}`;
}
function rivalByName(name){return rivalTeams.find(r=>String(r.name).trim().toLowerCase()===String(name||"").trim().toLowerCase())}
function crestHTML(name,club=false,match=null){const r=rivalByName(name),src=club?"assets/escudo-oficial.png":(r?.crest||match?.opponent_crest||"");return src?`<span class="match-team-crest"><img src="${src}" alt="Escudo ${esc(name)}"></span>`:`<span class="match-team-crest fallback">${esc(String(name||"?").trim().charAt(0).toUpperCase())}</span>`}
const COMPETITION_IMAGES={"Liga AAFB":"assets/competitions/liga-aafb.png","Copa Primavera":"assets/competitions/copa-primavera.png","Liga RFAF":"assets/competitions/liga-rfaf.png"};
competitionLogoHTML=function(name,compact=false){const src=COMPETITION_IMAGES[name],m=COMPETITION_META[name]||{abbr:"?",label:name||"Sin competición",className:"other"},label=m.label;return src?`<span class="competition-logo official ${compact?"compact":""}"><img src="${src}" alt="${esc(label)}"><small>${esc(label)}</small></span>`:`<span class="competition-logo ${m.className} ${compact?"compact":""}"><b>${esc(m.abbr)}</b><small>${esc(label)}</small></span>`};
knownOpponents=function(){return [...new Set([...rivalTeams.map(r=>r.name),...clubMatches.map(m=>String(m.opponent||"").trim())].filter(Boolean))].sort((a,b)=>a.localeCompare(b,"es",{sensitivity:"base"}))};
populateOpponentSelect=function(value=""){const el=document.getElementById("matchOpponent");if(!el)return;const names=knownOpponents();el.innerHTML='<option value="">Selecciona equipo rival</option>'+names.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join("")+'<option value="__custom__">+ Crear equipo rival...</option>';if(value&&names.includes(value))el.value=value;else if(value){el.value="__custom__";const input=document.querySelector('#matchForm [name="opponent_custom"]');if(input)input.value=value}document.getElementById("customOpponentWrap").hidden=el.value!=="__custom__"};
function updateCompetitionPreviewV254(){const name=document.getElementById("matchCompetition")?.value||"",box=document.getElementById("competitionLogoPreview");if(box)box.innerHTML=name?competitionLogoHTML(name):'<span>Selecciona una competición</span>'}
updateCompetitionPreview=updateCompetitionPreviewV254;

function resetRivalTeamForm(){const f=document.getElementById("rivalTeamForm");if(!f)return;f.reset();f.elements.id.value="";document.getElementById("rivalCrestPreview").innerHTML='<span>Sin escudo</span>'}
function renderRivalTeams(){const box=document.getElementById("rivalTeamsList");if(!box)return;updateRivalTeamsCount();box.innerHTML=rivalTeams.length?sortByAlpha(rivalTeams,r=>r.name).map(r=>`<article class="rival-team-row">${r.crest?`<img src="${r.crest}" alt="Escudo ${esc(r.name)}">`:`<span class="rival-initial">${esc(r.name.charAt(0))}</span>`}<strong>${esc(r.name)}</strong><div><button type="button" class="mini" data-edit-rival="${r.id}">Editar</button><button type="button" class="mini danger-mini" data-delete-rival="${r.id}">Eliminar</button></div></article>`).join(""):'<div class="team-tab-empty">Aún no hay equipos rivales registrados.</div>'}
window.openRivalTeamsManager=async()=>{loadRivalTeams();await compactStoredRivalCrests();resetRivalTeamForm();renderRivalTeams();document.getElementById("rivalTeamsDialog")?.showModal()};
async function fileToDataURL(file){return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file)})}
async function saveRivalTeamForm(e){
  e.preventDefault();
  const f=e.currentTarget,id=f.elements.id.value,name=f.elements.name.value.trim(),file=f.elements.crest.files?.[0];
  if(!name)return toast("Escribe el nombre del equipo");
  const duplicate=rivalTeams.find(r=>r.name.toLowerCase()===name.toLowerCase()&&r.id!==id);
  if(duplicate)return toast("Ese equipo ya está registrado");
  const oldRival=id?rivalTeams.find(r=>r.id===id):null;
  const oldName=oldRival?.name||name;
  let crest=id?oldRival?.crest||"":"";
  if(file){
    try{crest=await optimizeRivalCrest(file);}catch(error){return toast(error?.message||"No se pudo procesar el escudo");}
  }
  const previous=rivalTeams.map(r=>({...r}));
  if(id){const i=rivalTeams.findIndex(r=>r.id===id);if(i>=0)rivalTeams[i]={...rivalTeams[i],name,crest};}
  else rivalTeams.push({id:`rival_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,name,crest});
  let stored=saveRivalTeams({silent:true});
  if(!stored){
    await compactStoredRivalCrests(true);
    stored=saveRivalTeams({silent:true});
  }
  if(!stored){
    rivalTeams=previous;
    saveRivalTeams({silent:true});
    renderRivalTeams();
    return toast("No se pudo guardar el equipo porque el almacenamiento del navegador está lleno. Prueba a recargar: los escudos antiguos se optimizarán automáticamente.");
  }
  const normalizeRivalLink=value=>String(value||"").trim().toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  const affected=clubMatches.filter(match=>normalizeRivalLink(match.opponent)===normalizeRivalLink(oldName)||normalizeRivalLink(match.opponent)===normalizeRivalLink(name));
  for(const match of affected){
    if(id&&normalizeRivalLink(match.opponent)===normalizeRivalLink(oldName))match.opponent=name;
    match.opponent_crest=crest||"";
  }
  saveClubMatches();
  if(affected.length&&!isTechnicalReadOnly()&&!isHistoricalSeason()){
    for(const match of affected)await saveClubMatchCloudV27244(match,{silent:true});
  }
  resetRivalTeamForm();renderRivalTeams();populateOpponentSelect();toast(id?`Equipo actualizado y escudo aplicado a ${affected.length} partido${affected.length===1?"":"s"}`:"Equipo rival añadido");
}

const originalRenderTeamDetailTabV254=window.renderTeamDetailTab;
window.renderTeamDetailTab=function(tab){originalRenderTeamDetailTabV254(tab);if(tab!=="calendar")return;const actions=document.querySelector(".team-calendar-actions");if(actions&&!actions.querySelector(".manage-rivals")){const b=document.createElement("button");b.type="button";b.className="secondary manage-rivals";b.textContent="Equipos y escudos";b.addEventListener("click",openRivalTeamsManager);actions.prepend(b)}document.querySelectorAll(".team-match-card").forEach((card,index)=>{const t=teams.find(x=>x.id===currentTeamDetailId),matches=clubMatches.filter(m=>String(m.team||"").trim()===String(t?.name||"").trim()).sort((a,b)=>`${a.match_date||"9999"} ${a.match_time||""}`.localeCompare(`${b.match_date||"9999"} ${b.match_time||""}`)),m=matches[index];if(!m)return;const heading=card.querySelector(".team-match-heading");if(heading&&!heading.querySelector(".match-versus-layout")){const home=m.venue!=="away",left=home?m.team:m.opponent,right=home?m.opponent:m.team;heading.innerHTML=`${competitionLogoHTML(m.competition,true)}<div class="match-versus-layout"><div class="match-side">${crestHTML(left,left===m.team)}<strong>${esc(left)}</strong></div><span class="match-vs">VS</span><div class="match-side">${crestHTML(right,right===m.team)}<strong>${esc(right)}</strong></div><p>${esc(m.round||"Sin jornada")} · ${esc(m.location||"Campo pendiente")}</p></div>`}})};

const openMatchDialogV254=openMatchDialog;
openMatchDialog=function(match=null,presetTeam=""){loadRivalTeams();openMatchDialogV254(match,presetTeam);populateOpponentSelect(match?.opponent||"");updateCompetitionPreviewV254()};
window.openTeamMatchDialog=team=>openMatchDialog(null,team);
window.editClubMatch=id=>{const m=clubMatches.find(x=>x.id===id);if(!m)return toast("Partido no encontrado");openMatchDialog(m)};

async function repairRivalCrestsWebV27247(){
  if(isTechnicalReadOnly()||isHistoricalSeason())return;
  let changed=0;
  for(const match of clubMatches){
    const expected=rivalByName(match.opponent)?.crest||"";
    if(String(match.opponent_crest||"")===String(expected))continue;
    match.opponent_crest=expected;
    changed++;
    await saveClubMatchCloudV27244(match,{silent:true});
  }
  if(changed){saveClubMatches();renderClubMatches();renderDashboardMatches();if(currentTeamDetailId)renderTeamDetailTab("calendar");}
}
async function setupV254(){loadRivalTeams();await compactStoredRivalCrests();renderRivalTeams();setTimeout(repairRivalCrestsWebV27247,2200);document.getElementById("rivalTeamForm")?.addEventListener("submit",saveRivalTeamForm);document.getElementById("cancelRivalEdit")?.addEventListener("click",resetRivalTeamForm);document.querySelector('#rivalTeamForm [name="crest"]')?.addEventListener("change",async e=>{const file=e.target.files?.[0];if(file)document.getElementById("rivalCrestPreview").innerHTML=`<img src="${await fileToDataURL(file)}" alt="Vista previa">`});document.getElementById("rivalTeamsList")?.addEventListener("click",e=>{const edit=e.target.closest("[data-edit-rival]"),del=e.target.closest("[data-delete-rival]");if(edit){const r=rivalTeams.find(x=>x.id===edit.dataset.editRival),f=document.getElementById("rivalTeamForm");if(!r||!f)return;f.elements.id.value=r.id;f.elements.name.value=r.name;document.getElementById("rivalCrestPreview").innerHTML=r.crest?`<img src="${r.crest}" alt="Escudo">`:'<span>Sin escudo</span>';f.elements.name.focus()}if(del){const r=rivalTeams.find(x=>x.id===del.dataset.deleteRival);if(r&&confirm(`¿Eliminar ${r.name}?`)){rivalTeams=rivalTeams.filter(x=>x.id!==r.id);saveRivalTeams();renderRivalTeams();toast("Equipo eliminado")}}});document.getElementById("matchCompetition")?.addEventListener("change",updateCompetitionPreviewV254);document.querySelectorAll('[data-close="rivalTeamsDialog"]').forEach(b=>b.addEventListener("click",()=>document.getElementById("rivalTeamsDialog")?.close()))}
document.addEventListener("DOMContentLoaded",setupV254);


/* V24.5.5 - Reparación botón Nuevo partido */
function openTeamMatchDialogSafe(teamName){
  try{
    loadRivalTeams();
    const dialog=document.getElementById("matchDialog");
    const form=document.getElementById("matchForm");
    if(!dialog||!form){toast("No se pudo abrir el formulario del partido");return;}
    fillMatchTeamSelects();
    form.reset();
    form.elements.id.value="";
    form.elements.team.value=teamName||"";
    form.elements.competition.value="";
    populateMatchRoundSelect("");
    form.elements.match_date.value="";
    form.elements.match_time.value="";
    form.elements.venue.value="home";
    populateOpponentSelect("");
    populateLocationSelect("");
    form.elements.notes.value="";
    updateCompetitionPreviewV254();
    document.getElementById("matchDialogTitle").textContent="Nuevo partido";
    if(typeof dialog.showModal==="function") dialog.showModal(); else dialog.setAttribute("open","");
  }catch(error){
    console.error("Error al abrir Nuevo partido:",error);
    toast("Error al abrir el formulario: "+(error?.message||error));
  }
}
window.openTeamMatchDialog=openTeamMatchDialogSafe;

document.addEventListener("click",function(event){
  const button=event.target.closest("[data-new-team-match]");
  if(!button)return;
  event.preventDefault();
  window.openTeamMatchDialog(button.dataset.newTeamMatch||"");
});

/* V24.5.6 — Apertura fiable de formularios desde la ficha del equipo */
let reopenTeamCalendarAfterChild=false;
function closeTeamDetailBeforeChild(){
  const detail=document.getElementById("teamDetailDialog");
  reopenTeamCalendarAfterChild=Boolean(detail?.open && currentTeamDetailId);
  if(detail?.open) detail.close();
}
function reopenTeamCalendar(){
  if(!reopenTeamCalendarAfterChild||!currentTeamDetailId)return;
  reopenTeamCalendarAfterChild=false;
  const detail=document.getElementById("teamDetailDialog");
  if(!detail)return;
  renderTeamDetailTab("calendar");
  try{detail.showModal()}catch(_){detail.setAttribute("open","")}
}
window.openTeamMatchDialog=function(teamName){
  closeTeamDetailBeforeChild();
  requestAnimationFrame(()=>openTeamMatchDialogSafe(teamName||""));
};
window.editClubMatch=function(id){
  const match=clubMatches.find(x=>x.id===id);
  if(!match)return toast("Partido no encontrado");
  closeTeamDetailBeforeChild();
  requestAnimationFrame(()=>openMatchDialog(match));
};
window.openResultDialog=function(id){
  const match=clubMatches.find(x=>x.id===id);
  if(!match)return toast("Partido no encontrado");
  closeTeamDetailBeforeChild();
  requestAnimationFrame(()=>openResultDialog(id));
};
document.addEventListener("DOMContentLoaded",()=>{
  ["matchDialog","resultDialog"].forEach(id=>{
    const dialog=document.getElementById(id);
    dialog?.addEventListener("close",()=>setTimeout(reopenTeamCalendar,0));
  });
});

/* V24.5.7 — Corrección definitiva al editar partidos desde la ficha del equipo */
(function(){
  let parentTeamId="";
  let returnToCalendar=false;

  function openAfterTeamDetailCloses(openChild){
    const detail=document.getElementById("teamDetailDialog");
    parentTeamId=currentTeamDetailId||"";
    returnToCalendar=Boolean(detail?.open && parentTeamId);

    const run=()=>{
      setTimeout(()=>{
        try{ openChild(); }
        catch(error){
          console.error("Error al abrir el formulario del partido:",error);
          toast("No se pudo abrir el partido: "+(error?.message||error));
          restoreTeamCalendar();
        }
      },80);
    };

    if(detail?.open){
      detail.addEventListener("close",run,{once:true});
      detail.close();
    }else run();
  }

  function restoreTeamCalendar(){
    if(!returnToCalendar||!parentTeamId)return;
    returnToCalendar=false;
    currentTeamDetailId=parentTeamId;
    const detail=document.getElementById("teamDetailDialog");
    if(!detail)return;
    renderTeamDetailTab("calendar");
    setTimeout(()=>{
      try{ detail.showModal(); }
      catch(_){ detail.setAttribute("open",""); }
    },80);
  }

  window.openTeamMatchDialog=function(teamName){
    openAfterTeamDetailCloses(()=>openTeamMatchDialogSafe(teamName||""));
  };

  window.editClubMatch=function(id){
    const match=clubMatches.find(x=>String(x.id)===String(id));
    if(!match)return toast("Partido no encontrado");
    openAfterTeamDetailCloses(()=>openMatchDialog(match));
  };

  const openResultDialogOriginal=openResultDialog;
  window.openResultDialog=function(id){
    const match=clubMatches.find(x=>String(x.id)===String(id));
    if(!match)return toast("Partido no encontrado");
    openAfterTeamDetailCloses(()=>openResultDialogOriginal(id));
  };

  document.addEventListener("DOMContentLoaded",()=>{
    ["matchDialog","resultDialog"].forEach(id=>{
      const dialog=document.getElementById(id);
      if(!dialog)return;
      dialog.addEventListener("close",()=>setTimeout(restoreTeamCalendar,50));
    });
  });
})();


// V27.2.19 · Usuarios técnicos multiequipo + selector por dispositivo
let currentAccess={role:"admin",team_id:null,display_name:"Administrador",active:true};
let teamUserProfiles=[];
let currentTechnicalTeams=[];
const TECH_TEAM_CHOICE_KEY="cdsb_technical_selected_team_v27219";
const teamUsersBody=document.getElementById("teamUsersBody");
const teamUserDialog=document.getElementById("teamUserDialog");
const teamUserForm=document.getElementById("teamUserForm");
const addTeamUser=document.getElementById("addTeamUser");
const usersSetupWarning=document.getElementById("usersSetupWarning");
const technicalTeamChooser=document.getElementById("technicalTeamChooser");
const technicalTeamChoices=document.getElementById("technicalTeamChoices");
const switchTechnicalTeam=document.getElementById("switchTechnicalTeam");
const teamDetailSwitchTechnicalTeam=document.getElementById("teamDetailSwitchTechnicalTeam");

function isTechnicalReadOnly(){return currentAccess?.role==="technical"}
async function loadCurrentAccess(){
  currentAccess={role:"admin",team_id:null,display_name:"Administrador",active:true};
  if(window.__technicalAccess){
    currentAccess={...window.__technicalAccess,role:"technical",active:true};
    return;
  }
  const token=getTechnicalSessionToken();
  if(token){
    const {data,error}=await sb.rpc("technical_session",{p_token:token});
    const profile=Array.isArray(data)?data[0]:data;
    if(!error&&profile){window.__technicalAccess=profile;currentAccess={...profile,role:"technical",active:true};return}
    clearTechnicalSession();
  }
}
async function loadTeamUserProfiles(){
  if(isTechnicalReadOnly())return;
  const profilesResult=await sb.rpc("admin_list_technical_users");
  if(profilesResult.error){
    teamUserProfiles=[];
    if(usersSetupWarning){usersSetupWarning.classList.remove("hidden");usersSetupWarning.textContent="Falta preparar el sistema de usuarios. Revisa la instalación SQL de accesos técnicos."}
    renderTeamUsers();
    return;
  }
  teamUserProfiles=profilesResult.data||[];
  let mappingResult=await sb.rpc("admin_list_technical_user_teams_v27230");
  if(mappingResult.error){
    mappingResult=await sb.rpc("admin_list_technical_user_teams_v27225");
  }
  if(mappingResult.error){
    mappingResult=await sb.rpc("admin_list_technical_user_teams_v27224");
  }
  if(mappingResult.error){
    mappingResult=await sb.rpc("admin_list_technical_user_teams_v27223");
  }
  if(mappingResult.error){
    mappingResult=await sb.rpc("admin_list_technical_user_teams_v27219");
  }
  if(!mappingResult.error&&Array.isArray(mappingResult.data)){
    const byUser=new Map();
    mappingResult.data.forEach(row=>{
      const key=String(row.technical_user_id||"");
      if(!byUser.has(key))byUser.set(key,[]);
      byUser.get(key).push(row);
    });
    teamUserProfiles=teamUserProfiles.map(user=>{
      const rows=byUser.get(String(user.id))||[];
      const ids=rows.map(r=>r.team_id).filter(Boolean);
      const names=rows.map(r=>r.team_name).filter(Boolean);
      const primary=rows.find(r=>r.is_primary)?.team_id||user.team_id||ids[0]||null;
      return {...user,team_ids:ids.length?ids:(user.team_id?[user.team_id]:[]),team_names:names,primary_team_id:primary};
    });
    usersSetupWarning?.classList.add("hidden");
  }else{
    teamUserProfiles=teamUserProfiles.map(user=>({...user,team_ids:user.team_id?[user.team_id]:[],team_names:[],primary_team_id:user.team_id||null}));
    if(usersSetupWarning){
      usersSetupWarning.classList.remove("hidden");
      usersSetupWarning.textContent="Para detectar automáticamente todos los equipos de cada entrenador ejecuta EJECUTAR_ACTUALIZACION_V27_2_25.sql.";
    }
  }
  renderTeamUsers();
}
function credentialHtml(u){
  const pwd=u.initial_password||"";
  if(!pwd)return '<span class="credential-unavailable">Personalizada / no disponible</span>';
  return `<div class="password-cell"><code id="pwd-${u.id}" data-password="${esc(pwd)}">••••••••</code><button class="mini" type="button" onclick="toggleTeamUserPassword('${u.id}',this)" title="Mostrar u ocultar">👁</button><button class="mini" type="button" onclick="copyTeamUserPassword('${u.id}')" title="Copiar">📋</button></div>`;
}
function teamNamesForUser(u){
  if(Array.isArray(u.team_names)&&u.team_names.length)return u.team_names;
  const ids=Array.isArray(u.team_ids)&&u.team_ids.length?u.team_ids:(u.team_id?[u.team_id]:[]);
  return ids.map(id=>teams.find(t=>String(t.id)===String(id))?.name).filter(Boolean);
}
function renderTeamUsers(){
  if(!teamUsersBody)return;
  const orderedProfiles=sortByAlpha(teamUserProfiles,u=>`${u.display_name||""} ${u.username||""}`);
  teamUsersBody.innerHTML=orderedProfiles.length?orderedProfiles.map(u=>{
    const names=teamNamesForUser(u);
    let status='<span class="badge ok">Activo</span>';
    if(u.active===false)status='<span class="badge warn">Inactivo</span>';
    else if(!u.password_ready)status='<span class="badge bad">Falta contraseña</span>';
    else if(u.locked_until&&new Date(u.locked_until)>new Date())status='<span class="badge warn">Bloqueado temporalmente</span>';
    const last=u.last_login_at?`<br><small>Último acceso: ${new Date(u.last_login_at).toLocaleString("es-ES")}</small>`:'<br><small>Sin accesos todavía</small>';
    return `<tr><td><strong>${esc(u.display_name||"-")}</strong></td><td><code>${esc(u.username||"-")}</code></td><td>${names.length?names.map(esc).join("<br>"):"Sin equipo"}</td><td>${esc(u.role_label||"Cuerpo técnico")}</td><td>${credentialHtml(u)}</td><td>${status}${last}</td><td class="user-actions"><button class="mini" onclick="editTeamUser('${u.id}')">✏️ Editar</button><button class="mini" onclick="resetTeamUserPassword('${u.id}')">🔄 Restablecer</button><button class="mini" onclick="printTeamUserCredentials('${u.id}')">🖨️ Imprimir</button><button class="mini whatsapp-btn" onclick="shareTeamUserCredentials('${u.id}')" title="Enviar credenciales por WhatsApp"><svg class="whatsapp-icon" viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M19.11 17.21c-.26-.13-1.54-.76-1.78-.85-.24-.09-.41-.13-.59.13-.17.26-.67.85-.83 1.02-.15.17-.3.2-.56.07-.26-.13-1.1-.4-2.09-1.29-.77-.69-1.29-1.54-1.44-1.8-.15-.26-.02-.4.11-.53.12-.12.26-.3.39-.46.13-.15.17-.26.26-.43.09-.17.04-.33-.02-.46-.07-.13-.59-1.41-.8-1.94-.21-.51-.43-.44-.59-.45h-.5c-.17 0-.46.07-.7.33-.24.26-.91.89-.91 2.17s.93 2.52 1.06 2.69c.13.17 1.83 2.8 4.44 3.93.62.27 1.11.43 1.49.55.63.2 1.2.17 1.65.1.5-.07 1.54-.63 1.76-1.24.22-.61.22-1.13.15-1.24-.06-.11-.24-.17-.5-.3z"/><path fill="currentColor" d="M16.03 3.2A12.7 12.7 0 0 0 5.02 22.25L3.2 28.8l6.71-1.76A12.68 12.68 0 1 0 16.03 3.2zm0 23.22c-2.12 0-4.19-.57-5.99-1.65l-.43-.25-3.98 1.04 1.06-3.88-.28-.45a10.5 10.5 0 1 1 9.62 5.19z"/></svg><span>WhatsApp</span></button><button class="mini danger-mini" onclick="deleteTeamUser('${u.id}')">Eliminar</button></td></tr>`;
  }).join(""):'<tr><td colspan="7">No hay accesos creados.</td></tr>';
}
window.toggleTeamUserPassword=(id,btn)=>{
  const el=document.getElementById(`pwd-${id}`);if(!el)return;
  const visible=el.textContent!=="••••••••";
  el.textContent=visible?"••••••••":el.dataset.password;
  if(btn)btn.textContent=visible?"👁":"🙈";
};
window.copyTeamUserPassword=async id=>{
  const u=teamUserProfiles.find(x=>String(x.id)===String(id));
  if(!u?.initial_password)return toast("La contraseña inicial no está disponible. Restablécela para guardar una nueva.");
  try{await navigator.clipboard.writeText(u.initial_password);toast("Contraseña copiada")}catch{toast("No se pudo copiar la contraseña")}
};
function slugCredential(value){return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"")}
function selectedTeamUserIds(){
  return [...document.querySelectorAll('#teamUserTeamChoices input[type="checkbox"]:checked')].map(input=>input.value).filter(Boolean);
}
function syncTeamUserPrimary(){
  if(!teamUserForm)return;
  const ids=selectedTeamUserIds();
  teamUserForm.elements.team_id.value=ids[0]||"";
}
function generatedUsername(){
  const role=slugCredential(teamUserForm?.elements.role_label?.value||"tecnico").replace("segundo_entrenador","2ent").replace("entrenador","ent").replace("delegado","delegado").replace("encargado_del_material","material").replace("cuerpo_tecnico","tecnico");
  syncTeamUserPrimary();
  const team=teams.find(t=>String(t.id)===String(teamUserForm?.elements.team_id?.value));
  return [role,slugCredential(team?.name||"equipo")].filter(Boolean).join("_").slice(0,40);
}
function generatedPassword(){
  const chars="ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes=crypto.getRandomValues(new Uint8Array(10));
  return "SB!"+Array.from(bytes,b=>chars[b%chars.length]).join("");
}
document.getElementById("generateUsername")?.addEventListener("click",()=>{teamUserForm.elements.username.value=generatedUsername()});
document.getElementById("generatePassword")?.addEventListener("click",()=>{teamUserForm.elements.password.value=generatedPassword()});
async function saveTechnicalUserTeams(userId,teamIds,primaryTeamId){
  const {error}=await sb.rpc("admin_set_technical_user_teams_v27219",{p_id:userId,p_team_ids:teamIds,p_primary_team_id:primaryTeamId});
  if(error)throw new Error("No se pudieron guardar los equipos asignados: "+(error.message||"Ejecuta el SQL V27.2.19"));
}
async function findTechnicalUserId(username){
  const {data,error}=await sb.rpc("admin_technical_user_id_v27219",{p_username:username});
  if(error)throw error;
  return data||null;
}
window.resetTeamUserPassword=async id=>{
  const u=teamUserProfiles.find(x=>String(x.id)===String(id));if(!u)return;
  const suggested=generatedPassword();
  const password=prompt(`Nueva contraseña para ${u.display_name}:`,suggested);
  if(password===null)return;
  if(password.length<6)return toast("La contraseña debe tener al menos 6 caracteres");
  try{
    const salt=randomHex(16),iterations=TECH_PBKDF2_ITERATIONS;
    const hash=await deriveTechnicalPassword(password,salt,iterations);
    const primary=u.primary_team_id||u.team_id||u.team_ids?.[0]||null;
    const {data,error}=await sb.rpc("admin_save_technical_user",{p_id:u.id,p_username:u.username,p_password_hash:hash,p_password_salt:salt,p_password_iterations:iterations,p_initial_password:password,p_display_name:u.display_name,p_role_label:u.role_label,p_team_id:primary,p_active:u.active!==false});
    if(error)throw error;const result=Array.isArray(data)?data[0]:data;if(result?.error_message)throw new Error(result.error_message);
    if(Array.isArray(u.team_ids)&&u.team_ids.length)await saveTechnicalUserTeams(u.id,u.team_ids,primary);
    u.initial_password=password;u.password_ready=true;u.failed_attempts=0;u.locked_until=null;
    renderTeamUsers();toast("Contraseña restablecida correctamente");
    await loadTeamUserProfiles();
    const refreshed=teamUserProfiles.find(x=>String(x.id)===String(id));
    if(refreshed&&!refreshed.initial_password){refreshed.initial_password=password;refreshed.password_ready=true;renderTeamUsers();}
  }catch(error){toast("No se pudo restablecer: "+(error.message||error))}
};
function getCredentialUser(id){return teamUserProfiles.find(x=>String(x.id)===String(id))}
function credentialText(u){
  const names=teamNamesForUser(u);
  return `CD SAN BERNABÉ MANAGER\n\nEquipos: ${names.join(", ")||"Sin equipo"}\nCargo: ${u.role_label||"Cuerpo técnico"}\nUsuario: ${u.username}\nContraseña: ${u.initial_password||"Restablecer desde el panel"}\n\nAcceso: ${location.origin}`;
}
window.printTeamUserCredentials=id=>{
  const u=getCredentialUser(id);if(!u)return;
  const names=teamNamesForUser(u);
  const w=window.open("","_blank","noopener,noreferrer");if(!w)return toast("El navegador ha bloqueado la impresión");
  w.document.write(`<html><head><title>Credenciales ${esc(u.display_name)}</title><style>body{font-family:Arial;padding:45px;color:#102a43}.card{border:3px solid #0b4da2;border-radius:18px;padding:35px;max-width:560px;margin:auto}h1{color:#0b4da2}.row{padding:12px 0;border-bottom:1px solid #ddd}.label{font-size:12px;color:#667;text-transform:uppercase}.value{font-size:22px;font-weight:700;margin-top:4px}.note{margin-top:25px;font-size:12px;color:#667}</style></head><body><div class="card"><h1>CD SAN BERNABÉ</h1><h2>Credenciales de acceso</h2><div class="row"><div class="label">Nombre</div><div class="value">${esc(u.display_name)}</div></div><div class="row"><div class="label">Equipos</div><div class="value">${esc(names.join(", ")||"Sin equipo")}</div></div><div class="row"><div class="label">Cargo</div><div class="value">${esc(u.role_label||"Cuerpo técnico")}</div></div><div class="row"><div class="label">Usuario</div><div class="value">${esc(u.username)}</div></div><div class="row"><div class="label">Contraseña</div><div class="value">${esc(u.initial_password||"Restablecer desde el panel")}</div></div><div class="row"><div class="label">Dirección de acceso</div><div class="value" style="font-size:15px">${esc(location.origin)}</div></div><p class="note">Si tienes varios equipos, al acceder podrás elegir cuál quieres abrir en este dispositivo.</p></div><script>window.onload=()=>window.print()<\/script></body></html>`);w.document.close();
};
window.shareTeamUserCredentials=id=>{
  const u=getCredentialUser(id);if(!u)return;
  if(!u.initial_password)return toast("Restablece primero la contraseña para poder enviarla");
  window.open(`https://wa.me/?text=${encodeURIComponent("Hola. Estas son tus credenciales de acceso al CD San Bernabé Manager:\n\n"+credentialText(u))}`,"_blank","noopener");
};
function fillTeamUserTeams(selected=[]){
  if(!teamUserForm)return;
  const container=document.getElementById("teamUserTeamChoices");if(!container)return;
  const selectedSet=new Set((Array.isArray(selected)?selected:[selected]).filter(Boolean).map(String));
  container.innerHTML=sortTeamsAlpha(teams).map(team=>`<label class="team-user-team-option"><input type="checkbox" value="${esc(team.id)}" ${selectedSet.has(String(team.id))?"checked":""}><span><strong>${esc(team.name)}</strong><small>${esc([team.age_category,team.category].filter(Boolean).join(" · "))}</small></span></label>`).join("")||'<p>No hay equipos disponibles.</p>';
  container.querySelectorAll('input[type="checkbox"]').forEach(input=>input.addEventListener("change",syncTeamUserPrimary));
  syncTeamUserPrimary();
}
addTeamUser?.addEventListener("click",()=>{
  teamUserForm.reset();teamUserForm.elements.id.value="";teamUserForm.elements.password.required=true;fillTeamUserTeams([]);teamUserForm.elements.password.value=generatedPassword();teamUserDialog.showModal();
});
window.editTeamUser=id=>{
  const u=teamUserProfiles.find(x=>String(x.id)===String(id));if(!u)return;
  teamUserForm.reset();fillTeamUserTeams(u.team_ids?.length?u.team_ids:(u.team_id?[u.team_id]:[]));
  ["id","display_name","role_label","username"].forEach(k=>teamUserForm.elements[k].value=u[k]||"");
  teamUserForm.elements.active.value=String(u.active!==false);
  syncTeamUserPrimary();
  teamUserForm.elements.password.required=false;teamUserForm.elements.password.placeholder="Dejar vacío para conservarla";
  teamUserDialog.showModal();
};
teamUserForm?.addEventListener("submit",async e=>{
  e.preventDefault();
  syncTeamUserPrimary();
  const raw=Object.fromEntries(new FormData(teamUserForm));
  const teamIds=selectedTeamUserIds();
  try{
    const username=(raw.username||"").trim().toLowerCase();
    if(!/^[a-z0-9._-]{3,40}$/.test(username))throw new Error("El usuario solo puede contener letras, números, punto, guion y guion bajo");
    if(!teamIds.length)throw new Error("Selecciona al menos un equipo");
    const primaryTeamId=teamIds[0];
    if(!raw.id&&(!raw.password||raw.password.length<6))throw new Error("La contraseña debe tener al menos 6 caracteres");
    let passwordHash=null,passwordSalt=null,passwordIterations=null;
    if(raw.password){
      if(raw.password.length<6)throw new Error("La contraseña debe tener al menos 6 caracteres");
      passwordSalt=randomHex(16);passwordIterations=TECH_PBKDF2_ITERATIONS;
      passwordHash=await deriveTechnicalPassword(raw.password,passwordSalt,passwordIterations);
    }
    const {data,error}=await sb.rpc("admin_save_technical_user",{
      p_id:raw.id||null,p_username:username,p_password_hash:passwordHash,p_password_salt:passwordSalt,p_password_iterations:passwordIterations,p_initial_password:raw.password||null,
      p_display_name:raw.display_name.trim(),p_role_label:raw.role_label,p_team_id:primaryTeamId,p_active:raw.active==="true"
    });
    if(error)throw error;
    const result=Array.isArray(data)?data[0]:data;
    if(result?.error_message)throw new Error(result.error_message);
    let savedId=raw.id||result?.id||result?.user_id||null;
    if(!savedId)savedId=await findTechnicalUserId(username);
    if(!savedId)throw new Error("No se pudo identificar el usuario recién guardado");
    await saveTechnicalUserTeams(savedId,teamIds,primaryTeamId);
    toast(raw.id?"Acceso actualizado":"Usuario creado");
    teamUserDialog.close();await loadTeamUserProfiles();
  }catch(error){console.error(error);toast("Usuarios: "+(error.message||"No se pudo guardar"))}
});
window.deleteTeamUser=async id=>{
  if(!confirm("¿Eliminar definitivamente este acceso?"))return;
  const {data,error}=await sb.rpc("admin_delete_technical_user",{p_id:id});
  if(error)return toast("No se pudo eliminar el acceso: "+error.message);
  toast("Acceso eliminado");await loadTeamUserProfiles();
};

function parseTechnicalBundleV27230(data){
  let payload=Array.isArray(data)?data[0]:data;
  if(typeof payload==="string"){
    try{payload=JSON.parse(payload)}catch(_){return null}
  }
  return payload&&typeof payload==="object"?payload:null;
}

async function readTechnicalBundleV27230(){
  const token=getTechnicalSessionToken();
  if(!token)throw new Error("No hay una sesión del cuerpo técnico activa.");
  const {data,error}=await sb.rpc("technical_access_bundle_v27230",{p_token:token});
  if(error){const msg=error.message||"error desconocido";throw new Error("No se pudieron cargar los equipos del acceso técnico: "+msg+(msg.includes("technical_access_bundle_v27230")||msg.includes("schema cache")?". Ejecuta el SQL V27.2.30 en Supabase.":""));}
  const bundle=parseTechnicalBundleV27230(data);
  if(!bundle?.ok)throw new Error(bundle?.message||"No se pudo validar el acceso técnico.");
  const rows=Array.isArray(bundle.teams)?bundle.teams:[];
  const teamsUnique=[];
  const seen=new Set();
  for(const row of rows){
    const id=String(row?.team_id||"");
    if(!id||seen.has(id))continue;
    seen.add(id);teamsUnique.push(row);
  }
  const expected=Number(bundle.team_count||teamsUnique.length);
  if(expected!==teamsUnique.length){
    throw new Error(`La base de datos indica ${expected} equipos, pero el navegador recibió ${teamsUnique.length}.`);
  }
  return {...bundle,teams:teamsUnique,team_count:teamsUnique.length};
}

function renderTechnicalTeamScreenV27230(bundle,{switching=false}={}){
  const box=document.getElementById("technicalTeamScreenChoices");
  const title=document.getElementById("technicalTeamScreenTitle");
  const help=document.getElementById("technicalTeamScreenHelp");
  const message=document.getElementById("technicalTeamScreenMessage");
  const back=document.getElementById("technicalTeamScreenBack");
  if(!box)throw new Error("No se encontró la pantalla para elegir equipo.");
  const teamsList=Array.isArray(bundle?.teams)?bundle.teams:[];
  const person=bundle?.profile?.display_name||bundle?.profile?.name||"Cuerpo técnico";
  if(title)title.textContent=teamsList.length>1?"¿Qué equipo quieres ver?":"Acceso al equipo";
  if(help)help.textContent=teamsList.length>1?`${person}, tienes ${teamsList.length} equipos asignados. Elige uno para entrar.`:`${person}, abre tu equipo asignado.`;
  if(message){message.textContent="";message.classList.add("hidden")}
  if(back)back.classList.toggle("hidden",!switching);
  box.innerHTML=teamsList.map(team=>`<button type="button" class="technical-entry-team" data-technical-entry-team="${esc(team.team_id)}"><span class="technical-entry-ball">⚽</span><span><strong>${esc(team.team_name||"Equipo")}</strong><small>${esc([team.age_category,team.category].filter(Boolean).join(" · ")||"Área privada")}</small></span><b>→</b></button>`).join("");
  window.__technicalEntryBundle=bundle;
  window.__technicalEntrySwitching=!!switching;
  show("technicalTeamScreen");
}

async function selectTechnicalTeamV27230(teamId,{switching=false}={}){
  const token=getTechnicalSessionToken();
  if(!token)throw new Error("La sesión del cuerpo técnico ha caducado.");
  const {data,error}=await sb.rpc("technical_select_team_v27230",{p_token:token,p_team_id:teamId});
  if(error)throw error;
  const result=parseTechnicalBundleV27230(data)||data||{};
  const bundle=window.__technicalEntryBundle||{};
  const chosen=(bundle.teams||[]).find(t=>String(t.team_id)===String(teamId));
  window.__technicalAccess={...(bundle.profile||window.__technicalAccess||{}),team_id:teamId,team_name:chosen?.team_name||result?.team_name||""};
  window.__technicalTeamsPending=Array.isArray(bundle.teams)?bundle.teams:[];
  localStorage.setItem(TECH_TEAM_CHOICE_KEY,String(teamId));
  show("app");
  if(switching){
    await loadCurrentAccess();
    await loadAll();
    await window.sportsV2700?.load?.();
    await applyCurrentAccess();
    toast("Equipo cambiado correctamente");
  }else{
    await start();
  }
}

async function enterTechnicalAccessV27230({switching=false}={}){
  const bundle=await readTechnicalBundleV27230();
  window.__technicalAccess={...(bundle.profile||{}),role:"technical",active:true};
  window.__technicalTeamsPending=bundle.teams;
  if(!bundle.teams.length)throw new Error("Este usuario no tiene ningún equipo asignado.");
  if(bundle.teams.length===1){
    await selectTechnicalTeamV27230(bundle.teams[0].team_id,{switching});
    return;
  }
  renderTechnicalTeamScreenV27230(bundle,{switching});
}

document.addEventListener("click",async event=>{
  const button=event.target.closest?.("[data-technical-entry-team]");
  if(button){
    const message=document.getElementById("technicalTeamScreenMessage");
    try{
      document.querySelectorAll("[data-technical-entry-team]").forEach(b=>b.disabled=true);
      if(message){message.textContent="Abriendo equipo...";message.classList.remove("hidden")}
      await selectTechnicalTeamV27230(button.dataset.technicalEntryTeam,{switching:!!window.__technicalEntrySwitching});
    }catch(error){
      console.error("Selección de equipo",error);
      document.querySelectorAll("[data-technical-entry-team]").forEach(b=>b.disabled=false);
      if(message){message.textContent=error.message||"No se pudo abrir el equipo.";message.classList.remove("hidden")}
    }
    return;
  }
  if(event.target.closest?.("#technicalTeamScreenBack")){
    show("app");
    return;
  }
  if(event.target.closest?.("#technicalTeamScreenLogout")){
    const token=getTechnicalSessionToken();
    if(token){try{await sb.rpc("technical_logout",{p_token:token})}catch(_){}}
    clearTechnicalSession();window.__technicalAccess=null;window.__technicalTeamsPending=[];
    show("authScreen");
  }
});

async function technicalAvailableTeams(){
  if(!isTechnicalReadOnly())return [];
  if(Array.isArray(window.__technicalTeamsPending)&&window.__technicalTeamsPending.length){
    return window.__technicalTeamsPending.slice();
  }
  const bundle=await readTechnicalBundleV27230();
  window.__technicalTeamsPending=bundle.teams;
  return bundle.teams.slice();
}
async function setTechnicalActiveTeam(teamId){
  if(!teamId)return;
  const token=getTechnicalSessionToken();
  const {data,error}=await sb.rpc("technical_select_team_v27230",{p_token:token,p_team_id:teamId});
  if(error)throw error;
  currentAccess={...currentAccess,team_id:teamId};
  window.__technicalAccess={...(window.__technicalAccess||{}),team_id:teamId};
  localStorage.setItem(TECH_TEAM_CHOICE_KEY,String(teamId));
  return data;
}
function askTechnicalTeam(options){
  return new Promise((resolve,reject)=>{
    if(!technicalTeamChooser||!technicalTeamChoices)return reject(new Error("No se pudo abrir el selector de equipos"));
    technicalTeamChoices.innerHTML=options.map(team=>`<button type="button" class="technical-team-choice" data-team-id="${esc(team.team_id)}"><span class="technical-team-choice-icon">⚽</span><span><strong>${esc(team.team_name||"Equipo")}</strong><small>${esc([team.age_category,team.category].filter(Boolean).join(" · ")||"Abrir área privada")}</small></span><b>→</b></button>`).join("");
    technicalTeamChoices.querySelectorAll("[data-team-id]").forEach(button=>button.addEventListener("click",async()=>{
      try{
        button.disabled=true;
        await setTechnicalActiveTeam(button.dataset.teamId);
        technicalTeamChooser.close();
        resolve(button.dataset.teamId);
      }catch(error){
        button.disabled=false;
        toast("No se pudo abrir el equipo: "+(error.message||error));
      }
    }));
    technicalTeamChooser.showModal();
  });
}
async function ensureTechnicalTeamChoice(force=false){
  if(!isTechnicalReadOnly())return;
  currentTechnicalTeams=await technicalAvailableTeams();
  if(!currentTechnicalTeams.length)return;
  if(currentTechnicalTeams.length===1){
    const only=currentTechnicalTeams[0].team_id;
    if(only)try{await setTechnicalActiveTeam(only)}catch(_){currentAccess.team_id=only}
    return;
  }
  // V27.2.22: si el usuario tiene varios equipos, SIEMPRE se muestra el selector
  // al entrar. No se salta por una selección guardada de una sesión anterior.
  switchTechnicalTeam?.classList.remove("hidden");
  await askTechnicalTeam(currentTechnicalTeams);
}
technicalTeamChooser?.addEventListener("cancel",event=>{
  event.preventDefault();
  toast("Selecciona uno de tus equipos para continuar");
});
async function openTechnicalTeamSwitcherV27231(){
  if(!isTechnicalReadOnly())return;
  try{
    if(teamDetailDialog?.open)teamDetailDialog.close();
    await enterTechnicalAccessV27230({switching:true});
  }catch(error){
    console.error("Cambio de equipo",error);
    toast("No se pudo cambiar de equipo: "+(error.message||error));
  }
}
window.openTechnicalTeamSwitcherV27231=openTechnicalTeamSwitcherV27231;

switchTechnicalTeam?.addEventListener("click",openTechnicalTeamSwitcherV27231);
teamDetailSwitchTechnicalTeam?.addEventListener("click",openTechnicalTeamSwitcherV27231);

function applyReadOnlyToTeamDetail(){
  if(!isTechnicalReadOnly())return;
  const root=document.getElementById("teamDetailContent");if(!root)return;
  root.querySelectorAll('button').forEach(btn=>{
    const text=(btn.textContent||"").toLowerCase();
    const keep=text.includes("informe")||text.includes("descargar")||btn.closest(".team-detail-tabs")||btn.closest(".team-detail-mobile-menu")||btn.closest(".team-sports-panel")||btn.closest(".team-cards-panel")||btn.dataset.sportsAction==="true";
    if(!keep)btn.remove();
  });
}
const originalRenderTeamDetailTab=window.renderTeamDetailTab;
window.renderTeamDetailTab=function(tab){
  originalRenderTeamDetailTab(tab);
  applyReadOnlyToTeamDetail();
};
const TECHNICAL_ALLOWED_VIEWS=new Set(["players","payments","documents","kits","teams","staff","calendar","reports"]);
function activateTechnicalView(view="teams"){
  if(!TECHNICAL_ALLOWED_VIEWS.has(view))view="teams";
  document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.id===view));
  document.querySelectorAll(".nav").forEach(n=>n.classList.toggle("active",n.dataset.view===view));
  const labels={players:["Jugadores","Consulta de la plantilla asignada"],payments:["Cobros","Estado de pagos del equipo"],documents:["Documentos","Estado de la documentación"],kits:["Equipaciones","Tallajes y entregas"],teams:["Mi equipo","Ficha del equipo asignado"],staff:["Cuerpo técnico","Personal vinculado al equipo"],calendar:["Calendario","Agenda del equipo"],reports:["Informes","Listados de solo lectura"]};
  if(pageTitle)pageTitle.textContent=labels[view]?.[0]||"Mi equipo";
  if(pageSub)pageSub.textContent=`${labels[view]?.[1]||"Consulta"} · ${currentAccess.display_name||"Cuerpo técnico"}`;
  setTimeout(applyTechnicalReadOnlyUi,0);
}
function applyTechnicalReadOnlyUi(){
  if(!isTechnicalReadOnly())return;

  document.body.classList.add("technical-readonly");
  document.querySelector(".header-actions")?.classList.remove("hidden");
  // El cuerpo técnico también puede instalar la PWA en móvil u ordenador.
  switchTechnicalTeam?.classList.toggle("hidden",currentTechnicalTeams.length<2);
  teamDetailSwitchTechnicalTeam?.classList.toggle("hidden",currentTechnicalTeams.length<2);
  [
    "headerAddPlayer","dashboardAddPlayer","playersAddPlayer","addTeam","addStaff","addEvent","addPitch","addMovement",
    "addClothingItem","resetKitInventory","addTeamUser","deleteTeamFromDetail","deleteTeamFromForm","deletePlayerFromForm"
  ].forEach(id=>document.getElementById(id)?.classList.add("hidden"));

  document.querySelectorAll(".nav").forEach(nav=>{
    const allowed=TECHNICAL_ALLOWED_VIEWS.has(nav.dataset.view);
    nav.classList.toggle("hidden",!allowed);
  });
  const teamsNav=document.querySelector('.nav[data-view="teams"]');
  if(teamsNav)teamsNav.innerHTML="<b>⚽</b> Mi equipo";

  document.querySelectorAll("#playersGrid article[onclick],#playersTableBody tr[onclick]").forEach(el=>el.removeAttribute("onclick"));
  document.querySelectorAll("#playersGrid button,#playersTableBody button,#paymentsBody button,#documentsBody button,#kitsBody button,#kitsStaffBody button,#staffBody button,#calendarList button,#clothingCatalogGrid button").forEach(btn=>btn.classList.add("hidden"));
  document.querySelectorAll("#kitInventoryBody input,#clothingCatalogGrid input").forEach(field=>field.disabled=true);
  document.querySelectorAll(".clothing-catalog-panel,.kit-inventory-panel").forEach(section=>section.classList.add("hidden"));

  document.querySelectorAll("#teamsGrid .team-actions button").forEach(btn=>{
    const text=(btn.textContent||"").toLowerCase();
    const allowed=text.includes("plantilla")||text.includes("informe")||text.includes("abrir ficha")||text.includes("abrir equipo")||text.includes("asistencia")||text.includes("partido")||text.includes("estadística");
    btn.classList.toggle("hidden",!allowed);
  });

  document.querySelectorAll("dialog form").forEach(form=>{
    if(form.id==="loginForm"||form.dataset.technicalEdit==="true")return;
    form.querySelectorAll('button[type="submit"],.danger-action,.danger-mini').forEach(btn=>btn.classList.add("hidden"));
    form.querySelectorAll("input,select,textarea").forEach(field=>field.disabled=true);
  });
  applyReadOnlyToTeamDetail();
}
function renderRestrictedTeamHome(){
  const team=teams.find(t=>String(t.id)===String(currentAccess.team_id))||teams[0];
  if(!team){toast("Este usuario no tiene un equipo válido asignado");return}
  currentAccess.team_id=team.id;
  if(Array.isArray(clubMatches)){
    clubMatches=clubMatches.filter(match=>String(match.team||"").trim().toLowerCase()===String(team.name||"").trim().toLowerCase());
    renderClubMatches();
    renderDashboardMatches();
    renderCalendar();
  }
  activateTechnicalView("teams");
  applyTechnicalReadOnlyUi();
  setTimeout(()=>{
    if(typeof window.openTeamDetail==="function"&&!document.getElementById("teamDetailDialog")?.open){
      window.openTeamDetail(team.id);
    }
  },120);
}
async function applyCurrentAccess(){
  if(isTechnicalReadOnly()){
    currentTechnicalTeams=Array.isArray(window.__technicalTeamsPending)?window.__technicalTeamsPending.slice():currentTechnicalTeams;
    renderRestrictedTeamHome();
  }else{
    document.body.classList.remove("technical-readonly");
    switchTechnicalTeam?.classList.add("hidden");
    teamDetailSwitchTechnicalTeam?.classList.add("hidden");
    await loadTeamUserProfiles();
  }
}

document.addEventListener("submit",event=>{
  if(!isTechnicalReadOnly())return;
  const form=event.target;
  if(form?.id==="loginForm"||form?.dataset?.technicalEdit==="true")return;
  event.preventDefault();
  event.stopImmediatePropagation();
  toast("Acceso de solo lectura");
},true);

document.addEventListener("click",event=>{
  if(!isTechnicalReadOnly())return;
  const nav=event.target.closest?.(".nav");
  if(nav&&TECHNICAL_ALLOWED_VIEWS.has(nav.dataset.view)){
    setTimeout(()=>activateTechnicalView(nav.dataset.view),0);
  }
},true);

let technicalUiRefreshPending=false;
const technicalUiObserver=new MutationObserver(()=>{
  if(!isTechnicalReadOnly()||technicalUiRefreshPending)return;
  technicalUiRefreshPending=true;
  requestAnimationFrame(()=>{
    technicalUiRefreshPending=false;
    applyTechnicalReadOnlyUi();
  });
});
document.addEventListener("DOMContentLoaded",()=>{
  const appRoot=document.getElementById("app");
  if(appRoot)technicalUiObserver.observe(appRoot,{childList:true,subtree:true});
});


/* V27.2.33 · Corrección definitiva de escudos completos y competición Amistoso */
(function(){
  const COMPETITIONS_V27233=["Liga RFAF","Liga AAFB","Copa Primavera","Amistoso"];

  function competitionOptionsV27233(selected="",placeholder="Selecciona competición"){
    const options=[`<option value="">${placeholder}</option>`]
      .concat(COMPETITIONS_V27233.map(value=>`<option value="${value}">${value}</option>`));
    if(selected && !COMPETITIONS_V27233.includes(selected)){
      options.push(`<option value="${esc(selected)}">${esc(selected)}</option>`);
    }
    return options.join("");
  }

  function ensureCompetitionControlsV27233(){
    const matchSelect=document.getElementById("matchCompetition");
    if(matchSelect){
      const current=matchSelect.value||"";
      matchSelect.innerHTML=competitionOptionsV27233(current,"Selecciona competición");
      matchSelect.value=current;
    }

    const sportsForm=document.getElementById("sportsMatchForm");
    let sportsField=sportsForm?.elements?.competition;
    if(sportsField && sportsField.tagName!=="SELECT"){
      const current=sportsField.value||"";
      const select=document.createElement("select");
      select.name="competition";
      select.id="sportsMatchCompetition";
      select.innerHTML=competitionOptionsV27233(current,"Selecciona competición");
      select.value=current;
      sportsField.replaceWith(select);
      sportsField=select;
    }else if(sportsField){
      const current=sportsField.value||"";
      sportsField.innerHTML=competitionOptionsV27233(current,"Selecciona competición");
      sportsField.value=current;
    }
  }

  function installCalendarCrestStyleV27233(){
    if(document.getElementById("v27233-calendar-crest-style"))return;
    const style=document.createElement("style");
    style.id="v27233-calendar-crest-style";
    style.textContent=`
      .team-calendar-list .match-team-crest,
      .team-match-heading .match-team-crest,
      .match-versus-layout .match-team-crest{
        width:68px !important;
        height:68px !important;
        flex:0 0 68px !important;
        border-radius:0 !important;
        border:0 !important;
        background:transparent !important;
        box-shadow:none !important;
        overflow:visible !important;
        padding:0 !important;
        clip-path:none !important;
      }
      .team-calendar-list .match-team-crest img,
      .team-match-heading .match-team-crest img,
      .match-versus-layout .match-team-crest img{
        display:block !important;
        width:auto !important;
        height:auto !important;
        max-width:68px !important;
        max-height:68px !important;
        object-fit:contain !important;
        object-position:center !important;
        border-radius:0 !important;
        border:0 !important;
        background:transparent !important;
        box-shadow:none !important;
        clip-path:none !important;
      }
      .rival-team-row img{
        width:auto !important;
        height:auto !important;
        max-width:58px !important;
        max-height:58px !important;
        object-fit:contain !important;
        border-radius:0 !important;
        border:0 !important;
        background:transparent !important;
        box-shadow:none !important;
        clip-path:none !important;
      }
      @media(max-width:760px){
        .team-calendar-list .match-team-crest,
        .team-match-heading .match-team-crest,
        .match-versus-layout .match-team-crest{
          width:58px !important;
          height:58px !important;
          flex-basis:58px !important;
        }
        .team-calendar-list .match-team-crest img,
        .team-match-heading .match-team-crest img,
        .match-versus-layout .match-team-crest img{
          max-width:58px !important;
          max-height:58px !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  document.addEventListener("DOMContentLoaded",()=>{
    installCalendarCrestStyleV27233();
    ensureCompetitionControlsV27233();
  });

  document.addEventListener("click",event=>{
    if(event.target.closest?.("[data-new-team-match],#addMatch,[data-sports-action='match']")){
      setTimeout(ensureCompetitionControlsV27233,0);
    }
  },true);

  const originalOpenMatchDialogV27233=window.openTeamMatchDialog;
  if(typeof originalOpenMatchDialogV27233==="function"){
    window.openTeamMatchDialog=function(...args){
      ensureCompetitionControlsV27233();
      return originalOpenMatchDialogV27233.apply(this,args);
    };
  }

  window.ensureCompetitionControlsV27233=ensureCompetitionControlsV27233;
})();


/* V27.2.34 · Escudos de calendario sin fondos circulares + Amistoso garantizado */
(function(){
  const FRIENDLY_VALUE="Amistoso";
  const cleanedCrestCacheV27234=new Map();

  function isCompetitionSelectV27234(select){
    if(!select || select.tagName!=="SELECT")return false;
    const id=String(select.id||"").toLowerCase();
    const name=String(select.name||"").toLowerCase();
    const label=String(select.closest("label")?.textContent||"").toLowerCase();
    return name==="competition" || /competition|competicion/.test(id) || label.includes("competición") || label.includes("competicion");
  }

  function ensureFriendlyOptionV27234(select){
    if(!isCompetitionSelectV27234(select))return;
    const selected=select.value;
    const exists=[...select.options].some(o=>String(o.value||"").trim().toLowerCase()==="amistoso");
    if(!exists){
      const option=document.createElement("option");
      option.value=FRIENDLY_VALUE;
      option.textContent=FRIENDLY_VALUE;
      select.appendChild(option);
    }
    if(selected)select.value=selected;
  }

  function ensureAllCompetitionSelectsV27234(){
    document.querySelectorAll("select").forEach(ensureFriendlyOptionV27234);
  }

  function loadCrestImageV27234(src){
    return new Promise((resolve,reject)=>{
      const image=new Image();
      image.onload=()=>resolve(image);
      image.onerror=()=>reject(new Error("No se pudo leer el escudo"));
      image.src=src;
    });
  }

  async function cleanRivalCrestV27234(src){
    if(!src || !String(src).startsWith("data:image/"))return src;
    if(cleanedCrestCacheV27234.has(src))return cleanedCrestCacheV27234.get(src);
    const promise=(async()=>{
      try{
        const image=await loadCrestImageV27234(src);
        const w=Math.max(1,image.naturalWidth||image.width||1);
        const h=Math.max(1,image.naturalHeight||image.height||1);
        const canvas=document.createElement("canvas");
        canvas.width=w;canvas.height=h;
        const ctx=canvas.getContext("2d",{alpha:true,willReadFrequently:true});
        if(!ctx)return src;
        ctx.clearRect(0,0,w,h);
        ctx.drawImage(image,0,0,w,h);
        const data=ctx.getImageData(0,0,w,h);
        const px=data.data;
        let minX=w,minY=h,maxX=-1,maxY=-1;
        for(let y=0;y<h;y++){
          for(let x=0;x<w;x++){
            const i=(y*w+x)*4;
            const r=px[i],g=px[i+1],b=px[i+2],a=px[i+3];
            if(a===0)continue;
            const max=Math.max(r,g,b),min=Math.min(r,g,b),sat=max-min,light=(r+g+b)/3;
            // Quita únicamente fondos blancos/gris claro/azul muy pálido típicos de los
            // antiguos avatares circulares. El escudo original guardado NO se modifica.
            const neutralLight=light>218 && sat<52;
            const paleBlue=r>176 && g>202 && b>216 && b>=g-4 && g>=r-10 && light>205;
            const almostWhite=r>238 && g>238 && b>238;
            if(almostWhite || neutralLight || paleBlue){
              px[i+3]=0;
              continue;
            }
            if(px[i+3]>20){
              if(x<minX)minX=x;if(x>maxX)maxX=x;
              if(y<minY)minY=y;if(y>maxY)maxY=y;
            }
          }
        }
        ctx.putImageData(data,0,0);
        if(maxX<minX || maxY<minY)return src;
        const bw=maxX-minX+1,bh=maxY-minY+1;
        if(bw<8 || bh<8)return src;
        const pad=Math.max(1,Math.round(Math.max(bw,bh)*0.035));
        const sx=Math.max(0,minX-pad),sy=Math.max(0,minY-pad);
        const sw=Math.min(w-sx,bw+pad*2),sh=Math.min(h-sy,bh+pad*2);
        const out=document.createElement("canvas");
        out.width=sw;out.height=sh;
        const outCtx=out.getContext("2d",{alpha:true});
        if(!outCtx)return src;
        outCtx.clearRect(0,0,sw,sh);
        outCtx.drawImage(canvas,sx,sy,sw,sh,0,0,sw,sh);
        return out.toDataURL("image/png");
      }catch(error){
        console.warn("No se pudo limpiar el fondo circular del escudo",error);
        return src;
      }
    })();
    cleanedCrestCacheV27234.set(src,promise);
    return promise;
  }

  async function cleanVisibleCalendarCrestsV27234(root=document){
    const images=[...root.querySelectorAll?.(".team-calendar-list .match-team-crest img,.team-match-heading .match-team-crest img,.match-versus-layout .match-team-crest img")||[]];
    await Promise.all(images.map(async img=>{
      if(img.dataset.v27234Cleaned==="1")return;
      const raw=img.getAttribute("src")||"";
      const holder=img.closest(".match-team-crest");
      if(holder){
        holder.style.setProperty("border-radius","0","important");
        holder.style.setProperty("border","0","important");
        holder.style.setProperty("background","transparent","important");
        holder.style.setProperty("box-shadow","none","important");
        holder.style.setProperty("overflow","visible","important");
        holder.style.setProperty("padding","0","important");
      }
      img.style.setProperty("border-radius","0","important");
      img.style.setProperty("border","0","important");
      img.style.setProperty("background","transparent","important");
      img.style.setProperty("box-shadow","none","important");
      img.style.setProperty("filter","none","important");
      // El escudo oficial del San Bernabé conserva su diseño original. Solo limpiamos
      // los escudos rivales guardados como imagen/data URL, donde estaba incrustado el círculo.
      if(raw.startsWith("data:image/")){
        const cleaned=await cleanRivalCrestV27234(raw);
        if(cleaned && cleaned!==raw)img.src=cleaned;
      }
      img.dataset.v27234Cleaned="1";
    }));
  }

  function refreshV27234(){
    ensureAllCompetitionSelectsV27234();
    cleanVisibleCalendarCrestsV27234();
  }

  document.addEventListener("DOMContentLoaded",()=>{
    refreshV27234();
    const observer=new MutationObserver(()=>{
      clearTimeout(observer._t);
      observer._t=setTimeout(refreshV27234,0);
    });
    observer.observe(document.body,{childList:true,subtree:true});
  });

  document.addEventListener("pointerdown",event=>{
    if(event.target.closest?.("[data-new-team-match],#addMatch,#sportsAddMatch,[data-sports-action='match'],[data-edit-match]")){
      ensureAllCompetitionSelectsV27234();
      setTimeout(ensureAllCompetitionSelectsV27234,0);
      setTimeout(ensureAllCompetitionSelectsV27234,80);
    }
  },true);

  const previousRenderTeamDetailTabV27234=window.renderTeamDetailTab;
  if(typeof previousRenderTeamDetailTabV27234==="function"){
    window.renderTeamDetailTab=function(...args){
      const result=previousRenderTeamDetailTabV27234.apply(this,args);
      if(args[0]==="calendar"){
        setTimeout(()=>cleanVisibleCalendarCrestsV27234(),0);
        setTimeout(()=>cleanVisibleCalendarCrestsV27234(),80);
      }
      return result;
    };
  }

  window.ensureFriendlyOptionV27234=ensureAllCompetitionSelectsV27234;
  window.cleanVisibleCalendarCrestsV27234=cleanVisibleCalendarCrestsV27234;
})();

/* V27.2.35 · Eliminación real del aro decorativo de escudos rivales */
(function(){
  const CLEAN_MARKER_V27235="cdsb_rival_crests_cleaned_v27235";
  const cleanedCacheV27235=new Map();

  function isSoftBackgroundPixelV27235(r,g,b,a){
    if(a<12)return false;
    const max=Math.max(r,g,b),min=Math.min(r,g,b),sat=max-min,light=(r+g+b)/3;
    const neutral=light>218&&sat<58;
    const paleBlue=r>170&&g>190&&b>205&&b>=g-16&&light>190;
    return neutral||paleBlue;
  }

  function clearEdgeBackgroundV27235(imageData,w,h){
    const px=imageData.data;
    const seen=new Uint8Array(w*h);
    const stack=[];
    const push=(x,y)=>{
      if(x<0||y<0||x>=w||y>=h)return;
      const p=y*w+x;
      if(seen[p])return;
      const i=p*4;
      if(!isSoftBackgroundPixelV27235(px[i],px[i+1],px[i+2],px[i+3]))return;
      seen[p]=1;stack.push(p);
    };
    for(let x=0;x<w;x++){push(x,0);push(x,h-1)}
    for(let y=0;y<h;y++){push(0,y);push(w-1,y)}
    while(stack.length){
      const p=stack.pop(),x=p%w,y=(p/w)|0,i=p*4;
      px[i+3]=0;
      push(x-1,y);push(x+1,y);push(x,y-1);push(x,y+1);
    }
  }

  async function sanitizeRivalCrestV27235(source,maxSide=220){
    if(!source)return "";
    const key=typeof source==="string"?source:null;
    if(key&&cleanedCacheV27235.has(key))return cleanedCacheV27235.get(key);
    const task=(async()=>{
      try{
        const img=await imageFromSource(source);
        const naturalW=Math.max(1,img.naturalWidth||img.width||1),naturalH=Math.max(1,img.naturalHeight||img.height||1);
        const scale=Math.min(1,maxSide/Math.max(naturalW,naturalH));
        const w=Math.max(1,Math.round(naturalW*scale)),h=Math.max(1,Math.round(naturalH*scale));
        const canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;
        const ctx=canvas.getContext("2d",{alpha:true,willReadFrequently:true});
        if(!ctx)return typeof source==="string"?source:"";
        ctx.clearRect(0,0,w,h);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";ctx.drawImage(img,0,0,w,h);
        const data=ctx.getImageData(0,0,w,h),px=data.data;

        // 1) Quita únicamente el fondo claro que esté conectado con los bordes.
        //    De este modo las zonas blancas que formen parte del escudo se conservan.
        clearEdgeBackgroundV27235(data,w,h);

        // 2) El aro que se añadía antiguamente al avatar está en la zona exterior del
        //    cuadrado y es azul/gris muy claro. Se elimina solo en esa corona exterior.
        const cx=(w-1)/2,cy=(h-1)/2,minSide=Math.max(1,Math.min(w,h));
        for(let y=0;y<h;y++)for(let x=0;x<w;x++){
          const i=(y*w+x)*4;if(px[i+3]<12)continue;
          const radius=Math.hypot(x-cx,y-cy)/minSide;
          if(radius<0.33||radius>0.61)continue;
          const r=px[i],g=px[i+1],b=px[i+2];
          const max=Math.max(r,g,b),min=Math.min(r,g,b),sat=max-min,light=(r+g+b)/3;
          const paleNeutral=light>158&&sat<82;
          const paleBlue=r>132&&g>152&&b>168&&b>=g-18&&sat<112;
          if(paleNeutral||paleBlue)px[i+3]=0;
        }

        // Al romper el aro, cualquier blanco interior que fuese solo fondo queda conectado
        // con el exterior y se puede retirar sin tocar el contenido real del escudo.
        clearEdgeBackgroundV27235(data,w,h);
        ctx.putImageData(data,0,0);

        let minX=w,minY=h,maxX=-1,maxY=-1;
        for(let y=0;y<h;y++)for(let x=0;x<w;x++){
          const a=px[(y*w+x)*4+3];if(a<18)continue;
          if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;
        }
        if(maxX<minX||maxY<minY)return typeof source==="string"?source:"";
        const bw=maxX-minX+1,bh=maxY-minY+1;
        const pad=Math.max(1,Math.round(Math.max(bw,bh)*0.04));
        const sx=Math.max(0,minX-pad),sy=Math.max(0,minY-pad);
        const ex=Math.min(w,maxX+1+pad),ey=Math.min(h,maxY+1+pad);
        const sw=Math.max(1,ex-sx),sh=Math.max(1,ey-sy);
        const out=document.createElement("canvas");out.width=sw;out.height=sh;
        const outCtx=out.getContext("2d",{alpha:true});if(!outCtx)return typeof source==="string"?source:"";
        outCtx.clearRect(0,0,sw,sh);outCtx.drawImage(canvas,sx,sy,sw,sh,0,0,sw,sh);
        let result=out.toDataURL("image/webp",.9);
        if(!String(result).startsWith("data:image/webp"))result=out.toDataURL("image/png");
        return result;
      }catch(error){
        console.warn("No se pudo retirar el aro del escudo rival",error);
        return typeof source==="string"?source:"";
      }
    })();
    if(key)cleanedCacheV27235.set(key,task);
    return task;
  }

  // Todos los escudos rivales nuevos se guardan ya sin el aro decorativo.
  optimizeRivalCrest=async function(source,maxSide=220){
    return sanitizeRivalCrestV27235(source,maxSide);
  };

  async function migrateStoredRivalCrestsV27235(){
    try{
      if(localStorage.getItem(CLEAN_MARKER_V27235)==="1")return false;
      loadRivalTeams();
      let changed=false;
      for(const rival of rivalTeams){
        const current=String(rival?.crest||"");if(!current)continue;
        const cleaned=await sanitizeRivalCrestV27235(current,220);
        if(cleaned&&cleaned!==current){rival.crest=cleaned;changed=true;}
      }
      if(changed)saveRivalTeams({silent:true});
      localStorage.setItem(CLEAN_MARKER_V27235,"1");
      return changed;
    }catch(error){console.warn("No se pudieron migrar los escudos rivales",error);return false;}
  }

  async function cleanVisibleRivalCrestsV27235(root=document){
    const selector=".team-calendar-list .match-team-crest img,.team-match-heading .match-team-crest img,.match-versus-layout .match-team-crest img";
    const images=[...(root.querySelectorAll?.(selector)||[])];
    await Promise.all(images.map(async img=>{
      const raw=img.getAttribute("src")||"";
      const official=/assets\/escudo-oficial\.png(?:\?|$)/i.test(raw);
      const holder=img.closest(".match-team-crest");
      if(holder){
        holder.style.setProperty("border-radius","0","important");
        holder.style.setProperty("border","0","important");
        holder.style.setProperty("background","transparent","important");
        holder.style.setProperty("box-shadow","none","important");
        holder.style.setProperty("overflow","visible","important");
      }
      img.style.setProperty("border-radius","0","important");
      img.style.setProperty("border","0","important");
      img.style.setProperty("background","transparent","important");
      img.style.setProperty("box-shadow","none","important");
      if(official||!raw.startsWith("data:image/"))return;
      if(img.dataset.v27235Source===raw)return;
      const cleaned=await sanitizeRivalCrestV27235(raw,220);
      if(cleaned&&cleaned!==raw)img.src=cleaned;
      img.dataset.v27235Source=img.getAttribute("src")||cleaned||raw;
    }));
  }

  function scheduleCrestRefreshV27235(){
    clearTimeout(scheduleCrestRefreshV27235._timer);
    scheduleCrestRefreshV27235._timer=setTimeout(()=>cleanVisibleRivalCrestsV27235(),40);
  }

  document.addEventListener("DOMContentLoaded",()=>{
    setTimeout(async()=>{
      await migrateStoredRivalCrestsV27235();
      loadRivalTeams();
      cleanVisibleRivalCrestsV27235();
      if(typeof renderRivalTeams==="function")renderRivalTeams();
    },180);
    const observer=new MutationObserver(scheduleCrestRefreshV27235);
    observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:["src"]});
  });

  const previousRenderTeamDetailTabV27235=window.renderTeamDetailTab;
  if(typeof previousRenderTeamDetailTabV27235==="function"){
    window.renderTeamDetailTab=function(...args){
      const result=previousRenderTeamDetailTabV27235.apply(this,args);
      if(args[0]==="calendar"){
        setTimeout(()=>cleanVisibleRivalCrestsV27235(),30);
        setTimeout(()=>cleanVisibleRivalCrestsV27235(),180);
      }
      return result;
    };
  }

  window.cleanVisibleRivalCrestsV27235=cleanVisibleRivalCrestsV27235;
})();
