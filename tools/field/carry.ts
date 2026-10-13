// Carrying a people's pass to a new candidate (4.1.20 PR 4, docs/dev/PLAN-4.1.20-LAST-MILE.md §9.3–9.4, ADR 0024). A
// pass is bound to the files its surface reads (docs/dev/surfaces.json, the candidate's attested
// qualification-surfaces.json). When none of them changed — none, the version included — between the candidate the
// person tried and a new one, the pass may stand for the new one too, but only by a CarryAttestation the maintainer
// approves in a commit signed with their key (tools/field/trust.ts). The FieldReport is never rewritten: its four
// statuses stay four. Claude never writes an `approved` attestation.
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { type FieldReport, PASS_IDS, type PassId } from './schema';

const sha256 = z.string().regex(/^[0-9a-f]{64}$/, 'a SHA-256 in lowercase hex');
const candidateRef = z
  .object({
    release: z.string().regex(/^\d+\.\d+\.\d+(-rc\.\d+)?$/),
    commit: z.string().regex(/^[0-9a-f]{40}$/),
    candidateRun: z.string().regex(/^\d+$/),
  })
  .strict();

const CARRY_DECISIONS = ['pending', 'approved', 'refused'] as const;

export const CarryAttestationSchema = z
  .object({
    format: z.literal('web-scumm-carry'),
    schema: z.literal(1),
    passId: z.enum(PASS_IDS),
    from: candidateRef,
    to: candidateRef,
    /** The SHA-256 of the source report's bytes: the person's pass, read, never rewritten. */
    sourceReportDigest: sha256,
    /** The surface's digest in the source and the target candidates' qualification-surfaces.json: equal. */
    sourceSurfaceDigest: sha256,
    targetSurfaceDigest: sha256,
    /** Every file that differs between the two candidates (none read by the surface), and the digest of that list. */
    changedFiles: z.array(z.string().min(1).max(300)).max(5000),
    changedFilesDigest: sha256,
    decision: z.enum(CARRY_DECISIONS),
    /** The principal `.github/allowed_signers` names for the key that signed the approving commit. */
    approvedBy: z.string().min(1).max(200).optional(),
  })
  .strict()
  .superRefine((a, ctx) => {
    if (a.decision === 'approved' && !a.approvedBy)
      ctx.addIssue({ code: 'custom', message: 'an approved carry names who approved it', path: ['approvedBy'] });
    if (a.decision === 'pending' && a.approvedBy)
      ctx.addIssue({ code: 'custom', message: 'a pending carry is approved by nobody yet', path: ['approvedBy'] });
    if (digestOfChanges(a.changedFiles) !== a.changedFilesDigest)
      ctx.addIssue({
        code: 'custom',
        message: 'changedFilesDigest is not the digest of changedFiles',
        path: ['changedFilesDigest'],
      });
  });
export type CarryAttestation = z.infer<typeof CarryAttestationSchema>;

interface Surface {
  id: PassId;
  artifactDigests: Record<string, string>;
  configDigest: string;
  exclusions: { path: string; reason: string; test: string }[];
  dependencies: PassId[];
  surfaceDigest: string;
}
export interface Surfaces {
  format: 'web-scumm-qualification-surfaces';
  schema: 1;
  version: string;
  surfaces: Surface[];
}

const hex = (s: string) => createHash('sha256').update(s).digest('hex');
/** The digest of a list of changed files: sorted, one per line. */
export const digestOfChanges = (files: string[]) => hex([...files].sort().join('\n'));

/** What differs in one surface between two candidates: each file added, removed or changed, and its configuration. */
function surfaceChanges(a: Surface, b: Surface): string[] {
  const out: string[] = [];
  for (const k of [...new Set([...Object.keys(a.artifactDigests), ...Object.keys(b.artifactDigests)])].sort())
    if (a.artifactDigests[k] !== b.artifactDigests[k]) out.push(k);
  if (a.configDigest !== b.configDigest) out.push('(its configuration in the checkout)');
  if (JSON.stringify(a.exclusions) !== JSON.stringify(b.exclusions)) out.push('(its exclusions)');
  return out;
}

/**
 * Whether a pass may be carried, and the pending attestation when it may. `sourceFiles` and `targetFiles` are every
 * file of the two candidates (path → SHA-256; the site's as `site:<path>`), for the list of what changed elsewhere.
 * Refused when the source report is not `passed`, when either candidate has no such surface, or when the surface or a
 * surface it depends on changed: the version included, no force.
 */
