// Garden links in chat. A pasted garden invite link (anything with ?garden=<player id>) is swapped by
// the server for a tag, [garden:<id>:<their username>], which chat shows as a "Name's Garden" button.
// The server always looks the name up itself, so a typed tag can't pretend to be someone else's garden.

const ID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
// A link with ?garden=<id> (any site part before it), or a tag already in the text (when editing).
const LINK_OR_TAG = new RegExp(String.raw`\S*[?&]garden=(${ID})\S*|\[garden:(${ID})(?::[A-Za-z0-9_]{0,40})?\]`, 'gi');
// How chat finds tags to draw as buttons.
export const GARDEN_TAG = new RegExp(String.raw`\[garden:(${ID}):([A-Za-z0-9_]{1,40})\]`, 'gi');

export async function tagGardenLinks(text: string, database: any) {
  const ids = Array.from(new Set(Array.from(text.matchAll(LINK_OR_TAG), (match) => (match[1] || match[2]).toLowerCase())));
  if (!ids.length) return text;
  const { data } = await database.from('profiles').select('id, username').in('id', ids.slice(0, 5));
  const names = new Map<string, string>((data || []).map((row: any) => [String(row.id).toLowerCase(), String(row.username || '')]));
  return text.replace(LINK_OR_TAG, (_whole, linkId?: string, tagId?: string) => {
    const id = (linkId || tagId || '').toLowerCase();
    const name = names.get(id);
    return name && /^[A-Za-z0-9_]{1,40}$/.test(name) ? `[garden:${id}:${name}]` : '';
  }).replace(/ {2,}/g, ' ').trim();
}
