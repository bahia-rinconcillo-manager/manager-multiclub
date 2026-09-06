/* V27.2.43 — Calendario por equipo: vista tarjetas + vista lista */
(function(){
  "use strict";

  const FIELD_STORAGE_KEY="cdsb_match_fields_v24_5_8";
  const VIEW_STORAGE_KEY="cdsb_team_calendar_view_v27243";
  const DEFAULT_FIELDS=[
    "Centro Deportivo Montepalma · Campo 1",
    "Centro Deportivo Montepalma · Campo 2",
    "La Menacha",
    "Ignacio Villaverde"
  ];
  const COMPETITION_IMAGES_V258={
    "Liga AAFB":"assets/competitions/liga-aafb.png",
    "Copa Primavera":"assets/competitions/copa-primavera.png",
    "Liga RFAF":"assets/competitions/liga-rfaf.png",
    "Amistoso":""
  };

  let matchFields=[];
  let activeReturnTeamId="";
  let activeChildDialog="";

  const safeText=value=>String(value??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;");
  const safeAttr=value=>safeText(value).replace(/'/g,"&#39;");
  const normalize=value=>String(value||"").trim().toLocaleLowerCase("es");

  function currentView(){
    return localStorage.getItem(VIEW_STORAGE_KEY)==="list"?"list":"cards";
  }
  function saveView(view){
    localStorage.setItem(VIEW_STORAGE_KEY,view==="list"?"list":"cards");
  }

  function readFields(){
    try{
      const parsed=JSON.parse(localStorage.getItem(FIELD_STORAGE_KEY)||"[]");
      matchFields=Array.isArray(parsed)?parsed.filter(Boolean):[];
    }catch(_){matchFields=[];}
    if(!matchFields.length){
      matchFields=[...DEFAULT_FIELDS];
      saveFields();
    }
  }
  function saveFields(){
    matchFields=[...new Set(matchFields.map(x=>String(x||"").trim()).filter(Boolean))]
      .sort((a,b)=>a.localeCompare(b,"es",{sensitivity:"base"}));
    localStorage.setItem(FIELD_STORAGE_KEY,JSON.stringify(matchFields));
  }

  function teamById(id){return teams.find(item=>String(item.id)===String(id));}
  function teamMatches(teamName){
    return clubMatches
      .filter(item=>normalize(item.team)===normalize(teamName))
      .sort((a,b)=>`${a.match_date||"9999-99-99"} ${a.match_time||"99:99"}`.localeCompare(`${b.match_date||"9999-99-99"} ${b.match_time||"99:99"}`));
  }
  function hasResult(match){
    return match.goals_for!==""&&match.goals_for!==null&&match.goals_for!==undefined&&match.goals_against!==""&&match.goals_against!==null&&match.goals_against!==undefined;
  }
  function competitionLogo(name,className=""){
    const source=COMPETITION_IMAGES_V258[name];
    if(!source){const label=normalize(name)==="amistoso"?"AM":"?";return `<span class="v258-competition-fallback ${className}">${label}</span>`;}
    return `<span class="v258-competition-logo ${className}"><img src="${source}" alt="${safeAttr(name)}"></span>`;
  }
  function opponentRecord(name){
    if(typeof loadRivalTeams==="function")loadRivalTeams();
    return Array.isArray(rivalTeams)?rivalTeams.find(item=>normalize(item.name)===normalize(name)):null;
  }
  function crest(name,isClub=false){
    const source=isClub?"assets/escudo-oficial.png":opponentRecord(name)?.crest;
    if(source)return `<span class="v258-team-crest"><img src="${source}" alt="Escudo ${safeAttr(name)}"></span>`;
    return `<span class="v258-team-crest fallback">${safeText(String(name||"?").trim().charAt(0).toUpperCase()||"?")}</span>`;
  }
  function displayDate(value){
    if(!value)return {day:"SIN FECHA",full:"Fecha pendiente"};
    const date=new Date(`${value}T12:00:00`);
    if(Number.isNaN(date.getTime()))return {day:safeText(value),full:safeText(value)};
    return {
      day:date.toLocaleDateString("es-ES",{weekday:"short",day:"2-digit"}),
      full:date.toLocaleDateString("es-ES",{day:"2-digit",month:"long",year:"numeric"})
    };
  }
  function statusInfo(match){
    if(match.finished)return {className:"finished",label:"FINALIZADO"};
    if(hasResult(match))return {className:"result",label:"RESULTADO GUARDADO"};
    return {className:"scheduled",label:"PROGRAMADO"};
  }

  function renderCard(match){
    const home=match.venue!=="away";
    const homeName=home?match.team:match.opponent;
    const awayName=home?match.opponent:match.team;
    const date=displayDate(match.match_date);
    const state=statusInfo(match);
    const score=hasResult(match)
      ? (home?`${safeText(match.goals_for)} <span>–</span> ${safeText(match.goals_against)}`:`${safeText(match.goals_against)} <span>–</span> ${safeText(match.goals_for)}`)
      : `<small>VS</small>`;
    return `<article class="v258-match-card ${state.className}">
      <header class="v258-match-card-head">
        <div class="v258-match-competition">${competitionLogo(match.competition,"compact")}<div><strong>${safeText(match.competition||"Sin competición")}</strong><span>${safeText(match.round||"Sin jornada")}</span></div></div>
        <span class="v258-status ${state.className}">${state.label}</span>
      </header>
      <div class="v258-match-datebar"><strong>${safeText(date.day)}</strong><span>${safeText(match.match_time||"Hora pendiente")}</span><small>${safeText(date.full)}</small></div>
      <div class="v258-scoreboard">
        <div class="v258-side">${crest(homeName,normalize(homeName)===normalize(match.team))}<strong>${safeText(homeName)}</strong><small>LOCAL</small></div>
        <div class="v258-score">${score}</div>
        <div class="v258-side">${crest(awayName,normalize(awayName)===normalize(match.team))}<strong>${safeText(awayName)}</strong><small>VISITANTE</small></div>
      </div>
      <div class="v258-match-info">
        <span>📍 ${safeText(match.location||"Campo pendiente")}</span>
        ${match.notes?`<span>📝 ${safeText(match.notes)}</span>`:""}
      </div>
      <footer class="v258-match-actions">
        <button type="button" class="v258-btn edit" onclick="calendarV258.edit('${safeAttr(match.id)}')">✏ Editar</button>
        <button type="button" class="v258-btn result" onclick="calendarV258.result('${safeAttr(match.id)}')">⚽ Resultado</button>
        <button type="button" class="v258-btn finish ${match.finished?"active":""}" onclick="calendarV258.finish('${safeAttr(match.id)}')">${match.finished?"↩ Reabrir":"✓ Finalizar"}</button>
        <button type="button" class="v258-btn poster" onclick="calendarV258.poster('${safeAttr(match.id)}')">🐉 Cartel</button>
        <button type="button" class="v258-btn delete" onclick="calendarV258.remove('${safeAttr(match.id)}')">Eliminar</button>
      </footer>
    </article>`;
  }

  function renderListItem(match){
    const home=match.venue!=="away";
    const homeName=home?match.team:match.opponent;
    const awayName=home?match.opponent:match.team;
    const date=displayDate(match.match_date);
    const state=statusInfo(match);
    const score=hasResult(match)
      ? (home?`${safeText(match.goals_for)} – ${safeText(match.goals_against)}`:`${safeText(match.goals_against)} – ${safeText(match.goals_for)}`)
      : "VS";
    return `<article class="v243-list-row ${state.className}">
      <div class="v243-list-date"><strong>${safeText(date.day)}</strong><span>${safeText(match.match_time||"Hora pendiente")}</span><small>${safeText(date.full)}</small></div>
      <div class="v243-list-comp">${competitionLogo(match.competition,"compact")}<div><strong>${safeText(match.competition||"Sin competición")}</strong><span>${safeText(match.round||"Sin jornada")}</span></div></div>
      <div class="v243-list-versus">
        <div class="v243-list-team">${crest(homeName,normalize(homeName)===normalize(match.team))}<strong>${safeText(homeName)}</strong><small>LOCAL</small></div>
        <div class="v243-list-score">${safeText(score)}</div>
        <div class="v243-list-team">${crest(awayName,normalize(awayName)===normalize(match.team))}<strong>${safeText(awayName)}</strong><small>VISITANTE</small></div>
      </div>
      <div class="v243-list-meta"><span>📍 ${safeText(match.location||"Campo pendiente")}</span><span class="v258-status ${state.className}">${state.label}</span></div>
      <div class="v243-list-actions">
        <button type="button" class="v258-btn edit" onclick="calendarV258.edit('${safeAttr(match.id)}')">✏ Editar</button>
        <button type="button" class="v258-btn result" onclick="calendarV258.result('${safeAttr(match.id)}')">⚽ Resultado</button>
        <button type="button" class="v258-btn finish ${match.finished?"active":""}" onclick="calendarV258.finish('${safeAttr(match.id)}')">${match.finished?"↩ Reabrir":"✓ Finalizar"}</button>
        <button type="button" class="v258-btn poster" onclick="calendarV258.poster('${safeAttr(match.id)}')">🐉 Cartel</button>
        <button type="button" class="v258-btn delete" onclick="calendarV258.remove('${safeAttr(match.id)}')">Eliminar</button>
      </div>
    </article>`;
  }

  function renderCalendar(team){
    const matches=teamMatches(team.name);
    const view=currentView();
    const played=matches.filter(hasResult).length;
    const finished=matches.filter(item=>item.finished).length;
    const next=matches.find(item=>!item.finished&&item.match_date&&new Date(`${item.match_date}T23:59:59`)>=new Date());
    const content=document.querySelector("#teamDetailContent .team-detail-tab-content");
    if(!content)return;
    content.innerHTML=`<section class="v258-calendar-shell">
      <div class="v258-calendar-hero">
        <div class="v258-calendar-brand"><img src="assets/escudo-oficial.png" alt="Escudo CD San Bernabé"><div><small>ÁREA DEPORTIVA · ${safeText(team.name)}</small><h3>Calendario de partidos</h3><p>Crea, edita y actualiza todos los encuentros del equipo.</p></div></div>
        <div class="v258-calendar-actions">
          <button type="button" class="v258-hero-btn light" onclick="calendarV258.manage()">Equipos, escudos y campos</button>
          <button type="button" class="v258-hero-btn light" onclick="calendarV258.importPdf()">Importar PDF</button>
          <button type="button" class="v258-hero-btn primary" onclick="calendarV258.newMatch()">+ Nuevo partido</button>
        </div>
      </div>
      <div class="v258-summary-grid">
        <article><span>Partidos</span><strong>${matches.length}</strong><small>Temporada registrada</small></article>
        <article><span>Con resultado</span><strong>${played}</strong><small>Marcador actualizado</small></article>
        <article><span>Finalizados</span><strong>${finished}</strong><small>Partidos cerrados</small></article>
        <article class="next"><span>Próximo partido</span><strong>${next?safeText(next.round||"Próximo"):"—"}</strong><small>${next?safeText(displayDate(next.match_date).full):"Sin partido programado"}</small></article>
      </div>
      <div class="v258-calendar-section-title v243-section-title"><div><small>CALENDARIO DEL EQUIPO</small><h4>${matches.length?`${matches.length} partido${matches.length===1?"":"s"}`:"Sin partidos"}</h4></div>
        <div class="v243-view-toggle" role="group" aria-label="Cambiar vista del calendario">
          <button type="button" class="${view==="cards"?"active":""}" onclick="calendarV258.setView('cards')">▦ Dos columnas</button>
          <button type="button" class="${view==="list"?"active":""}" onclick="calendarV258.setView('list')">☷ Lista</button>
        </div>
      </div>
      <div class="${view==="list"?"v243-match-list":"v258-match-grid"}">${matches.length?(view==="list"?matches.map(renderListItem).join(""):matches.map(renderCard).join("")):`<div class="v258-empty"><img src="assets/escudo-oficial.png" alt="Escudo"><strong>No hay partidos registrados</strong><p>Pulsa “Nuevo partido” para añadir el primer encuentro de ${safeText(team.name)}.</p><button type="button" onclick="calendarV258.newMatch()">+ Crear partido</button></div>`}</div>
    </section>`;
  }

  const legacyRenderTeamDetailTab=window.renderTeamDetailTab;
  window.renderTeamDetailTab=function(tab){
    legacyRenderTeamDetailTab(tab);
    if(tab!=="calendar")return;
    const team=teamById(currentTeamDetailId);
    if(team)renderCalendar(team);
  };

  function safeShow(dialog){
    if(!dialog)return;
    try{
      if(dialog.open)dialog.close();
      dialog.showModal();
    }catch(_){dialog.setAttribute("open","");}
  }
  function openChild(dialogId,setup){
    const detail=document.getElementById("teamDetailDialog");
    activeReturnTeamId=currentTeamDetailId||activeReturnTeamId||"";
    activeChildDialog=dialogId;
    const run=()=>{
      try{setup();safeShow(document.getElementById(dialogId));}
      catch(error){
        console.error("Error calendario V24.5.8:",error);
        toast(`Error al abrir el formulario: ${error?.message||error}`);
        restoreParent();
      }
    };
    if(detail?.open){detail.addEventListener("close",()=>setTimeout(run,30),{once:true});detail.close();}
    else setTimeout(run,0);
  }
  function restoreParent(){
    if(!activeReturnTeamId)return;
    const id=activeReturnTeamId;
    activeReturnTeamId="";
    activeChildDialog="";
    currentTeamDetailId=id;
    const team=teamById(id);
    const detail=document.getElementById("teamDetailDialog");
    if(!team||!detail)return;
    teamDetailTitle.textContent=team.name;
    window.renderTeamDetailTab("calendar");
    setTimeout(()=>safeShow(detail),30);
  }

  function registeredRivals(){
    if(typeof loadRivalTeams==="function")loadRivalTeams();
    const names=[...(Array.isArray(rivalTeams)?rivalTeams.map(item=>item.name):[]),...clubMatches.map(item=>item.opponent)]
      .map(item=>String(item||"").trim()).filter(Boolean);
    return [...new Set(names)].sort((a,b)=>a.localeCompare(b,"es",{sensitivity:"base"}));
  }
  function registeredFields(){
    readFields();
    const names=[...matchFields,...clubMatches.map(item=>item.location)]
      .map(item=>String(item||"").trim()).filter(Boolean);
    return [...new Set(names)].sort((a,b)=>a.localeCompare(b,"es",{sensitivity:"base"}));
  }
  function fillTeamSelect(value){
    const select=document.querySelector('#matchForm select[name="team"]');
    if(!select)return;
    const names=[...new Set(teams.map(item=>String(item.name||"").trim()).filter(Boolean))]
      .sort((a,b)=>a.localeCompare(b,"es",{sensitivity:"base"}));
    select.innerHTML='<option value="">Selecciona equipo</option>'+names.map(name=>`<option value="${safeAttr(name)}">${safeText(name)}</option>`).join("");
    select.value=value||"";
  }
  function fillCompetition(value){
    const select=document.getElementById("matchCompetition");
    if(!select)return;
    select.innerHTML='<option value="">Selecciona competición</option>'+Object.keys(COMPETITION_IMAGES_V258).map(name=>`<option value="${safeAttr(name)}">${safeText(name)}</option>`).join("");
    select.value=value||"";
    updateCompetitionPreviewStable();
  }
  function fillRounds(value){
    const select=document.getElementById("matchRound");
    if(!select)return;
    const options=[...Array.from({length:50},(_,i)=>`Jornada ${i+1}`),"Fase de grupos","Octavos de final","Cuartos de final","Semifinal","Final","Amistoso"];
    select.innerHTML='<option value="">Selecciona jornada</option>'+options.map(name=>`<option value="${safeAttr(name)}">${safeText(name)}</option>`).join("");
    if(value&&!options.includes(value))select.insertAdjacentHTML("beforeend",`<option value="${safeAttr(value)}">${safeText(value)}</option>`);
    select.value=value||"";
  }
  function fillRivals(value){
    const select=document.getElementById("matchOpponent");
    const custom=document.querySelector('#matchForm [name="opponent_custom"]');
    const wrap=document.getElementById("customOpponentWrap");
    if(!select||!wrap||!custom)return;
    const names=registeredRivals();
    select.innerHTML='<option value="">Selecciona equipo rival</option>'+names.map(name=>`<option value="${safeAttr(name)}">${safeText(name)}</option>`).join("")+'<option value="__custom__">+ Escribir rival nuevo</option>';
    if(value&&names.some(name=>normalize(name)===normalize(value))){
      const existing=names.find(name=>normalize(name)===normalize(value));
      select.value=existing;custom.value="";wrap.hidden=true;
    }else if(value){select.value="__custom__";custom.value=value;wrap.hidden=false;}
    else{select.value="";custom.value="";wrap.hidden=true;}
  }
  function fillFields(value){
    const select=document.getElementById("matchLocation");
    const custom=document.querySelector('#matchForm [name="location_custom"]');
    const wrap=document.getElementById("customLocationWrap");
    if(!select||!wrap||!custom)return;
    const names=registeredFields();
    select.innerHTML='<option value="">Selecciona campo</option>'+names.map(name=>`<option value="${safeAttr(name)}">${safeText(name)}</option>`).join("")+'<option value="__custom__">+ Escribir campo nuevo</option>';
    if(value&&names.some(name=>normalize(name)===normalize(value))){
      const existing=names.find(name=>normalize(name)===normalize(value));
      select.value=existing;custom.value="";wrap.hidden=true;
    }else if(value){select.value="__custom__";custom.value=value;wrap.hidden=false;}
    else{select.value="";custom.value="";wrap.hidden=true;}
  }
  function updateCompetitionPreviewStable(){
    const value=document.getElementById("matchCompetition")?.value||"";
    const preview=document.getElementById("competitionLogoPreview");
    if(preview)preview.innerHTML=value?`${competitionLogo(value,"preview")}<strong>${safeText(value)}</strong>`:'<span>Selecciona una competición</span>';
  }

  function prepareMatchForm(match,teamName){
    const form=document.getElementById("matchForm");
    if(!form)throw new Error("No se encontró el formulario de partidos");
    form.reset();
    form.elements.id.value=match?.id||"";
    fillTeamSelect(match?.team||teamName||"");
    fillCompetition(match?.competition||"");
    fillRounds(match?.round||"");
    form.elements.match_date.value=match?.match_date||"";
    form.elements.match_time.value=match?.match_time||"";
    form.elements.venue.value=match?.venue||"home";
    fillRivals(match?.opponent||"");
    fillFields(match?.location||"");
    form.elements.notes.value=match?.notes||"";
    document.getElementById("matchDialogTitle").textContent=match?"Editar partido":"Nuevo partido";
  }

  function saveMatch(event){
    event.preventDefault();
    event.stopImmediatePropagation();
    const form=event.currentTarget;
    const data=Object.fromEntries(new FormData(form));
    const opponent=data.opponent==="__custom__"?String(data.opponent_custom||"").trim():String(data.opponent||"").trim();
    const location=data.location==="__custom__"?String(data.location_custom||"").trim():String(data.location||"").trim();
    if(!data.team)return toast("Selecciona el equipo");
    if(!data.competition)return toast("Selecciona la competición");
    if(!data.round)return toast("Selecciona la jornada");
    if(!opponent)return toast("Selecciona o escribe el equipo rival");
    if(!data.match_date)return toast("Indica la fecha del partido");

    const previous=clubMatches.find(item=>String(item.id)===String(data.id))||{};
    const record={
      ...previous,
      id:data.id||`match_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
      team:String(data.team).trim(),
      competition:String(data.competition).trim(),
      round:String(data.round).trim(),
      match_date:data.match_date,
      match_time:data.match_time||"",
      venue:data.venue||"home",
      opponent,
      location,
      goals_for:previous.goals_for??"",
      goals_against:previous.goals_against??"",
      finished:Boolean(previous.finished),
      notes:String(data.notes||"").trim()
    };
    const index=clubMatches.findIndex(item=>String(item.id)===String(record.id));
    if(index>=0)clubMatches[index]=record;else clubMatches.push(record);
    saveClubMatches();

    if(data.opponent==="__custom__"&&!opponentRecord(opponent)){
      if(typeof loadRivalTeams==="function")loadRivalTeams();
      rivalTeams.push({id:`rival_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,name:opponent,crest:""});
      if(typeof saveRivalTeams==="function")saveRivalTeams();
    }
    readFields();
    if(location&&!matchFields.some(name=>normalize(name)===normalize(location))){matchFields.push(location);saveFields();}

    renderDashboardMatches();
    document.getElementById("matchDialog")?.close();
    toast(index>=0?"Partido actualizado":"Partido creado");
  }

  function prepareResultForm(match){
    const form=document.getElementById("resultForm");
    if(!form)throw new Error("No se encontró el formulario de resultados");
    form.reset();
    form.elements.id.value=match.id;
    form.elements.goals_for.value=hasResult(match)?match.goals_for:"";
    form.elements.goals_against.value=hasResult(match)?match.goals_against:"";
    document.getElementById("resultTeamLabel").textContent=match.team;
    document.getElementById("resultOpponentLabel").textContent=match.opponent;
    document.getElementById("resultDialogTitle").textContent=`Resultado · ${match.round||"Partido"}`;
  }
  function saveResult(event){
    event.preventDefault();
    event.stopImmediatePropagation();
    const data=Object.fromEntries(new FormData(event.currentTarget));
    const match=clubMatches.find(item=>String(item.id)===String(data.id));
    if(!match)return toast("Partido no encontrado");
    match.goals_for=Math.max(0,Number(data.goals_for)||0);
    match.goals_against=Math.max(0,Number(data.goals_against)||0);
    saveClubMatches();
    renderDashboardMatches();
    document.getElementById("resultDialog")?.close();
    toast("Resultado guardado");
  }

  function renderFieldsManager(){
    readFields();
    const list=document.getElementById("matchFieldsList");
    if(!list)return;
    list.innerHTML=matchFields.length?matchFields.map((name,index)=>`<article class="v258-field-row"><span>🏟️</span><strong>${safeText(name)}</strong><button type="button" data-delete-field="${index}">Eliminar</button></article>`).join(""):'<div class="team-tab-empty">No hay campos registrados.</div>';
  }
  function openManager(){
    openChild("rivalTeamsDialog",()=>{
      if(typeof loadRivalTeams==="function")loadRivalTeams();
      if(typeof resetRivalTeamForm==="function")resetRivalTeamForm();
      if(typeof renderRivalTeams==="function")renderRivalTeams();
      renderFieldsManager();
    });
  }
  function openPdf(teamName){
    openChild("matchesPdfDialog",()=>{
      fillMatchTeamSelects();
      pdfParsedMatches=[];
      const file=document.getElementById("matchesPdfFile");
      const status=document.getElementById("matchesPdfStatus");
      const team=document.getElementById("pdfImportTeam");
      const competition=document.getElementById("pdfImportCompetition");
      if(file)file.value="";
      if(status)status.textContent="";
      if(team)team.value=teamName||"";
      if(competition&&!competition.value)competition.value="Liga AAFB";
      renderPdfPreview();
    });
  }


  const POSTER_TEMPLATES_V261=[
    {id:"warrior",name:"Dragón guerrero",colors:["#010713","#073f78","#0aa9ff"],mode:"warrior"},
    {id:"fire",name:"Dragón ígneo",colors:["#100300","#7b1d00","#ff6a00"],mode:"fire"},
    {id:"royal",name:"Dragón real",colors:["#02050d","#152a46","#d9b64c"],mode:"throne"},
    {id:"storm",name:"Dragón tormenta",colors:["#050216","#321170","#8a55ff"],mode:"storm"},
    {id:"gladiator",name:"Dragón gladiador",colors:["#120900","#5a3518","#d99b54"],mode:"arena"},
    {id:"night",name:"Dragón nocturno",colors:["#00040c","#04152c","#1267ac"],mode:"night"},
    {id:"ice",name:"Reino de hielo",colors:["#03101b","#245879","#b9ecff"],mode:"ice"},
    {id:"black",name:"Fuego negro",colors:["#030303","#242424","#ff3c1f"],mode:"embers"},
    {id:"castle",name:"Asedio al castillo",colors:["#020b14","#12395a","#50b8ff"],mode:"castle"},
    {id:"crown",name:"Corona del dragón",colors:["#070512","#302052","#d4b45f"],mode:"crown"},
    {id:"steel",name:"Acero azul",colors:["#07101a","#24425f","#8ec9ff"],mode:"steel"},
    {id:"legend",name:"Leyenda del dragón",colors:["#05120a","#164528","#3ee28a"],mode:"legend"}
  ];
  let titleStyleV261={bold:true,italic:false,underline:false};
  let subtitleStyleV261={bold:true,italic:false,underline:false};
  let activePosterMatchId="";
  function loadImage(src){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=src;});}
  function roundRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();}
  function fitText(ctx,text,maxWidth,startSize,minSize=22){let size=startSize;do{ctx.font=`900 ${size}px Arial`;if(ctx.measureText(text).width<=maxWidth)return size;size-=2;}while(size>minSize);return minSize;}
  function posterValue(id,fallback=""){const el=document.getElementById(id);return el&&el.value!==""?el.value:fallback;}
  function posterChecked(id,def=true){const el=document.getElementById(id);return el?el.checked:def;}
  function fillPosterEditor(match){
    const home=match.venue==="away"?(match.opponent||""):(match.team||"CD San Bernabé");
    const away=match.venue==="away"?(match.team||"CD San Bernabé"):(match.opponent||"");
    const values={posterHeadline:"MATCH DAY",posterSubtitle:"PROHIBIDO RENDIRSE",posterCompetition:match.competition||"",posterRound:match.round||"",posterHome:home,posterAway:away,posterDate:match.match_date||"",posterTime:match.match_time||"",posterField:match.location||""};
    Object.entries(values).forEach(([id,v])=>{const e=document.getElementById(id);if(e)e.value=v;});
    const hg=document.getElementById("posterHomeGoals"),ag=document.getElementById("posterAwayGoals");
    if(hg)hg.value=hasResult(match)?(match.venue==="away"?match.goals_against:match.goals_for):"";
    if(ag)ag.value=hasResult(match)?(match.venue==="away"?match.goals_for:match.goals_against):"";
  }
  async function drawPoster(match){
    const canvas=document.getElementById("matchPosterCanvas"); if(!canvas)return;
    const format=posterValue("posterFormat","portrait");
    const dims={square:[1080,1080],portrait:[1080,1350],story:[1080,1920]}[format]||[1080,1350];
    canvas.width=dims[0];canvas.height=dims[1];
    const W=canvas.width,H=canvas.height,ctx=canvas.getContext("2d");
    const template=posterValue("posterTemplate","warrior");
    const tpl=POSTER_TEMPLATES_V261.find(t=>t.id===template)||POSTER_TEMPLATES_V261[0];
    const pal=tpl.colors;
    const g=ctx.createLinearGradient(0,0,W,H);g.addColorStop(0,pal[0]);g.addColorStop(.58,pal[1]);g.addColorStop(1,pal[0]);ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    // Ambiente único de cada plantilla
    ctx.save();
    if(["fire","embers"].includes(tpl.mode)){ctx.globalAlpha=.42;for(let i=0;i<90;i++){const x=(i*83)%W,y=H-((i*137)%H),r=2+(i%7);ctx.fillStyle=i%3?pal[2]:"#ffd08a";ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();}}
    if(["storm","ice"].includes(tpl.mode)){ctx.globalAlpha=.35;ctx.strokeStyle=pal[2];ctx.lineWidth=7;for(let i=0;i<7;i++){ctx.beginPath();ctx.moveTo((i*181)%W,0);ctx.lineTo((i*279+120)%W,H*.52);ctx.stroke();}}
    if(["throne","crown"].includes(tpl.mode)){ctx.globalAlpha=.28;ctx.fillStyle=pal[2];for(let i=0;i<11;i++)ctx.fillRect(i*W/11,H*.08,2,H*.76);ctx.beginPath();ctx.moveTo(W*.36,H*.43);ctx.lineTo(W*.5,H*.22);ctx.lineTo(W*.64,H*.43);ctx.fill();}
    if(["arena","castle"].includes(tpl.mode)){ctx.globalAlpha=.3;ctx.fillStyle="#000";for(let i=0;i<9;i++){const x=i*W/9;ctx.fillRect(x,H*.25,80,H*.38);ctx.fillRect(x+20,H*.18,14,H*.12);}}
    if(tpl.mode==="legend"){ctx.globalAlpha=.22;ctx.strokeStyle=pal[2];ctx.lineWidth=3;for(let i=0;i<18;i++){ctx.beginPath();ctx.arc(W/2,H*.34,90+i*18,0,Math.PI*2);ctx.stroke();}}
    ctx.restore();

    // castillo, tormenta, humo y energía
    ctx.globalAlpha=.22;ctx.fillStyle="#000";for(let x=0;x<W;x+=120){const bh=120+((x*37)%260);ctx.fillRect(x,H*.45-bh,85,bh);ctx.fillRect(x+24,H*.45-bh-55,12,55)}
    ctx.globalAlpha=.28;ctx.strokeStyle=pal[2];ctx.lineWidth=5;for(let i=0;i<14;i++){ctx.beginPath();ctx.moveTo((i*97)%W,0);ctx.lineTo((i*173+230)%W,H*.54);ctx.stroke()}
    ctx.globalAlpha=1;
    // silueta de dragón central estilizada
    ctx.save();ctx.translate(W/2,H*.26);ctx.scale(W/1080,W/1080);ctx.fillStyle="rgba(0,0,0,.72)";ctx.beginPath();ctx.moveTo(-360,180);ctx.bezierCurveTo(-280,-70,-80,-190,55,-115);ctx.bezierCurveTo(175,-210,360,-150,390,45);ctx.bezierCurveTo(250,-55,170,30,120,95);ctx.bezierCurveTo(40,10,-40,10,-100,100);ctx.bezierCurveTo(-190,0,-280,80,-360,180);ctx.fill();ctx.restore();
    ctx.shadowColor=pal[2];ctx.shadowBlur=25;ctx.strokeStyle=pal[2];ctx.lineWidth=4;ctx.beginPath();ctx.arc(W*.52,H*.25,85,0,Math.PI*2);ctx.stroke();ctx.shadowBlur=0;
    let centerImg=null,clubImg=null,rivalImg=null,compImg=null;
    try{centerImg=await loadImage("assets/emblema-cartel-san-bernabe.jpg");}catch(_){}
    try{clubImg=await loadImage("assets/escudo-oficial.png");}catch(_){}
    try{compImg=await loadImage(COMPETITION_IMAGES_V258[match.competition]);}catch(_){}
    try{const r=opponentRecord(match.opponent);if(r?.crest)rivalImg=await loadImage(r.crest);}catch(_){}
    const headline=posterValue("posterHeadline","MATCH DAY").toUpperCase();
    ctx.textAlign="center";ctx.fillStyle="#fff";ctx.font="700 28px Georgia";ctx.letterSpacing="10px";ctx.fillText("CD SAN BERNABÉ",W/2,58);
    ctx.fillStyle=pal[2];ctx.font="800 20px Arial";ctx.fillText("TU SEGUNDA PIEL",W/2,90);
    let titleSize=fitText(ctx,headline,W-120,116,54);const titleFamily=posterValue("posterTitleFont","serif")==="sans"?"Arial":posterValue("posterTitleFont","serif")==="impact"?"Impact":"Georgia";ctx.font=`${titleStyleV261.italic?"italic ":""}${titleStyleV261.bold?"900":"700"} ${titleSize}px ${titleFamily}`;ctx.fillStyle=posterValue("posterTitleColor","#dcecff");ctx.strokeStyle="#06111f";ctx.lineWidth=10;ctx.strokeText(headline,W/2,H*.24);ctx.fillText(headline,W/2,H*.24);
    const subtitle=posterValue("posterSubtitle","PROHIBIDO RENDIRSE").toUpperCase();
    ctx.fillStyle=posterValue("posterSubtitleColor",pal[2]);ctx.font=`${subtitleStyleV261.italic?"italic ":""}${subtitleStyleV261.bold?"800":"500"} 24px ${posterValue("posterSubtitleFont","sans")==="serif"?"Georgia":"Arial"}`;ctx.fillText(subtitle,W/2,H*.285);
    if(subtitleStyleV261.underline){const sw=ctx.measureText(subtitle).width;ctx.fillRect(W/2-sw/2,H*.294,sw,3);}
    const emblemSize=Math.min(W*.29,H*.22);if(centerImg){ctx.save();ctx.beginPath();ctx.arc(W/2,H*.42,emblemSize/2,0,Math.PI*2);ctx.clip();ctx.drawImage(centerImg,W/2-emblemSize/2,H*.42-emblemSize/2,emblemSize,emblemSize);ctx.restore();}
    // guerreros
    ctx.fillStyle="rgba(0,0,0,.92)";ctx.beginPath();ctx.moveTo(70,H*.67);ctx.lineTo(180,H*.47);ctx.lineTo(300,H*.67);ctx.fill();ctx.beginPath();ctx.moveTo(W-70,H*.67);ctx.lineTo(W-180,H*.47);ctx.lineTo(W-300,H*.67);ctx.fill();
    const home=posterValue("posterHome",match.team||"CD SAN BERNABÉ"),away=posterValue("posterAway",match.opponent||"RIVAL");
    const barY=H*.67;ctx.fillStyle="rgba(1,9,23,.93)";roundRect(ctx,55,barY,W-110,150,18);
    const cs=105;if(posterChecked("posterShowCrests")){if(clubImg)ctx.drawImage(clubImg,82,barY+22,cs,cs);if(rivalImg)ctx.drawImage(rivalImg,W-187,barY+22,cs,cs);}
    ctx.fillStyle="#fff";ctx.font="900 29px Arial";ctx.textAlign="left";ctx.fillText(home.toUpperCase(),205,barY+88);ctx.textAlign="right";ctx.fillText(away.toUpperCase(),W-205,barY+88);ctx.textAlign="center";ctx.fillStyle=pal[2];ctx.font="900 62px Arial";ctx.fillText("VS",W/2,barY+96);
    const infoY=barY+175,cardW=(W-140)/4,cardH=125;
    const date=posterValue("posterDate",match.match_date||""); const time=posterValue("posterTime",match.match_time||""); const field=posterValue("posterField",match.location||""); const comp=posterValue("posterCompetition",match.competition||""); const round=posterValue("posterRound",match.round||"");
    const dateObj=date?new Date(date+"T12:00:00"):null;const day=dateObj?String(dateObj.getDate()).padStart(2,"0"):"--";const month=dateObj?dateObj.toLocaleDateString("es-ES",{month:"short"}).toUpperCase():"FECHA";
    const items=[];if(posterChecked("posterShowDate"))items.push([day,month],[time||"--:--","HORAS"]);if(posterChecked("posterShowField"))items.push([field||"CAMPO","CAMPO"]);if(posterChecked("posterShowComp"))items.push([comp||"COMPETICIÓN",round||"JORNADA"]);
    const total=items.length||1, gap=10, cw=(W-110-gap*(total-1))/total;items.forEach((it,i)=>{const x=55+i*(cw+gap);ctx.fillStyle="rgba(2,16,36,.9)";roundRect(ctx,x,infoY,cw,cardH,12);ctx.fillStyle=pal[2];ctx.font="900 30px Arial";ctx.fillText(String(it[0]).toUpperCase(),x+cw/2,infoY+53);ctx.fillStyle="#fff";ctx.font="700 18px Arial";ctx.fillText(String(it[1]).toUpperCase(),x+cw/2,infoY+88)});
    const hg=posterValue("posterHomeGoals",""),ag=posterValue("posterAwayGoals","");if(posterChecked("posterShowResult")&&hg!==""&&ag!==""){ctx.fillStyle="#fff";ctx.font="900 64px Arial";ctx.fillText(`${hg}  -  ${ag}`,W/2,infoY+190)}
    ctx.fillStyle="#fff";ctx.font="700 22px Arial";ctx.fillText("JUNTOS SOMOS MÁS FUERTES",W/2,H-65);ctx.fillStyle=pal[2];ctx.font="900 31px Arial";ctx.fillText("SOMOS DRAGONES",W/2,H-27);ctx.textAlign="start";
  }
  function openPoster(id){
    const match=clubMatches.find(item=>String(item.id)===String(id));if(!match)return toast("Partido no encontrado");
    activePosterMatchId=id;openChild("posterDialog",()=>{fillPosterEditor(match);drawPoster(match);});
  }
  function posterBlob(){return new Promise(resolve=>document.getElementById("matchPosterCanvas")?.toBlob(resolve,"image/jpeg",.94));}
  async function downloadPoster(){const match=clubMatches.find(item=>String(item.id)===String(activePosterMatchId));if(!match)return;const blob=await posterBlob();if(!blob)return;const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`Cartel_${match.team}_${match.opponent}_${match.match_date||"partido"}.jpg`.replace(/[^a-z0-9_.-]+/gi,"_");a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
  async function sharePoster(){const match=clubMatches.find(item=>String(item.id)===String(activePosterMatchId));if(!match)return;const blob=await posterBlob();if(!blob)return;const file=new File([blob],"cartel-partido.jpg",{type:"image/jpeg"});if(navigator.share&&navigator.canShare?.({files:[file]})){await navigator.share({title:`${match.team} - ${match.opponent}`,text:`${match.competition} · ${match.round}`,files:[file]});}else{await downloadPoster();toast("Cartel descargado. Súbelo desde Facebook o Instagram.");}}

  window.calendarV258={
    setView(view){
      saveView(view);
      const team=teamById(currentTeamDetailId);
      if(team)renderCalendar(team);
    },
    newMatch(teamName){
      const selectedTeam=teamName||teamById(currentTeamDetailId)?.name||"";
      openChild("matchDialog",()=>prepareMatchForm(null,selectedTeam));
    },
    edit(id){
      const match=clubMatches.find(item=>String(item.id)===String(id));
      if(!match)return toast("Partido no encontrado");
      openChild("matchDialog",()=>prepareMatchForm(match,""));
    },
    result(id){
      const match=clubMatches.find(item=>String(item.id)===String(id));
      if(!match)return toast("Partido no encontrado");
      openChild("resultDialog",()=>prepareResultForm(match));
    },
    finish(id){
      const match=clubMatches.find(item=>String(item.id)===String(id));
      if(!match)return toast("Partido no encontrado");
      if(!match.finished&&!hasResult(match))return toast("Introduce el resultado antes de finalizar el partido");
      match.finished=!match.finished;
      saveClubMatches();
      renderDashboardMatches();
      const team=teamById(currentTeamDetailId);
      if(team)renderCalendar(team);
      toast(match.finished?"Partido finalizado":"Partido reabierto");
    },
    remove(id){
      const match=clubMatches.find(item=>String(item.id)===String(id));
      if(!match)return toast("Partido no encontrado");
      if(!confirm(`¿Eliminar el partido contra ${match.opponent}?`))return;
      clubMatches=clubMatches.filter(item=>String(item.id)!==String(id));
      saveClubMatches();
      renderDashboardMatches();
      const team=teamById(currentTeamDetailId);
      if(team)renderCalendar(team);
      toast("Partido eliminado");
    },
    manage:openManager,
    importPdf(teamName){openPdf(teamName||teamById(currentTeamDetailId)?.name||"");},
    poster:openPoster
  };

  function setup(){
    readFields();

    const matchForm=document.getElementById("matchForm");
    const resultForm=document.getElementById("resultForm");
    matchForm?.addEventListener("submit",saveMatch,true);
    resultForm?.addEventListener("submit",saveResult,true);

    ["posterFormat","posterTemplate","posterHeadline","posterSubtitle","posterTitleFont","posterSubtitleFont","posterTitleColor","posterSubtitleColor","posterCompetition","posterRound","posterSeason","posterHome","posterAway","posterDate","posterTime","posterField","posterHomeGoals","posterAwayGoals","posterShowCrests","posterShowComp","posterShowDate","posterShowField","posterShowResult"].forEach(id=>{
      const el=document.getElementById(id);const ev=(el?.type==="text"||el?.type==="number")?"input":"change";el?.addEventListener(ev,()=>{const m=clubMatches.find(x=>String(x.id)===String(activePosterMatchId));if(m)drawPoster(m);});
    });
    const templateSelect=document.getElementById("posterTemplate");
    if(templateSelect){templateSelect.innerHTML=POSTER_TEMPLATES_V261.map(t=>`<option value="${t.id}">${t.name}</option>`).join("");}
    const templateGrid=document.getElementById("posterTemplatesGrid");
    if(templateGrid){
      templateGrid.innerHTML=POSTER_TEMPLATES_V261.map((t,i)=>`<button type="button" class="v261-template-card ${i===0?"active":""}" data-template="${t.id}"><span class="check">✓</span><canvas width="180" height="225"></canvas><strong>${t.name.toUpperCase()}</strong></button>`).join("");
      templateGrid.querySelectorAll(".v261-template-card").forEach((card)=>{
        const t=POSTER_TEMPLATES_V261.find(x=>x.id===card.dataset.template),c=card.querySelector("canvas"),cx=c.getContext("2d"),gr=cx.createLinearGradient(0,0,c.width,c.height);gr.addColorStop(0,t.colors[0]);gr.addColorStop(.6,t.colors[1]);gr.addColorStop(1,t.colors[0]);cx.fillStyle=gr;cx.fillRect(0,0,c.width,c.height);cx.fillStyle=t.colors[2];cx.globalAlpha=.35;cx.beginPath();cx.arc(90,75,52,0,Math.PI*2);cx.fill();cx.globalAlpha=1;cx.fillStyle="#fff";cx.textAlign="center";cx.font="900 22px Georgia";cx.fillText("MATCH",90,108);cx.fillText("DAY",90,132);cx.fillStyle=t.colors[2];cx.font="900 10px Arial";cx.fillText("CD SAN BERNABÉ",90,198);
        card.addEventListener("click",()=>{templateGrid.querySelectorAll(".v261-template-card").forEach(x=>x.classList.remove("active"));card.classList.add("active");templateSelect.value=card.dataset.template;templateSelect.dispatchEvent(new Event("change"));});
      });
    }
    document.querySelectorAll(".v261-format-grid button").forEach(btn=>btn.addEventListener("click",()=>{document.querySelectorAll(".v261-format-grid button").forEach(x=>x.classList.remove("active"));btn.classList.add("active");const sel=document.getElementById("posterFormat");sel.value=btn.dataset.format;sel.dispatchEvent(new Event("change"));}));
    document.querySelectorAll("[data-title-style]").forEach(btn=>btn.addEventListener("click",()=>{const k=btn.dataset.titleStyle;titleStyleV261[k]=!titleStyleV261[k];btn.classList.toggle("active",titleStyleV261[k]);const m=clubMatches.find(x=>String(x.id)===String(activePosterMatchId));if(m)drawPoster(m);}));
    document.querySelectorAll("[data-subtitle-style]").forEach(btn=>btn.addEventListener("click",()=>{const k=btn.dataset.subtitleStyle;subtitleStyleV261[k]=!subtitleStyleV261[k];btn.classList.toggle("active",subtitleStyleV261[k]);const m=clubMatches.find(x=>String(x.id)===String(activePosterMatchId));if(m)drawPoster(m);}));
    document.getElementById("regeneratePoster")?.addEventListener("click",()=>{const m=clubMatches.find(x=>String(x.id)===String(activePosterMatchId));if(m)drawPoster(m);});
    document.getElementById("closePosterEditor")?.addEventListener("click",()=>{const d=document.getElementById("posterDialog");if(d?.open)d.close();});
    document.getElementById("downloadPoster")?.addEventListener("click",downloadPoster);
    document.getElementById("sharePoster")?.addEventListener("click",()=>sharePoster().catch(e=>toast(e?.message||"No se pudo compartir")));
    document.getElementById("sharePosterFacebook")?.addEventListener("click",()=>sharePoster().catch(e=>toast(e?.message||"No se pudo compartir")));
    document.getElementById("sharePosterInstagram")?.addEventListener("click",()=>sharePoster().catch(e=>toast(e?.message||"No se pudo compartir")));

    document.getElementById("matchCompetition")?.addEventListener("change",updateCompetitionPreviewStable);
    document.getElementById("matchOpponent")?.addEventListener("change",event=>{
      const wrap=document.getElementById("customOpponentWrap");
      if(wrap)wrap.hidden=event.target.value!=="__custom__";
    });
    document.getElementById("matchLocation")?.addEventListener("change",event=>{
      const wrap=document.getElementById("customLocationWrap");
      if(wrap)wrap.hidden=event.target.value!=="__custom__";
    });

    ["matchDialog","resultDialog","matchesPdfDialog","rivalTeamsDialog","posterDialog"].forEach(id=>{
      document.getElementById(id)?.addEventListener("close",()=>{
        if(activeChildDialog===id)setTimeout(restoreParent,40);
      });
    });

    const fieldsForm=document.getElementById("matchFieldForm");
    fieldsForm?.addEventListener("submit",event=>{
      event.preventDefault();
      const value=String(new FormData(fieldsForm).get("field_name")||"").trim();
      if(!value)return toast("Escribe el nombre del campo");
      readFields();
      if(matchFields.some(name=>normalize(name)===normalize(value)))return toast("Ese campo ya está registrado");
      matchFields.push(value);saveFields();fieldsForm.reset();renderFieldsManager();toast("Campo añadido");
    });
    document.getElementById("matchFieldsList")?.addEventListener("click",event=>{
      const button=event.target.closest("[data-delete-field]");
      if(!button)return;
      const index=Number(button.dataset.deleteField);
      readFields();
      const name=matchFields[index];
      if(name&&confirm(`¿Eliminar el campo ${name}?`)){matchFields.splice(index,1);saveFields();renderFieldsManager();toast("Campo eliminado");}
    });

    // Corrige de forma preventiva la función antigua que causaba pitchUsages is not defined.
    if(typeof knownLocations!=="undefined"){
      knownLocations=function(){return registeredFields();};
    }
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",setup,{once:true});
  else setup();
})();
