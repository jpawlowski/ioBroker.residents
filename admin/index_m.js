let roomie = [];
let guest = [];
let pet = [];

function load(settings, onChange) {
    // select elements with id=key and class=value and insert value
    if (!settings) return;
    console.log('##on change');

    // select elements with id=key and class=value and insert value
    for (const key in settings) {
        if (!settings.prototype.hasOwnProperty.call(key)) continue;
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

    roomie = settings.roomie || [];
    guest = settings.guest || [];
    pet = settings.pet || [];

    for (const key in settings) {
        if (!settings.prototype.hasOwnProperty.call(key)) continue;
        setValue(key, settings[key], onChange);
    }

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

// This will be called by the admin adapter when the user presses the save button
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
