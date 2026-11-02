import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectLanguage } from '../src/i18n/detect';
import de from '../src/i18n/locales/de.json';
import en from '../src/i18n/locales/en.json';

type Tree = { [key: string]: string | Tree };

const flatten = (tree: Tree, prefix = ''): Record<string, string> =>
  Object.entries(tree).reduce<Record<string, string>>((acc, [k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    return typeof v === 'string' ? { ...acc, [key]: v } : { ...acc, ...flatten(v, key) };
  }, {});

const deKeys = flatten(de as Tree);
const enKeys = flatten(en as Tree);

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.tsx?$/.test(name) ? [path] : [];
  });
const sources = sourceFiles('src').map((path) => ({ path, text: readFileSync(path, 'utf8') }));

const hasKey = (keys: Record<string, string>, key: string) =>
  key in keys || `${key}_one` in keys || `${key}_other` in keys;

describe('language detection', () => {
  it('uses German for German browsers and English otherwise', () => {
    expect(detectLanguage(null, ['de-DE', 'en'])).toBe('de');
    expect(detectLanguage(null, ['de-CH'])).toBe('de');
    expect(detectLanguage(null, ['en-US', 'de'])).toBe('en');
    expect(detectLanguage(null, ['fr-FR'])).toBe('en');
    expect(detectLanguage(null, [])).toBe('en');
  });

  it('prefers a stored manual choice', () => {
    expect(detectLanguage('en', ['de-DE'])).toBe('en');
    expect(detectLanguage('de', ['en-US'])).toBe('de');
    expect(detectLanguage('xx', ['de-DE'])).toBe('de');
  });
});

describe('translation resources', () => {
  it('German and English have exactly the same keys', () => {
    expect(Object.keys(deKeys).sort()).toEqual(Object.keys(enKeys).sort());
  });

  it('has no empty translations and matching placeholders', () => {
    for (const [key, value] of Object.entries(enKeys)) {
      expect(value.trim(), key).not.toBe('');
      expect(deKeys[key].trim(), key).not.toBe('');
      const vars = (s: string) => (s.match(/{{\s*\w+\s*}}/g) ?? []).sort();
      expect(vars(deKeys[key]), key).toEqual(vars(value));
    }
  });

  it('every literal translation key used in the UI exists', () => {
    const missing: string[] = [];
    for (const { path, text } of sources) {
      for (const [, key] of text.matchAll(/\bt\(\s*['"]([\w.]+)['"]/g)) {
        if (!hasKey(enKeys, key) || !hasKey(deKeys, key)) missing.push(`${path}: ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('covers every dynamic key (errors, scopes, activity actions, languages)', () => {
    const dynamic = [
      ...['de', 'en'].map((l) => `language.${l}`),
      ...['occurrence', 'future', 'series'].map((s) => `scope.${s}`),
      ...[
        'invalid_input',
        'end_before_start',
        'end_in_past',
        'too_long',
        'too_long_repeat',
        'too_far_ahead',
        'days_required',
        'until_before_start',
        'conflict',
        'invalid_code',
        'invalid_password',
        'rate_limited',
        'unauthorized',
        'forbidden',
        'not_found',
        'admin_not_configured',
        'apartment_has_spaces',
        'invalid_name',
        'network',
        'generic',
      ].map((c) => `errors.${c}`),
      ...[
        'schedule.created',
        'schedule.updated',
        'schedule.deleted',
        'schedule.paused',
        'schedule.resumed',
        'occurrence.modified',
        'occurrence.cancelled',
        'apartment.created',
        'apartment.renamed',
        'apartment.deleted',
        'apartment.code_reset',
        'space.assigned',
        'space.unassigned',
      ].map((a) => `activity.${a.replace('.', '_')}`),
    ];
    for (const key of dynamic) {
      expect(hasKey(enKeys, key), key).toBe(true);
      expect(hasKey(deKeys, key), key).toBe(true);
    }
  });

  it('server activity actions all have a translation', () => {
    const server = ['server/app.ts', 'server/schedules.ts'].map((p) => readFileSync(p, 'utf8')).join('\n');
    const actions = new Set([...server.matchAll(/action: '([\w.]+)'/g)].map((m) => m[1]));
    actions.add('schedule.paused');
    actions.add('schedule.resumed');
    actions.add('occurrence.cancelled');
    for (const action of actions) expect(hasKey(enKeys, `activity.${action.replace(/\./g, '_')}`), action).toBe(true);
  });

  it('has no unused keys', () => {
    const all = sources.map((s) => s.text).join('\n');
    const dynamicPrefixes = ['errors.', 'activity.', 'scope.', 'language.'];
    const unused = Object.keys(enKeys)
      .map((k) => k.replace(/_(zero|one|other)$/, ''))
      .filter((k) => !dynamicPrefixes.some((p) => k.startsWith(p)) && !all.includes(`'${k}'`));
    expect([...new Set(unused)]).toEqual([]);
  });

  it('components contain no hard-coded visible text', () => {
    const offenders: string[] = [];
    for (const { path, text } of sources.filter((s) => s.path.endsWith('.tsx'))) {
      // JSX text directly before a closing tag, e.g. <span>Text</span> (skips arrow functions / generics)
      for (const [, raw] of text.matchAll(/(?<!=)>\s*([^<>{}]*?[A-Za-zÄÖÜäöüß]{2,}[^<>{}]*?)\s*<\//g)) {
        if (/^[\s)]*$/.test(raw) || /=>|&&|\|\||\?|;|\(|=/.test(raw)) continue;
        offenders.push(`${path}: "${raw.trim()}"`);
      }
      // Literal user-facing attributes
      for (const [, attr, value] of text.matchAll(/\b(aria-label|title|placeholder|alt)="([^"]+)"/g)) {
        offenders.push(`${path}: ${attr}="${value}"`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
