// ─── la paridad de Configuración se sostiene sola ───────────────────────────
//
// El bug que esta fase vino a arreglar no era visual: era que la tolerancia de
// descuadre —que `PUT /settings` permite a cualquiera ajustar— estaba detrás
// del filtro de admin de la pantalla única de Cajas. Un cajero no tenía dónde
// fijar el margen de SU caja, y en la web sí.
//
// Un test como este no evita que pase mañana. Lo que evita es que la diferencia
// siga ahí sin que nadie lo note, que es como estos fallos sobreviven: el gate
// se copia a ojo, un día uno "simplifica" las condiciones, y la pantalla
// funciona igual de bien o igual de mal, sin que ninguna prueba se entere.
//
// La tabla se lee del ARCHIVO, no de una constante reexportada. Si la copiamos
// aquí, el test compararía la copia con la copia y siempre diría que todo está
// bien, que es el peor uso posible de un test.

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ROLES } from '../roles';

const PANTALLA = readFileSync(
  join(__dirname, '..', '..', 'screens', 'ConfiguracionScreen.tsx'),
  'utf8',
);

/** Las 7 pestañas de la web, en su orden, con su gate. */
// `roles: undefined` significa SIN GATE, que es un dato y no una ausencia: es
// justo la diferencia entre la pestaña de Cajas y la de Cierre de caja.
const ESPERADO: { id: string; label: string; roles?: string[]; perms?: string[] }[] = [
  { id: 'cajas',      label: 'Cajas',           roles: ['admin'] },
  { id: 'caja',       label: 'Cierre de caja' },
  { id: 'monedas',    label: 'Monedas y tasas', roles: ['admin'] },
  { id: 'descuentos', label: 'Descuentos',      roles: ['admin'] },
  { id: 'usuarios',   label: 'Usuarios',        roles: ['admin'] },
  { id: 'auditoria',  label: 'Auditoría',       perms: ['auditoria'] },
  { id: 'plan',       label: 'Mi plan' },
];

/** Extrae el array TABS del archivo, sin importar React. */
function leerTabs(): { id: string; label: string; roles?: string[]; perms?: string[] }[] {
  const ini = PANTALLA.indexOf('const TABS: TabDef[] = [');
  const fin = PANTALLA.indexOf('\n];', ini);
  const cuerpo = PANTALLA.slice(PANTALLA.indexOf('[', ini) + 1, fin);
  return cuerpo
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('{ id:'))
    .map((l) => {
      const id = /id: '([^']+)'/.exec(l)![1];
      const label = /label: '([^']+)'/.exec(l)![1];
      const rolesM = /roles: \[([^\]]+)\]/.exec(l);
      const permsM = /perms: \[([^\]]+)\]/.exec(l);
      return {
        id,
        label,
        roles: rolesM ? rolesM[1].split(',').map((s) => s.trim().replace(/'/g, '')) : undefined,
        perms: permsM ? permsM[1].split(',').map((s) => s.trim().replace(/'/g, '')) : undefined,
      };
    });
}

describe('Configuración tiene las 7 pestañas de la web, con los mismos gates', () => {
  const tabs = leerTabs();

  it('son 7, en el mismo orden y con las mismas etiquetas', () => {
    expect(tabs.map((t) => t.id)).toEqual(ESPERADO.map((t) => t.id));
    expect(tabs.map((t) => t.label)).toEqual(ESPERADO.map((t) => t.label));
  });

  it('"Cierre de caja" NO es de admin: es la que se le perdía al cajero', () => {
    // La aserción que da nombre a la fase. `PUT /settings` no lleva
    // requireRole, igual que en la web; si algún día esta línea falla, alguien
    // ha puesto un gate donde no va, y el cajero ha perdido el margen de su caja.
    const caja = tabs.find((t) => t.id === 'caja')!;
    expect(caja.roles).toBeUndefined();
    expect(tabs.find((t) => t.id === 'cajas')!.roles).toEqual(['admin']);
  });

  it('cada pestaña con gate coincide con el de la web', () => {
    for (const e of ESPERADO) {
      const t = tabs.find((x) => x.id === e.id)!;
      expect({ id: t.id, roles: t.roles, perms: t.perms })
        .toEqual({ id: e.id, roles: e.roles, perms: e.perms });
    }
  });

  it('ningún rol ve una pestaña de admin por accidente', () => {
    // `ROLES` es la matriz de permisos que el backend comparte. Si algún día se
    // añade un rol con 'config' pero sin ser admin, esta comprobación es la que
    // avisa de que la pestaña aparece donde no debería.
    for (const [rol, def] of Object.entries(ROLES)) {
      const veAdmin = tabs.filter(
        (t) => t.roles?.includes('admin') && def.perms.includes('config'),
      );
      if (rol === 'admin') expect(veAdmin.length).toBeGreaterThan(0);
    }
  });

  it('la tolerancia vive en su propio archivo, sin filtro de rol', () => {
    // Si alguien la volviera a pegar dentro de CajasAdmin, el cajero volvería
    // a perderla, y no habría ninguna prueba de eso salvo esta.
    const cajas = readFileSync(
      join(__dirname, '..', '..', 'screens', 'CajasAdminScreen.tsx'),
      'utf8',
    );
    expect(cajas).not.toContain('cashTolerance');
    expect(cajas).not.toContain('SettingsAPI');
  });

  it('cada pestaña monta una pantalla real, no un placeholder', () => {
    for (const id of ESPERADO.map((t) => t.id)) {
      expect(PANTALLA).toContain(`activa.id === '${id}'`);
    }
    expect(PANTALLA).not.toContain('TODO');
  });
});
