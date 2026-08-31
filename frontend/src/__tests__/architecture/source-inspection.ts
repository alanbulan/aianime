// Copyright (c) 2026 AI anime
import * as ts from "typescript/unstable/ast";

export function scanImportSpecifiers(
  source: string,
  options: { includeDynamicImports: boolean; jsx: boolean },
): string[] {
  const scanner = ts.createScanner(
    true,
    options.jsx ? ts.LanguageVariant.JSX : ts.LanguageVariant.Standard,
    source,
  );
  const imports: string[] = [];
  let previous = ts.SyntaxKind.Unknown;
  let beforePrevious = ts.SyntaxKind.Unknown;
  let thirdPrevious = ts.SyntaxKind.Unknown;
  let previousEnd = -1;
  for (
    let token = scanner.scan();
    token !== ts.SyntaxKind.EndOfFile;
    token = scanner.scan()
  ) {
    const tokenEnd = scanner.getTokenEnd();
    if (tokenEnd <= previousEnd) {
      const nextOffset = previousEnd + 1;
      scanner.resetTokenState(nextOffset);
      previousEnd = nextOffset;
      continue;
    }
    previousEnd = tokenEnd;
    const staticImport =
      previous === ts.SyntaxKind.ImportKeyword ||
      previous === ts.SyntaxKind.FromKeyword;
    const dynamicImport =
      options.includeDynamicImports &&
      previous === ts.SyntaxKind.OpenParenToken &&
      beforePrevious === ts.SyntaxKind.ImportKeyword &&
      thirdPrevious !== ts.SyntaxKind.TypeOfKeyword;
    if (
      token === ts.SyntaxKind.StringLiteral &&
      (staticImport || dynamicImport)
    ) {
      imports.push(scanner.getTokenValue());
    }
    thirdPrevious = beforePrevious;
    beforePrevious = previous;
    previous = token;
  }
  return imports;
}

interface SourceToken {
  kind: ts.SyntaxKind;
  position: number;
  text: string;
}

function sourceTokens(source: string): SourceToken[] {
  const scanner = ts.createScanner(true, ts.LanguageVariant.JSX, source);
  const tokens: SourceToken[] = [];
  let previousEnd = -1;
  for (
    let kind = scanner.scan();
    kind !== ts.SyntaxKind.EndOfFile;
    kind = scanner.scan()
  ) {
    const tokenEnd = scanner.getTokenEnd();
    if (tokenEnd <= previousEnd) {
      const nextOffset = previousEnd + 1;
      scanner.resetTokenState(nextOffset);
      previousEnd = nextOffset;
      continue;
    }
    tokens.push({
      kind,
      position: scanner.getTokenStart(),
      text: scanner.getTokenText(),
    });
    previousEnd = tokenEnd;
  }
  return tokens;
}

export function scanNativeTitleAttributePositions(
  source: string,
  componentPrimitives: ReadonlySet<string>,
): number[] {
  const tokens = sourceTokens(source);
  const positions: number[] = [];
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const candidate = tokens[index];
    const nextKind = tokens[index + 1]?.kind;
    if (
      candidate?.kind !== ts.SyntaxKind.Identifier ||
      candidate.text !== "title" ||
      tokens[index - 1]?.kind === ts.SyntaxKind.MinusToken ||
      tokens[index - 1]?.kind === ts.SyntaxKind.ColonToken ||
      (nextKind !== ts.SyntaxKind.EqualsToken &&
        nextKind !== ts.SyntaxKind.SlashToken &&
        nextKind !== ts.SyntaxKind.GreaterThanToken)
    ) {
      continue;
    }
    let braceDepth = 0;
    let bracketDepth = 0;
    let parenthesisDepth = 0;
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      const token = tokens[cursor];
      if (!token) break;
      if (token.kind === ts.SyntaxKind.CloseBraceToken) {
        braceDepth += 1;
        continue;
      }
      if (token.kind === ts.SyntaxKind.CloseBracketToken) {
        bracketDepth += 1;
        continue;
      }
      if (token.kind === ts.SyntaxKind.CloseParenToken) {
        parenthesisDepth += 1;
        continue;
      }
      if (token.kind === ts.SyntaxKind.OpenBraceToken) {
        if (braceDepth === 0) break;
        braceDepth -= 1;
        continue;
      }
      if (token.kind === ts.SyntaxKind.OpenBracketToken) {
        if (bracketDepth === 0) break;
        bracketDepth -= 1;
        continue;
      }
      if (token.kind === ts.SyntaxKind.OpenParenToken) {
        if (parenthesisDepth === 0) break;
        parenthesisDepth -= 1;
        continue;
      }
      if (braceDepth > 0 || bracketDepth > 0 || parenthesisDepth > 0) {
        continue;
      }
      if (token.kind === ts.SyntaxKind.GreaterThanToken) break;
      if (token.kind !== ts.SyntaxKind.LessThanToken) continue;

      const firstTagToken = tokens[cursor + 1];
      if (!firstTagToken || firstTagToken.kind !== ts.SyntaxKind.Identifier) {
        break;
      }
      let tagName = firstTagToken.text;
      let tagCursor = cursor + 2;
      while (
        tokens[tagCursor]?.kind === ts.SyntaxKind.DotToken &&
        tokens[tagCursor + 1]?.kind === ts.SyntaxKind.Identifier
      ) {
        tagName += `.${tokens[tagCursor + 1]?.text ?? ""}`;
        tagCursor += 2;
      }
      if (index < tagCursor) break;
      if (
        tagName[0] === tagName[0]?.toLowerCase() ||
        componentPrimitives.has(tagName)
      ) {
        positions.push(candidate.position);
      }
      break;
    }
  }
  return positions;
}
