import type { LegalBundle } from "../types";

const en: LegalBundle = {
  terms: {
    title: "Terms of Use",
    lead: "These are the rules for using {brand}: what you can expect from us and what we expect from you.",
    highlights: [
      { title: "Your content is yours", text: "You keep all rights to your notes, files and flashcards. We only use them to provide the service." },
      { title: "AI output needs review", text: "AI-generated transcripts and flashcards may contain errors. Always check them against the official source." },
      { title: "Rules of use", text: "Illegal content, pirated material and attempts to bypass security are not allowed." },
      { title: "Brazilian law", text: "These terms follow Brazilian law and do not set aside the protections of the Brazilian Consumer Protection Code." },
    ],
    sections: [
      {
        id: "acceptance",
        title: "Accepting these terms",
        blocks: [
          "By creating an account or accessing {brand}, you agree to these Terms of Use and to the [Privacy Policy](doc:privacy), which explains how we handle your data. If you do not agree, do not use the service.",
          "These terms form a contract between you and {controller} (\"we\"). The \"Service\" means the website, the web app and all the features offered in them.",
        ],
      },
      {
        id: "service",
        title: "What {brand} is",
        blocks: [
          "{brand} is a platform for studying and organizing knowledge, designed for people preparing for civil service exams, university entrance exams and academic life. With it, you can:",
          {
            list: [
              "create notes, pages, notebooks and databases in a block editor;",
              "attach images, PDFs, audio and video, and record voice notes;",
              "import content from Notion, Evernote, Google Docs and files;",
              "generate flashcards and transcripts with the help of artificial intelligence;",
              "review what you have studied with spaced repetition.",
            ],
          },
          "The service is constantly evolving. We may add, change or discontinue features; when a change materially affects something you use, we will give you reasonable advance notice.",
        ],
      },
      {
        id: "account",
        title: "Your account",
        blocks: [
          {
            list: [
              "**Minimum age.** You must be at least {minimumAge} years old (or the minimum age required in your country, if higher). If you are under 18, you need the permission and supervision of your parents or legal guardians.",
              "**Accurate information.** Provide truthful information and keep it up to date.",
              "**Personal access.** Your account is personal and non-transferable. Do not share your password: you are responsible for what happens in your account.",
              "**Security.** If you suspect unauthorized access, change your password and let us know at {contactEmail}.",
            ],
          },
          "You can sign in with an email and password or with a Google account. In the latter case, the terms of the chosen provider also apply.",
        ],
      },
      {
        id: "content",
        title: "Your content remains yours",
        blocks: [
          "Everything you create, upload or import — notes, files, recordings, flashcards — belongs to you. We do not claim any ownership rights over that content.",
          "For the service to work, you grant us a limited, non-exclusive, royalty-free, worldwide license to store, copy, process and display your content **solely to provide the service to you** — for example, to save your notes, make backups or transcribe audio when you ask us to. The license ends when you delete the content or your account, subject to the periods set out in the [Privacy Policy](doc:privacy#retention).",
          "You represent that you hold the necessary rights to what you upload. We do not publish your content, sell it or use it to train artificial intelligence models.",
        ],
      },
      {
        id: "acceptable-use",
        title: "Acceptable use",
        blocks: [
          "To keep the platform safe and fair for everyone, you agree not to:",
          {
            list: [
              "store or distribute content that is illegal or discriminatory, that incites violence or that exploits children or adolescents;",
              "share copyrighted material without authorization, such as pirated study guides, video lessons and courses;",
              "attempt to access third parties' accounts, data or systems, or bypass security mechanisms and usage limits;",
              "use bots, scrapers or automation to extract data or overload the service;",
              "copy, decompile or reverse engineer the software, except where the law allows it;",
              "use the service to send spam or malware, or to commit any kind of fraud.",
            ],
          },
          "We may remove content or restrict the access of anyone who violates these rules, in proportion to the violation.",
        ],
      },
      {
        id: "ai",
        title: "Artificial intelligence features",
        blocks: [
          "Some features use artificial intelligence: audio and video transcription, flashcard generation, duplicate-card detection and translation. They process only the content you choose, at the moment you trigger the feature.",
          {
            note: "AI-generated output may contain errors, omissions or inaccuracies. Review transcripts and flashcards before studying with them, and always check them against the official source — the text of the law, the exam notice or the recommended reading list.",
          },
          "What the AI generates from your content is yours, on the same terms as the rest of your content. We may apply usage limits to keep these features available to everyone.",
        ],
      },
      {
        id: "integrations",
        title: "Integrations with other services",
        blocks: [
          "When you connect Notion, Evernote or Google Docs, you authorize us to access those services on your behalf, solely to list and import the content you select. You can disconnect an integration at any time on the integrations page.",
          "These services belong to third parties and have their own terms and policies. We are not affiliated with them, and their trademarks belong to their respective owners. We are not responsible for outages of, or changes to, those services.",
        ],
      },
      {
        id: "pricing",
        title: "Pricing and plans",
        blocks: [
          "{brand} is currently offered free of charge. If we launch paid plans, the price, payment method and cancellation terms will be clearly presented before any charge is made — you will not be charged anything without your express acceptance.",
        ],
      },
      {
        id: "intellectual-property",
        title: "{brand}'s intellectual property",
        blocks: [
          "The software, brand, design and other elements of the service belong to {brand} and are protected by intellectual property law. We grant you a personal, limited, revocable and non-transferable license to use the service in accordance with these terms.",
          "If you send us suggestions, we may use them to improve the service, with no obligation to compensate you.",
        ],
      },
      {
        id: "availability",
        title: "Availability and backups",
        blocks: [
          "We work to keep the service available and your data safe. Even so, interruptions may occur for maintenance, updates or reasons beyond our control.",
          "We recommend keeping copies of anything essential to you — for example, by exporting notes as PDF.",
          "{brand} is a tool to support your studies and does not guarantee that you will pass civil service exams, university entrance exams or any other assessment.",
        ],
      },
      {
        id: "liability",
        title: "Limitation of liability",
        blocks: [
          "To the fullest extent permitted by law, we are not liable for indirect damages, lost profits or lost opportunities arising from the use of, or inability to use, the service, nor for user-created content or third-party services.",
          "Nothing in these terms excludes or limits rights that cannot be set aside by contract, including those guaranteed by the Brazilian Consumer Protection Code (Law No. 8,078/1990) and by the mandatory consumer protection laws of your country.",
        ],
      },
      {
        id: "termination",
        title: "Termination",
        blocks: [
          "You can stop using the service and delete your account whenever you want, under Preferences › Privacy & data or by writing to {privacyEmail}. Deletion periods are set out in the [Privacy Policy](doc:privacy#retention).",
          "We may suspend or terminate accounts that seriously or repeatedly violate these terms or that put other people at risk, or when the law requires it. Except in urgent cases or cases of unlawful conduct, we will notify you in advance and give you the opportunity to export your content.",
        ],
      },
      {
        id: "changes",
        title: "Changes to these terms",
        blocks: [
          "We may update these terms to reflect changes in the service or in the law. Material changes will be announced at least {noticeDays} days in advance, by email or through a notice in the service. The date of the last update is always shown at the top of this document.",
        ],
      },
      {
        id: "law",
        title: "Governing law and contact",
        blocks: [
          "These terms are governed by the laws of the Federative Republic of Brazil, and the courts of your place of domicile are chosen as the venue for resolving any dispute. If you live in another country, the mandatory consumer protection rules of your place of residence continue to apply.",
          "Questions about these terms? Write to {contactEmail}.",
        ],
      },
    ],
  },

  privacy: {
    title: "Privacy Policy",
    lead: "This policy explains what data we process, why, who we share it with and how you can exercise your rights, in accordance with the Brazilian General Data Protection Law (LGPD) and, where applicable, the European GDPR.",
    highlights: [
      { title: "No advertising", text: "We do not sell data, show ads or use third-party trackers." },
      { title: "AI on demand", text: "Content goes to an AI provider only when you trigger a feature, and it is never used to train models." },
      { title: "Security", text: "Encrypted connections, data isolated per account and integration tokens encrypted with AES-256." },
      { title: "Your rights", text: "You can access, correct, export or delete your data. We respond within {responseDays} days." },
    ],
    sections: [
      {
        id: "controller",
        title: "Who we are",
        blocks: [
          "{controller} is the controller of the personal data processed in the service, within the meaning of the LGPD (Law No. 13,709/2018). This policy applies to the website, the web app and our customer support channels.",
          "For any privacy matter, contact our data protection officer (DPO) at {privacyEmail}.",
        ],
      },
      {
        id: "data",
        title: "Data we process",
        blocks: [
          {
            table: {
              head: ["Category", "Examples", "Source"],
              rows: [
                ["Registration", "Name, email, phone number and profile photo", "You or your Google account"],
                ["Credentials", "Password, stored only in encrypted form by the authentication provider", "You"],
                ["Content", "Notes, pages, notebooks, flashcards, attachments, audio and video", "You and the imports you make"],
                ["Integrations", "Access tokens for Notion, Evernote and Google Docs", "The connected service, with your authorization"],
                ["Preferences", "Language, theme, accessibility and layout", "You"],
                ["Technical data", "IP address, approximate country, browser, device, date and time of access", "Collected automatically"],
                ["Document acceptance", "Version and timestamp when you accepted the Terms of Use and this policy", "You"],
              ],
            },
          },
          "We do not ask for sensitive data. If you record that kind of information in your notes, it is handled only as part of your content, under your control.",
        ],
      },
      {
        id: "purposes",
        title: "What we use it for and on what legal basis",
        blocks: [
          {
            table: {
              head: ["Purpose", "Legal basis (LGPD)"],
              rows: [
                ["Creating and maintaining your account, authenticating access and syncing your content", "Performance of a contract (art. 7, V)"],
                ["Running features you trigger: imports, transcriptions, flashcards and translations", "Performance of a contract (art. 7, V)"],
                ["Protecting accounts against fraud and unauthorized access, including with reCAPTCHA", "Legitimate interest (art. 7, IX)"],
                ["Keeping access logs for the period set by the Brazilian Civil Rights Framework for the Internet (Marco Civil da Internet)", "Legal obligation (art. 7, II)"],
                ["Sending essential communications, such as password resets and notices of changes", "Performance of a contract (art. 7, V)"],
                ["Remembering your region to choose the site language", "Consent (art. 7, I), which you can withdraw at any time"],
                ["Recording the version of documents you accepted", "Regular exercise of rights (art. 7, VI)"],
                ["Defending rights in judicial or administrative proceedings", "Regular exercise of rights (art. 7, VI)"],
              ],
            },
          },
          "We do not use your data for advertising, marketing profiles or automated decisions that affect your interests.",
        ],
      },
      {
        id: "ai",
        title: "Artificial intelligence",
        blocks: [
          "When you request a transcription, generate flashcards or translate a passage, we send the provider only the content needed for that task:",
          {
            list: [
              "**Audio and video transcription:** Google Gemini API; as an alternative, an open-source model (Whisper) running on our own servers.",
              "**Flashcards and duplicate-card detection:** Google Gemini API.",
              "**Translation:** Google Cloud Translation; while it is unavailable, the Google Gemini API itself.",
              "**Live transcription of voice notes:** your browser's speech recognition, which may send audio to the provider (Google, Microsoft, or Apple). Stays off until you turn it on during recording.",
            ],
          },
          { note: "We do not use your content to train artificial intelligence models, and no AI feature runs without an action on your part." },
        ],
      },
      {
        id: "sharing",
        title: "Who we share data with",
        blocks: [
          "We do not sell or rent personal data. We share only what is necessary with processors that help us provide the service, under confidentiality and security obligations:",
          {
            table: {
              head: ["Partner", "Role"],
              rows: [
                ["Google Cloud and Firebase", "Hosting, database, file storage, authentication and system emails"],
                ["Google reCAPTCHA", "Protection against bots at sign-in and password reset"],
                ["Google Gemini API and Google Cloud Translation", "AI and translation features you trigger"],
                ["country.is (IP geolocation)", "Identifying your country to suggest a language, only with your consent and without storing your IP address"],
                ["Notion, Evernote and Google Docs", "Only when you connect the integration, to import what you choose"],
                ["Browser speech recognition and voices (Google, Microsoft, or Apple)", "Live transcription, if you enable it, and read-aloud when the browser uses online voices"],
                ["jsDelivr, Unsplash and flagcdn", "Loading interface libraries, fonts and public images; they receive only technical connection data such as IP and browser"],
              ],
            },
          },
          "We may also share data when required by law, court order or a competent authority — always limited to what is requested — or in a corporate reorganization, provided the safeguards of this policy are maintained.",
        ],
      },
      {
        id: "google-data",
        title: "Data received from Google APIs",
        blocks: [
          "{brand}'s use and transfer to any other app of information received from Google APIs will adhere to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements.",
          "When you connect Google Docs, we access your documents only to list them and import the ones you select. This data is not used for advertising, is not sold and is not read by humans, except with your consent, for security purposes or to comply with a legal obligation.",
        ],
      },
      {
        id: "transfer",
        title: "International transfers",
        blocks: [
          "Our infrastructure is located in Google Cloud data centers in the United States, and some partners may process data in other countries. These transfers comply with article 33 of the LGPD and, where applicable, the GDPR, using providers that offer contractual and technical safeguards consistent with those laws.",
        ],
      },
      {
        id: "retention",
        title: "How long we keep data",
        blocks: [
          {
            list: [
              "**Account and content:** for as long as your account is active.",
              "**Trash:** deleted items stay in the trash for {trashDays} days and are then permanently erased.",
              "**Account deletion:** when done under Preferences › Privacy & data, data is erased immediately; when requested by email, within 30 days. Only what the law requires us to keep, such as access logs, remains.",
              "**Access logs:** {accessLogMonths} months, in accordance with article 15 of the Brazilian Civil Rights Framework for the Internet (Law No. 12,965/2014).",
              "**Integration tokens:** until you disconnect the integration or delete your account.",
            ],
          },
        ],
      },
      {
        id: "security",
        title: "How we protect your data",
        blocks: [
          {
            list: [
              "connections that are always encrypted (HTTPS/TLS);",
              "access rules that isolate each account's data in the database and in file storage. Attached files open through private, unguessable links; anyone who receives one of these links can open the file, so share them with care;",
              "integration tokens encrypted with AES-256-GCM;",
              "a session kept in an HttpOnly cookie, inaccessible to scripts;",
              "a limit on sign-in attempts and reCAPTCHA verification against automated attacks;",
              "internal access restricted to the minimum necessary.",
            ],
          },
          "No system is immune to incidents. If a security incident occurs that may cause significant risk or harm, we will notify you and the Brazilian National Data Protection Authority (ANPD), as required by article 48 of the LGPD.",
        ],
      },
      {
        id: "rights",
        title: "Your rights",
        blocks: [
          "The LGPD guarantees you, among others, the rights to:",
          {
            list: [
              "confirm whether we process your data and access it;",
              "correct incomplete, inaccurate or outdated data;",
              "request the anonymization, blocking or deletion of unnecessary data or data processed in non-compliance with the law;",
              "receive your data in a portable format;",
              "know who we share your data with;",
              "withdraw your consent and object to processing based on other legal grounds;",
              "request the deletion of your account and data.",
            ],
          },
          "You can download a full copy of your data and delete your account yourself under Preferences › Privacy & data. To exercise any right, you may also write to {privacyEmail} from the email address on your account. We respond within {responseDays} days. You may also lodge a complaint with the ANPD.",
          "If you are in the European Economic Area or the United Kingdom, you also have the rights provided for in the GDPR, including the right to lodge a complaint with the data protection authority in your country.",
        ],
      },
      {
        id: "children",
        title: "Children and adolescents",
        blocks: [
          "{brand} is not intended for anyone under {minimumAge} years of age, and we do not knowingly collect their data. Adolescents who have reached that age may use the service with the permission and supervision of their parents or legal guardians, and their data is always processed in their best interest, as required by article 14 of the LGPD. If we identify an account belonging to a child, it will be deleted.",
        ],
      },
      {
        id: "cookies",
        title: "Cookies",
        blocks: [
          "We use only essential cookies and, with your consent, one functional cookie. We do not use advertising or analytics cookies. Details and control options are in the [Cookie Policy](doc:cookies).",
        ],
      },
      {
        id: "changes",
        title: "Changes and contact",
        blocks: [
          "We may update this policy to reflect changes in the service or in the law. Material changes will be announced in advance, by email or in the service itself.",
          "Questions, requests or complaints: {privacyEmail}.",
        ],
      },
    ],
  },

  cookies: {
    title: "Cookie Policy",
    lead: "Cookies are small files that the website stores in your browser. This policy lists each of them and explains how to control the ones that are not essential.",
    highlights: [
      { title: "Essential", text: "They keep you signed in, remember your language and protect your account." },
      { title: "No tracking", text: "We do not use advertising cookies, social media pixels or analytics tools." },
      { title: "Optional only with permission", text: "The only optional cookie depends on your consent, which you can withdraw at any time." },
    ],
    sections: [
      {
        id: "what",
        title: "What cookies are",
        blocks: [
          "Cookies are small text files that a website saves in your browser to remember information from one visit to the next. Similar technologies, such as local storage (localStorage) and IndexedDB, store data on your own device. In this policy, we refer to all of these as \"cookies\".",
        ],
      },
      {
        id: "categories",
        title: "How we use cookies",
        blocks: [
          {
            list: [
              "**Essential** — required for sign-in, security and basic operation. They cannot be turned off, because the service would not work without them.",
              "**Functional** — make the experience faster, for example by remembering your region to choose the language. They are used only with your consent.",
              "**Analytics and advertising** — we do not use them.",
            ],
          },
        ],
      },
      {
        id: "list",
        title: "Cookies we use",
        blocks: [
          {
            table: {
              head: ["Cookie", "Purpose", "Duration", "Type"],
              rows: [
                ["synapsys_session", "Keeps you securely signed in (HttpOnly)", "{shortSessionHours} hours, or {rememberDays} days with \"Stay logged in\"", "Essential"],
                ["synapsys_consent", "Stores your cookie choices", "{consentMonths} months", "Essential"],
                ["synapsys_site_lang", "Remembers the language you chose for the site", "12 months", "Essential"],
                ["synapsys_lang", "Opens your workspace in your account's language", "12 months", "Essential"],
                ["notion_oauth_state, evernote_oauth_state, google_docs_oauth_state", "Protect integration connections against forged requests", "10 to 15 minutes", "Essential"],
                ["synapsys_geo", "Remembers the country identified from your IP address to suggest a language without a new lookup", "{geoDays} days", "Functional"],
              ],
            },
          },
        ],
      },
      {
        id: "local-storage",
        title: "Local storage",
        blocks: [
          "In addition to cookies, the app stores some information on your device so that it works better:",
          {
            list: [
              "the Firebase authentication session, which keeps you signed in;",
              "a counter of sign-in attempts, used to show reCAPTCHA when needed;",
              "interface preferences, such as theme, sidebar, recent notebooks and the languages for transcriptions and flashcards;",
              "a copy of your notes and notebooks, so the app opens faster and keeps working offline.",
            ],
          },
          "This information stays only in your browser and is erased when you sign out, when the session expires or when you clear the site's data.",
        ],
      },
      {
        id: "third-party",
        title: "Third-party cookies",
        blocks: [
          "When reCAPTCHA appears — after unsuccessful sign-in attempts or during a password reset — Google may set its own cookies to tell people and bots apart. When you sign in with Google, the sign-in window also follows Google's policies. These cookies are controlled by Google, in accordance with the [Google Privacy Policy](https://policies.google.com/privacy).",
        ],
      },
      {
        id: "control",
        title: "Managing your choices",
        blocks: [
          "You can change your preferences at any time in the panel above or through the \"Cookie preferences\" link in the footer of the sign-in page. You can also block or delete cookies in your browser settings — but without the essential ones, you will not be able to sign in to your account.",
          "Your choices are saved for {consentMonths} months. After that, we will ask you again.",
        ],
      },
    ],
  },
};

export default en;
