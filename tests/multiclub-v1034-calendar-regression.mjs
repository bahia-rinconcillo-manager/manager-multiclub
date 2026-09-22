import fs from "node:fs";
function read(p){return fs.readFileSync(p,"utf8")}
function ok(v,m){if(!v){console.error("FAIL:",m);process.exitCode=1}}
const sports=read("sports-v1034-multiclub.js");
const app=read("app-multiclub-v1034.js");
const index=read("index.html");
const sw=read("service-worker.js");
ok(app.includes('MULTICLUB_BUILD_VERSION="V1.0.34"'),"build 1.0.34");
ok(app.includes("getMulticlubCalendarMatchesV1034"),"getter calendario");
ok(sports.includes("allMatchesV1034"),"mezcla calendario/deportes");
ok(sports.includes("calendarToSportsV1034"),"conversión calendario");
ok(sports.includes("promoteCalendarMatchV1034"),"promoción al abrir Datos");
ok(sports.includes('const month=teamPanelFilters.matchesMonth||""'),"mes opcional");
ok(!sports.includes('if($("sportsMatchMonth")&&!$("sportsMatchMonth").value)$("sportsMatchMonth").value=currentMonth();'),"sin mes forzado");
ok(index.includes('content="1.0.34"'),"index 1.0.34");
ok(index.includes("sports-v1034-multiclub.js?v=1034"),"sports 1034");
ok(sw.includes("manager-multiclub-app-v1-0-34"),"cache 1034");
if(!process.exitCode)console.log("Manager Multiclub V1.0.34: calendario integrado OK.");
