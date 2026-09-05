# Design System: Piano Wireframe & Grid System

## 1. Visual Theme & Atmosphere

Piano 的界面设计摒弃了传统移动网页的臃肿拟物和低密度卡片，采用一种**数字线框主义（Wireframe Aesthetics）与极简古典主义（Acoustic Archive）**交织的高级质感。整个应用作为落键钢琴练习的核心媒介，采用完全“无背景、无重圆角、以线筑型”的骨架设计，将视觉噪音降至零，从而让后方的代码花朵视频（ASCII Flower Background）与练习进度成为唯一焦点。

**Key Characteristics:**
- **极简极暗黑底** (`#030303` - 深邃的黑键底色)。
- **无显性实体容器（Borderless Concept）**：舍弃厚重的卡片实体背景，全面转为透明。卡片间仅用极其精细的水平一像素线进行重力划分，悬停时触发纤细光晕。
- **直角至上（Wired Geometry）**：完全摒弃无节制的大圆角 (`rounded-2xl` 等胶囊)，一律收拢为 **直角（Square Corner）或极窄圆角（Rounded-md/lg 用于功能性按键）**，复刻钢琴琴键、乐谱五线谱的骨骼感。
- **系统级线条引导（Wired Guidelines）**：所有功能块、操作按键均通过 `border-white/10` 细线勾勒，让网格与辅助线成为视觉引导的核心。
- **紧凑的高字距排版 (Micro-Typography)**：在按钮、状态条 and 微标中全量应用超高字距 (`tracking-widest` / `tracking-[0.2em]–[0.4em]`)，赋予中英文编排如同古典海报印刷的高级感。

---

## 2. Color Palette & Roles

### Background & Ambient
- **Absolute Dark** (`#030303`): 曲库最深处背景
- **Ambient Mask**: 线性黑渐变遮罩 (`from-black/95 via-black/45 to-transparent`)，用于为左侧内容提炼文字对比，右侧完全漏出 ASCII 视频

### Text
- **Foreground White** (`text-white/90`): 核心文字
- **Muted Gray** (`text-white/40`): 辅助、次要标签、路径和单位信息
- **De-emphasized** (`text-white/20`): 极简装饰线、未连接状态

### Accent & Semantic
- **Piano Highlight** (Tailwind `primary` / `#1ed760`): 仅在悬停、进度达到 100% 或关键激活态时作为点缀，绝不装饰性滥用
- **Acoustic Red** (`text-destructive`): 用于移除或警告提示

### Surfaces & Borders
- **Grid line** (`border-white/10`): 卡片、控制面板的单像素分割线
- **Action Border** (`border-white/20`): 按钮、边框

---

## 3. Typography Rules

### Hierarchy & Letter Spacing

| Role | Size | Weight | Letter Spacing | Notes |
|------|------|--------|----------------|-------|
| Hero Title | 60px–72px | 800 (Extrabold) | tracking-tighter | 紧凑抓眼的编辑大字 |
| Repertoire Header | 20px | 700 (Bold) | tracking-[0.2em] | 大写线框表头 |
| Section Subtitle | 14px | 500 (Medium) | tracking-wide | 诗意人文描述 |
| Card Title | 18px | 700 (Bold) | tracking-tight | 乐曲标题，多余截断 |
| Label Eyebrow | 10px | 700 (Bold) | tracking-[0.4em] | 极致间距，顶层装饰 |
| Action Button | 10px–11px | 700 (Bold) | tracking-widest | 全大写或全中文，清爽利落 |
| Meta Info | 11px | 500 (Medium) | tracking-wide | 本地路径及属性文字 |

---

## 4. Component Stylings

### Pieces Card (曲目卡片)
- **Geometry**: 无任何圆角 (`rounded-none`)。
- **Border & Background**: 移除卡片厚底。仅在下方留有一像素横线 `border-b border-white/10`，背景设为完全透明 `bg-transparent`。
- **Hover**: 悬停时整体平滑淡入 `hover:bg-white/[0.02]` 微弱光斑。
- **Inner elements**:
  - 乐曲标题：`text-white/95`，右侧并排超细字重难度标识。
  - 掌握进度条：极致纤细 `h-[2px] bg-white/5`，激活状态直接填满白色高亮。

### Interaction Buttons (操作按键)
- **Primary Line Action**: `border border-white/20 bg-transparent px-3 text-[10px] tracking-widest`，悬浮时 `hover:bg-white hover:text-black` 进行白透反转。
- **Icon Square Buttons**: 等宽方形线框按键 `size-8 border border-white/10 text-white/40`，彻底替代多余的圆形、黑透胶囊按键。

### Left Control Board (左侧琴房监听中心)
- **Geometry**: 方直角。
- **Grouping logic**: 拒绝零散的浮空按钮。将“连接监听”、“目录路径展示 (Listening Directories)”及“消息通知板”打包存放在一整个无背景直角卡片中。
- **Lines**: 所有内部模块通过 `border-t border-white/10` 单像素水平线整齐分割。

