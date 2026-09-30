// ─── tests de las colecciones de lectura del almacén offline ──────────────────
//
// Estas colecciones NO son colas: son la última versión buena que entregó el
// servidor, para que una pantalla pueda pintar algo sin red. Lo que se prueba
// aquí es la regla que evita el peor fallo posible de una caché: que un array
// VACÍO borre la copia anterior. Sin esa regla, un cierre devuelto sin
// resultados —o un endpoint que responde vacío por un cambio de filtro— deja al
// cajero sin poder consultar el último cierre que hizo, y sin red no hay forma de
// recuperarlo.

import { describe, it, expect, beforeEach } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { activateNamespace, deactivateNamespace } from '../namespace';
import {
  cacheClosings, getOfflineClosings,
  cacheMovements, getOfflineMovements,
  cacheSales, getOfflineSales,
  cacheSettings, getOfflineSettings,
  cacheDiscounts, getOfflineDiscounts,
} from '../offlineStore';
import type { User } from '../../types';

const USER = {
  id: 'u1',
  email: 'cajero@empresa.cu',
  name: 'Cajero',
  role: 'cajero',
  businessId: 'emp1',
  company: { id: 'emp1', name: 'Empresa' },
} as unknown as User;

beforeEach(async () => {
  deactivateNamespace();
  await AsyncStorage.clear();
  await activateNamespace(USER, 'caja-1');
});

describe('colecciones de lectura del almacén offline', () => {
  it('guardan y devuelven lo que se les pasó', async () => {
    await cacheClosings([{ id: 'c1' } as never]);
    await cacheMovements([{ id: 'm1' } as never]);
    await cacheSales([{ id: 's1' } as never]);
    await cacheDiscounts([{ id: 'd1' }]);

    expect((await getOfflineClosings()).map((c) => c.id)).toEqual(['c1']);
    expect((await getOfflineMovements()).map((m) => m.id)).toEqual(['m1']);
    expect((await getOfflineSales()).map((s) => s.id)).toEqual(['s1']);
    expect((await getOfflineDiscounts()).map((d) => d.id)).toEqual(['d1']);
  });

  it('un array VACÍO no borra la copia anterior', async () => {
    // La regla que protege al cajero sin red. Un cierre que se perdiera no se
    // puede volver a pedir hasta que vuelva la conexión, y para entonces el
    // cajero ya necesita el número de factura.
    await cacheClosings([{ id: 'c1' } as never]);
    await cacheClosings([]);

    expect(await getOfflineClosings()).toHaveLength(1);
  });

  it('un null o un no-array tampoco borra nada', async () => {
    await cacheMovements([{ id: 'm1' } as never]);
    await cacheMovements(null as never);
    await cacheMovements({ no: 'array' } as never);

    expect(await getOfflineMovements()).toHaveLength(1);
  });

  it('los ajustes se guardan como un objeto suelto, no como una lista', async () => {
    await cacheSettings({ currencies: ['CUP', 'USD'], cashToleranceMode: 'absoluta' });
    const s = await getOfflineSettings();
    expect(s?.currencies).toEqual(['CUP', 'USD']);
  });

  it('sin namespace no se escribe ni se lee, y no se rompe nada', async () => {
    deactivateNamespace();
    await cacheClosings([{ id: 'c1' } as never]);
    expect(await getOfflineClosings()).toEqual([]);
  });

  it('las colecciones son POR CUENTA: dos cuentas no se pisan', async () => {
    // El móvil se usa en mostradores compartidos. Que la lista de cierres de
    // una cuenta aparezca en otra es peor que no tenerla.
    await cacheClosings([{ id: 'c1' } as never]);

    deactivateNamespace();
    await activateNamespace(
      { ...USER, id: 'u2' } as unknown as User,
      'caja-1',
    );
    expect(await getOfflineClosings()).toEqual([]);
  });
});
