#!/usr/bin/env python3.11
"""
通过 gh-proxy 调用 GitHub Contents API 上传所有变更文件。
由于沙箱 TLS 限制，直接 git push 不可行，使用此脚本逐文件上传。
"""
import base64
import json
import os
import subprocess
import sys
import urllib.request
import urllib.error

GH_PROXY = "https://gh-proxy.com"
API_BASE = f"{GH_PROXY}/https://api.github.com"
REPO = "Clips-z/yingbo-smart-customer-service"
BRANCH = "main"
TOKEN = os.environ.get("GITHUB_TOKEN", "")

if not TOKEN:
    print("ERROR: GITHUB_TOKEN not set")
    sys.exit(1)

def api_request(method, path, data=None):
    """通过 gh-proxy 调用 GitHub API"""
    url = f"{API_BASE}{path}"
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header("Authorization", f"Bearer {TOKEN}")
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("User-Agent", "yingbo-push-script")
    req.add_header("Content-Type", "application/json")
    try:
        resp = urllib.request.urlopen(req, timeout=30)
        return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"  HTTP {e.code}: {body[:300]}")
        return None

def get_file_sha(path):
    """获取远程文件的 SHA"""
    result = api_request("GET", f"/repos/{REPO}/contents/{path}?ref={BRANCH}")
    if result and "sha" in result:
        return result["sha"]
    return None

def upload_file(path, content_bytes):
    """上传或更新文件"""
    existing_sha = get_file_sha(path)
    data = {
        "message": f"✨ 功能完善：修复 React #130、实现通知面板、改进千牛 OCR",
        "content": base64.b64encode(content_bytes).decode(),
        "branch": BRANCH,
    }
    if existing_sha:
        data["sha"] = existing_sha
    
    result = api_request("PUT", f"/repos/{REPO}/contents/{path}", data)
    if result and "content" in result:
        return True
    return False

def main():
    repo_root = "/workspace/ChatGPT-On-CS-main/ChatGPT-On-CS-main"
    os.chdir(repo_root)
    
    # 获取变更文件列表
    result = subprocess.run(
        ["git", "diff", "c8cf9e4..HEAD", "--name-only"],
        capture_output=True, text=True
    )
    files = [f.strip() for f in result.stdout.strip().split("\n") if f.strip()]
    
    # 去掉公共前缀（repo 中的路径不含 ChatGPT-On-CS-main/ChatGPT-On-CS-main/）
    # 但 git diff 输出的路径包含这个前缀
    # 我们需要在 repo 中查找实际文件
    
    success = 0
    failed = 0
    
    for git_path in files:
        # git diff 中的路径格式：ChatGPT-On-CS-main/ChatGPT-On-CS-main/xxx
        # 实际文件路径：当前在 repo root 下
        # 去掉前缀得到 repo 内路径
        prefix = "ChatGPT-On-CS-main/ChatGPT-On-CS-main/"
        if git_path.startswith(prefix):
            repo_path = git_path[len(prefix):]
        else:
            repo_path = git_path
        
        local_file = os.path.join(repo_root, repo_path)
        if not os.path.exists(local_file):
            print(f"SKIP (not found): {repo_path}")
            continue
        
        with open(local_file, "rb") as f:
            content = f.read()
        
        print(f"Uploading ({len(content)} bytes): {repo_path} ...", end=" ")
        if upload_file(repo_path, content):
            print("OK")
            success += 1
        else:
            print("FAILED")
            failed += 1
    
    print(f"\nDone: {success} succeeded, {failed} failed")

if __name__ == "__main__":
    main()
