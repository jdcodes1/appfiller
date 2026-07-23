const g = (k) => chrome.storage.local.get(k);
const s = (o) => chrome.storage.local.set(o);

async function renderValues() {
  const { values = {} } = await g('values');
  const tb = document.querySelector('#values tbody');
  tb.innerHTML = '';
  for (const [k, v] of Object.entries(values)) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${k}</td><td><input value="${v.replace(/"/g,'&quot;')}"></td><td><button>✕</button></td>`;
    tr.querySelector('input').addEventListener('change', async (e) => {
      const { values = {} } = await g('values'); values[k] = e.target.value; await s({ values });
    });
    tr.querySelector('button').addEventListener('click', async () => {
      const { values = {} } = await g('values'); delete values[k]; await s({ values }); renderValues();
    });
    tb.appendChild(tr);
  }
}

async function renderMaps() {
  const { mappings = {} } = await g('mappings');
  const tb = document.querySelector('#maps tbody');
  tb.innerHTML = '';
  for (const [fp, vk] of Object.entries(mappings)) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${fp}</td><td>${vk}</td><td><button>✕</button></td>`;
    tr.querySelector('button').addEventListener('click', async () => {
      const { mappings = {} } = await g('mappings'); delete mappings[fp]; await s({ mappings }); renderMaps();
    });
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
