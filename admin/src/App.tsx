import React from 'react';
import { Box, Chip, Tab, Tabs } from '@mui/material';
import { TuneOutlined as TuneOutlinedIcon } from '@mui/icons-material';
import { GenericApp, I18n, Loader, Logo } from '@iobroker/adapter-react-v5';
import type { GenericAppProps, GenericAppSettings, GenericAppState } from '@iobroker/adapter-react-v5';

import ResidentTable from './components/ResidentTable';
import type { ResidentEntry } from './components/ResidentTable';
import SettingsTab from './components/SettingsTab';
import type { SettingsNative } from './components/SettingsTab';

import enI18n from './i18n/en.json';
import deI18n from './i18n/de.json';
import ruI18n from './i18n/ru.json';
import ptI18n from './i18n/pt.json';
import nlI18n from './i18n/nl.json';
import frI18n from './i18n/fr.json';
import itI18n from './i18n/it.json';
import esI18n from './i18n/es.json';
import plI18n from './i18n/pl.json';
import ukI18n from './i18n/uk.json';
import zhCnI18n from './i18n/zh-cn.json';

interface TabPanelProps {
    children: React.ReactNode;
    currentTab: string;
    value: string;
}

const TabPanel: React.FC<TabPanelProps> = ({ children, currentTab, value }) =>
    currentTab === value ? <Box sx={{ pt: 2 }}>{children}</Box> : null;

interface AppNative extends SettingsNative {
    roomie: ResidentEntry[];
    guest: ResidentEntry[];
    pet: ResidentEntry[];
}

/** Main application component for the residents adapter admin UI */
class App extends GenericApp<GenericAppProps, GenericAppState> {
    /** @param props - Component properties passed by GenericApp */
    constructor(props: GenericAppProps) {
        const extendedProps: GenericAppSettings = {
            ...props,
            encryptedFields: [],
            translations: {
                en: enI18n,
                de: deI18n,
                ru: ruI18n,
                pt: ptI18n,
                nl: nlI18n,
                fr: frI18n,
                it: itI18n,
                es: esI18n,
                pl: plI18n,
                uk: ukI18n,
                'zh-cn': zhCnI18n,
            },
        };
        super(props, extendedProps);
    }

    /** Called when the ioBroker connection is ready */
    onConnectionReady(): void {
        // executed when connection is ready
    }

    /**
     * Validates settings before saving and shows an error toast if invalid.
     *
     * @param settings - The current adapter configuration values
     */
    onPrepareSave(settings: Record<string, any>): boolean {
        const hasIncompleteResident = (['roomie', 'guest', 'pet'] as const).some(
            key => Array.isArray(settings[key]) && settings[key].some((r: { name?: string }) => !r.name?.trim()),
        );
        const hasIncompleteActivity =
            Array.isArray(settings.activityStates) &&
            settings.activityStates.some((r: { id?: number | null }) => r.id == null);
        const hasIncompleteFocus =
            Array.isArray(settings.customFocusStates) &&
            settings.customFocusStates.some((r: { text?: string }) => !r.text?.trim());
        const hasInvalidDeviceName = (['roomie', 'guest', 'pet'] as const).some(
            key =>
                Array.isArray(settings[key]) &&
                settings[key].some((r: { id?: string }) => r.id && !/^[a-zA-Z0-9_]+$/.test(r.id)),
        );
        const hasDuplicateDeviceName = (['roomie', 'guest', 'pet'] as const).some(key => {
            if (!Array.isArray(settings[key])) {
                return false;
            }
            const nonEmptyIds: string[] = settings[key]
                .map((r: { id?: string }) => r.id)
                .filter((id: string | undefined): id is string => Boolean(id));
            return nonEmptyIds.some((id, i) => nonEmptyIds.indexOf(id) !== i);
        });

        const hasInvalidTimer =
            (settings.disableAbsentResidentsDailyTimerEnabled &&
                settings.disableAbsentResidentsDailyTimer &&
                !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(settings.disableAbsentResidentsDailyTimer)) ||
            (settings.resetOvernightDailyTimerEnabled &&
                settings.resetOvernightDailyTimer &&
                !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(settings.resetOvernightDailyTimer));

        if (
            hasIncompleteResident ||
            hasIncompleteActivity ||
            hasIncompleteFocus ||
            hasInvalidDeviceName ||
            hasDuplicateDeviceName ||
            hasInvalidTimer
        ) {
            const msg = I18n.t('Please complete all required fields before saving.');
            this.setConfigurationError(msg);
            this.showToast(msg);
            return false;
        }
        this.setConfigurationError('');
        return true;
    }

