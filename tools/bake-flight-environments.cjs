const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto"), cp = require("node:child_process");
const root = path.resolve(__dirname, ".."), scratch = path.join(root, ".scratch/baked-environments"), assets = path.join(root, "assets/backgrounds/flight-environments-v1");
const modules = process.env.DRIFTWORKS_BROWSER_MODULES || process.cwd();
const python = process.env.DRIFTWORKS_BAKE_PYTHON || process.env.PYTHON||"python";
const { chromium } = require(require.resolve("playwright", { paths: [modules] }));
const cameras = { px: { back: [-1, 0, 0], right: [0, 0, -1], up: [0, 1, 0] }, nx: { back: [1, 0, 0], right: [0, 0, 1], up: [0, 1, 0] }, py: { back: [0, -1, 0], right: [1, 0, 0], up: [0, 0, -1] }, ny: { back: [0, 1, 0], right: [1, 0, 0], up: [0, 0, 1] }, pz: { back: [0, 0, -1], right: [1, 0, 0], up: [0, 1, 0] }, nz: { back: [0, 0, 1], right: [-1, 0, 0], up: [0, 1, 0] } };
const recipes = [];
for (let style = 0; style < 13; style++)
    recipes.push({ id: "style-" + style, mission: "default", style });
for (const [id, mission] of Object.entries({ jade: "gas-giant", rime: "jade-rime", fleet: "fleet-evacuation", cinematic: "cinematic", asteroid: "ellis", ohio: "ohio", "planet-110": "planet-hero", "planet-80": "planet-hero-80", "planet-140": "planet-hero-140", orbital: "planet-orbital-watch" }))
    recipes.push({ id, mission, style: 7, bridgeSpace: ["asteroid", "cinematic"].includes(id) ? 0 : undefined });
for (const localSky of [1, 2])
    recipes.push({ id: localSky === 1 ? "reception" : "hostile", mission: "default", style: 7, localSky });
for (let stage = 0; stage < 9; stage++)
    recipes.push({ id: "impact-" + stage, mission: "planet-orbital-cube", style: 7, stage });
