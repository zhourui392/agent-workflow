# HTTP 接口索引

> 本文件是接口验证的入口。每次验证接口时，先在此表格中按「名称 / Method / Path / 业务描述」定位目标接口，再打开对应的「详情文档」。
> 新增接口时：先复制 `api-detail-template.md` 为 `apis/<kebab-case-name>.md` 并补齐字段，然后在下表新增一行。

## 列约定

| 字段 | 说明 |
| --- | --- |
| 名称 | 业务可读的接口名，推荐中文 + 英文 kebab-case 一起写 |
| Method | HTTP 方法：GET / POST / PUT / DELETE / PATCH |
| Path | 不含 host 的路径；如果是不同环境差异，在详情文档里配置 `base_url` |
| 详情文档 | 相对本文件的路径，点进去就是请求与断言说明 |
| 最近更新 | YYYY-MM-DD |
| 简述 | 一句话说明业务含义 |
| 变更 | mutating=true 表示会产生副作用（写/删），调用前需用户确认 |

## 索引表

| 名称 | Method | Path | 详情文档 | 最近更新 | 简述 | 变更 |
| --- | --- | --- | --- | --- | --- | --- |
| 查询用户信息 / get-user | GET | /api/v1/users/{userId} | [apis/example-get-user.md](apis/example-get-user.md) | 2026-04-18 | 根据用户 ID 查询基础信息 | false |

<!-- 在上表下方继续追加新行；不要删除表头。 -->
