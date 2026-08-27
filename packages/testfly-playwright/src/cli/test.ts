import { spawn } from 'child_process';
import { runClean } from './clean';

export interface TestCommandOptions {
  clean?: boolean;
  ui?: boolean;
  headed?: boolean;
  project?: string;
  grep?: string;
  tags?: string;
  reporter?: string;
  config?: string;
  workers?: string;
}

export async function runTestCommand(options: TestCommandOptions = {}): Promise<void> {
  if (options.clean) {
    await runClean();
  }

  const args: string[] = ['playwright', 'test'];

  if (options.ui) {
    args.push('--ui');
  }

  if (options.headed) {
    args.push('--headed');
  }

  if (options.project) {
    args.push('--project', options.project);
  }

  if (options.grep) {
    args.push('--grep', options.grep);
  } else if (options.tags) {
    args.push('--grep', options.tags);
  }

  if (options.reporter) {
    args.push('--reporter', options.reporter);
  }

  if (options.config) {
    args.push('--config', options.config);
  }

  if (options.workers) {
    args.push('--workers', options.workers);
  }

  console.log(`\n🚀 Generating BDD step files (bddgen)...`);
  
  // 1. Run bddgen first
  const bddgen = spawn('npx bddgen', {
    shell: true,
    stdio: 'inherit',
  });

  bddgen.on('close', (code) => {
    if (code !== 0) {
      process.exit(code || 1);
    }

    console.log(`\n🎭 Running Playwright tests: npx ${args.join(' ')}\n`);
    const pw = spawn(`npx ${args.join(' ')}`, {
      shell: true,
      stdio: 'inherit',
    });

    pw.on('close', (pwCode) => {
      process.exit(pwCode || 0);
    });
  });
}
