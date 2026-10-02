import type { DayKey } from "@/types/study";

type Localized = { en: string } & Partial<Record<string, string>>;

const QUOTES: { text: Localized }[] = [
  {
    text: {
      en: "A journey of a thousand miles begins with a single step.",
      pt: "Uma jornada de mil milhas começa com um único passo.",
      es: "Un viaje de mil millas comienza con un solo paso.",
      fr: "Un voyage de mille lieues commence toujours par un premier pas.",
      it: "Un viaggio di mille miglia comincia con un solo passo.",
      de: "Auch eine Reise von tausend Meilen beginnt mit einem einzigen Schritt.",
      ru: "Путь в тысячу ли начинается с первого шага.",
      ja: "千里の道も一歩から。",
      zh: "千里之行，始于足下。",
      ar: "رحلة الألف ميل تبدأ بخطوة واحدة.",
    },
  },
  {
    text: {
      en: "It does not matter how slowly you go as long as you do not stop.",
      pt: "Não importa o quão devagar você vá, desde que não pare.",
      es: "No importa lo despacio que vayas, siempre y cuando no te detengas.",
      fr: "Peu importe la lenteur de ta marche, pourvu que tu ne t'arrêtes pas.",
      it: "Non importa quanto vai piano, purché tu non ti fermi.",
      de: "Es ist egal, wie langsam du gehst, solange du nicht stehen bleibst.",
      ru: "Неважно, как медленно ты идёшь, главное — не останавливаться.",
      ja: "どんなにゆっくりでも、止まらなければそれでいい。",
      zh: "不怕慢，只怕停。",
      ar: "لا يهمّ مدى بطء سيرك ما دمت لا تتوقف.",
    },
  },
  {
    text: {
      en: "Education is the most powerful weapon which you can use to change the world.",
      pt: "A educação é a arma mais poderosa que você pode usar para mudar o mundo.",
      es: "La educación es el arma más poderosa que puedes usar para cambiar el mundo.",
      fr: "L'éducation est l'arme la plus puissante pour changer le monde.",
      it: "L'istruzione è l'arma più potente che puoi usare per cambiare il mondo.",
      de: "Bildung ist die mächtigste Waffe, um die Welt zu verändern.",
      ru: "Образование — самое мощное оружие, которым можно изменить мир.",
      ja: "教育は、世界を変えるために使える最も強力な武器である。",
      zh: "教育是改变世界最强大的武器。",
      ar: "التعليم هو أقوى سلاح يمكنك استخدامه لتغيير العالم.",
    },
  },
  {
    text: {
      en: "An investment in knowledge pays the best interest.",
      pt: "Investir em conhecimento rende sempre os melhores juros.",
      es: "Invertir en conocimiento produce siempre los mejores intereses.",
      fr: "Un investissement dans la connaissance rapporte toujours les meilleurs intérêts.",
      it: "Investire nella conoscenza rende sempre i migliori interessi.",
      de: "Eine Investition in Wissen bringt immer noch die besten Zinsen.",
      ru: "Вложения в знания приносят наибольший доход.",
      ja: "知識への投資は、常に最高の利息を生む。",
      zh: "投资知识，收益最佳。",
      ar: "الاستثمار في المعرفة يدرّ دائمًا أفضل العوائد.",
    },
  },
  {
    text: {
      en: "Live as if you were to die tomorrow. Learn as if you were to live forever.",
      pt: "Viva como se fosse morrer amanhã. Aprenda como se fosse viver para sempre.",
      es: "Vive como si fueras a morir mañana. Aprende como si fueras a vivir siempre.",
      fr: "Vis comme si tu devais mourir demain. Apprends comme si tu devais vivre toujours.",
      it: "Vivi come se dovessi morire domani. Impara come se dovessi vivere per sempre.",
      de: "Lebe, als würdest du morgen sterben. Lerne, als würdest du ewig leben.",
      ru: "Живи так, будто завтра умрёшь. Учись так, будто будешь жить вечно.",
      ja: "明日死ぬかのように生きよ。永遠に生きるかのように学べ。",
      zh: "像明天就要死去那样生活，像永远不死那样学习。",
      ar: "عِش كأنك ستموت غدًا، وتعلّم كأنك ستعيش للأبد.",
    },
  },
  {
    text: {
      en: "Success is the sum of small efforts, repeated day in and day out.",
      pt: "O sucesso é a soma de pequenos esforços repetidos dia após dia.",
      es: "El éxito es la suma de pequeños esfuerzos repetidos día tras día.",
      fr: "Le succès est la somme de petits efforts répétés jour après jour.",
      it: "Il successo è la somma di piccoli sforzi ripetuti giorno dopo giorno.",
      de: "Erfolg ist die Summe kleiner Anstrengungen, Tag für Tag wiederholt.",
      ru: "Успех — это сумма небольших усилий, повторяемых изо дня в день.",
      ja: "成功とは、日々繰り返される小さな努力の積み重ねである。",
      zh: "成功是日复一日小小努力的总和。",
      ar: "النجاح هو مجموع جهود صغيرة تتكرر يومًا بعد يوم.",
    },
  },
  {
    text: {
      en: "While we teach, we learn.",
      pt: "Enquanto ensinamos, aprendemos.",
      es: "Mientras enseñamos, aprendemos.",
      fr: "En enseignant, on apprend.",
      it: "Mentre insegniamo, impariamo.",
      de: "Indem wir lehren, lernen wir.",
      ru: "Обучая, мы учимся сами.",
      ja: "教えることで、私たちは学ぶ。",
      zh: "教学相长。",
      ar: "بينما نُعلّم، نتعلّم.",
    },
  },
  {
    text: {
      en: "It is not because things are difficult that we do not dare; it is because we do not dare that they are difficult.",
      pt: "Não é porque as coisas são difíceis que não ousamos; é porque não ousamos que elas são difíceis.",
      es: "No es porque las cosas sean difíciles que no nos atrevemos; es porque no nos atrevemos que son difíciles.",
      fr: "Ce n'est pas parce que les choses sont difficiles que nous n'osons pas, c'est parce que nous n'osons pas qu'elles sont difficiles.",
      it: "Non è perché le cose sono difficili che non osiamo; è perché non osiamo che sono difficili.",
      de: "Nicht weil es schwer ist, wagen wir es nicht, sondern weil wir es nicht wagen, ist es schwer.",
      ru: "Не потому, что трудно, мы не решаемся, а потому трудно, что не решаемся.",
      ja: "困難だから挑まないのではない。挑まないから困難なのだ。",
      zh: "不是因为事情难我们才不敢做，而是因为不敢做事情才变难。",
      ar: "ليس لأن الأمور صعبة لا نجرؤ، بل لأننا لا نجرؤ تصبح صعبة.",
    },
  },
  {
    text: {
      en: "Learning never exhausts the mind.",
      pt: "Aprender é a única coisa de que a mente nunca se cansa.",
      es: "Aprender es lo único de lo que la mente nunca se cansa.",
      fr: "Apprendre est la seule chose dont l'esprit ne se lasse jamais.",
      it: "Imparare è l'unica cosa di cui la mente non si stanca mai.",
      de: "Lernen ist das Einzige, dessen der Geist nie müde wird.",
      ru: "Учёба никогда не утомляет разум.",
      ja: "学ぶことは、決して心を疲れさせない。",
      zh: "学习永远不会让头脑疲倦。",
      ar: "التعلّم لا يُرهق العقل أبدًا.",
    },
  },
  {
    text: {
      en: "The happiness of your life depends upon the quality of your thoughts.",
      pt: "A felicidade da sua vida depende da qualidade dos seus pensamentos.",
      es: "La felicidad de tu vida depende de la calidad de tus pensamientos.",
      fr: "Le bonheur de ta vie dépend de la qualité de tes pensées.",
      it: "La felicità della tua vita dipende dalla qualità dei tuoi pensieri.",
      de: "Das Glück deines Lebens hängt von der Beschaffenheit deiner Gedanken ab.",
      ru: "Счастье твоей жизни зависит от качества твоих мыслей.",
      ja: "人生の幸福は、思考の質によって決まる。",
      zh: "生活的幸福取决于你思想的品质。",
      ar: "سعادة حياتك تعتمد على جودة أفكارك.",
    },
  },
  {
    text: {
      en: "No man is free who is not master of himself.",
      pt: "Nenhum homem é livre se não for senhor de si mesmo.",
      es: "Ningún hombre es libre si no es dueño de sí mismo.",
      fr: "Nul n'est libre s'il n'est maître de lui-même.",
      it: "Nessun uomo è libero se non è padrone di sé stesso.",
      de: "Niemand ist frei, der nicht Herr über sich selbst ist.",
      ru: "Не свободен тот, кто не властен над собой.",
      ja: "自分を律せない者は、自由ではない。",
      zh: "不能主宰自己的人，就不是自由的人。",
      ar: "لا أحد حرّ ما لم يكن سيّد نفسه.",
    },
  },
  {
    text: {
      en: "We are what we repeatedly do. Excellence, then, is not an act, but a habit.",
      pt: "Somos o que repetidamente fazemos. A excelência, portanto, não é um ato, mas um hábito.",
      es: "Somos lo que hacemos repetidamente. La excelencia, entonces, no es un acto, sino un hábito.",
      fr: "Nous sommes ce que nous faisons de manière répétée. L'excellence n'est donc pas un acte, mais une habitude.",
      it: "Siamo ciò che facciamo ripetutamente. L'eccellenza, quindi, non è un atto, ma un'abitudine.",
      de: "Wir sind, was wir wiederholt tun. Vortrefflichkeit ist daher keine Handlung, sondern eine Gewohnheit.",
      ru: "Мы — то, что мы постоянно делаем. Совершенство — не поступок, а привычка.",
      ja: "人は繰り返し行うことの産物である。卓越とは行為ではなく、習慣なのだ。",
      zh: "我们由反复做的事情塑造。卓越不是一种行为，而是一种习惯。",
      ar: "نحن ما نفعله باستمرار. فالتميّز ليس فعلًا، بل عادة.",
    },
  },
  {
    text: {
      en: "Anyone who stops learning is old, whether at twenty or eighty.",
      pt: "Quem para de aprender fica velho, seja aos vinte ou aos oitenta.",
      es: "Quien deja de aprender es viejo, ya sea a los veinte o a los ochenta.",
      fr: "Celui qui cesse d'apprendre est vieux, qu'il ait vingt ou quatre-vingts ans.",
      it: "Chi smette di imparare è vecchio, che abbia venti o ottant'anni.",
      de: "Wer aufhört zu lernen, ist alt, ob mit zwanzig oder mit achtzig.",
      ru: "Тот, кто перестаёт учиться, стар — будь ему двадцать или восемьдесят.",
      ja: "学ぶことをやめた者は、二十歳でも八十歳でも老いている。",
      zh: "停止学习的人就老了，不论二十岁还是八十岁。",
      ar: "من يتوقف عن التعلّم يشيخ، سواء كان في العشرين أو الثمانين.",
    },
  },
  {
    text: {
      en: "Education does not change the world. Education changes people. People change the world.",
      pt: "Educação não transforma o mundo. Educação muda as pessoas. Pessoas transformam o mundo.",
      es: "La educación no cambia el mundo. Cambia a las personas que van a cambiar el mundo.",
      fr: "L'éducation ne change pas le monde. Elle change les personnes qui vont changer le monde.",
      it: "L'educazione non cambia il mondo. Cambia le persone che cambieranno il mondo.",
      de: "Bildung verändert nicht die Welt. Bildung verändert Menschen, und Menschen verändern die Welt.",
      ru: "Образование не меняет мир. Оно меняет людей, а люди меняют мир.",
      ja: "教育は世界を変えない。教育は人を変え、人が世界を変える。",
      zh: "教育不能改变世界，教育改变人，人改变世界。",
      ar: "التعليم لا يغيّر العالم، بل يغيّر الناس، والناس يغيّرون العالم.",
    },
  },
  {
    text: {
      en: "Do what you can, with what you have, where you are.",
      pt: "Faça o que puder, com o que tiver, onde estiver.",
      es: "Haz lo que puedas, con lo que tengas, donde estés.",
      fr: "Fais ce que tu peux, avec ce que tu as, là où tu es.",
      it: "Fai quello che puoi, con quello che hai, dove sei.",
      de: "Tu, was du kannst, mit dem, was du hast, dort, wo du bist.",
      ru: "Делай что можешь, с тем, что имеешь, там, где ты есть.",
      ja: "今いる場所で、今あるもので、できることをしよう。",
      zh: "在你所在之处，用你所拥有的，做你能做的。",
      ar: "افعل ما تستطيع، بما لديك، حيث أنت.",
    },
  },
  {
    text: {
      en: "The roots of education are bitter, but the fruit is sweet.",
      pt: "As raízes da educação são amargas, mas os frutos são doces.",
      es: "Las raíces de la educación son amargas, pero sus frutos son dulces.",
      fr: "Les racines de l'éducation sont amères, mais ses fruits sont doux.",
      it: "Le radici dell'educazione sono amare, ma i frutti sono dolci.",
      de: "Die Wurzeln der Bildung sind bitter, aber die Früchte sind süß.",
      ru: "Корни учения горьки, но плоды его сладки.",
      ja: "教育の根は苦いが、その実は甘い。",
      zh: "教育的根是苦的，但果实是甜的。",
      ar: "جذور التعليم مُرّة، لكن ثماره حلوة.",
    },
  },
  {
    text: {
      en: "The beginning is the most important part of the work.",
      pt: "O começo é a parte mais importante do trabalho.",
      es: "El comienzo es la parte más importante del trabajo.",
      fr: "Le commencement est la partie la plus importante de l'ouvrage.",
      it: "L'inizio è la parte più importante del lavoro.",
      de: "Der Anfang ist der wichtigste Teil der Arbeit.",
      ru: "Начало — самая важная часть работы.",
      ja: "始まりこそが、仕事の最も重要な部分である。",
      zh: "开始是工作中最重要的部分。",
      ar: "البداية هي أهم جزء في العمل.",
    },
  },
  {
    text: {
      en: "The beautiful thing about learning is that nobody can take it away from you.",
      pt: "O mais bonito de aprender é que ninguém pode tirar isso de você.",
      es: "Lo hermoso de aprender es que nadie puede quitártelo.",
      fr: "Ce qui est beau dans l'apprentissage, c'est que personne ne peut te l'enlever.",
      it: "La cosa bella dell'imparare è che nessuno può portartelo via.",
      de: "Das Schöne am Lernen ist, dass es dir niemand wegnehmen kann.",
      ru: "Прекрасно в учёбе то, что никто не сможет отнять её у тебя.",
      ja: "学ぶことの素晴らしさは、誰にもそれを奪えないことだ。",
      zh: "学习的美妙之处在于，没有人能把它从你身上夺走。",
      ar: "أجمل ما في التعلّم أن أحدًا لا يستطيع انتزاعه منك.",
    },
  },
  {
    text: {
      en: "Education is not preparation for life; education is life itself.",
      pt: "Educação não é preparação para a vida; educação é a própria vida.",
      es: "La educación no es preparación para la vida; la educación es la vida misma.",
      fr: "L'éducation n'est pas une préparation à la vie, c'est la vie elle-même.",
      it: "L'educazione non è preparazione alla vita; è la vita stessa.",
      de: "Bildung ist keine Vorbereitung auf das Leben; Bildung ist das Leben selbst.",
      ru: "Образование — не подготовка к жизни, образование — это сама жизнь.",
      ja: "教育は人生の準備ではない。教育こそが人生そのものだ。",
      zh: "教育不是为生活做准备，教育就是生活本身。",
      ar: "التعليم ليس استعدادًا للحياة، بل هو الحياة نفسها.",
    },
  },
  {
    text: {
      en: "Education is the passport to the future, for tomorrow belongs to those who prepare for it today.",
      pt: "A educação é o passaporte para o futuro, pois o amanhã pertence a quem se prepara hoje.",
      es: "La educación es el pasaporte hacia el futuro, porque el mañana pertenece a quienes se preparan hoy.",
      fr: "L'éducation est le passeport pour l'avenir, car demain appartient à ceux qui s'y préparent aujourd'hui.",
      it: "L'istruzione è il passaporto per il futuro, perché il domani appartiene a chi si prepara oggi.",
      de: "Bildung ist der Pass für die Zukunft, denn das Morgen gehört denen, die sich heute darauf vorbereiten.",
      ru: "Образование — паспорт в будущее, ведь завтра принадлежит тем, кто готовится к нему сегодня.",
      ja: "教育は未来へのパスポートだ。明日は、今日準備する者のものだから。",
      zh: "教育是通往未来的护照，因为明天属于今天做好准备的人。",
      ar: "التعليم جواز السفر إلى المستقبل، فالغد لمن يستعدّ له اليوم.",
    },
  },
];

function localize(value: Localized, language: string): string {
  return value[language] ?? value.en;
}

const MARKS: Record<string, [string, string]> = {
  fr: ["«\u202f", "\u202f»"],
  es: ["«", "»"],
  ru: ["«", "»"],
  ar: ["«", "»"],
  de: ["„", "“"],
  ja: ["「", "」"],
  zh: ["“", "”"],
};

export function dailyMotto(language: string, day: DayKey): { text: string; open: string; close: string } {
  const [year, month, date] = day.split("-").map(Number);
  const index = Math.floor(Date.UTC(year, (month || 1) - 1, date || 1) / 86_400_000);
  const quote = QUOTES[((index % QUOTES.length) + QUOTES.length) % QUOTES.length];
  const [open, close] = MARKS[language] ?? ["“", "”"];
  return { text: localize(quote.text, language), open, close };
}
