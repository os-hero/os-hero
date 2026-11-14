const fs = require("fs");
const path = require("path");
const { powerMonitor } = require("electron");

module.exports = async function ({ panel, BrowserWindow, app, profile, output, check, capture, wait }) {
  const js = code => panel.webContents.executeJavaScript(code, true);
  const go = async route => { await js(`navigateTray(${JSON.stringify(route)})`); await wait(100); };
  const before = await js("window.osHeroApi.getState()");
  const sourceBytes = fs.readFileSync(path.join(profile, "character.json"));
  check("existing users are not assigned an identity automatically", !before.character.identity);
  await go("customization");
  check("legacy registration exposes name only and preserves canonical preview", before.heroRegistrationMode === "existing" && await js("!!document.getElementById('hero-existing-note') && document.querySelectorAll('.hero-fields input').length===1 && !document.getElementById('body-color') && !document.getElementById('hair-style') && document.getElementById('character-preview').dataset.heroKey===state.hero.key"));
  check("legacy base edits cannot bypass name-only migration through IPC", await js("window.osHeroApi.saveCharacter({gender:'male',bodyColor:'#000000',eyeType:'default'}).then(()=>false,()=>true)"));
  for (const width of [760, 320]) {
    panel.setSize(width, 600);
    for (const locale of ['ko','en','zh-CN']) {
      await js(`window.osHeroApi.setLanguage('${locale}')`); await wait(80);
      check(`${width} ${locale} legacy naming has no overflow or missing copy`, await js("document.documentElement.scrollWidth<=innerWidth && !document.body.innerText.includes('hero.existingNote')"));
    }
  }
  panel.setSize(760, 600); await js("window.osHeroApi.setLanguage('ko')"); await wait(80);
  await js("document.getElementById('hero-name').value='<bad>';document.getElementById('hero-name').dispatchEvent(new Event('input'));document.getElementById('save-button').click()");
  check("invalid name cannot reach confirmation", await js("!!document.getElementById('hero-name') && !!document.getElementById('registration-error').textContent"));
  await js("document.getElementById('hero-name').value='모모';document.getElementById('hero-name').dispatchEvent(new Event('input'))");
  await capture(panel, "hero-01-registration.png");
  await js("document.getElementById('save-button').click()");
  check("review does not persist appearance or identity", fs.readFileSync(path.join(profile, "character.json")).equals(sourceBytes) && await js("!!document.querySelector('.hero-confirm-details')"));
  await capture(panel, "hero-01-confirm.png");
  await js("persistTrayUi()");
  app.emit("second-instance"); await wait(10500);
  check("registration confirmation releases hidden renderer", panel.isDestroyed());
  app.emit("second-instance"); await wait(900);
  panel = BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes("view=tray"));
  for (let i = 0; i < 30 && !(await js("!!document.querySelector('.hero-confirm-details')")); i++) await wait(100);
  check("confirmation and name survive hidden-renderer recreation", await js("!!document.querySelector('.hero-confirm-details') && trayUi.registration.name==='모모'"));
  fs.mkdirSync(path.join(profile, "character.json.tmp"));
  await js("document.getElementById('save-button').click()"); await wait(150);
  check("failed registration leaves original bytes and shows retry", fs.readFileSync(path.join(profile, "character.json")).equals(sourceBytes) && await js("!!document.getElementById('registration-error').textContent && !document.getElementById('save-button').disabled"));
  fs.rmdirSync(path.join(profile, "character.json.tmp"));
  await js("window.osHeroApi.registerHero({name:trayUi.registration.name,gender:'male',bodyColor:'#000000',eyeType:'default',hair:null,hairColor:'#29262E',registrationMode:'create'})"); await wait(250);
  let state = await js("window.osHeroApi.getState()");
  const registered = state.character;
  check("registration preserves every frame and equipment", JSON.stringify(state.hero.frames) === JSON.stringify(before.hero.frames) && JSON.stringify(registered.equipped) === JSON.stringify(before.character.equipped));
  check("stale or forged appearance payload cannot replace any legacy base field", ['gender','bodyColor','eyeType','hairColor'].every(key=>registered[key]===before.character[key]));
  check("registration preserves items gold quests and reward progress", JSON.stringify(state.items) === JSON.stringify(before.items) && state.wallet.gold === before.wallet.gold && JSON.stringify(state.quests) === JSON.stringify(before.quests) && JSON.stringify(state.expedition.progress) === JSON.stringify(before.expedition.progress));
  check("registered profile is readonly and no dirty draft remains", await js("!!document.getElementById('hero-level') && !document.getElementById('body-color') && !document.getElementById('hair-style') && !hasUnsavedTrayChanges()"));
  check("registered identity cannot be changed through old save IPC", await js("window.osHeroApi.saveCharacter({bodyColor:'#000000'}).then(()=>false,()=>true)"));
  await js("window.osHeroApi.registerHero({name:'Changed'})");
  check("registration retry is idempotent", JSON.stringify((await js("window.osHeroApi.getState()")).character) === JSON.stringify(registered));
  check("pre-registration backup contains exact original bytes", fs.readFileSync(path.join(profile,"backups/hero-registration/character.json")).equals(sourceBytes));
  await capture(panel, "hero-02-profile.png");
  await go("companion");
  await js("document.getElementById('expedition-toggle').click()"); await wait(100);
  await capture(panel, "hero-03-exploration.png");
  await js("document.getElementById('expedition-toggle').click()"); await wait(100);
  await go("inventory");
  await js("document.querySelector('[data-tab=hair]').click();document.querySelector('[data-item=princess_hair]').click();document.getElementById('equip-button').click()"); await wait(200);
  await js("document.querySelector('[data-hair-color=\"#714D38\"]').click()"); await wait(250);
  state = await js("window.osHeroApi.getState()");
  check("inventory changes hairstyle and dye but preserves identity and base", state.character.equipped.hair === "princess_hair" && state.character.hairColor === "#714D38" && JSON.stringify(state.character.identity) === JSON.stringify(registered.identity) && state.character.bodyColor === registered.bodyColor && state.character.gender === registered.gender);
  check("unsupported inventory dye rejected", await js("window.osHeroApi.setHairColor('#BADBAD').then(()=>false,()=>true)"));
  await go("customization");
  check("profile portrait follows saved inventory appearance", await js("document.getElementById('character-preview').dataset.heroKey===state.hero.key"));
  await go("companion");
  await js("document.getElementById('expedition-toggle').click()"); await wait(1300);
  state = await js("window.osHeroApi.getState()");
  check("registered exploration starts one shared progression clock", state.expedition.running && state.expedition.adventure.elapsedMs >= 1000);
  await capture(panel, "hero-exploration-after-equipment.png");
  await js("document.getElementById('expedition-toggle').click()"); await wait(100);
  const paused = (await js("window.osHeroApi.getState()")).expedition.adventure.elapsedMs;
  await wait(1100);
  check("pause freezes combat and reward time", !(await js("window.osHeroApi.getState()")).expedition.running && (await js("window.osHeroApi.getState()")).expedition.adventure.elapsedMs === paused);
  await js("window.osHeroApi.expeditionAction({action:'start'})"); powerMonitor.emit("lock-screen"); await wait(100);
  check("screen lock pauses RPG", !(await js("window.osHeroApi.getState()")).expedition.running);
  check("locked stage cannot be selected", await js("window.osHeroApi.selectAdventureStage(7).then(()=>false,()=>true)"));
  await js("document.getElementById('adventure-stage-picker').click()");
  check("stage picker exposes only reached stages", await js("document.querySelectorAll('[data-stage]:not(:disabled)').length===1"));
  await js("document.querySelector('[data-stage=\"0\"]').click()"); await wait(100);
  check("stage selection stays in popup and pauses", BrowserWindow.getAllWindows().length===1 && !(await js("window.osHeroApi.getState()")).expedition.running);
  const frames = new Set();
  for (let i=0;i<10;i++) {
    const motion = await js("({src:document.getElementById('expedition-hero').src,frame:state.hero.motion.frame,scene:state.hero.sceneFrames[state.hero.motion.frame],header:document.querySelector('[data-canonical-hero]').dataset.heroFrame})");
    check(`canonical breathing phase matches in exploration sample ${i}`, motion.src===motion.scene && Number(motion.header)===motion.frame);
    frames.add(motion.src); await wait(180);
  }
  check("registered Hero still breathes through multiple original frames", frames.size>=2);
  for (const width of [760,680,520,390,320]) {
    panel.setSize(width,600); await wait(150);
    for (const locale of ["ko","en","zh-CN"]) {
      await js(`window.osHeroApi.setLanguage('${locale}')`); await wait(80);
      for (const route of ["customization","companion","inventory"]) {
        await go(route);
        check(`${width} ${locale} registered ${route} has no horizontal overflow`, await js("document.documentElement.scrollWidth<=innerWidth && document.getElementById('tray-page').scrollWidth<=document.getElementById('tray-page').clientWidth+1 && [...document.querySelectorAll('.hero-page *')].every(el=>{const r=el.getBoundingClientRect();return !r.width || !!el.closest('dialog:not([open])') || (r.left>=-1 && r.right<=innerWidth+1)})"));
        check(`${width} ${locale} ${route} images and messages resolve`, await js("[...document.images].every(img=>img.complete&&img.naturalWidth>0) && !document.body.innerText.includes('hero.')"));
        if (width===760 && route==='companion') check(`${locale} primary exploration action fits the default popup`, await js("document.getElementById('expedition-toggle').getBoundingClientRect().bottom<=innerHeight-4"));
        if (locale==='ko' && [760,390,320].includes(width)) await capture(panel, `hero-${route}-${width}.png`);
      }
    }
  }
  await js("window.osHeroApi.setLanguage('ko')");
  const files = ["character.json","settings.json","quests.json","wallet.json","expedition.json"];
  const fixture = Object.fromEntries(files.map(file=>[file,JSON.parse(fs.readFileSync(path.join(profile,file)))]));
  // Seed a near-completion checkpoint to exercise the real timer and atomic event save on restart.
  fixture["expedition.json"].adventure.elapsedMs = 179500;
  fixture["expedition.json"].progress.expedition_star_hat = 75 * 60000 - 500;
  fixture["expedition.json"].running = true;
  fs.writeFileSync(path.join(output,"hero-restart-fixture.json"),JSON.stringify(fixture));
};

