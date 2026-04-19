#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""HTTP 接口验证脚本。

仅依赖 Python 3 标准库（urllib + json）。

两种调用方式：
    1) 配置文件模式：
           python invoke.py --config path/to/req.json

    2) 命令行直传模式：
           python invoke.py \
               --method POST \
               --url https://api.example.com/v1/users \
               --header "Authorization: Bearer ${TOKEN}" \
               --header "Content-Type: application/json" \
               --json-body '{"name":"alice"}' \
               --expect-status 200 \
               --expect-json "$.data.id" \
               --expect-substring "alice"

配置文件 JSON 结构：
{
  "method": "POST",                           // 必填
  "url": "https://host/path",                 // 必填，可含 ${VAR} 占位符
  "headers": {"Authorization": "Bearer ${TOKEN}"},
  "query": {"k": "v"},                        // 追加到 url 的 query string
  "json_body": {...},                          // 与 form_body / raw_body 三选一
  "form_body": {"k": "v"},
  "raw_body": "plain text",
  "timeout": 15,                              // 秒，默认 15
  "expect": {
    "status": 200,                            // 期望状态码
    "json_paths": {                           // 期望 JSON 字段（简易点语法）
      "code": 0,
      "data.user.name": "alice"
    },
    "substrings": ["success"],               // 响应体须包含的子串
    "headers": {"Content-Type": "application/json"}
  },
  "vars": {"TOKEN": "env:MY_TOKEN"}          // env:XXX 从环境变量取；否则字面量
}

占位符替换：
    - 所有字符串字段中的 ${NAME} 会先从 vars 解析，再回退到环境变量；
    - vars 中 "env:FOO" 代表读取环境变量 FOO。

断言失败时脚本退出码为非 0。
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from typing import Any, Dict, List, Optional, Tuple
from urllib import request as urlrequest
from urllib import parse as urlparse
from urllib.error import HTTPError, URLError


# ---------------------------------------------------------------------------
# 变量替换
# ---------------------------------------------------------------------------

def resolve_vars(vars_decl: Optional[Dict[str, str]]) -> Dict[str, str]:
    """解析 vars 字典，支持 "env:NAME" 语法。"""
    resolved: Dict[str, str] = {}
    if not vars_decl:
        return resolved
    for key, raw in vars_decl.items():
        if isinstance(raw, str) and raw.startswith("env:"):
            env_name = raw[4:]
            val = os.environ.get(env_name)
            if val is None:
                raise RuntimeError(f"环境变量 {env_name} 未设置（vars.{key}）")
            resolved[key] = val
        else:
            resolved[key] = str(raw)
    return resolved


def substitute(value: Any, variables: Dict[str, str]) -> Any:
    """递归替换字符串中的 ${VAR} 占位符。"""
    if isinstance(value, str):
        out = value
        # 先用显式 vars 替换
        for k, v in variables.items():
            out = out.replace("${" + k + "}", v)
        # 再用环境变量兜底
        start = 0
        while True:
            idx = out.find("${", start)
            if idx == -1:
                break
            end = out.find("}", idx + 2)
            if end == -1:
                break
            name = out[idx + 2:end]
            env_val = os.environ.get(name)
            if env_val is not None:
                out = out[:idx] + env_val + out[end + 1:]
                start = idx + len(env_val)
            else:
                start = end + 1
        return out
    if isinstance(value, list):
        return [substitute(v, variables) for v in value]
    if isinstance(value, dict):
        return {k: substitute(v, variables) for k, v in value.items()}
    return value


# ---------------------------------------------------------------------------
# HTTP 调用
# ---------------------------------------------------------------------------

def build_url(url: str, query: Optional[Dict[str, Any]]) -> str:
    if not query:
        return url
    sep = "&" if "?" in url else "?"
    encoded = urlparse.urlencode({k: str(v) for k, v in query.items()})
    return url + sep + encoded


