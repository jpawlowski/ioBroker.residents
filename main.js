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
        this.states = [];

        this.absentTimeout = null;
        this.overnightTimeout = null;
        this.calculationTimeout = null;

        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    async onReady() {
        this.roomies = this.config.roomie;
        this.pets = this.config.pet;
        this.guests = this.config.guest;
        this.residents = this.roomies;
        this.residents = this.residents.concat(this.config.pet);
        this.residents = this.residents.concat(this.config.guest);

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
                    this.subscriptions.push(instance + '.mood');
                    this.subscriptions.push(instance + '.state');
                    subscribedToParentEvents = true;
                }
            }

            if (subscribedToParentEvents) {
                const objectTemplates =
                    // @ts-ignore
                    (await this.getForeignObjectAsync('system.adapter.' + this.namespace))?.instanceObjects;

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

                this.subscriptions.push('group.state');
                this.subscriptions.push('group.mood');
            }
        }

        await this.setStateChangedAsync('info.state.parentInstanceIDs', {
            val: JSON.stringify(this.config.residentsParentInstanceIDs),
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
                await this.setStateChangedAsync(id + '.info.name', { val: name, ack: true });

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
                        if (Number(key) < 1000) {
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
                                },
                                type: 'number',
                                role: 'level.mode.resident.task',
                                min: 1000,
                                max: 12999,
                                read: true,
                                write: true,
                                def: 1000,
                                desc: {
                                    en: 'The task the resident is going after right now.',
                                    de: 'Die Aufgabe, der der Bewohner gerade nachgeht.',
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
                        id + '.activity.wakeupSnooze',
                        {
                            type: 'state',
                            common: {
                                name: {
                                    en: name + ' has snoozed the wake-up call?',
                                    de: name + ' hat den Weckruf pausiert?',
                                },
                                type: 'boolean',
                                role: 'button.residents.wakeupSnoozed',
                                read: false,
                                write: true,
                                def: true,
                                desc: {
                                    en: 'Has this resident currently snoozed a wake-up call?',
                                    de: 'Hat dieser Bewohner gerade einen Weckruf pausiert?',
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

                this.subscriptions.push(id + '.enabled');
                this.subscriptions.push(id + '.activity.*');
                this.subscriptions.push(id + '.mood.state');
                this.subscriptions.push(id + '.presence.*');
                this.subscriptions.push(id + '.presenceFollowing.*');

                if (
                    resident.foreignPresenceObjectId !== undefined &&
                    typeof resident.foreignPresenceObjectId === 'string' &&
                    resident.foreignPresenceObjectId != ''
                ) {
                    this.foreignSubscriptions.push(resident.foreignPresenceObjectId);
                    if (this.presenceSubscriptionMapping[resident.foreignPresenceObjectId] === undefined)
                        this.presenceSubscriptionMapping[resident.foreignPresenceObjectId] = [];
                    this.presenceSubscriptionMapping[resident.foreignPresenceObjectId].push(id);
                }

                // Yahka instance update
                if (
                    resident['yahkaInstanceId'] &&
                    resident['yahkaInstanceId'] !== '' &&
                    resident['yahkaInstanceId'] !== 'none'
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
                        currentYahkaConf.common.name === 'yahka' &&
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

        for (const pattern in this.subscriptions) {
            const stateList = await this.getStatesAsync(this.subscriptions[pattern]);
            for (const id in stateList) {
                this.states[id] = stateList[id];
                this.log.silly('Subscribing to events for ' + id);
                this.subscribeStates(id);
            }
        }
        for (const pattern in this.foreignSubscriptions) {
            const stateList = await this.getForeignStatesAsync(this.foreignSubscriptions[pattern]);
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
     * Disable any resident that is currently away, assuming to be away for the day as there was no overnight
     *
     * @param {boolean} [initialize]
     */
    timeoutDisableAbsentResidents(initialize) {
        if (!initialize) {
            this.residents.forEach(async (resident) => {
                const enabled = (await this.getStateAsync(resident['id'] + '.enabled'))?.val;
                const away = (await this.getStateAsync(resident['id'] + '.presence.away'))?.val;

                if (enabled === false) {
                    this.log.debug(
                        'timeoutDisableAbsentResidents: ' +
                            resident['id'] +
                            " is already 'disabled', therefore it is not changed.",
                    );
                } else if (away === false) {
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
                `Creating absent timeout in ${runtimeMilliseconds}ms (in ${this.convertMillisecondsToDuration(
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
                const home = (await this.getStateAsync(resident['id'] + '.presence.home'))?.val;
                const overnight = (await this.getStateAsync(resident['id'] + '.activity.overnight'))?.val;
                const overnightDef = (await this.getObjectAsync(resident['id']))?.common.def;

                if (resident['type'] === 'pet') {
                    this.log.debug(
                        'timeoutResetOvernight: ' + resident['id'] + ' is a pet without night state - ignoring.',
                    );
                } else if (resident['type'] === 'guest') {
                    this.log.debug(
                        'timeoutResetOvernight: ' +
                            resident['id'] +
                            ' is a guest, therefore is excluded from automatic reset.',
                    );
                } else if (overnight === overnightDef) {
                    this.log.debug(
                        'timeoutResetOvernight: ' +
                            resident['id'] +
                            " activity 'overnight' is already " +
                            overnightDef +
                            ', therefore is not changed.',
                    );
                } else if (home === false) {
                    this.log.debug(
                        'timeoutResetOvernight: ' + resident['id'] + ' is not at home, therefore is excluded.',
                    );
                } else {
                    this.log.info(
                        "timeoutResetOvernight: Resetting 'overnight' for" +
                            resident['id'] +
                            ' to ' +
                            overnightDef +
                            '.',
                    );
                    await this.setStateChangedAsync(resident['id'] + '.activity.overnight', {
                        val: overnightDef,
                        ack: false,
                    });
                }
            });
        }

        // Create new timeout
        const runtimeMilliseconds = this.getMillisecondsUntilTime(this.config.ResetOvernightDailyTimer);
        if (runtimeMilliseconds != null) {
            this.log.debug(
                `Creating overnight reset timeout in ${runtimeMilliseconds}ms (in ${this.convertMillisecondsToDuration(
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
     * Is called if a subscribed state changes
     * @param {string} id
     * @param {ioBroker.State | null | undefined} state
     */
    onStateChange(id, state) {
        const a = id.split('.');
        const adapterName = a.shift(); // adapter name
        const adapterInstance = a.shift(); // adapter instance
        const eventNamespace = adapterName + '.' + adapterInstance; // adapter namespace
        const level1 = a.shift(); // first level ID
        const level2 = a.shift(); // second level ID
        const level3 = a.shift(); // third level ID
        const allLevels = [level1, level2, level3].join('.');
        // const levels1_2 = [level1, level2].join('.');
        const levels2_3 = [level2, level3].join('.');

        if (typeof level1 != 'string') return;

        const oldState = this.states[id];
        this.states[id] = state;

        // Own events
        if (eventNamespace === this.namespace) {
            if (state) {
                // The state was controlled (ack=false)
                if (!state.ack) {
                    // Global residents commands
                    if (level1 === 'control') {
                        switch (levels2_3) {
                            case 'state.disableAll':
                                this.residents.forEach(async (resident) => {
                                    const enabled = (await this.getStateAsync(resident['id'] + '.enabled'))?.val;
                                    const away = (await this.getStateAsync(resident['id'] + '.presence.away'))?.val;

                                    if (enabled === false) {
                                        this.log.debug(
                                            allLevels +
                                                ': ' +
                                                resident['id'] +
                                                " is already 'disabled', therefore it is not changed.",
                                        );
                                    } else if (away === false) {
                                        this.log.debug(
                                            allLevels +
                                                ': ' +
                                                resident['id'] +
                                                " is not 'away', therefore it is not disabled.",
                                        );
                                    } else {
                                        this.log.info(allLevels + ': Disabling absent device ' + resident['id'] + '.');
                                        await this.setStateAsync(resident['id'] + '.enabled', {
                                            val: false,
                                            ack: false,
                                        });
                                    }
                                });
                                break;

                            case 'state.enableAll':
                                this.residents.forEach(async (resident) => {
                                    const enabled = (await this.getStateAsync(resident['id'] + '.enabled'))?.val;

                                    if (enabled === true) {
                                        this.log.debug(
                                            allLevels +
                                                ': ' +
                                                resident['id'] +
                                                " is already 'enabled', therefore it is not changed.",
                                        );
                                    } else {
                                        this.log.info(allLevels + ': Enabling device ' + resident['id'] + '.');
                                        await this.setStateAsync(resident['id'] + '.enabled', {
                                            val: true,
                                            ack: false,
                                        });
                                    }
                                });
                                break;

                            case 'presence.setHomeAll':
                                this.residents.forEach(async (resident) => {
                                    const enabled = (await this.getStateAsync(resident['id'] + '.enabled'))?.val;
                                    const home = (await this.getStateAsync(resident['id'] + '.presence.home'))?.val;

                                    if (home == true) {
                                        this.log.debug(
                                            allLevels +
                                                ': ' +
                                                resident['id'] +
                                                " is already 'home', therefore it is not changed.",
                                        );
                                    } else if (enabled === true) {
                                        this.log.info(allLevels + ': Changing ' + resident['id'] + " to 'home'.");
                                        await this.setStateAsync(resident['id'] + '.presence.home', {
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

                            case 'presence.unsetHomeAll':
                                this.residents.forEach(async (resident) => {
                                    const enabled = (await this.getStateAsync(resident['id'] + '.enabled'))?.val;
                                    const home = (await this.getStateAsync(resident['id'] + '.presence.home'))?.val;

                                    if (home == false) {
                                        this.log.debug(
                                            allLevels +
                                                ': ' +
                                                resident['id'] +
                                                " is already 'away', therefore it is not changed.",
                                        );
                                    } else if (enabled === true) {
                                        this.log.info(allLevels + ': Changing ' + resident['id'] + " to 'away'.");
                                        await this.setStateAsync(resident['id'] + '.presence.home', {
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

                            case 'presence.setNightAll':
                                this.residents.forEach(async (resident) => {
                                    const home = (await this.getStateAsync(resident['id'] + '.presence.home'))?.val;
                                    const night = (await this.getStateAsync(resident['id'] + '.presence.night'))?.val;

                                    if (resident['type'] === 'pet') {
                                        this.log.debug(
                                            allLevels +
                                                ': ' +
                                                resident['id'] +
                                                ' is a pet without night state - ignoring.',
                                        );
                                    } else if (night === true) {
                                        this.log.debug(
                                            allLevels +
                                                ': ' +
                                                resident['id'] +
                                                " is already at 'night', therefore it is not changed.",
                                        );
                                    } else if (home === false) {
                                        this.log.debug(
                                            allLevels +
                                                ': ' +
                                                resident['id'] +
                                                " is not 'home', therefore is is excluded from group control.",
                                        );
                                    } else {
                                        this.log.info(allLevels + ': Changing ' + resident['id'] + " to 'night'.");
                                        await this.setStateAsync(resident['id'] + '.presence.night', {
                                            val: true,
                                            ack: false,
                                        });
                                    }
                                });
                                break;

                            case 'presence.unsetNightAll':
                                this.residents.forEach(async (resident) => {
                                    const home = (await this.getStateAsync(resident['id'] + '.presence.home'))?.val;
                                    const night = (await this.getStateAsync(resident['id'] + '.presence.night'))?.val;

                                    if (resident['type'] === 'pet') {
                                        this.log.debug(
                                            allLevels +
                                                ': ' +
                                                resident['id'] +
                                                ' is a pet without night state - ignoring.',
                                        );
                                    } else if (night === false) {
                                        this.log.debug(
                                            allLevels +
                                                ': ' +
                                                resident['id'] +
                                                " is already not 'night', therefore it is not changed.",
                                        );
                                    } else if (home === false) {
                                        this.log.debug(
                                            allLevels +
                                                ': ' +
                                                resident['id'] +
                                                " is not 'home', therefore is is excluded from group control.",
                                        );
                                    } else {
                                        this.log.info(allLevels + ': Changing ' + resident['id'] + " to not 'night'.");
                                        await this.setStateAsync(resident['id'] + '.presence.night', {
                                            val: false,
                                            ack: false,
                                        });
                                    }
                                });
                                break;

                            case 'presence.setAwayAll':
                                this.residents.forEach(async (resident) => {
                                    const away = (await this.getStateAsync(resident['id'] + '.presence.away'))?.val;

                                    if (away === true) {
                                        this.log.debug(
                                            allLevels +
                                                ': ' +
                                                resident['id'] +
                                                " is already at 'away', therefore it is not changed.",
                                        );
                                    } else {
                                        this.log.info(allLevels + ': Changing ' + resident['id'] + " to 'away'.");
                                        await this.setStateAsync(resident['id'] + '.presence.away', {
                                            val: true,
                                            ack: false,
                                        });
                                    }
                                });
                                break;

                            case 'presence.unsetAwayAll':
                                this.residents.forEach(async (resident) => {
                                    const away = (await this.getStateAsync(resident['id'] + '.presence.away'))?.val;

                                    if (away === false) {
                                        this.log.debug(
                                            allLevels +
                                                ': ' +
                                                resident['id'] +
                                                " is already at not 'away', therefore it is not changed.",
                                        );
                                    } else {
                                        this.log.info(allLevels + ': Changing ' + resident['id'] + " to not 'away'.");
                                        await this.setStateAsync(resident['id'] + '.presence.away', {
                                            val: false,
                                            ack: false,
                                        });
                                    }
                                });
                                break;

                            case 'activity.setOvernightAll':
                                this.residents.forEach(async (resident) => {
                                    const enabled = (await this.getStateAsync(resident['id'] + '.enabled'))?.val;
                                    const overnight = (await this.getStateAsync(resident['id'] + '.activity.overnight'))
                                        ?.val;

                                    if (resident['type'] === 'pet') {
                                        this.log.debug(
                                            allLevels +
                                                ': ' +
                                                resident['id'] +
                                                ' is a pet without night state - ignoring.',
                                        );
                                    } else if (overnight === true) {
                                        this.log.debug(
                                            allLevels +
                                                ': ' +
                                                resident['id'] +
                                                " activity 'overnight' is already active, therefore it is not changed.",
                                        );
                                    } else if (enabled === false) {
                                        this.log.debug(
                                            allLevels +
                                                ': ' +
                                                resident['id'] +
                                                " is 'disabled', therefore is is excluded from group control.",
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

                            case 'activity.unsetOvernightAll':
                                this.residents.forEach(async (resident) => {
                                    const enabled = (await this.getStateAsync(resident['id'] + '.enabled'))?.val;
                                    const overnight = (await this.getStateAsync(resident['id'] + '.activity.overnight'))
                                        ?.val;

                                    if (resident['type'] === 'pet') {
                                        this.log.debug(
                                            allLevels +
                                                ': ' +
                                                resident['id'] +
                                                ' is a pet without night state - ignoring.',
                                        );
                                    } else if (overnight === false) {
                                        this.log.debug(
                                            allLevels +
                                                ': ' +
                                                resident['id'] +
                                                " activity 'overnight' is already disabled, therefore it is not changed.",
                                        );
                                    } else if (enabled === false) {
                                        this.log.debug(
                                            allLevels +
                                                ': ' +
                                                resident['id'] +
                                                " is 'disabled', therefore is is excluded from group control.",
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

                            case 'activity.resetOvernightAll':
                                this.residents.forEach(async (resident) => {
                                    const enabled = (await this.getStateAsync(resident['id'] + '.enabled'))?.val;
                                    const overnight = (await this.getStateAsync(resident['id'] + '.activity.overnight'))
                                        ?.val;
                                    const overnightDef = (await this.getObjectAsync(resident['id']))?.common.def;

                                    if (resident['type'] === 'pet') {
                                        this.log.debug(
                                            allLevels +
                                                ': ' +
                                                resident['id'] +
                                                ' is a pet without night state - ignoring.',
                                        );
                                    } else if (overnight === overnightDef) {
                                        this.log.debug(
                                            allLevels +
                                                ': ' +
                                                resident['id'] +
                                                " activity 'overnight' is already " +
                                                overnightDef +
                                                ', therefore it is not changed.',
                                        );
                                    } else if (enabled === false) {
                                        this.log.debug(
                                            allLevels +
                                                ': ' +
                                                resident['id'] +
                                                " is 'disabled', therefore is is excluded from group control.",
                                        );
                                    } else {
                                        this.log.info(
                                            allLevels +
                                                ": Resetting 'overnight' for" +
                                                resident['id'] +
                                                "'overnight' to " +
                                                overnightDef +
                                                '.',
                                        );
                                        await this.setStateChangedAsync(resident['id'] + '.activity.overnight', {
                                            val: overnightDef,
                                            ack: false,
                                        });
                                    }
                                });
                                break;

                            case 'activity.setWayhomeAll':
                                this.residents.forEach(async (resident) => {
                                    const wayhome = (await this.getStateAsync(resident['id'] + '.activity.wayhome'))
                                        ?.val;

                                    if (resident['type'] === 'pet') {
                                        this.log.debug(
                                            allLevels +
                                                ': ' +
                                                resident['id'] +
                                                ' is a pet without wayhome state - ignoring.',
                                        );
                                    } else if (wayhome === true) {
                                        this.log.debug(
                                            allLevels +
                                                ': ' +
                                                resident['id'] +
                                                " activity 'wayhome' is already active, therefore it is not changed.",
                                        );
                                    } else {
                                        this.log.info(allLevels + ': Enabling ' + resident['id'] + "for 'wayhome'.");
                                        await this.setStateAsync(resident['id'] + '.activity.wayhome', {
                                            val: true,
                                            ack: false,
                                        });
                                    }
                                });
                                break;

                            case 'activity.unsetWayhomeAll':
                                this.residents.forEach(async (resident) => {
                                    const wayhome = (await this.getStateAsync(resident['id'] + '.activity.wayhome'))
                                        ?.val;

                                    if (resident['type'] === 'pet') {
                                        this.log.debug(
                                            allLevels +
                                                ': ' +
                                                resident['id'] +
                                                ' is a pet without wayhome state - ignoring.',
                                        );
                                    } else if (wayhome === false) {
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

                            default:
                                this.log.warn('Received unknown command ' + level2 + '.' + level3);
                                break;
                        }

                        this.setStateAsync(id, {
                            val: state.val,
                            ack: true,
                            from: state.from,
                        });
                    }

                    // An individual residents device was controlled
                    else {
                        switch (level2) {
                            case 'enabled':
                                this.log.debug(level1 + ': Controlling ' + id);
                                this.enableResidentDevice(level1, state, oldState);
                                break;

                            case 'activity':
                                if (typeof level3 != 'string') return;
                                this.log.debug(level1 + ': Controlling ' + id);
                                this.setResidentDeviceActivity(level1, level3, state, oldState);
                                break;

                            case 'mood':
                                this.log.debug(level1 + ': Controlling ' + id);
                                this.setResidentDeviceMood(level1, state);
                                break;

                            case 'presence':
                                if (typeof level3 != 'string') return;
                                this.log.debug(level1 + ': Controlling ' + id);
                                this.setResidentDevicePresence(level1, level3, state, oldState);
                                break;

                            case 'presenceFollowing':
                                if (typeof level3 != 'string') return;
                                this.log.debug(level1 + ': Controlling ' + id);
                                this.setResidentDevicePresenceFollowing(level1, level3, state, oldState);
                                break;

                            default:
                                this.log.warn(level1 + ': Controlling unknown channel ' + level2);
                                break;
                        }
                    }
                }

                // The state was updated (ack=true)
                else {
                    // ignore some of our own ack events
                    if (
                        level1 === 'control' ||
                        level1 === 'group' ||
                        level1 === 'info' ||
                        level1 === 'mood' ||
                        level1 === 'state'
                    ) {
                        return;
                    }

                    switch (level2) {
                        case 'activity':
                            if (level3 === 'state') {
                                this.log.debug(this.namespace + ": Received ack'ed update of " + id);
                                this.setResidentsSummary();
                            }
                            break;

                        case 'enabled':
                            if (state.val === true) {
                                this.log.debug(this.namespace + ": Received ack'ed enablement of " + level1);
                                this.setResidentsSummary();
                            }
                            break;

                        case 'mood':
                            if (level3 === 'state') {
                                this.log.debug(this.namespace + ": Received ack'ed update of " + id);
                                this.setResidentsSummary();
                            }
                            break;

                        case 'presence':
                            if (level3 === 'state') {
                                this.log.debug(this.namespace + ": Received ack'ed update of " + id);
                                this.setResidentsSummary();
                            }
                            break;

                        default:
                            this.log.warn(this.namespace + ": Received unknown ack'ed update of " + id);
                            break;
                    }
                }
            }

            // The state was deleted
            else {
                this.setResidentsSummary();
            }
        }

        // Foreign residents instance events
        else if (adapterName === 'residents') {
            if (state) {
                // The state was controlled (ack=false)
                if (!state.ack) {
                    //
                }
                // The state was updated (ack=true)
                else {
                    // parent instance state was updated
                    if (level1 === 'state') {
                        this.log.debug('Received parent state update from ' + eventNamespace);
                        this.setResidentsSummary();
                    }
                }
            }

            // The state was deleted
            else {
                this.setResidentsSummary();
            }
        }

        // Other foreign events
        else {
            if (state) {
                // The state was controlled (ack=false)
                if (!state.ack) {
                    //
                }
                // The state was updated (ack=true)
                else {
                    // @ts-ignore
                    this.setResidentDevicePresenceFromEvent(id, state);
                }
            }

            // The state was deleted
            else {
                //
            }
        }
    }

    /**
     * Is called from onStateChange()
     * @param {string} device
     * @param {string} activity
     * @param {ioBroker.State} state
     * @param {ioBroker.State} oldState
     */
    async setResidentDeviceActivity(device, activity, state, oldState) {
        const currPresenceState = (await this.getStateAsync(device + '.presence.state'))?.val;
        if (typeof currPresenceState != 'number') return;
        let currActivityState = (await this.getStateAsync(device + '.activity.state'))?.val;
        if (typeof currActivityState != 'number') return;
        currActivityState = currActivityState >= 10000 ? currActivityState - 10000 : currActivityState;
        let nextActivityState = currActivityState;
        let currDndState = (await this.getStateAsync(device + '.activity.dnd'))?.val;
        if (activity === 'dnd') currDndState = oldState.val;
        if (typeof currDndState != 'boolean') return;

        const enabled = (await this.getStateAsync(device + '.enabled'))?.val;

        let stateAwake = false;
        let stateBedtime = 0;
        let stateWakeup = false;
        let stateWayhome = false;

        switch (activity) {
            case 'state':
                if (typeof state.val != 'number') return;
                nextActivityState = state.val;

                // 000-0999: Not present at home / Away
                if (nextActivityState === 2) {
                    stateWayhome = true;
                }

                // 1000-1999: WAKING TIME at home
                else if (nextActivityState >= 1000 && nextActivityState < 2000) {
                    // 1900-1999: WAKING TIME at home: Transitioning to Sleeping Time
                    if (nextActivityState === 1900) {
                        stateBedtime = 1;
                    } else if (nextActivityState === 1901) {
                        stateBedtime = 2;
                    } else if (nextActivityState === 1902) {
                        stateBedtime = 3;
                    }
                }

                // 2000-2999: SLEEPING TIME at home
                else if (nextActivityState >= 2000 && nextActivityState < 3000) {
                    // 2000-2099: SLEEPING TIME at home: While I should be sleeping
                    if (nextActivityState >= 2010 && nextActivityState < 2020) {
                        stateAwake = true;
                    }

                    // 2100-2199: SLEEPING TIME at home: While I should get up
                    else if (nextActivityState >= 2100 && nextActivityState < 2200) {
                        stateWakeup = true;

                        if (currActivityState >= 2100) {
                            nextActivityState = currActivityState;
                            if (currActivityState < 2105) currActivityState++;
                        }
                    }

                    // 2200-2299: SLEEPING TIME at home: Transitioning to Waking Time
                    else if (nextActivityState >= 2200) {
                        stateAwake = true;
                    }
                }

                // Reflect DND in state value
                if (currDndState === true && nextActivityState < 10000) {
                    nextActivityState += 10000;
                } else if (currDndState === false && nextActivityState >= 10000) {
                    nextActivityState -= 10000;
                }

                await this.setStateChangedAsync(device + '.activity.awake', { val: stateAwake, ack: true });
                await this.setStateChangedAsync(device + '.activity.bedtime', { val: stateBedtime, ack: true });
                await this.setStateChangedAsync(device + '.activity.wakeup', { val: stateWakeup, ack: true });
                await this.setStateChangedAsync(device + '.activity.wayhome', { val: stateWayhome, ack: true });

                state.val = nextActivityState;
                state.ack = true;
                this.setStateChangedAsync(device + '.activity.state', state);
                break;

            case 'awake':
                if (state.val === true) {
                    // Awake during night >> irregular occurance
                    if (currActivityState === 2000 || currActivityState === 2010 || currActivityState === 2020) {
                        await this.setStateChangedAsync(device + '.activity.state', { val: 2010, ack: false });
                    }

                    // Awake during wakeup >> got up from sleep
                    else if (currActivityState >= 2100) {
                        await this.setStateChangedAsync(device + '.activity.state', { val: 2200, ack: false });
                    } else {
                        await this.setStateChangedAsync(device + '.activity.state', { val: 2210, ack: false });
                    }
                } else {
                    if (currActivityState >= 2010 && currActivityState < 2020) {
                        await this.setStateChangedAsync(device + '.activity.state', { val: 2020, ack: false });
                    } else {
                        await this.setStateChangedAsync(device + '.activity.state', { val: 1000, ack: false });
                    }
                }
                break;

            case 'bedtime':
                if (currPresenceState === 1) {
                    if (state.val === 1) {
                        await this.setStateChangedAsync(device + '.activity.state', { val: 1900, ack: false });
                    } else if (state.val === 2) {
                        await this.setStateChangedAsync(device + '.activity.state', { val: 1901, ack: false });
                    } else if (state.val === 3) {
                        await this.setStateChangedAsync(device + '.activity.state', { val: 1902, ack: false });
                    } else {
                        await this.setStateChangedAsync(device + '.activity.state', { val: 1000, ack: false });
                    }
                } else {
                    this.log.warn(device + ' requires home state to start bedtime process');
                    state.val = 0;
                    state.q = 0x40;
                    await this.setStateAsync(device + '.activity.bedtime', state);
                }
                break;

            case 'dnd':
                if (state.val === true && currPresenceState === 0) {
                    state.val = false;
                    state.q = 0x40;
                }
                state.ack = true;
                await this.setStateAsync(device + '.activity.dnd', state);
                await this.setStateChangedAsync(device + '.activity.state', { val: currActivityState, ack: false });
                break;

            case 'overnight':
                if (state.val === true) {
                    await this.setStateChangedAsync(device + '.enabled', { val: state.val, ack: true });
                    await this.setStateAsync(device + '.activity.overnight', {
                        val: state.val,
                        ack: true,
                        from: state.from,
                    });
                } else {
                    if (currPresenceState === 0) {
                        await this.setStateChangedAsync(device + '.enabled', { val: state.val, ack: true });
                    }
                    await this.setStateChangedAsync(device + '.activity.wayhome', { val: state.val, ack: false });
                    await this.setStateAsync(device + '.activity.overnight', {
                        val: state.val,
                        ack: true,
                        from: state.from,
                    });
                }
                await this.setResidentsSummary();
                break;

            case 'task':
                state.ack = true;
                if (currPresenceState === 1) {
                    if (state.val === true) {
                        //
                    } else {
                        //
                    }
                    await this.setStateAsync(device + '.activity.task', state);
                    state.ack = false;
                    await this.setStateChangedAsync(device + '.activity.state', state);
                } else {
                    if (state.val === true) {
                        this.log.warn(device + ' requires home state to set specific tasks');
                        state.val = oldState.val;
                        state.q = 0x40;
                    }
                    await this.setStateAsync(device + '.activity.task', state);
                }
                break;

            case 'wakeup':
                state.ack = true;
                if (currPresenceState === 2) {
                    await this.setStateAsync(device + '.activity.wakeup', state);
                    let newActivityVal;
                    if (state.val === true) {
                        newActivityVal = currActivityState >= 2100 ? currActivityState : 2100;
                    } else {
                        newActivityVal = currActivityState >= 2100 ? 2200 : 1000;
                    }
                    await this.setStateChangedAsync(device + '.activity.state', { val: newActivityVal, ack: false });
                } else {
                    if (state.val === true) {
                        this.log.warn(device + ' requires night state to start a wake-up call');
                        state.val = false;
                        state.q = 0x40;
                    }
                    await this.setStateAsync(device + '.activity.wakeup', state);
                }
                break;

            case 'wakeupSnooze':
                if (state.val != true) return;
                state.ack = true;
                if (currActivityState >= 2100) {
                    if (currActivityState < 2105) currActivityState++;
                    await this.setStateChangedAsync(device + '.activity.state', { val: currActivityState, ack: false });
                } else {
                    this.log.debug(device + ' has no wake-up call running that could be snoozed');
                    state.val = true;
                    state.q = 0x41;
                }
                await this.setStateAsync(device + '.activity.wakeupSnooze', state);
                break;

            case 'wayhome':
                if (state.val === true) {
                    await this.setStateChangedAsync(device + '.enabled', { val: true, ack: true });
                    await this.setStateChangedAsync(device + '.activity.state', { val: 2, ack: false });
                } else if (enabled === true) {
                    await this.setStateChangedAsync(device + '.activity.state', { val: 1, ack: false });
                } else {
                    await this.setStateChangedAsync(device + '.activity.state', { val: 0, ack: false });
                }
                await this.setStateChangedAsync(device + '.presence.state', { val: 0, ack: false });
                break;

            default:
                this.log.warn(device + ': Controlling unknown activity ' + activity);
                break;
        }
    }

    /**
     * Is called from onStateChange()
     * @param {string} device
     * @param {ioBroker.State} state
     */
    async setResidentDeviceMood(device, state) {
        await this.setStateAsync(device + '.mood.state', { val: state.val, ack: true, from: state.from });
    }

    /**
     * Is called from onStateChange()
     * @param {string} device
     * @param {string} presence
     * @param {ioBroker.State} state
     * @param {ioBroker.State} oldState
     */
    async setResidentDevicePresence(device, presence, state, oldState) {
        const currOvernightVal = (await this.getStateAsync(device + '.activity.overnight'))?.val;
        let currActivityState = await this.getStateAsync(device + '.activity.state');
        const residentType = (await this.getObjectAsync(device))?.native.type;
        let currActivityVal = null;
        if (residentType != 'pet') {
            if (typeof currActivityState?.val != 'number') return;
            currActivityVal = currActivityState.val >= 10000 ? currActivityState.val - 10000 : currActivityState.val;
        } else {
            // Dummy values for pet just to please eslint
            currActivityVal = 0;
            currActivityState = state;
        }

        let enabled = (await this.getStateAsync(device + '.enabled'))?.val;
        let stateNight = false;
        let stateHome = false;
        let stateActivity = 0;

        switch (presence) {
            case 'state':
                if (typeof state.val != 'number') return;

                // Disable if no overnight stay planned
                if (currOvernightVal === false && state.val === 0) {
                    await this.setStateChangedAsync(device + '.enabled', { val: false, ack: false });
                    enabled = false;
                }

                if (enabled === true) {
                    stateActivity = 1;
                }

                // Always reset mood if presence state was changed
                if (residentType != 'pet' && state.val != oldState.val) {
                    await this.setStateChangedAsync(device + '.mood.state', { val: 0, ack: false });
                }

                // When present at home
                if (state.val > 0) {
                    stateHome = true;

                    // When at sleep
                    if (state.val === 2) {
                        stateNight = true;

                        // change activity state to the correct range
                        if (currActivityVal < 2000) {
                            stateActivity = 2000;
                        } else if (currActivityVal < 2100) {
                            stateActivity = 2020;
                        } else if (currActivityVal < 2110) {
                            stateActivity = 2110;
                        } else if (currActivityVal < 2120) {
                            stateActivity = 2120;
                        } else if (currActivityVal < 2130) {
                            stateActivity = 2130;
                        } else {
                            stateActivity = currActivityVal;
                        }
                    } else {
                        // Activity change from away to home or when transitioning from night to home
                        if (currActivityVal < 1000 || currActivityVal >= 2200) {
                            stateActivity = 1000;
                        }

                        // Activity change any running wake-up program
                        else if (currActivityVal > 2000) {
                            stateActivity = 2200;
                        }

                        // Activity change from night to home = Implicit awakening state
                        else if (currActivityVal === 2000) {
                            stateActivity = 2210;
                        }

                        // Don't change any other activity during waking time at home
                        else {
                            stateActivity = currActivityVal;
                        }
                    }

                    await this.setStateChangedAsync(device + '.enabled', { val: true, ack: true });
                } else {
                    // Keep any absence activity
                    if (enabled === true && currActivityVal < 1000) {
                        stateActivity = currActivityVal;
                    }
                }

                await this.setStateChangedAsync(device + '.presence.home', { val: stateHome, ack: true });
                await this.setStateChangedAsync(device + '.presence.away', { val: !stateHome, ack: true });
                if (residentType != 'pet') {
                    await this.setStateChangedAsync(device + '.presence.night', { val: stateNight, ack: true });
                }
                await this.setStateAsync(device + '.presence.state', { val: state.val, ack: true, from: state.from });
                if (residentType != 'pet') {
                    this.setResidentDeviceActivity(
                        device,
                        'state',
                        {
                            val: stateActivity,
                            ack: false,
                            from: 'system.adapter.' + this.namespace,
                            ts: state.ts,
                            lc: state.lc,
                        },
                        currActivityState,
                    );
                }
                break;

            case 'home':
                if (state.val === true) {
                    await this.setStateChangedAsync(device + '.presence.state', {
                        val: 1,
                        ack: false,
                        from: state.from,
                    });
                } else {
                    await this.setStateChangedAsync(device + '.presence.state', {
                        val: 0,
                        ack: false,
                        from: state.from,
                    });
                }
                break;

            case 'night':
                if (state.val === true) {
                    await this.setStateChangedAsync(device + '.presence.state', {
                        val: 2,
                        ack: false,
                        from: state.from,
                    });
                } else {
                    [device].forEach(async (device2) => {
                        const currState = (await this.getStateAsync(device2 + '.presence.home'))?.val;
                        if (currState) {
                            await this.setStateChangedAsync(device2 + '.presence.state', {
                                val: 1,
                                ack: false,
                                from: state.from,
                            });
                        } else {
                            await this.setStateChangedAsync(device2 + '.presence.state', {
                                val: 0,
                                ack: false,
                                from: state.from,
                            });
                        }
                    });
                }
                break;

            case 'away':
                if (state.val === true) {
                    await this.setStateChangedAsync(device + '.presence.state', {
                        val: 0,
                        ack: false,
                        from: state.from,
                    });
                } else {
                    await this.setStateChangedAsync(device + '.presence.state', {
                        val: 1,
                        ack: false,
                        from: state.from,
                    });
                }
                break;
        }
    }

    /**
     * Is called from onStateChange()
     * @param {string} device
     * @param {string} presence
     * @param {ioBroker.State} state
     * @param {ioBroker.State} oldState
     */
    async setResidentDevicePresenceFollowing(device, presence, state, oldState) {
        // eslint-disable-next-line no-unused-vars
        const oldValue = oldState.val;
        await this.setStateChangedAsync(device + '.presenceFollowing.' + presence, {
            val: state.val,
            ack: true,
            from: state.from,
        });
    }

    /**
     * Is called from onStateChange()
     * @param {string} id
     * @param {ioBroker.State} state
     * @param {ioBroker.StateObject} _stateObj
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

        if (type === 'mixed' || type === 'string') {
            type = this.getDatatypeFromString(state.val);
            if (type === null) {
                this.log.error(id + ': Monitored presence datapoint seems inapproproate due to unknown string format');
                return false;
            }
            this.log.silly(id + ": Interpreting presence datapoint as type '" + type + "'");
        }

        let jsonObj = null;
        let jsonPresenceVal = null;
        switch (type) {
            case 'boolean':
                presence = Boolean(state.val);
                break;

            case 'number':
                if (stateObj.common.min && stateObj.common.min != 0) {
                    this.log.error(
                        id +
                            ': Monitored presence datapoint seems inapproproate with minimum value of ' +
                            stateObj.common.min,
                    );
                    return false;
                }
                if (stateObj.common.max && stateObj.common.max != 1) {
                    this.log.error(
                        id +
                            ': Monitored presence datapoint seems inapproproate with maximum value of ' +
                            stateObj.common.max,
                    );
                    return false;
                }
                presence = Number(state.val) === 1 ? true : false;
                break;

            case 'json':
                try {
                    jsonObj = JSON.parse(String(state.val));
                } catch (e) {
                    this.log.error(id + ': Error while parsing JSON value');
                    return false;
                }
                if (jsonObj.entry !== undefined) {
                    jsonPresenceVal = jsonObj.entry;
                } else if (jsonObj.presence !== undefined) {
                    jsonPresenceVal = jsonObj.presence;
                } else if (jsonObj.present !== undefined) {
                    jsonPresenceVal = jsonObj.present;
                }
                if (jsonPresenceVal !== null) type = this.getDatatypeFromString(jsonPresenceVal);
                if (type === null || type === 'json') {
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

        if (presence === null) {
            this.log.error(id + ': Unable to determine presence state');
        } else if (this.presenceSubscriptionMapping[id] !== undefined) {
            for (const device in this.presenceSubscriptionMapping[id]) {
                this.log.debug(
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
            if (state.val === true) {
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

        for (const resident of this.residents) {
            const name = resident['name'];
            const residentType = (await this.getObjectAsync(resident['id']))?.native.type;

            const currEnabled = (await this.getStateAsync(resident['id'] + '.enabled'))?.val;
            // const currActivity = (await this.getStateAsync(resident['id'] + '.activity.state'))?.val;
            const currAwake = (await this.getStateAsync(resident['id'] + '.activity.awake'))?.val;
            const currOvernight = (await this.getStateAsync(resident['id'] + '.activity.overnight'))?.val;
            const currWayhome = (await this.getStateAsync(resident['id'] + '.activity.wayhome'))?.val;
            const currState = (await this.getStateAsync(resident['id'] + '.presence.state'))?.val;
            const currMood = (await this.getStateAsync(resident['id'] + '.mood.state'))?.val;

            if (typeof currState != 'number' || typeof currMood != 'number') return;

            if (currOvernight) {
                overnightBool = true;
                overnightCount++;
                overnightList.push({ name: name, id: this.namespace + '.' + resident['id'] });
            }

            if (currAwake) {
                awakeBool = true;
                awakeCount++;
                awakeList.push({ name: name, id: this.namespace + '.' + resident['id'] });
            }

            // When present at home
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
                    petHomeList.push({ name: name, id: this.namespace + '.' + resident['id'] });
                } else {
                    homeBool = true;
                    homeCount++;
                    homeList.push({ name: name, id: this.namespace + '.' + resident['id'] });
                }

                // When at sleep
                if (currState == 2) {
                    nightBool = true;
                    nightCount++;
                    nightList.push({ name: name, id: this.namespace + '.' + resident['id'] });
                }
            } else if (currState == 0) {
                // When away from home
                if (currEnabled) {
                    if (residentType == 'pet') {
                        totalPetCount++;
                    } else {
                        totalResidentsCount++;
                    }
                    awayBool = true;
                    awayCount++;
                    awayList.push({ name: name, id: this.namespace + '.' + resident['id'] });

                    // When on way home
                    if (currWayhome) {
                        wayhomeBool = true;
                        wayhomeCount++;
                        wayhomeList.push({ name: name, id: this.namespace + '.' + resident['id'] });
                    }
                }

                // When absent from home for longer period
                else {
                    disabledBool = true;
                    disabledCount++;
                    disabledList.push({ name: name, id: this.namespace + '.' + resident['id'] });
                }
            }
        }

        // Write Lists
        await this.setStateChangedAsync('info.state.disabledList', { val: JSON.stringify(disabledList), ack: true });
        await this.setStateChangedAsync('info.activity.wayhomeList', { val: JSON.stringify(wayhomeList), ack: true });
        await this.setStateChangedAsync('info.activity.overnightList', {
            val: JSON.stringify(overnightList),
            ack: true,
        });
        await this.setStateChangedAsync('info.activity.awakeList', { val: JSON.stringify(awakeList), ack: true });
        await this.setStateChangedAsync('info.presence.awayList', { val: JSON.stringify(awayList), ack: true });
        await this.setStateChangedAsync('info.presence.nightList', { val: JSON.stringify(nightList), ack: true });
        await this.setStateChangedAsync('info.presence.petsHomeList', { val: JSON.stringify(petHomeList), ack: true });
        await this.setStateChangedAsync('info.presence.homeList', { val: JSON.stringify(homeList), ack: true });

        // Write Counter
        await this.setStateChangedAsync('info.state.disabledCount', { val: disabledCount, ack: true });
        await this.setStateChangedAsync('info.state.totalPetsCount', { val: totalPetCount, ack: true });
        await this.setStateChangedAsync('info.state.totalResidentsCount', { val: totalResidentsCount, ack: true });
        await this.setStateChangedAsync('info.state.totalCount', {
            val: totalResidentsCount + totalPetCount,
            ack: true,
        });
        await this.setStateChangedAsync('info.activity.wayhomeCount', { val: wayhomeCount, ack: true });
        await this.setStateChangedAsync('info.activity.overnightCount', { val: overnightCount, ack: true });
        await this.setStateChangedAsync('info.activity.awakeCount', { val: awakeCount, ack: true });
        await this.setStateChangedAsync('info.presence.awayCount', { val: awayCount, ack: true });
        await this.setStateChangedAsync('info.presence.nightCount', { val: nightCount, ack: true });
        await this.setStateChangedAsync('info.presence.petsHomeCount', { val: petHomeCount, ack: true });
        await this.setStateChangedAsync('info.presence.homeCount', { val: homeCount, ack: true });

        // Write Indicators
        await this.setStateChangedAsync('info.state.disabled', { val: disabledBool, ack: true });

        if (totalResidentsCount > 0) {
            await this.setStateChangedAsync('info.reachable', { val: true, ack: true });
            await this.setStateChangedAsync('info.state.disabledAll', { val: false, ack: true });
        } else {
            await this.setStateChangedAsync('info.reachable', { val: false, ack: true });
            await this.setStateChangedAsync('info.state.disabledAll', { val: true, ack: true });
        }

        await this.setStateChangedAsync('info.activity.wayhome', { val: wayhomeBool, ack: true });
        await this.setStateChangedAsync('info.activity.overnight', { val: overnightBool, ack: true });
        await this.setStateChangedAsync('info.activity.awake', { val: awakeBool, ack: true });

        if (wayhomeCount > 0 && wayhomeCount == awayCount) {
            await this.setStateChangedAsync('info.activity.wayhomeAll', { val: true, ack: true });
        } else {
            await this.setStateChangedAsync('info.activity.wayhomeAll', { val: false, ack: true });
        }
        if (overnightCount > 0 && overnightCount == totalResidentsCount) {
            await this.setStateChangedAsync('info.activity.overnightAll', { val: true, ack: true });
        } else {
            await this.setStateChangedAsync('info.activity.overnightAll', { val: false, ack: true });
        }
        if (awakeCount > 0 && awakeCount == homeCount) {
            await this.setStateChangedAsync('info.activity.awakeAll', { val: true, ack: true });
        } else {
            await this.setStateChangedAsync('info.activity.awakeAll', { val: false, ack: true });
        }

        await this.setStateChangedAsync('info.presence.away', { val: awayBool, ack: true });
        await this.setStateChangedAsync('info.presence.night', { val: nightBool, ack: true });
        await this.setStateChangedAsync('info.presence.petsHome', { val: petHomeBool, ack: true });
        await this.setStateChangedAsync('info.presence.home', { val: homeBool, ack: true });

        if (petHomeBool && !homeBool) {
            await this.setStateChangedAsync('info.presence.petsHomeAlone', { val: true, ack: true });
        } else {
            await this.setStateChangedAsync('info.presence.petsHomeAlone', { val: false, ack: true });
        }
        if (homeCount > 0 && homeCount == totalResidentsCount) {
            await this.setStateChangedAsync('info.presence.homeAll', { val: true, ack: true });
        } else {
            await this.setStateChangedAsync('info.presence.homeAll', { val: false, ack: true });
        }
        if (nightCount > 0 && nightCount == homeCount) {
            await this.setStateChangedAsync('info.presence.nightAll', { val: true, ack: true });
        } else {
            await this.setStateChangedAsync('info.presence.nightAll', { val: false, ack: true });
        }
        if (totalResidentsCount == 0 || (awayCount > 0 && awayCount >= totalResidentsCount)) {
            await this.setStateChangedAsync('info.presence.awayAll', { val: true, ack: true });
        } else {
            await this.setStateChangedAsync('info.presence.awayAll', { val: false, ack: true });
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

        this.log.debug('  Calculated residents state: ' + residentsState);
        await this.setStateChangedAsync('state', { val: residentsState, ack: true });

        const moodAverage = homeCount > 0 ? moodCount / homeCount : 0;
        await this.setStateChangedAsync('mood', {
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
                if (typeof parentState === 'number') {
                    // For presence at home, aim for the lower (= more awake) number
                    if (groupState >= 3 && parentState >= 3) {
                        if (parentState < groupState) {
                            leadingInstance = parentInstance;
                            this.log.debug(
                                '  Group state: Leading lower parent value from ' + parentInstance + ': ' + parentState,
                            );
                            groupState = parentState;
                        }

                        const moodState = (await this.getForeignStateAsync(parentInstance + '.mood'))?.val;
                        if (typeof moodState === 'number') {
                            moodFoundCounter++;
                            groupMood = groupMood + moodState;
                        }
                    }

                    // Otherwise, aim for the higher value
                    else {
                        if (parentState > groupState) {
                            leadingInstance = parentInstance;
                            this.log.debug(
                                '  Group state: Leading higher parent value from ' +
                                    parentInstance +
                                    ': ' +
                                    parentState,
                            );
                            groupState = parentState;
                        }
                    }
                }
            }

            await this.setStateChangedAsync('group.info.state.originID', { val: leadingInstance, ack: true });

            const groupMoodAverage = moodFoundCounter > 0 ? groupMood / (moodFoundCounter + 1) : groupMood;
            await this.setStateChangedAsync('group.mood', {
                // Strive for the golden middle
                val: groupMoodAverage > 0 ? Math.floor(groupMoodAverage) : Math.ceil(groupMoodAverage),
                ack: true,
            });

            this.log.debug('  Group state: Final value is ' + groupState + ' from ' + leadingInstance);
            await this.setStateChangedAsync('group.state', { val: groupState, ack: true });
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
        if (timeOfDayArray.length === 2) {
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
                .replace(/\0./g, '_') // Replace dots with underscores
                .replace(/\s/g, '_') // Replace whitespaces with underscores
                .replace(/[^\p{Ll}\p{Lu}\p{Nd}]+/gu, '_') // Replace not allowed chars with underscore
                .replace(/[_]+$/g, '') // Remove underscores end
                .replace(/^[_]+/g, '') // Remove underscores beginning
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
