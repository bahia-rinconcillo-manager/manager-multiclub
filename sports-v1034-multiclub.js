/* Manager Multiclub V1.0.34 · Calendario integrado en Partidos/Estadísticas */
(function(){
  "use strict";

  let trainings=[];
  let trainingAttendance=[];
  let matches=[];
  let matchStats=[];
  let loaded=false;

  const $=id=>document.getElementById(id);
  const safe=value=>typeof esc==="function"?esc(String(value??"")):String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
  const notify=message=>typeof toast==="function"?toast(message):alert(message);
  const technical=()=>typeof isTechnicalReadOnly==="function"&&isTechnicalReadOnly();
  const historical=()=>Boolean(window.CDSB_SEASON_STATE?.historical);
  const token=()=>technical()&&typeof getTechnicalSessionToken==="function"?getTechnicalSessionToken():null;
  const clubId=()=>String(window.MULTICLUB_CURRENT_CLUB?.id||"");
  const missingRpcV1033=error=>String(error?.code||"")==="PGRST202"||/could not find the function|schema cache/i.test(String(error?.message||""));
  async function rpcV1033(base,args={}){
    const id=clubId();
    if(!id)throw new Error("No hay un club activo.");
    const response=await sb.rpc(base+"_multiclub_v1033",{p_club_id:id,p_token:token(),...args});
    return response;
  }
  const today=()=>new Date().toISOString().slice(0,10);
  const currentMonth=()=>new Date().toISOString().slice(0,7);
  const number=value=>Number(value||0)||0;
  const lower=value=>String(value||"").trim().toLocaleLowerCase("es");
  let activeTeamPanel={tab:"",teamId:"",containerId:"teamSportsPanel"};
  const teamPanelFilters={attendanceMonth:"",matchesMonth:"",matchSearch:"",statsFrom:"",statsTo:""};

  function dateLabel(value){
    if(!value)return "Sin fecha";
    const date=new Date(`${value}T12:00:00`);
    if(Number.isNaN(date.getTime()))return value;
    return date.toLocaleDateString("es-ES",{weekday:"short",day:"2-digit",month:"short",year:"numeric"});
  }
  function timeLabel(value){return value?String(value).slice(0,5):"—"}
  function teamById(id){return (Array.isArray(teams)?teams:[]).find(t=>String(t.id)===String(id))}
  function teamName(id){return teamById(id)?.name||"Sin equipo"}
  function playersForTeam(teamId){
    const team=teamById(teamId);
    if(!team)return [];
    const list=(Array.isArray(players)?players:[])
      .filter(p=>lower(p.team)===lower(team.name)&&!p.deleted_at);
    return window.cdsbSortPlayers?window.cdsbSortPlayers(list):list.sort((a,b)=>`${a.surname||""} ${a.name||""}`.localeCompare(`${b.surname||""} ${b.name||""}`,"es",{sensitivity:"base"}));
  }
  function playerById(id){return (Array.isArray(players)?players:[]).find(p=>String(p.id)===String(id))}
  function playerName(id){const p=playerById(id);return p?`${p.name||""} ${p.surname||""}`.trim():"Jugador"}
  function playerPhotoUrl(player){
    if(!player)return "assets/avatar-jugador.svg";
    try{
      if(player.photo_path&&typeof signedCache!=="undefined"&&signedCache[player.photo_path])return signedCache[player.photo_path];
    }catch(_){}
    try{if(typeof placeholderPhoto!=="undefined"&&placeholderPhoto)return placeholderPhoto}catch(_){}
    return "assets/avatar-jugador.svg";
  }
  function fileSafe(value){return String(value||"convocatoria").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/gi,"_").replace(/^_+|_+$/g,"").toLowerCase()||"convocatoria"}
  async function imageToDataUrl(src){
    if(!src||String(src).endsWith(".svg"))return "";
    if(String(src).startsWith("data:image/"))return String(src);
    try{
      const response=await fetch(src,{cache:"no-store"});
      if(!response.ok)throw new Error("Imagen no disponible");
      const blob=await response.blob();
      return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||""));reader.onerror=reject;reader.readAsDataURL(blob)});
    }catch(_){return ""}
  }
  function recordResult(data){return Array.isArray(data)?data[0]:data}

  const CALENDAR_MARKER_V1034=/\[\[MULTICLUB_CALENDAR:([0-9a-f-]{36})\]\]/i;
  function calendarRowsV1034(){
    try{
      const rows=window.getMulticlubCalendarMatchesV1034?.();
      return Array.isArray(rows)?rows:[];
    }catch(_){return []}
  }
  function calendarIdFromNotesV1034(notes){return String(notes||"").match(CALENDAR_MARKER_V1034)?.[1]||""}
  function cleanNotesV1034(notes){return String(notes||"").replace(CALENDAR_MARKER_V1034,"").trim()}
  function notesWithCalendarV1034(notes,id){
    const clean=cleanNotesV1034(notes);
    return id?`${clean}${clean?"\n":""}[[MULTICLUB_CALENDAR:${id}]]`:clean||null;
  }
  function calendarKeyV1034(item){
    return [String(item?.team_id||""),String(item?.match_date||""),lower(item?.opponent||""),lower(item?.competition||"")].join("|");
  }
  function calendarToSportsV1034(item){
    return {
      id:`calendar:${item.id}`,
      __calendar_id:String(item.id||""),
      __calendar_virtual:true,
      team_id:item.team_id,
      match_date:item.match_date||"",
      match_time:item.match_time?String(item.match_time).slice(0,5):null,
      opponent:item.opponent||"Rival pendiente",
      competition:item.competition||null,
      venue:item.location||null,
      home_away:String(item.venue||"").toLowerCase()==="away"?"Visitante":"Local",
      goals_for:item.goals_for===""?null:(item.goals_for??null),
      goals_against:item.goals_against===""?null:(item.goals_against??null),
      notes:cleanNotesV1034(item.notes||""),
      finished:Boolean(item.finished),
      round:item.round||null
    };
  }
  function allMatchesV1034(){
    const calendar=calendarRowsV1034();
    if(!calendar.length)return matches;
    const byId=new Map(calendar.map(x=>[String(x.id),x]));
    const byKey=new Map(calendar.map(x=>[calendarKeyV1034(x),x]));
    const used=new Set();
    const output=matches.map(item=>{
      const marked=calendarIdFromNotesV1034(item.notes);
      const linked=byId.get(marked)||byKey.get(calendarKeyV1034(item));
      if(!linked)return {...item,notes:cleanNotesV1034(item.notes)};
      used.add(String(linked.id));
      const mapped=calendarToSportsV1034(linked);
      return {...item,...mapped,id:item.id,__calendar_id:String(linked.id),__calendar_virtual:false,notes:cleanNotesV1034(item.notes)||cleanNotesV1034(linked.notes)};
    });
    for(const item of calendar){
      if(!used.has(String(item.id)))output.push(calendarToSportsV1034(item));
    }
    return output;
  }
  function linkedCalendarV1034(item){
    if(!item)return null;
    const rows=calendarRowsV1034();
    const id=String(item.__calendar_id||calendarIdFromNotesV1034(item.notes)||"");
    return rows.find(x=>String(x.id)===id)||rows.find(x=>calendarKeyV1034(x)===calendarKeyV1034(item))||null;
  }
  async function promoteCalendarMatchV1034(item){
    if(!item?.__calendar_virtual)return item;
    const calendar=linkedCalendarV1034(item);
    if(!calendar)throw new Error("No se encontró el partido del calendario.");
    const payload={
      id:null,team_id:calendar.team_id,match_date:calendar.match_date,match_time:calendar.match_time||null,
      opponent:calendar.opponent||"Rival pendiente",competition:calendar.competition||null,venue:calendar.location||null,
      home_away:String(calendar.venue||"").toLowerCase()==="away"?"Visitante":"Local",
      goals_for:calendar.goals_for===""?null:(calendar.goals_for??null),
      goals_against:calendar.goals_against===""?null:(calendar.goals_against??null),
      notes:notesWithCalendarV1034(calendar.notes||"",calendar.id)
    };
    const {data,error}=await rpcV1033("sports_save_match",{p_payload:payload,p_player_stats:[]});
    if(error)throw error;
    const result=recordResult(data);
    if(result?.error_message)throw new Error(result.error_message);
    await load();
    return allMatchesV1034().find(x=>String(x.__calendar_id||"")===String(calendar.id)&&!x.__calendar_virtual)||null;
  }
  function rpcError(error,prefix){
    console.error(prefix,error);
    notify(`${prefix}: ${error?.message||"No se pudo completar la operación"}`);
  }

  function fillTeamSelect(select,selected="",includeAll=false){
    if(!select)return;
    const list=window.cdsbSortByAlpha?window.cdsbSortByAlpha(Array.isArray(teams)?teams:[],t=>t.name):(Array.isArray(teams)?teams:[]);
    const desired=selected||select.value||((technical()&&currentAccess?.team_id)||"");
    select.innerHTML=(includeAll&&!technical()?'<option value="">Todos los equipos</option>':'')+
      list.map(t=>`<option value="${safe(t.id)}">${safe(t.name)}</option>`).join("");
    if(desired&&list.some(t=>String(t.id)===String(desired)))select.value=desired;
    else if(list.length&&!includeAll)select.value=String(list[0].id);
    select.disabled=technical();
  }

  function initialiseFilters(){
    [$("sportsTrainingTeamFilter"),$("sportsMatchTeamFilter"),$("sportsStatsTeamFilter")].forEach(select=>fillTeamSelect(select,"",true));
    if($("sportsTrainingMonth")&&!$("sportsTrainingMonth").value)$("sportsTrainingMonth").value=currentMonth();
    // Partidos: toda la temporada visible por defecto. El mes queda como filtro opcional.
    renderStatsPlayerOptions();
  }

  async function load(){
    if(historical()){if(loaded){initialiseFilters();render();renderActiveTeamPanel();}return true;}
    if(typeof sb==="undefined"||!sb)return;
    try{
      let data,error;
      ({data,error}=await rpcV1033("sports_snapshot"));
      if(error&&missingRpcV1033(error)){
        ({data,error}=await sb.rpc("sports_snapshot",{p_token:token()}));
      }
      if(error)throw error;
      if(!data?.ok)throw new Error(data?.message||"No se pudo cargar el seguimiento deportivo");
      trainings=Array.isArray(data.trainings)?data.trainings:[];
      trainingAttendance=Array.isArray(data.training_attendance)?data.training_attendance:[];
      matches=Array.isArray(data.matches)?data.matches:[];
      matchStats=Array.isArray(data.match_stats)?data.match_stats:[];
      loaded=true;
      initialiseFilters();
      render();
      renderActiveTeamPanel();
      return true;
    }catch(error){
      const missingSnapshot=missingRpcV1033(error)&&/sports_snapshot/i.test(String(error?.message||""));
      if(missingSnapshot){
        trainings=[];trainingAttendance=[];matches=[];matchStats=[];loaded=true;
        initialiseFilters();render();renderActiveTeamPanel();
        console.info("Manager Multiclub V1.0.33: ejecuta la actualización SQL de Deportes para activar el módulo.");
        return true;
      }
      rpcError(error,"Seguimiento deportivo");renderActiveTeamPanel(error);return false
    }
  }

  function filteredTrainings(){
    const teamId=$("sportsTrainingTeamFilter")?.value||"";
    const month=$("sportsTrainingMonth")?.value||"";
    return trainings.filter(item=>(!teamId||String(item.team_id)===String(teamId))&&(!month||String(item.session_date||"").startsWith(month)));
  }
  function attendanceForSession(id){return trainingAttendance.filter(a=>String(a.session_id)===String(id))}
  function attendanceCounts(id){
    const list=attendanceForSession(id);
    return list.reduce((acc,row)=>{acc[row.status]=(acc[row.status]||0)+1;return acc},{Presente:0,Ausente:0,Justificada:0,Lesionado:0,Tarde:0});
  }
  function trainingAttendanceRate(list){
    const ids=new Set(list.map(x=>String(x.id)));
    const rows=trainingAttendance.filter(a=>ids.has(String(a.session_id)));
    if(!rows.length)return 0;
    const attended=rows.filter(a=>a.status==="Presente"||a.status==="Tarde").length;
    return Math.round(attended*100/rows.length);
  }

  function renderTrainings(){
    const list=filteredTrainings();
    const tbody=$("sportsTrainingBody");
    const sessions=$("sportsTrainingSessions");
    const rate=$("sportsTrainingRate");
    const absences=$("sportsTrainingAbsences");
    const justified=$("sportsTrainingJustified");
    if(sessions)sessions.textContent=String(list.length);
    if(rate)rate.textContent=`${trainingAttendanceRate(list)}%`;
    const sessionIds=new Set(list.map(x=>String(x.id)));
    const rows=trainingAttendance.filter(a=>sessionIds.has(String(a.session_id)));
    if(absences)absences.textContent=String(rows.filter(a=>a.status==="Ausente").length);
    if(justified)justified.textContent=String(rows.filter(a=>a.status==="Justificada").length);
    if(!tbody)return;
    tbody.innerHTML=list.length?list.map(item=>{
      const count=attendanceCounts(item.id);
      const total=Object.values(count).reduce((a,b)=>a+b,0);
      return `<tr>
        <td><strong>${safe(dateLabel(item.session_date))}</strong><small>${safe(timeLabel(item.session_time))}</small></td>
        <td><strong>${safe(item.title||"Entrenamiento")}</strong><small>${safe(item.session_type||"Entrenamiento")}</small></td>
        <td>${safe(teamName(item.team_id))}</td>
        <td><span class="sports-pill present">${count.Presente+count.Tarde}/${total||0}</span></td>
        <td><span class="sports-pill absent">${count.Ausente}</span></td>
        <td><span class="sports-pill justified">${count.Justificada}</span></td>
        <td class="sports-actions"><button type="button" onclick="sportsV2701.editTraining('${safe(item.id)}')">✏️ Asistencia</button><button type="button" class="danger" onclick="sportsV2701.deleteTraining('${safe(item.id)}')">Eliminar</button></td>
      </tr>`;
    }).join(""):'<tr><td colspan="7" class="sports-empty">No hay entrenamientos en el periodo seleccionado.</td></tr>';
  }

  function trainingRosterHtml(teamId,sessionId=""){
    const existing=new Map(attendanceForSession(sessionId).map(row=>[String(row.player_id),row]));
    const list=playersForTeam(teamId);
    if(!list.length)return '<div class="sports-empty">Este equipo no tiene jugadores.</div>';
    const statuses=["Presente","Ausente","Justificada","Lesionado","Tarde"];
    return `<div class="sports-roster-toolbar"><button type="button" data-mark-training="Presente">Todos presentes</button><button type="button" data-mark-training="Ausente">Todos ausentes</button></div>
      <div class="sports-roster-list">${list.map(player=>{
        const row=existing.get(String(player.id))||{status:"Presente",notes:""};
        return `<article class="sports-roster-row" data-player-id="${safe(player.id)}">
          <div class="sports-player"><span>${safe((player.name||"?").charAt(0))}${safe((player.surname||"?").charAt(0))}</span><div><strong>${safe(player.name||"")} ${safe(player.surname||"")}</strong><small>${safe(player.team||"")}</small></div></div>
          <select data-training-status>${statuses.map(status=>`<option ${row.status===status?"selected":""}>${status}</option>`).join("")}</select>
          <input data-training-note value="${safe(row.notes||"")}" placeholder="Observación opcional">
        </article>`;
      }).join("")}</div>`;
  }

  function openTraining(id="",presetTeamId=""){
    if(historical())return notify("La temporada histórica es de solo lectura");
    const dialog=$("sportsTrainingDialog");
    const form=$("sportsTrainingForm");
    if(!dialog||!form)return;
    const item=trainings.find(x=>String(x.id)===String(id));
    form.reset();
    form.elements.id.value=item?.id||"";
    fillTeamSelect(form.elements.team_id,item?.team_id||presetTeamId||currentAccess?.team_id||"",false);
    form.elements.team_id.disabled=technical()||Boolean(presetTeamId);
    form.elements.session_date.value=item?.session_date||today();
    form.elements.session_time.value=item?.session_time?String(item.session_time).slice(0,5):"";
    form.elements.title.value=item?.title||"Entrenamiento";
    form.elements.session_type.value=item?.session_type||"Entrenamiento";
    form.elements.notes.value=item?.notes||"";
    $("sportsTrainingDialogTitle").textContent=item?"Editar asistencia":"Nuevo entrenamiento";
    $("sportsTrainingRoster").innerHTML=trainingRosterHtml(form.elements.team_id.value,item?.id||"");
    dialog.showModal();
  }

  function collectTrainingAttendance(){
    return [...document.querySelectorAll("#sportsTrainingRoster .sports-roster-row")].map(row=>({
      player_id:row.dataset.playerId,
      status:row.querySelector("[data-training-status]")?.value||"Ausente",
      notes:row.querySelector("[data-training-note]")?.value.trim()||null
    }));
  }

  async function saveTraining(event){
    event.preventDefault();
    if(historical())return notify("La temporada histórica es de solo lectura");
    const form=event.currentTarget;
    const submit=form.querySelector('button[type="submit"]');
    const original=submit.textContent;
    submit.disabled=true;submit.textContent="Guardando...";
    try{
      const payload={
        id:form.elements.id.value||null,
        team_id:form.elements.team_id.value,
        session_date:form.elements.session_date.value,
        session_time:form.elements.session_time.value||null,
        title:form.elements.title.value.trim(),
        session_type:form.elements.session_type.value,
        notes:form.elements.notes.value.trim()||null
      };
      const attendance=collectTrainingAttendance();
      let data,error;
      ({data,error}=await rpcV1033("sports_save_training",{p_payload:payload,p_attendance:attendance}));
      if(error&&missingRpcV1033(error)){
        ({data,error}=await sb.rpc("sports_save_training",{p_token:token(),p_payload:payload,p_attendance:attendance}));
      }
      if(error)throw error;
      const result=recordResult(data);
      if(result?.error_message)throw new Error(result.error_message);
      $("sportsTrainingDialog").close();
      notify("Asistencia guardada");
      await load();
    }catch(error){rpcError(error,"Asistencia")}
    finally{submit.disabled=false;submit.textContent=original}
  }

  async function deleteTraining(id){
    if(historical())return notify("La temporada histórica es de solo lectura");
    if(!confirm("¿Eliminar este entrenamiento y su asistencia?"))return;
    try{
      let data,error;
      ({data,error}=await rpcV1033("sports_delete_training",{p_id:id}));
      if(error&&missingRpcV1033(error)){
        ({data,error}=await sb.rpc("sports_delete_training",{p_token:token(),p_id:id}));
      }
      if(error)throw error;
      const result=recordResult(data);
      if(result?.error_message)throw new Error(result.error_message);
      notify("Entrenamiento eliminado");await load();
    }catch(error){rpcError(error,"Entrenamiento")}
  }

  function filteredMatches(){
    const teamId=$("sportsMatchTeamFilter")?.value||"";
    const month=$("sportsMatchMonth")?.value||"";
    const search=lower($("sportsMatchSearch")?.value||"");
    return allMatchesV1034().filter(item=>(!teamId||String(item.team_id)===String(teamId))&&(!month||String(item.match_date||"").startsWith(month))&&(!search||lower(`${item.opponent} ${item.competition} ${item.venue}`).includes(search)));
  }
  function statsForMatch(id){return matchStats.filter(row=>String(row.match_id)===String(id))}
  function matchSummary(id){
    const list=statsForMatch(id);
    const match=allMatchesV1034().find(item=>String(item.id)===String(id));
    const fallbackMinutes=list.reduce((max,x)=>Math.max(max,number(x.minutes)),0);
    return {
      called:list.filter(x=>!["No convocado","Ausente","Lesionado"].includes(x.participation_status)).length,
      played:list.filter(x=>number(x.minutes)>0).length,
      minutes:number(match?.match_minutes)||fallbackMinutes,
      playerMinutes:list.reduce((sum,x)=>sum+number(x.minutes),0),
      goals:list.reduce((sum,x)=>sum+number(x.goals),0),
      yellow:list.reduce((sum,x)=>sum+number(x.yellow_cards),0),
      red:list.reduce((sum,x)=>sum+number(x.red_cards),0)
    };
  }
  function resultLabel(match){
    if(match.goals_for===null||match.goals_for===undefined||match.goals_against===null||match.goals_against===undefined)return "Pendiente";
    return `${match.goals_for} – ${match.goals_against}`;
  }

  function renderMatches(){
    const list=filteredMatches();
    const tbody=$("sportsMatchBody");
    if($("sportsMatchesCount"))$("sportsMatchesCount").textContent=String(list.length);
    const summaries=list.map(item=>matchSummary(item.id));
    if($("sportsMinutesTotal"))$("sportsMinutesTotal").textContent=String(summaries.reduce((s,x)=>s+x.minutes,0));
    if($("sportsYellowTotal"))$("sportsYellowTotal").textContent=String(summaries.reduce((s,x)=>s+x.yellow,0));
    if($("sportsRedTotal"))$("sportsRedTotal").textContent=String(summaries.reduce((s,x)=>s+x.red,0));
    if(!tbody)return;
    tbody.innerHTML=list.length?list.map(item=>{
      const sum=matchSummary(item.id);
      return `<tr>
        <td><strong>${safe(dateLabel(item.match_date))}</strong><small>${safe(timeLabel(item.match_time))}</small></td>
        <td><strong>${safe(item.opponent)}</strong><small>${safe(item.home_away||"Local")} · ${safe(item.venue||"Sin campo")}</small></td>
        <td>${safe(item.competition||"—")}</td>
        <td><span class="sports-result">${safe(resultLabel(item))}</span></td>
        <td>${sum.played}<small>${sum.called} convocados</small></td>
        <td><strong>${sum.minutes}</strong></td>
        <td><span class="sports-card yellow">${sum.yellow}</span> <span class="sports-card red">${sum.red}</span></td>
        <td class="sports-actions"><button type="button" onclick="sportsV2701.editMatch('${safe(item.id)}')">⚽ Datos</button><button type="button" class="danger" onclick="sportsV2701.deleteMatch('${safe(item.id)}')">Eliminar</button></td>
      </tr>`;
    }).join(""):'<tr><td colspan="8" class="sports-empty">No hay partidos en el periodo seleccionado.</td></tr>';
  }

  function matchRosterHtml(teamId,matchId=""){
    const existing=new Map(statsForMatch(matchId).map(row=>[String(row.player_id),row]));
    const list=playersForTeam(teamId);
    const statuses=["No convocado","Convocado","Titular","Suplente","Ausente","Lesionado"];
    if(!list.length)return '<div class="sports-empty">Este equipo no tiene jugadores.</div>';
    return `<div class="sports-roster-toolbar"><button type="button" data-mark-match="Convocado">Todos convocados</button><button type="button" data-mark-match="No convocado">Limpiar convocatoria</button></div>
      <div class="sports-match-roster">${list.map(player=>{
        const row=existing.get(String(player.id))||{participation_status:"No convocado",minutes:0,goals:0,yellow_cards:0,red_cards:0,notes:""};
        const minuteDisabled=["No convocado","Ausente","Lesionado"].includes(row.participation_status);
        const photo=playerPhotoUrl(player);
        return `<article class="sports-match-player" data-player-id="${safe(player.id)}">
          <div class="sports-player sports-player-with-photo"><img class="sports-player-photo" src="${safe(photo)}" alt="Foto de ${safe(player.name||"Jugador")}" onerror="this.onerror=null;this.src='assets/avatar-jugador.svg'"><div><strong>${safe(player.name||"")} ${safe(player.surname||"")}</strong><small>${safe(player.team||"")}</small></div></div>
          <label><small>Situación</small><select data-match-status>${statuses.map(status=>`<option ${row.participation_status===status?"selected":""}>${status}</option>`).join("")}</select></label>
          <label><small>Minutos</small><input data-match-minutes type="number" min="0" max="300" value="${number(row.minutes)}" ${minuteDisabled?"disabled":""}></label>
          <label><small>Goles</small><input data-match-goals type="number" min="0" max="99" value="${number(row.goals)}"></label>
          <label><small>Amarillas</small><select data-match-yellow><option ${number(row.yellow_cards)===0?"selected":""}>0</option><option ${number(row.yellow_cards)===1?"selected":""}>1</option><option ${number(row.yellow_cards)===2?"selected":""}>2</option></select></label>
          <label><small>Rojas</small><select data-match-red><option ${number(row.red_cards)===0?"selected":""}>0</option><option ${number(row.red_cards)===1?"selected":""}>1</option></select></label>
          <input data-match-note value="${safe(row.notes||"")}" placeholder="Observación">
        </article>`;
      }).join("")}</div>`;
  }

  async function openMatch(id="",presetTeamId=""){
    if(historical())return notify("La temporada histórica es de solo lectura");
    const dialog=$("sportsMatchDialog");
    const form=$("sportsMatchForm");
    if(!dialog||!form)return;
    let item=allMatchesV1034().find(x=>String(x.id)===String(id));
    if(item?.__calendar_virtual){
      try{
        item=await promoteCalendarMatchV1034(item);
        if(!item)throw new Error("No se pudo preparar el partido.");
      }catch(error){rpcError(error,"Calendario");return}
    }
    const competitionSelect=form.elements.competition;
    if(competitionSelect?.tagName==="SELECT" && ![...competitionSelect.options].some(o=>String(o.value||"").trim().toLowerCase()==="amistoso")){
      competitionSelect.add(new Option("Amistoso","Amistoso"));
    }
    form.reset();
    form.elements.id.value=item?.id||"";
    fillTeamSelect(form.elements.team_id,item?.team_id||presetTeamId||currentAccess?.team_id||"",false);
    form.elements.team_id.disabled=technical()||Boolean(presetTeamId);
    form.elements.match_date.value=item?.match_date||today();
    form.elements.match_time.value=item?.match_time?String(item.match_time).slice(0,5):"";
    form.elements.opponent.value=item?.opponent||"";
    form.elements.competition.value=item?.competition||"";
    form.elements.venue.value=item?.venue||"";
    form.elements.home_away.value=item?.home_away||"Local";
    form.elements.goals_for.value=item?.goals_for??"";
    form.elements.goals_against.value=item?.goals_against??"";
    form.elements.notes.value=item?.notes||"";
    $("sportsMatchDialogTitle").textContent=item?"Editar partido y estadísticas":"Nuevo partido";
    $("sportsMatchRoster").innerHTML=matchRosterHtml(form.elements.team_id.value,item?.id||"");
    dialog.showModal();
  }

  function collectMatchStats(){
    return [...document.querySelectorAll("#sportsMatchRoster .sports-match-player")].map(row=>({
      player_id:row.dataset.playerId,
      participation_status:row.querySelector("[data-match-status]")?.value||"No convocado",
      minutes:number(row.querySelector("[data-match-minutes]")?.value),
      goals:number(row.querySelector("[data-match-goals]")?.value),
      yellow_cards:number(row.querySelector("[data-match-yellow]")?.value),
      red_cards:number(row.querySelector("[data-match-red]")?.value),
      notes:row.querySelector("[data-match-note]")?.value.trim()||null
    }));
  }

  async function downloadCallupPdf(){
    const form=$("sportsMatchForm");
    if(!form)return;
    if(!window.jspdf?.jsPDF)return notify("No se pudo cargar el generador PDF");
    const called=collectMatchStats().filter(row=>!["No convocado","Ausente","Lesionado"].includes(row.participation_status));
    if(!called.length)return notify("Marca al menos un jugador como convocado antes de generar el PDF");
    const team=teamById(form.elements.team_id.value);
    const teamLabel=team?.name||"Equipo";
    const opponent=form.elements.opponent.value.trim()||"Rival pendiente";
    const competition=form.elements.competition.value.trim()||"Sin competición";
    const venue=form.elements.venue.value.trim()||"Campo pendiente";
    const condition=form.elements.home_away.value||"Local";
    const date=form.elements.match_date.value||today();
    const time=form.elements.match_time.value||"Hora pendiente";
    const rows=called.map(item=>({item,player:playerById(item.player_id)})).filter(x=>x.player);
    const photoData=new Map();
    await Promise.all(rows.map(async ({player})=>{const data=await imageToDataUrl(playerPhotoUrl(player));if(data)photoData.set(String(player.id),data)}));
    const {jsPDF}=window.jspdf;
    const doc=new jsPDF({orientation:"portrait",unit:"mm",format:"a4"});
    const pageWidth=doc.internal.pageSize.getWidth();
    doc.setFillColor(7,17,31);doc.rect(0,0,pageWidth,31,"F");
    doc.setTextColor(255,255,255);doc.setFont("helvetica","bold");doc.setFontSize(17);doc.text(`${window.multiclubClubUpper?.()||"MANAGER MULTICLUB"} · CONVOCATORIA`,14,13);
    doc.setFont("helvetica","normal");doc.setFontSize(10);doc.text(`${teamLabel} · ${condition} vs ${opponent}`,14,21);doc.text(`${dateLabel(date)} · ${timeLabel(time)} · ${competition}`,14,27);
    doc.setTextColor(24,34,48);doc.setFont("helvetica","bold");doc.setFontSize(11);doc.text(`Campo: ${venue}`,14,39);doc.text(`Convocados: ${rows.length}`,145,39);
    const body=rows.map(({item,player})=>["",playerName(player.id),item.participation_status]);
    doc.autoTable({
      startY:45,
      head:[["Foto","Jugador","Situación"]],
      body,
      theme:"grid",
      styles:{font:"helvetica",fontSize:10,cellPadding:3.2,minCellHeight:16,valign:"middle",textColor:[24,34,48],lineColor:[221,230,239]},
      headStyles:{fillColor:[11,79,149],textColor:[255,255,255],fontStyle:"bold"},
      columnStyles:{0:{cellWidth:20},1:{cellWidth:105},2:{cellWidth:45}},
      didDrawCell:data=>{
        if(data.section!=="body"||data.column.index!==0)return;
        const record=rows[data.row.index];if(!record)return;
        const img=photoData.get(String(record.player.id));
        if(img){
          try{const fmt=img.startsWith("data:image/png")?"PNG":"JPEG";doc.addImage(img,fmt,data.cell.x+3,data.cell.y+2,12,12,undefined,"FAST")}catch(_){}
        }else{
          const initials=`${String(record.player.name||"?").charAt(0)}${String(record.player.surname||"?").charAt(0)}`.toUpperCase();
          doc.setFillColor(232,245,255);doc.circle(data.cell.x+9,data.cell.y+8,6,"F");doc.setTextColor(11,79,149);doc.setFont("helvetica","bold");doc.setFontSize(8);doc.text(initials,data.cell.x+9,data.cell.y+9.2,{align:"center"});
        }
      },
      didDrawPage:()=>{
        const h=doc.internal.pageSize.getHeight();doc.setFont("helvetica","normal");doc.setFontSize(8);doc.setTextColor(117,129,149);doc.text(`Generado ${new Date().toLocaleString("es-ES")}`,14,h-8);doc.text(`Página ${doc.internal.getNumberOfPages()}`,pageWidth-14,h-8,{align:"right"});
      }
    });
    doc.save(`convocatoria_${fileSafe(teamLabel)}_${date}.pdf`);
    notify("Convocatoria descargada en PDF");
  }

  async function saveMatch(event){
    event.preventDefault();
    if(historical())return notify("La temporada histórica es de solo lectura");
    const form=event.currentTarget;
    const submit=form.querySelector('button[type="submit"]');
    const original=submit.textContent;
    submit.disabled=true;submit.textContent="Guardando...";
    try{
      const payload={
        id:form.elements.id.value||null,
        team_id:form.elements.team_id.value,
        match_date:form.elements.match_date.value,
        match_time:form.elements.match_time.value||null,
        opponent:form.elements.opponent.value.trim(),
        competition:form.elements.competition.value.trim()||null,
        venue:form.elements.venue.value.trim()||null,
        home_away:form.elements.home_away.value,
        goals_for:form.elements.goals_for.value===""?null:number(form.elements.goals_for.value),
        goals_against:form.elements.goals_against.value===""?null:number(form.elements.goals_against.value),
        notes:form.elements.notes.value.trim()||null
      };
      const playerStats=collectMatchStats();
      let data,error;
      ({data,error}=await rpcV1033("sports_save_match",{p_payload:payload,p_player_stats:playerStats}));
      if(error&&missingRpcV1033(error)){
        ({data,error}=await sb.rpc("sports_save_match",{p_token:token(),p_payload:payload,p_player_stats:playerStats}));
      }
      if(error)throw error;
      const result=recordResult(data);
      if(result?.error_message)throw new Error(result.error_message);
      $("sportsMatchDialog").close();
      notify("Partido y estadísticas guardados");
      await load();
    }catch(error){rpcError(error,"Partido")}
    finally{submit.disabled=false;submit.textContent=original}
  }

  async function deleteMatch(id){
    if(historical())return notify("La temporada histórica es de solo lectura");
    if(!confirm("¿Eliminar este partido, sus minutos y sus tarjetas?"))return;
    try{
      let data,error;
      ({data,error}=await rpcV1033("sports_delete_match",{p_id:id}));
      if(error&&missingRpcV1033(error)){
        ({data,error}=await sb.rpc("sports_delete_match",{p_token:token(),p_id:id}));
      }
      if(error)throw error;
      const result=recordResult(data);
      if(result?.error_message)throw new Error(result.error_message);
      notify("Partido eliminado");await load();
    }catch(error){rpcError(error,"Partido")}
  }

  function statsFilters(){
    return {
      teamId:$("sportsStatsTeamFilter")?.value||"",
      playerId:$("sportsStatsPlayerFilter")?.value||"",
      from:$("sportsStatsFrom")?.value||"",
      to:$("sportsStatsTo")?.value||""
    };
  }
  function inRange(date,from,to){return (!from||date>=from)&&(!to||date<=to)}
  function renderStatsPlayerOptions(){
    const select=$("sportsStatsPlayerFilter");if(!select)return;
    const teamId=$("sportsStatsTeamFilter")?.value||"";
    const selected=select.value;
    const list=teamId?playersForTeam(teamId):(Array.isArray(players)?players.filter(p=>!p.deleted_at):[]);
    select.innerHTML='<option value="">Todos los jugadores</option>'+list.sort((a,b)=>(window.cdsbAlphaCompare||((x,y)=>x.localeCompare(y,"es")))(playerName(a.id),playerName(b.id))).map(p=>`<option value="${safe(p.id)}">${safe(playerName(p.id))}</option>`).join("");
    if(list.some(p=>String(p.id)===String(selected)))select.value=selected;
  }
  function buildPlayerStats(){
    const filter=statsFilters();
    const relevantTrainings=trainings.filter(x=>(!filter.teamId||String(x.team_id)===String(filter.teamId))&&inRange(x.session_date,filter.from,filter.to));
    const trainingIds=new Set(relevantTrainings.map(x=>String(x.id)));
    const relevantMatches=matches.filter(x=>(!filter.teamId||String(x.team_id)===String(filter.teamId))&&inRange(x.match_date,filter.from,filter.to));
    const matchIds=new Set(relevantMatches.map(x=>String(x.id)));
    const playerList=(Array.isArray(players)?players:[]).filter(p=>!p.deleted_at&&(!filter.teamId||lower(p.team)===lower(teamName(filter.teamId)))&&(!filter.playerId||String(p.id)===String(filter.playerId)));
    return playerList.map(player=>{
      const ta=trainingAttendance.filter(a=>String(a.player_id)===String(player.id)&&trainingIds.has(String(a.session_id)));
      const ms=matchStats.filter(a=>String(a.player_id)===String(player.id)&&matchIds.has(String(a.match_id)));
      const attended=ta.filter(a=>a.status==="Presente"||a.status==="Tarde").length;
      const trainingsTotal=ta.length;
      return {
        player,
        trainings:trainingsTotal,
        attended,
        absent:ta.filter(a=>a.status==="Ausente").length,
        justified:ta.filter(a=>a.status==="Justificada").length,
        injuredTraining:ta.filter(a=>a.status==="Lesionado").length,
        late:ta.filter(a=>a.status==="Tarde").length,
        rate:trainingsTotal?Math.round(attended*100/trainingsTotal):0,
        called:ms.filter(x=>!["No convocado","Ausente","Lesionado"].includes(x.participation_status)).length,
        played:ms.filter(x=>number(x.minutes)>0).length,
        starter:ms.filter(x=>x.participation_status==="Titular").length,
        substitute:ms.filter(x=>x.participation_status==="Suplente").length,
        minutes:ms.reduce((sum,x)=>sum+number(x.minutes),0),
        yellow:ms.reduce((sum,x)=>sum+number(x.yellow_cards),0),
        red:ms.reduce((sum,x)=>sum+number(x.red_cards),0)
      };
    }).sort((a,b)=>(window.cdsbAlphaCompare||((x,y)=>x.localeCompare(y,"es",{sensitivity:"base"})))(playerName(a.player.id),playerName(b.player.id)));
  }

  function renderStats(){
    const data=buildPlayerStats();
    const tbody=$("sportsStatsBody");
    const totalMinutes=data.reduce((s,x)=>s+x.minutes,0);
    const avgRate=data.length?Math.round(data.reduce((s,x)=>s+x.rate,0)/data.length):0;
    if($("sportsStatsPlayers"))$("sportsStatsPlayers").textContent=String(data.length);
    if($("sportsStatsAttendance"))$("sportsStatsAttendance").textContent=`${avgRate}%`;
    if($("sportsStatsMinutes"))$("sportsStatsMinutes").textContent=String(totalMinutes);
    if($("sportsStatsCards"))$("sportsStatsCards").textContent=String(data.reduce((s,x)=>s+x.yellow+x.red,0));
    if(!tbody)return;
    tbody.innerHTML=data.length?data.map(row=>`<tr>
      <td><strong>${safe(playerName(row.player.id))}</strong><small>${safe(row.player.team||"")}</small></td>
      <td>${row.trainings}</td><td>${row.attended}</td><td>${row.absent}</td><td>${row.justified}</td><td>${row.late}</td><td><strong>${row.rate}%</strong></td>
      <td>${row.called}</td><td>${row.played}</td><td>${row.starter}</td><td>${row.substitute}</td><td><strong>${row.minutes}</strong></td>
      <td><span class="sports-card yellow">${row.yellow}</span></td><td><span class="sports-card red">${row.red}</span></td>
    </tr>`).join(""):'<tr><td colspan="14" class="sports-empty">No hay datos deportivos con estos filtros.</td></tr>';
  }

  function canAccessTeam(teamId){
    if(!technical())return true;
    return String(currentAccess?.team_id||"")===String(teamId||"");
  }
  function teamPanelContainer(){return $(activeTeamPanel.containerId||"teamSportsPanel")}
  function teamTrainings(teamId){
    const month=teamPanelFilters.attendanceMonth||currentMonth();
    return trainings.filter(item=>String(item.team_id)===String(teamId)&&(!month||String(item.session_date||"").startsWith(month)))
      .sort((a,b)=>`${b.session_date||""} ${b.session_time||""}`.localeCompare(`${a.session_date||""} ${a.session_time||""}`));
  }
  function teamMatches(teamId){
    const month=teamPanelFilters.matchesMonth||"";
    const search=lower(teamPanelFilters.matchSearch);
    return allMatchesV1034().filter(item=>String(item.team_id)===String(teamId)&&(!month||String(item.match_date||"").startsWith(month))&&(!search||lower(`${item.opponent} ${item.competition} ${item.venue}`).includes(search)))
      .sort((a,b)=>`${b.match_date||""} ${b.match_time||""}`.localeCompare(`${a.match_date||""} ${a.match_time||""}`));
  }
  function teamStats(teamId){
    const from=teamPanelFilters.statsFrom||"",to=teamPanelFilters.statsTo||"";
    const relevantTrainings=trainings.filter(x=>String(x.team_id)===String(teamId)&&inRange(x.session_date,from,to));
    const trainingIds=new Set(relevantTrainings.map(x=>String(x.id)));
    const relevantMatches=matches.filter(x=>String(x.team_id)===String(teamId)&&inRange(x.match_date,from,to));
    const matchIds=new Set(relevantMatches.map(x=>String(x.id)));
    return playersForTeam(teamId).map(player=>{
      const ta=trainingAttendance.filter(a=>String(a.player_id)===String(player.id)&&trainingIds.has(String(a.session_id)));
      const ms=matchStats.filter(a=>String(a.player_id)===String(player.id)&&matchIds.has(String(a.match_id)));
      const attended=ta.filter(a=>a.status==="Presente"||a.status==="Tarde").length;
      const total=ta.length;
      return {player,trainings:total,attended,absent:ta.filter(a=>a.status==="Ausente").length,justified:ta.filter(a=>a.status==="Justificada").length,injured:ta.filter(a=>a.status==="Lesionado").length,late:ta.filter(a=>a.status==="Tarde").length,rate:total?Math.round(attended*100/total):0,called:ms.filter(x=>!["No convocado","Ausente","Lesionado"].includes(x.participation_status)).length,notCalled:ms.filter(x=>x.participation_status==="No convocado").length,played:ms.filter(x=>number(x.minutes)>0).length,starter:ms.filter(x=>x.participation_status==="Titular").length,substitute:ms.filter(x=>x.participation_status==="Suplente").length,matchAbsent:ms.filter(x=>x.participation_status==="Ausente").length,matchInjured:ms.filter(x=>x.participation_status==="Lesionado").length,minutes:ms.reduce((sum,x)=>sum+number(x.minutes),0),yellow:ms.reduce((sum,x)=>sum+number(x.yellow_cards),0),red:ms.reduce((sum,x)=>sum+number(x.red_cards),0)};
    });
  }
  function teamPanelHeader(title,description,action=""){
    return `<div class="team-sports-head"><div><small>SEGUIMIENTO DEPORTIVO</small><h3>${safe(title)}</h3><p>${safe(description)}</p></div>${action}</div>`;
  }
  function renderTeamAttendance(teamId,container){
    const list=teamTrainings(teamId);
    const ids=new Set(list.map(x=>String(x.id)));
    const rows=trainingAttendance.filter(x=>ids.has(String(x.session_id)));
    const attended=rows.filter(x=>x.status==="Presente"||x.status==="Tarde").length;
    const rate=rows.length?Math.round(attended*100/rows.length):0;
    container.innerHTML=`${teamPanelHeader("Asistencia a entrenamientos","Crea cada sesión y marca la situación de todos los jugadores.",`<button type="button" class="primary" data-sports-action="true" onclick="sportsV2703.newTrainingForTeam('${safe(teamId)}')">+ Nuevo entrenamiento</button>`)}
      <div class="team-sports-toolbar"><label>Mes<input type="month" value="${safe(teamPanelFilters.attendanceMonth||currentMonth())}" onchange="sportsV2703.setTeamFilter('attendanceMonth',this.value)"></label></div>
      <div class="sports-kpis team-sports-kpis"><article><small>Entrenamientos</small><strong>${list.length}</strong><span>Sesiones del mes</span></article><article><small>Asistencia media</small><strong>${rate}%</strong><span>Presentes y retrasos</span></article><article><small>Ausencias</small><strong>${rows.filter(x=>x.status==="Ausente").length}</strong><span>Sin justificar</span></article><article><small>Justificadas</small><strong>${rows.filter(x=>x.status==="Justificada").length}</strong><span>Total del periodo</span></article></div>
      <div class="table-wrap"><table class="sports-table team-sports-table"><thead><tr><th>Fecha</th><th>Sesión</th><th>Asisten</th><th>Ausentes</th><th>Justificadas</th><th>Lesionados</th><th></th></tr></thead><tbody>${list.length?list.map(item=>{const c=attendanceCounts(item.id),total=Object.values(c).reduce((a,b)=>a+b,0);return `<tr><td><strong>${safe(dateLabel(item.session_date))}</strong><small>${safe(timeLabel(item.session_time))}</small></td><td><strong>${safe(item.title||"Entrenamiento")}</strong><small>${safe(item.session_type||"Entrenamiento")}</small></td><td><span class="sports-pill present">${c.Presente+c.Tarde}/${total||0}</span></td><td><span class="sports-pill absent">${c.Ausente}</span></td><td><span class="sports-pill justified">${c.Justificada}</span></td><td>${c.Lesionado}</td><td class="sports-actions"><button type="button" data-sports-action="true" onclick="sportsV2703.editTraining('${safe(item.id)}','${safe(teamId)}')">✏️ Asistencia</button><button type="button" data-sports-action="true" class="danger" onclick="sportsV2703.deleteTraining('${safe(item.id)}')">Eliminar</button></td></tr>`}).join(""):'<tr><td colspan="7" class="sports-empty">No hay entrenamientos registrados en este mes.</td></tr>'}</tbody></table></div>`;
  }
  function renderTeamMatches(teamId,container){
    const list=teamMatches(teamId),summaries=list.map(x=>matchSummary(x.id));
    container.innerHTML=`${teamPanelHeader("Partidos, minutos y tarjetas","Registra convocatoria, titularidad, minutos jugados y sanciones de la plantilla.",`<button type="button" class="primary" data-sports-action="true" onclick="sportsV2703.newMatchForTeam('${safe(teamId)}')">+ Nuevo partido</button>`)}
      <div class="team-sports-toolbar"><label>Mes (opcional)<input type="month" value="${safe(teamPanelFilters.matchesMonth||"")}" onchange="sportsV2703.setTeamFilter('matchesMonth',this.value)"></label><label class="grow">Buscar<input value="${safe(teamPanelFilters.matchSearch)}" placeholder="Rival, competición o campo" oninput="sportsV2703.setTeamFilter('matchSearch',this.value)"></label></div>
      <div class="sports-kpis team-sports-kpis"><article><small>Partidos</small><strong>${list.length}</strong><span>Encuentros del mes</span></article><article><small>Minutos</small><strong>${summaries.reduce((s,x)=>s+x.minutes,0)}</strong><span>Tiempo de los partidos</span></article><article><small>Amarillas</small><strong>${summaries.reduce((s,x)=>s+x.yellow,0)}</strong><span>Tarjetas registradas</span></article><article><small>Rojas</small><strong>${summaries.reduce((s,x)=>s+x.red,0)}</strong><span>Tarjetas registradas</span></article></div>
      <div class="table-wrap"><table class="sports-table team-sports-table"><thead><tr><th>Fecha</th><th>Rival</th><th>Competición</th><th>Resultado</th><th>Jugadores</th><th>Minutos</th><th>Tarjetas</th><th></th></tr></thead><tbody>${list.length?list.map(item=>{const sum=matchSummary(item.id);return `<tr><td><strong>${safe(dateLabel(item.match_date))}</strong><small>${safe(timeLabel(item.match_time))}</small></td><td><strong>${safe(item.opponent)}</strong><small>${safe(item.home_away||"Local")} · ${safe(item.venue||"Sin campo")}</small></td><td>${safe(item.competition||"—")}</td><td><span class="sports-result">${safe(resultLabel(item))}</span></td><td>${sum.played}<small>${sum.called} convocados</small></td><td><strong>${sum.minutes}</strong></td><td><span class="sports-card yellow">${sum.yellow}</span> <span class="sports-card red">${sum.red}</span></td><td class="sports-actions"><button type="button" data-sports-action="true" onclick="sportsV2703.editMatch('${safe(item.id)}','${safe(teamId)}')">⚽ Datos</button><button type="button" data-sports-action="true" class="danger" onclick="sportsV2703.deleteMatch('${safe(item.id)}')">Eliminar</button></td></tr>`}).join(""):'<tr><td colspan="8" class="sports-empty">No hay partidos registrados en este mes.</td></tr>'}</tbody></table></div>`;
  }
  function renderTeamStats(teamId,container){
    const data=teamStats(teamId),minutes=data.reduce((s,x)=>s+x.minutes,0),rate=data.length?Math.round(data.reduce((s,x)=>s+x.rate,0)/data.length):0,cards=data.reduce((s,x)=>s+x.yellow+x.red,0);
    container.innerHTML=`${teamPanelHeader("Estadísticas del equipo","Todos los datos de asistencia, convocatorias, partidos, minutos y tarjetas.",`<div class="team-sports-head-actions"><button type="button" class="secondary" data-sports-action="true" onclick="sportsV2703.exportTeamStats('${safe(teamId)}')">Exportar CSV</button><button type="button" class="primary" data-sports-action="true" onclick="sportsV2703.printTeamStats('${safe(teamId)}')">Imprimir</button></div>`)}
      <div class="team-sports-toolbar"><label>Desde<input type="date" value="${safe(teamPanelFilters.statsFrom)}" onchange="sportsV2703.setTeamFilter('statsFrom',this.value)"></label><label>Hasta<input type="date" value="${safe(teamPanelFilters.statsTo)}" onchange="sportsV2703.setTeamFilter('statsTo',this.value)"></label><button type="button" class="secondary team-sports-clear" data-sports-action="true" onclick="sportsV2703.clearTeamStatsDates()">Limpiar fechas</button></div>
      <div class="sports-kpis team-sports-kpis"><article><small>Jugadores</small><strong>${data.length}</strong><span>Plantilla actual</span></article><article><small>Asistencia media</small><strong>${rate}%</strong><span>Del periodo</span></article><article><small>Minutos</small><strong>${minutes}</strong><span>Total acumulado</span></article><article><small>Tarjetas</small><strong>${cards}</strong><span>Amarillas y rojas</span></article></div>
      <div class="sports-help">Los partidos jugados se contabilizan cuando el jugador tiene minutos superiores a cero.</div>
      <div class="table-wrap"><table class="sports-table sports-stats-table team-sports-table" id="teamSportsStatsTable"><thead><tr><th>Jugador</th><th>Entr.</th><th>Asist.</th><th>Aus.</th><th>Just.</th><th>Les. entr.</th><th>Tarde</th><th>%</th><th>Conv.</th><th>No conv.</th><th>Jug.</th><th>Tit.</th><th>Supl.</th><th>Aus. part.</th><th>Les. part.</th><th>Min.</th><th>🟨</th><th>🟥</th></tr></thead><tbody>${data.length?data.map(row=>`<tr><td><strong>${safe(playerName(row.player.id))}</strong><small>${safe(row.player.team||"")}</small></td><td>${row.trainings}</td><td>${row.attended}</td><td>${row.absent}</td><td>${row.justified}</td><td>${row.injured}</td><td>${row.late}</td><td><strong>${row.rate}%</strong></td><td>${row.called}</td><td>${row.notCalled}</td><td>${row.played}</td><td>${row.starter}</td><td>${row.substitute}</td><td>${row.matchAbsent}</td><td>${row.matchInjured}</td><td><strong>${row.minutes}</strong></td><td><span class="sports-card yellow">${row.yellow}</span></td><td><span class="sports-card red">${row.red}</span></td></tr>`).join(""):'<tr><td colspan="18" class="sports-empty">Todavía no hay datos deportivos para este equipo.</td></tr>'}</tbody></table></div>`;
  }
  function renderActiveTeamPanel(error=null){
    const container=teamPanelContainer();
    if(!container||!activeTeamPanel.teamId)return;
    if(error){container.innerHTML=`<div class="team-sports-error"><strong>No se pudo cargar el seguimiento deportivo.</strong><span>${safe(error?.message||error||"Revisa la instalación SQL de la V27.0.")}</span><button type="button" class="primary" data-sports-action="true" onclick="sportsV2703.load()">Reintentar</button></div>`;return}
    if(!loaded){container.innerHTML='<div class="team-sports-loading"><strong>Cargando seguimiento deportivo...</strong><span>Sincronizando la información del equipo.</span></div>';return}
    if(!canAccessTeam(activeTeamPanel.teamId)){container.innerHTML='<div class="team-sports-error"><strong>Acceso no autorizado.</strong><span>Este usuario solo puede gestionar su equipo asignado.</span></div>';return}
    if(activeTeamPanel.tab==="sportsAttendance")renderTeamAttendance(activeTeamPanel.teamId,container);
    else if(activeTeamPanel.tab==="sportsMatches")renderTeamMatches(activeTeamPanel.teamId,container);
    else if(activeTeamPanel.tab==="sportsStats")renderTeamStats(activeTeamPanel.teamId,container);
  }
  function renderTeamPanel(tab,teamId,containerId="teamSportsPanel"){
    activeTeamPanel={tab,teamId:String(teamId||""),containerId};
    if(!loaded){renderActiveTeamPanel();load();return}
    renderActiveTeamPanel();
    load();
  }
  function setTeamFilter(key,value){
    if(!(key in teamPanelFilters))return;
    teamPanelFilters[key]=value||"";
    renderActiveTeamPanel();
  }
  function clearTeamStatsDates(){teamPanelFilters.statsFrom="";teamPanelFilters.statsTo="";renderActiveTeamPanel()}
  function exportTeamStats(teamId){
    const rows=teamStats(teamId),team=teamById(teamId);
    const header=["Jugador","Equipo","Entrenamientos","Asistencias","Ausencias","Justificadas","Lesionado entrenamiento","Tardanzas","Asistencia %","Convocatorias","No convocado","Partidos jugados","Titularidades","Suplencias","Ausente partido","Lesionado partido","Minutos","Amarillas","Rojas"];
    const csv=[header,...rows.map(r=>[playerName(r.player.id),team?.name||"",r.trainings,r.attended,r.absent,r.justified,r.injured,r.late,r.rate,r.called,r.notCalled,r.played,r.starter,r.substitute,r.matchAbsent,r.matchInjured,r.minutes,r.yellow,r.red])].map(row=>row.map(value=>`"${String(value??"").replace(/"/g,'""')}"`).join(";")).join("\n");
    const blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`estadisticas_${String(team?.name||"equipo").replace(/[^a-z0-9]+/gi,"_")}_${today()}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }
  function printTeamStats(teamId){
    const table=$("teamSportsStatsTable"),team=teamById(teamId);if(!table)return;
    const w=window.open("","_blank");if(!w)return notify("El navegador ha bloqueado la ventana de impresión");
    w.document.write(`<html><head><title>Estadísticas ${safe(team?.name||"")}</title><style>body{font-family:Arial;padding:25px;color:#102a43}h1{color:#0b4da2;margin-bottom:4px}p{color:#667}table{border-collapse:collapse;width:100%;font-size:10px}th,td{border:1px solid #ccd6e0;padding:6px;text-align:left}th{background:#eaf2fb}small{display:block;color:#667}</style></head><body><h1>${safe(window.multiclubClubName?.()||"Club")} · ${safe(team?.name||"Equipo")}</h1><p>Estadísticas deportivas · ${new Date().toLocaleString("es-ES")}</p>${table.outerHTML}</body></html>`);w.document.close();w.focus();w.print();
  }

  function render(){
    if(!loaded)return;
    renderTrainings();renderMatches();renderStats();
  }

  function exportStats(){
    const rows=buildPlayerStats();
    const header=["Jugador","Equipo","Entrenamientos","Asistencias","Ausencias","Justificadas","Tardanzas","Asistencia %","Convocatorias","Partidos jugados","Titularidades","Suplencias","Minutos","Amarillas","Rojas"];
    const csv=[header,...rows.map(r=>[playerName(r.player.id),r.player.team||"",r.trainings,r.attended,r.absent,r.justified,r.late,r.rate,r.called,r.played,r.starter,r.substitute,r.minutes,r.yellow,r.red])]
      .map(row=>row.map(value=>`"${String(value??"").replace(/"/g,'""')}"`).join(";"))
      .join("\n");
    const blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`estadisticas_deportivas_${today()}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }
  function printStats(){
    const table=$("sportsStatsTable");if(!table)return;
    const w=window.open("","_blank");if(!w)return notify("El navegador ha bloqueado la ventana de impresión");
    w.document.write(`<html><head><title>Estadísticas deportivas</title><style>body{font-family:Arial;padding:25px;color:#102a43}h1{color:#0b4da2}table{border-collapse:collapse;width:100%;font-size:11px}th,td{border:1px solid #ccd6e0;padding:6px;text-align:left}th{background:#eaf2fb}small{display:block;color:#667}</style></head><body><h1>${safe(window.multiclubClubName?.()||"Club")} · Estadísticas deportivas</h1><p>Generado el ${new Date().toLocaleString("es-ES")}</p>${table.outerHTML}</body></html>`);
    w.document.close();w.focus();w.print();
  }

  function bind(){
    $("sportsAddTraining")?.addEventListener("click",()=>openTraining());
    $("sportsAddMatch")?.addEventListener("click",()=>openMatch());
    $("sportsTrainingForm")?.addEventListener("submit",saveTraining);
    $("sportsMatchForm")?.addEventListener("submit",saveMatch);
    $("sportsCallupPdf")?.addEventListener("click",downloadCallupPdf);
    $("sportsTrainingTeamFilter")?.addEventListener("change",renderTrainings);
    $("sportsTrainingMonth")?.addEventListener("change",renderTrainings);
    $("sportsMatchTeamFilter")?.addEventListener("change",renderMatches);
    $("sportsMatchMonth")?.addEventListener("change",renderMatches);
    $("sportsMatchSearch")?.addEventListener("input",renderMatches);
    $("sportsStatsTeamFilter")?.addEventListener("change",()=>{renderStatsPlayerOptions();renderStats()});
    $("sportsStatsPlayerFilter")?.addEventListener("change",renderStats);
    $("sportsStatsFrom")?.addEventListener("change",renderStats);
    $("sportsStatsTo")?.addEventListener("change",renderStats);
    $("sportsStatsExport")?.addEventListener("click",exportStats);
    $("sportsStatsPrint")?.addEventListener("click",printStats);
    $("sportsTrainingForm")?.elements.team_id?.addEventListener("change",event=>{$("sportsTrainingRoster").innerHTML=trainingRosterHtml(event.target.value,$("sportsTrainingForm").elements.id.value)});
    $("sportsMatchForm")?.elements.team_id?.addEventListener("change",event=>{$("sportsMatchRoster").innerHTML=matchRosterHtml(event.target.value,$("sportsMatchForm").elements.id.value)});

    $("sportsTrainingRoster")?.addEventListener("click",event=>{
      const button=event.target.closest("[data-mark-training]");if(!button)return;
      document.querySelectorAll("#sportsTrainingRoster [data-training-status]").forEach(select=>select.value=button.dataset.markTraining);
    });
    $("sportsMatchRoster")?.addEventListener("click",event=>{
      const button=event.target.closest("[data-mark-match]");if(!button)return;
      document.querySelectorAll("#sportsMatchRoster .sports-match-player").forEach(row=>{
        const select=row.querySelector("[data-match-status]");select.value=button.dataset.markMatch;
        const input=row.querySelector("[data-match-minutes]");input.value="0";input.disabled=["No convocado","Ausente","Lesionado"].includes(select.value);
      });
    });
    $("sportsMatchRoster")?.addEventListener("change",event=>{
      const select=event.target.closest("[data-match-status]");if(!select)return;
      const row=select.closest(".sports-match-player");const input=row.querySelector("[data-match-minutes]");
      const disabled=["No convocado","Ausente","Lesionado"].includes(select.value);
      input.disabled=disabled;if(disabled)input.value="0";
    });
    document.addEventListener("click",event=>{
      const nav=event.target.closest?.(".nav");
      if(nav&&["sportsAttendance","sportsMatches","sportsStats"].includes(nav.dataset.view))load();
    });
  }

  function exportSnapshot(){
    return JSON.parse(JSON.stringify({trainings,training_attendance:trainingAttendance,matches,match_stats:matchStats}));
  }
  function loadSnapshot(snapshot={}){
    trainings=Array.isArray(snapshot.trainings)?JSON.parse(JSON.stringify(snapshot.trainings)):[];
    trainingAttendance=Array.isArray(snapshot.training_attendance)?JSON.parse(JSON.stringify(snapshot.training_attendance)):[];
    matches=Array.isArray(snapshot.matches)?JSON.parse(JSON.stringify(snapshot.matches)):[];
    matchStats=Array.isArray(snapshot.match_stats)?JSON.parse(JSON.stringify(snapshot.match_stats)):[];
    loaded=true;
    initialiseFilters();render();renderActiveTeamPanel();
    return true;
  }

  window.sportsV2703=window.sportsV2702=window.sportsV2701=window.sportsV2700={
    load,render,renderTeamPanel,setTeamFilter,clearTeamStatsDates,exportTeamStats,printTeamStats,
    newTraining:()=>openTraining(),newTrainingForTeam:teamId=>openTraining("",teamId),editTraining:openTraining,deleteTraining,
    newMatch:()=>openMatch(),newMatchForTeam:teamId=>openMatch("",teamId),editMatch:openMatch,deleteMatch,downloadCallupPdf,
    getData:()=>({trainings,trainingAttendance,matches,matchStats}),exportSnapshot,loadSnapshot
  };

  bind();
})();
