# 查询用户信息 / get-user

## 基本信息

- 名称：查询用户信息 / get-user
- 业务描述：根据用户 ID 查询基础用户信息
- Method：GET
- Base URL：https://api-test.example.com
- Path：/api/v1/users/{userId}
- 归属服务：user-service
- 变更副作用 mutating：false
- 鉴权方式：Bearer Token

## 请求

### Path 参数

| 名称 | 类型 | 必填 | 示例 | 说明 |
| --- | --- | --- | --- | --- |
| userId | string | 是 | 10001 | 用户 ID |

### Query 参数

| 名称 | 类型 | 必填 | 示例 | 说明 |
| --- | --- | --- | --- | --- |
| includeProfile | boolean | 否 | true | 是否返回详细档案 |

### Headers

| 名称 | 必填 | 示例 | 说明 |
| --- | --- | --- | --- |
| Authorization | 是 | Bearer ${TOKEN} | 登录态 token |

### Body

无。

## 期望响应

- 期望状态码：200
- 期望 Content-Type 含：application/json
- 期望 JSON 字段：
  - `code` = 0
  - `data.userId` = "10001"
- 期望响应体包含子串：
  - "success"

## 依赖 / 前置

- 需要用户已登录并持有有效 `${TOKEN}`。
- userId=10001 需在测试库中存在；若被清理，改用当前可用的测试用户。

## 调用配置示例

```json
{
  "method": "GET",
  "url": "https://api-test.example.com/api/v1/users/10001",
  "query": {"includeProfile": "true"},
  "headers": {
    "Authorization": "Bearer ${TOKEN}"
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

- 401：token 过期或缺失，重新登录换 token。
- 404：用户不存在，确认 userId 是否有效。
- 5xx：后端异常，附上 traceId 去日志系统排查。
