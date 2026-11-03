import { applyCatalogEdits, emptyCatalogEdits } from './site-edits';

let loadedAt = 0;

// Applies the owner's pack edits before the server uses the packs. Re-read at most every 15 seconds.
export async function loadSiteEdits(database: any) {
  if (Date.now() - loadedAt < 15000) return;
  loadedAt = Date.now();
  const { data, error } = await database.from('site_edits').select('value').eq('key', 'catalog').maybeSingle();
  // Migration 0076 isn't applied yet, so there are no edits.
  if (error) return;
  applyCatalogEdits(data?.value || emptyCatalogEdits());
}

// Called after a save, so the next request picks the new edits up straight away.
export const forgetSiteEdits = () => {
  loadedAt = 0;
};
