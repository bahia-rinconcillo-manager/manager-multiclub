/* Manager Multiclub V1.0.41 · Rivales y escudos sincronizados por club */
(function(){
  "use strict";

  const VERSION="1.0.41";
  const TTL_MS=5*60*1000;
  let syncing=false;
  let queued=false;
  let cloudAvailable=true;
  let remoteReads=0;
  let remoteWrites=0;
  let cacheHits=0;

  function norm(value){
    return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .toLocaleLowerCase("es").replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ");
  }
  function clubId(){
    try{return String(typeof activeClubId==="function"?activeClubId():"").trim()}catch(_){return ""}
  }
  function token(){
    try{return (typeof isTechnicalReadOnly==="function"&&isTechnicalReadOnly()&&typeof getTechnicalSessionToken==="function")
      ? getTechnicalSessionToken():null}catch(_){return null}
  }
  function technical(){try{return typeof isTechnicalReadOnly==="function"&&isTechnicalReadOnly()}catch(_){return false}}
  function ready(){try{return typeof sb!=="undefined"&&!!sb?.rpc&&!!clubId()}catch(_){return false}}
  function stampKey(){return `manager_multiclub_rival_cloud_at_v1041_${clubId()||"sin_club"}`}
  function recent(){
    try{
      const at=Number(localStorage.getItem(stampKey())||0);
      return at>0&&Date.now()-at>=0&&Date.now()-at<TTL_MS;
    }catch(_){return false}
  }
  function markRemote(){try{localStorage.setItem(stampKey(),String(Date.now()))}catch(_){}}
  function invalidate(){try{localStorage.removeItem(stampKey())}catch(_){}}
  function missingRpc(error){
    const text=String(error?.message||error?.details||error?.hint||error||"").toLowerCase();
    return error?.code==="PGRST202"||text.includes("could not find the function")||text.includes("schema cache")||text.includes("does not exist");
  }
  function localSnapshot(){
    try{
      if(typeof loadRivalTeams==="function")loadRivalTeams();
      if(!Array.isArray(rivalTeams)||!rivalTeams.length)return [];
      return rivalTeams.map(item=>({
        id:/^[0-9a-f-]{36}$/i.test(String(item?.cloud_id||""))?item.cloud_id:null,
        name:String(item?.name||"").trim(),
        crest:String(item?.crest||"").trim()||null
      })).filter(item=>item.name);
    }catch(_){return []}
  }
  async function snapshot({force=false}={}){
    if(!ready()||!cloudAvailable)return null;
    if(!force&&recent()){
      const local=localSnapshot();
      if(local.length){cacheHits++;return local}
    }
    remoteReads++;
    const {data,error}=await sb.rpc("rival_teams_snapshot_multiclub_v1041",{
      p_club_id:clubId(),p_token:token()
    });
    if(error){
      if(missingRpc(error)){cloudAvailable=false;return null}
      throw error;
    }
    if(data?.ok===false)throw new Error(data.message||"No se pudieron leer los escudos");
    markRemote();
    return Array.isArray(data?.teams)?data.teams:[];
  }
  async function saveCloud(rival){
    if(!ready()||technical()||!rival?.name||!cloudAvailable)return null;
    remoteWrites++;
    const payload={
      id:/^[0-9a-f-]{36}$/i.test(String(rival.cloud_id||""))?rival.cloud_id:null,
      name:String(rival.name||"").trim(),
      crest:String(rival.crest||"").trim()||null
    };
    const {data,error}=await sb.rpc("rival_team_save_multiclub_v1041",{p_club_id:clubId(),p_payload:payload});
    if(error){
      if(missingRpc(error)){cloudAvailable=false;return null}
      throw error;
    }
    if(data?.ok===false)throw new Error(data.message||"No se pudo guardar el rival");
    invalidate();
    return data?.team||null;
  }
  async function deleteCloud(rival){
    if(!ready()||technical()||!rival||!cloudAvailable)return false;
    remoteWrites++;
    const id=/^[0-9a-f-]{36}$/i.test(String(rival.cloud_id||""))?rival.cloud_id:null;
    const {data,error}=await sb.rpc("rival_team_delete_multiclub_v1041",{
      p_club_id:clubId(),p_id:id,p_name:id?null:String(rival.name||"").trim()
    });
    if(error){
      if(missingRpc(error)){cloudAvailable=false;return false}
      throw error;
    }
    if(data?.ok===false)throw new Error(data.message||"No se pudo eliminar el rival");
    invalidate();
    return true;
  }
  function mergeCloud(cloud){
    if(typeof loadRivalTeams==="function")loadRivalTeams();
    const local=Array.isArray(rivalTeams)?rivalTeams:[];
    const map=new Map(local.map(item=>[norm(item?.name),item]));
    for(const row of cloud||[]){
      const key=norm(row?.name); if(!key)continue;
      const existing=map.get(key);
      if(existing){
        existing.cloud_id=row.id||existing.cloud_id||null;
        if(String(row.crest||"").trim())existing.crest=row.crest;
        if(row.name)existing.name=row.name;
      }else{
        const item={id:`rival_cloud_${String(row.id||Date.now())}`,cloud_id:row.id||null,name:row.name||"Rival",crest:row.crest||""};
        local.push(item);map.set(key,item);
      }
    }
    rivalTeams=local;
    if(typeof saveRivalTeams==="function")saveRivalTeams({silent:true});
  }
  async function uploadMissing(cloud){
    if(technical()||!cloudAvailable)return false;
    const map=new Map((cloud||[]).map(row=>[norm(row?.name),row]));
    let changed=false;
    for(const local of Array.isArray(rivalTeams)?rivalTeams:[]){
      const name=String(local?.name||"").trim();if(!name)continue;
      const remote=map.get(norm(name));
      const localCrest=String(local?.crest||"").trim();
      const remoteCrest=String(remote?.crest||"").trim();
      if(!remote||(!remoteCrest&&localCrest)){
        const saved=await saveCloud({...local,cloud_id:remote?.id||local.cloud_id});
        if(saved){
          local.cloud_id=saved.id||local.cloud_id;
          if(saved.crest)local.crest=saved.crest;
          changed=true;
        }
      }else{
        local.cloud_id=remote.id||local.cloud_id;
        if(remoteCrest)local.crest=remoteCrest;
      }
    }
    if(changed&&typeof saveRivalTeams==="function")saveRivalTeams({silent:true});
    return changed;
  }
  async function applyToMatches(){
    if(!Array.isArray(clubMatches))return 0;
    let changed=0;
    for(const match of clubMatches){
      const rival=Array.isArray(rivalTeams)?rivalTeams.find(item=>norm(item?.name)===norm(match?.opponent)):null;
      const crest=String(rival?.crest||"").trim();
      if(!crest||String(match.opponent_crest||"").trim()===crest)continue;
      match.opponent_crest=crest;changed++;
    }
    if(changed&&typeof saveClubMatches==="function")saveClubMatches();
    return changed;
  }
  function repaint(){
    try{renderRivalTeams?.()}catch(_){}
    try{renderClubMatches?.()}catch(_){}
    try{renderDashboardMatches?.()}catch(_){}
    try{renderCalendar?.()}catch(_){}
    try{
      if(typeof currentTeamDetailId!=="undefined"&&currentTeamDetailId&&document.getElementById("teamDetailDialog")?.open&&typeof renderTeamDetailTab==="function"){
        renderTeamDetailTab(window.currentTeamDetailTab||"calendar");
      }
    }catch(_){}
  }
  async function sync({uploadLocal=true,showToast=false,force=false}={}){
    if(syncing){queued=true;return false}
    if(!ready())return false;
    syncing=true;
    try{
      if(typeof loadRivalTeams==="function")loadRivalTeams();
      let cloud=await snapshot({force});
      if(cloud===null){
        if(showToast&&typeof toast==="function")toast("La sincronización de escudos en nube todavía no está activada en Supabase");
        return false;
      }
      mergeCloud(cloud);
      if(uploadLocal&&!technical()){
        const uploaded=await uploadMissing(cloud);
        if(uploaded){
          cloud=await snapshot({force:true});
          if(cloud)mergeCloud(cloud);
        }
      }
      const updated=await applyToMatches();
      repaint();
      if(showToast&&typeof toast==="function")toast(`Escudos sincronizados${updated?` · ${updated} partido${updated===1?"":"s"} actualizado${updated===1?"":"s"}`:""}`);
      return true;
    }catch(error){
      console.warn("Manager Multiclub V1.0.41 · escudos",error);
      if(showToast&&typeof toast==="function")toast(`No se pudieron sincronizar los escudos: ${error?.message||"error"}`);
      return false;
    }finally{
      syncing=false;
      if(queued){queued=false;setTimeout(()=>sync({uploadLocal:!technical()}),60)}
    }
  }

  if(typeof saveRivalTeamForm==="function"){
    const previousSave=saveRivalTeamForm;
    saveRivalTeamForm=async function(event){
      const form=event?.currentTarget;
      const oldId=form?.elements?.id?.value||"";
      const oldRival=Array.isArray(rivalTeams)?rivalTeams.find(r=>String(r.id)===String(oldId)):null;
      const oldName=String(oldRival?.name||"").trim();
      const requested=String(form?.elements?.name?.value||"").trim();
      await previousSave(event);
      if(technical()||!requested)return;
      try{
        if(oldName&&norm(oldName)!==norm(requested))await deleteCloud(oldRival);
        if(typeof loadRivalTeams==="function")loadRivalTeams();
        const rival=(rivalTeams||[]).find(r=>norm(r?.name)===norm(requested));
        if(rival){
          const saved=await saveCloud(rival);
          if(saved){rival.cloud_id=saved.id||rival.cloud_id;if(saved.crest)rival.crest=saved.crest;saveRivalTeams?.({silent:true})}
        }
        await sync({uploadLocal:false,force:true});
      }catch(error){console.warn("Rival guardado solo localmente",error)}
    };
  }

  document.addEventListener("click",event=>{
    const button=event.target?.closest?.("[data-delete-rival]");
    if(!button)return;
    const id=button.dataset.deleteRival;
    const rival=Array.isArray(rivalTeams)?rivalTeams.find(r=>String(r.id)===String(id)):null;
    if(!rival)return;
    setTimeout(async()=>{
      const exists=Array.isArray(rivalTeams)&&rivalTeams.some(r=>String(r.id)===String(id));
      if(exists)return;
      try{await deleteCloud(rival);await sync({uploadLocal:false,force:true})}catch(error){console.warn("Rival eliminado solo localmente",error)}
    },160);
  },true);

  function addButton(){
    const summary=document.querySelector(".rival-manager-summary");
    if(!summary||summary.querySelector(".sync-rival-crests-v1041"))return;
    const button=document.createElement("button");
    button.type="button";
    button.className="secondary sync-rival-crests-v1041";
    button.textContent="☁ Sincronizar escudos";
    button.addEventListener("click",()=>{invalidate();sync({uploadLocal:!technical(),showToast:true,force:true})});
    summary.appendChild(button);
  }

  document.addEventListener("DOMContentLoaded",()=>{
    addButton();
    setTimeout(()=>sync({uploadLocal:!technical(),force:false}),2200);
    setTimeout(addButton,2600);
  });
  window.addEventListener("focus",()=>{if(!recent())setTimeout(()=>sync({uploadLocal:!technical()}),120)});

  window.MULTICLUB_RIVAL_CLOUD_V1041=Object.freeze({
    version:VERSION,
    active:true,
    sync,
    invalidate,
    metrics:()=>({clubId:clubId(),cloudAvailable,remoteReads,remoteWrites,cacheHits,recent:recent(),syncing})
  });
})();
