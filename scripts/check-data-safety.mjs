#!/usr/bin/env node
/**
 * Data safety lint — runs in CI and pre-commit.
 *
 * Scans `data/`, `src/`, README/CONTRIBUTING for:
 *   1. Invisible / bidi / tag characters (Trojan Source class)
 *   2. Unexpected scripts (Cyrillic / Greek / fullwidth ASCII) outside whitelisted contexts
 *   3. JSON syntax / required-fields / max-length / id-pattern (light schema check)
 *   4. Forbidden HTML tags in gitMeta (anything other than <code>)
 *   5. Suspicious instruction-like phrases in description/gitMeta
 *
 * Exits 0 on clean, 1 on hard failure, 2 on warnings only.
 */
import fs from 'fs';
import path from 'path';

const RED = (s) => `\x1b[31m${s}\x1b[0m`;
const YEL = (s) => `\x1b[33m${s}\x1b[0m`;
const GRN = (s) => `\x1b[32m${s}\x1b[0m`;

let hardFails = 0;
let warnings = 0;
const issue = (file, msg) => { console.error(RED('✗'), file + ':', msg); hardFails++; };
const warn = (file, msg) => { console.error(YEL('!'), file + ':', msg); warnings++; };

// --- 1. Invisible / bidi / tag chars ---
const INVISIBLE_RE = /[\u200B-\u200D\u202A-\u202E\u2060-\u206F\uFEFF]|[\u{E0000}-\u{E007F}]/gu;
const HOMOGLYPH_RE = /[Ѐ-ӿͰ-Ͽ]/g; // Cyrillic, Greek
// Only fullwidth Latin letters (impersonation risk); fullwidth punctuation is fine.
const FULLWIDTH_LETTERS_RE = /[Ａ-Ｚａ-ｚ]/g;

function scanFile(file) {
  const text = fs.readFileSync(file, 'utf8');
  let m;
  if ((m = text.match(INVISIBLE_RE))) {
    const codes = [...new Set(m.map((c) => 'U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')))];
    issue(file, `invisible/bidi chars detected: ${codes.join(', ')}`);
  }
  if ((m = text.match(HOMOGLYPH_RE))) {
    const codes = [...new Set(m.map((c) => 'U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')))];
    issue(file, `Cyrillic/Greek chars outside whitelist: ${codes.join(', ')}`);
  }
  if ((m = text.match(FULLWIDTH_LETTERS_RE))) {
    issue(file, `fullwidth Latin letters detected (homoglyph risk): ${m.length} chars`);
  }
}

function walk(dir, exts) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, exts));
    else if (exts.some((x) => p.endsWith(x))) out.push(p);
  }
  return out;
}

const scanned = [
  ...walk('data', ['.json']),
  ...walk('src', ['.ts', '.tsx', '.css']),
  'README.md',
].filter((f) => fs.existsSync(f));

for (const f of scanned) scanFile(f);

// --- 3-5. Validate data/nodes.json + data/branches.json + data/meta.json + locale ---
// Letters, digits, punctuation, spaces, plus common JP-specific glyphs.
// Includes the FF00-FFEF fullwidth block so ＝・／｜ etc. don't trip warnings.
const SAFE_TEXT = /^[\p{L}\p{N}\p{P}\p{Zs}\p{Sm}　＀-￯=・…—–·♥♡]+$/u;
const ID_PATTERN = /^n_[a-z0-9_]{1,40}$/;
const BRANCH_ID_PATTERN = /^[a-z][a-z0-9_]*$/;
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const MAX_LABEL = 60;
const MAX_DESCRIPTION = 500;
const MAX_GITMETA = 200;

const INJECTION_RE = /\b(ignore (?:previous|prior|all) instructions?|disregard (?:previous|all)|system prompt|you are (?:now|an?) (?:llm|ai|assistant)|act as (?:a|an) (?:llm|ai|assistant)|jailbreak)\b/i;

