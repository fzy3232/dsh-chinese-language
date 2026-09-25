/** Prompt section name; a duplicate registration throws, so it must stay unique. */
const DEFAULT_SECTION_NAME = "user:chinese-language";

/** Runtime-context name; its registry is separate from sections, so the name may match. */
const DEFAULT_CONTEXT_NAME = "user:chinese-language";

/**
 * Fallback sort order for the section.
 *
 * `dsh-system-prompt` orders `DEPLOYMENT_PERSONA_SUFFIX` at 10200, so any
 * higher value lands after every first-party section without reordering a row.
 * On releases that expose `getSectionOrder()` the value is derived from that
 * registry instead, so this constant only backstops older harnesses.
 */
const DEFAULT_ORDER = 10300;

/**
 * Fallback sort order for the runtime-context contribution.
 *
 * `dsh-system-prompt` orders `SANDBOX_POLICY` at 110; a lower value puts the
 * language rule ahead of the sandbox and approval notices. On releases that
 * expose `getContextOrder()` the value is derived from that registry.
 */
const DEFAULT_CONTEXT_ORDER = 100;

/** Offset above `DEPLOYMENT_PERSONA_SUFFIX` for the derived section order. */
const SECTION_ORDER_OFFSET = 100;

/** Offset below `SANDBOX_POLICY` for the derived runtime-context order. */
const CONTEXT_ORDER_OFFSET = 10;

/**
 * The section text used when `lines`, `text`, and their overrides are omitted.
 *
 * Kept deliberately short. A system prompt is resent with every request, so
 * every character here is a recurring cost that also sits inside the
 * prefix-cache region. Two lines carry the rule itself and the preservation
 * clause; the runtime context repeats the essence in one line.
 */
const DEFAULT_LINES = [
	"语言规则：始终使用简体中文进行内部推理（thinking）与最终回答，历史内容为英文时同样适用。",
	"代码、命令、路径、URL、报错原文和专有名词保留原文。"
];

/** The one-line runtime-context reminder, kept shorter than the section itself. */
const DEFAULT_CONTEXT_TEXT = "语言提醒：本轮内部推理与可见回答使用简体中文。";

/**
 * Resolve the section order from the live prompt registry when available.
 *
 * Newer harnesses allocate section positions centrally, so reading the persona
 * suffix's slot keeps this plugin last even if that slot moves. Releases
 * without the accessor fall back to the historical constant.
 * @param systemPrompt - the prompt service, when the harness exposes one.
 * @returns a finite order value.
 */
function deriveSectionOrder(systemPrompt) {
	const base = typeof systemPrompt?.getSectionOrder === "function"
		? systemPrompt.getSectionOrder("DEPLOYMENT_PERSONA_SUFFIX")
		: undefined;
	return Number.isFinite(base) ? base + SECTION_ORDER_OFFSET : DEFAULT_ORDER;
}

/**
 * Resolve the runtime-context order from the live prompt registry when available.
 * @param systemPrompt - the prompt service, when the harness exposes one.
 * @returns a finite order value.
 */
function deriveContextOrder(systemPrompt) {
	const base = typeof systemPrompt?.getContextOrder === "function"
		? systemPrompt.getContextOrder("SANDBOX_POLICY")
		: undefined;
	return Number.isFinite(base) ? base - CONTEXT_ORDER_OFFSET : DEFAULT_CONTEXT_ORDER;
}

