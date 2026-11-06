# 文件结构

```text
AGI/
├── README.md                  # 选择项目
├── AI Quota/
│   ├── README.md              # 用户价值、下载、简短FAQ
│   ├── docs/                  # 使用、接入、隐私、开发说明
│   ├── src/                   # 服务、连接器与额度计算
│   ├── public/                # 网页界面
│   ├── desktop/               # Swift/AppKit外壳
│   ├── scripts/               # 构建与打包
│   ├── test/                  # 合成数据测试
│   ├── LICENSES/              # 第三方许可原文
│   └── RELEASE_NOTES.md       # 版本说明
├── deep-research/
│   ├── README.md              # 适用场景、示例、简短FAQ
│   ├── SKILL.md               # 技能入口
│   ├── researcher.toml        # Agent配置
│   ├── evidence.md            # 账本模板
│   └── docs/SETUP.md          # 安装与模型要求
└── .github/workflows/         # AI Quota发布流程
```

README回答“是否适合我、如何开始”；细节放项目docs目录。AI Quota的源码导出和发布包同步包含docs，避免打包后链接失效。许可文件保持原位置。

deep-research的三个运行文件不搬动：SKILL.md按相对路径引用证据模板，安装说明也引用根目录的Agent配置。结构整理不改变技能角色、模型选择或质量标准。

开发AI Quota先进入该目录再运行npm命令；研究材料保存到各自私有项目，不提交到此仓库。dist为生成目录，不作为源码整理目标。
