// Record the demo video's picture: drive the real interface scene by scene, timed to the narration, and capture
// every frame through the Chrome DevTools screencast (1.5x, so the compositor can zoom in and stay sharp).
// A visible cursor is drawn in the page; camera moves are logged as target rectangles and applied later by
// docs/demo/compose.py. The live scenes run against the mock backend, which replays a saved real run.
//
// Usage: node scripts/demo-record.mjs <docs/demo/build> [baseUrl]
//   needs <build>/voice.json and <build>/cards/*.html from docs/demo/voice.py
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [buildDir, base = "http://localhost:3100"] = process.argv.slice(2);
const voice = JSON.parse(fs.readFileSync(path.join(buildDir, "voice.json"), "utf8"));
const SCENE = Object.fromEntries(voice.scenes.map((s) => [s.id, s]));
const framesDir = path.join(buildDir, "frames");
fs.rmSync(framesDir, { recursive: true, force: true });
fs.mkdirSync(framesDir, { recursive: true });

const W = 1920, H = 1080, DSF = 1.5;
// the screencast only delivers frames above 1x when the device scale is forced on the browser itself
const browser = await chromium.launch({ channel: "chrome", headless: true, args: [`--force-device-scale-factor=${DSF}`, `--window-size=${W},${H}`] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DSF, colorScheme: "light" });
await ctx.addCookies([{ name: "access_token", value: "mock", url: base }]);
await ctx.addInitScript(() => {
  const install = () => {
    const st = document.createElement("style");
    st.textContent = `nextjs-portal{display:none!important}
      #__cur{position:fixed;left:0;top:0;width:30px;height:30px;z-index:2147483647;pointer-events:none;transition:opacity .2s}
      .__ring{position:fixed;width:44px;height:44px;margin:-22px 0 0 -22px;border:3px solid #B4432F;border-radius:50%;
        z-index:2147483646;pointer-events:none;animation:__ring .5s ease-out forwards}
      @keyframes __ring{from{transform:scale(.3);opacity:.9}to{transform:scale(1.3);opacity:0}}`;
    document.head.appendChild(st);
    if (location.protocol === "file:") return;
    const c = document.createElement("div");
    c.id = "__cur";
    c.innerHTML = `<svg viewBox="0 0 24 24" width="30" height="30"><path d="M3 2l7.5 19 2.6-7.6L21 10.8z" fill="#231F1A" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
    const saved = JSON.parse(localStorage.getItem("__cur") || "[960,560]");
    c.style.transform = `translate(${saved[0]}px,${saved[1]}px)`;
    document.body.appendChild(c);
    document.addEventListener("mousemove", (e) => {
      c.style.transform = `translate(${e.clientX}px,${e.clientY}px)`;
      localStorage.setItem("__cur", JSON.stringify([e.clientX, e.clientY]));
    }, true);
    document.addEventListener("mousedown", (e) => {
      const r = document.createElement("div");
      r.className = "__ring";
      r.style.left = `${e.clientX}px`;
      r.style.top = `${e.clientY}px`;
      document.body.appendChild(r);
      setTimeout(() => r.remove(), 600);
    }, true);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install);
  else install();
});
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
let frameCount = 0;
cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
  fs.writeFileSync(path.join(framesDir, `${metadata.timestamp.toFixed(4)}.jpg`), Buffer.from(data, "base64"));
  frameCount++;
  await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
});
const startCast = () => cdp.send("Page.startScreencast", { format: "jpeg", quality: 90, maxWidth: W * DSF, maxHeight: H * DSF, everyNthFrame: 1 }).catch(() => {}); // stays active across navigations

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => Date.now() / 1000;
const timeline = { dsf: DSF, scenes: [] };
let cur = [960, 560];

// ---- motion helpers -------------------------------------------------------------------------------------------
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
async function glide(x, y, ms = 650) {
  const [x0, y0] = cur;
  const steps = Math.max(8, Math.round(ms / 16));
  for (let i = 1; i <= steps; i++) {
    const k = ease(i / steps);
    await page.mouse.move(x0 + (x - x0) * k, y0 + (y - y0) * k);
    await sleep(ms / steps);
  }
  cur = [x, y];
}
async function center(target) {
  const loc = typeof target === "string" ? page.locator(target).first() : target;
  await loc.scrollIntoViewIfNeeded().catch(() => {});
  const b = await loc.boundingBox();
  if (!b) throw new Error(`no box for ${target}`);
  return [b.x + b.width / 2, b.y + b.height / 2, b];
}
async function click(target, ms = 650) {
  const [x, y] = await center(target);
  await glide(x, y, ms);
  await sleep(140);
  await page.mouse.down();
  await sleep(90);
  await page.mouse.up();
}
async function hover(target, ms = 650) {
  const [x, y] = await center(target);
  await glide(x, y, ms);
}
async function rectOf(target, pad = 40) {
  const loc = typeof target === "string" ? page.locator(target).first() : target;
  const b = await loc.boundingBox();
  return b ? [b.x - pad, b.y - pad, b.x + b.width + pad, b.y + b.height + pad] : [0, 0, W, H];
}

// ---- scene runner ---------------------------------------------------------------------------------------------
let scene = null;
const cam = (rect, dur = 1.3) => scene.cams.push({ t: +(now() - scene.start).toFixed(3), rect: rect.map((v) => Math.round(v)), dur });
const at = async (sec) => { const wait = scene.start + sec - now(); if (wait > 0) await sleep(wait * 1000); };
const cue = (i) => SCENE[scene.id].cues[Math.min(i, SCENE[scene.id].cues.length - 1)].start;
async function run(id, prep, body) {
  if (prep) await prep();
  scene = { id, start: now(), cams: [{ t: 0, rect: [0, 0, W, H], dur: 0 }] };
  timeline.scenes.push(scene);
  try {
    await body();
  } catch (e) {
    console.error(`scene ${id}:`, e.message);
  }
  await at(SCENE[id].duration);
  scene.end = now();
  console.log(`scene ${id} ${(scene.end - scene.start).toFixed(1)}s, frames so far ${frameCount}`);
}
const card = (name) => async () => {
  await page.goto(pathToFileURL(path.join(buildDir, "cards", `${name}.html`)).href);
  await startCast();
  await sleep(150);
};
const app = async () => {
  for (let i = 0; i < 3; i++) {
    await page.goto(`${base}/orchestration`, { waitUntil: "networkidle" });
    if (!page.url().includes("/login")) break;
    console.log("landed on login, retrying");
    await ctx.addCookies([{ name: "access_token", value: "mock", url: base }]);
  }
  await startCast();
  await sleep(1200);
};
const node = (text) => page.locator(".react-flow__node", { hasText: text }).first();

await startCast();

// 1. title card
await run("open", card("open"), async () => {});

// 2. the name: the in-app explanation
await run("name", app, async () => {
  await at(0.6);
  await click(page.getByRole("button", { name: /的由来/ }).first(), 900);
  await sleep(500);
  cam(await rectOf("[role=dialog]", 60));
  await at(cue(2));
  cam(await rectOf("[role=dialog] table, [role=dialog] dl, [role=dialog] .grid", 30).catch(() => [0, 0, W, H]));
  await at(SCENE.name.duration - 1.6);
  cam([0, 0, W, H], 1.0);
  await page.keyboard.press("Escape");
});

// 3. definitions: canvas, the verifier, the rejected edit
await run("spec", async () => {
  if (await page.getByRole("dialog").isVisible().catch(() => false)) await page.keyboard.press("Escape");
  await sleep(400);
}, async () => {
  await click(page.getByRole("button", { name: /工作流定义/ }), 800);
  await sleep(900);
  cam([330, 150, 1920, 1043]);
  await at(cue(1));
  cam([330, 0, 1920, 1080]);
  await at(cue(2));
  const verifier = page.getByText("verifier", { exact: true }).first();
  await hover(verifier);
  cam(await rectOf(verifier.locator("xpath=ancestor::div[3]"), 120));
  await at(cue(3) - 0.4);
  await click(page.getByRole("button", { name: "YAML", exact: true }));
  await sleep(500);
  const ta = page.getByLabel("工作流定义（YAML）");
  const pos = await ta.evaluate((el) => {
    const i = el.value.indexOf("can_see: [draft, evidence]");
    const line = el.value.slice(0, i).split("\n").length;
    el.scrollTop = Math.max(0, (line - 6) * 19.5);
    return { start: i + "can_see: [draft, ".length, line };
  });
  cam([330, 600, 1920, 1080], 1.0);
  await click(ta, 500);
  await ta.evaluate((el, s) => { el.focus(); el.setSelectionRange(s, s + "evidence".length); }, pos.start);
  await sleep(500);
  await page.keyboard.type("reasoning", { delay: 110 });
  await sleep(400);
  await click(page.getByRole("button", { name: "校验", exact: true }), 700);
  await sleep(300);
  cam([330, 600, 1920, 1080], 1.0);
});

// 4. a new run
await run("newrun", app, async () => {
  await click(page.getByRole("button", { name: "新建运行" }).first(), 800);
  await sleep(500);
  cam(await rectOf("[role=dialog]", 50), 1.0);
  await click("#run-input", 500);
  await page.keyboard.type("2025年中国新能源汽车销量与渗透率情况", { delay: 75 });
  await at(cue(1) + 2.2);
  await click(page.getByRole("button", { name: "开始运行" }), 600);
  await sleep(800);
  cam([0, 0, W, H], 1.0);
});

// 5. live scheduling (the mock replays the saved run faster, ORCH_MOCK_SPEED = SPEED in docs/demo/voice.py)
await run("live", null, async () => {
  await page.locator("aside li button.w-full").first().click().catch(() => {});
  await at(cue(1) - 0.3);
  cam([330, 230, 1180, 708]);
  await hover(node("search"));
  await at(cue(2));
  cam([700, 250, 1550, 728]);
  await hover(node("sections"));
  await at(cue(3));
  await hover(node("verify"));
  cam([850, 250, 1700, 728]);
  await at(cue(4));
  cam([330, 560, 1920, 1080]);
  await glide(900, 900, 800);
});

// 6. inspector on the verifier
await run("inspector", null, async () => {
  cam([330, 0, 1920, 1080], 0.8);
  await click(node("verify"), 700);
  await sleep(600);
  cam([1180, 60, 1920, 476]);
  await at(cue(1) - 0.2);
  const row = page.getByText(/看不到撰稿/).first();
  await hover(row);
  cam(await rectOf(row, 70), 1.0);
});

// 7. quality gate
await run("gate", null, async () => {
  await page.locator(".react-flow__pane").first().click({ position: { x: 60, y: 60 } }).catch(() => {});
  cam([0, 0, W, H], 0.8);
  await click(page.getByRole("button", { name: /质量门与自循环/ }), 800);
  await click(page.getByRole("button", { name: "放大" }), 600);
  await sleep(400);
  await click(page.getByRole("button", { name: /首次检查/ }), 500);
  cam([330, 60, 1920, 580]);
  await at(cue(1));
  // keep the first check on screen even if the run finishes meanwhile (the panel then jumps to the latest check)
  await page.getByRole("button", { name: /首次检查/ }).click().catch(() => {});
  cam([330, 300, 1200, 790]);
  await glide(700, 640, 900);
  await at(cue(2));
  await page.getByRole("button", { name: /首次检查/ }).click().catch(() => {});
  cam([330, 60, 1920, 1080]);
});

// 8. repairs: accepted only if not worse
await run("repairs", null, async () => {
  // when the run finishes the panel jumps to the latest check; the repair list sits under the first one
  await page.getByRole("button", { name: /首次检查/ }).click().catch(() => {});
  await sleep(300);
  const head = page.getByText(/这一轮修复的结果/).first();
  await hover(head, 800);
  cam(await rectOf(head.locator("xpath=.."), 60));
  await at(cue(2) - 0.3);
  await click(page.getByRole("button", { name: /修复后复查/ }), 700);
  cam([330, 60, 1920, 580], 1.0);
  await at(cue(3));
  cam([0, 0, W, H], 1.5);
});

// 9. the report
await run("report", null, async () => {
  await click(page.getByRole("button", { name: "报告", exact: true }), 800);
  await sleep(1200);
  cam([570, 90, 1920, 849]);
  await at(cue(1));
  cam([800, 240, 1700, 746]);
  await hover(page.getByText(/^已核实 \d+/).first());
  await at(cue(2));
  cam([800, 330, 1700, 836]);
  await glide(1250, 560, 900);
});

// 10. synthesis and recommendations
await run("synthesis", null, async () => {
  await click(page.getByRole("button", { name: "综合研判与行动建议" }).first(), 700);
  await sleep(1400);
  cam([620, 90, 1920, 821]);
});

// 11. fact check, a second scenario from a different definition
await run("factcheck", async () => {
  await app();
  await page.locator("aside li button.w-full", { hasText: /fact-check ·/ }).first().click();
  await sleep(1200);
}, async () => {
  await click(page.getByRole("button", { name: "核查结果", exact: true }), 700);
  await sleep(800);
  cam([330, 60, 1920, 954]);
  await at(cue(1));
  const wrong = page.getByText(/41218元/).last();
  await hover(wrong);
  cam(await rectOf(wrong.locator("xpath=ancestor::div[2]"), 80), 1.2);
});

// 12. insights
await run("insights", null, async () => {
  await click(page.getByRole("button", { name: /改进建议/ }), 800);
  await sleep(1000);
  cam([330, 0, 1920, 894]);
  await at(cue(1));
  const tip = page.getByText(/建议怎么改|建议/).first();
  await hover(tip);
});

// 13. results and 14. closing cards
await run("results", card("results"), async () => {});
await run("close", card("close"), async () => {});

await cdp.send("Page.stopScreencast").catch(() => {});
fs.writeFileSync(path.join(buildDir, "timeline.json"), JSON.stringify(timeline, null, 1));
console.log(`frames: ${frameCount}`);
await browser.close();
