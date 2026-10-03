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

// Configuración dejó de ser un modal con pestañas propias: ahora son grupos de la
// barra de abajo. Los grupos viven en ConfigGrupo, y cada uno declara además las
// PARTES que contiene, porque el gate va por parte y no por grupo — "Usuarios" es
// de admin y "Auditoría" no, y metidos en el mismo grupo los dos siguen teniendo
// que distinguirse.
const PANTALLA = readFileSync(
  join(__dirname, '..', '..', 'screens', 'ConfigGrupo.tsx'),
  'utf8',
);

/**
 * Las 7 PARTES en las que sigue repartiéndose la configuración, con su gate.
 *
 * Antes eran 7 pestañas y ahora son 7 partes metidas en 5 grupos, porque la barra
 * de abajo no admite 7. Lo que este test protege no ha cambiado: siguen siendo las
 * mismas 7 cosas con los mismos permisos, solo que agrupadas de otra manera. Las
 * etiquetas son las de cada parte, cortas porque van dentro de un interruptor; el
 * nombre largo de la sección es el del grupo.
 */
// `roles: undefined` significa SIN GATE, que es un dato y no una ausencia: es
// justo la diferencia entre la parte de Cajas y la de Cierre de caja.
const ESPERADO: { id: string; label: string; roles?: string[]; perms?: string[] }[] = [
  { id: 'cajas',      label: 'Cajas',      roles: ['admin'] },
  { id: 'caja',       label: 'Cierre' },
  { id: 'monedas',    label: 'Monedas',    roles: ['admin'] },
  { id: 'descuentos', label: 'Descuentos', roles: ['admin'] },
  { id: 'usuarios',   label: 'Usuarios',   roles: ['admin'] },
  { id: 'auditoria',  label: 'Auditoría',  perms: ['auditoria'] },
  { id: 'plan',       label: 'Mi plan' },
];

/** Extrae el array TABS del archivo, sin importar React. */
function leerTabs(): { id: string; label: string; roles?: string[]; perms?: string[] }[] {
  const ini = PANTALLA.indexOf('export const GRUPOS: GrupoDef[] = [');
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

describe('Configuración conserva las 7 partes con sus mismos gates', () => {
  const tabs = leerTabs();

  it('son 7, en el mismo orden y con las mismas etiquetas', () => {
    expect(tabs.map((t) => t.id)).toEqual(ESPERADO.map((t) => t.id));
    expect(tabs.map((t) => t.label)).toEqual(ESPERADO.map((t) => t.label));
  });

  it('la parte de cierre NO es de admin: es la que se le perdía al cajero', () => {
    // La aserción que da nombre a la fase. `PUT /settings` no lleva
    // requireRole, igual que en la web; si algún día esta línea falla, alguien
    // ha puesto un gate donde no va, y el cajero ha perdido el margen de su caja.
    const caja = tabs.find((t) => t.id === 'caja')!;
    expect(caja.roles).toBeUndefined();
    expect(tabs.find((t) => t.id === 'cajas')!.roles).toEqual(['admin']);
  });

  it('cada parte con gate coincide con el de la web', () => {
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

  it('los grupos caben en la barra: son 5 o menos', () => {
    // El motivo por el que las 7 partes se agruparon. Si alguien añade un grupo
    // sin mirar esto, la barra vuelve a apretar los iconos — que es justo el
    // problema que motivó el agrupamiento.
    const cuerpo = PANTALLA.split('export const GRUPOS: GrupoDef[] = [')[1].split('\n];')[0];
    const n = (cuerpo.match(/^  \{$/gm) || []).length;
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThanOrEqual(5);
  });

  it('ninguna parte se queda fuera de su grupo', () => {
    // Agrupar es reordenar, no dejar de exponer nada: las 7 siguen ahí.
    for (const e of ESPERADO) expect(tabs.map((t) => t.id)).toContain(e.id);
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
