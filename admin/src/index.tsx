import React from 'react';
import { createRoot } from 'react-dom/client';
import { Utils, Theme } from '@iobroker/adapter-react-v5';
import type { ThemeName } from '@iobroker/adapter-react-v5';
import { ThemeProvider, StyledEngineProvider } from '@mui/material/styles';
import App from './App';

let themeName = Utils.getThemeName();

function build(): void {
    const container = document.getElementById('root');
    if (!container) {
        return;
    }
    const root = createRoot(container);
    root.render(
        <StyledEngineProvider injectFirst>
            <ThemeProvider theme={Theme(themeName)}>
                <App
                    adapterName="residents"
                    onThemeChange={(_theme: ThemeName) => {
                        themeName = _theme;
                        build();
                    }}
                />
            </ThemeProvider>
        </StyledEngineProvider>,
    );
}

build();
