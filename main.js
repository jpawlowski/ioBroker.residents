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
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    async onReady() {
        // Group mode
        if (
            Array.isArray(this.config.residentsParentInstanceIDs) &&
            this.config.residentsParentInstanceIDs.length > 0
        ) {
            let subscribedToParentEvents = false;
            for (const i in this.config.residentsParentInstanceIDs) {
                const instance = this.config.residentsParentInstanceIDs[i];
                if (
                    instance.startsWith('residents.') &&
                    instance.split('.').length === 2 &&
                    instance != this.namespace
                ) {
                    this.log.debug('Subscribing to foreign instance events of ' + instance);
                    this.subscribeForeignStates(instance + '.mood');
                    this.subscribeForeignStates(instance + '.state');
                    subscribedToParentEvents = true;
                }
            }

            if (subscribedToParentEvents) {
                const objectTemplates = (await this.getForeignObjectAsync('system.adapter.' + this.namespace))
                    ?.instanceObjects;

                await this.setObjectNotExistsAsync('group', {
                    type: 'folder',
                    common: {
                        name: {
                            en: 'Information on the group structure of the residents',
                            de: 'Informationen zur Gruppenstruktur der Bewohner',
                        },
                    },
                    native: {},
                });

                await this.setObjectNotExistsAsync('group.info', objectTemplates.filter((e) => e._id == 'info')[0]);
                await this.setObjectNotExistsAsync(
                    'group.info.state',
                    objectTemplates.filter((e) => e._id == 'info.state')[0],
                );

                await this.setObjectNotExistsAsync('group.info.state.originID', {
                    type: 'state',
                    common: {
                        name: {
                            en: 'Origin instance ID for group state',
                            de: 'Ursprüngliche Instanz-ID für Gruppenstatus',
                        },
                        type: 'string',
                        role: 'state',
                        read: true,
                        write: false,
                        def: '',
                    },
                    native: {},
                });

                await this.setObjectNotExistsAsync('group.state', objectTemplates.filter((e) => e._id == 'state')[0]);
                await this.setObjectNotExistsAsync('group.mood', objectTemplates.filter((e) => e._id == 'mood')[0]);
            }
        }

        await this.setStateAsync('info.state.parentInstanceIDs', {
            val: JSON.stringify(this.config.residentsParentInstanceIDs),
            ack: true,
        });

        this.subscribeStates('control.*');

        ///////////////////////////
        // Create/Update resident objects
        const residentTypes = ['roomie', 'pet', 'guest'];
        for (const i in residentTypes) {
            const residentType = residentTypes[i];

            for (const i2 in this.config[residentType]) {
                const resident = this.config[residentType][i2];
                const name = resident['name'].trim();
                const id = this.cleanNamespace(resident['id'] ? resident['id'] : name);

                // TODO: see other to-do below
                // TODO: also add roomies from other instances
                const foreignResidents = {};
                this.config.roomie.forEach((e) => {
                    // @ts-ignore
                    const key = e.id;
                    if (key != id) {
                        // @ts-ignore
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
                            },
                            type: 'boolean',
                            role: 'switch.enable',
                            read: true,
                            write: true,
                            def: false,
                            desc: {
                                en: 'Reachability state',
                                de: 'Erreichbarkeitsstatus',
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
                        },
                        type: 'string',
                        role: 'text.resident.name',
                        read: true,
                        write: false,
                    },
                    native: {},
                });
                await this.setStateAsync(id + '.info.name', { val: name, ack: true });

                // Activity support not for pets
                if (residentType != 'pet') {
                    await this.setObjectAsync(id + '.activity', {
                        type: 'channel',
                        common: {
                            name: {
                                en: 'Activity states of ' + name,
                                de: 'Aktivitätsstatus von ' + name,
                            },
                        },
                        native: {},
                    });

                    await this.setObjectAsync(
                        id + '.activity.state',
                        {
                            type: 'state',
                            common: {
                                name: {
                                    en: name + ' activity state',
                                    de: name + ' Aktivitätsstatus',
                                },
                                type: 'number',
                                role: 'level.mode.resident.activity',
                                min: 0,
                                max: 1299,
                                read: true,
                                write: false,
                                def: 0,
                                desc: {
                                    en: 'Resident activity state',
                                    de: 'Bewohner Aktivitätsstatus',
                                },
                                states: {
                                    // 000-099: Not present at home / Away
                                    0: 'Away: Extended Absence',
                                    1: 'Away: On the Road for Today',
                                    2: 'Away: Way Home',

                                    // 100-199: WAKING TIME at home ///////////////////////////////////////////////////////////////////////
                                    100: 'Home: Nothing Special',
                                    101: 'Home: Boring',

                                    // 110-119: WAKING TIME at home: Food
                                    110: 'Food: Cooking',
                                    111: 'Food: Eating',
                                    112: 'Food: Feeding',

                                    // 120-129: WAKING TIME at home: Housework
                                    120: 'Housework: General',
                                    121: 'Housework: Laundry',
                                    122: 'Housework: Cleaning',
                                    123: 'Housework: Repairing',

                                    // 130-139: WAKING TIME at home: Working / Educating / Earning Money
                                    130: 'Job: Working',
                                    131: 'Job: Break from Working',
                                    135: 'Job: Learning',
                                    136: 'Job: Break from Learning',

                                    // 140-149: WAKING TIME at home: Free Time / Being Mentally Active
                                    140: 'Mental: General Relaxing',
                                    141: 'Mental: Reading',

                                    // 150-159: WAKING TIME at home: Free Time / Being also Physically Active / A Little Louder
                                    150: 'Fun: Gaming',
                                    151: 'Fun: Making Music',

                                    // 160-169: WAKING TIME at home: Free Time / Passive Consuming / Relatively Quiet Activity
                                    160: 'Fun: Listening to Music',
                                    161: 'Fun: Watching Video',

                                    // 170-179: WAKING TIME at home: Body care
                                    170: 'Body: Sporting',
                                    175: 'Body: Bathing',
                                    176: 'Body: Showering',

                                    // 180-189: WAKING TIME at home: Self care
                                    180: 'Self: Meditating',
                                    181: 'Self: Thinking',

                                    // 190-199: WAKING TIME at home: Transitioning to Sleeping Time
                                    190: 'Home: Winding Down',
                                    191: 'Home: Preparing Bedtime',
                                    192: 'Home: Getting to Bed',
                                    199: 'Home: In Bed',

                                    // 1000-1199: WAKING TIME at home with DND ///////////////////////////////////////////////////////////////////////
                                    1000: 'Home: Do Not Disturb',
                                    1001: 'Home: Do Not Disturb (Boring)',

                                    // 1110-1119: WAKING TIME at home: Food
                                    1110: 'Food: Do Not Disturb (Cooking)',
                                    1111: 'Food: Do Not Disturb (Eating)',
                                    1112: 'Food: Do Not Disturb (Feeding)',

                                    // 1120-1129: WAKING TIME at home: Housework
                                    1120: 'Housework: Do Not Disturb (General)',
                                    1121: 'Housework: Do Not Disturb (Laundry)',
                                    1123: 'Housework: Do Not Disturb (Cleaning)',
                                    1124: 'Housework: Do Not Disturb (Repairing)',

                                    // 1130-1139: WAKING TIME at home: Working / Educating / Earning Money
                                    1130: 'Job: Do Not Disturb (Working)',
                                    1131: 'Job: Do Not Disturb (Break from Working)',
                                    1135: 'Job: Do Not Disturb (Learning)',
                                    1136: 'Job: Do Not Disturb (Break from Learning)',

                                    // 1140-1149: WAKING TIME at home: Free Time / Being Mentally Active
                                    1140: 'Mental: Do Not Disturb (General Relaxing)',
                                    1141: 'Mental: Do Not Disturb (Reading)',

                                    // 1150-1159: WAKING TIME at home: Free Time / Being also Physically Active / A Little Louder
                                    1150: 'Fun: Do Not Disturb (Gaming)',
                                    1151: 'Fun: Do Not Disturb (Making Music)',

                                    // 1160-1169: WAKING TIME at home: Free Time / Passive Consuming / Relatively Quiet Activity
                                    1160: 'Fun: Do Not Disturb (Listening to Music)',
                                    1161: 'Fun: Do Not Disturb (Watching Video)',

                                    // 1170-1179: WAKING TIME at home: Body care
                                    1170: 'Body: Do Not Disturb (Sporting)',
                                    1175: 'Body: Do Not Disturb (Bathing)',
                                    1176: 'Body: Do Not Disturb (Showering)',

                                    // 1180-1189: WAKING TIME at home: Self care
                                    1180: 'Self: Do Not Disturb (Meditating)',
                                    1181: 'Self: Do Not Disturb (Thinking)',

                                    // 1190-1199: WAKING TIME at home: Transitioning to Sleeping Time
                                    1190: 'Home: Do Not Disturb (Winding Down)',
                                    1191: 'Home: Do Not Disturb (Preparing Bedtime)',
                                    1192: 'Home: Do Not Disturb (Getting to Bed)',
                                    1199: 'Home: Do Not Disturb (In Bed)',

                                    // 200-299: SLEEPING TIME at home /////////////////////////////////////////////////////////////////////
                                    200: 'Night: Sleeping',

                                    // 200-209: SLEEPING TIME at home: While I should be sleeping
                                    201: 'Night: Awake during Night Time',
                                    202: 'Night: Back in Bed',

                                    // 210-219: SLEEPING TIME at home: While I should get up
                                    210: 'Night: Awakening by Wake-up Call',
                                    211: 'Night: Snoozing',
                                    212: 'Night: Extended Snoozing',
                                    213: 'Night: Extensive Snoozing',

                                    // 220-229: SLEEPING TIME at home: Transitioning to Waking Time
                                    220: 'Night: Awake after Wake-up Call',
                                    221: 'Night: Implicit awakening by presence',
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
                        id + '.activity.awake',
                        {
                            type: 'state',
                            common: {
                                name: {
                                    en: name + ' is awake at night?',
                                    de: name + ' ist nachts wach?',
                                },
                                type: 'boolean',
                                role: 'switch.mode.resident.awake',
                                read: true,
                                write: true,
                                def: false,
                                desc: {
                                    en: 'Is this resident awake at night right now?',
                                    de: 'Liegt dieser Bewohner gerade nachts wach im Bett?',
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
                                },
                                type: 'boolean',
                                role: 'switch.mode.resident.bedtime',
                                read: true,
                                write: true,
                                def: false,
                                desc: {
                                    en: 'Is this resident getting ready for bed right now?',
                                    de: 'Macht sich dieser Bewohner gerade bettfertig?',
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
                                },
                                type: 'boolean',
                                role: 'switch.mode.resident.dnd',
                                read: true,
                                write: true,
                                def: false,
                                desc: {
                                    en: 'Does the resident currently not want to be disturbed or interrupted?',
                                    de: 'Möchte der Bewohner gerade nicht gestört oder unterbrochen werden?',
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
                                },
                                type: 'boolean',
                                role: 'switch.mode.resident.overnight',
                                read: true,
                                write: true,
                                def: residentType == 'guest' ? false : true,
                                desc: {
                                    en: 'Is this resident going to stay overnight today?',
                                    de: 'Wird dieser Bewohner heute über Nacht bleiben?',
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
                                },
                                type: 'boolean',
                                role: 'switch.mode.resident.wakeup',
                                read: true,
                                write: true,
                                def: false,
                                desc: {
                                    en: 'Is this resident currently being woken up?',
                                    de: 'Ist dieser Bewohner gerade auf dem Heimweg?',
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
                                },
                                type: 'boolean',
                                role: 'switch.mode.resident.wayhome',
                                read: true,
                                write: true,
                                def: false,
                                desc: {
                                    en: 'Is this resident on way home?',
                                    de: 'Ist dieser Bewohner gerade auf dem Heimweg?',
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
                            },
                            type: 'boolean',
                            role: 'switch.enable',
                            read: true,
                            write: true,
                            def: false,
                            desc: {
                                en: 'Follow-them functionality for coming & leaving home',
                                de: 'Follow-them Funktion für Kommen & Gehen',
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
                            },
                            type: 'string',
                            role: 'string.resident',
                            read: true,
                            write: true,
                            def: 'none',
                            desc: {
                                en: 'Which person is being followed?',
                                de: 'Welcher Person wird gefolgt?',
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
                                },
                                type: 'boolean',
                                role: 'switch.enable',
                                read: true,
                                write: true,
                                def: false,
                                desc: {
                                    en: 'Follow-them functionality for the night state',
                                    de: 'Follow-them Funktion für den Nachtstatus',
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
                                },
                                type: 'string',
                                role: 'string.resident',
                                read: true,
                                write: true,
                                def: 'none',
                                desc: {
                                    en: 'Which person is being followed?',
                                    de: 'Welcher Person wird gefolgt?',
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
                            },
                            type: 'boolean',
                            role: 'switch.mode.resident.home',
                            read: true,
                            write: true,
                            def: false,
                            desc: {
                                en: 'Is this resident at home?',
                                de: 'Ist dieser Bewohner zuhause?',
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
                            },
                            type: 'boolean',
                            role: 'switch.mode.resident.away',
                            read: true,
                            write: true,
                            def: true,
                            desc: {
                                en: 'Is this resident away?',
                                de: 'Ist dieser Bewohner abwesend?',
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
                                },
                                type: 'boolean',
                                role: 'switch.mode.resident.night',
                                read: true,
                                write: true,
                                def: false,
                                desc: {
                                    en: 'Is this resident at sleep?',
                                    de: 'Schläft dieser Bewohner gerade?',
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

                this.subscribeStates(id + '.enabled');
                this.subscribeStates(id + '.activity.*');
                this.subscribeStates(id + '.mood.state');
                this.subscribeStates(id + '.presence.*');
                this.subscribeStates(id + '.presenceFollowing.*');

                // Yahka instance update
                if (resident['yahkaInstanceId'] && resident['yahkaInstanceId'] !== 'none') {
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
                        currentYahkaConf?.native.bridge.devices.push(yahkaDeviceConfig);
                        // @ts-ignore
                        await this.setForeignObjectAsync(
                            'system.adapter.' + resident['yahkaInstanceId'],
                            currentYahkaConf,
                        );
                    }
                }
            }
        }

        this.setResidentsSummary();
    }

    onUnload(callback) {
        try {
            // clearTimeout(timeout1);

            callback();
        } catch (e) {
            callback();
        }
    }

    /**
     * Is called if a subscribed state changes
     * @param {string} id
     * @param {ioBroker.State | null | undefined} state
     */
    onStateChange(id, state) {
        const a = id.split('.');
        let eventNamespace = a.shift(); // adapter name
        eventNamespace = eventNamespace + '.' + a.shift(); // adapter instance
        const device = a.shift(); // first level ID
        const channel = a.shift(); // second level ID
        const subChannel = a.shift(); // third level ID

        // Own events
        if (eventNamespace === this.namespace) {
            if (state) {
                // The state was controlled (ack=false)
                if (!state.ack) {
                    // Global residents commands
                    if (device === 'control') {
                        let residents = this.config.roomie;
                        residents = residents.concat(this.config.pet);
                        residents = residents.concat(this.config.guest);
                        this.setStateAsync(id, { val: state.val, ack: true });

                        switch (a.join('.')) {
                            case 'state.disableAll':
                                residents.forEach(async (resident) => {
                                    const name = resident['name'];
                                    const deviceId = resident['id'] ? resident['id'] : name;
                                    const away = (await this.getStateAsync(deviceId + '.presence.away'))?.val;

                                    if (away) {
                                        this.setStateAsync(deviceId + '.enabled', { val: false, ack: false });
                                    }
                                });
                                break;

                            case 'state.enableAll':
                                residents.forEach(async (resident) => {
                                    const name = resident['name'];
                                    const deviceId = resident['id'] ? resident['id'] : name;
                                    const away = (await this.getStateAsync(deviceId + '.presence.away'))?.val;

                                    if (away) {
                                        await this.setStateAsync(deviceId + '.enabled', { val: true, ack: false });
                                    }
                                });
                                break;

                            case 'presence.setHomeAll':
                                residents.forEach(async (resident) => {
                                    const name = resident['name'];
                                    const deviceId = resident['id'] ? resident['id'] : name;
                                    const enabled = (await this.getStateAsync(deviceId + '.enabled'))?.val;

                                    if (enabled) {
                                        await this.setStateAsync(deviceId + '.presence.home', {
                                            val: true,
                                            ack: false,
                                        });
                                    }
                                });
                                break;

                            case 'presence.unsetHomeAll':
                                residents.forEach(async (resident) => {
                                    const name = resident['name'];
                                    const deviceId = resident['id'] ? resident['id'] : name;
                                    const enabled = (await this.getStateAsync(deviceId + '.enabled'))?.val;

                                    if (enabled) {
                                        await this.setStateAsync(deviceId + '.presence.home', {
                                            val: false,
                                            ack: false,
                                        });
                                    }
                                });
                                break;

                            case 'presence.setNightAll':
                                residents.forEach(async (resident) => {
                                    const name = resident['name'];
                                    const deviceId = resident['id'] ? resident['id'] : name;
                                    const residentType = (await this.getObjectAsync(deviceId))?.native.type;
                                    const home = (await this.getStateAsync(deviceId + '.presence.home'))?.val;

                                    if (residentType != 'pet' && home) {
                                        await this.setStateAsync(deviceId + '.presence.night', {
                                            val: true,
                                            ack: false,
                                        });
                                    }
                                });
                                break;

                            case 'presence.unsetNightAll':
                                residents.forEach(async (resident) => {
                                    const name = resident['name'];
                                    const deviceId = resident['id'] ? resident['id'] : name;
                                    const residentType = (await this.getObjectAsync(deviceId))?.native.type;
                                    const home = (await this.getStateAsync(deviceId + '.presence.home'))?.val;

                                    if (residentType != 'pet' && home) {
                                        await this.setStateAsync(deviceId + '.presence.night', {
                                            val: false,
                                            ack: false,
                                        });
                                    }
                                });
                                break;

                            case 'presence.setAwayAll':
                                residents.forEach(async (resident) => {
                                    const name = resident['name'];
                                    const deviceId = resident['id'] ? resident['id'] : name;
                                    const enabled = (await this.getStateAsync(deviceId + '.enabled'))?.val;

                                    if (enabled) {
                                        await this.setStateAsync(deviceId + '.presence.away', {
                                            val: true,
                                            ack: false,
                                        });
                                    }
                                });
                                break;

                            case 'presence.unsetAwayAll':
                                residents.forEach(async (resident) => {
                                    const name = resident['name'];
                                    const deviceId = resident['id'] ? resident['id'] : name;
                                    const enabled = (await this.getStateAsync(deviceId + '.enabled'))?.val;

                                    if (enabled) {
                                        await this.setStateAsync(deviceId + '.presence.away', {
                                            val: false,
                                            ack: false,
                                        });
                                    }
                                });
                                break;

                            case 'activity.setOvernightAll':
                                residents.forEach(async (resident) => {
                                    const name = resident['name'];
                                    const deviceId = resident['id'] ? resident['id'] : name;
                                    const residentType = (await this.getObjectAsync(deviceId))?.native.type;
                                    const enabled = (await this.getStateAsync(deviceId + '.enabled'))?.val;

                                    if (residentType != 'pet' && enabled) {
                                        await this.setStateAsync(deviceId + '.activity.overnight', {
                                            val: true,
                                            ack: false,
                                        });
                                    }
                                });
                                break;

                            case 'activity.unsetOvernightAll':
                                residents.forEach(async (resident) => {
                                    const name = resident['name'];
                                    const deviceId = resident['id'] ? resident['id'] : name;
                                    const residentType = (await this.getObjectAsync(deviceId))?.native.type;
                                    const enabled = (await this.getStateAsync(deviceId + '.enabled'))?.val;

                                    if (residentType != 'pet' && enabled) {
                                        await this.setStateAsync(deviceId + '.activity.overnight', {
                                            val: false,
                                            ack: false,
                                        });
                                    }
                                });
                                break;

                            case 'activity.resetOvernightAll':
                                residents.forEach(async (resident) => {
                                    const name = resident['name'];
                                    const deviceId = resident['id'] ? resident['id'] : name;
                                    const residentType = (await this.getObjectAsync(deviceId))?.native.type;
                                    const enabled = (await this.getStateAsync(deviceId + '.enabled'))?.val;

                                    if (residentType != 'pet' && enabled) {
                                        const def = (await this.getObjectAsync(deviceId))?.common.def;
                                        await this.setStateAsync(deviceId + '.activity.overnight', {
                                            val: def,
                                            ack: false,
                                        });
                                    }
                                });
                                break;

                            case 'activity.setWayhomeAll':
                                residents.forEach(async (resident) => {
                                    const name = resident['name'];
                                    const deviceId = resident['id'] ? resident['id'] : name;
                                    const residentType = (await this.getObjectAsync(deviceId))?.native.type;
                                    const enabled = (await this.getStateAsync(deviceId + '.enabled'))?.val;

                                    if (residentType != 'pet' && enabled) {
                                        await this.setStateAsync(deviceId + '.activity.wayhome', {
                                            val: true,
                                            ack: false,
                                        });
                                    }
                                });
                                break;

                            case 'activity.unsetWayhomeAll':
                                residents.forEach(async (resident) => {
                                    const name = resident['name'];
                                    const deviceId = resident['id'] ? resident['id'] : name;
                                    const residentType = (await this.getObjectAsync(deviceId))?.native.type;
                                    const enabled = (await this.getStateAsync(deviceId + '.enabled'))?.val;

                                    if (residentType != 'pet' && enabled) {
                                        await this.setStateAsync(deviceId + '.activity.wayhome', {
                                            val: false,
                                            ack: false,
                                        });
                                    }
                                });
                                break;

                            default:
                                this.log.error('Received unknown command ' + id);
                                break;
                        }
                    }

                    // An individual residents device was controlled
                    else {
                        switch (channel) {
                            case 'enabled':
                                this.log.debug(device + ': Controlling ' + id);
                                this.enableResidentDevice(device, state.val);
                                break;

                            case 'activity':
                                this.log.debug(device + ': Controlling ' + id);
                                this.setResidentDeviceActivity(device, subChannel, state.val);
                                break;

                            case 'mood':
                                this.log.debug(device + ': Controlling ' + id);
                                this.setResidentDeviceMood(device, state.val);
                                break;

                            case 'presence':
                                this.log.debug(device + ': Controlling ' + id);
                                this.setResidentDevicePresence(device, subChannel, state.val);
                                break;

                            case 'presenceFollowing':
                                this.log.debug(device + ': Controlling ' + id);
                                this.setResidentDevicePresenceFollowing(device, subChannel, state.val);
                                break;

                            default:
                                this.log.error(device + ': Controlling unknown channel ' + id);
                                break;
                        }
                    }
                }

                // The state was updated (ack=true)
                else {
                    // An individual residents device was updated
                    if (device != 'control' && device != 'group') {
                        switch (channel) {
                            case 'activity':
                                if (subChannel === 'state') {
                                    this.log.debug("Received ack'ed update of " + id);
                                    this.setResidentsSummary();
                                }
                                break;

                            case 'enabled':
                                if (state.val === true) {
                                    this.log.debug("Received ack'ed enablement of " + device);
                                    this.setResidentsSummary();
                                }
                                break;

                            case 'mood':
                                if (subChannel === 'state') {
                                    this.log.debug("Received ack'ed update of " + id);
                                    this.setResidentsSummary();
                                }
                                break;

                            case 'presence':
                                if (subChannel === 'state') {
                                    this.log.debug("Received ack'ed update of " + id);
                                    this.setResidentsSummary();
                                }
                                break;

                            default:
                                this.log.error("Received unknown ack'ed update of " + id);
                                break;
                        }
                    }
                }
            }

            // The state was deleted
            else {
                this.log.debug('Unsubscribing from notifications for state ' + id);
                this.unsubscribeForeignStatesAsync(id);
                this.setResidentsSummary();
            }
        }

        // Foreign events
        else {
            if (state) {
                // The state was controlled (ack=false)
                if (!state.ack) {
                    //
                }
                // The state was updated (ack=true)
                else {
                    // parent instance state was updated
                    if (device === 'state') {
                        this.log.debug('Received parent state update from ' + eventNamespace);
                        this.setResidentsSummary();
                    }
                }
            }

            // The state was deleted
            else {
                this.log.debug('Unsubscribing from foreign notifications for parent state ' + id);
                this.unsubscribeForeignStatesAsync(id);
                this.setResidentsSummary();
            }
        }
    }

    /**
     * Is called from onStateChange()
     * @param {string} device
     * @param {string} activity
     * @param {number | boolean} state
     */
    async setResidentDeviceActivity(device, activity, state) {
        switch (activity) {
            case 'awake':
                await this.setStateAsync(device + '.activity.awake', { val: state, ack: true });
                await this.setResidentsSummary();
                break;

            case 'overnight':
                if (state) {
                    await this.setStateAsync(device + '.enabled', { val: state, ack: true });
                    await this.setStateAsync(device + '.activity.overnight', { val: state, ack: true });
                    await this.setResidentsSummary();
                } else {
                    [device].forEach(async (device2) => {
                        const currState = (await this.getStateAsync(device2 + '.presence.home'))?.val;
                        if (!currState) {
                            await this.setStateAsync(device + '.enabled', { val: state, ack: true });
                        }
                        await this.setStateAsync(device + '.activity.wayhome', { val: state, ack: true });
                        await this.setStateAsync(device + '.activity.overnight', { val: state, ack: true });
                        await this.setResidentsSummary();
                    });
                }
                break;

            case 'wayhome':
                if (state) {
                    await this.setStateAsync(device + '.enabled', { val: true, ack: true });
                }
                await this.setStateAsync(device + '.activity.wayhome', { val: state, ack: true });
                await this.setStateAsync(device + '.presence.state', { val: 0, ack: false });
                break;
        }
    }

    /**
     * Is called from onStateChange()
     * @param {string} device
     * @param {number} mood
     */
    async setResidentDeviceMood(device, mood) {
        await this.setStateAsync(device + '.mood.state', { val: mood, ack: true });
    }

    /**
     * Is called from onStateChange()
     * @param {string} device
     * @param {string} presence
     * @param {number | boolean} state
     */
    async setResidentDevicePresence(device, presence, state) {
        // @ts-ignore
        const residentType = (await this.getObjectAsync(device))?.native.type;
        let stateNight = false;
        let stateHome = false;

        if (residentType != 'pet') {
            await this.setStateAsync(device + '.mood.state', { val: 0, ack: true });
        }

        switch (presence) {
            case 'state':
                // When present at home
                // @ts-ignore
                if (state > 0) {
                    stateHome = true;

                    // When at sleep
                    if (state == 2) {
                        stateNight = true;
                    }

                    await this.setStateAsync(device + '.enabled', { val: true, ack: true });
                    if (residentType != 'pet') {
                        await this.setStateAsync(device + '.activity.wayhome', { val: false, ack: true });
                    }
                }

                if (residentType != 'pet') {
                    await this.setStateAsync(device + '.activity.awake', { val: false, ack: true });
                }

                await this.setStateAsync(device + '.presence.home', { val: stateHome, ack: true });
                await this.setStateAsync(device + '.presence.away', { val: !stateHome, ack: true });
                if (residentType != 'pet') {
                    await this.setStateAsync(device + '.presence.night', { val: stateNight, ack: true });
                }
                this.setStateAsync(device + '.presence.state', { val: state, ack: true });
                break;

            case 'home':
                if (state) {
                    await this.setStateAsync(device + '.presence.state', { val: 1, ack: false });
                } else {
                    await this.setStateAsync(device + '.presence.state', { val: 0, ack: false });
                }
                break;

            case 'night':
                if (state) {
                    await this.setStateAsync(device + '.presence.state', { val: 2, ack: false });
                } else {
                    [device].forEach(async (device2) => {
                        const currState = (await this.getStateAsync(device2 + '.presence.home'))?.val;
                        if (currState) {
                            await this.setStateAsync(device2 + '.presence.state', { val: 1, ack: false });
                        } else {
                            await this.setStateAsync(device2 + '.presence.state', { val: 0, ack: false });
                        }
                    });
                }
                break;

            case 'away':
                if (state) {
                    await this.setStateAsync(device + '.presence.state', { val: 0, ack: false });
                } else {
                    await this.setStateAsync(device + '.presence.state', { val: 1, ack: false });
                }
                break;
        }
    }

    /**
     * Is called from onStateChange()
     * @param {string} device
     * @param {string} presence
     * @param {string | number | boolean} state
     */
    async setResidentDevicePresenceFollowing(device, presence, state) {
        await this.setStateAsync(device + '.presenceFollowing.' + presence, { val: state, ack: true });
    }

    /**
     * Is called from onStateChange()
     * @param {string} device
     * @param {boolean} val
     */
    async enableResidentDevice(device, val) {
        await this.setStateAsync(device + '.enabled', { val: val, ack: true });
        if (!val) {
            await this.setResidentDevicePresence(device, 'state', 0);
        }
    }

    async setResidentsSummary() {
        /**
         * @type {Array}
         */
        let residents = this.config.roomie;
        residents = residents.concat(this.config.pet);
        residents = residents.concat(this.config.guest);

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

        for (const resident of residents) {
            const name = resident['name'];
            const deviceId = resident['id'] ? resident['id'] : name;
            const residentType = (await this.getObjectAsync(deviceId))?.native.type;
            const currEnabled = (await this.getStateAsync(deviceId + '.enabled'))?.val;
            const currState = (await this.getStateAsync(deviceId + '.presence.state'))?.val;
            const currWayhome = (await this.getStateAsync(deviceId + '.activity.wayhome'))?.val;
            const currOvernight = (await this.getStateAsync(deviceId + '.activity.overnight'))?.val;
            const currAwake = (await this.getStateAsync(deviceId + '.activity.awake'))?.val;
            const currMood = (await this.getStateAsync(deviceId + '.mood.state'))?.val;

            if (currOvernight) {
                overnightBool = true;
                overnightCount++;
                overnightList.push({ name: name, id: this.namespace + '.' + deviceId });
            }

            if (currAwake) {
                awakeBool = true;
                awakeCount++;
                awakeList.push({ name: name, id: this.namespace + '.' + deviceId });
            }

            // When present at home
            // @ts-ignore
            if (currState >= 1) {
                if (residentType == 'pet') {
                    totalPetCount++;
                } else {
                    totalResidentsCount++;
                    moodCount = moodCount + currMood;
                }

                if (residentType == 'pet') {
                    petHomeBool = true;
                    petHomeCount++;
                    petHomeList.push({ name: name, id: this.namespace + '.' + deviceId });
                } else {
                    homeBool = true;
                    homeCount++;
                    homeList.push({ name: name, id: this.namespace + '.' + deviceId });
                }

                // When at sleep
                // @ts-ignore
                if (currState == 2) {
                    nightBool = true;
                    nightCount++;
                    nightList.push({ name: name, id: this.namespace + '.' + deviceId });
                }
            }

            // @ts-ignore
            else if (currState == 0) {
                // When away from home
                // @ts-ignore
                if (currEnabled) {
                    if (residentType == 'pet') {
                        totalPetCount++;
                    } else {
                        totalResidentsCount++;
                    }
                    awayBool = true;
                    awayCount++;
                    awayList.push({ name: name, id: this.namespace + '.' + deviceId });

                    // When on way home
                    // @ts-ignore
                    if (currWayhome) {
                        wayhomeBool = true;
                        wayhomeCount++;
                        wayhomeList.push({ name: name, id: this.namespace + '.' + deviceId });
                    }
                }

                // When absent from home for longer period
                else {
                    disabledBool = true;
                    disabledCount++;
                    disabledList.push({ name: name, id: this.namespace + '.' + deviceId });
                }
            }
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

        let residentsState = -1;
        if (petHomeCount > 0) {
            residentsState = 1;
        }
        if (totalResidentsCount > 0) {
            residentsState = 0;
            if (petHomeCount > 0) {
                residentsState = 1;
            }
            if (wayhomeCount > 0) {
                residentsState = 2;
            }
            if (homeCount > 0) {
                residentsState = 3;
                if (nightCount > 0 && nightCount == homeCount) {
                    residentsState = 7;
                }
                if (awakeCount > 0 && awakeCount == homeCount) {
                    residentsState = 5;
                }
            }
        }

        this.log.debug('Calculated overall state: ' + residentsState);
        await this.setStateAsync('state', { val: residentsState, ack: true });

        const moodAverage = homeCount > 0 ? moodCount / homeCount : 0;
        await this.setStateAsync('mood', {
            // Strive for the golden middle
            val: moodAverage > 0 ? Math.floor(moodAverage) : Math.ceil(moodAverage),
            ack: true,
        });

        // Group states
        if (this.config.residentsParentInstanceIDs.length > 0) {
            let leadingInstance = this.namespace;
            let groupState = residentsState;
            let groupMood = moodAverage;
            let moodFoundCounter = 0;

            for (let index = 0; index < this.config.residentsParentInstanceIDs.length; index++) {
                const parentInstance = this.config.residentsParentInstanceIDs[index];

                const parentState = (await this.getForeignStateAsync(parentInstance + '.state'))?.val;
                if (parentState != null && typeof parentState !== 'undefined') {
                    // For presence at home, aim for the lower (= more awake) number
                    if (groupState >= 3 && parentState >= 3) {
                        if (parentState < groupState) {
                            leadingInstance = parentInstance;
                            this.log.debug(
                                'Group state: Leading lower parent value from ' + parentInstance + ': ' + parentState,
                            );
                            groupState = parentState;
                        }

                        const moodState = (await this.getForeignStateAsync(parentInstance + '.mood'))?.val;
                        moodFoundCounter++;
                        groupMood = groupMood + moodState;
                    }

                    // Otherwise, aim for the higher value
                    else {
                        if (parentState > groupState) {
                            leadingInstance = parentInstance;
                            this.log.debug(
                                'Group state: Leading higher parent value from ' + parentInstance + ': ' + parentState,
                            );
                            groupState = parentState;
                        }
                    }
                }
            }

            await this.setStateAsync('group.info.state.originID', { val: leadingInstance, ack: true });

            const groupMoodAverage = moodFoundCounter > 0 ? groupMood / (moodFoundCounter + 1) : groupMood;
            await this.setStateAsync('group.mood', {
                // Strive for the golden middle
                val: groupMoodAverage > 0 ? Math.floor(groupMoodAverage) : Math.ceil(groupMoodAverage),
                ack: true,
            });

            this.log.debug('Group state: Final value is ' + groupState + ' from ' + leadingInstance);
            await this.setStateAsync('group.state', { val: groupState, ack: true });
        }
    }

    cleanNamespace(id) {
        return id
            .trim()
            .replace(/\s/g, '_') // Replace whitespaces with underscores
            .replace(/[^\p{Ll}\p{Lu}\p{Nd}]+/gu, '_') // Replace not allowed chars with underscore
            .replace(/[_]+$/g, '') // Remove underscores end
            .replace(/^[_]+/g, '') // Remove underscores beginning
            .replace(/_+/g, '_') // Replace multiple underscores with one
            .toLowerCase()
            .replace(/_([a-z])/g, (m, w) => {
                return w.toUpperCase();
            });
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
