// El selector debe dibujar sus opciones en una capa raíz para que no las
// recorten los contenedores de pantalla. No usa otra ventana nativa, porque
// varios formularios ya están dentro de un Modal.
import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

const RAIZ = join(__dirname, '..', '..');
const UI = readFileSync(join(RAIZ, 'components', 'UI.tsx'), 'utf8');
const provider = UI.slice(UI.indexOf('export function SelectOverlayProvider'), UI.indexOf('export const Sel'));
const selector = UI.slice(UI.indexOf('export const Sel'), UI.indexOf('// ─── BUTTON'));

describe('selector móvil en capa raíz', () => {
  it('Sel delega la apertura y el cambio al provider en vez de dibujar dentro del campo', () => {
    expect(selector).toContain('openMenu?.({ items, value, onValueChange })');
    expect(selector).not.toContain('position: \'absolute\'');
    expect(selector).not.toContain('<Modal');
  });

  it('el provider cubre el contenedor y deja que el botón atrás cierre la lista', () => {
    expect(provider).toContain('StyleSheet.absoluteFill');
    expect(provider).toContain('BackHandler.addEventListener');
    expect(provider).toContain('onPress={close}');
  });

  it('el menú de opciones es desplazable y selecciona el valor elegido', () => {
    expect(provider).toContain('<ScrollView');
    expect(provider).toContain('select(item.value)');
  });
});