---

## 5. White Space & Alignment

### The Native Column Alignment (原生单列对齐)
- 彻底摒弃杂乱、宽窄不一的多列卡片瀑布流。
- 右半部分通过 `<aside>` 约束为精确宽度 `w-[360px]–[400px]`，并**严格靠拢在屏幕最右边缘**，使其变成桌面端应用原生的控制抽屉。
- 卡片内容、表头一律使用统一的 `px-2` 边缘距离，与下方的水平分割线形成严密的网格投影。

---

## 6. Do's and Don'ts

### Do
- 坚持**直角线框**的美学骨架，多用一像素水平细线分隔空间。
- 将操作按键做成线框反转按钮，缩小尺寸（`size-8`），保证列表等宽工整。
- 将相同模块的控制按钮 and 状态反馈紧密包纳在同一个卡片中。
- 把右侧列表压缩，严格贴紧视口最右边。

### Don't
- 绝对不要在列表卡片上使用厚重的实体黑色/灰色背景块。
- 绝对不要在精致的线框面板上滥用圆角 (`rounded-2xl`) 和圆形按钮。
- 绝对不要在窄屏卡片底部强塞两个带有长文字的按钮，导致其拥挤折行。
- 绝对不要在卡片右侧留出尴尬且没有道理的空白。

### Do
- Use near-black backgrounds (`#121212`–`#1f1f1f`) — depth through shade variation
- Apply Spotify Green (`#1ed760`) only for play controls, active states, and primary CTAs
- Use pill shape (500px–9999px) for all buttons — circular (50%) for play controls
- Apply uppercase + wide letter-spacing (1.4px–2px) on button labels
- Keep typography compact (10px–24px range) — this is an app, not a magazine
- Use heavy shadows (`0.3–0.5 opacity`) for elevated elements on dark backgrounds
- Let album art provide color — the UI itself is achromatic

### Don't
- Don't use Spotify Green decoratively or on backgrounds — it's functional only
- Don't use light backgrounds for primary surfaces — the dark immersion is core
- Don't skip the pill/circle geometry on buttons — square buttons break the identity
- Don't use thin/subtle shadows — on dark backgrounds, shadows need to be heavy to be visible
- Don't add additional brand colors — green + achromatic grays is the complete palette
- Don't use relaxed line-heights — Spotify's typography is compact and dense
- Don't expose raw gray borders — use shadow-based or inset borders instead

## 8. Responsive Behavior

### Breakpoints
| Name | Width | Key Changes |
|------|-------|-------------|
| Mobile Small | <425px | Compact mobile layout |
| Mobile | 425–576px | Standard mobile |
| Tablet | 576–768px | 2-column grid |
| Tablet Large | 768–896px | Expanded layout |
| Desktop Small | 896–1024px | Sidebar visible |
| Desktop | 1024–1280px | Full desktop layout |
| Large Desktop | >1280px | Expanded grid |

### Collapsing Strategy
- Sidebar: full → collapsed → hidden
- Album grid: 5 columns → 3 → 2 → 1
- Now-playing bar: maintained at all sizes
- Search: pill input maintained, width adjusts
- Navigation: sidebar → bottom bar on mobile

## 9. Agent Prompt Guide

### Quick Color Reference
- Background: Near Black (`#121212`)
- Surface: Dark Card (`#181818`)
- Text: White (`#ffffff`)
- Secondary text: Silver (`#b3b3b3`)
- Accent: Spotify Green (`#1ed760`)
- Border: `#4d4d4d`
- Error: Negative Red (`#f3727f`)

### Example Component Prompts
- "Create a dark card: #181818 background, 8px radius. Title at 16px SpotifyMixUI weight 700, white text. Subtitle at 14px weight 400, #b3b3b3. Shadow rgba(0,0,0,0.3) 0px 8px 8px on hover."
- "Design a pill button: #1f1f1f background, white text, 9999px radius, 8px 16px padding. 14px SpotifyMixUI weight 700, uppercase, letter-spacing 1.4px."
- "Build a circular play button: Spotify Green (#1ed760) background, #000000 icon, 50% radius, 12px padding."
- "Create search input: #1f1f1f background, white text, 500px radius, 12px 48px padding. Inset border: rgb(124,124,124) 0px 0px 0px 1px inset."
- "Design navigation sidebar: #121212 background. Active items: 14px weight 700, white. Inactive: 14px weight 400, #b3b3b3."

### Iteration Guide
1. Start with #121212 — everything lives in near-black darkness
2. Spotify Green for functional highlights only (play, active, CTA)
3. Pill everything — 500px for large, 9999px for small, 50% for circular
4. Uppercase + wide tracking on buttons — the systematic label voice
5. Heavy shadows (0.3–0.5 opacity) for elevation — light shadows are invisible on dark
6. Album art provides all the color — the UI stays achromatic
