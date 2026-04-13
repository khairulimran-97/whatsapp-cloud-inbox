import { WhatsAppClient } from '@kapso/whatsapp-cloud-api';
import { getDb, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';

// --- Types ---

export type WaProfile = {
  id: string;
  label: string;
  phoneNumberId: string;
  wabaId: string;
  kapsoApiKey: string;
  phoneDisplay: string | null;
  isDefault: boolean | null;
};

// --- Client cache (keyed by API key to reuse across profiles with same key) ---

const clientCache = new Map<string, WhatsAppClient>();

function getClientForApiKey(kapsoApiKey: string): WhatsAppClient {
  let client = clientCache.get(kapsoApiKey);
  if (!client) {
    client = new WhatsAppClient({
      baseUrl: process.env.WHATSAPP_API_URL || 'https://api.kapso.ai/meta/whatsapp',
      kapsoApiKey,
      graphVersion: 'v24.0'
    });
    clientCache.set(kapsoApiKey, client);
  }
  return client;
}

// --- Profile resolution ---

/** Get all WA profiles from DB */
export function getAllProfiles(): WaProfile[] {
  const db = getDb();
  return db.select().from(schema.waProfiles).all();
}

/** Get default profile from DB, falling back to env vars */
export function getDefaultProfile(): WaProfile | null {
  const db = getDb();
  const profiles = db.select().from(schema.waProfiles).all();
  const defaultProfile = profiles.find(p => p.isDefault) || profiles[0];
  if (defaultProfile) return defaultProfile;

  // Fallback: env vars (before migration runs or empty DB)
  const phoneNumberId = process.env.PHONE_NUMBER_ID;
  const wabaId = process.env.WABA_ID;
  const kapsoApiKey = process.env.KAPSO_API_KEY;
  if (phoneNumberId && kapsoApiKey) {
    return {
      id: '__env__',
      label: 'Default',
      phoneNumberId,
      wabaId: wabaId || '',
      kapsoApiKey,
      phoneDisplay: null,
      isDefault: true,
    };
  }
  return null;
}

/** Get profile by phone_number_id (used by webhook) */
export function getProfileByPhoneNumberId(phoneNumberId: string): WaProfile | null {
  const db = getDb();
  const rows = db.select().from(schema.waProfiles)
    .where(eq(schema.waProfiles.phoneNumberId, phoneNumberId)).all();
  return rows[0] || null;
}

/**
 * Resolve a profile and its WhatsApp client.
 * Priority: profileId param → default profile → env vars fallback
 */
export function resolveProfile(profileId?: string | null): { client: WhatsAppClient; profile: WaProfile } {
  let profile: WaProfile | null = null;

  if (profileId && profileId !== '__env__') {
    const db = getDb();
    const rows = db.select().from(schema.waProfiles)
      .where(eq(schema.waProfiles.id, profileId)).all();
    profile = rows[0] || null;
  }

  if (!profile) {
    profile = getDefaultProfile();
  }

  if (!profile) {
    throw new Error('No WA profile configured. Add one in Settings or set PHONE_NUMBER_ID + KAPSO_API_KEY env vars.');
  }

  return {
    client: getClientForApiKey(profile.kapsoApiKey),
    profile,
  };
}

// --- Backward compatibility exports ---

let _legacyClient: WhatsAppClient | null = null;

export function getWhatsAppClient(): WhatsAppClient {
  if (!_legacyClient) {
    const profile = getDefaultProfile();
    if (profile) {
      _legacyClient = getClientForApiKey(profile.kapsoApiKey);
    } else {
      const kapsoApiKey = process.env.KAPSO_API_KEY;
      if (!kapsoApiKey) throw new Error('KAPSO_API_KEY not set');
      _legacyClient = getClientForApiKey(kapsoApiKey);
    }
  }
  return _legacyClient;
}

export const whatsappClient = new Proxy({} as WhatsAppClient, {
  get(_, prop) {
    return getWhatsAppClient()[prop as keyof WhatsAppClient];
  }
});

/** @deprecated Use resolveProfile() instead */
export const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || '';