/** Pick a non-empty string override, else the fallback. */
function resolveName(value, fallback) {
	return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

/** Pick a non-empty string override, else `undefined` so the caller can default it. */
function resolveOptionalText(value) {
	return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

/**
 * Resolve one channel's name and on/off state from its config key.
 *
 * The key keeps the shape it had before this plugin grew a second channel — a
 * string names the registration — while `false` now disables that channel and
 * `true`/omission keeps its default name.
 * @param value - the raw config value for the channel.
 * @param dedicatedName - the explicit `…Name` key, which wins when set.
 * @param fallback - the default name.
 * @returns the enabled flag and the resolved name.
 */
function resolveChannel(value, dedicatedName, fallback) {
	return {
		enabled: value !== false,
		name: resolveName(dedicatedName, resolveName(typeof value === "string" ? value : undefined, fallback))
	};
}

/**
 * Resolve row configuration into the exact registrations to install.
 *
 * Unknown keys are ignored, and an unusable value for a known key falls back to
 * that key's default rather than failing the whole loader entry. `section` and
 * `context` are independent switches: either channel can be turned off while
 * the other keeps the rule in the prompt. `contextText` defaults to the short
 * one-line reminder, so the section text can stay rich without paying for it
 * twice.
 * @param config - raw row config.
 * @param systemPrompt - the prompt service, used to derive default orders.
 * @returns the section and runtime-context registrations to install.
 */
function resolveConfig(config = {}, systemPrompt) {
	const lines = Array.isArray(config.lines)
		? config.lines.filter((line) => typeof line === "string" && line.trim().length > 0)
		: [];
	const text = resolveOptionalText(config.text)
		?? (lines.length > 0 ? lines : DEFAULT_LINES).join("\n");
	const section = resolveChannel(config.section, config.sectionName, DEFAULT_SECTION_NAME);
	const context = resolveChannel(config.context, config.contextName, DEFAULT_CONTEXT_NAME);
	return {
		text,
		sectionEnabled: section.enabled,
		sectionName: section.name,
		sectionOrder: Number.isFinite(config.order) ? config.order : deriveSectionOrder(systemPrompt),
		contextEnabled: context.enabled,
		contextName: context.name,
		contextOrder: Number.isFinite(config.contextOrder)
			? config.contextOrder
			: deriveContextOrder(systemPrompt),
		contextText: resolveOptionalText(config.contextText) ?? DEFAULT_CONTEXT_TEXT
	};
}
//#region lib/index.js
/**
 * Ask the agent to reason and answer in Simplified Chinese, through two
 * prompt channels with different token profiles.
 *
 * `systemPrompt.section()` appends one late section after
 * `deployment:persona-suffix`, so the rule sits at the very end of the
 * assembled system prompt. That is enough for a fresh session, but a long or
 * resumed session carries a history full of English reasoning, and a single
 * rule at the head of that history loses influence as the conversation grows.
 *
 * `systemPrompt.context()` therefore registers a one-line reminder as runtime
 * context. The harness re-renders that snapshot each step but persists a new
 * message only when the text changes — this text is static, so it is injected
 * once and then retained, which puts the rule next to the live conversation for
 * a resumed session at no recurring cost. Releases older than the
 * runtime-context API simply keep the section channel.
 *
 * Both registrations are additive. The plugin never replaces the deployment
 * persona (`personaPrefix` / `personaSuffix`) and never rewrites tool, skill,
 * or workspace-instruction text.
 * @module dsh-chinese-language
 */

/** Cordis plugin name. */
const name = "chinese-language";

/** The prompt registry this row contributes to. */
const inject = ["systemPrompt"];

/**
 * Register the language rule for the mounting context's scope.
 * @param ctx - a context that provides `systemPrompt`.
 * @param config - optional overrides; see the README's configuration table.
 */
function apply(ctx, config = {}) {
	const resolved = resolveConfig(config, ctx.systemPrompt);
	if (resolved.sectionEnabled) {
		ctx.effect(() => ctx.systemPrompt.section({
			name: resolved.sectionName,
			order: resolved.sectionOrder,
			text: resolved.text
		}), "chinese-language.section()");
	}
	if (resolved.contextEnabled && typeof ctx.systemPrompt.context === "function") {
		ctx.effect(() => ctx.systemPrompt.context({
			name: resolved.contextName,
			order: resolved.contextOrder,
			text: resolved.contextText
		}), "chinese-language.context()");
	}
}
//#endregion
export {
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
};
