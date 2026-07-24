export function serializeBackup({ values = {}, mappings = {} } = {}, isoTimestamp) {
  return { version: 1, exportedAt: isoTimestamp, values, mappings };
}

export function parseBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`Backup file is not valid JSON: ${e.message}`);
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error('Backup file must contain a JSON object');
  }
  const hasValues = data.values && typeof data.values === 'object' && !Array.isArray(data.values);
  const hasMappings = data.mappings && typeof data.mappings === 'object' && !Array.isArray(data.mappings);
  if (!hasValues && !hasMappings) {
    throw new Error('Backup file must contain a "values" object and/or a "mappings" object');
  }
  return { values: hasValues ? data.values : {}, mappings: hasMappings ? data.mappings : {} };
}

export function isStorageEmpty({ values = {}, mappings = {} } = {}) {
  return Object.keys(values || {}).length === 0 && Object.keys(mappings || {}).length === 0;
}

export function mergeBackup(current = {}, incoming = {}) {
  return {
    values: { ...(current.values || {}), ...(incoming.values || {}) },
    mappings: { ...(current.mappings || {}), ...(incoming.mappings || {}) },
  };
}
