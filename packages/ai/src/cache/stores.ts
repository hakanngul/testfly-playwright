import { join, resolve } from 'node:path';
import { JsonFileCache } from './json-file-cache';
import type { ActionStep, ActionName, TargetSpec } from '../agent/plan';

/** Compiled & frozen plan (action-cache.json). @public */
export interface ActionCacheEntry {
  plan: ActionStep[];
  /** How the plan was produced. */
  source: 'llm' | 'knowledge';
  model?: string;
  /** YYYY-MM-DD */
  createdAt: string;
}

/** One learned element of a page (page-knowledge.json, "Auto-POM"). @public */
export interface KnownElement {
  name: string;
  target: TargetSpec;
  actionType: ActionName;
  synonyms: string[];
  /** Element that must be hovered/clicked first to reveal this one (menus, dropdowns). */
  parentTrigger?: { target: TargetSpec; action: 'hover' | 'click' };
}

/** Knowledge about one URL pattern. @public */
export interface PageKnowledgeEntry {
  elements: KnownElement[];
}

/** Healed locator (healed-locators.json). @public */
export interface HealedEntry {
  description: string;
  target: TargetSpec;
  confidence: number;
}

/** The three JSON caches that live in `<cacheDir>` — meant to be committed. @internal */
export class CacheStores {
  readonly actions: JsonFileCache<ActionCacheEntry>;
  readonly knowledge: JsonFileCache<PageKnowledgeEntry>;
  readonly healed: JsonFileCache<HealedEntry>;

  constructor(rootDir: string, cacheDir: string) {
    const dir = resolve(rootDir, cacheDir);
    this.actions = new JsonFileCache(join(dir, 'action-cache.json'));
    this.knowledge = new JsonFileCache(join(dir, 'page-knowledge.json'));
    this.healed = new JsonFileCache(join(dir, 'healed-locators.json'));
  }
}
