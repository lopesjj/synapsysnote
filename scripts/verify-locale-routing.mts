import assert from "node:assert/strict";

process.env.GEO_LOOKUP = "off";
process.env.NEXT_PUBLIC_LOGIN_ORIGIN = "https://synapsysnt.com.br";
process.env.NEXT_PUBLIC_APP_ORIGIN = "https://app.synapsysnt.com.br";

const {
  countryFromAcceptLanguage,
  ensureLocalized,
  languageForCountry,
  languageFromAcceptLanguage,
  localizePath,
  splitLocale,
} = await import("../src/lib/i18n/locale");
const { NextRequest } = await import("next/server");
const { proxy } = await import("../src/proxy");

console.log("Verificando idioma por país e prefixo de rota...");

assert.equal(languageForCountry("BR"), "pt");
assert.equal(languageForCountry("pt"), "pt");
assert.equal(languageForCountry("MX"), "es");
assert.equal(languageForCountry("AT"), "de");
assert.equal(languageForCountry("JP"), "ja");
assert.equal(languageForCountry("TW"), "zh");
assert.equal(languageForCountry("EG"), "ar");
assert.equal(languageForCountry("US"), "en");
assert.equal(languageForCountry("KR"), "en", "País sem idioma próprio cai no inglês");
assert.equal(languageForCountry("XX"), null);
assert.equal(languageForCountry(""), null);

assert.equal(countryFromAcceptLanguage("en-US,en;q=0.9,pt-BR;q=0.8"), "US");
assert.equal(countryFromAcceptLanguage("pt-BR,pt;q=0.9"), "BR");
assert.equal(countryFromAcceptLanguage("zh-Hant-TW"), "TW");
assert.equal(countryFromAcceptLanguage("fr"), null);
assert.equal(languageFromAcceptLanguage("ko,fr;q=0.8"), "fr");

assert.deepEqual(splitLocale("/en/home/p/abc"), { locale: "en", path: "/home/p/abc" });
assert.deepEqual(splitLocale("/pt"), { locale: "pt", path: "/" });
assert.deepEqual(splitLocale("/home"), { locale: null, path: "/home" });
assert.deepEqual(splitLocale("/english"), { locale: null, path: "/english" });

assert.equal(localizePath("/home/p/1?x=1#h", "ja"), "/ja/home/p/1?x=1#h");
assert.equal(localizePath("/", "fr"), "/fr");
assert.equal(localizePath("/en/home", "de"), "/de/home", "Troca a sigla existente");
assert.equal(ensureLocalized("/en/home", "de"), "/en/home", "Mantém a sigla explícita");
assert.equal(ensureLocalized("/home", "de"), "/de/home");
assert.equal(ensureLocalized("https://x.com/a", "de"), "https://x.com/a");

function request(url: string, options: { cookies?: Record<string, string>; headers?: Record<string, string> } = {}) {
  const headers = new Headers(options.headers);
  headers.set("host", new URL(url).host);
  if (options.cookies) {
    headers.set(
      "cookie",
      Object.entries(options.cookies)
        .map(([key, value]) => `${key}=${value}`)
        .join("; ")
    );
  }
  return new NextRequest(url, { headers });
}

async function locationOf(url: string, options?: Parameters<typeof request>[1]) {
  const response = await proxy(request(url, options));
  return response.headers.get("location");
}

console.log("Verificando redirecionamentos do proxy...");

assert.equal(
  await locationOf("https://synapsysnt.com.br/", { headers: { "accept-language": "pt-BR,pt;q=0.9" } }),
  "https://synapsysnt.com.br/pt"
);
assert.equal(
  await locationOf("https://synapsysnt.com.br/", { headers: { "x-gclb-country": "DE", "accept-language": "pt-BR" } }),
  "https://synapsysnt.com.br/de",
  "O país vence o idioma do navegador"
);
assert.equal(
  await locationOf("https://synapsysnt.com.br/", { headers: { "accept-language": "es-AR,es;q=0.9" } }),
  "https://synapsysnt.com.br/es"
);
assert.equal(
  await locationOf("https://synapsysnt.com.br/", { cookies: { synapsys_site_lang: "it" }, headers: { "x-gclb-country": "BR" } }),
  "https://synapsysnt.com.br/it",
  "A escolha manual no seletor vence a detecção"
);
assert.equal(
  await locationOf("https://synapsysnt.com.br/?logout=1", {
    cookies: { synapsys_session: "x", synapsys_lang: "ja" },
    headers: { "x-gclb-country": "FR" },
  }),
  "https://synapsysnt.com.br/ja?logout=1",
  "No logout a tela de login continua no idioma do usuário"
);
assert.equal(
  await locationOf("https://synapsysnt.com.br/pt?logout=1", { headers: { "accept-language": "en-US,en;q=0.9" } }),
  null,
  "Logout já localizado pelo app segue direto"
);
assert.equal(
  await locationOf("https://synapsysnt.com.br/", {
    cookies: { synapsys_lang: "pt" },
    headers: { "accept-language": "en-US,en;q=0.9" },
  }),
  "https://synapsysnt.com.br/pt",
  "Sem sessão, o idioma da conta vence o do navegador"
);
assert.equal(
  await locationOf("https://synapsysnt.com.br/", {
    cookies: { synapsys_site_lang: "it", synapsys_lang: "ja" },
    headers: { "accept-language": "en-US" },
  }),
  "https://synapsysnt.com.br/it",
  "A escolha feita no seletor do site vence o idioma da conta"
);
assert.equal(
  await locationOf("https://synapsysnt.com.br/", { cookies: { synapsys_session: "x", synapsys_lang: "ja" } }),
  "https://app.synapsysnt.com.br/ja/home",
  "Com sessão, entra no app no idioma configurado"
);
assert.equal(
  await locationOf("https://app.synapsysnt.com.br/home/integrations?connected=1", { cookies: { synapsys_lang: "ru" } }),
  "https://app.synapsysnt.com.br/ru/home/integrations?connected=1"
);
assert.equal(
  await locationOf("https://synapsysnt.com.br/en/home/p/abc"),
  "https://app.synapsysnt.com.br/en/home/p/abc"
);
assert.equal(
  await locationOf("https://app.synapsysnt.com.br/en", { headers: { "x-gclb-country": "BR" } }),
  "https://synapsysnt.com.br/en"
);
assert.equal(
  await locationOf("https://www.synapsysnt.com.br/", { headers: { "x-gclb-country": "BR" } }),
  "https://synapsysnt.com.br/pt"
);
assert.equal(
  await locationOf("https://synapsysnt.com.br/auth/action?mode=resetPassword&oobCode=1", {
    headers: { "x-gclb-country": "ES" },
  }),
  "https://synapsysnt.com.br/es/auth/action?mode=resetPassword&oobCode=1"
);
assert.equal(await locationOf("https://app.synapsysnt.com.br/de/home/p/abc"), null, "Rota já localizada segue direto");
assert.equal(await locationOf("https://synapsysnt.com.br/zh"), null);
assert.equal(await locationOf("https://synapsysnt.com.br/brand/logo.png"), null, "Arquivos estáticos não recebem sigla");
assert.equal(
  await locationOf("http://localhost:43127/home", { cookies: { synapsys_lang: "fr" } }),
  "http://localhost:43127/fr/home"
);

const cached = await proxy(request("https://synapsysnt.com.br/", { headers: { "x-gclb-country": "BR" } }));
assert.equal(cached.headers.get("cache-control"), "private, no-store", "Redirecionamento por idioma nunca é cacheado");

console.log("Roteamento por idioma OK.");
