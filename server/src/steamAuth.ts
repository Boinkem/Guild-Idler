import { AppConfig } from './config.js';

export interface SteamAuthResult {
  ok: boolean;
  steamId?: string;
  error?: string;
}

const STEAM_WEB_API_BASE = 'https://api.steampowered.com';
const AUTH_TIMEOUT_MS = 8000;

/**
 * Verifies a hex-encoded ticket (from the client's
 * GetAuthTicketForWebApi call -- see electron/main.ts's own
 * steam:getAuthTicketForWebApi handler) against Steam's real
 * ISteamUserAuth/AuthenticateUserTicket Web API. Returns the verified
 * SteamID on success.
 *
 * IMPORTANT, per Valve's own docs: this endpoint only accepts a ticket
 * from GetAuthTicketForWebApi, NOT GetAuthSessionTicket -- the two are
 * not interchangeable. See the client-side handler's own comment for
 * the full correction from the original design doc.
 *
 * Never throws -- every failure mode (missing key, missing ticket,
 * network failure, a real rejection from Steam, a VAC/publisher ban)
 * comes back as `{ ok: false, error }`, so the calling route never
 * needs its own try/catch around this.
 */
export async function verifySteamTicket(config: AppConfig, ticketHex: string): Promise<SteamAuthResult> {
  if (!config.steamWebApiKey) {
    return { ok: false, error: 'STEAM_WEB_API_KEY is not configured on this server.' };
  }
  if (!ticketHex) {
    return { ok: false, error: 'No ticket provided.' };
  }

  const url = `${STEAM_WEB_API_BASE}/ISteamUserAuth/AuthenticateUserTicket/v1/`
    + `?key=${encodeURIComponent(config.steamWebApiKey)}`
    + `&appid=${encodeURIComponent(config.steamAppId)}`
    + `&ticket=${encodeURIComponent(ticketHex)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const body: any = await res.json().catch(() => null);
    const params = body?.response?.params;

    if (!res.ok || !params) {
      const errorDesc = body?.response?.error?.errordesc;
      return { ok: false, error: errorDesc || `Steam returned HTTP ${res.status}` };
    }
    if (params.result !== 'OK') {
      return { ok: false, error: `Steam rejected the ticket: ${params.result}` };
    }
    if (params.vacbanned || params.publisherbanned) {
      return { ok: false, error: 'This Steam account is VAC or publisher banned.' };
    }

    return { ok: true, steamId: params.steamid };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timeout);
  }
}
