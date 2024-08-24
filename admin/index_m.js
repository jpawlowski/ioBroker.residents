/* eslint-env jquery, browser */ // https://eslint.org/docs/user-guide/configuring#specifying-environments
/* global values2table, table2values, M */ // for eslint

let stateTranslations = [];
let residentialStates = [];
let moodStates = [];
let activityStates = [];
let focusStates = [];
let customFocusStates = [];
let roomie = [];
let guest = [];
let pet = [];

const $ = require('jquery');

/* eslint-disable-next-line no-unused-vars */
function load(settings, onChange) {
    // select elements with id=key and class=value and insert value
    if (!settings) return;
    console.log('##on change');

    // select elements with id=key and class=value and insert value
    for (const key in settings) {
        // if (!settings.prototype.hasOwnProperty.call(key)) continue;
        const value = $('#' + key + '.value');
        if (value.attr('type') === 'checkbox') {
            value.prop('checked', settings[key]).on('change', function () {
                showHideSettings();
                onChange();
            });
        } else {
            value
                .val(settings[key])
                .on('change', function () {
                    console.log('on change');
                    showHideSettings();
                    onChange();
                })
                .on('keyup', function () {
                    this.trigger('change');
                });
        }
    }

    stateTranslations = settings.stateTranslations || [];
    residentialStates = settings.residentialStates || [];
    moodStates = settings.moodStates || [];
    activityStates = settings.activityStates || [];
    focusStates = settings.focusStates || [];
    customFocusStates = settings.customFocusStates || [];
    roomie = settings.roomie || [];
    guest = settings.guest || [];
    pet = settings.pet || [];

    for (const key in settings) {
        // if (!settings.prototype.hasOwnProperty.call(key)) continue;
        setValue(key, settings[key], onChange);
    }

    values2table('stateTranslations', stateTranslations, onChange);
    values2table('residentialStates', residentialStates, onChange);
    values2table('moodStates', moodStates, onChange);
    values2table('activityStates', activityStates, onChange);
    values2table('focusStates', focusStates, onChange);
    values2table('customFocusStates', customFocusStates, onChange);
    values2table('roomie', roomie, onChange);
    values2table('guest', guest, onChange);
    values2table('pet', pet, onChange);

    showHideSettings();

    onChange(false);
    // reinitialize all the Materialize labels on the page if you are dynamically adding inputs:

    $('.timepicker').timepicker({
        twelveHour: false,
    });

    if (M) M.updateTextFields();

    //++++++++++ TABS ++++++++++
    //Enhance Tabs with onShow-Function
    $('ul.tabs li a').on('click', function () {
        onTabShow($(this).attr('href'));
    });
    function onTabShow(tabId) {
        switch (tabId) {
            case '#tab-roomies':
                loadOptions();
                break;
            case '#tab-guests':
                loadOptions();
                break;
            case '#tab-pets':
                loadOptions();
                break;
            case '#tab-settings':
                loadOptions();
                break;
        }
    }
    //++++++++++ OPTIONS ++++++++++
    //Load Options
    function loadOptions() {
        $('.collapsible').collapsible();
    }
}

/* eslint-disable-next-line no-unused-vars */
function save(callback) {
    // select elements with class=value and build settings object
    const obj = {};
    $('#mainSettings .value').each(function () {
        const $this = $(this);
        if ($this.attr('type') === 'checkbox') {
            obj[$this.attr('id')] = $this.prop('checked');
        } else {
            obj[$this.attr('id')] = $this.val();
        }
    });

    // Get edited table
    obj.stateTranslations = table2values('stateTranslations');
    obj.residentialStates = table2values('residentialStates');
    obj.moodStates = table2values('moodStates');
    obj.activityStates = table2values('activityStates');
    obj.focusStates = table2values('focusStates');
    obj.customFocusStates = table2values('customFocusStates');
    obj.roomie = table2values('roomie');
    obj.guest = table2values('guest');
    obj.pet = table2values('pet');

    callback(obj);
}

function showHideSettings() {
    //
}

function setValue(id, value, onChange) {
    const objectId = $('#' + id + '.value');

    if (objectId.attr('type') === 'checkbox') {
        //
    } else {
        objectId
            .val(value)
            .on('change', function () {
                onChange();
            })
            .on('keyup', function () {
                onChange();
            });
    }
}
