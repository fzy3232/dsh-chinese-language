import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import * as plugin from "../lib/index.js";

/**
 * The harness this plugin plugs into lives in a dsh profile's node_modules,
 * not in this repository, so the suite below runs only where those packages
 * resolve; elsewhere it reports as skipped instead of failing. See
 * "Development" in the README for how to run it locally.
 */
const harness = await import("@deepseek-ai/dsh-system-prompt").then(
	async (systemPrompt) => ({
		Context: (await import("@deepseek-ai/cordis")).Context,
		SystemPrompt: systemPrompt.default,
		renderPrompt: systemPrompt.renderPrompt,
		renderContextSnapshot: systemPrompt.renderContextSnapshot
	}),
	() => undefined
);

/** `test` when a real harness is importable, `test.skip` when it is not. */
const suite = harness === undefined ? test.skip : test;

/** Every `@deepseek-ai/dsh-system-prompt` release installed in the pnpm store. */
function installedReleases() {
	const home = process.env.DSH_HOME ?? join(homedir(), ".dsh");
	const profiles = join(home, "profiles");
	for (const profile of readdirSync(profiles)) {
		const store = join(profiles, profile, "node_modules", ".pnpm");
		let entries;
		try {
			entries = readdirSync(store);
		} catch {
			continue;
		}
		const found = entries.filter((name) => name.startsWith("@deepseek-ai+dsh-system-prompt@0.1."));
		if (found.length > 0) return found.map((entry) => ({ entry, root: join(store, entry, "node_modules", "@deepseek-ai") }));
	}
	return [];
}

suite("real harness: the section lands last and the reminder reaches the runtime context", async () => {
	const ctx = new harness.Context();
	await ctx.plugin(harness.SystemPrompt, { personaPrefix: "You are a test agent." });
	await ctx.plugin(plugin, {});
	const assembly = await ctx.systemPrompt.assemble({});
	assert.equal(assembly.sections.at(-1).name, plugin.DEFAULT_SECTION_NAME);
	assert.ok(harness.renderPrompt(assembly).includes("语言规则："));
	assert.ok(harness.renderContextSnapshot(assembly).includes(plugin.DEFAULT_CONTEXT_TEXT));
});

suite("real harness: a complete preset section takes over the prompt but not the reminder", async () => {
	const ctx = new harness.Context();
	await ctx.plugin(harness.SystemPrompt, { personaPrefix: "deployment persona" });
	await ctx.plugin(plugin, {});
	ctx.systemPrompt.section({
		name: "preset:persona",
		order: 0,
		text: "PRESET PERSONA",
		complete: true
	});
	const assembly = await ctx.systemPrompt.assemble({});
	assert.deepEqual(assembly.sections.map((section) => section.name), ["preset:persona"]);
	assert.ok(!harness.renderPrompt(assembly).includes("语言规则："));
	assert.ok(harness.renderContextSnapshot(assembly).includes(plugin.DEFAULT_CONTEXT_TEXT));
});

suite("real harness: suppressing runtime context leaves the section channel", async () => {
	const ctx = new harness.Context();
	await ctx.plugin(harness.SystemPrompt, {
		personaPrefix: "deployment persona",
		includeRuntimeContext: false
	});
	await ctx.plugin(plugin, {});
	const assembly = await ctx.systemPrompt.assemble({});
	assert.equal(harness.renderContextSnapshot(assembly), "");
	assert.ok(harness.renderPrompt(assembly).includes("语言规则："));
});

suite("real harness: every installed release still mounts both channels", async (t) => {
	const releases = installedReleases();
	if (releases.length === 0) {
		t.skip("no @deepseek-ai/dsh-system-prompt release found in a profile's pnpm store");
		return;
	}
	for (const { entry, root } of releases) {
		const release = await import(pathToFileURL(join(root, "dsh-system-prompt", "lib", "index.js")).href);
		const { Context } = await import(pathToFileURL(join(root, "cordis", "lib", "index.js")).href);
		const ctx = new Context();
		await ctx.plugin(release.default, { personaPrefix: "You are a test agent." });
		await ctx.plugin(plugin, {});
		const assembly = await ctx.systemPrompt.assemble({});
		const label = entry.match(/dsh-system-prompt@([^_]+)/)?.[1] ?? entry;
		assert.equal(assembly.sections.at(-1).name, plugin.DEFAULT_SECTION_NAME, `${label}: section not last`);
		assert.ok(release.renderPrompt(assembly).includes("语言规则："), `${label}: section channel lost`);
		assert.ok(
			release.renderContextSnapshot(assembly).includes(plugin.DEFAULT_CONTEXT_TEXT),
			`${label}: reminder channel lost`
		);
	}
});
