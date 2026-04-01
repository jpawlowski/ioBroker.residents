import React, { useEffect, useMemo, useState } from 'react';
import {
    Accordion,
    AccordionDetails,
    AccordionSummary,
    Autocomplete,
    Box,
    Button,
    Checkbox,
    Chip,
    FormControl,
    FormControlLabel,
    IconButton,
    InputLabel,
    MenuItem,
    Select,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import {
    AccessTime as AccessTimeIcon,
    Add as AddIcon,
    Clear as ClearIcon,
    Delete as DeleteIcon,
    ExpandMore as ExpandMoreIcon,
    InfoOutlined as InfoOutlinedIcon,
} from '@mui/icons-material';
import { DialogSimpleCron, I18n } from '@iobroker/adapter-react-v5';
import type { AdminConnection } from '@iobroker/socket-client';

interface IconTextEntry {
    icon: string;
    text: string;
}

interface ActivityEntry {
    id: number | string | null;
    icon: string;
    text: string;
}

interface FocusEntry {
    enabled: boolean;
    icon: string;
    text: string;
    dnd: boolean;
    home: boolean;
    away: boolean;
}

export interface SettingsNative {
    language: string;
    stateTranslations: IconTextEntry[];
    residentialStates: IconTextEntry[];
    moodStates: IconTextEntry[];
    activityStates: ActivityEntry[];
    focusStates: FocusEntry[];
    customFocusStates: FocusEntry[];
    disableAbsentResidentsDailyTimerEnabled: boolean;
    disableAbsentResidentsDailyTimer: string;
    resetOvernightDailyTimerEnabled: boolean;
    resetOvernightDailyTimer: string;
    residentsParentInstanceIDs: string | string[];
}

interface SettingsTabProps {
    native: SettingsNative;
    onChange: (attr: string, value: unknown) => void;
    socket: AdminConnection;
    instance: string;
}

type DefaultEntry = { icon: string; text: string };
type FocusDefaultEntry = { icon: string; text: string; enabled: boolean; dnd: boolean; home: boolean; away: boolean };
type LangMap = Record<string, string>;

const STATE_OFF_TEXTS: LangMap = {
    en: 'Off',
    de: 'Aus',
    ru: 'С сайта',
    pt: 'Desligado',
    nl: 'Uit',
    fr: 'Désactivé',
    it: 'Spento',
    es: 'Apagado',
    pl: 'Wył.',
    uk: 'Вимкнено',
    'zh-cn': '关掉了',
};
const STATE_NOBODY_TEXTS: LangMap = {
    en: 'Nobody',
    de: 'Niemand',
    ru: 'Никого',
    pt: 'Ninguém',
    nl: 'Niemand',
    fr: 'Personne',
    it: 'Nessuno',
    es: 'Nadie',
    pl: 'Nikt',
    uk: 'Нікого',
    'zh-cn': '没有人',
};

const STATE_ROOMIE_TEXTS: LangMap = {
    en: 'Roomie',
    de: 'Mitbewohner',
    ru: 'Сосед',
    pt: 'Colega de quarto',
    nl: 'Huisgenoot',
    fr: 'Colocataire',
    it: 'Coinquilino',
    es: 'Compañero',
    pl: 'Współlokator',
    uk: 'Сусід',
    'zh-cn': '室友',
};
const STATE_GUEST_TEXTS: LangMap = {
    en: 'Guest',
    de: 'Gast',
    ru: 'Гость',
    pt: 'Convidado',
    nl: 'Gast',
    fr: 'Invité',
    it: 'Ospite',
    es: 'Invitado',
    pl: 'Gość',
    uk: 'Гість',
    'zh-cn': '客人',
};
const STATE_PET_TEXTS: LangMap = {
    en: 'Pet',
    de: 'Haustier',
    ru: 'Питомец',
    pt: 'Mascote',
    nl: 'Huisdier',
    fr: 'Animal',
    it: 'Animale',
    es: 'Mascota',
    pl: 'Zwierzę',
    uk: 'Тварина',
    'zh-cn': '宠物',
};

const RESIDENTIAL_TEXTS: Record<string, string[]> = {
    en: [
        'Extended Absence',
        'Away',
        'Pet Care',
        'Way Home',
        'Home',
        'Do Not Disturb',
        'Wind Down',
        'Bedtime',
        'Got Up',
        'Night Walk',
        'Wake Up',
        'Night',
    ],
    de: [
        'Längere Abwesenheit',
        'Abwesend',
        'Haustierpflege',
        'Nachhauseweg',
        'zu Hause',
        'Nicht stören',
        'Entspannen',
        'Schlafenszeit',
        'Aufgestanden',
        'Nachtwanderung',
        'Aufwecken',
        'Nacht',
    ],
    ru: [
        'Расширенное отсутствие',
        'Вдали',
        'Уход за домашними животными',
        'Путь домой',
        'дома',
        'Не беспокоить',
        'Расслабьтесь',
        'Время сна',
        'Запущен и работает',
        'Ночной поход',
        'Проснись',
        'Ночь',
    ],
    pt: [
        'Ausência estendida',
        'A caminho',
        'Pet Care',
        'Caminho',
        'Em casa',
        'Não Perturbar',
        'Relaxe',
        'Hora de dormir',
        'Em funcionamento',
        'Caminhada nocturna',
        'Acorda',
        'Noite',
    ],
    nl: [
        'Verlengde Absence',
        'Weg',
        'Huisdier thuis',
        'Naar huis',
        'Thuis',
        'Niet Storen',
        'Relax',
        'Bedtijd',
        'Op',
        'Nachtwandeling',
        'Wakker worden',
        'Nacht',
    ],
    fr: [
        'Absence prolongée',
        'Absent',
        'Soins pour animaux',
        'Chemin de retour',
        'Chez soi',
        'Ne pas déranger',
        'Détendre',
        'Heure du coucher',
        'Levé',
        'Marche de nuit',
        'Réveil',
        'Nuit',
    ],
    it: [
        'Assenza estesa',
        'Via',
        'Cura degli animali',
        'Via di casa',
        'A casa',
        'Non disturbare',
        'Rilassarsi',
        'Ora di dormire',
        'Alzati',
        'Passeggiata notturna',
        'Svegliarsi',
        'Notte',
    ],
    es: [
        'Ausencia ampliada',
        'Fuera de casa',
        'Cuidado de mascotas',
        'Camino a casa',
        'En casa',
        'No molestar',
        'Relax',
        'Hora de dormir',
        'Levantó',
        'Paseo nocturno',
        'Despierta',
        'Noche',
    ],
    pl: [
        'Długość nieobecności',
        'Away',
        'Pet Care',
        'Strona domowa',
        'W domu',
        'Nie przeszkadzać',
        'Relaks',
        'Dobranoc',
        'W górę',
        'Nocny spacer',
        'Obudź się',
        'Noc',
    ],
    uk: [
        'Розширена абсенція',
        'Проживання',
        'Сімейний догляд за домашніми тваринами',
        'Головна',
        'вдома',
        'Не турбувати',
        'розслабитися',
        'Час спати',
        'Встала',
        'Нічна прогулянка',
        'Прокинься.',
        'Ніч',
    ],
    'zh-cn': [
        '缺点',
        'A. 公路',
        '家庭护理',
        'B. 家庭办法',
        '在家',
        '请勿打扰',
        '缩减',
        '就寝时间',
        '起床了',
        '夜行',
        '唤醒',
        '夜间',
    ],
};

const MOOD_TEXTS: Record<string, string[]> = {
    en: [
        "Couldn't Get Worse",
        'Extraordinary Bad',
        'Extremely Bad',
        'Pretty Bad',
        'Somewhat Not Good',
        'Balanced',
        'Somewhat Okay',
        'Pretty Good',
        'Extremely Good',
        'Extraordinary Good',
        "Couldn't Be Better",
    ],
    de: [
        'Könnte nicht schlimmer werden',
        'Außerordentlich schlecht',
        'Äußerst schlecht',
        'Ziemlich schlecht',
        'Nicht so gut',
        'Ausgeglichen',
        'Einigermaßen okay',
        'Ziemlich gut',
        'Sehr gut',
        'Außerordentlich gut',
        'Könnte nicht besser sein',
    ],
    ru: [
        'Не могли бы получить Worse',
        'Необычный Плохо',
        'Чрезвычайно плохо',
        'Очень плохо',
        'Что-то не хорошо',
        'сбалансированный',
        'Немного хорошо',
        'Довольно хорошо',
        'Чрезвычайно хорошо',
        'Необычный Хорошо',
        'Не может быть лучше',
    ],
    pt: [
        'Não consegui ficar pior',
        'Mau Extraordinário',
        'Extremamente mau',
        'Muito mau',
        'Não é bom',
        'Equilibrado',
        'Alguma coisa bem',
        'Muito bem',
        'Extremamente bom',
        'Bem Extraordinário',
        'Não podia ser melhor',
    ],
    nl: [
        'Kon Worse niet krijgen',
        'Buitengewoon slecht',
        'Extreem slecht',
        'Best',
        'Enigszins',
        'Gebalanceerd',
        'Enigszins oké',
        'Mooi',
        'Extreem goed',
        'Buitengewoon goed',
        'Kon niet beter',
    ],
    fr: [
        'Ça ne pourrait pas être pire',
        'Extraordinairement mauvais',
        'Extrêmement mauvais',
        'Pas mal',
        "C'est pas bon",
        'Équilibré',
        'Assez bien',
        'Plutôt bien',
        'Très bien',
        'Bien extraordinaire',
        'Ça ne pourrait pas être mieux',
    ],
    it: [
        'Non potrebbe essere peggio',
        'Scarsa straordinaria',
        'Estremamente cattivo',
        'Abbastanza',
        'Qualcosa che non va"',
        'Equilibrato',
        "Un po' ok",
        'Bello',
        'Estremamente buono',
        'Buono straordinario',
        'Non potrebbe essere meglio',
    ],
    es: [
        'No podría ponerse peor',
        'Extraordinario malo',
        'Muy malo',
        'Bastante mal',
        'Algo que no es bueno',
        'Equilibrado',
        'Algo bien',
        'Muy bien',
        'Muy bueno',
        'Bien extraordinario',
        'No podría ser mejor',
    ],
    pl: [
        'Nie mogło być gorzej',
        'Nadzwyczajny',
        'Badacze',
        'Całkiem źle',
        'Niedobrze',
        'Zrównoważony',
        'Trochę w porządku',
        'Całkiem dobrze',
        'Dobro',
        'Dobry nadzwyczajny',
        'Nie mogło być lepiej',
    ],
    uk: [
        'Чи не побоюватися',
        'Поганий',
        'Надзвичайно Поганий',
        'Гарненька Поганий',
        'Що не добре',
        'збалансований',
        'Дещо нормально',
        'Гарненька Добре',
        'Надзвичайно Добре',
        'Надзвичайне добро',
        'Не можна краще',
    ],
    'zh-cn': [
        '没有比这更糟糕的了',
        '特设包',
        '极力包',
        '序言',
        '某些人',
        '平衡',
        '有点好',
        '善意',
        '极好',
        '特 法',
        '再好不过了',
    ],
};

const FOCUS_TEXTS: Record<string, string[]> = {
    en: ['Personal', 'Work', 'Mindfulness', 'Fitness', 'Reading', 'Gaming', 'Driving', 'Shopping'],
    de: ['Zeit für mich', 'Arbeiten', 'Achtsamkeit', 'Fitness', 'Lesen', 'Spielen', 'Fahren', 'Shopping'],
};

const RESIDENTIAL_ICONS = ['🛫', '⏸️', '🐾', '⏱️', '🏠', '🚫', '🧘', '🛌', '🛏️', '🥱', '⏰', '💤'];
const MOOD_ICONS = [
    '🔺🔺🔺🔺🔺',
    '🔺🔺🔺🔺',
    '🔺🔺🔺',
    '🔸🔸',
    '🔸',
    '☯️',
    '⭐',
    '⭐⭐',
    '⭐⭐⭐',
    '🌟🌟🌟🌟',
    '🌟🌟🌟🌟🌟',
];
const FOCUS_ICONS = ['👤', '💼', '🧘', '💪', '📙', '🚀', '🚘', '🛒'];
const STATE_TRANSLATION_ICONS = ['🔲', '😶\u200d🌫️', '🧑', '🧳', '🐶'];

const l = (map: LangMap | Record<string, string[]>, lang: string): string | string[] =>
    (map as Record<string, string | string[]>)[lang] ?? (map as Record<string, string | string[]>)['en'];

const getStateTranslationDefaults = (lang: string): DefaultEntry[] => {
    const texts = [
        l(STATE_OFF_TEXTS, lang) as string,
        l(STATE_NOBODY_TEXTS, lang) as string,
        l(STATE_ROOMIE_TEXTS, lang) as string,
        l(STATE_GUEST_TEXTS, lang) as string,
        l(STATE_PET_TEXTS, lang) as string,
    ];
    return STATE_TRANSLATION_ICONS.map((icon, i) => ({ icon, text: texts[i] }));
};

const getResidentialStateDefaults = (lang: string): DefaultEntry[] =>
    RESIDENTIAL_ICONS.map((icon, i) => ({ icon, text: (l(RESIDENTIAL_TEXTS, lang) as string[])[i] }));

const getMoodStateDefaults = (lang: string): DefaultEntry[] =>
    MOOD_ICONS.map((icon, i) => ({ icon, text: (l(MOOD_TEXTS, lang) as string[])[i] }));

const getFocusStateDefaults = (lang: string): FocusDefaultEntry[] => {
    const texts = l(FOCUS_TEXTS, lang) as string[];
    const flags: Array<[boolean, boolean, boolean, boolean]> = [
        [true, true, true, false],
        [true, false, true, true],
        [true, true, true, false],
        [true, true, true, true],
        [true, false, true, false],
        [true, false, true, false],
        [true, false, false, true],
        [true, false, false, true],
    ];
    return FOCUS_ICONS.map((icon, i) => ({
        icon,
        text: texts[i],
        enabled: flags[i][0],
        dnd: flags[i][1],
        home: flags[i][2],
        away: flags[i][3],
    }));
};

// ---- Activity State override data ----
const ACTIVITY_STATE_TEXTS: Record<string, Record<number, string>> = {
    en: {
        0: 'Extended Absence',
        1: 'On the Road for Today',
        2: 'Way Home',
        100: 'Personal',
        101: 'Work',
        102: 'Mindfulness',
        103: 'Fitness',
        104: 'Reading',
        105: 'Gaming',
        106: 'Driving',
        107: 'Shopping',
        1000: 'Home',
        1100: 'Personal',
        1101: 'Work',
        1102: 'Mindfulness',
        1103: 'Fitness',
        1104: 'Reading',
        1105: 'Gaming',
        1106: 'Driving',
        1107: 'Shopping',
        1900: 'Preparing Bedtime',
        1901: 'Getting to Bed',
        1902: 'In Bed',
        2000: 'Sleeping',
        2010: 'Awake during Night Time',
        2020: 'Asleep again',
        2100: 'Wake-up Alarm',
        2101: '💤 Alarm Snooze',
        2102: '💤 Alarm Snooze',
        2103: '💤💤 Alarm Snooze',
        2104: '💤💤 Alarm Snooze',
        2105: '💤💤💤 Alarm Snooze',
        2200: 'Awakening after Wake-up Alarm',
        2210: 'Awakening',
    },
    de: {
        0: 'Längere Abwesenheit',
        1: 'Unterwegs für heute',
        2: 'Nachhauseweg',
        100: 'Zeit für mich',
        101: 'Arbeiten',
        102: 'Achtsamkeit',
        103: 'Fitness',
        104: 'Lesen',
        105: 'Spielen',
        106: 'Fahren',
        107: 'Shopping',
        1000: 'zu Hause',
        1100: 'Zeit für mich',
        1101: 'Arbeiten',
        1102: 'Achtsamkeit',
        1103: 'Fitness',
        1104: 'Lesen',
        1105: 'Spielen',
        1106: 'Fahren',
        1107: 'Shopping',
        1900: 'Auf Schlaf einstellen',
        1901: 'Bettfertig machen',
        1902: 'Im Bett',
        2000: 'Schlafen',
        2010: 'Wach während der Nacht',
        2020: 'Wieder eingeschlafen',
        2100: 'Weckalarm',
        2101: '💤 Schlummern',
        2102: '💤 Schlummern',
        2103: '💤💤 Schlummern',
        2104: '💤💤 Schlummern',
        2105: '💤💤💤 Schlummern',
        2200: 'Aufwachen nach Weckruf',
        2210: 'Aufwachen',
    },
};

// Default icons for activity states, mirroring main.js icon assignment logic.
// RESIDENTIAL_ICONS indices: 0=🛫 1=⏸️ 3=⏱️ 4=🏠 6=🧘 7=🛌 8=🛏️ 9=🥱 10=⏰ 11=💤
const ACTIVITY_STATE_ICONS: Record<number, string> = {
    0: RESIDENTIAL_ICONS[0], // Extended Absence
    1: RESIDENTIAL_ICONS[1], // Away
    2: RESIDENTIAL_ICONS[3], // Way Home
    100: FOCUS_ICONS[0],
    101: FOCUS_ICONS[1],
    102: FOCUS_ICONS[2],
    103: FOCUS_ICONS[3],
    104: FOCUS_ICONS[4],
    105: FOCUS_ICONS[5],
    106: FOCUS_ICONS[6],
    107: FOCUS_ICONS[7],
    1000: RESIDENTIAL_ICONS[4], // Home
    1100: FOCUS_ICONS[0],
    1101: FOCUS_ICONS[1],
    1102: FOCUS_ICONS[2],
    1103: FOCUS_ICONS[3],
    1104: FOCUS_ICONS[4],
    1105: FOCUS_ICONS[5],
    1106: FOCUS_ICONS[6],
    1107: FOCUS_ICONS[7],
    1900: RESIDENTIAL_ICONS[6], // Wind Down
    1901: RESIDENTIAL_ICONS[7], // Getting to Bed
    1902: RESIDENTIAL_ICONS[7], // In Bed
    2000: RESIDENTIAL_ICONS[11], // Sleeping
    2010: RESIDENTIAL_ICONS[9], // Awake during Night
    2020: RESIDENTIAL_ICONS[11], // Asleep again
    2100: RESIDENTIAL_ICONS[10],
    2101: RESIDENTIAL_ICONS[10],
    2102: RESIDENTIAL_ICONS[10],
    2103: RESIDENTIAL_ICONS[10],
    2104: RESIDENTIAL_ICONS[10],
    2105: RESIDENTIAL_ICONS[10],
    2200: RESIDENTIAL_ICONS[8], // Awakening after alarm
    2210: RESIDENTIAL_ICONS[8], // Awakening
};

interface ActivityStateOption {
    id: number;
    defaultText: string;
    defaultIcon: string;
    group: string;
}

const ACTIVITY_ID_GROUPS: [number[], string][] = [
    [[0, 1, 2], '0 – 99'],
    [[100, 101, 102, 103, 104, 105, 106, 107], '100 – 199'],
    [[1000], '1000 – 1099'],
    [[1100, 1101, 1102, 1103, 1104, 1105, 1106, 1107], '1100 – 1199'],
    [[1900, 1901, 1902], '1900 – 1999'],
    [[2000, 2010, 2020], '2000 – 2099'],
    [[2100, 2101, 2102, 2103, 2104, 2105], '2100 – 2199'],
    [[2200, 2210], '2200 – 2299'],
];

function getActivityStateOptions(lang: string): ActivityStateOption[] {
    const texts = ACTIVITY_STATE_TEXTS[lang] ?? ACTIVITY_STATE_TEXTS.en;
    const result: ActivityStateOption[] = [];
    for (const entry of ACTIVITY_ID_GROUPS) {
        const ids = entry[0];
        const group = entry[1];
        for (const id of ids) {
            result.push({
                id,
                defaultText: texts[id] ?? String(id),
                defaultIcon: ACTIVITY_STATE_ICONS[id] ?? '',
                group,
            });
        }
    }
    return result;
}

const hCellSx = {
    fontWeight: 700,
    textTransform: 'none',
    borderBottom: '2px solid',
    borderColor: 'primary.main',
} as const;

const HeaderCell: React.FC<{
    label: string;
    hint?: string;
    required?: boolean;
    width?: number;
    minWidth?: number;
    align?: 'left' | 'center' | 'right';
}> = ({ label, hint, required, width, minWidth, align }) => (
    <TableCell
        align={align}
        sx={{ ...hCellSx, width, minWidth }}
    >
        {hint || required ? (
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                {label}
                {required && (
                    <Box
                        component="span"
                        sx={{ color: 'error.main', lineHeight: 1 }}
                    >
                        *
                    </Box>
                )}
                {hint && (
                    <Tooltip
                        title={hint}
                        placement="top"
                        arrow
                    >
                        <InfoOutlinedIcon sx={{ fontSize: 14, opacity: 0.55, cursor: 'help', flexShrink: 0 }} />
                    </Tooltip>
                )}
            </Box>
        ) : (
            label
        )}
    </TableCell>
);

const isValidEmoji = (icon: string): boolean => !icon || [...new Intl.Segmenter().segment(icon)].length === 1;
const isValidTime = (time: string): boolean => !time || /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(time);

/** Editable table for rows with icon + text columns */
const IconTextTable: React.FC<{
    rows: IconTextEntry[];
    onChange: (rows: IconTextEntry[]) => void;
    addButton?: boolean;
    defaults?: DefaultEntry[];
}> = ({ rows, onChange, addButton = false, defaults }) => {
    // When defaults are given, always render all default rows (sparse-safe for new/empty configs)
    const effectiveRows: IconTextEntry[] = defaults ? defaults.map((_, i) => rows[i] ?? { icon: '', text: '' }) : rows;

    const handleChange = (index: number, field: 'icon' | 'text', value: string): void => {
        const updated = effectiveRows.map((r, i) => (i === index ? { ...r, [field]: value } : r));
        onChange(updated);
    };
    const handleDelete = (index: number): void => onChange(rows.filter((_, i) => i !== index));
    const handleAdd = (): void => onChange([...rows, { icon: '', text: '' }]);

    return (
        <Box>
            {addButton && (
                <Box sx={{ mb: 1 }}>
                    <Button
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={handleAdd}
                        size="small"
                    >
                        {I18n.t('Add resident')}
                    </Button>
                </Box>
            )}
            <Table
                size="small"
                stickyHeader
            >
                <TableHead>
                    <TableRow>
                        <HeaderCell
                            label={I18n.t('#')}
                            width={50}
                            align="center"
                        />
                        <HeaderCell
                            label={I18n.t('Icon')}
                            hint={I18n.t('Emoji')}
                            width={160}
                            align="center"
                        />
                        <HeaderCell
                            label={I18n.t('Custom Text')}
                            hint={I18n.t('Optional overwrite default text')}
                        />
                        {addButton && <TableCell sx={hCellSx} />}
                    </TableRow>
                </TableHead>
                <TableBody>
                    {effectiveRows.map((row, index) => (
                        <TableRow
                            key={index}
                            hover
                            sx={{ backgroundColor: index % 2 !== 0 ? 'action.hover' : 'inherit' }}
                        >
                            <TableCell align="center">{index + 1}</TableCell>
                            <TableCell align="center">
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    <TextField
                                        variant="standard"
                                        value={row.icon}
                                        onChange={e => handleChange(index, 'icon', e.target.value)}
                                        fullWidth
                                        size="small"
                                        inputProps={{ style: { textAlign: 'center' } }}
                                        placeholder={defaults?.[index]?.icon ?? '…'}
                                        error={!isValidEmoji(row.icon)}
                                    />
                                    {row.icon ? (
                                        <Tooltip title={I18n.t('Clear')}>
                                            <IconButton
                                                size="small"
                                                onClick={() => handleChange(index, 'icon', '')}
                                                tabIndex={-1}
                                            >
                                                <ClearIcon fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                    ) : null}
                                </Box>
                            </TableCell>
                            <TableCell>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    <TextField
                                        variant="standard"
                                        value={row.text}
                                        onChange={e => handleChange(index, 'text', e.target.value)}
                                        fullWidth
                                        size="small"
                                        placeholder={defaults?.[index]?.text ?? I18n.t('Default')}
                                    />
                                    {row.text ? (
                                        <Tooltip title={I18n.t('Clear')}>
                                            <IconButton
                                                size="small"
                                                onClick={() => handleChange(index, 'text', '')}
                                                tabIndex={-1}
                                            >
                                                <ClearIcon fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                    ) : null}
                                </Box>
                            </TableCell>
                            {addButton && (
                                <TableCell align="center">
                                    <Tooltip title={I18n.t('Delete')}>
                                        <IconButton
                                            size="small"
                                            onClick={() => handleDelete(index)}
                                            color="error"
                                        >
                                            <DeleteIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                </TableCell>
                            )}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </Box>
    );
};

/** Editable table for activity state overrides (id, icon, text) */
const ActivityTable: React.FC<{
    rows: ActivityEntry[];
    onChange: (rows: ActivityEntry[]) => void;
    lang: string;
}> = ({ rows, onChange, lang }) => {
    const options = useMemo(() => getActivityStateOptions(lang), [lang]);

    const handleChange = (index: number, field: keyof ActivityEntry, value: string | number | null): void => {
        const updated = rows.map((r, i) => (i === index ? { ...r, [field]: value } : r));
        onChange(updated);
    };
    const handleDelete = (index: number): void => onChange(rows.filter((_, i) => i !== index));
    const handleAdd = (): void => onChange([...rows, { id: null, icon: '', text: '' }]);

    return (
        <Box>
            <Box sx={{ mb: 1 }}>
                <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={handleAdd}
                    size="small"
                >
                    {I18n.t('Add activity override')}
                </Button>
            </Box>
            <Table
                size="small"
                stickyHeader
            >
                <TableHead>
                    <TableRow>
                        <HeaderCell
                            label={I18n.t('Activity state')}
                            required
                        />
                        <HeaderCell
                            label={I18n.t('Icon')}
                            hint={I18n.t('Emoji')}
                            width={160}
                            align="center"
                        />
                        <HeaderCell
                            label={I18n.t('Custom Text')}
                            hint={I18n.t('Optional overwrite default text')}
                        />
                        <TableCell sx={hCellSx} />
                    </TableRow>
                </TableHead>
                <TableBody>
                    {rows.map((row, index) => {
                        const option = row.id !== null ? (options.find(o => o.id === Number(row.id)) ?? null) : null;
                        return (
                            <TableRow
                                key={index}
                                hover
                                sx={{ backgroundColor: index % 2 !== 0 ? 'action.hover' : 'inherit' }}
                            >
                                <TableCell>
                                    <Autocomplete<ActivityStateOption>
                                        size="small"
                                        options={options}
                                        groupBy={opt => opt.group}
                                        getOptionLabel={opt => `${opt.id}: ${opt.defaultText}`}
                                        isOptionEqualToValue={(opt, val) => opt.id === val.id}
                                        value={option}
                                        onChange={(_, newValue) => {
                                            handleChange(index, 'id', newValue?.id ?? null);
                                        }}
                                        renderInput={params => (
                                            <TextField
                                                {...params}
                                                variant="standard"
                                                size="small"
                                                error={option === null}
                                            />
                                        )}
                                        sx={{ minWidth: 260 }}
                                    />
                                </TableCell>
                                <TableCell align="center">
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                        <TextField
                                            variant="standard"
                                            value={row.icon}
                                            onChange={e => handleChange(index, 'icon', e.target.value)}
                                            fullWidth
                                            size="small"
                                            inputProps={{ style: { textAlign: 'center' } }}
                                            placeholder={option?.defaultIcon ?? '…'}
                                            error={!isValidEmoji(row.icon)}
                                        />
                                        {row.icon ? (
                                            <Tooltip title={I18n.t('Clear')}>
                                                <IconButton
                                                    size="small"
                                                    onClick={() => handleChange(index, 'icon', '')}
                                                    tabIndex={-1}
                                                >
                                                    <ClearIcon fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                        ) : null}
                                    </Box>
                                </TableCell>
                                <TableCell>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                        <TextField
                                            variant="standard"
                                            value={row.text}
                                            onChange={e => handleChange(index, 'text', e.target.value)}
                                            fullWidth
                                            size="small"
                                            placeholder={option?.defaultText ?? I18n.t('Default')}
                                        />
                                        {row.text ? (
                                            <Tooltip title={I18n.t('Clear')}>
                                                <IconButton
                                                    size="small"
                                                    onClick={() => handleChange(index, 'text', '')}
                                                    tabIndex={-1}
                                                >
                                                    <ClearIcon fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                        ) : null}
                                    </Box>
                                </TableCell>
                                <TableCell align="center">
                                    <Tooltip title={I18n.t('Delete')}>
                                        <IconButton
                                            size="small"
                                            onClick={() => handleDelete(index)}
                                            color="error"
                                        >
                                            <DeleteIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </Box>
    );
};

/** Editable table for focus modes (enabled, icon, text, dnd, home, away) */
const FocusTable: React.FC<{
    rows: FocusEntry[];
    onChange: (rows: FocusEntry[]) => void;
    addButton?: boolean;
    defaults?: FocusDefaultEntry[];
}> = ({ rows, onChange, addButton = false, defaults }) => {
    // When defaults are given, always render all default rows (sparse-safe for new/empty configs)
    const effectiveRows: FocusEntry[] =
        defaults && !addButton
            ? defaults.map(
                  (def, i) =>
                      rows[i] ?? {
                          enabled: def.enabled,
                          icon: '',
                          text: '',
                          dnd: def.dnd,
                          home: def.home,
                          away: def.away,
                      },
              )
            : rows;

    const handleChange = (index: number, field: keyof FocusEntry, value: string | boolean): void => {
        const updated = effectiveRows.map((r, i) => (i === index ? { ...r, [field]: value } : r));
        onChange(updated);
    };
    const handleDelete = (index: number): void => onChange(rows.filter((_, i) => i !== index));
    const handleAdd = (): void =>
        onChange([...rows, { enabled: true, icon: '', text: '', dnd: false, home: true, away: false }]);

    return (
        <Box>
            {addButton && (
                <Box sx={{ mb: 1 }}>
                    <Button
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={handleAdd}
                        size="small"
                    >
                        {I18n.t('Add focus mode')}
                    </Button>
                </Box>
            )}
            <Table
                size="small"
                stickyHeader
            >
                <TableHead>
                    <TableRow>
                        <HeaderCell
                            label={I18n.t('#')}
                            width={50}
                            align="center"
                        />
                        <HeaderCell
                            label={I18n.t('Enable')}
                            width={90}
                        />
                        <HeaderCell
                            label={I18n.t('Icon')}
                            hint={I18n.t('Emoji')}
                            width={120}
                            align="center"
                        />
                        <HeaderCell
                            label={I18n.t('Custom Text')}
                            hint={I18n.t('Optional overwrite default text')}
                            required={addButton}
                        />
                        <HeaderCell
                            label={I18n.t('Do Not Disturb')}
                            hint={I18n.t('Activate this focus mode when Do Not Disturb is on')}
                            width={100}
                        />
                        <HeaderCell
                            label={I18n.t('Home')}
                            hint={I18n.t('Activate this focus mode when resident is at home')}
                            width={80}
                        />
                        <HeaderCell
                            label={I18n.t('Away')}
                            hint={I18n.t('Activate this focus mode when resident is away')}
                            width={80}
                        />
                        {addButton && <TableCell sx={hCellSx} />}
                    </TableRow>
                </TableHead>
                <TableBody>
                    {effectiveRows.map((row, index) => (
                        <TableRow
                            key={index}
                            hover
                            sx={{ backgroundColor: index % 2 !== 0 ? 'action.hover' : 'inherit' }}
                        >
                            <TableCell align="center">{index + 1}</TableCell>
                            <TableCell>
                                <Checkbox
                                    checked={!!row.enabled}
                                    onChange={e => handleChange(index, 'enabled', e.target.checked)}
                                    size="small"
                                />
                            </TableCell>
                            <TableCell align="center">
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    <TextField
                                        variant="standard"
                                        value={row.icon}
                                        onChange={e => handleChange(index, 'icon', e.target.value)}
                                        fullWidth
                                        size="small"
                                        inputProps={{ style: { textAlign: 'center' } }}
                                        placeholder={defaults?.[index]?.icon ?? '…'}
                                        error={!isValidEmoji(row.icon)}
                                    />
                                    {row.icon ? (
                                        <Tooltip title={I18n.t('Clear')}>
                                            <IconButton
                                                size="small"
                                                onClick={() => handleChange(index, 'icon', '')}
                                                tabIndex={-1}
                                            >
                                                <ClearIcon fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                    ) : null}
                                </Box>
                            </TableCell>
                            <TableCell>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    <TextField
                                        variant="standard"
                                        value={row.text}
                                        onChange={e => handleChange(index, 'text', e.target.value)}
                                        fullWidth
                                        size="small"
                                        error={addButton && !row.text?.trim()}
                                        placeholder={
                                            addButton
                                                ? I18n.t('e.g. Work')
                                                : (defaults?.[index]?.text ?? I18n.t('Default'))
                                        }
                                    />
                                    {row.text ? (
                                        <Tooltip title={I18n.t('Clear')}>
                                            <IconButton
                                                size="small"
                                                onClick={() => handleChange(index, 'text', '')}
                                                tabIndex={-1}
                                            >
                                                <ClearIcon fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                    ) : null}
                                </Box>
                            </TableCell>
                            <TableCell>
                                <Checkbox
                                    checked={!!row.dnd}
                                    onChange={e => handleChange(index, 'dnd', e.target.checked)}
                                    size="small"
                                />
                            </TableCell>
                            <TableCell>
                                <Checkbox
                                    checked={!!row.home}
                                    onChange={e => handleChange(index, 'home', e.target.checked)}
                                    size="small"
                                />
                            </TableCell>
                            <TableCell>
                                <Checkbox
                                    checked={!!row.away}
                                    onChange={e => handleChange(index, 'away', e.target.checked)}
                                    size="small"
                                />
                            </TableCell>
                            {addButton && (
                                <TableCell align="center">
                                    <Tooltip title={I18n.t('Delete')}>
                                        <IconButton
                                            size="small"
                                            onClick={() => handleDelete(index)}
                                            color="error"
                                        >
                                            <DeleteIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                </TableCell>
                            )}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </Box>
    );
};

const SettingsTab: React.FC<SettingsTabProps> = ({ native, onChange, socket, instance }) => {
    const [residentInstances, setResidentInstances] = useState<string[]>([]);

    useEffect(() => {
        socket
            .getAdapterInstances('residents')
            .then((instances: { _id: string }[]) => {
                const ids = instances
                    .map((inst: { _id: string }) => inst._id.replace('system.adapter.', ''))
                    .filter((id: string) => id !== instance);
                setResidentInstances(ids);
            })
            .catch(() => {
                // ignore — picker stays empty, user can still type if needed
            });
    }, [socket, instance]);
    const [expanded, setExpanded] = useState<string | false>('translations');

    const lang = native.language || 'en';
    const stateTranslationDefaults = getStateTranslationDefaults(lang);
    const residentialStateDefaults = getResidentialStateDefaults(lang);
    const moodStateDefaults = getMoodStateDefaults(lang);
    const focusStateDefaults = getFocusStateDefaults(lang);
    const [cronDialog, setCronDialog] = useState<'disable' | 'overnight' | null>(null);

    const timeToCron = (hhmm: string): string => {
        const [h = '0', m = '0'] = (hhmm ?? '').split(':');
        return `${parseInt(m, 10)} ${parseInt(h, 10)} * * *`;
    };

    const cronToTime = (cron: string): string => {
        const parts = cron.trim().split(/\s+/);
        if (parts.length >= 2) {
            return `${parts[1].padStart(2, '0')}:${parts[0].padStart(2, '0')}`;
        }
        return '';
    };

    const handleAccordion =
        (panel: string) =>
        (_event: React.SyntheticEvent, isExpanded: boolean): void => {
            setExpanded(isExpanded ? panel : false);
        };

    const parentInstanceIDs: string[] = Array.isArray(native.residentsParentInstanceIDs)
        ? native.residentsParentInstanceIDs
        : (native.residentsParentInstanceIDs ?? '')
              .split(',')
              .map((s: string) => s.trim())
              .filter(Boolean);

    return (
        <Box>
            {/* Translations */}
            <Accordion
                expanded={expanded === 'translations'}
                onChange={handleAccordion('translations')}
            >
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography>{I18n.t('Translations')}</Typography>
                </AccordionSummary>
                <AccordionDetails>
                    <Box sx={{ mb: 2 }}>
                        <FormControl
                            variant="standard"
                            sx={{ minWidth: 240 }}
                        >
                            <InputLabel>{I18n.t('General language for states')}</InputLabel>
                            <Select
                                value={native.language ?? ''}
                                onChange={e => onChange('language', e.target.value)}
                            >
                                <MenuItem value="">{I18n.t('System language')}</MenuItem>
                                <MenuItem value="en">English</MenuItem>
                                <MenuItem value="de">Deutsch</MenuItem>
                                <MenuItem value="ru">русский</MenuItem>
                                <MenuItem value="pt">Portuges</MenuItem>
                                <MenuItem value="nl">Nederlands</MenuItem>
                                <MenuItem value="fr">Français</MenuItem>
                                <MenuItem value="it">Italiano</MenuItem>
                                <MenuItem value="es">Español</MenuItem>
                                <MenuItem value="pl">Polski</MenuItem>
                                <MenuItem value="uk">Український</MenuItem>
                                <MenuItem value="zh-cn">简体中文</MenuItem>
                            </Select>
                        </FormControl>
                    </Box>
                    <Typography
                        variant="body2"
                        sx={{ mb: 1 }}
                    >
                        {I18n.t(
                            'Override the default icons and display texts for general on/off and presence indicator values.',
                        )}
                    </Typography>
                    <IconTextTable
                        rows={native.stateTranslations ?? []}
                        onChange={rows => onChange('stateTranslations', rows)}
                        defaults={stateTranslationDefaults}
                    />
                </AccordionDetails>
            </Accordion>

            {/* Residential Status */}
            <Accordion
                expanded={expanded === 'residential'}
                onChange={handleAccordion('residential')}
            >
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography>{I18n.t('Residential Status')}</Typography>
                </AccordionSummary>
                <AccordionDetails>
                    <Typography
                        variant="body2"
                        sx={{ mb: 1 }}
                    >
                        {I18n.t('Override the icons and display texts for home and away residential status values.')}
                    </Typography>
                    <IconTextTable
                        rows={native.residentialStates ?? []}
                        onChange={rows => onChange('residentialStates', rows)}
                        defaults={residentialStateDefaults}
                    />
                </AccordionDetails>
            </Accordion>

            {/* Mood Status */}
            <Accordion
                expanded={expanded === 'mood'}
                onChange={handleAccordion('mood')}
            >
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography>{I18n.t('Mood Status')}</Typography>
                </AccordionSummary>
                <AccordionDetails>
                    <Typography
                        variant="body2"
                        sx={{ mb: 1 }}
                    >
                        {I18n.t('Override the icons and display texts for resident mood level values.')}
                    </Typography>
                    <IconTextTable
                        rows={native.moodStates ?? []}
                        onChange={rows => onChange('moodStates', rows)}
                        defaults={moodStateDefaults}
                    />
                </AccordionDetails>
            </Accordion>

            {/* Activity Status Overwrite */}
            <Accordion
                expanded={expanded === 'activity'}
                onChange={handleAccordion('activity')}
            >
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography>{I18n.t('Activity Status Overwrite')}</Typography>
                        {(native.activityStates?.length ?? 0) > 0 && (
                            <Chip
                                label={native.activityStates.length}
                                size="small"
                                variant="outlined"
                                color="primary"
                                sx={{ height: 18, fontSize: '0.65rem', pointerEvents: 'none' }}
                            />
                        )}
                    </Box>
                </AccordionSummary>
                <AccordionDetails>
                    <Typography
                        variant="body2"
                        sx={{ mb: 1 }}
                    >
                        {I18n.t('Select an activity state to override its icon or text.')}
                    </Typography>
                    <ActivityTable
                        rows={native.activityStates ?? []}
                        onChange={rows => onChange('activityStates', rows)}
                        lang={lang}
                    />
                </AccordionDetails>
            </Accordion>

            {/* Focus Modes */}
            <Accordion
                expanded={expanded === 'focus'}
                onChange={handleAccordion('focus')}
            >
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography>{I18n.t('Focus Modes')}</Typography>
                        {(native.customFocusStates?.length ?? 0) > 0 && (
                            <Chip
                                label={`${native.customFocusStates.length} ${I18n.t('custom')}`}
                                size="small"
                                variant="outlined"
                                color="primary"
                                sx={{ height: 18, fontSize: '0.65rem', pointerEvents: 'none' }}
                            />
                        )}
                    </Box>
                </AccordionSummary>
                <AccordionDetails>
                    <Typography
                        variant="body2"
                        sx={{ mb: 1 }}
                    >
                        {I18n.t(
                            'Add custom focus modes that appear as activity states. Each mode can be assigned to home presence, away, or Do Not Disturb scenarios.',
                        )}
                    </Typography>
                    <FocusTable
                        rows={native.customFocusStates ?? []}
                        onChange={rows => onChange('customFocusStates', rows)}
                        addButton
                    />

                    <Box sx={{ mt: 3 }} />

                    <Typography
                        variant="body2"
                        sx={{ mb: 1 }}
                    >
                        {I18n.t('Override the icons and display texts for the built-in focus modes.')}
                    </Typography>
                    <FocusTable
                        rows={native.focusStates ?? []}
                        onChange={rows => onChange('focusStates', rows)}
                        defaults={focusStateDefaults}
                    />
                </AccordionDetails>
            </Accordion>

            {/* Timers */}
            <Accordion
                expanded={expanded === 'timers'}
                onChange={handleAccordion('timers')}
            >
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography>{I18n.t('Timers')}</Typography>
                </AccordionSummary>
                <AccordionDetails>
                    <Box sx={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <Box>
                            <FormControlLabel
                                control={
                                    <Checkbox
                                        checked={!!native.disableAbsentResidentsDailyTimerEnabled}
                                        onChange={e =>
                                            onChange('disableAbsentResidentsDailyTimerEnabled', e.target.checked)
                                        }
                                    />
                                }
                                label={I18n.t('Enable')}
                            />
                            <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 0.5 }}>
                                <TextField
                                    variant="standard"
                                    label={I18n.t('Auto disable time HH:mm[:ss]')}
                                    value={native.disableAbsentResidentsDailyTimer ?? ''}
                                    onChange={e => onChange('disableAbsentResidentsDailyTimer', e.target.value)}
                                    disabled={!native.disableAbsentResidentsDailyTimerEnabled}
                                    error={
                                        !!native.disableAbsentResidentsDailyTimerEnabled &&
                                        !isValidTime(native.disableAbsentResidentsDailyTimer ?? '')
                                    }
                                    helperText={
                                        !!native.disableAbsentResidentsDailyTimerEnabled &&
                                        !isValidTime(native.disableAbsentResidentsDailyTimer ?? '')
                                            ? I18n.t('Invalid time format (HH:mm or HH:mm:ss)')
                                            : I18n.t(
                                                  'Time for daily deactivation of residents who have not stayed overnight',
                                              )
                                    }
                                />
                                <Tooltip title={I18n.t('Pick time visually')}>
                                    <span>
                                        <IconButton
                                            size="small"
                                            onClick={() => setCronDialog('disable')}
                                            disabled={!native.disableAbsentResidentsDailyTimerEnabled}
                                        >
                                            <AccessTimeIcon fontSize="small" />
                                        </IconButton>
                                    </span>
                                </Tooltip>
                            </Box>
                        </Box>
                        <Box>
                            <FormControlLabel
                                control={
                                    <Checkbox
                                        checked={!!native.resetOvernightDailyTimerEnabled}
                                        onChange={e => onChange('resetOvernightDailyTimerEnabled', e.target.checked)}
                                    />
                                }
                                label={I18n.t('Enable')}
                            />
                            <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 0.5 }}>
                                <TextField
                                    variant="standard"
                                    label={I18n.t('Overnight reset time HH:mm[:ss]')}
                                    value={native.resetOvernightDailyTimer ?? ''}
                                    onChange={e => onChange('resetOvernightDailyTimer', e.target.value)}
                                    disabled={!native.resetOvernightDailyTimerEnabled}
                                    error={
                                        !!native.resetOvernightDailyTimerEnabled &&
                                        !isValidTime(native.resetOvernightDailyTimer ?? '')
                                    }
                                    helperText={
                                        !!native.resetOvernightDailyTimerEnabled &&
                                        !isValidTime(native.resetOvernightDailyTimer ?? '')
                                            ? I18n.t('Invalid time format (HH:mm or HH:mm:ss)')
                                            : I18n.t('Time for daily reset of overnight state, based on resident type')
                                    }
                                />
                                <Tooltip title={I18n.t('Pick time visually')}>
                                    <span>
                                        <IconButton
                                            size="small"
                                            onClick={() => setCronDialog('overnight')}
                                            disabled={!native.resetOvernightDailyTimerEnabled}
                                        >
                                            <AccessTimeIcon fontSize="small" />
                                        </IconButton>
                                    </span>
                                </Tooltip>
                            </Box>
                        </Box>
                    </Box>
                </AccordionDetails>
            </Accordion>

            {cronDialog !== null && (
                <DialogSimpleCron
                    cron={timeToCron(
                        cronDialog === 'disable'
                            ? (native.disableAbsentResidentsDailyTimer ?? '')
                            : (native.resetOvernightDailyTimer ?? ''),
                    )}
                    title={I18n.t('Pick time')}
                    onClose={() => setCronDialog(null)}
                    onOk={(cron: string) => {
                        const key =
                            cronDialog === 'disable' ? 'disableAbsentResidentsDailyTimer' : 'resetOvernightDailyTimer';
                        onChange(key, cronToTime(cron));
                        setCronDialog(null);
                    }}
                />
            )}

            {/* Resident groups */}
            <Accordion
                expanded={expanded === 'groups'}
                onChange={handleAccordion('groups')}
            >
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography>{I18n.t('Resident groups')}</Typography>
                        {parentInstanceIDs.length > 0 && (
                            <Chip
                                label={parentInstanceIDs.length}
                                size="small"
                                variant="outlined"
                                color="primary"
                                sx={{ height: 18, fontSize: '0.65rem', pointerEvents: 'none' }}
                            />
                        )}
                    </Box>
                </AccordionSummary>
                <AccordionDetails>
                    <Autocomplete<string, true, false, true>
                        multiple
                        freeSolo
                        options={residentInstances}
                        value={parentInstanceIDs}
                        onChange={(_e, newValue) => onChange('residentsParentInstanceIDs', newValue)}
                        renderTags={(value, getTagProps) =>
                            value.map((option, index) => {
                                const { key, ...tagProps } = getTagProps({ index });
                                return (
                                    <Chip
                                        key={key}
                                        label={option}
                                        size="small"
                                        {...tagProps}
                                    />
                                );
                            })
                        }
                        renderInput={params => (
                            <TextField
                                {...params}
                                variant="standard"
                                label={I18n.t('Parent instances')}
                                helperText={I18n.t(
                                    'Select or type residents adapter instances that act as a parent group',
                                )}
                                sx={{ minWidth: 300 }}
                            />
                        )}
                    />
                </AccordionDetails>
            </Accordion>
        </Box>
    );
};

export default SettingsTab;
