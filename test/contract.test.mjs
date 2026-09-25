import assert from "node:assert/strict";
import test from "node:test";

import {
	DEFAULT_CONTEXT_NAME,
	DEFAULT_CONTEXT_ORDER,
	DEFAULT_CONTEXT_TEXT,
	DEFAULT_LINES,
	DEFAULT_ORDER,
	DEFAULT_SECTION_NAME,
	apply,
	deriveContextOrder,
	deriveSectionOrder,
	inject,
	name,
	resolveConfig
} from "../lib/index.js";

/** A stand-in prompt service; `context` is omitted to emulate older harnesses. */
function fakeContext(options = {}) {
	const calls = { sections: [], contexts: [] };
	const systemPrompt = {
		section: (section) => {
			calls.sections.push(section);
			return () => {};
		}
	};
	if (options.withContext !== false) {
		systemPrompt.context = (context) => {
			calls.contexts.push(context);
			return () => {};
		};
	}
	if (options.registry === true) {
		systemPrompt.getSectionOrder = (position) => ({ DEPLOYMENT_PERSONA_SUFFIX: 10200 })[position];
		systemPrompt.getContextOrder = (position) => ({ SANDBOX_POLICY: 110 })[position];
	}
	const ctx = {
		systemPrompt,
		effect: (callback) => {
			callback();
		}
	};
	return { ctx, calls };
}

test("plugin contract", () => {
	assert.equal(name, "chinese-language");
	assert.deepEqual(inject, ["systemPrompt"]);
});

test("registers one section and one runtime context by default", () => {
	const { ctx, calls } = fakeContext();
	apply(ctx, {});
	assert.equal(calls.sections.length, 1);
	assert.equal(calls.contexts.length, 1);
	assert.equal(calls.sections[0].name, DEFAULT_SECTION_NAME);
	assert.equal(calls.sections[0].order, DEFAULT_ORDER);
	assert.equal(calls.contexts[0].name, DEFAULT_CONTEXT_NAME);
	assert.equal(calls.contexts[0].order, DEFAULT_CONTEXT_ORDER);
	assert.equal(calls.sections[0].text, DEFAULT_LINES.join("\n"));
	assert.equal(calls.contexts[0].text, DEFAULT_CONTEXT_TEXT);
	assert.ok(calls.sections[0].text.includes("thinking"));
});

test("default text stays inside the token budget", () => {
	// The section is resent with every request and the reminder is retained once,
	// so their combined length is the plugin's steady-state prompt cost. The 4-line
	// default this plugin shipped before the runtime-context channel was ~148
	// characters; the current pair must stay clearly under that old baseline.
	const steadyState = DEFAULT_LINES.join("\n").length + DEFAULT_CONTEXT_TEXT.length;
	assert.ok(steadyState <= 100, `steady-state prompt text grew to ${steadyState} characters`);
	assert.ok(steadyState < 148, `steady-state prompt text must not exceed the pre-0.2.0 baseline`);
	assert.ok(DEFAULT_CONTEXT_TEXT.length < DEFAULT_LINES.join("\n").length);
});

test("works on a harness without the runtime-context API", () => {
	const { ctx, calls } = fakeContext({ withContext: false });
	apply(ctx, {});
	assert.equal(calls.sections.length, 1);
	assert.deepEqual(calls.contexts, []);
});

test("derives orders from the live registry when available", () => {
	const { ctx, calls } = fakeContext({ registry: true });
	apply(ctx, {});
	assert.equal(calls.sections[0].order, 10300);
	assert.equal(calls.contexts[0].order, 100);
	assert.equal(deriveSectionOrder(undefined), DEFAULT_ORDER);
	assert.equal(deriveContextOrder(undefined), DEFAULT_CONTEXT_ORDER);
});

test("applies configuration overrides", () => {
	const { ctx, calls } = fakeContext();
	apply(ctx, {
		lines: ["只用中文。", "  ", 7],
		order: 20000,
		sectionName: "user:my-language",
		contextName: "user:my-language",
		contextOrder: 5,
		contextText: "提醒：用中文。"
	});
	assert.equal(calls.sections[0].text, "只用中文。");
	assert.equal(calls.contexts[0].text, "提醒：用中文。");
	assert.equal(calls.sections[0].order, 20000);
	assert.equal(calls.sections[0].name, "user:my-language");
	assert.equal(calls.contexts[0].order, 5);
});

test("text wins over lines", () => {
	assert.equal(resolveConfig({ lines: ["忽略我。"], text: "只此一行。" }).text, "只此一行。");
	assert.equal(resolveConfig({ lines: [], text: "   " }).text, DEFAULT_LINES.join("\n"));
	assert.equal(resolveConfig({ lines: [] }).text, DEFAULT_LINES.join("\n"));
	assert.equal(resolveConfig({ contextText: "  " }).contextText, DEFAULT_CONTEXT_TEXT);
});

test("either channel can be disabled on its own", () => {
	const first = fakeContext();
	apply(first.ctx, { section: false });
	assert.deepEqual(first.calls.sections, []);
	assert.equal(first.calls.contexts.length, 1);

	const second = fakeContext();
	apply(second.ctx, { context: false });
	assert.equal(second.calls.sections.length, 1);
	assert.deepEqual(second.calls.contexts, []);
});

test("the historical `section` string key still names the section", () => {
	const { ctx, calls } = fakeContext();
	apply(ctx, { section: "user:legacy-name" });
	assert.equal(calls.sections[0].name, "user:legacy-name");
	assert.equal(calls.contexts[0].name, DEFAULT_CONTEXT_NAME);
});

test("unusable values fall back instead of failing the loader entry", () => {
	const { ctx, calls } = fakeContext();
	apply(ctx, { lines: [null, ""], order: Number.NaN, sectionName: "   ", contextOrder: "later" });
	assert.equal(calls.sections[0].text, DEFAULT_LINES.join("\n"));
	assert.equal(calls.sections[0].order, DEFAULT_ORDER);
	assert.equal(calls.sections[0].name, DEFAULT_SECTION_NAME);
	assert.equal(calls.contexts[0].order, DEFAULT_CONTEXT_ORDER);
});
