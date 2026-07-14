# Multi-Line SVG Fixture

用于验证跨多行的内联 SVG 能被 source-aware 重组、不留空白条。

<svg xmlns="http://www.w3.org/2000/svg"
     width="120" height="40" viewBox="0 0 120 40">
  <rect
    x="0" y="0" width="120" height="40"
    fill="#4f46e5" rx="6" />
  <text
    x="60" y="24"
    text-anchor="middle"
    font-family="sans-serif"
    font-size="14"
    fill="#ffffff">
    multi-line svg
  </text>
</svg>

文档结束。