import { DoctorService } from './doctor/DoctorService';


export interface DoctorOptions {
  cwd?: string;
}

export async function runDoctor(options: DoctorOptions = {}): Promise<void> {
  const targetDir = options.cwd || process.cwd();
  console.log(`\n🩺 TestFly Doctor — Proje & Ortam Teşhisi Başlatılıyor...\n`);

  const checks = await DoctorService.diagnose(targetDir);

  let hasErrors = false;
  let hasWarnings = false;

  for (const check of checks) {
    let icon = '✅';
    if (check.status === 'warn') {
      icon = '⚠️ ';
      hasWarnings = true;
    } else if (check.status === 'fail') {
      icon = '❌';
      hasErrors = true;
    }

    console.log(`  ${icon} [${check.name}]: ${check.message}`);
    if (check.solution) {
      console.log(`     👉 Çözüm: ${check.solution}`);
    }
  }

  console.log(`\n------------------------------------------------------------`);
  if (!hasErrors && !hasWarnings) {
    console.log(`🎉 Tebrikler! TestFly ortamınız mükemmel durumda ve teste hazır.\n`);
  } else if (!hasErrors && hasWarnings) {
    console.log(`✨ Ortamınız çalışmaya hazır, ancak yukarıdaki uyarıları inceleyebilirsiniz.\n`);
  } else {
    console.log(`❌ Bazı kritik kontroller başarısız oldu. Lütfen yukarıdaki çözümleri uygulayın.\n`);
  }
}
