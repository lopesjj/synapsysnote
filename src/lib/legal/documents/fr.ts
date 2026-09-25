import type { LegalBundle } from "../types";

const fr: LegalBundle = {
  terms: {
    title: "Conditions d'utilisation",
    lead: "Voici les règles d'utilisation de {brand} : ce que vous pouvez attendre de nous et ce que nous attendons de vous.",
    highlights: [
      { title: "Le contenu vous appartient", text: "Vous conservez tous les droits sur vos notes, fichiers et flashcards. Nous les utilisons uniquement pour fournir le service." },
      { title: "Les résultats de l'IA doivent être vérifiés", text: "Les transcriptions et flashcards générées par l'IA peuvent contenir des erreurs. Vérifiez-les toujours auprès de la source officielle." },
      { title: "Règles d'utilisation", text: "Les contenus illégaux, le matériel piraté et les tentatives de contournement de la sécurité ne sont pas autorisés." },
      { title: "Droit brésilien", text: "Ces conditions sont régies par le droit brésilien et n'écartent pas les protections du Code de défense du consommateur." },
    ],
    sections: [
      {
        id: "acceptance",
        title: "Acceptation de ces conditions",
        blocks: [
          "En créant un compte ou en accédant à {brand}, vous acceptez les présentes Conditions d'utilisation et la [Politique de confidentialité](doc:privacy), qui explique comment nous traitons vos données. Si vous ne les acceptez pas, n'utilisez pas le service.",
          "Ces conditions constituent un contrat entre vous et {controller} (« nous »). Le « Service » désigne le site web, l'application web et toutes les fonctionnalités qui y sont proposées.",
        ],
      },
      {
        id: "service",
        title: "Ce qu'est {brand}",
        blocks: [
          "{brand} est une plateforme d'étude et d'organisation des connaissances, conçue pour celles et ceux qui préparent des concours de la fonction publique ou des examens d'entrée à l'université, ainsi que pour la vie universitaire. Avec elle, vous pouvez :",
          {
            list: [
              "créer des notes, des pages, des carnets et des bases de données dans un éditeur de blocs ;",
              "joindre des images, des PDF, des fichiers audio et des vidéos, et enregistrer des notes vocales ;",
              "importer du contenu depuis Notion, Evernote, Google Docs et des fichiers ;",
              "générer des flashcards et des transcriptions avec l'aide de l'intelligence artificielle ;",
              "réviser ce que vous avez étudié avec la répétition espacée.",
            ],
          },
          "Le service évolue constamment. Nous pouvons ajouter, modifier ou cesser de proposer des fonctionnalités ; lorsqu'un changement affectera de manière significative ce que vous utilisez, nous vous en informerons avec un préavis raisonnable.",
        ],
      },
      {
        id: "account",
        title: "Votre compte",
        blocks: [
          {
            list: [
              "**Âge minimum.** Vous devez avoir au moins {minimumAge} ans (ou l'âge minimum requis dans votre pays, s'il est plus élevé). Si vous avez moins de 18 ans, vous avez besoin de l'autorisation et de l'accompagnement de vos parents ou représentants légaux.",
              "**Informations exactes.** Fournissez des informations véridiques et maintenez-les à jour.",
              "**Accès personnel.** Votre compte est individuel et incessible. Ne partagez pas votre mot de passe : vous êtes responsable de ce qui se passe sur votre compte.",
              "**Sécurité.** Si vous soupçonnez un accès non autorisé, changez votre mot de passe et prévenez-nous à l'adresse {contactEmail}.",
            ],
          },
          "Vous pouvez vous connecter avec une adresse e-mail et un mot de passe ou avec un compte Google. Dans ce cas, les conditions du fournisseur choisi s'appliquent également.",
        ],
      },
      {
        id: "content",
        title: "Votre contenu reste le vôtre",
        blocks: [
          "Tout ce que vous créez, envoyez ou importez — notes, fichiers, enregistrements, flashcards — vous appartient. Nous ne revendiquons aucun droit de propriété sur ce contenu.",
          "Pour que le service fonctionne, vous nous accordez une licence limitée, non exclusive, gratuite et mondiale pour stocker, copier, traiter et afficher votre contenu **uniquement pour vous fournir le service** — par exemple, enregistrer vos notes, effectuer des sauvegardes ou transcrire un fichier audio lorsque vous le demandez. Cette licence prend fin lorsque vous supprimez le contenu ou votre compte, sous réserve des délais prévus dans la [Politique de confidentialité](doc:privacy#retention).",
          "Vous déclarez détenir les droits nécessaires sur ce que vous envoyez. Nous ne publions pas votre contenu, ne le vendons pas et ne l'utilisons pas pour entraîner des modèles d'intelligence artificielle.",
        ],
      },
      {
        id: "acceptable-use",
        title: "Utilisation acceptable",
        blocks: [
          "Pour maintenir la plateforme sûre et équitable pour tous, vous vous engagez à ne pas :",
          {
            list: [
              "stocker ou distribuer des contenus illégaux, discriminatoires, incitant à la violence ou exploitant des enfants ou des adolescents ;",
              "partager sans autorisation du matériel protégé par le droit d'auteur, comme des supports de cours, des cours vidéo et des formations piratés ;",
              "tenter d'accéder aux comptes, données ou systèmes de tiers, ou contourner les mécanismes de sécurité et les limites d'utilisation ;",
              "utiliser des robots, des scrapers ou des automatisations pour extraire des données ou surcharger le service ;",
              "copier, décompiler ou faire de l'ingénierie inverse du logiciel, sauf dans la mesure où la loi le permet ;",
              "utiliser le service pour envoyer du spam ou des logiciels malveillants, ou pour commettre toute forme de fraude.",
            ],
          },
          "Nous pouvons supprimer du contenu ou restreindre l'accès de toute personne qui enfreint ces règles, de manière proportionnée à la violation.",
        ],
      },
      {
        id: "ai",
        title: "Fonctionnalités d'intelligence artificielle",
        blocks: [
          "Certaines fonctionnalités utilisent l'intelligence artificielle : transcription audio et vidéo, génération de flashcards, détection de flashcards en double et traduction. Elles ne traitent que le contenu que vous choisissez, au moment où vous activez la fonctionnalité.",
          {
            note: "Les résultats générés par l'IA peuvent contenir des erreurs, des omissions ou des inexactitudes. Relisez les transcriptions et les flashcards avant de les utiliser pour étudier, et vérifiez toujours auprès de la source officielle — texte de loi, avis de concours ou bibliographie recommandée.",
          },
          "Ce que l'IA génère à partir de votre contenu vous appartient, aux mêmes conditions que le reste de votre contenu. Nous pouvons appliquer des limites d'utilisation pour que ces fonctionnalités restent disponibles pour tous.",
        ],
      },
      {
        id: "integrations",
        title: "Intégrations avec d'autres services",
        blocks: [
          "Lorsque vous connectez Notion, Evernote ou Google Docs, vous nous autorisez à accéder à ces services en votre nom, uniquement pour lister et importer le contenu que vous sélectionnez. Vous pouvez déconnecter une intégration à tout moment sur la page des intégrations.",
          "Ces services appartiennent à des tiers et ont leurs propres conditions et politiques. Nous ne leur sommes pas affiliés, et leurs marques appartiennent à leurs titulaires respectifs. Nous ne sommes pas responsables des indisponibilités ou des changements de ces services.",
        ],
      },
      {
        id: "pricing",
        title: "Tarifs et abonnements",
        blocks: [
          "{brand} est actuellement proposé gratuitement. Si nous lançons des abonnements payants, le prix, le mode de paiement et les conditions d'annulation seront clairement présentés avant tout débit — rien ne sera facturé sans votre accord exprès.",
        ],
      },
      {
        id: "intellectual-property",
        title: "Propriété intellectuelle de {brand}",
        blocks: [
          "Le logiciel, la marque, le design et les autres éléments du service appartiennent à {brand} et sont protégés par le droit de la propriété intellectuelle. Nous vous accordons une licence personnelle, limitée, révocable et non transférable pour utiliser le service conformément à ces conditions.",
          "Si vous nous envoyez des suggestions, nous pourrons les utiliser pour améliorer le service, sans obligation de contrepartie.",
        ],
      },
      {
        id: "availability",
        title: "Disponibilité et sauvegardes",
        blocks: [
          "Nous nous efforçons de maintenir le service disponible et vos données en sécurité. Malgré cela, des interruptions peuvent survenir pour maintenance, mises à jour ou pour des raisons indépendantes de notre volonté.",
          "Nous vous recommandons de conserver des copies de tout ce qui vous est essentiel — par exemple en exportant des notes en PDF.",
          "{brand} est un outil d'aide à l'étude et ne garantit pas la réussite aux concours, aux examens d'entrée à l'université ou aux évaluations.",
        ],
      },
      {
        id: "liability",
        title: "Limitation de responsabilité",
        blocks: [
          "Dans toute la mesure permise par la loi, nous ne sommes pas responsables des dommages indirects, des pertes de bénéfices ou des pertes d'opportunités découlant de l'utilisation ou de l'impossibilité d'utiliser le service, ni du contenu créé par les utilisateurs ou des services tiers.",
          "Rien dans ces conditions n'exclut ni ne limite les droits qui ne peuvent être écartés par contrat, y compris ceux garantis par le Code de défense du consommateur brésilien (loi n° 8.078/1990) et par les lois impératives de protection des consommateurs de votre pays.",
        ],
      },
      {
        id: "termination",
        title: "Résiliation",
        blocks: [
          "Vous pouvez cesser d'utiliser le service et supprimer votre compte à tout moment, dans Préférences › Confidentialité et données ou en écrivant à {privacyEmail}. Les délais de suppression sont décrits dans la [Politique de confidentialité](doc:privacy#retention).",
          "Nous pouvons suspendre ou fermer des comptes qui violent gravement ou à répétition ces conditions, mettent d'autres personnes en danger, ou lorsque la loi l'exige. Sauf en cas d'urgence ou de situation illégale, nous vous en informerons d'abord et vous donnerons la possibilité d'exporter votre contenu.",
        ],
      },
      {
        id: "changes",
        title: "Modifications de ces conditions",
        blocks: [
          "Nous pouvons mettre à jour ces conditions pour refléter des changements dans le service ou la loi. Les modifications substantielles seront annoncées au moins {noticeDays} jours à l'avance, par e-mail ou via une notification dans le service. La date de la dernière mise à jour est toujours affichée en haut de ce document.",
        ],
      },
      {
        id: "law",
        title: "Droit applicable et contact",
        blocks: [
          "Ces conditions sont régies par les lois de la République fédérative du Brésil, et les tribunaux de votre domicile sont désignés comme compétents pour trancher tout litige. Si vous vivez dans un autre pays, les règles impératives de protection des consommateurs de votre lieu de résidence continuent de s'appliquer.",
          "Des questions sur ces conditions ? Écrivez à {contactEmail}.",
        ],
      },
    ],
  },

  privacy: {
    title: "Politique de confidentialité",
    lead: "Cette politique explique quelles données nous traitons, pourquoi, avec qui nous les partageons et comment vous pouvez exercer vos droits, conformément à la Loi générale brésilienne sur la protection des données (LGPD) et, le cas échéant, au RGPD européen.",
    highlights: [
      { title: "Pas de publicité", text: "Nous ne vendons pas de données, ne diffusons pas de publicités et n'utilisons pas de traceurs tiers." },
      { title: "IA sur demande", text: "Le contenu n'est envoyé à un fournisseur d'IA que lorsque vous activez une fonctionnalité, et n'est jamais utilisé pour entraîner des modèles." },
      { title: "Sécurité", text: "Connexions chiffrées, données isolées par compte et jetons d'intégration chiffrés avec AES-256." },
      { title: "Vos droits", text: "Vous pouvez accéder à vos données, les corriger, les exporter ou les supprimer. Nous répondons dans un délai maximal de {responseDays} jours." },
    ],
    sections: [
      {
        id: "controller",
        title: "Qui nous sommes",
        blocks: [
          "{controller} est le responsable du traitement des données personnelles traitées dans le cadre du service, au sens de la LGPD (loi n° 13.709/2018). Cette politique s'applique au site web, à l'application web et à nos canaux d'assistance.",
          "Pour toute question relative à la confidentialité, contactez notre délégué à la protection des données (DPO) à l'adresse {privacyEmail}.",
        ],
      },
      {
        id: "data",
        title: "Données que nous traitons",
        blocks: [
          {
            table: {
              head: ["Catégorie", "Exemples", "Source"],
              rows: [
                ["Inscription", "Nom, e-mail, numéro de téléphone et photo de profil", "Vous ou votre compte Google"],
                ["Identifiants", "Mot de passe, conservé uniquement sous forme chiffrée par le fournisseur d'authentification", "Vous"],
                ["Contenu", "Notes, pages, carnets, flashcards, pièces jointes, fichiers audio et vidéos", "Vous et les importations que vous effectuez"],
                ["Intégrations", "Jetons d'accès à Notion, Evernote et Google Docs", "Le service connecté, avec votre autorisation"],
                ["Préférences", "Langue, thème, accessibilité et disposition", "Vous"],
                ["Données techniques", "Adresse IP, pays approximatif, navigateur, appareil, date et heure d'accès", "Collecte automatique"],
                ["Acceptation des documents", "Version et date auxquelles vous avez accepté les Conditions d'utilisation et cette politique", "Vous"],
              ],
            },
          },
          "Nous ne demandons pas de données sensibles. Si vous enregistrez ce type d'informations dans vos notes, elles sont traitées uniquement comme faisant partie de votre contenu, sous votre contrôle.",
        ],
      },
      {
        id: "purposes",
        title: "Comment nous les utilisons et sur quelle base légale",
        blocks: [
          {
            table: {
              head: ["Finalité", "Base légale (LGPD)"],
              rows: [
                ["Créer et maintenir votre compte, authentifier l'accès et synchroniser votre contenu", "Exécution d'un contrat (art. 7, V)"],
                ["Exécuter les fonctionnalités que vous activez : importations, transcriptions, flashcards et traductions", "Exécution d'un contrat (art. 7, V)"],
                ["Protéger les comptes contre la fraude et les accès non autorisés, notamment avec reCAPTCHA", "Intérêt légitime (art. 7, IX)"],
                ["Conserver les journaux d'accès pendant la durée prévue par le Marco Civil da Internet (cadre civil de l'Internet au Brésil)", "Obligation légale (art. 7, II)"],
                ["Envoyer des communications essentielles, comme la réinitialisation du mot de passe et les avis de modification", "Exécution d'un contrat (art. 7, V)"],
                ["Mémoriser votre région pour choisir la langue du site", "Consentement (art. 7, I), que vous pouvez retirer à tout moment"],
                ["Enregistrer la version des documents que vous avez acceptés", "Exercice régulier des droits (art. 7, VI)"],
                ["Défendre des droits dans des procédures judiciaires ou administratives", "Exercice régulier des droits (art. 7, VI)"],
              ],
            },
          },
          "Nous n'utilisons pas vos données à des fins publicitaires, de profilage marketing ou de décisions automatisées qui affectent vos intérêts.",
        ],
      },
      {
        id: "ai",
        title: "Intelligence artificielle",
        blocks: [
          "Lorsque vous demandez une transcription, générez des flashcards ou traduisez un passage, nous envoyons au fournisseur uniquement le contenu nécessaire à cette tâche :",
          {
            list: [
              "**Transcription audio et vidéo :** Google Gemini API ; à titre d'alternative, un modèle open source (Whisper) exécuté sur nos propres serveurs.",
              "**Flashcards et détection de flashcards en double :** Google Gemini API.",
              "**Traduction :** Google Gemini API ; tant qu'elle est indisponible, Google Cloud Translation.",
              "**Transcription en direct des notes vocales :** la reconnaissance vocale de votre navigateur, qui peut envoyer l'audio au fournisseur (Google, Microsoft ou Apple). Reste désactivée tant que vous ne l'activez pas lors de l'enregistrement.",
            ],
          },
          { note: "Nous n'utilisons pas votre contenu pour entraîner des modèles d'intelligence artificielle, et aucune fonctionnalité d'IA n'est exécutée sans une action de votre part." },
        ],
      },
      {
        id: "sharing",
        title: "Avec qui nous partageons des données",
        blocks: [
          "Nous ne vendons ni ne louons de données personnelles. Nous partageons uniquement ce qui est nécessaire avec des sous-traitants qui nous aident à fournir le service, soumis à des obligations de confidentialité et de sécurité :",
          {
            table: {
              head: ["Partenaire", "Rôle"],
              rows: [
                ["Google Cloud et Firebase", "Hébergement, base de données, stockage de fichiers, authentification et e-mails système"],
                ["Google reCAPTCHA", "Protection contre les robots lors de la connexion et de la réinitialisation du mot de passe"],
                ["Google Gemini API et Google Cloud Translation", "Fonctionnalités d'IA et de traduction que vous activez"],
                ["country.is (géolocalisation par IP)", "Identifier le pays pour suggérer la langue, uniquement avec votre consentement et sans conserver l'adresse IP"],
                ["Notion, Evernote et Google Docs", "Uniquement lorsque vous connectez l'intégration, pour importer ce que vous choisissez"],
                ["Reconnaissance vocale et voix du navigateur (Google, Microsoft ou Apple)", "Transcription en direct, si vous l'activez, et lecture à voix haute lorsque le navigateur utilise des voix en ligne"],
                ["jsDelivr, Unsplash et flagcdn", "Charger des bibliothèques, polices et images publiques d'interface ; ils ne reçoivent que des données techniques de connexion comme l'IP et le navigateur"],
              ],
            },
          },
          "Nous pouvons également partager des données lorsque la loi, une décision de justice ou une autorité compétente l'exige — toujours dans la limite de ce qui est demandé — ou dans le cadre d'une réorganisation de la société, les garanties de la présente politique étant maintenues.",
        ],
      },
      {
        id: "google-data",
        title: "Données reçues des API Google",
        blocks: [
          "L'utilisation par {brand} et le transfert à toute autre application des informations reçues des API Google respectent la [Politique d'utilisation des données utilisateur des services API Google](https://developers.google.com/terms/api-services-user-data-policy), y compris les exigences relatives à l'utilisation limitée.",
          "Lorsque vous connectez Google Docs, nous accédons à vos documents uniquement pour les lister et importer ceux que vous sélectionnez. Ces données ne sont pas utilisées à des fins publicitaires, ne sont pas vendues et ne sont pas lues par des personnes, sauf avec votre consentement, pour des raisons de sécurité ou en vertu d'une obligation légale.",
        ],
      },
      {
        id: "transfer",
        title: "Transferts internationaux",
        blocks: [
          "Notre infrastructure est hébergée dans des centres de données Google Cloud aux États-Unis, et certains partenaires peuvent traiter des données dans d'autres pays. Ces transferts respectent l'article 33 de la LGPD et, le cas échéant, le RGPD, et font appel à des fournisseurs qui offrent des garanties contractuelles et techniques compatibles avec ces lois.",
        ],
      },
      {
        id: "retention",
        title: "Durée de conservation des données",
        blocks: [
          {
            list: [
              "**Compte et contenu :** tant que votre compte est actif.",
              "**Corbeille :** les éléments supprimés restent dans la corbeille pendant {trashDays} jours, puis sont définitivement effacés.",
              "**Suppression du compte :** faite dans Préférences › Confidentialité et données, les données sont effacées immédiatement ; demandée par e-mail, sous 30 jours maximum. Seul reste ce que la loi nous oblige à conserver, comme les journaux d'accès.",
              "**Journaux d'accès :** {accessLogMonths} mois, conformément à l'article 15 du Marco Civil da Internet (loi n° 12.965/2014).",
              "**Jetons d'intégration :** jusqu'à ce que vous déconnectiez l'intégration ou supprimiez votre compte.",
            ],
          },
        ],
      },
      {
        id: "security",
        title: "Comment nous protégeons vos données",
        blocks: [
          {
            list: [
              "les connexions sont toujours chiffrées (HTTPS/TLS) ;",
              "les règles d'accès isolent les données de chaque compte dans la base de données et le stockage de fichiers. Les fichiers joints s'ouvrent via des liens privés impossibles à deviner ; toute personne recevant l'un de ces liens peut ouvrir le fichier, partagez-les donc avec prudence ;",
              "les jetons d'intégration sont chiffrés avec AES-256-GCM ;",
              "la session est conservée dans un cookie HttpOnly, inaccessible aux scripts ;",
              "le nombre de tentatives de connexion est limité et une vérification reCAPTCHA protège contre les attaques automatisées ;",
              "l'accès interne est restreint au minimum nécessaire.",
            ],
          },
          "Aucun système n'est à l'abri des incidents. Si un incident de sécurité susceptible d'entraîner un risque ou un dommage important se produit, nous vous en informerons, ainsi que l'Autorité nationale de protection des données (ANPD) du Brésil, comme l'exige l'article 48 de la LGPD.",
        ],
      },
      {
        id: "rights",
        title: "Vos droits",
        blocks: [
          "La LGPD vous garantit, entre autres, le droit de :",
          {
            list: [
              "confirmer si nous traitons vos données et y accéder ;",
              "corriger des données incomplètes, inexactes ou obsolètes ;",
              "demander l'anonymisation, le blocage ou la suppression de données inutiles ou traitées de manière non conforme ;",
              "recevoir vos données dans un format portable ;",
              "savoir avec qui nous partageons vos données ;",
              "retirer votre consentement et vous opposer au traitement fondé sur d'autres bases légales ;",
              "demander la suppression de votre compte et de vos données.",
            ],
          },
          "Vous pouvez télécharger une copie complète de vos données et supprimer votre compte vous-même dans Préférences › Confidentialité et données. Pour exercer tout droit, vous pouvez aussi écrire à {privacyEmail} depuis l'adresse e-mail de votre compte. Nous répondons dans un délai maximal de {responseDays} jours. Vous pouvez également déposer une plainte auprès de l'ANPD.",
          "Si vous vous trouvez dans l'Espace économique européen ou au Royaume-Uni, vous disposez également des droits prévus par le RGPD, y compris le droit de déposer une plainte auprès de l'autorité de protection des données de votre pays.",
        ],
      },
      {
        id: "children",
        title: "Enfants et adolescents",
        blocks: [
          "{brand} n'est pas destiné aux personnes de moins de {minimumAge} ans, et nous ne collectons pas sciemment leurs données. Les adolescents ayant atteint cet âge peuvent utiliser le service avec l'autorisation et l'accompagnement de leurs parents ou représentants légaux, et leurs données sont toujours traitées dans leur intérêt supérieur, comme l'exige l'article 14 de la LGPD. Si nous identifions le compte d'un enfant, il sera supprimé.",
        ],
      },
      {
        id: "cookies",
        title: "Cookies",
        blocks: [
          "Nous n'utilisons que des cookies essentiels et, avec votre consentement, un cookie fonctionnel. Nous n'utilisons ni cookies publicitaires ni cookies d'analyse. Les détails et les options de contrôle figurent dans la [Politique relative aux cookies](doc:cookies).",
        ],
      },
      {
        id: "changes",
        title: "Modifications et contact",
        blocks: [
          "Nous pouvons mettre à jour cette politique pour refléter des changements dans le service ou la loi. Les modifications substantielles seront annoncées à l'avance, par e-mail ou dans le service lui-même.",
          "Questions, demandes ou réclamations : {privacyEmail}.",
        ],
      },
    ],
  },

  cookies: {
    title: "Politique relative aux cookies",
    lead: "Les cookies sont de petits fichiers que le site enregistre dans votre navigateur. Cette politique présente chacun d'eux et explique comment contrôler ceux qui ne sont pas essentiels.",
    highlights: [
      { title: "Essentiels", text: "Vous maintiennent connecté, mémorisent votre langue et protègent votre compte." },
      { title: "Pas de pistage", text: "Nous n'utilisons ni cookies publicitaires, ni pixels de réseaux sociaux, ni outils d'analyse." },
      { title: "Optionnel uniquement avec votre accord", text: "Le seul cookie optionnel dépend de votre consentement, que vous pouvez retirer à tout moment." },
    ],
    sections: [
      {
        id: "what",
        title: "Ce que sont les cookies",
        blocks: [
          "Les cookies sont de petits fichiers texte qu'un site web enregistre dans votre navigateur pour mémoriser des informations entre les visites. Des technologies similaires, comme le stockage local (localStorage) et IndexedDB, conservent des données sur votre propre appareil. Dans cette politique, nous les appelons tous « cookies ».",
        ],
      },
      {
        id: "categories",
        title: "Comment nous utilisons les cookies",
        blocks: [
          {
            list: [
              "**Essentiels** — requis pour la connexion, la sécurité et le fonctionnement de base. Ils ne peuvent pas être désactivés, car le service ne fonctionnerait pas sans eux.",
              "**Fonctionnels** — rendent l'expérience plus rapide, par exemple en mémorisant votre région pour choisir la langue. Ils ne sont utilisés qu'avec votre consentement.",
              "**Analyse et publicité** — nous n'en utilisons pas.",
            ],
          },
        ],
      },
      {
        id: "list",
        title: "Cookies que nous utilisons",
        blocks: [
          {
            table: {
              head: ["Cookie", "Finalité", "Durée", "Type"],
              rows: [
                ["synapsys_session", "Vous maintient connecté en toute sécurité (HttpOnly)", "{shortSessionHours} heures, ou {rememberDays} jours avec « Rester connecté »", "Essentiel"],
                ["synapsys_consent", "Stocke vos choix en matière de cookies", "{consentMonths} mois", "Essentiel"],
                ["synapsys_site_lang", "Mémorise la langue que vous avez choisie pour le site", "12 mois", "Essentiel"],
                ["synapsys_lang", "Ouvre votre espace de travail dans la langue de votre compte", "12 mois", "Essentiel"],
                ["notion_oauth_state, evernote_oauth_state, google_docs_oauth_state", "Protègent la connexion des intégrations contre les requêtes falsifiées", "10 à 15 minutes", "Essentiel"],
                ["synapsys_geo", "Mémorise le pays identifié à partir de votre adresse IP pour suggérer la langue sans nouvelle consultation", "{geoDays} jours", "Fonctionnel"],
              ],
            },
          },
        ],
      },
      {
        id: "local-storage",
        title: "Stockage local",
        blocks: [
          "En plus des cookies, l'application conserve certaines informations sur votre appareil pour mieux fonctionner :",
          {
            list: [
              "la session d'authentification Firebase, qui vous maintient connecté ;",
              "un compteur de tentatives de connexion, utilisé pour afficher le reCAPTCHA si nécessaire ;",
              "les préférences d'interface, comme le thème, la barre latérale, les carnets récents et les langues de transcription et des flashcards ;",
              "une copie de vos notes et carnets, pour que l'application s'ouvre plus vite et continue de fonctionner hors ligne.",
            ],
          },
          "Ces informations restent uniquement dans votre navigateur et sont supprimées lorsque vous vous déconnectez, lorsque la session expire ou lorsque vous effacez les données du site.",
        ],
      },
      {
        id: "third-party",
        title: "Cookies tiers",
        blocks: [
          "Lorsque reCAPTCHA apparaît — après des tentatives de connexion infructueuses ou lors d'une réinitialisation de mot de passe — Google peut déposer ses propres cookies pour distinguer les personnes des robots. Lorsque vous vous connectez avec Google, la fenêtre de connexion suit également les politiques de Google. Ces cookies sont contrôlés par Google, conformément à la [Politique de confidentialité de Google](https://policies.google.com/privacy).",
        ],
      },
      {
        id: "control",
        title: "Comment gérer vos choix",
        blocks: [
          "Vous pouvez modifier vos préférences à tout moment dans le panneau ci-dessus ou via le lien « Préférences de cookies » dans le pied de page de la page de connexion. Vous pouvez également bloquer ou supprimer des cookies dans les paramètres de votre navigateur — mais sans les cookies essentiels, vous ne pourrez pas vous connecter à votre compte.",
          "Vos choix sont enregistrés pendant {consentMonths} mois. Passé ce délai, nous vous reposerons la question.",
        ],
      },
    ],
  },
};

export default fr;