    /** Renders the admin UI */
    render(): React.JSX.Element {
        if (!this.state.loaded) {
            return <Loader themeType={this.state.themeType} />;
        }

        const native = this.state.native as AppNative;
        const selectedTab = this.state.selectedTab;
        const currentTab = selectedTab || 'roomies';

        return (
            <div
                className="App"
                style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
            >
                <Box sx={this.state.themeType === 'dark' ? { '& img': { filter: 'invert(1)' } } : undefined}>
                    <Logo
                        instance={this.instance}
                        common={this.common ?? {}}
                        native={this.state.native}
                        onError={text => this.setConfigurationError(text)}
                        onLoad={native => this.onLoadConfig(native)}
                    />
                </Box>
                {/* Tabs */}
                <Tabs
                    value={currentTab}
                    onChange={(_e, val: string) => this.selectTab(val)}
                    sx={{ flexShrink: 0, borderBottom: 1, borderColor: 'divider' }}
                    variant="scrollable"
                    scrollButtons="auto"
                >
                    <Tab
                        value="roomies"
                        label={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <img
                                    src="roomie.svg"
                                    alt=""
                                    style={{
                                        height: 20,
                                        width: 20,
                                        filter: this.state.themeType === 'dark' ? 'invert(1)' : undefined,
                                    }}
                                    onError={e => {
                                        (e.target as HTMLImageElement).style.display = 'none';
                                    }}
                                />
                                {I18n.t('Roomies')}
                                <Chip
                                    label={native.roomie?.length ?? 0}
                                    size="small"
                                    variant="outlined"
                                    sx={{
                                        height: 18,
                                        minWidth: 22,
                                        fontSize: '0.65rem',
                                        ml: 0.25,
                                        pointerEvents: 'none',
                                    }}
                                />
                            </Box>
                        }
                    />
                    <Tab
                        value="guests"
                        label={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <img
                                    src="guest.svg"
                                    alt=""
                                    style={{
                                        height: 20,
                                        width: 20,
                                        filter: this.state.themeType === 'dark' ? 'invert(1)' : undefined,
                                    }}
                                    onError={e => {
                                        (e.target as HTMLImageElement).style.display = 'none';
                                    }}
                                />
                                {I18n.t('Guests')}
                                <Chip
                                    label={native.guest?.length ?? 0}
                                    size="small"
                                    variant="outlined"
                                    sx={{
                                        height: 18,
                                        minWidth: 22,
                                        fontSize: '0.65rem',
                                        ml: 0.25,
                                        pointerEvents: 'none',
                                    }}
                                />
                            </Box>
                        }
                    />
                    <Tab
                        value="pets"
                        label={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <img
                                    src="pet.svg"
                                    alt=""
                                    style={{
                                        height: 20,
                                        width: 20,
                                        filter: this.state.themeType === 'dark' ? 'invert(1)' : undefined,
                                    }}
                                    onError={e => {
                                        (e.target as HTMLImageElement).style.display = 'none';
                                    }}
                                />
                                {I18n.t('Pets')}
                                <Chip
                                    label={native.pet?.length ?? 0}
                                    size="small"
                                    variant="outlined"
                                    sx={{
                                        height: 18,
                                        minWidth: 22,
                                        fontSize: '0.65rem',
                                        ml: 0.25,
                                        pointerEvents: 'none',
                                    }}
                                />
                            </Box>
                        }
                    />
                    <Tab
                        value="settings"
                        label={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <TuneOutlinedIcon sx={{ fontSize: 20 }} />
                                {I18n.t('Settings')}
                            </Box>
                        }
                    />
                </Tabs>

                {/* Tab content */}
                <Box sx={{ p: 2, overflow: 'auto', flex: 1 }}>
                    <TabPanel
                        currentTab={currentTab}
                        value="roomies"
                    >
                        <ResidentTable
                            type="roomie"
                            residents={native.roomie ?? []}
                            onChange={residents => this.updateNativeValue('roomie', residents)}
                            socket={this.socket}
                            theme={this.state.theme}
                            themeType={this.state.themeType}
                            themeName={this.state.themeName}
                        />
                    </TabPanel>

                    <TabPanel
                        currentTab={currentTab}
                        value="guests"
                    >
                        <ResidentTable
                            type="guest"
                            residents={native.guest ?? []}
                            onChange={residents => this.updateNativeValue('guest', residents)}
                            socket={this.socket}
                            theme={this.state.theme}
                            themeType={this.state.themeType}
                            themeName={this.state.themeName}
                        />
                    </TabPanel>

                    <TabPanel
                        currentTab={currentTab}
                        value="pets"
                    >
                        <ResidentTable
                            type="pet"
                            residents={native.pet ?? []}
                            onChange={residents => this.updateNativeValue('pet', residents)}
                            socket={this.socket}
                            theme={this.state.theme}
                            themeType={this.state.themeType}
                            themeName={this.state.themeName}
                        />
                    </TabPanel>

                    <TabPanel
                        currentTab={currentTab}
                        value="settings"
                    >
                        <SettingsTab
                            native={native}
                            onChange={(attr, value) => this.updateNativeValue(attr, value)}
                            socket={this.socket}
                            instance={`${this.adapterName}.${this.instance}`}
                        />
                    </TabPanel>
                </Box>

                {this.renderError()}
                {this.renderToast()}
                {this.renderSaveCloseButtons()}
            </div>
        );
    }
}

export default App;
