import fs from 'fs';
import path from 'path';

export class TestDataManager {
  private dataStore: Record<string, any> = {};

  constructor(private baseDir: string = process.cwd()) {
    this.autoLoadDataDirectories();
  }

  /**
   * Automatically load JSON test data files from standard directories:
   * - `data/`
   * - `test-data/`
   * - `fixtures/data/`
   */
  private autoLoadDataDirectories(): void {
    const candidateDirs = ['data', 'test-data', path.join('fixtures', 'data')];

    for (const dirName of candidateDirs) {
      const fullPath = path.resolve(this.baseDir, dirName);
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
        const files = fs.readdirSync(fullPath);
        for (const file of files) {
          if (file.endsWith('.json')) {
            try {
              const fileContent = fs.readFileSync(path.join(fullPath, file), 'utf8');
              const key = path.basename(file, '.json');
              this.dataStore[key] = JSON.parse(fileContent);
            } catch {
              // Ignore invalid JSON during auto-discovery
            }
          }
        }
      }
    }
  }

  /**
   * Set or seed test data in memory
   */
  set(key: string, data: any): this {
    this.dataStore[key] = data;
    return this;
  }

  /**
   * Load test data from explicit JSON file
   */
  loadFile(filePath: string, namespace?: string): this {
    const fullPath = path.isAbsolute(filePath) ? filePath : path.resolve(this.baseDir, filePath);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const data = JSON.parse(content);
      const key = namespace || path.basename(fullPath, path.extname(fullPath));
      this.dataStore[key] = data;
    }
    return this;
  }

  /**
   * Get value by dot-notation path (e.g. `users.admin.email`, `products.0.price`)
   */
  get<T = any>(dotPath: string, defaultValue?: T): T {
    if (!dotPath) return this.dataStore as unknown as T;

    const parts = dotPath.split('.');
    let current: any = this.dataStore;

    for (const part of parts) {
      if (current === undefined || current === null) {
        return defaultValue !== undefined ? defaultValue : (undefined as unknown as T);
      }
      current = current[part];
    }

    return (current !== undefined ? current : defaultValue) as T;
  }

  /**
   * Get all registered test data
   */
  getAll(): Record<string, any> {
    return { ...this.dataStore };
  }
}
