/** Prompt section name; a duplicate registration throws, so it must stay unique. */
const DEFAULT_SECTION_NAME = "user:chinese-language";

/**
 * Sort order for the section.
 *
 * `dsh-system-prompt` orders `DEPLOYMENT_PERSONA_SUFFIX` at 10200, so any
 * higher value lands after every first-party section without reordering a row.
 */
const DEFAULT_ORDER = 10300;

/** The rule appended when both `lines` and `text` are omitted. */
const DEFAULT_LINES = [
	"语言规则：始终使用简体中文进行内部推理、计划、工具说明和最终回答。",
	"代码、命令、文件路径、URL、API 名称、错误原文和专有名词保留原文。",
	"不要使用英文进行分析、解释或组织答案。",
	"最终语言检查：输出前确认内部推理和可见回答均使用简体中文。"
];

/**
 * Resolve row configuration into the exact section to register.
 *
 * Unknown keys are ignored, and an unusable value for a known key falls back to
 * that key's default rather than failing the whole loader entry.
 * @param config - raw row config.
 * @returns the section name, order, and rendered text.
 */
function resolveConfig(config = {}) {
	const lines = Array.isArray(config.lines)
		? config.lines.filter((line) => typeof line === "string" && line.trim().length > 0)
		: [];
	const text = typeof config.text === "string" && config.text.trim().length > 0
		? config.text
		: (lines.length > 0 ? lines : DEFAULT_LINES).join("\n");
	const sectionName = typeof config.section === "string" && config.section.trim().length > 0
		? config.section
		: DEFAULT_SECTION_NAME;
	const order = Number.isFinite(config.order) ? config.order : DEFAULT_ORDER;
	return {
		sectionName,
		order,
		text
	};
}
//#region lib/index.js
/**
 * A late system-prompt section that asks the agent to reason and answer in
 * Simplified Chinese, for every session that inherits the mounting scope.
 *
 * The section is additive. It never replaces the deployment persona
 * (`personaPrefix` / `personaSuffix`) and it never rewrites tool, skill, or
 * workspace-instruction text: it appends one independent section after
 * `deployment:persona-suffix`, so the rule lands at the very end of the
 * assembled prompt without disturbing any row above it.
 * @module dsh-chinese-language
 */

/** Cordis plugin name. */
const name = "chinese-language";

/** The prompt registry this row contributes to. */
const inject = ["systemPrompt"];

/**
 * Register the language section for the mounting context's scope.
 * @param ctx - a context that provides `systemPrompt`.
 * @param config - optional overrides; see the README's configuration table.
 */
function apply(ctx, config = {}) {
	const resolved = resolveConfig(config);
	ctx.effect(() => ctx.systemPrompt.section({
		name: resolved.sectionName,
		order: resolved.order,
		text: resolved.text
	}), "chinese-language.section()");
}
//#endregion
export { DEFAULT_LINES, DEFAULT_ORDER, DEFAULT_SECTION_NAME, apply, inject, name, resolveConfig };
