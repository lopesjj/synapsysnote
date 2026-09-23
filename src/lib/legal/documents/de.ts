import type { LegalBundle } from "../types";

const de: LegalBundle = {
  terms: {
    title: "Nutzungsbedingungen",
    lead: "Dies sind die Regeln für die Nutzung von {brand}: was du von uns erwarten kannst und was wir von dir erwarten.",
    highlights: [
      { title: "Die Inhalte gehören dir", text: "Du behältst alle Rechte an deinen Notizen, Dateien und Lernkarten. Wir verwenden sie nur, um den Dienst bereitzustellen." },
      { title: "KI-Ergebnisse müssen geprüft werden", text: "KI-generierte Transkripte und Lernkarten können Fehler enthalten. Überprüfe sie immer anhand der offiziellen Quelle." },
      { title: "Nutzungsregeln", text: "Illegale Inhalte, raubkopiertes Material und Versuche, Sicherheitsmechanismen zu umgehen, sind nicht gestattet." },
      { title: "Brasilianisches Recht", text: "Diese Bedingungen unterliegen brasilianischem Recht und schränken den Schutz durch das brasilianische Verbraucherschutzgesetzbuch (Código de Defesa do Consumidor) nicht ein." },
    ],
    sections: [
      {
        id: "acceptance",
        title: "Zustimmung zu diesen Bedingungen",
        blocks: [
          "Wenn du ein Konto erstellst oder auf {brand} zugreifst, stimmst du diesen Nutzungsbedingungen und der [Datenschutzerklärung](doc:privacy) zu, in der beschrieben ist, wie wir deine Daten verarbeiten. Wenn du nicht zustimmst, nutze den Dienst bitte nicht.",
          "Diese Bedingungen sind ein Vertrag zwischen dir und {controller} (\"wir\"). \"Dienst\" bezeichnet die Website, die Web-App und alle darin angebotenen Funktionen.",
        ],
      },
      {
        id: "service",
        title: "Was {brand} ist",
        blocks: [
          "{brand} ist eine Lern- und Wissensmanagement-Plattform für Menschen, die sich auf Auswahlprüfungen für den öffentlichen Dienst, Hochschulaufnahmeprüfungen und das akademische Leben vorbereiten. Damit kannst du:",
          {
            list: [
              "Notizen, Seiten, Notizbücher und Datenbanken in einem Block-Editor erstellen;",
              "Bilder, PDFs, Audio und Video anhängen und Sprachnotizen aufnehmen;",
              "Inhalte aus Notion, Evernote, Google Docs und Dateien importieren;",
              "Lernkarten und Transkripte mit Hilfe von künstlicher Intelligenz erstellen;",
              "das Gelernte mit Spaced Repetition wiederholen.",
            ],
          },
          "Der Dienst entwickelt sich ständig weiter. Wir können Funktionen hinzufügen, ändern oder einstellen; wenn sich eine Änderung wesentlich auf das auswirkt, was du nutzt, informieren wir dich mit angemessenem Vorlauf.",
        ],
      },
      {
        id: "account",
        title: "Dein Konto",
        blocks: [
          {
            list: [
              "**Mindestalter.** Du musst mindestens {minimumAge} Jahre alt sein (oder das in deinem Land vorgeschriebene Mindestalter erreicht haben, falls dieses höher ist). Wenn du unter 18 bist, benötigst du die Erlaubnis und Begleitung deiner Eltern oder Erziehungsberechtigten.",
              "**Korrekte Angaben.** Gib wahrheitsgemäße Informationen an und halte sie aktuell.",
              "**Persönlicher Zugang.** Dein Konto ist persönlich und nicht übertragbar. Teile dein Passwort nicht: Du bist für alles verantwortlich, was in deinem Konto geschieht.",
              "**Sicherheit.** Wenn du unbefugten Zugriff vermutest, ändere dein Passwort und benachrichtige uns unter {contactEmail}.",
            ],
          },
          "Du kannst dich mit E-Mail und Passwort oder mit einem Google-Konto anmelden. In diesem Fall gelten auch die Bedingungen des gewählten Anbieters.",
        ],
      },
      {
        id: "content",
        title: "Deine Inhalte bleiben deine",
        blocks: [
          "Alles, was du erstellst, hochlädst oder importierst — Notizen, Dateien, Aufnahmen, Lernkarten — gehört dir. Wir erheben keinen Eigentumsanspruch darauf.",
          "Damit der Dienst funktioniert, räumst du uns eine beschränkte, nicht ausschließliche, unentgeltliche, weltweite Lizenz ein, deine Inhalte zu speichern, zu kopieren, zu verarbeiten und anzuzeigen, **ausschließlich zur Bereitstellung des Dienstes für dich** — zum Beispiel zum Speichern von Notizen, Erstellen von Backups oder Transkribieren von Audio auf deine Anfrage. Diese Lizenz endet, wenn du den Inhalt oder dein Konto löschst, vorbehaltlich der in der [Datenschutzerklärung](doc:privacy#retention) genannten Fristen.",
          "Du bestätigst, dass du die erforderlichen Rechte an dem hast, was du hochlädst. Wir veröffentlichen deine Inhalte nicht, verkaufen sie nicht und verwenden sie nicht zum Training von KI-Modellen.",
        ],
      },
      {
        id: "acceptable-use",
        title: "Zulässige Nutzung",
        blocks: [
          "Um die Plattform für alle sicher und fair zu halten, verpflichtest du dich, Folgendes zu unterlassen:",
          {
            list: [
              "illegale, diskriminierende, zu Gewalt aufrufende oder Kinder und Jugendliche ausbeutende Inhalte zu speichern oder zu verbreiten;",
              "urheberrechtlich geschütztes Material ohne Erlaubnis zu teilen, wie raubkopierte Lernskripte, Videolektionen oder Kurse;",
              "zu versuchen, auf Konten, Daten oder Systeme Dritter zuzugreifen oder Sicherheitsmechanismen und Nutzungslimits zu umgehen;",
              "Bots, Scraper oder Automatisierungen zum Extrahieren von Daten oder zur Überlastung des Dienstes zu verwenden;",
              "die Software zu kopieren, zu dekompilieren oder zurückzuentwickeln, außer soweit das Gesetz dies erlaubt;",
              "den Dienst zum Versenden von Spam oder Malware oder zur Begehung von Betrug zu verwenden.",
            ],
          },
          "Wir können Inhalte entfernen oder den Zugang von Personen, die gegen diese Regeln verstoßen, einschränken, und zwar in einem dem Verstoß angemessenen Umfang.",
        ],
      },
      {
        id: "ai",
        title: "Funktionen mit künstlicher Intelligenz",
        blocks: [
          "Einige Funktionen nutzen künstliche Intelligenz: Audio- und Videotranskription, Erstellung von Lernkarten, Erkennung doppelter Karten und Übersetzung. Sie verarbeiten nur die Inhalte, die du auswählst, und nur dann, wenn du die Funktion aktivierst.",
          {
            note: "KI-generierte Ergebnisse können Fehler, Auslassungen oder Ungenauigkeiten enthalten. Überprüfe Transkripte und Lernkarten, bevor du damit lernst, und gleiche sie immer mit der offiziellen Quelle ab — dem Gesetzestext, der Prüfungsausschreibung oder der empfohlenen Literatur.",
          },
          "Was die KI aus deinen Inhalten generiert, gehört dir, zu denselben Bedingungen wie der Rest deiner Inhalte. Wir können Nutzungslimits anwenden, um diese Funktionen für alle verfügbar zu halten.",
        ],
      },
      {
        id: "integrations",
        title: "Integrationen mit anderen Diensten",
        blocks: [
          "Wenn du Notion, Evernote oder Google Docs verbindest, autorisierst du uns, in deinem Namen auf diese Dienste zuzugreifen, nur um die von dir ausgewählten Inhalte aufzulisten und zu importieren. Du kannst eine Integration jederzeit auf der Integrationsseite trennen.",
          "Diese Dienste gehören Dritten und haben ihre eigenen Bedingungen und Richtlinien. Wir sind nicht mit ihnen verbunden, und ihre Marken gehören ihren jeweiligen Eigentümern. Wir haften nicht für Ausfälle oder Änderungen dieser Dienste.",
        ],
      },
      {
        id: "pricing",
        title: "Preise und Pläne",
        blocks: [
          "{brand} wird derzeit kostenlos angeboten. Wenn wir kostenpflichtige Pläne einführen, werden Preis, Zahlungsmethode und Kündigungsbedingungen vor jeder Berechnung klar dargestellt — es wird nichts ohne deine ausdrückliche Zustimmung berechnet.",
        ],
      },
      {
        id: "intellectual-property",
        title: "Geistiges Eigentum von {brand}",
        blocks: [
          "Die Software, die Marke, das Design und andere Elemente des Dienstes gehören {brand} und sind durch das Recht des geistigen Eigentums geschützt. Wir gewähren dir eine persönliche, beschränkte, widerrufliche und nicht übertragbare Lizenz zur Nutzung des Dienstes gemäß diesen Bedingungen.",
          "Wenn du uns Vorschläge sendest, können wir sie zur Verbesserung des Dienstes verwenden, ohne dir gegenüber zu einer Vergütung verpflichtet zu sein.",
        ],
      },
      {
        id: "availability",
        title: "Verfügbarkeit und Backups",
        blocks: [
          "Wir bemühen uns, den Dienst verfügbar und deine Daten sicher zu halten. Dennoch kann es zu Unterbrechungen wegen Wartungsarbeiten, Updates oder aus Gründen außerhalb unserer Kontrolle kommen.",
          "Wir empfehlen, Kopien von allem aufzubewahren, was für dich unverzichtbar ist — zum Beispiel durch den Export von Notizen als PDF.",
          "{brand} ist ein Hilfsmittel zum Lernen und garantiert nicht, dass du Auswahlprüfungen für den öffentlichen Dienst, Hochschulaufnahmeprüfungen oder andere Prüfungen bestehst.",
        ],
      },
      {
        id: "liability",
        title: "Haftungsbeschränkung",
        blocks: [
          "Im größtmöglichen gesetzlich zulässigen Umfang haften wir nicht für mittelbare Schäden, entgangene Gewinne oder entgangene Chancen, die aus der Nutzung oder der Unmöglichkeit der Nutzung des Dienstes entstehen, noch für von Nutzern erstellte Inhalte oder Dienste Dritter.",
          "Nichts in diesen Bedingungen schließt Rechte aus oder schränkt sie ein, die vertraglich nicht ausgeschlossen werden können, einschließlich der Rechte, die dir das brasilianische Verbraucherschutzgesetzbuch (Código de Defesa do Consumidor, Gesetz Nr. 8.078/1990) und die zwingenden Verbraucherschutzgesetze deines Landes garantieren.",
        ],
      },
      {
        id: "termination",
        title: "Beendigung",
        blocks: [
          "Du kannst die Nutzung des Dienstes jederzeit einstellen und die Löschung deines Kontos unter {privacyEmail} beantragen. Die Löschfristen sind in der [Datenschutzerklärung](doc:privacy#retention) beschrieben.",
          "Wir können Konten sperren oder schließen, wenn sie schwerwiegend oder wiederholt gegen diese Bedingungen verstoßen, andere Personen gefährden oder wenn das Gesetz dies verlangt. Außer in dringenden Fällen oder bei Rechtswidrigkeit werden wir dich vorher benachrichtigen und dir die Möglichkeit geben, deine Inhalte zu exportieren.",
        ],
      },
      {
        id: "changes",
        title: "Änderungen dieser Bedingungen",
        blocks: [
          "Wir können diese Bedingungen aktualisieren, um Änderungen des Dienstes oder des Rechts zu berücksichtigen. Wesentliche Änderungen werden mindestens {noticeDays} Tage im Voraus per E-Mail oder durch einen Hinweis im Dienst angekündigt. Das Datum der letzten Aktualisierung wird immer oben in diesem Dokument angezeigt.",
        ],
      },
      {
        id: "law",
        title: "Anwendbares Recht und Kontakt",
        blocks: [
          "Diese Bedingungen unterliegen dem Recht der Föderativen Republik Brasilien; Gerichtsstand für alle Streitigkeiten ist dein Wohnsitz. Wenn du in einem anderen Land lebst, gelten weiterhin die zwingenden Verbraucherschutzvorschriften deines Wohnsitzlandes.",
          "Fragen zu diesen Bedingungen? Schreib uns an {contactEmail}.",
        ],
      },
    ],
  },

  privacy: {
    title: "Datenschutzerklärung",
    lead: "Diese Datenschutzerklärung erläutert gemäß dem brasilianischen Allgemeinen Datenschutzgesetz (LGPD) und, soweit anwendbar, der europäischen Datenschutz-Grundverordnung (DSGVO), welche Daten wir verarbeiten, warum, mit wem wir sie teilen und wie du deine Rechte ausüben kannst.",
    highlights: [
      { title: "Keine Werbung", text: "Wir verkaufen keine Daten, schalten keine Werbung und verwenden keine Drittanbieter-Tracker." },
      { title: "KI auf Anfrage", text: "Inhalte werden nur dann an einen KI-Anbieter gesendet, wenn du eine Funktion aktivierst, und niemals zum Training von Modellen verwendet." },
      { title: "Sicherheit", text: "Verschlüsselte Verbindungen, pro Konto isolierte Daten und mit AES-256 verschlüsselte Integrations-Token." },
      { title: "Deine Rechte", text: "Du kannst auf deine Daten zugreifen und sie berichtigen, exportieren oder löschen. Wir antworten innerhalb von {responseDays} Tagen." },
    ],
    sections: [
      {
        id: "controller",
        title: "Wer wir sind",
        blocks: [
          "{controller} ist der Verantwortliche für die im Dienst verarbeiteten personenbezogenen Daten gemäß dem brasilianischen Allgemeinen Datenschutzgesetz (LGPD, Gesetz Nr. 13.709/2018). Diese Datenschutzerklärung gilt für die Website, die Web-App und unsere Support-Kanäle.",
          "Bei allen Fragen zum Datenschutz wende dich an unseren Datenschutzbeauftragten (DPO) unter {privacyEmail}.",
        ],
      },
      {
        id: "data",
        title: "Daten, die wir verarbeiten",
        blocks: [
          {
            table: {
              head: ["Kategorie", "Beispiele", "Quelle"],
              rows: [
                ["Registrierung", "Name, E-Mail, Telefonnummer und Profilbild", "Du oder dein Google-Konto"],
                ["Zugangsdaten", "Passwort, nur verschlüsselt vom Authentifizierungsanbieter gespeichert", "Du"],
                ["Inhalte", "Notizen, Seiten, Notizbücher, Lernkarten, Anhänge, Audio und Video", "Du und die von dir durchgeführten Importe"],
                ["Integrationen", "Zugriffstoken für Notion, Evernote und Google Docs", "Der verbundene Dienst, mit deiner Autorisierung"],
                ["Einstellungen", "Sprache, Design, Barrierefreiheit und Layout", "Du"],
                ["Zustimmung zu Dokumenten", "Version und Datum, an dem du die Nutzungsbedingungen und diese Richtlinie akzeptiert hast", "Du"],
                ["Technische Daten", "IP-Adresse, ungefähres Land, Browser, Gerät, Datum und Uhrzeit des Zugriffs", "Automatisch erfasst"],
              ],
            },
          },
          "Wir fragen keine sensiblen Daten ab. Wenn du solche Informationen in deinen Notizen festhältst, werden sie nur als Teil deiner Inhalte verarbeitet, unter deiner Kontrolle.",
        ],
      },
      {
        id: "purposes",
        title: "Wofür wir die Daten verwenden und auf welcher Rechtsgrundlage",
        blocks: [
          {
            table: {
              head: ["Zweck", "Rechtsgrundlage (LGPD)"],
              rows: [
                ["Dein Konto erstellen und pflegen, Zugang authentifizieren und Inhalte synchronisieren", "Vertragserfüllung (Art. 7, V)"],
                ["Von dir ausgelöste Funktionen ausführen: Importe, Transkripte, Lernkarten und Übersetzungen", "Vertragserfüllung (Art. 7, V)"],
                ["Konten vor Betrug und unbefugtem Zugriff schützen, auch mithilfe von reCAPTCHA", "Berechtigtes Interesse (Art. 7, IX)"],
                ["Zugriffsprotokolle für die im brasilianischen Marco Civil da Internet vorgeschriebene Dauer aufbewahren", "Rechtliche Verpflichtung (Art. 7, II)"],
                ["Unverzichtbare Mitteilungen senden, wie Passwortzurücksetzungen und Hinweise auf Änderungen", "Vertragserfüllung (Art. 7, V)"],
                ["Deine Region merken, um die Seitensprache auszuwählen", "Einwilligung (Art. 7, I), die du jederzeit widerrufen kannst"],
                ["Erfassung der Version der von dir akzeptierten Dokumente", "Ordnungsgemäße Ausübung von Rechten (Art. 7, VI)"],
                ["Rechte in Gerichts- oder Verwaltungsverfahren verteidigen", "Ordnungsgemäße Ausübung von Rechten (Art. 7, VI)"],
              ],
            },
          },
          "Wir verwenden deine Daten nicht für Werbung, Marketingprofile oder automatisierte Entscheidungen, die deine Interessen beeinflussen.",
        ],
      },
      {
        id: "ai",
        title: "Künstliche Intelligenz",
        blocks: [
          "Wenn du ein Transkript anforderst, Lernkarten erstellst oder einen Abschnitt übersetzt, senden wir dem Anbieter nur die für die Aufgabe erforderlichen Inhalte:",
          {
            list: [
              "**Audio- und Videotranskription:** Google Gemini API; alternativ ein Open-Source-Modell (Whisper), das auf unseren eigenen Servern ausgeführt wird.",
              "**Live-Transkription von Sprachnotizen:** die Spracherkennung deines Browsers, die Audio an den Hersteller (Google, Microsoft oder Apple) senden kann. Bleibt deaktiviert, bis du sie bei der Aufnahme einschaltest.",
              "**Lernkarten und Erkennung doppelter Karten:** Google Gemini API.",
              "**Übersetzung:** Googles Übersetzungsdienst.",
            ],
          },
          { note: "Wir verwenden deine Inhalte nicht zum Training von KI-Modellen, und keine KI-Funktion läuft ohne eine Aktion von dir." },
        ],
      },
      {
        id: "sharing",
        title: "Mit wem wir Daten teilen",
        blocks: [
          "Wir verkaufen oder vermieten keine personenbezogenen Daten. Wir teilen nur das Notwendige mit Auftragsverarbeitern, die uns bei der Bereitstellung des Dienstes helfen, unter Vertraulichkeits- und Sicherheitsverpflichtungen:",
          {
            table: {
              head: ["Partner", "Rolle"],
              rows: [
                ["Google Cloud und Firebase", "Hosting, Datenbank, Dateispeicherung, Authentifizierung und System-E-Mails"],
                ["Google reCAPTCHA", "Bot-Schutz bei Anmeldung und Passwortzurücksetzung"],
                ["Google Gemini API und Google Translate", "Von dir ausgelöste KI- und Übersetzungsfunktionen"],
                ["Spracherkennung und Stimmen des Browsers (Google, Microsoft oder Apple)", "Live-Transkription, sofern aktiviert, und Vorlesen, wenn der Browser Online-Stimmen verwendet"],
                ["country.is (IP-Geolokalisierung)", "Dein Land ermitteln, um eine Sprache vorzuschlagen, ohne deine IP-Adresse zu speichern"],
                ["jsDelivr, Unsplash und flagcdn", "Laden von Schnittstellenbibliotheken, Schriftarten und öffentlichen Bildern; erhalten nur technische Verbindungsdaten wie IP und Browser"],
                ["Notion, Evernote und Google Docs", "Nur wenn du die Integration verbindest, um die von dir ausgewählten Inhalte zu importieren"],
              ],
            },
          },
          "Wir können Daten außerdem weitergeben, wenn dies gesetzlich, durch gerichtliche Anordnung oder von einer zuständigen Behörde verlangt wird — stets beschränkt auf das Angeforderte — oder im Rahmen einer Unternehmensumstrukturierung, wobei die Garantien dieser Datenschutzerklärung erhalten bleiben.",
        ],
      },
      {
        id: "google-data",
        title: "Von Google APIs empfangene Daten",
        blocks: [
          "Die Nutzung und Übertragung von Informationen, die {brand} von Google APIs erhält, an andere Apps erfolgt gemäß der [Richtlinie zu Nutzerdaten für Google API-Dienste](https://developers.google.com/terms/api-services-user-data-policy), einschließlich der Anforderungen zur eingeschränkten Nutzung.",
          "Wenn du Google Docs verbindest, greifen wir auf deine Dokumente nur zu, um sie aufzulisten und die von dir ausgewählten zu importieren. Diese Daten werden nicht für Werbung verwendet, nicht verkauft und nicht von Menschen gelesen, außer mit deiner Einwilligung, zu Sicherheitszwecken oder zur Einhaltung gesetzlicher Vorschriften.",
        ],
      },
      {
        id: "transfer",
        title: "Internationale Übermittlungen",
        blocks: [
          "Unsere Infrastruktur befindet sich in Rechenzentren von Google Cloud in den Vereinigten Staaten, und einige Partner können Daten in anderen Ländern verarbeiten. Diese Übermittlungen erfolgen gemäß Artikel 33 des LGPD und, soweit anwendbar, der DSGVO, unter Verwendung von Anbietern, die vertragliche und technische Garantien bieten, die diesen Gesetzen entsprechen.",
        ],
      },
      {
        id: "retention",
        title: "Wie lange wir Daten aufbewahren",
        blocks: [
          {
            list: [
              "**Konto und Inhalte:** solange dein Konto aktiv ist.",
              "**Papierkorb:** Gelöschte Elemente verbleiben {trashDays} Tage im Papierkorb und werden dann dauerhaft gelöscht.",
              "**Kontolöschung:** Die Daten werden innerhalb von 30 Tagen gelöscht, mit Ausnahme der Daten, die wir gesetzlich aufbewahren müssen.",
              "**Zugriffsprotokolle:** {accessLogMonths} Monate, gemäß Artikel 15 des brasilianischen Marco Civil da Internet (Gesetz Nr. 12.965/2014).",
              "**Integrations-Token:** bis du die Integration trennst oder dein Konto löschst.",
            ],
          },
        ],
      },
      {
        id: "security",
        title: "Wie wir deine Daten schützen",
        blocks: [
          {
            list: [
              "Verbindungen sind immer verschlüsselt (HTTPS/TLS);",
              "Zugriffsregeln isolieren die Daten jedes Kontos in der Datenbank und im Dateispeicher;",
              "Integrations-Token sind mit AES-256-GCM verschlüsselt;",
              "deine Sitzung wird in einem HttpOnly-Cookie gespeichert, auf den Skripte nicht zugreifen können;",
              "Anmeldeversuche sind begrenzt, und eine reCAPTCHA-Prüfung schützt vor automatisierten Angriffen;",
              "interner Zugang ist auf das notwendige Minimum beschränkt.",
            ],
          },
          "Kein System ist immun gegen Vorfälle. Tritt ein Sicherheitsvorfall auf, der zu einem erheblichen Risiko oder Schaden führen kann, benachrichtigen wir dich und die brasilianische Nationale Datenschutzbehörde (ANPD), wie es Artikel 48 des LGPD vorschreibt.",
        ],
      },
      {
        id: "rights",
        title: "Deine Rechte",
        blocks: [
          "Das LGPD garantiert dir unter anderem das Recht,",
          {
            list: [
              "eine Bestätigung darüber zu erhalten, ob wir deine Daten verarbeiten, und auf sie zuzugreifen;",
              "unvollständige, ungenaue oder veraltete Daten berichtigen zu lassen;",
              "die Anonymisierung, Sperrung oder Löschung nicht erforderlicher oder nicht rechtskonform verarbeiteter Daten zu beantragen;",
              "deine Daten in einem portablen Format zu erhalten;",
              "zu erfahren, mit wem wir deine Daten teilen;",
              "die Einwilligung zu widerrufen und der Verarbeitung auf anderer Rechtsgrundlage zu widersprechen;",
              "die Löschung deines Kontos und deiner Daten zu beantragen.",
            ],
          },
          "Um eines dieser Rechte auszuüben, schreib von der E-Mail-Adresse deines Kontos an {privacyEmail}. Wir antworten innerhalb von {responseDays} Tagen. Du kannst auch eine Beschwerde bei der ANPD einreichen.",
          "Wenn du dich im Europäischen Wirtschaftsraum oder im Vereinigten Königreich befindest, hast du auch die in der DSGVO festgelegten Rechte, einschließlich des Rechts, eine Beschwerde bei der Datenschutzbehörde in deinem Land einzureichen.",
        ],
      },
      {
        id: "children",
        title: "Kinder und Jugendliche",
        blocks: [
          "{brand} ist nicht für Personen unter {minimumAge} Jahren bestimmt, und wir erfassen wissentlich keine Daten von ihnen. Jugendliche ab diesem Alter dürfen den Dienst mit der Erlaubnis und Begleitung ihrer Eltern oder Erziehungsberechtigten nutzen, und ihre Daten werden stets in ihrem besten Interesse verarbeitet, wie es Artikel 14 des LGPD vorschreibt. Stellen wir fest, dass ein Konto einem Kind gehört, wird es gelöscht.",
        ],
      },
      {
        id: "cookies",
        title: "Cookies",
        blocks: [
          "Wir verwenden nur notwendige Cookies und, mit deiner Einwilligung, einen funktionalen Cookie. Wir verwenden keine Werbe- oder Analyse-Cookies. Details und Steuerungsmöglichkeiten findest du in der [Cookie-Richtlinie](doc:cookies).",
        ],
      },
      {
        id: "changes",
        title: "Änderungen und Kontakt",
        blocks: [
          "Wir können diese Datenschutzerklärung aktualisieren, um Änderungen des Dienstes oder des Rechts zu berücksichtigen. Wesentliche Änderungen werden im Voraus per E-Mail oder im Dienst selbst angekündigt.",
          "Fragen, Anfragen oder Beschwerden: {privacyEmail}.",
        ],
      },
    ],
  },

  cookies: {
    title: "Cookie-Richtlinie",
    lead: "Cookies sind kleine Dateien, die die Website in deinem Browser speichert. Diese Richtlinie führt jeden einzelnen auf und erklärt, wie du die nicht notwendigen verwalten kannst.",
    highlights: [
      { title: "Notwendig", text: "Halten dich angemeldet, merken sich deine Sprache und schützen dein Konto." },
      { title: "Kein Tracking", text: "Wir verwenden keine Werbe-Cookies, Social-Media-Pixel oder Analyse-Tools." },
      { title: "Optional nur mit Einwilligung", text: "Unser einziger optionaler Cookie erfordert deine Einwilligung, die du jederzeit widerrufen kannst." },
    ],
    sections: [
      {
        id: "what",
        title: "Was Cookies sind",
        blocks: [
          "Cookies sind kleine Textdateien, die eine Website in deinem Browser speichert, um sich Informationen von einem Besuch zum nächsten zu merken. Ähnliche Technologien wie der lokale Speicher (localStorage) und IndexedDB speichern Daten auf deinem eigenen Gerät. In dieser Richtlinie bezeichnen wir all dies als \"Cookies\".",
        ],
      },
      {
        id: "categories",
        title: "Wie wir Cookies verwenden",
        blocks: [
          {
            list: [
              "**Notwendig** — erforderlich für Anmeldung, Sicherheit und grundlegenden Betrieb. Sie können nicht deaktiviert werden, da der Dienst ohne sie nicht funktionieren würde.",
              "**Funktional** — machen die Nutzung schneller, z. B. indem sie sich deine Region merken, um die Sprache auszuwählen. Sie werden nur mit deiner Einwilligung verwendet.",
              "**Analyse und Werbung** — verwenden wir nicht.",
            ],
          },
        ],
      },
      {
        id: "list",
        title: "Von uns verwendete Cookies",
        blocks: [
          {
            table: {
              head: ["Cookie", "Zweck", "Dauer", "Typ"],
              rows: [
                ["synapsys_session", "Hält dich sicher angemeldet (HttpOnly)", "{shortSessionHours} Stunden oder {rememberDays} Tage mit \"Angemeldet bleiben\"", "Notwendig"],
                ["synapsys_consent", "Speichert deine Cookie-Auswahl", "{consentMonths} Monate", "Notwendig"],
                ["synapsys_site_lang", "Merkt sich die von dir gewählte Sprache der Website", "12 Monate", "Notwendig"],
                ["synapsys_lang", "Öffnet deinen Arbeitsbereich in der Sprache deines Kontos", "12 Monate", "Notwendig"],
                ["notion_oauth_state, evernote_oauth_state, google_docs_oauth_state", "Schützen Integrationsverbindungen vor gefälschten Anfragen", "10 bis 15 Minuten", "Notwendig"],
                ["synapsys_geo", "Merkt sich das anhand deiner IP ermittelte Land, um ohne neue Abfrage eine Sprache vorzuschlagen", "{geoDays} Tage", "Funktional"],
              ],
            },
          },
        ],
      },
      {
        id: "local-storage",
        title: "Lokaler Speicher",
        blocks: [
          "Neben Cookies speichert die App einige Informationen auf deinem Gerät, damit sie besser funktioniert:",
          {
            list: [
              "die Firebase-Authentifizierungssitzung, die dich angemeldet hält;",
              "einen Zähler für Anmeldeversuche, mit dem reCAPTCHA bei Bedarf angezeigt wird;",
              "Einstellungen der Oberfläche wie Design, Seitenleiste, zuletzt verwendete Notizbücher und die für Transkripte und Lernkarten gewählten Sprachen;",
              "eine temporäre Kopie von Daten, damit sich die App schneller öffnet.",
            ],
          },
          "Diese Informationen verbleiben nur in deinem Browser und werden gelöscht, wenn du die Website-Daten löschst.",
        ],
      },
      {
        id: "third-party",
        title: "Drittanbieter-Cookies",
        blocks: [
          "Wenn reCAPTCHA erscheint — nach erfolglosen Anmeldeversuchen oder bei der Passwortzurücksetzung — kann Google eigene Cookies setzen, um Menschen und Bots zu unterscheiden. Wenn du dich mit Google anmeldest, folgt das Anmeldefenster ebenfalls Googles Richtlinien. Diese Cookies werden von Google kontrolliert, gemäß der [Datenschutzerklärung von Google](https://policies.google.com/privacy).",
        ],
      },
      {
        id: "control",
        title: "So verwaltest du deine Auswahl",
        blocks: [
          "Du kannst deine Einstellungen jederzeit im Bereich oben oder über den Link \"Cookie-Einstellungen\" in der Fußzeile der Anmeldeseite ändern. Du kannst Cookies auch in deinen Browser-Einstellungen blockieren oder löschen — ohne die notwendigen Cookies kannst du dich jedoch nicht bei deinem Konto anmelden.",
          "Deine Auswahl wird {consentMonths} Monate lang gespeichert. Danach fragen wir dich erneut.",
        ],
      },
    ],
  },
};

export default de;
