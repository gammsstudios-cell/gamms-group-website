import { getSettings } from "./settings.js";

export async function isEventActive(db) {
  const settings = await getSettings(db);
  return settings.event_active !== "false";
}

export async function requireEventActive(db) {
  return (await isEventActive(db)) ? { ok: true } : { ok: false, code: "EVENT_CLOSED" };
}
