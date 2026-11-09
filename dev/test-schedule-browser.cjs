// Requires playwright-core and a fresh loopback PHP API (see README-shared.md).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');

const url = new URL(process.env.URL || 'http://127.0.0.1:8000/?backend=jsonfile&db=http://127.0.0.1:8899/api.php');
const api = new URL(url.searchParams.get('db'));
assert.equal(url.searchParams.get('backend'), 'jsonfile');
for (const endpoint of [url, api]) {
  assert(endpoint.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(endpoint.hostname), 'Only loopback servers are allowed');
}
const apiUrl = (op) => {
  const endpoint = new URL(api);
  endpoint.searchParams.set('op', op);
  return endpoint;
};
const spotA = '太宰府天滿宮';
const spotB = '九州國立博物館（あじっぱ體驗區）';
const spotC = '太宰府遊園地';
const spotD = '天神地下街 Sanrio 店';
const firstLeg = `${spotA} 到 ${spotB}`;
const note = 'JR 鹿兒島本線，約 20 分鐘';
const output = path.resolve(process.env.SCREENSHOTS || '.qa/screenshots');

const schedule = (page) => page.locator('#scheduleModal');
const dayOne = (page) => page.locator('#days ul[data-idx="1"]');
const spot = (page) => dayOne(page).locator('.it[data-id="dazaifu"]');
const visit = (page, action, field) => spot(page).getByRole('button', { name: `${action}${field}時間：${spotA}`, exact: true });
const transport = (page, action, leg = firstLeg) => dayOne(page).getByRole('button', { name: `${action}交通方式：${leg}`, exact: true });

async function state() {
  const response = await fetch(apiUrl('state'), { redirect: 'error' });
  assert(response.ok, `Cannot read isolated API: ${response.status}`);
  return response.json();
}

async function visitItinerary(page, reload = false) {
  if (reload) await page.reload({ waitUntil: 'domcontentloaded' });
  else await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '行程', exact: true }).click();
  await page.locator('#syncStatus').getByText(/共享中・第 \d+ 版/).waitFor();
  await spot(page).waitFor();
}

async function openEditor(trigger, dialog) {
  await trigger.click();
  await dialog.waitFor({ state: 'visible' });
}

async function dragAfter(page, source, target) {
  const handle = source.locator('.h');
  await handle.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();
  const from = await handle.boundingBox();
  const to = await target.boundingBox();
  assert(from && to, 'Both itinerary spots must be on screen');
  const sourceId = await source.getAttribute('data-id');
  const targetId = await target.getAttribute('data-id');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  try {
    await page.mouse.move(to.x + from.width, to.y + to.height - 8, { steps: 16 });
    await page.waitForFunction(({ sourceId, targetId }) => {
      const items = [...document.querySelectorAll('#days ul[data-idx="1"] .it')].map((item) => item.dataset.id);
      return items.indexOf(sourceId) > items.indexOf(targetId);
    }, { sourceId, targetId });
  } finally {
    await page.mouse.up();
  }
}

async function saveChange(page, trigger) {
  const [response] = await Promise.all([
    page.waitForResponse((res) => res.url() === apiUrl('save').href && res.request().method() === 'POST'),
    trigger(),
  ]);
  if (!response.ok()) throw new Error(`Isolated API rejected update: ${response.status()} ${await response.text()}`);
  const saved = (await response.json()).state;
  await page.locator('#syncStatus').getByText(new RegExp(`第 ${saved.rev} 版`)).waitFor();
  return saved;
}

async function openClient(browser, { device, viewport, mobile }, errors) {
  const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, serviceWorkers: 'block' });
  await context.route('**/*', (route) => {
    const request = route.request();
    const target = new URL(request.url());
    if ([url.origin, api.origin].includes(target.origin)) return route.continue();
    if (request.method() === 'GET' && ['unpkg.com', 'cdn.jsdelivr.net'].includes(target.hostname)) return route.continue();
    if (request.method() !== 'GET' || target.hostname === 'trip.yi-jia-zi.com') errors.push(`Unexpected remote request: ${target.href}`);
    return route.abort();
  });
  await context.addInitScript(({ id, nick }) => {
    localStorage.setItem('kyushuPlanner.me', JSON.stringify({ id, nick }));
  }, { id: device, nick: mobile ? '測試甲' : '測試乙' });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await visitItinerary(page);
  return page;
}

async function checkLayout(page, device, width) {
  const geometry = await spot(page).evaluate((card) => {
    const boxes = (selector) => [...card.querySelectorAll(selector)].map((node) => node.getBoundingClientRect());
    const disjoint = (a, b) => a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom;
    const controls = boxes('.h, select, .x');
    const times = boxes('.visit-time');
    const leg = card.nextElementSibling;
    const button = leg.querySelector('button').getBoundingClientRect();
    const row = leg.getBoundingClientRect();
    return {
      viewport: innerWidth,
      pageWidth: document.documentElement.scrollWidth,
      timesClear: times.length === 2 && times.every((time) => controls.every((control) => disjoint(time, control))),
      legContained: button.width > 0 && button.left >= row.left && button.right <= row.right + 1,
    };
  });
  assert.equal(geometry.viewport, width);
  assert(geometry.pageWidth <= width && geometry.timesClear && geometry.legContained, `${device}: ${JSON.stringify(geometry)}`);
  await transport(page, '編輯').evaluate((button) => button.scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: path.join(output, `schedule-${device}.png`) });
}

