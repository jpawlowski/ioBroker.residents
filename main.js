'use strict';

const utils = require('@iobroker/adapter-core');

class Residents extends utils.Adapter {
    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    constructor(options) {
        super({
            ...options,
            name: 'residents',
        });

        this.initialized = false;
        this.language = '';

        this.residents = [];
        this.roomies = [];
        this.pets = [];
        this.guests = [];

        this.subscriptions = [];
        this.foreignSubscriptions = [];
        this.presenceSubscriptionMapping = {};
        this.wayhomeSubscriptionMapping = {};
        this.states = [];

        this.parentInstances = [];

        this.absentTimeout = null;
        this.overnightTimeout = null;
        this.calculationTimeout = null;

        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    /**
     * Adapter instance startup
     * @returns void
     */
    async onReady() {
        this.roomies = this.config.roomie != undefined ? this.config.roomie : [];
        this.pets = this.config.pet != undefined ? this.config.pet : [];
        this.guests = this.config.guest != undefined ? this.config.guest : [];
        this.residents = this.roomies;
        this.residents = this.residents.concat(this.pets);
        this.residents = this.residents.concat(this.guests);

        const systemConfig = await this.getForeignObjectAsync('system.config');
        this.language = systemConfig && systemConfig.common.language ? systemConfig.common.language : 'en';
        if (this.config.language != '') this.language = this.config.language;

        ///////////////////////////
        // Create/Update global objects
        const residentialStateTexts = {
            en: {
                0: 'Extended Absence',
                1: 'Away',
                2: 'Pet Care',
                3: 'Way Home',
                4: 'Home',
                5: 'Do Not Disturb',
                6: 'Wind Down',
                7: 'Bedtime',
                8: 'Got Up',
                9: 'Night Walk',
                10: 'Wake Up',
                11: 'Night',
            },
            de: {
                0: 'L??ngere Abwesenheit',
                1: 'Abwesend',
                2: 'Haustierpflege',
                3: 'Nachhauseweg',
                4: 'zu Hause',
                5: 'Nicht st??ren',
                6: 'Entspannen',
                7: 'Schlafenszeit',
                8: 'Aufgestanden',
                9: 'Nachtwanderung',
                10: 'Aufwecken',
                11: 'Nacht',
            },
            ru: {
                0: '?????????????????????? ????????????????????',
                1: '??????????',
                2: '???????? ???? ?????????????????? ??????????????????',
                3: '???????? ??????????',
                4: '????????',
                5: '???? ????????????????????',
                6: '????????????????????????',
                7: '?????????? ??????',
                8: '?????????????? ?? ????????????????',
                9: '???????????? ??????????',
                10: '????????????????',
                11: '????????',
            },
            pt: {
                0: 'Aus??ncia estendida',
                1: 'A caminho',
                2: 'Pet Care',
                3: 'Caminho',
                4: 'Em casa',
                5: 'N??o Perturbar',
                6: 'Relaxe',
                7: 'Hora de dormir',
                8: 'Em funcionamento',
                9: 'Caminhada nocturna',
                10: 'Acorda',
                11: 'Noite',
            },
            nl: {
                0: 'Verlengde Absence',
                1: 'Weg',
                2: 'Huisdier thuis',
                3: 'Naar huis',
                4: 'Thuis',
                5: 'Niet Storen',
                6: 'Relax',
                7: 'Bedtijd',
                8: 'Op',
                9: 'Nachtwandeling',
                10: 'Wakker worden',
                11: 'Nacht',
            },
            fr: {
                0: 'Absence prolong??e',
                1: 'Absent',
                2: 'Soins pour animaux',
                3: 'Chemin de retour',
                4: 'Chez soi',
                5: 'Ne pas d??ranger',
                6: 'D??tendre',
                7: 'Heure du coucher',
                8: 'Lev??',
                9: 'Marche de nuit',
                10: 'R??veil',
                11: 'Nuit',
            },
            it: {
                0: 'Assenza estesa',
                1: 'Via',
                2: 'Cura degli animali',
                3: 'Via di casa',
                4: 'A casa',
                5: 'Non disturbare',
                6: 'Rilassarsi',
                7: 'Ora di dormire',
                8: 'Alzati',
                9: 'Passeggiata notturna',
                10: 'Svegliarsi',
                11: 'Notte',
            },
            es: {
                0: 'Ausencia ampliada',
                1: 'Fuera de casa',
                2: 'Cuidado de mascotas',
                3: 'Camino a casa',
                4: 'En casa',
                5: 'No molestar',
                6: 'Relax',
                7: 'Hora de dormir',
                8: 'Levant??',
                9: 'Paseo nocturno',
                10: 'Despierta',
                11: 'Noche',
            },
            pl: {
                0: 'D??ugo???? nieobecno??ci',
                1: 'Away',
                2: 'Pet Care',
                3: 'Strona domowa',
                4: 'W domu',
                5: 'Nie przeszkadza??',
                6: 'Relaks',
                7: 'Dobranoc',
                8: 'W g??r??',
                9: 'Nocny spacer',
                10: 'Obud?? si??',
                11: 'Noc',
            },
            uk: {
                0: '?????????????????? ????????????????',
                1: '????????????????????',
                2: '???????????????? ???????????? ???? ?????????????????? ??????????????????',
                3: '??????????????',
                4: '??????????',
                5: '???? ??????????????????',
                6: '????????????????????????',
                7: '?????? ??????????',
                8: '????????????',
                9: '?????????? ????????????????????',
                10: '??????????????????.',
                11: '??????',
            },
            'zh-cn': {
                0: '??????',
                1: 'A. ??????',
                2: '????????????',
                3: 'B. ????????????',
                4: '??????',
                5: '????????????',
                6: '??????',
                7: '????????????',
                8: '?????????',
                9: '??????',
                10: '??????',
                11: '??????',
            },
        };
        const residentialLang = residentialStateTexts[this.language]
            ? residentialStateTexts[this.language]
            : residentialStateTexts['en'];
        const residentialStates = {
            0: '',
        };
        for (const i in residentialLang) {
            residentialLang[i] = {
                text:
                    this.config.residentialStates != undefined &&
                    this.config.residentialStates[i].text != '' &&
                    this.config.residentialStates[i].text != residentialStateTexts['en'][i]
                        ? this.config.residentialStates[i].text
                        : residentialLang[i],
            };
            residentialLang[i]['state'] = residentialLang[i].text;
            if (this.config.residentialStates != undefined && this.config.residentialStates[i].icon != '') {
                residentialLang[i]['icon'] = this.config.residentialStates[i].icon;
                residentialLang[i]['state'] = this.config.residentialStates[i].icon + ' ' + residentialLang[i].text;
            }
            residentialStates[i] = residentialLang[i]['state'];
        }
        // Update common.states
        let currentObject = await this.getObjectAsync('state');
        if (currentObject) {
            currentObject.common.states = residentialStates;
            await this.setObjectAsync('state', currentObject);
        }

        const moodStateTexts = {
            en: {
                0: "Couldn't Get Worse",
                1: 'Extraordinary Bad',
                2: 'Extremely Bad',
                3: 'Pretty Bad',
                4: 'Somewhat Not Good',
                5: 'Balanced',
                6: 'Somewhat Okay',
                7: 'Pretty Good',
                8: 'Extremely Good',
                9: 'Extraordinary Good',
                10: "Couldn't Be Better",
            },
            de: {
                0: 'K??nnte nicht schlimmer werden',
                1: 'Au??erordentlich schlecht',
                2: '??u??erst schlecht',
                3: 'Ziemlich schlecht',
                4: 'Nicht so gut',
                5: 'Ausgeglichen',
                6: 'Einigerma??en okay',
                7: 'Ziemlich gut',
                8: 'Sehr gut',
                9: 'Au??erordentlich gut',
                10: 'K??nnte nicht besser sein',
            },
            ru: {
                0: '???? ?????????? ???? ???????????????? Worse',
                1: '?????????????????? ??????????',
                2: '?????????????????????? ??????????',
                3: '?????????? ??????????',
                4: '??????-???? ???? ????????????',
                5: '????????????????????????????????',
                6: '?????????????? ????????????',
                7: '???????????????? ????????????',
                8: '?????????????????????? ????????????',
                9: '?????????????????? ????????????',
                10: '???? ?????????? ???????? ??????????',
            },
            pt: {
                0: 'N??o consegui ficar pior',
                1: 'Mau Extraordin??rio',
                2: 'Extremamente mau',
                3: 'Muito mau',
                4: 'N??o ?? bom',
                5: 'Equilibrado',
                6: 'Alguma coisa bem',
                7: 'Muito bem',
                8: 'Extremamente bom',
                9: 'Bem Extraordin??rio',
                10: 'N??o podia ser melhor',
            },
            nl: {
                0: 'Kon Worse niet krijgen',
                1: 'Buitengewoon slecht',
                2: 'Extreem slecht',
                3: 'Best',
                4: 'Enigszins',
                5: 'Gebalanceerd',
                6: 'Enigszins ok??',
                7: 'Mooi',
                8: 'Extreem goed',
                9: 'Buitengewoon goed',
                10: 'Kon niet beter',
            },
            fr: {
                0: '??a ne pourrait pas ??tre pire',
                1: 'Extraordinairement mauvais',
                2: 'Extr??mement mauvais',
                3: 'Pas mal',
                4: "C'est pas bon",
                5: '??quilibr??',
                6: 'Assez bien',
                7: 'Plut??t bien',
                8: 'Tr??s bien',
                9: 'Bien extraordinaire',
                10: '??a ne pourrait pas ??tre mieux',
            },
            it: {
                0: 'Non potrebbe essere peggio',
                1: 'Scarsa straordinaria',
                2: 'Estremamente cattivo',
                3: 'Abbastanza',
                4: 'Qualcosa che non va"',
                5: 'Equilibrato',
                6: "Un po' ok",
                7: 'Bello',
                8: 'Estremamente buono',
                9: 'Buono straordinario',
                10: 'Non potrebbe essere meglio',
            },
            es: {
                0: 'No podr??a ponerse peor',
                1: 'Extraordinario malo',
                2: 'Muy malo',
                3: 'Bastante mal',
                4: 'Algo que no es bueno',
                5: 'Equilibrado',
                6: 'Algo bien',
                7: 'Muy bien',
                8: 'Muy bueno',
                9: 'Bien extraordinario',
                10: 'No podr??a ser mejor',
            },
            pl: {
                0: 'Nie mog??o by?? gorzej',
                1: 'Nadzwyczajny',
                2: 'Badacze',
                3: 'Ca??kiem ??le',
                4: 'Niedobrze',
                5: 'Zr??wnowa??ony',
                6: 'Troch?? w porz??dku',
                7: 'Ca??kiem dobrze',
                8: 'Dobro',
                9: 'Dobry nadzwyczajny',
                10: 'Nie mog??o by?? lepiej',
            },
            uk: {
                0: '???? ???? ??????????????????????',
                1: '??????????????',
                2: '?????????????????????? ??????????????',
                3: '?????????????????? ??????????????',
                4: '???? ???? ??????????',
                5: '??????????????????????????',
                6: '???????? ??????????????????',
                7: '?????????????????? ??????????',
                8: '?????????????????????? ??????????',
                9: '?????????????????????? ??????????',
                10: '???? ?????????? ??????????',
            },
            'zh-cn': {
                0: '???????????????????????????',
                1: '?????????',
                2: '?????????',
                3: '??????',
                4: '?????????',
                5: '??????',
                6: '?????????',
                7: '??????',
                8: '??????',
                9: '??? ???',
                10: '???????????????',
            },
        };
        const moodLang = moodStateTexts[this.language] ? moodStateTexts[this.language] : moodStateTexts['en'];
        const moodStates = {
            0: '',
        };
        for (const key in moodLang) {
            moodLang[key] = {
                text:
                    this.config.moodStates != undefined &&
                    this.config.moodStates[key].text != '' &&
                    this.config.moodStates[key].text != moodStateTexts['en'][key]
                        ? this.config.moodStates[key].text
                        : moodLang[key],
            };
            moodLang[key]['state'] = moodLang[key].text;
            if (this.config.moodStates != undefined && this.config.moodStates[key].icon != '') {
                moodLang[key]['icon'] = this.config.moodStates[key].icon;
                moodLang[key]['state'] = this.config.moodStates[key].icon + ' ' + moodLang[key].text;
            }
            moodStates[key] = moodLang[key]['state'];
        }
        // Update common.states
        currentObject = await this.getObjectAsync('mood');
        if (currentObject) {
            currentObject.common.states = moodStates;
            await this.setObjectAsync('mood', currentObject);
        }

        ///////////////////////////
        // Create/Update resident objects
        const residentTypeName = {
            roomie: {
                en: 'Roommate Devices',
                de: 'Mitbewohner Ger??te',
                ru: '???????????????????? ?????? ?????????????? ???? ??????????????',
                pt: 'Dispositivos para companheiros de quarto',
                nl: 'Apparaten voor huisgenoten',
                fr: 'Dispositifs de colocation',
                it: 'Dispositivi per i coinquilini',
                es: 'Dispositivos para compa??eros de piso',
                pl: 'Urz??dzenia dla wsp????lokator??w',
                uk: '?????????????? ????????????????',
                'zh-cn': '????????????',
            },
            pet: {
                en: 'Pet Devices',
                de: 'Haustier Ger??te',
                ru: '???????????????????? ?????? ???????????????? ????????????????',
                pt: 'Dispositivos para animais',
                nl: 'Apparaten voor huisdieren',
                fr: 'Dispositifs pour animaux de compagnie',
                it: 'Dispositivi per animali domestici',
                es: 'Dispositivos para mascotas',
                pl: 'Urz??dzenia dla zwierz??t domowych',
                uk: '???????????????? ?????? ???????????????? ????????????',
                'zh-cn': '',
            },
            guest: {
                en: 'Guest Devices',
                de: 'Gast Ger??te',
                ru: '???????????????? ????????????????????',
                pt: 'Dispositivos Convidados',
                nl: 'Gastapparaten',
                fr: 'Appareils invit??s',
                it: 'Dispositivi per gli ospiti',
                es: 'Dispositivos para invitados',
                pl: 'Urz??dzenia go??cinne',
                uk: '???????????????? ????????????????',
                'zh-cn': '????????????',
            },
        };

        const activityStateTexts = {
            en: {
                // 000-0999: Not present at home / Away
                0: 'Extended Absence',
                1: 'On the Road for Today',
                2: 'Way Home',

                // 100-899: Not present at home / Away: Custom Focus states (e.g. to sync with Apple Focus modes)
                100: 'Personal',
                101: 'Work',
                102: 'Mindfulness',
                103: 'Fitness',
                104: 'Reading',
                105: 'Gaming',
                106: 'Driving',
                107: 'Shopping',

                // 1000: WAKING TIME at home ///////////////////////////////////////////////////////////////////////
                1000: 'Home',

                // 1100-1899: WAKING TIME at home: Custom Focus states (e.g. to sync with Apple Focus modes)
                1100: 'Personal',
                1101: 'Work',
                1102: 'Mindfulness',
                1103: 'Fitness',
                1104: 'Reading',
                1105: 'Gaming',
                1106: 'Driving',
                1107: 'Shopping',

                // 1900-1999: WAKING TIME at home: Transitioning to Sleeping Time
                1900: 'Preparing Bedtime',
                1901: 'Getting to Bed',
                1902: 'In Bed',

                // 2000-2999: SLEEPING TIME at home ////////////////////////////////////////////////////////////////
                2000: 'Sleeping',

                // 2000-2099: SLEEPING TIME at home: While I should be sleeping
                2010: 'Awake during Night Time',
                2020: 'Asleep again',

                // 2100-2199: SLEEPING TIME at home: While I should get up
                2100: 'Wake-up Alarm',
                2101: '???? Alarm Snooze',
                2102: '???? Alarm Snooze',
                2103: '???????? Alarm Snooze',
                2104: '???????? Alarm Snooze',
                2105: '???????????? Alarm Snooze',

                // 2200-2299: SLEEPING TIME at home: Transitioning to Waking Time
                2200: 'Awakening after Wake-up Alarm',
                2210: 'Awakening',
            },
            de: {
                // 000-0999: Not present at home / Away
                0: 'L??ngere Abwesenheit',
                1: 'Unterwegs f??r heute',
                2: 'Nachhauseweg',

                // 100-899: Not present at home / Away: Custom Focus states (e.g. to sync with Apple Focus modes)
                100: 'Zeit f??r mich',
                101: 'Arbeiten',
                102: 'Achtsamkeit',
                103: 'Fitness',
                104: 'Lesen',
                105: 'Spielen',
                106: 'Fahren',
                107: 'Shopping',

                // 1000: WAKING TIME at home ///////////////////////////////////////////////////////////////////////
                1000: 'zu Hause',

                // 1100-1899: WAKING TIME at home: Custom Focus states (e.g. to sync with Apple Focus modes)
                1100: 'Zeit f??r mich',
                1101: 'Arbeiten',
                1102: 'Achtsamkeit',
                1103: 'Fitness',
                1104: 'Lesen',
                1105: 'Spielen',
                1106: 'Fahren',
                1107: 'Shopping',

                // 1900-1999: WAKING TIME at home: Transitioning to Sleeping Time
                1900: 'Auf Schlaf einstellen',
                1901: 'Bettfertig machen',
                1902: 'Im Bett',

                // 2000-2999: SLEEPING TIME at home ////////////////////////////////////////////////////////////////
                2000: 'Schlafen',

                // 2000-2099: SLEEPING TIME at home: While I should be sleeping
                2010: 'Wach w??hrend der Nacht',
                2020: 'Wieder eingeschlafen',

                // 2100-2199: SLEEPING TIME at home: While I should get up
                2100: 'Weckalarm',
                2101: '???? Schlummern',
                2102: '???? Schlummern',
                2103: '???????? Schlummern',
                2104: '???????? Schlummern',
                2105: '???????????? Schlummern',

                // 2200-2299: SLEEPING TIME at home: Transitioning to Waking Time
                2200: 'Aufwachen nach Weckruf',
                2210: 'Aufwachen',
            },
            // ru: {
            //     // 000-0999: Not present at home / Away
            //     0: '',
            //     1: '',
            //     2: '',

            //     // 100-899: Not present at home / Away: Custom Focus states (e.g. to sync with Apple Focus modes)
            //     100: '',
            //     101: '',
            //     102: '',
            //     103: '',
            //     104: '',
            //     105: '',
            //     106: '',
            //     107: '',

            //     // 1000: WAKING TIME at home ///////////////////////////////////////////////////////////////////////
            //     1000: '',

            //     // 1100-1899: WAKING TIME at home: Custom Focus states (e.g. to sync with Apple Focus modes)
            //     1100: '',
            //     1101: '',
            //     1102: '',
            //     1103: '',
            //     1104: '',
            //     1105: '',
            //     1106: '',
            //     1107: '',

            //     // 1900-1999: WAKING TIME at home: Transitioning to Sleeping Time
            //     1900: '',
            //     1901: '',
            //     1902: '',

            //     // 2000-2999: SLEEPING TIME at home ////////////////////////////////////////////////////////////////
            //     2000: '',

            //     // 2000-2099: SLEEPING TIME at home: While I should be sleeping
            //     2010: '',
            //     2020: '',

            //     // 2100-2199: SLEEPING TIME at home: While I should get up
            //     2100: '',
            //     2101: '',
            //     2102: '',
            //     2103: '',
            //     2104: '',
            //     2105: '',

            //     // 2200-2299: SLEEPING TIME at home: Transitioning to Waking Time
            //     2200: '',
            //     2210: '',
            // },
            // pt: {
            //     // 000-0999: Not present at home / Away
            //     0: '',
            //     1: '',
            //     2: '',

            //     // 100-899: Not present at home / Away: Custom Focus states (e.g. to sync with Apple Focus modes)
            //     100: '',
            //     101: '',
            //     102: '',
            //     103: '',
            //     104: '',
            //     105: '',
            //     106: '',
            //     107: '',

            //     // 1000: WAKING TIME at home ///////////////////////////////////////////////////////////////////////
            //     1000: '',

            //     // 1100-1899: WAKING TIME at home: Custom Focus states (e.g. to sync with Apple Focus modes)
            //     1100: '',
            //     1101: '',
            //     1102: '',
            //     1103: '',
            //     1104: '',
            //     1105: '',
            //     1106: '',
            //     1107: '',

            //     // 1900-1999: WAKING TIME at home: Transitioning to Sleeping Time
            //     1900: '',
            //     1901: '',
            //     1902: '',

            //     // 2000-2999: SLEEPING TIME at home ////////////////////////////////////////////////////////////////
            //     2000: '',

            //     // 2000-2099: SLEEPING TIME at home: While I should be sleeping
            //     2010: '',
            //     2020: '',

            //     // 2100-2199: SLEEPING TIME at home: While I should get up
            //     2100: '',
            //     2101: '',
            //     2102: '',
            //     2103: '',
            //     2104: '',
            //     2105: '',

            //     // 2200-2299: SLEEPING TIME at home: Transitioning to Waking Time
            //     2200: '',
            //     2210: '',
            // },
            // nl: {
            //     // 000-0999: Not present at home / Away
            //     0: '',
            //     1: '',
            //     2: '',

            //     // 100-899: Not present at home / Away: Custom Focus states (e.g. to sync with Apple Focus modes)
            //     100: '',
            //     101: '',
            //     102: '',
            //     103: '',
            //     104: '',
            //     105: '',
            //     106: '',
            //     107: '',

            //     // 1000: WAKING TIME at home ///////////////////////////////////////////////////////////////////////
            //     1000: '',

            //     // 1100-1899: WAKING TIME at home: Custom Focus states (e.g. to sync with Apple Focus modes)
            //     1100: '',
            //     1101: '',
            //     1102: '',
            //     1103: '',
            //     1104: '',
            //     1105: '',
            //     1106: '',
            //     1107: '',

            //     // 1900-1999: WAKING TIME at home: Transitioning to Sleeping Time
            //     1900: '',
            //     1901: '',
            //     1902: '',

            //     // 2000-2999: SLEEPING TIME at home ////////////////////////////////////////////////////////////////
            //     2000: '',

            //     // 2000-2099: SLEEPING TIME at home: While I should be sleeping
            //     2010: '',
            //     2020: '',

            //     // 2100-2199: SLEEPING TIME at home: While I should get up
            //     2100: '',
            //     2101: '',
            //     2102: '',
            //     2103: '',
            //     2104: '',
            //     2105: '',

            //     // 2200-2299: SLEEPING TIME at home: Transitioning to Waking Time
            //     2200: '',
            //     2210: '',
            // },
            // fr: {
            //     // 000-0999: Not present at home / Away
            //     0: '',
            //     1: '',
            //     2: '',

            //     // 100-899: Not present at home / Away: Custom Focus states (e.g. to sync with Apple Focus modes)
            //     100: '',
            //     101: '',
            //     102: '',
            //     103: '',
            //     104: '',
            //     105: '',
            //     106: '',
            //     107: '',

            //     // 1000: WAKING TIME at home ///////////////////////////////////////////////////////////////////////
            //     1000: '',

            //     // 1100-1899: WAKING TIME at home: Custom Focus states (e.g. to sync with Apple Focus modes)
            //     1100: '',
            //     1101: '',
            //     1102: '',
            //     1103: '',
            //     1104: '',
            //     1105: '',
            //     1106: '',
            //     1107: '',

            //     // 1900-1999: WAKING TIME at home: Transitioning to Sleeping Time
            //     1900: '',
            //     1901: '',
            //     1902: '',

            //     // 2000-2999: SLEEPING TIME at home ////////////////////////////////////////////////////////////////
            //     2000: '',

            //     // 2000-2099: SLEEPING TIME at home: While I should be sleeping
            //     2010: '',
            //     2020: '',

            //     // 2100-2199: SLEEPING TIME at home: While I should get up
            //     2100: '',
            //     2101: '',
            //     2102: '',
            //     2103: '',
            //     2104: '',
            //     2105: '',

            //     // 2200-2299: SLEEPING TIME at home: Transitioning to Waking Time
            //     2200: '',
            //     2210: '',
            // },
            // it: {
            //     // 000-0999: Not present at home / Away
            //     0: '',
            //     1: '',
            //     2: '',

            //     // 100-899: Not present at home / Away: Custom Focus states (e.g. to sync with Apple Focus modes)
            //     100: '',
            //     101: '',
            //     102: '',
            //     103: '',
            //     104: '',
            //     105: '',
            //     106: '',
            //     107: '',

            //     // 1000: WAKING TIME at home ///////////////////////////////////////////////////////////////////////
            //     1000: '',

            //     // 1100-1899: WAKING TIME at home: Custom Focus states (e.g. to sync with Apple Focus modes)
            //     1100: '',
            //     1101: '',
            //     1102: '',
            //     1103: '',
            //     1104: '',
            //     1105: '',
            //     1106: '',
            //     1107: '',

            //     // 1900-1999: WAKING TIME at home: Transitioning to Sleeping Time
            //     1900: '',
            //     1901: '',
            //     1902: '',

            //     // 2000-2999: SLEEPING TIME at home ////////////////////////////////////////////////////////////////
            //     2000: '',

            //     // 2000-2099: SLEEPING TIME at home: While I should be sleeping
            //     2010: '',
            //     2020: '',

            //     // 2100-2199: SLEEPING TIME at home: While I should get up
            //     2100: '',
            //     2101: '',
            //     2102: '',
            //     2103: '',
            //     2104: '',
            //     2105: '',

            //     // 2200-2299: SLEEPING TIME at home: Transitioning to Waking Time
            //     2200: '',
            //     2210: '',
            // },
            // es: {
            //     // 000-0999: Not present at home / Away
            //     0: '',
            //     1: '',
            //     2: '',

            //     // 100-899: Not present at home / Away: Custom Focus states (e.g. to sync with Apple Focus modes)
            //     100: '',
            //     101: '',
            //     102: '',
            //     103: '',
            //     104: '',
            //     105: '',
            //     106: '',
            //     107: '',

            //     // 1000: WAKING TIME at home ///////////////////////////////////////////////////////////////////////
            //     1000: '',

            //     // 1100-1899: WAKING TIME at home: Custom Focus states (e.g. to sync with Apple Focus modes)
            //     1100: '',
            //     1101: '',
            //     1102: '',
            //     1103: '',
            //     1104: '',
            //     1105: '',
            //     1106: '',
            //     1107: '',

            //     // 1900-1999: WAKING TIME at home: Transitioning to Sleeping Time
            //     1900: '',
            //     1901: '',
            //     1902: '',

            //     // 2000-2999: SLEEPING TIME at home ////////////////////////////////////////////////////////////////
            //     2000: '',

            //     // 2000-2099: SLEEPING TIME at home: While I should be sleeping
            //     2010: '',
            //     2020: '',

            //     // 2100-2199: SLEEPING TIME at home: While I should get up
            //     2100: '',
            //     2101: '',
            //     2102: '',
            //     2103: '',
            //     2104: '',
            //     2105: '',

            //     // 2200-2299: SLEEPING TIME at home: Transitioning to Waking Time
            //     2200: '',
            //     2210: '',
            // },
            // pl: {
            //     // 000-0999: Not present at home / Away
            //     0: '',
            //     1: '',
            //     2: '',

            //     // 100-899: Not present at home / Away: Custom Focus states (e.g. to sync with Apple Focus modes)
            //     100: '',
            //     101: '',
            //     102: '',
            //     103: '',
            //     104: '',
            //     105: '',
            //     106: '',
            //     107: '',

            //     // 1000: WAKING TIME at home ///////////////////////////////////////////////////////////////////////
            //     1000: '',

            //     // 1100-1899: WAKING TIME at home: Custom Focus states (e.g. to sync with Apple Focus modes)
            //     1100: '',
            //     1101: '',
            //     1102: '',
            //     1103: '',
            //     1104: '',
            //     1105: '',
            //     1106: '',
            //     1107: '',

            //     // 1900-1999: WAKING TIME at home: Transitioning to Sleeping Time
            //     1900: '',
            //     1901: '',
            //     1902: '',

            //     // 2000-2999: SLEEPING TIME at home ////////////////////////////////////////////////////////////////
            //     2000: '',

            //     // 2000-2099: SLEEPING TIME at home: While I should be sleeping
            //     2010: '',
            //     2020: '',

            //     // 2100-2199: SLEEPING TIME at home: While I should get up
            //     2100: '',
            //     2101: '',
            //     2102: '',
            //     2103: '',
            //     2104: '',
            //     2105: '',

            //     // 2200-2299: SLEEPING TIME at home: Transitioning to Waking Time
            //     2200: '',
            //     2210: '',
            // },
            // uk: {
            //     // 000-0999: Not present at home / Away
            //     0: '',
            //     1: '',
            //     2: '',

            //     // 100-899: Not present at home / Away: Custom Focus states (e.g. to sync with Apple Focus modes)
            //     100: '',
            //     101: '',
            //     102: '',
            //     103: '',
            //     104: '',
            //     105: '',
            //     106: '',
            //     107: '',

            //     // 1000: WAKING TIME at home ///////////////////////////////////////////////////////////////////////
            //     1000: '',

            //     // 1100-1899: WAKING TIME at home: Custom Focus states (e.g. to sync with Apple Focus modes)
            //     1100: '',
            //     1101: '',
            //     1102: '',
            //     1103: '',
            //     1104: '',
            //     1105: '',
            //     1106: '',
            //     1107: '',

            //     // 1900-1999: WAKING TIME at home: Transitioning to Sleeping Time
            //     1900: '',
            //     1901: '',
            //     1902: '',

            //     // 2000-2999: SLEEPING TIME at home ////////////////////////////////////////////////////////////////
            //     2000: '',

            //     // 2000-2099: SLEEPING TIME at home: While I should be sleeping
            //     2010: '',
            //     2020: '',

            //     // 2100-2199: SLEEPING TIME at home: While I should get up
            //     2100: '',
            //     2101: '',
            //     2102: '',
            //     2103: '',
            //     2104: '',
            //     2105: '',

            //     // 2200-2299: SLEEPING TIME at home: Transitioning to Waking Time
            //     2200: '',
            //     2210: '',
            // },
            // 'zh-cn': {
            //     // 000-0999: Not present at home / Away
            //     0: '',
            //     1: '',
            //     2: '',

            //     // 100-899: Not present at home / Away: Custom Focus states (e.g. to sync with Apple Focus modes)
            //     100: '',
            //     101: '',
            //     102: '',
            //     103: '',
            //     104: '',
            //     105: '',
            //     106: '',
            //     107: '',

            //     // 1000: WAKING TIME at home ///////////////////////////////////////////////////////////////////////
            //     1000: '',

            //     // 1100-1899: WAKING TIME at home: Custom Focus states (e.g. to sync with Apple Focus modes)
            //     1100: '',
            //     1101: '',
            //     1102: '',
            //     1103: '',
            //     1104: '',
            //     1105: '',
            //     1106: '',
            //     1107: '',

            //     // 1900-1999: WAKING TIME at home: Transitioning to Sleeping Time
            //     1900: '',
            //     1901: '',
            //     1902: '',

            //     // 2000-2999: SLEEPING TIME at home ////////////////////////////////////////////////////////////////
            //     2000: '',

            //     // 2000-2099: SLEEPING TIME at home: While I should be sleeping
            //     2010: '',
            //     2020: '',

            //     // 2100-2199: SLEEPING TIME at home: While I should get up
            //     2100: '',
            //     2101: '',
            //     2102: '',
            //     2103: '',
            //     2104: '',
            //     2105: '',

            //     // 2200-2299: SLEEPING TIME at home: Transitioning to Waking Time
            //     2200: '',
            //     2210: '',
            // },
        };

        const activityLang = activityStateTexts[this.language]
            ? activityStateTexts[this.language]
            : activityStateTexts.en;
        const activityStates = {
            0: '',
        };

        // add Focus Modes
        if (
            this.config.focusStates != undefined &&
            typeof this.config.focusStates == 'object' &&
            this.config.focusStates.length > 0
        ) {
            for (const key in this.config.focusStates) {
                const awayFocusKey = Number(key) + 100;
                const homeFocusKey = Number(key) + 100 + 1000;
                if (
                    this.config.focusStates[key].enabled != undefined &&
                    this.config.focusStates[key].enabled == false
                ) {
                    delete activityLang[awayFocusKey];
                    delete activityLang[homeFocusKey];
                    continue;
                }
                if (
                    this.config.focusStates[key].text != '' &&
                    this.config.focusStates[key].text != activityStateTexts['en'][awayFocusKey]
                ) {
                    activityLang[awayFocusKey] = this.config.focusStates[key].text;
                    activityLang[homeFocusKey] = this.config.focusStates[key].text;
                }
            }
        } else {
            this.log.error('Configuration error: config.focusStates has invalid format');
        }

        // add Custom Focus Modes
        if (this.config.customFocusStates != undefined && this.config.customFocusStates.length > 0) {
            for (const key in this.config.customFocusStates) {
                // Limit custom focus modes to maximum of 100
                if (Number(key) > 99) {
                    this.log.error('Reached maximum limit of 100 Custom Focus Modes.');
                    break;
                }
                if (
                    // @ts-ignore
                    (this.config.customFocusStates[key].enabled != undefined &&
                        // @ts-ignore
                        this.config.customFocusStates[key].enabled == false) ||
                    // @ts-ignore
                    this.config.customFocusStates[key].text == undefined ||
                    // @ts-ignore
                    this.config.customFocusStates[key].text == ''
                )
                    continue;

                const awayFocusKey = Number(key) + 200;
                const homeFocusKey = Number(key) + 200 + 1000;

                // @ts-ignore
                activityLang[awayFocusKey] = this.config.customFocusStates[key].text;
                // @ts-ignore
                activityLang[homeFocusKey] = this.config.customFocusStates[key].text;
            }
        }

        const offStateTexts = {
            en: 'Off',
            de: 'Aus',
            ru: '?? ??????????',
            pt: 'Desligado',
            nl: 'Uit',
            fr: 'D??sactiv??',
            it: 'Spento',
            es: 'Apagado',
            pl: 'Wy??.',
            uk: '????????????????',
            'zh-cn': '?????????',
        };
        let offLang = offStateTexts[this.language] ? offStateTexts[this.language] : offStateTexts.en;
        if (this.config.stateTranslations != undefined && this.config.stateTranslations[0] != undefined) {
            if (
                this.config.stateTranslations[0].text != '' &&
                this.config.stateTranslations[0].text != offStateTexts.en
            )
                offLang = this.config.stateTranslations[0].text;
            if (this.config.stateTranslations[0].icon != '')
                offLang = this.config.stateTranslations[0].icon + ' ' + offLang;
        }

        const focusStateTexts = {
            en: 'Focus',
            de: 'Fokus',
            ru: '??????????',
            pt: 'Foco',
            nl: 'Focus',
            fr: 'Focus',
            it: 'Focus',
            es: 'Focus',
            pl: 'Focus',
            uk: '??????????',
            'zh-cn': '??????',
        };
        const focusLang = focusStateTexts[this.language] ? focusStateTexts[this.language] : focusStateTexts.en;

        const focusStates = {
            away: {
                0: offLang,
            },
            home: {
                0: offLang,
            },
        };

        for (const key in activityLang) {
            let customActivityState;
            if (this.config.activityStates != undefined)
                customActivityState = this.config.activityStates.filter((obj) => {
                    return obj.id == Number(key);
                })[0];
            activityLang[key] = {
                text:
                    customActivityState != undefined &&
                    customActivityState.text != '' &&
                    customActivityState.text != activityStateTexts['en'][key]
                        ? customActivityState.text
                        : activityLang[key],
            };

            const regexp = /^([^:]*):\s*(.+)$/;
            const match = activityLang[key].text.match(regexp);

            // Extract custom prefix from text
            if (match) {
                if (match[1].trim() != '') activityLang[key].prefix = match[1].trim();
                activityLang[key].text = match[2].trim();
            }

            // Add prefix from residential state
            else {
                // Away
                if (Number(key) >= 0 && Number(key) < 1000) {
                    if (activityLang[key].text != residentialLang[1].text)
                        activityLang[key].prefix = residentialLang[1].text;
                }

                // Focus modes
                else if (Number(key) >= 1100 && Number(key) < 1300) {
                    activityLang[key].prefix = focusLang;
                }

                // Wind Down
                else if (Number(key) == 1900) {
                    if (activityLang[key].text != residentialLang[6].text)
                        activityLang[key].prefix = residentialLang[6].text;
                }

                // Bedtime
                else if (Number(key) == 1901) {
                    if (activityLang[key].text != residentialLang[7].text)
                        activityLang[key].prefix = residentialLang[7].text;
                }

                // In Bed
                else if (Number(key) == 1902) {
                    if (activityLang[key].text != residentialLang[11].text)
                        activityLang[key].prefix = residentialLang[11].text;
                }

                // Home
                else if (Number(key) >= 1000 && Number(key) < 2000) {
                    if (activityLang[key].text != residentialLang[4].text)
                        activityLang[key].prefix = residentialLang[4].text;
                }

                // Wake-up
                else if (Number(key) >= 2101 && Number(key) < 2200) {
                    if (activityLang[key].text != residentialLang[10].text)
                        activityLang[key].prefix = residentialLang[10].text;
                }

                // Awoken
                else if (Number(key) >= 2200 && Number(key) < 2300) {
                    if (activityLang[key].text != residentialLang[8].text)
                        activityLang[key].prefix = residentialLang[8].text;
                }

                // Night
                else if (Number(key) >= 2000) {
                    if (activityLang[key].text != residentialLang[11].text)
                        activityLang[key].prefix = residentialLang[11].text;
                }
            }

            // Add custom activity icons
            if (customActivityState != undefined && customActivityState.icon != '') {
                activityLang[key].icon = customActivityState.icon;
            }

            // Add icons from residential state
            else {
                let focusIndex = Number(key) - 100;
                if (focusIndex >= 1000) focusIndex -= 1000;
                let customFocusIndex = Number(key) - 200;
                if (customFocusIndex >= 1000) customFocusIndex -= 1000;

                // Away
                if (Number(key) == 0) {
                    activityLang[key].icon = residentialLang[0].icon;
                } else if (Number(key) == 2) {
                    activityLang[key].icon = residentialLang[3].icon;
                } else if (Number(key) >= 1 && Number(key) < 100) {
                    activityLang[key].icon = residentialLang[1].icon;
                }

                // Focus modes
                else if ((Number(key) >= 100 && Number(key) < 200) || (Number(key) >= 1100 && Number(key) < 1200)) {
                    if (this.config.focusStates[focusIndex].icon != '')
                        activityLang[key].icon = this.config.focusStates[focusIndex].icon;
                }

                // Custom Focus modes
                else if ((Number(key) >= 200 && Number(key) < 300) || (Number(key) >= 1200 && Number(key) < 1300)) {
                    // @ts-ignore
                    if (this.config.customFocusStates[customFocusIndex].icon != '')
                        // @ts-ignore
                        activityLang[key].icon = this.config.customFocusStates[customFocusIndex].icon;
                }

                // Wind Down
                else if (Number(key) == 1900) {
                    activityLang[key].icon = residentialLang[6].icon;
                }

                // Bedtime
                else if (Number(key) >= 1901 && Number(key) < 2000) {
                    activityLang[key].icon = residentialLang[7].icon;
                }

                // Home
                else if (Number(key) >= 1000 && Number(key) < 2000) {
                    activityLang[key].icon = residentialLang[4].icon;
                }

                // Awake at night
                else if (Number(key) == 2010) {
                    activityLang[key].icon = residentialLang[9].icon;
                }

                // Wake-up
                else if (Number(key) >= 2100 && Number(key) < 2200) {
                    activityLang[key].icon = residentialLang[10].icon;
                }

                // Awoken
                else if (Number(key) >= 2200 && Number(key) < 2300) {
                    activityLang[key].icon = residentialLang[8].icon;
                }

                // Night
                else if (Number(key) >= 2000) {
                    activityLang[key].icon = residentialLang[11].icon;
                }
            }

            activityLang[key].state =
                (activityLang[key].icon ? activityLang[key].icon + ' ' : '') +
                (activityLang[key].prefix ? activityLang[key].prefix + ': ' : '') +
                activityLang[key].text;
            activityStates[key] = activityLang[key].state;

            // Consider no active focus as Off and
            // map as 0 to comply with boolean standards
            if (Number(key) == 1000) {
                focusStates['away'][0] = offLang;
                focusStates['home'][0] = offLang;
            }

            // Only numbers between 100-299 or 1100-1299 for activity.focus
            else if ((Number(key) >= 100 && Number(key) < 300) || (Number(key) >= 1100 && Number(key) < 1300)) {
                const stateVal = (activityLang[key].icon ? activityLang[key].icon + ' ' : '') + activityLang[key].text;
                let focusIndex = Number(key) - 100;
                if (focusIndex >= 1000) focusIndex -= 1000;
                let customFocusIndex = Number(key) - 200;
                if (customFocusIndex >= 1000) customFocusIndex -= 1000;

                // Check away usage for Focus Modes
                if (Number(key) >= 100 && Number(key) < 200 && this.config.focusStates[focusIndex].away == true) {
                    focusStates['away'][key] = stateVal;
                }
                // Check home usage for Focus Modes
                else if (
                    Number(key) >= 1100 &&
                    Number(key) < 1200 &&
                    this.config.focusStates[focusIndex].home == true
                ) {
                    focusStates['home'][key] = stateVal;
                }

                // Check away usage Custom Focus Modes
                else if (
                    Number(key) >= 200 &&
                    Number(key) < 300 &&
                    // @ts-ignore
                    this.config.customFocusStates[customFocusIndex].away == true
                ) {
                    focusStates['away'][key] = stateVal;
                }
                // Check home usage Custom Focus Modes
                else if (
                    Number(key) >= 1200 &&
                    Number(key) < 1300 &&
                    // @ts-ignore
                    this.config.customFocusStates[customFocusIndex].home == true
                ) {
                    focusStates['home'][key] = stateVal;
                }
            }

            // DND variants for activity.state
            if (Number(key) < 1000 || Number(key) >= 2000) continue;
            const dndKey = Number(key) + 10000;
            activityStates[dndKey] =
                (residentialLang[5].icon ? residentialLang[5].icon + ' ' : '') +
                residentialLang[5].text +
                (dndKey != 11000
                    ? (activityLang[key].icon ? ': ' + activityLang[key].icon : ':') +
                      (activityLang[key].prefix ? ' ' + activityLang[key].prefix : '') +
                      (activityLang[key].prefix
                          ? ' | ' + activityLang[key].text
                          : (activityLang[key].icon ? ' ' : '') + activityLang[key].text)
                    : '');
        }

        const residentTypes = ['roomie', 'pet', 'guest'];
        for (const key1 in residentTypes) {
            const residentType = residentTypes[key1];
            if (this.config[residentType] == undefined) continue;
            for (const key2 in this.config[residentType]) {
                await this.setObjectNotExistsAsync(residentType, {
                    type: 'folder',
                    common: {
                        name: residentTypeName[residentType],
                        icon: residentType + '.svg',
                    },
                    native: {},
                });

                const resident = this.config[residentType][key2];
                const name = resident['name'].trim();
                const id = residentType + '.' + this.cleanNamespace(resident['id'] ? resident['id'] : name);
                this.config[residentType][key2]['id'] = id;

                // TODO: see other to-do below
                // TODO: also add roomies from other instances
                const foreignResidents = {};
                this.roomies.forEach((e) => {
                    const key = e.id;
                    if (key != id) {
                        const value = e.name;
                        foreignResidents[key] = value;
                    }
                });

                await this.setObjectNotExistsAsync(id, {
                    type: 'device',
                    common: {
                        name: name,
                        icon: residentType + '.svg',
                    },
                    native: {},
                });

                await this.setObjectNotExistsAsync(
                    id + '.enabled',
                    {
                        type: 'state',
                        common: {
                            name: {
                                en: name + ' is within distance?',
                                de: name + ' ist in Reichweite?',
                                ru: name + ' ?????????????????? ?? ???????????????? ?????????????????????',
                                pt: name + ' est?? a uma dist??ncia?',
                                nl: name + 'is binnen de afstand?',
                                fr: name + ' est ?? distance?',
                                it: name + ' ?? a distanza?',
                                es: name + ' est?? a poca distancia?',
                                pl: name + 'jest w odleg??o??ci ok?',
                                uk: name + ' ?????????????????????? ???? ?????????????????',
                                'zh-cn': '??????+?????????????',
                            },
                            type: 'boolean',
                            role: 'switch.enable',
                            read: true,
                            write: true,
                            def: false,
                            desc: {
                                en: 'Reachability state',
                                de: 'Erreichbarkeitsstatus',
                                ru: '?????????????????? ??????????????????????',
                                pt: 'Estado de alcance',
                                nl: 'Vertaling',
                                fr: '??tat de la responsabilit??',
                                it: 'Stato di adesione',
                                es: 'Estado de responsabilidad',
                                pl: 'Pa??stwo Reaktywno??ci',
                                uk: '???????????? ????????????????????',
                                'zh-cn': 'B. ????????????',
                            },
                        },
                        native: {},
                    },
                    {
                        preserve: {
                            common: ['name'],
                        },
                    },
                );

                await this.setObjectNotExistsAsync(id + '.info', {
                    type: 'folder',
                    common: {
                        name: {
                            en: 'Information about ' + name,
                            de: 'Informationen ??ber ' + name,
                            ru: '???????????????????? ?? ' + name,
                            pt: 'Informa????o sobre ' + name,
                            nl: 'Informatie over ' + name,
                            fr: 'Informations sur ' + name,
                            it: 'Informazioni su ' + name,
                            es: 'Informaci??n sobre ' + name,
                            pl: 'Informacja o ' + name,
                            uk: '???????????????????? ?????? ' + name,
                            'zh-cn': '?????????+??????????????????',
                        },
                    },
                    native: {},
                });

                await this.setObjectNotExistsAsync(id + '.info.name', {
                    type: 'state',
                    common: {
                        name: {
                            en: 'Display name for ' + this.namespace + '.' + id,
                            de: 'Anzeigename f??r ' + this.namespace + '.' + id,
                            ru: '?????? ?????????????? ?????? ' + this.namespace + '.' + id,
                            pt: 'Nome de exibi????o para ' + this.namespace + '.' + id,
                            nl: 'Vertaling ' + this.namespace + '.' + id,
                            fr: "Nom d'affichage pour " + this.namespace + '.' + id,
                            it: 'Visualizzazione nome per ' + this.namespace + '.' + id,
                            es: 'Nombre de la pantalla para ' + this.namespace + '.' + id,
                            pl: 'Dysplay name for ' + this.namespace + '.' + id,
                            uk: '?????????? ???????????? ?????? ' + this.namespace + '.' + id,
                            'zh-cn': this.namespace + '.' + id + ' ????????????',
                        },
                        type: 'string',
                        role: 'text.resident.name',
                        read: true,
                        write: false,
                    },
                    native: {},
                });
                await this.setStateChangedAsync(id + '.info.name', { val: name, ack: true });

                await this.setObjectNotExistsAsync(id + '.info.presence', {
                    type: 'channel',
                    common: {
                        name: {
                            en: 'Information about presence of ' + name,
                            de: 'Informationen ??ber die Anwesenheit von ' + name,
                            ru: '???????????????????? ?? ?????????????? ' + name,
                            pt: 'Informa????????es sobre a presen??a de ' + name,
                            nl: 'Informatie over aanwezigheid van ' + name,
                            fr: 'Informations sur la pr??sence de ' + name,
                            it: 'Informazioni sulla presenza di ' + name,
                            es: 'Informaci??n sobre la presencia de ' + name,
                            pl: 'Informacja o obecno??ci ' + name,
                            uk: '???????????????????? ?????? ?????????????????? ' + name,
                            'zh-cn': name + ' ???????????????????????????',
                        },
                    },
                    native: {},
                });

                await this.setObjectNotExistsAsync(id + '.info.presence.lastHome', {
                    type: 'state',
                    common: {
                        name: {
                            en: name + ' came home last',
                            de: name + ' kam zuletzt nach Hause',
                            ru: name + ' ???????????????? ?????????? ??????????????????',
                            pt: name + ' chegou a casa por ??ltimo',
                            nl: name + ' kwam laatst thuis',
                            fr: name + ' est rentr?? en dernier',
                            it: name + ' ?? tornato a casa per ultimo',
                            es: name + ' lleg?? a casa el ??ltimo',
                            pl: name + ' wr??ci?? do domu ostatnio',
                            uk: name + ' ?????????????? ???????????? ????????????????',
                            'zh-cn': name + ' ???????????????',
                        },
                        type: 'string',
                        role: 'text.residents.lastHome',
                        read: true,
                        write: false,
                        desc: {
                            en: 'Weekday and time when ' + name + ' last came home',
                            de: 'Wochentag und Uhrzeit, wann ' + name + ' zuletzt nach Hause gekommen ist',
                            ru: '???????? ???????????? ?? ??????????, ?????????? ' + name + ' ?? ?????????????????? ?????? ???????????????? ??????????',
                            pt: 'Dia da semana e hora da ??ltima vez que ' + name + ' regressou a casa',
                            nl: 'Weekdag en tijdstip waarop ' + name + ' voor het laatst thuis kwam',
                            fr:
                                'Jour de la semaine et heure ?? laquelle ' +
                                name +
                                ' est rentr?? pour la derni??re fois ?? la maison',
                            it: 'Giorno della settimana e ora in cui ' + name + " ?? tornato a casa per l'ultima volta",
                            es: 'D??a de la semana y hora en que ' + name + ' lleg?? a casa por ??ltima vez',
                            pl: 'Dzie?? tygodnia i godzina, kiedy ' + name + ' ostatni raz wr??ci?? do domu',
                            uk: '???????? ?????????? ???? ??????, ???????? ' + name + ' ???????????????? ???????????????????? ????????????',
                            'zh-cn': name + ' ???????????????????????????????????????',
                        },
                    },
                    native: {},
                });

                await this.setObjectNotExistsAsync(id + '.info.presence.lastAway', {
                    type: 'state',
                    common: {
                        name: {
                            en: name + ' left home last',
                            de: name + ' verlie?? zuletzt das Haus',
                            ru: name + ' ???????? ???? ???????? ??????????????????',
                            pt: name + ' saiu de casa por ??ltimo',
                            nl: name + ' vertrok laatst van huis',
                            fr: name + ' a quitt?? la maison en dernier',
                            it: name + " ?? uscito di casa l'ultima volta",
                            es: name + ' sali?? de casa el pasado',
                            pl: name + ' wyszed?? z domu jako ostatni',
                            uk: name + ' ?????????? ?? ???????? ????????????????',
                            'zh-cn': name + ' ???????????????',
                        },
                        type: 'string',
                        role: 'text.residents.lastAway',
                        read: true,
                        write: false,
                        desc: {
                            en: 'Weekday and time when ' + name + ' last left home',
                            de: 'Wochentag und Uhrzeit, wann ' + name + ' zuletzt das Hause verlassen hat',
                            ru: '???????? ???????????? ?? ??????????, ?????????? ' + name + ' ?? ?????????????????? ?????? ???????????? ???? ????????',
                            pt: 'Dia e hora da semana em que ' + name + ' saiu pela ??ltima vez de casa',
                            nl: 'Weekdag en tijdstip waarop ' + name + ' het laatst van huis is vertrokken',
                            fr:
                                'Jour de la semaine et heure ?? laquelle ' +
                                name +
                                ' a quitt?? son domicile pour la derni??re fois.',
                            it: 'Giorno e ora in cui ' + name + " ?? uscito di casa per l'ultima volta",
                            es: 'D??a de la semana y hora en que ' + name + ' sali?? de casa por ??ltima vez',
                            pl: 'Dzie?? tygodnia i godzina, kiedy ' + name + ' ostatni raz wyszed?? z domu',
                            uk: '???????? ?????????? ???? ??????, ???????? ' + name + ' ???????????????? ?????????????? ?? ????????',
                            'zh-cn': name + ' ???????????????????????????????????????',
                        },
                    },
                    native: {},
                });

                // Night/Awoken statistics and activity support not for pets
                if (residentType != 'pet') {
                    await this.setObjectNotExistsAsync(id + '.info.presence.lastNight', {
                        type: 'state',
                        common: {
                            name: {
                                en: name + ' went to sleep last',
                                de: name + ' hat sich zuletzt schlafen gelegt',
                                ru: name + ' ?????????? ??????????????????',
                                pt: name + ' foi dormir por ??ltimo',
                                nl: name + ' is laatst gaan slapen',
                                fr: name + " s'est couch?? en dernier",
                                it: name + ' ?? andato a dormire per ultimo',
                                es: name + ' se ha ido a dormir el ??ltimo',
                                pl: name + ' poszed?? spa?? ostatni raz',
                                uk: name + ' ?????????? ?????????? ????????????????',
                                'zh-cn': name + ' ????????????????????????',
                            },
                            type: 'string',
                            role: 'text.residents.lastNight',
                            read: true,
                            write: false,
                            desc: {
                                en: 'Weekday and time when ' + name + ' last went to sleep',
                                de: 'Wochentag und Uhrzeit, wann ' + name + ' sich zuletzt schlafen gelegt hat',
                                ru: '???????? ???????????? ?? ??????????, ?????????? ' + name + ' ?? ?????????????????? ?????? ?????????????? ??????????',
                                pt: 'Dia da semana e hora da ??ltima vez que ' + name + ' adormeceu',
                                nl: 'Weekdag en tijd waarop ' + name + ' voor het laatst ging slapen',
                                fr: 'Jour de la semaine et heure du dernier coucher de ' + name + '',
                                it:
                                    'Giorno della settimana e ora in cui ' +
                                    name +
                                    " ?? andato a dormire per l'ultima volta",
                                es: 'D??a de la semana y hora a la que ' + name + ' se fue a dormir por ??ltima vez',
                                pl: 'Dzie?? tygodnia i godzina, kiedy ' + name + ' ostatnio poszed?? spa??',
                                uk: '???????? ?????????? ???? ??????, ???????? ' + name + ' ???????????????? ?????????? ??????????',
                                'zh-cn': name + ' ???????????????????????????????????????',
                            },
                        },
                        native: {},
                    });

                    await this.setObjectNotExistsAsync(id + '.info.presence.lastAwoken', {
                        type: 'state',
                        common: {
                            name: {
                                en: name + ' woke up last',
                                de: name + ' ist zuletzt aufgewacht',
                                ru: name + ' ?????????????????? ??????????????????',
                                pt: name + ' acordou por ??ltimo',
                                nl: name + ' werd laatst wakker',
                                fr: name + " s'est r??veill?? hier",
                                it: name + " si ?? svegliato l'ultima volta",
                                es: name + ' se despert?? el pasado',
                                pl: name + ' obudzi?? si?? ostatnio',
                                uk: name + ' ???????????????????? ????????????????',
                                'zh-cn': name + ' ?????????????????????',
                            },
                            type: 'string',
                            role: 'text.residents.lastAwoken',
                            read: true,
                            write: false,
                            desc: {
                                en: 'Weekday and time when ' + name + ' last woke up',
                                de: 'Wochentag und Uhrzeit, wann ' + name + ' zuletzt aufgewacht ist',
                                ru: '???????? ???????????? ?? ??????????, ?????????? ' + name + ' ?? ?????????????????? ?????? ????????????????????',
                                pt: 'Dia e hora da semana em que ' + name + ' acordou pela ??ltima vez',
                                nl: 'Weekdag en tijd waarop ' + name + ' voor het laatst wakker werd',
                                fr: 'Jour de la semaine et heure du dernier r??veil de ' + name,
                                it: "Giorno della settimana e ora dell'ultimo risveglio di " + name,
                                es: 'D??a de la semana y hora en que ' + name + ' se despert?? por ??ltima vez',
                                pl: 'Dzie?? tygodnia i godzina, kiedy ' + name + ' ostatnio si?? obudzi??',
                                uk: '???????? ?????????? ???? ??????, ???????? ' + name + ' ???????????????? ????????????????????',
                                'zh-cn': name + ' ???????????????????????????????????????',
                            },
                        },
                        native: {},
                    });

                    await this.setObjectNotExistsAsync(id + '.activity', {
                        type: 'channel',
                        common: {
                            name: {
                                en: 'Activity states of ' + name,
                                de: 'Aktivit??tsstatus von ' + name,
                                ru: '?????????????????? ???????????????????????? ' + name,
                                pt: 'Estados de atividade de ' + name,
                                nl: 'Activiteit staat van ' + name,
                                fr: "??tat d'activit?? de " + name,
                                it: 'Stati di attivit?? di ' + name,
                                es: 'Estado de actividad de ' + name,
                                pl: 'Aktywno???? stan??w ' + name,
                                uk: '?????????? ???????????????????? ' + name,
                                'zh-cn': name + ' ?????????',
                            },
                        },
                        native: {},
                    });

                    await this.setObjectNotExistsAsync(
                        id + '.activity.state',
                        {
                            type: 'state',
                            common: {
                                name: {
                                    en: name + ' activity state',
                                    de: name + ' Aktivit??tsstatus',
                                    ru: name + ' ???????????????????? ??????????????????????',
                                    pt: 'estado de atividade ' + name,
                                    nl: name + ' activiteit staat',
                                    fr: "??tat de l ' activit?? " + name,
                                    it: name + ' attivit?? stato',
                                    es: 'estado de actividad ' + name,
                                    pl: 'pa??stwo aktywno??ci ' + name,
                                    uk: '???????? ???????????????????? ' + name,
                                    'zh-cn': name + ' ???????????????',
                                },
                                type: 'number',
                                role: 'level.mode.resident.activity',
                                min: 0,
                                max: 12999,
                                read: true,
                                write: false,
                                def: 0,
                                desc: {
                                    en: 'Resident activity state',
                                    de: 'Bewohner Aktivit??tsstatus',
                                    ru: '?????????????????????????????? ????????????????????????',
                                    pt: 'Estado de atividade residente',
                                    nl: 'Husident activiteit',
                                    fr: '??tat r??sident',
                                    it: 'Stato di attivit?? residenziale',
                                    es: 'Estado de actividad residente',
                                    pl: 'Stany Zjednoczone',
                                    uk: '???????????????? ????????????????????',
                                    'zh-cn': '???????????????',
                                },
                                states: activityStates,
                            },
                            native: {},
                        },
                        {
                            preserve: {
                                common: ['name'],
                            },
                        },
                    );
                    // Update common.states
                    let currentObject = await this.getObjectAsync(id + '.activity.state');
                    if (currentObject) {
                        currentObject.common.states = activityStates;
                        await this.setObjectAsync(id + '.activity.state', currentObject);
                    }

                    await this.setObjectNotExistsAsync(
                        id + '.activity.focus',
                        {
                            type: 'state',
                            common: {
                                name: {
                                    en: name + ' has set this focus',
                                    de: name + ' hat diesen Fokus gesetzt',
                                    ru: name + ' ?????????????????? ???????? ??????????',
                                    pt: name + ' definiu este foco',
                                    nl: name + ' heeft deze focus',
                                    fr: name + ' a d??fini cet objectif',
                                    it: name + ' ha impostato questo focus',
                                    es: name + ' ha establecido este enfoque',
                                    pl: name + ' zak??ada??o to skupienie si?? na ten temat',
                                    uk: name + ' ???????????????????? ?????? ??????????',
                                    'zh-cn': '????????????????????????????????????',
                                },
                                type: 'number',
                                role: 'level.mode.resident.focus',
                                min: 0,
                                max: 12999,
                                read: true,
                                write: true,
                                def: 0,
                                desc: {
                                    en: 'The focus the resident has set for themself.',
                                    de: 'Der Fokus, den der Bewohner f??r sich gesetzt hat.',
                                    ru: '?????????????????????????????? ???? ??????, ?????? ???????????????? ???????????????? ???? ????????.',
                                    pt: 'O foco que o residente estabeleceu deles.',
                                    nl: 'De concentratie die de bewoner van henzelf heeft gemaakt.',
                                    fr: "L'accent que le r??sident a mis de lui-m??me.",
                                    it: 'Il focus che il residente ha impostato da loro stessi.',
                                    es: 'El enfoque que el residente ha establecido de ellos mismo.',
                                    pl: 'Skoncentrowa?? si?? na tym, ??e rezydent od nich sam.',
                                    uk: '?? ???????????? ?????????????????? ?????????????????????? ?????? ????????.',
                                    'zh-cn': '????????????????????????????????????.',
                                },
                                states: focusStates['away'],
                            },
                            native: {
                                states: {
                                    away: focusStates['away'],
                                    home: focusStates['home'],
                                },
                            },
                        },
                        {
                            preserve: {
                                common: ['name'],
                            },
                        },
                    );
                    // Update common.states
                    currentObject = await this.getObjectAsync(id + '.activity.focus');
                    if (currentObject) {
                        currentObject.native.states.away = focusStates['away'];
                        currentObject.native.states.home = focusStates['home'];
                        currentObject.common.states = focusStates['away'];

                        const presenceState = await this.getStateAsync(id + '.presence.state');
                        if (presenceState != undefined && presenceState.val != undefined && presenceState.val > 0)
                            currentObject.common.states = focusStates['home'];
                        await this.setObjectAsync(id + '.activity.focus', currentObject);
                    }

                    await this.setObjectNotExistsAsync(
                        id + '.activity.awake',
                        {
                            type: 'state',
                            common: {
                                name: {
                                    en: name + ' is awake at night?',
                                    de: name + ' ist nachts wach?',
                                    ru: name + ' ???????????????????????? ???????????',
                                    pt: name + ' est?? acordado ?? noite?',
                                    nl: name + " is 's nachts wakker?",
                                    fr: name + ' est r??veill??e la nuit ?',
                                    it: name + " e' sveglia di notte?",
                                    es: '??' + name + ' est?? despierto por la noche?',
                                    pl: name + ' jest noc???',
                                    uk: name + ' ???? ???????????? ???????',
                                    'zh-cn': name + ' ??????????????????wak?',
                                },
                                type: 'boolean',
                                role: 'switch.mode.resident.awake',
                                read: true,
                                write: true,
                                def: false,
                                desc: {
                                    en: 'Is this resident awake at night right now?',
                                    de: 'Liegt dieser Bewohner gerade nachts wach im Bett?',
                                    ru: '???????? ???????????? ???????????????????? ?????????? ?????????? ?????????????',
                                    pt: 'Este residente est?? acordado ?? noite?',
                                    nl: "Is deze bewoner 's nachts wakker?",
                                    fr: 'Est-ce que ce r??sident est r??veill?? la nuit ?',
                                    it: "Questo residente e' sveglio di notte?",
                                    es: '??Este residente est?? despierto por la noche?',
                                    pl: 'Czy ten mieszkaniec budzi si?? w nocy?',
                                    uk: '???? ?? ???? ?????????????????????????? ?????????? ?????????? ???????????',
                                    'zh-cn': '???????????????????????????????????????????',
                                },
                            },
                            native: {},
                        },
                        {
                            preserve: {
                                common: ['name'],
                            },
                        },
                    );

                    await this.setObjectNotExistsAsync(
                        id + '.activity.bedtime',
                        {
                            type: 'state',
                            common: {
                                name: {
                                    en: name + ' is getting ready for bed?',
                                    de: name + ' macht sich bettfertig?',
                                    ru: name + ' ?????????????????? ?? ???????????????',
                                    pt: name + ' est?? se preparando para a cama?',
                                    nl: name + ' gaat naar bed?',
                                    fr: name + ' se pr??pare pour le lit ?',
                                    it: name + ' si sta preparando per dormire?',
                                    es: '??' + name + ' se est?? preparando para la cama?',
                                    pl: name + ' jest gotowy do ??????ka?',
                                    uk: name + ' ?????????????? ???? ???????????',
                                    'zh-cn': name + ' ????????????????',
                                },
                                type: 'number',
                                role: 'level.mode.resident.bedtime',
                                min: 0,
                                max: 12999,
                                read: true,
                                write: true,
                                def: 0,
                                desc: {
                                    en: 'Is this resident getting ready for bed right now?',
                                    de: 'Macht sich dieser Bewohner gerade bettfertig?',
                                    ru: '?????????? ???? ???????? ???????????????? ?? ?????????????? ?????????? ?????????????',
                                    pt: 'Este residente est?? a preparar-se para a cama?',
                                    nl: 'Maakt deze bewoner zich nu klaar voor bed?',
                                    fr: 'Est-ce que ce r??sident se pr??pare au lit maintenant ?',
                                    it: 'Questo residente si sta preparando per andare a letto?',
                                    es: '??Este residente se est?? preparando para la cama ahora mismo?',
                                    pl: 'Obecnie mieszkaniec jest gotowy do ??????ka?',
                                    uk: '???? ?????????????? ???????????????? ???? ?????????? ?????????? ???????????',
                                    'zh-cn': '????????????????????????????????????????',
                                },
                                states: {
                                    0: offLang,
                                    1: activityLang[1900].state,
                                    2: activityLang[1901].state,
                                    3: activityLang[1902].state,
                                },
                            },
                            native: {},
                        },
                        {
                            preserve: {
                                common: ['name'],
                            },
                        },
                    );
                    // Update common.states
                    currentObject = await this.getObjectAsync(id + '.activity.bedtime');
                    if (currentObject) {
                        currentObject.common.states = {
                            0: offLang,
                            1: activityLang[1900].state,
                            2: activityLang[1901].state,
                            3: activityLang[1902].state,
                        };
                        await this.setObjectAsync(id + '.activity.bedtime', currentObject);
                    }

                    await this.setObjectNotExistsAsync(
                        id + '.activity.dnd',
                        {
                            type: 'state',
                            common: {
                                name: {
                                    en: name + ' does not want to be disturbed?',
                                    de: name + ' m??chte nicht gest??rt werden?',
                                    ru: name + ' ???? ?????????? ???????????????????????',
                                    pt: name + ' n??o quer ser perturbado?',
                                    nl: name + ' wil niet gestoord worden?',
                                    fr: name + ' ne veut pas ??tre perturb???',
                                    it: name + ' non vuole essere disturbato?',
                                    es: name + ' no quiere ser molestado?',
                                    pl: name + ' nie chce by?? zaniepokojony?',
                                    uk: name + ' ???? ???????? ???????????????????',
                                    'zh-cn': '?????????????????????????',
                                },
                                type: 'boolean',
                                role: 'switch.mode.resident.dnd',
                                read: true,
                                write: true,
                                def: false,
                                desc: {
                                    en: 'Does the resident currently not want to be disturbed or interrupted?',
                                    de: 'M??chte der Bewohner gerade nicht gest??rt oder unterbrochen werden?',
                                    ru: '?? ?????????????????? ?????????? ???????????????? ???? ?????????? ???????????????? ?????? ?????????????????',
                                    pt: 'O residente atualmente n??o quer ser perturbado ou interrompido?',
                                    nl: 'Wil de bewoner niet gestoord of gestoord worden?',
                                    fr: 'Le r??sident ne veut-il pas actuellement ??tre perturb?? ou interrompu?',
                                    it: 'Attualmente il residente non vuole essere disturbato o interrotto?',
                                    es: '??El residente actualmente no quiere ser perturbado o interrumpido?',
                                    pl: 'Czy mieszkaniec nie chce by?? zaniepokojony lub przerywany?',
                                    uk: '???? ???? ???????? ???????? ?????????????????? ???? ?????????????????????????? ?????????????????',
                                    'zh-cn': '?????????????????????????????????????????????????',
                                },
                            },
                            native: {},
                        },
                        {
                            preserve: {
                                common: ['name'],
                            },
                        },
                    );

                    await this.setObjectNotExistsAsync(
                        id + '.activity.overnight',
                        {
                            type: 'state',
                            common: {
                                name: {
                                    en: name + ' will stay overnight today?',
                                    de: name + ' wird heute ??bernachten?',
                                    ru: name + ' ?????????????????? ?????????????? ???????????',
                                    pt: name + ' vai passar a noite hoje?',
                                    nl: name + ' blijft vannacht?',
                                    fr: name + " passera la nuit aujourd'hui?",
                                    it: name + ' rimarr?? per tutta la notte oggi?',
                                    es: '??' + name + ' se quedar?? esta noche?',
                                    pl: 'Obecnie ' + name + ' b??dzie noc???',
                                    uk: name + ' ???????? ???????????????????? ???? ?????? ?????????????????',
                                    'zh-cn': name + ' ????????????????????????????',
                                },
                                type: 'boolean',
                                role: 'switch.mode.resident.overnight',
                                read: true,
                                write: true,
                                def: residentType == 'guest' ? false : true,
                                desc: {
                                    en: 'Is this resident going to stay overnight today?',
                                    de: 'Wird dieser Bewohner heute ??ber Nacht bleiben?',
                                    ru: '???????? ???????????????? ???????????????????? ???????????????? ???? ???????? ???????????????',
                                    pt: 'Este residente vai ficar hoje ?? noite?',
                                    nl: 'Blijft deze inwoner vannacht?',
                                    fr: "Est-ce que ce r??sident va passer la nuit aujourd'hui ?",
                                    it: 'Questo residente sta per rimanere per tutta la notte oggi?',
                                    es: '??Este residente va a quedarse esta noche?',
                                    pl: 'Czy ten mieszkaniec b??dzie noc???',
                                    uk: '???? ?? ?????? ????????????????, ???????? ???????????????? ?????????????',
                                    'zh-cn': '??????????????????????????????????',
                                },
                            },
                            native: {},
                        },
                        {
                            preserve: {
                                common: ['name'],
                            },
                        },
                    );

                    await this.setObjectNotExistsAsync(
                        id + '.activity.wakeup',
                        {
                            type: 'state',
                            common: {
                                name: {
                                    en: name + ' has a wake-up alarm running?',
                                    de: name + ' hat einen laufenden Weckruf?',
                                    ru: '?? ' + name + ' ???????????????? ???????????????????????',
                                    pt: 'A ' + name + ' tem uma chamada a acordar?',
                                    nl: 'Heeft ' + name + ' een wake-up alarm?',
                                    fr: name + ' a un r??veil en cours ?',
                                    it: name + ' ha una sveglia in funzione?',
                                    es: '??' + name + ' tiene una llamada de atenci??n?',
                                    pl: name + ' ma nawo??ywane wezwanie?',
                                    uk: name + ' ?????? ?????????????????? ???????????????',
                                    'zh-cn': name + ' ??????????????????????',
                                },
                                type: 'boolean',
                                role: 'switch.mode.resident.wakeup',
                                read: true,
                                write: true,
                                def: false,
                                desc: {
                                    en: 'Is this resident currently being woken up?',
                                    de: 'Ist dieser Bewohner gerade auf dem Heimweg?',
                                    ru: '?? ?????????????????? ?????????? ???????? ???????????????? ???????????????????????',
                                    pt: 'Este residente est?? a ser acordado?',
                                    nl: 'Wordt deze bewoner nu wakker?',
                                    fr: 'Est-ce que ce r??sident est actuellement r??veill?? ?',
                                    it: "Questo residente e' attualmente svegliato?",
                                    es: '??Se est?? despertando a este residente?',
                                    pl: 'Obecnie mieszkaniec jest wychowywany?',
                                    uk: '???? ?? ???? ?????????? ???????????? ?????????????????',
                                    'zh-cn': '??????????????????????????????????',
                                },
                            },
                            native: {},
                        },
                        {
                            preserve: {
                                common: ['name'],
                            },
                        },
                    );

                    await this.setObjectNotExistsAsync(
                        id + '.activity.wakeupSnooze',
                        {
                            type: 'state',
                            common: {
                                name: {
                                    en: name + ' has snoozed the wake-up alarm?',
                                    de: name + ' hat den Weckruf pausiert?',
                                    ru: name + ' ???????????? ?????????????',
                                    pt: 'A ' + name + ' deu cabo da chamada de despertar?',
                                    nl: name + ' heeft de wake-up alarm doorzocht?',
                                    fr: name + ' a saut?? le r??veil ?',
                                    it: name + ' ha snoozed la sveglia?',
                                    es: name + ' ha snoozed la llamada de atenci??n?',
                                    pl: name + " s??ysza??o okrzyki. '",
                                    uk: name + ' snoozed the break-up ?????????????',
                                    'zh-cn': name + ' hasnoozed the ???????????????? ??? ???',
                                },
                                type: 'boolean',
                                role: 'button.residents.wakeupSnoozed',
                                read: false,
                                write: true,
                                def: true,
                                desc: {
                                    en: 'Has this resident currently snoozed a wake-up alarm?',
                                    de: 'Hat dieser Bewohner gerade einen Weckruf pausiert?',
                                    ru: '?? ?????????????????? ?????????? ???????? ???????????????? ???????????? ?????????????',
                                    pt: 'Este residente j?? fez uma chamada de despertar?',
                                    nl: 'Heeft deze inwoner momenteel een wake-up alarm gedaan?',
                                    fr: 'Est-ce que ce r??sident a fait un rappel ?',
                                    it: 'Questo residente ha attualmente snoozed una chiamata di sveglia?',
                                    es: '??Este residente ha snoozed una llamada de atenci??n?',
                                    pl: 'Czy ten rezydent s??ysza?? okrzyk?',
                                    uk: '???? ?????????????????????????? ?????? ?????????????????',
                                    'zh-cn': '??????????????????????????????????????????????',
                                },
                            },
                            native: {},
                        },
                        {
                            preserve: {
                                common: ['name'],
                            },
                        },
                    );

                    await this.setObjectNotExistsAsync(
                        id + '.activity.wayhome',
                        {
                            type: 'state',
                            common: {
                                name: {
                                    en: name + ' is on way home?',
                                    de: name + ' ist auf dem Heimweg?',
                                    ru: name + ' ?????? ?????????',
                                    pt: name + ' est?? a caminho de casa?',
                                    nl: name + ' is op weg naar huis?',
                                    fr: name + ' est en route ?',
                                    it: name + ' sta tornando a casa?',
                                    es: '??' + name + ' est?? de camino a casa?',
                                    pl: name + ' jest w drodze do domu?',
                                    uk: name + ' ???? ?????????? ?????????????',
                                    'zh-cn': name + ' ?????????????',
                                },
                                type: 'boolean',
                                role: 'switch.mode.resident.wayhome',
                                read: true,
                                write: true,
                                def: false,
                                desc: {
                                    en: 'Is this resident on way home?',
                                    de: 'Ist dieser Bewohner gerade auf dem Heimweg?',
                                    ru: '?????? ???????????????? ???? ???????? ???????????',
                                    pt: 'Este residente est?? a caminho de casa?',
                                    nl: 'Is deze bewoner op weg naar huis?',
                                    fr: 'Est-ce que ce r??sident est en chemin ?',
                                    it: 'Questo residente sta tornando a casa?',
                                    es: '??Est?? este residente de camino a casa?',
                                    pl: 'Czy ten mieszka w drodze do domu?',
                                    uk: '???? ?? ???? ???????????????? ???? ?????????? ?????????????',
                                    'zh-cn': '???????????????????',
                                },
                            },
                            native: {},
                        },
                        {
                            preserve: {
                                common: ['name'],
                            },
                        },
                    );
                }

                // Mood support not for pets
                if (residentType != 'pet') {
                    await this.setObjectNotExistsAsync(id + '.mood', {
                        type: 'channel',
                        common: {
                            name: {
                                en: 'Mood of ' + name,
                                de: 'Laune von ' + name,
                                ru: '???????????????????? ' + name,
                                pt: 'Humor de ' + name,
                                nl: 'Stemming van ' + name,
                                fr: 'Humeur de ' + name,
                                it: "Stato d'animo di " + name,
                                es: 'Humor de ' + name,
                                pl: 'Przewodnik ' + name,
                                uk: '???????????? ' + name,
                                'zh-cn': name + ' ???',
                            },
                        },
                        native: {},
                    });

                    await this.setObjectNotExistsAsync(
                        id + '.mood.state',
                        {
                            type: 'state',
                            common: {
                                name: {
                                    en: name + ' mood state',
                                    de: name + ' Launenstatus',
                                    ru: '?????????????????? ???????????????????? ' + name,
                                    pt: 'Estado de humor ' + name,
                                    nl: name + ' stemmingsstatus',
                                    fr: "??tat d'humeur " + name,
                                    it: "Stato dell'umore " + name,
                                    es: 'Estado de ??nimo ' + name,
                                    pl: 'Stan nastroju ' + name,
                                    uk: '???????????? ?????????????? ' + name,
                                    'zh-cn': name + ' ????????????',
                                },
                                type: 'number',
                                role: 'level.mode.resident.mood',
                                min: 0,
                                max: 10,
                                read: true,
                                write: true,
                                def: 5,
                                desc: {
                                    en: 'Mood of the resident with negative or positive tendency',
                                    de: 'Laune des Bewohners mit negativer oder positiver Tendenz',
                                    ru: '???????????????????? ?????????????????? ?? ???????????????????? ?????? ?????????????????????????? ????????????????????',
                                    pt: 'Humor do residente com tend??ncia negativa ou positiva',
                                    nl: 'Stemming van de bewoner met een negatieve of positieve neiging',
                                    fr: 'Humeur du r??sident ?? tendance n??gative ou positive',
                                    it: 'Umore del residente con tendenza negativa o positiva',
                                    es: 'Estado de ??nimo del residente con tendencia negativa o positiva',
                                    pl: 'Nastr??j mieszka??ca z tendencj?? negatywn?? lub pozytywn??',
                                    uk: '?????????????????? ?????????????????? ?? ???????????????????? ?????? ???????????????????? ????????????????????',
                                    'zh-cn': '??????????????????????????????????????????',
                                },
                                states: moodStates,
                            },
                            native: {},
                        },
                        {
                            preserve: {
                                common: ['name'],
                            },
                        },
                    );
                    // Update common.states
                    const currentObject = await this.getObjectAsync(id + '.mood.state');
                    if (currentObject) {
                        currentObject.common.states = moodStates;
                        await this.setObjectAsync(id + '.mood.state', currentObject);
                    }
                }

                await this.setObjectNotExistsAsync(id + '.presenceFollowing', {
                    type: 'channel',
                    common: {
                        name: {
                            en: 'Indirect presence inheritance for ' + name,
                            de: 'Indirekte Pr??senzvererbung f??r ' + name,
                            ru: '???????????????? ???????????????????? ?????????????????????? ?????? ' + name,
                            pt: 'Heran??a de presen??a indireta para ' + name,
                            nl: 'Indirecte erfenis voor ' + name,
                            fr: 'H??ritage de pr??sence indirecte pour ' + name,
                            it: 'Eredit?? di presenza indiretta per ' + name,
                            es: 'Herencia de presencia indirecta para ' + name,
                            pl: 'Przeznaczenie ' + name,
                            uk: '?????????????? ???????????????? ?????????????????????? ?????? ' + name,
                            'zh-cn': name + ' ????????????????????????',
                        },
                    },
                    native: {},
                });

                await this.setObjectNotExistsAsync(
                    id + '.presenceFollowing.homeEnabled',
                    {
                        type: 'state',
                        common: {
                            name: {
                                en: name + ' is inheriting a home state?',
                                de: name + ' erbt einen Zuhausestatus?',
                                ru: name + ' ?????????????????? ?????????????????? ?????????',
                                pt: 'O ' + name + ' herda um estado de casa?',
                                nl: name + ' erft een thuisstaat?',
                                fr: name + " h??rite d'un ??tat d'origine ?",
                                it: name + ' sta ereditando uno stato di casa?',
                                es: '??' + name + ' hereda un estado de origen?',
                                pl: name + ' dziedziczy kraj?',
                                uk: name + ' ?? ?????????????????? ???????????? ???????????????',
                                'zh-cn': '??????????????????????????????????',
                            },
                            type: 'boolean',
                            role: 'switch.enable',
                            read: true,
                            write: true,
                            def: false,
                            desc: {
                                en: 'Follow-them functionality for coming & leaving home',
                                de: 'Follow-them Funktion f??r Kommen & Gehen',
                                ru: '???????????????????????????????? ?????? ?????????????? ?? ???????????? ???? ????????',
                                pt: 'Funcionalidade de acompanhamento para vir e sair de casa',
                                nl: 'Volg de functionaliteit voor het verlaten van thuis',
                                fr: 'Fonctionnalit??s de suivi pour rentrer & quitter la maison',
                                it: 'Funzionalit?? di follow-them per tornare e lasciare casa',
                                es: 'Funcionalidad de seguimiento para salir de casa',
                                pl: 'Wst??pna funkcjonalno???? dla nadchodz??cego i opuszczania domu',
                                uk: '???????????????????????? ???????????????????????????????? ?????? ?????????????? ???? ???????????? ????????????',
                                'zh-cn': '??????????????????????????????????????????',
                            },
                        },
                        native: {},
                    },
                    {
                        preserve: {
                            common: ['name'],
                        },
                    },
                );

                //TODO: use foreignResidents for states
                await this.setObjectNotExistsAsync(
                    id + '.presenceFollowing.homePerson',
                    {
                        type: 'state',
                        common: {
                            name: {
                                en: name + ' is following home state of this person',
                                de: name + ' folgt dem Zuhausestatus dieser Person',
                                ru: name + ' ???????????? ???? ???????????????? ???????????????????? ?????????? ????????????????',
                                pt: name + ' est?? seguindo o estado de casa desta pessoa',
                                nl: name + ' volgt de staat van deze persoon',
                                fr: name + " suit l'??tat de la maison de cette personne",
                                it: name + ' sta seguendo lo stato di casa di questa persona',
                                es: name + ' sigue el estado natal de esta persona',
                                pl: name + ' poprzedza stan rzeczy tej osoby',
                                uk: name + ' - ???? ?????????????? ?????????????? ???????? ??????????',
                                'zh-cn': name + ' ??????????????????????????????',
                            },
                            type: 'string',
                            role: 'string.resident',
                            read: true,
                            write: true,
                            def: 'none',
                            desc: {
                                en: 'Which person is being followed?',
                                de: 'Welcher Person wird gefolgt?',
                                ru: '?????????? ?????????????? ???????????????',
                                pt: 'Qual pessoa est?? sendo seguida?',
                                nl: 'Welke persoon wordt gevolgd?',
                                fr: 'Quelle personne est suivie ?',
                                it: 'Quale persona viene seguita?',
                                es: '??A qu?? persona se le sigue?',
                                pl: 'Co si?? dzieje?',
                                uk: '?????? ???????????? ???????????????????',
                                'zh-cn': '??????????',
                            },
                        },
                        native: {},
                    },
                    {
                        preserve: {
                            common: ['name'],
                        },
                    },
                );

                const homeModeStates = {
                    en: {
                        0: 'Coming & Leaving Home',
                        1: 'Coming Home only',
                        2: 'Leaving Home only',
                    },
                    de: {
                        0: 'Ankommen & verlassen',
                        1: 'Nur ankommen',
                        2: 'Nur verlassen',
                    },
                    // ru: {
                    //     0: '',
                    //     1: '',
                    //     2: '',
                    // },
                    // pt: {
                    //     0: '',
                    //     1: '',
                    //     2: '',
                    // },
                    // nl: {
                    //     0: '',
                    //     1: '',
                    //     2: '',
                    // },
                    // fr: {
                    //     0: '',
                    //     1: '',
                    //     2: '',
                    // },
                    // it: {
                    //     0: '',
                    //     1: '',
                    //     2: '',
                    // },
                    // es: {
                    //     0: '',
                    //     1: '',
                    //     2: '',
                    // },
                    // pl: {
                    //     0: '',
                    //     1: '',
                    //     2: '',
                    // },
                    // uk: {
                    //     0: '',
                    //     1: '',
                    //     2: '',
                    // },
                    // 'zh-cn': {
                    //     0: '',
                    //     1: '',
                    //     2: '',
                    // },
                };
                const homeModeLang = homeModeStates[this.language]
                    ? homeModeStates[this.language]
                    : homeModeStates['en'];
                await this.setObjectNotExistsAsync(
                    id + '.presenceFollowing.homeMode',
                    {
                        type: 'state',
                        common: {
                            name: {
                                en: name + ' is following these presence events',
                                de: name + ' folgt diesen Anwesenheits-Ereignissen',
                                ru: name + ' ???????????? ???? ?????????? ?????????????????? ??????????????????????',
                                pt: name + ' est?? seguindo estes eventos de presen??a',
                                nl: name + ' volgt deze aanwezigheidsevenementen',
                                fr: name + ' suit ces ??v??nements de pr??sence',
                                it: name + ' segue questi eventi di presenza',
                                es: name + ' sigue estos eventos de presencia',
                                pl: name + ' potwierdza te zdarzenia',
                                uk: name + ' ?????????????????? ???? ???????? ?????????????? ??????????????????????',
                                'zh-cn': '?????????????????????',
                            },
                            type: 'number',
                            role: 'value.resident',
                            read: true,
                            write: true,
                            def: 0,
                            states: homeModeLang,
                            desc: {
                                en: 'Which presence states is this person following?',
                                de: 'Welchem Anwesenheitsstatus folgt diese Person?',
                                ru: '?????????? ?????????????????????? ?????????????? ???????? ???????????????',
                                pt: 'Que estados de presen??a esta pessoa est?? seguindo?',
                                nl: 'Welke aanwezigheid volgt deze persoon?',
                                fr: 'Quelle est cette personne qui suit ?',
                                it: 'Quale presenza afferma che questa persona sta seguendo?',
                                es: '??Qu?? estados de presencia sigue esta persona?',
                                pl: 'Jaka jest obecna osoba?',
                                uk: '?????? ?????????????????????? ?? ?????? ???????????',
                                'zh-cn': '????????????????',
                            },
                        },
                        native: {},
                    },
                    {
                        preserve: {
                            common: ['name'],
                        },
                    },
                );
                // Update common.states
                const currentObject = await this.getObjectAsync(id + '.presenceFollowing.homeMode');
                if (currentObject) {
                    currentObject.common.states = homeModeLang;
                    await this.setObjectAsync(id + '.presenceFollowing.homeMode', currentObject);
                }

                // Follow-them for Night state not for pets
                if (residentType != 'pet') {
                    await this.setObjectNotExistsAsync(
                        id + '.presenceFollowing.nightEnabled',
                        {
                            type: 'state',
                            common: {
                                name: {
                                    en: name + ' is inheriting a night state?',
                                    de: name + ' erbt einen Nachtstatus?',
                                    ru: name + ' ?????????????????? ???????????? ???????????????????',
                                    pt: 'A ' + name + ' herda um estado nocturno?',
                                    nl: name + ' erft een nachtstaat?',
                                    fr: name + " h??rite d'un ??tat de nuit ?",
                                    it: name + ' sta ereditando uno stato di notte?',
                                    es: '??' + name + ' hereda un estado nocturno?',
                                    pl: name + ' dziedziczy stan nocny?',
                                    uk: name + ' ??? ???????????????? ?????????????? ???????????',
                                    'zh-cn': '?????????????????????????????????????',
                                },
                                type: 'boolean',
                                role: 'switch.enable',
                                read: true,
                                write: true,
                                def: false,
                                desc: {
                                    en: 'Follow-them functionality for the night state',
                                    de: 'Follow-them Funktion f??r den Nachtstatus',
                                    ru: '???????????????????? ?????? ?????????????? ??????????????????????',
                                    pt: 'Funcionalidade de acompanhamento para o estado noturno',
                                    nl: 'Volg hun functie voor de nachtelijke staat',
                                    fr: "Fonctionnalit?? de suivi pour l'??tat de nuit",
                                    it: 'Funzionalit?? di follow-them per lo stato di notte',
                                    es: 'Funcionalidad de seguimiento para el estado nocturno',
                                    pl: 'Wst??pna funkcjonalno???? dla nocnego stanu',
                                    uk: '???????????????????????? ???????????????????????????????? ?????? ?????????????? ??????????',
                                    'zh-cn': '?????????????????????????????????',
                                },
                            },
                            native: {},
                        },
                        {
                            preserve: {
                                common: ['name'],
                            },
                        },
                    );

                    //TODO: use foreignResidents variable for dynamic states
                    await this.setObjectNotExistsAsync(
                        id + '.presenceFollowing.nightPerson',
                        {
                            type: 'state',
                            common: {
                                name: {
                                    en: name + ' is following sleep state of this person',
                                    de: name + ' folgt dem Schlafstatus dieser Person',
                                    ru: name + ' ???????????? ???? ???????????????????? ?????? ?????????? ????????????????',
                                    pt: name + ' est?? seguindo o estado de sono desta pessoa',
                                    nl: name + ' volgt slaaptoestand van deze persoon',
                                    fr: name + " suit l'??tat de sommeil de cette personne",
                                    it: name + ' sta seguendo lo stato di sonno di questa persona',
                                    es: name + ' sigue el estado de sue??o de esta persona',
                                    pl: name + ' jest stanem snu tej osoby',
                                    uk: name + ' - ???? ?????????????????? ???????? ?????? ???????? ????????????',
                                    'zh-cn': name + ' ???????????????????????????',
                                },
                                type: 'string',
                                role: 'string.resident',
                                read: true,
                                write: true,
                                def: 'none',
                                desc: {
                                    en: 'Which person is being followed?',
                                    de: 'Welcher Person wird gefolgt?',
                                    ru: '?????????? ?????????????? ???????????????',
                                    pt: 'Qual pessoa est?? sendo seguida?',
                                    nl: 'Welke persoon wordt gevolgd?',
                                    fr: 'Quelle personne est suivie ?',
                                    it: 'Quale persona viene seguita?',
                                    es: '??A qu?? persona se le sigue?',
                                    pl: 'Co si?? dzieje?',
                                    uk: '?????? ???????????? ???????????????????',
                                    'zh-cn': '??????????',
                                },
                            },
                            native: {},
                        },
                        {
                            preserve: {
                                common: ['name'],
                            },
                        },
                    );

                    const nightModeStates = {
                        en: {
                            0: 'Fall Asleep & Get Up',
                            1: 'Fall Asleep only',
                            2: 'Get Up only',
                        },
                        de: {
                            0: 'Einschlafen & Aufstehen',
                            1: 'Nur einschlafen',
                            2: 'Nur aufstehen',
                        },
                        // ru: {
                        //     0: '',
                        //     1: '',
                        //     2: '',
                        // },
                        // pt: {
                        //     0: '',
                        //     1: '',
                        //     2: '',
                        // },
                        // nl: {
                        //     0: '',
                        //     1: '',
                        //     2: '',
                        // },
                        // fr: {
                        //     0: '',
                        //     1: '',
                        //     2: '',
                        // },
                        // it: {
                        //     0: '',
                        //     1: '',
                        //     2: '',
                        // },
                        // es: {
                        //     0: '',
                        //     1: '',
                        //     2: '',
                        // },
                        // pl: {
                        //     0: '',
                        //     1: '',
                        //     2: '',
                        // },
                        // uk: {
                        //     0: '',
                        //     1: '',
                        //     2: '',
                        // },
                        // 'zh-cn': {
                        //     0: '',
                        //     1: '',
                        //     2: '',
                        // },
                    };
                    const nightModeLang = nightModeStates[this.language]
                        ? nightModeStates[this.language]
                        : nightModeStates['en'];
                    await this.setObjectNotExistsAsync(
                        id + '.presenceFollowing.nightMode',
                        {
                            type: 'state',
                            common: {
                                name: {
                                    en: name + ' is following these night presence events',
                                    de: name + ' folgt diesen n??chtlichen Anwesenheits-Ereignissen',
                                    ru: name + ' ???????????? ???? ?????????? ?????????????? ?????????????????? ??????????????????????',
                                    pt: name + ' est?? seguindo estes eventos de presen??a noturna',
                                    nl: name + ' volgt deze nachtelijke gebeurtenissen',
                                    fr: name + ' suit ces ??v??nements nocturnes',
                                    it: name + ' segue questi eventi di presenza notturna',
                                    es: name + ' sigue estos eventos de presencia nocturna',
                                    pl: name + ' po tych nocnych wydarzeniach obecna jest obecna',
                                    uk: name + ' - ???? ???????????????? ?????????? ???????????? ??????????????????????',
                                    'zh-cn': '???' + name + '???????????????',
                                },
                                type: 'number',
                                role: 'value.resident',
                                read: true,
                                write: true,
                                def: 0,
                                states: nightModeLang,
                                desc: {
                                    en: 'Which night states is this person following?',
                                    de: 'Welchem Nachtstatus folgt diese Person?',
                                    ru: '?????????? ???????? ?????????????? ???????? ???????????????',
                                    pt: 'Que noite afirma que esta pessoa est?? a seguir?',
                                    nl: 'Welke nacht staat deze persoon te volgen?',
                                    fr: 'Quelle nuit est-ce que cette personne suit ?',
                                    it: "Qual e' la notte in cui sta seguendo questa persona?",
                                    es: '??Qu?? estados de noche es esta persona que sigue?',
                                    pl: 'Co nocne stany to osoba nast??puj??ca?',
                                    uk: '?????? ?????????? ?????????? ?? ?????????? ????????????:?',
                                    'zh-cn': '?????????????????????????',
                                },
                            },
                            native: {},
                        },
                        {
                            preserve: {
                                common: ['name'],
                            },
                        },
                    );
                    // Update common.states
                    const currentObject = await this.getObjectAsync(id + '.presenceFollowing.nightMode');
                    if (currentObject) {
                        currentObject.common.states = nightModeLang;
                        await this.setObjectAsync(id + '.presenceFollowing.nightMode', currentObject);
                    }
                }

                await this.setObjectNotExistsAsync(id + '.presence', {
                    type: 'channel',
                    common: {
                        name: {
                            en: 'Presence states of ' + name,
                            de: 'Anwesenheitsstatus von ' + name,
                            ru: '?????????????????? ?????????????????????? ' + name,
                            pt: 'Estados de presen??a de ' + name,
                            nl: 'Druk staat van ' + name,
                            fr: '??tat de pr??sence de ' + name,
                            it: 'Stati di presenza di ' + name,
                            es: 'Estados de presencia de ' + name,
                            pl: 'Pa??stwa prezydenckie ' + name,
                            uk: '???????????? ?????????? ' + name,
                            'zh-cn': name + ' ?????????',
                        },
                    },
                    native: {},
                });

                await this.setObjectNotExistsAsync(
                    id + '.presence.home',
                    {
                        type: 'state',
                        common: {
                            name: {
                                en: name + ' is at home?',
                                de: name + ' ist zuhause?',
                                ru: name + ' ?????????',
                                pt: 'O ' + name + ' est?? em casa?',
                                nl: name + ' is thuis?',
                                fr: name + ' est ?? la maison ?',
                                it: name + " e' a casa?",
                                es: '??' + name + ' est?? en casa?',
                                pl: name + ' jest w domu?',
                                uk: name + ' ?? ???????????????? ?????????????',
                                'zh-cn': name + '?????????????',
                            },
                            type: 'boolean',
                            role: 'switch.mode.resident.home',
                            read: true,
                            write: true,
                            def: false,
                            desc: {
                                en: 'Is this resident at home?',
                                de: 'Ist dieser Bewohner zuhause?',
                                ru: '?????? ???????????????? ?????????',
                                pt: '?? residente em casa?',
                                nl: 'Is deze bewoner thuis?',
                                fr: 'Est-ce que ce r??sident est ?? la maison ?',
                                it: "E' residente a casa?",
                                es: '??Es residente en casa?',
                                pl: 'Czy ten mieszka w domu?',
                                uk: '???? ?? ???? ???????????????? ???????????????',
                                'zh-cn': '???????????????????',
                            },
                        },
                        native: {},
                    },
                    {
                        preserve: {
                            common: ['name'],
                        },
                    },
                );

                await this.setObjectNotExistsAsync(
                    id + '.presence.away',
                    {
                        type: 'state',
                        common: {
                            name: {
                                en: name + ' is away?',
                                de: name + ' ist abwesend?',
                                ru: name + ' ?????????????????? ???????????',
                                pt: 'O ' + name + ' est?? fora?',
                                nl: name + ' is afwezig?',
                                fr: name + ' est parti ?',
                                it: name + " e' via?",
                                es: '??' + name + ' est?? fuera?',
                                pl: name + ' jest ju?? odleg??y?',
                                uk: name + ' ?? ?????????????',
                                'zh-cn': name + ' ????????????',
                            },
                            type: 'boolean',
                            role: 'switch.mode.resident.away',
                            read: true,
                            write: true,
                            def: true,
                            desc: {
                                en: 'Is this resident away?',
                                de: 'Ist dieser Bewohner abwesend?',
                                ru: '?????? ?????????????????',
                                pt: 'Este residente est?? fora?',
                                nl: 'Is deze bewoner weg?',
                                fr: 'Est-ce que ce r??sident est parti ?',
                                it: "E' via questo residente?",
                                es: '??Este residente est?? fuera?',
                                pl: 'Czy to mieszka?',
                                uk: '???? ?? ???? ?????????????????',
                                'zh-cn': '??????????????????????',
                            },
                        },
                        native: {},
                    },
                    {
                        preserve: {
                            common: ['name'],
                        },
                    },
                );

                const presenceLang = {
                    0: residentialStates[1],
                    1: residentialStates[4],
                    2: residentialStates[11],
                };
                // Presence state for pets
                if (residentType == 'pet') {
                    const petPresenceLang = presenceLang;
                    delete petPresenceLang[2];

                    await this.setObjectNotExistsAsync(
                        id + '.presence.state',
                        {
                            type: 'state',
                            common: {
                                name: {
                                    en: name + ' presence state',
                                    de: name + ' Anwesenheitsstatus',
                                    ru: name + ' ?????????????????? ??????????????????????',
                                    pt: 'Estado de presen??a ' + name,
                                    nl: name + ' aanwezigheidsstatus',
                                    fr: 'Statut de pr??sence ' + name,
                                    it: 'Stato di presenza ' + name,
                                    es: 'Estado de presencia ' + name,
                                    pl: 'Stan obecno??ci ' + name,
                                    uk: '???????? ?????????????????????? ' + name,
                                    'zh-cn': name + ' ????????????',
                                },
                                type: 'number',
                                role: 'level.mode.resident.presence',
                                min: 0,
                                max: 1,
                                read: true,
                                write: true,
                                def: 0,
                                desc: {
                                    en: 'Resident presence state\n0 = Away\n1 = Home',
                                    de: 'Bewohner Anwesenheitsstatus\n0 = Abwesend\n1 = Zu Hause',
                                    ru: '?????????????????? ??????????????????????',
                                    pt: 'Estado de presen??a residente',
                                    nl: 'Verblijfsvergunning staat',
                                    fr: 'Pr??sence r??sidente',
                                    it: 'Stato di presenza residente',
                                    es: 'Estado de presencia residente',
                                    pl: 'Stany Zjednoczone',
                                    uk: '???????? ?????????????????????? ??????????????????',
                                    'zh-cn': '????????????',
                                },
                                states: petPresenceLang,
                            },
                            native: {},
                        },
                        {
                            preserve: {
                                common: ['name'],
                            },
                        },
                    );
                    // Update common.states
                    const currentObject = await this.getObjectAsync(id + '.presence.state');
                    if (currentObject) {
                        currentObject.common.states = petPresenceLang;
                        await this.setObjectAsync(id + '.presence.state', currentObject);
                    }
                }

                // Presence state for humans
                else {
                    await this.setObjectNotExistsAsync(
                        id + '.presence.night',
                        {
                            type: 'state',
                            common: {
                                name: {
                                    en: name + ' is at sleep?',
                                    de: name + ' schl??ft?',
                                    ru: name + ' ?? ???????',
                                    pt: 'O ' + name + ' est?? a dormir?',
                                    nl: name + ' slaapt?',
                                    fr: name + ' est en sommeil ?',
                                    it: name + ' sta dormendo?',
                                    es: '??' + name + ' est?? durmiendo?',
                                    pl: name + ' jest w snu?',
                                    uk: name + ' ???? ???????????',
                                    'zh-cn': name + ' ???????',
                                },
                                type: 'boolean',
                                role: 'switch.mode.resident.night',
                                read: true,
                                write: true,
                                def: false,
                                desc: {
                                    en: 'Is this resident at sleep?',
                                    de: 'Schl??ft dieser Bewohner gerade?',
                                    ru: '?????? ???????????????? ???????',
                                    pt: 'Este residente est?? a dormir?',
                                    nl: 'Is deze inwoner in slaap?',
                                    fr: 'Est-ce que ce r??sident dort ?',
                                    it: "E' residente a dormire?",
                                    es: '??Este residente est?? durmiendo?',
                                    pl: 'Czy ten mieszkaniec ??pi?',
                                    uk: '???? ?? ???? ???????????? ?????? ???????',
                                    'zh-cn': '?????????????????????????',
                                },
                            },
                            native: {},
                        },
                        {
                            preserve: {
                                common: ['name'],
                            },
                        },
                    );

                    await this.setObjectNotExistsAsync(
                        id + '.presence.state',
                        {
                            type: 'state',
                            common: {
                                name: {
                                    en: name + ' presence state',
                                    de: name + ' Anwesenheitsstatus',
                                    ru: name + ' ?????????????????? ??????????????????????',
                                    pt: 'Estado de presen??a ' + name,
                                    nl: name + ' aanwezigheidsstatus',
                                    fr: 'Statut de pr??sence ' + name,
                                    it: 'Stato di presenza ' + name,
                                    es: 'Estado de presencia ' + name,
                                    pl: 'Stan obecno??ci ' + name,
                                    uk: '???????? ?????????????????????? ' + name,
                                    'zh-cn': name + ' ????????????',
                                },
                                type: 'number',
                                role: 'level.mode.resident.presence',
                                min: 0,
                                max: 2,
                                read: true,
                                write: true,
                                def: 0,
                                desc: {
                                    en: 'Resident presence state\n0 = Away\n1 = Home\n2 = Night',
                                    de: 'Bewohner Anwesenheitsstatus\n0 = Abwesend\n1 = Zu Hause\n2 = Nacht',
                                    ru: '?????????????????? ??????????????????????',
                                    pt: 'Estado de presen??a residente',
                                    nl: 'Verblijfsvergunning staat',
                                    fr: 'Pr??sence r??sidente',
                                    it: 'Stato di presenza residente',
                                    es: 'Estado de presencia residente',
                                    pl: 'Stany Zjednoczone',
                                    uk: '???????? ?????????????????????? ??????????????????',
                                    'zh-cn': '????????????',
                                },
                                states: presenceLang,
                            },
                            native: {},
                        },
                        {
                            preserve: {
                                common: ['name'],
                            },
                        },
                    );
                    // Update common.states
                    const currentObject = await this.getObjectAsync(id + '.presence.state');
                    if (currentObject) {
                        currentObject.common.states = presenceLang;
                        await this.setObjectAsync(id + '.presence.state', currentObject);
                    }
                }

                this.subscriptions.push(id + '.enabled');
                this.subscriptions.push(id + '.activity.*');
                this.subscriptions.push(id + '.mood.state');
                this.subscriptions.push(id + '.presence.*');
                this.subscriptions.push(id + '.presenceFollowing.*');

                if (
                    resident.foreignPresenceObjectId != undefined &&
                    typeof resident.foreignPresenceObjectId == 'string' &&
                    resident.foreignPresenceObjectId != ''
                ) {
                    const foreignPresenceState = await this.getForeignStateAsync(resident.foreignPresenceObjectId);
                    if (this.presenceSubscriptionMapping[resident.foreignPresenceObjectId] == undefined)
                        this.presenceSubscriptionMapping[resident.foreignPresenceObjectId] = [];
                    this.presenceSubscriptionMapping[resident.foreignPresenceObjectId].push(id);

                    if (
                        foreignPresenceState != undefined &&
                        foreignPresenceState.val != null &&
                        (await this.setResidentDevicePresenceFromEvent(
                            resident.foreignPresenceObjectId,
                            foreignPresenceState,
                            true,
                        )) != false
                    ) {
                        this.log.info(
                            id + ': Monitoring foreign presence datapoint ' + resident.foreignPresenceObjectId,
                        );
                        // // Cannot be checked due to a bug in js-controller that will always return states with ack=false
                        // if (foreignPresenceState.ack != true)
                        //     this.log.warn(
                        //         id +
                        //             ': ' +
                        //             resident.foreignPresenceObjectId +
                        //             ": ACK state is false. Future events will need to have a confirmed (=ACK'ed) status update!",
                        //     );
                        this.foreignSubscriptions.push(resident.foreignPresenceObjectId);
                    } else {
                        this.presenceSubscriptionMapping[resident.foreignPresenceObjectId].shift();
                        this.log.error(
                            id + ': Foreign presence datapoint ' + resident.foreignPresenceObjectId + ' is invalid',
                        );
                    }
                }

                if (
                    resident.foreignWayhomeObjectId != undefined &&
                    typeof resident.foreignWayhomeObjectId == 'string' &&
                    resident.foreignWayhomeObjectId != ''
                ) {
                    const foreignWayhomeState = await this.getForeignStateAsync(resident.foreignWayhomeObjectId);
                    if (this.wayhomeSubscriptionMapping[resident.foreignWayhomeObjectId] == undefined)
                        this.wayhomeSubscriptionMapping[resident.foreignWayhomeObjectId] = [];
                    this.wayhomeSubscriptionMapping[resident.foreignWayhomeObjectId].push(id);

                    if (this.presenceSubscriptionMapping[resident.foreignWayhomeObjectId] != undefined) {
                        this.wayhomeSubscriptionMapping[resident.foreignWayhomeObjectId].shift();
                        this.log.error(
                            resident.foreignWayhomeObjectId +
                                ' is already in use for presence entry/exit events, it can not be used for way home events in that case.',
                        );
                    } else if (
                        foreignWayhomeState != undefined &&
                        foreignWayhomeState.val != null &&
                        (await this.setResidentDevicePresenceFromEvent(
                            resident.foreignWayhomeObjectId,
                            foreignWayhomeState,
                            true,
                        )) != false
                    ) {
                        this.log.info(
                            id + ': Monitoring foreign way home datapoint ' + resident.foreignWayhomeObjectId,
                        );
                        // // Cannot be checked due to a bug in js-controller that will always return states with ack=false
                        // if (foreignWayhomeState.ack != true)
                        //     this.log.warn(
                        //         id +
                        //             ': ' +
                        //             resident.foreignWayhomeObjectId +
                        //             ": ACK state is false. Future events will need to have a confirmed (=ACK'ed) status update!",
                        //     );
                        this.foreignSubscriptions.push(resident.foreignWayhomeObjectId);
                    } else {
                        this.wayhomeSubscriptionMapping[resident.foreignWayhomeObjectId].shift();
                        this.log.error(
                            id + ': Foreign way home datapoint ' + resident.foreignWayhomeObjectId + ' is invalid',
                        );
                    }
                }

                // Yahka instance update
                if (
                    resident['yahkaInstanceId'] &&
                    resident['yahkaInstanceId'] != '' &&
                    resident['yahkaInstanceId'] != 'none'
                ) {
                    const serial = this.namespace + '.' + id;
                    const yahkaDeviceConfig = {
                        configType: 'customdevice',
                        manufacturer: 'ioBroker',
                        model: 'residents.' + residentType,
                        name: name,
                        serial: serial,
                        firmware: this.version,
                        enabled: true,
                        category: '11',
                        services: [
                            {
                                name: serial + '.presence.home',
                                subType: 'ioBroker.residents.presence.sensor',
                                type: 'OccupancySensor',
                                characteristics: [
                                    {
                                        name: 'Name',
                                        enabled: true,
                                        inOutFunction: 'const',
                                        inOutParameters: name,
                                    },
                                    {
                                        name: 'StatusActive',
                                        enabled: true,
                                        inOutFunction: 'ioBroker.State',
                                        inOutParameters: serial + '.enabled',
                                    },
                                    {
                                        name: 'OccupancyDetected',
                                        enabled: true,
                                        inOutFunction: 'ioBroker.State',
                                        inOutParameters: serial + '.presence.home',
                                    },
                                ],
                                linkTo: serial + '.presence.state',
                                isPrimary: true,
                            },
                            {
                                name: serial + '.presence.state',
                                subType: 'ioBroker.residents.presence.actor',
                                type: 'SecuritySystem',
                                characteristics: [
                                    {
                                        name: 'Name',
                                        enabled: true,
                                        inOutFunction: 'const',
                                        inOutParameters: name,
                                    },
                                    {
                                        name: 'StatusFault',
                                        enabled: false,
                                    },
                                    {
                                        name: 'StatusActive',
                                        enabled: true,
                                        customCharacteristic: true,
                                        inOutFunction: 'ioBroker.State',
                                        inOutParameters: serial + '.enabled',
                                    },
                                    {
                                        name: 'SecuritySystemCurrentState',
                                        enabled: true,
                                        properties: {
                                            maxValue: 2,
                                            validValues: [0, 1, 2],
                                        },
                                        inOutFunction: 'ioBroker.State.OnlyACK',
                                        inOutParameters: serial + '.presence.state',
                                        conversionFunction: 'map',
                                        conversionParameters: {
                                            /* eslint-disable */
                                            mappings:
                                                residentType == 'pet'
                                                    ? [
                                                          {
                                                              left: 0,
                                                              right: 1,
                                                          },
                                                          {
                                                              left: 1,
                                                              right: 2,
                                                          },
                                                          {
                                                              left: 1,
                                                              right: 0,
                                                          },
                                                      ]
                                                    : [
                                                          {
                                                              left: 0,
                                                              right: 1,
                                                          },
                                                          {
                                                              left: 1,
                                                              right: 0,
                                                          },
                                                          {
                                                              left: 2,
                                                              right: 2,
                                                          },
                                                      ],
                                            /* eslint-enable */
                                        },
                                    },
                                    {
                                        name: 'SecuritySystemTargetState',
                                        enabled: true,
                                        properties: {
                                            validValues: [0, 1, 2],
                                            maxValue: 2,
                                        },
                                        inOutFunction: 'ioBroker.State',
                                        inOutParameters: serial + '.presence.state',
                                        conversionFunction: 'map',
                                        conversionParameters: {
                                            /* eslint-disable */
                                            mappings:
                                                residentType == 'pet'
                                                    ? [
                                                          {
                                                              left: 0,
                                                              right: 1,
                                                          },
                                                          {
                                                              left: 1,
                                                              right: 2,
                                                          },
                                                          {
                                                              left: 1,
                                                              right: 0,
                                                          },
                                                      ]
                                                    : [
                                                          {
                                                              left: 0,
                                                              right: 1,
                                                          },
                                                          {
                                                              left: 1,
                                                              right: 0,
                                                          },
                                                          {
                                                              left: 2,
                                                              right: 2,
                                                          },
                                                      ],
                                            /* eslint-enable */
                                        },
                                    },
                                ],
                                linkTo: serial + '.presence.home',
                            },
                        ],
                        groupString: this.namespace,
                    };

                    const currentYahkaConf = await this.getForeignObjectAsync(
                        'system.adapter.' + resident['yahkaInstanceId'],
                    );

                    if (
                        currentYahkaConf &&
                        currentYahkaConf.common.name == 'yahka' &&
                        currentYahkaConf.native.bridge.devices.filter((e) => e.serial == serial).length == 0
                    ) {
                        this.log.info(
                            'Homekit support: Adding ' +
                                serial +
                                ' to devices of ' +
                                resident['yahkaInstanceId'] +
                                ' instance',
                        );
                        currentYahkaConf.native.bridge.devices.push(yahkaDeviceConfig);
                        await this.setForeignObjectAsync(
                            'system.adapter.' + resident['yahkaInstanceId'],
                            currentYahkaConf,
                        );
                    }
                }
            }
        }

        ///////////////////////////
        // Group mode
        const objectTemplates = await this.getForeignObjectAsync('system.adapter.' + this.namespace);
        if (
            objectTemplates &&
            this.config.residentsParentInstanceIDs != undefined &&
            Array.isArray(this.config.residentsParentInstanceIDs) &&
            this.config.residentsParentInstanceIDs.length > 0
        ) {
            for (const i in this.config.residentsParentInstanceIDs) {
                const instance = String(this.config.residentsParentInstanceIDs[i]);
                const instanceObj = await this.getForeignObjectAsync(instance);
                if (
                    instanceObj &&
                    instance.startsWith('residents.') &&
                    instance.split('.').length == 2 &&
                    instance != this.namespace
                ) {
                    this.log.debug('Monitoring parent resident instance ' + instance);
                    this.subscriptions.push(instance + '.mood');
                    this.subscriptions.push(instance + '.state');
                    this.parentInstances.push(instance);
                } else {
                    this.log.error('Failed to enable monitoring of desired parent resident instance ' + instance);
                }
            }
        }

        if (objectTemplates && this.parentInstances.length > 0) {
            await this.setObjectNotExistsAsync('group', {
                type: 'folder',
                common: {
                    name: {
                        en: 'Information on the group structure of the residents',
                        de: 'Informationen zur Gruppenstruktur der Bewohner',
                        ru: '???????????????????? ?? ?????????????????? ???????????? ??????????????',
                        pt: 'Informa????????es sobre a estrutura de grupo dos residentes',
                        nl: 'Informatie over de groepsstructuur van de bewoners',
                        fr: 'Information sur la structure de groupe des r??sidents',
                        it: 'Informazioni sulla struttura del gruppo dei residenti',
                        es: 'Informaci??n sobre la estructura grupal de los residentes',
                        pl: 'Informacje o strukturze grupowej mieszka??c??w',
                        uk: '???????????????????? ?????? ?????????????? ?????????????????? ??????????????????',
                        'zh-cn': '?????????????????????????????????',
                    },
                },
                native: {},
            });

            await this.setObjectNotExistsAsync(
                'group.info',
                // @ts-ignore
                objectTemplates.instanceObjects.filter((e) => e._id == 'info')[0],
            );
            await this.setObjectNotExistsAsync(
                'group.info.state',
                // @ts-ignore
                objectTemplates.instanceObjects.filter((e) => e._id == 'info.state')[0],
            );

            await this.setObjectNotExistsAsync('group.info.state.originID', {
                type: 'state',
                common: {
                    name: {
                        en: 'Origin instance ID for group state',
                        de: 'Urspr??ngliche Instanz-ID f??r Gruppenstatus',
                        ru: '?????????????????????????? ?????????????????????????? ?????? ???????????????????? ??????????????????????',
                        pt: 'ID de inst??ncia de origem para estado de grupo',
                        nl: 'Origine ID voor groepsstaat',
                        fr: 'Origin instance ID for group state',
                        it: 'ID istanza di origine per stato di gruppo',
                        es: 'ID de instancia de origen para estado de grupo',
                        pl: 'Okre??lenie ID dla pa??stwa grupowego',
                        uk: '?????????????????????????? ???????????????????? ?????? ?????????????????? ??????????',
                        'zh-cn': '??????,??????????????????',
                    },
                    type: 'string',
                    role: 'state',
                    read: true,
                    write: false,
                    def: '',
                },
                native: {},
            });

            await this.setObjectNotExistsAsync(
                'group.state',
                // @ts-ignore
                objectTemplates.instanceObjects.filter((e) => e._id == 'state')[0],
            );
            // Update common.states
            currentObject = await this.getObjectAsync('group.state');
            if (currentObject) {
                currentObject.common.states = residentialStates;
                await this.setObjectAsync('group.state', currentObject);
            }

            await this.setObjectNotExistsAsync(
                'group.mood',
                // @ts-ignore
                objectTemplates.instanceObjects.filter((e) => e._id == 'mood')[0],
            );
            // Update common.states
            currentObject = await this.getObjectAsync('group.mood');
            if (currentObject) {
                currentObject.common.states = moodStates;
                await this.setObjectAsync('group.mood', currentObject);
            }

            this.subscriptions.push('group.state');
            this.subscriptions.push('group.mood');
        }

        await this.setStateChangedAsync('info.state.parentInstanceIDs', {
            val: JSON.stringify(this.parentInstances),
            ack: true,
        });

        ///////////////////////////
        // Subscribe to events
        this.subscriptions.push('control.*');
        this.subscriptions.push('state');
        this.subscriptions.push('mood');

        for (const i in this.subscriptions) {
            const stateList = await this.getStatesAsync(this.subscriptions[i]);
            for (const id in stateList) {
                this.states[id] = stateList[id];
                this.log.silly('Subscribing to events for ' + id);
                this.subscribeStates(id);
            }
        }
        for (const i in this.foreignSubscriptions) {
            const stateList = await this.getForeignStatesAsync(this.foreignSubscriptions[i]);
            for (const id in stateList) {
                this.states[id] = stateList[id];
                this.log.silly('Subscribing to foreign events for ' + id);
                this.subscribeForeignStates(id);
            }
        }

        // Start timers
        if (
            this.config.disableAbsentResidentsDailyTimerEnabled != undefined &&
            this.config.disableAbsentResidentsDailyTimerEnabled == true
        )
            this.timeoutDisableAbsentResidents(true);
        if (
            this.config.resetOvernightDailyTimerEnabled != undefined &&
            this.config.resetOvernightDailyTimerEnabled == true
        )
            this.timeoutResetOvernight(true);

        // Update current state in case something
        //  changes while we where offline
        await this.setResidentsSummary();

        // Complete initialization
        this.initialized = true;
    }

    /**
     * Distribute state events
     *
     * @param {string} id
     * @param {ioBroker.State | null | undefined} state
     * @returns void
     */
    onStateChange(id, state) {
        const a = id.split('.');
        const adapterName = a.shift(); // adapter name
        const adapterInstance = a.shift(); // adapter instance
        const eventNamespace = adapterName + '.' + adapterInstance; // adapter namespace
        const level1 = a.shift(); // first level ID

        // The state was deleted
        if (!state) {
            this.setResidentsSummary();
            return;
        }

        // Own events
        if (eventNamespace == this.namespace) {
            // The state was controlled (ack=false)
            if (!state.ack) {
                switch (level1) {
                    // Global residents commands
                    case 'control': {
                        this.processGlobalControlCommand(id, state);
                        break;
                    }
                    case 'roomie': {
                        this.processResidentDeviceControlCommand(id, state);
                        break;
                    }
                    case 'pet': {
                        this.processResidentDeviceControlCommand(id, state);
                        break;
                    }
                    case 'guest': {
                        this.processResidentDeviceControlCommand(id, state);
                        break;
                    }
                    default: {
                        this.log.error(id + ': Unexpected event');
                    }
                }
            }

            // The state was updated (ack=true)
            else {
                // ignore some of our own ack events
                if (
                    level1 == 'control' ||
                    level1 == 'group' ||
                    level1 == 'info' ||
                    level1 == 'mood' ||
                    level1 == 'state'
                )
                    return;

                this.processResidentDeviceUpdateEvent(id, state);
            }
        }

        // Foreign residents instance events
        else if (adapterName == 'residents') {
            // The state was controlled (ack=false)
            if (!state.ack) {
                //
            }

            // The state was updated (ack=true)
            else {
                // parent residents instance summary state was updated
                if (level1 == 'state' || level1 == 'mood') {
                    this.log.debug('Received parent ' + level1 + ' update from ' + eventNamespace);
                    this.setResidentsSummary();
                }
            }
        }

        // Other foreign events
        else {
            // The state was controlled (ack=false)
            if (!state.ack) {
                if (this.presenceSubscriptionMapping[id] != undefined)
                    this.log.debug(
                        id +
                            ": Received non-ack'ed presence control event. Waiting for ack'ed event to process presence change.",
                    );
                if (this.wayhomeSubscriptionMapping[id] != undefined)
                    this.log.debug(
                        id +
                            ": Received non-ack'ed way home control event. Waiting for ack'ed event to process way home change.",
                    );
            }

            // The state was updated (ack=true)
            else if (this.presenceSubscriptionMapping[id] != undefined) {
                this.setResidentDevicePresenceFromEvent(id, state);
            } else if (this.wayhomeSubscriptionMapping[id] != undefined) {
                this.setResidentDevicePresenceFromEvent(id, state);
            } else {
                this.log.error(id + ': Unexpected event');
            }
        }
    }

    /**
     * Adapter instance shutdown
     *
     * @param {() => void} callback
     * @returns void
     */
    onUnload(callback) {
        try {
            this.log.info('Clean up everything ...');

            if (this.calculationTimeout) {
                this.clearTimeout(this.calculationTimeout);
                this.log.debug('Cleared calculation timeout');
            }
            if (this.absentTimeout) {
                this.clearTimeout(this.absentTimeout);
                this.log.debug('Cleared absent timeout');
            }
            if (this.overnightTimeout) {
                this.clearTimeout(this.overnightTimeout);
                this.log.debug('Cleared overnight timeout');
            }

            callback();
        } catch (e) {
            callback();
        }
    }

    /**
     * Process global events of this residents instance
     *
     * @param {string} id
     * @param {ioBroker.State} state
     * @returns void
     */
    processGlobalControlCommand(id, state) {
        const a = id.split('.');
        a.shift(); // adapter name
        a.shift(); // adapter instance
        const level1 = a.shift(); // first level ID
        const level2 = a.shift(); // second level ID
        const level3 = a.shift(); // third level ID
        const allLevels = [level1, level2, level3].join('.');
        // const levels1_2 = [level1, level2].join('.');
        const levels2_3 = [level2, level3].join('.');

        if (typeof level1 != 'string') return;

        // const oldState = this.states[id] ? this.states[id] : state;
        this.states[id] = state;

        switch (levels2_3) {
            case 'state.disableAll': {
                this.residents.forEach(async (resident) => {
                    const enabled = await this.getStateAsync(resident['id'] + '.enabled');
                    const away = await this.getStateAsync(resident['id'] + '.presence.away');

                    if (!enabled || !away) return;

                    if (enabled.val == false) {
                        this.log.debug(
                            allLevels + ': ' + resident['id'] + " is already 'disabled', therefore it is not changed.",
                        );
                    } else if (away.val == false) {
                        this.log.debug(
                            allLevels + ': ' + resident['id'] + " is not 'away', therefore it is not disabled.",
                        );
                    } else {
                        this.log.info(allLevels + ': Disabling absent device ' + resident['id'] + '.');
                        await this.setStateChangedAsync(resident['id'] + '.enabled', {
                            val: false,
                            ack: false,
                        });
                    }
                });
                break;
            }

            case 'state.enableAll': {
                this.residents.forEach(async (resident) => {
                    const enabled = await this.getStateAsync(resident['id'] + '.enabled');

                    if (!enabled) return;

                    if (enabled.val == true) {
                        this.log.debug(
                            allLevels + ': ' + resident['id'] + " is already 'enabled', therefore it is not changed.",
                        );
                    } else {
                        this.log.info(allLevels + ': Enabling device ' + resident['id'] + '.');
                        await this.setStateChangedAsync(resident['id'] + '.enabled', {
                            val: true,
                            ack: false,
                        });
                    }
                });
                break;
            }

            case 'presence.setHomeAll': {
                this.residents.forEach(async (resident) => {
                    const enabled = await this.getStateAsync(resident['id'] + '.enabled');
                    const home = await this.getStateAsync(resident['id'] + '.presence.home');

                    if (!enabled || !home) return;

                    if (home.val == true) {
                        this.log.debug(
                            allLevels + ': ' + resident['id'] + " is already 'home', therefore it is not changed.",
                        );
                    } else if (enabled.val == true) {
                        this.log.info(allLevels + ': Changing ' + resident['id'] + " to 'home'.");
                        await this.setStateChangedAsync(resident['id'] + '.presence.home', {
                            val: true,
                            ack: false,
                        });
                    } else {
                        this.log.debug(
                            allLevels +
                                ': ' +
                                resident['id'] +
                                " is 'disabled', therefore it is excluded from group control.",
                        );
                    }
                });
                break;
            }

            case 'presence.unsetHomeAll': {
                this.residents.forEach(async (resident) => {
                    const enabled = await this.getStateAsync(resident['id'] + '.enabled');
                    const home = await this.getStateAsync(resident['id'] + '.presence.home');

                    if (!enabled || !home) return;

                    if (home.val == false) {
                        this.log.debug(
                            allLevels + ': ' + resident['id'] + " is already 'away', therefore it is not changed.",
                        );
                    } else if (enabled.val == true) {
                        this.log.info(allLevels + ': Changing ' + resident['id'] + " to 'away'.");
                        await this.setStateChangedAsync(resident['id'] + '.presence.home', {
                            val: false,
                            ack: false,
                        });
                    } else {
                        this.log.debug(
                            allLevels +
                                ': ' +
                                resident['id'] +
                                " is 'disabled', therefore it is excluded from group control.",
                        );
                    }
                });
                break;
            }

            case 'presence.setNightAll': {
                this.residents.forEach(async (resident) => {
                    const home = await this.getStateAsync(resident['id'] + '.presence.home');
                    const night = await this.getStateAsync(resident['id'] + '.presence.night');

                    if (!home || !night) return;

                    if (resident['type'] == 'pet') {
                        this.log.debug(allLevels + ': ' + resident['id'] + ' is a pet without night state - ignoring.');
                    } else if (night.val == true) {
                        this.log.debug(
                            allLevels + ': ' + resident['id'] + " is already at 'night', therefore it is not changed.",
                        );
                    } else if (home.val == false) {
                        this.log.debug(
                            allLevels +
                                ': ' +
                                resident['id'] +
                                " is not 'home', therefore it is excluded from group control.",
                        );
                    } else {
                        this.log.info(allLevels + ': Changing ' + resident['id'] + " to 'night'.");
                        await this.setStateChangedAsync(resident['id'] + '.presence.night', {
                            val: true,
                            ack: false,
                        });
                    }
                });
                break;
            }

            case 'presence.unsetNightAll': {
                this.residents.forEach(async (resident) => {
                    const home = await this.getStateAsync(resident['id'] + '.presence.home');
                    const night = await this.getStateAsync(resident['id'] + '.presence.night');

                    if (!home || !night) return;

                    if (resident['type'] == 'pet') {
                        this.log.debug(allLevels + ': ' + resident['id'] + ' is a pet without night state - ignoring.');
                    } else if (night.val == false) {
                        this.log.debug(
                            allLevels + ': ' + resident['id'] + " is already not 'night', therefore it is not changed.",
                        );
                    } else if (home.val == false) {
                        this.log.debug(
                            allLevels +
                                ': ' +
                                resident['id'] +
                                " is not 'home', therefore it is excluded from group control.",
                        );
                    } else {
                        this.log.info(allLevels + ': Changing ' + resident['id'] + " to not 'night'.");
                        await this.setStateChangedAsync(resident['id'] + '.presence.night', {
                            val: false,
                            ack: false,
                        });
                    }
                });
                break;
            }

            case 'presence.setAwayAll': {
                this.residents.forEach(async (resident) => {
                    const away = await this.getStateAsync(resident['id'] + '.presence.away');

                    if (!away) return;

                    if (away.val == true) {
                        this.log.debug(
                            allLevels + ': ' + resident['id'] + " is already at 'away', therefore it is not changed.",
                        );
                    } else {
                        this.log.info(allLevels + ': Changing ' + resident['id'] + " to 'away'.");
                        await this.setStateChangedAsync(resident['id'] + '.presence.away', {
                            val: true,
                            ack: false,
                        });
                    }
                });
                break;
            }

            case 'presence.unsetAwayAll': {
                this.residents.forEach(async (resident) => {
                    const away = await this.getStateAsync(resident['id'] + '.presence.away');

                    if (!away) return;

                    if (away.val == false) {
                        this.log.debug(
                            allLevels +
                                ': ' +
                                resident['id'] +
                                " is already at not 'away', therefore it is not changed.",
                        );
                    } else {
                        this.log.info(allLevels + ': Changing ' + resident['id'] + " to not 'away'.");
                        await this.setStateChangedAsync(resident['id'] + '.presence.away', {
                            val: false,
                            ack: false,
                        });
                    }
                });
                break;
            }

            case 'activity.setOvernightAll': {
                this.residents.forEach(async (resident) => {
                    const enabled = await this.getStateAsync(resident['id'] + '.enabled');
                    const overnight = await this.getStateAsync(resident['id'] + '.activity.overnight');

                    if (!enabled || !overnight) return;

                    if (resident['type'] == 'pet') {
                        this.log.debug(allLevels + ': ' + resident['id'] + ' is a pet without night state - ignoring.');
                    } else if (overnight.val == true) {
                        this.log.debug(
                            allLevels +
                                ': ' +
                                resident['id'] +
                                " activity 'overnight' is already active, therefore it is not changed.",
                        );
                    } else if (enabled.val == false) {
                        this.log.debug(
                            allLevels +
                                ': ' +
                                resident['id'] +
                                " is 'disabled', therefore it is excluded from group control.",
                        );
                    } else {
                        this.log.info(allLevels + ': Enabling ' + resident['id'] + "for 'overnight'.");
                        await this.setStateAsync(resident['id'] + '.activity.overnight', {
                            val: true,
                            ack: false,
                        });
                    }
                });
                break;
            }

            case 'activity.unsetOvernightAll': {
                this.residents.forEach(async (resident) => {
                    const enabled = await this.getStateAsync(resident['id'] + '.enabled');
                    const overnight = await this.getStateAsync(resident['id'] + '.activity.overnight');

                    if (!enabled || !overnight) return;

                    if (resident['type'] == 'pet') {
                        this.log.debug(allLevels + ': ' + resident['id'] + ' is a pet without night state - ignoring.');
                    } else if (overnight.val == false) {
                        this.log.debug(
                            allLevels +
                                ': ' +
                                resident['id'] +
                                " activity 'overnight' is already disabled, therefore it is not changed.",
                        );
                    } else if (enabled.val == false) {
                        this.log.debug(
                            allLevels +
                                ': ' +
                                resident['id'] +
                                " is 'disabled', therefore it is excluded from group control.",
                        );
                    } else {
                        this.log.info(allLevels + ': Disabling ' + resident['id'] + "for 'overnight'.");
                        await this.setStateAsync(resident['id'] + '.activity.overnight', {
                            val: false,
                            ack: false,
                        });
                    }
                });
                break;
            }

            case 'activity.resetOvernightAll': {
                this.residents.forEach(async (resident) => {
                    const enabled = await this.getStateAsync(resident['id'] + '.enabled');
                    const overnight = await this.getStateAsync(resident['id'] + '.activity.overnight');
                    const overnightObj = await this.getObjectAsync(resident['id'] + '.activity.overnight');

                    if (!enabled || !overnight || !overnightObj) return;

                    if (resident['type'] == 'pet') {
                        this.log.debug(allLevels + ': ' + resident['id'] + ' is a pet without night state - ignoring.');
                    } else if (overnight.val == overnightObj.common.def) {
                        this.log.debug(
                            allLevels +
                                ': ' +
                                resident['id'] +
                                " activity 'overnight' is already " +
                                overnightObj.common.def +
                                ', therefore it is not changed.',
                        );
                    } else if (enabled.val == false) {
                        this.log.debug(
                            allLevels +
                                ': ' +
                                resident['id'] +
                                " is 'disabled', therefore it is excluded from group control.",
                        );
                    } else {
                        this.log.info(
                            allLevels +
                                ": Resetting 'overnight' for " +
                                resident['id'] +
                                ' to ' +
                                overnightObj.common.def +
                                '.',
                        );
                        await this.setStateAsync(resident['id'] + '.activity.overnight', {
                            val: overnightObj.common.def,
                            ack: false,
                        });
                    }
                });
                break;
            }

            case 'activity.setWayhomeAll': {
                this.residents.forEach(async (resident) => {
                    const wayhome = await this.getStateAsync(resident['id'] + '.activity.wayhome');
                    const away = await this.getStateAsync(resident['id'] + '.presence.away');

                    if (!wayhome || !away) return;

                    if (resident['type'] == 'pet') {
                        this.log.debug(
                            allLevels + ': ' + resident['id'] + ' is a pet without way home state - ignoring.',
                        );
                    } else if (away.val == false) {
                        this.log.debug(allLevels + ': ' + resident['id'] + ' is already at home - ignoring.');
                    } else if (wayhome.val == true) {
                        this.log.debug(
                            allLevels +
                                ': ' +
                                resident['id'] +
                                " activity 'wayhome' is already active, therefore it is not changed.",
                        );
                    } else {
                        this.log.info(allLevels + ': Enabling ' + resident['id'] + " for 'wayhome'.");
                        await this.setStateAsync(resident['id'] + '.activity.wayhome', {
                            val: true,
                            ack: false,
                        });
                    }
                });
                break;
            }

            case 'activity.unsetWayhomeAll': {
                this.residents.forEach(async (resident) => {
                    const wayhome = await this.getStateAsync(resident['id'] + '.activity.wayhome');

                    if (!wayhome) return;

                    if (resident['type'] == 'pet') {
                        this.log.debug(
                            allLevels + ': ' + resident['id'] + ' is a pet without way home state - ignoring.',
                        );
                    } else if (wayhome.val == false) {
                        this.log.debug(
                            allLevels +
                                ': ' +
                                resident['id'] +
                                " activity 'wayhome' is already disabled, therefore it is not changed.",
                        );
                    } else {
                        this.log.info(allLevels + ': Disabling ' + resident['id'] + "for 'wayhome'.");
                        await this.setStateAsync(resident['id'] + '.activity.wayhome', {
                            val: false,
                            ack: false,
                        });
                    }
                });
                break;
            }

            default: {
                this.log.error('Received unknown command ' + level2 + '.' + level3);
                break;
            }
        }

        state.ack = true;
        state.lc = state.ts;
        this.setState(id, state);
    }

    /**
     * Process device control events that are handled by this residents instance
     *
     * @param {string} id
     * @param {ioBroker.State} state
     * @returns void
     */
    processResidentDeviceControlCommand(id, state) {
        const a = id.split('.');
        a.shift(); // adapter name
        a.shift(); // adapter instance
        const level1 = a.shift(); // first level ID
        const level2 = a.shift(); // second level ID
        const level3 = a.shift(); // third level ID
        const level4 = a.shift(); // fourth level ID

        if (typeof level1 != 'string' || typeof level2 != 'string') return;

        const oldState = this.states[id] ? this.states[id] : state;
        this.states[id] = state;

        switch (level3) {
            case 'enabled': {
                this.log.debug(level2 + ': Controlling ' + id + ': ' + state.val);
                return this.enableResidentDevice(level1, level2, state, oldState);
            }

            case 'activity': {
                if (typeof level4 != 'string') return false;
                this.log.debug(level2 + ': Controlling ' + id + ': ' + state.val);
                return this.setResidentDeviceActivity(level1, level2, level4, state, oldState);
            }

            case 'mood': {
                this.log.debug(level2 + ': Controlling ' + id + ': ' + state.val);
                return this.setResidentDeviceMood(level1, level2, state, oldState);
            }

            case 'presence': {
                if (typeof level4 != 'string') return false;
                this.log.debug(level2 + ': Controlling ' + id + ': ' + state.val);
                return this.setResidentDevicePresence(level1, level2, level4, state, oldState);
            }

            case 'presenceFollowing': {
                if (typeof level4 != 'string') return false;
                this.log.debug(level2 + ': Controlling ' + id + ': ' + state.val);
                return this.setResidentDevicePresenceFollowing(level1, level2, level4, state, oldState);
            }

            default: {
                this.log.error(level2 + ': Controlling unknown channel ' + level3);
            }
        }
    }

    /**
     * Process device update events that are handled by this residents instance
     *
     * @param {string} id
     * @param {ioBroker.State} state
     * @returns void
     */
    processResidentDeviceUpdateEvent(id, state) {
        const a = id.split('.');
        a.shift(); // adapter name
        a.shift(); // adapter instance
        a.shift(); // first level ID
        const level2 = a.shift(); // second level ID
        const level3 = a.shift(); // third level ID
        const level4 = a.shift(); // fourth level ID

        // const oldState = this.states[id] ? this.states[id] : state;
        this.states[id] = state;

        switch (level3) {
            case 'activity': {
                if (level4 == 'state') {
                    this.log.debug(this.namespace + ": Received ack'ed update of " + id + ': ' + state.val);
                    this.setResidentsSummary();
                }
                break;
            }

            case 'enabled': {
                if (state.val == true) {
                    this.log.debug(this.namespace + ": Received ack'ed enablement of " + level2);
                    this.setResidentsSummary();
                }
                break;
            }

            case 'mood': {
                if (level4 == 'state') {
                    this.log.debug(this.namespace + ": Received ack'ed update of " + id + ': ' + state.val);
                    this.setResidentsSummary();
                }
                break;
            }

            case 'presence': {
                if (level4 == 'state') {
                    this.log.debug(this.namespace + ": Received ack'ed update of " + id + ': ' + state.val);
                    this.setResidentsSummary();
                }
                break;
            }

            case 'presenceFollowing': {
                break;
            }

            default: {
                this.log.error(this.namespace + ": Received unknown ack'ed update of " + id + ': ' + state.val);
            }
        }
    }

    /**
     * Update all activity states for a particular residents device
     *
     * @param {string} residentType
     * @param {string} device
     * @param {string} command
     * @param {ioBroker.State} state
     * @param {ioBroker.State} [oldState]
     * @returns void
     */
    async setResidentDeviceActivity(residentType, device, command, state, oldState) {
        const id = residentType + '.' + device;
        const enabledState = await this.getStateAsync(id + '.enabled');
        const presenceState = await this.getStateAsync(id + '.presence.state');
        const activityState = await this.getStateAsync(id + '.activity.state');
        const dndState = await this.getStateAsync(id + '.activity.dnd');
        if (
            !enabledState ||
            !presenceState ||
            presenceState.val == undefined ||
            !activityState ||
            activityState.val == undefined ||
            typeof activityState.val != 'number' ||
            !dndState ||
            state.val == undefined
        )
            return;

        if (!oldState) oldState = state;
        if (activityState.val >= 10000) activityState.val -= 10000;
        if (command == 'dnd') dndState.val = oldState.val;

        let stateAwake = false;
        let stateBedtime = 0;
        let stateWakeup = false;
        let stateWayhome = false;

        switch (command) {
            case 'state': {
                if (typeof state.val != 'number' || oldState.val == null || typeof oldState.val != 'number') {
                    this.log.error(
                        id +
                            '.activity.state' +
                            " has rejected invalid input value type '" +
                            typeof state.val +
                            "' with value " +
                            state.val,
                    );
                    state.ack = true;
                    state.q = 0x01;
                    state.val = oldState.val;
                    await this.setStateAsync(id + '.activity.state', state);
                    return;
                }
                if (oldState.val >= 10000) oldState.val -= 10000;
                let changePresenceToHome = false;
                let changePresenceToAway = false;
                const focusObject = await this.getObjectAsync(id + '.activity.focus');

                // 000-0999: Not present at home / Away
                if (state.val < 1000) {
                    changePresenceToAway = true;
                    if (state.val == 2) stateWayhome = true;
                }

                // 1000-1999: WAKING TIME at home
                else if (state.val >= 1000 && state.val < 2000) {
                    // 1900-1999: WAKING TIME at home: Transitioning to Sleeping Time
                    if (state.val == 1900) {
                        stateBedtime = 1;
                    } else if (state.val == 1901) {
                        stateBedtime = 2;
                    } else if (state.val == 1902) {
                        stateBedtime = 3;
                    }
                }

                // 2000-2999: SLEEPING TIME at home
                else if (state.val >= 2000 && state.val < 3000) {
                    // 2000-2099: SLEEPING TIME at home: While I should be sleeping
                    if (state.val >= 2010 && state.val < 2020) {
                        stateAwake = true;
                    }

                    // 2100-2199: SLEEPING TIME at home: While I should get up
                    else if (state.val >= 2100 && state.val < 2200) {
                        stateWakeup = true;
                    }

                    // 2200-2299: SLEEPING TIME at home: Transitioning to Waking Time
                    else if (state.val >= 2200) {
                        stateAwake = true;
                        changePresenceToHome = true;
                    }
                }

                // Enforce DND during night time
                if (presenceState.val == 2) {
                    if (focusObject != undefined) focusObject.common.states = focusObject.native.states.home;
                    if (state.val >= 10000) state.val -= 10000;
                    if (dndState.val == false) {
                        await this.setStateAsync(id + '.activity.dnd', { val: true, ack: true });
                    }
                }

                // Reflect DND in state value when at home and awake
                else if (presenceState.val == 1) {
                    if (focusObject != undefined) focusObject.common.states = focusObject.native.states.home;
                    if (oldState.val >= 2000) {
                        await this.setStateAsync(id + '.activity.dnd', { val: false, ack: true });
                        dndState.val = false;
                    }
                    if (dndState.val == true && state.val < 10000) {
                        state.val += 10000;
                    } else if (dndState.val == false && state.val >= 10000) {
                        state.val -= 10000;
                    }
                }

                // Remove DND in state value when away
                else {
                    if (focusObject != undefined) focusObject.common.states = focusObject.native.states.away;
                    if (state.val >= 10000) state.val -= 10000;
                    if (dndState.val == true) {
                        await this.setStateAsync(id + '.activity.dnd', { val: false, ack: true });
                    }
                }

                await this.setStateAsync(id + '.activity.awake', { val: stateAwake, ack: true });
                await this.setStateAsync(id + '.activity.bedtime', { val: stateBedtime, ack: true });
                await this.setStateAsync(id + '.activity.wakeup', { val: stateWakeup, ack: true });
                await this.setStateAsync(id + '.activity.wayhome', { val: stateWayhome, ack: true });

                state.ack = true;
                await this.setStateAsync(id + '.activity.state', state);

                // Dynamically update common.states for activity.focus
                if (focusObject != undefined) await this.setObjectAsync(id + '.activity.focus', focusObject);

                if (state.val >= 10000) state.val -= 10000; // remove DND value for activity.focus
                if (state.val < 100 || (state.val >= 300 && state.val < 1100) || state.val >= 1300) state.val = 0;
                await this.setStateAsync(id + '.activity.focus', state);

                if (presenceState.val == 2 && changePresenceToHome) {
                    await this.setStateAsync(id + '.presence.night', { val: false, ack: true });
                    await this.setStateAsync(id + '.presence.state', { val: 1, ack: true });
                } else if (presenceState.val > 0 && changePresenceToAway) {
                    await this.setStateAsync(id + '.presence.night', { val: false, ack: true });
                    await this.setStateAsync(id + '.presence.home', { val: false, ack: true });
                    await this.setStateAsync(id + '.presence.away', { val: true, ack: true });
                    await this.setStateAsync(id + '.presence.state', { val: 0, ack: true });
                }
                break;
            }

            case 'awake': {
                if (typeof state.val != 'boolean') {
                    this.log.error(
                        id +
                            '.activity.awake' +
                            " has rejected invalid input value type '" +
                            typeof state.val +
                            "' with value " +
                            state.val,
                    );
                    state.ack = true;
                    state.q = 0x01;
                    state.val = oldState.val;
                    await this.setStateAsync(id + '.activity.awake', state);
                    return;
                }
                if (activityState.val < 2000) {
                    this.log.warn(device + ': Awake state can only be controlled during night time');
                    state.ack = true;
                    state.val = oldState.val;
                    state.q = 0x40;
                    await this.setStateAsync(id + '.activity.awake', state);
                } else {
                    let newActivityVal = 1000;
                    if (state.val == true) {
                        // Awake during night >> irregular occurance
                        if (activityState.val == 2000 || activityState.val == 2010 || activityState.val == 2020) {
                            newActivityVal = 2010;
                        }

                        // Awake during wakeup >> got up from sleep
                        else if (activityState.val >= 2100) {
                            newActivityVal = 2200;
                        } else {
                            newActivityVal = 2210;
                        }
                    } else if (activityState.val >= 2010 && activityState.val < 2020) {
                        newActivityVal = 2020;
                    }
                    this.setResidentDeviceActivity(
                        residentType,
                        device,
                        'state',
                        { val: newActivityVal, ack: false, ts: state.ts, lc: activityState.lc, from: state.from },
                        activityState,
                    );
                }
                break;
            }

            case 'bedtime': {
                if (typeof state.val != 'number') {
                    this.log.error(
                        id +
                            '.activity.bedtime' +
                            " has rejected invalid input value type '" +
                            typeof state.val +
                            "' with value " +
                            state.val,
                    );
                    state.ack = true;
                    state.q = 0x01;
                    state.val = oldState.val;
                    await this.setStateAsync(id + '.activity.bedtime', state);
                    return;
                }
                state.ack = true;
                if (activityState.val >= 1000) {
                    let newActivityVal = 1000;
                    if (state.val == 1) {
                        newActivityVal = 1900;
                    } else if (state.val == 2) {
                        newActivityVal = 1901;
                    } else if (state.val == 3) {
                        newActivityVal = 1902;
                    }
                    this.setResidentDeviceActivity(
                        residentType,
                        device,
                        'state',
                        { val: newActivityVal, ack: false, ts: state.ts, lc: activityState.lc, from: state.from },
                        activityState,
                    );
                } else {
                    this.log.warn(device + ': Presence at home is required to start bedtime process');
                    state.val = 0;
                    state.q = 0x40;
                    await this.setStateAsync(id + '.activity.bedtime', state);
                }
                break;
            }

            case 'dnd': {
                if (typeof state.val != 'boolean') {
                    this.log.error(
                        id +
                            '.activity.dnd' +
                            " has rejected invalid input value type '" +
                            typeof state.val +
                            "' with value " +
                            state.val,
                    );
                    state.ack = true;
                    state.q = 0x01;
                    state.val = oldState.val;
                    await this.setStateAsync(id + '.activity.dnd', state);
                    return;
                }
                state.ack = true;
                if (presenceState.val == 0) {
                    this.log.warn(device + ': Do Not Disturb can only be controlled during presence at home');
                    state.val = false;
                    state.q = 0x40;
                } else if (presenceState.val == 2) {
                    this.log.warn(device + ': Do Not Disturb can not be controlled during night time');
                    state.val = true;
                    state.q = 0x40;
                } else {
                    this.setResidentDeviceActivity(
                        residentType,
                        device,
                        'state',
                        { val: activityState.val, ack: false, ts: state.ts, lc: activityState.lc, from: state.from },
                        activityState,
                    );
                }
                await this.setStateAsync(id + '.activity.dnd', state);
                break;
            }

            case 'overnight': {
                if (typeof state.val != 'boolean') {
                    this.log.error(
                        id +
                            '.activity.overnight' +
                            " has rejected invalid input value type '" +
                            typeof state.val +
                            "' with value " +
                            state.val,
                    );
                    state.ack = true;
                    state.q = 0x01;
                    state.val = oldState.val;
                    await this.setStateAsync(id + '.activity.overnight', state);
                    return;
                }
                state.ack = true;
                if (state.val == true) {
                    if (enabledState.val == false) {
                        this.log.info(
                            device + ' opted in to the overnight stay and therefore is automatically re-enabled',
                        );
                        await this.setStateAsync(id + '.enabled', { val: true, ack: true });
                    }
                } else if (presenceState.val == 0 && enabledState.val == true) {
                    this.log.info(
                        device +
                            ' has logged out of the overnight stay and therefore automatically deactivated because of being away right now',
                    );
                    await this.setStateAsync(id + '.enabled', { val: false, ack: true });
                    await this.setStateChangedAsync(id + '.activity.wayhome', { val: false, ack: false });
                }
                await this.setStateAsync(id + '.activity.overnight', state);
                await this.setResidentsSummary();
                break;
            }

            case 'focus': {
                if (typeof state.val != 'number') {
                    this.log.error(
                        id +
                            '.activity.focus' +
                            " has rejected invalid input value type '" +
                            typeof state.val +
                            "' with value " +
                            state.val,
                    );
                    state.ack = true;
                    state.q = 0x01;
                    state.val = oldState.val;
                    await this.setStateAsync(id + '.activity.focus', state);
                    return;
                }
                if (presenceState.val == 2) {
                    this.log.debug(device + ': A focus can not be set during night time');
                    state.ack = true;
                    state.val = oldState.val;
                    state.q = 0x40;
                    await this.setStateAsync(id + '.activity.focus', state);
                } else {
                    state.ack = true;
                    if (presenceState.val == 0 && state.val == 0) state.val = enabledState.val == true ? 1 : 0;
                    if (presenceState.val == 1 && state.val == 0) state.val = 1000;
                    if (presenceState.val == 1 && state.val >= 10000) {
                        if (dndState.val == false)
                            await this.setStateAsync(id + '.activity.dnd', { val: true, ack: true });
                        state.val -= 10000;
                    } else {
                        if (dndState.val == true)
                            await this.setStateAsync(id + '.activity.dnd', { val: false, ack: true });
                    }
                    this.setResidentDeviceActivity(residentType, device, 'state', state, activityState);
                }
                break;
            }

            case 'wakeup': {
                if (typeof state.val != 'boolean') {
                    this.log.error(
                        id +
                            '.activity.wakeup' +
                            " has rejected invalid input value type '" +
                            typeof state.val +
                            "' with value " +
                            state.val,
                    );
                    state.ack = true;
                    state.q = 0x01;
                    state.val = oldState.val;
                    await this.setStateAsync(id + '.activity.wakeup', state);
                    return;
                }
                state.ack = true;
                if (presenceState.val == 2) {
                    await this.setStateAsync(id + '.activity.wakeup', state);
                    let newActivityVal = activityState.val >= 2100 ? 2200 : 1000;
                    if (state.val == true)
                        newActivityVal = activityState.val >= 2100 ? Number(activityState.val) : 2100;
                    this.setResidentDeviceActivity(
                        residentType,
                        device,
                        'state',
                        { val: newActivityVal, ack: false, ts: state.ts, lc: activityState.lc, from: state.from },
                        activityState,
                    );
                } else {
                    if (state.val == true) {
                        this.log.warn(device + ': A wake-up alarm can only be triggered during night time at home');
                        state.val = false;
                        state.q = 0x40;
                    }
                    await this.setStateAsync(id + '.activity.wakeup', state);
                }
                break;
            }

            case 'wakeupSnooze': {
                if (typeof state.val != 'boolean') {
                    this.log.error(
                        id +
                            '.activity.wakeupSnooze' +
                            " has rejected invalid input value type '" +
                            typeof state.val +
                            "' with value " +
                            state.val,
                    );
                    state.ack = true;
                    state.q = 0x01;
                    state.val = oldState.val;
                    await this.setStateAsync(id + '.activity.wakeupSnooze', state);
                    return;
                }
                state.ack = true;
                if (activityState.val >= 2100 && activityState.val < 2200) {
                    let newActivityVal = Number(activityState.val);
                    if (activityState.val < 2105) newActivityVal++;
                    this.setResidentDeviceActivity(
                        residentType,
                        device,
                        'state',
                        { val: newActivityVal, ack: false, ts: state.ts, lc: activityState.lc, from: state.from },
                        activityState,
                    );
                } else {
                    this.log.warn(device + ' has no wake-up alarm running that can be snoozed');
                    state.val = true;
                    state.q = 0x41;
                }
                state.lc = state.ts;
                await this.setStateAsync(id + '.activity.wakeupSnooze', state);
                break;
            }

            case 'wayhome': {
                if (typeof state.val != 'boolean') {
                    this.log.error(
                        id +
                            '.activity.wayhome' +
                            " has rejected invalid input value type '" +
                            typeof state.val +
                            "' with value " +
                            state.val,
                    );
                    state.ack = true;
                    state.q = 0x01;
                    state.val = oldState.val;
                    await this.setStateAsync(id + '.activity.wayhome', state);
                    return;
                }
                const away = await this.getStateAsync(device + '.presence.away');
                if (away && away.val == false) {
                    this.log.warn(device + ': Wayhome state can only be controlled during absence');
                    state.ack = true;
                    state.val = oldState.val;
                    state.q = 0x40;
                    await this.setStateAsync(id + '.activity.wayhome', state);
                    break;
                }

                let newActivityVal = 0;
                if (state.val == true) {
                    if (enabledState.val == false) await this.setStateAsync(id + '.enabled', { val: true, ack: true });
                    newActivityVal = 2;
                } else if (enabledState.val == true) {
                    newActivityVal = 1;
                }
                this.setResidentDeviceActivity(
                    residentType,
                    device,
                    'state',
                    { val: newActivityVal, ack: false, ts: state.ts, lc: activityState.lc, from: state.from },
                    activityState,
                );
                break;
            }

            default: {
                this.log.warn(device + ': Controlling unknown activity ' + command);
                return false;
            }
        }

        return true;
    }

    /**
     * Update all mood states for a particular residents device
     *
     * @param {string} residentType
     * @param {string} device
     * @param {ioBroker.State} state
     * @param {ioBroker.State} [oldState]
     * @returns void
     */
    async setResidentDeviceMood(residentType, device, state, oldState) {
        const id = residentType + '.' + device;
        if (!oldState) oldState = state;
        if (typeof state.val != 'number') {
            this.log.error(
                id +
                    '.mood.state' +
                    " has rejected invalid input value type '" +
                    typeof state.val +
                    "' with value " +
                    state.val,
            );
            state.ack = true;
            state.q = 0x01;
            state.val = oldState.val;
            await this.setStateAsync(id + '.mood.state', state);
            return;
        }
        const presenceState = await this.getStateAsync(id + '.presence.state');
        if (!presenceState || presenceState.val == undefined) return;
        if (!oldState) oldState = state;

        if (presenceState.val != 1) {
            this.log.warn(device + ': Mood can only be controlled during waking time at home');
            state.val = oldState.val;
            state.q = 0x40;
        }

        state.ack = true;
        await this.setStateAsync(id + '.mood.state', state);
    }

    /**
     * Update all presence states for a particular residents device
     *
     * @param {string} residentType
     * @param {string} device
     * @param {string} command
     * @param {ioBroker.State} state
     * @param {ioBroker.State} [oldState]
     * @returns void
     */
    async setResidentDevicePresence(residentType, device, command, state, oldState) {
        const id = residentType + '.' + device;
        const enabledState = await this.getStateAsync(id + '.enabled');
        const presenceState = await this.getStateAsync(id + '.presence.state');
        const activityState = await this.getStateAsync(id + '.activity.state');
        const overnightState = await this.getStateAsync(id + '.activity.overnight');
        if (!enabledState || !presenceState || presenceState.val == undefined) return;

        if (
            activityState &&
            activityState.val != null &&
            typeof activityState.val == 'number' &&
            activityState.val >= 10000
        )
            activityState.val -= 10000;
        if (!oldState) oldState = state;

        let stateNight = false;
        let stateHome = false;
        let stateActivity = 0;

        switch (command) {
            case 'state': {
                if (typeof state.val != 'number') {
                    this.log.error(
                        id +
                            '.presence.state' +
                            " has rejected invalid input value type '" +
                            typeof state.val +
                            "' with value " +
                            state.val,
                    );
                    state.ack = true;
                    state.q = 0x01;
                    state.val = oldState.val;
                    await this.setStateAsync(id + '.presence.state', state);
                    return;
                }

                // Update last* datapoints when presence changed
                if (state.val != oldState.val) {
                    const last = new Date(state.ts).toLocaleTimeString(this.language, {
                        weekday: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false,
                    });

                    if (residentType != 'pet' && oldState.val == 2)
                        await this.setStateChangedAsync(id + '.info.presence.lastAwoken', {
                            val: last,
                            ack: true,
                            ts: state.ts,
                            lc: state.ts,
                            from: state.from,
                        });

                    switch (state.val) {
                        case 0: {
                            await this.setStateChangedAsync(id + '.info.presence.lastAway', {
                                val: last,
                                ack: true,
                                ts: state.ts,
                                lc: state.ts,
                                from: state.from,
                            });
                            break;
                        }
                        case 1: {
                            if (oldState.val == 0)
                                await this.setStateChangedAsync(id + '.info.presence.lastHome', {
                                    val: last,
                                    ack: true,
                                    ts: state.ts,
                                    lc: state.ts,
                                    from: state.from,
                                });
                            break;
                        }
                        case 2: {
                            if (residentType != 'pet')
                                await this.setStateChangedAsync(id + '.info.presence.lastNight', {
                                    val: last,
                                    ack: true,
                                    ts: state.ts,
                                    lc: state.ts,
                                    from: state.from,
                                });
                            break;
                        }
                    }
                }

                // Disable immediately if no overnight stay planned
                if (overnightState && overnightState.val == false && state.val == 0) {
                    this.log.info(device + ' disabled during away event due to planned absence this night');
                    await this.setStateChangedAsync(id + '.enabled', { val: false, ack: true });
                    enabledState.val = false;
                }

                if (enabledState.val == true) {
                    stateActivity = 1;
                }

                // Always reset mood if presence state was changed
                if (residentType != 'pet' && state.val != oldState.val) {
                    await this.setStateChangedAsync(id + '.mood.state', { val: 5, ack: true });
                }

                // When present at home
                if (state.val > 0) {
                    stateHome = true;

                    // When at sleep
                    if (state.val == 2) {
                        stateNight = true;

                        // change activity state to the correct range
                        if (activityState && activityState.val != undefined) {
                            if (activityState.val < 2000) {
                                stateActivity = 2000;
                            } else if (activityState.val < 2100) {
                                stateActivity = 2020;
                            } else if (activityState.val < 2110) {
                                stateActivity = 2110;
                            } else if (activityState.val < 2120) {
                                stateActivity = 2120;
                            } else if (activityState.val < 2130) {
                                stateActivity = 2130;
                            } else {
                                stateActivity = Number(activityState.val);
                            }
                        }
                    } else if (activityState && activityState.val != undefined) {
                        // Activity change from away to home or when transitioning from night to home
                        if (activityState.val < 1000 || activityState.val >= 2200) {
                            stateActivity = 1000;
                        }

                        // Activity change any running wake-up program
                        else if (activityState.val > 2000) {
                            stateActivity = 2200;
                        }

                        // Activity change from night to home = Implicit awakening state
                        else if (activityState.val == 2000) {
                            stateActivity = 2210;
                        }

                        // Don't change any other activity during waking time at home
                        else {
                            stateActivity = Number(activityState.val);
                        }
                    }

                    await this.setStateChangedAsync(id + '.enabled', { val: true, ack: true });
                } else {
                    // Keep any absence activity
                    if (
                        enabledState.val == true &&
                        activityState &&
                        activityState.val != undefined &&
                        activityState.val < 1000
                    ) {
                        stateActivity = Number(activityState.val);
                    }
                }

                await this.setStateAsync(id + '.presence.home', { val: stateHome, ack: true });
                await this.setStateAsync(id + '.presence.away', { val: !stateHome, ack: true });
                if (residentType != 'pet') {
                    await this.setStateAsync(id + '.presence.night', { val: stateNight, ack: true });
                }
                state.ack = true;
                await this.setStateAsync(id + '.presence.state', state);
                if (activityState) {
                    await this.setResidentDeviceActivity(
                        residentType,
                        device,
                        'state',
                        {
                            val: stateActivity,
                            ack: false,
                            from: 'system.adapter.' + this.namespace,
                            ts: state.ts,
                            lc: state.lc,
                        },
                        activityState,
                    );
                }
                break;
            }

            case 'home': {
                if (typeof state.val != 'boolean') {
                    this.log.error(
                        id +
                            '.presence.home' +
                            " has rejected invalid input value type '" +
                            typeof state.val +
                            "' with value " +
                            state.val,
                    );
                    state.ack = true;
                    state.q = 0x01;
                    state.val = oldState.val;
                    await this.setStateAsync(id + '.presence.state', state);
                    return;
                }
                state.val = state.val == true ? 1 : 0;
                if (this.initialized) {
                    await this.setStateAsync(id + '.presence.state', state);
                } else {
                    this.setResidentDevicePresence(residentType, device, 'state', state);
                }
                break;
            }

            case 'night': {
                if (typeof state.val != 'boolean') {
                    this.log.error(
                        id +
                            '.presence.night' +
                            " has rejected invalid input value type '" +
                            typeof state.val +
                            "' with value " +
                            state.val,
                    );
                    state.ack = true;
                    state.q = 0x01;
                    state.val = oldState.val;
                    await this.setStateAsync(id + '.presence.state', state);
                    return;
                }
                if (state.val == true) {
                    state.val = 2;
                } else {
                    state.val = presenceState.val > 0 ? 1 : 0;
                }
                await this.setStateAsync(id + '.presence.state', state);
                break;
            }

            case 'away': {
                if (typeof state.val != 'boolean') {
                    this.log.error(
                        id +
                            '.presence.away' +
                            " has rejected invalid input value type '" +
                            typeof state.val +
                            "' with value " +
                            state.val,
                    );
                    state.ack = true;
                    state.q = 0x01;
                    state.val = oldState.val;
                    await this.setStateAsync(id + '.presence.state', state);
                    return;
                }
                state.val = state.val == true ? 0 : 1;
                await this.setStateAsync(id + '.presence.state', state);
                break;
            }

            default: {
                this.log.warn(id + ': Controlling unknown presence ' + command);
            }
        }
    }

    /**
     * Update all follow-them presence states for a particular residents device
     *
     * @param {string} residentType
     * @param {string} device
     * @param {string} command
     * @param {ioBroker.State} state
     * @param {ioBroker.State} [oldState]
     * @returns void
     */
    async setResidentDevicePresenceFollowing(residentType, device, command, state, oldState) {
        const id = residentType + '.' + device;
        if (!oldState) oldState = state;
        state.ack = true;
        await this.setStateChangedAsync(id + '.presenceFollowing.' + command, state);
    }

    /**
     * Change residents device presence or activity state from foreign presence event
     *
     * @param {string} id
     * @param {ioBroker.State} state
     * @param {boolean} [dryrun]
     * @param {ioBroker.StateObject} [_stateObj] function internal only
     * @returns boolean
     */
    async setResidentDevicePresenceFromEvent(id, state, dryrun, _stateObj) {
        const stateObj = _stateObj ? _stateObj : await this.getForeignObjectAsync(id);
        if (!stateObj) return false;
        let type = stateObj.common.type;
        let presence = null;

        if (stateObj.type != 'state') {
            this.log.error(id + ': Object needs to be a state datapoint to enable presence monitoring');
            return false;
        } else if (
            type != 'boolean' &&
            type != 'number' &&
            type != 'string' &&
            // @ts-ignore
            type != 'json'
        ) {
            this.log.error(
                id +
                    ": Monitored presence datapoint needs to be of type 'boolean', 'number', 'string', 'mixed', or 'json'",
            );
            return false;
        }

        if (type == 'mixed' || type == 'string') {
            if (stateObj.common.role == 'json') {
                type = 'json';
            } else {
                type = this.getDatatypeFromString(state.val);
            }
            if (type == null) {
                this.log.error(id + ': Monitored presence datapoint seems inappropriate due to unknown string format');
                return false;
            }
            this.log.silly(id + ": Interpreting presence datapoint as type '" + type + "'");
        }

        let jsonObj = null;
        let jsonPresenceVal = null;
        switch (type) {
            case 'boolean': {
                presence = Boolean(state.val);
                break;
            }

            case 'number': {
                if (stateObj.common.min != undefined && stateObj.common.min != 0) {
                    this.log.error(
                        id +
                            ': Monitored presence datapoint seems inappropriate with minimum value of ' +
                            stateObj.common.min,
                    );
                    return false;
                }
                if (stateObj.common.max != undefined && stateObj.common.max != 1) {
                    this.log.error(
                        id +
                            ': Monitored presence datapoint seems inappropriate with maximum value of ' +
                            stateObj.common.max,
                    );
                    return false;
                }
                presence = Number(state.val) == 1 ? true : false;
                break;
            }

            case 'json': {
                try {
                    jsonObj = JSON.parse(String(state.val));
                } catch (e) {
                    this.log.error(id + ': Error while parsing JSON value');
                    return false;
                }
                if (jsonObj.entry != undefined) {
                    jsonPresenceVal = jsonObj.entry;
                } else if (jsonObj.presence != undefined) {
                    jsonPresenceVal = jsonObj.presence;
                } else if (jsonObj.present != undefined) {
                    jsonPresenceVal = jsonObj.present;
                }
                if (jsonPresenceVal != null) type = this.getDatatypeFromString(jsonPresenceVal);
                if (type == null || type == 'json') {
                    this.log.error(id + ': JSON does not contain any expected property or value');
                    return false;
                }
                state.val = jsonPresenceVal;

                // if there is a date/time delivered, take this over instead of our time
                const regexISO8601 =
                    /^(\d{4})(?:-(\d{2}))??(?:-(\d{2}))??T(\d{2}):(\d{2})(?::(\d{2}))??(?:\.(\d+))??((?:[+-]{1}\d{2}:\d{2})|Z)??$/;
                if (jsonObj.date != undefined && typeof jsonObj.date == 'string' && jsonObj.date.match(regexISO8601))
                    try {
                        state.ts = new Date(jsonObj.date).getTime();
                    } catch (e) {
                        //
                    }

                return this.setResidentDevicePresenceFromEvent(id, state, dryrun, {
                    _id: stateObj._id,
                    type: 'state',
                    common: {
                        name: stateObj.common.name,
                        role: 'state',
                        type: type,
                        read: true,
                        write: false,
                    },
                    native: {},
                });
            }
        }

        if (presence == null) {
            this.log.error(id + ': Unable to determine presence state value');
        }

        // Validate datapoint only
        else if (dryrun) {
            return true;
        }

        // Presence update
        else if (this.presenceSubscriptionMapping[id]) {
            for (const deviceId in this.presenceSubscriptionMapping[id]) {
                const device = this.presenceSubscriptionMapping[id][deviceId].split('.');
                if (this.initialized)
                    this.log.info(id + ': Detected presence update for ' + device[1] + ': ' + presence);
                state.val = presence;
                state.ack = false;
                await this.setResidentDevicePresence(device[0], device[1], 'home', state);
            }
        }

        // Way Home activity update
        else if (this.wayhomeSubscriptionMapping[id]) {
            for (const deviceId in this.wayhomeSubscriptionMapping[id]) {
                const device = this.wayhomeSubscriptionMapping[id][deviceId].split('.');
                if (this.initialized)
                    this.log.info(id + ': Detected way home update for ' + device[1] + ': ' + presence);
                state.val = presence;
                state.ack = false;
                await this.setResidentDeviceActivity(device[0], device[1], 'wayhome', state);
            }
        } else {
            this.log.error(id + ': Presence update event has no matching device');
            return false;
        }

        return true;
    }

    /**
     * @param {string} residentType
     * @param {string} device
     * @param {ioBroker.State} state
     * @param {ioBroker.State} [oldState]
     * @returns void
     */
    async enableResidentDevice(residentType, device, state, oldState) {
        const id = residentType + '.' + device;
        if (!oldState) oldState = state;
        if (typeof state.val != 'boolean') {
            this.log.error(
                id +
                    '.enabled' +
                    " has rejected invalid input value type '" +
                    typeof state.val +
                    "' with value " +
                    state.val,
            );
            state.ack = true;
            state.q = 0x01;
            state.val = oldState.val;
            await this.setStateAsync(id + '.enabled', state);
            return;
        }
        await this.setStateAsync(id + '.enabled', { val: state.val, ack: true, from: state.from });
        if (oldState.val != state.val) {
            if (state.val == true) {
                if (residentType != 'pet') {
                    oldState.val = this.states[id + '.activity.state'];
                    state.val = 1;
                    this.states[id + '.activity.state'] = state.val;
                    await this.setResidentDeviceActivity(residentType, device, 'state', state, oldState);
                }
            } else {
                oldState.val = this.states[id + '.presence.state'];
                state.val = 0;
                this.states[id + '.presence.state'] = state.val;
                await this.setResidentDevicePresence(residentType, device, 'state', state, oldState);
            }
        }
    }

    /**
     * Calculate residents summary from resident devices
     *
     * @param {boolean} [_run]
     * @returns void
     */
    async setResidentsSummary(_run) {
        // Debounce re-calculation when multiple changes occure in a short time
        this.clearTimeout(this.calculationTimeout);
        if (!_run) {
            const runtimeMilliseconds = 1000;
            this.log.silly(`Creating residents summary re-calculation timeout in ${runtimeMilliseconds}ms`);
            this.calculationTimeout = this.setTimeout(() => {
                this.log.debug('Started residents summary re-calculation');
                this.calculationTimeout = null;
                this.setResidentsSummary(true);
            }, runtimeMilliseconds);
            return;
        }

        const disabledSum = [];
        const awaySum = [];
        const petHomeSum = [];
        const wayhomeSum = [];
        const homeSum = [];
        const winddownSum = [];
        const bedtimeSum = [];
        const gotupSum = [];
        const nightwalkSum = [];
        const wakeupSum = [];
        const nightSum = [];
        const dndSum = [];
        const overnightSum = [];

        let totalResidentsCount = 0;
        let totalPetCount = 0;
        let moodCount = 0;

        this.log.debug('  Looping through residents list:');

        for (const resident of this.residents) {
            const name = resident['name'];
            const residentType = resident['id'].split('.')[0];
            const enabledState = await this.getStateAsync(resident['id'] + '.enabled');
            const awayState = await this.getStateAsync(resident['id'] + '.presence.away');
            const homeState = await this.getStateAsync(resident['id'] + '.presence.home');
            const activityState = await this.getStateAsync(resident['id'] + '.activity.state');
            if (activityState != undefined && typeof activityState.val == 'number' && activityState.val >= 10000)
                activityState.val -= 10000;
            const overnightState = await this.getStateAsync(resident['id'] + '.activity.overnight');
            const presenceState = await this.getStateAsync(resident['id'] + '.presence.state');
            const moodState = await this.getStateAsync(resident['id'] + '.mood.state');
            const dndState = await this.getStateAsync(resident['id'] + '.activity.dnd');

            if (
                enabledState == undefined ||
                typeof enabledState.val != 'boolean' ||
                presenceState == undefined ||
                typeof presenceState.val != 'number' ||
                homeState == undefined ||
                typeof homeState.val != 'boolean' ||
                awayState == undefined ||
                typeof awayState.val != 'boolean'
            )
                continue;

            this.log.debug('  Checking on ' + name + ' ...');

            if (
                enabledState.val == true &&
                overnightState != undefined &&
                typeof overnightState.val == 'boolean' &&
                overnightState.val == true
            ) {
                this.log.debug('    - does overnight');
                overnightSum.push({
                    name: name,
                    id: this.namespace + '.' + resident['id'],
                    tc: overnightState.lc,
                });
            }

            // When present at home
            if (presenceState.val >= 1) {
                this.log.debug('    - is at home');

                if (residentType == 'pet') {
                    totalPetCount++;
                    petHomeSum.push({ name: name, id: this.namespace + '.' + resident['id'], tc: homeState.lc });
                } else {
                    totalResidentsCount++;
                    homeSum.push({ name: name, id: this.namespace + '.' + resident['id'], tc: homeState.lc });
                }

                if (moodState != undefined && typeof moodState.val == 'number') moodCount += moodState.val - 5;

                if (dndState != undefined && dndState.val == true) {
                    this.log.debug('    - does not want to be disturbed');
                    dndSum.push({ name: name, id: this.namespace + '.' + resident['id'], tc: dndState.lc });
                }

                // When at sleep
                if (presenceState.val == 2) {
                    this.log.debug('    - is at sleep');
                    nightSum.push({ name: name, id: this.namespace + '.' + resident['id'], tc: presenceState.lc });
                }

                // Activity mapping
                if (activityState != undefined) {
                    switch (activityState.val) {
                        case 1900:
                            this.log.debug('    - is winding down');
                            winddownSum.push({
                                name: name,
                                id: this.namespace + '.' + resident['id'],
                                tc: activityState.lc,
                            });
                            break;

                        case 1901:
                        case 1902:
                            this.log.debug('    - is going to bed');
                            bedtimeSum.push({
                                name: name,
                                id: this.namespace + '.' + resident['id'],
                                tc: activityState.lc,
                            });
                            break;

                        case 2010:
                            this.log.debug('    - is walking at night');
                            nightwalkSum.push({
                                name: name,
                                id: this.namespace + '.' + resident['id'],
                                tc: activityState.lc,
                            });
                            break;

                        case 2100:
                        case 2101:
                        case 2102:
                        case 2103:
                        case 2104:
                        case 2105:
                            this.log.debug('    - has a wake up alarm');
                            wakeupSum.push({
                                name: name,
                                id: this.namespace + '.' + resident['id'],
                                tc: activityState.lc,
                            });
                            break;

                        case 2200:
                        case 2210:
                            this.log.debug('    - just got up from sleep');
                            gotupSum.push({
                                name: name,
                                id: this.namespace + '.' + resident['id'],
                                tc: activityState.lc,
                            });
                            break;
                    }
                }
            } else if (presenceState.val == 0) {
                this.log.debug('    - is away from home');

                // When away from home
                if (enabledState.val == true) {
                    this.log.debug('    - is enabled');

                    if (residentType == 'pet') {
                        totalPetCount++;
                    } else {
                        totalResidentsCount++;
                    }
                    awaySum.push({ name: name, id: this.namespace + '.' + resident['id'], tc: awayState.lc });

                    // When on way home
                    if (activityState != undefined && activityState.val == 2) {
                        wayhomeSum.push({
                            name: name,
                            id: this.namespace + '.' + resident['id'],
                            tc: activityState.lc,
                        });
                    }
                }

                // When absent from home for longer period
                else {
                    this.log.debug('    - is disabled');
                    disabledSum.push({
                        name: name,
                        id: this.namespace + '.' + resident['id'],
                        tc: enabledState.lc,
                    });
                }
            }
        }

        this.log.debug(
            '  Completed loop-through of ' +
                (totalResidentsCount + totalPetCount + disabledSum.length) +
                ' resident devices.',
        );

        // Sort Lists + Write First/Last datapoints
        disabledSum.sort(this.reverseSortResidentsListByTimecode);
        if (disabledSum.length > 0) {
            await this.setStateChangedAsync('info.state.disabledFirst', {
                val: disabledSum[disabledSum.length - 1]['name'],
                ack: true,
            });
            await this.setStateChangedAsync('info.state.disabledLast', {
                val: disabledSum[0]['name'],
                ack: true,
            });
        }

        awaySum.sort(this.reverseSortResidentsListByTimecode);
        if (awaySum.length > 0) {
            await this.setStateChangedAsync('info.presence.awayFirst', {
                val: awaySum[awaySum.length - 1]['name'],
                ack: true,
            });
            await this.setStateChangedAsync('info.presence.awayLast', {
                val: awaySum[0]['name'],
                ack: true,
            });
        }

        petHomeSum.sort(this.reverseSortResidentsListByTimecode);
        if (petHomeSum.length > 0) {
            await this.setStateChangedAsync('info.presence.petsHomeFirst', {
                val: petHomeSum[petHomeSum.length - 1]['name'],
                ack: true,
            });
            await this.setStateChangedAsync('info.presence.petsHomeLast', {
                val: petHomeSum[0]['name'],
                ack: true,
            });
        }

        wayhomeSum.sort(this.reverseSortResidentsListByTimecode);
        if (wayhomeSum.length > 0) {
            await this.setStateChangedAsync('info.activity.wayhomeFirst', {
                val: wayhomeSum[wayhomeSum.length - 1]['name'],
                ack: true,
            });
            await this.setStateChangedAsync('info.activity.wayhomeLast', {
                val: wayhomeSum[0]['name'],
                ack: true,
            });
        }

        homeSum.sort(this.reverseSortResidentsListByTimecode);
        if (homeSum.length > 0) {
            await this.setStateChangedAsync('info.presence.homeFirst', {
                val: homeSum[homeSum.length - 1]['name'],
                ack: true,
            });
            await this.setStateChangedAsync('info.presence.homeLast', {
                val: homeSum[0]['name'],
                ack: true,
            });
        }

        winddownSum.sort(this.reverseSortResidentsListByTimecode);
        if (winddownSum.length > 0) {
            await this.setStateChangedAsync('info.activity.winddownFirst', {
                val: winddownSum[winddownSum.length - 1]['name'],
                ack: true,
            });
            await this.setStateChangedAsync('info.activity.winddownLast', {
                val: winddownSum[0]['name'],
                ack: true,
            });
        }

        bedtimeSum.sort(this.reverseSortResidentsListByTimecode);
        if (bedtimeSum.length > 0) {
            await this.setStateChangedAsync('info.activity.bedtimeFirst', {
                val: bedtimeSum[bedtimeSum.length - 1]['name'],
                ack: true,
            });
            await this.setStateChangedAsync('info.activity.bedtimeLast', {
                val: bedtimeSum[0]['name'],
                ack: true,
            });
        }

        gotupSum.sort(this.reverseSortResidentsListByTimecode);
        if (gotupSum.length > 0) {
            await this.setStateChangedAsync('info.activity.gotupFirst', {
                val: gotupSum[gotupSum.length - 1]['name'],
                ack: true,
            });
            await this.setStateChangedAsync('info.activity.gotupLast', {
                val: gotupSum[0]['name'],
                ack: true,
            });
        }

        nightwalkSum.sort(this.reverseSortResidentsListByTimecode);
        if (nightwalkSum.length > 0) {
            await this.setStateChangedAsync('info.activity.nightwalkFirst', {
                val: nightwalkSum[nightwalkSum.length - 1]['name'],
                ack: true,
            });
            await this.setStateChangedAsync('info.activity.nightwalkLast', {
                val: nightwalkSum[0]['name'],
                ack: true,
            });
        }

        wakeupSum.sort(this.reverseSortResidentsListByTimecode);
        if (wakeupSum.length > 0) {
            await this.setStateChangedAsync('info.activity.wakeupFirst', {
                val: wakeupSum[wakeupSum.length - 1]['name'],
                ack: true,
            });
            await this.setStateChangedAsync('info.activity.wakeupLast', {
                val: wakeupSum[0]['name'],
                ack: true,
            });
        }

        nightSum.sort(this.reverseSortResidentsListByTimecode);
        if (nightSum.length > 0) {
            await this.setStateChangedAsync('info.presence.nightFirst', {
                val: nightSum[nightSum.length - 1]['name'],
                ack: true,
            });
            await this.setStateChangedAsync('info.presence.nightLast', {
                val: nightSum[0]['name'],
                ack: true,
            });
        }

        dndSum.sort(this.reverseSortResidentsListByTimecode);
        if (dndSum.length > 0) {
            await this.setStateChangedAsync('info.activity.dndFirst', {
                val: dndSum[dndSum.length - 1]['name'],
                ack: true,
            });
            await this.setStateChangedAsync('info.activity.dndLast', {
                val: dndSum[0]['name'],
                ack: true,
            });
        }

        overnightSum.sort(this.reverseSortResidentsListByTimecode);
        if (overnightSum.length > 0) {
            await this.setStateChangedAsync('info.activity.overnightFirst', {
                val: overnightSum[overnightSum.length - 1]['name'],
                ack: true,
            });
            await this.setStateChangedAsync('info.activity.overnightLast', {
                val: overnightSum[0]['name'],
                ack: true,
            });
        }

        // Write Lists
        await this.setStateAsync('info.state.disabledList', { val: JSON.stringify(disabledSum), ack: true });
        await this.setStateAsync('info.presence.awayList', { val: JSON.stringify(awaySum), ack: true });
        await this.setStateAsync('info.presence.petsHomeList', { val: JSON.stringify(petHomeSum), ack: true });
        await this.setStateAsync('info.activity.wayhomeList', { val: JSON.stringify(wayhomeSum), ack: true });
        await this.setStateAsync('info.presence.homeList', { val: JSON.stringify(homeSum), ack: true });
        await this.setStateAsync('info.activity.winddownList', { val: JSON.stringify(winddownSum), ack: true });
        await this.setStateAsync('info.activity.bedtimeList', { val: JSON.stringify(bedtimeSum), ack: true });
        await this.setStateAsync('info.activity.gotupList', { val: JSON.stringify(gotupSum), ack: true });
        await this.setStateAsync('info.activity.nightwalkList', { val: JSON.stringify(nightwalkSum), ack: true });
        await this.setStateAsync('info.activity.wakeupList', { val: JSON.stringify(wakeupSum), ack: true });
        await this.setStateAsync('info.presence.nightList', { val: JSON.stringify(nightSum), ack: true });
        await this.setStateAsync('info.activity.dndList', { val: JSON.stringify(dndSum), ack: true });
        await this.setStateAsync('info.activity.overnightList', { val: JSON.stringify(overnightSum), ack: true });

        // Write Counter
        await this.setStateAsync('info.state.disabledCount', { val: disabledSum.length, ack: true });
        await this.setStateAsync('info.presence.awayCount', { val: awaySum.length, ack: true });
        await this.setStateAsync('info.presence.petsHomeCount', { val: petHomeSum.length, ack: true });
        await this.setStateAsync('info.activity.wayhomeCount', { val: wayhomeSum.length, ack: true });
        await this.setStateAsync('info.presence.homeCount', { val: homeSum.length, ack: true });
        await this.setStateAsync('info.activity.winddownCount', { val: winddownSum.length, ack: true });
        await this.setStateAsync('info.activity.bedtimeCount', { val: bedtimeSum.length, ack: true });
        await this.setStateAsync('info.activity.gotupCount', { val: gotupSum.length, ack: true });
        await this.setStateAsync('info.activity.nightwalkCount', { val: nightwalkSum.length, ack: true });
        await this.setStateAsync('info.activity.wakeupCount', { val: wakeupSum.length, ack: true });
        await this.setStateAsync('info.presence.nightCount', { val: nightSum.length, ack: true });
        await this.setStateAsync('info.activity.dndCount', { val: dndSum.length, ack: true });
        await this.setStateAsync('info.activity.overnightCount', { val: overnightSum.length, ack: true });
        await this.setStateAsync('info.state.totalPetsCount', { val: totalPetCount, ack: true });
        await this.setStateAsync('info.state.totalResidentsCount', { val: totalResidentsCount, ack: true });
        await this.setStateAsync('info.state.totalCount', { val: totalResidentsCount + totalPetCount, ack: true });

        // Write Indicators
        await this.setStateAsync('info.reachable', { val: totalResidentsCount > 0, ack: true });
        await this.setStateAsync('info.state.disabled', { val: disabledSum.length > 0, ack: true });
        await this.setStateAsync('info.state.disabledAll', { val: totalResidentsCount == 0, ack: true });
        await this.setStateAsync('info.presence.away', {
            val: totalResidentsCount == 0 || awaySum.length > 0,
            ack: true,
        });
        await this.setStateAsync('info.presence.awayAll', {
            val: totalResidentsCount == 0 || homeSum.length == 0,
            ack: true,
        });
        await this.setStateAsync('info.presence.petsHome', { val: petHomeSum.length > 0, ack: true });
        await this.setStateAsync('info.presence.petsHomeAlone', {
            val: petHomeSum.length > 0 && homeSum.length == 0,
            ack: true,
        });
        await this.setStateAsync('info.activity.wayhome', { val: wayhomeSum.length > 0, ack: true });
        await this.setStateAsync('info.activity.wayhomeAll', {
            val: wayhomeSum.length > 0 && wayhomeSum.length == awaySum.length,
            ack: true,
        });
        await this.setStateAsync('info.presence.home', { val: homeSum.length > 0, ack: true });
        await this.setStateAsync('info.presence.homeAll', {
            val: homeSum.length > 0 && homeSum.length == totalResidentsCount,
            ack: true,
        });
        await this.setStateAsync('info.activity.winddown', { val: winddownSum.length > 0, ack: true });
        await this.setStateAsync('info.activity.winddownAll', {
            val: winddownSum.length > 0 && winddownSum.length == totalResidentsCount,
            ack: true,
        });
        await this.setStateAsync('info.activity.bedtime', { val: bedtimeSum.length > 0, ack: true });
        await this.setStateAsync('info.activity.bedtimeAll', {
            val: bedtimeSum.length > 0 && bedtimeSum.length == totalResidentsCount,
            ack: true,
        });
        await this.setStateAsync('info.activity.gotup', { val: gotupSum.length > 0, ack: true });
        await this.setStateAsync('info.activity.gotupAll', {
            val: gotupSum.length > 0 && gotupSum.length == totalResidentsCount,
            ack: true,
        });
        await this.setStateAsync('info.activity.nightwalk', { val: nightwalkSum.length > 0, ack: true });
        await this.setStateAsync('info.activity.nightwalkAll', {
            val: nightwalkSum.length > 0 && nightwalkSum.length == totalResidentsCount,
            ack: true,
        });
        await this.setStateAsync('info.activity.wakeup', { val: wakeupSum.length > 0, ack: true });
        await this.setStateAsync('info.activity.wakeupAll', {
            val: wakeupSum.length > 0 && wakeupSum.length == totalResidentsCount,
            ack: true,
        });
        await this.setStateAsync('info.presence.night', { val: nightSum.length > 0, ack: true });
        await this.setStateAsync('info.presence.nightAll', {
            val: nightSum.length > 0 && nightSum.length == homeSum.length,
            ack: true,
        });
        await this.setStateAsync('info.activity.dnd', { val: dndSum.length > 0, ack: true });
        await this.setStateAsync('info.activity.dndAll', {
            val: dndSum.length > 0 && dndSum.length == totalResidentsCount,
            ack: true,
        });
        await this.setStateAsync('info.activity.overnight', { val: overnightSum.length > 0, ack: true });
        await this.setStateAsync('info.activity.overnightAll', {
            val: overnightSum.length > 0 && overnightSum.length == totalResidentsCount,
            ack: true,
        });

        // Calculate overall residential state
        let residentsStateVal = 0;
        if (petHomeSum.length > 0) residentsStateVal = 2;
        if (totalResidentsCount > 0) {
            residentsStateVal = 1;
            if (petHomeSum.length > 0) residentsStateVal = 2;
            if (wayhomeSum.length > 0) residentsStateVal = 3;
            if (homeSum.length > 0) {
                residentsStateVal = 4;
                if (dndSum.length > 0 && dndSum.length == homeSum.length) residentsStateVal = 5;
                if (winddownSum.length > 0) residentsStateVal = 6;

                // TODO: Only in the evening, not after wakeup?
                if (nightSum.length > 0 && nightSum.length != homeSum.length) residentsStateVal = 6;
                if (bedtimeSum.length > 0 && bedtimeSum.length == homeSum.length) residentsStateVal = 7;

                if (nightSum.length > 0 && nightSum.length == homeSum.length) residentsStateVal = 11;
                if (wakeupSum.length > 0) residentsStateVal = 10;
                if (nightwalkSum.length > 0) residentsStateVal = 9;
                if (gotupSum.length > 0) residentsStateVal = 8;
                if (bedtimeSum.length > 0 && winddownSum.length == 0 && nightSum.length > 0) residentsStateVal = 7;
            }
        }

        this.log.debug('  Calculated residential state: ' + residentsStateVal);
        await this.setStateAsync('state', { val: residentsStateVal, ack: true });

        const moodAverage = homeSum.length > 0 ? moodCount / homeSum.length : 0;
        await this.setStateAsync('mood', {
            // Strive for the golden middle
            val: moodAverage > 0 ? Math.floor(moodAverage + 5) : Math.ceil(moodAverage + 5),
            ack: true,
        });

        // Group states
        if (this.parentInstances.length > 0) {
            let leadingInstance = String(this.namespace);
            let groupStateVal = residentsStateVal;
            let groupMood = moodAverage - 5;
            let moodFoundCounter = 0;

            for (const i in this.parentInstances) {
                const parentInstance = String(this.parentInstances[i]);

                const parentState = await this.getForeignStateAsync(parentInstance + '.state');
                if (!parentState || parentState.val == undefined) continue;

                // For presence at home, aim for the lower (= more awake) number
                if (groupStateVal >= 4 && parentState.val >= 4) {
                    if (parentState.val < groupStateVal) {
                        leadingInstance = parentInstance;
                        this.log.debug(
                            '  Group state: Leading lower parent value from ' + parentInstance + ': ' + parentState.val,
                        );
                        groupStateVal = Number(parentState.val);
                    }

                    const moodState = await this.getForeignStateAsync(parentInstance + '.mood');
                    if (moodState && typeof moodState.val == 'number') {
                        moodFoundCounter++;
                        groupMood += moodState.val - 5;
                    }
                }

                // Otherwise, aim for the higher value
                else if (parentState.val > groupStateVal) {
                    leadingInstance = parentInstance;
                    this.log.debug(
                        '  Group state: Leading higher parent value from ' + parentInstance + ': ' + parentState.val,
                    );
                    groupStateVal = Number(parentState.val);
                }
            }

            await this.setStateChangedAsync('group.info.state.originID', { val: leadingInstance, ack: true });

            const groupMoodAverage = moodFoundCounter > 0 ? groupMood / (moodFoundCounter + 1) : groupMood;
            await this.setStateChangedAsync('group.mood', {
                // Strive for the golden middle
                val: groupMoodAverage > 0 ? Math.floor(groupMoodAverage + 5) : Math.ceil(groupMoodAverage + 5),
                ack: true,
            });

            this.log.debug('  Group state: Final value is ' + groupStateVal + ' from ' + leadingInstance);
            await this.setStateChangedAsync('group.state', { val: groupStateVal, ack: true });
        }
    }

    /**
     * Disable any resident that is currently away, assuming to be away for the day as there was no overnight
     *
     * @param {boolean} [initialize]
     * @returns void
     */
    timeoutDisableAbsentResidents(initialize) {
        if (!initialize) {
            this.residents.forEach(async (resident) => {
                const enabled = await this.getStateAsync(resident['id'] + '.enabled');
                const away = await this.getStateAsync(resident['id'] + '.presence.away');

                if (!enabled || !away) return;

                if (enabled.val == false) {
                    this.log.debug(
                        'timeoutDisableAbsentResidents: ' +
                            resident['id'] +
                            " is already 'disabled', therefore it is not changed.",
                    );
                } else if (away.val == false) {
                    this.log.debug(
                        'timeoutDisableAbsentResidents: ' +
                            resident['id'] +
                            " is not 'away', therefore it is not disabled.",
                    );
                } else {
                    this.log.info('timeoutDisableAbsentResidents: Disabling absent device ' + resident['id'] + '.');
                    await this.setStateAsync(resident['id'] + '.enabled', {
                        val: false,
                        ack: false,
                    });
                }
            });
        }

        // Create new timeout
        const runtimeMilliseconds = this.getMillisecondsUntilTime(this.config.disableAbsentResidentsDailyTimer);
        if (runtimeMilliseconds != null) {
            this.log.debug(
                `Creating absent timeout in ${runtimeMilliseconds}ms (${this.convertMillisecondsToDuration(
                    runtimeMilliseconds,
                )} HH:mm:ss)`,
            );
            this.absentTimeout = this.setTimeout(() => {
                this.log.info('Started daily absent timeout');
                this.absentTimeout = null;
                this.timeoutDisableAbsentResidents();
            }, runtimeMilliseconds);
        }
    }

    /**
     * Set overnight to default for roomies that stayed overnight
     *
     * @param {boolean} [initialize]
     */
    timeoutResetOvernight(initialize) {
        if (!initialize) {
            this.residents.forEach(async (resident) => {
                const home = await this.getStateAsync(resident['id'] + '.presence.home');
                const overnight = await this.getStateAsync(resident['id'] + '.activity.overnight');
                const overnightObj = await this.getObjectAsync(resident['id'] + '.activity.overnight');

                if (!home || !overnight || !overnightObj) return;

                if (resident['type'] == 'pet') {
                    this.log.debug(
                        'timeoutResetOvernight: ' + resident['id'] + ' is a pet without night state - ignoring.',
                    );
                } else if (resident['type'] == 'guest') {
                    this.log.debug(
                        'timeoutResetOvernight: ' +
                            resident['id'] +
                            ' is a guest, therefore is excluded from automatic reset.',
                    );
                } else if (overnight.val == overnightObj.common.def) {
                    this.log.debug(
                        'timeoutResetOvernight: ' +
                            resident['id'] +
                            " activity 'overnight' is already " +
                            overnightObj.common.def +
                            ', therefore is not changed.',
                    );
                } else if (home.val == false) {
                    this.log.debug(
                        'timeoutResetOvernight: ' + resident['id'] + ' is not at home, therefore is excluded.',
                    );
                } else {
                    this.log.info(
                        "timeoutResetOvernight: Resetting 'overnight' for " +
                            resident['id'] +
                            ' to ' +
                            overnightObj.common.def +
                            '.',
                    );
                    await this.setStateChangedAsync(resident['id'] + '.activity.overnight', {
                        val: overnightObj.common.def,
                        ack: false,
                    });
                }
            });
        }

        // Create new timeout
        const runtimeMilliseconds = this.getMillisecondsUntilTime(this.config.resetOvernightDailyTimer);
        if (runtimeMilliseconds != null) {
            this.log.debug(
                `Creating overnight reset timeout in ${runtimeMilliseconds}ms (${this.convertMillisecondsToDuration(
                    runtimeMilliseconds,
                )} HH:mm:ss)`,
            );
            this.overnightTimeout = this.setTimeout(() => {
                this.log.info('Started daily overnight reset');
                this.overnightTimeout = null;
                this.timeoutResetOvernight();
            }, runtimeMilliseconds);
        }
    }

    /**
     * Convert HH:mm or HH:mm:ss to milliseconds until next occurance
     *
     * @param {string} timeOfDay - time in HH:mm or HH:mm:ss
     * @returns number | null
     */
    getMillisecondsUntilTime(timeOfDay) {
        if (!timeOfDay) return null;
        const timeOfDayArray = timeOfDay.split(':').map(Number);
        if (!timeOfDayArray || timeOfDayArray.length < 2) return null;
        if (timeOfDayArray.length == 2) {
            timeOfDayArray.push(0);
        }
        if (
            timeOfDayArray[0] >= 0 &&
            timeOfDayArray[0] < 24 &&
            timeOfDayArray[1] >= 0 &&
            timeOfDayArray[1] < 60 &&
            timeOfDayArray[2] >= 0 &&
            timeOfDayArray[2] < 60
        ) {
            const now = new Date();
            const next = new Date();
            next.setDate(now.getDate());
            next.setHours(timeOfDayArray[0], timeOfDayArray[1], timeOfDayArray[2]);
            // Add a day if time is in the past.
            // Use Date() to let it handle changes between
            // standard and daylight savings time.
            if (next < now) {
                next.setDate(now.getDate() + 1);
            }
            return next.valueOf() - now.valueOf();
        } else {
            return null;
        }
    }

    /**
     * @param {number} duration
     * @returns string HH:mm
     */
    convertMillisecondsToDuration(duration) {
        const seconds = Math.floor((duration / 1000) % 60);
        const minutes = Math.floor((duration / (1000 * 60)) % 60);
        const hours = Math.floor((duration / (1000 * 60 * 60)) % 24);

        return `${hours < 10 ? '0' + hours : hours}:${minutes < 10 ? '0' + minutes : minutes}:${
            seconds < 10 ? '0' + seconds : seconds
        }`;
    }

    /**
     * @param {string} id
     * @returns string
     */
    cleanNamespace(id) {
        return (
            id
                .trim()
                .replace(/\./g, '_') // Replace dots with underscores
                .replace(/\s/g, '_') // Replace whitespaces with underscores
                .replace(/[^\p{Ll}\p{Lu}\p{Nd}]+/gu, '_') // Replace not allowed chars with underscore
                .replace(/_+$/g, '') // Remove underscores end
                .replace(/^_+/g, '') // Remove underscores beginning
                .replace(/_+/g, '_') // Replace multiple underscores with one
                .toLowerCase()
                .replace(/??/g, 'ae') // Replace a Umlaut
                .replace(/??/g, 'oe') // Replace o Umlaut
                .replace(/??/g, 'ue') // Replace u Umlaut
                .replace(/??/g, 'ss') // Replace Eszett
                // @ts-ignore
                // @ts-ignore
                .replace(/_([a-z])/g, (m, w) => {
                    return w.toUpperCase();
                })
        );
    }

    /**
     * @param {any} string
     * @returns ioBroker.CommonState common.type
     */
    getDatatypeFromString(string) {
        const val = String(string).toLowerCase();
        let type = null;
        switch (val) {
            case 'false':
            case 'true':
                type = 'boolean';
                break;

            case '0':
            case '1':
                type = 'number';
                break;
        }
        return type;
    }

    /**
     * @param {object} a
     * @param {object} b
     * @returns number
     */
    reverseSortResidentsListByTimecode(a, b) {
        if (a.tc == undefined || b.tc == undefined) return 0;
        if (a.tc < b.tc) {
            return 1;
        }
        if (a.tc > b.tc) {
            return -1;
        }
        return 0;
    }
}

if (require.main != module) {
    // Export the constructor in compact mode
    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    module.exports = (options) => new Residents(options);
} else {
    // otherwise start the instance directly
    new Residents();
}
