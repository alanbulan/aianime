import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { API } from "typescript/unstable/sync";
import { createVirtualFileSystem } from "typescript/unstable/fs";
import { createScanner, LanguageVariant, SyntaxKind } from "typescript/unstable/ast";

const literalKinds = new Set([
  SyntaxKind.StringLiteral,
  SyntaxKind.NoSubstitutionTemplateLiteral,
  SyntaxKind.TemplateHead,
  SyntaxKind.TemplateMiddle,
  SyntaxKind.TemplateTail,
  SyntaxKind.RegularExpressionLiteral,
  SyntaxKind.JsxText,
  SyntaxKind.JsxTextAllWhiteSpaces,
]);

function blankComments(text) {
  const scanner = createScanner(false, LanguageVariant.Standard, text);
  const parts = [];
  let cursor = 0;
  for (let kind = scanner.scan(); kind !== SyntaxKind.EndOfFile; kind = scanner.scan()) {
    if (kind !== SyntaxKind.SingleLineCommentTrivia && kind !== SyntaxKind.MultiLineCommentTrivia) continue;
    const start = scanner.getTokenStart();
    const end = scanner.getTokenEnd();
    parts.push(text.slice(cursor, start), text.slice(start, end).replace(/[^\r\n]/g, " "));
    cursor = end;
  }
  return parts.join("") + text.slice(cursor);
}

// 使用锁定的 TypeScript 解析器确定字面量边界，避免把 URL、正则、模板和 JSX 内容当成注释。
export function sourcesWithoutComments(entries) {
  if (!entries.length) return [];
  const root = resolve("__ai_anime_comment_scan__").replaceAll("\\", "/");
  const config = `${root}/tsconfig.json`;
  const names = entries.map((entry, index) => {
    if (![".ts", ".tsx"].includes(entry.extension) || typeof entry.source !== "string") {
      throw new Error("Expected TypeScript source and .ts/.tsx extension");
    }
    return `${root}/input-${index}${entry.extension}`;
  });
  const files = Object.fromEntries(names.map((name, index) => [name, entries[index].source]));
  files[config] = JSON.stringify({
    compilerOptions: { noLib: true, noResolve: true, jsx: "preserve" },
    files: names,
  });
  const api = new API({ cwd: root, fs: createVirtualFileSystem(files) });
  let snapshot;
  try {
    snapshot = api.updateSnapshot({ openProjects: [config] });
    const program = snapshot.getProject(config)?.program;
    if (!program) throw new Error("Cannot initialize TypeScript comment scanner");
    return names.map((name) => {
      if (program.getSyntacticDiagnostics(name).length) {
        throw new Error(`Cannot scan syntactically invalid TypeScript: ${name}`);
      }
      const source = program.getSourceFile(name);
      if (!source) throw new Error(`Cannot parse TypeScript: ${name}`);
      const literals = [];
      function visit(node) {
        if (literalKinds.has(node.kind)) {
          const start = node.kind === SyntaxKind.JsxText || node.kind === SyntaxKind.JsxTextAllWhiteSpaces
            ? node.pos : node.getStart(source);
          literals.push([start, node.end]);
          return;
        }
        node.forEachChild(visit);
      }
      visit(source);
      literals.sort((a, b) => a[0] - b[0]);
      const parts = [];
      let cursor = 0;
      for (const [start, end] of literals) {
        parts.push(blankComments(source.text.slice(cursor, start)), source.text.slice(start, end));
        cursor = end;
      }
      return parts.join("") + blankComments(source.text.slice(cursor));
    });
  } finally {
    snapshot?.dispose();
    api.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(JSON.stringify(sourcesWithoutComments(JSON.parse(readFileSync(0, "utf8")))));
}
