import fs from 'node:fs';
import path from 'node:path';
import { LocatorParser } from '../locators/LocatorParser';
import { LocatorTypeGen } from '../locators/LocatorTypeGen';
import { log, warn } from './util';

/** Options of `testfly locators`. @internal */
export interface LocatorsCliOptions {
  dir?: string;
  output?: string;
  cwd?: string;
}

/** Generate typed locator keys (`locators/index.d.ts`). Returns the exit code. @internal */
export async function runLocatorsCommand(options: LocatorsCliOptions = {}): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const dir = path.resolve(cwd, options.dir ?? 'locators');
  const output = path.resolve(cwd, options.output ?? path.join(options.dir ?? 'locators', 'index.d.ts'));

  if (!fs.existsSync(dir)) {
    warn(`${path.relative(cwd, dir)}/ not found. Create locators/<page>.yaml first.`);
    return 1;
  }
  const items = LocatorParser.parseDirectory(dir);
  log(`Found ${items.length} locator(s) in ${path.relative(cwd, dir)}/`);
  const result = LocatorTypeGen.generateToFile(dir, output);
  log(`Wrote ${path.relative(cwd, result.outputPath)}`);
  return 0;
}
