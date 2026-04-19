---
name: http-validator
description: 通过 Python 脚本验证 HTTP 接口是否符合预期。维护一个接口索引文件（references/api-index.md），索引中登记每个接口对应的详情文档路径；验证接口时先根据名称/路径在索引中定位接口详情文档，再按照文档里的请求方式、Header、Query、Body、鉴权与断言规则发起请求并校验响应。适用场景：(1) 本地或测试环境 HTTP 接口冒烟/回归验证 (2) 按约定文档对齐接口契约 (3) 排查接口异常、对比响应与期望差异 (4) 触发关键词：验证接口、验证 HTTP、http 接口验证、接口索引、api index、调接口验证
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
---

# http-validator

验证 HTTP 接口是否符合预期。由「接口索引 + 接口详情文档 + Python 调用脚本」三部分组成，每次只验证一个接口。

## 目录结构

```
http-validator/
├── SKILL.md
├── scripts/
│   └── invoke.py           # 通用 HTTP 调用与断言脚本
├── references/
│   ├── api-index.md        # 接口索引文件（必读）
│   ├── api-detail-template.md  # 接口详情文档模板
│   └── apis/
│       └── example-get-user.md # 示例接口详情
└── assets/
    └── request-template.json   # 请求体模板（按需）
```

## 使用步骤（每次只验证一个接口）

1. **读索引**：打开 `references/api-index.md`，根据用户给出的接口名、业务含义或 URL 路径，定位目标接口对应的详情文档相对路径（`references/apis/xxx.md`）。
   - 如果索引中没有该接口，提示用户补充，并引导按 `references/api-detail-template.md` 新增一份详情文档，同时在索引里登记。
2. **读详情**：阅读详情文档，提取：
   - `base_url` / `path` / `method`
   - Headers（含鉴权、Content-Type）
   - Query 参数、Path 参数、Body（JSON / Form）
   - 期望断言：`expected_status`、`expected_json_paths`、`expected_substrings`
   - 备注（如需要先登录换 token、依赖的上下文数据等）
3. **组装请求参数**：把详情文档中的请求与断言信息整理成一个 JSON 配置（见 `scripts/invoke.py` 的 `--config` 参数格式）。
4. **发起调用**：运行 `python scripts/invoke.py --config <path-to-config.json>`。
   - 如用户提供了真实变量（token、uid、订单号等），在调用前替换配置中的 `${VAR}` 占位符。
5. **核对结果**：脚本会输出 `status`, `elapsed_ms`, `response_headers`, `response_body`, 以及每条断言的通过/失败详情。按详情文档里的断言逐条回复用户：哪些通过、哪些失败、失败原因。
6. **记录异常**：若接口失败，先打印请求全量（method + url + headers + body）便于排查；再给出可能原因（鉴权过期、参数缺失、环境不通等）。

## 强约束

- **每次只验证一个接口**；若用户一次给出多个接口，依次按上述流程逐个验证，不要合并请求。
- **必须先读索引再读详情**，不允许跳过索引直接凭经验构造请求。
- **不要把真实 token、密码写入任何文档**，在调用时通过环境变量或命令行参数传入，详情文档里用 `${TOKEN}` 等占位符。
- **只做验证，不做破坏性写操作**，除非详情文档明确标注 `mutating: true` 并得到用户确认。

## 索引维护

- 索引条目格式见 `references/api-index.md`，每行一个接口，包含：名称、Method、Path、详情文档路径、最近更新日期、简述。
- 新增接口时：
  1. 按 `references/api-detail-template.md` 复制一份到 `references/apis/<kebab-case-name>.md` 并补齐字段。
  2. 在 `references/api-index.md` 新增一行条目。

## 调用脚本接口（scripts/invoke.py）

支持两种用法：

- 配置文件：`python scripts/invoke.py --config req.json`
- 命令行直传：`python scripts/invoke.py --method GET --url https://... --header "Authorization: Bearer xxx" --expect-status 200`

配置文件 JSON 结构详见 `scripts/invoke.py` 头部注释。断言失败时以非零状态码退出，便于脚本化集成。
