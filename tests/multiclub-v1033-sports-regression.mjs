import fs from "node:fs";
function read(p){return fs.readFileSync(p,"utf8")}
function ok(v,m){if(!v){console.error("FAIL:",m);process.exitCode=1}}
const sports=read("sports-v1033-multiclub.js");
const sql=read("EJECUTAR_ACTUALIZACION_MULTICLUB_V1_0_33_DEPORTES.sql");
const app=read("app-multiclub-v1033.js");
const index=read("index.html");
const sw=read("service-worker.js");
ok(app.includes('MULTICLUB_BUILD_VERSION="V1.0.33"'),"build 1.0.33");
ok(sports.includes("sports_snapshot_multiclub_v1033")||sports.includes('rpcV1033("sports_snapshot"'),"snapshot multiclub");
ok(sports.includes("data-match-goals"),"campo goles");
ok(sports.includes("match?.match_minutes"),"minutos reales");
ok(sports.includes("Math.max(max,number(x.minutes))"),"respaldo duración");
ok(sql.includes("sports_snapshot_multiclub_v1033"),"RPC snapshot SQL");
ok(sql.includes("sports_save_match_multiclub_v1033"),"RPC guardar partido SQL");
ok(sql.includes("p.club_id=p_club_id"),"jugadores aislados por club");
ok(sql.includes("u.club_id=p_club_id"),"técnicos aislados por club");
ok(sql.includes("add column if not exists goals"),"columna goles");
ok(sql.includes("add column if not exists match_minutes"),"columna minutos");
for(const forbidden of ["drop table","truncate table","delete from public.players","delete from public.teams"]){
  ok(!sql.toLowerCase().includes(forbidden),"SQL destructivo: "+forbidden);
}
ok(index.includes('content="1.0.33"'),"index 1.0.33");
ok(index.includes("sports-v1033-multiclub.js?v=1033"),"sports 1033 activo");
ok(sw.includes("manager-multiclub-app-v1-0-33"),"cache 1.0.33");
if(!process.exitCode)console.log("Manager Multiclub V1.0.33 Deportes: regresión OK.");
