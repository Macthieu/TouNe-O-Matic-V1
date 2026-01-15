import { AppConfig } from "../config.js";

export async function fetchAirplayStatus(){
  try {
    const res = await fetch(`${AppConfig.restBaseUrl}/airplay/status`);
    if(!res.ok) return null;
    const body = await res.json();
    if(!body?.ok) return null;
    return body.data || null;
  } catch {
    return null;
  }
}