(async () => {
  assert.equal(await state(), null, 'Start with a fresh isolated API data directory');
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const errors = [];
  try {
    const author = await openClient(browser, { device: 'schedule0001', viewport: { width: 390, height: 844 }, mobile: true }, errors);
    const editor = schedule(author);
    const save = () => saveChange(author, () => editor.getByRole('button', { name: '儲存', exact: true }).click());
    await openEditor(visit(author, '設定', '抵達'), editor);
    await editor.getByLabel('抵達時間', { exact: true }).fill('09:15');
    await editor.getByLabel('離開時間', { exact: true }).fill('10:45');
    await author.screenshot({ path: path.join(output, 'schedule-390-editor.png') });
    await save();
    await editor.waitFor({ state: 'hidden' });
    assert.match(await visit(author, '編輯', '抵達').innerText(), /09:15/);
    assert.match(await visit(author, '編輯', '離開').innerText(), /10:45/);

    await openEditor(transport(author, '新增'), editor);
    await editor.getByLabel('交通方式', { exact: true }).selectOption('train');
    await editor.getByLabel('交通備註（選填）', { exact: true }).fill(note);
    const added = await save();
    assert.equal((await state()).rev, added.rev);
    assert.match(await transport(author, '編輯').innerText(), /JR 鹿兒島本線/);
    await checkLayout(author, '390', 390);

    const reader = await openClient(browser, { device: 'schedule0002', viewport: { width: 1366, height: 900 }, mobile: false }, errors);
    assert.match(await visit(reader, '編輯', '抵達').innerText(), /09:15/);
    assert.match(await visit(reader, '編輯', '離開').innerText(), /10:45/);
    assert.match(await transport(reader, '編輯').innerText(), /JR 鹿兒島本線/);
    await checkLayout(reader, 'desktop', 1366);

    await openEditor(visit(author, '編輯', '離開'), editor);
    assert.equal(await editor.getByLabel('抵達時間', { exact: true }).inputValue(), '09:15');
    assert.equal(await editor.getByLabel('離開時間', { exact: true }).inputValue(), '10:45');
    await editor.getByRole('button', { name: '清除抵達時間', exact: true }).click();
    await editor.getByLabel('離開時間', { exact: true }).fill('11:00');
    await save();
    await visit(reader, '設定', '抵達').waitFor();
    assert.match(await visit(reader, '編輯', '離開').innerText(), /11:00/);

    await openEditor(transport(author, '編輯'), editor);
    assert.equal(await editor.getByLabel('交通方式', { exact: true }).inputValue(), 'train');
    assert.equal(await editor.getByLabel('交通備註（選填）', { exact: true }).inputValue(), note);
    await editor.getByLabel('交通方式', { exact: true }).selectOption('bus');
    await editor.getByLabel('交通備註（選填）', { exact: true }).fill('從車站搭乘接駁車');
    await save();
    await transport(reader, '編輯').getByText(/從車站搭乘接駁車/).waitFor();
    await visitItinerary(author, true);
    assert.match(await transport(author, '編輯').innerText(), /從車站搭乘接駁車/);
    assert.match(await visit(author, '編輯', '離開').innerText(), /11:00/);

    await openEditor(transport(author, '編輯'), editor);
    await saveChange(author, () => editor.getByRole('button', { name: '移除交通方式', exact: true }).click());
    await transport(reader, '新增').waitFor();

    await openEditor(transport(author, '新增'), editor);
    await editor.getByLabel('交通方式', { exact: true }).selectOption('walk');
    await save();
    await saveChange(author, () => dayOne(author).getByLabel(`移動 ${spotB}`, { exact: true }).selectOption('2'));
    await transport(reader, '新增', `${spotA} 到 ${spotC}`).waitFor();
    assert.equal(await transport(reader, '編輯', `${spotA} 到 ${spotC}`).count(), 0);
    assert.equal(await transport(reader, '編輯').count(), 0);
    await visitItinerary(reader, true);
    await transport(reader, '新增', `${spotA} 到 ${spotC}`).waitFor();
    assert.match(await visit(reader, '編輯', '離開').innerText(), /11:00/);

    const readerEditor = schedule(reader);
    const readerSave = () => saveChange(reader, () => readerEditor.getByRole('button', { name: '儲存', exact: true }).click());
    await openEditor(transport(reader, '新增', `${spotA} 到 ${spotC}`), readerEditor);
    await readerEditor.getByLabel('交通方式', { exact: true }).selectOption('walk');
    await readerSave();
    await saveChange(reader, () => dragAfter(reader,
      dayOne(reader).locator('.it[data-id="yuenchi"]'), dayOne(reader).locator('.it[data-id="tenjinsanrio"]')));
    await transport(reader, '新增', `${spotA} 到 ${spotD}`).waitFor();
    assert.equal(await transport(reader, '編輯', `${spotA} 到 ${spotC}`).count(), 0);

    await openEditor(visit(reader, '編輯', '離開'), readerEditor);
    await readerEditor.getByRole('button', { name: '清除離開時間', exact: true }).click();
    await readerSave();
    await visit(author, '設定', '離開').waitFor();
    assert.deepEqual(errors, []);
    console.log('PASS 390×844 and 1366×900 Chrome: time set/edit/clear, transport insert/edit/remove, two-client polling, reload, same-day drag and cross-day move, no overflow or page errors.');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
