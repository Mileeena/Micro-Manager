import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CodeValidator } from '../services/CodeValidator';

// Mock child_process and fs before importing the module under test
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('fs', () => ({
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

import { execSync } from 'child_process';
import * as fs from 'fs';

describe('CodeValidator', () => {
  let validator: CodeValidator;

  beforeEach(() => {
    validator = new CodeValidator();
    vi.clearAllMocks();
  });

  // ─── stripMarkdownFences ────────────────────────────────────────────────────

  describe('stripMarkdownFences()', () => {
    it('removes python code fence wrapper', () => {
      const input = '```python\nprint("hello")\n```';
      const result = validator.stripMarkdownFences(input);
      expect(result).toBe('print("hello")');
    });

    it('removes typescript code fence wrapper', () => {
      const input = '```typescript\nconst x: number = 1;\n```';
      const result = validator.stripMarkdownFences(input);
      expect(result).toBe('const x: number = 1;');
    });

    it('removes bare code fence wrapper', () => {
      const input = '```\nsome code here\n```';
      const result = validator.stripMarkdownFences(input);
      expect(result).toBe('some code here');
    });

    it('leaves clean code untouched (no fences)', () => {
      const input = 'function hello() { return 42; }';
      const result = validator.stripMarkdownFences(input);
      expect(result).toBe('function hello() { return 42; }');
    });

    it('handles content without any fences', () => {
      const input = 'def greet():\n    print("hi")';
      const result = validator.stripMarkdownFences(input);
      expect(result).toBe('def greet():\n    print("hi")');
    });

    it('removes javascript code fence wrapper', () => {
      const input = '```javascript\nconsole.log("hello");\n```';
      const result = validator.stripMarkdownFences(input);
      expect(result).toBe('console.log("hello");');
    });

    it('handles multiline code inside fences', () => {
      const input = '```python\ndef foo():\n    return 1\n\ndef bar():\n    return 2\n```';
      const result = validator.stripMarkdownFences(input);
      expect(result).toContain('def foo()');
      expect(result).toContain('def bar()');
      expect(result).not.toContain('```');
    });

    it('strips leading/trailing whitespace around fenced content', () => {
      const input = '  ```python\ncode\n```  ';
      const result = validator.stripMarkdownFences(input);
      expect(result).toBe('code');
    });
  });

  // ─── detectLanguage ──────────────────────────────────────────────────────────

  describe('detectLanguage()', () => {
    it('returns python for .py files', () => {
      expect(validator.detectLanguage('script.py')).toBe('python');
      expect(validator.detectLanguage('/path/to/module.py')).toBe('python');
    });

    it('returns typescript for .ts files', () => {
      expect(validator.detectLanguage('index.ts')).toBe('typescript');
      expect(validator.detectLanguage('/src/app.ts')).toBe('typescript');
    });

    it('returns typescript for .tsx files', () => {
      expect(validator.detectLanguage('Component.tsx')).toBe('typescript');
      expect(validator.detectLanguage('/src/App.tsx')).toBe('typescript');
    });

    it('returns javascript for .js files', () => {
      expect(validator.detectLanguage('app.js')).toBe('javascript');
    });

    it('returns javascript for .jsx files', () => {
      expect(validator.detectLanguage('App.jsx')).toBe('javascript');
    });

    it('returns javascript for .mjs files', () => {
      expect(validator.detectLanguage('module.mjs')).toBe('javascript');
    });

    it('returns javascript for .cjs files', () => {
      expect(validator.detectLanguage('lib.cjs')).toBe('javascript');
    });

    it('returns unknown for .md files', () => {
      expect(validator.detectLanguage('README.md')).toBe('unknown');
    });

    it('returns unknown for .json files', () => {
      expect(validator.detectLanguage('package.json')).toBe('unknown');
    });

    it('returns unknown for .txt files', () => {
      expect(validator.detectLanguage('notes.txt')).toBe('unknown');
    });

    it('is case-insensitive for extensions', () => {
      expect(validator.detectLanguage('script.PY')).toBe('python');
      expect(validator.detectLanguage('index.TS')).toBe('typescript');
    });
  });

  // ─── validateSyntax ──────────────────────────────────────────────────────────

  describe('validateSyntax()', () => {
    it('returns valid:true for unknown language without calling execSync', async () => {
      const result = await validator.validateSyntax('content', 'file.md');
      expect(result).toEqual({ valid: true, errors: [] });
      expect(execSync).not.toHaveBeenCalled();
    });

    it('returns valid:true for JSON files', async () => {
      const result = await validator.validateSyntax('{"key":"val"}', 'data.json');
      expect(result).toEqual({ valid: true, errors: [] });
      expect(execSync).not.toHaveBeenCalled();
    });

    describe('python validation', () => {
      it('calls python -m py_compile for .py files', async () => {
        (execSync as any).mockReturnValue(undefined); // success

        const result = await validator.validateSyntax('x = 1', 'script.py');

        expect(execSync).toHaveBeenCalledWith(
          expect.stringContaining('python -m py_compile'),
          expect.any(Object)
        );
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('returns valid:false when py_compile throws (syntax error)', async () => {
        const fakeError: any = new Error('SyntaxError');
        fakeError.stderr = Buffer.from('SyntaxError: invalid syntax');
        (execSync as any).mockImplementation(() => { throw fakeError; });

        const result = await validator.validateSyntax('def foo(\n', 'script.py');

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
      });

      it('uses fallback error message when stderr is empty', async () => {
        const fakeError: any = new Error('unknown');
        fakeError.stderr = Buffer.from('');
        (execSync as any).mockImplementation(() => { throw fakeError; });

        const result = await validator.validateSyntax('bad code', 'script.py');
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toBe('Python syntax error');
      });
    });

    describe('javascript/typescript validation', () => {
      it('calls node --check for .js files', async () => {
        (execSync as any).mockReturnValue(undefined);

        const result = await validator.validateSyntax('const x = 1;', 'app.js');

        expect(execSync).toHaveBeenCalledWith(
          expect.stringContaining('node --check'),
          expect.any(Object)
        );
        expect(result.valid).toBe(true);
      });

      it('calls node --check for .ts files', async () => {
        (execSync as any).mockReturnValue(undefined);

        await validator.validateSyntax('const x: number = 1;', 'index.ts');

        expect(execSync).toHaveBeenCalledWith(
          expect.stringContaining('node --check'),
          expect.any(Object)
        );
      });

      it('returns valid:false when SyntaxError is in stderr', async () => {
        const fakeError: any = new Error('SyntaxError');
        fakeError.stderr = Buffer.from('SyntaxError: Unexpected token');
        (execSync as any).mockImplementation(() => { throw fakeError; });

        const result = await validator.validateSyntax('const = ;', 'app.js');
        expect(result.valid).toBe(false);
        expect(result.errors[0]).toContain('SyntaxError');
      });

      it('returns valid:true for non-SyntaxError failures (module not found etc)', async () => {
        const fakeError: any = new Error('Cannot find module');
        fakeError.stderr = Buffer.from('Error: Cannot find module');
        (execSync as any).mockImplementation(() => { throw fakeError; });

        const result = await validator.validateSyntax('import x from "missing";', 'app.js');
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });
  });

  // ─── validateAndClean ────────────────────────────────────────────────────────

  describe('validateAndClean()', () => {
    it('combines stripMarkdownFences and validateSyntax', async () => {
      (execSync as any).mockReturnValue(undefined);
      const input = '```python\nprint("hello")\n```';

      const result = await validator.validateAndClean(input, 'script.py');

      expect(result.clean).toBe('print("hello")');
      expect(result.wasStripped).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('sets wasStripped=true when fences were present', async () => {
      (execSync as any).mockReturnValue(undefined);
      const input = '```typescript\nconst x = 1;\n```';

      const result = await validator.validateAndClean(input, 'index.ts');

      expect(result.wasStripped).toBe(true);
    });

    it('sets wasStripped=false when no fences present', async () => {
      (execSync as any).mockReturnValue(undefined);
      const input = 'const x = 1;';

      const result = await validator.validateAndClean(input, 'index.ts');

      expect(result.wasStripped).toBe(false);
    });

    it('returns errors from syntax validation', async () => {
      const fakeError: any = new Error('SyntaxError');
      fakeError.stderr = Buffer.from('SyntaxError: Unexpected token');
      (execSync as any).mockImplementation(() => { throw fakeError; });

      const result = await validator.validateAndClean('const = ;', 'app.js');

      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('validates cleaned content (after fence stripping) not original', async () => {
      (execSync as any).mockReturnValue(undefined);
      const input = '```python\ndef f(): pass\n```';

      await validator.validateAndClean(input, 'script.py');

      // The content written to temp file should be stripped content
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.any(String),
        'def f(): pass',
        'utf-8'
      );
    });

    it('passes through for unknown language without calling execSync', async () => {
      const input = '# Just a markdown file';

      const result = await validator.validateAndClean(input, 'README.md');

      expect(result.clean).toBe('# Just a markdown file');
      expect(result.errors).toHaveLength(0);
      expect(execSync).not.toHaveBeenCalled();
    });
  });
});
