const fs = require("fs");
const path = require("path");
const dir = __dirname;

const storage = fs.readFileSync(path.join(dir, "js", "storage.js"), "utf8");
const utils = fs.readFileSync(path.join(dir, "js", "utils.js"), "utf8");
let app = fs.readFileSync(path.join(dir, "app.js"), "utf8");

// app.js 末尾の起動処理は runApp 内でそのまま実行

const main = `/**
 * main.js - サウナログ（記録ページ）
 * index.html と同じフォルダに配置してください。
 */
(function () {
  "use strict";

${storage}

${utils}

function runApp() {
${app}
}

runApp();
})();
`;

fs.writeFileSync(path.join(dir, "main.js"), main, "utf8");
console.log("main.js created, size:", fs.statSync(path.join(dir, "main.js")).size);
