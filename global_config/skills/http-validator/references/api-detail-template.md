# 接口详情模板

> 复制本文件到 `apis/<kebab-case-name>.md`，并按字段填写。填写完成后务必在 `../api-index.md` 索引表追加一行。
> 禁止写入真实 token / 密码；敏感值统一用 `${VAR}` 占位符，在调用时通过环境变量或命令行传入。

## 基本信息

- 名称：<业务名，例如：查询用户信息 / get-user>
- 业务描述：<一句话说明接口用途>
- Method：<GET | POST | PUT | DELETE | PATCH>
- Base URL：<例如 https://api-test.example.com>
- Path：</api/v1/users/{userId}>
- 归属服务：<service-name>
- 变更副作用 mutating：<true | false>
- 鉴权方式：<none | Bearer Token | Cookie | API Key ...>

## 请求

### Path 参数

| 名称 | 类型 | 必填 | 示例 | 说明 |
| --- | --- | --- | --- | --- |
| userId | string | 是 | 10001 | 用户 ID |

### Query 参数

| 名称 | 类型 | 必填 | 示例 | 说明 |
| --- | --- | --- | --- | --- |
| - | - | - | - | - |

### Headers

| 名称 | 必填 | 示例 | 说明 |
| --- | --- | --- | --- |
| Authorization | 是 | Bearer ${TOKEN} | 登录态 token |
| Content-Type | 否 | application/json | POST/PUT 时必填 |

### Body（JSON）

```json
{
  "example": "value"
}
```

## 期望响应

- 期望状态码：200
- 期望 Content-Type 含：application/json
- 期望 JSON 字段（点语法 path → 期望值）：
  - `code` = 0
  - `data.userId` = "10001"
- 期望响应体包含子串：
  - "success"

## 依赖 / 前置

- 需要先执行 `<登录接口>` 换取 `${TOKEN}`？
- 是否依赖已有数据（如已存在的 userId）？

## 调用配置示例（可直接保存为 req.json 供 invoke.py 使用）

```json
{
  "method": "GET",
  "url": "https://api-test.example.com/api/v1/users/10001",
  "headers": {
    "Authorization": "Bearer ${TOKEN}",
    "Content-Type": "application/json"
  },
  "timeout": 15,
  "expect": {
    "status": 200,
    "headers": {"Content-Type": "application/json"},
    "json_paths": {
      "code": 0,
      "data.userId": "10001"
    },
    "substrings": ["success"]
  },
  "vars": {
    "TOKEN": "env:MY_API_TOKEN"
  }
}
```

## 备注

- 失败排查线索：<如 401 代表 token 过期；404 代表用户不存在等>
- 相关文档 / Wiki：<可选链接>