module.exports.newUser = async function ({ panel, profile, output, check, capture, wait, restart }) {
  const js = code => panel.webContents.executeJavaScript(code, true);
  await js("navigateTray('customization')"); await wait(100);
  const before = await js("window.osHeroApi.getState()");
  check("new user remains in creation mode across save/restart", before.heroRegistrationMode==='create' && !before.character.identity && await js("!!document.getElementById('body-color') && !!document.getElementById('hair-style') && !document.getElementById('hero-existing-note')"));
  if (!restart) {
    check("fresh startup does not prematurely persist a Hero", !fs.existsSync(path.join(profile, 'character.json')));
    await js("window.osHeroApi.cancelCustomization()"); await wait(100);
    check("later action persists explicit unfinished onboarding without identity", JSON.parse(fs.readFileSync(path.join(profile, 'character.json'))).registrationMode==='create');
    const files = ['character.json','settings.json','quests.json','wallet.json','expedition.json'];
    fs.writeFileSync(path.join(output, 'hero-new-fixture.json'), JSON.stringify(Object.fromEntries(files.map(file=>[file, JSON.parse(fs.readFileSync(path.join(profile,file)))]))));
    return;
  }
  await js("document.querySelector('[data-gender=female]').click();document.getElementById('body-color').value='#FFE6BD';document.getElementById('body-color').dispatchEvent(new Event('input'));document.getElementById('hair-style').value='long_hair';document.getElementById('hair-style').dispatchEvent(new Event('change'));document.getElementById('hero-name').value='새친구';document.getElementById('hero-name').dispatchEvent(new Event('input'))");
  await capture(panel, 'hero-new-registration.png');
  await js("document.getElementById('save-button').click();document.getElementById('save-button').click()"); await wait(250);
  const after = await js("window.osHeroApi.getState()");
  check("new user can choose appearance once and then becomes readonly", after.character.identity.name==='새친구' && after.character.gender==='female' && after.character.bodyColor==='#FFE6BD' && after.character.equipped.hair==='long_hair' && after.heroRegistrationMode==='registered' && !Object.hasOwn(after.character,'registrationMode'));
  check("new registration preserves inventory quests gold and existing reward progress", JSON.stringify(after.items)===JSON.stringify(before.items) && after.wallet.gold===before.wallet.gold && JSON.stringify(after.quests)===JSON.stringify(before.quests) && JSON.stringify(after.expedition.progress)===JSON.stringify(before.expedition.progress));
  check("new registration cannot be replayed with another identity", await js("(async()=>{const a=await window.osHeroApi.getState();const b=await window.osHeroApi.registerHero({name:'another'});return JSON.stringify(a.character)===JSON.stringify(b.character)})()"));
};

