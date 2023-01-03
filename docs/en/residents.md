# Residents

The adapter helps to map the presence and activity status of individual residents. This is used to create a logical overall status of all residents and their presence or current activity at home.

Residents are represented by dedicated virtual devices with different types of roomie, guest, or pet.

We can differentiate between short-term and long-term absences, with some prediction capability regarding expected return. Based on this information, heating could either be reduced slightly or more than usual in case of longer absences. Also, when a resident is on its way back home, the home knows that it should prepare itself for its human to arrive soon.

In addition to the simple present/absent logic, presence is extended by the fact that you are awake or asleep at home. A fairly complex bedtime and awakening process is supported here to allow comfortable wake-up routines for each individual and the home itself.

The adapter is also designed to support a sophisticated notification routing system _in the future_. This will let you address messages to a specific person from your scripts, regardless of the transport medium. The actual transport media can be determined dynamically based on presence and activity state. For example, voice notifications at home can be replaced by text messages during absence instead by re-routing the message to a different ioBroker adapter. Messages could also be routed to a certain device in the room that the resident is currently occupying, for example a speaker or display.

## Configuration
