// Exercise the actual React data adapter with the installed Supabase SDK.
// All HTTP responses are synthetic; this test never connects to a database.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createWalletClient, WALLET_TABLES } from '../../frontend/src/lib/walletClient.ts';
const require = createRequire(new URL('../../frontend/package.json', import.meta.url));
const { createClient } = require('@supabase/supabase-js');
let checks = 0, starts = 0, ends = 0, fail = false, stale = false;
const requests = [];
const sdk = createClient('http://example.invalid', 'test-only', {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: async (url, init) => {
    requests.push({ url: new URL(url), method: init.method, body: init.body && JSON.parse(init.body) });
    return new Response(fail ? JSON.stringify({ code: '42501', message: 'Synthetic denied write' }) : '[]', {
      status: fail ? 403 : 200, headers: { 'Content-Type': 'application/json' },
    });
  } },
});
const client = createWalletClient(sdk, { userId: 'owner-a', walletId: 7, legacy: false },
  () => { if (stale) throw Error('Stale wallet'); starts++; }, () => { ends++; });
const check = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
const scoped = request => {
  check(request.url.searchParams.get('user_id'), 'eq.owner-a');
  check(request.url.searchParams.get('billetera_id'), 'eq.7');
};
for (const table of WALLET_TABLES) {
  await client.from(table).select('*').eq('id', 12).order('id').range(0, 49);
  scoped(requests.at(-1));
  check(requests.at(-1).url.pathname, '/rest/v1/' + table);
  await client.from(table).insert({ monto: 5 }).select('*');
  check(requests.at(-1).body, { monto: 5, user_id: 'owner-a', billetera_id: 7 });
  await client.from(table).upsert([{ mes: 0 }, { mes: 1 }], { onConflict: 'user_id,billetera_id,anio,mes' });
  check(requests.at(-1).body, [0, 1].map(mes => ({ mes, user_id: 'owner-a', billetera_id: 7 })));
  await client.from(table).update({ monto: 8 }).eq('id', 12).select('id');
  scoped(requests.at(-1)); check(requests.at(-1).url.searchParams.get('id'), 'eq.12');
  await client.from(table).delete().eq('id', 12);
  scoped(requests.at(-1));
}
check(starts, 32); check(ends, starts);
for (const values of [{ billetera_id: 8 }, { user_id: 'other-owner' }]) {
  assert.throws(() => client.from('categorias').insert(values)); checks++;
  assert.throws(() => client.from('categorias').upsert([{}, values])); checks++;
  assert.throws(() => client.from('categorias').update(values)); checks++;
}
assert.throws(() => client.from('billeteras')); checks++;
fail = true;
await assert.rejects(async () => { await client.from('categorias').insert({ nombre: 'Denied' }); }); checks++;
check(ends, starts);
fail = false; stale = true;
const before = requests.length;
await assert.rejects(async () => { await client.from('deudas').delete().eq('id', 12); }, /Stale wallet/); checks++;
check(requests.length, before); check(ends, starts);
const old = createWalletClient(sdk, { userId: 'owner-a', walletId: -1, legacy: true }, () => {}, () => {});
await old.from('config_billetera').select('*');
check(requests.at(-1).url.searchParams.get('user_id'), 'eq.owner-a');
check(requests.at(-1).url.searchParams.has('billetera_id'), false);
await old.from('config_billetera').upsert({ monto_base: 0 }, { onConflict: 'user_id' });
check(requests.at(-1).body, { monto_base: 0, user_id: 'owner-a' });
console.log(`Etapa 3: ${checks} comprobaciones correctas; ninguna conexión remota.`);
