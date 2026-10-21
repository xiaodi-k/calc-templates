# 协作约定

这个仓库挂着 GitHub Pages：**main 分支上有什么，线上页面就是什么**。所以 main 不能直接推，任何改动走「分支 → Pull Request → review → 合并」。

## 三条路，挑你顺手的那条

### 1. 只想改几行（推荐给不写代码的同事）

在 GitHub 网页上打开文件 → 右上角铅笔 **Edit** → 改完往下滚，**勾 "Create a new branch for this commit"**（默认就有） → **Propose changes**。

这样系统会自动建分支并开 PR，全程不用装 git、不用敲命令，也不用担心改到 main。

### 2. 图形界面（推荐给愿意装一个工具的同事）

GitHub Desktop：改完后它会提示 **Create branch** → **Publish branch** → **Create Pull Request**。同一个傻瓜流程。

### 3. 命令行

```bash
git switch main && git pull            # 先拉最新，别在旧版本上改
git switch -c mullion/改了什么          # 分支名：模板名/短说明
# ……改文件……
git add -A
git commit                             # 主题一行，空一行，再写说明（见下）
git push -u origin mullion/改了什么
gh pr create --fill                    # 或者去网页点 "Compare & pull request"
```

## 提交信息的写法

沿用现在的习惯，**一行主题 + 空行 + 说明**：

```
mullion：立柱倾角 α（高级）+ 重力/活荷载分量 + 采光顶判定

- 第一层说明：为什么改
- 第二层说明：改了哪几处、边界在哪
- 回归：默认工况 σ=135.6 MPa、d=18.05 mm 与 Excel 逐位一致
```

## 合并方式

一律 **Squash and merge**（合并时把多次提交压成一个），PR 合并后 **Delete branch**。这样 main 的历史是一条直线，出问题时好回滚。

## 改 `mullion.html` 之前必读

`mullion.html` 是**生成产物**，不是手写的：

```
mullion_tpl.html  +  build_mullion.py  →  mullion.html
              （样式与 LaTeX 渲染器取自 glass-panel.html）
```

直接改 `mullion.html` 能生效，但下一次有人重跑构建就会被冲掉。**改源，别改产物**；源目前还在各自的本机工作区，入库前请在 PR 里说明。

## 回归：改了计算逻辑就必须跑

改到 number 的地方（荷载、组合、分式挠度、截面几何），提交前把这套跑一遍，结果贴到 PR 里：

```bash
node make_check.js      # 从生成的 html 抽出 <script> 供终端跑
node test_page.js       # 功能 + 数值对账
node test_geom.js       # 图上输入框不越界、不互相压；倾斜时轴线角度与箭头垂直关系
```

基准：默认工况 **σ = 135.6 MPa、d = 18.05 mm**，与原 Excel 校核逐位一致。任何改动让它漂移，先说清楚为什么，别悄悄接受新数字。

## 新增须知

- 新的计算能力**默认只进「高级」模式**，要进基础模式必须在 PR 里说明；
- 首页 `index.html` 的 `calcs` 数组是唯一入口，别在别处硬写卡片；
- 页脚版本戳 `版本 YYYY-MM-DD HH:MM` 要改到**当时那一分钟** —— 这是判断「同事眼前是不是最新版」的唯一依据。
