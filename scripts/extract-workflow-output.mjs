// 워크플로우 output 파일에서 candidates 배열만 뽑아 JSON 저장
import fs from 'fs';
import path from 'path';
const src = process.argv[2];
const dst = process.argv[3];
if (!src || !dst) { console.error('사용법: node extract-workflow-output.mjs <input> <output>'); process.exit(1); }
const raw = fs.readFileSync(src, 'utf-8');
// output 파일은 workflow 반환값 JSON. 앞뒤에 헤더가 없으면 그대로 파싱.
let parsed;
try { parsed = JSON.parse(raw); }
catch (e) {
  // 파일에 헤더나 텍스트가 붙어있으면 { 로 시작하는 JSON 부분만 추출
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first < 0 || last < 0) { console.error('JSON 부분을 찾지 못함'); process.exit(1); }
  parsed = JSON.parse(raw.slice(first, last + 1));
}
// output 파일 구조: { summary, agentCount, logs, result: {seedIncluded, ..., candidates} }
const inner = parsed.result || parsed;
const candidates = inner.candidates || inner;
if (!Array.isArray(candidates)) { console.error('candidates 배열 아님'); process.exit(1); }
fs.mkdirSync(path.dirname(dst), { recursive: true });
fs.writeFileSync(dst, JSON.stringify({ candidates }, null, 2), 'utf-8');
console.log(`✅ ${candidates.length}개 candidates 저장: ${dst}`);
console.log(`   validCount: ${parsed.validCount || '?'} · uniqueCount: ${parsed.uniqueCount || '?'} · rawCount: ${parsed.rawCandidateCount || '?'}`);