def invoke(cfg: Dict[str, Any]) -> Dict[str, Any]:
    method = cfg.get("method", "GET").upper()
    url = cfg["url"]
    headers: Dict[str, str] = {k: str(v) for k, v in (cfg.get("headers") or {}).items()}
    query = cfg.get("query")
    timeout = float(cfg.get("timeout", 15))

    # body 构造
    body_bytes: Optional[bytes] = None
    if "json_body" in cfg and cfg["json_body"] is not None:
        body_bytes = json.dumps(cfg["json_body"], ensure_ascii=False).encode("utf-8")
        headers.setdefault("Content-Type", "application/json; charset=utf-8")
    elif "form_body" in cfg and cfg["form_body"] is not None:
        body_bytes = urlparse.urlencode(cfg["form_body"]).encode("utf-8")
        headers.setdefault("Content-Type", "application/x-www-form-urlencoded")
    elif "raw_body" in cfg and cfg["raw_body"] is not None:
        raw = cfg["raw_body"]
        body_bytes = raw.encode("utf-8") if isinstance(raw, str) else bytes(raw)

    final_url = build_url(url, query)
    req = urlrequest.Request(final_url, data=body_bytes, method=method)
    for k, v in headers.items():
        req.add_header(k, v)

    start = time.time()
    status: int
    resp_headers: Dict[str, str]
    resp_body: bytes
    try:
        with urlrequest.urlopen(req, timeout=timeout) as resp:
            status = resp.status
            resp_headers = {k: v for k, v in resp.headers.items()}
            resp_body = resp.read()
    except HTTPError as e:
        status = e.code
        resp_headers = {k: v for k, v in (e.headers or {}).items()}
        resp_body = e.read() if hasattr(e, "read") else b""
    except URLError as e:
        raise RuntimeError(f"请求失败: {e.reason}") from e
    elapsed_ms = int((time.time() - start) * 1000)

    text = resp_body.decode("utf-8", errors="replace")
    parsed_json: Any = None
    ctype = resp_headers.get("Content-Type", "") or resp_headers.get("content-type", "")
    if "json" in ctype.lower():
        try:
            parsed_json = json.loads(text) if text else None
        except json.JSONDecodeError:
            parsed_json = None
    else:
        # 兜底尝试 json 解析
        try:
            parsed_json = json.loads(text)
        except (json.JSONDecodeError, ValueError):
            parsed_json = None

    return {
        "request": {
            "method": method,
            "url": final_url,
            "headers": headers,
            "body": body_bytes.decode("utf-8", errors="replace") if body_bytes else None,
        },
        "status": status,
        "elapsed_ms": elapsed_ms,
        "response_headers": resp_headers,
        "response_text": text,
        "response_json": parsed_json,
    }


# ---------------------------------------------------------------------------
# 断言
# ---------------------------------------------------------------------------

def json_path_get(data: Any, path: str) -> Tuple[bool, Any]:
    """简易点语法 path，例如 data.user.name 或 data.items.0.id。"""
    cur: Any = data
    for seg in path.split("."):
        if seg == "":
            continue
        if isinstance(cur, list):
            try:
                idx = int(seg)
            except ValueError:
                return False, None
            if idx < 0 or idx >= len(cur):
                return False, None
            cur = cur[idx]
        elif isinstance(cur, dict):
            if seg not in cur:
                return False, None
            cur = cur[seg]
        else:
            return False, None
    return True, cur


def run_assertions(result: Dict[str, Any], expect: Dict[str, Any]) -> List[Dict[str, Any]]:
    outcomes: List[Dict[str, Any]] = []

    if "status" in expect:
        exp_status = expect["status"]
        ok = result["status"] == exp_status
        outcomes.append({
            "type": "status",
            "expected": exp_status,
            "actual": result["status"],
            "passed": ok,
        })

    for key, val in (expect.get("headers") or {}).items():
        actual = result["response_headers"].get(key)
        if actual is None:
            # 大小写不敏感兜底
            for k, v in result["response_headers"].items():
                if k.lower() == key.lower():
                    actual = v
                    break
        ok = actual is not None and (str(val) in str(actual))
        outcomes.append({
            "type": "header",
            "name": key,
            "expected_contains": val,
            "actual": actual,
            "passed": ok,
        })

    for path, expected_val in (expect.get("json_paths") or {}).items():
        found, actual = json_path_get(result.get("response_json"), path)
        ok = found and actual == expected_val
        outcomes.append({
            "type": "json_path",
            "path": path,
            "expected": expected_val,
            "actual": actual if found else None,
            "passed": ok,
        })

    for sub in (expect.get("substrings") or []):
        ok = sub in (result.get("response_text") or "")
        outcomes.append({
            "type": "substring",
            "expected": sub,
            "passed": ok,
        })

    return outcomes


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="HTTP 接口验证工具")
    p.add_argument("--config", help="配置文件 JSON 路径")
    p.add_argument("--method", default="GET")
    p.add_argument("--url")
    p.add_argument("--header", action="append", default=[],
                   help="Header，如 'Authorization: Bearer xxx'，可多次")
    p.add_argument("--query", action="append", default=[],
                   help="Query 参数 k=v，可多次")
    p.add_argument("--json-body", help="JSON 字符串作为请求体")
    p.add_argument("--form-body", action="append", default=[],
                   help="Form 字段 k=v，可多次")
    p.add_argument("--raw-body", help="原始请求体字符串")
    p.add_argument("--timeout", type=float, default=15)
    p.add_argument("--expect-status", type=int)
    p.add_argument("--expect-json", action="append", default=[],
                   help="JSON path 断言，格式 path=value，可多次")
    p.add_argument("--expect-substring", action="append", default=[],
                   help="响应体需包含子串，可多次")
    return p.parse_args()


