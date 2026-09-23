import type { LegalBundle } from "../types";

const pt: LegalBundle = {
  terms: {
    title: "Termos de Uso",
    lead: "Estas são as regras para usar o {brand}: o que você pode esperar de nós e o que esperamos de você.",
    highlights: [
      { title: "O conteúdo é seu", text: "Você mantém todos os direitos sobre notas, arquivos e flashcards. Nós só os usamos para prestar o serviço." },
      { title: "Resultados de IA exigem revisão", text: "Transcrições e flashcards gerados por IA podem conter erros. Confira sempre com a fonte oficial." },
      { title: "Regras de uso", text: "Conteúdo ilegal, material pirateado e tentativas de burlar a segurança não são permitidos." },
      { title: "Lei brasileira", text: "Estes termos seguem a lei brasileira e não afastam as proteções do Código de Defesa do Consumidor." },
    ],
    sections: [
      {
        id: "acceptance",
        title: "Aceitação destes termos",
        blocks: [
          "Ao criar uma conta ou acessar o {brand}, você concorda com estes Termos de Uso e com a [Política de Privacidade](doc:privacy), que explica como tratamos seus dados. Se não concordar, não utilize o serviço.",
          "Estes termos formam um contrato entre você e {controller} (\"nós\"). \"Serviço\" é o site, o aplicativo web e todos os recursos oferecidos neles.",
        ],
      },
      {
        id: "service",
        title: "O que é o {brand}",
        blocks: [
          "O {brand} é uma plataforma de estudos e organização do conhecimento, pensada para quem se prepara para concursos públicos, vestibulares e para a vida acadêmica. Com ele você pode:",
          {
            list: [
              "criar notas, páginas, cadernos e bases de dados em um editor de blocos;",
              "anexar imagens, PDFs, áudios e vídeos e gravar notas de voz;",
              "importar conteúdo do Notion, do Evernote, do Google Docs e de arquivos;",
              "gerar flashcards e transcrições com apoio de inteligência artificial;",
              "revisar o que estudou com repetição espaçada.",
            ],
          },
          "O serviço está em evolução constante. Podemos adicionar, alterar ou descontinuar recursos; quando uma mudança afetar de forma relevante o que você usa, avisaremos com antecedência razoável.",
        ],
      },
      {
        id: "account",
        title: "Sua conta",
        blocks: [
          {
            list: [
              "**Idade mínima.** Você precisa ter pelo menos {minimumAge} anos (ou a idade mínima exigida no seu país, se for maior). Se tiver menos de 18, precisa da autorização e do acompanhamento dos seus pais ou responsáveis.",
              "**Dados corretos.** Informe dados verdadeiros e mantenha-os atualizados.",
              "**Acesso pessoal.** Sua conta é individual e intransferível. Não compartilhe sua senha: você responde pelo que acontece na sua conta.",
              "**Segurança.** Se suspeitar de acesso indevido, troque a senha e avise-nos pelo {contactEmail}.",
            ],
          },
          "Você pode entrar com e-mail e senha ou com uma conta Google. Nesse caso, também valem os termos do provedor escolhido.",
        ],
      },
      {
        id: "content",
        title: "Seu conteúdo continua sendo seu",
        blocks: [
          "Tudo o que você cria, envia ou importa — notas, arquivos, gravações, flashcards — pertence a você. Não reivindicamos nenhum direito de propriedade sobre esse conteúdo.",
          "Para o serviço funcionar, você nos concede uma licença limitada, não exclusiva, gratuita e mundial para armazenar, copiar, processar e exibir seu conteúdo **exclusivamente para prestar o serviço a você** — por exemplo, salvar suas notas, fazer backups ou transcrever um áudio quando você pedir. A licença termina quando você exclui o conteúdo ou a conta, respeitados os prazos da [Política de Privacidade](doc:privacy#retention).",
          "Você declara ter os direitos necessários sobre o que envia. Não publicamos seu conteúdo, não o vendemos e não o usamos para treinar modelos de inteligência artificial.",
        ],
      },
      {
        id: "acceptable-use",
        title: "Uso aceitável",
        blocks: [
          "Para manter a plataforma segura e justa para todos, você concorda em não:",
          {
            list: [
              "armazenar ou distribuir conteúdo ilegal, discriminatório, que incite violência ou que explore crianças e adolescentes;",
              "compartilhar material protegido por direitos autorais sem autorização, como apostilas, videoaulas e cursos pirateados;",
              "tentar acessar contas, dados ou sistemas de terceiros, ou burlar mecanismos de segurança e limites de uso;",
              "usar robôs, scrapers ou automações para extrair dados ou sobrecarregar o serviço;",
              "copiar, descompilar ou fazer engenharia reversa do software, salvo quando a lei permitir;",
              "usar o serviço para enviar spam, malware ou praticar qualquer fraude.",
            ],
          },
          "Podemos remover conteúdo ou limitar o acesso de quem violar estas regras, de forma proporcional à violação.",
        ],
      },
      {
        id: "ai",
        title: "Recursos de inteligência artificial",
        blocks: [
          "Alguns recursos usam inteligência artificial: transcrição de áudio e vídeo, geração de flashcards, identificação de cards repetidos e tradução. Eles processam apenas o conteúdo que você escolhe, no momento em que você aciona o recurso.",
          {
            note: "Resultados gerados por IA podem conter erros, omissões ou imprecisões. Revise transcrições e flashcards antes de estudar com eles e confira sempre com a fonte oficial — lei seca, edital ou bibliografia indicada.",
          },
          "O que a IA gera a partir do seu conteúdo é seu, nas mesmas condições do restante do seu conteúdo. Podemos aplicar limites de uso para manter os recursos disponíveis para todos.",
        ],
      },
      {
        id: "integrations",
        title: "Integrações com outros serviços",
        blocks: [
          "Ao conectar Notion, Evernote ou Google Docs, você nos autoriza a acessar esses serviços em seu nome, apenas para listar e importar o conteúdo que você selecionar. Você pode desconectar uma integração a qualquer momento na página de integrações; ao desconectar, apagamos os tokens e os dados da conta conectada e, quando o serviço permite, revogamos o acesso nele também.",
          "Esses serviços pertencem a terceiros e têm termos e políticas próprios. Não somos afiliados a eles, e suas marcas pertencem aos respectivos titulares. Não respondemos por indisponibilidades ou mudanças nesses serviços.",
        ],
      },
      {
        id: "pricing",
        title: "Preço e planos",
        blocks: [
          "Hoje o {brand} é oferecido sem custo. Se lançarmos planos pagos, preço, forma de pagamento e condições de cancelamento serão apresentados com clareza antes de qualquer cobrança — nada será cobrado sem a sua aceitação expressa.",
        ],
      },
      {
        id: "intellectual-property",
        title: "Propriedade intelectual do {brand}",
        blocks: [
          "O software, a marca, o design e os demais elementos do serviço pertencem ao {brand} e são protegidos pela legislação de propriedade intelectual. Concedemos a você uma licença pessoal, limitada, revogável e intransferível para usar o serviço de acordo com estes termos.",
          "Se você nos enviar sugestões, poderemos usá-las para melhorar o serviço, sem obrigação de compensação.",
        ],
      },
      {
        id: "availability",
        title: "Disponibilidade e backups",
        blocks: [
          "Trabalhamos para manter o serviço disponível e seus dados seguros. Ainda assim, podem ocorrer interrupções para manutenção, atualizações ou por motivos fora do nosso controle.",
          "Recomendamos manter cópias do que for essencial para você — por exemplo, exportando notas em PDF.",
          "O {brand} é uma ferramenta de apoio aos estudos e não garante aprovação em concursos, vestibulares ou avaliações.",
        ],
      },
      {
        id: "liability",
        title: "Limitação de responsabilidade",
        blocks: [
          "Na máxima extensão permitida pela lei, não respondemos por danos indiretos, lucros cessantes ou perda de oportunidades decorrentes do uso ou da impossibilidade de uso do serviço, nem por conteúdo criado por usuários ou por serviços de terceiros.",
          "Nada nestes termos exclui ou limita direitos que não podem ser afastados por contrato, incluindo os garantidos pelo Código de Defesa do Consumidor (Lei nº 8.078/1990) e pelas leis de consumo obrigatórias do seu país.",
        ],
      },
      {
        id: "termination",
        title: "Encerramento",
        blocks: [
          "Você pode deixar de usar o serviço e pedir a exclusão da conta quando quiser, pelo {privacyEmail}. Os prazos de exclusão estão na [Política de Privacidade](doc:privacy#retention).",
          "Podemos suspender ou encerrar contas que violem estes termos de forma grave ou reiterada, que coloquem outras pessoas em risco ou quando a lei exigir. Salvo em casos urgentes ou de ilegalidade, avisaremos antes e daremos a oportunidade de exportar seu conteúdo.",
        ],
      },
      {
        id: "changes",
        title: "Alterações nestes termos",
        blocks: [
          "Podemos atualizar estes termos para refletir mudanças no serviço ou na legislação. Alterações relevantes serão comunicadas com pelo menos {noticeDays} dias de antecedência, por e-mail ou por aviso no serviço. A data da última atualização fica sempre no topo deste documento.",
        ],
      },
      {
        id: "law",
        title: "Lei aplicável e contato",
        blocks: [
          "Estes termos são regidos pelas leis da República Federativa do Brasil, e fica eleito o foro do seu domicílio para resolver qualquer controvérsia. Se você mora em outro país, continuam valendo as normas obrigatórias de proteção ao consumidor do seu local de residência.",
          "Dúvidas sobre estes termos? Escreva para {contactEmail}.",
        ],
      },
    ],
  },

  privacy: {
    title: "Política de Privacidade",
    lead: "Esta política explica quais dados tratamos, por quê, com quem os compartilhamos e como você exerce seus direitos, conforme a Lei Geral de Proteção de Dados (LGPD) e, quando aplicável, o GDPR europeu.",
    highlights: [
      { title: "Sem publicidade", text: "Não vendemos dados, não exibimos anúncios e não usamos rastreadores de terceiros." },
      { title: "IA sob demanda", text: "O conteúdo só vai a um provedor de IA quando você aciona um recurso, e nós nunca o usamos para treinar modelos." },
      { title: "Segurança", text: "Conexões criptografadas, dados isolados por conta e tokens de integração cifrados com AES-256." },
      { title: "Seus direitos", text: "Você pode acessar, corrigir, exportar ou excluir seus dados. Respondemos em até {responseDays} dias." },
    ],
    sections: [
      {
        id: "controller",
        title: "Quem somos",
        blocks: [
          "{controller} é o controlador dos dados pessoais tratados no serviço, nos termos da LGPD (Lei nº 13.709/2018). Esta política vale para o site, o aplicativo web e os canais de atendimento.",
          "Para qualquer assunto de privacidade, use o nosso canal de atendimento aos titulares de dados: {privacyEmail}.",
        ],
      },
      {
        id: "data",
        title: "Dados que tratamos",
        blocks: [
          {
            table: {
              head: ["Categoria", "Exemplos", "Origem"],
              rows: [
                ["Cadastro", "Nome, e-mail, telefone e foto de perfil", "Você ou sua conta Google"],
                ["Credenciais", "Senha, guardada apenas de forma criptografada pelo provedor de autenticação", "Você"],
                ["Conteúdo", "Notas, páginas, cadernos, flashcards, anexos, áudios e vídeos", "Você e as importações que fizer"],
                ["Integrações", "Tokens de acesso ao Notion, Evernote e Google Docs e dados da conta conectada (nome, e-mail e foto)", "O serviço conectado, com sua autorização"],
                ["Preferências", "Idioma, tema, acessibilidade e layout", "Você"],
                ["Dados técnicos", "IP, país aproximado, navegador, dispositivo, data e hora de acesso", "Coleta automática"],
                ["Aceite dos documentos", "Versão e data em que você aceitou os Termos de Uso e esta política", "Você"],
              ],
            },
          },
          "Não pedimos dados sensíveis. Se você registrar informações desse tipo nas suas notas, elas são tratadas apenas como parte do seu conteúdo, sob o seu controle.",
        ],
      },
      {
        id: "purposes",
        title: "Para que usamos e com qual base legal",
        blocks: [
          {
            table: {
              head: ["Finalidade", "Base legal (LGPD)"],
              rows: [
                ["Criar e manter sua conta, autenticar o acesso e sincronizar seu conteúdo", "Execução de contrato (art. 7º, V)"],
                ["Executar recursos que você aciona: importações, transcrições, flashcards e traduções", "Execução de contrato (art. 7º, V)"],
                ["Proteger contas contra fraudes e acessos indevidos, inclusive com reCAPTCHA", "Legítimo interesse (art. 7º, IX)"],
                ["Guardar registros de acesso pelo prazo do Marco Civil da Internet", "Obrigação legal (art. 7º, II)"],
                ["Enviar comunicações essenciais, como redefinição de senha e avisos de mudança", "Execução de contrato (art. 7º, V)"],
                ["Identificar sua região pelo IP e lembrá-la para escolher o idioma do site", "Consentimento (art. 7º, I), revogável a qualquer momento"],
                ["Registrar a versão dos documentos que você aceitou", "Exercício regular de direitos (art. 7º, VI)"],
                ["Defender direitos em processos judiciais ou administrativos", "Exercício regular de direitos (art. 7º, VI)"],
              ],
            },
          },
          "Não usamos seus dados para publicidade, perfis de marketing ou decisões automatizadas que afetem seus interesses.",
        ],
      },
      {
        id: "ai",
        title: "Inteligência artificial",
        blocks: [
          "Quando você pede uma transcrição, gera flashcards ou usa a tradução (inclusive na leitura em voz alta), enviamos ao provedor apenas o conteúdo necessário para aquela tarefa, e ele o trata conforme os próprios termos de processamento de dados:",
          {
            list: [
              "**Transcrição de áudio e vídeo:** Google Gemini API; como alternativa, um modelo de código aberto (Whisper) executado nos servidores do serviço, no Google Cloud.",
              "**Flashcards e detecção de cards repetidos:** Google Gemini API.",
              "**Tradução:** Google Tradutor.",
              "**Transcrição ao vivo de notas de voz:** o reconhecimento de voz do seu navegador, que pode enviar o áudio ao fabricante (Google, Microsoft ou Apple). Fica desligada até você ativá-la na gravação.",
            ],
          },
          { note: "Não usamos seu conteúdo para treinar modelos de inteligência artificial, e nenhum recurso de IA é executado sem uma ação sua." },
        ],
      },
      {
        id: "sharing",
        title: "Com quem compartilhamos",
        blocks: [
          "Não vendemos nem alugamos dados pessoais. Compartilhamos apenas o necessário com operadores que nos ajudam a prestar o serviço, sob obrigações de confidencialidade e segurança:",
          {
            table: {
              head: ["Parceiro", "Função"],
              rows: [
                ["Google Cloud e Firebase", "Hospedagem, banco de dados, arquivos, autenticação e e-mails do sistema"],
                ["Google reCAPTCHA", "Proteção contra robôs no login e na redefinição de senha"],
                ["Google Gemini API e Google Tradutor", "Recursos de IA e tradução acionados por você"],
                ["country.is (geolocalização por IP)", "Identificar o país para sugerir o idioma, somente com o seu consentimento e sem guardar o endereço IP"],
                ["Notion, Evernote e Google Docs", "Somente quando você conecta a integração, para importar o que escolher"],
                ["Reconhecimento de voz e vozes do seu navegador (Google, Microsoft ou Apple)", "Transcrição ao vivo, se você ativar, e leitura em voz alta quando o navegador usa vozes online"],
                ["jsDelivr, Unsplash e flagcdn", "Carregar bibliotecas, fontes e imagens públicas da interface; recebem apenas dados técnicos da conexão, como IP e navegador"],
              ],
            },
          },
          "Também podemos compartilhar dados quando exigido por lei, ordem judicial ou autoridade competente — sempre no limite do que for requisitado — ou em uma reorganização societária, mantidas as garantias desta política.",
        ],
      },
      {
        id: "google-data",
        title: "Dados recebidos das APIs do Google",
        blocks: [
          "O uso e a transferência, para qualquer outro aplicativo, de informações recebidas das APIs do Google seguem a [Política de Dados do Usuário dos Serviços de API do Google](https://developers.google.com/terms/api-services-user-data-policy), incluindo os requisitos de Uso Limitado.",
          "Quando você conecta o Google Docs, acessamos seus documentos apenas para listá-los e importar os que você selecionar. Esses dados não são usados para publicidade, não são vendidos e não são lidos por pessoas, exceto com o seu consentimento, por segurança ou por obrigação legal.",
        ],
      },
      {
        id: "transfer",
        title: "Transferência internacional",
        blocks: [
          "Seus dados ficam em data centers do Google Cloud no Brasil e nos Estados Unidos, e alguns parceiros podem tratar dados em outros países. Essas transferências seguem o art. 33 da LGPD e, quando aplicável, o GDPR, com base em garantias contratuais e técnicas dos fornecedores ou no seu consentimento, conforme o caso.",
        ],
      },
      {
        id: "retention",
        title: "Por quanto tempo guardamos",
        blocks: [
          {
            list: [
              "**Conta e conteúdo:** enquanto sua conta estiver ativa.",
              "**Lixeira:** itens excluídos ficam {trashDays} dias na lixeira e depois são apagados definitivamente.",
              "**Exclusão da conta:** os dados são apagados em até 30 dias após o pedido, exceto o que a lei nos obrigar a manter, como os registros de acesso.",
              "**Registros de acesso:** {accessLogMonths} meses, conforme o art. 15 do Marco Civil da Internet (Lei nº 12.965/2014).",
              "**Integrações:** tokens e dados da conta conectada ficam guardados até você desconectar a integração ou excluir a conta.",
            ],
          },
        ],
      },
      {
        id: "security",
        title: "Como protegemos seus dados",
        blocks: [
          {
            list: [
              "conexões sempre criptografadas (HTTPS/TLS);",
              "regras de acesso que isolam os dados de cada conta no banco de dados e no armazenamento de arquivos;",
              "tokens de integração cifrados com AES-256-GCM;",
              "cookie de sessão do servidor com o atributo HttpOnly, inacessível a scripts;",
              "bloqueio temporário de tentativas repetidas de login pelo provedor de autenticação e verificação reCAPTCHA após tentativas sem sucesso;",
              "acesso interno restrito ao mínimo necessário.",
            ],
          },
          "Nenhum sistema é imune a incidentes. Se ocorrer um incidente de segurança que possa gerar risco ou dano relevante, comunicaremos você e a Autoridade Nacional de Proteção de Dados (ANPD), como determina o art. 48 da LGPD.",
        ],
      },
      {
        id: "rights",
        title: "Seus direitos",
        blocks: [
          "A LGPD garante a você, entre outros, os direitos de:",
          {
            list: [
              "confirmar se tratamos seus dados e acessá-los;",
              "corrigir dados incompletos, inexatos ou desatualizados;",
              "pedir anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desconformidade;",
              "receber seus dados em formato portável;",
              "saber com quem compartilhamos seus dados;",
              "revogar o consentimento e se opor a tratamentos baseados em outras hipóteses legais;",
              "pedir a exclusão da conta e dos dados.",
            ],
          },
          "Alguns você exerce direto no app: corrigir nome e foto nas preferências, exportar notas em PDF e rever o consentimento de cookies no menu da sua conta. Para qualquer um deles, inclusive receber a cópia completa dos seus dados ou excluir a conta, escreva para {privacyEmail} a partir do e-mail da sua conta. Respondemos em até {responseDays} dias. Você também pode reclamar à ANPD.",
          "Se você está no Espaço Econômico Europeu ou no Reino Unido, também tem os direitos previstos no GDPR, incluindo reclamar à autoridade de proteção de dados do seu país.",
        ],
      },
      {
        id: "children",
        title: "Crianças e adolescentes",
        blocks: [
          "O {brand} não é destinado a menores de {minimumAge} anos, e não coletamos dados deles intencionalmente; no cadastro, pedimos que você confirme ter essa idade. Adolescentes a partir dessa idade podem usar o serviço com autorização e acompanhamento dos pais ou responsáveis, e seus dados são tratados sempre no seu melhor interesse, como determina o art. 14 da LGPD. Se identificarmos a conta de uma criança, ela será excluída.",
        ],
      },
      {
        id: "cookies",
        title: "Cookies",
        blocks: [
          "Usamos apenas cookies essenciais e, com o seu consentimento, um cookie funcional. Não usamos cookies de publicidade nem de análise. Detalhes e opções de controle estão na [Política de Cookies](doc:cookies).",
        ],
      },
      {
        id: "changes",
        title: "Alterações e contato",
        blocks: [
          "Podemos atualizar esta política para refletir mudanças no serviço ou na lei. Alterações relevantes serão comunicadas com antecedência, por e-mail ou no próprio serviço.",
          "Dúvidas, pedidos ou reclamações: {privacyEmail}.",
        ],
      },
    ],
  },

  cookies: {
    title: "Política de Cookies",
    lead: "Cookies são pequenos arquivos que o site guarda no seu navegador. Esta política lista cada um deles e explica como controlar os que não são essenciais.",
    highlights: [
      { title: "Essenciais", text: "Mantêm você conectado, lembram o idioma e protegem a conta." },
      { title: "Sem rastreamento", text: "Não usamos cookies de publicidade, pixels de redes sociais nem ferramentas de análise." },
      { title: "Opcional só com permissão", text: "O único cookie opcional depende do seu consentimento, que pode ser retirado a qualquer momento." },
    ],
    sections: [
      {
        id: "what",
        title: "O que são cookies",
        blocks: [
          "Cookies são pequenos arquivos de texto que um site salva no seu navegador para lembrar informações entre uma visita e outra. Tecnologias parecidas, como o armazenamento local (localStorage e sessionStorage) e o IndexedDB, guardam dados no seu próprio dispositivo. Nesta política, chamamos tudo isso de \"cookies\".",
        ],
      },
      {
        id: "categories",
        title: "Como usamos cookies",
        blocks: [
          {
            list: [
              "**Essenciais** — necessários para login, segurança e funcionamento básico. Não podem ser desativados, porque o serviço não funcionaria sem eles.",
              "**Funcionais** — identificam sua região pelo IP e a lembram para escolher o idioma. Só são usados com o seu consentimento.",
              "**Análise e publicidade** — não utilizamos.",
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
              head: ["Cookie", "Finalidade", "Duração", "Tipo"],
              rows: [
                ["synapsys_session", "Mantém você conectado com segurança (HttpOnly)", "{shortSessionHours} horas, ou {rememberDays} dias com \"Manter conectado\"", "Essencial"],
                ["synapsys_consent", "Guarda suas escolhas sobre cookies", "{consentMonths} meses", "Essencial"],
                ["synapsys_site_lang", "Lembra o idioma que você escolheu para o site", "12 meses", "Essencial"],
                ["synapsys_lang", "Abre seu espaço de trabalho no idioma da sua conta", "12 meses", "Essencial"],
                ["notion_oauth_state, evernote_oauth_state, google_docs_oauth_state", "Protegem a conexão de integrações contra solicitações forjadas", "10 a 15 minutos", "Essencial"],
                ["synapsys_geo", "Lembra o país identificado pelo IP para sugerir o idioma sem nova consulta", "{geoDays} dias", "Funcional"],
              ],
            },
          },
        ],
      },
      {
        id: "local-storage",
        title: "Armazenamento local",
        blocks: [
          "Além dos cookies, o aplicativo guarda algumas informações no seu dispositivo para funcionar melhor:",
          {
            list: [
              "a sessão de autenticação do Firebase, que mantém seu login ativo;",
              "um contador de tentativas de login, usado para exibir o reCAPTCHA quando necessário;",
              "preferências de interface, como tema, barra lateral, cadernos recentes e idiomas de transcrição e flashcards;",
              "uma cópia temporária de dados para o aplicativo abrir mais rápido.",
            ],
          },
          "Essas informações ficam só no seu navegador e são apagadas quando você limpa os dados do site.",
        ],
      },
      {
        id: "third-party",
        title: "Cookies de terceiros",
        blocks: [
          "Quando o reCAPTCHA aparece — após tentativas de login sem sucesso ou na redefinição de senha — o Google pode definir cookies próprios para diferenciar pessoas de robôs. Ao entrar com Google ou conectar o Google Docs, as janelas de login do Google também seguem as políticas do Google. Esses cookies são controlados pelo Google, conforme a [Política de Privacidade do Google](https://policies.google.com/privacy).",
        ],
      },
      {
        id: "control",
        title: "Como gerenciar suas escolhas",
        blocks: [
          "Você pode mudar suas preferências a qualquer momento no painel acima ou pelo item \"Preferências de cookies\" no rodapé da página de login ou no menu da sua conta. Também é possível bloquear ou apagar cookies nas configurações do navegador — mas, sem os essenciais, não será possível entrar na sua conta.",
          "Suas escolhas ficam salvas por {consentMonths} meses. Depois disso, perguntaremos de novo.",
        ],
      },
    ],
  },
};

export default pt;
