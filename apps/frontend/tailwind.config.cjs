/** @type {import('tailwindcss').Config} */

/*
 * Sistema de color de Maldonado.
 *
 * Los tres colores base salen del lugar y no de la escala por defecto de
 * Tailwind: el azul profundo del Atlántico como tinta, la arena de la costa
 * como fondo y el coral del atardecer sobre la bahía como único acento.
 *
 * `primary` y `secondary` quedan apuntando a coral y mar para que las
 * pantallas que todavía no se rehicieron sigan dentro de la paleta en vez de
 * mostrar el índigo viejo.
 */

const coral = {
  50: '#FCEBE6',
  100: '#F8D5CB',
  200: '#F1AC98',
  300: '#EA8265',
  400: '#E36246',
  500: '#DC4227',
  600: '#C4381F',
  700: '#A32D17',
  800: '#7E2312',
  900: '#5A190D',
  950: '#330E07',
};

const sea = {
  50: '#E2F0F0',
  100: '#C2E0E2',
  200: '#8AC4C8',
  300: '#52A8AE',
  400: '#2A9099',
  500: '#0E7C86',
  600: '#0B6670',
  700: '#09515A',
  800: '#063C43',
  900: '#04282D',
  950: '#021619',
};

module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        border: '#E3DACC',

        // Tinta: el azul del Atlántico. Reemplaza a los grises neutros.
        ink: {
          50: '#F1F4F7',
          100: '#E1E7EC',
          200: '#C4CDD6',
          300: '#93A2B0',
          400: '#6E7D8E',
          500: '#556676',
          600: '#3D5063',
          700: '#2A3E52',
          800: '#1A2D3F',
          900: '#0B1F33',
          950: '#08131E',
        },

        // Arena: los fondos y las divisiones.
        sand: {
          50: '#FAF7F2',
          100: '#F3EEE6',
          200: '#E9E2D6',
          300: '#E3DACC',
          400: '#CFC3B0',
          500: '#B8A88F',
        },

        coral,
        sea,

        // Alias de compatibilidad para las pantallas todavía sin rehacer.
        primary: coral,
        secondary: sea,

        // Color semántico. Va sobre datos que cambian, nunca como acento.
        live: {
          DEFAULT: '#137F58',
          soft: '#E3F2EB',
          dot: '#17A46F',
        },
        warn: {
          DEFAULT: '#A96E10',
          soft: '#F9EFDC',
        },
        crit: {
          DEFAULT: '#BC3B24',
          soft: '#FBE9E5',
        },
      },

      fontFamily: {
        // Archivo es una grotesca de señalética: aguanta pesos altos sin
        // ensuciarse y tiene números tabulares limpios, que es lo que más se
        // lee acá (minutos, horarios, números de línea).
        sans: [
          'Archivo',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'sans-serif',
        ],
      },

      fontSize: {
        // Escala de la app. La jerarquía se hace con peso y tamaño, no
        // cambiando de familia.
        label: ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.1em', fontWeight: '700' }],
        data: ['0.8125rem', { lineHeight: '1.15rem', fontWeight: '600' }],
        display: ['1.75rem', { lineHeight: '1.1', letterSpacing: '-0.035em', fontWeight: '800' }],
      },

      borderRadius: {
        // El radio comunica la jerarquía del contenedor.
        chip: '0.375rem',
        card: '0.875rem',
        sheet: '1.25rem',
      },

      boxShadow: {
        // Sombras azuladas, no negras: sobre fondo arena el negro ensucia.
        card: '0 1px 2px rgba(11,31,51,0.05)',
        float: '0 4px 16px -6px rgba(11,31,51,0.28)',
        sheet: '0 -8px 28px -14px rgba(11,31,51,0.35)',
      },

      screens: {
        xs: '360px',
        sm: '430px',
        md: '768px',
        lg: '1024px',
        xl: '1280px',
        '2xl': '1536px',
      },

      spacing: {
        safe: 'env(safe-area-inset-bottom)',
      },

      minHeight: {
        screen: ['100vh', '100dvh'],
      },

      maxHeight: {
        screen: ['100vh', '100dvh'],
      },

      transitionTimingFunction: {
        out: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },

      keyframes: {
        'pulse-dot': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.35', transform: 'scale(0.7)' },
        },
        'sheet-up': {
          from: { transform: 'translateY(12px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
      },

      animation: {
        'pulse-dot': 'pulse-dot 1.9s ease-in-out infinite',
        'sheet-up': 'sheet-up 320ms cubic-bezier(0.16, 1, 0.3, 1)',
        'fade-in': 'fade-in 200ms cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
};
