const g = (k) => chrome.storage.local.get(k);
const s = (o) => chrome.storage.local.set(o);

async function renderValues() {
  const { values = {} } = await g('values');
  const tb = document.querySelector('#values tbody');
  tb.innerHTML = '';
  for (const [k, v] of Object.entries(values)) {
    const tr = document.createElement('tr');

    const keyTd = document.createElement('td');
    keyTd.textContent = k;

    const valTd = document.createElement('td');
    const input = document.createElement('input');
    input.value = v;
    input.addEventListener('change', async (e) => {
      const { values = {} } = await g('values'); values[k] = e.target.value; await s({ values });
    });
    valTd.appendChild(input);

    const btnTd = document.createElement('td');
    const btn = document.createElement('button');
    btn.textContent = '✕';
    btn.addEventListener('click', async () => {
      const { values = {} } = await g('values'); delete values[k]; await s({ values }); renderValues();
    });
    btnTd.appendChild(btn);

    tr.appendChild(keyTd); tr.appendChild(valTd); tr.appendChild(btnTd);
    tb.appendChild(tr);
  }
}

async function renderMaps() {
  const { mappings = {} } = await g('mappings');
  const tb = document.querySelector('#maps tbody');
  tb.innerHTML = '';
  for (const [fp, vk] of Object.entries(mappings)) {
    const tr = document.createElement('tr');

    const fpTd = document.createElement('td');
    fpTd.textContent = fp;

    const vkTd = document.createElement('td');
    vkTd.textContent = vk;

    const btnTd = document.createElement('td');
    const btn = document.createElement('button');
    btn.textContent = '✕';
    btn.addEventListener('click', async () => {
      const { mappings = {} } = await g('mappings'); delete mappings[fp]; await s({ mappings }); renderMaps();
    });
    btnTd.appendChild(btn);

    tr.appendChild(fpTd); tr.appendChild(vkTd); tr.appendChild(btnTd);
    tb.appendChild(tr);
  }
}

document.getElementById('add').addEventListener('click', async () => {
  const k = document.getElementById('newkey').value.trim();
  const v = document.getElementById('newval').value;
  if (!k) return;
  const { values = {} } = await g('values'); values[k] = v; await s({ values });
  document.getElementById('newkey').value = ''; document.getElementById('newval').value = '';
  renderValues();
});

renderValues(); renderMaps();
