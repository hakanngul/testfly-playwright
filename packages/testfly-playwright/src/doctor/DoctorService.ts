import fs from 'fs';
import path from 'path';
import { StepScanner } from '../scanner/StepScanner';

export interface DoctorCheckItem {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  solution?: string;
}

export class DoctorService {
  /**
   * Run comprehensive health check on TestFly project environment
   */
  static async diagnose(targetDir: string = process.cwd()): Promise<DoctorCheckItem[]> {
    const checks: DoctorCheckItem[] = [];

    // 1. Node.js Version Check
    const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
    if (nodeMajor >= 18) {
      checks.push({
        name: 'Node.js Runtime',
        status: 'pass',
        message: `v${process.version} (Uyumlu, >= 18)`,
      });
    } else {
      checks.push({
        name: 'Node.js Runtime',
        status: 'fail',
        message: `v${process.version} (Eski sürüm)`,
        solution: 'Node.js sürümünüzü v18 veya üstüne güncelleyin: https://nodejs.org',
      });
    }

    // 2. Playwright Config Check
    const pwConfigPath = path.join(targetDir, 'playwright.config.ts');
    if (fs.existsSync(pwConfigPath)) {
      checks.push({
        name: 'Playwright Config',
        status: 'pass',
        message: 'playwright.config.ts mevcut',
      });
    } else {
      checks.push({
        name: 'Playwright Config',
        status: 'fail',
        message: 'playwright.config.ts bulunamadı',
        solution: 'Projeyi başlatmak için: npx testfly init',
      });
    }

    // 3. TestFly Config Check
    const tfConfigPath = path.join(targetDir, 'testfly.config.ts');
    if (fs.existsSync(tfConfigPath)) {
      checks.push({
        name: 'TestFly Config',
        status: 'pass',
        message: 'testfly.config.ts mevcut',
      });
    } else {
      checks.push({
        name: 'TestFly Config',
        status: 'warn',
        message: 'testfly.config.ts bulunamadı (Varsayılan ayarlar kullanılacak)',
        solution: 'Özelleştirilmiş ayarlar için: npx testfly init',
      });
    }

    // 4. Features & Steps Directories
    const featuresDir = path.join(targetDir, 'features');
    const stepsDir = path.join(targetDir, 'steps');

    if (fs.existsSync(featuresDir) && fs.existsSync(stepsDir)) {
      const featureFiles = fs.readdirSync(featuresDir).filter((f) => f.endsWith('.feature'));
      const stepFiles = fs.readdirSync(stepsDir).filter((f) => f.endsWith('.ts'));

      checks.push({
        name: 'BDD Structure',
        status: 'pass',
        message: `${featureFiles.length} feature dosyası, ${stepFiles.length} step dosyası mevcut`,
      });

      // 5. Unmapped steps check
      const unmapped = StepScanner.findUnmappedSteps(featuresDir, stepsDir);
      if (unmapped.length === 0) {
        checks.push({
          name: 'BDD Step Mapping',
          status: 'pass',
          message: 'Tüm BDD adımları step tanımları ile eşleşiyor',
        });
      } else {
        checks.push({
          name: 'BDD Step Mapping',
          status: 'warn',
          message: `${unmapped.length} adet eksik/eşleşmeyen step adımı var`,
          solution: 'Eksik step iskeletlerini oluşturmak için: npx testfly steps --scaffold',
        });
      }
    } else {
      checks.push({
        name: 'BDD Structure',
        status: 'warn',
        message: 'features/ veya steps/ klasörleri eksik',
        solution: 'npx testfly init ile BDD klasörlerini oluşturun',
      });
    }

    // 6. Agentic Workflow Support (AGENTS.md & .agents/skills)
    const agentsMdPath = path.join(targetDir, 'AGENTS.md');
    const skillPath = path.join(targetDir, '.agents', 'skills', 'testfly-bdd', 'SKILL.md');

    if (fs.existsSync(agentsMdPath) && fs.existsSync(skillPath)) {
      checks.push({
        name: 'Agentic BDD Guidelines',
        status: 'pass',
        message: 'AGENTS.md ve testfly-bdd skill kurulu',
      });
    } else {
      checks.push({
        name: 'Agentic BDD Guidelines',
        status: 'warn',
        message: 'Agent kılavuzu (AGENTS.md) eksik',
        solution: 'npx testfly init ile agent kılavuzunu kurun',
      });
    }

    return checks;
  }
}
