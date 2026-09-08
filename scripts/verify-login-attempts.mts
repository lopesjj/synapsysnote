import assert from "node:assert/strict";
import {
  LOGIN_ATTEMPTS_THRESHOLD,
  getFailedLoginAttempts,
  recordFailedLoginAttempt,
  clearFailedLoginAttempts,
  isCaptchaRequiredForLogin,
} from "../src/lib/auth/login-attempts";

console.log("Iniciando testes de tentativas de login e reCAPTCHA condicional...");

// 1. Limpa qualquer estado anterior
clearFailedLoginAttempts();
assert.equal(getFailedLoginAttempts("aluno@synapsys.com"), 0, "Deveria iniciar com 0 tentativas");
assert.equal(isCaptchaRequiredForLogin("aluno@synapsys.com"), false, "reCAPTCHA não deve ser exigido inicialmente");

// 2. Primeira tentativa falha
const attempt1 = recordFailedLoginAttempt("aluno@synapsys.com");
assert.equal(attempt1, 1, "Primeira tentativa deve retornar 1");
assert.equal(getFailedLoginAttempts("aluno@synapsys.com"), 1);
assert.equal(isCaptchaRequiredForLogin("aluno@synapsys.com"), false, "1 tentativa falha: reCAPTCHA NÃO deve aparecer");

// 3. Segunda tentativa falha
const attempt2 = recordFailedLoginAttempt("aluno@synapsys.com");
assert.equal(attempt2, 2, "Segunda tentativa deve retornar 2");
assert.equal(getFailedLoginAttempts("aluno@synapsys.com"), 2);
assert.equal(isCaptchaRequiredForLogin("aluno@synapsys.com"), false, "2 tentativas falhas: reCAPTCHA NÃO deve aparecer");

// 4. Terceira tentativa falha (atinge o limiar)
const attempt3 = recordFailedLoginAttempt("aluno@synapsys.com");
assert.equal(attempt3, 3, "Terceira tentativa deve retornar 3");
assert.equal(getFailedLoginAttempts("aluno@synapsys.com"), 3);
assert.equal(isCaptchaRequiredForLogin("aluno@synapsys.com"), true, "3 tentativas falhas: reCAPTCHA DEVE aparecer");

// 5. Quarta tentativa falha (continua exigindo reCAPTCHA)
const attempt4 = recordFailedLoginAttempt("aluno@synapsys.com");
assert.equal(attempt4, 4);
assert.equal(isCaptchaRequiredForLogin("aluno@synapsys.com"), true, "4 tentativas falhas: reCAPTCHA continua exigido");

// 6. Teste de insensibilidade a maiúsculas/minúsculas no e-mail
assert.equal(getFailedLoginAttempts("ALUNO@synapsys.com"), 4, "E-mail em maiúsculas deve bater o mesmo histórico");
assert.equal(isCaptchaRequiredForLogin(" ALUNO@synapsys.com "), true, "E-mail com espaços em branco deve bater");

// 7. Login bem sucedido: limpar histórico
clearFailedLoginAttempts("aluno@synapsys.com");
assert.equal(getFailedLoginAttempts("aluno@synapsys.com"), 0, "Tentativas devem ser zeradas após login bem-sucedido");
assert.equal(isCaptchaRequiredForLogin("aluno@synapsys.com"), false, "reCAPTCHA não deve mais ser exigido após sucesso");

// 8. Proteção contra força bruta em múltiplos e-mails no mesmo cliente
clearFailedLoginAttempts();
recordFailedLoginAttempt("user1@synapsys.com");
recordFailedLoginAttempt("user2@synapsys.com");
recordFailedLoginAttempt("user3@synapsys.com");
assert.equal(
  isCaptchaRequiredForLogin("novo_user@synapsys.com"),
  true,
  "Após 3 falhas no mesmo dispositivo com e-mails distintos, reCAPTCHA deve proteger contra dictionary attack"
);

clearFailedLoginAttempts();
console.log("Todos os testes de tentativas de login e reCAPTCHA passaram com sucesso!");
