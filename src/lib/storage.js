export function createStore(backend) {
  const read = async (key, fallback) => {
    const got = await backend.get(key);
    return key in got ? got[key] : fallback;
  };
  return {
    async getValues() { return read('values', {}); },
    async setValue(k, v) {
      const values = await this.getValues();
      values[k] = v;
      await backend.set({ values });
    },
    async deleteValue(k) {
      const values = await this.getValues();
      delete values[k];
      await backend.set({ values });
    },
    async getMappings() { return read('mappings', {}); },
    async setMapping(fp, valueKey) {
      const mappings = await this.getMappings();
      mappings[fp] = valueKey;
      await backend.set({ mappings });
    },
    async deleteMapping(fp) {
      const mappings = await this.getMappings();
      delete mappings[fp];
      await backend.set({ mappings });
    },
    async getSettings() {
      return { autoFillOnLoad: false, ...(await read('settings', {})) };
    },
    async setSetting(k, v) {
      const settings = await this.getSettings();
      settings[k] = v;
      await backend.set({ settings });
    },
  };
}
