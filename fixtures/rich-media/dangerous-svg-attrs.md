# Dangerous SVG Attributes Fixture

用于验证危险 SVG 属性被终态 sanitize 剥除，且不引发 console error / pageerror。
fixture 自身仅作样例使用；任何执行入口必须保证这些属性被剔除或隔离。

<!-- onload 注入：期望在终态 sanitize 中移除 onload 属性 -->
<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40" onload="alert('svg-onload')">
  <rect x="0" y="0" width="80" height="40" fill="#ef4444"/>
  <text x="40" y="24" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#fff">danger</text>
</svg>

<!-- javascript: URL：期望 <a> 与 xlink:href 等被剥除 -->
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="80" height="40">
  <a xlink:href="javascript:alert('svg-xlink')" target="_blank">
    <rect x="0" y="0" width="80" height="40" fill="#0ea5e9"/>
    <text x="40" y="24" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#fff">xlink</text>
  </a>
</svg>

文档结束。