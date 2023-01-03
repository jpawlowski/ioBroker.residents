# Bewohner (Residents)

Dieser Adapter hilft dabei, den Anwesenheits- und Aktivitätsstatus der einzelnen Mitbewohner abzubilden. Daraus wird ein logischer Gesamtstatus über alle Mitbewohner und deren Anwesenheit bzw. momentane Aktivität zu Hause gebildet. Die Bewohner werden durch eigene virtuelle Geräte vom Typ Mitbewohner, Gast, oder Haustier repräsentiert.

Wir können zwischen kurzfristiger und langfristiger Abwesenheit unterscheiden, mit einer gewissen Vorhersagefähigkeit hinsichtlich der erwarteten Rückkehr. Auf der Grundlage dieser Informationen kann die Heizung bei längerer Abwesenheit entweder leicht oder stärker als üblich reduziert werden. Wenn ein Bewohner auf dem Weg zurück nach Hause ist, weiß das Haus, dass es sich auf die baldige Ankunft seines Menschen vorbereiten sollte.

Zusätzlich zur einfachen An-/Abwesenheitslogik wird die Anwesenheit durch die Tatsache erweitert, dass man zu Hause wach ist oder schläft. Ein ziemlich komplexer Schlafens- und Aufwachprozess wird hier unterstützt, um komfortable Aufwachroutinen für jeden Einzelnen und das Haus selbst zu ermöglichen.

Der Adapter ist außerdem so konzipiert, dass er _in Zukunft_ ein ausgeklügeltes System zum Routing von Benachrichtigung unterstützt. Damit können aus eigenen Skripten heraus Nachrichten an eine bestimmte Person adressiert werden, unabhängig vom Transportmedium. Das tatsächliche Transportmedium kann dynamisch auf der Grundlage des Anwesenheits- und Aktivitätsstatus ermittelt werden. So können z. B. Sprachbenachrichtigungen zu Hause durch Textnachrichten während der Abwesenheit ersetzt werden, indem die Nachricht an einen anderen ioBroker-Adapter umgeleitet wird. Die Nachrichten könnten auch an ein bestimmtes Gerät in dem Raum weitergeleitet werden, in dem sich der Bewohner gerade aufhält, beispielsweise einen Lautsprecher oder ein Display.

## Konfiguration
