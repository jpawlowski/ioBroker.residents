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
     */
    async onReady() {
        this.roomies = this.config.roomie != undefined ? this.config.roomie : [];
        this.pets = this.config.pet != undefined ? this.config.pet : [];
        this.guests = this.config.guest != undefined ? this.config.guest : [];
        this.residents = this.roomies;
        this.residents = this.residents.concat(this.pets);
        this.residents = this.residents.concat(this.guests);
        const objectTemplates = await this.getForeignObjectAsync('system.adapter.' + this.namespace);

        // Group mode
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
                // @ts-ignore
                objectTemplates.instanceObjects.filter((e) => e._id == 'state')[0],
            );
            await this.setObjectNotExistsAsync(
                'group.mood',
                // @ts-ignore
                objectTemplates.instanceObjects.filter((e) => e._id == 'mood')[0],
            );

            this.subscriptions.push('group.state');
            this.subscriptions.push('group.mood');
        }

        await this.setStateChangedAsync('info.state.parentInstanceIDs', {
            val: JSON.stringify(this.parentInstances),
            ack: true,
        });

        ///////////////////////////
        // Create/Update resident objects
        const residentTypes = ['roomie', 'pet', 'guest'];
        for (const i in residentTypes) {
            const residentType = residentTypes[i];

            for (const i2 in this.config[residentType]) {
                const resident = this.config[residentType][i2];
                const name = resident['name'].trim();
                const id = this.cleanNamespace(resident['id'] ? resident['id'] : name);
                this.config[residentType][i2]['id'] = id;
                this.config[residentType][i2]['type'] = residentType;

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

                await this.setObjectAsync(id, {
                    type: 'device',
                    common: {
                        name: name,
                        icon: residentType + '.svg',
                    },
                    native: {
                        type: residentType,
                    },
                });

                await this.setObjectAsync(
                    id + '.enabled',
                    {
                        type: 'state',
                        common: {
                            name: {
                                en: name + ' is within distance?',
                                de: name + ' ist in Reichweite?',
                                ru: name + ' находится в пределах расстояния?',
                                pt: name + ' está a uma distância?',
                                nl: name + 'is binnen de afstand?',
                                fr: name + ' est à distance?',
                                it: name + ' è a distanza?',
                                es: name + ' está a poca distancia?',
                                pl: name + 'jest w odległości ok?',
                                uk: name + ' знаходиться на відстані?',
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

                await this.setObjectAsync(id + '.info', {
                    type: 'channel',
                    common: {
                        name: {
                            en: 'Information about ' + name,
                            de: 'Informationen über ' + name,
                            ru: 'Информация о ' + name,
                            pt: 'Informação sobre ' + name,
                            nl: 'Informatie over ' + name,
                            fr: 'Informations sur ' + name,
                            it: 'Informazioni su ' + name,
                            es: 'Información sobre ' + name,
                            pl: 'Informacja o ' + name,
                            uk: 'Інформація про ' + name,
                            'zh-cn': '关于“+名称”的信息',
                        },
                    },
                    native: {},
                });

                await this.setObjectAsync(id + '.info.name', {
                    type: 'state',
                    common: {
                        name: {
                            en: 'Display name for ' + this.namespace + '.' + id,
                            de: 'Anzeigename für ' + this.namespace + '.' + id,
                            ru: 'Имя дисплея для ' + this.namespace + '.' + id,
                            pt: 'Nome de exibição para ' + this.namespace + '.' + id,
                            nl: 'Vertaling ' + this.namespace + '.' + id,
                            fr: "Nom d'affichage pour " + this.namespace + '.' + id,
                            it: 'Visualizzazione nome per ' + this.namespace + '.' + id,
                            es: 'Nombre de la pantalla para ' + this.namespace + '.' + id,
                            pl: 'Dysplay name for ' + this.namespace + '.' + id,
                            uk: 'Назва екрану для ' + this.namespace + '.' + id,
                            'zh-cn': this.namespace + '.' + id + ' 的区别名',
                        },
                        type: 'string',
                        role: 'text.resident.name',
                        read: true,
                        write: false,
                    },
                    native: {},
                });
                await this.setStateChangedAsync(id + '.info.name', { val: name, ack: true });

                // Activity support not for pets
                if (residentType != 'pet') {
                    await this.setObjectAsync(id + '.activity', {
                        type: 'channel',
                        common: {
                            name: {
                                en: 'Activity states of ' + name,
                                de: 'Aktivitätsstatus von ' + name,
                                ru: 'Состояние деятельности ' + name,
                                pt: 'Estados de atividade de ' + name,
                                nl: 'Activiteit staat van ' + name,
                                fr: "État d'activité de " + name,
                                it: 'Stati di attività di ' + name,
                                es: 'Estado de actividad de ' + name,
                                pl: 'Aktywność stanów ' + name,
                                uk: 'Стани діяльності ' + name,
                                'zh-cn': name + ' 动产国',
                            },
                        },
                        native: {},
                    });

                    const activityStatesObj = {
                        // 000-0999: Not present at home / Away
                        0: 'Away: Extended Absence',
                        1: 'Away: On the Road for Today',
                        2: 'Away: Way Home',

                        // 1000-1999: WAKING TIME at home ///////////////////////////////////////////////////////////////////////
                        1000: 'Home',

                        // 1100-1199: WAKING TIME at home: Food
                        1100: 'Food: Cooking',
                        1110: 'Food: Eating',
                        1120: 'Food: Feeding',

                        // 1200-1299: WAKING TIME at home: Housework
                        1200: 'Housework: General',
                        1210: 'Housework: Laundry',
                        1220: 'Housework: Cleaning',
                        1230: 'Housework: Repairing',

                        // 1300-1399: WAKING TIME at home: Working / Educating / Earning Money
                        1300: 'Job: Working',
                        1310: 'Job: Break from Working',
                        1350: 'Job: Learning',
                        1360: 'Job: Break from Learning',

                        // 1400-1499: WAKING TIME at home: Free Time / Being Mentally Active
                        1400: 'Mental: General Relaxing',
                        1410: 'Mental: Reading',

                        // 1500-1599: WAKING TIME at home: Free Time / Being also Physically Active / A Little Louder
                        1500: 'Fun: Gaming',
                        1510: 'Fun: Making Music',

                        // 1600-1699: WAKING TIME at home: Free Time / Passive Consuming / Relatively Quiet Activity
                        1600: 'Fun: Listening to Music',
                        1610: 'Fun: Watching Video',

                        // 1700-1799: WAKING TIME at home: Body care
                        1700: 'Body: Sporting',
                        1750: 'Body: Bathing',
                        1760: 'Body: Showering',

                        // 1800-1899: WAKING TIME at home: Self care
                        1800: 'Self: Meditating',
                        1810: 'Self: Thinking',

                        // 1900-1999: WAKING TIME at home: Transitioning to Sleeping Time
                        1900: 'Wind Down: Preparing Bedtime',
                        1901: 'Bedtime: Getting to Bed',
                        1902: 'Night: In Bed',

                        // 2000-2999: SLEEPING TIME at home /////////////////////////////////////////////////////////////////////
                        2000: 'Night: Sleeping',

                        // 2000-2099: SLEEPING TIME at home: While I should be sleeping
                        2010: 'Night: Awake during Night Time',
                        2020: 'Night: Back to Sleep',

                        // 2100-2199: SLEEPING TIME at home: While I should get up
                        2100: 'Night: Awakening by Wake-up Call',
                        2101: 'Wake Up: Snoozing',
                        2102: 'Wake Up: Snoozing',
                        2103: 'Wake Up: Extended Snoozing',
                        2104: 'Wake Up: Extended Snoozing',
                        2105: 'Wake Up: Extensive Snoozing',

                        // 2200-2299: SLEEPING TIME at home: Transitioning to Waking Time
                        2200: 'Wake Up: Awake after Wake-up Call',
                        2210: 'Wake Up: Implicit awakening by presence',
                    };

                    const activityStates = {
                        0: '',
                    };
                    const taskStates = {
                        1000: '',
                    };

                    for (const key in activityStatesObj) {
                        activityStates[key] = activityStatesObj[key];

                        // Numbers below 1000 only for activity.state
                        // Numbers from 2000 onwards only for night time
                        if (Number(key) < 1000 || Number(key) >= 2000) {
                            continue;
                        }

                        // Only numbers below 1900 for activity.task
                        else if (Number(key) < 1900) {
                            taskStates[key] = activityStatesObj[key];
                        }

                        // DND variants for activity.state
                        const newKey = Number(key) + 10000;
                        let newVal = activityStatesObj[key];
                        if (newVal.includes(':')) {
                            newVal = newVal.replace(/:\s+/g, ': Do Not Disturb (') + ')';
                        } else {
                            newVal = 'Do Not Disturb';
                        }
                        activityStates[newKey] = newVal;
                    }

                    await this.setObjectAsync(
                        id + '.activity.state',
                        {
                            type: 'state',
                            common: {
                                name: {
                                    en: name + ' activity state',
                                    de: name + ' Aktivitätsstatus',
                                    ru: name + ' активность государство',
                                    pt: 'estado de atividade ' + name,
                                    nl: name + ' activiteit staat',
                                    fr: "état de l ' activité " + name,
                                    it: name + ' attività stato',
                                    es: 'estado de actividad ' + name,
                                    pl: 'państwo aktywności ' + name,
                                    uk: 'стан діяльності ' + name,
                                    'zh-cn': name + ' 动植物活动',
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

                    await this.setObjectAsync(
                        id + '.activity.task',
                        {
                            type: 'state',
                            common: {
                                name: {
                                    en: name + ' is going after this task',
                                    de: name + ' geht dieser Aufgabe nach',
                                    ru: name + ' XYZ идет после этой задачи',
                                    pt: name + ' vai atrás desta tarefa',
                                    nl: name + ' gaat achter deze taak aan',
                                    fr: name + ' va après cette tâche',
                                    it: name + ' sta andando dopo questo compito',
                                    es: name + ' va tras esta tarea',
                                    pl: name + ' po tym wydarzeniu się z tego zadania',
                                    uk: name + ' йде після цього завдання',
                                    'zh-cn': name + ' 任务结束后',
                                },
                                type: 'number',
                                role: 'level.mode.resident.task',
                                min: 1000,
                                max: 1899,
                                read: true,
                                write: true,
                                def: 1000,
                                desc: {
                                    en: 'The task the resident is going after right now.',
                                    de: 'Die Aufgabe, der der Bewohner gerade nachgeht.',
                                    ru: 'Задача резидента продолжается прямо сейчас.',
                                    pt: 'A tarefa que o residente vai fazer agora.',
                                    nl: 'De taak die de bewoner nu gaat doen.',
                                    fr: 'La tâche que le résident poursuit maintenant.',
                                    it: 'Il compito che il residente sta seguendo in questo momento.',
                                    es: 'La tarea que el residente va tras ahora.',
                                    pl: 'Zadaniem rezydenta jest teraz.',
                                    uk: 'Завдання життєрадісника йде прямо зараз.',
                                    'zh-cn': '居民现在正处于权利之后。.',
                                },
                                states: taskStates,
                            },
                            native: {},
                        },
                        {
                            preserve: {
                                common: ['name'],
                            },
                        },
                    );

                    await this.setObjectAsync(
                        id + '.activity.awake',
                        {
                            type: 'state',
                            common: {
                                name: {
                                    en: name + ' is awake at night?',
                                    de: name + ' ist nachts wach?',
                                    ru: name + ' пробуждается ночью?',
                                    pt: name + ' está acordado à noite?',
                                    nl: name + " is 's nachts wakker?",
                                    fr: name + ' est réveillée la nuit ?',
                                    it: name + " e' sveglia di notte?",
                                    es: '¿' + name + ' está despierto por la noche?',
                                    pl: name + ' jest nocą?',
                                    uk: name + ' це нічний час?',
                                    'zh-cn': name + ' 在夜间是一种wak?',
                                },
                                type: 'boolean',
                                role: 'switch.mode.resident.awake',
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

                    await this.setObjectAsync(
                        id + '.activity.bedtime',
                        {
                            type: 'state',
                            common: {
                                name: {
                                    en: name + ' is getting ready for bed?',
                                    de: name + ' macht sich bettfertig?',
                                    ru: name + ' готовится к постели?',
                                    pt: name + ' está se preparando para a cama?',
                                    nl: name + ' gaat naar bed?',
                                    fr: name + ' se prépare pour le lit ?',
                                    it: name + ' si sta preparando per dormire?',
                                    es: '¿' + name + ' se está preparando para la cama?',
                                    pl: name + ' jest gotowy do łóżka?',
                                    uk: name + ' готовий до ліжка?',
                                    'zh-cn': name + ' 是否准备好?',
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
                                    0: 'Off',
                                    1: 'Wind Down: Preparing Bedtime',
                                    2: 'Bedtime: Getting to Bed',
                                    3: 'Night: In Bed',
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

                    await this.setObjectAsync(
                        id + '.activity.dnd',
                        {
                            type: 'state',
                            common: {
                                name: {
                                    en: name + ' does not want to be disturbed?',
                                    de: name + ' möchte nicht gestört werden?',
                                    ru: name + ' не хочет тревожиться?',
                                    pt: name + ' não quer ser perturbado?',
                                    nl: name + ' wil niet gestoord worden?',
                                    fr: name + ' ne veut pas être perturbé?',
                                    it: name + ' non vuole essere disturbato?',
                                    es: name + ' no quiere ser molestado?',
                                    pl: name + ' nie chce być zaniepokojony?',
                                    uk: name + ' не хоче турбувати?',
                                    'zh-cn': '十国不想受到干扰?',
                                },
                                type: 'boolean',
                                role: 'switch.mode.resident.dnd',
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

                    await this.setObjectAsync(
                        id + '.activity.overnight',
                        {
                            type: 'state',
                            common: {
                                name: {
                                    en: name + ' will stay overnight today?',
                                    de: name + ' wird heute übernachten?',
                                    ru: name + ' останется сегодня ночью?',
                                    pt: name + ' vai passar a noite hoje?',
                                    nl: name + ' blijft vannacht?',
                                    fr: name + " passera la nuit aujourd'hui?",
                                    it: name + ' rimarrà per tutta la notte oggi?',
                                    es: '¿' + name + ' se quedará esta noche?',
                                    pl: 'Obecnie ' + name + ' będzie nocą?',
                                    uk: name + ' буде залишатися на ніч сьогодні?',
                                    'zh-cn': name + ' 国将在今天夜间停留?',
                                },
                                type: 'boolean',
                                role: 'switch.mode.resident.overnight',
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

                    await this.setObjectAsync(
                        id + '.activity.wakeup',
                        {
                            type: 'state',
                            common: {
                                name: {
                                    en: name + ' has a wake-up call running?',
                                    de: name + ' hat einen laufenden Weckruf?',
                                    ru: 'У ' + name + ' работает пробуждение?',
                                    pt: 'A ' + name + ' tem uma chamada a acordar?',
                                    nl: 'Heeft ' + name + ' een wake-up call?',
                                    fr: name + ' a un réveil en cours ?',
                                    it: name + ' ha una sveglia in funzione?',
                                    es: '¿' + name + ' tiene una llamada de atención?',
                                    pl: name + ' ma nawoływane wezwanie?',
                                    uk: name + ' має прокидний дзвінок?',
                                    'zh-cn': name + ' 祖先发出呼吁吗?',
                                },
                                type: 'boolean',
                                role: 'switch.mode.resident.wakeup',
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

                    await this.setObjectAsync(
                        id + '.activity.wakeupSnooze',
                        {
                            type: 'state',
                            common: {
                                name: {
                                    en: name + ' has snoozed the wake-up call?',
                                    de: name + ' hat den Weckruf pausiert?',
                                    ru: name + ' разбил звонок?',
                                    pt: 'A ' + name + ' deu cabo da chamada de despertar?',
                                    nl: name + ' heeft de wake-up call doorzocht?',
                                    fr: name + ' a sauté le réveil ?',
                                    it: name + ' ha snoozed la sveglia?',
                                    es: name + ' ha snoozed la llamada de atención?',
                                    pl: name + " słyszało okrzyki. '",
                                    uk: name + ' snoozed the break-up виклик?',
                                    'zh-cn': name + ' hasnoozed the 随后的呼吁? 评 注',
                                },
                                type: 'boolean',
                                role: 'button.residents.wakeupSnoozed',
                                read: false,
                                write: true,
                                def: true,
                                desc: {
                                    en: 'Has this resident currently snoozed a wake-up call?',
                                    de: 'Hat dieser Bewohner gerade einen Weckruf pausiert?',
                                    ru: 'В настоящее время этот резидент разбил звонок?',
                                    pt: 'Este residente já fez uma chamada de despertar?',
                                    nl: 'Heeft deze inwoner momenteel een wake-up call gedaan?',
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

                    await this.setObjectAsync(
                        id + '.activity.wayhome',
                        {
                            type: 'state',
                            common: {
                                name: {
                                    en: name + ' is on way home?',
                                    de: name + ' ist auf dem Heimweg?',
                                    ru: name + ' это дома?',
                                    pt: name + ' está a caminho de casa?',
                                    nl: name + ' is op weg naar huis?',
                                    fr: name + ' est en route ?',
                                    it: name + ' sta tornando a casa?',
                                    es: '¿' + name + ' está de camino a casa?',
                                    pl: name + ' jest w drodze do domu?',
                                    uk: name + ' на шляху додому?',
                                    'zh-cn': name + ' 祖国是家?',
                                },
                                type: 'boolean',
                                role: 'switch.mode.resident.wayhome',
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
                }

                // Mood support not for pets
                if (residentType != 'pet') {
                    await this.setObjectAsync(id + '.mood', {
                        type: 'channel',
                        common: {
                            name: {
                                en: 'Mood of ' + name,
                                de: 'Laune von ' + name,
                                ru: 'Настроение ' + name,
                                pt: 'Humor de ' + name,
                                nl: 'Stemming van ' + name,
                                fr: 'Humeur de ' + name,
                                it: "Stato d'animo di " + name,
                                es: 'Humor de ' + name,
                                pl: 'Przewodnik ' + name,
                                uk: 'Мудрий ' + name,
                                'zh-cn': name + ' 国',
                            },
                        },
                        native: {},
                    });

                    await this.setObjectAsync(
                        id + '.mood.state',
                        {
                            type: 'state',
                            common: {
                                name: {
                                    en: name + ' mood state',
                                    de: name + ' Launenstatus',
                                    ru: 'Состояние настроения ' + name,
                                    pt: 'Estado de humor ' + name,
                                    nl: name + ' stemmingsstatus',
                                    fr: "État d'humeur " + name,
                                    it: "Stato dell'umore " + name,
                                    es: 'Estado de ánimo ' + name,
                                    pl: 'Stan nastroju ' + name,
                                    uk: 'Статус настрою ' + name,
                                    'zh-cn': name + ' 劳伦状态',
                                },
                                type: 'number',
                                role: 'level.mode.resident.mood',
                                min: -5,
                                max: 5,
                                read: true,
                                write: true,
                                def: 0,
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
                                states: {
                                    '-5': "-5: Couldn't Get Worse",
                                    '-4': '-4: Extraordinary Bad',
                                    '-3': '-3: Extremely Bad',
                                    '-2': '-2: Pretty Bad',
                                    '-1': '-1: Somewhat Bad',
                                    0: '0: Neutral',
                                    1: '+1: Somewhat Good',
                                    2: '+2: Pretty Good',
                                    3: '+3: Extremely Good',
                                    4: '+4: Extraordinary Good',
                                    5: "+5: Couldn't Be Better",
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

                await this.setObjectAsync(id + '.presenceFollowing', {
                    type: 'channel',
                    common: {
                        name: {
                            en: 'Indirect presence inheritance for ' + name,
                            de: 'Indirekte Präsenzvererbung für ' + name,
                            ru: 'Непрямое наследство присутствия для ' + name,
                            pt: 'Herança de presença indireta para ' + name,
                            nl: 'Indirecte erfenis voor ' + name,
                            fr: 'Héritage de présence indirecte pour ' + name,
                            it: 'Eredità di presenza indiretta per ' + name,
                            es: 'Herencia de presencia indirecta para ' + name,
                            pl: 'Przeznaczenie ' + name,
                            uk: 'Непряма спадщина присутності для ' + name,
                            'zh-cn': name + ' 直接存在的继承权',
                        },
                    },
                    native: {},
                });

                await this.setObjectAsync(
                    id + '.presenceFollowing.homeEnabled',
                    {
                        type: 'state',
                        common: {
                            name: {
                                en: name + ' is inheriting a home state?',
                                de: name + ' erbt einen Zuhausestatus?',
                                ru: name + ' наследует состояние дома?',
                                pt: 'O ' + name + ' herda um estado de casa?',
                                nl: name + ' erft een thuisstaat?',
                                fr: name + " hérite d'un État d'origine ?",
                                it: name + ' sta ereditando uno stato di casa?',
                                es: '¿' + name + ' hereda un estado de origen?',
                                pl: name + ' dziedziczy kraj?',
                                uk: name + ' є спадковим станом будинку?',
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

                //TODO: use foreignResidents for states
                await this.setObjectAsync(
                    id + '.presenceFollowing.homePerson',
                    {
                        type: 'state',
                        common: {
                            name: {
                                en: name + ' is following home state of this person',
                                de: name + ' folgt dem Zuhausestatus dieser Person',
                                ru: name + ' следит за домашним состоянием этого человека',
                                pt: name + ' está seguindo o estado de casa desta pessoa',
                                nl: name + ' volgt de staat van deze persoon',
                                fr: name + " suit l'état de la maison de cette personne",
                                it: name + ' sta seguendo lo stato di casa di questa persona',
                                es: name + ' sigue el estado natal de esta persona',
                                pl: name + ' poprzedza stan rzeczy tej osoby',
                                uk: name + ' - це домашня держава цієї особи',
                                'zh-cn': name + ' 正处于这一人的家里。',
                            },
                            type: 'string',
                            role: 'string.resident',
                            read: true,
                            write: true,
                            def: 'none',
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

                await this.setObjectAsync(
                    id + '.presenceFollowing.homeMode',
                    {
                        type: 'state',
                        common: {
                            name: {
                                en: name + ' is following these presence events',
                                de: name + ' folgt diesen Anwesenheits-Ereignissen',
                                ru: name + ' следит за этими событиями присутствия',
                                pt: name + ' está seguindo estes eventos de presença',
                                nl: name + ' volgt deze aanwezigheidsevenementen',
                                fr: name + ' suit ces événements de présence',
                                it: name + ' segue questi eventi di presenza',
                                es: name + ' sigue estos eventos de presencia',
                                pl: name + ' potwierdza te zdarzenia',
                                uk: name + ' слідувати за цими подіями присутності',
                                'zh-cn': '第十次会议之后',
                            },
                            type: 'number',
                            role: 'value.resident',
                            read: true,
                            write: true,
                            def: 0,
                            states: {
                                0: 'Coming & Leaving Home',
                                1: 'Coming Home only',
                                2: 'Leaving Home only',
                            },
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

                // Follow-them for Night state not for pets
                if (residentType != 'pet') {
                    await this.setObjectAsync(
                        id + '.presenceFollowing.nightEnabled',
                        {
                            type: 'state',
                            common: {
                                name: {
                                    en: name + ' is inheriting a night state?',
                                    de: name + ' erbt einen Nachtstatus?',
                                    ru: name + ' наследует ночное состояние?',
                                    pt: 'A ' + name + ' herda um estado nocturno?',
                                    nl: name + ' erft een nachtstaat?',
                                    fr: name + " hérite d'un état de nuit ?",
                                    it: name + ' sta ereditando uno stato di notte?',
                                    es: '¿' + name + ' hereda un estado nocturno?',
                                    pl: name + ' dziedziczy stan nocny?',
                                    uk: name + ' – спадщина нічного стану?',
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

                    //TODO: use foreignResidents variable for dynamic states
                    await this.setObjectAsync(
                        id + '.presenceFollowing.nightPerson',
                        {
                            type: 'state',
                            common: {
                                name: {
                                    en: name + ' is following sleep state of this person',
                                    de: name + ' folgt dem Schlafstatus dieser Person',
                                    ru: name + ' следит за состоянием сна этого человека',
                                    pt: name + ' está seguindo o estado de sono desta pessoa',
                                    nl: name + ' volgt slaaptoestand van deze persoon',
                                    fr: name + " suit l'état de sommeil de cette personne",
                                    it: name + ' sta seguendo lo stato di sonno di questa persona',
                                    es: name + ' sigue el estado de sueño de esta persona',
                                    pl: name + ' jest stanem snu tej osoby',
                                    uk: name + ' - це наступний стан сну цієї людини',
                                    'zh-cn': name + ' 是这个人睡觉的后裔',
                                },
                                type: 'string',
                                role: 'string.resident',
                                read: true,
                                write: true,
                                def: 'none',
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

                    await this.setObjectAsync(
                        id + '.presenceFollowing.nightMode',
                        {
                            type: 'state',
                            common: {
                                name: {
                                    en: name + ' is following these night presence events',
                                    de: name + ' folgt diesen nächtlichen Anwesenheits-Ereignissen',
                                    ru: name + ' следит за этими ночными событиями присутствия',
                                    pt: name + ' está seguindo estes eventos de presença noturna',
                                    nl: name + ' volgt deze nachtelijke gebeurtenissen',
                                    fr: name + ' suit ces événements nocturnes',
                                    it: name + ' segue questi eventi di presenza notturna',
                                    es: name + ' sigue estos eventos de presencia nocturna',
                                    pl: name + ' po tych nocnych wydarzeniach obecna jest obecna',
                                    uk: name + ' - це наступні події нічної присутності',
                                    'zh-cn': '第' + name + '次会议之后',
                                },
                                type: 'number',
                                role: 'value.resident',
                                read: true,
                                write: true,
                                def: 0,
                                states: {
                                    0: 'Fall Asleep & Get Up',
                                    1: 'Fall Asleep only',
                                    2: 'Get Up only',
                                },
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
                }

                await this.setObjectAsync(id + '.presence', {
                    type: 'channel',
                    common: {
                        name: {
                            en: 'Presence states of ' + name,
                            de: 'Anwesenheitsstatus von ' + name,
                            ru: 'Состояние присутствия ' + name,
                            pt: 'Estados de presença de ' + name,
                            nl: 'Druk staat van ' + name,
                            fr: 'État de présence de ' + name,
                            it: 'Stati di presenza di ' + name,
                            es: 'Estados de presencia de ' + name,
                            pl: 'Państwa prezydenckie ' + name,
                            uk: 'Заочні стани ' + name,
                            'zh-cn': name + ' 祖先国',
                        },
                    },
                    native: {},
                });

                await this.setObjectAsync(
                    id + '.presence.home',
                    {
                        type: 'state',
                        common: {
                            name: {
                                en: name + ' is at home?',
                                de: name + ' ist zuhause?',
                                ru: name + ' дома?',
                                pt: 'O ' + name + ' está em casa?',
                                nl: name + ' is thuis?',
                                fr: name + ' est à la maison ?',
                                it: name + " e' a casa?",
                                es: '¿' + name + ' está en casa?',
                                pl: name + ' jest w domu?',
                                uk: name + ' в домашніх умовах?',
                                'zh-cn': name + '祖国是家?',
                            },
                            type: 'boolean',
                            role: 'switch.mode.resident.home',
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

                await this.setObjectAsync(
                    id + '.presence.away',
                    {
                        type: 'state',
                        common: {
                            name: {
                                en: name + ' is away?',
                                de: name + ' ist abwesend?',
                                ru: name + ' находится вдали?',
                                pt: 'O ' + name + ' está fora?',
                                nl: name + ' is afwezig?',
                                fr: name + ' est parti ?',
                                it: name + " e' via?",
                                es: '¿' + name + ' está fuera?',
                                pl: name + ' jest już odległy?',
                                uk: name + ' є далеко?',
                                'zh-cn': name + ' 不存在？',
                            },
                            type: 'boolean',
                            role: 'switch.mode.resident.away',
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

                // Presence state for pets
                if (residentType == 'pet') {
                    await this.setObjectAsync(
                        id + '.presence.state',
                        {
                            type: 'state',
                            common: {
                                name: {
                                    en: name + ' presence state',
                                    de: name + ' Anwesenheitsstatus',
                                    ru: name + ' состояние присутствия',
                                    pt: 'Estado de presença ' + name,
                                    nl: name + ' aanwezigheidsstatus',
                                    fr: 'Statut de présence ' + name,
                                    it: 'Stato di presenza ' + name,
                                    es: 'Estado de presencia ' + name,
                                    pl: 'Stan obecności ' + name,
                                    uk: 'Стан присутності ' + name,
                                    'zh-cn': name + ' 存在状态',
                                },
                                type: 'number',
                                role: 'level.mode.resident.presence',
                                min: 0,
                                max: 1,
                                read: true,
                                write: true,
                                def: 0,
                                desc: {
                                    en: 'Resident presence state',
                                    de: 'Bewohner Anwesenheitsstatus',
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
                                states: {
                                    0: 'Away',
                                    1: 'Home',
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

                // Presence state for humans
                else {
                    await this.setObjectAsync(
                        id + '.presence.night',
                        {
                            type: 'state',
                            common: {
                                name: {
                                    en: name + ' is at sleep?',
                                    de: name + ' schläft?',
                                    ru: name + ' у сна?',
                                    pt: 'O ' + name + ' está a dormir?',
                                    nl: name + ' slaapt?',
                                    fr: name + ' est en sommeil ?',
                                    it: name + ' sta dormendo?',
                                    es: '¿' + name + ' está durmiendo?',
                                    pl: name + ' jest w snu?',
                                    uk: name + ' на сонці?',
                                    'zh-cn': name + ' 睡觉?',
                                },
                                type: 'boolean',
                                role: 'switch.mode.resident.night',
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

                    await this.setObjectAsync(
                        id + '.presence.state',
                        {
                            type: 'state',
                            common: {
                                name: {
                                    en: name + ' presence state',
                                    de: name + ' Anwesenheitsstatus',
                                    ru: name + ' состояние присутствия',
                                    pt: 'Estado de presença ' + name,
                                    nl: name + ' aanwezigheidsstatus',
                                    fr: 'Statut de présence ' + name,
                                    it: 'Stato di presenza ' + name,
                                    es: 'Estado de presencia ' + name,
                                    pl: 'Stan obecności ' + name,
                                    uk: 'Стан присутності ' + name,
                                    'zh-cn': name + ' 存在状态',
                                },
                                type: 'number',
                                role: 'level.mode.resident.presence',
                                min: 0,
                                max: 2,
                                read: true,
                                write: true,
                                def: 0,
                                desc: {
                                    en: 'Resident presence state',
                                    de: 'Bewohner Anwesenheitsstatus',
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
                                states: {
                                    0: 'Away',
                                    1: 'Home',
                                    2: 'Night',
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
                    this.foreignSubscriptions.push(resident.foreignPresenceObjectId);
                    if (this.presenceSubscriptionMapping[resident.foreignPresenceObjectId] == undefined)
                        this.presenceSubscriptionMapping[resident.foreignPresenceObjectId] = [];
                    this.presenceSubscriptionMapping[resident.foreignPresenceObjectId].push(id);
                }

                if (
                    resident.foreignWayhomeObjectId != undefined &&
                    typeof resident.foreignWayhomeObjectId == 'string' &&
                    resident.foreignWayhomeObjectId != ''
                ) {
                    if (this.presenceSubscriptionMapping[resident.foreignWayhomeObjectId] != undefined) {
                        this.log.error(
                            resident.foreignWayhomeObjectId +
                                ' is already in use for presence entry/exit events, it can not be used for wayhome events in that case.',
                        );
                    } else {
                        this.foreignSubscriptions.push(resident.foreignWayhomeObjectId);
                        if (this.wayhomeSubscriptionMapping[resident.foreignWayhomeObjectId] == undefined)
                            this.wayhomeSubscriptionMapping[resident.foreignWayhomeObjectId] = [];
                        this.wayhomeSubscriptionMapping[resident.foreignWayhomeObjectId].push(id);
                    }
                }

                // Yahka instance update
                if (
                    resident['yahkaInstanceId'] &&
                    resident['yahkaInstanceId'] != '' &&
                    resident['yahkaInstanceId'] != 'none'
                ) {
                    const yahkaDeviceConfig = {
                        configType: 'customdevice',
                        manufacturer: 'ioBroker',
                        model: 'residents.' + residentType,
                        name: name,
                        serial: this.namespace + '.' + id,
                        firmware: this.version,
                        enabled: true,
                        category: '11',
                        services: [
                            {
                                name: this.namespace + '.' + id + '.presence.home',
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
                                        inOutParameters: this.namespace + '.' + id + '.enabled',
                                    },
                                    {
                                        name: 'OccupancyDetected',
                                        enabled: true,
                                        inOutFunction: 'ioBroker.State',
                                        inOutParameters: this.namespace + '.' + id + '.presence.home',
                                    },
                                ],
                                linkTo: this.namespace + '.' + id + '.presence.state',
                                isPrimary: true,
                            },
                            {
                                name: this.namespace + '.' + id + '.presence.state',
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
                                        inOutParameters: this.namespace + '.' + id + '.enabled',
                                    },
                                    {
                                        name: 'SecuritySystemCurrentState',
                                        enabled: true,
                                        properties: {
                                            maxValue: 2,
                                            validValues: [0, 1, 2],
                                        },
                                        inOutFunction: 'ioBroker.State.OnlyACK',
                                        inOutParameters: this.namespace + '.' + id + '.presence.state',
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
                                        inOutParameters: this.namespace + '.' + id + '.presence.state',
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
                                linkTo: this.namespace + '.' + id + '.presence.home',
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
                        currentYahkaConf.native.bridge.devices.filter((e) => e.serial == this.namespace + '.' + id)
                            .length == 0
                    ) {
                        this.log.info(
                            'Homekit support: Adding ' +
                                id +
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

        await this.setResidentsSummary();

        this.timeoutDisableAbsentResidents(true);
        this.timeoutResetOvernight(true);
    }

    /**
     * Distribute state events
     *
     * @param {string} id
     * @param {ioBroker.State | null | undefined} state
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
                // Global residents commands
                if (level1 == 'control') {
                    this.processGlobalControlCommand(id, state);
                }

                // An individual residents device was controlled
                else {
                    this.processResidentDeviceControlCommand(id, state);
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
                //
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

        // const oldState = this.states[id];
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
                                " is 'disabled', therefore is is excluded from group control.",
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
                                " is 'disabled', therefore is is excluded from group control.",
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
                                " is not 'home', therefore is is excluded from group control.",
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
                                " is not 'home', therefore is is excluded from group control.",
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
                                " is 'disabled', therefore is is excluded from group control.",
                        );
                    } else {
                        this.log.info(allLevels + ': Enabling ' + resident['id'] + "for 'overnight'.");
                        await this.setStateChangedAsync(resident['id'] + '.activity.overnight', {
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
                                " is 'disabled', therefore is is excluded from group control.",
                        );
                    } else {
                        this.log.info(allLevels + ': Disabling ' + resident['id'] + "for 'overnight'.");
                        await this.setStateChangedAsync(resident['id'] + '.activity.overnight', {
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
                                " is 'disabled', therefore is is excluded from group control.",
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
                        await this.setStateChangedAsync(resident['id'] + '.activity.overnight', {
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

                    if (!wayhome) return;

                    if (resident['type'] == 'pet') {
                        this.log.debug(
                            allLevels + ': ' + resident['id'] + ' is a pet without wayhome state - ignoring.',
                        );
                    } else if (wayhome.val == true) {
                        this.log.debug(
                            allLevels +
                                ': ' +
                                resident['id'] +
                                " activity 'wayhome' is already active, therefore it is not changed.",
                        );
                    } else {
                        this.log.info(allLevels + ': Enabling ' + resident['id'] + "for 'wayhome'.");
                        await this.setStateChangedAsync(resident['id'] + '.activity.wayhome', {
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
                            allLevels + ': ' + resident['id'] + ' is a pet without wayhome state - ignoring.',
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
                        await this.setStateChangedAsync(resident['id'] + '.activity.wayhome', {
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
        this.setStateAsync(id, state);
    }

    /**
     * Process device control events that are handled by this residents instance
     *
     * @param {string} id
     * @param {ioBroker.State} state
     */
    processResidentDeviceControlCommand(id, state) {
        const a = id.split('.');
        a.shift(); // adapter name
        a.shift(); // adapter instance
        const level1 = a.shift(); // first level ID
        const level2 = a.shift(); // second level ID
        const level3 = a.shift(); // third level ID

        if (typeof level1 != 'string') return;

        const oldState = this.states[id];
        this.states[id] = state;

        switch (level2) {
            case 'enabled': {
                this.log.debug(level1 + ': Controlling ' + id + ': ' + state.val);
                this.enableResidentDevice(level1, state, oldState);
                break;
            }

            case 'activity': {
                if (typeof level3 != 'string') return;
                this.log.debug(level1 + ': Controlling ' + id + ': ' + state.val);
                this.setResidentDeviceActivity(level1, level3, state, oldState);
                break;
            }

            case 'mood': {
                this.log.debug(level1 + ': Controlling ' + id + ': ' + state.val);
                this.setResidentDeviceMood(level1, state, oldState);
                break;
            }

            case 'presence': {
                if (typeof level3 != 'string') return;
                this.log.debug(level1 + ': Controlling ' + id + ': ' + state.val);
                this.setResidentDevicePresence(level1, level3, state, oldState);
                break;
            }

            case 'presenceFollowing': {
                if (typeof level3 != 'string') return;
                this.log.debug(level1 + ': Controlling ' + id + ': ' + state.val);
                this.setResidentDevicePresenceFollowing(level1, level3, state, oldState);
                break;
            }

            default: {
                this.log.error(level1 + ': Controlling unknown channel ' + level2);
                break;
            }
        }
    }

    /**
     * Process device update events that are handled by this residents instance
     *
     * @param {string} id
     * @param {ioBroker.State} state
     */
    processResidentDeviceUpdateEvent(id, state) {
        const a = id.split('.');
        a.shift(); // adapter name
        a.shift(); // adapter instance
        const level1 = a.shift(); // first level ID
        const level2 = a.shift(); // second level ID
        const level3 = a.shift(); // third level ID

        // const oldState = this.states[id];
        this.states[id] = state;

        switch (level2) {
            case 'activity': {
                if (level3 == 'state') {
                    this.log.debug(this.namespace + ": Received ack'ed update of " + id + ': ' + state.val);
                    this.setResidentsSummary();
                }
                break;
            }

            case 'enabled': {
                if (state.val == true) {
                    this.log.debug(this.namespace + ": Received ack'ed enablement of " + level1);
                    this.setResidentsSummary();
                }
                break;
            }

            case 'mood': {
                if (level3 == 'state') {
                    this.log.debug(this.namespace + ": Received ack'ed update of " + id + ': ' + state.val);
                    this.setResidentsSummary();
                }
                break;
            }

            case 'presence': {
                if (level3 == 'state') {
                    this.log.debug(this.namespace + ": Received ack'ed update of " + id + ': ' + state.val);
                    this.setResidentsSummary();
                }
                break;
            }

            default: {
                this.log.error(this.namespace + ": Received unknown ack'ed update of " + id + ': ' + state.val);
                break;
            }
        }
    }

    /**
     * Update all activity states for a particular residents device
     *
     * @param {string} device
     * @param {string} command
     * @param {ioBroker.State} state
     * @param {ioBroker.State} oldState
     */
    async setResidentDeviceActivity(device, command, state, oldState) {
        const enabledState = await this.getStateAsync(device + '.enabled');
        const presenceState = await this.getStateAsync(device + '.presence.state');
        const activityState = await this.getStateAsync(device + '.activity.state');
        const dndState = await this.getStateAsync(device + '.activity.dnd');
        if (
            !enabledState ||
            !presenceState ||
            presenceState.val == undefined ||
            !activityState ||
            activityState.val == undefined ||
            !dndState
        )
            return;

        if (!oldState) oldState = state;
        if (activityState.val >= 10000) activityState.val = Number(activityState.val) - 10000;
        if (command == 'dnd') dndState.val = oldState.val;

        let stateAwake = false;
        let stateBedtime = 0;
        let stateWakeup = false;
        let stateWayhome = false;

        switch (command) {
            case 'state': {
                if (typeof state.val != 'number' || oldState.val == undefined) return;
                if (oldState.val >= 10000) oldState.val = Number(oldState.val) - 10000;
                let changePresenceToHome = false;
                let changePresenceToAway = false;

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
                    if (state.val >= 10000) state.val -= 10000;
                    if (dndState.val == false) {
                        await this.setStateAsync(device + '.activity.dnd', { val: true, ack: true });
                    }
                }

                // Reflect DND in state value when at home and awake
                else if (presenceState.val == 1) {
                    if (oldState.val >= 2000) {
                        await this.setStateAsync(device + '.activity.dnd', { val: false, ack: true });
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
                    if (state.val >= 10000) state.val -= 10000;
                    if (dndState.val == true) {
                        await this.setStateAsync(device + '.activity.dnd', { val: false, ack: true });
                    }
                }

                await this.setStateAsync(device + '.activity.awake', { val: stateAwake, ack: true });
                await this.setStateAsync(device + '.activity.bedtime', { val: stateBedtime, ack: true });
                await this.setStateAsync(device + '.activity.wakeup', { val: stateWakeup, ack: true });
                await this.setStateAsync(device + '.activity.wayhome', { val: stateWayhome, ack: true });

                state.ack = true;
                await this.setStateAsync(device + '.activity.state', state);

                // Only take over task value between 1000 and 1900
                if (state.val >= 10000) state.val -= 10000;
                if (state.val < 1000 || state.val >= 1900) state.val = 1000;
                await this.setStateAsync(device + '.activity.task', state);

                if (presenceState.val == 2 && changePresenceToHome) {
                    await this.setStateAsync(device + '.presence.night', { val: false, ack: true });
                    await this.setStateAsync(device + '.presence.state', { val: 1, ack: true });
                } else if (presenceState.val > 0 && changePresenceToAway) {
                    await this.setStateAsync(device + '.presence.night', { val: false, ack: true });
                    await this.setStateAsync(device + '.presence.home', { val: false, ack: true });
                    await this.setStateAsync(device + '.presence.away', { val: true, ack: true });
                    await this.setStateAsync(device + '.presence.state', { val: 0, ack: true });
                }
                break;
            }

            case 'awake': {
                if (activityState.val < 2000) {
                    this.log.warn(device + ': Awake state can only be controlled during night time');
                    state.ack = true;
                    state.val = oldState.val;
                    state.q = 0x40;
                    await this.setStateAsync(device + '.activity.awake', state);
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
                        device,
                        'state',
                        { val: newActivityVal, ack: false, ts: state.ts, lc: activityState.lc, from: state.from },
                        activityState,
                    );
                }
                break;
            }

            case 'bedtime': {
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
                        device,
                        'state',
                        { val: newActivityVal, ack: false, ts: state.ts, lc: activityState.lc, from: state.from },
                        activityState,
                    );
                } else {
                    this.log.warn(device + ': Presence at home is required to start bed time process');
                    state.val = 0;
                    state.q = 0x40;
                    await this.setStateAsync(device + '.activity.bedtime', state);
                }
                break;
            }

            case 'dnd': {
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
                        device,
                        'state',
                        { val: activityState.val, ack: false, ts: state.ts, lc: activityState.lc, from: state.from },
                        activityState,
                    );
                }
                await this.setStateAsync(device + '.activity.dnd', state);
                break;
            }

            case 'overnight': {
                state.ack = true;
                if (state.val == true) {
                    if (enabledState.val == false) {
                        this.log.info(
                            device + ' opted in to the overnight stay and therefore is automatically re-enabled',
                        );
                        await this.setStateAsync(device + '.enabled', { val: true, ack: true });
                    }
                } else if (presenceState.val == 0 && enabledState.val == true) {
                    this.log.info(
                        device +
                            ' has logged out of the overnight stay and therefore automatically deactivated because of being away right now',
                    );
                    await this.setStateAsync(device + '.enabled', { val: false, ack: true });
                    await this.setStateChangedAsync(device + '.activity.wayhome', { val: false, ack: false });
                }
                await this.setStateAsync(device + '.activity.overnight', state);
                await this.setResidentsSummary();
                break;
            }

            case 'task': {
                state.ack = true;
                if (presenceState.val == 1) {
                    this.setResidentDeviceActivity(device, 'state', state, activityState);
                } else {
                    this.log.warn(device + ': Tasks can only be controlled during waking time at home');
                    state.val = oldState.val;
                    state.q = 0x40;
                    await this.setStateAsync(device + '.activity.task', state);
                }
                break;
            }

            case 'wakeup': {
                state.ack = true;
                if (presenceState.val == 2) {
                    await this.setStateAsync(device + '.activity.wakeup', state);
                    let newActivityVal = activityState.val >= 2100 ? 2200 : 1000;
                    if (state.val == true)
                        newActivityVal = activityState.val >= 2100 ? Number(activityState.val) : 2100;
                    this.setResidentDeviceActivity(
                        device,
                        'state',
                        { val: newActivityVal, ack: false, ts: state.ts, lc: activityState.lc, from: state.from },
                        activityState,
                    );
                } else {
                    if (state.val == true) {
                        this.log.warn(device + ': A wake-up call can only be triggered during night time at home');
                        state.val = false;
                        state.q = 0x40;
                    }
                    await this.setStateAsync(device + '.activity.wakeup', state);
                }
                break;
            }

            case 'wakeupSnooze': {
                if (state.val != true) return;
                state.ack = true;
                if (activityState.val >= 2100 && activityState.val < 2200) {
                    let newActivityVal = Number(activityState.val);
                    if (activityState.val < 2105) newActivityVal++;
                    this.setResidentDeviceActivity(
                        device,
                        'state',
                        { val: newActivityVal, ack: false, ts: state.ts, lc: activityState.lc, from: state.from },
                        activityState,
                    );
                } else {
                    this.log.warn(device + ' has no wake-up call running that could be snoozed');
                    state.val = true;
                    state.q = 0x41;
                }
                await this.setStateAsync(device + '.activity.wakeupSnooze', state);
                break;
            }

            case 'wayhome': {
                let newActivityVal = 0;
                if (state.val == true) {
                    if (enabledState.val == false)
                        await this.setStateAsync(device + '.enabled', { val: true, ack: true });
                    newActivityVal = 2;
                } else if (enabledState.val == true) {
                    newActivityVal = 1;
                }
                this.setResidentDeviceActivity(
                    device,
                    'state',
                    { val: newActivityVal, ack: false, ts: state.ts, lc: activityState.lc, from: state.from },
                    activityState,
                );
                break;
            }

            default: {
                this.log.warn(device + ': Controlling unknown activity ' + command);
                break;
            }
        }
    }

    /**
     * Update all mood states for a particular residents device
     *
     * @param {string} device
     * @param {ioBroker.State} state
     * @param {ioBroker.State} oldState
     */
    async setResidentDeviceMood(device, state, oldState) {
        const presenceState = await this.getStateAsync(device + '.presence.state');
        if (!presenceState || presenceState.val == undefined) return;
        if (!oldState) oldState = state;

        if (presenceState.val != 1) {
            this.log.warn(device + ': Mood can only be controlled during waking time at home');
            state.val = oldState.val;
            state.q = 0x40;
        }

        state.ack = true;
        await this.setStateAsync(device + '.mood.state', state);
    }

    /**
     * Update all presence states for a particular residents device
     *
     * @param {string} device
     * @param {string} command
     * @param {ioBroker.State} state
     * @param {ioBroker.State} oldState
     */
    async setResidentDevicePresence(device, command, state, oldState) {
        const enabledState = await this.getStateAsync(device + '.enabled');
        const presenceState = await this.getStateAsync(device + '.presence.state');
        const activityState = await this.getStateAsync(device + '.activity.state');
        const overnightState = await this.getStateAsync(device + '.activity.overnight');
        const residentType = (await this.getObjectAsync(device))?.native.type;
        if (!enabledState || !presenceState || presenceState.val == undefined) return;

        if (activityState && activityState.val != undefined && activityState.val >= 10000)
            activityState.val = Number(activityState.val) - 10000;
        if (!oldState) oldState = state;

        let stateNight = false;
        let stateHome = false;
        let stateActivity = 0;

        switch (command) {
            case 'state': {
                if (typeof state.val != 'number') return;

                // Disable immediately if no overnight stay planned
                if (overnightState && overnightState.val == false && state.val == 0) {
                    this.log.info(device + ' disabled during away event due to planned absence this night');
                    await this.setStateChangedAsync(device + '.enabled', { val: false, ack: true });
                    enabledState.val = false;
                }

                if (enabledState.val == true) {
                    stateActivity = 1;
                }

                // Always reset mood if presence state was changed
                if (residentType != 'pet' && state.val != oldState.val) {
                    await this.setStateChangedAsync(device + '.mood.state', { val: 0, ack: true });
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

                    await this.setStateChangedAsync(device + '.enabled', { val: true, ack: true });
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

                await this.setStateAsync(device + '.presence.home', { val: stateHome, ack: true });
                await this.setStateAsync(device + '.presence.away', { val: !stateHome, ack: true });
                if (residentType != 'pet') {
                    await this.setStateAsync(device + '.presence.night', { val: stateNight, ack: true });
                }
                state.ack = true;
                await this.setStateAsync(device + '.presence.state', state);
                if (activityState) {
                    await this.setResidentDeviceActivity(
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
                state.val = state.val == true ? 1 : 0;
                await this.setStateAsync(device + '.presence.state', state);
                break;
            }

            case 'night': {
                if (state.val == true) {
                    state.val = 2;
                } else {
                    state.val = presenceState.val > 0 ? 1 : 0;
                }
                await this.setStateAsync(device + '.presence.state', state);
                break;
            }

            case 'away': {
                state.val = state.val == true ? 0 : 1;
                await this.setStateAsync(device + '.presence.state', state);
                break;
            }

            default: {
                this.log.warn(device + ': Controlling unknown presence ' + command);
                break;
            }
        }
    }

    /**
     * Update all follow-them presence states for a particular residents device
     *
     * @param {string} device
     * @param {string} command
     * @param {ioBroker.State} state
     * @param {ioBroker.State} oldState
     */
    async setResidentDevicePresenceFollowing(device, command, state, oldState) {
        // eslint-disable-next-line no-unused-vars
        const oldValue = oldState.val;
        await this.setStateChangedAsync(device + '.presenceFollowing.' + command, {
            val: state.val,
            ack: true,
            from: state.from,
        });
    }

    /**
     * Change residents device presence or activity state from foreign presence event
     *
     * @param {string} id
     * @param {ioBroker.State} state
     * @param {ioBroker.StateObject} [_stateObj]
     */
    async setResidentDevicePresenceFromEvent(id, state, _stateObj) {
        const stateObj = _stateObj ? _stateObj : await this.getForeignObjectAsync(id);
        if (!stateObj) return;
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
            type = this.getDatatypeFromString(state.val);
            if (type == null) {
                this.log.error(id + ': Monitored presence datapoint seems inapproproate due to unknown string format');
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
                            ': Monitored presence datapoint seems inapproproate with minimum value of ' +
                            stateObj.common.min,
                    );
                    return false;
                }
                if (stateObj.common.max != undefined && stateObj.common.max != 1) {
                    this.log.error(
                        id +
                            ': Monitored presence datapoint seems inapproproate with maximum value of ' +
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
                this.setResidentDevicePresenceFromEvent(id, state, {
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
                return;
            }
        }

        if (presence == null) {
            this.log.error(id + ': Unable to determine presence state value');
        }

        // Presence update
        else if (this.presenceSubscriptionMapping[id]) {
            for (const device in this.presenceSubscriptionMapping[id]) {
                this.log.info(
                    id +
                        ': Detected presence update for ' +
                        this.presenceSubscriptionMapping[id][device] +
                        ': ' +
                        presence,
                );
                await this.setStateChangedAsync(this.presenceSubscriptionMapping[id][device] + '.presence.home', {
                    val: presence,
                    ack: false,
                });
            }
        }

        // Way Home activity update
        else if (this.wayhomeSubscriptionMapping[id]) {
            for (const device in this.wayhomeSubscriptionMapping[id]) {
                this.log.info(
                    id +
                        ': Detected way home update for ' +
                        this.wayhomeSubscriptionMapping[id][device] +
                        ': ' +
                        presence,
                );
                await this.setStateChangedAsync(this.wayhomeSubscriptionMapping[id][device] + '.activity.wayhome', {
                    val: presence,
                    ack: false,
                });
            }
        }
    }

    /**
     * @param {string} device
     * @param {ioBroker.State} state
     * @param {ioBroker.State} oldState
     */
    async enableResidentDevice(device, state, oldState) {
        await this.setStateAsync(device + '.enabled', { val: state.val, ack: true, from: state.from });
        const residentType = (await this.getObjectAsync(device))?.native.type;
        if (oldState.val != state.val) {
            if (state.val == true) {
                if (residentType != 'pet') {
                    oldState.val = this.states[device + '.activity.state'];
                    state.val = 1;
                    this.states[device + '.activity.state'] = state.val;
                    await this.setResidentDeviceActivity(device, 'state', state, oldState);
                }
            } else {
                oldState.val = this.states[device + '.presence.state'];
                state.val = 0;
                this.states[device + '.presence.state'] = state.val;
                await this.setResidentDevicePresence(device, 'state', state, oldState);
            }
        }
    }

    /**
     * @param {boolean} [_run]
     */
    async setResidentsSummary(_run) {
        // Debounce re-calculation when multiple changes occure in a short time
        this.clearTimeout(this.calculationTimeout);
        if (!_run) {
            const runtimeMilliseconds = 1000;
            this.log.silly(`Creating residents summary re-calcuation timeout in ${runtimeMilliseconds}ms`);
            this.calculationTimeout = this.setTimeout(() => {
                this.log.debug('Started residents summary re-calcuation');
                this.calculationTimeout = null;
                this.setResidentsSummary(true);
            }, runtimeMilliseconds);
            return;
        }

        const homeList = [];
        const petHomeList = [];
        const nightList = [];
        const awayList = [];
        const disabledList = [];
        const wayhomeList = [];
        const overnightList = [];
        const awakeList = [];

        let homeCount = 0;
        let petHomeCount = 0;
        let nightCount = 0;
        let awayCount = 0;
        let disabledCount = 0;
        let wayhomeCount = 0;
        let overnightCount = 0;
        let awakeCount = 0;
        let totalResidentsCount = 0;
        let totalPetCount = 0;
        let moodCount = 0;

        let homeBool = false;
        let petHomeBool = false;
        let nightBool = false;
        let awayBool = false;
        let disabledBool = false;
        let wayhomeBool = false;
        let overnightBool = false;
        let awakeBool = false;

        this.log.debug('  Looping through residents list:');

        for (const resident of this.residents) {
            const name = resident['name'];
            const residentType = (await this.getObjectAsync(resident['id']))?.native.type;
            const enabled = await this.getStateAsync(resident['id'] + '.enabled');
            // const activity = await this.getStateAsync(resident['id'] + '.activity.state');
            const awake = await this.getStateAsync(resident['id'] + '.activity.awake');
            const overnight = await this.getStateAsync(resident['id'] + '.activity.overnight');
            const wayhome = await this.getStateAsync(resident['id'] + '.activity.wayhome');
            const away = await this.getStateAsync(resident['id'] + '.presence.away');
            const home = await this.getStateAsync(resident['id'] + '.presence.home');
            const presence = await this.getStateAsync(resident['id'] + '.presence.state');
            const mood = await this.getStateAsync(resident['id'] + '.mood.state');

            if (presence == undefined || presence == null || typeof presence.val != 'number') continue;

            this.log.debug('  Checking on ' + name + ' ...');

            if (awake != undefined && awake != null && typeof awake.val == 'boolean' && awake.val == true) {
                this.log.debug('    - is awake');
                awakeBool = true;
                awakeCount++;
                awakeList.push({ name: name, id: this.namespace + '.' + resident['id'], tc: awake.lc });
            }

            if (
                overnight != undefined &&
                overnight != null &&
                typeof overnight.val == 'boolean' &&
                overnight.val == true
            ) {
                this.log.debug('    - does overnight');
                overnightBool = true;
                overnightCount++;
                overnightList.push({ name: name, id: this.namespace + '.' + resident['id'], tc: overnight.lc });
            }

            // When present at home
            if (presence.val >= 1) {
                this.log.debug('    - is at home');

                if (residentType == 'pet') {
                    totalPetCount++;
                } else {
                    totalResidentsCount++;
                    if (mood != undefined && mood != null && typeof mood.val == 'number') {
                        moodCount += mood.val;
                    }
                }

                if (home != undefined && home != null && typeof home.val == 'boolean') {
                    if (residentType == 'pet') {
                        petHomeBool = true;
                        petHomeCount++;
                        petHomeList.push({ name: name, id: this.namespace + '.' + resident['id'], tc: home.lc });
                    } else {
                        homeBool = true;
                        homeCount++;
                        homeList.push({ name: name, id: this.namespace + '.' + resident['id'], tc: home.lc });
                    }
                }

                // When at sleep
                if (presence.val == 2) {
                    nightBool = true;
                    nightCount++;
                    nightList.push({ name: name, id: this.namespace + '.' + resident['id'], tc: presence.lc });
                }
            } else if (
                presence.val == 0 &&
                enabled != undefined &&
                enabled != null &&
                typeof enabled.val == 'boolean' &&
                away != undefined &&
                away != null &&
                typeof away.val == 'boolean'
            ) {
                this.log.debug('    - is away from home');
                awayBool = true;

                // When away from home
                if (enabled.val == true) {
                    this.log.debug('    - is enabled');

                    if (residentType == 'pet') {
                        totalPetCount++;
                    } else {
                        totalResidentsCount++;
                    }
                    awayCount++;
                    awayList.push({ name: name, id: this.namespace + '.' + resident['id'], tc: away.lc });

                    // When on way home
                    if (
                        wayhome != undefined &&
                        wayhome != null &&
                        typeof wayhome.val == 'boolean' &&
                        wayhome.val == true
                    ) {
                        wayhomeBool = true;
                        wayhomeCount++;
                        wayhomeList.push({ name: name, id: this.namespace + '.' + resident['id'], tc: wayhome.lc });
                    }
                }

                // When absent from home for longer period
                else {
                    this.log.debug('    - is disabled');
                    disabledBool = true;
                    disabledCount++;
                    disabledList.push({ name: name, id: this.namespace + '.' + resident['id'], tc: enabled.lc });
                }
            }
        }

        this.log.debug(
            '  Completed loop-through of ' +
                (totalResidentsCount + totalPetCount + disabledCount) +
                ' resident devices.',
        );

        // Sort Lists + Write First/Last datapoints
        disabledList.sort(this.reverseSortResidentsListByTimecode);
        if (disabledList.length > 0) {
            await this.setStateAsync('info.state.disabledFirst', {
                val: disabledList[disabledList.length - 1]['name'],
                ack: true,
            });
            await this.setStateAsync('info.state.disabledLast', {
                val: disabledList[0]['name'],
                ack: true,
            });
        }

        wayhomeList.sort(this.reverseSortResidentsListByTimecode);
        if (wayhomeList.length > 0) {
            await this.setStateAsync('info.activity.wayhomeFirst', {
                val: wayhomeList[wayhomeList.length - 1]['name'],
                ack: true,
            });
            await this.setStateAsync('info.activity.wayhomeLast', {
                val: wayhomeList[0]['name'],
                ack: true,
            });
        }

        overnightList.sort(this.reverseSortResidentsListByTimecode);
        if (overnightList.length > 0) {
            await this.setStateAsync('info.activity.overnightFirst', {
                val: overnightList[overnightList.length - 1]['name'],
                ack: true,
            });
            await this.setStateAsync('info.activity.overnightLast', {
                val: overnightList[0]['name'],
                ack: true,
            });
        }

        awakeList.sort(this.reverseSortResidentsListByTimecode);
        if (awakeList.length > 0) {
            await this.setStateAsync('info.activity.awakeFirst', {
                val: awakeList[awakeList.length - 1]['name'],
                ack: true,
            });
            await this.setStateAsync('info.activity.awakeLast', {
                val: awakeList[0]['name'],
                ack: true,
            });
        }

        awayList.sort(this.reverseSortResidentsListByTimecode);
        if (awayList.length > 0) {
            await this.setStateAsync('info.presence.awayFirst', {
                val: awayList[awayList.length - 1]['name'],
                ack: true,
            });
            await this.setStateAsync('info.presence.awayLast', {
                val: awayList[0]['name'],
                ack: true,
            });
        }

        nightList.sort(this.reverseSortResidentsListByTimecode);
        if (nightList.length > 0) {
            await this.setStateAsync('info.presence.nightFirst', {
                val: nightList[nightList.length - 1]['name'],
                ack: true,
            });
            await this.setStateAsync('info.presence.nightLast', {
                val: nightList[0]['name'],
                ack: true,
            });
        }

        petHomeList.sort(this.reverseSortResidentsListByTimecode);
        if (petHomeList.length > 0) {
            await this.setStateAsync('info.presence.petsHomeFirst', {
                val: petHomeList[petHomeList.length - 1]['name'],
                ack: true,
            });
            await this.setStateAsync('info.presence.petsHomeLast', {
                val: petHomeList[0]['name'],
                ack: true,
            });
        }

        homeList.sort(this.reverseSortResidentsListByTimecode);
        if (homeList.length > 0) {
            await this.setStateAsync('info.presence.homeFirst', {
                val: homeList[homeList.length - 1]['name'],
                ack: true,
            });
            await this.setStateAsync('info.presence.homeLast', {
                val: homeList[0]['name'],
                ack: true,
            });
        }

        // Write Lists
        await this.setStateAsync('info.state.disabledList', { val: JSON.stringify(disabledList), ack: true });
        await this.setStateAsync('info.activity.wayhomeList', { val: JSON.stringify(wayhomeList), ack: true });
        await this.setStateAsync('info.activity.overnightList', { val: JSON.stringify(overnightList), ack: true });
        await this.setStateAsync('info.activity.awakeList', { val: JSON.stringify(awakeList), ack: true });
        await this.setStateAsync('info.presence.awayList', { val: JSON.stringify(awayList), ack: true });
        await this.setStateAsync('info.presence.nightList', { val: JSON.stringify(nightList), ack: true });
        await this.setStateAsync('info.presence.petsHomeList', { val: JSON.stringify(petHomeList), ack: true });
        await this.setStateAsync('info.presence.homeList', { val: JSON.stringify(homeList), ack: true });

        // Write Counter
        await this.setStateAsync('info.state.disabledCount', { val: disabledCount, ack: true });
        await this.setStateAsync('info.state.totalPetsCount', { val: totalPetCount, ack: true });
        await this.setStateAsync('info.state.totalResidentsCount', { val: totalResidentsCount, ack: true });
        await this.setStateAsync('info.state.totalCount', { val: totalResidentsCount + totalPetCount, ack: true });
        await this.setStateAsync('info.activity.wayhomeCount', { val: wayhomeCount, ack: true });
        await this.setStateAsync('info.activity.overnightCount', { val: overnightCount, ack: true });
        await this.setStateAsync('info.activity.awakeCount', { val: awakeCount, ack: true });
        await this.setStateAsync('info.presence.awayCount', { val: awayCount, ack: true });
        await this.setStateAsync('info.presence.nightCount', { val: nightCount, ack: true });
        await this.setStateAsync('info.presence.petsHomeCount', { val: petHomeCount, ack: true });
        await this.setStateAsync('info.presence.homeCount', { val: homeCount, ack: true });

        // Write Indicators
        await this.setStateAsync('info.state.disabled', { val: disabledBool, ack: true });

        if (totalResidentsCount > 0) {
            await this.setStateAsync('info.reachable', { val: true, ack: true });
            await this.setStateAsync('info.state.disabledAll', { val: false, ack: true });
        } else {
            await this.setStateAsync('info.reachable', { val: false, ack: true });
            await this.setStateAsync('info.state.disabledAll', { val: true, ack: true });
        }

        await this.setStateAsync('info.activity.wayhome', { val: wayhomeBool, ack: true });
        await this.setStateAsync('info.activity.overnight', { val: overnightBool, ack: true });
        await this.setStateAsync('info.activity.awake', { val: awakeBool, ack: true });

        if (wayhomeCount > 0 && wayhomeCount == awayCount) {
            await this.setStateAsync('info.activity.wayhomeAll', { val: true, ack: true });
        } else {
            await this.setStateAsync('info.activity.wayhomeAll', { val: false, ack: true });
        }
        if (overnightCount > 0 && overnightCount == totalResidentsCount) {
            await this.setStateAsync('info.activity.overnightAll', { val: true, ack: true });
        } else {
            await this.setStateAsync('info.activity.overnightAll', { val: false, ack: true });
        }
        if (awakeCount > 0 && awakeCount == homeCount) {
            await this.setStateAsync('info.activity.awakeAll', { val: true, ack: true });
        } else {
            await this.setStateAsync('info.activity.awakeAll', { val: false, ack: true });
        }

        await this.setStateAsync('info.presence.away', { val: awayBool, ack: true });
        await this.setStateAsync('info.presence.night', { val: nightBool, ack: true });
        await this.setStateAsync('info.presence.petsHome', { val: petHomeBool, ack: true });
        await this.setStateAsync('info.presence.home', { val: homeBool, ack: true });

        if (petHomeBool && !homeBool) {
            await this.setStateAsync('info.presence.petsHomeAlone', { val: true, ack: true });
        } else {
            await this.setStateAsync('info.presence.petsHomeAlone', { val: false, ack: true });
        }
        if (homeCount > 0 && homeCount == totalResidentsCount) {
            await this.setStateAsync('info.presence.homeAll', { val: true, ack: true });
        } else {
            await this.setStateAsync('info.presence.homeAll', { val: false, ack: true });
        }
        if (nightCount > 0 && nightCount == homeCount) {
            await this.setStateAsync('info.presence.nightAll', { val: true, ack: true });
        } else {
            await this.setStateAsync('info.presence.nightAll', { val: false, ack: true });
        }
        if (totalResidentsCount == 0 || (awayCount > 0 && awayCount >= totalResidentsCount)) {
            await this.setStateAsync('info.presence.awayAll', { val: true, ack: true });
        } else {
            await this.setStateAsync('info.presence.awayAll', { val: false, ack: true });
        }

        let residentsStateVal = -1;
        if (petHomeCount > 0) {
            residentsStateVal = 1;
        }
        if (totalResidentsCount > 0) {
            residentsStateVal = 0;
            if (petHomeCount > 0) {
                residentsStateVal = 1;
            }
            if (wayhomeCount > 0) {
                residentsStateVal = 2;
            }
            if (homeCount > 0) {
                residentsStateVal = 3;
                if (nightCount > 0 && nightCount == homeCount) {
                    residentsStateVal = 7;
                }
                if (awakeCount > 0 && awakeCount == homeCount) {
                    residentsStateVal = 5;
                }
            }
        }

        this.log.debug('  Calculated residents state: ' + residentsStateVal);
        await this.setStateAsync('state', { val: residentsStateVal, ack: true });

        const moodAverage = homeCount > 0 ? moodCount / homeCount : 0;
        await this.setStateAsync('mood', {
            // Strive for the golden middle
            val: moodAverage > 0 ? Math.floor(moodAverage) : Math.ceil(moodAverage),
            ack: true,
        });

        // Group states
        if (this.parentInstances.length > 0) {
            let leadingInstance = String(this.namespace);
            let groupStateVal = residentsStateVal;
            let groupMood = moodAverage;
            let moodFoundCounter = 0;

            for (const i in this.parentInstances) {
                const parentInstance = String(this.parentInstances[i]);

                const parentState = await this.getForeignStateAsync(parentInstance + '.state');
                if (!parentState || parentState.val == undefined) continue;

                // For presence at home, aim for the lower (= more awake) number
                if (groupStateVal >= 3 && parentState.val >= 3) {
                    if (parentState.val < groupStateVal) {
                        leadingInstance = parentInstance;
                        this.log.debug(
                            '  Group state: Leading lower parent value from ' + parentInstance + ': ' + parentState.val,
                        );
                        groupStateVal = Number(parentState.val);
                    }

                    const moodState = await this.getForeignStateAsync(parentInstance + '.mood');
                    if (moodState) {
                        moodFoundCounter++;
                        groupMood += Number(moodState.val);
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
                val: groupMoodAverage > 0 ? Math.floor(groupMoodAverage) : Math.ceil(groupMoodAverage),
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
        const runtimeMilliseconds = this.getMillisecondsUntilTime(this.config.DisableAbsentResidentsDailyTimer);
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
        const runtimeMilliseconds = this.getMillisecondsUntilTime(this.config.ResetOvernightDailyTimer);
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
