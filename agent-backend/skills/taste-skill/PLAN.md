# Taste Skill 实施计划

## 概述

本文档是 `skills/taste-skill/` 的实施路线图。taste-skill 是一个 Anti-Slop Frontend Skill，用于生成高质量落地页、作品集和改版设计，避免 LLM 通用的设计套路。

---

## 阶段一：基础设施（已完成）

- [x] 创建 `skills/taste-skill/` 根目录
- [x] 创建完整 `SKILL.md`（14 节 + 3 个附录，包含完整的 4.9、5.D、9.G、12 节）
- [x] 创建 Block Library 目录结构（9 个分类）
- [x] 创建 4 个初始 Block 文件

### Block Library 当前状态

```
blocks/
├── hero/
│   └── asymmetric-split.md
├── feature/
│   └── bento-grid.md
├── social-proof/
│   └── logo-wall.md
├── cta/
│   └── split-cta.md
├── pricing/         (待填充)
├── footer/          (待填充)
├── navigation/      (待填充)
├── portfolio/       (待填充)
└── transition/      (待填充)
```

---

## 阶段二：Block Library 扩展（高优先级）

对 Section 10 Reference Vocabulary 中每个模式，按 `blocks/<category>/<name>.md` 格式逐一实现。

### Hero（3 个缺失）

| Block | 优先级 | 描述 |
|---|---|---|
| `hero/editorial-manifesto.md` | 高 | 大型排版、无资产、海报风格 |
| `hero/kinetic-type.md` | 中 | 动画排版作为主要视觉 |
| `hero/curtain-reveal.md` | 低 | 滚动时如幕布般揭开 |
| `hero/video-media-mask.md` | 低 | 文字作为视频背景的遮罩 |

### Feature（3 个缺失）

| Block | 优先级 | 描述 |
|---|---|---|
| `feature/sticky-scroll-stack.md` | 高 | Section 5.A 的 GSAP 粘性堆叠实现 |
| `feature/zig-zag.md` | 高 | 交替图文行（限制 2 次） |
| `feature/split-screen-scroll.md` | 中 | 两半向相反方向滚动 |
| `feature/masonry.md` | 中 | 瀑布流布局 |

### Navigation（5 个缺失）

| Block | 优先级 | 描述 |
|---|---|---|
| `navigation/sticky-nav.md` | 高 | 标准固定导航栏（80px max） |
| `navigation/mega-menu.md` | 中 | 全屏下拉菜单 |
| `navigation/magnetic-button.md` | 低 | 光标吸引微物理 |
| `navigation/dynamic-island.md` | 低 | Morphing pill |
| `navigation/gooey-menu.md` | 低 | 粘性液体菜单 |

### Social-proof（2 个缺失）

| Block | 优先级 | 描述 |
|---|---|---|
| `social-proof/testimonial-card.md` | 高 | 评价卡片（≤ 3 行） |
| `social-proof/metrics-bar.md` | 中 | 数据指标行 |

### Portfolio（3 个缺失）

| Block | 优先级 | 描述 |
|---|---|---|
| `portfolio/project-grid.md` | 高 | 项目作品网格 |
| `portfolio/hover-image-trail.md` | 低 | 鼠标拖尾图片 |
| `portfolio/accordion-slider.md` | 低 | 手风琴图片滑块 |

### Pricing（1 个缺失）

| Block | 优先级 | 描述 |
|---|---|---|
| `pricing/three-tier.md` | 高 | 三栏定价表（非对称推荐） |

### CTA（1 个缺失）

| Block | 优先级 | 描述 |
|---|---|---|
| `cta/centered-cta.md` | 中 | 居中型 CTA（单列布局） |

### Footer（2 个缺失）

| Block | 优先级 | 描述 |
|---|---|---|
| `footer/standard-footer.md` | 高 | 标准页脚（链接列 + 品牌 + 法律） |
| `footer/compact-footer.md` | 低 | 紧凑页脚 |

### Transition（2 个缺失）

| Block | 优先级 | 描述 |
|---|---|---|
| `transition/horizontal-pan.md` | 高 | Section 5.B 的 GSAP 水平平移 |
| `transition/reveal-stagger.md` | 高 | Section 5.C 的 Motion 滚动揭示 |

**总计：24 个 block 文件，已完成 4 个，剩余 20 个**

---

## 阶段三：系统集成（中优先级）

### 3.1 shadcn/ui 组件集成

将项目中已使用的 shadcn/ui 组件与 Block Library 对齐：
- 创建 `blocks/__shared__/` 目录存放跨 block 共用组件（CtaButton、cn utility 等）
- 确保每个 block 使用的 shadcn/ui 组件都经过定制（半径、颜色、阴影、排版）

### 3.2 暗色模式令牌

- 为项目统一 `--accent`、`--surface`、`--text-primary` 等 CSS 变量
- 确保所有 block 使用同一套令牌，而非硬编码颜色

### 3.3 Pre-Flight Check 自动化

- 创建 `scripts/preflight-check.ts` 脚本，自动化 Section 14 的检查项
- 特别自动化：eyebrow 计数、em-dash 检测、CTA 意图重复检测

---

## 阶段四：质量保证（持续）

### 4.1 每次提交前

1. 运行 Section 14 Pre-Flight Check
2. 检查所有 block 的暗色模式渲染
3. 检查 `prefers-reduced-motion` 降级
4. 检查 `prefers-reduced-transparency` 降级（glassmorphism block）

### 4.2 每次发布前

1. Lighthouse 测试（LCP < 2.5s, CLS < 0.1, INP < 200ms）
2. WCAG AA 对比度审计
3. 移动端 375px-768px 布局审计
4. 检查 Section 9 全部 AI Tell 未出现

---

## 阶段五：维护规则

### 5.1 新增 Block 流程

1. 在 `blocks/<category>/<name>.md` 创建新文件
2. 按照 Section 12.B 写 Frontmatter
3. 按照 Section 12.C 写 8 个必需 Body Section
4. 确保 block 通过 Pre-Flight Check
5. 在 `PLAN.md` 中标记对应项目为 `[x]`

### 5.2 Skill 文档更新

- SKILL.md 新增内容后，同步更新 PLAN.md 的目录
- 设计系统版本更新后（如 Tailwind v5），更新 Section 2.A 和 Appendix A
- 新的 AI Tell 被发现后，添加到 Section 9

### 5.3 版本兼容性

| 依赖 | 当前版本 | 检查频率 |
|---|---|---|
| Tailwind CSS | v4 | 每季度 |
| Motion | latest (motion/react) | 每季度 |
| shadcn/ui | latest | 每季度 |
| GSAP | latest | 每半年 |
| @phosphor-icons/react | latest | 每半年 |

---

## 附录：Block 文件模板

新建 block 时复制以下结构：

```markdown
---
name: <dash-case-name>
category: <category>
dial_compatibility:
  variance: [min, max]
  motion: [min, max]
  density: [min, max]
when_to_use: "..."
not_for: "..."
stack: ["react", "next", "tailwind", "motion"]
---

## 1. Visual sketch

<!-- ASCII 或布局描述 -->

## 2. Props API

\`\`\`typescript
interface Props {}
\`\`\`

## 3. Code Sketch

\`\`\`tsx
// Server Component + Client motion island
\`\`\`

## 4. Mobile Fallback

## 5. Motion Variants

| MOTION_INTENSITY | Behaviour |
|---|---|
| 1-3 | Static |
| 4-7 | ... |
| 8-10 | ... |

Reduced-motion: ...

## 6. Dark-mode notes

## 7. Anti-patterns

## 8. References
```
