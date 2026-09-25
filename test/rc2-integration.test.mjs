import assert from "node:assert/strict";
import test from "node:test";

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
