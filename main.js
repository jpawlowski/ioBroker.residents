'use strict';

const utils = require('@iobroker/adapter-core');

class Residents extends utils.Adapter {
    /**
     * @param {Partial<utils.AdapterOptions>} [options]
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

        this.presenceFollowingMapping = {};

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
     *
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
        if (this.config.language != '') {
            this.language = this.config.language;
        }

        ///////////////////////////
        // Update adapter instance configuration
        const adapterObj = await this.getForeignObjectAsync('system.adapter.residents');
        const instanceObj = await this.getForeignObjectAsync(`system.adapter.${this.namespace}`);
        if (adapterObj != undefined && instanceObj != undefined) {
            let updatedInstanceObj = Boolean(false);

            ['stateTranslations'].forEach(property => {
                if (instanceObj.native[property] == undefined) {
                    instanceObj.native[property] = adapterObj.native[property];
                    updatedInstanceObj = true;
                } else {
                    for (const element in adapterObj.native[property]) {
                        if (instanceObj.native[property][element] == undefined) {
                            instanceObj.native[property].push(adapterObj.native[property][element]);
                            updatedInstanceObj = true;
                        }
                    }
                }
            });

            if (updatedInstanceObj == true) {
                await this.setForeignObjectAsync(`system.adapter.${this.namespace}`, instanceObj);
                this.log.info('Updated adapter instance configuration after adapter update');
            }
        }

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
                0: 'Längere Abwesenheit',
                1: 'Abwesend',
                2: 'Haustierpflege',
                3: 'Nachhauseweg',
                4: 'zu Hause',
                5: 'Nicht stören',
                6: 'Entspannen',
                7: 'Schlafenszeit',
                8: 'Aufgestanden',
                9: 'Nachtwanderung',
                10: 'Aufwecken',
                11: 'Nacht',
            },
            ru: {
                0: 'Расширенное отсутствие',
                1: 'Вдали',
                2: 'Уход за домашними животными',
                3: 'Путь домой',
                4: 'дома',
                5: 'Не беспокоить',
                6: 'Расслабьтесь',
                7: 'Время сна',
                8: 'Запущен и работает',
                9: 'Ночной поход',
                10: 'Проснись',
                11: 'Ночь',
            },
            pt: {
                0: 'Ausência estendida',
                1: 'A caminho',
                2: 'Pet Care',
                3: 'Caminho',
                4: 'Em casa',
                5: 'Não Perturbar',
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
                0: 'Absence prolongée',
                1: 'Absent',
                2: 'Soins pour animaux',
                3: 'Chemin de retour',
                4: 'Chez soi',
                5: 'Ne pas déranger',
                6: 'Détendre',
                7: 'Heure du coucher',
                8: 'Levé',
                9: 'Marche de nuit',
                10: 'Réveil',
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
                8: 'Levantó',
                9: 'Paseo nocturno',
                10: 'Despierta',
                11: 'Noche',
            },
            pl: {
                0: 'Długość nieobecności',
                1: 'Away',
                2: 'Pet Care',
                3: 'Strona domowa',
                4: 'W domu',
                5: 'Nie przeszkadzać',
                6: 'Relaks',
                7: 'Dobranoc',
                8: 'W górę',
                9: 'Nocny spacer',
                10: 'Obudź się',
                11: 'Noc',
            },
            uk: {
                0: 'Розширена абсенція',
                1: 'Проживання',
                2: 'Сімейний догляд за домашніми тваринами',
                3: 'Головна',
                4: 'вдома',
                5: 'Не турбувати',
                6: 'розслабитися',
                7: 'Час спати',
                8: 'Встала',
                9: 'Нічна прогулянка',
                10: 'Прокинься.',
                11: 'Ніч',
            },
            'zh-cn': {
                0: '缺点',
                1: 'A. 公路',
                2: '家庭护理',
                3: 'B. 家庭办法',
                4: '在家',
                5: '请勿打扰',
                6: '缩减',
                7: '就寝时间',
                8: '起床了',
                9: '夜行',
                10: '唤醒',
                11: '夜间',
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
                residentialLang[i]['state'] = `${this.config.residentialStates[i].icon} ${residentialLang[i].text}`;
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
                0: 'Könnte nicht schlimmer werden',
                1: 'Außerordentlich schlecht',
                2: 'Äußerst schlecht',
                3: 'Ziemlich schlecht',
                4: 'Nicht so gut',
                5: 'Ausgeglichen',
                6: 'Einigermaßen okay',
                7: 'Ziemlich gut',
                8: 'Sehr gut',
                9: 'Außerordentlich gut',
                10: 'Könnte nicht besser sein',
            },
            ru: {
                0: 'Не могли бы получить Worse',
                1: 'Необычный Плохо',
                2: 'Чрезвычайно плохо',
                3: 'Очень плохо',
                4: 'Что-то не хорошо',
                5: 'сбалансированный',
                6: 'Немного хорошо',
                7: 'Довольно хорошо',
                8: 'Чрезвычайно хорошо',
                9: 'Необычный Хорошо',
                10: 'Не может быть лучше',
            },
            pt: {
                0: 'Não consegui ficar pior',
                1: 'Mau Extraordinário',
                2: 'Extremamente mau',
                3: 'Muito mau',
                4: 'Não é bom',
                5: 'Equilibrado',
                6: 'Alguma coisa bem',
                7: 'Muito bem',
                8: 'Extremamente bom',
                9: 'Bem Extraordinário',
                10: 'Não podia ser melhor',
            },
            nl: {
                0: 'Kon Worse niet krijgen',
                1: 'Buitengewoon slecht',
                2: 'Extreem slecht',
                3: 'Best',
                4: 'Enigszins',
                5: 'Gebalanceerd',
                6: 'Enigszins oké',
                7: 'Mooi',
                8: 'Extreem goed',
                9: 'Buitengewoon goed',
                10: 'Kon niet beter',
            },
            fr: {
                0: 'Ça ne pourrait pas être pire',
                1: 'Extraordinairement mauvais',
                2: 'Extrêmement mauvais',
                3: 'Pas mal',
                4: "C'est pas bon",
                5: 'Équilibré',
                6: 'Assez bien',
                7: 'Plutôt bien',
                8: 'Très bien',
                9: 'Bien extraordinaire',
                10: 'Ça ne pourrait pas être mieux',
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
                0: 'No podría ponerse peor',
                1: 'Extraordinario malo',
                2: 'Muy malo',
                3: 'Bastante mal',
                4: 'Algo que no es bueno',
                5: 'Equilibrado',
                6: 'Algo bien',
                7: 'Muy bien',
                8: 'Muy bueno',
                9: 'Bien extraordinario',
                10: 'No podría ser mejor',
            },
            pl: {
                0: 'Nie mogło być gorzej',
                1: 'Nadzwyczajny',
                2: 'Badacze',
                3: 'Całkiem źle',
                4: 'Niedobrze',
                5: 'Zrównoważony',
                6: 'Trochę w porządku',
                7: 'Całkiem dobrze',
                8: 'Dobro',
                9: 'Dobry nadzwyczajny',
                10: 'Nie mogło być lepiej',
            },
            uk: {
                0: 'Чи не побоюватися',
                1: 'Поганий',
                2: 'Надзвичайно Поганий',
                3: 'Гарненька Поганий',
                4: 'Що не добре',
                5: 'збалансований',
                6: 'Дещо нормально',
                7: 'Гарненька Добре',
                8: 'Надзвичайно Добре',
                9: 'Надзвичайне добро',
                10: 'Не можна краще',
            },
            'zh-cn': {
                0: '没有比这更糟糕的了',
                1: '特设包',
                2: '极力包',
                3: '序言',
                4: '某些人',
                5: '平衡',
                6: '有点好',
                7: '善意',
                8: '极好',
                9: '特 法',
                10: '再好不过了',
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
                moodLang[key]['state'] = `${this.config.moodStates[key].icon} ${moodLang[key].text}`;
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
                de: 'Mitbewohner Geräte',
                ru: 'Устройства для соседей по комнате',
                pt: 'Dispositivos para companheiros de quarto',
                nl: 'Apparaten voor huisgenoten',
                fr: 'Dispositifs de colocation',
                it: 'Dispositivi per i coinquilini',
                es: 'Dispositivos para compañeros de piso',
                pl: 'Urządzenia dla współlokatorów',
                uk: 'Сусідні пристрої',
                'zh-cn': '室友设备',
            },
            pet: {
                en: 'Pet Devices',
                de: 'Haustier Geräte',
                ru: 'Устройства для домашних животных',
                pt: 'Dispositivos para animais',
                nl: 'Apparaten voor huisdieren',
                fr: 'Dispositifs pour animaux de compagnie',
                it: 'Dispositivi per animali domestici',
                es: 'Dispositivos para mascotas',
                pl: 'Urządzenia dla zwierząt domowych',
                uk: 'Пристрої для домашніх тварин',
                'zh-cn': '',
            },
            guest: {
                en: 'Guest Devices',
                de: 'Gast Geräte',
                ru: 'Гостевые устройства',
                pt: 'Dispositivos Convidados',
                nl: 'Gastapparaten',
                fr: 'Appareils invités',
                it: 'Dispositivi per gli ospiti',
                es: 'Dispositivos para invitados',
                pl: 'Urządzenia gościnne',
                uk: 'Гостьові пристрої',
                'zh-cn': '访客设备',
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
                2101: '💤 Alarm Snooze',
                2102: '💤 Alarm Snooze',
                2103: '💤💤 Alarm Snooze',
                2104: '💤💤 Alarm Snooze',
                2105: '💤💤💤 Alarm Snooze',

                // 2200-2299: SLEEPING TIME at home: Transitioning to Waking Time
                2200: 'Awakening after Wake-up Alarm',
                2210: 'Awakening',
            },
            de: {
                // 000-0999: Not present at home / Away
                0: 'Längere Abwesenheit',
                1: 'Unterwegs für heute',
                2: 'Nachhauseweg',

                // 100-899: Not present at home / Away: Custom Focus states (e.g. to sync with Apple Focus modes)
                100: 'Zeit für mich',
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
                1100: 'Zeit für mich',
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
                2010: 'Wach während der Nacht',
                2020: 'Wieder eingeschlafen',

                // 2100-2199: SLEEPING TIME at home: While I should get up
                2100: 'Weckalarm',
                2101: '💤 Schlummern',
                2102: '💤 Schlummern',
                2103: '💤💤 Schlummern',
                2104: '💤💤 Schlummern',
                2105: '💤💤💤 Schlummern',

                // 2200-2299: SLEEPING TIME at home: Transitioning to Waking Time
                2200: 'Aufwachen nach Weckruf',
                2210: 'Aufwachen',
            },
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
                    // @ts-expect-error -- TODO: add proper TypeScript types
                    (this.config.customFocusStates[key].enabled != undefined &&
                        // @ts-expect-error -- TODO: add proper TypeScript types
                        this.config.customFocusStates[key].enabled == false) ||
                    // @ts-expect-error -- TODO: add proper TypeScript types
                    this.config.customFocusStates[key].text == undefined ||
                    // @ts-expect-error -- TODO: add proper TypeScript types
                    this.config.customFocusStates[key].text == ''
                ) {
                    continue;
                }

                const awayFocusKey = Number(key) + 200;
                const homeFocusKey = Number(key) + 200 + 1000;

                // @ts-expect-error -- TODO: add proper TypeScript types
                activityLang[awayFocusKey] = this.config.customFocusStates[key].text;
                // @ts-expect-error -- TODO: add proper TypeScript types
                activityLang[homeFocusKey] = this.config.customFocusStates[key].text;
            }
        }

        const offStateTexts = {
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
        let offLang = offStateTexts[this.language] ? offStateTexts[this.language] : offStateTexts.en;
        if (this.config.stateTranslations != undefined && this.config.stateTranslations[0] != undefined) {
            if (
                this.config.stateTranslations[0].text != '' &&
                this.config.stateTranslations[0].text != offStateTexts.en
            ) {
                offLang = this.config.stateTranslations[0].text;
            }
            if (this.config.stateTranslations[0].icon != '') {
                offLang = `${this.config.stateTranslations[0].icon} ${offLang}`;
            }
        }

        const nobodyStateTexts = {
            en: 'Nobody',
            de: 'Niemand',
        };
        let nobodyLang = nobodyStateTexts[this.language] ? nobodyStateTexts[this.language] : nobodyStateTexts.en;
        if (this.config.stateTranslations != undefined && this.config.stateTranslations[1] != undefined) {
            if (
                this.config.stateTranslations[1].text != '' &&
                this.config.stateTranslations[1].text != nobodyStateTexts.en
            ) {
                nobodyLang = this.config.stateTranslations[1].text;
            }
            if (this.config.stateTranslations[1].icon != '') {
                nobodyLang = `${this.config.stateTranslations[1].icon} ${nobodyLang}`;
            }
        }

        const focusStateTexts = {
            en: 'Focus',
            de: 'Fokus',
            ru: 'Фокус',
            pt: 'Foco',
            nl: 'Focus',
            fr: 'Focus',
            it: 'Focus',
            es: 'Focus',
            pl: 'Focus',
            uk: 'Фокус',
            'zh-cn': '焦点',
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
            if (this.config.activityStates != undefined) {
                customActivityState = this.config.activityStates.filter(obj => {
                    return obj.id == Number(key);
                })[0];
            }
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
                if (match[1].trim() != '') {
                    activityLang[key].prefix = match[1].trim();
                }
                activityLang[key].text = match[2].trim();
            } else {
                // Add prefix from residential state
                // Away
                if (Number(key) >= 0 && Number(key) < 1000) {
                    if (activityLang[key].text != residentialLang[1].text) {
                        activityLang[key].prefix = residentialLang[1].text;
                    }
                } else if (Number(key) >= 1100 && Number(key) < 1300) {
                    // Focus modes
                    activityLang[key].prefix = focusLang;
                } else if (Number(key) == 1900) {
                    // Wind Down
                    if (activityLang[key].text != residentialLang[6].text) {
                        activityLang[key].prefix = residentialLang[6].text;
                    }
                } else if (Number(key) == 1901) {
                    // Bedtime
                    if (activityLang[key].text != residentialLang[7].text) {
                        activityLang[key].prefix = residentialLang[7].text;
                    }
                } else if (Number(key) == 1902) {
                    // In Bed
                    if (activityLang[key].text != residentialLang[11].text) {
                        activityLang[key].prefix = residentialLang[11].text;
                    }
                } else if (Number(key) >= 1000 && Number(key) < 2000) {
                    // Home
                    if (activityLang[key].text != residentialLang[4].text) {
                        activityLang[key].prefix = residentialLang[4].text;
                    }
                } else if (Number(key) >= 2101 && Number(key) < 2200) {
                    // Wake-up
                    if (activityLang[key].text != residentialLang[10].text) {
                        activityLang[key].prefix = residentialLang[10].text;
                    }
                } else if (Number(key) >= 2200 && Number(key) < 2300) {
                    // Awoken
                    if (activityLang[key].text != residentialLang[8].text) {
                        activityLang[key].prefix = residentialLang[8].text;
                    }
                } else if (Number(key) >= 2000) {
                    // Night
                    if (activityLang[key].text != residentialLang[11].text) {
                        activityLang[key].prefix = residentialLang[11].text;
                    }
                }
            }

            // Add custom activity icons
            if (customActivityState != undefined && customActivityState.icon != '') {
                activityLang[key].icon = customActivityState.icon;
            } else {
                // Add icons from residential state
                let focusIndex = Number(key) - 100;
                if (focusIndex >= 1000) {
                    focusIndex -= 1000;
                }
                let customFocusIndex = Number(key) - 200;
                if (customFocusIndex >= 1000) {
                    customFocusIndex -= 1000;
                }

                // Away
                if (Number(key) == 0) {
                    activityLang[key].icon = residentialLang[0].icon;
                } else if (Number(key) == 2) {
                    activityLang[key].icon = residentialLang[3].icon;
                } else if (Number(key) >= 1 && Number(key) < 100) {
                    activityLang[key].icon = residentialLang[1].icon;
                } else if ((Number(key) >= 100 && Number(key) < 200) || (Number(key) >= 1100 && Number(key) < 1200)) {
                    // Focus modes
                    if (this.config.focusStates[focusIndex].icon != '') {
                        activityLang[key].icon = this.config.focusStates[focusIndex].icon;
                    }
                } else if ((Number(key) >= 200 && Number(key) < 300) || (Number(key) >= 1200 && Number(key) < 1300)) {
                    // Custom Focus modes
                    // @ts-expect-error -- TODO: add proper TypeScript types
                    if (this.config.customFocusStates[customFocusIndex].icon != '') {
                        activityLang[key].icon = this.config.customFocusStates[customFocusIndex].icon;
                    }
                } else if (Number(key) == 1900) {
                    // Wind Down
                    activityLang[key].icon = residentialLang[6].icon;
                } else if (Number(key) >= 1901 && Number(key) < 2000) {
                    // Bedtime
                    activityLang[key].icon = residentialLang[7].icon;
                } else if (Number(key) >= 1000 && Number(key) < 2000) {
                    // Home
                    activityLang[key].icon = residentialLang[4].icon;
                } else if (Number(key) == 2010) {
                    // Awake at night
                    activityLang[key].icon = residentialLang[9].icon;
                } else if (Number(key) >= 2100 && Number(key) < 2200) {
                    // Wake-up
                    activityLang[key].icon = residentialLang[10].icon;
                } else if (Number(key) >= 2200 && Number(key) < 2300) {
                    // Awoken
                    activityLang[key].icon = residentialLang[8].icon;
                } else if (Number(key) >= 2000) {
                    // Night
                    activityLang[key].icon = residentialLang[11].icon;
                }
            }

            activityLang[key].state =
                (activityLang[key].icon ? `${activityLang[key].icon} ` : '') +
                (activityLang[key].prefix ? `${activityLang[key].prefix}: ` : '') +
                activityLang[key].text;
            activityStates[key] = activityLang[key].state;

            // Consider no active focus as Off and
            // map as 0 to comply with boolean standards
            if (Number(key) == 1000) {
                focusStates['away'][0] = offLang;
                focusStates['home'][0] = offLang;
            } else if ((Number(key) >= 100 && Number(key) < 300) || (Number(key) >= 1100 && Number(key) < 1300)) {
                // Only numbers between 100-299 or 1100-1299 for activity.focus
                const stateVal = (activityLang[key].icon ? `${activityLang[key].icon} ` : '') + activityLang[key].text;
                let focusIndex = Number(key) - 100;
                if (focusIndex >= 1000) {
                    focusIndex -= 1000;
                }
                let customFocusIndex = Number(key) - 200;
                if (customFocusIndex >= 1000) {
                    customFocusIndex -= 1000;
                }

                // Check away usage for Focus Modes
                if (Number(key) >= 100 && Number(key) < 200 && this.config.focusStates[focusIndex].away == true) {
                    focusStates['away'][key] = stateVal;
                } else if (
                    Number(key) >= 1100 &&
                    Number(key) < 1200 &&
                    this.config.focusStates[focusIndex].home == true
                ) {
                    // Check home usage for Focus Modes
                    focusStates['home'][key] = stateVal;
                } else if (
                    Number(key) >= 200 &&
                    Number(key) < 300 &&
                    // @ts-expect-error -- TODO: add proper TypeScript types
                    this.config.customFocusStates[customFocusIndex].away == true
                ) {
                    // Check away usage Custom Focus Modes
                    focusStates['away'][key] = stateVal;
                } else if (
                    Number(key) >= 1200 &&
                    Number(key) < 1300 &&
                    // @ts-expect-error -- TODO: add proper TypeScript types
                    this.config.customFocusStates[customFocusIndex].home == true
                ) {
                    // Check home usage Custom Focus Modes
                    focusStates['home'][key] = stateVal;
                }
            }

            // DND variants for activity.state
            if (Number(key) < 1000 || Number(key) >= 2000) {
                continue;
            }
            const dndKey = Number(key) + 10000;
            activityStates[dndKey] =
                (residentialLang[5].icon ? `${residentialLang[5].icon} ` : '') +
                residentialLang[5].text +
                (dndKey != 11000
                    ? (activityLang[key].icon ? `: ${activityLang[key].icon}` : ':') +
                      (activityLang[key].prefix ? ` ${activityLang[key].prefix}` : '') +
                      (activityLang[key].prefix
                          ? ` | ${activityLang[key].text}`
                          : (activityLang[key].icon ? ' ' : '') + activityLang[key].text)
                    : '');
        }

        // TODO: also add roomies from other instances
        const roomieIDsToNames = {};
        this.roomies.forEach(roomie => {
            const name = roomie['name'].trim();
            const roomieId = `roomie.${this.cleanNamespace(roomie['id'] ? roomie['id'] : name)}`;
            let icon = null;
            if (
                this.config.stateTranslations != undefined &&
                this.config.stateTranslations[2] != undefined &&
                this.config.stateTranslations[2].icon != ''
            ) {
                icon = this.config.stateTranslations[2].icon;
            }
            if (roomie.icon != undefined && roomie.icon != '') {
                icon = roomie.icon;
            }
            roomieIDsToNames[`${this.namespace}.${roomieId}`] = icon ? `${icon} ${name}` : name;
        });

        // TODO: also add guests from other instances
        const guestIDsToNames = {};
        this.guests.forEach(guest => {
            const name = guest['name'].trim();
            const guestId = `guest.${this.cleanNamespace(guest['id'] ? guest['id'] : name)}`;
            let icon = null;
            if (
                this.config.stateTranslations != undefined &&
                this.config.stateTranslations[2] != undefined &&
                this.config.stateTranslations[2].icon != ''
            ) {
                icon = this.config.stateTranslations[2].icon;
            }
            if (guest.icon != undefined && guest.icon != '') {
                icon = guest.icon;
            }
            guestIDsToNames[`${this.namespace}.${guestId}`] = icon ? `${icon} ${name}` : name;
        });

        const residentTypes = ['roomie', 'pet', 'guest'];
        for (const key1 in residentTypes) {
            const residentType = residentTypes[key1];
            if (this.config[residentType] == undefined) {
                continue;
            }
            for (const key2 in this.config[residentType]) {
                await this.setObjectNotExistsAsync(residentType, {
                    type: 'folder',
                    common: {
                        name: residentTypeName[residentType],
                        icon: `${residentType}.svg`,
                    },
                    native: {},
                });

                const resident = this.config[residentType][key2];
                const name = resident['name'].trim();
                const id = `${residentType}.${this.cleanNamespace(resident['id'] ? resident['id'] : name)}`;
                const fullId = `${this.namespace}.${id}`;
                this.config[residentType][key2]['id'] = id;
                let icon = null;
                if (this.config.stateTranslations != undefined) {
                    if (
                        residentType == 'roomie' &&
                        this.config.stateTranslations[2] != undefined &&
                        this.config.stateTranslations[2].icon != ''
                    ) {
                        icon = this.config.stateTranslations[2].icon;
                    } else if (
                        residentType == 'guest' &&
                        this.config.stateTranslations[3] != undefined &&
                        this.config.stateTranslations[3].icon != ''
                    ) {
                        icon = this.config.stateTranslations[3].icon;
                    } else if (
                        residentType == 'pet' &&
                        this.config.stateTranslations[4] != undefined &&
                        this.config.stateTranslations[4].icon != ''
                    ) {
                        icon = this.config.stateTranslations[4].icon;
                    }
                }
                if (resident.icon == undefined || resident.icon == '') {
                    resident.icon = icon;
                } else {
                    icon = resident.icon;
                }
                const iconAndName = icon ? `${icon} ${name}` : name;
                this.config[residentType][key2]['icon'] = icon;
                this.config[residentType][key2]['iconAndName'] = iconAndName;

                let foreignResidents = null;
                if (residentType == 'pet') {
                    foreignResidents = { ...roomieIDsToNames, ...guestIDsToNames };
                } else {
                    foreignResidents = { ...roomieIDsToNames };
                }
                if (foreignResidents[fullId]) {
                    delete foreignResidents[fullId];
                }

                await this.setObjectNotExistsAsync(id, {
                    type: 'device',
                    common: {
                        name: `${icon} ${name}`,
                    },
                    native: {},
                });
                // Update common.name
                let currentObject = await this.getObjectAsync(id);
                if (currentObject && currentObject.common.name != iconAndName) {
                    currentObject.common.name = iconAndName;
                    await this.setObjectAsync(id, currentObject);
                }

                await this.setObjectNotExistsAsync(
                    `${id}.enabled`,
                    {
                        type: 'state',
                        common: {
                            name: {
                                en: `${name} is within distance?`,
                                de: `${name} ist in Reichweite?`,
                                ru: `${name} находится в пределах расстояния?`,
                                pt: `${name} está a uma distância?`,
                                nl: `${name}is binnen de afstand?`,
                                fr: `${name} est à distance?`,
                                it: `${name} è a distanza?`,
                                es: `${name} está a poca distancia?`,
                                pl: `${name}jest w odległości ok?`,
                                uk: `${name} знаходиться на відстані?`,
                                'zh-cn': '姓名+在距离内?',
                            },
                            type: 'boolean',
                            role: 'switch.enable',
                            read: true,
                            write: true,
                            def: false,
                            desc: {
                                en: 'Reachability state',
                                de: 'Erreichbarkeitsstatus',
                                ru: 'Состояние доступности',
                                pt: 'Estado de alcance',
                                nl: 'Vertaling',
                                fr: 'État de la responsabilité',
                                it: 'Stato di adesione',
                                es: 'Estado de responsabilidad',
                                pl: 'Państwo Reaktywności',
                                uk: 'Станом наближення',
                                'zh-cn': 'B. 可持续性',
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

                await this.setObjectNotExistsAsync(`${id}.info`, {
                    type: 'folder',
                    common: {
                        name: {
                            en: `Information about ${name}`,
                            de: `Informationen über ${name}`,
                            ru: `Информация о ${name}`,
                            pt: `Informação sobre ${name}`,
                            nl: `Informatie over ${name}`,
                            fr: `Informations sur ${name}`,
                            it: `Informazioni su ${name}`,
                            es: `Información sobre ${name}`,
                            pl: `Informacja o ${name}`,
                            uk: `Інформація про ${name}`,
                            'zh-cn': '关于“+名称”的信息',
                        },
                    },
                    native: {},
                });

                await this.setObjectNotExistsAsync(`${id}.info.name`, {
                    type: 'state',
                    common: {
                        name: {
                            en: `Display name for ${fullId}`,
                            de: `Anzeigename für ${fullId}`,
                            ru: `Имя дисплея для ${fullId}`,
                            pt: `Nome de exibição para ${fullId}`,
                            nl: `Vertaling ${fullId}`,
                            fr: `Nom d'affichage pour ${fullId}`,
                            it: `Visualizzazione nome per ${fullId}`,
                            es: `Nombre de la pantalla para ${fullId}`,
                            pl: `Dysplay name for ${fullId}`,
                            uk: `Назва екрану для ${fullId}`,
                            'zh-cn': `${fullId} 的区别名`,
                        },
                        type: 'string',
                        role: 'text',
                        read: true,
                        write: false,
                    },
                    native: {},
                });
                await this.setStateChangedAsync(`${id}.info.name`, { val: name, ack: true });

                await this.setObjectNotExistsAsync(`${id}.info.icon`, {
                    type: 'state',
                    common: {
                        name: {
                            en: `Icon for ${fullId}`,
                            de: `Symbol für ${fullId}`,
                        },
                        type: 'string',
                        role: 'text',
                        read: true,
                        write: false,
                    },
                    native: {},
                });
                await this.setStateChangedAsync(`${id}.info.icon`, { val: icon ? icon : '', ack: true });

                await this.setObjectNotExistsAsync(`${id}.info.iconAndName`, {
                    type: 'state',
                    common: {
                        name: {
                            en: `Combination of icon and display name for ${fullId}`,
                            de: `Kombination aus Symbol und Anzeigename für ${fullId}`,
                        },
                        type: 'string',
                        role: 'text',
                        read: true,
                        write: false,
                    },
                    native: {},
                });
                await this.setStateChangedAsync(`${id}.info.iconAndName`, { val: iconAndName, ack: true });

                await this.setObjectNotExistsAsync(`${id}.info.presence`, {
                    type: 'channel',
                    common: {
                        name: {
                            en: `Information about presence of ${name}`,
                            de: `Informationen über die Anwesenheit von ${name}`,
                            ru: `Информация о наличии ${name}`,
                            pt: `InformaÃ§Ãμes sobre a presença de ${name}`,
                            nl: `Informatie over aanwezigheid van ${name}`,
                            fr: `Informations sur la présence de ${name}`,
                            it: `Informazioni sulla presenza di ${name}`,
                            es: `Información sobre la presencia de ${name}`,
                            pl: `Informacja o obecności ${name}`,
                            uk: `Інформація про наявність ${name}`,
                            'zh-cn': `${name} 有关十国存在的资料`,
                        },
                    },
                    native: {},
                });

                await this.setObjectNotExistsAsync(`${id}.info.presence.lastHome`, {
                    type: 'state',
                    common: {
                        name: {
                            en: `${name} came home last`,
                            de: `${name} kam zuletzt nach Hause`,
                            ru: `${name} вернулся домой последним`,
                            pt: `${name} chegou a casa por último`,
                            nl: `${name} kwam laatst thuis`,
                            fr: `${name} est rentré en dernier`,
                            it: `${name} è tornato a casa per ultimo`,
                            es: `${name} llegó a casa el último`,
                            pl: `${name} wrócił do domu ostatnio`,
                            uk: `${name} прийшов додому останнім`,
                            'zh-cn': `${name} 最后回家了`,
                        },
                        type: 'string',
                        role: 'text',
                        read: true,
                        write: false,
                        desc: {
                            en: `Weekday and time when ${name} last came home`,
                            de: `Wochentag und Uhrzeit, wann ${name} zuletzt nach Hause gekommen ist`,
                            ru: `День недели и время, когда ${name} в последний раз приходил домой`,
                            pt: `Dia da semana e hora da última vez que ${name} regressou a casa`,
                            nl: `Weekdag en tijdstip waarop ${name} voor het laatst thuis kwam`,
                            fr: `Jour de la semaine et heure à laquelle ${
                                name
                            } est rentré pour la dernière fois à la maison`,
                            it: `Giorno della settimana e ora in cui ${name} è tornato a casa per l'ultima volta`,
                            es: `Día de la semana y hora en que ${name} llegó a casa por última vez`,
                            pl: `Dzień tygodnia i godzina, kiedy ${name} ostatni raz wrócił do domu`,
                            uk: `День тижня та час, коли ${name} востаннє повертався додому`,
                            'zh-cn': `${name} 最后一次回家的工作日和时间`,
                        },
                    },
                    native: {},
                });

                await this.setObjectNotExistsAsync(`${id}.info.presence.lastAway`, {
                    type: 'state',
                    common: {
                        name: {
                            en: `${name} left home last`,
                            de: `${name} verließ zuletzt das Haus`,
                            ru: `${name} ушел из дома последним`,
                            pt: `${name} saiu de casa por último`,
                            nl: `${name} vertrok laatst van huis`,
                            fr: `${name} a quitté la maison en dernier`,
                            it: `${name} è uscito di casa l'ultima volta`,
                            es: `${name} salió de casa el pasado`,
                            pl: `${name} wyszedł z domu jako ostatni`,
                            uk: `${name} пішов з дому останнім`,
                            'zh-cn': `${name} 最后离开家`,
                        },
                        type: 'string',
                        role: 'text',
                        read: true,
                        write: false,
                        desc: {
                            en: `Weekday and time when ${name} last left home`,
                            de: `Wochentag und Uhrzeit, wann ${name} zuletzt das Hause verlassen hat`,
                            ru: `День недели и время, когда ${name} в последний раз уходил из дома`,
                            pt: `Dia e hora da semana em que ${name} saiu pela última vez de casa`,
                            nl: `Weekdag en tijdstip waarop ${name} het laatst van huis is vertrokken`,
                            fr: `Jour de la semaine et heure à laquelle ${
                                name
                            } a quitté son domicile pour la dernière fois.`,
                            it: `Giorno e ora in cui ${name} è uscito di casa per l'ultima volta`,
                            es: `Día de la semana y hora en que ${name} salió de casa por última vez`,
                            pl: `Dzień tygodnia i godzina, kiedy ${name} ostatni raz wyszedł z domu`,
                            uk: `День тижня та час, коли ${name} востаннє виходив з дому`,
                            'zh-cn': `${name} 最后一次离家的工作日和时间`,
                        },
                    },
                    native: {},
                });

                const homePersonLang = {
                    '': nobodyLang,
                };

                if (residentType != 'pet') {
                    // Night/Awoken statistics and activity support

                    await this.setObjectNotExistsAsync(`${id}.info.presence.lastNight`, {
                        type: 'state',
                        common: {
                            name: {
                                en: `${name} went to sleep last`,
                                de: `${name} hat sich zuletzt schlafen gelegt`,
                                ru: `${name} уснул последним`,
                                pt: `${name} foi dormir por último`,
                                nl: `${name} is laatst gaan slapen`,
                                fr: `${name} s'est couché en dernier`,
                                it: `${name} è andato a dormire per ultimo`,
                                es: `${name} se ha ido a dormir el último`,
                                pl: `${name} poszedł spać ostatni raz`,
                                uk: `${name} пішов спати останнім`,
                                'zh-cn': `${name} 已经睡了最后一觉`,
                            },
                            type: 'string',
                            role: 'text',
                            read: true,
                            write: false,
                            desc: {
                                en: `Weekday and time when ${name} last went to sleep`,
                                de: `Wochentag und Uhrzeit, wann ${name} sich zuletzt schlafen gelegt hat`,
                                ru: `День недели и время, когда ${name} в последний раз ложился спать`,
                                pt: `Dia da semana e hora da última vez que ${name} adormeceu`,
                                nl: `Weekdag en tijd waarop ${name} voor het laatst ging slapen`,
                                fr: `Jour de la semaine et heure du dernier coucher de ${name}`,
                                it: `Giorno della settimana e ora in cui ${name} è andato a dormire per l'ultima volta`,
                                es: `Día de la semana y hora a la que ${name} se fue a dormir por última vez`,
                                pl: `Dzień tygodnia i godzina, kiedy ${name} ostatnio poszedł spać`,
                                uk: `День тижня та час, коли ${name} востаннє лягав спати`,
                                'zh-cn': `${name} 最后一次入睡的工作日和时间`,
                            },
                        },
                        native: {},
                    });

                    await this.setObjectNotExistsAsync(`${id}.info.presence.lastAwoken`, {
                        type: 'state',
                        common: {
                            name: {
                                en: `${name} woke up last`,
                                de: `${name} ist zuletzt aufgewacht`,
                                ru: `${name} проснулся последним`,
                                pt: `${name} acordou por último`,
                                nl: `${name} werd laatst wakker`,
                                fr: `${name} s'est réveillé hier`,
                                it: `${name} si è svegliato l'ultima volta`,
                                es: `${name} se despertó el pasado`,
                                pl: `${name} obudził się ostatnio`,
                                uk: `${name} прокинувся останнім`,
                                'zh-cn': `${name} 最后醒来的时候`,
                            },
                            type: 'string',
                            role: 'text',
                            read: true,
                            write: false,
                            desc: {
                                en: `Weekday and time when ${name} last woke up`,
                                de: `Wochentag und Uhrzeit, wann ${name} zuletzt aufgewacht ist`,
                                ru: `День недели и время, когда ${name} в последний раз просыпался`,
                                pt: `Dia e hora da semana em que ${name} acordou pela última vez`,
                                nl: `Weekdag en tijd waarop ${name} voor het laatst wakker werd`,
                                fr: `Jour de la semaine et heure du dernier réveil de ${name}`,
                                it: `Giorno della settimana e ora dell'ultimo risveglio di ${name}`,
                                es: `Día de la semana y hora en que ${name} se despertó por última vez`,
                                pl: `Dzień tygodnia i godzina, kiedy ${name} ostatnio się obudził`,
                                uk: `День тижня та час, коли ${name} востаннє прокинувся`,
                                'zh-cn': `${name} 最后一次醒来的工作日和时间`,
                            },
                        },
                        native: {},
                    });

                    await this.setObjectNotExistsAsync(`${id}.activity`, {
                        type: 'channel',
                        common: {
                            name: {
                                en: `Activity states of ${name}`,
                                de: `Aktivitätsstatus von ${name}`,
                                ru: `Состояние деятельности ${name}`,
                                pt: `Estados de atividade de ${name}`,
                                nl: `Activiteit staat van ${name}`,
                                fr: `État d'activité de ${name}`,
                                it: `Stati di attività di ${name}`,
                                es: `Estado de actividad de ${name}`,
                                pl: `Aktywność stanów ${name}`,
                                uk: `Стани діяльності ${name}`,
                                'zh-cn': `${name} 动产国`,
                            },
                        },
                        native: {},
                    });

                    await this.setObjectNotExistsAsync(
                        `${id}.activity.state`,
                        {
                            type: 'state',
                            common: {
                                name: {
                                    en: `${name} activity state`,
                                    de: `${name} Aktivitätsstatus`,
                                    ru: `${name} активность государство`,
                                    pt: `estado de atividade ${name}`,
                                    nl: `${name} activiteit staat`,
                                    fr: `état de l ' activité ${name}`,
                                    it: `${name} attività stato`,
                                    es: `estado de actividad ${name}`,
                                    pl: `państwo aktywności ${name}`,
                                    uk: `стан діяльності ${name}`,
                                    'zh-cn': `${name} 动植物活动`,
                                },
                                type: 'number',
                                role: 'level',
                                min: 0,
                                max: 12999,
                                read: true,
                                write: false,
                                def: 0,
                                desc: {
                                    en: 'Resident activity state',
                                    de: 'Bewohner Aktivitätsstatus',
                                    ru: 'Государственная деятельность',
                                    pt: 'Estado de atividade residente',
                                    nl: 'Husident activiteit',
                                    fr: 'État résident',
                                    it: 'Stato di attività residenziale',
                                    es: 'Estado de actividad residente',
                                    pl: 'Stany Zjednoczone',
                                    uk: 'Державна діяльність',
                                    'zh-cn': '驻地活动州',
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
                    let currentObject = await this.getObjectAsync(`${id}.activity.state`);
                    if (currentObject) {
                        currentObject.common.states = activityStates;
                        await this.setObjectAsync(`${id}.activity.state`, currentObject);
                    }

                    await this.setObjectNotExistsAsync(
                        `${id}.activity.focus`,
                        {
                            type: 'state',
                            common: {
                                name: {
                                    en: `${name} has set this focus`,
                                    de: `${name} hat diesen Fokus gesetzt`,
                                    ru: `${name} установил этот фокус`,
                                    pt: `${name} definiu este foco`,
                                    nl: `${name} heeft deze focus`,
                                    fr: `${name} a défini cet objectif`,
                                    it: `${name} ha impostato questo focus`,
                                    es: `${name} ha establecido este enfoque`,
                                    pl: `${name} zakładało to skupienie się na ten temat`,
                                    uk: `${name} встановити цей фокус`,
                                    'zh-cn': '十国已经确定了这一重点。',
                                },
                                type: 'number',
                                role: 'level',
                                min: 0,
                                max: 12999,
                                read: true,
                                write: true,
                                def: 0,
                                desc: {
                                    en: 'The focus the resident has set for themself.',
                                    de: 'Der Fokus, den der Bewohner für sich gesetzt hat.',
                                    ru: 'Сосредоточьтесь на том, что резидент поставил от себя.',
                                    pt: 'O foco que o residente estabeleceu deles.',
                                    nl: 'De concentratie die de bewoner van henzelf heeft gemaakt.',
                                    fr: "L'accent que le résident a mis de lui-même.",
                                    it: 'Il focus che il residente ha impostato da loro stessi.',
                                    es: 'El enfoque que el residente ha establecido de ellos mismo.',
                                    pl: 'Skoncentrował się na tym, że rezydent od nich sam.',
                                    uk: 'У фокусі резидента встановлено від себе.',
                                    'zh-cn': '居民的焦点来自他们自己。.',
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
                    currentObject = await this.getObjectAsync(`${id}.activity.focus`);
                    if (currentObject) {
                        currentObject.native.states.away = focusStates['away'];
                        currentObject.native.states.home = focusStates['home'];
                        currentObject.common.states = focusStates['away'];

                        const presenceState = await this.getStateAsync(`${id}.presence.state`);
                        if (
                            presenceState != undefined &&
                            presenceState.val != undefined &&
                            Number(presenceState.val) > 0
                        ) {
                            currentObject.common.states = focusStates['home'];
                        }
                        await this.setObjectAsync(`${id}.activity.focus`, currentObject);
                    }

                    await this.setObjectNotExistsAsync(
                        `${id}.activity.awake`,
                        {
                            type: 'state',
                            common: {
                                name: {
                                    en: `${name} is awake at night?`,
                                    de: `${name} ist nachts wach?`,
                                    ru: `${name} пробуждается ночью?`,
                                    pt: `${name} está acordado à noite?`,
                                    nl: `${name} is 's nachts wakker?`,
                                    fr: `${name} est réveillée la nuit ?`,
                                    it: `${name} e' sveglia di notte?`,
                                    es: `¿${name} está despierto por la noche?`,
                                    pl: `${name} jest nocą?`,
                                    uk: `${name} це нічний час?`,
                                    'zh-cn': `${name} 在夜间是一种wak?`,
                                },
                                type: 'boolean',
                                role: 'switch',
                                read: true,
                                write: true,
                                def: false,
                                desc: {
                                    en: 'Is this resident awake at night right now?',
                                    de: 'Liegt dieser Bewohner gerade nachts wach im Bett?',
                                    ru: 'Этот житель пробуждает ночью прямо сейчас?',
                                    pt: 'Este residente está acordado à noite?',
                                    nl: "Is deze bewoner 's nachts wakker?",
                                    fr: 'Est-ce que ce résident est réveillé la nuit ?',
                                    it: "Questo residente e' sveglio di notte?",
                                    es: '¿Este residente está despierto por la noche?',
                                    pl: 'Czy ten mieszkaniec budzi się w nocy?',
                                    uk: 'Чи є це життєдіяльцем вночі прямо зараз?',
                                    'zh-cn': '现在该居民是否在夜间权利下滑?',
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
                        `${id}.activity.bedtime`,
                        {
                            type: 'state',
                            common: {
                                name: {
                                    en: `${name} is getting ready for bed?`,
                                    de: `${name} macht sich bettfertig?`,
                                    ru: `${name} готовится к постели?`,
                                    pt: `${name} está se preparando para a cama?`,
                                    nl: `${name} gaat naar bed?`,
                                    fr: `${name} se prépare pour le lit ?`,
                                    it: `${name} si sta preparando per dormire?`,
                                    es: `¿${name} se está preparando para la cama?`,
                                    pl: `${name} jest gotowy do łóżka?`,
                                    uk: `${name} готовий до ліжка?`,
                                    'zh-cn': `${name} 是否准备好?`,
                                },
                                type: 'number',
                                role: 'level',
                                min: 0,
                                max: 12999,
                                read: true,
                                write: true,
                                def: 0,
                                desc: {
                                    en: 'Is this resident getting ready for bed right now?',
                                    de: 'Macht sich dieser Bewohner gerade bettfertig?',
                                    ru: 'Готов ли этот резидент к постели прямо сейчас?',
                                    pt: 'Este residente está a preparar-se para a cama?',
                                    nl: 'Maakt deze bewoner zich nu klaar voor bed?',
                                    fr: 'Est-ce que ce résident se prépare au lit maintenant ?',
                                    it: 'Questo residente si sta preparando per andare a letto?',
                                    es: '¿Este residente se está preparando para la cama ahora mismo?',
                                    pl: 'Obecnie mieszkaniec jest gotowy do łóżka?',
                                    uk: 'Чи готовий резидент до ліжка прямо зараз?',
                                    'zh-cn': '现在该居民是否愿意获得权利?',
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
                    currentObject = await this.getObjectAsync(`${id}.activity.bedtime`);
                    if (currentObject) {
                        currentObject.common.states = {
                            0: offLang,
                            1: activityLang[1900].state,
                            2: activityLang[1901].state,
                            3: activityLang[1902].state,
                        };
                        await this.setObjectAsync(`${id}.activity.bedtime`, currentObject);
                    }

                    await this.setObjectNotExistsAsync(
                        `${id}.activity.dnd`,
                        {
                            type: 'state',
                            common: {
                                name: {
                                    en: `${name} does not want to be disturbed?`,
                                    de: `${name} möchte nicht gestört werden?`,
                                    ru: `${name} не хочет тревожиться?`,
                                    pt: `${name} não quer ser perturbado?`,
                                    nl: `${name} wil niet gestoord worden?`,
                                    fr: `${name} ne veut pas être perturbé?`,
                                    it: `${name} non vuole essere disturbato?`,
                                    es: `${name} no quiere ser molestado?`,
                                    pl: `${name} nie chce być zaniepokojony?`,
                                    uk: `${name} не хоче турбувати?`,
                                    'zh-cn': '十国不想受到干扰?',
                                },
                                type: 'boolean',
                                role: 'switch',
                                read: true,
                                write: true,
                                def: false,
                                desc: {
                                    en: 'Does the resident currently not want to be disturbed or interrupted?',
                                    de: 'Möchte der Bewohner gerade nicht gestört oder unterbrochen werden?',
                                    ru: 'В настоящее время резидент не хочет нарушать или прервать?',
                                    pt: 'O residente atualmente não quer ser perturbado ou interrompido?',
                                    nl: 'Wil de bewoner niet gestoord of gestoord worden?',
                                    fr: 'Le résident ne veut-il pas actuellement être perturbé ou interrompu?',
                                    it: 'Attualmente il residente non vuole essere disturbato o interrotto?',
                                    es: '¿El residente actualmente no quiere ser perturbado o interrumpido?',
                                    pl: 'Czy mieszkaniec nie chce być zaniepokojony lub przerywany?',
                                    uk: 'Чи не хоче бути порушеним чи переривається резидент?',
                                    'zh-cn': '目前居民是否不愿意受到混乱或打断?',
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
                        `${id}.activity.overnight`,
                        {
                            type: 'state',
                            common: {
                                name: {
                                    en: `${name} will stay overnight today?`,
                                    de: `${name} wird heute übernachten?`,
                                    ru: `${name} останется сегодня ночью?`,
                                    pt: `${name} vai passar a noite hoje?`,
                                    nl: `${name} blijft vannacht?`,
                                    fr: `${name} passera la nuit aujourd'hui?`,
                                    it: `${name} rimarrà per tutta la notte oggi?`,
                                    es: `¿${name} se quedará esta noche?`,
                                    pl: `Obecnie ${name} będzie nocą?`,
                                    uk: `${name} буде залишатися на ніч сьогодні?`,
                                    'zh-cn': `${name} 国将在今天夜间停留?`,
                                },
                                type: 'boolean',
                                role: 'switch',
                                read: true,
                                write: true,
                                def: residentType == 'guest' ? false : true,
                                desc: {
                                    en: 'Is this resident going to stay overnight today?',
                                    de: 'Wird dieser Bewohner heute über Nacht bleiben?',
                                    ru: 'Этот резидент собирается остаться на ночь сегодня?',
                                    pt: 'Este residente vai ficar hoje à noite?',
                                    nl: 'Blijft deze inwoner vannacht?',
                                    fr: "Est-ce que ce résident va passer la nuit aujourd'hui ?",
                                    it: 'Questo residente sta per rimanere per tutta la notte oggi?',
                                    es: '¿Este residente va a quedarse esta noche?',
                                    pl: 'Czy ten mieszkaniec będzie nocą?',
                                    uk: 'Чи є цей резидент, який сьогодні працює?',
                                    'zh-cn': '今天这个居民是否会过夜?',
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
                        `${id}.activity.wakeup`,
                        {
                            type: 'state',
                            common: {
                                name: {
                                    en: `${name} has a wake-up alarm running?`,
                                    de: `${name} hat einen laufenden Weckruf?`,
                                    ru: `У ${name} работает пробуждение?`,
                                    pt: `A ${name} tem uma chamada a acordar?`,
                                    nl: `Heeft ${name} een wake-up alarm?`,
                                    fr: `${name} a un réveil en cours ?`,
                                    it: `${name} ha una sveglia in funzione?`,
                                    es: `¿${name} tiene una llamada de atención?`,
                                    pl: `${name} ma nawoływane wezwanie?`,
                                    uk: `${name} має прокидний дзвінок?`,
                                    'zh-cn': `${name} 祖先发出呼吁吗?`,
                                },
                                type: 'boolean',
                                role: 'switch',
                                read: true,
                                write: true,
                                def: false,
                                desc: {
                                    en: 'Is this resident currently being woken up?',
                                    de: 'Ist dieser Bewohner gerade auf dem Heimweg?',
                                    ru: 'В настоящее время этот резидент просыпается?',
                                    pt: 'Este residente está a ser acordado?',
                                    nl: 'Wordt deze bewoner nu wakker?',
                                    fr: 'Est-ce que ce résident est actuellement réveillé ?',
                                    it: "Questo residente e' attualmente svegliato?",
                                    es: '¿Se está despertando a este residente?',
                                    pl: 'Obecnie mieszkaniec jest wychowywany?',
                                    uk: 'Чи є на даний момент резидент?',
                                    'zh-cn': '目前该居民是否受到创伤?',
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
                        `${id}.activity.wakeupSnooze`,
                        {
                            type: 'state',
                            common: {
                                name: {
                                    en: `${name} has snoozed the wake-up alarm?`,
                                    de: `${name} hat den Weckruf pausiert?`,
                                    ru: `${name} разбил звонок?`,
                                    pt: `A ${name} deu cabo da chamada de despertar?`,
                                    nl: `${name} heeft de wake-up alarm doorzocht?`,
                                    fr: `${name} a sauté le réveil ?`,
                                    it: `${name} ha snoozed la sveglia?`,
                                    es: `${name} ha snoozed la llamada de atención?`,
                                    pl: `${name} słyszało okrzyki. '`,
                                    uk: `${name} snoozed the break-up виклик?`,
                                    'zh-cn': `${name} hasnoozed the 随后的呼吁? 评 注`,
                                },
                                type: 'boolean',
                                role: 'button',
                                read: false,
                                write: true,
                                def: true,
                                desc: {
                                    en: 'Has this resident currently snoozed a wake-up alarm?',
                                    de: 'Hat dieser Bewohner gerade einen Weckruf pausiert?',
                                    ru: 'В настоящее время этот резидент разбил звонок?',
                                    pt: 'Este residente já fez uma chamada de despertar?',
                                    nl: 'Heeft deze inwoner momenteel een wake-up alarm gedaan?',
                                    fr: 'Est-ce que ce résident a fait un rappel ?',
                                    it: 'Questo residente ha attualmente snoozed una chiamata di sveglia?',
                                    es: '¿Este residente ha snoozed una llamada de atención?',
                                    pl: 'Czy ten rezydent słyszał okrzyk?',
                                    uk: 'Чи зателефонував цей резидент?',
                                    'zh-cn': '目前这一居民没有人听了一次呼吁?',
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
                        `${id}.activity.wayhome`,
                        {
                            type: 'state',
                            common: {
                                name: {
                                    en: `${name} is on way home?`,
                                    de: `${name} ist auf dem Heimweg?`,
                                    ru: `${name} это дома?`,
                                    pt: `${name} está a caminho de casa?`,
                                    nl: `${name} is op weg naar huis?`,
                                    fr: `${name} est en route ?`,
                                    it: `${name} sta tornando a casa?`,
                                    es: `¿${name} está de camino a casa?`,
                                    pl: `${name} jest w drodze do domu?`,
                                    uk: `${name} на шляху додому?`,
                                    'zh-cn': `${name} 祖国是家?`,
                                },
                                type: 'boolean',
                                role: 'switch',
                                read: true,
                                write: true,
                                def: false,
                                desc: {
                                    en: 'Is this resident on way home?',
                                    de: 'Ist dieser Bewohner gerade auf dem Heimweg?',
                                    ru: 'Это резидент на пути домой?',
                                    pt: 'Este residente está a caminho de casa?',
                                    nl: 'Is deze bewoner op weg naar huis?',
                                    fr: 'Est-ce que ce résident est en chemin ?',
                                    it: 'Questo residente sta tornando a casa?',
                                    es: '¿Está este residente de camino a casa?',
                                    pl: 'Czy ten mieszka w drodze do domu?',
                                    uk: 'Чи є це резидент на шляху додому?',
                                    'zh-cn': '是否住在家里?',
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
                    // Mood support not for pets

                    await this.setObjectNotExistsAsync(`${id}.mood`, {
                        type: 'channel',
                        common: {
                            name: {
                                en: `Mood of ${name}`,
                                de: `Laune von ${name}`,
                                ru: `Настроение ${name}`,
                                pt: `Humor de ${name}`,
                                nl: `Stemming van ${name}`,
                                fr: `Humeur de ${name}`,
                                it: `Stato d'animo di ${name}`,
                                es: `Humor de ${name}`,
                                pl: `Przewodnik ${name}`,
                                uk: `Мудрий ${name}`,
                                'zh-cn': `${name} 国`,
                            },
                        },
                        native: {},
                    });

                    await this.setObjectNotExistsAsync(
                        `${id}.mood.state`,
                        {
                            type: 'state',
                            common: {
                                name: {
                                    en: `${name} mood state`,
                                    de: `${name} Launenstatus`,
                                    ru: `Состояние настроения ${name}`,
                                    pt: `Estado de humor ${name}`,
                                    nl: `${name} stemmingsstatus`,
                                    fr: `État d'humeur ${name}`,
                                    it: `Stato dell'umore ${name}`,
                                    es: `Estado de ánimo ${name}`,
                                    pl: `Stan nastroju ${name}`,
                                    uk: `Статус настрою ${name}`,
                                    'zh-cn': `${name} 劳伦状态`,
                                },
                                type: 'number',
                                role: 'level',
                                min: 0,
                                max: 10,
                                read: true,
                                write: true,
                                def: 5,
                                desc: {
                                    en: 'Mood of the resident with negative or positive tendency',
                                    de: 'Laune des Bewohners mit negativer oder positiver Tendenz',
                                    ru: 'Настроение резидента с негативной или положительной тенденцией',
                                    pt: 'Humor do residente com tendência negativa ou positiva',
                                    nl: 'Stemming van de bewoner met een negatieve of positieve neiging',
                                    fr: 'Humeur du résident à tendance négative ou positive',
                                    it: 'Umore del residente con tendenza negativa o positiva',
                                    es: 'Estado de ánimo del residente con tendencia negativa o positiva',
                                    pl: 'Nastrój mieszkańca z tendencją negatywną lub pozytywną',
                                    uk: 'Примушені резидента з негативною або позитивною тенденцією',
                                    'zh-cn': '居民的情绪有消极或积极的倾向',
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
                    currentObject = await this.getObjectAsync(`${id}.mood.state`);
                    if (currentObject) {
                        currentObject.common.states = moodStates;
                        await this.setObjectAsync(`${id}.mood.state`, currentObject);
                    }

                    // Follow-them for Night state

                    await this.setObjectNotExistsAsync(
                        `${id}.presenceFollowing.nightEnabled`,
                        {
                            type: 'state',
                            common: {
                                name: {
                                    en: `${name} is inheriting a night state?`,
                                    de: `${name} erbt einen Nachtstatus?`,
                                    ru: `${name} наследует ночное состояние?`,
                                    pt: `A ${name} herda um estado nocturno?`,
                                    nl: `${name} erft een nachtstaat?`,
                                    fr: `${name} hérite d'un état de nuit ?`,
                                    it: `${name} sta ereditando uno stato di notte?`,
                                    es: `¿${name} hereda un estado nocturno?`,
                                    pl: `${name} dziedziczy stan nocny?`,
                                    uk: `${name} – спадщина нічного стану?`,
                                    'zh-cn': '祖国正在继承一个夜间国家?',
                                },
                                type: 'boolean',
                                role: 'switch.enable',
                                read: true,
                                write: true,
                                def: false,
                                desc: {
                                    en: 'Follow-them functionality for the night state',
                                    de: 'Follow-them Funktion für den Nachtstatus',
                                    ru: 'Функционал для ночного государства',
                                    pt: 'Funcionalidade de acompanhamento para o estado noturno',
                                    nl: 'Volg hun functie voor de nachtelijke staat',
                                    fr: "Fonctionnalité de suivi pour l'état de nuit",
                                    it: 'Funzionalità di follow-them per lo stato di notte',
                                    es: 'Funcionalidad de seguimiento para el estado nocturno',
                                    pl: 'Wstępna funkcjonalność dla nocnego stanu',
                                    uk: 'Дотримуйтесь функціональності для нічного стану',
                                    'zh-cn': '夜间国家的后续行动功能',
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
                        `${id}.presenceFollowing.nightPerson`,
                        {
                            type: 'state',
                            common: {
                                name: {
                                    en: `${name} is following sleep state of this person`,
                                    de: `${name} folgt dem Schlafstatus dieser Person`,
                                    ru: `${name} следит за состоянием сна этого человека`,
                                    pt: `${name} está seguindo o estado de sono desta pessoa`,
                                    nl: `${name} volgt slaaptoestand van deze persoon`,
                                    fr: `${name} suit l'état de sommeil de cette personne`,
                                    it: `${name} sta seguendo lo stato di sonno di questa persona`,
                                    es: `${name} sigue el estado de sueño de esta persona`,
                                    pl: `${name} jest stanem snu tej osoby`,
                                    uk: `${name} - це наступний стан сну цієї людини`,
                                    'zh-cn': `${name} 是这个人睡觉的后裔`,
                                },
                                type: 'string',
                                role: 'string',
                                read: true,
                                write: true,
                                def: '',
                                desc: {
                                    en: 'Which person is being followed?',
                                    de: 'Welcher Person wird gefolgt?',
                                    ru: 'Какой человек следует?',
                                    pt: 'Qual pessoa está sendo seguida?',
                                    nl: 'Welke persoon wordt gevolgd?',
                                    fr: 'Quelle personne est suivie ?',
                                    it: 'Quale persona viene seguita?',
                                    es: '¿A qué persona se le sigue?',
                                    pl: 'Co się dzieje?',
                                    uk: 'Яку людину слідувати?',
                                    'zh-cn': '谁是谁?',
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
                    currentObject = await this.getObjectAsync(`${id}.presenceFollowing.nightPerson`);
                    if (currentObject) {
                        currentObject.common.states = Object.assign(homePersonLang, foreignResidents);
                        await this.setObjectAsync(`${id}.presenceFollowing.nightPerson`, currentObject);
                    }

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
                    };
                    const nightModeLang = nightModeStates[this.language]
                        ? nightModeStates[this.language]
                        : nightModeStates['en'];
                    await this.setObjectNotExistsAsync(
                        `${id}.presenceFollowing.nightMode`,
                        {
                            type: 'state',
                            common: {
                                name: {
                                    en: `${name} is following these night presence events`,
                                    de: `${name} folgt diesen nächtlichen Anwesenheits-Ereignissen`,
                                    ru: `${name} следит за этими ночными событиями присутствия`,
                                    pt: `${name} está seguindo estes eventos de presença noturna`,
                                    nl: `${name} volgt deze nachtelijke gebeurtenissen`,
                                    fr: `${name} suit ces événements nocturnes`,
                                    it: `${name} segue questi eventi di presenza notturna`,
                                    es: `${name} sigue estos eventos de presencia nocturna`,
                                    pl: `${name} po tych nocnych wydarzeniach obecna jest obecna`,
                                    uk: `${name} - це наступні події нічної присутності`,
                                    'zh-cn': `第${name}次会议之后`,
                                },
                                type: 'number',
                                role: 'value',
                                read: true,
                                write: true,
                                def: 0,
                                states: nightModeLang,
                                desc: {
                                    en: 'Which night states is this person following?',
                                    de: 'Welchem Nachtstatus folgt diese Person?',
                                    ru: 'Какая ночь говорит этот человек?',
                                    pt: 'Que noite afirma que esta pessoa está a seguir?',
                                    nl: 'Welke nacht staat deze persoon te volgen?',
                                    fr: 'Quelle nuit est-ce que cette personne suit ?',
                                    it: "Qual e' la notte in cui sta seguendo questa persona?",
                                    es: '¿Qué estados de noche es esta persona que sigue?',
                                    pl: 'Co nocne stany to osoba następująca?',
                                    uk: 'Які нічні стани є такою особою:?',
                                    'zh-cn': '哪一个夜间州是谁?',
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
                    currentObject = await this.getObjectAsync(`${id}.presenceFollowing.nightMode`);
                    if (currentObject) {
                        currentObject.common.states = nightModeLang;
                        await this.setObjectAsync(`${id}.presenceFollowing.nightMode`, currentObject);
                    }
                }

                await this.setObjectNotExistsAsync(`${id}.presenceFollowing`, {
                    type: 'channel',
                    common: {
                        name: {
                            en: `Indirect presence inheritance for ${name}`,
                            de: `Indirekte Präsenzvererbung für ${name}`,
                            ru: `Непрямое наследство присутствия для ${name}`,
                            pt: `Herança de presença indireta para ${name}`,
                            nl: `Indirecte erfenis voor ${name}`,
                            fr: `Héritage de présence indirecte pour ${name}`,
                            it: `Eredità di presenza indiretta per ${name}`,
                            es: `Herencia de presencia indirecta para ${name}`,
                            pl: `Przeznaczenie ${name}`,
                            uk: `Непряма спадщина присутності для ${name}`,
                            'zh-cn': `${name} 直接存在的继承权`,
                        },
                    },
                    native: {},
                });

                await this.setObjectNotExistsAsync(
                    `${id}.presenceFollowing.homeEnabled`,
                    {
                        type: 'state',
                        common: {
                            name: {
                                en: `${name} is inheriting a home state?`,
                                de: `${name} erbt einen Zuhausestatus?`,
                                ru: `${name} наследует состояние дома?`,
                                pt: `O ${name} herda um estado de casa?`,
                                nl: `${name} erft een thuisstaat?`,
                                fr: `${name} hérite d'un État d'origine ?`,
                                it: `${name} sta ereditando uno stato di casa?`,
                                es: `¿${name} hereda un estado de origen?`,
                                pl: `${name} dziedziczy kraj?`,
                                uk: `${name} є спадковим станом будинку?`,
                                'zh-cn': '祖国正在继承一个家庭国?',
                            },
                            type: 'boolean',
                            role: 'switch.enable',
                            read: true,
                            write: true,
                            def: false,
                            desc: {
                                en: 'Follow-them functionality for coming & leaving home',
                                de: 'Follow-them Funktion für Kommen & Gehen',
                                ru: 'Функциональность для приезда и выхода из дома',
                                pt: 'Funcionalidade de acompanhamento para vir e sair de casa',
                                nl: 'Volg de functionaliteit voor het verlaten van thuis',
                                fr: 'Fonctionnalités de suivi pour rentrer & quitter la maison',
                                it: 'Funzionalità di follow-them per tornare e lasciare casa',
                                es: 'Funcionalidad de seguimiento para salir de casa',
                                pl: 'Wstępna funkcjonalność dla nadchodzącego i opuszczania domu',
                                uk: 'Дотримуйтесь функціональності для приїзду та виїзду додому',
                                'zh-cn': '今后和离开家园的后续工作功能',
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
                    `${id}.presenceFollowing.homePerson`,
                    {
                        type: 'state',
                        common: {
                            name: {
                                en: `${name} is following home state of this person`,
                                de: `${name} folgt dem Zuhausestatus dieser Person`,
                                ru: `${name} следит за домашним состоянием этого человека`,
                                pt: `${name} está seguindo o estado de casa desta pessoa`,
                                nl: `${name} volgt de staat van deze persoon`,
                                fr: `${name} suit l'état de la maison de cette personne`,
                                it: `${name} sta seguendo lo stato di casa di questa persona`,
                                es: `${name} sigue el estado natal de esta persona`,
                                pl: `${name} poprzedza stan rzeczy tej osoby`,
                                uk: `${name} - це домашня держава цієї особи`,
                                'zh-cn': `${name} 正处于这一人的家里。`,
                            },
                            type: 'string',
                            role: 'string',
                            read: true,
                            write: true,
                            def: '',
                            desc: {
                                en: 'Which person is being followed?',
                                de: 'Welcher Person wird gefolgt?',
                                ru: 'Какой человек следует?',
                                pt: 'Qual pessoa está sendo seguida?',
                                nl: 'Welke persoon wordt gevolgd?',
                                fr: 'Quelle personne est suivie ?',
                                it: 'Quale persona viene seguita?',
                                es: '¿A qué persona se le sigue?',
                                pl: 'Co się dzieje?',
                                uk: 'Яку людину слідувати?',
                                'zh-cn': '谁是谁?',
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
                currentObject = await this.getObjectAsync(`${id}.presenceFollowing.homePerson`);
                if (currentObject) {
                    currentObject.common.states = Object.assign(homePersonLang, foreignResidents);
                    await this.setObjectAsync(`${id}.presenceFollowing.homePerson`, currentObject);
                }

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
                    `${id}.presenceFollowing.homeMode`,
                    {
                        type: 'state',
                        common: {
                            name: {
                                en: `${name} is following these presence events`,
                                de: `${name} folgt diesen Anwesenheits-Ereignissen`,
                                ru: `${name} следит за этими событиями присутствия`,
                                pt: `${name} está seguindo estes eventos de presença`,
                                nl: `${name} volgt deze aanwezigheidsevenementen`,
                                fr: `${name} suit ces événements de présence`,
                                it: `${name} segue questi eventi di presenza`,
                                es: `${name} sigue estos eventos de presencia`,
                                pl: `${name} potwierdza te zdarzenia`,
                                uk: `${name} слідувати за цими подіями присутності`,
                                'zh-cn': '第十次会议之后',
                            },
                            type: 'number',
                            role: 'value',
                            read: true,
                            write: true,
                            def: 0,
                            states: homeModeLang,
                            desc: {
                                en: 'Which presence states is this person following?',
                                de: 'Welchem Anwesenheitsstatus folgt diese Person?',
                                ru: 'Какое присутствие говорит этот человек?',
                                pt: 'Que estados de presença esta pessoa está seguindo?',
                                nl: 'Welke aanwezigheid volgt deze persoon?',
                                fr: 'Quelle est cette personne qui suit ?',
                                it: 'Quale presenza afferma che questa persona sta seguendo?',
                                es: '¿Qué estados de presencia sigue esta persona?',
                                pl: 'Jaka jest obecna osoba?',
                                uk: 'Яка присутність в цій особі?',
                                'zh-cn': '哪些存在国?',
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
                currentObject = await this.getObjectAsync(`${id}.presenceFollowing.homeMode`);
                if (currentObject) {
                    currentObject.common.states = homeModeLang;
                    await this.setObjectAsync(`${id}.presenceFollowing.homeMode`, currentObject);
                }

                await this.setObjectNotExistsAsync(`${id}.presence`, {
                    type: 'channel',
                    common: {
                        name: {
                            en: `Presence states of ${name}`,
                            de: `Anwesenheitsstatus von ${name}`,
                            ru: `Состояние присутствия ${name}`,
                            pt: `Estados de presença de ${name}`,
                            nl: `Druk staat van ${name}`,
                            fr: `État de présence de ${name}`,
                            it: `Stati di presenza di ${name}`,
                            es: `Estados de presencia de ${name}`,
                            pl: `Państwa prezydenckie ${name}`,
                            uk: `Заочні стани ${name}`,
                            'zh-cn': `${name} 祖先国`,
                        },
                    },
                    native: {},
                });

                await this.setObjectNotExistsAsync(
                    `${id}.presence.home`,
                    {
                        type: 'state',
                        common: {
                            name: {
                                en: `${name} is at home?`,
                                de: `${name} ist zuhause?`,
                                ru: `${name} дома?`,
                                pt: `O ${name} está em casa?`,
                                nl: `${name} is thuis?`,
                                fr: `${name} est à la maison ?`,
                                it: `${name} e' a casa?`,
                                es: `¿${name} está en casa?`,
                                pl: `${name} jest w domu?`,
                                uk: `${name} в домашніх умовах?`,
                                'zh-cn': `${name}祖国是家?`,
                            },
                            type: 'boolean',
                            role: 'switch',
                            read: true,
                            write: true,
                            def: false,
                            desc: {
                                en: 'Is this resident at home?',
                                de: 'Ist dieser Bewohner zuhause?',
                                ru: 'Это резидент дома?',
                                pt: 'É residente em casa?',
                                nl: 'Is deze bewoner thuis?',
                                fr: 'Est-ce que ce résident est à la maison ?',
                                it: "E' residente a casa?",
                                es: '¿Es residente en casa?',
                                pl: 'Czy ten mieszka w domu?',
                                uk: 'Чи є це резидент будинку?',
                                'zh-cn': '是否住在家里?',
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
                    `${id}.presence.away`,
                    {
                        type: 'state',
                        common: {
                            name: {
                                en: `${name} is away?`,
                                de: `${name} ist abwesend?`,
                                ru: `${name} находится вдали?`,
                                pt: `O ${name} está fora?`,
                                nl: `${name} is afwezig?`,
                                fr: `${name} est parti ?`,
                                it: `${name} e' via?`,
                                es: `¿${name} está fuera?`,
                                pl: `${name} jest już odległy?`,
                                uk: `${name} є далеко?`,
                                'zh-cn': `${name} 不存在？`,
                            },
                            type: 'boolean',
                            role: 'switch',
                            read: true,
                            write: true,
                            def: true,
                            desc: {
                                en: 'Is this resident away?',
                                de: 'Ist dieser Bewohner abwesend?',
                                ru: 'Это резидент?',
                                pt: 'Este residente está fora?',
                                nl: 'Is deze bewoner weg?',
                                fr: 'Est-ce que ce résident est parti ?',
                                it: "E' via questo residente?",
                                es: '¿Este residente está fuera?',
                                pl: 'Czy to mieszka?',
                                uk: 'Чи є це резидент?',
                                'zh-cn': '是否住在该居民?',
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
                        `${id}.presence.state`,
                        {
                            type: 'state',
                            common: {
                                name: {
                                    en: `${name} presence state`,
                                    de: `${name} Anwesenheitsstatus`,
                                    ru: `${name} состояние присутствия`,
                                    pt: `Estado de presença ${name}`,
                                    nl: `${name} aanwezigheidsstatus`,
                                    fr: `Statut de présence ${name}`,
                                    it: `Stato di presenza ${name}`,
                                    es: `Estado de presencia ${name}`,
                                    pl: `Stan obecności ${name}`,
                                    uk: `Стан присутності ${name}`,
                                    'zh-cn': `${name} 存在状态`,
                                },
                                type: 'number',
                                role: 'level',
                                min: 0,
                                max: 1,
                                read: true,
                                write: true,
                                def: 0,
                                desc: {
                                    en: 'Resident presence state\n0 = Away\n1 = Home',
                                    de: 'Bewohner Anwesenheitsstatus\n0 = Abwesend\n1 = Zu Hause',
                                    ru: 'Состояние присутствия',
                                    pt: 'Estado de presença residente',
                                    nl: 'Verblijfsvergunning staat',
                                    fr: 'Présence résidente',
                                    it: 'Stato di presenza residente',
                                    es: 'Estado de presencia residente',
                                    pl: 'Stany Zjednoczone',
                                    uk: 'Стан присутності резидента',
                                    'zh-cn': '驻地存在',
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
                    const currentObject = await this.getObjectAsync(`${id}.presence.state`);
                    if (currentObject) {
                        currentObject.common.states = petPresenceLang;
                        await this.setObjectAsync(`${id}.presence.state`, currentObject);
                    }
                } else {
                    // Presence state for humans
                    await this.setObjectNotExistsAsync(
                        `${id}.presence.night`,
                        {
                            type: 'state',
                            common: {
                                name: {
                                    en: `${name} is at sleep?`,
                                    de: `${name} schläft?`,
                                    ru: `${name} у сна?`,
                                    pt: `O ${name} está a dormir?`,
                                    nl: `${name} slaapt?`,
                                    fr: `${name} est en sommeil ?`,
                                    it: `${name} sta dormendo?`,
                                    es: `¿${name} está durmiendo?`,
                                    pl: `${name} jest w snu?`,
                                    uk: `${name} на сонці?`,
                                    'zh-cn': `${name} 睡觉?`,
                                },
                                type: 'boolean',
                                role: 'switch',
                                read: true,
                                write: true,
                                def: false,
                                desc: {
                                    en: 'Is this resident at sleep?',
                                    de: 'Schläft dieser Bewohner gerade?',
                                    ru: 'Это резидент сон?',
                                    pt: 'Este residente está a dormir?',
                                    nl: 'Is deze inwoner in slaap?',
                                    fr: 'Est-ce que ce résident dort ?',
                                    it: "E' residente a dormire?",
                                    es: '¿Este residente está durmiendo?',
                                    pl: 'Czy ten mieszkaniec śpi?',
                                    uk: 'Чи є це житель уві сні?',
                                    'zh-cn': '这个居民是否睡觉?',
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
                        `${id}.presence.state`,
                        {
                            type: 'state',
                            common: {
                                name: {
                                    en: `${name} presence state`,
                                    de: `${name} Anwesenheitsstatus`,
                                    ru: `${name} состояние присутствия`,
                                    pt: `Estado de presença ${name}`,
                                    nl: `${name} aanwezigheidsstatus`,
                                    fr: `Statut de présence ${name}`,
                                    it: `Stato di presenza ${name}`,
                                    es: `Estado de presencia ${name}`,
                                    pl: `Stan obecności ${name}`,
                                    uk: `Стан присутності ${name}`,
                                    'zh-cn': `${name} 存在状态`,
                                },
                                type: 'number',
                                role: 'level',
                                min: 0,
                                max: 2,
                                read: true,
                                write: true,
                                def: 0,
                                desc: {
                                    en: 'Resident presence state\n0 = Away\n1 = Home\n2 = Night',
                                    de: 'Bewohner Anwesenheitsstatus\n0 = Abwesend\n1 = Zu Hause\n2 = Nacht',
                                    ru: 'Состояние присутствия',
                                    pt: 'Estado de presença residente',
                                    nl: 'Verblijfsvergunning staat',
                                    fr: 'Présence résidente',
                                    it: 'Stato di presenza residente',
                                    es: 'Estado de presencia residente',
                                    pl: 'Stany Zjednoczone',
                                    uk: 'Стан присутності резидента',
                                    'zh-cn': '驻地存在',
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
                    const currentObject = await this.getObjectAsync(`${id}.presence.state`);
                    if (currentObject) {
                        currentObject.common.states = presenceLang;
                        await this.setObjectAsync(`${id}.presence.state`, currentObject);
                    }
                }

                this.subscriptions.push(`${id}.enabled`);
                this.subscriptions.push(`${id}.activity.*`);
                this.subscriptions.push(`${id}.mood.state`);
                this.subscriptions.push(`${id}.presence.*`);
                this.subscriptions.push(`${id}.presenceFollowing.*`);

                // Mirror/monitor external/foreign presence objects
                if (
                    resident.foreignPresenceObjectId != undefined &&
                    typeof resident.foreignPresenceObjectId == 'string' &&
                    resident.foreignPresenceObjectId != ''
                ) {
                    const foreignPresenceState = await this.getForeignStateAsync(resident.foreignPresenceObjectId);
                    if (this.presenceSubscriptionMapping[resident.foreignPresenceObjectId] == undefined) {
                        this.presenceSubscriptionMapping[resident.foreignPresenceObjectId] = [];
                    }
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
                            `${id}: Monitoring foreign presence datapoint ${resident.foreignPresenceObjectId}`,
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
                            `${id}: Foreign presence datapoint ${resident.foreignPresenceObjectId} is invalid`,
                        );
                    }
                }

                // Mirror/monitor external/foreign way home objects
                if (
                    resident.foreignWayhomeObjectId != undefined &&
                    typeof resident.foreignWayhomeObjectId == 'string' &&
                    resident.foreignWayhomeObjectId != ''
                ) {
                    const foreignWayhomeState = await this.getForeignStateAsync(resident.foreignWayhomeObjectId);
                    if (this.wayhomeSubscriptionMapping[resident.foreignWayhomeObjectId] == undefined) {
                        this.wayhomeSubscriptionMapping[resident.foreignWayhomeObjectId] = [];
                    }
                    this.wayhomeSubscriptionMapping[resident.foreignWayhomeObjectId].push(id);

                    if (this.presenceSubscriptionMapping[resident.foreignWayhomeObjectId] != undefined) {
                        this.wayhomeSubscriptionMapping[resident.foreignWayhomeObjectId].shift();
                        this.log.error(
                            `${
                                resident.foreignWayhomeObjectId
                            } is already in use for presence entry/exit events, it can not be used for way home events in that case.`,
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
                            `${id}: Monitoring foreign way home datapoint ${resident.foreignWayhomeObjectId}`,
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
                            `${id}: Foreign way home datapoint ${resident.foreignWayhomeObjectId} is invalid`,
                        );
                    }
                }

                // Presence following: Arriving + Leaving
                let followEnabled = await this.getStateAsync(`${id}.presenceFollowing.homeEnabled`);
                let followPerson = await this.getStateAsync(`${id}.presenceFollowing.homePerson`);
                let followMode = await this.getStateAsync(`${id}.presenceFollowing.homeMode`);
                if (
                    followEnabled != undefined &&
                    followPerson != undefined &&
                    followMode != undefined &&
                    followEnabled.val == true &&
                    followPerson.val != '' &&
                    followPerson.val != 'none' &&
                    followPerson.val != 'nobody'
                ) {
                    const objId = `${followPerson.val}.presence.state`;
                    const followPersonObj = await this.getForeignObjectAsync(String(followPerson.val));
                    if (
                        followPersonObj != undefined &&
                        followPersonObj.type == 'device' &&
                        followPersonObj._id.startsWith('residents.')
                    ) {
                        this.log.info(`${id}: Following home presence of ${followPerson.val}`);
                        if (this.presenceFollowingMapping[objId] == undefined) {
                            this.presenceFollowingMapping[objId] = {};
                        }

                        if (this.presenceFollowingMapping[objId]['arriving'] == undefined) {
                            this.presenceFollowingMapping[objId]['arriving'] = [];
                        }
                        if (followMode.val == 0 || followMode.val == 1) {
                            this.presenceFollowingMapping[objId]['arriving'].push(fullId);
                        }

                        if (this.presenceFollowingMapping[objId]['leaving'] == undefined) {
                            this.presenceFollowingMapping[objId]['leaving'] = [];
                        }
                        if (followMode.val == 0 || followMode.val == 2) {
                            this.presenceFollowingMapping[objId]['leaving'].push(fullId);
                        }
                        if (!String(followPerson.val).startsWith(this.namespace)) {
                            this.foreignSubscriptions.push(objId);
                        }
                    } else {
                        this.log.error(`${id}: Home presence following: Invalid homePerson value: ${followPerson.val}`);
                    }
                }

                // Presence following: Sleeping + Wakeup
                if (residentType != 'pet') {
                    followEnabled = await this.getStateAsync(`${id}.presenceFollowing.nightEnabled`);
                    followPerson = await this.getStateAsync(`${id}.presenceFollowing.nightPerson`);
                    followMode = await this.getStateAsync(`${id}.presenceFollowing.nightMode`);
                    if (
                        followEnabled != undefined &&
                        followPerson != undefined &&
                        followMode != undefined &&
                        followEnabled.val == true &&
                        followPerson.val != '' &&
                        followPerson.val != 'none' &&
                        followPerson.val != 'nobody'
                    ) {
                        const objId = `${followPerson.val}.presence.state`;
                        const followPersonObj = await this.getForeignObjectAsync(String(followPerson.val));
                        if (
                            followPersonObj != undefined &&
                            followPersonObj.type == 'device' &&
                            followPersonObj._id.startsWith('residents.')
                        ) {
                            this.log.info(`${id}: Following night presence of ${followPerson.val}`);
                            if (this.presenceFollowingMapping[objId] == undefined) {
                                this.presenceFollowingMapping[objId] = {};
                            }

                            if (this.presenceFollowingMapping[objId]['sleeping'] == undefined) {
                                this.presenceFollowingMapping[objId]['sleeping'] = [];
                            }
                            if (followMode.val == 0 || followMode.val == 1) {
                                this.presenceFollowingMapping[objId]['sleeping'].push(fullId);
                            }

                            if (this.presenceFollowingMapping[objId]['wakeup'] == undefined) {
                                this.presenceFollowingMapping[objId]['wakeup'] = [];
                            }
                            if (followMode.val == 0 || followMode.val == 2) {
                                this.presenceFollowingMapping[objId]['wakeup'].push(fullId);
                            }
                            if (!String(followPerson.val).startsWith(this.namespace)) {
                                this.foreignSubscriptions.push(objId);
                            }
                        } else {
                            this.log.error(
                                `${id}: Night presence following: Invalid nightPerson value: ${followPerson.val}`,
                            );
                        }
                    }
                }

                // Yahka instance update
                if (
                    resident['yahkaInstanceId'] &&
                    resident['yahkaInstanceId'] != '' &&
                    resident['yahkaInstanceId'] != 'none'
                ) {
                    const serial = fullId;
                    const yahkaDeviceConfig = {
                        configType: 'customdevice',
                        manufacturer: 'ioBroker',
                        model: `residents.${residentType}`,
                        name: name,
                        serial: serial,
                        firmware: this.version,
                        enabled: true,
                        category: '11',
                        services: [
                            {
                                name: `${serial}.presence.home`,
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
                                        inOutParameters: `${serial}.enabled`,
                                    },
                                    {
                                        name: 'OccupancyDetected',
                                        enabled: true,
                                        inOutFunction: 'ioBroker.State',
                                        inOutParameters: `${serial}.presence.home`,
                                    },
                                ],
                                linkTo: `${serial}.presence.state`,
                                isPrimary: true,
                            },
                            {
                                name: `${serial}.presence.state`,
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
                                        inOutParameters: `${serial}.enabled`,
                                    },
                                    {
                                        name: 'SecuritySystemCurrentState',
                                        enabled: true,
                                        properties: {
                                            maxValue: 2,
                                            validValues: [0, 1, 2],
                                        },
                                        inOutFunction: 'ioBroker.State.OnlyACK',
                                        inOutParameters: `${serial}.presence.state`,
                                        conversionFunction: 'map',
                                        conversionParameters: {
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
                                        inOutParameters: `${serial}.presence.state`,
                                        conversionFunction: 'map',
                                        conversionParameters: {
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
                                        },
                                    },
                                ],
                                linkTo: `${serial}.presence.home`,
                            },
                        ],
                        groupString: this.namespace,
                    };

                    const currentYahkaConf = await this.getForeignObjectAsync(
                        `system.adapter.${resident['yahkaInstanceId']}`,
                    );

                    if (
                        currentYahkaConf &&
                        currentYahkaConf.common.name == 'yahka' &&
                        currentYahkaConf.native.bridge.devices.filter(e => e.serial == serial).length == 0
                    ) {
                        this.log.info(
                            `Homekit support: Adding ${serial} to devices of ${resident['yahkaInstanceId']} instance`,
                        );
                        currentYahkaConf.native.bridge.devices.push(yahkaDeviceConfig);
                        await this.setForeignObjectAsync(
                            `system.adapter.${resident['yahkaInstanceId']}`,
                            currentYahkaConf,
                        );
                    }
                }
            }
        }

        ///////////////////////////
        // Group mode
        const objectTemplates = await this.getForeignObjectAsync(`system.adapter.${this.namespace}`);
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
                    this.log.debug(`Monitoring parent resident instance ${instance}`);
                    this.subscriptions.push(`${instance}.mood`);
                    this.subscriptions.push(`${instance}.state`);
                    this.parentInstances.push(instance);
                } else {
                    this.log.error(`Failed to enable monitoring of desired parent resident instance ${instance}`);
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
                        ru: 'Информация о структуре группы жителей',
                        pt: 'InformaÃ§Ãμes sobre a estrutura de grupo dos residentes',
                        nl: 'Informatie over de groepsstructuur van de bewoners',
                        fr: 'Information sur la structure de groupe des résidents',
                        it: 'Informazioni sulla struttura del gruppo dei residenti',
                        es: 'Información sobre la estructura grupal de los residentes',
                        pl: 'Informacje o strukturze grupowej mieszkańców',
                        uk: 'Інформація про групову структуру мешканців',
                        'zh-cn': '关于居民群体结构的资料',
                    },
                },
                native: {},
            });

            await this.setObjectNotExistsAsync(
                'group.info',
                // @ts-expect-error -- TODO: add proper TypeScript types
                objectTemplates.instanceObjects.filter(e => e._id == 'info')[0],
            );
            await this.setObjectNotExistsAsync(
                'group.info.state',
                // @ts-expect-error -- TODO: add proper TypeScript types
                objectTemplates.instanceObjects.filter(e => e._id == 'info.state')[0],
            );

            await this.setObjectNotExistsAsync('group.info.state.originID', {
                type: 'state',
                common: {
                    name: {
                        en: 'Origin instance ID for group state',
                        de: 'Ursprüngliche Instanz-ID für Gruppenstatus',
                        ru: 'Происхождение идентификатор для группового государства',
                        pt: 'ID de instância de origem para estado de grupo',
                        nl: 'Origine ID voor groepsstaat',
                        fr: 'Origin instance ID for group state',
                        it: 'ID istanza di origine per stato di gruppo',
                        es: 'ID de instancia de origen para estado de grupo',
                        pl: 'Określenie ID dla państwa grupowego',
                        uk: 'Ідентифікатор походження для групового стану',
                        'zh-cn': '例如,开发集团国家',
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
                // @ts-expect-error -- TODO: add proper TypeScript types
                objectTemplates.instanceObjects.filter(e => e._id == 'state')[0],
            );
            // Update common.states
            currentObject = await this.getObjectAsync('group.state');
            if (currentObject) {
                currentObject.common.states = residentialStates;
                await this.setObjectAsync('group.state', currentObject);
            }

            await this.setObjectNotExistsAsync(
                'group.mood',
                // @ts-expect-error -- TODO: add proper TypeScript types
                objectTemplates.instanceObjects.filter(e => e._id == 'mood')[0],
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
                this.log.silly(`Subscribing to events for ${id}`);
                this.subscribeStates(id);
            }
        }
        for (const i in this.foreignSubscriptions) {
            const stateList = await this.getForeignStatesAsync(this.foreignSubscriptions[i]);
            for (const id in stateList) {
                this.states[id] = stateList[id];
                this.log.silly(`Subscribing to foreign events for ${id}`);
                this.subscribeForeignStates(id);
            }
        }

        // Start timers
        if (
            this.config.disableAbsentResidentsDailyTimerEnabled != undefined &&
            this.config.disableAbsentResidentsDailyTimerEnabled == true
        ) {
            this.timeoutDisableAbsentResidents(true);
        }
        if (
            this.config.resetOvernightDailyTimerEnabled != undefined &&
            this.config.resetOvernightDailyTimerEnabled == true
        ) {
            this.timeoutResetOvernight(true);
        }

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
        const eventNamespace = `${adapterName}.${adapterInstance}`; // adapter namespace
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
                        this.log.error(`${id}: Unexpected event`);
                    }
                }
            } else {
                // The state was updated (ack=true)
                // ignore some of our own ack events
                if (
                    level1 == 'control' ||
                    level1 == 'group' ||
                    level1 == 'info' ||
                    level1 == 'mood' ||
                    level1 == 'state'
                ) {
                    return;
                }

                this.processResidentDeviceUpdateEvent(id, state);
            }
        } else if (adapterName == 'residents') {
            // Foreign residents instance events
            // The state was controlled (ack=false)
            if (!state.ack) {
                //
            } else {
                // The state was updated (ack=true)
                // parent residents instance summary state was updated
                if (level1 == 'state' || level1 == 'mood') {
                    this.log.debug(`Received parent ${level1} update from ${eventNamespace}`);
                    this.setResidentsSummary();
                }
            }
        } else {
            // Other foreign events
            // The state was controlled (ack=false)
            if (!state.ack) {
                if (
                    this.hasJsonStructure(state.val) &&
                    (this.presenceSubscriptionMapping[id] != undefined ||
                        this.wayhomeSubscriptionMapping[id] != undefined)
                ) {
                    // for JSON values, don't expect any ack being set
                    this.log.warn(
                        `${
                            id
                        }: Received non-ack'ed JSON presence event which might lead to duplicate event processing. Maybe ask the maintainer for ${
                            adapterName
                        } adapter to write state values containing JSON with \`ack=true\` and also define the state object with \`common.write=false\`?`,
                    );
                    this.setResidentDevicePresenceFromEvent(id, state);
                    return;
                } else if (this.presenceSubscriptionMapping[id] != undefined) {
                    this.log.debug(
                        `${
                            id
                        }: Received non-ack'ed presence control event. Waiting for ack'ed event to process presence change.`,
                    );
                } else if (this.wayhomeSubscriptionMapping[id] != undefined) {
                    this.log.debug(
                        `${
                            id
                        }: Received non-ack'ed way home control event. Waiting for ack'ed event to process way home change.`,
                    );
                }
            } else if (this.presenceSubscriptionMapping[id] != undefined) {
                // The state was updated (ack=true)
                this.setResidentDevicePresenceFromEvent(id, state);
            } else if (this.wayhomeSubscriptionMapping[id] != undefined) {
                this.setResidentDevicePresenceFromEvent(id, state);
            } else {
                this.log.error(`${id}: Unexpected event`);
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
        } catch {
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

        if (typeof level1 != 'string') {
            return;
        }

        // const oldState = this.states[id] ? this.states[id] : state;
        this.states[id] = state;

        switch (levels2_3) {
            case 'state.disableAll': {
                this.residents.forEach(async resident => {
                    const enabled = await this.getStateAsync(`${resident['id']}.enabled`);
                    const away = await this.getStateAsync(`${resident['id']}.presence.away`);

                    if (!enabled || !away) {
                        return;
                    }

                    if (enabled.val == false) {
                        this.log.debug(
                            `${allLevels}: ${resident['id']} is already 'disabled', therefore it is not changed.`,
                        );
                    } else if (away.val == false) {
                        this.log.debug(`${allLevels}: ${resident['id']} is not 'away', therefore it is not disabled.`);
                    } else {
                        this.log.info(`${allLevels}: Disabling absent device ${resident['id']}.`);
                        await this.setStateChangedAsync(`${resident['id']}.enabled`, {
                            val: false,
                            ack: false,
                        });
                    }
                });
                break;
            }

            case 'state.enableAll': {
                this.residents.forEach(async resident => {
                    const enabled = await this.getStateAsync(`${resident['id']}.enabled`);

                    if (!enabled) {
                        return;
                    }

                    if (enabled.val == true) {
                        this.log.debug(
                            `${allLevels}: ${resident['id']} is already 'enabled', therefore it is not changed.`,
                        );
                    } else {
                        this.log.info(`${allLevels}: Enabling device ${resident['id']}.`);
                        await this.setStateChangedAsync(`${resident['id']}.enabled`, {
                            val: true,
                            ack: false,
                        });
                    }
                });
                break;
            }

            case 'presence.setHomeAll': {
                this.residents.forEach(async resident => {
                    const enabled = await this.getStateAsync(`${resident['id']}.enabled`);
                    const home = await this.getStateAsync(`${resident['id']}.presence.home`);

                    if (!enabled || !home) {
                        return;
                    }

                    if (home.val == true) {
                        this.log.debug(
                            `${allLevels}: ${resident['id']} is already 'home', therefore it is not changed.`,
                        );
                    } else if (enabled.val == true) {
                        this.log.info(`${allLevels}: Changing ${resident['id']} to 'home'.`);
                        await this.setStateChangedAsync(`${resident['id']}.presence.home`, {
                            val: true,
                            ack: false,
                        });
                    } else {
                        this.log.debug(
                            `${allLevels}: ${
                                resident['id']
                            } is 'disabled', therefore it is excluded from group control.`,
                        );
                    }
                });
                break;
            }

            case 'presence.unsetHomeAll': {
                this.residents.forEach(async resident => {
                    const enabled = await this.getStateAsync(`${resident['id']}.enabled`);
                    const home = await this.getStateAsync(`${resident['id']}.presence.home`);

                    if (!enabled || !home) {
                        return;
                    }

                    if (home.val == false) {
                        this.log.debug(
                            `${allLevels}: ${resident['id']} is already 'away', therefore it is not changed.`,
                        );
                    } else if (enabled.val == true) {
                        this.log.info(`${allLevels}: Changing ${resident['id']} to 'away'.`);
                        await this.setStateChangedAsync(`${resident['id']}.presence.home`, {
                            val: false,
                            ack: false,
                        });
                    } else {
                        this.log.debug(
                            `${allLevels}: ${
                                resident['id']
                            } is 'disabled', therefore it is excluded from group control.`,
                        );
                    }
                });
                break;
            }

            case 'presence.setNightAll': {
                this.residents.forEach(async resident => {
                    const home = await this.getStateAsync(`${resident['id']}.presence.home`);
                    const night = await this.getStateAsync(`${resident['id']}.presence.night`);

                    if (!home || !night) {
                        return;
                    }

                    if (resident['type'] == 'pet') {
                        this.log.debug(`${allLevels}: ${resident['id']} is a pet without night state - ignoring.`);
                    } else if (night.val == true) {
                        this.log.debug(
                            `${allLevels}: ${resident['id']} is already at 'night', therefore it is not changed.`,
                        );
                    } else if (home.val == false) {
                        this.log.debug(
                            `${allLevels}: ${
                                resident['id']
                            } is not 'home', therefore it is excluded from group control.`,
                        );
                    } else {
                        this.log.info(`${allLevels}: Changing ${resident['id']} to 'night'.`);
                        await this.setStateChangedAsync(`${resident['id']}.presence.night`, {
                            val: true,
                            ack: false,
                        });
                    }
                });
                break;
            }

            case 'presence.unsetNightAll': {
                this.residents.forEach(async resident => {
                    const home = await this.getStateAsync(`${resident['id']}.presence.home`);
                    const night = await this.getStateAsync(`${resident['id']}.presence.night`);

                    if (!home || !night) {
                        return;
                    }

                    if (resident['type'] == 'pet') {
                        this.log.debug(`${allLevels}: ${resident['id']} is a pet without night state - ignoring.`);
                    } else if (night.val == false) {
                        this.log.debug(
                            `${allLevels}: ${resident['id']} is already not 'night', therefore it is not changed.`,
                        );
                    } else if (home.val == false) {
                        this.log.debug(
                            `${allLevels}: ${
                                resident['id']
                            } is not 'home', therefore it is excluded from group control.`,
                        );
                    } else {
                        this.log.info(`${allLevels}: Changing ${resident['id']} to not 'night'.`);
                        await this.setStateChangedAsync(`${resident['id']}.presence.night`, {
                            val: false,
                            ack: false,
                        });
                    }
                });
                break;
            }

            case 'presence.setAwayAll': {
                this.residents.forEach(async resident => {
                    const away = await this.getStateAsync(`${resident['id']}.presence.away`);

                    if (!away) {
                        return;
                    }

                    if (away.val == true) {
                        this.log.debug(
                            `${allLevels}: ${resident['id']} is already at 'away', therefore it is not changed.`,
                        );
                    } else {
                        this.log.info(`${allLevels}: Changing ${resident['id']} to 'away'.`);
                        await this.setStateChangedAsync(`${resident['id']}.presence.away`, {
                            val: true,
                            ack: false,
                        });
                    }
                });
                break;
            }

            case 'presence.unsetAwayAll': {
                this.residents.forEach(async resident => {
                    const away = await this.getStateAsync(`${resident['id']}.presence.away`);

                    if (!away) {
                        return;
                    }

                    if (away.val == false) {
                        this.log.debug(
                            `${allLevels}: ${resident['id']} is already at not 'away', therefore it is not changed.`,
                        );
                    } else {
                        this.log.info(`${allLevels}: Changing ${resident['id']} to not 'away'.`);
                        await this.setStateChangedAsync(`${resident['id']}.presence.away`, {
                            val: false,
                            ack: false,
                        });
                    }
                });
                break;
            }

            case 'activity.setOvernightAll': {
                this.residents.forEach(async resident => {
                    const enabled = await this.getStateAsync(`${resident['id']}.enabled`);
                    const overnight = await this.getStateAsync(`${resident['id']}.activity.overnight`);

                    if (!enabled || !overnight) {
                        return;
                    }

                    if (resident['type'] == 'pet') {
                        this.log.debug(`${allLevels}: ${resident['id']} is a pet without night state - ignoring.`);
                    } else if (overnight.val == true) {
                        this.log.debug(
                            `${allLevels}: ${
                                resident['id']
                            } activity 'overnight' is already active, therefore it is not changed.`,
                        );
                    } else if (enabled.val == false) {
                        this.log.debug(
                            `${allLevels}: ${
                                resident['id']
                            } is 'disabled', therefore it is excluded from group control.`,
                        );
                    } else {
                        this.log.info(`${allLevels}: Enabling ${resident['id']}for 'overnight'.`);
                        await this.setStateAsync(`${resident['id']}.activity.overnight`, {
                            val: true,
                            ack: false,
                        });
                    }
                });
                break;
            }

            case 'activity.unsetOvernightAll': {
                this.residents.forEach(async resident => {
                    const enabled = await this.getStateAsync(`${resident['id']}.enabled`);
                    const overnight = await this.getStateAsync(`${resident['id']}.activity.overnight`);

                    if (!enabled || !overnight) {
                        return;
                    }

                    if (resident['type'] == 'pet') {
                        this.log.debug(`${allLevels}: ${resident['id']} is a pet without night state - ignoring.`);
                    } else if (overnight.val == false) {
                        this.log.debug(
                            `${allLevels}: ${
                                resident['id']
                            } activity 'overnight' is already disabled, therefore it is not changed.`,
                        );
                    } else if (enabled.val == false) {
                        this.log.debug(
                            `${allLevels}: ${
                                resident['id']
                            } is 'disabled', therefore it is excluded from group control.`,
                        );
                    } else {
                        this.log.info(`${allLevels}: Disabling ${resident['id']}for 'overnight'.`);
                        await this.setStateAsync(`${resident['id']}.activity.overnight`, {
                            val: false,
                            ack: false,
                        });
                    }
                });
                break;
            }

            case 'activity.resetOvernightAll': {
                this.residents.forEach(async resident => {
                    const enabled = await this.getStateAsync(`${resident['id']}.enabled`);
                    const overnight = await this.getStateAsync(`${resident['id']}.activity.overnight`);
                    const overnightObj = await this.getObjectAsync(`${resident['id']}.activity.overnight`);

                    if (!enabled || !overnight || !overnightObj) {
                        return;
                    }

                    if (resident['type'] == 'pet') {
                        this.log.debug(`${allLevels}: ${resident['id']} is a pet without night state - ignoring.`);
                    } else if (overnight.val == overnightObj.common.def) {
                        this.log.debug(
                            `${allLevels}: ${resident['id']} activity 'overnight' is already ${
                                overnightObj.common.def
                            }, therefore it is not changed.`,
                        );
                    } else if (enabled.val == false) {
                        this.log.debug(
                            `${allLevels}: ${
                                resident['id']
                            } is 'disabled', therefore it is excluded from group control.`,
                        );
                    } else {
                        this.log.info(
                            `${allLevels}: Resetting 'overnight' for ${resident['id']} to ${overnightObj.common.def}.`,
                        );
                        await this.setStateAsync(`${resident['id']}.activity.overnight`, {
                            val: overnightObj.common.def,
                            ack: false,
                        });
                    }
                });
                break;
            }

            case 'activity.setWayhomeAll': {
                this.residents.forEach(async resident => {
                    const wayhome = await this.getStateAsync(`${resident['id']}.activity.wayhome`);
                    const away = await this.getStateAsync(`${resident['id']}.presence.away`);

                    if (!wayhome || !away) {
                        return;
                    }

                    if (resident['type'] == 'pet') {
                        this.log.debug(`${allLevels}: ${resident['id']} is a pet without way home state - ignoring.`);
                    } else if (away.val == false) {
                        this.log.debug(`${allLevels}: ${resident['id']} is already at home - ignoring.`);
                    } else if (wayhome.val == true) {
                        this.log.debug(
                            `${allLevels}: ${
                                resident['id']
                            } activity 'wayhome' is already active, therefore it is not changed.`,
                        );
                    } else {
                        this.log.info(`${allLevels}: Enabling ${resident['id']} for 'wayhome'.`);
                        await this.setStateAsync(`${resident['id']}.activity.wayhome`, {
                            val: true,
                            ack: false,
                        });
                    }
                });
                break;
            }

            case 'activity.unsetWayhomeAll': {
                this.residents.forEach(async resident => {
                    const wayhome = await this.getStateAsync(`${resident['id']}.activity.wayhome`);

                    if (!wayhome) {
                        return;
                    }

                    if (resident['type'] == 'pet') {
                        this.log.debug(`${allLevels}: ${resident['id']} is a pet without way home state - ignoring.`);
                    } else if (wayhome.val == false) {
                        this.log.debug(
                            `${allLevels}: ${
                                resident['id']
                            } activity 'wayhome' is already disabled, therefore it is not changed.`,
                        );
                    } else {
                        this.log.info(`${allLevels}: Disabling ${resident['id']}for 'wayhome'.`);
                        await this.setStateAsync(`${resident['id']}.activity.wayhome`, {
                            val: false,
                            ack: false,
                        });
                    }
                });
                break;
            }

            default: {
                this.log.error(`Received unknown command ${level2}.${level3}`);
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

        if (typeof level1 != 'string' || typeof level2 != 'string') {
            return;
        }

        const oldState = this.states[id] ? this.states[id] : state;
        this.states[id] = state;

        switch (level3) {
            case 'enabled': {
                this.log.debug(`${level2}: Controlling ${id}: ${state.val}`);
                return this.enableResidentDevice(level1, level2, state, oldState);
            }

            case 'activity': {
                if (typeof level4 != 'string') {
                    return false;
                }
                this.log.debug(`${level2}: Controlling ${id}: ${state.val}`);
                return this.setResidentDeviceActivity(level1, level2, level4, state, oldState);
            }

            case 'mood': {
                this.log.debug(`${level2}: Controlling ${id}: ${state.val}`);
                return this.setResidentDeviceMood(level1, level2, state, oldState);
            }

            case 'presence': {
                if (typeof level4 != 'string') {
                    return false;
                }
                this.log.debug(`${level2}: Controlling ${id}: ${state.val}`);
                return this.setResidentDevicePresence(level1, level2, level4, state, oldState);
            }

            case 'presenceFollowing': {
                if (typeof level4 != 'string') {
                    return false;
                }
                this.log.debug(`${level2}: Controlling ${id}: ${state.val}`);
                return this.setResidentDevicePresenceFollowing(level1, level2, level4, state, oldState);
            }

            default: {
                this.log.error(`${level2}: Controlling unknown channel ${level3}`);
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
                    this.log.debug(`${this.namespace}: Received ack'ed update of ${id}: ${state.val}`);
                    this.setResidentsSummary();
                }
                break;
            }

            case 'enabled': {
                if (state.val == true) {
                    this.log.debug(`${this.namespace}: Received ack'ed enablement of ${level2}`);
                    this.setResidentsSummary();
                }
                break;
            }

            case 'mood': {
                if (level4 == 'state') {
                    this.log.debug(`${this.namespace}: Received ack'ed update of ${id}: ${state.val}`);
                    this.setResidentsSummary();
                }
                break;
            }

            case 'presence': {
                if (level4 == 'state') {
                    this.log.debug(`${this.namespace}: Received ack'ed update of ${id}: ${state.val}`);
                    this.setResidentsSummary();
                }
                break;
            }

            case 'presenceFollowing': {
                break;
            }

            default: {
                this.log.error(`${this.namespace}: Received unknown ack'ed update of ${id}: ${state.val}`);
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
        const id = `${residentType}.${device}`;
        const enabledState = await this.getStateAsync(`${id}.enabled`);
        const presenceState = await this.getStateAsync(`${id}.presence.state`);
        const activityState = await this.getStateAsync(`${id}.activity.state`);
        const dndState = await this.getStateAsync(`${id}.activity.dnd`);
        if (
            !enabledState ||
            !presenceState ||
            presenceState.val == undefined ||
            !activityState ||
            activityState.val == undefined ||
            typeof activityState.val != 'number' ||
            !dndState ||
            state.val == undefined
        ) {
            return;
        }

        if (!oldState) {
            oldState = state;
        }
        if (activityState.val >= 10000) {
            activityState.val -= 10000;
        }
        if (command == 'dnd') {
            dndState.val = oldState.val;
        }

        let stateAwake = false;
        let stateBedtime = 0;
        let stateWakeup = false;
        let stateWayhome = false;

        switch (command) {
            case 'state': {
                if (typeof state.val != 'number' || oldState.val == null || typeof oldState.val != 'number') {
                    this.log.error(
                        `${id}.activity.state` +
                            ` has rejected invalid input value type '${typeof state.val}' with value ${state.val}`,
                    );
                    state.ack = true;
                    state.q = 0x01;
                    state.val = oldState.val;
                    await this.setStateAsync(`${id}.activity.state`, state);
                    return;
                }
                if (oldState.val >= 10000) {
                    oldState.val -= 10000;
                }
                let changePresenceToHome = false;
                let changePresenceToAway = false;
                const focusObject = await this.getObjectAsync(`${id}.activity.focus`);

                // 000-0999: Not present at home / Away
                if (state.val < 1000) {
                    changePresenceToAway = true;
                    if (state.val == 2) {
                        stateWayhome = true;
                    }
                } else if (state.val >= 1000 && state.val < 2000) {
                    // 1000-1999: WAKING TIME at home
                    // 1900-1999: WAKING TIME at home: Transitioning to Sleeping Time
                    if (state.val == 1900) {
                        stateBedtime = 1;
                    } else if (state.val == 1901) {
                        stateBedtime = 2;
                    } else if (state.val == 1902) {
                        stateBedtime = 3;
                    }
                } else if (state.val >= 2000 && state.val < 3000) {
                    // 2000-2999: SLEEPING TIME at home
                    // 2000-2099: SLEEPING TIME at home: While I should be sleeping
                    if (state.val >= 2010 && state.val < 2020) {
                        stateAwake = true;
                    } else if (state.val >= 2100 && state.val < 2200) {
                        // 2100-2199: SLEEPING TIME at home: While I should get up
                        stateWakeup = true;
                    } else if (state.val >= 2200) {
                        // 2200-2299: SLEEPING TIME at home: Transitioning to Waking Time
                        stateAwake = true;
                        changePresenceToHome = true;
                    }
                }

                // Enforce DND during night time
                if (presenceState.val == 2) {
                    if (focusObject != undefined) {
                        focusObject.common.states = focusObject.native.states.home;
                    }
                    if (state.val >= 10000) {
                        state.val -= 10000;
                    }
                    if (dndState.val == false) {
                        await this.setStateAsync(`${id}.activity.dnd`, { val: true, ack: true });
                    }
                } else if (presenceState.val == 1) {
                    // Reflect DND in state value when at home and awake
                    if (focusObject != undefined) {
                        focusObject.common.states = focusObject.native.states.home;
                    }
                    if (oldState.val >= 2000) {
                        await this.setStateAsync(`${id}.activity.dnd`, { val: false, ack: true });
                        dndState.val = false;
                    }
                    if (dndState.val == true && state.val < 10000) {
                        state.val += 10000;
                    } else if (dndState.val == false && state.val >= 10000) {
                        state.val -= 10000;
                    }
                } else {
                    // Remove DND in state value when away
                    if (focusObject != undefined) {
                        focusObject.common.states = focusObject.native.states.away;
                    }
                    if (state.val >= 10000) {
                        state.val -= 10000;
                    }
                    if (dndState.val == true) {
                        await this.setStateAsync(`${id}.activity.dnd`, { val: false, ack: true });
                    }
                }

                await this.setStateAsync(`${id}.activity.awake`, { val: stateAwake, ack: true });
                await this.setStateAsync(`${id}.activity.bedtime`, { val: stateBedtime, ack: true });
                await this.setStateAsync(`${id}.activity.wakeup`, { val: stateWakeup, ack: true });
                await this.setStateAsync(`${id}.activity.wayhome`, { val: stateWayhome, ack: true });

                state.ack = true;
                await this.setStateAsync(`${id}.activity.state`, state);

                // Dynamically update common.states for activity.focus
                if (focusObject != undefined) {
                    await this.setObjectAsync(`${id}.activity.focus`, focusObject);
                }

                if (state.val >= 10000) {
                    state.val -= 10000;
                } // remove DND value for activity.focus
                if (state.val < 100 || (state.val >= 300 && state.val < 1100) || state.val >= 1300) {
                    state.val = 0;
                }
                await this.setStateAsync(`${id}.activity.focus`, state);

                if (Number(presenceState.val) === 2 && changePresenceToHome) {
                    await this.setStateAsync(`${id}.presence.night`, { val: false, ack: true });
                    await this.setStateAsync(`${id}.presence.state`, { val: 1, ack: true });
                } else if (Number(presenceState.val) > 0 && changePresenceToAway) {
                    await this.setStateAsync(`${id}.presence.night`, { val: false, ack: true });
                    await this.setStateAsync(`${id}.presence.home`, { val: false, ack: true });
                    await this.setStateAsync(`${id}.presence.away`, { val: true, ack: true });
                    await this.setStateAsync(`${id}.presence.state`, { val: 0, ack: true });
                }
                break;
            }

            case 'awake': {
                if (typeof state.val != 'boolean') {
                    this.log.error(
                        `${id}.activity.awake` +
                            ` has rejected invalid input value type '${typeof state.val}' with value ${state.val}`,
                    );
                    state.ack = true;
                    state.q = 0x01;
                    state.val = oldState.val;
                    await this.setStateAsync(`${id}.activity.awake`, state);
                    return;
                }
                if (activityState.val < 2000) {
                    this.log.warn(`${device}: Awake state can only be controlled during night time`);
                    state.ack = true;
                    state.val = oldState.val;
                    // @ts-expect-error -- TODO: add proper TypeScript types
                    state.q = 0x40;
                    await this.setStateAsync(`${id}.activity.awake`, state);
                } else {
                    let newActivityVal = 1000;
                    if (state.val == true) {
                        // Awake during night >> irregular occurance
                        if (activityState.val == 2000 || activityState.val == 2010 || activityState.val == 2020) {
                            newActivityVal = 2010;
                        } else if (activityState.val >= 2100) {
                            // Awake during wakeup >> got up from sleep
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
                        `${id}.activity.bedtime` +
                            ` has rejected invalid input value type '${typeof state.val}' with value ${state.val}`,
                    );
                    state.ack = true;
                    state.q = 0x01;
                    state.val = oldState.val;
                    await this.setStateAsync(`${id}.activity.bedtime`, state);
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
                    this.log.warn(`${device}: Presence at home is required to start bedtime process`);
                    state.val = 0;
                    // @ts-expect-error -- TODO: add proper TypeScript types
                    state.q = 0x40;
                    await this.setStateAsync(`${id}.activity.bedtime`, state);
                }
                break;
            }

            case 'dnd': {
                if (typeof state.val != 'boolean') {
                    this.log.error(
                        `${id}.activity.dnd` +
                            ` has rejected invalid input value type '${typeof state.val}' with value ${state.val}`,
                    );
                    state.ack = true;
                    state.q = 0x01;
                    state.val = oldState.val;
                    await this.setStateAsync(`${id}.activity.dnd`, state);
                    return;
                }
                state.ack = true;
                if (presenceState.val == 0) {
                    this.log.warn(`${device}: Do Not Disturb can only be controlled during presence at home`);
                    state.val = false;
                    // @ts-expect-error -- TODO: add proper TypeScript types
                    state.q = 0x40;
                } else if (presenceState.val == 2) {
                    this.log.warn(`${device}: Do Not Disturb can not be controlled during night time`);
                    state.val = true;
                    // @ts-expect-error -- TODO: add proper TypeScript types
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
                await this.setStateAsync(`${id}.activity.dnd`, state);
                break;
            }

            case 'overnight': {
                if (typeof state.val != 'boolean') {
                    this.log.error(
                        `${id}.activity.overnight` +
                            ` has rejected invalid input value type '${typeof state.val}' with value ${state.val}`,
                    );
                    state.ack = true;
                    state.q = 0x01;
                    state.val = oldState.val;
                    await this.setStateAsync(`${id}.activity.overnight`, state);
                    return;
                }
                state.ack = true;
                if (state.val == true) {
                    if (enabledState.val == false) {
                        this.log.info(
                            `${device} opted in to the overnight stay and therefore is automatically re-enabled`,
                        );
                        await this.setStateAsync(`${id}.enabled`, { val: true, ack: true });
                    }
                } else if (presenceState.val == 0 && enabledState.val == true) {
                    this.log.info(
                        `${
                            device
                        } has logged out of the overnight stay and therefore automatically deactivated because of being away right now`,
                    );
                    await this.setStateAsync(`${id}.enabled`, { val: false, ack: true });
                    await this.setStateChangedAsync(`${id}.activity.wayhome`, { val: false, ack: false });
                }
                await this.setStateAsync(`${id}.activity.overnight`, state);
                await this.setResidentsSummary();
                break;
            }

            case 'focus': {
                if (typeof state.val != 'number') {
                    this.log.error(
                        `${id}.activity.focus` +
                            ` has rejected invalid input value type '${typeof state.val}' with value ${state.val}`,
                    );
                    state.ack = true;
                    state.q = 0x01;
                    state.val = oldState.val;
                    await this.setStateAsync(`${id}.activity.focus`, state);
                    return;
                }
                if (presenceState.val == 2) {
                    this.log.debug(`${device}: A focus can not be set during night time`);
                    state.ack = true;
                    state.val = oldState.val;
                    // @ts-expect-error -- TODO: add proper TypeScript types
                    state.q = 0x40;
                    await this.setStateAsync(`${id}.activity.focus`, state);
                } else {
                    state.ack = true;
                    if (presenceState.val == 0 && state.val == 0) {
                        state.val = enabledState.val == true ? 1 : 0;
                    }
                    if (presenceState.val == 1 && state.val == 0) {
                        state.val = 1000;
                    }
                    if (presenceState.val == 1 && state.val >= 10000) {
                        if (dndState.val == false) {
                            await this.setStateAsync(`${id}.activity.dnd`, { val: true, ack: true });
                        }
                        state.val -= 10000;
                    } else {
                        if (dndState.val == true) {
                            await this.setStateAsync(`${id}.activity.dnd`, { val: false, ack: true });
                        }
                    }
                    this.setResidentDeviceActivity(residentType, device, 'state', state, activityState);
                }
                break;
            }

            case 'wakeup': {
                if (typeof state.val != 'boolean') {
                    this.log.error(
                        `${id}.activity.wakeup` +
                            ` has rejected invalid input value type '${typeof state.val}' with value ${state.val}`,
                    );
                    state.ack = true;
                    state.q = 0x01;
                    state.val = oldState.val;
                    await this.setStateAsync(`${id}.activity.wakeup`, state);
                    return;
                }
                state.ack = true;
                if (presenceState.val == 2) {
                    await this.setStateAsync(`${id}.activity.wakeup`, state);
                    let newActivityVal = activityState.val >= 2100 ? 2200 : 1000;
                    if (state.val == true) {
                        newActivityVal = activityState.val >= 2100 ? Number(activityState.val) : 2100;
                    }
                    this.setResidentDeviceActivity(
                        residentType,
                        device,
                        'state',
                        { val: newActivityVal, ack: false, ts: state.ts, lc: activityState.lc, from: state.from },
                        activityState,
                    );
                } else {
                    if (state.val == true) {
                        this.log.warn(`${device}: A wake-up alarm can only be triggered during night time at home`);
                        state.val = false;
                        // @ts-expect-error -- TODO: add proper TypeScript types
                        state.q = 0x40;
                    }
                    await this.setStateAsync(`${id}.activity.wakeup`, state);
                }
                break;
            }

            case 'wakeupSnooze': {
                if (typeof state.val != 'boolean') {
                    this.log.error(
                        `${id}.activity.wakeupSnooze` +
                            ` has rejected invalid input value type '${typeof state.val}' with value ${state.val}`,
                    );
                    state.ack = true;
                    state.q = 0x01;
                    state.val = oldState.val;
                    await this.setStateAsync(`${id}.activity.wakeupSnooze`, state);
                    return;
                }
                state.ack = true;
                if (activityState.val >= 2100 && activityState.val < 2200) {
                    let newActivityVal = Number(activityState.val);
                    if (activityState.val < 2105) {
                        newActivityVal++;
                    }
                    this.setResidentDeviceActivity(
                        residentType,
                        device,
                        'state',
                        { val: newActivityVal, ack: false, ts: state.ts, lc: activityState.lc, from: state.from },
                        activityState,
                    );
                } else {
                    this.log.warn(`${device} has no wake-up alarm running that can be snoozed`);
                    state.val = true;
                    state.q = 0x41;
                }
                state.lc = state.ts;
                await this.setStateAsync(`${id}.activity.wakeupSnooze`, state);
                break;
            }

            case 'wayhome': {
                if (typeof state.val != 'boolean') {
                    this.log.error(
                        `${id}.activity.wayhome` +
                            ` has rejected invalid input value type '${typeof state.val}' with value ${state.val}`,
                    );
                    state.ack = true;
                    state.q = 0x01;
                    state.val = oldState.val;
                    await this.setStateAsync(`${id}.activity.wayhome`, state);
                    return;
                }
                const away = await this.getStateAsync(`${device}.presence.away`);
                if (away && away.val == false) {
                    this.log.warn(`${device}: Wayhome state can only be controlled during absence`);
                    state.ack = true;
                    state.val = oldState.val;
                    // @ts-expect-error -- TODO: add proper TypeScript types
                    state.q = 0x40;
                    await this.setStateAsync(`${id}.activity.wayhome`, state);
                    break;
                }

                let newActivityVal = 0;
                if (state.val == true) {
                    if (enabledState.val == false) {
                        await this.setStateAsync(`${id}.enabled`, { val: true, ack: true });
                    }
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
                this.log.warn(`${device}: Controlling unknown activity ${command}`);
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
        const id = `${residentType}.${device}`;
        if (!oldState) {
            oldState = state;
        }
        if (typeof state.val != 'number') {
            this.log.error(
                `${id}.mood.state` +
                    ` has rejected invalid input value type '${typeof state.val}' with value ${state.val}`,
            );
            state.ack = true;
            state.q = 0x01;
            state.val = oldState.val;
            await this.setStateAsync(`${id}.mood.state`, state);
            return;
        }
        const presenceState = await this.getStateAsync(`${id}.presence.state`);
        if (!presenceState || presenceState.val == undefined) {
            return;
        }
        if (!oldState) {
            oldState = state;
        }

        if (presenceState.val != 1) {
            this.log.warn(`${device}: Mood can only be controlled during waking time at home`);
            state.val = oldState.val;
            // @ts-expect-error -- TODO: add proper TypeScript types
            state.q = 0x40;
        }

        state.ack = true;
        await this.setStateAsync(`${id}.mood.state`, state);
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
        const id = `${residentType}.${device}`;
        const enabledState = await this.getStateAsync(`${id}.enabled`);
        const presenceState = await this.getStateAsync(`${id}.presence.state`);
        const activityState = await this.getStateAsync(`${id}.activity.state`);
        const overnightState = await this.getStateAsync(`${id}.activity.overnight`);
        if (!enabledState || !presenceState || presenceState.val == undefined) {
            return;
        }

        if (
            activityState &&
            activityState.val != null &&
            typeof activityState.val == 'number' &&
            activityState.val >= 10000
        ) {
            activityState.val -= 10000;
        }
        if (!oldState) {
            oldState = state;
        }

        let stateNight = false;
        let stateHome = false;
        let stateActivity = 0;

        switch (command) {
            case 'state': {
                if (typeof state.val != 'number') {
                    this.log.error(
                        `${id}.presence.state` +
                            ` has rejected invalid input value type '${typeof state.val}' with value ${state.val}`,
                    );
                    state.ack = true;
                    state.q = 0x01;
                    state.val = oldState.val;
                    await this.setStateAsync(`${id}.presence.state`, state);
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

                    if (residentType != 'pet' && oldState.val == 2) {
                        await this.setStateChangedAsync(`${id}.info.presence.lastAwoken`, {
                            val: last,
                            ack: true,
                            ts: state.ts,
                            lc: state.ts,
                            from: state.from,
                        });
                    }

                    switch (state.val) {
                        case 0: {
                            await this.setStateChangedAsync(`${id}.info.presence.lastAway`, {
                                val: last,
                                ack: true,
                                ts: state.ts,
                                lc: state.ts,
                                from: state.from,
                            });
                            break;
                        }
                        case 1: {
                            if (oldState.val == 0) {
                                await this.setStateChangedAsync(`${id}.info.presence.lastHome`, {
                                    val: last,
                                    ack: true,
                                    ts: state.ts,
                                    lc: state.ts,
                                    from: state.from,
                                });
                            }
                            break;
                        }
                        case 2: {
                            if (residentType != 'pet') {
                                await this.setStateChangedAsync(`${id}.info.presence.lastNight`, {
                                    val: last,
                                    ack: true,
                                    ts: state.ts,
                                    lc: state.ts,
                                    from: state.from,
                                });
                            }
                            break;
                        }
                    }
                }

                // Disable immediately if no overnight stay planned
                if (overnightState && overnightState.val == false && state.val == 0) {
                    this.log.info(`${device} disabled during away event due to planned absence this night`);
                    await this.setStateChangedAsync(`${id}.enabled`, { val: false, ack: true });
                    enabledState.val = false;
                }

                if (enabledState.val == true) {
                    stateActivity = 1;
                }

                // Always reset mood if presence state was changed
                if (residentType != 'pet' && state.val != oldState.val) {
                    await this.setStateChangedAsync(`${id}.mood.state`, { val: 5, ack: true });
                }

                // When present at home
                if (state.val > 0) {
                    stateHome = true;

                    // When at sleep
                    if (state.val == 2) {
                        stateNight = true;

                        // change activity state to the correct range
                        if (activityState && activityState.val != undefined && typeof activityState.val == 'number') {
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
                    } else if (
                        activityState &&
                        activityState.val != undefined &&
                        typeof activityState.val == 'number'
                    ) {
                        // Activity change from away to home or when transitioning from night to home
                        if (activityState.val < 1000 || activityState.val >= 2200) {
                            stateActivity = 1000;
                        } else if (activityState.val > 2000) {
                            // Activity change any running wake-up program
                            stateActivity = 2200;
                        } else if (activityState.val == 2000) {
                            // Activity change from night to home = Implicit awakening state
                            stateActivity = 2210;
                        } else {
                            // Don't change any other activity during waking time at home
                            stateActivity = Number(activityState.val);
                        }
                    }

                    await this.setStateChangedAsync(`${id}.enabled`, { val: true, ack: true });
                } else {
                    // Keep any absence activity
                    if (
                        enabledState.val == true &&
                        activityState &&
                        activityState.val != undefined &&
                        Number(activityState.val) < 1000
                    ) {
                        stateActivity = Number(activityState.val);
                    }
                }

                await this.setStateAsync(`${id}.presence.home`, { val: stateHome, ack: true });
                await this.setStateAsync(`${id}.presence.away`, { val: !stateHome, ack: true });
                if (residentType != 'pet') {
                    await this.setStateAsync(`${id}.presence.night`, { val: stateNight, ack: true });
                }
                state.ack = true;
                await this.setStateAsync(`${id}.presence.state`, state);
                if (activityState) {
                    await this.setResidentDeviceActivity(
                        residentType,
                        device,
                        'state',
                        {
                            val: stateActivity,
                            ack: false,
                            from: `system.adapter.${this.namespace}`,
                            ts: state.ts,
                            lc: state.lc,
                        },
                        activityState,
                    );
                }

                // Presence forwarding for followers
                const objId = `${this.namespace}.${id}.presence.state`;
                state.ack = false;
                state.from = `${this.namespace}.${id}`;
                if (this.presenceFollowingMapping[objId] != undefined) {
                    if (oldState.val == 0 && state.val == 1) {
                        if (this.presenceFollowingMapping[objId]['arriving'] != undefined) {
                            this.presenceFollowingMapping[objId]['arriving'].forEach(async resident => {
                                const enabledState = await this.getForeignStateAsync(`${resident}.enabled`);
                                const presenceState = await this.getForeignStateAsync(`${resident}.presence.state`);
                                if (enabledState == undefined || presenceState == undefined) {
                                    this.log.error(`${id}: Bogus presence forwarding reference to ${resident}`);
                                } else if (enabledState.val != true) {
                                    this.log.debug(`${id}: ${resident} is disabled, skipped presence forwarding`);
                                } else if (presenceState.val != 0) {
                                    this.log.debug(`${id}: ${resident} is not away, skipped presence forwarding`);
                                } else {
                                    this.log.info(`${id}: Forwarding arriving at home to ${resident}`);
                                    this.setForeignStateChangedAsync(`${resident}.presence.state`, state);
                                }
                            });
                        }
                    } else if (oldState.val != 0 && state.val == 0) {
                        if (this.presenceFollowingMapping[objId]['leaving'] != undefined) {
                            this.presenceFollowingMapping[objId]['leaving'].forEach(async resident => {
                                const enabledState = await this.getForeignStateAsync(`${resident}.enabled`);
                                const presenceState = await this.getForeignStateAsync(`${resident}.presence.state`);
                                if (enabledState == undefined || presenceState == undefined) {
                                    this.log.error(`${id}: Bogus presence forwarding reference to ${resident}`);
                                } else if (enabledState.val != true) {
                                    this.log.debug(`${id}: ${resident} is disabled, skipped presence forwarding`);
                                } else if (presenceState.val != 1) {
                                    this.log.debug(
                                        `${id}: ${resident} is not awake at home, skipped presence forwarding`,
                                    );
                                } else {
                                    this.log.info(`${id}: Forwarding leaving home to ${resident}`);
                                    this.setForeignStateChangedAsync(`${resident}.presence.state`, state);
                                }
                            });
                        }
                    } else if (oldState.val != 2 && state.val == 2) {
                        if (this.presenceFollowingMapping[objId]['sleeping'] != undefined) {
                            this.presenceFollowingMapping[objId]['sleeping'].forEach(async resident => {
                                const enabledState = await this.getForeignStateAsync(`${resident}.enabled`);
                                const presenceState = await this.getForeignStateAsync(`${resident}.presence.state`);
                                if (enabledState == undefined || presenceState == undefined) {
                                    this.log.error(`${id}: Bogus presence forwarding reference to ${resident}`);
                                } else if (enabledState.val != true) {
                                    this.log.debug(`${id}: ${resident} is disabled, skipped presence forwarding`);
                                } else if (presenceState.val != 1) {
                                    this.log.debug(
                                        `${id}: ${resident} is not awake at home, skipped presence forwarding`,
                                    );
                                } else {
                                    this.log.info(`${id}: Forwarding sleeping to ${resident}`);
                                    this.setForeignStateChangedAsync(`${resident}.presence.state`, state);
                                }
                            });
                        }
                    } else if (oldState.val == 2 && state.val == 1) {
                        if (this.presenceFollowingMapping[objId]['wakeup'] != undefined) {
                            this.presenceFollowingMapping[objId]['wakeup'].forEach(async resident => {
                                const enabledState = await this.getForeignStateAsync(`${resident}.enabled`);
                                const presenceState = await this.getForeignStateAsync(`${resident}.presence.state`);
                                if (enabledState == undefined || presenceState == undefined) {
                                    this.log.error(`${id}: Bogus presence forwarding reference to ${resident}`);
                                } else if (enabledState.val != true) {
                                    this.log.debug(`${id}: ${resident} is disabled, skipped presence forwarding`);
                                } else if (presenceState.val != 2) {
                                    this.log.debug(
                                        `${id}: ${resident} is not asleep at home, skipped presence forwarding`,
                                    );
                                } else {
                                    this.log.info(`${id}: Forwarding wakeup to ${resident}`);
                                    this.setForeignStateChangedAsync(`${resident}.presence.state`, state);
                                }
                            });
                        }
                    }
                }
                break;
            }

            case 'home': {
                if (typeof state.val != 'boolean') {
                    this.log.error(
                        `${id}.presence.home` +
                            ` has rejected invalid input value type '${typeof state.val}' with value ${state.val}`,
                    );
                    state.ack = true;
                    state.q = 0x01;
                    state.val = oldState.val;
                    await this.setStateAsync(`${id}.presence.state`, state);
                    return;
                }
                state.val = state.val == true ? 1 : 0;
                if (this.initialized) {
                    await this.setStateAsync(`${id}.presence.state`, state);
                } else {
                    this.setResidentDevicePresence(residentType, device, 'state', state);
                }
                break;
            }

            case 'night': {
                if (typeof state.val != 'boolean') {
                    this.log.error(
                        `${id}.presence.night` +
                            ` has rejected invalid input value type '${typeof state.val}' with value ${state.val}`,
                    );
                    state.ack = true;
                    state.q = 0x01;
                    state.val = oldState.val;
                    await this.setStateAsync(`${id}.presence.state`, state);
                    return;
                }
                if (state.val == true) {
                    state.val = 2;
                } else {
                    state.val = Number(presenceState.val) > 0 ? 1 : 0;
                }
                await this.setStateAsync(`${id}.presence.state`, state);
                break;
            }

            case 'away': {
                if (typeof state.val != 'boolean') {
                    this.log.error(
                        `${id}.presence.away` +
                            ` has rejected invalid input value type '${typeof state.val}' with value ${state.val}`,
                    );
                    state.ack = true;
                    state.q = 0x01;
                    state.val = oldState.val;
                    await this.setStateAsync(`${id}.presence.state`, state);
                    return;
                }
                state.val = state.val == true ? 0 : 1;
                await this.setStateAsync(`${id}.presence.state`, state);
                break;
            }

            default: {
                this.log.warn(`${id}: Controlling unknown presence ${command}`);
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
        const id = `${residentType}.${device}`;
        const fullId = `${this.namespace}.${id}`;
        if (!oldState) {
            oldState = state;
        }

        switch (command) {
            case 'homeEnabled':
            case 'nightEnabled': {
                if (state.val == true) {
                    let followPerson = null;
                    if (command == 'homeEnabled') {
                        followPerson = await this.getStateAsync(`${id}.presenceFollowing.homePerson`);
                    }
                    if (command == 'nightEnabled') {
                        followPerson = await this.getStateAsync(`${id}.presenceFollowing.nightPerson`);
                    }

                    if (
                        followPerson == undefined ||
                        followPerson.val == '' ||
                        followPerson.val == 'none' ||
                        followPerson.val == 'nobody'
                    ) {
                        if (command == 'homeEnabled') {
                            this.log.warn(
                                `${device}: Home presence following can not be enabled: Set a person to follow first`,
                            );
                        }
                        if (command == 'nightEnabled') {
                            this.log.warn(
                                `${device}: Night presence following can not be enabled: Set a person to follow first`,
                            );
                        }
                        state.val = false;
                        // @ts-expect-error -- TODO: add proper TypeScript types
                        state.q = 0x40;
                        break;
                    }

                    const followPersonObj = await this.getForeignObjectAsync(String(followPerson.val));
                    if (
                        followPersonObj == undefined ||
                        followPersonObj.type != 'device' ||
                        !followPersonObj._id.startsWith('residents.')
                    ) {
                        if (command == 'homeEnabled') {
                            this.log.error(
                                `${device}: Home presence following: Invalid homePerson value: ${followPerson.val}`,
                            );
                        }
                        if (command == 'nightEnabled') {
                            this.log.error(
                                `${device}: Night presence following: Invalid nightPerson value: ${followPerson.val}`,
                            );
                        }
                        state.val = false;
                        // @ts-expect-error -- TODO: add proper TypeScript types
                        state.q = 0x40;
                        break;
                    }

                    let followMode = null;
                    if (command == 'homeEnabled') {
                        followMode = await this.getStateAsync(`${id}.presenceFollowing.homeMode`);
                    }
                    if (command == 'nightEnabled') {
                        followMode = await this.getStateAsync(`${id}.presenceFollowing.nightMode`);
                    }
                    if (followMode == undefined) {
                        if (command == 'homeEnabled') {
                            this.log.error(`${device}: Home presence following: Missing mode definition`);
                        }
                        if (command == 'nightEnabled') {
                            this.log.error(`${device}: Night presence following: Missing mode definition`);
                        }
                        state.val = false;
                        // @ts-expect-error -- TODO: add proper TypeScript types
                        state.q = 0x40;
                        break;
                    }

                    if (command == 'homeEnabled') {
                        this.log.info(`${device}: Following home presence of ${followPerson.val}`);
                    }
                    if (command == 'nightEnabled') {
                        this.log.info(`${device}: Following night presence of ${followPerson.val}`);
                    }
                    const objId = `${followPerson.val}.presence.state`;

                    if (this.presenceFollowingMapping[objId] == undefined) {
                        this.presenceFollowingMapping[objId] = {};
                    }

                    if (command == 'homeEnabled') {
                        if (this.presenceFollowingMapping[objId]['arriving'] == undefined) {
                            this.presenceFollowingMapping[objId]['arriving'] = [];
                        }
                        if (followMode.val == 0 || followMode.val == 1) {
                            this.presenceFollowingMapping[objId]['arriving'].push(fullId);
                        }

                        if (this.presenceFollowingMapping[objId]['leaving'] == undefined) {
                            this.presenceFollowingMapping[objId]['leaving'] = [];
                        }
                        if (followMode.val == 0 || followMode.val == 2) {
                            this.presenceFollowingMapping[objId]['leaving'].push(fullId);
                        }
                    }

                    if (command == 'nightEnabled') {
                        if (this.presenceFollowingMapping[objId]['sleeping'] == undefined) {
                            this.presenceFollowingMapping[objId]['sleeping'] = [];
                        }
                        if (followMode.val == 0 || followMode.val == 1) {
                            this.presenceFollowingMapping[objId]['sleeping'].push(fullId);
                        }

                        if (this.presenceFollowingMapping[objId]['wakeup'] == undefined) {
                            this.presenceFollowingMapping[objId]['wakeup'] = [];
                        }
                        if (followMode.val == 0 || followMode.val == 2) {
                            this.presenceFollowingMapping[objId]['wakeup'].push(fullId);
                        }
                    }

                    if (!String(followPerson.val).startsWith(this.namespace)) {
                        const stateList = await this.getForeignStatesAsync(String(followPerson.val));
                        for (const id in stateList) {
                            this.states[id] = stateList[id];
                            this.log.silly(`Subscribing to foreign events for ${id}`);
                            this.subscribeForeignStates(id);
                        }
                    }
                } else {
                    if (command == 'homeEnabled') {
                        this.log.info(`${device}: Disabled home presence following`);
                    }
                    if (command == 'nightEnabled') {
                        this.log.info(`${device}: Disabled night following`);
                    }

                    for (const objId in this.presenceFollowingMapping) {
                        if (
                            command == 'homeEnabled' &&
                            this.presenceFollowingMapping[objId]['arriving'] != undefined &&
                            this.presenceFollowingMapping[objId]['arriving'].includes(fullId)
                        ) {
                            this.presenceFollowingMapping[objId]['arriving'].splice(
                                this.presenceFollowingMapping[objId]['arriving'].indexOf(fullId),
                                1,
                            );
                        }

                        if (
                            command == 'homeEnabled' &&
                            this.presenceFollowingMapping[objId]['leaving'] != undefined &&
                            this.presenceFollowingMapping[objId]['leaving'].includes(fullId)
                        ) {
                            this.presenceFollowingMapping[objId]['leaving'].splice(
                                this.presenceFollowingMapping[objId]['leaving'].indexOf(fullId),
                                1,
                            );
                        }

                        if (
                            command == 'nightEnabled' &&
                            this.presenceFollowingMapping[objId]['sleeping'] != undefined &&
                            this.presenceFollowingMapping[objId]['sleeping'].includes(fullId)
                        ) {
                            this.presenceFollowingMapping[objId]['sleeping'].splice(
                                this.presenceFollowingMapping[objId]['sleeping'].indexOf(fullId),
                                1,
                            );
                        }

                        if (
                            command == 'nightEnabled' &&
                            this.presenceFollowingMapping[objId]['wakeup'] != undefined &&
                            this.presenceFollowingMapping[objId]['wakeup'].includes(fullId)
                        ) {
                            this.presenceFollowingMapping[objId]['wakeup'].splice(
                                this.presenceFollowingMapping[objId]['wakeup'].indexOf(fullId),
                                1,
                            );
                        }
                    }
                }

                break;
            }

            case 'homeMode':
            case 'nightMode':
            case 'homePerson':
            case 'nightPerson': {
                if (['homeMode', 'nightMode'].includes(command) && ![0, 1, 2].includes(Number(state.val))) {
                    if (command == 'homeMode') {
                        this.log.error(`${device}: Home presence following: Invalid homeMode value: ${state.val}`);
                    }
                    if (command == 'nightMode') {
                        this.log.error(`${device}: Night presence following: Invalid nightMode value: ${state.val}`);
                    }
                    state.val = oldState.val;
                    // @ts-expect-error -- TODO: add proper TypeScript types
                    state.q = 0x40;
                    break;
                }

                if (['homePerson', 'nightPerson'].includes(command) && state.val != '') {
                    const followPersonObj = await this.getForeignObjectAsync(String(state.val));
                    if (
                        followPersonObj == undefined ||
                        followPersonObj.type != 'device' ||
                        !followPersonObj._id.startsWith('residents.')
                    ) {
                        if (command == 'homePerson') {
                            this.log.error(
                                `${device}: Home presence following: Invalid homePerson value: ${state.val}`,
                            );
                        }
                        if (command == 'nightPerson') {
                            this.log.error(
                                `${device}: Night presence following: Invalid nightPerson value: ${state.val}`,
                            );
                        }
                        state.val = oldState.val;
                        // @ts-expect-error -- TODO: add proper TypeScript types
                        state.q = 0x40;
                        break;
                    }
                }

                state.ack = true;
                await this.setStateAsync(`${id}.presenceFollowing.${command}`, state);

                let enabledState = null;
                if (['homeMode', 'homePerson'].includes(command)) {
                    enabledState = await this.getStateAsync(`${id}.presenceFollowing.homeEnabled`);
                }
                if (['nightMode', 'nightPerson'].includes(command)) {
                    enabledState = await this.getStateAsync(`${id}.presenceFollowing.nightEnabled`);
                }
                if (enabledState != undefined && enabledState.val == true) {
                    if (['homePerson', 'nightPerson'].includes(command) && state.val == '') {
                        state.ack = false;
                        state.val = false;
                        if (command == 'homePerson') {
                            await this.setStateAsync(`${id}.presenceFollowing.homeEnabled`, state);
                        }
                        if (command == 'nightPerson') {
                            await this.setStateAsync(`${id}.presenceFollowing.nightEnabled`, state);
                        }
                    } else {
                        for (const objId in this.presenceFollowingMapping) {
                            if (
                                ['homePerson', 'homeMode'].includes(command) &&
                                this.presenceFollowingMapping[objId]['arriving'] != undefined &&
                                this.presenceFollowingMapping[objId]['arriving'].includes(fullId)
                            ) {
                                this.presenceFollowingMapping[objId]['arriving'].splice(
                                    this.presenceFollowingMapping[objId]['arriving'].indexOf(fullId),
                                    1,
                                );
                            }

                            if (
                                ['homePerson', 'homeMode'].includes(command) &&
                                this.presenceFollowingMapping[objId]['leaving'] != undefined &&
                                this.presenceFollowingMapping[objId]['leaving'].includes(fullId)
                            ) {
                                this.presenceFollowingMapping[objId]['leaving'].splice(
                                    this.presenceFollowingMapping[objId]['leaving'].indexOf(fullId),
                                    1,
                                );
                            }

                            if (
                                ['nightPerson', 'nightMode'].includes(command) &&
                                this.presenceFollowingMapping[objId]['sleeping'] != undefined &&
                                this.presenceFollowingMapping[objId]['sleeping'].includes(fullId)
                            ) {
                                this.presenceFollowingMapping[objId]['sleeping'].splice(
                                    this.presenceFollowingMapping[objId]['sleeping'].indexOf(fullId),
                                    1,
                                );
                            }

                            if (
                                ['nightPerson', 'nightMode'].includes(command) &&
                                this.presenceFollowingMapping[objId]['wakeup'] != undefined &&
                                this.presenceFollowingMapping[objId]['wakeup'].includes(fullId)
                            ) {
                                this.presenceFollowingMapping[objId]['wakeup'].splice(
                                    this.presenceFollowingMapping[objId]['wakeup'].indexOf(fullId),
                                    1,
                                );
                            }
                        }

                        state.ack = false;
                        state.val = true;
                        if (['homePerson', 'homeMode'].includes(command)) {
                            this.setStateAsync(`${id}.presenceFollowing.homeEnabled`, state);
                        }
                        if (['nightPerson', 'nightMode'].includes(command)) {
                            this.setStateAsync(`${id}.presenceFollowing.nightEnabled`, state);
                        }
                    }
                }

                return;
            }
        }

        state.ack = true;
        await this.setStateAsync(`${id}.presenceFollowing.${command}`, state);
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
        if (!stateObj) {
            return false;
        }
        let type = stateObj.common.type;
        let presence = null;

        if (stateObj.type != 'state') {
            this.log.error(`${id}: Object needs to be a state datapoint to enable presence monitoring`);
            return false;
        } else if (
            type != 'boolean' &&
            type != 'number' &&
            type != 'string' &&
            type != 'mixed' &&
            // @ts-expect-error -- TODO: add proper TypeScript types
            type != 'json'
        ) {
            this.log.error(
                `${
                    id
                }: Monitored presence datapoint needs to be of type 'boolean', 'number', 'string', 'mixed', or 'json'`,
            );
            return false;
        }

        if (type == 'mixed' || type == 'string') {
            if (stateObj.common.role == 'json' || id.split('.').at(-1)?.toLowerCase() == 'json') {
                type = 'json';
            } else {
                type = this.getDatatypeFromString(state.val);
            }
            if (type == null) {
                this.log.error(`${id}: Monitored presence datapoint seems inappropriate due to unknown string format`);
                return false;
            }
            this.log.silly(`${id}: Interpreting presence datapoint as type '${type}'`);
        }

        switch (type) {
            case 'boolean': {
                presence = Boolean(state.val);
                break;
            }

            case 'number': {
                if (stateObj.common.min != undefined && stateObj.common.min != 0) {
                    this.log.error(
                        `${id}: Monitored presence datapoint seems inappropriate with minimum value of ${
                            stateObj.common.min
                        }`,
                    );
                    return false;
                }
                if (stateObj.common.max != undefined && stateObj.common.max != 1) {
                    this.log.error(
                        `${id}: Monitored presence datapoint seems inappropriate with maximum value of ${
                            stateObj.common.max
                        }`,
                    );
                    return false;
                }
                presence = Number(state.val) == 1 ? true : false;
                break;
            }

            case 'json': {
                const [err, jsonObj] = this.safeJsonParse(state.val);
                if (err) {
                    this.log.error(`${id}: Failed to parse JSON: ${err.message}`);
                    return false;
                }
                let jsonPresenceVal = null;
                if (jsonObj.entry != undefined) {
                    jsonPresenceVal = jsonObj.entry;
                } else if (jsonObj.presence != undefined) {
                    jsonPresenceVal = jsonObj.presence;
                } else if (jsonObj.present != undefined) {
                    jsonPresenceVal = jsonObj.present;
                }
                if (jsonPresenceVal != null) {
                    type = this.getDatatypeFromString(jsonPresenceVal);
                }
                if (type == null || type == 'json') {
                    this.log.error(`${id}: JSON does not contain any expected property or value`);
                    return false;
                }
                state.val = jsonPresenceVal;

                // if there is a date/time delivered, take this over instead of our time
                const regexISO8601 =
                    /^(\d{4})(?:-(\d{2}))??(?:-(\d{2}))??T(\d{2}):(\d{2})(?::(\d{2}))??(?:\.(\d+))??((?:[+-]{1}\d{2}:\d{2})|Z)??$/;
                if (jsonObj.date != undefined && typeof jsonObj.date == 'string' && jsonObj.date.match(regexISO8601)) {
                    try {
                        state.ts = new Date(jsonObj.date).getTime();
                    } catch {
                        //
                    }
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
            this.log.error(`${id}: Unable to determine presence state value`);
        } else if (dryrun) {
            // Validate datapoint only
            return true;
        } else if (this.presenceSubscriptionMapping[id]) {
            // Presence update
            for (const deviceId in this.presenceSubscriptionMapping[id]) {
                const device = this.presenceSubscriptionMapping[id][deviceId].split('.');
                if (this.initialized) {
                    this.log.info(`${id}: Detected presence update for ${device[1]}: ${presence}`);
                }
                state.val = presence;
                state.ack = false;
                await this.setResidentDevicePresence(device[0], device[1], 'home', state);
            }
        } else if (this.wayhomeSubscriptionMapping[id]) {
            // Way Home activity update
            for (const deviceId in this.wayhomeSubscriptionMapping[id]) {
                const device = this.wayhomeSubscriptionMapping[id][deviceId].split('.');
                if (this.initialized) {
                    this.log.info(`${id}: Detected way home update for ${device[1]}: ${presence}`);
                }
                state.val = presence;
                state.ack = false;
                await this.setResidentDeviceActivity(device[0], device[1], 'wayhome', state);
            }
        } else {
            this.log.error(`${id}: Presence update event has no matching device`);
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
        const id = `${residentType}.${device}`;
        if (!oldState) {
            oldState = state;
        }
        if (typeof state.val != 'boolean') {
            this.log.error(
                `${id}.enabled` +
                    ` has rejected invalid input value type '${typeof state.val}' with value ${state.val}`,
            );
            state.ack = true;
            state.q = 0x01;
            state.val = oldState.val;
            await this.setStateAsync(`${id}.enabled`, state);
            return;
        }
        await this.setStateAsync(`${id}.enabled`, { val: state.val, ack: true, from: state.from });
        if (oldState.val != state.val) {
            if (state.val == true) {
                if (residentType != 'pet') {
                    oldState.val = this.states[`${id}.activity.state`];
                    state.val = 1;
                    this.states[`${id}.activity.state`] = state.val;
                    await this.setResidentDeviceActivity(residentType, device, 'state', state, oldState);
                }
            } else {
                oldState.val = this.states[`${id}.presence.state`];
                state.val = 0;
                this.states[`${id}.presence.state`] = state.val;
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
            const enabledState = await this.getStateAsync(`${resident['id']}.enabled`);
            const awayState = await this.getStateAsync(`${resident['id']}.presence.away`);
            const homeState = await this.getStateAsync(`${resident['id']}.presence.home`);
            const activityState = await this.getStateAsync(`${resident['id']}.activity.state`);
            if (activityState != undefined && typeof activityState.val == 'number' && activityState.val >= 10000) {
                activityState.val -= 10000;
            }
            const overnightState = await this.getStateAsync(`${resident['id']}.activity.overnight`);
            const presenceState = await this.getStateAsync(`${resident['id']}.presence.state`);
            const moodState = await this.getStateAsync(`${resident['id']}.mood.state`);
            const dndState = await this.getStateAsync(`${resident['id']}.activity.dnd`);
            const fullId = `${this.namespace}.${resident['id']}`;

            if (
                enabledState == undefined ||
                typeof enabledState.val != 'boolean' ||
                presenceState == undefined ||
                typeof presenceState.val != 'number' ||
                homeState == undefined ||
                typeof homeState.val != 'boolean' ||
                awayState == undefined ||
                typeof awayState.val != 'boolean'
            ) {
                continue;
            }

            this.log.debug(`  Checking on ${name} ...`);

            if (
                enabledState.val == true &&
                overnightState != undefined &&
                typeof overnightState.val == 'boolean' &&
                overnightState.val == true
            ) {
                this.log.debug('    - does overnight');
                overnightSum.push({
                    name: name,
                    id: fullId,
                    tc: overnightState.lc,
                    icon: resident['icon'],
                    iconAndName: resident['iconAndName'],
                });
            }

            // When present at home
            if (presenceState.val >= 1) {
                this.log.debug('    - is at home');

                if (residentType == 'pet') {
                    totalPetCount++;
                    petHomeSum.push({
                        name: name,
                        id: fullId,
                        tc: homeState.lc,
                        icon: resident['icon'],
                        iconAndName: resident['iconAndName'],
                    });
                } else {
                    totalResidentsCount++;
                    homeSum.push({
                        name: name,
                        id: fullId,
                        tc: homeState.lc,
                        icon: resident['icon'],
                        iconAndName: resident['iconAndName'],
                    });
                }

                if (moodState != undefined && typeof moodState.val == 'number') {
                    moodCount += moodState.val - 5;
                }

                if (dndState != undefined && dndState.val == true) {
                    this.log.debug('    - does not want to be disturbed');
                    dndSum.push({
                        name: name,
                        id: fullId,
                        tc: dndState.lc,
                        icon: resident['icon'],
                        iconAndName: resident['iconAndName'],
                    });
                }

                // When at sleep
                if (presenceState.val == 2) {
                    this.log.debug('    - is at sleep');
                    nightSum.push({
                        name: name,
                        id: fullId,
                        tc: presenceState.lc,
                        icon: resident['icon'],
                        iconAndName: resident['iconAndName'],
                    });
                }

                // Activity mapping
                if (activityState != undefined) {
                    switch (activityState.val) {
                        case 1900:
                            this.log.debug('    - is winding down');
                            winddownSum.push({
                                name: name,
                                id: fullId,
                                tc: activityState.lc,
                                icon: resident['icon'],
                                iconAndName: resident['iconAndName'],
                            });
                            break;

                        case 1901:
                        case 1902:
                            this.log.debug('    - is going to bed');
                            bedtimeSum.push({
                                name: name,
                                id: fullId,
                                tc: activityState.lc,
                                icon: resident['icon'],
                                iconAndName: resident['iconAndName'],
                            });
                            break;

                        case 2010:
                            this.log.debug('    - is walking at night');
                            nightwalkSum.push({
                                name: name,
                                id: fullId,
                                tc: activityState.lc,
                                icon: resident['icon'],
                                iconAndName: resident['iconAndName'],
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
                                id: fullId,
                                tc: activityState.lc,
                                icon: resident['icon'],
                                iconAndName: resident['iconAndName'],
                            });
                            break;

                        case 2200:
                        case 2210:
                            this.log.debug('    - just got up from sleep');
                            gotupSum.push({
                                name: name,
                                id: fullId,
                                tc: activityState.lc,
                                icon: resident['icon'],
                                iconAndName: resident['iconAndName'],
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
                    awaySum.push({
                        name: name,
                        id: fullId,
                        tc: awayState.lc,
                        icon: resident['icon'],
                        iconAndName: resident['iconAndName'],
                    });

                    // When on way home
                    if (activityState != undefined && activityState.val == 2) {
                        wayhomeSum.push({
                            name: name,
                            id: fullId,
                            tc: activityState.lc,
                            icon: resident['icon'],
                            iconAndName: resident['iconAndName'],
                        });
                    }
                } else {
                    // When absent from home for longer period
                    this.log.debug('    - is disabled');
                    disabledSum.push({
                        name: name,
                        id: fullId,
                        tc: enabledState.lc,
                        icon: resident['icon'],
                        iconAndName: resident['iconAndName'],
                    });
                }
            }
        }

        this.log.debug(
            `  Completed loop-through of ${totalResidentsCount + totalPetCount + disabledSum.length} resident devices.`,
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
        if (petHomeSum.length > 0) {
            residentsStateVal = 2;
        }
        if (totalResidentsCount > 0) {
            residentsStateVal = 1;
            if (petHomeSum.length > 0) {
                residentsStateVal = 2;
            }
            if (wayhomeSum.length > 0) {
                residentsStateVal = 3;
            }
            if (homeSum.length > 0) {
                residentsStateVal = 4;
                if (dndSum.length > 0 && dndSum.length == homeSum.length) {
                    residentsStateVal = 5;
                }
                if (winddownSum.length > 0) {
                    residentsStateVal = 6;
                }

                // TODO: Only in the evening, not after wakeup?
                if (nightSum.length > 0 && nightSum.length != homeSum.length) {
                    residentsStateVal = 6;
                }
                if (bedtimeSum.length > 0 && bedtimeSum.length == homeSum.length) {
                    residentsStateVal = 7;
                }

                if (nightSum.length > 0 && nightSum.length == homeSum.length) {
                    residentsStateVal = 11;
                }
                if (wakeupSum.length > 0) {
                    residentsStateVal = 10;
                }
                if (nightwalkSum.length > 0) {
                    residentsStateVal = 9;
                }
                if (gotupSum.length > 0) {
                    residentsStateVal = 8;
                }
                if (bedtimeSum.length > 0 && winddownSum.length == 0 && nightSum.length > 0) {
                    residentsStateVal = 7;
                }
            }
        }

        this.log.debug(`  Calculated residential state: ${residentsStateVal}`);
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

                const parentState = await this.getForeignStateAsync(`${parentInstance}.state`);
                if (!parentState || parentState.val == undefined) {
                    continue;
                }

                // For presence at home, aim for the lower (= more awake) number
                if (groupStateVal >= 4 && typeof parentState.val == 'number' && parentState.val >= 4) {
                    if (parentState.val < groupStateVal) {
                        leadingInstance = parentInstance;
                        this.log.debug(
                            `  Group state: Leading lower parent value from ${parentInstance}: ${parentState.val}`,
                        );
                        groupStateVal = Number(parentState.val);
                    }

                    const moodState = await this.getForeignStateAsync(`${parentInstance}.mood`);
                    if (moodState && typeof moodState.val == 'number') {
                        moodFoundCounter++;
                        groupMood += moodState.val - 5;
                    }
                } else if (typeof parentState.val == 'number' && parentState.val > groupStateVal) {
                    // Otherwise, aim for the higher value
                    leadingInstance = parentInstance;
                    this.log.debug(
                        `  Group state: Leading higher parent value from ${parentInstance}: ${parentState.val}`,
                    );
                    groupStateVal = parentState.val;
                }
            }

            await this.setStateChangedAsync('group.info.state.originID', { val: leadingInstance, ack: true });

            const groupMoodAverage = moodFoundCounter > 0 ? groupMood / (moodFoundCounter + 1) : groupMood;
            await this.setStateChangedAsync('group.mood', {
                // Strive for the golden middle
                val: groupMoodAverage > 0 ? Math.floor(groupMoodAverage + 5) : Math.ceil(groupMoodAverage + 5),
                ack: true,
            });

            this.log.debug(`  Group state: Final value is ${groupStateVal} from ${leadingInstance}`);
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
            this.residents.forEach(async resident => {
                const enabled = await this.getStateAsync(`${resident['id']}.enabled`);
                const away = await this.getStateAsync(`${resident['id']}.presence.away`);

                if (!enabled || !away) {
                    return;
                }

                if (enabled.val == false) {
                    this.log.debug(
                        `timeoutDisableAbsentResidents: ${
                            resident['id']
                        } is already 'disabled', therefore it is not changed.`,
                    );
                } else if (away.val == false) {
                    this.log.debug(
                        `timeoutDisableAbsentResidents: ${resident['id']} is not 'away', therefore it is not disabled.`,
                    );
                } else {
                    this.log.info(`timeoutDisableAbsentResidents: Disabling absent device ${resident['id']}.`);
                    await this.setStateAsync(`${resident['id']}.enabled`, {
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
            this.residents.forEach(async resident => {
                const home = await this.getStateAsync(`${resident['id']}.presence.home`);
                const overnight = await this.getStateAsync(`${resident['id']}.activity.overnight`);
                const overnightObj = await this.getObjectAsync(`${resident['id']}.activity.overnight`);

                if (!home || !overnight || !overnightObj) {
                    return;
                }

                if (resident['type'] == 'pet') {
                    this.log.debug(`timeoutResetOvernight: ${resident['id']} is a pet without night state - ignoring.`);
                } else if (resident['type'] == 'guest') {
                    this.log.debug(
                        `timeoutResetOvernight: ${
                            resident['id']
                        } is a guest, therefore is excluded from automatic reset.`,
                    );
                } else if (overnight.val == overnightObj.common.def) {
                    this.log.debug(
                        `timeoutResetOvernight: ${resident['id']} activity 'overnight' is already ${
                            overnightObj.common.def
                        }, therefore is not changed.`,
                    );
                } else if (home.val == false) {
                    this.log.debug(`timeoutResetOvernight: ${resident['id']} is not at home, therefore is excluded.`);
                } else {
                    this.log.info(
                        `timeoutResetOvernight: Resetting 'overnight' for ${resident['id']} to ${
                            overnightObj.common.def
                        }.`,
                    );
                    await this.setStateChangedAsync(`${resident['id']}.activity.overnight`, {
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
        if (!timeOfDay) {
            return null;
        }
        const timeOfDayArray = timeOfDay.split(':').map(Number);
        if (!timeOfDayArray || timeOfDayArray.length < 2) {
            return null;
        }
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
        }
        return null;
    }

    /**
     * @param {number} duration
     * @returns string HH:mm
     */
    convertMillisecondsToDuration(duration) {
        const seconds = Math.floor((duration / 1000) % 60);
        const minutes = Math.floor((duration / (1000 * 60)) % 60);
        const hours = Math.floor((duration / (1000 * 60 * 60)) % 24);

        return `${hours < 10 ? `0${hours}` : hours}:${minutes < 10 ? `0${minutes}` : minutes}:${
            seconds < 10 ? `0${seconds}` : seconds
        }`;
    }

