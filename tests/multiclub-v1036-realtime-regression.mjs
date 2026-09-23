import fs from "node:fs";
function read(p){return fs.readFileSync(p,"utf8")}
function ok(v,m){if(!v){console.error("FAIL:",m);process.exitCode=1}}
const app=read("app-multiclub-v1036.js");
const index=read("index.html");
const sw=read("service-worker.js");
ok(app.includes('MULTICLUB_BUILD_VERSION="V1.0.36"'),"build 1.0.36");
ok(app.includes("applyPayloadsV1036"),"payload realtime directo");
ok(app.includes("refreshTableV1036"),"fallback por tabla");
ok(app.includes("realtimePayloadEventsV1036"),"métrica payload");
ok(app.includes("payload=>noteRealtimeV1036(table,payload)"),"callback conserva payload");
ok(app.includes("realtimeFullReloadsV1036++"),"fallback global contabilizado");
ok(!app.includes("if(!onlySeason)await loadAll();"),"sin recarga global por señal normal");
ok(index.includes('content="1.0.36"'),"index 1.0.36");
ok(index.includes("app-multiclub-v1036.js?v=1036"),"app 1036");
ok(sw.includes("manager-multiclub-app-v1-0-36"),"cache 1036");
if(!process.exitCode)console.log("Manager Multiclub V1.0.36 realtime: regresión OK.");
