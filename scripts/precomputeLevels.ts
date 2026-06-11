/**
 * 预计算所有关卡数据并保存为 JSON。
 * 运行: npx tsx scripts/precomputeLevels.ts
 * 输出: src/levelData.json
 *
 * 关卡生成是确定性的（固定种子），所以只需预计算一次。
 * 运行时直接加载 JSON，实现毫秒级加载。
 */
import { getLevel, levelCount } from '../src/levels';
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const count = levelCount();
const levels = [];

console.log(`开始预计算 ${count} 个关卡...`);
for (let i = 0; i < count; i++) {
  const start = Date.now();
  const level = getLevel(i);
  const ms = Date.now() - start;
  console.log(`  关卡 ${level.id}: ${ms}ms, ${level.pieces.length} 棋子`);
  levels.push(level);
}

const outPath = join(__dirname, '..', 'src', 'levelData.json');
writeFileSync(outPath, JSON.stringify(levels));
console.log(`\n已保存到 ${outPath} (${(Buffer.byteLength(JSON.stringify(levels)) / 1024).toFixed(1)} KB)`);
