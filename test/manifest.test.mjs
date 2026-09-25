import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("..", import.meta.url);

/**
 * Installing through `dsh plugin add` only ever sees the published tarball, so
 * a file missing from `files` is invisible here and fatal there. The manifest
 * check in CI covers the `dsh.bundle` declaration; this covers the payload.
 */
test("the published package carries every runtime file", () => {
	const manifest = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
	const packed = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json"], {
		cwd: root,
		encoding: "utf8",
		shell: process.platform === "win32"
	}));
	const files = new Set(packed[0].files.map((entry) => entry.path));
	const patch = manifest.dsh.bundle.patch.replace(/^\.\//, "");
	for (const path of ["package.json", manifest.main, patch, "README.md", "README.zh.md", "CHANGELOG.md", "LICENSE"]) {
		assert.ok(files.has(path), `missing from the npm package: ${path}`);
	}
	assert.ok(files.has("lib/index.js"), "the module itself must ship");
});