    /**
     * @param {string} id
     * @returns string
     */
    cleanNamespace(id) {
        return id
            .trim()
            .replace(/\./g, '_') // Replace dots with underscores
            .replace(/\s/g, '_') // Replace whitespaces with underscores
            .replace(/[^\p{Ll}\p{Lu}\p{Nd}]+/gu, '_') // Replace not allowed chars with underscore
            .replace(/_+$/g, '') // Remove underscores end
            .replace(/^_+/g, '') // Remove underscores beginning
            .replace(/_+/g, '_') // Replace multiple underscores with one
            .toLowerCase()
            .replace(/ä/g, 'ae') // Replace a Umlaut
            .replace(/ö/g, 'oe') // Replace o Umlaut
            .replace(/ü/g, 'ue') // Replace u Umlaut
            .replace(/ß/g, 'ss') // Replace Eszett
            .replace(/_([a-z])/g, (m, w) => {
                return w.toUpperCase();
            });
    }

    /**
     * @param {any} string
     * @returns ioBroker.CommonState common.type
     */
    getDatatypeFromString(string) {
        let type = null;
        if (typeof string !== 'string') {
            return type;
        }

        const val = string.toLowerCase();
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

        if (type == null && this.hasJsonStructure(string)) {
            type = 'json';
        }

        return type;
    }

    /**
     * @param {any} string
     * @returns boolean
     */
    hasJsonStructure(string) {
        if (typeof string !== 'string') {
            return false;
        }
        try {
            const result = JSON.parse(string);
            const type = Object.prototype.toString.call(result);
            return type === '[object Object]' || type === '[object Array]';
        } catch {
            return false;
        }
    }

    /**
     * @param {any} string
     * @returns object
     */
    safeJsonParse(string) {
        try {
            return [null, JSON.parse(string)];
        } catch (err) {
            return [err];
        }
    }

    /**
     * @param {object} a
     * @param {object} b
     * @returns number
     */
    reverseSortResidentsListByTimecode(a, b) {
        if (a.tc == undefined || b.tc == undefined) {
            return 0;
        }
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
     * @param {Partial<utils.AdapterOptions>} [options]
     */
    module.exports = options => new Residents(options);
} else {
    // otherwise start the instance directly
    new Residents();
}