// Each flash plate is a complete sky. Runtime never sees a lightning cell,
// a planet layer, or an illumination mask: it blends full baked environments.
for(const [id,mission]of Object.entries({jade:"gas-giant",rime:"jade-rime",fleet:"fleet-evacuation"})){
    recipes.find(r=>r.id===id).weatherCell=-1;
    for(let cell=0;cell<8;cell++)recipes.push({id:id+"-weather-"+cell,mission,style:7,weatherCell:cell});
}
const catalog = { version: 1, size: 1024, styles: Array.from({ length: 13 }, (_, i) => "style-" + i), missions: { "gas-giant": "jade", "jade-rime": "rime", "fleet-evacuation": "fleet", ohio: "ohio", "planet-hero": "planet-110", "planet-hero-80": "planet-80", "planet-hero-140": "planet-140", "planet-orbital-watch": "orbital", "planet-orbital-static": "orbital", "evacuation": "impact-0", "planet-orbital-cube": "impact-0", "planet-impact-watch": "impact-0", "planet-impact-baked": "impact-0" }, spaces: { asteroid: "asteroid", rime: "rime", reception: "reception", hostile: "hostile" }, impact: Array.from({ length: 9 }, (_, i) => "impact-" + i), environments: Object.fromEntries(recipes.map(r => [r.id, { faces: Object.keys(cameras).map(f => r.id + "/" + f + ".png"), manifest: r.id + "/manifest.json" }])) };
fs.mkdirSync(scratch, { recursive: true });
fs.mkdirSync(assets, { recursive: true });
fs.mkdirSync(path.join(assets, "recipes"), { recursive: true });
const scripts = ["src/asset-versions.js", "experiments/flight-missions.js", "experiments/mission-ohio.js", "experiments/ellis-optics.js", "experiments/thin-shell-optics.js", "src/sky-lighting.js", "src/sky-system.js", "src/impact-cues.js", "tools/skybox-source.js"];
fs.writeFileSync(path.join(scratch, "bake.html"), `<!doctype html><base href="/experiments/"><style>html,body{margin:0;background:black}#view{width:1024px;height:1024px}</style><div id="view"></div>${scripts.map(s => `<script src="../${s}"></script>`).join("\n")}<script type="module">import * as weather from "./gas-giant-weather.js";Driftworks.gasGiantWeather=weather;window.bakeModulesReady=true;</script>`);
(async () => { const browser = await chromium.launch({ channel:process.env.DRIFTWORKS_BROWSER_CHANNEL||(process.platform==="win32"?"chrome":undefined),headless:true }); try {
    for (const recipe of recipes) {
        if (process.argv.slice(2).some(arg=>arg!=="--force") && !recipe.id.startsWith(process.argv.slice(2).find(arg=>arg!=="--force")))
            continue;
        if (fs.existsSync(path.join(assets, recipe.id, "manifest.json")) && !process.argv.includes("--force") && (recipe.weatherCell!==-1 || JSON.parse(fs.readFileSync(path.join(assets,"recipes",recipe.id+".json"),"utf8")).weatherCell===-1)) {
            console.log("Retained", recipe.id);
            continue;
        }
        const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 }), sources = new Set(), errors = [];
        page.on("pageerror", e => errors.push(String(e)));
        page.on("requestfinished", r => { const u = new URL(r.url()); if (u.pathname.startsWith("/assets/"))
            sources.add(decodeURIComponent(u.pathname.slice(1))); });
        await page.goto("http://localhost:8000/.scratch/baked-environments/bake.html?mission=" + recipe.mission);
        await page.waitForFunction(() => window.bakeModulesReady);
        await page.evaluate(r => { Driftworks.sim = { METERS_PER_UNIT: 20 };
            if(r.weatherCell!==undefined)Driftworks.gasGiantWeather={...Driftworks.gasGiantWeather,gasGiantFlash:(_time,cell)=>cell===r.weatherCell?1:0}; window.bakeRecipe = r; window.bakeSky = Driftworks.flightSkyboxSource.create(document.querySelector("#view"), { style: r.style, fov: 90, cueControls: false, optics: false, preserveDrawingBuffer: true }); window.bakePose = { eye: r.bridgeSpace !== undefined ? [0, -1e10, 1550] : [0, 0, 0], region: r.bridgeSpace || 0, right: [1, 0, 0], up: [0, 0, 1], back: [0, -1, 0] }; window.bakeArrival = r.localSky ? { position: [0, 0, 0], radius: 0, localSky: r.localSky } : null; bakeSky.render(bakePose, 1, false, 0, 0, bakeArrival); if (r.stage !== undefined)
            bakeSky.cueImpact(r.stage, 0); }, recipe);
        for (let i = 0; i < 3; i++) {
            await page.waitForLoadState("networkidle");
            await page.evaluate(() => bakeSky.render(bakePose, 1, false, 0, 0, bakeArrival));
        }
        await page.waitForLoadState("networkidle");
        await page.waitForFunction(() => { bakeSky.render(bakePose, 1, false, 0, 0, bakeArrival); return !Object.values(document.querySelector("canvas").dataset).includes("loading"); }, null, { timeout: 60000 });
        await page.waitForTimeout(300);
        const status = await page.evaluate(() => ({ ...document.querySelector("canvas").dataset }));
        if (Object.values(status).some(v => String(v).includes("error")) || errors.length)
            throw Error(recipe.id + ": " + JSON.stringify({ status, errors }));
        if(recipe.stage===1)await page.evaluate(()=>{const state=bakeSky.getFrameState();state.cue.flashAge=.05;bakeSky.setFrameState(state);});
        const captures = path.join(scratch, recipe.id);
        fs.mkdirSync(captures, { recursive: true });
        for (const [name, camera] of Object.entries(cameras)) {
            const png = await page.evaluate(c => { bakeSky.render({ ...bakePose, ...c }, 1, false, 0, 0, bakeArrival); return document.querySelector("canvas").toDataURL("image/png").split(",")[1]; }, camera);
            fs.writeFileSync(path.join(captures, name + ".png"), Buffer.from(png, "base64"));
        }
        const definition = await page.evaluate(() => Driftworks.flightMissions.current().sky);
        const provenance = Object.fromEntries([...sources].sort().map(file => [file, { sha256: crypto.createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex") }]));
        const recipePath = path.join(assets, "recipes", recipe.id + ".json");
        fs.writeFileSync(recipePath, JSON.stringify({ version: 1, renderer: "tools/skybox-source.js", rendererSha256: crypto.createHash("sha256").update(fs.readFileSync(path.join(root, "tools/skybox-source.js"))).digest("hex"), ...recipe, sky: definition, timestamp: 0, contactFlashAge: recipe.stage===1?.05:undefined, seed: 58319, exposure: 1, camera: cameras, stars: "All background stars baked with the complete environment", sources: provenance }, null, 2) + "\n");
        cp.execFileSync(python, [path.join(root, "tools/bake-sky-cube.py"), recipePath, "--size", "1024", "--captures", captures, "--output", path.join(assets, recipe.id)], { stdio: "inherit" });
        console.log("Baked", recipe.id, JSON.stringify(status));
        await page.close();
    }
    const glare = JSON.parse(fs.readFileSync(path.join(root, "assets/backgrounds/sky-camera-sources-v1.json"), "utf8"));
    for(const recipe of recipes) {
        const stored = JSON.parse(fs.readFileSync(path.join(assets, "recipes", recipe.id+".json"), "utf8"));
        catalog.environments[recipe.id].cameraSources = stored.sky.kind === "landmarks" ? stored.sky.features.filter(f=>glare.assets[f.asset]&&f.gain>0).map(f=>{
            const source=glare.assets[f.asset],yaw=f.yaw*Math.PI/180,pitch=f.pitch*Math.PI/180;
            return {direction:[Math.cos(yaw)*Math.cos(pitch),Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch)],radius:f.widthDeg*Math.PI/360*source.diskFraction,strength:source.strength*f.gain,color:source.color};
        }) : glare.styles[String(stored.style)]||[];
    }
    for(const id of ["jade","rime","fleet"]){
        const frames=[id,...Array.from({length:8},(_,cell)=>id+"-weather-"+cell)],keys=[{time:0,frame:0,amount:0}];
        const order=[3,0,6,2,7,1,5,4];
        order.forEach((cell,event)=>{const start=.5+event*1.4;for(const [offset,amount]of [[0,0],[.025,.9],[.1,.55],[.18,.24],[.21,.68],[.28,.25],[.37,.08],[.4,.35],[.5,.08],[.7,0]])keys.push({time:start+offset,frame:cell+1,amount});});
        keys.push({time:12,frame:0,amount:0});catalog.environments[id].animation={frames,keys,duration:12};
    }
    fs.writeFileSync(path.join(assets, "catalog.json"), JSON.stringify(catalog, null, 2) + "\n");
}
finally {
    await browser.close();
} })().catch(e => { console.error(e); process.exitCode = 1; });
