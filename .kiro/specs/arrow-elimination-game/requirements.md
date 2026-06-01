# Requirements Document

## Introduction

箭头消除迷宫游戏是一款消除类益智游戏。玩家在一个由多个带方向箭头组成的网格中，通过点击箭头使其沿指向方向飞出来消除箭头。如果箭头飞出路径上存在障碍物（墙壁或其他未消除的箭头），则消除失败并扣除生命值。游戏包含多关卡设计、倒计时机制和提示功能。

## Glossary

- **Game_Grid（游戏网格）**: 承载箭头的矩形网格区域，由行和列组成
- **Arrow（箭头）**: 网格中的基本游戏元素，具有固定朝向（上、下、左、右）
- **Direction（方向）**: 箭头的朝向，包括上、下、左、右四个方向
- **Obstacle（障碍物）**: 阻挡箭头飞出的物体，包括网格边界以外的墙壁和路径上其他未消除的箭头
- **Life（生命值）**: 玩家的剩余尝试次数，以红心图标表示，初始值为3
- **Timer（倒计时）**: 每个关卡的限制时间，倒计时结束时关卡失败
- **Hint（提示）**: 消耗闪电资源为玩家高亮显示一个可成功消除的箭头
- **Lightning（闪电）**: 使用提示功能所需的资源
- **Level（关卡）**: 游戏的独立阶段，每个关卡有不同的网格布局和难度
- **Elimination（消除）**: 箭头成功飞出网格的过程
- **Flight_Path（飞行路径）**: 箭头从当前位置沿朝向方向到达网格边界的直线路径

## Requirements

### Requirement 1: 游戏网格显示

**User Story:** 作为玩家，我希望看到一个清晰的箭头网格布局，以便我可以规划消除策略。

#### Acceptance Criteria

1. WHEN 关卡加载完成, THE Game_Grid SHALL 在屏幕中央区域显示一个由 Arrow 组成的矩形网格，网格列数为 8 至 10 列，行数为 10 至 12 行（具体尺寸由关卡配置决定）
2. THE Game_Grid SHALL 为每个 Arrow 以黑色线条样式显示方向指示，方向限定为上、下、左、右四种，且相邻方向（如上与右）在视觉上可被明确区分
3. THE Game_Grid SHALL 为每个网格单元格使用白色背景，网格外围区域使用浅蓝色背景
4. WHEN 一个 Arrow 被成功消除, THE Game_Grid SHALL 将该 Arrow 从网格中移除，该单元格显示为无箭头的白色空位
5. THE Game_Grid SHALL 在相邻单元格之间显示可见的分隔线，使玩家能够区分各个独立单元格

### Requirement 2: 箭头消除机制

**User Story:** 作为玩家，我希望通过点击箭头来消除它们，以便完成关卡目标。

#### Acceptance Criteria

1. WHEN 玩家点击一个 Arrow 且该 Arrow 的 Flight_Path 上不存在任何 Obstacle, THE Arrow SHALL 沿其 Direction 飞出 Game_Grid 并被消除
2. WHEN 玩家点击一个 Arrow 且该 Arrow 的 Flight_Path 上存在 Obstacle, THE Arrow SHALL 变为红色并闪烁以表示消除失败，红色状态持续1秒后恢复为原始外观
3. WHEN 一个 Arrow 成功消除, THE Game_Grid SHALL 播放该 Arrow 沿 Flight_Path 飞出的动画效果，动画持续时间为300至500毫秒
4. WHEN 一个 Arrow 消除失败, THE Life SHALL 减少1点
5. THE System SHALL 将 Arrow 的 Flight_Path 定义为：从该 Arrow 当前位置沿其 Direction 方向延伸至 Game_Grid 边界的所有连续单元格；Flight_Path 上的 Obstacle 定义为任何其他未被消除的 Arrow
6. WHILE 任意 Arrow 的飞出动画或失败动画正在播放, THE System SHALL 忽略玩家对所有 Arrow 的点击操作

### Requirement 3: 生命值系统

**User Story:** 作为玩家，我希望有有限的容错机会，以便游戏具有挑战性。

#### Acceptance Criteria

1. WHEN 关卡开始（包括重试）, THE Life SHALL 初始化为3点，并以3个红色填充心形图标从左到右显示在屏幕顶部，每个图标对应1点生命
2. WHEN Life 减少1点, THE Life SHALL 在500毫秒内将最右侧的红色填充心形图标变为灰色空心图标，剩余红色填充图标数量等于当前生命值
3. WHEN Life 降为0, THE Game_Grid SHALL 结束当前关卡并显示失败界面，失败界面包含关卡失败提示信息及重试选项
4. IF Life 已为0时触发生命减少事件, THEN THE Life SHALL 忽略该事件且生命值保持为0

### Requirement 4: 倒计时机制

**User Story:** 作为玩家，我希望有时间限制来增加游戏紧迫感和挑战性。

#### Acceptance Criteria

