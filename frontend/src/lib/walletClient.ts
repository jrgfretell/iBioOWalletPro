import type { SupabaseClient } from '@supabase/supabase-js';

export const WALLET_TABLES = ['config_billetera', 'categorias', 'sueldos_mes',
  'movimientos_recurrentes', 'movimientos_agenda', 'deudas', 'deuda_cuotas', 'deuda_pagos'] as const;
export type WalletTable = typeof WALLET_TABLES[number];
export interface WalletScope { userId: string; walletId: number; legacy: boolean }

/** Capture scope once, including every subsequent step of an async operation. */
export function createWalletClient(client: SupabaseClient, scope: WalletScope,
  beforeWrite: () => void, afterWrite: () => void): Pick<SupabaseClient, 'from'> {
  const attach = (value: Record<string, unknown>) => {
    if (value.user_id !== undefined && value.user_id !== scope.userId) throw Error('El registro pertenece a otro usuario.');
    if (value.billetera_id !== undefined && value.billetera_id !== scope.walletId) throw Error('El registro pertenece a otra billetera.');
    const result = { ...value, user_id: scope.userId };
    return scope.legacy ? result : { ...result, billetera_id: scope.walletId };
  };
  function watch<T extends object>(builder: T): T {
    return new Proxy(builder, {
      get(target, prop) {
        if (prop === 'then') return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
          let started = false;
          return Promise.resolve().then(() => {
            beforeWrite(); started = true;
            return target as unknown as PromiseLike<unknown>;
          }).finally(() => { if (started) afterWrite(); }).then(resolve, reject);
        };
        const method = Reflect.get(target, prop);
        if (typeof method !== 'function') return method;
        return (...args: unknown[]) => {
          const next = Reflect.apply(method, target, args);
          return next && typeof next === 'object' ? watch(next) : next;
        };
      },
    });
  }
  return {
    from: (table: string) => {
      if (!WALLET_TABLES.includes(table as WalletTable)) throw Error('Tabla fuera del ámbito de la billetera.');
      const query = client.from(table);
      type Filter = { eq: (column: string, value: unknown) => Filter };
      const scoped = <T>(builder: T): T => {
        const own = (builder as unknown as Filter).eq('user_id', scope.userId);
        return (scope.legacy ? own : own.eq('billetera_id', scope.walletId)) as T;
      };
      return new Proxy(query, {
        get(target, prop) {
          if (prop === 'select') return (...args: Parameters<typeof query.select>) => scoped(target.select(...args));
          if (prop === 'insert') return (values: Record<string, unknown> | Record<string, unknown>[], options?: Parameters<typeof query.insert>[1]) =>
            watch(target.insert(Array.isArray(values) ? values.map(attach) : attach(values), options).throwOnError());
          if (prop === 'upsert') return (values: Record<string, unknown> | Record<string, unknown>[], options?: Parameters<typeof query.upsert>[1]) =>
            watch(target.upsert(Array.isArray(values) ? values.map(attach) : attach(values), options).throwOnError());
          if (prop === 'update') return (values: Record<string, unknown>, options?: Parameters<typeof query.update>[1]) => {
            if ('user_id' in values && values.user_id !== scope.userId) throw Error('No se puede cambiar el usuario.');
            if ('billetera_id' in values && values.billetera_id !== scope.walletId) throw Error('No se puede cambiar la billetera.');
            return watch(scoped(target.update(values, options)).throwOnError());
          };
          if (prop === 'delete') return (options?: Parameters<typeof query.delete>[0]) => watch(scoped(target.delete(options)).throwOnError());
          return Reflect.get(target, prop);
        },
      });
    },
  };
}
