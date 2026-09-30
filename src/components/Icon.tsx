// ─── ICONS (port 1:1 del Icon.tsx de la web) ─────────────────────────────────
// Mismos paths SVG que la web: stroke 2, cap/join round. Con react-native-svg
// (compatible con Expo Go) en lugar de emojis.
import React from 'react';

declare const __DEV__: boolean;
import Svg, { Path, Polyline, Line, Circle, Rect } from 'react-native-svg';
import { colors } from '../config/theme';

// El union es la LISTA, no una pista: `IconName | string` ensancha la unión
// hasta `string` y anula el chequeo de tipos, que es justo lo que dejó pasar
// nueve estados vacíos con un emoji en vez de un icono. Con el union solo, un nombre mal
// escrito es un error de compilación.
export type IconName =
  | 'dashboard' | 'inventario' | 'pos' | 'facturacion' | 'contabilidad'
  | 'usuarios' | 'plus' | 'trash' | 'edit' | 'search' | 'logout' | 'alert'
  | 'check' | 'print' | 'eye' | 'close' | 'trend_up' | 'cart' | 'minus'
  | 'x' | 'refresh' | 'cierre' | 'doc' | 'transferencias' | 'auditoria'
  | 'warehouse' | 'cash'
  // Portados de la web con su path exacto (ver CubaGest-Web/src/components/
  // shared/Icon.tsx). Los necesita la Configuración y la purga de emoji.
  | 'arrow_left' | 'bell' | 'building' | 'clipboard' | 'clock'
  | 'credit_card' | 'gift' | 'link' | 'lock' | 'mail' | 'message'
  | 'moon' | 'settings' | 'shield' | 'sun' | 'zap';

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
}

