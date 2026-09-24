import assert from "node:assert/strict";
import test from "node:test";
import { sourcesWithoutComments } from "../../frontend/scripts/source-without-comments.mjs";

test("architecture scanner ignores comments and preserves code, URLs, escapes, templates, regex and JSX", () => {
  const sources = [
    { extension: ".ts", source: String.raw`// seedance attribution
/* seedream attribution */
const qwen = "https://openai.example/path";
const escaped = "中文😀 \\\" // deepseek";
const pattern = /https?:\/\/minimax\/[/*]/;
const template = \`https://gemini/\${1 /* seedance */}/qwen/\${\`nested // openai\`}\`;
` .replaceAll("\\`", "`").replaceAll("\\${", "${") },
    { extension: ".tsx", source: String.raw`// seedance attribution
const view = <div title="/* openai */">https://qwen/* gemini */{
  /* seedream attribution */ "// deepseek"
}{/* seedance attribution */}<span>minimax</span></div>;
` },
  ];
  const stripped = sourcesWithoutComments(sources);
  for (const [index, source] of stripped.entries()) {
    assert.doesNotMatch(source, /seedance|seedream/);
    for (const name of ["openai", "qwen", "gemini", "deepseek", "minimax"]) assert.ok(source.includes(name), name);
    assert.equal(source.length, sources[index].source.length);
    assert.equal(source.split("\n").length, sources[index].source.split("\n").length);
  }
  assert.ok(stripped[0].includes('const qwen = "https://openai.example/path"'));
  assert.ok(stripped[1].includes("https://qwen/* gemini */"));
});

test("architecture scanner rejects malformed source instead of silently omitting it", () => {
  assert.throws(() => sourcesWithoutComments([{ extension: ".ts", source: 'const provider = "openai' }]), /invalid TypeScript/);
});

test("division, nested template expressions and trailing comments keep provider literals visible", () => {
  const source = [
    'const ratio = 12 / 3 /* seedance */ / 2; // seedream',
    'const text = `first ${`nested ${1 /* seedance */} https://openai`} / ${2 // seedream',
    '} /* qwen */`; // seedance',
    'const regex = /[/*]deepseek[/*]/; /* seedream */',
  ].join("\n");
  const [stripped] = sourcesWithoutComments([{ extension: ".ts", source }]);
  assert.doesNotMatch(stripped, /seedance|seedream/);
  assert.match(stripped, /12 \/ 3\s+\/ 2/);
  for (const name of ["openai", "qwen", "deepseek"]) assert.ok(stripped.includes(name));
  assert.equal(stripped.length, source.length);
});
