# Animated SVG Fixture

用于验证 SMIL 动态 SVG（`<animate>` / `<animateTransform>`）在主 IR 与公众号导出链路保留动画并真实推进。

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60" width="240" height="120">
  <rect width="120" height="60" fill="#EBF0F4"/>
  <g id="smil-fade" opacity="0">
    <text x="10" y="25" font-size="12" fill="#176D61">动态 SVG</text>
    <animate attributeName="opacity" begin="0s" dur="2s" repeatCount="indefinite" calcMode="discrete" values="0;1;0" keyTimes="0;0.5;1"/>
  </g>
  <rect id="smil-rect" x="0" y="44" width="12" height="8" fill="#8F5148">
    <animateTransform attributeName="transform" begin="0s" dur="2s" repeatCount="indefinite" calcMode="linear" values="0 0;100 0;0 0" keyTimes="0;0.5;1" type="translate"/>
  </rect>
  <circle id="smil-motion" cx="0" cy="34" r="3" fill="#176D61">
    <animateMotion path="M0 0 L100 0" keyTimes="0;0.5;1" keyPoints="0;0.2;1" calcMode="linear" dur="2s" repeatCount="indefinite"/>
  </circle>
</svg>

文档结束。
