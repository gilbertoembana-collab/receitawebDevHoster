import { createTheme } from '@mui/material/styles';

export const getCustomTheme = (darkMode: boolean) => {
  return createTheme({
    palette: {
      mode: darkMode ? 'dark' : 'light',
      primary: {
        main: '#0B4EA2', // Azul Institucional
        light: '#3C7DCF',
        dark: '#07336D',
        contrastText: '#ffffff',
      },
      secondary: {
        main: '#28A745', // Verde
        light: '#5AD375',
        dark: '#1B732F',
        contrastText: '#ffffff',
      },
      background: {
        default: darkMode ? '#0e1726' : '#f8fafc',
        paper: darkMode ? '#151f32' : '#ffffff',
      },
      text: {
        primary: darkMode ? '#f1f5f9' : '#1e293b',
        secondary: darkMode ? '#94a3b8' : '#64748b',
      },
      divider: darkMode ? '#1e293b' : '#e2e8f0',
    },
    typography: {
      fontFamily: '"Inter", "Helvetica", "Arial", sans-serif',
      h1: {
        fontSize: '2rem',
        fontWeight: 600,
        letterSpacing: '-0.025em',
      },
      h2: {
        fontSize: '1.5rem',
        fontWeight: 600,
        letterSpacing: '-0.021em',
      },
      h3: {
        fontSize: '1.25rem',
        fontWeight: 600,
      },
      h4: {
        fontSize: '1.1rem',
        fontWeight: 600,
      },
      h5: {
        fontSize: '1rem',
        fontWeight: 600,
      },
      h6: {
        fontSize: '0.875rem',
        fontWeight: 600,
      },
      body1: {
        fontSize: '0.875rem',
        lineHeight: 1.5,
      },
      body2: {
        fontSize: '0.75rem',
        lineHeight: 1.4,
      },
      button: {
        textTransform: 'none',
        fontWeight: 500,
        fontSize: '0.875rem',
      },
      fontFamilyMono: '"JetBrains Mono", "Fira Code", monospace',
    } as any,
    components: {
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            padding: '6px 16px',
            boxShadow: 'none',
            '&:hover': {
              boxShadow: 'none',
            },
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            border: darkMode ? '1px solid #1e293b' : '1px solid #f1f5f9',
            boxShadow: darkMode 
              ? '0 4px 6px -1px rgba(0, 0, 0, 0.5), 0 2px 4px -1px rgba(0, 0, 0, 0.5)'
              : '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px 0 rgba(0, 0, 0, 0.03)',
            backgroundImage: 'none',
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          head: {
            fontWeight: 600,
            backgroundColor: darkMode ? '#151f32' : '#f8fafc',
            color: darkMode ? '#94a3b8' : '#64748b',
          },
          root: {
            padding: '12px 16px',
          },
        },
      },
    },
  });
};
