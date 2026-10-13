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
    if (filePath.endsWith('.csv')) {
      this.loadCsv(filePath, namespace);
    } else {
      this.loadJson(filePath, namespace);
    }
    return this;
  }

  /**
   * Load and parse JSON file into memory and return data
   */
  loadJson<T = any>(filePath: string, namespace?: string): T {
    const fullPath = path.isAbsolute(filePath) ? filePath : path.resolve(this.baseDir, filePath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Test data file not found: ${fullPath}`);
    }
    const content = fs.readFileSync(fullPath, 'utf8');
    const data = JSON.parse(content);
    const key = namespace || path.basename(fullPath, path.extname(fullPath));
    this.dataStore[key] = data;
    return data as T;
  }

  /**
   * Load and parse CSV file into array of records and return data
   */
  loadCsv<T = Record<string, string>>(filePath: string, namespace?: string): T[] {
    const fullPath = path.isAbsolute(filePath) ? filePath : path.resolve(this.baseDir, filePath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Test data CSV file not found: ${fullPath}`);
    }
    const content = fs.readFileSync(fullPath, 'utf8').trim();
    const [headerLine, ...lines] = content.split(/\r?\n/).filter(Boolean);
    if (!headerLine) return [];
    const headers = headerLine.split(',').map((h) => h.trim());
    const rows = lines.map((line) => {
      const values = line.split(',').map((v) => v.trim());
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx] ?? '';
      });
      return row as T;
    });
    const key = namespace || path.basename(fullPath, path.extname(fullPath));
    this.dataStore[key] = rows;
    return rows;
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
