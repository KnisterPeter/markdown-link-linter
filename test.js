import { test } from "node:test";
import Assert from "node:assert";

import { createUrl } from "./index.js";

test("createUrl should return if fragment is valid url", () => {
  Assert.strictEqual(
    createUrl(`file://${process.cwd()}/package.json`, process.cwd()).toString(),
    `file://${process.cwd()}/package.json`,
  );
});

test("createUrl should combine fragments with base into valid url", () => {
  Assert.strictEqual(
    createUrl("./package.json", process.cwd()).toString(),
    `file://${process.cwd()}/package.json`,
  );
});

test("createUrl should combine fragments with anchor with base into valid url", () => {
  Assert.strictEqual(
    createUrl("./package.json#hash", process.cwd()).toString(),
    `file://${process.cwd()}/package.json#hash`,
  );
});
