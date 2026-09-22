/* Manager Multiclub · V1.0.32 · mejoras de interfaz V28.5 adaptadas a multiclub */
(() => {
  "use strict";
  const VERSION="1.0.32";
  const RED="#c62828";
  let scheduled=false,fixedTarget=null,teamTarget=null,syncingFixed=false,syncingTeam=false;

  const style=document.createElement("style");
  style.textContent=`
    .multiclub-doc-pending{color:${RED}!important;font-weight:800!important}
    #teamDetailHorizontalDockV1032{display:none;flex:0 0 auto;width:100%;box-sizing:border-box;padding:7px 16px 6px;background:linear-gradient(180deg,#f8fbfd,#eef5f9);border-top:1px solid #d6e2ea;border-bottom:1px solid #dce7ee;z-index:120}
    #teamDetailHorizontalDockV1032.active{display:block}
    #teamDetailHorizontalRangeV1032{display:block;width:100%;height:16px;margin:0;border:0;background:transparent;appearance:none;-webkit-appearance:none;cursor:ew-resize;outline:none}
    #teamDetailHorizontalRangeV1032::-webkit-slider-runnable-track{height:7px;border-radius:999px;background:linear-gradient(90deg,#d7e5ee,#c7dce8);box-shadow:inset 0 1px 2px rgba(18,55,79,.16)}
    #teamDetailHorizontalRangeV1032::-webkit-slider-thumb{width:82px;height:13px;margin-top:-3px;border:1px solid #1b5f88;border-radius:999px;background:linear-gradient(180deg,#2e83b4,#1e658f);box-shadow:0 1px 4px rgba(18,55,79,.28);appearance:none;-webkit-appearance:none}
    #teamDetailHorizontalRangeV1032::-moz-range-track{height:7px;border:0;border-radius:999px;background:#c7dce8}
    #teamDetailHorizontalRangeV1032::-moz-range-thumb{width:82px;height:13px;border:1px solid #1b5f88;border-radius:999px;background:#1e658f}
    #multiclubFixedHorizontalV1032{position:fixed;left:0;bottom:0;z-index:2147483000;display:none;height:22px;box-sizing:border-box;overflow-x:scroll;overflow-y:hidden;background:#eef5fa;border:1px solid #b8ccd9;border-bottom:0;border-radius:8px 8px 0 0;box-shadow:0 -3px 12px rgba(7,31,51,.18);scrollbar-width:auto}
    #multiclubFixedHorizontalV1032::-webkit-scrollbar{height:16px}
    #multiclubFixedHorizontalV1032::-webkit-scrollbar-track{background:#d8e5ed}
    #multiclubFixedHorizontalV1032::-webkit-scrollbar-thumb{background:#3f718f;border-radius:999px;border:2px solid #d8e5ed}
    #multiclubFixedHorizontalV1032>div{height:1px;pointer-events:none}
    [data-multiclub-scroll-host="1"]{max-width:100%!important;overflow-x:auto!important;-webkit-overflow-scrolling:touch!important}
    @media(max-width:900px){#teamDetailHorizontalDockV1032{padding:8px 12px 7px}#teamDetailHorizontalRangeV1032::-webkit-slider-thumb{width:62px}#teamDetailHorizontalRangeV1032::-moz-range-thumb{width:62px}#multiclubFixedHorizontalV1032{height:24px}}
  `;
  document.head.appendChild(style);

  const fixed=document.createElement("div");
  fixed.id="multiclubFixedHorizontalV1032";
  fixed.setAttribute("aria-label","Desplazamiento horizontal del listado");
  fixed.innerHTML="<div></div>";
  const fixedSpacer=fixed.firstElementChild;

  function normalizeText(v){return String(v??"").trim().toLocaleLowerCase("es-ES")}
  function markPending(root=document){
    const selectors=[
      "#documentsBody .badge","#documentsBody td",
      "#teamDetailContent .document-status-cell .badge",
      "#teamDetailContent [data-document-status]",
      "#teamReportBody td"
    ];
    root.querySelectorAll?.(selectors.join(",")).forEach(el=>{
      const text=normalizeText(el.textContent);
      const pending=text==="pendiente"||text==="incompleta"||text==="incompleto";
      el.classList.toggle("multiclub-doc-pending",pending);
    });
  }
  function ensureFixed(){if(!fixed.isConnected&&document.body)document.body.appendChild(fixed)}
  function ensureTeamDock(){
    const dialog=document.getElementById("teamDetailDialog");
    const content=document.getElementById("teamDetailContent");
    if(!dialog||!content)return null;
    let dock=document.getElementById("teamDetailHorizontalDockV1032");
    if(!dock){
      dock=document.createElement("div");
      dock.id="teamDetailHorizontalDockV1032";
      dock.innerHTML='<input id="teamDetailHorizontalRangeV1032" type="range" min="0" max="1000" value="0" step="1" aria-label="Desplazamiento horizontal de la tabla">';
      const actions=dialog.querySelector(".modal-actions");
      if(actions)actions.before(dock); else content.after(dock);
      dock.querySelector("input").addEventListener("input",event=>{
        if(!teamTarget)return;
        const max=Math.max(0,teamTarget.scrollWidth-teamTarget.clientWidth);
        teamTarget.scrollLeft=max*(Number(event.target.value)||0)/1000;
      });
    }
    return dock;
  }
  function visible(el){
    if(!el||!el.isConnected)return false;
    const r=el.getBoundingClientRect();
    if(r.width<40||r.height<4||r.bottom<=0||r.top>=innerHeight)return false;
    const cs=getComputedStyle(el);
    return cs.display!=="none"&&cs.visibility!=="hidden"&&Number(cs.opacity||1)!==0;
  }
  function sourceHost(el){
    if(!el||!visible(el))return null;
    if(el.tagName==="TABLE"){
      const host=el.closest(".table-wrap,.players-table-wrap,.sports-table-wrap,.table-responsive,[class*='table-wrap'],[class*='table-scroll']")||el.parentElement;
      if(host&&(el.scrollWidth>host.clientWidth+3||host.scrollWidth>host.clientWidth+3))host.dataset.multiclubScrollHost="1";
      el=host;
    }
    if(!el)return null;
    const table=el.querySelector?.("table");
    if(table&&table.scrollWidth>el.clientWidth+3)el.dataset.multiclubScrollHost="1";
    return el.scrollWidth>el.clientWidth+3?el:null;
  }
  const SELECTOR=".table-wrap,.players-table-wrap,.players-professional-table,.team-sizes-table,.team-card-thumbs,.kits-detail-table,.staff-sizing-report-table,.pitch-table-wrap,.season-wizard-table-wrap,.sports-table-wrap,.table-responsive,[class*='table-wrap'],[class*='table-scroll'],[data-horizontal-scroll],table";
  function pick(scope){
    if(!scope)return null;
    const seen=new Set(),list=[];
    scope.querySelectorAll(SELECTOR).forEach(raw=>{
      const host=sourceHost(raw);
      if(!host||seen.has(host)||!visible(host))return;
      seen.add(host);list.push(host);
    });
    list.sort((a,b)=>{
      const ra=a.getBoundingClientRect(),rb=b.getBoundingClientRect();
      const sa=Math.max(0,Math.min(innerHeight,ra.bottom)-Math.max(0,ra.top))*Math.min(innerWidth,ra.width);
      const sb=Math.max(0,Math.min(innerHeight,rb.bottom)-Math.max(0,rb.top))*Math.min(innerWidth,rb.width);
      return sb-sa;
    });
    return list[0]||null;
  }
  function updateTeam(){
    const dialog=document.getElementById("teamDetailDialog"),content=document.getElementById("teamDetailContent"),dock=ensureTeamDock();
    if(!dialog?.open||!content||!dock){teamTarget=null;dock?.classList.remove("active");return false}
    teamTarget=pick(content);
    if(!teamTarget){dock.classList.remove("active");return false}
    dock.classList.add("active");
    const range=dock.querySelector("input");
    const max=Math.max(0,teamTarget.scrollWidth-teamTarget.clientWidth);
    range.value=max?String(Math.round(teamTarget.scrollLeft*1000/max)):"0";
    return true;
  }
  function updateFixed(skipTeam){
    ensureFixed();
    if(skipTeam){fixedTarget=null;fixed.style.display="none";return}
    const dialogs=[...document.querySelectorAll("dialog[open]")].filter(visible);
    const scope=dialogs.at(-1)||document.querySelector("#app .view.active")||document.querySelector("#app main")||document.body;
    fixedTarget=pick(scope);
    if(!fixedTarget){fixed.style.display="none";return}
    const r=fixedTarget.getBoundingClientRect(),left=Math.max(0,r.left),right=Math.min(innerWidth,r.right),width=Math.max(0,right-left);
    if(width<80){fixed.style.display="none";return}
    fixed.style.left=Math.round(left)+"px";fixed.style.width=Math.round(width)+"px";
    fixedSpacer.style.width=Math.max(fixedTarget.scrollWidth,width+1)+"px";fixed.style.display="block";
    if(!syncingFixed&&Math.abs(fixed.scrollLeft-fixedTarget.scrollLeft)>1){
      syncingFixed=true;fixed.scrollLeft=fixedTarget.scrollLeft;requestAnimationFrame(()=>syncingFixed=false);
    }
  }
  function update(){scheduled=false;markPending(document);const team=updateTeam();updateFixed(team)}
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(update)}

  fixed.addEventListener("scroll",()=>{
    if(!fixedTarget||syncingFixed)return;
    syncingFixed=true;fixedTarget.scrollLeft=fixed.scrollLeft;requestAnimationFrame(()=>syncingFixed=false);
  },{passive:true});
  document.addEventListener("scroll",event=>{
    if(teamTarget&&event.target===teamTarget&&!syncingTeam){
      const range=document.getElementById("teamDetailHorizontalRangeV1032");
      const max=Math.max(0,teamTarget.scrollWidth-teamTarget.clientWidth);
      syncingTeam=true;if(range)range.value=max?String(Math.round(teamTarget.scrollLeft*1000/max)):"0";requestAnimationFrame(()=>syncingTeam=false);
    }
    if(fixedTarget&&event.target===fixedTarget&&!syncingFixed){
      syncingFixed=true;fixed.scrollLeft=fixedTarget.scrollLeft;requestAnimationFrame(()=>syncingFixed=false);
    }
    schedule();
  },true);
  for(const evt of ["click","change","input","pointerup","keyup"])document.addEventListener(evt,schedule,true);
  window.addEventListener("resize",schedule,{passive:true});
  window.addEventListener("orientationchange",schedule,{passive:true});
  const observer=new MutationObserver(schedule);
  if(document.body)observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:["class","style","open","hidden"]});
  document.addEventListener("click",event=>{
    if(event.target.closest?.('.nav[data-view="sports"],[data-sports-action="true"]')){
      window.ensureSportsLoadedV1032?.().catch?.(()=>{});
    }
  },true);

  window.MULTICLUB_UI_V1032=Object.freeze({version:VERSION,refresh:schedule});
  ensureFixed();ensureTeamDock();schedule();
})();