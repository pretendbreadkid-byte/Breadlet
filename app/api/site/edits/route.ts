import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { hasAdminAccess } from '../../../../lib/admin-access';
import { cleanCatalogEdits, cleanVisualEdits, emptyCatalogEdits, emptyVisualEdits } from '../../../../lib/site-edits';
import type { CatalogEdits } from '../../../../lib/site-edits';
import { forgetSiteEdits } from '../../../../lib/site-edits-server';

export const dynamic = 'force-dynamic';

const NOT_INSTALLED = new Set(['42P01', 'PGRST205']);
const SETUP = 'Run migration 0076_edit_mode.sql in Supabase to use edit mode.';

// Everyone loads the owner's edits (packs, Breadlets and how the page looks).
export async function GET() {
  const database = createAdminClient();
  if (!database) return NextResponse.json({ ready: false, catalog: emptyCatalogEdits(), visual: emptyVisualEdits() });
  const { data, error } = await database.from('site_edits').select('key, value');
  const values = Object.fromEntries((data || []).map((row: any) => [row.key, row.value]));
  return NextResponse.json(
    { ready: !error, catalog: values.catalog || emptyCatalogEdits(), visual: values.visual || emptyVisualEdits() },
    { headers: { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30' } },
  );
}

// Makes sure every Breadlet in an edited pack exists in the database, with the rarity edit mode gave it.
async function syncBlooks(database: any, catalog: CatalogEdits) {
  const rarities = new Map<string, string>();
  for (const pack of Object.values(catalog.packs)) {
    if (!pack.removed) for (const item of pack.items) rarities.set(item.name, item.rarity);
  }
  for (const [name, edit] of Object.entries(catalog.blooks)) if (edit.rarity) rarities.set(name, edit.rarity);
  if (!rarities.size) return null;
  const { data: existing, error } = await database.from('blooks').select('name, rarity').in('name', Array.from(rarities.keys()));
  if (error) return error.message;
  const known = new Map((existing || []).map((row: any) => [row.name, row.rarity]));
  const missing = Array.from(rarities).filter(([name]) => !known.has(name)).map(([name, rarity]) => ({ name, rarity }));
  if (missing.length) {
    const { error: insertError } = await database.from('blooks').insert(missing);
    if (insertError) return insertError.message;
  }
  for (const [name, edit] of Object.entries(catalog.blooks)) {
    if (!edit.rarity || known.get(name) === edit.rarity || !known.has(name)) continue;
    const { error: updateError } = await database.from('blooks').update({ rarity: edit.rarity }).eq('name', name);
    if (updateError) return updateError.message;
  }
  return null;
}

// Saves edits. Owner only. Body: { catalog } or { visual }.
export async function POST(request: Request) {
  const supabase = await createClient();
  const database = createAdminClient();
  if (!supabase || !database) return NextResponse.json({ error: 'Saving is unavailable.' }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  if (!(await hasAdminAccess(database, user.id))) return NextResponse.json({ error: 'Only the owner can use edit mode.' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const key = body.catalog ? 'catalog' : body.visual ? 'visual' : '';
  if (!key) return NextResponse.json({ error: 'Nothing to save.' }, { status: 400 });
  const value = key === 'catalog' ? cleanCatalogEdits(body.catalog) : cleanVisualEdits(body.visual);
  if (typeof value === 'string') return NextResponse.json({ error: value }, { status: 400 });

  if (key === 'catalog') {
    const problem = await syncBlooks(database, value as CatalogEdits);
    if (problem) return NextResponse.json({ error: `Could not update the Breadlets: ${problem}` }, { status: 500 });
  }
  const { error } = await database.from('site_edits').upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: NOT_INSTALLED.has(error.code) ? SETUP : error.message }, { status: NOT_INSTALLED.has(error.code) ? 503 : 500 });
  forgetSiteEdits();
  return NextResponse.json({ [key]: value });
}
