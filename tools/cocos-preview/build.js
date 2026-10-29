/**
 * 重新编译 Cocos 脚本到 tools/cocos-preview/out（给预览器用）。
 * 用法：node tools/cocos-preview/build.js
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const TSC = 'C:/ProgramData/cocos/editors/Creator/3.8.8/resources/app.asar.unpacked/node_modules/typescript/bin/tsc';
const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(__dirname, 'out');

fs.rmSync(OUT, { recursive: true, force: true });
execFileSync(process.execPath, [TSC, '-p', path.join(__dirname, 'tsconfig.json')], { stdio: 'inherit' });

let n = 0;
for (const f of fs.readdirSync(OUT)) {
    if (!f.endsWith('.js')) continue;
    const p = path.join(OUT, f);
    let s = fs.readFileSync(p, 'utf8');
    s = s.replace(/from '(\.\/[^']+)'/g, (m, a) => (a.endsWith('.js') ? m : `from '${a}.js'`));
    fs.writeFileSync(p, s);
    n++;
}
console.log(`built ${n} modules -> ${path.relative(ROOT, OUT)}`);
