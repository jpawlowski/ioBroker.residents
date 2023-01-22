![Logo](admin/residents.svg)

# ioBroker.residents

[![NPM version](https://img.shields.io/npm/v/iobroker.residents.svg)](https://www.npmjs.com/package/iobroker.residents)
[![Downloads](https://img.shields.io/npm/dm/iobroker.residents.svg)](https://www.npmjs.com/package/iobroker.residents)
![Number of Installations](https://iobroker.live/badges/residents-installed.svg)
![Current version in stable repository](https://iobroker.live/badges/residents-stable.svg)

[![NPM](https://nodei.co/npm/iobroker.residents.png?downloads=true)](https://nodei.co/npm/iobroker.residents/)

**Tests:** ![Test and Release](https://github.com/jpawlowski/ioBroker.residents/workflows/Test%20and%20Release/badge.svg)

## Residents adapter for ioBroker

The adapter helps to map the presence and activity status of individual residents. This is used to create a logical overall status of all residents and their presence or current activity at home.

Residents are represented by dedicated virtual devices with different types of roomie, guest, or pet.

We can differentiate between short-term and long-term absences, with some prediction capability regarding expected return. Based on this information, heating could either be reduced slightly or more than usual in case of longer absences. Also, when a resident is on its way back home, the home knows that it should prepare itself for its human to arrive soon.

In addition to the simple present/absent logic, presence is extended by the fact that you are awake or asleep at home. A fairly complex bedtime and awakening process is supported here to allow comfortable wake-up routines for each individual and the home itself.

The adapter is also designed to support a sophisticated notification routing system in the future. This will let you address messages to a specific person from your scripts, regardless of the transport medium. The actual transport media can be determined dynamically based on presence and activity state. For example, voice notifications at home can be replaced by text messages during absence instead by re-routing the message to a different ioBroker adapter. Messages could also be routed to a certain device in the room that the resident is currently occupying, for example a speaker or display.

## Documentation

-   [Documentation (English)](docs/en/residents.md)
-   [Dokumentation (Deutsch)](docs/de/residents.md)

## Changelog

<!--
    Placeholder for the next version (at the beginning of the line):
    ### **WORK IN PROGRESS**
-->
### 0.0.3-beta.11 (2023-01-15)

-   (jpawlowski) fix for foreign event with objects of mixed type

## License

MIT License

Copyright (c) 2022-2023 Julian Pawlowski <julian.pawlowski@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
