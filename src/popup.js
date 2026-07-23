const $ = (id) => document.getElementById(id);
let teaching = false;

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

$('fill').addEventListener('click', async () => {
  const tab = await activeTab();
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { action: 'fillPage' });
    $('fill').textContent = res ? `Filled ${res.filled}/${res.total}` : 'Fill page';
  } catch (e) {
    $('fill').textContent = 'Not available here';
  }
});

$('teach').addEventListener('click', async () => {
  const tab = await activeTab();
  const nextTeaching = !teaching;
  try {
    await chrome.tabs.sendMessage(tab.id, { action: nextTeaching ? 'startTeach' : 'stopTeach' });
    teaching = nextTeaching;
    $('teach').textContent = teaching ? 'Stop teaching' : 'Teach a field';
    $('teach').classList.toggle('active', teaching);
  } catch (e) {
    $('teach').textContent = 'Not available here';
  }
});

$('opts').addEventListener('click', (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });

(async () => {
  const { settings = {} } = await chrome.storage.local.get('settings');
  $('auto').checked = !!settings.autoFillOnLoad;
})();
$('auto').addEventListener('change', async () => {
  const { settings = {} } = await chrome.storage.local.get('settings');
  settings.autoFillOnLoad = $('auto').checked;
  await chrome.storage.local.set({ settings });
});