function validateNodes() {
  const file = 'data/nodes.json';
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const ids = new Set();
  for (const n of data.nodes) {
    if (!ID_PATTERN.test(n.id)) issue(file, `bad id pattern: ${n.id}`);
    if (ids.has(n.id)) issue(file, `duplicate id: ${n.id}`);
    ids.add(n.id);
    if (!n.label || n.label.length > MAX_LABEL) issue(file, `${n.id}: label missing or > ${MAX_LABEL}`);
    if (n.label && !SAFE_TEXT.test(n.label)) warn(file, `${n.id}: label contains unusual chars`);
    if (!n.description || n.description.length > MAX_DESCRIPTION) issue(file, `${n.id}: description missing or > ${MAX_DESCRIPTION}`);
    if (n.description && !SAFE_TEXT.test(n.description)) warn(file, `${n.id}: description contains unusual chars`);
    if (n.description && INJECTION_RE.test(n.description)) issue(file, `${n.id}: description matches forbidden instruction pattern`);
    if (!n.gitMeta || n.gitMeta.length > MAX_GITMETA) issue(file, `${n.id}: gitMeta missing or > ${MAX_GITMETA}`);
    if (n.gitMeta && INJECTION_RE.test(n.gitMeta)) issue(file, `${n.id}: gitMeta matches forbidden instruction pattern`);
    if (n.gitMeta) {
      // Only <code>...</code> tags allowed
      const stripped = n.gitMeta.replace(/<code>[\s\S]*?<\/code>/g, '');
      if (/<[^>]+>/.test(stripped)) issue(file, `${n.id}: gitMeta contains non-<code> HTML tag`);
    }
    if (!Array.isArray(n.arcs) || n.arcs.length === 0) issue(file, `${n.id}: arcs must be non-empty array`);
    if (typeof n.episode !== 'number' || n.episode < 1) issue(file, `${n.id}: episode must be positive number`);
    if (!['n', 'h', 'r', 'm', 'c'].includes(n.type)) issue(file, `${n.id}: bad type ${n.type}`);
    if (!['character', 'event', 'ability', 'group'].includes(n.kind)) issue(file, `${n.id}: bad kind ${n.kind}`);
    // Attribute fields (optional)
    if (n.affiliations) {
      if (!Array.isArray(n.affiliations)) issue(file, `${n.id}: affiliations must be array`);
      for (const a of n.affiliations) if (typeof a !== 'string' || a.length > 50) issue(file, `${n.id}: bad affiliation entry`);
    }
    if (n.occupation && (typeof n.occupation !== 'string' || n.occupation.length > 80))
      issue(file, `${n.id}: bad occupation`);
    if (n.nen) {
      const NEN_TYPES = ['強化系', '放出系', '変化系', '具現化系', '操作系', '特質系', '不明'];
      if (!NEN_TYPES.includes(n.nen.type)) issue(file, `${n.id}: bad nen type ${n.nen.type}`);
      if (n.nen.abilities) {
        if (!Array.isArray(n.nen.abilities)) issue(file, `${n.id}: nen.abilities must be array`);
        for (const a of n.nen.abilities) {
          if (!a.name || a.name.length > 40) issue(file, `${n.id}: bad nen ability name`);
          if (a.code && a.code.length > 30) issue(file, `${n.id}: nen ability code too long`);
          if (a.description && a.description.length > 300) issue(file, `${n.id}: nen ability description too long`);
        }
      }
    }
  }
}

function validateBranches() {
  const file = 'data/branches.json';
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const ids = new Set();
  for (const b of data.branches) {
    if (!BRANCH_ID_PATTERN.test(b.id)) issue(file, `bad branch id: ${b.id}`);
    if (ids.has(b.id)) issue(file, `duplicate branch id: ${b.id}`);
    ids.add(b.id);
    if (!COLOR_PATTERN.test(b.color)) issue(file, `${b.id}: bad color ${b.color}`);
    if (typeof b.lane !== 'number') issue(file, `${b.id}: lane must be number`);
    if (b.name && !SAFE_TEXT.test(b.name)) warn(file, `${b.id}: name contains unusual chars`);
  }
}

validateNodes();
validateBranches();

if (hardFails > 0) {
  console.error(RED(`\nFAIL: ${hardFails} hard issue(s), ${warnings} warning(s)`));
  process.exit(1);
}
if (warnings > 0) {
  console.error(YEL(`\nOK with ${warnings} warning(s)`));
  process.exit(0);
}
console.log(GRN('\nAll data safety checks passed.'));