def load_config(args: argparse.Namespace) -> Dict[str, Any]:
    if args.config:
        with open(args.config, "r", encoding="utf-8") as f:
            cfg = json.load(f)
        return cfg

    if not args.url:
        raise SystemExit("必须提供 --config 或 --url")

    headers: Dict[str, str] = {}
    for h in args.header:
        if ":" not in h:
            raise SystemExit(f"非法 header: {h}")
        name, _, val = h.partition(":")
        headers[name.strip()] = val.strip()

    query: Dict[str, str] = {}
    for q in args.query:
        if "=" not in q:
            raise SystemExit(f"非法 query: {q}")
        k, _, v = q.partition("=")
        query[k] = v

    form: Dict[str, str] = {}
    for f in args.form_body:
        if "=" not in f:
            raise SystemExit(f"非法 form 字段: {f}")
        k, _, v = f.partition("=")
        form[k] = v

    expect: Dict[str, Any] = {}
    if args.expect_status is not None:
        expect["status"] = args.expect_status
    if args.expect_json:
        jp: Dict[str, Any] = {}
        for item in args.expect_json:
            if "=" not in item:
                raise SystemExit(f"非法 expect-json: {item}")
            k, _, v = item.partition("=")
            # 尝试按 JSON 解析值，失败则按字符串
            try:
                jp[k] = json.loads(v)
            except json.JSONDecodeError:
                jp[k] = v
        expect["json_paths"] = jp
    if args.expect_substring:
        expect["substrings"] = list(args.expect_substring)

    cfg: Dict[str, Any] = {
        "method": args.method,
        "url": args.url,
        "headers": headers,
        "timeout": args.timeout,
    }
    if query:
        cfg["query"] = query
    if args.json_body is not None:
        cfg["json_body"] = json.loads(args.json_body)
    elif form:
        cfg["form_body"] = form
    elif args.raw_body is not None:
        cfg["raw_body"] = args.raw_body
    if expect:
        cfg["expect"] = expect
    return cfg


def main() -> int:
    args = parse_args()
    raw_cfg = load_config(args)

    variables = resolve_vars(raw_cfg.get("vars"))
    cfg = substitute(raw_cfg, variables)

    result = invoke(cfg)
    expect = cfg.get("expect") or {}
    outcomes = run_assertions(result, expect) if expect else []

    # 脱敏：打印时隐藏 Authorization 头的具体 token
    printable_req_headers = dict(result["request"]["headers"])
    for k in list(printable_req_headers.keys()):
        if k.lower() in ("authorization", "cookie", "x-api-key"):
            v = printable_req_headers[k]
            printable_req_headers[k] = (v[:12] + "...<redacted>") if len(v) > 12 else "<redacted>"

    report = {
        "request": {
            "method": result["request"]["method"],
            "url": result["request"]["url"],
            "headers": printable_req_headers,
            "body": result["request"]["body"],
        },
        "response": {
            "status": result["status"],
            "elapsed_ms": result["elapsed_ms"],
            "headers": result["response_headers"],
            "json": result["response_json"],
            "text_preview": (result["response_text"] or "")[:2000],
        },
        "assertions": outcomes,
        "passed": all(o["passed"] for o in outcomes) if outcomes else True,
    }

    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
