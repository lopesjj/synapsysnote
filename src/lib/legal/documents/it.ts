import type { LegalBundle } from "../types";

const it: LegalBundle = {
  terms: {
    title: "Termini di utilizzo",
    lead: "Queste sono le regole per utilizzare {brand}: cosa puoi aspettarti da noi e cosa ci aspettiamo da te.",
    highlights: [
      { title: "Il contenuto è tuo", text: "Conservi tutti i diritti su note, file e flashcard. Li utilizziamo solo per fornire il servizio." },
      { title: "I risultati dell'AI richiedono una revisione", text: "Le trascrizioni e le flashcard generate dall'AI possono contenere errori. Verificale sempre confrontandole con la fonte ufficiale." },
      { title: "Regole di utilizzo", text: "Contenuti illegali, materiale piratato e tentativi di aggirare la sicurezza non sono consentiti." },
      { title: "Legge brasiliana", text: "Questi termini seguono la legge brasiliana e non escludono le tutele del Codice di difesa del consumatore." },
    ],
    sections: [
      {
        id: "acceptance",
        title: "Accettazione di questi termini",
        blocks: [
          "Creando un account o accedendo a {brand}, accetti questi Termini di utilizzo e l'[Informativa sulla privacy](doc:privacy), che spiega come trattiamo i tuoi dati. Se non sei d'accordo, non utilizzare il servizio.",
          "Questi termini costituiscono un contratto tra te e {controller} (\"noi\"). \"Servizio\" indica il sito web, l'app web e tutte le funzionalità in essi offerte.",
        ],
      },
      {
        id: "service",
        title: "Cos'è {brand}",
        blocks: [
          "{brand} è una piattaforma di studio e organizzazione della conoscenza, pensata per chi si prepara a concorsi pubblici, a esami di ammissione all'università e alla vita accademica. Con essa puoi:",
          {
            list: [
              "creare note, pagine, quaderni e database in un editor a blocchi;",
              "allegare immagini, PDF, audio e video, e registrare note vocali;",
              "importare contenuti da Notion, Evernote, Google Docs e da file;",
              "generare flashcard e trascrizioni con l'aiuto dell'intelligenza artificiale;",
              "ripassare ciò che hai studiato con la ripetizione spaziata.",
            ],
          },
          "Il servizio è in continua evoluzione. Possiamo aggiungere, modificare o ritirare funzionalità; quando una modifica inciderà in modo rilevante su ciò che utilizzi, ti avviseremo con ragionevole anticipo.",
        ],
      },
      {
        id: "account",
        title: "Il tuo account",
        blocks: [
          {
            list: [
              "**Età minima.** Devi avere almeno {minimumAge} anni (o l'età minima richiesta nel tuo paese, se superiore). Se hai meno di 18 anni, devi avere l'autorizzazione e la supervisione dei tuoi genitori o tutori.",
              "**Dati corretti.** Fornisci dati veritieri e mantienili aggiornati.",
              "**Accesso personale.** Il tuo account è individuale e non trasferibile. Non condividere la tua password: sei responsabile di ciò che accade nel tuo account.",
              "**Sicurezza.** Se sospetti un accesso non autorizzato, cambia la password e comunicacelo a {contactEmail}.",
            ],
          },
          "Puoi accedere con email e password o con un account Google. In questo caso si applicano anche i termini del fornitore scelto.",
        ],
      },
      {
        id: "content",
        title: "Il tuo contenuto rimane tuo",
        blocks: [
          "Tutto ciò che crei, carichi o importi — note, file, registrazioni, flashcard — appartiene a te. Non rivendichiamo alcun diritto di proprietà su tali contenuti.",
          "Affinché il servizio funzioni, ci concedi una licenza limitata, non esclusiva, gratuita e mondiale per archiviare, copiare, elaborare e mostrare i tuoi contenuti **esclusivamente per fornirti il servizio** — ad esempio salvare le tue note, creare backup o trascrivere audio su tua richiesta. Questa licenza termina quando elimini il contenuto o il tuo account, fatti salvi i periodi indicati nell'[Informativa sulla privacy](doc:privacy#retention).",
          "Dichiari di detenere i diritti necessari su ciò che carichi. Non pubblichiamo i tuoi contenuti, non li vendiamo e non li utilizziamo per addestrare modelli di intelligenza artificiale.",
        ],
      },
      {
        id: "acceptable-use",
        title: "Utilizzo accettabile",
        blocks: [
          "Per mantenere la piattaforma sicura ed equa per tutti, accetti di non:",
          {
            list: [
              "archiviare o distribuire contenuti illegali, discriminatori, che incitino alla violenza o che sfruttino bambini e adolescenti;",
              "condividere materiale protetto dal diritto d'autore senza autorizzazione, come dispense, videolezioni e corsi piratati;",
              "tentare di accedere ad account, dati o sistemi di terzi, o aggirare i meccanismi di sicurezza e i limiti di utilizzo;",
              "utilizzare bot, scraper o automazioni per estrarre dati o sovraccaricare il servizio;",
              "copiare, decompilare o fare reverse engineering del software, salvo dove consentito dalla legge;",
              "utilizzare il servizio per inviare spam o malware, o per commettere qualsiasi tipo di frode.",
            ],
          },
          "Possiamo rimuovere contenuti o limitare l'accesso di chi viola queste regole, in misura proporzionata alla violazione.",
        ],
      },
      {
        id: "ai",
        title: "Funzionalità di intelligenza artificiale",
        blocks: [
          "Alcune funzionalità utilizzano l'intelligenza artificiale: trascrizione audio e video, generazione di flashcard, rilevamento di card duplicate e traduzione. Elaborano solo il contenuto che scegli, nel momento in cui attivi la funzionalità.",
          {
            note: "I risultati generati dall'AI possono contenere errori, omissioni o imprecisioni. Rivedi trascrizioni e flashcard prima di usarle per studiare e verifica sempre con la fonte ufficiale — il testo di legge, il bando o la bibliografia consigliata.",
          },
          "Ciò che l'AI genera dal tuo contenuto è tuo, alle stesse condizioni del resto dei tuoi contenuti. Possiamo applicare limiti di utilizzo per mantenere queste funzionalità disponibili per tutti.",
        ],
      },
      {
        id: "integrations",
        title: "Integrazioni con altri servizi",
        blocks: [
          "Quando colleghi Notion, Evernote o Google Docs, ci autorizzi ad accedere a quei servizi per tuo conto, solo per elencare e importare il contenuto che selezioni. Puoi disconnettere un'integrazione in qualsiasi momento dalla pagina delle integrazioni.",
          "Questi servizi appartengono a terzi e hanno termini e informative propri. Non siamo affiliati a tali servizi e i relativi marchi appartengono ai rispettivi titolari. Non siamo responsabili di indisponibilità o modifiche di questi servizi.",
        ],
      },
      {
        id: "pricing",
        title: "Prezzi e piani",
        blocks: [
          "{brand} è attualmente offerto gratuitamente. Se lanceremo piani a pagamento, il prezzo, il metodo di pagamento e le condizioni di disdetta saranno presentati in modo chiaro prima di qualsiasi addebito — nulla ti verrà addebitato senza la tua accettazione espressa.",
        ],
      },
      {
        id: "intellectual-property",
        title: "Proprietà intellettuale di {brand}",
        blocks: [
          "Il software, il marchio, il design e gli altri elementi del servizio appartengono a {brand} e sono protetti dalla normativa sulla proprietà intellettuale. Ti concediamo una licenza personale, limitata, revocabile e non trasferibile per utilizzare il servizio in base a questi termini.",
          "Se ci invii suggerimenti, possiamo utilizzarli per migliorare il servizio senza obbligo di compensarti.",
        ],
      },
      {
        id: "availability",
        title: "Disponibilità e backup",
        blocks: [
          "Lavoriamo per mantenere il servizio disponibile e i tuoi dati al sicuro. Ciononostante, possono verificarsi interruzioni per manutenzione, aggiornamenti o ragioni al di fuori del nostro controllo.",
          "Ti consigliamo di conservare copie di tutto ciò che è essenziale per te — ad esempio esportando le note in PDF.",
          "{brand} è uno strumento di supporto allo studio e non garantisce il superamento di concorsi, esami di ammissione o altre valutazioni.",
        ],
      },
      {
        id: "liability",
        title: "Limitazione di responsabilità",
        blocks: [
          "Nella misura massima consentita dalla legge, non rispondiamo di danni indiretti, lucro cessante o perdita di opportunità derivanti dall'uso o dall'impossibilità di usare il servizio, né dei contenuti creati dagli utenti o dei servizi di terzi.",
          "Nulla in questi termini esclude o limita i diritti che non possono essere derogati per contratto, inclusi quelli garantiti dal Codice di difesa del consumatore brasiliano (Legge n. 8.078/1990) e dalle leggi imperative a tutela dei consumatori del tuo paese.",
        ],
      },
      {
        id: "termination",
        title: "Cessazione",
        blocks: [
          "Puoi smettere di utilizzare il servizio e eliminare il tuo account in qualsiasi momento, in Preferenze › Privacy e dati o scrivendo a {privacyEmail}. I tempi di eliminazione sono indicati nell'[Informativa sulla privacy](doc:privacy#retention).",
          "Possiamo sospendere o chiudere gli account che violino questi termini in modo grave o ripetuto, che mettano a rischio altre persone, oppure quando la legge lo richiede. Salvo in casi urgenti o di illiceità, ti avviseremo in anticipo e ti daremo la possibilità di esportare i tuoi contenuti.",
        ],
      },
      {
        id: "changes",
        title: "Modifiche a questi termini",
        blocks: [
          "Possiamo aggiornare questi termini per riflettere modifiche al servizio o alla normativa. Le modifiche rilevanti saranno comunicate con almeno {noticeDays} giorni di preavviso, tramite email o tramite un avviso nel servizio. La data dell'ultimo aggiornamento è sempre indicata in cima a questo documento.",
        ],
      },
      {
        id: "law",
        title: "Legge applicabile e contatto",
        blocks: [
          "Questi termini sono regolati dalle leggi della Repubblica Federativa del Brasile, e per qualsiasi controversia è competente il foro del tuo domicilio. Se vivi in un altro paese, restano comunque applicabili le norme imperative a tutela dei consumatori del tuo luogo di residenza.",
          "Domande su questi termini? Scrivi a {contactEmail}.",
        ],
      },
    ],
  },

  privacy: {
    title: "Informativa sulla privacy",
    lead: "Questa informativa spiega quali dati trattiamo, perché, con chi li condividiamo e come puoi esercitare i tuoi diritti, ai sensi della Legge generale brasiliana sulla protezione dei dati (LGPD) e, ove applicabile, del GDPR europeo.",
    highlights: [
      { title: "Nessuna pubblicità", text: "Non vendiamo dati, non mostriamo pubblicità e non utilizziamo tracker di terze parti." },
      { title: "AI su richiesta", text: "I contenuti vengono inviati a un fornitore AI solo quando attivi una funzionalità, e non vengono mai utilizzati per addestrare modelli." },
      { title: "Sicurezza", text: "Connessioni crittografate, dati isolati per account e token di integrazione crittografati con AES-256." },
      { title: "I tuoi diritti", text: "Puoi accedere, correggere, esportare o eliminare i tuoi dati. Rispondiamo entro {responseDays} giorni." },
    ],
    sections: [
      {
        id: "controller",
        title: "Chi siamo",
        blocks: [
          "{controller} è il titolare del trattamento dei dati personali trattati nel servizio, ai sensi della Legge generale brasiliana sulla protezione dei dati (LGPD, Legge n. 13.709/2018). Questa informativa si applica al sito web, all'app web e ai canali di assistenza.",
          "Per qualsiasi questione relativa alla privacy, contatta il nostro responsabile della protezione dei dati (DPO) all'indirizzo {privacyEmail}.",
        ],
      },
      {
        id: "data",
        title: "Dati che trattiamo",
        blocks: [
          {
            table: {
              head: ["Categoria", "Esempi", "Fonte"],
              rows: [
                ["Registrazione", "Nome, email, numero di telefono e foto del profilo", "Tu o il tuo account Google"],
                ["Credenziali", "Password, archiviata solo in forma crittografata dal fornitore di autenticazione", "Tu"],
                ["Contenuti", "Note, pagine, quaderni, flashcard, allegati, audio e video", "Tu e le importazioni che esegui"],
                ["Integrazioni", "Token di accesso per Notion, Evernote e Google Docs", "Il servizio collegato, con la tua autorizzazione"],
                ["Preferenze", "Lingua, tema, accessibilità e layout", "Tu"],
                ["Accettazione dei documenti", "Versione e data in cui hai accettato i Termini d'uso e questa informativa", "Tu"],
                ["Dati tecnici", "Indirizzo IP, paese approssimativo, browser, dispositivo, data e ora di accesso", "Raccolta automatica"],
              ],
            },
          },
          "Non chiediamo dati sensibili. Se inserisci informazioni di questo tipo nelle tue note, vengono trattate solo come parte dei tuoi contenuti, sotto il tuo controllo.",
        ],
      },
      {
        id: "purposes",
        title: "Per quali finalità li utilizziamo e con quale base giuridica",
        blocks: [
          {
            table: {
              head: ["Finalità", "Base giuridica (LGPD)"],
              rows: [
                ["Creare e mantenere il tuo account, autenticare l'accesso e sincronizzare i tuoi contenuti", "Esecuzione del contratto (art. 7, V)"],
                ["Eseguire le funzionalità che attivi: importazioni, trascrizioni, flashcard e traduzioni", "Esecuzione del contratto (art. 7, V)"],
                ["Proteggere gli account da frodi e accessi non autorizzati, anche tramite reCAPTCHA", "Legittimo interesse (art. 7, IX)"],
                ["Conservare i log di accesso per il periodo previsto dal Marco Civil da Internet brasiliano", "Obbligo legale (art. 7, II)"],
                ["Inviare comunicazioni essenziali, come la reimpostazione della password e gli avvisi di modifica", "Esecuzione del contratto (art. 7, V)"],
                ["Ricordare la tua regione per scegliere la lingua del sito", "Consenso (art. 7, I), che puoi revocare in qualsiasi momento"],
                ["Registrare la versione dei documenti che hai accettato", "Esercizio regolare dei diritti (art. 7, VI)"],
                ["Difendere i diritti in procedimenti giudiziari o amministrativi", "Esercizio regolare dei diritti (art. 7, VI)"],
              ],
            },
          },
          "Non utilizziamo i tuoi dati per pubblicità, profili di marketing o decisioni automatizzate che incidano sui tuoi interessi.",
        ],
      },
      {
        id: "ai",
        title: "Intelligenza artificiale",
        blocks: [
          "Quando richiedi una trascrizione, generi flashcard o traduci un passaggio, inviamo al fornitore solo il contenuto necessario per tale attività:",
          {
            list: [
              "**Trascrizione audio e video:** Google Gemini API; in alternativa, un modello open source (Whisper) eseguito sui nostri server.",
              "**Trascrizione in tempo reale delle note vocali:** il riconoscimento vocale del browser, che potrebbe inviare l'audio al produttore (Google, Microsoft o Apple). Rimane disattivato finché non lo attivi durante la registrazione.",
              "**Flashcard e rilevamento di card duplicate:** Google Gemini API.",
              "**Traduzione:** Google Gemini API; finché non è disponibile, Google Cloud Translation.",
            ],
          },
          { note: "Non utilizziamo i tuoi contenuti per addestrare modelli di intelligenza artificiale, e nessuna funzionalità di AI viene eseguita senza una tua azione." },
        ],
      },
      {
        id: "sharing",
        title: "Con chi condividiamo i dati",
        blocks: [
          "Non vendiamo né affittiamo dati personali. Condividiamo solo ciò che è necessario con responsabili del trattamento che ci aiutano a fornire il servizio, soggetti a obblighi di riservatezza e sicurezza:",
          {
            table: {
              head: ["Partner", "Ruolo"],
              rows: [
                ["Google Cloud e Firebase", "Hosting, database, archiviazione file, autenticazione ed email di sistema"],
                ["Google reCAPTCHA", "Protezione contro i bot all'accesso e nella reimpostazione della password"],
                ["Google Gemini API e Google Cloud Translation", "Funzionalità AI e di traduzione che attivi"],
                ["Riconoscimento vocale e voci del browser (Google, Microsoft o Apple)", "Trascrizione in tempo reale, se attivata, e lettura ad alta voce quando il browser utilizza voci online"],
                ["country.is (geolocalizzazione IP)", "Identificare il tuo paese per suggerire una lingua, solo con il tuo consenso e senza memorizzare il tuo indirizzo IP"],
                ["jsDelivr, Unsplash e flagcdn", "Caricamento di librerie, caratteri e immagini pubbliche dell'interfaccia; ricevono solo dati tecnici di connessione come IP e browser"],
                ["Notion, Evernote e Google Docs", "Solo quando colleghi l'integrazione, per importare ciò che scegli"],
              ],
            },
          },
          "Possiamo inoltre condividere dati quando richiesto dalla legge, da un provvedimento giudiziario o da un'autorità competente — sempre nei limiti di quanto richiesto — o nell'ambito di una riorganizzazione societaria, ferme restando le garanzie di questa informativa.",
        ],
      },
      {
        id: "google-data",
        title: "Dati ricevuti dalle API di Google",
        blocks: [
          "L'uso da parte di {brand} e il trasferimento a qualsiasi altra app delle informazioni ricevute dalle API di Google saranno conformi alla [Norme relative ai dati utente dei servizi API di Google](https://developers.google.com/terms/api-services-user-data-policy), inclusi i requisiti di utilizzo limitato.",
          "Quando colleghi Google Docs, accediamo ai tuoi documenti solo per elencarli e importare quelli che selezioni. Questi dati non vengono utilizzati per la pubblicità, non vengono venduti e non vengono letti da esseri umani, tranne con il tuo consenso, per motivi di sicurezza o per obbligo di legge.",
        ],
      },
      {
        id: "transfer",
        title: "Trasferimenti internazionali",
        blocks: [
          "La nostra infrastruttura si trova nei data center di Google Cloud negli Stati Uniti, e alcuni partner possono trattare dati in altri paesi. Questi trasferimenti avvengono nel rispetto dell'art. 33 della LGPD e, ove applicabile, del GDPR, con fornitori che offrono garanzie contrattuali e tecniche compatibili con tali leggi.",
        ],
      },
      {
        id: "retention",
        title: "Per quanto tempo conserviamo i dati",
        blocks: [
          {
            list: [
              "**Account e contenuti:** finché il tuo account è attivo.",
              "**Cestino:** gli elementi eliminati rimangono nel cestino per {trashDays} giorni e vengono poi cancellati definitivamente.",
              "**Eliminazione dell'account:** fatta in Preferenze › Privacy e dati, i dati vengono cancellati subito; richiesta via email, entro 30 giorni. Resta solo ciò che la legge ci impone di conservare, come i registri di accesso.",
              "**Log di accesso:** {accessLogMonths} mesi, ai sensi dell'art. 15 del Marco Civil da Internet brasiliano (Legge n. 12.965/2014).",
              "**Token di integrazione:** fino a quando non disconnetti l'integrazione o elimini il tuo account.",
            ],
          },
        ],
      },
      {
        id: "security",
        title: "Come proteggiamo i tuoi dati",
        blocks: [
          {
            list: [
              "le connessioni sono sempre crittografate (HTTPS/TLS);",
              "le regole di accesso isolano i dati di ogni account nel database e nell'archiviazione file. I file allegati si aprono tramite link privati e impossibili da indovinare; chi riceve uno di questi link può aprire il file, quindi condividili con attenzione;",
              "i token di integrazione sono crittografati con AES-256-GCM;",
              "la sessione è conservata in un cookie HttpOnly, inaccessibile agli script;",
              "i tentativi di accesso sono limitati e la verifica reCAPTCHA protegge dagli attacchi automatizzati;",
              "l'accesso interno è limitato al minimo necessario.",
            ],
          },
          "Nessun sistema è immune da incidenti. Se si verifica un incidente di sicurezza che possa comportare un rischio o un danno rilevante, lo comunicheremo a te e all'Autorità nazionale brasiliana per la protezione dei dati (ANPD), come previsto dall'art. 48 della LGPD.",
        ],
      },
      {
        id: "rights",
        title: "I tuoi diritti",
        blocks: [
          "La LGPD ti garantisce, tra gli altri, i diritti di:",
          {
            list: [
              "confermare se trattiamo i tuoi dati e accedervi;",
              "correggere dati incompleti, inesatti o non aggiornati;",
              "richiedere l'anonimizzazione, il blocco o la cancellazione di dati inutili o trattati in modo non conforme alla legge;",
              "ricevere i tuoi dati in un formato portabile;",
              "sapere con chi condividiamo i tuoi dati;",
              "revocare il consenso e opporti al trattamento basato su altre basi giuridiche;",
              "richiedere la cancellazione del tuo account e dei tuoi dati.",
            ],
          },
          "Puoi scaricare una copia completa dei tuoi dati ed eliminare l'account da solo in Preferenze › Privacy e dati. Per esercitare qualsiasi diritto puoi anche scrivere a {privacyEmail} dall'indirizzo email del tuo account. Rispondiamo entro {responseDays} giorni. Puoi anche presentare un reclamo all'ANPD.",
          "Se ti trovi nello Spazio economico europeo o nel Regno Unito, hai anche i diritti previsti dal GDPR, incluso il diritto di presentare un reclamo all'autorità per la protezione dei dati del tuo paese.",
        ],
      },
      {
        id: "children",
        title: "Bambini e adolescenti",
        blocks: [
          "{brand} non è destinato ai minori di {minimumAge} anni, e non raccogliamo intenzionalmente i loro dati. Gli adolescenti a partire da tale età possono utilizzare il servizio con l'autorizzazione e la supervisione dei genitori o tutori, e i loro dati sono sempre trattati nel loro migliore interesse, come previsto dall'art. 14 della LGPD. Se individuiamo l'account di un bambino, questo verrà eliminato.",
        ],
      },
      {
        id: "cookies",
        title: "Cookie",
        blocks: [
          "Utilizziamo solo cookie essenziali e, con il tuo consenso, un cookie funzionale. Non utilizziamo cookie pubblicitari né di analisi. I dettagli e le opzioni di controllo sono disponibili nell'[Informativa sui cookie](doc:cookies).",
        ],
      },
      {
        id: "changes",
        title: "Modifiche e contatto",
        blocks: [
          "Possiamo aggiornare questa informativa per riflettere modifiche al servizio o alla legge. Le modifiche rilevanti saranno comunicate in anticipo, tramite email o nel servizio stesso.",
          "Domande, richieste o reclami: {privacyEmail}.",
        ],
      },
    ],
  },

  cookies: {
    title: "Informativa sui cookie",
    lead: "I cookie sono piccoli file che il sito salva nel tuo browser. Questa informativa li elenca uno per uno e spiega come controllare quelli non essenziali.",
    highlights: [
      { title: "Essenziali", text: "Ti mantengono connesso, ricordano la tua lingua e proteggono il tuo account." },
      { title: "Nessun tracciamento", text: "Non utilizziamo cookie pubblicitari, pixel dei social media né strumenti di analisi." },
      { title: "Opzionale solo con il tuo permesso", text: "Il nostro unico cookie opzionale dipende dal tuo consenso, che puoi revocare in qualsiasi momento." },
    ],
    sections: [
      {
        id: "what",
        title: "Cosa sono i cookie",
        blocks: [
          "I cookie sono piccoli file di testo che un sito web salva nel tuo browser per ricordare informazioni tra le visite. Tecnologie simili, come l'archiviazione locale (localStorage) e IndexedDB, conservano dati sul tuo dispositivo. In questa informativa li chiamiamo tutti \"cookie\".",
        ],
      },
      {
        id: "categories",
        title: "Come utilizziamo i cookie",
        blocks: [
          {
            list: [
              "**Essenziali** — necessari per il login, la sicurezza e il funzionamento di base. Non possono essere disattivati, perché il servizio non funzionerebbe senza di essi.",
              "**Funzionali** — rendono l'esperienza più rapida, ad esempio ricordando la tua regione per scegliere la lingua. Sono utilizzati solo con il tuo consenso.",
              "**Analisi e pubblicità** — non ne utilizziamo.",
            ],
          },
        ],
      },
      {
        id: "list",
        title: "Cookie che utilizziamo",
        blocks: [
          {
            table: {
              head: ["Cookie", "Finalità", "Durata", "Tipo"],
              rows: [
                ["synapsys_session", "Ti mantiene connesso in modo sicuro (HttpOnly)", "{shortSessionHours} ore, o {rememberDays} giorni con \"Rimani connesso\"", "Essenziale"],
                ["synapsys_consent", "Memorizza le tue scelte sui cookie", "{consentMonths} mesi", "Essenziale"],
                ["synapsys_site_lang", "Ricorda la lingua che hai scelto per il sito", "12 mesi", "Essenziale"],
                ["synapsys_lang", "Apre il tuo spazio di lavoro nella lingua del tuo account", "12 mesi", "Essenziale"],
                ["notion_oauth_state, evernote_oauth_state, google_docs_oauth_state", "Proteggono le connessioni di integrazione da richieste contraffatte", "da 10 a 15 minuti", "Essenziale"],
                ["synapsys_geo", "Ricorda il paese identificato dal tuo IP per suggerire la lingua senza una nuova consultazione", "{geoDays} giorni", "Funzionale"],
              ],
            },
          },
        ],
      },
      {
        id: "local-storage",
        title: "Archiviazione locale",
        blocks: [
          "Oltre ai cookie, l'app conserva alcune informazioni sul tuo dispositivo per funzionare meglio:",
          {
            list: [
              "la sessione di autenticazione Firebase, che ti mantiene connesso;",
              "un contatore di tentativi di accesso, usato per mostrare reCAPTCHA quando necessario;",
              "preferenze dell'interfaccia, come tema, barra laterale, quaderni recenti e le lingue scelte per trascrizioni e flashcard;",
              "una copia delle tue note e dei quaderni, perché l'app si apra più velocemente e continui a funzionare offline.",
            ],
          },
          "Queste informazioni rimangono solo nel tuo browser e vengono cancellate quando esci dall'account, quando la sessione scade o quando elimini i dati del sito.",
        ],
      },
      {
        id: "third-party",
        title: "Cookie di terze parti",
        blocks: [
          "Quando appare reCAPTCHA — dopo tentativi di accesso falliti o durante il reset della password — Google può impostare cookie propri per distinguere le persone dai bot. Quando accedi con Google, anche la finestra di accesso segue le norme di Google. Questi cookie sono controllati da Google, secondo le [Norme sulla privacy di Google](https://policies.google.com/privacy).",
        ],
      },
      {
        id: "control",
        title: "Come gestire le tue scelte",
        blocks: [
          "Puoi modificare le tue preferenze in qualsiasi momento nel pannello qui sopra o tramite il link \"Preferenze cookie\" in fondo alla pagina di accesso. Puoi anche bloccare o eliminare i cookie nelle impostazioni del browser — ma senza quelli essenziali non potrai accedere al tuo account.",
          "Le tue scelte vengono salvate per {consentMonths} mesi. Trascorso tale periodo, te lo chiederemo di nuovo.",
        ],
      },
    ],
  },
};

export default it;
