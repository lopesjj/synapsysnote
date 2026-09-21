import assert from "node:assert/strict";
import { isSameOriginRequest } from "../src/lib/api/request-origin";
import { createRateLimiter } from "../src/lib/api/rate-limit";
import { UNKNOWN_CLIENT_IP, clientIpFromHeader } from "../src/lib/api/client-ip";
import {
  MAX_PROXY_BYTES,
  isBlockedIp,
  parseProxyTarget,
  rejectionStatus,
  sanitizeContentType,
} from "../src/lib/media/proxy-guard";

// --- esquemas -------------------------------------------------------------

assert.equal(parseProxyTarget("").ok, false);
assert.equal(parseProxyTarget(null).ok, false);
assert.equal(parseProxyTarget("não é url").ok, false);

for (const hostile of [
  "data:text/html,<script>alert(1)</script>",
  "file:///etc/passwd",
  "gopher://example.com/",
  "blob:https://app.exemplo/1234",
  "javascript:alert(1)",
]) {
  const result = parseProxyTarget(hostile);
  assert.equal(result.ok, false, hostile);
  if (!result.ok) assert.equal(result.reason, "BLOCKED_SCHEME", hostile);
}

// --- destinos internos ----------------------------------------------------

for (const internal of [
  "http://169.254.169.254/latest/meta-data/",
  "http://metadata.google.internal/computeMetadata/v1/",
  "http://localhost:3000/admin",
  "http://127.0.0.1:43127/api/notion/tree",
  "http://10.0.0.5:8080/",
  "http://192.168.1.1/",
  "http://172.16.9.9/",
  "http://[::1]/",
  "http://[::ffff:127.0.0.1]/",
  "https://algo.local/",
  "http://0.0.0.0/",
]) {
  const result = parseProxyTarget(internal);
  assert.equal(result.ok, false, internal);
  if (!result.ok) assert.equal(result.reason, "BLOCKED_HOST", internal);
}

// --- destinos legítimos ---------------------------------------------------

for (const allowed of [
  "https://firebasestorage.googleapis.com/v0/b/synapsysnote.firebasestorage.app/o/x?alt=media",
  "https://storage.googleapis.com/bucket/objeto.mp4",
  "https://images.unsplash.com/photo-1.jpg",
  "http://exemplo.com/imagem.png",
]) {
  assert.equal(parseProxyTarget(allowed).ok, true, allowed);
}

// --- faixas de IP ---------------------------------------------------------

const blocked = [
  "0.0.0.0",
  "10.255.255.255",
  "127.0.0.1",
  "169.254.169.254",
  "172.16.0.1",
  "172.31.255.255",
  "100.64.0.1",
  "192.168.0.1",
  "192.0.2.1",
  "198.18.0.1",
  "224.0.0.1",
  "255.255.255.255",
  "::1",
  "::",
  "fe80::1",
  "fd00::abcd",
  "ff02::1",
  "::ffff:10.0.0.1",
  "2001:db8::1",
];
for (const ip of blocked) {
  assert.equal(isBlockedIp(ip), true, `deveria bloquear ${ip}`);
}

// Formas que embutem IPv4 dentro de IPv6 — o caminho silencioso ate a metadata.
const embutidos = [
  "64:ff9b::a9fe:a9fe",   // NAT64 -> 169.254.169.254
  "64:ff9b::7f00:1",      // NAT64 -> 127.0.0.1
  "64:ff9b::a00:5",       // NAT64 -> 10.0.0.5
  "64:ff9b:1::a9fe:a9fe", // NAT64 /48
  "2002:a9fe:a9fe::",     // 6to4 -> 169.254.169.254
  "2002:7f00:1::",        // 6to4 -> 127.0.0.1
  "2002:a00:5::",         // 6to4 -> 10.0.0.5
  "::ffff:7f00:1",        // IPv4-mapped em hex
  "fec0::1",              // site-local
  "feff::1",
  "2001::1",              // Teredo
];
for (const ip of embutidos) {
  assert.equal(isBlockedIp(ip), true, `deveria bloquear ${ip}`);
}
for (const host of [
  "http://[64:ff9b::a9fe:a9fe]/",
  "http://[2002:a9fe:a9fe::]/",
  "http://[fec0::1]/",
  "http://metadata.google.internal./computeMetadata/v1/",
  "http://localhost./",
  "http://127.0.0.1./",
]) {
  const result = parseProxyTarget(host);
  assert.equal(result.ok, false, host);
}

const publicos = [
  "8.8.8.8",
  "1.1.1.1",
  "172.15.255.255",
  "172.32.0.1",
  "100.63.255.255",
  "142.250.79.110",
  "2001:4860:4860::8888",
  "2606:4700::1111",
];
for (const ip of publicos) {
  assert.equal(isBlockedIp(ip), false, `não deveria bloquear ${ip}`);
}

// --- tipo de conteúdo -----------------------------------------------------

// HTML servido na origem do app seria XSS com acesso ao cookie de sessão.
const html = sanitizeContentType("text/html; charset=utf-8");
assert.equal(html.contentType, "application/octet-stream");
assert.equal(html.disposition, "attachment");

const script = sanitizeContentType("application/javascript");
assert.equal(script.disposition, "attachment");

const vazio = sanitizeContentType(null);
assert.equal(vazio.contentType, "application/octet-stream");
assert.equal(vazio.disposition, "attachment");