export function carryCheck(o: {
  report: FieldReport;
  reportBytes: string | Buffer;
  from: z.infer<typeof candidateRef>;
  to: z.infer<typeof candidateRef>;
  source: Surfaces;
  target: Surfaces;
  sourceFiles: Record<string, string>;
  targetFiles: Record<string, string>;
}): { ok: true; attestation: CarryAttestation } | { ok: false; why: string[] } {
  const why: string[] = [];
  const id = o.report.passId;
  if (o.report.status !== 'passed') why.push(`the source report is ${o.report.status}, not passed`);
  if (o.report.commit !== o.from.commit || o.report.candidateRun !== o.from.candidateRun)
    why.push('the source report is not of the source candidate');
  const of = (s: Surfaces, pass: PassId) => s.surfaces.find((x) => x.id === pass);
  const a = of(o.source, id);
  const b = of(o.target, id);
  if (!a || !b)
    return { ok: false, why: [...why, `${id}: no surface in ${!a ? 'the source' : 'the target'} candidate`] };
  const changed = surfaceChanges(a, b);
  if (changed.length)
    why.push(`${id}'s surface changed: ${changed.slice(0, 8).join(', ')}${changed.length > 8 ? ', …' : ''}`);
  for (const dep of a.dependencies) {
    const da = of(o.source, dep);
    const db = of(o.target, dep);
    if (!da || !db || da.surfaceDigest !== db.surfaceDigest) why.push(`${dep}, which ${id} depends on, changed`);
  }
  if (why.length) return { ok: false, why };
  const files = [...new Set([...Object.keys(o.sourceFiles), ...Object.keys(o.targetFiles)])]
    .filter((f) => o.sourceFiles[f] !== o.targetFiles[f])
    .sort();
  return {
    ok: true,
    attestation: {
      format: 'web-scumm-carry',
      schema: 1,
      passId: id,
      from: o.from,
      to: o.to,
      sourceReportDigest: hex(typeof o.reportBytes === 'string' ? o.reportBytes : o.reportBytes.toString('utf8')),
      sourceSurfaceDigest: a.surfaceDigest,
      targetSurfaceDigest: b.surfaceDigest,
      changedFiles: files,
      changedFilesDigest: digestOfChanges(files),
      decision: 'pending',
    },
  };
}

/**
 * Whether an attestation makes its pass count as `passed` for the target candidate: approved, its signature trusted
 * (`trusted`: what tools/field/trust.ts found, the principal that signed), its source report the very bytes it names
 * and `passed`, and its target surface the candidate's own. Else why not.
 */
export function carriedPass(o: {
  attestation: CarryAttestation;
  sourceReport: FieldReport;
  sourceReportBytes: string;
  target: Surfaces;
  targetRef: z.infer<typeof candidateRef>;
  trusted: { ok: true; principal: string } | { ok: false; why: string };
}): { counts: true } | { counts: false; why: string } {
  const a = CarryAttestationSchema.safeParse(o.attestation);
  if (!a.success) return { counts: false, why: `not a carry attestation: ${a.error.issues[0]?.message}` };
  const x = a.data;
  if (x.decision !== 'approved') return { counts: false, why: `the carry is ${x.decision}` };
  if (!o.trusted.ok) return { counts: false, why: o.trusted.why };
  if (o.trusted.principal !== x.approvedBy)
    return { counts: false, why: `approved by "${x.approvedBy}" in the file, signed by "${o.trusted.principal}"` };
  if (hex(o.sourceReportBytes) !== x.sourceReportDigest)
    return { counts: false, why: 'the source report is not the one carried' };
  if (o.sourceReport.status !== 'passed') return { counts: false, why: 'the source report is not passed' };
  // The report is the source candidate's, for this pass (second reading of PR 4): never one of another run.
  if (
    o.sourceReport.passId !== x.passId ||
    o.sourceReport.commit !== x.from.commit ||
    o.sourceReport.candidateRun !== x.from.candidateRun
  )
    return { counts: false, why: "the source report is not this pass's on the source candidate" };
  if (JSON.stringify(x.to) !== JSON.stringify(o.targetRef))
    return { counts: false, why: 'carried to another candidate' };
  const t = o.target.surfaces.find((s) => s.id === x.passId);
  if (!t || t.surfaceDigest !== x.targetSurfaceDigest)
    return { counts: false, why: "the target candidate's surface is not the one the carry names" };
  return { counts: true };
}