1. WHEN 玩家首次使用提示, THE Timer SHALL 从 3 分钟（180 秒）开始倒计时，并以 MM:SS 格式在屏幕上显示剩余时间
2. WHILE Timer 在运行中, THE Timer SHALL 每秒更新一次显示的剩余时间（MM:SS 格式，从 02:59 递减至 00:00）
3. WHEN Timer 倒计时结束（剩余时间显示为 00:00）, THE Game_Grid SHALL 结束当前关卡并显示失败结果
4. WHEN 所有 Arrow 被成功消除, THE Timer SHALL 停止倒计时
5. WHEN 设置页面弹出, THE Timer SHALL 暂停倒计时并保持当前剩余时间不变
6. WHEN 设置页面关闭, THE Timer SHALL 从暂停时的剩余时间恢复倒计时

### Requirement 5: 提示功能

**User Story:** 作为玩家，我希望在遇到困难时获得提示，以便我可以继续推进游戏。

#### Acceptance Criteria

1. WHILE Lightning 数量大于0, WHEN 玩家点击提示按钮, THE Hint SHALL 在正确消除顺序路径上揭示下一步，以灰色圆点标记下一个应消除的 Arrow
2. WHEN 玩家使用一次 Hint, THE Lightning SHALL 减少1个
3. WHILE Lightning 数量为0, THE Hint SHALL 将提示按钮显示为灰色不可点击状态
4. THE Hint SHALL 在屏幕底部以闪电图标显示剩余 Lightning 数量
5. WHEN 玩家成功消除了已被灰色圆点标记的 Arrow, THE Hint SHALL 移除该 Arrow 对应的灰色圆点标记
6. IF 当前局面不存在有效的消除路径, THEN THE Hint SHALL 禁用提示按钮

### Requirement 6: 关卡系统

**User Story:** 作为玩家，我希望有多个关卡可以挑战，以便游戏具有持续的可玩性。

#### Acceptance Criteria

1. THE Level SHALL 在屏幕顶部中央显示当前关卡编号，格式为"关卡: N"（N 为当前关卡编号，从 1 开始）
2. WHEN 当前关卡所有 Arrow 被成功消除, THE Level SHALL 显示关卡通过画面（持续 2 秒），然后加载下一关卡的网格布局
3. THE Level SHALL 随关卡编号递增而提升难度：第 1 关起始 Arrow 数量不少于 4 个，每升一关 Arrow 数量至少增加 1 个或 Timer 时长至少减少 5 秒，Timer 时长下限为 15 秒
4. WHEN Timer 到达零且仍有未消除的 Arrow, THE Level SHALL 显示关卡失败画面并提供"重新开始当前关卡"按钮
5. WHEN 玩家通过最终关卡, THE Level SHALL 显示游戏通关画面并提供"重新开始游戏"选项

### Requirement 7: 顶部界面布局

**User Story:** 作为玩家，我希望在屏幕顶部看到关键游戏信息和操作按钮，以便快速了解游戏状态。

#### Acceptance Criteria

1. THE Game_Grid SHALL 在屏幕顶部栏最左侧显示一个蓝色圆形设置按钮（齿轮图标）
2. THE Game_Grid SHALL 在屏幕顶部栏左侧区域、紧邻设置按钮右方显示一个蓝色椭圆形眼睛按钮
3. THE Game_Grid SHALL 在屏幕顶部栏中央区域显示当前关卡标题，格式为"关卡: N"，其中 N 为当前关卡编号
4. THE Game_Grid SHALL 在屏幕顶部栏中央区域、关卡标题下方或右侧显示 3 个红心图标，表示玩家剩余生命数
5. THE Game_Grid SHALL 在屏幕顶部栏显示倒计时计时器，格式为 MM:SS（分:秒），从关卡开始时的预设时间递减至 00:00
6. THE Game_Grid SHALL 在屏幕顶部栏最右侧显示一个菜单按钮（小圆点图标）

### Requirement 8: 飞行路径判定规则

**User Story:** 作为玩家，我希望游戏有清晰一致的消除判定规则，以便我可以做出准确的决策。

#### Acceptance Criteria

1. THE Flight_Path SHALL 定义为从 Arrow 当前位置沿其 Direction（上、下、左、右之一）方向，经过同一行（左/右方向）或同一列（上/下方向）的所有网格单元格，直至 Game_Grid 边界（含边界单元格）的直线路径
2. IF Flight_Path 上的所有网格单元格均为空（已消除或本身无 Arrow）, THEN THE System SHALL 判定该 Arrow 为可消除
3. IF Flight_Path 上存在至少一个未消除的 Arrow, THEN THE System SHALL 判定该 Arrow 为不可消除
4. THE Flight_Path SHALL 不包含 Arrow 自身所在的网格单元格
5. WHEN 玩家选择一个 Arrow 时, THE System SHALL 基于当前 Game_Grid 状态实时计算该 Arrow 的 Flight_Path 并判定其是否可消除
