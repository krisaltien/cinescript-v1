export function serializeJson(input) {
  return JSON.stringify(input).replace(/[<>&\u2028\u2029]/g, (character) =>
    `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

export function createHtml({ script, css, data, title = 'CineScript · 人物关系图谱' }) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${css.replace(/<\/style/gi, '<\\/style')}</style>
</head>
<body>
<div id="app"></div>
${data === undefined ? '' : `<script id="analysis-data" type="application/json">${serializeJson(data)}</script>`}
<script>${script.replace(/<\/script/gi, '<\\/script')}</script>
</body>
</html>\n`;
}
