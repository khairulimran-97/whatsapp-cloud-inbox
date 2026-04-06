import { promises as fs } from 'fs';
import path from 'path';

const SETTINGS_PATH = path.join(process.cwd(), 'data', 'settings.json');

let cached: { data: Record<string, string>; ts: number } | null = null;
const CACHE_TTL = 5_000;

export async function getSettings(): Promise<Record<string, string>> {
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;
  try {
    const raw = await fs.readFile(SETTINGS_PATH, 'utf-8');
    const data = JSON.parse(raw);
    cached = { data, ts: Date.now() };
    return data;
  } catch {
    return {};
  }
}

export async function getBclApiKey(): Promise<string> {
  const settings = await getSettings();
  return settings.bcl_api_key || '';
}
