import type { LegalBundle } from "../types";

const es: LegalBundle = {
  terms: {
    title: "Términos de Uso",
    lead: "Estas son las reglas para usar {brand}: qué puedes esperar de nosotros y qué esperamos de ti.",
    highlights: [
      { title: "El contenido es tuyo", text: "Conservas todos los derechos sobre tus notas, archivos y flashcards. Solo los usamos para prestar el servicio." },
      { title: "Los resultados de IA requieren revisión", text: "Las transcripciones y flashcards generadas por IA pueden contener errores. Contrástalas siempre con la fuente oficial." },
      { title: "Normas de uso", text: "No se permite contenido ilegal, material pirateado ni intentos de eludir la seguridad." },
      { title: "Ley brasileña", text: "Estos términos se rigen por la ley brasileña y no excluyen las protecciones del Código de Defensa del Consumidor." },
    ],
    sections: [
      {
        id: "acceptance",
        title: "Aceptación de estos términos",
        blocks: [
          "Al crear una cuenta o acceder a {brand}, aceptas estos Términos de Uso y la [Política de Privacidad](doc:privacy), que explica cómo tratamos tus datos. Si no estás de acuerdo, no utilices el servicio.",
          "Estos términos constituyen un contrato entre tú y {controller} (\"nosotros\"). \"Servicio\" es el sitio web, la aplicación web y todas las funciones que se ofrecen en ellos.",
        ],
      },
      {
        id: "service",
        title: "Qué es {brand}",
        blocks: [
          "{brand} es una plataforma de estudio y organización del conocimiento, pensada para quienes se preparan para oposiciones y concursos públicos, exámenes de ingreso a la universidad y la vida académica. Con ella puedes:",
          {
            list: [
              "crear notas, páginas, cuadernos y bases de datos en un editor de bloques;",
              "adjuntar imágenes, PDF, audios y vídeos, y grabar notas de voz;",
              "importar contenido de Notion, Evernote y Google Docs, y de archivos;",
              "generar flashcards y transcripciones con ayuda de inteligencia artificial;",
              "repasar lo que estudiaste con repetición espaciada.",
            ],
          },
          "El servicio evoluciona constantemente. Podemos añadir, cambiar o retirar funciones; cuando un cambio afecte de forma relevante a algo que usas, te avisaremos con antelación razonable.",
        ],
      },
      {
        id: "account",
        title: "Tu cuenta",
        blocks: [
          {
            list: [
              "**Edad mínima.** Debes tener al menos {minimumAge} años (o la edad mínima exigida en tu país, si es mayor). Si tienes menos de 18, necesitas la autorización y el acompañamiento de tus padres o tutores.",
              "**Datos correctos.** Proporciona información veraz y mantenla actualizada.",
              "**Acceso personal.** Tu cuenta es individual e intransferible. No compartas tu contraseña: eres responsable de lo que ocurra en tu cuenta.",
              "**Seguridad.** Si sospechas que hubo un acceso indebido, cambia la contraseña y avísanos en {contactEmail}.",
            ],
          },
          "Puedes entrar con correo electrónico y contraseña o con una cuenta de Google. En ese caso, también se aplican los términos del proveedor elegido.",
        ],
      },
      {
        id: "content",
        title: "Tu contenido sigue siendo tuyo",
        blocks: [
          "Todo lo que creas, subes o importas —notas, archivos, grabaciones, flashcards— te pertenece. No reclamamos ningún derecho de propiedad sobre ello.",
          "Para que el servicio funcione, nos concedes una licencia limitada, no exclusiva, gratuita y mundial para almacenar, copiar, procesar y mostrar tu contenido **únicamente para prestarte el servicio** —por ejemplo, guardar tus notas, hacer copias de seguridad o transcribir un audio cuando lo pidas—. La licencia termina cuando eliminas el contenido o la cuenta, respetando los plazos de la [Política de Privacidad](doc:privacy#retention).",
          "Declaras tener los derechos necesarios sobre lo que subes. No publicamos tu contenido, no lo vendemos ni lo usamos para entrenar modelos de inteligencia artificial.",
        ],
      },
      {
        id: "acceptable-use",
        title: "Uso aceptable",
        blocks: [
          "Para mantener la plataforma segura y justa para todos, te comprometes a no:",
          {
            list: [
              "almacenar o distribuir contenido ilegal, discriminatorio, que incite a la violencia o que explote a niños y adolescentes;",
              "compartir material protegido por derechos de autor sin autorización, como material didáctico, videoclases y cursos pirateados;",
              "intentar acceder a cuentas, datos o sistemas de terceros, ni eludir mecanismos de seguridad o límites de uso;",
              "usar bots, scrapers o automatizaciones para extraer datos o sobrecargar el servicio;",
              "copiar, descompilar o aplicar ingeniería inversa al software, salvo cuando la ley lo permita;",
              "usar el servicio para enviar spam o malware, o para cometer cualquier fraude.",
            ],
          },
          "Podemos retirar contenido o limitar el acceso de quien incumpla estas reglas, de forma proporcional a la infracción.",
        ],
      },
      {
        id: "ai",
        title: "Funciones de inteligencia artificial",
        blocks: [
          "Algunas funciones usan inteligencia artificial: transcripción de audio y vídeo, generación de flashcards, detección de tarjetas repetidas y traducción. Solo procesan el contenido que eliges, en el momento en que activas la función.",
          {
            note: "Los resultados generados por IA pueden contener errores, omisiones o imprecisiones. Revisa transcripciones y flashcards antes de estudiar con ellas y contrástalas siempre con la fuente oficial: el texto literal de la ley, la convocatoria o la bibliografía recomendada.",
          },
          "Lo que la IA genera a partir de tu contenido es tuyo, en las mismas condiciones que el resto de tu contenido. Podemos aplicar límites de uso para mantener estas funciones disponibles para todos.",
        ],
      },
      {
        id: "integrations",
        title: "Integraciones con otros servicios",
        blocks: [
          "Al conectar Notion, Evernote o Google Docs, nos autorizas a acceder a esos servicios en tu nombre, solo para listar e importar el contenido que selecciones. Puedes desconectar una integración en cualquier momento desde la página de integraciones.",
          "Estos servicios pertenecen a terceros y tienen sus propios términos y políticas. No estamos afiliados a ellos y sus marcas pertenecen a sus respectivos titulares. No respondemos por la falta de disponibilidad de esos servicios ni por los cambios que se produzcan en ellos.",
        ],
      },
      {
        id: "pricing",
        title: "Precio y planes",
        blocks: [
          "Actualmente {brand} se ofrece de forma gratuita. Si lanzamos planes de pago, el precio, la forma de pago y las condiciones de cancelación se presentarán con claridad antes de cualquier cobro: no se cobrará nada sin tu aceptación expresa.",
        ],
      },
      {
        id: "intellectual-property",
        title: "Propiedad intelectual de {brand}",
        blocks: [
          "El software, la marca, el diseño y demás elementos del servicio pertenecen a {brand} y están protegidos por la legislación de propiedad intelectual. Te concedemos una licencia personal, limitada, revocable e intransferible para usar el servicio conforme a estos términos.",
          "Si nos envías sugerencias, podremos usarlas para mejorar el servicio sin obligación de compensarte.",
        ],
      },
      {
        id: "availability",
        title: "Disponibilidad y copias de seguridad",
        blocks: [
          "Trabajamos para mantener el servicio disponible y tus datos seguros. Aun así, pueden producirse interrupciones por mantenimiento, actualizaciones o causas ajenas a nuestro control.",
          "Te recomendamos guardar copias de lo que sea esencial para ti, por ejemplo exportando notas en PDF.",
          "{brand} es una herramienta de apoyo al estudio y no garantiza que apruebes oposiciones, concursos públicos, exámenes de ingreso a la universidad ni evaluaciones.",
        ],
      },
      {
        id: "liability",
        title: "Limitación de responsabilidad",
        blocks: [
          "En la máxima medida permitida por la ley, no respondemos por daños indirectos, lucro cesante o pérdida de oportunidades derivados del uso o de la imposibilidad de uso del servicio, ni por contenido creado por usuarios o por servicios de terceros.",
          "Nada de lo dispuesto en estos términos excluye ni limita derechos que no pueden excluirse por contrato, incluidos los garantizados por el Código de Defensa del Consumidor de Brasil (Ley n.º 8.078/1990) y por las leyes de consumo obligatorias de tu país.",
        ],
      },
      {
        id: "termination",
        title: "Terminación",
        blocks: [
          "Puedes dejar de usar el servicio y eliminar tu cuenta cuando quieras, en Preferencias › Privacidad y datos o escribiendo a {privacyEmail}. Los plazos de eliminación figuran en la [Política de Privacidad](doc:privacy#retention).",
          "Podemos suspender o cerrar cuentas que incumplan estos términos de forma grave o reiterada, que pongan en riesgo a otras personas o cuando la ley lo exija. Salvo en casos urgentes o de ilegalidad, te avisaremos antes y te daremos la oportunidad de exportar tu contenido.",
        ],
      },
      {
        id: "changes",
        title: "Cambios en estos términos",
        blocks: [
          "Podemos actualizar estos términos para reflejar cambios en el servicio o en la legislación. Los cambios relevantes se comunicarán con al menos {noticeDays} días de antelación, por correo electrónico o mediante un aviso en el servicio. La fecha de la última actualización aparece siempre al principio de este documento.",
        ],
      },
      {
        id: "law",
        title: "Ley aplicable y contacto",
        blocks: [
          "Estos términos se rigen por las leyes de la República Federativa de Brasil, y se designan como competentes los tribunales de tu domicilio para resolver cualquier controversia. Si vives en otro país, siguen aplicándose las normas obligatorias de protección al consumidor de tu lugar de residencia.",
          "¿Dudas sobre estos términos? Escribe a {contactEmail}.",
        ],
      },
    ],
  },

  privacy: {
    title: "Política de Privacidad",
    lead: "Esta política explica qué datos tratamos, por qué, con quién los compartimos y cómo ejerces tus derechos, conforme a la Ley General de Protección de Datos de Brasil (LGPD) y, cuando corresponda, el RGPD europeo.",
    highlights: [
      { title: "Sin publicidad", text: "No vendemos datos, no mostramos anuncios ni usamos rastreadores de terceros." },
      { title: "IA bajo demanda", text: "El contenido solo va a un proveedor de IA cuando activas una función, y nunca se usa para entrenar modelos." },
      { title: "Seguridad", text: "Conexiones cifradas, datos aislados por cuenta y tokens de integración cifrados con AES-256." },
      { title: "Tus derechos", text: "Puedes acceder, corregir, exportar o eliminar tus datos. Respondemos en un máximo de {responseDays} días." },
    ],
    sections: [
      {
        id: "controller",
        title: "Quiénes somos",
        blocks: [
          "{controller} es el responsable del tratamiento de los datos personales en el servicio, conforme a la Ley General de Protección de Datos de Brasil (LGPD, Ley n.º 13.709/2018). Esta política se aplica al sitio web, a la aplicación web y a los canales de atención.",
          "Para cualquier asunto de privacidad, contacta con nuestro delegado de protección de datos (DPO) en {privacyEmail}.",
        ],
      },
      {
        id: "data",
        title: "Datos que tratamos",
        blocks: [
          {
            table: {
              head: ["Categoría", "Ejemplos", "Origen"],
              rows: [
                ["Registro", "Nombre, correo electrónico, teléfono y foto de perfil", "Tú o tu cuenta de Google"],
                ["Credenciales", "Contraseña, guardada solo de forma cifrada por el proveedor de autenticación", "Tú"],
                ["Contenido", "Notas, páginas, cuadernos, flashcards, adjuntos, audios y vídeos", "Tú y las importaciones que hagas"],
                ["Integraciones", "Tokens de acceso a Notion, Evernote y Google Docs", "El servicio conectado, con tu autorización"],
                ["Preferencias", "Idioma, tema, accesibilidad y diseño", "Tú"],
                ["Datos técnicos", "IP, país aproximado, navegador, dispositivo, fecha y hora de acceso", "Recogida automática"],
                ["Aceptación de documentos", "Versión y fecha en que aceptaste los Términos de Uso y esta política", "Tú"],
              ],
            },
          },
          "No pedimos datos sensibles. Si registras información de ese tipo en tus notas, se trata solo como parte de tu contenido, bajo tu control.",
        ],
      },
      {
        id: "purposes",
        title: "Para qué los usamos y con qué base legal",
        blocks: [
          {
            table: {
              head: ["Finalidad", "Base legal (LGPD)"],
              rows: [
                ["Crear y mantener tu cuenta, autenticar el acceso y sincronizar tu contenido", "Ejecución de contrato (art. 7, V)"],
                ["Ejecutar funciones que activas: importaciones, transcripciones, flashcards y traducciones", "Ejecución de contrato (art. 7, V)"],
                ["Proteger las cuentas contra fraudes y accesos indebidos, incluido el uso de reCAPTCHA", "Interés legítimo (art. 7, IX)"],
                ["Conservar registros de acceso durante el plazo exigido por el Marco Civil de Internet de Brasil", "Obligación legal (art. 7, II)"],
                ["Enviar comunicaciones esenciales, como restablecimiento de contraseña y avisos de cambios", "Ejecución de contrato (art. 7, V)"],
                ["Recordar tu región para elegir el idioma del sitio", "Consentimiento (art. 7, I), revocable en cualquier momento"],
                ["Registrar la versión de los documentos que aceptaste", "Ejercicio regular de derechos (art. 7, VI)"],
                ["Defender derechos en procesos judiciales o administrativos", "Ejercicio regular de derechos (art. 7, VI)"],
              ],
            },
          },
          "No usamos tus datos para publicidad, perfiles de marketing ni decisiones automatizadas que afecten a tus intereses.",
        ],
      },
      {
        id: "ai",
        title: "Inteligencia artificial",
        blocks: [
          "Cuando pides una transcripción, generas flashcards o traduces un fragmento, enviamos al proveedor solo el contenido necesario para esa tarea:",
          {
            list: [
              "**Transcripción de audio y vídeo:** Google Gemini API; como alternativa, un modelo de código abierto (Whisper) que se ejecuta en nuestros propios servidores.",
              "**Flashcards y detección de tarjetas repetidas:** Google Gemini API.",
              "**Traducción:** Google Cloud Translation; mientras no esté disponible, la propia Google Gemini API.",
              "**Transcripción en vivo de notas de voz:** el reconocimiento de voz de tu navegador, que puede enviar el audio al fabricante (Google, Microsoft o Apple). Permanece apagada hasta que la actives en la grabación.",
            ],
          },
          { note: "No usamos tu contenido para entrenar modelos de inteligencia artificial, y ninguna función de IA se ejecuta sin una acción tuya." },
        ],
      },
      {
        id: "sharing",
        title: "Con quién compartimos",
        blocks: [
          "No vendemos ni alquilamos datos personales. Compartimos solo lo necesario con encargados del tratamiento que nos ayudan a prestar el servicio, bajo obligaciones de confidencialidad y seguridad:",
          {
            table: {
              head: ["Socio", "Función"],
              rows: [
                ["Google Cloud y Firebase", "Alojamiento, base de datos, archivos, autenticación y correos del sistema"],
                ["Google reCAPTCHA", "Protección contra bots al iniciar sesión y restablecer la contraseña"],
                ["Google Gemini API y Google Cloud Translation", "Funciones de IA y traducción que activas"],
                ["country.is (geolocalización por IP)", "Identificar el país para sugerir el idioma, solo con tu consentimiento y sin guardar la dirección IP"],
                ["Notion, Evernote y Google Docs", "Solo cuando conectas la integración, para importar lo que elijas"],
                ["Reconocimiento de voz y voces del navegador (Google, Microsoft o Apple)", "Transcripción en vivo, si la activas, y lectura en voz alta cuando el navegador usa voces en línea"],
                ["jsDelivr, Unsplash y flagcdn", "Cargar bibliotecas, fuentes e imágenes públicas de la interfaz; solo reciben datos técnicos de conexión como IP y navegador"],
              ],
            },
          },
          "También podemos compartir datos cuando lo exija la ley, una orden judicial o una autoridad competente —siempre dentro de lo requerido— o en una reorganización societaria, manteniendo las garantías de esta política.",
        ],
      },
      {
        id: "google-data",
        title: "Datos recibidos de las API de Google",
        blocks: [
          "El uso y la transferencia a cualquier otra aplicación de información recibida de las API de Google se ajustan a la [Política de Datos de Usuario de los Servicios de API de Google](https://developers.google.com/terms/api-services-user-data-policy), incluidos los requisitos de Uso Limitado.",
          "Cuando conectas Google Docs, accedemos a tus documentos solo para listarlos e importar los que selecciones. Estos datos no se usan para publicidad, no se venden y no los leen personas, salvo con tu consentimiento, por motivos de seguridad o por obligación legal.",
        ],
      },
      {
        id: "transfer",
        title: "Transferencias internacionales",
        blocks: [
          "Nuestra infraestructura está en centros de datos de Google Cloud en Estados Unidos, y algunos socios pueden tratar datos en otros países. Estas transferencias cumplen el art. 33 de la LGPD y, cuando corresponda, el RGPD, con proveedores que ofrecen garantías contractuales y técnicas compatibles con esas leyes.",
        ],
      },
      {
        id: "retention",
        title: "Cuánto tiempo conservamos los datos",
        blocks: [
          {
            list: [
              "**Cuenta y contenido:** mientras tu cuenta esté activa.",
              "**Papelera:** los elementos eliminados permanecen {trashDays} días en la papelera y después se borran definitivamente.",
              "**Eliminación de la cuenta:** hecha en Preferencias › Privacidad y datos, los datos se borran al instante; pedida por correo, en un máximo de 30 días. Solo queda lo que la ley nos obliga a conservar, como los registros de acceso.",
              "**Registros de acceso:** {accessLogMonths} meses, según el art. 15 del Marco Civil de Internet de Brasil (Ley n.º 12.965/2014).",
              "**Tokens de integración:** hasta que desconectes la integración o elimines la cuenta.",
            ],
          },
        ],
      },
      {
        id: "security",
        title: "Cómo protegemos tus datos",
        blocks: [
          {
            list: [
              "conexiones siempre cifradas (HTTPS/TLS);",
              "reglas de acceso que aíslan los datos de cada cuenta en la base de datos y en el almacenamiento de archivos. Los archivos adjuntos se abren mediante enlaces privados e imposibles de adivinar; quien reciba uno de esos enlaces puede abrir el archivo, así que compártelos con cuidado;",
              "tokens de integración cifrados con AES-256-GCM;",
              "sesión en una cookie HttpOnly, inaccesible para scripts;",
              "límite de intentos de inicio de sesión y verificación reCAPTCHA contra ataques automatizados;",
              "acceso interno restringido al mínimo necesario.",
            ],
          },
          "Ningún sistema es inmune a incidentes. Si ocurre un incidente de seguridad que pueda generar un riesgo o daño relevante, te lo comunicaremos a ti y a la Autoridad Nacional de Protección de Datos de Brasil (ANPD), como exige el art. 48 de la LGPD.",
        ],
      },
      {
        id: "rights",
        title: "Tus derechos",
        blocks: [
          "La LGPD te garantiza, entre otros, los derechos a:",
          {
            list: [
              "confirmar si tratamos tus datos y acceder a ellos;",
              "corregir datos incompletos, inexactos o desactualizados;",
              "solicitar la anonimización, el bloqueo o la eliminación de datos innecesarios o tratados en incumplimiento de la ley;",
              "recibir tus datos en un formato portable;",
              "saber con quién compartimos tus datos;",
              "revocar el consentimiento y oponerte a tratamientos basados en otras bases legales;",
              "solicitar la eliminación de la cuenta y de los datos.",
            ],
          },
          "Puedes descargar una copia completa de tus datos y eliminar tu cuenta tú mismo en Preferencias › Privacidad y datos. Para ejercer cualquier derecho, también puedes escribir a {privacyEmail} desde el correo de tu cuenta. Respondemos en un máximo de {responseDays} días. También puedes presentar una reclamación ante la ANPD.",
          "Si te encuentras en el Espacio Económico Europeo o en el Reino Unido, también tienes los derechos previstos en el RGPD, incluido el de reclamar ante la autoridad de protección de datos de tu país.",
        ],
      },
      {
        id: "children",
        title: "Niños y adolescentes",
        blocks: [
          "{brand} no está dirigido a menores de {minimumAge} años y no recogemos sus datos de forma intencionada. Los adolescentes a partir de esa edad pueden usar el servicio con autorización y acompañamiento de sus padres o tutores, y sus datos se tratan siempre atendiendo a su interés superior, como exige el art. 14 de la LGPD. Si identificamos la cuenta de un niño, la eliminaremos.",
        ],
      },
      {
        id: "cookies",
        title: "Cookies",
        blocks: [
          "Usamos solo cookies esenciales y, con tu consentimiento, una cookie funcional. No usamos cookies de publicidad ni de análisis. Los detalles y las opciones de control están en la [Política de Cookies](doc:cookies).",
        ],
      },
      {
        id: "changes",
        title: "Cambios y contacto",
        blocks: [
          "Podemos actualizar esta política para reflejar cambios en el servicio o en la ley. Los cambios relevantes se comunicarán con antelación, por correo electrónico o en el propio servicio.",
          "Dudas, solicitudes o reclamaciones: {privacyEmail}.",
        ],
      },
    ],
  },

  cookies: {
    title: "Política de Cookies",
    lead: "Las cookies son pequeños archivos que el sitio guarda en tu navegador. Esta política enumera cada una y explica cómo controlar las que no son esenciales.",
    highlights: [
      { title: "Esenciales", text: "Mantienen tu sesión iniciada, recuerdan el idioma y protegen tu cuenta." },
      { title: "Sin rastreo", text: "No usamos cookies de publicidad, píxeles de redes sociales ni herramientas de análisis." },
      { title: "Opcionales solo con permiso", text: "Nuestra única cookie opcional depende de tu consentimiento, que puedes retirar en cualquier momento." },
    ],
    sections: [
      {
        id: "what",
        title: "Qué son las cookies",
        blocks: [
          "Las cookies son pequeños archivos de texto que un sitio guarda en tu navegador para recordar información entre visitas. Tecnologías similares, como el almacenamiento local (localStorage) e IndexedDB, guardan datos en tu propio dispositivo. En esta política llamamos a todo esto \"cookies\".",
        ],
      },
      {
        id: "categories",
        title: "Cómo usamos las cookies",
        blocks: [
          {
            list: [
              "**Esenciales**: necesarias para el inicio de sesión, la seguridad y el funcionamiento básico. No se pueden desactivar, porque el servicio no funcionaría sin ellas.",
              "**Funcionales**: agilizan la experiencia, como recordar tu región para elegir el idioma. Solo se usan con tu consentimiento.",
              "**Análisis y publicidad**: no las utilizamos.",
            ],
          },
        ],
      },
      {
        id: "list",
        title: "Cookies que utilizamos",
        blocks: [
          {
            table: {
              head: ["Cookie", "Finalidad", "Duración", "Tipo"],
              rows: [
                ["synapsys_session", "Mantiene tu sesión iniciada de forma segura (HttpOnly)", "{shortSessionHours} horas, o {rememberDays} días con \"Mantenerme conectado\"", "Esencial"],
                ["synapsys_consent", "Guarda tus elecciones sobre cookies", "{consentMonths} meses", "Esencial"],
                ["synapsys_site_lang", "Recuerda el idioma que elegiste para el sitio", "12 meses", "Esencial"],
                ["synapsys_lang", "Abre tu espacio de trabajo en el idioma de tu cuenta", "12 meses", "Esencial"],
                ["notion_oauth_state, evernote_oauth_state, google_docs_oauth_state", "Protegen la conexión de integraciones contra solicitudes falsificadas", "10 a 15 minutos", "Esencial"],
                ["synapsys_geo", "Recuerda el país identificado por la IP para sugerir el idioma sin una nueva consulta", "{geoDays} días", "Funcional"],
              ],
            },
          },
        ],
      },
      {
        id: "local-storage",
        title: "Almacenamiento local",
        blocks: [
          "Además de las cookies, la aplicación guarda cierta información en tu dispositivo para funcionar mejor:",
          {
            list: [
              "la sesión de autenticación de Firebase, que mantiene tu sesión activa;",
              "un contador de intentos de inicio de sesión, usado para mostrar el reCAPTCHA cuando es necesario;",
              "preferencias de interfaz, como tema, barra lateral, cuadernos recientes e idiomas de transcripción y flashcards;",
              "una copia de tus notas y cuadernos, para que la aplicación se abra más rápido y siga funcionando sin internet.",
            ],
          },
          "Esta información se queda solo en tu navegador y se borra cuando cierras sesión, cuando la sesión expira o cuando eliminas los datos del sitio.",
        ],
      },
      {
        id: "third-party",
        title: "Cookies de terceros",
        blocks: [
          "Cuando aparece el reCAPTCHA —tras intentos fallidos de inicio de sesión o al restablecer la contraseña—, Google puede instalar sus propias cookies para distinguir personas de bots. Al entrar con Google, la ventana de inicio de sesión también se rige por las políticas de Google. Estas cookies las controla Google, según la [Política de Privacidad de Google](https://policies.google.com/privacy).",
        ],
      },
      {
        id: "control",
        title: "Cómo gestionar tus elecciones",
        blocks: [
          "Puedes cambiar tus preferencias en cualquier momento en el panel de arriba o desde el enlace \"Preferencias de cookies\" en el pie de la página de inicio de sesión. También puedes bloquear o borrar cookies en la configuración del navegador, pero sin las esenciales no podrás acceder a tu cuenta.",
          "Tus elecciones se guardan durante {consentMonths} meses. Después, te lo volveremos a preguntar.",
        ],
      },
    ],
  },
};

export default es;
