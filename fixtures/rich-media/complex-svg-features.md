# Complex SVG Features Fixture

用于验证 `defs / marker / clipPath / use / style / foreignObject` 的 surface 契约：
主编辑器保矢量，HTML 复制 / Word 导出按 canonical 子集栅格化或保留。

<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80" viewBox="0 0 200 80">
  <defs>
    <linearGradient id="g1" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#10b981"/>
      <stop offset="100%" stop-color="#0ea5e9"/>
    </linearGradient>
    <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#111827"/>
    </marker>
    <clipPath id="clip1">
      <rect x="0" y="0" width="200" height="60" rx="8"/>
    </clipPath>
  </defs>
  <style>
    .lbl { font: 14px sans-serif; fill: #fff; }
  </style>
  <rect x="0" y="0" width="200" height="80" fill="url(#g1)" clip-path="url(#clip1)"/>
  <line x1="20" y1="50" x2="180" y2="50" stroke="#111827" stroke-width="2" marker-end="url(#arrow)"/>
  <use href="#g1" x="0" y="0"/>
  <foreignObject x="40" y="10" width="120" height="30">
    <div xmlns="http://www.w3.org/1999/xhtml" class="lbl">complex svg features</div>
  </foreignObject>
</svg>

文档结束。