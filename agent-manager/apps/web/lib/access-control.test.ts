import assert from "node:assert/strict";
import test from "node:test";
import { isManagerAllowedEmail } from "./access-control.ts";

const originalNodeEnv = process.env.NODE_ENV;
const originalAllowed = process.env.MANAGER_ALLOWED_EMAILS;

test.after(() => {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
  if (originalAllowed === undefined) delete process.env.MANAGER_ALLOWED_EMAILS;
  else process.env.MANAGER_ALLOWED_EMAILS = originalAllowed;
});

test("autorise les sessions locales en développement", () => {
  process.env.NODE_ENV = "development";
  delete process.env.MANAGER_ALLOWED_EMAILS;
  assert.equal(isManagerAllowedEmail("anyone@example.com"), true);
});

test("refuse tous les comptes si la liste de production est absente", () => {
  process.env.NODE_ENV = "production";
  delete process.env.MANAGER_ALLOWED_EMAILS;
  assert.equal(isManagerAllowedEmail("owner@example.com"), false);
});

test("compare les adresses sans tenir compte des espaces ou de la casse", () => {
  process.env.NODE_ENV = "production";
  process.env.MANAGER_ALLOWED_EMAILS = " owner@example.com, admin@example.com ";
  assert.equal(isManagerAllowedEmail("OWNER@example.com "), true);
  assert.equal(isManagerAllowedEmail("other@example.com"), false);
});

test("refuse une liste vide ou composée d'espaces", () => {
  process.env.NODE_ENV = "production";
  process.env.MANAGER_ALLOWED_EMAILS = " ,  ";
  assert.equal(isManagerAllowedEmail("owner@example.com"), false);
});
