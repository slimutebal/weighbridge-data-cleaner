const APP_CONFIG_PATH = "./config/app-config.json";

let cache = null;

export async function loadAppConfig() {
  if (cache) return cache;
  try {
    const response = await fetch(APP_CONFIG_PATH);
    cache = await response.json();
  } catch {
    cache = {};
  }
  return cache;
}
