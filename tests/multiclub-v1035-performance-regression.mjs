import fs from "node:fs";
function read(p){return fs.readFileSync(p,"utf8")}
function ok(v,m){if(!v){console.error("FAIL:",m);process.exitCode=1}}
const app=read("app-multiclub-v1035.js");
const sports=read("sports-v1035-multiclub.js");
const index=read("index.html");
const sw=read("service-worker.js");
ok(app.includes('MULTICLUB_BUILD_VERSION="V1.0.35"'),"build 1.0.35");
ok(app.includes("ensurePhotoUrlV1035"),"fotos bajo demanda");
ok(app.includes("IntersectionObserver"),"observador de fotos");
ok(!app.includes("for(const player of players){if(player.photo_path&&!signedCache[player.photo_path])signedCache[player.photo_path]=await signedUrl(player.photo_path)}"),"sin firma masiva de fotos");
ok(app.includes("ACTIVITY_COLUMNS_V1035"),"actividad proyectada");
ok(app.includes("TRASH_PLAYER_COLUMNS_V1035"),"papelera proyectada");
ok(app.includes('select("id,name,surname,birth_date,player_dni,team,guardian,phone,email,address,notes,status,photo_path,created_at,deleted_at")'),"proyección jugadores");
ok(sports.includes('data-photo-path='),"fotos deportivas diferidas");
ok(index.includes('content="1.0.35"'),"index 1.0.35");
ok(index.includes("app-multiclub-v1035.js?v=1035"),"app 1035");
ok(sw.includes("manager-multiclub-app-v1-0-35"),"cache 1035");
if(!process.exitCode)console.log("Manager Multiclub V1.0.35 rendimiento: regresión OK.");
