import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Auto-PR remediation (ported from TestFly's RemediationPatchGenerator): ask the model for a minimal
 * unified diff that fixes a failed test, keep it only if `git apply --check` accepts it, and write it to
 * `<outputDir>/remediations/<test>.patch`. Patches are never applied automatically; review them and
 * apply with `git apply <file>` (or open a PR from them).
 *
 * @internal
 */

/** System prompt for patch generation. */
export function remediationSystemPrompt(): string {
  return `You are a senior test automation engineer. Fix the failing Playwright test with the SMALLEST possible change to the given file.
Rules:
- Answer with ONE unified diff (git format: "--- a/<path>" / "+++ b/<path>" / "@@" hunks) inside a \`\`\`diff block, nothing else.
- Change only the file you were given, using exactly the given path.
- Keep enough unchanged context lines (3) so the patch applies cleanly.
- If the failure is an application bug that the test correctly detects, answer with exactly: NO_PATCH`;
}

/** User prompt for patch generation. */
export function remediationUserPrompt(args: { title: string; error: string; snippet?: string; analysis?: string; file: string; source: string }): string {
  return `Test: ${args.title}
File: ${args.file}

Error:
${args.error}
${args.snippet ? `\nCode snippet:\n${args.snippet}\n` : ''}${args.analysis ? `\nPrior analysis:\n${args.analysis}\n` : ''}
Current content of ${args.file}:
\`\`\`ts
${args.source}
\`\`\``;
}

/** Extract the diff from a model answer (fenced or raw); `undefined` for NO_PATCH or no diff. */
export function extractDiff(text: string): string | undefined {
  if (/^\s*NO_PATCH\s*$/.test(text)) return undefined;
  const fenced = /```(?:diff|patch)?\s*\n([\s\S]*?)```/.exec(text);
  const body = (fenced ? fenced[1]! : text).trim();
  if (!/^--- /m.test(body) || !/^\+\+\+ /m.test(body) || !/^@@/m.test(body)) return undefined;
  return `${body}\n`;
}

/** Paths a diff touches (from `+++ b/<path>` and `--- a/<path>` lines). */
export function diffPaths(diff: string): string[] {
  const out = new Set<string>();
  for (const m of diff.matchAll(/^(?:---|\+\+\+) (?:[ab]\/)?(\S+)/gm)) {
    if (m[1] !== '/dev/null') out.add(m[1]!);
  }
  return [...out];
}

/** Outcome of {@link checkPatch}. */
export type PatchCheck = { ok: true } | { ok: false; reason: string };

/** The diff must touch only `relFile` and apply cleanly in `rootDir` (`git apply --check`). */
export function checkPatch(diff: string, rootDir: string, relFile: string): PatchCheck {
  const touched = diffPaths(diff);
  if (touched.length !== 1 || touched[0] !== relFile) {
    return { ok: false, reason: `patch must change only ${relFile} (it touches: ${touched.join(', ') || 'nothing'})` };
  }
  const res = spawnSync('git', ['apply', '--check', '--whitespace=nowarn', '-'], { cwd: rootDir, input: diff, encoding: 'utf8' });
  if (res.error) return { ok: false, reason: `git is not available (${res.error.message})` };
  if (res.status !== 0) return { ok: false, reason: `git apply --check failed: ${(res.stderr || res.stdout).trim().split('\n')[0]}` };
  return { ok: true };
}

/** Read the test source (capped) for the prompt. */
export function readSource(file: string, maxChars: number): string | undefined {
  try {
    const text = readFileSync(file, 'utf8');
    return text.length > maxChars ? undefined : text;
  } catch {
    return undefined;
  }
}

/** Write a validated patch; returns its path. */
export function writePatch(outDir: string, title: string, diff: string, header: string): string {
  mkdirSync(outDir, { recursive: true });
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'test';
  const file = join(outDir, `${slug}.patch`);
  writeFileSync(file, `${header}\n${diff}`);
  return file;
}

/** Posix path of `file` relative to `rootDir`. */
export function relPosix(rootDir: string, file: string): string {
  return relative(rootDir, file).split('\\').join('/');
}
