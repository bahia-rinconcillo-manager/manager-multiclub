import fs from "node:fs";
function read(p){return fs.readFileSync(p,"utf8")}
function ok(v,m){if(!v){console.error("FAIL:",m);process.exitCode=1}}
const app=read("app-multiclub-v1032.js");
const ui=read("multiclub-v1032-modernization.js");
const index=read("index.html");
const sw=read("service-worker.js");
ok(app.includes('MULTICLUB_BUILD_VERSION="V1.0.32"'),"build 1.0.32");
ok(app.includes("REALTIME_TABLES_V1032"),"realtime selectivo");
ok(app.includes('filter:`club_id=eq.${clubId}`'),"realtime filtrado por club");
ok(app.includes("scheduleRealtimeFlushV1032"),"realtime agrupado");
ok(app.includes("ensureSportsLoadedV1032"),"deportes bajo demanda");
ok(!app.includes('await loadAll();await window.sportsV2700?.load?.();'),"sin recarga deportiva global antigua");
ok(ui.includes("multiclub-doc-pending"),"documentación pendiente roja");
ok(ui.includes("teamDetailHorizontalRangeV1032"),"scroll premium de ficha");
ok(ui.includes("multiclubFixedHorizontalV1032"),"scroll fijo global");
ok(index.includes('content="1.0.32"'),"index versionado");
ok(index.includes("app-multiclub-v1032.js?v=1032"),"index carga núcleo 1032");
ok(index.includes("multiclub-v1032-modernization.js?v=1032"),"index carga modernización");
ok(sw.includes('APP_CACHE = "manager-multiclub-app-v1-0-32"'),"cache 1032");
ok(sw.includes("Promise.allSettled"),"precarga resiliente");
for(const forbidden of ["delete from public.players","truncate table","drop table"]){
  ok(!ui.toLowerCase().includes(forbidden),"UI no contiene operación destructiva "+forbidden);
}
if(!process.exitCode)console.log("Manager Multiclub V1.0.32: regresión frontend OK.");