module.exports.restart = async function ({panel,profile,output,check,wait,capture}) {
  const js=code=>panel.webContents.executeJavaScript(code,true);
  let state=await js("window.osHeroApi.getState()");
  check("identity and inventory dye survive full restart", state.character.identity.name==='모모' && state.character.equipped.hair==='princess_hair' && state.character.hairColor==='#714D38');
  check("restart gives no offline credit and never resumes automatically", !state.expedition.running && state.expedition.adventure.elapsedMs===179500 && state.expedition.adventure.victories===0);
  const before=JSON.stringify({character:state.character,quests:state.quests,gold:state.wallet.gold});
  fs.mkdirSync(path.join(profile,"expedition.json.tmp"));
  check("failed combat start cannot publish running state", await js("window.osHeroApi.expeditionAction({action:'start'}).then(()=>false,()=>true)"));
  check("failed combat start retains checkpoint", !(await js("window.osHeroApi.getState()")).expedition.running);
  fs.rmdirSync(path.join(profile,"expedition.json.tmp"));
  await js("navigateTray('customization')");
  await js("window.osHeroApi.expeditionAction({action:'start'})"); await wait(1400);
  await js("window.osHeroApi.expeditionAction({action:'pause'})");
  state=await js("window.osHeroApi.getState()");
  const saved=JSON.parse(fs.readFileSync(path.join(profile,"expedition.json")));
  check("one real timer completion saves XP, stage, history together", saved.adventure.victories===1 && saved.adventure.xp===21 && saved.adventure.stage===1 && saved.adventure.journal.length===1);
  check("simultaneous cosmetic and combat completion update one checkpoint", saved.unlocked.includes("expedition_star_hat") && state.items.some(item=>item.id==="expedition_star_hat"));
  check("combat cannot mutate appearance, quests or gold", JSON.stringify({character:state.character,quests:state.quests,gold:state.wallet.gold})===before);
  await wait(100);
  check("profile reads new XP and journal without restart", await js("document.getElementById('hero-xp-value').textContent==='21 / 100' && document.querySelectorAll('.hero-journal li').length===2"));
  await capture(panel,"hero-profile-after-victory.png");
};