const Icon = ({ name, size = 18, color }: IconProps) => {
  // Sin color explícito se usa el apagado DEL TEMA. Estaba fijo en `#64748B`,
  // el valor de `--muted` en claro, así que en tema oscuro todos los iconos
  // que no recibieran color quedaban medio invisibles contra la superficie.
  const c = color ?? colors.textMuted;
  const common = {
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (name) {
    case 'dashboard':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke={color} strokeWidth={2} {...common} />
          <Polyline points="9 22 9 12 15 12 15 22" stroke={color} strokeWidth={2} {...common} />
        </Svg>
      );
    case 'inventario':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" stroke={color} strokeWidth={2} {...common} />
          <Polyline points="3.27 6.96 12 12.01 20.73 6.96" stroke={color} strokeWidth={2} {...common} />
          <Line x1="12" y1="22.08" x2="12" y2="12" stroke={color} strokeWidth={2} {...common} />
        </Svg>
      );
    case 'pos':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Rect x="2" y="3" width="20" height="14" rx="3" stroke={color} strokeWidth={2} {...common} />
          <Path d="M8 21h8" stroke={color} strokeWidth={2} {...common} />
          <Path d="M12 17v4" stroke={color} strokeWidth={2} {...common} />
          <Path d="M7 8h4" stroke={color} strokeWidth={2} {...common} />
          <Path d="M7 11h2" stroke={color} strokeWidth={2} {...common} />
        </Svg>
      );
    case 'facturacion':
    case 'doc':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke={color} strokeWidth={2} {...common} />
          <Polyline points="14,2 14,8 20,8" stroke={color} strokeWidth={2} {...common} />
          {name === 'doc' ? (
            <>
              <Line x1="8" y1="13" x2="16" y2="13" stroke={color} strokeWidth={2} {...common} />
              <Line x1="8" y1="17" x2="16" y2="17" stroke={color} strokeWidth={2} {...common} />
              <Line x1="8" y1="9" x2="10" y2="9" stroke={color} strokeWidth={2} {...common} />
            </>
          ) : (
            <Polyline points="9 15 11 17 15 13" stroke={color} strokeWidth={2} {...common} />
          )}
        </Svg>
      );
    case 'contabilidad':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Polyline points="22 12 18 12 15 21 9 3 6 12 2 12" stroke={color} strokeWidth={2} {...common} />
        </Svg>
      );
    case 'usuarios':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke={color} strokeWidth={2} {...common} />
          <Circle cx="9" cy="7" r="4" stroke={color} strokeWidth={2} {...common} />
          <Path d="M23 21v-2a4 4 0 0 0-3-3.87" stroke={color} strokeWidth={2} {...common} />
          <Path d="M16 3.13a4 4 0 0 1 0 7.75" stroke={color} strokeWidth={2} {...common} />
        </Svg>
      );
    case 'plus':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Line x1="12" y1="5" x2="12" y2="19" stroke={color} strokeWidth={2.5} strokeLinecap="round" />
          <Line x1="5" y1="12" x2="19" y2="12" stroke={color} strokeWidth={2.5} strokeLinecap="round" />
        </Svg>
      );
    case 'trash':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Polyline points="3,6 5,6 21,6" stroke={color} strokeWidth={2} {...common} />
          <Path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" stroke={color} strokeWidth={2} {...common} />
          <Path d="M10 11v6" stroke={color} strokeWidth={2} {...common} />
          <Path d="M14 11v6" stroke={color} strokeWidth={2} {...common} />
          <Path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" stroke={color} strokeWidth={2} {...common} />
        </Svg>
      );
    case 'edit':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke={color} strokeWidth={2} {...common} />
          <Path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke={color} strokeWidth={2} {...common} />
        </Svg>
      );
    case 'search':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Circle cx="11" cy="11" r="8" stroke={color} strokeWidth={2} {...common} />
          <Line x1="21" y1="21" x2="16.65" y2="16.65" stroke={color} strokeWidth={2} {...common} />
        </Svg>
      );
    case 'logout':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke={color} strokeWidth={2} {...common} />
          <Polyline points="16,17 21,12 16,7" stroke={color} strokeWidth={2} {...common} />
          <Line x1="21" y1="12" x2="9" y2="12" stroke={color} strokeWidth={2} {...common} />
        </Svg>
      );
    case 'alert':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke={color} strokeWidth={2} {...common} />
          <Line x1="12" y1="9" x2="12" y2="13" stroke={color} strokeWidth={2} {...common} />
          <Line x1="12" y1="17" x2="12.01" y2="17" stroke={color} strokeWidth={2} {...common} />
        </Svg>
      );
    case 'check':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Polyline points="20,6 9,17 4,12" stroke={color} strokeWidth={2.5} {...common} />
        </Svg>
      );
    case 'print':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Polyline points="6,9 6,2 18,2 18,9" stroke={color} strokeWidth={2} {...common} />
          <Path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" stroke={color} strokeWidth={2} {...common} />
          <Rect x="6" y="14" width="12" height="8" stroke={color} strokeWidth={2} {...common} />
        </Svg>
      );
    case 'eye':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke={color} strokeWidth={2} {...common} />
          <Circle cx="12" cy="12" r="3" stroke={color} strokeWidth={2} {...common} />
        </Svg>
      );
    case 'close':
    case 'x':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Line x1="18" y1="6" x2="6" y2="18" stroke={color} strokeWidth={2.5} strokeLinecap="round" />
          <Line x1="6" y1="6" x2="18" y2="18" stroke={color} strokeWidth={2.5} strokeLinecap="round" />
        </Svg>
      );
    case 'trend_up':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Polyline points="23,6 13.5,15.5 8.5,10.5 1,18" stroke={color} strokeWidth={2} {...common} />
          <Polyline points="17,6 23,6 23,12" stroke={color} strokeWidth={2} {...common} />
        </Svg>
      );
    case 'cart':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Circle cx="9" cy="21" r="1" stroke={color} strokeWidth={2} {...common} />
          <Circle cx="20" cy="21" r="1" stroke={color} strokeWidth={2} {...common} />
          <Path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" stroke={color} strokeWidth={2} {...common} />
        </Svg>
      );
    case 'minus':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Line x1="5" y1="12" x2="19" y2="12" stroke={color} strokeWidth={2.5} strokeLinecap="round" />
        </Svg>
      );
    case 'refresh':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Polyline points="23 4 23 10 17 10" stroke={color} strokeWidth={2} {...common} />
          <Path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" stroke={color} strokeWidth={2} {...common} />
        </Svg>
      );
    case 'cierre':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Rect x="2" y="3" width="20" height="14" rx="2" stroke={color} strokeWidth={2} {...common} />
          <Path d="M8 21h8" stroke={color} strokeWidth={2} {...common} />
          <Path d="M12 17v4" stroke={color} strokeWidth={2} {...common} />
          <Path d="M7 8h4m-4 4h2" stroke={color} strokeWidth={2} {...common} />
          <Circle cx="17" cy="10" r="2" stroke={color} strokeWidth={2} {...common} />
          <Path d="M17 8v-1m0 5v1m-2-3H14m6 0h-1" stroke={color} strokeWidth={2} {...common} />
        </Svg>
      );
    case 'transferencias':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M17 3l4 4-4 4" stroke={color} strokeWidth={2} {...common} />
          <Path d="M3 11V9a4 4 0 0 1 4-4h14" stroke={color} strokeWidth={2} {...common} />
          <Path d="M7 21l-4-4 4-4" stroke={color} strokeWidth={2} {...common} />
          <Path d="M21 13v2a4 4 0 0 1-4 4H3" stroke={color} strokeWidth={2} {...common} />
        </Svg>
      );
    case 'auditoria':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M9 11l3 3L22 4" stroke={color} strokeWidth={2} {...common} />
          <Path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" stroke={color} strokeWidth={2} {...common} />
        </Svg>
      );
    case 'warehouse':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M3 21V10l9-6 9 6v11" stroke={color} strokeWidth={2} {...common} />
          <Path d="M3 10h18" stroke={color} strokeWidth={2} {...common} />
          <Path d="M9 21v-6h6v6" stroke={color} strokeWidth={2} {...common} />
        </Svg>
      );
    // Caja registradora: la pantalla de entradas y salidas de dinero. No existía
    // y se reusaba 'contabilidad', que ya está en pantalla a la vez y hace que
    // el menú no diga nada sobre adónde lleva.
    case 'cash':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Rect x="2" y="6" width="20" height="12" rx="2" stroke={color} strokeWidth={2} {...common} />
          <Path d="M6 10h.01" stroke={color} strokeWidth={2} {...common} />
          <Circle cx="12" cy="12" r="2.2" stroke={color} strokeWidth={2} {...common} />
          <Path d="M18 10h.01" stroke={color} strokeWidth={2} {...common} />
          <Path d="M4 3h16" stroke={color} strokeWidth={2} {...common} />
        </Svg>
      );

    // ── Los 16 que faltaban, con el path EXACTO de la web ────────────────
    // Copiados carácter a carácter de CubaGest-Web/src/components/shared/
    // Icon.tsx: mismo viewBox, mismo strokeWidth, mismos cap/join. Un icono
    // dibujado a ojo es un icono que ya no se parece al de la web, que es
    // justo lo que este archivo existe para evitar.
    case 'arrow_left':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Line x1={19} y1={12} x2={5} y2={12} stroke={color} strokeWidth={2} {...common} />
          <Polyline points="12 19 5 12 12 5" stroke={color} strokeWidth={2} {...common} />
        </Svg>
      );
    case 'bell':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" stroke={color} strokeWidth={2} {...common} />
          <Path d="M13.73 21a2 2 0 0 1-3.46 0" stroke={color} strokeWidth={2} {...common} />
        </Svg>
      );
    case 'building':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Rect x={3} y={3} width={18} height={18} rx={1} stroke={color} strokeWidth={2} {...common} />
          <Line x1={7} y1={7} x2={7} y2={7} stroke={color} strokeWidth={2} {...common} />
          <Line x1={12} y1={7} x2={12} y2={7} stroke={color} strokeWidth={2} {...common} />
          <Line x1={17} y1={7} x2={17} y2={7} stroke={color} strokeWidth={2} {...common} />
          <Line x1={7} y1={12} x2={7} y2={12} stroke={color} strokeWidth={2} {...common} />
          <Line x1={12} y1={12} x2={12} y2={12} stroke={color} strokeWidth={2} {...common} />
          <Line x1={17} y1={12} x2={17} y2={12} stroke={color} strokeWidth={2} {...common} />
          <Path d="M7 21v-4h4v4m2 0v-7h4v7" stroke={color} strokeWidth={2} {...common} />
        </Svg>
      );
    case 'clipboard':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Rect x={5} y={4} width={14} height={17} rx={2} stroke={color} strokeWidth={2} {...common} />
          <Rect x={9} y={2} width={6} height={4} rx={1} stroke={color} strokeWidth={2} {...common} />
          <Line x1={8} y1={10} x2={16} y2={10} stroke={color} strokeWidth={2} {...common} />
          <Line x1={8} y1={14} x2={16} y2={14} stroke={color} strokeWidth={2} {...common} />
          <Line x1={8} y1={18} x2={13} y2={18} stroke={color} strokeWidth={2} {...common} />
        </Svg>
      );
    case 'clock':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={2} {...common} />
          <Polyline points="12 7 12 12 15 14" stroke={color} strokeWidth={2} {...common} />
        </Svg>
      );
    case 'credit_card':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Rect x={2} y={5} width={20} height={14} rx={2} stroke={color} strokeWidth={2} {...common} />
          <Line x1={2} y1={10} x2={22} y2={10} stroke={color} strokeWidth={2} {...common} />
          <Line x1={6} y1={15} x2={10} y2={15} stroke={color} strokeWidth={2} {...common} />
        </Svg>
      );
    case 'gift':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Rect x={3} y={8} width={18} height={13} rx={2} stroke={color} strokeWidth={2} {...common} />
          <Line x1={12} y1={8} x2={12} y2={21} stroke={color} strokeWidth={2} {...common} />
          <Line x1={3} y1={12} x2={21} y2={12} stroke={color} strokeWidth={2} {...common} />
          <Path d="M12 8H7.5a2.5 2.5 0 1 1 2.5-2.5C10 7 12 8 12 8z" stroke={color} strokeWidth={2} {...common} />
          <Path d="M12 8h4.5a2.5 2.5 0 1 0-2.5-2.5C14 7 12 8 12 8z" stroke={color} strokeWidth={2} {...common} />
        </Svg>
      );
    case 'link':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M10 13a5 5 0 0 0 7.07.07l2-2a5 5 0 0 0-7.07-7.07l-1.14 1.14" stroke={color} strokeWidth={2} {...common} />
          <Path d="M14 11a5 5 0 0 0-7.07-.07l-2 2A5 5 0 0 0 12 20l1.14-1.14" stroke={color} strokeWidth={2} {...common} />
          <Line x1={8} y1={16} x2={16} y2={8} stroke={color} strokeWidth={2} {...common} />
        </Svg>
      );
    case 'lock':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Rect x={4} y={10} width={16} height={11} rx={2} stroke={color} strokeWidth={2} {...common} />
          <Path d="M8 10V7a4 4 0 0 1 8 0v3" stroke={color} strokeWidth={2} {...common} />
        </Svg>
      );
    case 'mail':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Rect x={3} y={5} width={18} height={14} rx={2} stroke={color} strokeWidth={2} {...common} />
          <Polyline points="3 7 12 13 21 7" stroke={color} strokeWidth={2} {...common} />
        </Svg>
      );
    case 'message':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M21 11.5a8.38 8.38 0 0 1-9 8.5 8.5 8.5 0 0 1-5.3-1.85L3 20l1.85-3.7A8.38 8.38 0 0 1 3 11.5a8.5 8.5 0 0 1 17.99 0z" stroke={color} strokeWidth={2} {...common} />
        </Svg>
      );
    case 'moon':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M21 12.8A8.5 8.5 0 1 1 11.2 3 6.5 6.5 0 0 0 21 12.8z" stroke={color} strokeWidth={2} {...common} />
        </Svg>
      );
    case 'settings':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Circle cx={12} cy={12} r={3} stroke={color} strokeWidth={2} {...common} />
          <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" stroke={color} strokeWidth={2} {...common} />
        </Svg>
      );
    case 'shield':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke={color} strokeWidth={2} {...common} />
          <Polyline points="9 12 11 14 15 10" stroke={color} strokeWidth={2} {...common} />
        </Svg>
      );
    case 'sun':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Circle cx={12} cy={12} r={4} stroke={color} strokeWidth={2} {...common} />
          <Line x1={12} y1={2} x2={12} y2={5} stroke={color} strokeWidth={2} {...common} />
          <Line x1={12} y1={19} x2={12} y2={22} stroke={color} strokeWidth={2} {...common} />
          <Line x1={4.93} y1={4.93} x2={7.76} y2={7.76} stroke={color} strokeWidth={2} {...common} />
          <Line x1={16.24} y1={16.24} x2={19.07} y2={19.07} stroke={color} strokeWidth={2} {...common} />
          <Line x1={2} y1={12} x2={5} y2={12} stroke={color} strokeWidth={2} {...common} />
          <Line x1={19} y1={12} x2={22} y2={12} stroke={color} strokeWidth={2} {...common} />
          <Line x1={4.93} y1={19.07} x2={7.76} y2={16.24} stroke={color} strokeWidth={2} {...common} />
          <Line x1={16.24} y1={7.76} x2={19.07} y2={4.93} stroke={color} strokeWidth={2} {...common} />
        </Svg>
      );
    case 'zap':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" stroke={color} strokeWidth={2} {...common} />
        </Svg>
      );
    default:
      // Con el tipado cerrado esto ya no se puede escribir sin error de
      // compilación, así que llegar aquí significa un dato que llega de
      //en tiempo de ejecución (un nombre guardado, una API nueva) y no un
      // descuido. Por eso
      // avisa en vez de desaparecer en silencio: un icono que no se ve es el
      // fallo más difícil de detectar de los que hay en una pantalla.
      if (__DEV__) {
        console.warn(`[Icon] nombre desconocido: "${name}". Añádelo al union IconName y a su case.`);
      }
      return null;
  }
};

export default Icon;
