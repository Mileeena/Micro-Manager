import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { execSync } from 'child_process';

export type SupportedLanguage = 'python' | 'typescript' | 'javascript' | 'unknown';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates and cleans code content written by AI agents.
 * - Strips markdown code fences (```python...```) automatically
 * - Optionally validates syntax for supported languages
 * - Returns cleaned content + any errors found
 */
export class CodeValidator {
  /**
   * Strip markdown code fences from content.
   * Handles: ```python\n...\n``` and ``` (bare) and leading/trailing whitespace.
   */
  stripMarkdownFences(content: string): string {
    // Match opening fence with optional language tag
    const fencePattern = /^```[\w]*\n?([\s\S]*?)\n?```\s*$/;
    const match = content.trim().match(fencePattern);
    if (match) {
      return match[1].trimEnd();
    }
    // Also strip if it starts with ``` but content has code blocks at the very start
    // Handle multiple code blocks (take first one)
    const multiMatch = content.match(/```[\w]*\n([\s\S]*?)```/);
    if (multiMatch && content.trim().startsWith('```')) {
      return multiMatch[1].trimEnd();
    }
    return content;
  }

  /**
   * Detect language from file extension.
   */
  detectLanguage(filePath: string): SupportedLanguage {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case '.py': return 'python';
      case '.ts':
      case '.tsx': return 'typescript';
      case '.js':
      case '.jsx':
      case '.mjs':
      case '.cjs': return 'javascript';
      default: return 'unknown';
    }
  }

  /**
   * Validate syntax of content for supported languages.
   * Uses CLI tools: python -m py_compile, node --check
   */
  async validateSyntax(content: string, filePath: string): Promise<ValidationResult> {
    const lang = this.detectLanguage(filePath);

    if (lang === 'unknown') {
      return { valid: true, errors: [] };
    }

    if (lang === 'python') {
      return this.validatePython(content, filePath);
    }

    if (lang === 'javascript' || lang === 'typescript') {
      return this.validateJavaScript(content, lang);
    }

    return { valid: true, errors: [] };
  }

  private validatePython(content: string, filePath: string): ValidationResult {
    const tmpFile = path.join(os.tmpdir(), `mm_validate_${Date.now()}.py`);
    try {
      fs.writeFileSync(tmpFile, content, 'utf-8');
      execSync(`python -m py_compile "${tmpFile}"`, {
        stdio: 'pipe',
        timeout: 10000,
      });
      return { valid: true, errors: [] };
    } catch (err: any) {
      const stderr = err.stderr?.toString() ?? String(err);
      // Clean up the temp file path from error message
      const cleaned = stderr.replace(tmpFile, filePath).trim();
      return { valid: false, errors: [cleaned || 'Python syntax error'] };
    } finally {
      try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
    }
  }

  private validateJavaScript(content: string, _lang: 'javascript' | 'typescript'): ValidationResult {
    // Use Node.js --check flag for basic syntax validation
    // Note: TypeScript-specific syntax will fail here — that's acceptable for basic validation
    const tmpFile = path.join(os.tmpdir(), `mm_validate_${Date.now()}.js`);
    try {
      // For TypeScript, strip type annotations for basic syntax check
      // This is a best-effort check — tsc would be more accurate but requires project context
      const contentForCheck = content
        .replace(/:\s*\w+(\[\])?(\s*\|[^=;,)>]+)*/g, '') // strip type annotations (basic)
        .replace(/<[A-Z][A-Za-z<>, ]*>/g, ''); // strip generics
      fs.writeFileSync(tmpFile, contentForCheck, 'utf-8');
      execSync(`node --check "${tmpFile}"`, {
        stdio: 'pipe',
        timeout: 10000,
      });
      return { valid: true, errors: [] };
    } catch (err: any) {
      const stderr = err.stderr?.toString() ?? String(err);
      const cleaned = stderr.replace(tmpFile, 'file').trim();
      // Don't fail on type-related errors for TS — just warn
      if (cleaned.includes('SyntaxError')) {
        return { valid: false, errors: [cleaned] };
      }
      // Other errors (module not found etc.) — pass as valid
      return { valid: true, errors: [] };
    } finally {
      try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
    }
  }

  /**
   * Full pipeline: strip markdown fences + validate syntax.
   * Returns cleaned content and any syntax errors.
   */
  async validateAndClean(content: string, filePath: string): Promise<{
    clean: string;
    errors: string[];
    wasStripped: boolean;
  }> {
    const stripped = this.stripMarkdownFences(content);
    const wasStripped = stripped !== content;
    const validation = await this.validateSyntax(stripped, filePath);
    return {
      clean: stripped,
      errors: validation.errors,
      wasStripped,
    };
  }
}

export const codeValidator = new CodeValidator();