assert.deepEqual(sanitizeContentType("image/png"), {
  contentType: "image/png",
  disposition: "inline",
});
assert.deepEqual(sanitizeContentType("video/mp4; codecs=avc1"), {
  contentType: "video/mp4",
  disposition: "inline",
});
assert.deepEqual(sanitizeContentType("audio/ogg"), {
  contentType: "audio/ogg",
  disposition: "inline",
});
// PDF inline no dominio do app e vetor de phishing: desce como download.
assert.deepEqual(sanitizeContentType("application/pdf"), {
  contentType: "application/pdf",
  disposition: "attachment",
});
// SVG continua exibível em <img>; o CSP da resposta é que impede execução.
assert.deepEqual(sanitizeContentType("image/svg+xml"), {
  contentType: "image/svg+xml",
  disposition: "inline",
});

// --- respostas ------------------------------------------------------------

assert.equal(rejectionStatus("MISSING_URL"), 400);
assert.equal(rejectionStatus("INVALID_URL"), 400);
assert.equal(rejectionStatus("BLOCKED_SCHEME"), 403);
assert.equal(rejectionStatus("BLOCKED_HOST"), 403);
assert.equal(rejectionStatus("TOO_LARGE"), 413);

// O teto cobre o maior anexo aceito (vídeo de 150 MB) com folga.
assert.ok(MAX_PROXY_BYTES > 150 * 1024 * 1024);
assert.ok(MAX_PROXY_BYTES <= 256 * 1024 * 1024);

// --- origem da requisição ------------------------------------------------

const comSite = (site: string | null) =>
  new Request("https://app.exemplo/api/media/proxy", {
    headers: site ? { "sec-fetch-site": site } : {},
  });

assert.equal(isSameOriginRequest(comSite("same-origin")), true);
assert.equal(isSameOriginRequest(comSite("none")), true);
// Subdomínio irmão pode ser de terceiro ou estar comprometido.
assert.equal(isSameOriginRequest(comSite("same-site")), false);
assert.equal(isSameOriginRequest(comSite("cross-site")), false);
assert.equal(isSameOriginRequest(comSite(null)), true);

// --- IP de quem chamou ----------------------------------------------------

// Atrás do balanceador do Google o formato é <cliente>,<client-ip>,<lb-ip> e só
// os dois últimos são escritos por ele. Pegar o primeiro entregaria a chave do
// limite ao atacante: bastaria variar o cabeçalho para ganhar balde novo.
assert.equal(clientIpFromHeader("1.2.3.4, 203.0.113.7, 130.211.0.1"), "203.0.113.7");
// Sem proxy na frente (hops 0) o unico elemento e o proprio cliente.
assert.equal(clientIpFromHeader("203.0.113.7", 0), "203.0.113.7");
// Com dois saltos confiaveis a chave anda mais para tras.
assert.equal(clientIpFromHeader("1.2.3.4, 203.0.113.7, 10.0.0.1, 130.211.0.1", 2), "203.0.113.7");
assert.equal(clientIpFromHeader("203.0.113.7, 130.211.0.1"), "203.0.113.7");
assert.equal(clientIpFromHeader("203.0.113.7"), "203.0.113.7");
assert.equal(clientIpFromHeader(null), UNKNOWN_CLIENT_IP);
assert.equal(clientIpFromHeader(""), UNKNOWN_CLIENT_IP);
assert.equal(clientIpFromHeader(" , , "), UNKNOWN_CLIENT_IP);
// Forjar dezenas de elementos não move o penúltimo.
assert.equal(
  clientIpFromHeader("9.9.9.9, 8.8.8.8, 7.7.7.7, 203.0.113.7, 130.211.0.1"),
  "203.0.113.7"
);
// Porta e colchetes não podem gerar chaves diferentes para o mesmo cliente.
assert.equal(clientIpFromHeader("1.1.1.1, 203.0.113.7:51234, 130.211.0.1"), "203.0.113.7");
assert.equal(clientIpFromHeader("1.1.1.1, [2001:db8::42]:443, 130.211.0.1"), "2001:db8::42");
assert.equal(clientIpFromHeader("[2001:DB8::42], 130.211.0.1"), "2001:db8::42");

// --- limite de uso --------------------------------------------------------

let agora = 1_000_000;
const limiter = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 5,
  maxConcurrent: 2,
  maxBytes: 1_000,
  now: () => agora,
});

// Concorrência: a terceira simultânea espera.
assert.equal(limiter.take("ip"), true);
assert.equal(limiter.take("ip"), true);
assert.equal(limiter.take("ip"), false, "terceira simultânea deveria ser recusada");
limiter.release("ip", 0);
assert.equal(limiter.take("ip"), true, "slot deveria voltar após liberar");
limiter.release("ip", 0);
limiter.release("ip", 0);

// Contagem por janela.
assert.equal(limiter.take("ip"), true);
assert.equal(limiter.take("ip"), true);
limiter.release("ip");
limiter.release("ip");
assert.equal(limiter.take("ip"), false, "quinta na mesma janela estoura a contagem");

// Janela nova zera contagem e bytes.
agora += 61_000;
assert.equal(limiter.take("ip"), true);
limiter.release("ip", 900);

// Orçamento de banda: passou do teto, recusa até a próxima janela.
assert.equal(limiter.take("ip"), true);
limiter.release("ip", 200);
assert.equal(limiter.take("ip"), false, "banda da janela deveria estar esgotada");
agora += 61_000;
assert.equal(limiter.take("ip"), true, "janela nova libera a banda");
limiter.release("ip");

// Chaves diferentes não se atrapalham.
const outro = createRateLimiter({
  windowMs: 1_000,
  maxRequests: 1,
  maxConcurrent: 1,
  maxBytes: 10,
  now: () => agora,
});
assert.equal(outro.take("a"), true);
assert.equal(outro.take("b"), true);
assert.equal(outro.size(), 2);

console.log("Todos os testes de proteção do proxy de mídia passaram com sucesso!");
