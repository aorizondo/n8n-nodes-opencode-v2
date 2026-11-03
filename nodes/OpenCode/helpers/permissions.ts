import type { PermissionRule } from '../transport/types';

export type PermissionPreset = 'agent' | 'readOnly' | 'workspaceWrite' | 'fullAuto' | 'custom';

// Session rules are evaluated after the agent's rules and the last matching rule wins, so each preset starts broad
// and narrows. "question" (ask the user) and "external_directory" always end denied: nobody is there to answer inside a
// workflow, and a pending ask would block the run until the timeout.
const unattended: PermissionRule[] = [
	{ action: 'question', resource: '*', effect: 'deny' },
	{ action: 'external_directory', resource: '*', effect: 'deny' },
];

const readTools = ['read', 'glob', 'grep', 'webfetch', 'websearch', 'skill', 'todowrite'];

export function presetRules(preset: PermissionPreset, customJson?: string): PermissionRule[] | undefined {
	switch (preset) {
		case 'agent':
			return undefined;
		case 'readOnly':
			return [
				{ action: '*', resource: '*', effect: 'deny' },
				...readTools.map((action): PermissionRule => ({ action, resource: '*', effect: 'allow' })),
				...unattended,
			];
		case 'workspaceWrite':
			return [
				{ action: '*', resource: '*', effect: 'allow' },
				{ action: 'shell', resource: '*', effect: 'deny' },
				...unattended,
			];
		case 'fullAuto':
			return [{ action: '*', resource: '*', effect: 'allow' }, ...unattended];
		case 'custom':
			return parseCustomRules(customJson ?? '');
	}
}

export function parseCustomRules(json: string): PermissionRule[] {
	let parsed: unknown;
	let valid = true;
	try {
		parsed = JSON.parse(json);
	} catch {
		valid = false;
	}
	if (!valid) throw new Error('Custom permissions must be valid JSON');
	if (!Array.isArray(parsed)) throw new Error('Custom permissions must be a JSON array of rules');
	return parsed.map((rule, index) => {
		const candidate = rule as Partial<PermissionRule>;
		if (
			typeof candidate?.action !== 'string' ||
			typeof candidate.resource !== 'string' ||
			!['allow', 'deny', 'ask'].includes(candidate.effect as string)
		) {
			throw new Error(
				`Permission rule ${index} must look like {"action":"edit","resource":"*","effect":"allow|deny|ask"}`,
			);
		}
		return { action: candidate.action, resource: candidate.resource, effect: candidate.effect } as PermissionRule;
	});
}

export function sameRules(a: PermissionRule[] | undefined, b: PermissionRule[] | undefined): boolean {
	return JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
}
